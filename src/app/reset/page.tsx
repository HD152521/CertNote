'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.message ?? '재설정에 실패했습니다.');
      else {
        setDone(true);
        setTimeout(() => router.push('/login'), 1500);
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <p className="text-sm text-danger">유효하지 않은 링크입니다. 재설정을 다시 요청해 주세요.</p>;
  }
  if (done) {
    return <p className="rounded-md border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted">비밀번호가 변경되었습니다. 로그인 페이지로 이동합니다…</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-fg-muted">새 비밀번호를 입력하세요 (8자 이상).</p>
      <input
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="새 비밀번호"
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? '변경 중…' : '비밀번호 변경'}
      </button>
    </form>
  );
}

export default function ResetPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">새 비밀번호 설정</h1>
      <Suspense fallback={<p className="text-sm text-fg-muted">로딩 중…</p>}>
        <ResetForm />
      </Suspense>
      <p className="text-center text-xs text-fg-faint">
        <Link href="/login" className="text-accent hover:underline">로그인으로 돌아가기</Link>
      </p>
    </div>
  );
}
