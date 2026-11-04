// DML·DDL·TCL 실행. 세션 하나가 작업 중인 DB 와 마지막으로 COMMIT 한 DB, SAVEPOINT 목록을 들고 있다.
// 문장이 실패하면 그 문장만 되돌린다(Oracle 의 문장 단위 롤백). DDL 은 앞뒤로 암묵적 COMMIT 을 한다.
import type { Expr, Select } from './ast';
import { cloneDatabase, columnFromSpec, type Column, type Constraint, type Database, type Table } from './data';
import { roundTo } from './functions';
import { tokenize } from './lexer';
import { cond, evaluate, type EvalCtx } from './eval';
import { checkNames, ctxOf, fromItemRelation, runSelect, tableRelation, type Env } from './exec';
import { emptyRelation, joinShape, type Relation } from './relation';
import { DEFAULT_MARK, type ColumnDef, type InlineConstraint, type SetClause, type Statement, type TableConstraintDef } from './statements';
import { NotSupported, OraError, SqlDate, compare, groupKey, numberToText, parseDefaultDate, toNumber, toText, type Value } from './values';

export interface Session {
  db: Database;
  committed: Database;
  savepoints: { name: string; db: Database }[];
  /** 이름 없는 제약 조건에 붙일 번호(SYS_C…) */
  seq: number;
}

export function newSession(db: Database): Session {
  return { db, committed: cloneDatabase(db), savepoints: [], seq: 8700 };
}

const rowsText = (n: number, verb: string) => `${n} ${n === 1 ? 'row' : 'rows'} ${verb}.`;
const q = (t: string, c?: string) => (c ? `"SCOTT"."${t}"."${c}"` : `"SCOTT"."${t}"`);

function table(db: Database, name: string): Table {
  const t = db[name];
  if (!t || name === 'DUAL') throw new OraError('ORA-00942', `table or view "SCOTT"."${name}" does not exist`);
  return t;
}

function baseTable(db: Database, name: string): Table {
  const t = table(db, name);
  if (t.view) throw new NotSupported('뷰를 통한 INSERT·UPDATE·DELETE 는 실습장에서 아직 지원하지 않아요. 기반 테이블에 직접 실행해 주세요.');
  return t;
}

// ── 값 맞추기(자료형·길이·정밀도) ─────────────────────────────────────────────

export function coerce(t: Table, c: Column, v: Value): Value {
  if (v === null || v === '') return null;
  if (c.type === 'NUMBER') {
    let n = toNumber(v instanceof SqlDate ? (() => { throw new OraError('ORA-00932', 'inconsistent datatypes: expected NUMBER got DATE'); })() : v)!;
    if (c.precision !== undefined) {
      const s = c.scale ?? 0;
      n = roundTo(n, s, 'round'); // 반값은 0 에서 먼 쪽으로(-2.5 → -3)
      if (Math.abs(n) >= 10 ** (c.precision - s)) {
        throw new OraError('ORA-01438', `value ${numberToText(Number(toNumber(v)))} greater than specified precision (${c.precision}, ${s}) for column`);
      }
    }
    return n;
  }
  if (c.type === 'DATE') {
    if (v instanceof SqlDate) return v;
    if (typeof v === 'number') throw new OraError('ORA-00932', 'inconsistent datatypes: expected DATE got NUMBER');
    return parseDefaultDate(v);
  }
  let s = toText(v)!;
  const len = new TextEncoder().encode(s).length;
  if (c.length !== undefined && len > c.length) {
    throw new OraError('ORA-12899', `value too large for column ${q(t.name, c.name)} (actual: ${len}, maximum: ${c.length})`);
  }
  if (c.fixed && c.length !== undefined) s = s.padEnd(c.length, ' ');
  return s;
}

// ── 제약 조건 ─────────────────────────────────────────────────────────────────

