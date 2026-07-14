'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage, t } from '@/lib/i18n-client';

type State = 'verifying' | 'success' | 'error';

function VerifyInner() {
  const lang = useLanguage();
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
      setMessage(t(lang, 'invalidLink'));
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
          setMessage(data.message ?? t(lang, 'requestFailed'));
        }
      } catch {
        setState('error');
        setMessage(t(lang, 'networkError'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === 'verifying') {
    return <p className="text-sm text-fg-muted">{t(lang, 'verifyingEmail')}</p>;
  }
  if (state === 'success') {
    return (
      <p className="rounded-md border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted">
        {t(lang, 'emailVerified')}
      </p>
    );
  }
  return <p className="text-sm text-danger">{message}</p>;
}

export default function VerifyPage() {
  const lang = useLanguage();
  return (
    <div className="mx-auto max-w-sm space-y-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{t(lang, 'verifyEmail')}</h1>
      <Suspense fallback={<p className="text-sm text-fg-muted">{t(lang, 'loading')}</p>}>
        <VerifyInner />
      </Suspense>
      <p className="text-center text-xs text-fg-faint">
        <Link href="/" className="text-accent hover:underline">{t(lang, 'backToHome')}</Link>
      </p>
    </div>
  );
}
