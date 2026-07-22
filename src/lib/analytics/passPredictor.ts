// 휴리스틱 합격 예측. 실측 합격 데이터가 쌓이기 전이라 "추정치"다(과신 금지 — UI에 라벨 필수).
// 커버리지 · 정답률(추세) · 남은 기간의 시간 여유를 결합한다. 향후 로지스틱 회귀로 교체 가능.

export interface PassPredictorInput {
  coverage: number; // 0~100, 전체 문제 중 한 번이라도 푼 비율
  accuracy: number; // 0~100, 전체 정답률
  recentAccuracy: number | null; // 0~100, 최근 풀이 정답률(추세). null이면 accuracy 사용
  totalQuestions: number;
  attemptedQuestions: number;
  dday: number | null; // 시험까지 남은 일수(0=오늘, 음수=지남). null=시험일 미설정
  targetCoverage?: number; // 목표 커버리지(기본 90%)
  targetAccuracy?: number; // 목표 정답률(기본 70%)
}

export type Verdict = 'on_track' | 'behind' | 'at_risk';

export interface PassPrediction {
  probability: number; // 0~100 (추정)
  requiredDailyQuestions: number; // 목표 커버리지까지 하루 필요 문항(시험일 있을 때만 >0)
  requiredDailyMinutes: number;
  verdict: Verdict;
  hasSchedule: boolean; // 시험일이 설정돼 시간 기반 계산이 유효한가
}

const MINUTES_PER_QUESTION = 2; // 문제당 평균 소요(추정)
const FEASIBLE_DAILY_QUESTIONS = 20; // 하루 현실적 소화량 상한(초과 시 시간압박 페널티)
const DEFAULT_TARGET_COVERAGE = 90;
const DEFAULT_TARGET_ACCURACY = 70;

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n));

// 합격 가능성 추정(순수). 경계: 미시작·시험당일·미설정·완전학습 모두 안전.
export function predictPass(input: PassPredictorInput): PassPrediction {
  const targetCov = input.targetCoverage ?? DEFAULT_TARGET_COVERAGE;
  const targetAcc = input.targetAccuracy ?? DEFAULT_TARGET_ACCURACY;
  const accSignal = input.recentAccuracy ?? input.accuracy;

  // 목표 커버리지까지 남은 문항.
  const targetCount = Math.ceil((targetCov / 100) * input.totalQuestions);
  const remaining = Math.max(0, targetCount - input.attemptedQuestions);

  // 필요 일일 페이스(시험일 있을 때만). dday<=0은 "오늘 안에"로 보아 1일 취급.
  const hasSchedule = input.dday !== null;
  let requiredDailyQuestions = 0;
  if (hasSchedule) {
    const daysLeft = Math.max(1, input.dday as number);
    requiredDailyQuestions = Math.ceil(remaining / daysLeft);
  }
  const requiredDailyMinutes = requiredDailyQuestions * MINUTES_PER_QUESTION;

  // 준비도(0~1): 정답률을 커버리지보다 조금 더 무겁게.
  const covFrac = clamp(input.coverage) / 100;
  const accFrac = clamp(accSignal) / 100;
  let readiness = 0.45 * covFrac + 0.55 * accFrac;

  // 목표 정답률 미달이면 신뢰도 감쇠(다 풀어도 못 맞히면 떨어진다).
  if (accSignal < targetAcc) {
    readiness *= 0.7 + 0.3 * (accSignal / targetAcc);
  }

  let probability = readiness * 100;

  // 시간 압박: 필요 페이스가 현실 소화량을 넘으면 최대 절반까지 감점.
  if (hasSchedule && requiredDailyQuestions > FEASIBLE_DAILY_QUESTIONS) {
    const ratio = FEASIBLE_DAILY_QUESTIONS / requiredDailyQuestions;
    probability *= 0.5 + 0.5 * ratio;
  }

  // 시험일이 지났는데 목표 미달 → 상한 강제(위기).
  if (hasSchedule && (input.dday as number) <= 0 && input.coverage < targetCov) {
    probability = Math.min(probability, 35);
  }

  // 콜드 스타트: 한 문제도 안 풀었으면 추정 근거가 없다.
  if (input.attemptedQuestions === 0) {
    probability = Math.min(probability, 10);
  }

  probability = Math.round(clamp(probability));

  let verdict: Verdict;
  if (probability >= 65 && (!hasSchedule || requiredDailyQuestions <= FEASIBLE_DAILY_QUESTIONS)) {
    verdict = 'on_track';
  } else if (probability >= 40) {
    verdict = 'behind';
  } else {
    verdict = 'at_risk';
  }

  return { probability, requiredDailyQuestions, requiredDailyMinutes, verdict, hasSchedule };
}
