# Day 4 - Step Functions로 배포 워크플로 오케스트레이션

📅 날짜: Week 7 (Day 4)
🎯 주제: 복잡 워크플로 표현 — 멀티 단계 배포·승인·롤백
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Standard vs Express Workflow 차이
- ASL(Amazon States Language) 핵심 상태 타입
- Step Functions로 멀티 리전 순차 배포 워크플로 작성
- 외부 시스템 통합(.waitForTaskToken)

---

## 🧩 사전 지식 (CS 기초)

- **State Machine**: 상태와 전이의 수학적 모델.
- **Choice**: 분기. if-else 같은 조건 평가.
- **Parallel**: 병렬 실행 후 결과 머지.
- **Map**: 배열 요소별 반복 (병렬).
- **Retry/Catch**: 에러 처리 전략.
- **TaskToken**: 일시 정지 + 외부 콜백.

---

## 📖 이론 내용

### 1. Standard vs Express

| 항목 | Standard | Express |
|------|----------|---------|
| 최대 실행 시간 | 1년 | 5분 |
| 실행 모델 | 비동기, exactly-once | 동기/비동기, at-least-once |
| 비용 | 상태 전이당 과금 | 호출 + 실행 시간 |
| 이력 보존 | 90일 | CloudWatch Logs |
| 사용 사례 | 장시간 워크플로, 사람 개입 | 고빈도 API, IoT, 데이터 처리 |

### 2. ASL 상태 타입

| 타입 | 역할 |
|------|------|
| **Task** | 실제 작업 (Lambda/API/서비스 통합) |
| **Choice** | 분기 |
| **Parallel** | 여러 브랜치 동시 실행 |
| **Map** | 배열 요소 반복 |
| **Wait** | 정해진 시간/시각까지 대기 |
| **Pass** | 데이터 변환만 |
| **Succeed** | 종료 (성공) |
| **Fail** | 종료 (실패) |

### 3. AWS SDK Service Integration

```json
"DeployStack": {
  "Type": "Task",
  "Resource": "arn:aws:states:::aws-sdk:cloudformation:createStack",
  "Parameters": {
    "StackName": "myapp-prod",
    "TemplateURL.$": "$.templateUrl",
    "Capabilities": ["CAPABILITY_IAM"]
  },
  "Next": "WaitForComplete"
}
```

200+ AWS 서비스 직접 호출 — Lambda 불필요. `aws-sdk:<service>:<operation>` 형식.

### 4. Retry & Catch

```json
"InvokeLambda": {
  "Type": "Task",
  "Resource": "arn:aws:states:::lambda:invoke",
  "Parameters": {"FunctionName": "MyFn", "Payload.$": "$"},
  "Retry": [
    {
      "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"],
      "IntervalSeconds": 2,
      "MaxAttempts": 6,
      "BackoffRate": 2.0
    }
  ],
  "Catch": [
    {
      "ErrorEquals": ["States.TaskFailed"],
      "ResultPath": "$.error",
      "Next": "Rollback"
    }
  ],
  "Next": "Success"
}
```

지수 백오프 자동 + 에러별 분기.

### 5. TaskToken (.waitForTaskToken)

외부 시스템 응답 대기:
```json
"WaitForApproval": {
  "Type": "Task",
  "Resource": "arn:aws:states:::sns:publish.waitForTaskToken",
  "Parameters": {
    "TopicArn": "arn:...:ApprovalTopic",
    "Message.$": "$",
    "MessageAttributes": {
      "TaskToken": {"DataType": "String", "StringValue.$": "$$.Task.Token"}
    }
  },
  "TimeoutSeconds": 86400,
  "Next": "Deploy"
}
```

외부 시스템(Lambda/사람/Slack 봇)이 `SendTaskSuccess` 또는 `SendTaskFailure` API를 토큰과 함께 호출하면 진행.

### 6. 멀티 리전 순차 배포 워크플로 예

```
Start
  ↓
DeployToUSE1
  ↓ wait 30min, check CloudWatch alarms
  ├── alarm OK → DeployToEUW1
  │   ↓ wait, check
  │   ├── OK → DeployToAPN2
  │   │   ↓ Success
  │   └── alarm → RollbackEUW1 → RollbackUSE1 → Fail
  └── alarm → RollbackUSE1 → Fail
```

