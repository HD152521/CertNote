# Day 32 - SNS: Topic, 팬아웃 패턴, FIFO

📅 날짜: Week 7 (Day 2)
🎯 주제: Pub/Sub 메시징
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- SNS Topic / Subscription / Protocol을 안다
- 팬아웃 패턴(SNS → SQS 다수)을 설계한다
- SNS FIFO와 메시지 필터링·아카이브를 설명한다

---

## 🧩 사전 지식 (CS 기초)

- **Pub/Sub vs Queue**: Pub/Sub는 1:N 브로드캐스트, Queue는 1:1 작업 분배.
- **이벤트 vs 명령**: 이벤트는 "일어난 사실", 명령은 "해줘".
- **푸시 모델**: SNS는 컨슈머에 push.

---

## 📖 이론 내용

### 1. SNS 기본

- **Topic**에 publish → 모든 Subscription에 push.
- Subscription 종류: **SQS / Lambda / Email / SMS / HTTP(S) / Mobile Push / Firehose / EventBridge**.
- 처리량: 표준 무제한.
- 메시지 크기 256KB.

### 2. 팬아웃 (Fan-out)

- **SNS → 여러 SQS**: 각 컨슈머의 속도·실패가 다른 컨슈머에 영향 X.
- S3 이벤트, CloudWatch Alarm 등 단일 이벤트를 여러 시스템에 동시 알릴 때.

### 3. SNS FIFO

- 순서 보장 + 중복 제거 (Message Group ID, Deduplication ID).
- 구독 가능: **SQS FIFO**만 (Lambda FIFO도 지원 신규).

### 4. 메시지 필터링 (Filter Policy)

- 구독자별로 JSON 속성 매치 시만 전달.
- 발행자는 한 토픽에 보내고, 구독자가 필요한 것만 받는다.

### 5. 메시지 보관

- **Topic Archive**: SNS FIFO에 한해 옵션. 일정 기간 보관 + replay 가능.

### 6. 보안

- 암호화: SSE-SNS / SSE-KMS.
- 액세스 정책 (리소스 기반).
- VPC Endpoint (Interface).

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Cross-Region 게재** | 다른 리전 구독 가능 | 글로벌 알림 |
| **CloudWatch + SNS 알람** | 알람 → 이메일/Slack | 기본 모니터링 패턴 |
| **Mobile Push** | APNS/FCM/Baidu | 푸시 알림 |
| **SNS + Firehose** | 토픽 → Firehose → S3/Redshift | 분석 적재 |
| **SNS → EventBridge Pipe** | 메시지 변환 후 다양한 target | 신규 패턴 |

> ⚠️ **함정**: "SNS 메시지 순서 보장" → 표준 ❌, **SNS FIFO만**.

> 💡 **암기 팁**: 1:N 알림 = SNS / 1:1 작업 = SQS / 다중 컨슈머 + 분리 = SNS → SQS fanout.

### 관련 서비스 Cross-Reference

- SQS → Day 1
- EventBridge → Day 3
- CloudWatch Alarm → Week 9

---

## 🏗️ 아키텍처 다이어그램

```
[ 팬아웃 ]

  Producer
     ▼
   SNS Topic ── Filter Policy: type=order ──> SQS-A (배송)
              ── Filter Policy: type=order ──> SQS-B (영수증)
              ── Filter Policy: type=refund ──> Lambda-C

   ※ 각 컨슈머의 retry/DLQ 독립


[ SNS FIFO → SQS FIFO ]

  Producer (MessageGroupId, DedupId)
     ▼
   SNS FIFO Topic
     ▼
   SQS FIFO Queue (순서 보장)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **SNS → 여러 SQS 팬아웃**이 디커플링의 표준.
2. ⭐ 순서 = **SNS FIFO + SQS FIFO**.
3. ⭐ 필터 정책으로 구독자별 분기.
4. ⭐ 26 4KB 단위 청구 / 메시지 256KB.
5. ⭐ Cross-region / Cross-account 구독 가능.

---

## 💻 실제 예시 - AWS CLI

```bash
# Topic + Subscribe
aws sns create-topic --name saa-events
aws sns subscribe --topic-arn arn:...:saa-events \
  --protocol sqs --notification-endpoint arn:...:saa-q

# Filter Policy
aws sns set-subscription-attributes --subscription-arn arn:... \
  --attribute-name FilterPolicy \
  --attribute-value '{"type":["order"]}'

# FIFO Topic
aws sns create-topic --name saa-events.fifo \
  --attributes FifoTopic=true,ContentBasedDeduplication=true

# Publish
aws sns publish --topic-arn arn:...:saa-events \
  --message '{"orderId":"123"}' \
  --message-attributes '{"type":{"DataType":"String","StringValue":"order"}}'
```

---

## 📝 연습 문제

**문제 1.** 같은 이벤트를 3개 다른 시스템이 독립적으로 처리:

A) SQS만 B) SNS → SQS 팬아웃 C) Kinesis D) EventBridge만

**정답: B**.

---

**문제 2.** 결제 이벤트의 엄격한 순서가 필요:

A) Standard SNS B) SNS FIFO → SQS FIFO C) SNS → Lambda D) Kinesis

**정답: B**.

---

**문제 3.** 한 토픽에 여러 종류 이벤트를 보내고 구독자가 일부만 받게:

A) Topic 분리 B) Filter Policy C) DLQ D) Subscription Tag

**정답: B**.

---

**문제 4.** SNS 메시지 일정 기간 보관 + Replay:

A) Standard 옵션 B) FIFO Archive 옵션 C) S3에 직접 D) DLQ

**정답: B**.

---

**문제 5.** 알람 이메일을 운영자에게:

A) SQS B) SNS Email Subscription C) Lambda D) EventBridge

**정답: B**.

---

## 📌 오늘의 요약

1. SNS는 1:N 브로드캐스트. SQS는 1:1 작업.
2. 팬아웃(SNS → 여러 SQS)이 표준 디커플링.
3. 순서·중복 제거는 SNS FIFO + SQS FIFO.
4. 필터 정책으로 구독자별 분기.
5. CloudWatch Alarm → SNS가 표준 모니터링 패턴.
