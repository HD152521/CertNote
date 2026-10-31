// 셸 한 줄을 실행한다: 해석 → 확장 → 리다이렉트 → 명령 실행 → 파이프·&&·|| 연결.
// 상태는 복사본을 고쳐서 돌려준다. 입력이 같으면 출력도 같다(가상 시계는 한 줄에 2초씩).
import * as accounts from './commands/accounts';
import type { Command, Io } from './commands/context';
import * as files from './commands/files';
import * as list from './commands/list';
import * as perms from './commands/perms';
import * as search from './commands/search';
import * as text from './commands/text';
import { FsError, can, createNode, node, resolve, resolveParent } from './fs';
import { expandWord, globToRegExp, parseLine, type SimpleCommand, type Word } from './parse';
import { accountByName, accountByUid, session } from './state';
import type { RunResult, ShellState } from './types';
import { errText } from './commands/context';

export const COMMANDS: Record<string, Command> = {
  pwd: files.pwd, cd: files.cd, mkdir: files.mkdir, rmdir: files.rmdir, touch: files.touch,
  cp: files.cp, mv: files.mv, rm: files.rm, ln: files.ln,
  ls: list.ls, stat: list.stat,
  cat: text.cat, head: text.head, tail: text.tail, wc: text.wc, echo: text.echo,
  chmod: perms.chmod, chown: perms.chown, chgrp: perms.chgrp, umask: perms.umask,
  useradd: accounts.useradd, usermod: accounts.usermod, userdel: accounts.userdel,
  groupadd: accounts.groupadd, groupdel: accounts.groupdel, passwd: accounts.passwd,
  id: accounts.id, whoami: accounts.whoami, groups: accounts.groups, su: accounts.su, exit: accounts.exit,
  find: search.find, grep: search.grep,
};

/** 실제 Rocky 에는 있지만 1단계에서 아직 흉내 내지 않는 명령. "command not found" 로 속이지 않고 안내한다. */
const NOT_YET = new Set([
  'vi', 'vim', 'nano', 'less', 'more', 'sort', 'uniq', 'cut', 'tr', 'sed', 'awk', 'tar', 'gzip', 'gunzip',
  'du', 'df', 'ps', 'top', 'kill', 'systemctl', 'crontab', 'firewall-cmd', 'mount', 'umount', 'fdisk',
  'chattr', 'lsattr', 'which', 'whereis', 'man', 'history', 'sudo', 'date', 'file', 'diff', 'tee', 'xargs',
  'ip', 'ifconfig', 'ping', 'ss', 'netstat', 'quota', 'edquota', 'rpm', 'dnf', 'yum', 'export', 'alias',
  'type', 'source', 'env', 'printf', 'test', 'readlink', 'basename', 'dirname', 'uname', 'hostname',
]);

/** Rocky 의 대화형 셸이 기본으로 갖는 별칭(coreutils 의 /etc/profile.d/colorls.sh: alias ll='ls -l --color=auto'). */
const ALIASES: Record<string, string[]> = { ll: ['ls', '-l'] };

export const SUPPORTED_LIST = Object.keys(COMMANDS).sort().join(' ');

const TICK = 2;
const MAX_DEPTH = 8;

function homeOf(st: ShellState, user?: string): string | undefined {
  const a = user ? accountByName(st, user) : accountByUid(st, session(st).uid);
  return a?.home;
}

