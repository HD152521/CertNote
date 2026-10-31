// 권한 비트: ls 의 -rwxr-xr-x 문자열, chmod 의 숫자·기호 모드 해석 (gnulib modechange 규칙).
import type { Inode } from './types';

const TYPE_CHAR: Record<Inode['type'], string> = { file: '-', dir: 'd', link: 'l', chr: 'c' };

export function modeString(n: Pick<Inode, 'type' | 'mode'>): string {
  const m = n.mode;
  const triplet = (shift: number, special: number, on: string, off: string) => {
    const r = m & (4 << shift) ? 'r' : '-';
    const w = m & (2 << shift) ? 'w' : '-';
    const x = m & (1 << shift);
    const s = m & special;
    return r + w + (s ? (x ? on : off) : x ? 'x' : '-');
  };
  return (
    TYPE_CHAR[n.type] +
    triplet(6, 0o4000, 's', 'S') +
    triplet(3, 0o2000, 's', 'S') +
    triplet(0, 0o1000, 't', 'T')
  );
}

interface Change {
  op: '+' | '-' | '=';
  /** 이 절이 건드리는 비트(누구에게) */
  affected: number;
  /** 정해진 who 가 없으면 umask 를 적용한다 */
  noWho: boolean;
  perms: string;
  /** u=g 처럼 다른 대상의 비트를 복사 */
  copyFrom?: 'u' | 'g' | 'o';
}

export type ModeSpec =
  | { kind: 'octal'; value: number; digits: number }
  | { kind: 'symbolic'; changes: Change[] };

const WHO_BITS: Record<string, number> = { u: 0o4700, g: 0o2070, o: 0o1007, a: 0o7777 };

export function parseMode(text: string): ModeSpec | null {
  if (/^[0-7]+$/.test(text)) {
    const value = parseInt(text, 8);
    if (value > 0o7777) return null;
    return { kind: 'octal', value, digits: text.length };
  }
  const changes: Change[] = [];
  for (const clause of text.split(',')) {
    const m = /^([ugoa]*)((?:[-+=](?:[rwxXst]*|[ugo]))+)$/.exec(clause);
    if (!m) return null;
    const who = m[1];
    const affected = who ? [...who].reduce((acc, c) => acc | WHO_BITS[c], 0) : 0o7777;
    for (const action of m[2].match(/[-+=](?:[rwxXst]*|[ugo])/g)!) {
      const op = action[0] as Change['op'];
      const rest = action.slice(1);
      const copy = /^[ugo]$/.test(rest) ? (rest as 'u' | 'g' | 'o') : undefined;
      changes.push({ op, affected, noWho: !who, perms: copy ? '' : rest, copyFrom: copy });
    }
  }
  return { kind: 'symbolic', changes };
}

function permBits(change: Change, current: number, isDir: boolean): number {
  if (change.copyFrom) {
    const shift = change.copyFrom === 'u' ? 6 : change.copyFrom === 'g' ? 3 : 0;
    const t = (current >> shift) & 7;
    return (t << 6) | (t << 3) | t;
  }
  let v = 0;
  for (const c of change.perms) {
    if (c === 'r') v |= 0o444;
    else if (c === 'w') v |= 0o222;
    else if (c === 'x') v |= 0o111;
    else if (c === 'X') v |= isDir || current & 0o111 ? 0o111 : 0;
    else if (c === 's') v |= 0o6000;
    else if (c === 't') v |= 0o1000;
  }
  return v;
}

/** 새 모드를 계산한다. 디렉터리의 setuid·setgid 는 직접 말하지 않으면 그대로 둔다(coreutils 8.30). */
export function applyMode(spec: ModeSpec, current: number, isDir: boolean, umask: number): number {
  if (spec.kind === 'octal') {
    const keep = isDir && spec.digits < 5 ? current & 0o6000 : 0;
    return spec.value | keep;
  }
  let mode = current & 0o7777;
  for (const change of spec.changes) {
    const mentionsSpecial = change.perms.includes('s');
    const omit = isDir && !mentionsSpecial ? 0o6000 : 0;
    let value = permBits(change, mode, isDir) & change.affected & ~omit;
    if (change.noWho) value &= ~umask;
    if (change.op === '+') mode |= value;
    else if (change.op === '-') mode &= ~value;
    else {
      const preserved = (change.noWho ? 0 : ~change.affected) | omit;
      mode = (mode & preserved) | value;
    }
  }
  return mode & 0o7777;
}

export const octal4 = (n: number) => n.toString(8).padStart(4, '0');
