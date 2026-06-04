# Day 1 - VPC라는 가상 데이터센터, 그리고 운영자가 매일 헷갈리는 다섯 가지

VPC 콘솔을 처음 열면 단어가 많다. CIDR 블록, 서브넷, 라우팅 테이블, IGW, NAT, Security Group, NACL, Egress-Only IGW. 익숙해지면 그냥 클릭으로 끝나는 듯하지만 운영하다 보면 같은 사람이 같은 실수를 반복한다. "Private 서브넷인데 왜 외부 API 호출이 안 되지", "NACL을 다 ALLOW로 깔았는데 왜 응답이 끊기지", "/28 서브넷에 16대 띄울 줄 알았는데 11대에서 IP가 모자라네". 매일 누군가가 같은 함정에 빠진다.

이 글은 VPC의 부품을 외우는 글이 아니라, **왜 그렇게 설계됐는지**를 따라가는 글이다. AWS가 EC2 위에 한 겹의 가상 네트워크 레이어를 더 얹은 이유, Stateful 방화벽과 Stateless 방화벽을 둘 다 제공하는 이유, IPv6에 NAT를 만들지 않은 이유, 서브넷마다 5개 IP를 빼앗아 가는 이유 — 이 결정들을 이해하면 함정에 빠지는 빈도가 줄어든다.

## EC2-Classic의 유령 — VPC가 등장한 이유

지금은 모든 EC2 인스턴스가 반드시 VPC 안에 들어가지만, 2009년 이전엔 그렇지 않았다. AWS 초기엔 EC2-Classic이라는 모델이 있었고, 모든 고객이 같은 평면 네트워크(`10.0.0.0/8`)를 공유했다. 보안은 Security Group으로만 통제했고, 두 고객의 인스턴스가 같은 서브넷에 같이 있을 수도 있었다.

문제가 두 가지였다. 첫째, **사설 IP가 매번 바뀌었다** — EC2를 stop/start하면 사설 IP가 새로 할당돼 DB나 캐시 연결 문자열이 깨졌다. 둘째, **네트워크 격리가 약했다** — Security Group으로는 충분하지 않은 케이스(예: 같은 SG 안에서 두 인스턴스 차단)가 많았다. 그리고 가장 결정적으로, **온프레미스 데이터센터와 VPN으로 연결하려면 사설 대역 통제권이 필요했다**. 10.0.0.0/8 안에서 회사가 쓰는 10.5.0.0/16과 겹치면 라우팅이 불가능했다.

2009년 8월 AWS는 VPC를 도입했다. 처음엔 "EC2 안에서 별도로 만드는 격리된 네트워크"였지만, 2013년부터 신규 리전·신규 계정에서는 VPC가 기본이 됐고, 2017년 EC2-Classic은 신규 계정에서 사라졌다(기존 계정에서도 2022년 8월 완전 종료). 이 역사를 알면 시험에서 "왜 모든 EC2가 VPC에 들어가야 하나"에 대한 답이 쉬워진다 — 단지 보안 격리만이 아니라 **사설 IP 통제·VPN 호환·고객별 라우팅** 전부가 EC2-Classic으로는 불가능했기 때문이다.

> 💡 **관련 이론**: VPC의 모델은 사실 새 발명이 아니다. 1999년 RFC 2547에서 정의된 **BGP/MPLS IP VPN**이 같은 아이디어다 — "공용 인프라 위에 고객별 격리된 가상 네트워크를 얹는다". AWS VPC는 이 모델을 SDN(Software-Defined Networking)으로 구현한 것이고, 내부적으로 Mapping Service라는 컴포넌트가 모든 가상 IP를 물리 호스트에 매핑한다. 패킷이 인스턴스를 떠날 때 hypervisor가 가상 IP를 물리 IP로 캡슐화해 보내고, 받는 쪽 hypervisor가 다시 vIP로 디캡슐화한다. 이 방식은 VXLAN과 유사한 overlay network 패턴이다.

