# Day 2 - Direct Connect 아키텍처와 이중화: 전용선의 물리학

온프레미스 데이터센터와 AWS를 연결하는 방법은 크게 두 가지다. 인터넷 위에 암호화 터널을 올리는 VPN, 그리고 물리적으로 전용 회선을 구축하는 Direct Connect. 개념은 단순하지만 AWS에서 Direct Connect를 제대로 설계하려면 BGP 라우팅 제어, VIF 종류 선택, 이중화 토폴로지, 페일오버 메커니즘까지 깊은 이해가 필요하다. SAP-C02에서 Direct Connect 문제는 단순 기능 암기가 아니라 "이 시나리오에서 어떤 VIF, 어떤 이중화, 어떤 BGP 조작이 정답인가"를 묻는다. 오늘은 DX의 물리 계층부터 BGP 우선순위 조작까지 전 스택을 다룬다.

## Direct Connect의 물리적 현실: 전용선이란 무엇인가

Direct Connect는 온프레미스 장비와 AWS DX Location(물리적 코로케이션 시설)을 **전용 광섬유 케이블**로 연결한다. 이 케이블은 공유 인터넷 인프라를 전혀 통과하지 않는다. AWS DX Location에서 AWS 네트워크로의 연결은 AWS가 직접 운영하는 백본을 통해 이루어진다.

> 💡 **관련 이론**: 광섬유 전송에서 DWDM(Dense Wavelength Division Multiplexing, RFC 6241 참조)은 단일 광섬유에 서로 다른 파장(색깔)의 빛을 다중화해 수십 개의 독립 채널을 운용한다. AWS DX의 100Gbps 회선은 DWDM 기술로 단일 물리 케이블에 10Gbps 채널 10개를 묶는 방식을 사용한다. 이것이 "같은 케이블 경로"를 공유하는 DX 회선이 공통 장애 지점이 될 수 있는 이유다.

DX 연결의 프로비저닝 과정은 다음과 같다. AWS 콘솔에서 연결을 요청하면 DX Location에서 LOA-CFA(Letter of Authorization — Connecting Facility Assignment) 문서를 받는다. 이 문서를 DX Location 운영 업체(코로케이션 시설)에 제출하면 교차 연결(Cross Connect)이 설치된다. 이후 온프레미스 라우터에서 DX Location까지의 물리 회선을 별도 통신사(AT&T, Verizon, KT 등)가 구성한다. 전체 과정이 **수주에서 수개월**이 걸리는 이유가 이 물리적 공사 과정 때문이다.

> 📚 **사례**: 2020년 한 대형 금융기관이 코어 뱅킹 시스템을 AWS로 이전하면서 Direct Connect 프로비저닝 지연으로 일정이 6주 밀렸다. LOA-CFA 발급은 1주일 만에 됐지만 코로케이션 시설의 교차 연결 설치 대기열이 3주, 통신사의 최종 마일 광섬유 공사가 2주였다. 이 경험으로 조직은 이후 프로젝트에서 DX 프로비저닝을 주 크리티컬 패스에 넣고 6개월 전에 시작하는 프로세스를 수립했다.

## VIF(Virtual Interface) 3종: 선택의 기준

DX 물리 연결 위에는 논리적 VIF(Virtual Interface)를 올린다. VIF는 VLAN과 BGP 피어링으로 구성되며, 목적에 따라 세 종류가 있다.

### Private VIF: 단일 VPC의 사설 IP 접근

Private VIF는 온프레미스에서 특정 VPC의 사설 IP 주소(예: 10.x.x.x)로 직접 접근할 때 사용한다. VPC에 연결된 VGW(Virtual Private Gateway)와 BGP 세션을 맺는다.

```
온프레미스 라우터
    │ BGP (Private VIF, VLAN 100)
    ▼
DX Location
    │ AWS 내부 네트워크
    ▼
VGW (Virtual Private Gateway)
    │ VPC Route Table에 온프레미스 CIDR 광고
    ▼
VPC (단일 VPC)
```

