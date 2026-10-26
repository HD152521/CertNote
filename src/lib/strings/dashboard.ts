import type { Dict } from './dict';

/**
 * Strings for the learner dashboard (/dashboard), its stats (/dashboard/stats),
 * readiness (/dashboard/readiness) and goal (/dashboard/goal) screens.
 *
 * Emphasised runs are wrapped in `*…*` and rendered with `fmtRich` (lib/strings/study.ts) —
 * the bold word sits in a different place in each language.
 */

type DashboardKey =
  | 'eyebrow'
  | 'title'
  | 'streak'
  | 'noStreak'
  | 'todayHeading'
  | 'examLine'
  | 'editPlan'
  | 'catchUp'
  | 'allDone'
  | 'nothingToday'
  | 'continueReading'
  | 'startReview'
  | 'noPlanTitle'
  | 'noPlanBody'
  | 'setGoal'
  | 'startHere'
  | 'progressHeading'
  | 'progressHeadingAll'
  | 'seeStats'
  | 'triedOf'
  | 'legendCorrect'
  | 'legendWrong'
  | 'legendUntried'
  | 'barAria'
  | 'passLabel'
  | 'estimateTag'
  | 'state_pending'
  | 'state_on_track'
  | 'state_behind'
  | 'state_at_risk'
  | 'pendingHint'
  | 'whyLink'
  | 'othersHeading'
  | 'otherLine'
  | 'emptyProgress'
  | 'weakHeading'
  | 'notebookLink'
  | 'weakDomainKind'
  | 'weakTopicKind'
  | 'weakCount'
  | 'weekLabel'
  | 'practiceDomain'
  | 'practiceTopic'
  | 'weakEmpty';

