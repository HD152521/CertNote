# Day 3 - Action Providers: Lambda, Step Functions, Manual Approval이 파이프라인을 확장하는 방식

CodePipeline의 Source/Build/Test/Deploy 4종만으로 커버할 수 없는 상황이 있다. 배포 전에 외부 API를 호출해서 승인 토큰을 받아야 한다거나, 멀티 리전 배포를 순차적으로 진행하면서 각 리전에서 스모크 테스트를 통과해야 다음으로 이동해야 한다거나, 운영팀이 Slack에서 버튼을 눌러야만 프로덕션 배포가 진행되어야 한다거나. 이 확장 지점을 담당하는 것이 Invoke 카테고리(Lambda, Step Functions)와 Approval 카테고리(Manual Approval)다.

이 세 가지 Action Provider는 DOP-C02에서 자주 조합 문제로 나온다. "15분이 초과하는 작업", "복잡한 조건 분기", "Slack 승인" 같은 키워드가 나오면 세 Provider 중 어느 것을 쓸지 즉각 판단할 수 있어야 한다. 그 판단 기준을 오늘 잡는다.

> 💡 **관련 이론**: CodePipeline의 Action Provider 확장 모델은 "Open/Closed Principle"의 서비스 레벨 구현이다. 파이프라인 자체는 수정하지 않고(Closed), 새로운 Provider를 추가함으로써 기능을 확장(Open)한다. Lambda Invoke는 이 확장의 가장 강력한 형태—임의 코드를 실행할 수 있는 탈출구(escape hatch)다. 이 설계가 CodePipeline이 수십 가지 서드파티 도구와 통합 가능한 이유이며, AWS가 모든 외부 시스템에 대한 공식 Provider를 만들 필요 없이 Lambda를 통해 "무한 확장"을 허용하는 방식이다.

## Lambda Invoke Action: "임의의 코드를 파이프라인에 넣기"

Lambda Invoke Action은 CodePipeline 내에서 임의의 Python/Node.js/Java 코드를 실행하는 탈출구다. 공식 Provider가 없는 외부 시스템 연동(Jira 티켓 생성, Datadog 배포 태그, Slack 직접 알림, 사내 승인 시스템 API 호출)에 사용된다.

Lambda가 받는 이벤트 구조:

```json
{
  "CodePipeline.job": {
    "id": "11111111-abcd-1111-abcd-111111abcdef",
    "accountId": "123456789012",
    "data": {
      "actionConfiguration": {
        "configuration": {
          "FunctionName": "SmokeTestFn",
          "UserParameters": "{\"env\":\"staging\",\"healthPath\":\"/health\"}"
        }
      },
      "inputArtifacts": [
        {
          "name": "BuildArtifact",
          "location": {
            "s3Location": {
              "bucketName": "tooling-artifacts",
              "objectKey": "checkout-pipeline/Build/BuildArtifact/abc123.zip"
            }
          }
        }
      ],
      "outputArtifacts": [],
      "pipelineContext": {
        "pipelineArn": "arn:aws:codepipeline:ap-northeast-2:111:checkout-pipeline",
        "pipelineExecutionId": "exec-id-123"
      }
    }
  }
}
```

**Lambda 함수가 반드시 해야 하는 것**: 성공 또는 실패 결과를 CodePipeline에 보고해야 한다. 보고하지 않으면 파이프라인은 기본 24시간 동안 응답을 기다리다가 타임아웃으로 실패한다.

```python
import boto3
import json
import urllib.request

codepipeline = boto3.client('codepipeline')

def handler(event, context):
    job_id = event['CodePipeline.job']['id']
    
    try:
        # UserParameters 파싱
        params = json.loads(
            event['CodePipeline.job']['data']['actionConfiguration']
            ['configuration'].get('UserParameters', '{}')
        )
        env = params.get('env', 'staging')
        health_path = params.get('healthPath', '/health')
        
        # 스모크 테스트 실행
        url = f"https://{env}.example.com{health_path}"
        with urllib.request.urlopen(url, timeout=10) as response:
            if response.status != 200:
                raise ValueError(f"Health check failed: {response.status}")
        
        # 성공 보고 + 출력 변수 (V2 파이프라인에서 다음 Stage가 참조 가능)
        codepipeline.put_job_success_result(
            jobId=job_id,
            outputVariables={
                'SMOKE_STATUS': 'PASSED',
                'HEALTH_URL': url
            }
        )
        
    except Exception as e:
        # 실패 보고
        codepipeline.put_job_failure_result(
            jobId=job_id,
            failureDetails={
                'type': 'JobFailed',
                'message': str(e)[:1000],
                'externalExecutionId': context.aws_request_id
            }
        )
```

