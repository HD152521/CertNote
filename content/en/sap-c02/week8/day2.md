# Day 2 - Step Functions: State Model of Distributed Workflows and Saga Pattern

When you first create one or two Lambda functions and use them, eventually the question arises: "I want to chain them in order, compensate on failure, and wait for external approval." Initially you might try to have one Lambda function call another. However, from that moment on, function chain timeout (15 minutes), visibility issues when failure occurs (not knowing which stage it stopped at), and maintenance problems from scattered retry and compensation logic all arise at once.

Step Functions solves all of these by "**making state machines into infrastructure**." Each step of a workflow becomes a state, and transitions are expressed in declarative JSON (ASL — Amazon States Language). AWS persistently stores that state, shows exactly which state it stopped at on failure, and executes compensation branches as a managed service. In SAP exams, when keywords like "long-running workflows", "Saga", "multi-service orchestration" appear, Step Functions is almost always the answer.

## Why Make State Machines into Infrastructure — The Essential Difficulty of Distributed Systems

Workflows that connect multiple microservices are fundamentally a **distributed transaction** problem. A sequence like Payment → Inventory Deduction → Shipment Booking should either have all steps succeed or all rollback. With a monolithic DB, it can be handled as a single transaction, but when each step spans different services (different DBs, different teams, different operational cycles), ACID models like 2PC (Two-Phase Commit) are impossible.

The solution is the **Saga** pattern proposed in Hector Garcia-Molina and Kenneth Salem's 1987 "Sagas" paper. The core idea:
1. Divide a distributed transaction into N small local transactions
2. Each local transaction has a compensating transaction (Compensating Transaction)
3. If any step fails, execute the compensating transactions of previous steps in reverse order

Saga accepts **eventual consistency** instead of ACID, gaining availability and scalability in return. The Catch + separate compensation branch pattern in Step Functions is exactly the code manifestation of Saga.

> 💡 **Related Theory**: Saga has two variants: **Orchestration-based** (central coordinator sequentially calls steps) and **Choreography-based** (services autonomously collaborate via events). Step Functions is a typical Orchestration model, while EventBridge-based is Choreography. Generally, simple flows of 5 steps or less suit Choreography's lightness, while 5+ steps or human approval flows excel at Orchestration's visibility and debugging. Chris Richardson's *Microservices Patterns* Chapter 4 is the most recommended reference.

> 🔍 **Deeper**: Step Functions internally implements as a **distributed durable state machine**. All state transitions are recorded in AWS's internal distributed KV and are recoverable. That is, even if one AZ goes down during workflow execution, another AZ will resume from exactly where it stopped. Users get this persistence for free. This model belongs to the same category as Microsoft's Durable Functions, Temporal.io (successor to Uber Cadence), and Netflix Conductor. The difference is that Step Functions is overwhelmingly superior in AWS service integration (200+ direct calls) and IAM integration.

## Standard vs Express — Different Price Models for the Same Abstraction

Step Functions uses the same ASL language but splits into two execution modes.

| Item | Standard | Express |
|------|----------|---------|
| Maximum execution time | 1 year | 5 minutes |
| Price model | **Per state transition** ($25/M transitions) | **Per invocation + execution time** (similar to Lambda) |
| Execution history retention | 90 days (all states preserved) | CloudWatch Logs only |
| Exactly once (at-most-once) | At-least-once + idempotent guarantee | Async: at-most-once / Sync: at-least-once |
| Use cases | Order processing, ETL, ML pipelines, human approval | IoT event processing, microservice one-shot, API backend |
| Visibility | Complete execution graph + state visualization in console | CloudWatch Logs-based (no execution graph) |

Express launched in 2019 and costs about 1/100th of Standard. It's tailored to patterns of short, fast workflows running very frequently. If you have 1000+ concurrent executions at once, use Express; if it's a multi-day long-running workflow, use Standard.

> ⚠️ **Pitfall**: "The cost efficiency of a single workflow is always better with Express" is a wrong answer. Express charges per invocation and per time, so **rarely executed but long-running workflows** end up costing more than Standard. The test scenario's two axes are: (1) Does the execution finish within 5 minutes? (2) Is the call frequency very high? If both yes, Express; otherwise, Standard.

> 📚 **Case Study**: In 2021, Coca-Cola's IoT pipeline processes thousands of events per second from vending machines (sales, inventory changes, temperature alerts). They started with Standard but state transition costs skyrocketed to tens of thousands of dollars per month, so they switched to Express and saved over 90%. AWS re:Invent 2022 presentation. The key lesson is that "high-frequency, short duration" is Express's precise sweet spot.

