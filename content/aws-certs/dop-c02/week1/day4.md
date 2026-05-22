# Day 4 - 멀티 계정 전략, AWS Organizations, Control Tower

📅 날짜: Week 1 (Day 4)
🎯 주제: 엔터프라이즈 멀티 계정 거버넌스 — DevOps 파이프라인의 토대
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 멀티 계정 전략의 필요성과 표준 OU 구조를 이해한다
- AWS Organizations, SCP, Control Tower의 역할 분담을 안다
- 멀티 계정 환경에서 CI/CD 파이프라인을 어떻게 설계하는지 큰 그림을 잡는다
- Landing Zone, IAM Identity Center, AFT(Account Factory for Terraform) 흐름을 안다

---

## 🧩 사전 지식 (CS 기초)

- **Tenancy(테넌시)**: 사용자가 리소스를 어떻게 분리하는가. 단일 계정(soft isolation) vs 멀티 계정(hard isolation).
- **Blast Radius**: 사고 발생 시 영향 범위. 계정 분리로 폭발 반경을 좁힘.
- **Least Privilege**: 최소 권한 원칙. 계정 분리는 이 원칙의 자연스러운 확장.
- **Service Control Policy(SCP)**: Organizations 수준의 권한 가드레일. **허용이 아니라 거부 한계**.
- **OU(Organizational Unit)**: 계정을 묶는 폴더. SCP·태그 정책 적용 단위.
- **Landing Zone**: 다중 계정 운영을 위한 표준 베이스라인(VPC, IAM, 로그 집계 등).

---

## 📖 이론 내용

### 1. 왜 멀티 계정인가?

| 이유 | 설명 |
|------|------|
| 보안 격리 | 한 계정 침해가 다른 계정에 미치는 영향 차단 |
| 청구 분리 | 환경/팀/제품별 비용 가시성 |
| 한도(Quota) 분리 | 계정별 서비스 제한이 격리됨 (EC2, Lambda 등) |
| 규제 준수 | PCI/HIPAA 워크로드를 별도 계정에 격리 |
| 폭발 반경 축소 | IAM 정책 실수·코드 사고의 영향 차단 |
| 환경 분리 | dev/staging/prod 강제 분리 |

> 💡 시험에서 "단일 계정으로 모든 환경 관리"가 답이면 거의 함정.

### 2. AWS Organizations

- 마스터 = **Management Account**(관리 계정)
- 자식 = **Member Accounts**(멤버 계정)
- **OU**: 계정 그룹핑 + SCP 적용 단위
- **Consolidated Billing**: 합산 청구 + Volume Discount 공유
- **All Features**: 일반 모드(IAM Identity Center, CloudFormation StackSets 등 활성화)
- **Consolidated Billing Only**: 청구만 합산하는 모드 (기능 제한)

#### SCP의 핵심 규칙

- SCP는 **허용을 부여하지 않음** — 가드레일(최대 권한)을 정의
- 멤버 계정의 모든 IAM은 SCP의 교집합 안에서만 동작
- **Management Account에는 SCP 미적용** (큰 함정)
- Deny 정책 우선
- 일반적 사용 패턴: "Root 사용자 차단", "특정 리전 외 사용 금지", "특정 서비스 금지(예: 가상 화폐 마이닝 가능 서비스)"

### 3. AWS Control Tower

Organizations + Identity Center + Config + CloudTrail + S3 로그 집계를 **Landing Zone 패턴으로 자동화**하는 서비스.

**구성 요소:**
- **Landing Zone**: 베이스라인 다중 계정 환경
- **Account Factory**: 새 계정 자동 프로비저닝 (Service Catalog 기반)
- **Guardrails**: 사전 정의된 SCP/Config Rule 묶음 (Preventive/Detective)
- **AFT (Account Factory for Terraform)**: Terraform으로 계정 팩토리 확장

**표준 Landing Zone OU 구조:**
```
Root
├── Security OU
│   ├── Log Archive Account
│   └── Audit Account
├── Sandbox OU
│   └── (개발자 실험 계정들)
├── Workloads OU
│   ├── Dev OU
│   ├── Staging OU
│   └── Production OU
├── Shared Services OU
│   └── Tooling Account (CI/CD)
└── Suspended OU
```

### 4. 멀티 계정 CI/CD 패턴

**Hub-Spoke 패턴:**
- Tooling Account: CodePipeline/CodeBuild/CodeDeploy 중앙 운영
- Spoke Accounts: dev/staging/prod에 배포 대상 리소스
- Cross-Account IAM Role로 Tooling Account가 Spoke에 배포

**핵심 IAM 구성:**
1. Tooling Account의 CodePipeline 서비스 역할이 Spoke 계정의 배포 역할을 `sts:AssumeRole`
2. Spoke 계정의 배포 역할은 CloudFormation/CodeDeploy/ECS 등 호출 권한 보유
3. 아티팩트 S3 버킷에 Spoke 계정 KMS 키 grant 추가
4. CodePipeline V2의 Cross-Account Action 사용

