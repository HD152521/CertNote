# Day 1 - 네트워크 설정·진단 작업형: 손으로 IP를 세우고 길을 뚫는다

## 📌 핵심 정리

- 네트워크 설정은 항상 **일시(`ip`, `ifconfig`)와 영구(`ifcfg-*`, `nmcli con`)** 두 층이다. "재부팅 후에도 유지"면 무조건 영구 설정이다.
- `ip` 명령 문법: `ip addr add 주소/프리픽스 dev 인터페이스`, `ip route add default via 게이트웨이`. `default`가 곧 기본 경로다.
- `nmcli con modify`로 고쳐도 **`nmcli con up`으로 재활성화해야** 적용된다 — 저장과 적용은 별개다.
- `ifcfg-*`의 단골 빈칸은 **`BOOTPROTO`**(static/dhcp)와 **`ONBOOT=yes`**. ONBOOT가 no면 재부팅 후 안 올라온다.
- 진단은 계층별로 끊는다: `ip a` → `ping 게이트웨이` → `ping 8.8.8.8` → `dig`. 끊긴 지점이 곧 원인이다.
- `ping 8.8.8.8`은 되는데 도메인이 안 되면 **DNS 문제**, 게이트웨이는 되는데 외부가 안 되면 **기본 경로 누락**이다.

## 네트워크 설정의 두 층: 일시 vs 영구

- 리눅스 네트워크 설정은 항상 두 층으로 나뉜다는 것을 먼저 머리에 박아야 한다.

| 층 | 적용 시점 | 대표 도구 | 재부팅 후 |
|----|----------|----------|----------|
| 일시(runtime) | 즉시, 메모리에만 | `ip`, `ifconfig` | **사라짐** |
| 영구(persistent) | 파일에 저장 | `ifcfg-*`, `nmcli con` | **유지됨** |

- `ip addr add`로 붙인 주소는 재부팅하면 날아간다.
- 영구로 남기려면 설정 파일(`/etc/sysconfig/network-scripts/ifcfg-*`)이나 `nmcli connection` 프로파일에 써야 한다.
- 시험에서 "재부팅 후에도 유지되게"라는 조건이 보이면 무조건 **영구 설정(파일 또는 nmcli con)**을 떠올려야 한다.

> 💡 **핵심 한 줄**: `ip`/`ifconfig`는 임시, `ifcfg-*`/`nmcli con`은 영구. "재부팅 후 유지" = 영구 설정.

## ip 명령으로 주소·링크·라우팅 다루기

- `ifconfig`/`route`는 deprecated이고 현대 표준은 **`ip` 명령(iproute2 패키지)**이다.
- 문법은 객체(object)와 동작으로 구성된다.

```bash
# 주소(address) 다루기
ip addr show                       # 전체 인터페이스 주소 조회 (= ip a)
ip addr show eth0                  # 특정 인터페이스만
ip addr add 192.168.10.5/24 dev eth0    # 주소 부여
ip addr del 192.168.10.5/24 dev eth0    # 주소 삭제

# 링크(link) = 인터페이스 자체
ip link show                       # 인터페이스 목록·상태
ip link set eth0 up                # 인터페이스 활성화
ip link set eth0 down              # 비활성화

# 라우팅(route)
ip route show                      # 라우팅 테이블 (= ip r)
ip route add default via 192.168.10.1        # 기본 게이트웨이 설정
ip route add 10.0.0.0/24 via 192.168.10.254  # 특정 네트워크 정적 경로
ip route del 10.0.0.0/24                      # 경로 삭제
```

- `/24`처럼 **CIDR 프리픽스로 넷마스크를 함께 지정**하는 게 `ip` 명령의 문법이다.
- `192.168.10.5 netmask 255.255.255.0` 같은 옛 `ifconfig` 문법과 헷갈리지 말자.

> 🔍 **암기 포인트**: `ip addr add 주소/프리픽스 dev 인터페이스`, `ip route add default via 게이트웨이`. `default`가 곧 0.0.0.0/0(기본 경로)이다.

### ifconfig·route (구버전, 여전히 출제)

