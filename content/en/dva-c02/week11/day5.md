# Day 5 - Week 11 Review: The Questions That Divide the Messaging Models

The five services covered in Week 11 - SQS, SNS, Kinesis, Step Functions, and AppSync - all appear on the surface to "move data or work from one place to another." That is why the exam often asks in the form "which one fits this scenario?" Fragmentary memorization tends to wobble on comparisons like SQS vs. Kinesis, SNS vs. EventBridge, and Standard vs. Express. Instead of listing the five services again, this review reorganizes them around **a few fundamental questions that divide them.** Whatever scenario you meet, asking these questions in order narrows down the answer.

## Four Questions That Divide the Models

### Question 1: How many receivers get a message? (1:1 vs. 1:N)

This is the first fork that separates SQS and SNS.

- **1:1 (one task = one handler)** → **SQS**. A "work queue" like order processing or image conversion. A message is taken by one consumer and disappears once processed (point-to-point).
- **1:N (one event → many reactions)** → **SNS** (or EventBridge). A single order creation triggers inventory, payment, and notification at the same time. Pushed to all subscribers immediately upon publication (publish-subscribe).

**Fan-out** (SNS → multiple SQS), which combines the two, is the structure that gets "spread out 1:N while each consumer has a reliable buffer and retries" at once.

### Question 2: Does the data disappear when consumed? (destructive read vs. retained log)

This is the most essential question that separates SQS and Kinesis.

- **Consume = delete** → **SQS**. Once processed, it is done. No reprocessing or multiple consumption.
- **Retained even after reading (log)** → **Kinesis Data Streams**. Multiple consumers read simultaneously at their own positions, and yesterday's data can be reprocessed (replayed) with new code. Consumers are responsible for their own position through checkpoints.

If you see "multiple analytics systems on the same stream at once," "reprocess past data after a bug fix," or "hundreds of thousands of events per second + ordering," it is Kinesis.

### Question 3: Do I process it, or just deliver it? (Data Streams vs. Firehose)

This is the fork within Kinesis.

- **Process directly with code (real time, low latency)** → **Data Streams** + Lambda/KCL.
- **Automatic loading to a destination (no code, 1-minute delay acceptable)** → **Firehose** → S3/Redshift/OpenSearch/Splunk.

"Automatically save to S3," "Parquet conversion," or "serverless ETL" means Firehose. "Ultra-low-latency real time" means Data Streams.

### Question 4: Do I need to wire the flow explicitly? (decoupling vs. orchestration)

- **Wiring steps together with order, branching, retries, and rollback** → **Step Functions**. A multi-step business process that needs visibility and error handling.
- **Multiple backends' data in one query + real time** → **AppSync** (GraphQL).

These four questions match the classic classification axes of messaging and integration: (1) point-to-point vs. pub/sub, (2) destructive read vs. log-based, (3) processing vs. delivery, (4) choreography vs. orchestration. Gregor Hohpe's *Enterprise Integration Patterns* (2003) and Jay Kreps's log-centric philosophy (2013) established these axes. AWS's five services are different coordinates on these universal axes. If instead of memorizing each service's characteristics you locate it by "which side of which axis is this service on," comparison questions turn into coordinate reading.

## Key Numbers: Boundary Values at a Glance

| Service | Item | Value |
|--------|------|-----|
| SQS | Max message size | **1 MiB** (raised from 256 KiB in August 2025. If exceeded, Extended Client → S3, 2 GB) |
| SQS | Retention period | 60 seconds to **14 days** (default 4 days) |
| SQS | Visibility timeout | 0 to **12 hours** (default 30 seconds) |
| SQS | Message delay | 0 to 15 minutes |
| SQS FIFO | Throughput | 300 msg/s, batch 3,000, high throughput 70,000+ |
| SNS | Message retention | **None** (lost if delivery fails) |
| SNS | Subscribers per topic | 12,500,000 |
| Kinesis | Shard write | 1 MB/s or 1,000 records/s |
| Kinesis | Shard read (classic) | 2 MB/s shared / (EFO) 2 MB/s per consumer |
| Kinesis | Retention | 24 hours to **365 days** |
| Kinesis | On-Demand limits | 200 MB/s, 200,000 RPS |
| Firehose | Minimum latency | **60 seconds** (Near Real-Time) |
| Step Functions | Standard / Express | 1 year, exactly-once / 5 minutes, at-least-once |

