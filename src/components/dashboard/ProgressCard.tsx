import { Fragment } from 'react';
import Link from 'next/link';
import { DEFAULT_CATEGORY } from '@/lib/category';
import type { CertProgress } from '@/lib/dashboard/dashboardService';
import { MIN_ATTEMPTS_FOR_PREDICTION, type ReadinessState } from '@/lib/analytics/readiness';
import type { Language } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { dashboardStrings } from '@/lib/strings/dashboard';
import { fmt, fmtRich } from '@/lib/strings/study';
import { READINESS_TONE } from './readinessTone';

interface ProgressCardProps {
  lang: Language;
  focus: CertProgress | null;
  readiness: { state: ReadinessState; probability: number };
  others: CertProgress[];
}

const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);

// 대시보드 ② 목표 자격증 진행 막대 + 합격 준비도 요약. 상세는 /dashboard/readiness.
export function ProgressCard({ lang, focus, readiness, others }: ProgressCardProps) {
  const s = pick(dashboardStrings, lang);
  const tone = READINESS_TONE[readiness.state];
  const attempted = focus?.attemptedQuestions ?? 0;

  return (
    <section aria-labelledby="prog-h" className="space-y-5 rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="prog-h" className="text-[13px] font-semibold text-fg-muted">
          {focus ? fmt(s.progressHeading, { code: focus.code }) : s.progressHeadingAll}
        </h2>
        <Link href="/dashboard/stats" className="text-[13px] text-accent underline-offset-4 hover:underline">
          {s.seeStats} →
        </Link>
      </div>

      {!focus || attempted === 0 ? (
        <p className="text-sm text-fg-muted">{s.emptyProgress}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="space-y-2.5 sm:col-span-2">
            <p className="text-sm text-fg-muted">
              {fmtRich(s.triedOf, { n: attempted, total: focus.totalQuestions }).map((part, i) =>
                part.bold ? (
                  <b key={i} className="text-[22px] text-fg">{part.text}</b>
                ) : (
                  <Fragment key={i}>{part.text}</Fragment>
                ),
              )}
            </p>
            <div
              role="img"
              aria-label={fmt(s.barAria, { total: focus.totalQuestions, tried: attempted, solved: focus.solvedQuestions })}
              className="flex h-3 overflow-hidden rounded-full bg-bg-subtle"
            >
              <div className="bg-accent" style={{ width: `${pct(focus.solvedQuestions, focus.totalQuestions)}%` }} />
              <div className="bg-accent/35" style={{ width: `${pct(attempted - focus.solvedQuestions, focus.totalQuestions)}%` }} />
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-fg-muted">
              <Legend swatch="bg-accent" label={fmt(s.legendCorrect, { n: focus.solvedQuestions })} />
              <Legend swatch="bg-accent/35" label={fmt(s.legendWrong, { n: attempted - focus.solvedQuestions })} />
              <Legend swatch="border border-border bg-bg-subtle" label={fmt(s.legendUntried, { n: focus.totalQuestions - attempted })} />
            </div>
          </div>

          <div className="space-y-0.5 border-border sm:border-l sm:pl-4">
            <p className="text-xs text-fg-muted">
              {s.passLabel} <span className="text-fg-faint">({s.estimateTag})</span>
            </p>
            <p className="font-mono text-3xl font-medium">
              {readiness.state === 'pending' ? '—' : `${readiness.probability}%`}
            </p>
            <p className={`text-xs font-semibold ${tone.text}`}>{s[`state_${readiness.state}`]}</p>
            {readiness.state === 'pending' ? (
              <p className="text-xs text-fg-muted">{fmt(s.pendingHint, { n: MIN_ATTEMPTS_FOR_PREDICTION - attempted })}</p>
            ) : (
              <Link href="/dashboard/readiness" className="text-xs text-accent underline-offset-4 hover:underline">
                {s.whyLink} →
              </Link>
            )}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs text-fg-muted">{s.othersHeading}</p>
          {others.map((c) => {
            const cov = Math.round(pct(c.attemptedQuestions, c.totalQuestions));
            const acc = c.attempts > 0 ? Math.round((c.correct / c.attempts) * 100) : 0;
            return (
              <Link
                key={c.slug}
                href={`/${DEFAULT_CATEGORY}/${c.slug}`}
                className="flex min-h-8 items-center gap-3 text-[13px] hover:text-fg"
              >
                <span className="w-28 shrink-0 truncate font-mono text-xs text-fg-muted">{c.code}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-subtle">
                  <span className="block h-full rounded-full" style={{ width: `${cov}%`, backgroundColor: c.accent }} />
                </span>
                <span className="shrink-0 text-right text-fg-muted tabular-nums">{fmt(s.otherLine, { cov, acc })}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-[3px] ${swatch}`} aria-hidden />
      {label}
    </span>
  );
}
