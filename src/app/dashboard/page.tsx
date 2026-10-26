import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Flame } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { loadDashboardOverview } from '@/lib/dashboard/overview';
import { mergeWeakSpots } from '@/lib/dashboard/weakSpots';
import { readinessState } from '@/lib/analytics/readiness';
import { canAccessWeek } from '@/lib/entitlement/policy';
import { getQuestionById } from '@/lib/questions';
import { nextUp } from '@/lib/recommend/recommendService';
import { getStreak } from '@/lib/study/activity';
import { countCompletedDays } from '@/lib/study/focusPlan';
import { computeToday } from '@/lib/study/plan';
import { TodayCard, type TodayPlanView } from '@/components/dashboard/TodayCard';
import { ProgressCard } from '@/components/dashboard/ProgressCard';
import { WeakSpotsCard } from '@/components/dashboard/WeakSpotsCard';
import type { Language } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { dashboardStrings } from '@/lib/strings/dashboard';
import { fmt } from '@/lib/strings/study';

export const dynamic = 'force-dynamic';

// 학습 대시보드: ① 오늘 할 일 ② 목표 자격증 진행·합격 준비도 ③ 약한 곳 3개.
// 숫자 타일·추이·전체 약점 목록·최근 기록은 /dashboard/stats, 예측 근거는 /dashboard/readiness 로 나눴다.
export default async function DashboardPage() {
  const headersList = await headers();
  const lang = (headersList.get('x-language') || 'ko') as Language;
  const s = pick(dashboardStrings, lang);

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard');

  const { ctx, data, analytics, focusPlan, focusCert } = await loadDashboardOverview(user.sub);
  const gate = (week: number) => canAccessWeek(ctx.entitlement.plan, week);

  const [streak, portion, starter] = await Promise.all([
    getStreak(user.sub),
    focusPlan ? computeToday(focusPlan, countCompletedDays(ctx.attempts, getQuestionById, focusPlan.certSlug)) : null,
    focusPlan ? [] : nextUp(user.sub, 1, ctx),
  ]);

  let plan: TodayPlanView | null = null;
  if (focusPlan && portion) {
    const meta = ctx.certs.find((c) => c.slug === focusPlan.certSlug);
    plan = {
      certCode: meta?.code ?? focusPlan.certSlug,
      certName: meta?.name ?? '',
      examDate: portion.examDate,
      dday: portion.dday,
      items: portion.items.filter((d) => gate(d.week)),
      finished: portion.finished,
      perDay: portion.catchUp?.perDay ?? portion.items.length,
      catchUp: portion.catchUp,
    };
  }

  const readiness = {
    state: readinessState(analytics.prediction, analytics.inputs.attemptedQuestions),
    probability: analytics.prediction.probability,
  };
  const others = data.certs.filter((c) => c.attempts > 0 && c.slug !== focusCert?.slug);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-wider text-fg-muted">{s.eyebrow}</p>
          <h1 className="text-2xl font-bold tracking-tight">{s.title}</h1>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
            streak.current > 0 ? 'bg-accent/10 text-accent' : 'bg-bg-subtle text-fg-muted'
          }`}
        >
          <Flame className="h-3.5 w-3.5" aria-hidden />
          {streak.current > 0 ? fmt(s.streak, { n: streak.current }) : s.noStreak}
        </span>
      </header>

      <TodayCard lang={lang} plan={plan} starter={starter[0] ?? null} reviewDue={data.review.due} />
      <ProgressCard lang={lang} focus={focusCert} readiness={readiness} others={others} />
      <WeakSpotsCard lang={lang} spots={mergeWeakSpots(data.domains, data.topics)} />
    </div>
  );
}
