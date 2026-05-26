# Day 9 - VPC Peering, Transit Gateway, VPC Endpoint: VPC 너머의 연결

VPC 하나로 시작했다가 곧 다음 질문이 떠오른다. "다른 VPC와 통신해야 한다", "온프레미스 DC와 연결해야 한다", "S3에 비공개로 접근하고 싶다." 각각 다른 답이 있고, 그 답을 고르는 기준이 SAA 시험의 단골 시나리오다.

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

> ⚠️ **함정**: Peering의 non-transitive 특성은 N개 VPC를 모두 연결하려면 N(N-1)/2 개의 peering이 필요하게 만든다. 10개 VPC면 45개 peering. 운영 불가능한 수준. 이게 Transit Gateway가 필요한 이유.

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

> 📚 **사례**: AWS 자체 사례 — 2018년 re:Invent 발표에서 TGW 출시 이전 한 고객사가 100+ VPC를 운영했고, 풀 메시 peering이 약 4,950개에 달해 누구도 라우팅 토폴로지를 이해할 수 없었다. TGW로 전환 후 attachment 100개 + route table 5개로 단순화. 이 사례가 TGW 마케팅의 단골 예다.

> 💡 **관련 이론**: TGW의 hub-and-spoke는 네트워크 토폴로지 디자인의 고전. 풀 메시는 redundancy가 최고지만 cost가 N²로 증가, 트리는 cost는 낮지만 SPOF, hub-and-spoke는 hub만 잘 만들면 둘의 균형. AWS Hyperplane이 그 hub의 SPOF 위험을 SDN 분산으로 해결한다.

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

> 🔍 **더 깊이**: Interface Endpoint는 사실상 **AWS PrivateLink**의 한 종류다. PrivateLink는 ENI를 통한 비공개 L4 노출 메커니즘이고, AWS 서비스든 ISV 서비스든 같은 모델을 쓴다. Datadog, Snowflake, MongoDB Atlas 등 다수 SaaS가 PrivateLink endpoint를 제공한다. 이게 "AWS 안에서 인터넷 안 거치고 SaaS와 통신"하는 표준 패턴.

> 📚 **사례**: 2019년 Capital One 사건(Day 1 참조) 이후 많은 회사가 IMDSv2 + Egress 차단으로 SSRF·exfiltration 대비를 강화했다. 이때 S3 Gateway Endpoint + 강력한 endpoint policy + VPC 안의 모든 outbound NAT 차단 조합이 "데이터를 VPC 밖으로 못 보내는" 패턴의 표준이 됐다.

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

## AWS Site-to-Site VPN

온프레미스 ↔ AWS를 IPsec VPN으로 연결. 두 IPsec 터널이 자동 HA로 구성된다.

- **CGW (Customer Gateway)**: 온프레미스 측 VPN 장비 표현.
- **VGW (Virtual Private Gateway)** 또는 **TGW**: AWS 측 종점.
- BGP 또는 정적 라우팅.
- 처리량: 터널당 ~1.25 Gbps.

빠른 구성·저비용이 장점. 단점은 공용 인터넷 경유라 latency 변동·throughput 제한.

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

> 💡 **관련 이론**: 하이브리드 클라우드의 두 모델 — VPN(논리적 터널)과 Direct Connect(물리적 회선)는 trade-off가 명확하다. NIST SP 800-77(IPsec VPN)과 ITU-T G.694.1(WDM)이 각 기술의 표준. 큰 금융·통신 회사는 DX 1Gbps × 2(HA) + VPN backup의 3중 패턴을 표준으로 쓴다.

## ClientVPN: 사용자별 원격 접속

위 VPN이 site-to-site였다면 **ClientVPN**은 사용자 단말 ↔ AWS VPC. TLS 기반 OpenVPN 프로토콜. SAML/AD 인증 통합.

코로나19 시기 원격 근무 폭증으로 사용량 폭발했고, 사내 인프라 접근의 표준 도구가 됐다.

## 정리하며

