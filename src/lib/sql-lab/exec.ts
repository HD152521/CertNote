// SELECT 실행: FROM(조인) → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → FETCH.
// 이름 오류(ORA-00904·00918)와 GROUP BY 규칙(00937·00979·00934)은 행이 없어도 Oracle 처럼 먼저 검사한다.
import type { Expr, FromItem, OrderItem, QueryBlock, Select, SelectItem } from './ast';
import type { Database } from './data';
import { AGGREGATES, callFunctionName, children, cond, containsAggregate, evaluate, isAggregate, lookupColumn, type EvalCtx } from './eval';
import { FUNCTIONS } from './functions';
import { emptyRelation, invalidIdentifier, joinRelations, joinShape, mergeColumns, resolveColumn, type RelCol, type Relation } from './relation';
import { NotSupported, OraError, compare, groupKey, kindOf, type Value } from './values';
import { buildHierarchy, type HierInfo } from './hierarchy';
import { WINDOW_ONLY, checkWindowSpec, computeWindow, isWindow, windowError, windowKey, type WindowFunc } from './window';

/** ROLLUP·CUBE 계산량 상한(묶음 수 × 입력 행). 넘으면 탭이 몇 초씩 멈춘다. */
const MAX_GROUP_WORK = 300_000;

export interface ResultSet {
  columns: string[];
  rows: Value[][];
  /** ORDER BY 키(WITH TIES 용) */
  sortKeys?: Value[][];
}

interface Env {
  db: Database;
  /** WITH 절로 이름 붙인 쿼리(바깥 → 안쪽으로 물려준다) */
  ctes?: Map<string, { columns?: string[]; query: Select; env: Env; result?: ResultSet }>;
  /** 문장 하나의 작업량(훑은 행 수). 상관 서브쿼리가 큰 조인을 행마다 다시 돌리면 탭이 멈추므로 상한을 둔다. */
  work?: { rows: number; deadline?: number };
  /** 계층형 질의가 펼친 노드 행 → 계층 정보(문장 하나 동안) */
  hier?: WeakMap<Value[], HierInfo>;
  /** 원문 — 오류 문구에 식 원문을 넣을 때 */
  src?: string;
}

// ── 이름 검사(행 없이) ───────────────────────────────────────────────────────

/** 식 속 열 이름이 모두 있는지(이 쿼리 → 바깥 쿼리 순) 확인한다. */
function checkNames(e: Expr, rel: Relation, outer: EvalCtx | undefined, env?: Env) {
  const probe = (): EvalCtx => ({ rel, row: rel.cols.map(() => null), outer, runSubquery: () => ({ rows: [], width: 0 }) });
  if (e.type === 'col') {
    lookupColumn(probe(), e.table, e.name);
    return;
  }
  if (e.type === 'func' && !e.over && !AGGREGATES.has(e.name) && !FUNCTIONS[e.name] && !WINDOW_ONLY.has(e.name) && e.name !== 'SYS_CONNECT_BY_PATH') callFunctionName(e.name);
  // 서브쿼리 안쪽 이름도 바깥 행 없이 미리 검사한다(행이 없거나 AND 가 단락돼도 Oracle 은 ORA-00904 를 낸다).
  if (env && (e.type === 'subquery' || e.type === 'insub' || e.type === 'exists' || e.type === 'cmpsub')) {
    try {
      runSelect({ ...env, work: { rows: 0, deadline: precheckDeadline(env) } }, e.query, probe());
    } catch (err) {
      // 미리 보는 것은 이름 오류뿐이다. 실행 오류(0 으로 나누기 등)는 그 서브쿼리를 실제로 계산할 때만 난다.
      if (err instanceof OraError && SUBQUERY_PRECHECK_ERRORS.has(err.code)) throw err;
    }
  }
  children(e).forEach((c) => checkNames(c, rel, outer, env));
}

/** 식을 비교용 문자열로: 열은 해석한 위치로 바꿔 e.DEPTNO 와 DEPTNO 를 같게 본다. */
function exprKey(e: Expr, rel: Relation): string {
  return JSON.stringify(e, (k, v) => {
    if (k === 'start' || k === 'end') return undefined;
    if (v && typeof v === 'object' && v.type === 'slot') return { col: v.index };
    if (v && typeof v === 'object' && v.type === 'col') {
      try {
        const hit = resolveColumn(rel, v.table, v.name);
        if (hit) return { col: hit.index };
      } catch {
        /* 모호한 이름은 원문 그대로 비교 */
      }
    }
    return v;
  });
}

function colHeading(e: Extract<Expr, { type: 'col' }>) {
  return e.table ? `"${e.table}"."${e.name}"` : `"${e.name}"`;
}