Private VIF의 결정적 한계는 **단일 VGW만 연결**할 수 있다는 것이다. 하나의 Private VIF로 여러 VPC에 동시 접근하거나 여러 리전의 VPC에 접근하는 것은 불가능하다.

### Public VIF: AWS 공개 서비스를 사설망에서 접근

Public VIF는 인터넷을 경유하지 않고 S3, DynamoDB, SQS, ECR 같은 AWS 공개 엔드포인트에 접근할 때 사용한다. Public VIF를 통해 AWS는 자신이 소유한 전체 IPv4/IPv6 공개 주소 범위를 BGP로 광고한다.

> 🔍 **더 깊이**: Public VIF를 활성화하면 BGP 세션을 통해 수만 개의 AWS 공개 IP 프리픽스가 온프레미스 라우터에 광고된다. 온프레미스 라우터가 이 경로들을 수용하려면 **BGP 라우팅 테이블 용량**이 충분해야 한다. 일부 엔터프라이즈 라우터는 기본 BGP 테이블 크기 제한이 있어 Public VIF 활성화 시 라우터 CPU 과부하가 발생한 사례가 있다. 실무에서는 BGP 필터(prefix-list, route-map)로 필요한 서비스의 IP 범위만 수용하도록 제한한다.

### Transit VIF: TGW를 통한 멀티 VPC·멀티 리전 접근

Transit VIF는 DX Gateway(DXGW)와 BGP 세션을 맺고, DXGW가 Transit Gateway(TGW)와 연결되어 TGW에 연결된 모든 VPC에 단일 DX 회선으로 접근하는 구성이다.

```
온프레미스 라우터
    │ BGP (Transit VIF, VLAN 200)
    ▼
DX Location ──────────────────────────────────────────
                                                      │
                              DX Gateway (글로벌 리소스)
                                    │
                          ┌─────────┴─────────┐
                          │                   │
                    TGW (us-east-1)     TGW (eu-west-1)
                    │    │    │           │    │    │
                 VPC1 VPC2 VPC3        VPC4 VPC5 VPC6
```

> ⚠️ **함정**: DXGW를 통해 TGW에 연결할 때 **온프레미스 광고 CIDR 제한**이 있다. DXGW는 최대 20개의 허용 프리픽스를 받을 수 있고, VPC 측에서는 최대 200개의 프리픽스를 온프레미스로 광고할 수 있다. 대규모 조직에서 VPC가 200개를 넘으면 경로 집약(Route Summarization)이 필수다. CIDR 체계를 처음부터 계층적으로 설계하지 않으면 나중에 집약이 불가능해진다.

| VIF 종류 | 연결 대상 | 멀티 VPC | 멀티 리전 | 주요 사용 사례 |
|----------|-----------|----------|-----------|---------------|
| Private VIF | 단일 VGW(VPC) | 불가 | 불가 | 소규모 단일 VPC 연결 |
| Public VIF | AWS 공개 서비스 | N/A | 글로벌 | S3, DynamoDB 프라이빗 접근 |
| Transit VIF | DX Gateway → TGW | 가능 | 가능(DXGW 경유) | 엔터프라이즈 멀티 VPC/리전 |

## Direct Connect Gateway: 글로벌 라우팅 허브

DX Gateway(DXGW)는 AWS 글로벌 서비스로, 특정 리전에 귀속되지 않는다. 단일 DX 연결에서 DXGW를 통해 여러 리전의 TGW에 연결하면 온프레미스에서 모든 리전의 VPC에 단일 물리 회선으로 접근할 수 있다.

> 💡 **관련 이론**: DXGW는 AWS 내부적으로 **분산 라우팅 플레인**으로 구현된다. 물리적으로 특정 리전에 있는 것이 아니라 AWS 글로벌 백본 전체에 분산된 라우팅 상태를 유지한다. 온프레미스에서 광고된 CIDR이 DXGW에 도달하면, DXGW는 연결된 TGW들에게 이 경로를 BGP로 전달한다. 각 TGW는 이 경로를 자신에게 연결된 VPC의 라우트 테이블에 주입한다. 이 과정이 비동기적으로 일어나므로, DXGW와 TGW를 연결한 직후 라우트가 VPC에 완전히 전파되기까지 수 분이 걸릴 수 있다.

