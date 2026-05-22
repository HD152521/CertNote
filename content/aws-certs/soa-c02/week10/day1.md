# Day 1 - EBS Snapshot, AMI, DLM (Data Lifecycle Manager)

📅 날짜: Week 10 (Day 1)
🎯 주제: 가장 기본적인 백업 단위 — Snapshot과 AMI 자동화
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- EBS Snapshot의 동작과 비용 모델을 이해한다
- AMI 생성 시 스냅샷이 포함되는 메커니즘을 안다
- DLM으로 스냅샷·AMI를 자동 백업·정리한다

---

## 🧩 사전 지식 (CS 기초)

- **Incremental backup**: 변경된 블록만 백업. 시간·비용 절약
- **Snapshot consistency**: 디스크 일관성 (crash-consistent vs application-consistent)
- **RTO / RPO**: 복구 시간 / 데이터 손실 허용 시간
- **Backup window**: 백업 작업 시간대. 운영 영향 최소화
- **Cross-Region copy**: 다른 리전 복제. DR 필수

---

## 📖 이론 내용

### 1. EBS Snapshot

#### 개념
- EBS 볼륨의 시점 백업
- S3에 저장 (사용자가 직접 접근 X)
- **Incremental**: 변경된 블록만 저장 → 빠르고 저렴

#### 비용
- 저장된 블록 GB당 월 비용 ($0.05/GB-월, 표준)
- Cross-Region/Cross-Account 복사 시 데이터 전송 비용
- **Archive Tier**: 90일+ 보관 시 75% 저렴 (단, 복원 시 추가 비용·시간)

#### 일관성

| 모드 | 의미 |
|------|------|
| **Crash-consistent (기본)** | 디스크 그대로 백업. 앱 메모리 데이터 손실 가능 |
| **Application-consistent** | 앱이 명시적 신호 후 백업 (SSM Run Command + fsfreeze 등) |

#### 운영 패턴
- VSS (Windows) / fsfreeze (Linux) 활용
- SSM Document `AWS-CreateSnapshot`이 이런 작업 자동화

### 2. AMI

#### 개념
- EC2 부팅 이미지. 루트 볼륨 + 추가 EBS 볼륨 + 메타데이터
- AMI 생성 = 모든 EBS 볼륨의 Snapshot 생성

#### AMI 유형
- **EBS-backed** (대부분): 루트가 EBS. 중지·재시작 가능
- **Instance Store-backed** (드묾): 루트가 인스턴스 스토어. 중지 불가

#### 공유
- 다른 AWS 계정에 공유 (AMI Launch Permission)
- 암호화된 AMI는 KMS Key 함께 공유 필요
- Public AMI: AWS Marketplace 또는 Community

### 3. AWS Data Lifecycle Manager (DLM)

#### 개념
- EBS Snapshot, AMI를 자동 백업·정리
- 태그 기반 스케줄

#### Policy Type
- **EBS Snapshot Policy**: 볼륨 단위
- **EBS-backed AMI Policy**: 인스턴스 단위 (AMI 생성)
- **Cross-Region Copy** (별도 정책)
- **Event-Based Policy**: 다른 계정 공유 자동 복제

#### Schedule 옵션
- Cron 또는 Rate
- Retention: Count(개수) 또는 Age(기간)
- Fast Snapshot Restore: 즉시 복원 가능 (추가 비용)

#### 예시
```bash
aws dlm create-lifecycle-policy \
  --description "Daily AMI 7-day retention" \
  --state ENABLED \
  --execution-role-arn arn:aws:iam::123:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{
    "PolicyType":"IMAGE_MANAGEMENT",
    "ResourceTypes":["INSTANCE"],
    "TargetTags":[{"Key":"Backup","Value":"daily"}],
    "Schedules":[{
      "Name":"Daily AMI",
      "CreateRule":{"CronExpression":"cron(0 3 ? * * *)"},
      "RetainRule":{"Count":7},
      "TagsToAdd":[{"Key":"BackupType","Value":"DailyAMI"}],
      "CrossRegionCopyRules":[{
        "TargetRegion":"us-east-1",
        "Encrypted":true,
        "CmkArn":"arn:aws:kms:us-east-1:123:key/abc",
        "RetainRule":{"IntervalUnit":"DAYS","Interval":7}
      }]
    }]
  }'
```

### 4. EBS Snapshot Lock

#### 개념
- 스냅샷을 일정 기간 삭제 불가로 강제
- 컴플라이언스 / Ransomware 방어

#### 모드
- **Governance**: 특정 IAM 사용자가 잠금 해제 가능
- **Compliance**: 절대 해제 불가 (사용자도)

### 5. Cross-Region / Cross-Account 복사

#### Cross-Region Copy
- DR 대비 다른 리전에 복제
- KMS 키도 새 리전에 있어야 (또는 Multi-Region Key)

#### Cross-Account Sharing
- Snapshot 공유: ModifySnapshotAttribute로 다른 계정 ARN 추가
- Cross-Account Copy: 공유받은 계정이 자기 KMS Key로 다시 복사