/** 묶음 쿼리에서 식이 GROUP BY 식·집계·상수로만 이뤄졌는지. */
function checkGrouped(e: Expr, groupKeys: Set<string>, rel: Relation, hasGroupBy: boolean, outer: EvalCtx | undefined) {
  if (groupKeys.has(exprKey(e, rel))) return;
  if (e.type === 'func' && (e.name === 'GROUPING' || e.name === 'GROUPING_ID')) {
    if (!hasGroupBy) throw new OraError('ORA-30481', 'GROUPING, GROUPING_ID, and GROUP_ID cannot be used without GROUP BY');
    for (const a of e.args) {
      if (groupKeys.has(exprKey(a, rel))) continue;
      // GROUPING 의 인자는 GROUP BY 식 그 자체여야 한다(DEPTNO + 0 처럼 감싼 식은 Oracle 도 ORA-00979).
      const label = a.type === 'col' ? colHeading(a) : 'GROUPING';
      throw new OraError('ORA-00979', `${label}: must appear in the GROUP BY clause or be used in an aggregate function`);
    }
    return;
  }
  if (isAggregate(e)) {
    const args = e.type === 'func' ? e.args : [];
    if (args.some(containsAggregate)) {
      if (!hasGroupBy) throw new OraError('ORA-00978', 'nested group function without GROUP BY');
      return; // MAX(COUNT(*)) GROUP BY ...: 묶음 결과를 한 번 더 집계한다
    }
    return;
  }
  if (e.type === 'col') {
    // 바깥 쿼리의 열(상관 서브쿼리)은 묶음과 무관하다.
    if (!resolveColumn(rel, e.table, e.name)) return;
    if (!hasGroupBy) throw new OraError('ORA-00937', 'not a single-group group function');
    throw new OraError('ORA-00979', `${colHeading(e)}: must appear in the GROUP BY clause or be used in an aggregate function`);
  }
  if (e.type === 'slot') {
    // SELECT * 가 펼친 열도 GROUP BY 규칙은 같다.
    if (!hasGroupBy) throw new OraError('ORA-00937', 'not a single-group group function');
    throw new OraError('ORA-00979', `${e.table ? `"${e.table}".` : ''}"${e.name}": must appear in the GROUP BY clause or be used in an aggregate function`);
  }
  if (e.type === 'rownum') {
    if (!hasGroupBy) throw new OraError('ORA-00937', 'not a single-group group function');
    throw new OraError('ORA-00979', 'ROWNUM: must appear in the GROUP BY clause or be used in an aggregate function');
  }
  void outer;
  children(e).forEach((c) => checkGrouped(c, groupKeys, rel, hasGroupBy, outer));
}

function noAggregate(e: Expr | undefined) {
  if (e && containsAggregate(e)) throw new OraError('ORA-00934', 'group function is not allowed here');
  const w = e ? windowsIn(e) : [];
  if (w.some((f) => AGGREGATES.has(f.name))) throw new OraError('ORA-00934', 'group function is not allowed here');
  if (w.length) throw windowError();
}

/** 식 안의 윈도우 함수(서브쿼리 안은 그 서브쿼리가 계산한다) */
function windowsIn(e: Expr, out: WindowFunc[] = []): WindowFunc[] {
  if (isWindow(e)) {
    if (e.args.some((a) => windowsIn(a).length)) throw windowError(); // 윈도우 함수 안의 윈도우 함수
    out.push(e);
  }
  children(e).forEach((c) => windowsIn(c, out));
  return out;
}
const containsWindow = (e: Expr) => windowsIn(e).length > 0;

/** 계층형 질의의 가상 열·PRIOR 가 CONNECT BY 없이 쓰였는가 */
function usesHierarchy(e: Expr): boolean {
  if (e.type === 'pseudo' || (e.type === 'unary' && (e.op === 'PRIOR' || e.op === 'ROOT')) || (e.type === 'func' && e.name === 'SYS_CONNECT_BY_PATH')) return true;
  return children(e).some(usesHierarchy);
}

// ── FROM ─────────────────────────────────────────────────────────────────────

/** 뷰·WITH 의 열. ANSI 조인 위의 SELECT * 가 만든 같은 이름 열은 Oracle 이 이름을 바꿔 두므로 이름으로 못 찾는다. */
function viewColumns(query: Select, names: string[], qual: string | null): RelCol[] {
  const b = query.body;
  const ansiStar = b.type === 'query' && b.items.some((i) => i.expr.type === 'star' && !i.expr.table) && b.from.some((f) => f.type === 'join' && !f.natural && !f.using);
  const count = new Map<string, number>();
  names.forEach((n) => count.set(n, (count.get(n) ?? 0) + 1));
  return names.map((name) => ({ qual, name, fromView: true, ...(ansiStar && (count.get(name) ?? 0) > 1 ? { hidden: true } : {}) }));
}

function tableRelation(env: Env, item: Extract<FromItem, { type: 'table' }>): Relation {
  const cte = env.ctes?.get(item.name);
  if (cte) {
    const rs = (cte.result ??= runSelect(cte.env, cte.query));
    if (cte.columns && cte.columns.length !== rs.columns.length) throw new OraError('ORA-32038', 'number of WITH clause column names does not match number of elements in select list');
    const qual = item.alias ?? item.name;
    const names = cte.columns ?? rs.columns;
    return { cols: viewColumns(cte.query, names, qual), rows: rs.rows, banned: new Map(), quals: new Set([qual]) };
  }
  const t = env.db[item.name];
  if (!t) throw new OraError('ORA-00942', `table or view "SCOTT"."${item.name}" does not exist`);
  const qual = item.alias ?? item.name;
  return {
    cols: t.columns.map((c) => ({ qual, name: c.name, type: c.type })),
    rows: t.rows.map((r) => [...r]),
    banned: new Map(),
    quals: new Set([qual]),
  };
}

function fromItemRelation(env: Env, item: FromItem, outer: EvalCtx | undefined): Relation {
  if (item.type === 'table') return tableRelation(env, item);
  if (item.type === 'view') {
    const rs = runSelect(env, item.query, outer);
    const qual = item.alias ?? null;
    return {
      cols: viewColumns(item.query, rs.columns, qual),
      rows: rs.rows,
      banned: new Map(),
      quals: new Set(qual ? [qual] : []),
    };
  }
  const left = fromItemRelation(env, item.left, outer);
  const right = fromItemRelation(env, item.right, outer);
  if (item.kind === 'CROSS') return joinRelations(left, right, 'CROSS', null);
  if (item.natural || item.using) {
    const names = item.natural
      ? left.cols.filter((c) => right.cols.some((r) => r.name === c.name)).map((c) => c.name)
      : item.using!;
    for (const n of names) {
      if (!left.cols.some((c) => c.name === n) || !right.cols.some((c) => c.name === n)) throw invalidIdentifier(undefined, n);
    }
    const leftCount = left.cols.length;
    const pairs = names.map((n) => [left.cols.findIndex((c) => c.name === n), leftCount + right.cols.findIndex((c) => c.name === n)]);
    const test = (row: Value[]) => pairs.every(([a, b]) => compare(row[a], row[b]) === 0);
    const joined = joinRelations(left, right, names.length ? item.kind : 'CROSS', names.length ? test : null);
    return mergeColumns(joined, leftCount, names, item.natural ? 'NATURAL' : 'USING');
  }
  const probe = joinShape(left, right);
  if (item.on) {
    checkNames(item.on, probe, outer);
    noAggregate(item.on);
    if (hasOuterMark(item.on)) throw new OraError('ORA-25156', 'old style outer join (+) cannot be used with ANSI joins');
  }
  const on = item.on!;
  return joinRelations(left, right, item.kind, (row) => cond(on, ctxOf(env, probe, row, outer)) === true);
}

