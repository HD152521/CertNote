'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { ResultView } from './ResultView';
import { runInWorker, type Verdict } from './runner';
import type { WireResult } from './sqlWorker';
import { sqlStrings, type SqlLang } from './i18n';

interface SqlConsoleProps {
  initial: string;
  /** 과제 채점: 실행할 때 이 과제로 채점하고, 결과를 renderVerdict 로 그린다 */
  task?: { setId: string; itemId: string };
  renderVerdict?: (verdict: Verdict) => ReactNode;
  label?: string;
  rows?: number;
  /** 화면 언어(기본 ko) */
  lang?: SqlLang;
}

const BUTTON =
  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-accent';

// SQL 입력창 + 실행 + 결과. Ctrl(⌘)+Enter 로 실행, Tab 은 공백 두 칸.
export function SqlConsole({ initial, task, renderVerdict, label, rows = 4, lang = 'ko' }: SqlConsoleProps) {
  const s = sqlStrings(lang);
  const [src, setSrc] = useState(initial);
  const [results, setResults] = useState<WireResult[] | null>(null);
  const [extra, setExtra] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // 실행은 워커에서 한다. 4초 안에 끝나지 않으면 멈추고 안내한다(탭은 멈추지 않는다).
  const run = async () => {
    if (busy) return;
    setBusy(true);
    const out = await runInWorker(src, task && { ...task, lang });
    setBusy(false);
    if (out.timedOut) {
      setResults([{ kind: 'note', sql: src, message: s.timedOut }]);
      setExtra(null);
      return;
    }
    setResults(out.results);
    setExtra(renderVerdict && out.results.length ? renderVerdict(out.verdict) : null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void run();
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
        aria-label={label ?? s.consoleLabel}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={Math.max(rows, Math.min(12, src.split('\n').length + 1))}
        className="block w-full resize-y rounded-md border border-border-strong bg-code-bg px-3 py-2.5 font-mono text-[16px] leading-relaxed text-fg focus:border-accent focus:outline-none sm:text-[13.5px]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={run} disabled={busy} className={`${BUTTON} bg-fg text-bg hover:opacity-90 disabled:opacity-60`}>
          <Play className="h-3.5 w-3.5" aria-hidden /> {busy ? s.running : s.run}
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
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {s.reset}
        </button>
        <span className="hidden text-[12px] text-fg-faint sm:inline">{s.ctrlEnter}</span>
      </div>
      {results && (
        <div className="space-y-3" aria-live="polite">
          {results.length === 0 && <div className="text-[13px] text-fg-muted">{s.nothingToRun}</div>}
          {results.map((r, i) => (
            <ResultView key={i} result={r} showSql={results.length > 1} lang={lang} />
          ))}
          {extra}
        </div>
      )}
    </div>
  );
}
