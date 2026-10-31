// 찾기: find, grep. 실제 find·grep -r 는 디렉터리를 디스크에 적힌 순서로 돌지만, 연습장은 이름순으로 돈다.
import { can, node, readText, resolve, sizeOf } from '../fs';
import { applyMode, parseMode } from '../mode';
import { accountByName, accountByUid, groupByGid, groupByName } from '../state';
import type { Inode, ShellState } from '../types';
import { errText, getopt, isExit, q, type Command } from './context';

// ───────────── find ─────────────

interface Visit {
  path: string;
  n: Inode;
  depth: number;
}

type Expr =
  | { kind: 'and' | 'or'; left: Expr; right: Expr }
  | { kind: 'not'; expr: Expr }
  | { kind: 'test'; test: (v: Visit) => boolean }
  | { kind: 'exec'; argv: string[]; batch: boolean }
  | { kind: 'print' };

class FindError extends Error {}

const UNSUPPORTED_PREDICATES = ['-delete', '-ls', '-fls', '-printf', '-fprintf', '-regex', '-iregex', '-ok', '-execdir', '-prune', '-quit'];

function numericTest(arg: string, value: () => number, scale: (v: number) => number) {
  const m = /^([+-]?)(\d+)$/.exec(arg);
  if (!m) throw new FindError(`find: invalid argument ${q(arg)}`);
  const n = Number(m[2]);
  return () => {
    const v = scale(value());
    return m[1] === '+' ? v > n : m[1] === '-' ? v < n : v === n;
  };
}

interface FindParse {
  expr: Expr | null;
  hasAction: boolean;
  maxDepth: number;
  minDepth: number;
  batches: { expr: Extract<Expr, { kind: 'exec' }>; paths: string[] }[];
}

