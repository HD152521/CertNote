import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { DEFAULT_CATEGORY } from '@/lib/category';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { loadDashboardOverview } from '@/lib/dashboard/overview';
import type { DomainStat, TopicStat } from '@/lib/dashboard/dashboardService';
import { getStreak, kstToday, listRecentActivity } from '@/lib/study/activity';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { StreakCalendar } from '@/components/study/StreakCalendar';
import type { Language } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { statsStrings } from '@/lib/strings/dashboard';
import { fmt } from '@/lib/strings/study';

export const dynamic = 'force-dynamic';

const CALENDAR_WEEKS = 12;
const TOPIC_LIMIT = 10;

function relTime(iso: string, s: Record<string, string>): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return s.justNow;
  if (min < 60) return fmt(s.minAgo, { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return fmt(s.hrAgo, { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return fmt(s.dayAgo, { n: day });
  return fmt(s.moAgo, { n: Math.floor(day / 30) });
}

const toneFor = (acc: number) => (acc < 60 ? 'bg-orange-500' : acc < 80 ? 'bg-amber-500' : 'bg-accent');

// 대시보드에서 뺀 자세한 숫자: 핵심 숫자 4개, 최근 14일 추이, 공부한 날, 도메인·주차별 정답률, 최근 풀이.
export default async function DashboardStatsPage() {
  const headersList = await headers();
  const lang = (headersList.get('x-language') || 'ko') as Language;
  const s = pick(statsStrings, lang);

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard/stats');

  const [{ data, analytics }, streak, activity] = await Promise.all([
    loadDashboardOverview(user.sub),
    getStreak(user.sub),
    listRecentActivity(user.sub, CALENDAR_WEEKS * 7),
  ]);
  const hasActivity = data.attempts > 0 || data.review.total > 0;

  const tiles = [
    { label: s.tileAccuracy, value: `${data.accuracy}`, suffix: '%' },
    { label: s.tileSolved, value: `${data.attemptedQuestions}`, suffix: ` / ${data.totalQuestions}` },
    { label: s.tileReview, value: `${data.review.due}`, suffix: s.unitQuestions },
    { label: s.tileMastered, value: `${data.review.mastered}`, suffix: s.unitQuestions },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div className="space-y-1.5">
        <Link href="/dashboard" className="text-[13px] text-accent">{s.back}</Link>
        <h1 className="text-2xl font-bold tracking-tight">{s.title}</h1>
      </div>

      {!hasActivity ? (
        <p className="rounded-2xl border border-border bg-bg-elevated p-8 text-center text-sm text-fg-muted">{s.empty}</p>
      ) : (
        <>
          <section aria-label={s.title} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl border border-border bg-bg-elevated px-4 py-3.5">
                <p className="text-xs text-fg-muted">{t.label}</p>
                <p className="mt-1 font-mono text-2xl font-medium tabular-nums">
                  {t.value}
                  <span className="text-[13px] text-fg-muted">{t.suffix}</span>
                </p>
              </div>
            ))}
          </section>

          <TrendChart trend={analytics.trend} lang={lang} />

          <section aria-labelledby="cal-h" className="space-y-3.5 rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="cal-h" className="text-[15px] font-semibold">{s.calendarHeading}</h2>
              <span className="text-xs text-fg-muted">{fmt(s.calendarSummary, { current: streak.current, longest: streak.longest })}</span>
            </div>
            <StreakCalendar activeDates={activity} frozenDate={streak.frozenDate} today={kstToday()} weeks={CALENDAR_WEEKS} />
          </section>

          <DomainSection s={s} domains={data.domains} />
          {data.topics.length > 0 && <TopicSection s={s} topics={data.topics.slice(0, TOPIC_LIMIT)} />}

          {data.recent.length > 0 && (
            <section aria-labelledby="rec-h" className="space-y-2.5 rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="rec-h" className="text-[15px] font-semibold">{s.recentHeading}</h2>
              </div>
              <ul>
                {data.recent.map((r, i) => (
                  <li key={`${r.questionId}-${i}`} className="border-b border-border last:border-0">
                    <Link
                      href={r.week > 0 ? `/${DEFAULT_CATEGORY}/${r.slug}/week${r.week}/day${r.day}` : '/exam'}
                      className="flex items-center gap-3 py-2.5 text-[13px] hover:text-fg"
                    >
                      <span className={`w-10 shrink-0 text-xs font-semibold ${r.correct ? 'text-accent' : 'text-orange-700 dark:text-orange-400'}`}>
                        {r.correct ? s.correct : s.wrong}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{r.prompt}</span>
                      <span className="hidden shrink-0 font-mono text-[11px] text-fg-muted sm:inline">
                        {r.week > 0 ? `${r.slug.toUpperCase()} W${r.week}D${r.day}` : s.mockExam}
                      </span>
                      <span className="w-16 shrink-0 text-right text-xs text-fg-muted">{relTime(r.attemptedAt, s)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function DomainSection({ s, domains }: { s: Record<string, string>; domains: DomainStat[] }) {
  return (
    <section aria-labelledby="dom-h" className="space-y-3.5 rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6">
      <h2 id="dom-h" className="text-[15px] font-semibold">
        {s.domainHeading} <span className="text-xs font-normal text-fg-muted">{s.domainNote}</span>
      </h2>
      {domains.length === 0 ? (
        <p className="text-sm text-fg-muted">{s.domainEmpty}</p>
      ) : (
        domains.map((d) => (
          <div key={d.domain} className="space-y-1.5">
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate">{d.domain}</span>
              <span className="shrink-0 font-mono text-fg-muted">{d.accuracy}% · {d.correct}/{d.attempts}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg-subtle">
              <div className={`h-full rounded-full ${toneFor(d.accuracy)}`} style={{ width: `${d.accuracy}%` }} />
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function TopicSection({ s, topics }: { s: Record<string, string>; topics: TopicStat[] }) {
  return (
    <section aria-labelledby="wk-h" className="space-y-2.5 rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6">
      <h2 id="wk-h" className="text-[15px] font-semibold">
        {s.topicHeading} <span className="text-xs font-normal text-fg-muted">{s.topicNote}</span>
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-fg-muted">
              <th className="border-b border-border py-2 font-medium">{s.colWeek}</th>
              <th className="border-b border-border py-2 text-right font-medium">{s.colAttempts}</th>
              <th className="border-b border-border py-2 text-right font-medium">{s.colAccuracy}</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={`${t.slug}-${t.week}`}>
                <td className="border-b border-border py-2.5">
                  <Link href={`/${DEFAULT_CATEGORY}/${t.slug}/week${t.week}/day1`} className="hover:text-accent">
                    <span className="font-mono text-fg-muted">{t.code}</span> · W{t.week}
                  </Link>
                </td>
                <td className="border-b border-border py-2.5 text-right font-mono text-fg-muted">{t.correct}/{t.attempts}</td>
                <td className="border-b border-border py-2.5 text-right font-mono">{t.accuracy}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
