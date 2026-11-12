# Day 5 - Week 11 Review: The Questions That Separate Messaging Models

The five services covered in Week 11 - SQS, SNS, Kinesis, Step Functions, and AppSync - all superficially "move data or work from one place to another." That is why the exam often asks in the form "what fits this scenario." Fragmentary memorization wobbles on comparisons such as SQS vs Kinesis, SNS vs EventBridge, and Standard vs Express. Instead of listing the five services again, this review reorganizes them around **a few fundamental questions that separate them**. Whatever scenario you meet, asking these questions in order narrows down the answer.

## Four Questions That Separate the Models

### Question 1: How many receive one message? (1:1 vs 1:N)

This is the first fork that separates SQS and SNS.

- **1:1 (one job = one processor)** -> **SQS**. A "work queue" such as order processing or image conversion. A message is taken by one consumer, processed, and then disappears (point-to-point).
- **1:N (one event -> several reactions)** -> **SNS** (or EventBridge). A single order creation triggers inventory, payment, and notification at the same time. It is pushed to every subscriber the instant it is published (publish-subscribe).

**Fanout** (SNS -> multiple SQS), which combines the two, is a structure that gets both at once: "spread it out 1:N, while each consumer has a reliable buffer and retries."

### Question 2: Does the data disappear when consumed? (Destructive read vs retained log)

This is the most essential question separating SQS and Kinesis.

- **Consume = delete** -> **SQS**. Once processed, it is over. No reprocessing or multiple consumption.
- **Retained even after reading (log)** -> **Kinesis Data Streams**. Multiple consumers read simultaneously from their own positions, and you can reprocess yesterday's data with new code (replay). Consumers are responsible for their own position through checkpoints.

If you see "several analytics systems on the same stream at once," "reprocessing past data after a bug fix," or "hundreds of thousands of events per second + ordering," it is Kinesis.

### Question 3: Do I process it, or do I just send it along? (Data Streams vs Firehose)

This is the fork inside Kinesis.

- **Process directly in code (real-time, low latency)** -> **Data Streams** + Lambda/KCL.
- **Load automatically into a destination (no code, 1-minute delay acceptable)** -> **Firehose** -> S3/Redshift/OpenSearch/Splunk.

If it is "automatically save to S3," "Parquet conversion," or "serverless ETL," it is Firehose. If it is "ultra-low-latency real-time," it is Data Streams.

### Question 4: Must the flow be woven together explicitly? (Decoupling vs orchestration)

- **Weave steps together with order, branching, retries, and rollback** -> **Step Functions**. A multi-step business process that needs visibility and error handling.
- **Data from multiple backends in one query + real-time** -> **AppSync** (GraphQL).

These four questions match the classic classification axes of messaging and integration: (1) point-to-point vs pub/sub, (2) destructive read vs log-based, (3) processing vs delivery, (4) choreography vs orchestration. Gregor Hohpe's *Enterprise Integration Patterns* (2003) and Jay Kreps's log-centric thinking (2013) established these axes. AWS's five services are different coordinates on these universal axes. Rather than memorizing each service's traits, if you place it by "which side of which axis is this service on," comparison questions turn into reading coordinates.

## Key Numbers: Boundary Values at a Glance

| Service | Item | Value |
|--------|------|-----|
| SQS | Maximum message size | **1 MiB** (raised from 256 KiB in August 2025. If exceeded, Extended Client -> S3, 2 GB) |
| SQS | Retention period | 60 seconds to **14 days** (default 4 days) |
| SQS | Visibility timeout | 0 to **12 hours** (default 30 seconds) |
| SQS | Message delay | 0 to 15 minutes |
| SQS FIFO | Throughput | 300 msg/s, 3,000 with batching, 70,000+ high throughput |
| SNS | Message retention | **None** (lost on delivery failure) |
| SNS | Subscribers per topic | 12,500,000 |
| Kinesis | Shard write | 1 MB/s or 1,000 records/s |
| Kinesis | Shard read (classic) | 2 MB/s shared / (EFO) 2 MB/s per consumer |
| Kinesis | Retention | 24 hours to **365 days** |
| Kinesis | On-Demand limit | 200 MB/s, 200,000 RPS |
| Firehose | Minimum latency | **60 seconds** (Near Real-Time) |
| Step Functions | Standard / Express | 1 year, exactly-once / 5 minutes, at-least-once |

> ⚠️ **Pitfall**: These are three especially easy-to-confuse boundary values. (1) **Firehose is not real-time** (minimum 60 seconds). If you see "real-time," it is Data Streams. (2) **SNS has no retention**. For "preventing loss on delivery failure," insert SQS or use a subscription DLQ. (3) **The Lambda-SQS visibility timeout is 6 times the function timeout**. If you do not respect this, duplicate processing occurs.

