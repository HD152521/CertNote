# Day 4 - Transit Gateway, VPN, Direct Connect, Route 53 — 멀티 VPC와 하이브리드의 큰 그림

회사가 처음 클라우드를 시작할 땐 VPC 하나면 충분하다. 그러다 보면 dev/stage/prod를 분리하고, 팀별 VPC를 만들고, 인수합병으로 다른 회사의 VPC를 떠안고, 온프레미스 데이터센터와도 연결하게 된다. 어느 순간 운영자는 5개, 20개, 50개 VPC가 어떻게 통신해야 하는지를 결정해야 한다. 그 시점에 만나는 도구들이 Transit Gateway, VPN, Direct Connect, Route 53이다.

이 도구들의 어려움은 각자가 어떤 trade-off를 푸는지를 모르고 시작하면 잘못된 조합으로 끝난다는 점이다. 20개 VPC를 VPC Peering으로 묶으면 190개 연결이 필요하고, 단일 Direct Connect 회선만으로 운영 트래픽을 받다가 회선 장애로 다운타임을 겪는 일이 매년 어딘가에서 일어난다. Route 53의 8가지 라우팅 정책도 비슷한 이름들 사이에서 운영자가 잘못 고르면 사용자 일부가 항상 느린 리전으로 가는 사고가 난다. 이 글은 각 도구가 푸는 문제와 함정을 따라간다.

## VPC를 묶는 두 가지 패턴 — Mesh vs Hub-and-Spoke

여러 VPC를 연결하는 방법은 본질적으로 두 가지다.

**Mesh 토폴로지** — VPC Peering으로 모든 VPC 쌍을 직접 연결. N개 VPC면 N(N-1)/2개 연결. 5개는 10개, 10개는 45개, 20개는 190개. 한 VPC를 추가하면 기존의 N개와 모두 새 연결이 필요해 관리 부담이 제곱으로 증가한다.

**Hub-and-Spoke 토폴로지** — 중앙 허브(Transit Gateway)에 모든 VPC가 한 번씩만 연결. N개 VPC면 N개 연결. 한 VPC 추가 = 한 연결 추가. 통신 경로는 모두 hub를 거치므로 정책을 hub에서 일원화할 수 있다.

| 측면 | VPC Peering (Mesh) | Transit Gateway (Hub-Spoke) |
|------|--------------------|-----------------------------|
| 연결 수 (N개 VPC) | N(N-1)/2 | N |
| Transitive | X (A↔B, B↔C 있어도 A→C 불가) | O (hub 통해 모두 도달) |
| 라우팅 정책 | VPC별 분산 관리 | hub에서 중앙 통제 |
| 비용 | 데이터 전송만 | 시간당 attachment + 데이터 전송 |
| 대역폭 | VPC당 무제한 | TGW당 50 Gbps (attachment당) |
| 적합한 규모 | 2-5개 VPC | 5개 이상 |

> 💡 **관련 이론**: Hub-and-Spoke vs Mesh의 trade-off는 1980년대 통신 네트워크 설계에서 나온 고전적 주제다. AT&T가 1960년대까지 미국 전국 전화망을 mesh로 운영하다가 1970년대 hub-and-spoke + dynamic routing으로 전환한 게 같은 결정 — 연결 수가 N²이 되니 운영 부담이 한계에 부딪힌 거다. 항공망(허브 공항 모델)도 같은 발상이다. AWS Transit Gateway는 이 산업 표준을 클라우드에 그대로 가져왔다. 단점은 hub가 SPOF가 될 수 있다는 점이지만, TGW는 AZ multi-replicated라 단일 AZ 장애엔 견딘다.

### VPC Peering의 결정적 한계 — Transitive가 아니다

VPC Peering에서 가장 자주 데이는 함정. A↔B 피어링이 있고 B↔C 피어링도 있어도 A에서 C로 직접 통신할 수 없다. **Peering은 transitive가 아니다**. A가 C와 통신하려면 별도의 A↔C 피어링이 필요하다.

