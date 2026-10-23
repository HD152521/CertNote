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

### 출력 읽기

같은 인터페이스를 두 명령으로 보면 이렇게 나온다.

```text
$ ifconfig eth0
eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 192.168.0.10  netmask 255.255.255.0  broadcast 192.168.0.255
        ether 00:1a:2b:3c:4d:5e  txqueuelen 1000  (Ethernet)

$ ip addr show eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    link/ether 00:1a:2b:3c:4d:5e brd ff:ff:ff:ff:ff:ff
    inet 192.168.0.10/24 brd 192.168.0.255 scope global eth0
       valid_lft forever preferred_lft forever
```

| 알고 싶은 것 | `ifconfig` 에서 | `ip addr` 에서 |
|------------|---------------|--------------|
| **IP 주소** | `inet` 뒤 | `inet` 뒤 |
| **서브넷마스크** | `netmask 255.255.255.0` | 주소 뒤의 **`/24`** |
| 브로드캐스트 주소 | `broadcast` 뒤 | `brd` 뒤 |
| **MAC 주소** | **`ether`** 뒤 | **`link/ether`** 뒤 |
| 켜져 있는가 | 괄호 안의 `UP` | 괄호 안의 `UP`, `state UP` |

- **마스크 표기가 다르다.** `ifconfig`는 `255.255.255.0`, `ip`는 `/24`로 보여 준다. 어제 배운 대로 둘은 같은 값이다. 브로드캐스트 주소 `192.168.0.255`도 `/24`에서 호스트 비트를 전부 1로 채운 값과 맞는다.
- `ifconfig`를 인자 없이 치면 **켜져 있는 것만** 나온다. 꺼진 인터페이스까지 보려면 **`ifconfig -a`** 다. `ip addr`은 기본으로 전부 보여 준다.
- `ip` 는 **`ip 대상 동작`** 꼴이다. 대상이 `addr`(주소) · `link`(장치 자체) · `route`(경로) · `neigh`(이웃, 곧 ARP 표)로 나뉜다. **주소는 `addr`, 켜고 끄는 것은 `link`** 라는 점을 섞어 묻는다.

```bash
ifconfig eth0 192.168.0.10 netmask 255.255.255.0 up   # 주소·마스크 지정하고 켜기
ifconfig eth0 down                                    # 끄기
ip link set eth0 down                                 # 같은 일
route add default gw 192.168.0.1                      # 기본 게이트웨이 등록
ip route add default via 192.168.0.1                  # 같은 일
route del default                                     # 삭제
```

> ⚠️ **명령으로 넣은 주소와 경로는 재부팅하면 사라진다.** 메모리에만 반영되기 때문이다. 계속 유지하려면 아래의 **설정 파일**에 적어야 한다. "재부팅 후에도 유지되게 하려면"이라는 조건이 붙으면 답은 명령이 아니라 파일이다.

- 옛 명령과 새 명령은 **낱말이 다르다.** 기본 게이트웨이를 `route`는 **`gw`**, `ip route`는 **`via`** 로 적는다.

### 기본 게이트웨이

```bash
ip route
# default via 192.168.0.1 dev eth0     ← 기본 게이트웨이
route -n
# 0.0.0.0    192.168.0.1   0.0.0.0   UG   ...
```

- **`default`(또는 `0.0.0.0`)로 시작하는 줄이 기본 게이트웨이**다. 내부망 밖으로 나가는 모든 통신이 이리로 간다.

```text
$ route -n
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         192.168.0.1     0.0.0.0         UG    100    0        0 eth0
192.168.0.0     0.0.0.0         255.255.255.0   U     100    0        0 eth0
```

| 열 | 읽는 법 |
|----|--------|
| `Destination` | 어디로 가는 길인가. **`0.0.0.0`은 "그 밖의 모든 곳"** |
| `Gateway` | 거쳐 갈 라우터. **`0.0.0.0`이면 거치지 않고 직접** 보낸다 |
| `Genmask` | 그 목적지의 서브넷마스크 |
| `Flags` | **`U`** 경로가 살아 있다(Up) · **`G`** 게이트웨이를 거친다 |
| `Iface` | 내보낼 인터페이스 |

