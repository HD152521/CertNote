'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type NewLogEntry =
  | { kind: 'cmd'; text: string; exitCode: number; prompt?: string }
  | { kind: 'out' | 'err' | 'note' | 'sys' | 'pass'; text: string };
export type LogEntry = NewLogEntry & { id: number };

interface LabTerminalProps {
  /** 머리줄 왼쪽에 보이는 경로 */
  cwd: string;
  /** 머리줄 오른쪽. 없으면 AWS 리전·계정 표시 */
  headerRight?: ReactNode;
  region?: string;
  accountId?: string;
  /** 셸 프롬프트(예: "[root@localhost ~]# "). 없으면 AWS 연습장 프롬프트 */
  prompt?: string;
  inputLabel?: string;
  placeholder?: string;
  /** 지금 풀 단계. 모바일에서 터미널 바로 위에 붙여, 키보드를 연 채로도 문제를 볼 수 있게 한다. */
  task?: { label: string; text: string };
  log: LogEntry[];
  input: string;
  onInput: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

const PROMPT_USER = 'learner@certnote';

// 모바일에서 입력창을 누르면 터미널을 사이트 헤더(h-14) 바로 아래로 올리고, 키보드가 가린 만큼 터미널 높이를 줄인다.
const MOBILE_MAX = 640;
const SITE_HEADER_PX = 56;
const MIN_LOG_PX = 140;

// "[root@localhost ~]# " 를 칸별로 색칠한다.
function ShellPrompt({ text }: { text: string }) {
  const m = /^\[([^@]+@[^ ]+) (.*)\]([#$]) $/.exec(text);
  if (!m) return <span className="select-none text-[#6b7f78]">{text}</span>;
  return (
    <span className="select-none">
      <span className="text-[#6b7f78]">[</span>
      <span className="text-[#5eead4]">{m[1]}</span>
      <span className="text-[#c9d6d0]"> {m[2]}</span>
      <span className="text-[#6b7f78]">]{m[3]}</span>
      <span aria-hidden> </span>
    </span>
  );
}

function Prompt({ text }: { text?: string }) {
  if (text) return <ShellPrompt text={text} />;
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
            <Prompt text={entry.prompt} />
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

export function LabTerminal({
  cwd, headerRight, region, accountId, prompt, inputLabel = 'AWS CLI 명령 입력',
  placeholder = 'aws 로 시작해 보세요 · Tab 자동 완성', task, log, input, onInput, onKeyDown, inputRef,
}: LabTerminalProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fitHeight, setFitHeight] = useState<number | null>(null);

  const fitToKeyboard = useCallback(() => {
    const root = rootRef.current;
    const logEl = scrollRef.current;
    const vv = window.visualViewport;
    if (!root || !logEl || !vv || window.innerWidth >= MOBILE_MAX) return;
    const chrome = logEl.getBoundingClientRect().top - root.getBoundingClientRect().top;
    setFitHeight(Math.max(MIN_LOG_PX, Math.floor(vv.height - SITE_HEADER_PX - chrome - 8)));
    window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - SITE_HEADER_PX, behavior: 'smooth' });
  }, []);

  // 키보드가 열리고 닫히며 보이는 영역이 바뀌는 동안(포커스 중에만) 높이를 다시 맞춘다.
  useEffect(() => {
    const vv = window.visualViewport;
    if (fitHeight === null || !vv) return;
    vv.addEventListener('resize', fitToKeyboard);
    return () => vv.removeEventListener('resize', fitToKeyboard);
  }, [fitHeight, fitToKeyboard]);

  // 새 줄이 생기면 터미널 안쪽만 맨 아래로 — 페이지 스크롤은 건드리지 않는다.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <div
      ref={rootRef}
      className="overflow-hidden bg-[#0e1513] font-mono text-[13px] leading-[1.65] text-[#c9d6d0]"
      onClick={() => {
        if (!window.getSelection()?.toString()) inputRef.current?.focus();
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#1f2b27] bg-[#121b18] px-4 py-2 text-[11.5px] text-[#6b7f78]">
        <span className="truncate">{cwd}</span>
        {headerRight ?? (
          <span className="flex shrink-0 items-center gap-2">
            <span className="rounded-sm bg-[#5eead4]/10 px-1.5 text-[#5eead4]">{region}</span>
            <span className="hidden sm:inline">acct {accountId}</span>
          </span>
        )}
      </div>

      {task && (
        <div className="border-b border-[#1f2b27] bg-[#16211e] px-4 py-2 font-sans sm:hidden">
          <div className="font-mono text-[11px] tracking-wide text-[#5eead4]">{task.label}</div>
          <div className="mt-0.5 text-[13px] leading-snug text-[#dfe9e4]">{task.text}</div>
        </div>
      )}

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        className="h-[22rem] overflow-y-auto px-4 py-3 sm:h-[26rem]"
        style={fitHeight !== null ? { height: fitHeight } : undefined}
      >
        {log.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
        <label className="flex items-center">
          <Prompt text={prompt} />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => window.setTimeout(fitToKeyboard, 300)}
            onBlur={() => setFitHeight(null)}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            aria-label={inputLabel}
            // 16px 미만이면 iOS 가 입력 시 화면을 확대한다.
            className={cn(
              'min-w-0 flex-1 bg-transparent text-[16px] text-[#e7efeb] caret-[#5eead4] outline-none sm:text-[13px]',
              'placeholder:text-[#3d4f49]',
            )}
            placeholder={log.some((e) => e.kind === 'cmd') ? '' : placeholder}
          />
        </label>
      </div>
    </div>
  );
}
