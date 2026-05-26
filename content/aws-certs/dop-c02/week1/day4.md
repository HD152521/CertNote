# Day 4 - 멀티 계정 전략: Organizations, Control Tower, IAM Identity Center의 진짜 그림

DOP-C02 시험 문제의 90% 이상은 **멀티 계정 환경을 기본 가정**으로 깔고 들어간다. "한 회사가 prod, staging, dev 계정을 분리 운영하는데..."로 시작하는 시나리오가 끝없이 나온다. 이 토대 없이는 cross-account 배포, 중앙 집중 보안, StackSets 같은 다음 주제들이 다 공중에 뜬다.

오늘은 멀티 계정이 왜 표준이 되었는지, AWS Organizations·Control Tower·IAM Identity Center가 어떻게 그 토대를 만드는지를 정리한다.

## 멀티 계정이 표준이 된 이유 — Blast Radius와 Quota

처음 AWS를 도입할 때 대부분 단일 계정에서 시작한다. dev/staging/prod를 VPC와 IAM으로 분리. 그러나 회사가 성장하면서 거의 모든 회사가 멀티 계정으로 간다. 왜 그럴까?

### 이유 1: Blast Radius 격리

단일 계정에서 운영자가 실수로 `aws s3 rb --force` 같은 명령을 prod bucket에 날리면? IAM으로 막을 수 있지만, **권한이 있는 사람이 실수하면** 무력하다. 계정이 다르면 STS AssumeRole이 필요한 명시적 동작이 한 단계 더 들어가 실수 가능성이 낮아진다.

> 📚 **사례**: 2017년 GitLab은 prod DB를 운영하던 SRE가 staging 환경인 줄 알고 `rm -rf` 명령을 prod에서 실행했다. 300GB의 prod DB가 통째로 날아갔고, 백업도 정상 동작하지 않아 6시간 분량의 데이터 손실이 발생했다. 이후 GitLab은 prod/staging 별도 계정 분리를 시작했다. 같은 사고가 AWS 환경에서도 무수히 반복됐고, 이게 멀티 계정 전략의 출발점이다.

### 이유 2: 서비스 Quota 분리

AWS Service Quota(구 Limit)는 계정별이다. 단일 계정에서 EC2 인스턴스 limit이 1000개라면, dev 팀이 1000개를 다 써버리면 prod에서 신규 인스턴스를 못 만든다. 계정을 분리하면 각각 1000개씩 가져갈 수 있다.

### 이유 3: 비용 분리와 가시성

Cost Allocation Tag만으로는 한계가 있다. "Marketing 팀이 이번 달 얼마 썼나"를 정확히 보려면 계정별로 분리하는 게 훨씬 명확하다. AWS Organizations + Consolidated Billing이 이 기반을 제공한다.

### 이유 4: 컴플라이언스 요구

PCI-DSS, HIPAA, FedRAMP 같은 규제는 "production 워크로드를 다른 환경과 격리"를 요구한다. IAM 분리만으로는 감사관을 만족시키기 어렵고, 별도 계정이 가장 확실한 격리.

### 이유 5: IAM 정책의 한계

IAM 정책은 복잡한 cross-team 권한을 표현하기 어렵다. 계정 자체를 boundary로 쓰면 "이 계정에 들어갈 수 있는 사람"이라는 단순한 모델로 권한 관리.

> 💡 **관련 이론**: 멀티 계정 전략의 본질은 **bulkhead pattern**(격벽 패턴)이다. Resilience4j 라이브러리에서 유명해진 이 패턴은 한 컴포넌트의 장애가 다른 컴포넌트로 전파되지 않게 격리하는 것. 배의 격벽처럼, 한 칸이 침수돼도 다른 칸은 살아남는다. AWS 계정은 그 클라우드 인프라 버전이다.

## AWS Organizations — 멀티 계정의 토대

AWS Organizations(2017 출시)는 여러 AWS 계정을 단일 entity로 관리하는 서비스. 핵심 구성요소:

| 요소 | 의미 |
|------|------|
| **Management Account** | 조직의 루트 계정. Organizations 자체 관리. |
| **Member Account** | 조직에 속한 일반 계정 |
| **OU (Organizational Unit)** | 계정을 묶는 그룹. 트리 구조 (depth 5까지) |
| **SCP (Service Control Policy)** | OU/계정에 적용하는 권한 가드레일 (deny-only) |
| **Consolidated Billing** | 모든 멤버 계정 청구를 management 계정으로 집계 |

### 일반적인 OU 구조 (AWS 권장 모델)

```
Root
├── Security OU
│   ├── Log Archive Account (CloudTrail, Config 로그 집중)
│   └── Security Tooling Account (GuardDuty, Security Hub 관리자)
├── Infrastructure OU
│   ├── Network Account (Transit Gateway, Direct Connect)
│   └── Shared Services Account (DNS, AD, CI/CD)
├── Workloads OU
│   ├── Prod OU
│   │   ├── Prod-App-A Account
│   │   └── Prod-App-B Account
│   ├── Non-Prod OU
│   │   ├── Staging Account
│   │   └── Dev Account
└── Sandbox OU (개인 실험용)
```

이 구조가 AWS 권장 best practice다. 시험에서 "어느 계정에 무엇을 둬야 하나" 시나리오가 나오면 이 패턴을 기준으로 답.

> 🔍 **더 깊이**: SCP는 **deny에만 효력**이 있는 정책이다. SCP가 `Allow`라고 적어둬도 그것만으로 권한이 부여되는 게 아니라, IAM 정책으로 권한이 있을 때 SCP가 그것을 "허용"한다는 의미. SCP의 진짜 힘은 `Deny`다. 예를 들어 `Deny ec2:RunInstances if region != ap-northeast-2`는 그 OU의 어느 계정에서도 서울 외 리전에서 EC2를 못 만들게 강제한다. IAM 권한이 아무리 넓어도 SCP가 막으면 못 한다.

### SCP의 평가 순서

AWS의 권한 평가는 다음 순서로 일어난다:
1. **명시적 Deny** (어디든 deny면 즉시 거부)
2. **SCP** (조직 정책 위반이면 거부)
3. **Permission Boundary** (있다면 boundary 위반이면 거부)
4. **Session Policy** (AssumeRole 시 추가 정책)
5. **Resource-based Policy** (S3 bucket policy 등)
6. **Identity-based Policy** (IAM user/role policy)

이 중 어디든 명시적 Deny가 있으면 거부, 모두 통과하고 어딘가 Allow가 있어야 허용.

> ⚠️ **함정**: "SCP로 Allow 정책을 만들었는데도 안 된다"는 흔한 혼란이 있다. SCP는 **guardrail이지 permission grant가 아니다**. SCP가 Allow라고 적어도 IAM에서 별도로 권한을 부여해야 한다. 시험에서 "SCP만으로 권한 부여" 같은 보기는 함정.

## Control Tower — Organizations의 자동화 wrapper

AWS Control Tower(2019 출시)는 Organizations + IAM Identity Center + Config + CloudTrail + ...를 한 번에 셋업해주는 landing zone 서비스다. "처음부터 best practice OU 구조로 시작"하고 싶을 때 쓴다.

| 기능 | 설명 |
|------|------|
| **Landing Zone** | 표준 OU 구조 + 보안 계정 자동 생성 |
| **Account Factory** | 새 계정 셀프 서비스 생성 (Service Catalog 기반) |
| **Guardrails** | preventive(SCP) + detective(Config Rule) 자동 적용 |
| **Customizations for Control Tower (CfCT)** | CloudFormation으로 추가 커스텀 |

Control Tower의 핵심 trade-off:
- **장점**: 표준 구조를 빠르게 셋업, 신규 계정 자동 거버넌스
- **단점**: 이미 운영 중인 Organizations를 마이그레이션하기 어려움, 일부 리전만 지원