> ⚠️ **Trap**: These are three boundary values that are especially easy to confuse. (1) **Firehose is not real time** (minimum 60 seconds). If you see "real time," it is Data Streams. (2) **SNS has no retention.** For "prevent loss on delivery failure," insert SQS or use a subscription DLQ. (3) **The Lambda-SQS visibility timeout is 6 times the function timeout.** If you do not follow this, duplicate processing occurs.

## Summary of Confusing Comparisons

| A | B | Key difference |
|---|---|----------|
| SQS Standard | SQS FIFO | Unlimited, no ordering, duplicates possible vs. 300/s, ordering, 5-minute dedup |
| SQS | SNS | Pull, 1:1, retained vs. Push, 1:N, not retained |
| SNS | EventBridge | Simple replicated distribution, attribute filters vs. rich event pattern routing, schemas |
| Kinesis Data Streams | SQS | Retained log, multiple consumption, reprocessing vs. destructive read, single consumption |
| Data Streams | Firehose | Direct processing, real time vs. automatic loading, 60 seconds+ |
| Classic | Enhanced Fan-Out | Shared 2 MB/s, polling vs. 2 MB/s per consumer, HTTP/2 push |
| SF Standard | Express | 1 year, exactly-once, expensive vs. 5 minutes, at-least-once, high throughput |
| `.sync` | `.waitForTaskToken` | Wait for a machine task to complete vs. wait for an external/human callback |
| AppSync | API Gateway | GraphQL, multiple sources, built-in subscriptions vs. REST, single backend |

The distinction between SNS and EventBridge is said to have grown in weight on recent exams. Both "send events to multiple targets," but their strengths differ.

- SNS is strong at **simple, high-speed replicated distribution** (attribute-based filters, ultra-high throughput).
- EventBridge is strong at **rich routing** (pattern matching over the entire event body, Schema Registry, SaaS integration, scheduling).
- A rough rule of thumb: if it is "spray the same message to multiple queues/functions quickly," SNS; if it is "complex branching, transformation, and external SaaS integration depending on event content," EventBridge.
- When the exam asks about "the canonical fan-out," SNS+SQS is the default answer, and for "content-based complex routing," it is EventBridge.

## Failure Handling: A Different Safety Net per Service

How each service handles "failed messages/tasks" is a comparison point within the exam scope.

- **SQS**: Exceeding `maxReceiveCount` sends it to a **DLQ** (same type to same type). Isolates poison messages.
- **SNS**: Not retained, but a **subscription DLQ** (redrive) preserves messages that failed delivery.
- **Kinesis**: Because ordering is preserved, a failed record **blocks what comes after** (head-of-line blocking). Mitigated with Lambda ESM's `BisectBatchOnFunctionError`, `MaximumRetryAttempts`, and failure destinations (SQS/SNS).
- **Step Functions**: Per-state `Retry` (backoff) and `Catch` (error branching), compensating transactions (Saga).

> 📚 **Case study**: The exam can mix three kinds of DLQ. The **SQS DLQ** (queue message exceeds maxReceiveCount), the **SNS subscription DLQ** (subscriber delivery failure), and the **Lambda DLQ** (Lambda asynchronous invocation failure). Even though they are all "DLQ," the layer of failure each one catches differs. For example: "preserve messages that SNS failed to deliver to an HTTPS endpoint" → SNS subscription DLQ. "Lambda failed to process an asynchronous event" → Lambda DLQ (or Destinations). "An SQS message failed processing 3 times" → SQS DLQ. You need to first pin down "which stage's failure is this?" from the wording.

## Quick Reference for Acronyms