---

## 🧠 알아두면 좋은 심화 이론

### Distributed Map (2022+)

대용량 데이터(수천~수백만 항목) Map 처리:
```json
"ProcessLargeDataset": {
  "Type": "Map",
  "ItemReader": {
    "Resource": "arn:aws:states:::s3:listObjectsV2",
    "Parameters": {"Bucket": "my-data"}
  },
  "ItemProcessor": {
    "ProcessorConfig": {"Mode": "DISTRIBUTED", "ExecutionType": "EXPRESS"},
    "StartAt": "Process",
    "States": {...}
  },
  "MaxConcurrency": 1000,
  "ToleratedFailurePercentage": 5
}
```

Express 자식 워크플로 + 1만+ 동시 실행.

### EventBridge Pipes vs Step Functions

| 사용 사례 | EventBridge Pipes | Step Functions |
|----------|--------------------|----------------|
| Source → Transform → Target 단순 흐름 | ✅ | 가능 |
| 복잡 분기, 대기, 사람 개입 | 어색 | ✅ |
| 단일 step | ✅ | 과대 |
| 여러 step, 상태 관리 | 어색 | ✅ |

### CDK + Step Functions

```typescript
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

const deployTask = new tasks.CallAwsService(this, 'DeployStack', {
  service: 'cloudformation',
  action: 'createStack',
  parameters: {StackName: sfn.JsonPath.stringAt('$.name')},
  iamResources: ['*'],
});

const wait = new sfn.Wait(this, 'Wait30Min', {time: sfn.WaitTime.duration(cdk.Duration.minutes(30))});

const chain = deployTask.next(wait).next(checkAlarm).next(
  new sfn.Choice(this, 'Alarm?')
    .when(sfn.Condition.booleanEquals('$.alarmActive', true), rollback)
    .otherwise(success)
);

new sfn.StateMachine(this, 'DeployMachine', {definition: chain});
```

타입 안전 워크플로.

### CodePipeline Step Functions Action 통합

(Week 5 Day 3 참조) — 복잡 배포 로직을 Step Functions에 위임 + Pipeline은 호출만.

### Express + API Gateway 동기

Express Workflow + API Gateway → 동기 응답까지 5분. 마이크로 워크플로에 유용.

### 관련 서비스 Cross-Reference

- **CodePipeline StepFn Action** → Week 5 Day 3
- **EventBridge Pipes** → Week 12 Day 1
- **Lambda Invoke** → Week 7 Day 1, 3
- **CloudWatch Alarm** → Week 10 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
Step Functions Deployment Workflow
==================================================

  Start
    ↓
  RegisterDeployStart (PutMetric)
    ↓
  DeployToUSE1 (CloudFormation createStack)
    ↓
  Wait 30min
    ↓
  CheckCloudWatchAlarm (Lambda)
    │
    ├── Choice: alarmActive == true
    │     ↓
    │   Rollback USE1
    │     ↓
    │   Fail
    │
    └── Choice: alarmActive == false
          ↓
        DeployToEUW1 (Parallel branch)
          ├─ Deploy
          ├─ Wait
          └─ Check
          ↓
        DeployToAPN2 (same pattern)
          ↓
        Success

  External integration:
    ↓
  RequestApproval (.waitForTaskToken)
    ↓ SNS → Slack → User clicks Approve
    ↓ SendTaskSuccess(token, output)
  Resume execution
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Standard(1년, exactly-once) vs Express(5분, at-least-once)
2. ⭐ AWS SDK 직접 통합으로 Lambda 없이 200+ 서비스 호출
3. ⭐ `.waitForTaskToken`로 외부 시스템·사람 개입
4. ⭐ Distributed Map으로 대용량 병렬 처리 (1만+)
5. ⭐ Retry/Catch로 지수 백오프 + 분기 에러 처리

---

## 💻 실제 예시 - 멀티 리전 배포 ASL

