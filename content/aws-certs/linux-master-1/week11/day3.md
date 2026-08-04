# Day 3 - 방화벽: iptables와 firewalld

## 📌 핵심 정리

- 리눅스 방화벽의 엔진은 커널의 **netfilter**. 이를 직접 제어하는 저수준 도구가 **iptables**, 그 위의 고수준 관리자가 **firewalld**다.
- iptables 구조는 **테이블 → 체인 → 규칙**. filter 테이블의 체인은 `INPUT`(들어옴)·`OUTPUT`(나감)·`FORWARD`(통과)다.
- 규칙은 **위에서 아래로 순서대로** 매칭되고, 일치하면 즉시 처리된다. 어디에도 안 걸리면 **기본 정책(-P)**이 적용된다.
- `DROP`은 조용히 버리고(무응답), `REJECT`는 거부 응답을 보낸다. `-A`는 끝에 추가, `-I`는 앞에 삽입 — 순서가 결과를 바꾼다.
- firewalld는 **zone**(신뢰 수준 묶음)으로 관리한다. `firewall-cmd`의 최대 함정은 **런타임 vs `--permanent`(+ `--reload`)** 구분이다.

## netfilter와 iptables: 테이블과 체인의 구조

- iptables는 커널의 netfilter를 제어해 패킷을 검사하고 처리한다.
- 구조는 **테이블(table) → 체인(chain) → 규칙(rule)**의 3계층이다.
- 가장 많이 쓰는 테이블은 **filter**(패킷 허용/차단 결정). 옵션 없이 iptables를 쓰면 이 테이블이 기본 대상이다.
- 다른 테이블: NAT 처리용 **nat**, 패킷 변조용 **mangle**.
- filter 테이블에는 세 개의 내장 체인이 있고, 각 체인은 패킷의 흐름 방향에 따라 적용된다.

| 체인 | 적용 대상 |
|------|-----------|
| `INPUT` | 이 시스템으로 **들어오는**(목적지가 나) 패킷 |
| `OUTPUT` | 이 시스템에서 **나가는**(출발지가 나) 패킷 |
| `FORWARD` | 이 시스템을 **거쳐 가는**(라우터 역할 시) 패킷 |

> 💡 **핵심**: 방향을 정확히 구분하라. 외부에서 우리 서버로 들어오는 접속(웹·SSH 요청 등)을 막거나 허용하는 건 **INPUT** 체인이다. 시험에서 "외부 SSH 접속을 차단" → INPUT 체인 규칙. "이 호스트가 다른 곳으로 나가는 트래픽 제어" → OUTPUT 체인. "게이트웨이를 통과하는 트래픽" → FORWARD 체인.

- 각 체인의 규칙들은 **위에서 아래로 순서대로** 적용된다.
- 패킷이 어떤 규칙과 일치하면 그 규칙의 타깃(처리 동작)이 실행된다.
- 어떤 규칙과도 일치하지 않으면 **기본 정책(policy)**이 적용된다.
- 이 "순서대로 매칭, 일치하면 즉시 처리"가 iptables를 이해하는 가장 중요한 원리다.

## 기본 정책과 타깃: ACCEPT, DROP, REJECT

- 각 체인은 **기본 정책**을 가진다. 규칙에 걸리지 않은 패킷의 운명을 결정하는 최후의 규칙이다.

| 타깃 | 의미 |
|------|------|
| `ACCEPT` | 패킷을 허용한다 |
| `DROP` | 패킷을 조용히 버린다 (응답 없음 — 상대는 무응답으로 느낌) |
| `REJECT` | 패킷을 거부하고 거부 응답을 보낸다 (상대는 즉시 거부됨을 앎) |
| `LOG` | 패킷 정보를 로그에 남기고 다음 규칙으로 넘어감 |