```bash
ifconfig                                   # 활성 인터페이스 조회
ifconfig eth0 192.168.10.5 netmask 255.255.255.0   # 주소+넷마스크
ifconfig eth0 up                           # 활성화
route -n                                   # 라우팅 테이블(이름해석 없이)
route add default gw 192.168.10.1          # 기본 게이트웨이
route add -net 10.0.0.0 netmask 255.255.255.0 gw 192.168.10.254  # 정적 경로
```

- `ifconfig`는 넷마스크를 `netmask 255.255.255.0`처럼 점10진수로 쓴다.
- `route`는 `add default gw`, `add -net ... netmask ... gw` 형태로 쓴다.
- 두 도구의 문법 차이를 정확히 구분해야 한다.

## nmcli — NetworkManager의 명령행 관문

- RHEL 7 이후 표준 관리자는 **NetworkManager**이고, 그 CLI가 `nmcli`다.
- nmcli로 만든 설정은 **영구적**이라는 점이 `ip` 명령과 결정적으로 다르다.

```bash
# 상태 조회
nmcli                              # 전체 요약
nmcli device status                # 장치별 상태 (= nmcli d)
nmcli connection show              # 연결 프로파일 목록 (= nmcli c)

# 정적 IP 프로파일 생성
nmcli connection add type ethernet con-name myeth ifname eth0 \
  ipv4.method manual \
  ipv4.addresses 192.168.10.5/24 \
  ipv4.gateway 192.168.10.1 \
  ipv4.dns 8.8.8.8

# 기존 프로파일 수정
nmcli connection modify myeth ipv4.addresses 192.168.10.6/24
nmcli connection modify myeth +ipv4.dns 1.1.1.1   # DNS 추가(+)

# 적용(반드시 재활성화해야 반영)
nmcli connection up myeth
nmcli connection down myeth
```

- 핵심 속성: `ipv4.method`(`manual`=정적 / `auto`=DHCP), `ipv4.addresses`, `ipv4.gateway`, `ipv4.dns`.
- **수정 후 `nmcli connection up`(또는 reload)으로 다시 올려야** 적용된다.

> ⚠️ **함정**: `nmcli con modify`로 바꿔도 즉시 적용 안 된다. `nmcli con up <프로파일>`로 재활성화해야 반영된다. firewalld의 `--reload`와 같은 "저장과 적용은 별개" 패턴.

## ifcfg-* 파일 직접 작성 (RHEL/CentOS 영구 설정)

- `nmcli`가 결국 만들어 내는, 혹은 손으로 쓰는 파일이 `/etc/sysconfig/network-scripts/ifcfg-<인터페이스>`다.
- 작업형에서 **빈칸으로 자주 출제**되므로 지시어를 정확히 외워야 한다.

```bash
# /etc/sysconfig/network-scripts/ifcfg-eth0  (정적 IP 예시)
TYPE=Ethernet
BOOTPROTO=static          # static(또는 none)=정적, dhcp=자동
NAME=eth0
DEVICE=eth0
ONBOOT=yes                # 부팅 시 자동 활성화 (핵심!)
IPADDR=192.168.10.5
NETMASK=255.255.255.0     # 또는 PREFIX=24
GATEWAY=192.168.10.1
DNS1=8.8.8.8
DNS2=1.1.1.1
```

| 지시어 | 의미 | 자주 틀리는 점 |
|--------|------|---------------|
| `BOOTPROTO` | 주소 할당 방식 | static/none=정적, **dhcp**=자동 |
| `ONBOOT` | 부팅 시 활성화 | **yes**여야 부팅 후 살아남음 |
| `IPADDR` | IP 주소 | DHCP면 불필요 |
| `NETMASK`/`PREFIX` | 넷마스크 | 둘 중 하나만 |
| `GATEWAY` | 기본 게이트웨이 | |
| `DNS1`/`DNS2` | 네임서버 | |

- DHCP로 받을 때는 `BOOTPROTO=dhcp`로 하고 `IPADDR`/`NETMASK`/`GATEWAY`를 비운다.
- 수정 후 적용은 `nmcli con reload` → `nmcli con up eth0`, 또는 `systemctl restart NetworkManager`다.

