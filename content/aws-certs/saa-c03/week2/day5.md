# Day 10 - Week 2 종합: 패킷이 흐르는 길을 한 번 더 그리기

VPC는 작은 박스 하나가 아니라 라우팅 테이블 + 게이트웨이 + 방화벽 + 엔드포인트의 합주다. 시험에서 "이 시나리오에 가장 적절한 네트워크 설계는?" 류 문제가 나오면, 머릿속에서 패킷이 어디서 출발해 어디서 막히고 어디로 빠지는지를 그릴 수 있어야 답이 보인다. 한 주 동안 다룬 모든 서비스 — IGW, NAT GW, Bastion/SSM, SG, NACL, Flow Logs, Peering, TGW, Endpoint, VPN, DX — 가 결국 *패킷의 흐름*을 어떻게 통제하느냐의 다른 측면일 뿐이다.

Week 2를 한 문장으로 압축하면 이렇다. **VPC 네트워킹의 모든 결정은 "이 패킷을 어디로 보낼 것인가(라우팅)"와 "이 패킷을 통과시킬 것인가(방화벽)" 두 축의 조합이다.** 라우팅은 *목적지*를 정하고, 방화벽은 *허가*를 정한다. 게이트웨이(IGW/NAT/VGW/TGW)는 라우팅 축의 목적지 후보들이고, SG·NACL은 방화벽 축의 정책 엔진이며, 엔드포인트(Gateway/Interface)는 "AWS 서비스로 가는 패킷을 인터넷 밖으로 안 내보내는" 특수 라우팅이다. 이 두 축으로 모든 컴포넌트를 분류해 보면 한 주의 지식이 한 장의 격자 위에 정렬된다.

이 글은 Week 2의 모든 조각을 한 그림 위에 다시 얹는다. 그리고 시나리오 매핑 표 + 자주 틀리는 함정 + 실제 사고 사례를 한 번 더 정리해서 시험 직전 단권화 자료로 쓸 수 있게 한다. 단순 암기가 아니라 *왜 그 설계가 정답인지*를 패킷의 관점에서 복원하는 게 목표다.

## VPC 토폴로지 종합 다이어그램

```
                  [ Internet ]
                       ↑
                  [ IGW ]
                       │
  ┌────────────────────┼──────────────────────────┐
  │  VPC 10.0.0.0/16   │                          │
  │                                                │
  │  Public Subnet 10.0.0.0/24 (AZ-a)              │
  │   ├─ Bastion / ALB / NAT GW (EIP)              │
  │   └─ Route: 0.0.0.0/0 → IGW                    │
  │                                                │
  │  Private Subnet 10.0.10.0/24 (AZ-a)            │
  │   ├─ App EC2 / ECS Task                        │
  │   └─ Route: 0.0.0.0/0 → NAT GW                 │
  │                                                │
  │  DB Subnet 10.0.20.0/24 (AZ-a)                 │
  │   ├─ RDS (no public)                           │
  │   └─ Route: local only                         │
  │                                                │
  │  (AZ-b, AZ-c도 같은 구조)                       │
  │                                                │
  │  Gateway Endpoint → S3, DynamoDB               │
  │  Interface Endpoint → SSM, ECR, Secrets...     │
  │                                                │
  └────────────────────┬───────────────────────────┘
                       │
                  [ TGW ] ─── 다른 VPC, 온프레미스
```

이 토폴로지가 SAA 시나리오 문제의 *기본 배경*이다. 거의 모든 네트워크 시나리오는 이 그림 위에 "여기서 어떤 컴포넌트가 빠졌는가" 또는 "이 컴포넌트를 추가하려면 무엇이 필요한가"를 묻는 형태로 변형된다. 그림을 따라 패킷 하나를 손가락으로 짚어 보자. DB 서브넷의 RDS가 S3에 백업을 쓴다고 하면, 그 패킷은 `local` 라우팅을 벗어나 어디로 가야 하는가? IGW로 가면 인터넷 노출이고, NAT GW로 가면 비용이 발생한다. 정답은 Gateway Endpoint로 빠져 AWS 백본으로 직행하는 것이다 — 이 한 줄의 추론이 시나리오 문제 절반의 골격이다.

