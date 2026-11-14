# Day 4 - Final Review 4: Messaging, Containers, Architecture Patterns

📅 Date: August 12, 2026 (Wednesday)  
🎯 Topic: Final Review of Messaging/Containers + Architecture Patterns  
⏱️ Study Time: Approximately 120 minutes

---

## 🎯 Learning Objectives

- Do a final consolidation of the essentials of messaging, containers, and architecture patterns
- Work through scenario-based architecture selection questions

---

## 📖 Core Memorization Tables

### Messaging Service Selection Guide
```
SQS Standard: high throughput, no ordering/duplicate guarantee
SQS FIFO: ordering guaranteed, deduplication, 300 per second
SNS: Push, many subscribers at once, fan-out pattern
Kinesis Streams: real-time streaming, multiple Consumers, 24-hour retention
Kinesis Firehose: ETL, S3/Redshift/OpenSearch, 1-minute delay
Step Functions: workflow orchestration, retry/parallel
AppSync: GraphQL, real-time subscriptions, offline support
```

### Key Numbers
```
SQS: 1MiB (raised from 256KB in August 2025), 14 days, FIFO 300/s, VisibilityTimeout 30 seconds
Kinesis: shard 1MB/s write, 2MB/s read, 24-hour default retention
SNS: multiple subscription targets, Push method
```

### Containers/IaC Key Memorization
```
ECS Fargate: serverless, awsvpc mode
executionRole: ECR pull, CloudWatch Logs
taskRole: access to AWS services from the container
ECR: vulnerability scanning, lifecycle policies
CloudFormation: Change Set (review), !ImportValue (cross-stack)
SAM: Transform required, sam local (needs Docker)
CDK: programming language → converted to CloudFormation
```

---

## Architecture Patterns Summary

```
Pattern 1: Serverless REST API
================================
[Client] → [API Gateway] → [Lambda] → [DynamoDB]
                                        ↘ [ElastiCache]
Authentication: Cognito Authorizer

Pattern 2: Event-driven asynchronous processing
================================
[Service A] → [SQS] → [Lambda B]
                  ↘ (on failure) [DLQ]

Pattern 3: Fan-out
================================
[S3 upload] → [SNS] → [SQS1] → [Lambda: resize]
                    → [SQS2] → [Lambda: analysis]
                    → [Lambda: notification]

Pattern 4: Streaming pipeline
================================
[Data source] → [Kinesis Streams] → [Lambda: real-time]
                                  → [Firehose] → [S3]

Pattern 5: Full CI/CD
================================
[Git Push] → [CodePipeline]
  → [CodeBuild: test/build]
  → [Manual Approval]
  → [CodeDeploy: deploy]
     (Canary for Lambda, Blue/Green for EC2)
```

---

## 🧠 Scenario → Answer Mapping (Core Exam Patterns)

### Messaging Scenario → Service

| Scenario | Answer |
|----------|-----|
| "Asynchronous job queue, decoupling" | **SQS Standard** |
| "Exactly once, ordering" | **SQS FIFO** |
| "Notify multiple systems at once" | **SNS** |
| "S3 → multiple Lambdas" | **SNS fan-out** or **EventBridge** |
| "Collect a real-time clickstream" | **Kinesis Data Streams** |
| "Stream → S3 automatically" | **Kinesis Firehose** |
| "Kafka compatible" | **MSK** |
| "Complex multi-step workflow" | **Step Functions Standard** |
| "Fast workflow within 5 minutes" | **Step Functions Express** |
| "GraphQL + real-time subscriptions" | **AppSync** |
| "1-year workflow" | **Step Functions Standard** |
| "Wait for an external system's response" | **.waitForTaskToken** |
| "Keep Kinesis data for 365 days" | Retention setting or Firehose → S3 |
| "Lambda idempotent processing" | DDB idempotency or SQS FIFO dedup |

### Container and IaC Scenarios

