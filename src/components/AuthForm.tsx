'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BellRing } from 'lucide-react';
import { emitAuthChange } from '@/lib/auth/authEvents';
import { enablePush, isPushSupported } from '@/lib/push/client';

type Mode = 'login' | 'signup';

interface AuthFormProps {
  mode: Mode;
}

const COPY: Record<Mode, { title: string; submit: string; altText: string; altHref: string; altLabel: string }> = {
  login: { title: '로그인', submit: '로그인', altText: '계정이 없으신가요?', altHref: '/signup', altLabel: '회원가입' },
  signup: { title: '회원가입', submit: '가입하기', altText: '이미 계정이 있으신가요?', altHref: '/login', altLabel: '로그인' },
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const params = useSearchParams();
  const copy = COPY[mode];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 회원가입 성공 후, 알림 권한을 묻는 단계로 전환(지원 브라우저에 한해).
  const [askPush, setAskPush] = useState(false);

  function goNext() {
    const next = params.get('next') || '/';
    router.push(next);
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? '요청을 처리하지 못했습니다.');
        return;
      }
      emitAuthChange();
      // 가입 직후엔 알림 권한 단계로(지원 시). 그 외/미지원이면 바로 이동.
      if (mode === 'signup' && isPushSupported()) {
        setAskPush(true);
        return;
      }
      goNext();
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnablePush() {
    setSubmitting(true);
    await enablePush();
    setSubmitting(false);
    goNext();
  }

  if (askPush) {
    return (
      <div className="mx-auto max-w-sm space-y-6 py-12 text-center">
        <BellRing className="mx-auto h-10 w-10 text-accent" />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">학습 알림을 받을까요?</h1>
          <p className="text-sm text-fg-muted">복습할 카드가 쌓이면 매일 정해진 시각에 알려드려요. 설정에서 언제든 끌 수 있어요.</p>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={submitting}
            className="w-full rounded-md border border-border-strong px-3 py-2 text-sm font-medium transition hover:bg-fg/5 disabled:opacity-50"
          >
            {submitting ? '설정 중…' : '알림 받기'}
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={submitting}
            className="w-full px-3 py-2 text-sm text-fg-muted transition hover:text-fg disabled:opacity-50"
          >
            나중에
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm text-fg-muted">이메일</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-border-strong"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-fg-muted">비밀번호</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-border-strong"
          />
          {mode === 'signup' && <p className="text-xs text-fg-faint">8자 이상</p>}
        </div>
        {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md border border-border-strong px-3 py-2 text-sm font-medium transition hover:bg-fg/5 disabled:opacity-50"
        >
          {submitting ? '처리 중…' : copy.submit}
        </button>
      </form>
      <p className="text-sm text-fg-muted">
        {copy.altText}{' '}
        <Link href={copy.altHref} className="text-fg underline underline-offset-4">{copy.altLabel}</Link>
      </p>
    </div>
  );
}