> 💡 **관련 이론**: 이 토폴로지는 *hub-and-spoke* + *3-tier* 두 고전 패턴의 합성이다. 3-tier(Presentation/Application/Data)는 1990년대 후반 엔터프라이즈 아키텍처에서 왔고, hub-and-spoke는 1950년대 항공 노선 설계(Delta가 애틀랜타 허브로 개척)에서 유래해 1990년대 WAN 설계로 넘어왔다. TGW는 정확히 이 hub-and-spoke를 네트워크 코어에 구현한 것이다. AWS가 2018년 re:Invent에서 TGW를 발표하기 전까지는 VPC Peering 풀메시(O(n²) 연결)로 같은 걸 흉내 냈는데, 이건 hub-and-spoke가 아니라 *point-to-point mesh*라서 VPC가 늘수록 관리가 기하급수로 폭증했다.

## 두 축으로 보는 Week 2 격자

| 컴포넌트 | 라우팅 축(어디로) | 방화벽 축(허가) |
|---------|--------------|------------|
| IGW | 0.0.0.0/0 인터넷 진입/진출 | 없음(라우팅만) |
| NAT GW | 0.0.0.0/0 outbound only | 없음(SNAT만) |
| SG | 없음 | ENI 단위 stateful Allow |
| NACL | 없음 | Subnet 단위 stateless Allow/Deny |
| Gateway Endpoint | prefix list로 S3/DDB 직행 | Endpoint Policy |
| Interface Endpoint | ENI(사설 IP)로 서비스 직행 | Endpoint Policy + SG |
| Peering | 상대 VPC CIDR 라우팅 | 없음(SG 참조 가능) |
| TGW | 다중 VPC/온프레미스 라우팅 | TGW route table 분리 |
| VGW/VPN | 온프레미스 CIDR 라우팅 | 없음(IPsec 암호화) |

이 격자가 머릿속에 있으면 "이 시나리오는 라우팅 문제인가 방화벽 문제인가"를 즉시 분리할 수 있다. "응답이 안 온다"는 보통 방화벽(NACL stateless) 문제고, "패킷이 아예 안 나간다"는 보통 라우팅(경로 누락) 문제다.

## 시나리오 키워드 → 정답 매핑

| 키워드 | 정답 |
|--------|------|
| "Private 인스턴스가 외부 API 호출" | NAT Gateway (AZ별) |
| "운영자가 인스턴스에 안전하게 접근" | Session Manager |
| "TCP 22 포트를 열고 싶지 않다" | Session Manager / EIC Endpoint |
| "S3 비공개 접근 + 무료" | S3 Gateway Endpoint |
| "SaaS·다른 AWS 서비스 비공개 접근" | Interface Endpoint (PrivateLink) |
| "VPC 2개 직접 연결" | Peering |
| "다수 VPC + 온프레미스 Hub" | Transit Gateway |
| "온프레미스 빠르게 연결" | Site-to-Site VPN |
| "온프레미스 대용량·저지연" | Direct Connect |
| "사용자가 원격으로 VPC 접근" | ClientVPN / Verified Access |
| "특정 IP 대역 광역 차단" | NACL Deny 룰 |
| "응답 트래픽 자동 통과" | SG (stateful) |
| "사후 트래픽 감사" | VPC Flow Logs |
| "패킷 페이로드까지 검사" | Traffic Mirroring |
| "DNS 쿼리 감사" | Route 53 Resolver Query Logs |
| "다계정 VPC 공유" | AWS RAM |
| "IP 거버넌스 자동화" | IPAM |
| "글로벌 멀티 리전 backbone" | Cloud WAN |
| "S3 endpoint로 임의 버킷 접근 차단" | Endpoint Policy + aws:PrincipalOrgID |
| "회선 L2 암호화" | DX + MACsec |
| "외부 인터넷 없는 EC2 SSM 접근" | SSM/SSMmessages/EC2messages Interface Endpoint |

> 🔍 **더 깊이**: 이 매핑표의 함정은 *키워드가 둘 이상 섞인* 복합 시나리오다. SAA-C03은 단순 "키워드→서비스" 1:1 매칭을 줄이고, "비용 최적화 + 고가용성 + 규제 준수"처럼 제약을 3개 이상 겹쳐서 *최선의 trade-off*를 고르게 만든다. 예를 들어 "온프레미스를 저지연으로 연결하되 회선 장애에도 끊기면 안 된다"면 DX 단독이 아니라 **DX + Site-to-Site VPN backup**이 정답이다. DX는 물리 회선이라 장애 시 복구가 느리고, VPN은 인터넷 기반이라 즉시 페일오버가 된다. 두 키워드("저지연" + "장애 무중단")가 충돌하는 듯 보이지만 실제로는 *조합*이 답인 패턴이 시험에 자주 나온다.

## SG vs NACL 핵심 한 줄

