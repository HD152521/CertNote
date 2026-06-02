# Day 2 - 멀티 계정 파이프라인 + Cross-Account IAM

📅 날짜: Week 5 (Day 2)
🎯 주제: 엔터프라이즈 Hub-Spoke 파이프라인의 IAM/KMS/S3 구성
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Tooling Account에서 Spoke 계정으로 배포하는 IAM 체인을 정확히 그린다
- Artifact S3 버킷 정책 + KMS Key Policy의 cross-account 패턴
- CloudFormation StackSets와 CodePipeline 통합
- 멀티 리전 + 멀티 계정 파이프라인의 의사결정

---

## 🧩 사전 지식 (CS 기초)

- **AssumeRole Chain**: A → B → C 순차 가정. STS가 임시 자격 발급.
- **Resource Policy vs Identity Policy**: 자원 vs 사용자 측 정책. 양쪽 다 허용 필요.
- **KMS Grant**: 임시 키 사용 권한. Policy 변경 없이 단기간 사용.
- **AWS::AccountId 동적 참조**: CloudFormation 함수.
- **Service-Linked Role**: 서비스가 자동 생성하는 Role.

---

## 📖 이론 내용

### 1. Hub-Spoke 패턴 — 책임 분담

```
Tooling Account (Hub)
├── CodePipeline (orchestrator)
├── CodeBuild (build)
├── ECR (image registry)
├── Artifact S3 Bucket + KMS Key
└── Pipeline Service Role

Dev Spoke Account
├── ECS Service / Lambda
├── CrossAccount Deploy Role (trusts Tooling)
└── Application resources

Staging Spoke Account
├── 동일 구조
└── ...

Prod Spoke Account
├── 동일 구조 + 더 엄격한 SCP/MFA
└── ...
```

### 2. 필수 IAM 구성

**Tooling 계정의 Pipeline Service Role:**
```json
{
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": [
    "arn:aws:iam::DEV-ACCT:role/CrossAccountDeployRole",
    "arn:aws:iam::STG-ACCT:role/CrossAccountDeployRole",
    "arn:aws:iam::PRD-ACCT:role/CrossAccountDeployRole"
  ]
}
```

**Spoke 계정의 CrossAccountDeployRole (Trust Policy):**
```json
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::TOOLING-ACCT:role/CodePipelineServiceRole"},
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": {
      "aws:PrincipalTag/Pipeline": "checkout-pipeline"
    }
  }
}
```

**Spoke 계정의 CrossAccountDeployRole (Permission Policy):**
- ECS / Lambda / CloudFormation 호출 권한
- 필요한 리소스 ARN만으로 제한 (최소 권한)

### 3. Artifact S3 버킷 정책 (Tooling 계정)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSpokeAccountsRead",
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::DEV-ACCT:role/CrossAccountDeployRole",
          "arn:aws:iam::STG-ACCT:role/CrossAccountDeployRole",
          "arn:aws:iam::PRD-ACCT:role/CrossAccountDeployRole"
        ]
      },
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::tooling-artifacts-bucket",
        "arn:aws:s3:::tooling-artifacts-bucket/*"
      ]
    }
  ]
}
```

### 4. KMS Key Policy (Tooling 계정)

```json
{
  "Sid": "AllowSpokeAccountsDecrypt",
  "Effect": "Allow",
  "Principal": {
    "AWS": [
      "arn:aws:iam::DEV-ACCT:role/CrossAccountDeployRole",
      "arn:aws:iam::PRD-ACCT:role/CrossAccountDeployRole"
    ]
  },
  "Action": [
    "kms:Decrypt",
    "kms:DescribeKey",
    "kms:GenerateDataKey"
  ],
  "Resource": "*"
}
```

> ⚠️ **함정**: S3 권한만 주고 KMS Decrypt를 빠뜨리면 객체 다운로드는 되지만 복호화 실패.

### 5. CodePipeline Cross-Account Action

V2 Pipeline의 Deploy Action 예:
```json
{
  "name": "DeployProd",
  "actionTypeId": {
    "category": "Deploy",
    "owner": "AWS",
    "provider": "CloudFormation",
    "version": "1"
  },
  "roleArn": "arn:aws:iam::PRD-ACCT:role/CrossAccountDeployRole",
  "configuration": {
    "ActionMode": "CREATE_UPDATE",
    "StackName": "MyAppProd",
    "TemplatePath": "BuildArtifact::template.yaml",
    "RoleArn": "arn:aws:iam::PRD-ACCT:role/CloudFormationExecutionRole"
  },
  "inputArtifacts": [{"name": "BuildArtifact"}],
  "region": "ap-northeast-2"
}
```

두 Role이 등장:
- `roleArn` (action 수준): Action을 수행하기 위해 가정하는 Role
- `Configuration.RoleArn` (CFN 수준): CloudFormation이 리소스 생성에 사용하는 Role

### 6. CloudFormation StackSets와 CodePipeline

StackSets Action으로 한 번에 여러 계정/리전 배포:

```json
{
  "name": "DeployToAllOUs",
  "actionTypeId": {
    "category": "Deploy",
    "owner": "AWS",
    "provider": "CloudFormationStackSet",
    "version": "1"
  },
  "configuration": {
    "StackSetName": "BaselineGuardrails",
    "TemplatePath": "BuildArtifact::stackset.yaml",
    "DeploymentTargets": "OrganizationalUnitIds=ou-abc-1111,ou-abc-2222",
    "Regions": "ap-northeast-2,us-east-1,eu-west-1",
    "PermissionModel": "SERVICE_MANAGED",
    "OrganizationsAutoDeployment": "Enabled"
  }
}
```

`CloudFormationStackInstances` Action으로 인스턴스 추가/삭제도 가능.

### 7. 멀티 리전 파이프라인

CodePipeline Action은 `region` 속성으로 다른 리전 지정 가능. 각 리전에 다음이 필요:
- Artifact S3 버킷 (지정된 리전)
- KMS 키 (지정된 리전)
- Action을 호출할 Role

```yaml
ArtifactStores:
  - Region: ap-northeast-2
    ArtifactStore:
      Type: S3
      Location: tooling-artifacts-kr
      EncryptionKey: {Id: arn:...:key/kr-key, Type: KMS}
  - Region: us-east-1
    ArtifactStore:
      Type: S3
      Location: tooling-artifacts-use1
      EncryptionKey: {Id: arn:...:key/use1-key, Type: KMS}
