# Day 1 - VPC Peering vs Transit Gateway: 네트워크 토폴로지의 선택

클라우드 네트워크를 설계할 때 가장 먼저 맞닥뜨리는 질문은 단순하다. "VPC 두 개를 연결하려면 어떻게 해야 하지?" 초기에는 VPC Peering이 명쾌한 해답처럼 보인다. 콘솔에서 몇 번 클릭하면 두 VPC가 서로 통신한다. 그런데 VPC가 다섯 개, 열 개, 오십 개로 늘어나는 순간, 처음의 명쾌함은 기하급수적인 복잡성으로 돌변한다. 이 복잡성을 근본적으로 해결하기 위해 AWS가 2018년 출시한 것이 Transit Gateway다. 오늘은 두 서비스의 아키텍처적 차이를 네트워크 이론의 관점에서 깊이 파헤치고, SAP-C02 시험이 즐겨 묻는 라우팅 격리 패턴까지 마스터한다.

## VPC Peering의 설계 철학과 기술적 한계

VPC Peering은 두 VPC 사이에 **논리적 직결 링크**를 만드는 기술이다. AWS 내부적으로는 두 VPC의 라우터가 상대방 VPC의 CIDR 블록으로 향하는 트래픽을 AWS 백본 네트워크를 통해 직접 전달한다. 별도의 게이트웨이나 프록시가 없으므로 지연시간이 매우 낮고, 대역폭은 VPC 내부 통신과 동일한 수준이다.

> 💡 **관련 이론**: 네트워크 토폴로지 이론에서 N개 노드를 모두 직접 연결하는 **완전 메시(Full Mesh)** 구조는 N(N-1)/2개의 링크를 필요로 한다. 10개 VPC면 45개, 50개 VPC면 1,225개, 100개 VPC면 4,950개의 Peering 연결이 필요하다. 링크 수가 O(N²)으로 증가하므로, 운영 복잡성은 실질적으로 관리 불가능 수준에 도달한다. 인터넷이 완전 메시 대신 BGP 기반 계층 라우팅을 채택한 이유도 동일하다.

VPC Peering의 가장 결정적인 한계는 **전이적 라우팅(Transitive Routing) 미지원**이다. VPC A가 VPC B와 Peering 연결되어 있고, VPC B가 VPC C와 Peering 연결되어 있어도, A는 C로 직접 통신할 수 없다. A→C 트래픽은 B를 경유해도 B가 이를 포워딩하지 않는다. 이는 설계 결함이 아니라 의도적인 보안 결정이다. 각 Peering 연결은 명시적으로 승인된 두 VPC 사이의 격리된 링크여야 한다는 원칙이 전이적 라우팅을 차단한다.

```
[VPC A] ──── Peering ────> [VPC B] ──── Peering ────> [VPC C]
    A에서 C로 직접 통신 불가 (B가 포워딩 거부)

[VPC A] ──────────────── 직접 Peering 필요 ────────────────> [VPC C]
```

> 💡 **관련 이론**: 전이적 라우팅 금지는 네트워크 보안의 **최소 경로 원칙(Principle of Least Path)**에서 비롯된다. 라우터가 자신이 명시적으로 알지 못하는 경로로 패킷을 포워딩하면 의도치 않은 트래픽 흐름이 발생한다. AWS는 이를 방지하기 위해 Peering 연결의 라우트 전파를 양 당사자 VPC로만 제한했다. RFC 4271(BGP-4)에서도 eBGP peer로부터 받은 경로를 다른 eBGP peer에 전파하는 것을 기본적으로 제한하는 것과 유사한 철학이다.

추가적인 제약으로 Peering된 두 VPC의 CIDR 블록이 겹치면 연결 자체가 불가능하다. 대규모 조직에서 CIDR 계획 없이 성장하다 보면 서브넷 충돌이 발생하고, 그 순간 Peering은 선택지에서 사라진다.

> 📚 **사례**: 2019년 한 글로벌 미디어 회사(공개 포스트모텀 기준)는 부서별로 독립적으로 AWS 계정을 운영하면서 동일한 10.0.0.0/8 대역을 중복 할당했다. 초기에는 각 부서가 독립적으로 운영되어 문제가 없었지만, 데이터 분석 플랫폼을 구축하면서 모든 계정의 데이터를 중앙 계정으로 모아야 했다. CIDR 충돌로 Peering이 불가능해지자, 비상 대책으로 NAT 레이어를 추가해 IP를 변환하는 임시 방편을 썼다. 이 경험이 이후 Transit Gateway 도입과 IP 주소 관리(IPAM) 체계화의 직접적인 계기가 됐다.

## Transit Gateway: 허브-앤-스포크의 구현

