// 사용자·그룹: useradd usermod userdel groupadd groupdel passwd id whoami groups su exit.
// 기준은 Rocky 8.8 의 /etc/login.defs (UID·GID 1000~60000, CREATE_HOME yes, USERGROUPS_ENAB yes).
import { createNode, entryOf, isRoot, node, removeTree, resolve, uid } from '../fs';
import { isoDay } from '../format';
import {
  MAIL_GID, accountByName, accountByUid, groupByGid, groupByName, groupsOf, session, today,
} from '../state';
import type { Account, Inode, ShellState } from '../types';
import { getopt, isExit, q, type Command, type Ctx } from './context';

const ID_MIN = 1000;
const ID_MAX = 60000;
const NAME_RE = /^[a-z_][a-z0-9_-]{0,31}\$?$/;

function denied(ctx: Ctx, tool: string): number {
  ctx.io.err(`${tool}: Permission denied.\n${tool}: cannot lock /etc/passwd; try again later.\n`);
  return 1;
}

function nextId(used: number[], preferred?: number): number {
  if (preferred !== undefined && !used.includes(preferred)) return preferred;
  const inRange = used.filter((n) => n >= ID_MIN && n <= ID_MAX);
  return inRange.length ? Math.max(...inRange) + 1 : ID_MIN;
}

function lookupPath(st: ShellState, path: string): { ino: number; dir: number; name: string } | null {
  try {
    return resolve(st, path, false);
  } catch {
    return null;
  }
}

/** /etc/skel 을 새 홈으로 복사한다. 시각은 그대로, 소유자는 새 사용자. */
function createHome(st: ShellState, home: string, account: Account) {
  const parentPath = home.replace(/\/[^/]+$/, '') || '/';
  const parent = lookupPath(st, parentPath);
  if (!parent) return;
  const dir = createNode(st, parent.ino, home.split('/').pop()!, 'dir', 0o700);
  dir.uid = account.uid;
  dir.gid = account.gid;
  const skel = lookupPath(st, '/etc/skel');
  if (!skel) return;
  const skelDir = node(st, skel.ino);
  for (const name of Object.keys(skelDir.entries!).sort()) {
    const src = node(st, skelDir.entries![name]);
    const copy = createNode(st, dir.ino, name, src.type, src.mode, { content: src.content });
    copy.uid = account.uid;
    copy.gid = account.gid;
    copy.mtime = src.mtime;
    copy.atime = src.atime;
  }
}

function createMailSpool(st: ShellState, account: Account) {
  const spool = lookupPath(st, '/var/spool/mail');
  if (!spool || entryOf(node(st, spool.ino), account.name) !== undefined) return;
  const box = createNode(st, spool.ino, account.name, 'file', 0o660, { content: '' });
  box.uid = account.uid;
  box.gid = MAIL_GID;
}

function splitGroups(ctx: Ctx, tool: string, list: string): number[] | null {
  const gids: number[] = [];
  for (const name of list.split(',').filter(Boolean)) {
    const g = groupByName(ctx.st, name) ?? (/^\d+$/.test(name) ? groupByGid(ctx.st, Number(name)) : undefined);
    if (!g) {
      ctx.io.err(`${tool}: group '${name}' does not exist\n`);
      return null;
    }
    gids.push(g.gid);
  }
  return gids;
}