## State Types and ASL Model

ASL expresses workflows with 7 core states.

| State | Role | Test frequency |
|-------|------|----------------|
| **Task** | Lambda/service API calls | Very high |
| **Choice** | Conditional branching (if/switch) | High |
| **Parallel** | Fixed N branches executing concurrently | Normal |
| **Map** | Dynamically process arrays in parallel | Very high |
| **Wait** | Wait for time/timestamp | Normal |
| **Pass** | Pass input through as-is (testing) | Low |
| **Succeed/Fail** | Terminal states | Normal |

The **Map** state expanded to **Distributed Map** in 2022, increasing test frequency. Standard Map is inline mode with 40 concurrent limit, operating within the same execution context. Distributed Map:
- Up to **10,000 child execution** parallel
- Uses S3 object list, CSV, JSON Lines directly as source
- Each child execution is independent, bypassing ASL payload size limit (256KB)

> 🎯 **Scenario**: "A media company needs to transcode 1 million video files stored in S3 in batch. Each file is processed by an ECS Fargate Task. What pattern is most appropriate?" — The answer is **Step Functions Distributed Map + ECS RunTask(.sync)**. Directly read S3 source and launch 10,000 parallel child executions, each waiting synchronously for ECS Task. Standard Map's 40 concurrent limit would be too slow for 1 million files. Lambda looping directly has payload limit and visibility issues.

## Service Integration Pattern 3 Types

Step Functions can directly call 200+ AWS service APIs. There are 3 invocation methods.

```
[Step Functions Task]
   ├── Request-Response (default): Call and immediately move to next state
   ├── .sync:                       Wait synchronously + polling until job completes
   └── .waitForTaskToken:           Proceed via external system callback
```

### Request-Response — Simple Call

Basic form like `arn:aws:states:::lambda:invoke`. Call Lambda and immediately move to the next state upon receiving response. Calling ECS RunTask in this mode only starts the Task without waiting for completion (usually not desired).

### .sync — Wait Synchronously Until Job Completion

Append `.sync` suffix like `arn:aws:states:::ecs:runTask.sync`, and Step Functions internally polls while waiting for job completion. Used for "long-running tasks" like ECS RunTask, EMR Step, Glue Job, SageMaker Training/Transform. Users don't need to write polling code.

The internal operation requires `iam:PassRole` in IAM Role plus additional `events:PutTargets`·`events:PutRule` permissions, because Step Functions receives ECS Task completion events via EventBridge. In tests, when "Step Functions can't execute ECS RunTask.sync", the cause is almost always missing IAM permissions.

### .waitForTaskToken — Wait for External Callback

The most powerful pattern. Step Functions issues a **token** to the Task, and the workflow pauses durably waiting until an external system (human, another system) calls `SendTaskSuccess`/`SendTaskFailure` API with that token.

Typical use cases:
- **Human Approval**: Workflow sends approval request email via SNS + token. Person clicks link → API GW → Lambda → `SendTaskSuccess`
- **External System Integration**: Payment gateway asynchronously sends result via webhook
- **Long-Waiting Job**: Wait for results of external processing taking days

```json
{
  "Type": "Task",
  "Resource": "arn:aws:states:::sns:publish.waitForTaskToken",
  "Parameters": {
    "TopicArn": "arn:aws:sns:...:approval",
    "Message.$": "$",
    "MessageAttributes": {
      "TaskToken": { "DataType": "String", "StringValue.$": "$$.Task.Token" }
    }
  }
}
```

> 🔍 **Deeper**: `.waitForTaskToken` only works in Standard because Express has a single execution time limit (5 minutes). Standard can wait up to 1 year, naturally supporting multi-day approval workflows. The token is an opaque 64KB string mapped in a distributed KV where AWS persistently stores workflow instances. That is, the Step Functions workflow instance itself is a **first-class object**, which enables this pattern.

> 📚 **Case Study**: In 2020, Capital One transitioned credit card issuance workflow to Step Functions, implementing "manual credit review step" with `.waitForTaskToken`. The system attempts automatic review, and if it falls below a threshold, sends a token to a human reviewer, and the workflow resumes when the reviewer enters a decision. Average wait is days. Previously they operated separate queues + polling services, but Step Functions transition reduced code by 80%.

## Error Handling — Retry and Catch Collaboration

ASL error handling spans two layers.

**Retry** — Re-execute the same state
```json
"Retry": [{
  "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException"],
  "IntervalSeconds": 2,
  "MaxAttempts": 3,
  "BackoffRate": 2.0,
  "JitterStrategy": "FULL"
}]
```

