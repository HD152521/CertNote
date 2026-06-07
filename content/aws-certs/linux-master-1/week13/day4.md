# Day 4 - 보안·방화벽·로그 작업형: 규칙을 쓰고 컨텍스트를 바로잡는다

2차 실기 보안 작업형은 "이 포트만 열고 나머지는 막아라", "이 디렉터리의 SELinux 컨텍스트를 고쳐라", "이 로그를 매주 순환·압축하라"처럼 **규칙과 설정을 직접 작성**하게 한다. 오늘은 `iptables`와 `firewall-cmd`로 방화벽 규칙을 세우고, SELinux 컨텍스트를 진단·수정하고, `rsyslog`로 로그를 분류하고 `logrotate`로 순환시키는 전 과정을 손에 익힌다. 핵심은 **명령 옵션과 설정 파일 지시어를 정확히** 쓰는 것 — 방향(INPUT/OUTPUT), 타깃(ACCEPT/DROP), zone, 컨텍스트 type, facility.priority가 한 글자도 틀리면 안 된다.

## iptables — netfilter를 손으로 제어

iptables는 커널 netfilter를 **테이블→체인→규칙** 구조로 제어한다. filter 테이블의 세 체인을 방향으로 외운다.

| 체인 | 방향 | 예 |
|------|------|----|
| `INPUT` | 들어옴(서버로) | 외부→내 80 포트 |
| `OUTPUT` | 나감(서버에서) | 내→외부 DNS |
| `FORWARD` | 통과(라우팅) | 게이트웨이 경유 |

주요 옵션과 타깃:

| 옵션 | 의미 | 타깃 | 의미 |
|------|------|------|------|
| `-A` | 체인 끝에 추가 | `ACCEPT` | 허용 |
| `-I` | 앞에 삽입 | `DROP` | 응답 없이 버림 |
| `-D` | 삭제 | `REJECT` | 거부 응답 보냄 |
| `-P` | 기본 정책 | `LOG` | 로그 남기고 통과 |
| `-j` | 타깃 지정 | | |
| `-p` | 프로토콜(tcp/udp) | `--dport` | 목적지 포트 |
| `-s` | 출발지 IP | `--sport` | 출발지 포트 |

```bash
# 규칙 조회
iptables -L -n -v --line-numbers     # 줄 번호 포함 상세 조회

# 80(HTTP), 22(SSH) 들어오는 TCP 허용
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# 특정 IP만 허용
iptables -A INPUT -s 192.168.1.0/24 -p tcp --dport 3306 -j ACCEPT

# 나머지 INPUT은 모두 차단(기본 정책)
iptables -P INPUT DROP

# 규칙 삭제 / 초기화
iptables -D INPUT 3                   # 3번 규칙 삭제
iptables -F                           # 전체 규칙 플러시

# 저장(재부팅 후 유지) — 메모리에만 있으므로 필수
service iptables save                 # 또는 iptables-save > /etc/sysconfig/iptables
```

> ⚠️ **치명적 함정**: 원격 SSH 중에 `iptables -P INPUT DROP`을 먼저 하면 **자기 자신이 끊긴다**. 반드시 22번 ACCEPT 규칙을 먼저 넣고 정책을 바꿔야 한다.

> 🔍 **순서가 전부**: 규칙은 위→아래로 매칭되고 첫 매칭에서 멈춘다. "모두 DROP"이 위에 있으면 뒤(`-A`)의 ACCEPT는 도달 못 한다 → `-I`로 앞에 삽입해야 효과.

## firewall-cmd — firewalld의 zone 기반 방화벽

firewalld는 신뢰 수준을 **zone**으로 묶어 관리한다. 런타임과 영구 설정이 분리된 것이 핵심.

```bash
# 상태·기본 정보
firewall-cmd --state                       # 동작 여부
firewall-cmd --get-default-zone            # 기본 zone
firewall-cmd --list-all                    # 현재 zone 전체 규칙

# 서비스/포트 허용 (영구 + 즉시 적용)
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload                      # permanent를 현재에 반영

# 특정 IP만 허용 (rich rule)
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" service name="ssh" accept'

# 제거
firewall-cmd --permanent --remove-service=http
firewall-cmd --reload
```

| 옵션 | 의미 |
|------|------|
| `--add-service` / `--add-port` | 서비스명/포트 허용 |
| `--permanent` | 영구 저장(즉시 적용 X) |
| `--reload` | permanent를 현재 세션에 반영 |
| `--list-all` | 현재 규칙 전체 확인 |
| `--get-default-zone` | 기본 zone 조회 |

> ⚠️ **핵심 함정**: `--permanent`만 쓰면 **지금은 적용 안 된다**. `--reload`를 해야 현재 세션에 반영된다. 반대로 `--reload` 없이 `--add-service`만 하면 재부팅 시 사라진다. "영구 + 즉시" = `--permanent` 후 `--reload`.

