# Day 2 - AWS Backup (Plan, Vault, Cross-Region/Cross-Account)

📅 날짜: Week 10 (Day 2)
🎯 주제: 멀티 서비스 통합 백업 + 컴플라이언스
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS Backup의 Plan/Vault/Rule 구조를 이해한다
- Cross-Region·Cross-Account 백업을 구성한다
- Backup Audit Manager + Vault Lock으로 컴플라이언스를 강화한다

---

## 🧩 사전 지식 (CS 기초)

- **3-2-1 백업 규칙**: 3개 복사본, 2개 다른 매체, 1개 오프사이트
- **Air-gapped backup**: 네트워크 분리된 백업. Ransomware 방어
- **WORM (Write Once Read Many)**: 한 번 쓰면 변경 불가
- **Immutable backup**: 변경 불가 백업. 컴플라이언스 필수

---

## 📖 이론 내용

### 1. AWS Backup 개요

#### 지원 서비스
- EBS, EC2 (Instance)
- RDS, Aurora
- DynamoDB
- EFS, FSx
- Storage Gateway
- S3 (객체 단위)
- Neptune, DocumentDB, Redshift
- VMware Workloads (on-prem + Cloud)

#### DLM vs AWS Backup

| 항목 | DLM | AWS Backup |
|------|-----|------------|
| 지원 | EBS/AMI만 | 다수 서비스 |
| 정책 | Lifecycle Policy | Backup Plan |
| Cross-Account | 제한적 | 완전 지원 |
| 컴플라이언스 | X | Backup Audit Manager |
| 비용 | 무료 (Snapshot만) | 관리 비용 + Storage |

→ 다중 서비스·컴플라이언스 = AWS Backup, EBS/AMI만 = DLM이 가볍다.

### 2. AWS Backup 핵심 구성 요소

#### Backup Plan
- 백업 규칙 + 자원 할당
- 여러 Rule 가능 (주간/월간/연간)

#### Backup Rule
- Vault, 스케줄, retention, Lifecycle (Warm→Cold), Cross-Region/Cross-Account 복사

#### Backup Vault
- 백업이 저장되는 컨테이너
- KMS 암호화 + Vault Policy (Resource Policy)
- 여러 Vault 가능 (예: prod-vault, dev-vault)

#### Backup Selection (Resource Assignment)
- 어떤 리소스를 백업할지
- 태그 기반 또는 ARN 직접

### 3. Backup Plan 예시

```json
{
  "BackupPlanName": "MyAppBackupPlan",
  "Rules": [
    {
      "RuleName": "DailyBackup",
      "TargetBackupVaultName": "prod-vault",
      "ScheduleExpression": "cron(0 5 ? * * *)",
      "StartWindowMinutes": 60,
      "CompletionWindowMinutes": 120,
      "Lifecycle": {
        "MoveToColdStorageAfterDays": 90,
        "DeleteAfterDays": 365
      },
      "CopyActions": [
        {
          "DestinationBackupVaultArn": "arn:aws:backup:us-east-1:123:backup-vault:dr-vault",
          "Lifecycle": {
            "DeleteAfterDays": 90
          }
        }
      ],
      "RecoveryPointTags": {
        "Environment": "prod"
      }
    },
    {
      "RuleName": "MonthlyBackup",
      "TargetBackupVaultName": "prod-vault",
      "ScheduleExpression": "cron(0 5 1 * ? *)",
      "Lifecycle": {
        "DeleteAfterDays": 2555  // 7년
      }
    }
  ]
}
```

### 4. Cross-Region & Cross-Account

#### Cross-Region Copy
- Backup Rule의 `CopyActions`에 다른 리전 Vault ARN
- 자동 복제
- KMS 키는 대상 리전에도 필요

#### Cross-Account Copy (Organizations)
- Member 계정의 백업을 중앙 Audit Account의 Vault에 자동 복제
- Member 계정 손상돼도 백업 안전 (Ransomware 방어)
- Resource-based Policy + Organizations 통합

### 5. Backup Vault Lock

