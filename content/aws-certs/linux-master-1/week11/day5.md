# Day 5 - Week 11 종합 복습: 공유, 방화벽, 보안의 큰 그림

이번 주는 시스템을 **외부와 연결하고(공유), 외부로부터 지키는(보안)** 두 축을 다뤘다. Samba와 NFS로 파일을 나누는 법을 배우고, iptables와 firewalld로 트래픽을 통제하는 법을 익혔으며, TCP Wrapper·SELinux·로그로 보안을 겹겹이 쌓는 법을 보았다. 네트워크 서비스는 "열어야 쓸모가 있지만, 열린 만큼 위험하다"는 긴장 위에 서 있다. 오늘은 4일간의 내용을 하나의 흐름으로 엮어 복습하고, 자주 헷갈리는 함정을 다시 짚은 뒤 종합 문제로 마무리한다.

## Day 1 복습: Samba — 윈도와의 다리

Samba는 윈도의 **SMB/CIFS** 프로토콜을 리눅스에서 구현해 이종 OS 간 파일·프린터 공유를 가능하게 한다. 두 데몬이 핵심이다.

| 데몬 | 역할 | 포트 |
|------|------|------|
| `smbd` | 파일 공유·인증 | TCP 139, 445 |
| `nmbd` | NetBIOS 이름 해석·브라우징 | UDP 137, 138 |

설정은 `/etc/samba/smb.conf`의 섹션 구조로 한다. `[global]`(전역), `[homes]`(홈 자동 공유), `[printers]`(프린터 자동 공유)가 특수 섹션이고, 나머지 섹션 이름이 곧 공유 이름이 된다. 공유 지시어로 `path`, `writable`(=`read only no`), `valid users`(그룹은 `@`), `guest ok`을 기억하자. Samba 계정은 리눅스 계정과 **별개**로 `smbpasswd -a`로 만들며, 그 전에 리눅스 시스템 계정이 먼저 있어야 한다. 검증은 `testparm`, 접속 테스트는 `smbclient -L`이다.

> 💡 **한 줄 요약**: Samba는 **이중 권한 관문** — smb.conf의 Samba 권한과 리눅스 파일시스템 권한을 둘 다 통과해야 접근된다.

## Day 2 복습: NFS — 유닉스 표준 공유

NFS는 **RPC 기반**이라 포트 매퍼 **`rpcbind`(포트 111)**가 반드시 살아 있어야 한다. 서버 설정은 `/etc/exports` 하나로, "디렉터리 클라이언트(옵션)" 형식이다.

```
/srv/share    192.168.1.0/24(rw,sync,no_subtree_check)
```

여기서 **클라이언트와 괄호 사이 공백 금지**가 최대 함정이다(공백이 있으면 `*`에 그 옵션이 열림). 주요 옵션은 `ro`/`rw`, `sync`/`async`, `root_squash`(기본·보안)/`no_root_squash`(위험)다. 수정 후 적용은 `exportfs -ra`, 클라이언트는 `showmount -e`로 확인하고 `mount -t nfs 서버:경로 마운트점`으로 붙인다.

| 구분 | NFS | Samba |
|------|-----|-------|
| 대상 | 리눅스/유닉스 | 윈도 혼합 |
| 설정 파일 | /etc/exports | smb.conf |
| 의존 | rpcbind(111) | smbd/nmbd |
| 마운트 타입 | nfs | cifs |
| 인증 | IP·UID 기반 | 계정/암호 기반 |

> 💡 **선택 한 줄**: 전부 리눅스면 **NFS**, 윈도가 섞이면 **Samba**.

## Day 3 복습: 방화벽 — iptables와 firewalld

iptables는 커널 **netfilter**를 제어하며 **테이블→체인→규칙** 구조다. filter 테이블의 세 체인은 방향으로 외운다 — **INPUT(들어옴)·OUTPUT(나감)·FORWARD(통과)**. 규칙은 위에서 아래로 순서대로 매칭되고, 안 걸리면 기본 정책(`-P`)이 적용된다.

