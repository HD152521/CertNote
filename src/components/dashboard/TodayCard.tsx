import { Fragment } from 'react';
import Link from 'next/link';
import { ArrowRight, Target } from 'lucide-react';
import type { DayRef } from '@/lib/content';
import type { CatchUp } from '@/lib/study/plan';
import type { Language } from '@/lib/i18n-client';
import { linkDayRefHref } from '@/lib/navTree';
import { pick } from '@/lib/strings/dict';
import { dashboardStrings } from '@/lib/strings/dashboard';
import { fmt, fmtRich } from '@/lib/strings/study';
import { stripDayPrefix } from '@/lib/day/dayTitle';

export interface TodayPlanView {
  certCode: string;
  certName: string;
  examDate: string;
  dday: number;
  items: DayRef[];
  finished: boolean;
  perDay: number;
  catchUp?: CatchUp;
}

interface TodayCardProps {
  lang: Language;
  plan: TodayPlanView | null;
  /** 플랜이 없을 때 첫 학습 노트(목표 자격증 또는 첫 자격증) */
  starter: { title: string; href: string } | null;
  reviewDue: number;
}

const ddayLabel = (d: number) => (d > 0 ? `D-${d}` : d === 0 ? 'D-DAY' : `D+${-d}`);

// 대시보드 ① 오늘 할 일. 합격 플랜·오늘 분량·복습 대기를 한 카드에 모았다(예전엔 세 군데).
export function TodayCard({ lang, plan, starter, reviewDue }: TodayCardProps) {
  const s = pick(dashboardStrings, lang);
  return (
    <section
      aria-labelledby="today-h"
      className="space-y-5 rounded-2xl border border-accent/40 bg-bg-elevated p-5 shadow-[0_12px_32px_-20px_var(--accent)] sm:p-6"
    >
      {plan ? <PlanBody lang={lang} plan={plan} /> : <NoPlanBody lang={lang} starter={starter} />}

      {(plan?.items[0] || reviewDue > 0) && (
        <div className="flex flex-wrap gap-2.5">
          {plan?.items[0] && (
            <Link
              href={linkDayRefHref(plan.items[0])}
              className="inline-flex min-h-12 flex-[1_1_220px] items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-fg transition hover:opacity-90"
            >
              {fmt(s.continueReading, { where: `W${plan.items[0].week}D${plan.items[0].day}` })}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
          {reviewDue > 0 && (
            <Link
              href="/review"
              className="inline-flex min-h-12 flex-[1_1_220px] items-center justify-center rounded-xl border border-accent px-5 text-[15px] font-semibold text-accent transition hover:bg-accent/5"
            >
              {fmt(s.startReview, { n: reviewDue })}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function PlanBody({ lang, plan }: { lang: Language; plan: TodayPlanView }) {
  const s = pick(dashboardStrings, lang);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 id="today-h" className="text-[13px] font-semibold text-accent">{s.todayHeading}</h2>
          <p className="text-[17px] font-semibold">
            <span className="mr-1.5 font-mono text-[13px] text-fg-muted">{plan.certCode}</span>
            {plan.certName}
          </p>
          <p className="text-[13px] text-fg-muted">{fmt(s.examLine, { date: plan.examDate, n: plan.perDay })}</p>
        </div>
        <div className="text-right">
          <p className={`font-mono text-[34px] font-medium leading-none ${plan.dday >= 0 ? 'text-accent' : 'text-fg-muted'}`}>
            {ddayLabel(plan.dday)}
          </p>
          <Link href="/dashboard/goal" className="text-xs text-accent underline-offset-4 hover:underline">
            {s.editPlan}
          </Link>
        </div>
      </div>

      {plan.catchUp?.isBehind && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[13px] text-amber-700 dark:text-amber-400">
          {fmtRich(s.catchUp, { behind: plan.catchUp.behindBy, from: plan.catchUp.basePerDay, to: plan.catchUp.perDay }).map((part, i) =>
            part.bold ? <b key={i}>{part.text}</b> : <Fragment key={i}>{part.text}</Fragment>,
          )}
        </p>
      )}

      {plan.finished ? (
        <p className="text-sm text-fg-muted">{s.allDone}</p>
      ) : plan.items.length === 0 ? (
        <p className="text-sm text-fg-muted">{s.nothingToday}</p>
      ) : (
        <ol className="space-y-1.5">
          {plan.items.map((it) => (
            <li key={it.href}>
              <Link
                href={linkDayRefHref(it)}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 py-2 transition hover:border-border-strong"
              >
                <span className="font-mono text-xs text-fg-muted">W{it.week}D{it.day}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{stripDayPrefix(it.title)}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function NoPlanBody({ lang, starter }: { lang: Language; starter: { title: string; href: string } | null }) {
  const s = pick(dashboardStrings, lang);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 id="today-h" className="flex items-center gap-2 text-[13px] font-semibold text-accent">
          <Target className="h-4 w-4" aria-hidden /> {s.todayHeading}
        </h2>
        <p className="text-[17px] font-semibold">{s.noPlanTitle}</p>
        <p className="text-sm text-fg-muted">{s.noPlanBody}</p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Link
          href="/dashboard/goal"
          className="inline-flex min-h-12 flex-[1_1_200px] items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-fg transition hover:opacity-90"
        >
          {s.setGoal}
        </Link>
        {starter && (
          <Link
            href={starter.href}
            className="inline-flex min-h-12 min-w-0 flex-[1_1_240px] items-center justify-center rounded-xl border border-border px-5 text-sm font-medium transition hover:border-border-strong"
          >
            <span className="truncate">{fmt(s.startHere, { title: stripDayPrefix(starter.title) })}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
