# Day 54 - 마이그레이션: DMS, Snow, DataSync, MGN

📅 날짜: Week 11 (Day 4)
🎯 주제: AWS 마이그레이션 도구
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- DMS / SCT / Snow Family / DataSync / MGN 역할을 안다
- 시나리오 키워드로 정답을 선택한다
- 7R 마이그레이션 전략을 간단히 안다

---

## 🧩 사전 지식 (CS 기초)

- **Heterogeneous vs Homogeneous DB 마이그레이션**: 다른 엔진 vs 같은 엔진.
- **Lift-and-Shift**: 그대로 옮기기.
- **재플랫폼/재아키텍처**: 일부 또는 전체 재설계.

---

## 📖 이론 내용

### 1. AWS 마이그레이션 7R

- **Retire / Retain / Relocate / Rehost (lift-shift) / Repurchase (SaaS) / Replatform / Refactor**.

### 2. DMS (Database Migration Service)

- **온프레/RDS/Aurora 간 DB 마이그레이션** + 지속 복제(CDC).
- 같은 엔진(Homogeneous), 다른 엔진(Heterogeneous).
- 다른 엔진은 **SCT (Schema Conversion Tool)** 먼저.
- 다운타임 최소화 (full load + CDC).

### 3. Snow Family

| 장비 | 용량 | 사용 |
|------|-----|-----|
| **Snowcone** | 8TB | 엣지·작은 마이그레이션 |
| **Snowball Edge Storage** | ~80TB | 페타바이트 마이그 |
| **Snowball Edge Compute** | EC2/GPU 포함 | 엣지 컴퓨팅 |
| **Snowmobile** | 100PB 트럭 | 엑사바이트 |

### 4. DataSync

- **온라인 파일 마이그레이션·복제** (NFS/SMB/HDFS/S3/Object Storage).
- S3, EFS, FSx로.
- 스케줄 + 검증 + 대역폭 제한.
- Snow vs DataSync: 네트워크 가능하면 DataSync.

### 5. AWS Application Migration Service (MGN)

- **서버 lift-and-shift** (구 CloudEndure).
- 블록 레벨 실시간 복제.
- 대규모 데이터센터 이전.
- 비슷한 DRS와 다른 점: MGN은 마이그레이션 전용, DRS는 DR.

### 6. Migration Hub

- 진행 상황 추적·대시보드.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Storage Gateway** | 영구 하이브리드 | 마이그 아님 |
| **DataSync vs Storage Gateway** | 마이그/복제 vs 영구 캐시 | 자주 |
| **Snowball Edge Storage Optimized** | 다중 디바이스 클러스터 | 페타 |
| **Database Migration Accelerator** | 컨설팅 | 시험 가벼움 |
| **MGN replicate to other AZ** | 실시간 복제 | DR 비슷 |

> ⚠️ **함정**: "10TB + 네트워크 충분" → DataSync. "10TB + 네트워크 불충분" → Snowball.

> 💡 **암기 팁**: DB = DMS / 서버 = MGN / 파일 온라인 = DataSync / 오프라인 = Snow.

### 관련 서비스 Cross-Reference

- Storage Gateway → Week 4
- AWS Backup → Day 2
- DRS → Day 2

---

## 🏗️ 아키텍처 다이어그램

```
[ 마이그 도구 선택 트리 ]

  대상이 DB? ─ 예 ─ DMS (+SCT 다른 엔진)
       │
       └ 서버 통째? ─ MGN
                │
                └ 파일?
                   ├─ 네트워크 충분 → DataSync
                   └─ 네트워크 부족 → Snow
                          ├─ <8TB → Snowcone
                          ├─ <80TB → Snowball Edge
                          └─ 페타 → Snowmobile/Edge Cluster
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ DB → **DMS** (+ SCT 다른 엔진).
2. ⭐ 서버 → **MGN**.
3. ⭐ 파일 → **DataSync (네트워크)** / **Snow (오프라인)**.
4. ⭐ Snow는 8TB/80TB/100PB 규모로 선택.
5. ⭐ Migration Hub로 진행 추적.

---

## 💻 실제 예시 - AWS CLI

```bash
# DMS Replication Instance
aws dms create-replication-instance \
  --replication-instance-identifier saa-dms \
  --replication-instance-class dms.t3.medium --allocated-storage 50

# DMS Task (Full Load + CDC)
aws dms create-replication-task \
  --replication-task-identifier orders-migration \
  --source-endpoint-arn arn:... --target-endpoint-arn arn:... \
  --migration-type full-load-and-cdc \
  --table-mappings file://mappings.json

# DataSync Task
aws datasync create-task --source-location-arn arn:... \
  --destination-location-arn arn:... --name saa-sync
```

---

## 📝 연습 문제

**문제 1.** Oracle → Aurora PostgreSQL (다운타임 최소):

A) DMS + SCT (Full Load + CDC) B) Snow C) DataSync D) MGN

**정답: A**.

---

**문제 2.** 100TB 데이터, 네트워크 100Mbps:

A) DataSync B) DMS C) Snowball Edge D) MGN

**정답: C**.

---

**문제 3.** NFS 파일 시스템 → S3 정기 복제:

A) DataSync B) Snow C) Storage Gateway 영구 D) S3 CRR

**정답: A**.

---

**문제 4.** 200대 VM lift-and-shift:

A) DMS B) MGN C) Snow D) DRS

**정답: B**.

---

**문제 5.** 마이그레이션 진행 추적 대시보드:

A) Trusted Advisor B) Migration Hub C) CloudWatch D) Health Dashboard

**정답: B**.

---

## 📌 오늘의 요약

1. DB=DMS(+SCT), 서버=MGN, 파일=DataSync/Snow.
2. Snow Family는 8TB/80TB/100PB.
3. Storage Gateway는 영구 하이브리드, 마이그 아님.
4. MGN과 DRS는 다른 목적(마이그 vs DR).
5. Migration Hub로 거버넌스.
