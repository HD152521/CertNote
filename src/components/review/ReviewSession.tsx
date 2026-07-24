'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { answerCount, isMultiAnswer, parseCorrectSet } from '@/lib/quiz/correctness';
import { TutorPanel } from '@/components/tutor/TutorPanel';
import { WrongReasonPicker } from '@/components/review/WrongReasonPicker';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/lib/i18n-client';
import { fmt, pick } from '@/lib/strings/dict';
import {
  formatDoneTitle,
  formatDue,
  formatPickCount,
  formatWrong,
  reviewStrings,
} from '@/lib/strings/review';

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
  domain?: string;
}

interface ReviewResult {
  correct: boolean;
  mastered: boolean;
  dueAt: string;
}

export function ReviewSession() {
  const lang = useLanguage();
  const s = pick(reviewStrings, lang);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [idx, setIdx] = useState(0);
  // 선택한 보기들(단일·복수 공통으로 배열로 관리).
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weakFirst, setWeakFirst] = useState(false); // 약점(정답률 낮은 영역)부터 정렬

  useEffect(() => {
    let active = true;
    const url = weakFirst ? '/api/review/due?order=weak' : '/api/review/due';
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (active) setCards(d.items ?? []); })
      .catch(() => { if (active) setError(s.loadFailed); });
    return () => { active = false; };
  }, [weakFirst, s.loadFailed]);

  // 정렬 변경: 목록을 새로 불러오며 세션을 처음으로 되돌린다.
  function changeOrder(next: boolean) {
    if (next === weakFirst) return;
    setCards(null);
    setIdx(0);
    setPicked([]);
    setResult(null);
    setError(null);
    setWeakFirst(next);
  }

  const current = cards?.[idx];
  const multi = current ? isMultiAnswer(current.answer) : false;

  // 선택을 정렬·join한 표준 문자열("B" 또는 "B,D")로 서버에 보내 채점한다.
  async function submit(selection: string[]) {
    if (!current || submitting || selection.length === 0) return;
    const selected = [...selection].sort().join(',');
    setSubmitting(true);
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: current.questionId, selected }),
      });
      if (!res.ok) throw new Error();
      setResult((await res.json()) as ReviewResult);
    } catch {
      setError(s.gradeFailed);
      setPicked([]);
    } finally {
      setSubmitting(false);
    }
  }

  // 보기 토글. 단일정답은 클릭 즉시 제출(기존 UX), 복수정답은 토글만 한다.
  function toggle(label: string) {
    if (result || submitting || !current) return;
    if (!multi) {
      setPicked([label]);
      void submit([label]);
      return;
    }
    setPicked((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));
  }

  function next() {
    setPicked([]);
    setResult(null);
    setError(null);
    setIdx((i) => i + 1);
  }

  if (error && !cards) return <p className="text-sm text-danger">{error}</p>;
  if (!cards) return <p className="text-sm text-fg-muted">{s.loading}</p>;

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-elevated p-8 text-center">
        <p className="text-2xl mb-2">🎉</p>
        <p className="font-medium text-fg mb-1">{s.emptyTitle}</p>
        <p className="text-sm text-fg-muted mb-4">{s.emptyBody}</p>
        <Link href="/" className="text-sm text-accent underline underline-offset-4">{s.backToStudy}</Link>
      </div>
    );
  }

  if (idx >= cards.length) {
    return (
      <div className="rounded-lg border border-success/40 bg-success/5 p-8 text-center">
        <p className="text-2xl mb-2">✅</p>
        <p className="font-medium text-fg mb-1">{formatDoneTitle(lang, cards.length)}</p>
        <p className="text-sm text-fg-muted mb-4">{s.doneBody}</p>
        <div className="flex justify-center gap-3">
          <Link href="/notebook" className="text-sm text-accent underline underline-offset-4">{s.viewNotebook}</Link>
          <Link href="/" className="text-sm text-fg-muted underline underline-offset-4">{s.toStudy}</Link>
        </div>
      </div>
    );
  }

  const correctSet = parseCorrectSet(current!.answer);
  const isAnswered = result !== null;

  return (
    <div>
      <div className="mb-3 flex items-center gap-1 text-xs">
        <button type="button" onClick={() => changeOrder(false)}
          className={cn('rounded-md px-2.5 py-1 font-medium transition', !weakFirst ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:text-fg')}>
          {s.orderDefault}
        </button>
        <button type="button" onClick={() => changeOrder(true)}
          className={cn('rounded-md px-2.5 py-1 font-medium transition', weakFirst ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:text-fg')}>
          {s.orderWeakFirst}
        </button>
      </div>
      <div className="mb-3 flex items-center justify-between text-xs text-fg-muted font-mono">
        <span>{idx + 1} / {cards.length}</span>
        <span className="uppercase tracking-wider">{current!.week > 0 ? `${current!.slug} · W${current!.week} D${current!.day}` : `${current!.slug} · ${s.mockExam}${current!.domain ? ` · ${current!.domain}` : ''}`}</span>
      </div>
      <div className="rounded-lg border border-border bg-bg-elevated p-4 sm:p-5">
        {multi && (
          <div className="mb-2">
            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">{formatPickCount(lang, answerCount(current!.answer))}</span>
          </div>
        )}
        <p className="font-medium leading-relaxed mb-4 text-fg whitespace-pre-wrap">{current!.prompt}</p>
        <ul className="space-y-2">
          {current!.choices.map((c) => {
            const isPicked = picked.includes(c.label);
            const isCorrectChoice = correctSet.has(c.label);
            const isWrong = isAnswered && isPicked && !isCorrectChoice;
            const revealed = isAnswered && isCorrectChoice;
            return (
              <li key={c.label}>
                <button type="button" onClick={() => toggle(c.label)} disabled={isAnswered || submitting} aria-pressed={isPicked}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition',
                    !isAnswered && (isPicked ? 'border-accent bg-accent/10' : 'border-border hover:border-border-strong cursor-pointer'),
                    isAnswered && !revealed && !isWrong && 'border-border opacity-50',
                    revealed && 'border-success/40 bg-success/5',
                    isWrong && 'border-danger/40 bg-danger/5',
                  )}
                >
                  <span className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[10px]',
                    multi ? 'rounded' : 'rounded-full',
                    revealed && 'bg-success text-white',
                    isWrong && 'bg-danger text-white',
                    !isAnswered && (isPicked ? 'bg-accent text-white' : 'border border-border-strong text-fg-muted'),
                    isAnswered && !revealed && !isWrong && 'border border-border text-fg-faint',
                  )}>
                    {revealed ? <Check className="h-3 w-3" /> : isWrong ? <X className="h-3 w-3" /> : c.label}
                  </span>
                  <span className="text-sm flex-1 leading-relaxed text-fg">{c.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {multi && !isAnswered && (
          <button type="button" onClick={() => submit(picked)} disabled={picked.length === 0 || submitting}
            className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40">
            {s.checkAnswer}
          </button>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {isAnswered && (
          <div className={cn('mt-4 rounded-md border p-3 text-sm', result!.correct ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5')}>
            <p className="font-medium mb-1.5 text-fg">
              {result!.correct ? s.correct : formatWrong(lang, current!.answer)}
              {result!.mastered && <span className="ml-2 text-xs text-success">{s.mastered}</span>}
            </p>
            {current!.explanation && <p className="text-fg-muted whitespace-pre-wrap leading-relaxed mb-2">{current!.explanation}</p>}
            <p className="text-xs text-fg-faint">{fmt(s.nextDue, { due: formatDue(lang, result!.dueAt) })}</p>
            {!result!.correct && (
              <>
                <WrongReasonPicker questionId={current!.questionId} />
                <TutorPanel questionId={current!.questionId} selected={[...picked].sort().join(',')} />
              </>
            )}
            <button type="button" onClick={next} className="mt-3 block rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
              {idx + 1 < cards.length ? s.nextQuestion : s.finishReview}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
