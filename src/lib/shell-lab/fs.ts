// 가상 파일 시스템: 경로 해석, 권한 검사, 노드 만들기·지우기. 커널이 하는 일에 해당한다.
// 상태는 명령 한 줄마다 run.ts 가 복사본을 만들어 넘기므로, 여기 함수는 그 복사본을 고친다.
import { BINARY_SIZE, ROOT_INO, accountByUid, generatedText, groupsOf, session } from './state';
import type { Inode, NodeType, ShellState } from './types';

export type Errno = 'ENOENT' | 'ENOTDIR' | 'EACCES' | 'ELOOP' | 'EEXIST' | 'EISDIR' | 'ENOTEMPTY' | 'EPERM' | 'EINVAL' | 'EBUSY';

export const ERRNO_TEXT: Record<Errno, string> = {
  ENOENT: 'No such file or directory',
  ENOTDIR: 'Not a directory',
  EACCES: 'Permission denied',
  ELOOP: 'Too many levels of symbolic links',
  EEXIST: 'File exists',
  EISDIR: 'Is a directory',
  ENOTEMPTY: 'Directory not empty',
  EPERM: 'Operation not permitted',
  EINVAL: 'Invalid argument',
  EBUSY: 'Device or resource busy',
};

export class FsError extends Error {
  constructor(public errno: Errno) {
    super(ERRNO_TEXT[errno]);
  }
}

export const node = (st: ShellState, ino: number): Inode => st.inodes[ino];

/** 디렉터리 안 이름 → inode. constructor 같은 이름이 Object 의 속성으로 잡히지 않게 자기 속성만 본다. */
export const entryOf = (dir: Inode, name: string): number | undefined =>
  Object.hasOwn(dir.entries!, name) ? dir.entries![name] : undefined;
export const uid = (st: ShellState) => session(st).uid;
export const isRoot = (st: ShellState) => uid(st) === 0;

const MAX_LINKS = 40;

interface Walk {
  ino: number;
  /** 마지막 이름이 들어 있는 디렉터리 */
  dir: number;
  name: string;
}

function split(path: string): string[] {
  return path.split('/').filter((p) => p !== '');
}

/** 현재 디렉터리의 inode. 지워졌으면 ENOENT. */
function cwdIno(st: ShellState): number {
  return resolve(st, session(st).cwd, true).ino;
}

/**
 * 경로를 inode 로 바꾼다. follow 가 false 면 마지막 이름이 심볼릭 링크여도 링크 자체를 준다(lstat).
 * 지나가는 디렉터리마다 실행(x) 권한을 본다.
 */
export function resolve(st: ShellState, path: string, follow: boolean, depth = 0): Walk {
  if (path === '') throw new FsError('ENOENT');
  if (depth > MAX_LINKS) throw new FsError('ELOOP');
  let cur = path.startsWith('/') ? ROOT_INO : cwdIno(st);
  let dir = cur;
  let name = '.';
  const parts = split(path);
  const trailingSlash = path.endsWith('/') && parts.length > 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const here = node(st, cur);
    if (here.type !== 'dir') throw new FsError('ENOTDIR');
    if (!can(st, here, 'x')) throw new FsError('EACCES');
    dir = cur;
    name = part;
    let next: number | undefined;
    if (part === '.') next = cur;
    else if (part === '..') next = here.parent;
    else next = entryOf(here, part);
    if (next === undefined) throw new FsError('ENOENT');
    const target = node(st, next);
    const last = i === parts.length - 1;
    if (target.type === 'link' && (!last || follow || trailingSlash)) {
      const base = pathOfDir(st, cur);
      const linked = target.target!.startsWith('/') ? target.target! : `${base}/${target.target}`;
      next = resolve(st, linked, true, depth + 1).ino;
    }
    cur = next;
  }
  if (trailingSlash && node(st, cur).type !== 'dir') throw new FsError('ENOTDIR');
  return { ino: cur, dir, name };
}

