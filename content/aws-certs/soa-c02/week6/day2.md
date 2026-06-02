# Day 2 - Change Set, Drift Detection, Rollback Trigger

📅 날짜: Week 6 (Day 2)
🎯 주제: CFn 운영의 핵심 — 변경 미리보기·실제 상태 비교·안전 배포
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Change Set으로 위험한 변경을 사전 확인한다
- Drift Detection으로 수동 변경(Console 핫픽스)을 감지한다
- Rollback Trigger로 운영 중 자동 롤백을 구성한다

---

## 🧩 사전 지식 (CS 기초)

- **Dry-run**: 실제 실행 없이 계획만 출력. Terraform plan, CFn Change Set
- **Configuration drift**: IaC 의도와 실제 상태의 격차
- **Blue-green deploy**: 두 환경 병행 운영 후 트래픽 전환
- **Health check based rollback**: 알람 기반 자동 롤백
- **Stack protection**: 실수로 인한 삭제 방지

---

## 📖 이론 내용

### 1. Change Set (변경 미리보기)

#### 왜 필요한가
- `update-stack`은 즉시 변경 시작 — 데이터 손실/다운타임 위험
- Change Set은 "변경 사항을 미리 보고 승인 후 실행"
- 운영 환경의 안전 장치

#### 동작 흐름
```
1. create-change-set: Template 변경사항 분석
2. describe-change-set: 어떤 리소스가 추가/변경/삭제될지 확인
3. execute-change-set: 승인 후 실행
   또는 delete-change-set: 폐기
```

#### Change Type
| Action | 의미 |
|--------|------|
| `Add` | 신규 리소스 생성 |
| `Modify` | 속성 변경 |
| `Remove` | 리소스 삭제 |
| `Import` | 기존 리소스를 Stack에 가져옴 |
| `Dynamic` | 변경 영향 동적 판단 |

#### Modify 시 Replacement
- `True`: 리소스 재생성 (데이터 손실!)
- `False`: 인플레이스 업데이트
- `Conditional`: 조건에 따라

→ **Replacement: True**가 보이면 운영자가 멈춰서 확인해야 함.

### 2. Drift Detection

#### 개념
- Stack 생성 후 누군가 콘솔/CLI로 직접 변경한 리소스 감지
- "이 보안 그룹은 CFn으로 만들었는데 누가 SG에 0.0.0.0/0 추가했나?"

#### 동작 방식
1. `detect-stack-drift` 실행 → 비동기 작업 시작
2. CFn이 각 리소스를 Template과 비교
3. 결과: `IN_SYNC`, `MODIFIED`, `DELETED`, `NOT_CHECKED`

#### Drift 감지 한계
- 모든 리소스 타입 지원 X (지원 목록 확인 필요)
- 모든 속성 비교 X
- 새로 추가된 리소스(Stack 밖)는 감지 X

#### 운영 패턴
- 주기적 drift detection (Lambda + EventBridge cron)
- Drift 발견 시 SNS 알림 + Config Rule로도 가능
- Config `cloudformation-stack-drift-detection-check` 활용

### 3. Rollback Trigger (자동 롤백)

#### 개념
- Stack 업데이트 중 CloudWatch Alarm이 발생하면 자동으로 롤백
- 운영 중 잘못된 배포 → 즉시 이전 상태로

#### 설정
```bash
aws cloudformation update-stack \
  --stack-name my-app \
  --template-body file://template.yaml \
  --rollback-configuration '{
    "MonitoringTimeInMinutes": 10,
    "RollbackTriggers": [
      {"Arn":"arn:aws:cloudwatch:ap-northeast-2:123:alarm:HighErrorRate","Type":"AWS::CloudWatch::Alarm"},
      {"Arn":"arn:aws:cloudwatch:ap-northeast-2:123:alarm:HighLatency","Type":"AWS::CloudWatch::Alarm"}
    ]
  }'
```

- `MonitoringTimeInMinutes`: 업데이트 완료 후 N분 동안 알람 모니터링
- 그 시간 안에 알람 발생 시 자동 롤백
- 최대 5개 트리거

### 4. Stack 보호 옵션

#### Termination Protection
- 실수로 `delete-stack` 방지
- 활성화 시 삭제 시도 거부 (보호 해제 필요)

```bash
aws cloudformation update-termination-protection \
  --stack-name production-app \
  --enable-termination-protection
```