> 🔍 **DROP vs REJECT**: 둘 다 차단이지만 응답이 다르다. `DROP`은 패킷을 묵묵히 버려서 상대는 타임아웃까지 기다려야 한다(포트 스캔을 방해하는 효과). `REJECT`는 "거부됨"이라는 ICMP 응답을 즉시 보내 상대가 바로 알게 한다. 보안상 외부 노출 포트는 DROP, 내부망은 사용자 편의를 위해 REJECT를 쓰는 식으로 구분하기도 한다.

```bash
# 체인의 기본 정책을 DROP으로 설정 (-P = policy)
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT
```

> ⚠️ **원격 작업의 함정**: 원격 SSH로 접속한 상태에서 `iptables -P INPUT DROP`을 먼저 실행하면, SSH 허용 규칙을 추가하기 전에 **자기 자신이 끊긴다**. 반드시 SSH 허용 규칙(`-A INPUT -p tcp --dport 22 -j ACCEPT`)을 먼저 넣은 뒤 기본 정책을 DROP으로 바꿔야 한다. 실무·시험 모두 단골 함정이다.

## 규칙 작성: -A, -j, 그리고 매칭 조건

- 규칙을 추가·삭제하는 핵심 옵션을 정확히 구분하는 것이 실기의 관건이다.

| 옵션 | 의미 |
|------|------|
| `-A 체인` | 체인 **끝에 규칙 추가**(Append) |
| `-I 체인 [번호]` | 체인 **맨 앞(또는 지정 위치)에 삽입**(Insert) |
| `-D 체인` | 규칙 **삭제**(Delete) |
| `-R 체인 번호` | 규칙 **교체**(Replace) |
| `-L` | 규칙 **목록 출력**(List) |
| `-F` | 체인의 모든 규칙 **삭제**(Flush) |
| `-P 체인 타깃` | 기본 **정책 설정**(Policy) |
| `-j 타깃` | 일치 시 수행할 **동작 지정**(Jump) |

- 매칭 조건을 지정하는 옵션도 함께 외워야 한다.

| 옵션 | 의미 |
|------|------|
| `-p` | 프로토콜 (tcp, udp, icmp) |
| `-s` | 출발지(source) IP/네트워크 |
| `-d` | 목적지(destination) IP/네트워크 |
| `--sport` | 출발지 포트 |
| `--dport` | 목적지 포트 |
| `-i` | 입력 인터페이스 (예: eth0) |
| `-o` | 출력 인터페이스 |

- 다음은 전형적인 규칙 구성이다.

```bash
# 22번 포트(SSH) TCP 접속 허용
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# 80번 포트(HTTP) 허용
iptables -A INPUT -p tcp --dport 80 -j ACCEPT

# 특정 IP(192.168.1.50)에서 오는 모든 패킷 차단
iptables -A INPUT -s 192.168.1.50 -j DROP

# 루프백(자기 자신) 트래픽 허용
iptables -A INPUT -i lo -j ACCEPT

# 이미 연결된 세션의 응답 패킷 허용 (상태 추적)
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
```

> 💡 **-A vs -I의 순서 차이**: 체인은 위→아래로 매칭하므로 규칙의 위치가 결과를 바꾼다. `-A`는 맨 끝에 붙이고, `-I`는 맨 앞에 끼워 넣는다. 이미 "전부 DROP" 규칙이 위에 있다면, 그 뒤에 `-A`로 ACCEPT를 추가해봐야 이미 DROP에 걸려 도달하지 못한다. 이럴 땐 `-I`로 ACCEPT를 앞에 삽입해야 한다.

## 규칙 확인과 저장

- 작성한 규칙을 확인하고, 재부팅 후에도 유지되도록 저장하는 법을 알아야 한다.

```bash
# 규칙 목록 보기 (-n: IP를 이름 해석 없이 숫자로, -v: 상세, --line-numbers: 줄번호)
iptables -L -n -v --line-numbers

# 특정 체인만 보기
iptables -L INPUT -n

# 모든 규칙 초기화
iptables -F

# 규칙 저장 (RHEL 계열) — 재부팅 후에도 유지
iptables-save > /etc/sysconfig/iptables
service iptables save
```

