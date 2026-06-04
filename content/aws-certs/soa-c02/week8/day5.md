# Day 5 - Week 8 종합 복습과 시나리오 12문제

Week 8은 VPC라는 가상 데이터센터의 모든 레이어를 따라 내려왔다. 첫 글에선 VPC가 EC2-Classic을 대체하면서 등장한 배경과 SG·NACL의 stateful/stateless 분리를 봤고, 둘째 글에선 Flow Logs·Traffic Mirroring·Reachability Analyzer의 세 추상화로 트래픽을 들여다보는 방법을 봤다. 셋째 글에선 NAT GW·VPC Endpoint·PrivateLink로 외부와 만나는 세 가지 방식, 넷째 글에선 Transit Gateway·VPN·Direct Connect·Route 53으로 여러 VPC와 온프레미스를 묶는 큰 그림이었다.

이 글은 그 네 글을 다시 회상하는 게 아니라, **시험에서 자주 등장하는 시나리오 결정 트리를 12문항으로 정리**한다. 운영자가 실제로 마주치는 결정 — "지금 SG를 늘릴 것인가 NACL을 손볼 것인가", "NAT GW 비용이 폭증했는데 어디부터 끊을 것인가", "DR을 Active-Active로 갈 것인가 Pilot Light로 갈 것인가" — 이 결정들의 트리를 익히는 게 시험 합격과 실무 모두에 도움이 된다.

## Week 8 핵심 한 줄 요약

지난 네 글에서 가장 자주 등장한 사실 12가지를 한 줄씩 정리한다.

1. **SG = Stateful, NACL = Stateless** — NACL은 ephemeral port(1024-65535) 양방향 명시
2. **각 서브넷 5개 예약 IP** (/28은 사용 가능 11개)
3. **Public/Private의 본질은 라우팅 테이블의 IGW 경로 유무**(서브넷 자체엔 속성 없음)
4. **Flow Logs는 메타데이터만** — 169.254.x.x AWS 내부 트래픽 미기록
5. **Traffic Mirroring은 Nitro 인스턴스만** — VXLAN 캡슐화로 복사
6. **Reachability Analyzer는 시뮬레이션**, NAA는 광역 스캔
7. **NAT GW는 AZ 종속** — AZ당 1개 + 자기 AZ로 라우팅
8. **Gateway Endpoint = S3/DDB만 + 무료**, Interface = PrivateLink + 유료
9. **VPC Peering은 transitive 아님**, TGW는 transitive
10. **VPN = 즉시·저렴**, **DX = 일관·고대역폭**(DX 자체 암호화 X)
11. **Route 53 정책 8종** — Latency(성능), Geolocation(규제), Failover(DR)
12. **Resolver Inbound = 온프레→VPC**, Outbound = VPC→온프레

## 4개 핵심 비교표

운영자가 시험에서 가장 자주 마주치는 비교 네 개를 다시 펼쳐둔다.

**관측 도구 3종**

| 항목 | Flow Logs | Traffic Mirroring | Reachability Analyzer |
|------|-----------|-------------------|-----------------------|
| 데이터 | 메타데이터 5-tuple | 실제 패킷 (페이로드) | 정책 그래프 시뮬레이션 |
| 추상화 | L3/L4 | L7까지 | 정책 평가 |
| 비용 | 저장량 | 트래픽 복제 | 분석당 |
| 대상 | ENI/Subnet/VPC | Nitro ENI만 | 두 리소스 간 |
| 답하는 질문 | 누가 누구와 얼마 | 무엇이 흐르는가 | 닿을 수 있나 |

**멀티 VPC 연결**

| 항목 | VPC Peering | Transit Gateway |
|------|-------------|-----------------|
| 토폴로지 | Mesh (N×N) | Hub-and-Spoke (N) |
| Transitive | X | O |
| 비용 | 데이터 전송만 | Attachment 시간당 + 데이터 |
| 관리 | N(N-1)/2 복잡 | N개 단순 |
| 적합 규모 | 2-5개 VPC | 5개 이상 |

