# Day 2 - 서비스 설정파일 단답: 지시어 하나가 합격을 가른다

## 📌 핵심 정리

- 오늘은 명령이 아니라 **설정 파일 안의 단어**를 외운다. 빈칸은 결국 "이 기능 = 이 지시어"의 1:1 매핑이다.
- 웹: 문서 루트는 **`DocumentRoot`**, 수신 포트는 **`Listen`**(`Port` 아님), 기본 문서는 `DirectoryIndex`.
- DNS: `named.conf`(설정) + zone 파일(데이터) 두 축. **존을 고치면 SOA Serial을 반드시 증가**시킨다. 이름→IP는 `A`, IP→이름은 `PTR`.
- DHCP는 `range`(동적 범위)와 `host`+`hardware ethernet`+`fixed-address`(MAC 고정). FTP는 `anonymous_enable`·`write_enable`·`chroot_local_user`.
- 공유: Samba는 `path`·`writable`·`valid users`(그룹은 `@`), NFS exports는 **괄호 앞 공백 금지**와 `root_squash`.
- SSH는 `PermitRootLogin no`가 핵심. 서버 파일은 `sshd_config`, 클라이언트 파일은 `ssh_config`로 서로 다르다.
- 설정을 고쳤으면 **검증 도구(`testparm`·`named-checkconf`·`httpd -t`·`sshd -t`)로 확인하고 재시작**까지가 한 세트다.

## Apache httpd.conf — 웹 서버의 심장

- 설정 파일은 `/etc/httpd/conf/httpd.conf`(RHEL 계열).
- 단답에 자주 나오는 지시어는 다음과 같다.

```apache
ServerRoot "/etc/httpd"        # 설정·로그 기준 디렉터리
Listen 80                      # 수신 포트
ServerName www.example.com:80  # 서버 이름
DocumentRoot "/var/www/html"   # 웹 문서 루트 (핵심!)
DirectoryIndex index.html      # 기본 문서
ServerAdmin root@example.com   # 관리자 이메일
MaxClients 256                 # 동시 접속 최대(prefork)
ErrorLog "logs/error_log"      # 에러 로그
CustomLog "logs/access_log" combined   # 접근 로그

<Directory "/var/www/html">    # 디렉터리별 접근 제어
    AllowOverride None         # .htaccess 허용 범위
    Require all granted        # 접근 허용(2.4 문법)
</Directory>
```

| 지시어 | 의미 | 단골 함정 |
|--------|------|----------|
| `DocumentRoot` | 웹 문서 최상위 경로 | 가장 많이 출제 |
| `Listen` | 수신 포트(기본 80) | `Port`가 아님(2.2 이후) |
| `DirectoryIndex` | 기본 표시 문서 | index.html |
| `ServerName` | 서버 이름:포트 | |
| `AllowOverride` | .htaccess 적용 범위 | None이면 .htaccess 무시 |

> 💡 **빈칸 단골**: 웹 문서가 위치하는 최상위 디렉터리를 지정하는 지시어 → **`DocumentRoot`**. 수신 포트는 **`Listen`**(과거 `Port` 아님).

> 🔍 **가상호스트**: 한 서버에 여러 사이트는 `<VirtualHost *:80>` 블록에 `ServerName`과 `DocumentRoot`를 각각 지정한다.

## BIND named.conf + zone 파일 — DNS의 두 축

- DNS 서버 BIND는 **메인 설정(`/etc/named.conf`)**과 **존 데이터(`/var/named/*.zone`)** 두 파일로 동작한다.
- 둘을 구분하는 것이 핵심이다.

```text
// /etc/named.conf
options {
    listen-on port 53 { any; };     // 수신 인터페이스
    directory "/var/named";          // 존 파일 위치
    allow-query { any; };            // 질의 허용 대상
};
zone "example.com" IN {
    type master;                     // master(주)/slave(보조)
    file "example.com.zone";         // 존 데이터 파일명
};
```

- 존 파일(`example.com.zone`)에는 **리소스 레코드(RR)**가 들어간다.

