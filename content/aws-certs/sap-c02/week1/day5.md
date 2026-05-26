# Day 5 - 1주차 통합: IAM·VPC·EC2가 한 시나리오에서 만날 때

Pro 시험에서 단일 서비스만 묻는 문제는 사실상 없다. 어떤 시나리오를 펼치든 IAM(누가 접근하는가), VPC(어디서 흐르는가), EC2/EBS/ELB(무엇이 그 트래픽을 처리하는가)가 동시에 등장한다. 그래서 한 주 동안 분리해서 본 세 영역을 오늘은 **하나의 시나리오에서 만나는 방식**으로 다시 본다. 이게 시험장 현장에서 작동하는 진짜 사고법이다.

오늘 글의 구조는 셋이다.

1. **1주차 한 줄 요약 40개**: 시험장에서 0.5초 안에 떠올라야 할 사실들.
2. **3-layer 사고법**: IAM ⇒ VPC ⇒ Compute로 시나리오를 분해하는 손기술.
3. **시나리오 12문항**: Pro 난이도, 풀이 시간 30분.

이 세 가지를 한 묶음으로 연습하면 시험장에서 시나리오를 만났을 때 손이 먼저 움직인다. Day 1에서 본 "5단계 분해"가 머릿속에서 5초 안에 작동하고, 그 5단계가 다시 IAM-VPC-Compute의 3-layer로 흐른다.

## 1주차 한 줄 요약 40개

### 시험 전략 (1-5)

1. SAP-C02 = 75문항 / 180분 / 750점 합격, ESL +30분 신청 가능 (총 210분).
2. 시나리오 5단계 분해: WHO · WHAT · WHY · CONSTRAINTS · KEYWORD. 마지막 문장의 형용사가 정답을 결정.
3. 보기 4개 소거 4패턴: 과잉설계 / 과소설계 / 자체구현 / 잘못된 조합.
4. 3-2-2 규칙: 한 문제 3분 이내, 답 변경 2번 이내, 2분 내 안 풀리면 flag.
5. first-instinct fallacy — 통계적으로 바꾼 답이 더 자주 틀린다. 확실한 근거 없으면 첫 직관 유지.

### IAM·STS·Federation (6-15)

6. **권한 평가 6층**: SCP → Permission Boundary → Identity Policy → Resource Policy → Session Policy → VPC Endpoint Policy. 6층 중 하나라도 Deny면 차단, 모두 Allow여야 통과.
7. **Explicit deny가 모든 allow를 이긴다** — 단 하나의 명시적 Deny가 끝.
8. Cross-account 접근은 양쪽 모두 Allow 필요 (Trust Policy + Resource Policy 또는 Identity Policy).
9. SCP·Permission Boundary는 **deny-only** 의미 — 권한 부여 안 함, 천장(ceiling)만 정함.
10. STS 5종: AssumeRole / AssumeRoleWithSAML / AssumeRoleWithWebIdentity / GetFederationToken / GetSessionToken.
11. **ExternalId**는 confused deputy 공격 방지 — SaaS 3rd party 접근 시 필수, Trust Policy에 명시.
12. GitHub Actions → AWS는 OIDC + AssumeRoleWithWebIdentity (long-lived key 불필요), Trust Policy의 sub claim으로 repo·branch 제한.
13. Multi-account SSO는 IAM Identity Center + Permission Set, SCIM(RFC 7644)으로 자동 동기화.
14. ABAC는 태그 기반 — `aws:PrincipalTag/Project` ↔ `aws:ResourceTag/Project` 매칭으로 정책 폭증 방지.
15. **IAM Access Analyzer**는 Microsoft Research의 Zelkova(SMT 기반 형식 검증)로 외부 접근 자동 탐지.

### VPC·Network (16-26)