| | SG | NACL |
|---|---|---|
| 적용 | ENI | Subnet |
| 상태 | Stateful (응답 자동) | Stateless (응답 별도) |
| 룰 | Allow만 | Allow + Deny |
| Source | IP, SG, prefix list | IP만 |
| 평가 | 모든 룰 합집합 | 번호 순 첫 매칭 |

> 💡 **관련 이론**: 두 방화벽의 직렬 결합은 *Defense in Depth*(NIST SP 800-41 Rev.1, "Guidelines on Firewalls and Firewall Policy") 원칙의 직접 구현이다. 동일 패킷이 두 독립된 정책 엔진(서브넷 NACL → ENI SG)을 모두 통과해야 한다는 *AND* 조건이 단일 방어선 우회 시에도 두 번째 방어선이 작동하게 만든다. 같은 원칙이 *zero trust* 아키텍처(NIST SP 800-207)의 핵심이며, AWS는 이를 IAM(identity layer) + Network(network layer) + Encryption(data layer) 세 축으로 확장한다.

> 🔍 **더 깊이**: SG의 stateful은 *connection tracking*(conntrack)을 통해 구현된다. Linux netfilter의 conntrack 테이블과 같은 개념으로, outbound로 나간 connection의 5-tuple(src IP/port, dst IP/port, protocol)을 기억해 두었다가 그 응답 패킷을 자동 허용한다. 반면 NACL은 이 상태 테이블이 없어서 — 진짜로 *각 패킷을 독립적으로* 평가한다. 이게 NACL이 ephemeral port range를 따로 열어야 하는 근본 이유다. AWS Nitro 카드가 SG conntrack을 하드웨어 가속으로 처리하기 때문에 SG는 거의 무비용으로 stateful을 제공하지만, 한 ENI당 추적 가능한 connection 수에는 상한이 있고(대략 수십만), 이를 넘으면 새 connection이 거부되는 *conntrack 고갈* 장애가 드물게 발생한다.

> ⚠️ **함정**: "SG에서 outbound를 막으면 inbound 응답도 막히나?"는 흔한 오해다. SG는 stateful이라 *inbound로 들어온 connection의 응답 outbound*는 outbound 룰과 무관하게 자동 허용된다. 즉 SG outbound를 전부 닫아도 이미 들어온 요청에 대한 응답은 나간다. 반대로 *내가 먼저 시작한 outbound*(예: 패치 다운로드)는 outbound 룰이 필요하다. 이 방향성 구분이 시험에서 자주 함정으로 나온다.

## 자주 틀리는 함정 정리

1. **Public 서브넷 3조건**: IGW 경로 + Public IP + SG 허용. 한 가지라도 빠지면 안 된다. 진단 순서는 항상 "라우팅 → Public IP → SG → NACL → DNS" 다섯 단계. Reachability Analyzer가 이를 자동화한다.
2. **NACL은 ephemeral port range를 따로 열어야** outbound 응답이 들어온다. Linux는 32768-60999, Windows는 49152-65535, ELB·NLB는 1024-65535, 안전하게는 1024-65535 다 허용.
3. **NAT GW는 AZ scoped**. AZ별로 만들고 같은 AZ Private 서브넷이 같은 AZ NAT 사용. cross-AZ 비용도 함께 줄어든다.
4. **Peering은 non-transitive**. VPC가 늘면 TGW로 전환. 10개 이상 VPC면 무조건 TGW. A↔B, B↔C가 있어도 A↔C는 안 된다(B를 경유 못 함).
5. **CIDR 겹치면 Peering·TGW 불가**. 회사 차원 IP 거버넌스 필요. IPAM 도입 권장.
6. **Gateway Endpoint는 S3와 DynamoDB만**. 나머지는 Interface. Gateway Endpoint는 같은 리전 내에서만 동작하고 온프레미스/Peering 너머에서는 접근 불가(라우팅 테이블 기반이라).
7. **Default NACL은 모두 허용, Custom NACL은 모두 거부가 기본**. Fail-secure 설계.
8. **Endpoint Policy로 exfiltration 방어**. IAM 정책만으로는 부족. `aws:PrincipalOrgID` 조건이 가장 강력.
9. **Session Manager는 SSM/SSMmessages/EC2messages 3개 endpoint 필요**(완전 격리 환경). 빠뜨리면 작동 안 함.
10. **VPC `local` route는 항상 우선**. LPM보다도 위. 같은 VPC 내 격리는 SG/NACL로만.
11. **Cross-AZ 데이터 전송은 양방향 GB당 과금**. Multi-AZ HA의 숨은 비용이고 Week 10에서 자세히 다룬다.
12. **NAT GW의 connection idle timeout은 350초 고정**. 더 긴 connection은 keepalive 필요. RDS·DB connection pool과 함께 자주 문제가 된다.

