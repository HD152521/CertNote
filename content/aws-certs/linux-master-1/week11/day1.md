# Day 1 - Samba: 윈도와 리눅스를 잇는 파일·프린터 공유

## 📌 핵심 정리

- **Samba** = 리눅스에서 윈도의 **SMB/CIFS** 프로토콜을 구현한 소프트웨어. 윈도와 리눅스 사이의 파일·프린터 공유를 가능하게 한다.
- 데몬은 둘 — **smbd**(파일 공유·인증, TCP 139/445), **nmbd**(NetBIOS 이름 해석·브라우징, UDP 137/138).
- 설정은 전부 `/etc/samba/smb.conf`. 특수 섹션은 `[global]`·`[homes]`·`[printers]`이고, 나머지 섹션 이름이 곧 **공유 이름**이다.
- Samba 계정은 리눅스 로그인 계정과 **별개**다. 리눅스 계정을 먼저 만든 뒤 `smbpasswd -a`로 Samba 비밀번호를 등록한다.
- 접근은 **이중 관문** — `smb.conf`의 Samba 권한과 리눅스 파일시스템 권한을 **둘 다** 통과해야 한다. 수정 후에는 `testparm`으로 문법을 검증한다.

## Samba의 정체: SMB/CIFS 프로토콜과 두 개의 데몬

- 윈도 사용자는 탐색기에서 `\\서버\공유폴더`로 네트워크 드라이브를 잡고 싶어 하지만, 윈도는 **SMB/CIFS**(Server Message Block)를, 리눅스는 전통적으로 **NFS**를 쓴다. 이 간극을 메우는 도구가 **Samba**다.
- **SMB**: 1980년대 IBM이 만들고 마이크로소프트가 발전시킨 네트워크 파일 공유 프로토콜. 후에 **CIFS**(Common Internet File System)로 확장돼 오늘날 윈도 네트워크 공유의 표준이 됐다.
- **Samba**: 그 SMB 프로토콜을 리눅스/유닉스 위에서 구현한 자유 소프트웨어. 리눅스 서버가 마치 윈도 파일 서버처럼 보이게 만든다.
- Samba는 전통적으로 **두 개의 데몬**으로 동작한다.

| 데몬 | 역할 | 사용 포트 |
|------|------|-----------|
| `smbd` | 파일·프린터 공유, 사용자 인증 처리 | TCP 139, 445 |
| `nmbd` | NetBIOS 이름 서비스, 네트워크 브라우징(이름→IP 해석) | UDP 137, 138 |

- `smbd`가 실제 파일 전송과 인증을 담당하는 핵심이다.
- `nmbd`는 윈도의 "내 네트워크 환경"에 서버 이름이 보이게 해주는 이름 해석 서비스다.
- 현대 환경에서는 DNS와 445 포트만으로도 동작하지만, 시험에서는 두 데몬의 역할 구분이 단골이다.

> 💡 **핵심**: `smbd`는 **파일 공유와 인증**, `nmbd`는 **NetBIOS 이름 해석과 브라우징**. 포트도 짝지어 외워라 — smbd는 139/445(TCP), nmbd는 137/138(UDP).

Samba 패키지를 설치하면 보통 다음 명령으로 서비스를 다룬다.

```bash
# 패키지 설치 (RHEL 계열)
yum install samba samba-client samba-common

# 서비스 시작/자동시작 (systemd)
systemctl start smb nmb
systemctl enable smb nmb

# 구버전(SysV init)
service smb start
```

> 🔍 **배포판 차이**: 서비스 이름이 배포판마다 다르다. RHEL/CentOS 계열은 `smb`, `nmb`, 데비안/우분투 계열은 `smbd`, `nmbd`가 서비스 이름이다. 설정 파일 위치도 RHEL은 `/etc/samba/smb.conf`로 동일하다.

## smb.conf: Samba의 모든 것이 담긴 설정 파일

- Samba의 동작은 거의 전부 `/etc/samba/smb.conf` 하나로 결정된다.
- 구조는 윈도의 INI 파일과 비슷하다 — **섹션(section)** 단위로 나뉜다.
- 섹션 이름은 대괄호 `[ ]`로 감싼다.