> ⚠️ **휘발성 주의**: iptables 규칙은 메모리에만 존재한다. 저장하지 않고 재부팅하면 모두 사라진다. RHEL 계열은 `service iptables save` 또는 `iptables-save`로 영속화해야 한다. 이를 모르고 "규칙이 사라졌다"고 당황하는 일이 흔하다.

## firewalld: zone 기반의 동적 방화벽

- iptables의 단점: 규칙을 하나씩 다뤄 직관적이지 않고, 규칙을 바꿀 때마다 전체를 다시 적용해 기존 연결이 끊길 수 있다.
- RHEL 7부터 기본이 된 **firewalld**는 이를 개선한 고수준 관리 도구다.
- firewalld의 핵심 개념은 **zone(영역)** — "네트워크 연결의 신뢰 수준"을 미리 정의해 둔 규칙 묶음이다.
- 인터페이스나 출발지를 특정 zone에 배정하면 그 zone의 규칙이 적용된다.

| zone | 신뢰 수준 |
|------|-----------|
| `drop` | 모든 들어오는 연결 차단, 응답 없음 (가장 폐쇄적) |
| `block` | 들어오는 연결 거부(REJECT 응답) |
| `public` | (기본) 신뢰하지 않는 공개 네트워크. 선택된 연결만 허용 |
| `home` / `internal` | 신뢰하는 내부망. 대부분 허용 |
| `trusted` | 모든 트래픽 허용 (가장 개방적) |

> 💡 **zone의 발상**: iptables가 "규칙 한 줄 한 줄"을 다룬다면, firewalld는 "이 네트워크 카드는 공개망(public)이고, 저 카드는 내부망(internal)"처럼 **상황별 규칙 묶음**을 적용한다. 노트북을 공항 와이파이에 연결하면 public, 집에 오면 home zone으로 바꾸는 식의 유연함이 핵심이다.

## firewall-cmd: firewalld를 다루는 명령

- firewalld는 `firewall-cmd` 명령으로 제어한다.
- 가장 중요한 개념은 **런타임(runtime)과 영구(permanent)의 구분**이다.
- 기본적으로 `firewall-cmd`의 변경은 **런타임에만 적용**되어 재부팅하면 사라진다.
- 영구 적용하려면 **`--permanent`**를 붙인다. 단 즉시 반영되지 않으므로 `--reload`로 다시 읽어야 한다.

```bash
# 현재 활성 zone과 설정 확인
firewall-cmd --get-active-zones
firewall-cmd --list-all

# 기본 zone 확인/변경
firewall-cmd --get-default-zone
firewall-cmd --set-default-zone=public

# 서비스 허용 (런타임 — 재부팅 시 사라짐)
firewall-cmd --add-service=http

# 서비스 영구 허용 (재부팅 후 유지)
firewall-cmd --add-service=http --permanent

# 포트 직접 허용 (영구)
firewall-cmd --add-port=8080/tcp --permanent

# 영구 설정을 즉시 반영
firewall-cmd --reload
```

| 명령/옵션 | 의미 |
|-----------|------|
| `--list-all` | 현재 zone의 전체 설정 보기 |
| `--add-service=이름` | 서비스(http, ssh 등) 허용 |
| `--remove-service=이름` | 서비스 허용 제거 |
| `--add-port=포트/프로토콜` | 특정 포트 허용 |
| `--permanent` | 영구 적용 (재부팅 후 유지) |
| `--reload` | 영구 설정을 런타임에 다시 로드 |
| `--get-services` | 미리 정의된 서비스 목록 보기 |

> ⚠️ **--permanent 함정**: `firewall-cmd --add-service=http --permanent`만 실행하면 설정 파일에는 기록되지만 **지금 당장은 적용되지 않는다**. 반드시 `firewall-cmd --reload`를 이어서 해야 현재 세션에도 반영된다. 반대로 `--permanent` 없이 추가하면 지금은 되지만 재부팅 시 사라진다. "둘 다 하려면 한 번은 런타임, 한 번은 permanent"로 두 번 실행하거나, permanent 후 reload하는 방식을 쓴다.

