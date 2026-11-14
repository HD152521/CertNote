import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { DEFAULT_CATEGORY } from '@/lib/category';
import { getAllDays } from '@/lib/content';
import { loadDashboardOverview } from '@/lib/dashboard/overview';
import { getQuestionById } from '@/lib/questions';
import { countCompletedDays } from '@/lib/study/focusPlan';
import type { CertSnapshot } from '@/lib/study/goalPreview';
import { GoalForm, type GoalCertOption } from '@/components/dashboard/GoalForm';
import type { Language } from '@/lib/i18n-client';

export const dynamic = 'force-dynamic';

const DEFAULT_WEEKS = 8;
const DEFAULT_MINUTES = 30;
const DEFAULT_ACCURACY = 70;

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 목표 정하기: 자격증·시험일·하루 시간·목표 정답률을 고르면 미리보기가 바로 바뀌고, 저장하면 플랜과 프로필 목표를 함께 맞춘다.
export default async function GoalPage() {
  const headersList = await headers();
  const lang = (headersList.get('x-language') || 'ko') as Language;

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard/goal');

  const { ctx, data, today, focusPlan } = await loadDashboardOverview(user.sub);

  const certs: GoalCertOption[] = await Promise.all(
    ctx.certs.map(async (c) => {
      const prog = data.certs.find((p) => p.slug === c.slug);
      const snapshot: CertSnapshot = {
        slug: c.slug,
        totalDays: (await getAllDays(DEFAULT_CATEGORY, c.slug)).length,
        completedDays: countCompletedDays(ctx.attempts, getQuestionById, c.slug),
        totalQuestions: prog?.totalQuestions ?? 0,
        attemptedQuestions: prog?.attemptedQuestions ?? 0,
        accuracy: prog && prog.attempts > 0 ? Math.round((prog.correct / prog.attempts) * 100) : null,
      };
      return { slug: c.slug, code: c.code, name: c.name, snapshot, hasPlan: ctx.plans.some((p) => p.certSlug === c.slug) };
    }),
  );

  const initialCert = focusPlan?.certSlug ?? ctx.profile.targetCert ?? certs[0]?.slug ?? '';
  const initial = {
    certSlug: certs.some((c) => c.slug === initialCert) ? initialCert : (certs[0]?.slug ?? ''),
    examDate: focusPlan && focusPlan.examDate > today ? focusPlan.examDate : addDays(today, DEFAULT_WEEKS * 7),
    dailyMinutes: focusPlan?.dailyMinutesGoal ?? DEFAULT_MINUTES,
    targetAccuracy: focusPlan?.targetAccuracy ?? DEFAULT_ACCURACY,
  };

  return <GoalForm lang={lang} today={today} certs={certs} initial={initial} />;
}
