# Day 4 - VPC Peering, Transit Gateway, VPC Endpoint: VPC 너머의 연결

VPC 하나로 시작했다가 곧 다음 질문이 떠오른다. "다른 VPC와 통신해야 한다", "온프레미스 DC와 연결해야 한다", "S3에 비공개로 접근하고 싶다." 각각 다른 답이 있고, 그 답을 고르는 기준이 SAA 시험의 단골 시나리오다. 이 네 가지 연결 방식 — Peering, Transit Gateway, VPC Endpoint, VPN/Direct Connect — 의 trade-off를 명확히 매핑할 수 있으면 네트워크 영역 시험의 절반은 풀린다.

이 글에서는 각 연결 방식의 *언제, 왜, 어떤 trade-off*를 같이 본다. 단순히 키워드 매핑이 아니라 "왜 이 시나리오에 이게 답인가"를 한 번 더 짚는다.

## VPC Peering: 1:1 직접 연결

Peering은 두 VPC를 **1:1 사설 라우팅**으로 연결한다. 같은 리전·계정·다른 리전·다른 계정 모두 가능.

```
[ VPC A: 10.0.0.0/16 ] ──── pcx-xxx ──── [ VPC B: 10.1.0.0/16 ]
       │                                          │
   라우팅 추가:                              라우팅 추가:
   10.1.0.0/16 → pcx-xxx                     10.0.0.0/16 → pcx-xxx
```

특성:

- **non-transitive**: A↔B, B↔C가 있어도 A↔C는 불가. 모든 쌍을 개별 peering 해야 함.
- **CIDR overlap 금지**: 겹치면 라우팅 불가.
- **DNS 해석 옵션**: 활성화하면 상대 VPC의 사설 호스트네임이 해석됨.
- **비용**: peering 자체는 무료. cross-AZ/region 데이터 전송만 과금.

> ⚠️ **함정**: Peering의 non-transitive 특성은 N개 VPC를 모두 연결하려면 N(N-1)/2 개의 peering이 필요하게 만든다. 10개 VPC면 45개 peering. 운영 불가능한 수준. 이게 Transit Gateway가 필요한 이유. 또 Peering은 *MTU 9001(jumbo frame)*을 지원하지만 인터넷 경유로 가는 트래픽은 1500으로 fragment되므로, 큰 데이터 전송에서는 MTU 차이가 throughput에 영향을 준다.

> 🔍 **더 깊이**: Peering은 내부적으로 *static route table entry*로 구현된다. 두 VPC가 peering되면 AWS Mapping Service가 두 VPC의 ENI 매핑 테이블을 서로 참조 가능하게 만든다. 그러나 peering 자체에 *transitive route*가 없는 건 *security boundary* 때문이다 — VPC A가 VPC B와 peering 했다고 해서 VPC B의 다른 peer를 자동으로 신뢰하면 *transitive trust* 취약점이 생긴다. AWS는 이를 명시적으로 차단해서 보안을 강제한다. 같은 원칙이 IAM의 *cross-account role assumption*에도 적용된다 — A가 B의 role을 빌릴 수 있어도 B가 C의 role을 빌릴 수 있는 게 자동으로 A에게 위임되지 않는다.

> 💡 **관련 이론**: Peering의 non-transitive 특성은 그래프 이론의 *complete graph K_n*과 직결된다. n개 노드를 모두 연결하면 n(n-1)/2 개의 edge가 필요한데, 이게 *scale-free network*가 아니라 *fully-connected mesh*가 되는 한계다. Hub-and-spoke 토폴로지(TGW)는 *star graph*로 n-1 edge만 필요해서 *O(n²) → O(n)* 으로 복잡도가 떨어진다.

## Transit Gateway: 라우팅 허브

TGW는 **여러 VPC와 온프레미스를 hub-and-spoke**로 연결한다. 2018년 출시. AWS Hyperplane 위에서 동작해 60+ Tbps의 집계 throughput.

```
        [ VPC A ]
            ↑
[ VPC B ] ─┼─ TGW ─┬─ [ VPC C ]
            ↓       └─ [ On-Prem (VPN/DX) ]
        [ VPC D ]
```

