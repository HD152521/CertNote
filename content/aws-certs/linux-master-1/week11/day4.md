# Day 4 - 접근 제어와 보안: TCP Wrapper, SELinux, 로그 관리

## 📌 핵심 정리

- 보안은 다층 방어다 — 방화벽(네트워크) 안쪽에 **TCP Wrapper**(호스트 접근 제어) · **SELinux**(강제 접근 제어) · **로그 관리** · **IDS**가 겹겹이 놓인다.
- TCP Wrapper 검사 순서: `hosts.allow` 먼저 → 일치하면 **허용하고 종료**, 없으면 `hosts.deny` → 둘 다 없으면 **기본 허용**.
- SELinux는 DAC 위의 **MAC**. 모드는 `enforcing`/`permissive`/`disabled`, 컨텍스트는 `user:role:type:level`이며 **type**이 핵심이다. `setenforce`로는 disabled로 갈 수 없다.
- 로그는 `/var/log`에. `wtmp`·`btmp`·`lastlog`는 **바이너리**라 `last`·`lastb`·`lastlog`로 읽는다. `rsyslog.conf`는 `facility.priority` 짝으로 **그 수준 이상**을 기록한다.
- IDS는 패킷을 보는 **NIDS**(snort)와 파일 무결성을 보는 **HIDS**(tripwire·AIDE)로 갈린다. `fail2ban`은 로그를 보고 실패 IP를 자동 차단하되 설정은 `jail.local`에 쓴다.

## TCP Wrapper: hosts.allow와 hosts.deny

- TCP Wrapper는 `libwrap` 라이브러리(`tcpd`)를 통해 동작하는 호스트 기반 접근 제어 시스템이다.
- 서비스가 연결 요청을 받으면, 실제 서비스로 넘기기 전에 두 파일을 검사해 그 출발지 호스트를 허용할지 결정한다.

| 파일 | 역할 |
|------|------|
| `/etc/hosts.allow` | 접근을 **허용**할 호스트 목록 |
| `/etc/hosts.deny` | 접근을 **거부**할 호스트 목록 |

- 검사 순서가 가장 중요한 출제 포인트다.

> 💡 **검사 순서(절대 암기)**: ① `/etc/hosts.allow`를 먼저 검사 → 일치하면 **허용하고 종료**. ② 없으면 `/etc/hosts.deny`를 검사 → 일치하면 **거부**. ③ 어느 쪽에도 없으면 **기본 허용**. 즉 **allow가 deny보다 우선**하며, 둘 다 해당 없으면 통과한다.

- 파일의 문법은 `서비스 : 호스트` 형태다.

```bash
# /etc/hosts.deny — 기본적으로 모두 거부
ALL : ALL

# /etc/hosts.allow — 특정만 허용
sshd : 192.168.1.0/24
sshd : 192.168.1.100
vsftpd : .example.com
ALL : 127.0.0.1
```

- 위 조합은 "기본은 전부 거부하되, SSH는 192.168.1.0/24 서브넷에서만, FTP는 example.com 도메인에서만 허용"하는 전형적인 화이트리스트 구성이다.

| 키워드 | 의미 |
|--------|------|
| `ALL` | 모든 서비스 또는 모든 호스트 |
| `LOCAL` | 점(`.`)이 없는 로컬 호스트 이름 |
| `.example.com` | example.com 도메인의 모든 호스트 |
| `192.168.1.` | 해당 네트워크 대역 |
| `EXCEPT` | 예외 지정 (예: `ALL EXCEPT 192.168.1.5`) |

> ⚠️ **함정**: hosts.deny에 `ALL : ALL`을 넣어 전부 막은 뒤 hosts.allow에 자신을 허용하는 걸 빠뜨리면 SSH로 들어온 본인이 차단된다(방화벽과 같은 함정). 또한 TCP Wrapper는 `libwrap`을 사용하는 서비스(sshd, vsftpd 등)에만 적용된다 — 모든 서비스를 막는 만능 도구가 아니다.

## SELinux: 강제 접근 제어(MAC)

