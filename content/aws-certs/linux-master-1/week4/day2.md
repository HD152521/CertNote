# Day 2 - 계정 관리 명령과 권한 상승: useradd부터 sudo까지

Day 1에서 우리는 계정이 네 파일에 적힌 한 줄의 레코드라는 것을 배웠다. 그렇다면 그 레코드를 손으로 vi로 편집해야 할까? 그래도 동작은 하지만, 짝 파일(shadow/gshadow) 동기화와 홈 디렉터리 생성·스켈레톤 복사 같은 부수 작업을 빠뜨리기 쉽다. 그래서 리눅스는 **계정 관리 전용 명령 세트**를 제공한다. 이 명령들이 결국 하는 일은 "네 파일을 안전하게, 짝을 맞춰, 빠짐없이 갱신하는 것"이다.

오늘은 두 갈래를 다룬다. 앞쪽은 **계정·그룹을 만들고 고치고 지우는** 명령(`useradd`, `usermod`, `userdel`, `passwd`, `chage`, `groupadd`, `gpasswd`)이고, 뒤쪽은 **다른 사용자의 권한을 빌리는** 두 방식(`su`와 `sudo`)이다. 실기에서 useradd의 옵션 글자(`-u -g -G -d -s -m`)와 sudoers 문법은 매우 자주 나온다. 옵션 하나하나가 Day 1의 어느 필드를 건드리는지 연결해서 외우면 암기가 무너지지 않는다.

## useradd — 계정 생성과 옵션이 건드리는 필드

`useradd`는 새 사용자를 만든다. 옵션 없이 실행하면 `/etc/default/useradd`와 `/etc/login.defs`의 기본값을 따른다. 핵심 옵션은 각각 Day 1의 특정 필드에 대응한다.

```bash
useradd -u 1500 -g developers -G wheel,docker -d /home/alice -s /bin/bash -m -c "Alice Kim" alice
```

| 옵션 | 의미 | 건드리는 파일/필드 |
|------|------|-------------------|
| `-u` | UID 지정 | passwd 3번 |
| `-g` | 기본(primary) 그룹 | passwd 4번 |
| `-G` | 보조(secondary) 그룹(콤마) | group 4번 |
| `-d` | 홈 디렉터리 경로 | passwd 6번 |
| `-s` | 로그인 셸 | passwd 7번 |
| `-m` | 홈 디렉터리 **생성** + skel 복사 | 파일시스템 |
| `-c` | GECOS(코멘트) | passwd 5번 |
| `-e` | 계정 만료일(YYYY-MM-DD) | shadow 8번 |
| `-r` | 시스템 계정으로 생성(UID 낮게) | passwd 3번 |

> 💡 **개념**: `-g`(소문자)와 `-G`(대문자)의 차이가 시험 핵심이다. `-g`는 **기본 그룹 하나**(passwd의 GID)를, `-G`는 **보조 그룹 여럿**(group 파일 멤버 목록)을 지정한다. 소문자 g = 기본(하나), 대문자 G = 보조(여럿)로 외운다. 새로 만드는 파일의 소유 그룹은 `-g`로 정한 기본 그룹이 된다.

> 🔍 **더 깊이**: `-m` 옵션은 단순히 빈 홈 디렉터리만 만드는 게 아니라 `/etc/skel`의 내용을 새 홈으로 복사한다. `.bashrc`, `.profile`, `.bash_logout` 같은 기본 설정 파일이 여기서 온다. 따라서 모든 신규 사용자에게 공통 설정을 배포하고 싶으면 `/etc/skel`에 파일을 넣어두면 된다. Red Hat 계열은 `useradd`가 기본으로 홈을 만들지만, Debian 계열의 `useradd`는 `-m`이 없으면 홈을 안 만들 수 있어 `-m`을 명시하는 습관이 안전하다.

