# Day 4 - Step Functions: 워크플로를 코드가 아닌 상태 머신으로

Lambda 함수가 100개를 넘기 시작하면 같은 질문이 반복된다. "이 함수가 끝나면 저 함수를 부르고, 실패하면 보상 트랜잭션을 돌리고, 30분 대기 후 사람의 승인을 기다리는 로직을 어디에 둘 것인가?" 답으로 SQS·SNS·EventBridge를 엮어 함수끼리 메시지를 주고받게 하면 곧 **분산 디버깅 지옥**이 시작된다. 어느 함수가 어느 메시지를 받았는지, 왜 retry가 두 번 발생했는지, 7번째 단계에서 왜 멈췄는지 — 추적이 거의 불가능하다.

Step Functions는 이 문제에 대한 AWS의 답이다. 2016년 12월에 출시된 이 서비스의 본질은 **선언적 상태 머신 엔진**으로, 워크플로의 모든 상태 전이를 ASL(Amazon States Language)이라는 JSON DSL로 기술하고, AWS가 실행·재시도·이력 추적을 보장한다. 개발자가 작성할 코드의 양이 90% 줄어들고, 무엇보다 모든 실행이 시각적 다이어그램으로 100% 추적 가능해진다.

오늘은 Standard와 Express의 본질적 차이, `.waitForTaskToken`이라는 외부 콜백 메커니즘, Distributed Map의 대용량 병렬 처리, 그리고 멀티 리전 배포 워크플로를 Step Functions로 표현하는 실전 패턴을 본다. DOP 시험은 "복잡한 배포 흐름" 시나리오에 거의 항상 Step Functions를 정답으로 두므로, 어느 패턴이 어떤 ASL 구조에 매핑되는지를 외워두는 게 중요하다.

## Standard vs Express: 두 엔진의 본질적 차이

Step Functions는 같은 ASL을 받지만 **완전히 다른 두 엔진**을 가진다.

| 항목 | Standard Workflow | Express Workflow |
|------|-------------------|-------------------|
| 출시 | 2016 | 2019 |
| 최대 실행 시간 | 1년 | 5분 |
| 실행 보장 | Exactly-once | At-least-once |
| 가격 모델 | 상태 전이당 ($0.025/1000) | 호출 + 실행 시간 (메모리 GB-h) |
| 동기 호출 | 불가 (비동기만) | 가능 (StartSyncExecution) |
| 이력 보존 | 90일 (서비스 자체) | CloudWatch Logs (지정 기간) |
| 콘솔 시각화 | 모든 실행 그래프 자동 | Logs 기반 (별도 enable) |
| TaskToken 사용 | ✅ | ❌ |
| Wait 상태 | ✅ (1년까지) | ✅ (5분 안에서) |
| Activity 폴링 | ✅ | ❌ |

가격 모델의 차이가 결정적이다. 100ms짜리 짧은 워크플로를 초당 1000회 호출한다고 가정하자.

- **Standard**: 1 호출당 평균 5 상태 전이 × $0.025/1000 = $0.000125, 초당 1000회 = $0.125/초 = $324K/월. 비현실적.
- **Express**: 1 호출 $0.000001 + 100ms × 0.064 GB × $0.0000094/GB-s ≈ $0.0000016, 초당 1000회 = $4.1/월. 합리적.

반대로 1년짜리 한 번 실행은 Standard로는 거의 무료, Express로는 5분 한도로 아예 불가능. **호출 빈도와 실행 시간**의 곱이 둘 중 어느 쪽이 합리적인지를 결정한다.

> 💡 **관련 이론**: Exactly-once vs At-least-once는 분산 시스템의 핵심 보장 모델이다. 1987년 Birman의 **virtual synchrony**, 2014년 Kafka의 transactional message, 2016년 Google의 Pub/Sub exactly-once 등이 이 영역의 대표 작업. Standard는 워크플로 실행 ID 단위로 dedup하고 각 상태 전이를 트랜잭션으로 처리해 exactly-once를 보장. Express는 성능을 위해 이를 포기하고 사용자가 idempotency를 직접 책임진다. 시험에서 "주문 처리 워크플로 — 중복 결제 절대 금지"는 Standard, "IoT 센서 데이터 ETL — 약간의 중복 허용"은 Express.

> 🎯 **시나리오**: "배포 워크플로가 평균 90분이고, 중간에 사람의 승인 단계가 있으며, 일 100회 실행." — 답은 **Standard**. 90분 > Express 5분 한도, 사람 승인은 TaskToken 필요(Express 미지원). 반대로 "API Gateway 백엔드로 동기 응답, 평균 200ms, 초당 500회 호출"은 **Express + StartSyncExecution**. 시험 시나리오의 핵심 키워드는 "실행 시간", "호출 빈도", "사람 개입 여부", "동기 vs 비동기".

