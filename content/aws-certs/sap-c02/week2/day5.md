# Day 5 - 2주차 통합: Organizations·SCP·CT·IDC가 한 시나리오에서 만날 때

Pro 시험에서 도메인 1(복잡한 조직 설계, 26%)의 핵심 4종은 **Organizations · SCP · Control Tower · IAM Identity Center**다. 한 주 동안 이 4종을 분리해서 봤다면, 오늘은 **한 시나리오에서 동시에 작동하는** Pro 문제를 본격적으로 풀어본다.

도메인 1이 어려운 이유는 단일 서비스 지식이 아니라 **층(layer)이 겹친 채로 출제**되기 때문이다. "리전 제한이 안 먹힌다"는 문제 하나에도 SCP의 NotAction 예외, OU 상속, IDC Permission Set의 인라인 정책, RCP의 외부 Principal 차단이 동시에 얽혀 있을 수 있다. 그래서 오늘은 각 서비스를 다시 설명하기보다, 한 서비스의 결정이 다른 서비스에 어떤 파급(blast radius)을 일으키는지를 본다.

오늘 글의 구조는 1주차 day5와 동일하다.

1. **Week 2 한 줄 요약 30개**: 시험장에서 반사적으로 떠올라야 할 사실.
2. **멀티 계정 4-layer 사고법**: Org → OU → SCP → IDC로 시나리오를 분해.
3. **계정 분리의 역사와 이론적 배경**: 왜 "하나의 큰 계정"이 안티패턴인가.
4. **다른 클라우드 비교**: Azure Management Group, GCP Organization과의 대조.
5. **시나리오 12문항**: Pro 난이도, 풀이 시간 30분.

도메인 1은 SAA에서 거의 다루지 않은 영역이라 학습 ROI가 가장 높다. 4주차까지 이 영역에 집중하고 5주차부터 신규 솔루션·마이그레이션으로 넘어가는 것이 16주 커리큘럼의 의도다.

## 멀티 계정 거버넌스의 역사와 이론

> 🔍 **더 깊이**: AWS Organizations가 GA된 것은 **2017년 2월**이다. 그 전에는 **Consolidated Billing(2010)**만 있어서 청구만 묶고 권한 거버넌스는 각 계정이 알아서 했다. SCP는 Organizations와 함께 등장했고, 멀티 계정을 "비용 묶음"에서 "거버넌스 단위"로 격상시켰다. 2019년 **Control Tower**(Landing Zone 자동화), 2018년 **AWS SSO**(현 IAM Identity Center)가 차례로 나오며 오늘날의 스택이 완성됐다. 즉 도메인 1의 4종은 7~8년에 걸쳐 점진적으로 쌓인 계층이고, Pro 시험은 이 계층이 "함께 동작하는" 그림을 본다.

회사를 하나의 거대한 AWS 계정에서 운영하면 왜 안 되는가. 핵심은 **blast radius(폭발 반경)** 와 **격리 경계(isolation boundary)** 다.

> 💡 **관련 이론**: 분산 시스템 신뢰성 이론에서 **fault containment region(FCR)** 개념이 있다. 한 결함이 다른 영역으로 전파되지 못하도록 시스템을 경계로 나누는 설계다. AWS 계정은 클라우드에서 가장 강한 FCR이다 — IAM 정책 실수, 리소스 한도(quota), 보안 침해가 계정 경계를 넘지 못한다. VPC나 IAM 경계는 같은 계정 안의 "약한" 경계지만, 계정 경계는 AWS 백본 수준에서 분리된 "강한" 경계다. 이게 "Prod와 Non-Prod는 반드시 계정 분리"의 이론적 근거다.

> 💡 **관련 이론**: 멀티 계정 설계는 보안의 **최소 권한 원칙(Principle of Least Privilege)**과 **권한 분리(Separation of Duties, SoD)**를 구조로 강제한 것이다. SoD는 회계·감사 분야에서 1970년대부터 내려온 통제 원칙으로, NIST SP 800-53 AC-5에 명문화돼 있다. 로그를 적재하는 계정(Log Archive)과 그것을 분석하는 계정(Audit)을 나누는 것, 결제만 하는 Management 계정에 워크로드를 두지 않는 것 모두 SoD의 클라우드 구현이다.