```ini
# /etc/samba/smb.conf

[global]
    workgroup = WORKGROUP
    server string = Samba Server %v
    netbios name = LINUXSRV
    security = user
    map to guest = Bad User
    log file = /var/log/samba/log.%m
    max log size = 50

[homes]
    comment = Home Directories
    browseable = no
    writable = yes

[public]
    comment = Public Share
    path = /srv/samba/public
    browseable = yes
    writable = yes
    guest ok = yes
```

특별한 의미를 갖는 세 가지 섹션이 있다.

| 섹션 | 의미 |
|------|------|
| `[global]` | 서버 전체에 적용되는 전역 설정. 워크그룹, 보안 모드, 로깅 등 |
| `[homes]` | 각 사용자의 홈 디렉터리를 자동으로 공유 (특수 섹션) |
| `[printers]` | 시스템에 등록된 프린터를 자동으로 공유 (특수 섹션) |

- `[global]`을 제외한 나머지 섹션 이름은 곧 **공유 이름(share name)**이 된다.
- 예: 윈도에서 `\\LINUXSRV\public`로 접근하면 `[public]` 섹션의 설정이 적용된다.

> 💡 **개념**: `[homes]`는 마법 같은 섹션이다. 사용자 `kim`이 접속하면 Samba가 `[homes]` 정의를 복제해 `[kim]`이라는 가상 공유를 만들어 `kim`의 홈 디렉터리(`/home/kim`)로 연결한다. 그래서 별도로 사용자마다 공유를 정의할 필요가 없다.

### [global] 섹션의 주요 지시어

- `security` 지시어는 인증 방식을 결정하는 가장 중요한 항목이다.

| security 값 | 의미 |
|-------------|------|
| `user` | (기본·권장) Samba 서버 자체가 사용자/암호로 인증. 접속자는 Samba 계정이 있어야 함 |
| `share` | 공유 단위 암호 인증 (구식, 현재 폐기됨) |
| `domain` | 도메인 컨트롤러(별도 서버)에 인증 위임 |
| `ads` | 액티브 디렉터리(Active Directory) 도메인에 가입해 인증 |

- `workgroup` : 윈도 작업 그룹 이름을 지정한다.
- `server string` : 네트워크에서 보이는 서버 설명을 지정한다.
- `%v`(버전), `%m`(클라이언트 NetBIOS 이름) 같은 **치환 변수**를 쓸 수 있다.

## 공유 정의: 섹션별 지시어 정밀 해부

- 개별 공유 섹션에서 자주 쓰는 지시어를 정확히 알아야 실기에서 빈칸을 채울 수 있다.

| 지시어 | 의미 | 예 |
|--------|------|-----|
| `path` | 공유할 실제 디렉터리 경로 | `path = /srv/samba/data` |
| `comment` | 공유 설명 | `comment = Team Share` |
| `browseable` | 네트워크 목록에 공유 이름이 보일지 | `browseable = yes` |
| `writable` (= `read only = no`) | 쓰기 허용 여부 | `writable = yes` |
| `read only` | 읽기 전용 (writable의 반대) | `read only = yes` |
| `guest ok` (= `public`) | 암호 없이 게스트 접근 허용 | `guest ok = yes` |
| `valid users` | 접근 허용할 사용자/그룹 | `valid users = kim, @sales` |
| `write list` | 읽기 전용 공유에서 쓰기를 허용할 사용자 | `write list = admin` |
| `create mask` | 새로 만든 파일의 권한 마스크 | `create mask = 0644` |
| `directory mask` | 새로 만든 디렉터리의 권한 마스크 | `directory mask = 0755` |

> ⚠️ **주의**: `writable = yes`와 `read only = no`는 **같은 뜻**이다. 둘을 동시에 모순되게 쓰면 마지막에 쓴 값이 이긴다. `valid users = @sales`처럼 그룹은 `@`를 앞에 붙인다(그룹 지정 기호 — 시험 단골).

- 다음은 영업팀(`sales` 그룹)만 읽고 쓸 수 있는 공유 예시다.