**VPC Endpoint 2종**

| 항목 | Gateway | Interface (PrivateLink) |
|------|---------|-------------------------|
| 서비스 | S3, DynamoDB만 | 거의 모든 AWS + 자사 |
| 비용 | **무료** | 시간당 + GB당 |
| 메커니즘 | 라우팅 테이블 prefix list | 사설 IP를 ENI에 부여 |
| 라우팅 | Route Table 항목 | DNS resolution |
| Cross-Account | X | O |

**온프레미스 연결**

| 항목 | Site-to-Site VPN | Direct Connect |
|------|------------------|----------------|
| 매체 | 인터넷 + IPsec | 전용 광케이블 |
| 대역폭 | 터널당 1.25 Gbps | 1/10/100 Gbps |
| 지연 | 변동 | 일관·낮음 |
| 설치 | 즉시 (수 시간) | 수 주~수 개월 |
| 암호화 | 내장 (IPsec) | 없음 (MACsec 별도) |
| 비용 | 저렴 | 비쌈 |

---

## 📝 시나리오 12문제

**문제 1.** Custom NACL에 80번 인바운드만 허용했더니 HTTP 요청은 들어오는데 응답이 안 나간다. 원인은?

A) Internet Gateway가 VPC에 attach되지 않아 응답 패킷이 외부로 라우팅되지 못함
B) NACL은 Stateless라 응답 트래픽의 ephemeral port(1024-65535) 아웃바운드도 명시해야 함
C) Security Group 아웃바운드 규칙이 기본값에서 변경되어 응답 트래픽을 차단하고 있음
D) Public 서브넷 라우팅 테이블에 0.0.0.0/0 → IGW 경로가 없어 리턴 트래픽이 드롭됨

**정답: B**

해설: NACL의 가장 흔한 함정. SG는 Stateful이라 connection tracking으로 응답이 자동 통과하지만 NACL은 연결 상태를 추적하지 않는다. 클라이언트가 80번으로 요청 보낼 때 source port는 OS가 할당한 ephemeral port(Linux 32768-60999, Windows 49152-65535)이고, 서버 응답은 그 ephemeral port로 돌아가야 한다. NACL 아웃바운드에서 1024-65535 전체를 허용하는 게 가장 안전한 패턴 — 더 좁히면 특정 OS·특정 흐름이 끊긴다. 이게 SG와의 본질적 차이.

---

**문제 2.** Private 서브넷의 EC2가 S3로 일 1TB 데이터를 보내면서 NAT GW 비용이 폭증한다. 가장 적절한 해결책은?

A) NAT GW를 AZ마다 증설하고 대역폭을 분산해 데이터 처리 병목을 완화 (단가는 동일하므로 총비용은 그대로)
B) Gateway Endpoint(S3) 추가 — 무료, AWS 백본 내부로 우회
C) NAT GW를 직접 운영하는 NAT Instance로 교체해 데이터 처리 요금 없이 EC2 인스턴스 비용만 부담
D) 인스턴스를 Public 서브넷으로 옮기고 퍼블릭 IP를 부여해 IGW 경유로 S3에 직접 접근

**정답: B**

해설: S3/DynamoDB는 Gateway Endpoint(무료)로 NAT GW 완전 우회. 1TB/일이면 NAT GW로는 월 $1,350(데이터 처리 $0.045/GB × 30000GB), Gateway Endpoint는 $0. 추가로 트래픽이 AWS 백본 내부로만 흘러 보안도 강화된다. Endpoint Policy로 접근 가능 버킷 제한까지 가능해 데이터 유출 방지에도 유리. NAT GW 증설은 비용 더 쓰는 것이고, NAT Instance는 운영 부담만 늘 뿐 트래픽 자체는 여전히 NAT 처리.

---

**문제 3.** 사설 VPC(인터넷 차단)에서 SSM Session Manager를 사용하려 한다. 필요한 구성은?

