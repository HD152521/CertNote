# Day 4 - Step Functions: Workflows as State Machines, Not Code

Once Lambda functions start to exceed 100, the same question keeps coming up. "Where do we put the logic that calls function B when function A finishes, runs a compensating transaction on failure, and waits 30 minutes for a human approval?" If the answer is to wire SQS, SNS, and EventBridge together so the functions pass messages to one another, **distributed debugging hell** soon begins. Which function received which message, why a retry happened twice, why it stopped at step 7: tracing is nearly impossible.

Step Functions is AWS's answer to this problem. The essence of this service, launched in December 2016, is a **declarative state machine engine**: every state transition of a workflow is described in a JSON DSL called ASL (Amazon States Language), and AWS guarantees execution, retries, and history tracking. The amount of code developers write drops by 90%, and above all, every execution can be traced 100% as a visual diagram.

Today we look at the essential differences between Standard and Express, the external callback mechanism called `.waitForTaskToken`, the large-scale parallel processing of Distributed Map, and practical patterns for expressing multi-region deployment workflows with Step Functions. The DOP exam almost always makes Step Functions the answer to "complex deployment flow" scenarios, so it is important to memorize which pattern maps to which ASL structure.

## Standard vs Express: The Essential Differences Between the Two Engines

Step Functions accepts the same ASL but has **two completely different engines**.

| Item | Standard Workflow | Express Workflow |
|------|-------------------|-------------------|
| Released | 2016 | 2019 |
| Max execution time | 1 year | 5 minutes |
| Execution guarantee | Exactly-once | At-least-once |
| Pricing model | Per state transition ($0.025/1000) | Invocations + execution time (memory GB-h) |
| Synchronous invocation | Not possible (asynchronous only) | Possible (StartSyncExecution) |
| History retention | 90 days (in the service itself) | CloudWatch Logs (specified period) |
| Console visualization | Graph for every execution, automatic | Logs-based (enabled separately) |
| TaskToken usage | ✅ | ❌ |
| Wait state | ✅ (up to 1 year) | ✅ (within 5 minutes) |
| Activity polling | ✅ | ❌ |

The difference in the pricing model is decisive. Suppose a short 100ms workflow is invoked 1,000 times per second.

- **Standard**: an average of 5 state transitions per invocation × $0.025/1000 = $0.000125, and 1,000 per second = $0.125/second = $324K/month. Unrealistic.
- **Express**: $0.000001 per invocation + 100ms × 0.064 GB × $0.0000094/GB-s ≈ $0.0000016, and 1,000 per second = $4.1/month. Reasonable.

Conversely, a single one-year execution is nearly free on Standard, and impossible on Express because of the 5-minute limit. The product of **invocation frequency and execution time** decides which of the two is reasonable.

> 💡 **Related theory**: Exactly-once vs At-least-once is a core guarantee model of distributed systems. Representative work in this area includes Birman's **virtual synchrony** in 1987, Kafka's transactional messages in 2014, and Google's Pub/Sub exactly-once in 2016. Standard dedups by workflow execution ID and handles each state transition as a transaction, guaranteeing exactly-once. Express gives this up for performance, and the user takes responsibility for idempotency. On the exam, "an order-processing workflow where duplicate payments are absolutely forbidden" is Standard, and "IoT sensor data ETL where a little duplication is acceptable" is Express.

> 🎯 **Scenario**: "The deployment workflow averages 90 minutes, has a human approval step in the middle, and runs 100 times a day." The answer is **Standard**. 90 minutes exceeds the Express 5-minute limit, and human approval needs a TaskToken (not supported in Express). Conversely, "a synchronous response as an API Gateway backend, averaging 200ms, 500 calls per second" is **Express + StartSyncExecution**. The key keywords in exam scenarios are "execution time," "invocation frequency," "human involvement," and "synchronous vs asynchronous."

> The Express Workflow's internal implementation uses a different code path from Standard. Standard records every state transition in DynamoDB, while Express processes in memory and writes to CloudWatch Logs in a batch after it finishes. This is the cause of the difference in cost and performance. If a node fails midway through an Express execution, it is re-run from the beginning (the exact meaning of at-least-once). A nested pattern in which a Standard workflow calls an Express child workflow "contained" within it can combine the strengths of both models, and Distributed Map uses this pattern.

## The 8 State Types of ASL

ASL is a DSL that expresses a functional state machine in JSON. Every workflow is a combination of 8 state types.

