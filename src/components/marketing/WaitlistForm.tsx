'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { waitlistStrings } from '@/lib/strings/waitlist';

// 결제 전 대기자 등록 폼. /api/waitlist 호출.
export function WaitlistForm() {
  const s = pick(waitlistStrings, useLanguage());
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
        setError(data.message ?? s.submitFailed);
      } else {
        setDone(true);
      }
    } catch {
      setError(s.networkError);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-md border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted">
        {s.joined}
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
        placeholder={s.emailPlaceholder}
        className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? s.submitting : s.submit}
      </button>
      {error && <p className="text-xs text-danger sm:w-full">{error}</p>}
    </form>
  );
}
