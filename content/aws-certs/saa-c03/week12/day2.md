# Day 57 - 도메인 2 복습: 복원력 아키텍처 (26%)

📅 날짜: Week 12 (Day 2)
🎯 주제: 시험 도메인 2 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 복원력 도메인의 핵심 키워드 → 서비스 매핑이 즉시 나온다
- HA·DR 패턴 시나리오를 자동 변환할 수 있다

---

## 🧩 사전 지식 (CS 기초)

- **분산 시스템 8가지 오류**: 네트워크 가정의 함정. 시간·노드·메시지 신뢰성을 항상 의심.
- **Idempotency·재시도·백오프**: 분산에서 안전한 재시도의 기본.

---

## 📖 핵심 정리

### A. 컴퓨팅 복원력

| 키워드 | 서비스 |
|--------|--------|
| Multi-AZ ASG | EC2 Auto Scaling |
| ELB Health Check | ALB/NLB + ASG ELB HC |
| Lifecycle Hook | ASG graceful shutdown |
| Spot 회수 사전 대체 | Capacity Rebalancing |
| 컨테이너 서버리스 | Fargate |

### B. 데이터 복원력

| 키워드 | 서비스 |
|--------|--------|
| RDS HA | Multi-AZ |
| RDS 읽기 확장 | Read Replica |
| Aurora 6 카피 | 자동 |
| Aurora 글로벌 1초 | Aurora Global DB |
| NoSQL 액티브-액티브 | DDB Global Tables |
| S3 다중 AZ | 기본 |
| S3 cross-region | CRR |
| 메시지 큐 | SQS DLQ |
| 스트림 재생 | Kinesis Data Streams |

### C. DR

| 키워드 | 패턴 |
|--------|------|
| RTO h, RPO h, 저비용 | Backup-Restore |
| RTO m, RPO m | Pilot Light |
| RTO m, RPO s | Warm Standby |
| RTO ~0, RPO ~0 | Active-Active |
| 비용 효율 Pilot | AWS DRS |

### D. 트래픽 라우팅

| 키워드 | 정책 |
|--------|------|
| 빠른 리전 | Latency |
| 위치별 콘텐츠 | Geo |
| 카나리 % | Weighted |
| Primary-Backup | Failover |
| 명시적 페일오버 컨트롤 | Route 53 ARC |

### E. 디커플링

- SQS / SNS Fanout / EventBridge / Step Functions / Pipes.

### 시나리오 빈출 함정 10

1. RDS Multi-AZ는 HA, DR 아님 → DR은 Cross-region.
2. Read Replica는 비동기 → 강한 일관성 필요하면 부적합.
3. NAT GW는 단일 AZ면 그 AZ 장애 시 다른 AZ도 인터넷 단절.
4. ALB Cross-Zone 기본 ON, NLB 기본 OFF.
5. ASG ELB Health Check 활성화 필요.
6. Aurora Backtrack은 MySQL만.
7. DDB GSI는 결과적 일관성만.
8. SQS visibility < 처리 시간 = 중복.
9. SNS 순서 = SNS FIFO + SQS FIFO만.
10. Pilot Light는 데이터만 동기·앱 OFF.

---

## 📝 종합 시나리오 문제 5

**문제 1.** RPO 0 / RTO ~0 / 비용 무관:

A) Backup-Restore B) Pilot Light C) Warm Standby D) Active-Active

**정답: D**.

---

**문제 2.** ASG 인스턴스 종료 전 로그 업로드:

A) UserData B) Lifecycle Hook (Terminating:Wait) C) Cloudwatch Events D) Scheduled

**정답: B**.

---

**문제 3.** 글로벌 액티브-액티브 NoSQL:

A) DocumentDB B) DDB Global Tables C) Aurora Global D) RDS CR Replica

**정답: B**.

---

**문제 4.** 50개 VPC + 본사 라우팅 허브:

A) Peering 풀메시 B) Transit Gateway C) VPN만 D) IGW

**정답: B**.

---

**문제 5.** 사용자 가장 빠른 리전:

A) Geo B) Latency C) Weighted D) Failover

**정답: B**.

---

## 📌 오늘의 요약

1. 도메인 2(26%) 키워드 → 서비스 매핑.
2. ASG·ELB·RDS·Aurora·DDB·S3·SQS/Kinesis가 시험 단골.
3. 4단계 DR + Route 53 라우팅은 시나리오로 자주.
