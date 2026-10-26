import { DEFAULT_TARGET_COVERAGE, MINUTES_PER_QUESTION, predictPass } from '../analytics/passPredictor';
import { MIN_ATTEMPTS_FOR_PREDICTION } from '../analytics/readiness';

// 목표 정하기 화면(/dashboard/goal)의 미리보기(순수). 고르는 값이 바뀔 때마다 브라우저에서 다시 계산한다.

// 학습 노트 한 개를 읽는 데 드는 시간(추정). 연습 문제 시간은 MINUTES_PER_QUESTION 으로 따로 센다.
export const MINUTES_PER_NOTE = 12;
// 이 일수 이상 남으면 "여유 있음"으로 본다.
export const COMFORT_SPARE_DAYS = 7;

export interface CertSnapshot {
  slug: string;
  totalDays: number; // 학습 노트 수
  completedDays: number; // 퀴즈를 푼 노트 수
  totalQuestions: number;
  attemptedQuestions: number;
  /** 최근 정답률(없으면 전체 정답률, 둘 다 없으면 null) */
  accuracy: number | null;
}

export interface GoalInput {
  daysUntilExam: number; // 오늘 기준 남은 일수(1 이상)
  dailyMinutes: number;
  targetAccuracy: number;
}

export type GoalFit = 'comfortable' | 'tight' | 'short';
export type MilestoneKind = 'firstMock' | 'weakReview' | 'mockTarget' | 'finalReview';

export interface Milestone {
  dayOffset: number; // 오늘로부터 며칠 뒤
  coverage: number; // 그때 기대 진도(%)
  kind: MilestoneKind;
}

export interface GoalPreview {
  notesPerDay: number; // 소수 첫째 자리
  questionsPerDay: number;
  daysNeeded: number; // 하루 dailyMinutes 로 남은 분량을 끝내는 데 드는 일수
  spareDays: number; // 음수면 시험일까지 모자란 일수
  fit: GoalFit;
  coverageAtExam: number;
  /** 시험일 예상 준비도(추정). 풀이 기록이 부족하면 null. */
  readyAtExam: number | null;
  milestones: Milestone[];
}

const MILESTONES: readonly [number, MilestoneKind][] = [
  [0.25, 'firstMock'],
  [0.5, 'weakReview'],
  [0.75, 'mockTarget'],
  [1, 'finalReview'],
];

export function previewGoal(cert: CertSnapshot, goal: GoalInput): GoalPreview {
  const days = Math.max(1, Math.round(goal.daysUntilExam));
  const minutes = Math.max(1, goal.dailyMinutes);
  const total = Math.max(1, cert.totalQuestions);
  const coverageNow = (cert.attemptedQuestions / total) * 100;

  const notesLeft = Math.max(0, cert.totalDays - cert.completedDays);
  const questionsLeft = Math.max(0, Math.ceil((DEFAULT_TARGET_COVERAGE / 100) * total) - cert.attemptedQuestions);
  const totalMinutes = notesLeft * MINUTES_PER_NOTE + questionsLeft * MINUTES_PER_QUESTION;
  const daysNeeded = totalMinutes === 0 ? 0 : Math.ceil(totalMinutes / minutes);
  const spanDays = Math.max(1, daysNeeded);

  const spareDays = days - daysNeeded;
  const fit: GoalFit = spareDays >= COMFORT_SPARE_DAYS ? 'comfortable' : spareDays >= 0 ? 'tight' : 'short';

  // 하루 dailyMinutes 씩 하면 시험일까지 남은 분량의 몇 %를 하나.
  const doneFraction = Math.min(1, days / spanDays);
  const coverageAt = (fraction: number) =>
    Math.round(Math.min(100, coverageNow + Math.max(0, DEFAULT_TARGET_COVERAGE - coverageNow) * fraction));
  const coverageAtExam = coverageAt(doneFraction);

  let readyAtExam: number | null = null;
  if (cert.accuracy !== null && cert.attemptedQuestions >= MIN_ATTEMPTS_FOR_PREDICTION) {
    readyAtExam = predictPass({
      coverage: coverageAtExam,
      accuracy: cert.accuracy,
      recentAccuracy: cert.accuracy,
      totalQuestions: total,
      attemptedQuestions: Math.round((coverageAtExam / 100) * total),
      dday: null, // 시험일 시점의 모습이라 남은 시간 감점은 넣지 않는다.
      targetAccuracy: goal.targetAccuracy,
    }).probability;
  }

  // 중간 목표는 "끝나는 날"과 "시험일" 중 이른 쪽까지를 4등분한다.
  const horizon = Math.min(days, spanDays);
  const milestones = MILESTONES.map(([f, kind]) => ({
    dayOffset: Math.max(1, Math.round(horizon * f)),
    coverage: coverageAt(Math.min(1, (horizon * f) / spanDays)),
    kind,
  }));

  return {
    notesPerDay: Math.round((notesLeft / spanDays) * 10) / 10,
    questionsPerDay: Math.ceil(questionsLeft / spanDays),
    daysNeeded,
    spareDays,
    fit,
    coverageAtExam,
    readyAtExam,
    milestones,
  };
}