## LAG(Link Aggregation Group): 대역폭과 이중화의 결합

단일 DX 회선의 대역폭이 부족하거나 단일 포트 장애에 대한 이중화가 필요할 때 LAG를 구성한다. LAG는 LACP(Link Aggregation Control Protocol, IEEE 802.3ad)로 여러 물리 포트를 하나의 논리 인터페이스로 묶는다.

```
[온프레미스 라우터]          [DX Location]
Bond 인터페이스 ─┐
                ├── 10G 포트 1 ──┐
                └── 10G 포트 2 ──┤── 논리 20Gbps 인터페이스 ──> AWS
                                 └── (포트 1 장애 시 포트 2가 자동으로 모든 트래픽 처리)
```

> 💡 **관련 이론**: LACP(RFC 4127)는 협상 기반의 링크 집합 프로토콜이다. 양쪽 장비가 LACP PDU(Protocol Data Unit)를 교환해 집합에 참여할 포트를 협상한다. AWS DX의 LAG는 같은 DX Location의 같은 AWS 디바이스에 있는 포트만 묶을 수 있다. 최대 4개 포트, 동일 대역폭 조건이 있다. 즉 10Gbps 포트 4개로 최대 40Gbps 논리 인터페이스를 만들 수 있다. 단, LACP는 물리적 장애(포트 손상, 케이블 단선)에는 빠르게 반응하지만, 경로 장애(DX Location 전체 다운)에는 BGP와 BFD가 필요하다.

LAG의 제약을 이해하는 것이 중요하다. LAG는 **같은 DX Location** 내에서만 작동한다. 서로 다른 DX Location의 회선은 LAG로 묶을 수 없다. 따라서 LAG는 대역폭 증설과 단일 포트 장애 방어에는 효과적이지만, DX Location 전체 장애(시설 화재, 네트워크 장비 전체 다운) 시나리오에는 무력하다.

## DX 이중화 아키텍처: SLA와 비용의 트레이드오프

AWS는 DX의 복원력 수준을 세 단계로 정의한다. 이 설계가 SAP-C02에서 반복적으로 등장한다.

### Maximum Resiliency: 99.99% SLA

```
온프레미스 라우터 A ─── DX Location 서울 1 ───┐
온프레미스 라우터 A ─── DX Location 서울 1 ───┤  (같은 Location, 다른 장비/케이블)
                                              ├── DXGW ── TGW ── VPCs
온프레미스 라우터 B ─── DX Location 서울 2 ───┤
온프레미스 라우터 B ─── DX Location 서울 2 ───┘
                         (다른 Location)
```

핵심은 **두 가지 독립성**이다. 첫째, 서로 다른 DX Location(물리적으로 다른 시설). 둘째, 각 Location에서 서로 다른 물리 장비와 케이블 경로. AWS의 DX Resiliency Toolkit이 이 구성을 자동으로 검증한다. 총 4개 회선으로 단일 장비 장애, 단일 Location 장애 모두에 대응한다.

### High Resiliency: 99.9% SLA

```
온프레미스 ─── DX Location A ───┐
                                ├── DXGW ── TGW ── VPCs
온프레미스 ─── DX Location B ───┘
```

두 개의 다른 DX Location에 각 1개 회선. 총 2개 회선. 단일 Location 장애에 대응하지만, 각 Location 내의 단일 포트/케이블 장애 시 서비스가 중단될 수 있다.

### Development: 99% SLA + VPN 백업

```
온프레미스 ─── DX Location A ───── AWS (기본 경로)
온프레미스 ─── 인터넷 VPN ─────── AWS (백업 경로, BGP로 낮은 우선순위)
```

DX 회선 1개와 Site-to-Site VPN 백업의 조합. DX가 다운되면 VPN으로 자동 페일오버. 대역폭은 VPN의 제약을 받지만 비용은 가장 낮다. 비프로덕션 환경이나 중요도가 낮은 워크로드에 적합하다.