With `BackoffRate=2.0`, intervals are 2 seconds, 4 seconds, 8 seconds (exponential backoff). Turning on `JitterStrategy=FULL` (2023) adds jitter to avoid thundering herd from concurrent calls.

**Catch** — Branch to a different state
```json
"Catch": [{
  "ErrorEquals": ["States.ALL"],
  "ResultPath": "$.error",
  "Next": "CompensateAndCleanup"
}]
```

Catch is for compensation branches (Saga's compensating transactions). Using `ResultPath` to preserve error info in workflow input lets the compensation stage know where and what failed.

> 💡 **Related Theory**: Exponential backoff + jitter is a standard pattern in distributed systems. AWS blog "Exponential Backoff And Jitter" (2015) is the shortest and clearest explanation. The core insight is that when many clients retry, they all come back at the same time causing thundering herd, so jitter spreads them out. Step Functions's JitterStrategy implements this as managed. Feature added 2023.

## Saga's Real-World Implementation — Order Processing Example

```
[ReserveInventory] ── Failure ──► [CancelOrder]
       │ Success
       ▼
[ChargePayment] ──── Failure ──► [RestoreInventory] ──► [CancelOrder]
       │ Success
       ▼
[CreateShipment] ─── Failure ──► [RefundPayment] ──► [RestoreInventory] ──► [CancelOrder]
       │ Success
       ▼
[NotifyCustomer]
```

Each step's Catch calls compensation chain. Expressed in ASL:

```json
{
  "ChargePayment": {
    "Type": "Task",
    "Resource": "arn:aws:states:::lambda:invoke",
    "Parameters": { "FunctionName": "ChargePaymentFn", "Payload.$": "$" },
    "Retry": [{
      "ErrorEquals": ["PaymentGatewayTransient"],
      "MaxAttempts": 3, "BackoffRate": 2.0
    }],
    "Catch": [{
      "ErrorEquals": ["States.ALL"],
      "ResultPath": "$.error",
      "Next": "RestoreInventory"
    }],
    "Next": "CreateShipment"
  }
}
```

The critical point is that **compensating transactions must be idempotent**. The same compensation call coming twice should produce identical results. The pattern of including `idempotencyKey` in the input is standard.

> ⚠️ **Pitfall**: "Step Functions guarantees ACID transactions" is wrong. Saga is BASE (Basically Available, Soft state, Eventual consistency). Compensating transactions themselves can fail, requiring monitoring, alarms, and manual intervention procedures. In tests, the answer keyword is typically "implement compensation with Saga".

## Distributed Map — Large-Scale Data Processing

Distributed Map added in 2022 breaks Standard Map's 40 concurrent limit, allowing **10,000 child execution** parallel processing.

```json
{
  "ProcessAllFiles": {
    "Type": "Map",
    "ItemReader": {
      "Resource": "arn:aws:states:::s3:listObjectsV2",
      "Parameters": { "Bucket": "input-bucket", "Prefix": "data/" }
    },
    "MaxConcurrency": 1000,
    "ItemProcessor": {
      "ProcessorConfig": { "Mode": "DISTRIBUTED", "ExecutionType": "EXPRESS" },
      "StartAt": "Process",
      "States": {
        "Process": {
          "Type": "Task",
          "Resource": "arn:aws:states:::lambda:invoke",
          "End": true
        }
      }
    },
    "ResultWriter": {
      "Resource": "arn:aws:states:::s3:putObject",
      "Parameters": { "Bucket": "output-bucket", "Prefix": "results/" }
    }
  }
}
```

Features:
- **ItemReader**: S3 list, CSV, JSON Lines as direct source
- **Child execution**: Standard or Express. Express recommended (cost/speed)
- **ResultWriter**: Automatically aggregate results to S3
- **MaxConcurrency**: Concurrent execution limit (up to 10,000)

> 🎯 **Scenario**: "A data team processes 1 million CSV rows daily in ETL. Each row is independent and processed by one Lambda invocation. What's the most cost-efficient and operationally light configuration?" — Answer: **Distributed Map + Lambda (Express mode child)**. Using ECS Batch means high container boot costs, Lambda loop has payload limit and visibility issues. Distributed Map automatically chunks 1 million rows (e.g., 100 rows/chunk) and calls Lambda 10,000 parallel. Cost is state transition + Lambda invocation, very low.

## Step Functions vs Glue Workflows vs EventBridge Pipes — Real Differences Among Similar-Looking Trio

Three services often confused in tests:

| Tool | Essence | Use when |
|------|---------|----------|
| **Step Functions** | General-purpose workflow engine | Complex branching·parallelism·compensation·external callbacks |
| **Glue Workflows** | ETL-only workflow | Crawler + Job + Trigger sequence (Spark-based) |
| **EventBridge Pipes** | Single source→target pipe | 1:1 routing + filtering·transformation (no code) |

Pipes are next day's topic. Preview: it's a tool for composing single connections like "SQS Queue → Filter → Step Functions" without Lambda code. For non-complex flows, Pipes is lighter.

> 📚 **Case Study**: In 2023, Airbnb migrated refund workflow (7 steps + 4 external systems + human approval) from its own workflow engine to Step Functions Standard. The biggest benefits were visibility (entire execution visualized in console) and IAM integration (least privilege per step), they reported. SRE staff previously maintaining the custom engine could be reassigned.

## ASL Input/Output Transformation — InputPath, ResultPath, OutputPath

One confusing part of ASL is data flow transformation between states. Four paths cooperate:

1. **InputPath** — Extract portion of data entering the state
2. **Parameters** — Restructure data to pass to Task
3. **ResultSelector** + **ResultPath** — Process and insert Task result
4. **OutputPath** — Extract data to send to next state

```
Input → InputPath filter → Parameters restructure → Task execute → 
ResultSelector process → ResultPath insert → OutputPath filter → Next state
```

> 🔍 **Deeper**: This 4-step transformation seems complex initially, but the core is **immutable transformation pipeline**. Same as functional programming's `map`/`filter`/`pipe`. Tests don't ask to write ASL directly, but scenarios like "pass only part of State A result to State B" appear sometimes. ResultSelector + ResultPath is the answer.

## Workflow Studio — Visual Workflow Builder

Added in 2021, Workflow Studio creates workflows via drag-and-drop and auto-generates ASL JSON. 200+ service integrations available as catalog, IAM policies auto-generated. Much faster and less error-prone than hand-coding for small workflows.

For large workflows, directly writing ASL JSON and managing with CDK/Terraform is standard. Hybrid workflow of visual generation in Workflow Studio then export → commit to code base is common.

## Summary

Step Functions is not a simple "Lambda call chain". It provides as managed service patterns like distributed system persistent state machines, Saga compensation transactions, external callback waiting, and large-scale parallel processing. In tests, mapping scenario keywords like this works almost always:

- "Long-running workflow + compensation" → **Standard + Catch/Compensate**
- "High frequency, short duration" → **Express**
- "Human approval / external callback" → **.waitForTaskToken**
- "Wait for ECS Task completion" → **.sync**
- "Parallel process 1M S3 objects" → **Distributed Map + Express child**

Next day covers EventBridge for event routing. If Step Functions is the tool for "flow", EventBridge is the tool for "distribution". The pattern of using both tools together appears most frequently in SAP exams.

---

## 📝 연습 문제

**문제 1.** An IoT platform receives 5,000 events per second from vending machines (sales·inventory·temperature). Each event's workflow takes an average of 30 seconds and ends in 4 steps. What's the most cost-efficient Step Functions configuration?

A) Standard
B) Express
C) Standard with Distributed Map
D) Lambda chain without Step Functions

