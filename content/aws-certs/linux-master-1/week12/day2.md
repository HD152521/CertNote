# Day 2 - 설정 파일 경로·핵심 지시어 총정리: 빈칸 채우기를 위한 정밀 암기

리눅스마스터 1급 실기에서 두 번째로 무서운 유형이 **설정 파일 빈칸 채우기**다. "사용자 계정 정보가 저장되는 파일의 절대 경로는?", "`/etc/fstab`의 6번째 필드가 의미하는 것은?", "암호 정책의 최대 사용 일수를 지정하는 `/etc/login.defs`의 지시어는?" 같은 문제가 나온다. 이건 외워두지 않으면 추론으로 맞힐 수 없는 영역이다. 경로 하나, 필드 순서 하나, 지시어 철자 하나가 틀리면 점수가 날아간다. 오늘은 실기에 가장 자주 등장하는 핵심 설정 파일 — **passwd, shadow, group, fstab, crontab, sysctl.conf, login.defs, hosts, resolv.conf** 등 — 의 절대 경로와 각 파일의 필드 구조·핵심 지시어를 빈칸 채우기에 대비해 한 줄도 흘리지 않고 정리한다.

## 계정 관리 3대 파일: passwd / shadow / group

리눅스 사용자 계정 정보는 세 파일에 나뉘어 저장된다. 경로와 필드 구조를 통째로 외워야 한다.

```bash
# /etc/passwd — 사용자 계정 기본 정보 (콜론 7개 필드)
root:x:0:0:root:/root:/bin/bash
#  1 2 3 4  5    6      7
# 1.사용자명 2.암호(x=shadow사용) 3.UID 4.GID
# 5.설명(GECOS) 6.홈디렉터리 7.로그인셸
```

| 필드 | /etc/passwd 의미 |
|------|------------------|
| 1 | 사용자 이름(로그인명) |
| 2 | 암호 자리(보통 `x`, 실제 암호는 shadow에) |
| 3 | UID(사용자 ID, root=0) |
| 4 | GID(기본 그룹 ID) |
| 5 | 설명/GECOS(이름·전화 등) |
| 6 | 홈 디렉터리 경로 |
| 7 | 로그인 셸(`/bin/bash`, 로그인 차단은 `/sbin/nologin`) |

```bash
# /etc/shadow — 암호화된 비밀번호 + 정책 (콜론 9개 필드)
alice:$6$xyz...:19700:0:90:7:14::
#  1     2        3   4  5 6  7  8 9
# 1.사용자명 2.암호화된비밀번호 3.마지막변경일(1970부터 일수)
# 4.변경최소일수 5.변경최대일수 6.만료경고일수
# 7.유예일수 8.계정만료일 9.예약필드
```

| 필드 | /etc/shadow 의미 |
|------|------------------|
| 1 | 사용자 이름 |
| 2 | 암호화된 비밀번호(`*`/`!`=잠김) |
| 3 | 마지막 암호 변경일(epoch 기준 일수) |
| 4 | 최소 변경 간격(일) |
| 5 | 최대 사용 일수(만료까지) |
| 6 | 만료 전 경고 일수 |
| 7 | 만료 후 유예(비활성) 일수 |
| 8 | 계정 만료일 |
| 9 | 예약(미사용) |

> 💡 **개념**: `/etc/passwd`는 **7개 필드**, `/etc/shadow`는 **9개 필드**다. passwd의 두 번째 필드 `x`는 "실제 암호는 shadow에 있다"는 표시다. UID 0은 항상 root다.

```bash
# /etc/group — 그룹 정보 (콜론 4개 필드)
staff:x:1001:alice,bob
#  1   2  3     4
# 1.그룹명 2.그룹암호(x) 3.GID 4.그룹멤버(쉼표구분)

# /etc/gshadow — 그룹 암호화 정보
```

> ⚠️ **함정**: shadow의 5번째 필드가 "최대 사용 일수"이고 4번째가 "최소 변경 간격"이다. 순서를 바꿔 외우면 빈칸 채우기에서 틀린다. 또 `/etc/passwd`의 7번째(셸)에 `/sbin/nologin`이나 `/bin/false`가 들어가면 로그인이 차단되는 계정이라는 의미다.

> 🔍 **더 깊이**: shadow 2번째 필드의 `$6$`는 SHA-512 해시를 뜻한다. `$1$`은 MD5, `$5$`는 SHA-256, `$6$`는 SHA-512다. 필드가 `*`이나 `!`로 시작하면 그 계정은 비밀번호 로그인이 잠긴 상태다.

## 디스크 마운트 파일: /etc/fstab

`/etc/fstab`은 부팅 시 자동으로 마운트할 파일시스템을 정의한다. **6개 필드** 순서가 단골 출제다.