> 🔍 **더 깊이**: Express Workflow 내부 구현은 Standard와 다른 코드 경로를 사용한다. Standard는 모든 상태 전이를 DynamoDB에 기록하지만 Express는 in-memory 처리 + 종료 후 일괄로 CloudWatch Logs에 기록. 이게 비용과 성능 차이의 원인. Express가 도중에 노드 장애가 나면 처음부터 재실행(at-least-once의 정확한 의미). 한 워크플로가 Standard로 "포함된" Express 자식 워크플로를 호출하는 nested pattern으로 두 모델의 장점을 결합 가능 — Distributed Map이 이 패턴을 활용한다.

## ASL의 8가지 상태 타입

ASL은 함수형 상태 머신을 JSON으로 표현하는 DSL이다. 모든 워크플로는 8가지 상태 타입의 조합.

```
Task        실제 작업 실행 (Lambda, AWS SDK, ECS, EMR, Glue ...)
Choice      조건 분기 (if-else / switch)
Parallel    여러 브랜치 동시 실행 + 모두 끝나면 진행
Map         배열 요소별 반복 (직렬 또는 병렬)
Wait        시간/시각 대기 (1년까지)
Pass        데이터 변환만, 작업 없음
Succeed     워크플로 성공 종료
Fail        워크플로 실패 종료 (Error 정보 포함)
```

```json
{
  "Comment": "주문 처리 워크플로 예시",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Parameters": {
        "FunctionName": "ValidateOrderFn",
        "Payload.$": "$"
      },
      "ResultSelector": {"validated.$": "$.Payload.validated"},
      "ResultPath": "$.validation",
      "Retry": [
        {
          "ErrorEquals": ["Lambda.ServiceException", "Lambda.SdkClientException"],
          "IntervalSeconds": 2,
          "MaxAttempts": 6,
          "BackoffRate": 2.0
        }
      ],
      "Next": "CheckValidation"
    },
    "CheckValidation": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.validation.validated",
          "BooleanEquals": true,
          "Next": "ProcessPayment"
        }
      ],
      "Default": "RejectOrder"
    },
    "ProcessPayment": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "ChargeCard",
          "States": {
            "ChargeCard": {"Type": "Task", "Resource": "arn:aws:states:::lambda:invoke", "Parameters": {"FunctionName": "ChargeCardFn"}, "End": true}
          }
        },
        {
          "StartAt": "ReserveInventory",
          "States": {
            "ReserveInventory": {"Type": "Task", "Resource": "arn:aws:states:::lambda:invoke", "Parameters": {"FunctionName": "ReserveInvFn"}, "End": true}
          }
        }
      ],
      "Catch": [
        {"ErrorEquals": ["States.ALL"], "ResultPath": "$.error", "Next": "Compensate"}
      ],
      "Next": "Ship"
    },
    "Compensate": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Parameters": {"FunctionName": "CompensateFn"},
      "Next": "FailureEnd"
    },
    "Ship": {"Type": "Task", "Resource": "arn:aws:states:::lambda:invoke", "Parameters": {"FunctionName": "ShipFn"}, "Next": "Success"},
    "RejectOrder": {"Type": "Fail", "Error": "InvalidOrder"},
    "Success": {"Type": "Succeed"},
    "FailureEnd": {"Type": "Fail", "Error": "PaymentFailed"}
  }
}
```

이 예시에 ASL의 모든 패턴이 들어있다. **Retry**가 일시 오류에 백오프 재시도, **Choice**가 분기, **Parallel**이 결제·재고 동시 처리, **Catch**가 실패 시 보상 트랜잭션. 같은 로직을 Lambda로 직접 짜면 함수 5개 + 메시지 큐 + DynamoDB 상태 테이블이 필요한데, ASL로는 한 JSON에 완성.

> 💡 **관련 이론**: Saga 패턴은 1987년 Hector Garcia-Molina & Kenneth Salem의 논문 "Sagas"에서 제안된 분산 트랜잭션 모델이다. ACID의 atomicity를 분산 환경에서 구현하기 어렵기 때문에, 일련의 작업과 각 작업의 **보상 트랜잭션**(compensating transaction)을 짝으로 정의해 실패 시 역순으로 보상을 실행한다. Step Functions의 `Parallel` + `Catch` + 보상 Lambda 패턴이 정확히 Saga 구현체. 마이크로서비스 아키텍처의 결제·주문·재고 같은 다중 서비스 트랜잭션의 표준 해법.

## AWS SDK Service Integration: Lambda 없는 직접 통합

2021년 9월 출시된 AWS SDK Service Integration은 Step Functions의 게임 체인저였다. **200개 이상의 AWS 서비스를 Lambda 없이 직접 호출** 가능.

