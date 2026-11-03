// SQL 실습장 과제와 채점. 쿼리 글자가 아니라 결과 집합으로 채점한다 — 같은 결과를 내는 다른 쿼리도 정답이다.
// 모범 답안의 결과는 골든(scripts/sql-lab/cases.mjs 의 task-*)으로 실제 Oracle 과 대조한다.
import raw from './tasks.json';
import { sampleDatabase as sampleDatabaseFresh } from './data';
import { newSession, runSql, runSqlIn, runStatement, type StatementResult } from './run';
import { display } from './values';

export interface SqlTaskItem {
  id: string;
  title: string;
  prompt: string;
  hint: string;
  answer: string;
  explain: string;
  /** 정렬까지 맞아야 하는가(문제에 "~ 순으로" 가 있으면 true) */
  ordered: boolean;
  /**
   * 데이터를 바꾸는 과제(INSERT·UPDATE…)의 확인 쿼리. 사용자 문장을 실행한 세션에서 이 쿼리를 돌려,
   * 모범 답안을 실행한 뒤의 결과와 비교한다(문장 모양이 아니라 바뀐 상태로 채점).
   */
  check?: string;
}

export interface SqlTaskSet {
  id: string;
  code: string;
  title: string;
  items: SqlTaskItem[];
}

export const SQL_TASK_SETS = raw as SqlTaskSet[];

export type Verdict = { ok: true } | { ok: false; reason: string };

const cells = (r: Extract<StatementResult, { kind: 'rows' }>) => r.rows.map((row) => row.map(display));
const key = (row: string[]) => JSON.stringify(row);

/** 사용자가 실행한 마지막 SELECT 결과를 모범 답안 결과와 비교한다. 열 이름(별칭)은 보지 않는다. */
export function judge(item: SqlTaskItem, result: StatementResult): Verdict {
  if (result.kind === 'error') return { ok: false, reason: `${result.code} 오류가 났어요. 오류 문구를 읽고 고쳐서 다시 실행해 보세요.` };
  if (result.kind === 'note') return { ok: false, reason: '실습장이 실행하지 못한 문장이에요.' };
  if (result.kind === 'message') return { ok: false, reason: '마지막 문장이 SELECT 가 아니에요. 결과를 보여 주는 SELECT 로 끝내 주세요.' };
  const want = item.check ? lastOf(runSql(`${item.answer}
${item.check}`)) : runStatement(item.answer);
  if (!want || want.kind !== 'rows') return { ok: false, reason: '모범 답안을 실행하지 못했어요(실습장 오류).' };
  if (result.columns.length !== want.columns.length) {
    return { ok: false, reason: `열 개수가 달라요. 기대 ${want.columns.length}개, 지금 ${result.columns.length}개.` };
  }
  if (result.rows.length !== want.rows.length) {
    return { ok: false, reason: `행 수가 달라요. 기대 ${want.rows.length}행, 지금 ${result.rows.length}행.` };
  }
  const got = cells(result).map(key);
  const exp = cells(want).map(key);
  const sameSet = [...got].sort().join('\n') === [...exp].sort().join('\n');
  if (!sameSet) return { ok: false, reason: '행 수는 맞지만 값이 다른 행이 있어요. 조건이나 계산식을 다시 확인해 보세요.' };
  if (item.ordered && got.join('\n') !== exp.join('\n')) return { ok: false, reason: '값은 모두 맞지만 순서가 달라요. ORDER BY 를 확인해 보세요.' };
  return { ok: true };
}

const lastOf = (rs: StatementResult[]) => rs[rs.length - 1];

/**
 * 입력창 전체를 실행해 결과와 채점을 돌려준다.
 * 확인 쿼리가 있는 과제는 사용자 문장 뒤에 같은 세션에서 확인 쿼리를 돌려 그 결과로 채점한다.
 */
export function runForTask(item: SqlTaskItem, src: string): { results: StatementResult[]; verdict: Verdict | null } {
  const s = newSessionFresh();
  const results = runSqlIn(src, s);
  if (!results.length) return { results, verdict: null };
  if (item.check) {
    // 중간 문장이 오류여도 Oracle 처럼 그 문장만 취소되고 이어진다. 바뀐 최종 상태로 채점한다.
    const checked = lastOf(runSqlIn(item.check, s));
    const v = checked ? judge(item, checked) : null;
    const failed = results.find((r) => r.kind === 'error' || r.kind === 'note');
    if (v && !v.ok && failed) return { results, verdict: judge(item, failed) };
    return { results, verdict: v };
  }
  return { results, verdict: judge(item, lastOf(results)) };
}

function newSessionFresh() {
  return newSession(sampleDatabaseFresh());
}
