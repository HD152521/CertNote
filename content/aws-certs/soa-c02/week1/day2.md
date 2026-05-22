# Day 2 - IAM 기초 (사용자, 그룹, 역할, 정책 평가 로직)

📅 날짜: Week 1 (Day 2)
🎯 주제: IAM의 4대 구성요소와 정책 평가 로직 마스터
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- IAM 사용자/그룹/역할/정책의 차이를 명확히 이해한다
- AWS의 정책 평가 알고리즘(Explicit Deny → Allow → Default Deny)을 익힌다
- 운영자 입장에서 최소 권한 원칙을 정책으로 표현할 수 있다

---

## 🧩 사전 지식 (CS 기초)

- **AAA (Authentication / Authorization / Accounting)**: 사용자가 누구인지(인증), 무엇을 할 수 있는지(인가), 무엇을 했는지(감사)
- **RBAC vs ABAC**: Role-Based Access Control(역할 기반) vs Attribute-Based Access Control(속성 기반). IAM은 둘 다 지원 (Condition + Tag 사용 시 ABAC)
- **Principle of Least Privilege**: 작업 수행에 필요한 최소 권한만 부여
- **Identity vs Resource policy**: 누구에게 권한을 붙이느냐(사용자/역할) vs 무엇에 권한을 붙이느냐(S3 버킷, KMS 키)
- **JSON 정책 문법**: Statement, Effect, Action, Resource, Condition. AWS는 JSON으로 권한을 표현

---

## 📖 이론 내용

### 1. IAM의 4대 구성요소

#### 사용자 (User)
- 개인이나 애플리케이션에 발급되는 영구 자격 증명
- Access Key (CLI/SDK 용) + Console 비밀번호 + MFA 설정 가능
- **운영 모범 사례**: 실제 사람에게만 발급, 서비스/EC2엔 IAM Role 사용

#### 그룹 (Group)
- 사용자 모음. 그룹에 정책 부여 → 소속 사용자 모두 권한 상속
- **그룹 안에 그룹은 불가능** (시험 함정)
- 사용자는 최대 10개 그룹 소속 가능

#### 역할 (Role)
- 임시 자격 증명을 발급받기 위한 "신원"
- AWS 서비스(EC2, Lambda), 다른 AWS 계정, 외부 IdP(SAML/OIDC)가 Assume
- STS(Security Token Service)가 1시간~12시간 유효 토큰 발급
- **CloudOps 운영자가 가장 많이 만지는 IAM 객체**

#### 정책 (Policy)
- 권한 명세서. JSON 문서로 표현
- 종류:
  - **Identity-based**: User/Group/Role에 붙임
  - **Resource-based**: S3 버킷, KMS 키, SNS Topic 등에 붙임 (Principal 필수)
  - **Permission Boundary**: 사용자/역할에 부여 가능한 권한 최대치
  - **SCP (Service Control Policy)**: Organizations에서 OU/계정 단위 가드레일
  - **Session Policy**: AssumeRole 시 일시적 권한 축소

### 2. 정책 JSON 구조

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowReadS3Logs",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-log-bucket",
        "arn:aws:s3:::my-log-bucket/*"
      ],
      "Condition": {
        "IpAddress": { "aws:SourceIp": "203.0.113.0/24" },
        "Bool": { "aws:MultiFactorAuthPresent": "true" }
      }
    }
  ]
}
```

각 필드의 의미:
- **Sid**: 사람이 읽는 식별자 (선택)
- **Effect**: `Allow` 또는 `Deny`
- **Action**: 허용/거부할 API 액션 (`service:Action` 형식)
- **Resource**: 적용 대상 ARN (`*`은 전체)
- **Condition**: 조건 (IP, MFA, 태그, 날짜·시간 등)
- **Principal**: Resource-based 정책에서 "누가" (Identity-based엔 불필요)

### 3. 정책 평가 로직 (⭐ 시험 매우 빈출)

AWS는 요청을 받으면 다음 순서로 평가합니다:

```
1. 기본값: 모두 Deny
2. Organizations SCP 확인 → 명시적 Deny 있으면 즉시 거부
3. Resource-based 정책에 Allow 있는지 확인
4. Identity-based 정책에 Allow 있는지 확인
5. Permission Boundary와 Session Policy의 교집합 적용
6. 어디서든 Explicit Deny가 있으면 → 거부 (최우선)
7. 어디에도 Allow가 없으면 → 거부 (Default Deny)
```

**핵심 규칙:**
- **Explicit Deny > Explicit Allow > Default Deny**
- SCP, Permission Boundary, Identity Policy 중 **하나라도 Deny면 차단**
- **모두에 Allow가 있어야 허용** (교집합)

### 4. IAM Role - 운영자가 반드시 알아야 할 패턴

#### EC2 Instance Profile
```
EC2 → IMDS(Instance Metadata Service) v2 → 임시 자격 증명 자동 발급
→ EC2 위 앱이 S3 / DynamoDB 등 호출 가능
```
- **장점**: Access Key를 코드/EC2에 박지 않아도 됨 → 보안 강화
- 운영 점검 포인트: IMDSv2 강제 적용 (`HttpTokens=required`)

#### Cross-Account Role
```
Account A (운영 계정)         Account B (감사 계정)
  Role: AuditRole       ←   감사자가 AssumeRole
   Trust Policy: B 신뢰
   Permission: ReadOnly