/** 한 테이블의 행 전체가 제약 조건을 지키는지 본다(행을 바꾼 뒤에). */
function checkConstraints(db: Database, t: Table, rows: Value[][], changed: Set<number>, verb: 'insert' | 'update', env: Env) {
  const idx = (c: string) => t.columns.findIndex((x) => x.name === c);
  for (const r of changed) {
    t.columns.forEach((c, i) => {
      if (!c.nullable && rows[r][i] === null) {
        throw verb === 'insert'
          ? new OraError('ORA-01400', `cannot insert NULL into (${q(t.name, c.name)})`)
          : new OraError('ORA-01407', `cannot update (${q(t.name, c.name)}) to NULL`);
      }
    });
  }
  let counts: Map<string, number> | undefined;
  for (const k of t.constraints ?? []) {
    const cols = k.columns.map(idx);
    if (k.kind === 'P' || k.kind === 'U') {
      for (const r of changed) {
        const key = cols.map((i) => rows[r][i]);
        if (k.kind === 'P' && key.some((v) => v === null)) {
          const ci = cols[key.findIndex((v) => v === null)];
          throw verb === 'insert'
            ? new OraError('ORA-01400', `cannot insert NULL into (${q(t.name, t.columns[ci].name)})`)
            : new OraError('ORA-01407', `cannot update (${q(t.name, t.columns[ci].name)}) to NULL`);
        }
        if (key.every((v) => v === null)) continue;
        const kk = JSON.stringify(key.map(groupKey));
        if ((counts ??= keyCounts(rows, cols)).get(kk)! > 1) {
          throw new OraError('ORA-00001', `unique constraint (SCOTT.${k.name}) violated on table SCOTT.${t.name} columns (${k.columns.join(', ')})`);
        }
      }
      counts = undefined;
    } else if (k.kind === 'C' && k.check) {
      const rel = relationOf(t, rows);
      for (const r of changed) {
        if (cond(k.check, ctxOf(env, rel, rows[r], undefined)) === false) throw new OraError('ORA-02290', `check constraint (SCOTT.${k.name}) violated`);
      }
    } else if (k.kind === 'R') {
      const parent = db[k.refTable!];
      if (!parent) continue;
      const pcols = (k.refColumns ?? primaryKeyOf(parent)).map((c) => parent.columns.findIndex((x) => x.name === c));
      const parentKeys = new Set((parent === t ? rows : parent.rows).map((row) => JSON.stringify(pcols.map((i) => groupKey(row[i])))));
      for (const r of changed) {
        const key = cols.map((i) => rows[r][i]);
        if (key.some((v) => v === null)) continue;
        if (!parentKeys.has(JSON.stringify(key.map(groupKey)))) {
          throw new OraError('ORA-02291', `integrity constraint (SCOTT.${k.name}) violated - parent key not found`);
        }
      }
    }
  }
}

/** 키 → 그 키를 가진 행 수(모두 NULL 인 키는 세지 않는다) */
function keyCounts(rows: Value[][], cols: number[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of rows) {
    const key = cols.map((i) => row[i]);
    if (key.every((v) => v === null)) continue;
    const kk = JSON.stringify(key.map(groupKey));
    m.set(kk, (m.get(kk) ?? 0) + 1);
  }
  return m;
}

function primaryKeyOf(t: Table): string[] {
  return t.constraints?.find((k) => k.kind === 'P')?.columns ?? [];
}

/** 이 테이블을 부모로 가리키는 외래 키들 */
function childrenOf(db: Database, name: string): { child: Table; fk: Constraint }[] {
  return Object.values(db).flatMap((child) => (child.constraints ?? []).filter((k) => k.kind === 'R' && k.refTable === name).map((fk) => ({ child, fk })));
}

/** 부모 행을 지우거나 키를 바꾸기 전: 자식 행이 있으면 CASCADE·SET NULL·오류 */
/**
 * 부모 행들을 지운다. 지워질 행 집합을 고정점까지 넓힌다: ON DELETE CASCADE 자식은 함께 지우고(여러 단계, 자기 참조 포함),
 * SET NULL 자식은 외래 키 열을 비운다. 같은 문장에서 함께 지워지는 자식은 위반이 아니다. 그 밖의 자식이 남으면 ORA-02292.
 */
function deleteRows(db: Database, start: Table, startRows: Value[][]) {
  const doomed = new Map<string, Set<Value[]>>([[start.name, new Set(startRows)]]);
  const nulls: { row: Value[]; cols: number[] }[] = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pname, removed] of [...doomed]) {
      const parent = db[pname];
      for (const { child, fk } of childrenOf(db, pname)) {
        const pcols = (fk.refColumns ?? primaryKeyOf(parent)).map((c) => parent.columns.findIndex((x) => x.name === c));
        const keys = new Set([...removed].map((row) => JSON.stringify(pcols.map((i) => groupKey(row[i])))));
        const ccols = fk.columns.map((c) => child.columns.findIndex((x) => x.name === c));
        const gone = doomed.get(child.name) ?? new Set<Value[]>();
        for (const row of child.rows) {
          if (gone.has(row) || !keys.has(JSON.stringify(ccols.map((ci) => groupKey(row[ci]))))) continue;
          if (fk.onDelete === 'CASCADE') {
            gone.add(row);
            doomed.set(child.name, gone);
            grew = true;
          } else if (fk.onDelete === 'SET NULL') {
            if (!nulls.some((n) => n.row === row)) nulls.push({ row, cols: ccols });
          } else {
            throw new OraError('ORA-02292', `integrity constraint (SCOTT.${fk.name}) violated - child record found`);
          }
        }
      }
    }
  }
  for (const { row, cols } of nulls) for (const ci of cols) row[ci] = null;
  for (const [name, rows] of doomed) db[name].rows = db[name].rows.filter((r) => !rows.has(r));
}

/** 부모 키를 바꾸기 전: 그 키를 가리키는 자식이 있으면 ORA-02292(Oracle 에는 ON UPDATE CASCADE 가 없다). */
function checkParentKeyUpdate(db: Database, parent: Table, oldRows: Value[][]) {
  for (const { child, fk } of childrenOf(db, parent.name)) {
    const pcols = (fk.refColumns ?? primaryKeyOf(parent)).map((c) => parent.columns.findIndex((x) => x.name === c));
    const keys = new Set(oldRows.map((row) => JSON.stringify(pcols.map((i) => groupKey(row[i])))));
    const ccols = fk.columns.map((c) => child.columns.findIndex((x) => x.name === c));
    if (child.rows.some((row) => keys.has(JSON.stringify(ccols.map((ci) => groupKey(row[ci])))))) {
      throw new OraError('ORA-02292', `integrity constraint (SCOTT.${fk.name}) violated - child record found`);
    }
  }
}