```text
$TTL 86400
@   IN  SOA  ns.example.com. admin.example.com. (
        2026060501   ; Serial (수정 시 반드시 증가!)
        3600         ; Refresh
        1800         ; Retry
        604800       ; Expire
        86400 )      ; Minimum TTL
@       IN  NS   ns.example.com.    ; 네임서버
@       IN  MX 10 mail.example.com. ; 메일 서버(우선순위)
ns      IN  A    192.168.1.10       ; 정방향: 이름→IP
www     IN  A    192.168.1.20
mail    IN  A    192.168.1.30
ftp     IN  CNAME www               ; 별칭
```

| 레코드 | 의미 | 기억법 |
|--------|------|--------|
| `SOA` | 권한 시작·존 정보 | Serial 증가 필수 |
| `NS` | 네임서버 지정 | Name Server |
| `A` | 이름→IPv4 | Address |
| `AAAA` | 이름→IPv6 | A 4개 |
| `MX` | 메일 서버(우선순위) | Mail eXchange |
| `CNAME` | 별칭(정규이름) | Canonical Name |
| `PTR` | IP→이름(역방향) | Pointer |

> ⚠️ **단골 함정**: 존 파일을 수정하면 **SOA의 Serial 값을 반드시 증가**시켜야 slave가 변경을 감지한다. Serial을 안 올리면 보조 서버에 갱신이 안 된다.

> 📚 **정방향 vs 역방향**: 이름→IP는 `A` 레코드(정방향), IP→이름은 `PTR` 레코드(역방향, `in-addr.arpa` 존). 메일 서버 지정은 `MX`.

## DHCP dhcpd.conf — 주소를 빌려주는 규칙

- DHCP 서버 설정은 `/etc/dhcp/dhcpd.conf`.
- subnet 블록 안에 임대 범위와 옵션을 정의한다.

```text
# /etc/dhcp/dhcpd.conf
default-lease-time 600;
max-lease-time 7200;
subnet 192.168.1.0 netmask 255.255.255.0 {
    range 192.168.1.100 192.168.1.200;          # 할당 범위
    option routers 192.168.1.1;                  # 게이트웨이
    option domain-name-servers 8.8.8.8;          # DNS
    option subnet-mask 255.255.255.0;            # 넷마스크
}
host printer {                                   # 고정 IP 예약
    hardware ethernet 00:11:22:33:44:55;         # MAC 주소
    fixed-address 192.168.1.50;                  # 고정 할당 IP
}
```

| 지시어 | 의미 |
|--------|------|
| `range` | 동적 할당 IP 범위 |
| `option routers` | 기본 게이트웨이 |
| `option domain-name-servers` | 클라이언트 DNS |
| `default-lease-time` | 기본 임대 시간(초) |
| `host`+`hardware ethernet`+`fixed-address` | MAC 기반 고정 IP |

> 💡 **빈칸 단골**: 동적 할당 주소 범위를 지정하는 지시어 → **`range`**. 특정 MAC에 항상 같은 IP를 주려면 `host` 블록의 `hardware ethernet`(MAC) + `fixed-address`(IP).

## vsftpd.conf — FTP 접속 통제

- 설정 파일은 `/etc/vsftpd/vsftpd.conf`.
- 익명 접속·쓰기 허용·chroot가 단골이다.

```text
# /etc/vsftpd/vsftpd.conf
anonymous_enable=NO        # 익명 접속 (보안상 NO 권장)
local_enable=YES           # 로컬 계정 로그인 허용
write_enable=YES           # 업로드(쓰기) 허용
chroot_local_user=YES      # 사용자를 홈에 가둠(상위 이동 차단)
listen=YES                 # 독립 데몬 모드
ftpd_banner=Welcome        # 접속 배너
```

| 지시어 | YES/NO 의미 |
|--------|------------|
| `anonymous_enable` | 익명 ftp 허용 여부 |
| `local_enable` | 시스템 계정 로그인 허용 |
| `write_enable` | 쓰기(업로드/삭제) 허용 |
| `chroot_local_user` | 홈 디렉터리 격리 |

> ⚠️ **보안 함정**: `anonymous_enable=YES` + `write_enable=YES`는 누구나 업로드 가능한 위험 설정. 보통 익명은 NO, 격리는 `chroot_local_user=YES`.