> 🔍 **더 깊이**: AWS는 2017년에 자체 SDN 칩(Nitro Card)을 도입하면서 이 mapping 기능을 hypervisor에서 칩으로 이동시켰다. 그 전엔 Xen hypervisor의 dom0가 가상 네트워킹을 처리했고, 이게 노이지 네이버 문제(다른 인스턴스의 트래픽 폭발이 내 인스턴스의 네트워크 성능에 영향)의 원인이었다. Nitro 이후 네트워크는 호스트 CPU와 완전히 분리됐고, 그래서 같은 시기 도입된 **Traffic Mirroring이 Nitro 인스턴스에서만 동작**한다(다음 글의 주제). 칩이 패킷을 보고 있어야 복사도 가능하다.

## CIDR — 5개 예약 IP가 어디로 사라지는가

서브넷을 만들 때마다 IP 5개가 사라진다. 이 사실은 다들 알지만 **왜** 5개인지는 보통 안 가르친다. `10.0.0.0/24` 서브넷의 예약 IP를 보면 다음과 같다.

| IP | 용도 | 이유 |
|----|------|------|
| `.0` | 네트워크 주소 | RFC 950 — 모든 비트가 0인 호스트 ID는 "이 네트워크 자체"를 의미 |
| `.1` | VPC 라우터 (default gateway) | 인스턴스의 기본 게이트웨이가 항상 서브넷의 두 번째 IP |
| `.2` | Amazon DNS | VPC의 `.2`가 DNS resolver 주소(`+2 from VPC CIDR base`) |
| `.3` | 미래 사용 (예약) | AWS가 SDN 기능 확장에 대비해 예약 |
| `.255` | 브로드캐스트 | RFC 919 — 모든 비트가 1인 호스트 ID는 브로드캐스트 |

처음 세 개와 마지막은 RFC 표준이거나 AWS가 실제로 쓰는 주소다. `.3`만이 "예비"인데, AWS는 이걸 향후 새 기능에 쓰기 위해 잡아두고 있다. 운영자 입장에서 가장 자주 데이는 곳이 **/28 서브넷**이다. 16개 IP에서 5개를 빼면 11개. RDS Multi-AZ 서브넷 그룹은 최소 2개 AZ가 필요한데, 각 서브넷이 /28이면 인스턴스 한 줌만 띄워도 IP가 모자란다. 그래서 데이터베이스 서브넷은 보통 /27이나 /26으로 잡는다.

> ⚠️ **함정**: VPC 자체의 CIDR도 사이즈 제약이 있다. `/16`이 가장 크고, `/28`이 가장 작다. `/16`보다 크게 잡을 수 없는 이유는 AWS 내부 mapping 테이블 크기 한계와 단일 VPC에 들어갈 수 있는 ENI 수(현재 65,536 미만)와 직접 연결돼 있다. `/16`이 넘으면 secondary CIDR를 추가하는 게 표준 패턴인데, 한 VPC에 최대 5개 추가(총 6개 CIDR)까지만 가능하다.

## Public vs Private — IGW 하나로 갈리는 두 세계

"Public 서브넷"이라는 게 실제로 무엇인지가 자주 혼동된다. **서브넷 자체에는 Public/Private 속성이 없다**. AWS 콘솔이 "Public subnet"이라고 표시하는 것은 그저 "라우팅 테이블에 `0.0.0.0/0 → igw-xxx` 경로가 있는 서브넷"의 라벨일 뿐이다. 같은 서브넷에서 라우팅 테이블만 바꾸면 Public이 Private이 된다.

Public 서브넷의 정의:

1. 서브넷의 라우팅 테이블에 `0.0.0.0/0 → igw-xxx` 경로가 있다
2. 인스턴스에 public IP나 Elastic IP가 할당돼 있다

두 조건이 **모두** 충족돼야 인터넷 통신이 된다. 라우팅만 있고 public IP가 없으면 외부에서 들어올 수 없고, public IP만 있고 라우팅이 없으면 패킷이 IGW까지 가지 못한다. "내 EC2에 public IP를 줬는데 왜 인터넷이 안 되지"의 90%는 이 두 조건 중 하나가 빠진 경우다.