function checkDeadline(env: Env) {
  if (env.work?.deadline && Date.now() > env.work.deadline) {
    throw new NotSupported('실행이 3초를 넘어서 멈췄어요. 큰 테이블에서 행마다 서브쿼리나 MERGE 의 ON 조건을 다시 계산하고 있는지 확인해 보세요. (이 문장은 취소됐어요.)');
  }
}

function relationOf(t: Table, rows: Value[][], alias?: string): Relation {
  const qual = alias ?? t.name;
  return { cols: t.columns.map((c) => ({ qual, name: c.name, type: c.type, ...(c.fixed ? { fixed: true } : {}) })), rows, banned: new Map(), quals: new Set([qual]) };
}

// ── 실행 ─────────────────────────────────────────────────────────────────────

export type ExecResult = { kind: 'rows'; columns: string[]; rows: Value[][] } | { kind: 'message'; message: string } | { kind: 'note'; message: string };

export function executeStatement(st: Statement, session: Session, src: string, deadline: number): ExecResult {
  const envOf = (db: Database): Env => ({ db, src, work: { rows: 0, deadline } });
  if (st.type === 'select') {
    const rs = runSelect(envOf(session.db), st.query);
    return { kind: 'rows', columns: rs.columns, rows: rs.rows };
  }
  if (st.type === 'commit') {
    session.committed = cloneDatabase(session.db);
    session.savepoints = [];
    return { kind: 'message', message: 'Commit complete.' };
  }
  if (st.type === 'rollback') {
    if (st.to) {
      const k = session.savepoints.findIndex((s) => s.name === st.to);
      if (k < 0) throw new OraError('ORA-01086', `savepoint '${st.to}' never established in this session or is invalid`);
      session.db = cloneDatabase(session.savepoints[k].db);
      session.savepoints = session.savepoints.slice(0, k + 1);
      return { kind: 'message', message: 'Rollback complete.' };
    }
    session.db = cloneDatabase(session.committed);
    session.savepoints = [];
    return { kind: 'message', message: 'Rollback complete.' };
  }
  if (st.type === 'savepoint') {
    // 같은 이름을 다시 만들면 앞의 것을 지우고 새로 둔다.
    session.savepoints = session.savepoints.filter((s) => s.name !== st.name);
    session.savepoints.push({ name: st.name, db: cloneDatabase(session.db) });
    return { kind: 'message', message: 'Savepoint created.' };
  }
  if (st.type === 'dcl') {
    if (st.verb === 'FLASHBACK' || st.verb === 'PURGE') {
      return {
        kind: 'note',
        message: `${st.verb} 는 휴지통(RECYCLEBIN)이 있는 실제 Oracle 에서만 동작해요. 실습장은 DROP 한 테이블을 휴지통에 두지 않아서 되살리기(FLASHBACK TABLE … TO BEFORE DROP)를 흉내 내지 않아요.`,
      };
    }
    return {
      kind: 'note',
      message: `${st.verb} 는 사용자·권한이 여럿인 실제 DB 에서만 의미가 있어서, 실습장(사용자 한 명)에서는 문법만 확인하고 실행하지 않아요.`,
    };
  }

  const isDdl = ['createTable', 'createTableAs', 'createView', 'dropTable', 'dropView', 'truncate', 'alter', 'rename'].includes(st.type);
  if (isDdl) {
    // DDL 은 실행 전에 지금까지의 작업을 COMMIT 한다(실패해도 그 COMMIT 은 남는다).
    session.committed = cloneDatabase(session.db);
    session.savepoints = [];
  }
  // 문장 단위 롤백: 복사본에서 실행하고 성공하면 바꿔 끼운다.
  const work = cloneDatabase(session.db);
  const out = runChange(st, work, session, envOf(work));
  session.db = work;
  if (isDdl) session.committed = cloneDatabase(work);
  return { kind: 'message', message: out };
}

