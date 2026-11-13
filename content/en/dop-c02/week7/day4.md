# Day 4 - Step Functions: Workflows as State Machines, Not Code

Once Lambda functions pass 100, the same question keeps coming back: "Where do I put the logic that calls that function when this one finishes, runs a compensating transaction on failure, and waits 30 minutes for a human approval?" If your answer is to wire SQS, SNS, and EventBridge together so functions pass messages to each other, **distributed debugging hell** soon begins. Which function received which message, why a retry happened twice, why it stopped at step 7: tracing becomes nearly impossible.

Step Functions is AWS's answer to this problem. Launched in December 2016, the essence of this service is a **declarative state machine engine**: you describe every state transition of a workflow in a JSON DSL called ASL (Amazon States Language), and AWS guarantees execution, retries, and history tracking. The amount of code you write drops by 90%, and above all every execution becomes 100% traceable as a visual diagram.

Today we look at the essential difference between Standard and Express, the external callback mechanism called `.waitForTaskToken`, Distributed Map's large-scale parallel processing, and practical patterns for expressing multi-Region deployment workflows in Step Functions. The DOP exam almost always makes Step Functions the answer to "complex deployment flow" scenarios, so it is important to memorize which pattern maps to which ASL structure.

## Standard vs Express: The Essential Difference Between Two Engines

Step Functions accepts the same ASL but has **two completely different engines**.

| Item | Standard Workflow | Express Workflow |
|------|-------------------|-------------------|
| Launched | 2016 | 2019 |
| Max execution time | 1 year | 5 minutes |
| Execution guarantee | Exactly-once | At-least-once |
| Pricing model | Per state transition ($0.025/1000) | Invocations + execution time (memory GB-h) |
| Synchronous invocation | Not possible (async only) | Possible (StartSyncExecution) |
| History retention | 90 days (the service itself) | CloudWatch Logs (specified period) |
| Console visualization | Graph of every execution automatically | Based on Logs (enabled separately) |
| TaskToken use | ✅ | ❌ |
| Wait state | ✅ (up to 1 year) | ✅ (within 5 minutes) |
| Activity polling | ✅ | ❌ |

The difference in pricing model is decisive. Suppose a short 100ms workflow is invoked 1000 times per second.

- **Standard**: an average of 5 state transitions per invocation x $0.025/1000 = $0.000125, and 1000 per second = $0.125/second = $324K/month. Unrealistic.
- **Express**: 1 invocation $0.000001 + 100ms x 0.064 GB x $0.0000094/GB-s ≈ $0.0000016, and 1000 per second = $4.1/month. Reasonable.

Conversely, a single 1-year execution is nearly free on Standard and flatly impossible on Express because of the 5-minute limit. The product of **invocation frequency and execution time** decides which of the two is reasonable.

> 💡 **Related theory**: Exactly-once vs at-least-once is a core guarantee model of distributed systems. Representative work in this area includes Birman's **virtual synchrony** in 1987, Kafka's transactional messages in 2014, and Google's Pub/Sub exactly-once in 2016. Standard deduplicates per workflow execution ID and handles each state transition as a transaction to guarantee exactly-once. Express gives this up for performance, and the user is directly responsible for idempotency. On the exam, "order processing workflow - duplicate payments absolutely forbidden" is Standard, and "IoT sensor data ETL - some duplication tolerated" is Express.

> 🎯 **Scenario**: "A deployment workflow averages 90 minutes, has a human approval step in the middle, and runs 100 times a day." The answer is **Standard**. 90 minutes exceeds Express's 5-minute limit, and human approval needs TaskToken (not supported by Express). Conversely, "synchronous response as an API Gateway backend, average 200ms, 500 invocations per second" is **Express + StartSyncExecution**. The key keywords in exam scenarios are "execution time," "invocation frequency," "human involvement or not," and "synchronous vs asynchronous."

> The Express Workflow's internal implementation uses a different code path from Standard. Standard records every state transition in DynamoDB, but Express processes in memory and writes to CloudWatch Logs in bulk after completion. This is the cause of the cost and performance difference. If a node fails midway, Express re-executes from the start (the precise meaning of at-least-once). The two models' strengths can be combined with a nested pattern in which a Standard workflow calls an Express child workflow "contained" within it, and Distributed Map uses this pattern.

## The 8 State Types of ASL

ASL is a DSL that expresses a functional state machine in JSON. Every workflow is a combination of 8 state types.