## Samba smb.conf & NFS exports — 공유 두 형제

```text
# /etc/samba/smb.conf
[global]
    workgroup = WORKGROUP
    security = user            # 인증 방식
[share]
    path = /srv/share          # 공유할 실제 경로
    writable = yes             # 쓰기 허용(= read only = no)
    valid users = @staff       # 접근 허용 계정(@=그룹)
    guest ok = no              # 게스트 접근
```

```text
# /etc/exports  (NFS)
/srv/data    192.168.1.0/24(rw,sync,no_subtree_check)
```

- NFS `exports`의 최대 함정은 **클라이언트와 괄호 사이 공백 금지**다(공백이 있으면 모든 호스트에 기본 옵션이 열린다).
- 주요 옵션은 `rw`/`ro`, `sync`/`async`, `root_squash`(기본·안전)/`no_root_squash`(위험)다.

| 파일 | 핵심 지시어 |
|------|-----------|
| smb.conf | `path`, `writable`, `valid users`, `guest ok` |
| exports | 경로 + `클라이언트(옵션)` (공백 금지!) |

> 🔍 **smb.conf 빈칸**: 공유 실제 경로는 `path`, 쓰기 허용은 `writable = yes`(또는 `read only = no`). 그룹 지정은 계정 앞에 `@`.

## sshd_config — 원격 접속 보안

- 설정 파일은 `/etc/ssh/sshd_config`.
- 보안 강화 지시어가 단답에 자주 나온다.

```text
# /etc/ssh/sshd_config
Port 22                          # 수신 포트
PermitRootLogin no               # root 직접 로그인 금지(권장)
PasswordAuthentication yes       # 암호 인증 허용
PubkeyAuthentication yes         # 공개키 인증
PermitEmptyPasswords no          # 빈 암호 금지
AllowUsers alice bob             # 허용 계정 화이트리스트
MaxAuthTries 3                   # 인증 시도 횟수 제한
```

| 지시어 | 보안 의미 |
|--------|----------|
| `PermitRootLogin` | **no**면 root 직접 로그인 차단 |
| `PasswordAuthentication` | no면 키 인증만 강제 |
| `PermitEmptyPasswords` | no여야 빈 암호 차단 |
| `Port` | 기본 22, 변경으로 스캔 회피 |
| `AllowUsers`/`DenyUsers` | 계정 단위 허용/거부 |

> ⚠️ **단골 함정**: `sshd_config`(서버, 데몬)와 `ssh_config`(클라이언트)는 다른 파일. root 로그인 차단은 서버 파일의 `PermitRootLogin no`. 수정 후 `systemctl restart sshd`로 적용.

## 한눈에 보는 설정 파일 지도

| 서비스 | 파일 | 시험 핵심 지시어 |
|--------|------|-----------------|
| Apache | /etc/httpd/conf/httpd.conf | DocumentRoot, Listen, DirectoryIndex |
| BIND | /etc/named.conf + zone | type master/slave, SOA Serial, A/MX/CNAME/PTR |
| DHCP | /etc/dhcp/dhcpd.conf | range, option routers, fixed-address |
| vsftpd | /etc/vsftpd/vsftpd.conf | anonymous_enable, write_enable, chroot_local_user |
| Samba | /etc/samba/smb.conf | path, writable, valid users |
| NFS | /etc/exports | 클라이언트(옵션) 공백 금지, root_squash |
| SSH | /etc/ssh/sshd_config | PermitRootLogin, PasswordAuthentication, Port |

## 서비스 기동·확인 — 설정 뒤엔 항상 적용

- 설정 파일을 고쳤으면 서비스를 재시작하고 상태를 확인하는 것까지가 한 세트다.
- 각 서비스의 데몬·포트·관리 명령을 정확히 알아야 한다.