> 🎯 **시나리오**: 글로벌 자동차 제조업체가 한국에서 공장 자동화 데이터(로봇 제어 피드백, 품질 검사 이미지)를 AWS에서 실시간 분석한다. 공장이 멈추면 시간당 수억 원 손실이 발생하므로 DX 연결 장애는 용납할 수 없다. 한국 DX Location은 서울 상암과 가산 두 곳이 있다. Maximum Resiliency 구성으로 각 Location에 2개씩 총 4개 회선을 구성한다. 온프레미스 라우터도 이중화해 SPOF를 제거한다. 비용은 4개 회선이므로 High Resiliency의 2배지만, 공장 중단 비용 대비 정당화된다.

## BGP 우선순위 제어: DX vs VPN 페일오버

DX와 VPN을 동시에 운영할 때 평상시 DX를 우선으로 사용하고 DX 장애 시 VPN으로 자동 전환하려면 BGP 속성 조작이 필요하다.

### AWS → 온프레미스 방향 (인바운드 트래픽 제어)

AWS가 온프레미스로 트래픽을 보낼 때, AWS 측에서 선호하는 경로를 제어하려면 온프레미스가 두 경로(DX, VPN)에서 광고하는 BGP 속성을 다르게 설정해야 한다.

```
DX 경로: MED (Multi-Exit Discriminator) 값을 낮게 (예: 100) → AWS가 선호
VPN 경로: MED 값을 높게 (예: 200) → AWS가 덜 선호

또는:

DX 경로: AS Path 짧게 (예: 65000)
VPN 경로: AS Path Prepending (예: 65000 65000 65000) → AS Path 길수록 덜 선호
```

> 💡 **관련 이론**: BGP 경로 선택 알고리즘(RFC 4271)은 여러 속성을 순서대로 비교한다. 가장 높은 우선순위부터: Local Preference(높을수록 선호) → AS Path 길이(짧을수록 선호) → Origin(IGP > EGP > Incomplete) → MED(낮을수록 선호) → eBGP vs iBGP → IGP 메트릭. AWS는 DX와 VPN 간의 경로 선택에서 주로 Local Preference와 AS Path Prepending을 활용한다. AWS 측 BGP의 Local Preference는 DX가 VPN보다 높게 설정되어 있어, 특별히 조작하지 않아도 DX가 기본적으로 우선된다.

### 온프레미스 → AWS 방향 (아웃바운드 트래픽 제어)

온프레미스가 AWS로 트래픽을 보낼 때, 온프레미스 라우터에서 DX 경로에 높은 Local Preference를 설정하면 VPN보다 DX를 우선 사용한다. DX가 다운되면 Local Preference가 높은 경로가 사라지고 VPN 경로가 활성화된다.

```bash
# 시스코 라우터 예시 (BGP route-map)
route-map PREFER-DX permit 10
 set local-preference 200   # DX 경로: Local Pref 높게

route-map PREFER-VPN permit 10
 set local-preference 100   # VPN 경로: Local Pref 낮게

router bgp 65000
 neighbor [DX_BGP_IP] route-map PREFER-DX in
 neighbor [VPN_BGP_IP] route-map PREFER-VPN in
```

## BFD: 빠른 장애 감지

BGP 기본 설정에서 keepalive 간격은 60초, hold time은 180초다. 즉 장애 발생 후 BGP 세션이 끊어지기까지 최대 180초(3분)가 걸린다. 페일오버가 3분 후에 시작된다는 의미다.

BFD(Bidirectional Forwarding Detection, RFC 5880)는 이를 **1초 미만**으로 단축한다. BFD는 BGP와 독립적으로 100ms 간격으로 hello 패킷을 교환하고, 3번 연속 실패하면 300ms 후 링크 다운을 선언하고 BGP에 통보한다. BGP는 BFD의 통보를 받는 즉시 대안 경로로 전환한다.

