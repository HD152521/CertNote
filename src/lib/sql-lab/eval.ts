// 식 계산. 조건(WHERE·ON·HAVING)은 3값 논리(참·거짓·UNKNOWN=null)로 계산한다.
import type { Expr, Select } from './ast';
import { FUNCTIONS, NILADIC, extractField, oracleRegex, trimBoth } from './functions';
import type { HierInfo } from './hierarchy';
import { WINDOW_ONLY, windowKey } from './window';
import { invalidIdentifier, resolveColumn, type Relation } from './relation';
import { NotSupported, OraError, SqlDate, addDays, compare, parseDefaultDate, toNumber, toText, type Value } from './values';

export interface EvalCtx {
  rel: Relation;
  row: Value[];
  outer?: EvalCtx;
  rownum?: number;
  /** 묶음 계산 중이면 그 묶음의 행들(집계 함수가 쓴다) */
  group?: Value[][];
  /** MAX(COUNT(*)) 처럼 집계를 한 번 더 집계할 때: 묶음마다의 문맥 */
  groupSet?: EvalCtx[];
  /** 원문(오류 문구에 식 원문을 넣을 때) */
  src?: string;
  /** 서브쿼리에 넘긴 바깥 문맥 표시: 서브쿼리 안에서 이 문맥(또는 더 바깥)의 열을 읽으면 hit 가 켜진다 */
  correlation?: { hit: boolean };
  /** 계층형 질의의 노드 정보(LEVEL·PRIOR·CONNECT_BY_ROOT) */
  hier?: HierInfo;
  /** 행 → 그 행의 계층 정보(집계가 묶음의 행마다 LEVEL 등을 읽을 때) */
  hierOf?: (row: Value[]) => HierInfo | undefined;
  /** 윈도우 함수 값(windowKey → 값). SELECT 를 계산하기 전에 채운다. */
  windowValues?: Map<string, Value>;
  /** GROUP BY 가 있는 묶음 계산인가(GROUPING 함수는 GROUP BY 없이 못 쓴다) */
  hasGroupBy?: boolean;
  /** ROLLUP·CUBE 의 소계 행: 이 묶음에서 빠진 GROUP BY 식이면 true(그 값은 NULL 로 보인다) */
  isRolledUp?: (e: Expr) => boolean;
  runSubquery: (q: Select, outer: EvalCtx) => { rows: Value[][]; width: number };
}

export const AGGREGATES = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'STDDEV', 'VARIANCE', 'MEDIAN', 'GROUPING', 'GROUPING_ID']);

export const isAggregate = (e: Expr) => e.type === 'func' && ((AGGREGATES.has(e.name) && !e.over) || !!e.withinGroup);

/** 식 안에 집계 함수가 있는가(서브쿼리 안은 보지 않는다). */
export function containsAggregate(e: Expr): boolean {
  if (isAggregate(e)) return true;
  return children(e).some(containsAggregate);
}

export function children(e: Expr): Expr[] {
  switch (e.type) {
    case 'unary':
      return [e.arg];
    case 'bin':
    case 'and':
    case 'or':
      return [e.left, e.right];
    case 'isnull':
      return [e.arg];
    case 'between':
      return [e.arg, e.low, e.high];
    case 'in':
      return [e.arg, ...e.list];
    case 'insub':
      return [e.arg];
    case 'like':
      return [e.arg, e.pattern, ...(e.escape ? [e.escape] : [])];
    case 'func':
      return e.over ? [...e.args, ...e.over.partitionBy, ...e.over.orderBy.map((o) => o.expr)] : e.args;
    case 'case':
      return [...(e.base ? [e.base] : []), ...e.whens.flatMap((w) => [w.when, w.then]), ...(e.else ? [e.else] : [])];
    case 'cmpsub':
      return [e.left];
    case 'extract':
      return [e.arg];
    case 'trim':
      return [e.arg, ...(e.chars ? [e.chars] : [])];
    case 'tuple':
      return e.items;
    default:
      return [];
  }
}