```
Task        Executes actual work (Lambda, AWS SDK, ECS, EMR, Glue ...)
Choice      Conditional branching (if-else / switch)
Parallel    Runs several branches at once + proceeds when all finish
Map         Iterates per array element (serial or parallel)
Wait        Waits for a duration/time (up to 1 year)
Pass        Data transformation only, no work
Succeed     Ends the workflow successfully
Fail        Ends the workflow with failure (includes Error information)
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

This example contains every pattern of ASL. **Retry** does backoff retries on transient errors, **Choice** branches, **Parallel** handles payment and inventory at the same time, and **Catch** runs a compensating transaction on failure. Writing the same logic directly in Lambda would require 5 functions + a message queue + a DynamoDB state table, while ASL finishes it in one JSON.

> The Saga pattern is a distributed transaction model proposed in the 1987 paper "Sagas" by Hector Garcia-Molina and Kenneth Salem. Because it is hard to implement ACID atomicity in a distributed environment, a series of operations and a **compensating transaction** for each operation are defined as pairs, and on failure the compensations run in reverse order. Step Functions' `Parallel` + `Catch` + compensating Lambda pattern is exactly a Saga implementation. It is the standard solution for multi-service transactions such as payment, order, and inventory in a microservice architecture.

## AWS SDK Service Integration: Direct Integration Without Lambda

The AWS SDK Service Integration, released in September 2021, was a game changer for Step Functions. It allows **direct calls to more than 200 AWS services without Lambda**.

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

The `.sync` suffix waits until the operation completes (polling is automatic). `.waitForTaskToken` is the external callback pattern. With no suffix, it is fire-and-forget.

> In 2021, a media company ran a video transcoding workflow with Step Functions + 12 Lambda functions. After the SDK Integration was released, they replaced 9 of the 12 Lambdas with direct integrations: the workflow definition shrank to a third, cold starts disappeared, and P99 latency dropped from 18 seconds to 4 seconds. The burden of maintaining Lambda code also went away. On the exam, a scenario where "many functions only call other services, making operations complicated" has SDK Integration as the answer.

> ⚠️ **Trap**: The IAM for an SDK Integration must be held by the State Machine's execution Role. To call `arn:aws:states:::aws-sdk:cloudformation:createStack`, the Role must have the `cloudformation:CreateStack` permission. AWS does not grant permissions automatically, so they must be stated in the Role policy. CDK's `tasks.CallAwsService` takes `iamResources`/`iamAction` and synthesizes the permissions automatically, but they are easy to forget when writing ASL JSON directly.

## TaskToken: An Elegant Pattern for External System Callbacks

The key feature that sets Step Functions apart from other workflow engines (Airflow, Argo) is the **TaskToken** mechanism. It pauses the workflow and waits for a response from an external system (a person or another service).

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
2. A message is published to the SNS Topic (including the taskToken)
3. The workflow pauses (state is RUNNING, cost is nearly 0)
4. An external system (Lambda -> Slack -> a person) receives the token
5. The person clicks "Approve" in Slack -> Lambda is invoked
6. Lambda calls SendTaskSuccess(taskToken, output) or SendTaskFailure(taskToken, error)
7. Step Functions wakes up immediately and proceeds to the next state
8. If there is no response within 1 year, TimeoutSeconds fires
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

> A TaskToken is a cryptographic random string, mapped to a workflow execution instance inside the Step Functions service. An external system holding the token gains the ability to "wake the Nth state of this workflow," so it is effectively a **capability-based security** pattern (Henry Levy, 1984). A token that has been used once cannot be reused, and if the token is lost the workflow waits until the timeout. The cost of waiting a year is nearly 0 (Standard pricing is per state transition, not per waiting time). This is the structural reason Step Functions suits human-in-the-loop workflows better than Airflow.

> 🎯 **Scenario**: "A 3-stage review workflow for production deployment: security team approval -> DevOps team approval -> automatic deployment. Each stage is notified by a Slack message, and if there is no response within 7 days it is automatically cancelled." The answer is a Standard Workflow + `.waitForTaskToken` 3 times + `TimeoutSeconds: 604800`. Slack messages are sent through an SNS Topic or EventBridge. The external approval-handling Lambda calls `SendTaskSuccess/Failure`. Compared with CodePipeline's ManualApprovalAction, Step Functions can express far more flexible notification channels and approval workflows.

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

Retry policies are evaluated in order, and the first matching policy is applied. The backoff formula is `interval × backoffRate^(attempt-1)` + jitter. With `BackoffRate: 2.0` and `IntervalSeconds: 2`, the delays are 2 -> 4 -> 8 -> 16 -> 32 -> 64 seconds.

Catch matches after all Retries have failed. `States.ALL` is every error, `Lambda.Unknown` is a timeout, and a custom error is the error name thrown from the Lambda function.

> Exponential backoff + jitter was standardized by Lamport's 1995 distributed systems paper and the 2015 AWS Architecture Blog post "Exponential Backoff And Jitter." If every client uses the same backoff formula without jitter, retries synchronize and bursts hit the backend repeatedly (the thundering herd). Full jitter spreads them out with `random(0, interval × backoffRate^attempt)`. ASL supports this natively with `JitterStrategy: "FULL"` (2023+). On the exam, the solution to "DynamoDB throttle -> retry burst" is backoff + jitter.

## Distributed Map: 10,000+ Concurrent Executions

Distributed Map, released in December 2022, breaks the limit of the existing Map (40 concurrent). It supports **up to 10,000 concurrent executions** with processing by child workflows.

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

- **ItemReader**: a variety of sources, such as an S3 object list, the contents of S3 CSV/JSON Lines files, DynamoDB Scan, and Manifest
- **ItemBatcher**: bundles several items into one child workflow to improve efficiency
- **Mode: DISTRIBUTED**: separates child workflows into their own SF executions (the existing Inline Mode runs inside the parent)
- **ExecutionType: EXPRESS**: the children are Express, so they are short and cheap
- **ToleratedFailurePercentage**: tolerates up to 5% failures, and the parent fails if exceeded
- **ResultWriter**: automatically saves the results to S3

> In 2023, an advertising company was running an ETL that processed 50 million click events per day from S3 on a Spark cluster. Burdened by the cost and complexity of operating the Spark cluster, they switched to Distributed Map + Lambda: the cluster disappeared, cost fell by 60%, and processing time stayed similar. The keys were (1) Distributed Map automatically splits the 50 million objects, (2) ToleratedFailurePercentage of 1% allows partial failure, and (3) 10,000 concurrent Lambda executions secure throughput. On the exam, "processing tens of millions of objects + tolerating partial failure" is Distributed Map.

> The architectural difference between Inline Map and Distributed Map: Inline is processed synchronously inside the parent workflow and thus affects the parent's state transition limit (execution history of 25,000). In Distributed, each iteration is a separate child execution (Standard or Express), so the parent tracks only the child execution IDs. That is, the parent holds only meta information such as "10,000 children launched and 9,990 succeeded." As a result, the parent history stays small and concurrency scales out to the child pool. This became possible because in 2022 SF separated child executions into a separate pricing unit.

## Multi-Region Sequential Deployment Workflow

A representative Step Functions scenario from the DOP exam.

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

The value of this structure is that every branch, wait, and rollback is **expressed explicitly in one JSON**. Writing the same logic in Lambda would need over 200 lines for a DynamoDB state table + step tracking + error handling + guaranteed rollback ordering, and debugging would be nearly impossible.

> 🎯 **Scenario**: "Deploy in the order us-east-1 -> eu-west-1 -> ap-northeast-2, monitor each region for 30 minutes, and if an alarm fires, roll back all regions deployed up to that point in reverse order." The answer is the structure above plus the AP region. The components are (1) the Wait + Choice pattern, (2) accumulating each region's deploymentId with ResultPath, and (3) triggering the reverse-order rollback with Catch. Similar scenarios may be asked.

## CDK + Step Functions: Type-Safe Workflows

When you write ASL JSON directly, typos, syntax errors, and broken references cannot be caught at compile time. CDK solves this with the TypeScript type system.

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

CDK automatically tracks the IAM permissions (`iamAction`/`iamResources`) and synthesizes the ASL JSON. TypeScript's type system catches wrong state references, missing next transitions, and similar mistakes at compile time.

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

If you set the API Gateway integration type to **AWS service integration** instead of `AWS_PROXY` and specify the target as `arn:aws:apigateway:ap-northeast-2:states:action/StartSyncExecution`, a synchronous API -> SF call becomes possible. A workflow that completes within 5 minutes can then serve as a REST API backend.

> 🎯 **Scenario**: "Payment processing consists of 4 stages (validation, authentication, charge, and recording), each a separate microservice. The API needs a synchronous response." The answer is Express + StartSyncExecution. Compared with coding 4 calls inline in a single Lambda function, workflow visualization, retries, and error handling come automatically.

## Summary

We saw five pictures today. First, **Standard vs Express is decided by the product of invocation frequency × execution time**: long + infrequent is Standard, short + frequent is Express. Second, **the 8 ASL state types** (Task/Choice/Parallel/Map/Wait/Pass/Succeed/Fail) combine to express any workflow. Third, **AWS SDK Service Integration** calls 200+ services directly without Lambda. Fourth, **TaskToken** (`.waitForTaskToken`) integrates external systems and human involvement in a capability-based way. Fifth, **Distributed Map** handles 10,000 concurrent child workflows with tolerance for partial failure.

In the next post, we wrap up the week by combining SAM, CDK, Lambda, and Step Functions into integrated scenarios. Real exam questions weave several services into a single question, so accurately matching each service's strengths, weaknesses, and combination patterns is the key to passing.

---

## 📝 Practice Questions

**Question 1.** If Lambda calls several AWS services and is slow, how do you identify the bottleneck?

A) Search manually in the Lambda logs  
B) Check only Duration in CloudWatch metrics  
C) Visualize the latency of each service with X-Ray  
D) Migrate all services to EC2  

**Answer: C**
Explanation: X-Ray shows the exact latency of each AWS service call through distributed tracing. You can immediately identify which of S3, DynamoDB, or Secrets Manager is slow.

---

**Question 2.** How do you send an automatic alert when the error rate of a Lambda function rises from 5% to 10%?

A) Use only a CloudWatch Logs subscription filter  
B) Monitor the Errors/Invocations ratio with a CloudWatch metric alarm  
C) Inspect the logs manually  
D) Disable Lambda  

**Answer: B**
Explanation: A CloudWatch metric alarm triggers automatically when the error rate exceeds the threshold. The notification is delivered through SNS or Lambda.

---

**Question 3.** How do you identify the cause of high Lambda function costs?

A) Check the AWS Billing console  
B) Analyze Invocations, Duration, and Memory with CloudWatch Logs Insights, then verify with Cost Explorer  
C) Guess  
D) Delete Lambda  

**Answer: B**
Explanation: Identify the cost drivers using statistics on Invocations, Duration, and Memory usage. Duration alone is enough to calculate MB-seconds. Then establish a cost optimization strategy.

---

**Question 4.** What is the most accurate description of the essential difference between Standard and Express workflows?

A) Standard: up to 1 year, exactly-once, billed per state transition; Express: 5 minutes, at-least-once, billed per invocation + execution time
B) The same engine, only the price differs
C) Express can handle human approval
D) Standard supports only synchronous invocation

**Answer: A**
Explanation: The difference in pricing model is decisive. For short, high-frequency workloads (IoT, API backends), Standard causes costs to explode and Express is reasonable. For long, low-frequency workloads (deployments, including human approval), Express would violate the 5-minute limit and Standard is suitable. Exactly-once vs. at-least-once is decisive in scenarios such as payments where duplicates are forbidden. C is reversed (Express does not support TaskToken), and D is reversed (Standard is asynchronous only).

---

**Question 5.** What is the standard pattern in Step Functions for waiting for a response from an external system (a Slack bot, human approval)?

A) Wait state + polling
B) The `.waitForTaskToken` integration pattern + the external system calls SendTaskSuccess/Failure
C) Infinite Lambda polling
D) Repeating a Choice state

**Answer: B**
Explanation: TaskToken is an implementation of the capability-based security pattern (Henry Levy, 1984). SF issues a token and pauses the workflow (cost is nearly zero); when the external system calls SendTaskSuccess(output) or SendTaskFailure(error) with the token, the workflow resumes immediately. It can wait up to 1 year, and TimeoutSeconds can end it automatically. A is inefficient, C makes costs explode, and D means something different. On the exam, "human approval" and "external system response" are almost always TaskToken.

---

**Question 6.** A workflow has many nodes that only invoke Lambda, and operational complexity is high. What is the most effective improvement?

A) Change all the Lambda functions to ECS tasks
B) Call 200+ services directly with AWS SDK service integrations (`arn:aws:states:::aws-sdk:<service>:<action>`) — remove Lambda
C) Change Standard to Express
D) Replace Step Functions with EventBridge

**Answer: B**
Explanation: The AWS SDK service integration, launched in 2021, removes the pattern of creating a Lambda function just to make a single SDK call. ASL can directly call more than 200 AWS services such as CloudFormation, CodeDeploy, DynamoDB, S3, and SNS. As in a media company case, reducing 12 Lambda functions to 3 eliminated cold starts and shortened P99 latency. IAM permissions must be stated explicitly on the state machine execution role. A is more complex, C is unrelated, and D is wrong because EventBridge handles only simple flows.

---

**Question 7.** You must ETL 50 million S3 objects while tolerating a 1% failure rate. What is the most suitable pattern?

A) Standard Map (40 concurrent limit)
B) Distributed Map + ItemReader: S3 listObjectsV2 + ProcessorConfig: DISTRIBUTED/EXPRESS + ToleratedFailurePercentage: 1
C) EventBridge → 50 million Lambda invocations
D) 50 million ECS Fargate tasks

**Answer: B**
Explanation: Distributed Map (2022) is the exact answer. ItemReader automatically splits the S3 objects, ItemBatcher groups them efficiently, child workflows run as Express to be short and cheap, MaxConcurrency goes up to 10,000, and ToleratedFailurePercentage tolerates partial failure. As in an advertising company case, it can replace a Spark cluster. A is impossible for 50 million because of the concurrency limit of 40, C causes throttling and cost explosion, and D has high operational burden and startup latency.

---

**Question 8.** What is the backoff calculation formula for an ASL Retry?

A) A constant interval every time
B) `interval × backoffRate^(attempt-1)` + optional jitter; moves to Catch when MaxAttempts is exceeded
C) Infinite retries
D) Automatically moves to the Lambda DLQ

**Answer: B**
Explanation: Exponential backoff plus jitter is the standard for preventing a thundering herd (AWS Architecture Blog, 2015). For example, with `IntervalSeconds: 2, BackoffRate: 2.0, MaxAttempts: 6`, the intervals are 2 → 4 → 8 → 16 → 32 → 64 seconds. Turning on `JitterStrategy: FULL` (2023+) adds random spread to each interval. When all Retry policies fail, the Catch block receives it and branches. A is simply wrong, C is wrong because a limit always exists, and D is wrong because the SQS DLQ is a separate mechanism.

---

**Question 9.** "For a production deployment, a three-step approval of the security team → the DevOps team → automatic deployment, with a 7-day timeout at each step and a Slack notification." What is a suitable workflow design?

A) Three CodePipeline ManualApprovalActions
B) Standard workflow + `.waitForTaskToken` three times + SNS→Slack notification + TimeoutSeconds: 604800
C) Express workflow
D) EventBridge Schedule

**Answer: B**
Explanation: Only Standard supports TaskToken; Express does not. A 7-day timeout is a strength of Standard (it violates Express's 5-minute limit). Approval is done with a Slack interactive message → Lambda → SendTaskSuccess(token, output). CodePipeline ManualApprovalAction (A) can also do human approval, but (1) the Slack notification and authentication flow is complex, (2) the 7-day wait cost and UX are unsuitable, and (3) branching and rollback are weaker than in SF. SF expresses notification and approval workflows more flexibly.

---

**Question 10.** Multi-step business logic with an average 300 ms synchronous response is needed as an API Gateway backend. What is a suitable pattern?

A) Standard workflow + StartExecution
B) Express workflow + StartSyncExecution + API Gateway AWS service integration
C) Inline all the logic in one Lambda function
D) Step Functions is not suitable

**Answer: B**
Explanation: Express + StartSyncExecution (2019) is the standard synchronous workflow pattern. When multi-step logic that finishes within 5 minutes (validation → authentication → processing → recording) is expressed as a workflow, visualization, retries, and error handling are automatic. Standard is asynchronous only and unsuitable for an API backend (A). Inlining in Lambda (C) is fine for simple cases but lacks multi-step handling, retries, and visualization. D says SF is not suitable, but SF is exactly the answer to this scenario.

---

**Question 11.** In a multi-Region deployment (USE1 → EUW1 → APN2), when the alarm at the EUW1 stage fires, the Regions deployed so far must be rolled back in reverse order. How is this expressed in ASL?

A) Use a Retry block
B) Accumulate deploymentIds with a ResultPath for each Region + check the alarm with a Choice + on failure chain RollbackEUW1 → RollbackUSE1 in order
C) Use Parallel
D) Use Map

**Answer: B**
Explanation: Sequential multi-Region deployment with reverse-order rollback is a classic Step Functions pattern. Accumulate the deploymentId in each DeployTask's `ResultPath: $.use1Deploy` style, and branch from the Choice into the Rollback chain when the alarm fires. Rollback is a reverse-order chain (`Next: RollbackUSE1`). Parallel (C) runs concurrently, so it does not guarantee sequence; Map (D) is for repeating the same task and unsuitable; Retry (A) retries a single task. This is one of the most frequently tested SF patterns on the exam.