왜 이렇게 설계됐나? 보안 격리 때문이다. A가 B와 피어링했다는 사실이 자동으로 "B의 모든 피어와 통신 허용"이 된다면 B의 신뢰 도메인이 A의 신뢰 도메인으로 확장된다. 명시적이지 않은 신뢰 전이는 보안 사고의 흔한 원인이라 AWS는 transitive를 일부러 막았다.

Transit Gateway는 정반대다. **Transitive가 기본**이고, 차단하려면 TGW Route Table을 명시적으로 분리해야 한다. TGW의 라우팅 모델은 attachment마다 어느 Route Table에 attach할지를 결정하고, 그 Route Table이 가진 경로만 보인다. "Prod VPC는 Shared Services VPC와만 통신, Dev VPC와는 격리"같은 정책을 Route Table 두 개로 표현한다.

```
TGW Route Table 구성 예
============================
  Prod VPC ──┐
  Shared VPC ┼──── "Prod RT" (Shared만 허용)
             │
  Dev VPC ──┴──── "Dev RT" (Shared만 허용, Prod 격리)
```

> ⚠️ **함정**: VPC Peering이 transitive가 아니라는 사실은 시험 단골이지만, 실무에선 더 미묘한 함정이 있다. "VPC A가 VPC B의 ALB를 호출"한다고 가정하자. ALB가 internal scheme이면 VPC B의 사설 IP로 응답하므로 peering으로 동작한다. 그런데 ALB가 internet-facing이면 ALB의 public IP가 응답에 박혀서 클라이언트(VPC A)가 인터넷으로 우회해야 한다 — peering으로 안 풀린다. 운영에선 cross-VPC 호출 시 항상 internal ALB와 사설 DNS를 쓰는 게 안전 패턴.

## Transit Gateway 내부 — Route Table과 Propagation

TGW를 처음 보는 운영자가 헷갈리는 게 "왜 Route Table이 여러 개고, Association과 Propagation이 뭐가 다른지"다.

**Attachment**: VPC, VPN, Direct Connect Gateway, 다른 TGW를 TGW에 연결. 각 attachment는 정확히 하나의 Route Table에 **associate**된다(어느 RT의 경로를 볼지 결정).

**Propagation**: attachment가 가진 경로를 어느 Route Table에 broadcast할지. attachment는 여러 Route Table에 propagate될 수 있다.

이 두 개념의 분리가 강력하다. 예시:

```
Attachment    │ Associated RT │ Propagated to RT
──────────────┼───────────────┼──────────────────
Prod VPC      │ Prod RT       │ Prod RT, Shared RT
Dev VPC       │ Dev RT        │ Dev RT, Shared RT
Shared VPC    │ Shared RT     │ Prod RT, Dev RT, Shared RT
```

해석: Prod VPC는 Prod RT의 경로만 본다(Shared VPC 경로가 propagate돼서 도달 가능, Dev VPC 경로는 없어서 격리). Shared VPC는 모든 RT에 propagate돼서 Prod·Dev 둘 다와 통신할 수 있다. Dev와 Prod는 RT가 분리돼 있고 서로의 경로가 없으니 직접 통신 불가.

이 패턴이 멀티 계정 환경에서 가장 흔한 구성이다 — Shared Services VPC(인증 서버, 패키지 미러, 모니터링)에는 모두 접근, prod와 dev는 서로 격리.

> 🔍 **더 깊이**: TGW는 **BGP**로 라우팅 정보를 교환한다. VPC attachment는 정적이지만 VPN/DXGW attachment는 BGP로 동적 경로를 받는다. AWS 측 BGP ASN은 기본 64512(2-byte private ASN)고, 32-bit ASN을 쓰려면 4200000000-4294967294 범위에서 선택. 온프레미스 라우터와 BGP peer 관계를 맺고, 양쪽이 자기 경로를 광고한다. BGP 운영의 함정 중 하나는 "AS path prepending"으로 경로 선호도를 조작하는 것 — 같은 prefix를 두 회선으로 받을 때 한쪽을 일부러 길게 만들어 다른 쪽을 우선시한다. DX 두 회선의 active-active load balancing을 위한 표준 기법.

