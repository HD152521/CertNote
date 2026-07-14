'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage, t } from '@/lib/i18n-client';

function ResetForm() {
  const lang = useLanguage();
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
      if (!res.ok) setError(data.message ?? t(lang, 'requestFailed'));
      else {
        setDone(true);
        setTimeout(() => router.push('/login'), 1500);
      }
    } catch {
      setError(t(lang, 'networkError'));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <p className="text-sm text-danger">{t(lang, 'invalidLink')}</p>;
  }
  if (done) {
    return <p className="rounded-md border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted">{t(lang, 'passwordChanged')}</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-fg-muted">{t(lang, 'enterNewPassword')}</p>
      <input
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t(lang, 'newPassword')}
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? t(lang, 'changing') : t(lang, 'changePassword')}
      </button>
    </form>
  );
}

export default function ResetPage() {
  const lang = useLanguage();
  return (
    <div className="mx-auto max-w-sm space-y-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{t(lang, 'resetPassword')}</h1>
      <Suspense fallback={<p className="text-sm text-fg-muted">{t(lang, 'loading')}</p>}>
        <ResetForm />
      </Suspense>
      <p className="text-center text-xs text-fg-faint">
        <Link href="/login" className="text-accent hover:underline">{t(lang, 'backToLogin')}</Link>
      </p>
    </div>
  );
}