> ⚠️ **함정**: `useradd`와 `adduser`를 같은 것으로 보는 보기가 있다. `useradd`는 모든 배포판의 **저수준 표준 명령**이고, `adduser`는 Debian/Ubuntu 계열의 **대화형 래퍼 스크립트**(Perl)로 홈 생성·암호 설정까지 묻는다. 시험에서 "표준 계정 생성 명령"은 `useradd`다. Red Hat에서 `adduser`는 `useradd`의 심볼릭 링크일 뿐이다.

```bash
# 직접 쳐보기 — 계정 생성과 기본값 확인
sudo useradd -m -s /bin/bash -c "Test User" testuser
sudo cat /etc/default/useradd      # useradd 기본값
grep -E '^(UID_MIN|UID_MAX|PASS_MAX_DAYS)' /etc/login.defs
getent passwd testuser
```

## usermod / userdel — 계정 수정과 삭제

`usermod`는 기존 계정을 고친다. 옵션 다수가 `useradd`와 같지만, 보조 그룹 처리에 함정이 있다.

```bash
usermod -aG docker alice           # alice를 docker 보조 그룹에 "추가"
usermod -G docker alice            # alice의 보조 그룹을 docker "하나로 교체"(기존 다 날아감!)
usermod -L alice                   # 계정 잠금(shadow 해시 앞 ! 추가)
usermod -U alice                   # 잠금 해제
usermod -s /sbin/nologin alice     # 셸 변경(로그인 차단)
```

> ⚠️ **함정**: **`usermod -G`만 쓰면 기존 보조 그룹이 모두 사라지고 지정한 그룹으로 교체**된다. 기존 그룹을 유지하며 추가하려면 반드시 `-a`(append)를 함께 써서 `usermod -aG`로 해야 한다. 시험에서 "alice를 docker 그룹에 추가하되 기존 그룹 유지" 보기의 정답은 `-aG`다. `-a`를 빠뜨린 `-G`는 위험한 오답으로 단골 출제된다.

`userdel`은 계정을 지운다.

```bash
userdel alice                      # 계정만 삭제(홈은 남김)
userdel -r alice                   # 홈 디렉터리와 메일 스풀까지 삭제
```

> 🔍 **더 깊이**: `userdel`(옵션 없음)은 passwd/shadow/group의 레코드만 지우고 **홈 디렉터리와 그 안의 파일은 남긴다**. `-r`을 붙여야 홈과 `/var/mail/사용자` 메일 스풀까지 지운다. 단, `-r`로도 그 사용자가 시스템 다른 곳(예: `/tmp`, 공유 디렉터리)에 만든 파일은 남는다. 이런 "주인 없는 파일"은 UID만 표시되며 `find / -nouser`로 찾을 수 있다.

> ⚠️ **함정**: 로그인 중이거나 프로세스가 떠 있는 사용자는 `userdel`이 거부될 수 있다(`user X is currently used by process`). `-f`(force)로 강제할 수 있으나 위험하다. 시험에서 "삭제가 안 되는 이유"로 "사용자가 현재 로그인/프로세스 실행 중"이 정답으로 나온다.

## passwd / chage — 암호와 수명 정책 관리

`passwd`는 암호를 설정·변경하고, 잠금/해제도 한다. `chage`는 shadow의 수명 필드(3~8번)를 전담한다.

```bash
passwd alice                       # alice 암호 변경(root만 타인 암호 변경 가능)
passwd -l alice                    # 잠금(shadow 해시 앞 ! )
passwd -u alice                    # 잠금 해제
passwd -e alice                    # 암호 즉시 만료(다음 로그인 시 강제 변경)
passwd -d alice                    # 암호 삭제(무암호 — 위험)

chage -l alice                     # 수명 정책 조회(사람이 읽는 형식)
chage -M 90 alice                  # Max(최대 유효일) 90일로 설정 → shadow 5번
chage -m 7 alice                   # Min(최소 변경 간격) 7일 → shadow 4번
chage -W 14 alice                  # Warn(경고일) 14일 → shadow 6번
chage -E 2026-12-31 alice          # 계정 만료일 → shadow 8번
chage -d 0 alice                   # 마지막 변경일 0 → 다음 로그인 시 강제 변경
```

