# Day 28 - Step Functions, AppSync

📅 날짜: Week 6 (Day 3)
🎯 주제: 워크플로 오케스트레이션 & GraphQL
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Step Functions의 Standard vs Express 차이를 안다
- 분기·재시도·병렬 패턴을 표현한다
- AppSync GraphQL과 API Gateway REST/HTTP의 사용 분기점을 안다

---

## 🧩 사전 지식 (CS 기초)

- **상태 머신(State Machine)**: 입력 → 단계 → 출력. ASL(Amazon States Language) JSON.
- **사가(Saga) 패턴**: 마이크로서비스 트랜잭션. 보상 트랜잭션으로 일관성.
- **GraphQL**: 단일 엔드포인트에서 query/mutation/subscription. 클라이언트가 필드 명시.
- **실시간 구독(Subscription)**: WebSocket로 변경 push.

---

## 📖 이론 내용

### 1. Step Functions Standard vs Express

| 항목 | Standard | Express |
|------|----------|---------|
| 최대 실행 | 1년 | 5분 |
| 모델 | exactly-once | at-least-once / at-most-once |
| 사용 | 장기·중요 비즈니스 워크플로 | 짧고 대량(IoT, 스트리밍) |
| 비용 | 상태 전환당 | 호출 + 실행 시간 |

### 2. 주요 상태 타입

- **Task**: 작업 실행 (Lambda, ECS, DDB, SQS, SageMaker 등).
- **Choice**: 분기.
- **Parallel**: 병렬 실행.
- **Map**: 배열에 대해 반복(distributed Map → 10,000 동시).
- **Wait**: 대기.
- **Pass / Succeed / Fail**: 흐름 제어.

### 3. 통합 모드

- **Optimized**: AWS 서비스용 사전 설계(짧은 코드).
- **AWS SDK**: 거의 모든 SDK 호출 가능.
- **.sync**: 작업 완료까지 기다림.
- **.waitForTaskToken**: 콜백 시까지 기다림(인간 승인).

### 4. 에러 처리

- **Retry**: 백오프 / 최대 횟수.
- **Catch**: 특정 에러를 다른 상태로 보냄.

### 5. AppSync

- 관리형 **GraphQL**.
- 데이터 소스: DDB / Aurora / Lambda / OpenSearch / RDS / HTTP.
- **Real-time Subscription** (WebSocket).
- 캐싱·인증(Cognito/IAM/API Key/Lambda).

### 6. AppSync vs API Gateway

| 기준 | AppSync | API Gateway |
|------|---------|--------------|
| 모델 | GraphQL | REST/HTTP/WebSocket |
| 필드 선택 | 클라 결정 | 서버 결정 |
| 다중 소스 | 한 쿼리에 여러 DS | 통합당 한 백엔드 |
| 실시간 | Subscription | WebSocket API |
| 사용 | 다양한 클라이언트(모바일·웹) | 단순 RESTful |

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Distributed Map** | 1만 병렬, S3 객체 단위 처리 | 대량 ETL |
| **Activity 워커** | 외부 워커가 작업 폴링 | 온프레미스 통합 |
| **State Output Limit** | 256KB | 큰 데이터는 S3 ARN 전달 |
| **AppSync Caching** | per-resolver / per-key | 비용·지연 ↓ |
| **AppSync Pipeline Resolver** | 여러 함수 체인 | 복합 비즈니스 |

> ⚠️ **함정**: "5분 이상 워크플로" → Express ❌, Standard.

> 💡 **암기 팁**: 인간 승인 = waitForTaskToken / 1만 병렬 = Distributed Map.

### 관련 서비스 Cross-Reference

- Lambda → Day 1
- SQS / EventBridge → Week 7
- Cognito → Week 8

---

## 🏗️ 아키텍처 다이어그램

```
[ Step Functions 오케스트레이션 ]

  Start
    │
    ▼
  Task: Validate (Lambda)
    │
    ▼
  Choice ──── isPremium? ─── true ──► Task: Premium flow
    │                                       │
    └── false ──► Task: Standard ◄──────────┘
                       │
                       ▼
                  Parallel
                   ├─ Task: 결제
                   └─ Task: 로그
                       │
                       ▼
                     Succeed
   에러 → Catch → 보상(SAGA) → Fail


[ AppSync GraphQL ]

  Mobile/Web
    │
  GraphQL ▶  AppSync ───┐ Resolver: DDB
                        ├ Resolver: Lambda (외부 API)
                        └ Resolver: OpenSearch
    Subscription (WS) ◄────────────────  Mutation
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Standard 1년 exactly-once / Express 5분 at-least/most-once**.
2. ⭐ **waitForTaskToken**으로 인간 승인·외부 콜백.
3. ⭐ **Distributed Map**으로 1만 병렬.
4. ⭐ **AppSync = 관리형 GraphQL + Realtime Subscription**.
5. ⭐ **다중 데이터 소스 + 모바일** = AppSync.

---

## 💻 실제 예시 - AWS CLI

```bash
# Step Functions 상태 머신 생성
aws stepfunctions create-state-machine \
  --name OrderFlow \
  --role-arn arn:aws:iam::111122223333:role/SfnRole \
  --definition file://sfn.json --type STANDARD

# AppSync API 생성
aws appsync create-graphql-api --name saa-graphql \
  --authentication-type AMAZON_COGNITO_USER_POOLS \
  --user-pool-config userPoolId=ap-northeast-2_xxx,awsRegion=ap-northeast-2,defaultAction=ALLOW
```

---

## 📝 연습 문제

**문제 1.** 1년 걸리는 휴면 계좌 정리 워크플로:

A) Express B) Standard C) SQS D) EventBridge Scheduler

**정답: B**.

---

**문제 2.** Step Functions 사람의 승인 후 진행:

A) Map B) Wait State C) waitForTaskToken D) Parallel

**정답: C**.

---

**문제 3.** S3에 들어온 객체 1만 개를 동시에 처리:

A) Express + EventBridge B) Standard + Distributed Map C) Lambda 단독 D) SQS Polling

**정답: B**.

---

**문제 4.** 모바일 앱이 한 번에 여러 자원을 가져오고 변경 시 자동 push:

A) REST API B) AppSync GraphQL + Subscription C) WebSocket API D) gRPC

**정답: B**.

---

**문제 5.** IoT 짧은 워크플로(수초) 대량:

A) Standard B) Express C) Lambda 단독 D) EventBridge Pipes

**정답: B**.

---

## 📌 오늘의 요약

1. Step Functions Standard(장기·exactly) / Express(짧고 대량).
2. waitForTaskToken으로 인간 승인 / Distributed Map으로 1만 병렬.
3. AppSync는 GraphQL + Realtime Subscription.
4. 다중 데이터 소스 + 모바일/웹 = AppSync.
5. 단순 REST는 API Gateway, GraphQL은 AppSync.
