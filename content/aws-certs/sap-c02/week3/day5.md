# Day 5 - Week 3 복습: 고급 네트워킹 아키텍처 종합

Week 3는 AWS 고급 네트워킹의 전 스펙트럼을 다뤘다. VPC 간 연결(Peering, TGW, Cloud WAN), 온프레미스 연결(Direct Connect, Site-to-Site VPN, Client VPN), 서비스 단위 사설 접근(PrivateLink, Gateway Endpoint)이라는 세 축이 어떻게 서로 보완하고 대체하는지 이해하는 것이 이번 주의 핵심이었다. 개별 서비스를 다시 암기하는 것이 아니라, "이 시나리오에서 왜 이 서비스가 정답이고 다른 것들은 왜 안 되는가"를 즉각적으로 판단하는 능력을 다지는 것이 오늘의 목표다.

SAP-C02 시험에서 네트워킹 도메인 문제는 키워드 하나가 정답을 통째로 바꾼다. "CIDR 겹침"이 나오면 Peering과 TGW는 즉시 탈락이다. "단방향 서비스 노출"이 나오면 PrivateLink가 강력한 후보가 된다. "1초 이내 페일오버"가 나오면 BFD(Bidirectional Forwarding Detection)를 떠올려야 한다. "회선 자체 암호화"가 나오면 MACsec이 답이다. 오늘은 이 키워드-정답 매핑을 씹어 삼키는 날이다.

---

## 연결 패턴 선택 트리

다음 의사결정 트리를 손에 익혀두면 시험장에서 네트워킹 문제의 70%는 첫 15초에 방향이 잡힌다.

```
VPC 간 연결이 필요한가?
    ├── 2개 VPC, CIDR 겹침 없음, 단순 연결 → VPC Peering
    ├── 3개 이상 VPC, 허브-스포크, 온프레미스 연결 포함 → Transit Gateway
    └── 글로벌 멀티 리전, 단일 정책 관리 → AWS Cloud WAN

온프레미스 연결이 필요한가?
    ├── 빠른 구축(수 분), 임시, 백업 → Site-to-Site VPN
    │   └── 처리량 확장 필요 → TGW + ECMP (최대 50Gbps 이론상)
    ├── 대용량, 일관 지연, 규제, 장기 운영 → Direct Connect
    │   ├── 단일 VPC → Private VIF + VGW
    │   ├── 다중 VPC/리전 → Transit VIF + DX Gateway + TGW
    │   ├── AWS 공개 서비스(S3 공인 IP) → Public VIF
    │   ├── 99.99% SLA → Maximum Resiliency (2 Location × 2회선)
    │   ├── L2 암호화 규제 → MACsec (10G/100G Dedicated)
    │   └── 1초 이내 페일오버 → BFD 활성화
    └── 개별 직원 단말 → Client VPN (OpenVPN, SAML/mTLS/AD 인증)

서드파티/내부 서비스를 사설로 접근?
    ├── CIDR 겹침 or 단방향 서비스 노출 → PrivateLink (Interface Endpoint)
    ├── S3, DynamoDB만 접근 (비용 최소) → Gateway Endpoint (무료)
    └── 보안 어플라이언스 트래픽 체인 → Gateway Load Balancer Endpoint
```

> 💡 **OSI 레이어별 서비스 매핑**: 네트워크 토폴로지 이론에서 이 서비스들은 각자 다른 추상화 레벨을 다룬다. VPC Peering과 TGW는 **L3 네트워크 레벨** 연결(IP 라우팅). PrivateLink는 **서비스 레벨** 연결(DNS + ENI, L4-L7). DX는 **L1/L2 물리-데이터링크 레벨** 위에 L3 BGP를 올린 구조. MACsec은 **L2(이더넷 프레임) 암호화**. 이 추상화 레벨의 차이가 각 서비스의 특성(CIDR 요구사항, 방향성, 확장성)을 결정한다. 예를 들어 PrivateLink가 CIDR 겹침을 허용하는 이유는 IP 라우팅이 아닌 서비스 단위(ENI)로 연결되기 때문이다. L3를 우회하는 L4 연결이므로 CIDR 충돌이 라우팅 문제를 일으키지 않는다.

---

## 서비스별 핵심 비교표

### 연결 서비스 전체 비교

| 서비스 | 방향 | CIDR 겹침 | 전이적 라우팅 | 멀티 리전 | 비용 특성 |
|--------|------|-----------|--------------|-----------|-----------|
| VPC Peering | 양방향 | 불가 | 불가 | 가능(별도 Peering) | 무료(동일 AZ) / $0.01/GB(AZ 간) |
| TGW | 양방향 | 불가 | 가능(TGW 내) | TGW Inter-Region Peering | Attachment $0.05/hr + $0.02/GB |
| Cloud WAN | 양방향 | 불가 | 가능(정책) | 네이티브 글로벌 | Core Network Edge 시간당 |
| DX | 양방향 | 불가 | DXGW+TGW | DXGW 경유 | 포트+시간+GB |
| Site-to-Site VPN | 양방향 | 불가 | TGW 경유 가능 | 리전별 별도 | $0.05/hr + $0.09/GB |
| PrivateLink | 단방향 | 허용 | N/A | Cross-Region 지원(2024) | ENI $0.01/hr + $0.01/GB |
| Gateway Endpoint | 단방향(VPC→서비스) | N/A | 불가(VPC 내부만) | 불가 | 무료 |