```json
"CreateStack": {
  "Type": "Task",
  "Resource": "arn:aws:states:::aws-sdk:cloudformation:createStack",
  "Parameters": {
    "StackName": "myapp-prod",
    "TemplateURL.$": "$.templateUrl",
    "Capabilities": ["CAPABILITY_IAM"],
    "Parameters": [
      {"ParameterKey": "Env", "ParameterValue.$": "$.env"}
    ]
  },
  "Next": "DescribeStack"
}
```

리소스 ARN 형식: `arn:aws:states:::aws-sdk:<service>:<operation>[.<integration-pattern>]`. 예시:

| 작업 | Resource ARN |
|------|--------------|
| DynamoDB PutItem | `arn:aws:states:::aws-sdk:dynamodb:putItem` |
| S3 GetObject | `arn:aws:states:::aws-sdk:s3:getObject` |
| ECS RunTask (동기 대기) | `arn:aws:states:::ecs:runTask.sync` |
| Glue StartJobRun (대기) | `arn:aws:states:::glue:startJobRun.sync` |
| SQS SendMessage | `arn:aws:states:::sqs:sendMessage` |
| SNS Publish | `arn:aws:states:::sns:publish` |
| CloudFormation CreateStack | `arn:aws:states:::aws-sdk:cloudformation:createStack` |
| CodeDeploy CreateDeployment | `arn:aws:states:::aws-sdk:codedeploy:createDeployment` |

`.sync` suffix는 작업이 완료될 때까지 대기(polling 자동). `.waitForTaskToken`은 외부 콜백 패턴. 아무 suffix 없으면 fire-and-forget.

> 📚 **사례**: 2021년 한 미디어 회사가 비디오 트랜스코딩 워크플로를 Step Functions + Lambda 12개로 운영하고 있었다. SDK Integration 출시 후 12개 Lambda 중 9개를 직접 통합으로 대체 — 워크플로 정의가 1/3로 줄고 cold start가 사라져 P99 latency가 18초에서 4초로 감소. Lambda 코드 유지보수 부담도 사라졌다. 시험에서 "Lambda 호출만 하는 함수가 많아 운영이 복잡"한 시나리오는 SDK Integration이 답.

> ⚠️ **함정**: SDK Integration의 IAM은 State Machine의 실행 Role이 가져야 한다. `arn:aws:states:::aws-sdk:cloudformation:createStack`을 호출하려면 Role에 `cloudformation:CreateStack` 권한이 필수. AWS는 자동으로 권한을 부여하지 않으므로 Role 정책에 명시. CDK의 `tasks.CallAwsService`는 `iamResources`/`iamAction`을 받아 자동으로 권한을 합성해주지만 ASL JSON 직접 작성 시 빠뜨리기 쉽다.

## TaskToken: 외부 시스템 콜백의 우아한 패턴

Step Functions가 다른 워크플로 엔진(Airflow, Argo)과 차별되는 핵심 기능이 **TaskToken** 메커니즘이다. 워크플로를 일시 정지하고 외부 시스템(사람, 다른 서비스)의 응답을 기다린다.

```json
"RequestApproval": {
  "Type": "Task",
  "Resource": "arn:aws:states:::sns:publish.waitForTaskToken",
  "Parameters": {
    "TopicArn": "arn:aws:sns:ap-northeast-2:111:DeployApprovalTopic",
    "Message": {
      "deploymentId.$": "$.deploymentId",
      "taskToken.$": "$$.Task.Token",
      "approvalUrl.$": "States.Format('https://approve.example.com/{}', $$.Task.Token)"
    }
  },
  "TimeoutSeconds": 86400,
  "Catch": [
    {"ErrorEquals": ["States.Timeout"], "Next": "TimedOut"}
  ],
  "Next": "ProceedDeploy"
}
```

동작 흐름:

```
1. Step Functions가 RequestApproval에 도달
2. SNS Topic으로 메시지 발행 (taskToken 포함)
3. 워크플로가 일시 정지 (상태는 RUNNING, 비용은 거의 0)
4. 외부 시스템(Lambda→Slack→사람)이 토큰을 받음
5. 사람이 Slack에서 "Approve" 클릭 → Lambda 호출
6. Lambda가 SendTaskSuccess(taskToken, output) 또는 SendTaskFailure(taskToken, error) 호출
7. Step Functions가 즉시 깨어나 다음 상태로 진행
8. 1년 안에 응답 없으면 TimeoutSeconds 발동
```

```python
# 승인 처리 Lambda (Slack interactive message handler)
import boto3, json

stepfunctions = boto3.client('stepfunctions')

def handler(event, context):
    payload = json.loads(event['body'])
    task_token = payload['taskToken']
    approved = payload['actions'][0]['value'] == 'approve'

    if approved:
        stepfunctions.send_task_success(
            taskToken=task_token,
            output=json.dumps({"approvedBy": payload['user']['name']})
        )
    else:
        stepfunctions.send_task_failure(
            taskToken=task_token,
            error='UserRejected',
            cause=f"Rejected by {payload['user']['name']}"
        )
    return {'statusCode': 200}
```