> ⚠️ **함정**: 함정 4번(non-transitive)이 시험에서 가장 자주 나온다. "VPC A는 B와 Peering, B는 C와 Peering. A가 C와 통신하려면?"의 답은 "A↔C 직접 Peering 추가" 또는 "TGW로 전환"이지, "B의 라우팅 테이블에 경로 추가"가 아니다. Peering은 *transit* 라우팅을 구조적으로 막아 두었기 때문에 B를 라우터처럼 쓸 수 없다. 이건 버그가 아니라 의도된 보안 설계로, 한 VPC가 다른 두 VPC 사이의 중간자가 되는 걸 원천 차단한다. 같은 격리를 의도적으로 깨고 싶으면 B에 NAT/프록시 인스턴스를 두는 우회가 있지만 운영이 복잡해 TGW가 정답이다.

## SDN과 결정성: Week 2를 관통하는 한 가지 원리

이번 주 모든 컴포넌트가 공유하는 한 가지 사실: VPC는 **SDN(Software-Defined Networking)** 위에 올라가 있다. 물리 라우터·스위치가 패킷을 보는 게 아니라, 각 호스트의 Nitro 카드가 *Mapping Service*에 질의해 "이 가상 IP가 어느 물리 호스트에 있는지"를 받아 encapsulation(보통 사설 프로토콜로 캡슐화)해서 보낸다. 이 구조 덕분에 라우팅 테이블·SG·NACL 같은 "설정"이 즉시 전 호스트에 전파되고, 물리 토폴로지와 무관하게 논리 네트워크를 자유롭게 그릴 수 있다.

> 💡 **관련 이론**: AWS는 2017년 SIGCOMM 논문 *"A Retrospective on the Lessons Learned from the AWS Virtual Private Cloud"*에서 이 설계의 일부를 공개했다. 핵심은 control plane(라우팅 결정)과 data plane(패킷 전달)의 분리, 그리고 Mapping Service의 분산 캐싱이다. 같은 SDN 사조는 2008년 스탠퍼드의 OpenFlow 논문(McKeown et al.)에서 학문적으로 정립됐고, Google의 B4(2013, SIGCOMM)가 데이터센터 간 WAN에 SDN을 적용한 최초의 대규모 사례다. VPC·GCP VPC·Azure VNet 모두 이 SDN 패러다임의 상용 구현이다.

> 📚 **사례**: SDN 결정성의 양날을 보여준 대표 사고가 **2021년 10월 Meta(Facebook) 6시간 글로벌 장애**다. BGP 라우팅 설정 변경 작업 중 백본 전체가 자기 자신을 인터넷에서 *withdraw*했고, 그 결과 DNS 서버까지 도달 불가가 되어 사내 인증·도구·심지어 데이터센터 출입 카드까지 마비됐다. 중앙 집중식 결정성은 "한 줄을 바꾸면 즉시 전체에 반영된다"는 강점이 곧 "한 줄을 잘못 바꾸면 즉시 전체가 무너진다"는 약점이 된다. AWS VPC도 같은 구조적 위험을 안고 있어, 라우팅 변경은 항상 *change window* + Reachability Analyzer 사전 검증으로 보호한다.

## 진짜 사고 사례 한 번 더

