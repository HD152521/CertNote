# Day 3 - 원격 접속의 표준: SSH와 sshd_config, 키 인증, 포트 포워딩

원격 서버를 다루는 모든 작업의 출발점은 **SSH(Secure Shell)**다. 과거 Telnet이 ID·비밀번호를 평문으로 흘려보내 통째로 도청당하던 시절을 끝내고, SSH는 모든 통신을 암호화하며 표준 원격 접속 수단이 되었다. 오늘은 SSH 서버 설정 파일(`sshd_config`)의 보안 지시어, 비밀번호 없이 로그인하는 공개키 인증, 그리고 SSH의 숨은 무기인 포트 포워딩까지 실기 수준으로 파고든다.

오늘의 핵심 통찰: **SSH는 단순한 원격 셸이 아니라, 암호화된 터널 위에 인증·파일전송·포트포워딩을 얹은 종합 보안 채널이다.** Telnet과의 결정적 차이는 "암호화" 한 단어로 요약되지만, 그 위에서 키 인증과 터널링이라는 강력한 기능이 펼쳐진다. 22번 포트 하나로 셸·scp·sftp·터널을 모두 처리한다는 점이 SSH의 힘이다.

## Telnet vs SSH — 평문과 암호화의 결정적 차이

| 구분 | Telnet | SSH |
|------|--------|-----|
| 포트 | 23 | 22 |
| 암호화 | 없음(평문 전송) | 전 구간 암호화 |
| 인증 정보 | ID·비밀번호 그대로 노출 | 암호화되어 도청 불가 |
| 인증 방식 | 비밀번호만 | 비밀번호 + 공개키 |
| 부가 기능 | 셸 접속만 | scp·sftp·포트포워딩·X11 포워딩 |
| 현재 위상 | 사실상 폐기(내부 테스트용) | 표준 |

> ⚠️ **함정**: Telnet은 23번, SSH는 22번이다. 포트를 뒤바꾼 보기가 자주 나온다. 또 "Telnet은 암호화한다"거나 "SSH는 평문"이라는 정반대 서술도 함정이다. Telnet의 유일한 잔존 용도는 "포트가 열렸는지 테스트하는 도구"(`telnet host 80`)일 뿐, 실제 원격 접속에는 쓰지 않는다.

> 💡 **개념**: SSH가 안전한 이유는 접속 초기에 **키 교환**으로 세션 암호화 키를 안전하게 합의하기 때문이다. 이후 모든 명령·출력·비밀번호가 이 키로 암호화돼 흐르므로, 중간에서 가로채도 의미 없는 암호문만 보인다. Telnet은 이 과정이 없어 비밀번호가 그대로 노출된다.

## sshd_config 주요 보안 지시어

SSH 서버의 동작은 `/etc/ssh/sshd_config`가 결정한다. 클라이언트 설정인 `/etc/ssh/ssh_config`와 혼동하지 말 것.

```bash
# /etc/ssh/sshd_config — 핵심 보안 지시어
Port 22                          # 접속 포트(보안상 변경하기도 함)
ListenAddress 0.0.0.0            # 수신 대기 주소
Protocol 2                       # SSH 프로토콜 버전(1은 취약, 2만 사용)

PermitRootLogin no               # root 직접 로그인 차단(보안 핵심)
PasswordAuthentication yes       # 비밀번호 인증 허용(키만 쓰면 no)
PubkeyAuthentication yes         # 공개키 인증 허용
PermitEmptyPasswords no          # 빈 비밀번호 로그인 금지

MaxAuthTries 3                   # 인증 시도 횟수 제한(무차별 대입 방어)
LoginGraceTime 60                # 로그인 완료 제한 시간(초)
AllowUsers alice bob             # 접속 허용 사용자 화이트리스트
DenyUsers guest                  # 접속 거부 사용자

ClientAliveInterval 300          # 유휴 세션 점검 간격
X11Forwarding yes                # X11 GUI 포워딩 허용
```

설정 변경 후에는 데몬을 다시 읽혀야 한다:

```bash
sshd -t                          # 설정 문법 검사(중요: 잘못된 설정으로 잠기지 않게)
systemctl restart sshd           # 데몬 재시작
```

> ⚠️ **함정**: `PermitRootLogin no`는 가장 자주 출제되는 보안 지시어다. root 직접 로그인을 막아 무차별 대입의 1순위 표적을 제거한다. 또 `sshd_config`(서버)와 `ssh_config`(클라이언트)를 헷갈리면 안 된다. "데몬 d가 붙은 sshd_config가 서버 설정"이다.

