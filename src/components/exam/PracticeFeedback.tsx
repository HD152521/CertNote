'use client';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { InlineMd } from '@/components/InlineMd';

export interface CheckResult {
  correct: boolean;
  answer: string;
  explanation: string;
}

// 연습 모드에서 "정답 확인" 뒤 보기 아래에 붙는 판정과 해설.
export function PracticeFeedback({ result, lang }: { result: CheckResult; lang: string }) {
  const en = lang === 'en';
  return (
    <div role="status" className={cn('mt-3 rounded-md border p-3', result.correct ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5')}>
      <p className={cn('flex items-center gap-1.5 text-sm font-medium', result.correct ? 'text-success' : 'text-danger')}>
        {result.correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        {result.correct ? (en ? 'Correct' : '정답') : (en ? `Wrong — answer ${result.answer}` : `오답 — 정답 ${result.answer}`)}
      </p>
      {result.explanation && (
        <p className="mt-1.5 text-xs leading-relaxed text-fg-muted whitespace-pre-wrap"><InlineMd text={result.explanation} /></p>
      )}
    </div>
  );
}
