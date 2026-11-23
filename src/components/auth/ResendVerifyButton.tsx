'use client';

import { useEffect, useRef, useState } from 'react';
import { useLanguage, type Language } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { verifyStrings } from '@/lib/strings/verify';
import { showToast } from '@/lib/toast';

type Status = 'idle' | 'sending' | 'sent' | 'limited' | 'failed';

// 보낸 직후 같은 버튼을 다시 누를 수 없게 막는 시간. 서버 레이트리밋(10분 3회)에 닿기 전에
// 클라이언트에서 먼저 연타를 걸러 낸다 — 메일은 몇 초~몇 십 초 늦게 오는 일이 흔해 사용자가 재촉하게 된다.
const RESEND_COOLDOWN_MS = 60_000;
// 발송 결과 알림(토스트)을 띄워 두는 시간.
const RESULT_TOAST_MS = 6000;

interface ResendVerifyButtonProps {
  /** 서버가 언어를 정한 화면(후기 작성)은 그 값을 넘긴다. 없으면 클라이언트 언어. */
  lang?: Language;
  className?: string;
}

// 미인증 계정에 "인증 메일 다시 보내기"를 제공한다. 이 버튼을 보일지(미인증인지)는 호출부가
// 서버 값(마이페이지 SSR의 email_verified, 후기 API 의 403 email_unverified)으로 정한다.
export function ResendVerifyButton({ lang: langProp, className }: ResendVerifyButtonProps) {
  const clientLang = useLanguage();
  const lang = langProp ?? clientLang;
  const s = pick(verifyStrings, lang);
  const [status, setStatus] = useState<Status>('idle');
  const [coolingDown, setCoolingDown] = useState(false);
  // 상태 갱신이 그려지기 전의 빠른 두 번째 클릭까지 막으려고 ref 로도 잠근다.
  const inFlight = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
  }, []);

  async function resend() {
    if (inFlight.current || coolingDown) return;
    inFlight.current = true;
    setStatus('sending');
    try {
      const res = await fetch('/api/auth/resend-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      });
      if (res.ok) {
        setStatus('sent');
        showToast({ message: s.resendSent, durationMs: RESULT_TOAST_MS });
        setCoolingDown(true);
        cooldownTimer.current = setTimeout(() => setCoolingDown(false), RESEND_COOLDOWN_MS);
      } else {
        setStatus(res.status === 429 ? 'limited' : 'failed');
        showToast({ message: res.status === 429 ? s.resendRateLimited : s.resendFailed, tone: 'error', durationMs: RESULT_TOAST_MS });
      }
    } catch {
      setStatus('failed');
      showToast({ message: s.resendFailed, tone: 'error', durationMs: RESULT_TOAST_MS });
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={resend}
        disabled={status === 'sending' || coolingDown}
        className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-fg/5 disabled:opacity-50"
      >
        {status === 'sending' ? s.resendSending : s.resendVerify}
      </button>
    </div>
  );
}