```
Task        Run actual work (Lambda, AWS SDK, ECS, EMR, Glue ...)
Choice      Conditional branching (if-else / switch)
Parallel    Run multiple branches at once + proceed when all finish
Map         Iterate per array element (serial or parallel)
Wait        Wait for a duration/time (up to 1 year)
Pass        Data transformation only, no work
Succeed     End the workflow successfully
Fail        End the workflow with failure (includes Error info)
```

```json
{
  "Comment": "Order processing workflow example",
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

This example contains every ASL pattern. **Retry** retries transient errors with backoff, **Choice** branches, **Parallel** processes payment and inventory at the same time, and **Catch** runs a compensating transaction on failure. Writing the same logic directly in Lambda would need 5 functions + a message queue + a DynamoDB state table, while ASL completes it in a single JSON.

> The Saga pattern is a distributed transaction model proposed in the 1987 paper "Sagas" by Hector Garcia-Molina & Kenneth Salem. Because it is hard to implement ACID atomicity in a distributed environment, it defines a series of operations paired with a **compensating transaction** for each, and on failure runs the compensations in reverse order. Step Functions' `Parallel` + `Catch` + compensating Lambda pattern is exactly a Saga implementation. It is the standard solution for multi-service transactions such as payment, orders, and inventory in microservice architectures.

## AWS SDK Service Integration: Direct Integration Without Lambda

AWS SDK Service Integration, launched in September 2021, was a game changer for Step Functions. You can **call 200+ AWS services directly without Lambda**.

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

Resource ARN format: `arn:aws:states:::aws-sdk:<service>:<operation>[.<integration-pattern>]`. Examples:

| Operation | Resource ARN |
|------|--------------|
| DynamoDB PutItem | `arn:aws:states:::aws-sdk:dynamodb:putItem` |
| S3 GetObject | `arn:aws:states:::aws-sdk:s3:getObject` |
| ECS RunTask (wait synchronously) | `arn:aws:states:::ecs:runTask.sync` |
| Glue StartJobRun (wait) | `arn:aws:states:::glue:startJobRun.sync` |
| SQS SendMessage | `arn:aws:states:::sqs:sendMessage` |
| SNS Publish | `arn:aws:states:::sns:publish` |
| CloudFormation CreateStack | `arn:aws:states:::aws-sdk:cloudformation:createStack` |
| CodeDeploy CreateDeployment | `arn:aws:states:::aws-sdk:codedeploy:createDeployment` |

The `.sync` suffix waits until the task completes (polling is automatic). `.waitForTaskToken` is the external callback pattern. With no suffix, it is fire-and-forget.

> In 2021 a media company was running a video transcoding workflow with Step Functions + 12 Lambdas. After SDK Integration launched, they replaced 9 of the 12 Lambdas with direct integrations: the workflow definition shrank to a third, cold starts disappeared, and P99 latency dropped from 18 seconds to 4 seconds. The burden of maintaining Lambda code also disappeared. On the exam, a scenario where "there are many functions that only call Lambda, making operations complex" is answered by SDK Integration.

> ⚠️ **Pitfall**: The IAM for SDK Integration must be held by the State Machine's execution Role. To call `arn:aws:states:::aws-sdk:cloudformation:createStack`, the Role must have the `cloudformation:CreateStack` permission. AWS doesn't grant permissions automatically, so specify them in the Role policy. CDK's `tasks.CallAwsService` accepts `iamResources`/`iamAction` and synthesizes the permissions automatically, but they are easy to forget when writing ASL JSON directly.

## TaskToken: An Elegant Pattern for External System Callbacks

The key feature that distinguishes Step Functions from other workflow engines (Airflow, Argo) is the **TaskToken** mechanism. It pauses the workflow and waits for a response from an external system (a person, another service).

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

Flow of operation:

```
1. Step Functions reaches RequestApproval
2. Publishes a message to the SNS Topic (including taskToken)
3. The workflow pauses (state is RUNNING, cost is nearly 0)
4. An external system (Lambda → Slack → person) receives the token
5. The person clicks "Approve" in Slack → a Lambda is invoked
6. The Lambda calls SendTaskSuccess(taskToken, output) or SendTaskFailure(taskToken, error)
7. Step Functions wakes up immediately and proceeds to the next state
8. If TimeoutSeconds is set and there is no response within that time, a timeout occurs (without it, the wait can last up to 1 year)
```

```python
# Approval-handling Lambda (Slack interactive message handler)
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

> A TaskToken is a cryptographic random string mapped to a workflow execution instance inside the Step Functions service. An external system holding the token gains the ability to "wake the Nth state of this workflow," which makes it effectively a **capability-based security** pattern (Henry Levy, 1984). A token that has been used once can't be reused, and if a token is lost the workflow waits until timeout. The cost of waiting 1 year is nearly 0 (Standard pricing is per state transition, not per waiting time). This is the structural reason Step Functions is better suited than Airflow to workflows with human involvement.

