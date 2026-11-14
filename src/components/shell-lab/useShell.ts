'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import type { LogEntry, NewLogEntry } from '@/components/cli-lab/LabTerminal';
import { useLanguage } from '@/lib/i18n-client';
import { complete } from '@/lib/shell-lab/complete';
import { translateShellMessageEn } from '@/lib/shell-lab/messagesEn';
import { prompt, runLine } from '@/lib/shell-lab/run';
import type { RunResult, ShellState } from '@/lib/shell-lab/types';
import { shellStrings } from './i18n';

interface UseShellOptions {
  initial: () => ShellState;
  banner: string;
  /** 명령 한 줄을 실행한 뒤. 로그에 덧붙일 줄(통과 표시 등)을 돌려준다. */
  onResult?: (result: RunResult, line: string) => NewLogEntry[];
  /** reset 을 쳤거나 처음부터 버튼을 눌렀을 때 */
  onReset?: () => void;
}

// 셸 연습장 터미널의 공통 동작: 실행, 기록, Tab 완성, ↑↓ 이전 명령, clear·reset, Ctrl+L·Ctrl+C.
export function useShell({ initial, banner, onResult, onReset }: UseShellOptions) {
  const lang = useLanguage();
  const strings = shellStrings(lang);
  // 시뮬레이터가 직접 찍는 한국어 안내는 영어 화면에서 표시할 때 바꾼다(실제 명령 출력은 원래 영어).
  const localize = (text: string) => (lang === 'en' ? translateShellMessageEn(text) : text);
  const nextId = useRef(1);
  const makeEntry = (entry: NewLogEntry): LogEntry => ({ ...entry, id: nextId.current++ });

  const [sim, setSim] = useState<ShellState>(initial);
  const [log, setLog] = useState<LogEntry[]>(() => [{ id: 0, kind: 'sys', text: banner }]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setSim(initial());
    setLog([makeEntry({ kind: 'sys', text: banner })]);
    onReset?.();
  };

  const execute = (line: string) => {
    const trimmed = line.trim();
    setInput('');
    setCursor(null);
    if (trimmed) setHistory((h) => (h[h.length - 1] === trimmed ? h : [...h, trimmed]));
    if (trimmed === 'clear') return setLog([]);
    if (trimmed === 'reset') return reset();

    let result: RunResult;
    try {
      result = runLine(line, sim);
    } catch {
      // 시뮬레이터가 예상 못 한 입력에서 멈춰도 입력이 조용히 사라지지 않게 한다.
      setLog((prev) => [
        ...prev,
        makeEntry({ kind: 'cmd', text: line, exitCode: 1, prompt: prompt(sim) }),
        makeEntry({ kind: 'note', text: strings.engineFailure }),
      ]);
      return;
    }
    const entries: LogEntry[] = [makeEntry({ kind: 'cmd', text: line, exitCode: result.exitCode, prompt: prompt(sim) })];
    if (result.stdout) entries.push(makeEntry({ kind: 'out', text: result.stdout.replace(/\n$/, '') }));
    if (result.stderr) entries.push(makeEntry({ kind: 'err', text: localize(result.stderr.replace(/\n$/, '')) }));
    if (result.note) entries.push(makeEntry({ kind: 'note', text: localize(result.note) }));
    for (const extra of onResult?.(result, trimmed) ?? []) entries.push(makeEntry(extra));

    setSim(result.state);
    setLog((prev) => [...prev, ...entries]);
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

  return { sim, log, input, setInput, inputRef, onKeyDown, putInTerminal, reset };
}
