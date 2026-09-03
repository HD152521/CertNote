# Day 5 - Week 10 종합 복습: 인터넷 서비스 한 장

## 📌 핵심 정리

- **보내기 SMTP(25) · 받기 POP3(110)/IMAP(143)**. **서버 간 전달도 SMTP**.
- **POP3는 내려받아 지우고, IMAP은 서버에 남긴다.**
- DNS 레코드 — **A(IPv4) · AAAA(IPv6) · MX(메일) · CNAME(별칭) · NS · PTR(역방향)**.
- **TELNET·SSH는 원격 접속**, **FTP·NFS·삼바는 파일 공유**다. 섞어 놓고 고르게 한다.
- **NFS는 유닉스끼리(RPC), 삼바는 윈도와(SMB·CIFS·NetBIOS)**.

## 서비스 한 장

```text
   웹      HTTP 80 · HTTPS 443       서버 Apache · Nginx
                                     브라우저 Firefox · Chrome · Lynx(텍스트)

   메일    SMTP 25   보내기 + 서버 간 전달
           POP3 110  내려받기 (서버에서 삭제)
           IMAP 143  서버에 두고 보기 (여러 기기)
           구성  MUA(사용자) → MTA(전송) → MDA(배달)
                 MTA 예: Sendmail · Postfix
           MIME  한글·첨부파일을 담는 규격

   DNS     53   이름 ↔ IP
           계층  루트(.) → TLD(com·kr) → 2차 → 호스트
           레코드 A(IPv4) AAAA(IPv6) MX(메일) CNAME(별칭) NS PTR(역방향) SOA
           서버  BIND(named)   조회 nslookup · dig · host
           파일  resolv.conf(물어볼 곳) · hosts(답)

   원격    TELNET 23  평문 — 위험
           SSH    22  암호화 · 공개키 · 터널링 (OpenSSH)

   전송    FTP    21 제어 / 20 데이터   능동 vs 수동
                  익명 계정 anonymous · bin/ascii 모드
           scp · sftp   SSH 기반        rsync 바뀐 부분만

   공유    NFS    유닉스끼리 · RPC · /etc/exports
           Samba  윈도와 · SMB/CIFS/NetBIOS · smb.conf · smbd/nmbd

   기타    DHCP IP 자동할당 · NTP 시간 · SNMP 관리 · LDAP 계정
   옛것    Gopher(메뉴 검색) · Usenet(뉴스그룹, NNTP) · Archie(FTP 검색) · IRC(채팅)
```

## 성격으로 묶기

| 묶음 | 서비스 |
|------|-------|
| **파일 공유·전송** | FTP · **NFS · Samba** · SCP · SFTP · rsync |
| **원격 접속** | **TELNET · SSH** · rlogin |
| **정보 검색** | **WWW · Gopher** · Archie · WAIS |
| **메시지·게시판** | 메일 · **Usenet** · IRC |
| **이름·주소** | **DNS** · DHCP |

> **섞어 놓고 "성격이 다른 것"** 을 고르게 하는 문제가 이 주차의 주요 형태다. 위 표를 통째로 익힌다.

## 포트 번호 총정리

| 포트 | 서비스 |
|-----|-------|
| **20 / 21** | FTP 데이터 / **제어** |
| **22** | SSH |
| **23** | TELNET |
| **25** | SMTP |
| **53** | DNS |
| **80** | HTTP |
| **110** | POP3 |
| **143** | IMAP |
| **443** | HTTPS |
| 123 | NTP |
| 161 | SNMP |
| 631 | CUPS |

## 헷갈리는 짝 대조

| 구분 | A | B | 가르는 기준 |
|------|---|---|-----------|
| SMTP vs POP3 | **보내기** | 받기 | 방향 |
| POP3 vs IMAP | **내려받고 삭제** | **서버에 유지** | 여러 기기 동기화 |
| MUA vs MTA | 사용자 프로그램 | **서버 간 전송** | 가운데 글자 |
| A vs MX | IPv4 주소 | **메일 서버** | 무엇을 가리키나 |
| A vs AAAA | **IPv4** | IPv6 | 주소 길이 |
| 정방향 vs 역방향 | 이름 → IP (A) | IP → 이름 (**PTR**) | 방향 |
| TELNET vs SSH | **평문** | 암호화 | 보안 |
| TELNET vs FTP | **원격 접속** | **파일 전송** | 목적 |
| FTP 20 vs 21 | 데이터 | **제어** | 무엇이 흐르나 |
| 능동 vs 수동 | 서버가 연결 | **클라이언트가 연결** | 방화벽 통과 |
| sftp vs FTPS | **SSH 기반** | FTP + SSL | 기반 프로토콜 |
| NFS vs Samba | **유닉스끼리, RPC** | **윈도와, SMB** | 상대 운영체제 |
| DNS vs DHCP | **이름 변환** | **IP 자동 할당** | 하는 일 |
| `hosts` vs `resolv.conf` | 답을 적음 | **물어볼 서버** | 역할 |

## 자주 틀리는 지점

