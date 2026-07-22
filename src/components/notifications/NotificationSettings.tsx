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

function hourLabel(h: number): string {
  const period = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${h12}시`;
}

const REASON_MSG: Record<string, string> = {
  unsupported: '이 브라우저는 알림을 지원하지 않습니다.',
  denied: '브라우저에서 알림 권한이 차단되어 있어요. 사이트 설정에서 허용해 주세요.',
  no_key: '서버 알림 설정이 누락되었습니다. 잠시 후 다시 시도해 주세요.',
  save_failed: '구독 저장에 실패했습니다. 다시 시도해 주세요.',
  subscribe_failed: '알림 구독에 실패했습니다. 다시 시도해 주세요.',
};

// 계정 설정의 알림 섹션. 기기 구독 on/off + 복습/미방문 토글 + 발송 시각.
export function NotificationSettings() {
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
    if (!res.ok) setError(REASON_MSG[res.reason ?? ''] ?? '알림을 켜지 못했습니다.');
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
        <h2 className="flex items-center gap-2 text-sm font-medium"><BellOff className="h-4 w-4" /> 학습 알림</h2>
        <p className="text-sm text-fg-faint">이 브라우저는 푸시 알림을 지원하지 않습니다. iPhone은 홈 화면에 추가한 뒤 사용할 수 있어요.</p>
      </section>
    );
  }

  const denied = permissionState() === 'denied';

  return (
    <section className="space-y-4 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-medium"><BellRing className="h-4 w-4" /> 학습 알림</h2>
        <p className="text-xs text-fg-faint">복습할 카드가 쌓이면, 또는 한동안 안 들어오면 알려드려요.</p>
      </div>

      {error && <p className="text-sm text-red-500" role="alert">{error}</p>}

      {!subscribed ? (
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy || denied}
          className="w-full rounded-md border border-border-strong px-3 py-2 text-sm font-medium transition hover:bg-fg/5 disabled:opacity-50"
        >
          {busy ? '설정 중…' : '이 기기에서 알림 켜기'}
        </button>
      ) : (
        <div className="space-y-3">
          <ToggleRow
            label="복습 리마인더"
            hint="복습할 카드가 있는 날 알림"
            checked={prefs?.notifyReview ?? true}
            onChange={(v) => patch({ notifyReview: v })}
          />
          <ToggleRow
            label="복귀 알림"
            hint="3일 이상 안 들어오면 알림"
            checked={prefs?.notifyInactive ?? true}
            onChange={(v) => patch({ notifyInactive: v })}
          />
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-fg">알림 받을 시각</span>
            <Select
              value={String(prefs?.reminderHour ?? 8)}
              onChange={(v) => patch({ reminderHour: Number(v) })}
              options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: hourLabel(h) }))}
              className="w-32"
              ariaLabel="알림 받을 시각"
            />
          </label>
          <button
            type="button"
            onClick={handleDisable}
            disabled={busy}
            className="text-xs text-fg-faint underline underline-offset-4 hover:text-fg-muted disabled:opacity-50"
          >
            이 기기에서 알림 끄기
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
