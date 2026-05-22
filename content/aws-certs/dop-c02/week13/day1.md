# Day 1 - Multi-AZ 패턴 - RDS, Aurora, ElastiCache

📅 날짜: Week 13 (Day 1)
🎯 주제: 단일 리전 내 고가용성 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- RDS Multi-AZ vs Read Replica의 본질 차이
- Aurora 클러스터 토폴로지
- ElastiCache Redis Cluster Mode (replication group)
- 페일오버 시간(RTO) 비교

---

## 🧩 사전 지식 (CS 기초)

- **Synchronous Replication**: 동기 복제. 일관성 ↑, 성능 ↓.
- **Asynchronous Replication**: 비동기 복제. 성능 ↑, 데이터 손실 위험 ↑.
- **Quorum**: 다수결. Aurora 6-way 쿼럼.
- **Endpoint**: 클라이언트가 접속하는 DNS 이름. 자동 페일오버 시에도 유지.

---

## 📖 이론 내용

### 1. RDS Multi-AZ

- Primary + Standby (다른 AZ)
- **동기 복제** (block-level)
- 페일오버 시 DNS endpoint 동일, IP 변경 (1~2분)
- Standby에서 직접 읽기 X (RDS Multi-AZ DB Cluster는 가능)
- 백업/유지보수는 Standby에서

### 2. RDS Read Replica

- 비동기 복제 (read 성능 분산)
- 다른 AZ/Region 가능 (Region 간 비동기)
- 별도 endpoint
- Promote로 standalone 승격 가능

### 3. RDS Multi-AZ DB Cluster (2022+)

- 1 Primary + 2 Readable Standby (3개 AZ)
- 모든 standby에서 read 가능
- semi-synchronous (commit 시 1 standby 응답 충분)
- 페일오버 35초 이내 (Multi-AZ 1~2분 대비 단축)
- 대상 엔진: MySQL/PostgreSQL

### 4. Aurora 토폴로지

```
Aurora Cluster
   ├─ Writer Node (1)
   ├─ Reader Nodes (0-15)
   └─ Cluster Volume (shared storage, 6-way replicated across 3 AZ)
```

- 스토리지가 6 copies + 3 AZ에 분산 — 4/6 write quorum, 3/6 read quorum
- 단일 노드 장애 시 30초 이내 페일오버
- Reader endpoint = 로드 밸런싱된 read 진입점
- Writer/Reader Auto Scaling

### 5. Aurora Global Database

- Primary region + 최대 5 secondary region
- 비동기 (typically <1초 lag)
- Region 장애 시 secondary를 standalone primary로 promote (1분 내)
- Read latency: secondary region 사용자에 가까운 곳 read

### 6. ElastiCache Redis

- **Cluster Mode Disabled**: 단일 shard + 0-5 replica
- **Cluster Mode Enabled**: N shard, 각각 0-5 replica
- Primary 장애 시 자동 페일오버
- Multi-AZ 활성 필수 (HA용)

### 7. 페일오버 RTO 비교

| 구성 | RTO |
|------|-----|
| RDS Single-AZ | 수동 (분~시간) |
| RDS Multi-AZ | 60-120초 자동 |
| RDS Multi-AZ DB Cluster | <35초 |
| Aurora | <30초 |
| Aurora Global (region 페일오버) | <1분 |
| ElastiCache Redis Multi-AZ | <60초 |
| DynamoDB | 0 (글로벌 분산) |

---

## 🧠 알아두면 좋은 심화 이론

### DNS Endpoint vs IP

페일오버 시 endpoint(DNS 이름) 동일. 클라이언트가 짧은 TTL(5초)로 캐시하면 빠른 복구.

### Aurora Backtrack (MySQL)

특정 시점으로 클러스터 자체 되돌리기 (S3 별도 백업 없이). 72시간 윈도우.

### Connection Pooling — RDS Proxy

- Connection pool 관리
- DB 페일오버 시 클라이언트는 Proxy에 연결 유지
- IAM 인증 통합

### Storage 자동 확장