```bash
# /etc/fstab — 자동 마운트 설정 (공백/탭 구분, 6개 필드)
/dev/sda1   /        ext4    defaults        0 1
UUID=abc... /home    ext4    defaults        0 2
/dev/sdb1   /data    xfs     defaults,noatime 0 2
/swapfile   none     swap    sw              0 0
tmpfs       /tmp     tmpfs   defaults        0 0
```

| 필드 | /etc/fstab 의미 | 예시 |
|------|-----------------|------|
| 1 | 장치(device) 또는 UUID/LABEL | `/dev/sda1`, `UUID=...` |
| 2 | 마운트 지점(mount point) | `/home` |
| 3 | 파일시스템 종류 | `ext4`, `xfs`, `swap` |
| 4 | 마운트 옵션 | `defaults`, `noatime`, `ro` |
| 5 | dump 백업 여부(0=안 함) | `0` 또는 `1` |
| 6 | fsck 검사 순서(0=검사안함, 1=루트, 2=나머지) | `0`/`1`/`2` |

> 📚 **빈출**: fstab의 **6번째 필드는 fsck 검사 순서**다. 루트 파일시스템(`/`)은 반드시 `1`, 나머지는 `2`, 검사 안 할 것은 `0`이다. **5번째 필드는 dump 백업 여부**다. 이 두 숫자 필드의 의미를 헷갈리지 마라.

> 🔍 **더 깊이**: 마운트 옵션 `defaults`는 `rw,suid,dev,exec,auto,nouser,async`를 묶은 것이다. `ro`(읽기전용), `noexec`(실행금지), `nosuid`(SetUID무시), `noatime`(접근시간 기록 안 함, 성능↑)이 자주 쓰인다. 스왑은 옵션에 `sw`, 종류에 `swap`을 쓴다.

## 작업 스케줄: crontab 관련 파일

```bash
# 시스템 crontab
/etc/crontab              # 시스템 전역 cron 설정(사용자 필드 있음)
/etc/cron.d/              # 추가 cron 작업 조각 파일 디렉터리
/etc/cron.daily/          # 매일 실행 스크립트
/etc/cron.hourly/         # 매시간 실행 스크립트
/etc/cron.weekly/         # 매주 실행 스크립트
/etc/cron.monthly/        # 매월 실행 스크립트
/var/spool/cron/         # 사용자별 crontab 저장 위치
/etc/cron.allow           # cron 사용 허용 사용자 목록
/etc/cron.deny            # cron 사용 거부 사용자 목록
```

crontab 한 줄은 **5개 시간 필드 + 명령**으로 구성된다.

```bash
# 분 시 일 월 요일 [사용자] 명령
# *  *  *  *  *
# │  │  │  │  └─ 요일 (0-7, 0과 7=일요일)
# │  │  │  └──── 월 (1-12)
# │  │  └─────── 일 (1-31)
# │  └────────── 시 (0-23)
# └───────────── 분 (0-59)

30 2 * * *    /backup.sh           # 매일 02:30
0 */6 * * *   /check.sh            # 6시간마다
0 0 1 * *     /monthly.sh          # 매월 1일 00:00
*/10 * * * *  /poll.sh             # 10분마다
0 9 * * 1-5   /report.sh           # 평일(월~금) 09:00
```

> 💡 **개념**: crontab 시간 필드 순서는 **분-시-일-월-요일**이다. `/etc/crontab`(시스템용)에는 시간 5필드 뒤에 **실행 사용자** 필드가 추가로 들어가지만, 사용자 개인 crontab(`crontab -e`)에는 사용자 필드가 없다. 이 차이가 단골이다.

> ⚠️ **함정**: `*/10 * * * *`는 "10분마다", `10 * * * *`는 "매시 10분에 한 번"이다. 슬래시(`/`)가 있으면 주기(every), 없으면 정시 실행이다. 요일은 0과 7이 모두 일요일이다.

## 커널 파라미터: /etc/sysctl.conf

`/etc/sysctl.conf`는 부팅 시 적용할 커널 파라미터를 정의한다. `/proc/sys/` 아래 값과 1:1 대응한다.

```bash
# /etc/sysctl.conf 예시
net.ipv4.ip_forward = 1                  # IP 포워딩(라우터/NAT)
net.ipv4.icmp_echo_ignore_all = 1        # ping 응답 차단
kernel.hostname = server01               # 호스트명
vm.swappiness = 10                       # 스왑 사용 적극성
fs.file-max = 100000                     # 최대 파일 핸들 수

# 적용 명령
sysctl -p                # /etc/sysctl.conf 다시 읽어 적용
sysctl -a                # 현재 모든 커널 파라미터 출력
sysctl net.ipv4.ip_forward   # 특정 값 조회
sysctl -w net.ipv4.ip_forward=1   # 즉시(런타임) 설정
```