## iptables vs firewalld 정리

| 항목 | iptables | firewalld |
|------|----------|-----------|
| 추상화 수준 | 저수준 (규칙 직접 제어) | 고수준 (zone 단위 관리) |
| 핵심 개념 | 테이블·체인·규칙 | zone, service |
| 제어 명령 | `iptables` | `firewall-cmd` |
| 변경 적용 | 전체 재적용(연결 끊김 가능) | 동적 적용(기존 연결 유지) |
| 영속화 | `service iptables save` | `--permanent` + `--reload` |
| 관계 | netfilter를 직접 제어 | 내부적으로 netfilter(nftables)를 사용 |

> 🔍 **둘은 함께 쓰면 안 된다**: firewalld와 iptables 서비스를 동시에 활성화하면 충돌한다. RHEL 7+에서는 firewalld가 기본이며, iptables를 직접 쓰려면 firewalld를 끄고(`systemctl disable firewalld`) iptables 서비스를 활성화해야 한다. 둘 다 결국 커널의 netfilter를 제어하므로 한쪽만 관리자로 써야 한다.

> 🔍 **직접 쳐보기**: 테스트 VM에서 `firewall-cmd --add-service=http`(런타임만)를 한 뒤 `firewall-cmd --list-services`로 확인하고, 재부팅 후 사라지는 걸 보라. 그다음 `--permanent`를 붙여 다시 하고 `--reload`까지 거쳐 영속됨을 확인하면 런타임/영구의 차이가 체감된다. iptables 쪽은 `iptables -L -n --line-numbers`로 줄번호를 본 뒤 `-I`와 `-A`의 위치 차이를 실험해 보라.

내일은 TCP Wrapper, SELinux, 그리고 로그 관리로 보안의 폭을 넓힌다.

## 📖 용어

- **netfilter** : 리눅스 커널에 내장된 패킷 필터링 프레임워크. iptables·firewalld가 모두 이것을 제어한다.
- **iptables** : netfilter를 규칙 단위로 직접 제어하는 전통적 명령. 테이블→체인→규칙 3계층으로 동작한다.
- **체인(chain)** : 패킷 흐름 방향별 규칙 묶음. `INPUT`(들어옴)·`OUTPUT`(나감)·`FORWARD`(통과).
- **기본 정책(policy)** : 어떤 규칙에도 걸리지 않은 패킷을 어떻게 할지 정하는 최후의 규칙. `-P`로 지정한다.
- **DROP** : 패킷을 조용히 버려 상대가 타임아웃까지 기다리게 만드는 차단 방식.
- **REJECT** : 거부 응답을 즉시 보내 상대가 바로 차단됐음을 알게 하는 차단 방식.
- **-A / -I** : 규칙을 체인 맨 끝에 붙이기(Append) / 맨 앞에 끼워 넣기(Insert). 순서가 결과를 바꾼다.
- **firewalld** : zone 단위로 방화벽을 관리하는 RHEL 7+ 기본 도구. 규칙 변경 시 기존 연결을 끊지 않는다.
- **zone(영역)** : 네트워크의 신뢰 수준별 규칙 묶음. `public`(기본)·`home`·`trusted`·`drop` 등이 있다.
- **--permanent / --reload** : 설정을 재부팅 후에도 유지하는 옵션 / 그 영구 설정을 현재 세션에 즉시 반영하는 명령.

## 📝 연습 문제

**문제 1.** iptables의 filter 테이블에서 외부에서 이 시스템으로 들어오는 패킷을 처리하는 체인은?

A) OUTPUT
B) FORWARD
C) INPUT
D) PREROUTING

**정답: C**

해설: `INPUT` 체인은 목적지가 이 시스템인, 즉 들어오는 패킷을 다룬다. `OUTPUT`은 나가는 패킷, `FORWARD`는 이 시스템을 거쳐 가는(라우팅) 패킷을 처리한다. `PREROUTING`은 nat/mangle 테이블의 체인으로 filter 테이블에는 없다.