- 표준 리눅스 권한(rwx, 소유자/그룹/기타)은 **임의 접근 제어(DAC)**다. 파일 소유자가 권한을 마음대로 바꿀 수 있고, root는 사실상 모든 것을 할 수 있다.
- 문제: 웹 서버 같은 프로세스가 침해당하면 그 프로세스 권한으로 시스템 전체가 위험해진다.
- **SELinux**(Security-Enhanced Linux)는 그 위에 **강제 접근 제어(MAC)**를 덧씌운다.
- 모든 프로세스와 파일에 **보안 컨텍스트(security context)** 라벨을 붙이고, "이 컨텍스트의 프로세스는 저 컨텍스트의 파일만 건드릴 수 있다"는 정책을 커널이 강제한다.
- root조차 이 정책을 벗어날 수 없다.

### SELinux의 세 가지 모드

| 모드 | 동작 |
|------|------|
| `enforcing` | 정책을 **강제**한다. 위반 시 차단 + 로그 기록 |
| `permissive` | 정책을 **강제하지 않고** 위반을 로그만 남김 (디버깅용) |
| `disabled` | SELinux **완전 비활성화** |

- 모드는 명령과 설정 파일로 다룬다.

```bash
# 현재 모드 확인
getenforce            # Enforcing / Permissive / Disabled 출력
sestatus              # 상세 상태

# 일시적 모드 변경 (재부팅 시 원복)
setenforce 1          # Enforcing
setenforce 0          # Permissive

# 영구 변경은 설정 파일 수정
vi /etc/selinux/config
# SELINUX=enforcing  ← 이 값을 enforcing/permissive/disabled로
```

> 💡 **일시 vs 영구**: `setenforce`는 enforcing↔permissive만 **일시적으로** 전환하며 재부팅하면 `/etc/selinux/config`의 값으로 돌아간다. `disabled`로 가거나 영구 변경하려면 `/etc/selinux/config` 파일을 수정하고 재부팅해야 한다. `setenforce`로는 disabled로 갈 수 없다는 점이 함정이다.

### 보안 컨텍스트

- SELinux의 핵심은 모든 파일·프로세스에 붙는 **컨텍스트 라벨**이다.
- `ls -Z`(파일), `ps -Z`(프로세스)로 확인할 수 있다.

```bash
# 파일의 SELinux 컨텍스트 보기 (-Z)
ls -Z /var/www/html

# 출력 예: system_u:object_r:httpd_sys_content_t:s0
#          └user┘ └role┘  └──── type ────┘      └level┘
```

- 컨텍스트는 `user:role:type:level` 형식이며, 이 중 **type(타입)**이 실제 접근 제어에서 가장 중요하다.
- 예: 아파치(httpd) 프로세스는 `httpd_t` 타입으로 실행되고, `httpd_sys_content_t` 타입의 파일만 제공할 수 있다.
- 웹 콘텐츠를 엉뚱한 디렉터리에 두면 타입이 맞지 않아 "권한은 맞는데 접근이 거부되는" 현상이 생긴다.

```bash
# 파일의 컨텍스트(타입) 변경
chcon -t httpd_sys_content_t /srv/web/index.html

# 정책 기본값으로 컨텍스트 복원
restorecon -Rv /var/www/html

# SELinux 불리언(on/off 스위치) 확인·변경
getsebool -a
setsebool -P httpd_can_network_connect on
```

> 🔍 **chcon vs restorecon**: `chcon`은 컨텍스트를 직접 바꾸지만 임시적이라 `restorecon`이나 파일시스템 재라벨링 시 사라질 수 있다. 영구적으로는 `semanage fcontext`로 정책에 규칙을 등록한 뒤 `restorecon`으로 적용하는 것이 정석이다. `restorecon`은 정책에 정의된 "원래 있어야 할" 컨텍스트로 되돌린다.

> 📚 **실무 신호**: "권한(chmod)은 분명 맞는데 서비스가 파일에 접근 못 한다"면 SELinux 컨텍스트를 의심하라. 임시로 `setenforce 0`(permissive)로 바꿔 문제가 사라지면 원인은 SELinux다 — 단, 운영에서는 끄지 말고 컨텍스트를 올바르게 고쳐야 한다.

