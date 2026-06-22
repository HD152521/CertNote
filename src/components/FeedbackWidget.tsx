'use client';

import { useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';

// 플로팅 피드백 위젯: 연락처 + 글을 받고, 보상으로 커피 기프티콘을 안내한다.
// 보상은 관리자가 피드백을 보고 수동 발송(이 위젯은 수집만).
export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError(data.message ?? '전송에 실패했어요.');
        return;
      }
      setDone(true);
    } catch {
      setError('네트워크 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    // 닫을 때 완료 상태/입력 초기화(다음에 새로).
    if (done) { setDone(false); setPhone(''); setMessage(''); }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="피드백 보내기"
          className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-lg transition hover:opacity-90"
        >
          <MessageSquarePlus className="h-4 w-4" /> 피드백 ☕
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-[min(92vw,22rem)] rounded-xl border border-border bg-bg-elevated p-4 shadow-xl">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg">피드백 주시면 커피 기프티콘 ☕</h2>
            <button type="button" onClick={close} aria-label="닫기" className="text-fg-faint hover:text-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          {done ? (
            <div className="space-y-2 py-2 text-sm">
              <p className="text-fg">감사합니다! 🙏</p>
              <p className="text-fg-muted">검토 후 입력하신 연락처로 커피 기프티콘을 보내드릴게요.</p>
              <button type="button" onClick={close} className="mt-1 rounded-md border border-border-strong px-3 py-1.5 text-sm hover:bg-fg/5">닫기</button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-fg-muted">서비스에 바라는 점·불편한 점을 남겨주세요. 연락처로 기프티콘을 보내드립니다.</p>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="연락처 (예: 010-1234-5678)"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-border-strong"
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="피드백 내용 (5자 이상)"
                className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-border-strong"
              />
              {error && <p className="text-xs text-danger" role="alert">{error}</p>}
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? '보내는 중…' : '보내기'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
