# Day 1 - 메일 서비스: MTA·MDA·MUA와 SMTP·POP3·IMAP의 삼각 구도

## 📌 핵심 정리

- 메일 시스템은 **"보내기는 SMTP, 가져오기는 POP3/IMAP"라는 비대칭 구조**다. 이 비대칭만 그리면 포트도 설정 파일도 자리를 잡는다.
- 역할 분담: **MUA(사용자 클라이언트) → MTA(서버 간 전송) → MDA(사서함 최종 배달)**.
- 포트 즉답: **SMTP 25 · POP3 110 · IMAP 143**, 암호화는 **SMTPS 465 · 제출 587 · IMAPS 993 · POP3S 995**.
- **POP3는 내려받고 서버에서 삭제**(단일 기기), **IMAP은 서버에 보관·동기화**(여러 기기). "여러 기기 = IMAP".
- MTA는 **Sendmail(레거시, `/etc/mail/sendmail.cf`)**과 **Postfix(모듈형·보안, `/etc/postfix/main.cf`)**. `mynetworks`를 넓게 열면 **오픈 릴레이**가 된다.

## 메일 시스템의 3대 구성요소 — MTA·MDA·MUA

- 메일은 사람이 직접 주고받는 게 아니라 **역할이 분리된 세 프로그램의 릴레이**로 전달된다.

| 구성요소 | 풀네임 | 역할 | 대표 프로그램 |
|----------|--------|------|---------------|
| MUA | Mail User Agent | 사용자가 메일을 작성·읽는 클라이언트 | Outlook, Thunderbird, mutt, mail |
| MTA | Mail Transfer Agent | 메일을 서버 간 전송(라우팅)하는 핵심 엔진 | Sendmail, Postfix, Exim |
| MDA | Mail Delivery Agent | MTA가 받은 메일을 사용자 사서함에 최종 배달 | Procmail, Dovecot의 LDA, mail.local |

- 흐름을 한 줄로 그리면 이렇다.

```text
[발신자 MUA] --SMTP--> [발신 MTA] --SMTP--> [수신 MTA] --MDA--> [사서함]
                                                              ↑
                          [수신자 MUA] <--POP3/IMAP-- [사서함]
```

> 💡 **개념**: MTA는 "우체국 간 트럭 운송", MDA는 "집배원이 우편함에 넣는 일", MUA는 "사람이 편지를 쓰고 읽는 일"이다. MTA끼리는 SMTP로 대화하고, MDA가 사서함에 넣은 뒤, MUA는 POP3/IMAP으로 그 사서함을 들여다본다. 이 분업이 메일 구조의 뼈대다.

> 🔍 **핵심 구분**: MTA와 MDA를 헷갈리지 마라. MTA는 **서버에서 서버로** 메일을 옮기는 전송 단계이고, MDA는 그 메일을 **로컬 사용자 사서함에 떨어뜨리는** 최종 배달 단계다. SMTP는 MTA의 언어, POP3/IMAP은 사서함을 읽는 MUA의 언어다.

## 메일 프로토콜과 포트 — 발송과 수신의 비대칭

- 실기에서 가장 자주 나오는 부분이다. **포트 번호는 통째로 암기**해야 한다.

| 프로토콜 | 방향 | 평문 포트 | 암호화(SSL/TLS) 포트 |
|----------|------|-----------|----------------------|
| SMTP | 발송 (MUA→MTA, MTA→MTA) | 25 | 465(SMTPS), 587(STARTTLS 제출) |
| POP3 | 수신 (서버→MUA, 다운로드) | 110 | 995(POP3S) |
| IMAP | 수신 (서버→MUA, 서버 보관) | 143 | 993(IMAPS) |

기억 고정 포인트:

- **발송 = SMTP = 25**, 보안 발송 = 465 / 587
- **POP3 = 110 → 995**, **IMAP = 143 → 993** (둘 다 끝자리 패턴으로 외우면 안전)
- 25는 MTA 간 릴레이 표준, 587은 사용자가 메일을 "제출(submission)"하는 인증 포트

> ⚠️ **함정**: 465와 587을 헷갈리는 문제가 단골이다. 465는 처음부터 SSL로 감싸는 SMTPS, 587은 평문으로 시작해 STARTTLS로 암호화하는 메일 제출(submission) 포트다. 또 "수신 = 110/143, 발송 = 25"라는 방향을 뒤집은 보기에 주의하라. POP3에 25를 붙이는 함정이 자주 나온다.

> 🔍 **핵심 구분**: POP3 vs IMAP — POP3는 메일을 클라이언트로 **다운로드하고 서버에서 삭제**(기본)하므로 한 기기에서만 쓸 때 적합하다. IMAP은 메일을 **서버에 그대로 두고 동기화**하므로 여러 기기에서 같은 사서함을 보는 데 적합하다. "여러 기기 동기화 = IMAP"이 정답 신호다.