| Acronym | Full name |
|------|--------|
| SQS / SNS | Simple Queue / Notification Service |
| DLQ | Dead Letter Queue |
| KDS / KDF | Kinesis Data Streams / Firehose |
| KCL / KPL | Kinesis Client / Producer Library |
| EFO | Enhanced Fan-Out |
| ESM | Event Source Mapping |
| FSM | Finite State Machine (the foundation of Step Functions) |
| Saga | Distributed transaction compensation pattern |
| APNs / FCM | Apple / Google mobile push |
| WAL | Write-Ahead Log (the root of the log model) |

---

## 📝 Week 11 Review Practice Questions

**Question 1.** Payment transactions must be processed in per-customer order, without duplicates, exactly once. About 4,000 occur per second. What is an appropriate configuration?

A) Put an idempotent consumer on an SQS Standard queue and reorder per customer in the application using sequence numbers

B) A high-throughput FIFO queue + using the customer ID as the message group ID

C) A FIFO queue with the same single group ID on all messages to force global ordering

D) Put the customer ID as the partition key on a single Kinesis Data Streams shard to guarantee ordering

**Answer: B**

Explanation: Since ordering is needed only **per customer**, using the **customer ID as the message group ID** on a **high-throughput FIFO** queue preserves ordering and dedup only within the same customer while different customers are processed in parallel, handling 4,000/s. A) Standard does not guarantee ordering or exactly-once. C) A single group gives global ordering but is tied to 300 msg/s, so it cannot take 4,000/s. D) A single shard is insufficient at 1 MB/s and 1,000 RPS.

---

**Question 2.** One S3 object upload must trigger three tasks - thumbnail generation, virus scanning, and search indexing - independently (the failure of one task must not affect the others). What is the most canonical pattern?

A) S3 event → a single Lambda that runs thumbnail, virus scan, and indexing sequentially wrapped in try/catch

B) S3 → SNS → fan-out to three SQS queues (each with a Lambda)

C) S3 → a single SQS → a Lambda receives the message, performs all three tasks, and acks

D) Replicate-upload the same object to three buckets so each bucket's event triggers one task

**Answer: B**

Explanation: Since the **independence** of the three tasks (separate buffers, retries, and DLQs) is the key, **SNS → multiple SQS fan-out** is canonical. Even if virus scanning fails, thumbnails and indexing are unaffected, and SQS retains messages when a consumer is down. A) Sequential execution lets one task's failure block everything and cannot scale independently. C) A single queue is taken by only one consumer, so 1:N does not work. D) Triple-uploading the same object is impractical. (EventBridge multiple targets is also possible, but the "canonical fan-out" is SNS+SQS.)

---

**Question 3.** You want to run real-time anomaly detection on a clickstream with Lambda while also archiving all the raw data to S3 for later analysis with Athena. What is an appropriate configuration?

A) Attach two consumers, an anomaly detection Lambda and an archive Lambda, to a single SQS queue so both receive the same message

B) Connect a Lambda consumer and a Firehose consumer to Kinesis Data Streams at the same time (Firehose → S3)

C) SNS topic → fan out to a detection SQS and an archive SQS, sending to Lambda and S3 respectively

D) Capture clicks table changes with DynamoDB Streams and do Lambda detection and S3 loading at the same time

**Answer: B**

Explanation: With Kinesis Data Streams' **multiple independent consumption**, one stream is read simultaneously by Lambda (real-time detection) and Firehose (S3 archive). Because the data is retained in the log, the two consume at their own positions without interfering. A) SQS delivers a message to only one consumer, so two cannot read the same data. C) SNS is not retained and is unsuitable for streaming. D) DDB Streams is for capturing table changes, not for collecting clickstreams.

---

**Question 4.** You are loading logs into S3 with Firehose and there is a complaint that "data arrives about a minute late." If sub-1-second real-time processing is mandatory, what should you do?

A) Increase the Firehose buffer size to 128 MB so more is flushed at once and arrival is faster

B) Change to consuming Kinesis Data Streams directly (Lambda/EFO)