function hasOuterMark(e: Expr): boolean {
  return (e.type === 'col' && !!e.outer) || children(e).some(hasOuterMark);
}

function conjuncts(e: Expr | undefined): Expr[] {
  if (!e) return [];
  if (e.type === 'and') return [...conjuncts(e.left), ...conjuncts(e.right)];
  return [e];
}

/** 식이 가리키는 FROM 항목들(열 이름 → 그 열이 속한 항목 번호) */
function itemsOf(e: Expr, rels: Relation[], marked: boolean): Set<number> {
  const out = new Set<number>();
  const walk = (x: Expr) => {
    if (x.type === 'col' && (!marked || x.outer)) {
      const i = rels.findIndex((r) => {
        try {
          return resolveColumn(r, x.table, x.name) !== null;
        } catch {
          return false;
        }
      });
      if (i >= 0) out.add(i);
    }
    children(x).forEach(walk);
  };
  walk(e);
  return out;
}

/**
 * 쉼표로 나열한 FROM 과 WHERE 의 (+) 를 묶어 작업 테이블 하나로 만든다.
 * (+) 가 붙은 쪽이 "없어도 되는" 테이블이고, 그 조건이 외부 조인의 조인 조건이 된다.
 * (+) 없는 조건은 조인 뒤 WHERE 로 거른다(그래서 (+) 를 하나라도 빼먹으면 내부 조인이 된다).
 */
function buildFrom(env: Env, q: QueryBlock, outer: EvalCtx | undefined): { rel: Relation; rest: Expr[] } {
  const rels = q.from.map((f) => fromItemRelation(env, f, outer));
  const dupe = findDuplicateQual(rels);
  if (dupe) throw new OraError('ORA-00918', `${dupe}: column ambiguously specified`);
  const all = conjuncts(q.where);
  if (q.from.some((f) => f.type === 'join') && all.some(hasOuterMark)) {
    throw new OraError('ORA-25156', 'old style outer join (+) cannot be used with ANSI joins');
  }
  const outerConds = new Map<number, Expr[]>();
  const rest: Expr[] = [];
  for (const c of all) {
    if (!hasOuterMark(c)) {
      rest.push(c);
      continue;
    }
    if (hasOr(c)) throw new OraError('ORA-01719', 'outer join operator (+) not allowed in operand of OR or IN');
    const optional = itemsOf(c, rels, true);
    if (optional.size > 1) throw new OraError('ORA-01468', 'a predicate may reference only one outer-joined table');
    const [opt] = [...optional];
    if (opt === undefined) {
      rest.push(c);
      continue;
    }
    outerConds.set(opt, [...(outerConds.get(opt) ?? []), c]);
  }
  // 없어도 되는 테이블은 그 짝이 모두 붙은 뒤에 붙인다.
  const order = rels.map((_, i) => i);
  const placed: number[] = [];
  const pending = [...order];
  let rel: Relation | null = null;
  let guard = 0;
  while (pending.length && guard++ < 100) {
    const idx = pending.findIndex((i) => {
      const conds = outerConds.get(i);
      if (!conds) return true;
      const needs = new Set(conds.flatMap((c) => [...itemsOf(c, rels, false)]).filter((x) => x !== i));
      return [...needs].every((n) => placed.includes(n));
    });
    const i = pending.splice(idx < 0 ? 0 : idx, 1)[0];
    const conds = outerConds.get(i);
    if (!rel) rel = rels[i];
    else if (conds) {
      const probe = joinShape(rel, rels[i]);
      conds.forEach((c) => checkNames(c, probe, outer));
      rel = joinRelations(rel, rels[i], 'LEFT', (row) => conds.every((c) => cond(c, ctxOf(env, probe, row, outer)) === true));
    } else rel = joinRelations(rel, rels[i], 'CROSS', null);
    placed.push(i);
  }
  // 열 순서는 FROM 에 쓴 순서로 되돌린다(SELECT * 의 순서).
  return { rel: reorder(rel ?? emptyRelation(), rels, placed), rest };
}

function reorder(rel: Relation, rels: Relation[], placed: number[]): Relation {
  if (placed.every((p, k) => p === k)) return rel;
  const offsets: number[] = [];
  let acc = 0;
  for (const p of placed) {
    offsets[p] = acc;
    acc += rels[p].cols.length;
  }
  const map = rels.flatMap((r, i) => r.cols.map((_, k) => offsets[i] + k));
  return { ...rel, cols: map.map((m) => rel.cols[m]), rows: rel.rows.map((row) => map.map((m) => row[m])) };
}

function findDuplicateQual(rels: Relation[]): string | null {
  const seen = new Set<string>();
  for (const r of rels) {
    for (const q of r.quals) {
      if (seen.has(q)) return q;
      seen.add(q);
    }
  }
  return null;
}

function hasOr(e: Expr): boolean {
  return e.type === 'or' || e.type === 'in' || children(e).some(hasOr);
}