> ⚠️ **함정**: Lambda 함수가 정상적으로 실행을 마쳐도 `put_job_success_result`를 호출하지 않으면 파이프라인이 계속 "In Progress" 상태로 남는다. Lambda 자체의 실행 결과(성공/실패)와 CodePipeline에 대한 보고는 완전히 별개다. 또한 Lambda 함수 자체의 타임아웃(최대 15분)이 CodePipeline Action의 타임아웃보다 먼저 발생할 수 있다—함수가 타임아웃으로 죽으면 `put_job_failure_result`도 호출되지 않아 파이프라인이 멈춘다. 이 "이중 타임아웃 함정"은 긴 작업에 Lambda를 사용할 때 가장 자주 발생하는 문제다. 비동기 패턴을 사용하거나 Step Functions으로 전환해야 한다.

**비동기 Lambda 패턴**: 즉시 성공을 보고하고 실제 작업은 다른 비동기 시스템에서 처리하는 방식.

```python
def handler(event, context):
    job_id = event['CodePipeline.job']['id']
    
    # 외부 비동기 작업 시작 (SQS 메시지, ECS Task 등)
    sqs = boto3.client('sqs')
    sqs.send_message(
        QueueUrl='https://sqs.ap-northeast-2.amazonaws.com/111/deploy-queue',
        MessageBody=json.dumps({
            'job_id': job_id,
            'pipeline_execution_id': event['CodePipeline.job']['data']
                ['pipelineContext']['pipelineExecutionId']
        })
    )
    
    # 즉시 "계속 진행" 신호
    # 실제 작업 완료는 외부 시스템이 put_job_success_result 호출
    codepipeline.put_job_success_result(
        jobId=job_id,
        outputVariables={'ASYNC_JOB_DISPATCHED': 'true'}
    )
```

> 💡 **관련 이론**: 비동기 Lambda 패턴은 "Fire and Forget"과 "Callback" 두 가지 변형이 있다. 위 예시는 파이프라인 관점에서 "Fire and Forget"—즉시 성공을 선언하고 비동기 작업의 결과를 파이프라인에 반영하지 않는다. 만약 비동기 작업의 결과로 파이프라인을 계속/중단해야 한다면 Step Functions의 WaitForTaskToken 패턴을 사용해야 한다. 두 패턴의 선택 기준은 "비동기 작업의 실패가 파이프라인을 중단시켜야 하는가"다. 알림(Slack 메시지 발송) 같이 실패해도 배포를 계속해야 하면 Fire and Forget, 외부 승인이나 검증 같이 실패하면 배포를 중단해야 하면 WaitForTaskToken을 쓴다.

## Step Functions Action: 15분 벽을 넘는 방법

Lambda의 15분 제한을 넘어서는 작업, 또는 if/else 분기, 병렬 실행, 재시도, 대기 같은 복잡한 워크플로가 필요할 때 Step Functions Action을 쓴다.

```json
{
  "name": "MultiRegionDeploy",
  "actionTypeId": {
    "category": "Invoke",
    "owner": "AWS",
    "provider": "StepFunctions",
    "version": "1"
  },
  "configuration": {
    "StateMachineArn": "arn:aws:states:ap-northeast-2:111:stateMachine:MultiRegionDeploy",
    "Input": "{\"imageTag\": \"#{BuildVariables.IMAGE_TAG}\", \"commitId\": \"#{SourceVariables.CommitId}\"}",
    "ExecutionNamePrefix": "pipeline-deploy-"
  }
}
```

멀티 리전 배포 State Machine 예시:

```json
{
  "Comment": "Deploy to multiple regions with canary validation",
  "StartAt": "DeployKorea",
  "States": {
    "DeployKorea": {
      "Type": "Task",
      "Resource": "arn:aws:states:::ecs:runTask.sync",
      "Parameters": {
        "Cluster": "prod-ap-northeast-2",
        "TaskDefinition": "checkout-deploy",
        "LaunchType": "FARGATE"
      },
      "Next": "WaitForKoreaStabilization"
    },
    "WaitForKoreaStabilization": {
      "Type": "Wait",
      "Seconds": 300,
      "Next": "CheckKoreaAlarms"
    },
    "CheckKoreaAlarms": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:ap-northeast-2:111:function:CheckAlarms",
      "Next": "KoreaOK?"
    },
    "KoreaOK?": {
      "Type": "Choice",
      "Choices": [{
        "Variable": "$.alarmState",
        "StringEquals": "OK",
        "Next": "DeployUSandEUParallel"
      }],
      "Default": "RollbackKorea"
    },
    "DeployUSandEUParallel": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "DeployUS",
          "States": {
            "DeployUS": {
              "Type": "Task",
              "Resource": "arn:aws:states:::ecs:runTask.sync",
              "Parameters": {
                "Cluster": "prod-us-east-1",
                "TaskDefinition": "checkout-deploy"
              },
              "End": true
            }
          }
        },
        {
          "StartAt": "DeployEU",
          "States": {
            "DeployEU": {
              "Type": "Task",
              "Resource": "arn:aws:states:::ecs:runTask.sync",
              "Parameters": {
                "Cluster": "prod-eu-west-1",
                "TaskDefinition": "checkout-deploy"
              },
              "End": true
            }
          }
        }
      ],
      "Next": "DeployComplete"
    },
    "RollbackKorea": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:ap-northeast-2:111:function:RollbackDeploy",
      "Next": "DeployFailed"
    },
    "DeployComplete": {
      "Type": "Succeed"
    },
    "DeployFailed": {
      "Type": "Fail",
      "Error": "DeploymentFailed",
      "Cause": "Korea deployment validation failed"
    }
  }
}
```