> 📚 **사례**: 한 대기업이 50개의 기존 AWS 계정을 Control Tower로 통합하려다 6개월간 작업한 사례. 기존 SCP, CloudTrail trail, IAM 정책이 Control Tower의 표준과 충돌해 마이그레이션이 매우 복잡했다. 교훈: **이미 멀티 계정이 운영 중이라면 Control Tower 도입 결정 전에 PoC 필수**. 신규 도입이면 Control Tower로 시작하는 게 훨씬 빠르다.

### Landing Zone의 핵심 구성

Control Tower가 자동 생성하는 계정:
- **Management Account** (Organizations 루트)
- **Log Archive Account** (모든 계정의 CloudTrail + Config 로그 중앙 저장)
- **Audit Account** (Security Hub, GuardDuty 관리자 + 감사 도구)

그리고 OU 구조:
- **Security OU** (Log Archive + Audit)
- **Sandbox OU** (개인 실험)
- 추가 OU는 Account Factory로 자유롭게 생성

### Guardrails

Control Tower의 guardrail은 두 종류:
1. **Preventive** (SCP 기반) — 동작을 막음. 예: "Log Archive 계정의 CloudTrail 삭제 금지"
2. **Detective** (Config Rule 기반) — 위반 감지하고 알림. 예: "S3 bucket이 public 되면 알림"

각 guardrail은 mandatory(필수), strongly recommended, elective로 분류. 새 계정은 mandatory guardrail이 자동 적용.

> 🔍 **더 깊이**: Preventive와 Detective의 trade-off는 "**자동화 가능성 vs 부작용**"이다. Preventive(SCP)는 동작 자체를 막아 사고 예방이 확실하지만, 잘못 만들면 정상 업무까지 막아버린다(예: 모든 root login 차단인데 emergency access도 막힘). Detective는 사고 후 감지라 부작용이 적지만 사고가 이미 발생한 뒤. 실무에서는 critical은 Preventive, 모니터링성은 Detective.

## IAM Identity Center — 멀티 계정 SSO의 결정판

이전 이름이 AWS Single Sign-On(SSO)이었고 2022년에 IAM Identity Center로 변경됐다. 핵심 기능은 "**한 번 로그인으로 모든 멀티 계정 접근**".

### 작동 원리

```
[ IAM Identity Center 흐름 ]

User → Identity Provider (Okta/AzureAD/AWS Directory)
         |
         ↓ SAML/SCIM
       IAM Identity Center (조직 management 계정에 설치)
         |
         ↓ AssumeRole (자동)
       Member Account의 Permission Set Role
```

- **Permission Set**: 한 role + 정책 집합. 예: "AdminAccess", "ReadOnlyAccess", "BillingAccess"
- **User/Group**: Identity Provider에서 가져옴 (SCIM으로 동기화)
- **Account Assignment**: 어느 user가 어느 account에 어느 permission set으로 들어갈 수 있나

사용자 입장에서는 https://<your-org>.awsapps.com/start 에 로그인하면 자신이 접근 가능한 모든 계정+role 카드가 보이고, 클릭하면 그 계정 콘솔로 들어간다. CLI는 `aws sso login`으로 토큰을 받는다.

> 💡 **관련 이론**: IAM Identity Center는 본질적으로 **AssumeRole 자동화**다. 사용자가 카드를 클릭하면 IAM Identity Center가 STS AssumeRole을 호출해 임시 자격증명을 받고 그것으로 콘솔/CLI를 띄운다. 모든 자격증명이 임시(보통 1시간 ~ 12시간)라서 정적 IAM 사용자보다 훨씬 안전.

### IAM User vs IAM Identity Center

| 차원 | IAM User (전통) | IAM Identity Center |
|------|----------------|---------------------|
| 자격증명 | 정적 access key | 임시 STS |
| 멀티 계정 | 계정별 별도 user | 단일 user로 모든 계정 |
| 외부 IdP 통합 | SAML federated user | SCIM + SAML 자동 |
| 비밀번호 회전 | 사용자 책임 | IdP 정책 따름 |
| 시험 빈도 | 점점 줄어듦 | 점점 늘어남 |

