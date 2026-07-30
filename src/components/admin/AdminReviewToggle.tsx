'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface AdminReviewToggleProps {
  id: string;
  hidden: boolean;
}

// 후기 숨김/노출 토글(관리자). POST /api/admin/reviews 후 목록 새로고침.
export function AdminReviewToggle({ id, hidden }: AdminReviewToggleProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, hidden: !hidden }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-fg-muted transition hover:border-border-strong disabled:opacity-60"
    >
      {hidden ? '노출' : '숨김'}
    </button>
  );
}
