'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Flame, CalendarDays, Target, Snowflake } from 'lucide-react';
import { StreakCalendar } from './StreakCalendar';

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
          <Target className="h-4 w-4 text-accent" /> 합격 플랜
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
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-fg-muted">연속 학습 기록</p>
            <p className="flex items-center gap-2 text-[11px] text-fg-faint">
              <span>최장 {streak?.longest ?? 0}일</span>
              {(streak?.freezeTokens ?? 0) > 0 && (
                <span className="inline-flex items-center gap-0.5 text-sky-500">
                  <Snowflake className="h-3 w-3" /> {streak?.freezeTokens}
                </span>
              )}
            </p>
          </div>
          <StreakCalendar activeDates={activity} frozenDate={streak?.frozenDate ?? null} today={today} />
        </div>
      )}
    </section>
  );
}

function StreakBadge({ streak }: { streak: Streak | null }) {
  if (!streak || streak.current === 0) {
    return <span className="text-xs text-fg-faint">스트릭 없음</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${streak.activeToday ? 'bg-accent/10 text-accent' : 'bg-bg-subtle text-fg-muted'}`}>
      <Flame className="h-3.5 w-3.5" /> {streak.current}일 연속
    </span>
  );
}

function PlanSummary({ portion, onEdit, onSaved }: { portion: Portion; onEdit: () => void; onSaved: () => void }) {
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
          <p className="mt-0.5 text-xs text-fg-faint">시험일 {portion.examDate}</p>
        </div>
        <span className={`shrink-0 text-lg font-bold tabular-nums ${portion.dday >= 0 ? 'text-accent' : 'text-fg-faint'}`}>{ddayLabel}</span>
      </div>

      {portion.catchUp?.isBehind && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          일정보다 <b>{portion.catchUp.behindBy}일</b> 뒤처졌어요. 시험일에 맞추려고 오늘 분량을{' '}
          <b>{portion.catchUp.basePerDay}개 → {portion.catchUp.perDay}개</b>로 늘렸어요.
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-fg-muted">오늘 학습 분량</p>
        {portion.finished ? (
          <p className="text-sm text-fg-faint">예정 분량을 모두 마쳤어요. 복습으로 마무리해요 💪</p>
        ) : portion.items.length === 0 ? (
          <p className="text-sm text-fg-faint">오늘 배정된 분량이 없어요.</p>
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
        시험일 변경
      </button>
    </div>
  );
}

// 학습 목표(정확도·일일시간) 편집. 저장 시 PATCH → 목록 새로고침.
function GoalEditor({ portion, onSaved }: { portion: Portion; onSaved: () => void }) {
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
      <p className="mb-2 text-xs font-medium text-fg-muted">학습 목표</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-fg-muted">목표 정확도</span>
          <select
            value={accuracy}
            onChange={(e) => { setAccuracy(Number(e.target.value)); setSaved(false); }}
            className="rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-border-strong"
          >
            {ACCURACY_OPTIONS.map((a) => <option key={a} value={a}>{a}%</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-fg-muted">하루</span>
          <input
            type="number"
            min={0}
            max={600}
            value={minutes}
            onChange={(e) => { setMinutes(e.target.value); setSaved(false); }}
            placeholder="—"
            className="w-16 rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-border-strong"
          />
          <span className="text-fg-muted">분</span>
        </label>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-md border border-border-strong px-2.5 py-1 font-medium transition hover:bg-fg/5 disabled:opacity-50"
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        )}
        {saved && !dirty && <span className="text-accent">저장됨</span>}
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
  const [certSlug, setCertSlug] = useState(initial?.certSlug ?? certs[0]?.slug ?? '');
  const [examDate, setExamDate] = useState(initial?.examDate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!certSlug || !examDate) {
      setError('자격증과 시험일을 선택하세요.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/study/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certSlug, examDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? '저장하지 못했습니다.');
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
      {!initial && <p className="text-sm text-fg-muted">시험일을 정하면 D-day 카운트다운과 매일 학습 분량을 챙겨드려요.</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select
          value={certSlug}
          onChange={(e) => setCertSlug(e.target.value)}
          className="rounded-md border border-border bg-transparent px-2 py-2 text-sm outline-none focus:border-border-strong"
        >
          {certs.map((c) => (
            <option key={c.slug} value={c.slug}>{c.code} · {c.name}</option>
          ))}
        </select>
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
          {busy ? '저장 중…' : '시험일 저장'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="px-2 py-1.5 text-sm text-fg-muted hover:text-fg">취소</button>
        )}
        {initial && (
          <button type="button" onClick={remove} disabled={busy} className="ml-auto text-xs text-fg-faint underline underline-offset-4 hover:text-red-500">
            플랜 삭제
          </button>
        )}
      </div>
    </div>
  );
}