> 🔍 **더 깊이**: BFD는 두 가지 모드로 동작한다. **Asynchronous Mode**: 양쪽이 주기적으로 BFD 패킷을 보내고 수신 실패 시 링크 다운 선언. **Echo Mode**: 한쪽이 BFD 패킷을 보내면 상대방이 데이터 플레인에서 바로 돌려보내는 루프백 방식으로, 단일 방향 지연 측정이 가능하다. AWS DX에서 BFD는 Asynchronous Mode를 사용하며, 최소 BFD 타이머는 300ms다. 온프레미스 라우터에서도 같은 타이머를 설정해야 협상된다.

## MACsec: L2 암호화

DX는 사설망이지만 물리적으로 코로케이션 시설을 통과하므로, 해당 시설 내 물리적 탭(도청) 가능성이 이론적으로 존재한다. 규제 산업(금융, 의료)에서는 이를 위해 L2 암호화가 요구되기도 한다.

MACsec(IEEE 802.1AE)은 이더넷 프레임 레벨(L2)에서 암호화를 적용한다. AWS DX에서는 10Gbps와 100Gbps Dedicated Connection에서 MACsec을 지원한다. 1Gbps 회선이나 Hosted Connection은 미지원이다.

> 💡 **관련 이론**: MACsec(IEEE 802.1AE)은 GCM-AES-128 또는 GCM-AES-256으로 이더넷 페이로드를 암호화한다. IPsec(L3)이 IP 패킷을 암호화하는 것과 달리, MACsec은 이더넷 프레임 전체를 암호화해 MAC 주소 기반의 트래픽 분석도 불가능하게 만든다. 레이턴시 오버헤드는 하드웨어 가속 덕분에 마이크로초 수준이다.

MACsec은 DX 회선 자체의 암호화에 집중한다. 반면 IPsec VPN over DX는 DX 위에 터널을 올려 L3 암호화를 추가한다. 규제가 "전송 중 암호화(Encryption in Transit)"를 요구한다면 MACsec으로 충족 가능하다.

## DX와 다른 클라우드 비교

| 항목 | AWS Direct Connect | GCP Cloud Interconnect | Azure ExpressRoute |
|------|-------------------|------------------------|-------------------|
| 전용선 방식 | Dedicated/Hosted | Dedicated/Partner | ExpressRoute Direct/Partner |
| 최소 대역폭 | 50Mbps(Hosted) | 10Gbps(Dedicated) | 50Mbps(Partner) |
| 최대 대역폭 | 100Gbps | 100Gbps | 100Gbps |
| L2 암호화 | MACsec (10G/100G) | 미지원 | MACsec (ExpressRoute Direct) |
| 라우팅 프로토콜 | BGP-4 | BGP-4 | BGP-4 |
| 멀티 VPC 연결 | DXGW + Transit VIF | Cloud Router (글로벌 VPC) | ExpressRoute Global Reach |
| 프로비저닝 기간 | 수주~수개월 | 수주~수개월 | 수주~수개월 |
| SLA | 99.99%(Maximum) | 99.99%(이중화) | 99.95%(기본) |

> 🔍 **더 깊이**: Azure ExpressRoute와 AWS DX의 결정적 차이는 글로벌 범위다. AWS DX는 연결된 DX Location에서 DXGW를 통해 전 세계 리전에 접근할 수 있다. Azure ExpressRoute는 기본적으로 특정 지역에 귀속되며, 다른 리전 연결에는 Global Reach를 별도로 활성화해야 한다. GCP의 경우 VPC 자체가 글로벌이므로 Cloud Interconnect 연결 하나로 모든 리전 서브넷에 접근 가능하다.

## SiteLink: DX 백본으로 온프레미스 간 연결

SiteLink는 두 온프레미스 데이터센터를 AWS DX 백본을 통해 직접 연결하는 기능이다. 기존에는 두 온프레미스 사이트를 연결하려면 별도의 WAN 회선이나 MPLS가 필요했지만, SiteLink를 사용하면 양쪽에 DX 연결이 있다면 그 DX 백본을 활용해 사이트 간 통신이 가능하다.