/** 열 이름 → 값. 이 쿼리에 없으면 바깥 쿼리(상관 서브쿼리)에서 찾는다. */
export function lookupColumn(ctx: EvalCtx, table: string | undefined, name: string): Value {
  let crossed: { hit: boolean } | undefined;
  for (let c: EvalCtx | undefined = ctx; c; c = c.outer) {
    const hit = resolveColumn(c.rel, table, name);
    if (hit) {
      if (crossed) crossed.hit = true; // 서브쿼리가 바깥 행을 읽었다(상관 서브쿼리)
      return c.row[hit.index] ?? null;
    }
    if (c.outer?.correlation) crossed ??= c.outer.correlation;
  }
  if (!table && NILADIC.has(name)) return niladic(name);
  throw invalidIdentifier(table, name);
}

type StaticType = 'NUMBER' | 'VARCHAR2' | 'DATE' | null;

const TEXT_FNS = ['TO_CHAR', 'SUBSTR', 'LOWER', 'UPPER', 'INITCAP', 'LPAD', 'RPAD', 'LTRIM', 'RTRIM', 'REPLACE', 'CONCAT', 'CHR', 'TRANSLATE'];
const DATE_FNS = ['TO_DATE', 'SYSDATE', 'ADD_MONTHS', 'LAST_DAY', 'NEXT_DAY'];
const NUMBER_FNS = ['COUNT', 'SUM', 'AVG', 'LENGTH', 'INSTR', 'ROUND', 'TRUNC', 'MOD', 'ABS', 'TO_NUMBER', 'MONTHS_BETWEEN', 'CEIL', 'FLOOR', 'SIGN', 'POWER', 'SQRT', 'ASCII'];

/** 식의 자료형을 값 없이 짐작한다(열 정의·리터럴·연산). 모르면 null. */
export function staticType(e: Expr, ctx: EvalCtx): StaticType {
  switch (e.type) {
    case 'lit':
      return e.value === null ? null : typeof e.value === 'number' ? 'NUMBER' : typeof e.value === 'string' ? 'VARCHAR2' : 'DATE';
    case 'col':
      for (let c: EvalCtx | undefined = ctx; c; c = c.outer) {
        try {
          const hit = resolveColumn(c.rel, e.table, e.name);
          if (hit) return c.rel.cols[hit.index].type ?? null;
        } catch {
          return null;
        }
      }
      return null;
    case 'bin': {
      if (e.op === '||') return 'VARCHAR2';
      const l = staticType(e.left, ctx);
      const r = staticType(e.right, ctx);
      if (l === 'DATE' && r === 'DATE') return 'NUMBER';
      if (l === 'DATE' || r === 'DATE') return 'DATE';
      return 'NUMBER';
    }
    case 'func':
      if (TEXT_FNS.includes(e.name)) return 'VARCHAR2';
      if (DATE_FNS.includes(e.name)) return 'DATE';
      if (NUMBER_FNS.includes(e.name)) {
        if ((e.name === 'ROUND' || e.name === 'TRUNC') && e.args[0] && staticType(e.args[0], ctx) === 'DATE') return 'DATE';
        return 'NUMBER';
      }
      if (['NVL', 'COALESCE', 'MIN', 'MAX'].includes(e.name) && e.args[0]) return staticType(e.args[0], ctx);
      if (e.name === 'NVL2' && e.args[1]) return staticType(e.args[1], ctx);
      return null;
    default:
      return null;
  }
}

/** 값을 기대 자료형으로 바꾼다(NVL(COMM, 'x') 는 'x' 를 숫자로 바꾸려다 ORA-01722). */
function coerce(v: Value, t: StaticType): Value {
  if (v === null || t === null) return v;
  if (t === 'NUMBER') return toNumber(v);
  if (t === 'VARCHAR2') return toText(v);
  if (t === 'DATE' && typeof v === 'string') return parseDefaultDate(v);
  return v;
}

const typeLabel = (t: StaticType) => (t === 'VARCHAR2' || t === null ? 'CHAR' : t);

