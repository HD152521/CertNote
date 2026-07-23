import { getDashboardData, type DashboardData } from '../dashboard/dashboardService';
import type { StudyContext } from '../personalization/context';
import { getLearnerProfile, type LearnerProfile } from '../profile/profileService';
import { getAttemptService, ATTEMPT_HISTORY_LIMIT } from '../quiz/attemptService';
import type { AttemptRecord } from '../quiz/attemptRepository';
import { getQuestionById } from '../questions';
import { computeToday, listPlans, type StudyPlan } from '../study/plan';
import { predictPass, type PassPrediction } from './passPredictor';
import { buildDailyTrend, type TrendPoint } from './trend';

const RECENT_WINDOW = 20; // 최근 정답률(추세) 표본 크기.
const DEFAULT_TREND_DAYS = 14;

export interface AnalyticsData {
  prediction: PassPrediction;
  trend: TrendPoint[];
  examDate: string | null;
  dday: number | null;
  targetCert: string | null;
}

// attemptedAt(ISO/timestamp) → KST 'YYYY-MM-DD'.
function kstDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

// 최근 windowDays 일자 목록(과거→오늘, KST).
function recentDays(days: number): string[] {
  const out: string[] = [];
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) + 'T00:00:00Z');
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// 학습 분석: 합격 예측 + 추이. 읽기 전용(서버에서 호출).
// injected(ctx+dash) 주입 시 재조회 없이 재사용(대시보드 중복 조회 방지).
export async function getAnalytics(
  userId: string,
  trendDays = DEFAULT_TREND_DAYS,
  injected?: { ctx: StudyContext; dash: DashboardData },
): Promise<AnalyticsData> {
  let dash: DashboardData;
  let attempts: AttemptRecord[];
  let plans: StudyPlan[];
  let profile: LearnerProfile;
  if (injected) {
    dash = injected.dash;
    ({ attempts, plans, profile } = injected.ctx);
  } else {
    [dash, attempts, plans, profile] = await Promise.all([
      getDashboardData(userId),
      getAttemptService().list(userId, ATTEMPT_HISTORY_LIMIT),
      listPlans(userId),
      getLearnerProfile(userId),
    ]);
  }

  // 목표 자격증의 시험일 우선, 없으면 가장 임박한 플랜.
  const target = profile.targetCert;
  const plan: StudyPlan | null = (target && plans.find((p) => p.certSlug === target)) || plans[0] || null;
  let dday: number | null = null;
  let examDate: string | null = null;
  if (plan) {
    const portion = await computeToday(plan);
    dday = portion.dday;
    examDate = portion.examDate;
  }

  // 합격 예측은 '목표 자격증' 범위로 계산한다. 전체 통합(모든 자격증)으로 하면
  // 한 자격증만 파도 커버리지가 낮게 나오고, 다른 자격증 정답이 엉뚱하게 반영된다.
  const predictCert = plan?.certSlug ?? target;
  const certProg = predictCert ? dash.certs.find((c) => c.slug === predictCert) : undefined;

  const coverage =
    certProg && certProg.totalQuestions > 0
      ? Math.round((certProg.attemptedQuestions / certProg.totalQuestions) * 100)
      : dash.coverage;
  const accuracy =
    certProg && certProg.attempts > 0 ? Math.round((certProg.correct / certProg.attempts) * 100) : dash.accuracy;
  const scopedTotal = certProg ? certProg.totalQuestions : dash.totalQuestions;
  const scopedAttempted = certProg ? certProg.attemptedQuestions : dash.attemptedQuestions;

  // 최근 정답률(추세): 목표 자격증 문제만, 최신순 앞에서 RECENT_WINDOW개.
  const certAttempts = predictCert
    ? attempts.filter((a) => getQuestionById(a.questionId)?.slug === predictCert)
    : attempts;
  const recent = certAttempts.slice(0, RECENT_WINDOW);
  const recentAccuracy =
    recent.length > 0 ? Math.round((recent.filter((a) => a.correct).length / recent.length) * 100) : null;

  const prediction = predictPass({
    coverage,
    accuracy,
    recentAccuracy,
    totalQuestions: scopedTotal,
    attemptedQuestions: scopedAttempted,
    dday,
    targetAccuracy: plan?.targetAccuracy, // M4: 사용자 목표 정확도를 예측 임계값으로.
  });

  const trend = buildDailyTrend(
    attempts.map((a) => ({ day: kstDay(a.attemptedAt), correct: a.correct })),
    recentDays(trendDays),
  );

  return { prediction, trend, examDate, dday, targetCert: predictCert };
}