## Confusing Comparisons at a Glance

| A | B | Key difference |
|---|---|----------|
| SQS Standard | SQS FIFO | Unlimited, no ordering, duplicates possible vs 300/s, ordering, 5-minute dedup |
| SQS | SNS | Pull, 1:1, retained vs Push, 1:N, non-retained |
| SNS | EventBridge | Simple replicated distribution, attribute filters vs rich event-pattern routing, schemas |
| Kinesis Data Streams | SQS | Retained log, multiple consumers, reprocessing vs destructive read, single consumer |
| Data Streams | Firehose | Direct processing, real-time vs automatic loading, 60 seconds+ |
| Classic | Enhanced Fan-Out | Shared 2 MB/s, polling vs per-consumer 2 MB/s, HTTP/2 push |
| SF Standard | Express | 1 year, exactly-once, expensive vs 5 minutes, at-least-once, high throughput |
| `.sync` | `.waitForTaskToken` | Wait for a machine job to complete vs wait for an external/human callback |
| AppSync | API Gateway | GraphQL, multiple sources, built-in subscriptions vs REST, single backend |

The distinction between SNS and EventBridge is said to have grown in weight on recent exams. Both "send events to multiple targets," but their strengths differ.

- SNS is strong at **simple, high-speed replicated distribution** (attribute-based filters, very high throughput).
- EventBridge is strong at **rich routing** (pattern matching on the entire event body, schema registry, SaaS integration, scheduling).
- The rough rule is this: if it is "spray the same message quickly to multiple queues/functions," it is SNS; if it is "branch, transform, or integrate with external SaaS in complex ways depending on the event content," it is EventBridge.
- When the exam asks for the "canonical fanout," SNS+SQS is the default answer, and for "content-based complex routing," it is EventBridge.

## Failure Handling: A Different Safety Net for Each Service

How each service handles a "failed message/job" is a comparison point within the exam scope.

- **SQS**: When `maxReceiveCount` is exceeded, **DLQ** (same type to same type). Isolates poison messages.
- **SNS**: Non-retaining, but a **subscription DLQ** (redrive) preserves messages that failed delivery.
- **Kinesis**: Because of order preservation, a failed record **blocks what comes after it** (head-of-line blocking). It is mitigated with the Lambda ESM's `BisectBatchOnFunctionError`, `MaximumRetryAttempts`, and a failure destination (SQS/SNS).
- **Step Functions**: Per-state `Retry` (backoff) and `Catch` (error branching), compensating transactions (Saga).

> 📚 **Case**: The exam can mix up three kinds of DLQ. The **SQS DLQ** (a queue message exceeds maxReceiveCount), the **SNS subscription DLQ** (delivery to a subscriber fails), and the **Lambda DLQ** (a Lambda asynchronous invocation fails). Even though all are called "DLQ," the layer of failure each one catches is different. For example: "preserve messages that SNS failed to deliver to an HTTPS endpoint" -> SNS subscription DLQ. "Lambda failed to process an asynchronous event" -> Lambda DLQ (or Destinations). "An SQS message failed processing 3 times" -> SQS DLQ. From the wording, you must first pin down "the failure at which stage."

## Acronym Quick Reference

| Acronym | Full name |
|------|--------|
| SQS / SNS | Simple Queue / Notification Service |
| DLQ | Dead Letter Queue |
| KDS / KDF | Kinesis Data Streams / Firehose |
| KCL / KPL | Kinesis Client / Producer Library |
| EFO | Enhanced Fan-Out |
| ESM | Event Source Mapping |
| FSM | Finite State Machine (the foundation of Step Functions) |
| Saga | Compensation pattern for distributed transactions |
| APNs / FCM | Apple / Google mobile push |
| WAL | Write-Ahead Log (the root of the log model) |

---

## 📝 Week 11 Comprehensive Practice Questions

**Question 1.** When processing payment transactions exactly once and in order?

A) SQS Standard queue  
B) SQS FIFO queue  
C) SNS  
D) Kinesis  

**Answer: B** - FIFO queue guarantees order and exactly-once processing (deduplication).

---

**Question 2.** To analyze millions of user click events in real-time and store in S3?

A) SQS → Lambda → S3  
B) Kinesis Data Streams → analytics → Firehose → S3  
C) SNS → SQS → S3  
D) DynamoDB Streams → S3  

**Answer: B** - Kinesis Data Streams optimized for high-volume streaming, Firehose easily delivers to S3.

---

