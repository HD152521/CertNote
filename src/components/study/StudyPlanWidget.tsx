'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Flame, CalendarDays, Target, Snowflake } from 'lucide-react';
import { StreakCalendar } from './StreakCalendar';
import { Select } from '@/components/ui/Select';
import { useLanguage } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { fmt, fmtRich, studyPlanStrings } from '@/lib/strings/study';

interface CertOption {
  slug: string;
  name: string;
  code: string;
}

interface DayItem {
  week: number;
  day: number;
  title: string;
  href: string;
}

interface Portion {
  certSlug: string;
  certName: string;
  certCode: string;
  examDate: string;
  dday: number;
  items: DayItem[];
  totalDays: number;
  scheduledIndex: number;
  finished: boolean;
  targetAccuracy: number;
  dailyMinutesGoal: number | null;
  catchUp?: {
    isBehind: boolean;
    behindBy: number;
    perDay: number;
    basePerDay: number;
  };
}

const ACCURACY_OPTIONS = [60, 70, 80, 90];

interface Streak {
  current: number;
  activeToday: boolean;
  longest: number;
  freezeTokens: number;
  frozenDate: string | null;
}

interface StudyPlanWidgetProps {
  certs: CertOption[];
}

function stripDayPrefix(title: string): string {
  return title.replace(/^Day\s*\d+\s*[-–]\s*/i, '');
}

export function StudyPlanWidget({ certs }: StudyPlanWidgetProps) {
  const lang = useLanguage();
  const s = pick(studyPlanStrings, lang);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [portion, setPortion] = useState<Portion | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  const [today, setToday] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/study/today', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setStreak(data.streak ?? null);
      setPortion(data.portion ?? null);
      setActivity(data.activity ?? []);
      setToday(data.today ?? '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="h-28 animate-pulse rounded-xl border border-border bg-bg-elevated" />;
  }

  const showForm = editing || !portion;

  return (
    <section className="rounded-xl border border-border bg-bg-elevated p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Target className="h-4 w-4 text-accent" /> {s.planTitle}
        </h2>
        <StreakBadge streak={streak} />
      </div>

      {portion && !editing && <PlanSummary portion={portion} onEdit={() => setEditing(true)} onSaved={load} />}

      {showForm && (
        <PlanForm
          certs={certs}
          initial={portion}
          onDone={async () => {
            setEditing(false);
            setLoading(true);
            await load();
          }}
          onCancel={portion ? () => setEditing(false) : undefined}
        />
      )}

      {today && activity.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="flex items-baseline gap-1.5">
              <Flame className={`h-5 w-5 self-center ${streak?.activeToday ? 'text-accent' : 'text-fg-faint'}`} />
              <span className="text-2xl font-bold leading-none tabular-nums text-fg">{streak?.current ?? 0}</span>
              <span className="text-sm text-fg-muted">{s.streakUnit}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-fg-muted">{fmt(s.longestBadge, { n: streak?.longest ?? 0 })}</span>
              {(streak?.freezeTokens ?? 0) > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/10 px-2 py-0.5 font-medium text-sky-500">
                  <Snowflake className="h-3 w-3" /> {streak?.freezeTokens}
                </span>
              )}
            </div>
          </div>
          <StreakCalendar activeDates={activity} frozenDate={streak?.frozenDate ?? null} today={today} />
        </div>
      )}
    </section>
  );
}

