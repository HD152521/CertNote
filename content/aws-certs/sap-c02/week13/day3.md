# Day 63 - 안정성·성능 효율성 기둥 심화

📅 Week 13 (Day 3)
🎯 주제: Reliability·Performance Efficiency
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- Reliability 설계 원칙·실전 패턴
- Performance 선택 원칙 (Compute·Storage·DB·Network)

---

## 🧩 사전 지식 (CS 기초)

- **Idempotency**: 같은 요청을 여러 번 실행해도 결과 동일
- **Backpressure**: 소비자 속도에 맞춘 생산자 제어
- **Circuit Breaker**: 장애 전파 차단

---

## 📖 이론 내용

### 1. Reliability 원칙

1. 자동 복구
2. 복구 절차 **테스트**
3. **수평 확장**
4. 용량 추측 금지 — 모니터링 기반
5. 변경 자동화

### 2. Reliability 패턴

| 패턴 | 도구 |
|------|------|
| Multi-AZ | ALB·RDS Multi-AZ·EFS·DDB |
| Multi-Region | Aurora Global·DDB Global·Route 53·S3 CRR |
| Auto Scaling | ASG·App Auto Scaling·Karpenter |
| Health Check | Route 53·ELB·App level |
| Retry·Backoff·Jitter | SDK |
| 큐잉·디커플링 | SQS·SNS·Kinesis |
| 백업·DR | AWS Backup·MGN·DRS |
| Chaos·Fault Injection | FIS |

### 3. Performance 원칙

1. 최신 기술 **민주화** (Managed)
2. **글로벌** 단 몇 분
3. **서버리스** 우선
4. **실험·측정**
5. **공감 기반** 설계

### 4. Performance 영역별 선택

**Compute**
- EC2 (Graviton)·Fargate·Lambda
- Spot·Auto Scaling
- Placement Group (Cluster·Spread·Partition)

**Storage**
- gp3·io2·st1·sc1
- Instance Store (NVMe) — 임시 + 초저지연
- FSx (Lustre·Windows·NetApp ONTAP·OpenZFS)

**Database**
- 워크로드 맞춤: RDS·Aurora·DDB·DocumentDB·Neptune·Timestream·QLDB·Keyspaces
- 캐시: ElastiCache·DAX·MemoryDB

**Network**
- CloudFront·Global Accelerator
- Enhanced Networking (ENA·EFA)
- Placement Group Cluster (저지연)

### 5. 캐싱 계층

```
Client → CloudFront → API GW Cache → ElastiCache/DAX → DB
```

- 각 계층 캐싱으로 비용·지연 동시 절감

---

## 🧠 심화 이론

### 함정 매핑

- "장애 견디는 가용성" → Reliability (Multi-AZ·Multi-Region)
- "지연 단축·캐시" → Performance
- "사용자 패턴 모름" → Auto Scaling
- "최고 처리량 HPC" → Cluster Placement Group + EFA + Lustre

### EFA·Lustre

- **EFA**: HPC·ML 통신용 (MPI)
- **FSx for Lustre**: 초고성능 병렬 스토리지 (S3 연동)

---

## 🏗️ 아키텍처 — Multi-Region Active-Active

```
[Route 53 Latency·Failover]
       │
   ┌───┴───┐
   ▼       ▼
[Region A] [Region B]
[ALB]      [ALB]
[ASG]      [ASG]
[Aurora Global ── Replica]
[S3 CRR]
[DDB Global]
```

---

## ⭐ 핵심 포인트

1. ⭐ Reliability = Multi-AZ → Multi-Region 단계
2. ⭐ FIS로 복구 절차 테스트
3. ⭐ Performance = Managed + Serverless 우선
4. ⭐ 캐싱 계층 (CDN·API·App·DB)
5. ⭐ HPC = Cluster PG + EFA + Lustre
6. ⭐ Graviton·Inferentia·Trainium 활용

---

## 💻 CLI 예시

```bash
# Cluster Placement Group
aws ec2 create-placement-group \
  --group-name hpc-pg --strategy cluster

# Fault Injection 실험
aws fis create-experiment-template ...
```

---

## 📝 연습 문제

**문제 1.** RTO 5분·RPO 1분 글로벌.

A) Aurora Multi-AZ
B) Aurora Global Database
C) RDS Read Replica
D) DMS

**정답: B**

---

**문제 2.** ML 학습 — 노드 간 초저지연.

A) Spread PG
B) Partition PG
C) Cluster PG + EFA
D) 단일 AZ만

**정답: C**

---

**문제 3.** API 지연 ↓ 캐시.

A) ElastiCache
B) DAX (DDB만)
C) CloudFront + ElastiCache + DAX 계층
D) Aurora Replica

**정답: C**

---

**문제 4.** 복구 절차를 정기 검증.

A) AWS Backup
B) FIS (Fault Injection Simulator)
C) Trusted Advisor
D) Config

**정답: B**

---

**문제 5.** ARM 기반 비용·성능 개선 EC2.

A) Inferentia
B) Graviton
C) Trainium
D) F1

**정답: B**

---

**문제 6.** 메시지 처리 속도가 소비자보다 빠를 때.

A) SQS Backpressure·DLQ
B) SNS 직접
C) Lambda 동기
D) DynamoDB Streams

**정답: A**

---

## 📌 오늘의 요약

1. Reliability 5원칙·Multi-AZ→Region
2. FIS로 복구 테스트
3. Performance = Managed·Serverless
4. 캐싱 계층화
5. HPC = Cluster PG + EFA + Lustre