function parseFind(st: ShellState, tokens: string[]): FindParse {
  let i = 0;
  const out: FindParse = { expr: null, hasAction: false, maxDepth: Infinity, minDepth: 0, batches: [] };
  const need = (name: string) => {
    const v = tokens[++i];
    if (v === undefined) throw new FindError(`find: missing argument to \`${name}'`);
    return v;
  };
  const primary = (): Expr => {
    const t = tokens[i];
    if (t === '(') {
      i++;
      const e = orExpr();
      if (tokens[i] !== ')') throw new FindError("find: invalid expression; you have used a binary operator '(' with nothing before it.");
      i++;
      return e;
    }
    if (t === '!' || t === '-not') {
      i++;
      return { kind: 'not', expr: primary() };
    }
    const test = (fn: (v: Visit) => boolean): Expr => {
      i++;
      return { kind: 'test', test: fn };
    };
    switch (t) {
      case '-name':
      case '-iname': {
        const pat = need(t);
        const re = globRegExp(pat, t === '-iname');
        return test((v) => re.test(v.path === '/' ? '/' : v.path.replace(/\/+$/, '').split('/').pop()!));
      }
      case '-type': {
        const c = need(t);
        const map: Record<string, Inode['type']> = { f: 'file', d: 'dir', l: 'link', c: 'chr' };
        if (!/^[fdlcbps]$/.test(c)) throw new FindError(`find: Unknown argument to -type: ${c}`);
        return test((v) => v.n.type === map[c]);
      }
      case '-perm': {
        const raw = need(t);
        const prefix = raw[0] === '-' || raw[0] === '/' ? raw[0] : '';
        const spec = parseMode(raw.slice(prefix.length));
        if (!spec) throw new FindError(`find: invalid mode ${q(raw.slice(prefix.length))}`);
        const want = applyMode(spec, 0, false, 0);
        return test((v) => {
          const m = v.n.mode & 0o7777;
          if (prefix === '-') return (m & want) === want;
          if (prefix === '/') return want === 0 || (m & want) !== 0;
          return m === want;
        });
      }
      case '-user': {
        const name = need(t);
        const a = accountByName(st, name);
        const id = a?.uid ?? (/^\d+$/.test(name) ? Number(name) : undefined);
        if (id === undefined) throw new FindError(`find: ${q(name)} is not the name of a known user`);
        return test((v) => v.n.uid === id);
      }
      case '-group': {
        const name = need(t);
        const g = groupByName(st, name);
        const id = g?.gid ?? (/^\d+$/.test(name) ? Number(name) : undefined);
        if (id === undefined) throw new FindError(`find: ${q(name)} is not the name of an existing group`);
        return test((v) => v.n.gid === id);
      }
      case '-nouser':
        return test((v) => !accountByUid(st, v.n.uid));
      case '-nogroup':
        return test((v) => !groupByGid(st, v.n.gid));
      case '-empty':
        return test((v) => (v.n.type === 'dir' ? Object.keys(v.n.entries!).length === 0 : v.n.type === 'file' && sizeOf(st, v.n) === 0));
      case '-size': {
        const raw = need(t);
        const m = /^([+-]?\d+)([bcwkMG]?)$/.exec(raw);
        if (!m) throw new FindError(`find: invalid -size type ${q(raw)}`);
        const unit = { b: 512, c: 1, w: 2, k: 1024, M: 1024 ** 2, G: 1024 ** 3, '': 512 }[m[2]]!;
        let current: Visit;
        const check = numericTest(m[1], () => sizeOf(st, current.n, current.path.split('/').pop()), (b) => Math.ceil(b / unit));
        return test((v) => {
          current = v;
          return check();
        });
      }
      case '-mtime':
      case '-mmin': {
        const raw = need(t);
        const unit = t === '-mtime' ? 86400 : 60;
        let current: Visit;
        const check = numericTest(raw, () => st.clock - current.n.mtime, (s) => Math.floor(s / unit));
        return test((v) => {
          current = v;
          return check();
        });
      }
      case '-newer': {
        const ref = need(t);
        let refNode: Inode;
        try {
          refNode = node(st, resolve(st, ref, true).ino);
        } catch (e) {
          throw new FindError(`find: ${q(ref)}: ${errText(e)}`);
        }
        return test((v) => v.n.mtime > refNode.mtime);
      }
      case '-maxdepth':
      case '-mindepth': {
        const n = Number(need(t));
        if (t === '-maxdepth') out.maxDepth = n;
        else out.minDepth = n;
        i++;
        return { kind: 'test', test: () => true };
      }
      case '-print':
        out.hasAction = true;
        i++;
        return { kind: 'print' };
      case '-exec': {
        const argv: string[] = [];
        i++;
        while (i < tokens.length && tokens[i] !== ';' && !(tokens[i] === '+' && tokens[i - 1] === '{}')) argv.push(tokens[i++]);
        if (i >= tokens.length || argv.length === 0) throw new FindError("find: missing argument to `-exec'");
        const batch = tokens[i] === '+';
        i++;
        out.hasAction = true;
        const e: Extract<Expr, { kind: 'exec' }> = { kind: 'exec', argv, batch };
        if (batch) out.batches.push({ expr: e, paths: [] });
        return e;
      }
      default:
        if (UNSUPPORTED_PREDICATES.includes(t)) throw new FindError(`unsupported:${t}`);
        if (t?.startsWith('-')) throw new FindError(`find: unknown predicate \`${t}'`);
        throw new FindError(`find: paths must precede expression: ${q(t)}`);
    }
  };
  const andExpr = (): Expr => {
    let left = primary();
    while (i < tokens.length && tokens[i] !== ')' && tokens[i] !== '-o' && tokens[i] !== '-or') {
      if (tokens[i] === '-a' || tokens[i] === '-and') i++;
      left = { kind: 'and', left, right: primary() };
    }
    return left;
  };
  const orExpr = (): Expr => {
    let left = andExpr();
    while (tokens[i] === '-o' || tokens[i] === '-or') {
      i++;
      left = { kind: 'or', left, right: andExpr() };
    }
    return left;
  };
  if (tokens.length) out.expr = orExpr();
  if (i < tokens.length) throw new FindError(`find: paths must precede expression: ${q(tokens[i])}`);
  return out;
}

export function globRegExp(pattern: string, ignoreCase = false): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (c === '[') {
      const end = pattern.indexOf(']', i + 2);
      if (end < 0) re += '\\[';
      else {
        const body = pattern.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\');
        re += `[${body}]`;
        i = end;
      }
    } else if (c === '\\' && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  try {
    return new RegExp(`^${re}$`, ignoreCase ? 'is' : 's');
  } catch {
    // [z-a] 처럼 잘못된 범위는 글자 그대로 비교한다
    return new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, ignoreCase ? 'is' : 's');
  }
}