export const useradd: Command = (ctx) => {
  if (!isRoot(ctx.st)) return denied(ctx, 'useradd');
  const p = getopt(ctx, { flags: 'mMNr', values: 'ugGsdc' }, 2);
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const name = p.operands[0];
  if (!name || p.operands.length > 1) {
    io.note('useradd 다음에 만들 사용자 이름을 하나 적어 주세요. 예: useradd -m alice');
    return 2;
  }
  if (!NAME_RE.test(name)) {
    io.err(`useradd: invalid user name ${q(name)}\n`);
    return 3;
  }
  if (accountByName(st, name)) {
    io.err(`useradd: user ${q(name)} already exists\n`);
    return 9;
  }
  const v = p.values;
  let gid: number | undefined;
  if (v.g !== undefined) {
    const g = groupByName(st, v.g) ?? (/^\d+$/.test(v.g) ? groupByGid(st, Number(v.g)) : undefined);
    if (!g) {
      io.err(`useradd: group '${v.g}' does not exist\n`);
      return 6;
    }
    gid = g.gid;
  } else if (groupByName(st, name)) {
    io.err(`useradd: group ${name} exists - if you want to add this user to that group, use -g.\n`);
    return 9;
  }
  const extra = v.G !== undefined ? splitGroups(ctx, 'useradd', v.G) : [];
  if (!extra) return 6;
  const usedUids = st.accounts.map((a) => a.uid);
  let newUid: number;
  if (v.u !== undefined) {
    newUid = Number(v.u);
    if (!Number.isInteger(newUid) || newUid < 0) {
      io.err(`useradd: invalid user ID ${q(v.u)}\n`);
      return 3;
    }
    if (usedUids.includes(newUid)) {
      io.err(`useradd: UID ${newUid} is not unique\n`);
      return 4;
    }
  } else newUid = nextId(usedUids);
  if (gid === undefined) {
    gid = nextId(st.groups.map((g) => g.gid), newUid);
    st.groups.push({ name, gid, members: [] });
  }
  const account: Account = {
    name, uid: newUid, gid, comment: v.c ?? '', home: v.d ?? `/home/${name}`, shell: v.s ?? '/bin/bash',
    password: 'none', locked: false, lastChange: today(st),
  };
  st.accounts.push(account);
  for (const g of st.groups) if (extra.includes(g.gid) && !g.members.includes(name)) g.members.push(name);
  if (!p.flags.M) {
    if (lookupPath(st, account.home)) {
      io.err('useradd: warning: the home directory already exists.\nNot copying any file from skel directory into it.\n');
    } else createHome(st, account.home, account);
  }
  createMailSpool(st, account);
  return 0;
};

/** 홈 디렉터리 안에서 옛 UID 로 된 파일을 새 UID 로 바꾼다 (usermod -u). */
function rechown(st: ShellState, n: Inode, from: number, to: number) {
  if (n.uid === from) n.uid = to;
  if (n.type === 'dir') for (const child of Object.values(n.entries!)) rechown(st, node(st, child), from, to);
}

export const usermod: Command = (ctx) => {
  if (!isRoot(ctx.st)) return denied(ctx, 'usermod');
  const p = getopt(ctx, { flags: 'aLU', values: 'Ggsdcul' }, 2);
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const name = p.operands[0];
  if (!name) {
    io.note('usermod 다음에 바꿀 사용자 이름을 적어 주세요. 예: usermod -aG wheel alice');
    return 2;
  }
  const account = accountByName(st, name);
  if (!account) {
    io.err(`usermod: user ${q(name)} does not exist\n`);
    return 6;
  }
  const v = p.values;
  if (v.g !== undefined) {
    const g = groupByName(st, v.g) ?? (/^\d+$/.test(v.g) ? groupByGid(st, Number(v.g)) : undefined);
    if (!g) {
      io.err(`usermod: group '${v.g}' does not exist\n`);
      return 6;
    }
    account.gid = g.gid;
  }
  if (v.G !== undefined) {
    const gids = splitGroups(ctx, 'usermod', v.G);
    if (!gids) return 6;
    for (const g of st.groups) {
      const member = g.members.includes(account.name);
      if (gids.includes(g.gid) && !member) g.members.push(account.name);
      if (!p.flags.a && !gids.includes(g.gid) && member) g.members = g.members.filter((m) => m !== account.name);
    }
  } else if (p.flags.a) {
    io.err(`usermod: -a flag is ONLY allowed with the -G flag\n`);
    return 2;
  }
  if (v.u !== undefined) {
    const next = Number(v.u);
    if (st.accounts.some((a) => a.uid === next && a !== account)) {
      io.err(`usermod: UID '${next}' already exists\n`);
      return 4;
    }
    const home = lookupPath(st, account.home);
    if (home) rechown(st, node(st, home.ino), account.uid, next);
    account.uid = next;
  }
  if (v.s !== undefined) account.shell = v.s;
  if (v.d !== undefined) account.home = v.d;
  if (v.c !== undefined) account.comment = v.c;
  if (v.l !== undefined) {
    if (accountByName(st, v.l)) {
      io.err(`usermod: user ${q(v.l)} already exists\n`);
      return 9;
    }
    for (const g of st.groups) g.members = g.members.map((m) => (m === account.name ? v.l : m));
    account.name = v.l;
  }
  if (p.flags.L) account.locked = true;
  if (p.flags.U) account.locked = false;
  return 0;
};