AWS Transit Gateway(TGW)는 2018년 11월 AWS re:Invent에서 발표됐다. 발표 당시 제프 바 AWS 수석 에반젤리스트는 "고객들이 VPC Peering의 메시 복잡성 때문에 네트워크 아키텍처를 단순하게 유지하지 못하고 있다"는 현실을 해결하기 위한 서비스라고 설명했다. TGW는 **허브-앤-스포크(Hub-and-Spoke)** 토폴로지를 AWS 관리형 서비스로 구현한 것이다.

```
                    ┌──────────────────────────┐
                    │      Transit Gateway      │
                    │    (리전 레벨 허브)        │
                    │  [Route Table 1: Workload] │
                    │  [Route Table 2: Shared]   │
                    └─────┬────────┬────────┬───┘
                          │        │        │
              ┌───────────┘   ┌────┘   ┌───┘
              ▼               ▼        ▼
        ┌─────────┐   ┌──────────┐  ┌──────────────┐
        │ VPC-Dev │   │ VPC-Prod │  │ VPC-Shared   │
        │10.1.0/16│   │10.2.0/16 │  │10.99.0/16    │
        │         │   │          │  │(DNS, AD, NTP) │
        └─────────┘   └──────────┘  └──────────────┘
                          │
                    ┌─────┴──────┐
                    │ On-Premises │
                    │ (DX / VPN)  │
                    └────────────┘
```

TGW의 핵심 구성 요소는 **Attachment(부착)**과 **Route Table(라우트 테이블)**이다. VPC, VPN 연결, Direct Connect Gateway, 다른 리전 TGW 피어링, TGW Connect(SD-WAN)가 모두 Attachment로 TGW에 연결된다. 각 Attachment는 하나 이상의 Route Table에 연관되고, 다른 Attachment의 라우트를 학습(Propagation)하거나 정적 라우트를 수신(Association)한다.

> 💡 **관련 이론**: TGW는 내부적으로 **ECMP(Equal-Cost Multi-Path)** 라우팅을 지원한다. 동일한 목적지로 향하는 여러 VPN 또는 DX 경로가 있을 때 트래픽을 분산시켜 대역폭을 선형으로 확장한다. RFC 2992는 ECMP 구현의 기본 원칙을 정의한다. AWS의 TGW ECMP는 VPN over TGW에서 최대 50Gbps(VPN 터널 당 1.25Gbps × 40 터널)의 집계 대역폭을 달성할 수 있다.

> 🔍 **더 깊이**: TGW의 내부 데이터 플레인은 AWS의 **Nitro 네트워킹 스택**을 기반으로 한다. 각 Availability Zone 내에 분산된 TGW 인스턴스들이 있으며, VPC Attachment는 각 AZ의 서브넷에 ENI(Elastic Network Interface)를 생성해 연결된다. 이 분산 아키텍처 덕분에 단일 AZ 장애 시에도 다른 AZ를 통한 트래픽이 지속된다. TGW 자체는 AWS가 완전 관리하므로 사용자가 AZ 이중화를 별도로 구성할 필요가 없다.

## TGW Route Table 격리 패턴 (시험 핵심)

TGW의 Route Table 설계가 SAP-C02 시험에서 반복적으로 등장하는 이유는, 이 기능이 대규모 엔터프라이즈 네트워크의 논리적 분리 요구사항을 충족하는 핵심 메커니즘이기 때문이다. 기본 개념은 두 가지다: **Association**(어느 Route Table의 라우팅 결정을 받을지)과 **Propagation**(어떤 Route Table에 자신의 CIDR을 광고할지).

### 패턴 1: 공유 서비스 격리 (시험 최빈출)

개발 VPC와 프로덕션 VPC는 서로 통신하지 않아야 하지만, 두 환경 모두 공유 DNS 서버, Active Directory, 패치 서버가 있는 Shared VPC에는 접근해야 한다.

```
[TGW Route Table 구성]

RT-Workload (Dev, Prod이 Association):
  └── 10.99.0.0/16 → Shared Attachment (정적 또는 Propagation으로 학습)
  ※ Dev CIDR, Prod CIDR는 이 RT에 Propagation하지 않음 → Dev↔Prod 통신 불가

RT-Shared (Shared VPC가 Association):
  ├── 10.1.0.0/16 → Dev Attachment (Propagation)
  └── 10.2.0.0/16 → Prod Attachment (Propagation)
  ※ Shared는 Dev와 Prod 모두 알고 통신 가능
```

Dev에서 Prod로 패킷을 보내면, 패킷이 TGW에 도착하고 RT-Workload를 조회한다. RT-Workload에는 Prod의 CIDR(10.2.0.0/16)이 없으므로 블랙홀(Blackhole) 처리된다. 이것이 격리의 본질이다.