function runChange(st: Statement, db: Database, session: Session, env: Env): string {
  switch (st.type) {
    case 'insert':
      return insert(st, db, env);
    case 'update':
      return rowsText(update(st, db, env), 'updated');
    case 'delete':
      return rowsText(del(st, db, env), 'deleted');
    case 'merge':
      return rowsText(merge(st, db, env), 'merged');
    case 'createTable':
      return createTable(st, db, session, env);
    case 'createTableAs':
      return createTableAs(st, db, session, env);
    case 'createView':
      return createView(st, db, env);
    case 'dropTable': {
      const t = table(db, st.name);
      if (t.view) throw new OraError('ORA-00942', `table or view "SCOTT"."${st.name}" does not exist`);
      const kids = childrenOf(db, st.name).filter(({ child }) => child.name !== st.name);
      if (kids.length && !st.cascade) throw new OraError('ORA-02449', 'unique/primary keys in table referenced by foreign keys');
      for (const { child, fk } of kids) child.constraints = child.constraints!.filter((k) => k !== fk);
      delete db[st.name];
      return 'Table dropped.';
    }
    case 'dropView': {
      const t = db[st.name];
      if (!t?.view) throw new OraError('ORA-00942', `table or view "SCOTT"."${st.name}" does not exist`);
      delete db[st.name];
      return 'View dropped.';
    }
    case 'truncate': {
      const t = baseTable(db, st.name);
      if (childrenOf(db, st.name).some(({ child }) => child.name !== st.name)) throw new OraError('ORA-02266', 'unique/primary keys in table referenced by enabled foreign keys');
      t.rows = [];
      return 'Table truncated.';
    }
    case 'rename': {
      const t = table(db, st.from);
      if (db[st.to]) throw new OraError('ORA-00955', 'name is already used by an existing object');
      delete db[st.from];
      t.name = st.to;
      db[st.to] = t;
      for (const other of Object.values(db)) for (const k of other.constraints ?? []) if (k.refTable === st.from) k.refTable = st.to;
      return 'Table renamed.';
    }
    case 'alter':
      return alter(st, db, session, env);
    default:
      throw new OraError('ORA-00900', 'invalid SQL statement');
  }
}

function columnIndex(t: Table, name: string): number {
  const i = t.columns.findIndex((c) => c.name === name);
  if (i < 0) throw new OraError('ORA-00904', `"${name}": invalid identifier`);
  return i;
}

function defaultValue(t: Table, c: Column, env: Env): Value {
  if (!c.default) return null;
  return coerce(t, c, evaluate(c.default, ctxOf(env, emptyRelation(), [], undefined)));
}

function insert(st: Extract<Statement, { type: 'insert' }>, db: Database, env: Env): string {
  const t = baseTable(db, st.table);
  const cols = st.columns ? st.columns.map((c) => columnIndex(t, c)) : t.columns.map((_, i) => i);
  let sources: Value[][];
  if (st.values) {
    if (st.values.length < cols.length) throw new OraError('ORA-00947', 'not enough values');
    if (st.values.length > cols.length) throw new OraError('ORA-00913', 'too many values');
    const ctx = ctxOf(env, emptyRelation(), [], undefined);
    st.values.forEach((e) => {
      if (e.type === 'col' && !e.table && !['SYSDATE', 'USER', 'CURRENT_DATE', 'SYSTIMESTAMP'].includes(e.name)) throw new OraError('ORA-00984', 'column not allowed here');
    });
    sources = [st.values.map((e) => (e.type === 'lit' && e.value === DEFAULT_MARK ? DEFAULT_MARK : evaluate(e, ctx)))];
  } else {
    const rs = runSelect(env, st.query!);
    if (rs.columns.length < cols.length) throw new OraError('ORA-00947', 'not enough values');
    if (rs.columns.length > cols.length) throw new OraError('ORA-00913', 'too many values');
    sources = rs.rows;
  }
  const rows = t.rows.map((r) => [...r]);
  const changed = new Set<number>();
  for (const src of sources) {
    const row: Value[] = t.columns.map((c) => defaultValue(t, c, env));
    cols.forEach((ci, k) => {
      const v = src[k];
      row[ci] = v === DEFAULT_MARK ? defaultValue(t, t.columns[ci], env) : coerce(t, t.columns[ci], v);
    });
    rows.push(row);
    changed.add(rows.length - 1);
  }
  checkConstraints(db, t, rows, changed, 'insert', env);
  t.rows = rows;
  return rowsText(sources.length, 'created');
}

/** SET 절의 새 값들을 계산한다(모든 행의 새 값을 원래 값으로 먼저 구한 뒤 한꺼번에 넣는다). */
function computeSets(t: Table, sets: SetClause[], ctx: EvalCtx, env: Env): [number, Value][] {
  const out: [number, Value][] = [];
  for (const s of sets) {
    if ('type' in s.value && (s.value as Expr).start !== undefined && !('body' in s.value)) {
      const e = s.value as Expr;
      const ci = columnIndex(t, s.columns[0]);
      out.push([ci, e.type === 'lit' && e.value === DEFAULT_MARK ? defaultValue(t, t.columns[ci], env) : coerce(t, t.columns[ci], evaluate(e, ctx))]);
    } else {
      const sub = ctx.runSubquery(s.value as Select, ctx);
      if (sub.width < s.columns.length) throw new OraError('ORA-00947', 'not enough values');
      if (sub.width > s.columns.length) throw new OraError('ORA-00913', 'too many values');
      if (sub.rows.length > 1) throw new OraError('ORA-01427', 'single-row subquery returns more than one row');
      s.columns.forEach((c, k) => {
        const ci = columnIndex(t, c);
        out.push([ci, coerce(t, t.columns[ci], sub.rows[0]?.[k] ?? null)]);
      });
    }
  }
  return out;
}