> 🔍 **비용 함정**: VPC Peering이 "무료"라는 표현은 Peering 연결 자체에 요금이 없다는 의미다. 실제로는 **AZ 간 데이터 전송 요금($0.01/GB)**이 발생한다. 같은 AZ 내 Peering 통신은 무료지만 AZ를 넘으면 요금이 붙는다. TGW는 처리 비용($0.02/GB) 외에 Attachment 시간당 요금($0.05/시간)도 붙는다. 10개 VPC를 Full Mesh Peering으로 연결하면 45개 Peering이 필요하지만 연결 자체 비용은 없다. TGW로 전환하면 Attachment 10개($0.50/hr)와 처리량 요금이 추가된다. 대신 운영 부담이 45개→1개로 줄어든다. SAP-C02에서 "비용 최소화 + VPC 소수 + 단순 연결"이면 Peering, "운영 부담 최소 + VPC 다수"이면 TGW가 정답 방향이다.

---

## Direct Connect 심화

### DX 이중화 SLA 비교

| 이중화 모드 | 구성 | SLA | 사용 시나리오 |
|-------------|------|-----|--------------|
| Maximum Resiliency | 2 Location × 2회선 = 4회선 | 99.99% | 미션 크리티컬, 금융, 공장 자동화 |
| High Resiliency | 2 Location × 1회선 = 2회선 | 99.9% | 일반 엔터프라이즈 |
| Development | 1 Location × 1회선 + VPN 백업 | 99% | 비프로덕션, POC |

> 💡 **SLA 수학**: AWS DX SLA에서 "99.99%"는 연간 약 52.6분의 다운타임을 허용한다. "99.9%"는 연간 8.76시간이다. "99%"는 연간 87.6시간이다. Maximum Resiliency에서 두 DX Location이 **동시에** 장애 날 확률은 각 Location의 장애 확률의 곱이다. 단일 Location SLA가 99.9%라면 장애 확률이 0.1% = 0.001이고, 두 Location이 동시에 장애일 확률은 0.001 × 0.001 = 0.000001 = 99.9999% 가용성이라는 계산이 성립한다. 이것이 AWS가 Maximum Resiliency를 "2 Location × 2 회선"으로 정의한 수학적 근거다. LAG(Link Aggregation Group)는 같은 Location 내 포트를 묶는 것이므로 Location 전체 장애에는 무력하다. 4회선이어도 같은 Location에 있으면 99.99% 달성 불가다.

### VIF 선택 퀵 레퍼런스

| 시나리오 | 정답 VIF | 이유 |
|---------|---------|------|
| 단일 VPC, 작은 규모 | Private VIF + VGW | 단순하고 비용 낮음 |
| 멀티 VPC, 멀티 리전 | Transit VIF + DXGW + TGW | 확장성 |
| 온프레미스 간 DX 백본 연결 | SiteLink | AWS 리전 미통과 |
| 공개 AWS 서비스(S3 공인 IP) | Public VIF | 공인 IP 범위 BGP 광고 |
| L2 암호화 규제 | MACsec (10G/100G Dedicated) | 이더넷 프레임 암호화 |
| Hosted Connection | Private VIF 또는 Public VIF | Transit VIF 미지원 |

> ⚠️ **Hosted Connection 함정**: Hosted Connection(파트너 제공)은 **Transit VIF를 지원하지 않는다**. Dedicated Connection(AWS 직접 제공)만 Transit VIF 생성이 가능하다. 따라서 파트너 통해 DX를 연결하고 멀티 VPC에 접근해야 한다면 각 VPC마다 Private VIF를 만드는 방법(복잡) 또는 파트너에게 Dedicated Connection을 요청해야 한다. 시험에서 "파트너 DX + 다수 VPC"가 나오면 이 제약을 기억해야 한다. 또한 Hosted Connection의 대역폭은 50Mbps~10Gbps로 Dedicated Connection(1G/10G/100G)과 다른 선택지가 있다.

> 🔍 **MACsec 심화**: MACsec(IEEE 802.1AE)은 이더넷 프레임 단위로 암호화한다. DX는 L1 광섬유 위에 L2 이더넷을 올리는데 MACsec은 이 L2 프레임 전체를 AES-256으로 암호화한다. AWS에서 MACsec이 지원되는 것은 Dedicated Connection 10Gbps와 100Gbps뿐이다. 1Gbps Dedicated Connection과 모든 Hosted Connection은 MACsec 미지원이다. 규제 환경에서 "회선 자체 암호화"가 요구될 때 IPsec(L3)이나 TLS(L7)와 구분하는 것이 핵심이다. MACsec은 AWS와 DX Location 사이의 링크를 암호화하며 DX Location과 온프레미스 사이는 추가로 별도 MACsec 장비가 필요하다.

---

## BGP 경로 제어 심화

### 방향별 BGP 조작 방법

```
온프레미스 → AWS 방향 (아웃바운드 from 온프레미스):
  온프레미스 BGP에서 DX neighbor에 Local Preference ↑ 설정
  → 온프레미스 BGP가 DX 경로를 선호해 DX로 나감

AWS → 온프레미스 방향 (인바운드 to 온프레미스):
  온프레미스 BGP에서 VPN neighbor로 AS Path Prepending 적용
  → AWS BGP는 AS Path가 짧은 DX 경로를 선호
  → DX 다운 시 AWS는 유일한 VPN 경로 선택
```

