'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLanguage, t } from '@/lib/i18n-client';

export default function ForgotPage() {
  const lang = useLanguage();
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
      if (!res.ok) setError(data.message ?? t(lang, 'requestFailed'));
      else setSent(true);
    } catch {
      setError(t(lang, 'networkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{t(lang, 'forgotPassword')}</h1>
      {sent ? (
        <p className="rounded-md border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted">
          {t(lang, 'weSentResetLink')}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-fg-muted">{t(lang, 'enterEmailForReset')}</p>
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
            {busy ? t(lang, 'sending') : t(lang, 'sendResetLink')}
          </button>
        </form>
      )}
      <p className="text-center text-xs text-fg-faint">
        <Link href="/login" className="text-accent hover:underline">{t(lang, 'backToLogin')}</Link>
      </p>
    </div>
  );
}