> 💡 **관련 이론**: 이 State Machine은 **Saga 패턴**의 구현이다. Saga는 1987년 Hector Garcia-Molina와 Kenneth Salem의 논문에서 유래한 분산 트랜잭션 패턴이다. 단일 ACID 트랜잭션이 불가능한 분산 환경에서, 각 단계가 성공하면 다음 단계로 진행하고, 실패하면 이미 완료된 단계의 보상 트랜잭션(compensating transaction)을 실행한다. 여기서 RollbackKorea가 보상 트랜잭션이다. Saga는 두 변형이 있다: Choreography(각 서비스가 이벤트를 발행/구독해 조율)와 Orchestration(중앙 조율자가 순서 제어). Step Functions의 Saga 구현은 Orchestration 방식이다—State Machine이 중앙 조율자 역할을 한다. 멀티 리전 배포에서 한 리전이 실패했을 때 이미 배포된 다른 리전을 되돌리는 로직이 Saga의 교과서적 구현이다.

**Step Functions WaitForTaskToken 패턴**: 파이프라인을 외부 승인 시스템과 연결하는 고급 패턴.

```json
{
  "WaitForExternalApproval": {
    "Type": "Task",
    "Resource": "arn:aws:states:::sqs:sendMessage.waitForTaskToken",
    "Parameters": {
      "QueueUrl": "https://sqs.ap-northeast-2.amazonaws.com/111/approval-queue",
      "MessageBody": {
        "taskToken.$": "$$.Task.Token",
        "deploymentId.$": "$.deploymentId",
        "approvalRequired": true
      }
    },
    "TimeoutSeconds": 86400,
    "HeartbeatSeconds": 3600
  }
}
```

외부 승인 시스템이 `SendTaskSuccess`를 호출하면 State Machine이 다음 단계로 진행한다. Slack 봇, 사내 IT 포털, ServiceNow 등 어떤 시스템도 이 콜백 메커니즘으로 파이프라인에 연결될 수 있다.

> 🔍 **더 깊이**: Step Functions의 Task Token은 고유하게 생성된 불투명한 문자열이다. 이 토큰은 State Machine 실행 컨텍스트를 식별하는 데 사용되며, `$$.Task.Token`으로 현재 Task의 토큰에 접근한다. WaitForTaskToken 패턴의 핵심은 **토큰의 전달 경로**다—State Machine이 토큰을 SQS 메시지에 넣어 외부 시스템으로 전달하고, 외부 시스템이 나중에 이 토큰으로 `SendTaskSuccess`를 호출한다. 토큰의 TTL은 `TimeoutSeconds`로 제어되며, `HeartbeatSeconds`로 외부 시스템이 "아직 처리 중"임을 알리는 heartbeat 주기를 설정할 수 있다. Heartbeat가 이 간격 안에 도달하지 않으면 States.HeartbeatTimeout 오류로 Task가 실패한다. 장시간 대기 중 외부 시스템 장애를 감지하는 메커니즘이다.

> 📚 **사례**: Airbnb의 Deployments as a Service. Airbnb는 수백 개의 마이크로서비스 배포를 중앙 배포 플랫폼으로 통합했는데, 핵심 메커니즘이 Step Functions WaitForTaskToken이었다. 각 서비스 팀이 Slack에서 "approve" 명령을 내리면 Slack 봇이 Step Functions에 SendTaskSuccess를 호출해 배포가 계속 진행됐다. 이전에는 Jenkins Job + 이메일 승인 조합으로 평균 2시간 걸리던 배포 승인 프로세스가 평균 15분으로 단축됐다. 더 중요한 것은 "배포가 Slack에서 보인다"는 가시성이었다—이전에는 Jenkins 콘솔에 들어가야 상태를 알 수 있었지만, Slack 통합 이후 팀 전체가 실시간으로 배포 상태를 볼 수 있게 됐다.

## Manual Approval Action: 사람이 게이트가 되는 방식