```ini
[sales]
    comment = Sales Team Data
    path = /srv/samba/sales
    valid users = @sales
    writable = yes
    browseable = yes
    create mask = 0660
    directory mask = 0770
```

> 🔍 **권한의 이중 관문**: Samba 공유 접근은 두 단계 검사를 통과해야 한다. (1) `smb.conf`의 `valid users`/`writable` 같은 **Samba 수준 권한**, (2) 그 디렉터리에 대한 **리눅스 파일시스템 권한(chmod/chown)**. 둘 중 하나라도 막으면 접근이 거부된다. "smb.conf는 맞는데 쓰기가 안 된다"면 십중팔구 리눅스 디렉터리 권한 문제다.

## testparm: 설정 파일 문법 검증

- `smb.conf`를 수정한 뒤 오타를 잡으려면 **`testparm`**으로 문법을 검사한다.
- 실무에서 서비스를 재시작하기 전에 반드시 거치는 단계다.

```bash
# 문법 검사 + 적용될 설정 요약 출력
testparm

# 특정 파일을 검사
testparm /etc/samba/smb.conf
```

- 출력에 `Loaded services file OK.`가 나오면 문법은 정상이다.
- 이어서 Enter를 누르면 실제로 적용될 모든 설정값을 펼쳐 보여준다.

> 💡 **실무 흐름**: `smb.conf 수정 → testparm으로 검증 → systemctl restart smb → smbclient로 접속 테스트`. 이 순서를 몸에 익혀라.

## smbpasswd: Samba 전용 계정 만들기

- `security = user`에서는 접속자가 **Samba 비밀번호**를 가져야 한다.
- 핵심은 이것이 리눅스 로그인 비밀번호(`/etc/shadow`)와 **별개**라는 점이다.
- Samba는 자체 암호 데이터베이스(기본은 TDB 형식, 과거엔 `/etc/samba/smbpasswd` 파일)를 쓴다.
- **전제 조건**: Samba 사용자는 먼저 리눅스 시스템 계정으로 존재해야 한다. Samba 계정은 기존 리눅스 사용자 위에 비밀번호만 얹는 형태다.

```bash
# 1) 리눅스 시스템 계정이 먼저 있어야 한다
useradd -s /sbin/nologin sambauser

# 2) Samba 비밀번호 등록 (대화형으로 비밀번호 2번 입력)
smbpasswd -a sambauser
```

- `smbpasswd`의 주요 옵션은 정확히 구분해 외운다.

| 옵션 | 의미 |
|------|------|
| `-a 사용자` | Samba 데이터베이스에 사용자 **추가**(add) |
| `-x 사용자` | Samba 사용자 **삭제**(delete) |
| `-d 사용자` | 사용자 계정 **비활성화**(disable) |
| `-e 사용자` | 비활성화된 계정 **활성화**(enable) |
| `-n 사용자` | 비밀번호를 **없음(null)**으로 설정 |
| `(옵션 없이) 사용자` | 해당 사용자의 비밀번호 **변경** |

> ⚠️ **함정**: `smbpasswd -a`로 추가하기 전에 그 사용자가 `/etc/passwd`에 없으면 오류가 난다. "리눅스 계정 먼저, Samba 비밀번호 나중"의 순서를 헷갈리면 안 된다. 또한 `pdbedit -L`로 등록된 Samba 사용자 목록을 확인할 수 있다.

```bash
# 등록된 Samba 사용자 목록 보기
pdbedit -L

# 상세 정보까지
pdbedit -Lv
```

## smbclient: 리눅스에서 SMB 공유 접속·테스트

- 서버 설정이 끝나면 클라이언트 쪽에서 접속을 확인해야 한다.
- **`smbclient`**는 FTP와 비슷한 대화형 인터페이스로 SMB 공유에 접속하는 도구다.

```bash
# 서버가 제공하는 공유 목록 보기 (-L = list)
smbclient -L //LINUXSRV -U sambauser

# 특정 공유에 접속 (FTP 비슷한 프롬프트로 진입)
smbclient //LINUXSRV/sales -U sambauser

# 접속 후 smb: \> 프롬프트에서 ls, get, put, cd 등 사용
```