---

**문제 2.** iptables 타깃 중 패킷을 버리되 상대에게 아무 응답도 보내지 않는 것은?

A) ACCEPT
B) REJECT
C) DROP
D) LOG

**정답: C**

해설: `DROP`은 패킷을 조용히 버려 상대가 타임아웃까지 무응답을 겪게 한다. `REJECT`는 거부 응답(ICMP)을 보내 상대가 즉시 거부를 알게 한다. `ACCEPT`는 허용, `LOG`는 로그만 남기고 다음 규칙으로 넘어간다.

---

**문제 3.** 22번 포트(SSH)로 들어오는 TCP 접속을 허용하는 iptables 명령으로 옳은 것은?

A) iptables -A INPUT -p tcp --dport 22 -j ACCEPT
B) iptables -A OUTPUT -p udp --sport 22 -j DROP
C) iptables -P INPUT -p tcp --dport 22 -j ACCEPT
D) iptables -A FORWARD -p tcp --dport 22 -j REJECT

**정답: A**

해설: 들어오는 SSH 접속이므로 `INPUT` 체인, 프로토콜은 `tcp`, 목적지 포트는 `--dport 22`, 동작은 `-j ACCEPT`다. B는 OUTPUT/udp로 방향과 프로토콜이 틀리고, C의 `-P`는 정책 설정용이라 포트 조건과 함께 쓰지 않으며, D는 FORWARD 체인에 거부 규칙이다.

---

**문제 4.** iptables에서 규칙을 체인의 맨 앞에 삽입하는 옵션과 맨 끝에 추가하는 옵션을 옳게 짝지은 것은?

A) 삽입 -A, 추가 -I
B) 삽입 -I, 추가 -A
C) 삽입 -D, 추가 -R
D) 삽입 -F, 추가 -P

**정답: B**

해설: `-I`(Insert)는 체인의 맨 앞(또는 지정 위치)에 규칙을 삽입하고, `-A`(Append)는 맨 끝에 추가한다. 위→아래 매칭 순서 때문에 위치가 결과를 바꾼다. `-D`는 삭제, `-R`은 교체, `-F`는 전체 초기화, `-P`는 정책 설정이다.

---

**문제 5.** firewalld에서 변경을 재부팅 후에도 유지되도록 영구 적용하는 옵션은?

A) --runtime
B) --temporary
C) --permanent
D) --persistent

**정답: C**

해설: `firewall-cmd`의 변경은 기본적으로 런타임(휘발성)이며, `--permanent`를 붙여야 설정 파일에 기록되어 재부팅 후에도 유지된다. 단, `--permanent` 변경은 즉시 반영되지 않으므로 `--reload`로 다시 읽어야 현재 세션에도 적용된다.

---

**문제 6.** firewalld의 zone 중 신뢰 수준이 가장 높아 모든 트래픽을 허용하는 것은?

A) drop
B) block
C) public
D) trusted

**정답: D**

해설: `trusted` zone은 모든 트래픽을 허용하는 가장 개방적인 영역이다. `drop`은 모든 연결을 응답 없이 차단(가장 폐쇄적), `block`은 거부 응답을 보내며 차단, `public`은 기본 zone으로 선택된 서비스만 허용한다.

---

**문제 7.** iptables 규칙을 재부팅 후에도 유지하려 할 때 RHEL 계열에서 수행해야 하는 작업은?

A) 규칙은 자동으로 영구 저장되므로 별도 작업이 필요 없다
B) service iptables save 또는 iptables-save로 저장한다
C) firewall-cmd --reload를 실행한다
D) exportfs -ra를 실행한다

**정답: B**

해설: iptables 규칙은 메모리에만 존재하므로 저장하지 않으면 재부팅 시 사라진다. RHEL 계열에서는 `service iptables save` 또는 `iptables-save > /etc/sysconfig/iptables`로 영속화한다. `firewall-cmd --reload`는 firewalld용, `exportfs`는 NFS용이다.

---
