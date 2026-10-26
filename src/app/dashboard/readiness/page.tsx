import { Fragment } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { loadDashboardOverview } from '@/lib/dashboard/overview';
import {
  MIN_ATTEMPTS_FOR_PREDICTION,
  buildFactors,
  buildLevers,
  projectCoverage,
  readinessState,
  type CoverageProjection,
  type Lever,
  type ReadinessFactors,
} from '@/lib/analytics/readiness';
import { READINESS_TONE } from '@/components/dashboard/readinessTone';
import type { Language } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { dashboardStrings, readinessStrings, statsStrings } from '@/lib/strings/dashboard';
import { fmt, fmtRich } from '@/lib/strings/study';

export const dynamic = 'force-dynamic';

type R = Record<keyof (typeof readinessStrings)['ko'], string>;

const Rich = ({ text }: { text: string }) => (
  <>{fmtRich(text, {}).map((p, i) => (p.bold ? <b key={i}>{p.text}</b> : <Fragment key={i}>{p.text}</Fragment>))}</>
);

// 합격 준비도: 대시보드 ②의 숫자가 어떻게 나왔고, 무엇을 하면 얼마나 오르는지. 모든 숫자는 passPredictor 에서 나온다.
export default async function ReadinessPage() {
  const headersList = await headers();
  const lang = (headersList.get('x-language') || 'ko') as Language;
  const s = pick(readinessStrings, lang);
  const ds = pick(dashboardStrings, lang);

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard/readiness');

  const { analytics, focusCert, focusPace: pace } = await loadDashboardOverview(user.sub);
  const { inputs, prediction } = analytics;
  const state = readinessState(prediction, inputs.attemptedQuestions);
  const tone = READINESS_TONE[state];
  const factors = buildFactors(inputs, prediction);
  const levers = buildLevers(inputs, prediction);
  const projection =
    inputs.dday === null
      ? null
      : projectCoverage({ attemptedQuestions: inputs.attemptedQuestions, totalQuestions: inputs.totalQuestions, newPerDay: pace, dday: inputs.dday });

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div className="space-y-1.5">
        <Link href="/dashboard" className="text-[13px] text-accent">{pick(statsStrings, lang).back}</Link>
        <h1 className="text-2xl font-bold tracking-tight">
          {focusCert && <span className="mr-2 font-mono text-xl text-fg-muted">{focusCert.code}</span>}
          {s.title}
        </h1>
      </div>

      <section aria-label={s.title} className="space-y-5 rounded-2xl border border-border bg-bg-elevated p-6 sm:p-7">
        <div className="flex flex-wrap items-end gap-5">
          <div className="space-y-1">
            <p className="text-[13px] text-fg-muted">
              {ds.passLabel} <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-[11px]">{ds.estimateTag}</span>
            </p>
            <p className="font-mono text-6xl font-medium leading-none tracking-tighter">
              {state === 'pending' ? '—' : prediction.probability}
              {state !== 'pending' && <span className="text-3xl text-fg-muted">%</span>}
            </p>
          </div>
          <span className={`mb-2 rounded-full px-3 py-1.5 text-sm font-semibold ${tone.chip}`}>{ds[`state_${state}`]}</span>
        </div>

        {state !== 'pending' && <Scale s={s} p={prediction.probability} />}

        <p className="text-[15px] leading-relaxed">
          {state === 'pending' ? (
            fmt(s.summaryPending, { n: inputs.attemptedQuestions, min: MIN_ATTEMPTS_FOR_PREDICTION })
          ) : projection ? (
            <>
              <Rich text={fmt(s.summaryPace, { pace, atExam: projection.atExamCurrentPace })} />
              <br />
              {projection.extraPerDay > 0 ? (
                <Rich text={fmt(s.summaryExtra, { extra: projection.extraPerDay, goal: projection.goal })} />
              ) : (
                fmt(s.summaryEnough, { goal: projection.goal })
              )}
            </>
          ) : (
            s.summaryNoSchedule
          )}
        </p>
        {inputs.dday === null && (
          <Link href="/dashboard/goal" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg">
            {s.setExamDate}
          </Link>
        )}
      </section>

      <Factors s={s} f={factors} inputs={inputs} />
      {projection && <ProjectionChart s={s} now={inputs.coverage} projection={projection} />}
      {state !== 'pending' && <Levers s={s} levers={levers} inputs={inputs} />}

      <details className="rounded-2xl border border-border bg-bg-elevated px-6 py-4">
        <summary className="min-h-7 cursor-pointer text-sm font-semibold">{s.howHeading}</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-fg-muted">
          <li>{s.how1}</li>
          <li>{s.how2}</li>
          <li>{s.how3}</li>
          <li>{s.how4}</li>
        </ul>
      </details>
    </div>
  );
}

