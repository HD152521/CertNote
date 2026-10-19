'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { emitAuthChange } from '@/lib/auth/authEvents';
import { t, useLanguage } from '@/lib/i18n-client';
import { fmt, pick } from '@/lib/strings/dict';
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

// 비밀번호 없는(구글 전용) 계정: 현재 비밀번호 칸이 없으므로 변경 폼 대신 "설정 메일"을 보낸다.
// 세션만으로 바로 정하게 하지 않는 이유는 /api/account/password/setup 주석 참고(메일함 소유 확인).
function SetPasswordSection({ userEmail }: { userEmail: string }) {
  const lang = useLanguage();
  const s = pick(accountStrings, lang);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    if (busy || sent) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/account/password/setup', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSent(true);
      } else if (res.status === 429) {
        setError(s.tooManyRequests);
      } else {
        setError(data.message ?? s.setPasswordEmailFailed);
      }
    } catch {
      setError(t(lang, 'networkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{s.setPasswordTitle}</h2>
      <p className="text-sm text-fg-muted">{s.setPasswordDesc}</p>
      {error && <p className="text-xs text-danger">{error}</p>}
      {sent && <p role="status" className="text-xs text-fg-muted">{fmt(s.setPasswordEmailSent, { email: userEmail })}</p>}
      <button
        type="button"
        onClick={send}
        disabled={busy || sent}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? s.sendingSetPasswordEmail : s.sendSetPasswordEmail}
      </button>
    </section>
  );
}

// 탈퇴 확인 수단은 서버가 정한 계정 종류(hasPassword)에 맞춘다. 서버(/api/account/delete)도
// DB 값으로 다시 판정하므로, 이 화면이 다른 폼을 보내더라도 확인을 건너뛸 수 없다.
function DeleteAccountForm({ hasPassword, userEmail }: { hasPassword: boolean; userEmail: string }) {
  const router = useRouter();
  const lang = useLanguage();
  const s = pick(accountStrings, lang);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  // 구글 전용 계정은 최근 로그인(서버 판정)이 필요하다 — 403 reauth_required 면 재로그인 안내로 바꾼다.
  const [needsReauth, setNeedsReauth] = useState(false);
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
        body: JSON.stringify(hasPassword ? { password } : { confirmEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403 && data.error === 'reauth_required') {
          setNeedsReauth(true);
          setError(s.reauthRequired);
          return;
        }
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

  // 로그아웃 후 로그인 화면으로 — 다시 로그인(구글)하면 next 로 마이페이지에 돌아와 10분 안에 탈퇴할 수 있다.
  async function reauth() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    emitAuthChange();
    router.push('/login?next=/account');
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
          {hasPassword ? (
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={s.deleteConfirmPlaceholder}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
          ) : (
            <>
              <p className="text-xs text-fg-muted">{s.deleteRecentLoginHint}</p>
              <label htmlFor="delete-confirm-email" className="block text-sm text-fg-muted">
                {fmt(s.deleteConfirmEmailHint, { email: userEmail })}
              </label>
              <input
                id="delete-confirm-email"
                type="email"
                autoComplete="off"
                required
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={s.deleteConfirmEmailPlaceholder}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              />
            </>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          {needsReauth && (
            <button
              type="button"
              onClick={reauth}
              className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-fg/5"
            >
              {s.reauthCta}
            </button>
          )}
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
              onClick={() => { setConfirming(false); setPassword(''); setConfirmEmail(''); setNeedsReauth(false); setError(''); }}
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

interface AccountFormsProps {
  /** 서버(DB has_password)가 정한 계정 종류. false = 구글로 가입해 비밀번호가 없는 계정. */
  hasPassword: boolean;
  userEmail: string;
}

export function AccountForms({ hasPassword, userEmail }: AccountFormsProps) {
  return (
    <div className="space-y-10">
      {hasPassword ? <ChangePasswordForm /> : <SetPasswordSection userEmail={userEmail} />}
      <DeleteAccountForm hasPassword={hasPassword} userEmail={userEmail} />
    </div>
  );
}
