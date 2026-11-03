// SQL 실습장 입구: 입력 문자열(여러 문장 가능)을 실행해 문장마다 결과 또는 오류를 돌려준다.
import { sampleDatabase, type Database } from './data';
import { MAX_STATEMENT_MS, runSelect } from './exec';
import { parseSelect, splitStatements } from './parser';
import { NotSupported, OraError, display, type Value } from './values';

export type StatementResult =
  | { kind: 'rows'; sql: string; columns: string[]; rows: Value[][]; numeric: boolean[] }
  | { kind: 'error'; sql: string; code: string; message: string; hint?: string }
  | { kind: 'note'; sql: string; message: string };

export function runStatement(sql: string, db: Database = sampleDatabase()): StatementResult {
  try {
    const query = parseSelect(sql);
    const rs = runSelect({ db, src: sql, work: { rows: 0, deadline: Date.now() + MAX_STATEMENT_MS } }, query);
    const numeric = rs.columns.map((_, i) => rs.rows.some((r) => typeof r[i] === 'number') && rs.rows.every((r) => r[i] === null || typeof r[i] === 'number'));
    return { kind: 'rows', sql, columns: rs.columns, rows: rs.rows, numeric };
  } catch (e) {
    if (e instanceof OraError) return { kind: 'error', sql, code: e.code, message: e.text, hint: e.hint };
    if (e instanceof NotSupported) return { kind: 'note', sql, message: e.message };
    // 엔진 버그가 화면을 깨뜨리지 않게 한다.
    return { kind: 'note', sql, message: '실습장이 이 문장을 처리하지 못했어요. 문장을 조금 바꿔 다시 실행해 보세요.' };
  }
}

export function runSql(src: string, db: Database = sampleDatabase()): StatementResult[] {
  return splitStatements(src).map((sql) => runStatement(sql, db));
}

/** SQL*Plus 처럼 보이는 글자 표(테스트·골든 비교용). */
export function renderText(r: StatementResult): string {
  if (r.kind === 'error') return `ERROR at line 1:\n${r.code}: ${r.message}`;
  if (r.kind === 'note') return `-- ${r.message}`;
  if (r.rows.length === 0) return 'no rows selected';
  const cells = r.rows.map((row) => row.map(display));
  return [r.columns.join(' | '), ...cells.map((c) => c.join(' | '))].join('\n');
}