## VPN — 인터넷 위에 만든 암호화 터널

Site-to-Site VPN은 온프레미스 라우터와 AWS의 VGW(또는 TGW) 사이에 IPsec 터널을 만든다. 인터넷을 매체로 쓰지만 패킷이 암호화돼 있어서 안전하다.

내부 구조:
- 온프레미스 라우터(**Customer Gateway**, CGW) ↔ AWS의 **Virtual Private Gateway**(VGW) 또는 TGW
- AWS가 자동으로 **두 개의 IPsec 터널** 제공 (HA용, 각각 다른 AZ의 endpoint)
- 정적 라우팅 또는 BGP 동적 라우팅 선택

핵심 비용은 두 가지 — VPN Connection당 시간당 $0.05, 데이터 전송(송신) GB당. 작은 사이트라면 월 수십 달러로 충분하지만 대량 트래픽에는 부적합하다.

| 측면 | VPN | Direct Connect |
|------|-----|----------------|
| 매체 | 인터넷 + IPsec | 전용 광케이블 |
| 대역폭 | 터널당 약 1.25 Gbps | 1G / 10G / 100G |
| 지연 | 변동(인터넷 경로) | 일관·낮음 |
| 설치 | 즉시(수 시간) | 수 주 ~ 수 개월 |
| 비용 | 저렴 | 비쌈 (회선 + 포트) |
| 암호화 | IPsec 내장 | 없음 (별도 MACsec) |
| 사용 사례 | 임시·소규모·백업 | 일관 성능·대량·SLA 요구 |

### VPN의 단일 터널 한계

AWS VPN의 단일 터널은 약 1.25 Gbps가 한계다. 두 터널을 active-active로 쓰면 약 2.5 Gbps. 그 이상은 **Multiple VPN connections + ECMP**(Equal-Cost Multi-Path)로 늘릴 수 있는데, TGW가 ECMP를 지원하므로 TGW에 여러 VPN을 attach하면 자동 load balancing. 그래도 Direct Connect의 10/100 Gbps에는 못 미친다.

> 📚 **사례**: 2020년 코로나로 재택근무가 폭증할 때 많은 회사가 VPN 한계에 부딪혔다. AWS Client VPN(또는 Site-to-Site VPN 위에 얹은 SSL VPN)이 동시 연결 한계로 사용자를 못 받는 사고가 줄을 이었다. AWS의 답은 ECMP + scaling-out — 단일 VPN의 큰 한 개 대신 작은 여러 개로 분산. 이게 시험에는 깊이 안 나오지만 실무에선 VPN 설계의 핵심 결정 사항이다.

## Direct Connect — 전용 회선의 일관성

Direct Connect(DX)는 온프레미스와 AWS 사이에 전용 광케이블을 깐다. 인터넷을 거치지 않으므로 지연이 일관되고(보통 1-5ms 추가), 대역폭이 일관되며(SLA 보장), 대량 트래픽에 비용 효율적이다.

### Connection 종류

| 종류 | 설명 | 대역폭 |
|------|------|--------|
| **Dedicated Connection** | AWS에서 직접 1개 물리 회선 제공 | 1G / 10G / 100G |
| **Hosted Connection** | AWS Partner가 자신의 DX 회선을 분할해 고객에게 재판매 | 50M / 100M / 200M / 300M / 400M / 500M / 1G / 2G / 5G / 10G |