Manual Approval은 파이프라인의 흐름을 사람의 명시적 판단으로 제어한다. 자동화가 판단하기 어려운 "비즈니스 결정"(예: 큰 마케팅 캠페인 직전 배포 취소, 규제 요구사항으로 인한 변경 검토)을 파이프라인에 통합하는 방법이다.

```json
{
  "name": "ApproveProd",
  "actionTypeId": {
    "category": "Approval",
    "owner": "AWS",
    "provider": "Manual",
    "version": "1"
  },
  "configuration": {
    "NotificationArn": "arn:aws:sns:ap-northeast-2:111:DeployApprovals",
    "CustomData": "Approve deployment of v#{BuildVariables.VERSION} (commit: #{SourceVariables.CommitId}) to prod. Change log: #{BuildVariables.CHANGELOG_URL}",
    "ExternalEntityLink": "https://github.com/my-org/checkout/releases/tag/v#{BuildVariables.VERSION}"
  },
  "timeoutInMinutes": 1440
}
```

`timeoutInMinutes: 1440`은 24시간이다. 기본값은 7일(10,080분). 비즈니스 요구에 맞게 조정한다.

**SNS → Chatbot → Slack 연결 패턴**:

```
Manual Approval Action
    ↓ SNS 알림 발행
SNS Topic (DeployApprovals)
    ├── 이메일 구독 (배포 담당자 10명)
    └── AWS Chatbot 구독
           ↓
    Slack 채널 (#deploy-approvals)
           ↓ "/aws codepipeline approve checkout-pipeline ApproveProd ..."
    Chatbot이 승인 API 호출
           ↓
    CodePipeline이 다음 Stage로 진행
```

Slack에서 직접 승인하려면 Chatbot에 `codepipeline:PutApprovalResult` 권한을 부여해야 한다:

```json
{
  "Effect": "Allow",
  "Action": "codepipeline:PutApprovalResult",
  "Resource": "arn:aws:codepipeline:ap-northeast-2:111:checkout-pipeline"
}
```

> 🔍 **더 깊이**: Slack 승인 통합의 보안 고려사항. AWS Chatbot은 Slack 사용자의 IAM을 직접 매핑하지 않는다—Chatbot의 IAM Role이 SNS/CodePipeline 권한을 갖고 있고, Slack 채널에 접근 권한이 있는 모든 사람이 이 Role로 작동한다. 더 세밀한 제어가 필요하면 (예: "시니어 엔지니어만 승인 가능") Slack 봇을 직접 구현해 Slack 사용자 ID를 AWS IAM Identity Center와 매핑하는 로직을 넣어야 한다. Chatbot 기본 설정은 "채널 멤버 전체 = 동일 권한"이지만, Chatbot 설정에서 `channelGuardrailPolicies`로 채널 수준의 권한 상한을 설정할 수 있다. 단순 알림 용도 vs 세밀한 승인 제어의 trade-off를 시험 시나리오에서 판단할 수 있어야 한다.

> ⚠️ **함정**: Manual Approval의 `timeoutInMinutes` 기본값 혼동. 문서에는 기본값이 없다고 명시되어 있지만 실제로는 7일(10,080분) 타임아웃이 적용된다. 긴급 배포가 필요한 상황에서 담당자가 자리를 비워 7일 후 타임아웃이 되면 파이프라인 전체가 실패 상태가 된다. 결제/금융 서비스는 24시간(1,440분) 이하로 설정하고 에스컬레이션 정책(1시간 후 팀장에게 알림 등)을 SNS → Lambda → 이메일/SMS로 구현하는 것이 표준이다. 또한 Manual Approval은 승인자가 AWS 콘솔이나 CLI에 접근해야 하므로, 콘솔 접근이 없는 Spoke 계정 사용자를 승인자로 지정하면 안 된다.

## CodeStar Notifications: 파이프라인 이벤트를 팀에 전달하기

파이프라인 실패를 빠르게 알아야 한다. CodeStar Notifications는 CodePipeline, CodeBuild, CodeDeploy 이벤트를 여러 대상으로 라우팅하는 통합 알림 서비스다.

```bash
aws codestar-notifications create-notification-rule \
  --name checkout-pipeline-alerts \
  --resource "arn:aws:codepipeline:ap-northeast-2:111:checkout-pipeline" \
  --event-type-ids \
    "codepipeline-pipeline-pipeline-execution-failed" \
    "codepipeline-pipeline-pipeline-execution-succeeded" \
    "codepipeline-pipeline-stage-execution-failed" \
    "codepipeline-pipeline-action-execution-failed" \
  --targets \
    "TargetType=AWSChatbotSlack,TargetAddress=arn:aws:chatbot::111:chat-configuration/slack-channel/deploy-alerts"
```