> 🔍 **BGP 속성 전파 범위**: BGP 속성의 전파 범위를 이해하면 혼동이 줄어든다. **Local Preference**는 iBGP(같은 AS 내부)에서만 교환되고 eBGP 피어에게는 전달되지 않는다. 따라서 온프레미스 라우터가 설정한 Local Preference는 AWS 측에 전달되지 않고 온프레미스 내부의 경로 선택에만 영향을 준다. 반면 **AS Path**와 **MED(Multi-Exit Discriminator)**는 eBGP를 통해 피어에게 전달되므로 AWS 라우터가 이 값을 받아 경로 선택에 활용한다. 이 전파 범위 차이가 방향별 BGP 조작 방법이 달라지는 이유다. RFC 4271(BGP-4)에서 Local Preference는 OPTIONAL NON-TRANSITIVE, AS Path는 WELL-KNOWN MANDATORY로 정의되어 있어 AS Path는 항상 eBGP 경계를 넘어 전파된다.

> ⚠️ **시험 함정**: "AWS → 온프레미스 방향 우선순위 제어"가 나오면 반드시 **AS Path Prepending**을 떠올린다. "온프레미스 → AWS 방향 우선순위 제어"가 나오면 **Local Preference**를 떠올린다. 방향을 헷갈리면 반드시 틀린다. 또 하나의 함정: "BFD로 DX 페일오버를 빠르게"는 맞지만, BFD 자체가 경로 선택을 하는 것이 아니라 장애를 감지해 BGP에 통보하는 역할이다. BFD로 감지하고 BGP가 경로를 재계산하는 것이다.

### BGP Community와 라우팅 제어

DX에서 BGP Community를 활용한 정밀 라우팅 제어도 시험에 등장한다.

```
AWS가 광고하는 BGP Community (온프레미스로):
  7224:7100 - 리전 내 로컬 라우트
  7224:7200 - 리전 내 글로벌 라우트
  7224:8100 - 동일 대륙
  7224:9100 - 글로벌

온프레미스가 AWS에 광고할 때 MED 사용:
  MED 낮은 값 → AWS가 더 선호
  MED는 동일 AS에서 들어오는 복수 경로 중 선택할 때 사용
```

---

## TGW Route Table 격리 패턴 심화

### 기본 격리 모델

```
[Dev VPC] ─Association→ RT-Workload
[Prod VPC] ─Association→ RT-Workload
[Stage VPC] ─Association→ RT-Workload
[Shared VPC] ─Association→ RT-Shared

Propagation 설정:
Dev VPC → RT-Shared에 Propagation (Shared VPC가 Dev CIDR 알게 됨)
Prod VPC → RT-Shared에 Propagation (Shared VPC가 Prod CIDR 알게 됨)
Shared VPC → RT-Workload에 Propagation (Dev/Prod가 Shared CIDR 알게 됨)

결과:
Dev→Prod: RT-Workload에 Prod CIDR 없음 → 차단
Prod→Dev: RT-Workload에 Dev CIDR 없음 → 차단
Dev→Shared: RT-Workload에 Shared CIDR 있음 → 허용
Shared→Dev: RT-Shared에 Dev CIDR 있음 → 허용
```

> 💡 **Association vs Propagation 암기법**: Association = "나는 이 RT의 결정을 따른다(Follow)". Propagation = "나의 CIDR을 이 RT에 알린다(Advertise)". Dev가 RT-Workload에 Association되어 있고 RT-Workload에 Prod CIDR이 Propagate되지 않으면, Dev→Prod 패킷은 Blackhole이다. TGW의 Blackhole 라우트는 명시적으로 트래픽을 버리는 정적 라우트로 추가할 수도 있는데, 이는 "특정 CIDR이 실수로 Propagate되더라도 강제 차단"하는 방어 목적으로 사용된다.

> 🎯 **5-환경 격리 시나리오**: 대형 금융 그룹이 TGW로 개발(Dev), 스테이징(Stage), 프로덕션(Prod), 공유(Shared), 보안(Security) 5개 환경을 운영한다. Dev↔Prod 격리, Stage↔Prod 격리, Dev↔Stage 격리가 필요하지만 모든 환경이 Shared와 Security에 접근해야 한다. 설계: RT-Workload(Dev/Stage/Prod Association, Shared CIDR + Security CIDR만 Propagation), RT-Shared(Shared Association, 모든 CIDR Propagation), RT-Security(Security Association, 모든 CIDR Propagation). Security VPC의 IDS/IPS는 모든 트래픽을 볼 수 있고, 워크로드 환경 간 통신은 라우팅 자체가 없어 차단된다. 이 설계에서 Security VPC는 "Read-Only" 관찰자가 아니라 RT-Security를 통해 모든 CIDR을 알고 있어 필요시 개입(트래픽 인젝션)도 가능하다.

---

## PrivateLink 심화

### PrivateLink가 정답인 세 가지 상황

1. **CIDR이 겹치는 두 VPC 또는 계정 간 서비스 공유**: Peering과 TGW는 CIDR 겹침으로 불가능하다.
2. **단방향 서비스 노출**: Consumer는 API만 호출하고 Producer의 내부 네트워크에 접근할 수 없어야 한다.
3. **SaaS/서드파티 서비스를 인터넷 없이 사설로 접근**: Snowflake, Datadog, MongoDB Atlas 등이 PrivateLink Endpoint Service를 제공한다.