```
- ExternalId 사용 시 "Confused Deputy" 공격 방지

#### Service-Linked Role (SLR)
- AWS 서비스가 자기 작업을 위해 자동 생성하는 역할
- 예: AWS Config가 만드는 `AWSServiceRoleForConfig`
- **삭제 시 주의**: 해당 서비스가 작동 안 함

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **AWS Managed Policy** | AWS 제공 (예: `AdministratorAccess`) | 즉시 사용 가능, 수정 불가 |
| **Customer Managed Policy** | 고객 직접 작성 | 재사용 가능, 버전 관리 |
| **Inline Policy** | 특정 User/Role에 직접 인라인 | 1:1 매핑, 재사용 X |
| **NotAction / NotResource** | "이것만 빼고 전부" 표현 | 위험, 광범위한 권한 부여 위험 |
| **IAM Access Analyzer** | 정책의 의도치 않은 외부 공유 탐지 | Week 9에서 자세히 |
| **iam:PassRole** | 다른 서비스에 Role을 넘길 때 필요 | Lambda 생성 시 자주 누락 |

> ⚠️ **함정 1**: `s3:*` 같은 와일드카드는 시험에서 거의 항상 오답. 최소 권한 원칙 위배.
>
> ⚠️ **함정 2**: SCP는 권한을 "허용"하지 않음 — 권한의 "가드레일(상한)"만 설정. SCP에 `Allow s3:*`가 있어도 사용자가 IAM 권한 없으면 못 함.
>
> 💡 **암기 팁**: "Allow는 합집합 X, 교집합 O". SCP + Permission Boundary + Identity Policy 모두에 허용돼야 동작.

### 운영 모범 사례 - 5가지 IAM 체크리스트

1. **루트 계정 절대 일상 사용 금지** → MFA 켜고 잠가둠
2. **모든 사용자에 MFA 강제** (Console 사용자)
3. **Access Key는 90일마다 회전**
4. **EC2/Lambda는 IAM Role 사용** (Access Key 박지 말 것)
5. **IAM Access Analyzer 항상 활성화**

### 관련 서비스 Cross-Reference

- **IAM → Week 1 Day 3** (STS, 권한 경계, 조건부 정책 심화)
- **IAM → Week 4 CloudTrail** (IAM 활동 감사)
- **IAM → Week 9 Access Analyzer** (정책 자동 분석)
- **Role → Week 5 SSM** (Instance Profile, Session Manager IAM)

---

## 🏗️ 아키텍처 다이어그램

```
IAM 정책 평가 흐름
=========================================================

  API 요청 (예: s3:GetObject)
        │
        ▼
  ┌──────────────────────────┐
  │ 1. Organizations SCP     │  ← 명시적 Deny? → 즉시 거부
  └────────┬─────────────────┘
           │
           ▼
  ┌──────────────────────────┐
  │ 2. Resource-based Policy │  ← S3 버킷 정책 등
  └────────┬─────────────────┘
           │
           ▼
  ┌──────────────────────────┐
  │ 3. Identity-based Policy │  ← 사용자/역할에 붙은 정책
  └────────┬─────────────────┘
           │
           ▼
  ┌──────────────────────────┐
  │ 4. Permission Boundary   │  ← User/Role 가드레일
  └────────┬─────────────────┘
           │
           ▼
  ┌──────────────────────────┐
  │ 5. Session Policy        │  ← AssumeRole 시
  └────────┬─────────────────┘
           │
   어디서든 Deny? → 거부
   모두 Allow?   → 허용
   외엔         → Default Deny
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Explicit Deny가 항상 최우선** — Allow가 있어도 Deny 있으면 차단
2. ⭐ **EC2/Lambda는 Access Key X, IAM Role 사용** — 운영 모범 사례
3. ⭐ **SCP는 권한 상한(가드레일)만 설정** — 권한을 "부여"하지 않음
4. ⭐ **MFA 강제 조건**: `aws:MultiFactorAuthPresent` 또는 `aws:MultiFactorAuthAge`
5. ⭐ **그룹 안에 그룹 불가** — 사용자만 그룹에 들어감

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. CloudOps 운영자를 위한 정책 생성 (CloudWatch + EC2 + SSM 읽기)
cat > cloudops-readonly-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:Get*",
        "cloudwatch:List*",
        "cloudwatch:Describe*",
        "logs:Get*",
        "logs:Describe*",
        "logs:FilterLogEvents",
        "ec2:Describe*",
        "ssm:Describe*",
        "ssm:GetParameter*"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "Bool": { "aws:MultiFactorAuthPresent": "false" }
      }
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name CloudOpsReadOnlyMFA \
  --policy-document file://cloudops-readonly-policy.json