> 🎯 **Scenario**: "A 3-stage review workflow for production deployment: security team approval → DevOps team approval → automatic deployment. Each stage is notified by Slack message, and it is automatically canceled if there is no response within 7 days." The answer is a Standard Workflow + `.waitForTaskToken` 3 times + `TimeoutSeconds: 604800`. Send to Slack via an SNS Topic or EventBridge. The external approval-handling Lambda calls `SendTaskSuccess/Failure`. Compared with CodePipeline's ManualApprovalAction, Step Functions can express far more flexible notification channels and approval workflows.

## Retry & Catch: Robust Error Handling

One line of Lambda invocation with 7 lines of retry logic. That is the value of ASL.

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

Retry is evaluated in order, and the first matching policy is applied. The backoff formula is `interval × backoffRate^(attempt-1)` + jitter. With `BackoffRate: 2.0` and `IntervalSeconds: 2`, it goes 2 → 4 → 8 → 16 → 32 → 64 seconds.

Catch matches after all Retries have failed. `States.ALL` is all errors, `Lambda.Unknown` is a timeout, and a custom error is the error name thrown from the Lambda function.

> Exponential backoff + jitter was standardized in Lamport's 1995 distributed systems paper and the 2015 AWS Architecture Blog post "Exponential Backoff And Jitter." If every client uses the same backoff formula without jitter, retries synchronize and bursts repeat on the backend (thundering herd). Full jitter spreads them with `random(0, interval × backoffRate^attempt)`. ASL supports this natively with `JitterStrategy: "FULL"` (2023+). On the exam, the fix for "DynamoDB throttle → retry burst" is backoff + jitter.

## Distributed Map: 10K+ Concurrent Executions

Distributed Map, launched in December 2022, breaks the limit of the earlier Map (40 concurrent). **Up to 10,000 concurrent executions** processed as child workflows.

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

Key features:

- **ItemReader**: various sources such as an S3 object list, the contents of S3 CSV/JSON Lines files, DynamoDB Scan, and a Manifest
- **ItemBatcher**: bundles multiple items into one child workflow to improve efficiency
- **Mode: DISTRIBUTED**: splits child workflows into separate SF executions (the earlier Inline Mode runs inside the parent)
- **ExecutionType: EXPRESS**: children are Express, so they are short and cheap
- **ToleratedFailurePercentage**: tolerates up to 5% failures, and the parent fails if exceeded
- **ResultWriter**: automatically stores results in S3

> In 2023 an advertising company was running an ETL that processes 50 million click events per day from S3 on a Spark cluster. Burdened by the operating cost and complexity of the Spark cluster, they switched to Distributed Map + Lambda: the cluster disappeared, cost dropped 60%, and processing time stayed similar. The keys were (1) Distributed Map automatically splits the 50 million objects, (2) ToleratedFailurePercentage of 1% tolerates partial failure, and (3) 10,000 concurrent Lambda executions secure throughput. On the exam, "processing tens of millions of objects + tolerating partial failure" is Distributed Map.

> The architectural difference between Inline Map and Distributed Map: Inline is processed synchronously inside the parent workflow, so it affects the parent's state transition limit (execution history 25000). In Distributed, each iteration is a separate child execution (Standard or Express), so the parent tracks only the child execution IDs. That is, the parent holds only meta information like "10000 children launched and 9990 succeeded." As a result the parent history stays small and concurrency scales out to the child pool. This was possible because in 2022 SF split child executions into a separate pricing unit.

## Multi-Region Sequential Deployment Workflow

A representative Step Functions scenario on the DOP exam.

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

The value of this structure is that every branch, wait, and rollback is **explicitly expressed in a single JSON**. Writing the same logic in Lambda would need 200+ lines for a DynamoDB state table + step tracking + error handling + guaranteed rollback ordering, and debugging would be nearly impossible.

> 🎯 **Scenario**: "Deploy in the order us-east-1 → eu-west-1 → ap-northeast-2, monitor 30 minutes in each Region, and if an alarm fires, roll back all Regions deployed so far in reverse order." The answer is the structure above + the AP Region added. The components are (1) the Wait + Choice pattern, (2) accumulating each Region's deploymentId with ResultPath, and (3) triggering the reverse-order rollback with Catch. Similar scenarios can appear on the exam.

## CDK + Step Functions: Type-Safe Workflows