```

---

## 🧠 알아두면 좋은 심화 이론

### PrincipalTag 조건으로 권한 세분화

```json
"Condition": {
  "StringEquals": {
    "aws:PrincipalTag/Pipeline": "checkout-prod"
  }
}
```

Pipeline의 Service Role에 태그 `Pipeline=checkout-prod`를 붙여두면 Spoke의 Trust Policy가 이 조건으로 권한 분리 가능. 여러 파이프라인이 동일 Role을 공유하지 않도록.

### External ID

타사 통합 시 권장 — Confused Deputy 방지.
```json
"Condition": {
  "StringEquals": {
    "sts:ExternalId": "unique-secret-id"
  }
}
```

### Session Tag

`sts:AssumeRole`에 SessionTags 전달 → 일시적 권한 컨텍스트 부여.
SCP/Policy에서 조건으로 사용.

### Permission Boundary

Cross-Account Role의 최대 권한을 제한. 잘못 부여된 Permission Policy도 Boundary를 넘지 못함.

### 멀티 계정 시 S3 버킷 정책 함정

- Bucket-Owner-Enforced (BOE) 활성화 시 cross-account 객체 쓰기에 ACL 의존 불가 → 명시적 정책 필요
- KMS bucket key 사용 시 cross-account 비용 절감

### 관련 서비스 Cross-Reference

- **Organizations / SCP** → Week 1 Day 4
- **CloudFormation StackSets** → Week 8 Day 2
- **IAM Identity Center Permission Set** → Week 9 Day 1
- **KMS** → Week 9 Day 4

---

## 🏗️ 아키텍처 다이어그램

```
Cross-Account Pipeline
==================================================

  Tooling Account (Hub)                       Prod Account (Spoke)
  ┌────────────────────────────┐              ┌─────────────────────────┐
  │ CodePipeline               │              │ Production Resources    │
  │  ┌──────────────────────┐  │              │  - ECS Service          │
  │  │ Source Stage         │  │              │  - RDS                  │
  │  └──────────────────────┘  │              │  - S3                   │
  │  ┌──────────────────────┐  │              │                         │
  │  │ Build Stage          │  │              │ CrossAccountDeployRole  │
  │  │  CodeBuild           │──┼──artifact───►│  trusts Tooling         │
  │  └──────────────────────┘  │              │  perm: ecs/lambda/cfn   │
  │  ┌──────────────────────┐  │              │                         │
  │  │ Approval Stage       │  │              │ CloudFormation Exec     │
  │  └──────────────────────┘  │              │  Role (executed by CFN) │
  │  ┌──────────────────────┐  │              │                         │
  │  │ Deploy Stage         │──┼──assumeRole─►│                         │
  │  │  Action roleArn=     │  │              │                         │
  │  │  PROD:Role           │  │              │                         │
  │  └──────────────────────┘  │              │                         │
  │                            │              │                         │
  │  Artifact S3 + KMS         │              │ S3 GetObject + KMS      │
  │   - bucket policy grants   │◄─────────────│  Decrypt allowed        │
  │   - kms policy grants      │              │                         │
  └────────────────────────────┘              └─────────────────────────┘

  IAM Chain:
   Tooling.Pipeline → AssumeRole → Prod.CrossAccountDeployRole
                                     ↓ creates CFN stack with
                                   Prod.CloudFormationExecutionRole
                                     ↓ creates resources
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Cross-Account 필수 4가지: Pipeline AssumeRole + Spoke Trust + S3 Policy + KMS Key Policy
2. ⭐ Deploy Action의 roleArn (action 수준) + Configuration.RoleArn (CFN 수준) 두 Role
3. ⭐ S3는 되는데 KMS Decrypt 누락이 가장 흔한 함정
4. ⭐ StackSets Action으로 멀티 계정/리전 한 번에 배포
5. ⭐ 멀티 리전 파이프라인은 각 리전에 Artifact S3 + KMS 별도 필요