1. **서버끼리는 POP3로 주고받는다** → **SMTP**다. POP3는 사용자가 받아 올 때만 쓴다.
2. **IMAP이 메일을 내려받고 지운다** → 그건 **POP3**다. IMAP은 서버에 남긴다.
3. **MX가 메일 주소를 담는다** → 주소가 아니라 **메일 서버**를 가리킨다.
4. **AAAA가 IPv4** → **IPv6**다. A가 IPv4.
5. **FTP가 포트 하나만 쓴다** → **21(제어)과 20(데이터) 두 개**다.
6. **TELNET으로 파일을 전송한다** → 못 한다. **원격 접속 전용**이다.
7. **삼바 구성 요소에 RPC가 포함** → **RPC는 NFS 쪽**이다.
8. **NFS로 윈도와 공유** → 윈도와는 **삼바**다.
9. **sftp와 FTPS가 같다** → **sftp는 SSH, FTPS는 FTP+SSL** 로 기반이 다르다.
10. **Gopher가 채팅 서비스** → **메뉴 방식 정보 검색**이다. 채팅은 IRC.

## 시험에 그대로 나오는 값

| 값 | 무엇 |
|-----|------|
| **25 / 110 / 143** | SMTP / POP3 / IMAP |
| **20, 21** | FTP 데이터, 제어 |
| **anonymous** | 익명 FTP 계정 이름 |
| **`/etc/exports`** | NFS 공유 설정 파일 |
| **`/etc/samba/smb.conf`** | 삼바 설정 파일 |
| **`smbd` / `nmbd`** | 삼바의 두 데몬 |
| **NNTP** | Usenet 뉴스그룹 프로토콜 |

> 다음 주가 마지막이다. 응용 분야(클라우드·빅데이터·임베디드)와 전체 마무리를 다룬다.

## 📖 용어

- **SMTP / POP3 / IMAP** : 메일을 보내는 / 내려받는 / 서버에 두고 보는 프로토콜.
- **MX 레코드** : 도메인의 메일을 받을 서버를 지정하는 DNS 레코드.
- **SSH** : 통신을 암호화하는 원격 접속 프로토콜.
- **FTP 능동/수동 모드** : 데이터 연결을 서버가 여는 방식 / 클라이언트가 여는 방식.
- **NFS** : 유닉스·리눅스 사이의 파일 공유 시스템.
- **삼바** : SMB/CIFS로 윈도와 파일을 공유하는 소프트웨어.

## 📝 연습 문제

**문제 1.** 다음 중 메일을 서버에서 내려받은 뒤 서버의 원본은 삭제하는 것을 기본 동작으로 하는 프로토콜로 알맞은 것은?

A) POP3  
B) IMAP  
C) SMTP  
D) NNTP  

**정답: A**  
해설: POP3는 메일을 사용자의 컴퓨터로 내려받고 서버에서는 지우는 것이 기본 동작이라 여러 기기에서 같은 메일함을 보기 어렵습니다. IMAP은 서버에 메일을 남겨 두어 여러 기기에서 동일한 상태를 유지할 수 있습니다.

---

**문제 2.** 다음 중 나머지 셋과 성격이 다른 서비스로 알맞은 것은?

A) FTP  
B) NFS  
C) TELNET  
D) Samba  

**정답: C**  
해설: FTP, NFS, 삼바는 모두 파일을 전송하거나 공유하는 서비스입니다. 반면 TELNET은 원격 시스템에 접속해 명령을 실행하는 원격 접속 서비스이므로 파일 공유와는 성격이 다릅니다.

---

**문제 3.** 다음 중 NFS 서버에서 공유할 디렉터리를 지정하는 설정 파일로 알맞은 것은?

A) /etc/samba/smb.conf  
B) /etc/exports  
C) /etc/resolv.conf  
D) /etc/hosts  

**정답: B**  
해설: NFS 서버는 `/etc/exports`에 내보낼 디렉터리와 접근을 허용할 대상을 지정합니다. `/etc/samba/smb.conf`는 삼바의 설정 파일이고 `/etc/resolv.conf`는 DNS 서버 주소를, `/etc/hosts`는 이름과 IP의 대응을 담습니다.

---

**문제 4.** 다음 중 도메인 이름에 대한 별칭을 지정할 때 사용하는 DNS 레코드로 알맞은 것은?

A) A  
B) MX  
C) PTR  
D) CNAME  

**정답: D**  
해설: CNAME은 Canonical Name의 줄임말로 어떤 이름을 다른 이름의 별칭으로 연결할 때 사용합니다. A는 IPv4 주소, MX는 메일 서버, PTR은 IP에서 이름을 찾는 역방향 조회에 사용합니다.

---

**문제 5.** 다음 중 FTP에서 이미지나 압축 파일을 손상 없이 전송하기 위해 지정해야 하는 모드로 알맞은 것은?

A) ascii  
B) bin  
C) passive  
D) active  

**정답: B**  
해설: `bin`은 바이너리 모드로 파일을 있는 그대로 전송합니다. `ascii` 모드는 텍스트용이라 줄바꿈 문자를 변환하므로 이미지나 압축 파일에 사용하면 내용이 깨집니다. 능동과 수동은 데이터 연결을 누가 여는지에 대한 구분입니다.

---

**문제 6.** 다음 중 리눅스에서 널리 사용되는 DNS 서버 소프트웨어로 알맞은 것은?

A) Postfix  
B) Samba  
C) BIND  
D) Apache  

**정답: C**  
해설: BIND는 Berkeley Internet Name Domain의 줄임말로 가장 널리 쓰이는 DNS 서버 소프트웨어이며 데몬 이름은 `named`입니다. Postfix는 메일 전송 서버, 삼바는 파일 공유, Apache는 웹 서버입니다.