function matching(t: Table, alias: string | undefined, where: Expr | undefined, env: Env): { rel: Relation; hits: number[] } {
  const rel = relationOf(t, t.rows, alias);
  if (where) checkNames(where, rel, undefined, env);
  const hits: number[] = [];
  t.rows.forEach((row, i) => {
    if ((i & 63) === 0) checkDeadline(env);
    if (!where || cond(where, ctxOf(env, rel, row, undefined, { rownum: hits.length + 1 })) === true) hits.push(i);
  });
  return { rel, hits };
}

function update(st: Extract<Statement, { type: 'update' }>, db: Database, env: Env): number {
  const t = baseTable(db, st.table);
  const { rel, hits } = matching(t, st.alias, st.where, env);
  for (const s of st.sets) for (const c of s.columns) columnIndex(t, c);
  const newVals = hits.map((i, k) => {
    if ((k & 63) === 0) checkDeadline(env);
    return computeSets(t, st.sets, ctxOf(env, rel, t.rows[i], undefined, { rownum: k + 1 }), env);
  });
  const rows = t.rows.map((r) => [...r]);
  const pk = primaryKeyOf(t);
  const before = hits.map((i) => [...t.rows[i]]);
  hits.forEach((i, k) => newVals[k].forEach(([ci, v]) => (rows[i][ci] = v)));
  // 자식이 가리키는 부모 키를 바꾸면 ORA-02292
  if (pk.length) {
    const pki = pk.map((c) => columnIndex(t, c));
    const changed = hits.map((i, k) => (pki.some((ci) => compare(before[k][ci], rows[i][ci]) !== 0) ? before[k] : null)).filter((r): r is Value[] => r !== null);
    if (changed.length) checkParentKeyUpdate(db, t, changed);
  }
  checkConstraints(db, t, rows, new Set(hits), 'update', env);
  t.rows = rows;
  return hits.length;
}

function del(st: Extract<Statement, { type: 'delete' }>, db: Database, env: Env): number {
  const t = baseTable(db, st.table);
  const { hits } = matching(t, st.alias, st.where, env);
  deleteRows(db, t, hits.map((i) => t.rows[i]));
  return hits.length;
}

function merge(st: Extract<Statement, { type: 'merge' }>, db: Database, env: Env): number {
  const t = baseTable(db, st.table);
  const target = relationOf(t, t.rows, st.alias);
  const source = fromItemRelation(env, st.source, undefined);
  const both = joinShape(target, source);
  checkNames(st.on, both, undefined, env);
  const tq = st.alias ?? t.name;
  const onCols = columnRefs(st.on).filter((c) => (c.table ? c.table === tq : t.columns.some((x) => x.name === c.name) && !source.cols.some((x) => x.name === c.name)));
  for (const s2 of st.matched?.sets ?? []) {
    for (const col of s2.columns) {
      if (onCols.some((c) => c.name === col)) throw new OraError('ORA-38104', `Columns referenced in the ON Clause cannot be updated: "${tq}"."${col}"`);
    }
  }
  const rows = t.rows.map((r) => [...r]);
  const changed = new Set<number>();
  const matchedBy = new Map<number, number>();
  const deleted = new Set<number>();
  let count = 0;
  source.rows.forEach((srow, si) => {
    checkDeadline(env);
    const hits = t.rows.map((trow, ti) => (cond(st.on, ctxOf(env, both, [...trow, ...srow], undefined)) === true ? ti : -1)).filter((i) => i >= 0);
    if (hits.length) {
      if (!st.matched) return;
      for (const ti of hits) {
        if (matchedBy.has(ti)) throw new OraError('ORA-30926', 'unable to get a stable set of rows in the source tables');
        matchedBy.set(ti, si);
        const ctx = ctxOf(env, both, [...t.rows[ti], ...srow], undefined);
        if (st.matched.where && cond(st.matched.where, ctx) !== true) continue;
        computeSets(t, st.matched.sets, ctx, env).forEach(([ci, v]) => (rows[ti][ci] = v));
        changed.add(ti);
        count++;
        if (st.matched.deleteWhere && cond(st.matched.deleteWhere, ctxOf(env, both, [...rows[ti], ...srow], undefined)) === true) deleted.add(ti);
      }
    } else if (st.notMatched) {
      const ctx = ctxOf(env, both, [...t.columns.map(() => null), ...srow], undefined);
      if (st.notMatched.where && cond(st.notMatched.where, ctx) !== true) return;
      const cols = st.notMatched.columns ? st.notMatched.columns.map((c) => columnIndex(t, c)) : t.columns.map((_, i) => i);
      if (st.notMatched.values.length < cols.length) throw new OraError('ORA-00947', 'not enough values');
      if (st.notMatched.values.length > cols.length) throw new OraError('ORA-00913', 'too many values');
      const row: Value[] = t.columns.map((c) => defaultValue(t, c, env));
      cols.forEach((ci, k) => {
        const e = st.notMatched!.values[k];
        row[ci] = e.type === 'lit' && e.value === DEFAULT_MARK ? defaultValue(t, t.columns[ci], env) : coerce(t, t.columns[ci], evaluate(e, ctx));
      });
      rows.push(row);
      changed.add(rows.length - 1);
      count++;
    }
  });
  checkConstraints(db, t, rows, changed, 'update', env);
  t.rows = rows.filter((_, i) => !deleted.has(i));
  return count;
}