export const dashboardStrings: Dict<DashboardKey> = {
  ko: {
    eyebrow: 'DASHBOARD',
    title: '오늘의 학습',
    streak: '{n}일 연속',
    noStreak: '오늘 첫날을 채워 보세요',
    todayHeading: '오늘 할 일',
    examLine: '시험일 {date} · 하루 노트 {n}개',
    editPlan: '플랜 수정',
    catchUp: '계획보다 노트 *{behind}개*가 밀렸어요. 따라잡도록 하루 분량을 *{from} → {to}개*로 늘렸어요.',
    allDone: '계획한 노트를 다 읽었어요. 복습과 모의고사로 마무리해요.',
    nothingToday: '오늘 배정된 노트가 없어요.',
    continueReading: '이어서 읽기 · {where}',
    startReview: '복습 {n}문제 시작',
    noPlanTitle: '목표를 정하면 매일 할 일을 챙겨 드려요',
    noPlanBody: '시험일과 하루 공부 시간을 고르면 오늘 읽을 노트와 합격 준비도를 계산해요.',
    setGoal: '목표 정하기',
    startHere: '여기서 시작 · {title}',
    progressHeading: '{code} 어디까지 왔나',
    progressHeadingAll: '어디까지 왔나',
    seeStats: '전체 통계 보기',
    triedOf: '*{n}* / {total}문제 풀어봄',
    legendCorrect: '맞힘 {n}',
    legendWrong: '아직 못 맞힘 {n}',
    legendUntried: '안 푼 문제 {n}',
    barAria: '전체 {total}문제 중 {tried}문제를 풀었고 {solved}문제를 맞혔어요',
    passLabel: '합격 가능성',
    estimateTag: '추정',
    state_pending: '예측 전',
    state_on_track: '순조로움',
    state_behind: '조금 늦음',
    state_at_risk: '위험',
    pendingHint: '{n}문제 더 풀면 계산해요',
    whyLink: '왜 이 숫자?',
    othersHeading: '같이 공부 중',
    otherLine: '진도 {cov}% · 정답률 {acc}%',
    emptyProgress: '아직 푼 문제가 없어요. 노트 끝의 연습 문제를 풀면 여기에 쌓여요.',
    weakHeading: '약한 곳',
    notebookLink: '오답노트 보기',
    weakDomainKind: '시험 도메인',
    weakTopicKind: '주차 퀴즈',
    weakCount: '{n}문제 풀이',
    weekLabel: '{code} · {week}주차',
    practiceDomain: '모의고사로 연습',
    practiceTopic: '{week}주차 다시 보기',
    weakEmpty: '아직 약한 곳을 가릴 만큼 풀지 않았어요. 한 영역에서 {n}문제 넘게 풀면 보여 드려요.',
  },
  en: {
    eyebrow: 'DASHBOARD',
    title: "Today's study",
    streak: '{n}-day streak',
    noStreak: 'Start your streak today',
    todayHeading: 'Today',
    examLine: 'Exam {date} · {n} notes a day',
    editPlan: 'Edit plan',
    catchUp: "You're *{behind} notes* behind. To catch up, today's load went from *{from} to {to}*.",
    allDone: "You've read every planned note. Wrap up with reviews and mock exams.",
    nothingToday: 'No notes scheduled for today.',
    continueReading: 'Continue · {where}',
    startReview: 'Review {n} questions',
    noPlanTitle: 'Set a goal and we’ll plan each day for you',
    noPlanBody: 'Pick your exam date and daily study time to get today’s notes and a readiness estimate.',
    setGoal: 'Set a goal',
    startHere: 'Start here · {title}',
    progressHeading: 'How far along: {code}',
    progressHeadingAll: 'How far along',
    seeStats: 'All stats',
    triedOf: '*{n}* of {total} questions tried',
    legendCorrect: 'Correct {n}',
    legendWrong: 'Not yet correct {n}',
    legendUntried: 'Untried {n}',
    barAria: 'Tried {tried} of {total} questions, {solved} answered correctly',
    passLabel: 'Pass chance',
    estimateTag: 'estimate',
    state_pending: 'Not enough data',
    state_on_track: 'On track',
    state_behind: 'A bit behind',
    state_at_risk: 'At risk',
    pendingHint: 'Solve {n} more to see it',
    whyLink: 'Why this number?',
    othersHeading: 'Also studying',
    otherLine: 'Progress {cov}% · Accuracy {acc}%',
    emptyProgress: 'No questions solved yet. Practice questions at the end of each note will show up here.',
    weakHeading: 'Weak spots',
    notebookLink: 'Wrong-answer notebook',
    weakDomainKind: 'Exam domain',
    weakTopicKind: 'Weekly quiz',
    weakCount: '{n} answered',
    weekLabel: '{code} · Week {week}',
    practiceDomain: 'Practice in a mock exam',
    practiceTopic: 'Revisit week {week}',
    weakEmpty: 'Not enough answers to spot weak areas yet. Solve more than {n} questions in an area to see it here.',
  },
};

type StatsKey =
  | 'title'
  | 'back'
  | 'tileAccuracy'
  | 'tileSolved'
  | 'tileReview'
  | 'tileMastered'
  | 'unitQuestions'
  | 'calendarHeading'
  | 'calendarSummary'
  | 'domainHeading'
  | 'domainNote'
  | 'domainEmpty'
  | 'topicHeading'
  | 'topicNote'
  | 'colWeek'
  | 'colAccuracy'
  | 'colAttempts'
  | 'recentHeading'
  | 'correct'
  | 'wrong'
  | 'mockExam'
  | 'empty'
  | 'justNow'
  | 'minAgo'
  | 'hrAgo'
  | 'dayAgo'
  | 'moAgo';

