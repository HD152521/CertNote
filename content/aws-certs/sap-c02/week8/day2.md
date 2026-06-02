# Day 37 - Step Functions 워크플로우 패턴

📅 날짜: Week 8 (Day 2)
🎯 주제: 워크플로우 오케스트레이션
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Step Functions Standard vs Express 차이를 안다
- 상태 종류(Task/Choice/Parallel/Map/Wait/Pass/Fail/Succeed)를 이해한다
- 콜백 패턴·.sync·.waitForTaskToken 사용처를 안다
- Saga·Error Handling·Retry 전략을 구현할 수 있다

---

## 🧩 사전 지식 (CS 기초)

- **State Machine**: 입력에 따라 상태를 전이하는 모델. Step Functions = 매니지드 상태 머신.
- **ASL(Amazon States Language)**: Step Functions JSON DSL.
- **Saga 패턴**: 분산 트랜잭션의 보상 트랜잭션. 결제 실패 시 재고·포인트를 되돌림.

---

## 📖 이론 내용

### 1. Standard vs Express

| 항목 | Standard | Express |
|------|----------|---------|
| 실행 시간 | 최대 1년 | 최대 5분 |
| 가격 모델 | 상태 전이당 | 호출·시간 |
| 정확히 1회 | At-least-once 보장 | At-least-once(Sync)·At-most-once(Async) |
| 사용 사례 | 주문 처리 등 장기 워크플로우 | 스트리밍·IoT 짧은 워크플로우 |

### 2. State 종류

| State | 역할 |
|-------|------|
| **Task** | Lambda·서비스 직접 호출 |
| **Choice** | 분기 |
| **Parallel** | 다중 분기 동시 실행 |
| **Map** | 배열 항목 반복 (동적 병렬) |
| **Wait** | 시간/타임스탬프 대기 |
| **Pass** | 입력 패스스루(테스트) |
| **Succeed/Fail** | 종료 |

### 3. 서비스 통합 패턴

- **Request-Response (default)**: 호출하고 즉시 다음
- **.sync**: Job 완료까지 동기 대기 (ECS RunTask, EMR step, Glue 등)
- **.waitForTaskToken**: 외부 시스템 콜백 대기 (Human approval 등)

### 4. Map (Distributed Map 2022~)

- 표준 Map은 동시 40개 제한
- Distributed Map: 최대 10,000 병렬, 큰 S3 데이터셋 일괄 처리
- ETL·대량 인덱싱에 활용

### 5. Error Handling·Retry

```json
"Task": {
  "Type": "Task",
  "Resource": "arn:aws:states:::lambda:invoke",
  "Retry": [
    { "ErrorEquals": ["Lambda.ServiceException"],
      "IntervalSeconds": 2, "MaxAttempts": 3, "BackoffRate": 2.0 }
  ],
  "Catch": [
    { "ErrorEquals": ["States.ALL"],
      "ResultPath": "$.error", "Next": "Compensate" }
  ]
}
```

### 6. Saga 패턴 구현

- 각 Step의 Catch에 보상 Step 연결
- 결제 실패 → 주문 취소 + 재고 복원 + 알림

### 7. Step Functions Workflow Studio

- 비주얼 캔버스로 워크플로우 작성
- ASL JSON 자동 생성 + 검증

---

## 🧠 알아두면 좋은 심화 이론

### Step Functions vs Glue Workflows vs SWF

- **Step Functions**: 범용 워크플로우
- **Glue Workflows**: ETL 전용
- **SWF**: 레거시, 신규는 Step Functions

### Activity Worker (legacy)

- Step Functions가 작업을 큐에 넣으면 EC2/온프레 워커가 폴
- 신규는 .waitForTaskToken으로 대체

### EventBridge Pipes와의 관계

- 이벤트 소스 → 필터 → 변환 → 타겟 하나의 파이프
- Step Functions가 더 복잡한 흐름, Pipes는 1:1 라우팅

---

## 🏗️ 다이어그램 — 주문 Saga

```
[OrderReceived]
   │
   ▼
[ReserveInventory] ──fail──► [CancelOrder]
   │ ok
   ▼
[ChargePayment] ──fail──► [RestoreInventory] → [CancelOrder]
   │ ok
   ▼
[ShipOrder]
```

---

## ⭐ 핵심 포인트

1. ⭐ Standard = 장기·정확히 1회, Express = 짧고 빠름
2. ⭐ Map(Distributed) = 10,000 병렬
3. ⭐ .sync = 작업 완료 대기, .waitForTaskToken = 콜백 대기
4. ⭐ Retry·Catch로 견고한 에러 처리, Saga 보상
5. ⭐ Workflow Studio로 비주얼 작성

---

## 💻 실제 예시 - Map 상태

```json
"ProcessBatch": {
  "Type": "Map",
  "ItemsPath": "$.items",
  "MaxConcurrency": 10,
  "Iterator": {
    "StartAt": "ProcessItem",
    "States": {
      "ProcessItem": {
        "Type": "Task",
        "Resource": "arn:aws:states:::lambda:invoke",
        "End": true
      }
    }
  },
  "End": true
}
```

---

## 📝 연습 문제

**문제 1.** 5분 이내·고처리량 IoT 이벤트 처리 워크플로우는?

A) Standard
B) Express
C) Activity Worker
D) Glue Workflow

**정답: B**

---

**문제 2.** ECS RunTask가 끝날 때까지 동기 대기.

A) Request-Response
B) .sync
C) .waitForTaskToken
D) Async

**정답: B**

---

**문제 3.** 인간 승인 대기 → 외부 콜백으로 진행.

A) Wait State
B) .waitForTaskToken
C) .sync
D) Activity

**정답: B**

---

**문제 4.** S3 100만 객체 병렬 처리. Iterator는?

A) Map (standard)
B) Distributed Map
C) Parallel
D) Lambda Loop

**정답: B**

---

**문제 5.** Saga 보상 트랜잭션 구현. 적절한 구문?

A) Retry
B) Catch + 별도 보상 분기
C) TimeoutSeconds
D) ResultSelector

**정답: B**

---

**문제 6.** Standard Workflow의 가격 모델은?

A) 호출 횟수만
B) 상태 전이당
C) 메모리·시간
D) 무료

**정답: B**

---

## 📌 오늘의 요약

1. Standard = 장기·정확히 1회, Express = 짧고 빠름
2. Distributed Map = 10K 병렬
3. .sync vs .waitForTaskToken
4. Retry + Catch로 Saga 구현
5. Workflow Studio·ASL JSON
