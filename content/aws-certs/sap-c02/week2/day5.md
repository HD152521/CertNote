# Day 10 - 2주차 통합: Organizations·SCP·CT·IDC가 한 시나리오에서 만날 때

Pro 시험에서 도메인 1(복잡한 조직 설계, 26%)의 핵심 4종은 **Organizations · SCP · Control Tower · IAM Identity Center**다. 한 주 동안 이 4종을 분리해서 봤다면, 오늘은 **한 시나리오에서 동시에 작동하는** Pro 문제를 본격적으로 풀어본다.

오늘 글의 구조는 1주차 day5와 동일하다.

1. **Week 2 한 줄 요약 30개**: 시험장에서 반사적으로 떠올라야 할 사실.
2. **멀티 계정 4-layer 사고법**: Org → OU → SCP → IDC로 시나리오를 분해.
3. **시나리오 12문항**: Pro 난이도, 풀이 시간 30분.

도메인 1은 SAA에서 거의 다루지 않은 영역이라 학습 ROI가 가장 높다. 4주차까지 이 영역에 집중하고 5주차부터 신규 솔루션·마이그레이션으로 넘어가는 것이 16주 커리큘럼의 의도다.

## Week 2 한 줄 요약 30개

### Organizations (1-8)

1. 멀티 계정 4동기: **격리(Blast Radius) · 청구 · 규제 · 운영**.
2. Management 계정은 **결제·Org 관리만**, 워크로드 금지. SCP 적용 X.
3. Management root는 하드웨어 MFA + 봉인된 비밀번호 + 별도 이메일 alias.
4. OU는 "공통 SCP 단위", 조직도 X. SRA 표준: Security/Infrastructure/Workloads/Sandbox.
5. Prod/Non-Prod는 반드시 계정 분리 — 같은 IAM 정책 실수가 Prod 위협.
6. PCI/HIPAA/SOX 워크로드는 별도 계정 — 감사 범위 좁히기.
7. `CreateAccount` API는 비동기. `DescribeCreateAccountStatus`로 polling 필요.
8. Trusted Access + Delegated Administrator로 Audit 계정에 보안 도구 위임.

### SCP (9-16)

9. SCP는 **권한 부여 X**, ceiling만. IAM 정책과 교집합.
10. **Explicit Deny가 모든 Allow를 이긴다**. 단 하나면 끝.
11. **Deny-list 전략 표준** (FullAWSAccess + 특정 Deny). 새 서비스 자동 허용.
12. 리전 제한 SCP는 글로벌 서비스(IAM, Org, Route53, CloudFront, GA, WAF) NotAction 예외 필수.
13. CloudTrail·GuardDuty·Config 비활성화 차단 SCP는 표준 baseline.
14. MFA 강제 시 `BoolIfExists` 사용 (`Bool`은 키 없을 때 매칭 안 함).
15. PolicyStaging OU에서 검증 후 본 OU에 부착 — dry-run의 사실상 대체.
16. **RCP**(2024)는 Resource 측 제한, OU 전체 외부 노출 차단.

### Control Tower (17-22)

17. **Landing Zone = 멀티 계정 거버넌스 기준점**, Control Tower가 1시간 자동 구축.
18. Core OU = Log Archive + Audit. Log Archive S3는 **Object Lock(WORM)**.
19. 가드레일 3종: **Preventive(SCP) / Detective(Config) / Proactive(CFN Hook)** — defense in depth.
20. Mandatory(해제 불가) / Strongly Recommended(권장) / Elective(선택).
21. **AFT = Terraform GitOps**, **CfCT = CloudFormation 확장**, **Account Factory = 콘솔 표준**.
22. Drift Detection은 매 시간 baseline 비교, Landing Zone Update로 복원.

### IAM Identity Center (23-30)

