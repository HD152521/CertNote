'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { runSql, type StatementResult } from '@/lib/sql-lab/run';
import { ResultView } from './ResultView';

interface SqlConsoleProps {
  initial: string;
  /** 실행할 때마다 결과를 받아 덧붙일 내용(채점 줄 등)을 돌려준다 */
  onRun?: (results: StatementResult[], src: string) => ReactNode;
  label?: string;
  rows?: number;
}

const BUTTON =
  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-accent';

// SQL 입력창 + 실행 + 결과. Ctrl(⌘)+Enter 로 실행, Tab 은 공백 두 칸.
export function SqlConsole({ initial, onRun, label = 'SQL 입력', rows = 4 }: SqlConsoleProps) {
  const [src, setSrc] = useState(initial);
  const [results, setResults] = useState<StatementResult[] | null>(null);
  const [extra, setExtra] = useState<ReactNode>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const run = () => {
    const rs = runSql(src);
    setResults(rs);
    setExtra(onRun ? onRun(rs, src) : null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run();
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: t } = el;
      const next = `${src.slice(0, s)}  ${src.slice(t)}`;
      setSrc(next);
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  };

  return (
    <div className="space-y-2.5">
      <textarea
        ref={ref}
        value={src}
        onChange={(e) => setSrc(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label={label}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={Math.max(rows, Math.min(12, src.split('\n').length + 1))}
        className="block w-full resize-y rounded-md border border-border-strong bg-code-bg px-3 py-2.5 font-mono text-[16px] leading-relaxed text-fg focus:border-accent focus:outline-none sm:text-[13.5px]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={run} className={`${BUTTON} bg-fg text-bg hover:opacity-90`}>
          <Play className="h-3.5 w-3.5" aria-hidden /> 실행
        </button>
        <button
          type="button"
          onClick={() => {
            setSrc(initial);
            setResults(null);
            setExtra(null);
            ref.current?.focus();
          }}
          className={`${BUTTON} border border-border text-fg-muted hover:text-fg`}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> 처음 문장으로
        </button>
        <span className="hidden text-[12px] text-fg-faint sm:inline">Ctrl + Enter 로도 실행</span>
      </div>
      {results && (
        <div className="space-y-3" aria-live="polite">
          {results.length === 0 && <div className="text-[13px] text-fg-muted">실행할 문장이 없어요.</div>}
          {results.map((r, i) => (
            <ResultView key={i} result={r} showSql={results.length > 1} />
          ))}
          {extra}
        </div>
      )}
    </div>
  );
}