> 📚 **빈출**: 라우터/NAT를 만들려면 `net.ipv4.ip_forward = 1`을 `/etc/sysctl.conf`에 넣고 `sysctl -p`로 적용한다. `sysctl -p`는 "설정 파일 다시 읽기"라는 점을 기억하라. `echo 1 > /proc/sys/net/ipv4/ip_forward`도 같은 효과지만 재부팅하면 사라진다.

## 암호 정책 기본값: /etc/login.defs

새 계정 생성 시 적용되는 기본 암호 정책과 UID/GID 범위를 정의한다.

```bash
# /etc/login.defs 핵심 지시어
PASS_MAX_DAYS   90        # 암호 최대 사용 일수
PASS_MIN_DAYS   0         # 암호 최소 변경 간격
PASS_MIN_LEN    8         # 암호 최소 길이
PASS_WARN_AGE   7         # 만료 경고 일수
UID_MIN         1000      # 일반 사용자 UID 시작
UID_MAX         60000     # 일반 사용자 UID 끝
GID_MIN         1000      # 일반 그룹 GID 시작
CREATE_HOME     yes       # 홈 디렉터리 자동 생성
UMASK           022       # 기본 umask
```

| 지시어 | 의미 |
|--------|------|
| `PASS_MAX_DAYS` | 암호 최대 사용 일수(만료까지) |
| `PASS_MIN_DAYS` | 암호 변경 최소 간격 |
| `PASS_WARN_AGE` | 만료 전 경고 시작일 |
| `UID_MIN`/`UID_MAX` | 일반 사용자 UID 범위 |

> 🔍 **더 깊이**: `login.defs`는 **새로 만드는 계정의 기본값**을 정한다. 이미 있는 계정의 정책을 바꾸려면 `chage` 명령을 쓴다. 예: `chage -M 60 alice`(alice의 최대 사용 일수 60일로 변경). login.defs를 고쳐도 기존 사용자에는 소급 적용되지 않는다는 점이 함정이다.

## 네트워크 설정 파일

```bash
/etc/hosts            # IP-호스트명 정적 매핑(DNS보다 우선 조회 가능)
/etc/resolv.conf      # DNS 서버(nameserver) 지정
/etc/nsswitch.conf    # 이름 조회 순서(hosts: files dns)
/etc/hostname         # 시스템 호스트명
/etc/host.conf        # 이름 해석 순서 보조 설정
/etc/services         # 포트-서비스명 매핑(80=http 등)
/etc/protocols        # 프로토콜 번호 매핑
```

```bash
# /etc/resolv.conf
nameserver 8.8.8.8
nameserver 168.126.63.1
search example.com
domain example.com

# /etc/hosts
127.0.0.1   localhost
192.168.0.10  server01 web
```

> ⚠️ **함정**: DNS 서버를 지정하는 파일은 `/etc/resolv.conf`이고, 지시어는 `nameserver`다. IP와 이름을 직접 매핑하는 파일은 `/etc/hosts`다. 둘을 혼동하기 쉽다. 조회 순서(파일 먼저냐 DNS 먼저냐)는 `/etc/nsswitch.conf`의 `hosts:` 줄에서 정한다.

## 경로·지시어 단답 암기 카드

| 작업/항목 | 경로 또는 지시어 |
|-----------|-----------------|
| 사용자 계정 기본 정보 | `/etc/passwd` (7필드) |
| 암호화된 비밀번호·정책 | `/etc/shadow` (9필드) |
| 그룹 정보 | `/etc/group` (4필드) |
| 자동 마운트 설정 | `/etc/fstab` (6필드) |
| fstab의 fsck 검사 순서 | 6번째 필드(루트=1) |
| 시스템 cron 설정 | `/etc/crontab` |
| 사용자별 crontab 저장 | `/var/spool/cron/` |
| 커널 파라미터 영구 설정 | `/etc/sysctl.conf` |
| sysctl 설정 적용 | `sysctl -p` |
| 암호 최대 사용 일수 기본값 | `PASS_MAX_DAYS` (login.defs) |
| IP-호스트명 정적 매핑 | `/etc/hosts` |
| DNS 서버 지정 | `/etc/resolv.conf` (nameserver) |
| 포트-서비스명 매핑 | `/etc/services` |
| 셸로 로그인 차단 | `/sbin/nologin` |

## 직접 쳐보기

```bash
# 실제 파일을 열어 필드 구조 눈에 익히기
cat /etc/passwd | head -5      # 7필드 확인
sudo cat /etc/shadow | head -3 # 9필드 확인 (root 권한 필요)
cat /etc/group | head -5       # 4필드 확인
cat /etc/fstab                 # 6필드 확인
cat /etc/resolv.conf           # nameserver 확인

# 정책 확인/변경
grep PASS /etc/login.defs      # 암호 정책 기본값
sudo chage -l alice            # alice의 현재 암호 정책(있다면)

# sysctl 조회
sysctl net.ipv4.ip_forward
```

