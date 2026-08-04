# Day 2 - DHCP와 NTP: 주소를 나눠 주고 시계를 맞추는 두 서비스

## 📌 핵심 정리

- **DHCP는 "공간(주소)"을, NTP는 "시간"을 네트워크 전체에 자동 배포하는 인프라 서비스**다.
- DHCP는 **DORA(Discover → Offer → Request → Ack)** 4단계로 IP·게이트웨이·DNS를 **임대(lease)** 형태로 내려 준다. 포트는 서버 67 / 클라이언트 68(UDP).
- **DISCOVER는 브로드캐스트라 라우터를 넘지 못한다** → 다른 서브넷은 **DHCP 릴레이**가 필요하다.
- `dhcpd.conf`에서 **`range`가 동적 풀**, **`host` + `hardware ethernet`(MAC) + `fixed-address`가 고정 예약**. 고정 IP는 풀 밖에 두는 게 안전하다.
- NTP의 **stratum은 숫자가 작을수록 정확**(0은 기준 시계 자체, 1이 1차 서버, **16은 미동기**). 현대 리눅스 표준은 **chrony**이며 `chronyc sources`·`chronyc tracking`·`timedatectl`로 본다.

## DHCP가 푸는 문제 — 수동 IP 관리의 한계

- IP를 손으로 일일이 박으면 생기는 문제들:
  - 같은 IP를 두 대에 적어 **충돌(IP conflict)**이 난다.
  - 노트북이 회의실을 옮길 때마다 **재설정**해야 한다.
  - 수백 대 규모에서는 관리 자체가 불가능하다.
- DHCP는 IP 주소 풀(pool)을 서버가 중앙에서 관리하고, 클라이언트가 부팅할 때마다 **임대(lease)** 형태로 빌려 준다.

| 항목 | 수동 설정 | DHCP |
|------|-----------|------|
| 주소 할당 | 사람이 직접 입력 | 서버가 자동 배분 |
| 충돌 위험 | 높음 | 서버가 추적해 방지 |
| 이동성 | 매번 재설정 | 어디서든 자동 |
| 부가 정보 | 일일이 입력 | 게이트웨이·DNS도 함께 전달 |

- DHCP는 IP뿐 아니라 **서브넷 마스크·기본 게이트웨이·DNS 서버·도메인 이름** 같은 설정 일체를 함께 내려 준다.
- 즉 클라이언트는 IP 하나가 아니라 **"네트워크에 참여하는 데 필요한 모든 좌표"**를 한 번에 받는다.

> 💡 **개념**: DHCP가 주는 것은 소유가 아니라 **임대(lease)**다. 일정 기간(lease time)만 빌려 주고, 클라이언트는 절반쯤 지나면 갱신(renew)을 시도한다. 그래서 떠난 기기의 IP는 시간이 지나면 회수되어 재활용된다. 정적 IP가 아닌 한 "이 IP는 영원히 내 것"이 아니라는 점이 핵심이다.

## DORA — DHCP 4단계 핸드셰이크

- 클라이언트가 IP를 받는 과정은 네 단계이며, 머리글자를 따 **DORA**라 부른다.
- 시험 단골이므로 **순서와 방향**을 정확히 외운다.

| 단계 | 메시지 | 보내는 쪽 | 방향 | 의미 |
|------|--------|-----------|------|------|
| D | DISCOVER | 클라이언트 | 브로드캐스트 | "DHCP 서버 있나요?" |
| O | OFFER | 서버 | (유니/브로드캐스트) | "이 IP 어때요?" |
| R | REQUEST | 클라이언트 | 브로드캐스트 | "그 IP 쓸게요" |
| A | ACK | 서버 | | "확정. 임대해 드림" |

```
[클라이언트]                          [DHCP 서버]
     |---- DISCOVER (브로드캐스트) ------->|   아직 IP 없음 → 0.0.0.0에서 출발
     |<--- OFFER (제안 IP 포함) -----------|
     |---- REQUEST (수락 통보) ----------->|
     |<--- ACK (임대 확정) ----------------|
     |          이제 IP 사용 가능           |
```