- 둘째 줄은 **같은 망(192.168.0.0/24)은 게이트웨이 없이 직접** 보낸다는 뜻이다. 첫째 줄은 나머지 전부를 192.168.0.1에 넘긴다는 뜻이다.
- 컴퓨터는 목적지가 **자기 망 안인지 밖인지**를 서브넷마스크로 가린다. 안이면 직접, 밖이면 기본 게이트웨이로 보낸다. **마스크를 잘못 넣으면 같은 망인데도 통신이 안 되는** 까닭이다.
- `route`와 **`netstat -r`** 은 같은 표를 보여 준다. `-n`은 둘 다 "이름으로 바꾸지 말고 숫자 그대로"다.

### ARP 표

```text
$ arp -n
Address                  HWtype  HWaddress           Flags Mask            Iface
192.168.0.1              ether   00:11:22:33:44:55   C                     eth0
```

- **같은 망 안에서 실제 전달은 MAC 주소로** 이루어진다. 그래서 IP만 아는 상대에게 보내려면 먼저 그 IP의 MAC을 알아내야 하고, 그 결과를 잠시 적어 두는 곳이 ARP 표다.
- `arp -a`는 전체 보기, **`arp -d 주소`는 삭제, `arp -s 주소 MAC`은 수동 등록**이다.
- 표에 올라오는 것은 **같은 망의 장치뿐**이다. 망 밖의 상대는 기본 게이트웨이의 MAC으로 보내므로 표에는 게이트웨이만 보인다.

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

```text
# netstat -tlnp
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1023/sshd
tcp        0      0 127.0.0.1:25            0.0.0.0:*               LISTEN      1187/master
```

- `Local Address`는 **`주소:포트`** 꼴이다. **`0.0.0.0:22`는 어느 주소로 들어오든 22번에서 받는다**는 뜻이고, **`127.0.0.1:25`는 이 컴퓨터 안에서 온 접속만** 받는다는 뜻이다. 둘째 줄의 서비스는 포트가 열려 있어도 밖에서는 접속할 수 없다.
- `State`의 **`LISTEN`은 접속을 기다리는 중**이다. `-l`을 빼고 `-a`로 보면 이미 연결된 것(`ESTABLISHED`)까지 나온다.
- **`-p`로 남의 프로세스 이름까지 보려면 root 권한**이 필요하다. 일반 사용자로 실행하면 그 칸이 `-`로 비어 나온다.

| 옵션 | `netstat`으로 보는 것 |
|------|-------------------|
| **`-r`** | **라우팅 표** (`route`와 같다) |
| **`-i`** | **인터페이스별** 송수신 통계 |
| `-s` | 프로토콜별 통계 |
| `-an` | 모든 소켓을 숫자로 |

- **`netstat` 하나로 포트·연결·라우팅·인터페이스 통계를 다 본다.** "라우팅 표를 볼 수 있는 명령이 아닌 것"을 고를 때 `netstat -r`을 빠뜨리지 않는다.

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

```text
$ ping -c 4 192.168.0.1
PING 192.168.0.1 (192.168.0.1) 56(84) bytes of data.
64 bytes from 192.168.0.1: icmp_seq=1 ttl=64 time=0.412 ms
64 bytes from 192.168.0.1: icmp_seq=2 ttl=64 time=0.398 ms
64 bytes from 192.168.0.1: icmp_seq=3 ttl=64 time=0.455 ms
64 bytes from 192.168.0.1: icmp_seq=4 ttl=64 time=0.419 ms

--- 192.168.0.1 ping statistics ---
4 packets transmitted, 4 received, 0% packet loss, time 3004ms
rtt min/avg/max/mdev = 0.398/0.421/0.455/0.021 ms
```

| 보는 곳 | 뜻 |
|--------|-----|
| `icmp_seq` | 몇 번째로 보낸 것인가. **번호가 건너뛰면 그 사이가 유실**된 것 |
| `ttl` | 남은 수명. **라우터를 하나 지날 때마다 1씩 준다** |
| `time` | 갔다 오는 데 걸린 시간 |
| `packet loss` | 유실률. **0%면 정상**, 100%면 전혀 닿지 않는다 |
| `rtt min/avg/max` | 왕복 시간의 최소/평균/최대 |

- **리눅스의 `ping`은 멈추라고 할 때까지 계속 보낸다.** `Ctrl+C`로 끝내거나 **`-c 횟수`** 로 미리 정한다. 그 밖에 `-i`는 보내는 간격(초), `-s`는 크기다.
- `traceroute`는 이 **TTL**을 이용한다. TTL을 1, 2, 3 …으로 늘려 가며 보내면 그 값이 0이 되는 지점의 라우터가 차례로 응답해 경로가 드러난다. 중간에 `* * *` 만 나오는 줄은 그 라우터가 응답하지 않은 것이다.