- **2017년 2월 us-east-1 S3 장애**: 디버깅 명령어 오타로 의도보다 많은 서버가 종료되며 S3가 4시간 다운. 단일 리전 의존이 인터넷 절반을 흔든 사건. AWS Status Page 자체가 S3를 의존한 자기 참조 사고였다. *멀티 리전 + 리전 독립 설계*의 결정적 계기.
- **2019년 Capital One**: SSRF + IMDSv1 + 과도한 IAM 권한. WAF 우회로 메타데이터 endpoint(169.254.169.254)에서 임시 자격증명을 탈취, S3 1억 건 유출. IMDSv2(토큰 기반) + Endpoint Policy + Permission Boundary 조합이 사후 표준이 됨.
- **2020년 Single-AZ NAT 다운**: per-AZ NAT 패턴의 결정적 계기. ALB는 살아있었으나 백엔드가 Stripe·Twilio에 못 닿아 결제 30분 실패.
- **2021년 4월 Travis CI**: 장기 토큰이 빌드 로그에 노출 → GitHub OIDC 페더레이션(단기 토큰) 표준화의 계기.
- **2018년 인수합병 CIDR 충돌**: 두 VPC 모두 `10.0.0.0/16` → IPAM 도입의 계기. 6개월 마이그레이션.
- **2019년 도쿄(ap-northeast-1) AZ 냉방 장애**: 단일 AZ 과열로 EC2·EBS 다수 다운. Multi-AZ ASG가 곧 보험이라는 교훈.
- **2021년 10월 Meta 6시간 글로벌 장애**: BGP withdrawal로 자기 자신의 인증·DNS까지 다운. SDN 결정성의 양날성.
- **2022년 9월 Uber 침해**: 협력사 직원 MFA 피로 공격 → 내부 시스템·시크릿 매니저 접근. Zero Trust + 최소권한 도입 가속.
- **2021년 6월 Fastly CDN 장애**: 한 고객의 설정 변경이 잠재 버그를 트리거해 1시간 글로벌 다운. 설정의 결정성이 양날임을 다시 보여줌.

> 📚 **사례**: 2019년 **Capital One**은 시험과 가장 직결되는 사고다. 공격 경로가 정확히 Week 2의 컴포넌트들을 관통한다 — (1) WAF(SSRF 필터 부재)를 우회해 (2) EC2 메타데이터(IMDSv1)에서 (3) 과도한 IAM Role 자격증명을 얻고 (4) S3로 exfiltration. 사후 방어가 정확히 이번 주 함정 정리와 겹친다: IMDSv2 강제, S3 **Endpoint Policy + `aws:PrincipalOrgID`** 로 조직 외 버킷 접근 차단, Permission Boundary로 권한 상한. SAA 시나리오에서 "데이터 유출 방지"가 키워드면 IAM 정책만이 아니라 *네트워크 계층 차단(Endpoint Policy)* 까지 묶어야 정답이다.

## 비용 vs 가용성 trade-off 표

| 컴포넌트 | 비용 절감 패턴 | 가용성 강화 패턴 |
|---------|------------|------------|
| NAT GW | 단일 AZ 1개 | AZ별 1개씩, per-AZ 라우팅 |
| S3 접근 | Gateway Endpoint (무료) | 또는 Interface Endpoint (DR/리전 간) |
| 온프레미스 | VPN | DX + VPN backup |
| Bastion | EC2 1대 | Session Manager (인프라 자체 없음) |
| 로깅 | Flow Logs to S3 (저렴) | Flow Logs to CloudWatch (실시간 알람) |
| 다중 VPC | Peering(저비용 소규모) | TGW(확장·표준화) |

> ⚠️ **함정**: 시나리오에서 "비용 최적화"라는 단어가 보이면 무조건 단일 AZ NAT·Gateway Endpoint·VPN을 답으로 고르기 쉽지만, "고가용성·SLA 99.99%·미션 크리티컬" 같은 워드와 충돌하면 가용성이 우선이다. 시나리오를 끝까지 읽고 *우선순위*를 정확히 판단해야 한다. SAA-C03의 채점 철학은 W-AF(Well-Architected Framework)의 6개 기둥 — Operational Excellence, Security, Reliability, Performance, Cost, Sustainability — 중 *문제가 강조한 기둥*을 우선하는 것이다. "스타트업이 비용에 민감"이면 Cost, "금융 규제"면 Security·Reliability가 우선이라는 신호다.

## 진단 순서 단권화: 패킷 추적 5단계

실무 트러블슈팅과 시험 진단 모두 같은 순서를 따른다. "패킷이 어디서 멈췄나"를 위에서 아래로 추적한다.

```
1. 라우팅 테이블   — 목적지로 가는 경로가 있는가? (없으면 블랙홀)
2. Public IP / NAT  — outbound 주소 변환이 되는가?
3. NACL            — 서브넷 stateless 룰 (in/out + ephemeral)
4. SG              — ENI stateful 룰
5. OS 방화벽/앱     — iptables, 앱 listen 포트, DNS 해석
```