/** 새로 만들 경로: 부모 디렉터리와 마지막 이름. 부모가 없거나 디렉터리가 아니면 오류. */
export function resolveParent(st: ShellState, path: string): { dir: number; name: string } {
  const parts = split(path);
  if (parts.length === 0) throw new FsError('EEXIST');
  const name = parts[parts.length - 1];
  const parentPath = path.startsWith('/') ? `/${parts.slice(0, -1).join('/')}` : parts.slice(0, -1).join('/') || '.';
  const parent = resolve(st, parentPath, true).ino;
  if (node(st, parent).type !== 'dir') throw new FsError('ENOTDIR');
  return { dir: parent, name };
}

/** 디렉터리 inode 의 절대 경로(물리 경로). */
export function pathOfDir(st: ShellState, ino: number): string {
  const names: string[] = [];
  let cur = ino;
  while (cur !== ROOT_INO) {
    const parent = node(st, cur).parent!;
    const entries = node(st, parent).entries!;
    const name = Object.keys(entries).find((k) => entries[k] === cur);
    if (name === undefined) break;
    names.unshift(name);
    cur = parent;
  }
  return `/${names.join('/')}`;
}

export function exists(st: ShellState, path: string, follow = false): boolean {
  try {
    resolve(st, path, follow);
    return true;
  } catch {
    return false;
  }
}

/** 현재 사용자에게 r·w·x 권한이 있나. root 는 읽기·쓰기는 늘 되고, 실행은 x 비트가 하나라도 있어야 한다. */
export function can(st: ShellState, n: Inode, perm: 'r' | 'w' | 'x'): boolean {
  const me = uid(st);
  if (me === 0) {
    if (perm !== 'x' || n.type === 'dir') return true;
    return (n.mode & 0o111) !== 0;
  }
  const bit = perm === 'r' ? 4 : perm === 'w' ? 2 : 1;
  if (n.uid === me) return ((n.mode >> 6) & bit) !== 0;
  const account = accountByUid(st, me);
  if (account && groupsOf(st, account).includes(n.gid)) return ((n.mode >> 3) & bit) !== 0;
  return (n.mode & bit) !== 0;
}

/** 디렉터리에서 이름을 지우거나 옮길 수 있나: 쓰기·실행 권한 + sticky 비트 규칙. */
export function canUnlinkFrom(st: ShellState, dir: Inode, victim: Inode): Errno | null {
  if (!can(st, dir, 'w') || !can(st, dir, 'x')) return 'EACCES';
  const me = uid(st);
  if ((dir.mode & 0o1000) && me !== 0 && victim.uid !== me && dir.uid !== me) return 'EPERM';
  return null;
}

export function sizeOf(st: ShellState, n: Inode, name?: string): number {
  switch (n.type) {
    case 'dir':
      return 4096;
    case 'link':
      return n.target!.length;
    case 'chr':
      return 0;
    default:
      if (n.generated) return new TextEncoder().encode(generatedText(st, n.generated)).length;
      if (n.content === undefined && name && BINARY_SIZE[name] !== undefined) return BINARY_SIZE[name];
      return new TextEncoder().encode(n.content ?? '').length;
  }
}

/** 512바이트 블록 수(ext4, 4KiB 블록 기준). */
export function blocksOf(st: ShellState, n: Inode, name?: string): number {
  if (n.type === 'dir') return 8;
  if (n.type !== 'file') return 0;
  return Math.ceil(sizeOf(st, n, name) / 4096) * 8;
}

export function readText(st: ShellState, n: Inode): string {
  return n.generated ? generatedText(st, n.generated) : n.content ?? '';
}

export function touchTimes(st: ShellState, n: Inode, which: 'm' | 'c' | 'a' | 'mc' | 'amc') {
  if (which.includes('a')) n.atime = st.clock;
  if (which.includes('m')) n.mtime = st.clock;
  if (which.includes('c')) n.ctime = st.clock;
}

