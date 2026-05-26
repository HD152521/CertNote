# Day 5 - Week 1 통합: IAM·VPC·EC2가 한 시나리오에서 만날 때

한 주 동안 시험 전략, IAM 6층 평가, VPC 8단계 결정점, EC2/EBS/ELB/ASG의 19개 trade-off를 봤다. 이제 이 모든 것이 **한 시나리오에서 동시에 작동하는** Pro 문제를 본격적으로 풀어본다. Pro 시험에서 단일 서비스 문제는 거의 없다. 5~10개 서비스가 얽힌 시나리오에서 우선순위 키워드 하나를 잡아내는 게 시험의 본질이다.

오늘은 다음 세 가지를 한다.

1. **1주차 한 줄 요약**: 머리에 박아둬야 할 사실 30개를 정리.
2. **시나리오 분해 실전**: 5단계 분해법을 실제 Pro 길이 시나리오에 적용.
3. **시나리오 10문항**: 시험 난이도의 통합 문제. 풀이 시간 25분 목표.

## 1주차 한 줄 요약: 시험장에서 반사신경으로 떠올라야 할 30가지

### 시험 전략

1. SAP-C02 = 75문항 / 180분 / 750점 합격
2. 시나리오 5단계 분해(WHO·WHAT·WHY·CONSTRAINTS·KEYWORD)
3. 보기 4개 소거 패턴: 과잉설계 / 과소설계 / 자체구현 / 잘못된 조합
4. 3-2-2 규칙: 한 문제 3분 이내, 답 의심 2번 이내, 2분 안에 안 풀리면 flag
5. ESL +30 신청하면 210분

### IAM·STS·Federation

6. 권한 평가 6층: SCP → Permission Boundary → Identity → Resource → Session → VPC Endpoint
7. Explicit deny가 모든 allow를 이긴다
8. Cross-account는 양쪽 모두 allow 필요
9. SCP·Permission Boundary는 deny-only(권한 부여 아님)
10. STS 5종: AssumeRole / WithSAML / WithWebIdentity / GetFederationToken / GetSessionToken
11. ExternalId는 confused deputy 공격 방지 (SaaS 3rd party 접근 시 필수)
12. GitHub Actions → AWS는 OIDC + AssumeRoleWithWebIdentity (long-lived key 불필요)
13. Multi-account SSO는 IAM Identity Center + Permission Set
14. ABAC는 태그 기반, 100+ 프로젝트에서 정책 폭증 방지
15. IAM Access Analyzer는 Zelkova 정형 검증으로 외부 접근 자동 탐지

### VPC·Network

16. RFC 1918 사설 IP, /16~/28, 처음 그을 때 IPAM으로 전사 관리
17. 서브넷당 5개 IP 예약 (네트워크 / 라우터 / DNS / 예약 / 브로드캐스트)
18. NAT Gateway는 AZ-local → 가용성 위해 AZ별 1개
19. SG는 stateful (return 자동), NACL은 stateless (양방향 명시)
20. NACL ephemeral port: 1024-65535 (Linux 32768-60999, Windows 49152-65535)
21. S3·DynamoDB는 Gateway Endpoint (무료), 나머지는 Interface Endpoint (시간당 비용)
22. PrivateLink: SaaS가 자기 NLB 뒤 서비스를 Endpoint Service로 노출
23. SG ID 참조는 같은 VPC·Peered VPC에서만 작동
24. VPC Flow Logs는 ENI 5-tuple + 결과 기록, payload 없음

### EC2·EBS·ELB·ASG

25. Nitro System: ASIC 기반 가상화, 1% 미만 오버헤드
26. Graviton(g suffix)은 x86 동급 대비 20-40% 가격 성능 우위
27. gp3는 IOPS와 크기를 독립 프로비저닝 (gp2 대비 20% 저렴)
28. NLB만 정적 IP, 클라이언트 IP 보존, 초당 수백만 패킷
29. ALB는 Cognito 직접 통합 (백엔드 코드 수정 불필요)
30. Warm Pool은 stopped 인스턴스 미리 부팅하여 콜드 스타트 단축

## 시나리오 분해 실전 예시

> **시나리오**: "한 글로벌 제약사가 AWS Organizations에 80개 계정을 운영한다. 연구 부서가 임상시험 데이터를 다루기 위해 EC2 + RDS PostgreSQL을 사용한다. FDA 21 CFR Part 11 규제에 따라 모든 데이터 액세스가 감사 추적되어야 하고, 데이터는 ap-northeast-2에만 머물러야 한다. 또한 외부 SaaS(Veeva, Medidata)가 일부 데이터를 읽어야 하며, 액세스 키 사용을 금지한다. 가장 적절한 아키텍처는?"

