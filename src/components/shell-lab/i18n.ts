// Screen text for the shell practice components. Korean (ko) is the existing wording unchanged; English (en)
// is used on /en pages. Components pick the language with useLanguage() (path based, so server and client agree).
export type ShellLang = 'ko' | 'en';

const HANGUL = /[ㄱ-ㆎ가-힣]/;
export const hasHangul = (s: string): boolean => HANGUL.test(s);

export interface ShellStrings {
  simulator: string;
  inputLabel: string;
  labBanner: string;
  labPlaceholder: string;
  stepPassed: (n: number, title: string) => string;
  stepLabel: (n: number, total: number, title: string) => string;
  /** useShell */
  engineFailure: string;
  // drill
  drillBanner: string;
  drillPlaceholder: string;
  drillKind: string;
  drillGraded: (n: number) => string;
  problem: (n: number, total: number) => string;
  correct: string;
  conditions: string;
  showAnswer: string;
  restartProblem: string;
  nextProblem: string;
  putInInput: string;
  solvedCount: (done: number, total: number) => string;
  pickProblem: string;
  problemAria: (n: number, done: boolean, title: string) => string;
  problemTaskLabel: (n: number, total: number, title: string) => string;
  // quiz shell
  quizBanner: (dir: string) => string;
  quizPlaceholder: string;
  clickToType: string;
  practiceTag: string;
  stepByStep: string;
  preparingShell: string;
  preparingSql: string;
  runSqlWrong: string;
  runSqlRight: string;
  tryShellWrong: string;
  tryShellRight: string;
  labPractice: (code: string) => string;
  // workdir strip
  linkCount: (n: number) => string;
  groupsLabel: (list: string) => string;
  userLabel: (name: string) => string;
  stripNote: (n: number) => string;
  stripEmpty: string;
}

const ko: ShellStrings = {
  simulator: 'Rocky Linux 8.8 시뮬레이터',
  inputLabel: '리눅스 명령 입력',
  labBanner:
    'CertNote 리눅스 셸 연습장 — 브라우저 안에서 도는 Rocky Linux 8.8 시뮬레이터예요. 실제 서버에 접속하지 않아요.\n' +
    'help 지원 명령 · Tab 자동 완성 · ↑↓ 이전 명령 · clear 화면 정리 · reset 처음부터',
  labPlaceholder: 'ls -l 처럼 쳐 보세요 · Tab 자동 완성',
  stepPassed: (n, title) => `STEP ${n} 통과 · ${title}`,
  stepLabel: (n, total, title) => `STEP ${n} / ${total} · ${title}`,
  engineFailure: '연습장이 이 명령을 처리하지 못했어요. 다른 방식으로 써 보거나 reset 으로 처음부터 시작하세요.',
  drillBanner:
    '문제마다 처음 상태가 따로 준비되어 있어요. 조건을 모두 채우면 바로 "정답" 이 표시돼요.\n' +
    '같은 결과를 내는 다른 명령도 정답이에요 · Tab 자동 완성 · reset 이 문제 처음부터',
  drillPlaceholder: '조건에 맞게 명령을 쳐 보세요 · Tab 자동 완성',
  drillKind: '작업형 실기',
  drillGraded: (n) => `채점: 정답 · 문제 ${n} 의 조건을 모두 채웠어요`,
  problem: (n, total) => `문제 ${n} / ${total}`,
  correct: '정답',
  conditions: '[조건]',
  showAnswer: '모범 답안 보기',
  restartProblem: '이 문제 처음부터',
  nextProblem: '다음 문제',
  putInInput: '입력창에 넣기',
  solvedCount: (done, total) => `${done} / ${total} 문제 정답`,
  pickProblem: '문제 고르기',
  problemAria: (n, done, title) => `문제 ${n}${done ? ' 정답' : ''}: ${title}`,
  problemTaskLabel: (n, total, title) => `문제 ${n} / ${total} · ${title}`,
  quizBanner: (dir) =>
    `보기의 명령을 쳐 보세요. 필요한 파일·사용자는 ${dir} 에 만들어 두었어요.\n` + 'Rocky Linux 8.8 시뮬레이터 · Tab 자동 완성 · reset 처음부터',
  quizPlaceholder: '명령을 쳐 보세요 · Tab 자동 완성',
  clickToType: '눌러서 입력',
  practiceTag: '연습용',
  stepByStep: '단계별 실습',
  preparingShell: '셸을 준비하는 중…',
  preparingSql: 'SQL 실습장을 준비하는 중…',
  runSqlWrong: '문제의 SQL 을 직접 실행해서 결과 확인하기',
  runSqlRight: '문제의 SQL 직접 실행해 보기',
  tryShellWrong: '보기의 명령을 셸에서 직접 쳐 보기',
  tryShellRight: '셸에서 직접 쳐 보기',
  labPractice: (code) => `${code} 실습으로 손에 익히기`,
  linkCount: (n) => `링크 ${n}`,
  groupsLabel: (list) => `그룹 ${list}`,
  userLabel: (name) => `사용자 ${name}`,
  stripNote: (n) => `시각·inode 번호는 예시 값 · ${n}개`,
  stripEmpty: '비어 있어요. 명령으로 무언가를 만들면 여기에 나타나요.',
};

