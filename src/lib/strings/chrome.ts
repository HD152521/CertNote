import type { Language } from '../i18n';
import type { Dict } from './dict';

/**
 * 앱 전반의 자잘한 UI 껍데기 — 오류 화면, 검색 다이얼로그, 이어읽기 카드,
 * 페이월, 오답 사유 선택, 시험일 유도 배너, 스트릭 달력.
 *
 * 화면 하나를 통째로 차지하지 않는 조각들이라 화면별 모듈 대신 여기 모은다.
 */
export type ChromeKey =
  // 오류 화면 (error.tsx / global-error.tsx)
  | 'errorTitle'
  | 'errorBody'
  | 'errorCode'
  | 'retry'
  | 'goHome'
  // 검색
  | 'searchPlaceholder'
  | 'searchLoading'
  | 'searchNoResults'
  | 'searchNavigate'
  | 'searchOpen'
  // 이어읽기
  | 'startHere'
  | 'startFirstPage'
  | 'continueReading'
  | 'continueCta'
  // 페이월
  | 'paywallTitle'
  | 'paywallBody'
  | 'paywallCta'
  // 오답 사유
  | 'reasonConcept'
  | 'reasonMistake'
  | 'reasonForgot'
  | 'reasonPrompt'
  | 'reasonPromptHint'
  // 시험일 유도
  | 'examNudgeNoDate'
  | 'examNudgeBody'
  | 'examNudgeCta'
  // 스트릭 달력
  | 'legendStudied'
  | 'legendFreeze'
  | 'legendMissed'
  // 자잘한 컨트롤
  | 'certCardStart'
  | 'searchLabel'
  | 'themeToggleLabel'
  | 'tocTitle'
  | 'selectPlaceholder';

export const chromeStrings: Dict<ChromeKey> = {
  ko: {
    errorTitle: '문제가 발생했어요',
    errorBody: '일시적인 오류일 수 있어요. 잠시 후 다시 시도해 주세요.',
    errorCode: '코드',
    retry: '다시 시도',
    goHome: '홈으로',
    searchPlaceholder: '제목·본문·코드로 검색...',
    searchLoading: '불러오는 중…',
    searchNoResults: '결과 없음',
    searchNavigate: '이동',
    searchOpen: '열기',
    startHere: '여기서 시작하세요',
    startFirstPage: '목표 자격증 첫 페이지 시작',
    continueReading: '이어서 읽기',
    continueCta: '계속',
    paywallTitle: '여기부터는 Pro 전용입니다',
    paywallBody:
      'Week 1은 누구나 무료로 볼 수 있어요. Week 2부터의 전체 학습 자료와 모의고사·무제한 복습은 Pro 플랜에서 이용할 수 있습니다.',
    paywallCta: 'Pro 알아보기',
    reasonConcept: '개념 부족',
    reasonMistake: '실수',
    reasonForgot: '기억 안 남',
    reasonPrompt: '왜 틀렸나요?',
    reasonPromptHint: '(약점 분석에 반영)',
    examNudgeNoDate: '시험일을 정해두면 완주가 쉬워져요',
    examNudgeBody: '시험일을 등록하면 D-day 카운트다운과 매일 학습 분량을 챙겨드려요.',
    examNudgeCta: '시험일 등록하기 →',
    legendStudied: '학습',
    legendFreeze: '프리즈',
    legendMissed: '미학습',
    certCardStart: '시작',
    searchLabel: '검색',
    themeToggleLabel: '다크모드 토글',
    tocTitle: '이 페이지',
    selectPlaceholder: '선택',
  },
  en: {
    errorTitle: 'Something went wrong',
    errorBody: 'This may be temporary. Please try again in a moment.',
    errorCode: 'Code',
    retry: 'Try again',
    goHome: 'Go home',
    searchPlaceholder: 'Search titles, text, and code…',
    searchLoading: 'Loading…',
    searchNoResults: 'No results',
    searchNavigate: 'Navigate',
    searchOpen: 'Open',
    startHere: 'Start here',
    startFirstPage: 'Open the first page of your target cert',
    continueReading: 'Pick up where you left off',
    continueCta: 'Continue',
    paywallTitle: 'The rest is Pro only',
    paywallBody:
      'Week 1 is free for everyone. Week 2 onwards — plus mock exams and unlimited review — is included in the Pro plan.',
    paywallCta: 'See Pro',
    reasonConcept: "Didn't know the concept",
    reasonMistake: 'Careless mistake',
    reasonForgot: "Couldn't recall it",
    reasonPrompt: 'Why did you miss this?',
    reasonPromptHint: '(feeds your weak-area analysis)',
    examNudgeNoDate: 'Setting an exam date makes finishing much easier',
    examNudgeBody: 'Add your exam date and we’ll track the countdown and your daily workload.',
    examNudgeCta: 'Set your exam date →',
    legendStudied: 'Studied',
    legendFreeze: 'Freeze',
    legendMissed: 'Missed',
    certCardStart: 'Start',
    searchLabel: 'Search',
    themeToggleLabel: 'Toggle dark mode',
    tocTitle: 'On this page',
    selectPlaceholder: 'Select',
  },
};

/** "총 12개 페이지" — 검색 결과 개수. */
export function formatSearchCount(lang: Language, n: number): string {
  return lang === 'en' ? `${n} page${n === 1 ? '' : 's'}` : `총 ${n}개 페이지`;
}

/** "🔥 7일 연속 학습 중이에요!" — 스트릭 배너. */
export function formatStreakBanner(lang: Language, days: number): string {
  return lang === 'en'
    ? `🔥 ${days}-day streak going!`
    : `🔥 ${days}일 연속 학습 중이에요!`;
}

/** "12주 · 총 60일" — 자격증 카드의 분량 요약. */
export function formatCertLength(lang: Language, weeks: number, days: number): string {
  return lang === 'en'
    ? `${weeks} week${weeks === 1 ? '' : 's'} · ${days} days`
    : `${weeks}주 · ${days}일`;
}

/** "최근 12주" — 스트릭 달력이 보여주는 기간. */
export function formatRecentWeeks(lang: Language, weeks: number): string {
  return lang === 'en' ? `Last ${weeks} weeks` : `최근 ${weeks}주`;
}
