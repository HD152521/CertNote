'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { InlineMd } from '@/components/InlineMd';
import { track } from '@/lib/analytics';
import { signupHref } from '@/lib/auth/signupHref';
import type { Language } from '@/lib/i18n';
import { fmt, pick as pickStrings } from '@/lib/strings/dict';
import { tryStrings } from '@/lib/strings/try';
import { PracticeFeedback, type CheckResult } from './PracticeFeedback';

interface PreviewQuestion {
  questionId: string;
  prompt: string;
  choices: { label: string; text: string }[];
  multi: boolean;
}

interface GuestPreviewProps {
  certSlug: string;
  certCode: string;
  /** 자격증 전체 모의고사 문항 수(가입 안내 문구용). */
  totalCount: number;
  lang: Language;
}

// 비로그인 맛보기: 5문제를 한 문제씩 풀고 바로 해설을 본다. 서버에 기록은 남지 않고,
// 끝나면 가입하면 무엇이 되는지(전체 모의고사·오답 노트)를 한 번만 보여 준다.
export function GuestPreview({ certSlug, certCode, totalCount, lang }: GuestPreviewProps) {
  const s = pickStrings(tryStrings, lang);
  const [questions, setQuestions] = useState<PreviewQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, CheckResult>>({});
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/exam/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certSlug, lang }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(lang === 'ko' ? (data.message ?? s.loadError) : s.loadError);
        return;
      }
      setQuestions(data.questions as PreviewQuestion[]);
      setIdx(0);
      setPicked({});
      setChecked({});
      track('guest_exam_start', { cert: certSlug, lang });
    } catch {
      setError(s.networkError);
    } finally {
      setLoading(false);
    }
  }, [certSlug, lang, s]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
  }, [load]);

  const q = questions[idx];
  const fb = q ? checked[q.questionId] : undefined;
  const done = questions.length > 0 && idx >= questions.length;
  const correctCount = Object.values(checked).filter((c) => c.correct).length;

  function pick(label: string) {
    if (!q || fb) return;
    setPicked((prev) => {
      if (!q.multi) return { ...prev, [q.questionId]: label };
      const cur = new Set((prev[q.questionId] ?? '').split(',').filter(Boolean));
      if (cur.has(label)) cur.delete(label);
      else cur.add(label);
      const val = [...cur].sort().join(',');
      const next = { ...prev };
      if (val) next[q.questionId] = val;
      else delete next[q.questionId];
      return next;
    });
  }

  async function check() {
    if (!q || fb || checking || !picked[q.questionId]) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/exam/preview/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: q.questionId, selected: picked[q.questionId], lang }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as CheckResult;
      setChecked((prev) => ({ ...prev, [q.questionId]: data }));
    } catch {
      setError(s.checkError);
    } finally {
      setChecking(false);
    }
  }

  function next() {
    if (idx === questions.length - 1) {
      track('guest_exam_done', { cert: certSlug, correct: correctCount, total: questions.length, lang });
    }
    setIdx((i) => i + 1);
  }

  if (loading) return <p className="text-sm text-fg-muted">{s.loading}</p>;
  if (error && questions.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-danger" role="alert">{error}</p>
        <button type="button" onClick={() => void load()} className="rounded-md border border-border px-3 py-2 text-sm text-fg-muted hover:text-fg">
          {s.retry}
        </button>
      </div>
    );
  }

  if (done) {
    const total = questions.length;
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-bg-subtle p-6 text-center">
          <p className="text-sm text-fg-muted">{fmt(s.resultTitle, { code: certCode })}</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-fg">
            {correctCount}<span className="text-xl font-normal text-fg-faint"> / {total}</span>
          </p>
        </div>
        <div className="space-y-3 rounded-lg border border-accent/40 bg-accent/5 p-4 text-sm">
          <p className="leading-relaxed text-fg">
            {fmt(s.signupBody, { code: certCode, total: totalCount })}
          </p>
          <Link
            href={signupHref(lang, lang === 'en' ? `/en/try?cert=${certSlug}` : `/exam?cert=${certSlug}`)}
            rel="nofollow"
            prefetch={false}
            data-signup-cta
            onClick={() => track('signup_prompt_click', { placement: 'try_result', lang, cert: certSlug })}
            className="inline-flex items-center rounded-md bg-accent px-4 py-2 font-medium text-accent-fg no-underline transition hover:opacity-90"
          >
            {s.signupCta}
          </Link>
        </div>
        <button type="button" onClick={() => void load()} className="text-sm text-fg-muted underline underline-offset-4 hover:text-fg">
          {s.more}
        </button>
      </div>
    );
  }

  if (!q) return null;
  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-fg-faint">{idx + 1} / {questions.length}{q.multi ? s.multi : ''}</p>
      <p className="whitespace-pre-wrap leading-relaxed text-fg"><InlineMd text={q.prompt} /></p>
      <ul className="space-y-2">
        {q.choices.map((c) => {
          const sel = (picked[q.questionId] ?? '').split(',').includes(c.label);
          const isAnswer = fb ? fb.answer.split(',').includes(c.label) : false;
          const tone = fb
            ? isAnswer ? 'border-success/50 bg-success/10' : sel ? 'border-danger/50 bg-danger/10' : 'border-border opacity-70'
            : sel ? 'border-accent bg-accent/10' : 'border-border hover:border-border-strong';
          return (
            <li key={c.label}>
              <button
                type="button"
                onClick={() => pick(c.label)}
                aria-pressed={sel}
                disabled={!!fb}
                className={cn('flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition disabled:cursor-default', tone)}
              >
                <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[10px]', q.multi ? 'rounded' : 'rounded-full', sel ? 'bg-accent text-white' : 'border border-border-strong text-fg-muted')}>{c.label}</span>
                <span className="flex-1 text-sm leading-relaxed text-fg"><InlineMd text={c.text} /></span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {!fb ? (
        <button type="button" onClick={() => void check()} disabled={!picked[q.questionId] || checking}
          className="w-full rounded-md border border-accent/60 bg-accent/10 px-3 py-2 text-sm font-medium text-fg transition hover:bg-accent/15 disabled:opacity-40">
          {checking ? s.checking : s.check}
        </button>
      ) : (
        <>
          <PracticeFeedback result={fb} lang={lang} />
          <button type="button" onClick={next}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
            {idx === questions.length - 1 ? s.seeResult : s.next}
          </button>
        </>
      )}
    </div>
  );
}