### 6. Fast Snapshot Restore (FSR)

#### 개념
- 스냅샷에서 새 볼륨 생성 시 즉시 모든 IO 가용
- 일반: 첫 사용 시 lazy load → 느림
- FSR: 백그라운드 미리 hydrate

#### 비용
- AZ당 시간당 비용 → 비쌈
- 중요한 DR 시나리오에만 활성화

### 7. Snapshot 운영 함정

#### 비용 폭증 원인
- 오래된 Snapshot 무한 누적 → DLM 없으면 수동 정리
- 큰 EBS의 매시간 Snapshot
- Cross-Region 복사 누적

#### 복원 시간
- 일반 Snapshot → 새 볼륨: 즉시 생성, IO는 lazy
- 큰 볼륨은 fully hydrated 까지 시간 소요
- FSR로 단축 가능

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Recycle Bin** | 삭제된 Snapshot/AMI 복구 가능 | 실수 방지 |
| **EBS Direct API** | Snapshot 블록 직접 읽기 | 백업 통합 |
| **EBS Multi-Attach** | 한 EBS를 여러 인스턴스에 (io1/io2) | HA 워크로드 |
| **AMI Lifecycle in Image Builder** | DLM과 별도 정책 가능 | Week 7 복습 |
| **EBS Encryption by Default** | 계정·리전 단위 설정 | 모범 사례 |

> ⚠️ **함정 1**: AMI 삭제 시 연관 Snapshot은 자동 삭제 X — 수동 정리 또는 DLM 정책 필요.
>
> ⚠️ **함정 2**: 암호화된 EBS의 Snapshot도 자동 암호화. 다른 계정·리전 복사 시 KMS 키 매핑 신중.
>
> 💡 **암기 팁**: DLM(EBS/AMI 전용) ↔ AWS Backup(전 서비스). DLM이 가볍고 EBS 특화.

### 관련 서비스 Cross-Reference

- **DLM → Week 7 Image Builder** (별도 정책 가능)
- **EBS Snapshot → Week 9 KMS Multi-Region Key**
- **AMI → Week 7 Day 3** (Golden AMI)
- **Recycle Bin → Week 10 Day 2** (AWS Backup도 비슷)

---

## 🏗️ 아키텍처 다이어그램

```
DLM 자동 백업 파이프라인
==========================================================

   [태그 부여]
   EC2 instance / EBS volume
       Key=Backup, Value=daily
              │
              ▼
   ┌──────────────────────────────┐
   │  DLM Lifecycle Policy        │
   │  - cron(0 3 * * *)           │ ← 매일 새벽 3시
   │  - RetainCount: 7            │
   │  - CrossRegion → us-east-1   │
   └──────┬───────────────────────┘
          │
          ▼ 스케줄 도래
   [Snapshot/AMI 자동 생성]
          │
          ▼
   [7개 초과분 자동 삭제]
          │
          ▼
   [Cross-Region 자동 복제]
          │
          ▼
   us-east-1 보존 (DR용)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **EBS Snapshot은 Incremental** — 변경 블록만, S3에 저장 (직접 접근 X)
2. ⭐ **AMI = 모든 EBS 볼륨의 Snapshot + 메타데이터**
3. ⭐ **DLM = EBS/AMI 자동 백업·정리** — 태그 기반 스케줄
4. ⭐ **AMI 삭제 시 연관 Snapshot은 자동 삭제 X** — 수동/DLM 정리
5. ⭐ **Snapshot Lock (Governance/Compliance)** — Ransomware 방어

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. 수동 Snapshot 생성
SNAPSHOT_ID=$(aws ec2 create-snapshot \
  --volume-id vol-abc \
  --description "Pre-deploy backup" \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Name,Value=pre-deploy-2026-05-22}]' \
  --query 'SnapshotId' --output text)

# 2. AMI 생성 (인스턴스 정지 없이)
AMI_ID=$(aws ec2 create-image \
  --instance-id i-abc \
  --name "web-server-2026-05-22" \
  --description "Pre-patch backup" \
  --no-reboot \
  --tag-specifications 'ResourceType=image,Tags=[{Key=Backup,Value=manual}]' \
  --query 'ImageId' --output text)

# 3. DLM Snapshot Policy (매일, 7일 보관, Cross-Region)
aws dlm create-lifecycle-policy \
  --description "Daily EBS Snapshot 7-day" \
  --state ENABLED \
  --execution-role-arn arn:aws:iam::123:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{
    "PolicyType":"EBS_SNAPSHOT_MANAGEMENT",
    "ResourceTypes":["VOLUME"],
    "TargetTags":[{"Key":"Backup","Value":"daily"}],
    "Schedules":[{
      "Name":"Daily",
      "CreateRule":{"CronExpression":"cron(0 3 ? * * *)"},
      "RetainRule":{"Count":7},
      "TagsToAdd":[{"Key":"Type","Value":"DailySnapshot"}],
      "CrossRegionCopyRules":[{
        "TargetRegion":"us-east-1",
        "Encrypted":true,
        "RetainRule":{"IntervalUnit":"DAYS","Interval":7}
      }]
    }]
  }'

# 4. Snapshot Lock (Governance 모드)
aws ec2 lock-snapshot \
  --snapshot-id $SNAPSHOT_ID \
  --lock-mode governance \
  --lock-duration 30  # 30일

# 5. Cross-Region Copy (수동)
aws ec2 copy-snapshot \
  --source-region ap-northeast-2 \
  --source-snapshot-id $SNAPSHOT_ID \
  --destination-region us-east-1 \
  --encrypted \
  --kms-key-id alias/dr-key

# 6. Cross-Account 공유
aws ec2 modify-snapshot-attribute \
  --snapshot-id $SNAPSHOT_ID \
  --attribute createVolumePermission \
  --operation-type add \
  --user-ids 222233334444

# 7. Fast Snapshot Restore 활성화
aws ec2 enable-fast-snapshot-restores \
  --availability-zones ap-northeast-2a ap-northeast-2c \
  --source-snapshot-ids $SNAPSHOT_ID

# 8. Snapshot에서 새 볼륨 생성
NEW_VOL=$(aws ec2 create-volume \
  --snapshot-id $SNAPSHOT_ID \
  --availability-zone ap-northeast-2a \
  --volume-type gp3 \
  --query 'VolumeId' --output text)

# 9. 운영 점검 - 미사용 오래된 Snapshot
aws ec2 describe-snapshots \
  --owner-ids self \
  --query 'Snapshots[?StartTime<`2025-01-01`].[SnapshotId,StartTime,VolumeSize,Description]' \
  --output table

# 10. Recycle Bin 활성화
aws rbin create-rule \
  --retention-period RetentionPeriodValue=7,RetentionPeriodUnit=DAYS \
  --description "EBS Snapshot 7-day recycle" \
  --resource-type EBS_SNAPSHOT \
  --resource-tags 'ResourceTagKey=Environment,ResourceTagValue=prod'
```