#### 개념
- Vault의 백업을 **변경·삭제 불가**로 강제
- WORM 모델 → 컴플라이언스·Ransomware 방어

#### 모드

| 모드 | 의미 |
|------|------|
| **Governance** | 권한자(BackupVaultGovernance Action) 해제 가능 |
| **Compliance** | 절대 해제 불가 (Cooling-off 3일 후 영구) |

#### 사용 시나리오
- SEC, HIPAA, PCI 요건의 WORM
- Ransomware 방어 (관리자 손상돼도 백업 안전)

### 6. Continuous Backup & Point-in-time Recovery (PITR)

#### 지원 서비스
- RDS, Aurora
- DynamoDB
- S3

#### 동작
- 매 변경 사항을 Continuous Backup
- 임의 시점 복원 (예: 5초 단위)
- Snapshot 외에 별도 PITR 윈도우 (기본 35일)

### 7. Backup Audit Manager

#### 개념
- Backup 정책 준수 자동 검증
- Framework + Control 기반

#### Control 예시
- "모든 prod EC2가 매일 백업되는가?"
- "백업 retention 30일 이상인가?"
- "Cross-Region 백업이 있는가?"

#### 출력
- Compliance Report (PDF/CSV)
- Audit Manager와 통합

### 8. 복원 (Restore)

#### 복원 옵션
- 원본 위치 (덮어쓰기, 위험)
- 새 리소스 생성 (권장)
- Cross-Region 복원 (DR)

#### RDS PITR 예시
```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier prod-db \
  --target-db-instance-identifier prod-db-restored \
  --restore-time 2026-05-22T10:30:00Z
```

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Backup Gateway** | 온프레미스 VMware 백업 | 하이브리드 |
| **Multi-Account Backup Restore Testing** | 자동 복원 검증 | 컴플라이언스 |
| **Cold Storage** | 90일+ 시 비용 ↓ (단, 복원 비용·시간 ↑) | Lifecycle |
| **Restore Testing Plan** | 정기 자동 복원 테스트 | DR 검증 |
| **Tag-based Backup Plan 자동 할당** | 신규 리소스 자동 포함 | 운영 효율 |

> ⚠️ **함정 1**: Backup Plan은 백업만, 복원은 별도 작업. Restore Testing Plan으로 자동 검증.
>
> ⚠️ **함정 2**: Vault Lock Compliance 모드는 영구 — 적용 전 신중히 (계정 폐쇄도 잠금 유지).
>
> 💡 **암기 팁**: DLM(EBS/AMI 가벼움) ↔ AWS Backup(전 서비스, 컴플라이언스) ↔ Vault Lock(WORM).

### 관련 서비스 Cross-Reference

- **AWS Backup → Week 4 Audit Manager** (Framework 통합)
- **AWS Backup → Week 1 Organizations** (Cross-Account)
- **Vault Lock → Week 10 Day 1 Snapshot Lock**
- **Continuous Backup → Week 10 Day 3 RDS PITR**

---

## 🏗️ 아키텍처 다이어그램

```
멀티 계정 + Vault Lock 백업 아키텍처
==========================================================

   [Member Account A - Prod]
       │ Backup Plan (cron daily)
       ▼
   ┌──────────────────────┐
   │  Prod Vault          │ ← 회사 정책 Tag 백업 자동
   └──────┬───────────────┘
          │ CopyAction
          ▼
   ┌──────────────────────────────────────┐
   │  Central Backup Account (Audit OU)   │
   │                                      │
   │  ┌────────────────────────────────┐ │
   │  │  Central Vault                 │ │
   │  │  + Vault Lock (Compliance)     │ │ ← WORM
   │  │  + KMS 분리 키                  │ │
   │  └────────────────────────────────┘ │
   │  ┌────────────────────────────────┐ │
   │  │  DR Vault (us-east-1)          │ │ ← Cross-Region
   │  └────────────────────────────────┘ │
   └──────────────────────────────────────┘

   Ransomware로 Member Account 손상돼도
   Central Vault는 안전 + 변경 불가
```