| 서비스 | 데몬(유닛) | 포트 | 재시작 |
|--------|-----------|------|--------|
| Apache | `httpd` | 80/443 | `systemctl restart httpd` |
| BIND | `named` | 53 | `systemctl restart named` |
| DHCP | `dhcpd` | 67/68 | `systemctl restart dhcpd` |
| vsftpd | `vsftpd` | 21 | `systemctl restart vsftpd` |
| Samba | `smb`,`nmb` | 139/445,137/138 | `systemctl restart smb` |
| NFS | `nfs-server` | 2049(+111) | `exportfs -ra` |
| SSH | `sshd` | 22 | `systemctl restart sshd` |

```bash
systemctl enable --now httpd     # 부팅 시 자동 시작 + 즉시 기동
systemctl status named           # 상태·최근 로그 확인
systemctl is-enabled sshd        # 부팅 자동시작 여부
ss -tuln | grep ':53'            # 포트가 실제로 열렸는지 확인
```

> 💡 **enable vs start**: `start`는 지금만 기동, `enable`은 부팅 시 자동 시작. 둘 다는 `enable --now`. 설정만 고치고 재시작을 안 하면 변경이 반영되지 않는다 — 작업형의 흔한 감점.

> ⚠️ **NFS는 예외**: exports 수정은 서비스 재시작 없이 `exportfs -ra`(재내보내기)로 즉시 적용할 수 있다. nfs-server는 rpcbind(111)에 의존하므로 둘 다 살아 있어야 한다.

## 직접 쳐보기

- 설정 파일을 열어 지시어를 눈으로 확인하고, 문법 검사 도구로 검증하자.

```bash
# 각 설정 파일의 핵심 지시어 확인 (주석·빈줄 제외)
grep -v '^#' /etc/httpd/conf/httpd.conf | grep -E 'DocumentRoot|Listen'
grep -v '^#' /etc/ssh/sshd_config | grep -E 'PermitRootLogin|Port'

# 문법 검사 도구
testparm                       # smb.conf 검증
named-checkconf                # named.conf 검증
named-checkzone example.com /var/named/example.com.zone   # 존 검증
httpd -t                       # apache 설정 검증
sshd -t                        # sshd 설정 검증
```

지시어는 철자 하나까지 정확해야 점수가 된다. 설정 후 전용 도구로 검증하는 습관도 함께 익히자.

## 📖 용어

- **DocumentRoot** : Apache가 웹 문서를 찾는 최상위 디렉터리를 지정하는 지시어. 단답 최다 출제.
- **Listen** : Apache가 요청을 받을 포트를 지정하는 지시어. 옛 `Port` 지시어가 아니다.
- **AllowOverride** : 그 디렉터리에서 `.htaccess`로 덮어쓸 수 있는 범위. `None`이면 .htaccess가 무시된다.
- **SOA Serial** : 존 데이터의 판번호. 존을 고칠 때마다 올려야 보조(slave) 서버가 변경을 가져간다.
- **A 레코드 / PTR 레코드** : 이름을 IP로 바꾸는 정방향 레코드 / IP를 이름으로 바꾸는 역방향 레코드.
- **MX 레코드** : 그 도메인의 메일을 받을 서버와 우선순위를 지정하는 레코드. 숫자가 작을수록 우선이다.
- **CNAME** : 다른 이름을 가리키는 별칭 레코드.
- **range** : DHCP가 동적으로 나눠 줄 IP 주소 범위를 정하는 지시어.
- **fixed-address** : 특정 MAC(`hardware ethernet`)에 항상 같은 IP를 주기 위한 DHCP 지시어.
- **chroot_local_user** : vsftpd에서 사용자를 자기 홈 디렉터리에 가둬 상위로 못 나가게 하는 설정.
- **valid users** : Samba 공유에 접근할 수 있는 계정 목록. 앞에 `@`를 붙이면 그룹을 뜻한다.
- **root_squash** : NFS에서 클라이언트의 root를 익명 사용자로 강등하는 기본 보안 옵션.
- **PermitRootLogin** : SSH로 root가 직접 로그인할 수 있는지 정하는 지시어. 보안상 `no`가 권장된다.
- **sshd_config vs ssh_config** : SSH **서버**(데몬)의 설정 파일 / SSH **클라이언트**의 설정 파일. 이름이 비슷하니 구분해야 한다.

## 📝 연습 문제

**문제 1.** Apache `httpd.conf`에서 웹 문서의 최상위 디렉터리를 지정하는 지시어는?

