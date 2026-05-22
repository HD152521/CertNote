# Day 3 - DR 4종 전략 - Backup/Pilot/Warm/Active

📅 날짜: Week 13 (Day 3)
🎯 주제: RTO/RPO/비용의 4단계 트레이드오프
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 4가지 DR 전략의 RTO/RPO/비용 매트릭스
- 각 전략의 AWS 구현 예
- AWS Backup으로 통합 백업 자동화
- DR drill 자동화 패턴

---

## 🧩 사전 지식 (CS 기초)

- **RTO**: 복구 시간 목표 (얼마나 빨리 복구)
- **RPO**: 복구 시점 목표 (얼마나 많은 데이터 손실 허용)
- **Cold/Warm/Hot Standby**: 대기 환경의 활성 정도.

---

## 📖 이론 내용

### 1. 4 전략 매트릭스

| 전략 | RTO | RPO | 비용 인덱스 |
|------|-----|-----|------------|
| **Backup & Restore** | 시간~일 | 시간 | 5 |
| **Pilot Light** | 10분~수십분 | 분 | 20 |
| **Warm Standby** | 분 | 초~분 | 50 |
| **Multi-Site Active-Active** | 0 (트래픽 시프트만) | 거의 0 | 100 |

### 2. Backup & Restore

- AWS Backup, EBS Snapshot, RDS Backup
- 정기적 스냅샷 + S3 Cross-Region Copy
- Disaster 시 새 환경 프로비저닝 (수 시간)
- 적합: 비중요 워크로드, 비용 최저화

### 3. Pilot Light

- DR region에 **최소 인프라**(DB replica + AMI) 상시 운영
- App tier는 꺼둠 → Disaster 시 자동 시작
- DNS 페일오버
- 적합: Tier 2 (RTO 30분 허용)

### 4. Warm Standby

- DR region에 **축소된 환경** 상시 운영 (예: 1 ALB + 2 EC2 + DB replica)
- 트래픽 0 또는 일부 read
- 페일오버 시 즉시 트래픽 + Auto Scaling으로 확장
- 적합: Tier 1 (RTO 5분)

### 5. Multi-Site Active-Active

- 두 region에서 동시 트래픽 처리
- Aurora Global / DynamoDB Global Tables
- Route 53 Latency Routing
- 적합: Tier 0 (RTO 0)

### 6. AWS Backup

```bash
aws backup create-backup-plan --backup-plan '{
  "BackupPlanName":"prod-daily",
  "Rules":[{
    "RuleName":"DailyBackup",
    "TargetBackupVaultName":"prod-vault",
    "ScheduleExpression":"cron(0 5 * * ? *)",
    "Lifecycle":{"DeleteAfterDays":30},
    "CopyActions":[{
      "DestinationBackupVaultArn":"arn:aws:backup:us-east-1:...:backup-vault:dr-vault",
      "Lifecycle":{"DeleteAfterDays":90}
    }]
  }]
}'

aws backup create-backup-selection --backup-plan-id ... --backup-selection '{
  "SelectionName":"prod-resources",
  "IamRoleArn":"arn:aws:iam::...:role/AWSBackupDefaultServiceRole",
  "ListOfTags":[{"ConditionType":"STRINGEQUALS","ConditionKey":"Backup","ConditionValue":"prod"}]
}'
```

- 통합 백업: EBS, EFS, RDS, DynamoDB, S3, Aurora, FSx, Storage Gateway, Neptune, DocumentDB, Redshift
- Cross-Region Copy + Cross-Account
- Backup Vault Lock (immutable)

### 7. DR Drill 자동화

- FIS (Week 13 Day 4)
- Route 53 ARC Routing Control 수동 전환
- Step Functions 워크플로로 DR runbook 실행
- 정기 검증 (분기/월)

---

## 🧠 알아두면 좋은 심화 이론

### Backup Vault Lock (Immutable)

```bash
aws backup put-backup-vault-lock-configuration \
  --backup-vault-name prod-vault \
  --min-retention-days 30 --max-retention-days 365 \
  --changeable-for-days 3
```

