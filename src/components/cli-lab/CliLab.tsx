'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { TerminalSquare } from 'lucide-react';
import { complete } from '@/lib/cli-lab/complete';
import { LABS, resolveAnswer } from '@/lib/cli-lab/labs';
import { runCommand } from '@/lib/cli-lab/run';
import { createInitialState, type SimState } from '@/lib/cli-lab/state';
import { AccountStrip } from './AccountStrip';
import { LabSteps } from './LabSteps';
import { LabTerminal, type LogEntry, type NewLogEntry } from './LabTerminal';

// 노트 본문(.article) 안에 들어가도 본문 규칙(p·ul·pre·code 여백과 배경)에 휘말리지 않도록
// 텍스트는 전부 div/span 으로 그린다.

const BANNER =
  'CertNote CLI 연습장 — 브라우저 안에서 도는 시뮬레이터예요. 실제 AWS 로 요청을 보내지 않아요.\n' +
  'aws help 명령 목록 · Tab 자동 완성 · ↑↓ 이전 명령 · clear 화면 정리 · reset 처음부터';

interface Progress {
  done: string[];
  commands: number;
  errors: number;
  lastPassed?: string;
}

const EMPTY_PROGRESS: Progress = { done: [], commands: 0, errors: 0 };

// 과제 정의에 판정 함수가 들어 있어 서버 컴포넌트에서 객체로 넘길 수 없다 — id 만 받고 여기서 찾는다.
export function CliLab({ labId }: { labId: string }) {
  const lab = LABS.find((l) => l.id === labId) ?? LABS[0];
  const nextId = useRef(1);
  const makeEntry = (entry: NewLogEntry): LogEntry => ({
    ...entry,
    id: nextId.current++,
  });

  const [sim, setSim] = useState<SimState>(() => createInitialState());
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
    setSim(createInitialState());
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

    const result = runCommand(line, sim);
    const entries: LogEntry[] = [makeEntry({ kind: 'cmd', text: line, exitCode: result.exitCode })];
    if (result.stdout) entries.push(makeEntry({ kind: 'out', text: result.stdout }));
    if (result.stderr) entries.push(makeEntry({ kind: 'err', text: result.stderr.replace(/^\n/, '') }));
    if (result.note) entries.push(makeEntry({ kind: 'note', text: result.note }));

    const passed = lab.steps.filter(
      (s) => !progress.done.includes(s.id) && s.isDone({ state: result.state, record: result.record, result }),
    );
    for (const s of passed) {
      const n = lab.steps.indexOf(s) + 1;
      entries.push(makeEntry({ kind: 'pass', text: `STEP ${n} 통과 · ${s.title}` }));
    }

    setSim(result.state);
    setLog((prev) => [...prev, ...entries]);
    if (trimmed) {
      setProgress((p) => ({
        done: [...p.done, ...passed.map((s) => s.id)],
        commands: p.commands + (result.record.service ? 1 : 0),
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
      const c = complete(input);
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

  const answerLines = shownStep ? resolveAnswer(shownStep.answer, sim).split('\n') : [];

  const putInTerminal = (line: string) => {
    setInput(line);
    inputRef.current?.focus();
  };

  return (
    <section
      aria-label={`${lab.code} ${lab.title}`}
      className="not-prose my-10 overflow-hidden rounded-xl border border-border-strong bg-bg shadow-[0_1px_0_var(--border),0_12px_32px_-18px_rgba(15,118,110,0.35)]"
    >
      {/* 머리: 과제 표찰 */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]">
            <span className="rounded-[3px] bg-fg px-1.5 py-0.5 text-bg">{lab.code}</span>
            <span className="text-fg-muted">{lab.service}</span>
          </div>
          <div className="mt-2 text-[1.15rem] font-bold leading-snug tracking-[-0.01em] text-fg">{lab.title}</div>
          <div className="mt-0.5 text-[12.5px] text-fg-faint">{lab.source}</div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11.5px] text-fg-muted">
          <TerminalSquare className="h-3.5 w-3.5" aria-hidden />
          시뮬레이터 · 실제 AWS 호출 없음
        </div>
      </div>

      <LabSteps
        steps={lab.steps}
        done={progress.done}
        current={currentStep}
        shown={shownStep}
        lastPassed={lastPassed}
        reveal={reveal}
        answerLines={answerLines}
        commands={progress.commands}
        errors={progress.errors}
        onView={setViewing}
        onReveal={setReveal}
        onPutInTerminal={putInTerminal}
        onReset={reset}
      />

      <LabTerminal
        cwd={`~/labs/${lab.id}`}
        region={sim.defaultRegion}
        accountId={sim.accountId}
        task={
          currentStep
            ? { label: `STEP ${lab.steps.indexOf(currentStep) + 1} / ${lab.steps.length} · ${currentStep.title}`, text: currentStep.task }
            : undefined
        }
        log={log}
        input={input}
        onInput={setInput}
        onKeyDown={onKeyDown}
        inputRef={inputRef}
      />
      <AccountStrip state={sim} />
    </section>
  );
}