| Scenario | Answer |
|----------|-----|
| "Containers without EC2" | **Fargate** |
| "Cost-saving containers" | **Fargate Spot** |
| "Kubernetes standard" | **EKS** |
| "On-premises ECS" | **ECS Anywhere** |
| "ECS → S3 permission" | **taskRole** |
| "ECR pull permission" | **executionRole** |
| "Safe CFN update" | **Change Set** |
| "Protect a CFN resource" | **DeletionPolicy: Retain** |
| "Multi-account IaC deployment" | **Stack Set** |
| "Reusable CFN" | **Nested Stack** |
| "Serverless SAM local" | `sam local invoke` + Docker |
| "IaC in a programming language" | **CDK** |
| "Lambda Canary deployment" | **CodeDeploy + SAM/CodePipeline** |

### Data and DB Scenarios

| Scenario | Answer |
|----------|-----|
| "Relational + automatically rotated password" | RDS + Secrets Manager |
| "NoSQL + microsecond cache" | DynamoDB + **DAX** |
| "Share files across many EC2 instances" | **EFS** |
| "High-performance temporary disk" | Instance store |
| "Global active-active DB" | **Aurora Global** or **DDB Global Tables** |
| "Automatically detect PII in S3" | **Macie** |
| "Bulk operation on 100 million objects" | S3 Batch Operations |
| "Clean up old S3 objects" | Lifecycle Policy |
| "CRR + KMS" | **Multi-Region Key** |
| "One original, various views" | **S3 Object Lambda** |
| "Different permissions for multiple teams" | **S3 Access Points** |

### Security Scenarios

| Scenario | Answer |
|----------|-----|
| "Automatic DB password rotation" | **Secrets Manager** |
| "KMS-encrypt 100KB of data" | **Envelope Encryption** |
| "Automatic JWT validation (REST API)" | **Cognito Authorizer** |
| "Automatic JWT validation (HTTP API)" | **JWT Authorizer** |
| "External JWT (Auth0/Okta)" | **Lambda Authorizer** or JWT Authorizer (HTTP API) |
| "Defend against SQL injection" | **WAF** |
| "DDoS cost protection" | **Shield Advanced** |
| "Force HTTPS on S3" | Deny on `aws:SecureTransport=false` |
| "SSL certificate directly on EC2" | ACM not possible — external certificate |
| "Multi-account guardrails" | **SCP (Organizations)** |
| "Maximum permissions that can be delegated to a user" | **Permissions Boundary** |
| "Prevent Confused Deputy" | **ExternalId** |

### Monitoring and Debugging Scenarios

| Scenario | Answer |
|----------|-----|
| "Which service is slow" | **X-Ray** |
| "Analyze slow queries" | **Performance Insights** (RDS) |
| "EC2 memory monitoring" | **CloudWatch Agent** |
| "Detect a root login immediately" | CloudTrail → EventBridge → SNS |
| "Monitor API availability 24/7" | **Synthetics** |
| "Log pattern → alarm" | **Metric Filter** |
| "ML-based anomaly detection" | **Anomaly Detection** |
| "Unified dashboard across accounts" | **Cross-Account Dashboard** |
| "If the gap between API GW Latency and IntegrationLatency is large?" | Latency in API GW itself |

### Cost Optimization Scenarios

| Scenario | Answer |
|----------|-----|
| "Predictable EC2" | **Reserved** or **Savings Plan** |
| "Fault tolerant + 90% savings" | **Spot** |
| "ARM compatible + 40% savings" | **Graviton** |
| "SSE-KMS cost rising" | **S3 Bucket Key** |
| "DDB throttle + cost savings" | **DAX** + appropriate RCU |
| "Free Lambda cold start" | **SnapStart** (no extra cost for Java) |
| "API GW cost savings" | **HTTP API** |
| "S3 accessed very rarely" | **Glacier Deep Archive** |
| "Low EBS usage but keep the data" | **gp3** (20% lower than gp2) |

---

## 📬 The Single Axis That Separates the Four Messaging Services: Does a Message Disappear Once Consumed?

If you memorize SQS, SNS, Kinesis, and EventBridge by their service descriptions, you will keep wavering in scenarios. The axis that separates all four services at once is **"after consumption, does the message disappear or remain?"**

