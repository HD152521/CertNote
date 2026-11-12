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

## 📝 Practice Questions

**Question 1.** In a Lambda invoke action, the Lambda function completed normally but the pipeline is stuck in the "In Progress" state. What is the most likely cause?

A) The Lambda function execution time is too long  
B) The Lambda function did not call codepipeline.put_job_success_result()  
C) The Lambda function lacks IAM permissions  
D) The pipeline execution mode is QUEUED  

**Answer: B**  
Explanation: CodePipeline does not directly receive the execution result (return value, exception) of the Lambda function. The success or failure of a pipeline job is reported only by calling the `put_job_success_result` or `put_job_failure_result` API. Even if the function completes normally, without this call the pipeline waits for a response and fails after the default 24 hours (or the configured timeout).

---

**Question 2.** In a multi-Region deployment workflow, if one Region fails, the other Regions that have already been deployed must be rolled back. What is the most appropriate implementation?

A) Implement the rollback logic directly in a Lambda invoke action  
B) The Saga pattern with a Step Functions action — run compensating transactions (rollback tasks) on failure inside a Parallel state  
C) A person decides on the rollback with a manual approval action  
D) CodeDeploy automatic rollback  

**Answer: B**  
Explanation: A multi-Region deployment with rollback on partial failure is a textbook case of the Saga pattern. With a combination of the Step Functions Parallel state + Catch, you can deploy to each Region in parallel and, if a particular Region fails, run a compensating rollback on the Regions that already succeeded. It can be implemented with Lambda (A) as well, but the 15-minute limit and state management complexity are problems. CodeDeploy (D) handles rollback only within that service and cannot coordinate across Regions.

---

**Question 3.** What configuration is required so that team members can approve a prod deployment directly from a Slack channel?

A) Manual approval action → SNS topic → AWS Chatbot → Slack channel. Grant the codepipeline:PutApprovalResult permission to Chatbot  
B) Call the Slack API directly from a Lambda invoke action  
C) Connect a Slack webhook with an EventBridge rule  
D) Connect a Slack bot with Step Functions waitForTaskToken  

**Answer: A**  
Explanation: The manual approval action publishes a notification to SNS, and Chatbot displays it in the Slack channel. When the `/aws codepipeline approve` command is run in Slack, Chatbot calls the CodePipeline API to process the approval. For this, the Chatbot IAM role needs the `codepipeline:PutApprovalResult` permission. The Step Functions approach in D is also possible, but more complex, and the standard manual approval + Chatbot combination is the pattern AWS recommends.

---

**Question 4.** A Lambda invoke action needs 20 minutes of work time. How should this be handled?

A) Set the Lambda timeout to 20 minutes  
B) Change to a Step Functions action and call Lambda inside the state machine  
C) Change to a CodeBuild action  
D) Split it into two Lambda invoke actions  

**Answer: B**  
Explanation: The maximum Lambda execution time is 15 minutes. A 20-minute job is not possible with Lambda alone (A is not possible). Step Functions can in theory handle workflows of up to 1 year. Inside the state machine you can call Lambda multiple times, or integrate directly with ECS tasks, Batch jobs, and so on. D is not practical because there is no way to pass state between the two Lambda functions.

---

**Question 5.** You must automatically send notifications to PagerDuty and Jira when a pipeline fails. What is the most scalable pattern?

A) Add a Lambda invoke action to the last stage of every pipeline  
B) An EventBridge rule detects the CodePipeline failure event → Lambda → PagerDuty/Jira API  
C) Subscribe PagerDuty/Jira to the SNS topic of the manual approval action  
D) Detect pipeline failures with a CloudWatch alarm  

**Answer: B**  
Explanation: The EventBridge-based pattern is better for scalability. Each time a new pipeline is added, you only need to add the pipeline name to the EventBridge rule pattern, and one Lambda function is shared. A has the management burden of modifying the stages of every pipeline. The manual approval SNS topic (C) publishes only for approval-related events and does not cover all failures. A CloudWatch alarm (D) is metric-based and has difficulty detecting CodePipeline failures in real time.

---

**Question 6.** What is the most appropriate scenario for using the Step Functions WaitForTaskToken pattern?

A) When a 30-second API call is needed  
B) When the pipeline must wait until an external approval system (ServiceNow, an internal ITSM) notifies completion through a callback  
C) When parallel execution is needed in a multi-Region deployment  
D) When a CodeBuild job needs to be monitored  

**Answer: B**  
Explanation: WaitForTaskToken is optimized for the pattern where "the pipeline must wait for a callback from an external system." You pass the task token to the external system, and when the external system finishes, it calls SendTaskSuccess/Failure to resume the pipeline. It can wait for an arbitrary time such as 24 or 48 hours, which makes it suitable for waiting on human approval or slow external processes. Parallel execution (C) is implemented with a Parallel state, regardless of WaitForTaskToken.

---

**Question 7.** What is the main difference between CodeStar Notifications and a notification pattern using EventBridge?

A) CodeStar Notifications supports only build events  
B) CodeStar Notifications is specialized for easily routing developer tool (CodePipeline, CodeBuild, and so on) events to SNS/Chatbot, while EventBridge is a general-purpose event bus that routes events from all AWS services to various targets such as Lambda/SQS/HTTP endpoints  
C) EventBridge is not real-time  
D) They are the same feature  

**Answer: B**  
Explanation: CodeStar Notifications is a notification service specialized for developer tool events — SNS and AWS Chatbot are the supported targets, and Slack/Teams notifications are easy to configure. EventBridge is far more general-purpose — it supports various targets such as Lambda, SQS, HTTP endpoints, Step Functions, and EventBridge API destinations (external HTTP), and its filter patterns can be set more finely. For integrating external systems such as PagerDuty and Jira, the EventBridge → Lambda combination is better, and for Slack/Teams notifications, CodeStar Notifications + Chatbot is simpler.
