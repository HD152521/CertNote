'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CertOption } from '@/components/AuthForm';
import { Select } from '@/components/ui/Select';
import { OCCUPATION_OPTIONS, PURPOSE_OPTIONS, EXPERIENCE_OPTIONS } from '@/lib/profileOptions';
import { useLanguage, t } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { accountStrings } from '@/lib/strings/account';

const optional = (opts: readonly string[], noneLabel: string) => [
  { value: '', label: noneLabel },
  ...opts.map((o) => ({ value: o, label: o })),
];

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
  const lang = useLanguage();
  const s = pick(accountStrings, lang);
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
        setError(data.message ?? s.saveFailed);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError(t(lang, 'networkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Group title={s.personalInfo}>
        <Field label={t(lang, 'name')}>
          <input type="text" required value={v.name} onChange={(e) => set('name', e.target.value)} className={INPUT_CLS} />
        </Field>
        <Field label={t(lang, 'birthdate')}>
          <input type="date" required value={v.birthdate} onChange={(e) => set('birthdate', e.target.value)} className={INPUT_CLS} />
        </Field>
      </Group>

      <Group title={s.studyInfo} hint={s.studyInfoHint}>
        <Field label={t(lang, 'targetCert')}>
          <Select
            value={v.targetCert}
            onChange={(val) => set('targetCert', val)}
            options={certs.map((c) => ({ value: c.slug, label: `${c.code} · ${c.name}` }))}
            placeholder={t(lang, 'selectOne')}
            ariaLabel={t(lang, 'targetCert')}
          />
        </Field>
        <Field label={t(lang, 'occupation')} optionalLabel={s.optionalTag}>
          <Select value={v.occupation} onChange={(val) => set('occupation', val)} options={optional(OCCUPATION_OPTIONS, t(lang, 'doNotSelect'))} placeholder={t(lang, 'doNotSelect')} ariaLabel={t(lang, 'occupation')} />
        </Field>
        <Field label={t(lang, 'purpose')} optionalLabel={s.optionalTag}>
          <Select value={v.purpose} onChange={(val) => set('purpose', val)} options={optional(PURPOSE_OPTIONS, t(lang, 'doNotSelect'))} placeholder={t(lang, 'doNotSelect')} ariaLabel={t(lang, 'purpose')} />
        </Field>
        <Field label={t(lang, 'experienceLevel')} optionalLabel={s.optionalTag}>
          <Select value={v.experienceLevel} onChange={(val) => set('experienceLevel', val)} options={optional(EXPERIENCE_OPTIONS, t(lang, 'doNotSelect'))} placeholder={t(lang, 'doNotSelect')} ariaLabel={t(lang, 'experienceLevel')} />
        </Field>
      </Group>

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {done && <p className="text-sm text-accent">{s.profileSaved}</p>}
      <button type="submit" disabled={busy}
        className="w-full rounded-md bg-accent px-3 py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-90 disabled:opacity-50">
        {busy ? t(lang, 'saving') : s.saveProfile}
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

// optionalLabel이 있으면 '선택' 배지를 붙인다 — 배지 문구가 언어별로 달라 boolean 대신 문자열을 받는다.
function Field({ label, optionalLabel, children }: { label: string; optionalLabel?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-sm text-fg-muted">
        {label}
        {optionalLabel && <span className="text-[11px] text-fg-faint">{optionalLabel}</span>}
      </label>
      {children}
    </div>
  );
}