> 💡 **iptables vs firewalld 저장**: iptables는 `service iptables save`, firewalld는 `--permanent`. 둘 다 "메모리 규칙은 휘발된다"는 같은 문제를 다르게 해결.

## SELinux — DAC 위의 강제 접근 제어

SELinux는 전통 권한(DAC) 위에 type 기반 강제 제어(MAC)를 얹는다. 세 모드와 컨텍스트가 핵심.

```bash
getenforce                    # 현재 모드 (Enforcing/Permissive/Disabled)
setenforce 0                  # Permissive로 일시 전환
setenforce 1                  # Enforcing로 일시 전환
# 영구 변경(disabled 포함)은 /etc/selinux/config의 SELINUX= 수정 후 재부팅
```

| 모드 | 동작 |
|------|------|
| `Enforcing` | 정책 위반 **차단 + 로그** |
| `Permissive` | 위반 허용하되 **로그만** |
| `Disabled` | SELinux 완전 비활성 |

컨텍스트는 `user:role:type:level`이며 **type이 핵심**이다.

```bash
ls -Z /var/www/html           # 파일 컨텍스트 확인 (-Z)
ps -eZ                         # 프로세스 컨텍스트

# 컨텍스트 변경
chcon -t httpd_sys_content_t /web/index.html      # 즉시 변경(임시)
semanage fcontext -a -t httpd_sys_content_t "/web(/.*)?"   # 정책에 영구 등록
restorecon -Rv /web           # 정책 기준으로 기본 컨텍스트 복원

# 불리언(기능 on/off)
getsebool -a | grep httpd
setsebool -P httpd_can_network_connect on    # -P=영구
```

| 명령 | 역할 |
|------|------|
| `ls -Z` | 컨텍스트 조회 |
| `chcon -t type` | 컨텍스트 임시 변경 |
| `restorecon` | 기본 컨텍스트 복원 |
| `semanage fcontext` | 컨텍스트 영구 정책 등록 |
| `setsebool -P` | 불리언 영구 변경 |

> 🔍 **진단 신호**: "권한(rwx)은 맞는데 접근이 안 된다" → SELinux 의심. `setenforce 0`으로 되면 SELinux 문제(운영에선 끄지 말고 `restorecon`/`chcon`으로 컨텍스트 수정).

> ⚠️ **chcon vs restorecon**: `chcon`은 직접 지정(재라벨링 시 사라질 수 있음), `restorecon`은 정책 기준 복원, `semanage fcontext`+`restorecon`이 영구적인 정석. setenforce로는 Disabled로 못 간다(영구는 config 파일).

## rsyslog — 로그를 facility.priority로 분류

`/etc/rsyslog.conf`(또는 `/etc/rsyslog.d/*.conf`)는 `facility.priority  대상` 형식으로 로그를 분배한다.

```text
# facility.priority         대상파일
*.info;mail.none;authpriv.none;cron.none   /var/log/messages
authpriv.*                                  /var/log/secure
mail.*                                      /var/log/maillog
cron.*                                      /var/log/cron
*.emerg                                     :omusrmsg:*
kern.*                                      /var/log/kern.log
local7.*                                    /var/log/boot.log
```

| facility | 의미 | priority(낮→높) |
|----------|------|----------------|
| `auth`/`authpriv` | 인증·보안 | `debug` |
| `cron` | 크론 | `info` |
| `kern` | 커널 | `notice` |
| `mail` | 메일 | `warning`/`warn` |
| `daemon` | 데몬 | `err`/`error` |
| `local0~7` | 사용자 정의 | `crit`, `alert`, `emerg` |

priority는 **지정 수준 이상**을 기록한다. 특수 표기:

| 표기 | 의미 |
|------|------|
| `mail.info` | mail의 info **이상** 전부 |
| `mail.=info` | 정확히 info 수준만 |
| `mail.none` | mail은 **제외** |
| `*.info` | 모든 facility의 info 이상 |

```bash
# 수정 후 적용
systemctl restart rsyslog
```

> 📚 **빈칸 단골**: 보안 인증 로그를 `/var/log/secure`에 모으는 설정은 `authpriv.*  /var/log/secure`. `.none`은 제외, `.=`는 정확히 그 수준만.

## logrotate — 로그 순환·압축·보존

`/etc/logrotate.conf`와 `/etc/logrotate.d/*`가 로그가 무한히 커지는 것을 막는다.

