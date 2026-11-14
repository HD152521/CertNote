'use client';

import { useState } from 'react';
import { TerminalSquare } from 'lucide-react';
import { LabSteps } from '@/components/cli-lab/LabSteps';
import { LabTerminal, type NewLogEntry } from '@/components/cli-lab/LabTerminal';
import { useLanguage } from '@/lib/i18n-client';
import { labInitialState } from '@/lib/shell-lab/labs';
import { shellLabsFor } from '@/lib/shell-lab/labsEn';
import { prompt } from '@/lib/shell-lab/run';
import { accountByUid, session } from '@/lib/shell-lab/state';
import type { RunResult } from '@/lib/shell-lab/types';
import { shellStrings } from './i18n';
import { useShell } from './useShell';
import { WorkdirStrip } from './WorkdirStrip';

interface Progress {
  done: string[];
  commands: number;
  errors: number;
  lastPassed?: string;
}

const EMPTY_PROGRESS: Progress = { done: [], commands: 0, errors: 0 };

// 과제 정의에 판정 함수가 들어 있어 서버 컴포넌트에서 객체로 넘길 수 없다 — id 만 받고 여기서 찾는다.
export function ShellLab({ labId }: { labId: string }) {
  const lang = useLanguage();
  const str = shellStrings(lang);
  const labs = shellLabsFor(lang);
  const lab = labs.find((l) => l.id === labId) ?? labs[0];
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [viewing, setViewing] = useState<string | null>(null);
  const [reveal, setReveal] = useState<'hint' | 'answer' | null>(null);

  const judge = (result: RunResult, line: string): NewLogEntry[] => {
    const passed = lab.steps.filter((s) => !progress.done.includes(s.id) && s.isDone({ state: result.state, result }));
    if (line) {
      setProgress((p) => ({
        done: [...p.done, ...passed.map((s) => s.id)],
        commands: p.commands + (result.commands.length ? 1 : 0),
        errors: p.errors + (result.exitCode !== 0 ? 1 : 0),
        lastPassed: passed.length ? passed[passed.length - 1].id : p.lastPassed,
      }));
    }
    if (passed.length) {
      setViewing(null);
      setReveal(null);
    }
    return passed.map((s) => ({ kind: 'pass', text: str.stepPassed(lab.steps.indexOf(s) + 1, s.title) }));
  };

  const { sim, log, input, setInput, inputRef, onKeyDown, putInTerminal, reset } = useShell({
    initial: () => labInitialState(lab),
    banner: str.labBanner,
    onResult: judge,
    onReset: () => {
      setProgress(EMPTY_PROGRESS);
      setViewing(null);
      setReveal(null);
    },
  });

  const currentStep = lab.steps.find((s) => !progress.done.includes(s.id));
  const shownStep = lab.steps.find((s) => s.id === viewing) ?? currentStep;
  const lastPassed = lab.steps.find((s) => s.id === progress.lastPassed);

  const me = accountByUid(sim, session(sim).uid);

  return (
    <section
      aria-label={`${lab.code} ${lab.title}`}
      className="not-prose my-10 overflow-hidden rounded-xl border border-border-strong bg-bg shadow-[0_1px_0_var(--border),0_12px_32px_-18px_rgba(15,118,110,0.35)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]">
            <span className="rounded-[3px] bg-fg px-1.5 py-0.5 text-bg">{lab.code}</span>
            <span className="text-fg-muted">{lab.topic}</span>
          </div>
          <div className="mt-2 text-[1.15rem] font-bold leading-snug tracking-[-0.01em] text-fg">{lab.title}</div>
          <div className="mt-0.5 text-[12.5px] text-fg-faint">{lab.source}</div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11.5px] text-fg-muted">
          <TerminalSquare className="h-3.5 w-3.5" aria-hidden />
          {str.simulator}
        </div>
      </div>

      <LabSteps
        steps={lab.steps}
        done={progress.done}
        current={currentStep}
        shown={shownStep}
        lastPassed={lastPassed}
        reveal={reveal}
        answerLines={shownStep ? shownStep.answer.split('\n') : []}
        commands={progress.commands}
        errors={progress.errors}
        onView={setViewing}
        onReveal={setReveal}
        onPutInTerminal={putInTerminal}
        onReset={reset}
      />

      <LabTerminal
        cwd={session(sim).cwd}
        headerRight={
          <span className="flex shrink-0 items-center gap-2">
            <span className="rounded-sm bg-[#5eead4]/10 px-1.5 text-[#5eead4]">{me?.name ?? 'root'}</span>
            <span className="hidden sm:inline">umask {session(sim).umask.toString(8).padStart(4, '0')}</span>
          </span>
        }
        prompt={prompt(sim)}
        task={
          currentStep
            ? { label: str.stepLabel(lab.steps.indexOf(currentStep) + 1, lab.steps.length, currentStep.title), text: currentStep.task }
            : undefined
        }
        inputLabel={str.inputLabel}
        placeholder={str.labPlaceholder}
        log={log}
        input={input}
        onInput={setInput}
        onKeyDown={onKeyDown}
        inputRef={inputRef}
      />
      <WorkdirStrip state={sim} watch={lab.watch ?? lab.workdir} />
    </section>
  );
}