- 첫 DISCOVER는 클라이언트가 아직 IP가 없으므로 **브로드캐스트**(255.255.255.255)로 나간다.
- DHCP 서버가 여러 대면 각각 OFFER를 보낼 수 있다. 클라이언트는 보통 **가장 먼저 도착한 제안**을 택한다.
- REQUEST에 "어느 서버의 제안을 받아들였는지"를 명시해 **나머지 서버에게는 거절을 알린다.**

> 🔍 **더 깊이**: DHCP는 UDP를 쓰며 서버는 67번, 클라이언트는 68번 포트를 사용한다. 클라이언트가 IP가 없는 상태에서 통신해야 하므로 출발지 IP는 `0.0.0.0`, 목적지는 브로드캐스트가 된다. 또한 브로드캐스트는 라우터를 넘지 못하므로, 다른 서브넷의 DHCP 서버를 쓰려면 중간 라우터에 **DHCP 릴레이(relay agent)**를 설정해 요청을 대신 전달하게 해야 한다. "DHCP는 브로드캐스트라 라우터 너머는 릴레이 필요"가 핵심 포인트다.

## dhcpd.conf — DHCP 서버 설정의 핵심 지시어

- 리눅스 DHCP 서버는 **패키지 `dhcp`, 데몬 `dhcpd`, 설정 파일 `/etc/dhcp/dhcpd.conf`**로 구성된다.

```bash
# 설치
yum install dhcp-server

# 데몬 제어
systemctl start dhcpd
systemctl enable dhcpd

# 임대 현황 확인
cat /var/lib/dhcpd/dhcpd.leases
```

- 설정 파일의 뼈대는 다음과 같다.

```text
# 전역 기본값
default-lease-time 600;          # 기본 임대 시간(초)
max-lease-time 7200;             # 최대 임대 시간(초)
authoritative;                   # 이 네트워크의 공식 DHCP 서버 선언

subnet 192.168.1.0 netmask 255.255.255.0 {
    range 192.168.1.100 192.168.1.200;        # 배분할 IP 범위(pool)
    option routers 192.168.1.1;               # 기본 게이트웨이
    option subnet-mask 255.255.255.0;         # 서브넷 마스크
    option domain-name-servers 192.168.1.10;  # DNS 서버
    option domain-name "example.com";         # 도메인 이름
}

# 특정 장비에 고정 IP 할당(MAC 기준)
host printer {
    hardware ethernet 00:1A:2B:3C:4D:5E;      # 대상 MAC 주소
    fixed-address 192.168.1.50;               # 항상 이 IP를 줌
}
```

| 지시어 | 역할 |
|--------|------|
| `range` | 동적으로 배분할 IP 주소 범위(풀) |
| `default-lease-time` / `max-lease-time` | 임대 기간(초) 기본값·최대값 |
| `option routers` | 클라이언트에게 알려 줄 기본 게이트웨이 |
| `option domain-name-servers` | DNS 서버 주소 |
| `option subnet-mask` | 서브넷 마스크 |
| `host` + `hardware ethernet` + `fixed-address` | 특정 MAC에 고정 IP 예약 |
| `authoritative` | 이 서브넷의 공인 DHCP 서버임을 선언 |

> ⚠️ **함정**: 고정 IP를 예약할 때 핵심은 `hardware ethernet`(MAC 주소)으로 장비를 식별하고 `fixed-address`로 줄 IP를 지정하는 것이다. 이때 **고정 IP는 `range`로 지정한 동적 풀 밖에 두는 것이 안전하다** — 풀 안에 두면 동적 배분과 충돌할 수 있다. 또한 `range`의 IP 범위가 게이트웨이나 서버 IP를 포함하지 않도록 해야 한다.

> 📚 **유래·사례**: DHCP의 전신은 BOOTP(Bootstrap Protocol)다. BOOTP는 디스크 없는 워크스테이션이 부팅할 때 IP를 받으려고 만들어졌는데, 주소를 영구 할당하고 수동 매핑이 필요했다. DHCP는 여기에 "임대"와 "자동 풀 관리" 개념을 더해 확장한 것이라, 지금도 같은 포트(67/68)와 메시지 형식의 상당 부분을 공유한다. 그래서 `dhcpd.conf`에서 BOOTP 호환 옵션을 종종 보게 된다.

