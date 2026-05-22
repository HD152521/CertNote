# Day 69 - RDS·Aurora·DynamoDB Global의 DR

📅 Week 14 (Day 4)
🎯 주제: 데이터 계층 DR
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- RDS·Aurora·DynamoDB의 Multi-AZ·Multi-Region·Global 차이
- 각 옵션의 RTO/RPO·일관성·비용 트레이드오프

---

## 🧩 사전 지식 (CS 기초)

- **Synchronous Replication**: 쓰기 시 모든 사본 확인 (강한 일관성·지연↑)
- **Asynchronous Replication**: 확인 없이 진행 (지연↓·약한 일관성)
- **Eventually Consistent**: 시간 지나면 일치

---

## 📖 이론 내용

### 1. RDS Multi-AZ

| 옵션 | 특징 |
|------|------|
| **Multi-AZ Instance** | 동기 복제·Standby (장애 시 자동 Failover, 60-120초) |
| **Multi-AZ Cluster** | 1 Writer + 2 Reader Standby — Readable Standby (35초 Failover) |
| **Read Replica** | 비동기·다른 리전 가능·읽기 확장 |

### 2. Aurora 가용성·DR

| 옵션 | 특징 |
|------|------|
| **Aurora Multi-AZ** | 1 Writer + ≤15 Readers, 데이터는 3 AZ 6개 사본 |
| **Aurora Global Database** | 1 Primary Region + ≤5 Secondary, RPO < 1s, RTO < 1min |
| **Read Replica (RDS Region)** | 단일 리전 (Aurora는 Global 권장) |

- **Cross-Region Failover Time**: Aurora Global = 약 1분
- **Read 처리량 확장**: 리전당 최대 16 Readers

### 3. DynamoDB Global Tables

- **다중 리전 Active-Active**
- 모든 리전 쓰기 가능 (Last Writer Wins)
- DDB Streams + 자동 복제
- RPO·RTO 거의 0

### 4. ElastiCache 다중 리전

- **Redis Global Datastore** — Primary 리전 + Secondary 리전 복제 (1초 미만)
- 한 Primary만 쓰기

### 5. S3 다중 리전

- **CRR (Cross-Region Replication)** — 비동기
- **MRAP (Multi-Region Access Point)** — 단일 엔드포인트로 다중 리전 라우팅
- **S3 Replication Time Control (RTC)** — SLA 15분

---

## 🧠 심화 이론

### 함정 매핑

| 시나리오 | 답 |
|----------|-----|
| RDS Failover 30초 | Multi-AZ Cluster |
| Aurora Multi-Region·1초 RPO | Aurora Global Database |
| Active-Active 다중 리전 DB | DynamoDB Global Tables |
| S3 다중 리전 + 단일 엔드포인트 | MRAP |
| Redis 다중 리전 복제 | Global Datastore |

### Pro 단골

- "RDS Multi-AZ 자동 Failover 시간" = 60-120초 (Cluster는 35초)
- "Aurora Global = RPO < 1s, RTO < 1min"
- "DDB Global Tables Active-Active"

---

## 🏗️ 아키텍처 — Aurora Global

```
[Region A: Primary]
   Writer + 15 Readers
        │ Storage Replication (< 1s)
        ▼
[Region B: Secondary]
   Reader (Read-Only) - 장애 시 Promote
[Region C-F: Secondary]
```

---

## ⭐ 핵심 포인트

1. ⭐ RDS Multi-AZ Cluster (3 노드) Failover 30초대
2. ⭐ Aurora Global RPO<1s·RTO<1min·최대 5 리전
3. ⭐ DDB Global Tables Active-Active
4. ⭐ Redis Global Datastore = 1 Primary·읽기만 Secondary
5. ⭐ S3 MRAP + CRR

---

## 💻 CLI 예시

```bash
# Aurora Global Cluster
aws rds create-global-cluster \
  --global-cluster-identifier app-global \
  --engine aurora-postgresql

# DDB Global Tables
aws dynamodb create-global-table \
  --global-table-name Orders \
  --replication-group RegionName=us-east-1 RegionName=ap-northeast-2
```

---

## 📝 연습 문제

**문제 1.** RDS Failover 30초·읽기 가능 Standby.

A) Multi-AZ Instance
B) Multi-AZ Cluster
C) Read Replica
D) Aurora

**정답: B**

---

**문제 2.** Aurora 멀티 리전·1초 RPO.

A) Read Replica
B) Aurora Global Database
C) Multi-AZ
D) DMS

**정답: B**

---

**문제 3.** DDB 양 리전 쓰기 가능.

A) Streams + Lambda 직접 복제
B) Global Tables
C) Cross-Region Snapshot
D) DAX

**정답: B**

---

**문제 4.** S3 다중 리전 단일 엔드포인트로 라우팅.

A) CloudFront
B) MRAP
C) Global Accelerator
D) Route 53

**정답: B**

---

**문제 5.** Redis 멀티 리전 복제.

A) Global Datastore
B) CRR
C) Stream
D) ElastiCache Replica만

**정답: A**

---

**문제 6.** Aurora Global Secondary 최대 개수.

A) 1
B) 3
C) 5
D) 10

**정답: C**

---

## 📌 오늘의 요약

1. RDS Multi-AZ Cluster Failover 30초
2. Aurora Global RPO<1s
3. DDB Global Active-Active
4. Redis Global Datastore (Primary 쓰기)
5. S3 MRAP·CRR·RTC