> 💡 **개념**: `chage`의 대문자/소문자 옵션이 shadow 필드와 1:1 대응한다. `-M`(대문자)=Max=최대 유효일, `-m`(소문자)=Min=최소 변경 간격, `-W`=Warn, `-E`=Expire(계정 만료), `-d`=마지막 변경일, `-I`=Inactive. Day 1의 shadow 9개 필드를 떠올리면 옵션이 어느 필드를 건드리는지 즉시 매칭된다.

> 🔍 **더 깊이**: `passwd -e alice`(암호 만료)와 `chage -d 0 alice`(마지막 변경일을 1970-01-01로)는 결과가 같다 — 둘 다 다음 로그인 때 암호를 강제로 바꾸게 한다. 신규 직원 첫 로그인 시 초기 암호를 본인이 직접 재설정하게 만드는 표준 운영 기법이다.

> ⚠️ **함정**: `passwd -d`(암호 삭제)와 `passwd -l`(잠금)을 혼동시키는 보기가 있다. `-d`는 암호를 **없애** 무암호 로그인이 가능해지는(위험) 상태고, `-l`은 해시 앞에 `!`를 붙여 로그인을 **차단**하는 상태다. 정반대 효과다.

```bash
# 직접 쳐보기 — 수명 정책 적용 후 확인
sudo chage -M 60 -W 7 testuser
sudo chage -l testuser
sudo passwd -S testuser            # 한 줄 요약(상태/최종변경/Min/Max/Warn/Inactive)
```

## groupadd / gpasswd — 그룹 생성과 멤버 관리

```bash
groupadd -g 2000 webteam           # GID 2000으로 그룹 생성
groupmod -n devteam webteam        # 그룹 이름 변경(webteam → devteam)
groupdel webteam                   # 그룹 삭제(누군가의 기본 그룹이면 거부됨)

gpasswd -a alice webteam           # alice를 webteam 멤버로 추가
gpasswd -d alice webteam           # alice를 webteam에서 제거
gpasswd -A admin1 webteam          # admin1을 webteam의 관리자로 지정(gshadow 3번)
gpasswd webteam                    # 그룹 암호 설정(newgrp용)
```

> 💡 **개념**: `gpasswd -a`/`gpasswd -d`는 group과 gshadow를 **동시에** 갱신해 짝을 맞춘다. 손으로 group만 편집하면 Day 1에서 본 "유령 멤버" 불일치가 생긴다. 그래서 그룹 멤버 변경은 `gpasswd`(또는 `usermod -aG`)로 하는 것이 원칙이다.

> ⚠️ **함정**: `groupdel`은 그 그룹이 **어떤 사용자의 기본(primary) 그룹이면 삭제를 거부**한다. 먼저 그 사용자의 기본 그룹을 다른 것으로 바꾸거나 사용자를 지운 뒤 그룹을 삭제해야 한다. 보조 그룹인 경우엔 바로 삭제된다.

> 📚 **유래/사례**: `newgrp` 명령은 그룹 암호를 입력해 현재 세션의 기본 그룹을 임시 변경한다. 1970~80년대에는 한 사용자가 여러 그룹을 동시에 가질 수 없었기에(당시 유닉스는 한 번에 하나의 그룹만 활성), 작업할 그룹을 `newgrp`로 갈아끼웠다. 지금은 보조 그룹을 동시에 여러 개 가질 수 있어 `newgrp`는 거의 안 쓰지만, 시험에서는 "그룹 암호(gshadow 2번)의 용도"로 그 흔적이 출제된다.

## su — 다른 사용자로 전환

`su`(substitute user)는 다른 사용자의 셸로 전환한다. 대상의 암호를 알아야 한다.

