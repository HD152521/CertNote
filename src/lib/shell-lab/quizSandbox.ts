// 퀴즈 문항의 명령을 바로 쳐 볼 수 있는 연습 상태.
// "chmod g-w file.txt" 를 치면 file.txt 가 있어야 의미가 있으므로, 명령들이 건드리는 파일·디렉터리·사용자·그룹을
// 미리 만들어 둔다. 반대로 useradd kim 처럼 새로 만드는 명령의 대상은 미리 만들지 않는다.
import { exists } from './fs';
import { parseLine, type Word } from './parse';
import { runLine } from './run';
import { accountByName, createInitialState, groupByName } from './state';
import type { ShellState } from './types';

export const SANDBOX_DIR = '/root/practice';

const SAMPLE_LINES = ['INFO server started', 'ERROR disk full', 'warning: low memory', 'error: retry failed', 'INFO user kim login', 'DEBUG done'];

/** 값을 하나 받는 짧은 옵션 글자(그 다음 낱말이나 묶음의 나머지는 파일이 아니다) */
const OPT_WITH_VALUE: Record<string, string> = {
  head: 'nc', tail: 'nc', grep: 'efmABC', useradd: 'gGdsucek', usermod: 'gGdsucle', groupadd: 'g', passwd: 'nxwi',
};

interface Needs {
  files: Set<string>;
  dirs: Set<string>;
  users: Set<string>;
  groups: Set<string>;
  /** 명령이 새로 만들 이름 — 미리 만들면 "already exists" 가 된다 */
  newUsers: Set<string>;
  newGroups: Set<string>;
}

const isPlainPath = (s: string) => /^[A-Za-z0-9_./-]+$/.test(s) && s !== '.' && s !== '..' && !s.startsWith('-');
const isName = (s: string) => /^[a-z_][a-z0-9_-]*$/.test(s);

interface Args {
  /** 옵션과 옵션 값을 뺀 위치 인자 */
  pos: string[];
  /** 값을 받은 옵션: -G wheel, -aG wheel, -Gwheel 모두 G → wheel */
  values: Record<string, string>;
}

/** getopt 처럼 -aG wheel 같은 묶음을 풀어 위치 인자와 옵션 값을 나눈다 */
function parseArgs(name: string, args: string[]): Args {
  const withValue = OPT_WITH_VALUE[name] ?? '';
  const pos: string[] = [];
  const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    // chmod -x file 의 -x 는 옵션이 아니라 모드다.
    if (name === 'chmod' && /^-[rwxXstugoa,+=0-7-]+$/.test(a)) pos.push(a);
    else if (a.startsWith('--') || a === '-' || !a.startsWith('-')) {
      if (!a.startsWith('--')) pos.push(a);
    } else {
      const j = [...a.slice(1)].findIndex((c) => withValue.includes(c));
      if (j < 0) continue;
      const rest = a.slice(j + 2);
      values[a[j + 1]] = rest || args[++i] || '';
    }
  }
  return { pos, values };
}

/** 특수 권한 중 sticky·setgid 는 보통 디렉터리에 붙인다(chmod 1777 /tmp, chmod g+s shared) */
const DIR_MODE = /^[123567][0-7]{3}$|[+=][a-z]*t|g[a-z]*[+=][a-z]*s/;
const hasExtension = (p: string) => /\.\w+$/.test(p);

/** *.txt 같은 단순 와일드카드는 걸리는 파일 두 개를 만든다 */
function addPath(set: Set<string>, path: string) {
  if (/^[A-Za-z0-9_./-]*\*[A-Za-z0-9_.-]*$/.test(path)) {
    set.add(path.replace('*', 'a'));
    set.add(path.replace('*', 'b'));
  } else if (isPlainPath(path)) set.add(path);
  // 그 밖(따옴표·공백이 든 이름 등)은 만들지 않는다 — setup 명령 문자열을 깨뜨릴 수 있다.
}

