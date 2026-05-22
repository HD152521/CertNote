# Day 52 - DR 전략 4단계: Backup~Active/Active

📅 날짜: Week 11 (Day 2)
🎯 주제: 재해 복구 4단계
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 4가지 DR 전략의 RTO/RPO/비용 trade-off를 안다
- 시나리오 키워드를 4단계 중 하나로 매핑한다

---

## 🧩 사전 지식 (CS 기초)

- **MTTR**: 평균 복구 시간. RTO와 비슷.
- **백업 vs 복제**: 백업은 시점 스냅샷 / 복제는 지속 동기화.
- **콜드 vs 핫**: 다른 리전이 켜져 있나 / 꺼져 있나.

---

## 📖 이론 내용

### 1. AWS 4대 DR 전략

| 전략 | RTO | RPO | 비용 |
|------|-----|-----|------|
| **Backup & Restore** | 시간 단위 | 분~시간 | 가장 ↓ |
| **Pilot Light** | 10분~수시간 | 분 | ↓ |
| **Warm Standby** | 분 | 초~분 | ↑ |
| **Multi-Site (Active-Active)** | 거의 0 | 거의 0 | 가장 ↑ |

### 2. Backup & Restore

- **AWS Backup / 스냅샷 Cross-Region 복사**.
- 재해 시 스냅샷에서 새 환경 만들기.
- 가장 저렴, 가장 느림.

### 3. Pilot Light

- **데이터는 동기화**(RDS Replica, DDB Global, S3 CRR).
- 앱 인프라는 **꺼져 있음** (또는 최소).
- 장애 시 빠르게 켜고 라우팅.

### 4. Warm Standby

- 축소된 환경이 항상 켜져 있음.
- 장애 시 스케일 업 + 트래픽 전환.

### 5. Multi-Site Active-Active

- 양쪽 리전이 트래픽 받음.
- Aurora Global / DDB Global Tables.
- Route 53 Latency / Failover.

### 6. AWS Elastic Disaster Recovery (DRS)

- 온프레/AWS 워크로드를 **블록 레벨 실시간 복제** → 다른 리전.
- 페일오버 시 EC2로 부팅 (분 단위 RTO).
- 비용 효율적인 Pilot Light 옵션.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **AWS Backup Vault Lock** | WORM 백업 (변조 방지) | 규제 |
| **Backup Cross-Account / Cross-Region** | 통합 백업 | 관리 단순화 |
| **Cross-region snapshot copy** | EBS / RDS / Aurora | 백업 DR |
| **Route 53 ARC (Application Recovery Controller)** | 리전 페일오버 강력 제어 | 신규 |
| **Resilience Hub** | DR 평가 + 추천 | 거버넌스 |

> ⚠️ **함정**: RTO 1분 + RPO 1초 = **Multi-Site Active-Active 또는 Aurora Global + Active**. Backup-Restore로는 불가.

> 💡 **암기 팁**: RTO/RPO 작아질수록 비용 ↑.

### 관련 서비스 Cross-Reference

- Aurora Global → Week 5
- Route 53 → Day 3
- DataSync / Snow → Day 4

---

## 🏗️ 아키텍처 다이어그램

```
[ DR 단계별 ]

  Backup-Restore:   Region A 운영 / Region B 백업 보관만
  Pilot Light:      Region A 운영 / Region B DB 복제 + 앱 OFF
  Warm Standby:     Region A 운영 / Region B 축소 환경 ON
  Active-Active:    Region A·B 모두 풀스택 + Global DB
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ RTO/RPO 작아질수록 비용 ↑.
2. ⭐ Pilot Light = DB 복제 + 앱 OFF.
3. ⭐ DRS는 비용 효율적 Pilot Light.
4. ⭐ Multi-Site = Aurora Global + DDB Global + Route 53.
5. ⭐ AWS Backup으로 통합 백업·Cross-Region.

---

## 💻 실제 예시 - AWS CLI

```bash
# AWS Backup Plan
aws backup create-backup-plan --backup-plan '{
  "BackupPlanName":"saa-plan",
  "Rules":[{
    "RuleName":"daily","TargetBackupVaultName":"Default",
    "ScheduleExpression":"cron(0 5 ? * * *)",
    "Lifecycle":{"DeleteAfterDays":30}
  }]
}'

# 리전 간 스냅샷 복사
aws ec2 copy-snapshot --source-region ap-northeast-2 \
  --source-snapshot-id snap-... --destination-region us-east-1
```

---

## 📝 연습 문제

**문제 1.** RTO 6시간 / RPO 1시간 / 비용 최저:

A) Backup-Restore B) Pilot Light C) Warm Standby D) Active-Active

**정답: A**.

---

**문제 2.** RTO 1분 / RPO ~0:

A) Backup-Restore B) Pilot Light C) Warm Standby D) Multi-Site Active-Active

**정답: D**.

---

**문제 3.** 온프레 → AWS 블록 실시간 복제:

A) AWS Backup B) AWS DRS C) DMS D) Snowball

**정답: B**.

---

**문제 4.** 통합 백업(EBS·EFS·RDS·DDB·S3) 중앙 관리:

A) AWS Backup B) DataSync C) Storage Gateway D) Snow

**정답: A**.

---

**문제 5.** Backup Vault에 WORM:

A) IAM 정책 B) Backup Vault Lock C) S3 Lock D) MFA Delete

**정답: B**.

---

## 📌 오늘의 요약

1. 4단계 DR: Backup-Restore / Pilot Light / Warm Standby / Active-Active.
2. RTO/RPO 작아질수록 비용 ↑.
3. AWS DRS는 비용 효율적 Pilot Light 도구.
4. AWS Backup으로 통합·Cross-Region·Vault Lock.
5. 시나리오 키워드 → 단계 매핑이 시험 정답 패턴.
