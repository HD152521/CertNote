'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/Select';
import { MINUTES_PER_QUESTION } from '@/lib/analytics/passPredictor';
import { MIN_ATTEMPTS_FOR_PREDICTION } from '@/lib/analytics/readiness';
import { MINUTES_PER_NOTE, previewGoal, type CertSnapshot } from '@/lib/study/goalPreview';
import type { Language } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { goalStrings } from '@/lib/strings/dashboard';
import { fmt } from '@/lib/strings/study';

export interface GoalCertOption {
  slug: string;
  code: string;
  name: string;
  snapshot: CertSnapshot;
  hasPlan: boolean;
}

interface GoalFormProps {
  lang: Language;
  today: string; // KST 'YYYY-MM-DD'
  certs: GoalCertOption[];
  initial: { certSlug: string; examDate: string; dailyMinutes: number; targetAccuracy: number };
}

const WEEK_CHIPS = [6, 8, 12];
const MINUTE_OPTIONS = [15, 30, 45, 60] as const;
const ACCURACY_OPTIONS = [70, 75, 80];
const MINUTE_HINT = { 15: 'minHint15', 30: 'minHint30', 45: 'minHint45', 60: 'minHint60' } as const;

const DAY_MS = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const mmdd = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

const optionClass = (on: boolean) =>
  on ? 'border-2 border-accent bg-accent/5 text-fg' : 'border border-border-strong bg-bg-elevated text-fg hover:border-fg-muted';

