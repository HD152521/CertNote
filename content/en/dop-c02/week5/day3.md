# Day 3 - Action Providers: How Lambda, Step Functions, and Manual Approval Extend the Pipeline

CodePipeline's four categories—Source/Build/Test/Deploy—can't cover every situation. You need external API calls for approval tokens before deployment, or multi-region deployment requiring sequential progression with smoke tests between regions, or production deployment requiring operations team button-press from Slack. The expansion points are handled by Invoke category (Lambda, Step Functions) and Approval category (Manual Approval).

These three Action Providers frequently appear as combination questions in DOP-C02. When keywords like "exceeds 15 minutes," "complex condition branching," "Slack approval" appear, you must instantly judge which of three Providers to use. Today we establish that judgment criterion.

> 💡 **Related theory**: CodePipeline's Action Provider extension model is service-level implementation of "Open/Closed Principle." The pipeline itself remains unmodified (Closed), while functionality expands by adding new Providers (Open). Lambda Invoke is the most powerful form of this expansion—an escape hatch to execute arbitrary code. This design allows CodePipeline to integrate with dozens of third-party tools, and AWS doesn't need to build official Providers for every external system—Lambda permits "infinite expansion" via abstraction.

## Lambda Invoke Action: "Inserting Arbitrary Code Into the Pipeline"

Lambda Invoke Action is the escape hatch to run arbitrary Python/Node.js/Java code within CodePipeline. Used for external system integrations where official Providers don't exist (Jira ticket creation, Datadog deployment tags, direct Slack alerts, internal approval system API calls).

Event structure Lambda receives:

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

**Lambda function must do**: Report success or failure result to CodePipeline. Without reporting, pipeline waits default 24 hours then times out as failed.

```python
import boto3
import json
import urllib.request

codepipeline = boto3.client('codepipeline')

def handler(event, context):
    job_id = event['CodePipeline.job']['id']
    
    try:
        # Parse UserParameters
        params = json.loads(
            event['CodePipeline.job']['data']['actionConfiguration']
            ['configuration'].get('UserParameters', '{}')
        )
        env = params.get('env', 'staging')
        health_path = params.get('healthPath', '/health')
        
        # Run smoke test
        url = f"https://{env}.example.com{health_path}"
        with urllib.request.urlopen(url, timeout=10) as response:
            if response.status != 200:
                raise ValueError(f"Health check failed: {response.status}")
        
        # Success report + output variables (V2 pipeline's next Stage can reference)
        codepipeline.put_job_success_result(
            jobId=job_id,
            outputVariables={
                'SMOKE_STATUS': 'PASSED',
                'HEALTH_URL': url
            }
        )
        
    except Exception as e:
        # Failure report
        codepipeline.put_job_failure_result(
            jobId=job_id,
            failureDetails={
                'type': 'JobFailed',
                'message': str(e)[:1000],
                'externalExecutionId': context.aws_request_id
            }
        )
```

> ⚠️ **Pitfall**: Even if Lambda function executes normally, if `put_job_success_result` isn't called, pipeline stays "In Progress." Lambda's execution result (success/failure) and CodePipeline report are completely separate. Additionally, Lambda function's timeout (max 15 minutes) can occur before CodePipeline Action timeout—if function times out, `put_job_failure_result` also never gets called and pipeline hangs. This "double timeout trap" is the most frequent issue using Lambda for long jobs. Must use async pattern or switch to Step Functions.

**Async Lambda pattern**: Immediately report success and handle actual work in separate async system.

```python
def handler(event, context):
    job_id = event['CodePipeline.job']['id']
    
    # Start external async work (SQS message, ECS Task, etc.)
    sqs = boto3.client('sqs')
    sqs.send_message(
        QueueUrl='https://sqs.ap-northeast-2.amazonaws.com/111/deploy-queue',
        MessageBody=json.dumps({
            'job_id': job_id,
            'pipeline_execution_id': event['CodePipeline.job']['data']
                ['pipelineContext']['pipelineExecutionId']
        })
    )
    
    # Immediately signal "continue"
    # Actual work completion when external system calls put_job_success_result
    codepipeline.put_job_success_result(
        jobId=job_id,
        outputVariables={'ASYNC_JOB_DISPATCHED': 'true'}
    )
```