> 🎯 **시나리오**: 글로벌 금융 회사가 AWS Organizations로 개발(Dev), 스테이징(Stage), 프로덕션(Prod), 공유 서비스(Shared), 보안(Security) 5개 OU를 운영한다. 개발팀이 실수로 Prod에 접근하는 사고가 반복되어, 네트워크 레벨에서 완전한 격리가 필요하다. 동시에 모든 환경이 Shared의 AD와 DNS, Security의 로그 수집기에는 접근해야 한다. TGW Route Table 패턴에서 RT-Workload와 RT-Shared, RT-Security 세 개의 Route Table로 이 요구사항을 충족할 수 있다. SCP로 IAM 수준 격리를 추가하면 Defense in Depth가 완성된다.

### 패턴 2: 인터넷 송신 중앙화 (Centralized Egress)

NAT Gateway는 AZ당 생성되고 비용이 발생한다. 50개 VPC가 각자 NAT Gateway를 두면 AZ 2개 기준 100개의 NAT Gateway 비용이 누적된다. TGW를 활용하면 Egress VPC에만 NAT Gateway를 두고 모든 VPC의 아웃바운드 인터넷 트래픽을 이 VPC를 통해 집중시킬 수 있다.

```
[모든 스포크 VPC의 기본 라우트]
0.0.0.0/0 → TGW

[TGW RT-Workload]
0.0.0.0/0 → Egress VPC Attachment

[Egress VPC]
NAT Gateway → Internet Gateway → 인터넷
```

> ⚠️ **함정**: 중앙화 Egress 패턴을 구현할 때 헤어피닝(Hairpinning) 문제가 발생할 수 있다. 스포크 VPC에서 Egress VPC로 트래픽이 TGW를 통해 도달했을 때, Egress VPC의 라우트 테이블에서 리턴 트래픽이 올바르게 TGW를 통해 원래 VPC로 돌아가야 한다. 이를 위해 Egress VPC의 프라이빗 서브넷 라우트 테이블에 각 스포크 VPC의 CIDR에 대한 TGW 라우트를 명시적으로 추가해야 한다. 이 라우트를 빠뜨리면 비대칭 라우팅으로 연결이 실패한다.

### 패턴 3: Blackhole 라우트를 이용한 명시적 차단

TGW Route Table에 특정 CIDR에 대해 Blackhole 라우트를 추가하면, 해당 대역으로 향하는 트래픽을 명시적으로 드롭할 수 있다. 이는 Propagation으로 라우트가 학습되더라도 특정 트래픽만 차단하는 세밀한 제어에 유용하다.

```bash
aws ec2 create-transit-gateway-route \
  --transit-gateway-route-table-id tgw-rtb-xxx \
  --destination-cidr-block 10.2.0.0/16 \
  --blackhole
```

> 💡 **관련 이론**: 네트워크에서 Null Route 또는 Blackhole 라우트는 불필요한 패킷을 CPU 처리 없이 즉시 드롭하는 기법이다. DDoS 공격 완화에도 사용된다. RFC 3882는 BGP를 이용한 Blackhole 라우팅(RTBH, Remotely-Triggered Black Hole)을 표준화했다. TGW의 Blackhole 라우트는 이 개념을 VPC 네트워킹에 적용한 것이다.

## TGW 내부 동작 원리: 패킷의 여정

TGW가 실제로 패킷을 어떻게 처리하는지 이해하면 라우팅 문제를 디버깅할 때 훨씬 빨리 원인을 찾을 수 있다.

VPC-Dev(10.1.0.0/16)의 EC2 인스턴스가 VPC-Shared(10.99.0.0/16)의 DNS 서버로 패킷을 보낸다고 가정하자.

1. EC2의 VPC 라우트 테이블: `10.99.0.0/16 → tgw-xxx` 항목이 있어야 한다. 없으면 로컬 라우트로 처리되어 실패한다.
2. 패킷이 TGW에 도달한다. TGW는 패킷의 소스 Attachment(Dev VPC Attachment)를 확인한다.
3. Dev VPC Attachment가 Association된 Route Table(RT-Workload)을 조회한다.
4. RT-Workload에 `10.99.0.0/16 → Shared Attachment` 라우트가 있으면 Shared Attachment로 전달한다.
5. Shared VPC의 서브넷 라우트 테이블에서 `10.99.x.x` 목적지가 로컬로 처리된다.
6. 리턴 패킷: Shared의 DNS 서버가 응답할 때, Shared VPC 라우트 테이블에 `10.1.0.0/16 → tgw-xxx`가 있어야 한다.
7. 리턴 패킷이 TGW에 도달하고, Shared VPC Attachment가 Association된 RT-Shared를 조회한다.
8. RT-Shared에 `10.1.0.0/16 → Dev Attachment`가 있으면 Dev VPC로 전달된다.