AWS는 명시적으로 "**신규 워크로드는 IAM Identity Center 사용**"을 권장한다. 시험에서 "멀티 계정 + SSO" 시나리오는 거의 다 IAM Identity Center가 답.

> ⚠️ **함정**: "IAM Identity Center가 있으면 IAM은 더 이상 안 써도 된다"는 오해. 사람 사용자는 IAM Identity Center로 가지만, **machine principal(EC2, Lambda, ECS task)은 여전히 IAM Role**을 사용한다. IAM은 사라지지 않는다.

## Cross-Account 패턴 — 시험에서 가장 자주 묻는 것

멀티 계정의 핵심은 "**한 계정에서 다른 계정의 자원에 어떻게 접근하나**". 패턴은 3가지.

### 패턴 1: STS AssumeRole (가장 흔함)

```
[ Cross-Account AssumeRole ]

Account A (CI/CD)              Account B (Prod)
  IAM User/Role  ──AssumeRole──→  CrossAccountRole
   (sts:AssumeRole)                (trust policy: Account A)
                                   (permission: ECS deploy)
```

Account B의 role이 trust policy에 "Account A의 ARN을 신뢰"라고 명시. Account A의 principal이 `sts:AssumeRole`로 임시 자격증명을 받아 Account B 자원에 접근.

```yaml
# Account B의 cross-account role trust policy 예시
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::ACCOUNT_A_ID:role/CICDPipelineRole"},
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {"sts:ExternalId": "unique-secret-id"}
    }
  }]
}
```

`ExternalId`는 confused deputy 문제 방지용. 외부 SaaS와 통합할 때 특히 중요(예: Datadog, PagerDuty가 우리 계정에 들어올 때).

> 💡 **관련 이론**: Confused deputy problem은 1988년 Norm Hardy가 발견한 보안 문제. "권한 있는 deputy가 권한 없는 주체의 요청을 자기 권한으로 수행"하는 취약점. AWS에서는 SaaS 통합 시 SaaS의 AWS 계정이 deputy가 되어 우리 자원에 접근하는데, 다른 고객이 같은 SaaS를 통해 우리 자원에 접근하지 못하게 `ExternalId`로 격리.

### 패턴 2: Resource-based Policy (S3 bucket policy, SNS, KMS 등)

S3 bucket이나 SNS topic, KMS key는 자원 자체에 policy를 붙일 수 있다. 다른 계정의 principal을 명시적으로 허용.

```json
// S3 bucket policy 예시 (Account B의 bucket이 Account A의 access 허용)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::ACCOUNT_A_ID:root"},
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": "arn:aws:s3:::shared-bucket/*"
  }]
}
```

AssumeRole 없이도 cross-account 접근 가능. 다만 S3, SNS, SQS, KMS, Lambda 등 일부 서비스만 지원.

### 패턴 3: RAM (Resource Access Manager)

VPC, Subnet, Transit Gateway, License Manager 등 일부 자원은 RAM으로 다른 계정과 공유 가능. 시험에서는 "Transit Gateway를 여러 계정이 공유" 시나리오에 자주 등장.

## CloudTrail Organization Trail — 모든 계정 감사를 한 곳에

CloudTrail은 기본적으로 계정별인데, **Organization Trail**을 사용하면 management 계정에서 한 번에 모든 멤버 계정의 API 호출을 캡처해 한 S3 bucket에 저장한다. Log Archive 계정이 이 bucket의 owner.

```
[ Organization Trail 흐름 ]

All Member Accounts → CloudTrail Events → Organization Trail → 
  → Log Archive Account의 S3 Bucket (immutable, MFA delete)
  → CloudWatch Logs (선택)
  → EventBridge (선택)
```