## 로그 관리: /var/log와 rsyslog

- 시스템에서 일어나는 일은 대부분 로그로 남는다. 침입 분석·장애 추적의 기본 자료다.
- 주요 로그 파일은 `/var/log` 아래에 모여 있다.

| 로그 파일 | 내용 |
|-----------|------|
| `/var/log/messages` | 일반 시스템 메시지(RHEL 계열) |
| `/var/log/syslog` | 일반 시스템 메시지(데비안 계열) |
| `/var/log/secure` | 인증·보안 관련(SSH 로그인 등, RHEL) |
| `/var/log/auth.log` | 인증 관련(데비안) |
| `/var/log/maillog` | 메일 서버 로그 |
| `/var/log/cron` | cron 작업 로그 |
| `/var/log/boot.log` | 부팅 메시지 |
| `/var/log/dmesg` | 커널 링 버퍼(부팅 시 하드웨어) |
| `/var/log/wtmp` | 로그인 기록 (바이너리, `last` 명령으로 조회) |
| `/var/log/btmp` | 로그인 실패 기록 (`lastb`로 조회) |
| `/var/log/lastlog` | 사용자별 마지막 로그인 (`lastlog`로 조회) |

> ⚠️ **바이너리 로그 주의**: `wtmp`, `btmp`, `lastlog`는 텍스트가 아닌 **바이너리** 파일이다. `cat`으로 열면 깨져 보이고, 각각 `last`, `lastb`, `lastlog` 전용 명령으로 읽어야 한다. 시험 단골 함정이다.

### rsyslog.conf: facility와 priority

- 로그를 어디에 어떻게 남길지는 **`/etc/rsyslog.conf`**에서 결정한다.
- 핵심 문법은 **`facility.priority    동작`** 형태다.

- **facility(서비스 분류)**: 로그를 발생시킨 출처 종류. 예: `auth`(인증), `authpriv`(보안 인증), `cron`, `mail`, `kern`(커널), `daemon`, `user`, `local0`~`local7`(사용자 정의)
- **priority(심각도)**: 메시지의 중요도. 낮음→높음 순으로 `debug < info < notice < warning < err < crit < alert < emerg`

```bash
# /etc/rsyslog.conf 예시
# facility.priority            대상
authpriv.*                     /var/log/secure
mail.*                         -/var/log/maillog
cron.*                         /var/log/cron
*.info;mail.none;authpriv.none /var/log/messages
*.emerg                        :omusrmsg:*
kern.*                         /var/log/kern.log
```

- priority를 지정하면 **그 수준 이상**의 메시지가 모두 기록된다.
- 예: `mail.err`는 err, crit, alert, emerg를 모두 잡는다.
- `mail.*`는 모든 수준, `mail.none`은 해당 facility를 제외한다는 뜻이다.

> 💡 **핵심 해석**: `*.info;mail.none;authpriv.none /var/log/messages`는 "모든 facility의 info 이상을 messages에 기록하되, mail과 authpriv는 제외"라는 의미다. `=` 기호를 붙이면(예: `mail.=info`) 정확히 그 수준만 잡는다. 이 facility.priority 짝 해석이 실기 단골이다.

```bash
# rsyslog.conf 수정 후 적용
systemctl restart rsyslog

# 직접 로그를 발생시켜 테스트
logger -p authpriv.notice "test message"
```

## logrotate: 로그 순환과 보존

- 로그는 계속 쌓이면 디스크를 가득 채운다.
- **`logrotate`**는 로그 파일을 주기적으로 잘라(rotate) 보관하고, 오래된 것은 삭제하거나 압축한다. 보통 cron으로 매일 실행된다.
- 설정은 `/etc/logrotate.conf`(전역)와 `/etc/logrotate.d/`(서비스별)에 있다.

```bash
# /etc/logrotate.d/myapp 예시
/var/log/myapp/*.log {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root adm
    postrotate
        systemctl reload myapp > /dev/null 2>&1 || true
    endscript
}
```

