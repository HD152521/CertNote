'use client';

import { useState } from 'react';
import { ArrowRight, Check, RotateCcw, TerminalSquare } from 'lucide-react';
import { LabTerminal, type NewLogEntry } from '@/components/cli-lab/LabTerminal';
import { cn } from '@/lib/cn';
import { SHELL_DRILLS, drillInitialState, type DrillItem } from '@/lib/shell-lab/drills';
import { prompt } from '@/lib/shell-lab/run';
import { accountByUid, session } from '@/lib/shell-lab/state';
import type { RunResult } from '@/lib/shell-lab/types';
import { useShell } from './useShell';

const BANNER =
  '문제마다 처음 상태가 따로 준비되어 있어요. 조건을 모두 채우면 바로 "정답" 이 표시돼요.\n' +
  '같은 결과를 내는 다른 명령도 정답이에요 · Tab 자동 완성 · reset 이 문제 처음부터';

const SMALL_BUTTON =
  'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12.5px] text-fg-muted hover:border-border-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent';

interface ItemProps {
  item: DrillItem;
  index: number;
  total: number;
  solved: boolean;
  onSolved: () => void;
  onNext?: () => void;
}

// 문제 하나: 지문 → 터미널 → 모범 답안·해설. 문제를 바꾸면 key 로 새로 그려 처음 상태부터 시작한다.
function DrillItemView({ item, index, total, solved, onSolved, onNext }: ItemProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const judge = (result: RunResult, line: string): NewLogEntry[] => {
    if (!line || solved || !item.isDone({ state: result.state, result })) return [];
    onSolved();
    return [{ kind: 'pass', text: `채점: 정답 · 문제 ${index + 1} 의 조건을 모두 채웠어요` }];
  };
  const { sim, log, input, setInput, inputRef, onKeyDown, putInTerminal, reset } = useShell({
    initial: () => drillInitialState(item),
    banner: BANNER,
    onResult: judge,
  });
  const me = accountByUid(sim, session(sim).uid);
  const reveal = showAnswer || solved;

  return (
    <>
      <div className="px-4 pb-4 pt-3 sm:px-5">
        <div className="rounded-lg border border-border bg-bg-elevated px-4 py-3.5">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-muted">
            문제 {index + 1} / {total}
            {solved && (
              <span className="inline-flex items-center gap-1 text-accent">
                <Check className="h-3.5 w-3.5" aria-hidden /> 정답
              </span>
            )}
          </div>
          <div className="mt-1 text-[15.5px] font-semibold text-fg">{item.title}</div>
          <p className="mt-2 text-[14.5px] leading-relaxed text-fg">{item.prompt}</p>
          {item.conditions.length > 0 && (
            <div className="mt-2.5 text-[13.5px] leading-relaxed text-fg-muted">
              <div className="font-medium text-fg">[조건]</div>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
                {item.conditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {!reveal && (
            <button type="button" onClick={() => setShowAnswer(true)} className={SMALL_BUTTON}>
              모범 답안 보기
            </button>
          )}
          <button type="button" onClick={reset} className={SMALL_BUTTON}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> 이 문제 처음부터
          </button>
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              className={cn(SMALL_BUTTON, solved && 'border-accent text-accent hover:border-accent hover:text-accent')}
            >
              다음 문제 <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>

        {reveal && (
          <div className="mt-3 space-y-2">
            {item.answer.split('\n').map((line) => (
              <div key={line} className="flex items-start gap-2 rounded-md bg-code-bg px-2.5 py-2">
                <span className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-fg">{line}</span>
                {!solved && (
                  <button
                    type="button"
                    onClick={() => putInTerminal(line)}
                    className="shrink-0 rounded border border-border-strong px-1.5 text-[11.5px] leading-5 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    입력창에 넣기
                  </button>
                )}
              </div>
            ))}
            <p className="text-[13.5px] leading-relaxed text-fg-muted">{item.explain}</p>
          </div>
        )}
      </div>

      <LabTerminal
        cwd={session(sim).cwd}
        headerRight={<span className="rounded-sm bg-[#5eead4]/10 px-1.5 text-[#5eead4]">{me?.name ?? 'root'}</span>}
        prompt={prompt(sim)}
        task={{
          label: `문제 ${index + 1} / ${total} · ${item.title}`,
          // 모바일에서는 키보드가 지문 카드를 가리므로 조건까지 터미널 위 띠에 붙인다.
          text: [item.prompt, ...item.conditions.map((c) => `· ${c}`)].join('\n'),
        }}
        inputLabel="리눅스 명령 입력"
        placeholder="조건에 맞게 명령을 쳐 보세요 · Tab 자동 완성"
        log={log}
        input={input}
        onInput={setInput}
        onKeyDown={onKeyDown}
        inputRef={inputRef}
      />
    </>
  );
}

// 작업형 실기 문제 묶음. 위 번호 줄에서 문제를 고르고, 맞힌 문제에는 체크가 남는다.
export function ShellDrill({ drillId }: { drillId: string }) {
  const drill = SHELL_DRILLS.find((d) => d.id === drillId) ?? SHELL_DRILLS[0];
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState<string[]>([]);
  const item = drill.items[index];

  return (
    <section
      aria-label={`${drill.code} ${drill.title}`}
      className="not-prose my-10 overflow-hidden rounded-xl border border-border-strong bg-bg shadow-[0_1px_0_var(--border),0_12px_32px_-18px_rgba(15,118,110,0.35)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]">
            <span className="rounded-[3px] bg-fg px-1.5 py-0.5 text-bg">{drill.code}</span>
            <span className="text-fg-muted">작업형 실기</span>
          </div>
          <div className="mt-2 text-[1.15rem] font-bold leading-snug tracking-[-0.01em] text-fg">{drill.title}</div>
          <div className="mt-0.5 text-[12.5px] text-fg-faint">
            {solved.length} / {drill.items.length} 문제 정답
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11.5px] text-fg-muted">
          <TerminalSquare className="h-3.5 w-3.5" aria-hidden />
          Rocky Linux 8.8 시뮬레이터
        </div>
      </div>

      <nav className="flex flex-wrap gap-1.5 px-4 sm:px-5" aria-label="문제 고르기">
        {drill.items.map((it, i) => {
          const done = solved.includes(it.id);
          return (
            <button
              key={it.id}
              type="button"
              aria-current={i === index ? 'step' : undefined}
              aria-label={`문제 ${i + 1}${done ? ' 정답' : ''}: ${it.title}`}
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

      <DrillItemView
        key={item.id}
        item={item}
        index={index}
        total={drill.items.length}
        solved={solved.includes(item.id)}
        onSolved={() => setSolved((s) => (s.includes(item.id) ? s : [...s, item.id]))}
        onNext={index + 1 < drill.items.length ? () => setIndex(index + 1) : undefined}
      />
    </section>
  );
}
