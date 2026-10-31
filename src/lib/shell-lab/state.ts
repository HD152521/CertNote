// 처음 상태: Rocky Linux 8.8 이미지의 디렉터리 뼈대와 계정. 파일 크기·시각·권한은 이미지에서 확인한 값이다.
import { BASE_FILE_TEXT } from './baseFiles';
import type { Account, Group, Inode, NodeType, ShellState } from './types';

const BASE_PASSWD = `root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/bin:/sbin/nologin
daemon:x:2:2:daemon:/sbin:/sbin/nologin
adm:x:3:4:adm:/var/adm:/sbin/nologin
lp:x:4:7:lp:/var/spool/lpd:/sbin/nologin
sync:x:5:0:sync:/sbin:/bin/sync
shutdown:x:6:0:shutdown:/sbin:/sbin/shutdown
halt:x:7:0:halt:/sbin:/sbin/halt
mail:x:8:12:mail:/var/spool/mail:/sbin/nologin
operator:x:11:0:operator:/root:/sbin/nologin
games:x:12:100:games:/usr/games:/sbin/nologin
ftp:x:14:50:FTP User:/var/ftp:/sbin/nologin
nobody:x:65534:65534:Kernel Overflow User:/:/sbin/nologin
tss:x:59:59:Account used for TPM access:/dev/null:/sbin/nologin
dbus:x:81:81:System message bus:/:/sbin/nologin
systemd-coredump:x:999:997:systemd Core Dumper:/:/sbin/nologin
systemd-resolve:x:193:193:systemd Resolver:/:/sbin/nologin`;

const BASE_GROUP = `root:x:0:
bin:x:1:
daemon:x:2:
sys:x:3:
adm:x:4:
tty:x:5:
disk:x:6:
lp:x:7:
mem:x:8:
kmem:x:9:
wheel:x:10:
cdrom:x:11:
mail:x:12:
man:x:15:
dialout:x:18:
floppy:x:19:
games:x:20:
tape:x:33:
video:x:39:
ftp:x:50:
lock:x:54:
audio:x:63:
users:x:100:
nobody:x:65534:
utmp:x:22:
utempter:x:35:
tss:x:59:
dbus:x:81:
input:x:999:
kvm:x:36:
render:x:998:
systemd-journal:x:190:
systemd-coredump:x:997:
systemd-resolve:x:193:`;

// 이미지에 찍힌 시각(UTC 초)
const T_2021 = 1633910400; // 2021-10-11 — 기본 디렉터리
const T_2023 = 1684380446; // 2023-05-18 — 이미지 빌드
const T_SKEL = 1659426099; // 2022-08-02 — /etc/skel
const T_ROOT_DOT = 1615750543; // 2021-03-14 — /root 의 점 파일
const T_PASSWD_BIN = 1650412174; // 2022-04-19 — /usr/bin/passwd
const SYSTEM_PW_DAY = 19326;

/** 테스트와 처음 화면이 같은 시각에서 출발하도록 고정한 시작 시각: 2026-10-31 09:00 KST */
export const DEFAULT_CLOCK = 1793404800;
export const MAIL_GID = 12;
/** /usr/bin/passwd 처럼 내용 대신 크기만 아는 실행 파일 */
export const BINARY_SIZE: Record<string, number> = { passwd: 33424 };

export function parsePasswd(text: string): Account[] {
  return text.split('\n').map((line) => {
    const [name, , uid, gid, comment, home, shell] = line.split(':');
    return {
      name, uid: Number(uid), gid: Number(gid), comment, home, shell,
      password: name === 'root' ? 'set' : 'system', locked: false, lastChange: SYSTEM_PW_DAY,
    };
  });
}

function parseGroup(text: string): Group[] {
  return text.split('\n').map((line) => {
    const [name, , gid, members] = line.split(':');
    return { name, gid: Number(gid), members: members ? members.split(',') : [] };
  });
}

interface NodeSpec {
  type: NodeType;
  mode: number;
  time: number;
  uid?: number;
  gid?: number;
  content?: string;
  target?: string;
}

/** 처음 뼈대를 만드는 데만 쓰는 작은 빌더. 만든 뒤로는 fs.ts 의 함수로만 바꾼다. */
function builder() {
  const inodes: Record<number, Inode> = {};
  let next = 2;
  const add = (parent: number | null, name: string, spec: NodeSpec): number => {
    const ino = next++;
    const node: Inode = {
      ino, type: spec.type, mode: spec.mode, uid: spec.uid ?? 0, gid: spec.gid ?? 0,
      nlink: spec.type === 'dir' ? 2 : 1, atime: spec.time, mtime: spec.time, ctime: spec.time,
    };
    if (spec.type === 'dir') node.entries = {};
    if (spec.content !== undefined) node.content = spec.content;
    if (spec.target !== undefined) node.target = spec.target;
    inodes[ino] = node;
    if (parent === null) {
      node.parent = ino;
    } else {
      const dir = inodes[parent];
      dir.entries![name] = ino;
      if (spec.type === 'dir') {
        node.parent = parent;
        dir.nlink += 1;
      }
    }
    return ino;
  };
  return { inodes, add, nextIno: () => next };
}

const dir = (mode: number, time = T_2021, gid = 0): NodeSpec => ({ type: 'dir', mode, time, gid });
const link = (target: string, time = T_2021): NodeSpec => ({ type: 'link', mode: 0o777, time, target });
const text = (path: string, mode: number, time: number): NodeSpec => ({
  type: 'file', mode, time, content: BASE_FILE_TEXT[path],
});

