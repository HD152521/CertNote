'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface WaitItem {
  email: string;
  created_at: string;
}

// 대기자 명단 + 승인/삭제 버튼. 승인 시 Pro 무기한 부여 + 목록에서 제거.
export function AdminWaitlist({ items }: { items: WaitItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(email: string, action: 'approve' | 'remove') {
    setBusy(email + action);
    setError(null);
    try {
      const res = await fetch('/api/admin/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message ?? '처리에 실패했습니다.');
        return;
      }
      router.refresh();
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">업그레이드 대기자 ({items.length})</h2>
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-fg-faint">아직 대기자가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {items.map((w, i) => (
            <li key={`${w.email}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <span className="truncate">{w.email}</span>
                <span className="ml-2 text-xs text-fg-faint">{w.created_at.slice(0, 10)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => act(w.email, 'approve')}
                  className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg disabled:opacity-50"
                >
                  {busy === w.email + 'approve' ? '처리 중…' : '승인'}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => act(w.email, 'remove')}
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-fg-muted hover:text-fg disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