```
[Disappears when consumed — work queue model]
  SQS  ─ A worker receives and processes it, then DeleteMessage → that message is finished
         · Multiple workers share the messages (load balancing)
         · Two systems cannot each process the same message

[A copy goes to every subscriber — publish/subscribe model]
  SNS  ─ Publish once → push to all subscribers (fan-out)
         · If a subscriber isn't there at that moment, that copy disappears (no replay)
         · So the combination of receiving through SNS → SQS is standard

[Remains and can be re-read any number of times — log/stream model]
  Kinesis ─ Records stay in the stream for the retention period (24h~365d)
         · Multiple Consumers consume independently, each at its own position (checkpoint)
         · The same data can be processed both in real time and re-processed in batch

[Routes by rules — event bus model]
  EventBridge ─ Matches event content against rules and delivers to multiple targets
         · AWS service events, SaaS, and custom events on one bus
         · Supports a schema registry, archive, and replay
```

This one axis splits most scenarios. If "**multiple teams each process the same data, and it must be possible to replay it later**," it's Kinesis (SQS is wrong because messages vanish once consumed). If "**one event must wake up 3 systems at the same time**," it's SNS fan-out or EventBridge. If "**work is deferred and workers process it slowly**," it's SQS.

| Item | SQS Standard | SQS FIFO | SNS | Kinesis Data Streams |
|------|-------------|----------|-----|---------------------|
| Model | Work queue | Ordered work queue | Publish/subscribe | Stream (log) |
| Ordering | Not guaranteed | **Guaranteed per message group** | Not guaranteed | **Guaranteed per partition key** |
| Duplicates | At least once (duplicates possible) | Deduplication within a 5-minute window | At least once | Duplicates possible on reprocessing |
| Throughput | Practically unlimited | 300/s without batching, 3,000/s with batches of 10 | Very high | **1MB/s and 1,000 records/s per shard** |
| Retention | 4 days by default, up to **14 days** | Same | None (delivered immediately) | 24 hours to **365 days** |
| Reprocessing | Not possible (finished once deleted) | Not possible | Not possible | **Possible** (repeated reads) |
| Consumers | Share the messages | Share the messages | Each gets a copy | Each at an independent position |

This classification is exactly the classic distinction in messaging middleware between the **queue and the log**. A queue is "a device that hands out work," so consumption means deletion, whereas a log is "a ledger that writes down what happened in order," so reading doesn't erase it and only the position each reader has read up to differs. The reason Kafka changed the world with the log model is exactly this replayability — attaching a new consumer and re-reading from the past becomes natural. On AWS, Kinesis fills that spot, and if you need Kafka itself, MSK is the answer. The moment the words "reprocessing" or "multiple consumers" appear in a question, the queue family drops out of the candidates.

### SQS in Code: The Pitfall of Partial Batch Failure

A typical incident when Lambda consumes SQS is that **only 1 of 10 messages in a batch fails, yet all 10 come back**. The 9 that succeeded are processed again, creating duplicates.

```python
def handler(event, context):
    """Handler when the SQS event source mapping + ReportBatchItemFailures is configured."""
    failures = []

    for record in event["Records"]:
        try:
            process(json.loads(record["body"]))
        except Exception as e:
            print(f"failed messageId={record['messageId']}: {e}")
            failures.append({"itemIdentifier": record["messageId"]})  # only this one is sent back

    # If you return only the failed message IDs, the rest are deleted from the queue
    return {"batchItemFailures": failures}
```

```bash
# Turn on partial batch failure reporting for the event source mapping
aws lambda update-event-source-mapping \
  --uuid 12345678-90ab-cdef-1234-567890abcdef \
  --function-response-types ReportBatchItemFailures

# Attach a DLQ: after 3 failures, isolate to a separate queue
aws sqs set-queue-attributes --queue-url "$MAIN_QUEUE_URL" \
  --attributes '{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"arn:aws:sqs:ap-northeast-2:123456789012:orders-dlq\",\"maxReceiveCount\":\"3\"}",
    "VisibilityTimeout": "180",
    "ReceiveMessageWaitTimeSeconds": "20"
  }'
```

> ⚠️ **Pitfall**: **If the Visibility Timeout is shorter than the Lambda timeout**, a message still being processed reappears in the queue and a second worker starts the same job. Incidents like a payment being made twice come from here. The AWS recommendation is to set the **queue's visibility timeout to at least 6 times the function timeout**. And **long polling**, setting `ReceiveMessageWaitTimeSeconds` to 20, is the basic setting that reduces request cost for empty responses, but the default is 0 (short polling), so unless you turn it on explicitly, money simply leaks out.