const en: ShellStrings = {
  simulator: 'Rocky Linux 8.8 simulator',
  inputLabel: 'Linux command input',
  labBanner:
    'CertNote Linux shell lab — a Rocky Linux 8.8 simulator that runs in your browser. It never connects to a real server.\n' +
    'Type help to list supported commands · Tab to autocomplete · Up/Down for previous commands · clear to clear the screen · reset to start over',
  labPlaceholder: 'Try something like ls -l · Tab autocomplete',
  stepPassed: (n, title) => `STEP ${n} passed · ${title}`,
  stepLabel: (n, total, title) => `STEP ${n} / ${total} · ${title}`,
  engineFailure: 'The practice lab could not process this command. Try writing it another way, or start over with reset.',
  drillBanner:
    'Each problem has its own starting state. As soon as you meet every condition, "Correct" is shown.\n' +
    'Any other command that gives the same result is also correct · Tab autocomplete · reset restarts this problem',
  drillPlaceholder: 'Type a command that meets the conditions · Tab autocomplete',
  drillKind: 'Task-style practical',
  drillGraded: (n) => `Graded: correct · you met every condition of problem ${n}`,
  problem: (n, total) => `Problem ${n} / ${total}`,
  correct: 'Correct',
  conditions: '[Conditions]',
  showAnswer: 'Show model answer',
  restartProblem: 'Restart this problem',
  nextProblem: 'Next problem',
  putInInput: 'Put in input',
  solvedCount: (done, total) => `${done} / ${total} problems correct`,
  pickProblem: 'Choose a problem',
  problemAria: (n, done, title) => `Problem ${n}${done ? ' correct' : ''}: ${title}`,
  problemTaskLabel: (n, total, title) => `Problem ${n} / ${total} · ${title}`,
  quizBanner: (dir) =>
    `Try the commands from the choices. The files and users they need are already set up in ${dir}.\n` +
    'Rocky Linux 8.8 simulator · Tab autocomplete · reset starts over',
  quizPlaceholder: 'Try a command · Tab autocomplete',
  clickToType: 'Click to type',
  practiceTag: 'Practice',
  stepByStep: 'Step-by-step lab',
  preparingShell: 'Preparing the shell…',
  preparingSql: 'Preparing the SQL lab…',
  runSqlWrong: "Run the question's SQL yourself and check the result",
  runSqlRight: "Run the question's SQL yourself",
  tryShellWrong: 'Type the commands from the choices into a shell',
  tryShellRight: 'Try it in a shell',
  labPractice: (code) => `Get hands-on with the ${code} lab`,
  linkCount: (n) => `links ${n}`,
  groupsLabel: (list) => `groups ${list}`,
  userLabel: (name) => `user ${name}`,
  stripNote: (n) => `Times and inode numbers are sample values · ${n} items`,
  stripEmpty: 'Empty. Anything you create with a command shows up here.',
};

export function shellStrings(lang: ShellLang = 'ko'): ShellStrings {
  return lang === 'en' ? en : ko;
}