export function GoalForm({ lang, today, certs, initial }: GoalFormProps) {
  const s = pick(goalStrings, lang);
  const router = useRouter();
  const [certSlug, setCertSlug] = useState(initial.certSlug);
  const [examDate, setExamDate] = useState(initial.examDate);
  const [minutes, setMinutes] = useState(initial.dailyMinutes);
  const [accuracy, setAccuracy] = useState(initial.targetAccuracy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cert = certs.find((c) => c.slug === certSlug) ?? certs[0];
  const daysLeft = daysBetween(today, examDate);
  const validDate = Number.isFinite(daysLeft) && daysLeft > 0;
  const accuracyOptions = ACCURACY_OPTIONS.includes(initial.targetAccuracy)
    ? ACCURACY_OPTIONS
    : [...ACCURACY_OPTIONS, initial.targetAccuracy].sort((a, b) => a - b);
  const minuteOptions: number[] = (MINUTE_OPTIONS as readonly number[]).includes(initial.dailyMinutes)
    ? [...MINUTE_OPTIONS]
    : [...MINUTE_OPTIONS, initial.dailyMinutes].sort((a, b) => a - b);

  const preview = useMemo(
    () => (cert && validDate ? previewGoal(cert.snapshot, { daysUntilExam: daysLeft, dailyMinutes: minutes, targetAccuracy: accuracy }) : null),
    [cert, validDate, daysLeft, minutes, accuracy],
  );

  async function save() {
    if (!cert) return;
    if (!validDate) {
      setError(s.pastDate);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/study/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certSlug: cert.slug, examDate, targetAccuracy: accuracy, dailyMinutesGoal: minutes, focus: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.message === 'string' ? data.message : s.saveFailed);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError(s.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!cert) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/study/plan', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certSlug: cert.slug }),
      });
      if (!res.ok) {
        setError(s.saveFailed);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError(s.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  const fitText = preview
    ? preview.fit === 'comfortable'
      ? fmt(s.fitComfortable, { n: preview.spareDays })
      : preview.fit === 'tight'
        ? s.fitTight
        : fmt(s.fitShort, { n: -preview.spareDays })
    : '';
  const fitClass =
    preview?.fit === 'comfortable'
      ? 'bg-accent/10 text-accent'
      : preview?.fit === 'tight'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : 'bg-orange-500/10 text-orange-700 dark:text-orange-400';

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="font-mono text-xs tracking-wider text-fg-muted">{s.eyebrow}</p>
          <h1 className="text-2xl font-bold tracking-tight">{s.title}</h1>
          <p className="text-sm text-fg-muted">{s.intro}</p>
        </div>
        <Link href="/dashboard" className="text-sm text-fg-muted hover:text-fg">{s.close}</Link>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_480px] space-y-4">
          <Step n={1} title={s.step1}>
            <Select
              value={certSlug}
              onChange={setCertSlug}
              options={certs.map((c) => ({ value: c.slug, label: `${c.code} · ${c.name}` }))}
              ariaLabel={s.step1}
            />
          </Step>

          <Step n={2} title={s.step2}>
            <div className="flex flex-wrap items-center gap-2">
              {WEEK_CHIPS.map((w) => {
                const d = addDays(today, w * 7);
                return (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={examDate === d}
                    onClick={() => setExamDate(d)}
                    className={`min-h-11 rounded-full px-4 text-sm transition ${optionClass(examDate === d)}`}
                  >
                    {fmt(s.weeksLater, { n: w })}
                  </button>
                );
              })}
              <label className="inline-flex items-center gap-2 text-[13px] text-fg-muted">
                {s.customDate}
                <input
                  type="date"
                  value={examDate}
                  min={addDays(today, 1)}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="min-h-11 rounded-xl border border-border-strong bg-transparent px-2.5 text-sm text-fg"
                />
              </label>
            </div>
            <p className="text-xs text-fg-muted">{s.dateHint}</p>
          </Step>

          <Step n={3} title={s.step3}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {minuteOptions.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={minutes === m}
                  onClick={() => setMinutes(m)}
                  className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl transition ${optionClass(minutes === m)}`}
                >
                  <span className="font-mono text-lg font-medium">{fmt(s.minutes, { n: m })}</span>
                  {m in MINUTE_HINT && (
                    <span className="text-[11px] text-fg-muted">{s[MINUTE_HINT[m as keyof typeof MINUTE_HINT]]}</span>
                  )}
                </button>
              ))}
            </div>
          </Step>

          <Step n={4} title={s.step4}>
            <div className="flex flex-wrap gap-2">
              {accuracyOptions.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={accuracy === a}
                  onClick={() => setAccuracy(a)}
                  className={`min-h-11 rounded-full px-5 text-sm transition ${optionClass(accuracy === a)}`}
                >
                  {a}%
                </button>
              ))}
            </div>
            <p className="text-xs text-fg-muted">{s.accuracyHint}</p>
          </Step>
        </div>

        <aside
          aria-labelledby="pv-h"
          className="min-w-0 flex-[1_1_340px] space-y-4 rounded-2xl border-2 border-accent bg-bg-elevated p-5 shadow-[0_12px_32px_-18px_var(--accent)] lg:sticky lg:top-20"
        >
          <h2 id="pv-h" className="text-[13px] font-semibold text-accent">{s.previewHeading}</h2>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[15px] font-semibold">{cert?.code}</span>
            <span className="font-mono text-[28px] font-medium text-accent">{validDate ? `D-${daysLeft}` : '—'}</span>
          </div>

          {preview ? (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <Stat label={s.perDayLabel} value={fmt(s.perDayValue, { notes: preview.notesPerDay, q: preview.questionsPerDay })} />
                <Stat
                  label={s.finishLabel}
                  value={`${mmdd(addDays(today, preview.daysNeeded))}${preview.spareDays < 0 ? ` ${s.afterExam}` : ''}`}
                />
              </div>
              <p className={`rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ${fitClass}`}>{fitText}</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-fg-muted">{s.readyLabel}</span>
                  <b className="font-mono">{preview.readyAtExam === null ? '—' : `${preview.readyAtExam}%`}</b>
                </div>
                {preview.readyAtExam === null ? (
                  <p className="text-xs text-fg-muted">{fmt(s.readyPending, { n: MIN_ATTEMPTS_FOR_PREDICTION - 1 })}</p>
                ) : (
                  <div className="h-2 overflow-hidden rounded-full bg-bg-subtle">
                    <div
                      className={`h-full rounded-full ${preview.readyAtExam >= 65 ? 'bg-accent' : preview.readyAtExam >= 40 ? 'bg-amber-500' : 'bg-orange-500'}`}
                      style={{ width: `${preview.readyAtExam}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="space-y-2.5 border-t border-border pt-3.5">
                <p className="text-xs font-semibold text-fg-muted">{s.milestonesHeading}</p>
                <ol className="space-y-2">
                  {preview.milestones.map((m) => (
                    <li key={m.kind} className="flex items-center gap-2.5 text-[13px]">
                      <span className="w-11 shrink-0 font-mono text-xs text-fg-muted">{mmdd(addDays(today, m.dayOffset))}</span>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
                      <span>{fmt(s[`ms_${m.kind}`], { cov: m.coverage, acc: accuracy })}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <p className="text-[11px] text-fg-muted">{fmt(s.estimateNote, { note: MINUTES_PER_NOTE, q: MINUTES_PER_QUESTION })}</p>
            </>
          ) : (
            <p className="text-sm text-fg-muted">{s.pastDate}</p>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy || !preview}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-accent text-[15px] font-semibold text-accent-fg transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? s.saving : s.save}
          </button>
          {cert?.hasPlan && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="w-full text-center text-xs text-fg-muted underline underline-offset-4 hover:text-danger disabled:opacity-50"
            >
              {s.deletePlan}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`goal-step-${n}`} className="space-y-3 rounded-2xl border border-border bg-bg-elevated p-5">
      <h2 id={`goal-step-${n}`} className="text-sm font-semibold">
        <span className="mr-1.5 font-mono text-accent">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg-subtle p-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold">{value}</p>
    </div>
  );
}