A) NAT GW를 두어 인스턴스가 퍼블릭 SSM 엔드포인트로 아웃바운드 인터넷을 거쳐 통신 (인터넷 차단 요건 위배)
B) Interface Endpoint 3개 (ssm, ssmmessages, ec2messages) + Private DNS 활성화
C) S3·DynamoDB용 Gateway Endpoint 1개를 만들어 SSM Agent 트래픽을 라우팅 테이블 prefix list로 우회
D) 온프레미스 경유 Site-to-Site VPN을 연결해 그쪽 프록시를 통해 SSM API를 호출

**정답: B**

해설: SSM은 세 채널을 모두 사용한다 — ssm(API), ssmmessages(양방향 메시지), ec2messages(Agent 통신). 세 endpoint 모두 Interface 타입으로 만들어야 Session 동작. Gateway Endpoint는 S3/DDB만 지원이라 SSM엔 불가. Private DNS 활성화가 표준이라 인스턴스가 코드 수정 없이 기본 SSM 도메인을 호출하면 endpoint의 사설 IP로 resolve된다. CloudWatch Logs로 명령 출력 보내려면 logs endpoint도, ECR 풀하려면 ecr.api + ecr.dkr + S3 Gateway Endpoint도 추가 — 사설 환경의 endpoint 리스트는 5-10개로 길어진다.

---

**문제 4.** Private EC2가 외부 API 호출에 실패한다. 가장 먼저 사용할 도구는?

A) 인스턴스에 Wireshark를 설치해 실제 패킷을 캡처하고 어느 hop에서 응답이 끊기는지 분석
B) Reachability Analyzer로 EC2 → IGW(또는 NAT GW) 경로 시뮬레이션
C) Inspector로 인스턴스 취약점을 스캔해 네트워크 스택을 막는 CVE가 있는지 확인
D) GuardDuty 위협 분석으로 외부 API 호출이 악성 IP 차단 룰에 걸렸는지 점검

**정답: B**

해설: 연결성 트러블슈팅의 1순위 도구. 패킷을 실제 보내지 않고 정책 그래프(SG·NACL·Route Table·IGW)를 분석해 hop별 결정 근거를 30초 안에 제시한다 — "SG-dest 인바운드 80 누락" 같은 구체적 차단 지점. Wireshark는 패킷이 흘러야 의미가 있는데(애초에 안 흐르니 막힌 거다) 부적합. Inspector/GuardDuty는 보안 도구지 연결성 진단 도구가 아니다. 사람이 SG → NACL → Route Table → IGW를 일일이 확인하면 30분, Reachability Analyzer는 30초.

---

**문제 5.** 회사가 20개 VPC + 온프레미스 통합 네트워크를 운영하려 한다. 가장 효율적인 도구는?

A) 20개 VPC를 모든 쌍으로 VPC Peering(190개)하고 온프레미스는 각 VPC에 별도 VPN 연결
B) Transit Gateway 중앙 허브 + VPN/Direct Connect로 온프레미스
C) 모든 VPC를 Site-to-Site VPN 터널로 상호 연결하고 온프레미스도 같은 방식으로 묶기
D) Direct Connect 회선 하나에 20개 VPC의 VIF를 붙여 온프레미스·VPC를 모두 연결

**정답: B**

해설: 20×19/2=190 Peering은 관리 지옥이고, 새 VPC 추가 = 기존 20개와 모두 새 피어링. TGW는 hub-and-spoke로 20개 attachment만 관리하면 끝, transitive 라우팅으로 모든 VPC 도달 가능. Route Table 분리로 prod-dev 격리 같은 정책을 hub에서 일원화. 온프레미스는 VPN(즉시·저렴) 또는 DX(일관·대량) attachment로 같은 TGW에 붙는다. AT&T가 1970년대 전국 전화망을 mesh에서 hub-and-spoke로 전환한 것과 같은 발상.

---

**문제 6.** Multi-Region 환경에서 사용자에게 가장 빠른(지연 최소) 리전 라우팅하려면?

