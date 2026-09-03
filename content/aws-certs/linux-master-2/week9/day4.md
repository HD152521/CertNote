# Day 4 - 네트워크 설정과 명령어

## 📌 핵심 정리

- 네트워크 장치 이름은 **`lo`(루프백)** 와 **`eth0`·`ens33`(유선)**, `wlan0`(무선)이다.
- **`ifconfig`는 옛 도구, `ip`가 현재 표준**이다. 두 짝을 함께 외운다.
- **DNS 서버 주소는 `/etc/resolv.conf`** 에, **이름과 IP의 수동 대응은 `/etc/hosts`** 에 적는다.
- **`netstat`(옛)과 `ss`(현재)** 로 열린 포트와 연결을 본다.
- **`ping`은 통하는지**, **`traceroute`는 어디서 막히는지**를 본다.

## 네트워크 장치 이름

| 이름 | 무엇 |
|------|------|
| **`lo`** | **루프백** — 자기 자신(127.0.0.1) |
| **`eth0`** | 첫 번째 유선 랜카드 (전통적 이름) |
| **`ens33`, `enp0s3`** | 요즘의 **예측 가능한 이름** |
| `wlan0` | 무선 랜카드 |

- 예전에는 인식 순서대로 `eth0`, `eth1`이 붙어 **재부팅할 때마다 이름이 바뀌는 문제**가 있었다. 그래서 슬롯 위치를 반영한 `enp0s3` 같은 이름으로 바뀌었다.
- **`lo`는 실제 랜카드가 없어도 항상 있다.**

## ifconfig와 ip

| 하는 일 | **옛 명령(net-tools)** | **새 명령(iproute2)** |
|--------|---------------------|---------------------|
| 주소 확인 | **`ifconfig`** | **`ip addr`** (`ip a`) |
| 인터페이스 올리기 | `ifconfig eth0 up` | `ip link set eth0 up` |
| 주소 지정 | `ifconfig eth0 192.168.0.10` | `ip addr add 192.168.0.10/24 dev eth0` |
| 라우팅 표 | **`route`** | **`ip route`** |
| ARP 표 | **`arp`** | **`ip neigh`** |
| 연결·포트 | **`netstat`** | **`ss`** |

```bash
ip addr                    # 모든 인터페이스의 주소
ifconfig eth0              # 특정 인터페이스만
ip route                   # 라우팅 표 (기본 게이트웨이 확인)
route -n                   # 이름 해석 없이 숫자로
arp -a                     # 같은 망의 MAC 주소 목록
```

> **`ifconfig`·`route`·`netstat`·`arp` 는 `net-tools` 묶음**이고, **`ip`·`ss` 는 `iproute2` 묶음**이다. 요즘 배포판은 net-tools가 기본 설치되지 않는 경우도 있다. 시험에는 **둘 다** 나온다.

### 기본 게이트웨이

```bash
ip route
# default via 192.168.0.1 dev eth0     ← 기본 게이트웨이
route -n
# 0.0.0.0    192.168.0.1   0.0.0.0   UG   ...
```

- **`default`(또는 `0.0.0.0`)로 시작하는 줄이 기본 게이트웨이**다. 내부망 밖으로 나가는 모든 통신이 이리로 간다.

## 연결과 포트 보기

```bash
netstat -tulpn        # 열린 포트 (전통적)
ss -tulpn             # 같은 일 (현재 표준, 더 빠르다)
netstat -an | grep 80
```

| 옵션 | 뜻 |
|------|-----|
| **`-t`** | **TCP** |
| **`-u`** | **UDP** |
| **`-l`** | **대기 중(LISTEN)** 인 것만 |
| **`-p`** | **프로세스** 이름 표시 |
| **`-n`** | 이름 대신 **숫자**로 |
| `-a` | 전부 |

- **`-tulpn`** 이라는 조합을 통째로 기억해 두면 편하다. "어떤 서비스가 어느 포트를 열고 있나"를 보는 표준 명령이다.

## 진단 명령

| 명령 | 하는 일 |
|------|--------|
| **`ping`** | 상대에게 **닿는지** 확인 (ICMP) |
| **`traceroute`** | **거쳐 가는 경로**를 단계별로 |
| `tracepath` | traceroute와 비슷 |
| **`nslookup`, `dig`, `host`** | **DNS 조회** |
| `hostname` | 내 호스트 이름 |
| `mtr` | ping과 traceroute를 합친 도구 |

```bash
ping -c 4 8.8.8.8         # 4번만 보내기
traceroute www.google.com # 경로 추적
nslookup naver.com        # 이름 → IP
dig naver.com             # 더 자세한 DNS 조회
```

- **`ping`이 되는데 웹이 안 되면 DNS 문제**를 의심한다. IP로는 통하는데 이름을 못 바꾸는 상황이기 때문이다.
- **`ping`은 ICMP**를 쓴다. 보안 정책으로 ICMP를 막아 둔 서버는 살아 있어도 응답하지 않는다.

## 설정 파일

| 파일 | 담는 것 |
|------|--------|
| **`/etc/resolv.conf`** | **DNS 서버 주소** (`nameserver 8.8.8.8`) |
| **`/etc/hosts`** | **이름과 IP의 수동 대응** |
| **`/etc/hostname`** | 이 컴퓨터의 **호스트 이름** |
| `/etc/services` | **포트 번호와 서비스 이름**의 대응 |
| `/etc/nsswitch.conf` | 이름을 **어떤 순서로** 찾을지 |
| `/etc/sysconfig/network-scripts/ifcfg-eth0` | 인터페이스 설정 (**레드햇 계열**) |
| `/etc/network/interfaces` | 인터페이스 설정 (**데비안 계열**) |