| 옵션 | 의미 | / | 타깃 | 의미 |
|------|------|---|------|------|
| `-A` | 끝에 추가 | | `ACCEPT` | 허용 |
| `-I` | 앞에 삽입 | | `DROP` | 응답 없이 버림 |
| `-D` | 삭제 | | `REJECT` | 거부 응답 |
| `-P` | 정책 | | `LOG` | 로그 후 통과 |
| `-j` | 타깃 지정 | | | |

firewalld는 **zone**(drop/block/public/home/trusted)으로 신뢰 수준을 묶어 `firewall-cmd`로 관리한다. 최대 함정은 **런타임 vs `--permanent`** — permanent로 바꾸면 `--reload` 해야 지금 적용된다.

> ⚠️ **공통 함정**: iptables 규칙은 메모리에만 있으니 `service iptables save`로 저장해야 재부팅 후 유지된다. 또 원격에서 `-P INPUT DROP` 전에 SSH 허용 규칙을 먼저 넣지 않으면 자기 자신이 끊긴다.

## Day 4 복습: 접근 제어와 로그

**TCP Wrapper**: `hosts.allow`(우선) → `hosts.deny` → 기본 허용 순서. `서비스 : 호스트` 문법, `ALL`/`LOCAL`/`EXCEPT` 키워드.

**SELinux**: DAC 위의 MAC. 세 모드 **enforcing/permissive/disabled**(`getenforce`/`setenforce`, 단 setenforce로 disabled 불가, 영구는 `/etc/selinux/config`). 컨텍스트 `user:role:type:level`(type이 핵심), `ls -Z`/`chcon`/`restorecon`.

**로그**: `/var/log`의 주요 파일(messages, secure, maillog, cron). 바이너리 wtmp/btmp/lastlog는 `last`/`lastb`/`lastlog` 전용 명령. `rsyslog.conf`는 `facility.priority` 짝(지정 수준 **이상** 기록, `.none` 제외, `=`정확히). `logrotate`는 `rotate N`·`compress`·`daily/weekly`로 로그를 순환·보존.

> 💡 **보안 디버깅 신호**: "권한은 맞는데 접근이 안 된다" → SELinux 컨텍스트 의심. `setenforce 0`으로 사라지면 SELinux 문제(운영에선 끄지 말고 컨텍스트 수정).

## 자주 헷갈리는 핵심 비교 한눈에

| 헷갈림 | 정답 |
|--------|------|
| smbd vs nmbd | smbd=공유·인증(139/445), nmbd=이름해석(137/138) |
| Samba 마운트 vs NFS 마운트 | cifs vs nfs |
| exports 공백 | 클라이언트(옵션) 사이 공백 금지 |
| root_squash vs no_root_squash | 기본=root_squash(root 강등, 안전) |
| iptables -A vs -I | -A 끝에 추가, -I 앞에 삽입 |
| DROP vs REJECT | DROP 무응답, REJECT 거부응답 |
| firewalld 적용 | runtime(임시) vs --permanent(+reload) |
| hosts.allow vs deny | allow 우선, 둘 다 없으면 허용 |
| setenforce 범위 | enforcing↔permissive만, disabled 불가 |
| wtmp/btmp 조회 | last / lastb (바이너리, cat 불가) |

## 마무리

Week 11은 "연결과 방어"의 한 주였다. 공유(Samba/NFS)로 시스템을 외부에 열고, 방화벽(iptables/firewalld)으로 트래픽을 가르고, 접근 제어(TCP Wrapper/SELinux)와 로그로 안쪽을 지키는 다층 방어를 배웠다. 시험에서는 설정 파일의 정확한 지시어(`smb.conf`의 공유 옵션, `exports`의 공백 함정, `rsyslog.conf`의 facility.priority), 명령의 정확한 옵션(`smbpasswd -a`, `exportfs -ra`, `iptables -A/-I/-P/-j`, `firewall-cmd --permanent --reload`, `setenforce`), 그리고 핵심 포트(smbd 139/445, nmbd 137/138, rpcbind 111)를 묻는다. 아래 종합 문제로 한 주를 정리하자.

