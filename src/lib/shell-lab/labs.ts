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
        // 앞에서 무엇을 했든, 기호 모드로 "소유자 x 없음 + 그룹 w 있음" 이 되면 통과(754 에서 시작했다면 674).
        isDone: ({ state, result }) => {
          const m = perm(state, '/root/perm/report.txt');
          const symbolic = result.commands.some((argv) => argv[0] === 'chmod' && argv.slice(1).some((a) => /^[ugoa]*[-+=]/.test(a)));
          return symbolic && (m & 0o100) === 0 && (m & 0o020) !== 0;
        },
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
  {
    id: 'linux-shared-dir',
    code: 'LAB L4',
    topic: '특수 권한',
    title: '팀 공유 디렉터리 만들기: setgid 와 sticky bit',
    source: '리눅스마스터 2급 · 특수 권한(SetGID · Sticky bit)',
    workdir: '/srv',
    watch: '/srv/share',
    setup: ['useradd -m kim', 'useradd -m lee', 'groupadd dev', 'usermod -aG dev kim', 'usermod -aG dev lee', 'cd /srv'],
    steps: [
      {
        id: 'group',
        title: '공유 디렉터리를 dev 그룹 것으로',
        task: '/srv 아래에 share 디렉터리를 만들고, 그룹 소유자를 dev 로 바꾸세요. (kim·lee 는 이미 dev 그룹이에요)',
        hint: 'mkdir share → chgrp dev share',
        answer: 'mkdir share\nchgrp dev share\nls -ld share',
        takeaway: 'chgrp 는 그룹만, chown 은 소유자(와 그룹)를 바꿔요. chown :dev share 도 같은 결과예요.',
        isDone: ({ state }) => {
          const n = stat(state, '/srv/share');
          return n?.type === 'dir' && state.groups.find((g) => g.name === 'dev')?.gid === n.gid;
        },
      },
      {
        id: 'setgid',
        title: 'setgid 로 그룹 물려주기',
        task: 'share 에 그룹 쓰기 권한과 setgid 를 함께 주세요(rwxrwsr-x). 그다음 kim 으로 바꿔 share 안에 파일을 하나 만들고, 그 파일의 그룹을 확인하세요.',
        hint: 'setgid 는 맨 앞 자리 2 → chmod 2775 share. 사용자 바꾸기는 su kim, 돌아오기는 exit.',
        answer: 'chmod 2775 share\nsu kim\ntouch share/kim.txt\nls -l share\nexit',
        takeaway: 'setgid 디렉터리 안에서 만든 파일은 만든 사람의 기본 그룹(kim)이 아니라 디렉터리의 그룹(dev)을 물려받아요. 그룹 실행 칸이 s 로 보여요.',
        isDone: ({ state }) => {
          const dir = stat(state, '/srv/share');
          const kim = accountByName(state, 'kim');
          if (!dir?.entries || !(dir.mode & 0o2000) || !kim) return false;
          return Object.values(dir.entries).some((ino) => {
            const n = node(state, ino);
            return n.uid === kim.uid && n.gid === dir.gid;
          });
        },
      },
      {
        id: 'sticky',
        title: 'sticky bit 로 남의 파일 못 지우게',
        task: 'root 로 돌아와 share 에 sticky bit 를 더하세요. 그다음 lee 로 바꿔 kim 이 만든 파일을 지워 보세요.',
        hint: 'chmod +t share → su lee → rm -f share/<kim 이 만든 파일>',
        answer: 'chmod +t share\nsu lee\nrm -f share/kim.txt',
        takeaway: 'sticky bit(t)가 있으면 디렉터리에 쓰기 권한이 있어도 남의 파일은 지울 수 없어요(Operation not permitted). /tmp 가 drwxrwxrwt 인 이유예요.',
        isDone: ({ state, result }) =>
          ((stat(state, '/srv/share')?.mode ?? 0) & 0o1000) !== 0 && /Operation not permitted/.test(result.stderr),
      },
      {
        id: 'own',
        title: '내 파일은 지울 수 있다',
        task: '여전히 lee 인 상태에서, share 에 lee 의 파일을 만들었다가 지워 보세요.',
        hint: 'touch share/lee.txt → rm share/lee.txt',
        answer: 'touch share/lee.txt\nrm share/lee.txt',
        takeaway: 'sticky bit 는 "남의 것"만 막아요. 파일 소유자, 디렉터리 소유자, root 는 지울 수 있어요. 공유 디렉터리는 보통 2775 에 t 를 더한 3775 로 둬요.',
        isDone: ({ state, result }) =>
          session(state).uid === accountByName(state, 'lee')?.uid && ran(result, 'rm') && result.exitCode === 0,
      },
    ],
  },
  {
    id: 'linux-find',
    code: 'LAB L5',
    topic: 'find',
    title: 'find 로 조건에 맞는 파일 찾고 한꺼번에 처리하기',
    source: '리눅스마스터 2급 · 내용 보기와 찾기',
    workdir: '/root/find',
    watch: '/root/find/data/tmp',
    setup: [
      'useradd kim', 'mkdir -p /root/find/data/logs /root/find/data/tmp', 'cd /root/find',
      'touch data/app.conf data/logs/a.log data/tmp/x.tmp data/tmp/y.tmp', 'echo "started" > data/logs/b.log',
      'chmod 4755 data/app.conf', 'chown kim data/logs/a.log',
    ],
    steps: [
      {
        id: 'name',
        title: '이름으로 찾기',
        task: 'data 아래에서 이름이 .log 로 끝나는 파일을 모두 찾으세요.',
        hint: "find <어디서> -name '<패턴>'. 패턴은 따옴표로 감싸야 셸이 먼저 펼치지 않아요.",
        answer: "find data -name '*.log'",
        takeaway: "-name 은 대소문자를 가려요(-iname 은 안 가림). '*.log' 를 따옴표 없이 쓰면 지금 디렉터리에 .log 파일이 있을 때 셸이 먼저 펼쳐 엉뚱한 결과가 나와요.",
        isDone: ({ result }) => ran(result, 'find', 'name') && /a\.log/.test(result.stdout) && /b\.log/.test(result.stdout),
      },
      {
        id: 'perm',
        title: 'setuid 가 붙은 파일 찾기',
        task: 'data 아래에서 setuid 비트가 켜진 파일을 찾으세요. 보안 점검에서 자주 쓰는 명령이에요.',
        hint: '-perm -4000: setuid 비트가 "포함된" 파일. 앞의 - 는 "이 비트들이 모두 켜져 있으면"이라는 뜻이에요.',
        answer: 'find data -perm -4000',
        takeaway: '-perm 4000 은 권한이 정확히 4000 인 것, -perm -4000 은 4000 비트를 포함한 것, -perm /4000 은 하나라도 겹치는 것이에요. 시험에 셋의 차이가 나와요.',
        isDone: ({ result }) => ran(result, 'find', 'perm') && /app\.conf/.test(result.stdout),
      },
      {
        id: 'user',
        title: '소유자로 찾기',
        task: 'data 아래에서 kim 이 소유한 파일을 찾으세요.',
        hint: 'find data -user <사용자>',
        answer: 'find data -user kim',
        takeaway: '-user·-group 은 이름 대신 숫자(UID·GID)도 받아요. 지워진 사용자의 파일은 -nouser 로 찾아요.',
        isDone: ({ result }) => ran(result, 'find', 'user') && /a\.log/.test(result.stdout),
      },
      {
        id: 'exec',
        title: '찾아서 한꺼번에 지우기',
        task: 'data 아래의 .tmp 파일을 find 하나로 찾아서 모두 지우세요.',
        hint: '-exec <명령> {} \\; — {} 자리에 찾은 경로가 들어가고, \\; 가 명령의 끝을 알려요.',
        answer: "find data -name '*.tmp' -exec rm {} \\;",
        takeaway: '-exec ... \\; 는 찾은 파일마다 명령을 한 번씩, -exec ... {} + 는 모아서 한 번에 실행해요. 아래 띠에서 tmp 가 비는 걸 확인하세요.',
        isDone: ({ state, result }) =>
          ran(result, 'find', 'exec') && Object.keys(stat(state, '/root/find/data/tmp')?.entries ?? { x: 1 }).length === 0,
      },
    ],
  },
  {
    id: 'linux-grep-pipe',
    code: 'LAB L6',
    topic: 'grep · 파이프',
    title: 'grep 과 파이프로 /etc/passwd 읽기',
    source: '리눅스마스터 2급 · 내용 보기와 찾기, 리다이렉션',
    workdir: '/root',
    watch: '/home',
    setup: ['useradd -m kim', 'useradd -m lee', 'cd /root'],
    steps: [
      {
        id: 'bash',
        title: 'bash 를 쓰는 계정',
        task: '/etc/passwd 에서 로그인 셸이 bash 인 계정의 줄만 출력하세요.',
        hint: 'grep <찾을 말> <파일>',
        answer: 'grep bash /etc/passwd',
        takeaway: '/etc/passwd 의 일곱 칸은 이름:x:UID:GID:설명:홈:셸 이에요. 마지막 칸이 /sbin/nologin 이면 로그인할 수 없는 시스템 계정이에요.',
        isDone: ({ result }) => ran(result, 'grep') && /^kim:x:/m.test(result.stdout) && /^root:x:/m.test(result.stdout),
      },
      {
        id: 'count',
        title: '로그인 못 하는 계정 세기',
        task: 'nologin 이 들어 있는 줄이 몇 개인지 숫자 하나로 출력하세요.',
        hint: 'grep 의 -c 는 맞는 줄의 수를 세요.',
        answer: 'grep -c nologin /etc/passwd',
        takeaway: '-c 는 줄 수만, -n 은 줄 번호를 붙여, -v 는 맞지 않는 줄만, -i 는 대소문자 무시예요.',
        isDone: ({ state, result }) =>
          ran(result, 'grep', 'c') &&
          result.stdout.trim() === String(state.accounts.filter((a) => a.shell.endsWith('nologin')).length),
      },
      {
        id: 'pipe',
        title: '파이프로 이어 세기',
        task: '반대로 nologin 이 "아닌" 줄을 골라, 그 줄 수를 wc 로 세세요. 명령 두 개를 | 로 이어요.',
        hint: 'grep -v 로 고르고 | 뒤에 wc -l',
        answer: 'grep -v nologin /etc/passwd | wc -l',
        takeaway: '파이프(|)는 앞 명령의 출력을 뒤 명령의 입력으로 넘겨요. wc -l 은 줄 수, -w 는 단어 수, -c 는 바이트 수예요.',
        isDone: ({ state, result }) =>
          ran(result, 'grep', 'v') &&
          ran(result, 'wc') &&
          result.stdout.trim() === String(state.accounts.filter((a) => !a.shell.endsWith('nologin')).length),
      },
      {
        id: 'anchor',
        title: '줄 맨 앞에서만 찾기',
        task: '/etc/passwd 에서 kim 으로 시작하는 줄만, 줄 번호와 함께 출력하세요.',
        hint: '정규식 ^ 는 줄의 시작이에요. -n 으로 줄 번호를 붙여요.',
        answer: 'grep -n ^kim /etc/passwd',
        takeaway: '^ 는 줄의 시작, $ 는 줄의 끝이에요. ^root 는 root 로 시작하는 줄만, bash$ 는 bash 로 끝나는 줄만 골라요.',
        isDone: ({ result }) =>
          ran(result, 'grep', 'n') && /^\d+:kim:x:/m.test(result.stdout) && result.stdout.trim().split('\n').length === 1,
      },
    ],
  },
  {
    id: 'linux-ownership',
    code: 'LAB L7',
    topic: '소유권',
    title: 'chown·chgrp 로 프로젝트 소유권 넘기기',
    source: '리눅스마스터 2급 · 소유권과 umask',
    workdir: '/srv',
    watch: '/srv/proj',
    setup: ['useradd -m kim', 'groupadd dev', 'mkdir -p /srv/proj/src', 'touch /srv/proj/README /srv/proj/src/main.c', 'cd /srv'],
    steps: [
      {
        id: 'chown',
        title: '파일 하나의 소유자 바꾸기',
        task: 'proj/README 의 소유자를 kim 으로 바꾸세요.',
        hint: 'chown <사용자> <파일>',
        answer: 'chown kim proj/README',
        takeaway: '소유자만 바꾸면 그룹은 그대로(root) 남아요. ls -l 의 셋째 칸이 소유자, 넷째 칸이 그룹이에요.',
        isDone: ({ state }) => stat(state, '/srv/proj/README')?.uid === accountByName(state, 'kim')?.uid,
      },
      {
        id: 'recursive',
        title: '디렉터리 통째로 넘기기',
        task: 'proj 디렉터리와 그 안의 모든 것을 소유자 kim, 그룹 dev 로 한 번에 바꾸세요.',
        hint: 'chown 의 -R(재귀)과 사용자:그룹 형식',
        answer: 'chown -R kim:dev proj\nls -lR proj',
        takeaway: '-R 이 없으면 디렉터리 자신만 바뀌고 안쪽은 그대로예요. 사용자:그룹 대신 사용자.그룹 도 받지만 : 가 표준이에요.',
        isDone: ({ state }) => {
          const kim = accountByName(state, 'kim')?.uid;
          const dev = state.groups.find((g) => g.name === 'dev')?.gid;
          return ['/srv/proj', '/srv/proj/README', '/srv/proj/src', '/srv/proj/src/main.c'].every((p) => {
            const n = stat(state, p);
            return n?.uid === kim && n?.gid === dev;
          });
        },
      },
      {
        id: 'chgrp',
        title: '그룹만 바꾸기',
        task: 'proj/src/main.c 의 그룹만 root 로 되돌리세요. 소유자(kim)는 그대로 둬요.',
        hint: 'chgrp <그룹> <파일>',
        answer: 'chgrp root proj/src/main.c',
        takeaway: 'chgrp root 파일 은 chown :root 파일 과 같아요. 시험에서는 두 표현을 섞어 보기로 내요.',
        isDone: ({ state }) => {
          const n = stat(state, '/srv/proj/src/main.c');
          return n?.gid === 0 && n.uid === accountByName(state, 'kim')?.uid;
        },
      },
      {
        id: 'denied',
        title: '일반 사용자는 소유자를 못 넘긴다',
        task: 'kim 으로 바꾼 뒤, kim 의 파일인 proj/README 의 소유자를 root 로 넘겨 보세요.',
        hint: 'su kim → chown root proj/README',
        answer: 'su kim\nchown root proj/README',
        takeaway: '소유자 변경은 root 만 할 수 있어요. 내 파일이라도 남에게 넘길 수 없어요(Operation not permitted). 그룹은 내가 속한 그룹으로만 바꿀 수 있어요.',
        isDone: ({ state, result }) =>
          session(state).uid !== 0 && /changing ownership .*Operation not permitted/.test(result.stderr),
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