/** CASE 의 THEN·ELSE 는 자료형이 같아야 한다(첫 THEN 의 자료형 기준). */
function checkCaseTypes(e: Extract<Expr, { type: 'case' }>, ctx: EvalCtx) {
  const branches = [...e.whens.map((w) => w.then), ...(e.else ? [e.else] : [])];
  const types = branches.map((b) => staticType(b, ctx));
  const first = types.find((t) => t !== null) ?? null;
  if (!first) return;
  branches.forEach((b, i) => {
    const t = types[i];
    if (t && (t === 'NUMBER') !== (first === 'NUMBER')) {
      const text = ctx.src ? ctx.src.slice(b.start, b.end) : '';
      throw new OraError('ORA-00932', `expression (${text}) is of data type ${typeLabel(t)}, which is incompatible with expected data type ${typeLabel(first)}`);
    }
  });
}

function niladic(name: string): Value {
  if (name === 'USER') return 'SCOTT';
  if (name === 'SYSTIMESTAMP') throw new NotSupported('TIMESTAMP 형은 아직 실습장에서 지원하지 않아요. SYSDATE 를 써 주세요.');
  return FUNCTIONS.SYSDATE([]);
}

function arith(op: string, a: Value, b: Value, e: Expr): Value {
  if (op === '||') {
    const s = (toText(a) ?? '') + (toText(b) ?? '');
    return s === '' ? null : s;
  }
  if (a === null || b === null) return null;
  if (a instanceof SqlDate || b instanceof SqlDate) {
    if (op === '+' && a instanceof SqlDate && !(b instanceof SqlDate)) return addDays(a, toNumber(b)!);
    if (op === '+' && b instanceof SqlDate && !(a instanceof SqlDate)) return addDays(b, toNumber(a)!);
    if (op === '-' && a instanceof SqlDate && b instanceof SqlDate) return (a.ms - b.ms) / 86_400_000;
    if (op === '-' && a instanceof SqlDate) return addDays(a, -toNumber(b)!);
    if (op === '+' && a instanceof SqlDate && b instanceof SqlDate) throw new OraError('ORA-00975', 'date + date not allowed');
    throw new OraError('ORA-00932', `inconsistent datatypes: expected NUMBER got DATE`);
  }
  const x = toNumber(a)!;
  const y = toNumber(b)!;
  void e;
  switch (op) {
    case '+':
      return x + y;
    case '-':
      return x - y;
    case '*':
      return x * y;
    case '/':
      if (y === 0) throw new OraError('ORA-01476', 'divisor is equal to zero');
      return x / y;
  }
  throw new OraError('ORA-00936', 'missing expression');
}

function cmpOp(op: string, c: number | null): boolean | null {
  if (c === null) return null;
  switch (op) {
    case '=':
      return c === 0;
    case '<>':
      return c !== 0;
    case '<':
      return c < 0;
    case '>':
      return c > 0;
    case '<=':
      return c <= 0;
    case '>=':
      return c >= 0;
  }
  return null;
}

const COMPARE_OPS = new Set(['=', '<>', '<', '>', '<=', '>=']);

type LikeToken = { kind: 'any' } | { kind: 'one' } | { kind: 'lit'; ch: string };

function likeTokens(pattern: string, escape: string | null): LikeToken[] {
  const out: LikeToken[] = [];
  const chars = [...pattern];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (escape !== null && c === escape) {
      const next = chars[++i];
      if (next !== '%' && next !== '_' && next !== escape) throw new OraError('ORA-01424', 'missing or illegal character following the escape character');
      out.push({ kind: 'lit', ch: next });
    } else if (c === '%') {
      if (out[out.length - 1]?.kind !== 'any') out.push({ kind: 'any' }); // %% 는 % 하나와 같다
    } else if (c === '_') out.push({ kind: 'one' });
    else out.push({ kind: 'lit', ch: c });
  }
  return out;
}