지원 이벤트 타입 (주요):
- `codepipeline-pipeline-pipeline-execution-started`
- `codepipeline-pipeline-pipeline-execution-succeeded`
- `codepipeline-pipeline-pipeline-execution-failed`
- `codepipeline-pipeline-stage-execution-started`
- `codepipeline-pipeline-stage-execution-failed`
- `codepipeline-pipeline-action-execution-failed`
- `codepipeline-pipeline-manual-approval-needed`
- `codepipeline-pipeline-manual-approval-succeeded`

> 💡 **관련 이론**: CodeStar Notifications와 EventBridge는 모두 CodePipeline 이벤트를 외부로 내보낼 수 있지만 설계 목적이 다르다. CodeStar Notifications는 **알림(Notification)** 특화 서비스로, SNS와 AWS Chatbot만 대상으로 지원하며 "사람에게 알림"에 최적화되어 있다. EventBridge는 **이벤트 라우팅(Event Routing)** 범용 서비스로, Lambda, SQS, ECS, Step Functions, HTTP Endpoint 등 모든 AWS 서비스와 외부 시스템을 대상으로 지원한다. "Slack 알림 → CodeStar Notifications, 외부 시스템 자동 연동 → EventBridge"가 선택 기준이다. 두 서비스가 내부적으로 EventBridge 이벤트를 공유하지만 CodeStar Notifications는 Developer Tools 이벤트에 특화된 래퍼다.

## EventBridge 직접 연결: 외부 시스템 통합

CodeStar Notifications가 Slack/SNS로의 알림에 특화되어 있다면, EventBridge는 모든 시스템으로의 연결을 위한 범용 라우터다.

```json
{
  "source": ["aws.codepipeline"],
  "detail-type": ["CodePipeline Pipeline Execution State Change"],
  "detail": {
    "state": ["FAILED"],
    "pipeline": ["checkout-pipeline", "inventory-pipeline"]
  }
}
```

대상별 패턴:
- **PagerDuty**: EventBridge → Lambda → PagerDuty Events API
- **Jira**: EventBridge → Lambda → Jira REST API (이슈 자동 생성)
- **Datadog**: EventBridge → Lambda → Datadog Events API (배포 마커)
- **ServiceNow**: EventBridge → Lambda → ServiceNow REST API (변경 요청 자동 닫기)

```python
# EventBridge → Lambda → PagerDuty 예시
import json
import urllib.request

PAGERDUTY_ROUTING_KEY = "your-integration-key"

def handler(event, context):
    pipeline = event['detail']['pipeline']
    state = event['detail']['state']
    execution_id = event['detail']['execution-id']
    
    if state == 'FAILED':
        payload = {
            "routing_key": PAGERDUTY_ROUTING_KEY,
            "event_action": "trigger",
            "dedup_key": execution_id,   # 멱등성: 동일 실행 중복 경보 방지
            "payload": {
                "summary": f"Pipeline {pipeline} FAILED (execution: {execution_id})",
                "severity": "critical",
                "source": "CodePipeline",
                "custom_details": {
                    "pipeline": pipeline,
                    "execution_id": execution_id,
                    "region": event['region'],
                    "console_link": f"https://ap-northeast-2.console.aws.amazon.com/codesuite/codepipeline/pipelines/{pipeline}/executions/{execution_id}"
                }
            }
        }
        
        req = urllib.request.Request(
            "https://events.pagerduty.com/v2/enqueue",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        urllib.request.urlopen(req)
```

> 💡 **관련 이론**: `dedup_key`를 `execution_id`로 설정하는 이유는 EventBridge의 "at-least-once delivery" 보장 때문이다. EventBridge는 이벤트를 최소 한 번 전달하는데, 재시도 과정에서 같은 이벤트가 두 번 Lambda로 전달될 수 있다. PagerDuty에 두 번 호출이 가면 두 개의 경보가 생성된다. `dedup_key`(PagerDuty의 멱등성 키)를 설정하면 동일 실행 ID의 두 번째 호출이 경보를 새로 만들지 않고 기존 경보를 업데이트한다. 이는 분산 시스템의 **멱등성(Idempotency)** 원칙—같은 요청을 여러 번 보내도 결과가 동일해야 한다—을 API 레벨에서 구현하는 패턴이다.

## Custom Action Provider: 외부 CI 시스템 통합

커스텀 Action Provider는 CodePipeline이 직접 지원하지 않는 외부 시스템(사내 CI, 레거시 배포 도구, 특수 테스트 플랫폼)을 파이프라인에 통합하는 방법이다. Lambda Invoke Action으로 대부분 커버되지만, 작업이 오래 걸리거나 외부 에이전트가 필요한 경우에는 Custom Provider가 필요하다.

