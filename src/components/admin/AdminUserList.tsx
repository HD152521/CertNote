'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface AdminUser {
  email: string;
  plan: string; // 'pro' | 'free'
  role: string;
  period_end: string | null; // 'YYYY-MM-DD'(KST), null=무기한
  days_left: number | null;
}

// 현재 유저 목록 + Pro 부여/해지. /api/admin/grant 재사용.
export function AdminUserList({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(email: string, action: 'grant' | 'revoke') {
    setBusy(email);
    setError(null);
    try {
      const res = await fetch('/api/admin/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action }), // grant는 months 미지정=무기한
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
      <h2 className="text-sm font-medium">현재 유저 ({users.length})</h2>
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      <ul className="divide-y divide-border rounded-lg border border-border text-sm">
        {users.map((u) => {
          const isPro = u.plan === 'pro';
          return (
            <li key={u.email} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate">{u.email}</span>
                {u.role === 'admin' && (
                  <span className="shrink-0 rounded bg-bg-subtle px-1.5 py-0.5 text-[10px] text-fg-muted">admin</span>
                )}
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${isPro ? 'bg-accent/10 text-accent' : 'bg-bg-subtle text-fg-faint'}`}>
                  {isPro ? 'Pro' : 'Free'}
                </span>
                {isPro && (
                  <span className={`shrink-0 text-[11px] tabular-nums ${u.days_left !== null && u.days_left <= 7 ? 'text-danger' : 'text-fg-faint'}`}>
                    {u.period_end === null ? '무기한' : `~${u.period_end} · ${u.days_left}일`}
                  </span>
                )}
              </div>
              {isPro ? (
                <button
                  type="button"
                  disabled={busy === u.email}
                  onClick={() => act(u.email, 'revoke')}
                  className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs text-fg-muted hover:text-fg disabled:opacity-50"
                >
                  {busy === u.email ? '처리 중…' : '해지'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy === u.email}
                  onClick={() => act(u.email, 'grant')}
                  className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg disabled:opacity-50"
                >
                  {busy === u.email ? '처리 중…' : 'Pro 부여'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
