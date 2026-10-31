'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { TerminalSquare } from 'lucide-react';
import { LabSteps } from '@/components/cli-lab/LabSteps';
import { LabTerminal, type LogEntry, type NewLogEntry } from '@/components/cli-lab/LabTerminal';
import { complete } from '@/lib/shell-lab/complete';
import { SHELL_LABS, labInitialState } from '@/lib/shell-lab/labs';
import { prompt, runLine } from '@/lib/shell-lab/run';
import { accountByUid, session } from '@/lib/shell-lab/state';
import type { ShellState } from '@/lib/shell-lab/types';
import { WorkdirStrip } from './WorkdirStrip';

const BANNER =
  'CertNote 리눅스 셸 연습장 — 브라우저 안에서 도는 Rocky Linux 8.8 시뮬레이터예요. 실제 서버에 접속하지 않아요.\n' +
  'help 지원 명령 · Tab 자동 완성 · ↑↓ 이전 명령 · clear 화면 정리 · reset 처음부터';

interface Progress {
  done: string[];
  commands: number;
  errors: number;
  lastPassed?: string;
}

const EMPTY_PROGRESS: Progress = { done: [], commands: 0, errors: 0 };

// 과제 정의에 판정 함수가 들어 있어 서버 컴포넌트에서 객체로 넘길 수 없다 — id 만 받고 여기서 찾는다.
export function ShellLab({ labId }: { labId: string }) {
  const lab = SHELL_LABS.find((l) => l.id === labId) ?? SHELL_LABS[0];
  const nextId = useRef(1);
  const makeEntry = (entry: NewLogEntry): LogEntry => ({ ...entry, id: nextId.current++ });

  const [sim, setSim] = useState<ShellState>(() => labInitialState(lab));
  const [log, setLog] = useState<LogEntry[]>(() => [{ id: 0, kind: 'sys', text: BANNER }]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [viewing, setViewing] = useState<string | null>(null);
  const [reveal, setReveal] = useState<'hint' | 'answer' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentStep = lab.steps.find((s) => !progress.done.includes(s.id));
  const shownStep = lab.steps.find((s) => s.id === viewing) ?? currentStep;
  const lastPassed = lab.steps.find((s) => s.id === progress.lastPassed);

  const reset = () => {
    setSim(labInitialState(lab));
    setProgress(EMPTY_PROGRESS);
    setViewing(null);
    setReveal(null);
    setLog([makeEntry({ kind: 'sys', text: BANNER })]);
  };

  const execute = (line: string) => {
    const trimmed = line.trim();
    setInput('');
    setCursor(null);
    if (trimmed) setHistory((h) => (h[h.length - 1] === trimmed ? h : [...h, trimmed]));
    if (trimmed === 'clear') return setLog([]);
    if (trimmed === 'reset') return reset();

    let result: ReturnType<typeof runLine>;
    try {
      result = runLine(line, sim);
    } catch {
      // 시뮬레이터가 예상 못 한 입력에서 멈춰도 입력이 조용히 사라지지 않게 한다.
      setLog((prev) => [
        ...prev,
        makeEntry({ kind: 'cmd', text: line, exitCode: 1, prompt: prompt(sim) }),
        makeEntry({ kind: 'note', text: '연습장이 이 명령을 처리하지 못했어요. 다른 방식으로 써 보거나 reset 으로 처음부터 시작하세요.' }),
      ]);
      return;
    }
    const entries: LogEntry[] = [makeEntry({ kind: 'cmd', text: line, exitCode: result.exitCode, prompt: prompt(sim) })];
    if (result.stdout) entries.push(makeEntry({ kind: 'out', text: result.stdout.replace(/\n$/, '') }));
    if (result.stderr) entries.push(makeEntry({ kind: 'err', text: result.stderr.replace(/\n$/, '') }));
    if (result.note) entries.push(makeEntry({ kind: 'note', text: result.note }));

    const passed = lab.steps.filter((s) => !progress.done.includes(s.id) && s.isDone({ state: result.state, result }));
    for (const s of passed) entries.push(makeEntry({ kind: 'pass', text: `STEP ${lab.steps.indexOf(s) + 1} 통과 · ${s.title}` }));

    setSim(result.state);
    setLog((prev) => [...prev, ...entries]);
    if (trimmed) {
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
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      execute(input);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const c = complete(input, sim);
      setInput(c.line);
      if (c.candidates.length) setLog((prev) => [...prev, makeEntry({ kind: 'sys', text: c.candidates.join('   ') })]);
    } else if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault();
      const next = cursor === null ? history.length - 1 : Math.max(cursor - 1, 0);
      setCursor(next);
      setInput(history[next]);
    } else if (e.key === 'ArrowDown' && cursor !== null) {
      e.preventDefault();
      const next = cursor + 1;
      setCursor(next >= history.length ? null : next);
      setInput(next >= history.length ? '' : history[next]);
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLog([]);
    } else if (e.key === 'c' && e.ctrlKey && !window.getSelection()?.toString()) {
      e.preventDefault();
      setLog((prev) => [...prev, makeEntry({ kind: 'sys', text: `${input}^C` })]);
      setInput('');
    }
  };

  const putInTerminal = (line: string) => {
    setInput(line);
    inputRef.current?.focus();
  };

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
          Rocky Linux 8.8 시뮬레이터
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
            ? { label: `STEP ${lab.steps.indexOf(currentStep) + 1} / ${lab.steps.length} · ${currentStep.title}`, text: currentStep.task }
            : undefined
        }
        inputLabel="리눅스 명령 입력"
        placeholder="ls -l 처럼 쳐 보세요 · Tab 자동 완성"
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
