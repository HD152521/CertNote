# Day 22 - Aurora: 아키텍처, Global DB, Serverless

📅 날짜: Week 5 (Day 2)
🎯 주제: AWS 클라우드 네이티브 RDB
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Aurora의 스토리지 아키텍처(공유 스토리지, 6 카피)를 안다
- Global Database / Serverless v2의 특징을 구분한다
- 일반 RDS 대비 시험에서 Aurora가 정답인 시나리오를 안다

---

## 🧩 사전 지식 (CS 기초)

- **공유 스토리지 아키텍처(Compute-Storage 분리)**: 컴퓨팅 노드는 stateless에 가깝고 데이터는 공통 스토리지에. 노드 추가/교체가 빠름.
- **Quorum 쓰기**: 6개 카피 중 4개에 쓰기 성공 시 커밋. 1개 AZ 장애에도 무중단.
- **로그 기반 복제**: 데이터 페이지 대신 redo log만 전송 → 네트워크 ↓.

---

## 📖 이론 내용

### 1. Aurora 아키텍처

- **공유 스토리지**가 3 AZ × 2 카피 = **6 카피**. 4/6 쓰기 / 3/6 읽기 쿼럼.
- 스토리지 자동 확장 64TB → 128TB.
- **컴퓨팅(인스턴스) 분리** → Reader 추가/제거 빠름.
- 자가 치유(self-healing): 디스크 손상 자동 복구.

### 2. Aurora Replica

- 최대 **15개 Reader**.
- Reader endpoint가 자동 로드밸런싱.
- 페일오버 빠름(보통 30초 이내).

### 3. Aurora Global Database

- 1개 primary 리전 + 최대 5개 secondary 리전.
- **1초 미만 복제 지연** (스토리지 레벨 복제).
- 리전 페일오버 1분 이내 → DR 강력.

### 4. Aurora Serverless v2

- 0.5~256 ACU(Aurora Capacity Unit) 자동 스케일.
- 빠른 스케일링(초 단위) — v1보다 큰 개선.
- 변동 워크로드 / 신규 서비스 / 멀티 테넌트에 적합.

### 5. Aurora vs RDS 차이

| 항목 | RDS | Aurora |
|------|-----|--------|
| 스토리지 | 인스턴스에 EBS | 공유 분산 (6 카피) |
| 최대 Reader | 5 | 15 |
| 복제 지연 | 비동기 (수초) | 거의 동기 (수십ms) |
| 페일오버 | 60-120s | ~30s |
| 자동 백업 | 0-35일 | 1-35일, S3에 |
| Global | Cross-region Replica | Global DB(스토리지 레벨) |
| Serverless | (X) | v2 ACU |
| 비용 | 일반적으로 ↓ | 약 20% ↑ |

### 6. Aurora 엔드포인트

- **Cluster (Writer)** — 항상 현재 writer로.
- **Reader** — 읽기 LB 자동.
- **Custom** — 특정 Reader 집합(분석 vs 트랜잭션).
- **Instance** — 직접 호출(드물게).

### 7. Backtrack / Clone

- **Backtrack** (MySQL 호환): 시간 되돌리기. PITR보다 빠름.
- **Fast Database Cloning**: COW로 즉시 복제 → 테스트 환경 빠르게.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Aurora Limitless DB** | 수평 분할 자동 (신규) | 페타바이트 워크로드 |
| **Aurora I/O Optimized** | I/O 많을 때 정액 | 비용 최적화 |
| **Backtrack** | MySQL만, PG는 X | 함정 |
| **Storage Auto Scaling** | 64GB 단위 자동 | 운영 단순화 |
| **Aurora Reader Auto Scaling** | CPU/Connection 기반 | 읽기 트래픽 가변 |

> ⚠️ **함정**: "PostgreSQL에서 Backtrack" → MySQL 호환만 지원. PostgreSQL은 PITR.

> 💡 **암기 팁**: "5리전·1초 미만·DR" → **Aurora Global Database**.

### 관련 서비스 Cross-Reference

- DR 전략 → Week 11
- Lambda + RDS Proxy → Day 1
- DMS 마이그레이션 → Week 11

---

## 🏗️ 아키텍처 다이어그램

```
[ Aurora 클러스터 ]

  App ──(Writer endpoint)──> Writer Instance
        (Reader endpoint)──> Reader1, Reader2, ..., Reader15

                                  │
                                  ▼
                    공유 스토리지 (6 카피, 3 AZ)
                       ↑ Quorum 4/6 쓰기


[ Aurora Global DB ]

  ap-northeast-2 (Primary)
     ├─ Writer + Readers
     └─ Storage 6-copy
              │  ≤ 1s 비동기 복제
              ▼
  us-east-1 (Secondary)
     └─ Readers (Promote 시 1분 이내 Primary)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **6 카피 / 3 AZ / 4-of-6 쓰기 쿼럼**.
2. ⭐ 최대 **15개 Reader**, Reader endpoint 자동 LB.
3. ⭐ **Global DB**가 cross-region DR + 지역 읽기 정답.
4. ⭐ **Serverless v2**가 변동 워크로드 정답.
5. ⭐ **Backtrack은 MySQL만**. PostgreSQL은 X.

---

## 💻 실제 예시 - AWS CLI

```bash
# Aurora MySQL 클러스터
aws rds create-db-cluster --db-cluster-identifier saa-aurora \
  --engine aurora-mysql --engine-version 8.0.mysql_aurora.3.05.0 \
  --master-username admin --master-user-password 'StrongPass!' \
  --vpc-security-group-ids sg-... \
  --storage-encrypted

# Writer + 2 Readers
aws rds create-db-instance --db-instance-identifier saa-aurora-w \
  --db-cluster-identifier saa-aurora --engine aurora-mysql \
  --db-instance-class db.r6g.large

# Global DB (다른 리전 secondary)
aws rds create-global-cluster --global-cluster-identifier saa-global \
  --source-db-cluster-identifier arn:aws:rds:ap-northeast-2:...:cluster:saa-aurora
```

---

## 📝 연습 문제

**문제 1.** "5개 리전 DR + 1초 미만 복제 지연":

A) RDS cross-region Replica B) Aurora Global Database C) DynamoDB Global Tables D) S3 CRR

**정답: B**.

---

**문제 2.** 갑작스러운 트래픽 변동 + 자동 0→256 ACU:

A) Aurora Serverless v1 B) Aurora Serverless v2 C) RDS Multi-AZ D) DynamoDB On-Demand

**정답: B**.

---

**문제 3.** Aurora 최대 Read Replica 수:

A) 5 B) 10 C) 15 D) 무제한

**정답: C**.

---

**문제 4.** Aurora 데이터 손상 시 시간 되돌리기(MySQL):

A) PITR B) Backtrack C) Restore Snapshot D) Replica Promote

**정답: B**.

---

**문제 5.** Aurora 스토리지 쿼럼:

A) 1/1 B) 2/3 C) 4/6 D) 5/7

**정답: C**.

---

## 📌 오늘의 요약

1. Aurora = 공유 분산 스토리지(6 카피) + 컴퓨팅 분리.
2. 최대 15 Reader, Reader endpoint 자동 LB.
3. Global DB가 DR/지역 읽기 정답, 1초 미만 복제.
4. Serverless v2가 변동·신규·멀티테넌트의 정답.
5. Backtrack은 MySQL만. Fast Cloning(COW)은 테스트 환경에.