### 5. IAM Identity Center (구 AWS SSO)

- 인적 사용자 페더레이션 표준
- Permission Set을 정의 → OU/계정에 할당
- Active Directory/Okta/Azure AD/Google Workspace 연동
- 단기 자격 증명 (max 12시간)
- CLI 통합: `aws sso login`

> ⚠️ IAM User로 인적 로그인 = 안티패턴. Pro 시험에서 거의 항상 오답.

---

## 🧠 알아두면 좋은 심화 이론

### Service Control Policy 예시

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideKoreaUSE1",
      "Effect": "Deny",
      "NotAction": [
        "iam:*", "organizations:*", "route53:*", "cloudfront:*",
        "support:*", "sts:*", "waf:*", "wellarchitected:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
        }
      }
    },
    {
      "Sid": "DenyRootUser",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:root"
        }
      }
    }
  ]
}
```

> ⚠️ **함정**: 글로벌 서비스(IAM, Route 53)는 region 조건에 안 잡힘 → `NotAction`으로 제외해야 함.

### Control Tower Guardrails 분류

| 종류 | 시점 | 구현 | 예시 |
|------|------|------|------|
| **Preventive** | 변경 시도 차단 | SCP | CloudTrail 비활성화 차단 |
| **Detective** | 사후 탐지 | AWS Config Rules | 암호화되지 않은 S3 탐지 |
| **Proactive** | 배포 전 차단 | CFN Hooks (2022+) | 위반 템플릿 거부 |

### CloudFormation StackSets — 멀티 계정 배포의 표준

- 모든 계정/OU에 동시 배포
- **Self-managed permissions** vs **Service-managed permissions** (Organizations 통합)
- 새 계정이 OU에 추가되면 자동 배포 (Drift도 자동 탐지)
- Permission boundary, Config Rule, IAM Role 같은 베이스라인 배포에 적합

### 새 계정 자동 프로비저닝 흐름

```
ServiceNow/Jira ticket → AFT pipeline → 
  Account Factory creates account →
  Baseline (CloudTrail/Config/VPC/IAM roles) via CFN StackSets →
  Identity Center permission set 자동 할당 →
  알림 → 개발자에게 접근 가능 통보
```

### 관련 서비스 Cross-Reference

- **SCP/OU** → Week 5 (멀티 계정 파이프라인), Week 14 (보안 자동화)
- **StackSets** → Week 8 Day 2
- **Identity Center** → Week 9 (구성 관리)
- **Account Factory** → Week 15 (엔터프라이즈 케이스)

---

## 🏗️ 아키텍처 다이어그램

```
Multi-Account CI/CD Hub-Spoke
==================================================

   +---------------------------+
   |  Management Account       |
   |  Organizations + Control  |
   |  Tower + Identity Center  |
   +-------------+-------------+
                 |
   +-------------+---------------------------+
   |             |             |             |
   v             v             v             v
+-------+   +-------+    +-----------+   +---------+
|Tooling|   |Log    |    |Audit      |   |Workloads|
|Account|   |Archive|    |Account    |   |OU       |
|       |   |Account|    |           |   |         |
| Code  |   | S3    |    | GuardDuty |   | Dev/Stg/|
|Pipeline   | (cross|    | Security  |   | Prod    |
| CodeBuild |  acct |    |  Hub      |   | acct    |
| ECR       |  logs)|    |           |   |         |
+---+---+   +-------+    +-----------+   +----+----+
    |                                         ^
    |       AssumeRole + KMS grant            |
    +-----------------------------------------+
                  (cross-acct deploy)

Identity Center provides SSO into all accounts.
Each account inherits SCPs from its OU.
StackSets distributes baseline IAM/Config Rules.
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **SCP는 허용을 안 줌** — 가드레일(거부 한계)만 정의. Management Account에는 미적용
2. ⭐ **Tooling Account 패턴** — 중앙 CI/CD가 각 Spoke 계정에 AssumeRole로 배포
3. ⭐ **Control Tower = Organizations + Identity Center + Config + Trail + Log Archive 자동화**
4. ⭐ **StackSets**로 멀티 계정 베이스라인 배포, 새 계정 자동 적용
5. ⭐ **Identity Center로 사람 SSO** — IAM User 발급은 함정 답

---

## 💻 실제 예시 - Cross-Account 배포 IAM Role

```bash
# Spoke (Prod) 계정에 배포 역할 생성
aws iam create-role \
  --profile prod-account \
  --role-name CrossAccountDeployRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::111122223333:role/CodePipelineServiceRole"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalTag/Pipeline": "checkout-prod"
        }
      }
    }]
  }'

# Tooling 계정의 CodePipeline이 Spoke 역할을 사용
aws codepipeline update-pipeline \
  --cli-input-json file://pipeline.json
# pipeline.json 안의 deploy action:
#   "roleArn": "arn:aws:iam::444455556666:role/CrossAccountDeployRole"
```

