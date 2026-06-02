# Day 38 - EventBridge — Bus, Pipes, Scheduler

📅 날짜: Week 8 (Day 3)
🎯 주제: 이벤트 라우팅·스케줄링
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- EventBridge 핵심 4축(Event Bus, Pipes, Scheduler, Schema Registry)을 안다
- Default Bus·Custom Bus·Partner Bus 차이를 안다
- 이벤트 규칙(Rule)의 패턴 매칭과 타겟 분기를 작성할 수 있다
- EventBridge Pipes vs Step Functions 선택 기준

---

## 🧩 사전 지식 (CS 기초)

- **Event-Driven Architecture**: 생산자 → 이벤트 버스 → 다수 소비자. 시간·서비스 디커플링.
- **At-least-once Delivery**: 최소 1회 전달 보장 (중복 가능). 소비자가 idempotent 필요.

---

## 📖 이론 내용

### 1. Event Bus 종류

| 종류 | 사용처 |
|------|--------|
| **Default Bus** | AWS 서비스(예: EC2 상태 변경) |
| **Custom Bus** | 사용자가 publish하는 도메인 이벤트 |
| **Partner Bus** | SaaS 파트너(Shopify, Datadog 등) 이벤트 |

### 2. Rule = 이벤트 패턴 + 타겟

```json
{
  "source": ["myapp.orders"],
  "detail-type": ["OrderPlaced"],
  "detail": { "amount": [{ "numeric": [">", 1000] }] }
}
```

타겟: Lambda·Step Functions·SQS·SNS·Kinesis·ECS Task·API Destination(외부 HTTPS)·다른 Bus·Pipes 등 20+개.

### 3. EventBridge Pipes (2022 GA)

- Source → (Filter → Enrich) → Target 단일 파이프
- 소스: SQS·Kinesis·DDB Stream·MQ·MSK
- 타겟: Lambda·Step Functions·EventBridge Bus·SNS·SQS 등
- 코드 작성 없이 큐 → SF·Lambda 등 연결

### 4. EventBridge Scheduler (2022)

- CloudWatch Events Rule의 후속 (cron/rate)
- 100만 이상 스케줄 지원, one-time·flexible time window·timezone
- 200+ 서비스 API를 직접 호출 (Lambda 거치지 않고)
- Universal target = 동기 호출

### 5. Schema Registry

- 이벤트 스키마 등록·버전 관리
- 자동 디스커버리로 스키마 추출
- 코드 바인딩(Java·Python·TS) 자동 생성

### 6. Archive·Replay

- 이벤트를 Archive 보존
- Replay로 과거 이벤트 다시 흘리기 (디버깅·롤백)

---

## 🧠 알아두면 좋은 심화 이론

### EventBridge vs SNS

| 항목 | SNS | EventBridge |
|------|-----|-------------|
| 패턴 매칭 | 메시지 필터링(속성) | 풍부한 JSON 패턴 |
| Throughput | 매우 높음 | 보통 |
| 타겟 종류 | Lambda/SQS/HTTP/SMS/Email | 20+ AWS + API Destination |
| 스키마 관리 | 없음 | Schema Registry |

→ Fan-out 단순 대규모 = SNS, 다양한 타겟·필터링 = EventBridge.

### Pipes vs Step Functions

- 단순 1:1 변환·라우팅 → Pipes
- 복잡한 분기·병렬·재시도·보상 → Step Functions
- Pipes Target이 Step Functions가 되는 패턴도 흔함

---

## 🏗️ 다이어그램 — 도메인 이벤트 라우팅

```
[OrderService] ──publish──► [Custom Bus: order-domain]
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       │ Rule: OrderPlaced amount>1000                       │
       ▼                          ▼                          ▼
[Step Functions Saga]      [Lambda 알림]             [Kinesis 분석]
```

---

## ⭐ 핵심 포인트

1. ⭐ Bus 3종 — Default(AWS)·Custom(도메인)·Partner(SaaS)
2. ⭐ Rule = 패턴 + 타겟 (다수 가능)
3. ⭐ **Pipes = 큐/스트림 → 타겟 단일 파이프 (Filter·Enrich)**
4. ⭐ **Scheduler = 100만 스케줄·200+ 서비스 직접 호출**
5. ⭐ Schema Registry로 스키마 진화 관리
6. ⭐ Archive·Replay로 과거 이벤트 재생
7. ⭐ Fan-out 단순 = SNS, 다양 타겟·필터 = EventBridge

---

## 💻 실제 예시 - Rule 생성

```bash
aws events put-rule \
  --name high-value-order \
  --event-bus-name order-domain \
  --event-pattern '{"source":["myapp.orders"],"detail-type":["OrderPlaced"],"detail":{"amount":[{"numeric":[">",1000]}]}}'

aws events put-targets \
  --rule high-value-order \
  --event-bus-name order-domain \
  --targets 'Id=1,Arn=arn:aws:states:...:stateMachine:OrderSaga,RoleArn=arn:aws:iam:::role/InvokeSFN'
```

---

## 📝 연습 문제

**문제 1.** SQS 큐 메시지를 필터링·변환 후 Step Functions로 코드 없이 보내려 한다.

A) Lambda로 직접 작성
B) EventBridge Pipes
C) SQS Redrive
D) DMS

**정답: B**

---

**문제 2.** 100만 개 스케줄(예: 회원별 알림 시간)을 관리. Lambda 호출 1:1.

A) CloudWatch Events Rule
B) EventBridge Scheduler
C) Step Functions Cron
D) Cron on EC2

**정답: B**

---

**문제 3.** Shopify 이벤트를 AWS로 수신.

A) Default Bus
B) Custom Bus
C) Partner Event Bus
D) API Destination

**정답: C**

---

**문제 4.** 1년치 이벤트를 보관 후 디버깅 시 재생.

A) S3 + Athena
B) EventBridge Archive·Replay
C) CloudTrail Lake
D) Kinesis Firehose

**정답: B**

---

**문제 5.** 단순 fan-out 메시지(예: 5개 SQS). 매우 높은 처리량.

A) EventBridge
B) SNS
C) Kinesis
D) Step Functions

**정답: B**

---

**문제 6.** 이벤트 스키마 자동 디스커버리·버전·코드 바인딩.

A) Glue Schema Registry
B) EventBridge Schema Registry
C) AppSync
D) Schemas Service

**정답: B** (Glue Schema Registry는 Kafka/Kinesis용)

---

## 📌 오늘의 요약

1. Default/Custom/Partner Bus
2. Pipes = 1:1 파이프(Filter·Enrich)
3. Scheduler = 100만 스케줄
4. Schema Registry·Archive·Replay
5. SNS=fan-out, EventBridge=풍부한 필터·타겟