```
도쿄 DC ─── DX Location 도쿄 ─── AWS DX 백본 ─── DX Location 서울 ─── 서울 DC
                                        (SiteLink 경로)
```

SiteLink는 AWS 리소스(VPC, S3 등)에 접근하는 것이 아니라 **온프레미스 ↔ 온프레미스 간 연결**에 AWS 백본을 사용한다. 트래픽은 AWS VPC를 통과하지 않고 DX 인프라 레벨에서 직접 라우팅된다. 비용은 SiteLink 처리 시간당 요금과 데이터 전송 요금이 추가로 발생한다.

## 실전 CLI: DX 설정

```bash
# Direct Connect Gateway 생성
aws directconnect create-direct-connect-gateway \
  --direct-connect-gateway-name "EnterpriseHubDXGW" \
  --amazon-side-asn 64512

# Transit VIF 생성 (DXGW와 연결)
aws directconnect create-transit-virtual-interface \
  --connection-id dxcon-abc123 \
  --new-transit-virtual-interface '{
    "virtualInterfaceName": "Prod-Transit-VIF",
    "vlan": 100,
    "asn": 65000,
    "directConnectGatewayId": "dxgw-xxx",
    "addressFamily": "ipv4",
    "authKey": "SecretBGPMD5Key"
  }'

# DXGW ↔ TGW 연결
aws directconnect associate-transit-gateway-with-direct-connect-gateway \
  --direct-connect-gateway-id dxgw-xxx \
  --transit-gateway-id tgw-yyy \
  --allowed-prefixes "[{\"cidr\":\"10.0.0.0/8\"}]"

# LAG 생성
aws directconnect create-lag \
  --number-of-connections 2 \
  --location DX-LOC-SEL1 \
  --connection-bandwidth 10Gbps \
  --lag-name "ProductionLAG"

# MACsec 키 연관
aws directconnect associate-mac-sec-key \
  --connection-id dxcon-abc123 \
  --ckn "CAFEBABECAFEBABE..." \
  --cak "DEADBEEFDEADBEEF..."
```

## Jumbo Frame: 대용량 전송 최적화

DX는 MTU 1500(기본)과 9001 바이트(점보 프레임)를 지원한다. 대용량 데이터를 전송할 때 점보 프레임을 활성화하면 패킷 헤더 오버헤드가 줄어 실효 대역폭이 높아진다. 단, 경로 상의 모든 네트워크 장비(VPC, TGW, DX Location)가 동일한 MTU를 지원해야 한다. MTU 불일치는 패킷 단편화(Fragmentation) 또는 PMTUD(Path MTU Discovery) 실패로 연결 문제를 유발한다.

> ⚠️ **함정**: TGW를 경유할 때 TGW는 8500 MTU를 지원한다. 따라서 DX에서 9001 MTU를 사용해도 TGW를 경유하는 경우 TGW가 8500으로 제한한다. VPC ENI는 9001 MTU를 지원하지만, TGW 경유 시 8500이 실질적 제한이다. 이를 모르고 9001로 설정하면 TGW 경유 트래픽에서 단편화가 발생해 성능 저하가 일어난다.

## 정리하며

Direct Connect는 AWS와 온프레미스를 연결하는 가장 강력하고 안정적인 방법이지만, 그 복잡성도 그만큼 높다. VIF 종류 선택(Private/Public/Transit), 이중화 레벨(Maximum/High/Development), BGP 우선순위 제어(MED, AS Path Prepending, Local Preference), 빠른 페일오버(BFD), L2 암호화(MACsec)까지 각 레이어에서 의사결정이 필요하다. SAP-C02 시험에서 DX 문제의 핵심은 시나리오의 규모와 복원력 요구사항을 파악해 올바른 VIF와 이중화 구성을 선택하는 것이다. 다음 장에서는 DX의 백업 또는 대안으로 자주 활용되는 Site-to-Site VPN을 깊이 다룬다.

---

## 📝 연습 문제