| 시나리오 | 솔루션 |
|---------|--------|
| 2개 VPC 직접 연결 | Peering |
| 다수 VPC + 온프레미스 | Transit Gateway |
| S3/DynamoDB 비공개 접근 | Gateway Endpoint (무료) |
| 다른 AWS 서비스 또는 SaaS 비공개 접근 | Interface Endpoint (PrivateLink) |
| 빠른 온프레미스 연결 | Site-to-Site VPN |
| 대용량·저지연 하이브리드 | Direct Connect |
| 사용자 원격 접속 | ClientVPN |

---

## 📝 연습 문제

**문제 1.** 한 회사가 8개 VPC와 2개 온프레미스 DC를 모두 연결해야 한다. 가장 적합한 솔루션은?

A) 전체 풀 메시 VPC Peering
B) Transit Gateway hub-and-spoke
C) VPC Endpoint
D) NAT Gateway

**정답: B**
해설: 8개 VPC 풀 메시면 28개 peering, 온프레미스 추가까지 하면 운영 불가능. TGW가 hub-and-spoke로 attachment 10개로 정리. 라우팅 테이블 분리로 prod/dev 격리도 가능.

---

**문제 2.** Private 서브넷에서 S3 비공개 접근이 필요한데 비용을 최소화하려면?

A) NAT Gateway
B) S3 Gateway Endpoint (무료)
C) Interface Endpoint
D) VPN

**정답: B**
해설: S3와 DynamoDB는 Gateway Endpoint 지원, 무료. 라우팅 테이블에 prefix list 자동 추가. 데이터가 인터넷 안 거치고 AWS 내부 망으로 흐르므로 NAT 데이터 전송비도 절감.

---

**문제 3.** Datadog SaaS와 AWS 사이를 인터넷 안 거치고 통신하려면?

A) VPC Peering
B) Interface Endpoint (PrivateLink)
C) Gateway Endpoint
D) Transit Gateway

**정답: B**
해설: 외부 ISV SaaS와의 비공개 연결은 PrivateLink Interface Endpoint. Datadog이 endpoint service를 publishing 하면 우리 VPC에 ENI 생성해 비공개 통신. Gateway는 S3/DynamoDB만, Peering은 VPC끼리만.

---

**문제 4.** VPC Peering의 한계는?

A) 같은 계정만 가능
B) Non-transitive (A-B, B-C가 있어도 A-C 불가)
C) 같은 AZ만 가능
D) 무료가 아님

**정답: B**
해설: Peering은 1:1, 전이 안 됨. 이게 풀 메시 N²로 폭증하는 이유. TGW가 transitive routing으로 해결.

---

**문제 5.** 온프레미스 DC와 AWS 사이에 일관된 1Gbps 대역폭, 낮은 latency가 필요하다. 가장 적합한 솔루션은?

A) Site-to-Site VPN
B) Direct Connect
C) ClientVPN
D) Internet Gateway

**정답: B**
해설: 일관 대역폭·저지연=전용선 Direct Connect. VPN은 공용 인터넷 경유라 변동. DX 설치 기간이 길어 임시로 VPN을 쓰다 DX 완료 후 cutover하는 패턴이 표준.

---

**문제 6.** Interface Endpoint를 통해 임의의 S3 버킷에 접근하는 걸 막으려면?

A) NAT GW 차단
B) Endpoint Policy로 특정 버킷만 허용
C) Route 53 차단
D) IAM 정책만 사용

**정답: B**
해설: Endpoint Policy가 endpoint를 통한 접근의 최후 방어선. 데이터 유출(exfiltration) 방지의 핵심. IAM 정책만으로는 다른 계정 신원의 우회 가능성이 있어 endpoint policy 함께 적용.

---

**문제 7.** TGW의 attachment로 가능한 것이 아닌 것은?

A) VPC
B) Site-to-Site VPN
C) Direct Connect Gateway
D) S3 Bucket

**정답: D**
해설: S3는 attachment가 아니라 VPC Endpoint로 접근. TGW attachment는 네트워크 단위(VPC, VPN, DX, Peering, Connect)만.