Dedicated는 대형 기업이 직접 AWS Direct Connect Location에 회선을 설치하는 경우, Hosted는 중소 기업이 Partner(예: Equinix, KT, LG U+)를 통해 가져오는 경우다. Hosted가 설치도 빠르고 작은 대역폭부터 시작 가능해 일반적인 선택이다.

### Virtual Interface (VIF)

DX 회선 위에 가상 인터페이스를 만든다. 세 종류:

| VIF | 용도 |
|-----|------|
| **Private VIF** | 특정 VPC와 통신 (VGW에 attach) |
| **Public VIF** | AWS public 서비스(S3, DynamoDB)와 통신 — 사실상 모든 public AWS endpoint |
| **Transit VIF** | Direct Connect Gateway → 여러 VPC/리전 (TGW와 함께) |

운영 환경에선 Transit VIF + DXGW + TGW 조합이 표준이다. DX 회선 하나로 여러 리전·여러 VPC에 모두 접근 가능.

### DX의 HA — SPOF를 피하는 표준 패턴

단일 DX 회선은 명백한 SPOF다. 굴착기가 광케이블을 끊는 사고는 매년 어딘가에서 일어난다. AWS가 권장하는 HA 패턴은 4단계로 나뉜다.

| Resilience Level | 구성 | 가용성 |
|------------------|------|--------|
| **Development** | 단일 회선 1개 | 낮음 |
| **High Resilience** | 다른 DX Location에 2개 회선 | 한쪽 location 장애에 견딤 |
| **Maximum Resilience** | 다른 location의 2 device에 2 회선 × 2 set = 4 회선 | 거의 모든 단일 장애에 견딤 |
| **Hybrid** | DX + VPN backup | DX 장애 시 VPN으로 자동 페일오버 (대역폭은 감소) |

대부분의 운영 환경에선 High Resilience(다른 location 2개 회선)가 비용 대비 효율적이다. Maximum Resilience는 금융 등 SLA가 매우 엄격한 산업에서. Hybrid 패턴(DX + VPN backup)은 DX 회선 비용은 1개로 줄이면서도 장애 시 VPN으로 트래픽이 흘러 다운타임 자체는 피한다 — 대역폭이 줄어들 뿐.

> ⚠️ **함정**: Direct Connect는 **기본적으로 암호화되지 않는다**. 전용 회선이라 외부에서 도청은 어렵지만, 컴플라이언스상 "전송 중 암호화" 요구가 있는 경우(HIPAA, PCI 일부 영역) 별도 조치가 필요하다. 두 가지 옵션 — ① **MACsec**(L2 암호화, 100G DX에서만 지원), ② **VPN over Direct Connect**(DX 위에 IPsec VPN을 또 얹음). 시험에서 "DX는 암호화돼 있다"라는 보기는 함정이다.

## Route 53 — DNS와 라우팅 정책 8종

Route 53은 단순한 DNS가 아니라 **라우팅 정책 엔진**이다. 같은 도메인이 여러 IP를 가질 때 어느 IP를 응답할지를 8가지 정책으로 결정한다.

### 8개 정책 한눈에

| Policy | 결정 기준 | 사용 사례 |
|--------|-----------|-----------|
| **Simple** | 단일 IP (또는 여러 IP를 랜덤 순서로) | 가장 기본 |
| **Weighted** | 가중치 비율 분배 | Canary 배포, A/B 테스트 |
| **Latency-based** | AWS 측정 지연 최소 리전 | 글로벌 사용자 최적화 |
| **Geolocation** | 사용자 국가/대륙 | 콘텐츠 로컬라이제이션, 규제 준수 |
| **Geoproximity** | 위치 + bias(특정 리전 가중치 조정) | Traffic Flow 필수 |
| **Failover** | Primary Health 체크 → Secondary로 자동 | DR 페일오버 |
| **Multivalue Answer** | 최대 8개 IP 동시 반환 + Health Check | 간단한 LB 대용 |
| **IP-based** | 클라이언트 CIDR 기반 | ISP별 다른 응답 |