16. RFC 1918 사설 IP: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16. /16~/28 범위, IPAM으로 전사 IP 충돌 방지.
17. 서브넷당 5개 IP 예약: `.0`(network) / `.1`(라우터) / `.2`(DNS) / `.3`(예약) / `.255`(브로드캐스트).
18. **NAT Gateway는 AZ-local** → 가용성 위해 AZ별 1개. 단일 NAT는 그 AZ 죽으면 outbound 전체 차단.
19. SG는 **stateful** (return 자동 허용), NACL은 **stateless** (양방향 명시).
20. NACL ephemeral port: Linux 32768-60999, Windows 49152-65535, 안전한 범위는 1024-65535.
21. S3·DynamoDB는 **Gateway Endpoint** (무료, Route Table에 prefix list), 나머지는 **Interface Endpoint** (시간당 $0.01 + 데이터).
22. **PrivateLink**: SaaS가 자기 NLB 뒤 서비스를 Endpoint Service로 노출, 양방향 라우팅 없음.
23. SG ID 참조는 같은 VPC·Peered VPC에서만 작동, Transit Gateway는 IP CIDR 참조만.
24. VPC Flow Logs는 ENI 5-tuple + 결과 기록, payload 없음. Traffic Mirroring은 payload 캡처.
25. Transit Gateway는 BGP 기반 hub-and-spoke, 5000 VPC까지, route table별 segmentation.
26. Direct Connect는 dedicated(전용 회선) vs hosted(파트너 공유), VIF 3종(Private/Public/Transit).

### EC2·EBS·ELB·ASG (27-40)

27. **Nitro System**: ASIC 기반 카드 가상화, 1% 미만 오버헤드. Network·EBS·Security·Hypervisor가 별도 카드.
28. **Graviton**(g suffix) ARM Neoverse 기반, x86 동급 대비 20-40% 가격 성능 우위. Multi-arch 컨테이너 필수.
29. **Inferentia/Trainium** ASIC은 LLM 추론·트레이닝에서 GPU 대비 60-70% 비용 절감.
30. gp3는 IOPS와 크기를 **독립 프로비저닝** (gp2 대비 20% 저렴), 단 burst 없음.
31. io2 **Block Express**는 NVMe-oF 기반 sub-ms latency, 256K IOPS, r5b/x2idn 전용.
32. EBS는 **AZ-local** + 3 replica 동기, 다른 AZ는 스냅샷 경유.
33. EBS Multi-Attach: io1/io2 + clustered filesystem(GFS2/OCFS2/OracleRAC) + 16 instance.
34. NLB만 정적 IP + 클라이언트 IP 보존 + 초당 수백만 패킷 (Flow hash 기반 ECMP).
35. ALB는 Cognito 직접 통합 (X-Amzn-Oidc-Data 헤더), gRPC 1급 지원.
36. **Warm Pool**은 stopped 인스턴스 미리 부팅, 콜드 스타트 5분→30초.
37. Mixed Instances Policy + `price-capacity-optimized`가 Spot의 표준.
38. Spot은 평균 70% 할인, 2분 경고 후 회수, 다양한 패밀리로 분산.
39. Placement Group: Cluster(저지연 HPC) / Spread(격리 7/AZ) / Partition(HDFS·Cassandra rack-aware).
40. Lifecycle Hook의 default heartbeat 1시간, max 48시간, complete-lifecycle-action 호출 필수.

## 3-layer 사고법: IAM ⇒ VPC ⇒ Compute

Pro 시나리오를 풀 때 **3개 레이어 순서대로** 점검하면 빠진 요소가 보인다.

```
┌──────────────────────────────────────────────────┐
│ Layer 1: IAM   "누가 접근하나?"                  │
│   - SCP / Permission Boundary / IAM / Resource   │
│   - Federation (SAML/OIDC), STS, ABAC            │
│   - Cross-Account Role + ExternalId              │
├──────────────────────────────────────────────────┤
│ Layer 2: VPC   "어디로 흐르나?"                  │
│   - VPC CIDR, Subnet, Route Table                │
│   - SG (stateful) + NACL (stateless)             │
│   - VPC Endpoint (Gateway/Interface), PrivateLink│
│   - Transit Gateway, Direct Connect, VPN         │
├──────────────────────────────────────────────────┤
│ Layer 3: Compute  "무엇이 처리하나?"             │
│   - EC2 family / pricing / Nitro / Graviton      │
│   - EBS type (gp3/io2BE/st1), Snapshot, FSR      │
│   - ELB 4종 (ALB/NLB/GLB/CLB)                    │
│   - ASG (Target/Step/Predictive/Warm Pool)       │
└──────────────────────────────────────────────────┘
```

