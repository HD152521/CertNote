// 파일·디렉터리 다루기: pwd cd mkdir rmdir touch cp mv rm ln.
import {
  FsError, addLink, can, canUnlinkFrom, entryOf, createNode, isAncestor, isRoot, moveName, node, removeTree, resolve,
  resolveParent, touchTimes, unlinkName,
} from '../fs';
import { applyMode, parseMode } from '../mode';
import { ROOT_INO, accountByUid, session } from '../state';
import type { Inode, ShellState } from '../types';
import { errText, errnoOf, getopt, isExit, missingOperand, q, type Command, type Ctx } from './context';

const basename = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p;
const joinPath = (dir: string, name: string) => (dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`);

/** bash 의 논리 경로: . 과 .. 을 글자로 정리한다 (cd 가 심볼릭 링크 경로를 그대로 두는 이유). */
export function logicalPath(cwd: string, arg: string): string {
  const parts = (arg.startsWith('/') ? arg : `${cwd}/${arg}`).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return `/${out.join('/')}`;
}

function lookup(st: ShellState, path: string, follow: boolean): Inode | null {
  try {
    return node(st, resolve(st, path, follow).ino);
  } catch {
    return null;
  }
}

export const pwd: Command = ({ st, io }) => {
  io.out(`${session(st).cwd}\n`);
  return 0;
};

export const cd: Command = ({ st, args, io }) => {
  const s = session(st);
  const home = accountByUid(st, s.uid)?.home ?? '/';
  let arg = args[0] ?? home;
  if (arg === '-') {
    if (!s.oldpwd) {
      io.err('-bash: cd: OLDPWD not set\n');
      return 1;
    }
    arg = s.oldpwd;
  }
  const target = logicalPath(s.cwd, arg);
  try {
    const n = node(st, resolve(st, target, true).ino);
    if (n.type !== 'dir') throw new FsError('ENOTDIR');
    if (!can(st, n, 'x')) throw new FsError('EACCES');
  } catch (e) {
    io.err(`-bash: cd: ${args[0] ?? home}: ${errText(e)}\n`);
    return 1;
  }
  if (args[0] === '-') io.out(`${target}\n`);
  s.oldpwd = s.cwd;
  s.cwd = target;
  return 0;
};

function makeDir(ctx: Ctx, path: string, mode: number): boolean {
  const { st, io } = ctx;
  try {
    const { dir, name } = resolveParent(st, path);
    const parent = node(st, dir);
    if (entryOf(parent, name) !== undefined || name === '.' || name === '..') throw new FsError('EEXIST');
    if (!can(st, parent, 'w')) throw new FsError('EACCES');
    createNode(st, dir, name, 'dir', mode);
    return true;
  } catch (e) {
    io.err(`mkdir: cannot create directory ${q(path)}: ${errText(e)}\n`);
    return false;
  }
}

export const mkdir: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'pv', values: 'm' });
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  if (!p.operands.length) return missingOperand(ctx);
  const umask = session(st).umask;
  let mode = 0o777 & ~umask;
  if (p.values.m !== undefined) {
    const spec = parseMode(p.values.m);
    if (!spec) {
      io.err(`mkdir: invalid mode ${q(p.values.m)}\n`);
      return 1;
    }
    mode = applyMode(spec, 0o777, true, umask);
  }
  let exit = 0;
  const created = (path: string) => p.flags.v && io.out(`mkdir: created directory ${q(path)}\n`);
  for (const path of p.operands) {
    if (!p.flags.p) {
      if (makeDir(ctx, path, mode)) created(path);
      else exit = 1;
      continue;
    }
    const parts = path.split('/').filter(Boolean);
    let prefix = path.startsWith('/') ? '' : '.';
    for (let i = 0; i < parts.length; i++) {
      prefix = prefix === '.' ? parts[i] : `${prefix}/${parts[i]}`;
      const existing = lookup(st, prefix, true);
      if (existing?.type === 'dir') continue;
      const last = i === parts.length - 1;
      // 중간 디렉터리는 umask 와 상관없이 u+wx 를 보장한다 (mkdir -p 규칙)
      if (!makeDir(ctx, prefix, last ? mode : (0o777 & ~umask) | 0o300)) {
        exit = 1;
        break;
      }
      created(prefix);
    }
  }
  return exit;
};

export const rmdir: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'pv' });
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  if (!p.operands.length) return missingOperand(ctx);
  let exit = 0;
  for (const path of p.operands) {
    try {
      const w = resolve(st, path, false);
      const n = node(st, w.ino);
      if (n.type !== 'dir') throw new FsError('ENOTDIR');
      if (Object.keys(n.entries!).length) throw new FsError('ENOTEMPTY');
      const denied = canUnlinkFrom(st, node(st, w.dir), n);
      if (denied) throw new FsError(denied);
      unlinkName(st, w.dir, w.name);
      if (p.flags.v) io.out(`rmdir: removing directory, ${q(path)}\n`);
    } catch (e) {
      io.err(`rmdir: failed to remove ${q(path)}: ${errText(e)}\n`);
      exit = 1;
    }
  }
  return exit;
};

export const touch: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'cam' });
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  if (!p.operands.length) {
    io.err(`touch: missing file operand\nTry 'touch --help' for more information.\n`);
    return 1;
  }
  let exit = 0;
  for (const path of p.operands) {
    try {
      const existing = lookup(st, path, true);
      if (existing) {
        if (!isRoot(st) && existing.uid !== session(st).uid && !can(st, existing, 'w')) throw new FsError('EACCES');
        touchTimes(st, existing, 'amc');
        continue;
      }
      if (p.flags.c) continue;
      const { dir, name } = resolveParent(st, path);
      if (!can(st, node(st, dir), 'w')) throw new FsError('EACCES');
      createNode(st, dir, name, 'file', 0o666 & ~session(st).umask, { content: '' });
    } catch (e) {
      io.err(`touch: cannot touch ${q(path)}: ${errText(e)}\n`);
      exit = 1;
    }
  }
  return exit;
};

interface CopyOpts {
  recursive: boolean;
  preserve: boolean;
  verbose: boolean;
}

function copyInto(ctx: Ctx, src: string, srcNode: Inode, dst: string, o: CopyOpts): boolean {
  const { st, io } = ctx;
  const umask = session(st).umask;
  const existing = lookup(st, dst, true);
  if (srcNode.type === 'dir') {
    if (existing && existing.type !== 'dir') {
      io.err(`cp: cannot overwrite non-directory ${q(dst)} with directory ${q(src)}\n`);
      return false;
    }
    let target = existing;
    if (!target) {
      try {
        const { dir, name } = resolveParent(st, dst);
        if (isAncestor(st, srcNode.ino, dir)) {
          io.err(`cp: cannot copy a directory, ${q(src)}, into itself, ${q(dst)}\n`);
          return false;
        }
        if (!can(st, node(st, dir), 'w')) throw new FsError('EACCES');
        target = createNode(st, dir, name, 'dir', o.preserve ? srcNode.mode : srcNode.mode & ~umask & 0o777);
      } catch (e) {
        io.err(`cp: cannot create directory ${q(dst)}: ${errText(e)}\n`);
        return false;
      }
    }
    if (o.verbose) io.out(`${q(src)} -> ${q(dst)}\n`);
    if (!can(st, srcNode, 'r') || !can(st, srcNode, 'x')) {
      io.err(`cp: cannot access ${q(src)}: Permission denied\n`);
      return false;
    }
    let ok = true;
    for (const name of Object.keys(srcNode.entries!).sort()) {
      const child = node(st, srcNode.entries![name]);
      ok = copyInto(ctx, joinPath(src, name), child, joinPath(dst, name), o) && ok;
    }
    if (o.preserve) preserveAttrs(st, srcNode, target);
    return ok;
  }
  if (existing?.type === 'dir') {
    io.err(`cp: cannot overwrite directory ${q(dst)} with non-directory\n`);
    return false;
  }
  if (existing && existing.ino === srcNode.ino) {
    io.err(`cp: ${q(src)} and ${q(dst)} are the same file\n`);
    return false;
  }
  if (srcNode.type !== 'link' && !can(st, srcNode, 'r')) {
    io.err(`cp: cannot open ${q(src)} for reading: Permission denied\n`);
    return false;
  }
  try {
    let target: Inode;
    if (existing && srcNode.type !== 'link') {
      if (!can(st, existing, 'w')) throw new FsError('EACCES');
      existing.content = srcNode.content ?? '';
      touchTimes(st, existing, 'mc');
      target = existing;
    } else {
      const { dir, name } = resolveParent(st, dst);
      if (!can(st, node(st, dir), 'w')) throw new FsError('EACCES');
      if (srcNode.type === 'link') {
        target = createNode(st, dir, name, 'link', 0o777, { target: srcNode.target });
      } else {
        const mode = o.preserve ? srcNode.mode : srcNode.mode & ~umask & 0o777;
        target = createNode(st, dir, name, 'file', mode, { content: srcNode.content ?? '' });
      }
    }
    if (o.preserve) preserveAttrs(st, srcNode, target);
    if (o.verbose) io.out(`${q(src)} -> ${q(dst)}\n`);
    return true;
  } catch (e) {
    io.err(`cp: cannot create regular file ${q(dst)}: ${errText(e)}\n`);
    return false;
  }
}

function preserveAttrs(st: ShellState, from: Inode, to: Inode) {
  to.mode = from.mode;
  to.mtime = from.mtime;
  to.atime = from.atime;
  if (isRoot(st)) {
    to.uid = from.uid;
    to.gid = from.gid;
  }
}

export const cp: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'rRpfivaP' });
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const ops = p.operands;
  if (ops.length === 0) return missingOperand(ctx);
  if (ops.length === 1) return missingOperand(ctx, ops[0]);
  const dest = ops[ops.length - 1];
  const sources = ops.slice(0, -1);
  const destIsDir = lookup(st, dest, true)?.type === 'dir';
  if (sources.length > 1 && !destIsDir) {
    io.err(`cp: target ${q(dest)} is not a directory\n`);
    return 1;
  }
  const o: CopyOpts = { recursive: !!(p.flags.r || p.flags.R || p.flags.a), preserve: !!(p.flags.p || p.flags.a), verbose: !!p.flags.v };
  let exit = 0;
  for (const src of sources) {
    const srcNode = lookup(st, src, !o.recursive) ?? lookup(st, src, false);
    if (!srcNode) {
      io.err(`cp: cannot stat ${q(src)}: No such file or directory\n`);
      exit = 1;
      continue;
    }
    if (srcNode.type === 'dir' && !o.recursive) {
      io.err(`cp: -r not specified; omitting directory ${q(src)}\n`);
      exit = 1;
      continue;
    }
    const target = destIsDir ? joinPath(dest, basename(src)) : dest;
    if (!copyInto(ctx, src, srcNode, target, o)) exit = 1;
  }
  return exit;
};

export const mv: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'fivn' });
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const ops = p.operands;
  if (ops.length === 0) return missingOperand(ctx);
  if (ops.length === 1) return missingOperand(ctx, ops[0]);
  const dest = ops[ops.length - 1];
  const sources = ops.slice(0, -1);
  const destIsDir = lookup(st, dest, true)?.type === 'dir';
  if (sources.length > 1 && !destIsDir) {
    io.err(`mv: target ${q(dest)} is not a directory\n`);
    return 1;
  }
  let exit = 0;
  for (const src of sources) {
    const target = destIsDir ? joinPath(dest, basename(src)) : dest;
    if (!moveOne(ctx, src, target, !!p.flags.v)) exit = 1;
  }
  return exit;
};

function moveOne(ctx: Ctx, src: string, dst: string, verbose: boolean): boolean {
  const { st, io } = ctx;
  let from: ReturnType<typeof resolve>;
  try {
    from = resolve(st, src, false);
  } catch (e) {
    io.err(`mv: cannot stat ${q(src)}: ${errText(e)}\n`);
    return false;
  }
  const srcNode = node(st, from.ino);
  try {
    const { dir, name } = resolveParent(st, dst);
    if (from.name === '.' || from.name === '..' || name === '.' || name === '..') throw new FsError('EBUSY');
    const existingIno = entryOf(node(st, dir), name);
    const existing = existingIno === undefined ? null : node(st, existingIno);
    if (existing?.ino === srcNode.ino) {
      io.err(`mv: ${q(src)} and ${q(dst)} are the same file\n`);
      return false;
    }
    if (srcNode.type === 'dir' && isAncestor(st, srcNode.ino, dir)) {
      io.err(`mv: cannot move ${q(src)} to a subdirectory of itself, ${q(dst)}\n`);
      return false;
    }
    if (existing?.type === 'dir' && srcNode.type !== 'dir') {
      io.err(`mv: cannot overwrite directory ${q(dst)} with non-directory\n`);
      return false;
    }
    if (existing && existing.type !== 'dir' && srcNode.type === 'dir') {
      io.err(`mv: cannot overwrite non-directory ${q(dst)} with directory ${q(src)}\n`);
      return false;
    }
    const denied = canUnlinkFrom(st, node(st, from.dir), srcNode) ?? (can(st, node(st, dir), 'w') ? null : 'EACCES');
    if (denied) throw new FsError(denied);
    if (existing) {
      if (existing.type === 'dir' && Object.keys(existing.entries!).length) throw new FsError('ENOTEMPTY');
      unlinkName(st, dir, name);
    }
    moveName(st, from.dir, from.name, dir, name);
    if (verbose) io.out(`renamed ${q(src)} -> ${q(dst)}\n`);
    return true;
  } catch (e) {
    io.err(`mv: cannot move ${q(src)} to ${q(dst)}: ${errText(e)}\n`);
    return false;
  }
}

const KIND: Record<Inode['type'], (st: ShellState, n: Inode) => string> = {
  file: (_st, n) => ((n.content ?? '') === '' && !n.generated ? 'regular empty file' : 'regular file'),
  dir: () => 'directory',
  link: () => 'symbolic link',
  chr: () => 'character special file',
};

interface RmOpts {
  force: boolean;
  recursive: boolean;
  emptyDirs: boolean;
  verbose: boolean;
}

/** 지우기 하나. 실패하면 false. 쓰기 금지 파일 확인 질문에는 n 으로 답한 것으로 친다. */
function removeOne(ctx: Ctx, path: string, dirIno: number, name: string, o: RmOpts): boolean {
  const { st, io } = ctx;
  const dir = node(st, dirIno);
  const n = node(st, dir.entries![name]);
  if (n.type === 'dir') {
    if (!o.recursive && !(o.emptyDirs && Object.keys(n.entries!).length === 0)) {
      io.err(`rm: cannot remove ${q(path)}: Is a directory\n`);
      return false;
    }
    if (o.recursive) {
      if (!can(st, n, 'r') || !can(st, n, 'x') || (!can(st, n, 'w') && Object.keys(n.entries!).length)) {
        io.err(`rm: cannot remove ${q(path)}: Permission denied\n`);
        return false;
      }
      let ok = true;
      for (const child of Object.keys(n.entries!).sort()) {
        ok = removeOne(ctx, joinPath(path, child), n.ino, child, o) && ok;
      }
      if (!ok) return false;
    }
  } else if (!o.force && !isRoot(st) && n.type !== 'link' && !can(st, n, 'w')) {
    io.err(`rm: remove write-protected ${KIND[n.type](st, n)} ${q(path)}? \n`);
    io.note('연습장은 확인 질문에 답할 수 없어 n(지우지 않음)으로 처리했어요. 묻지 않고 지우려면 -f 를 붙이세요.');
    return true;
  }
  const denied = canUnlinkFrom(st, dir, n);
  if (denied) {
    io.err(`rm: cannot remove ${q(path)}: ${errText(new FsError(denied))}\n`);
    return false;
  }
  if (n.type === 'dir') removeTree(st, dirIno, name);
  else unlinkName(st, dirIno, name);
  if (o.verbose) io.out(n.type === 'dir' ? `removed directory ${q(path)}\n` : `removed ${q(path)}\n`);
  return true;
}

export const rm: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'rRfivd' });
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const o: RmOpts = { force: !!p.flags.f, recursive: !!(p.flags.r || p.flags.R), emptyDirs: !!p.flags.d, verbose: !!p.flags.v };
  if (!p.operands.length) return o.force ? 0 : missingOperand(ctx);
  let exit = 0;
  for (const path of p.operands) {
    const base = basename(path);
    if (o.recursive && resolveSafe(st, path) === ROOT_INO) {
      io.err(`rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n`);
      exit = 1;
      continue;
    }
    if (base === '.' || base === '..') {
      io.err(`rm: refusing to remove '.' or '..' directory: skipping ${q(path)}\n`);
      exit = 1;
      continue;
    }
    let w: ReturnType<typeof resolve>;
    try {
      w = resolve(st, path, false);
    } catch (e) {
      if (!(o.force && errnoOf(e) === 'ENOENT')) {
        io.err(`rm: cannot remove ${q(path)}: ${errText(e)}\n`);
        exit = 1;
      }
      continue;
    }
    if (!removeOne(ctx, path, w.dir, w.name, o)) exit = 1;
  }
  return exit;
};

const resolveSafe = (st: ShellState, path: string) => {
  try {
    return resolve(st, path, true).ino;
  } catch {
    return -1;
  }
};

export const ln: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'sfvn' });
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const ops = p.operands;
  if (ops.length === 0) return missingOperand(ctx);
  const symbolic = !!p.flags.s;
  const dest = ops.length === 1 ? '.' : ops[ops.length - 1];
  const sources = ops.length === 1 ? ops : ops.slice(0, -1);
  const destIsDir = !p.flags.n && lookup(st, dest, true)?.type === 'dir';
  if (sources.length > 1 && !destIsDir) {
    io.err(`ln: target ${q(dest)} is not a directory\n`);
    return 1;
  }
  let exit = 0;
  for (const src of sources) {
    const target = destIsDir ? joinPath(dest, basename(src)) : dest;
    const shown = ops.length === 1 ? basename(src) : target;
    let srcNode: Inode | null = null;
    if (!symbolic) {
      srcNode = lookup(st, src, false);
      if (!srcNode) {
        io.err(`ln: failed to access ${q(src)}: No such file or directory\n`);
        exit = 1;
        continue;
      }
      if (srcNode.type === 'dir') {
        io.err(`ln: ${src}: hard link not allowed for directory\n`);
        exit = 1;
        continue;
      }
    }
    const kind = symbolic ? 'symbolic link' : 'hard link';
    try {
      const { dir, name } = resolveParent(st, target);
      if (entryOf(node(st, dir), name) !== undefined) {
        if (!p.flags.f) throw new FsError('EEXIST');
        unlinkName(st, dir, name);
      }
      if (!can(st, node(st, dir), 'w')) throw new FsError('EACCES');
      if (symbolic) createNode(st, dir, name, 'link', 0o777, { target: src });
      else addLink(st, dir, name, srcNode!.ino);
      if (p.flags.v) io.out(`${q(shown)} ${symbolic ? '->' : '=>'} ${q(src)}\n`);
    } catch (e) {
      const errno = errnoOf(e);
      const withSource = !symbolic && errno !== 'EEXIST';
      io.err(`ln: failed to create ${kind} ${q(shown)}${withSource ? ` => ${q(src)}` : ''}: ${errText(e)}\n`);
      exit = 1;
    }
  }
  return exit;
};
