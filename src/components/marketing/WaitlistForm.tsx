'use client';

import { useState } from 'react';

// 결제 전 대기자 등록 폼. /api/waitlist 호출.
export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? '등록에 실패했습니다.');
      } else {
        setDone(true);
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-md border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted">
        등록 완료! 출시되면 가장 먼저 알려드릴게요. 🎉
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="이메일을 입력하세요"
        className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? '등록 중…' : '출시 알림 받기'}
      </button>
      {error && <p className="text-xs text-danger sm:w-full">{error}</p>}
    </form>
  );
}