> 📚 **사례**: **Capital One(2019년 7월)** — SSRF 취약점으로 EC2 메타데이터에서 과도한 권한의 IAM Role 자격증명이 탈취되어 1억 6백만 명의 데이터가 유출됐다. 직접 원인은 WAF 설정과 과도한 S3 접근 권한이었지만, 사후 분석에서 "데이터 계정과 애플리케이션 계정이 충분히 분리되지 않아 한 Role이 너무 많은 버킷에 접근할 수 있었다"는 점이 지적됐다. 교훈: 계정·Role 경계를 좁게 나누면 한 자격증명이 탈취돼도 blast radius가 제한된다. 이 사고 후 AWS는 IMDSv2(2019)를 출시하고 SRA(Security Reference Architecture)에서 계정 분리를 강하게 권고했다.

## 다른 클라우드의 멀티 계정/조직 거버넌스

Pro 시험은 AWS만 묻지만, 개념을 비교하면 본질이 또렷해진다.

| 개념 | AWS | Azure | GCP |
|------|-----|-------|-----|
| 격리 단위 | **Account** | Subscription | Project |
| 조직 루트 | Organization | Tenant (Entra ID) | Organization |
| 그룹화 계층 | **OU** | Management Group | Folder |
| 정책 가드레일 | **SCP / RCP** | Azure Policy | Org Policy Constraints |
| ID 통합 | IAM Identity Center | Entra ID (네이티브) | Cloud Identity |
| 자동 랜딩존 | Control Tower | Landing Zone (CAF) | Landing Zone (Fabric) |

> 🔍 **더 깊이**: 가장 큰 구조적 차이는 **AWS는 계정이 "별도 청구·별도 quota·별도 리소스 네임스페이스"를 가진 1급 격리 경계**라는 점이다. Azure의 Subscription도 비슷하지만, Azure는 Entra ID가 테넌트 전체에 걸쳐 ID를 네이티브로 관리해서 IDC 같은 별도 통합 계층이 덜 필요하다. GCP의 Project는 가장 가볍고 만들기 쉬워서 "리소스마다 프로젝트" 패턴이 흔하다. AWS에서 SCP가 "OU에 부착하는 default-deny ceiling"이라면, Azure Policy는 "리소스 속성을 평가하는 audit/deny 규칙"이라 평가 모델 자체가 다르다 — Azure Policy는 SCP보다 Config Rule(Detective)에 가깝다.

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

> 💡 **관련 이론**: 25번의 SCIM은 **RFC 7644(System for Cross-domain Identity Management)** 표준이고, 인증 프로토콜인 SAML 2.0은 OASIS 표준, IDC CLI가 쓰는 device authorization grant는 **RFC 8628(OAuth 2.0 Device Authorization Grant)**이다. 시험에서 "Okta 사용자를 50개 계정에 자동 동기화"라는 표현이 나오면 곧 SCIM(provisioning)이고, "로그인 흐름"은 SAML(authentication)이다. **Provisioning(SCIM) ≠ Authentication(SAML)** — 이 둘을 분리해서 봐야 보기에서 헷갈리지 않는다.

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

> 🔍 **더 깊이**: 4-layer는 단순한 암기 틀이 아니라 **권한 평가의 실제 순서**와 일치한다. 요청이 들어오면 AWS는 (1) 모든 상위 OU의 SCP를 위에서 아래로 교집합, (2) RCP(리소스 측), (3) Permission Boundary, (4) Identity Policy + Resource Policy + Session Policy를 종합한다. 이 중 하나라도 명시적 Deny면 즉시 거부, 어디에도 Allow가 없어도 거부(default-deny). Layer 1~2가 "OU 차원 ceiling"을 결정하고, Layer 4의 IDC Permission Set이 "그 ceiling 안에서 직원에게 실제로 무엇을 주나"를 결정한다. 그래서 "SCP는 막지 않는데 직원이 접근 못 한다"면 Permission Set(IDC) 쪽을, "Permission Set은 줬는데도 안 된다"면 상위 SCP를 의심하는 게 디버깅 순서다.

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
| **SCIM** vs **SAML** | 사용자 프로비저닝 | 인증/로그인 |
| **CAP 가용성 우선** vs **일관성 우선** | 멀티 리전 거버넌스 데이터 | 아래 박스 참조 |

