'use client';
import { DEFAULT_CATEGORY } from '@/lib/category';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, X, Flag, Clock } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CertOption { slug: string; code: string; name: string }

interface ExamQuestion {
  questionId: string;
  number: number;
  prompt: string;
  choices: { label: string; text: string }[];
  slug: string;
  domain: string;
  multi: boolean;
}

interface ExamResultItem extends ExamQuestion {
  selected: string | null;
  correct: boolean;
  answer: string;
  explanation: string;
}

interface ExamResult {
  total: number;
  answered: number;
  correct: number;
  score: number;
  passed: boolean;
  passMark: number;
  items: ExamResultItem[];
}

type Phase = 'setup' | 'running' | 'result';

const COUNT_OPTIONS = [10, 20, 40];

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ExamRunner({ certs }: { certs: CertOption[] }) {
  const [phase, setPhase] = useState<Phase>('setup');

  // setup
  const [certSlug, setCertSlug] = useState('');
  const [count, setCount] = useState(20);
  const [useTimer, setUseTimer] = useState(true);
  const [minutes, setMinutes] = useState(20);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // running
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [idx, setIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // result
  const [result, setResult] = useState<ExamResult | null>(null);
  const [filterWrong, setFilterWrong] = useState(false);

  const answeredCount = Object.keys(answers).length;

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/exam/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionIds: questions.map((q) => q.questionId), answers }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ExamResult;
      setResult(data);
      setTimeLeft(null);
      setPhase('result');
    } catch {
      setError('채점에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, questions, answers]);

  // 최신 submit을 타이머 콜백에서 참조(스테일 클로저 방지).
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // 카운트다운 타이머. 0이 되면 자동 제출.
  useEffect(() => {
    if (phase !== 'running' || timeLeft === null) return;
    if (timeLeft <= 0) {
      submitRef.current();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/exam/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certSlug: certSlug || undefined, count }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? '시험을 시작하지 못했습니다.');
        return;
      }
      setQuestions(data.questions as ExamQuestion[]);
      setAnswers({});
      setMarked(new Set());
      setIdx(0);
      setResult(null);
      setFilterWrong(false);
      setTimeLeft(useTimer ? Math.max(1, minutes) * 60 : null);
      setPhase('running');
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setStarting(false);
    }
  }

  function pick(q: ExamQuestion, label: string) {
    setAnswers((prev) => {
      if (!q.multi) return { ...prev, [q.questionId]: label };
      // 복수 응답: 토글 후 정규화("B,D"). 모두 해제하면 키 제거(미응답).
      const cur = new Set((prev[q.questionId] ?? '').split(',').filter(Boolean));
      if (cur.has(label)) cur.delete(label); else cur.add(label);
      const val = [...cur].sort().join(',');
      const next = { ...prev };
      if (val) next[q.questionId] = val; else delete next[q.questionId];
      return next;
    });
  }
  function toggleMark(qid: string) {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid); else next.add(qid);
      return next;
    });
  }
  function reset() {
    setPhase('setup');
    setQuestions([]);
    setAnswers({});
    setMarked(new Set());
    setResult(null);
    setError(null);
  }
  function trySubmit() {
    const left = questions.length - answeredCount;
    if (left > 0 && !confirm(`아직 ${left}문항 안 풀었어요. 제출할까요?`)) return;
    submit();
  }

  if (phase === 'setup') {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm text-fg-muted">자격증 범위</label>
          <select value={certSlug} onChange={(e) => setCertSlug(e.target.value)}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-border-strong">
            <option value="">전체 자격증</option>
            {certs.map((c) => <option key={c.slug} value={c.slug}>{c.code} — {c.name}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-fg-muted">문항 수</label>
          <div className="flex gap-2">
            {COUNT_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setCount(n)}
                className={cn('flex-1 rounded-md border px-3 py-2 text-sm transition',
                  count === n ? 'border-accent bg-accent/10 text-fg' : 'border-border text-fg-muted hover:text-fg')}>
                {n}문항
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={useTimer} onChange={(e) => setUseTimer(e.target.checked)} />
            제한 시간 사용
          </label>
          {useTimer && (
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              <input type="number" min={1} max={180} value={minutes}
                onChange={(e) => setMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
                className="w-20 rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-border-strong" />
              분
            </div>
          )}
        </div>

        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button type="button" onClick={start} disabled={starting}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50">
          {starting ? '준비 중…' : '시험 시작'}
        </button>
        <p className="text-xs text-fg-faint">제출 전까지 정답은 표시되지 않습니다. 제출 후 일괄 채점되고, 틀린 문제는 복습 큐에 쌓입니다.</p>
      </div>
    );
  }

  if (phase === 'running') {
    const q = questions[idx];
    const pickedSet = new Set((answers[q.questionId] ?? '').split(',').filter(Boolean));
    const isLow = timeLeft !== null && timeLeft <= 60;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-fg-muted tabular-nums">{idx + 1} / {questions.length} · 답함 {answeredCount}</span>
          {timeLeft !== null && (
            <span className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-mono tabular-nums',
              isLow ? 'border-danger/50 bg-danger/10 text-danger' : 'border-border text-fg-muted')}>
              <Clock className="h-3.5 w-3.5" /> {fmtTime(timeLeft)}
            </span>
          )}
        </div>

        {/* 문항 팔레트 */}
        <div className="flex flex-wrap gap-1.5">
          {questions.map((qq, i) => {
            const done = !!answers[qq.questionId];
            const isMarked = marked.has(qq.questionId);
            return (
              <button key={qq.questionId} type="button" onClick={() => setIdx(i)}
                className={cn('relative h-9 w-9 rounded text-xs font-mono tabular-nums transition',
                  i === idx ? 'ring-2 ring-accent' : '',
                  done ? 'bg-accent/15 text-fg' : 'bg-bg-subtle text-fg-faint hover:text-fg')}>
                {i + 1}
                {isMarked && <Flag className="absolute -right-1 -top-1 h-2.5 w-2.5 text-amber-500" />}
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-border bg-bg-elevated p-4 sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">{q.slug} · {q.domain}</p>
            <button type="button" onClick={() => toggleMark(q.questionId)}
              className={cn('flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition',
                marked.has(q.questionId) ? 'text-amber-500' : 'text-fg-faint hover:text-fg')}>
              <Flag className="h-3 w-3" /> {marked.has(q.questionId) ? '마킹됨' : '나중에'}
            </button>
          </div>
          <p className="mb-2 font-medium leading-relaxed text-fg whitespace-pre-wrap">{q.prompt}</p>
          {q.multi && <p className="mb-3 text-xs text-accent">복수 응답 — 해당하는 보기를 모두 선택하세요.</p>}
          <ul className="space-y-2">
            {q.choices.map((c) => {
              const isPicked = pickedSet.has(c.label);
              return (
                <li key={c.label}>
                  <button type="button" onClick={() => pick(q, c.label)} aria-pressed={isPicked}
                    className={cn('flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition',
                      isPicked ? 'border-accent bg-accent/10' : 'border-border hover:border-border-strong')}>
                    <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[10px]',
                      q.multi ? 'rounded' : 'rounded-full',
                      isPicked ? 'bg-accent text-white' : 'border border-border-strong text-fg-muted')}>{c.label}</span>
                    <span className="flex-1 text-sm leading-relaxed text-fg">{c.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
            className="rounded-md border border-border px-3 py-2 text-sm text-fg-muted transition hover:text-fg disabled:opacity-40">← 이전</button>
          {idx < questions.length - 1 ? (
            <button type="button" onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
              className="rounded-md border border-border px-3 py-2 text-sm text-fg-muted transition hover:text-fg">다음 →</button>
          ) : (
            <button type="button" onClick={trySubmit} disabled={submitting}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50">
              {submitting ? '채점 중…' : '제출하고 채점'}
            </button>
          )}
        </div>
        <button type="button" onClick={trySubmit} disabled={submitting}
          className="w-full rounded-md border border-border-strong px-3 py-2 text-sm text-fg-muted transition hover:text-fg disabled:opacity-50">
          지금 제출하기
        </button>
      </div>
    );
  }

  // result
  const r = result!;
  const shown = filterWrong ? r.items.filter((it) => !it.correct) : r.items;
  return (
    <div className="space-y-6">
      <div className={cn('rounded-xl border p-6 text-center', r.passed ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5')}>
        <p className="text-sm text-fg-muted">점수</p>
        <p className="mt-1 text-5xl font-semibold tabular-nums tracking-tight text-fg">{r.score}<span className="text-2xl font-normal text-fg-faint">%</span></p>
        <p className={cn('mt-2 inline-block rounded-full px-3 py-1 text-sm font-medium', r.passed ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
          {r.passed ? '합격' : '불합격'} · 합격선 {r.passMark}%
        </p>
        <p className="mt-3 text-xs text-fg-faint tabular-nums">정답 {r.correct} / {r.total} · 응답 {r.answered} · 미응답 {r.total - r.answered}</p>
      </div>

      <p className="text-xs text-fg-muted">틀린 문제는 오답노트(복습 큐)에 자동으로 추가됐어요.</p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setFilterWrong(false)}
            className={cn('rounded-md border px-3 py-1.5 text-xs transition', !filterWrong ? 'border-accent bg-accent/10 text-fg' : 'border-border text-fg-muted hover:text-fg')}>전체 {r.total}</button>
          <button type="button" onClick={() => setFilterWrong(true)}
            className={cn('rounded-md border px-3 py-1.5 text-xs transition', filterWrong ? 'border-accent bg-accent/10 text-fg' : 'border-border text-fg-muted hover:text-fg')}>틀린 것 {r.total - r.correct}</button>
        </div>
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={reset} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">다시 풀기</button>
          <Link href="/notebook" className="rounded-md border border-border px-3 py-1.5 text-fg-muted hover:text-fg">오답노트</Link>
          <Link href="/dashboard" className="rounded-md border border-border px-3 py-1.5 text-fg-muted hover:text-fg">대시보드</Link>
        </div>
      </div>

      <ul className="space-y-3">
        {shown.map((it, i) => {
          const correctSet = new Set(it.answer.toUpperCase().replace(/[^A-E]/g, '').split(''));
          const selectedSet = new Set((it.selected ?? '').split(',').map((x) => x.trim()).filter(Boolean));
          return (
            <li key={`${it.questionId}-${i}`} className="rounded-lg border border-border bg-bg-elevated p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Link href={`/${DEFAULT_CATEGORY}/${it.slug}`} className="font-mono text-[11px] uppercase tracking-wider text-fg-faint hover:text-fg">{it.slug} · {it.domain}</Link>
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-xs', it.correct ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>{it.correct ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}</span>
              </div>
              <p className="mb-3 font-medium leading-relaxed text-fg whitespace-pre-wrap">{it.prompt}</p>
              <ul className="space-y-1.5">
                {it.choices.map((c) => {
                  const isAnswer = correctSet.has(c.label);
                  const isPicked = selectedSet.has(c.label);
                  return (
                    <li key={c.label} className={cn('flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm',
                      isAnswer ? 'border-success/40 bg-success/5 text-fg' : isPicked ? 'border-danger/40 bg-danger/5 text-fg' : 'border-border text-fg-muted')}>
                      <span className="mt-0.5 font-mono text-[10px] text-fg-faint">{c.label}</span>
                      <span className="flex-1 leading-relaxed">{c.text}</span>
                      {isAnswer && <span className="text-[10px] text-success">정답</span>}
                      {isPicked && !isAnswer && <span className="text-[10px] text-danger">내 선택</span>}
                    </li>
                  );
                })}
              </ul>
              {it.selected === null && <p className="mt-2 text-xs text-danger">미응답</p>}
              {it.explanation && <p className="mt-2 text-xs text-fg-muted whitespace-pre-wrap leading-relaxed">💡 {it.explanation}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