```text
# /etc/logrotate.d/myapp
/var/log/myapp/*.log {
    weekly                  # 순환 주기: daily/weekly/monthly
    rotate 4                # 보관 개수(4개=약 4주치), 초과분 삭제
    compress                # 순환된 로그 gzip 압축
    delaycompress           # 한 세대는 압축 지연(직전 로그 가독)
    missingok               # 파일 없어도 오류 안 냄
    notifempty              # 비어 있으면 순환 안 함
    create 0640 root root   # 새 로그 파일 권한·소유자
    size 100M               # (선택) 크기 기준 순환
    postrotate              # 순환 후 실행할 명령
        systemctl reload rsyslog > /dev/null 2>&1 || true
    endscript
}
```

| 지시어 | 의미 |
|--------|------|
| `daily`/`weekly`/`monthly` | 순환 주기 |
| `rotate N` | 보관할 세대 수 |
| `compress` | gzip 압축 |
| `size` | 크기 기준 순환 |
| `create` | 새 파일 권한·소유 |
| `postrotate`...`endscript` | 순환 후 명령 |

```bash
logrotate -d /etc/logrotate.d/myapp   # 디버그(실제 실행 X, 동작 예측)
logrotate -f /etc/logrotate.d/myapp   # 강제 즉시 순환
```

> 💡 **시험 해석**: `weekly` + `rotate 4` + `compress` = 매주 순환, 최근 4개(약 4주치)를 압축 보관, 초과분 삭제. 크기 기준은 `size`, 주기 기준은 `daily/weekly`.

## TCP Wrapper — 서비스 단위 접근 제어

방화벽보다 상위 계층에서, libwrap을 쓰는 서비스(sshd, vsftpd 등)는 두 파일로 접근을 통제한다.

```text
# /etc/hosts.allow  (먼저 검사, 일치하면 허용)
sshd: 192.168.1.0/24
vsftpd: 192.168.1.10

# /etc/hosts.deny   (그 다음 검사, 일치하면 거부)
ALL: ALL
```

검사 순서는 **hosts.allow(허용) → hosts.deny(거부) → 둘 다 없으면 기본 허용**이다. 문법은 `서비스 : 호스트`이며 `ALL`/`LOCAL`/`EXCEPT` 키워드를 쓴다.

| 키워드 | 의미 |
|--------|------|
| `ALL` | 모든 서비스/호스트 |
| `LOCAL` | 점(.)이 없는 로컬 호스트 |
| `EXCEPT` | 예외 지정 |

> 🔍 **순서가 결과를 바꾼다**: allow가 deny보다 우선. `hosts.deny`에 `ALL: ALL`을 두고 `hosts.allow`에 허용할 대상만 화이트리스트로 적는 것이 보안 정석. 둘 다 비면 모두 허용된다.

## 방화벽·보안 작업형 한눈에

| 작업 | iptables | firewalld | 주의 |
|------|----------|-----------|------|
| 포트 허용 | `-A INPUT -p tcp --dport N -j ACCEPT` | `--permanent --add-port=N/tcp` | 방향·프로토콜 |
| 차단 | `-j DROP`/`REJECT` | `--remove-service` | DROP=무응답 |
| 저장 | `service iptables save` | `--permanent --reload` | 휘발 방지 |
| 정책 | `-P INPUT DROP` | zone 기본값 | SSH 먼저 허용! |

## 직접 쳐보기

```bash
# 현재 방화벽 상태 한눈에
iptables -L -n -v --line-numbers
firewall-cmd --list-all

# SELinux 상태와 컨텍스트
getenforce
ls -Z /var/www/html 2>/dev/null

# 로그 설정 미리보기(실제 순환 X)
logrotate -d /etc/logrotate.conf 2>&1 | head -20
```

## 마무리

오늘은 보안의 세 기둥을 손으로 세웠다. 방화벽에서는 iptables의 방향(INPUT/OUTPUT/FORWARD)·옵션(`-A`/`-I`/`-P`/`-j`)·타깃(ACCEPT/DROP/REJECT)과 firewalld의 `--permanent --reload` 패턴, 그리고 "원격에선 SSH를 먼저 허용"이라는 철칙을 익혔다. SELinux에서는 세 모드(Enforcing/Permissive/Disabled), 컨텍스트의 type 중심, `chcon`/`restorecon`/`semanage`/`setsebool -P`의 역할 분담을 정리했다. 로그에서는 rsyslog의 `facility.priority`(`.none` 제외, `.=` 정확히)와 logrotate의 `rotate N`·`compress`·주기 지시어를 다뤘다. 작업형은 결국 **정확한 옵션과 지시어**를 묻는다 — 방향 하나, type 하나, `--reload` 하나가 합격을 가른다.

## 📝 연습 문제

**문제 1.** 외부에서 들어오는 22번 포트(SSH) TCP 접속을 허용하는 iptables 명령으로 옳은 것은?

