'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { parseCorrectSet } from '@/lib/quiz/correctness';
import { cn } from '@/lib/cn';

interface Card {
  questionId: string;
  box: number;
  mastered: boolean;
  dueAt: string;
  number: number;
  prompt: string;
  choices: { label: string; text: string }[];
  answer: string;
  explanation: string;
  slug: string;
  week: number;
  day: number;
}

type Filter = 'all' | 'due' | 'mastered';

function isDue(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

function boxLabel(card: Card): { text: string; tone: string } {
  if (card.mastered) return { text: '마스터 🎓', tone: 'text-success border-success/40 bg-success/5' };
  if (isDue(card.dueAt)) return { text: '복습 필요', tone: 'text-danger border-danger/40 bg-danger/5' };
  return { text: `${card.box}단계`, tone: 'text-fg-muted border-border' };
}

export function NotebookList() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/review/notebook', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (active) setCards(d.items ?? []); })
      .catch(() => { if (active) setError('오답노트를 불러오지 못했습니다.'); });
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const list = cards ?? [];
    return {
      total: list.length,
      due: list.filter((c) => !c.mastered && isDue(c.dueAt)).length,
      mastered: list.filter((c) => c.mastered).length,
    };
  }, [cards]);

  const filtered = useMemo(() => {
    const list = cards ?? [];
    if (filter === 'due') return list.filter((c) => !c.mastered && isDue(c.dueAt));
    if (filter === 'mastered') return list.filter((c) => c.mastered);
    return list;
  }, [cards, filter]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!cards) return <p className="text-sm text-fg-muted">불러오는 중…</p>;

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-elevated p-8 text-center">
        <p className="text-2xl mb-2">📒</p>
        <p className="font-medium text-fg mb-1">아직 틀린 문제가 없어요</p>
        <p className="text-sm text-fg-muted mb-4">연습 문제를 풀다가 틀리면 자동으로 여기 모입니다.</p>
        <Link href="/" className="text-sm text-accent underline underline-offset-4">학습 시작하기</Link>
      </div>
    );
  }

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: stats.total },
    { key: 'due', label: '복습 필요', count: stats.due },
    { key: 'mastered', label: '마스터', count: stats.mastered },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-xs transition',
                filter === f.key ? 'border-accent bg-accent/10 text-fg' : 'border-border text-fg-muted hover:text-fg',
              )}
            >
              {f.label} <span className="text-fg-faint">{f.count}</span>
            </button>
          ))}
        </div>
        {stats.due > 0 && (
          <Link href="/review" className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
            복습 시작 ({stats.due})
          </Link>
        )}
      </div>

      <ul className="space-y-3">
        {filtered.map((card) => {
          const correctSet = parseCorrectSet(card.answer);
          const badge = boxLabel(card);
          return (
            <li key={card.questionId} className="rounded-lg border border-border bg-bg-elevated p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Link href={`/aws-certs/${card.slug}/week${card.week}/day${card.day}`}
                  className="font-mono text-[11px] uppercase tracking-wider text-fg-faint hover:text-fg">
                  {card.slug} · W{card.week} D{card.day}
                </Link>
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', badge.tone)}>{badge.text}</span>
              </div>
              <p className="font-medium leading-relaxed mb-3 text-fg whitespace-pre-wrap">{card.prompt}</p>
              <ul className="space-y-1.5">
                {card.choices.map((c) => {
                  const correct = correctSet.has(c.label);
                  return (
                    <li key={c.label}
                      className={cn(
                        'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm',
                        correct ? 'border-success/40 bg-success/5 text-fg' : 'border-border text-fg-muted',
                      )}
                    >
                      <span className="mt-0.5 font-mono text-[10px] text-fg-faint">{c.label}</span>
                      <span className="flex-1 leading-relaxed">{c.text}</span>
                    </li>
                  );
                })}
              </ul>
              {card.explanation && (
                <p className="mt-2 text-xs text-fg-muted whitespace-pre-wrap leading-relaxed">💡 {card.explanation}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