> 💡 **관련 이론**: 마지막 행과 관련해 — Organizations의 SCP/정책 메타데이터는 **글로벌 컨트롤 플레인**에서 관리되고 멤버 계정에 전파(propagate)된다. 이는 **CAP 정리**에서 가용성(A)을 택한 **eventually consistent** 시스템이다. SCP를 변경하면 즉시가 아니라 수 초~수 분 안에 모든 계정에 적용된다. PACELC로 표현하면 "분할(P)이 없을 때도 지연(L)보다 가용성(A)을 우선"하는 PA/EL 시스템에 가깝다. 그래서 시험에서 "SCP 변경 직후 일부 계정에 즉시 반영 안 됨"이라는 묘사가 나오면 버그가 아니라 전파 지연으로 이해해야 한다.

## 안티패턴: 도메인 1에서 오답을 부르는 설계

> ⚠️ **함정**: 도메인 1 보기에는 "그럴듯하지만 안티패턴"인 선택지가 항상 섞여 있다. 대표적 안티패턴 5종을 외워두면 소거법이 빨라진다.
>
> 1. **OU를 조직도(부서) 그대로 매핑** — OU는 "공통 SCP 단위"지 사람 조직이 아니다. 재무팀·인사팀으로 OU를 나누면 SCP가 의미 없이 쪼개진다.
> 2. **Management 계정에 워크로드/IAM User 운영** — 침해 시 SCP 보호가 전혀 없는 계정이 뚫린다.
> 3. **각 계정마다 IAM User를 따로 만들고 수동 관리** — IDC + SCIM이 표준. 계정마다 User를 만들면 50개 계정 = 50배 관리 부담.
> 4. **SCP를 권한 부여 수단으로 착각** — SCP에 Allow를 넣어도 IAM 정책이 없으면 권한이 생기지 않는다.
> 5. **거버넌스를 Config Rule(Detective)만으로 구현** — 탐지는 사후. 막아야 하는 규칙(리전 제한, 암호화 강제)은 Preventive(SCP)나 Proactive(CFN Hook)가 맞다.

> 🎯 **시나리오**: "한 스타트업이 빠르게 성장해 단일 계정에 Prod·Dev·CI/CD·데이터 분석이 모두 들어 있다. 보안팀이 멀티 계정 전환을 권고한다. 첫 단계로 가장 적절한 것은?" — 답: **Control Tower로 Landing Zone을 세우고, 기존 단일 계정을 Workloads OU 아래로 초대(invite)한 뒤, 점진적으로 Prod/Dev/Security/Log Archive/Audit 계정을 분리**. 한 번에 모든 걸 옮기려 하면 실패한다. 7R 마이그레이션 관점에서 이는 계정 단위의 "re-platform"에 가깝고, Account Factory로 신규 계정을 표준 베이스라인과 함께 찍어내는 게 핵심이다.

## 시나리오 12문항 (Pro 난이도)

---

**문제 1.** 5개 OU·100개 계정. 일부 OU에 비인가 리전 사용 금지. Best?

A) Lambda 자동화로 100개 계정의 모든 Role에 리전 제한 IAM 정책을 일괄 배포하고 신규 Role에도 주기적으로 재적용

B) Org SCP에 `aws:RequestedRegion` Deny + 글로벌 서비스 NotAction 예외

C) 비인가 리전 서브넷의 NACL 아웃바운드에 0.0.0.0/0 Deny를 걸어 해당 리전 리소스의 통신을 차단

D) Config Rule(`region-restriction`)을 OU 전체에 배포해 비인가 리전 리소스를 탐지하고 SNS로 보안팀에 알림

**정답: B**

해설: SCP가 사전 강제. Config는 탐지만. Lambda 일괄 배포는 운영 부담 큼. 글로벌 서비스(IAM/Org/Route53/CloudFront/GA/WAF) NotAction 예외 필수. Trade-off: 새 글로벌 서비스 출시 시 NotAction 업데이트 필요. 4-layer 관점에서 이건 Layer 2(SCP) 문제이며, A는 Layer 4(Identity)를 잘못 끌어온 오답이다 — IAM 정책은 root와 향후 생성될 Role을 빠짐없이 덮지 못한다.

---

**문제 2.** 새 OU 생성 후 FullAWSAccess SCP 제거, Allow-list로 EC2만 허용. 그 계정에서 S3 호출은?

A) 허용 — S3는 글로벌 서비스라 리전·OU 단위 SCP의 적용 범위 밖이라서

B) 거부 (SCP에 S3 Allow 없음, 묵시적 Deny)

C) 허용 — 버킷의 Resource Policy가 `Allow`를 주면 SCP의 묵시적 Deny를 덮어써서