/** LIKE 비교. 마지막 % 위치만 기억하는 반복형이라 % 가 많아도 느려지지 않는다. */
function likeMatch(text: string, pattern: string, escape: string | null): boolean {
  const t = [...text];
  const p = likeTokens(pattern, escape);
  let ti = 0;
  let pi = 0;
  let star = -1;
  let mark = 0;
  while (ti < t.length) {
    const tok = p[pi];
    if (tok && (tok.kind === 'one' || (tok.kind === 'lit' && tok.ch === t[ti]))) {
      ti++;
      pi++;
    } else if (tok?.kind === 'any') {
      star = pi++;
      mark = ti;
    } else if (star >= 0) {
      pi = star + 1;
      ti = ++mark;
    } else return false;
  }
  while (p[pi]?.kind === 'any') pi++;
  return pi === p.length;
}

/** Oracle 의 공백 채움 비교 조건: 양쪽이 CHAR 이거나, 한쪽이 CHAR 열이고 다른 쪽이 문자 리터럴 */
function padded(a: Expr, b: Expr, ctx: EvalCtx): boolean {
  const lit = (x: Expr) => x.type === 'lit' && typeof x.value === 'string';
  const fa = isFixedChar(a, ctx);
  const fb = isFixedChar(b, ctx);
  return (fa && (fb || lit(b))) || (fb && lit(a));
}

/** 식이 CHAR(n) 열을 그대로 가리키는가 */
function isFixedChar(e: Expr, ctx: EvalCtx): boolean {
  if (e.type !== 'col') return false;
  for (let c: EvalCtx | undefined = ctx; c; c = c.outer) {
    try {
      const hit = resolveColumn(c.rel, e.table, e.name);
      if (hit) return !!c.rel.cols[hit.index].fixed;
    } catch {
      return false;
    }
  }
  return false;
}