### SNS Filter Policies — Fan-out Without Waste

In fan-out, not every subscriber needs to receive every message. If you attach a **filter policy** to each subscription, SNS filters on its side — it never creates unnecessary Lambda invocations or SQS storage, so cost and load drop together.

```json
// Subscription filter policy: only high-value orders from the Korea region go to this subscription
{
  "eventType": ["order.created"],
  "region": ["KR"],
  "amount": [{ "numeric": [">=", 1000000] }]
}
```

```
[Order service] ──publish──▶ ( SNS topic: order-events )
                                │
        ┌───────────────────────┼───────────────────────┐
        │ filter: amount>=1M     │ filter: eventType=*    │ filter: region=KR
        ▼                       ▼                        ▼
   [SQS: review queue]     [SQS: analytics queue]    [Lambda: notification]
        │                       │
   [Lambda: manual review] [Firehose → S3]
        │
   [SQS DLQ] ← isolated after 3 failures
```

This shape, **placing SQS in the middle** instead of connecting SNS directly to Lambda, is the basic form in practice. There are three reasons — (1) even if a consumer dies briefly, messages pile up in the queue and are not lost, (2) the consumer can set its own consumption speed so downstream systems are not overwhelmed (backpressure), and (3) there is a place to isolate failures with a DLQ.

---

## 🔁 Step Functions: Declaring Retries and Compensation

For jobs that chain multiple steps, a structure where "Lambda calls Lambda directly" is a wrong answer on the exam. You have to build error handling, retries, timeouts, and state tracking all by hand, and a synchronous call chain is tied to the timeout of the front end. The right answer is to move orchestration into a declaration.

```json
{
  "Comment": "Order processing workflow",
  "StartAt": "ChargePayment",
  "States": {
    "ChargePayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:ap-northeast-2:123456789012:function:charge",
      "TimeoutSeconds": 30,
      "Retry": [
        {
          "ErrorEquals": ["States.Timeout", "Lambda.ServiceException", "Lambda.TooManyRequestsException"],
          "IntervalSeconds": 2,
          "MaxAttempts": 3,
          "BackoffRate": 2.0
        }
      ],
      "Catch": [
        { "ErrorEquals": ["States.ALL"], "Next": "RefundAndFail" }
      ],
      "Next": "FanOutTasks"
    },
    "FanOutTasks": {
      "Type": "Parallel",
      "Branches": [
        { "StartAt": "SendEmail",     "States": { "SendEmail":     { "Type": "Task", "Resource": "arn:aws:states:::sns:publish", "Parameters": { "TopicArn": "arn:aws:sns:ap-northeast-2:123456789012:mail", "Message.$": "$.orderId" }, "End": true } } },
        { "StartAt": "UpdateStock",   "States": { "UpdateStock":   { "Type": "Task", "Resource": "arn:aws:lambda:ap-northeast-2:123456789012:function:stock", "End": true } } }
      ],
      "Next": "Done"
    },
    "RefundAndFail": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:ap-northeast-2:123456789012:function:refund",
      "Next": "Failed"
    },
    "Failed": { "Type": "Fail", "Error": "OrderFailed" },
    "Done":   { "Type": "Succeed" }
  }
}
```

The `IntervalSeconds` and `BackoffRate` of `Retry` express **exponential backoff** as a declaration, and `Catch` is the skeleton of the **Saga pattern**, routing a failure to a compensation step (`RefundAndFail`). This logic, which would take dozens of lines if written in code, fitting inside the state definition is the reason Step Functions exists.

| Category | Standard | Express |
|------|----------|---------|
| Maximum execution time | **Up to 1 year** | **Up to 5 minutes** |
| Execution semantics | Exactly-once execution | At-least-once (duplicates possible) |
| History | Execution history recorded in the service | Recorded to CloudWatch Logs |
| Billing | Number of state transitions | Number of executions, duration, memory |
| Suited for | Human approval, long-running jobs, audit needs | High-frequency, short event processing |

| State type | Role |
|----------|------|
| `Task` | The actual work (Lambda, SDK integration, service call) |
| `Choice` | Conditional branching |
| `Parallel` | Run a fixed number of branches concurrently |
| `Map` | **Repeat the same processing for each array element** (dynamic count) |
| `Wait` | Wait until a specified time or timestamp |
| `Succeed` / `Fail` | Termination |