### Endpoint 유형 비교

| Endpoint 유형 | 지원 서비스 | CIDR 영향 | 비용 | DNS |
|--------------|------------|-----------|------|-----|
| Interface Endpoint | 대부분 AWS 서비스, PrivateLink 커스텀 | VPC에 ENI 생성 | $0.01/hr + GB | Private DNS 이름 |
| Gateway Endpoint | S3, DynamoDB 만 | 라우트 테이블 변경 | 무료 | 변경 없음 |
| GWLB Endpoint | 보안 어플라이언스 | GENEVE 터널 | GB당 요금 | 없음 |

> 📚 **실제 사례**: 2023년 한 국내 핀테크가 해외 결제 처리 SaaS와 연동할 때 금융 규제기관이 "데이터가 공개 인터넷을 통과하지 않아야 한다"는 요건을 제시했다. SaaS 벤더가 AWS PrivateLink Endpoint Service를 제공했고, 핀테크의 VPC에 Interface Endpoint를 생성해 두 회사의 CIDR(10.0.0.0/8이 겹침)에도 불구하고 사설 연결을 완성했다. 구현 시간이 VPN 터널 설계보다 4배 빠르고 운영 인력도 절감됐다는 후기가 있다. 2024년에는 Cross-Region PrivateLink가 GA되어 다른 리전의 Endpoint Service에 Interface Endpoint를 만들 수 있게 됐는데, 이것도 시험 출제 범위에 들어간다.

> ⚠️ **Gateway Endpoint 함정**: Gateway Endpoint는 **온프레미스(DX/VPN)에서 사용할 수 없다**. Gateway Endpoint는 VPC 라우트 테이블에 prefix list 형태의 라우트를 추가하는 방식이다. 이 라우트는 VPC 내부 트래픽에만 적용되므로 DX나 VPN을 통해 온프레미스에서 들어오는 트래픽은 이 라우트를 타지 않는다. 온프레미스에서 S3에 인터넷 없이 접근하려면 **S3 Interface Endpoint** 또는 **Public VIF**를 사용해야 한다. 시험에서 "온프레미스 + S3 + 인터넷 없이"가 나오면 Gateway Endpoint가 아닌 Interface Endpoint나 Public VIF를 선택한다.

---

## SAP-C02 시나리오 분해 방법론

5단계 분석으로 네트워킹 문제를 빠르게 해독한다.

```
1. WHO: 누가 접근하나? (직원 노트북 → Client VPN, 온프레미스 서버 → DX/VPN, VPC→VPC → Peering/TGW)
2. WHAT: 무엇에 접근하나? (S3 → Gateway Endpoint, AWS 서비스 → Interface Endpoint, 커스텀 서비스 → PrivateLink)
3. WHY: 왜 사설 접근이 필요한가? (규제, 보안, 지연, 비용)
4. CONSTRAINTS: 제약이 무엇인가? (CIDR 겹침, SLA, 암호화, 대역폭, 시간)
5. KEYWORD: 결정적 키워드가 무엇인가?
   - "CIDR 겹침" → PrivateLink
   - "전이적 라우팅" → TGW (Peering 아님)
   - "회선 암호화" → MACsec
   - "1초 페일오버" → BFD
   - "99.99% SLA" → Maximum Resiliency
   - "온프레미스 간 AWS 경유 없이" → SiteLink
   - "단방향" → PrivateLink
   - "운영 최소화 + 글로벌" → Cloud WAN
```

> 🎯 **시험 전략**: SAP-C02 네트워킹 문제는 보통 2-3가지 정답 후보가 있고 제약 조건 1-2개가 정답을 하나로 좁힌다. "DX + VPN 동시 운영 + AWS→온프레미스 DX 우선"이 나오면 AS Path Prepending이 키워드다. "DX + 1초 이내 페일오버"가 나오면 BFD가 키워드다. "50개 VPC + 중앙 API 접근 + CIDR 겹침 가능성"이 나오면 PrivateLink Endpoint Service가 키워드다. 이 패턴 매핑을 반복 연습하면 시험장에서 읽는 시간이 줄고 판단이 빨라진다.

---

## 마무리: Week 3 핵심 키워드 모음

| 키워드 | 즉각 연상 서비스 |
|--------|----------------|
| CIDR 겹침 | PrivateLink (Interface Endpoint) |
| 전이적 라우팅 필요 | TGW (Peering 제외) |
| 글로벌 단일 정책 | Cloud WAN |
| 회선 L2 암호화 | MACsec |
| DX 1초 페일오버 | BFD |
| DX 99.99% SLA | Maximum Resiliency (2 Location × 2회선) |
| 온프레미스→AWS 우선순위 | Local Preference |
| AWS→온프레미스 우선순위 | AS Path Prepending |
| S3/DynamoDB 무료 접근 | Gateway Endpoint |
| 온프레미스에서 S3 사설 접근 | Interface Endpoint 또는 Public VIF |
| 단방향 서비스 노출 | PrivateLink Endpoint Service + NLB |
| 상태저장 어플라이언스 체인 | GWLB + GWLB Endpoint |
| 개별 직원 VPC 접근 | Client VPN (SAML/mTLS/AD) |
| 멀티 VPC 온프레미스 DX | Transit VIF + DXGW + TGW |
| 온프레미스 간 AWS 경유 없이 | DX SiteLink |
| Hosted DX + 멀티 VPC | Transit VIF 불가 → Dedicated 필요 |