| 지시어 | 의미 |
|--------|------|
| `daily` / `weekly` / `monthly` | 순환 주기 |
| `rotate N` | 보관할 이전 로그 개수 (N개 넘으면 가장 오래된 것 삭제) |
| `compress` | 순환된 로그를 gzip 압축 |
| `delaycompress` | 한 주기 늦춰 압축 (직전 로그는 압축 안 함) |
| `missingok` | 로그 파일이 없어도 오류 내지 않음 |
| `notifempty` | 로그가 비어 있으면 순환하지 않음 |
| `create 모드 소유자 그룹` | 순환 후 새 빈 로그 파일을 지정 권한으로 생성 |
| `size N` | 지정 크기 초과 시 순환 |
| `postrotate ... endscript` | 순환 후 실행할 스크립트(보통 서비스 reload) |

> 💡 **rotate N의 의미**: `rotate 4` + `weekly`는 "매주 순환하며 최근 4개(약 4주치)를 보관"한다는 뜻이다. 순환되면 `myapp.log`→`myapp.log.1`→`myapp.log.2`...로 밀려나고, 5번째가 되면 가장 오래된 것이 삭제된다. `compress`가 있으면 `.gz`로 압축된다.

```bash
# 설정 문법 점검 + 강제 실행(디버그)
logrotate -d /etc/logrotate.conf      # -d: 디버그(실제 실행 안 함, 시뮬레이션)
logrotate -f /etc/logrotate.conf      # -f: 강제 즉시 실행
```

> 🔍 **직접 쳐보기**: `/etc/logrotate.d/`의 기존 파일(예: `syslog`)을 열어 어떤 지시어가 쓰였는지 보고, `logrotate -d`(디버그 모드)로 실제 파일을 건드리지 않고 어떤 동작이 일어날지 시뮬레이션해 보라. 또 `logger -p local0.err "hi"`로 메시지를 만든 뒤 `/var/log/messages`에서 추적해 facility.priority 동작을 눈으로 확인하라.

## 침입 탐지(IDS) — 뚫린 뒤를 알아채는 겹

- 앞의 세 겹은 "들어오지 못하게" 막고 "흔적을 남기는" 장치다.
- 그러나 허용된 포트로 정상 접속처럼 들어오는 공격은 막히지 않는다.
- **IDS**(Intrusion Detection System, 침입 탐지 시스템)는 그다음 겹으로, **이미 일어난 일의 흔적을 보고 침입을 알아채는** 도구다.
- 무엇을 감시하느냐에 따라 두 갈래로 나뉜다.

| 구분 | NIDS (네트워크 기반) | HIDS (호스트 기반) |
|------|----------------------|--------------------|
| 감시 대상 | 네트워크를 지나는 **패킷** | 그 서버 안의 **파일·로그·프로세스** |
| 설치 위치 | 스위치 미러 포트·게이트웨이 등 트래픽 길목 | 보호할 서버마다 각각 |
| 잘 잡는 것 | 포트 스캔, 익스플로잇 패킷, 웜 확산 | 시스템 파일 변조, 백도어 설치, 반복 로그인 실패 |
| 못 보는 것 | **암호화된 트래픽**의 내용 | 자기 호스트 밖에서 벌어지는 일 |
| 대표 도구 | **snort**, suricata | **tripwire**, **AIDE**, fail2ban(로그 기반) |

### fail2ban: 로그를 보고 자동으로 차단하기

- `fail2ban`은 로그 파일을 실시간 감시하다가 **정해진 시간 창 안에 실패 패턴이 임계치를 넘으면 그 출발지 IP를 방화벽 규칙으로 일정 시간 차단**한다.
- SSH 무차별 대입(brute force) 대응의 사실상 표준이다.
- 감시 단위 하나를 **jail**(감옥)이라 부른다 — "어떤 로그를(`logpath`) 어떤 필터로(`filter`) 보고, 몇 번 실패하면(`maxretry`) 얼마 동안(`bantime`) 막을지"를 묶은 한 벌이다.