function collect(name: string, args: string[], needs: Needs) {
  const { pos, values } = parseArgs(name, args);
  const recursive = args.some((a) => /^-[a-zA-Z]*[rR]/.test(a));
  const groupsIn = () => [values.g, ...(values.G?.split(',') ?? [])].filter((g): g is string => !!g && isName(g));
  switch (name) {
    case 'chmod': {
      const toDir = (p: string) => recursive || (DIR_MODE.test(pos[0] ?? '') && !hasExtension(p));
      pos.slice(1).forEach((p) => addPath(toDir(p) ? needs.dirs : needs.files, p));
      break;
    }
    case 'find':
      pos.forEach((p) => addPath(needs.dirs, p));
      break;
    case 'chown':
    case 'chgrp': {
      const [owner = '', ...paths] = pos;
      const [user, group] = name === 'chgrp' ? ['', owner] : owner.split(/[:.]/);
      if (user && isName(user)) needs.users.add(user);
      if (group && isName(group)) needs.groups.add(group);
      paths.forEach((p) => addPath(recursive ? needs.dirs : needs.files, p));
      break;
    }
    case 'grep':
      (args.includes('-e') ? pos : pos.slice(1)).forEach((p) => addPath(recursive ? needs.dirs : needs.files, p));
      break;
    case 'cp':
    case 'mv':
    case 'ln':
      pos.slice(0, pos.length > 1 ? -1 : undefined).forEach((p) => addPath(recursive ? needs.dirs : needs.files, p));
      break;
    case 'cat': case 'head': case 'tail': case 'wc': case 'stat': case 'rm':
      pos.forEach((p) => addPath(recursive ? needs.dirs : needs.files, p));
      break;
    case 'ls':
      pos.filter((p) => /\.\w+$/.test(p)).forEach((p) => addPath(needs.files, p));
      break;
    case 'cd': case 'rmdir':
      pos.forEach((p) => addPath(needs.dirs, p));
      break;
    case 'useradd':
      pos.forEach((u) => needs.newUsers.add(u));
      groupsIn().forEach((g) => needs.groups.add(g));
      break;
    case 'groupadd':
      pos.forEach((g) => needs.newGroups.add(g));
      break;
    case 'usermod':
      pos.filter(isName).forEach((u) => needs.users.add(u));
      groupsIn().forEach((g) => needs.groups.add(g));
      break;
    case 'userdel': case 'passwd': case 'id': case 'groups': case 'su':
      pos.filter(isName).forEach((u) => needs.users.add(u));
      break;
    case 'groupdel':
      pos.filter(isName).forEach((g) => needs.groups.add(g));
      break;
    default:
  }
}

const quote = (s: string) => `'${s}'`;
const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) || '/' : '');

export function quizSandboxState(commands: string[]): ShellState {
  const needs: Needs = { files: new Set(), dirs: new Set(), users: new Set(), groups: new Set(), newUsers: new Set(), newGroups: new Set() };
  for (const line of commands) {
    const parsed = parseLine(line);
    if (!parsed.ok) continue;
    for (const item of parsed.items) {
      for (const cmd of item.pipeline.commands) {
        const [head, ...rest] = cmd.words.map((w: Word) => w.text);
        if (head) collect(head, rest, needs);
      }
    }
  }

  let st = createInitialState();
  const run = (line: string) => {
    try {
      st = runLine(line, st).state;
    } catch {
      // 준비 명령 하나가 실패해도 연습 셸은 열려야 한다.
    }
  };
  run(`mkdir ${SANDBOX_DIR}`);
  run(`cd ${SANDBOX_DIR}`);
  for (const g of needs.groups) if (!needs.newGroups.has(g) && !groupByName(st, g)) run(`groupadd ${g}`);
  for (const u of needs.users) if (!needs.newUsers.has(u) && !accountByName(st, u)) run(`useradd -m ${u}`);
  for (const d of needs.dirs) {
    if (exists(st, d)) continue;
    run(`mkdir -p ${quote(d)}`);
    run(`echo "${SAMPLE_LINES[0]}" > ${quote(`${d}/sample.txt`)}`);
  }
  for (const f of needs.files) {
    if (exists(st, f)) continue;
    const parent = parentOf(f);
    if (parent && !exists(st, parent)) run(`mkdir -p ${quote(parent)}`);
    SAMPLE_LINES.forEach((l, i) => run(`echo "${l}" ${i ? '>>' : '>'} ${quote(f)}`));
  }
  return { ...st, lastExit: 0 };
}