> 🔍 **핵심 구분**: `PasswordAuthentication no`로 바꾸면 비밀번호 로그인이 완전히 막히고 **공개키 인증만** 허용된다. 이것이 실무의 강력한 보안 설정이다. 단, 키를 미리 등록하지 않고 이 설정을 켜면 본인도 못 들어가므로, 반드시 키 등록 후에 적용해야 한다.

> 📚 **유래/사례**: 인터넷에 노출된 SSH 서버는 봇넷의 무차별 대입 공격을 끊임없이 받는다. `PermitRootLogin no` + `PasswordAuthentication no`(키 전용) + `MaxAuthTries 3` 조합이 표준 방어다. 여기에 포트를 22에서 바꾸면 자동화된 스캔의 상당수를 회피할 수 있어 실무에서 자주 쓰인다(다만 근본 방어는 키 인증이다).

## 공개키 인증 — 비밀번호 없는 안전한 로그인

SSH의 백미는 비밀번호 없이도 안전하게 로그인하는 **공개키 인증**이다. 키 쌍을 만들어 공개키를 서버에 두고, 개인키로 신원을 증명한다.

```bash
# 1. 클라이언트에서 키 쌍 생성
ssh-keygen -t ed25519 -C "alice@laptop"
#   -t : 키 알고리즘(ed25519 권장, rsa는 -b 4096으로)
#   생성물: ~/.ssh/id_ed25519(개인키), ~/.ssh/id_ed25519.pub(공개키)

# 2. 공개키를 서버에 등록(가장 쉬운 방법)
ssh-copy-id alice@192.168.1.10
#   → 서버의 ~/.ssh/authorized_keys에 공개키가 추가됨

# 3. 이후 비밀번호 없이 접속
ssh alice@192.168.1.10
```

키 인증의 권한은 까다롭다. 권한이 느슨하면 SSH가 보안상 키를 거부한다:

```bash
chmod 700 ~/.ssh                       # 디렉터리는 700
chmod 600 ~/.ssh/authorized_keys       # 파일은 600
chmod 600 ~/.ssh/id_ed25519            # 개인키도 600
```

> 💡 **개념**: 공개키 인증은 "공개키는 자물쇠, 개인키는 열쇠"로 이해하라. 자물쇠(공개키)는 서버의 authorized_keys에 공개적으로 둬도 안전하고, 열쇠(개인키)는 클라이언트가 절대 유출하지 않는다. 서버가 자물쇠로 낸 도전(challenge)에 클라이언트가 열쇠로 답하면, 비밀번호 없이도 신원이 증명된다.

> ⚠️ **함정**: 서버에 등록하는 것은 **공개키(.pub)**이고, 클라이언트가 보관하는 것은 **개인키**다. 이를 뒤바꿔 "개인키를 서버에 올린다"는 보기는 틀렸다(개인키 유출은 치명적). 또 `~/.ssh` 권한이 느슨하면 키 인증이 무시되고 비밀번호를 다시 묻는 것도 단골 함정이다.

> 🔍 **핵심 구분**: `authorized_keys`(서버에 둠, 접속 허용 공개키 목록)와 `known_hosts`(클라이언트에 둠, 접속했던 서버의 호스트 키 기록)를 구분하라. 전자는 "누구를 들일까", 후자는 "이 서버가 맞나(중간자 공격 탐지)"의 역할이다.

### 직접 쳐보기 — 키 인증 설정

```bash
# 생성된 키 확인
ls -l ~/.ssh/
# id_ed25519  id_ed25519.pub  authorized_keys  known_hosts

# 서버 측에서 등록된 공개키 확인
cat ~/.ssh/authorized_keys

# 상세 로그로 인증 과정 추적(문제 진단 시)
ssh -v alice@192.168.1.10
```

## scp와 sftp — SSH 위의 파일 전송

SSH 채널 위에서 파일도 안전하게 옮긴다.

```bash
# scp : 명령 한 줄로 복사
scp report.txt alice@192.168.1.10:/home/alice/    # 로컬→원격 업로드
scp alice@192.168.1.10:/var/log/app.log ./        # 원격→로컬 다운로드
scp -r project/ alice@192.168.1.10:/srv/          # 디렉터리 통째로(-r)
scp -P 2222 file user@host:/path/                 # 포트 지정은 대문자 -P

# sftp : 대화형 파일 전송(FTP 명령과 유사하나 SSH 보안)
sftp alice@192.168.1.10
sftp> put backup.tar
sftp> get config.yaml
sftp> bye
```