/** 조건식(참·거짓·UNKNOWN). */
export function cond(e: Expr, ctx: EvalCtx): boolean | null {
  switch (e.type) {
    case 'and': {
      const a = cond(e.left, ctx);
      if (a === false) return false;
      const b = cond(e.right, ctx);
      if (b === false) return false;
      return a === null || b === null ? null : true;
    }
    case 'or': {
      const a = cond(e.left, ctx);
      if (a === true) return true;
      const b = cond(e.right, ctx);
      if (b === true) return true;
      return a === null || b === null ? null : false;
    }
    case 'unary':
      if (e.op === 'NOT') {
        const a = cond(e.arg, ctx);
        return a === null ? null : !a;
      }
      break;
    case 'bin':
      if (COMPARE_OPS.has(e.op)) {
        const l = evaluate(e.left, ctx);
        const r = evaluate(e.right, ctx);
        // CHAR 열은 끝 공백을 채워 비교한다: CHAR(5) 의 'A    ' = 'A'
        if (typeof l === 'string' && typeof r === 'string' && padded(e.left, e.right, ctx)) {
          return cmpOp(e.op, compare(l.replace(/ +$/, ''), r.replace(/ +$/, '')));
        }
        return cmpOp(e.op, compare(l, r));
      }
      break;
    case 'isnull': {
      const v = evaluate(e.arg, ctx);
      return e.not ? v !== null : v === null;
    }
    case 'between': {
      let v = evaluate(e.arg, ctx);
      let low = evaluate(e.low, ctx);
      let high = evaluate(e.high, ctx);
      if (typeof v === 'string' && padded(e.arg, e.low, ctx) && padded(e.arg, e.high, ctx)) {
        const t = (x: Value) => (typeof x === 'string' ? x.replace(/ +$/, '') : x);
        v = t(v);
        low = t(low);
        high = t(high);
      }
      const lo = cmpOp('>=', compare(v, low));
      const hi = cmpOp('<=', compare(v, high));
      const r = lo === false || hi === false ? false : lo === null || hi === null ? null : true;
      return e.not ? (r === null ? null : !r) : r;
    }
    case 'in': {
      if (e.arg.type !== 'tuple' && isFixedChar(e.arg, ctx)) {
        // 목록의 항목마다: CHAR 열이나 문자 리터럴이면 공백 채움, 아니면(VARCHAR2 열·함수 결과) 그대로 비교
        const v = evaluate(e.arg, ctx);
        const rs = e.list.map((x) => {
          const w = evaluate(x, ctx);
          const pad = typeof v === 'string' && typeof w === 'string' && padded(e.arg, x, ctx);
          return cmpOp('=', compare(pad ? (v as string).replace(/ +$/, '') : v, pad ? (w as string).replace(/ +$/, '') : w));
        });
        const r = rs.some((x) => x === true) ? true : rs.some((x) => x === null) ? null : false;
        return e.not ? (r === null ? null : !r) : r;
      }
      if (e.arg.type === 'tuple') {
        const left = e.arg.items.map((x) => evaluate(x, ctx));
        const rows = e.list.map((item) => {
          if (item.type !== 'tuple' || item.items.length !== left.length) throw new OraError('ORA-00920', 'invalid relational operator');
          return item.items.map((x) => evaluate(x, ctx));
        });
        return inTuples(left, rows, e.not);
      }
      const v = evaluate(e.arg, ctx);
      return inList(v, e.list.map((x) => evaluate(x, ctx)), e.not);
    }
    case 'insub': {
      const sub = ctx.runSubquery(e.query, ctx);
      if (e.arg.type === 'tuple') {
        const n = e.arg.items.length;
        if (sub.width > n) throw new OraError('ORA-00913', 'too many values');
        if (sub.width < n) throw new OraError('ORA-00947', 'not enough values');
        return inTuples(e.arg.items.map((x) => evaluate(x, ctx)), sub.rows, e.not);
      }
      if (sub.width !== 1) throw new OraError('ORA-00913', 'too many values');
      return inList(evaluate(e.arg, ctx), sub.rows.map((r) => r[0]), e.not);
    }
    case 'exists': {
      const sub = ctx.runSubquery(e.query, ctx);
      return e.not ? sub.rows.length === 0 : sub.rows.length > 0;
    }
    case 'cmpsub': {
      const sub = ctx.runSubquery(e.query, ctx);
      if (sub.width !== 1) throw new OraError('ORA-00913', 'too many values');
      const v = evaluate(e.left, ctx);
      const results = sub.rows.map((r) => cmpOp(e.op, compare(v, r[0])));
      if (e.quant === 'ANY') return results.some((r) => r === true) ? true : results.some((r) => r === null) ? null : false;
      return results.some((r) => r === false) ? false : results.some((r) => r === null) ? null : true;
    }
    case 'func':
      if (e.name === 'REGEXP_LIKE') {
        // REGEXP_LIKE(문자열, 패턴[, 옵션]) 은 값이 아니라 조건이다.
        if (e.args.length < 2 || e.args.length > 3) throw new OraError('ORA-00909', 'invalid number of arguments');
        const [s, p, m] = e.args.map((a) => evaluate(a, ctx));
        if (s === null || p === null) return null;
        return oracleRegex(toText(p)!, m === undefined || m === null ? null : toText(m)).test(toText(s)!);
      }
      break;
    case 'like': {
      const v = evaluate(e.arg, ctx);
      const p = evaluate(e.pattern, ctx);
      const esc = e.escape ? evaluate(e.escape, ctx) : null;
      if (v === null || p === null) return null;
      if (esc !== null && toText(esc)!.length !== 1) throw new OraError('ORA-01425', 'escape character must be character string of length 1');
      const m = likeMatch(toText(v)!, toText(p)!, esc === null ? null : toText(esc));
      return e.not ? !m : m;
    }
    default:
  }
  throw new NotSupported('조건이 와야 할 자리에 값이 왔어요. 비교(=, >, IN 등)를 넣어 조건으로 만들어 주세요.');
}

/** (A, B) IN ((1, 2), ...): 묶음의 모든 칸이 같아야 같다. */
function inTuples(left: Value[], rows: Value[][], not: boolean): boolean | null {
  const rs = rows.map((r) => {
    const cs = r.map((v, i) => cmpOp('=', compare(left[i], v)));
    return cs.some((c) => c === false) ? false : cs.some((c) => c === null) ? null : true;
  });
  if (!not) return rs.some((r) => r === true) ? true : rs.some((r) => r === null) ? null : false;
  return rs.some((r) => r === true) ? false : rs.some((r) => r === null) ? null : true;
}