export const statsStrings: Dict<StatsKey> = {
  ko: {
    title: '학습 통계',
    back: '← 대시보드',
    tileAccuracy: '정답률',
    tileSolved: '푼 문제',
    tileReview: '복습 대기',
    tileMastered: '마스터',
    unitQuestions: '문제',
    calendarHeading: '공부한 날',
    calendarSummary: '현재 {current}일 연속 · 최장 {longest}일',
    domainHeading: '시험 도메인별 정답률',
    domainNote: '모의고사 기준',
    domainEmpty: '모의고사를 풀면 시험 도메인별 정답률이 여기에 쌓여요.',
    topicHeading: '주차별 퀴즈 정답률',
    topicNote: '낮은 순',
    colWeek: '주차',
    colAccuracy: '정답률',
    colAttempts: '풀이',
    recentHeading: '최근 푼 문제',
    correct: '정답',
    wrong: '오답',
    mockExam: '모의고사',
    empty: '아직 풀이 기록이 없어요. 연습 문제를 풀면 진도·정답률·복습 현황이 여기에 쌓여요.',
    justNow: '방금 전',
    minAgo: '{n}분 전',
    hrAgo: '{n}시간 전',
    dayAgo: '{n}일 전',
    moAgo: '{n}개월 전',
  },
  en: {
    title: 'Study stats',
    back: '← Dashboard',
    tileAccuracy: 'Accuracy',
    tileSolved: 'Tried',
    tileReview: 'Due for review',
    tileMastered: 'Mastered',
    unitQuestions: '',
    calendarHeading: 'Study days',
    calendarSummary: '{current}-day streak · best {longest} days',
    domainHeading: 'Accuracy by exam domain',
    domainNote: 'from mock exams',
    domainEmpty: 'Take a mock exam to see your accuracy by exam domain here.',
    topicHeading: 'Weekly quiz accuracy',
    topicNote: 'lowest first',
    colWeek: 'Week',
    colAccuracy: 'Accuracy',
    colAttempts: 'Answered',
    recentHeading: 'Recently answered',
    correct: 'Correct',
    wrong: 'Wrong',
    mockExam: 'Mock exam',
    empty: 'No practice records yet. Solve practice questions to see progress, accuracy and reviews here.',
    justNow: 'just now',
    minAgo: '{n}m ago',
    hrAgo: '{n}h ago',
    dayAgo: '{n}d ago',
    moAgo: '{n}mo ago',
  },
};

type ReadinessKey =
  | 'title'
  | 'scaleAria'
  | 'scaleRisk'
  | 'scaleBehind'
  | 'scaleOn'
  | 'summaryPace'
  | 'summaryExtra'
  | 'summaryEnough'
  | 'summaryNoSchedule'
  | 'summaryPending'
  | 'whyHeading'
  | 'goalValue'
  | 'factorCoverage'
  | 'factorCoverageWeight'
  | 'coverageNoteLow'
  | 'coverageNoteOk'
  | 'factorAccuracy'
  | 'factorAccuracyAll'
  | 'factorAccuracyWeight'
  | 'accuracyNoteOk'
  | 'accuracyNoteLow'
  | 'factorTime'
  | 'factorTimeWeight'
  | 'timeNow'
  | 'timeGoal'
  | 'timeNoteOk'
  | 'timeNoteLow'
  | 'projectionHeading'
  | 'legendNow'
  | 'legendPace'
  | 'legendRequired'
  | 'goalLine'
  | 'today'
  | 'chartAria'
  | 'leversHeading'
  | 'leverCoverage'
  | 'leverCoverageHow'
  | 'leverCoverageHowNoDate'
  | 'leverAccuracy'
  | 'leverAccuracyHow'
  | 'leverBoth'
  | 'leverBothHow'
  | 'ctaPlan'
  | 'ctaWeak'
  | 'leversNone'
  | 'howHeading'
  | 'how1'
  | 'how2'
  | 'how3'
  | 'how4'
  | 'setExamDate';