> 💡 **Related theory**: Async Lambda pattern has two variants: "Fire and Forget" and "Callback." The example above is "Fire and Forget" from pipeline perspective—immediately declare success without reflecting async job result back to pipeline. If async job result must continue/halt pipeline, use Step Functions's WaitForTaskToken pattern instead. Selection criterion: "must async job failure halt pipeline?" If not (Slack message send), use Fire and Forget. If yes (external approval or validation), use WaitForTaskToken.

## Step Functions Action: Breaking the 15-Minute Barrier

For work exceeding Lambda's 15-minute limit, or complex workflows needing if/else branching, parallel execution, retry, wait—use Step Functions Action.

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

Multi-region deployment State Machine example:

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

> 💡 **Related theory**: This State Machine implements the **Saga pattern**. Saga originated from Hector Garcia-Molina and Kenneth Salem's 1987 paper, distributed transaction pattern for when single ACID transaction is impossible. Each step succeeds and proceeds to next, or fails and executes compensating transaction for already-completed steps. Here RollbackKorea is the compensating transaction. Saga has two variants: Choreography (services publish/subscribe events to coordinate) and Orchestration (central coordinator controls order). Step Functions's Saga is Orchestration—State Machine is central coordinator. Multi-region deployment where failed region rollback happens in already-deployed region is textbook Saga implementation.

**Step Functions WaitForTaskToken pattern**: Advanced pattern connecting pipeline to external approval systems.

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

When external approval system calls `SendTaskSuccess`, State Machine proceeds to next step. Slack bot, internal IT portal, ServiceNow—any system can connect to pipeline via this callback mechanism.

> 🔍 **Deeper**: Step Functions Task Token is uniquely generated opaque string. Identifies State Machine execution context. Access current Task's token via `$$.Task.Token`. Core of WaitForTaskToken pattern is **token delivery path**—State Machine puts token in SQS message to external system, and external system later calls `SendTaskSuccess` with this token. Token TTL controlled by `TimeoutSeconds`, and `HeartbeatSeconds` sets external system's "still processing" heartbeat frequency. Missing heartbeat within this interval causes States.HeartbeatTimeout error. Detects external system failure during long wait.

> 📚 **Case study**: Airbnb's Deployments as a Service. Airbnb integrated hundreds of microservice deployments into central deployment platform, with core mechanism being Step Functions WaitForTaskToken. When service team issues "approve" command in Slack, Slack bot calls Step Functions SendTaskSuccess to continue deployment. Previously, Jenkins Job + email approval took average 2 hours; after Slack integration reduced to average 15 minutes. More importantly, visibility—"deployment visible in Slack" beat needing Jenkins console access for state.

## Manual Approval Action: When Person Becomes the Gate

Manual Approval controls pipeline flow by explicit human judgment. Automation-undecidable "business decisions" (e.g., cancel deployment before major marketing campaign, compliance-required change review) integrate into pipeline.

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

`timeoutInMinutes: 1440` is 24 hours. Default is 7 days (10,080 minutes). Adjust per business requirement.

**SNS → Chatbot → Slack connection pattern**:

```
Manual Approval Action
    ↓ SNS notification publish
SNS Topic (DeployApprovals)
    ├── Email subscription (10 deployment owners)
    └── AWS Chatbot subscription
           ↓
    Slack channel (#deploy-approvals)
           ↓ "/aws codepipeline approve checkout-pipeline ApproveProd ..."
    Chatbot calls approval API
           ↓
    CodePipeline proceeds to next Stage
```

For direct Slack approval, grant Chatbot `codepipeline:PutApprovalResult` permission:

```json
{
  "Effect": "Allow",
  "Action": "codepipeline:PutApprovalResult",
  "Resource": "arn:aws:codepipeline:ap-northeast-2:111:checkout-pipeline"
}
```