A) Weighted Routing으로 리전별 가중치를 지정해 트래픽 비율을 분산
B) Latency-based Routing
C) Geolocation Routing으로 사용자 국가·대륙을 기준으로 가장 가까운 리전에 매핑
D) Failover Routing으로 Primary 리전이 건강하면 그쪽으로, 장애 시 Secondary로 전환

**정답: B**

해설: Latency-based는 AWS의 실제 측정 기반으로 지연 최소 리전을 응답. 사용자가 한국에 있어도 그 시점 도쿄가 더 빠르면 도쿄로 보낸다 — 성능 최적화 목적. Geolocation은 사용자 국가/대륙 기준이라 지연과 무관할 수 있다(규제·로컬라이제이션용, 예: "EU 사용자는 무조건 EU 리전 — GDPR"). 둘이 비슷해 보여도 자주 다른 답을 준다. 성능 = Latency, 규제 = Geolocation 으로 기억.

---

**문제 7.** Multi-AZ Private 서브넷의 외부 통신을 HA로 구성하려면?

A) 한 AZ에 NAT GW 1개를 두고 모든 AZ의 Private 서브넷이 그 NAT를 공유하도록 라우팅
B) AZ마다 NAT GW 하나씩 + 각 AZ의 Private 라우팅 테이블이 자기 AZ의 NAT를 가리킴
C) NAT Instance 한 대를 Auto Scaling 그룹(min/max 1)에 두어 장애 시 자동 복구로 HA 확보
D) Private 서브넷을 Internet Gateway에 직접 라우팅해 NAT 없이 외부 통신을 HA로 구성

**정답: B**

해설: NAT GW는 AZ 종속. 한 AZ에만 두면 ① 그 AZ가 죽으면 다른 AZ의 Private 인스턴스도 외부 통신 끊김(다중 AZ 원칙 위배), ② Cross-AZ 트래픽이 GB당 $0.01 추가 청구. AZ마다 NAT GW + 라우팅 테이블도 AZ별로 분리해서 자기 AZ NAT를 가리키게 하는 게 표준. 가용성과 비용 둘 다 해결. 단일 NAT GW + Multi-AZ Private 서브넷은 가장 흔한 안티패턴.

---

**문제 8.** 보안팀이 의심스러운 인스턴스의 실제 HTTP 헤더와 본문을 IDS로 분석하려 한다. 어떤 도구?

A) Flow Logs를 켜고 5-tuple(srcAddr·dstAddr·port·protocol)로 의심 흐름을 필터링해 분석
B) Traffic Mirroring (Mirror Source = ENI, Target = NLB → Suricata/Zeek 분석 인스턴스)
C) Reachability Analyzer로 의심 인스턴스의 경로를 시뮬레이션해 어떤 트래픽이 닿는지 분석
D) GuardDuty의 위협 탐지 결과로 해당 인스턴스의 악성 통신 패턴을 식별

**정답: B**

해설: 핵심은 "실제 패킷 페이로드"가 필요하다는 점. Flow Logs는 메타데이터(5-tuple + bytes/action)만 기록하므로 HTTP 헤더·본문이 안 보인다. Traffic Mirroring이 ENI 패킷을 VXLAN으로 캡슐화해 그대로 복사. 받는 쪽 NLB가 여러 분석 인스턴스로 부하 분산하면 SPOF도 피한다. 단점은 Nitro 인스턴스만 지원하고 복사 트래픽 비용이 추가된다는 점 — Mirror Filter로 의심 프로토콜만 좁히는 게 표준 운영.

---

**문제 9.** B2B SaaS 회사가 고객 VPC에 인터넷 거치지 않고 서비스를 노출하려 한다. 일부 고객의 VPC CIDR이 자사와 겹친다. 어떤 기술?

A) 고객 VPC와 VPC Peering을 맺고 충돌하는 CIDR은 고객 측에서 재할당하도록 요청
B) AWS PrivateLink: NLB + Endpoint Service + Consumer Endpoint
C) Transit Gateway를 RAM으로 고객과 공유하고 Route Table로 자사 서비스 VPC만 노출
D) 고객마다 Site-to-Site VPN을 연결하고 충돌 CIDR은 NAT로 변환해 통신