C) Set the Firehose buffer interval to 0 seconds so delivery is immediate

D) Switch the front end of Firehose to SQS and process within 1 second with a short visibility timeout

**Answer: B**

Explanation: Firehose structurally has **a minimum 60-second buffer** (Near Real-Time), so processing within 1 second is impossible. If ultra-low latency is mandatory, you must **consume Data Streams directly**, and if even lower latency is needed, use EFO (~70 ms). A) Increasing the buffer increases latency. C) The Firehose buffer interval cannot go below 60 seconds. D) SQS is unsuitable for streaming and multiple consumption.

---

**Question 5.** While pushing directly to Lambda through SNS, notifications published while Lambda was briefly down were permanently lost. How do you secure durability?

A) Set the SNS topic's message retention period to 7 days so messages are redelivered after Lambda recovers

B) Change to SNS → SQS → Lambda so SQS retains the messages

C) Increase Lambda reserved concurrency to reduce downtime and secure retry throughput

D) Throttle the SNS publishing rate so only as much as Lambda can handle is sent, preventing loss

**Answer: B**

Explanation: **SNS has no retention**, so a message disappears when retries are exhausted. If SNS **pushes to SQS**, SQS retains it for up to 14 days and safely waits until Lambda comes back. (Alternatively, you can catch failed messages with an SNS subscription DLQ.) A) SNS has no retention period to configure. C and D are unrelated to the cause of the loss.

---

**Question 6.** In a Kinesis stream, only a particular shard throws `ProvisionedThroughputExceededException` while other shards sit idle. What are the cause and the fix?

A) The retention period is short so records expired - fix by extending retention from 24 hours to 7 days

B) A hot shard from partition key skew - raise key cardinality to distribute evenly

C) Read contention because the consumer does not use EFO - enable EFO to resolve the write throttle

D) Capacity is blocked because it is not On-Demand mode - switch from On-Demand to Provisioned

**Answer: B**

Explanation: Throttling on only a particular shard is a symptom of a **hot shard**: skewed partition keys (low cardinality) funnel records into one shard, hitting the limit of 1 MB/s and 1,000 RPS. Keys must be designed to distribute evenly (the same principle as DynamoDB hot partitions). A) Retention is unrelated to write throughput. C) EFO is on the read side. D) Moving to On-Demand may mitigate it, but the root cause is key design.

---

**Question 7.** You need to run multiple Lambdas in order, compensate (roll back) earlier steps upon a mid-way failure, and let operators trace the entire flow visually. What is an appropriate service?

A) A chain where one Lambda invokes the next Lambda directly + calling compensating Lambdas in reverse order on failure

B) Step Functions (Retry/Catch + Saga compensation)

C) A chain with an SQS queue per step where a Lambda passes a message to the next queue when it finishes

D) A chain that routes each step's completion event to the next step's Lambda with EventBridge rules

**Answer: B**

Explanation: "Multi-step + compensation + visibility" is the territory of **orchestration** (Step Functions). The flow is explicitly stated in one place in a state language, so it can be visualized and traced, Catch catches failures and branches to compensation steps (Saga), and Retry retries automatically. A) A direct chain scatters the flow across code, making rollback and tracing hard. C and D make it hard to explicitly manage and visualize order, branching, and compensation.

---

**Question 8.** In a refund workflow, high-value cases must receive administrator approval, and approval can take several days. What is an appropriate configuration?

A) An Express workflow + a Wait state to wait several days until approval arrives

B) A Standard workflow + `.waitForTaskToken` to wait for the approval callback

C) A Standard workflow + `.sync` to synchronously wait until the approval task completes

D) Put the refund message in an SQS delay queue so it is processed automatically several days later

**Answer: B**

Explanation: To wait for human approval (several days), combine **Standard** (up to 1 year) with **`.waitForTaskToken`** (waiting for an external callback). It issues a token and pauses, and when the administrator approves, it resumes with a `SendTaskSuccess` callback. A) Express has a 5-minute limit and cannot wait several days. C) `.sync` is for waiting on machine task completion, not human callbacks. D) A delay queue is just a fixed delay, not "until approved."

