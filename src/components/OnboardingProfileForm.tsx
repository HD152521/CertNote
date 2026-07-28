'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { track } from '@/lib/analytics';
import { EXPERIENCE_OPTIONS, OCCUPATION_OPTIONS, PURPOSE_OPTIONS } from '@/lib/profileOptions';
import type { CertOption } from '@/components/AuthForm';
import { Select } from '@/components/ui/Select';
import { useLanguage, t } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { accountStrings } from '@/lib/strings/account';

const obOptional = (opts: readonly string[], noneLabel: string) => [
  { value: '', label: noneLabel },
  ...opts.map((o) => ({ value: o, label: o })),
];

interface OnboardingProfileFormProps {
  certs: CertOption[];
  initialName: string;
}

const INPUT_CLS =
  'w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-border-strong';

// 소셜 가입 직후 1회 표시되는 프로필 보완 폼. 일반 가입 폼과 같은 항목을 수집하되
// 마찰을 줄이기 위해 선택 항목은 접고, '나중에 하기'로 건너뛸 수 있게 한다.
export function OnboardingProfileForm({ certs, initialName }: OnboardingProfileFormProps) {
  const lang = useLanguage();
  const s = pick(accountStrings, lang);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/welcome';
  const dest = next.startsWith('/') && !next.startsWith('//') ? next : '/welcome';

  const [name, setName] = useState(initialName);
  const [birthdate, setBirthdate] = useState('');
  const [targetCert, setTargetCert] = useState('');
  const [occupation, setOccupation] = useState('');
  const [purpose, setPurpose] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [consent, setConsent] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, birthdate, targetCert, occupation, purpose, experienceLevel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        track('onboarding_profile_error', { error_code: data.error ?? `http_${res.status}` });
        setError(data.message ?? s.saveFailedRetry);
        return;
      }
      track('onboarding_profile_completed');
      router.push(dest);
      router.refresh();
    } catch {
      setError(t(lang, 'networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{s.onboardingTitle}</h1>
        <p className="text-sm text-fg-muted">
          {s.onboardingSubtitle}
        </p>
      </header>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="ob-name" className="text-sm text-fg-muted">{t(lang, 'name')}</label>
          <input id="ob-name" required value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLS} />
        </div>
        <div className="space-y-1">
          <label htmlFor="ob-birth" className="text-sm text-fg-muted">{t(lang, 'birthdate')}</label>
          <input id="ob-birth" type="date" required value={birthdate} onChange={(e) => setBirthdate(e.target.value)} className={INPUT_CLS} />
        </div>
        <div className="space-y-1">
          <label htmlFor="ob-cert" className="text-sm text-fg-muted">{t(lang, 'targetCert')}</label>
          <Select id="ob-cert" value={targetCert} onChange={setTargetCert}
            options={certs.map((c) => ({ value: c.slug, label: `${c.code} · ${c.name}` }))}
            placeholder={t(lang, 'selectOne')} ariaLabel={t(lang, 'targetCert')} />
        </div>

        <button type="button" onClick={() => setShowExtra((v) => !v)} className="text-xs text-fg-muted underline underline-offset-4 hover:text-fg">
          {showExtra ? s.hideExtraInfo : s.showExtraInfo}
        </button>
        {showExtra && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="ob-occ" className="text-sm text-fg-muted">{t(lang, 'occupation')}</label>
              <Select id="ob-occ" value={occupation} onChange={setOccupation} options={obOptional(OCCUPATION_OPTIONS, t(lang, 'doNotSelect'))} placeholder={t(lang, 'doNotSelect')} ariaLabel={t(lang, 'occupation')} />
            </div>
            <div className="space-y-1">
              <label htmlFor="ob-pur" className="text-sm text-fg-muted">{t(lang, 'purpose')}</label>
              <Select id="ob-pur" value={purpose} onChange={setPurpose} options={obOptional(PURPOSE_OPTIONS, t(lang, 'doNotSelect'))} placeholder={t(lang, 'doNotSelect')} ariaLabel={t(lang, 'purpose')} />
            </div>
            <div className="space-y-1">
              <label htmlFor="ob-exp" className="text-sm text-fg-muted">{t(lang, 'experienceLevel')}</label>
              <Select id="ob-exp" value={experienceLevel} onChange={setExperienceLevel} options={obOptional(EXPERIENCE_OPTIONS, t(lang, 'doNotSelect'))} placeholder={t(lang, 'doNotSelect')} ariaLabel={t(lang, 'experienceLevel')} />
            </div>
          </div>
        )}

        <label className="flex items-start gap-2 text-xs text-fg-muted">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 shrink-0" />
          <span>
            {t(lang, 'consentText')}{' '}
            <Link href="/privacy" target="_blank" className="text-fg underline underline-offset-2">{t(lang, 'privacyPolicy')}</Link>
          </span>
        </label>

        {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !consent}
          className="w-full rounded-md border border-border-strong px-3 py-2 text-sm font-medium transition hover:bg-fg/5 disabled:opacity-50"
        >
          {submitting ? t(lang, 'saving') : s.saveAndStart}
        </button>
      </form>
      <p className="text-center text-xs text-fg-faint">
        <Link
          href={dest}
          onClick={() => track('onboarding_profile_skipped')}
          className="underline underline-offset-4 hover:text-fg"
        >
          {s.doThisLater}
        </Link>
        {' '}{s.doThisLaterHint}
      </p>
    </div>
  );
}