**문제 1.** 글로벌 은행이 온프레미스 코어 뱅킹 시스템을 단일 DX 회선으로 AWS에 연결했다. 3개 리전(us-east-1, eu-west-1, ap-northeast-1)에 걸쳐 총 150개 VPC를 운영한다. 이 모든 VPC에 온프레미스에서 사설 IP로 접근하려면?

A) Private VIF 150개 생성
B) Private VIF 3개(리전당 1개) + VGW 연결
C) Transit VIF 1개 + DX Gateway + 리전별 TGW
D) Public VIF 1개 + VPN 터널 150개

**정답: C**
해설: Private VIF는 단일 VGW(단일 VPC)에만 연결 가능하므로 150개는 불가능하다(A, B 오답). Public VIF는 AWS 공개 서비스 접근용이지 VPC 사설 IP 접근 목적이 아니다(D 오답). Transit VIF + DXGW + TGW 구조가 단일 DX 회선으로 멀티 리전·멀티 VPC에 접근하는 표준 아키텍처다. DXGW는 글로벌 서비스로 여러 리전의 TGW를 동시에 연결할 수 있다.

---

**문제 2.** 공장 자동화 시스템이 AWS와 DX로 연결된다. 공장 중단 비용이 시간당 10억 원이며 네트워크 장애는 용납할 수 없다. AWS 권장 Maximum Resiliency 구성은?

A) 단일 DX Location에서 LAG로 묶은 2개 포트
B) 2개 DX Location에서 각 1개씩 총 2개 회선
C) 2개 DX Location에서 각 2개씩 총 4개 회선 + 온프레미스 이중 라우터
D) 단일 DX Location 1개 회선 + Site-to-Site VPN 백업

**정답: C**
해설: Maximum Resiliency(99.99% SLA)는 AWS가 명시한 최고 수준의 복원력 구성이다. A의 LAG는 같은 Location 내 다중 포트를 묶는 것으로 Location 전체 장애에 무력하다. B의 2 Location 2 회선은 High Resiliency(99.9%)로, 각 Location 내 포트/케이블 장애 시 서비스가 중단될 수 있다. D는 Development(99%) 수준이다. C가 단일 Location 장애와 단일 포트/케이블 장애 모두를 방어하는 Maximum Resiliency다. AWS DX Resiliency Toolkit이 이 구성을 자동으로 검증한다.

---

**문제 3.** DX 회선과 Site-to-Site VPN을 동시에 운영하며 평상시 DX를 우선 사용해야 한다. DX가 다운되면 VPN으로 자동 전환되어야 한다. 온프레미스에서 AWS로 향하는 트래픽(아웃바운드)의 경로 우선순위를 제어하는 방법은?

A) AWS 콘솔에서 DX를 "Primary"로 설정
B) 온프레미스 BGP에서 DX 경로에 높은 Local Preference 설정, VPN 경로에 낮은 Local Preference 설정
C) VPN 측 라우트 테이블에 더 구체적인 CIDR 추가
D) DX에 BFD를 활성화하면 자동으로 우선순위가 설정됨

**정답: B**
해설: 온프레미스 → AWS 방향 트래픽의 경로 선택은 온프레미스 BGP 정책에서 제어한다. Local Preference는 iBGP 속성으로 높을수록 선호된다. DX 경로에 Local Pref 200, VPN 경로에 Local Pref 100을 설정하면 평상시 DX가 선택된다. DX 장애 시 DX 경로가 BGP 테이블에서 사라지고 VPN 경로가 자동으로 활성화된다. AWS 콘솔에 "Primary" 설정 옵션은 없다(A 오답). 더 구체적인 CIDR은 반대 방향(AWS → 온프레미스) 또는 특정 서브넷 제어에 쓰인다(C 오답). BFD는 장애 감지 속도를 높이지만 우선순위를 설정하지 않는다(D 오답).

---

**문제 4.** 금융 규제기관이 DX 회선에서 "L2 계층에서의 암호화"를 요구한다. 적합한 AWS 솔루션은?

A) IPsec VPN over DX (TLS 기반)
B) DX MACsec (IEEE 802.1AE)
C) TLS 1.3으로 애플리케이션 레이어 암호화
D) AWS PrivateLink로 전환

