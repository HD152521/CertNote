# Day 2 - 네트워크 설정: 인터페이스·게이트웨이·DNS를 손으로 잡기

## 📌 핵심 정리

- 네트워크 설정은 세 축이다 — **주소(`ip addr`/IPADDR) · 경로(`ip route`/GATEWAY) · 이름(resolv.conf/hosts).**
- 도구는 세대로 갈린다: **구식 `ifconfig`·`route`·`arp`** ↔ **현대 `ip`(iproute2)·`nmcli`**. 시험은 1:1 대응표를 묻는다.
- **최대 함정은 임시 vs 영구.** `ip addr add`·`ifconfig`·resolv.conf 직접 수정은 **임시(또는 덮어쓰기 위험)**, `ifcfg` 파일·`nmcli con mod`는 **영구**다.
- `ifcfg-eth0`에서 **`ONBOOT=no`면 IP가 다 맞아도 부팅 시 인터페이스가 안 올라온다.** `BOOTPROTO`는 static/dhcp를 가른다.
- 이름 해석은 `/etc/nsswitch.conf`의 `hosts: files dns` 순서 — **`/etc/hosts`가 DNS보다 먼저** 매칭된다.

## ip 명령 — 현대 리눅스 네트워크의 표준 도구

- 과거의 `ifconfig`, `route`, `arp`를 **통합해 대체한 것이 `ip` 명령**(iproute2 패키지)이다.
- 현재 모든 주요 배포판의 표준 도구다.

```bash
# 인터페이스와 IP 주소 확인
ip addr show          # 줄여서 ip a
ip addr show eth0     # 특정 인터페이스만

# 인터페이스 링크(L2) 상태 확인
ip link show          # 줄여서 ip l

# IP 주소 부여/삭제 (임시 — 재부팅 시 사라짐)
ip addr add 192.168.1.10/24 dev eth0
ip addr del 192.168.1.10/24 dev eth0

# 인터페이스 활성화/비활성화
ip link set eth0 up
ip link set eth0 down

# 라우팅 테이블 확인
ip route show         # 줄여서 ip r
```

> 💡 **개념**: `ip` 명령은 객체(addr, link, route, neigh)를 먼저 쓰고 동작(show, add, del, set)을 쓰는 일관된 문법이다. `ip a`=주소, `ip l`=링크, `ip r`=라우팅, `ip neigh`=ARP 테이블. 이 네 줄임말만 익혀도 진단의 80%가 끝난다.

> ⚠️ **함정**: `ip addr add`로 부여한 IP는 **임시**다 — 재부팅하면 사라진다. 영구 설정은 아래의 설정 파일(`network-scripts`) 또는 `nmcli`로 해야 한다. 시험에서 "재부팅 후에도 유지되는 설정 방법"을 물으면 절대 `ip addr add`가 답이 아니다.

## ifconfig·route — 알아둬야 할 구식 명령

- `net-tools` 패키지의 구식 명령들이다. 최신 배포판은 **기본 미설치**인 경우가 많다.
- 그래도 시험과 레거시 시스템에서 여전히 등장하므로 대응표를 통째로 외우는 게 효율적이다.

| 작업 | 구식(net-tools) | 현대(iproute2) |
|------|-----------------|----------------|
| IP 주소 확인 | `ifconfig` | `ip addr` |
| IP 임시 설정 | `ifconfig eth0 192.168.1.10 netmask 255.255.255.0` | `ip addr add 192.168.1.10/24 dev eth0` |
| 인터페이스 활성화 | `ifconfig eth0 up` | `ip link set eth0 up` |
| 라우팅 확인 | `route -n` | `ip route` |
| 기본 게이트웨이 추가 | `route add default gw 192.168.1.1` | `ip route add default via 192.168.1.1` |
| ARP 테이블 | `arp -n` | `ip neigh` |

```bash
# 구식: 게이트웨이 추가
route add default gw 192.168.1.1 eth0

# 현대: 동일 작업
ip route add default via 192.168.1.1 dev eth0
```

