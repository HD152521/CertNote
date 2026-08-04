# Day 2 - NFS: 유닉스 세계의 표준 파일 공유

## 📌 핵심 정리

- **NFS**(Network File System)는 1984년 썬 마이크로시스템즈가 만든 유닉스/리눅스 표준 파일 공유. 원격 디렉터리를 로컬 디스크처럼 마운트한다.
- NFS는 **RPC** 위에서 동작한다 → **`rpcbind`(포트 111)**가 살아 있지 않으면 NFS 자체가 안 된다.
- 서버 설정은 `/etc/exports` 한 파일. 형식은 `디렉터리 클라이언트(옵션)`이고 **클라이언트와 괄호 사이에 공백이 있으면 안 된다**.
- 수정 후 적용은 `exportfs -ra`, 확인은 `exportfs -v`. 클라이언트는 `showmount -e`로 조회하고 `mount -t nfs`로 붙는다.
- 리눅스끼리면 NFS(**IP·UID 신뢰**), 윈도가 섞이면 Samba(**계정 인증**).

## NFS의 구조: RPC와 포트 매퍼

- NFS는 단독으로 동작하지 않고 **RPC**(Remote Procedure Call, 원격 프로시저 호출) 위에서 동작한다.
- RPC는 클라이언트가 원격 서버의 함수를 마치 로컬 함수처럼 호출하게 해주는 메커니즘이다.
- RPC 기반 서비스는 고정 포트가 아니라 동적으로 포트를 할당받는다. 그 포트 정보를 중개하는 것이 **`rpcbind`**(과거 이름 `portmap`)다.
- 흐름: 클라이언트가 서버의 `rpcbind`(고정 포트 **111**)에 "NFS 서비스가 몇 번 포트인가"를 묻는다 → 응답받은 포트로 실제 NFS 통신을 한다.
- 그래서 `rpcbind`가 죽어 있으면 NFS 자체가 동작하지 않는다.

| 구성 요소 | 역할 |
|-----------|------|
| `rpcbind` (포트 111) | RPC 서비스의 포트 정보를 중개하는 포트 매퍼 |
| `nfs-server` (nfsd) | 실제 파일 입출력 요청을 처리하는 NFS 데몬 |
| `mountd` (rpc.mountd) | 클라이언트의 mount 요청을 받아 권한을 검사 |
| `rpc.statd` / `lockd` | 파일 잠금과 상태 복구 관리 |

> 💡 **핵심**: NFS 동작의 전제는 **`rpcbind`(포트 111)가 살아 있어야 한다**는 것. "NFS 마운트가 안 된다"의 1순위 원인은 서버나 클라이언트의 rpcbind 미실행, 또는 방화벽에서 111 포트가 막힌 것이다. `rpcinfo -p 서버IP`로 등록된 RPC 서비스를 확인할 수 있다.

```bash
# 서버에 등록된 RPC 서비스 목록 확인
rpcinfo -p localhost

# NFS 관련 서비스 시작 (RHEL 계열)
systemctl start rpcbind nfs-server
systemctl enable rpcbind nfs-server
```

## /etc/exports: 무엇을 누구에게 내보낼 것인가

- 서버 쪽 NFS 설정의 핵심은 **`/etc/exports`** 파일 하나다.
- "어떤 디렉터리를, 어떤 클라이언트에게, 어떤 권한으로 내보낼지"를 한 줄에 하나씩 정의한다.
- 문법은 다음과 같다.

```
공유할_디렉터리    클라이언트(옵션,옵션,...)   클라이언트2(옵션,...)
```

```bash
# /etc/exports 예시
/srv/share      192.168.1.0/24(rw,sync,no_subtree_check)
/data/public    *(ro,sync)
/home/team      192.168.1.10(rw,sync)  192.168.1.20(ro)
/secret         server.example.com(rw,sync,root_squash)
```

