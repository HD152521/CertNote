// "실습" 카테고리의 목록. 사이드바·/lab 목록·/lab/[id] 페이지·사이트맵이 이 한 곳을 본다.
// 과제 내용(단계·판정)은 각 엔진의 labs.ts 에 있다. 사이드바(모든 페이지에 실림)가 시뮬레이터 엔진을
// 끌어오지 않도록 여기서는 엔진을 import 하지 않는다 — 코드·제목이 엔진과 같은지는 labCatalog.test.ts 가 본다.

export type LabKind = 'linux' | 'practical' | 'sql' | 'aws';

export interface LabEntry {
  id: string;
  kind: LabKind;
  code: string;
  title: string;
  /** 목록 카드·메타 설명에 쓰는 한두 문장 */
  summary: string;
  /** 상세 페이지 첫머리. 무엇을 손으로 겪는지, 시험과 어떻게 이어지는지 */
  intro: string[];
  related: { href: string; label: string }[];
}

export const LAB_GROUPS: { kind: LabKind; title: string; description: string }[] = [
  {
    kind: 'linux',
    title: '리눅스 셸',
    description:
      '리눅스마스터 2급 범위(파일 시스템 명령어, 권한, 사용자와 그룹)를 Rocky Linux 8.8 시뮬레이터에서 직접 쳐 봅니다. 출력과 오류 문구는 실제 Rocky 8.8 에서 찍은 결과와 하나하나 비교해 맞췄습니다.',
  },
  {
    kind: 'practical',
    title: '리눅스마스터 실기 대비',
    description:
      '1급 2차의 작업형처럼 조건을 주고 그대로 만들어 내는 문제입니다. 명령 글자가 아니라 실행 뒤의 상태로 채점해서, chmod 750 이든 chmod u=rwx,g=rx,o= 이든 결과가 맞으면 정답입니다. 문제마다 모범 답안의 결과를 실제 Rocky 8.8 에서 확인했습니다.',
  },
  {
    kind: 'sql',
    title: 'SQL (SQLD)',
    description:
      'SQLD 시험 문법(Oracle) 그대로 EMP·DEPT·SALGRADE 예제 테이블에 SQL 을 실행해 봅니다. 결과와 오류 문구는 실제 Oracle Database 에서 찍은 결과와 하나하나 비교해 맞췄고, 과제는 쿼리 글자가 아니라 결과로 채점해 같은 결과를 내는 다른 쿼리도 정답입니다.',
  },
  {
    kind: 'aws',
    title: 'AWS CLI',
    description:
      'AWS CLI v2 를 흉내 낸 가상 계정에서 리전·S3·IAM 을 다뤄 봅니다. 시험에 명령어 철자는 나오지 않지만, 명령을 치며 겪는 동작(ZoneId, 버전 관리, 정책이 붙은 사용자 삭제)은 그대로 출제됩니다.',
  },
];

