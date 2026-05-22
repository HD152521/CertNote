# Day 1 - EventBridge - 규칙 패턴, 버스, Pipes

📅 날짜: Week 12 (Day 1)
🎯 주제: 이벤트 기반 자동화의 중심 허브
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Default vs Custom Bus, Partner Event Bus
- Rule Event Pattern 작성
- Input Transformer로 페이로드 변환
- EventBridge Pipes (Source → Filter → Enrich → Target)
- Cross-Account Event 라우팅

---

## 🧩 사전 지식 (CS 기초)

- **Event-driven Architecture**: 이벤트로 서비스 결합도 낮춤.
- **At-least-once delivery**: 최소 1회. 중복 처리 책임은 소비자.
- **Replay**: Archive에서 이벤트 재실행. 사고 복구.
- **Fan-out**: 1개 이벤트 → N개 타겟.

---

## 📖 이론 내용

### 1. Event Bus 3종

| 종류 | 용도 |
|------|------|
| **Default Bus** | AWS 서비스 이벤트 (자동) |
| **Custom Bus** | 사용자 정의 이벤트 |
| **Partner Bus** | SaaS Partner(Datadog, MongoDB Atlas, Auth0 등) |

### 2. Event Pattern

```json
{
  "source": ["aws.codepipeline"],
  "detail-type": ["CodePipeline Pipeline Execution State Change"],
  "detail": {
    "state": ["FAILED"],
    "pipeline": [{"prefix": "MyApp-"}]
  }
}
```

연산자: `prefix`, `suffix`, `numeric`, `cidr`, `anything-but`, `exists`, `equals-ignore-case`, `wildcard`.

### 3. Target 종류 (15+)

Lambda, SNS, SQS, Step Functions, CodeBuild, CodePipeline, ECS Task, Batch Job, Kinesis, Firehose, EC2 Run Command, ASG, Systems Manager Automation, API Gateway, Event Bus(다른 버스 전달).

### 4. Input Transformer

```json
"InputTransformer": {
  "InputPathsMap": {
    "pipelineName": "$.detail.pipeline",
    "state": "$.detail.state"
  },
  "InputTemplate": "{\"text\":\"Pipeline <pipelineName> is <state>\"}"
}
```

타겟이 받는 페이로드를 사용자 형식으로.

### 5. Schedule (Scheduler)

이전 CloudWatch Events Schedule 후속:
```bash
aws scheduler create-schedule \
  --name nightly-backup \
  --schedule-expression "cron(0 3 * * ? *)" \
  --target '{
    "Arn": "arn:aws:lambda:...:function:BackupFn",
    "RoleArn": "arn:aws:iam::...:role/SchedulerRole"
  }' \
  --flexible-time-window Mode=OFF
```

- 한 번/반복
- Flexible Time Window (15분 윈도우로 스케일링)
- 백만 단위 스케줄 지원 (이전 CloudWatch Schedule 한계 극복)

### 6. EventBridge Pipes (2022+)

```
Source → Filter → Enrichment → Target
```

- **Source**: SQS, Kinesis, DynamoDB Stream, MSK, MQ, etc.
- **Filter**: 이벤트 패턴 필터링
- **Enrichment**: Lambda/Step Functions/API Gateway/API Destination로 데이터 보강
- **Target**: EventBridge 표준 타겟

복잡한 이벤트 흐름을 Lambda 없이 (또는 한 Lambda만으로) 구성.

### 7. Archive & Replay

```bash
aws events create-archive --archive-name PaymentEvents \
  --event-source-arn arn:aws:events:...:event-bus/default \
  --retention-days 90

aws events start-replay --replay-name fix-bug \
  --event-source-arn arn:aws:events:...:archive/PaymentEvents \
  --event-start-time ... --event-end-time ... \
  --destination Arn=arn:aws:events:...:event-bus/default
```

장애 후 이벤트 재처리.

### 8. Cross-Account / Cross-Region

```bash
# 수신 측 (Target Account)
aws events put-permission \
  --action events:PutEvents \
  --principal SOURCE-ACCT-ID \
  --statement-id allow-source

# 송신 측에서 Target Account의 Bus로 PutEvents
```

Cross-Region은 multi-region 이벤트 라우팅으로.

---

## 🧠 알아두면 좋은 심화 이론

### Schema Registry

EventBridge가 들어오는 이벤트의 스키마 자동 탐색 → 코드 바인딩 생성.
- 스키마 검색
- 코드 생성 (Java, Python, TS)
- 변경 감지