| 파일 | 역할 |
|------|------|
| `/etc/fail2ban/jail.conf` | 배포판이 제공하는 원본. **직접 고치지 말 것**(패키지 갱신 시 덮어씀) |
| `/etc/fail2ban/jail.local` | 관리자 설정. jail.conf를 덮어쓰며 **여기에 작성하는 것이 원칙** |
| `/etc/fail2ban/jail.d/*.conf` | 서비스별로 나눠 쓰는 설정 조각 |
| `/etc/fail2ban/filter.d/*.conf` | 실패 로그를 알아보는 정규식(`failregex`) 정의 |
| `/etc/fail2ban/action.d/*.conf` | 실제 차단을 수행하는 동작(iptables·firewalld·nftables 등) |

```bash
# /etc/fail2ban/jail.local
[DEFAULT]
bantime  = 3600                       # 차단 유지 시간(초)
findtime = 600                        # 실패 횟수를 세는 시간 창(초)
maxretry = 5                          # 이 횟수를 넘으면 차단
ignoreip = 127.0.0.1/8 192.168.1.0/24 # 절대 차단하지 않을 대역

[sshd]
enabled  = true
port     = ssh
logpath  = /var/log/secure            # 데비안 계열은 /var/log/auth.log
```

```bash
systemctl enable --now fail2ban
fail2ban-client status                       # 활성 jail 목록
fail2ban-client status sshd                  # 해당 jail의 차단 IP 개수·목록
fail2ban-client set sshd unbanip 1.2.3.4     # 수동 차단 해제
fail2ban-client reload                       # 설정 다시 읽기
```

> ⚠️ **함정**: 설정을 `jail.conf`에 직접 쓰면 패키지 업데이트 때 통째로 덮어써 사라진다 — 반드시 **`jail.local`**(또는 `jail.d/`)에 작성한다. 또 `ignoreip`에 관리 대역을 넣지 않으면 암호 오타 몇 번으로 **관리자 본인이 차단**되고, `logpath`가 배포판과 어긋나면(RHEL 계열 `/var/log/secure` vs 데비안 계열 `/var/log/auth.log`) jail이 떠 있어도 아무것도 잡지 못한다.

### snort: 패킷을 보는 NIDS

- `snort`는 네트워크를 지나는 패킷을 룰과 대조해 공격 시그니처를 찾아내는 대표적 오픈소스 NIDS다.
- 실행 방식이 **세 가지 모드**로 나뉘는 점이 출제 포인트다.

| 모드 | 하는 일 | 예 |
|------|---------|-----|
| 스니퍼(sniffer) | 패킷을 잡아 화면에 출력만 | `snort -v` (`-d` 페이로드, `-e` 링크 계층 헤더 추가) |
| 패킷 로거(packet logger) | 잡은 패킷을 파일로 저장 | `snort -l /var/log/snort` |
| **NIDS** | 룰과 대조해 경고 발생 | `snort -c /etc/snort/snort.conf` |

- 룰 한 줄은 **룰 헤더 + 룰 옵션** 두 토막이다.

```
alert tcp any any -> 192.168.1.0/24 80 (msg:"passwd access"; content:"/etc/passwd"; sid:1000001; rev:1;)
└─ 헤더: 동작 프로토콜 출발지IP 포트 방향 목적지IP 포트 ─┘ └──────────── 옵션 ────────────┘
```

- **동작**: `alert`(경고+기록), `log`(기록만), `pass`(무시). 인라인(IPS) 모드에서는 `drop`·`reject`도 쓴다
- **방향**: `->`(단방향), `<>`(양방향)
- **옵션**: `msg`(경고 문구), `content`(페이로드에서 찾을 문자열), `sid`(룰 고유 번호, 사용자 정의는 1000000 이상), `rev`(룰 개정 번호)

### tripwire와 AIDE: 파일 무결성을 지키는 HIDS

- 침입자가 남기는 가장 확실한 흔적은 **시스템 파일의 변조**다 — `/bin/ls`가 바꿔치기되거나 `/etc/passwd`에 계정이 몰래 추가되는 식.
- `tripwire`와 `AIDE`(Advanced Intrusion Detection Environment)는 감시 대상 파일의 크기·권한·소유자·해시를 **기준 데이터베이스**로 떠 둔다.
- 이후 검사에서 현재 상태와 비교해 달라진 것을 보고한다.