function inList(v: Value, list: Value[], not: boolean): boolean | null {
  // IN 은 = 의 OR, NOT IN 은 <> 의 AND. 목록에 NULL 이 있으면 NOT IN 은 참이 될 수 없다.
  const rs = list.map((x) => cmpOp('=', compare(v, x)));
  if (!not) return rs.some((r) => r === true) ? true : rs.some((r) => r === null) ? null : false;
  return rs.some((r) => r === true) ? false : rs.some((r) => r === null) ? null : true;
}

export function evaluate(e: Expr, ctx: EvalCtx): Value {
  if (ctx.isRolledUp && e.type !== 'lit' && !isAggregate(e) && ctx.isRolledUp(e)) return null;
  switch (e.type) {
    case 'lit':
      return e.value;
    case 'col':
      return lookupColumn(ctx, e.table, e.name);
    case 'rownum':
      return ctx.rownum ?? 1;
    case 'slot':
      return ctx.row[e.index] ?? null;
    case 'pseudo': {
      if (!ctx.hier) throw new OraError('ORA-01788', 'CONNECT BY clause required in this query block');
      if (e.name === 'LEVEL') return ctx.hier.level;
      return e.name === 'CONNECT_BY_ISLEAF' ? ctx.hier.isLeaf : ctx.hier.isCycle;
    }
    case 'star':
      throw new OraError('ORA-00936', 'missing expression');
    case 'unary': {
      if (e.op === 'NOT') break;
      if (e.op === 'PRIOR' || e.op === 'ROOT') {
        if (!ctx.hier) throw new OraError('ORA-01788', 'CONNECT BY clause required in this query block');
        // PRIOR LEVEL·PRIOR CONNECT_BY_ISLEAF 처럼 가상 열에는 PRIOR 를 붙일 수 없다.
        if (e.arg.type === 'pseudo' || (e.arg.type === 'unary' && (e.arg.op === 'PRIOR' || e.arg.op === 'ROOT'))) throw new OraError('ORA-00976', 'Specified pseudocolumn or operator not allowed here.');
        const row = e.op === 'PRIOR' ? ctx.hier.parent : ctx.hier.root;
        if (!row) return null;
        const hier = ctx.hierOf?.(row);
        return evaluate(e.arg, { ...ctx, row, ...(hier ? { hier } : {}) });
      }
      const v = evaluate(e.arg, ctx);
      if (v === null) return null;
      return e.op === '-' ? -toNumber(v)! : toNumber(v);
    }
    case 'bin':
      if (COMPARE_OPS.has(e.op)) break;
      return arith(e.op, evaluate(e.left, ctx), evaluate(e.right, ctx), e);
    case 'func': {
      if (e.over) {
        const v = ctx.windowValues?.get(windowKey(e));
        if (v === undefined) throw new OraError('ORA-30483', 'window  functions are not allowed here');
        return v;
      }
      if (e.withinGroup) return hypothetical(e, ctx);
      if (WINDOW_ONLY.has(e.name)) throw new OraError('ORA-30484', 'missing OVER clause, or invalid identifier found for window function');
      if (e.name === 'SYS_CONNECT_BY_PATH') {
        if (!ctx.hier) throw new OraError('ORA-01788', 'CONNECT BY clause required in this query block');
        if (e.args.length !== 2) throw new OraError('ORA-00909', 'invalid number of arguments');
        const sep = toText(evaluate(e.args[1], ctx)) ?? '';
        return ctx.hier.path.map((row) => sep + (toText(evaluate(e.args[0], { ...ctx, row })) ?? '')).join('') || null;
      }
      if (AGGREGATES.has(e.name)) return aggregate(e, ctx);
      const args = e.args.map((a) => evaluate(a, ctx));
      // NVL·COALESCE 는 첫 인자의(NVL2 는 둘째 인자의) 자료형으로 나머지를 바꾼다.
      if (e.name === 'NVL' || e.name === 'COALESCE') {
        const t = staticType(e.args[0], ctx);
        return callFunction(e.name, args.map((v, i) => (i === 0 ? v : coerce(v, t))));
      }
      if (e.name === 'NVL2' && args.length === 3) return callFunction(e.name, [args[0], args[1], coerce(args[2], staticType(e.args[1], ctx))]);
      return callFunction(e.name, args);
    }
    case 'tuple':
      throw new OraError('ORA-00920', 'invalid relational operator');
    case 'case': {
      checkCaseTypes(e, ctx);
      if (e.base) {
        const b = evaluate(e.base, ctx);
        for (const w of e.whens) if (compare(b, evaluate(w.when, ctx)) === 0) return evaluate(w.then, ctx);
      } else {
        for (const w of e.whens) if (cond(w.when, ctx) === true) return evaluate(w.then, ctx);
      }
      return e.else ? evaluate(e.else, ctx) : null;
    }
    case 'subquery': {
      const sub = ctx.runSubquery(e.query, ctx);
      if (sub.width !== 1) throw new OraError('ORA-00913', 'too many values');
      if (sub.rows.length > 1) throw new OraError('ORA-01427', 'single-row subquery returns more than one row');
      return sub.rows[0]?.[0] ?? null;
    }
    case 'extract':
      return extractField(e.field, evaluate(e.arg, ctx));
    case 'trim':
      return trimBoth(e.mode, e.chars ? evaluate(e.chars, ctx) : undefined, evaluate(e.arg, ctx));
    default:
  }
  throw new NotSupported('조건식(비교·AND·OR)을 SELECT 의 값으로 쓰는 것은 실습장에서 지원하지 않아요. CASE WHEN 으로 바꿔 써 주세요.');
}