### Dead Letter Queue

```json
"DeadLetterConfig": {"Arn": "arn:aws:sqs:...:dlq"},
"RetryPolicy": {"MaximumRetryAttempts": 3, "MaximumEventAgeInSeconds": 3600}
```

영구 실패 이벤트를 SQS DLQ로 → 수동 처리.

### Lambda + EventBridge — 비동기 호출 보장

Lambda 실패 시 EventBridge가 재시도 + DLQ. 안정성 향상.

### Cost Considerations

- Default Bus: AWS 이벤트 무료 in/out
- Custom Bus: 100만 이벤트당 $1
- Pipes: 처리 단위 과금
- Schema Registry: 검색·저장 비용

### 관련 서비스 Cross-Reference

- **CodePipeline 트리거** → Week 5 Day 1
- **SSM Automation** → Week 12 Day 2
- **Lambda 자동 복구** → Week 12 Day 3
- **Chatbot/Slack** → Week 12 Day 4

---

## 🏗️ 아키텍처 다이어그램

```
EventBridge Hub
==================================================

  AWS Services ─► Default Bus
  Custom apps ──► Custom Bus (PutEvents)
  SaaS Partner ─► Partner Bus

         ▼
   Rules with Event Patterns
   └─ Input Transformer (optional)
         │
         ▼
   Targets (15+):
   Lambda / SNS / SQS / StepFn / ECS Task / Run Command / Batch / ...

   EventBridge Pipes
   Source(SQS/Kinesis/Dynamo Stream)
        → Filter
        → Enrichment(Lambda)
        → Target

   Scheduler
   cron/rate → Target with flexible window

   Archive → Replay (DR/bug fix)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Bus 3종 (Default/Custom/Partner) + Cross-Account PutEvents
2. ⭐ Pipes로 Source-Filter-Enrich-Target (Lambda 최소화)
3. ⭐ EventBridge Scheduler가 CloudWatch Schedule 후속 (백만 단위)
4. ⭐ Archive + Replay로 이벤트 재처리
5. ⭐ Input Transformer + DLQ + Retry로 안정 운영

---

## 💻 실제 예시

```bash
# Pipeline 실패 → Slack 알림
aws events put-rule --name PipelineFailure \
  --event-pattern '{"source":["aws.codepipeline"],"detail-type":["CodePipeline Pipeline Execution State Change"],"detail":{"state":["FAILED"]}}'

aws events put-targets --rule PipelineFailure \
  --targets 'Id=1,Arn=arn:aws:sns:...:DeployFailures,InputTransformer={InputPathsMap={p="$.detail.pipeline",s="$.detail.state"},InputTemplate="{\"text\":\"<p> is <s>\"}"}'

# Scheduler — 매일 새벽 정리
aws scheduler create-schedule --name nightly-cleanup \
  --schedule-expression "cron(0 4 * * ? *)" \
  --target '{"Arn":"arn:aws:lambda:...:function:CleanupFn","RoleArn":"arn:..."}' \
  --flexible-time-window Mode=FLEXIBLE,MaximumWindowInMinutes=30
```

---

## 📝 연습 문제

**1.** "SQS → 필터 → 데이터 보강 → DynamoDB" 구성?  A) Lambda 직접 작성 B) EventBridge Pipes (Source-Filter-Enrich-Target)  **정답: B**

**2.** Cross-Account 이벤트?  A) put-permission으로 수신 측에 권한 부여 + 송신은 Target Bus로 PutEvents B) VPC Peering  **정답: A**

**3.** "백만 단위 스케줄 + cron" 표준?  A) Lambda Cron B) EventBridge Scheduler  **정답: B**

**4.** Archive + Replay 용도?  A) 비용 절감 B) 장애 후 이벤트 재처리  **정답: B**

**5.** Target에 입력 페이로드 변형?  A) Lambda 매번 변환 B) Input Transformer  **정답: B**

**6.** 영구 실패 이벤트 처리?  A) 무시 B) DeadLetterConfig (SQS DLQ) + RetryPolicy  **정답: B**

**7.** Default Bus 비용?  A) 비쌈 B) AWS 이벤트는 무료, 사용자 PutEvents는 백만당 $1  **정답: B**

---

## 📌 오늘의 요약

1. Bus 3종 + Cross-Account
2. Pipes로 Source-Filter-Enrich-Target
3. Scheduler 백만 단위
4. Archive + Replay
5. Input Transformer + DLQ + Retry
