'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { QuizQuestion } from '@/lib/parseQuiz';
import { parseCorrectSet } from '@/lib/quiz/correctness';
import { cn } from '@/lib/cn';

interface QuizProps {
  question: QuizQuestion;
  questionId?: string;
}

// 로그인 사용자면 서버에 풀이를 기록(실패·비로그인은 무시 — fire-and-forget).
function recordAttempt(questionId: string, selected: string): void {
  fetch('/api/quiz/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, selected }),
  }).catch(() => {});
}

export function Quiz({ question, questionId }: QuizProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const correctSet = parseCorrectSet(question.answer);
  const isAnswered = picked !== null;
  const isCorrect = picked !== null && correctSet.has(picked);

  function handlePick(label: string) {
    if (isAnswered) return;
    setPicked(label);
    if (questionId) recordAttempt(questionId, label);
  }

  return (
    <div className="my-5 rounded-lg border border-border bg-bg-elevated p-4 sm:p-5">
      <p className="font-mono text-[11px] uppercase tracking-wider text-fg-faint mb-2">문제 {question.number}</p>
      <p className="font-medium leading-relaxed mb-4 text-fg">{question.text}</p>
      <ul className="space-y-2">
        {question.choices.map((c) => {
          const isPicked = picked === c.label;
          const isCorrectChoice = correctSet.has(c.label);
          const showResult = isAnswered;
          const isWrong = showResult && isPicked && !isCorrectChoice;
          const revealed = showResult && isCorrectChoice;
          return (
            <li key={c.label}>
              <button type="button" onClick={() => handlePick(c.label)} disabled={isAnswered} aria-pressed={isPicked}
                className={cn(
                  'flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition',
                  !isAnswered && 'border-border hover:border-border-strong cursor-pointer',
                  isAnswered && !revealed && !isWrong && 'border-border opacity-50',
                  revealed && 'border-success/40 bg-success/5',
                  isWrong && 'border-danger/40 bg-danger/5',
                )}
              >
                <span className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]',
                  revealed && 'bg-success text-white',
                  isWrong && 'bg-danger text-white',
                  !showResult && 'border border-border-strong text-fg-muted',
                  isAnswered && !revealed && !isWrong && 'border border-border text-fg-faint',
                )}>
                  {revealed && <Check className="h-3 w-3" />}
                  {isWrong && <X className="h-3 w-3" />}
                  {!showResult && c.label}
                  {isAnswered && !revealed && !isWrong && c.label}
                </span>
                <span className="text-sm flex-1 leading-relaxed text-fg">{c.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {isAnswered && (
        <div className={cn('mt-4 rounded-md border p-3 text-sm', isCorrect ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5')}>
          <p className="font-medium mb-1.5 text-fg">{isCorrect ? '✓ 정답!' : `✗ 정답: ${question.answer}`}</p>
          {question.explanation && (<p className="text-fg-muted whitespace-pre-wrap leading-relaxed">{question.explanation}</p>)}
          <button type="button" onClick={() => setPicked(null)} className="mt-2 text-xs text-fg-muted hover:text-fg underline underline-offset-4">다시 풀기</button>
        </div>
      )}
    </div>
  );
}
