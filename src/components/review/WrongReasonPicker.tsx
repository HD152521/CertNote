'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { WrongReason } from '@/lib/review/types';

const REASONS: { code: WrongReason; label: string }[] = [
  { code: 'concept', label: '개념 부족' },
  { code: 'mistake', label: '실수' },
  { code: 'forgot', label: '기억 안 남' },
];

// 오답 직후 "왜 틀렸나요?" 3버튼. 채점과 분리된 경량 기록(POST /api/review/reason).
// 낙관적 UI — 저장 실패해도 복습 흐름을 막지 않는다.
export function WrongReasonPicker({ questionId }: { questionId: string }) {
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
      <p className="mb-1.5 text-xs text-fg-muted">왜 틀렸나요? <span className="text-fg-faint">(약점 분석에 반영)</span></p>
      <div className="flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
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
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
