// 리눅스 셸 연습 과제. 통과 판정은 명령 문자열이 아니라 결과(파일 시스템·계정 상태, 실행 결과)로 한다.
import { node, resolve } from './fs';
import { runLine } from './run';
import { accountByName, createInitialState, session } from './state';
import type { Inode, RunResult, ShellState } from './types';

export interface ShellStepInput {
  state: ShellState;
  result: RunResult;
}

export interface ShellLabStep {
  id: string;
  title: string;
  task: string;
  hint: string;
  answer: string;
  /** 통과 뒤에 보여 주는 시험 포인트 */
  takeaway: string;
  isDone: (input: ShellStepInput) => boolean;
}

export interface ShellLab {
  id: string;
  code: string;
  topic: string;
  title: string;
  source: string;
  /** 과제를 시작할 디렉터리. 아래 띠에서 이 디렉터리의 내용을 계속 보여 준다. */
  workdir: string;
  /** 아래 띠에서 지켜볼 디렉터리. 없으면 workdir. */
  watch?: string;
  /** 처음 상태를 만드는 명령. 학습자에게 보이지 않는다. */
  setup: string[];
  steps: ShellLabStep[];
}

function stat(st: ShellState, path: string, follow = false): Inode | null {
  try {
    return node(st, resolve(st, path, follow).ino);
  } catch {
    return null;
  }
}

const perm = (st: ShellState, path: string) => (stat(st, path)?.mode ?? -1) & 0o7777;
const ran = (r: RunResult, name: string, flag?: string) =>
  r.commands.some((argv) => argv[0] === name && (!flag || argv.slice(1).some((a) => a.startsWith('-') && a.includes(flag))));

/** 작업 디렉터리 안에서 setup 에 없던 새 항목 중 조건에 맞는 것이 있나 */
function created(st: ShellState, dir: string, skip: string[], test: (n: Inode) => boolean): boolean {
  const d = stat(st, dir, true);
  if (!d?.entries) return false;
  return Object.entries(d.entries).some(([name, ino]) => !skip.includes(name) && test(node(st, ino)));
}

