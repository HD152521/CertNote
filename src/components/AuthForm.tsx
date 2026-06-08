'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { emitAuthChange } from '@/lib/auth/authEvents';

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
      const next = params.get('next') || '/';
      router.push(next);
      router.refresh();
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
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