**정답: B**

해설: PrivateLink가 정확한 사용 사례. ① CIDR 충돌 무관 — Consumer는 자기 사설 IP로 endpoint 호출, Provider CIDR 무관. ② 인터넷 노출 X — AWS 백본 내부로만. ③ Allowed Principals 화이트리스트로 고객별 접근 통제. Snowflake, MongoDB Atlas, Confluent Cloud 모두 같은 패턴. VPC Peering·TGW는 CIDR 충돌 시 연결 불가. VPN은 고객마다 별도 라우터 협상이 필요해 SaaS 규모에선 비현실적.

---

**문제 10.** Direct Connect만으로 운영 중인데 회선 장애 시 가용성을 높이려 한다. AWS 권장 패턴은?

A) DX 1개로도 SLA가 보장되므로 BGP 라우팅 튜닝으로 재수렴 시간만 단축하면 충분
B) 다른 location에 DX 회선 2개 (High Resilience) 또는 DX + VPN backup (Hybrid)
C) 같은 location의 다른 DX 디바이스에 회선 2개를 두어 장비 단위 이중화 확보
D) DX 회선 대역폭을 두 배로 늘려 단일 장애 시에도 잔여 용량으로 트래픽을 흡수

**정답: B**

해설: DX 1개는 SPOF. AWS 권장 HA 패턴 4단계 — Development(1개), High Resilience(다른 location 2개), Maximum Resilience(4개), Hybrid(DX + VPN backup). **다른 location 2개**가 비용 대비 효율적으로 가장 흔한 선택. 같은 location 2개는 location 자체 장애(굴착기·정전·화재)에 견디지 못해 의미 없다. Hybrid 패턴은 DX 1개로 비용 줄이고 장애 시 VPN으로 자동 페일오버해 다운타임은 피한다(대역폭 감소만 감수).

---

**문제 11.** 운영자가 NAT GW 비용 분석을 위해 Flow Logs에서 "어느 인스턴스가 외부로 가장 많은 데이터를 보내는가"를 찾으려 한다. 가장 효율적인 방법은?

A) CloudWatch Logs Insights에서 `stats sum(bytes) by srcAddr | sort desc | limit 10` 쿼리
B) S3에 저장된 Flow Logs(Parquet)를 Athena로 `SELECT instance_id, sum(bytes)/1e9 as gb GROUP BY instance_id ORDER BY gb DESC` 쿼리
C) GuardDuty 알람 확인
D) VPC 콘솔의 메트릭만 확인

**정답: B**

해설: 대량 분석엔 S3 Parquet + Athena가 압도적으로 효율적. 1TB Flow Logs 한 달 보관 비용이 CloudWatch Logs $530 vs S3 Parquet $25(20배 차이), 게다가 Parquet 컬럼형 압축으로 Athena 스캔 바이트가 5-10배 작아 쿼리 비용도 줄어든다. Hive-compatible partitioning(year/month/day/hour)으로 시간 범위 쿼리 시 다른 파티션은 아예 스캔 안 함. Logs Insights는 실시간 알람·디버깅용. 장기 분석·보고서엔 Athena. 운영 패턴은 보통 두 저장소를 같이 쓴다.

---

**문제 12.** 회사 정책상 "VPC 내 EC2는 회사 소유 S3 버킷에만 접근하고, 외부 계정 버킷에는 접근 못 하게" 강제하려 한다. 어떤 도구?

A) Security Group에서 S3 IP 제한
B) Gateway Endpoint + Endpoint Policy에 `aws:PrincipalAccount` 또는 `s3:ResourceAccount` 조건
C) NACL에 S3 deny
D) NAT GW Policy

**정답: B**