export const SHELL_LABS: ShellLab[] = [
  {
    id: 'linux-perm-basics',
    code: 'LAB L1',
    topic: '권한',
    title: '숫자와 기호로 권한 바꾸고 umask 확인하기',
    source: '리눅스마스터 2급 · 파일 시스템 관련 명령어, 권한 및 그룹 설정',
    workdir: '/root/perm',
    setup: ['mkdir /root/perm', 'cd /root/perm', 'echo "weekly report" > report.txt', 'touch run.sh'],
    steps: [
      {
        id: 'octal',
        title: '숫자로: rwxr-xr--',
        task: 'report.txt 의 권한을 소유자 rwx, 그룹 r-x, 기타 r-- 로 바꾸세요. 바꾼 뒤 ls -l 로 확인해 보세요.',
        hint: 'r=4, w=2, x=1 을 더해요. 소유자 7, 그룹 5, 기타 4.',
        answer: 'chmod 754 report.txt',
        takeaway: '숫자 모드는 세 자리를 한 번에 덮어써요. 754 → rwxr-xr--. 시험에서는 반대로 "-rwxr-x--- 를 숫자로" 처럼 묻기도 해요(750).',
        isDone: ({ state }) => perm(state, '/root/perm/report.txt') === 0o754,
      },
      {
        id: 'symbolic',
        title: '기호로: 소유자 실행 빼고 그룹 쓰기 더하기',
        task: '숫자 대신 기호 모드로, report.txt 에서 소유자의 실행 권한을 빼고 그룹에 쓰기 권한을 더하세요.',
        hint: '대상(u·g·o·a) + 연산(+ - =) + 권한(r w x). 두 가지 변경은 쉼표로 이어요.',
        answer: 'chmod u-x,g+w report.txt',
        takeaway: '기호 모드는 말한 비트만 바꾸고 나머지는 그대로 둬요. 754 에서 u-x,g+w 를 하면 674(rw-rwxr--)가 돼요.',
        isDone: ({ state, result }) => perm(state, '/root/perm/report.txt') === 0o674 && ran(result, 'chmod'),
      },
      {
        id: 'umask',
        title: 'umask 027 에서 새로 만들기',
        task: 'umask 를 027 로 바꾼 뒤 새 파일 하나와 새 디렉터리 하나를 만들고, ls -l 로 권한을 확인하세요.',
        hint: 'umask 027 → touch 새파일 → mkdir 새디렉터리 → ls -l',
        answer: 'umask 027\ntouch memo.txt\nmkdir logs\nls -l',
        takeaway: '새 파일은 666, 디렉터리는 777 에서 umask 를 빼요. 027 이면 파일 640(rw-r-----), 디렉터리 750(rwxr-x---). 파일은 처음부터 실행 권한이 없어요.',
        isDone: ({ state }) =>
          session(state).umask === 0o027 &&
          created(state, '/root/perm', ['report.txt', 'run.sh'], (n) => n.type === 'file' && (n.mode & 0o777) === 0o640) &&
          created(state, '/root/perm', [], (n) => n.type === 'dir' && (n.mode & 0o777) === 0o750),
      },
      {
        id: 'setuid',
        title: '특수 권한 읽기',
        task: 'run.sh 에 setuid 를 붙이고(4755), ls -l 로 소유자 실행 칸이 어떻게 보이는지 확인하세요.',
        hint: '특수 권한은 맨 앞 자리: setuid 4, setgid 2, sticky 1.',
        answer: 'chmod 4755 run.sh\nls -l run.sh',
        takeaway: '소유자 실행 칸에 s 가 보여요(rwsr-xr-x). 실행 권한 없이 setuid 만 있으면 대문자 S 예요. /usr/bin/passwd 가 대표적인 setuid 파일이에요.',
        isDone: ({ state, result }) => perm(state, '/root/perm/run.sh') === 0o4755 && ran(result, 'ls'),
      },
    ],
  },
  {
    id: 'linux-links',
    code: 'LAB L2',
    topic: '링크',
    title: '하드 링크와 심볼릭 링크 구분하기',
    source: '리눅스마스터 2급 · 파일 시스템 관련 명령어',
    workdir: '/root/links',
    setup: ['mkdir /root/links', 'cd /root/links', 'echo "original data" > notes.txt'],
    steps: [
      {
        id: 'hard',
        title: '하드 링크 만들기',
        task: 'notes.txt 의 하드 링크 hard.txt 를 만드세요.',
        hint: 'ln <원본> <링크 이름>',
        answer: 'ln notes.txt hard.txt',
        takeaway: '하드 링크는 같은 inode 에 이름을 하나 더 붙여요. 그래서 ls -l 의 링크 수가 1 → 2 로 늘어요.',
        isDone: ({ state }) => (stat(state, '/root/links/notes.txt')?.nlink ?? 0) >= 2,
      },
      {
        id: 'soft',
        title: '심볼릭 링크 만들기',
        task: 'notes.txt 를 가리키는 심볼릭 링크 soft.txt 를 만드세요.',
        hint: 'ln 에 -s 옵션',
        answer: 'ln -s notes.txt soft.txt',
        takeaway: '심볼릭 링크는 원본 "경로"를 담은 별개의 파일이에요. 권한은 항상 lrwxrwxrwx 로 보이고, 크기는 경로 글자 수(9)예요.',
        isDone: ({ state }) => stat(state, '/root/links/soft.txt')?.type === 'link',
      },
      {
        id: 'inode',
        title: 'inode 번호 비교',
        task: 'inode 번호까지 보이게 목록을 출력하세요. 어느 둘이 같은 번호인가요?',
        hint: 'ls 에 -i 를 더해요. -l 과 함께 쓰면 링크 수도 보여요.',
        answer: 'ls -li',
        takeaway: 'notes.txt 와 hard.txt 는 inode 가 같고, soft.txt 는 달라요. 하드 링크는 다른 파일 시스템이나 디렉터리에는 만들 수 없어요.',
        isDone: ({ result }) => ran(result, 'ls', 'i') && result.exitCode === 0,
      },
      {
        id: 'delete',
        title: '원본을 지우면?',
        task: 'notes.txt 를 지운 뒤 hard.txt 와 soft.txt 를 각각 cat 으로 읽어 보세요.',
        hint: 'rm notes.txt → cat hard.txt → cat soft.txt',
        answer: 'rm notes.txt\ncat hard.txt\ncat soft.txt',
        takeaway: '하드 링크는 내용이 그대로 남고, 심볼릭 링크는 가리키던 경로가 사라져 "No such file or directory" 가 나요(깨진 링크).',
        isDone: ({ state, result }) =>
          !stat(state, '/root/links/notes.txt') && ran(result, 'cat') && result.exitCode !== 0 && /soft\.txt/.test(result.stderr),
      },
    ],
  },
  {
    id: 'linux-users',
    code: 'LAB L3',
    topic: '사용자',
    title: '사용자를 만들고 그 사용자로 권한 거부 겪어 보기',
    source: '리눅스마스터 2급 · 사용자와 그룹, 권한',
    workdir: '/root',
    watch: '/home',
    setup: ['cd /root'],
    steps: [
      {
        id: 'useradd',
        title: '사용자 만들기',
        task: '홈 디렉터리를 가진 일반 사용자 kim 을 만들고 id 로 확인하세요.',
        hint: 'useradd -m <이름> → id <이름>',
        answer: 'useradd -m kim\nid kim',
        takeaway: 'Rocky 는 사용자를 만들 때 같은 이름의 그룹도 만들어요(USERGROUPS_ENAB). 첫 일반 사용자의 UID·GID 는 1000 이에요.',
        isDone: ({ state }) => !!accountByName(state, 'kim'),
      },
      {
        id: 'group',
        title: '보조 그룹 추가',
        task: 'dev 그룹을 만들고, kim 의 기존 그룹은 그대로 둔 채 dev 를 보조 그룹으로 더하세요.',
        hint: 'groupadd dev → usermod -aG dev kim. -a 없이 -G 만 쓰면 기존 보조 그룹이 지워져요.',
        answer: 'groupadd dev\nusermod -aG dev kim\nid kim',
        takeaway: 'usermod -G 는 보조 그룹 목록을 "덮어쓰기", -aG 는 "더하기"예요. 시험에 자주 나오는 함정이에요.',
        isDone: ({ state }) => state.groups.some((g) => g.name === 'dev' && g.members.includes('kim')),
      },
      {
        id: 'denied',
        title: 'kim 으로 바꿔 /root 들여다보기',
        task: 'su 로 kim 이 된 다음 /root 의 목록을 보세요. 무슨 일이 생기나요?',
        hint: 'su - kim → whoami → ls /root',
        answer: 'su - kim\nls /root',
        takeaway: '/root 는 dr-xr-x---(550)이라 기타 사용자에게 읽기·실행 권한이 없어요. root 는 권한 검사를 받지 않지만 일반 사용자는 받아요.',
        isDone: ({ state, result }) => session(state).uid !== 0 && /Permission denied/.test(result.stderr),
      },
      {
        id: 'cleanup',
        title: 'root 로 돌아와 정리하기',
        task: 'exit 로 root 로 돌아온 뒤, kim 을 홈 디렉터리까지 함께 지우세요.',
        hint: 'exit → userdel -r kim',
        answer: 'exit\nuserdel -r kim',
        takeaway: 'userdel 만 쓰면 /home/kim 이 남아요. -r 을 붙여야 홈과 메일 스풀(/var/spool/mail/kim)까지 지워요.',
        isDone: ({ state }) => !accountByName(state, 'kim') && !stat(state, '/home/kim'),
      },
    ],
  },
];

/** 과제의 처음 상태. setup 명령을 실행하고 시계·종료 코드는 처음처럼 되돌린다. */
export function labInitialState(lab: ShellLab): ShellState {
  let st = createInitialState();
  const start = st.clock;
  for (const line of lab.setup) st = runLine(line, st).state;
  return { ...st, clock: start, lastExit: 0 };
}
