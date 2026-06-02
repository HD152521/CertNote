# Day 35 - Week 7 복습 + 시나리오 문제 10

📅 날짜: Week 7 (Day 5)
🎯 주제: 메시징·통합 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- SQS / SNS / EventBridge / Kinesis 선택을 키워드로 매핑한다
- 디커플링 패턴을 그릴 수 있다

---

## 🧩 사전 지식 (CS 기초)

- **결합도(Coupling)**: 컴포넌트 간 의존성. 시간/공간 결합을 줄이면 복원력 ↑.
- **이벤트 vs 명령**: 이벤트는 사실 통지 / 명령은 작업 지시.

---

## 📖 한 주 핵심 정리

1. **SQS**: 큐. 표준 vs FIFO. DLQ / Visibility / Long Polling.
2. **SNS**: 1:N 브로드캐스트. FIFO + Filter + Archive.
3. **EventBridge**: 이벤트 라우팅 허브. Pipes / Scheduler / API Destinations.
4. **Kinesis Data Streams**: 다중 컨슈머·재생.
5. **Kinesis Firehose**: 자동 적재(분 단위).
6. **MSK**: Kafka 관리형.
7. **Managed Flink**: 실시간 분석.

### 헷갈리기 쉬운 비교표

| 항목 | A | B |
|------|---|---|
| **SQS 표준 vs FIFO** | 무제한·중복 가능 | 순서·정확히 한번 |
| **SNS vs EventBridge** | 단순 fanout | 풍부 라우팅·필터·스케줄 |
| **SQS vs Kinesis** | 1회 소비·큐 | 다회 소비·재생·스트림 |
| **Firehose vs Data Streams** | 자동 적재 | 실시간 소비 |
| **EventBridge vs Pipes** | 발행자 중심 라우팅 | 점-대-점 통합 |

---

## 🏗️ 한 주 통합 아키텍처

```
[ 통합 EDA ]

   Producers
      │
      ▼
   EventBridge (라우팅 + Filter + Schedule)
      ├─ SQS (작업 큐) ─ Lambda Worker (DLQ)
      ├─ SNS Fanout ─ Email / SMS / SQS-A / SQS-B
      ├─ Kinesis Data Streams ─ Flink / Lambda / Firehose
      └─ API Destination → Slack / Jira

   Firehose → S3 (Parquet) → Athena / Redshift
```

---

## 📝 시나리오 연습 문제 10

**문제 1.** 결제 순서 보장 + 중복 없이:

A) Standard SQS B) FIFO SQS C) SNS D) Kinesis

**정답: B**.

---

**문제 2.** 한 이벤트를 3개 시스템이 독립 처리:

A) SQS B) SNS→SQS Fanout C) Kinesis D) EventBridge Pipes

**정답: B**.

---

**문제 3.** 클릭스트림 분석 + 재생:

A) SQS B) Kinesis Data Streams C) SNS D) Firehose

**정답: B**.

---

**문제 4.** 로그 자동 S3 + Parquet:

A) Firehose B) Data Streams + Lambda C) MSK D) SNS+Lambda

**정답: A**.

---

**문제 5.** SaaS (Datadog) → AWS 라우팅:

A) SNS B) EventBridge Partner Source C) Kinesis D) SQS

**정답: B**.

---

**문제 6.** 매일 새벽 3시 Lambda:

A) EventBridge Scheduler / Cron Rule B) SQS Delay C) SFN Wait D) Lambda 자체

**정답: A**.

---

**문제 7.** 가시성 30초 < 처리 60초:

A) 영향 없음 B) 중복 처리됨 C) 손실 D) DLQ

**정답: B**.

---

**문제 8.** Kafka 호환:

A) Kinesis B) MSK C) Firehose D) SNS

**정답: B**.

---

**문제 9.** 256KB 초과 메시지:

A) SQS Extended Client + S3 B) Multi-part C) FIFO D) DLQ

**정답: A**.

---

**문제 10.** SQS → 필터 + 가벼운 변환 → Step Functions:

A) 자체 Lambda B) EventBridge Pipes C) SNS D) Firehose

**정답: B**.

---

## 📌 오늘의 요약 + 다음 주 예고

1. 메시징 4종(SQS/SNS/EB/Kinesis)은 시나리오 키워드로 매핑.
2. 다음 주: **보안 & 자격 증명** — KMS / Secrets Manager / Cognito / WAF / GuardDuty.
