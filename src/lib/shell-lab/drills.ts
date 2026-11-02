// 리눅스마스터 1급 2차 "작업식" 실기 연습. 문항마다 처음 상태가 따로 있고, 판정은 명령 글자가 아니라
// 실행한 뒤의 상태로 한다 — chmod 750 이든 chmod u=rwx,g=rx,o= 이든 결과가 같으면 정답이다.
import { node, resolve } from './fs';
import { runLine } from './run';
import { accountByName, createInitialState, groupByName, session } from './state';
import type { Inode, RunResult, ShellState } from './types';

export interface DrillItem {
  id: string;
  title: string;
  /** 시험지처럼 쓴 지문 */
  prompt: string;
  /** 지문 아래 [조건] 목록 */
  conditions: string[];
  /** 처음 상태를 만드는 명령. 학습자에게 보이지 않는다. */
  setup: string[];
  /** 모범 답안(여러 줄이면 차례로) */
  answer: string;
  /** 채점 뒤 보여 주는 해설: 왜 이 답인지, 시험에서 자주 틀리는 곳 */
  explain: string;
  isDone: (input: { state: ShellState; result: RunResult }) => boolean;
}

export interface ShellDrill {
  id: string;
  code: string;
  title: string;
  items: DrillItem[];
}

function stat(st: ShellState, path: string): Inode | null {
  try {
    return node(st, resolve(st, path, false).ino);
  } catch {
    return null;
  }
}

const mode = (st: ShellState, path: string) => (stat(st, path)?.mode ?? -1) & 0o7777;
const uidOf = (st: ShellState, name: string) => accountByName(st, name)?.uid;
const gidOf = (st: ShellState, name: string) => groupByName(st, name)?.gid;
const textOf = (st: ShellState, path: string) => stat(st, path)?.content ?? null;
const lines = (text: string | null) => (text ?? '').split('\n').filter(Boolean);

/** dir 아래(자기 자신 포함) 모든 항목이 조건을 만족하나 */
function everyUnder(st: ShellState, path: string, test: (n: Inode) => boolean): boolean {
  const root = stat(st, path);
  if (!root) return false;
  const visit = (n: Inode): boolean =>
    test(n) && Object.values(n.entries ?? {}).every((ino) => visit(node(st, ino)));
  return visit(root);
}