> 🔍 **더 깊이**: TGW의 라우팅 결정은 **Association 기반**이다. 즉, 패킷이 들어온 Attachment의 Association된 Route Table이 라우팅 결정권을 갖는다. 반면 Propagation은 자신의 CIDR을 다른 Route Table에 광고하는 것이다. 이 비대칭성을 이해하지 못하면 라우팅 구성이 복잡해질수록 디버깅이 불가능해진다. VPC Flow Logs와 TGW Flow Logs를 조합해 패킷 경로를 추적할 수 있다.

## TGW Inter-Region Peering과 Cloud WAN

단일 리전으로 시작한 아키텍처가 글로벌로 확장되면 리전 간 연결이 필요해진다. TGW Inter-Region Peering은 두 리전의 TGW를 AWS 글로벌 백본 네트워크를 통해 연결한다.

중요한 제약이 있다. TGW Inter-Region Peering도 **전이적이지 않다**. us-east-1 TGW가 eu-west-1 TGW와 피어링되어 있고, eu-west-1 TGW가 ap-northeast-1 TGW와 피어링되어 있어도, us-east-1에서 ap-northeast-1로 직접 라우팅되지 않는다. 세 리전 모두 완전히 통신하려면 us-east-1 ↔ ap-northeast-1 피어링도 별도로 구성해야 한다.

| 항목 | TGW | TGW Inter-Region Peering | AWS Cloud WAN |
|------|-----|--------------------------|---------------|
| 범위 | 단일 리전 | 두 리전 간 | 글로벌 멀티 리전 |
| 관리 방식 | Route Table 직접 구성 | 양쪽 TGW RT에 정적 라우트 | 정책 문서(JSON) |
| 전이적 라우팅 | 지원(리전 내) | 미지원 | 지원(코어 네트워크 정책) |
| SD-WAN 통합 | TGW Connect(GRE) | - | 네이티브 지원 |
| 운영 복잡성 | 중간 | 높음 | 낮음(정책 기반) |
| 비용 | 리전 내 처리 비용 | 데이터 전송 비용 추가 | Core Network Edge 비용 |

> 💡 **관련 이론**: Cloud WAN의 설계는 **Software-Defined WAN(SD-WAN)**의 중앙집중형 제어 평면 철학을 반영한다. SD-WAN은 데이터 플레인(실제 패킷 전송)과 제어 평면(라우팅 결정)을 분리해 중앙에서 정책을 배포한다. Cloud WAN의 "Global Network Policy"가 제어 평면이고, 각 리전의 Core Network Edge가 데이터 플레인이다. 이는 BGP 기반의 분산 라우팅(TGW)과는 근본적으로 다른 접근법이다.

> 📚 **사례**: Netflix는 글로벌 스트리밍 인프라를 위해 us-east-1, eu-west-1, ap-northeast-1 등 여러 리전에 TGW를 두고 Inter-Region Peering으로 연결했다. 그러나 피어링 구성의 복잡성이 증가하자(각 TGW 쌍에 대한 정적 라우트 관리), Cloud WAN 도입을 검토했다. Cloud WAN의 정책 기반 관리는 라우팅 구성 오류를 크게 줄였다는 후기가 2023년 AWS re:Invent에서 발표됐다.

## 다른 클라우드와의 비교

| 항목 | AWS TGW | GCP Cloud Router + VPC Network Peering | Azure Virtual WAN |
|------|---------|----------------------------------------|-------------------|
| 허브 서비스 | Transit Gateway | VPC Network Peering(메시) + Cloud Interconnect | Virtual WAN Hub |
| 전이적 라우팅 | 지원(TGW 내) | 미지원(Peering 간) | 지원 |
| SD-WAN 통합 | TGW Connect | 파트너 솔루션 | 네이티브 SD-WAN 파트너 |
| 라우팅 프로토콜 | BGP(VPN/DX) | BGP(Cloud Interconnect) | BGP |
| 멀티 리전 | TGW Peering or Cloud WAN | 리전별 VPC + Interconnect | Virtual WAN 글로벌 |
| 최대 연결 수 | VPC 5,000개/TGW | Peering 25개/VPC | 제한 있음 |

> 🔍 **더 깊이**: GCP의 VPC는 글로벌 단일 VPC 개념이라 AWS처럼 리전 간 Peering 문제가 없다. GCP VPC 내 서브넷은 리전에 종속되지만 VPC는 글로벌하므로, 같은 VPC 내 도쿄와 뉴욕 서브넷이 자동으로 통신한다. AWS의 VPC는 리전 스코프여서 리전 간 연결에 별도 메커니즘이 필요하다. 이 아키텍처 차이가 두 플랫폼의 멀티 리전 네트워킹 복잡성 차이를 만든다.