export const userdel: Command = (ctx) => {
  if (!isRoot(ctx.st)) return denied(ctx, 'userdel');
  const p = getopt(ctx, { flags: 'rf' }, 2);
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const name = p.operands[0];
  const account = name ? accountByName(st, name) : undefined;
  if (!name) {
    io.note('userdel 다음에 지울 사용자 이름을 적어 주세요. 홈까지 지우려면 userdel -r alice');
    return 2;
  }
  if (!account) {
    io.err(`userdel: user ${q(name)} does not exist\n`);
    return 6;
  }
  if (st.sessions.some((s) => s.uid === account.uid)) {
    io.err(`userdel: user ${name} is currently used by process 1042\n`);
    return 8;
  }
  st.accounts = st.accounts.filter((a) => a !== account);
  for (const g of st.groups) g.members = g.members.filter((m) => m !== name);
  const own = groupByGid(st, account.gid);
  if (own && own.name === name) {
    if (st.accounts.some((a) => a.gid === own.gid)) {
      io.err(`userdel: group ${name} is the primary group of another user and is not removed.\n`);
    } else if (own.members.length) {
      io.err(`userdel: group ${name} not removed because it has other members.\n`);
    } else st.groups = st.groups.filter((g) => g !== own);
  }
  if (p.flags.r) {
    const mail = lookupPath(st, `/var/spool/mail/${name}`);
    if (mail) removeTree(st, mail.dir, mail.name);
    else io.err(`userdel: ${name} mail spool (/var/spool/mail/${name}) not found\n`);
    const home = lookupPath(st, account.home);
    if (home) removeTree(st, home.dir, home.name);
    else io.err(`userdel: ${name} home directory (${account.home}) not found\n`);
  }
  return 0;
};

export const groupadd: Command = (ctx) => {
  if (!isRoot(ctx.st)) return denied(ctx, 'groupadd');
  const p = getopt(ctx, { flags: 'fr', values: 'g' }, 2);
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const name = p.operands[0];
  if (!name) {
    io.note('groupadd 다음에 만들 그룹 이름을 적어 주세요. 예: groupadd dev');
    return 2;
  }
  if (!NAME_RE.test(name)) {
    io.err(`groupadd: ${q(name)} is not a valid group name\n`);
    return 3;
  }
  if (groupByName(st, name)) {
    io.err(`groupadd: group ${q(name)} already exists\n`);
    return 9;
  }
  let gid: number;
  if (p.values.g !== undefined) {
    gid = Number(p.values.g);
    if (groupByGid(st, gid)) {
      io.err(`groupadd: GID '${gid}' already exists\n`);
      return 4;
    }
  } else gid = nextId(st.groups.map((g) => g.gid));
  st.groups.push({ name, gid, members: [] });
  return 0;
};

export const groupdel: Command = (ctx) => {
  if (!isRoot(ctx.st)) return denied(ctx, 'groupdel');
  const { st, io, args } = ctx;
  const name = args[0];
  const group = name ? groupByName(st, name) : undefined;
  if (!name) {
    io.note('groupdel 다음에 지울 그룹 이름을 적어 주세요.');
    return 2;
  }
  if (!group) {
    io.err(`groupdel: group ${q(name)} does not exist\n`);
    return 6;
  }
  const primaryOf = st.accounts.find((a) => a.gid === group.gid);
  if (primaryOf) {
    io.err(`groupdel: cannot remove the primary group of user ${q(primaryOf.name)}\n`);
    return 8;
  }
  st.groups = st.groups.filter((g) => g !== group);
  return 0;
};

function passwdStatus(account: Account): string {
  const [code, text] =
    account.password === 'none' || account.locked
      ? ['LK', 'Password locked.']
      : account.password === 'set'
        ? ['PS', 'Password set, SHA512 crypt.']
        : ['NP', 'Empty password.'];
  return `${account.name} ${code} ${isoDay(account.lastChange)} 0 99999 7 -1 (${text})\n`;
}

export const passwd: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'Sluadf' });
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const me = accountByUid(st, uid(st))!;
  const name = p.operands[0];
  if (name && !isRoot(st)) {
    io.err('passwd: Only root can specify a user name.\n');
    return 1;
  }
  const account = name ? accountByName(st, name) : me;
  if (!account) {
    io.err(`passwd: Unknown user name ${q(name!)}.\n`);
    return 252;
  }
  const f = p.flags;
  if ((f.S || f.l || f.u || f.d) && !isRoot(st)) {
    io.err('passwd: Only root can do that.\n');
    return 1;
  }
  if (f.S) {
    io.out(passwdStatus(account));
    return 0;
  }
  if (f.l) {
    io.out(`Locking password for user ${account.name}.\npasswd: Success\n`);
    account.locked = true;
    return 0;
  }
  if (f.u) {
    io.out(`Unlocking password for user ${account.name}.\n`);
    if (account.password === 'none' && !f.f) {
      io.out('passwd: Unsafe operation (use -f to force)\n');
      io.err('passwd: Warning: unlocked password would be empty.\n');
      return 254;
    }
    io.out('passwd: Success\n');
    account.locked = false;
    return 0;
  }
  if (f.d) {
    io.out(`Removing password for user ${account.name}.\npasswd: Success\n`);
    account.password = 'empty';
    account.locked = false;
    return 0;
  }
  io.out(
    `Changing password for user ${account.name}.\nNew password: \nRetype new password: \n` +
      'passwd: all authentication tokens updated successfully.\n',
  );
  io.note('연습장에서는 비밀번호 입력을 건너뛰고 설정된 것으로 처리했어요. 실제로는 입력한 글자가 화면에 보이지 않아요.');
  account.password = 'set';
  account.locked = false;
  account.lastChange = today(st);
  return 0;
};