- 리눅스 클라이언트에서 SMB 공유를 **마운트**해 일반 디렉터리처럼 쓸 수도 있다.

```bash
# cifs 타입으로 마운트
mount -t cifs //LINUXSRV/sales /mnt/sales -o username=sambauser

# /etc/fstab 등록 예
# //LINUXSRV/sales  /mnt/sales  cifs  username=sambauser,password=secret  0 0
```

> 📚 **mount 타입 정리**: 윈도/Samba 공유는 `mount -t cifs`(과거엔 `-t smbfs`), 리눅스끼리는 `mount -t nfs`. 시험에서 "윈도 공유 폴더를 리눅스에 마운트하는 타입"을 물으면 `cifs`다.

## 한눈에 보는 Samba 구축 흐름

```bash
# ① 설치
yum install samba samba-client

# ② 공유 디렉터리 준비 + 리눅스 권한
mkdir -p /srv/samba/sales
chgrp sales /srv/samba/sales
chmod 2770 /srv/samba/sales      # SGID로 그룹 상속

# ③ smb.conf 편집 ([global] + [sales] 섹션)
vi /etc/samba/smb.conf

# ④ 문법 검증
testparm

# ⑤ Samba 계정 등록
smbpasswd -a sambauser

# ⑥ 서비스 시작
systemctl restart smb nmb

# ⑦ 방화벽 개방 (firewalld)
firewall-cmd --add-service=samba --permanent
firewall-cmd --reload

# ⑧ 접속 테스트
smbclient -L //localhost -U sambauser
```

> 🔍 **직접 쳐보기**: 가상머신 두 대(또는 로컬 루프백)로 위 ①~⑧을 한 번 따라 해 보라. 특히 ④ `testparm`이 토해내는 경고 메시지를 읽어보면 어떤 지시어가 잘못됐는지 감이 잡힌다. ⑦ 방화벽을 빼먹고 "접속이 안 된다"며 헤매는 게 가장 흔한 실수다.

내일은 리눅스끼리의 표준 공유인 NFS를 다루며, Samba와 어떻게 다른지 비교한다.

## 📖 용어

- **SMB/CIFS** : 윈도가 쓰는 네트워크 파일 공유 프로토콜. Samba가 리눅스에서 이것을 구현한다.
- **smbd** : 파일·프린터 공유와 사용자 인증을 처리하는 Samba의 핵심 데몬. TCP 139/445를 쓴다.
- **nmbd** : NetBIOS 이름을 IP로 풀어주고 네트워크 목록에 서버를 띄우는 데몬. UDP 137/138을 쓴다.
- **smb.conf** : `/etc/samba/`에 있는 Samba의 단일 설정 파일. 대괄호 섹션으로 구성된다.
- **[homes]** : 접속한 사용자의 홈 디렉터리를 자동으로 가상 공유로 만들어 주는 특수 섹션.
- **security = user** : Samba 서버가 자체 계정/암호로 직접 인증하는 기본 모드.
- **valid users** : 그 공유에 접근할 수 있는 사용자 목록. 이름 앞에 `@`를 붙이면 그룹을 뜻한다.
- **smbpasswd** : Samba 전용 비밀번호를 등록·삭제·잠금하는 명령. `-a` 추가, `-x` 삭제, `-d` 비활성, `-e` 활성.
- **testparm** : `smb.conf`의 문법을 검사하고 실제 적용될 값을 펼쳐 보여주는 검증 도구.
- **cifs** : 윈도/Samba 공유를 리눅스에 마운트할 때 지정하는 파일시스템 타입(`mount -t cifs`).

## 📝 연습 문제

**문제 1.** Samba에서 실제 파일 공유와 사용자 인증을 담당하는 데몬으로 옳은 것은?

A) nmbd
B) smbd
C) rpcbind
D) winbindd

**정답: B**

해설: `smbd`는 파일·프린터 공유와 사용자 인증을 처리하며 TCP 139/445 포트를 사용한다. `nmbd`는 NetBIOS 이름 해석과 네트워크 브라우징을 담당하는 별개의 데몬으로 UDP 137/138을 쓴다. `rpcbind`는 NFS에서 쓰이는 포트 매퍼이며, `winbindd`는 도메인 통합용 보조 데몬이다.