const LINUX_INFO: Record<string, Omit<LabEntry, 'id' | 'kind' | 'code' | 'title'>> = {
  'linux-perm-basics': {
    summary: 'chmod 숫자·기호 모드, umask 로 정해지는 새 파일 권한, setuid 가 ls -l 에 어떻게 보이는지 직접 확인합니다.',
    intro: [
      '권한 문제는 리눅스마스터 2급에서 거의 매 회차 나옵니다. "rwxr-x--- 를 숫자로", "umask 027 일 때 새 디렉터리의 권한" 처럼 계산을 묻는 문항이 많아, 한 번 손으로 바꿔 보고 ls -l 로 확인해 두면 헷갈리지 않습니다.',
      '이 실습은 report.txt 와 run.sh 두 파일이 있는 /root/perm 에서 시작합니다. 명령을 칠 때마다 아래 띠에 권한 문자열이 바뀌는 것이 보입니다.',
    ],
    related: [
      { href: '/linux/linux-master-2/week4/day1', label: '권한의 구조: rwx와 8진수' },
      { href: '/linux/linux-master-2/week4/day2', label: '소유권과 umask' },
      { href: '/linux/linux-master-2/week4/day3', label: '특수 권한: SetUID · SetGID · Sticky bit' },
    ],
  },
  'linux-links': {
    summary: '하드 링크와 심볼릭 링크를 만들고 inode 번호와 링크 수를 비교한 뒤, 원본을 지웠을 때 두 링크가 어떻게 달라지는지 봅니다.',
    intro: [
      '하드 링크와 심볼릭 링크의 차이는 그림으로 외우기보다 inode 번호를 직접 보는 편이 빠릅니다. 하드 링크는 같은 inode 에 이름을 하나 더 붙이는 것이고, 심볼릭 링크는 경로를 담은 별개의 파일입니다.',
      '이 실습은 notes.txt 하나가 있는 /root/links 에서 시작합니다. ls -li 의 첫 칸(inode)과 셋째 칸(링크 수)을 눈여겨보세요.',
    ],
    related: [
      { href: '/linux/linux-master-2/week2/day3', label: '파일 시스템: 나눈 공간에 무엇을 씌울 것인가' },
      { href: '/linux/linux-master-2/week3/day2', label: '디렉터리와 파일 다루기' },
    ],
  },
  'linux-users': {
    summary: 'useradd 로 사용자를 만들고 usermod -aG 로 보조 그룹을 더한 뒤, su 로 그 사용자가 되어 권한 거부를 직접 겪습니다.',
    intro: [
      'root 로만 연습하면 권한 검사가 늘 통과해서 권한이 왜 중요한지 느끼기 어렵습니다. 일반 사용자를 하나 만들고 그 사용자로 바꿔 /root 를 들여다보면 Permission denied 가 무엇을 막는지 바로 보입니다.',
      'usermod -G 와 -aG 의 차이, userdel 에 -r 을 붙여야 홈 디렉터리까지 지워진다는 점은 시험에 자주 나오는 함정입니다.',
    ],
    related: [{ href: '/linux/linux-master-2/week3/day4', label: '사용자와 계정 관리' }],
  },
  'linux-shared-dir': {
    summary: '팀이 같이 쓰는 디렉터리에 setgid 를 걸어 그룹을 물려주고, sticky bit 로 남의 파일을 지우지 못하게 막는 과정을 두 사용자로 번갈아 겪습니다.',
    intro: [
      'SetGID 와 Sticky bit 는 정의만 외우면 쉽게 섞입니다. 실제로는 "같은 그룹 사람끼리 파일을 함께 쓰되, 남의 파일은 못 지우게" 라는 한 가지 목적을 위해 둘을 같이 겁니다.',
      '이 실습은 dev 그룹에 kim·lee 두 사용자가 있는 상태로 /srv 에서 시작합니다. su 로 사용자를 바꿔 가며 같은 디렉터리에서 무엇이 되고 무엇이 막히는지 확인합니다.',
    ],
    related: [
      { href: '/linux/linux-master-2/week4/day3', label: '특수 권한: SetUID · SetGID · Sticky bit' },
      { href: '/linux/linux-master-2/week4/day5', label: 'Week 4 종합 복습: 권한 한 장 정리' },
    ],
  },
  'linux-find': {
    summary: 'find 로 이름·권한·소유자 조건에 맞는 파일을 찾고, -exec 로 찾은 파일을 한꺼번에 지웁니다. -perm 4000 / -4000 / /4000 의 차이도 확인합니다.',
    intro: [
      'find 는 옵션이 많아 보이지만 "어디서(경로) + 무엇을(조건) + 어떻게(동작)" 세 덩어리로 읽으면 됩니다. 시험에는 setuid 파일 찾기(-perm -4000), 소유자 없는 파일 찾기(-nouser) 같은 보안 점검 문항이 자주 나옵니다.',
      '이 실습은 로그 파일, 임시 파일, setuid 가 붙은 설정 파일이 섞인 /root/find/data 에서 시작합니다. 마지막 단계에서 아래 띠의 임시 파일이 사라지는 것을 확인하세요.',
    ],
    related: [
      { href: '/linux/linux-master-2/week3/day3', label: '내용 보기와 찾기' },
      { href: '/linux/linux-master-2/week4/day3', label: '특수 권한: SetUID · SetGID · Sticky bit' },
    ],
  },
  'linux-grep-pipe': {
    summary: '/etc/passwd 를 grep 으로 골라 읽고, -c·-v·-n 옵션과 ^ 정규식, 파이프로 wc 에 이어 세는 법을 익힙니다.',
    intro: [
      '/etc/passwd 는 계정 하나가 한 줄인 텍스트 파일이라 grep 연습에 가장 좋은 재료입니다. 계정 관리 문항과 grep 문항을 함께 대비할 수 있습니다.',
      '이 실습은 일반 사용자 kim·lee 가 있는 상태에서 시작합니다. 결과로 나오는 숫자는 실제 Rocky Linux 8.8 의 기본 계정 수를 그대로 따릅니다.',
    ],
    related: [
      { href: '/linux/linux-master-2/week3/day3', label: '내용 보기와 찾기' },
      { href: '/linux/linux-master-2/week5/day4', label: '리다이렉션 · 별칭 · 히스토리' },
      { href: '/linux/linux-master-2/week3/day4', label: '사용자와 계정 관리' },
    ],
  },
  'linux-ownership': {
    summary: 'chown 으로 파일과 디렉터리 전체(-R)의 소유자·그룹을 넘기고, chgrp 로 그룹만 바꾼 뒤, 일반 사용자는 소유자를 넘길 수 없다는 것을 확인합니다.',
    intro: [
      'chown kim:dev, chown :dev, chgrp dev 는 모두 소유권을 바꾸지만 바뀌는 칸이 다릅니다. 시험에서는 이 표현들을 섞어 보기로 내고, "일반 사용자가 할 수 있는가" 를 함께 묻습니다.',
      '이 실습은 root 가 만든 /srv/proj 에서 시작합니다. 아래 띠에서 항목마다 소유자:그룹 이 바뀌는 것을 볼 수 있습니다.',
    ],
    related: [
      { href: '/linux/linux-master-2/week4/day2', label: '소유권과 umask' },
      { href: '/linux/linux-master-2/week4/day5', label: 'Week 4 종합 복습: 권한 한 장 정리' },
    ],
  },
};

