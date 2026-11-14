'use client';

import { useState } from 'react';
import { ArrowRight, Check, Database, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/lib/i18n-client';
import { sqlTaskSetsFor, type SqlTaskItem } from '@/lib/sql-lab/tasks';
import { SchemaPanel } from './SchemaPanel';
import { SqlConsole } from './SqlConsole';
import { labStrings, localizeVerdictReason, type SqlLang } from './i18n';

const SMALL_BUTTON =
  'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12.5px] text-fg-muted hover:border-border-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent';

const STARTER = 'SELECT *\nFROM EMP;';

interface ItemProps {
  setId: string;
  item: SqlTaskItem;
  index: number;
  total: number;
  solved: boolean;
  onSolved: () => void;
  onNext?: () => void;
  lang: SqlLang;
}

// 과제 하나: 지문 → SQL 입력 → 결과·채점 → 힌트·모범 답안.
function TaskView({ setId, item, index, total, solved, onSolved, onNext, lang }: ItemProps) {
  const l = labStrings(lang);
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const reveal = showAnswer || solved;

  return (
    <div className="space-y-3 px-4 pb-5 pt-3 sm:px-5">
      <div className="rounded-lg border border-border bg-bg-elevated px-4 py-3.5">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-muted">
          {l.taskOf(index + 1, total)}
          {solved && (
            <span className="inline-flex items-center gap-1 text-accent">
              <Check className="h-3.5 w-3.5" aria-hidden /> {l.solvedTag}
            </span>
          )}
        </div>
        <div className="mt-1 text-[15.5px] font-semibold text-fg">{item.title}</div>
        <p className="mt-2 text-[14.5px] leading-relaxed text-fg">{item.prompt}</p>
        {showHint && <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted">{l.hintPrefix} {item.hint}</p>}
      </div>

      <SqlConsole
        key={item.id}
        initial={STARTER}
        label={l.taskInputLabel(index + 1)}
        lang={lang}
        task={{ setId, itemId: item.id }}
        renderVerdict={(v) => {
          if (!v) return null;
          if (v.ok) {
            onSolved();
            return (
              <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-accent">
                <Check className="h-4 w-4" aria-hidden /> {l.verdictOk}
              </div>
            );
          }
          return (
            <div className="flex items-start gap-1.5 text-[13.5px] text-fg-muted">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-[#dc2626] dark:text-[#fca5a5]" aria-hidden /> {l.verdictPrefix} {localizeVerdictReason(lang, v.reason)}
            </div>
          );
        }}
      />

      <div className="flex flex-wrap gap-2">
        {!showHint && (
          <button type="button" onClick={() => setShowHint(true)} className={SMALL_BUTTON}>
            {l.showHint}
          </button>
        )}
        {!reveal && (
          <button type="button" onClick={() => setShowAnswer(true)} className={SMALL_BUTTON}>
            {l.showAnswer}
          </button>
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className={cn(SMALL_BUTTON, solved && 'border-accent text-accent hover:border-accent hover:text-accent')}
          >
            {l.nextTask} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {reveal && (
        <div className="space-y-2">
          <pre className="!my-0 whitespace-pre-wrap break-words rounded-md bg-code-bg px-3 py-2 font-mono text-[12.5px] text-fg">{item.answer}</pre>
          <p className="text-[13.5px] leading-relaxed text-fg-muted">{item.explain}</p>
        </div>
      )}
    </div>
  );
}

// SQL 실습장: 과제 번호 줄 + 과제 + 예제 테이블 안내. 쿼리 글자가 아니라 결과로 채점한다.
export function SqlLab({ setId }: { setId: string }) {
  const lang = useLanguage();
  const l = labStrings(lang);
  const sets = sqlTaskSetsFor(lang);
  const set = sets.find((s) => s.id === setId) ?? sets[0];
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState<string[]>([]);
  const item = set.items[index];

  return (
    <section
      aria-label={`${set.code} ${set.title}`}
      className="not-prose my-10 overflow-hidden rounded-xl border border-border-strong bg-bg shadow-[0_1px_0_var(--border),0_12px_32px_-18px_rgba(37,99,235,0.35)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]">
            <span className="rounded-[3px] bg-fg px-1.5 py-0.5 text-bg">{set.code}</span>
            <span className="text-fg-muted">{l.labName}</span>
          </div>
          <div className="mt-2 text-[1.15rem] font-bold leading-snug tracking-[-0.01em] text-fg">{set.title}</div>
          <div className="mt-0.5 text-[12.5px] text-fg-faint">
            {l.solvedCount(solved.length, set.items.length)}
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11.5px] text-fg-muted">
          <Database className="h-3.5 w-3.5" aria-hidden />
          {l.oracleBadge}
        </div>
      </div>

      <div className="px-4 pb-3 sm:px-5">
        <SchemaPanel lang={lang} />
      </div>

      <nav className="flex flex-wrap gap-1.5 px-4 sm:px-5" aria-label={l.pickTask}>
        {set.items.map((it, i) => {
          const done = solved.includes(it.id);
          return (
            <button
              key={it.id}
              type="button"
              aria-current={i === index ? 'step' : undefined}
              aria-label={l.taskAria(i + 1, done, it.title)}
              onClick={() => setIndex(i)}
              className={cn(
                'flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border px-2 font-mono text-[12.5px] transition focus-visible:outline-2 focus-visible:outline-accent',
                i === index ? 'border-fg bg-fg text-bg' : 'border-border text-fg-muted hover:border-border-strong hover:text-fg',
                done && i !== index && 'border-accent/50 text-accent',
              )}
            >
              {done && <Check className="h-3 w-3" aria-hidden />}
              {i + 1}
            </button>
          );
        })}
      </nav>

      <TaskView
        key={item.id}
        setId={set.id}
        item={item}
        index={index}
        total={set.items.length}
        lang={lang}
        solved={solved.includes(item.id)}
        onSolved={() => setSolved((s) => (s.includes(item.id) ? s : [...s, item.id]))}
        onNext={index + 1 < set.items.length ? () => setIndex(index + 1) : undefined}
      />
    </section>
  );
}