**Question 3.** When one S3 upload event triggers 3 Lambda functions simultaneously?

A) Set S3 event directly to each Lambda  
B) S3 → SNS → 3 Lambda subscriptions  
C) S3 → SQS → Lambda  
D) S3 → EventBridge → 3 Lambda  

**Answer: B or D** - SNS fanout or EventBridge can deliver single event to multiple Lambda simultaneously. Exam standard: B is the fanout pattern.

---

**Question 4.** To isolate messages that failed 3 times in SQS?

A) SQS filter policy  
B) DLQ setting (maxReceiveCount=3)  
C) Increase VisibilityTimeout  
D) Disable long polling  

**Answer: B** - DLQ with maxReceiveCount=3 moves failed messages to DLQ.

---

**Question 5.** When orchestrating multiple Lambda in sequence with rollback on failure?

A) Lambda chain (Lambda directly invokes Lambda)  
B) Step Functions  
C) SQS workflow  
D) EventBridge rule chain  

**Answer: B** - Step Functions manages workflow state and supports error handling, retry, compensation transactions.

---

**Question 6.** Most significant difference between Kinesis Data Streams and SQS?

A) Speed difference  
B) Kinesis allows multiple consumers to read simultaneously; data retained  
C) Cost difference  
D) Region restriction  

**Answer: B** - Kinesis retains data so multiple consumers read independently; SQS message consumed and gone.

---

**Question 7.** For mobile app using GraphQL with real-time updates?

A) API Gateway REST API  
B) API Gateway WebSocket  
C) AWS AppSync  
D) Kinesis Firehose  

**Answer: C** - AppSync provides fully managed GraphQL and real-time subscriptions (WebSocket).

---

**Question 8.** To deliver SNS messages with premium customer info only to specific SQS?

A) SQS message filter  
B) SNS filter policy  
C) Lambda intermediate processing  
D) IAM policy  

**Answer: B** - SNS filter policy delivers messages to specific subscribers based on attributes.

---

**Question 9.** What is Lambda's recommended visibility timeout with Kinesis integration?

A) Same as Lambda timeout  
B) 2x Lambda timeout  
C) 6x Lambda timeout  
D) 12x Lambda timeout  

**Answer: C** - For Kinesis, recommend 6x or more Lambda timeout to prevent duplicate processing.

---

**Question 10.** Standard Lambda execution time limit with Step Functions?

A) 5 minutes  
B) 15 minutes  
C) 1 hour  
D) Unlimited (via Step Functions)  

**Answer: D** - Step Functions Standard can orchestrate up to 1 year; each Task (Lambda) still 15 min, but overall workflow unlimited.

---

**Question 11.** When Kinesis shard reaches write capacity (1MB/s)?

A) Automatic scaling  
B) Request ProvisionedThroughputExceededException error  
C) Increase shard count or use On-Demand  
D) Data loss  

**Answer: C** - Kinesis Provisioned throws exception; must increase shards or switch to On-Demand mode.

---

**Question 12.** AppSync best data source for millisecond-latency DynamoDB query?

A) Lambda resolver  
B) Direct DynamoDB data source (AppSync native)  
C) RDS Proxy  
D) HTTP endpoint  

**Answer: B** - AppSync native DynamoDB resolver is optimized for direct CRUD without Lambda overhead.

---

**Question 13.** SNS message lost on Lambda delivery failure?

A) Auto-move to SQS  
B) Retry then lost (set Lambda DLQ or Destinations)  
C) Auto-move to DLQ  
D) Email admin  

**Answer: B** - SNS retries then loses message; must configure Lambda Destinations or SNS DLQ for Lambda.

---

**Question 14.** What determines partition into same Kinesis shard?

A) Consumer ID  
B) Partition Key  
C) Timestamp  
D) Random  

**Answer: B** - Same partition key → same shard; allows ordering guarantees per partition.

---

**Question 15.** Step Functions Express vs Standard - when to choose Express?

A) Long-running workflows (days/months)  
B) Need exactly-once guarantee  
C) Short frequent event processing  
D) Human approval workflows  

**Answer: C** - Express: short (5 min max), high throughput, at-least-once. Standard: long, exactly-once, cheap.

---

## 📌 Today's Summary

1. SQS: Standard (unlimited/unordered) vs FIFO (300/s, order/dedup)
2. SNS: Push, fanout, filter policy for selective delivery
3. Kinesis: Large-scale streaming, multiple consumers, shard-based
4. Firehose: Serverless ETL, 1-minute latency, S3/Redshift/OpenSearch
5. Step Functions: Workflow orchestration, retry, parallel execution
6. AppSync: GraphQL, real-time subscriptions, multi-source queries