- 여기서 **공백의 위치가 결정적**이다. 클라이언트 이름과 괄호 사이에 **공백이 있으면 안 된다**.
- NFS exports 문법에서 가장 악명 높은 함정이다.

> ⚠️ **치명적 함정**: `192.168.1.10(rw)`와 `192.168.1.10 (rw)`는 전혀 다르다. 공백이 없으면 "10번 호스트에 rw 권한", 공백이 있으면 "10번 호스트에 기본 권한(ro), 그리고 **모든 호스트(`*`)에 rw 권한**"으로 해석된다. 보안 사고로 직결되는 차이다. 실기 단골이니 반드시 기억하라.

### 클라이언트 지정 방식

| 표기 | 의미 |
|------|------|
| `192.168.1.10` | 특정 IP 호스트 하나 |
| `192.168.1.0/24` | 서브넷 전체 |
| `*.example.com` | 도메인 내 모든 호스트 (와일드카드) |
| `*` | 모든 호스트 |
| `server1` | 호스트 이름 |

### 주요 export 옵션

| 옵션 | 의미 |
|------|------|
| `ro` | 읽기 전용 (read only) |
| `rw` | 읽기·쓰기 |
| `sync` | 데이터를 디스크에 쓴 뒤 응답 (안전, 기본·권장) |
| `async` | 디스크 기록 전에 응답 (빠르지만 위험) |
| `root_squash` | 클라이언트의 root를 익명 사용자(nfsnobody)로 강등 (기본·보안) |
| `no_root_squash` | 클라이언트의 root를 서버에서도 root로 인정 (위험) |
| `all_squash` | 모든 사용자를 익명으로 강등 |
| `no_subtree_check` | 하위 트리 검사 생략 (성능·권장) |
| `secure` | 1024 미만의 특권 포트에서 온 요청만 허용 (기본) |

> 🔍 **root_squash의 의미**: NFS는 기본적으로 클라이언트의 root를 믿지 않는다. 클라이언트에서 root로 공유 파일을 만져도 서버에서는 `nfsnobody`(익명 사용자)로 취급된다. 이것이 `root_squash`이며 기본값이다. `no_root_squash`는 신뢰하는 환경에서만 쓰는 위험한 옵션이다 — 클라이언트 root가 서버 파일을 root 권한으로 마음대로 다룰 수 있게 된다.

## exportfs: exports를 적용하고 관리하기

- `/etc/exports`를 수정한 뒤에는 그 내용을 NFS 서버에 적용해야 한다.
- 서비스를 통째로 재시작하지 않고 export 테이블만 갱신하는 도구가 **`exportfs`**다.

| 명령 | 의미 |
|------|------|
| `exportfs -a` | `/etc/exports`의 모든 항목을 export (all) |
| `exportfs -r` | export 테이블을 다시 읽어 갱신 (re-export, 수정 후 가장 많이 씀) |
| `exportfs -u` | 특정 export를 해제 (unexport) |
| `exportfs -v` | 현재 export 목록을 상세히 출력 (verbose) |
| `exportfs -ra` | 전체 재적용 (자주 쓰는 조합) |

```bash
# /etc/exports 수정 후 변경사항 적용
exportfs -ra

# 현재 내보내고 있는 목록 확인
exportfs -v

# 특정 공유 해제
exportfs -u 192.168.1.0/24:/srv/share
```

> 💡 **실무 흐름**: `vi /etc/exports → exportfs -ra → exportfs -v로 확인`. NFS 서버를 재시작(`systemctl restart nfs-server`)해도 적용되지만, 운영 중에는 `exportfs -ra`로 무중단 갱신하는 것이 정석이다.

## 클라이언트: showmount와 mount -t nfs

- 클라이언트는 먼저 서버가 무엇을 내보내는지 확인하고, 그다음 마운트한다.
- 서버의 export 목록을 조회하는 도구가 **`showmount`**다.

```bash
# 서버가 내보내는 공유 목록 보기 (-e = exports)
showmount -e 192.168.1.100

# 서버에 현재 마운트한 클라이언트 보기
showmount -a 192.168.1.100
```

