// SQL 실습장 입구: 입력 문자열(여러 문장 가능)을 실행해 문장마다 결과 또는 오류를 돌려준다.
// 한 번 실행하는 동안 세션 하나를 쓴다 — INSERT 뒤의 SELECT 는 넣은 행을 보고, ROLLBACK 은 COMMIT 시점으로 돌린다.
// 실행할 때마다 예제 테이블은 처음 상태로 돌아온다.
import { sampleDatabase, type Database } from './data';
import { executeStatement, newSession, type Session } from './dml';
import { MAX_STATEMENT_MS } from './exec';
import { splitStatements } from './parser';
import { parseStatement } from './statements';
import { NotSupported, OraError, display, type Value } from './values';

export type StatementResult =
  | { kind: 'rows'; sql: string; columns: string[]; rows: Value[][]; numeric: boolean[] }
  | { kind: 'message'; sql: string; message: string }
  | { kind: 'error'; sql: string; code: string; message: string; hint?: string }
  | { kind: 'note'; sql: string; message: string };

export function runInSession(sql: string, session: Session): StatementResult {
  try {
    const st = parseStatement(sql);
    const out = executeStatement(st, session, sql, Date.now() + MAX_STATEMENT_MS);
    if (out.kind === 'message') return { kind: 'message', sql, message: out.message };
    if (out.kind === 'note') return { kind: 'note', sql, message: out.message };
    const numeric = out.columns.map((_, i) => out.rows.some((r) => typeof r[i] === 'number') && out.rows.every((r) => r[i] === null || typeof r[i] === 'number'));
    return { kind: 'rows', sql, columns: out.columns, rows: out.rows, numeric };
  } catch (e) {
    if (e instanceof OraError) return { kind: 'error', sql, code: e.code, message: e.text, hint: e.hint };
    if (e instanceof NotSupported) return { kind: 'note', sql, message: e.message };
    // 엔진 버그가 화면을 깨뜨리지 않게 한다.
    return { kind: 'note', sql, message: '실습장이 이 문장을 처리하지 못했어요. 문장을 조금 바꿔 다시 실행해 보세요.' };
  }
}

export function runStatement(sql: string, db: Database = sampleDatabase()): StatementResult {
  return runInSession(sql, newSession(db));
}

export function runSql(src: string, db: Database = sampleDatabase()): StatementResult[] {
  return runSqlIn(src, newSession(db));
}

/** 이미 있는 세션에서 이어서 실행한다(채점이 사용자 문장 뒤에 확인 쿼리를 돌릴 때). */
export function runSqlIn(src: string, session: Session): StatementResult[] {
  return splitStatements(src).map((sql) => runInSession(sql, session));
}

export { newSession, type Session };

/** SQL*Plus 처럼 보이는 글자 표(테스트·골든 비교용). */
export function renderText(r: StatementResult): string {
  if (r.kind === 'error') return `ERROR at line 1:\n${r.code}: ${r.message}`;
  if (r.kind === 'note') return `-- ${r.message}`;
  if (r.kind === 'message') return r.message;
  if (r.rows.length === 0) return 'no rows selected';
  const cells = r.rows.map((row) => row.map(display));
  return [r.columns.join(' | '), ...cells.map((c) => c.join(' | '))].join('\n');
}