Aurora는 cluster volume 자동 확장 (128TB까지). RDS도 Storage Autoscaling 옵션.

### 관련 서비스 Cross-Reference

- **Multi-Region** → Week 13 Day 2
- **DR 전략** → Week 13 Day 3
- **DynamoDB Global Tables** → Week 13 Day 2

---

## 🏗️ 아키텍처 다이어그램

```
Aurora Cluster (single region)
==================================================

     Writer endpoint
          │
          ▼
   ┌──────────────────────────┐
   │ Writer (AZ-a)            │
   │  │                       │
   └──┼───────────────────────┘
      │
      │ (replication via cluster volume)
      ▼
   ┌──────────────────────────────────────┐
   │ Cluster Volume                       │
   │  6 copies across 3 AZ                │
   │  4/6 write quorum, 3/6 read quorum   │
   └──┬──────────┬──────────┬─────────────┘
      ▼          ▼          ▼
   Reader-a   Reader-b   Reader-c
      ▲          ▲          ▲
      └──────────┴──────────┘
            Reader endpoint
              (load-balanced)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ RDS Multi-AZ = 동기 + 자동 페일오버 (Standby 직접 read X)
2. ⭐ Read Replica = 비동기 + read 분산 (별도 endpoint)
3. ⭐ Aurora = 6-way 스토리지 + writer + readers + 30초 페일오버
4. ⭐ Multi-AZ DB Cluster (RDS)는 standby에서 read 가능 + <35초
5. ⭐ ElastiCache Redis Multi-AZ는 자동 페일오버 (Cluster Mode 두 종류)

---

## 💻 실제 예시

```bash
# RDS Multi-AZ
aws rds create-db-instance --db-instance-identifier prod-mysql \
  --engine mysql --multi-az --backup-retention-period 7 \
  ...

# Aurora Cluster
aws rds create-db-cluster --db-cluster-identifier prod-aurora \
  --engine aurora-postgresql \
  --master-username admin \
  --manage-master-user-password \
  --backup-retention-period 7

aws rds create-db-instance --db-cluster-identifier prod-aurora \
  --db-instance-identifier prod-aurora-writer \
  --engine aurora-postgresql \
  --db-instance-class db.r6g.large

aws rds create-db-instance --db-cluster-identifier prod-aurora \
  --db-instance-identifier prod-aurora-reader-1 \
  --engine aurora-postgresql --db-instance-class db.r6g.large

# Aurora Global
aws rds create-global-cluster --global-cluster-identifier prod-global \
  --source-db-cluster-identifier arn:aws:rds:us-east-1:...:cluster:prod-aurora
```

---

## 📝 연습 문제

**1.** RDS Multi-AZ의 핵심?  A) 동기 복제 + 자동 페일오버 (Standby read 불가) B) read 분산  **정답: A**

**2.** Aurora의 6-way 스토리지?  A) 6 copy를 3 AZ에 분산 + 4/6 write 쿼럼  **정답: A**

**3.** 페일오버 시간이 가장 짧은 구성?  A) Aurora B) RDS Multi-AZ C) Single-AZ D) Read Replica  **정답: A**

**4.** Aurora Reader endpoint?  A) 모든 reader에 로드 밸런싱  **정답: A**

**5.** Read Replica의 본질?  A) 비동기 read 분산 + 별도 endpoint  **정답: A**

**6.** ElastiCache Redis Cluster Mode Enabled?  A) N shard + 각 0-5 replica, 데이터 파티셔닝  **정답: A**

**7.** "DB 페일오버 시 클라이언트 연결 안정"?  A) RDS Proxy + 짧은 TTL DNS  **정답: A**

---

## 📌 오늘의 요약

1. RDS Multi-AZ = 동기 + 자동 페일오버, Standby read 불가
2. Read Replica = 비동기 분산, 별도 endpoint
3. Aurora = 6-way 스토리지 + 30초 페일오버
4. Multi-AZ DB Cluster (RDS) = standby read + <35초
5. ElastiCache Redis Multi-AZ로 캐시 HA