function ctxOf(env: Env, rel: Relation, row: Value[], outer: EvalCtx | undefined, extra: Partial<EvalCtx> = {}): EvalCtx {
  const hier = env.hier?.get(row);
  const hierMap = env.hier;
  return {
    rel,
    row,
    outer,
    src: env.src,
    runSubquery: (q, o) => runSubquery(env, q, o),
    ...(hier ? { hier } : {}),
    ...(hierMap ? { hierOf: (r: Value[]) => hierMap.get(r) } : {}),
    ...extra,
  };
}

/** 문장 하나를 실행하는 동안 비상관 서브쿼리 결과를 기억한다(바깥 행마다 다시 돌리면 큰 조인에서 탭이 멈춘다). */
const subqueryCache = new WeakMap<Env, WeakMap<Select, { rows: Value[][]; width: number }>>();

function runSubquery(env: Env, q: Select, outer: EvalCtx) {
  let byQuery = subqueryCache.get(env);
  if (!byQuery) {
    byQuery = new WeakMap();
    subqueryCache.set(env, byQuery);
  }
  const cached = byQuery.get(q);
  if (cached) return cached;
  const correlation = { hit: false };
  const rs = runSelect(env, q, { ...outer, correlation });
  const out = { rows: rs.rows, width: rs.columns.length };
  if (!correlation.hit) byQuery.set(q, out);
  return out;
}

// ── SELECT 목록 ──────────────────────────────────────────────────────────────

interface OutCol {
  name: string;
  expr: Expr;
  alias?: string;
}

function expandItems(items: SelectItem[], rel: Relation): OutCol[] {
  const out: OutCol[] = [];
  for (const it of items) {
    if (it.expr.type === 'star') {
      const t = it.expr.table;
      if (t !== undefined && !rel.quals.has(t)) throw new OraError('ORA-00904', `"${t}": invalid identifier`);
      rel.cols.forEach((c, i) => {
        if (t !== undefined && c.qual !== t) return;
        // 같은 이름 열이 모호하면(쉼표 조인 뷰) Oracle 처럼 ORA-00918 — 이름으로 한 번 찾아 본다.
        if (!c.hidden) resolveColumn(rel, c.qual ?? undefined, c.name);
        out.push({ name: c.name, expr: { type: 'slot', index: i, table: c.qual ?? undefined, name: c.name, start: i, end: i } });
      });
      continue;
    }
    const name = it.alias ?? (it.expr.type === 'col' ? it.expr.name : it.heading);
    out.push({ name, expr: it.expr, alias: it.alias });
  }
  return out;
}

// ── 쿼리 블록 ────────────────────────────────────────────────────────────────

interface BlockRow {
  values: Value[];
  ctx: EvalCtx;
  /** ORDER BY 키(FETCH … WITH TIES 가 동점을 이어 붙일 때 쓴다) */
  sortKey?: Value[];
}

const MAX_STATEMENT_WORK = 2_000_000;
/** 실행하지 않아도 Oracle 이 먼저 내는 오류(이름·구조) */
const NAME_ERRORS = new Set([
  'ORA-00904', 'ORA-00942', 'ORA-00918', 'ORA-32031', 'ORA-32038', 'ORA-32039', 'ORA-25154', 'ORA-25155',
  // 구조 오류도 Oracle 은 쓰지 않는 WITH 에서 낸다(열 수·인자 수·집계 위치). GROUP BY 규칙(00937·00979)과 형 오류(00932·00975)는 내지 않는다.
  'ORA-00913', 'ORA-00947', 'ORA-01789', 'ORA-00934', 'ORA-30481', 'ORA-00909', 'ORA-00938', 'ORA-00939', 'ORA-00978',
]);
/** 서브쿼리를 미리 볼 때 바로 내는 오류: 이름 오류와, 실행 전에 정해지는 GROUP BY 규칙 */
const SUBQUERY_PRECHECK_ERRORS = new Set([...NAME_ERRORS, 'ORA-00979', 'ORA-00937', 'ORA-00932', 'ORA-00975']);
/** 미리 보기는 1.5초까지, 그리고 문장 전체 마감을 넘지 않는다(넘으면 그 미리 보기는 건너뛴다). */
function precheckDeadline(env: Env): number {
  return Math.min(Date.now() + 1500, env.work?.deadline ?? Infinity);
}
/** 문장 하나에 쓸 수 있는 시간(밀리초). 넘으면 탭이 멈춘 것처럼 보이므로 멈춘다. */
export const MAX_STATEMENT_MS = 3000;
const tooSlow = () => new NotSupported('실행이 3초를 넘어서 멈췄어요. 큰 조인 위에서 서브쿼리가 행마다 다시 실행되거나, 문자열 계산이 너무 무거운지 확인해 보세요.');