D) 허용 — 계정의 IAM Policy가 S3 Allow를 주면 SCP보다 우선 평가되어서

**정답: B**

해설: SCP에 액션이 없으면 IAM 정책이 뭘 줘도 결과는 Deny. SCP는 ceiling. 새 OU의 묵시적 Deny가 함정 1순위. 이론적으로 SCP는 권한 lattice의 상한(supremum)을 정하고 실제 권한은 그 상한과 IAM 정책의 교집합이라, 상한에 S3가 없으면 교집합도 공집합이다.

---

**문제 3.** Okta 사용자 + 50개 AWS 계정 + 콘솔/CLI SSO. 가장 적절한?

A) 각 계정에 Okta를 SAML IdP로 50번 개별 등록하고 계정마다 Federated Role을 수동 매핑

B) IAM Identity Center + Okta (SAML + SCIM)

C) Cognito User Pool에 직원을 등록하고 Identity Pool로 각 계정의 IAM Role을 발급

D) AD Connector로 Okta를 연동하고 각 계정에 직원별 IAM User를 만들어 콘솔·CLI 키를 발급

**정답: B**

해설: IDC가 표준. SCIM(사용자 동기화, RFC 7644) + SAML(인증). 50개 계정 일괄 관리. C는 고객용(Cognito). A는 50번 작업 + 동기화 부재. D의 IAM User는 안티패턴 3번(계정마다 User 수동 관리)에 해당. 핵심 분별점: provisioning은 SCIM, authentication은 SAML — 둘은 다른 프로토콜이다.

---

**문제 4.** 신규 계정 생성 시 표준 베이스라인(CloudTrail, IAM Role, 태그) 자동 적용. Terraform 사용. Best?

A) Account Factory를 콘솔에서 직접 사용해 신규 계정을 생성하고 베이스라인은 사후에 수동 적용

B) AFT (Account Factory for Terraform)

C) CfCT(Customizations for Control Tower)로 CloudFormation 템플릿을 신규 계정에 자동 배포

D) StackSets만으로 신규 계정에 CloudTrail·IAM Role·태그 리소스를 자동 배포

**정답: B**

해설: Terraform 기반 GitOps = AFT. PR 머지 → 자동 계정 생성 + 베이스라인. C(CfCT)는 CloudFormation 확장이라 IaC 도구가 Terraform이면 부합하지 않는다. D(StackSets)는 리소스 배포는 되지만 계정 vending(생성) 파이프라인이 빠진다. AFT는 내부적으로 Account Factory + Step Functions + 4개 Terraform 파이프라인(global/account customizations 등)으로 구성된다.

---

**문제 5.** 회사 정책: 모든 EBS는 KMS 암호화 필수. 배포 시도부터 차단. 어떤 가드레일?

A) Detective — Config Rule(`encrypted-volumes`)로 미암호화 EBS를 탐지하고 자동 Remediation으로 사후 교정

B) Proactive (CloudFormation Hook)

C) Preventive — SCP에서 `ec2:CreateVolume`에 `ec2:Encrypted=false` 조건 Deny

D) Tag Policy로 암호화 여부를 태그로 표준화하고 누락 시 비준수로 표시

**정답: B**

해설: 배포 전 차단 = Proactive(CFN Hook)가 IaC 흐름에서 가장 깔끔. SCP(Preventive)로 `ec2:CreateVolume`에 `ec2:Encrypted=false` Deny를 거는 방법도 유효하지만, CloudFormation 스택을 통한 배포를 스택 생성 시점에 검증·차단하려면 CFN Hook이 정답에 가깝다. 실무 표준은 Preventive(SCP) + Proactive(CFN Hook) + Detective(Config) 3중 방어(defense in depth)다. 참고: **Declarative Policy(2024)**로 EBS 기본 암호화를 선언적으로 강제하는 방법도 보기에 나올 수 있다.

---

**문제 6.** 100개 계정의 CloudTrail 로그를 변경 불가능하게 한 곳에 모으려면?

A) 각 계정이 자체 S3 버킷에 로그를 저장하고 IAM 정책으로 삭제 권한을 제거해 변경 불가를 강제

B) Log Archive 계정 + S3 Object Lock(WORM) + Organization Trail

C) 모든 계정의 CloudTrail을 중앙 CloudWatch Logs 그룹으로 통합하고 보존 기간을 영구로 설정

