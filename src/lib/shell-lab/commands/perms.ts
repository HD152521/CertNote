// 권한과 소유자: chmod chown chgrp umask.
import { isRoot, node, resolve, uid } from '../fs';
import { applyMode, modeString, octal4, parseMode, type ModeSpec } from '../mode';
import { accountByName, accountByUid, groupByName, groupsOf, session } from '../state';
import type { Inode, ShellState } from '../types';
import { errText, q, type Command, type Ctx } from './context';

/** -R 이면 디렉터리 안쪽까지. 안쪽의 심볼릭 링크는 따라가지 않는다. */
function walk(st: ShellState, path: string, n: Inode, recursive: boolean, visit: (path: string, n: Inode) => void) {
  visit(path, n);
  if (!recursive || n.type !== 'dir') return;
  for (const name of Object.keys(n.entries!).sort()) {
    const child = node(st, n.entries![name]);
    if (child.type === 'link') continue;
    walk(st, `${path}/${name}`, child, true, visit);
  }
}

/** chmod·chown 의 옵션(-R -v -c -f)과 나머지를 나눈다. chmod 는 -x 같은 모드가 옵션처럼 생겨서 따로 본다. */
function splitArgs(ctx: Ctx, modeLike: boolean): { flags: Set<string>; rest: string[] } | number {
  const flags = new Set<string>();
  const rest: string[] = [];
  for (const a of ctx.args) {
    if (modeLike && /^-[rwxXst]+$/.test(a)) rest.push(a);
    else if (/^-[Rvcfh]+$/.test(a)) for (const c of a.slice(1)) flags.add(c);
    else if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
      ctx.io.err(`${ctx.name}: invalid option -- '${a[1]}'\nTry '${ctx.name} --help' for more information.\n`);
      return 1;
    } else rest.push(a);
  }
  return { flags, rest };
}

function operandsOrError(ctx: Ctx, rest: string[]): boolean {
  if (rest.length === 0) {
    ctx.io.err(`${ctx.name}: missing operand\nTry '${ctx.name} --help' for more information.\n`);
    return false;
  }
  if (rest.length === 1) {
    ctx.io.err(`${ctx.name}: missing operand after ${q(rest[0])}\nTry '${ctx.name} --help' for more information.\n`);
    return false;
  }
  return true;
}

const describe = (m: number, n: Inode) => `${octal4(m)} (${modeString({ type: n.type, mode: m }).slice(1)})`;

export const chmod: Command = (ctx) => {
  const parsed = splitArgs(ctx, true);
  if (typeof parsed === 'number') return parsed;
  const { flags, rest } = parsed;
  const { st, io } = ctx;
  if (!operandsOrError(ctx, rest)) return 1;
  const [modeText, ...files] = rest;
  const spec: ModeSpec | null = parseMode(modeText);
  if (!spec) {
    io.err(`chmod: invalid mode: ${q(modeText)}\nTry 'chmod --help' for more information.\n`);
    return 1;
  }
  const umask = session(st).umask;
  let exit = 0;
  for (const path of files) {
    let target: Inode;
    try {
      target = node(st, resolve(st, path, true).ino);
    } catch (e) {
      io.err(`chmod: cannot access ${q(path)}: ${errText(e)}\n`);
      exit = 1;
      continue;
    }
    walk(st, path, target, flags.has('R'), (p, n) => {
      if (!isRoot(st) && n.uid !== uid(st)) {
        io.err(`chmod: changing permissions of ${q(p)}: Operation not permitted\n`);
        exit = 1;
        return;
      }
      const before = n.mode;
      let next = applyMode(spec, before, n.type === 'dir', umask);
      // 일반 사용자가 자기가 속하지 않은 그룹 파일에 setgid 를 켜면 커널이 조용히 지운다.
      const me = accountByUid(st, uid(st));
      if (!isRoot(st) && me && n.type !== 'dir' && !groupsOf(st, me).includes(n.gid)) next &= ~0o2000;
      n.mode = next;
      n.ctime = st.clock;
      if (flags.has('v') || (flags.has('c') && before !== next)) {
        io.out(
          before === next
            ? `mode of ${q(p)} retained as ${describe(next, n)}\n`
            : `mode of ${q(p)} changed from ${describe(before, n)} to ${describe(next, n)}\n`,
        );
      }
    });
  }
  return exit;
};

interface Owner {
  uid?: number;
  gid?: number;
}