function columnRefs(e: unknown, out: { table?: string; name: string }[] = []): { table?: string; name: string }[] {
  if (!e || typeof e !== 'object') return out;
  const x = e as { type?: string; table?: string; name?: string };
  if (x.type === 'col' && x.name) out.push({ table: x.table, name: x.name });
  for (const [k, v] of Object.entries(e as Record<string, unknown>)) if (k !== 'query') (Array.isArray(v) ? v : [v]).forEach((y) => columnRefs(y, out));
  return out;
}

// ── DDL ─────────────────────────────────────────────────────────────────────

/** CTAS·뷰가 만들 열 이름 검사: 별칭 없는 식은 ORA-00998, 같은 이름은 ORA-00957 */
function checkResultNames(query: Select, names: string[], explicit: boolean) {
  const b = query.body;
  if (!explicit && b.type === 'query') {
    for (const it of b.items) {
      if (it.expr.type === 'star' || it.expr.type === 'col' || it.alias) continue;
      throw new OraError('ORA-00998', 'must name this expression with a column alias');
    }
  }
  if (new Set(names).size !== names.length) throw new OraError('ORA-00957', 'duplicate column name');
}

function nameUsed(db: Database, name: string) {
  if (db[name]) throw new OraError('ORA-00955', 'name is already used by an existing object');
}

function constraintFrom(session: Session, def: InlineConstraint, columns: string[], src = ''): Constraint | null {
  if (def.kind === 'N') return null;
  return {
    name: def.name ?? `SYS_C00${++session.seq}`,
    kind: def.kind,
    columns,
    ...(def.check ? { check: def.check, checkText: src.slice(def.check.start, def.check.end) } : {}),
    ...(def.refTable ? { refTable: def.refTable, refColumns: def.refColumns, onDelete: def.onDelete } : {}),
  };
}

function columnOf(def: ColumnDef, session: Session): Column {
  const c = columnFromSpec(def.name, def.spec, !def.notNull && !def.inline.some((k) => k.kind === 'P'));
  const nn = def.inline.find((k) => k.kind === 'N');
  return { ...c, ...(def.default ? { default: def.default } : {}), ...(nn ? { notNullName: nn.name ?? `SYS_C00${++session.seq}` } : {}) };
}

function validateForeignKey(db: Database, t: Table, k: Constraint) {
  if (k.kind !== 'R') return;
  const parent = k.refTable === t.name ? t : db[k.refTable!];
  if (!parent || parent.view) throw new OraError('ORA-00942', `table or view "SCOTT"."${k.refTable}" does not exist`);
  const pcols = k.refColumns ?? primaryKeyOf(parent);
  const hasKey = (parent.constraints ?? []).some((x) => (x.kind === 'P' || x.kind === 'U') && x.columns.join() === pcols.join());
  if (!pcols.length || !hasKey) throw new OraError('ORA-02270', 'no matching unique or primary key for this column-list');
}

function createTable(st: Extract<Statement, { type: 'createTable' }>, db: Database, session: Session, env: Env): string {
  nameUsed(db, st.name);
  const names = new Set<string>();
  for (const c of st.columns) {
    if (names.has(c.name)) throw new OraError('ORA-00957', 'duplicate column name');
    names.add(c.name);
  }
  const t: Table = { name: st.name, note: '', columns: st.columns.map((d) => columnOf(d, session)), rows: [], constraints: [] };
  for (const c of st.columns) for (const k of c.inline) {
    const made = constraintFrom(session, k, [c.name], env.src);
    if (made) t.constraints!.push(made);
  }
  for (const k of st.constraints) {
    k.columns.forEach((c) => columnIndex(t, c));
    const made = constraintFrom(session, k, k.columns, env.src);
    if (made) t.constraints!.push(made);
    if (k.kind === 'P') k.columns.forEach((c) => (t.columns[columnIndex(t, c)].nullable = false));
  }
  if (t.constraints!.filter((k) => k.kind === 'P').length > 1) throw new OraError('ORA-02260', 'table can have only one primary key');
  // CHECK 안의 열 이름 확인
  for (const k of t.constraints!) {
    if (k.check) checkNames(k.check, relationOf(t, []), undefined, env);
    validateForeignKey({ ...db, [t.name]: t }, t, k);
  }
  db[st.name] = t;
  return 'Table created.';
}