function glob(st: ShellState, pattern: string): string[] {
  const absolute = pattern.startsWith('/');
  const parts = pattern.split('/').filter((p, i) => p !== '' || i === 0);
  let paths = [absolute ? '/' : ''];
  for (const part of parts) {
    if (part === '') continue;
    const next: string[] = [];
    for (const base of paths) {
      const join = (name: string) => (base === '' ? name : base === '/' ? `/${name}` : `${base}/${name}`);
      if (!/[*?[]/.test(part)) {
        next.push(join(part));
        continue;
      }
      let dir;
      try {
        dir = node(st, resolve(st, base || '.', true).ino);
      } catch {
        continue;
      }
      if (dir.type !== 'dir' || !can(st, dir, 'r')) continue;
      const re = globToRegExp(part);
      if (!re) continue;
      const names = Object.keys(dir.entries!)
        .filter((n) => (part.startsWith('.') || !n.startsWith('.')) && re.test(n))
        .sort();
      next.push(...names.map(join));
    }
    paths = next;
  }
  return paths.filter((p) => {
    try {
      resolve(st, p, false);
      return true;
    } catch {
      return false;
    }
  });
}

function expand(st: ShellState, words: Word[]): string[] {
  const s = session(st);
  const me = accountByUid(st, s.uid);
  const env = {
    vars: {
      HOME: me?.home ?? '/', USER: me?.name ?? '', LOGNAME: me?.name ?? '', PWD: s.cwd, OLDPWD: s.oldpwd ?? '',
      SHELL: me?.shell ?? '/bin/bash', HOSTNAME: st.hostname, UID: String(s.uid), '?': String(st.lastExit),
      PATH: s.uid === 0 ? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/root/bin' : '/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin',
    },
    home: (u?: string) => homeOf(st, u),
    glob: (p: string) => glob(st, p),
  };
  return words.flatMap((w) => expandWord(w, env));
}

interface Collected {
  stdout: string;
  stderr: string;
  notes: string[];
  commands: string[][];
}

/** > 파일에 쓴다. 쓰지 못하면 bash 가 내는 문구를 돌려준다. */
function writeTarget(st: ShellState, path: string, data: string, append: boolean): string | null {
  if (path === '/dev/null') return null;
  try {
    let n;
    try {
      n = node(st, resolve(st, path, true).ino);
    } catch (e) {
      if (!(e instanceof FsError) || e.errno !== 'ENOENT') throw e;
      const { dir, name } = resolveParent(st, path);
      if (!can(st, node(st, dir), 'w')) throw new FsError('EACCES');
      n = createNode(st, dir, name, 'file', 0o666 & ~session(st).umask, { content: '' });
    }
    if (n.type === 'dir') throw new FsError('EISDIR');
    if (n.generated) return `연습장에서는 ${path} 를 직접 고치지 않아요. useradd·usermod·groupadd 같은 명령으로 바꿔 주세요.`;
    if (!can(st, n, 'w')) throw new FsError('EACCES');
    n.content = append ? (n.content ?? '') + data : data;
    n.mtime = st.clock;
    n.ctime = st.clock;
    return null;
  } catch (e) {
    return `-bash: ${path}: ${errText(e)}\n`;
  }
}

class Runner {
  constructor(
    private st: ShellState,
    private out: Collected,
  ) {}

  /** argv 로 바로 실행 (find -exec, su -c) */
  exec = (argv: string[], io: Io, depth: number): number => {
    const [alias, ...rest] = argv;
    if (alias === undefined) return 0;
    const [name, ...args] = ALIASES[alias] ? [...ALIASES[alias], ...rest] : argv;
    if (depth > MAX_DEPTH) {
      io.err('-bash: maximum nesting level exceeded\n');
      return 1;
    }
    this.out.commands.push(argv);
    if (name === 'bash' || name === 'sh') {
      if (args[0] === '-c' && args[1] !== undefined) return this.line(args[1], io, depth + 1);
      io.note('새 셸을 여는 것은 연습장에서 지원하지 않아요. bash -c "명령" 은 쓸 수 있어요.');
      return 1;
    }
    if (name === 'help') {
      io.note(`지원하는 명령: ${SUPPORTED_LIST}. 그 밖에 clear(화면 정리), reset(처음 상태로).`);
      return 0;
    }
    const cmd = COMMANDS[name];
    if (cmd) return cmd({ st: this.st, name, args, io, exec: (a, i) => this.exec(a, i, depth + 1) });
    if (name.includes('/')) {
      io.note(`경로로 프로그램을 실행하는 것(${name})은 연습장에서 지원하지 않아요.`);
      return 126;
    }
    if (NOT_YET.has(name)) {
      io.note(`${name} 은(는) 실제 Rocky Linux 에 있는 명령이지만 연습장 1단계에서는 아직 지원하지 않아요. help 로 지원 목록을 볼 수 있어요.`);
      return 127;
    }
    io.err(`-bash: ${name}: command not found\n`);
    return 127;
  };

  private simple(cmd: SimpleCommand, stdin: string, stdoutTty: boolean, io: Io, depth: number): { code: number; stdout: string } {
    const st = this.st;
    const argv = expand(st, cmd.words);
    let input = stdin;
    let stdout = '';
    let stderr = '';
    const outTargets: { path: string; append: boolean }[] = [];
    let errTarget: { path: string; append: boolean } | null = null;
    let errToOut = false;
    for (const r of cmd.redirects) {
      if (r.op === '>&1') {
        errToOut = true;
        continue;
      }
      const path = expand(st, [r.target!])[0];
      if (r.fd === 0) {
        try {
          const n = node(st, resolve(st, path, true).ino);
          if (n.type === 'dir') throw new FsError('EISDIR');
          if (!can(st, n, 'r')) throw new FsError('EACCES');
          input = n.content ?? '';
        } catch (e) {
          io.err(`-bash: ${path}: ${errText(e)}\n`);
          return { code: 1, stdout: '' };
        }
        continue;
      }
      // 리다이렉트는 명령보다 먼저 파일을 만든다(명령이 실패해도 빈 파일이 남는다).
      const problem = writeTarget(st, path, '', r.op === '>>');
      if (problem) {
        if (problem.startsWith('-bash')) io.err(problem);
        else io.note(problem);
        return { code: 1, stdout: '' };
      }
      if (r.fd === 1) outTargets.push({ path, append: true });
      else errTarget = { path, append: true };
    }
    const tty = stdoutTty && outTargets.length === 0;
    const code = this.exec(argv, {
      stdin: input,
      stdoutTty: tty,
      out: (s) => {
        stdout += s;
      },
      err: (s) => {
        if (errToOut) stdout += s;
        else stderr += s;
      },
      note: io.note,
    }, depth);
    if (outTargets.length) {
      writeTarget(st, outTargets[outTargets.length - 1].path, stdout, true);
      stdout = '';
    }
    if (errTarget) writeTarget(st, errTarget.path, stderr, true);
    else io.err(stderr);
    return { code, stdout };
  }

  line = (line: string, io: Io, depth: number): number => {
    const parsed = parseLine(line);
    if (!parsed.ok) {
      if (parsed.unsupported) io.note(`${parsed.unsupported} 은(는) 연습장에서 아직 지원하지 않아요.`);
      else io.err(`${parsed.error}\n`);
      return parsed.unsupported ? 1 : 2;
    }
    let code = 0;
    let skip = false;
    for (const item of parsed.items) {
      if (!skip) {
        let stdin = '';
        const cmds = item.pipeline.commands;
        cmds.forEach((c, i) => {
          const last = i === cmds.length - 1;
          const r = this.simple(c, stdin, last && io.stdoutTty, io, depth);
          stdin = r.stdout;
          code = r.code;
          if (last) io.out(r.stdout);
        });
        this.st.lastExit = code;
      }
      if (item.next === '&&') skip = code !== 0;
      else if (item.next === '||') skip = code === 0;
      else skip = false;
    }
    return code;
  };
}

/** 한 줄 실행. 상태는 복사본을 고쳐 새로 돌려준다. */
export function runLine(line: string, state: ShellState): RunResult {
  const st = structuredClone(state);
  const out: Collected = { stdout: '', stderr: '', notes: [], commands: [] };
  if (!line.trim()) return { state, stdout: '', stderr: '', exitCode: state.lastExit, commands: [] };
  st.clock += TICK;
  const runner = new Runner(st, out);
  const code = runner.line(line, {
    stdin: '',
    stdoutTty: true,
    out: (s) => {
      out.stdout += s;
    },
    err: (s) => {
      out.stderr += s;
    },
    note: (s) => {
      out.notes.push(s);
    },
  }, 0);
  st.lastExit = code;
  return {
    state: st,
    stdout: out.stdout,
    stderr: out.stderr,
    exitCode: code,
    note: out.notes.length ? out.notes.join(' ') : undefined,
    commands: out.commands,
  };
}

/** 프롬프트: [root@localhost w]# */
export function prompt(st: ShellState): string {
  const s = session(st);
  const me = accountByUid(st, s.uid);
  const home = me?.home;
  const dir = s.cwd === home ? '~' : s.cwd === '/' ? '/' : s.cwd.split('/').pop();
  return `[${me?.name ?? s.uid}@${st.hostname} ${dir}]${s.uid === 0 ? '#' : '$'} `;
}
