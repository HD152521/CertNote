import { getDashboardData, type CertProgress } from '../dashboard/dashboardService';
import { canAccessWeek } from '../entitlement/policy';
import { loadStudyContext } from '../personalization/context';
import { getQuestionById } from '../questions';
import { nextUp } from '../recommend/recommendService';
import { getStreak, kstToday } from './activity';
import { countCompletedDays, pickFocusPlan } from './focusPlan';
import { computeToday } from './plan';
import type { TodayPlanView } from '@/components/dashboard/TodayCard';

export interface TodayCardData {
  plan: TodayPlanView | null;
  starter: { title: string; href: string } | null;
  reviewDue: number;
  streakCurrent: number;
  /** 한 문제라도 푼 자격증(진행률 표시용). getDashboardData 는 이미 로드한 ctx 로 계산해 추가 DB 조회가 없다. */
  activeCerts: CertProgress[];
}

// 대시보드 ①(오늘 할 일)과 로그인 홈이 함께 쓰는 데이터. loadStudyContext(가벼운 1회 병렬 조회)만
// 쓰고, 대시보드 전용 전체 자격증 집계(getDashboardData)·합격 예측(getAnalytics)은 쓰지 않는다
// — 홈은 "오늘 뭘 하면 되는지" 한 장만 보여주면 되고 숫자 타일 모음일 필요는 없다.
export async function getTodayCardData(userId: string): Promise<TodayCardData> {
  const [ctx, streak] = await Promise.all([loadStudyContext(userId), getStreak(userId)]);
  const today = kstToday();
  const focusPlan = pickFocusPlan(ctx.plans, ctx.profile.targetCert, today);
  const gate = (week: number) => canAccessWeek(ctx.entitlement.plan, week);
  const dash = await getDashboardData(userId, ctx);
  const activeCerts = dash.certs
    .filter((c) => c.attempts > 0)
    .sort((a, b) => b.attemptedQuestions - a.attemptedQuestions);

  if (!focusPlan) {
    const starter = (await nextUp(userId, 1, ctx))[0] ?? null;
    return {
      plan: null,
      starter: starter ? { title: starter.title, href: starter.href } : null,
      reviewDue: ctx.review.due,
      streakCurrent: streak.current,
      activeCerts,
    };
  }

  const completedDays = countCompletedDays(ctx.attempts, getQuestionById, focusPlan.certSlug);
  const portion = await computeToday(focusPlan, completedDays);
  const meta = ctx.certs.find((c) => c.slug === focusPlan.certSlug);
  const plan: TodayPlanView = {
    certCode: meta?.code ?? focusPlan.certSlug,
    certName: meta?.name ?? '',
    examDate: portion.examDate,
    dday: portion.dday,
    items: portion.items.filter((d) => gate(d.week)),
    finished: portion.finished,
    perDay: portion.catchUp?.perDay ?? portion.items.length,
    catchUp: portion.catchUp,
  };
  return { plan, starter: null, reviewDue: ctx.review.due, streakCurrent: streak.current, activeCerts };
}