## RAM을 이용한 TGW 멀티 계정 공유

대규모 기업은 AWS Organizations를 통해 수십~수백 개의 계정을 운영한다. 각 계정에 TGW를 별도로 만들면 관리 포인트가 폭발적으로 늘어난다. AWS Resource Access Manager(RAM)로 TGW를 Organizations 내 다른 계정과 공유하면 중앙 네트워크 계정에서 TGW를 단일 관리할 수 있다.

```bash
# 네트워크 계정에서 TGW를 RAM으로 공유
aws ram create-resource-share \
  --name "TGW-Share-Org" \
  --resource-arns "arn:aws:ec2:us-east-1:NETWORK_ACCT:transit-gateway/tgw-xxx" \
  --principals "arn:aws:organizations::ROOT_ACCT:organization/o-xxx" \
  --allow-external-principals false

# 워크로드 계정에서 공유된 TGW에 VPC Attachment 생성
aws ec2 create-transit-gateway-vpc-attachment \
  --transit-gateway-id tgw-xxx \  # 네트워크 계정 소유 TGW
  --vpc-id vpc-yyy \
  --subnet-ids subnet-aaa subnet-bbb
```

> 🎯 **시나리오**: 대형 전자상거래 기업이 AWS Organizations로 마스터 계정, 네트워크 계정, 보안 계정, 그리고 비즈니스 유닛별 80개 워크로드 계정을 운영한다. 네트워크 팀이 TGW 하나를 네트워크 계정에 생성하고 RAM으로 전체 Org에 공유한다. 워크로드 계정의 VPC들이 이 TGW에 Attach한다. 라우팅 제어는 네트워크 팀이 중앙에서 한다. 새로운 비즈니스 유닛이 계정을 만들어도 기존 TGW에 Attach하면 되므로 네트워크 온보딩이 표준화된다.

## TGW Connect: SD-WAN 통합

온프레미스에서 Cisco SD-WAN, VMware SD-WAN(VeloCloud), Aviatrix 같은 SD-WAN 솔루션을 운영하는 기업이 AWS로 확장할 때 TGW Connect를 활용한다. TGW Connect는 GRE(Generic Routing Encapsulation) 터널 위에서 BGP를 실행해 SD-WAN 어플라이언스와 동적 라우팅을 교환한다.

```
[온프레미스 SD-WAN] ──── GRE Tunnel ────> [TGW Connect Attachment]
                         BGP Session                │
                                              [TGW Route Table]
                                                    │
                                            [스포크 VPC들]
```

> 💡 **관련 이론**: GRE(RFC 2784)는 임의의 프로토콜 패킷을 다른 프로토콜로 캡슐화하는 터널링 기법이다. TGW Connect에서 GRE는 BGP 피어 간의 터널을 형성하는 용도로 사용된다. BGP(RFC 4271)는 AS(Autonomous System) 간의 경로 교환 프로토콜로, TGW Connect에서는 SD-WAN 어플라이언스와 TGW 간에 BGP 세션을 맺어 동적으로 라우트를 학습한다.

## TGW Multicast: 금융·미디어 특화

일부 금융 거래 시스템이나 미디어 스트리밍에서는 단일 소스에서 다수 수신자에게 동시에 동일한 데이터를 전달하는 **멀티캐스트**가 필요하다. TGW는 멀티캐스트 도메인을 지원해 이러한 워크로드를 AWS로 이전할 수 있게 한다.

> 🔍 **더 깊이**: 인터넷 멀티캐스트는 IGMP(Internet Group Management Protocol)와 PIM(Protocol Independent Multicast)을 기반으로 한다. AWS TGW의 멀티캐스트는 IGMP v2/v3을 지원하고, 멀티캐스트 그룹 멤버십을 TGW가 관리한다. 금융 시세 데이터(시장 데이터 피드)는 수천 개의 수신자에게 동일한 데이터를 실시간으로 전달해야 하므로 유니캐스트로는 대역폭이 선형으로 증가하지만 멀티캐스트로는 소스 대역폭이 일정하다.

## 실전 CLI: TGW 격리 패턴 구현

