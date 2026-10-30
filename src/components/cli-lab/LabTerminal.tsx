'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export type NewLogEntry =
  | { kind: 'cmd'; text: string; exitCode: number }
  | { kind: 'out' | 'err' | 'note' | 'sys' | 'pass'; text: string };
export type LogEntry = NewLogEntry & { id: number };

interface LabTerminalProps {
  cwd: string;
  region: string;
  accountId: string;
  log: LogEntry[];
  input: string;
  onInput: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

const PROMPT_USER = 'learner@certnote';

function Prompt() {
  return (
    <span className="select-none">
      <span className="text-[#5eead4]">{PROMPT_USER}</span>
      <span className="text-[#6b7f78]">:~$</span>
      <span aria-hidden> </span>
    </span>
  );
}

function Entry({ entry }: { entry: LogEntry }) {
  switch (entry.kind) {
    case 'cmd':
      return (
        <div className="group flex items-start gap-3">
          <div className="min-w-0 flex-1 whitespace-pre-wrap break-all">
            <Prompt />
            <span className="text-[#e7efeb]">{entry.text}</span>
          </div>
          {entry.exitCode !== 0 && (
            <span className="mt-0.5 shrink-0 rounded-sm border border-[#f4a29a]/40 px-1.5 text-[11px] leading-5 text-[#f4a29a]">
              exit {entry.exitCode}
            </span>
          )}
        </div>
      );
    case 'out':
      return <div className="overflow-x-auto whitespace-pre text-[#c9d6d0]">{entry.text}</div>;
    case 'err':
      return <div className="overflow-x-auto whitespace-pre-wrap text-[#f4a29a]">{entry.text}</div>;
    case 'note':
      return (
        <div className="my-1.5 border-l-2 border-[#f2c66d] bg-[#f2c66d]/[0.07] py-1.5 pl-3 pr-2 font-sans text-[13px] leading-relaxed text-[#ecdcb4]">
          <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-[#f2c66d]">연습장 안내</span>
          {entry.text}
        </div>
      );
    case 'pass':
      return (
        <div className="my-1.5 font-mono text-[12px] tracking-wide text-[#5eead4]">
          <span aria-hidden className="hidden sm:inline">──── </span>
          {entry.text}
          <span aria-hidden className="hidden sm:inline"> ────</span>
        </div>
      );
    default:
      return <div className="whitespace-pre-wrap text-[#6b7f78]">{entry.text}</div>;
  }
}

export function LabTerminal({ cwd, region, accountId, log, input, onInput, onKeyDown, inputRef }: LabTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 줄이 생기면 터미널 안쪽만 맨 아래로 — 페이지 스크롤은 건드리지 않는다.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <div
      className="overflow-hidden bg-[#0e1513] font-mono text-[13px] leading-[1.65] text-[#c9d6d0]"
      onClick={() => {
        if (!window.getSelection()?.toString()) inputRef.current?.focus();
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#1f2b27] bg-[#121b18] px-4 py-2 text-[11.5px] text-[#6b7f78]">
        <span className="truncate">~/labs/{cwd}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-sm bg-[#5eead4]/10 px-1.5 text-[#5eead4]">{region}</span>
          <span className="hidden sm:inline">acct {accountId}</span>
        </span>
      </div>

      <div ref={scrollRef} role="log" aria-live="polite" className="h-[22rem] overflow-y-auto px-4 py-3 sm:h-[26rem]">
        {log.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
        <label className="flex items-center">
          <Prompt />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            aria-label="AWS CLI 명령 입력"
            // 16px 미만이면 iOS 가 입력 시 화면을 확대한다.
            className={cn(
              'min-w-0 flex-1 bg-transparent text-[16px] text-[#e7efeb] caret-[#5eead4] outline-none sm:text-[13px]',
              'placeholder:text-[#3d4f49]',
            )}
            placeholder={log.some((e) => e.kind === 'cmd') ? '' : 'aws 로 시작해 보세요 · Tab 자동 완성'}
          />
        </label>
      </div>
    </div>
  );
}