| 단계 | tripwire | AIDE |
|------|----------|------|
| 설정·정책 | `/etc/tripwire/twcfg.txt`, 정책 `twpol.txt` | `/etc/aide.conf` |
| 기준 DB 생성 | `tripwire --init` | `aide --init` |
| 무결성 검사 | `tripwire --check` | `aide --check` |
| 정상 변경 반영 | `tripwire --update` | `aide --update` |

- tripwire는 설정·정책을 사이트 키와 로컬 키로 서명해 보관하고(`twadmin`), 검사 리포트는 `twprint`로 읽는다.
- AIDE는 기준 DB를 `/var/lib/aide/aide.db.gz`에 두며, `--init`이 만든 `aide.db.new.gz`를 관리자가 직접 이름을 바꿔 승격시키는 방식이다.

> ⚠️ **함정**: 기준 DB는 **시스템이 확실히 깨끗할 때(설치 직후) 만들어야** 의미가 있다. 이미 침해된 상태에서 `--init`을 하면 백도어까지 "정상"으로 등록되어 도구가 무력해진다. 또 DB와 설정을 그 서버의 쓰기 가능한 위치에만 두면 침입자가 함께 조작할 수 있으므로 읽기 전용 매체나 외부 저장소에 보관하는 것이 원칙이다.

> 📚 **실무 신호**: 세 도구는 역할이 겹치지 않는다. `fail2ban`은 **로그에 드러난 반복 실패를 즉시 차단**(대응), `snort`는 **네트워크 패킷에서 공격 시그니처를 탐지**(NIDS), `tripwire`/`AIDE`는 **파일이 바뀌었는지 사후 확인**(HIDS)한다. 그래서 실무에서는 셋을 함께 배치한다.

내일은 한 주를 종합 복습한다.

## 📖 용어

- **TCP Wrapper** : `libwrap`을 쓰는 서비스에 한해 출발지 호스트를 검사해 접근을 통제하는 장치.
- **hosts.allow / hosts.deny** : 각각 허용·거부 호스트 목록. **allow를 먼저 보고**, 둘 다 없으면 통과시킨다.
- **DAC / MAC** : 소유자가 권한을 마음대로 바꿀 수 있는 임의 접근 제어 / 커널이 정책을 강제해 root도 못 벗어나는 강제 접근 제어.
- **SELinux 모드** : `enforcing`(차단+기록), `permissive`(기록만), `disabled`(끔). `setenforce`로는 disabled로 못 간다.
- **보안 컨텍스트** : 파일·프로세스에 붙는 `user:role:type:level` 라벨. 실제 판정은 **type**이 좌우한다.
- **chcon / restorecon** : 컨텍스트를 직접 바꾸는 임시 명령 / 정책에 정의된 원래 컨텍스트로 되돌리는 명령.
- **facility.priority** : rsyslog에서 "로그의 출처.심각도"를 지정하는 짝. 지정한 **수준 이상**이 모두 기록된다.
- **wtmp / btmp / lastlog** : 로그인 성공·실패·마지막 로그인 기록. 바이너리라 `last`·`lastb`·`lastlog`로만 읽는다.
- **logrotate** : 로그를 주기적으로 잘라 보관·압축·삭제하는 도구. `rotate N`은 보관할 이전 로그 개수다.
- **NIDS / HIDS** : 네트워크 패킷을 감시하는 침입 탐지(snort) / 호스트의 파일·로그를 감시하는 침입 탐지(tripwire·AIDE).
- **fail2ban jail** : "어떤 로그를 몇 번 실패까지 봐주고 얼마나 차단할지"를 묶은 감시 단위. 설정은 `jail.local`에 쓴다.

## 📝 연습 문제

**문제 1.** TCP Wrapper에서 접근 제어 파일을 검사하는 순서로 옳은 것은?