function runBlock(
  env: Env,
  q: QueryBlock,
  orderBy: OrderItem[] | undefined,
  outer: EvalCtx | undefined,
  orderSiblings?: OrderItem[],
): { columns: string[]; rows: BlockRow[]; cols: OutCol[] } {
  const { rel: fromRel, rest: fromRest } = buildFrom(env, q, outer);
  let rel = fromRel;
  let rest = fromRest;
  const checkTime = () => {
    if (env.work?.deadline && Date.now() > env.work.deadline) throw tooSlow();
  };
  if (env.work && (env.work.rows += rel.rows.length) > MAX_STATEMENT_WORK) {
    throw new NotSupported('계산량이 너무 커서 실행을 멈췄어요. 큰 조인 위에서 상관 서브쿼리가 행마다 다시 실행되고 있는지 확인해 보세요.');
  }
  const cols = expandItems(q.items, rel);

  // 이름 검사: WHERE 는 SELECT 별칭을 모른다.
  cols.forEach((c) => checkNames(c.expr, rel, outer, env));
  const aliases = new Set(cols.flatMap((c) => (c.alias ? [c.alias] : [])));
  const aliasHint = (e: Expr, clause: string) => {
    try {
      checkNames(e, rel, outer, env);
    } catch (err) {
      const m = err instanceof OraError && err.code === 'ORA-00904' ? /^"([^"]+)": invalid identifier$/.exec(err.text) : null;
      if (m && aliases.has(m[1])) {
        const base = `${clause} 절은 SELECT 보다 먼저 처리돼서 SELECT 의 별칭(${m[1]})을 몰라요.`;
        const v23 = clause === 'WHERE' ? '' : ` 실제 Oracle 23ai 는 ${clause} 에서 별칭을 받아 주지만, SQLD 시험 기준으로는 오류예요.`;
        throw new OraError('ORA-00904', m[0], base + v23);
      }
      throw err;
    }
  };
  rest.forEach((c) => aliasHint(c, 'WHERE'));
  q.groupBy?.forEach((g) => aliasHint(g, 'GROUP BY'));
  if (q.having) aliasHint(q.having, 'HAVING');
  noAggregate(q.where);
  q.groupBy?.forEach(noAggregate);
  if (q.having && containsWindow(q.having)) throw windowError();
  cols.forEach((c) => windowsIn(c.expr).forEach(checkWindowSpec));

  if (orderSiblings && !q.connectBy) throw new OraError('ORA-30929', 'ORDER SIBLINGS BY clause not allowed here');
  if (!q.connectBy) {
    const used = [...cols.map((c) => c.expr), ...rest, ...(q.groupBy ?? []), ...(q.having ? [q.having] : []), ...(orderBy ?? []).map((o) => o.expr)];
    if (used.some(usesHierarchy)) throw new OraError('ORA-01788', 'CONNECT BY clause required in this query block');
  } else {
    // 계층형 질의: 조인 조건으로 먼저 잇고 → 나무를 펼친 뒤 → 나머지 WHERE 로 거른다.
    const cb = q.connectBy;
    [cb.condition, ...(cb.startWith ? [cb.startWith] : [])].forEach((e) => {
      checkNames(e, rel, outer, env);
      noAggregate(e);
    });
    const isJoin = (c: Expr) => c.type === 'bin' && c.op === '=' && c.left.type === 'col' && c.right.type === 'col' && !!c.left.table && !!c.right.table && c.left.table !== c.right.table;
    const joinConds = q.from.length > 1 ? rest.filter(isJoin) : [];
    rest = rest.filter((c) => !joinConds.includes(c));
    const base = joinConds.length ? rel.rows.filter((row) => joinConds.every((c) => cond(c, ctxOf(env, rel, row, outer)) === true)) : rel.rows;
    env.hier ??= new WeakMap();
    const info = env.hier;
    const relNow = rel;
    const nodes = buildHierarchy(base, cb, orderSiblings, {
      ctx: (row, hier) => ctxOf(env, relNow, row, outer, { hier }),
      cond: (e, c) => cond(e, c),
      evaluate: (e, c) => evaluate(e, c),
      sortCompare: compareForSort,
      checkTime,
    }, info);
    rel = { ...rel, rows: nodes };
  }
  const where = rest.length ? rest.reduce((a, b): Expr => ({ type: 'and', left: a, right: b, start: a.start, end: b.end })) : undefined;
  const filtered: Value[][] = [];
  const deadline = env.work?.deadline;
  for (let i = 0; i < rel.rows.length; i++) {
    if (deadline && (i & 63) === 0 && Date.now() > deadline) throw tooSlow();
    const row = rel.rows[i];
    if (!where || cond(where, ctxOf(env, rel, row, outer, { rownum: filtered.length + 1 })) === true) filtered.push(row);
  }

  const aliasMap = new Map(cols.filter((c) => c.alias).map((c) => [c.alias!, c]));
  const orderExprs = (orderBy ?? []).map((o) => (isAliasRef(o.expr, aliasMap) ? o.expr : substituteAliases(o.expr, aliasMap)));
  const orderAgg = (orderBy ?? []).some((o, i) => !isAliasRef(o.expr, aliasMap) && containsAggregate(orderExprs[i]));
  const grouped = !!q.groupBy || cols.some((c) => containsAggregate(c.expr)) || !!q.having || orderAgg;

  // SELECT·ORDER BY 에 나온 윈도우 함수(값은 행 문맥이 다 모인 뒤 한 번에 계산한다)
  const windowFns = [...cols.flatMap((c) => windowsIn(c.expr)), ...orderExprs.flatMap((e) => windowsIn(e))];
  windowFns.forEach(checkWindowSpec);
  const finish = (ctxs: EvalCtx[]): BlockRow[] => {
    if (windowFns.length) {
      const maps = ctxs.map(() => new Map<string, Value>());
      const done = new Set<string>();
      for (const w of windowFns) {
        const k = windowKey(w);
        if (done.has(k)) continue;
        done.add(k);
        const vals = computeWindow(w, ctxs, { evaluate: (e, c) => evaluate(e, c), sortCompare: compareForSort, checkTime });
        vals.forEach((v, i) => maps[i].set(k, v));
      }
      ctxs.forEach((c, i) => (c.windowValues = maps[i]));
    }
    return ctxs.map((ctx) => ({ values: cols.map((c) => evaluate(c.expr, ctx)), ctx }));
  };

  if (!grouped) {
    const rows = finish(filtered.map((row, i) => ctxOf(env, rel, row, outer, { rownum: i + 1 })));
    return { columns: cols.map((c) => c.name), rows, cols };
  }

  const groupExprs = q.groupBy ?? [];
  const keys = new Set(groupExprs.map((g) => exprKey(g, rel)));
  const hasGroupBy = groupExprs.length > 0 || !!q.groupingSets;
  cols.forEach((c) => checkGrouped(c.expr, keys, rel, hasGroupBy, outer));
  if (q.having) checkGrouped(q.having, keys, rel, hasGroupBy, outer);
  (orderBy ?? []).forEach((o, i) => {
    if (isAliasRef(o.expr, aliasMap) || o.expr.type === 'lit') return;
    // 묶음 집합(ROLLUP 등)이나 별칭을 거쳐 집계가 겹치면 Oracle 은 ORA-00934 를 낸다.
    if (q.groupingSets && nestedGroupFn(orderExprs[i])) throw new OraError('ORA-00934', 'group function is not allowed here');
    checkGrouped(orderExprs[i], keys, rel, hasGroupBy, outer);
  });

  // 묶음 목록: 보통 GROUP BY 는 하나, ROLLUP·CUBE·GROUPING SETS 는 여러 개(소계·총계).
  const sets = q.groupingSets ?? [groupExprs];
  if (sets.length * filtered.length > MAX_GROUP_WORK) {
    throw new NotSupported(`계산량(묶음 ${sets.length}개 × ${filtered.length.toLocaleString('en-US')}행)이 너무 커서 실행하지 않았어요. 조인을 줄이거나 ROLLUP·CUBE 의 인자를 줄여 보세요.`);
  }
  const groupSets = sets.map((set) => {
    const inSet = new Set(set.map((g) => exprKey(g, rel)));
    const rolled = new Set([...keys].filter((k) => !inSet.has(k)));
    const groups = new Map<string, Value[][]>();
    for (const row of filtered) {
      const ctx = ctxOf(env, rel, row, outer);
      const kk = JSON.stringify(set.map((g) => groupKey(evaluate(g, ctx))));
      if (!groups.has(kk)) groups.set(kk, []);
      groups.get(kk)!.push(row);
    }
    // GROUP BY 없는 집계와 총계 묶음(())은 행이 없어도 한 행을 낸다(COUNT(*) = 0).
    // Oracle: GROUP BY () 이거나 빈 묶음이 여러 개면, SELECT 에 집계가 있을 때만 빈 입력에서도 총계 행을 낸다.
    const emptySetsOnly = !!q.groupingSets && q.groupingSets.length > 1 && q.groupingSets.every((x) => x.length === 0);
    const totalOnEmpty = !hasGroupBy || ((q.grandTotalOnly || emptySetsOnly) && cols.some((c) => containsAggregate(c.expr)));
    if (set.length === 0 && groups.size === 0 && totalOnEmpty) groups.set('', []);
    const isRolledUp = rolled.size ? (e: Expr) => rolled.has(exprKey(e, rel)) : undefined;
    return { groups, isRolledUp };
  });
  const groups = groupSets[0].groups;

  // 집계를 두 번 겹친 쿼리(SELECT MAX(COUNT(*)) ... GROUP BY)는 묶음들을 다시 모아 한 행을 낸다.
  if (hasGroupBy && !q.groupingSets && cols.some((c) => isAggregate(c.expr) && c.expr.type === 'func' && c.expr.args.some(containsAggregate))) {
    const groupSet = [...groups.values()].map((members) => ctxOf(env, rel, members[0], outer, { group: members }));
    if (cols.some((c) => !(isAggregate(c.expr) && c.expr.type === 'func' && c.expr.args.some(containsAggregate)))) {
      throw new OraError('ORA-00937', 'not a single-group group function');
    }
    const ctx = ctxOf(env, rel, rel.cols.map(() => null), outer, { groupSet });
    return { columns: cols.map((c) => c.name), rows: [{ values: cols.map((c) => evaluate(c.expr, ctx)), ctx }], cols };
  }

  const groupCtxs: EvalCtx[] = [];
  for (const { groups: gs, isRolledUp } of groupSets) {
    for (const members of gs.values()) {
      const rep = members[0] ?? rel.cols.map(() => null);
      const ctx = ctxOf(env, rel, rep, outer, { group: members, isRolledUp, hasGroupBy });
      if (q.having && cond(q.having, ctx) !== true) continue;
      groupCtxs.push(ctx);
    }
  }
  const rows = finish(groupCtxs);
  // Oracle 의 GROUP BY 결과 순서는 보장되지 않는다(해시 묶음). 실습장은 묶음 키 오름차순으로 보여 준다.
  if (hasGroupBy && !orderBy) {
    rows.sort((a, b) => {
      for (const g of groupExprs) {
        const c = compareForSort(evaluate(g, a.ctx), evaluate(g, b.ctx), false, undefined);
        if (c) return c;
      }
      return 0;
    });
  }
  return { columns: cols.map((c) => c.name), rows, cols };
}

