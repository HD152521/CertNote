import { getDashboardData } from '../dashboard/dashboardService';
import { getLearnerProfile } from '../profile/profileService';
import { getAttemptService } from '../quiz/attemptService';
import { computeToday, listPlans, type StudyPlan } from '../study/plan';
import { predictPass, type PassPrediction } from './passPredictor';
import { buildDailyTrend, type TrendPoint } from './trend';

const ATTEMPT_LIMIT = 5000;
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
export async function getAnalytics(userId: string, trendDays = DEFAULT_TREND_DAYS): Promise<AnalyticsData> {
  const [dash, attempts, plans, profile] = await Promise.all([
    getDashboardData(userId),
    getAttemptService().list(userId, ATTEMPT_LIMIT),
    listPlans(userId),
    getLearnerProfile(userId),
  ]);

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

  // 최근 정답률(추세): attempts는 최신순 → 앞에서 RECENT_WINDOW개.
  const recent = attempts.slice(0, RECENT_WINDOW);
  const recentAccuracy =
    recent.length > 0 ? Math.round((recent.filter((a) => a.correct).length / recent.length) * 100) : null;

  const prediction = predictPass({
    coverage: dash.coverage,
    accuracy: dash.accuracy,
    recentAccuracy,
    totalQuestions: dash.totalQuestions,
    attemptedQuestions: dash.attemptedQuestions,
    dday,
    targetAccuracy: plan?.targetAccuracy, // M4: 사용자 목표 정확도를 예측 임계값으로.
  });

  const trend = buildDailyTrend(
    attempts.map((a) => ({ day: kstDay(a.attemptedAt), correct: a.correct })),
    recentDays(trendDays),
  );

  return { prediction, trend, examDate, dday, targetCert: target };
}