For workflows that must wait days for an external system's response, the `.waitForTaskToken` integration is the answer. The state **issues a token and simply stops**, and it flows again when the external system returns that token with `SendTaskSuccess`/`SendTaskFailure`. No polling loop and no waiting Lambda are needed, and since there are no state transitions while waiting, there is almost no billing either. When sentences like "wait 3 days for administrator approval" or "wait for the payment provider's webhook" appear, think of this pattern. The idea of not implementing the wait itself as computation is a core habit of serverless design.

---

## 📦 Containers and IaC: Permission Timing and Declarative Safeguards

On ECS, the criterion that separates the two roles is **timing**.

```
     [ Task start ]                       [ Task running ]
          │                                     │
   uses executionRole                     uses taskRole
   · pull image from ECR                   · DynamoDB read/write
   · create CloudWatch Logs stream         · S3 upload
   · inject values from Secrets Manager    · SQS polling
          │                                     │
   if it fails → "the task doesn't even start"  if it fails → "AccessDenied in the app log"
```

If you trace back from the symptom, there's no room for confusion. **If the container can't come up, it's executionRole; if it comes up and runs but is denied, it's taskRole.**

```json
// Task definition excerpt — the two roles sit side by side
{
  "family": "orders-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512", "memory": "1024",
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789012:role/ordersAppRole",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders:1.4.2",
      "portMappings": [{ "containerPort": 8080 }],
      "secrets": [
        { "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:prod/orders/db" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": { "awslogs-group": "/ecs/orders", "awslogs-region": "ap-northeast-2", "awslogs-stream-prefix": "api" }
      }
    }
  ]
}
```

What the exam asks about repeatedly on the IaC side are the **"safeguards that make it possible to undo a mistake."**

```yaml
# SAM template — without Transform it is interpreted as plain CloudFormation and fails
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  OrdersTable:
    Type: AWS::DynamoDB::Table
    DeletionPolicy: Retain          # Keep the table even if the stack is deleted
    UpdateReplacePolicy: Retain
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions: [{ AttributeName: PK, AttributeType: S }]
      KeySchema: [{ AttributeName: PK, KeyType: HASH }]

  OrdersApi:
    Type: AWS::Serverless::Function
    DependsOn: OrdersTable           # Explicitly force the creation order
    Properties:
      Runtime: python3.12
      Handler: app.handler
      AutoPublishAlias: prod         # New version on each deployment + move the alias
      DeploymentPreference:
        Type: Canary10Percent5Minutes   # Watch at 10% for 5 minutes, then shift
        Alarms: [!Ref ErrorAlarm]       # Automatic rollback if the alarm fires
      Environment:
        Variables:
          TABLE_NAME: !Ref OrdersTable
      Policies:
        - DynamoDBCrudPolicy: { TableName: !Ref OrdersTable }

Outputs:
  TableName:
    Value: !Ref OrdersTable
    Export:
      Name: orders-table-name       # Referenced from other stacks with !ImportValue
```

| Safeguard | Incident it prevents |
|---------|--------------|
| **Change Set** | Executing an update without knowing what it changes (especially resource replacement) |
| **DeletionPolicy: Retain / Snapshot** | Stack deletion wiping out even the production DB |
| **UpdateReplacePolicy** | A property change recreating the resource and losing data |
| **Stack Policy** | A specific resource being touched by an update |
| **Termination Protection** | Accidental deletion of the stack itself |
| **DependsOn** | Creation order tangling among resources with no reference relationship |
| **Nested Stack / Stack Set** | Template duplication, manual multi-account/multi-Region deployment |

> ⚠️ **Pitfall**: You must not treat `DeletionPolicy: Retain` and `Snapshot` as the same. **Retain leaves the resource as is** (charges continue afterward), while **Snapshot takes a snapshot and then deletes the original** (only for resources that support snapshots, such as RDS and EBS). Another easily confused point is that the return value of `!Ref` differs per resource — `!Ref` of a DynamoDB table returns the table name, of an S3 bucket the bucket name, and of an EC2 instance the instance ID. If you need the ARN, you must use `!GetAtt`, and this confusion is the cause of incidents where "the permission policy strangely doesn't take effect."

