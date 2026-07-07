'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { QuizQuestion } from '@/lib/parseQuiz';
import { answerCount, isMultiAnswer, parseCorrectSet } from '@/lib/quiz/correctness';
import { TutorPanel } from '@/components/tutor/TutorPanel';
import { cn } from '@/lib/cn';

interface QuizProps {
  question: QuizQuestion;
  questionId?: string;
  lang?: 'ko' | 'en';
}

// 영어 콘텐츠 페이지에서 쓰는 최소 이중언어 라벨(전면 i18n 전 단계).
const LABELS = {
  ko: { question: '문제', pickN: (n: number) => `정답 ${n}개 선택`, check: '정답 확인', correct: '✓ 정답!', answer: '✗ 정답', retry: '다시 풀기' },
  en: { question: 'Question', pickN: (n: number) => `Select ${n} answers`, check: 'Check answer', correct: '✓ Correct!', answer: '✗ Answer', retry: 'Try again' },
} as const;

// 로그인 사용자면 서버에 풀이를 기록(실패·비로그인은 무시 — fire-and-forget).
function recordAttempt(questionId: string, selected: string): void {
  fetch('/api/quiz/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, selected }),
  }).catch(() => {});
}

export function Quiz({ question, questionId, lang = 'ko' }: QuizProps) {
  const t = LABELS[lang];
  const correctSet = parseCorrectSet(question.answer);
  const multi = isMultiAnswer(question.answer);
  const needed = answerCount(question.answer);
  const [picked, setPicked] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = submitted && picked.length === correctSet.size && picked.every((p) => correctSet.has(p));

  function toggle(label: string) {
    if (submitted) return;
    if (!multi) {
      // 단일 정답: 즉시 채점(기존 UX 유지).
      setPicked([label]);
      setSubmitted(true);
      if (questionId) recordAttempt(questionId, label);
      return;
    }
    setPicked((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));
  }

  function submitMulti() {
    if (submitted || picked.length === 0) return;
    setSubmitted(true);
    if (questionId) recordAttempt(questionId, [...picked].sort().join(','));
  }

  function reset() {
    setPicked([]);
    setSubmitted(false);
  }

  return (
    <div className="my-5 rounded-lg border border-border bg-bg-elevated p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">{t.question} {question.number}</p>
        {multi && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">{t.pickN(needed)}</span>}
      </div>
      <p className="font-medium leading-relaxed mb-4 text-fg">{question.text}</p>
      <ul className="space-y-2">
        {question.choices.map((c) => {
          const isPicked = picked.includes(c.label);
          const isCorrectChoice = correctSet.has(c.label);
          const revealed = submitted && isCorrectChoice;
          const isWrong = submitted && isPicked && !isCorrectChoice;
          return (
            <li key={c.label}>
              <button type="button" onClick={() => toggle(c.label)} disabled={submitted} aria-pressed={isPicked}
                className={cn(
                  'flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition',
                  !submitted && (isPicked ? 'border-accent bg-accent/10' : 'border-border hover:border-border-strong cursor-pointer'),
                  submitted && !revealed && !isWrong && 'border-border opacity-50',
                  revealed && 'border-success/40 bg-success/5',
                  isWrong && 'border-danger/40 bg-danger/5',
                )}
              >
                <span className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[10px]',
                  multi ? 'rounded' : 'rounded-full',
                  revealed && 'bg-success text-white',
                  isWrong && 'bg-danger text-white',
                  !submitted && (isPicked ? 'bg-accent text-white' : 'border border-border-strong text-fg-muted'),
                  submitted && !revealed && !isWrong && 'border border-border text-fg-faint',
                )}>
                  {revealed ? <Check className="h-3 w-3" /> : isWrong ? <X className="h-3 w-3" /> : c.label}
                </span>
                <span className="text-sm flex-1 leading-relaxed text-fg">{c.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {multi && !submitted && (
        <button type="button" onClick={submitMulti} disabled={picked.length === 0}
          className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40">
          {t.check}
        </button>
      )}
      {submitted && (
        <div className={cn('mt-4 rounded-md border p-3 text-sm', isCorrect ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5')}>
          <p className="font-medium mb-1.5 text-fg">{isCorrect ? t.correct : `${t.answer}: ${question.answer}`}</p>
          {question.explanation && (<p className="text-fg-muted whitespace-pre-wrap leading-relaxed">{question.explanation}</p>)}
          {!isCorrect && questionId && (
            <TutorPanel questionId={questionId} selected={multi ? [...picked].sort().join(',') : (picked[0] ?? '')} />
          )}
          <button type="button" onClick={reset} className="mt-2 block text-xs text-fg-muted hover:text-fg underline underline-offset-4">{t.retry}</button>
        </div>
      )}
    </div>
  );
}
