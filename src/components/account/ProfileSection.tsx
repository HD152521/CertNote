'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CertOption } from '@/components/AuthForm';
import { OCCUPATION_OPTIONS, PURPOSE_OPTIONS, EXPERIENCE_OPTIONS } from '@/lib/profileOptions';

export interface ProfileValues {
  name: string;
  birthdate: string; // 'YYYY-MM-DD'
  occupation: string;
  targetCert: string;
  purpose: string;
  experienceLevel: string;
}

const INPUT_CLS =
  'w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none transition focus:border-border-strong';

// 마이페이지 내 프로필 보기/수정. PATCH /api/account/profile.
// 개인정보 / 학습 정보 두 그룹으로 나눠 스캔하기 쉽게 한다.
export function ProfileSection({ certs, initial }: { certs: CertOption[]; initial: ProfileValues }) {
  const router = useRouter();
  const [v, setV] = useState<ProfileValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function set<K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
    setDone(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone(false);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? '저장에 실패했습니다.');
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Group title="개인정보">
        <Field label="이름">
          <input type="text" required value={v.name} onChange={(e) => set('name', e.target.value)} className={INPUT_CLS} />
        </Field>
        <Field label="생년월일">
          <input type="date" required value={v.birthdate} onChange={(e) => set('birthdate', e.target.value)} className={INPUT_CLS} />
        </Field>
      </Group>

      <Group title="학습 정보" hint="맞춤 추천에 사용됩니다">
        <Field label="목표 자격증">
          <select required value={v.targetCert} onChange={(e) => set('targetCert', e.target.value)} className={INPUT_CLS}>
            <option value="" disabled>선택해 주세요</option>
            {certs.map((c) => (
              <option key={c.slug} value={c.slug}>{c.code} · {c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="직업" optional>
          <select value={v.occupation} onChange={(e) => set('occupation', e.target.value)} className={INPUT_CLS}>
            <option value="">선택 안 함</option>
            {OCCUPATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="학습 목적" optional>
          <select value={v.purpose} onChange={(e) => set('purpose', e.target.value)} className={INPUT_CLS}>
            <option value="">선택 안 함</option>
            {PURPOSE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="현재 수준/경력" optional>
          <select value={v.experienceLevel} onChange={(e) => set('experienceLevel', e.target.value)} className={INPUT_CLS}>
            <option value="">선택 안 함</option>
            {EXPERIENCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
      </Group>

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {done && <p className="text-sm text-accent">저장되었습니다.</p>}
      <button type="submit" disabled={busy}
        className="w-full rounded-md bg-accent px-3 py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-90 disabled:opacity-50">
        {busy ? '저장 중…' : '프로필 저장'}
      </button>
    </form>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-bg-elevated p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{title}</h3>
        {hint && <span className="text-[11px] text-fg-faint">{hint}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-sm text-fg-muted">
        {label}
        {optional && <span className="text-[11px] text-fg-faint">선택</span>}
      </label>
      {children}
    </div>
  );
}
