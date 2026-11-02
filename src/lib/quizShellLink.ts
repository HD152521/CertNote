// 리눅스 퀴즈 문항 → 셸 연습장 연결.
// 문항 글에서 시뮬레이터가 돌릴 수 있는 명령을 뽑고, 주제가 맞는 실습 과제를 고른다.
// 일 페이지(퀴즈)마다 실리는 모듈이라 시뮬레이터 엔진을 import 하지 않는다 — 명령 목록이 엔진과 같은지는
// quizShellLink.test.ts 가 확인한다. 실제 셸은 버튼을 눌렀을 때 QuizShell 이 지연 로드한다.
import { parseCorrectSet } from '@/lib/quiz/correctness';

/** shell-lab/run.ts 의 COMMANDS 이름 + 별칭 ll */
export const SHELL_COMMAND_NAMES = [
  'cat', 'cd', 'chgrp', 'chmod', 'chown', 'cp', 'echo', 'exit', 'find', 'grep', 'groupadd', 'groupdel', 'groups',
  'head', 'id', 'll', 'ln', 'ls', 'mkdir', 'mv', 'passwd', 'pwd', 'rm', 'rmdir', 'stat', 'su', 'tail', 'touch',
  'umask', 'useradd', 'userdel', 'usermod', 'wc', 'whoami',
] as const;

const NAMES = new Set<string>(SHELL_COMMAND_NAMES);
/** 인자 없이 쳐도 뜻이 있는 명령 */
const STANDALONE = new Set(['pwd', 'id', 'whoami', 'umask', 'groups', 'ls', 'll']);
const MAX_COMMANDS = 4;

export interface QuizShellInput {
  slug: string;
  prompt: string;
  choices: { label: string; text: string }[];
  answer: string;
  explanation?: string;
}

export interface QuizShellPlan {
  /** 셸에 바로 넣어 볼 명령. 정답 보기의 명령이 먼저 온다. */
  commands: string[];
  /** 같은 주제를 단계별로 연습하는 실습 과제 id (labCatalog) */
  labId: string | null;
}

/** 특수 권한(setgid·sticky)은 공유 디렉터리 실습에서 다룬다 */
const SPECIAL_BITS = /setgid|sgid|sticky|스티키|\b[123]7[0-7]{2}\b|g\+s|o\+t|\+t\b/i;

/** 문항에 명령이 있으면 그 명령 이름으로 실습을 고른다 */
const LAB_BY_COMMAND: Record<string, string> = {
  chmod: 'linux-perm-basics', umask: 'linux-perm-basics',
  chown: 'linux-ownership', chgrp: 'linux-ownership',
  ln: 'linux-links', find: 'linux-find', grep: 'linux-grep-pipe', wc: 'linux-grep-pipe',
  useradd: 'linux-users', usermod: 'linux-users', userdel: 'linux-users', groupadd: 'linux-users',
  groupdel: 'linux-users', passwd: 'linux-users', su: 'linux-users', id: 'linux-users', groups: 'linux-users',
};

/** 명령이 없거나 명령으로 못 고를 때 글로 고른다. 좁은 주제부터 본다. */
const LAB_BY_TEXT: { labId: string; test: RegExp }[] = [
  { labId: 'linux-shared-dir', test: SPECIAL_BITS },
  { labId: 'linux-find', test: /\bfind\b/ },
  { labId: 'linux-grep-pipe', test: /\bgrep\b|\bwc\b|파이프/ },
  { labId: 'linux-ownership', test: /\bchown\b|\bchgrp\b|소유권|소유 그룹/ },
  { labId: 'linux-users', test: /useradd|usermod|userdel|groupadd|\/etc\/passwd|\/etc\/shadow|\bsu\b|\bpasswd\b/ },
  { labId: 'linux-links', test: /\bln\b|하드 ?링크|심볼릭 ?링크|inode|아이노드/i },
  { labId: 'linux-perm-basics', test: /chmod|umask|권한|setuid|suid|rwx|r-x/i },
];

function pickLab(commands: string[], all: string): string | null {
  for (const line of commands) {
    const lab = LAB_BY_COMMAND[line.split(/\s+/)[0]];
    if (!lab) continue;
    return lab === 'linux-perm-basics' && SPECIAL_BITS.test(all) ? 'linux-shared-dir' : lab;
  }
  return LAB_BY_TEXT.find((r) => r.test.test(all))?.labId ?? null;
}

/** "chmod 755 file" 처럼 시뮬레이터가 돌릴 수 있는 한 줄인가 */
export function isRunnable(text: string): boolean {
  const line = text.trim();
  if (!line || line.length > 120) return false;
  // 자리표시(<파일>, [옵션], ...)·한글 설명이 섞인 문법 요약은 실제 명령이 아니다.
  if (/[가-힣]|\[[^\]]*\]|\.\.\.|…/.test(line)) return false;
  if (/[<{]|\$\(|`/.test(line.replace(/2?>>?|<(?=\s)/g, ''))) return false;
  const words = line.split(/\s+/);
  if (!NAMES.has(words[0]) || words[0] === 'exit') return false;
  return words.length > 1 || STANDALONE.has(words[0]);
}

function codeSpans(text: string): string[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
}

/** 보기 글 자체가 명령이거나(chmod 755 file), 안에 `명령` 이 들어 있거나 */
function commandsIn(text: string): string[] {
  const spans = codeSpans(text);
  return spans.length ? spans : [text.trim()];
}

export function quizShellPlan(q: QuizShellInput): QuizShellPlan | null {
  if (!q.slug.startsWith('linux-master')) return null;
  const correct = parseCorrectSet(q.answer);
  const right = q.choices.filter((c) => correct.has(c.label));
  const wrong = q.choices.filter((c) => !correct.has(c.label));
  const ordered = [
    ...right.flatMap((c) => commandsIn(c.text)),
    ...codeSpans(q.prompt),
    ...wrong.flatMap((c) => commandsIn(c.text)),
    ...codeSpans(q.explanation ?? ''),
  ];
  const commands = [...new Set(ordered.filter(isRunnable))].slice(0, MAX_COMMANDS);

  const all = [q.prompt, ...q.choices.map((c) => c.text), q.explanation ?? ''].join('\n');
  const labId = pickLab(commands, all);

  if (!commands.length && !labId) return null;
  return { commands, labId };
}