const AWS_INFO: Record<string, Omit<LabEntry, 'id' | 'kind' | 'code' | 'title'>> = {
  'regions-azs': {
    summary: '리전과 가용 영역을 조회하고 --query 로 ZoneName 과 ZoneId 를 뽑아, 이름의 a 가 계정마다 다른 AZ 일 수 있다는 것을 확인합니다.',
    intro: [
      '가용 영역 이름(ap-northeast-2a)은 계정마다 실제 데이터센터에 다르게 배정되고, ZoneId(apne2-az1)는 모든 계정에서 같습니다. 다른 계정과 같은 AZ 에 맞춰야 하는 문제에서 이 차이를 묻습니다.',
      'sts get-caller-identity 로 지금 누구인지 확인하는 습관도 함께 들입니다.',
    ],
    related: [{ href: '/aws/saa-c03/week1/day1', label: 'AWS 인프라의 지도: 리전, AZ, 공동 책임' }],
  },
  's3-first-bucket': {
    summary: '서울 리전에 버킷을 만들 때 LocationConstraint 가 왜 필요한지 오류로 겪고, 버전 관리를 켠 뒤 파일을 올려 봅니다.',
    intro: [
      'us-east-1 이 아닌 리전에서 s3api create-bucket 을 그냥 실행하면 오류가 납니다. 오류 메시지를 읽고 고치는 과정이 그대로 S3 의 리전 개념을 보여 줍니다.',
      '버전 관리는 한 번 켜면 끌 수 없고 일시 중지만 된다는 점, S3 에는 폴더가 없고 키 이름만 있다는 점을 직접 확인합니다.',
    ],
    related: [{ href: '/aws/saa-c03/week4/day1', label: 'S3: 객체 스토리지의 내부 구조' }],
  },
  'iam-least-privilege': {
    summary: 'IAM 사용자를 만들고 ReadOnlyAccess 를 붙였다가, 정책이 붙은 사용자는 바로 지울 수 없다는 것을 오류로 확인합니다.',
    intro: [
      '새 IAM 사용자는 아무 권한이 없고(암묵적 거부), 권한은 정책을 붙여야 생깁니다. 관리형 정책 ARN 의 계정 번호 자리가 aws 라는 점도 여기서 익힙니다.',
      '정리 단계에서 delete-user 가 실패하는 이유를 읽고 detach 부터 하는 순서를 겪어 봅니다.',
    ],
    related: [{ href: '/aws/saa-c03/week1/day2', label: 'IAM 기초: 누구에게 무엇을 허용할 것인가' }],
  },
};

