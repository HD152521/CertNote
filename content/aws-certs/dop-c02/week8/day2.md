# Day 2 - StackSets - 멀티 계정/리전 배포

📅 날짜: Week 8 (Day 2)
🎯 주제: 엔터프라이즈 거버넌스의 IaC — 한 번에 N계정 × M리전 배포
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Self-managed vs Service-managed Permissions
- Stack Instance 개념과 OU 기반 자동 배포
- Drift Detection at scale
- Concurrency, Failure Tolerance 운영 설정

---

## 🧩 사전 지식 (CS 기초)

- **Fan-out deployment**: 한 정의로 다수 환경 배포.
- **Idempotent batch**: 같은 명령 반복해도 같은 상태.
- **Bulk Operations**: 대규모 작업. 부분 실패 허용.
- **Permission Boundary**: IAM 최대 권한 범위.

---

## 📖 이론 내용

### 1. StackSets 모델

```
StackSet (정의 — 템플릿 + 파라미터)
   ├─ Stack Instance (계정 A, region 1)
   ├─ Stack Instance (계정 A, region 2)
   ├─ Stack Instance (계정 B, region 1)
   ├─ Stack Instance (계정 B, region 2)
   └─ ...
```

각 Stack Instance는 일반 CFN Stack과 동일. StackSets은 동기화 메커니즘.

### 2. Permission Model 2종

| 모델 | 배포 방식 | 사용 사례 |
|------|-----------|-----------|
| **Self-managed** | 각 계정에 IAM Role 사전 생성 필요 | Organizations 미사용, 명시적 계정 목록 |
| **Service-managed** | Organizations와 통합, AWS가 자동 IAM Role 생성 | OU 단위 배포, 자동 확장 |

**Self-managed 필수 IAM:**
- Administration 계정의 `AWSCloudFormationStackSetAdministrationRole`
- 각 대상 계정의 `AWSCloudFormationStackSetExecutionRole` (Administration 계정을 신뢰)

**Service-managed:**
- Organizations Management Account 또는 위임된 Delegated Administrator
- Organizations에서 StackSets Trusted Access 활성화
- AWS가 모든 IAM 자동 관리

### 3. Auto-Deployment

Service-managed에서 새 멤버 계정이 OU에 추가될 때 자동 배포:

```bash
aws cloudformation create-stack-set \
  --stack-set-name BaselineGuardrails \
  --template-url https://s3.../baseline.yaml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \
  --capabilities CAPABILITY_NAMED_IAM
```

- `RetainStacksOnAccountRemoval=true`: 계정이 OU에서 제거돼도 Stack 유지
- `Enabled=true`: 신규 계정 자동 적용

### 4. Stack Instance 생성

```bash
aws cloudformation create-stack-instances \
  --stack-set-name BaselineGuardrails \
  --deployment-targets '{"OrganizationalUnitIds": ["ou-abc-1111", "ou-abc-2222"]}' \
  --regions ap-northeast-2 us-east-1 eu-west-1 \
  --operation-preferences '{
    "RegionConcurrencyType": "PARALLEL",
    "MaxConcurrentCount": 10,
    "FailureToleranceCount": 2
  }'
```

**Operation Preferences:**
- `RegionConcurrencyType`: SEQUENTIAL / PARALLEL
- `MaxConcurrentCount`: 동시 처리 Stack Instance 수
- `FailureToleranceCount`: 허용 실패 수
- `RegionOrder`: 순차 시 리전 순서

### 5. StackSet Update

```bash
aws cloudformation update-stack-set \
  --stack-set-name BaselineGuardrails \
  --template-url https://s3.../baseline-v2.yaml \
  --operation-preferences '...'
```

전체 Stack Instances 업데이트. **부분 실패 허용** — 일부 계정 실패해도 나머지 진행.

### 6. Account Filter Type (Service-managed)

```bash
--deployment-targets '{
  "OrganizationalUnitIds": ["ou-prod-1234"],
  "AccountFilterType": "DIFFERENCE",
  "Accounts": ["111111111111"]
}'
```

