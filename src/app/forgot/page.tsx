'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.message ?? '요청에 실패했습니다.');
      else setSent(true);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">비밀번호 재설정</h1>
      {sent ? (
        <p className="rounded-md border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted">
          입력하신 이메일이 가입되어 있다면 재설정 링크를 보냈습니다. 메일함을 확인해 주세요.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-fg-muted">가입한 이메일을 입력하면 재설정 링크를 보내드립니다.</p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? '전송 중…' : '재설정 링크 받기'}
          </button>
        </form>
      )}
      <p className="text-center text-xs text-fg-faint">
        <Link href="/login" className="text-accent hover:underline">로그인으로 돌아가기</Link>
      </p>
    </div>
  );
}