A) hosts.deny를 먼저 검사하고, 없으면 hosts.allow를 검사한다
B) hosts.allow를 먼저 검사해 일치하면 허용하고, 없으면 hosts.deny를 검사한다
C) 두 파일을 동시에 검사해 거부가 하나라도 있으면 차단한다
D) hosts.allow만 검사하고 hosts.deny는 무시한다

**정답: B**

해설: TCP Wrapper는 `/etc/hosts.allow`를 먼저 검사해 일치하면 허용하고 즉시 종료한다. 거기에 없으면 `/etc/hosts.deny`를 검사해 일치하면 거부하며, 양쪽 모두에 없으면 기본적으로 허용한다. 따라서 allow가 deny보다 우선한다.

---

**문제 2.** SELinux의 모드 중 정책 위반을 차단하지 않고 로그만 남기는 것은?

A) enforcing
B) permissive
C) disabled
D) targeted

**정답: B**

해설: `permissive` 모드는 정책을 강제하지 않고 위반 사항을 로그로만 기록해 디버깅에 쓰인다. `enforcing`은 위반을 실제로 차단하며, `disabled`는 SELinux를 완전히 끈다. `targeted`는 모드가 아니라 정책 유형의 하나다.

---

**문제 3.** 현재 SELinux를 일시적으로 permissive 모드로 전환하는 명령으로 옳은 것은?

A) setenforce 0
B) setenforce 1
C) getenforce 0
D) sestatus permissive

**정답: A**

해설: `setenforce 0`은 permissive, `setenforce 1`은 enforcing으로 일시 전환한다(재부팅 시 `/etc/selinux/config` 값으로 원복). `getenforce`는 현재 모드를 조회만 하며, `sestatus`는 상세 상태를 보여줄 뿐 모드를 바꾸지 않는다. 참고로 `setenforce`로는 disabled로 갈 수 없다.

---

**문제 4.** `/var/log` 아래 파일 중 로그인 실패 기록을 담으며 `lastb` 명령으로 조회해야 하는 것은?

A) /var/log/wtmp
B) /var/log/btmp
C) /var/log/messages
D) /var/log/secure

**정답: B**

해설: `btmp`는 로그인 실패 기록을 담은 바이너리 파일로 `lastb`로 조회한다. `wtmp`는 로그인 성공 기록(`last`), `messages`는 일반 시스템 메시지(텍스트), `secure`는 인증 관련 로그(텍스트)다. wtmp/btmp는 바이너리라 cat으로 열면 깨진다.

---

**문제 5.** rsyslog.conf의 `mail.err /var/log/maillog` 설정에 대한 해석으로 옳은 것은?

A) mail facility의 err 수준만 정확히 기록한다
B) mail facility의 err 수준 이상(err, crit, alert, emerg)을 기록한다
C) 모든 facility의 err를 기록한다
D) mail facility를 로그에서 제외한다

**정답: B**

해설: priority를 지정하면 그 수준 **이상**의 메시지가 모두 기록된다. 따라서 `mail.err`는 err, crit, alert, emerg를 잡는다. 정확히 그 수준만 잡으려면 `mail.=err`처럼 `=`를 붙여야 하고, 제외는 `mail.none`이다.

---

**문제 6.** logrotate 설정에서 보관할 이전 로그 파일의 개수를 지정하는 지시어는?

A) compress
B) rotate
C) missingok
D) notifempty

**정답: B**

해설: `rotate N`은 보관할 이전 로그 개수를 지정하며, N개를 넘으면 가장 오래된 로그가 삭제된다. `compress`는 순환된 로그를 압축, `missingok`은 로그가 없어도 오류를 내지 않음, `notifempty`는 로그가 비어 있으면 순환하지 않는 옵션이다.

---

**문제 7.** SELinux에서 파일의 보안 컨텍스트를 확인하는 옵션으로 옳은 것은?

A) ls -l
B) ls -Z
C) ls -a
D) ls -i

**정답: B**

해설: `ls -Z`는 파일의 SELinux 보안 컨텍스트(`user:role:type:level`)를 표시한다. 프로세스는 `ps -Z`로 본다. `ls -l`은 일반 권한, `ls -a`는 숨김 파일 포함, `ls -i`는 inode 번호를 보여준다.

---