> 🔍 **더 깊이**: TaskToken은 cryptographic random string이고, Step Functions 서비스 내부의 워크플로 실행 인스턴스에 매핑된다. 토큰을 가진 외부 시스템은 "이 워크플로의 N번째 상태를 깨워라"는 ability를 가지게 되므로 사실상 **capability-based security**의 패턴(Henry Levy 1984). 한 번 사용된 토큰은 재사용 불가, 토큰 유실 시 워크플로는 timeout까지 대기. 1년 대기 비용은 거의 0 (Standard 가격은 상태 전이당이지 대기 시간당이 아님). 이게 Step Functions가 Airflow보다 사람 개입 워크플로에 적합한 구조적 이유.

> 🎯 **시나리오**: "프로덕션 배포 시 보안팀 승인 → DevOps 팀 승인 → 자동 배포의 3단계 검토 워크플로. 각 단계는 Slack 메시지로 통보되고, 7일 안에 응답 없으면 자동 취소." — 답은 Standard Workflow + `.waitForTaskToken` 3번 + `TimeoutSeconds: 604800`. SNS Topic 또는 EventBridge로 Slack 발송. 외부 승인 처리 Lambda가 `SendTaskSuccess/Failure` 호출. CodePipeline의 ManualApprovalAction과 비교하면 Step Functions가 훨씬 더 유연한 통보 채널·승인 워크플로를 표현 가능.

## Retry & Catch: 견고한 에러 처리