/**
 * ORDER BY 식 안의 SELECT 별칭을 그 식으로 바꾼다. Oracle 은 ORDER BY 에서 별칭을 열 이름보다 먼저 찾는다.
 * (SELECT DECODE(GROUPING(JOB), ...) AS JOB ... ORDER BY GROUPING(JOB) 의 JOB 은 별칭이라 ORA-00934 가 난다.)
 */
function substituteAliases(e: Expr, aliasMap: Map<string, OutCol>, dupes?: Set<string>): Expr {
  if (e.type === 'col' && !e.table && dupes?.has(e.name)) throw new OraError('ORA-00960', 'ambiguous column naming in select list');
  if (e.type === 'col' && !e.table && aliasMap.has(e.name)) return aliasMap.get(e.name)!.expr;
  if (e.type === 'subquery' || e.type === 'exists' || e.type === 'insub' || e.type === 'cmpsub') return e;
  const out: Record<string, unknown> = { ...e };
  for (const [k, v] of Object.entries(e)) {
    if (Array.isArray(v)) out[k] = v.map((x) => (x && typeof x === 'object' && 'type' in x ? substituteAliases(x as Expr, aliasMap, dupes) : x && typeof x === 'object' && 'when' in x ? { when: substituteAliases(x.when, aliasMap, dupes), then: substituteAliases(x.then, aliasMap, dupes) } : x));
    else if (v && typeof v === 'object' && 'type' in v && k !== 'query') out[k] = substituteAliases(v as Expr, aliasMap, dupes);
  }
  return out as unknown as Expr;
}