A) ServerRoot
B) DocumentRoot
C) DirectoryIndex
D) RootDirectory

**정답: B**

해설: 웹 콘텐츠가 위치하는 최상위 경로는 `DocumentRoot`로 지정한다(예: `/var/www/html`). `ServerRoot`는 아파치 설정·로그의 기준 디렉터리이고, `DirectoryIndex`는 기본으로 보여 줄 문서 이름(index.html)이다. `RootDirectory`는 존재하지 않는 지시어다.

---

**문제 2.** BIND 존(zone) 파일을 수정한 뒤 보조(slave) 서버가 변경을 감지하도록 반드시 증가시켜야 하는 SOA 필드는?

A) Refresh
B) Retry
C) Serial
D) Expire

**정답: C**

해설: slave 서버는 master의 SOA `Serial` 값을 비교해 자신보다 크면 존 전송을 받는다. 따라서 존을 수정하면 Serial을 반드시 증가시켜야 한다. `Refresh`/`Retry`/`Expire`는 갱신 주기·재시도·만료 시간으로, 값을 올린다고 갱신을 유발하지 않는다.

---

**문제 3.** 도메인 이름을 IPv4 주소로 매핑하는 DNS 리소스 레코드는?

A) PTR
B) CNAME
C) MX
D) A

**정답: D**

해설: 이름→IPv4 매핑은 `A`(Address) 레코드다. `PTR`은 IP→이름(역방향), `CNAME`은 별칭(정규 이름), `MX`는 메일 서버 지정(우선순위 포함)이다. IPv6 매핑은 `AAAA` 레코드를 쓴다.

---

**문제 4.** `dhcpd.conf`에서 클라이언트에게 동적으로 할당할 IP 주소 범위를 지정하는 지시어는?

A) range
B) fixed-address
C) option routers
D) subnet-mask

**정답: A**

해설: 동적 할당 범위는 subnet 블록 안의 `range 시작IP 끝IP`로 지정한다. `fixed-address`는 특정 MAC에 고정 IP를 줄 때(host 블록), `option routers`는 게이트웨이, `subnet-mask`는 넷마스크 옵션이다.

---

**문제 5.** vsftpd에서 로그인한 사용자가 자신의 홈 디렉터리 상위로 이동하지 못하도록 가두는 지시어는?

A) local_enable=YES
B) chroot_local_user=YES
C) write_enable=YES
D) anonymous_enable=NO

**정답: B**

해설: `chroot_local_user=YES`는 로컬 사용자를 자신의 홈에 chroot로 격리해 상위 디렉터리 접근을 차단한다. `local_enable`은 로컬 계정 로그인 허용, `write_enable`은 업로드 허용, `anonymous_enable`은 익명 접속 여부로 격리와 무관하다.

---

**문제 6.** SSH 서버에서 root 계정의 직접 원격 로그인을 차단하려면 `sshd_config`에 설정할 항목은?

A) PermitRootLogin yes
B) PermitRootLogin no
C) PasswordAuthentication no
D) AllowUsers root

**정답: B**

해설: `PermitRootLogin no`로 설정하면 root의 직접 SSH 로그인이 차단된다(일반 계정 로그인 후 su/sudo 사용 권장). `yes`는 허용이고, `PasswordAuthentication no`는 암호 인증 자체를 끄는 것(키 인증만), `AllowUsers root`는 오히려 root를 허용 목록에 넣는다.

---

**문제 7.** NFS `/etc/exports`에서 `root_squash` 옵션의 의미로 옳은 것은?

A) 클라이언트 root를 서버에서 익명(nobody) 권한으로 강등한다
B) 클라이언트 root에게 서버 root 권한을 그대로 부여한다
C) 모든 사용자를 root로 승격한다
D) 쓰기를 금지한다

**정답: A**

해설: `root_squash`(기본값)는 클라이언트의 root 요청을 서버에서 익명 사용자(nobody)로 매핑해 보안을 지킨다. 반대로 `no_root_squash`는 클라이언트 root에 서버 root 권한을 주어 위험하다. 쓰기 금지는 `ro` 옵션이다.

---