```bash
# Custom Action Provider 등록
aws codepipeline create-custom-action-type \
  --category Build \
  --provider MyInternalCI \
  --version 1 \
  --input-artifact-details MinimumCount=1,MaximumCount=1 \
  --output-artifact-details MinimumCount=0,MaximumCount=1 \
  --configuration-properties '[
    {"name":"ProjectName","required":true,"key":true,"secret":false,"queryable":false,"description":"Internal CI project name","type":"String"},
    {"name":"BuildTimeout","required":false,"key":false,"secret":false,"queryable":false,"description":"Build timeout in minutes","type":"Number"}
  ]'

# Worker가 주기적으로 Poll (Long-Polling 방식)
aws codepipeline poll-for-jobs \
  --action-type-id category=Build,owner=Custom,provider=MyInternalCI,version=1 \
  --max-batch-size 5

# 작업 완료 후 보고
aws codepipeline put-job-success-result --job-id <job-id>
```

Custom Action Provider의 핵심은 **Poll 기반 아키텍처**다. Push 방식(CodePipeline이 외부 시스템을 호출)이 아니라, 외부 에이전트가 주기적으로 CodePipeline에 작업이 있는지 확인하는 방식이다. 내부망의 시스템처럼 인터넷에서 직접 접근할 수 없는 대상에 특히 유용하다.

> 🎯 **시나리오**: 한 제조업 회사가 SAP에서 ERP 배포를 승인받아야만 AWS Lambda 코드를 배포할 수 있는 규정이 있다. SAP에 직접 접근하는 API가 있지만 외부에서 접근이 불가하고, 회사 내부 에이전트만 SAP API를 호출할 수 있다. 이 경우 Custom Action Provider를 사용해 사내 에이전트가 `poll-for-jobs`로 작업을 가져가고, SAP API를 호출해 승인 여부를 확인한 뒤 `put-job-success/failure-result`를 보고하는 패턴이 적절하다. Lambda로는 불가능한 이유는 Lambda가 인터넷을 통해 SAP에 접근해야 하지만 SAP가 내부망에만 있기 때문이다. VPC Lambda를 사용하는 방법도 있지만, 에이전트 머신이 이미 SAP에 접근 가능한 경우 Custom Provider가 더 단순하다.

## Lambda vs Step Functions 선택 기준

| 기준 | Lambda Invoke | Step Functions Invoke |
|------|--------------|----------------------|
| **작업 시간** | 15분 이하 | 이론상 1년(365일) |
| **복잡도** | 단순 선형 로직 | 분기(Choice), 병렬(Parallel), 재시도(Retry), 대기(Wait) |
| **상태 관리** | Lambda 내부에서 직접 | State Machine이 상태 관리 |
| **가시성** | CloudWatch Logs | Step Functions Console (시각적 실행 그래프) |
| **비용** | Lambda 실행 시간 × GB | 상태 전이 횟수 |
| **Saga 패턴** | 직접 구현 필요 | 네이티브 지원(Catch + Compensating Task) |
| **인간 개입** | 어색 (별도 메커니즘 필요) | waitForTaskToken으로 자연스럽게 |
| **외부 서비스 통합** | boto3 직접 호출 | Optimized Integrations(ECS, SQS 등 직접 통합) |

선택 규칙: **15분 이하 + 단순 로직 → Lambda. 그 외 → Step Functions.**

> 📚 **사례**: Lyft의 배포 플랫폼 아키텍처. Lyft는 수백 개의 마이크로서비스를 하루에 수백 번 배포하면서 "자동화 + 사람 판단의 조화"를 핵심 원칙으로 삼았다. Lambda로 자동 스모크 테스트를 실행하고, Step Functions로 카나리 트래픽을 점진적으로 올리며, Manual Approval은 "10% 이상 에러율 상승" 같은 자동 감지가 불가한 비즈니스 이벤트에만 제한적으로 사용했다. "사람이 게이트가 되는 것은 자동화가 판단할 수 없을 때만"이라는 원칙이 DOP-C02 시험 시나리오의 답 선택 기준과 정확히 일치한다. Lyft의 배포 속도는 이 자동화 덕분에 40% 향상됐고, 배포 관련 장애는 60% 감소했다.

## 전체 흐름: 복잡한 파이프라인 예시

```
Source (GitHub)
    ↓
Build (CodeBuild — 이미지 빌드, IMAGE_TAG 출력)
    ↓
Test (CodeBuild — 유닛 + 통합 테스트)
    ↓
Lambda Invoke (스모크 테스트 — staging 환경 /health 확인)
    ↓ #{LambdaSmoke.SMOKE_STATUS} == PASSED 확인
Step Functions Invoke (멀티 리전 순차 배포)
    ├── ap-northeast-2 배포 + 5분 대기 + 알람 확인
    ├── us-east-1 배포 + 5분 대기 + 알람 확인 (병렬)
    └── eu-west-1 배포 + 5분 대기 + 알람 확인 (병렬)
    ↓
Manual Approval (SNS → Chatbot → Slack — 최종 확인)
    ↓
Deploy (CodeDeploy — traffic cut-over 완료)
    ↓
EventBridge → Lambda → Datadog (배포 마커 기록)
```

