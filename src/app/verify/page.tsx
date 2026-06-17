'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type State = 'verifying' | 'success' | 'error';

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('verifying');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode 중복 호출 방지(토큰은 1회성).
    ran.current = true;

    if (!token) {
      setState('error');
      setMessage('유효하지 않은 링크입니다.');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setState('success');
        } else {
          setState('error');
          setMessage(data.message ?? '인증에 실패했습니다.');
        }
      } catch {
        setState('error');
        setMessage('네트워크 오류가 발생했습니다.');
      }
    })();
  }, [token]);

  if (state === 'verifying') {
    return <p className="text-sm text-fg-muted">이메일 인증 중…</p>;
  }
  if (state === 'success') {
    return (
      <p className="rounded-md border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted">
        이메일 인증이 완료되었습니다.
      </p>
    );
  }
  return <p className="text-sm text-danger">{message}</p>;
}

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">이메일 인증</h1>
      <Suspense fallback={<p className="text-sm text-fg-muted">로딩 중…</p>}>
        <VerifyInner />
      </Suspense>
      <p className="text-center text-xs text-fg-faint">
        <Link href="/" className="text-accent hover:underline">홈으로 돌아가기</Link>
      </p>
    </div>
  );
}