## DHCP 클라이언트 — 받는 쪽

- 클라이언트 측에서는 **`dhclient`**로 IP를 요청·갱신한다.

```bash
# IP 임대 요청 (지정 인터페이스)
dhclient eth0

# 현재 임대 해제(반납)
dhclient -r eth0

# 임대 정보 확인
cat /var/lib/dhclient/dhclient.leases
```

- 리눅스가 **169.254.x.x(APIPA, 링크 로컬)** IP를 들고 있다면 "DHCP 서버를 찾지 못했다"는 신호다.
- 이 경우 **DHCP 서버·릴레이·네트워크 연결**을 점검한다.

## NTP와 시간 동기화 — 왜 시계를 맞춰야 하는가

- 서버 시계가 어긋나면 벌어지는 일들:
  - 로그의 시간순서가 뒤엉켜 **장애 추적이 불가능**해진다.
  - TLS 인증서가 "아직 유효하지 않음"·"만료됨"으로 **오판**된다.
  - 시간 기반 인증(Kerberos, TOTP)이 **실패**한다.
  - 데이터베이스 복제·분산 트랜잭션이 **깨진다**.
- 그래서 **NTP**로 모든 노드를 신뢰할 수 있는 기준 시계에 맞춘다.
- NTP는 시간 소스의 신뢰 거리를 **stratum(계층)**으로 나눈다.

| Stratum | 의미 |
|---------|------|
| 0 | 원자시계·GPS 등 기준 시계 자체(네트워크에 직접 연결 안 됨) |
| 1 | Stratum 0에 직접 연결된 1차 서버(가장 정확) |
| 2 | Stratum 1로부터 동기화받는 서버 |
| ... | 한 단계 멀어질수록 stratum 숫자 +1 (최대 15, 16은 미동기) |

기억 고정 포인트:

- **숫자가 작을수록 기준에 가깝고 정확하다.** Stratum 1이 최상위(0은 시계 자체).
- 우리 서버는 보통 인터넷의 Stratum 2~3 풀(`pool.ntp.org`)에 동기화한다.
- Stratum **16**은 "동기화 안 됨"을 뜻하는 특수값이다.

> 💡 **개념**: NTP는 단순히 시간을 "받아서 덮어쓰는" 것이 아니라, 왕복 지연(round-trip delay)과 오프셋을 계산해 네트워크 지연을 보정하며 시계를 **서서히 조정(slew)**한다. 시간을 갑자기 점프시키면 로그·타이머가 깨지므로, 작은 오차는 시계 속도를 미세하게 빠르거나 느리게 만들어 부드럽게 맞춘다. 이것이 시간 동기화가 단순 복사가 아닌 이유다.

## chrony — 현대 리눅스의 표준 시간 동기화

- 전통적 `ntpd`를 대체해 현재 RHEL/CentOS 계열의 기본 시간 동기화 데몬은 **chrony**다.
- 설계 목적: 노트북처럼 **자주 끊기거나 네트워크가 불안정한 환경**에서 더 빠르고 정확하게 동기화하기.

```bash
# 설치
yum install chrony

# 데몬 제어
systemctl start chronyd
systemctl enable chronyd
```

- 설정 파일은 **`/etc/chrony.conf`**다.

```text
# 동기화할 시간 서버(또는 풀)
pool 2.pool.ntp.org iburst
server time.bora.net iburst       # 특정 서버 지정

# 시스템 시계를 RTC(하드웨어 시계)에 기록
rtcsync

# 클라이언트(하위 네트워크)에 시간 제공 허용
allow 192.168.1.0/24

# 외부 동기화 불가 시 자신을 stratum 10으로 간주
local stratum 10
```

| 지시어 | 역할 |
|--------|------|
| `server` / `pool` | 동기화 대상 시간 서버. `iburst`는 시작 시 빠르게 여러 번 질의 |
| `allow` | 이 서버를 시간 소스로 쓸 수 있는 클라이언트 대역 |
| `rtcsync` | 시스템 시각을 하드웨어 시계(RTC)에 반영 |
| `local stratum` | 외부 소스 단절 시 자체 stratum 값 |