> 💡 **관련 이론**: 이 3-layer는 **Saltzer-Schroeder의 보안 원칙 8개**(1975) 중 "Complete Mediation"과 "Defense in Depth"를 그대로 구현한 형태다. 모든 요청은 (1) IAM에서 권한 검사, (2) VPC에서 네트워크 격리, (3) Compute에서 워크로드 실행이라는 세 게이트를 거친다. 한 게이트가 뚫려도 다른 게이트가 막아준다. Capital One 사고는 SSRF로 IAM 게이트를 뚫었지만, 만약 VPC Endpoint Policy까지 적용했다면 S3 접근이 차단됐을 것이다.

> 🔍 **더 깊이**: 세 레이어 사이에는 **경계 변환(boundary translation)**이 있다. IAM의 Principal ARN이 VPC의 Source IP로 바뀌고(NAT 경유 시 외부에 같은 IP로 보임), Compute에서는 인스턴스 메타데이터의 IAM Role로 다시 변환된다. 이 변환 과정에서 정보가 흐려지므로, 멀티 계정 환경에서 CloudTrail로 추적할 때 user-agent + source IP + role session name을 모두 봐야 한다. 단일 변수로는 누가 한 짓인지 모를 수 있다.

## 시나리오 분해 실전 예시

> **시나리오**: "한 글로벌 제약사가 AWS Organizations에 80개 계정을 운영한다. 연구 부서가 임상시험 데이터를 다루기 위해 EC2 + RDS PostgreSQL을 사용한다. FDA 21 CFR Part 11 규제에 따라 모든 데이터 액세스가 감사 추적되어야 하고, 데이터는 ap-northeast-2에만 머물러야 한다. 또한 외부 SaaS(Veeva, Medidata)가 일부 데이터를 읽어야 하며, 액세스 키 사용을 금지한다. 가장 적절한 아키텍처는?"

5단계 분해 + 3-layer 매핑:

1. **WHO**: 글로벌 제약사, 80개 계정, 연구 부서 + 외부 SaaS(Veeva/Medidata).
2. **WHAT**: EC2 + RDS PostgreSQL, 임상시험 데이터.
3. **WHY**: FDA 21 CFR Part 11, 데이터 주권(ap-northeast-2).
4. **CONSTRAINTS**: 모든 액세스 감사, 액세스 키 사용 금지.
5. **KEYWORD**: 규제 + 멀티 계정 + SaaS 접근 + 키 회피.

→ 3-layer 답안:

- **IAM 레이어**: SCP로 ap-northeast-2 외 리전 deny. 외부 SaaS는 Cross-Account Role + ExternalId (액세스 키 회피). Org Trail로 80계정 CloudTrail 일원화. KMS custom CMK + Key Policy로 데이터 암호화.
- **VPC 레이어**: VPC Endpoint(S3·RDS·KMS) + Endpoint Policy로 외부 흐름 차단. 외부 SaaS는 PrivateLink로 NLB 뒤 노출. NACL/SG로 outbound 인터넷 차단(인터넷 미경유).
- **Compute 레이어**: EC2는 IMDSv2 강제, EBS는 KMS encrypted, RDS는 Multi-AZ + 자동 백업 + 35일 보존. RDS audit log를 CloudWatch Logs로 export.

이 한 시나리오에 1주차 학습 내용이 거의 다 들어있다. 시험장에서 손이 자동으로 3-layer를 그리고, 각 레이어에 키워드를 채워넣는 흐름이 표준 풀이법.