> 🔍 **핵심 구분**: `ifconfig`는 IP 주소만 보여주고 보조 IP(secondary)나 정책 라우팅을 제대로 다루지 못한다. `ip`는 이를 완전히 지원한다. 시험에서 "ifconfig를 대체하는 명령"을 물으면 `ip addr`다. 두 명령의 1:1 대응표를 통째로 외우는 게 효율적이다.

## nmcli — NetworkManager 명령행 제어

- Red Hat 계열(RHEL/CentOS/Rocky)과 최신 배포판은 **NetworkManager**가 네트워크를 관리한다.
- 이를 명령행에서 제어하는 도구가 **`nmcli`**이며, nmcli로 한 설정은 **영구적으로 저장**된다.

```bash
# 연결(connection)과 장치(device) 상태 확인
nmcli connection show          # 줄여서 nmcli con show
nmcli device status            # 줄여서 nmcli dev status

# 정적 IP 영구 설정
nmcli con mod eth0 ipv4.addresses 192.168.1.10/24
nmcli con mod eth0 ipv4.gateway 192.168.1.1
nmcli con mod eth0 ipv4.dns 8.8.8.8
nmcli con mod eth0 ipv4.method manual    # static
nmcli con up eth0                        # 변경 사항 적용

# DHCP로 전환
nmcli con mod eth0 ipv4.method auto
```

> 💡 **개념**: nmcli는 "connection(설정 프로파일)"과 "device(물리 장치)"를 구분한다. `con mod`로 프로파일을 고치고 `con up`으로 적용한다. `ipv4.method manual`=정적, `auto`=DHCP. nmcli 설정은 설정 파일에 기록되어 재부팅 후에도 유지된다.

## 설정 파일 — /etc/sysconfig/network-scripts

- Red Hat 계열의 전통적 영구 네트워크 설정은 **`/etc/sysconfig/network-scripts/ifcfg-<인터페이스>`** 파일에 들어간다.

```bash
# /etc/sysconfig/network-scripts/ifcfg-eth0 예시 (정적 IP)
DEVICE=eth0
BOOTPROTO=static        # static=정적, dhcp=자동
ONBOOT=yes              # 부팅 시 자동 활성화
IPADDR=192.168.1.10
NETMASK=255.255.255.0
GATEWAY=192.168.1.1
DNS1=8.8.8.8
DNS2=8.8.4.4
```

| 항목 | 의미 |
|------|------|
| DEVICE | 인터페이스 이름 |
| BOOTPROTO | static(정적) / dhcp(자동) / none |
| ONBOOT | yes면 부팅 시 자동 활성화 |
| IPADDR / NETMASK | IP 주소 / 서브넷마스크 |
| GATEWAY | 기본 게이트웨이 |
| DNS1 / DNS2 | 네임서버 |

> ⚠️ **함정**: `ONBOOT=no`이면 IP 설정이 다 맞아도 부팅 시 인터페이스가 올라오지 않아 네트워크가 안 된다. "설정은 맞는데 부팅 후 연결 안 됨" 문제의 단골 원인이다. Debian/Ubuntu 계열은 이 파일 대신 `/etc/network/interfaces`나 netplan(`/etc/netplan/*.yaml`)을 쓴다는 점도 기억하라.

> 📚 **유래/사례**: `ifcfg-` 파일은 Red Hat이 오래 써 온 방식이고, 최신 RHEL은 내부적으로 NetworkManager의 키파일(`/etc/NetworkManager/system-connections/`)로 옮겨가고 있다. 시험은 여전히 전통적인 `ifcfg-eth0` 형식과 그 안의 항목 의미를 묻는다.

## 게이트웨이와 라우팅 — 외부로 나가는 길

- 같은 네트워크(서브넷) 안의 호스트끼리는 **직접 통신**한다.
- **다른 네트워크로 가려면 게이트웨이(라우터)를 거쳐야 한다.**
- **라우팅 테이블**이 "어느 목적지로 가려면 어느 길로 보낼지"를 정한다.