export const readinessStrings: Dict<ReadinessKey> = {
  ko: {
    title: '합격 준비도',
    scaleAria: '0부터 100 사이에서 {p}. 40 미만 위험, 40부터 64 조금 늦음, 65 이상 순조로움',
    scaleRisk: '위험',
    scaleBehind: '조금 늦음',
    scaleOn: '순조로움 65+',
    summaryPace: '지금 속도(하루 새 문제 *{pace}개*)면 시험일에 진도가 *{atExam}%*에서 멈춰요.',
    summaryExtra: '하루 *{extra}문제만 더* 풀면 목표 진도 {goal}%에 닿아요.',
    summaryEnough: '이 속도면 시험 전에 목표 진도 {goal}%에 닿아요.',
    summaryNoSchedule: '시험일을 정하면 시험일까지 진도가 어떻게 될지 계산해 드려요.',
    summaryPending: '아직 {n}문제를 풀었어요. {min}문제를 넘기면 합격 가능성을 계산해요.',
    whyHeading: '이 숫자는 이렇게 나왔어요',
    goalValue: '목표 {goal}',
    factorCoverage: '진도',
    factorCoverageWeight: '반영 45%',
    coverageNoteLow: '{total}문제 중 {tried}문제를 풀어봤어요. 목표까지 {left}문제 남았어요.',
    coverageNoteOk: '목표 진도를 채웠어요.',
    factorAccuracy: '최근 정답률',
    factorAccuracyAll: '전체 정답률',
    factorAccuracyWeight: '반영 55%',
    accuracyNoteOk: '플랜에서 정한 목표({goal}%)를 넘어 감점이 없어요.',
    accuracyNoteLow: '플랜에서 정한 목표({goal}%)보다 낮아 점수를 깎고 있어요.',
    factorTime: '남은 시간',
    factorTimeWeight: '감점 조건',
    timeNow: '하루 {n}문제',
    timeGoal: '{n}문제 이하',
    timeNoteOk: 'D-{dday}. 목표 진도까지 하루 {n}문제(약 {m}분)면 돼요.',
    timeNoteLow: 'D-{dday}. 하루 {n}문제가 필요해 {limit}문제를 넘어요. 시간 부족으로 점수를 깎고 있어요.',
    projectionHeading: '시험일까지 진도 예상',
    legendNow: '오늘',
    legendPace: '지금 속도',
    legendRequired: '하루 {n}문제',
    goalLine: '목표 진도 {goal}%',
    today: '오늘',
    chartAria: '오늘 진도 {now}%. 지금 속도면 시험일에 {pace}%, 하루 {req}문제씩이면 {goal}%.',
    leversHeading: '이렇게 하면 이만큼 올라요',
    leverCoverage: '진도 {goal}%까지 채우기',
    leverCoverageHow: '시험일까지 하루 새 문제 {n}개씩 풀어요.',
    leverCoverageHowNoDate: '남은 {n}문제를 풀어요.',
    leverAccuracy: '정답률 {goal}%로 올리기',
    leverAccuracyHow: '약한 곳부터 다시 풀어요.',
    leverBoth: '둘 다 하기',
    leverBothHow: '진도 {cov}% + 정답률 {acc}%',
    ctaPlan: '플랜 조정',
    ctaWeak: '약한 곳 풀기',
    leversNone: '진도와 정답률 모두 목표를 넘었어요. 모의고사로 실전 감각을 유지하세요.',
    howHeading: '어떻게 계산하나요?',
    how1: '진도(45%)와 최근 정답률(55%)을 섞어 준비도를 냅니다.',
    how2: '최근 정답률이 목표보다 낮으면 깎습니다. 다 풀어도 못 맞히면 떨어지니까요.',
    how3: '목표 진도까지 하루 20문제 넘게 필요하면 시간 부족으로 깎습니다.',
    how4: '실제 합격·불합격 기록으로 맞춰 본 값이 아닙니다. 방향을 보는 용도로 써 주세요.',
    setExamDate: '시험일 정하기',
  },
  en: {
    title: 'Exam readiness',
    scaleAria: '{p} on a 0–100 scale. Under 40 at risk, 40 to 64 a bit behind, 65 and up on track',
    scaleRisk: 'At risk',
    scaleBehind: 'A bit behind',
    scaleOn: 'On track 65+',
    summaryPace: 'At your current pace (*{pace} new questions* a day) you’ll reach *{atExam}%* by exam day.',
    summaryExtra: 'Solve just *{extra} more a day* to reach the {goal}% goal.',
    summaryEnough: 'At this pace you’ll reach the {goal}% goal before the exam.',
    summaryNoSchedule: 'Set your exam date and we’ll project your progress up to exam day.',
    summaryPending: 'You’ve solved {n} questions so far. We’ll estimate your pass chance after {min}.',
    whyHeading: 'Where this number comes from',
    goalValue: 'goal {goal}',
    factorCoverage: 'Progress',
    factorCoverageWeight: '45% weight',
    coverageNoteLow: 'Tried {tried} of {total} questions. {left} to go to reach the goal.',
    coverageNoteOk: 'You’ve reached the progress goal.',
    factorAccuracy: 'Recent accuracy',
    factorAccuracyAll: 'Overall accuracy',
    factorAccuracyWeight: '55% weight',
    accuracyNoteOk: 'Above your plan’s goal ({goal}%), so no penalty.',
    accuracyNoteLow: 'Below your plan’s goal ({goal}%), which lowers the score.',
    factorTime: 'Time left',
    factorTimeWeight: 'penalty check',
    timeNow: '{n} a day',
    timeGoal: '≤ {n}',
    timeNoteOk: 'D-{dday}. {n} questions a day (about {m} min) gets you to the goal.',
    timeNoteLow: 'D-{dday}. You’d need {n} a day, more than {limit}, so the score is lowered for time.',
    projectionHeading: 'Projected progress to exam day',
    legendNow: 'Today',
    legendPace: 'Current pace',
    legendRequired: '{n} a day',
    goalLine: 'Goal {goal}%',
    today: 'Today',
    chartAria: 'Progress today {now}%. At your current pace {pace}% by exam day, {goal}% at {req} a day.',
    leversHeading: 'What would raise it',
    leverCoverage: 'Reach {goal}% progress',
    leverCoverageHow: 'Solve {n} new questions a day until the exam.',
    leverCoverageHowNoDate: 'Solve the remaining {n} questions.',
    leverAccuracy: 'Raise accuracy to {goal}%',
    leverAccuracyHow: 'Redo your weak spots first.',
    leverBoth: 'Do both',
    leverBothHow: 'Progress {cov}% + accuracy {acc}%',
    ctaPlan: 'Adjust plan',
    ctaWeak: 'Practice weak spots',
    leversNone: 'Both progress and accuracy are above goal. Keep sharp with mock exams.',
    howHeading: 'How is this calculated?',
    how1: 'Readiness mixes progress (45%) and recent accuracy (55%).',
    how2: 'If recent accuracy is below your goal, it’s lowered — finishing everything doesn’t help if answers are wrong.',
    how3: 'If reaching the progress goal needs more than 20 questions a day, it’s lowered for time.',
    how4: 'It hasn’t been checked against real pass/fail results. Use it to see direction, not as a promise.',
    setExamDate: 'Set exam date',
  },
};