```
Backup Plan 라이프사이클
==========================================================

   Day 0: 백업 생성 (Warm Storage)
                │
                ▼
   Day 90: Cold Storage 이동 (75% 저렴)
                │
                ▼
   Day 365: 자동 삭제 (또는 Cold만 7년 유지)

   복원:
   - Warm: 즉시
   - Cold: 12-24시간 대기 (Bulk: 5-12시간, Standard: 12-48시간)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **AWS Backup = 다수 서비스 통합** (EBS/RDS/DDB/EFS/FSx/S3 등). DLM은 EBS/AMI만
2. ⭐ **Backup Plan = Rule(스케줄+retention+CopyAction)** 묶음
3. ⭐ **Vault Lock Compliance 모드 = 영구 변경 불가** — 사용자도 해제 X. Ransomware 방어
4. ⭐ **Cross-Account Copy** — 별도 계정 Vault에 자동 복제
5. ⭐ **PITR (Continuous Backup)** — RDS/Aurora/DDB/S3 임의 시점 복원

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Backup Vault 생성 (KMS 암호화)
aws backup create-backup-vault \
  --backup-vault-name prod-vault \
  --encryption-key-arn arn:aws:kms:ap-northeast-2:123:key/abc

# 2. Backup Plan 생성
cat > backup-plan.json <<'EOF'
{
  "BackupPlanName": "prod-daily-monthly",
  "Rules": [
    {
      "RuleName": "Daily",
      "TargetBackupVaultName": "prod-vault",
      "ScheduleExpression": "cron(0 5 ? * * *)",
      "StartWindowMinutes": 60,
      "CompletionWindowMinutes": 180,
      "Lifecycle": {
        "MoveToColdStorageAfterDays": 90,
        "DeleteAfterDays": 365
      },
      "CopyActions": [
        {
          "DestinationBackupVaultArn": "arn:aws:backup:us-east-1:123:backup-vault:dr-vault",
          "Lifecycle": {"DeleteAfterDays": 90}
        }
      ]
    },
    {
      "RuleName": "Monthly7Year",
      "TargetBackupVaultName": "prod-vault",
      "ScheduleExpression": "cron(0 5 1 * ? *)",
      "Lifecycle": {"DeleteAfterDays": 2555}
    }
  ]
}
EOF

PLAN_ID=$(aws backup create-backup-plan \
  --backup-plan file://backup-plan.json \
  --query 'BackupPlanId' --output text)

# 3. Resource Assignment (태그 기반)
aws backup create-backup-selection \
  --backup-plan-id $PLAN_ID \
  --backup-selection '{
    "SelectionName": "prod-tagged",
    "IamRoleArn": "arn:aws:iam::123:role/service-role/AWSBackupDefaultServiceRole",
    "ListOfTags": [
      {"ConditionType":"STRINGEQUALS","ConditionKey":"Backup","ConditionValue":"daily"},
      {"ConditionType":"STRINGEQUALS","ConditionKey":"Environment","ConditionValue":"prod"}
    ]
  }'

# 4. Vault Lock - Compliance Mode (영구)
aws backup put-backup-vault-lock-configuration \
  --backup-vault-name prod-vault \
  --min-retention-days 30 \
  --max-retention-days 2555 \
  --changeable-for-days 3
# Compliance: 3일 cooling-off 후 영구 잠금

# 5. Cross-Account Copy 권한 (Central 계정에서)
aws backup put-backup-vault-access-policy \
  --backup-vault-name central-vault \
  --policy '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"AWS":"arn:aws:iam::SOURCE-ACCOUNT:root"},
      "Action":["backup:CopyIntoBackupVault"],
      "Resource":"*"
    }]
  }'

# 6. PITR - RDS 임의 시점 복원
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier prod-db \
  --target-db-instance-identifier prod-db-restored \
  --restore-time 2026-05-22T10:30:00Z

# 7. 백업 작업 점검
aws backup list-backup-jobs \
  --by-state RUNNING \
  --query 'BackupJobs[*].[BackupJobId,ResourceType,State,PercentDone]'

# 8. Audit Manager Framework
aws backup create-framework \
  --framework-name DailyBackupCompliance \
  --framework-controls '[
    {
      "ControlName":"BACKUP_RESOURCES_PROTECTED_BY_BACKUP_PLAN",
      "ControlScope":{"Tags":{"Environment":"prod"}}
    },
    {
      "ControlName":"BACKUP_RECOVERY_POINT_MINIMUM_RETENTION_CHECK",
      "ControlInputParameters":[{"ParameterName":"requiredRetentionDays","ParameterValue":"30"}]
    }
  ]'

# 9. Restore Testing Plan (정기 자동 복원 검증)
aws backup create-restore-testing-plan \
  --restore-testing-plan '{
    "RestoreTestingPlanName":"MonthlyRestoreTest",
    "ScheduleExpression":"cron(0 6 1 * ? *)",
    "RecoveryPointSelection":{"Algorithm":"LATEST_WITHIN_WINDOW","IncludeVaults":["*"]}
  }'
```