```bash
# TGW 생성 (기본 RT 자동 생성 비활성화 — 직접 제어)
aws ec2 create-transit-gateway \
  --description "Enterprise Hub" \
  --options "AmazonSideAsn=64512,\
             AutoAcceptSharedAttachments=disable,\
             DefaultRouteTableAssociation=disable,\
             DefaultRouteTablePropagation=disable,\
             MulticastSupport=enable"

# Route Table 2개 생성
aws ec2 create-transit-gateway-route-table \
  --transit-gateway-id tgw-xxx \
  --tag-specifications 'ResourceType=transit-gateway-route-table,Tags=[{Key=Name,Value=RT-Workload}]'

aws ec2 create-transit-gateway-route-table \
  --transit-gateway-id tgw-xxx \
  --tag-specifications 'ResourceType=transit-gateway-route-table,Tags=[{Key=Name,Value=RT-Shared}]'

# Dev VPC Attachment → RT-Workload에 Association
aws ec2 associate-transit-gateway-route-table \
  --transit-gateway-attachment-id tgw-attach-dev \
  --transit-gateway-route-table-id tgw-rtb-workload

# Shared VPC가 RT-Workload에 CIDR 광고 (Propagation)
aws ec2 enable-transit-gateway-route-table-propagation \
  --transit-gateway-attachment-id tgw-attach-shared \
  --transit-gateway-route-table-id tgw-rtb-workload

# Shared VPC Attachment → RT-Shared에 Association
aws ec2 associate-transit-gateway-route-table \
  --transit-gateway-attachment-id tgw-attach-shared \
  --transit-gateway-route-table-id tgw-rtb-shared

# Dev, Prod가 RT-Shared에 CIDR 광고
aws ec2 enable-transit-gateway-route-table-propagation \
  --transit-gateway-attachment-id tgw-attach-dev \
  --transit-gateway-route-table-id tgw-rtb-shared

aws ec2 enable-transit-gateway-route-table-propagation \
  --transit-gateway-attachment-id tgw-attach-prod \
  --transit-gateway-route-table-id tgw-rtb-shared
```

SAP-C02 시험에서 TGW 관련 문제는 주로 "어떤 Route Table 설계가 이 격리 요구사항을 충족하는가"를 묻는다. 핵심은 Association이 라우팅 결정권을 갖고, Propagation이 라우트 광고를 제어한다는 점이다. Dev↔Prod 격리는 두 Attachment의 CIDR이 RT-Workload에 Propagation되지 않도록 막는 것으로 달성된다.

> ⚠️ **함정**: TGW를 생성할 때 `DefaultRouteTableAssociation=enable`과 `DefaultRouteTablePropagation=enable`이 기본값이다. 이 설정으로 생성하면 모든 새 Attachment가 기본 RT에 자동으로 Association되고 CIDR을 기본 RT에 Propagation한다. 격리 패턴을 구현하려면 반드시 두 옵션을 모두 `disable`로 설정하고 수동으로 RT를 관리해야 한다. 기존 TGW에서 변경하면 이미 Association된 Attachment들이 기본 RT에 남아 있으므로 주의가 필요하다.

## 정리하며

VPC Peering은 CIDR이 겹치지 않는 두 VPC를 직접 연결할 때 여전히 유효한 선택이다. 지연시간이 가장 낮고 추가 비용이 없다. 그러나 VPC가 세 개 이상이고 격리 요구사항이 있거나, VPN/Direct Connect를 포함한 하이브리드 토폴로지가 필요하다면 TGW가 올바른 선택이다. 글로벌 멀티 리전 네트워크라면 Cloud WAN이 운영 복잡성을 크게 줄여준다. 이 세 가지 선택지의 트레이드오프를 명확히 이해하는 것이 SAP-C02 네트워크 도메인의 출발점이다.

---

## 📝 연습 문제

**문제 1.** 글로벌 제조업체가 AWS Organizations로 80개 계정을 운영한다. 모든 계정의 VPC가 중앙 보안 VPC(IDS/IPS, 로그 수집)와 공유 서비스 VPC(DNS, AD)에는 접근해야 하지만, 개발 계정과 프로덕션 계정 간의 직접 통신은 차단해야 한다. 운영 부담을 최소화하면서 이 요구사항을 충족하는 방법은?

A) 모든 VPC 간 VPC Peering 구성 + NACL로 Dev↔Prod 차단
B) TGW 1개를 RAM으로 전체 Org에 공유 + TGW Route Table로 Workload RT와 Shared/Security RT 분리
C) 각 계정에 별도 TGW 생성 + TGW Inter-Region Peering으로 연결
D) Direct Connect Gateway로 온프레미스를 중계자로 활용