function createTableAs(st: Extract<Statement, { type: 'createTableAs' }>, db: Database, session: Session, env: Env): string {
  nameUsed(db, st.name);
  const rs = runSelect(env, st.query);
  const names = st.columns ?? rs.columns;
  if (names.length !== rs.columns.length) throw new OraError('ORA-01730', 'invalid number of column names specified');
  checkResultNames(st.query, names, !!st.columns);
  // 열 정의: 원본 테이블의 열을 그대로 가져온 것이면 자료형·NOT NULL 을 복사한다(다른 제약 조건은 복사하지 않는다).
  const b = st.query.body;
  const srcCols = names.map((name, i): Column => {
    const item = b.type === 'query' ? b.items[i] : undefined;
    const srcTable = b.type === 'query' && b.from.length === 1 && b.from[0].type === 'table' ? db[b.from[0].name] : undefined;
    const fromCol = srcTable && (item?.expr.type === 'col' || b.type === 'query' && b.items.some((x) => x.expr.type === 'star'))
      ? srcTable.columns.find((c) => c.name === rs.columns[i])
      : undefined;
    if (fromCol) {
      const { default: _d, notNullName, ...rest } = fromCol;
      void _d;
      return { ...rest, name, nullable: !notNullName, ...(notNullName ? { notNullName: `SYS_C00${++session.seq}` } : {}) };
    }
    const sample = rs.rows.find((r) => r[i] !== null)?.[i] ?? null;
    if (typeof sample === 'number') return columnFromSpec(name, 'NUMBER');
    if (sample instanceof SqlDate) return columnFromSpec(name, 'DATE');
    return columnFromSpec(name, 'VARCHAR2(4000)');
  });
  db[st.name] = { name: st.name, note: '', columns: srcCols, rows: rs.rows.map((r) => [...r]), constraints: [] };
  return 'Table created.';
}

function createView(st: Extract<Statement, { type: 'createView' }>, db: Database, env: Env): string {
  const old = db[st.name];
  if (old && !(old.view && st.replace)) throw new OraError('ORA-00955', 'name is already used by an existing object');
  const rs = runSelect(env, st.query);
  const names = st.columns ?? rs.columns;
  if (names.length !== rs.columns.length) throw new OraError('ORA-01730', 'invalid number of column names specified');
  checkResultNames(st.query, names, !!st.columns);
  db[st.name] = { name: st.name, note: '', columns: names.map((n) => columnFromSpec(n, 'VARCHAR2(4000)')), rows: [], view: st.query };
  return 'View created.';
}