---

## 📝 연습 문제

**문제 1.** 글로벌 물류 기업이 AWS Organizations로 3개 리전(us-east-1, eu-west-1, ap-northeast-1)에 걸쳐 60개 VPC를 운영한다. 본사 데이터센터(서울)에서 모든 리전의 VPC에 사설로 접근해야 하고, VPC 간에는 개발·스테이징·프로덕션 환경이 서로 격리되어야 한다. 공유 서비스 VPC(DNS, LDAP)에는 모든 환경이 접근 가능해야 한다. 운영 부담을 최소화하는 최적 아키텍처는?

A) 60개 VPC 간 Full Mesh VPC Peering + DX Private VIF + NACL로 환경 격리  
B) 각 리전에 TGW + TGW Inter-Region Peering + DX Gateway + Transit VIF + TGW Route Table로 환경 격리 + RAM으로 TGW 공유  
C) AWS Cloud WAN으로 글로벌 정책 + DX Gateway + Transit VIF + 정책에서 환경 격리 정의  
D) 리전별 VPC Peering 허브 구성 + Site-to-Site VPN으로 온프레미스 연결  

**정답: C**

해설: 3개 리전 60개 VPC를 "단일 정책"으로 관리하는 것이 Cloud WAN의 핵심 강점이다. Cloud WAN의 Core Network Policy에서 환경별 세그먼트(dev/stage/prod/shared)를 정의하고 세그먼트 간 라우팅 허용/차단을 선언적으로 설정한다. DX Gateway와 Transit VIF로 온프레미스를 연결하면 모든 리전 VPC에 접근 가능하다. B도 가능하지만 각 리전 TGW Route Table을 별도로 관리해야 하므로 운영 부담이 Cloud WAN보다 높다. A의 Full Mesh는 60개 VPC라면 (60×59)/2 = 1,770개 Peering이 필요해 관리 불가능하고, VPC Peering은 전이적 라우팅을 지원하지 않아 온프레미스와의 통신도 제한된다. D의 VPN은 DX의 대역폭·지연 일관성을 충족하지 못한다.

---

**문제 2.** 금융 회사가 서울 데이터센터와 us-east-1 AWS를 DX로 연결한다. 규제 심사에서 "DX 회선 자체에도 암호화가 필요하다"는 지적을 받았다. 또한 DX 포트 장애 시 자동 페일오버를 1초 이내로 달성해야 한다. 현재 10Gbps Dedicated Connection이 있다. 적합한 기술 조합은?

A) MACsec + IPsec VPN over DX + BFD  
B) MACsec (10G Dedicated DX) + BFD 활성화  
C) IPsec VPN over DX + BGP AS Path 조정 + BFD  
D) TLS 1.3 애플리케이션 암호화 + BFD  

**정답: B**

해설: "DX 회선 자체 암호화"는 L2 암호화인 MACsec(IEEE 802.1AE)을 의미한다. MACsec은 10Gbps와 100Gbps Dedicated Connection에서 지원된다. 현재 10G Dedicated이므로 요건 충족. 1초 이내 페일오버는 BFD(RFC 5880)로 달성한다. BFD는 300ms 간격으로 hello를 교환하고 3회 연속 실패 시 300ms 내에 BGP에 통보해 경로를 재계산한다. IPsec VPN over DX(A, C)는 L3 암호화이지 L2 암호화가 아니며, "DX 회선 자체" 암호화 요구사항과 다르다. A는 MACsec을 포함하지만 IPsec을 추가로 쌓는 것은 이중 암호화로 불필요한 지연을 추가한다. TLS(D)는 L7 암호화로 회선 레벨 암호화가 아니다.

---

**문제 3.** 헬스케어 회사가 멀티 계정 환경(HIPAA 규정)을 운영한다. 각 병원 VPC(50개)가 중앙 의료 데이터 분석 VPC의 API에만 접근해야 하고, 병원 VPC 간 통신은 절대 불가능해야 한다. 의료 데이터 분석 VPC의 내부 IP 구조가 병원 VPC에 노출되면 안 된다. CIDR이 중복될 가능성이 있다. 가장 적합한 구성은?

A) TGW + TGW Route Table (병원 VPC를 같은 RT에, Blackhole 라우트)  
B) 각 병원 VPC에 VPC Peering (병원→분석 VPC만)  
C) 분석 VPC에 Endpoint Service(NLB) 생성 + 각 병원 VPC에 Interface Endpoint  
D) 분석 VPC를 RAM으로 공유  

**정답: C**

해설: 요구사항 네 가지: (1) 병원→분석 API만 접근, (2) 병원 간 통신 불가, (3) 분석 VPC 내부 IP 구조 미노출(NLB만 보임), (4) CIDR 겹침 허용. 이 모든 조건을 만족하는 유일한 옵션이 PrivateLink다. Interface Endpoint는 단방향(병원→NLB), CIDR 겹침 허용, 서비스 단위 노출(NLB IP만 보임)이다. 병원 VPC 간에는 Endpoint를 만들지 않으므로 통신 경로가 없어 격리가 자동으로 달성된다. TGW(A)는 병원 VPC 간 통신 차단을 라우트 분리로 구현할 수 있지만 CIDR 겹침을 허용하지 않아 조건 (4) 실패. VPC Peering(B)도 CIDR 겹침 불가. RAM(D)은 리소스 공유이지 서비스 단위 접근 제어가 아니며 내부 IP 구조가 노출된다.