**정답: B**
해설: 80개 계정에 VPC가 하나씩만 있어도 VPC Peering은 3,160개가 필요하고(80×79/2), NACL로 Dev↔Prod를 차단하는 것은 CIDR 범위가 겹치거나 변경될 때 유지보수가 불가능하다(A 오답). 각 계정에 TGW를 별도 생성하면 TGW 80개 + 그 간의 피어링 관리가 폭발적으로 증가한다(C 오답). Direct Connect는 온프레미스 연결 서비스지 VPC 간 라우팅 허브가 아니다(D 오답). B의 구성에서 TGW를 RAM으로 전체 Org에 공유하면 모든 계정이 단일 TGW에 Attach할 수 있다. RT-Workload에는 Shared/Security CIDR만 있고 Dev/Prod CIDR는 없으므로 Dev↔Prod가 차단된다. RT-Shared에는 Dev/Prod CIDR가 Propagation되어 Shared와 Security는 모든 VPC와 통신 가능하다.

---

**문제 2.** 미국 동부(us-east-1), 유럽(eu-west-1), 아시아(ap-northeast-1) 세 리전에 TGW를 운영하는 기업이 있다. us-east-1 TGW와 eu-west-1 TGW가 Inter-Region Peering으로 연결되어 있고, eu-west-1 TGW와 ap-northeast-1 TGW도 연결되어 있다. us-east-1의 VPC A가 ap-northeast-1의 VPC B와 통신하려 한다. 어떻게 해야 하는가?

A) 이미 eu-west-1을 통한 전이적 라우팅이 자동으로 설정된다
B) us-east-1 TGW와 ap-northeast-1 TGW 간에 별도 Inter-Region Peering을 추가해야 한다
C) VPC A에서 VPC B로 VPC Peering을 직접 구성한다
D) Cloud Front를 중계자로 사용한다

**정답: B**
해설: TGW Inter-Region Peering은 전이적이지 않다(A 오답). us-east-1 TGW는 eu-west-1 TGW의 라우트를 학습하지만, eu-west-1을 통해 ap-northeast-1로 라우팅이 자동으로 설정되지 않는다. 세 리전이 완전히 통신하려면 각 TGW 쌍 사이에 피어링이 필요하다(us↔eu, eu↔ap, us↔ap). 리전 간 VPC Peering은 가능하지만 TGW 없이 구성하면 확장성이 없다(C 오답). CloudFront는 CDN 서비스로 VPC 간 라우팅과 무관하다(D 오답).

---

**문제 3.** 회사가 TGW를 생성할 때 `DefaultRouteTableAssociation=enable`로 생성했다. 이후 격리 패턴을 구현하기 위해 새 Route Table을 만들었다. 기존에 생성된 VPC Attachment들의 동작은?

A) 기존 Attachment는 자동으로 새 Route Table로 마이그레이션된다
B) 기존 Attachment는 기본 Route Table에 남아 있어 격리 패턴이 의도대로 동작하지 않을 수 있다
C) 기존 Attachment는 라우팅이 중단된다
D) 기존 Attachment는 삭제하고 다시 생성해야 한다

**정답: B**
해설: `DefaultRouteTableAssociation=enable`로 생성된 TGW에 Attach된 VPC는 기본 Route Table에 자동 Association된다. 이후에 새 Route Table을 만들어도 기존 Attachment는 기본 RT에 그대로 남는다. 격리 패턴을 완성하려면 기존 Attachment를 기본 RT에서 dis-associate하고 새 RT에 associate해야 하며, 이 과정에서 잠깐 라우팅이 끊어질 수 있다. 따라서 새 TGW를 설계할 때는 처음부터 `DefaultRouteTableAssociation=disable`로 생성하고 수동으로 RT를 관리하는 것이 권장된다.

---

**문제 4.** 금융 회사가 50개 스포크 VPC를 TGW를 통해 연결하면서 모든 아웃바운드 인터넷 트래픽을 중앙 Egress VPC의 NAT Gateway를 통해 집중시키려 한다. 설계 시 반드시 확인해야 할 사항은?

A) 각 스포크 VPC에 인터넷 게이트웨이를 추가한다
B) Egress VPC의 프라이빗 서브넷 라우트 테이블에 각 스포크 VPC CIDR에 대한 TGW 라우트를 추가한다
C) TGW Route Table에 0.0.0.0/0을 Blackhole로 설정한다
D) Egress VPC에 NAT Gateway를 각 AZ당 하나씩 추가하고 각 스포크 VPC에도 동일하게 구성한다

**정답: B**
해설: 중앙화 Egress 패턴에서 스포크 VPC의 기본 라우트(0.0.0.0/0)는 TGW를 가리킨다. TGW는 이 트래픽을 Egress VPC로 전달한다. Egress VPC의 NAT Gateway가 인터넷으로 내보내고, 리턴 트래픽이 Egress VPC에 도달한다. 이 리턴 트래픽이 올바른 스포크 VPC로 돌아가려면 Egress VPC의 프라이빗 서브넷 RT에 각 스포크 CIDR에 대한 `→ TGW` 라우트가 있어야 한다(B 정답). 없으면 비대칭 라우팅으로 연결이 끊어진다. 스포크 VPC에 개별 인터넷 게이트웨이를 두면 중앙화의 의미가 없다(A 오답). Blackhole은 트래픽을 드롭하므로 인터넷 접근이 불가능해진다(C 오답). D는 중앙화가 아니라 분산 구성이다.