운영자가 가장 혼동하는 게 **Latency-based vs Geolocation**이다. 둘 다 "위치 기반"으로 보이지만 다르다.

- **Latency-based**: AWS가 측정한 실제 네트워크 지연이 최소인 리전. 사용자가 한국에서 접속해도 그 시점에 우연히 도쿄 리전의 지연이 더 낮으면 도쿄로 보낸다. **성능 최적화**용.
- **Geolocation**: 사용자의 IP를 GeoIP DB로 국가/대륙 매핑해서 그 위치에 매핑된 endpoint로 보낸다. "EU 사용자는 무조건 EU 리전(GDPR 준수)" 같은 **규제·로컬라이제이션**용.

성능을 원하면 Latency, 규제를 원하면 Geolocation. 둘이 자주 다른 답을 준다.

### Failover Routing의 TTL 함정

Failover 라우팅의 동작은 단순하다. Primary record에 Health Check를 붙이면 Health가 정상일 때 Primary 응답, 비정상이면 Secondary 응답.

문제는 **DNS TTL 캐시** 때문에 페일오버가 즉시 이뤄지지 않는다. TTL이 300초로 설정돼 있다면 클라이언트와 ISP DNS resolver가 응답을 최대 5분 캐싱한다 — Health Check가 즉시 실패를 잡아도 트래픽 전환은 5분 후. DR 환경에선 TTL을 60초 이하로 짧게 잡는 게 표준이다.

게다가 일부 ISP는 **RFC 2181을 위반하고 TTL을 무시**하고 더 오래 캐싱한다(자기 DNS resolver 부하를 줄이려고). 그래서 "Failover는 즉시"가 아니라 "Failover는 TTL + 일부 사용자에게 추가 지연" 모델로 이해해야 한다.

> 💡 **관련 이론**: DNS TTL과 가용성의 trade-off는 RFC 1035(1987)와 RFC 2181(1997)에서 정의된다. 짧은 TTL은 빠른 변경 전파를 주지만 권위 서버 부하가 늘고, 긴 TTL은 부하가 적지만 변경 반영이 느리다. AWS는 이 한계를 우회하려고 **Global Accelerator**를 만들었다 — DNS 대신 BGP Anycast로 정적 IP를 광고하므로 라우팅 변경이 BGP 업데이트(수 초)로 전파된다. TTL 5분을 기다릴 필요 없이 1-2초 안에 페일오버 완료. DR 요구가 엄격하다면 Route 53 Failover 대신 Global Accelerator를 고려할 가치가 있다.

### Health Check의 세 종류

Route 53 Health Check는 세 가지 모드를 지원한다.

1. **Endpoint Health Check**: IP/도메인의 HTTP/HTTPS/TCP 응답 모니터링. 가장 흔함.
2. **Calculated Health Check**: 여러 Health Check의 결합(AND/OR). "DB와 캐시 둘 다 정상일 때만 정상".
3. **CloudWatch Alarm 기반**: CloudWatch Alarm의 상태를 Health Check로 변환. 메트릭 기반 페일오버(예: "5xx 비율이 5% 이상이면 unhealthy").

세 번째가 운영자에게 가장 유연하다. ALB의 5xx 메트릭이나 RDS의 connection 메트릭에 기반해 페일오버를 트리거할 수 있다. 단순 HTTP ping보다 깊은 건강성 판단이 가능.

## Route 53 Resolver — VPC와 온프레미스 DNS 통합

하이브리드 환경에선 두 방향의 DNS 쿼리가 필요하다.

| 방향 | 도구 | 용도 |
|------|------|------|
| VPC → 온프레미스 | **Outbound Endpoint** | EC2가 `intranet.corp.local` resolve |
| 온프레미스 → VPC | **Inbound Endpoint** | 사내 서버가 `internal.example.com` resolve (Private Hosted Zone) |