- 랜섬웨어 방어 — 백업 변경/삭제 불가
- 규제 컴플라이언스

### Cost-Effective DR Patterns

- Pilot Light에서 ASG `min=0 max=N` → Disaster 시 desired 증가
- RDS Snapshot Restore + Read Replica를 Standalone Promote

### Region Pair Selection

- Latency
- Geographic distance (geographic isolation 요구 시)
- Service availability (모든 region에 모든 서비스 X)
- Regulatory (데이터 주권)

### 관련 서비스 Cross-Reference

- **AWS Backup** → 이번 Day
- **Resilience Hub** → Week 13 Day 4
- **Route 53 ARC** → Week 13 Day 2

---

## 🏗️ 아키텍처 다이어그램

```
DR Tier vs Strategy
==================================================

  Cost      RTO       RPO        Strategy            Use Case
  ───────────────────────────────────────────────────────────────
  $$        hours     hours      Backup & Restore    Tier 3 일반
  $$$       30min     minutes    Pilot Light         Tier 2 운영 시스템
  $$$$      5min      seconds    Warm Standby        Tier 1 중요 서비스
  $$$$$     0         ~0         Active-Active       Tier 0 mission critical
  ───────────────────────────────────────────────────────────────

  AWS Backup
   ├─ 다중 리소스 통합
   ├─ Cross-Region copy
   ├─ Cross-Account
   └─ Vault Lock (immutable)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ 4 전략의 RTO/RPO/비용 매트릭스 외우기
2. ⭐ Backup & Restore = 가장 저렴, Active-Active = 가장 비싸고 빠름
3. ⭐ Pilot Light는 DB replica + AMI, Warm Standby는 축소 환경
4. ⭐ AWS Backup으로 통합 + Cross-Region Copy + Vault Lock
5. ⭐ DR drill 정기 검증 — FIS / ARC

---

## 💻 실제 예시

```bash
# Pilot Light 패턴
# Region A (Primary)
aws rds create-db-cluster ... --backup-retention-period 7

# Region B (DR) - Read Replica 상시
aws rds create-db-cluster --replication-source-identifier arn:aws:rds:us-east-1:...:cluster:prod \
  --db-cluster-identifier prod-dr

# Region B에 AMI / Launch Template 준비, ASG는 desired=0
aws autoscaling create-auto-scaling-group --auto-scaling-group-name prod-dr \
  --min-size 0 --max-size 20 --desired-capacity 0 --launch-template ...

# Route 53 Failover (Day 2 참조)

# DR 발동 (자동화 Lambda)
# 1) Read Replica를 Standalone Promote
aws rds promote-read-replica-db-cluster --db-cluster-identifier prod-dr
# 2) ASG desired 증가
aws autoscaling set-desired-capacity --auto-scaling-group-name prod-dr --desired-capacity 4
# 3) Route 53 페일오버 (Health Check 자동 또는 ARC 수동)
```

---

## 📝 연습 문제

**1.** "RTO 5분, 비용 중간, 데이터 손실 초~분" 전략?  A) Warm Standby  **정답: A**

**2.** "RTO 0, 비용 무제한 허용" 전략?  A) Active-Active  **정답: A**

**3.** "비중요 워크로드, 가장 저렴"?  A) Backup & Restore  **정답: A**

**4.** AWS Backup의 핵심 기능?  A) 다중 리소스 통합 + Cross-Region/Account Copy + Vault Lock  **정답: A**

**5.** Vault Lock 용도?  A) Immutable 백업 — 랜섬웨어 방어 + 컴플라이언스  **정답: A**

**6.** Pilot Light의 본질?  A) DB replica + AMI 상시 + App tier off, Disaster 시 자동 시작  **정답: A**

**7.** DR Drill 자동화?  A) Route 53 ARC + FIS + Step Functions Runbook  **정답: A**

---

## 📌 오늘의 요약

1. 4 전략의 RTO/RPO/비용 매트릭스
2. AWS Backup 통합 + Cross-Region + Vault Lock
3. Pilot Light = DB replica + AMI
4. Warm Standby = 축소 환경
5. Active-Active = Aurora Global + DDB Global Tables