> 🔍 **더 깊이**: 이 5단계를 자동화한 게 **VPC Reachability Analyzer**(2020 출시)다. 출발 ENI와 목적지를 지정하면 *실제 패킷을 보내지 않고* 설정만 정적 분석해 "어느 컴포넌트에서 차단되는지"를 경로로 보여준다. 내부적으로 라우팅·SG·NACL·peering·endpoint를 그래프로 모델링하고 *형식 검증(formal verification)* 으로 도달성을 증명한다. 이 형식 검증 엔진은 AWS의 *Provable Security* 팀이 만든 Zelkova/Tiros 계열 도구에 기반하며, SMT solver(satisfiability modulo theories)로 "이 정책 조합에서 패킷이 통과 가능한가"를 수학적으로 판정한다. Network Access Analyzer는 여기서 더 나아가 "의도하지 않은 인터넷 노출 경로"를 조직 전체에서 탐지한다.

## 다음 주 예고

Week 3은 컴퓨팅(EC2, ASG, ELB)이다. 네트워크 위에 워크로드가 올라가는 과정이다. 이번 주 본 라우팅·게이트웨이·방화벽 위에 *실제로 코드를 실행하는 인스턴스*와 *그 인스턴스를 자동 확장·복구하는 메커니즘*이 얹어진다. ASG의 health check 실패가 어떻게 Multi-AZ 자동 복구로 이어지는지, ELB의 *cross-zone load balancing*이 어떻게 cross-AZ 비용 vs 가용성 trade-off를 만드는지, 그리고 *AWS Nitro Hypervisor*가 어떻게 거의 native에 가까운 가상화 성능을 내는지를 본다. 이번 주의 "패킷이 흐르는 길"이 다음 주에는 "그 길 위에서 워크로드가 살아남는 법"으로 이어진다.

---

## 📝 종합 연습 문제 (시나리오 12문항)

**문제 1.** 한 핀테크가 Private 서브넷의 ECS 태스크가 outbound API를 호출해야 한다. 전체 AZ 장애에도 outbound가 유지되도록 설계하려면?

A) 단일 NAT GW + 모든 Private 서브넷이 그것을 라우팅 — 비용은 가장 싸지만 NAT가 위치한 AZ가 죽으면 전 서브넷의 outbound가 동시에 끊겨, 전체 AZ 장애 내성이라는 요구를 정면으로 위반함

B) AZ별 NAT GW + 같은 AZ Private 서브넷이 같은 AZ NAT 라우팅

C) NAT Instance를 ASG로 — EC2 기반 NAT를 ASG로 자동 복구할 수는 있으나, 단일 인스턴스 교체에 수 분이 걸리고 처리량 한계·관리 부담이 커 관리형 NAT GW의 가용성에 못 미침

D) IGW를 Private 서브넷에 부착 — Private 인스턴스는 Public IP가 없어 IGW를 붙여도 응답을 받지 못하므로 outbound 자체가 성립하지 않음

**정답: B**
해설: NAT GW는 AZ scoped. AZ별로 두고 같은 AZ Private이 같은 AZ NAT를 쓰면 한 AZ가 죽어도 다른 AZ는 살아남는다. 비용은 약 2배지만 RTO는 0이 된다. 단일 AZ 절약은 사고 한 번이면 다 무너진다(2020년 Single-AZ NAT 사고가 정확히 이 케이스). D가 오답인 이유는 IGW를 붙여도 Private 인스턴스는 Public IP가 없어 응답을 못 받기 때문 — IGW는 Public IP가 있는 인스턴스에만 양방향이 성립한다.

---

**문제 2.** 운영자가 Production EC2에 SSH로 접근해야 한다. 가장 보안 우수한 방법은?

A) Public IP + SSH 키 — 인스턴스를 인터넷에 직접 노출하고 22 포트를 열어 두는 방식이라 스캐닝·무차별 대입 공격 표면이 최대가 되어 가장 위험함

B) Bastion + SSH 키 — 점프 호스트로 노출을 한 단계 줄이지만 여전히 22 포트와 SSH 키 관리가 남고, Bastion 자체가 단일 장애점이자 침해 표적이 됨

C) Session Manager

D) ClientVPN + SSH 키 — VPN으로 네트워크 경계를 좁혀도 결국 22 포트와 SSH 키 기반 접속이 그대로 남아, 포트 0개의 완전한 Zero Trust 접근에는 미치지 못함

**정답: C**
해설: 22 포트 자체를 닫고, IAM 정책으로 접근 제어, 모든 세션이 CloudWatch Logs/S3에 자동 저장. Zero Trust 모델(NIST SP 800-207). 인바운드 포트가 0개라 공격 표면이 구조적으로 사라진다. B(Bastion)도 흔한 답이지만 여전히 22 포트와 키 관리 부담이 남고, Bastion 자체가 단일 장애점·침해 표적이 된다. 완전 격리 환경이면 SSM/SSMmessages/EC2messages Interface Endpoint 3개를 추가로 둔다.