---

**문제 4.** e-commerce 기업이 블랙프라이데이를 앞두고 온프레미스 재고 시스템과 AWS Lambda 기반 주문 처리 시스템 간의 연결 대역폭이 부족하다. 현재 VGW에 연결된 Site-to-Site VPN 1개를 운영 중이다. DX 설치는 6개월이 걸린다. 다음 주까지 처리량을 즉시 확장하는 방법은?

A) VGW를 TGW로 교체하고 ECMP를 활성화하며 VPN 연결 3개 추가  
B) 기존 VPN 대신 Client VPN으로 전환  
C) Direct Connect Hosted Connection을 긴급 신청 (최소 50Mbps)  
D) CloudFront를 Lambda 앞에 배치해 캐싱으로 부하 감소  

**정답: A**

해설: VGW는 ECMP 미지원으로 최대 1.25Gbps(Active 터널 1개). TGW로 교체하고 ECMP 활성화 + VPN 연결 4개(각 2터널, Active-Active) = 총 8터널 병렬 = 이론상 10Gbps까지 확장 가능하다. 이 작업은 며칠 내 완료 가능하다. 핵심은 VGW→TGW 전환이 ECMP를 사용 가능하게 한다는 점이다. Client VPN(B)은 개별 사용자 단말용이며 사이트 간 고대역폭 연결에 부적합하다. Hosted Connection(C)도 수 주가 걸리고 DX 설치 자체가 6개월이라고 했으니 긴급 신청도 시간이 부족하다. CloudFront(D)는 HTTP 캐싱이지 재고 시스템의 실시간 데이터 동기화 대역폭 문제를 해결하지 않는다.

---

**문제 5.** 보안팀이 모든 VPC의 인터넷 아웃바운드 트래픽을 중앙 Palo Alto Networks 방화벽으로 검사하고 싶다. 방화벽 어플라이언스가 상태 저장 검사를 하고 원본 소스 IP를 보존해야 한다. 방화벽은 별도 Security 계정에서 운영되고 워크로드 VPC는 수십 개다. 가장 적합한 아키텍처는?

A) 각 VPC에 Palo Alto Networks 어플라이언스 배포  
B) Security 계정에 GLB + Palo Alto, 워크로드 VPC에 GLB Endpoint + TGW로 트래픽 집중  
C) WAF를 모든 ALB에 적용  
D) Network Firewall을 Egress VPC 중앙에 배포  

**정답: B**

해설: GLB(Gateway Load Balancer)와 GLB Endpoint는 GENEVE 프로토콜(RFC 8926)로 원본 5-tuple(소스 IP, 목적지 IP, 프로토콜, 소스 포트, 목적지 포트)을 보존한 채 어플라이언스로 전달한다. Palo Alto가 상태 저장 검사 후 반환하면 원래 목적지로 전달된다. Security 계정의 GLB를 워크로드 VPC에서 GLB Endpoint로 참조하는 중앙화 모델이 이 요구사항을 정확히 충족한다. TGW는 모든 VPC 아웃바운드를 Egress VPC로 집중시키는 용도로 함께 사용된다. 각 VPC 배포(A)는 어플라이언스 수 × 라이선스 비용이 수십 배가 된다. WAF(C)는 L7 HTTP/HTTPS만, 모든 트래픽 검사 불가. Network Firewall(D)은 AWS 관리형이므로 "중앙 Palo Alto 어플라이언스" 요구사항을 충족하지 않는다.

---

**문제 6.** Fintech 스타트업이 온프레미스 뱅킹 코어 시스템과 AWS를 DX와 VPN으로 이중 연결했다. AWS에서 온프레미스로 향하는 트래픽(인바운드)을 DX가 우선되도록 BGP를 설정해야 한다. 올바른 방법은?

A) AWS 콘솔에서 DX 연결의 "Priority" 값을 높게 설정  
B) 온프레미스 라우터에서 DX로 들어오는 경로에 높은 Local Preference 적용  
C) 온프레미스 라우터에서 VPN 측 BGP 광고에 AS Path Prepending 적용  
D) AWS Lambda로 BGP 경로를 주기적으로 모니터링하고 우선순위 조정  

**정답: C**

해설: AWS → 온프레미스 방향의 경로 선택은 **AWS BGP**가 결정한다. AWS는 AS Path가 짧은 경로를 선호한다(BGP 경로 선택 알고리즘 순서에서 AS Path Length가 높은 우선순위를 갖는다). 온프레미스가 VPN 측 BGP neighbor에서 자신의 ASN을 반복해서 AS Path에 추가(Prepending)하면 VPN 경로가 더 길어 보여 AWS는 AS Path가 짧은 DX 경로를 선택한다. DX가 다운되면 DX BGP 경로가 사라지고 AWS는 유일한 경로인 VPN을 선택한다. A는 AWS 콘솔에 존재하지 않는 기능. B의 Local Preference는 온프레미스 → AWS 방향(아웃바운드) 제어에 사용되며 AWS BGP에 전달되지 않는다. D는 Lambda로 BGP를 직접 제어할 수 없으며 비현실적이다.

---