Private 서브넷의 외부 통신은 NAT Gateway가 담당한다. NAT GW 자체는 Public 서브넷에 있어야 하고(자신은 IGW로 나가야 하니까), Private 서브넷의 라우팅 테이블이 `0.0.0.0/0 → nat-xxx`를 가리킨다. 이때 NAT GW는 자기 자신의 public IP/Elastic IP로 SNAT(Source NAT)를 수행한다 — Private 인스턴스의 사설 IP를 NAT GW의 공인 IP로 바꿔서 외부에 보내고, 응답이 돌아오면 connection tracking 테이블을 보고 원래 인스턴스에 돌려준다.

> 🔍 **더 깊이**: NAT Gateway는 AZ 단위로 설치한다. 멀티 AZ 구성에서 NAT GW를 AZ-a에만 두고 AZ-b의 Private 서브넷도 그걸 가리키게 하면, **AZ-a가 죽으면 AZ-b의 외부 통신도 모두 끊긴다**. 게다가 AZ-b에서 AZ-a로 가는 cross-AZ 데이터 전송 요금($0.01/GB)이 평소에도 청구된다. 운영 환경에서는 NAT GW를 각 AZ에 하나씩 두고, 각 AZ의 Private 서브넷이 자신의 AZ에 있는 NAT GW를 가리키도록 하는 게 표준이다.

> 📚 **사례**: 2020년 슬랙(Slack)이 한 차례 부분 장애를 겪었을 때 원인 중 하나가 NAT Gateway였다. 트래픽이 폭증하면서 단일 NAT GW의 connection tracking 한계(약 55k port per destination)에 부딪혔고, 새 연결이 SYN 단계에서 드롭됐다. 사후 분석에서 슬랙은 "NAT GW 자체는 가용성 99.99%지만, 단일 5-tuple 흐름 수와 destination당 포트 수 한계가 우리 규모에선 병목"이라고 밝혔다. 이후 슬랙은 NAT GW 여러 개 + per-VPC sharding으로 전환했다. AWS는 2021년 NAT GW의 IP당 동시 연결 한계를 IP를 여러 개 붙여 늘릴 수 있게 했다(Multi-IP NAT GW).

## Security Group과 NACL — Stateful과 Stateless를 둘 다 주는 이유

운영자 대부분이 SG만으로 충분한 보안을 구성한다. 그러면 NACL은 왜 존재하나? "이중 방어"라고 하지만 사실 두 도구는 **본질적으로 다른 문제를 푼다**.

Security Group은 **인스턴스(정확히는 ENI) 단위**의 stateful 방화벽이다. Stateful이라는 건 연결 추적(connection tracking)을 한다는 뜻 — 내가 80번 포트로 들어온 연결에 응답하면, 그 응답은 별도 규칙 없이 자동으로 통과한다. SG는 그래서 운영자가 "외부 → 80 ALLOW"만 적으면 끝난다.

NACL은 **서브넷 단위**의 stateless 방화벽이다. Connection tracking이 없으니 인바운드와 아웃바운드를 각각 따로 정의해야 한다. 외부에서 80으로 들어오는 요청을 허용했다면, 그 응답이 클라이언트의 ephemeral port(보통 32768-60999, OS 따라 1024-65535)로 나가는 것도 명시적으로 허용해야 한다. 이걸 빠뜨리면 "요청은 도착하는데 응답이 안 나가는" 미스터리한 상황이 생긴다.

| 축 | Security Group | Network ACL |
|----|----------------|-------------|
| 적용 위치 | ENI (인스턴스) | 서브넷 |
| State | Stateful | Stateless |
| 규칙 | Allow만 (암시적 Deny) | Allow + Deny 모두 |
| 평가 | 모든 규칙 OR | 번호 순 첫 매칭 |
| 응답 트래픽 | 자동 통과 | ephemeral port 명시 필요 |
| 기본값 | Default SG: 같은 SG끼리만 | Default NACL: 모두 허용 |
| 참조 | SG가 다른 SG를 참조 가능 | CIDR만 가능 |

