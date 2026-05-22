# Day 77 - 도메인 2 종합: 신규 솔루션 (29%)

📅 Week 16 (Day 2)
🎯 주제: 신규 솔루션 설계
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- 신규 아키텍처 설계: 가용성·성능·보안·비용 균형
- 컴퓨트·데이터·이벤트·서버리스 패턴

---

## 📌 도메인 2 핵심 (한 페이지)

### 컴퓨트 선택

```
서버리스 가능? Yes → Lambda / Fargate
   │ No
컨테이너? Yes → ECS / EKS / Fargate
   │ No
EC2 → ASG·Placement Group·Spot
```

### DB 선택 매트릭스

| 요구 | DB |
|------|-----|
| RDB 표준 | RDS |
| RDB 확장·DR | Aurora·Aurora Global |
| Key-Value·서버리스 | DynamoDB |
| 문서 (Mongo) | DocumentDB |
| 그래프 | Neptune |
| Time Series | Timestream |
| 원장(Ledger) | QLDB |
| Cassandra 호환 | Keyspaces |
| Redis 호환 + DR | MemoryDB |
| 검색 | OpenSearch |
| 데이터 웨어하우스 | Redshift |

### 이벤트·메시지

- **SQS**: 큐, At-Least-Once, FIFO 옵션
- **SNS**: Pub/Sub fan-out, FIFO 가능
- **EventBridge**: 다중 소스, Bus·Pipes·Scheduler·Archive·Replay
- **Kinesis Data Streams**: 실시간 스트리밍·순서 보장(샤드)
- **MSK**: Kafka 호환
- **Step Functions**: 워크플로우 (Standard·Express)

### 스토리지

- **S3** + Storage Class
- **EBS** (gp3·io2·st1·sc1)
- **EFS** (Standard·IA·One Zone)
- **FSx** (Lustre·Windows·NetApp·OpenZFS)
- **Instance Store** (NVMe·임시)

### 가용성 패턴

- Multi-AZ → Multi-Region
- Aurora Global·DDB Global·Route 53 Failover
- 캐싱: CloudFront·ElastiCache·DAX

---

## 🧠 핵심 시나리오 매핑

| 키워드 | 답 |
|--------|-----|
| "운영 부담 최소·짧은 트래픽 변동" | Lambda |
| "서버리스 컨테이너" | Fargate |
| "장시간 실행·복잡 워크플로우" | Step Functions |
| "이벤트 다중 소스→다중 대상" | EventBridge |
| "강한 순서 보장 + 재처리" | Kinesis Data Streams |
| "글로벌 SQL DB·RPO 1s" | Aurora Global |
| "수십만 TPS Key-Value" | DynamoDB On-Demand |
| "실시간 검색·로그 분석" | OpenSearch |

---

## 📝 연습 문제

**문제 1.** 5분 이하 작업 + 이벤트 트리거 + 비용 0 유휴.

A) Fargate
B) Lambda
C) EC2 ASG
D) Batch

**정답: B**

---

**문제 2.** 다중 단계 오케스트레이션 + 에러 처리.

A) EventBridge
B) Step Functions
C) SQS
D) Lambda 체이닝

**정답: B**

---

**문제 3.** 시간 시계열 DB.

A) DDB
B) Timestream
C) RDS
D) Neptune

**정답: B**

---

**문제 4.** 글로벌 RDB·RPO 1초.

A) Read Replica
B) Aurora Global
C) RDS Multi-AZ
D) DMS

**정답: B**

---

**문제 5.** 다중 컨슈머 + 메시지 재생 가능.

A) SQS
B) SNS
C) Kinesis Data Streams
D) EventBridge Bus

**정답: C**

---

**문제 6.** SaaS 이벤트 → AWS.

A) SQS
B) EventBridge Partner Source
C) SNS
D) Lambda

**정답: B**

---

## 📌 오늘의 요약

1. 서버리스 우선 (Lambda·Fargate)
2. DB 매트릭스 즉답
3. EventBridge·Step Functions·Kinesis 패턴
4. Multi-AZ/Region·캐싱
