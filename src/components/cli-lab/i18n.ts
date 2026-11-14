// UI strings for the CLI lab components. Korean stays exactly as it was; English is for /en pages.
export type CliUiLang = 'ko' | 'en';

export interface CliStrings {
  banner: string;
  simBadge: string;
  stepPassed: (n: number, title: string) => string;
  stepTabs: string;
  stepTabLabel: (n: number, title: string, passed: boolean) => string;
  doneTitle: string;
  doneSummary: (steps: number, commands: number, errors: number) => string;
  doneNote: string;
  restart: string;
  stepOf: (n: number, total: number) => string;
  passed: string;
  hint: string;
  showAnswer: string;
  putInTerminal: string;
  takeawayTitle: string;
  takeawayEmpty: string;
  taskLabel: (n: number, total: number, title: string) => string;
  termNote: string;
  termInputLabel: string;
  termPlaceholder: string;
  acct: string;
  stripTitle: string;
  stripSub: (count: number) => string;
  stripEmpty: string;
  objects: (n: number) => string;
  versioningOn: string;
  versioningSuspended: string;
  oldVersions: (n: number) => string;
  noPolicies: string;
}

const ko: CliStrings = {
  banner:
    'CertNote CLI 연습장 — 브라우저 안에서 도는 시뮬레이터예요. 실제 AWS 로 요청을 보내지 않아요.\n' +
    'aws help 명령 목록 · Tab 자동 완성 · ↑↓ 이전 명령 · clear 화면 정리 · reset 처음부터',
  simBadge: '시뮬레이터 · 실제 AWS 호출 없음',
  stepPassed: (n, title) => `STEP ${n} 통과 · ${title}`,
  stepTabs: '단계',
  stepTabLabel: (n, title, passed) => `${n}단계 ${title}${passed ? ' (통과)' : ''}`,
  doneTitle: '완료',
  doneSummary: (steps, commands, errors) => `${steps}단계를 모두 통과했어요 · 명령 ${commands}개 · 오류 ${errors}번`,
  doneNote: '오류를 만난 횟수는 감점이 아니에요. 실제 시스템에서 같은 메시지를 다시 보면 바로 알아볼 수 있게 된 거예요.',
  restart: '처음부터 다시',
  stepOf: (n, total) => `Step ${n} / ${total}`,
  passed: '통과',
  hint: '힌트',
  showAnswer: '정답 보기',
  putInTerminal: '입력창에 넣기',
  takeawayTitle: '시험 포인트',
  takeawayEmpty: '단계를 통과하면 그 명령이 시험에서 어떻게 나오는지 여기에 정리돼요.',
  taskLabel: (n, total, title) => `STEP ${n} / ${total} · ${title}`,
  termNote: '연습장 안내',
  termInputLabel: 'AWS CLI 명령 입력',
  termPlaceholder: 'aws 로 시작해 보세요 · Tab 자동 완성',
  acct: 'acct',
  stripTitle: '계정 리소스',
  stripSub: (count) => `계정 번호·ID·시각은 예시 값 · ${count}개`,
  stripEmpty: '아직 만든 리소스가 없어요. 명령으로 무언가를 만들면 여기에 나타나요.',
  objects: (n) => `객체 ${n}`,
  versioningOn: '버전 관리 켜짐',
  versioningSuspended: '버전 관리 중지',
  oldVersions: (n) => `이전 버전 ${n}`,
  noPolicies: '정책 없음',
};

const en: CliStrings = {
  banner:
    'CertNote CLI lab: a simulator that runs in your browser. It never sends requests to real AWS.\n' +
    'Type aws help to list commands · Tab to autocomplete · Up/Down for previous commands · clear to clear the screen · reset to start over',
  simBadge: 'Simulator · no real AWS calls',
  stepPassed: (n, title) => `STEP ${n} passed · ${title}`,
  stepTabs: 'Steps',
  stepTabLabel: (n, title, passed) => `Step ${n}: ${title}${passed ? ' (passed)' : ''}`,
  doneTitle: 'Done',
  doneSummary: (steps, commands, errors) =>
    `All ${steps} steps passed · ${commands} ${commands === 1 ? 'command' : 'commands'} · ${errors} ${errors === 1 ? 'error' : 'errors'}`,
  doneNote:
    'Hitting errors is not a penalty. Now you will recognize the same message right away when you see it on a real system.',
  restart: 'Start over',
  stepOf: (n, total) => `Step ${n} / ${total}`,
  passed: 'Passed',
  hint: 'Hint',
  showAnswer: 'Show answer',
  putInTerminal: 'Put in terminal',
  takeawayTitle: 'Exam tip',
  takeawayEmpty: 'Pass a step and this panel explains how that command shows up on the exam.',
  taskLabel: (n, total, title) => `STEP ${n} / ${total} · ${title}`,
  termNote: 'Lab note',
  termInputLabel: 'Enter an AWS CLI command',
  termPlaceholder: 'Start with aws · Tab to autocomplete',
  acct: 'acct',
  stripTitle: 'Account resources',
  stripSub: (count) => `Account ID, IDs and times are sample values · ${count} ${count === 1 ? 'item' : 'items'}`,
  stripEmpty: 'No resources yet. Create something with a command and it will show up here.',
  objects: (n) => `${n} ${n === 1 ? 'object' : 'objects'}`,
  versioningOn: 'versioning on',
  versioningSuspended: 'versioning suspended',
  oldVersions: (n) => `${n} previous ${n === 1 ? 'version' : 'versions'}`,
  noPolicies: 'no policies',
};

export function cliStrings(lang: CliUiLang): CliStrings {
  return lang === 'en' ? en : ko;
}
