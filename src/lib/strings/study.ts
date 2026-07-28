import type { Dict } from './dict';

/**
 * Strings for the study plan widget and the dashboard analytics widgets
 * (pass probability gauge, accuracy/activity trend chart).
 *
 * Counts and dates are interpolated with `{name}` placeholders rather than being
 * concatenated from translated fragments — Korean puts the unit after the number
 * and English usually puts it before, so a template per language is the only way
 * both read naturally.
 */

/** Replace `{name}` placeholders. Unknown placeholders are left untouched. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole,
  );
}

/** One run of a rich template: `bold` marks text that was wrapped in `*…*`. */
export interface RichPart {
  text: string;
  bold: boolean;
}

/**
 * Format a template whose emphasised runs are marked with `*asterisks*`.
 *
 * 문장 중간의 <b> 위치가 언어마다 다르다. 조각을 이어붙이면 어순이 깨지므로
 * 강조 구간을 번역문 안에 표시해 두고 렌더 시점에 잘라 쓴다.
 */
export function fmtRich(template: string, values: Record<string, string | number>): RichPart[] {
  return fmt(template, values)
    .split('*')
    .map((text, i) => ({ text, bold: i % 2 === 1 }))
    .filter((part) => part.text !== '');
}

type StudyPlanKey =
  | 'planTitle'
  | 'noStreak'
  | 'streakBadge'
  | 'streakUnit'
  | 'longestBadge'
  | 'examDateLabel'
  | 'catchUp'
  | 'todayHeading'
  | 'allDone'
  | 'nothingToday'
  | 'changeExamDate'
  | 'goalsHeading'
  | 'targetAccuracy'
  | 'dailyLabel'
  | 'minutesUnit'
  | 'saving'
  | 'save'
  | 'saved'
  | 'selectCertAndDate'
  | 'saveFailed'
  | 'planIntro'
  | 'certAriaLabel'
  | 'saveExamDate'
  | 'cancel'
  | 'deletePlan';

export const studyPlanStrings: Dict<StudyPlanKey> = {
  ko: {
    planTitle: '합격 플랜',
    noStreak: '스트릭 없음',
    streakBadge: '{n}일 연속',
    streakUnit: '일 연속',
    longestBadge: '최장 {n}일',
    examDateLabel: '시험일 {date}',
    catchUp: '일정보다 *{behind}일* 뒤처졌어요. 시험일에 맞추려고 오늘 분량을 *{from}개 → {to}개*로 늘렸어요.',
    todayHeading: '오늘 학습 분량',
    allDone: '예정 분량을 모두 마쳤어요. 복습으로 마무리해요 💪',
    nothingToday: '오늘 배정된 분량이 없어요.',
    changeExamDate: '시험일 변경',
    goalsHeading: '학습 목표',
    targetAccuracy: '목표 정확도',
    dailyLabel: '하루',
    minutesUnit: '분',
    saving: '저장 중…',
    save: '저장',
    saved: '저장됨',
    selectCertAndDate: '자격증과 시험일을 선택하세요.',
    saveFailed: '저장하지 못했습니다.',
    planIntro: '시험일을 정하면 D-day 카운트다운과 매일 학습 분량을 챙겨드려요.',
    certAriaLabel: '자격증',
    saveExamDate: '시험일 저장',
    cancel: '취소',
    deletePlan: '플랜 삭제',
  },
  en: {
    planTitle: 'Study Plan',
    noStreak: 'No streak',
    streakBadge: '{n}-day streak',
    streakUnit: 'day streak',
    longestBadge: 'Best {n}d',
    examDateLabel: 'Exam {date}',
    catchUp: "You're *{behind}d* behind. To hit your exam date, today's load went from *{from} to {to}*.",
    todayHeading: "Today's load",
    allDone: "You've finished everything scheduled. Wrap up with a review 💪",
    nothingToday: 'Nothing scheduled for today.',
    changeExamDate: 'Change exam date',
    goalsHeading: 'Study goals',
    targetAccuracy: 'Target accuracy',
    dailyLabel: 'Daily',
    minutesUnit: 'min',
    saving: 'Saving…',
    save: 'Save',
    saved: 'Saved',
    selectCertAndDate: 'Pick a certification and an exam date.',
    saveFailed: "Couldn't save. Please try again.",
    planIntro: "Set your exam date and we'll count down the days and hand you a portion to study each day.",
    certAriaLabel: 'Certification',
    saveExamDate: 'Save exam date',
    cancel: 'Cancel',
    deletePlan: 'Delete plan',
  },
};

type TrendKey =
  | 'title'
  | 'emptyHint'
  | 'lastNDays'
  | 'avgAccuracy'
  | 'solved'
  | 'activeDays'
  | 'chartAria'
  | 'legendAccuracy'
  | 'legendActivity';

export const trendChartStrings: Dict<TrendKey> = {
  ko: {
    title: '학습 추이',
    emptyHint: '며칠 풀이가 쌓이면 정답률·활동량 추이가 여기에 그려집니다.',
    lastNDays: '최근 {n}일',
    avgAccuracy: '평균 정답률',
    solved: '푼 문제',
    activeDays: '학습한 날',
    chartAria: '정답률·활동량 추이',
    legendAccuracy: '정답률',
    legendActivity: '활동량',
  },
  en: {
    title: 'Trend',
    emptyHint: 'Practice over a few days to see your accuracy and activity trend.',
    lastNDays: 'Last {n} days',
    avgAccuracy: 'Avg accuracy',
    solved: 'Solved',
    activeDays: 'Active days',
    chartAria: 'Accuracy and activity trend',
    legendAccuracy: 'Accuracy',
    legendActivity: 'Activity',
  },
};

type PassProbabilityKey =
  | 'title'
  | 'estimate'
  | 'verdictOnTrack'
  | 'verdictBehind'
  | 'verdictAtRisk'
  | 'exam'
  | 'daysAgo'
  | 'notSet'
  | 'dailyTarget'
  | 'dailyTargetValue'
  | 'disclaimer';

export const passProbabilityStrings: Dict<PassProbabilityKey> = {
  ko: {
    title: '합격 가능성',
    estimate: '추정',
    verdictOnTrack: '순조로움',
    verdictBehind: '분발 필요',
    verdictAtRisk: '위기',
    exam: '시험',
    daysAgo: '{n}일 지남',
    notSet: '미설정',
    dailyTarget: '하루 권장',
    dailyTargetValue: '{questions}문제 · {minutes}분',
    disclaimer: '커버리지·정답률·남은 기간으로 추정한 값이며 보장이 아닙니다. 풀이가 쌓일수록 정확해집니다.',
  },
  en: {
    title: 'Pass Probability',
    estimate: 'estimate',
    verdictOnTrack: 'On track',
    verdictBehind: 'Behind',
    verdictAtRisk: 'At risk',
    exam: 'Exam',
    daysAgo: '{n}d ago',
    notSet: 'Not set',
    dailyTarget: 'Daily target',
    dailyTargetValue: '{questions} Q · {minutes}m',
    disclaimer: 'Estimated from coverage, accuracy, and time left — not a guarantee. Improves as you practice.',
  },
};