/** 집계 함수의 인자에 또 집계(또는 GROUPING)가 들어 있는가 */
function nestedGroupFn(e: Expr): boolean {
  if (isAggregate(e) && e.type === 'func' && e.args.some(containsAggregate)) return true;
  return children(e).some(nestedGroupFn);
}

function isAliasRef(e: Expr, aliasMap: Map<string, OutCol>): boolean {
  return e.type === 'col' && !e.table && aliasMap.has(e.name);
}

/** Oracle 정렬: NULL 은 가장 큰 값(ASC 이면 맨 뒤, DESC 이면 맨 앞). NULLS FIRST/LAST 로 바꾼다. */
function compareForSort(a: Value, b: Value, desc: boolean, nulls: 'FIRST' | 'LAST' | undefined): number {
  const nullsFirst = nulls ? nulls === 'FIRST' : desc;
  if (a === null && b === null) return 0;
  if (a === null) return nullsFirst ? -1 : 1;
  if (b === null) return nullsFirst ? 1 : -1;
  const c = compare(a, b) ?? 0;
  return desc ? -c : c;
}

function dedupe<T extends { values: Value[] }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = JSON.stringify(r.values.map(groupKey));
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function orderBlockRows(env: Env, q: QueryBlock, cols: OutCol[], rows: BlockRow[], orderBy: OrderItem[]): BlockRow[] {
  const aliasCount = new Map<string, number>();
  cols.forEach((c) => aliasCount.set(c.name, (aliasCount.get(c.name) ?? 0) + 1));
  const keyOf = (o: OrderItem): ((r: BlockRow) => Value) => {
    const e = o.expr;
    if (e.type === 'lit' && typeof e.value === 'number') {
      const pos = e.value;
      if (!Number.isInteger(pos) || pos < 1 || pos > cols.length) throw new OraError('ORA-01785', 'ORDER BY item must be the number of a SELECT-list expression');
      return (r) => r.values[pos - 1];
    }
    if (e.type === 'col' && !e.table) {
      const idx = cols.findIndex((c) => c.alias === e.name);
      if (idx >= 0) {
        if ((aliasCount.get(e.name) ?? 0) > 1) throw new OraError('ORA-00960', 'ambiguous column naming in select list');
        return (r) => r.values[idx];
      }
    }
    if (q.distinct) {
      const rel = rows[0]?.ctx.rel;
      const idx = rel ? cols.findIndex((c) => exprKey(c.expr, rel) === exprKey(e, rel)) : cols.findIndex((c) => JSON.stringify(stripSpan(c.expr)) === JSON.stringify(stripSpan(e)));
      if (idx < 0) throw new OraError('ORA-01791', 'not a SELECTed expression');
      return (r) => r.values[idx];
    }
    const aliasMap = new Map(cols.filter((c) => c.alias).map((c) => [c.alias!, c]));
    const dupes = new Set([...aliasCount].filter(([, n]) => n > 1).map(([name]) => name));
    const resolved = substituteAliases(e, aliasMap, dupes);
    return (r) => evaluate(resolved, r.ctx);
  };
  const keys = orderBy.map((o) => ({ o, key: keyOf(o) }));
  const decorated = rows.map((r) => ({ r, k: keys.map(({ key }) => key(r)) }));
  decorated.sort((a, b) => {
    for (let i = 0; i < keys.length; i++) {
      const c = compareForSort(a.k[i], b.k[i], keys[i].o.desc, keys[i].o.nulls);
      if (c) return c;
    }
    return 0;
  });
  void env;
  return decorated.map((d) => ({ ...d.r, sortKey: d.k }));
}

function stripSpan(e: Expr) {
  return JSON.parse(JSON.stringify(e, (k, v) => (k === 'start' || k === 'end' ? undefined : v)));
}

/** DISTINCT 쿼리의 ORDER BY 가 이름 검사에서 빠지지 않도록, 행이 없어도 검사를 한 번 돈다. */
function checkOrderNames(q: QueryBlock, cols: OutCol[], orderBy: OrderItem[], rel: Relation | undefined, outer: EvalCtx | undefined) {
  if (!rel) return;
  for (const o of orderBy) {
    const e = o.expr;
    if (e.type === 'lit') continue;
    if (e.type === 'col' && !e.table && cols.some((c) => c.alias === e.name)) continue;
    const aliasMap = new Map(cols.filter((c) => c.alias).map((c) => [c.alias!, c]));
    checkNames(substituteAliases(e, aliasMap), rel, outer);
  }
  void q;
}

// ── 바깥 SELECT ──────────────────────────────────────────────────────────────

