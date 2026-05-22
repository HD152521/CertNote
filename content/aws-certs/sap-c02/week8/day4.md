# Day 39 - AppSync, SQS·SNS 패턴, 이벤트 기반 아키텍처

📅 날짜: Week 8 (Day 4)
🎯 주제: 이벤트 기반·실시간 API
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AppSync GraphQL의 강점과 실시간 구독을 이해한다
- SQS Standard·FIFO·DLQ 패턴을 안다
- SNS FIFO·Message Filtering·Cross-Account Fan-out
- 이벤트 기반 아키텍처에서 적절한 메시징 서비스를 선택한다

---

## 🧩 사전 지식 (CS 기초)

- **GraphQL**: 클라이언트가 필요한 필드만 선언적으로 요청. Overfetch/Underfetch 해소.
- **WebSocket**: 양방향 영구 연결. 실시간 알림에 사용.
- **At-most-once vs At-least-once vs Exactly-once**: 메시징 전달 보장 모델.

---

## 📖 이론 내용

### 1. AWS AppSync

- 매니지드 GraphQL 서비스
- Resolver: DynamoDB·Lambda·HTTP·OpenSearch·RDS Proxy
- **실시간 Subscription** WebSocket 기반
- 인증: API Key·IAM·Cognito·OIDC·Lambda Authorizer
- 캐싱: AppSync Cache(Memcached 기반)
- 오프라인 동기화 (Amplify DataStore 연계)

### 2. SQS

| 종류 | TPS | 순서 | 중복 |
|------|-----|------|------|
| **Standard** | 거의 무한 | 보장 X | 가능 |
| **FIFO** | 300 TPS(배치 시 3000) | 그룹 ID 내 순서 보장 | 중복 제거 5분 |

- **Visibility Timeout**: 메시지 잠금 시간
- **Long Polling**: WaitTimeSeconds 20 — 빈 응답 줄임
- **DLQ**: 처리 실패 메시지 격리, maxReceiveCount 임계
- **Delay Queue**: 새 메시지 지연 (0~15분)

### 3. SNS

- **FIFO Topic**: SQS FIFO에 fan-out 가능 (다른 SQS FIFO들)
- **Message Filtering**: subscriber별 필터링 정책
- **Cross-Account/Cross-Region Subscription**: 멀티 계정 fan-out
- **Mobile Push·SMS·Email** 직접

### 4. SQS Fan-out 패턴

```
[Publisher] → [SNS Topic] ─┬─► SQS Queue A → Worker A
                            ├─► SQS Queue B → Worker B
                            └─► Lambda C (subscribe)
```

### 5. EventBridge·SNS·SQS·Kinesis 비교

| 서비스 | 모델 | 보존 | 순서 |
|--------|------|------|------|
| SNS | Pub/Sub fan-out | 없음(즉시 발송) | 보장 X |
| SQS | Queue (1:1 소비) | 14일 | FIFO만 보장 |
| EventBridge | Pub/Sub + 풍부 필터·타겟 | Archive로 보존 | 보장 X |
| Kinesis | 스트림·재처리 가능 | 365일 | 샤드 내 보장 |

### 6. Kinesis Data Streams vs Firehose

- **KDS**: 실시간 처리·재처리·다중 소비자
- **Firehose**: 배달자 (S3·Redshift·OpenSearch·Splunk), 60초 버퍼

### 7. MSK (Managed Kafka)

- Apache Kafka 표준
- Schema Registry(Glue) 연계
- 이식성 좋음, Kafka 표준 클라이언트 사용

---

## 🧠 알아두면 좋은 심화 이론

### Lambda Event Source Mapping

- SQS·Kinesis·DDB Stream·MQ·MSK → Lambda 폴 + 호출
- Batch Size·Maximum Batching Window·ReportBatchItemFailures

### SQS Cross-Account 권한

- Queue Policy에 다른 계정 ARN 허용
- KMS CMK Key Policy도 동일하게 허용 필요

### SNS Mobile Push

- APNS(iOS)·FCM(Android)·ADM 통합

---

## 🏗️ 다이어그램 — SNS Fan-out + SQS DLQ

```
[Publisher]
   │ PublishMessage
   ▼
[SNS Topic order-events]
   ├──Filter:type=high──► [SQS high-value-queue] → Worker
   │                              │ fail × 5
   │                              ▼
   │                       [DLQ]
   └──Filter:type=low───► [SQS low-value-queue] → Worker
```

---

## ⭐ 핵심 포인트

1. ⭐ AppSync = GraphQL + 실시간 Subscription
2. ⭐ SQS Standard(고처리량) vs FIFO(순서·중복 제거)
3. ⭐ DLQ + maxReceiveCount로 실패 격리
4. ⭐ SNS FIFO → 다중 SQS FIFO Fan-out
5. ⭐ Message Filtering으로 subscriber별 필터
6. ⭐ Kinesis = 재처리, SQS = 1회 소비
7. ⭐ Lambda ESM: Batch Size·ReportBatchItemFailures

---

## 💻 실제 예시 - SQS DLQ 구성

```bash
aws sqs set-queue-attributes \
  --queue-url https://.../main-queue \
  --attributes '{
    "RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:...:dlq\",\"maxReceiveCount\":\"5\"}",
    "VisibilityTimeout":"60"
  }'
```

### SNS Filter Policy

```bash
aws sns set-subscription-attributes \
  --subscription-arn arn:... \
  --attribute-name FilterPolicy \
  --attribute-value '{"type":["high"]}'
```

---

## 📝 연습 문제

**문제 1.** 실시간 채팅 + 모바일 오프라인 동기화 + GraphQL.

A) API Gateway WebSocket
B) AppSync
C) IoT Core
D) Pinpoint

**정답: B**

---

**문제 2.** 결제 메시지 — 정확히 1회·순서 보장.

A) SQS Standard
B) SQS FIFO + 중복 제거
C) Kinesis
D) SNS

**정답: B**

---

**문제 3.** 한 메시지를 5개 워커가 각각 받아 처리. fan-out.

A) SQS만
B) SNS → 다수 SQS
C) Kinesis 단일 샤드
D) EventBridge → Lambda

**정답: B**

---

**문제 4.** 처리 실패 메시지 5회 이후 격리.

A) Visibility Timeout
B) DLQ + maxReceiveCount=5
C) Long Polling
D) Delay Queue

**정답: B**

---

**문제 5.** 다중 소비자가 같은 스트림을 시간 차로 재처리.

A) SQS
B) Kinesis Data Streams
C) SNS
D) AppSync

**정답: B**

---

**문제 6.** subscriber별 메시지를 속성으로 필터링.

A) SNS Message Filtering
B) SQS Visibility Timeout
C) EventBridge Archive
D) Kinesis Sharding

**정답: A**

---

## 📌 오늘의 요약

1. AppSync = GraphQL + Subscription
2. SQS Standard·FIFO 차이, DLQ로 실패 격리
3. SNS Fan-out + Message Filtering
4. Kinesis = 재처리·다중 소비자
5. MSK = Kafka 표준
6. Lambda ESM Batch·PartialBatchResponse