> 🔍 **Deeper**: Slack approval integration security considerations. AWS Chatbot doesn't directly map Slack users to IAM. Chatbot has IAM Role with SNS/CodePipeline permission, and everyone with channel access operates under this Role. Finer control requires custom Slack bot mapping users to AWS IAM Identity Center. Basic Chatbot config means "all channel members = same permission" but can set channel-level permission ceiling with Chatbot's `channelGuardrailPolicies`. Trade-off between simple notification vs fine approval control.

> ⚠️ **Pitfall**: Manual Approval `timeoutInMinutes` default confusion. Documentation says no default, but actually 7-day (10,080 minute) timeout applies. Emergency deployment when owner unavailable means 7-day timeout fails entire pipeline. Financial services should set 24 hours (1,440 minutes) or lower with escalation policy (1-hour alert to team lead, etc.) implemented via SNS → Lambda → email/SMS. Also, Manual Approval requires AWS console or CLI access, so can't designate Spoke account users without console access as approvers.

## CodeStar Notifications: Broadcasting Pipeline Events to Team

Pipeline failures must be detected quickly. CodeStar Notifications is unified notification service routing CodePipeline, CodeBuild, CodeDeploy events to multiple targets.

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

Supported event types (major):
- `codepipeline-pipeline-pipeline-execution-started`
- `codepipeline-pipeline-pipeline-execution-succeeded`
- `codepipeline-pipeline-pipeline-execution-failed`
- `codepipeline-pipeline-stage-execution-started`
- `codepipeline-pipeline-stage-execution-failed`
- `codepipeline-pipeline-action-execution-failed`
- `codepipeline-pipeline-manual-approval-needed`
- `codepipeline-pipeline-manual-approval-succeeded`

> 💡 **Related theory**: CodeStar Notifications and EventBridge both export CodePipeline events externally but serve different purposes. CodeStar Notifications is **Notification** service specialized for SNS and AWS Chatbot targets only—optimized for "alerting people." EventBridge is **Event Routing** general-purpose service supporting Lambda, SQS, ECS, Step Functions, HTTP Endpoint, all AWS services and external systems. Selection criterion: "Slack alert → CodeStar Notifications, external system automation → EventBridge." Both services internally share EventBridge events, but CodeStar Notifications is wrapper specialized for Developer Tools events.

## Direct EventBridge Connection: External System Integration

While CodeStar Notifications specializes in Slack/SNS alerts, EventBridge is general-purpose router for connecting to all systems.

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

Patterns per target:
- **PagerDuty**: EventBridge → Lambda → PagerDuty Events API
- **Jira**: EventBridge → Lambda → Jira REST API (auto-create issue)
- **Datadog**: EventBridge → Lambda → Datadog Events API (deployment marker)
- **ServiceNow**: EventBridge → Lambda → ServiceNow REST API (auto-close change request)

```python
# EventBridge → Lambda → PagerDuty example
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
            "dedup_key": execution_id,   # Idempotency: prevent duplicate alert for same execution
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

> 💡 **Related theory**: Why set `dedup_key` to `execution_id`—EventBridge's "at-least-once delivery" guarantee. EventBridge delivers events at least once, so same event can reach Lambda twice during retries. Two calls to PagerDuty create two alerts. With `dedup_key` (PagerDuty's idempotency key) set, second call for same execution ID updates existing alert instead of creating new one. This is **Idempotency** principle in distributed systems—same request multiple times should produce same result. Implementing idempotency at API level is standard pattern.

## Custom Action Provider: Integrating External CI Systems

Custom Action Provider integrates external systems CodePipeline doesn't directly support (internal CI, legacy deploy tools, specialized test platform) with pipeline. Lambda Invoke covers most cases but long-running jobs or external agents need Custom Provider.

```bash
# Register Custom Action Provider
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

# Worker periodically polls (Long-Polling approach)
aws codepipeline poll-for-jobs \
  --action-type-id category=Build,owner=Custom,provider=MyInternalCI,version=1 \
  --max-batch-size 5

