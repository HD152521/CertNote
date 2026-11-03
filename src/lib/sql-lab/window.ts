// 윈도우 함수(분석 함수): 함수 OVER (PARTITION BY … ORDER BY … ROWS|RANGE …).
// WHERE·GROUP BY·HAVING 이 끝난 행들 위에서, SELECT·ORDER BY 를 계산하기 직전에 한 번에 계산한다.
import type { Expr, WindowBound, WindowSpec } from './ast';
import { OraError, SqlDate, compare, groupKey, toNumber, type Value } from './values';

export type WindowFunc = Extract<Expr, { type: 'func' }> & { over: WindowSpec };

/** 순위·행 위치 함수(프레임을 쓰지 않는다) */
const RANKING = new Set(['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'PERCENT_RANK', 'CUME_DIST', 'NTILE']);
/** ORDER BY 가 반드시 있어야 하는 함수 */
const NEEDS_ORDER = new Set(['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'PERCENT_RANK', 'CUME_DIST', 'NTILE', 'LAG', 'LEAD']);
/** OVER 가 있어야만 쓸 수 있는 함수 */
export const WINDOW_ONLY = new Set(['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'PERCENT_RANK', 'CUME_DIST', 'NTILE', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'RATIO_TO_REPORT', 'NTH_VALUE']);

export const isWindow = (e: Expr): e is WindowFunc => e.type === 'func' && !!e.over;

/** 윈도우 함수 식별 키(위치 정보는 빼고 같은 식이면 같은 값) */
export const windowKey = (e: Expr) => JSON.stringify(e, (k, v) => (k === 'start' || k === 'end' ? undefined : v));

export function windowError(): OraError {
  return new OraError('ORA-30483', 'window  functions are not allowed here');
}

/** OVER 절 규칙 검사(실행 전): ORDER BY 가 필요한 함수, ORDER BY 를 받지 않는 함수 */
export function checkWindowSpec(e: WindowFunc) {
  // 순위 함수에 인자를 주면: RANK(1500) OVER → ORA-02000(WITHIN GROUP 을 기대), ROW_NUMBER(SAL) OVER → ORA-00907
  if (e.args.length > 0 && (e.name === 'RANK' || e.name === 'DENSE_RANK' || e.name === 'PERCENT_RANK' || e.name === 'CUME_DIST')) {
    throw new OraError('ORA-02000', 'missing WITHIN keyword');
  }
  if (e.args.length > 0 && e.name === 'ROW_NUMBER') throw new OraError('ORA-00907', 'missing right parenthesis');
  if (NEEDS_ORDER.has(e.name) && e.over.orderBy.length === 0) {
    throw new OraError('ORA-30485', 'missing ORDER BY expression in the window specification');
  }
  if (e.name === 'RATIO_TO_REPORT' && e.over.orderBy.length > 0) throw new OraError('ORA-30487', 'ORDER BY not allowed here');
  const f = e.over.frame;
  if (!f) return;
  // 순위·LAG·LEAD 는 프레임(ROWS·RANGE)을 받지 않는다.
  if (RANKING.has(e.name) || e.name === 'LAG' || e.name === 'LEAD') throw new OraError('ORA-03097', `windowing clause not allowed for function ${e.name}`);
  // 프레임의 시작이 끝보다 뒤면(UNBOUNDED FOLLOWING 시작, 1 FOLLOWING AND 1 PRECEDING 등) ORA-30486
  const invalid =
    f.start.kind === 'UNBOUNDED FOLLOWING' ||
    f.end.kind === 'UNBOUNDED PRECEDING' ||
    (f.start.kind !== 'UNBOUNDED PRECEDING' && f.end.kind !== 'UNBOUNDED FOLLOWING' && kindOrder(f.start) > kindOrder(f.end)) ||
    (f.start.kind === 'CURRENT ROW' && f.end.kind === 'PRECEDING') ||
    (f.start.kind === 'FOLLOWING' && (f.end.kind === 'CURRENT ROW' || f.end.kind === 'PRECEDING'));
  if (invalid) throw invalidFrame();
  // RANGE 에 값 거리(n PRECEDING·FOLLOWING)를 쓰면 ORDER BY 키는 하나여야 한다.
  const valueOffset = [f.start, f.end].some((b) => b.kind === 'PRECEDING' || b.kind === 'FOLLOWING');
  if (f.unit === 'RANGE' && valueOffset && e.over.orderBy.length !== 1) throw invalidFrame();
}

/** [lo, hi) 에서 pred 가 처음 참이 되는 위치(pred 는 거짓…참 으로 한 번만 바뀐다). 없으면 hi. */
function lowerBound(lo: number, hi: number, pred: (i: number) => boolean): number {
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pred(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** 첫 정렬 키가 NULL 이 아닌 구간 [a, z). NULL 은 앞이나 뒤 한쪽에 모여 있다. */
function nonNullRange(keys: Value[][], n: number): [number, number] {
  if (n === 0) return [0, 0];
  if (keys[0][0] === null) return [lowerBound(0, n, (i) => keys[i][0] !== null), n];
  return [0, lowerBound(0, n, (i) => keys[i][0] === null)];
}

const invalidFrame = () => new OraError('ORA-30486', 'invalid window aggregation group in the window specification');
/** 프레임 경계의 앞뒤 순서(같은 종류끼리는 따로 본다) */
const kindOrder = (b: WindowBound) => (b.kind === 'PRECEDING' ? 1 : b.kind === 'CURRENT ROW' ? 2 : b.kind === 'FOLLOWING' ? 3 : 0);

interface Hooks<C> {
  evaluate: (e: Expr, ctx: C) => Value;
  /** 시간 상한을 넘었으면 예외를 던진다 */
  checkTime?: () => void;
  /** COUNT(*) 처럼 행 수만 셀 때 쓰는 별표 인자인가 */
  sortCompare: (a: Value, b: Value, desc: boolean, nulls: 'FIRST' | 'LAST' | undefined) => number;
}

/**
 * 윈도우 함수 하나를 모든 행에 대해 계산한다. 반환값은 ctxs 와 같은 순서의 값 배열.
 */
export function computeWindow<C>(w: WindowFunc, ctxs: C[], hooks: Hooks<C>): Value[] {
  const { evaluate, sortCompare } = hooks;
  const out: Value[] = new Array(ctxs.length).fill(null);
  // 1. 파티션 나누기
  const parts = new Map<string, number[]>();
  ctxs.forEach((ctx, i) => {
    const k = JSON.stringify(w.over.partitionBy.map((p) => groupKey(evaluate(p, ctx))));
    if (!parts.has(k)) parts.set(k, []);
    parts.get(k)!.push(i);
  });
  for (const members of parts.values()) {
    // 2. 파티션 안 정렬(같은 키는 들어온 순서를 지킨다)
    const keys = members.map((i) => w.over.orderBy.map((o) => evaluate(o.expr, ctxs[i])));
    const order = members.map((_, j) => j);
    order.sort((a, b) => {
      for (let t = 0; t < w.over.orderBy.length; t++) {
        const o = w.over.orderBy[t];
        const c = sortCompare(keys[a][t], keys[b][t], o.desc, o.nulls);
        if (c) return c;
      }
      return a - b;
    });
    const rows = order.map((j) => members[j]);
    const rowKeys = order.map((j) => keys[j]);
    const n = rows.length;
    const samePeer = (a: number, b: number) => rowKeys[a].every((v, t) => groupKey(v) === groupKey(rowKeys[b][t]));
    // 동점(같은 정렬 키) 묶음의 시작·끝
    const peerStart: number[] = [];
    const peerEnd: number[] = [];
    for (let p = 0; p < n; p++) peerStart[p] = p > 0 && samePeer(p, p - 1) ? peerStart[p - 1] : p;
    for (let p = n - 1; p >= 0; p--) peerEnd[p] = p < n - 1 && samePeer(p, p + 1) ? peerEnd[p + 1] : p;
    const argCache: Value[] = new Array(n);
    const argDone: boolean[] = new Array(n).fill(false);
    const arg = (p: number, idx = 0) => {
      if (idx !== 0) return w.args[idx] ? evaluate(w.args[idx], ctxs[rows[p]]) : null;
      if (!argDone[p]) {
        argCache[p] = w.args[0] ? evaluate(w.args[0], ctxs[rows[p]]) : null;
        argDone[p] = true;
      }
      return argCache[p];
    };
    // SUM·COUNT·AVG(DISTINCT 아님)는 누적 합으로 프레임 값을 바로 낸다.
    const prefix = (['SUM', 'COUNT', 'AVG'].includes(w.name) && !w.distinct) || w.name === 'RATIO_TO_REPORT'
      ? (() => {
          const s = [0];
          const c = [0];
          for (let q = 0; q < n; q++) {
            const x = w.star ? 1 : arg(q);
            s.push(s[q] + (x === null ? 0 : Number(toNumber(x))));
            c.push(c[q] + (x === null ? 0 : 1));
          }
          return { s, c };
        })()
      : null;
    const num = (e: Expr | undefined, p: number, def: number) => {
      if (!e) return def;
      const v = evaluate(e, ctxs[rows[p]]);
      return v === null ? def : Number(toNumber(v));
    };

    let dense = 0;
    for (let p = 0; p < n; p++) {
      // 누적 합을 못 쓰는 함수(MAX·MIN·FIRST_VALUE 등)는 한 행에 프레임 길이만큼 일하므로 행마다 시간을 본다.
      if (!prefix || (p & 255) === 0) hooks.checkTime?.();
      if (p === peerStart[p]) dense++;
      let v: Value = null;
      switch (w.name) {
        case 'ROW_NUMBER':
          v = p + 1;
          break;
        case 'RANK':
          v = peerStart[p] + 1;
          break;
        case 'DENSE_RANK':
          v = dense;
          break;
        case 'PERCENT_RANK':
          v = n === 1 ? 0 : peerStart[p] / (n - 1);
          break;
        case 'CUME_DIST':
          v = (peerEnd[p] + 1) / n;
          break;
        case 'NTILE': {
          const k = num(w.args[0], p, NaN);
          if (!(k > 0)) throw new OraError('ORA-30489', 'Cannot have more than one DISTINCT, or negative, or zero, or NULL argument');
          const buckets = Math.min(Math.trunc(k), n);
          const base = Math.floor(n / buckets);
          const extra = n % buckets;
          // 앞의 extra 개 버킷이 한 행씩 더 갖는다.
          const bigRows = extra * (base + 1);
          v = p < bigRows ? Math.floor(p / (base + 1)) + 1 : extra + Math.floor((p - bigRows) / base) + 1;
          break;
        }
        case 'LAG':
        case 'LEAD': {
          const off = num(w.args[1], p, 1);
          const q = w.name === 'LAG' ? p - off : p + off;
          v = q >= 0 && q < n ? arg(q) : w.args[2] ? arg(p, 2) : null;
          break;
        }
        case 'RATIO_TO_REPORT': {
          const total = prefix!.s[n];
          const x = arg(p);
          v = x === null || total === 0 || prefix!.c[n] === 0 ? null : Number(toNumber(x)) / total;
          break;
        }
        default: {
          const [lo, hi] = frameOf(w.over, p, n, peerStart, peerEnd, rowKeys);
          if (prefix && lo <= hi) {
            const sum = prefix.s[hi + 1] - prefix.s[lo];
            const cnt = prefix.c[hi + 1] - prefix.c[lo];
            v = w.name === 'COUNT' ? (w.star ? hi - lo + 1 : cnt) : cnt === 0 ? null : w.name === 'SUM' ? Number(sum.toPrecision(15)) : sum / cnt;
          } else if (prefix) v = w.name === 'COUNT' ? 0 : null;
          else v = frameValue(w, lo, hi, (q) => arg(q), hooks.checkTime);
        }
      }
      out[rows[p]] = v;
    }
  }
  return out;
}

/** 프레임 [lo, hi](포함). 비어 있으면 lo > hi. */
function frameOf(spec: WindowSpec, p: number, n: number, peerStart: number[], peerEnd: number[], keys: Value[][]): [number, number] {
  const frame = spec.frame;
  if (!frame) {
    // ORDER BY 가 있으면 기본은 RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW(동점 행까지), 없으면 파티션 전체.
    return spec.orderBy.length ? [0, peerEnd[p]] : [0, n - 1];
  }
  const pos = (b: WindowBound, isStart: boolean): number => {
    switch (b.kind) {
      case 'UNBOUNDED PRECEDING':
        return 0;
      case 'UNBOUNDED FOLLOWING':
        return n - 1;
      case 'CURRENT ROW':
        if (frame.unit === 'ROWS') return p;
        return isStart ? peerStart[p] : peerEnd[p];
      case 'PRECEDING':
      case 'FOLLOWING': {
        const off = frame.unit === 'ROWS' ? Math.trunc(b.offset ?? 0) : (b.offset ?? 0);
        if (frame.unit === 'ROWS') return b.kind === 'PRECEDING' ? p - off : p + off;
        // RANGE n: 정렬 키 값이 현재 행 값 ± n 안인 행들(정렬 키 하나, 숫자)
        const cur = keys[p][0];
        if (cur === null) return isStart ? peerStart[p] : peerEnd[p];
        const desc = spec.orderBy[0]?.desc ?? false;
        const sign = (b.kind === 'PRECEDING' ? -1 : 1) * (desc ? -1 : 1);
        // 날짜 키는 일 단위 거리다(30 PRECEDING = 30일 전).
        const asNum = (v: Value) => (v instanceof SqlDate ? v.ms / 86_400_000 : Number(toNumber(v)));
        const bound = asNum(cur) + sign * off;
        const k = (q: number) => asNum(keys[q][0]);
        // NULL 은 한쪽 끝에 모여 있고 나머지는 정렬돼 있으므로 이진 탐색으로 경계를 찾는다(행마다 O(log n)).
        const [a, z] = nonNullRange(keys, n);
        if (isStart) {
          // 처음으로 (오름차순) k >= bound, (내림차순) k <= bound 인 위치
          // 없으면 NULL 덩어리의 시작(뒤에 모였을 때) — Oracle 은 값이 넘치면 NULL 행부터 창에 넣는다.
          return lowerBound(a, z, (i) => (desc ? k(i) <= bound : k(i) >= bound));
        }
        // 마지막으로 (오름차순) k <= bound, (내림차순) k >= bound 인 위치
        // 없으면 NULL 덩어리의 끝(앞에 모였을 때)
        return lowerBound(a, z, (i) => (desc ? k(i) < bound : k(i) > bound)) - 1;
      }
    }
  };
  const lo = Math.max(0, pos(frame.start, true));
  const hi = Math.min(n - 1, pos(frame.end, false));
  return [lo, hi];
}

function frameValue(w: WindowFunc, lo: number, hi: number, arg: (q: number) => Value, checkTime?: () => void): Value {
  if (w.name === 'FIRST_VALUE') return lo <= hi ? arg(lo) : null;
  if (w.name === 'LAST_VALUE') return lo <= hi ? arg(hi) : null;
  if (w.name === 'COUNT' && w.star) return Math.max(0, hi - lo + 1);
  const vals: Exclude<Value, null>[] = [];
  for (let q = lo; q <= hi; q++) {
    if ((q & 1023) === 0) checkTime?.();
    const x = arg(q);
    if (x !== null) vals.push(x);
  }
  let list = vals;
  if (w.distinct) {
    const seen = new Set<string>();
    list = vals.filter((v) => {
      const k = groupKey(v);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  if (w.name === 'COUNT') return list.length;
  if (list.length === 0) return null;
  if (w.name === 'MIN') return list.reduce((a, b) => ((compare(b, a) ?? 0) < 0 ? b : a));
  if (w.name === 'MAX') return list.reduce((a, b) => ((compare(b, a) ?? 0) > 0 ? b : a));
  const nums = list.map((v) => Number(toNumber(v)));
  const sum = nums.reduce((a, b) => a + b, 0);
  if (w.name === 'SUM') return Number(sum.toPrecision(15));
  const avg = sum / nums.length;
  if (w.name === 'AVG') return avg;
  if (w.name === 'STDDEV' || w.name === 'VARIANCE') {
    if (nums.length === 1) return 0;
    const variance = nums.reduce((a, b) => a + (b - avg) ** 2, 0) / (nums.length - 1);
    return w.name === 'VARIANCE' ? variance : Math.sqrt(variance);
  }
  throw new OraError('ORA-30484', 'missing OVER clause, or invalid identifier found for window function');
}
