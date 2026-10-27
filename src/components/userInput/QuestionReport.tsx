'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { REPORT_MESSAGE_MAX, REPORT_REASONS, type ReportReason } from '@/lib/userInput/validate';
import { cn } from '@/lib/cn';

const LABELS = {
  ko: {
    open: '문제 오류 신고',
    reasons: { answer: '정답이 틀렸어요', explanation: '해설이 틀렸어요', outdated: '최신 내용과 달라요', typo: '오타·표현', other: '기타' },
    placeholder: '어떤 부분이 틀렸는지 적어 주시면 고치는 데 도움이 됩니다. (선택)',
    placeholderOther: '어떤 부분이 틀렸는지 적어 주세요.',
    submit: '보내기',
    cancel: '취소',
    done: '고마워요. 확인하고 고칠게요.',
    failed: '보내지 못했어요. 잠시 후 다시 시도해 주세요.',
  },
  en: {
    open: 'Report an error',
    reasons: { answer: 'Wrong answer', explanation: 'Wrong explanation', outdated: 'Out of date', typo: 'Typo or wording', other: 'Other' },
    placeholder: 'Tell us what looks wrong (optional).',
    placeholderOther: 'Tell us what looks wrong.',
    submit: 'Send',
    cancel: 'Cancel',
    done: 'Thanks. We will check and fix it.',
    failed: 'Could not send. Please try again later.',
  },
} as const;

type Phase = 'closed' | 'open' | 'sending' | 'done';

// 문제 하나의 오류 신고. 접힌 상태에서는 작은 링크 하나만 보인다 — 신고가 0건이어도 화면이 비어 보이지 않게.
export function QuestionReport({ questionId, lang = 'ko' }: { questionId: string; lang?: 'ko' | 'en' }) {
  const t = LABELS[lang];
  const [phase, setPhase] = useState<Phase>('closed');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const needsMessage = reason === 'other' && message.trim().length === 0;

  async function send() {
    if (!reason || needsMessage) return;
    setPhase('sending');
    setError(null);
    try {
      const res = await fetch('/api/question-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, reason, message }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        // 서버 문구는 한국어라 영어 페이지에선 일반 문구를 쓴다.
        setError(lang === 'ko' && typeof data?.message === 'string' ? data.message : t.failed);
        setPhase('open');
        return;
      }
      setPhase('done');
    } catch {
      setError(t.failed);
      setPhase('open');
    }
  }

  if (phase === 'done') return <p className="mt-2 text-xs text-fg-muted">{t.done}</p>;

  if (phase === 'closed') {
    return (
      <button type="button" onClick={() => setPhase('open')}
        className="mt-2 inline-flex items-center gap-1 text-xs text-fg-faint underline-offset-4 hover:text-fg hover:underline">
        <Flag className="h-3 w-3" /> {t.open}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-md border border-border bg-bg p-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t.open}>
        {REPORT_REASONS.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)}
            className={cn('rounded-full border px-2.5 py-1 text-xs transition',
              reason === r ? 'border-accent bg-accent/10 text-fg' : 'border-border text-fg-muted hover:border-border-strong')}>
            {t.reasons[r]}
          </button>
        ))}
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={REPORT_MESSAGE_MAX} rows={2}
        placeholder={reason === 'other' ? t.placeholderOther : t.placeholder}
        className="w-full rounded-md border border-border bg-bg-elevated px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none" />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={send} disabled={!reason || needsMessage || phase === 'sending'}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40">
          {t.submit}
        </button>
        <button type="button" onClick={() => setPhase('closed')} className="px-2 text-xs text-fg-muted hover:text-fg">
          {t.cancel}
        </button>
      </div>
    </div>
  );
}
