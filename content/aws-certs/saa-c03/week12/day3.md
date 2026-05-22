# Day 58 - 도메인 3 복습: 고성능 아키텍처 (24%)

📅 날짜: Week 12 (Day 3)
🎯 주제: 시험 도메인 3 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 고성능 도메인의 키워드 → 서비스 매핑이 즉시 나온다
- 캐싱·CDN·스토리지/DB 성능 옵션을 외운다

---

## 🧩 사전 지식 (CS 기초)

- **지연·처리량 trade-off**: 둘 다 좋게 하려면 캐시·병렬·근접.
- **Amdahl의 법칙**: 직렬 부분이 병렬화의 한계.

---

## 📖 핵심 정리

### A. 컴퓨팅 성능

| 키워드 | 서비스 |
|--------|--------|
| HPC 클러스터 저지연 | Cluster Placement Group |
| ARM 가성비 | Graviton |
| GPU | P/G 패밀리 |
| 추론 | Inferentia |
| 학습 | Trainium |
| 콜드 스타트 제거 | Lambda Provisioned Concurrency |

### B. 스토리지 성능

| 키워드 | 서비스 |
|--------|--------|
| 범용 SSD | gp3 |
| 미션 크리티컬 DB IOPS | io2 Block Express |
| HPC/ML 병렬 | FSx for Lustre |
| 다중 AZ Linux | EFS Elastic |
| 큰 비디오 | S3 (Transfer Acceleration) |

### C. 데이터베이스 성능

| 키워드 | 서비스 |
|--------|--------|
| 읽기 확장 | RDS Read Replica / Aurora Reader |
| μs DDB 읽기 | DAX |
| 세션·rich type | ElastiCache Redis |
| 영속 인메모리 | MemoryDB |
| 검색·로그 | OpenSearch |

### D. 네트워크 / 글로벌

| 키워드 | 서비스 |
|--------|--------|
| HTTP 글로벌 캐시 | CloudFront |
| TCP/UDP 가속 | Global Accelerator |
| 5G 엣지 | Wavelength |
| 초저지연 도시 | Local Zones |

### E. 메시징 / 스트림

| 키워드 | 서비스 |
|--------|--------|
| 폭증 비동기 | SQS |
| 다중 컨슈머 재생 | Kinesis Data Streams |
| 자동 적재 | Firehose |
| 실시간 분석 | Managed Flink |

### 시나리오 함정

1. ALB는 HTTP, UDP·TCP 가속은 NLB·GA.
2. NAT GW 비용·지연 함정 → S3/DDB Gateway EP.
3. DDB Hot Partition → PK 균등 분포.
4. S3 멀티파트 5GB↑.
5. EBS gp3가 디폴트, gp2보다 빠르고 싸다.

---

## 📝 종합 시나리오 문제 5

**문제 1.** ML 학습 대용량 + S3 연동 + 초고속 병렬:

A) EFS Max I/O B) FSx Lustre C) FSx ONTAP D) gp3

**정답: B**.

---

**문제 2.** DDB μs 응답:

A) DAX B) ElastiCache C) MemoryDB D) GSI

**정답: A**.

---

**문제 3.** 글로벌 게임 UDP 가속:

A) CloudFront B) Global Accelerator C) NLB only D) Latency RP

**정답: B**.

---

**문제 4.** HPC 노드 간 최저 지연:

A) Cluster PG B) Spread C) Partition D) Multi-AZ

**정답: A**.

---

**문제 5.** 다중 컨슈머가 같은 클릭스트림 독립 처리·재생:

A) SQS B) Kinesis Data Streams C) SNS D) EventBridge

**정답: B**.

---

## 📌 오늘의 요약

1. 도메인 3(24%) 키워드 → 서비스 매핑.
2. CloudFront/GA, DAX/Redis/MemoryDB, FSx/EFS, ASG/ELB 패턴.
3. Hot Partition·NAT 비용·gp3 디폴트가 자주 등장.
