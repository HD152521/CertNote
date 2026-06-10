'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { parseCorrectSet } from '@/lib/quiz/correctness';
import { cn } from '@/lib/cn';

interface Card {
  questionId: string;
  box: number;
  number: number;
  prompt: string;
  choices: { label: string; text: string }[];
  answer: string;
  explanation: string;
  slug: string;
  week: number;
  day: number;
}

interface ReviewResult {
  correct: boolean;
  mastered: boolean;
  dueAt: string;
}

function formatDue(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return '오늘';
  if (days === 1) return '내일';
  return `${days}일 뒤`;
}

export function ReviewSession() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/review/due', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (active) setCards(d.items ?? []); })
      .catch(() => { if (active) setError('복습 목록을 불러오지 못했습니다.'); });
    return () => { active = false; };
  }, []);

  const current = cards?.[idx];

  async function pick(label: string) {
    if (picked || !current || submitting) return;
    setPicked(label);
    setSubmitting(true);
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: current.questionId, selected: label }),
      });
      if (!res.ok) throw new Error();
      setResult((await res.json()) as ReviewResult);
    } catch {
      setError('채점에 실패했습니다. 다시 시도해 주세요.');
      setPicked(null);
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setPicked(null);
    setResult(null);
    setError(null);
    setIdx((i) => i + 1);
  }

  if (error && !cards) return <p className="text-sm text-danger">{error}</p>;
  if (!cards) return <p className="text-sm text-fg-muted">불러오는 중…</p>;

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-elevated p-8 text-center">
        <p className="text-2xl mb-2">🎉</p>
        <p className="font-medium text-fg mb-1">지금 복습할 문제가 없어요</p>
        <p className="text-sm text-fg-muted mb-4">연습 문제를 틀리면 이곳에 자동으로 쌓입니다.</p>
        <Link href="/" className="text-sm text-accent underline underline-offset-4">학습으로 돌아가기</Link>
      </div>
    );
  }

  if (idx >= cards.length) {
    return (
      <div className="rounded-lg border border-success/40 bg-success/5 p-8 text-center">
        <p className="text-2xl mb-2">✅</p>
        <p className="font-medium text-fg mb-1">오늘 복습 완료! ({cards.length}문제)</p>
        <p className="text-sm text-fg-muted mb-4">맞힌 문제는 다음 복습일이 미뤄지고, 틀린 문제는 곧 다시 나옵니다.</p>
        <div className="flex justify-center gap-3">
          <Link href="/notebook" className="text-sm text-accent underline underline-offset-4">오답노트 보기</Link>
          <Link href="/" className="text-sm text-fg-muted underline underline-offset-4">학습으로</Link>
        </div>
      </div>
    );
  }

  const correctSet = parseCorrectSet(current!.answer);
  const isAnswered = result !== null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs text-fg-muted font-mono">
        <span>{idx + 1} / {cards.length}</span>
        <span className="uppercase tracking-wider">{current!.slug} · W{current!.week} D{current!.day}</span>
      </div>
      <div className="rounded-lg border border-border bg-bg-elevated p-4 sm:p-5">
        <p className="font-medium leading-relaxed mb-4 text-fg whitespace-pre-wrap">{current!.prompt}</p>
        <ul className="space-y-2">
          {current!.choices.map((c) => {
            const isPicked = picked === c.label;
            const isCorrectChoice = correctSet.has(c.label);
            const isWrong = isAnswered && isPicked && !isCorrectChoice;
            const revealed = isAnswered && isCorrectChoice;
            return (
              <li key={c.label}>
                <button type="button" onClick={() => pick(c.label)} disabled={isAnswered || submitting} aria-pressed={isPicked}
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
                    !isAnswered && 'border border-border-strong text-fg-muted',
                    isAnswered && !revealed && !isWrong && 'border border-border text-fg-faint',
                  )}>
                    {revealed && <Check className="h-3 w-3" />}
                    {isWrong && <X className="h-3 w-3" />}
                    {!isAnswered && c.label}
                    {isAnswered && !revealed && !isWrong && c.label}
                  </span>
                  <span className="text-sm flex-1 leading-relaxed text-fg">{c.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {isAnswered && (
          <div className={cn('mt-4 rounded-md border p-3 text-sm', result!.correct ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5')}>
            <p className="font-medium mb-1.5 text-fg">
              {result!.correct ? '✓ 정답!' : `✗ 정답: ${current!.answer}`}
              {result!.mastered && <span className="ml-2 text-xs text-success">· 마스터 🎓</span>}
            </p>
            {current!.explanation && <p className="text-fg-muted whitespace-pre-wrap leading-relaxed mb-2">{current!.explanation}</p>}
            <p className="text-xs text-fg-faint">다음 복습: {formatDue(result!.dueAt)}</p>
            <button type="button" onClick={next} className="mt-3 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
              {idx + 1 < cards.length ? '다음 문제 →' : '복습 끝내기'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