When you write ASL JSON directly, you can't catch typos, syntax errors, or broken references at compile time. CDK solves this with the TypeScript type system.

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

CDK automatically tracks IAM permissions (`iamAction`/`iamResources`) and synthesizes the ASL JSON. TypeScript's type system catches wrong state references and missing next at compile time.

## Express + API Gateway: The Synchronous Workflow Pattern

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

If you set API Gateway's integration type to **AWS service integration** instead of `AWS_PROXY` and specify the target as `arn:aws:apigateway:ap-northeast-2:states:action/StartSyncExecution`, a synchronous API → SF call becomes possible. You use a workflow that completes within 5 minutes as a REST API backend.

> 🎯 **Scenario**: "Payment processing consists of 4 steps (validate, authenticate, charge, record), and each step is a separate microservice. The API needs a synchronous response." The answer is Express + StartSyncExecution. Compared with writing 4 calls inline in a single Lambda function, workflow visualization, retries, and error handling are automatic.

## Wrapping Up

Today's picture has five points. First, **Standard vs Express is decided by the product of invocation frequency and execution time**: long and infrequent is Standard, short and frequent is Express. Second, the **8 ASL state types** (Task/Choice/Parallel/Map/Wait/Pass/Succeed/Fail) combine to express any workflow. Third, **AWS SDK Service Integration** calls 200+ services directly without Lambda. Fourth, **TaskToken** (`.waitForTaskToken`) integrates external systems and human involvement in a capability-based way. Fifth, **Distributed Map** processes 10,000 concurrent child workflows with partial failure tolerance.

In the next article we wrap up this week by tying SAM, CDK, Lambda, and Step Functions together in integrated scenarios. Because real exam questions weave several services into one question, accurately matching each service's strengths, weaknesses, and combination patterns is the key to passing.

---

## 📝 Practice Questions

**Question 1.** Which statement most accurately describes the essential difference between Standard and Express Workflows?

A) Standard is 1 year, exactly-once, billed per state transition; Express is 5 minutes, at-least-once, billed per invocation + execution time
B) The same engine, only the price differs
C) Express can do human approval
D) Standard supports only synchronous invocation

**Answer: A**
Explanation: The difference in pricing model is decisive. Short + high-frequency workloads (IoT, API backends) blow up in cost on Standard, so Express is reasonable. Long + low-frequency ones (deployments, including human approval) violate the 5-minute limit on Express, so Standard fits. Exactly-once vs at-least-once is decisive in scenarios like payments where duplicates are forbidden. C is the opposite (Express doesn't support TaskToken), and D is the opposite (Standard is async only).

---

**Question 2.** What is the standard pattern in Step Functions for waiting on a response from an external system (a Slack bot, human approval)?

A) Wait state + polling
B) The `.waitForTaskToken` integration pattern + calling SendTaskSuccess/Failure from outside
C) Infinite Lambda polling
D) Repeating Choice states

**Answer: B**
Explanation: TaskToken is an implementation of the capability-based security pattern (Henry Levy, 1984). SF issues a token and pauses the workflow (cost nearly 0), and when an external system calls SendTaskSuccess(output) or SendTaskFailure(error) with the token, it resumes immediately. It can wait up to 1 year and can end automatically with TimeoutSeconds. A is inefficient, C blows up cost, and D means something different. On the exam, "human approval" and "external system response" are almost always TaskToken.

---

**Question 3.** There are many workflow nodes that only call Lambda, making operational complexity high. What is the most effective improvement?

A) Change all the Lambdas to ECS Tasks
B) Call 200+ services directly with AWS SDK Service Integration (`arn:aws:states:::aws-sdk:<service>:<action>`) - remove Lambda
C) Change Standard to Express
D) Replace Step Functions with EventBridge

**Answer: B**
Explanation: AWS SDK Service Integration, launched in 2021, eliminates the pattern of creating a Lambda function just to make one SDK call. It calls 200+ AWS services such as CloudFormation, CodeDeploy, DynamoDB, S3, and SNS directly from ASL. As in the media company case, cutting 12 Lambdas to 3 eliminated cold starts and shortened P99 latency. IAM must be specified explicitly on the State Machine execution Role. A is more complex, C is irrelevant, and D is because EventBridge handles only simple flows.

---

**Question 4.** You process 50 million S3 objects in an ETL while tolerating 1% failure. What is the most suitable pattern?

A) Standard Map (40 concurrent limit)
B) Distributed Map + ItemReader: S3 listObjectsV2 + ProcessorConfig: DISTRIBUTED/EXPRESS + ToleratedFailurePercentage: 1
C) EventBridge → 50 million Lambda invocations
D) 50 million ECS Fargate Tasks