# Report after job completion
aws codepipeline put-job-success-result --job-id <job-id>
```

Custom Action Provider's core is **Poll-based architecture**. Not Push method (CodePipeline calls external system) but external agent periodically checks CodePipeline for jobs. Particularly useful for targets like internal network systems inaccessible from internet.

> 🎯 **Scenario**: Manufacturing company has regulation "ERP deployment approval from SAP required before AWS Lambda code deploys." SAP has API but external-inaccessible and internal agents only can call SAP API. Solution: Custom Action Provider where internal agent `poll-for-jobs` to get jobs, calls SAP API to check approval, reports `put-job-success/failure-result`. Lambda wouldn't work because Lambda must access SAP via internet but SAP is internal-only. VPC Lambda possible but when internal machine already SAP-accessible, Custom Provider simpler.

## Lambda vs Step Functions Selection Criterion

| Criterion | Lambda Invoke | Step Functions Invoke |
|---|---|---|
| **Execution Time** | 15 minutes max | Theoretically 1 year (365 days) |
| **Complexity** | Simple linear logic | Branching (Choice), parallel (Parallel), retry (Retry), wait (Wait) |
| **State Management** | Direct inside Lambda | State Machine manages state |
| **Visibility** | CloudWatch Logs | Step Functions Console (visual execution graph) |
| **Cost** | Lambda execution time × GB | State transition count |
| **Saga Pattern** | Manual implementation needed | Native support (Catch + Compensating Task) |
| **Human Involvement** | Awkward (needs separate mechanism) | Natural via waitForTaskToken |
| **External Service Integration** | boto3 direct call | Optimized Integrations (ECS, SQS directly) |

Selection rule: **15 minutes or less + simple logic → Lambda. Otherwise → Step Functions.**

> 📚 **Case study**: Lyft's deployment platform architecture. Lyft runs hundreds of microservices deploying hundreds per day with "automation + human judgment balance" as core principle. Lambda runs auto smoke tests, Step Functions gradually raises canary traffic, Manual Approval restricted to "automation-undecidable business events" like error rate spike. "Person gates only when automation can't judge." This principle matches DOP-C02 exam scenario answer selection. Lyft's deployment speed improved 40%, deployment-related incidents decreased 60%.

## Complete Flow: Complex Pipeline Example

```
Source (GitHub)
    ↓
Build (CodeBuild — build image, output IMAGE_TAG)
    ↓
Test (CodeBuild — unit + integration test)
    ↓
Lambda Invoke (smoke test — check staging /health endpoint)
    ↓ #{LambdaSmoke.SMOKE_STATUS} == PASSED verify
Step Functions Invoke (multi-region sequential deploy)
    ├── ap-northeast-2 deploy + 5min wait + alarm check
    ├── us-east-1 deploy + 5min wait + alarm check (parallel)
    └── eu-west-1 deploy + 5min wait + alarm check (parallel)
    ↓
Manual Approval (SNS → Chatbot → Slack — final verification)
    ↓
Deploy (CodeDeploy — complete traffic cut-over)
    ↓
EventBridge → Lambda → Datadog (record deployment marker)
```

> 🎯 **Scenario**: E-commerce company wants automatic deployment freeze during Black Friday. Must apply deployment freeze between Nov 25-27 automatically. Manual Approval alone can't work—someone might "accidentally" approve during freeze. Stronger method needed: EventBridge Scheduler schedules two Lambda functions. (1) Nov 25 0:00: Lambda calls `disable-stage-transition` API to block Deploy Stage. (2) Nov 28 0:00: another Lambda calls `enable-stage-transition` to re-enable. Even if pipeline runs, Deploy Stage can't be entered—no human mistake. Deployment freeze automated without humans.

## Summary

Lambda Invoke Action is escape hatch to integrate arbitrary code. Requires `put_job_success/failure_result` call and has 15-minute limit. Step Functions Invoke breaks this limit for complex workflows, Saga pattern, external event wait (WaitForTaskToken). Manual Approval integrates automation-undecidable business decisions with SNS → Chatbot → Slack chain enabling direct Slack approval. EventBridge routes pipeline events to external systems (PagerDuty, Jira, Datadog).

Custom Action Provider integrates internal-network systems via Poll-based method. Three Providers' selection criterion: Lambda (15 min or less + simple) → Step Functions (complex/long + auto logic) → Manual Approval (auto-undecidable + human decision).

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