#### Stack Policy
- 업데이트 중 특정 리소스 보호
- JSON으로 "이 리소스는 업데이트 시 수정/대체 금지"

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "Update:*",
      "Principal": "*",
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": ["Update:Replace", "Update:Delete"],
      "Principal": "*",
      "Resource": "LogicalResourceId/MyDatabase"
    }
  ]
}
```

#### Disable Rollback
- 실패 시 롤백 비활성화 → 실패 리소스 그대로 (디버깅용)
- 운영에서는 보통 활성

### 5. Resource Import

#### 개념
- 기존에 콘솔로 만든 리소스를 CFn Stack으로 가져오기
- "삭제하지 않고 IaC로 전환"

#### 흐름
1. Template에 import할 리소스 정의 + `DeletionPolicy: Retain`
2. Change Set 생성 (`ChangeSetType=IMPORT`)
3. 각 리소스에 식별자 매핑 (예: S3 버킷 이름)
4. Execute change set → IaC 관리하에 편입

### 6. CFn Hooks (사전 검증)

- Pre-create/Pre-update/Pre-delete 단계에 검증 로직 삽입
- 예: "퍼블릭 S3 버킷 생성 금지", "비암호화 EBS 차단"
- CloudFormation Guard DSL 또는 Lambda

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Continuous rollback** | UPDATE_ROLLBACK_FAILED 시 `CONTINUE_UPDATE_ROLLBACK` | 막힌 Stack 복구 |
| **Stack Set 자동 배포** | 신규 Organization 계정에 Stack 자동 적용 | Landing Zone |
| **CFn Macros** | Template 전처리 (확장 문법) | 고급 패턴 |
| **TemplateURL via S3** | 큰 템플릿은 S3에 두고 URL 참조 | 51,200 bytes 한도 |
| **Service Role** | CFn이 사용할 IAM Role 지정 | 사용자 권한과 분리 |

> ⚠️ **함정 1**: Drift Detection은 새로 추가된 리소스(Stack 밖)는 감지 못함. 삭제·수정만.
>
> ⚠️ **함정 2**: Rollback Trigger는 update 중 + MonitoringTime 동안만 동작. 그 후 알람 발생 시는 자동 롤백 X.
>
> 💡 **암기 팁**: Change Set(미리보기) → Stack Policy(보호) → Rollback Trigger(실패 시 자동 복구) → Drift Detection(사후 점검).

### 관련 서비스 Cross-Reference

- **Change Set → Week 6 Day 3** (StackSet 변경도 Change Set)
- **Drift Detection → Week 4 Day 3** (Config Rule로 자동 점검)
- **Rollback Trigger → Week 7** (CodeDeploy도 비슷한 메커니즘)
- **Stack Policy → Week 6 Day 4** (Service Catalog 거버넌스)

---

## 🏗️ 아키텍처 다이어그램

```
안전한 CFn 운영 패턴
==========================================================

   [개발자]
       │ 새 Template
       ▼
   ┌────────────────────────────────┐
   │  create-change-set             │
   │  - 어떤 리소스가 바뀔지        │
   │  - Replacement: True 여부      │
   └─────┬──────────────────────────┘
         │ 검토
         ▼
   ┌────────────────────────────────┐
   │  execute-change-set            │
   │  + Rollback Configuration:     │
   │    - MonitoringTime: 10m       │
   │    - Triggers: HighErrorAlarm  │
   └─────┬──────────────────────────┘
         │ 변경 적용
         ▼
   [업데이트 중 + 10분간 알람 감시]
         │ 알람 발생
         ▼
   [자동 롤백]


   주기적 점검:
   ┌────────────────────────────────┐
   │  EventBridge cron (1d)         │
   │      ↓                         │
   │  Lambda: detect-stack-drift    │
   │      ↓                         │
   │  Drift 발견 → SNS 알림         │
   └────────────────────────────────┘
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Change Set으로 변경 미리보기** — 특히 Replacement 여부 확인 (데이터 손실 위험)
2. ⭐ **Drift Detection은 수동/주기 실행** — 자동 아님. Config Rule 또는 cron Lambda
3. ⭐ **Rollback Trigger = CloudWatch Alarm 기반 자동 롤백** — MonitoringTime 동안만
4. ⭐ **Termination Protection으로 실수 삭제 방지** — 운영 Stack 필수
5. ⭐ **Stack Policy로 핵심 리소스(DB) 업데이트/삭제 차단**

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Change Set 생성 (변경 미리보기)
aws cloudformation create-change-set \
  --stack-name my-app-prod \
  --template-body file://new-template.yaml \
  --change-set-name "feature-x-2026-05-22" \
  --parameters ParameterKey=Version,ParameterValue=2.0

# 2. Change Set 내용 확인
aws cloudformation describe-change-set \
  --stack-name my-app-prod \
  --change-set-name "feature-x-2026-05-22" \
  --query 'Changes[*].[ResourceChange.Action,ResourceChange.LogicalResourceId,ResourceChange.Replacement]' \
  --output table

# 3. Replacement 체크 후 실행
aws cloudformation execute-change-set \
  --stack-name my-app-prod \
  --change-set-name "feature-x-2026-05-22"

# 4. Drift Detection 시작
DRIFT_ID=$(aws cloudformation detect-stack-drift \
  --stack-name my-app-prod \
  --query 'StackDriftDetectionId' --output text)

aws cloudformation describe-stack-drift-detection-status \
  --stack-drift-detection-id $DRIFT_ID