/** chown 의 user[:group] / user.group / :group / user: 해석. 실패하면 오류 문구. */
function parseOwner(st: ShellState, spec: string): Owner | string {
  const m = /^([^:.]*)(?:[:.](.*))?$/.exec(spec);
  if (!m) return `invalid spec: ${q(spec)}`;
  const [, user, group] = m;
  const out: Owner = {};
  if (user) {
    const account = accountByName(st, user);
    if (account) out.uid = account.uid;
    else if (/^\d+$/.test(user)) out.uid = Number(user);
    else return `invalid user: ${q(spec)}`;
    if (group === '') out.gid = account?.gid;
  }
  if (group) {
    const g = groupByName(st, group);
    if (g) out.gid = g.gid;
    else if (/^\d+$/.test(group)) out.gid = Number(group);
    else return `invalid group: ${q(spec)}`;
  }
  return out;
}

function changeOwner(ctx: Ctx, files: string[], owner: Owner, recursive: boolean, verbose: boolean): number {
  const { st, io } = ctx;
  const what = ctx.name === 'chgrp' ? 'group' : 'ownership';
  let exit = 0;
  for (const path of files) {
    let target: Inode;
    try {
      target = node(st, resolve(st, path, true).ino);
    } catch (e) {
      io.err(`${ctx.name}: cannot access ${q(path)}: ${errText(e)}\n`);
      exit = 1;
      continue;
    }
    walk(st, path, target, recursive, (p, n) => {
      const me = accountByUid(st, uid(st));
      // 일반 사용자는 자기 파일의 그룹을 자기가 속한 그룹으로만 바꿀 수 있다. 소유자는 못 바꾼다.
      const allowed =
        isRoot(st) ||
        (n.uid === uid(st) && (owner.uid === undefined || owner.uid === n.uid) &&
          (owner.gid === undefined || (me !== undefined && groupsOf(st, me).includes(owner.gid))));
      if (!allowed) {
        io.err(`${ctx.name}: changing ${what} of ${q(p)}: Operation not permitted\n`);
        exit = 1;
        return;
      }
      if (owner.uid !== undefined) n.uid = owner.uid;
      if (owner.gid !== undefined) n.gid = owner.gid;
      // 소유자·그룹이 바뀌면 커널이 setuid 를, 그룹 실행이 있으면 setgid 를 지운다(디렉터리 제외).
      if (n.type !== 'dir') {
        n.mode &= ~0o4000;
        if (n.mode & 0o010) n.mode &= ~0o2000;
      }
      n.ctime = st.clock;
      if (verbose) io.out(`changed ${what} of ${q(p)}\n`);
    });
  }
  return exit;
}

export const chown: Command = (ctx) => {
  const parsed = splitArgs(ctx, false);
  if (typeof parsed === 'number') return parsed;
  const { flags, rest } = parsed;
  if (!operandsOrError(ctx, rest)) return 1;
  const [spec, ...files] = rest;
  const owner = parseOwner(ctx.st, spec);
  if (typeof owner === 'string') {
    ctx.io.err(`chown: ${owner}\n`);
    return 1;
  }
  return changeOwner(ctx, files, owner, flags.has('R'), flags.has('v'));
};

export const chgrp: Command = (ctx) => {
  const parsed = splitArgs(ctx, false);
  if (typeof parsed === 'number') return parsed;
  const { flags, rest } = parsed;
  if (!operandsOrError(ctx, rest)) return 1;
  const [group, ...files] = rest;
  const g = groupByName(ctx.st, group);
  const gid = g?.gid ?? (/^\d+$/.test(group) ? Number(group) : undefined);
  if (gid === undefined) {
    ctx.io.err(`chgrp: invalid group: ${q(group)}\n`);
    return 1;
  }
  return changeOwner(ctx, files, { gid }, flags.has('R'), flags.has('v'));
};

function symbolicUmask(mask: number): string {
  const allowed = ~mask & 0o777;
  const part = (shift: number) =>
    `${allowed & (4 << shift) ? 'r' : ''}${allowed & (2 << shift) ? 'w' : ''}${allowed & (1 << shift) ? 'x' : ''}`;
  return `u=${part(6)},g=${part(3)},o=${part(0)}`;
}

export const umask: Command = ({ st, args, io }) => {
  const s = session(st);
  const symbolic = args[0] === '-S';
  const value = symbolic ? args[1] : args[0];
  if (value === undefined) {
    io.out(symbolic ? `${symbolicUmask(s.umask)}\n` : `${octal4(s.umask)}\n`);
    return 0;
  }
  if (!/^[0-7]+$/.test(value)) {
    if (/^\d+$/.test(value)) {
      io.err(`-bash: umask: ${value}: octal number out of range\n`);
      return 1;
    }
    io.note('umask 를 기호(u=rwx,g=rx 등)로 바꾸는 것은 연습장에서 아직 지원하지 않아요. 숫자(022, 027)로 써 주세요.');
    return 1;
  }
  const n = parseInt(value, 8);
  if (n > 0o777) {
    io.err(`-bash: umask: ${value}: octal number out of range\n`);
    return 1;
  }
  s.umask = n;
  return 0;
};
