import {
  DEFAULT_TARGET_ACCURACY,
  DEFAULT_TARGET_COVERAGE,
  FEASIBLE_DAILY_QUESTIONS,
  predictPass,
  type PassPrediction,
  type PassPredictorInput,
  type Verdict,
} from './passPredictor';

// 합격 준비도 화면(/dashboard/readiness)과 대시보드 준비도 카드의 재료(순수).
// 숫자는 모두 passPredictor 한 곳에서 나온다 — "이렇게 하면 이만큼 올라요"도 같은 함수에 가정한 입력을 넣어 다시 부른 값이다.

// 이보다 적게 풀었으면 예측 근거가 부족해 숫자 대신 "예측 전"을 보여준다.
export const MIN_ATTEMPTS_FOR_PREDICTION = 20;
// 정답률을 올리는 경우의 목표: 목표 정답률 +10 과 80 중 큰 값(최대 95).
const ACCURACY_LEVER_FLOOR = 80;
const ACCURACY_LEVER_STEP = 10;
const ACCURACY_LEVER_CAP = 95;

export type ReadinessState = 'pending' | Verdict;

export function readinessState(prediction: PassPrediction, attemptedQuestions: number): ReadinessState {
  return attemptedQuestions < MIN_ATTEMPTS_FOR_PREDICTION ? 'pending' : prediction.verdict;
}

export interface ReadinessFactors {
  coverage: { now: number; goal: number; ok: boolean };
  accuracy: { now: number; goal: number; ok: boolean; isRecent: boolean };
  /** 시험일이 없으면 null. */
  time: { dday: number; requiredDaily: number; requiredMinutes: number; feasible: number; ok: boolean } | null;
}

export function buildFactors(input: PassPredictorInput, prediction: PassPrediction): ReadinessFactors {
  const covGoal = input.targetCoverage ?? DEFAULT_TARGET_COVERAGE;
  const accGoal = input.targetAccuracy ?? DEFAULT_TARGET_ACCURACY;
  const acc = input.recentAccuracy ?? input.accuracy;
  return {
    coverage: { now: input.coverage, goal: covGoal, ok: input.coverage >= covGoal },
    accuracy: { now: acc, goal: accGoal, ok: acc >= accGoal, isRecent: input.recentAccuracy !== null },
    time:
      input.dday === null
        ? null
        : {
            dday: input.dday,
            requiredDaily: prediction.requiredDailyQuestions,
            requiredMinutes: prediction.requiredDailyMinutes,
            feasible: FEASIBLE_DAILY_QUESTIONS,
            ok: prediction.requiredDailyQuestions <= FEASIBLE_DAILY_QUESTIONS,
          },
  };
}

export type LeverKind = 'coverage' | 'accuracy' | 'both';

export interface Lever {
  kind: LeverKind;
  probability: number;
  delta: number; // %p, 지금 예측 대비
  /** coverage·both: 목표 진도, accuracy·both: 목표 정답률 */
  coverageGoal: number;
  accuracyGoal: number;
  /** 단일 레버 중 가장 효과가 큰 것 */
  best: boolean;
}

export function accuracyLeverGoal(targetAccuracy: number | undefined): number {
  const base = Math.max(ACCURACY_LEVER_FLOOR, (targetAccuracy ?? DEFAULT_TARGET_ACCURACY) + ACCURACY_LEVER_STEP);
  return Math.min(ACCURACY_LEVER_CAP, base);
}