이 구조의 핵심:
1. **단일 진실의 원천**: 모든 계정의 API 호출이 한 곳에
2. **변조 방지**: Log Archive 계정 외에는 누구도 로그 삭제 못 함 (SCP로 강제)
3. **검색 효율**: Athena로 한 번 쿼리로 전 조직 감사

> 📚 **사례**: 한 회사가 내부 감사 중 "지난 3개월간 누가 prod IAM policy를 변경했나"를 조사했는데, 멤버 계정별 CloudTrail이 따로따로 저장되어 있어 30개 계정의 로그를 수동으로 모으느라 일주일이 걸렸다. Organization Trail + Log Archive 계정으로 전환 후 같은 쿼리가 Athena로 10분만에 끝났다.

## 멀티 계정 CI/CD 패턴 — 시험의 핵심 시나리오

가장 흔한 멀티 계정 CI/CD 토폴로지:

```
[ Hub-Spoke 모델 ]

Shared Services Account (Hub)
  - CodeCommit / GitHub
  - CodeBuild
  - CodePipeline (orchestrator)
  - ECR (shared image registry)
  - S3 (artifact bucket, KMS encrypted)
        |
        ├─AssumeRole──→ Dev Account (Spoke)
        │                  - ECS/Lambda 배포 대상
        │                  - CrossAccountDeployRole
        |
        ├─AssumeRole──→ Staging Account
        │                  - 같은 패턴
        |
        └─AssumeRole──→ Prod Account
                           - 수동 승인 후 배포
                           - CrossAccountDeployRole (제한적)
```

핵심 보안 원칙:
1. **Pipeline은 한 곳에**: 여러 곳에 흩어진 pipeline은 일관성 깨짐
2. **배포 권한은 cross-account role**: Spoke 계정이 Hub의 pipeline role을 신뢰
3. **KMS 키 공유**: Artifact S3 bucket의 KMS 키를 spoke 계정과 공유 (key policy)
4. **로그 중앙 집중**: 모든 배포 로그는 Log Archive 계정

> 🎯 **시나리오**: "회사가 dev/staging/prod 별도 계정을 운영하는데, CodePipeline은 어디에 둬야 하나" 라는 시험 질문이 자주 나온다. 답은 "**별도 Shared Services 계정에 두고 각 환경 계정에 AssumeRole로 배포**". prod 계정 안에 prod 전용 pipeline을 두면 ① prod 계정 권한이 너무 강해짐 ② 환경 간 일관성 깨짐 ③ 변경 관리 분산. Hub-Spoke가 표준.

## SCP의 실전 패턴

자주 쓰이는 SCP 예시:

```json
// 1. 특정 리전에서만 작업 허용
{
  "Effect": "Deny",
  "NotAction": [
    "iam:*", "organizations:*", "cloudfront:*", "route53:*",
    "s3:ListAllMyBuckets", "support:*"
  ],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {"aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]}
  }
}

// 2. root 사용자 사용 차단 (emergency 외)
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "StringLike": {"aws:PrincipalArn": "arn:aws:iam::*:root"}
  }
}

// 3. CloudTrail 비활성화 금지
{
  "Effect": "Deny",
  "Action": [
    "cloudtrail:StopLogging",
    "cloudtrail:DeleteTrail",
    "cloudtrail:UpdateTrail"
  ],
  "Resource": "*"
}
```

> ⚠️ **함정**: SCP 1번 예시에서 `NotAction`으로 글로벌 서비스(IAM, CloudFront, Route 53)를 제외하는 게 핵심이다. 이걸 안 빼면 그 계정에서 IAM조차 못 만들어 운영 불가능 상태가 된다. 시험 보기에서 "글로벌 서비스 제외 없이 region 제한"은 함정.

## CLI로 보는 Organizations