const PRACTICAL_INFO: Record<string, Omit<LabEntry, 'id' | 'kind' | 'code' | 'title'>> = {
  'linux-practical-perm': {
    summary: '권한 숫자·기호 지정, mkdir -m, umask, SetUID, SetGID 공유 디렉터리, Sticky bit, chown -R 을 조건에 맞춰 직접 만들어 내는 7문제입니다.',
    intro: [
      '리눅스마스터 1급 2차는 필기 40%(단답·서술)와 작업형 실기 60%로 치릅니다. 작업형은 "이런 조건이 되도록 설정하시오" 처럼 결과를 요구하므로, 명령을 외웠는지보다 결과를 정확히 만들어 내는지가 점수를 가릅니다.',
      '문제마다 처음 상태가 따로 준비되어 있고, 명령을 칠 때마다 조건을 모두 채웠는지 바로 채점합니다. 같은 결과를 내는 다른 명령도 정답으로 인정합니다. 막히면 모범 답안과 해설을 열어 보세요.',
    ],
    related: [
      { href: '/linux/linux-master-2/week4/day1', label: '권한의 구조: rwx와 8진수' },
      { href: '/linux/linux-master-2/week4/day2', label: '소유권과 umask' },
      { href: '/linux/linux-master-2/week4/day3', label: '특수 권한: SetUID · SetGID · Sticky bit' },
    ],
  },
  'linux-practical-users': {
    summary: 'useradd 옵션 조합, usermod -aG, 계정 잠금, userdel -r, groupadd -g, find -perm·-exec, grep -c 를 조건대로 수행하는 8문제입니다.',
    intro: [
      '계정 관리와 파일 검색은 작업형 실기에서 감점이 잦은 영역입니다. usermod -G 에서 -a 를 빼서 기존 그룹이 사라지거나, find -perm 4000 처럼 - 를 빼서 결과가 비는 실수가 대표적입니다.',
      '이 세트는 그런 실수를 하면 채점에서 걸리도록 만들었습니다. 틀렸을 때 왜 틀렸는지 터미널 출력(id, ls -l, cat)으로 직접 확인해 보세요.',
    ],
    related: [
      { href: '/linux/linux-master-2/week3/day4', label: '사용자와 계정 관리' },
      { href: '/linux/linux-master-2/week4/day3', label: '특수 권한: SetUID · SetGID · Sticky bit' },
    ],
  },
};

const SQL_INFO: Record<string, Omit<LabEntry, 'id' | 'kind' | 'code' | 'title'>> = {
  'sql-select-basics': {
    summary: 'NULL 이 섞인 연봉 계산, DISTINCT, LIKE, BETWEEN·IN, IS NULL, 문자·날짜 함수, CASE 를 EMP 테이블에 직접 실행하며 푸는 8과제입니다.',
    intro: [
      'SQLD 2과목은 "이 SQL 의 결과는?" 처럼 실행 결과를 묻는 문항이 많습니다. 결과를 머릿속으로만 그려 보면 NULL 이 섞인 계산이나 = NULL 같은 함정에서 틀리기 쉬워, 한 번 직접 돌려 보는 편이 확실합니다.',
      '과제마다 조건에 맞는 SELECT 를 쓰고 실행하면 바로 채점합니다. 별칭이나 쓰는 함수가 달라도 결과가 같으면 정답이고, 틀리면 행 수가 다른지·값이 다른지·순서만 다른지 알려 줍니다.',
    ],
    related: [
      { href: '/data/sqld/week3/day1', label: '관계형 DB 와 SELECT' },
      { href: '/data/sqld/week3/day4', label: 'NULL 함수와 CASE·DECODE' },
      { href: '/data/sqld/week3/day5', label: 'WHERE 절' },
    ],
  },
  'sql-group-join': {
    summary: 'GROUP BY·HAVING, 집계와 NULL, EQUI·Non-EQUI 조인, 외부 조인의 COUNT(*) 함정, 셀프 조인을 직접 실행하며 푸는 8과제입니다.',
    intro: [
      'GROUP BY 와 조인은 SQLD 에서 결과 행 수와 값을 계산하게 하는 문항으로 많이 나옵니다. 외부 조인에서 COUNT(*) 와 COUNT(열)이 왜 다른지, HAVING 과 WHERE 가 어디서 갈리는지는 결과표를 직접 보면 오래 남습니다.',
      'Oracle 식 (+) 조인과 ANSI JOIN 중 어느 쪽으로 써도 결과가 같으면 정답입니다. 오류가 나면 실제 Oracle 과 같은 ORA 번호와 문구가 나옵니다.',
    ],
    related: [
      { href: '/data/sqld/week4/day1', label: 'GROUP BY 와 집계 함수' },
      { href: '/data/sqld/week4/day4', label: '조인 (EQUI·Non-EQUI·(+))' },
      { href: '/data/sqld/week4/day5', label: '표준 조인 (ANSI)' },
    ],
  },
  'sql-subquery-rollup': {
    summary: '단일행·다중 컬럼·상관 서브쿼리, NOT IN 과 NULL 함정, UNION, ROLLUP 소계·총계, GROUPING 으로 소계 행 구분하기를 직접 실행하며 푸는 7과제입니다.',
    intro: [
      '서브쿼리와 ROLLUP 은 결과 행이 몇 개인지, 어떤 값이 나오는지를 머릿속으로만 세면 틀리기 쉽습니다. NOT IN 에 NULL 이 섞이면 결과가 0행이 되는 함정처럼, 직접 돌려 보면 한 번에 이해되는 동작이 많습니다.',
      '같은 결과를 내면 서브쿼리 대신 조인이나 EXISTS 로 써도 정답입니다. ROLLUP 의 소계 행은 NULL 로 보이므로, 순서를 맞출 때 NULL 이 어디로 가는지도 함께 확인하세요.',
    ],
    related: [
      { href: '/data/sqld/week5/day1', label: '서브쿼리 기본' },
      { href: '/data/sqld/week5/day4', label: 'ROLLUP·CUBE' },
      { href: '/data/sqld/week5/day5', label: 'GROUPING SETS·GROUPING' },
    ],
  },
  'sql-window-hierarchy': {
    summary: 'DENSE_RANK·ROW_NUMBER 순위, 부서별 1등 뽑기, 누적 합, LAG, 상위 3명(ROWNUM·FETCH FIRST), CONNECT BY 조직도와 보고 라인을 직접 실행하며 푸는 7과제입니다.',
    intro: [
      '윈도우 함수와 계층형 질의는 결과 표를 직접 보면 차이가 바로 보입니다. RANK 와 DENSE_RANK 가 동점에서 어떻게 갈리는지, PRIOR 를 어느 쪽에 붙이면 나무가 거꾸로 펼쳐지는지가 결과 표에 그대로 드러납니다.',
      '윈도우 함수는 WHERE 에 바로 쓸 수 없어서 인라인 뷰로 감싸는 연습이 함께 들어 있습니다. 같은 결과를 내면 ROWNUM 이든 FETCH FIRST 든 정답입니다.',
    ],
    related: [
      { href: '/data/sqld/week6/day1', label: '순위 함수' },
      { href: '/data/sqld/week6/day3', label: 'Top N 쿼리' },
      { href: '/data/sqld/week6/day4', label: '계층형 질의' },
    ],
  },
};