### /etc/resolv.conf

```text
   nameserver 8.8.8.8
   nameserver 168.126.63.1
   search example.com
```

- **DNS 서버를 등록하는 파일**이다. 이 파일이 비어 있으면 도메인 이름을 IP로 바꿀 수 없다.
- **"DNS 서버 주소를 등록하는 파일은?"** 이라는 문제의 답이 바로 이것이다.

### /etc/hosts

```text
   127.0.0.1     localhost
   192.168.0.50  myserver
```

- **DNS보다 먼저 확인**한다. 여기에 적어 두면 DNS 없이도 이름으로 접속할 수 있다.
- 순서는 `/etc/nsswitch.conf`의 `hosts:` 줄이 정하며 보통 **`files dns`** — 즉 **`/etc/hosts` 먼저, 그다음 DNS**다.

| 파일 | 헷갈리지 않기 |
|------|-------------|
| **`/etc/hosts`** | **이름 ↔ IP 직접 대응** |
| **`/etc/resolv.conf`** | **물어볼 DNS 서버** |

> 두 파일을 바꿔 놓은 보기가 자주 나온다. **`hosts`는 답을 적어 두는 곳**, **`resolv.conf`는 물어볼 곳을 적어 두는 곳**이다.

> 내일은 이번 주의 네트워크 개념을 한 장으로 묶어 정리한다.

## 📖 용어

- **`lo`** : 루프백 인터페이스. 자기 자신과 통신할 때 사용한다.
- **`ifconfig` / `ip`** : 네트워크 인터페이스를 확인·설정하는 옛 명령 / 현재 표준 명령.
- **기본 게이트웨이** : 내부망 밖으로 나가는 통신이 거쳐 가는 라우터 주소.
- **`netstat` / `ss`** : 열린 포트와 연결 상태를 보는 옛 명령 / 현재 명령.
- **`ping`** : ICMP로 상대에게 닿는지 확인하는 명령.
- **`traceroute`** : 목적지까지 거치는 경로를 단계별로 보여 주는 명령.
- **`/etc/resolv.conf`** : 조회에 사용할 DNS 서버 주소를 등록하는 파일.
- **`/etc/hosts`** : 호스트 이름과 IP 주소를 직접 대응시켜 두는 파일.

## 📝 연습 문제

**문제 1.** 다음 중 DNS 서버의 주소를 등록하는 설정 파일로 알맞은 것은?

A) /etc/resolv.conf  
B) /etc/hosts  
C) /etc/hostname  
D) /etc/services  

**정답: A**  
해설: `/etc/resolv.conf`에는 `nameserver` 항목으로 조회에 사용할 DNS 서버의 주소를 적습니다. `/etc/hosts`는 이름과 IP를 직접 대응시켜 두는 파일이고, `/etc/hostname`은 자기 컴퓨터의 이름, `/etc/services`는 포트 번호와 서비스 이름의 대응을 담습니다.

---

**문제 2.** 다음 중 루프백 인터페이스를 나타내는 장치 이름으로 알맞은 것은?

A) eth0  
B) lo  
C) wlan0  
D) ens33  

**정답: B**  
해설: `lo`는 자기 자신과 통신할 때 사용하는 루프백 인터페이스로 IP 주소는 127.0.0.1입니다. 실제 랜카드가 없어도 항상 존재합니다. `eth0`과 `ens33`은 유선 랜카드, `wlan0`은 무선 랜카드의 이름입니다.

---

**문제 3.** 다음 중 목적지까지 데이터가 거쳐 가는 경로를 단계별로 확인하는 명령으로 알맞은 것은?

A) ping  
B) netstat  
C) arp  
D) traceroute  

**정답: D**  
해설: `traceroute`는 목적지에 도달할 때까지 거치는 라우터를 순서대로 보여 주므로 어느 구간에서 통신이 끊기는지 확인할 수 있습니다. `ping`은 목적지에 닿는지 여부만 알려 주고, `netstat`은 연결과 포트 상태를, `arp`는 MAC 주소 대응표를 보여 줍니다.

---

**문제 4.** 다음 중 현재 시스템에서 대기 중인 TCP 포트와 해당 프로세스를 확인하는 명령으로 알맞은 것은?

A) ping -t  
B) route -n  
C) netstat -tulpn  
D) arp -a  

**정답: C**  
해설: `-t`는 TCP, `-u`는 UDP, `-l`은 대기 중인 소켓, `-p`는 프로세스 이름, `-n`은 숫자 표시를 뜻하므로 이 조합으로 어떤 서비스가 어느 포트를 열고 있는지 확인할 수 있습니다. 최근에는 같은 일을 하는 `ss -tulpn`을 더 많이 사용합니다.

---

**문제 5.** 다음 중 `ifconfig` 명령을 대체하는 현재 표준 명령으로 알맞은 것은?

A) ip  
B) ss  
C) route  
D) arp  

**정답: A**  
해설: `ifconfig`는 net-tools 묶음의 옛 명령이며 현재는 iproute2 묶음의 `ip` 명령이 표준입니다. 주소 확인은 `ip addr`, 인터페이스 제어는 `ip link`, 라우팅은 `ip route`로 수행합니다. `ss`는 `netstat`을 대체하는 명령입니다.