---

## 📝 연습 문제

**문제 1.** 회사가 RDS·EBS·DynamoDB·EFS를 한 정책으로 통합 백업 + 컴플라이언스 보고하려 한다. 가장 적합한 도구는?

A) DLM
B) AWS Backup (Plan + Audit Manager Framework)
C) Custom Lambda
D) Snapshot 수동

**정답: B**
해설: DLM은 EBS/AMI만. AWS Backup이 다수 서비스 통합 + Backup Audit Manager로 컴플라이언스. 표준 선택.

---

**문제 2.** Ransomware 공격으로 운영 계정의 백업까지 삭제되는 시나리오를 막으려면?

A) IAM 강화
B) Cross-Account Backup + Central Vault에 Vault Lock(Compliance 모드)
C) S3 백업
D) MFA

**정답: B**
해설: 핵심 방어. Member 계정 손상돼도 별도 Audit Account의 Vault는 안전. Vault Lock Compliance는 사용자도 해제 불가.

---

**문제 3.** Vault Lock Compliance 모드 적용 후 후회된다. 해제하려면?

A) Cooling-off 3일 내 가능, 그 후 영구
B) IAM 권한으로
C) AWS Support 요청
D) 절대 해제 불가

**정답: A**
해설: Compliance 모드는 3일 cooling-off 후 영구. 그 사이엔 해제 가능. 적용 전 신중히.

---

**문제 4.** RDS DB의 5초 전 상태로 복원하려 한다. 어떤 기능?

A) Snapshot
B) Point-in-time Recovery (PITR / Continuous Backup) - 임의 시점 복원
C) Read Replica
D) Manual export

**정답: B**
해설: RDS/Aurora/DDB/S3는 PITR 지원. 백업 retention 기간 내 임의 시점(초 단위) 복원 가능.

---

**문제 5.** Backup 정책이 모든 prod 리소스에 적용되고 있는지 자동 검증하려면?

A) 수동 점검
B) AWS Backup Audit Manager Framework (BACKUP_RESOURCES_PROTECTED_BY_BACKUP_PLAN 등)
C) CloudWatch
D) Config

**정답: B**
해설: Backup Audit Manager의 정확한 사용 사례. Control 기반 자동 검증 + 컴플라이언스 보고서. Audit Manager와 통합.

---

## 📌 오늘의 요약

1. AWS Backup = 다수 서비스(EBS/RDS/DDB/EFS/FSx/S3) 통합 백업 + 컴플라이언스
2. Plan(Rule들) + Vault(저장소) + Selection(대상). 태그 기반 자동 할당
3. Vault Lock Compliance = 영구 변경 불가 (3일 cooling-off 후). Ransomware 방어
4. Cross-Account Copy로 Central Audit Account에 백업 격리
5. PITR (RDS/Aurora/DDB/S3) - 임의 시점 복원. Restore Testing Plan으로 정기 검증