type GoalKey =
  | 'eyebrow'
  | 'title'
  | 'intro'
  | 'close'
  | 'step1'
  | 'step2'
  | 'step3'
  | 'step4'
  | 'weeksLater'
  | 'customDate'
  | 'dateHint'
  | 'minutes'
  | 'minHint15'
  | 'minHint30'
  | 'minHint45'
  | 'minHint60'
  | 'accuracyHint'
  | 'previewHeading'
  | 'perDayLabel'
  | 'perDayValue'
  | 'finishLabel'
  | 'afterExam'
  | 'fitComfortable'
  | 'fitTight'
  | 'fitShort'
  | 'readyLabel'
  | 'readyPending'
  | 'milestonesHeading'
  | 'ms_firstMock'
  | 'ms_weakReview'
  | 'ms_mockTarget'
  | 'ms_finalReview'
  | 'estimateNote'
  | 'save'
  | 'saving'
  | 'saveFailed'
  | 'pastDate'
  | 'deletePlan';

export const goalStrings: Dict<GoalKey> = {
  ko: {
    eyebrow: 'STUDY PLAN',
    title: '목표 정하기',
    intro: '고르는 대로 계획이 바로 바뀌어요.',
    close: '닫기',
    step1: '어떤 시험을 보나요?',
    step2: '시험은 언제예요?',
    step3: '하루에 얼마나 공부할 수 있어요?',
    step4: '연습 문제 목표 정답률',
    weeksLater: '{n}주 뒤',
    customDate: '직접 입력',
    dateHint: '아직 날짜를 안 정했으면 8주 뒤로 시작해도 돼요. 나중에 바꿀 수 있어요.',
    minutes: '{n}분',
    minHint15: '출퇴근길',
    minHint30: '점심시간',
    minHint45: '저녁 한 타임',
    minHint60: '집중 모드',
    accuracyHint: '연습 문제를 꾸준히 75% 넘게 맞히면 실제 시험에서 여유가 생겨요.',
    previewHeading: '이렇게 공부하게 돼요',
    perDayLabel: '하루 분량',
    perDayValue: '노트 {notes}개 + 문제 {q}개',
    finishLabel: '다 끝나는 날',
    afterExam: '(시험 후)',
    fitComfortable: '시험 {n}일 전에 끝나요. 남는 기간엔 모의고사와 복습을 하세요.',
    fitTight: '빠듯하지만 시험 전에 끝나요. 하루 빠지면 다음 날 분량이 늘어요.',
    fitShort: '시험일까지 {n}일 모자라요. 시간을 늘리거나 시험일을 미뤄 보세요.',
    readyLabel: '시험일 예상 준비도',
    readyPending: '문제를 {n}개 넘게 풀면 계산해요.',
    milestonesHeading: '중간 목표',
    ms_firstMock: '진도 {cov}% · 첫 모의고사',
    ms_weakReview: '진도 {cov}% · 약한 곳 다시 풀기',
    ms_mockTarget: '진도 {cov}% · 모의고사 {acc}% 넘기기',
    ms_finalReview: '진도 {cov}% · 전체 복습',
    estimateNote: '노트 한 개 {note}분, 문제 한 개 {q}분으로 어림했어요.',
    save: '이 계획으로 시작',
    saving: '저장 중…',
    saveFailed: '저장하지 못했어요. 다시 시도해 주세요.',
    pastDate: '시험일은 오늘 이후여야 해요.',
    deletePlan: '이 자격증 플랜 삭제',
  },
  en: {
    eyebrow: 'STUDY PLAN',
    title: 'Set your goal',
    intro: 'The plan updates as you choose.',
    close: 'Close',
    step1: 'Which exam are you taking?',
    step2: 'When is the exam?',
    step3: 'How much can you study a day?',
    step4: 'Target practice accuracy',
    weeksLater: 'In {n} weeks',
    customDate: 'Pick a date',
    dateHint: 'No date yet? Start with 8 weeks — you can change it later.',
    minutes: '{n} min',
    minHint15: 'Commute',
    minHint30: 'Lunch break',
    minHint45: 'An evening slot',
    minHint60: 'Deep focus',
    accuracyHint: 'Consistently scoring above 75% in practice gives you room on the real exam.',
    previewHeading: 'Here’s your plan',
    perDayLabel: 'Each day',
    perDayValue: '{notes} notes + {q} questions',
    finishLabel: 'Finish date',
    afterExam: '(after exam)',
    fitComfortable: 'You’ll finish {n} days before the exam. Use the rest for mock exams and reviews.',
    fitTight: 'Tight, but you’ll finish before the exam. Missing a day adds to the next.',
    fitShort: 'You’re {n} days short. Study longer each day or move the exam date.',
    readyLabel: 'Projected readiness on exam day',
    readyPending: 'Solve more than {n} questions to see this.',
    milestonesHeading: 'Milestones',
    ms_firstMock: 'Progress {cov}% · first mock exam',
    ms_weakReview: 'Progress {cov}% · redo weak spots',
    ms_mockTarget: 'Progress {cov}% · score over {acc}% on a mock',
    ms_finalReview: 'Progress {cov}% · full review',
    estimateNote: 'Estimated at {note} min per note and {q} min per question.',
    save: 'Start with this plan',
    saving: 'Saving…',
    saveFailed: 'Couldn’t save. Please try again.',
    pastDate: 'The exam date must be after today.',
    deletePlan: 'Delete this plan',
  },
};
