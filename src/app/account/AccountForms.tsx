'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { emitAuthChange } from '@/lib/auth/authEvents';
import { t, useLanguage } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { accountStrings } from '@/lib/strings/account';

function ChangePasswordForm() {
  const lang = useLanguage();
  const s = pick(accountStrings, lang);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone(false);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? s.passwordChangeFailed);
        return;
      }
      setDone(true);
      setCurrentPassword('');
      setNewPassword('');
    } catch {
      setError(t(lang, 'networkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{t(lang, 'changePassword')}</h2>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder={s.currentPasswordPlaceholder}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={s.newPasswordPlaceholder}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        {done && <p className="text-xs text-fg-muted">{s.passwordUpdated}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t(lang, 'changing') : t(lang, 'changePassword')}
        </button>
      </form>
    </section>
  );
}

function DeleteAccountForm() {
  const router = useRouter();
  const lang = useLanguage();
  const s = pick(accountStrings, lang);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? s.deleteFailed);
        return;
      }
      emitAuthChange();
      router.push('/');
      router.refresh();
    } catch {
      setError(t(lang, 'networkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-danger/40 p-4">
      <h2 className="text-lg font-medium text-danger">{s.deleteAccount}</h2>
      <p className="text-sm text-fg-muted">{s.deleteAccountWarning}</p>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md border border-danger/60 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
        >
          {s.deleteAccountCta}
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={s.deleteConfirmPlaceholder}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? s.deleting : s.deletePermanently}
            </button>
            <button
              type="button"
              onClick={() => { setConfirming(false); setPassword(''); setError(''); }}
              className="rounded-md border border-border px-4 py-2 text-sm transition hover:bg-fg/5"
            >
              {t(lang, 'cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function AccountForms() {
  return (
    <div className="space-y-10">
      <ChangePasswordForm />
      <DeleteAccountForm />
    </div>
  );
}