### 직접 쳐보기 — 포트와 서비스 확인

```bash
# 메일 관련 포트가 LISTEN 중인지 확인
ss -tlnp | grep -E ':(25|110|143|465|587|993|995)'

# /etc/services에서 표준 포트 정의 확인
grep -E '^(smtp|pop3|imap|submission|imaps|pop3s)\b' /etc/services

# 로컬 메일 전송 테스트 (telnet으로 SMTP 대화)
telnet localhost 25
# 응답: 220 mail.example.com ESMTP Postfix
```

> 📚 **유래/사례**: SMTP가 25번 포트인 이유는 1982년 RFC 821 시절 지정된 역사적 번호다. 이후 ISP들이 스팸 차단을 위해 25번 외부 발신을 막으면서, 인증된 사용자 메일 제출용으로 587(RFC 4409)이 분리되었다. 그래서 오늘날 "메일은 보내지는데 받기만 된다"는 장애의 상당수가 25번 차단이 원인이다.

## Sendmail vs Postfix — 두 MTA의 대결

- 리눅스의 대표 MTA는 전통의 **Sendmail**과 현대의 **Postfix**다.
- 시험은 **둘의 차이와 설정 파일 위치**를 묻는다.

| 항목 | Sendmail | Postfix |
|------|----------|---------|
| 출시 | 1983년, 가장 오래된 MTA | 1998년, 보안·단순성 목표로 개발 |
| 구조 | 단일 거대 프로세스 | 여러 작은 프로세스로 분리(모듈형) |
| 설정 파일 | `/etc/mail/sendmail.cf` (m4로 생성) | `/etc/postfix/main.cf` (직관적) |
| 설정 난이도 | 매우 복잡(.mc → .cf 컴파일) | 상대적으로 쉬움(key=value) |
| 보안 | 권한 분리 약함(역사적 취약점 다수) | 권한 분리로 보안 강함 |
| 현재 위상 | 레거시 | 사실상 표준, RHEL 기본 |

> 💡 **개념**: Postfix가 Sendmail을 대체한 이유는 "하나의 거대 프로세스"가 보안의 약점이었기 때문이다. Postfix는 수신·큐·배달을 각각 다른 권한의 작은 프로세스로 쪼개, 한 부분이 뚫려도 전체로 번지지 않게 설계했다. "보안·모듈형 = Postfix"가 핵심이다.

### Postfix main.cf 주요 지시어

```bash
# /etc/postfix/main.cf — 핵심 설정 항목
myhostname = mail.example.com      # 이 서버의 호스트명
mydomain = example.com             # 도메인명
myorigin = $mydomain               # 발신 메일의 도메인(보내는 주소 보정)
inet_interfaces = all              # 수신 대기 인터페이스(all=모든 NIC)
mydestination = $myhostname, localhost, $mydomain   # 로컬 배달로 처리할 도메인
mynetworks = 127.0.0.0/8, 192.168.0.0/24            # 릴레이 허용 신뢰 네트워크
relayhost = [smtp.isp.com]:587     # 외부 발신을 거치는 중계 서버
home_mailbox = Maildir/            # 사서함 형식(Maildir/ vs mbox)
```

- 설정을 바꾼 뒤에는 **반드시 다시 읽혀야** 한다.

```bash
postconf -n                # 기본값과 다른 설정만 출력(점검용)
postfix check              # 설정 문법 검사
systemctl reload postfix   # 무중단 설정 재적용
newaliases                 # /etc/aliases 변경 후 DB 재생성
```

> ⚠️ **함정**: `inet_interfaces`를 `localhost`로 두면 외부에서 메일을 못 받는다. 또 `mynetworks` 범위를 너무 넓게(예: 0.0.0.0/0) 열면 누구나 이 서버로 메일을 중계하는 **오픈 릴레이**가 되어 스팸 발송지로 악용된다. "받기 안 됨 = inet_interfaces, 오픈 릴레이 위험 = mynetworks"를 연결하라.

> 🔍 **핵심 구분**: 사서함 저장 방식 mbox vs Maildir — mbox는 한 파일에 모든 메일을 이어 붙여 잠금 충돌이 잦고, Maildir는 메일 한 통을 파일 하나로 디렉터리에 저장해 동시 접근에 안전하다. `home_mailbox = Maildir/`처럼 슬래시(/)로 끝나면 Maildir 형식이라는 신호다.

### 메일 별칭과 큐 관리