- 실제 마운트는 **`mount -t nfs`**로 한다.

```bash
# 원격 NFS 공유를 로컬 디렉터리에 마운트
mount -t nfs 192.168.1.100:/srv/share /mnt/share

# 마운트 옵션 지정
mount -t nfs -o rw,soft,timeo=30 192.168.1.100:/srv/share /mnt/share
```

- 부팅 시 자동 마운트하려면 `/etc/fstab`에 등록한다.

```bash
# /etc/fstab 항목 예시
# 서버:원격경로            마운트지점    타입   옵션               덤프 검사
192.168.1.100:/srv/share  /mnt/share   nfs   defaults,_netdev   0    0
```

> ⚠️ **`_netdev` 옵션**: `/etc/fstab`에 NFS를 등록할 때 `_netdev`를 붙이면 "네트워크가 올라온 뒤에 마운트하라"는 뜻이다. 이를 빠뜨리면 부팅 중 네트워크가 준비되기 전에 마운트를 시도해 부팅이 멈출 수 있다.

### hard vs soft 마운트

| 옵션 | 동작 |
|------|------|
| `hard` | 서버 응답이 없으면 무한 재시도 (기본, 데이터 안전) |
| `soft` | 일정 시간(`timeo`) 후 오류 반환하고 포기 (응답성 우선) |

> 📚 **hard가 기본인 이유**: NFS는 데이터 무결성을 위해 기본적으로 `hard` 마운트를 쓴다. 서버가 잠시 멈춰도 복구되면 작업이 이어진다. 단, 서버가 영영 죽으면 프로세스가 무한 대기에 빠질 수 있어 `intr`(인터럽트 허용)나 `soft`로 보완하기도 한다.

## NFS vs Samba: 언제 무엇을 쓰는가

- 두 공유 방식을 나란히 비교하면 시험 출제 포인트가 선명해진다.

| 항목 | NFS | Samba(SMB/CIFS) |
|------|-----|-----------------|
| 주 용도 | 유닉스/리눅스 간 공유 | 윈도 ↔ 리눅스 공유 |
| 프로토콜 | NFS (RPC 기반) | SMB/CIFS |
| 핵심 설정 파일 | `/etc/exports` | `/etc/samba/smb.conf` |
| 적용/관리 명령 | `exportfs` | `testparm`, `smbpasswd` |
| 의존 서비스 | `rpcbind`(포트 111) | `smbd`, `nmbd` |
| 마운트 타입 | `mount -t nfs` | `mount -t cifs` |
| 주요 포트 | 111(rpcbind), 2049(nfs) | 139/445(smbd), 137/138(nmbd) |
| 인증 방식 | 호스트(IP) 기반 + 사용자 UID 매핑 | 사용자 계정/암호 기반 |
| 권한 모델 | 리눅스 UID/GID 그대로 | Samba 계정 + 리눅스 권한 |

> 💡 **선택 기준 한 줄**: 공유 대상이 **전부 리눅스/유닉스**면 NFS, **윈도가 섞여 있으면** Samba. NFS는 IP(호스트) 단위 신뢰, Samba는 사용자 계정 단위 인증이라는 철학 차이가 핵심이다.

> 🔍 **인증 모델의 차이**: NFS는 클라이언트의 UID/GID를 그대로 신뢰한다. 클라이언트에서 UID 1000인 사용자는 서버에서도 UID 1000으로 취급된다. 그래서 NFS 환경에서는 서버와 클라이언트의 사용자 UID를 일치시켜야(또는 NIS/LDAP로 통합) 권한 혼란이 없다. Samba는 그와 무관하게 Samba 자체 계정으로 인증한다.

## 한눈에 보는 NFS 구축 흐름