/** 디렉터리 dir 안에 새 노드를 만든다. 권한 검사는 부르는 쪽이 한다. */
export function createNode(
  st: ShellState,
  dirIno: number,
  name: string,
  type: NodeType,
  mode: number,
  extra: Partial<Inode> = {},
): Inode {
  const dir = node(st, dirIno);
  const me = uid(st);
  const account = accountByUid(st, me);
  // setgid 디렉터리 안에 만든 것은 디렉터리의 그룹을 물려받는다.
  const gid = dir.mode & 0o2000 ? dir.gid : account?.gid ?? 0;
  const ino = st.nextIno++;
  const n: Inode = {
    ino, type, mode, uid: me, gid, nlink: type === 'dir' ? 2 : 1,
    atime: st.clock, mtime: st.clock, ctime: st.clock, btime: st.clock, ...extra,
  };
  if (type === 'dir') {
    n.entries = {};
    n.parent = dirIno;
    dir.nlink += 1;
    if (dir.mode & 0o2000) n.mode |= 0o2000;
  }
  st.inodes[ino] = n;
  dir.entries![name] = ino;
  touchTimes(st, dir, 'mc');
  return n;
}

/** 이름 하나를 지운다. 링크 수가 0 이 되면 inode 도 없앤다. */
export function unlinkName(st: ShellState, dirIno: number, name: string) {
  const dir = node(st, dirIno);
  const ino = dir.entries![name];
  const n = node(st, ino);
  delete dir.entries![name];
  touchTimes(st, dir, 'mc');
  if (n.type === 'dir') {
    dir.nlink -= 1;
    delete st.inodes[ino];
    return;
  }
  n.nlink -= 1;
  n.ctime = st.clock;
  if (n.nlink <= 0) delete st.inodes[ino];
}

/** 하드 링크: 같은 inode 에 이름을 하나 더 붙인다. */
export function addLink(st: ShellState, dirIno: number, name: string, ino: number) {
  const dir = node(st, dirIno);
  dir.entries![name] = ino;
  touchTimes(st, dir, 'mc');
  const n = node(st, ino);
  n.nlink += 1;
  n.ctime = st.clock;
}

/** 디렉터리 이름을 다른 디렉터리로 옮긴다(mv). 부모 링크 수를 맞춘다. */
export function moveName(st: ShellState, fromDir: number, fromName: string, toDir: number, toName: string) {
  if (toName === '.' || toName === '..' || fromName === '.' || fromName === '..') throw new FsError('EBUSY');
  const src = node(st, fromDir);
  const ino = src.entries![fromName];
  delete src.entries![fromName];
  touchTimes(st, src, 'mc');
  const dst = node(st, toDir);
  dst.entries![toName] = ino;
  touchTimes(st, dst, 'mc');
  const n = node(st, ino);
  n.ctime = st.clock;
  if (n.type === 'dir' && fromDir !== toDir) {
    src.nlink -= 1;
    dst.nlink += 1;
    n.parent = toDir;
  }
}

/** 하위 트리를 통째로 지운다(rm -r, userdel -r). */
export function removeTree(st: ShellState, dirIno: number, name: string) {
  const ino = node(st, dirIno).entries![name];
  const n = node(st, ino);
  if (n.type === 'dir') {
    for (const child of Object.keys(n.entries!)) removeTree(st, ino, child);
  }
  unlinkName(st, dirIno, name);
}

/** a 가 b 와 같거나 b 의 조상인가 (디렉터리를 자기 안으로 복사·이동하는 것 막기) */
export function isAncestor(st: ShellState, a: number, b: number): boolean {
  let cur = b;
  for (;;) {
    if (cur === a) return true;
    if (cur === ROOT_INO) return false;
    cur = node(st, cur).parent!;
  }
}

export const sortNames = (names: string[]) => [...names].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