해설: Endpoint Policy로 endpoint를 통한 API 호출에 추가 제약을 건다. `aws:PrincipalAccount=123456789012` 조건으로 우리 계정 자격증명만, 또는 `s3:ResourceAccount=123456789012`로 우리 계정 소유 리소스만 허용. SG는 IP 기반이라 S3 같은 동적 IP 서비스에 부적합. NAT GW엔 Policy 개념이 없다. NACL의 IP deny도 비실용. Endpoint Policy는 IAM Policy 위에 얹는 추가 제약이라 "IAM에 권한이 있어도 endpoint 정책에 부합해야 통과" — 데이터 유출 방지의 강력한 안전망이다. 시험에서 "Endpoint Policy로 IAM에 없는 권한 부여"는 함정 보기.

---

## 통합 결정 트리 — 시나리오별 도구 선택 빠른 참조

운영 환경에서 자주 마주치는 결정을 트리로 정리한다. 시험 시나리오에서도 이 순서로 사고하면 답이 빠르다.

**"외부와 통신해야 한다"**

```
어디로 가는 트래픽인가?
├── 임의의 외부 URL (예: 외부 SaaS API)
│   └── NAT Gateway (AZ당 1개, 같은 AZ로 라우팅)
├── S3 또는 DynamoDB
│   └── Gateway Endpoint (무료)
├── 다른 AWS 서비스 (SSM, ECR, Logs 등)
│   └── Interface Endpoint (PrivateLink, 유료, Private DNS 활성)
└── 다른 VPC/계정의 자사·타사 서비스
    └── PrivateLink Endpoint Service (NLB + Allowed Principals)
```

**"연결성 문제다"**

```
무엇을 알고 싶은가?
├── 닿을 수 있나? 어디서 막혔나? (1:1)
│   └── Reachability Analyzer (시뮬레이션, 30초)
├── 모든 인스턴스 중 외부 노출된 것은? (광역)
│   └── Network Access Analyzer + Access Scope
├── 누가 누구와 얼마나 통신하나? (트래픽 분석)
│   └── Flow Logs + Logs Insights/Athena
└── 실제 패킷 페이로드를 봐야 한다 (보안 분석)
    └── Traffic Mirroring → Suricata/Zeek
```

**"여러 VPC를 묶어야 한다"**

```
VPC가 몇 개인가? 온프레미스 연결 필요?
├── 2-3개 VPC, 온프레미스 없음
│   └── VPC Peering (단, transitive 아님 — A↔B, B↔C 있어도 A→C 별도 필요)
├── 5개 이상 VPC 또는 온프레미스 통합
│   └── Transit Gateway (hub-and-spoke + RT 분리로 정책 통제)
└── B2B SaaS 형태 (CIDR 충돌 가능)
    └── PrivateLink
```

**"온프레미스와 연결"**

```
요구 사항이 무엇인가?
├── 즉시 필요, 저렴, 임시·소규모
│   └── Site-to-Site VPN (인터넷 + IPsec, 약 1.25Gbps/터널)
├── 일관 대역폭, 낮은 지연, 대량 트래픽 (SLA)
│   └── Direct Connect (1/10/100Gbps, 설치 수 주, 비쌈)
├── DX 회선 1개의 SPOF 회피
│   └── High Resilience: 다른 location 2 회선
└── DX 비용 절감하면서도 장애 시 fallback
    └── Hybrid: DX 1개 + VPN backup
```

**"Multi-Region DR"**

```
RTO와 비용의 trade-off?
├── RTO 0, 비용 2배 OK, 글로벌 사용자
│   └── Active-Active + Latency-based Routing + 데이터 양방향 복제
│       (DynamoDB Global Tables, S3 CRR, Aurora Global DB)
├── RTO 수 분 ~ 수십 분, 비용 절감
│   └── Active-Passive (Pilot Light/Warm Standby) + Failover Routing
│       + Health Check + 짧은 TTL(60s)
└── DNS TTL 영향 없는 빠른 페일오버 필요
    └── Global Accelerator (BGP Anycast, 1-2초 페일오버)
```

---

## 추가 시나리오 2문제