/** RANK(v) WITHIN GROUP (ORDER BY x): 묶음에 v 를 넣는다면 몇 등인가(가상 순위). */
function hypothetical(e: Extract<Expr, { type: 'func' }>, ctx: EvalCtx): Value {
  if (!ctx.group) throw new OraError('ORA-00934', 'group function is not allowed here');
  const order = e.withinGroup!;
  const hyp = e.args.map((a) => evaluate(a, { ...ctx, group: undefined }));
  const rows = ctx.group.map((row) => order.map((o) => evaluate(o.expr, rowCtx(ctx, row))));
  // 정렬 방향을 따라 a 가 b 보다 앞이면 음수(NULL 은 ASC 에서 맨 뒤)
  const cmp = (a: Value[], b: Value[]) => {
    for (let t = 0; t < order.length; t++) {
      const o = order[t];
      const nullsFirst = o.nulls ? o.nulls === 'FIRST' : o.desc;
      const x = a[t];
      const y = b[t];
      if (x === null && y === null) continue;
      if (x === null) return nullsFirst ? -1 : 1;
      if (y === null) return nullsFirst ? 1 : -1;
      const c = (compare(x, y) ?? 0) * (o.desc ? -1 : 1);
      if (c) return c;
    }
    return 0;
  };
  const n = rows.length;
  const before = rows.filter((r) => cmp(r, hyp) < 0).length;
  const peers = rows.filter((r) => cmp(r, hyp) === 0).length;
  switch (e.name) {
    case 'RANK':
      return before + 1;
    case 'DENSE_RANK': {
      const distinct = new Set(rows.filter((r) => cmp(r, hyp) < 0).map((r) => JSON.stringify(r.map((v) => (v === null ? null : String(v))))));
      return distinct.size + 1;
    }
    case 'PERCENT_RANK':
      return n === 0 ? 0 : before / n;
    default:
      return (before + peers + 1) / (n + 1); // CUME_DIST
  }
}

function callFunction(name: string, args: Value[]): Value {
  const fn = FUNCTIONS[name];
  if (!fn) return callFunctionName(name);
  return fn(args);
}

