'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import type { Language } from '@/lib/i18n-client';

interface CertOption {
  slug: string;
  code: string;
  name: string;
}

interface ReviewFormProps {
  section: string;
  certs: CertOption[];
  lang: Language;
  /** 자격증별 페이지에선 cert를 고정한다. */
  lockedCert?: string;
}

const BODY_MAX = 2000;

export default function ReviewForm({ section, certs, lang, lockedCert }: ReviewFormProps) {
  const router = useRouter();
  const en = lang === 'en';
  const [cert, setCert] = useState(lockedCert ?? certs[0]?.slug ?? '');
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [passed, setPassed] = useState<'yes' | 'no' | ''>('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (rating < 1) {
      setError(en ? 'Please select a star rating.' : '별점을 선택해 주세요.');
      return;
    }
    if (body.trim().length < 10) {
      setError(en ? 'Please write at least 10 characters.' : '후기 내용을 10자 이상 작성해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section,
          certSlug: cert,
          rating,
          passed: passed === '' ? null : passed === 'yes',
          title: title.trim() || null,
          body: body.trim(),
        }),
      });
      if (res.ok) {
        setDone(true);
        setRating(0);
        setPassed('');
        setTitle('');
        setBody('');
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        setError(en ? 'Please log in to write a review.' : '후기를 작성하려면 로그인이 필요합니다.');
      } else {
        setError(data?.message ?? (en ? 'Failed to submit. Please try again.' : '작성에 실패했어요. 다시 시도해 주세요.'));
      }
    } catch {
      setError(en ? 'Network error. Please try again.' : '네트워크 오류가 발생했어요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-bg-elevated p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-fg">{en ? 'Write a review' : '합격 후기 작성'}</h3>

      {!lockedCert && certs.length > 1 && (
        <label className="block space-y-1">
          <span className="text-xs text-fg-faint">{en ? 'Certification' : '자격증'}</span>
          <Select
            value={cert}
            onChange={setCert}
            options={certs.map((c) => ({ value: c.slug, label: `${c.code} · ${c.name}` }))}
          />
        </label>
      )}

      <div className="space-y-1">
        <span className="text-xs text-fg-faint">{en ? 'Rating' : '별점'}</span>
        <div className="flex items-center gap-1" role="radiogroup" aria-label={en ? 'Rating' : '별점'}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-0.5"
            >
              <Star className={n <= (hover || rating) ? 'h-6 w-6 fill-accent text-accent' : 'h-6 w-6 text-border-strong'} />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-xs text-fg-faint">{en ? 'Result (optional)' : '합격 여부 (선택)'}</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label={en ? 'Result' : '합격 여부'}>
          {([
            { v: 'yes', label: en ? 'Passed' : '합격' },
            { v: 'no', label: en ? 'Did not pass' : '불합격' },
            { v: '', label: en ? 'Not specified' : '선택 안 함' },
          ] as const).map((opt) => (
            <button
              key={opt.v}
              type="button"
              aria-pressed={passed === opt.v}
              onClick={() => setPassed(opt.v)}
              className={
                passed === opt.v
                  ? 'rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition'
                  : 'rounded-md border border-border px-3 py-1.5 text-sm text-fg-muted transition hover:border-border-strong'
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-fg-faint">{en ? 'Title (optional)' : '제목 (선택)'}</span>
        <input
          type="text"
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg outline-none transition focus:border-border-strong"
          placeholder={en ? 'e.g. Passed on my first try!' : '예: 한 번에 합격했어요!'}
        />
      </label>

      <label className="block space-y-1">
        <span className="flex items-center justify-between text-xs text-fg-faint">
          <span>{en ? 'Your review' : '후기 내용'}</span>
          <span className="tabular-nums">{body.length}/{BODY_MAX}</span>
        </span>
        <textarea
          value={body}
          maxLength={BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          className="w-full resize-y rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm leading-relaxed text-fg outline-none transition focus:border-border-strong"
          placeholder={en ? 'Share how you studied and what helped you pass.' : '어떻게 공부했는지, 무엇이 합격에 도움이 됐는지 공유해 주세요.'}
        />
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {done && <p className="text-sm text-accent">{en ? 'Thanks! Your review has been posted.' : '후기가 등록되었어요. 감사합니다!'}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {submitting ? (en ? 'Submitting…' : '등록 중…') : en ? 'Post review' : '후기 등록'}
      </button>
    </form>
  );
}