## 📝 연습 문제

**문제 1.** Samba에서 NetBIOS 이름 해석과 네트워크 브라우징을 담당하는 데몬과 그 포트로 옳은 것은?

A) smbd, TCP 445
B) nmbd, UDP 137/138
C) rpcbind, TCP 111
D) smbd, UDP 137/138

**정답: B**

해설: `nmbd`가 NetBIOS 이름 해석과 브라우징을 담당하며 UDP 137/138을 쓴다. `smbd`는 파일 공유·인증으로 TCP 139/445를 사용한다. `rpcbind`는 NFS용 포트 매퍼다.

---

**문제 2.** 다음 `/etc/exports` 항목 중 의도와 달리 모든 호스트에 rw 권한이 열리는 잘못된 설정은?

A) /data 192.168.1.0/24(rw,sync)
B) /data 192.168.1.10(rw)
C) /data 192.168.1.10 (rw)
D) /data *(ro)

**정답: C**

해설: 클라이언트와 괄호 사이에 공백이 있으면 NFS는 "192.168.1.10에 기본 권한"과 "모든 호스트(*)에 rw"의 두 항목으로 해석한다. 따라서 C는 전체에 쓰기가 열리는 위험한 설정이다. 나머지는 공백 없이 올바르게 작성됐다.

---

**문제 3.** 외부에서 들어오는 80번 포트(HTTP) TCP 접속을 허용하는 iptables 명령으로 옳은 것은?

A) iptables -A OUTPUT -p tcp --sport 80 -j ACCEPT
B) iptables -A INPUT -p tcp --dport 80 -j ACCEPT
C) iptables -P INPUT -p udp --dport 80 -j DROP
D) iptables -A FORWARD -p tcp --dport 80 -j REJECT

**정답: B**

해설: 들어오는 접속이므로 `INPUT` 체인, TCP, 목적지 포트 `--dport 80`, 동작 `-j ACCEPT`다. A는 OUTPUT/sport로 방향이 틀리고, C는 정책(-P)에 포트 조건을 잘못 결합했으며 udp/DROP이고, D는 FORWARD 거부다.

---

**문제 4.** firewalld에서 http 서비스를 재부팅 후에도 유지되게 허용한 뒤 즉시 적용하려면?

A) firewall-cmd --add-service=http 만 실행
B) firewall-cmd --add-service=http --permanent 만 실행
C) firewall-cmd --add-service=http --permanent 후 firewall-cmd --reload
D) firewall-cmd --remove-service=http --reload

**정답: C**

해설: `--permanent`는 영구 저장하지만 즉시 적용되지 않으므로 `--reload`로 다시 읽어야 현재 세션에도 반영된다. A는 재부팅 시 사라지고, B는 지금 적용되지 않으며, D는 서비스를 제거하는 명령이다.

---

**문제 5.** TCP Wrapper에서 hosts.allow와 hosts.deny 양쪽에 모두 해당하지 않는 호스트의 처리 결과는?

A) 거부된다
B) 허용된다
C) 오류가 발생한다
D) hosts.deny가 우선해 거부된다

**정답: B**

해설: TCP Wrapper는 allow를 먼저 검사해 일치하면 허용하고, 없으면 deny를 검사해 일치하면 거부한다. 양쪽 모두에 해당하지 않으면 **기본적으로 허용**된다. 따라서 명시적으로 막으려면 deny에 규칙을 넣어야 한다.

---

**문제 6.** SELinux를 영구적으로 disabled로 변경하는 올바른 방법은?

A) setenforce 0 실행
B) getenforce disabled 실행
C) /etc/selinux/config에서 SELINUX=disabled로 수정 후 재부팅
D) setsebool disabled on 실행

**정답: C**

해설: `setenforce`는 enforcing↔permissive만 일시 전환할 뿐 disabled로 갈 수 없다. 영구 변경(disabled 포함)은 `/etc/selinux/config`의 `SELINUX=` 값을 수정하고 재부팅해야 한다. `getenforce`는 조회, `setsebool`은 불리언 변경용이다.