---

## 📝 연습 문제

**문제 1.** EBS 볼륨 1TB의 매시간 Snapshot을 만들었더니 첫 달 비용이 예상보다 적다. 이유는?

A) AWS 할인
B) EBS Snapshot은 Incremental - 변경 블록만 저장. 매시간 변경분이 작으면 비용 작음
C) Free tier
D) 압축

**정답: B**
해설: EBS Snapshot 비용 모델의 핵심. 첫 Snapshot은 전체 크기, 이후는 변경된 블록만. 변경량 적으면 누적 비용 효율적.

---

**문제 2.** AMI를 삭제했더니 연관된 EBS Snapshot이 그대로 남아 비용 청구된다. 어떻게 정리?

A) AMI 삭제 시 자동
B) 수동 또는 DLM 정책으로 별도 정리 — AMI 삭제는 Snapshot 미삭제
C) EC2 종료
D) 무시

**정답: B**
해설: 시험 함정. AMI 삭제(deregister) ≠ Snapshot 삭제. AMI deregister 후 연관 Snapshot 수동 또는 DLM `--delete-with-image` 옵션으로 자동 정리.

---

**문제 3.** Ransomware 공격으로 Snapshot까지 삭제되는 시나리오를 막으려면?

A) S3 백업
B) Snapshot Lock (Compliance 모드 - 절대 삭제 불가) 또는 Cross-Account 백업
C) IAM Policy만
D) AMI

**정답: B**
해설: Snapshot Lock의 Compliance 모드는 사용자도 해제 불가. Ransomware 방어용. Governance는 권한자가 해제 가능.

---

**문제 4.** 큰 Snapshot에서 새 EBS 볼륨을 만들었는데 첫 IO가 매우 느리다. 해결책은?

A) Snapshot 다시 만들기
B) Fast Snapshot Restore (FSR) 활성화 - 미리 hydrate
C) 무시
D) 더 작은 인스턴스

**정답: B**
해설: 일반 Snapshot → 볼륨은 lazy load (첫 사용 시 hydrate). FSR이 백그라운드 hydrate → 즉시 최대 성능. 단, 비용 ↑.

---

**문제 5.** DR 대비 ap-northeast-2의 Snapshot을 us-east-1에도 자동 복제하려면?

A) 수동 copy
B) DLM Cross-Region Copy Rule 추가
C) S3 Replication
D) Backup만

**정답: B**
해설: DLM 정책에 Cross-Region Copy Rule을 명시. 매 스냅샷 생성 시 자동으로 다른 리전에 복제. KMS Key는 대상 리전에도 필요.

---

## 📌 오늘의 요약

1. EBS Snapshot은 Incremental — 변경 블록만 S3에 저장. 직접 접근 불가
2. AMI = 모든 EBS 볼륨의 Snapshot + 메타데이터. AMI 삭제 ≠ Snapshot 자동 삭제
3. DLM = EBS/AMI 자동 백업·정리·Cross-Region. 태그 기반 스케줄
4. Snapshot Lock (Governance/Compliance) - Ransomware 방어
5. FSR = 즉시 최대 IO 성능. Cross-Region Copy + Recycle Bin로 안전 강화