5단계 분해:

1. **WHO**: 글로벌 제약사, 80개 계정, 연구 부서 + 외부 SaaS(Veeva/Medidata)
2. **WHAT**: EC2 + RDS PostgreSQL, 임상시험 데이터
3. **WHY**: FDA 21 CFR Part 11 규제 준수, 데이터 주권(ap-northeast-2)
4. **CONSTRAINTS**: 모든 액세스 감사, 액세스 키 사용 금지
5. **KEYWORD**: 규제 + 멀티 계정 + SaaS 접근 + 키 회피

→ 답안 매핑:
- 멀티 계정 가드레일: SCP로 ap-northeast-2 외 리전 deny
- 감사: CloudTrail (Organization Trail) + S3 + Athena
- SaaS 접근: Cross-Account Role + ExternalId (액세스 키 회피)
- 데이터 암호화: KMS (custom CMK, key policy 명시)
- 21 CFR Part 11: CloudTrail Log File Integrity Validation + Object Lock
- 네트워크 격리: VPC Endpoint (S3/RDS) + PrivateLink

이 한 시나리오에 1주차 학습 내용이 거의 다 들어있다.

## 시나리오 10문항

**문제 1.** 한 회사가 100개 계정을 운영 중이다. 보안팀이 "production OU에서는 root user의 로그인 자체를 차단하고, MFA 없이 IAM 호출도 차단"하려 한다. 가장 적합한 방법은?

A) 각 계정에서 root user 비밀번호 삭제
B) Organizations SCP로 production OU에 deny 정책 적용 (Condition: `aws:PrincipalType=Root`, `aws:MultiFactorAuthPresent=false`)
C) Lambda로 모니터링 후 알람
D) IAM Identity Center로 모든 사용자 통합

**정답: B**
해설: SCP는 root user에도 적용되는 유일한 가드레일. Condition으로 root 차단 + MFA 강제. C는 사후 탐지일 뿐 차단 아님. A는 root 비밀번호는 삭제 불가(이메일로 복구 가능). D는 SSO 도구일 뿐 root 차단 무관.

---

**문제 2.** 한 글로벌 SaaS가 us-east-1에서 운영되며, eu-west-1로 확장한다. EU 사용자 데이터는 GDPR에 따라 EU에 머물러야 한다. 단일 코드베이스를 유지하면서 데이터 격리를 보장하려면?

A) DynamoDB Global Table
B) RDS Cross-Region Replica
C) 리전별 독립 DB + Route 53 Geolocation + 인증 시점 리전 결정
D) Aurora Global Database

**정답: C**
해설: A·B·D는 모두 양 리전 간 데이터 복제 → GDPR 위반. C는 리전별 완전 격리, 인증 시점에 사용자가 어느 리전에 속하는지 결정해 토큰에 포함. 단일 코드베이스는 환경 변수·설정으로 처리.

---

**문제 3.** 한 핀테크가 PCI-DSS 인증을 위해 모든 EC2가 us-east-1 외 리전을 사용하지 못하도록 강제하려 한다. 운영 부담을 최소화하려면?

A) AWS Config Custom Rule을 모든 계정에 배포
B) Organizations SCP에 `aws:RequestedRegion ≠ us-east-1`이면 모든 액션 deny
C) Lambda 모니터링으로 비인가 리전 리소스 삭제
D) 각 계정 IAM 정책 일일이 수정

**정답: B**
해설: SCP는 Organizations 한 번 적용으로 모든 계정·root까지 강제. 새 계정 추가 시 자동 적용. C는 사후 처리라 잠시 노출 위험. A는 탐지일 뿐 차단 아님.

---

**문제 4.** 한 회사가 EC2에서 S3에 접근한다. 트래픽이 NAT Gateway를 거쳐 월 $30,000 비용. PCI-DSS 감사에서도 "S3 트래픽이 인터넷을 거친다"고 지적. 어떻게 해결하는가?

A) Interface Endpoint 추가
B) Gateway Endpoint 추가
C) VPC Peering으로 S3 연결
D) Direct Connect

**정답: B**
해설: S3·DynamoDB는 Gateway Endpoint 무료 + Route Table에 prefix list 자동 등록. 트래픽이 IGW/NAT 없이 사설 경로. 비용 + 보안 동시 해결.

---