- 상태 확인 명령(실기 단골)은 다음 네 가지다.

```bash
chronyc sources            # 동기화 중인 시간 소스 목록·상태
chronyc sources -v         # 상세(범례 포함)
chronyc tracking           # 현재 동기화 정확도·오프셋·stratum
timedatectl                # 시스템 시간·타임존·NTP 동기화 여부
```

> ⚠️ **함정**: `chronyc sources`의 출력에서 소스 앞의 기호가 의미를 가진다. `*`는 현재 동기화 중인 기준 소스, `+`는 후보, `?`는 도달 불가, `x`는 잘못된 시계(falseticker)다. 또한 `server`는 한 대를 지정하고 `pool`은 DNS가 여러 IP를 돌려주는 풀을 지정한다는 차이를 묻는 문제가 나온다. ntpd와 chrony를 동시에 켜면 53번이 아니라 **123번 UDP 포트**를 두고 충돌하므로 한쪽만 켜야 한다.

## 직접 쳐보기 — 시간·DHCP 상태 점검

```bash
# 시간 상태 한눈에
timedatectl                # NTP 동기화 여부, 로컬/UTC 시각, 타임존
chronyc tracking           # 기준 서버·오프셋·stratum 확인
chronyc sources            # 어떤 서버에 붙어 있는지

# 타임존 변경
timedatectl set-timezone Asia/Seoul

# DHCP 임대 즉시 갱신 후 확인
dhclient -r eth0 && dhclient eth0
ip addr show eth0          # 받은 IP 확인
```

- `timedatectl` 출력에 **`NTP synchronized: yes`**가 보이면 시간이 정상 동기화된 것이다.
- `chronyc tracking`의 **`Stratum`**과 **`Last offset`**(현재 오차)을 함께 보면 동기화 품질을 가늠할 수 있다.

내일은 이 인프라 위에서 실제 콘텐츠를 서비스하는 웹 서버, Apache로 넘어간다.

## 📖 용어

- **임대(lease)** : DHCP가 IP를 "소유"가 아니라 기간 한정으로 빌려주는 방식. 절반쯤 지나면 갱신을 시도한다.
- **DORA** : Discover(탐색) → Offer(제안) → Request(수락) → Ack(확정)의 DHCP 4단계.
- **DHCP 릴레이(relay agent)** : 브로드캐스트가 넘지 못하는 라우터 너머로 DHCP 요청을 대신 전달해 주는 기능.
- **`range`** : dhcpd.conf에서 동적으로 나눠 줄 IP 범위(풀)를 정하는 지시어.
- **`fixed-address` + `hardware ethernet`** : 특정 MAC 주소의 장비에 항상 같은 IP를 예약하는 조합.
- **`authoritative`** : 이 서버가 해당 서브넷의 공식 DHCP 서버임을 선언하는 지시어.
- **BOOTP** : DHCP의 전신. 디스크 없는 워크스테이션용으로 만들어졌고 포트·메시지 형식을 물려줬다.
- **APIPA(169.254.x.x)** : DHCP 서버를 못 찾은 클라이언트가 스스로 붙이는 링크 로컬 주소.
- **stratum** : 기준 시계로부터 얼마나 떨어져 있는지 나타내는 계층 값. 작을수록 정확하고 16은 미동기다.
- **slew(서서히 조정)** : 시간을 점프시키지 않고 시계 속도를 미세하게 바꿔 오차를 메우는 방식.
- **chrony / chronyd** : 현대 리눅스의 표준 시간 동기화 구현과 그 데몬. 불안정한 네트워크에 강하다.
- **`iburst`** : 시작 직후 여러 번 빠르게 질의해 동기화를 앞당기는 옵션.
- **`chronyc sources`의 기호** : `*` 현재 기준 소스 / `+` 후보 / `?` 도달 불가 / `x` 잘못된 시계(falseticker).
- **`server` vs `pool`** : 서버 한 대를 지정 / DNS가 여러 IP를 돌려주는 서버 묶음을 지정.

## 📝 연습 문제

**문제 1.** DHCP의 IP 할당 4단계(DORA)의 올바른 순서는?