- **Transitive routing**: A→TGW→B 자동 가능.
- **5000개까지 attachment**: VPC, VPN, DX, Peering, Connect 등.
- **Route Tables**: TGW 자체에 여러 라우팅 도메인 분리 가능(prod/dev 분리 등).
- **Multi-region peering**: TGW 간 peering으로 글로벌 backbone 구성.

| 비교 | VPC Peering | Transit Gateway |
|------|------------|-----------------|
| 토폴로지 | 1:1 | Hub-Spoke |
| Transitive | 불가 | 가능 |
| 확장성 | 낮음 (N² 폭증) | 5000 attachment |
| 비용 | 무료 + DT | 시간당 + GB당 |
| 복잡도 | 단순 | 라우팅 테이블 설계 필요 |
| 사용 시점 | 2-3개 VPC | 다수 VPC + 온프레미스 |

> 📚 **사례**: AWS 자체 사례 — 2018년 re:Invent 발표에서 TGW 출시 이전 한 고객사가 100+ VPC를 운영했고, 풀 메시 peering이 약 4,950개에 달해 누구도 라우팅 토폴로지를 이해할 수 없었다. TGW로 전환 후 attachment 100개 + route table 5개로 단순화. 이 사례가 TGW 마케팅의 단골 예다. 비슷한 사례로 2020년 한 글로벌 보험사가 30개국 80+ VPC를 TGW + TGW Peering으로 글로벌 backbone을 구축했고, MPLS 회선 비용을 80% 절감했다고 발표했다.

> 💡 **관련 이론**: TGW의 hub-and-spoke는 네트워크 토폴로지 디자인의 고전. 풀 메시는 redundancy가 최고지만 cost가 N²로 증가, 트리는 cost는 낮지만 SPOF, hub-and-spoke는 hub만 잘 만들면 둘의 균형. AWS Hyperplane이 그 hub의 SPOF 위험을 SDN 분산으로 해결한다. 통신 사업자의 *Multiprotocol Label Switching*(MPLS, RFC 3031)도 같은 hub-and-spoke 모델을 IP 라우팅 위에 구현한 것이고, TGW는 MPLS의 클라우드 버전이라고 볼 수 있다.

> 🔍 **더 깊이**: TGW의 *route table*은 한 TGW 안에 여러 개 둘 수 있고, 각 attachment를 다른 route table에 연결할 수 있다. 이게 *route domain* 분리 기능이다. 예: prod attachment는 prod route table에, dev는 dev route table에 연결하면 prod ↔ dev 간 라우팅이 자동 차단된다. 같은 패턴으로 *shared service VPC*는 양쪽 모두에 라우팅이 가능하게 두면 공통 도구(Active Directory, 로그 수집)는 공유하되 워크로드는 격리할 수 있다. 이 *segmented hub-and-spoke* 패턴이 SRA가 권장하는 표준이다.

> ⚠️ **함정**: TGW는 attachment마다 *appliance mode*를 켜면 *flow stickiness*가 유지된다(같은 흐름이 같은 ENI/AZ로 라우팅). 이걸 안 켜면 ECMP(Equal-Cost Multi-Path)로 트래픽이 분산되는데, *stateful inspection appliance*(예: 가상 방화벽)를 거치면 응답이 다른 경로로 가서 conntrack이 깨질 수 있다. 시험에는 자주 안 나오지만 실무 디테일.

## VPC Endpoint: 인터넷 안 거치고 AWS 서비스 접근

Private 서브넷의 인스턴스가 S3에 접근하려면 NAT GW를 거쳐 인터넷으로 나갔다 돌아와야 한다 — 비싸고 우회. 대안이 **VPC Endpoint**. AWS 서비스에 VPC 내부에서 직접 비공개 접근.

두 종류가 있고 시험에서 가장 자주 헷갈리는 부분이다.

### Gateway Endpoint: S3와 DynamoDB만

- 라우팅 테이블에 prefix list로 경로 추가.
- **무료**.
- S3와 DynamoDB **두 서비스만 지원**.
- 같은 리전만.

```
Route Table에 자동 추가:
  pl-XXXX (S3 prefix list) → vpce-xxxx (Gateway Endpoint)
```