**Outbound Endpoint**는 VPC 안에 ENI 2개(보통 다른 AZ)를 만들고, Resolver Rule로 "특정 도메인은 온프레미스 DNS 서버로 forward"를 정의한다. EC2가 `intranet.corp.local`을 query하면 Resolver가 룰을 보고 VPN/DX 너머의 온프레미스 DNS 서버로 query를 forward한다.

**Inbound Endpoint**는 반대로 온프레미스에서 VPC의 Private Hosted Zone을 query할 수 있게 한다. ENI에 사설 IP가 부여되고, 온프레미스 DNS 서버가 그 IP로 conditional forwarder를 설정한다.

이 두 개념이 하이브리드 환경의 DNS 문제 대부분을 푼다. 시험에서 "온프레미스에서 VPC 내부 ALB 도메인을 어떻게 resolve하는가"가 나오면 Inbound Endpoint가 답이다.

> 🔍 **더 깊이**: Route 53 Resolver는 내부적으로 VPC의 `.2` IP(AmazonProvidedDNS)와 같은 컴포넌트다. VPC를 만들면 자동으로 활성화되는 그 DNS resolver가 사실 Route 53 Resolver의 인스턴스다. Endpoint를 추가하는 건 "이 resolver가 외부와도 통신할 수 있게 ENI를 노출"하는 것에 가깝다. 그래서 VPC의 `enableDnsSupport`가 꺼져 있으면 Resolver Endpoint도 동작하지 않는다.

## Multi-Region DR — Active-Active vs Active-Passive

Multi-Region 가용성 전략은 두 패턴으로 나뉜다.

**Active-Active Multi-Region**:
- 두 리전 모두 운영 트래픽 처리
- Latency-based Routing으로 사용자가 가까운 리전에 도달
- 비용 2배(인프라 양쪽 다 운영)
- RTO 거의 0(한 리전 죽어도 다른 리전이 자동으로 모든 트래픽 수용)
- 데이터 양방향 복제 필요(DynamoDB Global Tables, S3 Cross-Region Replication, Aurora Global Database)

**Active-Passive (DR)**:
- Primary 리전이 모든 트래픽 처리, Secondary는 대기
- Failover Routing + Health Check로 자동 전환
- Pilot Light(최소 자원만 가동) 또는 Warm Standby(축소 운영)로 비용 절감
- RTO 수 분 ~ 수십 분(Secondary scale-up 시간 + DNS TTL)
- 데이터 단방향 복제(Primary → Secondary)

대부분 회사는 비용 때문에 Active-Passive로 시작한다. SLA가 99.99% 이상 요구되거나 글로벌 사용자가 많으면 Active-Active로 진화. 두 전략 모두 Route 53이 라우팅 컴포넌트로 들어가고, Health Check가 페일오버 결정을 한다.

> 📚 **사례**: 2017년 AWS S3 us-east-1 장애 때 많은 회사가 영향을 받았는데, Netflix는 거의 영향이 없었다. 이유는 Netflix가 Multi-Region Active-Active로 운영하면서 Route 53과 Global Accelerator 조합으로 즉시 트래픽을 다른 리전으로 옮겼기 때문. 반면 단일 리전이거나 Active-Passive였던 회사들은 페일오버 자체에 30분-2시간이 걸려 다운타임이 길었다. 이 사건 이후 AWS는 "Region 단위 격리"를 더 강조하기 시작했고, Route 53 Application Recovery Controller(2020년 출시)로 페일오버 자동화를 강화했다.

## 정리하며

멀티 VPC와 하이브리드의 큰 그림은 네 가지 결정으로 압축된다.

① **VPC 5개 이상 = Transit Gateway**. Peering의 N² 관리 부담을 피한다. RT 분리로 prod-dev 격리도 hub에서 통제.

② **온프레미스 연결은 트래픽으로 결정**. 임시·소규모는 VPN(즉시·저렴), 일관 대량은 Direct Connect(설치 오래·비쌈), 안전한 HA는 DX 2회선 + VPN backup.