// 진도를 목표까지 채웠을 때 / 정답률을 올렸을 때 / 둘 다 했을 때의 예측. 올라가지 않는 레버는 뺀다.
export function buildLevers(input: PassPredictorInput, current: PassPrediction): Lever[] {
  const covGoal = input.targetCoverage ?? DEFAULT_TARGET_COVERAGE;
  const accGoal = accuracyLeverGoal(input.targetAccuracy);
  const withCoverage = (i: PassPredictorInput): PassPredictorInput => ({
    ...i,
    coverage: Math.max(i.coverage, covGoal),
    attemptedQuestions: Math.max(i.attemptedQuestions, Math.ceil((covGoal / 100) * i.totalQuestions)),
  });
  const withAccuracy = (i: PassPredictorInput): PassPredictorInput => ({
    ...i,
    accuracy: Math.max(i.accuracy, accGoal),
    recentAccuracy: Math.max(i.recentAccuracy ?? i.accuracy, accGoal),
  });

  const make = (kind: LeverKind, next: PassPredictorInput): Lever => {
    const probability = predictPass(next).probability;
    return { kind, probability, delta: probability - current.probability, coverageGoal: covGoal, accuracyGoal: accGoal, best: false };
  };

  const singles = [make('coverage', withCoverage(input)), make('accuracy', withAccuracy(input))]
    .filter((l) => l.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  if (singles.length === 0) return [];
  const levers = singles.map((l, i) => ({ ...l, best: i === 0 }));
  if (singles.length === 2) {
    const both = make('both', withAccuracy(withCoverage(input)));
    if (both.delta > singles[0].delta) levers.push(both);
  }
  return levers;
}

const DAY_MS = 86_400_000;
export const PACE_WINDOW_DAYS = 14;

// 최근 windowDays 동안 처음 푼(새로 푼) 문제 수의 하루 평균. 소수 첫째 자리.
export function newQuestionsPerDay(
  attempts: readonly { questionId: string; attemptedAt: string }[],
  inScope: (questionId: string) => boolean,
  nowMs: number,
  windowDays = PACE_WINDOW_DAYS,
): number {
  const first = new Map<string, number>();
  for (const a of attempts) {
    if (!inScope(a.questionId)) continue;
    const t = new Date(a.attemptedAt).getTime();
    if (Number.isNaN(t)) continue;
    const prev = first.get(a.questionId);
    if (prev === undefined || t < prev) first.set(a.questionId, t);
  }
  if (first.size === 0) return 0;
  const since = nowMs - windowDays * DAY_MS;
  let count = 0;
  for (const t of first.values()) if (t >= since) count += 1;
  // 시작한 지 windowDays 가 안 됐으면 실제로 공부한 기간으로 나눈다(3일 만에 42문제면 하루 14문제).
  const earliest = Math.min(...first.values());
  const span = Math.min(windowDays, Math.max(1, Math.ceil((nowMs - earliest) / DAY_MS)));
  return Math.round((count / span) * 10) / 10;
}

export interface CoverageProjection {
  /** 지금 속도로 시험일까지 갔을 때의 진도(%) */
  atExamCurrentPace: number;
  /** 목표 진도에 닿으려면 하루에 새로 풀어야 할 문제 수 */
  requiredPerDay: number;
  /** 지금 속도와의 차이(하루 몇 문제 더). 0 이면 이미 충분. */
  extraPerDay: number;
  goal: number;
}

export function projectCoverage(p: {
  attemptedQuestions: number;
  totalQuestions: number;
  newPerDay: number;
  dday: number;
  targetCoverage?: number;
}): CoverageProjection {
  const goal = p.targetCoverage ?? DEFAULT_TARGET_COVERAGE;
  const days = Math.max(0, p.dday);
  const total = Math.max(1, p.totalQuestions);
  const projected = Math.min(total, p.attemptedQuestions + p.newPerDay * days);
  const goalCount = Math.ceil((goal / 100) * total);
  const remaining = Math.max(0, goalCount - p.attemptedQuestions);
  const requiredPerDay = remaining === 0 ? 0 : Math.ceil(remaining / Math.max(1, days));
  return {
    atExamCurrentPace: Math.round((projected / total) * 100),
    requiredPerDay,
    extraPerDay: Math.max(0, Math.ceil(requiredPerDay - p.newPerDay)),
    goal,
  };
}