function alter(st: Extract<Statement, { type: 'alter' }>, db: Database, session: Session, env: Env): string {
  const t = baseTable(db, st.name);
  const a = st.action;
  switch (a.kind) {
    case 'add':
      for (const def of a.columns) {
        if (t.columns.some((c) => c.name === def.name)) throw new OraError('ORA-01430', 'column being added already exists in table');
        const c = columnOf(def, session);
        const fill = defaultValue(t, c, env);
        if (!c.nullable && t.rows.length && fill === null) throw new OraError('ORA-01758', 'table must be empty to add mandatory (NOT NULL) column');
        t.columns.push(c);
        t.rows.forEach((r) => r.push(fill));
        for (const k of def.inline) {
          const made = constraintFrom(session, k, [def.name], env.src);
          if (made) (t.constraints ??= []).push(made);
        }
      }
      break;
    case 'modify':
      for (const m of a.columns) {
        const i = columnIndex(t, m.name);
        const oldCol = t.columns[i];
        let next: Column = m.spec ? { ...columnFromSpec(oldCol.name, m.spec, oldCol.nullable), ...(oldCol.default ? { default: oldCol.default } : {}) } : { ...oldCol };
        if (m.default) next = { ...next, default: m.default };
        if (m.nullable !== undefined) next.nullable = m.nullable;
        if (m.nullable === false) next.notNullName ??= `SYS_C00${++session.seq}`;
        if (m.nullable === true) delete next.notNullName;
        if (m.spec && next.type !== oldCol.type && t.rows.some((r) => r[i] !== null)) {
          throw new OraError('ORA-01439', 'column to be modified must be empty to change datatype');
        }
        const narrower = next.type === 'NUMBER' && (next.precision ?? 38) < (oldCol.precision ?? 38) || (next.type === 'NUMBER' && (next.scale ?? 0) < (oldCol.scale ?? (oldCol.precision === undefined ? 127 : 0)) && next.precision !== undefined);
        if (m.spec && narrower && t.rows.some((r) => r[i] !== null)) {
          throw new OraError('ORA-01440', 'column to be modified must be empty to decrease precision or scale');
        }
        if (m.spec && next.length !== undefined && t.rows.some((r) => r[i] !== null && new TextEncoder().encode(String(r[i])).length > next.length!)) {
          throw new OraError('ORA-01441', 'cannot decrease column length because some value is too big');
        }
        if (m.nullable === false && t.rows.some((r) => r[i] === null)) {
          throw new OraError('ORA-02296', `cannot enable (SCOTT.SYS_C00${++session.seq}) - null values found`);
        }
        t.columns[i] = next;
      }
      break;
    case 'dropColumn':
      for (const c of a.columns) {
        const i = columnIndex(t, c);
        if (t.columns.length === 1) throw new OraError('ORA-12983', 'cannot drop all columns in a table');
        t.columns.splice(i, 1);
        t.rows.forEach((r) => r.splice(i, 1));
        t.constraints = (t.constraints ?? []).filter((k) => !k.columns.includes(c));
      }
      break;
    case 'renameColumn': {
      const i = columnIndex(t, a.from);
      if (t.columns.some((c) => c.name === a.to)) throw new OraError('ORA-00957', 'duplicate column name');
      t.columns[i] = { ...t.columns[i], name: a.to };
      for (const k of t.constraints ?? []) {
        k.columns = k.columns.map((c) => (c === a.from ? a.to : c));
        if (k.check && usesColumn(k.check, a.from)) {
          k.check = renameInExpr(k.check, a.from, a.to);
          // Oracle 은 이름을 바꾼 열을 쓰는 CHECK 만 원문을 다시 만든다: 열 이름은 큰따옴표, 연산자 둘레 공백은 뺀다("LOW"<"HI" AND "LOW">=0).
          if (k.checkText) k.checkText = regenerateCheck(k.checkText, a.from, a.to, t.columns.map((c) => c.name));
        }
      }
      break;
    }
    case 'addConstraint': {
      const k = constraintFrom(session, a.constraint, a.constraint.columns, env.src)!;
      k.columns.forEach((c) => columnIndex(t, c));
      if (k.kind === 'P' && (t.constraints ?? []).some((x) => x.kind === 'P')) throw new OraError('ORA-02260', 'table can have only one primary key');
      if ((t.constraints ?? []).some((x) => x.name === k.name)) throw new OraError('ORA-02264', 'name already used by an existing constraint');
      validateForeignKey(db, t, k);
      const trial: Table = { ...t, constraints: [...(t.constraints ?? []), k] };
      if (k.kind === 'P') k.columns.forEach((c) => (trial.columns[columnIndex(t, c)] = { ...trial.columns[columnIndex(t, c)], nullable: false }));
      try {
        checkConstraints(db, trial, trial.rows, new Set(trial.rows.map((_, i) => i)), 'insert', env);
      } catch (err) {
        if (!(err instanceof OraError)) throw err;
        const what = k.kind === 'P' ? 'primary key violated' : k.kind === 'U' ? 'unique key violated' : k.kind === 'C' ? 'check constraint violated' : 'parent keys not found';
        const code = k.kind === 'P' ? 'ORA-02437' : k.kind === 'U' ? 'ORA-02299' : k.kind === 'C' ? 'ORA-02293' : 'ORA-02298';
        throw new OraError(code, `cannot validate (SCOTT.${k.name}) - ${what}`);
      }
      t.constraints = trial.constraints;
      t.columns = trial.columns;
      break;
    }
    case 'dropConstraint': {
      const k = (t.constraints ?? []).find((x) => x.name === a.name);
      if (!k) throw new OraError('ORA-02443', 'Cannot drop constraint  - nonexistent constraint');
      if ((k.kind === 'P' || k.kind === 'U') && childrenOf(db, t.name).some(({ fk }) => (fk.refColumns ?? primaryKeyOf(t)).join() === k.columns.join())) {
        throw new OraError('ORA-02273', 'this unique/primary key is referenced by some foreign keys');
      }
      t.constraints = t.constraints!.filter((x) => x !== k);
      break;
    }
    case 'dropPrimaryKey': {
      const k = (t.constraints ?? []).find((x) => x.kind === 'P');
      if (!k) throw new OraError('ORA-02441', 'Cannot drop nonexistent primary key');
      if (childrenOf(db, t.name).length) throw new OraError('ORA-02273', 'this unique/primary key is referenced by some foreign keys');
      t.constraints = t.constraints!.filter((x) => x !== k);
      break;
    }
  }
  return 'Table altered.';
}

function regenerateCheck(text: string, from: string, to: string, columns: string[]): string {
  const cols = new Set(columns);
  const KEYWORDS = new Set(['AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'IS', 'NULL', 'LIKE', 'ESCAPE']);
  let out = '';
  for (const tok of tokenize(text)) {
    if (tok.kind === 'end') break;
    if (tok.kind === 'word') {
      const name = tok.value === from ? to : tok.value;
      if (KEYWORDS.has(tok.value)) out += ` ${tok.value} `;
      else out += cols.has(name) || tok.value === from ? `"${name}"` : tok.value;
    } else if (tok.kind === 'string') out += `'${tok.value.replace(/'/g, "''")}'`;
    else if (tok.kind === 'quoted') out += `"${tok.value === from ? to : tok.value}"`;
    else if (tok.kind === 'op' && tok.value === ',') out += ', ';
    else out += tok.value;
  }
  return out.replace(/ {2,}/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();
}

/** 식 안에 그 이름의 열 참조가 있는가(문자열 리터럴은 열 참조가 아니다) */
function usesColumn(e: Expr, name: string): boolean {
  let hit = false;
  JSON.stringify(e, (_k, v) => {
    if (v && typeof v === 'object' && v.type === 'col' && v.name === name) hit = true;
    return v;
  });
  return hit;
}

function renameInExpr(e: Expr, from: string, to: string): Expr {
  return JSON.parse(JSON.stringify(e), (_k, v) => (v && typeof v === 'object' && v.type === 'col' && v.name === from ? { ...v, name: to } : v));
}

/** 조인 위치 계산용 — 쓰지 않으면 tree-shaking 된다 */
export const _internal = { relationOf, tableRelation };
export type { TableConstraintDef };