③ **Route 53 정책은 의도로 결정**. 성능은 Latency, 규제는 Geolocation, DR은 Failover. 비슷해 보여도 다른 답을 준다.

④ **DR은 RTO와 비용의 trade-off**. Active-Active는 비용 2배 RTO 0, Active-Passive는 비용 절감 RTO 수 분. Route 53 + Global Accelerator + Multi-Region 데이터 복제가 핵심 빌딩 블록.

다음 글은 Week 8의 모든 내용을 시나리오 문제로 종합한다. VPC 기초부터 멀티 리전 DR까지, 운영자가 실제로 마주칠 결정 트리를 12문항으로 정리한다.

---

## 📝 연습 문제

**문제 1.** 회사가 20개 VPC + 온프레미스 데이터센터를 통합 네트워크로 운영하려 한다. 가장 효율적인 도구는?

A) VPC Peering으로 모든 쌍 직접 연결 (190개 피어링)
B) Transit Gateway 중앙 허브 + VPN 또는 Direct Connect로 온프레미스 연결
C) VPN을 VPC마다 별도 설치
D) Direct Connect만 사용

**정답: B**

해설: 20×19/2 = 190개 VPC Peering은 관리 지옥이다. 새 VPC 추가 = 기존 20개와 모두 새 피어링. TGW가 hub-and-spoke로 20개 attachment만 관리하면 끝나고, transitive 라우팅으로 모든 VPC가 서로 도달 가능하다. Route Table 분리로 "prod-dev 격리" 같은 정책도 hub에서 일원화. 온프레미스는 VPN attachment(즉시·저렴) 또는 Direct Connect Gateway attachment(일관·대량)로 같은 TGW에 붙인다. AT&T가 1970년대 전국 전화망을 mesh에서 hub-and-spoke로 전환한 것과 같은 발상.

---

**문제 2.** 회사가 온프레미스 데이터센터와 AWS 간 일관된 10Gbps 대역폭과 낮은 지연(<5ms)을 요구한다. VPN으론 부족하다면?

A) VPN을 여러 개 ECMP로 묶기
B) Direct Connect (10G Dedicated Connection 또는 Hosted Connection)
C) Internet Gateway 대역폭 증설
D) Multi-Region

**정답: B**

해설: VPN은 단일 터널이 약 1.25Gbps 한계이고 인터넷 경유라 지연이 변동적이다. ECMP로 여러 터널 묶어도 10Gbps 일관 대역폭과 낮은 지연 SLA를 보장하긴 어렵다. Direct Connect가 정확한 답 — 전용 광케이블이라 대역폭과 지연이 일관되고, 1G/10G/100G 옵션. 다만 설치가 수 주~수 개월 걸리고 비싸므로 즉시성 요구가 있다면 임시로 VPN을 쓰고 DX 설치를 병행하는 게 운영 패턴.

---

**문제 3.** Multi-Region 환경에서 사용자에게 가장 빠른(지연 최소) 리전으로 자동 라우팅하려 한다. 어떤 Route 53 정책?

A) Weighted
B) Latency-based Routing
C) Geolocation
D) Failover

**정답: B**

해설: Latency-based는 AWS가 측정한 실제 네트워크 지연이 최소인 리전을 응답한다. 사용자가 한국에 있어도 그 시점에 우연히 도쿄 리전의 지연이 더 낮으면 도쿄로 보낸다 — **성능 최적화**가 목적. Geolocation은 사용자 국가/대륙 기준이라 지연과 무관할 수 있다(한국 사용자는 항상 한국 리전, 한국 리전이 일시 느려도 그대로). Geolocation은 규제·로컬라이제이션용(예: "EU 사용자는 무조건 EU 리전"). 비슷해 보이는 두 정책의 의도 차이를 정확히 알아야 한다.

---