```bash
# 라우팅 테이블 확인
ip route show
# default via 192.168.1.1 dev eth0           ← 기본 게이트웨이
# 192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.10

# 기본 게이트웨이 추가 (임시)
ip route add default via 192.168.1.1

# 특정 네트워크로 가는 정적 경로 추가
ip route add 10.0.0.0/24 via 192.168.1.254

# 경로 삭제
ip route del 10.0.0.0/24
```

> 🔍 **핵심 구분**: **default(0.0.0.0/0)** 경로가 "그 외 모든 목적지"를 처리하는 기본 게이트웨이다. 라우팅 테이블에 default가 없으면 같은 서브넷끼리는 통신해도 인터넷은 안 된다. "내부 ping은 되는데 외부 ping이 안 됨" = 기본 게이트웨이 설정 문제일 가능성이 높다.

## DNS 설정 — /etc/resolv.conf

- 이름(도메인)을 IP로 바꾸는 **DNS 질의를 어느 서버에 보낼지** 지정하는 파일이 `/etc/resolv.conf`다.

```bash
# /etc/resolv.conf 예시
nameserver 8.8.8.8        # 1차 네임서버
nameserver 8.8.4.4        # 2차 네임서버
search example.com        # 도메인 자동 보완 (호스트명만 입력 시 붙임)
```

| 항목 | 의미 |
|------|------|
| nameserver | 질의를 보낼 DNS 서버 IP (위에서부터 순서대로 시도) |
| search | 도메인 없이 호스트명만 쓸 때 자동으로 붙일 도메인 |
| domain | 로컬 도메인 이름 |

> ⚠️ **함정**: NetworkManager가 관리하는 시스템에서는 `/etc/resolv.conf`를 직접 수정해도 **재부팅·재시작 시 덮어쓰여** 사라질 수 있다. 영구 DNS 설정은 `nmcli con mod ... ipv4.dns` 또는 `ifcfg` 파일의 `DNS1/DNS2`로 해야 한다. 이 "직접 수정이 날아가는" 현상이 시험·실무 단골 함정이다.

## /etc/hosts — DNS보다 먼저 보는 정적 매핑

- DNS 질의 전에 시스템이 **먼저 참조하는 정적 호스트명-IP 매핑 파일**이 `/etc/hosts`다.

```bash
# /etc/hosts 예시
127.0.0.1   localhost
::1         localhost
192.168.1.50  webserver.local webserver
```

- 이름 해석 순서(어느 것을 먼저 볼지)는 **`/etc/nsswitch.conf`의 `hosts:` 줄**로 정한다.

```bash
# /etc/nsswitch.conf
hosts:  files dns       # files(=/etc/hosts) 먼저, 그다음 dns
```

> 💡 **개념**: `files dns` 순서이므로 `/etc/hosts`에 항목이 있으면 DNS보다 **먼저** 매칭된다. 그래서 hosts에 잘못된 IP를 적으면 DNS가 정상이어도 엉뚱한 곳으로 연결된다. 반대로 DNS 없이 소규모 호스트 매핑을 테스트할 때 유용하다.

## 직접 쳐보기 — 설정 점검 루틴

```bash
# 1. IP·인터페이스 상태
ip addr show

# 2. 기본 게이트웨이 확인
ip route show | grep default

# 3. DNS 서버 확인
cat /etc/resolv.conf

# 4. 게이트웨이까지 연결되는지
ping -c 3 192.168.1.1

# 5. 이름 해석이 되는지
ping -c 3 google.com
```

- 이 5단계를 순서대로 밟으면 **"IP → 경로 → 이름"** 축을 따라 어디서 막혔는지 즉시 좁혀진다.
- ping이 **IP로는 되는데 도메인으로 안 되면 DNS 문제**, **게이트웨이까지도 안 되면 IP/경로 문제**다.

내일(Day 3)은 이 설정이 제대로 동작하는지 검사하는 진단 명령들을 다룬다.

## 📖 용어