> 💡 **단골 빈칸**: `BOOTPROTO=____`(static/dhcp), `ONBOOT=____`(yes). `ONBOOT=no`면 재부팅 후 인터페이스가 안 올라온다 — 시험의 전형적 함정.

### DNS 영구 설정: /etc/resolv.conf

- 이름 해석용 네임서버는 `/etc/resolv.conf`에 정의된다.
- 단, NetworkManager가 관리하면 ifcfg의 `DNS1`/`DNS2`가 이 파일을 채운다.

```bash
# /etc/resolv.conf
nameserver 8.8.8.8
nameserver 1.1.1.1
search example.com        # 도메인 자동 보완
```

## 진단 도구: ping·ss·dig·traceroute

- 설정을 했으면 "정말 되는가"를 확인하는 진단이 따라온다.
- 작업형은 **계층별로 끊어 진단**하는 사고를 요구한다.

```bash
# 1) L3 도달성: ping
ping -c 4 192.168.10.1             # 4번만 보내고 종료 (-c count)
ping -c 4 8.8.8.8                  # 외부 도달 확인
ping -c 4 www.google.com          # 이름해석 + 도달 동시 확인

# 2) 포트·소켓: ss (netstat 대체)
ss -tuln                           # TCP/UDP 리스닝 포트 (숫자)
ss -tnp                            # 연결된 TCP + 프로세스
# t=TCP, u=UDP, l=listen, n=숫자표시(이름해석X), p=프로세스

# 3) 이름해석: dig / nslookup
dig www.example.com                # 상세 DNS 조회
dig www.example.com +short         # 결과만 간단히
dig @8.8.8.8 example.com MX         # 특정 서버에 MX 레코드 질의
nslookup www.example.com           # 대화형/간단 조회

# 4) 경로 추적
traceroute 8.8.8.8                 # 홉 단위 경로 추적
```

- `ss` 옵션은 `-t`(TCP) `-u`(UDP) `-l`(listen) `-n`(숫자) `-p`(프로세스)를 조합한다.
- `ss -tuln`이 "지금 무슨 포트가 열려 있나"를 보는 단골 명령이다.

> 🔍 **진단 사다리**: ① `ip a`로 IP 있나 → ② `ping 게이트웨이`로 L2/L3 → ③ `ping 8.8.8.8`로 외부 도달 → ④ `ping 도메인`/`dig`로 DNS. 어디서 끊기는지가 곧 원인이다.

> ⚠️ **헷갈림**: `ping 8.8.8.8`은 되는데 `ping google.com`이 안 되면 **DNS(resolv.conf) 문제**다. IP 도달은 정상이고 이름해석만 실패한 상황.

## 진단 시나리오: "인터넷이 안 돼요"

- 작업형 사고 흐름을 한 번에 정리하자.

| 증상 | 의심 | 확인 명령 | 조치 |
|------|------|----------|------|
| IP가 없음 | 설정/ONBOOT | `ip a` | ifcfg `ONBOOT=yes`, `nmcli con up` |
| 게이트웨이 ping 실패 | 같은 망 문제 | `ip r` | `ip route add default via` |
| 외부 IP ping 실패 | 라우팅/방화벽 | `ip r`, `traceroute` | 기본 경로·방화벽 점검 |
| IP는 되나 도메인 실패 | DNS | `dig`, `cat /etc/resolv.conf` | nameserver 수정 |
| 포트 접속 안 됨 | 서비스/방화벽 | `ss -tuln` | 서비스 기동·포트 개방 |

> 📚 **시험 빈출**: "ping 게이트웨이 성공 + ping 8.8.8.8 실패" → 기본 라우팅(default route) 누락. `ip route add default via <gw>`.

## 호스트명과 이름 해석 우선순위

- 네트워크 작업형에서 호스트명 설정과 로컬 이름 해석도 단골이다.

```bash
hostnamectl                          # 현재 호스트명·OS 정보 조회
hostnamectl set-hostname web01.example.com   # 영구 호스트명 변경
hostname                             # 현재 호스트명만 출력
```

- 이름 해석은 `/etc/nsswitch.conf`의 `hosts:` 행 순서를 따른다.