- `NONE`: OU의 모든 계정
- `INTERSECTION`: OU ∩ Accounts
- `DIFFERENCE`: OU - Accounts (특정 계정 제외)
- `UNION`: OU ∪ Accounts

### 7. Drift Detection

```bash
aws cloudformation detect-stack-set-drift \
  --stack-set-name BaselineGuardrails

# 결과 조회
aws cloudformation describe-stack-set-operation \
  --stack-set-name BaselineGuardrails \
  --operation-id ...
```

전체 Stack Instance에 대해 drift 탐지. Service-managed는 자동 주기적 탐지 옵션도 있음.

---

## 🧠 알아두면 좋은 심화 이론

### Delegated Administrator

Management Account 대신 별도 계정(예: Tooling Account)이 StackSets 관리:

```bash
aws organizations register-delegated-administrator \
  --account-id 111111111111 \
  --service-principal stacksets.cloudformation.amazonaws.com
```

Management Account의 사용 최소화 — 보안 모범사례.

### StackSets 사용 사례

| 사용 사례 | 템플릿 내용 |
|----------|-------------|
| 계정 베이스라인 | CloudTrail Trail, Config 활성, IAM 분석기 |
| 보안 가드레일 | GuardDuty, Security Hub, IAM Access Analyzer |
| 네트워크 | VPC, Transit Gateway 연결, VPC Endpoint |
| 모니터링 | CloudWatch Cross-Account Sharing |
| Patch Baseline | SSM Patch Manager 설정 |

### 시험 빈출 — Self-managed의 함정

수십 계정에 Self-managed로 배포하려면 모든 계정에 사전 IAM Role 생성 필요 → 모순. **Service-managed + Organizations이 표준**.

### Concurrency 튜닝

- 1000 계정 × 5 리전 = 5000 Stack Instance
- MaxConcurrentCount=100 + RegionConcurrencyType=PARALLEL
- 처리 속도와 API rate limit 균형

### StackSet 삭제

```bash
# 1) 모든 Stack Instance 먼저 삭제
aws cloudformation delete-stack-instances \
  --stack-set-name X \
  --deployment-targets ... --regions ... \
  --retain-stacks false

# 2) StackSet 자체 삭제
aws cloudformation delete-stack-set --stack-set-name X
```

Instance 잔여 시 StackSet 삭제 불가.

### 관련 서비스 Cross-Reference

- **Organizations / Control Tower** → Week 1 Day 4
- **Account Factory** → Week 15 Day 1
- **AWS Config Rules StackSets로 배포** → Week 14 Day 3

---

## 🏗️ 아키텍처 다이어그램

```
StackSets Multi-Account Multi-Region
==================================================

  Management Account (또는 Delegated Admin)
   ├─ StackSet: BaselineGuardrails
   │   Template: cloudtrail+config+guardduty
   │   PermissionModel: SERVICE_MANAGED
   │   AutoDeployment: Enabled
   │
   └─ Operation: create-stack-instances
        Targets: OUs (Workloads, Security)
        Regions: [ap-northeast-2, us-east-1, eu-west-1]
        Concurrency: 10
        FailureTolerance: 2

  Organizations
   ├─ Workloads OU
   │   ├─ Dev Account
   │   │    └─ Stack [ap-northeast-2]
   │   │    └─ Stack [us-east-1]
   │   │    └─ Stack [eu-west-1]
   │   ├─ Staging Account
   │   │    └─ Stack [...]
   │   └─ Prod Account
   │        └─ Stack [...]
   │
   ├─ Security OU
   │   └─ Audit Account
   │        └─ Stack [...]
   │
   └─ (New account joins OU)
        Auto-deployment triggered automatically
        Stacks created in all configured regions

  Drift Detection:
   Reports any manual change in member accounts
   Doesn't auto-fix — surfaces deviation
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Service-managed + Organizations이 멀티 계정의 표준
2. ⭐ Auto-deployment로 새 계정에 자동 적용
3. ⭐ Operation Preferences로 동시성/실패 허용 튜닝
4. ⭐ Delegated Administrator로 Management Account 부담 최소화
5. ⭐ AccountFilterType (NONE/INTERSECTION/DIFFERENCE/UNION)으로 정밀 타겟팅

---

## 💻 실제 예시 - 베이스라인 StackSet

```bash
# 1) Organizations StackSets Trusted Access (Management Account)
aws organizations enable-aws-service-access \
  --service-principal stacksets.cloudformation.amazonaws.com