---

**문제 2.** `smb.conf`에서 각 사용자의 홈 디렉터리를 자동으로 공유하는 특수 섹션은?

A) [global]
B) [printers]
C) [homes]
D) [public]

**정답: C**

해설: `[homes]`는 특수 섹션으로, 사용자가 접속하면 그 사용자의 홈 디렉터리(`/home/사용자`)를 가상 공유로 자동 생성한다. `[global]`은 서버 전체 설정, `[printers]`는 프린터 자동 공유를 담당한다. `[public]`은 일반적인 사용자 정의 공유 이름일 뿐 특수 섹션이 아니다.

---

**문제 3.** 다음 `smb.conf` 설정에 대한 설명으로 옳은 것은?

```ini
[data]
    path = /srv/data
    valid users = @sales
    writable = yes
```

A) 모든 사용자가 게스트로 접근할 수 있다
B) sales라는 이름의 사용자 한 명만 접근할 수 있다
C) sales 그룹에 속한 사용자들이 읽고 쓸 수 있다
D) 읽기 전용 공유이므로 쓰기가 불가능하다

**정답: C**

해설: `valid users`에서 `@`가 앞에 붙으면 그룹을 의미한다. 따라서 `@sales`는 sales 그룹에 속한 사용자 전체를 가리킨다. `writable = yes`이므로 읽기뿐 아니라 쓰기도 가능하다. `@`가 없으면 개별 사용자 이름이 되지만 여기서는 그룹 지정이다.

---

**문제 4.** Samba 사용자를 데이터베이스에 추가하기 위한 명령으로 옳은 것은?

A) smbpasswd -x user
B) smbpasswd -a user
C) smbpasswd -d user
D) smbpasswd -e user

**정답: B**

해설: `-a`(add)는 Samba 데이터베이스에 사용자를 추가한다. `-x`는 삭제, `-d`는 비활성화, `-e`는 활성화다. 단, 추가하려는 사용자는 먼저 리눅스 시스템 계정(`/etc/passwd`)으로 존재해야 한다.

---

**문제 5.** `smb.conf`를 수정한 뒤 문법 오류를 검사하는 명령은?

A) smbclient -L
B) testparm
C) pdbedit -L
D) nmblookup

**정답: B**

해설: `testparm`은 `smb.conf`의 문법을 검사하고 실제로 적용될 설정값을 요약해 보여준다. `smbclient -L`은 서버의 공유 목록을 조회, `pdbedit -L`은 등록된 Samba 사용자 목록을 출력, `nmblookup`은 NetBIOS 이름을 질의하는 도구다.

---

**문제 6.** 리눅스 클라이언트에서 윈도/Samba 공유 폴더를 마운트할 때 사용하는 파일시스템 타입은?

A) nfs
B) ext4
C) cifs
D) tmpfs

**정답: C**

해설: 윈도·Samba 공유는 SMB/CIFS 프로토콜을 쓰므로 `mount -t cifs`로 마운트한다(과거엔 `smbfs`). `nfs`는 리눅스/유닉스 간 공유 타입이며, `ext4`는 로컬 디스크 파일시스템, `tmpfs`는 메모리 기반 임시 파일시스템이다.

---

**문제 7.** `[global]` 섹션의 `security = user` 설정에 대한 설명으로 옳은 것은?

A) 공유별로 암호를 설정하는 구식 방식이다
B) Samba 서버 자체가 사용자명과 암호로 인증을 수행한다
C) 별도의 도메인 컨트롤러에 인증을 위임한다
D) Active Directory에 가입하여 인증한다

**정답: B**

해설: `security = user`는 기본이자 권장 모드로, Samba 서버가 자체 데이터베이스의 사용자/암호로 직접 인증한다. 따라서 접속자는 `smbpasswd`로 등록된 Samba 계정이 필요하다. `share`가 공유별 암호 방식(폐기됨), `domain`이 도메인 위임, `ads`가 Active Directory 가입 방식이다.

---