---

## 💻 실제 예시 - Spoke 계정 Role 구성

```bash
# Spoke (Prod) 계정에서
aws iam create-role \
  --role-name CrossAccountDeployRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::111111111111:role/CodePipelineServiceRole"},
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {"aws:PrincipalTag/Pipeline": "checkout-prod"}
      }
    }]
  }'

# Trust + Permission
aws iam attach-role-policy \
  --role-name CrossAccountDeployRole \
  --policy-arn arn:aws:iam::aws:policy/AWSCloudFormationFullAccess

# Tooling 계정에서 Artifact S3 + KMS 정책 업데이트 (위 정책)

# Pipeline Stage에 Deploy Action 정의 (roleArn=프로드 계정 Role ARN)
```

---

## 📝 연습 문제

**문제 1.** Cross-Account 배포에서 가장 자주 빠뜨리는 권한은?

A) S3 GetObject
B) KMS Decrypt + GenerateDataKey (Artifact 복호화)
C) ECS Describe
D) IAM ListUsers

**정답: B**
해설: KMS 누락이 가장 흔한 함정.

---

**문제 2.** Pipeline Deploy Action의 두 Role(action.roleArn + Configuration.RoleArn)의 차이는?

A) 동일
B) action.roleArn은 Action 가정 Role, Configuration.RoleArn은 CloudFormation이 리소스 생성에 사용
C) 하나는 IAM User
D) Configuration.RoleArn은 선택

**정답: B**
해설: 두 Role의 역할 분리.

---

**문제 3.** StackSets Action 사용 시 OrganizationsAutoDeployment의 효과는?

A) 새 계정이 OU에 추가되면 자동으로 StackSet 인스턴스 생성
B) 비용 절감
C) Region 자동 확장
D) IAM Role 자동 생성

**정답: A**
해설: Auto-deployment가 핵심 기능.

---

**문제 4.** 멀티 리전 파이프라인에 필수 구성은?

A) 각 리전에 Artifact S3 + KMS 키
B) 단일 글로벌 S3
C) Cross-Region VPC Peering
D) Route 53

**정답: A**
해설: ArtifactStores 리전별 구성.

---

**문제 5.** PrincipalTag 조건의 용도는?

A) 단일 Role을 여러 파이프라인이 공유할 때 파이프라인별 권한 분리
B) IAM User 식별
C) Region 제한
D) KMS 키 식별

**정답: A**
해설: Service Role에 태그 → Trust Policy 조건으로 사용 → 권한 컨텍스트 분리.

---

**문제 6.** Spoke 계정의 CrossAccountDeployRole이 가정될 때 Confused Deputy 방지에 가장 적절한 조건은?

A) External ID 또는 sourceAccount/sourceArn 조건 (서드파티) / PrincipalTag (내부 멀티팀)
B) IP 화이트리스트
C) MFA 강제 (자동화에 부적합)
D) Region 제한

**정답: A**
해설: External ID는 서드파티 표준, PrincipalTag는 내부 분리.

---

**문제 7.** Pipeline이 다른 리전에 배포하려면 Action의 어떤 필드가 필요한가?

A) `region` 필드 명시
B) Service Role 재생성
C) Pipeline 자체를 해당 리전에 다시 생성
D) Lambda Action으로 우회

**정답: A**
해설: Action 수준 region 필드. 단 해당 리전 Artifact Store 사전 구성 필요.

---

## 📌 오늘의 요약

1. Cross-Account = Pipeline AssumeRole + Spoke Trust + S3 Policy + KMS Key Policy 4종
2. Action roleArn (Action 가정) + Configuration.RoleArn (CFN 실행) 두 Role
3. StackSets Action으로 멀티 계정/리전 한 번에 배포
4. 멀티 리전 파이프라인은 각 리전 Artifact Store 필요
5. PrincipalTag/ExternalID로 Confused Deputy 방지