```json
{
  "Comment": "Multi-region canary deploy",
  "StartAt": "DeployUSE1",
  "States": {
    "DeployUSE1": {
      "Type": "Task",
      "Resource": "arn:aws:states:::aws-sdk:codedeploy:createDeployment",
      "Parameters": {
        "ApplicationName": "MyApp",
        "DeploymentGroupName": "use1-prod",
        "Revision": {"RevisionType": "S3", "S3Location.$": "$.revision"}
      },
      "Next": "WaitUSE1"
    },
    "WaitUSE1": {
      "Type": "Wait",
      "Seconds": 1800,
      "Next": "CheckUSE1Alarm"
    },
    "CheckUSE1Alarm": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Parameters": {
        "FunctionName": "CheckAlarmFn",
        "Payload": {"region": "us-east-1"}
      },
      "ResultPath": "$.alarmResult",
      "Next": "USE1Decision"
    },
    "USE1Decision": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.alarmResult.Payload.alarmActive",
          "BooleanEquals": true,
          "Next": "RollbackUSE1"
        }
      ],
      "Default": "DeployEUW1"
    },
    "DeployEUW1": {
      "Type": "Task",
      "Resource": "arn:aws:states:::aws-sdk:codedeploy:createDeployment",
      "Parameters": {
        "ApplicationName": "MyApp",
        "DeploymentGroupName": "euw1-prod"
      },
      "Next": "Success"
    },
    "RollbackUSE1": {
      "Type": "Task",
      "Resource": "arn:aws:states:::aws-sdk:codedeploy:stopDeployment",
      "Parameters": {"DeploymentId.$": "$.deploymentId", "AutoRollbackEnabled": true},
      "End": true
    },
    "Success": {"Type": "Succeed"}
  }
}
```

---

## 📝 연습 문제

**문제 1.** Standard와 Express Workflow의 가장 큰 차이는?

A) Standard는 1년, Express는 5분 + exactly-once vs at-least-once
B) 동일
C) Standard는 비용이 더 비쌈만
D) Express는 사람 개입 가능

**정답: A**
해설: 기간과 보장이 본질적 차이.

---

**문제 2.** Step Functions에서 외부 시스템 응답을 기다리는 패턴은?

A) Wait 상태
B) `.waitForTaskToken` + SendTaskSuccess/Failure
C) Polling Lambda
D) Choice 상태

**정답: B**
해설: TaskToken이 외부 콜백의 표준.

---

**문제 3.** Lambda 없이 CloudFormation을 직접 호출하려면?

A) `arn:aws:states:::aws-sdk:cloudformation:createStack` 사용
B) Lambda Invoke
C) ECS Task
D) Custom resource

**정답: A**
해설: AWS SDK 직접 통합.

---

**문제 4.** 100만 개 S3 객체를 처리하려면?

A) Standard Map
B) Distributed Map (Express 자식 + 1만+ 동시)
C) Lambda 1만 개 동시 호출
D) EC2 폴링

**정답: B**
해설: Distributed Map이 대용량 처리의 표준.

---

**문제 5.** Step Functions의 Retry 동작은?

A) 즉시 재시도
B) IntervalSeconds + BackoffRate로 지수 백오프
C) 영구 재시도
D) Lambda DLQ

**정답: B**
해설: 백오프 자동.

---

**문제 6.** Step Functions가 CodePipeline보다 적합한 시나리오는?

A) 단순 직선 빌드 파이프라인
B) 복잡 분기, 멀티 리전 순차, 사람 개입이 있는 워크플로
C) GitHub Source
D) ECR 이미지 푸시

**정답: B**
해설: 복잡 워크플로 표현이 Step Functions의 강점.

---

**문제 7.** Express Workflow의 사용 사례가 아닌 것은?

A) API Gateway 동기 백엔드
B) IoT 데이터 처리
C) 사람 승인이 필요한 1주일 워크플로
D) 고빈도 마이크로 워크플로

**정답: C**
해설: 5분 한도 — 1주일은 Standard.

---

## 📌 오늘의 요약

1. Standard(1년) vs Express(5분), 보장·비용·이력 차이
2. AWS SDK 직접 통합으로 Lambda 없이 워크플로 단순화
3. `.waitForTaskToken`로 외부 시스템·사람 개입 통합
4. Distributed Map으로 대용량 병렬 처리
5. Retry/Catch + Choice로 견고한 에러 처리