**문제 7.** 글로벌 미디어 회사가 us-east-1에서 S3 버킷(비디오 렌더링 결과물), Secrets Manager(API 키), ECR(컨테이너 이미지)에 접근하는 배치 처리 EC2 플릿을 운영한다. 모든 접근이 인터넷을 경유하지 않아야 하고 비용을 최적화해야 한다. 최적 구성은?

A) NAT Gateway + 인터넷 경유  
B) S3 Gateway Endpoint + Secrets Manager Interface Endpoint + ECR Interface Endpoint(ecr.api, ecr.dkr)  
C) S3 Interface Endpoint + Secrets Manager Interface Endpoint + ECR Interface Endpoint  
D) Transit VIF + DX Gateway로 온프레미스를 경유해 서비스 접근  

**정답: B**

해설: S3는 Gateway Endpoint(무료)로 인터넷 없이 접근한다. Secrets Manager는 Interface Endpoint(유료, $0.01/hr + GB)가 필요하다. ECR은 두 가지 엔드포인트가 필요하다: `com.amazonaws.region.ecr.api`(API 호출용)와 `com.amazonaws.region.ecr.dkr`(이미지 pull용). 실제로 EC2에서 ECR 이미지를 pull할 때 ECR은 S3에서 레이어를 가져오므로 S3 Gateway Endpoint도 함께 필요하다. C의 S3 Interface Endpoint는 비용이 $0.01/hr + GB이므로 무료인 Gateway Endpoint를 쓰는 B가 비용 최적화 측면에서 우수하다. D는 온프레미스를 경유하는 불필요한 복잡성이다.

---

**문제 8.** 보험사가 온프레미스 데이터센터 2곳(서울 강남, 서울 가산)에서 AWS DX를 운영한다. 현재 구성: 강남 DC → DX Location A(1G 회선 1개), 가산 DC → DX Location B(1G 회선 1개). 한 DX Location 전체 장애 시 서비스가 중단되는 문제가 발생했다. 99.99% SLA를 달성하려면?

A) 기존 각 Location에 회선을 1개씩 추가해 LAG 구성  
B) DX Location A에서 회선 2개, DX Location B에서 회선 2개 = 총 4회선으로 확장  
C) VPN을 추가로 구성해 DX 백업 (High Resiliency + VPN)  
D) DX 대역폭을 10G로 업그레이드해 SLA 개선  

**정답: B**

해설: Maximum Resiliency(99.99%)는 **2개 다른 DX Location에서 각각 2개 회선**, 총 4개 회선으로 구성한다. 현재 각 Location에 1개씩 있으므로 각 Location에 1개씩 추가해야 한다. LAG(A)는 같은 Location 내 포트를 묶는 것(802.3ad/LACP)으로 단일 Location 전체 장애에 무력하다. 4회선을 같은 Location에 LAG로 묶어도 Location 장애 시 동시에 모두 다운된다. VPN 백업(C)은 Development 수준(99%) 이중화이며 99.99% SLA를 달성하지 못한다. DX SLA는 회선 수와 위치의 다양성에 달렸고 대역폭 업그레이드(D)는 SLA와 무관하다.

---

**문제 9.** 회사가 자체 개발한 결제 처리 마이크로서비스를 20개 고객사 VPC에 제공해야 한다. 고객사 VPC의 CIDR이 알 수 없고 겹칠 수 있다. 고객사는 결제 API만 호출할 수 있어야 하고 회사 내부 VPC의 다른 리소스에는 접근 불가능해야 한다. 새 고객사 온보딩 시 운영 부담이 최소화되어야 한다.

A) 20개 고객사 VPC와 각각 TGW Attachment + TGW Route Table로 결제 API VPC만 접근 허용  
B) 결제 서비스 NLB에 Endpoint Service 생성 + AWS Organizations를 허용 Principal로 설정 + 각 고객사가 Interface Endpoint 생성  
C) 결제 서비스를 인터넷facing ALB로 노출 + TLS 암호화 + IP 화이트리스트  
D) 각 고객사 VPC와 VPC Peering + Security Group으로 결제 API 포트만 허용  

**정답: B**

해설: CIDR 겹침 허용 + 서비스 단위 접근 + 새 고객 온보딩 자동화가 모두 충족되어야 한다. B에서 Organizations를 허용 Principal로 설정하면 새 고객사 계정이 Organizations에 추가될 때 별도 Endpoint Service 구성 변경 없이 바로 Interface Endpoint를 생성할 수 있다. `acceptance-required: true`로 설정하면 수동 승인 절차도 추가할 수 있다. TGW Attachment(A)는 CIDR 겹침 불가. 인터넷 ALB(C)는 보안 요구사항(인터넷 없이 사설 접근) 위반. VPC Peering(D)도 CIDR 겹침 불가다.

---

**문제 10.** 다국적 제약회사가 임상 데이터를 AWS에서 분석한다. 연구팀 직원 200명이 각자의 노트북에서 AWS 분석 환경(VPC 내 JupyterHub, RStudio)에 접근한다. 회사가 이미 Azure AD를 IdP로 사용하며 SAML 2.0을 지원한다. 직원의 네트워크 위치(사무실, 재택, 출장)와 무관하게 동작해야 한다. 데이터는 VPC 내부에 있어야 하고 인터넷에 노출되면 안 된다. 최적 구성은?

