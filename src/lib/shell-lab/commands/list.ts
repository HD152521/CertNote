// ls, stat — 결과 확인에 가장 많이 쓰는 두 명령. 출력 모양은 골든 테스트로 실제 Rocky 8.8 과 맞춘다.
import { blocksOf, can, node, resolve, sizeOf } from '../fs';
import { columns, humanSize, lsDate, padLeft, padRight, statTime } from '../format';
import { modeString, octal4 } from '../mode';
import { groupName, userName } from '../state';
import type { Inode, ShellState } from '../types';
import { errText, getopt, isExit, q, type Command, type Ctx } from './context';

interface Entry {
  name: string;
  /** 권한이 없어 stat 하지 못한 항목은 undefined */
  n?: Inode;
}

interface LsOptions {
  long: boolean;
  oneLine: boolean;
  all: boolean;
  almostAll: boolean;
  inode: boolean;
  dirSelf: boolean;
  human: boolean;
  recursive: boolean;
  sortTime: boolean;
  sortSize: boolean;
  reverse: boolean;
}

function sortEntries(st: ShellState, entries: Entry[], o: LsOptions): Entry[] {
  const sizeOfEntry = (e: Entry) => (e.n ? sizeOf(st, e.n, e.name.split('/').pop()) : 0);
  const byName = (a: Entry, b: Entry) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const sorted = [...entries].sort((a, b) => {
    if (o.sortTime && a.n && b.n && a.n.mtime !== b.n.mtime) return b.n.mtime - a.n.mtime;
    if (o.sortSize && a.n && b.n) {
      const d = sizeOfEntry(b) - sizeOfEntry(a);
      if (d !== 0) return d;
    }
    return byName(a, b);
  });
  return o.reverse ? sorted.reverse() : sorted;
}

function longLines(st: ShellState, entries: Entry[], o: LsOptions): string[] {
  const rows = entries.map((e) => {
    if (!e.n) return { ino: '?', mode: '-?????????', nlink: '?', user: '?', group: '?', size: '?', date: '           ?', name: e.name };
    const n = e.n;
    const base = e.name.split('/').pop()!;
    const size = n.type === 'chr' ? n.rdev! : o.human ? humanSize(sizeOf(st, n, base)) : String(sizeOf(st, n, base));
    return {
      ino: String(n.ino),
      mode: modeString(n),
      nlink: String(n.nlink),
      user: userName(st, n.uid),
      group: groupName(st, n.gid),
      size,
      date: lsDate(n.mtime, st.clock, st.tzOffsetMin),
      name: n.type === 'link' ? `${e.name} -> ${n.target}` : e.name,
    };
  });
  const w = (k: 'ino' | 'nlink' | 'user' | 'group' | 'size') => Math.max(0, ...rows.map((r) => r[k].length));
  const wIno = w('ino');
  const wLink = w('nlink');
  const wUser = w('user');
  const wGroup = w('group');
  const wSize = w('size');
  return rows.map(
    (r) =>
      `${o.inode ? `${padLeft(r.ino, wIno)} ` : ''}${r.mode} ${padLeft(r.nlink, wLink)} ${padRight(r.user, wUser)} ` +
      `${padRight(r.group, wGroup)} ${padLeft(r.size, wSize)} ${r.date} ${r.name}`,
  );
}

function render(st: ShellState, entries: Entry[], o: LsOptions, tty: boolean): string {
  if (entries.length === 0) return '';
  if (o.long) return `${longLines(st, entries, o).join('\n')}\n`;
  const wIno = Math.max(...entries.map((e) => String(e.n?.ino ?? '?').length));
  const items = entries.map((e) => (o.inode ? `${padLeft(e.n?.ino ?? '?', wIno)} ${e.name}` : e.name));
  if (o.oneLine || !tty) return `${items.join('\n')}\n`;
  return columns(items);
}

function readDir(ctx: Ctx, path: string, n: Inode, o: LsOptions, report: (code: number) => void): Entry[] | null {
  const { st, io } = ctx;
  if (!can(st, n, 'r')) {
    io.err(`ls: cannot open directory ${q(path)}: Permission denied\n`);
    report(2);
    return null;
  }
  const names = Object.keys(n.entries!).filter((k) => o.all || o.almostAll || !k.startsWith('.'));
  const entries: Entry[] = names.map((name) => ({ name }));
  if (o.all) entries.push({ name: '.' }, { name: '..' });
  const searchable = can(st, n, 'x');
  const needStat = o.long || o.inode || o.sortTime || o.sortSize;
  for (const e of entries) {
    if (e.name === '.') e.n = n;
    else if (e.name === '..') e.n = node(st, n.parent!);
    else if (searchable || !needStat) e.n = node(st, n.entries![e.name]);
    else {
      io.err(`ls: cannot access ${q(`${path}/${e.name}`)}: Permission denied\n`);
      report(1);
    }
  }
  return sortEntries(st, entries, o);
}

function formatFlags(args: string[]): { long: boolean; oneLine: boolean } {
  let long = false;
  let oneLine = false;
  for (const a of args) {
    if (!a.startsWith('-') || a.startsWith('--')) continue;
    for (const c of a.slice(1)) {
      if (c === 'l') [long, oneLine] = [true, false];
      else if (c === '1') [long, oneLine] = [false, true];
      else if (c === 'C') [long, oneLine] = [false, false];
    }
  }
  return { long, oneLine };
}