Pinning the image tag to `latest` in a container deployment causes operational incidents. If the task definition points at `:latest`, nobody can pin down "what is running right now," and only the newly launched tasks from a scale-out receive the new image, creating a situation where **two versions are mixed within the same service**. The remedy is (1) to pin the tag to a commit hash or a semantic version, and (2) to turn on ECR's **immutable tags** to block overwriting the same tag. Traceability of deployment is the same as the ability to roll back, and a deployment that can't be rolled back is effectively an experiment that can't be undone.

---

## Summary

Today's three topics are different answers to a single question: "**how do we loosely join components together?**"

- Messaging detaches them along the time axis (asynchrony, buffering).
- Step Functions takes control of the flow out of the code (declarative orchestration).
- Containers and IaC turn the execution environment and the infrastructure itself into versioned artifacts.

So the correct answer choices in this area have a consistent direction: **an intermediary over a direct call, a declared retry over a hand-built retry, the distinction between a queue that vanishes on consumption and a stream that can be re-read, and a deployment that can be undone at any time.** If you first find and mark words like "multiple consumers," "reprocessing," "ordering," "long wait," and "automatic rollback" in a scenario, the choices usually narrow down to one.

---

## 📝 Final Mock Exam - Part 4

**Question 1.** Collect click events from millions of users in real-time and analyze in multiple systems?

A) SQS  
B) SNS  
C) Kinesis Data Streams  
D) EventBridge  

**Answer: C** - Kinesis Data Streams supports high-volume real-time streaming with multiple simultaneous Consumers.

---

**Question 2.** Microservice A processes asynchronously without waiting for B's response?

A) Lambda A synchronously calls Lambda B  
B) Lambda A → SQS → Lambda B  
C) Direct API Gateway connection  
D) Data sharing through DynamoDB  

**Answer: B** - SQS async communication loosely couples services so Lambda A doesn't wait for response.

---

**Question 3.** ECS task retrieves password from Secrets Manager during execution?

A) Add permission to executionRoleArn  
B) Add permission to taskRoleArn  
C) Hardcode in environment variable  
D) Inject via CloudFormation parameter  

**Answer: B** - taskRole is for container app code to access AWS services.

---

**Question 4.** Process payment → send email → update inventory in sequence with retry on failure?

A) SQS chain  
B) Lambda chain (direct Lambda calls)  
C) Step Functions  
D) Kinesis  

**Answer: C** - Step Functions manages sequential execution, error handling, and auto-retry visually.

---

**Question 5.** Manage VPC separately and reference from other CloudFormation stacks?

A) Manually pass VPC ID as parameter  
B) Export from Outputs and reference with !ImportValue  
C) Include all in same stack  
D) Cross-stack reference not possible  

**Answer: B** - Export name in Outputs section, then !ImportValue in other stack.

---

**Question 6.** Handle S3 upload for image resize, metadata analysis, admin notification simultaneously?

A) Set S3 event directly to each Lambda  
B) S3 → SNS → multiple SQS → each Lambda  
C) S3 → Kinesis → Lambda  
D) S3 → EventBridge → 3 Lambda  

**Answer: B or D** - Fan-out pattern. Either SNS to multiple SQS (B) or EventBridge to multiple Lambda (D).

---

**Question 7.** Deploy new Beanstalk version without downtime, safest strategy?

A) All at once  
B) Rolling  
C) Immutable  
D) Blue/Green  

**Answer: C** - Immutable deploys new version to new ASG, validates, then swaps — safest.

---

**Question 8.** What is actually created when CDK app is deployed?

A) Terraform plan  
B) CloudFormation stack  
C) ECS task  
D) Lambda layer  

**Answer: B** - CDK converts code to CloudFormation template and creates CloudFormation stack on `cdk deploy`.

---

## 📌 Today's Summary

1. SQS (queue/async) vs SNS (fan-out/Push) vs Kinesis (streaming/multi-Consumer)
2. Step Functions: Complex workflows, retry, parallel, error handling
3. ECS: taskRole (app permission), executionRole (infrastructure permission)
4. CDK: Programming language → CloudFormation, cdk synth/deploy
5. Key Pattern: Fan-out (SNS→SQS), Async (SQS), Workflow (Step Functions)
