'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface FeedbackItem {
  id: number;
  phone: string;
  message: string;
  rewarded: boolean;
  created_at: string; // 'YYYY-MM-DD'
  email: string | null;
}

// 관리자: 수집된 피드백 열람 + 기프티콘 발송여부(rewarded) 토글.
export function AdminFeedback({ items }: { items: FeedbackItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  async function toggle(id: number, rewarded: boolean) {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, rewarded }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">피드백 ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-fg-faint">아직 받은 피드백이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((f) => (
            <li key={f.id} className="rounded-lg border border-border bg-bg-elevated p-3 text-sm">
              <p className="whitespace-pre-wrap text-fg">{f.message}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                <span>
                  📞 {f.phone}
                  {f.email && <span className="ml-2 text-fg-faint">· {f.email}</span>}
                  <span className="ml-2 text-fg-faint">· {f.created_at}</span>
                </span>
                <button
                  type="button"
                  disabled={busy === f.id}
                  onClick={() => toggle(f.id, !f.rewarded)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                    f.rewarded ? 'bg-success/15 text-success' : 'border border-border text-fg-muted hover:text-fg'
                  }`}
                >
                  {f.rewarded ? '✓ 기프티콘 발송됨' : '기프티콘 발송 표시'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
