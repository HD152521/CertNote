import { translateEngineMessageEn } from './engineMessagesEn';
// SQL 실습장 화면 문구 사전. 한국어(ko)는 기존 문구 그대로, 영어(en)는 /en 페이지용.
export type SqlLang = 'ko' | 'en';

const HANGUL = /[ㄱ-ㆎ가-힣]/;
export const hasHangul = (s: string): boolean => HANGUL.test(s);

export interface SqlStrings {
  consoleLabel: string;
  run: string;
  running: string;
  reset: string;
  ctrlEnter: string;
  nothingToRun: string;
  timedOut: string;
  loading: string;
  noRows: string;
  rowCount: (total: number, shown: number, max: number) => string;
  unsupportedNote: string;
  schemaTitle: string;
  schemaExpand: string;
  tableRows: (n: number) => string;
  tableNotes: Record<string, string>;
  pickLabel: string;
  quizRunsOn: string;
  quizLabLead: string;
  quizLabLink: string;
  quizLabTail: string;
}

const ko: SqlStrings = {
  consoleLabel: 'SQL 입력',
  run: '실행',
  running: '실행 중…',
  reset: '처음 문장으로',
  ctrlEnter: 'Ctrl + Enter 로도 실행',
  nothingToRun: '실행할 문장이 없어요.',
  timedOut:
    '실행이 4초 안에 끝나지 않아서 멈췄어요. 정규식의 반복이 겹치거나, 큰 조인·큰 테이블을 행마다 다시 계산하고 있는지 확인해 보세요.',
  loading: '실습장을 불러오는 중…',
  noRows: 'no rows selected (결과 0행)',
  rowCount: (total, _shown, max) => `${total}행${total > max ? ` 중 ${max}행만 보인다` : ''}`,
  unsupportedNote: '',
  schemaTitle: '예제 테이블 보기: EMP · DEPT · SALGRADE',
  schemaExpand: '펼치기',
  tableRows: (n) => `${n}행`,
  tableNotes: {},
  pickLabel: '실행할 SQL 고르기',
  quizRunsOn: 'EMP·DEPT·SALGRADE 예제 테이블로 실행해요. 과제로 더 연습하려면',
  quizLabLead: '',
  quizLabLink: 'SQL 실습장',
  quizLabTail: '으로 가세요.',
};

const en: SqlStrings = {
  consoleLabel: 'SQL input',
  run: 'Run',
  running: 'Running…',
  reset: 'Reset statement',
  ctrlEnter: 'Ctrl + Enter also runs it',
  nothingToRun: 'There is no statement to run.',
  timedOut:
    'The statement did not finish within 4 seconds, so it was stopped. Check for nested regular-expression repetition, or a large join or table being recomputed for every row.',
  loading: 'Loading the SQL lab…',
  noRows: 'no rows selected (0 rows)',
  rowCount: (total, _shown, max) => `${total} ${total === 1 ? 'row' : 'rows'}${total > max ? ` (showing the first ${max})` : ''}`,
  unsupportedNote:
    'The SQL lab does not support this statement yet, or could not process it. Try rewriting it in a simpler form.',
  schemaTitle: 'Sample tables: EMP · DEPT · SALGRADE',
  schemaExpand: 'Expand',
  tableRows: (n) => `${n} ${n === 1 ? 'row' : 'rows'}`,
  tableNotes: {
    DEPT: '4 departments. Department 40, OPERATIONS, has no employees.',
    EMP: '14 employees. KING has no manager (MGR), and only salespeople have COMM (TURNER has 0).',
    SALGRADE: '5 salary grades. An EMP.SAL between LOSAL and HISAL belongs to that grade (a non-equi join example).',
    DUAL: 'A one-row virtual table. Use it to see the result of a function on its own.',
  },
  pickLabel: 'Choose the SQL to run',
  quizRunsOn: 'Runs against the EMP, DEPT and SALGRADE sample tables.',
  quizLabLead: '',
  quizLabLink: 'For more practice, open the SQL practice lab.',
  quizLabTail: '',
};

const DICT: Record<SqlLang, SqlStrings> = { ko, en };

export const sqlStrings = (lang: SqlLang = 'ko'): SqlStrings => DICT[lang];

/**
 * 엔진이 만든 문구(안내·힌트·오류 해설)는 한국어다. 영어 화면에서는 한글이 든 문구를 그대로 보이지 않고
 * 영어 대체 문구로 바꾼다(ORA 코드와 영어 오류 본문은 그대로 보인다). ko 는 원문 그대로.
 */
export function localizeEngineText(lang: SqlLang, text: string): string {
  if (lang !== 'en' || !hasHangul(text)) return text;
  return translateEngineMessageEn(text) ?? en.unsupportedNote;
}