```bash
# /etc/aliases — 수신 주소 재지정(별칭)
root:       admin@example.com    # root로 온 메일을 admin에게 전달
webmaster:  root                 # 다단계 별칭도 가능
# 수정 후 반드시
newaliases

# 메일 큐 확인·처리
mailq              # 대기 중인 메일 큐 조회 (postqueue -p와 동일)
postqueue -f       # 큐 즉시 플러시(재전송 시도)
postsuper -d ALL   # 큐의 모든 메일 삭제
```

> 📚 **유래/사례**: 메일이 즉시 안 가고 큐에 쌓이는 일은 흔하다. 수신 서버 일시 다운, DNS MX 조회 실패, 그레이리스팅 등으로 MTA는 메일을 버리지 않고 큐에 두고 주기적으로 재시도한다. 그래서 "메일이 지연된다"는 신고가 오면 가장 먼저 `mailq`로 큐 상태를 본다. 이것이 메일 관리자의 첫 진단 명령이다.

## 시험 직전 체크리스트

- 25(SMTP), 110(POP3), 143(IMAP), 465(SMTPS), 587(제출), 993(IMAPS), 995(POP3S)을 즉답
- MTA(서버 간 전송) ≠ MDA(사서함 배달) ≠ MUA(사용자 클라이언트)
- Postfix 설정은 `/etc/postfix/main.cf`, Sendmail은 `/etc/mail/sendmail.cf`
- POP3=다운로드 후 삭제, IMAP=서버 보관·동기화
- 오픈 릴레이를 막으려면 mynetworks를 좁게

## 📖 용어

- **MUA(Mail User Agent)** : 사람이 메일을 쓰고 읽는 클라이언트. Outlook·Thunderbird·mutt 등.
- **MTA(Mail Transfer Agent)** : 서버에서 서버로 메일을 옮기는 전송 엔진. Sendmail·Postfix가 대표다.
- **MDA(Mail Delivery Agent)** : MTA가 받아 온 메일을 로컬 사용자 사서함에 떨어뜨리는 최종 배달 담당.
- **SMTP** : 메일을 **보내는** 프로토콜. MUA→MTA, MTA→MTA 모두 이걸 쓴다.
- **submission(587)** : 사용자가 인증을 거쳐 메일을 제출하는 전용 포트. STARTTLS로 암호화한다.
- **SMTPS(465)** : 처음부터 SSL로 감싸 연결하는 발송 포트. 587과 헷갈리기 쉽다.
- **POP3 vs IMAP** : 내려받고 서버에서 지우는 방식(단일 기기) / 서버에 두고 동기화하는 방식(여러 기기).
- **`inet_interfaces`** : Postfix가 메일을 받을 인터페이스. `localhost`로 두면 외부 메일을 못 받는다.
- **`mynetworks`** : 릴레이를 허용할 신뢰 네트워크. 너무 넓으면 오픈 릴레이가 된다.
- **오픈 릴레이** : 아무나 이 서버로 메일을 중계할 수 있는 상태. 스팸 발송지로 악용된다.
- **`relayhost`** : 외부 발신을 직접 하지 않고 거쳐 가는 중계 서버 지정.
- **mbox vs Maildir** : 모든 메일을 한 파일에 이어 붙이는 방식 / 메일 한 통을 파일 하나로 저장하는 방식(동시 접근에 안전).
- **`/etc/aliases`** : 수신 주소를 다른 주소로 넘기는 별칭 파일. 고친 뒤 `newaliases`로 DB를 다시 만들어야 한다.
- **메일 큐** : 즉시 못 보낸 메일이 쌓여 재시도를 기다리는 곳. `mailq`로 보고 `postqueue -f`로 밀어낸다.

## 📝 연습 문제

**문제 1.** 메일 시스템에서 서버와 서버 사이로 메일을 전송(라우팅)하는 역할을 담당하는 구성요소는?

A) MUA — 사용자가 메일을 작성하고 읽는 클라이언트

B) MTA — 메일을 서버 간에 전송하는 전송 에이전트

C) MDA — 받은 메일을 사용자 사서함에 최종 배달하는 에이전트

D) MX — 도메인의 메일 서버를 가리키는 DNS 레코드

**정답: B**

해설: MTA(Mail Transfer Agent)는 Sendmail·Postfix처럼 서버 간에 SMTP로 메일을 전송하는 핵심 엔진이다. A(MUA)는 사용자 클라이언트, C(MDA)는 사서함에 최종 배달하는 단계, D(MX)는 DNS 레코드일 뿐 프로그램이 아니다. "서버 간 전송 = MTA"가 핵심이다.

---

**문제 2.** SMTP, POP3, IMAP의 기본(평문) 포트 번호를 순서대로 바르게 짝지은 것은?

A) 25, 110, 143

