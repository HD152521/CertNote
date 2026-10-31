// 리눅스 셸 연습장의 상태 모델. 기준은 Rocky Linux 8.8 (GNU coreutils 8.30, bash 4.4, shadow-utils 4.6).

export type NodeType = 'file' | 'dir' | 'link' | 'chr';

/** /etc/passwd 같은 계정 파일은 내용을 들고 있지 않고 계정 목록에서 만든다 — 둘이 어긋날 수 없게. */
export type GeneratedFile = 'passwd' | 'group' | 'shadow';

export interface Inode {
  ino: number;
  type: NodeType;
  /** 권한 비트 + 특수 비트(07777) */
  mode: number;
  uid: number;
  gid: number;
  nlink: number;
  /** 가상 시계(초) */
  atime: number;
  mtime: number;
  ctime: number;
  /** 만든 시각(stat 의 Birth). 처음 뼈대의 노드는 mtime 을 쓴다. */
  btime?: number;
  /** 디렉터리: 이름 → inode. '.'·'..' 은 넣지 않는다. */
  entries?: Record<string, number>;
  /** 디렉터리의 부모 inode ('..') */
  parent?: number;
  content?: string;
  target?: string;
  generated?: GeneratedFile;
  /** 장치 파일의 주·부 번호. 예: '1, 3' */
  rdev?: string;
}

export interface Account {
  name: string;
  uid: number;
  gid: number;
  comment: string;
  home: string;
  shell: string;
  /** /etc/shadow 의 비밀번호 칸: 'none' 은 !!(설정 안 됨), 'set' 은 해시, 'empty' 는 빈 칸(passwd -d), 'system' 은 * */
  password: 'none' | 'set' | 'empty' | 'system';
  locked: boolean;
  /** 마지막 비밀번호 변경일(1970-01-01 부터 일 수) */
  lastChange: number;
}

export interface Group {
  name: string;
  gid: number;
  members: string[];
}

export interface Session {
  uid: number;
  /** 논리 경로(bash 의 PWD). 심볼릭 링크로 들어온 경로를 그대로 둔다. */
  cwd: string;
  oldpwd?: string;
  umask: number;
  /** su - 로 들어온 로그인 셸이면 exit 할 때 logout 을 찍는다. */
  login: boolean;
}

export interface ShellState {
  inodes: Record<number, Inode>;
  nextIno: number;
  accounts: Account[];
  groups: Group[];
  /** su 로 쌓인 셸. 마지막이 지금 셸이다. */
  sessions: Session[];
  /** 가상 시계(유닉스 초). 명령 한 줄마다 조금씩 흐른다. */
  clock: number;
  /** 표시용 시간대(분). 기본 +540(KST). */
  tzOffsetMin: number;
  lastExit: number;
  hostname: string;
}

export interface RunResult {
  state: ShellState;
  stdout: string;
  stderr: string;
  exitCode: number;
  /** 실제 셸 출력이 아니라 연습장이 덧붙이는 한국어 안내 */
  note?: string;
  /** 실행한 명령 이름들(파이프·목록 순서). 과제 판정에 쓴다. */
  commands: string[][];
}