```text
# /etc/nsswitch.conf
hosts:  files dns         # files(/etc/hosts) 먼저, 그다음 dns
```

- `files`가 앞이면 `/etc/hosts`에 적은 매핑이 DNS보다 우선한다.
- 로컬 테스트용 매핑은 `/etc/hosts`에 직접 적는다.

```text
# /etc/hosts
127.0.0.1   localhost
192.168.10.50   web01.example.com web01
```

> 🔍 **해석 우선순위**: `/etc/hosts`(files) > DNS(`/etc/resolv.conf`)가 기본. `/etc/hosts`에 잘못된 매핑이 있으면 DNS가 정상이어도 엉뚱한 IP로 간다 — 진단 시 함께 확인.

> 📚 **DHCP 클라이언트 갱신**: 임대 주소를 다시 받으려면 `dhclient -r`(반납) 후 `dhclient`(재요청), 또는 `nmcli con down/up`. NetworkManager 환경에선 nmcli가 더 일관적이다.

## 직접 쳐보기

- 아래를 직접 실행하며 출력을 눈에 익히자(테스트 머신·가상머신 권장).

```bash
# 현재 주소·경로·소켓 한 번에 파악
ip a
ip r
ss -tuln

# 임시 주소 추가 후 확인하고 삭제
ip addr add 10.10.10.10/24 dev eth0
ip addr show eth0
ip addr del 10.10.10.10/24 dev eth0

# 도달성·이름해석 진단
ping -c 3 127.0.0.1          # 루프백(자기 자신 TCP/IP 스택)
dig +short openai.com
```

손이 기억할 때까지 직접 쳐보는 것이 유일한 합격 비결이다.

## 📖 용어

- **일시 설정 / 영구 설정** : 메모리에만 남아 재부팅 시 사라지는 설정(`ip`) / 파일에 저장돼 유지되는 설정(`ifcfg-*`, `nmcli con`).
- **iproute2** : `ifconfig`·`route`를 대체하는 현대 네트워크 도구 모음. 대표 명령이 `ip`다.
- **CIDR 프리픽스** : `/24`처럼 넷마스크를 비트 수로 적는 표기. `ip` 명령은 이 방식을 쓴다.
- **기본 게이트웨이(default)** : 목적지를 모르는 모든 패킷을 내보낼 출구. `ip route add default via <IP>`로 설정한다.
- **NetworkManager / nmcli** : RHEL 7 이후의 표준 네트워크 관리 데몬 / 그 명령행 도구. 만든 설정이 영구적이다.
- **ipv4.method** : nmcli에서 주소 할당 방식을 정하는 속성. `manual`이 정적, `auto`가 DHCP.
- **BOOTPROTO** : `ifcfg-*`에서 주소 할당 방식을 정하는 지시어. `static`(또는 `none`)과 `dhcp`.
- **ONBOOT** : 부팅 시 그 인터페이스를 자동으로 올릴지 정하는 지시어. `yes`가 아니면 재부팅 후 안 올라온다.
- **ss** : 열린 소켓·포트를 보는 명령(netstat 대체). `-t`TCP `-u`UDP `-l`리스닝 `-n`숫자 `-p`프로세스.
- **dig** : DNS 서버에 직접 질의해 이름 해석을 확인하는 도구. `+short`로 결과만 볼 수 있다.
- **nsswitch.conf** : 이름을 `/etc/hosts`(files)로 먼저 볼지 DNS로 먼저 볼지 조회 순서를 정하는 파일.
- **hostnamectl** : 시스템 호스트명을 조회·변경하는 systemd 명령. `set-hostname`은 영구 적용이다.

## 📝 연습 문제

**문제 1.** eth0 인터페이스에 192.168.1.100/24 주소를 임시로 부여하는 `ip` 명령으로 옳은 것은?

A) ip addr set 192.168.1.100/24 eth0
B) ip addr add 192.168.1.100/24 dev eth0
C) ip link add 192.168.1.100 dev eth0
D) ip route add 192.168.1.100/24 dev eth0

**정답: B**

해설: 주소 부여는 `ip addr add 주소/프리픽스 dev 인터페이스` 문법이다. `set`은 ip addr의 동작이 아니며, `ip link`는 인터페이스 자체(up/down 등), `ip route`는 라우팅을 다룬다. 임시 설정이므로 재부팅하면 사라진다.

