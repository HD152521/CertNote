# Day 34 - Kinesis: Data Streams, Firehose, Managed Service for Apache Flink

📅 날짜: Week 7 (Day 4)
🎯 주제: 스트리밍 데이터
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Kinesis Data Streams / Firehose / MSK / Managed Flink 역할을 안다
- 샤드·파티션 키 개념을 이해한다
- SQS vs Kinesis 분기점을 명확히 한다

---

## 🧩 사전 지식 (CS 기초)

- **스트리밍 vs 큐**: 스트림은 다회 소비·순서·재생, 큐는 1회 소비·삭제.
- **샤드(Shard)**: 처리량의 단위. 각 샤드 1MB/s in, 2MB/s out (per consumer).
- **워터마크(Watermark)**: 스트리밍 처리에서 "이 시간 이전 데이터 처리 완료" 표시.
- **Exactly-once 스트리밍**: 어려운 문제. Kinesis는 기본 at-least-once.

---

## 📖 이론 내용

### 1. Kinesis 제품군

| 서비스 | 용도 |
|--------|-----|
| **Data Streams** | 실시간 ingest. 다회 소비·순서·재생 |
| **Data Firehose** | 자동 적재 (S3/Redshift/OpenSearch/Splunk). 변환 옵션 |
| **Managed Service for Apache Flink** | 실시간 분석/ETL |
| **Data Streams Video Streams** | 비디오 스트림 |

### 2. Data Streams 핵심

- **샤드** = 1MB/s in / 2MB/s out / 1000 PUT/s.
- **Partition Key**가 샤드 결정. 균등 분포가 핵심(Hot Shard 함정).
- **On-Demand 모드**: 샤드 관리 자동 (200MB/s 등).
- 보존: **24시간 ~ 365일**.
- 컨슈머:
  - **Standard (shared throughput)**: 모든 컨슈머가 2MB/s 공유.
  - **Enhanced Fan-out**: 컨슈머별 2MB/s, push 모델, 더 비쌈.

### 3. Firehose

- **거의 자동**(샤드 관리 X).
- 버퍼링: 시간 또는 크기 임계 → 적재.
- 변환: **Lambda 변환 / 포맷 변환**(Parquet, ORC).
- 타겟: **S3 / Redshift(S3 경유) / OpenSearch / Splunk / 외부 HTTP**.
- **near-real-time**(분 단위, 진짜 실시간 X).

### 4. SQS vs Kinesis (시험 최빈출)

| 항목 | SQS | Kinesis Data Streams |
|------|-----|------------------------|
| 모델 | 큐 (소비 후 삭제) | 스트림 (보존, 재생) |
| 다중 컨슈머 | 같은 메시지 한 번만 | 여러 컨슈머 독립적 |
| 순서 | FIFO만 | 샤드 내 순서 |
| 보존 | 14일까지 | 365일까지 |
| 사용 | 디커플링 작업 큐 | 실시간 분석·재생 |

### 5. MSK (Managed Streaming for Kafka)

- 완전 관리형 Kafka.
- Kinesis Data Streams 대안. Kafka 호환 필요할 때.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Resharding** | Split/Merge로 샤드 수 조정 | 처리량 ↑ |
| **KCL (Kinesis Client Library)** | 컨슈머 SDK, 체크포인트 자동 | 분산 컨슈머 |
| **Firehose + S3 + Glue + Athena** | 서버리스 분석 패턴 | 시험 빈출 |
| **Firehose 백업 버킷** | 변환 실패 시 원본 보관 | 운영 안정성 |
| **Managed Flink (구 KDA)** | SQL/Java로 스트리밍 처리 | 윈도우 집계 |

> ⚠️ **함정**: "다중 시스템이 같은 이벤트 데이터를 독립 처리, 재생 필요" → SQS ❌, **Kinesis Data Streams**.

> 💡 **암기 팁**: 자동 적재 = Firehose / 다중 컨슈머·재생 = Data Streams / Kafka = MSK / 실시간 분석 = Managed Flink.

### 관련 서비스 Cross-Reference

- SQS → Day 1
- OpenSearch / Redshift → Week 5
- S3 + Athena → Week 4

---

## 🏗️ 아키텍처 다이어그램

```
[ 클릭스트림 분석 ]

  Web/Mobile → KPL → Kinesis Data Streams (N shards)
                          ├─ Consumer 1: Lambda (실시간 이상 탐지)
                          ├─ Consumer 2: Managed Flink (윈도우 집계 → DDB)
                          └─ Consumer 3: Firehose → S3 (Parquet) → Athena
                                              ↘ OpenSearch (대시보드)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ 다회 소비·재생·순서 = **Data Streams**.
2. ⭐ 자동 적재(S3/Redshift/OpenSearch) = **Firehose** (near-real-time).
3. ⭐ Partition Key 균등 분포 = Hot Shard 방어.
4. ⭐ **Enhanced Fan-out**으로 컨슈머별 2MB/s.
5. ⭐ Kafka 마이그레이션 = **MSK**.

---

## 💻 실제 예시 - AWS CLI

```bash
# Kinesis Data Streams 생성
aws kinesis create-stream --stream-name saa-events \
  --shard-count 3 --stream-mode-details StreamMode=PROVISIONED

# 레코드 넣기
aws kinesis put-record --stream-name saa-events \
  --data $(echo -n '{"event":"click"}' | base64) \
  --partition-key user-1234

# Firehose 생성 (S3 적재)
aws firehose create-delivery-stream --delivery-stream-name saa-firehose \
  --extended-s3-destination-configuration file://firehose.json
```

---

## 📝 연습 문제

**문제 1.** 클릭스트림을 동시에 여러 분석 시스템이 독립 소비:

A) SQS B) Kinesis Data Streams C) SNS D) EventBridge

**정답: B**.

---

**문제 2.** 로그를 S3에 자동 적재 + Parquet 변환:

A) Data Streams + Lambda B) Firehose + S3 + 변환 C) MSK D) SQS → S3

**정답: B**.

---

**문제 3.** 윈도우 집계 + 실시간 평균:

A) Lambda 단독 B) Managed Service for Apache Flink C) Firehose D) SNS

**정답: B**.

---

**문제 4.** 한 샤드 처리량 한계는?

A) 100KB/s in B) 1MB/s in / 2MB/s out C) 10MB/s D) 무제한

**정답: B**.

---

**문제 5.** Kafka 호환:

A) Data Streams B) MSK C) Firehose D) SNS FIFO

**정답: B**.

---

## 📌 오늘의 요약

1. Data Streams = 다회 소비·재생·순서.
2. Firehose = 자동 적재 (분 단위 near-real-time).
3. Managed Flink = 실시간 분석.
4. MSK = Kafka 완전 관리.
5. 파티션 키 균등 분포가 핵심.
