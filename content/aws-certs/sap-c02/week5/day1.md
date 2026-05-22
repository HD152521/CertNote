# Day 21 - Multi-Region 아키텍처 패턴

📅 날짜: Week 5 (Day 1)
🎯 주제: 다중 리전 설계 — Active-Active vs Active-Passive
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Multi-Region을 도입하는 동기와 4가지 DR 패턴을 안다
- 데이터·서비스·DNS·트래픽 분배 옵션을 안다
- 멀티 리전의 데이터 복제 트레이드오프(일관성·비용·지연)를 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **CAP Theorem**: 일관성·가용성·분할내성 중 둘만. 글로벌 분산은 일관성 약화 자주.
- **Eventual Consistency**: 결국 수렴.
- **Quorum**: 다수결 합의.
- **Active-Active vs Active-Passive**: 동시 가동 vs 대기.

---

## 📖 이론 내용

### 1. 왜 Multi-Region?

| 동기 | 설명 |
|------|------|
| DR | 리전 전체 장애 대비 |
| 지연 최소화 | 사용자 가까운 리전 |
| 데이터 주권 | EU/한국·중국 등 격리 |
| 컴플라이언스 | 정부·금융 |

### 2. DR 전략 4종 (⭐⭐ 시험 가장 중요)

| 전략 | RTO | RPO | 비용 |
|------|-----|-----|------|
| **Backup & Restore** | 수시간~수일 | 시간 단위 | 저렴 |
| **Pilot Light** | 수십분 | 분 | 중 |
| **Warm Standby** | 분 | 분 | 중상 |
| **Multi-Site Active-Active** | 0 (즉시) | 0~초 | 비쌈 |

#### Backup & Restore
- S3 Cross-Region Replication, AWS Backup
- 장애 시 다른 리전에서 재구축
- 가장 저렴

#### Pilot Light
- 핵심(예: DB 복제만 켜둠) 가동
- 장애 시 나머지(App·LB) 부팅
- RTO 30분~수시간

#### Warm Standby
- 축소된 풀 스택 상시 운영
- 장애 시 Auto Scaling으로 확장
- RTO 수분~십수분

#### Multi-Site Active-Active
- 두 리전 동시 트래픽 처리
- Route 53 Latency/Geolocation
- DB는 Global Tables, Aurora Global Database
- 가장 비싸고 복잡

### 3. 데이터 복제 옵션

| 서비스 | 복제 방식 |
|--------|----------|
| **S3** | Cross-Region Replication (CRR), Multi-Region Access Point |
| **DynamoDB** | Global Tables (마스터-마스터·최종 일관성) |
| **Aurora** | Global Database (5초 미만 RPO, 1초 미만 LAG) |
| **RDS** | Read Replica Cross-Region |
| **EBS** | Snapshot Cross-Region copy |
| **EFS** | Replication (1분 RPO) |
| **Route 53** | 글로벌 (별도 복제 없음) |

### 4. 트래픽 분배

- **Route 53 Routing Policies**: Latency, Geolocation, Geoproximity, Failover, Weighted
- **CloudFront**: 엣지 캐시 + Origin Failover
- **Global Accelerator**: TCP/UDP 가속, 정적 Anycast IP

### 5. Stateful vs Stateless

- **Stateless** 컴포넌트: 다중 리전 쉬움 (Lambda, ECS Task)
- **Stateful**: DB·세션 → 복제·shard

### 6. 글로벌 일관성 트레이드오프

- Active-Active + 마스터-마스터 = 충돌 가능 (Last-Write-Wins)
- 강한 일관성 필요하면 단일 리전 마스터 (Aurora Global Primary)
- 메시지 큐는 리전별 분리 + 이벤트 동기화

---

## 🧠 알아두면 좋은 심화 이론

### Route 53 ARC (Application Recovery Controller)

- Routing Control + Readiness Check
- 한 번에 트래픽을 다른 리전으로 안전하게 전환
- "리전 페일오버 버튼" 같은 단순 제어

### Cross-Reference