설정 파일은 "어떤 파일에 무엇이 있는가"와 "각 필드가 몇 번째에 무엇인가"를 정확히 외우는 것이 전부다. 직접 `cat`으로 열어 실제 내용을 보면서 필드 위치를 손에 익혀라. 다음 날은 이 지식을 바탕으로 디스크·LVM·권한을 실제로 수행하는 작업형을 다룬다.

## 📝 연습 문제

**문제 1.** 사용자의 암호화된 비밀번호와 암호 만료 정책이 저장되는 파일의 절대 경로는?

A) /etc/passwd
B) /etc/group
C) /etc/shadow
D) /etc/login.defs

**정답: C**

해설: 암호화된 비밀번호와 만료 정책은 `/etc/shadow`(9개 필드)에 저장된다. `/etc/passwd`는 계정 기본 정보(7필드), `/etc/group`은 그룹, `/etc/login.defs`는 새 계정의 기본 정책값이다.

---

**문제 2.** `/etc/passwd` 파일의 필드 개수와 7번째 필드의 의미가 올바르게 짝지어진 것은?

A) 6개 필드 - 홈 디렉터리
B) 7개 필드 - 로그인 셸
C) 9개 필드 - 로그인 셸
D) 7개 필드 - 홈 디렉터리

**정답: B**

해설: `/etc/passwd`는 콜론으로 구분된 7개 필드로 구성되며, 7번째(마지막) 필드는 로그인 셸이다. 홈 디렉터리는 6번째 필드다. 9개 필드는 `/etc/shadow`다.

---

**문제 3.** `/etc/fstab`에서 부팅 시 파일시스템 검사(fsck) 순서를 지정하는 필드는 몇 번째이며, 루트 파일시스템의 값은?

A) 5번째 필드, 값은 1
B) 6번째 필드, 값은 0
C) 6번째 필드, 값은 1
D) 5번째 필드, 값은 0

**정답: C**

해설: fstab의 6번째 필드가 fsck 검사 순서이며, 루트(/)는 1, 나머지 파일시스템은 2, 검사하지 않을 것은 0이다. 5번째 필드는 dump 백업 여부다.

---

**문제 4.** 부팅 후에도 유지되도록 IP 포워딩을 활성화하기 위해 수정하는 파일과 적용 명령으로 옳은 것은?

A) /proc/sys 직접 수정, reboot
B) /etc/sysctl.conf 수정, sysctl -p
C) /etc/fstab 수정, mount -a
D) /etc/resolv.conf 수정, sysctl -a

**정답: B**

해설: 영구적인 커널 파라미터는 `/etc/sysctl.conf`에 `net.ipv4.ip_forward = 1`을 넣고 `sysctl -p`로 적용한다. `/proc/sys` 직접 수정은 재부팅 시 사라지며, `sysctl -a`는 조회 명령이다.

---

**문제 5.** crontab 항목 `30 4 * * 0 /backup.sh`가 실행되는 시점으로 옳은 것은?

A) 매일 04:30
B) 매주 일요일 04:30
C) 매월 30일 04시
D) 매주 월요일 04:30

**정답: B**

해설: 필드 순서는 분(30)-시(4)-일(*)-월(*)-요일(0)이다. 요일 0은 일요일이므로 매주 일요일 04:30에 실행된다. 요일 1이 월요일이다.

---

**문제 6.** 새로 생성되는 사용자 계정의 암호 최대 사용 일수 기본값을 설정하는 `/etc/login.defs`의 지시어는?

A) PASS_MIN_DAYS
B) PASS_WARN_AGE
C) PASS_MAX_DAYS
D) PASS_MIN_LEN

**정답: C**

해설: `PASS_MAX_DAYS`가 암호 최대 사용 일수(만료까지의 일수)를 지정한다. `PASS_MIN_DAYS`는 변경 최소 간격, `PASS_WARN_AGE`는 만료 경고 일수, `PASS_MIN_LEN`은 최소 길이다.

---

**문제 7.** 시스템이 사용할 DNS 서버 주소를 지정하는 파일과 그 지시어로 옳은 것은?

A) /etc/hosts, hostname
B) /etc/resolv.conf, nameserver
C) /etc/nsswitch.conf, dns
D) /etc/hosts, nameserver

**정답: B**

해설: DNS 서버는 `/etc/resolv.conf` 파일에 `nameserver` 지시어로 지정한다. `/etc/hosts`는 IP-호스트명 정적 매핑, `/etc/nsswitch.conf`는 이름 조회 순서를 정하는 파일이다.

---