**정답: B**
해설: High-frequency 5,000 events per second + short workflow ending within 5 minutes is Express's precise sweet spot. Standard charges per state transition ($25/M), so 5,000 events/sec × 4 steps × 3,600 × 24 × 30 = astronomical 5 trillion transitions/month cost. Express charges per invocation + time, about 1/100th cost. C (Distributed Map) is for parallelism within a single workflow; this scenario has many workflow instances themselves. D (Lambda chain) requires retry/compensation scattered in code, poor visibility and operational burden. Additional: Coca-Cola, Snap IoT cases all use Express + S3 archive pattern as standard.

---

**문제 2.** Payment → Inventory Deduction → Shipment Booking workflow. If shipment booking fails, need refund + inventory restoration. What's the appropriate pattern?

A) Lambda chain + try/catch in code
B) Step Functions Standard + Catch + compensation branch
C) EventBridge Rule chain
D) SQS DLQ to isolate failed events

**정답: B**
해설: Distributed transaction compensation is Saga pattern, implemented in Step Functions with each Task's Catch branching to separate compensation state. A has compensation logic scattered in code, poor visibility and maintenance; Lambda 15min timeout also constrains. C (EventBridge chain) is possible but lacks workflow instance tracking and persistent state. D is failure isolation, not compensation. Standard because compensation workflows can take days, running up to 1 year. Additional: Compensation transactions must be idempotent, standard pattern includes `idempotencyKey` in input.