# 2. EC2용 Role 생성 (Instance Profile)
cat > ec2-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name EC2-CloudWatch-SSM-Role \
  --assume-role-policy-document file://ec2-trust.json

aws iam attach-role-policy \
  --role-name EC2-CloudWatch-SSM-Role \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy

aws iam attach-role-policy \
  --role-name EC2-CloudWatch-SSM-Role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

# 3. 정책 시뮬레이션 (적용 전 검증)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:user/alice \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::my-prod-bucket/file.txt
```

**시뮬레이션 출력 예시:**
```json
{
  "EvaluationResults": [
    {
      "EvalActionName": "s3:GetObject",
      "EvalResourceName": "arn:aws:s3:::my-prod-bucket/file.txt",
      "EvalDecision": "allowed",
      "MatchedStatements": [...]
    }
  ]
}
```

---

## 📝 연습 문제

**문제 1.** 한 IAM 사용자가 S3 버킷에 접근하지 못한다. 다음 중 가장 적절한 점검 순서는?

A) Identity Policy → Resource Policy → SCP → Permission Boundary
B) SCP → Resource Policy → Identity Policy → Permission Boundary (Explicit Deny 우선 확인)
C) Resource Policy만 확인
D) 그룹 정책만 확인

**정답: B**
해설: Explicit Deny가 어디든 있는지 먼저 확인해야 함. SCP가 최상단 가드레일이므로 먼저, 그 다음 리소스 정책, Identity 정책, Boundary 순. (실무에서는 IAM Policy Simulator나 Access Advisor 활용)

---

**문제 2.** EC2 인스턴스에 있는 애플리케이션이 S3에 접근해야 한다. 보안상 가장 적절한 방법은?

A) Access Key를 EC2 사용자 데이터에 박는다
B) Access Key를 환경 변수로 설정한다
C) IAM Role을 만들어 Instance Profile에 연결한다
D) 루트 계정 자격 증명을 사용한다

**정답: C**
해설: EC2/Lambda 등 AWS 서비스에서는 항상 IAM Role을 사용. 자격 증명이 자동 회전되고 코드/디스크에 박히지 않음. IMDSv2 강제 설정도 같이.

---

**문제 3.** 한 회사가 SCP에 `Deny ec2:RunInstances` 명령을 적용했는데, OU 내 한 사용자가 여전히 EC2를 생성할 수 있다. 가능한 이유는?

A) SCP는 적용에 24시간 걸린다
B) 해당 사용자가 Organizations 관리 계정(Management Account) 소속이다 — SCP는 관리 계정에 미적용
C) Identity Policy에 Allow가 있어서 우회된다
D) Resource Policy가 Allow를 override 한다

**정답: B**
해설: SCP는 Organizations의 **관리 계정(Management Account)에는 적용되지 않음**. 또한 SCP는 즉시 적용. Identity Policy Allow가 SCP Deny를 override할 수도 없음.

---

**문제 4.** 다음 정책 중 "MFA를 사용한 경우에만 S3 삭제 허용"을 정확히 표현한 것은?

A) `"Effect": "Allow", "Action": "s3:Delete*", "Condition": { "Bool": { "aws:MultiFactorAuthPresent": "true" } }`
B) `"Effect": "Deny", "Action": "s3:Delete*", "Condition": { "Bool": { "aws:MultiFactorAuthPresent": "true" } }`
C) `"Effect": "Allow", "Action": "s3:Delete*", "Condition": { "Null": { "aws:MultiFactorAuthAge": "true" } }`
D) `"Effect": "Allow", "Action": "s3:Delete*"` (조건 불필요)

**정답: A**
해설: `aws:MultiFactorAuthPresent`가 true일 때만 Allow. C의 `Null` 조건은 MFA 인증이 **없을 때** true가 되므로 반대 의미.

---

**문제 5.** IAM Role의 Trust Policy와 Permission Policy의 차이는?

A) Trust Policy는 누가 이 Role을 Assume할 수 있는지, Permission Policy는 Role이 무엇을 할 수 있는지를 정의
B) 둘 다 같은 것, 이름만 다름
C) Trust Policy는 권한, Permission Policy는 신원
D) Trust Policy는 사용자에게, Permission Policy는 그룹에게 붙는다

**정답: A**
해설: Trust Policy = "who can assume me?" (Principal 명시). Permission Policy = "what can I do?" (Action/Resource 명시). 두 정책이 모두 있어야 Role이 작동.

---

## 📌 오늘의 요약

1. IAM 4대 객체: 사용자(영구), 그룹(권한 묶음), 역할(임시), 정책(JSON 권한 명세)
2. 정책 평가: Explicit Deny > Allow > Default Deny. 모든 정책 레이어가 교집합으로 허용해야 통과
3. EC2/Lambda는 **Access Key 대신 IAM Role** 사용 — 운영 보안 모범 사례
4. SCP는 권한 **상한(가드레일)**만 정함. 권한을 부여하지는 않음. 관리 계정엔 미적용
5. `iam:PassRole`은 다른 AWS 서비스에 Role을 넘길 때 필요 — Lambda·CodeBuild·CloudFormation 등에서 자주 누락