export function runSelect(baseEnv: Env, sel: Select, outer?: EvalCtx): ResultSet {
  let env = baseEnv;
  if (sel.with) {
    // 앞에 정의한 이름은 뒤의 정의와 본문에서 쓸 수 있다.
    const ctes = new Map(baseEnv.ctes);
    env = { ...baseEnv, ctes };
    for (const w of sel.with) ctes.set(w.name, { columns: w.columns, query: w.query, env: { ...env, ctes: new Map(ctes) } });
    // 본문에서 쓰지 않는 WITH 원소도 이름 오류는 Oracle 처럼 실행 전에 낸다.
    for (const w of sel.with) {
      const cte = ctes.get(w.name)!;
      try {
        const rs = runSelect({ ...cte.env, work: { rows: 0, deadline: precheckDeadline(env) } }, cte.query);
        if (cte.columns && cte.columns.length !== rs.columns.length) {
          throw new OraError('ORA-32038', 'number of WITH clause column names does not match number of elements in select list');
        }
      } catch (err) {
        // Oracle 이 실행 전에 내는 것은 이름·구조 오류뿐이다. 0 으로 나누기 같은 실행 오류는 그 WITH 를 실제로 읽을 때만 난다.
        if (err instanceof OraError && NAME_ERRORS.has(err.code)) throw err;
      }
    }
  }
  let result: ResultSet;
  if (sel.body.type === 'query') {
    const q = sel.body;
    const block = runBlock(env, q, sel.orderBy, outer, sel.orderSiblings);
    let rows = block.rows;
    if (q.distinct) rows = dedupe(rows);
    if (sel.orderBy) {
      const rel = rows[0]?.ctx.rel ?? buildFrom(env, q, outer).rel;
      checkOrderNames(q, block.cols, sel.orderBy, rel, outer);
      if (q.distinct && rows.length === 0) {
        // 행이 없어도 ORA-01791 은 난다.
        orderBlockRows(env, q, block.cols, [{ values: block.cols.map(() => null), ctx: ctxOf(env, rel, rel.cols.map(() => null), outer) }], sel.orderBy);
      }
      rows = orderBlockRows(env, q, block.cols, rows, sel.orderBy);
    }
    result = { columns: block.columns, rows: rows.map((r) => r.values) };
    if (sel.fetch?.withTies && sel.orderBy) result.sortKeys = rows.map((r) => r.sortKey ?? []);
  } else {
    if (sel.orderSiblings) throw new OraError('ORA-30929', 'ORDER SIBLINGS BY clause not allowed here');
    result = runSetOp(env, sel, outer);
  }
  if (sel.fetch) result = applyFetch(env, result, sel.fetch, outer);
  return result;
}

function runSetOp(env: Env, sel: Select, outer: EvalCtx | undefined): ResultSet {
  const body = sel.body;
  if (body.type !== 'set') throw new Error('unreachable');
  const left = runSelect(env, body.left, outer);
  const right = runSelect(env, body.right, outer);
  if (left.columns.length !== right.columns.length) throw new OraError('ORA-01789', 'query block has incorrect number of result columns');
  for (let i = 0; i < left.columns.length; i++) {
    const a = left.rows.find((r) => r[i] !== null)?.[i] ?? null;
    const b = right.rows.find((r) => r[i] !== null)?.[i] ?? null;
    if (a !== null && b !== null && kindOf(a) !== kindOf(b)) throw new OraError('ORA-01790', 'expression must have same datatype as corresponding expression');
  }
  const wrap = (rows: Value[][]) => rows.map((values) => ({ values }));
  let rows: { values: Value[] }[];
  const keyOf = (r: Value[]) => JSON.stringify(r.map(groupKey));
  if (body.op === 'UNION ALL') rows = wrap([...left.rows, ...right.rows]);
  else if (body.op === 'UNION') rows = sortAll(dedupe(wrap([...left.rows, ...right.rows])));
  else if (body.op === 'INTERSECT') {
    const r = new Set(right.rows.map(keyOf));
    rows = sortAll(dedupe(wrap(left.rows.filter((x) => r.has(keyOf(x))))));
  } else {
    const r = new Set(right.rows.map(keyOf));
    rows = sortAll(dedupe(wrap(left.rows.filter((x) => !r.has(keyOf(x))))));
  }
  if (sel.orderBy) {
    const keys = sel.orderBy.map((o) => {
      const e = o.expr;
      let idx = -1;
      if (e.type === 'lit' && typeof e.value === 'number') {
        idx = e.value - 1;
        if (!Number.isInteger(e.value) || idx < 0 || idx >= left.columns.length) throw new OraError('ORA-01785', 'ORDER BY item must be the number of a SELECT-list expression');
      } else if (e.type === 'col' && !e.table) idx = left.columns.indexOf(e.name);
      if (idx < 0 && e.type !== 'col') throw new OraError('ORA-01785', 'ORDER BY item must be the number of a SELECT-list expression');
      if (idx < 0 && e.type === 'col') throw new OraError('ORA-00904', `"${e.name}": invalid identifier`);
      return { idx, o };
    });
    rows.sort((a, b) => {
      for (const { idx, o } of keys) {
        const c = compareForSort(a.values[idx], b.values[idx], o.desc, o.nulls);
        if (c) return c;
      }
      return 0;
    });
  }
  return { columns: left.columns, rows: rows.map((r) => r.values) };
}

/** 정렬 기반 중복 제거를 흉내 내 집합 연산 결과를 열 순서대로 정렬한다. */
function sortAll<T extends { values: Value[] }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    for (let i = 0; i < a.values.length; i++) {
      const c = compareForSort(a.values[i], b.values[i], false, undefined);
      if (c) return c;
    }
    return 0;
  });
}

function applyFetch(env: Env, rs: ResultSet, f: NonNullable<Select['fetch']>, outer: EvalCtx | undefined): ResultSet {
  let rows = rs.rows.slice(f.offset);
  const keys = rs.sortKeys?.slice(f.offset);
  if (f.count) {
    const v = evaluate(f.count, ctxOf(env, emptyRelation(), [], outer));
    const n = typeof v === 'number' ? v : 0;
    let take = Math.max(0, f.percent ? Math.ceil((rs.rows.length * n) / 100) : Math.floor(n));
    // WITH TIES: 마지막 행과 ORDER BY 키가 같은 행까지 이어 붙인다.
    if (f.withTies && keys && take > 0 && take < rows.length) {
      const last = JSON.stringify(keys[take - 1].map(groupKey));
      while (take < rows.length && JSON.stringify(keys[take].map(groupKey)) === last) take++;
    }
    rows = rows.slice(0, take);
  }
  return { columns: rs.columns, rows };
}

export { AGGREGATES };
