'use client';

import { useState } from 'react';

// 관리자용 Pro 부여/해지 폼. /api/admin/grant 호출.
export function GrantProForm() {
  const [email, setEmail] = useState('');
  const [months, setMonths] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(action: 'grant' | 'revoke') {
    if (!email.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          action,
          months: action === 'grant' && months ? Number(months) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ ok: false, message: data.message ?? '실패했습니다.' });
      } else if (action === 'revoke') {
        setStatus({ ok: true, message: `${email} Pro 해지 완료` });
      } else {
        setStatus({ ok: true, message: `${email} Pro 부여 완료 (${data.until ? data.until.slice(0, 10) + '까지' : '무기한'})` });
      }
    } catch {
      setStatus({ ok: false, message: '네트워크 오류가 발생했습니다.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <h2 className="text-sm font-medium">Pro 부여 / 해지</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          className="flex-1 min-w-[12rem] rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
        />
        <input
          type="number"
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          placeholder="개월(빈칸=무기한)"
          className="w-32 rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => submit('grant')}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          Pro 부여
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => submit('revoke')}
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          해지
        </button>
      </div>
      {status && (
        <p className={status.ok ? 'text-xs text-success' : 'text-xs text-danger'}>{status.message}</p>
      )}
    </div>
  );
}