export const find: Command = (ctx) => {
  const { st, io, args } = ctx;
  const firstExpr = args.findIndex((a) => a.startsWith('-') || a === '(' || a === '!');
  const paths = firstExpr < 0 ? args : args.slice(0, firstExpr);
  const tokens = firstExpr < 0 ? [] : args.slice(firstExpr);
  let parsed: FindParse;
  try {
    parsed = parseFind(st, tokens);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith('unsupported:')) {
      io.note(`find 의 ${msg.slice(12)} 조건은 연습장에서 아직 지원하지 않아요. -name -type -perm -user -group -size -mtime -empty -exec 를 쓸 수 있어요.`);
      return 1;
    }
    io.err(`${msg}\n`);
    return 1;
  }
  let exit = 0;
  const run = (expr: Expr, v: Visit): boolean => {
    switch (expr.kind) {
      case 'and':
        return run(expr.left, v) && run(expr.right, v);
      case 'or':
        return run(expr.left, v) || run(expr.right, v);
      case 'not':
        return !run(expr.expr, v);
      case 'test':
        return expr.test(v);
      case 'print':
        io.out(`${v.path}\n`);
        return true;
      case 'exec': {
        if (expr.batch) {
          parsed.batches.find((b) => b.expr === expr)!.paths.push(v.path);
          return true;
        }
        return ctx.exec(expr.argv.map((a) => a.replaceAll('{}', v.path)), io) === 0;
      }
    }
  };
  const visit = (v: Visit) => {
    if (v.depth >= parsed.minDepth) {
      const matched = parsed.expr ? run(parsed.expr, v) : true;
      if (matched && !parsed.hasAction) io.out(`${v.path}\n`);
    }
    if (v.n.type !== 'dir' || v.depth >= parsed.maxDepth) return;
    if (!can(st, v.n, 'r') || !can(st, v.n, 'x')) {
      io.err(`find: ${q(v.path)}: Permission denied\n`);
      exit = 1;
      return;
    }
    for (const name of Object.keys(v.n.entries!).sort()) {
      const child = node(st, v.n.entries![name]);
      visit({ path: v.path.endsWith('/') ? `${v.path}${name}` : `${v.path}/${name}`, n: child, depth: v.depth + 1 });
    }
  };
  for (const path of paths.length ? paths : ['.']) {
    try {
      visit({ path, n: node(st, resolve(st, path, false).ino), depth: 0 });
    } catch (e) {
      io.err(`find: ${q(path)}: ${errText(e)}\n`);
      exit = 1;
    }
  }
  for (const b of parsed.batches) {
    if (!b.paths.length) continue;
    const at = b.expr.argv.indexOf('{}');
    ctx.exec([...b.expr.argv.slice(0, at), ...b.paths, ...b.expr.argv.slice(at + 1)], io);
  }
  return exit;
};

// ───────────── grep ─────────────

const POSIX_CLASS: Record<string, string> = {
  alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v',
  blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f',
};

/** [ 에서 시작한 괄호 식이 끝나는 ] 위치. [:digit:] 같은 클래스 안의 ] 는 건너뛴다. */
function bracketEnd(pattern: string, start: number): number {
  let j = start + 1;
  if (pattern[j] === '^') j++;
  if (pattern[j] === ']') j++;
  for (; j < pattern.length; j++) {
    if (pattern[j] === '[' && pattern[j + 1] === ':') {
      const close = pattern.indexOf(':]', j + 2);
      if (close < 0) return -1;
      j = close + 1;
    } else if (pattern[j] === ']') return j;
  }
  return -1;
}

/** grep 의 기본 정규식(BRE)·확장 정규식(ERE)을 자바스크립트 정규식으로 옮긴다. */
export function toRegExpSource(pattern: string, extended: boolean): string {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '[') {
      const end = bracketEnd(pattern, i);
      if (end < 0) throw new Error('Unmatched [, [^, [:, [., or [=');
      const body = pattern.slice(i + 1, end);
      out += `[${body.replace(/\[:(\w+):\]/g, (_, n: string) => POSIX_CLASS[n] ?? '').replace(/\\/g, '\\\\')}]`;
      i = end;
      continue;
    }
    if (c === '\\') {
      const d = pattern[++i];
      if (d === undefined) throw new Error('Trailing backslash');
      if (d === '<' || d === '>') out += '\\b';
      else if (!extended && '(){}|+?'.includes(d)) out += d;
      else if ('wWsSb'.includes(d)) out += `\\${d}`;
      else out += `\\${d}`.replace(/^\\([A-Za-z0-9])$/, '$1');
      continue;
    }
    if (!extended && '(){}|+?'.includes(c)) {
      out += `\\${c}`;
      continue;
    }
    if (c === '*' && (out === '' || out === '^')) {
      out += '\\*';
      continue;
    }
    out += c;
  }
  return out;
}