> 🎯 **시나리오**: 한 전자상거래 회사가 블랙프라이데이 직전 배포 프리즈(freeze) 기간을 파이프라인에서 자동 적용해야 한다. 11월 25-27일 사이에는 Manual Approval이 있어도 누군가 "실수로" 승인하면 배포가 실행된다. 더 강력한 방법이 필요하다. 해결책: EventBridge Scheduler로 11월 25일 0시에 파이프라인 비활성화(`disable-stage-transition` API)를 자동 실행하고, 11월 28일 0시에 다시 활성화(`enable-stage-transition`)를 자동 실행한다. Lambda 함수에서 이 API를 호출하도록 스케줄을 설정하면 사람의 실수 없이 배포 프리즈가 자동 적용된다. Manual Approval은 "사람의 판단이 필요한 상황"에만, 정책 강제는 자동화로.

## 정리하며

Lambda Invoke Action은 임의 코드를 파이프라인에 통합하는 탈출구다. 단, `put_job_success/failure_result` 호출이 필수이고 15분 한도가 있다. Step Functions Invoke Action은 이 한도를 넘어서는 복잡한 워크플로, Saga 패턴, 외부 이벤트 대기(WaitForTaskToken)에 사용된다. Manual Approval은 자동화가 판단할 수 없는 비즈니스 결정을 파이프라인에 통합하며, SNS → Chatbot → Slack 체인으로 Slack 직접 승인이 가능하다. EventBridge는 파이프라인 이벤트를 외부 시스템(PagerDuty, Jira, Datadog)에 연결하는 범용 라우터다.

Custom Action Provider는 내부망 시스템처럼 외부 접근이 불가한 대상을 Poll 기반으로 통합하는 방법이다. 세 Provider의 선택 기준: Lambda(15분 이하 + 단순) → Step Functions(복잡/장기 + 자동 로직) → Manual Approval(자동화 판단 불가 + 사람 결정).

---

## 📝 연습 문제

**문제 1.** Lambda Invoke Action에서 Lambda 함수가 정상 완료됐는데 파이프라인이 "In Progress" 상태로 멈춰 있다. 가장 가능성 높은 원인은?

A) Lambda 함수의 실행 시간이 너무 길다  
B) Lambda 함수가 codepipeline.put_job_success_result()를 호출하지 않았다  
C) Lambda 함수에 IAM 권한이 부족하다  
D) Pipeline Execution Mode가 QUEUED이다  

**정답: B**  
해설: CodePipeline은 Lambda 함수의 실행 결과(return value, exception)를 직접 받지 않는다. 파이프라인 Job의 성공/실패는 오직 `put_job_success_result` 또는 `put_job_failure_result` API 호출로만 보고된다. 함수가 정상 완료해도 이 호출이 없으면 파이프라인은 응답을 기다리다 기본 24시간(또는 설정된 timeout) 후 실패한다.

---

**문제 2.** 멀티 리전 배포 워크플로에서 한 리전이 실패하면 이미 배포된 다른 리전을 롤백해야 한다. 가장 적절한 구현은?

A) Lambda Invoke Action에서 직접 롤백 로직 구현  
B) Step Functions Action의 Saga 패턴 — Parallel State 안에서 실패 시 보상 트랜잭션(rollback task) 실행  
C) Manual Approval Action으로 사람이 롤백 결정  
D) CodeDeploy의 자동 롤백  

**정답: B**  
해설: 멀티 리전 배포 + 부분 실패 시 롤백은 Saga 패턴의 교과서적 사례다. Step Functions의 Parallel State + Catch 조합으로 각 리전 배포를 병렬로 진행하면서, 특정 리전이 실패하면 이미 성공한 리전에 보상 롤백을 실행할 수 있다. Lambda(A)로도 구현할 수 있지만 15분 한도와 상태 관리 복잡성이 문제다. CodeDeploy(D)는 해당 서비스 내 롤백만 담당하고 멀티 리전 조율이 불가하다.

---

**문제 3.** Slack 채널에서 팀원이 직접 prod 배포를 승인하도록 하려면 어떤 구성이 필요한가?

A) Manual Approval Action → SNS Topic → AWS Chatbot → Slack 채널. Chatbot에 codepipeline:PutApprovalResult 권한 부여  
B) Lambda Invoke Action에서 Slack API 직접 호출  
C) EventBridge Rule로 Slack Webhook 연결  
D) Step Functions waitForTaskToken으로 Slack 봇 연결  