export const id: Command = (ctx) => {
  const p = getopt(ctx, { flags: 'ugGnr' });
  if (isExit(p)) return p.exit;
  const { st, io } = ctx;
  const name = p.operands[0];
  const account = name ? accountByName(st, name) : accountByUid(st, uid(st));
  if (!account) {
    io.err(`id: ${q(name!)}: no such user\n`);
    return 1;
  }
  const gids = groupsOf(st, account);
  const gname = (g: number) => groupByGid(st, g)?.name ?? String(g);
  const f = p.flags;
  if (f.u) io.out(`${f.n ? account.name : account.uid}\n`);
  else if (f.g) io.out(`${f.n ? gname(account.gid) : account.gid}\n`);
  else if (f.G) io.out(`${gids.map((g) => (f.n ? gname(g) : g)).join(' ')}\n`);
  else {
    io.out(
      `uid=${account.uid}(${account.name}) gid=${account.gid}(${gname(account.gid)}) ` +
        `groups=${gids.map((g) => `${g}(${gname(g)})`).join(',')}\n`,
    );
  }
  return 0;
};

export const whoami: Command = ({ st, io }) => {
  io.out(`${accountByUid(st, uid(st))?.name ?? uid(st)}\n`);
  return 0;
};

export const groups: Command = ({ st, args, io }) => {
  const account = args[0] ? accountByName(st, args[0]) : accountByUid(st, uid(st));
  if (!account) {
    io.err(`groups: ${q(args[0])}: no such user\n`);
    return 1;
  }
  const names = groupsOf(st, account).map((g) => groupByGid(st, g)?.name ?? String(g)).join(' ');
  io.out(args[0] ? `${account.name} : ${names}\n` : `${names}\n`);
  return 0;
};

/** /etc/bashrc: UID 200 이상이고 기본 그룹 이름이 사용자 이름과 같으면 umask 002, 아니면 022. */
function bashrcUmask(st: ShellState, account: Account): number {
  return account.uid > 199 && groupByGid(st, account.gid)?.name === account.name ? 0o002 : 0o022;
}

export const su: Command = (ctx) => {
  const { st, io, args } = ctx;
  let login = false;
  let command: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-' || args[i] === '-l' || args[i] === '--login') login = true;
    else if (args[i] === '-c') command = args[++i];
    else rest.push(args[i]);
  }
  const name = rest[0] ?? 'root';
  const account = accountByName(st, name);
  if (!account) {
    io.err(`su: user ${name} does not exist\n`);
    return 1;
  }
  if (!isRoot(st)) {
    io.note('연습장에서는 비밀번호를 입력할 수 없어 일반 사용자에서 su 는 막아 두었어요. root 로 돌아가려면 exit 를 입력하세요.');
    return 1;
  }
  if (account.shell.endsWith('nologin')) {
    io.out('This account is currently not available.\n');
    return 1;
  }
  const s = session(st);
  let cwd = s.cwd;
  if (login) {
    cwd = account.home;
    if (!lookupPath(st, account.home)) {
      io.err(`su: warning: cannot change directory to ${account.home}: No such file or directory\n`);
      cwd = '/';
    }
  }
  const next = { uid: account.uid, cwd, umask: bashrcUmask(st, account), login };
  if (command !== undefined) {
    st.sessions.push({ ...next, umask: login ? next.umask : s.umask });
    const code = ctx.exec(['bash', '-c', command], io);
    st.sessions.pop();
    return code;
  }
  st.sessions.push(next);
  return 0;
};

export const exit: Command = ({ st, io }) => {
  if (st.sessions.length === 1) {
    io.note('연습장의 첫 셸이라 닫지 않았어요. 처음 상태로 돌아가려면 reset 을 입력하세요.');
    return 0;
  }
  const s = st.sessions.pop()!;
  if (s.login) io.out('logout\n');
  return 0;
};