const INFO: Record<LabKind, Record<string, Omit<LabEntry, 'id' | 'kind' | 'code' | 'title'>>> = {
  linux: LINUX_INFO,
  practical: PRACTICAL_INFO,
  sql: SQL_INFO,
  aws: AWS_INFO,
};

const entry = (kind: LabKind, id: string, code: string, title: string): LabEntry => ({
  id, kind, code, title, ...INFO[kind][id],
});

export const LAB_CATALOG: LabEntry[] = [
  entry('linux', 'linux-perm-basics', 'LAB L1', '숫자와 기호로 권한 바꾸고 umask 확인하기'),
  entry('linux', 'linux-links', 'LAB L2', '하드 링크와 심볼릭 링크 구분하기'),
  entry('linux', 'linux-users', 'LAB L3', '사용자를 만들고 그 사용자로 권한 거부 겪어 보기'),
  entry('linux', 'linux-shared-dir', 'LAB L4', '팀 공유 디렉터리 만들기: setgid 와 sticky bit'),
  entry('linux', 'linux-find', 'LAB L5', 'find 로 조건에 맞는 파일 찾고 한꺼번에 처리하기'),
  entry('linux', 'linux-grep-pipe', 'LAB L6', 'grep 과 파이프로 /etc/passwd 읽기'),
  entry('linux', 'linux-ownership', 'LAB L7', 'chown·chgrp 로 프로젝트 소유권 넘기기'),
  entry('practical', 'linux-practical-perm', '실기 P1', '권한·소유권 작업형 문제 7선'),
  entry('practical', 'linux-practical-users', '실기 P2', '계정·검색 작업형 문제 8선'),
  entry('sql', 'sql-select-basics', 'SQL S1', 'SELECT·함수·WHERE 로 원하는 행 골라내기'),
  entry('sql', 'sql-group-join', 'SQL S2', 'GROUP BY·HAVING·조인으로 묶고 잇기'),
  entry('sql', 'sql-subquery-rollup', 'SQL S3', '서브쿼리·집합 연산·ROLLUP 으로 한 번에 묻고 묶기'),
  entry('sql', 'sql-window-hierarchy', 'SQL S4', '윈도우 함수·Top N·계층형 질의로 순위 매기고 나무 펼치기'),
  entry('aws', 'regions-azs', 'LAB 01', '리전과 가용 영역 지도 그리기'),
  entry('aws', 's3-first-bucket', 'LAB 02', '서울 리전에 첫 버킷 만들기'),
  entry('aws', 'iam-least-privilege', 'LAB 03', '읽기 전용 사용자 만들고 정리하기'),
];

export const labById = (id: string) => LAB_CATALOG.find((l) => l.id === id);