그럼 왜 둘 다 필요한가? **세 가지 시나리오**가 있다.

첫째, **악성 IP 광역 차단**. SG는 Allow만 있어서 "이 IP만 막아라"가 안 된다. NACL의 Deny 규칙이 필요한 순간이다. 단일 IP/대역을 서브넷 전체에서 차단하려면 NACL이 유일한 선택이다(WAF가 있지만 그건 ALB/CloudFront 앞단이고, EC2 직접 접근은 막지 못한다).

둘째, **컴플라이언스 격리**. PCI-DSS나 HIPAA 같은 표준에서 "DB 서브넷은 외부 인터넷과 절대 통신할 수 없어야 한다"를 입증해야 할 때, SG 100개에 다 적용하는 것보다 NACL 한 줄로 "0.0.0.0/0 → Deny outbound"가 검증이 쉽다. 보안 감사관이 "한 곳에서 통제됨"을 좋아한다.

셋째, **휴먼 에러 안전망**. SG는 운영자가 실수로 "0.0.0.0/0 22번 ALLOW"를 깔 수 있다. NACL이 서브넷 레벨에서 22번을 사내 IP로만 제한해두면 SG 실수가 즉시 사고로 이어지지 않는다.

> 💡 **관련 이론**: Stateful vs Stateless 방화벽의 trade-off는 1990년대 후반 connection tracking이 도입된 Linux netfilter(`conntrack`)에서 결정됐다. Stateful은 메모리에 연결 상태를 저장하므로 메모리 한계가 있고(NAT GW의 55k 동시 연결 한계와 같은 이유), Stateless는 무한 확장이 가능하지만 규칙이 복잡해진다. AWS는 SG를 Stateful로 둠으로써 운영 편의를, NACL을 Stateless로 둠으로써 무한 확장과 Deny 표현력을 동시에 제공한다.

> ⚠️ **함정**: NACL의 ephemeral port 범위를 잘못 잡는 사고가 흔하다. Linux 커널 기본은 32768-60999, Windows는 1024-5000(legacy) 또는 49152-65535(Vista 이후), AWS NAT GW가 받는 응답은 1024-65535를 가정한다. 가장 안전한 건 그냥 **1024-65535를 다 허용**하는 것이다. 더 좁히면 일부 OS·일부 흐름이 끊긴다.

## NACL의 번호 순서 — 왜 100, 110, 120인가

NACL 규칙은 번호 순서대로 평가되고 **첫 매칭이 적용된다**. SG처럼 "모든 규칙을 OR로" 평가하지 않는다. 그래서 운영 가이드들이 보통 100부터 10씩 띄워서 (100, 110, 120) 번호를 매기라고 한다. 이게 왜인가? 나중에 "100과 110 사이에 새 규칙을 끼워넣어야 할 때" 105를 쓸 수 있게 하기 위함이다.

이 패턴은 BASIC 언어의 줄 번호 매기기(`10 PRINT "HELLO" / 20 GOTO 10`)에서 그대로 온 것이다. 1960년대 BASIC도 같은 이유로 10씩 띄워 줄 번호를 썼다 — 사이에 새 줄을 끼워넣기 위해. Cisco IOS의 ACL도 같은 컨벤션을 쓴다. AWS는 이 산업 표준을 그대로 따랐다.

가장 흔한 패턴:

```
인바운드:
  50  DENY   0.0.0.0/0       악성 IP 차단 (가장 우선)
  100 ALLOW  80   0.0.0.0/0  HTTP
  110 ALLOW  443  0.0.0.0/0  HTTPS
  120 ALLOW  22   10.0.0.0/8 내부 SSH
  130 ALLOW  1024-65535 0.0.0.0/0  응답 ephemeral
  * (암시적) DENY ALL

아웃바운드:
  100 ALLOW  1024-65535 0.0.0.0/0  응답
  110 ALLOW  80 0.0.0.0/0          외부 HTTP 호출
  120 ALLOW  443 0.0.0.0/0         외부 HTTPS 호출
```