## 시나리오 12문항 (Pro 난이도)

---

**문제 1.** 한 회사가 100개 계정을 운영 중이다. 보안팀이 "production OU에서는 root user의 로그인 자체를 차단하고, MFA 없이 IAM 호출도 차단"하려 한다. 가장 적합한 방법은?

A) 각 계정에서 root user 비밀번호 삭제
B) Organizations SCP로 production OU에 deny 정책 적용 (Condition: `aws:PrincipalType=Root`, `aws:MultiFactorAuthPresent=false`)
C) Lambda로 모니터링 후 알람
D) IAM Identity Center로 모든 사용자 통합

**정답: B**
해설: SCP는 root user에도 적용되는 유일한 가드레일. Condition으로 root 차단 + MFA 강제. A는 root 비밀번호는 삭제 불가(이메일로 복구 가능). C는 사후 탐지일 뿐 차단 아님. D는 SSO 도구일 뿐 root 차단 무관. Trade-off: Management 계정에는 SCP 적용 안 되므로 Management의 root는 별도 MFA·하드웨어 토큰·이메일 보호.

---

**문제 2.** 한 글로벌 SaaS가 us-east-1에서 운영되며, eu-west-1로 확장한다. EU 사용자 데이터는 GDPR에 따라 EU에 머물러야 한다. 단일 코드베이스를 유지하면서 데이터 격리를 보장하려면?

A) DynamoDB Global Table (양 리전 자동 복제)
B) RDS Cross-Region Replica
C) 리전별 독립 DB + Route 53 Geolocation + 인증 시점 리전 결정
D) Aurora Global Database

**정답: C**
해설: A·B·D는 모두 양 리전 간 데이터 복제 → GDPR 위반 가능성. C는 리전별 완전 격리, 인증 시점에 사용자가 어느 리전에 속하는지 결정해 JWT에 region claim 포함. 단일 코드베이스는 환경 변수·설정으로 처리. 2020년 EU Schrems II 판결로 미국 클라우드 사용에 제약이 생겼고, 이런 시나리오에서 "데이터 절대 안 나간다"는 보장이 가장 중요.

---

**문제 3.** 한 핀테크가 PCI-DSS 인증을 위해 모든 EC2가 us-east-1 외 리전을 사용하지 못하도록 강제하려 한다. 운영 부담을 최소화하려면?

A) AWS Config Custom Rule을 모든 계정에 배포
B) Organizations SCP에 `aws:RequestedRegion ≠ us-east-1`이면 모든 액션 deny + 글로벌 서비스(IAM, Org, Route53) NotAction 예외
C) Lambda 모니터링으로 비인가 리전 리소스 삭제
D) 각 계정 IAM 정책 일일이 수정

**정답: B**
해설: SCP는 Organizations 한 번 적용으로 모든 계정·root까지 강제. 새 계정 추가 시 자동 적용. 글로벌 서비스는 us-east-1로 라우팅되지만 SCP에서 `RequestedRegion`이 글로벌인 경우가 있어 NotAction 예외 필수. C는 사후 처리라 잠시 노출 위험. A는 탐지일 뿐 차단 아님.

---

**문제 4.** 한 회사가 EC2에서 S3에 접근한다. 트래픽이 NAT Gateway를 거쳐 월 $30,000 비용. PCI-DSS 감사에서도 "S3 트래픽이 인터넷을 거친다"고 지적. 어떻게 해결하는가?

A) Interface Endpoint 추가
B) Gateway Endpoint 추가 + Route Table prefix list 자동 등록
C) VPC Peering으로 S3 연결
D) Direct Connect

**정답: B**
해설: S3·DynamoDB는 Gateway Endpoint 무료 + Route Table에 prefix list 자동 등록. 트래픽이 IGW/NAT 없이 사설 경로. 비용 + 보안 동시 해결. Interface Endpoint(A)도 동작은 하지만 시간당 비용 + 데이터 처리 비용 발생, S3에는 Gateway가 표준. Trade-off: Gateway Endpoint는 cross-region S3 접근 불가, 같은 리전만.