D) 각 계정 로그를 S3에 모은 뒤 Athena로 직접 쿼리해 변경 여부를 상시 감사

**정답: B**

해설: Log Archive 패턴 + Object Lock 표준. Object Lock(Compliance 모드)은 정의된 retention 기간 동안 root 계정도 삭제 못 함 — WORM(Write Once Read Many). 이는 SEC Rule 17a-4, FINRA, 21 CFR Part 11, SOX 같은 규제에서 요구하는 불변 보존이다. Organization Trail은 신규 계정이 추가돼도 자동으로 로그를 수집해 누락을 막는다. SoD 관점에서 Log Archive(적재)와 Audit(분석)을 분리하는 게 핵심.

---

**문제 7.** 개발자 그룹이 자유롭게 실험할 OU. 비용 폭주 위험. Best?

A) Workloads OU 안에 포함

B) Sandbox OU + SCP(p4/p5/x2 등 고비용 인스턴스 Deny) + AWS Budgets Alert + 자동 정리 Lambda

C) Management 계정에 IAM User

D) Direct Connect + 별도 VPC

**정답: B**

해설: Sandbox OU 패턴 + 비용 가드레일 + 자동 정리. 한 달 미사용 리소스 자동 삭제 표준. A는 실험용 격리가 부족, C는 안티패턴 2번(Management 계정 워크로드). Budgets는 사후 알림이므로 SCP(사전 차단)와 병행해야 폭주를 실제로 막는다.

---

**문제 8.** CFO가 부서별 비용을 분리 청구하려고 함. Best?

A) Consolidated Billing + 부서별 OU + Cost Allocation Tag + Cost Explorer 부서별 보기

B) 각 부서 별도 Org

C) Linked Account 폐지

D) Trusted Advisor

**정답: A**

해설: Org + 태그 기반 비용 분류 표준. Cost Allocation Tag를 활성화하고 모든 리소스에 `CostCenter`, `Department` 태그 부착. Tag Policy로 태그 표준을 강제하면 누락을 막을 수 있다. B(별도 Org)는 RI/Savings Plans 공유 혜택을 잃고 거버넌스가 파편화된다 — Consolidated Billing의 핵심 이점이 SP/RI를 조직 전체에서 공유해 활용률을 높이는 것이다.

---

**문제 9.** CloudTrail을 누군가 비활성화하지 못하게 보장. Best?

A) 모든 계정의 IAM 정책에서 `cloudtrail:StopLogging` 권한을 제거하고 신규 Role에도 동일 정책을 강제

B) SCP에 `cloudtrail:StopLogging`, `DeleteTrail`, `UpdateTrail` 명시적 Deny

C) Trail이 기록되는 S3 버킷 앞단에 NACL을 두어 CloudTrail 제어 API 트래픽을 차단

D) AWS WAF로 CloudTrail 콘솔·API 요청을 검사해 비활성화 시도를 룰로 차단

**정답: B**

해설: SCP Deny는 어떤 IAM Allow도 뚫지 못함(explicit deny > any allow). Equifax(2017) 사고 후 PCI-DSS v4.0(2022), NIST CSF에서 log immutability를 명시. 표준 baseline SCP다. A는 root와 미래에 생길 Role을 빠짐없이 덮지 못해 구멍이 남는다.

---

**문제 10.** 회사가 Org 가입 직후 Landing Zone 빠르게 갖추고 Audit·Log 표준 자동화. Best?

A) CloudFormation·SCP·Config를 직접 조합해 Landing Zone과 Audit·Log 계정을 수개월에 걸쳐 자체 구축

B) Control Tower

C) Service Catalog로 계정·베이스라인 제품을 포트폴리오로 만들어 셀프서비스 프로비저닝

D) Trusted Advisor의 보안·내결함성 점검 결과를 기준으로 표준 계정 구성을 수동 적용

**정답: B**

해설: Control Tower가 Landing Zone 1시간 자동 구축. Log Archive·Audit 자동 생성, 가드레일 자동 부착, SRA 기반 모범 사례. C(Service Catalog)는 Control Tower의 Account Factory가 내부적으로 쓰는 구성요소일 뿐 단독으로 Landing Zone을 만들지 않는다. Azure의 CAF Landing Zone, GCP의 Fabric Landing Zone에 대응하는 AWS 표준이 Control Tower다.

---