- **iproute2 / `ip` 명령** : `ifconfig`·`route`·`arp`를 통합한 현대 표준 도구. 객체(addr·link·route·neigh) + 동작(show·add·del·set) 문법을 쓴다.
- **임시 설정 vs 영구 설정** : 재부팅하면 사라지는 설정(`ip addr add`, `ifconfig`) vs 파일에 기록되어 유지되는 설정(`ifcfg`, `nmcli con mod`).
- **NetworkManager / `nmcli`** : 네트워크를 관리하는 데몬과 그 명령행 도구. nmcli 설정은 파일에 저장되어 영구 반영된다.
- **connection vs device** : nmcli가 구분하는 "설정 프로파일"과 "물리 장치". `con mod`로 고치고 `con up`으로 적용한다.
- **`ipv4.method manual / auto`** : nmcli에서 정적 IP를 쓸지 DHCP를 쓸지 정하는 값.
- **`BOOTPROTO`** : ifcfg 파일에서 static(정적)인지 dhcp(자동)인지를 정하는 항목.
- **`ONBOOT`** : 부팅 시 인터페이스를 자동으로 올릴지 정하는 항목. `no`면 설정이 맞아도 네트워크가 안 된다.
- **기본 게이트웨이 / default 경로** : "그 외 모든 목적지"를 처리하는 출구. 없으면 내부 통신은 되고 인터넷만 안 된다.
- **정적 경로(static route)** : 특정 목적지 네트워크만 지정한 게이트웨이로 보내는 규칙. `ip route add 망 via 게이트웨이`.
- **`/etc/resolv.conf`** : DNS 질의를 보낼 서버를 적는 파일. NetworkManager 환경에서는 직접 고쳐도 덮어쓰인다.
- **`search` 지시어** : 호스트명만 입력했을 때 뒤에 자동으로 붙일 도메인.
- **`/etc/nsswitch.conf`** : 이름을 어디서 먼저 찾을지 순서를 정하는 파일. `hosts: files dns`면 hosts가 우선이다.

## 📝 연습 문제

**문제 1.** 재부팅 후에도 유지되는 정적 IP를 Red Hat 계열에서 설정하는 올바른 방법은?

A) `ip addr add 192.168.1.10/24 dev eth0`을 실행한다

B) `/etc/sysconfig/network-scripts/ifcfg-eth0`에 IPADDR과 ONBOOT=yes를 설정한다

C) `ifconfig eth0 192.168.1.10`을 실행한다

D) `/etc/resolv.conf`에 IP를 추가한다

**정답: B**

해설: 영구 설정은 `ifcfg-eth0` 파일에 IPADDR·NETMASK·ONBOOT=yes 등을 기록(또는 nmcli con mod)해야 한다. A와 C는 모두 임시 설정이라 재부팅 시 사라지고, D의 resolv.conf는 IP 주소가 아니라 DNS 서버를 지정하는 파일이다. "임시(ip/ifconfig) vs 영구(ifcfg/nmcli)"의 구분이 핵심이다.

---

**문제 2.** `ip route show` 결과에 default 경로가 없을 때 발생하는 가장 전형적인 증상은?

A) 같은 서브넷의 호스트와도 통신이 안 된다

B) 같은 서브넷 통신은 되지만 다른 네트워크(인터넷)로는 나갈 수 없다

C) DNS 이름 해석만 실패한다

D) 인터페이스가 down 상태가 된다

**정답: B**

해설: default 경로는 "그 외 모든 목적지"를 처리하는 기본 게이트웨이다. 이게 없어도 같은 서브넷은 직접 통신하지만, 다른 네트워크로 가는 길이 없어 인터넷이 안 된다. A는 같은 서브넷이라 게이트웨이와 무관하고, C는 DNS(resolv.conf) 문제이며, D는 라우팅과 무관한 링크 상태다.

---

**문제 3.** `ifconfig`를 대체하는 현대적 명령으로 IP 주소를 확인하는 것은?

A) `ip route show`

B) `ip link set`

C) `ip addr show`

D) `ip neigh show`