---

**문제 5.** 한 미디어 회사가 글로벌 게임 매치메이킹(WebSocket)을 운영한다. 정적 IP를 외부에 노출, 리전 장애 시 수 초 내 페일오버, 초당 100만 패킷 처리. 적합한 조합은?

A) ALB + Route 53 Failover
B) NLB + Route 53 Health Check
C) Global Accelerator + NLB (Multi-Region)
D) CloudFront + Lambda@Edge

**정답: C**
해설: GA는 BGP Anycast 정적 IP 2개 제공, 리전 장애 시 DNS 캐시 우회 수 초 내 페일오버. NLB는 L4·초당 수백만 패킷·정적 IP·WebSocket 모두 만족. A·B는 DNS TTL 캐시로 페일오버 분 단위. D는 L7 HTTP만.

---

**문제 6.** 한 회사가 GitHub Actions에서 AWS Lambda에 배포한다. 보안팀이 "long-lived AWS Access Key를 GitHub Secrets에 저장 금지"라고 요구한다. 어떻게 해결하는가?

A) IAM User + 90일 키 회전 자동화
B) AWS OIDC Provider 등록 + GitHub Actions에서 AssumeRoleWithWebIdentity, Trust Policy의 sub claim으로 repo·branch 제한
C) S3 ZIP 업로드 후 Lambda 트리거
D) CodePipeline으로 배포

**정답: B**
해설: GitHub은 2021년부터 OIDC 지원. AWS OIDC Provider 한 번 등록 후 GitHub Actions가 매번 OIDC id_token으로 임시 자격증명 발급. Long-lived key 불필요. Trust Policy의 Condition으로 `sub`(예: `repo:org/repo:ref:refs/heads/main`)을 제한해 다른 repo·branch가 같은 Role assume 못 하게 막는 게 필수. 그렇지 않으면 confused deputy 변종 공격 가능.

---

**문제 7.** 한 회사가 야간 ETL 배치(stateless, 재시작 가능)에 EC2 100대를 4시간 운영한다. 비용 최소화 + SLA(다음날 09시 완료) 만족.

A) 100대 On-Demand
B) 100대 3-year RI
C) Spot Fleet with diverse instance families (capacity-optimized) + price-capacity-optimized
D) 50대 RI + 50대 Spot

**정답: C**
해설: 4시간만 사용 → RI 손해. Stateless + 재시작 가능 → Spot 적합. 다양한 패밀리(c5, c5n, c5a, m5) 섞으면 단일 패밀리 capacity 부족 위험 분산. `price-capacity-optimized`(2022 추가, 권장)는 가격과 capacity를 동시 최적화.

---

**문제 8.** 한 회사가 ALB 뒤에 인증을 적용한다. 백엔드(Node.js)는 인증 코드를 거의 안 쓰고 사용자 정보만 받고 싶다. 가장 적합한 방법은?

A) 백엔드에 Passport.js + JWT 검증 구현
B) ALB의 Cognito 통합 활성화 + X-Amzn-Oidc-Data 헤더 수신
C) API Gateway + Lambda Authorizer
D) CloudFront + Lambda@Edge

**정답: B**
해설: ALB가 직접 OIDC/Cognito 인증 처리, JWT를 X-Amzn-Oidc-Data 헤더로 백엔드 전달. 백엔드 코드 거의 수정 불필요. HTTP 기반이면 최적. gRPC·WebSocket은 별도 처리.

---

**문제 9.** 한 회사가 RDS MySQL을 us-east-1에서 운영하며, ap-northeast-2에 DR을 구축하려 한다. RPO 1분 이내, RTO 5분 이내. 가장 적합한 솔루션은?

A) RDS Multi-AZ
B) RDS Cross-Region Read Replica + 수동 promote
C) Aurora Global Database (RPO < 1초, RTO ~1분)
D) DMS continuous replication