**문제 13.** 회사가 Multi-Region Active-Passive DR을 구성했다. Primary 리전 ALB 장애 시 Route 53 Failover가 동작하는데, **DNS TTL 300초 + 일부 ISP의 추가 캐싱**으로 RTO가 7분 이상 걸린다. RTO를 1-2초로 줄이려면?

A) Route 53 레코드의 TTL을 0으로 낮춰 resolver 캐싱을 없애고 페일오버를 즉시 전파
B) AWS Global Accelerator로 전환 (BGP Anycast로 정적 IP 광고, DNS TTL 우회)
C) Secondary 리전에 NAT GW를 추가해 페일오버 경로의 아웃바운드 지연을 줄임
D) ALB를 NLB로 교체해 L4 고정 IP를 확보하고 헬스체크 간격을 단축해 전환을 가속

**정답: B**

해설: DNS TTL은 RFC 1035/2181에 정의된 캐싱 기간이고, 0으로 설정해도 일부 resolver(ISP DNS)가 자체 정책으로 최소 캐싱(보통 30-60초)을 강제하는 경우가 많다. Route 53 Failover의 본질적 한계. Global Accelerator는 다른 모델 — AWS가 BGP Anycast로 2개 정적 IP를 전 세계에 광고하고, 그 IP가 리전별 endpoint로 라우팅된다. Primary 리전이 죽으면 AWS 백본에서 BGP 라우팅 테이블 업데이트로 1-2초 안에 트래픽이 Secondary로 전환되므로 DNS TTL 무관. 엄격한 RTO가 필요한 금융·게임 산업의 표준 패턴.

---

**문제 14.** 운영자가 Transit Gateway에 Prod VPC와 Dev VPC를 attach했다. 정책상 "Prod는 Shared Services VPC와만 통신, Dev VPC와는 격리"가 필요하다. 어떻게 구성하는가?

A) Prod와 Shared 사이에만 VPC Peering을 추가하고 Dev는 TGW에서 떼어내 별도 연결로 격리
B) TGW Route Table을 분리 — Prod RT(Shared만 propagate), Dev RT(Shared만 propagate), 상호 격리
C) Prod VPC의 Security Group 인바운드에서 Dev VPC CIDR을 명시적으로 차단해 격리
D) TGW를 Prod용·Dev용 두 개로 분리하고 Shared VPC를 양쪽 TGW에 각각 attach

**정답: B**

해설: TGW의 핵심 강점이 Route Table 분리로 정책을 hub에서 통제한다는 점. 각 attachment는 하나의 RT에 associate(어느 RT의 경로를 볼지)되고, 여러 RT에 propagate(자기 경로를 어느 RT로 broadcast할지)될 수 있다. Prod attachment를 Prod RT에 associate + Shared attachment를 Prod RT에 propagate하면 Prod는 Shared 경로만 보고 Dev 경로는 안 보인다 → 자동 격리. Dev도 같은 방식으로 구성. SG 차단은 인스턴스 단위 통제라 운영 비용이 크고 휴먼 에러에 취약. TGW 2개는 hub-and-spoke의 단순성을 깨고 비용 2배. 이 RT 분리 패턴이 멀티 계정 환경의 표준 구성이다.

---

## 다음 주 예고 — Week 9 보안 운영

Week 9는 **보안 운영** — KMS · Secrets Manager · GuardDuty · Security Hub. 시험 가중치 16%인 보안·컴플라이언스 영역의 핵심이다.

- Day 1: KMS — Key Policy, Grant, Rotation, CloudHSM의 위치
- Day 2: Secrets Manager 자동 회전, Cross-Region Replication, Parameter Store와의 비교
- Day 3: IAM Access Analyzer와 Trusted Advisor 보안 점검
- Day 4: GuardDuty(이상 탐지), Security Hub(통합), Inspector(취약점), Macie(데이터 분류)
- Day 5: Week 9 종합 + 시나리오 문제

이번 주 VPC가 "네트워크 경계"였다면, 다음 주는 "데이터·자격증명·위협의 경계"다. 두 주가 합쳐져야 운영 보안의 큰 그림이 완성된다.