# 2) Delegated Admin 설정 (선택)
aws organizations register-delegated-administrator \
  --account-id TOOLING-ACCT \
  --service-principal stacksets.cloudformation.amazonaws.com

# 3) StackSet 생성 (Delegated Admin 계정에서 실행)
aws cloudformation create-stack-set \
  --stack-set-name BaselineGuardrails \
  --template-url https://s3.amazonaws.com/templates/baseline.yaml \
  --permission-model SERVICE_MANAGED \
  --capabilities CAPABILITY_NAMED_IAM \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false

# 4) Stack Instances 생성 (모든 Workloads OU의 3 리전)
aws cloudformation create-stack-instances \
  --stack-set-name BaselineGuardrails \
  --deployment-targets '{"OrganizationalUnitIds":["ou-workloads-abc"]}' \
  --regions ap-northeast-2 us-east-1 eu-west-1 \
  --operation-preferences '{
    "RegionConcurrencyType":"PARALLEL",
    "MaxConcurrentCount":10,
    "FailureToleranceCount":2
  }'

# 5) Drift Detection
aws cloudformation detect-stack-set-drift --stack-set-name BaselineGuardrails

# 6) Update (모든 Instance 일괄)
aws cloudformation update-stack-set \
  --stack-set-name BaselineGuardrails \
  --template-url https://s3.../baseline-v2.yaml \
  --capabilities CAPABILITY_NAMED_IAM
```

---

## 📝 연습 문제

**문제 1.** 새 멤버 계정이 OU에 추가될 때 자동으로 베이스라인이 배포되려면?

A) Lambda로 매번 호출
B) StackSets Service-managed + AutoDeployment Enabled
C) Self-managed
D) 수동 StackSet 호출

**정답: B**
해설: Auto-deployment + Service-managed가 표준.

---

**문제 2.** Self-managed 모델의 한계는?

A) 멀티 리전 불가
B) 각 대상 계정에 사전 IAM Role 생성 필요 — 수십 계정에 비현실적
C) 비용
D) Region 제한

**정답: B**
해설: 사전 IAM 필요 = 규모 확장 어려움.

---

**문제 3.** AccountFilterType=DIFFERENCE의 의미는?

A) OU의 모든 계정
B) OU에서 명시된 Accounts 제외
C) OU와 Accounts의 교집합
D) 합집합

**정답: B**
해설: DIFFERENCE = 차집합.

---

**문제 4.** Delegated Administrator 등록의 이점은?

A) 비용 절감
B) Management Account 사용을 최소화 — 보안 모범사례
C) Region 확장
D) IAM 자동 회전

**정답: B**
해설: Management Account 보호.

---

**문제 5.** Operation Preferences의 FailureToleranceCount=2의 의미는?

A) 2번 재시도
B) Stack Instance 실패 2개까지 허용, 나머지 진행
C) 2개 동시 처리
D) 2시간 timeout

**정답: B**
해설: 부분 실패 허용.

---

**문제 6.** StackSet 삭제 시 필수 선행 작업은?

A) IAM Role 삭제
B) 모든 Stack Instance 먼저 삭제
C) Region 변경
D) Backup

**정답: B**
해설: Instance 잔여 시 StackSet 삭제 불가.

---

**문제 7.** Drift Detection의 동작은?

A) 자동 수정
B) 차이 탐지 + 보고 (자동 수정 X)
C) Stack Instance 삭제
D) IAM 변경

**정답: B**
해설: Drift는 탐지만, 수정은 별도.

---

## 📌 오늘의 요약

1. Service-managed + Organizations + AutoDeployment가 표준
2. AccountFilterType (UNION/INTERSECTION/DIFFERENCE/NONE)으로 정밀 타겟팅
3. Operation Preferences로 동시성/실패 허용 튜닝
4. Delegated Administrator로 Management Account 보호
5. Drift는 탐지만 — 수정은 별도 절차