```bash
# 조직의 모든 계정 나열
aws organizations list-accounts --output table

# 특정 OU 안의 계정
aws organizations list-accounts-for-parent --parent-id ou-xxxx-yyyyyyyy

# SCP 정책 적용 현황
aws organizations list-policies-for-target \
  --target-id ou-xxxx-yyyyyyyy \
  --filter SERVICE_CONTROL_POLICY

# 신규 계정 자동 생성
aws organizations create-account \
  --email new-team@example.com \
  --account-name "TeamA-Dev"
# 비동기: CreateAccountRequestId 반환 → describe-create-account-status로 폴링
```

신규 계정 생성은 비동기이고 보통 5-10분 소요. 그동안 Control Tower의 Account Factory가 baseline 적용을 진행한다.

## 정리하며

오늘 본 그림 세 가지를 기억하자. 첫째, **멀티 계정은 표준**이다. Blast radius 격리, quota 분리, 컴플라이언스 요구가 그 정당화 근거. 둘째, **Organizations + Control Tower가 토대**다. 표준 OU 구조 + Landing zone + Guardrails. 셋째, **IAM Identity Center가 인증/인가의 결정판**이고 cross-account 자원 접근은 STS AssumeRole + Resource policy + RAM 세 패턴으로 해결.

다음 글은 Week 1의 마무리로, 시나리오 문제 10개를 통해 첫 주의 내용을 통합적으로 점검한다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 dev, staging, prod 환경을 단일 AWS 계정에서 운영하다가 멀티 계정으로 전환하려 한다. 가장 본질적인 이유는?

A) AWS 추천이기 때문
B) Blast radius 격리, service quota 분리, IAM 정책의 한계 극복, 컴플라이언스 요구
C) 비용 절감
D) 성능 향상

**정답: B**
해설: 멀티 계정의 본질적 가치는 ① Blast radius 격리(실수 시 영향 범위 최소화) ② Service Quota 분리(계정별 limit) ③ IAM 한계 극복(복잡한 권한 표현이 어려움) ④ 컴플라이언스(PCI-DSS, HIPAA 격리 요구). C는 오히려 멀티 계정이 약간 비용 증가 가능(NAT, Transit Gateway 등 공유 자원), D는 성능과 무관.

---

**문제 2.** SCP가 IAM 정책과 다른 본질적 특성은?

A) SCP는 IAM보다 우선순위가 낮다
B) SCP는 deny에만 효력이 있는 가드레일이고, 권한을 부여하지 않는다
C) SCP는 사용자별로만 적용 가능
D) SCP는 cross-account 권한 부여 수단이다

**정답: B**
해설: SCP는 **guardrail**이지 permission grant가 아니다. SCP에 `Allow`라고 적어도 IAM에서 별도로 권한을 부여해야 한다. SCP의 진짜 힘은 `Deny` — IAM이 허용해도 SCP가 Deny면 막힌다. A는 반대(SCP는 IAM보다 먼저 평가), C는 잘못된 사실(OU/계정 단위), D는 잘못(cross-account는 STS AssumeRole + trust policy).

---

**문제 3.** 한 회사가 multi-account CI/CD를 구축하려 한다. Pipeline을 어디에 두어야 하는가?

A) 각 환경 계정(dev/staging/prod)에 별도 pipeline
B) prod 계정에 모든 pipeline 두고 다른 계정으로 배포
C) 별도 Shared Services 계정에 pipeline 두고 각 환경 계정에 cross-account role로 배포
D) 모든 환경 계정의 pipeline을 union으로 통합

**정답: C**
해설: Hub-Spoke 모델이 표준이다. Shared Services 계정(Hub)에 pipeline을 두고, 각 환경 계정(Spoke)이 cross-account deploy role을 제공해 hub가 AssumeRole로 배포. 이유: ① 일관성(한 곳에서 관리) ② 보안(prod 계정 권한 최소화) ③ 변경 관리 집중. A는 일관성 깨짐, B는 prod 계정 권한이 너무 강해지는 문제, D는 의미 불명.

---

**문제 4.** Cross-account 자원 접근을 위한 3가지 메커니즘 중 RAM(Resource Access Manager)이 가장 적합한 시나리오는?