**문제 11.** 한 SaaS가 회사 외부 Principal이 OU 안의 모든 S3 버킷에 접근하지 못하게 하려고 한다. 한 곳에서 정책으로 일괄 차단. Best?

A) 각 버킷에 Bucket Policy 일일이 작성

B) Lambda 모니터링

C) Resource Control Policy(RCP)로 OU에 부착 (`aws:PrincipalOrgID != o-xxxx` Deny)

D) GuardDuty 알람

**정답: C**

해설: RCP(2024년 11월)는 Resource 측 제한. 한 곳에서 정의하면 OU 안 모든 리소스에 적용. 2017년 Verizon·Booz Allen·Accenture 같은 S3 public 사고를 구조적으로 차단한다. SCP가 Principal 측, RCP가 Resource 측 — 보완 관계다. RCP는 **confused deputy** 공격(누군가 실수로 `Principal: "*"`를 넣어도 Org 외부는 차단)을 OU 차원에서 막는다. A는 버킷 수만큼 누락 위험, B/D는 탐지일 뿐 차단이 아니다.

---

**문제 12.** 한 회사가 100개 프로젝트를 운영. 각 프로젝트마다 분리된 S3 버킷, EC2. 사용자는 자기 프로젝트 리소스에만 접근 가능해야 함. RBAC으로는 100 Role 폭발. 가장 적합한 패턴?

A) 프로젝트마다 Permission Set을 만들어 100개를 IDC에 정의하고 사용자별로 할당

B) ABAC + IDC: IdP 속성을 IAM Role 세션 태그로 전파, 리소스 태그와 매칭

C) 프로젝트마다 OU를 만들어 100개 OU에 SCP로 다른 프로젝트 리소스 접근을 차단

D) 프로젝트마다 계정을 분리해 100개 계정으로 격리하고 사용자를 해당 계정에만 매핑

**정답: B**

해설: ABAC 표준 패턴(NIST SP 800-162). 사용자 속성(Project) → 세션 태그(`aws:PrincipalTag/Project`) → 리소스 태그(`aws:ResourceTag/Project`) 매칭. 한 개 정책으로 100개 프로젝트 처리. 신규 프로젝트 추가 시 정책 수정 불필요(태그만 부여). A(100 Permission Set)·C(100 OU)·D(100 계정)는 모두 선형으로 증가하는 운영 부담 — RBAC의 "role explosion" 문제다. ABAC은 차원을 속성으로 바꿔 이 폭발을 상수로 만든다.

## 정리하며

2주차는 도메인 1의 핵심 4종을 깊이 다뤘다. Organizations로 계정을 묶고, SCP로 천장을 정하고, Control Tower로 거버넌스를 자동화하고, IDC로 직원 SSO를 통합 — 이 4종이 멀티 계정 환경의 표준 스택이다. 오늘 추가로 본 것은 (1) 이 스택이 7~8년에 걸쳐 쌓인 계층이라는 역사적 맥락, (2) 계정 경계가 클라우드에서 가장 강한 fault containment region이라는 이론, (3) Capital One·Equifax·S3 public 사고가 왜 계정 분리와 SCP/RCP로 귀결되는가, (4) Azure Management Group·GCP Folder와의 대조다.

다음 주는 **고급 네트워킹**(Week 3)이다. VPC Peering vs Transit Gateway, Direct Connect 이중화, Site-to-Site VPN, PrivateLink 등 SAA에서 가볍게 본 네트워킹을 Pro 깊이로 다시 본다. 도메인 1·2에서 자주 출제되는 영역이고, "수천 VPC를 어떻게 묶나" 같은 시나리오가 본격 등장한다.

오늘 본 12문항을 다시 풀고, 틀린 문제는 **4-layer 사고법**(Org → SCP → CT → IDC)을 적용해 어디서 틀렸는지 확인하자. 시험장에서 손이 자동으로 4 layer를 그리는 순간이 도메인 1 합격의 신호다. 특히 "SCP인가 IDC인가", "Preventive인가 Detective인가", "SCIM인가 SAML인가"의 분별점을 손에 익혀두면 보기 소거가 빨라진다.

---

## 📌 다음 주 예고

**Week 3: 고급 네트워킹**
- VPC Peering vs Transit Gateway (수천 VPC 환경)
- Direct Connect 이중화 + LAG + Resilience
- Site-to-Site VPN, Client VPN
- PrivateLink, VPC Endpoint, Service Endpoint
- Network Firewall, GWLB, Resolver