B) 25, 143, 110

C) 110, 25, 143

D) 25, 995, 993

**정답: A**

해설: SMTP는 25, POP3는 110, IMAP은 143이다. B는 POP3와 IMAP이 뒤바뀌었고, C는 SMTP와 POP3가 뒤바뀌었으며, D의 995·993은 각각 POP3S·IMAPS의 암호화 포트라 평문 포트가 아니다. "발송 25 / 수신 110·143"을 고정하라.

---

**문제 3.** POP3와 IMAP의 차이에 대한 설명으로 옳은 것은?

A) POP3는 메일을 서버에 보관해 여러 기기에서 동기화하기 좋다

B) IMAP은 메일을 클라이언트로 내려받고 서버에서 삭제하는 것이 기본이다

C) POP3는 메일을 다운로드하고 서버에서 삭제하며, IMAP은 서버에 보관해 여러 기기에서 동기화한다

D) 둘 다 메일을 보내는 발송용 프로토콜이며 포트 25를 공유한다

**정답: C**

해설: POP3는 다운로드 후 서버에서 삭제(기본)하여 단일 기기에 적합하고, IMAP은 서버에 보관·동기화하여 여러 기기에서 같은 사서함을 본다. A와 B는 두 프로토콜의 특성을 뒤바꾼 것이고, D는 POP3/IMAP이 발송이 아닌 수신용이라 틀렸다. "여러 기기 = IMAP"이 정답 신호다.

---

**문제 4.** Postfix의 핵심 설정 파일 경로로 옳은 것은?

A) `/etc/mail/sendmail.cf`

B) `/etc/postfix/main.cf`

C) `/etc/postfix/aliases.db`

D) `/etc/services`

**정답: B**

해설: Postfix의 주 설정 파일은 `/etc/postfix/main.cf`로 key=value 형식의 직관적인 지시어를 담는다. A는 Sendmail의 설정 파일, C는 별칭 데이터베이스 바이너리, D는 포트-서비스 매핑 파일이라 Postfix 주 설정과 무관하다. "Postfix = main.cf, Sendmail = sendmail.cf"를 구분하라.

---

**문제 5.** 메일을 SSL/TLS로 암호화하여 발송할 때 사용하는 포트(SMTPS)와 IMAP 암호화 포트(IMAPS)를 바르게 짝지은 것은?

A) SMTPS 587, IMAPS 995

B) SMTPS 465, IMAPS 993

C) SMTPS 25, IMAPS 143

D) SMTPS 993, IMAPS 465

**정답: B**

해설: SMTPS는 465, IMAPS는 993이다. A의 587은 STARTTLS 메일 제출 포트이고 995는 POP3S라 IMAPS가 아니며, C는 둘 다 평문 포트, D는 두 값이 서로 뒤바뀌었다. "암호화: SMTPS 465, IMAPS 993, POP3S 995"를 묶어서 외워라.

---

**문제 6.** Sendmail과 비교한 Postfix의 특징으로 옳은 것은?

A) 단일 거대 프로세스 구조로 설정이 매우 복잡하다

B) 여러 작은 프로세스로 권한을 분리해 보안성이 높고 설정이 상대적으로 쉽다

C) 설정 파일이 `/etc/mail/sendmail.cf`이며 m4로 컴파일해야 한다

D) POP3 수신 전용 서버로 메일 전송 기능이 없다

**정답: B**

해설: Postfix는 수신·큐·배달을 각각 다른 권한의 작은 프로세스로 분리해 보안성이 높고, main.cf의 key=value 형식이라 설정이 쉽다. A·C는 Sendmail의 특징이고, D는 Postfix가 MTA(전송 서버)임을 부정하므로 틀렸다. "모듈형·보안·main.cf = Postfix"가 핵심이다.

---

**문제 7.** Postfix에서 `mynetworks`를 `0.0.0.0/0`처럼 지나치게 넓게 설정했을 때 발생하는 보안 문제는?

A) 메일을 전혀 수신하지 못하게 된다

B) 누구나 이 서버를 통해 메일을 중계할 수 있는 오픈 릴레이가 되어 스팸 발송에 악용된다

C) POP3 포트가 자동으로 닫힌다

D) 사서함이 mbox에서 Maildir로 강제 변경된다

**정답: B**

해설: `mynetworks`는 릴레이를 허용할 신뢰 네트워크를 지정하는데, 이를 전체로 열면 외부 누구나 이 서버로 메일을 중계할 수 있는 오픈 릴레이가 되어 스팸 발송지로 악용된다. A는 inet_interfaces 관련 증상, C·D는 mynetworks와 무관하다. "오픈 릴레이 위험 = mynetworks 과도 개방"을 연결하라.

---