**Answer: B**
Explanation: Distributed Map (2022) is the exact answer. ItemReader splits the S3 objects automatically, ItemBatcher bundles them for efficiency, child workflows run as Express so they are short and cheap, MaxConcurrency goes up to 10000, and ToleratedFailurePercentage tolerates partial failure. As in the advertising company case, it can replace a Spark cluster. A is impossible for 50 million with a concurrency limit of 40, C causes throttling and cost explosion, and D has a heavy operational burden and high startup latency.

---

**Question 5.** What is the backoff calculation formula in ASL Retry?

A) Always a constant interval
B) `interval × backoffRate^(attempt-1)` + optional jitter; moves to Catch when MaxAttempts is exceeded
C) Infinite retries
D) Automatically moves to the Lambda DLQ

**Answer: B**
Explanation: Exponential backoff + jitter is the standard for preventing a thundering herd (AWS Architecture Blog, 2015). For example, `IntervalSeconds: 2, BackoffRate: 2.0, MaxAttempts: 6` gives 2→4→8→16→32→64 seconds. Turning on `JitterStrategy: FULL` (2023+) adds random spread to each interval. When all Retry policies fail, the Catch block receives it and branches. A is simply wrong, C is wrong because a limit always exists, and for D the SQS DLQ is a separate mechanism.

---

**Question 6.** "For production deployment, 3-stage approval: security team → DevOps team → automatic deployment, with a 7-day timeout per stage and Slack notification." What workflow design fits?

A) 3 CodePipeline ManualApprovalActions
B) Standard Workflow + `.waitForTaskToken` 3 times + SNS→Slack notification + TimeoutSeconds: 604800
C) Express Workflow
D) EventBridge Schedule

**Answer: B**
Explanation: Only Standard supports TaskToken; Express does not. A 7-day timeout is a strength of Standard (it violates Express's 5-minute limit). Approval goes through a Slack interactive message → Lambda → SendTaskSuccess(token, output). CodePipeline ManualApprovalAction (A) can also do human approval, but (1) the Slack notification and authentication flow is complicated, (2) the 7-day wait cost and UX are unsuitable, and (3) expressing branching and rollback is weaker than SF. SF expresses more flexible notification and approval workflows.

---

**Question 7.** Multi-step business logic needs an average 300ms synchronous response as an API Gateway backend. What pattern fits?

A) Standard Workflow + StartExecution
B) Express Workflow + StartSyncExecution + API Gateway AWS service integration
C) Inline all the logic in a single Lambda
D) Step Functions is unsuitable

**Answer: B**
Explanation: Express + StartSyncExecution (2019) is the standard for the synchronous workflow pattern. Expressing multi-step logic that finishes within 5 minutes (validate → authenticate → process → record) as a workflow gives visualization, retries, and error handling automatically. Standard is async only and unsuitable for an API backend (A). Inline Lambda (C) is fine for simple cases but lacks multi-step support, retries, and visualization. D says SF is unsuitable, but SF is precisely the answer for this scenario.

---

**Question 8.** In a multi-Region deployment (USE1 → EUW1 → APN2), when an alarm fires at the EUW1 stage, the Regions deployed so far must be rolled back in reverse order. How is it expressed in ASL?

A) Use a Retry block
B) Accumulate deploymentId per Region with ResultPath + check alarms with Choice + chain RollbackEUW1 → RollbackUSE1 on failure
C) Use Parallel
D) Use Map

**Answer: B**
Explanation: Multi-Region sequential deployment with reverse-order rollback is a classic Step Functions pattern. Accumulate the deploymentId with something like `ResultPath: $.use1Deploy` on each DeployTask, and in Choice branch to the Rollback chain when an alarm fires. Rollback is a reverse-order chain (`Next: RollbackUSE1`). Parallel (C) runs concurrently, so sequencing isn't guaranteed; Map (D) is for repeating the same work and is unsuitable; Retry (A) retries a single task. It is one of the SF patterns that appears most often on the exam.

---

## 📌 Today's Summary

The key points of Step Functions covered today are five: (1) Standard vs Express is decided by invocation frequency x execution time, and the pricing models are fundamentally different; (2) the 8 ASL state types combine to express any workflow, and Saga compensating transactions are implemented with Parallel+Catch+Compensate; (3) AWS SDK Service Integration calls 200+ services directly without Lambda; (4) TaskToken is a capability-based external callback pattern and the standard for human approval and external system integration; (5) Distributed Map handles large-scale ETL with 10,000 concurrent child workflows + partial failure tolerance + an S3 ResultWriter.