```bash
# === 서버 측 ===
# ① 패키지 설치
yum install nfs-utils

# ② 공유 디렉터리 준비
mkdir -p /srv/share
chmod 755 /srv/share

# ③ /etc/exports 편집 (공백 주의!)
echo "/srv/share 192.168.1.0/24(rw,sync,no_subtree_check)" >> /etc/exports

# ④ 서비스 시작
systemctl start rpcbind nfs-server
systemctl enable rpcbind nfs-server

# ⑤ export 적용
exportfs -ra
exportfs -v

# ⑥ 방화벽 개방
firewall-cmd --add-service=nfs --add-service=rpc-bind --add-service=mountd --permanent
firewall-cmd --reload

# === 클라이언트 측 ===
# ⑦ 서버 공유 확인
showmount -e 192.168.1.100

# ⑧ 마운트
mount -t nfs 192.168.1.100:/srv/share /mnt/share
```

> 🔍 **직접 쳐보기**: `/etc/exports`에 일부러 `192.168.1.10 (rw)`처럼 공백을 넣어 보고 `exportfs -v`로 결과를 확인해 보라. 의도와 다르게 `*`에 rw가 부여되는 걸 눈으로 보면 공백 함정이 평생 기억에 남는다. 또 `rpcbind`를 일부러 멈춘 뒤(`systemctl stop rpcbind`) 마운트가 어떻게 실패하는지도 관찰해 보라.

내일은 시스템을 외부로부터 지키는 방화벽 — iptables와 firewalld를 다룬다.

## 📖 용어

- **NFS** : 원격 서버의 디렉터리를 로컬 디스크처럼 마운트해 쓰는 유닉스/리눅스 표준 파일 공유.
- **RPC** : 원격 서버의 함수를 로컬 함수처럼 호출하게 해주는 메커니즘. NFS가 이 위에서 동작한다.
- **rpcbind** : RPC 서비스가 몇 번 포트에 있는지 알려주는 포트 매퍼. 고정 포트 111. 과거 이름은 `portmap`.
- **/etc/exports** : "어떤 디렉터리를 누구에게 어떤 권한으로 내보낼지" 정의하는 NFS 서버 설정 파일.
- **exportfs** : `/etc/exports` 내용을 서버에 적용·해제·조회하는 명령. `-ra` 전체 재적용, `-v` 목록 확인.
- **root_squash** : 클라이언트의 root를 서버에서 익명 사용자(nfsnobody)로 강등하는 기본 보안 옵션.
- **sync / async** : 디스크에 쓴 뒤 응답할지(안전), 쓰기 전에 응답할지(빠르지만 위험) 정하는 옵션.
- **showmount** : 서버가 내보내는 공유 목록(`-e`)이나 마운트 중인 클라이언트(`-a`)를 조회하는 명령.
- **hard / soft 마운트** : 서버 무응답 시 무한 재시도(기본, 안전)할지, 일정 시간 뒤 오류를 낼지 정하는 방식.
- **_netdev** : `/etc/fstab`에서 "네트워크가 올라온 뒤 마운트하라"는 옵션. 빠뜨리면 부팅이 멈출 수 있다.

## 📝 연습 문제

**문제 1.** NFS 서비스가 동작하기 위해 반드시 필요하며, RPC 서비스의 포트 정보를 중개하는 데몬은?

A) nmbd
B) rpcbind
C) smbd
D) named

**정답: B**

해설: NFS는 RPC 기반 서비스이며, RPC 서비스들은 동적으로 포트를 할당받는다. `rpcbind`(과거 portmap, 포트 111)가 이 포트 정보를 중개하므로 rpcbind가 없으면 NFS가 동작하지 않는다. `nmbd`/`smbd`는 Samba 데몬, `named`는 DNS 데몬이다.

---

**문제 2.** 다음 `/etc/exports` 항목에 대한 설명으로 옳은 것은?

```
/data    192.168.1.0/24(rw,sync)
```

A) 모든 호스트에 읽기 전용으로 공유한다
B) 192.168.1.0/24 서브넷에 읽기·쓰기로 공유하며 동기 기록한다
C) 192.168.1.0 호스트 하나에만 공유한다
D) 문법 오류로 적용되지 않는다

