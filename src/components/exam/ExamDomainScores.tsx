'use client';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface DomainScore {
  slug: string;
  domain: string;
  total: number;
  correct: number;
  rate: number;
}

// 다시 풀 도메인: 합격선 아래인 곳 전부. 모두 넘었으면 가장 낮은 한 곳.
export function weakDomains(rows: readonly DomainScore[], passMark: number): DomainScore[] {
  const below = rows.filter((d) => d.rate < passMark);
  return below.length > 0 ? below : rows.slice(0, 1);
}

// 모의고사 결과의 도메인별 정답률. 정답률 낮은 순(서버 정렬)으로 막대를 그리고 약한 곳만 다시 풀게 한다.
export function ExamDomainScores({ rows, passMark, multiCert, lang, onRetryWeak }: {
  rows: DomainScore[];
  passMark: number;
  multiCert: boolean;
  lang: string;
  onRetryWeak: (weak: DomainScore[]) => void;
}) {
  if (rows.length === 0) return null;
  const weak = weakDomains(rows, passMark);
  const en = lang === 'en';
  // 셋 이상이면 이름 대신 개수 — 버튼이 세 줄로 늘어나지 않게.
  const what = weak.length <= 2 ? weak.map((d) => d.domain).join(', ') : (en ? `${weak.length} domains` : `${weak.length}곳`);
  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-4 sm:p-5" aria-labelledby="exam-domain-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="exam-domain-title" className="text-sm font-semibold text-fg">{en ? 'Score by domain' : '도메인별 정답률'}</h2>
        <span className="text-xs text-fg-faint">{en ? `Line = passing ${passMark}%` : `세로선 = 합격선 ${passMark}%`}</span>
      </div>
      <ul className="space-y-3">
        {rows.map((d) => {
          const low = d.rate < passMark;
          return (
            <li key={`${d.slug}-${d.domain}`}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="text-fg">
                  {multiCert && <span className="mr-1.5 font-mono text-[11px] uppercase text-fg-faint">{d.slug}</span>}
                  {d.domain}
                </span>
                <span className={cn('tabular-nums', low ? 'text-danger' : 'text-success')}>
                  {d.rate}% <span className="text-xs text-fg-faint">({d.correct}/{d.total})</span>
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-bg-subtle">
                <div className={cn('h-2 rounded-full', low ? 'bg-danger/70' : 'bg-success/70')} style={{ width: `${d.rate}%` }} />
                <div className="absolute -top-0.5 h-3 w-px bg-fg-muted" style={{ left: `${passMark}%` }} aria-hidden />
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => onRetryWeak(weak)}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-accent/60 bg-accent/10 px-3 py-2 text-sm font-medium text-fg transition hover:bg-accent/15">
        <RotateCcw className="h-3.5 w-3.5" />
        {en
          ? `Practice weak domains (${what})`
          : `약한 도메인만 연습하기 (${what})`}
      </button>
    </section>
  );
}