---

**Question 9.** A mobile app needs to fetch users (DynamoDB), orders (Lambda), and recommendations (OpenSearch) in one go on a single screen, and receive order status changes in real time. What is an appropriate service?

A) Put an integration backend Lambda behind API Gateway REST that merges the three sources into the response, and poll periodically for status changes

B) AWS AppSync (multiple resolvers + `@aws_subscribe` real-time subscriptions)

C) Call 3 separate REST endpoints for users, orders, and recommendations, and receive status changes through client polling

D) Collect the three sources with Kinesis Firehose, load them to S3, and have the client query from there

**Answer: B**

Explanation: **AppSync** maps a different data source to each field of one GraphQL query as resolvers and gathers them at once (solving under-fetching and multiple round trips), with built-in WebSocket-based real-time subscriptions. A and C) REST needs multiple round trips, does not provide real-time subscriptions by default, and polling is inefficient. D) Firehose is for loading data, not a client API.

---

**Question 10.** A Lambda consumes an SQS queue, but the same message is processed in duplicate. The function timeout is 60 seconds. What is the most appropriate action?

A) Reduce the visibility timeout to 30 seconds

B) Set the visibility timeout to at least 6 times the function timeout (about 360 seconds)

C) Turn off long polling

D) Switching to FIFO solves it unconditionally

**Answer: B**

Explanation: If processing (function execution + batch + poller delay) is longer than the visibility timeout, the lock expires, the message reappears, and it is processed in duplicate. AWS recommends a visibility timeout in a Lambda ESM of **at least 6 times the function timeout**. A) Reducing it worsens duplication. C) Long polling is about the cost of empty responses and is unrelated to duplication. D) FIFO's dedup is also limited to a 5-minute window and cannot prevent consumer-side reprocessing - the fundamental fix is aligning the visibility timeout and idempotency.

---

**Question 11.** You want to preserve and analyze messages that SNS repeatedly failed to deliver to an HTTPS endpoint. What is an appropriate method?

A) Turn on message retention on the SNS topic so failed deliveries remain in the topic

B) Configure an SNS DLQ (an SQS queue) on that subscription with a redrive policy

C) Attach a Lambda DLQ to the subscribed function to preserve failed asynchronous invocation messages

D) Put SQS in front of the HTTPS endpoint and send what exceeds maxReceiveCount to an SQS DLQ

**Answer: B**

Explanation: SNS itself is not retained, but if you configure a **per-subscription DLQ (redrive policy)**, messages that failed delivery after retries are exhausted are sent to the designated SQS queue and preserved. A) There is no retention feature to turn on in SNS. C) The Lambda DLQ is a different layer, for "Lambda asynchronous invocation failure." D) The SQS DLQ is for "SQS queue messages exceeding maxReceiveCount," which differs from the situation here (SNS delivery failure) - even among "DLQs," the layer of failure each catches is different.

---

**Question 12.** Three consumers must each read the same Kinesis stream with latency of tens of ms, and they must not take throughput from each other. What is the appropriate feature?

A) With classic shared reads, shorten the GetRecords polling interval so the three consumers read fast enough

B) Enhanced Fan-Out, providing a dedicated 2 MB/s per consumer through HTTP/2 push

C) Triple the shards so each consumer effectively gets dedicated throughput and lower latency

D) Switch to Firehose so each of the three consumers receives buffered batches

**Answer: B**

Explanation: Classic reads have **all consumers sharing** 2 MB/s per shard and, being polling, have high latency (with 3 consumers, ~0.67 MB/s each). **Enhanced Fan-Out** gives each consumer a dedicated 2 MB/s via HTTP/2 push, reading at ~70 ms without interference. A) Sharing divides throughput and has high latency. C) Even with more shards, classic is still shared, so it is not a fundamental fix. D) Firehose has 60-second buffering, so it is unsuitable for a low-latency requirement.