/** 힌트는 영어 화면에서 한글이 있으면 아예 숨긴다(오류 본문이 이미 영어라서). */
export function localizeHint(lang: SqlLang, hint: string | undefined): string | undefined {
  if (!hint) return hint;
  return lang === 'en' && hasHangul(hint) ? undefined : hint;
}

export function tableNote(lang: SqlLang, name: string, fallback: string): string {
  if (lang !== 'en') return fallback;
  return en.tableNotes[name] ?? (hasHangul(fallback) ? '' : fallback);
}

/** 독립 실습장 페이지(SqlLab)의 화면 문구. ko 는 기존 문구 그대로. */
export interface LabStrings {
  labName: string;
  oracleBadge: string;
  pickTask: string;
  taskOf: (index: number, total: number) => string;
  taskAria: (index: number, done: boolean, title: string) => string;
  taskInputLabel: (index: number) => string;
  solvedTag: string;
  solvedCount: (solved: number, total: number) => string;
  hintPrefix: string;
  verdictOk: string;
  verdictPrefix: string;
  showHint: string;
  showAnswer: string;
  nextTask: string;
}

const labKo: LabStrings = {
  labName: 'SQL 실습장',
  oracleBadge: 'Oracle 문법 · 실제 Oracle 결과와 대조',
  pickTask: '과제 고르기',
  taskOf: (i, total) => `과제 ${i} / ${total}`,
  taskAria: (i, done, title) => `과제 ${i}${done ? ' 정답' : ''}: ${title}`,
  taskInputLabel: (i) => `과제 ${i} SQL 입력`,
  solvedTag: '정답',
  solvedCount: (n, total) => `${n} / ${total} 과제 정답`,
  hintPrefix: '힌트:',
  verdictOk: '채점: 정답이에요. 모범 답안과 결과가 같아요.',
  verdictPrefix: '채점:',
  showHint: '힌트 보기',
  showAnswer: '모범 답안 보기',
  nextTask: '다음 과제',
};

const labEn: LabStrings = {
  labName: 'SQL lab',
  oracleBadge: 'Oracle syntax · checked against real Oracle results',
  pickTask: 'Choose a task',
  taskOf: (i, total) => `Task ${i} / ${total}`,
  taskAria: (i, done, title) => `Task ${i}${done ? ' (correct)' : ''}: ${title}`,
  taskInputLabel: (i) => `Task ${i} SQL input`,
  solvedTag: 'Correct',
  solvedCount: (n, total) => `${n} / ${total} ${total === 1 ? 'task' : 'tasks'} solved`,
  hintPrefix: 'Hint:',
  verdictOk: 'Grading: correct. Your result matches the model answer.',
  verdictPrefix: 'Grading:',
  showHint: 'Show hint',
  showAnswer: 'Show answer',
  nextTask: 'Next task',
};

export const labStrings = (lang: SqlLang = 'ko'): LabStrings => (lang === 'en' ? labEn : labKo);

type VerdictRule = readonly [RegExp, (m: RegExpMatchArray) => string];
const VERDICT_RULES: readonly VerdictRule[] = [
  [/^(\S+) 오류가 났어요\./, (m) => `${m[1]} error. Read the error message, fix the statement and run it again.`],
  [/^실습장이 실행하지 못한 문장이에요\./, () => 'The SQL lab could not execute this statement.'],
  [/^마지막 문장이 SELECT 가 아니에요/, () => 'The last statement is not a SELECT. End with a SELECT that shows the result.'],
  [/^모범 답안을 실행하지 못했어요/, () => 'Could not run the model answer (SQL lab error).'],
  [/^열 개수가 달라요\. 기대 (\d+)개, 지금 (\d+)개\./, (m) => `The number of columns differs. Expected ${m[1]}, got ${m[2]}.`],
  [/^행 수가 달라요\. 기대 (\d+)행, 지금 (\d+)행\./, (m) => `The number of rows differs. Expected ${m[1]}, got ${m[2]}.`],
  [/^행 수는 맞지만 값이 다른 행이 있어요/, () => 'The row count matches, but some rows have different values. Recheck the conditions or the calculation.'],
  [/^값은 모두 맞지만 순서가 달라요/, () => 'All values are right, but the order differs. Check your ORDER BY.'],
];

/** 채점기(src/lib/sql-lab/tasks.ts judge)가 만드는 한국어 사유의 영어 대응. ko 는 원문 그대로. */
export function localizeVerdictReason(lang: SqlLang, reason: string): string {
  if (lang !== 'en' || !hasHangul(reason)) return reason;
  for (const [re, fn] of VERDICT_RULES) {
    const m = reason.match(re);
    if (m) return fn(m);
  }
  return en.unsupportedNote;
}
