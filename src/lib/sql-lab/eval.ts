// 식 계산. 조건(WHERE·ON·HAVING)은 3값 논리(참·거짓·UNKNOWN=null)로 계산한다.
import type { Expr, Select } from './ast';
import { FUNCTIONS, NILADIC, extractField, trimBoth } from './functions';
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
  runSubquery: (q: Select, outer: EvalCtx) => { rows: Value[][]; width: number };
}

export const AGGREGATES = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'STDDEV', 'VARIANCE', 'MEDIAN']);

export const isAggregate = (e: Expr) => e.type === 'func' && AGGREGATES.has(e.name);

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
      return e.args;
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
  for (let c: EvalCtx | undefined = ctx; c; c = c.outer) {
    const hit = resolveColumn(c.rel, table, name);
    if (hit) return c.row[hit.index] ?? null;
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
      if (COMPARE_OPS.has(e.op)) return cmpOp(e.op, compare(evaluate(e.left, ctx), evaluate(e.right, ctx)));
      break;
    case 'isnull': {
      const v = evaluate(e.arg, ctx);
      return e.not ? v !== null : v === null;
    }
    case 'between': {
      const v = evaluate(e.arg, ctx);
      const lo = cmpOp('>=', compare(v, evaluate(e.low, ctx)));
      const hi = cmpOp('<=', compare(v, evaluate(e.high, ctx)));
      const r = lo === false || hi === false ? false : lo === null || hi === null ? null : true;
      return e.not ? (r === null ? null : !r) : r;
    }
    case 'in': {
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
  switch (e.type) {
    case 'lit':
      return e.value;
    case 'col':
      return lookupColumn(ctx, e.table, e.name);
    case 'rownum':
      return ctx.rownum ?? 1;
    case 'star':
      throw new OraError('ORA-00936', 'missing expression');
    case 'unary': {
      if (e.op === 'NOT') break;
      const v = evaluate(e.arg, ctx);
      if (v === null) return null;
      return e.op === '-' ? -toNumber(v)! : toNumber(v);
    }
    case 'bin':
      if (COMPARE_OPS.has(e.op)) break;
      return arith(e.op, evaluate(e.left, ctx), evaluate(e.right, ctx), e);
    case 'func': {
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

function callFunction(name: string, args: Value[]): Value {
  const fn = FUNCTIONS[name];
  if (!fn) return callFunctionName(name);
  return fn(args);
}

/** 없는 함수 이름: 2·3단계 기능이면 안내, 아니면 Oracle 과 같은 ORA-00904. */
export function callFunctionName(name: string): never {
  {
    if (['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'NTILE', 'RATIO_TO_REPORT', 'CUME_DIST', 'PERCENT_RANK', 'FIRST_VALUE', 'LAST_VALUE'].includes(name)) {
      throw new NotSupported(`${name} 같은 윈도우 함수는 실습장 2단계에서 열려요.`);
    }
    if (name.startsWith('REGEXP_')) throw new NotSupported('정규 표현식 함수(REGEXP_*)는 실습장 3단계에서 열려요.');
    if (['ISNULL', 'LEN', 'GETDATE', 'CHARINDEX', 'DATEADD', 'CEILING'].includes(name)) {
      throw new OraError('ORA-00904', `"${name}": invalid identifier`);
    }
    throw new OraError('ORA-00904', `"${name}": invalid identifier`);
  }
}

/** 집계 함수: 지금 묶음(ctx.group)의 행마다 인자를 계산해 모은다. NULL 은 빼고 센다. */
function aggregate(e: Extract<Expr, { type: 'func' }>, ctx: EvalCtx): Value {
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
  let values = ctx.group.map((row) => evaluate(e.args[0], { ...ctx, row, group: undefined })).filter((v): v is Exclude<Value, null> => v !== null);
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