**정답: B**
해설: MACsec(IEEE 802.1AE)이 L2(이더넷 프레임) 수준의 암호화를 제공한다. 10Gbps와 100Gbps Dedicated Connection에서 지원된다. IPsec VPN over DX(A)는 L3 암호화로 L2가 아니며, DX 위에 터널을 올리는 구성이다. TLS는 L4-L7 암호화다(C 오답). PrivateLink는 서비스 엔드포인트 노출 방식이지 DX 암호화와 무관하다(D 오답). MACsec은 1Gbps 회선이나 Hosted Connection에서는 미지원이므로, 해당 조건이면 IPsec VPN over DX를 고려해야 한다.

---

**문제 5.** DX 연결에서 장애 발생 후 BGP 페일오버까지 시간을 180초에서 1초 미만으로 단축하려면?

A) BGP keepalive 타이머를 1초로 조정
B) BFD(Bidirectional Forwarding Detection) 활성화
C) LAG로 2개 포트 묶기
D) TGW ECMP 활성화

**정답: B**
해설: BFD(RFC 5880)는 BGP와 독립적으로 100~300ms 간격으로 hello를 교환하고, 3회 연속 실패 시 300ms 이내에 링크 다운을 선언하고 BGP에 통보한다. BGP keepalive를 1초로 낮추면(A) 페일오버가 빨라지지만 여전히 3~5초 수준이고, 과도한 BGP 메시지로 라우터 부하가 증가할 수 있다. LAG(C)는 포트 이중화이지 페일오버 속도와 직접 관련이 없다. TGW ECMP(D)는 부하 분산 기능으로 페일오버 속도와 무관하다.

---

**문제 6.** 두 온프레미스 데이터센터(도쿄, 서울)가 각자 AWS DX 연결을 가지고 있다. 두 데이터센터 간 직접 통신에 AWS DX 백본을 활용하려면 어떤 기능을 사용하는가?

A) TGW Inter-Region Peering
B) DX SiteLink
C) VPN Mesh between DCs
D) AWS Cloud WAN

**정답: B**
해설: SiteLink는 두 DX Location 간 AWS DX 백본을 통한 온프레미스 ↔ 온프레미스 직접 통신을 제공한다. 트래픽이 AWS VPC를 통과하지 않고 DX 인프라 레벨에서 직접 라우팅된다. TGW Inter-Region Peering(A)은 AWS VPC 간 연결이지 온프레미스 간 직접 연결이 아니다. VPN Mesh(C)는 인터넷을 통하므로 지연과 대역폭이 DX 백본보다 불안정하다. Cloud WAN(D)은 글로벌 네트워크 관리 서비스로 VPC와 온프레미스를 통합 관리하지만, 두 온프레미스 간 DX 백본 직접 연결은 SiteLink가 담당한다.

---

**문제 7.** 기업이 DX 10Gbps 회선 하나로 100TB의 대용량 ML 학습 데이터를 온프레미스에서 S3로 전송한다. 전송 효율을 최대화하려면?

A) Jumbo Frames(MTU 9001) 활성화 + S3 Multipart Upload
B) Snowball Edge로 물리 전송
C) Public VIF만으로 충분, 최적화 불필요
D) TGW를 경유해 S3에 접근

**정답: A**
해설: S3는 Public VIF를 통해 DX로 접근 가능하다. Jumbo Frames(MTU 9001)를 활성화하면 패킷 헤더 오버헤드가 줄어 10Gbps 회선의 실효 처리량이 향상된다. S3 Multipart Upload는 대용량 파일을 병렬 청크로 나눠 전송해 처리량을 극대화한다. Snowball Edge(B)는 인터넷 연결이 없거나 DX 대역폭이 부족할 때 물리 이동이 더 빠른 경우 사용한다. 10Gbps DX로 100TB를 전송하면 약 22시간이 걸리므로(이론치), Snowball 배송 시간과 비교해 판단해야 한다. TGW 경유(D)는 MTU가 8500으로 제한되고 불필요한 홉을 추가한다.