A) S3 bucket 공유
B) Transit Gateway, VPC Subnet 같은 네트워크 자원 공유
C) IAM Role 공유
D) Lambda 함수 공유

**정답: B**
해설: RAM의 주 용도는 **네트워크/공유 인프라 자원** — Transit Gateway, VPC Subnet, License Manager, Route 53 Resolver, Glue Catalog 등. S3는 bucket policy로 해결, IAM Role은 trust policy로, Lambda는 resource policy로. 시험에서 "Transit Gateway를 여러 계정이 공유" 시나리오는 거의 다 RAM이 답.

---

**문제 5.** Organization Trail의 본질적 장점은?

A) 비용 절감
B) 모든 멤버 계정의 CloudTrail 이벤트를 한 S3 bucket에 중앙 저장, 단일 진실의 원천 + 변조 방지
C) 더 빠른 API 호출
D) Region 간 자동 복제

**정답: B**
해설: Organization Trail은 management 계정에서 단일 trail로 모든 멤버 계정의 API 호출을 캡처해 Log Archive 계정의 S3 bucket에 저장. SCP로 그 bucket의 변조를 막아 audit trail의 무결성 보장. 멤버 계정의 누구도 자기 trail을 끄거나 삭제할 수 없다(SCP로 막혀 있음). 시험에서 "tamper-proof audit" 키워드는 거의 다 이 패턴.

---

**문제 6.** ExternalId가 cross-account role의 trust policy에 들어가는 이유는?

A) 빠른 인증
B) Confused deputy 문제 방지 — 같은 SaaS를 쓰는 다른 고객이 우리 자원에 접근하지 못하게 격리
C) IAM 비용 절감
D) MFA 강제

**정답: B**
해설: SaaS(Datadog, PagerDuty 등)가 여러 고객의 AWS 계정에 cross-account로 접근할 때, 같은 SaaS AWS 계정이 모든 고객의 deputy가 된다. 한 고객의 ExternalId를 다른 고객 role의 trust policy에 넣으면 잘못된 접근이 가능. ExternalId는 그 고객만 알도록 secret으로 발급. 1988년 Norm Hardy의 confused deputy paper에서 유래. 시험에서 "third-party SaaS integration security" 키워드는 ExternalId.

---

**문제 7.** Control Tower의 Landing Zone에서 자동 생성되는 계정 3개는?

A) Management, Dev, Prod
B) Management, Log Archive, Audit
C) Management, Backup, DR
D) Management, Network, Security

**정답: B**
해설: Landing Zone의 3가지 표준 계정 — ① **Management** (Organizations root) ② **Log Archive** (CloudTrail + Config 로그 집중) ③ **Audit** (Security Hub, GuardDuty 관리자). 이 3개가 보안 기반. 추가 계정은 Account Factory로 별도 생성. A의 Dev/Prod는 Workload OU에 들어가지 Landing Zone 기본 계정이 아님.

---

**문제 8.** 한 회사가 SCP로 "ap-northeast-2 외 리전에서 모든 AWS 작업 차단"을 적용했더니, IAM 사용자가 콘솔에서 IAM 정책을 만들지 못하는 문제가 발생했다. 원인은?

A) SCP 우선순위 문제
B) SCP의 Deny가 글로벌 서비스(IAM, CloudFront, Route 53)까지 차단했기 때문
C) Control Tower 충돌
D) MFA 필요

**정답: B**
해설: IAM, Route 53, CloudFront는 **글로벌 서비스**이고 region 개념이 없다. SCP에서 region restriction을 적용할 때 글로벌 서비스를 `NotAction`으로 제외하지 않으면 IAM 작업까지 막힌다. 올바른 패턴은 `NotAction: ["iam:*", "organizations:*", "cloudfront:*", "route53:*", "support:*", "s3:ListAllMyBuckets"]`. 시험에서 SCP의 함정으로 자주 나옴.
