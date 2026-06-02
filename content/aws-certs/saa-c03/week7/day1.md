# Day 31 - SQS: 표준/FIFO, 가시성 타임아웃, DLQ

📅 날짜: Week 7 (Day 1)
🎯 주제: 메시지 큐
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 표준 vs FIFO SQS의 의미 차이를 안다
- 가시성 타임아웃·롱폴링·DLQ를 설정한다
- SQS + Auto Scaling 패턴을 설명한다

---

## 🧩 사전 지식 (CS 기초)

- **At-least-once vs Exactly-once**: 메시지가 한 번 이상 vs 정확히 한 번.
- **순서(Ordering)**: 메시지 처리 순서 보장. 표준 SQS는 보장 X, FIFO는 O.
- **백프레셔(Backpressure)**: 소비자가 늦으면 큐가 누적 → 큐 길이로 스케일 트리거.
- **멱등성(Idempotency)**: 같은 호출을 여러 번 받아도 같은 결과 → 중복 방어.

---

## 📖 이론 내용

### 1. 표준 vs FIFO

| 항목 | 표준 SQS | FIFO SQS |
|------|----------|-----------|
| 처리량 | 무제한 | 300 msg/s (배치 시 3000) |
| 순서 | Best-effort | **엄격 FIFO** |
| 중복 | At-least-once (중복 가능) | Exactly-once 한 번 |
| 그룹 | - | Message Group ID로 병렬 |
| 비용 | 저렴 | 약간 비쌈 |

### 2. 핵심 속성

- 보존 기간: 1분 ~ **14일** (디폴트 4일).
- 메시지 크기: 최대 **256KB** (큰 데이터는 S3 + reference, "Extended Client").
- **Long Polling**(0~20초)로 비용·지연 ↓.

### 3. 가시성 타임아웃 (Visibility Timeout)

- 메시지를 가져간 소비자 외 다른 소비자가 같은 메시지 안 보게 숨김.
- 기본 30초, 0~12시간.
- 소비자가 처리 못하면 그대로 다시 보이게 됨.
- 처리 시간이 길면 **ChangeMessageVisibility**로 연장.

### 4. DLQ (Dead Letter Queue)

- maxReceiveCount 초과 시 이동.
- 표준 SQS의 DLQ는 표준만, FIFO의 DLQ는 FIFO만.
- 분석 후 재처리(Redrive) 가능.

### 5. SQS + ASG 패턴

- CloudWatch 메트릭 **ApproximateNumberOfMessagesVisible** 기반 스케일.
- "1개 메시지 = 1 인스턴스" 같은 비율(Backlog per Instance).

### 6. 보안 / 통합

- **암호화**: SSE-SQS / SSE-KMS.
- **VPC Endpoint** (Interface).
- 통합: Lambda(폴링), SNS Fan-out, EventBridge Pipes.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Delay Queue / Delay Message** | 0~15분 지연 후 보임 | 스케줄링 |
| **High Throughput FIFO** | per-message-group-id 단위 처리량 ↑ | 큰 워크로드 |
| **Lambda 이벤트 소스 매핑** | 배치 크기·윈도우·동시성 | 처리량 튜닝 |
| **Partial Batch Response** | 실패 메시지만 가시성 복원 | Lambda 통합 |
| **Redrive Allow Policy** | 어떤 큐가 DLQ로 보낼 수 있는지 | 보안 |

> ⚠️ **함정**: "정확히 한 번 + 순서" → 표준 SQS ❌, **FIFO SQS**.

> 💡 **암기 팁**: 표준 = 빠르지만 중복·순서 변경. FIFO = 정확히 한 번·순서, 처리량 제한.

### 관련 서비스 Cross-Reference

- SNS Fan-out → Day 2
- EventBridge → Day 3
- Kinesis vs SQS → Day 4

---

## 🏗️ 아키텍처 다이어그램

```
[ Decoupling 패턴 ]

  Producer (API GW + Lambda)
     │
     ▼
   SQS Queue (Visibility 30s, Retention 4d)
     │
     ▼
   Lambda (Batch 10) 또는 EC2 Worker (ASG)
     │
   처리 실패 N회 → DLQ → 알람 / 분석

[ SNS → SQS Fan-out ]

  SNS Topic ── subscribe ──> SQS-A (이메일 처리)
                          └─> SQS-B (배송 워크플로)
                          └─> SQS-C (감사 로그)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **표준 = 중복 가능·순서 보장 X / FIFO = 정확히 한 번·순서**.
2. ⭐ 가시성 타임아웃이 처리 시간보다 짧으면 **중복 처리**.
3. ⭐ DLQ + maxReceiveCount + Redrive로 실패 격리.
4. ⭐ ASG 스케일은 **큐 길이/인스턴스 비율(Backlog)**.
5. ⭐ 256KB 이상은 **S3 + Extended Client**.

---

## 💻 실제 예시 - AWS CLI

```bash
# FIFO 큐 + DLQ
aws sqs create-queue --queue-name saa.fifo \
  --attributes 'FifoQueue=true,ContentBasedDeduplication=true,VisibilityTimeout=60,MessageRetentionPeriod=345600'

aws sqs create-queue --queue-name saa-dlq.fifo --attributes FifoQueue=true

# DLQ 연결
aws sqs set-queue-attributes --queue-url $URL \
  --attributes '{"RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:...:saa-dlq.fifo\",\"maxReceiveCount\":\"5\"}"}'

# 보내기 / 받기
aws sqs send-message --queue-url $URL --message-body '{"orderId":"123"}' \
  --message-group-id "customerA"

aws sqs receive-message --queue-url $URL --wait-time-seconds 20 \
  --max-number-of-messages 10
```

---

## 📝 연습 문제

**문제 1.** "결제 처리 순서 + 중복 절대 금지":

A) Standard SQS B) FIFO SQS C) SNS D) Kinesis

**정답: B**.

---

**문제 2.** Lambda 처리가 60초 걸리는데 visibility timeout 30초. 결과?

A) 정상 B) 같은 메시지를 다른 컨슈머도 받음 → 중복 처리 C) 메시지 손실 D) DLQ로 이동

**정답: B**.

---

**문제 3.** Worker 처리 실패가 반복되면 격리:

A) Visibility 늘림 B) DLQ + maxReceiveCount C) 메시지 삭제 D) ASG 늘림

**정답: B**.

---

**문제 4.** 빈 응답 비용·지연 줄이기:

A) Long Polling (20s) B) Short Polling C) ReceiveMessage 자주 D) FIFO 사용

**정답: A**.

---

**문제 5.** 메시지 크기 500KB 보내야 함:

A) 256KB 미만으로 잘라 보내기 B) S3에 본문 저장 + SQS에 참조 (Extended Client) C) FIFO 사용 D) Kinesis

**정답: B**.

---

## 📌 오늘의 요약

1. 표준은 빠름·중복 가능, FIFO는 정확히 한 번·순서.
2. 가시성 타임아웃은 처리 시간보다 길게.
3. DLQ + Redrive로 실패 격리.
4. Long Polling이 표준.
5. 큰 본문은 S3 reference 패턴.