---

**문제 3.** S3에 매일 수 TB가 Private 서브넷에서 흘러가는데 NAT GW 비용이 폭증한다. 가장 적합한 조치는?

A) NAT GW 추가

B) S3 Gateway Endpoint 추가 (무료)

C) Direct Connect

D) IGW로 직접 라우팅

**정답: B**
해설: Gateway Endpoint는 무료이고 데이터가 AWS 내부망으로 흘러 NAT 데이터 전송비도 절감. S3·DynamoDB 한정. NAT 데이터 처리 요금은 약 $0.045/GB이므로 한 달 수십 TB면 수천 달러가 NAT를 통과하는 S3 트래픽에서만 발생한다. Gateway Endpoint 전환은 라우팅 테이블에 prefix list 한 줄을 추가하는 것만으로 끝나 비용 대비 효과가 압도적이다. C(DX)는 온프레미스 연결용이라 무관.

---

**문제 4.** 회사가 50개 AWS 계정의 VPC를 모두 연결하려 한다. 가장 적합한 솔루션은?

A) 풀 메시 Peering (1225개)

B) AWS RAM + Transit Gateway 공유

C) NAT Gateway 50개

D) Direct Connect 50개

**정답: B**
해설: TGW를 한 계정(보통 Networking 계정)에서 만들고 RAM으로 다른 계정에 공유. 모든 계정이 같은 TGW에 attach. 50개 VPC의 풀메시는 50×49/2 = 1225개 Peering이 되어 관리 불가능하고 non-transitive라 라우팅도 안 된다. TGW는 hub-and-spoke로 attachment 수만큼만(O(n)) 연결하면 된다. 더 큰 조직(다중 리전)은 Cloud WAN을 검토한다.

---

**문제 5.** Custom NACL을 만들었는데 inbound 80은 허용했는데 외부 응답이 안 온다. 원인은?

A) SG가 거부

B) NACL stateless라 outbound ephemeral port range 미허용

C) IGW가 없음

D) Public IP 미부여

**정답: B**
해설: NACL stateless. 요청은 80으로 들어왔지만 응답은 클라이언트의 ephemeral port(1024-65535)를 목적지로 *outbound*로 나가야 한다. NACL은 connection 상태를 기억하지 못하므로 이 outbound 룰을 명시해야 한다. SG였으면 conntrack이 응답을 자동 허용. NACL의 운영 부담이 큰 가장 결정적 이유이고, 그래서 실무는 NACL을 광역 Deny(차단 IP 대역)에만 쓰고 세밀한 제어는 SG에 맡긴다.

---

**문제 6.** 두 회사 합병 후 두 VPC 모두 10.0.0.0/16이다. 가장 현실적 접근은?

A) 그냥 Peering

B) 한 쪽 VPC를 새 CIDR로 마이그레이션

C) TGW만 추가

D) NAT GW로 IP 충돌 해결

**정답: B**
해설: 겹치는 CIDR는 Peering·TGW 모두 라우팅 불가 — 패킷의 목적지 IP가 양쪽에 동시에 존재해 라우터가 어디로 보낼지 결정할 수 없다. 한 쪽 마이그레이션 외 근본 해결책이 없다. 사후 IPAM으로 회사 차원 IP 거버넌스 도입. 임시 우회로 PrivateLink로 일부 서비스만 단방향 노출하는 패턴도 있지만 본질적 해결은 마이그레이션. 2018년 실제 인수합병 사고에서 6개월이 걸렸다.

---

**문제 7.** 한 EC2에 SG 5개를 붙였다. SG A는 22 허용, SG B는 22 거부 룰이 있다(불가하지만 가정). 어떻게 평가될까?

A) 거부 우선

B) 처음 매칭

C) SG는 Deny 룰 자체가 불가능, 모두 Allow 룰 합집합

D) Alphabetical 순서

**정답: C**
해설: SG는 Allow only. Deny 룰이 문법적으로 안 만들어진다. ENI에 붙은 모든 SG의 룰 합집합(union)으로 평가된다. 명시 거부는 NACL(Deny 룰)이 담당. 이 *Allow 누적* 모델이 *명시 Deny 우선* 모델(IAM, NACL)과 결정적으로 다른 점이다. 그래서 "특정 IP만 차단"은 SG로 불가능하고 NACL Deny나 WAF로 해야 한다.

---

**문제 8.** 외부 SaaS Snowflake에 인터넷 안 거치고 비공개 접근하려면?

A) VPC Peering