```bash
su alice                           # alice로 전환, 환경 일부 유지(현재 디렉터리 유지)
su - alice                         # alice로 전환 + alice의 로그인 환경 완전 적용
su -                               # root로 전환(대상 생략 시 root) + 로그인 셸
su -c "id" alice                   # alice 권한으로 단일 명령만 실행
```

> 💡 **개념**: `su alice`와 `su - alice`의 차이가 핵심이다. **하이픈(`-` 또는 `-l`)이 있으면 로그인 셸**로 전환해 대상 사용자의 `.bash_profile`/`.profile`을 읽고 환경 변수(`PATH`, `HOME`, 작업 디렉터리)를 그 사용자 기준으로 완전히 새로 설정한다. 하이픈이 없으면 환경 일부(특히 `PATH`)가 원래 사용자의 것을 그대로 물려받아 "명령을 못 찾는" 미묘한 오류가 생긴다. 그래서 root로 갈 때는 거의 항상 `su -`를 쓴다.

> ⚠️ **함정**: `su`로 root가 되려면 **root의 암호**를 알아야 한다. Ubuntu는 기본적으로 root 암호가 잠겨(`!`) 있어 `su -`가 막히고 `sudo`를 쓰도록 유도한다. "Ubuntu에서 `su -`가 안 되는 이유"의 정답은 "root 계정 암호가 설정/활성화되어 있지 않음"이다.

## sudo와 /etc/sudoers — 권한의 위임

`sudo`(superuser do)는 `su`와 철학이 다르다. `su`는 **대상의 암호**로 그 사람이 "되는" 것이고, `sudo`는 **자기 암호**로 미리 위임받은 권한만 빌려 단일 명령을 실행하는 것이다.

```bash
sudo systemctl restart nginx       # 자기 암호로 인증 후 root 권한 명령 실행
sudo -u alice whoami               # alice 권한으로 실행(→ alice 출력)
sudo -i                            # root의 로그인 셸 진입(su - 유사)
sudo -l                            # 내가 sudo로 할 수 있는 명령 목록 확인
```

권한 정의는 `/etc/sudoers`(반드시 `visudo`로 편집)에 있다. 한 줄의 문법:

```bash
# 사용자  호스트=(실행대상사용자:그룹)  명령
root      ALL=(ALL:ALL) ALL
alice     ALL=(ALL) ALL
%admin    ALL=(ALL) ALL              # % = 그룹. admin 그룹 전체
%wheel    ALL=(ALL) NOPASSWD: ALL    # 암호 없이 sudo 허용
bob       web01=(root) /usr/bin/systemctl restart nginx  # 특정 명령만
```

| 위치 | 의미 |
|------|------|
| 1번 필드 | 대상 사용자(`%`=그룹) |
| `ALL=` 앞 | 적용 호스트(`ALL`=모든 호스트) |
| `(ALL:ALL)` | 변신 가능한 (사용자:그룹) |
| 마지막 | 허용 명령(`ALL`=전체, `NOPASSWD:`=암호 면제) |

> 💡 **개념**: sudoers는 반드시 **`visudo`로 편집**해야 한다. `visudo`는 저장 시 문법 검사를 하고 파일에 잠금을 걸어 동시 편집을 막는다. 일반 `vi`로 직접 편집하다 문법을 틀리면 sudo 전체가 동작 불능이 되고, 그 상태에서 root 암호로 직접 들어가지 못하면 시스템이 잠길 수 있다. "sudoers 편집 시 권장 도구"의 정답은 항상 `visudo`다.

> 🔍 **더 깊이**: `%` 접두사는 그룹을 뜻한다. Red Hat 계열은 `wheel` 그룹, Debian/Ubuntu 계열은 `sudo` 그룹을 기본 관리자 그룹으로 쓴다. 따라서 "Ubuntu에서 사용자에게 관리자 권한 부여"의 표준 방법은 `usermod -aG sudo alice`로 sudo 그룹에 추가하는 것이고, Red Hat이면 `wheel` 그룹이다. 개별 사용자를 sudoers에 일일이 적기보다 그룹 단위로 위임하는 것이 운영 표준이다.