function StreakBadge({ streak }: { streak: Streak | null }) {
  const s = pick(studyPlanStrings, useLanguage());
  if (!streak || streak.current === 0) {
    return <span className="text-xs text-fg-faint">{s.noStreak}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${streak.activeToday ? 'bg-accent/10 text-accent' : 'bg-bg-subtle text-fg-muted'}`}>
      <Flame className="h-3.5 w-3.5" /> {fmt(s.streakBadge, { n: streak.current })}
    </span>
  );
}

function PlanSummary({ portion, onEdit, onSaved }: { portion: Portion; onEdit: () => void; onSaved: () => void }) {
  const s = pick(studyPlanStrings, useLanguage());
  const ddayLabel = portion.dday > 0 ? `D-${portion.dday}` : portion.dday === 0 ? 'D-DAY' : `D+${-portion.dday}`;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm">
            <CalendarDays className="h-4 w-4 text-fg-muted" />
            <span className="font-mono text-[11px] text-fg-faint">{portion.certCode}</span>
            <span className="truncate text-fg">{portion.certName}</span>
          </p>
          <p className="mt-0.5 text-xs text-fg-faint">{fmt(s.examDateLabel, { date: portion.examDate })}</p>
        </div>
        <span className={`shrink-0 text-lg font-bold tabular-nums ${portion.dday >= 0 ? 'text-accent' : 'text-fg-faint'}`}>{ddayLabel}</span>
      </div>

      {portion.catchUp?.isBehind && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          {fmtRich(s.catchUp, {
            behind: portion.catchUp.behindBy,
            from: portion.catchUp.basePerDay,
            to: portion.catchUp.perDay,
          }).map((part, i) =>
            part.bold ? <b key={i}>{part.text}</b> : <Fragment key={i}>{part.text}</Fragment>,
          )}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-fg-muted">{s.todayHeading}</p>
        {portion.finished ? (
          <p className="text-sm text-fg-faint">{s.allDone}</p>
        ) : portion.items.length === 0 ? (
          <p className="text-sm text-fg-faint">{s.nothingToday}</p>
        ) : (
          <ul className="space-y-1">
            {portion.items.map((it) => (
              <li key={it.href}>
                <Link href={it.href} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-bg-subtle">
                  <span className="font-mono text-[11px] text-fg-faint">W{it.week}D{it.day}</span>
                  <span className="truncate text-fg">{stripDayPrefix(it.title)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <GoalEditor portion={portion} onSaved={onSaved} />

      <button type="button" onClick={onEdit} className="text-xs text-fg-faint underline underline-offset-4 hover:text-fg-muted">
        {s.changeExamDate}
      </button>
    </div>
  );
}

// 학습 목표(정확도·일일시간) 편집. 저장 시 PATCH → 목록 새로고침.
function GoalEditor({ portion, onSaved }: { portion: Portion; onSaved: () => void }) {
  const s = pick(studyPlanStrings, useLanguage());
  const [accuracy, setAccuracy] = useState(portion.targetAccuracy);
  const [minutes, setMinutes] = useState<string>(portion.dailyMinutesGoal != null ? String(portion.dailyMinutesGoal) : '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = accuracy !== portion.targetAccuracy || minutes !== (portion.dailyMinutesGoal != null ? String(portion.dailyMinutesGoal) : '');

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch('/api/study/plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certSlug: portion.certSlug,
          targetAccuracy: accuracy,
          dailyMinutesGoal: minutes === '' ? null : Number(minutes),
        }),
      });
      if (res.ok) {
        setSaved(true);
        onSaved();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-bg-subtle p-3">
      <p className="mb-2 text-xs font-medium text-fg-muted">{s.goalsHeading}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-fg-muted">{s.targetAccuracy}</span>
          <Select
            value={String(accuracy)}
            onChange={(val) => { setAccuracy(Number(val)); setSaved(false); }}
            options={ACCURACY_OPTIONS.map((a) => ({ value: String(a), label: `${a}%` }))}
            className="w-24"
            ariaLabel={s.targetAccuracy}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-fg-muted">{s.dailyLabel}</span>
          <input
            type="number"
            min={0}
            max={600}
            value={minutes}
            onChange={(e) => { setMinutes(e.target.value); setSaved(false); }}
            placeholder="—"
            className="w-16 rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-border-strong"
          />
          <span className="text-fg-muted">{s.minutesUnit}</span>
        </label>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-md border border-border-strong px-2.5 py-1 font-medium transition hover:bg-fg/5 disabled:opacity-50"
          >
            {busy ? s.saving : s.save}
          </button>
        )}
        {saved && !dirty && <span className="text-accent">{s.saved}</span>}
      </div>
    </div>
  );
}

function PlanForm({
  certs,
  initial,
  onDone,
  onCancel,
}: {
  certs: CertOption[];
  initial: Portion | null;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const s = pick(studyPlanStrings, useLanguage());
  const [certSlug, setCertSlug] = useState(initial?.certSlug ?? certs[0]?.slug ?? '');
  const [examDate, setExamDate] = useState(initial?.examDate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!certSlug || !examDate) {
      setError(s.selectCertAndDate);
      return;
    }
    setBusy(true);
    try {
      // 편집 중 자격증을 바꾼 경우: 새 자격증으로 플랜을 '이동'시킨다.
      // 플랜은 자격증별 키라 삭제 없이 PUT만 하면 옛 플랜이 남아 위젯이 계속 그걸 보여준다.
      if (initial && initial.certSlug !== certSlug) {
        await fetch('/api/study/plan', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certSlug: initial.certSlug }),
        }).catch(() => {});
      }
      const res = await fetch('/api/study/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certSlug, examDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? s.saveFailed);
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial) return;
    setBusy(true);
    try {
      await fetch('/api/study/plan', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certSlug: initial.certSlug }),
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!initial && <p className="text-sm text-fg-muted">{s.planIntro}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Select
          value={certSlug}
          onChange={setCertSlug}
          options={certs.map((c) => ({ value: c.slug, label: `${c.code} · ${c.name}` }))}
          ariaLabel={s.certAriaLabel}
        />
        <input
          type="date"
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
          className="rounded-md border border-border bg-transparent px-2 py-2 text-sm outline-none focus:border-border-strong"
        />
      </div>
      {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium transition hover:bg-fg/5 disabled:opacity-50"
        >
          {busy ? s.saving : s.saveExamDate}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="px-2 py-1.5 text-sm text-fg-muted hover:text-fg">{s.cancel}</button>
        )}
        {initial && (
          <button type="button" onClick={remove} disabled={busy} className="ml-auto text-xs text-fg-faint underline underline-offset-4 hover:text-red-500">
            {s.deletePlan}
          </button>
        )}
      </div>
    </div>
  );
}
