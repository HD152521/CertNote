'use client';

import { useState } from 'react';
import { OTHER_CERT_KEY, certCandidatesFor } from '@/lib/userInput/certCandidates';
import { OTHER_CERT_NAME_MAX, OTHER_CERT_NAME_MIN } from '@/lib/userInput/validate';
import { Select } from '@/components/ui/Select';

const LABELS = {
  ko: {
    title: '찾는 자격증이 없나요?',
    hint: '만들어 줬으면 하는 자격증을 알려 주세요. 요청이 많은 순서로 검토합니다.',
    select: '자격증 선택',
    other: '목록에 없음 (직접 입력)',
    otherPlaceholder: '자격증 이름',
    notice: '로그인한 상태로 요청하면, 노트가 나왔을 때 계정 이메일로 한 번 알려 드려요.',
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
    notice: 'Request while signed in and we will email your account once when the notes are out.',
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
        body: JSON.stringify({ certKey, otherName: isOther ? otherName : undefined }),
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
            options={[...certCandidatesFor(lang).map((c) => ({ value: c.key, label: c.label })), { value: OTHER_CERT_KEY, label: t.other }]}
            placeholder={t.select}
            ariaLabel={t.select}
          />
          {isOther && (
            <input type="text" value={otherName} onChange={(e) => setOtherName(e.target.value)} maxLength={OTHER_CERT_NAME_MAX}
              placeholder={t.otherPlaceholder} aria-label={t.otherPlaceholder} className={INPUT_CLS} />
          )}
          <p className="text-xs text-fg-faint">{t.notice}</p>
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