> ⚠️ **함정**: `su`는 **대상 사용자의 암호**를, `sudo`는 **자기 자신의 암호**를 묻는다. 이 차이를 뒤바꾼 보기가 단골이다. 그래서 sudo는 root 암호를 팀원에게 공유하지 않고도 특정 명령만 위임할 수 있어 감사·최소권한 원칙에 부합한다. 또 `NOPASSWD:`는 편하지만 자동화/CI에서만 제한적으로 쓰고, 사람 계정에 남발하면 보안 위협이다.

> 📚 **유래/사례**: 한 회사가 운영 서버 root 암호를 팀원 전원에게 공유했다가 퇴사자가 생길 때마다 root 암호를 전부 바꿔야 하는 운영 지옥에 빠졌다. `sudo` 기반으로 전환하자 각자 자기 암호로 인증하고, sudoers에 "누가 어떤 명령을 할 수 있는지"가 기록되며, `/var/log/secure`(또는 `auth.log`)에 모든 sudo 사용이 감사 로그로 남았다. 퇴사자는 그 계정만 비활성화하면 끝이었다. 이것이 "su 공유 모델 → sudo 위임 모델"로 넘어가는 표준 보안 진화다.

```bash
# 직접 쳐보기 — sudo 권한 확인(편집은 주의)
sudo -l                            # 내가 가진 sudo 권한 목록
sudo visudo -c                     # sudoers 문법 검사만(편집 안 함)
groups                             # 내가 sudo/wheel 그룹에 속했는지
```

## 한 장 요약 — 명령과 필드의 대응

| 명령 | 주 역할 | 핵심 옵션 |
|------|---------|-----------|
| useradd | 계정 생성 | -u -g -G -d -s -m -c -e |
| usermod | 계정 수정 | -aG(추가) / -G(교체) / -L -U |
| userdel | 계정 삭제 | -r(홈까지) |
| passwd | 암호·잠금 | -l -u -e -d |
| chage | 수명 정책 | -M -m -W -E -d |
| groupadd/gpasswd | 그룹·멤버 | -a -d -A |
| su / sudo | 권한 전환/위임 | su -(로그인셸) / sudo -l |

`su`는 대상 암호로 "되기", `sudo`는 자기 암호로 "빌리기". 이 한 문장이 권한 상승의 핵심이다.

## 📝 연습 문제

**문제 1.** 기존 보조 그룹을 그대로 유지하면서 사용자 alice를 docker 그룹에 추가하는 명령으로 옳은 것은?

A) `usermod -G docker alice`

B) `usermod -aG docker alice`

C) `usermod -g docker alice`

D) `groupadd docker alice`

**정답: B**

해설: `usermod -aG`의 `-a`(append)는 기존 보조 그룹을 유지하며 새 그룹을 추가한다. A처럼 `-a` 없이 `-G`만 쓰면 기존 보조 그룹이 모두 사라지고 docker 하나로 교체된다(위험). C의 `-g`는 기본(primary) 그룹을 바꾸는 옵션이며, D의 `groupadd`는 그룹 생성 명령이라 용도가 다르다.

---

**문제 2.** `useradd`에서 홈 디렉터리를 생성하고 `/etc/skel`의 파일을 복사하도록 하는 옵션은?

A) `-d`

B) `-c`

C) `-m`

D) `-r`

**정답: C**

해설: `-m`(make home)은 홈 디렉터리를 생성하고 `/etc/skel`의 기본 설정 파일(.bashrc 등)을 복사한다. A의 `-d`는 홈 경로를 지정만 할 뿐 생성하지 않으며, B의 `-c`는 GECOS 코멘트, D의 `-r`은 시스템 계정 생성 옵션이다.

---

