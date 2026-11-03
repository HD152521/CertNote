// 데이터 사전(USER_TABLES·USER_TAB_COLUMNS·USER_CONSTRAINTS·USER_CONS_COLUMNS·USER_VIEWS).
// 실습장 DB 의 테이블·제약 조건을 읽어 그때그때 표로 만든다. 열 이름은 Oracle 의 것을 쓴다.
import { columnFromSpec, type Database, type Table } from './data';
import type { Value } from './values';

const HIDDEN = new Set(['DUAL']);

const userTables = (db: Database) => Object.values(db).filter((t) => !t.view && !HIDDEN.has(t.name) && !DICTIONARY_NAMES.has(t.name));

function make(name: string, cols: [string, string][], rows: Value[][]): Table {
  return { name, note: '', columns: cols.map(([n, spec]) => columnFromSpec(n, spec)), rows };
}

function primaryOrUnique(t: Table, cols: string[]) {
  return (t.constraints ?? []).find((k) => (k.kind === 'P' || k.kind === 'U') && k.columns.join() === cols.join());
}

const BUILDERS: Record<string, (db: Database) => Table> = {
  USER_TABLES: (db) => make('USER_TABLES', [['TABLE_NAME', 'VARCHAR2(128)']], userTables(db).map((t) => [t.name])),
  USER_VIEWS: (db) =>
    make('USER_VIEWS', [['VIEW_NAME', 'VARCHAR2(128)']], Object.values(db).filter((t) => t.view).map((t) => [t.name])),
  USER_TAB_COLUMNS: (db) =>
    make(
      'USER_TAB_COLUMNS',
      [['TABLE_NAME', 'VARCHAR2(128)'], ['COLUMN_NAME', 'VARCHAR2(128)'], ['DATA_TYPE', 'VARCHAR2(128)'], ['DATA_LENGTH', 'NUMBER'], ['DATA_PRECISION', 'NUMBER'], ['DATA_SCALE', 'NUMBER'], ['NULLABLE', 'VARCHAR2(1)'], ['COLUMN_ID', 'NUMBER']],
      userTables(db).flatMap((t) =>
        t.columns.map((c, i): Value[] => [
          t.name,
          c.name,
          c.type === 'VARCHAR2' && c.fixed ? 'CHAR' : c.type,
          c.type === 'NUMBER' ? 22 : c.type === 'DATE' ? 7 : (c.length ?? 1),
          c.type === 'NUMBER' ? (c.precision ?? null) : null,
          c.type === 'NUMBER' ? (c.precision !== undefined ? (c.scale ?? 0) : null) : null,
          c.nullable ? 'Y' : 'N',
          i + 1,
        ]),
      ),
    ),
  USER_CONSTRAINTS: (db) =>
    make(
      'USER_CONSTRAINTS',
      [['OWNER', 'VARCHAR2(128)'], ['CONSTRAINT_NAME', 'VARCHAR2(128)'], ['CONSTRAINT_TYPE', 'VARCHAR2(1)'], ['TABLE_NAME', 'VARCHAR2(128)'], ['SEARCH_CONDITION_VC', 'VARCHAR2(4000)'], ['R_CONSTRAINT_NAME', 'VARCHAR2(128)'], ['DELETE_RULE', 'VARCHAR2(9)'], ['STATUS', 'VARCHAR2(8)']],
      userTables(db).flatMap((t) => [
        ...t.columns.filter((c) => c.notNullName).map((c): Value[] => ['SCOTT', c.notNullName!, 'C', t.name, `"${c.name}" IS NOT NULL`, null, null, 'ENABLED']),
        ...(t.constraints ?? []).map((k): Value[] => {
          const parent = k.refTable ? db[k.refTable] : undefined;
          const rName = parent ? (primaryOrUnique(parent, k.refColumns ?? parent.constraints?.find((x) => x.kind === 'P')?.columns ?? [])?.name ?? null) : null;
          return ['SCOTT', k.name, k.kind, t.name, k.kind === 'C' ? (k.checkText ?? null) : null, rName, k.kind === 'R' ? (k.onDelete ?? 'NO ACTION') : null, 'ENABLED'];
        }),
      ]),
    ),
  USER_CONS_COLUMNS: (db) =>
    make(
      'USER_CONS_COLUMNS',
      [['OWNER', 'VARCHAR2(128)'], ['CONSTRAINT_NAME', 'VARCHAR2(128)'], ['TABLE_NAME', 'VARCHAR2(128)'], ['COLUMN_NAME', 'VARCHAR2(4000)'], ['POSITION', 'NUMBER']],
      userTables(db).flatMap((t) => [
        ...t.columns.filter((c) => c.notNullName).map((c): Value[] => ['SCOTT', c.notNullName!, t.name, c.name, null]),
        ...(t.constraints ?? []).flatMap((k) => k.columns.map((col, i): Value[] => ['SCOTT', k.name, t.name, col, k.kind === 'C' ? null : i + 1])),
      ]),
    ),
};

export const DICTIONARY_NAMES = new Set(Object.keys(BUILDERS));

/** 데이터 사전 뷰면 지금 DB 상태로 만든 표, 아니면 undefined */
export function dictionaryTable(db: Database, name: string): Table | undefined {
  return BUILDERS[name]?.(db);
}
