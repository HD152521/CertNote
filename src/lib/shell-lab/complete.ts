// Tab 자동 완성: 첫 단어는 명령 이름, 그 뒤는 파일 경로. 후보가 하나면 채우고, 여럿이면 공통 앞부분까지 채운 뒤 목록을 준다.
import { node, resolve } from './fs';
import { COMMANDS } from './run';
import type { ShellState } from './types';

export interface Completion {
  line: string;
  candidates: string[];
}

function commonPrefix(words: string[]): string {
  if (!words.length) return '';
  let p = words[0];
  for (const w of words) while (!w.startsWith(p)) p = p.slice(0, -1);
  return p;
}

function finish(line: string, start: number, typed: string, options: { text: string; suffix: string }[]): Completion {
  if (options.length === 0) return { line, candidates: [] };
  if (options.length === 1) return { line: line.slice(0, start) + options[0].text + options[0].suffix, candidates: [] };
  const prefix = commonPrefix(options.map((o) => o.text));
  return {
    line: line.slice(0, start) + (prefix.length > typed.length ? prefix : typed),
    candidates: options.map((o) => o.text.split('/').filter(Boolean).pop()! + (o.suffix === '/' ? '/' : '')),
  };
}

export function complete(line: string, st: ShellState): Completion {
  const start = Math.max(line.lastIndexOf(' '), line.lastIndexOf('|'), line.lastIndexOf(';')) + 1;
  const word = line.slice(start);
  const before = line.slice(0, start).trim();
  const isCommand = before === '' || /[|;&]$/.test(before);
  if (isCommand && !word.includes('/')) {
    const names = ['help', 'll', ...Object.keys(COMMANDS)].filter((n) => n.startsWith(word)).sort();
    return finish(line, start, word, names.map((n) => ({ text: n, suffix: ' ' })));
  }
  const slash = word.lastIndexOf('/');
  const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
  const namePart = word.slice(slash + 1);
  let dir;
  try {
    dir = node(st, resolve(st, dirPart || '.', true).ino);
  } catch {
    return { line, candidates: [] };
  }
  if (dir.type !== 'dir') return { line, candidates: [] };
  const names = Object.keys(dir.entries!)
    .filter((n) => n.startsWith(namePart) && (namePart.startsWith('.') || !n.startsWith('.')))
    .sort();
  return finish(
    line,
    start,
    word,
    names.map((n) => {
      let isDir = false;
      try {
        isDir = node(st, resolve(st, `${dirPart || './'}${n}`, true).ino).type === 'dir';
      } catch {
        // 깨진 링크는 파일처럼 다룬다
      }
      return { text: `${dirPart}${n}`, suffix: isDir ? '/' : ' ' };
    }),
  );
}
