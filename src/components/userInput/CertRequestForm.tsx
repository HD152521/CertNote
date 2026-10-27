'use client';

import { useState } from 'react';
import { CERT_CANDIDATES, OTHER_CERT_KEY } from '@/lib/userInput/certCandidates';
import { OTHER_CERT_NAME_MAX, OTHER_CERT_NAME_MIN } from '@/lib/userInput/validate';
import { Select } from '@/components/ui/Select';

const LABELS = {
  ko: {
    title: '찾는 자격증이 없나요?',
    hint: '만들어 줬으면 하는 자격증을 알려 주세요. 요청이 많은 순서로 검토합니다.',
    select: '자격증 선택',
    other: '목록에 없음 (직접 입력)',
    otherPlaceholder: '자격증 이름',
    email: '나오면 알림 받을 이메일 (선택)',
    emailHint: '알림을 보낸 뒤에는 지웁니다. 로그인했다면 비워 둬도 됩니다.',
    submit: '요청하기',
    done: '요청을 받았어요. 고마워요!',
    failed: '보내지 못했어요. 잠시 후 다시 시도해 주세요.',
  },
  en: {
    title: 'Missing a certification?',
    hint: 'Tell us which one you want next. We review requests in order of demand.',
    select: 'Choose a certification',
    other: 'Not listed (type it in)',
    otherPlaceholder: 'Certification name',
    email: 'Email for a launch notice (optional)',
    emailHint: 'Deleted after we send the notice. Leave blank if you are signed in.',
    submit: 'Request',
    done: 'Got it. Thanks!',
    failed: 'Could not send. Please try again later.',
  },
} as const;

const INPUT_CLS = 'w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none';

// 자격증 요청 폼. 집계 숫자는 공개하지 않는다(적은 숫자는 오히려 사이트가 비어 보인다) — 관리자 화면에서만 본다.
export function CertRequestForm({ lang = 'ko' }: { lang?: 'ko' | 'en' }) {
  const t = LABELS[lang];
  const [certKey, setCertKey] = useState('');
  const [otherName, setOtherName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOther = certKey === OTHER_CERT_KEY;
  const otherLen = otherName.trim().length;
  const canSubmit = certKey !== '' && (!isOther || (otherLen >= OTHER_CERT_NAME_MIN && otherLen <= OTHER_CERT_NAME_MAX)) && !sending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/cert-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certKey, otherName: isOther ? otherName : undefined, email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(lang === 'ko' && typeof data?.message === 'string' ? data.message : t.failed);
        return;
      }
      setDone(true);
    } catch {
      setError(t.failed);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-bg-elevated p-4 sm:p-5" aria-labelledby="cert-request-title">
      <div className="space-y-1">
        <h2 id="cert-request-title" className="text-base font-semibold">{t.title}</h2>
        <p className="text-sm text-fg-muted">{t.hint}</p>
      </div>
      {done ? (
        <p className="text-sm text-success">{t.done}</p>
      ) : (
        <form onSubmit={submit} className="space-y-2.5">
          <Select
            value={certKey}
            onChange={setCertKey}
            options={[...CERT_CANDIDATES.map((c) => ({ value: c.key, label: c.label })), { value: OTHER_CERT_KEY, label: t.other }]}
            placeholder={t.select}
            ariaLabel={t.select}
          />
          {isOther && (
            <input type="text" value={otherName} onChange={(e) => setOtherName(e.target.value)} maxLength={OTHER_CERT_NAME_MAX}
              placeholder={t.otherPlaceholder} aria-label={t.otherPlaceholder} className={INPUT_CLS} />
          )}
          <div className="space-y-1">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
              placeholder={t.email} aria-label={t.email} className={INPUT_CLS} />
            <p className="text-xs text-fg-faint">{t.emailHint}</p>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button type="submit" disabled={!canSubmit}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40">
            {t.submit}
          </button>
        </form>
      )}
    </section>
  );
}