### Interface Endpoint (PrivateLink): 나머지 모두

- ENI를 VPC에 생성, AWS 서비스에 DNS 매핑.
- **시간당 + GB당 과금**.
- 거의 모든 AWS 서비스 지원 + ISV SaaS 지원.
- 같은 리전 + Cross-region (2023년 GA).

| 항목 | Gateway Endpoint | Interface Endpoint |
|------|-----------------|-------------------|
| 지원 서비스 | S3, DynamoDB | 100+ AWS 서비스 + ISV |
| 비용 | 무료 | 시간당 ~$0.01 + GB당 |
| 메커니즘 | 라우팅 prefix list | ENI + Private IP + DNS |
| SG 적용 | 불가 | 가능 |
| DNS | 자동 | private DNS 옵션 |

> 🔍 **더 깊이**: Interface Endpoint는 사실상 **AWS PrivateLink**의 한 종류다. PrivateLink는 ENI를 통한 비공개 L4 노출 메커니즘이고, AWS 서비스든 ISV 서비스든 같은 모델을 쓴다. Datadog, Snowflake, MongoDB Atlas 등 다수 SaaS가 PrivateLink endpoint를 제공한다. 이게 "AWS 안에서 인터넷 안 거치고 SaaS와 통신"하는 표준 패턴. PrivateLink는 내부적으로 *NLB*를 endpoint service에 노출시키는 모델이고, 양쪽이 같은 PrivateLink endpoint로 연결되면 트래픽이 NLB → ENI 흐름으로 전달된다.

> 💡 **관련 이론**: PrivateLink는 *service mesh*의 *east-west traffic*과 비슷한 개념이지만 layer가 다르다. Service mesh(Istio, Linkerd)는 L7 proxy(Envoy)로 mTLS와 retry/timeout을 처리하는 반면, PrivateLink는 L4 TCP 터널이다. 둘은 같이 쓸 수 있다 — PrivateLink로 VPC 간 보안 터널을 만들고, 그 위에 service mesh가 L7 보안과 관찰성을 얹는 패턴. 이게 *zero-trust microservices*의 표준 아키텍처다.

> 📚 **사례**: 2019년 Capital One 사건(Day 1 참조) 이후 많은 회사가 IMDSv2 + Egress 차단으로 SSRF·exfiltration 대비를 강화했다. 이때 S3 Gateway Endpoint + 강력한 endpoint policy + VPC 안의 모든 outbound NAT 차단 조합이 "데이터를 VPC 밖으로 못 보내는" 패턴의 표준이 됐다. 2023년 한 정부 기관은 모든 AWS 서비스를 Interface Endpoint로만 접근하게 강제하고 NAT GW를 아예 제거했다 — 이 *fully private VPC* 패턴이 정부·금융권의 새 표준이 되는 중이다.

### Endpoint Policy: 엔드포인트별 권한 제한