23. 멀티 계정 SSO 표준. 무료.
24. Permission Set 매핑 시 각 계정에 `AWSReservedSSO_*` Role 자동 생성.
25. Okta/Azure AD/Entra/Google → **SCIM** 사용자·그룹 자동 동기화 (RFC 7644).
26. **IDC = 직원·관리자 / Cognito = 고객 사용자** — 절대 헷갈리지 말 것.
27. CLI v2 SSO는 device authorization grant(OIDC), 브라우저 인증 후 토큰 자동 갱신.
28. ABAC + IDC: 사용자 속성 → IAM Role 세션 태그 → 리소스 태그 매칭. 100+ 프로젝트 폭증 방지.
29. 관리자 세션 1h, 개발자 4h, ReadOnly 8h — break-glass 패턴.
30. Consolidated Billing: RI/SP 공유 ON 기본, 부서별 분리 시 OFF 또는 Cost Allocation Tag.

## 멀티 계정 4-layer 사고법

도메인 1 시나리오를 풀 때 4개 layer 순서대로 점검하면 빠진 요소가 보인다.

```
┌──────────────────────────────────────────────────┐
│ Layer 1: Org   "계정을 어떻게 묶나?"             │
│   - OU 설계 (Security/Infra/Workloads/Sandbox)  │
│   - Management 계정 격리                          │
│   - 신규 계정 자동화 (Account Factory / AFT)     │
├──────────────────────────────────────────────────┤
│ Layer 2: SCP   "OU 차원 금지 사항은?"            │
│   - 리전 제한, root 차단, MFA 강제               │
│   - CloudTrail·GuardDuty 비활성화 차단           │
│   - Sandbox: 고비용 인스턴스 Deny                │
│   - RCP: 외부 Principal 접근 차단                │
├──────────────────────────────────────────────────┤
│ Layer 3: Control Tower   "가드레일은?"           │
│   - Preventive (SCP 자동 부착)                   │
│   - Detective (Config Rule 자동)                 │
│   - Proactive (CFN Hook)                         │
│   - Log Archive Object Lock + Audit Master      │
├──────────────────────────────────────────────────┤
│ Layer 4: IDC   "직원 접근은?"                    │
│   - 외부 IdP(Okta/Azure AD) + SCIM              │
│   - Permission Set + 세션 길이                   │
│   - ABAC (대규모 프로젝트)                       │
│   - break-glass 패턴                             │
└──────────────────────────────────────────────────┘
```

## 비교표: 자주 헷갈리는 짝들

| A | B | 차이 |
|---|---|------|
| **SCP** vs **IAM Policy** | OU/계정 ceiling vs Principal 권한 | SCP는 Allow X |
| **SCP** vs **Permission Boundary** | OU 차원 vs IAM 차원 ceiling | PB는 한 Role/User에만 |
| **SCP** vs **RCP** | Principal 측 vs Resource 측 | 보완 관계 |
| **Preventive** vs **Detective** | 사전 차단(SCP) vs 사후 탐지(Config) | 보완 관계 |
| **Account Factory** vs **AFT** | 콘솔/베이스 vs Terraform IaC | GitOps는 AFT |
| **CfCT** vs **AFT** | CFN 기반 vs Terraform 기반 | IaC 도구 선택 |
| **IDC** vs **Cognito** | 직원·관리자 vs 고객 사용자 | 절대 헷갈리지 X |
| **Permission Set** vs **IAM Role** | IDC 추상화 vs 실제 Role | PS 매핑이 Role 자동 생성 |
| **Log Archive** vs **Audit** | 로그 적재 vs 보안 분석 마스터 | Object Lock S3는 Log Archive |
| **Trusted Access** vs **Delegated Admin** | 서비스 활성화 vs 운영 위임 | 둘 다 필요 |

## 시나리오 12문항 (Pro 난이도)

---

**문제 1.** 5개 OU·100개 계정. 일부 OU에 비인가 리전 사용 금지. Best?

A) IAM 정책 일괄 배포 (Lambda 자동화)
B) Org SCP에 `aws:RequestedRegion` Deny + 글로벌 서비스 NotAction 예외
C) NACL로 차단
D) Config Rule만 활성화