**문제 3.** `su alice`와 `su - alice`의 차이로 가장 정확한 것은?

A) 둘은 완전히 동일하며 아무 차이가 없다

B) `su - alice`는 alice의 로그인 환경(.profile, PATH, 홈)을 완전히 적용한다

C) `su alice`는 root 권한으로 전환하고 `su - alice`는 일반 권한이다

D) `su - alice`는 alice의 암호 없이도 전환할 수 있다

**정답: B**

해설: 하이픈(`-`)이 있으면 로그인 셸로 전환되어 대상 사용자의 `.bash_profile`/`.profile`을 읽고 PATH·HOME·작업 디렉터리를 그 사용자 기준으로 새로 설정한다. 하이픈이 없으면 환경 일부를 원래 사용자에게서 물려받는다. A·C는 차이/권한을 잘못 설명했고, D는 암호 요구 여부와 무관하므로 틀렸다.

---

**문제 4.** `/etc/sudoers` 파일을 편집할 때 권장되는 도구와 그 이유로 옳은 것은?

A) `vi` — 가장 빠르게 편집할 수 있어서

B) `cat` — 파일 내용을 안전하게 덮어쓸 수 있어서

C) `visudo` — 저장 시 문법을 검사하고 잠금을 걸어 손상을 막아서

D) `nano` — 자동으로 백업을 생성해서

**정답: C**

해설: `visudo`는 sudoers 저장 시 문법 오류를 검사하고 동시 편집을 막는 잠금을 건다. 일반 `vi`로 편집하다 문법을 틀리면 sudo 전체가 동작 불능이 되어 시스템이 잠길 수 있다. A·D는 그런 보호 기능이 없고, B의 `cat`은 편집 도구가 아니다.

---

**문제 5.** `su`와 `sudo`가 인증 시 요구하는 암호의 차이로 옳은 것은?

A) su는 자기 암호를, sudo는 대상 사용자 암호를 요구한다

B) su는 대상 사용자 암호를, sudo는 자기 암호를 요구한다

C) 둘 다 root 암호만 요구한다

D) 둘 다 암호를 요구하지 않는다

**정답: B**

해설: `su`는 전환하려는 대상 사용자의 암호를, `sudo`는 명령을 실행하는 본인의 암호를 요구한다. 이 때문에 sudo는 root 암호를 공유하지 않고도 특정 명령만 위임할 수 있어 최소권한·감사 원칙에 부합한다. A는 정반대이고, C·D는 두 명령 모두 틀렸다.

---

**문제 6.** `chage -M 90 alice` 명령이 변경하는 `/etc/shadow`의 필드는?

A) 마지막 암호 변경일(3번 필드)

B) 최소 변경 간격(4번 필드, Min)

C) 최대 유효일(5번 필드, Max)

D) 경고일(6번 필드, Warn)

**정답: C**

해설: `chage -M`(대문자 M)은 암호의 최대 유효일(Max)을 설정하며 이는 shadow의 5번 필드다. 90일이 지나면 암호 변경이 강제된다. A는 `-d`, B의 Min은 `-m`(소문자), D의 Warn은 `-W`로 각각 다른 필드를 건드린다.

---

**문제 7.** `userdel alice`(옵션 없음)를 실행했을 때의 동작으로 옳은 것은?

A) 홈 디렉터리와 메일 스풀까지 모두 삭제된다

B) 계정 레코드만 삭제되고 홈 디렉터리는 남는다

C) 계정을 잠그기만 하고 레코드는 그대로 둔다

D) 그룹 정보만 삭제하고 사용자는 유지한다

**정답: B**

해설: 옵션 없는 `userdel`은 passwd/shadow/group의 레코드만 삭제하고 홈 디렉터리는 남긴다. 홈과 메일 스풀까지 지우려면 `-r` 옵션을 붙여야 한다(A는 `-r`의 동작). C는 잠금(`passwd -l`/`usermod -L`)의 동작이고, D는 사실이 아니다.

---