> ⚠️ **함정**: scp의 포트 지정 옵션은 **대문자 `-P`**이고, ssh의 포트 옵션은 **소문자 `-p`**다. 대소문자가 반대라 자주 틀린다. scp는 SSH(22번)를 그대로 쓰므로 별도 FTP 서버 없이도 안전한 전송이 된다는 점도 포인트다.

## SSH 포트 포워딩(터널링) — 암호화 터널의 마법

SSH는 암호화 터널 안에 다른 연결을 실어 나를 수 있다. 방화벽 우회·안전한 접근에 강력하다.

| 종류 | 명령 옵션 | 동작 |
|------|-----------|------|
| 로컬 포워딩 | `-L 로컬포트:대상:대상포트` | 내 로컬 포트로 온 연결을 원격을 거쳐 대상으로 |
| 원격 포워딩 | `-R 원격포트:대상:대상포트` | 원격 서버 포트로 온 연결을 내 쪽 대상으로 |
| 동적 포워딩 | `-D 로컬포트` | SOCKS 프록시로 동작(브라우저 등) |

```bash
# 로컬 포워딩: 내 8080 → SSH서버 경유 → 내부 DB(3306)
ssh -L 8080:db.internal:3306 alice@gateway
#   이제 localhost:8080 접속이 내부 db.internal:3306으로 안전하게 터널링

# 동적 포워딩: SOCKS 프록시로 모든 트래픽을 SSH 너머로
ssh -D 1080 alice@gateway
```

> 💡 **개념**: 로컬 포워딩(-L)은 "내 컴퓨터의 포트를 원격 너머의 서비스로 잇는 통로"다. 직접 못 닿는 내부망 DB를, SSH 게이트웨이를 징검다리 삼아 내 localhost처럼 쓰게 해준다. 모든 통로가 SSH로 암호화되므로 안전하다. "직접 못 닿는 내부 서비스 = 로컬 포워딩"으로 기억하라.

> 🔍 **핵심 구분**: 로컬(-L)은 **내 쪽에서 시작해 원격 너머로** 가고, 원격(-R)은 **원격 쪽에서 시작해 내 쪽으로** 들어온다. 방향이 정반대다. 동적(-D)은 특정 대상이 아니라 SOCKS 프록시로 모든 목적지를 받는다는 점이 다르다.

## 마무리 — SSH 한눈에 정리

SSH(22번)는 Telnet(23번)의 평문 취약점을 암호화로 끝낸 표준 원격 접속이다. 서버 설정 `sshd_config`에서 `PermitRootLogin no`·키 전용 인증·시도 제한으로 방어를 굳히고, 공개키 인증으로 비밀번호 없는 안전 로그인을 구현한다. scp/sftp로 파일을, -L/-R/-D 포워딩으로 암호화 터널을 만든다. 22번 하나에 이 모든 기능이 실린다.

시험 직전 체크리스트:
- SSH 22 / Telnet 23, SSH는 암호화·Telnet은 평문
- 서버 설정=sshd_config, 클라이언트 설정=ssh_config
- PermitRootLogin no / PasswordAuthentication no(키 전용) / MaxAuthTries
- ssh-keygen → 공개키(.pub)를 서버 authorized_keys에, 개인키는 클라이언트 보관
- ~/.ssh 700, authorized_keys·개인키 600
- scp 포트 -P(대문자), ssh 포트 -p(소문자)
- 포워딩: -L 로컬, -R 원격, -D 동적(SOCKS)

## 📝 연습 문제

**문제 1.** Telnet과 비교한 SSH의 가장 핵심적인 차이와 SSH의 표준 포트로 옳은 것은?

A) SSH는 평문 전송이며 포트 23을 사용한다

B) SSH는 모든 통신을 암호화하며 포트 22를 사용한다

C) Telnet은 암호화하며 포트 22를 사용한다

D) SSH는 비밀번호 인증만 지원하며 포트 23을 사용한다

**정답: B**

해설: SSH는 전 구간을 암호화하는 22번 포트 원격 접속 프로토콜이다. A는 SSH를 평문·23번으로 잘못 서술했고, C는 Telnet과 SSH의 특성을 뒤섞었으며, D는 SSH가 키 인증도 지원한다는 점과 포트(22)를 모두 틀렸다. "SSH=암호화·22번, Telnet=평문·23번"이 핵심이다.

---

**문제 2.** SSH 서버에서 root 계정의 직접 로그인을 차단하는 sshd_config 지시어는?

A) `PasswordAuthentication no`

B) `PermitRootLogin no`

C) `PubkeyAuthentication no`

D) `PermitEmptyPasswords no`

**정답: B**