> 🔍 **더 깊이**: NACL의 `*` 규칙은 변경할 수 없는 implicit deny다. 모든 사용자 정의 규칙 다음에 평가되고, 어떤 규칙에도 매칭되지 않은 트래픽은 여기서 차단된다. 시험에서 "NACL에서 65535보다 큰 번호의 규칙을 만들 수 있나"가 가끔 나오는데, 사용자 정의는 1-32766까지만 가능하고 그 이상은 AWS가 예약해뒀다.

## IPv6 — NAT가 없는 세계의 아름다움

IPv6를 처음 보면 AWS가 NAT Gateway IPv6 버전을 안 만든 게 이상해 보인다. "어? 그럼 어떻게 외부 통신만 허용하지?" 답은 **NAT가 IPv4의 주소 부족 문제를 우회하는 트릭이지, 보안 도구가 아니었다**는 사실에 있다.

IPv4 사설 대역(10.0.0.0/8 등)이 등장한 건 1996년 RFC 1918이고, 그때 이미 IP 주소 고갈이 보이기 시작했다. NAT는 1996년 RFC 1631에서 정의됐는데, 원래 목적은 "여러 내부 호스트가 하나의 공인 IP로 외부와 통신하게" 하는 주소 절약이었다. 그런데 부가 효과로 "외부에서 내부 호스트를 직접 지목할 수 없게" 되니 사람들이 NAT를 보안 도구로 오해하기 시작했다.

IPv6는 2^128개 주소(약 340 undecillion)가 있어서 모든 인스턴스가 공인 가능한 주소를 가질 수 있다. NAT는 사라지고, 대신 **방화벽으로 명시적 차단**을 한다. AWS의 Egress-Only Internet Gateway(EIGW)가 정확히 이 역할이다 — IPv6 인스턴스가 외부로 나가는 건 허용하되, 외부에서 들어오는 새 연결은 차단한다(stateful 방화벽처럼 응답은 통과).

```
IPv4 Private 서브넷:  NAT GW로 SNAT → IGW
IPv6 Private 서브넷:  EIGW로 stateful filter → IGW (주소 변환 없음)
```

> 💡 **관련 이론**: IPv6와 NAT의 관계는 IETF 내부에서 오랜 논쟁이었다. NAT 옹호자들은 "보안 측면이 있다"고 주장했지만, IETF는 RFC 4864(2007)에서 "NAT는 보안 기능이 아니다. 진짜 보안은 stateful firewall로 해야 한다"고 명시했다. AWS는 이 표준을 따라 IPv6에선 NAT를 만들지 않고 EIGW만 제공한다. EIGW는 내부적으로 stateful connection tracking을 수행한다는 점에서 NAT GW와 비슷하지만, 주소 변환은 하지 않는다.

> 📚 **사례**: T-Mobile US는 2014년부터 모바일 네트워크를 IPv6-only로 전환하기 시작했고, 2021년엔 자사 코어 네트워크에서 IPv4를 완전히 제거했다. 그들이 본 트래픽의 90% 이상이 IPv6로 흐른다. 이건 AWS의 IPv6 전략에도 영향을 줬다 — 2021년 AWS는 IPv4 주소에 시간당 $0.005 과금을 시작하면서(2024년 본격 시작) "IPv6로 옮겨가라"는 신호를 보냈다. 클라우드의 IPv6 채택이 본격화되는 중이다.

## DNS Hostname과 DNS Support — 두 토글의 의미

VPC 속성에 토글 두 개가 있다. `enableDnsSupport`와 `enableDnsHostnames`. 이름이 비슷해서 둘 다 켜는 게 맞나 싶지만 의미가 다르다.