const PERM: DrillItem[] = [
  {
    id: 'octal',
    title: '스크립트 권한 지정',
    prompt: '/data/report.sh 의 권한을 [조건]에 맞게 설정하시오.',
    conditions: ['소유자는 읽기·쓰기·실행', '그룹은 읽기·실행', '그 외 사용자는 아무 권한도 없음'],
    setup: ['mkdir /data', 'echo "echo report" > /data/report.sh', 'chmod 644 /data/report.sh', 'cd /data'],
    answer: 'chmod 750 /data/report.sh',
    explain:
      'rwx=7, r-x=5, ---=0 이라 750 이다. 기호로 쓰면 chmod u=rwx,g=rx,o= /data/report.sh 이고 결과는 같다. 실기에서는 숫자·기호 어느 쪽이든 결과가 맞으면 정답이지만, 답안을 짧고 틀릴 일 없게 쓰려면 숫자 모드가 낫다.',
    isDone: ({ state }) => mode(state, '/data/report.sh') === 0o750,
  },
  {
    id: 'mkdir-m',
    title: '처음부터 권한을 정해 디렉터리 만들기',
    prompt: '명령 한 줄로 /data/secret 디렉터리를 만들면서 권한을 소유자만 모든 권한을 갖도록 지정하시오.',
    conditions: ['디렉터리를 만든 뒤 chmod 를 따로 쓰지 말 것', '최종 권한 rwx------'],
    setup: ['mkdir /data', 'cd /data'],
    answer: 'mkdir -m 700 /data/secret',
    explain:
      'mkdir -m 은 만들면서 바로 권한을 정한다. umask 와 상관없이 지정한 값이 그대로 들어간다는 점이 mkdir 뒤 chmod 와 같고, 한 줄로 끝난다는 점이 다르다.',
    // 이 줄에서 mkdir -m 으로 만들었어야 한다(mkdir 뒤 chmod 로 맞춘 것은 조건 위반).
    isDone: ({ state, result }) =>
      stat(state, '/data/secret')?.type === 'dir' &&
      mode(state, '/data/secret') === 0o700 &&
      result.commands.some((a) => a[0] === 'mkdir' && a.slice(1).some((x) => /^-[a-zA-Z]*m/.test(x) || x.startsWith('--mode'))),
  },
  {
    id: 'umask',
    title: 'umask 로 기본 권한 정하기',
    prompt: '앞으로 새로 만드는 디렉터리의 권한이 rwxr-x--- 가 되도록 현재 셸의 umask 를 설정하시오.',
    conditions: ['이미 있는 파일의 권한은 바꾸지 않음'],
    setup: ['mkdir /data', 'cd /data'],
    answer: 'umask 027',
    explain:
      '디렉터리 기본값 777 에서 umask 를 빼면 된다: 777 - 027 = 750(rwxr-x---). 같은 umask 에서 새 파일은 666 에서 빼므로 640 이 된다. "파일은 666, 디렉터리는 777 에서 뺀다" 가 계산 문제의 핵심이다.',
    isDone: ({ state }) => session(state).umask === 0o027,
  },
  {
    id: 'setuid',
    title: 'SetUID 붙이기',
    prompt: '/data/bin/tool 을 실행하는 사용자가 누구든 파일 소유자의 권한으로 실행되도록 설정하시오.',
    conditions: ['나머지 권한(rwxr-xr-x)은 그대로 둘 것'],
    setup: ['mkdir -p /data/bin', 'touch /data/bin/tool', 'chmod 755 /data/bin/tool', 'cd /data/bin'],
    answer: 'chmod u+s /data/bin/tool',
    explain:
      '소유자 권한으로 실행되게 하는 것이 SetUID 이고 숫자로는 4000 이다. chmod 4755 /data/bin/tool 도 같은 결과다. ls -l 에서 소유자 실행 자리가 s 로 바뀐다(실행 권한 없이 붙으면 대문자 S).',
    isDone: ({ state }) => mode(state, '/data/bin/tool') === 0o4755,
  },
  {
    id: 'setgid-dir',
    title: '그룹 공유 디렉터리',
    prompt: '/data/share 를 dev 그룹이 함께 쓰는 디렉터리로 만드시오.',
    conditions: [
      '디렉터리의 소유 그룹은 dev',
      '그룹 구성원은 이 디렉터리에 파일을 만들 수 있어야 함',
      '이 디렉터리에 새로 만든 파일은 만든 사람과 상관없이 dev 그룹 소유가 되어야 함',
    ],
    setup: ['groupadd dev', 'mkdir -p /data/share', 'cd /data'],
    answer: 'chgrp dev /data/share\nchmod 2775 /data/share',
    explain:
      '그룹 상속은 디렉터리의 SetGID(2000)가 한다. chmod g+ws 로 써도 된다. chgrp 대신 chown :dev /data/share 도 같다. SetGID 를 파일에 붙이면 "그룹 권한으로 실행", 디렉터리에 붙이면 "그룹 상속" 이라는 차이가 단골 문제다.',
    isDone: ({ state }) => {
      const n = stat(state, '/data/share');
      return !!n && n.gid === gidOf(state, 'dev') && (n.mode & 0o2000) !== 0 && (n.mode & 0o030) === 0o030;
    },
  },
  {
    id: 'sticky',
    title: '누구나 쓰되 남의 파일은 못 지우게',
    prompt: '/data/pub 을 모든 사용자가 파일을 만들 수 있는 디렉터리로 설정하시오.',
    conditions: ['모든 사용자에게 읽기·쓰기·실행 허용', '자기가 만든 파일이 아니면 지우거나 이름을 바꿀 수 없어야 함'],
    setup: ['mkdir -p /data/pub', 'cd /data'],
    answer: 'chmod 1777 /data/pub',
    explain:
      '남의 파일을 못 지우게 하는 것이 Sticky bit(1000)이고, /tmp 가 바로 1777 이다. chmod a+rwx,o+t /data/pub 도 같다. ls -l 에서 기타 사용자 실행 자리가 t 로 보인다.',
    isDone: ({ state }) => mode(state, '/data/pub') === 0o1777,
  },
  {
    id: 'chown-r',
    title: '디렉터리 통째로 소유권 넘기기',
    prompt: '/data/app 디렉터리와 그 아래 모든 파일·디렉터리의 소유자를 kim, 소유 그룹을 dev 로 바꾸시오.',
    conditions: ['명령 한 줄로 처리'],
    setup: [
      'useradd -m kim',
      'groupadd dev',
      'mkdir -p /data/app/conf /data/app/log',
      'touch /data/app/run.sh /data/app/conf/app.conf /data/app/log/app.log',
      'cd /data',
    ],
    answer: 'chown -R kim:dev /data/app',
    explain:
      '-R 이 하위까지 바꾼다. 소유자와 그룹은 kim:dev 처럼 콜론으로 한 번에 쓴다(kim.dev 도 받아 주지만 옛 표기다). -R 을 빼면 /data/app 자신만 바뀐다.',
    isDone: ({ state, result }) => {
      const uid = uidOf(state, 'kim');
      const gid = gidOf(state, 'dev');
      const recursive = result.commands.some((a) => a[0] === 'chown' && a.slice(1).some((x) => /^-[a-zA-Z]*R/.test(x)));
      return recursive && everyUnder(state, '/data/app', (n) => n.uid === uid && n.gid === gid);
    },
  },
];