export const grep: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'ivncrRlLwEFhHqsox', values: 'e' }, 2);
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const f = p.flags;
  const ops = [...p.operands];
  const pattern = p.values.e ?? ops.shift();
  if (pattern === undefined) {
    io.err(`Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n`);
    return 2;
  }
  let re: RegExp;
  try {
    let src = f.F ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : toRegExpSource(pattern, !!f.E);
    if (f.w) src = `(?<![A-Za-z0-9_])(?:${src})(?![A-Za-z0-9_])`;
    if (f.x) src = `^(?:${src})$`;
    re = new RegExp(src, f.i ? 'gi' : 'g');
  } catch (e) {
    io.err(`grep: ${(e as Error).message.startsWith('Unmatched') ? (e as Error).message : 'Invalid regular expression'}\n`);
    return 2;
  }
  const recursive = !!(f.r || f.R);
  let files: string[] = ops;
  let stripDot = false;
  if (!files.length && recursive) {
    files = ['.'];
    stripDot = true;
  }
  const useStdin = files.length === 0;
  const showName = !f.h && (!!f.H || recursive || files.length > 1);
  let matchedAny = false;
  let error = false;
  const fail = (msg: string) => {
    error = true;
    if (!f.s) io.err(`grep: ${msg}\n`);
  };
  const searchText = (text: string, name: string) => {
    const lines = text.split('\n');
    if (text.endsWith('\n')) lines.pop();
    let count = 0;
    const prefix = showName ? `${name}:` : '';
    for (let n = 0; n < lines.length; n++) {
      re.lastIndex = 0;
      const hit = re.test(lines[n]) !== !!f.v;
      if (!hit) continue;
      count++;
      if (f.q || f.l || f.L || f.c) continue;
      if (f.o && !f.v) {
        re.lastIndex = 0;
        for (const m of lines[n].matchAll(re)) io.out(`${prefix}${f.n ? `${n + 1}:` : ''}${m[0]}\n`);
      } else io.out(`${prefix}${f.n ? `${n + 1}:` : ''}${lines[n]}\n`);
    }
    if (count) matchedAny = true;
    if (f.q) return;
    if (f.c) io.out(`${prefix}${count}\n`);
    if (f.l && count) io.out(`${name}\n`);
    if (f.L && !count) io.out(`${name}\n`);
  };
  // ancestors: 지금 경로에 있는 디렉터리 inode. -R 이 심볼릭 링크로 되돌아오면 실제 grep 처럼 경고하고 건너뛴다.
  const walk = (path: string, n: Inode, ancestors: number[]) => {
    const shown = stripDot ? path.replace(/^\.\//, '') : path;
    if (n.type === 'dir') {
      if (!recursive) return fail(`${path}: Is a directory`);
      if (ancestors.includes(n.ino)) {
        if (!f.s) io.err(`grep: warning: ${shown}: recursive directory loop\n`);
        return;
      }
      if (!can(st, n, 'r') || !can(st, n, 'x')) return fail(`${path}: Permission denied`);
      for (const name of Object.keys(n.entries!).sort()) {
        const child = node(st, n.entries![name]);
        if (child.type === 'link' && !f.R) continue;
        let target = child;
        if (child.type === 'link') {
          try {
            target = node(st, resolve(st, `${path}/${name}`, true).ino);
          } catch {
            continue;
          }
        }
        walk(path === '.' && stripDot ? `./${name}` : `${path}/${name}`, target, [...ancestors, n.ino]);
      }
      return;
    }
    if (n.type !== 'file') return;
    if (!can(st, n, 'r')) return fail(`${shown}: Permission denied`);
    searchText(readText(st, n), shown);
  };
  if (useStdin) searchText(io.stdin, '(standard input)');
  for (const file of files) {
    if (file === '-') {
      searchText(io.stdin, '(standard input)');
      continue;
    }
    let n: Inode;
    try {
      n = node(st, resolve(st, file, true).ino);
    } catch (e) {
      fail(`${file}: ${errText(e)}`);
      continue;
    }
    walk(file, n, []);
  }
  if (error && !(f.q && matchedAny)) return 2;
  return matchedAny ? 0 : 1;
};
