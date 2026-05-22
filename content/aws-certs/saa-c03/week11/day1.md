# Day 51 - Multi-AZ vs Multi-Region 패턴

📅 날짜: Week 11 (Day 1)
🎯 주제: 복원력 설계
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Multi-AZ와 Multi-Region 차이를 RTO/RPO로 안다
- 어느 AWS 서비스가 어떤 복원력 모드를 제공하는지 안다
- DR 시나리오 키워드를 매핑한다

---

## 🧩 사전 지식 (CS 기초)

- **RTO**: 복구까지 허용 시간(다운타임).
- **RPO**: 허용 가능한 데이터 손실 시간.
- **Active-Active vs Active-Passive**: 양쪽 다 운영 vs 한쪽 대기.
- **DNS Failover**: Route 53 health check + 라우팅 정책.

---

## 📖 이론 내용

### 1. Multi-AZ vs Multi-Region

| 항목 | Multi-AZ | Multi-Region |
|------|----------|--------------|
| 격리 | AZ (수십 km) | 리전 (수천 km) |
| 지연 | μs~ms | 수십~수백 ms |
| 비용 | ↓ | ↑↑ |
| 사용 | HA | DR / 지역별 서비스 |

### 2. 서비스별 Multi-AZ

- **EC2 ASG**: 다중 AZ 서브넷.
- **ELB**: 다중 AZ.
- **RDS / Aurora**: Multi-AZ 옵션.
- **EFS / FSx ONTAP / OpenZFS**: 다중 AZ.
- **S3**: 기본 다중 AZ (One Zone-IA만 단일 AZ).

### 3. 서비스별 Multi-Region

- **S3 CRR / SRR**.
- **DynamoDB Global Tables**.
- **Aurora Global Database**.
- **RDS Cross-Region Read Replica**.
- **Route 53 (글로벌 DNS)**.
- **CloudFront (글로벌 CDN)**.
- **Secrets Manager Replication**.

### 4. Active-Active vs Active-Passive

- **Active-Active**: 두 리전 모두 트래픽 받음. 데이터 동기화·충돌이 어려움.
- **Active-Passive**: 한쪽이 메인, 다른 쪽 대기. 더 단순.

### 5. AWS 패턴

- **Pilot Light**: 핵심만 켜둠 (DB는 복제 중, 앱 인스턴스 OFF).
- **Warm Standby**: 축소된 환경 항상 동작.
- **Active-Active**: 양쪽 풀 스택.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **AWS Backup** | 통합 백업(EBS·EFS·RDS·DDB·S3) | 중앙 관리 |
| **AWS Elastic Disaster Recovery (DRS)** | 블록 레벨 실시간 복제 | DR 자동화 |
| **Resilience Hub** | 복원력 평가·점수 | 거버넌스 |
| **Cross-Region Snapshot Copy** | EBS / RDS | DR 백업 |
| **Aurora Global vs Cross-region Replica** | 1초·5리전 | DR 정답 |

> ⚠️ **함정**: "Multi-AZ가 DR이다" → 아님. **DR은 Multi-Region** 또는 Cross-Region 백업.

> 💡 **암기 팁**: HA = AZ 격리 / DR = Region 격리.

### 관련 서비스 Cross-Reference

- Route 53 → Day 3
- DR 4단계 → Day 2
- Snow / DMS → Day 4

---

## 🏗️ 아키텍처 다이어그램

```
[ Active-Active Multi-Region ]

   Route 53 (Latency Routing + Health)
       ├─► Region A: ALB → ECS → Aurora Global Writer
       └─► Region B: ALB → ECS → Aurora Global Reader / 승격 가능

   S3 CRR + DynamoDB Global Tables + Secrets Manager Replication
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Multi-AZ는 HA, Multi-Region은 DR.
2. ⭐ Aurora Global / DDB Global Tables / S3 CRR이 정답 핵심.
3. ⭐ Active-Active는 멋지지만 비싸고 복잡.
4. ⭐ Pilot Light / Warm Standby는 RTO/RPO 절충.
5. ⭐ Route 53 Failover + Health Check가 라우팅의 정답.

---

## 💻 실제 예시 - AWS CLI

```bash
# S3 CRR
aws s3api put-bucket-replication --bucket src \
  --replication-configuration file://crr.json

# DDB Global Table
aws dynamodb update-table --table-name Orders \
  --replica-updates 'Create={RegionName=us-east-1}'

# Aurora Global Cluster (이미 day2)
```

---

## 📝 연습 문제

**문제 1.** "리전 장애 시 1분 내 다른 리전이 받기":

A) Multi-AZ B) Aurora Global DB + Route 53 Failover C) Read Replica 단독 D) NAT

**정답: B**.

---

**문제 2.** 한 AZ 장애 시 무중단:

A) Multi-Region B) RDS Multi-AZ + ASG Multi-AZ + ELB C) Backup만 D) Snowball

**정답: B**.

---

**문제 3.** 5개 리전 액티브-액티브 NoSQL:

A) Aurora Global B) DDB Global Tables C) RDS Cross-region Replica D) DocumentDB

**정답: B**.

---

**문제 4.** Cost vs RTO:

A) Backup-Restore 가장 싸·느림 / Active-Active 가장 빠름·비쌈 B) 모두 동일 C) Pilot Light가 가장 비쌈 D) Active-Active 가장 쌈

**정답: A**.

---

**문제 5.** "DR Hub로 비즈니스 복원력 점수":

A) Trusted Advisor B) Resilience Hub C) Detective D) Macie

**정답: B**.

---

## 📌 오늘의 요약

1. HA는 AZ 격리, DR은 Region 격리.
2. Aurora Global / DDB Global Tables / S3 CRR가 핵심.
3. Active-Active는 비싸·복잡 / Active-Passive 더 단순.
4. AWS Backup / DRS / Resilience Hub로 거버넌스.
5. Route 53 Failover로 자동 라우팅.