---

**문제 3.** Payment workflow. External payment gateway asynchronously sends result via webhook. Workflow must wait in the meantime. What integration pattern?

A) Wait State (10 minutes)
B) .sync (service integration)
C) .waitForTaskToken
D) Lambda polling loop

**정답: C**
해설: `.waitForTaskToken` issues token to Task and durably waits until external system calls `SendTaskSuccess`/`SendTaskFailure`. Webhook receiver (Lambda) receives token and calls, resuming workflow. A (Wait) time-based so unsuitable if external response timing uncertain. B (.sync) for AWS service integration (ECS/EMR/Glue etc) Job completion. D adds polling cost and complexity. Pitfall: Human approval uses same pattern (.waitForTaskToken + SNS email). Additional: Standard only, Express's 5min limit prevents it.

---

**문제 4.** 1 million CSV files stored in S3, each processed by Lambda. What's the appropriate pattern?

A) Map state (inline mode)
B) Distributed Map + Express child execution
C) Lambda inside Lambda loop
D) ECS Batch with 1M tasks

**정답: B**
해설: Standard Map has 40 concurrent limit, Distributed Map supports 10,000 parallel + ItemReader can read S3 list directly. Use Express child execution for cost/speed optimization. A's 40 concurrent limit too slow for 1M processing. C violates Lambda 15min timeout and payload limit. D's container boot cost exceeds Lambda, large operational burden. Pitfall: Distributed Map uses ItemReader for S3 list, CSV, JSON Lines directly as source—no pre-processing needed. ResultWriter auto-aggregates. Additional: re:Invent 2022 talk.

---

**문제 5.** Step Functions Workflow step fails with "Lambda.ServiceException". Retry 3 times with exponential backoff, on continued failure enter compensation. ASL?

A) Retry only
B) Catch only
C) Retry + Catch both
D) Lambda caller handles retry

**정답: C**
해설: Retry re-executes same state (exponential backoff + jitter), Catch branches to different state. Two layers collaborate. Retry 3× → still fails → Catch routes to compensation. A lacks compensation branch. B goes straight to compensation without retry, wasting costs on transient errors. D scattered retry in code loses visibility and standardization. Pitfall: ErrorEquals in Retry should list `["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "States.TaskFailed"]`—transient errors only. `States.ALL` for compensation trigger only. JitterStrategy=FULL (2023) prevents thundering herd.

---

**문제 6.** Standard Workflow pricing model is?

A) Invocations only
B) Execution time (seconds) only
C) State transitions
D) Free

**정답: C**
해설: Standard charges $25/M per state transition. One workflow with 4 steps = 4 transitions per execution. Cost = execution frequency × step count. Express is invocation + time model. A close to Express model. B incorrect simplification. D absolutely not free. Pitfall: Standard runs long, so step count is cost driver more than call frequency. "5-step workflow 1M times/month" = 5M transitions = ~$125.

---

**문제 7.** Launch Fargate container via ECS RunTask, wait for completion, then proceed to next state. Appropriate integration pattern?

A) Request-Response
B) .sync
C) .waitForTaskToken
D) Polling Lambda

**정답: B**
해설: `arn:aws:states:::ecs:runTask.sync` means Step Functions polls on behalf until ECS Task completes. Internally EventBridge receives ECS Task State Change events and notifies Step Functions. IAM Role needs `iam:PassRole` + `events:PutTargets`/`events:PutRule`. A only starts Task, doesn't wait. C for external callbacks. D unmanaged polling, operational burden. Pitfall: ".sync not working" scenarios 99% are missing IAM permissions. Additional: EMR Step, Glue Job, SageMaker Training/Transform follow same pattern.

---

## 📌 오늘의 요약

1. **Step Functions = distributed persistent state machine**, Saga compensation via Catch + separate branch
2. **Standard** (1yr·per-transition) vs **Express** (5min·per-invocation+time) — split by frequency·duration
3. **7 State types** + **Distributed Map** (10K parallel + S3 ItemReader)
4. **3 Integration patterns**: Request-Response / **.sync** (wait Job) / **.waitForTaskToken** (external callback)
5. **Retry + Catch** — exponential backoff + jitter (2023), boundary: transient vs permanent
6. **ASL path** transformation: InputPath → Parameters → ResultSelector → ResultPath → OutputPath
7. Workflow Studio visual creation + auto IAM generation