A) Site-to-Site VPN + 직원 집마다 CGW 라우터 배포  
B) AWS Client VPN + SAML 2.0 (Azure AD) 인증 + 멀티 AZ 서브넷 Association  
C) EC2 Bastion Host + SSH 포트포워딩 + Azure AD 연동  
D) AWS Workspaces + Azure AD SAML 연동  

**정답: B**

해설: 개별 직원 노트북에서 VPC 사설 환경에 접근하는 것은 Client VPN의 정확한 사용 사례다. SAML 2.0으로 Azure AD와 연동하면 직원이 기존 회사 자격증명으로 VPN 인증이 가능하다(SSO). 네트워크 위치 독립적으로 동작하고 모든 데이터가 VPC 내에 유지된다. 멀티 AZ Association으로 고가용성도 보장한다. Client VPN은 OpenVPN 프로토콜 기반이며 자체 CA 또는 ACM 인증서로 클라이언트 mTLS를 추가할 수도 있다. Site-to-Site VPN(A)은 고정 사이트 간 연결이며 각 직원 집에 라우터를 배포하는 것은 운영 부담이 매우 크다. Bastion Host(C)는 SSH 전용으로 HTTP 기반 JupyterHub/RStudio 접근에 부적합하다. Workspaces(D)는 가상 데스크톱 서비스로 기존 노트북을 대체하는 개념이며 비용도 높다.

---

**문제 11.** 다음 중 AWS TGW의 ECMP(Equal-Cost Multi-Path) 동작에 대한 설명으로 **옳은** 것은?

A) TGW ECMP는 VPC Attachment 간에 자동으로 활성화된다  
B) TGW ECMP는 Site-to-Site VPN Attachment에서만 동작하며 각 VPN 연결의 2개 터널을 모두 Active로 사용할 수 있다  
C) TGW ECMP를 사용하면 단일 VPN 연결 4개 터널을 사용해 최대 20Gbps를 달성한다  
D) VGW도 ECMP를 지원하므로 TGW로 교체할 필요가 없다  

**정답: B**

해설: TGW의 ECMP는 **VPN Attachment(Site-to-Site VPN)**에서 동작하며, 여러 VPN 연결의 터널을 Active-Active로 병렬 사용한다. 각 VPN 연결은 2개 터널(Active-Active)을 가지고, VPN 연결 N개를 TGW에 연결하면 2N개 터널이 ECMP로 동작한다. 단일 터널은 최대 1.25Gbps이므로 4개 VPN 연결(8터널)이면 이론상 10Gbps다. VGW(D)는 ECMP를 지원하지 않고 Active-Standby 터널만 사용한다. A는 VPC Attachment 간 ECMP가 아니라 VPN Attachment ECMP다. C에서 단일 VPN 연결은 2터널이므로 4터널이 되려면 VPN 연결 2개가 필요하고, 최대 10Gbps는 VPN 연결 4개 기준이다.

---

**문제 12.** 회사가 온프레미스 데이터센터 A(뉴욕)와 데이터센터 B(런던)를 각각 AWS DX로 연결했다. 두 데이터센터 간에 직접 통신이 필요한데 현재는 온프레미스 라우터를 통해 인터넷으로 연결한다. AWS 네트워크를 백본으로 사용해 두 데이터센터 간 안정적인 저지연 통신을 설정하되 AWS 리전 리소스를 경유하지 않으려 한다. 가장 적합한 구성은?

A) us-east-1 TGW에 두 DX를 연결하고 TGW를 라우팅 허브로 사용  
B) DX SiteLink 활성화 + 두 DC의 DX를 동일 DXGW에 연결  
C) TGW Inter-Region Peering으로 두 리전 TGW를 연결하고 각 DC의 DX를 각 TGW에 연결  
D) Accelerated VPN을 두 DC에 각각 연결하고 AWS Global Accelerator 사용  

**정답: B**

해설: DX SiteLink는 온프레미스 간 트래픽이 AWS 리전의 가상 인터페이스(VPC 등)를 경유하지 않고 DX Location 간 AWS 글로벌 네트워크 백본을 통해 직접 전달되는 기능이다. 뉴욕 DC의 DX와 런던 DC의 DX를 동일 DXGW에 연결하고 SiteLink를 활성화하면, 트래픽이 DX Location → AWS 백본 → DX Location 경로로 전달된다. "AWS 리전 리소스를 경유하지 않는다"는 조건이 SiteLink의 정확한 사용 사례다. A의 TGW 경유는 리전 리소스를 통과한다. C도 TGW를 통과한다. D의 Accelerated VPN은 Global Accelerator를 이용하지만 VPN이므로 DX의 안정적인 저지연에 미치지 못하고 "리전 리소스를 경유하지 않는다"는 조건도 불명확하다.

---

## 다음 주 예고: Week 4 하이브리드 클라우드

Week 4는 AWS의 경계를 확장하는 서비스들을 다룬다. Outposts(AWS 인프라를 고객 데이터센터에), Local Zones(도시 수준 지연 최소화), Wavelength(통신사 5G 엣지), Storage Gateway(온프레미스 스토리지 통합), Snow Family(대규모 데이터 물리 이동), EKS/ECS Anywhere(컨테이너 on-prem 확장)가 주제다. 공통 키워드는 두 가지다: "온프레미스에서 AWS API를 쓰고 싶다"와 "데이터가 AWS까지 이동하는 대역폭/시간이 문제다". 이 두 축으로 Week 4 서비스를 분류하면 절반은 해결된다.