Lambda 함수 호출 한 줄에 retry 로직 7줄. 이게 ASL의 가치다.

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
      "BackoffRate": 2.0,
      "JitterStrategy": "FULL"
    },
    {
      "ErrorEquals": ["Lambda.TooManyRequestsException"],
      "IntervalSeconds": 5,
      "MaxAttempts": 10,
      "BackoffRate": 1.5,
      "MaxDelaySeconds": 60
    },
    {
      "ErrorEquals": ["States.ALL"],
      "IntervalSeconds": 1,
      "MaxAttempts": 2,
      "BackoffRate": 2.0
    }
  ],
  "Catch": [
    {
      "ErrorEquals": ["CustomBusinessError"],
      "ResultPath": "$.bizError",
      "Next": "HandleBizError"
    },
    {
      "ErrorEquals": ["States.ALL"],
      "ResultPath": "$.error",
      "Next": "GeneralErrorHandler"
    }
  ],
  "Next": "Success"
}
```

Retry는 순서대로 평가되어 첫 번째 매칭하는 정책 적용. 백오프 식은 `interval × backoffRate^(attempt-1)` + jitter. `BackoffRate: 2.0`에 `IntervalSeconds: 2`면 2 → 4 → 8 → 16 → 32 → 64초.

Catch는 Retry가 모두 실패한 후 매칭. `States.ALL`은 모든 에러, `Lambda.Unknown`은 timeout, custom 에러는 Lambda 함수에서 throw한 에러 이름.

> 💡 **관련 이론**: 지수 백오프 + Jitter는 1995년 Lamport의 분산 시스템 논문과 2015년 AWS Architecture Blog "Exponential Backoff And Jitter" 글에서 표준화됐다. Jitter 없이 같은 백오프 식을 모든 클라이언트가 사용하면 retry가 동기화돼 backend에 burst가 반복된다(thundering herd). Full jitter는 `random(0, interval × backoffRate^attempt)`로 분산. ASL은 `JitterStrategy: "FULL"`(2023+)로 이를 native 지원. 시험에서 "DynamoDB throttle → retry burst"의 해법은 backoff + jitter.

## Distributed Map: 1만 + 동시 실행

2022년 12월에 출시된 Distributed Map은 기존 Map의 한계(40 concurrent)를 깬다. **최대 10,000 동시 실행** + 자식 워크플로로 처리.

```json
"ProcessLargeDataset": {
  "Type": "Map",
  "ItemReader": {
    "Resource": "arn:aws:states:::s3:listObjectsV2",
    "Parameters": {"Bucket": "my-data", "Prefix": "raw/"},
    "ReaderConfig": {"MaxItems": 1000000}
  },
  "ItemBatcher": {
    "MaxItemsPerBatch": 100,
    "MaxInputBytesPerBatch": 262144
  },
  "ItemProcessor": {
    "ProcessorConfig": {
      "Mode": "DISTRIBUTED",
      "ExecutionType": "EXPRESS"
    },
    "StartAt": "ProcessBatch",
    "States": {
      "ProcessBatch": {
        "Type": "Task",
        "Resource": "arn:aws:states:::lambda:invoke",
        "Parameters": {"FunctionName": "ProcessBatchFn", "Payload.$": "$"},
        "End": true
      }
    }
  },
  "MaxConcurrency": 1000,
  "ToleratedFailurePercentage": 5,
  "ResultWriter": {
    "Resource": "arn:aws:states:::s3:putObject",
    "Parameters": {"Bucket": "my-results", "Prefix": "outputs/"}
  }
}
```

핵심 특징:

- **ItemReader**: S3 객체 list, S3 CSV/JSON Lines 파일 내용, DynamoDB Scan, Manifest 등 다양한 소스
- **ItemBatcher**: 여러 아이템을 한 자식 워크플로에 묶어 효율 향상
- **Mode: DISTRIBUTED**: 자식 워크플로를 별도 SF 실행으로 분리 (기존 Inline Mode는 부모 안에서 동작)
- **ExecutionType: EXPRESS**: 자식은 Express라 짧고 저렴
- **ToleratedFailurePercentage**: 5% 실패까지 허용, 초과 시 부모 실패
- **ResultWriter**: 결과를 S3에 자동 저장

> 📚 **사례**: 2023년 한 광고 회사가 매일 5000만 클릭 이벤트를 S3에서 처리하는 ETL을 Spark 클러스터로 운영하고 있었다. Spark 클러스터 운영 비용·복잡도 부담으로 Distributed Map + Lambda로 전환 — 클러스터 사라지고 비용 60% 절감, 처리 시간 비슷. 핵심은 (1) Distributed Map이 5000만 객체를 자동 분할, (2) ToleratedFailurePercentage 1%로 부분 실패 허용, (3) Lambda 1만 동시 실행으로 throughput 확보. 시험에서 "수천만 객체 처리 + 부분 실패 허용"은 Distributed Map.

> 🔍 **더 깊이**: Inline Map과 Distributed Map의 architectural 차이 — Inline은 부모 워크플로 내부에서 동기 처리되어 부모의 상태 전이 한도(execution history 25000)에 영향. Distributed는 각 iteration이 별도 child execution(Standard 또는 Express)이라 부모는 child 실행 ID만 추적. 즉 부모가 "10000개 child를 launch했고 9990개 성공" 같은 메타 정보만 가진다. 결과적으로 부모 history는 작게 유지되고 동시성은 child 풀로 확장. 이게 가능했던 이유는 2022년 SF가 child execution을 별도 가격 단위로 분리했기 때문.

## 멀티 리전 순차 배포 워크플로

DOP 시험에서 가장 자주 나오는 Step Functions 시나리오.

```json
{
  "Comment": "Multi-region progressive deployment with auto-rollback",
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
      "ResultPath": "$.use1Deploy",
      "Next": "WaitUSE1"
    },
    "WaitUSE1": {
      "Type": "Wait",
      "Seconds": 1800,
      "Next": "CheckUSE1Alarm"
    },
    "CheckUSE1Alarm": {
      "Type": "Task",
      "Resource": "arn:aws:states:::aws-sdk:cloudwatch:describeAlarms",
      "Parameters": {
        "AlarmNames": ["use1-error-rate", "use1-p99-latency"],
        "StateValue": "ALARM"
      },
      "ResultPath": "$.use1Alarms",
      "Next": "USE1Decision"
    },
    "USE1Decision": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.use1Alarms.MetricAlarms[0]",
          "IsPresent": true,
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
      "ResultPath": "$.euw1Deploy",
      "Next": "WaitEUW1"
    },
    "WaitEUW1": {"Type": "Wait", "Seconds": 1800, "Next": "CheckEUW1Alarm"},
    "CheckEUW1Alarm": {
      "Type": "Task",
      "Resource": "arn:aws:states:::aws-sdk:cloudwatch:describeAlarms",
      "Parameters": {
        "AlarmNames": ["euw1-error-rate"],
        "StateValue": "ALARM"
      },
      "ResultPath": "$.euw1Alarms",
      "Next": "EUW1Decision"
    },
    "EUW1Decision": {
      "Type": "Choice",
      "Choices": [
        {"Variable": "$.euw1Alarms.MetricAlarms[0]", "IsPresent": true, "Next": "RollbackEUW1"}
      ],
      "Default": "Success"
    },
    "RollbackEUW1": {
      "Type": "Task",
      "Resource": "arn:aws:states:::aws-sdk:codedeploy:stopDeployment",
      "Parameters": {
        "DeploymentId.$": "$.euw1Deploy.DeploymentId",
        "AutoRollbackEnabled": true
      },
      "Next": "RollbackUSE1"
    },
    "RollbackUSE1": {
      "Type": "Task",
      "Resource": "arn:aws:states:::aws-sdk:codedeploy:stopDeployment",
      "Parameters": {
        "DeploymentId.$": "$.use1Deploy.DeploymentId",
        "AutoRollbackEnabled": true
      },
      "Next": "FailureEnd"
    },
    "Success": {"Type": "Succeed"},
    "FailureEnd": {"Type": "Fail", "Error": "DeploymentFailed"}
  }
}
```

이 구조의 가치는 모든 분기·대기·롤백이 **한 JSON에 명시적으로 표현**된다는 점. Lambda로 같은 로직을 짜면 DynamoDB 상태 테이블 + Step 추적 + 에러 처리 + 롤백 순서 보장에 200줄 이상 필요하고 디버깅이 거의 불가능하다.

> 🎯 **시나리오**: "us-east-1 → eu-west-1 → ap-northeast-2 순서로 배포하되, 각 리전에서 30분 모니터링 후 알람 발동 시 그때까지 배포된 모든 리전을 역순으로 롤백." — 답은 위 구조 + AP 리전 추가. 핵심은 (1) Wait + Choice 패턴, (2) ResultPath로 각 리전의 deploymentId 누적, (3) Catch로 역순 롤백 트리거. 비슷한 시나리오가 매년 시험에 등장.

## CDK + Step Functions: 타입 안전한 워크플로

ASL JSON을 직접 작성하면 typo·문법 오류·참조 깨짐을 컴파일 타임에 못 잡는다. CDK는 이를 TypeScript 타입 시스템으로 해결.

```typescript
import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';