---

**문제 5.** 온프레미스에서 Cisco SD-WAN을 운영하는 기업이 AWS TGW와 동적 BGP 라우팅으로 연결하려 한다. 가장 적합한 방식은?

A) Site-to-Site VPN (IKEv2) + BGP
B) TGW Connect (GRE 터널 + BGP)
C) Direct Connect (Private VIF) + BGP
D) VPC Peering + 정적 라우트

**정답: B**
해설: TGW Connect는 SD-WAN 어플라이언스를 GRE 터널로 TGW에 연결하고, 그 위에서 BGP 세션을 맺어 동적 라우팅을 교환하는 SD-WAN 통합 전용 기능이다. Site-to-Site VPN도 BGP를 지원하지만, SD-WAN 어플라이언스는 보통 GRE 기반의 TGW Connect가 더 자연스러운 통합 방식이고 ECMP로 대역폭을 높일 수 있다(A는 가능하지만 B가 더 최적). Direct Connect는 물리적 전용선으로 온프레미스↔AWS 연결이지만, SD-WAN과의 동적 통합에는 TGW Connect가 더 적합하다(C는 대역폭은 높지만 SD-WAN 동적 통합의 표준 답은 아님). VPC Peering은 VPC 간 연결이지 온프레미스 연결 기술이 아니다(D 오답).

---

**문제 6.** 한 기업이 TGW를 도입하면서 특정 스포크 VPC가 다른 특정 VPC와 절대 통신하지 못하게 해야 한다. TGW Route Table의 Propagation은 이미 설정되어 있다. 추가로 취할 수 있는 조치는?

A) 해당 VPC의 Security Group에서 상대방 VPC CIDR를 차단
B) TGW Route Table에 상대방 VPC CIDR에 대한 Blackhole 라우트 추가
C) 두 VPC 사이에 VPC Peering을 역방향으로 설정
D) NACL에서 TGW의 IP를 차단

**정답: B**
해설: Propagation으로 이미 상대방 CIDR이 Route Table에 학습된 상태에서 특정 CIDR만 차단하려면 Blackhole 라우트를 추가한다. Blackhole 라우트는 더 구체적인 경로(더 긴 프리픽스)로 설정하면 Propagation으로 학습된 더 광범위한 라우트보다 우선된다. Security Group(A)은 VPC 내 인스턴스 레벨에서 동작하고 TGW 라우팅을 제어하지 않는다. VPC Peering 역방향 설정(C)은 의미가 없다. NACL에서 TGW IP를 차단하면(D) 모든 TGW 트래픽이 차단되어 다른 정상적인 연결도 끊어진다.

---

**문제 7.** 회사가 us-east-1, eu-west-1 두 리전의 VPC를 TGW로 운영한다. GDPR 규정으로 EU 사용자 데이터는 eu-west-1에만 저장되어야 하고 us-east-1로 복제되지 않아야 한다. 동시에 두 리전의 운영팀이 공통 Shared 서비스(운영 도구)에는 접근할 수 있어야 한다. 가장 적합한 아키텍처는?

A) DynamoDB Global Table로 양 리전 데이터 동기화 + TGW Inter-Region Peering
B) 각 리전에 독립 TGW 운영 + 리전 간 TGW Peering 없음 + 공용 Shared 서비스만 별도 PrivateLink로 노출
C) AWS Cloud WAN으로 전체 글로벌 네트워크 단일 정책 관리 + 데이터 복제 허용
D) Route 53 Geolocation Routing으로 트래픽 분리 + TGW Inter-Region Peering

**정답: B**
해설: GDPR 데이터 주권의 핵심은 EU 데이터가 EU 리전을 벗어나지 않는 것이다. TGW Inter-Region Peering을 구성하면 라우팅이 리전 간에 가능해지고 실수로 데이터가 이동할 위험이 있다(A, D 오답). Cloud WAN도 글로벌 연결성을 제공하므로 데이터가 리전 간에 이동할 수 있는 경로가 생긴다(C 오답). B는 각 리전이 완전히 독립된 TGW를 운영해 데이터가 리전 간에 라우팅되는 경로 자체가 없다. Shared 서비스(예: 중앙 모니터링 도구)는 PrivateLink로 노출해 데이터가 아닌 API 호출만 리전 간에 이동하도록 제한한다.
