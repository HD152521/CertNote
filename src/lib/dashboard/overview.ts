import { getAnalytics, type AnalyticsData } from '../analytics/analyticsService';
import { newQuestionsPerDay } from '../analytics/readiness';
import { getQuestionById } from '../questions';
import { loadStudyContext, type StudyContext } from '../personalization/context';
import { kstToday } from '../study/activity';
import { pickFocusPlan } from '../study/focusPlan';
import type { StudyPlan } from '../study/plan';
import { getDashboardData, type CertProgress, type DashboardData } from './dashboardService';

// 대시보드·통계·합격 준비도 화면이 함께 쓰는 서버 데이터. 사용자 원시 데이터(StudyContext)를 한 번 읽어
// 집계·예측에 나눠 준다(화면마다 같은 쿼리를 다시 하지 않게).
export interface DashboardOverview {
  ctx: StudyContext;
  data: DashboardData;
  analytics: AnalyticsData;
  today: string;
  focusPlan: StudyPlan | null;
  /** 합격 예측이 바라보는 자격증의 진행(플랜 → 프로필 목표 순). 둘 다 없으면 null. */
  focusCert: CertProgress | null;
  /** 합격 예측 자격증에서 최근 14일 동안 하루 평균 새로 푼 문제 수 */
  focusPace: number;
}

export async function loadDashboardOverview(userId: string): Promise<DashboardOverview> {
  const ctx = await loadStudyContext(userId);
  const data = await getDashboardData(userId, ctx);
  const analytics = await getAnalytics(userId, 14, { ctx, dash: data });
  const today = kstToday();
  const focusPlan = pickFocusPlan(ctx.plans, ctx.profile.targetCert, today);
  const focusCert = analytics.targetCert ? (data.certs.find((c) => c.slug === analytics.targetCert) ?? null) : null;
  const slug = analytics.targetCert;
  const focusPace = newQuestionsPerDay(ctx.attempts, (id) => !slug || getQuestionById(id)?.slug === slug, Date.now());
  return { ctx, data, analytics, today, focusPlan, focusCert, focusPace };
}
