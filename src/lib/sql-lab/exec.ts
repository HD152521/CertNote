// SELECT 실행: FROM(조인) → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → FETCH.
// 이름 오류(ORA-00904·00918)와 GROUP BY 규칙(00937·00979·00934)은 행이 없어도 Oracle 처럼 먼저 검사한다.
import type { Expr, FromItem, OrderItem, QueryBlock, Select, SelectItem } from './ast';
import type { Database } from './data';
import { AGGREGATES, callFunctionName, children, cond, containsAggregate, evaluate, isAggregate, lookupColumn, type EvalCtx } from './eval';
import { FUNCTIONS } from './functions';
import { emptyRelation, invalidIdentifier, joinRelations, joinShape, mergeColumns, resolveColumn, type Relation } from './relation';
import { NotSupported, OraError, compare, groupKey, kindOf, type Value } from './values';

export interface ResultSet {
  columns: string[];
  rows: Value[][];
}

interface Env {
  db: Database;
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
  if (e.type === 'func' && !AGGREGATES.has(e.name) && !FUNCTIONS[e.name]) callFunctionName(e.name);
  // 서브쿼리 안쪽 이름도 바깥 행 없이 미리 검사한다(행이 없거나 AND 가 단락돼도 Oracle 은 ORA-00904 를 낸다).
  if (env && (e.type === 'subquery' || e.type === 'insub' || e.type === 'exists' || e.type === 'cmpsub')) {
    runSelect(env, e.query, probe());
  }
  children(e).forEach((c) => checkNames(c, rel, outer, env));
}