`enableDnsSupport`(기본 켜짐)는 **VPC 안에 AWS DNS resolver(`.2` IP)를 둘지** 여부다. 이게 꺼지면 인스턴스가 도메인 이름을 IP로 변환할 수 없다 — `apt update`, `curl https://example.com` 같은 모든 명령이 깨진다. 이걸 끄는 경우는 거의 없다.

`enableDnsHostnames`(기본 꺼짐, default VPC만 켜짐)는 **AWS가 인스턴스에 public DNS 이름을 자동 부여할지** 여부다. 켜지면 인스턴스에 `ec2-203-0-113-5.compute-1.amazonaws.com` 같은 이름이 붙는다. VPC Endpoint(Interface)나 Private Hosted Zone을 쓰려면 **둘 다 켜져야 한다**.

> ⚠️ **함정**: 운영자가 새 VPC를 직접 만들면 두 토글이 기본 꺼져 있다(정확히는 enableDnsHostnames만). 이 상태에서 VPC Interface Endpoint를 만들면 endpoint는 생성되지만 인스턴스가 endpoint의 DNS 이름을 resolve하지 못해 사실상 못 쓰게 된다. 새 VPC를 만들면 두 토글 켜는 게 반사 행동이 돼야 한다.

## 다른 클라우드와의 비교

| 항목 | AWS VPC | GCP VPC | Azure VNet |
|------|---------|---------|------------|
| 범위 | 리전 단위 | **글로벌** (서브넷이 리전 단위) | 리전 단위 |
| 서브넷 단위 | AZ 단위 | **리전 단위** (다중 AZ 자동) | 리전 단위 |
| 라우팅 | 서브넷별 RT | VPC 전체 단일 RT | 서브넷별 UDR |
| Stateful 방화벽 | SG | Firewall Rules | NSG |
| Stateless 방화벽 | NACL | Hierarchical Firewall | (없음) |
| NAT | NAT Gateway | Cloud NAT | NAT Gateway |
| Private DNS | Route 53 PHZ | Cloud DNS | Private DNS Zones |

가장 큰 차이는 **GCP가 VPC를 글로벌하게 본다**는 점이다. 한 VPC 안에서 us-east1과 europe-west1 서브넷이 같이 있을 수 있고, 두 리전 인스턴스가 같은 사설 IP 대역에서 통신한다. AWS는 리전 단위라서 inter-region 통신은 VPC Peering이나 Transit Gateway가 필요하다. 이게 트레이드오프인데, AWS는 리전별 격리(Blast Radius)를 강조하고, GCP는 운영 단순성을 강조한다.

Azure NSG가 SG와 거의 같은 역할이고 Stateless NACL에 해당하는 게 Azure에는 없다 — Azure는 "ASG(Application Security Group)"라는 그룹 단위 추가 도구를 둬서 비슷한 효과를 낸다.

## 정리하며

VPC는 단순한 네트워크 컨테이너가 아니라, 2009년 이후 AWS가 EC2-Classic의 약점을 메우려고 만든 SDN 레이어다. 사설 IP 통제, VPN 호환, 멀티 테넌트 격리 — 이 세 요구를 동시에 풀려고 도입됐고, 그 후 Nitro 칩으로 hypervisor 부담까지 떼어냈다.

운영자가 매일 마주치는 함정은 대부분 다음 다섯 가지로 수렴한다. ① Public/Private의 본질은 라우팅 테이블, ② NACL은 stateless라 ephemeral port 양방향 명시, ③ /28 서브넷의 사용 가능 IP는 11개, ④ NAT GW는 AZ당 하나, ⑤ enableDnsHostnames와 enableDnsSupport는 둘 다 켜둬야 Endpoint가 동작한다. 이걸 몸으로 기억하면 시험 함정 70%가 사라진다.

다음 글에선 VPC를 만든 후 "트래픽이 어디로 흐르는지" 보는 도구들 — Flow Logs, Traffic Mirroring, Reachability Analyzer를 본다. 만든 네트워크가 의도대로 동작하는지 검증하는 게 그 다음 단계다.