**정답: C**

해설: `ip addr show`(약칭 `ip a`)가 인터페이스의 IP 주소를 보여주며 `ifconfig`를 대체한다. A는 라우팅 테이블, B는 링크 상태 변경(IP 표시 아님), D는 ARP 테이블 확인이다. `ip` 명령은 객체(addr/link/route/neigh)에 따라 보는 정보가 다르므로 구분해야 한다.

---

**문제 4.** `/etc/hosts`와 DNS의 관계에 대한 설명으로 옳은 것은?

A) DNS 질의가 항상 /etc/hosts보다 먼저 수행된다

B) nsswitch.conf의 `hosts: files dns` 설정에 따라 /etc/hosts가 DNS보다 먼저 참조된다

C) /etc/hosts는 IP만 적을 수 있고 호스트명은 적을 수 없다

D) /etc/hosts를 수정하면 DNS 서버에도 자동 등록된다

**정답: B**

해설: 이름 해석 순서는 `/etc/nsswitch.conf`의 `hosts:` 줄이 정하며, 보통 `files dns`라 `/etc/hosts`(files)를 DNS보다 먼저 본다. A는 순서가 반대로 서술됐고, C는 hosts가 IP와 호스트명을 함께 적는 파일이므로 틀렸으며, D는 hosts가 로컬 전용이라 DNS 서버와 무관하다.

---

**문제 5.** `/etc/sysconfig/network-scripts/ifcfg-eth0`에서 `ONBOOT=no`로 되어 있을 때 나타나는 현상은?

A) IP 설정이 모두 맞아도 부팅 시 인터페이스가 자동으로 활성화되지 않는다

B) DHCP로만 IP를 받게 된다

C) DNS 질의가 비활성화된다

D) 게이트웨이가 자동으로 삭제된다

**정답: A**

해설: `ONBOOT`은 부팅 시 인터페이스 자동 활성화 여부를 결정하므로, `no`이면 IP·게이트웨이가 다 맞아도 부팅 후 인터페이스가 올라오지 않아 네트워크가 안 된다. B는 BOOTPROTO 항목의 역할이고, C·D는 ONBOOT과 무관하다. "설정 정상인데 부팅 후 연결 안 됨"의 단골 원인이다.

---

**문제 6.** NetworkManager가 관리하는 시스템에서 `/etc/resolv.conf`를 직접 수정했더니 재부팅 후 변경이 사라졌다. 영구적으로 DNS를 설정하는 올바른 방법은?

A) resolv.conf를 chmod 000으로 변경한다

B) `nmcli con mod eth0 ipv4.dns 8.8.8.8` 후 `nmcli con up eth0`을 실행한다

C) `ip addr add`로 DNS를 추가한다

D) /etc/hosts에 nameserver를 추가한다

**정답: B**

해설: NetworkManager 환경에서는 resolv.conf가 덮어쓰여지므로, `nmcli con mod ... ipv4.dns`(또는 ifcfg의 DNS1/DNS2)로 설정해야 영구 반영된다. A는 파일 잠금으로 부작용이 크고, C는 DNS가 아닌 IP 주소를 다루는 명령이며, D의 hosts는 nameserver 지시어를 쓰는 파일이 아니다.

---

**문제 7.** 다른 네트워크 10.0.0.0/24로 가는 트래픽을 게이트웨이 192.168.1.254로 보내는 정적 경로를 추가하는 명령은?

A) `ip route add default via 192.168.1.254`

B) `ip addr add 10.0.0.0/24 dev eth0`

C) `ip route add 10.0.0.0/24 via 192.168.1.254`

D) `ip link set 10.0.0.0/24 up`

**정답: C**

해설: 특정 네트워크로의 정적 경로는 `ip route add <목적지망> via <게이트웨이>` 형식이다. A는 모든 트래픽의 기본 경로를 바꾸는 명령이라 범위가 다르고, B는 인터페이스에 IP를 부여하는 명령이며, D는 링크 상태 변경이라 라우팅과 무관하다.

---