const USERS: DrillItem[] = [
  {
    id: 'useradd',
    title: '조건에 맞춰 사용자 만들기',
    prompt: '[조건]에 맞는 사용자 devkim 을 생성하시오.',
    conditions: ['UID 1500', '홈 디렉터리 /home/devkim (실제로 생성)', '로그인 셸 /bin/sh', '보조 그룹 dev'],
    setup: ['groupadd dev'],
    answer: 'useradd -u 1500 -d /home/devkim -m -s /bin/sh -G dev devkim',
    explain:
      '-u UID, -d 홈 경로, -m 홈 디렉터리 실제 생성, -s 셸, -G 보조 그룹이다. -g(소문자)는 기본 그룹이라 -G 와 헷갈리면 틀린다. Rocky 는 기본적으로 홈을 만들어 주지만, 시험에서는 -m 을 써서 의도를 드러내는 편이 안전하다.',
    isDone: ({ state }) => {
      const a = accountByName(state, 'devkim');
      const home = stat(state, '/home/devkim');
      return (
        !!a &&
        a.uid === 1500 &&
        a.home === '/home/devkim' &&
        a.shell === '/bin/sh' &&
        !!groupByName(state, 'dev')?.members.includes('devkim') &&
        home?.type === 'dir' &&
        home.uid === 1500
      );
    },
  },
  {
    id: 'usermod-ag',
    title: '보조 그룹 더하기',
    prompt: '사용자 lee 를 wheel 그룹에 추가하시오.',
    conditions: ['lee 가 이미 속한 보조 그룹 dev 에서 빠지면 안 됨'],
    setup: ['groupadd dev', 'useradd -m -G dev lee'],
    answer: 'usermod -aG wheel lee',
    explain:
      '-a 없이 usermod -G wheel lee 를 치면 보조 그룹이 wheel 하나로 "바뀌어" dev 에서 빠진다. 실기에서 가장 자주 감점되는 부분이다. gpasswd -a lee wheel 도 같은 결과다.',
    isDone: ({ state }) =>
      !!groupByName(state, 'wheel')?.members.includes('lee') && !!groupByName(state, 'dev')?.members.includes('lee'),
  },
  {
    id: 'lock',
    title: '계정 잠그기',
    prompt: '퇴사 예정인 사용자 kim 이 비밀번호로 로그인하지 못하도록 계정을 잠그시오.',
    conditions: ['계정과 홈 디렉터리는 지우지 말 것'],
    setup: ['useradd -m kim'],
    answer: 'passwd -l kim',
    explain:
      'passwd -l 은 /etc/shadow 의 비밀번호 앞에 ! 를 붙여 잠근다. usermod -L kim 도 같은 동작이다. 푸는 것은 passwd -u / usermod -U. passwd -S kim 으로 상태(LK)를 확인할 수 있다.',
    isDone: ({ state }) => !!accountByName(state, 'kim')?.locked && stat(state, '/home/kim')?.type === 'dir',
  },
  {
    id: 'userdel-r',
    title: '홈 디렉터리까지 지우기',
    prompt: '사용자 park 을 삭제하시오.',
    conditions: ['park 의 홈 디렉터리와 그 안의 파일도 함께 삭제'],
    setup: ['useradd -m park', 'touch /home/park/memo.txt'],
    answer: 'userdel -r park',
    explain:
      '-r 이 없으면 계정만 지워지고 /home/park 은 주인 없는(UID 숫자로만 보이는) 디렉터리로 남는다. 남은 파일은 나중에 같은 UID 로 만든 사용자가 갖게 되므로 보안상 위험하다.',
    isDone: ({ state }) => !accountByName(state, 'park') && !stat(state, '/home/park'),
  },
  {
    id: 'groupadd',
    title: 'GID 를 정해 그룹 만들기',
    prompt: 'GID 가 3000 인 그룹 ops 를 생성하시오.',
    conditions: [],
    setup: [],
    answer: 'groupadd -g 3000 ops',
    explain: 'groupadd 의 -g 가 GID 를 정한다. 만든 결과는 /etc/group 에 ops:x:3000: 으로 한 줄 추가된다(grep ops /etc/group 으로 확인).',
    isDone: ({ state }) => gidOf(state, 'ops') === 3000,
  },
  {
    id: 'find-suid',
    title: 'SetUID 파일 목록 저장',
    prompt: '/var/data 아래에서 SetUID 가 설정된 파일을 모두 찾아 그 경로를 /root/suid.txt 에 저장하시오.',
    conditions: ['한 줄에 경로 하나', '디렉터리는 제외'],
    setup: [
      'mkdir -p /var/data/bin /var/data/lib',
      'touch /var/data/bin/a /var/data/bin/b /var/data/lib/c /var/data/lib/d',
      'chmod 4755 /var/data/bin/a',
      'chmod 4711 /var/data/lib/c',
      'chmod 2755 /var/data/lib/d',
      'cd /root',
    ],
    answer: 'find /var/data -type f -perm -4000 > /root/suid.txt',
    explain:
      '-perm -4000 은 "4000 비트가 켜져 있으면(나머지는 상관없이)" 이다. -perm 4000 처럼 - 를 빼면 권한이 정확히 4000 인 파일만 찾아서 빈 결과가 된다. 2755 인 d 는 SetGID 라 빠져야 한다.',
    isDone: ({ state }) =>
      lines(textOf(state, '/root/suid.txt')).sort().join(',') === '/var/data/bin/a,/var/data/lib/c',
  },
  {
    id: 'grep-count',
    title: '조건에 맞는 줄 수 세기',
    prompt: '/etc/passwd 에서 로그인 셸이 /bin/bash 인 계정의 수를 /root/bash_count.txt 에 저장하시오.',
    conditions: ['파일에는 숫자만 저장'],
    setup: ['useradd -m kim', 'useradd -m -s /bin/sh lee', 'useradd -m park', 'cd /root'],
    answer: "grep -c '/bin/bash$' /etc/passwd > /root/bash_count.txt",
    explain:
      'grep -c 가 맞는 줄 수를 센다. grep /bin/bash /etc/passwd | wc -l 도 같다. $ 로 줄 끝을 고정하면 /bin/bash 가 셸 칸에 있는 줄만 센다. 이 상태에서는 root, kim, park 이 bash 라 3 이다.',
    isDone: ({ state }) => (textOf(state, '/root/bash_count.txt') ?? '').trim() === '3',
  },
  {
    id: 'find-exec',
    title: '특정 사용자 파일 한꺼번에 지우기',
    prompt: '/tmp/work 아래에서 소유자가 kim 인 파일만 모두 삭제하시오.',
    conditions: ['다른 사용자 소유 파일과 디렉터리는 남겨 둘 것'],
    setup: [
      'useradd -m kim',
      'useradd -m lee',
      'mkdir -p /tmp/work/sub',
      'touch /tmp/work/k1 /tmp/work/sub/k2 /tmp/work/l1 /tmp/work/sub/l2',
      'chown kim /tmp/work/k1 /tmp/work/sub/k2',
      'chown lee /tmp/work/l1 /tmp/work/sub/l2',
      'cd /tmp/work',
    ],
    answer: 'find /tmp/work -user kim -type f -exec rm {} \\;',
    explain:
      '-exec 명령 {} \\; 은 찾은 파일마다 명령을 실행한다. {} 자리에 경로가 들어가고 \\; 이 명령의 끝이다. -type f 를 빼면 kim 소유 디렉터리까지 지우려다 오류가 난다. -exec rm {} + 로 쓰면 한 번에 묶어서 실행한다.',
    isDone: ({ state }) => {
      const kim = uidOf(state, 'kim');
      return (
        everyUnder(state, '/tmp/work', (n) => n.uid !== kim) &&
        !!stat(state, '/tmp/work/l1') &&
        !!stat(state, '/tmp/work/sub/l2')
      );
    },
  },
];

export const SHELL_DRILLS: ShellDrill[] = [
  { id: 'linux-practical-perm', code: '실기 P1', title: '권한·소유권 작업형 문제 7선', items: PERM },
  { id: 'linux-practical-users', code: '실기 P2', title: '계정·검색 작업형 문제 8선', items: USERS },
];

export function drillInitialState(item: DrillItem): ShellState {
  let st = createInitialState();
  for (const line of item.setup) st = runLine(line, st).state;
  return { ...st, lastExit: 0 };
}