**문제 4.** Primary 리전 ALB가 다운되면 Secondary 리전 ALB로 자동 전환되게 하려면?

A) Latency-based Routing
B) Failover Routing + Health Check (Primary record에 Health Check 부착)
C) Weighted Routing
D) Simple Routing + 수동 변경

**정답: B**

해설: Failover Routing의 정확한 사용 사례. Primary record에 Health Check를 붙이면 Health가 정상일 때 Primary 응답, 비정상이면 Secondary 응답. TTL을 60초 이하로 짧게 설정해야 빠른 페일오버(기본 300초면 5분 캐싱). 일부 ISP가 RFC 2181을 위반해 TTL을 무시하고 더 캐싱하는 함정도 있어서 "즉시 100% 페일오버"는 아니라는 점도 알아둬야 — 더 엄격한 RTO엔 Global Accelerator(BGP Anycast로 1-2초 페일오버)가 답.

---

**문제 5.** Route 53이 사용자의 ISP(예: KT 사용자는 A, SKT 사용자는 B)에 따라 다른 IP를 반환하게 하려면?

A) Geolocation
B) IP-based Routing (CIDR 기반)
C) Weighted
D) Latency

**정답: B**

해설: IP-based Routing은 클라이언트 IP의 CIDR 매칭으로 응답을 결정한다. ISP별 CIDR이 다르므로 KT 사용자는 KT CIDR로 매칭해 A 응답, SKT 사용자는 SKT CIDR로 매칭해 B 응답. Geolocation은 국가/대륙 수준이라 ISP 구분이 불가. 비교적 신기능이라 시험에 점차 등장. 사용 사례는 ① ISP별 CDN 엣지 분리, ② 통신사 회선 협상 결과를 라우팅에 반영.

---

**문제 6.** Direct Connect를 사용 중인데 회선 장애에 대비해 가용성을 높이려 한다. AWS 권장 패턴은?

A) DX 회선 1개 + 충분히 큰 대역폭
B) 같은 location에 DX 회선 2개
C) **다른 location에 DX 회선 2개** (또는 DX + VPN backup의 Hybrid)
D) Multi-Region

**정답: C**

해설: 단일 DX 회선은 SPOF. AWS 권장 HA 패턴은 4단계 — Development(1개), High Resilience(다른 location 2개), Maximum Resilience(4개), Hybrid(DX + VPN backup). **다른 location 2개**가 비용 대비 효율적으로 가장 흔한 선택. 같은 location 2개는 location 자체 장애에 견디지 못한다. Hybrid 패턴은 DX 1개로 비용은 줄이면서 장애 시 VPN으로 자동 페일오버해 다운타임은 피한다(대역폭 감소만 감수). Multi-Region은 AWS 리전 단위 장애 대비지 DX 회선 장애와 다른 문제.

---

**문제 7.** 온프레미스 서버가 VPC의 사설 ALB 도메인(`internal.example.com`)을 resolve할 수 있게 하려면?

A) VPC Peering
B) Route 53 Resolver Inbound Endpoint + 온프레미스 DNS의 conditional forwarder 설정
C) Public Hosted Zone에 등록
D) Direct Connect만 있으면 충분

**정답: B**

해설: 하이브리드 DNS의 표준 구성. VPC의 Private Hosted Zone(`internal.example.com`)은 VPC 내부에서만 resolve 가능 — 온프레미스 서버는 기본적으로 못 본다. **Route 53 Resolver Inbound Endpoint**가 VPC 안에 ENI 2개(다른 AZ)를 만들어 사설 IP를 노출하고, 온프레미스 DNS 서버가 `internal.example.com` query를 그 IP로 conditional forward하면 VPC 내부 Private Hosted Zone resolve가 가능해진다. 반대 방향(VPC → 온프레미스 DNS)은 Outbound Endpoint. 시험에서 "온프레미스에서 VPC 내부 도메인을 어떻게"가 나오면 Inbound가 답.

---