해설: `PermitRootLogin no`는 root의 직접 SSH 로그인을 차단해 무차별 대입의 1순위 표적을 제거하는 보안 지시어다. A는 비밀번호 인증 자체를 끄는 설정, C는 공개키 인증을 끄는 설정, D는 빈 비밀번호 로그인을 막는 설정이라 root 차단과 무관하다. "root 직접 로그인 차단 = PermitRootLogin no".

---

**문제 3.** 공개키 인증을 설정할 때 서버에 등록하는 키와 그 파일로 옳은 것은?

A) 개인키를 서버의 `~/.ssh/known_hosts`에 등록한다

B) 공개키(.pub)를 서버의 `~/.ssh/authorized_keys`에 등록한다

C) 개인키를 서버의 `~/.ssh/authorized_keys`에 등록한다

D) 공개키를 클라이언트의 `~/.ssh/known_hosts`에 등록한다

**정답: B**

해설: 공개키 인증은 클라이언트의 공개키(.pub)를 서버의 `~/.ssh/authorized_keys`에 등록하고, 개인키는 클라이언트가 보관한다. A·C처럼 개인키를 서버에 올리면 안 되며(유출 시 치명적), D의 known_hosts는 접속했던 서버의 호스트 키를 기록하는 다른 파일이다. "서버엔 공개키, authorized_keys"가 핵심이다.

---

**문제 4.** SSH 키 인증이 동작하려면 `~/.ssh/authorized_keys` 파일에 권장되는 권한은?

A) 777

B) 644

C) 600

D) 755

**정답: C**

해설: SSH는 보안을 위해 `authorized_keys`와 개인키에 소유자만 읽고 쓸 수 있는 600 권한을 요구하며, `~/.ssh` 디렉터리는 700이어야 한다. A(777)·B(644)·D(755)처럼 다른 사용자에게 읽기 권한이 열려 있으면 SSH가 키를 무시하고 비밀번호를 다시 묻는다. "키 관련 파일은 600"을 기억하라.

---

**문제 5.** SSH를 이용해 직접 접근할 수 없는 내부망 데이터베이스(db.internal:3306)에, 게이트웨이를 경유해 내 localhost:8080으로 안전하게 연결하려는 포트 포워딩 명령으로 옳은 것은?

A) `ssh -R 8080:db.internal:3306 alice@gateway`

B) `ssh -L 8080:db.internal:3306 alice@gateway`

C) `ssh -D 8080 alice@gateway`

D) `ssh -P 8080 alice@gateway`

**정답: B**

해설: 로컬 포워딩 `-L 로컬포트:대상:대상포트`는 내 localhost:8080으로 온 연결을 게이트웨이 너머의 db.internal:3306으로 안전하게 잇는다. A(-R)는 방향이 반대인 원격 포워딩, C(-D)는 SOCKS 프록시, D의 `-P`는 scp의 포트 옵션이라 포워딩 명령이 아니다. "내부 서비스로 잇기 = 로컬 포워딩 -L".

---

**문제 6.** SSH 서버 설정 파일과 클라이언트 설정 파일을 바르게 짝지은 것은?

A) 서버 `/etc/ssh/ssh_config`, 클라이언트 `/etc/ssh/sshd_config`

B) 서버 `/etc/ssh/sshd_config`, 클라이언트 `/etc/ssh/ssh_config`

C) 서버와 클라이언트 모두 `/etc/ssh/ssh_config`

D) 서버 `~/.ssh/config`, 클라이언트 `/etc/ssh/sshd_config`

**정답: B**

해설: 데몬 설정인 `sshd_config`(d가 붙음)가 서버 설정이고, `ssh_config`가 클라이언트 설정이다. A는 둘을 정반대로 짝지었고, C는 서버 설정을 누락했으며, D는 서버에 클라이언트 파일을 잘못 배치했다. "d가 붙은 sshd_config가 서버"라는 구분이 핵심이다.

---

**문제 7.** scp로 포트 2222를 사용하는 원격 서버에 파일을 복사할 때 포트를 지정하는 옵션으로 옳은 것은?

A) 소문자 `-p 2222`

B) 대문자 `-P 2222`

C) `--port=2222`

D) `-L 2222`

**정답: B**

해설: scp의 포트 지정 옵션은 대문자 `-P`다(ssh는 소문자 `-p`). A의 소문자 `-p`는 scp에서 타임스탬프 보존 옵션이라 포트 지정과 다르고, C는 scp가 지원하지 않는 형식, D(-L)는 ssh 포트 포워딩 옵션이다. "scp 포트는 대문자 -P, ssh 포트는 소문자 -p"의 대소문자 차이가 함정이다.

---