const checkAlarmFn = new lambda.Function(this, 'CheckAlarmFn', { /*...*/ });

const deployUSE1 = new tasks.CallAwsService(this, 'DeployUSE1', {
  service: 'codedeploy',
  action: 'createDeployment',
  parameters: {
    ApplicationName: 'MyApp',
    DeploymentGroupName: 'use1-prod',
    Revision: sfn.JsonPath.objectAt('$.revision'),
  },
  iamResources: ['*'],
  iamAction: 'codedeploy:CreateDeployment',
  resultPath: '$.use1Deploy',
});

const waitUSE1 = new sfn.Wait(this, 'WaitUSE1', {
  time: sfn.WaitTime.duration(cdk.Duration.minutes(30)),
});

const checkUSE1 = new tasks.LambdaInvoke(this, 'CheckUSE1Alarm', {
  lambdaFunction: checkAlarmFn,
  payload: sfn.TaskInput.fromObject({region: 'us-east-1'}),
  resultPath: '$.use1Alarms',
});

const rollbackUSE1 = new tasks.CallAwsService(this, 'RollbackUSE1', {
  service: 'codedeploy',
  action: 'stopDeployment',
  parameters: {
    DeploymentId: sfn.JsonPath.stringAt('$.use1Deploy.DeploymentId'),
    AutoRollbackEnabled: true,
  },
  iamResources: ['*'],
});

const decision = new sfn.Choice(this, 'USE1Decision')
  .when(sfn.Condition.isPresent('$.use1Alarms.Payload.alarm'), rollbackUSE1)
  .otherwise(new sfn.Succeed(this, 'Success'));

const chain = deployUSE1.next(waitUSE1).next(checkUSE1).next(decision);

new sfn.StateMachine(this, 'DeployMachine', {
  definitionBody: sfn.DefinitionBody.fromChainable(chain),
  stateMachineType: sfn.StateMachineType.STANDARD,
  tracingEnabled: true,
});
```

CDK가 IAM 권한을 자동 추적하고(`iamAction`/`iamResources`), ASL JSON을 합성한다. TypeScript의 타입 시스템이 잘못된 상태 참조, 빠진 next 등을 컴파일 타임에 잡아준다.

## Express + API Gateway: 동기 워크플로 패턴

```yaml
HttpApi:
  Type: AWS::Serverless::HttpApi

WorkflowStateMachine:
  Type: AWS::Serverless::StateMachine
  Properties:
    Type: EXPRESS
    Definition: { ... }

ApiToSfnRole:
  Type: AWS::IAM::Role
  Properties:
    AssumeRolePolicyDocument:
      Statement:
        - Effect: Allow
          Principal: {Service: apigateway.amazonaws.com}
          Action: sts:AssumeRole
    Policies:
      - PolicyName: invoke
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action: states:StartSyncExecution
              Resource: !Ref WorkflowStateMachine
