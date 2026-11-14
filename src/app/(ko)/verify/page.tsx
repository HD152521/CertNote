'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage, t } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { verifyStrings } from '@/lib/strings/verify';

type State = 'verifying' | 'success' | 'error';

function VerifyInner() {
  const lang = useLanguage();
  const vs = pick(verifyStrings, lang);
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('verifying');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode 중복 호출 방지(토큰은 1회성).
    ran.current = true;

    if (!token) return; // 토큰 없는 링크는 아래 렌더에서 바로 오류로 보여 준다.
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

  // 재발송 버튼은 로그인 세션이 필요하다 — 이 화면은 로그아웃 상태로 열리는 일이 많아 마이페이지로 보낸다
  // (비로그인이면 미들웨어가 로그인 후 /account 로 돌려보낸다).
  const resendLink = (
    <Link href="/account" className="text-sm text-accent hover:underline">{vs.verifyResendFromAccount}</Link>
  );
  if (!token) {
    // 비밀번호 재설정용 invalidLink 문구를 쓰지 않는다 — 이메일 인증 맥락의 안내로.
    return (
      <div className="space-y-3">
        <p className="text-sm text-danger">{vs.verifyMissingToken}</p>
        {resendLink}
      </div>
    );
  }
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
  return (
    <div className="space-y-3">
      <p className="text-sm text-danger">{message}</p>
      {resendLink}
    </div>
  );
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
