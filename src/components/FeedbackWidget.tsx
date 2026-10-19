'use client';

import { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquarePlus, X } from 'lucide-react';
import { useLanguage, t } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { shellStrings } from '@/lib/strings/shell';
import { cn } from '@/lib/cn';
import { useOverlapsAd } from '@/lib/ads/useOverlapsAd';
import { hidesFeedbackButton } from '@/lib/feedbackVisibility';

// 플로팅 피드백 위젯: 연락처 + 글을 받고, 보상으로 커피 기프티콘을 안내한다.
// 보상은 관리자가 피드백을 보고 수동 발송(이 위젯은 수집만).
export function FeedbackWidget() {
  const lang = useLanguage();
  const s = pick(shellStrings, lang);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 고정 버튼이 광고 위나 바로 옆에 놓이는 동안은 감춘다(애드센스 오클릭 정책 —
  // docs/P3-adsense-readiness-plan.md Step 10). invisible 은 자리를 유지해 광고가 지나가면 같은 자리에
  // 다시 나타난다. 이미 열린 패널은 사용자가 연 것이므로 건드리지 않는다. 화면에 광고가 없으면 항상 false.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const overlapsAd = useOverlapsAd(() => {
    const button = buttonRef.current;
    return button ? [button.getBoundingClientRect()] : [];
  });
  // 모의고사·복습 세션에서는 그리지 않는다(풀이 버튼과 겹침 — feedbackVisibility 주석). 훅 호출 순서를
  // 지키려고 모든 훅 뒤에서 판정한다. 버튼이 없으면 buttonRef 가 비어 useOverlapsAd 도 빈 목록을 본다.
  const pathname = usePathname();

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? s.feedbackSendFailed);
        return;
      }
      setDone(true);
    } catch {
      setError(s.networkError);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    // 닫을 때 완료 상태/입력 초기화(다음에 새로).
    if (done) { setDone(false); setPhone(''); setMessage(''); }
  }

  if (hidesFeedbackButton(pathname)) return null;

  return (
    <>
      {!open && (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={s.feedbackOpen}
          className={cn(
            'fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-lg transition hover:opacity-90',
            overlapsAd && 'invisible pointer-events-none',
          )}
        >
          <MessageSquarePlus className="h-4 w-4" /> {s.feedbackButton}
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-[min(92vw,22rem)] rounded-xl border border-border bg-bg-elevated p-4 shadow-xl">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg">{s.feedbackTitle}</h2>
            <button type="button" onClick={close} aria-label={t(lang, 'close')} className="text-fg-faint hover:text-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          {done ? (
            <div className="space-y-2 py-2 text-sm">
              <p className="text-fg">{s.feedbackThanks}</p>
              <p className="text-fg-muted">{s.feedbackThanksBody}</p>
              <button type="button" onClick={close} className="mt-1 rounded-md border border-border-strong px-3 py-1.5 text-sm hover:bg-fg/5">{t(lang, 'close')}</button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-fg-muted">{s.feedbackIntro}</p>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={s.feedbackPhonePlaceholder}
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-border-strong"
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder={s.feedbackMessagePlaceholder}
                className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-border-strong"
              />
              {error && <p className="text-xs text-danger" role="alert">{error}</p>}
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? s.feedbackSubmitting : s.feedbackSubmit}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