/** 식을 비교용 문자열로: 열은 해석한 위치로 바꿔 e.DEPTNO 와 DEPTNO 를 같게 본다. */
function exprKey(e: Expr, rel: Relation): string {
  return JSON.stringify(e, (k, v) => {
    if (k === 'start' || k === 'end') return undefined;
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
  if (e.type === 'rownum') {
    if (!hasGroupBy) throw new OraError('ORA-00937', 'not a single-group group function');
    throw new OraError('ORA-00979', 'ROWNUM: must appear in the GROUP BY clause or be used in an aggregate function');
  }
  void outer;
  children(e).forEach((c) => checkGrouped(c, groupKeys, rel, hasGroupBy, outer));
}

function noAggregate(e: Expr | undefined) {
  if (e && containsAggregate(e)) throw new OraError('ORA-00934', 'group function is not allowed here');
}

// ── FROM ─────────────────────────────────────────────────────────────────────

function tableRelation(env: Env, item: Extract<FromItem, { type: 'table' }>): Relation {
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
      cols: rs.columns.map((name) => ({ qual, name })),
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
  return { rel, row, outer, src: env.src, runSubquery: (q, o) => runSubquery(env, q, o), ...extra };
}

function runSubquery(env: Env, q: Select, outer: EvalCtx) {
  const rs = runSelect(env, q, outer);
  return { rows: rs.rows, width: rs.columns.length };
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
        out.push({ name: c.name, expr: { type: 'col', table: c.qual ?? undefined, name: c.name, start: i, end: i } as Expr });
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
}

function runBlock(env: Env, q: QueryBlock, orderBy: OrderItem[] | undefined, outer: EvalCtx | undefined): { columns: string[]; rows: BlockRow[]; cols: OutCol[] } {
  const { rel, rest } = buildFrom(env, q, outer);
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

  const where = rest.length ? rest.reduce((a, b): Expr => ({ type: 'and', left: a, right: b, start: a.start, end: b.end })) : undefined;
  const filtered: Value[][] = [];
  for (const row of rel.rows) {
    if (!where || cond(where, ctxOf(env, rel, row, outer, { rownum: filtered.length + 1 })) === true) filtered.push(row);
  }

  const aliasMap = new Map(cols.filter((c) => c.alias).map((c) => [c.alias!, c]));
  const orderAgg = (orderBy ?? []).some((o) => !isAliasRef(o.expr, aliasMap) && containsAggregate(o.expr));
  const grouped = !!q.groupBy || cols.some((c) => containsAggregate(c.expr)) || !!q.having || orderAgg;

  if (!grouped) {
    const rows = filtered.map((row, i) => {
      const ctx = ctxOf(env, rel, row, outer, { rownum: i + 1 });
      return { values: cols.map((c) => evaluate(c.expr, ctx)), ctx };
    });
    return { columns: cols.map((c) => c.name), rows, cols };
  }

  const groupExprs = q.groupBy ?? [];
  const keys = new Set(groupExprs.map((g) => exprKey(g, rel)));
  const hasGroupBy = groupExprs.length > 0;
  cols.forEach((c) => checkGrouped(c.expr, keys, rel, hasGroupBy, outer));
  if (q.having) checkGrouped(q.having, keys, rel, hasGroupBy, outer);
  for (const o of orderBy ?? []) if (!isAliasRef(o.expr, aliasMap) && o.expr.type !== 'lit') checkGrouped(o.expr, keys, rel, hasGroupBy, outer);

  const groups = new Map<string, Value[][]>();
  for (const row of filtered) {
    const ctx = ctxOf(env, rel, row, outer);
    const k = groupExprs.map((g) => groupKey(evaluate(g, ctx)));
    const kk = JSON.stringify(k);
    if (!groups.has(kk)) groups.set(kk, []);
    groups.get(kk)!.push(row);
  }
  // GROUP BY 없는 집계는 행이 없어도 한 행을 낸다(COUNT(*) = 0).
  if (!hasGroupBy && groups.size === 0) groups.set('', []);

  // 집계를 두 번 겹친 쿼리(SELECT MAX(COUNT(*)) ... GROUP BY)는 묶음들을 다시 모아 한 행을 낸다.
  if (hasGroupBy && cols.some((c) => isAggregate(c.expr) && c.expr.type === 'func' && c.expr.args.some(containsAggregate))) {
    const groupSet = [...groups.values()].map((members) => ctxOf(env, rel, members[0], outer, { group: members }));
    if (cols.some((c) => !(isAggregate(c.expr) && c.expr.type === 'func' && c.expr.args.some(containsAggregate)))) {
      throw new OraError('ORA-00937', 'not a single-group group function');
    }
    const ctx = ctxOf(env, rel, rel.cols.map(() => null), outer, { groupSet });
    return { columns: cols.map((c) => c.name), rows: [{ values: cols.map((c) => evaluate(c.expr, ctx)), ctx }], cols };
  }

  const rows: BlockRow[] = [];
  for (const members of groups.values()) {
    const rep = members[0] ?? rel.cols.map(() => null);
    const ctx = ctxOf(env, rel, rep, outer, { group: members });
    if (q.having && cond(q.having, ctx) !== true) continue;
    rows.push({ values: cols.map((c) => evaluate(c.expr, ctx)), ctx });
  }
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
    return (r) => evaluate(e, r.ctx);
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
  return decorated.map((d) => d.r);
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
    checkNames(e, rel, outer);
  }
  void q;
}

// ── 바깥 SELECT ──────────────────────────────────────────────────────────────

export function runSelect(env: Env, sel: Select, outer?: EvalCtx): ResultSet {
  let result: ResultSet;
  if (sel.body.type === 'query') {
    const q = sel.body;
    const block = runBlock(env, q, sel.orderBy, outer);
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
  } else {
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
      if (idx < 0) throw new OraError('ORA-00904', e.type === 'col' ? `"${e.name}": invalid identifier` : '"ORDER BY": invalid identifier');
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
  if (f.count) {
    const v = evaluate(f.count, ctxOf(env, emptyRelation(), [], outer));
    const n = typeof v === 'number' ? v : 0;
    const take = f.percent ? Math.ceil((rs.rows.length * n) / 100) : Math.floor(n);
    if (f.withTies) throw new NotSupported('WITH TIES 는 실습장 2단계에서 열려요.');
    rows = rows.slice(0, Math.max(0, take));
  }
  return { ...rs, rows };
}

export { AGGREGATES };