A) iptables -A OUTPUT -p tcp --sport 22 -j ACCEPT
B) iptables -A INPUT -p tcp --dport 22 -j ACCEPT
C) iptables -A FORWARD -p udp --dport 22 -j ACCEPT
D) iptables -P INPUT -p tcp --dport 22 -j DROP

**정답: B**

해설: 서버로 들어오는 접속이므로 `INPUT` 체인, TCP, 목적지 포트 `--dport 22`, 동작 `-j ACCEPT`다. A는 OUTPUT/sport로 방향이 틀리고, C는 FORWARD/udp로 잘못됐으며, D는 정책(-P)에 포트를 잘못 결합하고 DROP(차단)이다.

---

**문제 2.** 원격 SSH로 서버를 관리하던 중 방화벽 기본 정책을 DROP으로 바꾸려 한다. 올바른 작업 순서는?

A) `-P INPUT DROP`을 먼저 실행하고 SSH를 허용한다
B) SSH(22) 허용 규칙을 먼저 넣은 뒤 `-P INPUT DROP`을 실행한다
C) 순서는 상관없다
D) `-F`로 모두 비운 뒤 `-P INPUT DROP`만 실행한다

**정답: B**

해설: 기본 정책을 DROP으로 먼저 바꾸면 현재 SSH 세션을 포함한 모든 입력이 즉시 차단돼 원격 접속이 끊긴다. 따라서 22번 ACCEPT 규칙을 먼저 넣어 자신을 보호한 뒤 정책을 DROP으로 변경해야 한다. D는 SSH 허용 없이 차단해 동일하게 끊긴다.

---

**문제 3.** firewalld에서 http 서비스를 재부팅 후에도 유지되게 허용하고 즉시 반영하려면?

A) firewall-cmd --add-service=http
B) firewall-cmd --permanent --add-service=http 후 firewall-cmd --reload
C) firewall-cmd --permanent --add-service=http 만 실행
D) firewall-cmd --reload 후 firewall-cmd --add-service=http

**정답: B**

해설: `--permanent`로 영구 저장한 뒤 `--reload`로 현재 세션에 반영해야 "영구 + 즉시"가 된다. A는 재부팅 시 사라지고, C는 지금 적용되지 않으며, D는 순서가 거꾸로라 추가가 영구화되지 않는다.

---

**문제 4.** SELinux의 동작 모드 중 정책 위반을 차단하지 않고 로그만 남기는 모드는?

A) Enforcing
B) Permissive
C) Disabled
D) Targeted

**정답: B**

해설: `Permissive`는 정책 위반 동작을 허용하되 로그(AVC denial)만 기록해 디버깅에 쓴다. `Enforcing`은 차단+로그, `Disabled`는 완전 비활성이다. `Targeted`는 모드가 아니라 정책 유형(policy type)이다.

---

**문제 5.** 파일의 SELinux 컨텍스트를 정책 기준의 기본값으로 복원하는 명령은?

A) chcon
B) restorecon
C) setenforce
D) getsebool

**정답: B**

해설: `restorecon`은 시스템 정책에 정의된 기본 컨텍스트로 파일을 되돌린다. `chcon`은 컨텍스트를 직접 임시 지정하고, `setenforce`는 모드 전환, `getsebool`은 불리언 조회다. 영구적으로 바꾸려면 `semanage fcontext`로 등록 후 `restorecon`을 적용한다.

---

**문제 6.** rsyslog.conf에서 `mail.none`의 의미로 옳은 것은?

A) mail facility의 모든 메시지를 기록한다
B) mail facility의 메시지를 해당 대상에서 제외한다
C) mail의 none 수준만 기록한다
D) 모든 facility의 메시지를 mail로 보낸다

**정답: B**

해설: `.none`은 해당 facility를 그 대상 파일에서 **제외**한다는 의미다(예: messages에서 메일 로그 빼기). 모든 수준은 `.*`, 정확히 한 수준만은 `.=수준`으로 지정한다. none은 priority 값이 아니라 제외 키워드다.

---

**문제 7.** logrotate 설정 `weekly`, `rotate 4`, `compress`의 동작으로 옳은 것은?

A) 매일 순환하며 4개를 압축 없이 보관한다
B) 매주 순환하며 최근 4개(약 4주치)를 압축해 보관하고 초과분은 삭제한다
C) 로그가 4MB를 넘으면 순환한다
D) 4주에 한 번만 순환한다

**정답: B**

해설: `weekly`는 매주 순환, `rotate 4`는 최근 4세대를 보관(초과 시 가장 오래된 것 삭제), `compress`는 순환된 로그를 gzip으로 압축한다. 따라서 약 4주치가 압축 보관된다. 크기 기준 순환은 `size` 지시어를 써야 한다.

---