B) Snowflake가 publish한 PrivateLink Interface Endpoint 사용

C) Direct Connect

D) NAT GW

**정답: B**
해설: SaaS와의 PrivateLink는 외부 ISV가 endpoint service(NLB 기반)를 publish하고, 소비자 VPC에 Interface Endpoint(ENI + 사설 IP)가 생성된다. 트래픽이 인터넷·IGW를 전혀 거치지 않고 AWS 백본만 탄다. Snowflake, Databricks, MongoDB Atlas, Datadog 등 주요 SaaS가 지원. A(Peering)는 상대 VPC CIDR를 알아야 하고 SaaS가 멀티테넌트라 부적합. 이 패턴이 "AWS 안에서 인터넷 안 거치고 SaaS와 통신"의 산업 표준.

---

**문제 9.** Flow Logs로 SQL injection 페이로드까지 보고 싶다. 가장 적합한 솔루션은?

A) Flow Logs version 5로 업그레이드

B) VPC Traffic Mirroring + IDS

C) CloudTrail

D) GuardDuty

**정답: B**
해설: Flow Logs는 5-tuple 헤더 메타데이터(src/dst/port/protocol/action/bytes)만 기록하고 *페이로드는 절대 담지 않는다*. SQL injection 같은 L7 페이로드를 보려면 Traffic Mirroring으로 ENI 트래픽 전체를 복제해 Suricata·Zeek 같은 IDS로 deep packet inspection. 이게 *VPC IDS* 표준 패턴. 더 매니지드한 옵션은 AWS Network Firewall(Suricata 룰 내장). C(CloudTrail)는 API 호출 감사라 무관, D(GuardDuty)는 위협 탐지지만 페이로드 캡처는 아니다.

---

**문제 10.** 같은 리전 두 AZ 사이의 데이터 전송에는 비용이 부과될까?

A) 무료

B) GB당 양방향 과금

C) 한 방향만 과금

D) Peering 사용 시만 과금

**정답: B**
해설: cross-AZ 데이터 전송은 양방향 모두 GB당 과금($0.01/GB 각 방향). 비용 최적화의 핵심 함정이고 Multi-AZ HA의 숨은 비용이다. EFS·RDS Multi-AZ 동기 복제·ALB cross-zone load balancing·Kafka 브로커 간 복제 모두 영향을 받는다. *Single-AZ로 모든 워크로드를 묶으면 cross-AZ 비용은 0이지만 가용성도 0*이라는 trade-off가 본질. Week 10 비용 최적화에서 자세히 다룬다.

---

**문제 11.** 완전 격리된 Private 서브넷(인터넷 없음)에서 EC2가 Systems Manager에 접근하려면?

A) IGW 추가

B) NAT Gateway 추가

C) ssm, ssmmessages, ec2messages 3개 Interface Endpoint 생성

D) Bastion 추가

**정답: C**
해설: Session Manager의 핵심 의존성. SSM Agent가 세 endpoint에 outbound HTTPS(443)로 닿아야 한다 — `ssm`(API), `ssmmessages`(세션 데이터 채널), `ec2messages`(명령 폴링). 인터넷 없는 환경에서는 PrivateLink Interface Endpoint 3개로 이 endpoint들을 VPC 내부 사설 IP에 노출한다. 하나라도 빠지면 세션이 안 붙는다. 정부·금융·PCI 시나리오에서 자주 등장하는 표준 패턴. B(NAT)를 쓰면 동작은 하지만 "인터넷 경유 금지" 제약을 위반한다.

---

**문제 12.** 한 다국적 회사가 30개 리전, 100개 AWS 계정에 걸친 글로벌 네트워크를 *policy as code*로 일관 관리해야 한다. 가장 적합한 솔루션은?

A) 풀 메시 VPC Peering

B) 리전마다 TGW + 수동 TGW Peering

C) AWS Cloud WAN

D) Direct Connect 100개

**정답: C**
해설: Cloud WAN(2021 GA)이 TGW의 글로벌 backbone 확장이다. JSON 정책 문서로 segment(prod/dev 격리), attachment, route propagation, 리전 간 연결을 *중앙에서 코드로* 일괄 관리한다. 수십 리전·수백 계정 규모에서는 B(리전별 TGW + 수동 TGW Peering)가 연결·라우트 전파를 일일이 손으로 묶어야 해 운영이 폭증한다. Cloud WAN은 이를 단일 *core network* 정책으로 추상화한다. 시험 출제 빈도는 아직 낮지만 2024년 이후 증가 추세.
