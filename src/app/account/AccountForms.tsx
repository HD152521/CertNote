'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { emitAuthChange } from '@/lib/auth/authEvents';

function ChangePasswordForm() {
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
        setError(data.message ?? '변경에 실패했습니다.');
        return;
      }
      setDone(true);
      setCurrentPassword('');
      setNewPassword('');
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">비밀번호 변경</h2>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="현재 비밀번호"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="새 비밀번호 (8자 이상)"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        {done && <p className="text-xs text-fg-muted">비밀번호가 변경되었습니다.</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? '변경 중…' : '비밀번호 변경'}
        </button>
      </form>
    </section>
  );
}

function DeleteAccountForm() {
  const router = useRouter();
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
        setError(data.message ?? '삭제에 실패했습니다.');
        return;
      }
      emitAuthChange();
      router.push('/');
      router.refresh();
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-danger/40 p-4">
      <h2 className="text-lg font-medium text-danger">계정 삭제</h2>
      <p className="text-sm text-fg-muted">
        계정을 삭제하면 학습 기록과 복습 데이터가 모두 영구 삭제되며 복구할 수 없습니다.
      </p>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md border border-danger/60 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
        >
          계정 삭제하기
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="확인을 위해 비밀번호를 입력하세요"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? '삭제 중…' : '영구 삭제'}
            </button>
            <button
              type="button"
              onClick={() => { setConfirming(false); setPassword(''); setError(''); }}
              className="rounded-md border border-border px-4 py-2 text-sm transition hover:bg-fg/5"
            >
              취소
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