export function createInitialState(options: { clock?: number; tzOffsetMin?: number } = {}): ShellState {
  const b = builder();
  const root = b.add(null, '', dir(0o755, T_2023));
  b.add(root, 'bin', link('usr/bin'));
  const dev = b.add(root, 'dev', dir(0o755, T_2023));
  const devNull = b.add(dev, 'null', { type: 'chr', mode: 0o666, time: T_2023 });
  b.inodes[devNull].rdev = '1, 3';
  const etc = b.add(root, 'etc', dir(0o755, T_2023));
  for (const name of ['group', 'passwd'] as const) {
    const ino = b.add(etc, name, { type: 'file', mode: 0o644, time: T_2023 });
    b.inodes[ino].generated = name;
  }
  const shadow = b.add(etc, 'shadow', { type: 'file', mode: 0o000, time: T_2023 });
  b.inodes[shadow].generated = 'shadow';
  const skel = b.add(etc, 'skel', dir(0o755, T_2023));
  for (const f of ['.bash_logout', '.bash_profile', '.bashrc']) b.add(skel, f, text(`/etc/skel/${f}`, 0o644, T_SKEL));
  b.add(root, 'home', dir(0o755));
  b.add(root, 'lib', link('usr/lib'));
  b.add(root, 'lib64', link('usr/lib64'));
  for (const name of ['media', 'mnt', 'opt']) b.add(root, name, dir(0o755));
  const rootHome = b.add(root, 'root', dir(0o550, T_2023));
  for (const f of ['.bash_logout', '.bash_profile', '.bashrc', '.cshrc', '.tcshrc']) {
    b.add(rootHome, f, text(`/root/${f}`, 0o644, T_ROOT_DOT));
  }
  b.add(root, 'run', dir(0o755, T_2023));
  b.add(root, 'sbin', link('usr/sbin', T_2021));
  b.add(root, 'srv', dir(0o755));
  b.add(root, 'tmp', dir(0o1777, T_2023));
  const usr = b.add(root, 'usr', dir(0o755, T_2023));
  const usrBin = b.add(usr, 'bin', dir(0o755, T_2023));
  b.add(usrBin, 'passwd', { type: 'file', mode: 0o4755, time: T_PASSWD_BIN });
  for (const name of ['lib', 'lib64', 'local', 'sbin', 'share']) b.add(usr, name, dir(0o755, T_2023));
  const varDir = b.add(root, 'var', dir(0o755, T_2023));
  b.add(varDir, 'log', dir(0o755, T_2023));
  b.add(varDir, 'mail', link('spool/mail'));
  const spool = b.add(varDir, 'spool', dir(0o755, T_2023));
  b.add(spool, 'mail', dir(0o775, T_2021, MAIL_GID));
  b.add(varDir, 'tmp', dir(0o1777, T_2023));

  return {
    inodes: b.inodes,
    nextIno: b.nextIno(),
    accounts: parsePasswd(BASE_PASSWD),
    groups: parseGroup(BASE_GROUP),
    sessions: [{ uid: 0, cwd: '/root', umask: 0o022, login: true }],
    clock: options.clock ?? DEFAULT_CLOCK,
    tzOffsetMin: options.tzOffsetMin ?? 540,
    lastExit: 0,
    hostname: 'localhost',
  };
}

export const ROOT_INO = 2;

export const session = (st: ShellState) => st.sessions[st.sessions.length - 1];
export const accountByUid = (st: ShellState, uid: number) => st.accounts.find((a) => a.uid === uid);
export const accountByName = (st: ShellState, name: string) => st.accounts.find((a) => a.name === name);
export const groupByGid = (st: ShellState, gid: number) => st.groups.find((g) => g.gid === gid);
export const groupByName = (st: ShellState, name: string) => st.groups.find((g) => g.name === name);
export const userName = (st: ShellState, uid: number) => accountByUid(st, uid)?.name ?? String(uid);
export const groupName = (st: ShellState, gid: number) => groupByGid(st, gid)?.name ?? String(gid);
export const today = (st: ShellState) => Math.floor(st.clock / 86400);

/** 사용자가 속한 모든 그룹 gid. 기본 그룹이 맨 앞. */
export function groupsOf(st: ShellState, account: Account): number[] {
  const extra = st.groups.filter((g) => g.members.includes(account.name) && g.gid !== account.gid).map((g) => g.gid);
  return [account.gid, ...extra];
}

/** /etc/passwd·group·shadow 내용을 계정 목록에서 만든다. */
export function generatedText(st: ShellState, kind: 'passwd' | 'group' | 'shadow'): string {
  if (kind === 'passwd') {
    return st.accounts.map((a) => `${a.name}:x:${a.uid}:${a.gid}:${a.comment}:${a.home}:${a.shell}\n`).join('');
  }
  if (kind === 'group') return st.groups.map((g) => `${g.name}:x:${g.gid}:${g.members.join(',')}\n`).join('');
  return st.accounts
    .map((a) => {
      if (a.name === 'root') return `root:${a.locked ? '!' : ''}$6$certnote$examplehash:${a.lastChange}:0:99999:7:::\n`;
      if (a.password === 'system') return `${a.name}:*:${a.lastChange}:0:99999:7:::\n`;
      const hash = a.password === 'set' ? '$6$certnote$examplehash' : a.password === 'empty' ? '' : '!!';
      return `${a.name}:${a.locked ? '!' : ''}${hash}:${a.lastChange}:0:99999:7:::\n`;
    })
    .join('');
}