**정답: C**
해설: Aurora Global Database는 RPO < 1초, RTO ~1분 (managed failover). 리전 간 storage-level async replication을 사용하지만 latency가 매우 낮다. RDS Cross-Region Read Replica(B)는 RPO 수 초~수십 초, RTO 수 분~수십 분(수동 promote 필요). A는 같은 리전이라 DR 아님. D는 마이그레이션 도구. Trade-off: Aurora Global은 비용이 RDS보다 30% 이상 비쌈, 단일 리전 워크로드에는 과한 선택.

---

**문제 10.** 한 SaaS가 자기 서비스를 고객 VPC 안에서 사설 IP로 사용 가능하게 하려고 한다. 표준 패턴은?

A) Cross-Region VPC Peering
B) Transit Gateway 공유
C) PrivateLink + NLB + VPC Endpoint Service
D) Direct Connect Public VIF

**정답: C**
해설: PrivateLink는 SaaS가 NLB 뒤 서비스를 Endpoint Service로 등록, 고객은 Interface Endpoint로 접근. 데이터 양방향 노출 없음. Snowflake, MongoDB Atlas, Datadog 등 모두 채택. A·B는 양방향 라우팅이라 SaaS 보안 모델 부적합 — 고객 VPC가 SaaS VPC를 보지 못해야 한다.

---

**문제 11.** 한 회사가 200명 직원의 AD를 가지고 있다. AWS Organizations 80개 계정에 SSO로 접근. 직원 퇴사 시 자동으로 모든 계정에서 권한 회수. 가장 적합한 솔루션은?

A) 각 계정 IAM User + 수동 관리
B) IAM Identity Center + AD Connector + SCIM 자동 동기화
C) 각 계정 SAML IdP
D) Cognito User Pool

**정답: B**
해설: IAM Identity Center가 Organizations와 통합. AD Connector로 기존 AD를 ID 소스로 사용. SCIM(RFC 7644)으로 AD 변경 시 AWS 자동 동기화. 직원 퇴사 즉시 모든 계정에서 권한 회수. Permission Set으로 일괄 정책 배포.

---

**문제 12.** Multi-AZ에 Private Subnet 3개를 두고 외부 API를 호출한다. 가용성을 확보하면서 비용을 최소화하려면 NAT Gateway를 어떻게 배치하는가?

A) 단일 NAT Gateway (가장 저렴)
B) 각 AZ에 NAT Gateway 1개씩 (총 3개), 각 Private Subnet은 자기 AZ NAT 사용
C) NAT Instance 직접 운영
D) IGW로 직접 연결

**정답: B**
해설: NAT Gateway는 AZ-local. 단일 NAT는 그 AZ 장애 시 모든 outbound 끊김. AZ별 NAT 배치 + 각 Private Subnet은 자기 AZ NAT 사용. 비용 추가는 시간당 $0.045 × 3 = 월 $97. Trade-off: dev 환경은 단일 NAT 허용. NAT Gateway 데이터 처리 비용($0.045/GB)이 가장 큰 비용원이므로 S3·DynamoDB는 Gateway Endpoint로 우회.

## 정리하며

1주차는 시험의 문법과 SAA의 핵심 4개 영역(IAM·VPC·EC2·ELB)을 Pro 깊이로 복습했다. 한 줄 요약 40개와 3-layer 사고법이 시험장에서 작동하면, 처음 보는 시나리오라도 손이 자동으로 분해를 시작한다.

2주차부터는 SAP에서만 본격적으로 다뤄지는 **멀티 계정 아키텍처**(Organizations·SCP·Control Tower·Identity Center)로 들어간다. 도메인 1의 26% 비중을 차지하는 영역이므로 가장 큰 ROI다. 오늘 본 시나리오 12문항을 다시 한 번 풀고, 틀린 문제는 분해법을 적용해 어디서 틀렸는지 확인하자. 시험장에서 손이 먼저 5칸을 그리는 순간이 곧 합격의 신호다.
