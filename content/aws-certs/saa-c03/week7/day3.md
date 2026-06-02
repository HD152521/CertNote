# Day 33 - EventBridge: 규칙, 패턴, Schema Registry

📅 날짜: Week 7 (Day 3)
🎯 주제: 이벤트 라우팅·통합 허브
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- EventBridge의 이벤트 버스 종류 3가지를 안다
- 패턴 매칭·변환·아카이브를 활용한다
- EventBridge vs SNS·SQS·Pipes 사용 분기점을 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **이벤트 드리븐 아키텍처(EDA)**: "일어난 사실"을 발행하면 관심 있는 곳이 소비.
- **루트 액터(Bus)**: 이벤트를 모아 라우팅하는 허브.
- **스키마 진화**: 이벤트 모델이 시간에 따라 변할 때 호환성 관리.

---

## 📖 이론 내용

### 1. 이벤트 버스 3종

| 버스 | 출처 |
|------|------|
| **Default Bus** | AWS 서비스 + 사용자 이벤트 |
| **Partner Bus** | Zendesk, Datadog 등 SaaS |
| **Custom Bus** | 자체 어플리케이션 |

### 2. 규칙(Rule)

- **Event Pattern**(이벤트 매치) 또는 **Schedule** (cron/rate).
- 매치 시 **Target**(최대 5개)에 라우팅.
- 타겟: Lambda / SQS / SNS / Step Functions / Kinesis / API Destination / EC2 API 등.

### 3. Input Transformation

- 이벤트의 일부 필드만 골라서 타겟에 전달.
- 변수 치환 `<orderId>` 같은 템플릿.

### 4. Schema Registry

- 이벤트 스키마 자동 발견 + 코드 자동 생성(Java/TS/Python).
- 발견된 스키마에 버전 관리.

### 5. Archive & Replay

- 이벤트를 아카이브에 보관 → 나중에 replay.
- 디버깅 / 재처리에 강력.

### 6. EventBridge Pipes

- Source → (옵션) Filter → (옵션) Enrich → Target.
- Source: SQS / Kinesis / DDB Streams / MSK / MQ.
- Target: SNS / SQS / Step Functions / API Destination 등.
- "최소 코드로 통합"이 핵심.

### 7. EventBridge Scheduler

- 더 유연한 크론(1초 단위, 1억 스케줄까지). 시간대·일회성 지원.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **API Destinations** | 외부 HTTP API 호출(인증 포함) | SaaS 통합 |
| **Connections** | OAuth/Basic/API Key 보관 | API Destinations 함께 |
| **Cross-account 이벤트** | 다른 계정 버스로 보낼 수 있음 | 멀티 계정 통합 |
| **EventBridge vs SNS** | 풍부 필터·아카이브·스케줄 / 단순 fanout | 시험 자주 |
| **EventBridge vs SQS** | 이벤트 라우팅 / 작업 큐 | 다름 |

> ⚠️ **함정**: "수많은 SaaS·AWS 서비스에서 오는 이벤트를 풍부한 규칙으로 라우팅" → EventBridge ✅. SNS는 단순 brodcast.

> 💡 **암기 팁**: 풍부한 패턴/스케줄/아카이브 = EventBridge / 1:N 알림 = SNS / 큐잉 = SQS.

### 관련 서비스 Cross-Reference

- Step Functions → Week 6
- Lambda → Week 6
- CloudWatch Events → 구버전, EventBridge로 통합

---

## 🏗️ 아키텍처 다이어그램

```
[ EventBridge 패턴 ]

  AWS Services (S3 / EC2 / Health)
  Partner Sources (Datadog / Auth0)
  Custom App
       │ PutEvents
       ▼
   EventBridge Bus
       │ Event Pattern
       ▼
   Rule ── Target1: Lambda
        ── Target2: Step Functions
        ── Target3: API Destination (Slack)

[ Pipes ]

  SQS / Kinesis / DDB Streams / MSK
       │
   (Filter)
   (Enrich: Lambda / API Destination)
       │
   Target (SNS, SFN, ...)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **EventBridge = 이벤트 라우팅 허브**. SNS보다 풍부, SQS는 큐.
2. ⭐ Schedule + Cron + Rate를 한 곳에서. **EventBridge Scheduler**가 더 유연.
3. ⭐ **API Destinations**로 외부 SaaS 호출.
4. ⭐ Archive/Replay로 디버깅·재처리.
5. ⭐ Pipes로 Source→Filter→Enrich→Target 최소 코드 통합.

---

## 💻 실제 예시 - AWS CLI

```bash
# 커스텀 버스 + 규칙
aws events create-event-bus --name saa-bus

aws events put-rule --name order-created \
  --event-bus-name saa-bus \
  --event-pattern '{"source":["app.order"],"detail-type":["OrderCreated"]}'

# 타겟 추가 (Lambda)
aws events put-targets --rule order-created --event-bus-name saa-bus \
  --targets 'Id=t1,Arn=arn:aws:lambda:...:function:processOrder'

# Schedule 규칙 (매일 새벽 3시)
aws scheduler create-schedule --name nightly-cleanup \
  --schedule-expression 'cron(0 3 * * ? *)' \
  --flexible-time-window 'Mode=OFF' \
  --target 'Arn=arn:aws:lambda:...:function:cleanup,RoleArn=arn:...'
```

---

## 📝 연습 문제

**문제 1.** SaaS(Datadog) 알람을 AWS Lambda로:

A) SNS 직접 B) EventBridge Partner Source + Rule C) Kinesis D) API GW

**정답: B**.

---

**문제 2.** 매일 새벽 3시 데이터 정리:

A) Lambda 자체 타이머 B) EventBridge Scheduler / Rule cron C) SQS D) Step Functions Wait

**정답: B**.

---

**문제 3.** SQS → 필터 + 약간 변환 → Step Functions:

A) Lambda로 직접 코드 B) EventBridge Pipes C) Kinesis Firehose D) SNS

**정답: B**.

---

**문제 4.** 외부 HTTP Slack Webhook으로 알림:

A) Lambda 작성 B) EventBridge API Destination C) SNS HTTP D) ALB

**정답: B**.

---

**문제 5.** 옛 이벤트를 재처리:

A) DLQ Replay B) EventBridge Archive + Replay C) S3 Versioning D) DDB Streams

**정답: B**.

---

## 📌 오늘의 요약

1. EventBridge는 이벤트 라우팅 허브. SNS·SQS와 역할 다름.
2. Default / Partner / Custom Bus.
3. Rule + Pattern + Target 최대 5.
4. Scheduler / API Destinations / Pipes로 통합 확장.
5. Archive + Replay로 디버깅.