function Scale({ s, p }: { s: R; p: number }) {
  return (
    <div className="space-y-1.5">
      <div role="img" aria-label={fmt(s.scaleAria, { p })} className="relative flex h-3 gap-[3px]">
        <span className="flex-[40] rounded-l-full bg-orange-500/30" />
        <span className="flex-[25] bg-amber-500/35" />
        <span className="flex-[35] rounded-r-full bg-accent/35" />
        <span
          className="absolute -top-[5px] h-[18px] w-[18px] rounded-full border-[3px] border-bg-elevated bg-fg shadow"
          style={{ left: `calc(${p}% - 9px)` }}
        />
      </div>
      <div className="flex text-[11px] text-fg-muted">
        <span className="flex-[40]">{s.scaleRisk}</span>
        <span className="flex-[25]">{s.scaleBehind}</span>
        <span className="flex-[35] text-right">{s.scaleOn}</span>
      </div>
    </div>
  );
}

interface FactorRow {
  name: string;
  weight: string;
  now: string;
  goal: string;
  nowPct: number;
  goalPct: number;
  ok: boolean;
  note: string;
}

function Factors({ s, f, inputs }: { s: R; f: ReadinessFactors; inputs: { totalQuestions: number; attemptedQuestions: number } }) {
  const left = Math.max(0, Math.ceil((f.coverage.goal / 100) * inputs.totalQuestions) - inputs.attemptedQuestions);
  const rows: FactorRow[] = [
    {
      name: s.factorCoverage,
      weight: s.factorCoverageWeight,
      now: `${f.coverage.now}%`,
      goal: `${f.coverage.goal}%`,
      nowPct: f.coverage.now,
      goalPct: f.coverage.goal,
      ok: f.coverage.ok,
      note: f.coverage.ok ? s.coverageNoteOk : fmt(s.coverageNoteLow, { total: inputs.totalQuestions, tried: inputs.attemptedQuestions, left }),
    },
    {
      name: f.accuracy.isRecent ? s.factorAccuracy : s.factorAccuracyAll,
      weight: s.factorAccuracyWeight,
      now: `${f.accuracy.now}%`,
      goal: `${f.accuracy.goal}%`,
      nowPct: f.accuracy.now,
      goalPct: f.accuracy.goal,
      ok: f.accuracy.ok,
      note: fmt(f.accuracy.ok ? s.accuracyNoteOk : s.accuracyNoteLow, { goal: f.accuracy.goal }),
    },
  ];
  if (f.time) {
    const t = f.time;
    rows.push({
      name: s.factorTime,
      weight: s.factorTimeWeight,
      now: fmt(s.timeNow, { n: t.requiredDaily }),
      goal: fmt(s.timeGoal, { n: t.feasible }),
      nowPct: Math.min(100, (t.requiredDaily / (t.feasible * 2)) * 100),
      goalPct: 50,
      ok: t.ok,
      note: fmt(t.ok ? s.timeNoteOk : s.timeNoteLow, { dday: Math.max(0, t.dday), n: t.requiredDaily, m: t.requiredMinutes, limit: t.feasible }),
    });
  }
  return (
    <section aria-labelledby="why-h" className="space-y-5 rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6">
      <h2 id="why-h" className="text-[15px] font-semibold">{s.whyHeading}</h2>
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[28px_1fr] items-start gap-3">
          <span
            aria-hidden
            className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${
              r.ok ? 'bg-accent/15 text-accent' : 'bg-orange-500/15 text-orange-700 dark:text-orange-400'
            }`}
          >
            {r.ok ? '✓' : '!'}
          </span>
          <div className="space-y-2">
            <div className="flex flex-wrap justify-between gap-3">
              <span className="text-sm font-semibold">
                {r.name} <span className="text-xs font-normal text-fg-muted">{r.weight}</span>
              </span>
              <span className="text-[13px] text-fg-muted">
                <b className="font-mono text-fg">{r.now}</b> · {fmt(s.goalValue, { goal: r.goal })}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-bg-subtle">
              <span className={`absolute inset-y-0 left-0 rounded-full ${r.ok ? 'bg-accent' : 'bg-orange-400'}`} style={{ width: `${r.nowPct}%` }} />
              <span className="absolute -top-1 h-4 w-0.5 bg-fg" style={{ left: `calc(${r.goalPct}% - 1px)` }} />
            </div>
            <p className="text-xs text-fg-muted">{r.note}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

// 오늘 → 시험일 두 갈래: 지금 속도, 목표 속도. 지난 기록은 그리지 않는다(풀이 기록 보관 개수에 한도가 있어 과거 곡선이 부정확).
function ProjectionChart({ s, now, projection }: { s: R; now: number; projection: CoverageProjection }) {
  const x0 = 60;
  const x1 = 660;
  const y = (pct: number) => 200 - pct * 1.6;
  const goalY = y(projection.goal);
  return (
    <section aria-labelledby="proj-h" className="space-y-3.5 rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="proj-h" className="text-[15px] font-semibold">{s.projectionHeading}</h2>
        <div className="flex flex-wrap gap-3.5 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-[3px] border-dashed border-fg-faint" />{s.legendPace}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-[3px] border-dashed border-accent" />{fmt(s.legendRequired, { n: projection.requiredPerDay })}</span>
        </div>
      </div>
      <svg
        role="img"
        aria-label={fmt(s.chartAria, { now, pace: projection.atExamCurrentPace, req: projection.requiredPerDay, goal: projection.goal })}
        viewBox="0 0 700 230"
        className="block h-auto w-full"
      >
        <line x1={x0} y1={200} x2={x1} y2={200} className="stroke-border" />
        <line x1={x0} y1={goalY} x2={x1} y2={goalY} className="stroke-fg" strokeDasharray="2 4" />
        <text x={x0} y={goalY - 8} fontSize="11" className="fill-fg-muted">{fmt(s.goalLine, { goal: projection.goal })}</text>
        <text x={x0} y={218} fontSize="11" className="fill-fg-muted">{s.today}</text>
        <text x={x1} y={218} fontSize="11" textAnchor="end" className="fill-fg-muted">D-DAY</text>
        <line x1={x0} y1={y(now)} x2={x1} y2={y(projection.atExamCurrentPace)} className="stroke-fg-faint" strokeWidth={3} strokeDasharray="6 5" />
        <line x1={x0} y1={y(now)} x2={x1} y2={goalY} className="stroke-accent" strokeWidth={3} strokeDasharray="6 5" />
        <circle cx={x0} cy={y(now)} r={5} className="fill-accent" />
        <text x={x0 + 10} y={y(now) + 18} fontSize="12" className="fill-fg font-mono">{now}%</text>
        <text x={x1 - 8} y={y(projection.atExamCurrentPace) + 18} fontSize="12" textAnchor="end" className="fill-fg-muted font-mono">
          {projection.atExamCurrentPace}%
        </text>
      </svg>
    </section>
  );
}

function Levers({ s, levers, inputs }: { s: R; levers: Lever[]; inputs: { dday: number | null; totalQuestions: number; attemptedQuestions: number } }) {
  const left = (goal: number) => Math.max(0, Math.ceil((goal / 100) * inputs.totalQuestions) - inputs.attemptedQuestions);
  return (
    <section aria-labelledby="up-h" className="space-y-3.5 rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6">
      <h2 id="up-h" className="text-[15px] font-semibold">{s.leversHeading}</h2>
      {levers.length === 0 ? (
        <p className="text-sm text-fg-muted">{s.leversNone}</p>
      ) : (
        levers.map((l) => {
          const title =
            l.kind === 'coverage' ? fmt(s.leverCoverage, { goal: l.coverageGoal }) : l.kind === 'accuracy' ? fmt(s.leverAccuracy, { goal: l.accuracyGoal }) : s.leverBoth;
          const how =
            l.kind === 'coverage'
              ? inputs.dday !== null
                ? fmt(s.leverCoverageHow, { n: Math.ceil(left(l.coverageGoal) / Math.max(1, inputs.dday)) })
                : fmt(s.leverCoverageHowNoDate, { n: left(l.coverageGoal) })
              : l.kind === 'accuracy'
                ? s.leverAccuracyHow
                : fmt(s.leverBothHow, { cov: l.coverageGoal, acc: l.accuracyGoal });
          const cta = l.kind === 'accuracy' ? { href: '/review', label: s.ctaWeak } : { href: '/dashboard/goal', label: s.ctaPlan };
          return (
            <div
              key={l.kind}
              className={`flex flex-wrap items-center gap-4 rounded-xl px-4 py-3.5 ${l.best ? 'border-2 border-accent bg-accent/5' : 'border border-border'}`}
            >
              <div className="flex w-[72px] shrink-0 flex-col items-center">
                <span className="font-mono text-[22px] font-medium">{l.probability}%</span>
                <span className="text-xs font-semibold text-accent">+{l.delta}%p</span>
              </div>
              <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold">{title}</span>
                <span className="text-xs text-fg-muted">{how}</span>
              </div>
              <Link href={cta.href} className="inline-flex min-h-10 items-center rounded-lg bg-accent px-4 text-[13px] font-semibold text-accent-fg">
                {cta.label}
              </Link>
            </div>
          );
        })
      )}
    </section>
  );
}