---

## 📝 연습 문제

**문제 1.** Private 서브넷의 EC2가 외부 API를 호출해야 한다. 가장 적절한 구성은?

A) 보안 그룹에 0.0.0.0/0 아웃바운드 추가
B) Public IP를 인스턴스에 부여
C) NAT Gateway를 Public 서브넷에 두고 Private 서브넷의 라우팅 테이블에 `0.0.0.0/0 → nat-xxx`
D) IGW를 Private 서브넷에 직접 연결

**정답: C**

해설: Private 서브넷은 정의상 IGW로 가는 경로가 없다. 외부 통신을 위해선 NAT GW(자신은 Public 서브넷에 있어야 함)가 SNAT를 수행해 사설 IP를 자기 자신의 공인 IP로 바꿔 내보낸다. 운영 환경에선 NAT GW를 각 AZ에 하나씩 두는 게 표준 — AZ 한 곳이 죽어도 다른 AZ의 Private 서브넷 외부 통신이 끊기지 않게. 단일 NAT GW + 멀티 AZ Private 서브넷 구성은 가용성과 cross-AZ 데이터 전송 비용 두 측면에서 모두 손해다.

---

**문제 2.** 보안 그룹과 NACL의 차이로 잘못된 것은?

A) SG는 Stateful, NACL은 Stateless
B) SG는 Allow만, NACL은 Allow와 Deny 모두 가능
C) SG는 모든 규칙을 OR로 평가, NACL은 번호 순 첫 매칭
D) SG는 서브넷 단위, NACL은 ENI 단위 적용

**정답: D**

해설: 정확히 반대다. SG는 ENI(인스턴스) 단위, NACL은 서브넷 단위 적용. 이 차이가 두 도구를 함께 쓰는 이유 — 서브넷 전체에 적용할 광역 정책(예: 특정 악성 IP 차단, 컴플라이언스 격리)은 NACL이 적합하고, 개별 인스턴스의 세분화된 정책은 SG가 적합하다. 같은 서브넷에 있는 두 인스턴스라도 SG가 다르면 다른 정책이 적용된다.

---

**문제 3.** 신규 VPC에서 Custom NACL을 만들고 인바운드 80번만 허용했더니 HTTP 요청은 들어오는데 응답이 안 나간다. 원인은?

A) Internet Gateway가 attach되지 않음
B) NACL은 Stateless라 응답 트래픽이 나가는 ephemeral port(1024-65535) 아웃바운드도 명시해야 함
C) Security Group에서 차단
D) 라우팅 테이블의 0.0.0.0/0 경로가 없음

**정답: B**

해설: NACL의 가장 흔한 함정. SG는 Stateful이라 connection tracking으로 응답이 자동 통과하지만 NACL은 연결 상태를 추적하지 않는다. 클라이언트가 80번으로 요청을 보낼 때 source port는 OS가 할당한 ephemeral port(Linux는 32768-60999, Windows Vista 이후는 49152-65535)이고, 서버 응답은 그 ephemeral port로 돌아가야 한다. 가장 안전한 패턴은 NACL 아웃바운드에서 1024-65535 전체를 허용하는 것 — 더 좁히면 특정 OS·특정 흐름이 끊긴다.

---

**문제 4.** IPv6 Private 서브넷의 EC2가 외부로 나가는 통신만 가능하고 외부에서 들어오는 새 연결은 차단되게 하려면?

A) IPv6용 NAT Gateway 사용
B) Egress-Only Internet Gateway (EIGW) 사용 — IPv6 전용 stateful filter
C) VPC Endpoint로 모든 외부 통신 라우팅
D) Standard Internet Gateway에 인바운드 NACL Deny 추가

**정답: B**