```bash
# StackSets로 모든 OU에 베이스라인 배포
aws cloudformation create-stack-set \
  --stack-set-name BaselineGuardrails \
  --template-url https://s3.amazonaws.com/.../baseline.yml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false

aws cloudformation create-stack-instances \
  --stack-set-name BaselineGuardrails \
  --deployment-targets OrganizationalUnitIds=ou-abc-1111,ou-abc-2222 \
  --regions ap-northeast-2 us-east-1
```

---

## 📝 연습 문제

**문제 1.** SCP에 대한 설명으로 옳은 것은?

A) SCP는 IAM 정책처럼 권한을 부여한다
B) SCP는 멤버 계정의 최대 권한 한계(가드레일)만 정의하며, Management Account에는 적용되지 않는다
C) SCP는 모든 계정의 Root 사용자에게도 무조건 적용된다
D) SCP는 Service Catalog 항목에만 적용된다

**정답: B**
해설: SCP는 거부 가드레일. Management Account에 적용 안 됨 — 이 점이 시험에서 자주 함정.

---

**문제 2.** 새 멤버 계정이 OU에 추가될 때 IAM 베이스라인 역할을 자동 배포하려면?

A) Lambda를 EventBridge로 트리거해 직접 CreateRole 호출
B) CloudFormation StackSets (Service-managed permissions, Auto-deployment) + 대상 OU 지정
C) 수동으로 매번 콘솔에서 생성
D) IAM Identity Center로만 충분하다

**정답: B**
해설: StackSets의 Auto-deployment가 새 계정에 자동 적용. A도 가능하지만 표준 답은 StackSets.

---

**문제 3.** Tooling Account 패턴에서 CodePipeline이 Spoke 계정의 ECS에 배포하려면 필수가 아닌 것은?

A) Spoke 계정의 배포용 IAM Role (Tooling 계정을 신뢰)
B) Spoke 계정의 KMS 키에 Tooling 계정 grant
C) 아티팩트 S3 버킷 정책에 Spoke 계정 액세스 허용
D) Spoke 계정에 별도의 CodePipeline 인스턴스를 추가

**정답: D**
해설: 중앙 Tooling 계정 하나가 여러 Spoke에 배포하는 패턴이므로 Spoke마다 별도 파이프라인 불필요.

---

**문제 4.** Control Tower의 Detective Guardrail은?

A) 정책 위반 IaC 템플릿을 배포 전 차단 (CFN Hooks)
B) IAM CreateUser 시도를 차단 (SCP)
C) AWS Config Rule로 정책 위반을 사후 탐지하고 Security Hub로 알림
D) IAM Identity Center 로그인을 차단

**정답: C**
해설: Detective는 사후 탐지. A는 Proactive, B는 Preventive(SCP).

---

**문제 5.** "인적 사용자가 50명, 5개 계정에 접근해야 한다." 가장 적절한 인증 구성은?

A) 모든 계정에 IAM User 250개 생성
B) IAM Identity Center로 외부 IdP(Okta/AD) 페더레이션 + Permission Set 정의
C) 5개 계정에 동일한 액세스 키 50개 공유
D) Bastion EC2를 통한 SSH 키 공유

**정답: B**
해설: SSO + Permission Set이 표준. 50명 × 5계정 = 250 사용자 수동 관리는 비현실.

---

**문제 6.** SCP만으로는 차단할 수 없는 것은?

A) 특정 리전 사용 금지
B) Root 사용자의 특정 작업
C) Management Account의 사용자 작업
D) IAM User 생성 시도

**정답: C**
해설: SCP는 Management Account에 적용되지 않습니다. 가장 중요한 함정.

---

**문제 7.** 한 회사가 "한 곳의 S3에 모든 계정의 CloudTrail 로그를 집계"하려 한다. 가장 적절한 구성은?

A) Control Tower Landing Zone이 자동 구성하는 Log Archive Account의 중앙 Trail 버킷 사용
B) 매일 Lambda가 각 계정에서 S3 복사
C) 각 계정이 동일 S3 버킷에 직접 쓰기 (정책 일치 없이)
D) CloudWatch Logs에 모든 트레일을 푸시

**정답: A**
해설: Control Tower가 Log Archive 계정 + Organization Trail로 표준 패턴을 자동 제공.

---

## 📌 오늘의 요약

1. 멀티 계정은 보안 격리·청구 분리·한도 분리·폭발 반경 축소의 핵심
2. SCP는 거부 가드레일이며 Management Account에 적용되지 않음
3. Control Tower = Organizations + Identity Center + Config + Trail + Log Archive 자동화
4. Tooling Account가 Spoke에 Cross-Account AssumeRole로 배포하는 Hub-Spoke 패턴이 표준
5. CloudFormation StackSets로 멀티 계정/리전 베이스라인 자동 배포