export const ls: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'laAidhR1CtrSF' }, 2);
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const f = p.flags;
  const o: LsOptions = {
    ...formatFlags(ctx.args),
    all: !!f.a, almostAll: !!f.A, inode: !!f.i, dirSelf: !!f.d, human: !!f.h,
    recursive: !!f.R && !f.d, sortTime: !!f.t, sortSize: !!f.S, reverse: !!f.r,
  };
  let exit = 0;
  const report = (code: number) => {
    exit = Math.max(exit, code);
  };
  const operands = p.operands.length ? p.operands : ['.'];
  const files: Entry[] = [];
  const dirs: { path: string; n: Inode }[] = [];
  for (const path of operands) {
    let n: Inode;
    try {
      const lst = node(st, resolve(st, path, false).ino);
      n = lst;
      if (lst.type === 'link' && !o.dirSelf && !(o.long && !path.endsWith('/'))) {
        try {
          n = node(st, resolve(st, path, true).ino);
        } catch {
          n = lst;
        }
      }
    } catch (e) {
      io.err(`ls: cannot access ${q(path)}: ${errText(e)}\n`);
      report(2);
      continue;
    }
    if (n.type === 'dir' && !o.dirSelf) dirs.push({ path, n });
    else files.push({ name: path, n });
  }
  let out = render(st, sortEntries(st, files, o), o, io.stdoutTty);
  const showHeader = operands.length > 1 || o.recursive;
  let first = files.length === 0;
  const listDir = (path: string, n: Inode) => {
    const entries = readDir(ctx, path, n, o, report);
    if (!first) out += '\n';
    first = false;
    if (showHeader) out += `${path}:\n`;
    if (!entries) return;
    if (o.long) {
      const total = entries.reduce((sum, e) => sum + (e.n ? blocksOf(st, e.n, e.name) : 0), 0) / 2;
      out += `total ${o.human ? humanSize(total * 1024) : total}\n`;
    }
    out += render(st, entries, o, io.stdoutTty);
    if (!o.recursive) return;
    for (const e of entries) {
      if (!e.n || e.n.type !== 'dir' || e.name === '.' || e.name === '..') continue;
      listDir(path === '/' ? `/${e.name}` : `${path}/${e.name}`, e.n);
    }
  };
  for (const d of [...dirs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) listDir(d.path, d.n);
  io.out(out);
  return exit;
};

const FILE_TYPE: Record<Inode['type'], string> = {
  file: 'regular file',
  dir: 'directory',
  link: 'symbolic link',
  chr: 'character special file',
};

function fileType(st: ShellState, n: Inode, name: string): string {
  if (n.type === 'file' && sizeOf(st, n, name) === 0) return 'regular empty file';
  return FILE_TYPE[n.type];
}

// 가상 장치 번호. 실제 VM 의 루트(LVM)처럼 보이게 한 예시 값이다.
const DEVICE = 'fd00h/64768d';

function statFull(st: ShellState, path: string, n: Inode): string {
  const base = path.split('/').pop()!;
  const size = sizeOf(st, n, base);
  const t = (s: number) => statTime(s, st.tzOffsetMin);
  return (
    `  File: ${n.type === 'link' ? `${path} -> ${n.target}` : path}\n` +
    `  Size: ${padRight(size, 10)}\tBlocks: ${padRight(blocksOf(st, n, base), 10)} IO Block: ${padRight(4096, 6)} ${fileType(st, n, base)}\n` +
    `Device: ${DEVICE}\tInode: ${padRight(n.ino, 10)}  Links: ${n.nlink}${n.type === 'chr' ? `     Device type: ${n.rdev!.replace(', ', ',')}` : ''}\n` +
    `Access: (${octal4(n.mode)}/${modeString(n)})  Uid: (${padLeft(n.uid, 5)}/${padLeft(userName(st, n.uid), 8)})   Gid: (${padLeft(n.gid, 5)}/${padLeft(groupName(st, n.gid), 8)})\n` +
    `Access: ${t(n.atime)}\nModify: ${t(n.mtime)}\nChange: ${t(n.ctime)}\n Birth: ${t(n.btime ?? n.mtime)}\n`
  );
}

function statFormat(st: ShellState, fmt: string, path: string, n: Inode): string {
  const base = path.split('/').pop()!;
  return fmt.replace(/%(.)/g, (m, c: string) => {
    switch (c) {
      case 'a': return n.mode.toString(8);
      case 'A': return modeString(n);
      case 'b': return String(blocksOf(st, n, base));
      case 'F': return fileType(st, n, base);
      case 'g': return String(n.gid);
      case 'G': return groupName(st, n.gid);
      case 'h': return String(n.nlink);
      case 'i': return String(n.ino);
      case 'n': return path;
      case 'N': return n.type === 'link' ? `${q(path)} -> ${q(n.target!)}` : q(path);
      case 's': return String(sizeOf(st, n, base));
      case 'u': return String(n.uid);
      case 'U': return userName(st, n.uid);
      case 'x': return statTime(n.atime, st.tzOffsetMin);
      case 'y': return statTime(n.mtime, st.tzOffsetMin);
      case 'z': return statTime(n.ctime, st.tzOffsetMin);
      case 'X': return String(n.atime);
      case 'Y': return String(n.mtime);
      case 'Z': return String(n.ctime);
      case '%': return '%';
      default: return m;
    }
  });
}

export const stat: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'L', values: 'c' });
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  if (!p.operands.length) {
    io.err(`stat: missing operand\nTry 'stat --help' for more information.\n`);
    return 1;
  }
  let exit = 0;
  for (const path of p.operands) {
    try {
      const n = node(st, resolve(st, path, !!p.flags.L).ino);
      io.out(p.values.c !== undefined ? `${statFormat(st, p.values.c, path, n)}\n` : statFull(st, path, n));
    } catch (e) {
      io.err(`stat: cannot stat ${q(path)}: ${errText(e)}\n`);
      exit = 1;
    }
  }
  return exit;
};