/** 없는 함수 이름: 2·3단계 기능이면 안내, 아니면 Oracle 과 같은 ORA-00904. */
export function callFunctionName(name: string): never {
  {
    if (name === 'NTH_VALUE' || name === 'LISTAGG') throw new NotSupported(`${name} 는 아직 실습장에서 지원하지 않아요.`);
    if (name === 'REGEXP_LIKE') throw new OraError('ORA-00904', '"REGEXP_LIKE": invalid identifier', 'REGEXP_LIKE 는 값이 아니라 조건이에요. WHERE 나 CASE WHEN 안에 써요.');
    if (['ISNULL', 'LEN', 'GETDATE', 'CHARINDEX', 'DATEADD', 'CEILING'].includes(name)) {
      throw new OraError('ORA-00904', `"${name}": invalid identifier`);
    }
    throw new OraError('ORA-00904', `"${name}": invalid identifier`);
  }
}

/** 집계 함수: 지금 묶음(ctx.group)의 행마다 인자를 계산해 모은다. NULL 은 빼고 센다. */
/** 묶음 안의 한 행을 계산하는 문맥(그 행의 계층 정보까지 바꿔 끼운다) */
function rowCtx(ctx: EvalCtx, row: Value[]): EvalCtx {
  const hier = ctx.hierOf?.(row);
  return { ...ctx, row, group: undefined, isRolledUp: undefined, ...(hier ? { hier } : {}) };
}

function aggregate(e: Extract<Expr, { type: 'func' }>, ctx: EvalCtx): Value {
  // GROUPING(열): 이 행이 그 열로 묶이지 않은(소계·총계) 행이면 1. GROUPING_ID 는 그 비트를 이은 수.
  if (e.name === 'GROUPING' || e.name === 'GROUPING_ID') {
    if (!ctx.group || !ctx.hasGroupBy) throw new OraError('ORA-30481', 'GROUPING, GROUPING_ID, and GROUP_ID cannot be used without GROUP BY');
    if (e.name === 'GROUPING' && e.args.length !== 1) throw new OraError('ORA-00909', 'invalid number of arguments');
    const bits = e.args.map((a) => (ctx.isRolledUp?.(a) ? 1 : 0));
    return bits.reduce<number>((acc, b) => acc * 2 + b, 0);
  }
  if (ctx.groupSet && e.args.some(containsAggregate)) {
    // 바깥 집계: 묶음마다 안쪽 집계를 계산한 값들을 다시 집계한다.
    const values = ctx.groupSet.map((g) => evaluate(e.args[0], g)).filter((v): v is Exclude<Value, null> => v !== null);
    return aggregateValues(e, values);
  }
  if (!ctx.group) throw new OraError('ORA-00934', 'group function is not allowed here');
  if (e.star) {
    if (e.name !== 'COUNT') throw new OraError('ORA-00936', 'missing expression');
    return ctx.group.length;
  }
  if (e.args.length !== 1) throw new OraError(e.args.length ? 'ORA-00909' : 'ORA-00909', 'invalid number of arguments');
  let values = ctx.group.map((row) => evaluate(e.args[0], rowCtx(ctx, row))).filter((v): v is Exclude<Value, null> => v !== null);
  if (e.distinct) {
    const seen = new Set<string>();
    values = values.filter((v) => {
      const k = v instanceof SqlDate ? `d${v.ms}` : `${typeof v}:${v}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return aggregateValues(e, values);
}

function aggregateValues(e: Extract<Expr, { type: 'func' }>, values: Exclude<Value, null>[]): Value {
  if (e.name === 'COUNT') return values.length;
  if (values.length === 0) return null;
  if (e.name === 'MIN') return values.reduce((a, b) => ((compare(b, a) ?? 0) < 0 ? b : a));
  if (e.name === 'MAX') return values.reduce((a, b) => ((compare(b, a) ?? 0) > 0 ? b : a));
  const nums = values.map((v) => toNumber(v)!);
  const sum = nums.reduce((a, b) => a + b, 0);
  if (e.name === 'SUM') return Number(sum.toPrecision(15));
  const avg = sum / nums.length;
  if (e.name === 'AVG') return avg;
  if (e.name === 'MEDIAN') {
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  // 표본 분산·표준편차(Oracle: 행이 하나면 0)
  if (nums.length === 1) return 0;
  const variance = nums.reduce((a, b) => a + (b - avg) ** 2, 0) / (nums.length - 1);
  return e.name === 'VARIANCE' ? variance : Math.sqrt(variance);
}