```

API Gateway의 통합 타입을 `AWS_PROXY` 대신 **AWS service integration**으로 설정하고, target을 `arn:aws:apigateway:ap-northeast-2:states:action/StartSyncExecution`으로 지정하면 API → SF 동기 호출이 가능. 5분 안에 완료되는 워크플로를 REST API 백엔드로 사용.

> 🎯 **시나리오**: "결제 처리가 검증·인증·차지·기록 4단계로 구성되고, 각 단계는 별개 마이크로서비스. API는 동기 응답이 필요." — 답은 Express + StartSyncExecution. Lambda 함수 하나에 4 호출을 인라인으로 짜는 것보다 워크플로 시각화·재시도·에러 처리가 자동.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **Standard vs Express는 호출 빈도×실행 시간**의 곱으로 결정 — 긴 + 적음은 Standard, 짧은 + 많음은 Express. 둘째, **8가지 ASL 상태 타입**(Task/Choice/Parallel/Map/Wait/Pass/Succeed/Fail)의 조합으로 모든 워크플로 표현. 셋째, **AWS SDK Service Integration**으로 200+ 서비스를 Lambda 없이 직접 호출. 넷째, **TaskToken**(`.waitForTaskToken`)으로 외부 시스템·사람 개입을 capability-based로 통합. 다섯째, **Distributed Map**으로 1만 동시 자식 워크플로 + 부분 실패 허용 처리.

다음 글에서는 이번 주를 마무리하면서 SAM·CDK·Lambda·Step Functions를 종합 시나리오로 묶어본다. 실제 시험에서는 한 문제 안에 여러 서비스가 엮여 출제되므로, 각 서비스의 강점·약점·결합 패턴을 정확히 매칭하는 게 합격의 열쇠다.

---

## 📝 연습 문제

**문제 1.** Standard와 Express Workflow의 본질적 차이로 가장 정확한 것은?

A) Standard는 1년·exactly-once·상태 전이당 과금, Express는 5분·at-least-once·호출+실행시간 과금
B) 동일한 엔진, 가격만 다름
C) Express는 사람 승인이 가능
D) Standard는 동기 호출만 지원

**정답: A**
해설: 가격 모델의 차이가 결정적이다. 짧은 + 고빈도 워크로드(IoT, API 백엔드)는 Standard로는 비용 폭증, Express가 합리적. 긴 + 저빈도(배포, 사람 승인 포함)는 Express로는 5분 한도 위반, Standard가 적합. exactly-once vs at-least-once는 결제 같은 중복 금지 시나리오에서 결정적. C는 반대(Express는 TaskToken 미지원), D는 반대(Standard는 비동기만).

---

**문제 2.** Step Functions에서 외부 시스템(Slack 봇, 사람 승인)의 응답을 기다리는 표준 패턴은?

A) Wait 상태 + polling
B) `.waitForTaskToken` integration pattern + 외부에서 SendTaskSuccess/Failure 호출
C) Lambda 무한 polling
D) Choice 상태 반복

**정답: B**
해설: TaskToken은 capability-based security 패턴(Henry Levy 1984)의 구현체. SF가 token을 발급하고 워크플로를 일시 정지(비용 거의 0), 외부 시스템이 token으로 SendTaskSuccess(output) 또는 SendTaskFailure(error) 호출하면 즉시 재개. 1년까지 대기 가능, TimeoutSeconds로 자동 종료 가능. A는 비효율, C는 cost 폭증, D는 의미 다름. 시험에서 "사람 승인", "외부 시스템 응답"은 거의 항상 TaskToken.

---

**문제 3.** Lambda 호출만 하는 워크플로 노드가 많아 운영 복잡도가 큰 상황. 가장 효과적인 개선은?

A) Lambda를 모두 ECS Task로 변경
B) AWS SDK Service Integration(`arn:aws:states:::aws-sdk:<service>:<action>`)으로 200+ 서비스 직접 호출 — Lambda 제거
C) Standard를 Express로 변경
D) Step Functions를 EventBridge로 대체

**정답: B**
해설: 2021년 출시된 AWS SDK Service Integration은 Lambda 함수 하나만 만들어 SDK 한 줄 호출하는 패턴을 제거한다. CloudFormation·CodeDeploy·DynamoDB·S3·SNS 등 200개+ AWS 서비스를 ASL에서 직접 호출. 미디어 회사 사례처럼 12개 Lambda를 3개로 줄여 cold start 제거와 P99 latency 단축. IAM은 State Machine 실행 Role에 명시 필수. A는 더 복잡, C는 무관, D는 EventBridge가 단순 흐름만 처리.

---

**문제 4.** 5000만 S3 객체를 ETL 처리하면서 1% 실패 허용. 가장 적합한 패턴은?

A) Standard Map (40 동시 제한)
B) Distributed Map + ItemReader: S3 listObjectsV2 + ProcessorConfig: DISTRIBUTED/EXPRESS + ToleratedFailurePercentage: 1
C) EventBridge → 5000만 Lambda 호출
D) ECS Fargate 5000만 Task

**정답: B**
해설: Distributed Map(2022)이 정확한 답. ItemReader가 S3 객체를 자동 분할, ItemBatcher로 효율 묶음, child workflow가 Express로 짧고 저렴하게 동작, MaxConcurrency 10000까지, ToleratedFailurePercentage로 부분 실패 허용. 광고 회사 사례처럼 Spark 클러스터를 대체 가능. A는 동시 한도 40으로 5000만 불가능, C는 throttle·비용 폭증, D는 운영 부담·시작 latency 큼.

---

**문제 5.** ASL Retry의 백오프 계산식은?

A) 항상 일정 간격
B) `interval × backoffRate^(attempt-1)` + optional jitter; MaxAttempts 초과 시 Catch로 이동
C) 무한 재시도
D) Lambda DLQ로 자동 이동

**정답: B**
해설: 지수 백오프 + jitter는 thundering herd 방지의 표준(AWS Architecture Blog 2015). 예: `IntervalSeconds: 2, BackoffRate: 2.0, MaxAttempts: 6`이면 2→4→8→16→32→64초. `JitterStrategy: FULL`(2023+)을 켜면 각 간격에 무작위 분산 추가. 모든 Retry 정책 실패 시 Catch 블록이 받아 분기 처리. A는 단순 잘못, C는 한도 항상 존재, D는 SQS DLQ는 별도 메커니즘.

---

**문제 6.** "프로덕션 배포 시 보안팀 → DevOps 팀 → 자동 배포 3단계 승인, 각 단계 7일 timeout, Slack 통보." 적합한 워크플로 설계는?

A) CodePipeline ManualApprovalAction 3개
B) Standard Workflow + `.waitForTaskToken` 3회 + SNS→Slack 통보 + TimeoutSeconds: 604800
C) Express Workflow
D) EventBridge Schedule

**정답: B**
해설: Standard만 TaskToken 지원, Express는 미지원. 7일 timeout은 Standard의 강점(Express 5분 한도 위반). Slack interactive message → Lambda → SendTaskSuccess(token, output)로 승인. CodePipeline ManualApprovalAction(A)도 사람 승인 가능하지만 (1) Slack 통보·인증 흐름이 복잡, (2) 7일 대기 비용·UX 부적합, (3) 분기·롤백 표현이 SF보다 약함. SF가 더 유연한 통보·승인 워크플로 표현.

---

**문제 7.** API Gateway 백엔드로 평균 300ms 동기 응답이 필요한 다단계 비즈니스 로직. 적합한 패턴은?

A) Standard Workflow + StartExecution
B) Express Workflow + StartSyncExecution + API Gateway AWS service integration
C) Lambda 하나에 모든 로직 인라인
D) Step Functions 부적합

**정답: B**
해설: Express + StartSyncExecution(2019)이 동기 워크플로 패턴의 표준. 5분 안에 끝나는 다단계 로직(검증→인증→처리→기록)을 워크플로로 표현하면 시각화·재시도·에러 처리가 자동. Standard는 비동기 only로 API 백엔드 부적합(A). Lambda 인라인(C)은 단순한 경우 OK지만 다단계·재시도·시각화 부족. D는 sf가 적합하지 않다는 답인데 정확히 sf가 이 시나리오의 답.

---

**문제 8.** 멀티 리전 배포(USE1 → EUW1 → APN2)에서 EUW1 단계 알람 발동 시 그때까지 배포된 리전 역순 롤백. ASL 표현은?

A) Retry 블록 사용
B) 각 리전 ResultPath로 deploymentId 누적 + Choice로 알람 체크 + 실패 시 RollbackEUW1 → RollbackUSE1 순서로 chain
C) Parallel 사용
D) Map 사용

**정답: B**
해설: 멀티 리전 순차 + 역순 롤백은 Step Functions의 전형적 패턴. 각 DeployTask의 `ResultPath: $.use1Deploy` 식으로 deploymentId를 누적하고, Choice에서 알람 발동 시 Rollback 체인으로 분기. Rollback은 역순 chain(`Next: RollbackUSE1`). Parallel(C)은 동시 실행이라 순차 보장 안 됨, Map(D)은 같은 작업 반복용으로 부적합, Retry(A)는 단일 작업 재시도. 시험에서 가장 자주 나오는 SF 패턴 중 하나.

---

## 📌 오늘의 요약

오늘 다룬 Step Functions의 핵심은 (1) Standard vs Express는 호출 빈도×실행 시간으로 결정되며 가격 모델이 본질적으로 다름, (2) 8가지 ASL 상태 타입의 조합으로 모든 워크플로 표현 + Saga 보상 트랜잭션도 Parallel+Catch+Compensate로 구현, (3) AWS SDK Service Integration으로 200+ 서비스 Lambda 없이 직접 호출, (4) TaskToken은 capability-based 외부 콜백 패턴으로 사람 승인·외부 시스템 통합의 표준, (5) Distributed Map으로 1만 동시 자식 워크플로 + 부분 실패 허용 + S3 ResultWriter로 대용량 ETL — 다섯 가지다.
