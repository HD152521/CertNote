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
  quizLabLink: '',
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