**문제 5.** 한 미디어 회사가 글로벌 게임 매치메이킹(WebSocket)을 운영한다. 정적 IP를 외부에 노출, 리전 장애 시 수 초 내 페일오버, 초당 100만 패킷 처리. 적합한 조합은?

A) ALB + Route 53 Failover
B) NLB + Route 53 Health Check
C) Global Accelerator + NLB
D) CloudFront + Lambda@Edge

**정답: C**
해설: GA는 BGP Anycast 정적 IP 2개 제공, 리전 장애 시 DNS 캐시 우회 수 초 내 페일오버. NLB는 L4·초당 수백만 패킷·정적 IP·WebSocket 모두 만족. A·B는 DNS TTL 캐시로 페일오버 분 단위. D는 L7 HTTP만.

---

**문제 6.** 한 회사가 GitHub Actions에서 AWS Lambda에 배포한다. 보안팀이 "long-lived AWS Access Key를 GitHub Secrets에 저장 금지"라고 요구한다. 어떻게 해결하는가?

A) IAM User + 90일 키 회전
B) AWS OIDC Provider 등록 + GitHub Actions에서 AssumeRoleWithWebIdentity
C) S3 ZIP 업로드 후 Lambda 트리거
D) CodePipeline으로 배포

**정답: B**
해설: GitHub은 2021년부터 OIDC 지원. AWS OIDC Provider 한 번 등록 후 GitHub Actions가 매번 OIDC id_token으로 임시 자격증명 발급. Long-lived key 불필요. Trust Policy의 Condition으로 repo·branch 제한 필수.

---

**문제 7.** 한 회사가 야간 ETL 배치(stateless, 재시작 가능)에 EC2 100대를 4시간 운영한다. 비용 최소화 + SLA(다음날 09시 완료) 만족.

A) 100대 On-Demand
B) 100대 3-year RI
C) Spot Fleet with diverse instance families (capacity-optimized)
D) 50대 RI + 50대 Spot

**정답: C**
해설: 4시간만 사용 → RI 손해. Stateless + 재시작 가능 → Spot 적합. 다양한 패밀리 섞으면 단일 패밀리 capacity 부족 위험 분산. capacity-optimized allocation으로 회수율 낮은 풀 우선 선택.

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
C) Aurora Global Database
D) DMS continuous replication

**정답: C**
해설: Aurora Global Database는 RPO < 1초, RTO ~1분 (managed failover). RDS Cross-Region Read Replica(B)는 RPO 수 초~수십 초, RTO 수 분~수십 분(수동 promote 필요). A는 같은 리전이라 DR 아님. D는 마이그레이션 도구. 트레이드오프: Aurora Global은 비용이 RDS보다 30% 이상 비쌈.

---

**문제 10.** 한 SaaS가 자기 서비스를 고객 VPC 안에서 사설 IP로 사용 가능하게 하려고 한다. 표준 패턴은?

A) Cross-Region VPC Peering
B) Transit Gateway 공유
C) PrivateLink + NLB + VPC Endpoint Service
D) Direct Connect Public VIF

**정답: C**
해설: PrivateLink는 SaaS가 NLB 뒤 서비스를 Endpoint Service로 등록, 고객은 Interface Endpoint로 접근. 데이터 양방향 노출 없음. Snowflake, MongoDB Atlas, Datadog 등 모두 채택. A·B는 양방향 라우팅이라 SaaS 보안 모델 부적합.

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
B) 각 AZ에 NAT Gateway 1개씩 (총 3개)
C) NAT Instance 직접 운영
D) IGW로 직접 연결

**정답: B**
해설: NAT Gateway는 AZ-local. 단일 NAT는 그 AZ 장애 시 모든 outbound 끊김. AZ별 NAT 배치 + 각 Private Subnet은 자기 AZ NAT 사용. 비용 추가는 시간당 $0.045 × 3 = 월 $97. 트레이드오프: dev 환경은 단일 NAT 허용.

## 정리하며

1주차는 시험의 문법과 SAA의 핵심 4개 영역(IAM·VPC·EC2·ELB)을 Pro 깊이로 복습했다. 2주차부터는 SAP에서만 본격적으로 다뤄지는 **멀티 계정 아키텍처**(Organizations·SCP·Control Tower·Identity Center)로 들어간다. 도메인 1의 26% 비중을 차지하는 영역이므로 가장 큰 ROI다.

오늘 본 시나리오 10문항을 다시 한 번 풀고, 틀린 문제는 분해법을 적용해 어디서 틀렸는지 확인하자. 시험장에서 손이 먼저 5칸을 그리는 순간이 곧 합격의 신호다.