**정답: B**
해설: SCP가 사전 강제. Config는 탐지만. Lambda 일괄 배포는 운영 부담 큼. 글로벌 서비스(IAM/Org/Route53/CloudFront/GA/WAF) NotAction 예외 필수. Trade-off: 새 글로벌 서비스 출시 시 NotAction 업데이트 필요.

---

**문제 2.** 새 OU 생성 후 FullAWSAccess SCP 제거, Allow-list로 EC2만 허용. 그 계정에서 S3 호출은?

A) 허용 (S3는 글로벌)
B) 거부 (SCP에 S3 Allow 없음, 묵시적 Deny)
C) Resource Policy로 풀림
D) IAM Policy 우선 적용

**정답: B**
해설: SCP에 액션이 없으면 IAM 정책이 뭘 줘도 결과는 Deny. SCP는 ceiling. 새 OU의 묵시적 Deny가 함정 1순위.

---

**문제 3.** Okta 사용자 + 50개 AWS 계정 + 콘솔/CLI SSO. 가장 적절한?

A) 각 계정 SAML 등록 (50번)
B) IAM Identity Center + Okta (SAML + SCIM)
C) Cognito User Pool (직원용)
D) AD Connector + IAM User

**정답: B**
해설: IDC가 표준. SCIM(사용자 동기화) + SAML(인증). 50개 계정 일괄 관리. C는 고객용. A는 50번 작업 + 동기화 부재.

---

**문제 4.** 신규 계정 생성 시 표준 베이스라인(CloudTrail, IAM Role, 태그) 자동 적용. Terraform 사용. Best?

A) Account Factory (콘솔)
B) AFT (Account Factory for Terraform)
C) CfCT
D) StackSets만

**정답: B**
해설: Terraform 기반 GitOps = AFT. PR 머지 → 자동 계정 생성 + 베이스라인. Capital One·HashiCorp 표준.

---

**문제 5.** 회사 정책: 모든 EBS는 KMS 암호화 필수. 배포 시도부터 차단. 어떤 가드레일?

A) Detective (Config Rule)
B) Proactive (CloudFormation Hook)
C) Preventive (SCP)
D) Tag Policy

**정답: B**
해설: 배포 전 차단 = Proactive(CFN Hook). SCP도 가능하지만 IaC 흐름에서 가장 깔끔. 추가로 Preventive(SCP)와 Detective(Config) 함께 3중 방어가 표준.

---

**문제 6.** 100개 계정의 CloudTrail 로그를 변경 불가능하게 한 곳에 모으려면?

A) 각 계정 자체 S3 + IAM 정책
B) Log Archive 계정 + S3 Object Lock(WORM) + Organization Trail
C) CloudWatch Logs 통합
D) Athena 직접 쿼리

**정답: B**
해설: Log Archive 패턴 + Object Lock 표준. Object Lock은 정의된 retention 기간 동안 root 계정도 삭제 못 함. 21 CFR Part 11, SOX 같은 규제에서 핵심.

---

**문제 7.** 개발자 그룹이 자유롭게 실험할 OU. 비용 폭주 위험. Best?

A) Workloads OU 안에 포함
B) Sandbox OU + SCP(p4/p5/x2 등 고비용 인스턴스 Deny) + AWS Budgets Alert + 자동 정리 Lambda
C) Management 계정에 IAM User
D) Direct Connect + 별도 VPC

**정답: B**
해설: Sandbox OU 패턴 + 비용 가드레일 + 자동 정리. 한 달 미사용 리소스 자동 삭제 표준.

---

**문제 8.** CFO가 부서별 비용을 분리 청구하려고 함. Best?

A) Consolidated Billing + 부서별 OU + Cost Allocation Tag + Cost Explorer 부서별 보기
B) 각 부서 별도 Org
C) Linked Account 폐지
D) Trusted Advisor

**정답: A**
해설: Org + 태그 기반 비용 분류 표준. Cost Allocation Tag를 활성화하고 모든 리소스에 `CostCenter`, `Department` 태그 부착. Cost Explorer에서 태그별 필터링.

---

