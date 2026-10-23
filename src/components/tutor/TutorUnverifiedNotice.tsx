'use client';

import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useLanguage } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { shellStrings } from '@/lib/strings/shell';

type ResendState = 'idle' | 'sending' | 'sent' | 'later' | 'failed';

// 이메일 미인증 계정에게 AI 설명 대신 보여주는 안내. 인증 메일 재발송은 기존 엔드포인트(/api/auth/resend-verify)를 쓴다.
interface TutorUnverifiedNoticeProps {
  onRetry: () => void; // 다른 탭에서 인증을 마친 사용자가 같은 튜터 요청을 다시 보낸다(새 엔드포인트 없음).
  checking: boolean; // 재요청 진행 중
  stillUnverified: boolean; // 재요청이 또 email_unverified 로 거절됨
  retryError?: string | null; // 재요청이 인증 외 사유(429·502·503·네트워크)로 실패함 — 안내가 사라지지 않고 이유를 보여준다.
}

export function TutorUnverifiedNotice({ onRetry, checking, stillUnverified, retryError }: TutorUnverifiedNoticeProps) {
  const s = pick(shellStrings, useLanguage());
  const [state, setState] = useState<ResendState>('idle');

  async function resend() {
    setState('sending');
    try {
      const res = await fetch('/api/auth/resend-verify', { method: 'POST' });
      setState(res.ok ? 'sent' : res.status === 429 ? 'later' : 'failed');
    } catch {
      setState('failed');
    }
  }

  const feedback = { sent: s.tutorResendSent, later: s.tutorResendLater, failed: s.tutorResendFailed } as const;

  return (
    <div className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-4 text-sm" data-testid="tutor-unverified">
      <p className="flex items-center gap-1.5 font-medium text-fg"><MailCheck className="h-4 w-4 text-accent" />
        {s.tutorUnverifiedTitle}
      </p>
      <p className="mt-1 text-fg-muted">{s.tutorUnverifiedBody}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={resend}
          disabled={state === 'sending' || state === 'sent'}
          className="inline-block rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
        >
          {state === 'sending' ? s.tutorResending : s.tutorResend}
        </button>
        <button
          type="button"
          onClick={onRetry}
          disabled={checking}
          className="inline-block rounded-md border border-accent/40 px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/10 disabled:opacity-50"
        >
          {checking ? s.tutorThinking : s.tutorVerifiedRetry}
        </button>
        {(state === 'sent' || state === 'later' || state === 'failed') && (
          <p className="text-sm text-fg-muted" role="status">{feedback[state]}</p>
        )}
      </div>
      {stillUnverified && !checking && <p className="mt-2 text-sm text-red-500" role="alert">{s.tutorStillUnverified}</p>}
      {retryError && !stillUnverified && !checking && <p className="mt-2 text-sm text-red-500" role="alert">{retryError}</p>}
    </div>
  );
}