Endpoint에 IAM-스타일 정책을 붙일 수 있다. 예: "이 VPC Endpoint를 통해서는 우리 회사 S3 버킷만 접근 가능".

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/*"
  }]
}
```

이 정책이 없으면 endpoint를 통해 임의의 S3 버킷(타사 포함)에 접근 가능. data exfiltration 방어의 핵심 도구.

> 🔍 **더 깊이**: Endpoint Policy + IAM Identity Policy + S3 Bucket Policy + (Org SCP) 네 정책이 모두 *교차 평가*된다. 한 곳에서 명시 Deny가 있으면 거부. 모든 곳에서 Allow가 필요. 이 *layered policy* 덕분에 다른 계정의 다른 IAM identity가 우리 endpoint를 통해 *우리 의도하지 않은 S3 버킷*에 접근하는 우회 경로를 차단할 수 있다. 2020년 출시된 *VPC Endpoint Policy with aws:PrincipalOrgID*는 "내 Org에 속한 identity만"이라는 가장 강력한 차단 조건을 가능하게 만들었다.

> ⚠️ **함정**: Endpoint Policy를 적용하지 않으면 *모든 S3 버킷에 접근 가능*이 기본이다. 즉 endpoint를 만든 것만으로는 데이터 유출이 막히지 않는다 — 항상 명시적 endpoint policy로 *내 버킷만* 또는 *내 Org의 버킷만* 으로 좁혀야 한다.

## AWS Site-to-Site VPN

온프레미스 ↔ AWS를 IPsec VPN으로 연결. 두 IPsec 터널이 자동 HA로 구성된다.

- **CGW (Customer Gateway)**: 온프레미스 측 VPN 장비 표현.
- **VGW (Virtual Private Gateway)** 또는 **TGW**: AWS 측 종점.
- BGP 또는 정적 라우팅.
- 처리량: 터널당 ~1.25 Gbps.

빠른 구성·저비용이 장점. 단점은 공용 인터넷 경유라 latency 변동·throughput 제한.

> 🔍 **더 깊이**: AWS VPN은 *IPsec/IKEv2*를 사용하고 NIST SP 800-77이 권장하는 암호 스위트(AES-256-GCM, SHA-2, DH Group 14+)를 지원한다. *Accelerated Site-to-Site VPN*(2020 출시)은 VPN 트래픽을 가장 가까운 Global Accelerator 엣지로 보낸 후 AWS 백본망으로 전달해 throughput과 jitter를 개선한다. 대규모 throughput이 필요한 경우 *ECMP*로 여러 터널을 묶어 사용 가능(TGW + multiple tunnels 패턴).

> 💡 **관련 이론**: IPsec(RFC 4301, 2005)은 *transport mode*(host-to-host)와 *tunnel mode*(gateway-to-gateway)가 있고, AWS VPN은 tunnel mode를 쓴다. IKEv2(RFC 7296)는 IKEv1 대비 빠른 rekey, NAT-T(NAT traversal), MOBIKE(mobile/multihoming) 같은 현대 기능을 제공한다. 같은 표준이 Cisco ASA, Palo Alto, FortiGate, OPNsense 등 거의 모든 방화벽 벤더에서 호환된다.

## Direct Connect: 전용선

물리 전용선(1/10/100 Gbps)으로 AWS와 직결. AWS Direct Connect Location에 양측 라우터를 두고 cross-connect.

- **Latency 안정성**: 인터넷 경유 대비 변동 1/10 이하.
- **Bandwidth**: 1/10/100 Gbps dedicated 또는 partner의 50/100/200/300/400/500 Mbps sub-rate.
- **Hybrid 표준**: 대용량·저지연·일관성 요구 시.
- 단점: 설치에 weeks ~ months, 비용.

| 비교 | VPN | Direct Connect |
|------|-----|----------------|
| 매체 | 공용 인터넷 + IPsec | 전용 광섬유 |
| 설치 | 시간 단위 | 주~월 단위 |
| Throughput | ~1.25 Gbps/tunnel | 1-100 Gbps |
| Latency | 변동 | 일관 |
| 암호화 | 기본 (IPsec) | 별도 MACsec 옵션 |
| 비용 | 낮음 | 높음 |

> 💡 **관련 이론**: 하이브리드 클라우드의 두 모델 — VPN(논리적 터널)과 Direct Connect(물리적 회선)는 trade-off가 명확하다. NIST SP 800-77(IPsec VPN)과 ITU-T G.694.1(WDM)이 각 기술의 표준. 큰 금융·통신 회사는 DX 1Gbps × 2(HA) + VPN backup의 3중 패턴을 표준으로 쓴다. *MACsec*(IEEE 802.1AE)은 L2 암호화로 DX의 물리 회선을 보호하는데, 2022년부터 AWS DX에서도 옵션으로 제공한다.

> 🔍 **더 깊이**: DX는 *Public VIF*와 *Private VIF*로 나뉜다. Private VIF는 VPC와 직접 연결, Public VIF는 AWS Public Service(S3, DynamoDB Public Endpoint)에 직접 연결. *Transit VIF*(2019 출시)는 TGW와 연결되어 한 DX 회선이 수십 VPC에 동시 접근 가능. *Direct Connect Gateway*는 한 DX 회선을 여러 리전의 VPC에 연결할 수 있게 해주는 글로벌 라우팅 엔티티다.

> 📚 **사례**: 2019년 한 한국 금융 그룹이 본사 ↔ AWS 서울 리전 사이 10Gbps DX 회선 2개를 다른 통신사로 이중화하고 그 위에 VPN backup까지 3중으로 구성한 사례를 공개했다. 비용은 월 수억 원이었지만, 단 한 번의 장애도 사업에 영향을 주지 않아야 한다는 금융 규제 요구를 충족시켰다. 일반 SaaS는 이렇게까지 안 가도 되고, *DX 1개 + VPN backup* 정도가 표준이다.

## ClientVPN: 사용자별 원격 접속

위 VPN이 site-to-site였다면 **ClientVPN**은 사용자 단말 ↔ AWS VPC. TLS 기반 OpenVPN 프로토콜. SAML/AD 인증 통합.

코로나19 시기 원격 근무 폭증으로 사용량 폭발했고, 사내 인프라 접근의 표준 도구가 됐다.

> 🔍 **더 깊이**: ClientVPN은 OpenVPN 프로토콜이라 일반 OpenVPN 클라이언트(macOS Tunnelblick, Windows OpenVPN GUI, iOS/Android 앱)에서 모두 호환된다. SAML 통합으로 *Okta, Azure AD, Google Workspace*에서 SSO 가능하고, MFA가 IdP 측에서 강제된다. *split-tunnel* 옵션을 켜면 VPC 트래픽만 터널을 타고 일반 인터넷 트래픽은 직접 나가서 throughput과 사용자 경험이 좋아진다. 다만 *full-tunnel*이 보안상 더 안전(모든 트래픽이 회사 통제 하).

> 💡 **관련 이론**: ClientVPN은 *VPN-based remote access*의 클라우드 버전이지만, Zero Trust 시대에는 이마저도 *legacy*로 분류된다. Cloudflare Access, Tailscale, Twingate 같은 ZTNA 솔루션이 *VPN-less*로 같은 기능을 제공하면서 *device posture check*과 *continuous authentication*을 추가한다. AWS 자체는 Verified Access(2023 출시)로 이 영역에 진출했다.

## 정리하며

| 시나리오 | 솔루션 |
|---------|--------|
| 2개 VPC 직접 연결 | Peering |
| 다수 VPC + 온프레미스 | Transit Gateway |
| S3/DynamoDB 비공개 접근 | Gateway Endpoint (무료) |
| 다른 AWS 서비스 또는 SaaS 비공개 접근 | Interface Endpoint (PrivateLink) |
| 빠른 온프레미스 연결 | Site-to-Site VPN |
| 대용량·저지연 하이브리드 | Direct Connect |
| 사용자 원격 접속 | ClientVPN (또는 Verified Access) |
| 글로벌 VPC backbone | TGW Peering 또는 Cloud WAN |

이 표를 머리에 박아두면 시나리오 첫 줄만 봐도 후보가 2개로 좁혀진다. 그 다음은 비용·복잡도·HA 요구치를 비교해 최종 답을 정한다. 마지막으로 한 가지 — 2021년 출시된 *AWS Cloud WAN*은 TGW의 글로벌 backbone 확장이고, 다중 리전 멀티 계정 네트워크를 *policy as code*로 관리하게 해준다. 수십 리전·수백 계정 규모에서는 Cloud WAN이 TGW + TGW Peering 조합보다 운영이 훨씬 단순하다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 8개 VPC와 2개 온프레미스 DC를 모두 연결해야 한다. 가장 적합한 솔루션은?

A) 전체 풀 메시 VPC Peering
B) Transit Gateway hub-and-spoke
C) VPC Endpoint
D) NAT Gateway

**정답: B**
해설: 8개 VPC 풀 메시면 28개 peering, 온프레미스 추가까지 하면 운영 불가능. TGW가 hub-and-spoke로 attachment 10개로 정리. 라우팅 테이블 분리로 prod/dev 격리도 가능. 더 큰 조직(수십 리전)은 Cloud WAN을 검토할 수 있다.

---

**문제 2.** Private 서브넷에서 S3 비공개 접근이 필요한데 비용을 최소화하려면?

A) NAT Gateway
B) S3 Gateway Endpoint (무료)
C) Interface Endpoint
D) VPN

**정답: B**
해설: S3와 DynamoDB는 Gateway Endpoint 지원, 무료. 라우팅 테이블에 prefix list 자동 추가. 데이터가 인터넷 안 거치고 AWS 내부 망으로 흐르므로 NAT 데이터 전송비도 절감. 한 달에 1TB만 S3로 흘러도 Gateway Endpoint로 NAT 데이터 전송비 약 $45/TB을 절감 가능.

---

**문제 3.** Datadog SaaS와 AWS 사이를 인터넷 안 거치고 통신하려면?

A) VPC Peering
B) Interface Endpoint (PrivateLink)
C) Gateway Endpoint
D) Transit Gateway

**정답: B**
해설: 외부 ISV SaaS와의 비공개 연결은 PrivateLink Interface Endpoint. Datadog이 endpoint service를 publishing 하면 우리 VPC에 ENI 생성해 비공개 통신. Gateway는 S3/DynamoDB만, Peering은 VPC끼리만. 같은 패턴이 Snowflake, MongoDB Atlas, Databricks 등 거의 모든 주요 SaaS에 적용된다.

---

**문제 4.** VPC Peering의 한계는?

A) 같은 계정만 가능
B) Non-transitive (A-B, B-C가 있어도 A-C 불가)
C) 같은 AZ만 가능
D) 무료가 아님

**정답: B**
해설: Peering은 1:1, 전이 안 됨. 이게 풀 메시 N²로 폭증하는 이유. TGW가 transitive routing으로 해결. Peering 자체는 무료(데이터 전송만 과금)고, 다른 계정·다른 리전 모두 가능하다.

---

**문제 5.** 온프레미스 DC와 AWS 사이에 일관된 1Gbps 대역폭, 낮은 latency가 필요하다. 가장 적합한 솔루션은?

A) Site-to-Site VPN
B) Direct Connect
C) ClientVPN
D) Internet Gateway

**정답: B**
해설: 일관 대역폭·저지연=전용선 Direct Connect. VPN은 공용 인터넷 경유라 변동. DX 설치 기간이 길어 임시로 VPN을 쓰다 DX 완료 후 cutover하는 패턴이 표준. 더 강한 보안(L2 암호화)이 필요하면 MACsec 옵션을 켜고, HA가 필요하면 두 다른 통신사 DX + VPN backup의 3중 구성.

---

**문제 6.** Interface Endpoint를 통해 임의의 S3 버킷에 접근하는 걸 막으려면?

A) NAT GW 차단
B) Endpoint Policy로 특정 버킷만 허용
C) Route 53 차단
D) IAM 정책만 사용

**정답: B**
해설: Endpoint Policy가 endpoint를 통한 접근의 최후 방어선. 데이터 유출(exfiltration) 방지의 핵심. IAM 정책만으로는 다른 계정 신원의 우회 가능성이 있어 endpoint policy 함께 적용. 2020년 출시된 `aws:PrincipalOrgID` 조건으로 "내 Org에 속한 identity만"이 가능해져 더 강력해졌다.

---

**문제 7.** TGW의 attachment로 가능한 것이 아닌 것은?

A) VPC
B) Site-to-Site VPN
C) Direct Connect Gateway
D) S3 Bucket

**정답: D**
해설: S3는 attachment가 아니라 VPC Endpoint로 접근. TGW attachment는 네트워크 단위(VPC, VPN, DX, Peering, Connect)만. Connect attachment는 SD-WAN 어플라이언스 통합용이고, GRE 터널을 TGW에 종단시킬 수 있다.

---

**문제 8.** 50개 리전에 걸친 멀티 리전 멀티 계정 네트워크를 *policy as code*로 관리하려면?

A) VPC Peering 풀 메시
B) Site-to-Site VPN
C) AWS Cloud WAN
D) Direct Connect 전용선

**정답: C**
해설: Cloud WAN(2021 출시)이 TGW의 글로벌 backbone 확장. JSON 정책으로 segment(prod/dev)와 attachment, route propagation을 일괄 관리. TGW Peering으로 수동 구축할 수도 있지만 수십 리전 규모에서는 Cloud WAN이 표준. 시험에는 아직 자주 안 나오지만 2024년 이후 등장 빈도 증가 중.