**문제 9.** CloudTrail을 누군가 비활성화하지 못하게 보장. Best?

A) IAM 정책으로만
B) SCP에 `cloudtrail:StopLogging`, `DeleteTrail`, `UpdateTrail` 명시적 Deny
C) NACL
D) WAF

**정답: B**
해설: SCP Deny는 어떤 IAM Allow도 뚫지 못함. Equifax(2017) 사고 후 PCI-DSS v4.0, NIST CSF에서 log immutability 명시. 표준 baseline SCP.

---

**문제 10.** 회사가 Org 가입 직후 Landing Zone 빠르게 갖추고 Audit·Log 표준 자동화. Best?

A) 직접 구축 (수개월)
B) Control Tower
C) Service Catalog
D) Trusted Advisor

**정답: B**
해설: Control Tower가 Landing Zone 1시간 자동 구축. Log Archive·Audit 자동 생성. 가드레일 자동 부착. SRA 기반 모범 사례.

---

**문제 11.** 한 SaaS가 회사 외부 Principal이 OU 안의 모든 S3 버킷에 접근하지 못하게 하려고 한다. 한 곳에서 정책으로 일괄 차단. Best?

A) 각 버킷에 Bucket Policy 일일이 작성
B) Lambda 모니터링
C) Resource Control Policy(RCP)로 OU에 부착 (`aws:PrincipalOrgID != o-xxxx` Deny)
D) GuardDuty 알람

**정답: C**
해설: RCP(2024)는 Resource 측 제한. 한 곳에서 정의하면 OU 안 모든 리소스에 적용. 2017년 Verizon·Accenture 같은 S3 public 사고를 구조적으로 차단. SCP가 Principal 측, RCP가 Resource 측 — 보완 관계.

---

**문제 12.** 한 회사가 100개 프로젝트를 운영. 각 프로젝트마다 분리된 S3 버킷, EC2. 사용자는 자기 프로젝트 리소스에만 접근 가능해야 함. RBAC으로는 100 Role 폭발. 가장 적합한 패턴?

A) 100개 Permission Set 생성
B) ABAC + IDC: IdP 속성을 IAM Role 세션 태그로 전파, 리소스 태그와 매칭
C) 100개 OU 생성
D) 100개 계정 분리

**정답: B**
해설: ABAC 표준 패턴(NIST SP 800-162). 사용자 속성(Project) → 세션 태그(`aws:PrincipalTag/Project`) → 리소스 태그(`aws:ResourceTag/Project`) 매칭. 한 개 정책으로 100개 프로젝트 처리. 신규 프로젝트 추가 시 정책 수정 불필요.

## 정리하며

2주차는 도메인 1의 핵심 4종을 깊이 다뤘다. Organizations로 계정을 묶고, SCP로 천장을 정하고, Control Tower로 거버넌스를 자동화하고, IDC로 직원 SSO를 통합 — 이 4종이 멀티 계정 환경의 표준 스택이다.

다음 주는 **고급 네트워킹**(Week 3)이다. VPC Peering vs Transit Gateway, Direct Connect 이중화, Site-to-Site VPN, PrivateLink 등 SAA에서 가볍게 본 네트워킹을 Pro 깊이로 다시 본다. 도메인 1·2에서 자주 출제되는 영역이고, "수천 VPC를 어떻게 묶나" 같은 시나리오가 본격 등장한다.

오늘 본 12문항을 다시 풀고, 틀린 문제는 **4-layer 사고법**(Org → SCP → CT → IDC)을 적용해 어디서 틀렸는지 확인하자. 시험장에서 손이 자동으로 4 layer를 그리는 순간이 도메인 1 합격의 신호다.

---

## 📌 다음 주 예고

**Week 3: 고급 네트워킹**
- VPC Peering vs Transit Gateway (수천 VPC 환경)
- Direct Connect 이중화 + LAG + Resilience
- Site-to-Site VPN, Client VPN
- PrivateLink, VPC Endpoint, Service Endpoint
- Network Firewall, GWLB, Resolver
