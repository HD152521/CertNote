'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { WrongReason } from '@/lib/review/types';
import { useLanguage } from '@/lib/i18n-client';
import { pick as pickStrings } from '@/lib/strings/dict';
import { chromeStrings } from '@/lib/strings/chrome';

const REASON_KEYS: { code: WrongReason; key: 'reasonConcept' | 'reasonMistake' | 'reasonForgot' }[] = [
  { code: 'concept', key: 'reasonConcept' },
  { code: 'mistake', key: 'reasonMistake' },
  { code: 'forgot', key: 'reasonForgot' },
];

// 오답 직후 "왜 틀렸나요?" 3버튼. 채점과 분리된 경량 기록(POST /api/review/reason).
// 낙관적 UI — 저장 실패해도 복습 흐름을 막지 않는다.
export function WrongReasonPicker({ questionId }: { questionId: string }) {
  const s = pickStrings(chromeStrings, useLanguage());
  const [picked, setPicked] = useState<WrongReason | null>(null);

  async function pick(code: WrongReason) {
    if (picked) return;
    setPicked(code);
    try {
      await fetch('/api/review/reason', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, reason: code }),
      });
    } catch {
      // 기록 실패는 조용히 무시(복습 UX 우선).
    }
  }

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="mb-1.5 text-xs text-fg-muted">{s.reasonPrompt} <span className="text-fg-faint">{s.reasonPromptHint}</span></p>
      <div className="flex flex-wrap gap-1.5">
        {REASON_KEYS.map((r) => (
          <button
            key={r.code}
            type="button"
            onClick={() => pick(r.code)}
            disabled={picked !== null}
            aria-pressed={picked === r.code}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition',
              picked === r.code
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-fg-muted hover:border-border-strong disabled:opacity-40',
            )}
          >
            {s[r.key]}
          </button>
        ))}
      </div>
    </div>
  );
}
