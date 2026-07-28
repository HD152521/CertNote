'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import {
  disablePush,
  enablePush,
  fetchPrefs,
  isPushSupported,
  isSubscribed,
  permissionState,
  savePrefs,
} from '@/lib/push/client';
import type { NotifPrefs } from '@/lib/push/types';
import { Select } from '@/components/ui/Select';
import { useLanguage } from '@/lib/i18n-client';
import { fmt, pick } from '@/lib/strings/dict';
import { accountStrings, type AccountStringKey } from '@/lib/strings/account';

type Strings = Record<AccountStringKey, string>;

// 12시간제 표기. 한국어는 "오전 9시", 영어는 "9 AM"으로 어순이 뒤집히므로
// 조각을 이어붙이지 않고 hourPattern 자리표시자로 언어별 순서를 표현한다.
function hourLabel(s: Strings, h: number): string {
  const period = h < 12 ? s.amLabel : s.pmLabel;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return fmt(s.hourPattern, { period, hour: h12 });
}

// enablePush()가 돌려주는 실패 사유 코드 → 문구 키.
const REASON_KEY: Record<string, AccountStringKey> = {
  unsupported: 'reasonUnsupported',
  denied: 'reasonDenied',
  no_key: 'reasonNoKey',
  save_failed: 'reasonSaveFailed',
  subscribe_failed: 'reasonSubscribeFailed',
};

// 계정 설정의 알림 섹션. 기기 구독 on/off + 복습/미방문 토글 + 발송 시각.
export function NotificationSettings() {
  const s = pick(accountStrings, useLanguage());
  const [supported] = useState(() => (typeof window === 'undefined' ? true : isPushSupported()));
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [sub, p] = await Promise.all([isSubscribed(), fetchPrefs()]);
      setSubscribed(sub);
      setPrefs(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleEnable() {
    setBusy(true);
    setError(null);
    const res = await enablePush();
    if (!res.ok) {
      const key = REASON_KEY[res.reason ?? ''];
      setError(key ? s[key] : s.enableFailed);
    }
    await reload();
    setBusy(false);
  }

  async function handleDisable() {
    setBusy(true);
    setError(null);
    await disablePush();
    await reload();
    setBusy(false);
  }

  // 설정 변경은 낙관적 갱신 후 서버 저장(실패 시 되돌림).
  async function patch(next: Partial<NotifPrefs>) {
    if (!prefs) return;
    const prev = prefs;
    const optimistic = { ...prefs, ...next };
    setPrefs(optimistic);
    const ok = await savePrefs(next);
    if (!ok) setPrefs(prev);
  }

  if (loading) {
    return <div className="h-24 animate-pulse rounded-lg border border-border" />;
  }

  if (!supported) {
    return (
      <section className="space-y-2 rounded-lg border border-border p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium"><BellOff className="h-4 w-4" /> {s.studyNotifications}</h2>
        <p className="text-sm text-fg-faint">{s.pushUnsupportedDetail}</p>
      </section>
    );
  }

  const denied = permissionState() === 'denied';

  return (
    <section className="space-y-4 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-medium"><BellRing className="h-4 w-4" /> {s.studyNotifications}</h2>
        <p className="text-xs text-fg-faint">{s.studyNotificationsDesc}</p>
      </div>

      {error && <p className="text-sm text-red-500" role="alert">{error}</p>}

      {!subscribed ? (
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy || denied}
          className="w-full rounded-md border border-border-strong px-3 py-2 text-sm font-medium transition hover:bg-fg/5 disabled:opacity-50"
        >
          {busy ? s.enablingNotifications : s.enableOnThisDevice}
        </button>
      ) : (
        <div className="space-y-3">
          <ToggleRow
            label={s.reviewReminder}
            hint={s.reviewReminderHint}
            checked={prefs?.notifyReview ?? true}
            onChange={(v) => patch({ notifyReview: v })}
          />
          <ToggleRow
            label={s.comebackReminder}
            hint={s.comebackReminderHint}
            checked={prefs?.notifyInactive ?? true}
            onChange={(v) => patch({ notifyInactive: v })}
          />
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-fg">{s.reminderTime}</span>
            <Select
              value={String(prefs?.reminderHour ?? 8)}
              onChange={(v) => patch({ reminderHour: Number(v) })}
              options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: hourLabel(s, h) }))}
              className="w-32"
              ariaLabel={s.reminderTime}
            />
          </label>
          <button
            type="button"
            onClick={handleDisable}
            disabled={busy}
            className="text-xs text-fg-faint underline underline-offset-4 hover:text-fg-muted disabled:opacity-50"
          >
            {s.disableOnThisDevice}
          </button>
        </div>
      )}
    </section>
  );
}

interface ToggleRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-fg">{label}</p>
        <p className="text-xs text-fg-faint">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-border-strong'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[1.375rem]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