해설: IPv6는 주소가 충분해서 NAT의 주소 변환 기능이 불필요하다. 하지만 "외부에서 들어오는 새 연결만 막고 싶다"는 요구는 여전히 있다 — 이게 EIGW의 역할. EIGW는 내부적으로 stateful connection tracking을 수행해서, 내부에서 시작한 연결의 응답은 통과시키고 외부에서 시작한 새 연결은 차단한다. IETF RFC 4864에서 "NAT는 보안이 아니다, stateful firewall이 보안이다"라고 정의한 모델의 직접 구현이다. AWS는 이 표준을 따라 IPv6에서 NAT를 만들지 않고 EIGW만 제공한다.

---

**문제 5.** `/28` 서브넷에 EC2 16대를 띄울 수 있나?

A) 가능
B) 불가능 — AWS가 예약하는 IP 5개 때문에 사용 가능 IP는 11개
C) 가능하지만 IPv6 옵션 필요
D) 불가능 — `/28`은 8개 IP만 제공

**정답: B**

해설: 모든 서브넷에서 AWS가 5개 IP를 예약한다. `.0`(네트워크 주소, RFC 950), `.1`(VPC 라우터/기본 게이트웨이), `.2`(Amazon DNS resolver), `.3`(AWS 예약 — 미래 기능용), 마지막 IP(`.255`나 `.15` — 브로드캐스트, RFC 919). `/28`은 16개 IP에서 5개를 빼면 11개. 이 함정 때문에 데이터베이스 서브넷은 보통 `/27`(32-5=27개) 이상으로 잡는다. RDS Multi-AZ 같은 구성은 서브넷 그룹에 최소 2개 AZ를 요구하므로 IP 계획 시 항상 5개 차감을 염두에 둬야 한다.

---

**문제 6.** 회사가 새 VPC를 만들고 VPC Interface Endpoint(예: SSM)를 추가했는데, EC2에서 endpoint의 DNS 이름이 resolve되지 않는다. 가장 가능성 높은 원인은?

A) IAM 권한 부족
B) VPC의 `enableDnsHostnames`가 꺼져 있음 (Interface Endpoint는 둘 다 켜져야 동작)
C) 서브넷 라우팅 테이블 누락
D) Security Group이 endpoint에서 오는 트래픽 차단

**정답: B**

해설: VPC를 콘솔에서 직접 만들면 `enableDnsHostnames`가 기본 꺼져 있다(default VPC만 자동 켜짐). Interface Endpoint는 endpoint별로 Private DNS 이름(예: `ssm.us-east-1.amazonaws.com`)을 등록해서 인스턴스가 동일한 도메인으로 endpoint를 호출하게 하는데, 이 Private DNS가 동작하려면 VPC가 두 토글(`enableDnsSupport` + `enableDnsHostnames`) 모두 켜져 있어야 한다. 새 VPC 만들 때 두 토글 켜는 게 반사 행동이 돼야 한다. 시험에선 "Interface Endpoint가 동작하지 않는다"는 시나리오로 자주 등장한다.

---

**문제 7.** 운영팀이 NACL을 정리하면서 규칙 번호를 100, 110, 120으로 매겼다. 왜 1, 2, 3이 아니라 10씩 띄우는가?

A) AWS 정책상 100 미만은 사용 불가
B) 나중에 두 규칙 사이에 새 규칙을 끼워넣기 위해 간격을 둔 컨벤션 (BASIC 줄 번호 매기기에서 유래)
C) Performance상 100의 배수가 빠름
D) Cisco IOS와의 호환성

**정답: B**

해설: NACL은 첫 매칭이 적용되므로 규칙 사이에 새 규칙을 끼워넣을 일이 생긴다. 100, 110, 120으로 띄워두면 나중에 "105번에 새 Deny 규칙 추가"가 가능하다. 1, 2, 3으로 매겼다면 사이에 끼울 수 없어서 기존 규칙 번호를 다 재배치해야 한다. 이 컨벤션은 1960년대 BASIC 언어의 줄 번호 매기기(`10 PRINT / 20 GOTO`)에서 그대로 왔고, Cisco IOS의 ACL도 같은 패턴을 쓴다. NACL 사용자 정의 번호는 1-32766까지 가능하다.

---