### 어디서 끊겼나 — 가까운 곳부터

| 순서 | 확인 | 실패하면 의심할 곳 |
|-----|------|----------------|
| 1 | `ping 127.0.0.1` | 이 컴퓨터의 네트워크 기능 자체 |
| 2 | `ping 192.168.0.10` (자기 IP) | 주소가 인터페이스에 제대로 들어가 있지 않다 → `ip addr` |
| 3 | `ping 192.168.0.1` (게이트웨이) | 케이블, **IP·서브넷마스크 설정** |
| 4 | `ping 8.8.8.8` (외부 IP) | **기본 게이트웨이** 미등록 → `ip route` |
| 5 | `ping www.example.com` (이름) | **DNS** → `/etc/resolv.conf` |

- **안쪽에서 바깥쪽으로** 나가며 처음 실패하는 단계가 고장 난 곳이다.
- 4번까지 되고 5번만 안 되면 **주소로는 통하는데 이름을 못 바꾸는** 상황이다. 랜선이나 게이트웨이가 아니라 DNS 설정을 본다.
- 그 밖에 **`ethtool eth0`** 은 랜카드의 **속도·링크 연결 여부**를 보여 준다. 같은 일을 하던 옛 도구가 `mii-tool`이다. 케이블이 물리적으로 붙어 있는지부터 확인할 때 쓴다.

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

> 두 파일을 바꿔 놓은 보기가 오답으로 쓰이기 쉽다. **`hosts`는 답을 적어 두는 곳**, **`resolv.conf`는 물어볼 곳을 적어 두는 곳**이다.

- `/etc/hosts` 한 줄은 **`IP주소  이름  [별칭 …]`** 순서다. **IP가 먼저** 온다.
- `/etc/resolv.conf`의 `nameserver`는 **위에 적힌 것부터** 물어보고, 응답이 없을 때 다음 줄로 넘어간다. `search example.com`은 이름을 짧게 `www`만 쳤을 때 뒤에 붙여 볼 도메인이다.

### 인터페이스 설정 파일 (레드햇 계열)

```text
   # /etc/sysconfig/network-scripts/ifcfg-eth0
   DEVICE=eth0
   BOOTPROTO=static
   ONBOOT=yes
   IPADDR=192.168.0.10
   NETMASK=255.255.255.0
   GATEWAY=192.168.0.1
   DNS1=8.8.8.8
```

| 항목 | 뜻 |
|------|-----|
| `DEVICE` | 이 파일이 설정하는 장치 이름. 파일 이름의 `ifcfg-` 뒤와 같다 |
| **`BOOTPROTO`** | 주소를 받는 방법. **`static`은 직접 지정, `dhcp`는 자동 할당** |
| **`ONBOOT`** | **부팅할 때 자동으로 켤지** (`yes`/`no`) |
| `IPADDR` · `NETMASK` · `GATEWAY` | 주소 · 서브넷마스크 · 기본 게이트웨이 |

- `BOOTPROTO=dhcp`면 `IPADDR` 이하를 적지 않는다. 주소를 서버가 내려 주기 때문이다.
- 이 파일의 위치와 형식은 **배포판과 버전에 따라 다르다.** 데비안 계열은 `/etc/network/interfaces`를 써 왔고, 최근 배포판들은 NetworkManager 같은 별도 도구가 설정을 관리해 이 파일이 없기도 하다. 시험에서는 **"레드햇 계열의 인터페이스 설정 파일"** 로 `ifcfg-장치명`을 묻는다.

| 바꾸려는 것 | 그때만 (명령) | 계속 유지 (파일) |
|-----------|------------|---------------|
| IP 주소 | `ifconfig`, `ip addr add` | `ifcfg-eth0` |
| 기본 게이트웨이 | `route add default gw`, `ip route add default via` | `ifcfg-eth0`의 `GATEWAY` |
| DNS 서버 | — | **`/etc/resolv.conf`** |
| 이름 ↔ IP 직접 대응 | — | **`/etc/hosts`** |
| 호스트 이름 | `hostname 새이름` | **`/etc/hostname`** |

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