---

**문제 2.** 기본 게이트웨이를 192.168.1.1로 설정하는 명령으로 옳은 것은?

A) ip route add 192.168.1.1 via default
B) ip route add default via 192.168.1.1
C) ip route add gateway 192.168.1.1
D) ip addr add default via 192.168.1.1

**정답: B**

해설: 기본 경로는 `ip route add default via <게이트웨이>` 문법으로 추가한다. `default`가 0.0.0.0/0을 의미하고 `via` 뒤에 게이트웨이 주소가 온다. A는 순서가 뒤바뀌었고, C·D는 잘못된 키워드·객체다.

---

**문제 3.** `ifcfg-eth0` 파일에서 재부팅 후에도 인터페이스가 자동으로 활성화되도록 반드시 yes로 지정해야 하는 지시어는?

A) BOOTPROTO
B) ONBOOT
C) DEVICE
D) TYPE

**정답: B**

해설: `ONBOOT=yes`여야 부팅 시 해당 인터페이스가 자동으로 올라온다. `ONBOOT=no`이면 IP 설정이 옳아도 재부팅 후 네트워크가 안 된다. `BOOTPROTO`는 주소 할당 방식(static/dhcp), `DEVICE`/`TYPE`은 장치명·유형이다.

---

**문제 4.** DHCP로 자동 주소를 받도록 ifcfg 파일을 구성할 때 `BOOTPROTO`에 지정할 값은?

A) static
B) none
C) dhcp
D) auto

**정답: C**

해설: ifcfg 파일에서 DHCP 자동 할당은 `BOOTPROTO=dhcp`로 지정한다. 정적 IP는 `static`(또는 `none`)이다. `auto`는 nmcli의 `ipv4.method` 값이며 ifcfg의 BOOTPROTO 값이 아니다. DHCP 사용 시 IPADDR/NETMASK/GATEWAY는 비운다.

---

**문제 5.** `ping 8.8.8.8`은 정상 응답하지만 `ping www.example.com`은 실패한다. 가장 가능성 높은 원인은?

A) 기본 게이트웨이가 설정되지 않았다
B) 인터페이스에 IP가 없다
C) DNS(네임서버) 설정에 문제가 있다
D) 방화벽이 ICMP를 차단한다

**정답: C**

해설: IP(8.8.8.8) 도달은 정상이므로 L3 라우팅과 IP 설정은 문제없다. 도메인만 실패한다는 것은 **이름 해석(DNS)** 단계의 문제로, `/etc/resolv.conf`의 `nameserver` 설정이나 DNS 서버 응답을 의심해야 한다. ICMP가 막혔다면 8.8.8.8 ping도 실패했을 것이다.

---

**문제 6.** 현재 시스템에서 리스닝 중인 TCP·UDP 포트를 숫자 형태로 한 번에 확인하는 `ss` 명령으로 옳은 것은?

A) ss -tuln
B) ss -tup
C) ss -a only
D) ss -r show

**정답: A**

해설: `-t`(TCP) `-u`(UDP) `-l`(listen) `-n`(숫자 표시)을 조합한 `ss -tuln`이 리스닝 포트를 숫자로 보는 표준 명령이다. `-p`는 프로세스 정보를 추가로 보여 주지만 listen 한정(`-l`)이 빠졌고, C·D는 존재하지 않는 옵션 조합이다.

---

**문제 7.** `nmcli connection modify`로 IP를 변경한 뒤 변경 사항을 현재 세션에 적용하려면 추가로 실행해야 하는 명령은?

A) nmcli device disconnect
B) nmcli connection up <프로파일>
C) ip addr flush
D) systemctl stop NetworkManager

**정답: B**

해설: `nmcli connection modify`는 프로파일을 영구 저장만 할 뿐 즉시 적용하지 않는다. `nmcli connection up <프로파일명>`으로 연결을 다시 올려야 변경이 반영된다. C는 주소를 비우는 명령이고, D는 NetworkManager 자체를 멈춰 오히려 네트워크가 끊긴다.

---