- **Day 22**: Route 53 라우팅 정책
- **Day 23**: CloudFront
- **Week 14**: DR 본격

---

## 🏗️ 아키텍처 다이어그램 — Active-Active

```
            Route 53 Latency
              /              \
             ▼                ▼
        ap-northeast-2    us-east-1
        ALB+ECS          ALB+ECS
        Aurora Global    Aurora Global
        Primary          Secondary (Read)
        DynamoDB         DynamoDB
        Global Tables ◄──► Global Tables
        S3 ──── CRR ───── S3

장애 시: Route 53 Health Check 실패 →
        해당 리전 endpoint 제외 → 다른 리전만 응답
```

---

## ⭐ 핵심 포인트

1. ⭐ **DR 4전략 비용·RTO/RPO 매핑** (Backup<Pilot<Warm<AA)
2. ⭐ **Aurora Global = RPO<5s, LAG<1s** — DB 멀티 리전 표준
3. ⭐ **DynamoDB Global Tables**는 마스터-마스터 (충돌 LWW)
4. ⭐ Route 53 + Health Check로 **자동 페일오버**
5. ⭐ **R53 ARC**로 한 번에 안전한 페일오버 제어

---

## 💻 실제 예시 - Aurora Global

```bash
aws rds create-global-cluster \
  --global-cluster-identifier my-global \
  --engine aurora-postgresql --engine-version 15

aws rds create-db-cluster \
  --db-cluster-identifier primary-cluster \
  --engine aurora-postgresql \
  --global-cluster-identifier my-global \
  --region ap-northeast-2

aws rds create-db-cluster \
  --db-cluster-identifier secondary-cluster \
  --engine aurora-postgresql \
  --global-cluster-identifier my-global \
  --region us-east-1
```

---

## 📝 연습 문제

**문제 1.** RTO 1분 미만 + 글로벌 DB. Best?

A) RDS Cross-Region Read Replica
B) Aurora Global Database
C) DMS
D) 백업 + 복원

**정답: B**
해설: Aurora Global = RPO<5s, RTO<1분.

---

**문제 2.** 가장 저렴한 DR 전략은?

A) Active-Active
B) Warm Standby
C) Pilot Light
D) Backup & Restore

**정답: D**
해설: B&R = 가장 저렴, RTO 시간 단위.

---

**문제 3.** DynamoDB 멀티 리전 마스터-마스터. 충돌 처리?

A) Quorum
B) Last-Write-Wins (LWW)
C) 사용자 정의
D) 거부

**정답: B**
해설: Global Tables는 LWW + 최종 일관성.

---

**문제 4.** 한 번에 안전하게 리전 페일오버하는 단순 제어. Best?

A) Lambda 자동화
B) Route 53 ARC (Routing Control)
C) CloudWatch Alarm
D) Manual DNS 변경

**정답: B**
해설: R53 ARC가 안전한 페일오버 제어.

---

**문제 5.** 미국·EU 사용자에게 가까운 리전으로 자동 라우팅. Best?

A) Geolocation
B) Latency-Based Routing
C) Weighted
D) Simple

**정답: B**
해설: 지연 기준 = LBR (사용자 가까운 리전).

---

**문제 6.** 두 리전 액티브-액티브 + S3 데이터 양방향 복제. Best?

A) Cross-Region Replication (양방향 활성)
B) DataSync
C) DMS
D) S3 Replication Time Control (RTC) 양방향 + Multi-Region Access Point

**정답: D**
해설: 양방향 CRR(RTC) + MRAP가 표준 멀티 리전 S3 패턴. CRR 단방향 두 개 설정도 정답 후보.

---

## 📌 오늘의 요약

1. DR 4전략: B&R · Pilot · Warm · Active-Active
2. Aurora Global Database = DB 멀티 리전 표준 (RPO<5s)
3. DynamoDB Global Tables = LWW 최종 일관성
4. Route 53 ARC로 안전한 페일오버
5. R53 Latency = 사용자 가까운 리전 자동