---

**문제 7.** rsyslog.conf의 `authpriv.* /var/log/secure` 설정에 대한 설명으로 옳은 것은?

A) authpriv facility의 모든 priority 메시지를 /var/log/secure에 기록한다
B) 모든 facility의 authpriv 메시지를 기록한다
C) authpriv를 로그에서 제외한다
D) error 수준 이상만 기록한다

**정답: A**

해설: `authpriv.*`에서 `*`는 모든 priority를 의미하므로, authpriv(보안 인증) facility의 모든 수준 메시지를 `/var/log/secure`에 기록한다. 제외는 `.none`, 정확한 수준만은 `.=수준`, 특정 수준 이상은 `.수준`으로 지정한다.

---

**문제 8.** 리눅스 클라이언트에서 NFS 공유와 Samba 공유를 마운트할 때 각각 사용하는 파일시스템 타입을 옳게 짝지은 것은?

A) NFS: cifs, Samba: nfs
B) NFS: nfs, Samba: cifs
C) NFS: smbfs, Samba: nfs
D) NFS: ext4, Samba: cifs

**정답: B**

해설: NFS 공유는 `mount -t nfs`, 윈도/Samba 공유는 `mount -t cifs`(과거 smbfs)로 마운트한다. `ext4`는 로컬 디스크 파일시스템으로 네트워크 공유에는 쓰지 않는다.

---

**문제 9.** iptables에서 이미 "모두 DROP"하는 규칙이 체인 위쪽에 있을 때, 특정 포트 허용을 효과적으로 추가하려면 사용해야 하는 옵션은?

A) -A (Append)로 끝에 추가
B) -I (Insert)로 DROP 규칙보다 앞에 삽입
C) -D (Delete)로 삭제
D) -P (Policy)로 정책 변경

**정답: B**

해설: iptables는 위→아래로 순서대로 매칭하므로, "모두 DROP" 규칙이 위에 있으면 그 뒤(-A)에 ACCEPT를 추가해도 이미 DROP에 걸려 도달하지 못한다. `-I`로 DROP보다 앞에 ACCEPT를 삽입해야 효과가 있다.

---

**문제 10.** 로그인 실패 기록을 조회하는 명령과 그 대상 파일을 옳게 짝지은 것은?

A) last — /var/log/btmp
B) lastb — /var/log/btmp
C) lastlog — /var/log/wtmp
D) lastb — /var/log/wtmp

**정답: B**

해설: 로그인 실패 기록은 바이너리 파일 `/var/log/btmp`에 저장되며 `lastb`로 조회한다. `last`는 성공 로그인 기록인 `wtmp`를, `lastlog`는 사용자별 마지막 로그인(`/var/log/lastlog`)을 조회한다.

---

**문제 11.** NFS가 동작하지 않을 때 가장 먼저 확인해야 할 서비스와 포트는?

A) smbd, 445
B) rpcbind, 111
C) named, 53
D) httpd, 80

**정답: B**

해설: NFS는 RPC 기반이므로 포트 매퍼 `rpcbind`(포트 111)가 살아 있어야 한다. rpcbind가 죽었거나 방화벽에서 111이 막히면 NFS 마운트가 실패한다. `smbd`는 Samba, `named`는 DNS, `httpd`는 웹 서버용이다.

---

**문제 12.** logrotate 설정 `weekly` + `rotate 4` + `compress`의 동작으로 옳은 것은?

A) 매일 순환하며 4개를 압축 없이 보관한다
B) 매주 순환하며 최근 4개(약 4주치)를 압축해 보관하고 초과분은 삭제한다
C) 4MB를 넘으면 순환한다
D) 4주마다 한 번 순환한다

**정답: B**

해설: `weekly`는 매주 순환, `rotate 4`는 최근 4개를 보관(초과 시 가장 오래된 것 삭제), `compress`는 순환된 로그를 gzip 압축한다. 따라서 약 4주치 로그가 압축되어 보관된다. 크기 기준 순환은 `size` 지시어다.

---