**정답: A**  
해설: Manual Approval Action이 SNS에 알림을 발행하고, Chatbot이 이를 Slack 채널에 표시한다. Slack에서 `/aws codepipeline approve` 명령을 실행하면 Chatbot이 CodePipeline API를 호출해 승인을 처리한다. 이를 위해 Chatbot IAM Role에 `codepipeline:PutApprovalResult` 권한이 필요하다. D의 Step Functions 방식도 가능하지만 더 복잡하고, 표준 Manual Approval + Chatbot 조합이 AWS가 권장하는 패턴이다.

---

**문제 4.** Lambda Invoke Action에서 작업 시간이 20분 필요하다. 어떻게 처리해야 하는가?

A) Lambda timeout을 20분으로 설정한다  
B) Step Functions Action으로 변경하고 State Machine 안에서 Lambda 호출  
C) CodeBuild Action으로 변경  
D) 두 개의 Lambda Invoke Action으로 분리  

**정답: B**  
해설: Lambda의 최대 실행 시간은 15분이다. 20분 작업은 Lambda 단독으로 불가능하다(A는 불가). Step Functions는 이론상 최대 1년의 워크플로를 처리할 수 있다. State Machine 안에서 Lambda를 여러 번 호출하거나, ECS Task, Batch Job 등을 직접 통합할 수 있다. D는 두 Lambda 사이에 상태를 전달하는 방법이 없어서 실용적이지 않다.

---

**문제 5.** 파이프라인 실패 시 PagerDuty와 Jira에 자동으로 알림을 보내야 한다. 가장 확장 가능한 패턴은?

A) 각 파이프라인마다 Lambda Invoke Action을 마지막 Stage에 추가  
B) EventBridge Rule이 CodePipeline 실패 이벤트를 감지 → Lambda → PagerDuty/Jira API  
C) Manual Approval Action의 SNS Topic으로 PagerDuty/Jira 구독  
D) CloudWatch Alarm으로 Pipeline 실패 감지  

**정답: B**  
해설: EventBridge 기반 패턴이 확장성에서 유리하다. 새 파이프라인이 추가될 때마다 EventBridge Rule의 패턴에 파이프라인 이름만 추가하면 되고, Lambda 함수는 하나를 공유한다. A는 파이프라인마다 Stage를 수정해야 하는 관리 부담이 있다. Manual Approval SNS(C)는 승인 관련 이벤트에만 발행되고 모든 실패를 커버하지 못한다. CloudWatch Alarm(D)은 메트릭 기반이고 CodePipeline 실패를 실시간으로 감지하기 어렵다.

---

**문제 6.** Step Functions WaitForTaskToken 패턴을 사용하는 가장 적절한 시나리오는?

A) 30초짜리 API 호출이 필요할 때  
B) 외부 승인 시스템(ServiceNow, 사내 ITSM)이 완료를 콜백으로 알려줄 때까지 파이프라인을 대기시켜야 할 때  
C) 멀티 리전 배포에서 병렬 실행이 필요할 때  
D) CodeBuild 작업을 모니터링해야 할 때  

**정답: B**  
해설: WaitForTaskToken은 "파이프라인이 외부 시스템의 콜백을 기다려야 하는" 패턴에 최적화되어 있다. 작업 토큰을 외부 시스템에 전달하고, 외부 시스템이 완료되면 SendTaskSuccess/Failure를 호출해 파이프라인을 재개한다. 24시간, 48시간 등 임의의 시간 동안 대기할 수 있어서 사람의 승인이나 느린 외부 프로세스를 기다리는 데 적합하다. 병렬 실행(C)은 WaitForTaskToken과 관계없이 Parallel State로 구현한다.

---

**문제 7.** CodeStar Notifications와 EventBridge를 사용한 알림 패턴의 주요 차이는?

A) CodeStar Notifications는 빌드 이벤트만 지원한다  
B) CodeStar Notifications는 개발자 도구(CodePipeline, CodeBuild 등) 이벤트를 SNS/Chatbot으로 쉽게 라우팅하는 데 특화됐고, EventBridge는 Lambda/SQS/HTTP Endpoint 등 다양한 대상으로 모든 AWS 서비스 이벤트를 라우팅하는 범용 이벤트 버스다  
C) EventBridge는 실시간이 아니다  
D) 동일한 기능이다  

**정답: B**  
해설: CodeStar Notifications는 개발자 도구 이벤트에 특화된 알림 서비스다—SNS와 AWS Chatbot이 지원 대상이며, Slack/Teams 알림 구성이 쉽다. EventBridge는 훨씬 범용적이다—Lambda, SQS, HTTP Endpoint, Step Functions, EventBridge API Destination(외부 HTTP) 등 다양한 대상을 지원하고, 필터 패턴도 더 세밀하게 설정할 수 있다. PagerDuty, Jira 같은 외부 시스템 통합에는 EventBridge → Lambda 조합, Slack/Teams 알림에는 CodeStar Notifications + Chatbot이 더 간단하다.
