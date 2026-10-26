import Link from 'next/link';
import { MIN_WEAK_ATTEMPTS, type WeakSpot } from '@/lib/dashboard/weakSpots';
import type { Language } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { dashboardStrings } from '@/lib/strings/dashboard';
import { fmt } from '@/lib/strings/study';

// 대시보드 ③ 약한 곳. 모의고사 도메인·주차 퀴즈를 합쳐 정답률 낮은 3곳만(mergeWeakSpots).
export function WeakSpotsCard({ lang, spots }: { lang: Language; spots: WeakSpot[] }) {
  const s = pick(dashboardStrings, lang);
  return (
    <section aria-labelledby="weak-h" className="space-y-3.5 rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="weak-h" className="text-[13px] font-semibold text-fg-muted">{s.weakHeading}</h2>
        <Link href="/notebook" className="text-[13px] text-accent underline-offset-4 hover:underline">
          {s.notebookLink} →
        </Link>
      </div>
      {spots.length === 0 ? (
        <p className="text-sm text-fg-muted">{fmt(s.weakEmpty, { n: MIN_WEAK_ATTEMPTS - 1 })}</p>
      ) : (
        <ul className="space-y-2">
          {spots.map((w) => (
            <li key={w.key} className="flex flex-wrap items-center gap-3.5 rounded-xl border border-border px-3.5 py-3">
              <span className="w-11 font-mono text-[15px] font-medium text-orange-700 dark:text-orange-400">{w.accuracy}%</span>
              <span className="flex min-w-[180px] flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {w.kind === 'domain' ? w.domain : fmt(s.weekLabel, { code: w.code ?? '', week: w.week ?? 0 })}
                </span>
                <span className="text-xs text-fg-muted">
                  {w.kind === 'domain' ? s.weakDomainKind : s.weakTopicKind} · {fmt(s.weakCount, { n: w.attempts })}
                </span>
              </span>
              <Link
                href={w.href}
                className="inline-flex min-h-10 items-center rounded-lg bg-bg-subtle px-4 text-[13px] font-semibold transition hover:bg-border"
              >
                {w.kind === 'domain' ? s.practiceDomain : fmt(s.practiceTopic, { week: w.week ?? 0 })}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