**정답: B**

해설: `192.168.1.0/24`는 해당 서브넷 전체를 의미하고, `rw`는 읽기·쓰기, `sync`는 데이터를 디스크에 기록한 뒤 응답하는 안전 모드다. 클라이언트와 괄호 사이에 공백이 없으므로 문법도 정상이다.

---

**문제 3.** `/etc/exports`에서 클라이언트 지정과 옵션 괄호 사이에 공백을 넣었을 때 발생하는 결과로 옳은 것은?

A) 문법 오류로 export가 전혀 되지 않는다
B) 공백이 무시되고 정상 적용된다
C) 지정한 호스트에는 기본 권한이, 모든 호스트(*)에는 괄호 안 옵션이 적용된다
D) 자동으로 root_squash가 비활성화된다

**정답: C**

해설: `192.168.1.10 (rw)`처럼 공백이 있으면 NFS는 "192.168.1.10에 기본 권한(ro)"과 "모든 호스트(*)에 rw 권한"의 두 항목으로 해석한다. 의도치 않게 전체에 쓰기 권한이 열리는 심각한 보안 함정이므로 공백을 절대 넣으면 안 된다.

---

**문제 4.** `/etc/exports`를 수정한 후 NFS 서버를 재시작하지 않고 export 테이블을 갱신하는 명령은?

A) exportfs -u
B) exportfs -ra
C) showmount -e
D) rpcinfo -p

**정답: B**

해설: `exportfs -r`은 export 테이블을 다시 읽어 갱신(re-export)하고, `-a`는 전체 적용(all)이다. 조합한 `exportfs -ra`가 수정 후 무중단 갱신에 가장 흔히 쓰인다. `-u`는 해제, `showmount -e`는 공유 조회, `rpcinfo -p`는 RPC 서비스 확인이다.

---

**문제 5.** NFS export 옵션 중 클라이언트의 root 사용자를 서버에서 익명 사용자로 강등시켜 보안을 강화하는 기본 옵션은?

A) no_root_squash
B) all_squash
C) root_squash
D) async

**정답: C**

해설: `root_squash`는 클라이언트의 root를 서버의 익명 사용자(nfsnobody)로 매핑하는 기본 보안 옵션이다. `no_root_squash`는 클라이언트 root를 서버 root로 인정하는 위험한 옵션, `all_squash`는 모든 사용자를 익명으로 강등, `async`는 비동기 기록 옵션이다.

---

**문제 6.** 클라이언트에서 NFS 서버가 내보내는 공유 디렉터리 목록을 확인하는 명령은?

A) showmount -e 서버IP
B) mount -t nfs 서버IP
C) exportfs -v
D) smbclient -L 서버IP

**정답: A**

해설: `showmount -e 서버IP`는 해당 서버가 `/etc/exports`로 내보내는 공유 목록을 조회한다. `mount -t nfs`는 실제 마운트, `exportfs -v`는 서버 자신의 export 목록 확인(서버에서 실행), `smbclient -L`은 Samba 공유 조회용이다.

---

**문제 7.** NFS와 Samba를 비교한 설명으로 옳지 않은 것은?

A) NFS는 mount -t nfs로, Samba 공유는 mount -t cifs로 마운트한다
B) NFS는 주로 유닉스/리눅스 간, Samba는 윈도와의 공유에 쓴다
C) NFS의 핵심 설정 파일은 /etc/exports, Samba는 /etc/samba/smb.conf다
D) NFS는 사용자 계정/암호 기반, Samba는 IP 호스트 기반으로 인증한다

**정답: D**

해설: 인증 모델이 반대로 서술되었다. NFS는 클라이언트의 IP(호스트) 신뢰와 UID/GID 매핑 기반이고, Samba는 사용자 계정/암호(`smbpasswd`) 기반 인증이다. 나머지 보기는 모두 옳다.

---
