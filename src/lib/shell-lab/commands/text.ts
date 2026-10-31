// 내용 보기: cat head tail wc echo.
import { FsError, can, node, readText, resolve, sizeOf } from '../fs';
import { BINARY_SIZE } from '../state';
import type { Inode } from '../types';
import { errText, getopt, isExit, q, type Command, type Ctx } from './context';

type Read = { ok: true; text: string; node: Inode } | { ok: false; error: unknown; isDir?: boolean };

/** 파일을 읽는다. 디렉터리면 EISDIR, 읽기 권한이 없으면 EACCES. */
export function readFile(ctx: Ctx, path: string): Read {
  const { st } = ctx;
  try {
    const n = node(st, resolve(st, path, true).ino);
    if (n.type === 'dir') return { ok: false, error: new FsError('EISDIR'), isDir: true };
    if (!can(st, n, 'r')) throw new FsError('EACCES');
    const name = path.split('/').pop() ?? '';
    if (n.content === undefined && !n.generated && BINARY_SIZE[name] !== undefined) {
      ctx.io.note(`${path} 는 실행 파일이에요. 연습장에서는 바이너리 내용을 보여 주지 않아요.`);
      return { ok: true, text: '', node: n };
    }
    return { ok: true, text: readText(st, n), node: n };
  } catch (error) {
    return { ok: false, error };
  }
}

/** 줄 단위로 자르되 줄 끝 \n 은 남긴다. */
const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

export const cat: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'nAE' });
  if (isExit(p)) return p.exit;
  const { io } = ctx;
  const files = p.operands.length ? p.operands : ['-'];
  let out = '';
  let exit = 0;
  for (const f of files) {
    if (f === '-') {
      out += ctx.io.stdin;
      continue;
    }
    const r = readFile(ctx, f);
    if (!r.ok) {
      io.err(`cat: ${f}: ${errText(r.error)}\n`);
      exit = 1;
      continue;
    }
    out += r.text;
  }
  if (p.flags.n) {
    out = lines(out).map((l, i) => `${String(i + 1).padStart(6, ' ')}\t${l}`).join('');
  }
  io.out(out);
  return exit;
};

/** head -5 처럼 숫자만 쓴 옛 문법을 -n 5 로 바꾼다. */
function normalizeCount(args: string[]): string[] {
  return args.flatMap((a) => (/^-\d+$/.test(a) ? ['-n', a.slice(1)] : [a]));
}

function headTail(which: 'head' | 'tail'): Command {
  return (ctx) => {
    const p = getopt({ ...ctx, args: normalizeCount(ctx.args) }, { flags: 'qvf', values: 'n' });
    if (isExit(p)) return p.exit;
    const { io } = ctx;
    if (p.flags.f) io.note('tail -f(계속 지켜보기)는 연습장에서 지원하지 않아요. 지금 내용만 한 번 보여 줘요.');
    const raw = p.values.n ?? '10';
    const fromStart = which === 'tail' && raw.startsWith('+');
    const count = Number(raw.replace(/^[+-]/, ''));
    if (!Number.isInteger(count)) {
      io.err(`${which}: invalid number of lines: ${q(raw)}\n`);
      return 1;
    }
    const files = p.operands.length ? p.operands : ['-'];
    const headers = files.length > 1 && !p.flags.q;
    let first = true;
    let exit = 0;
    for (const f of files) {
      let text: string;
      if (f === '-') text = io.stdin;
      else {
        const r = readFile(ctx, f);
        if (!r.ok) {
          io.err(
            r.isDir
              ? `${which}: error reading ${q(f)}: Is a directory\n`
              : `${which}: cannot open ${q(f)} for reading: ${errText(r.error)}\n`,
          );
          exit = 1;
          continue;
        }
        text = r.text;
      }
      if (headers) io.out(`${first ? '' : '\n'}==> ${f === '-' ? 'standard input' : f} <==\n`);
      first = false;
      const all = lines(text);
      const picked =
        which === 'head' ? all.slice(0, count) : fromStart ? all.slice(Math.max(count - 1, 0)) : all.slice(Math.max(all.length - count, 0));
      io.out(picked.join(''));
    }
    return exit;
  };
}

export const head = headTail('head');
export const tail = headTail('tail');

interface Counts {
  lines: number;
  words: number;
  bytes: number;
}

const count = (text: string): Counts => ({
  lines: (text.match(/\n/g) ?? []).length,
  words: text.split(/\s+/).filter(Boolean).length,
  bytes: new TextEncoder().encode(text).length,
});

export const wc: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'lwcm' });
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const f = p.flags;
  const pick = f.l || f.w || f.c || f.m ? { l: !!f.l, w: !!f.w, c: !!(f.c || f.m) } : { l: true, w: true, c: true };
  const files = p.operands.length ? p.operands : ['-'];
  const shown = Number(pick.l) + Number(pick.w) + Number(pick.c);

  // 칸 너비: 일반 파일 크기 합의 자릿수, 표준 입력·디렉터리가 섞이면 최소 7 (wc.c compute_number_width)
  let width = 1;
  if (!(files.length === 1 && shown === 1)) {
    let minimum = 1;
    let total = 0;
    for (const file of files) {
      if (file === '-') {
        minimum = 7;
        continue;
      }
      try {
        const n = node(st, resolve(st, file, true).ino);
        if (n.type === 'file') total += sizeOf(st, n, file.split('/').pop());
        else minimum = 7;
      } catch {
        // 없는 파일은 너비 계산에서 뺀다
      }
    }
    width = Math.max(String(total).length, minimum);
  }
  const fmt = (c: Counts, name?: string) => {
    const parts: string[] = [];
    if (pick.l) parts.push(String(c.lines).padStart(width, ' '));
    if (pick.w) parts.push(String(c.words).padStart(width, ' '));
    if (pick.c) parts.push(String(c.bytes).padStart(width, ' '));
    return `${parts.join(' ')}${name ? ` ${name}` : ''}\n`;
  };
  const total: Counts = { lines: 0, words: 0, bytes: 0 };
  let exit = 0;
  for (const file of files) {
    let c: Counts;
    if (file === '-') c = count(io.stdin);
    else {
      const r = readFile(ctx, file);
      if (!r.ok) {
        io.err(`wc: ${file}: ${errText(r.error)}\n`);
        exit = 1;
        if (!r.isDir) continue;
        c = { lines: 0, words: 0, bytes: 0 };
      } else c = count(r.text);
    }
    total.lines += c.lines;
    total.words += c.words;
    total.bytes += c.bytes;
    io.out(fmt(c, file === '-' ? undefined : file));
  }
  if (files.length > 1) io.out(fmt(total, 'total'));
  return exit;
};

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', '\\': '\\', a: '\u0007', b: '\b', r: '\r', v: '\v', f: '\f' };

export const echo: Command = ({ args, io }) => {
  let i = 0;
  let newline = true;
  let escapes = false;
  while (i < args.length && /^-[neE]+$/.test(args[i])) {
    for (const c of args[i].slice(1)) {
      if (c === 'n') newline = false;
      else if (c === 'e') escapes = true;
      else escapes = false;
    }
    i++;
  }
  let text = args.slice(i).join(' ');
  if (escapes) text = text.replace(/\\([ntabrvf\\])/g, (_, c: string) => ESCAPES[c]);
  io.out(newline ? `${text}\n` : text);
  return 0;
};