# 5. Drift 결과 조회
aws cloudformation describe-stack-resource-drifts \
  --stack-name my-app-prod \
  --stack-resource-drift-status-filters MODIFIED DELETED

# 6. Rollback Trigger 포함 업데이트
aws cloudformation update-stack \
  --stack-name my-app-prod \
  --template-body file://template.yaml \
  --rollback-configuration '{
    "MonitoringTimeInMinutes": 10,
    "RollbackTriggers": [
      {"Arn":"arn:aws:cloudwatch:ap-northeast-2:123:alarm:HighErrorRate","Type":"AWS::CloudWatch::Alarm"}
    ]
  }'

# 7. Termination Protection
aws cloudformation update-termination-protection \
  --stack-name my-app-prod \
  --enable-termination-protection

# 8. Stack Policy 적용
cat > stack-policy.json <<'EOF'
{
  "Statement": [
    {"Effect":"Allow","Action":"Update:*","Principal":"*","Resource":"*"},
    {"Effect":"Deny","Action":["Update:Replace","Update:Delete"],"Principal":"*","Resource":"LogicalResourceId/ProdDatabase"}
  ]
}
EOF

aws cloudformation set-stack-policy \
  --stack-name my-app-prod \
  --stack-policy-body file://stack-policy.json

# 9. Resource Import (기존 리소스를 IaC로)
aws cloudformation create-change-set \
  --stack-name imported-stack \
  --change-set-name "import-bucket" \
  --change-set-type IMPORT \
  --resources-to-import '[
    {
      "ResourceType":"AWS::S3::Bucket",
      "LogicalResourceId":"ExistingBucket",
      "ResourceIdentifier":{"BucketName":"my-existing-bucket"}
    }
  ]' \
  --template-body file://import-template.yaml
```

---

## 📝 연습 문제

**문제 1.** 운영자가 RDS 인스턴스 클래스를 변경하려 한다. 데이터 손실 없이 안전한지 확인하려면?

A) update-stack 바로 실행
B) Change Set 생성 → describe-change-set으로 Replacement 필드 확인 (True면 데이터 손실)
C) Snapshot 만들고 변경
D) Stack 삭제 후 재생성

**정답: B**
해설: Change Set은 dry-run. `Replacement: True`면 리소스 재생성 → 데이터 손실. 사전에 확인 후 안전한 변경만 실행.

---

**문제 2.** 누군가 콘솔에서 CFn으로 만든 SG에 0.0.0.0/0 SSH를 추가했다. 어떻게 감지하나?

A) CloudTrail만
B) Drift Detection — Stack 리소스와 실제 상태 비교 + Config Rule `cloudformation-stack-drift-detection-check`
C) Run Command
D) Inspector

**정답: B**
해설: Drift Detection이 정확한 도구. 주기적으로 실행(Lambda + EventBridge cron)하거나 Config Rule로 자동화. CloudTrail은 행위 로그지만 drift 자체는 모름.

---

**문제 3.** Stack 업데이트 후 5분 안에 에러율이 spike하면 자동 롤백되도록 하려면?

A) Lambda 모니터
B) Rollback Configuration의 RollbackTriggers에 CloudWatch Alarm 지정 + MonitoringTimeInMinutes 설정
C) Manual rollback
D) CodeDeploy

**정답: B**
해설: CFn Rollback Trigger가 정확한 도구. MonitoringTime 동안 알람 발생 시 자동 롤백. 최대 5개 트리거.

---

**문제 4.** 운영자가 실수로 production Stack을 삭제할 가능성을 차단하려면?

A) 권한 없는 사용자만 운영
B) Termination Protection 활성화 (delete 시도 거부)
C) MFA Delete
D) Backup

**정답: B**
해설: Termination Protection이 정확한 방어. 활성화 시 delete-stack이 거부됨 — 보호 해제 후에만 삭제 가능.

---

**문제 5.** Stack이 `UPDATE_ROLLBACK_FAILED` 상태다. 어떻게 복구?

A) 삭제 후 재생성
B) `continue-update-rollback` 명령으로 롤백 재시도. 실패 원인 리소스는 skip 가능
C) 무시
D) 새 Stack 생성

**정답: B**
해설: `CONTINUE_UPDATE_ROLLBACK`이 정확한 해결책. 실패한 리소스를 SkipResources 옵션으로 제외 후 재시도 가능. 마지막 수단으로 수동 정리.

---

## 📌 오늘의 요약

1. Change Set: 변경 미리보기 (dry-run). Replacement 여부 확인이 핵심 — 데이터 손실 방지
2. Drift Detection: 수동/주기 실행. Config Rule 또는 cron Lambda로 자동화
3. Rollback Trigger: CloudWatch Alarm 기반 자동 롤백 (MonitoringTime 동안만)
4. Termination Protection: 실수 삭제 방지. 운영 Stack 필수
5. Stack Policy: 업데이트 중 핵심 리소스(DB) Replace/Delete 차단