A) Discover → Request → Offer → Ack
B) Discover → Offer → Request → Ack
C) Offer → Discover → Ack → Request
D) Request → Discover → Offer → Ack

**정답: B**
해설: DORA는 Discover(클라이언트의 서버 탐색) → Offer(서버의 IP 제안) → Request(클라이언트의 수락) → Ack(서버의 임대 확정) 순서다. 머리글자 DORA 순서 그대로 외운다.

---

**문제 2.** dhcpd.conf에서 동적으로 배분할 IP 주소 범위를 지정하는 지시어는?

A) `option routers`
B) `range`
C) `fixed-address`
D) `default-lease-time`

**정답: B**
해설: `range 192.168.1.100 192.168.1.200;`처럼 동적 배분 풀을 정의하는 것이 `range`다. `option routers`는 게이트웨이, `fixed-address`는 특정 MAC에 줄 고정 IP, `default-lease-time`은 기본 임대 시간이다.

---

**문제 3.** NTP의 stratum에 대한 설명으로 옳은 것은?

A) stratum 숫자가 클수록 기준 시계에 가깝고 정확하다
B) stratum 0은 미동기 상태를 의미한다
C) stratum 1은 기준 시계에 직접 연결된 1차 서버다
D) stratum은 최대 255까지 표현된다

**정답: C**
해설: stratum은 숫자가 작을수록 기준에 가깝다. stratum 0은 원자시계·GPS 등 기준 시계 자체, stratum 1은 거기에 직접 연결된 1차 서버다. 16이 미동기를 뜻하는 특수값이며, 0이 미동기가 아니다.

---

**문제 4.** DHCP에서 특정 프린터에 항상 같은 IP를 주려 한다. 장비를 식별하기 위해 host 블록에 함께 적어야 하는 지시어는?

A) `range`
B) `hardware ethernet` (MAC 주소)
C) `option domain-name`
D) `max-lease-time`

**정답: B**
해설: 고정 IP 예약은 `host` 블록 안에서 `hardware ethernet`으로 대상의 MAC 주소를 식별하고 `fixed-address`로 줄 IP를 지정한다. MAC이 식별 기준이다.

---

**문제 5.** 클라이언트가 DHCP 서버를 찾지 못했을 때 자동으로 갖게 되는 IP 대역(APIPA)은?

A) 10.0.0.0/8
B) 127.0.0.0/8
C) 169.254.0.0/16
D) 192.168.0.0/16

**정답: C**
해설: DHCP 서버 응답이 없으면 클라이언트는 169.254.0.0/16(링크 로컬, APIPA) 대역에서 임의 주소를 자동 할당한다. 이 주소가 보이면 "DHCP 서버를 찾지 못함"의 신호다. 127은 루프백, 나머지는 사설 대역이다.

---

**문제 6.** chrony에서 현재 동기화 중인 시간 소스와 오프셋·stratum 등 동기화 품질을 확인하는 명령은?

A) `chronyc sources`로만 확인 가능하다
B) `chronyc tracking`
C) `dhclient -r`
D) `named-checkconf`

**정답: B**
해설: `chronyc tracking`은 현재 기준 서버, 시간 오프셋, stratum, 정확도 등 동기화 상태를 보여 준다. `chronyc sources`는 붙어 있는 소스 목록을 보여 주는 보완 명령이다. dhclient는 DHCP, named-checkconf는 BIND 설정 검사다.

---

**문제 7.** DHCP 브로드캐스트는 라우터를 넘지 못한다. 다른 서브넷의 클라이언트가 중앙 DHCP 서버를 사용하게 하려면 라우터에 무엇을 설정해야 하는가?

A) DHCP 릴레이(relay agent)
B) NAT
C) 기본 게이트웨이 변경
D) stratum 조정

**정답: A**
해설: DHCP DISCOVER는 브로드캐스트라 라우터를 넘지 못한다. 라우터(또는 중간 장비)에 DHCP 릴레이 에이전트를 설정하면 다른 서브넷의 요청을 유니캐스트로 중앙 DHCP 서버에 전달해 준다. NAT나 게이트웨이 변경, stratum은 무관하다.

---
