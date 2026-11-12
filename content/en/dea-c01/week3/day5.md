# Day 5 - Week 3 Synthesis: Data Ingestion Part 2 Review

## 📌 Key Takeaways

- Week 3's four axes are **stream processing (Managed Flink), ingestion reliability, CDC (DMS), and combination patterns**, and they interlock within a single pipeline.
- Delivery is at-least-once by default. Adding an **idempotent consumer** makes it effectively-once, and ordering is guaranteed only per shard or message group.
- Service choice splits on three questions: "**Is replay needed, are per-message deletion and retry needed, or must routing be done by content?**"
- For failure problems, trace backward from the symptom to the cause — duplicate processing points to the visibility timeout, missing CDC changes to the source log settings, and growing lag to processing capacity.
- Do not discard failed records; isolate them into a DLQ or an on-failure destination, fix the cause, and then reprocess.

## Week 3 on One Page

This week we tackled the "harder half" of data ingestion. Week 2 was the foundation of "how to receive data"; Week 3 was "how to make it robust when that ingestion is real time, failures happen, the operational DB cannot stop, and many components are intertwined." Today we reassemble the scattered pieces into one picture.

One core question ties them together: **"How do we ingest endlessly flowing data — amid duplicates, reordering, and failures — without stopping operational systems, so that multiple consumers can each use it?"** This week's five days correspond precisely to five parts of that question.

| Day | Topic | Core one-liner |
|-----|------|------------|
| Day 1 | Streaming processing (Managed Flink) | Draw boundaries on infinite streams with windows, and set result timing with watermarks |
| Day 2 | Ingestion reliability | at-least-once delivery + idempotent consumer = effectively-once |
| Day 3 | CDC / DMS | Do not re-read everything; follow only the changes through the transaction log |
| Day 4 | Architecture patterns | Design processing with Lambda/Kappa, and design coupling with SQS/SNS/EventBridge |

## Reading It Again as a Flow: One Pipeline

We place this week's concepts into a single hypothetical pipeline.

```
[Operational RDS MySQL]
   │  (Day 3) DMS Full Load + CDC, binlog ROW required
   ▼
[Kinesis Data Streams]  ── PartitionKey=userId (Day 2 order guarantee)
   │
   ├─(Day 4 fan-out)→ [Firehose] → S3 raw  ──(Day 4 Batch Layer)
   │
   ▼ (Day 1 Speed Layer)
[Managed Flink]  Event time + Watermark + Tumbling window
   │  Exactly-once processing via checkpoints
   ├─→ OpenSearch (real-time dashboard)
   └─→ Failed records → (Day 2) SQS DLQ / OnFailure destination
```

All of this week is in this picture. DMS captures the operational DB's changes without downtime (Day 3), Kinesis receives them while guaranteeing order (Day 2), and one side loads into S3 (batch) while the other aggregates in real time with Flink (Day 1) — a typical Lambda architecture (Day 4). Processing failures are isolated into a DLQ (Day 2), and the components are loosely coupled through streams and queues (Day 4).

This pipeline shows two immutable principles of data engineering. First, **immutable raw preservation** — the S3 raw layer is never modified, and mistakes are corrected by reprocessing. Second, **multiple views from a single source of truth** — the same data is reconstructed as a batch view and a real-time view, each independently. The robustness of an ingestion design comes from upholding these two principles.

## Summary of Frequently Confused Choices

We group the pairs that cause "which one do I pick" confusion on the exam.

| Situation | Choice | Reason |
|------|------|------|
| Window aggregation, stream joins, stateful processing | Managed Flink | Complex stateful processing |
| Simple transform then S3 load | Firehose + Lambda | Flink is over-engineering |
| Correctness in an environment where duplicates are possible | Idempotent consumer (DynamoDB conditional write) | Exactly-once delivery is impossible |
| Per-user order guarantee | Kinesis PartitionKey=userId / SQS FIFO GroupId | Order per partition/group |
| Zero-downtime analytics replication of an operational DB | DMS Full Load + CDC | The standard zero-downtime migration |
| Schema and stored procedure conversion | SCT | DMS handles data only |
| One event → multiple durable consumers | SNS → SQS fan-out | Distribution + buffering |
| Content-based routing, AWS events | EventBridge | Pattern matching + service events |
| Real-time focus without duplicated logic | Kappa | Single stream + replay |

> ⚠️ **Pitfall collection**: (1) If CDC does not work, suspect the source log settings first (binlog ROW / wal_level=logical / supplemental logging). (2) If the SQS visibility timeout is shorter than the actual processing time, duplicate processing occurs. (3) Flink `millisBehindLatest` rising continuously = insufficient throughput, so you must raise parallelism/shards. (4) SNS alone risks loss when a consumer is down → insert SQS if durability is needed. (5) The hidden cost of the Lambda architecture is implementing the logic twice.

## Core Concept Self-Check

Check whether you can answer these on your own.

```
□ What is the difference between Event time / Processing time / Ingestion time?
□ What does a watermark decide? (→ when to finalize window results)
□ Can you distinguish Tumbling / Sliding / Session windows in one line each?
□ Fill in the blank: "exactly-once delivery is impossible, but ___ processing is possible" (→ exactly-once)
□ Who must assign the idempotency key? (→ the producer)
□ What is the unit of order guarantee for Kinesis / for SQS FIFO?
□ Why add jitter to exponential backoff? (→ to spread out the thundering herd)
□ What does the DLQ's maxReceiveCount mean?
□ What are the 3 stages of DMS Full Load + CDC?
□ What does CDC read? (→ the transaction log)
□ What is the core trade-off between Lambda and Kappa? (→ duplicated logic vs replay)
□ Can you state the one-line role of each of SQS / SNS / EventBridge?
```

> 🎯 **Comprehensive scenario**: A global game company wants to "reflect the operational DB's payment records into the data lake in near real time, and at the same time show the last 5 minutes of sales by region on a real-time dashboard." Design: (1) send payment DB changes to Kinesis with DMS CDC (Day 3) → (2) keep per-region order with PartitionKey=region (Day 2) → (3) Firehose loads Parquet into S3 raw (batch path) → (4) Managed Flink aggregates sales in 5-minute Tumbling windows per region and sinks to OpenSearch (real-time path, Day 1) → (5) the whole is a Lambda architecture (Day 4), processing failures are isolated in a DLQ (Day 2), and idempotency neutralizes the duplicates from CDC retransmission (Day 2). This single question ties together all of Week 3.

## Stream, Queue, Topic, Bus: The Axes That Separate Four Services

If you place Kinesis Data Streams, SQS, SNS, and EventBridge, which we saw separately in Day 2 and Day 4, on the same axes, the choice becomes easy. The key is "what happens after a message is read."

| Distinguishing axis | Kinesis Data Streams | SQS | SNS | EventBridge |
|---------|----------------------|-----|-----|-------------|
| Model | Log (stream) | Queue | Pub/sub topic | Event bus |
| Data after reading | Stays (expires only after the retention period) | Disappears only when the consumer deletes it | Not stored; pushed to subscribers | Not stored; delivered to targets that match rules |
| Multiple consumers | Each reads the same data from its own independent position | One message is processed by one consumer | Replicated to every subscriber | Delivered to each target matched by a rule |
| Replay | Possible within the retention period | Not possible (once deleted, it is gone) | Not possible | Only if you have set up an archive separately |
| Order | Within a shard | FIFO within a message group; Standard has no guarantee | Standard topics have no guarantee | No guarantee |
| Retention | Default 24 hours, up to 365 days | Default 4 days, minimum 60 seconds to maximum 14 days | — | — |
| Delivery failure | The consumer re-reads the same position | Reappears after the visibility timeout → DLQ | DLQ after retries (if configured) | Discarded after retrying 24 hours by default and up to 185 times; a DLQ can be configured |

- **If you need replay, it is a stream.** If you must replay past data after fixing a bug in the aggregation logic (Kappa), or a new consumer must read from a past point in time, a queue or topic will not do. Setting Kinesis retention longer than 24 hours adds charges, so for the farther past it is cheaper to reprocess from the S3 raw data.
- **If you want to manage the success and failure of each message separately, it is a queue.** SQS supports deletion, retry, and DLQ isolation per message. A stream is read in order within a shard, so the failure of one record blocks the records after it.
- **The capacity sizing method differs.** In Kinesis provisioned mode, the baseline per shard is write 1 MB/second or 1,000 records/second and read 2 MB/second, so you must calculate the shard count yourself. On-demand mode adjusts the shard count automatically to match traffic. SQS Standard effectively needs no capacity sizing.
- **When consumers increase, they share the read limit.** The shard's read 2 MB/second is shared among the consumers reading with `GetRecords`. If there are several consumers and latency is a problem, use enhanced fan-out (registered consumers) so each consumer gets dedicated throughput.

> ⚠️ **Pitfall**: If you choose SQS FIFO just from the clue "order guarantee + exactly once," you are only half right. FIFO's deduplication only filters out retransmissions from **the sending side** within a 5-minute window. If a consumer dies partway through processing and the visibility timeout passes, it receives the same message again. The consistency of processing results is still the idempotent consumer's responsibility.

## From Symptom to Cause: A Failure Trace-Back Table

Most failure questions on the exam take the form "This symptom is seen. What are the cause and the remedy?" We gather this week's symptoms in one table.

| Symptom | Most common cause | Remedy |
|------|----------------|------|
| The same SQS message is processed twice | The visibility timeout (default 30 seconds) is shorter than the actual processing time | Set the timeout longer than the maximum processing time, or extend it during processing with `ChangeMessageVisibility` (up to 12 hours from the first receipt) |
| Only a particular group is stuck in a FIFO queue | While an earlier message of the same `MessageGroupId` is being processed, later messages do not come out | Move the poison message to the DLQ, and split group IDs more finely to gain parallelism |
| A retransmission long afterward arrives as a duplicate | It is outside the FIFO deduplication window (5 minutes) | Set the period yourself with an idempotency table based on DynamoDB conditional writes |
| Only a particular Kinesis shard gets write throttling | A hot shard from a skewed partition key. The same key always goes to the same shard | Raise the key's cardinality. Adding shards does not split one key's traffic |
| Processing of one shard stops in Kinesis→Lambda | The default behavior is to retry a failed batch until the records expire | Set limits with `MaximumRetryAttempts` and `MaximumRecordAgeInSeconds`, and configure `BisectBatchOnFunctionError` and a failure destination |
| Flink `millisBehindLatest` keeps rising | Processing capacity cannot keep up with the inflow | Raise parallelism (KPU), and check the source shard count and hot keys together |
| DMS Full Load finished but changes do not arrive | Source log settings are missing (binlog ROW / `wal_level=logical` / supplemental logging) | Turn on the source settings and restart the task |
| Only `CDCLatencyTarget` rises | Writing to the target is the bottleneck | Look at the target's load and commit burden and its capacity. It is not a source-side problem |
| Events are occasionally missing at an EventBridge target | Events that exhaust their retries are discarded | Attach a DLQ to the target to receive the failed events |

If you designate SQS or SNS as the failure destination for Kinesis→Lambda, only **metadata, not the record body** (stream ARN, shard ID, start and end sequence numbers) is delivered. The original must be re-read from the stream using those sequence numbers, so you must investigate before the stream's retention period passes. If you designate S3 as the destination, the whole invocation record is stored along with it. This differs from an SQS DLQ, which moves the message itself over.

## The Scope That "Exactly-Once" Refers To

The word exactly-once came up several times this week, but the scope it refers to differs each time. In the options, you must distinguish "a guarantee at which layer."

- **Flink checkpoint exactly-once** is a guarantee about Flink's internal state. When a failure occurs, it returns to the last checkpoint and re-reads the source, so results that already went out to the sink in between can go out once more. Only if the sink is idempotent (overwriting with the same key) or supports transactions is consistency correct end to end.
- **SQS FIFO exactly-once** is about preventing duplicates from entering the queue (the 5-minute window). Redelivery on the consuming side remains, as in the pitfall above.
- So whichever combination you use, the last line of defense is the same — make **the writing side idempotent**. Conditional writes, natural-key upserts, and partition-level overwrites are the tools.

In the formula "simple transform then S3 load is Firehose + Lambda," Lambda is not always needed. Converting JSON to Parquet/ORC is done directly by Firehose's **record format conversion** feature, which references the schema of a Glue Data Catalog table. When the input is not JSON (CSV, log text, and so on), a Lambda transformation is needed in the step that first converts it to JSON. Either way it is a stateless transformation, so the conclusion that there is no reason to use Flink is the same.

## Scenario Practice: From Clues to Choices

| Clues in the scenario | Deciding point | Choice |
|-----------------|-------------|------|
| Click logs are used together by a real-time dashboard and a nightly batch, and after fixing an aggregation bug the past 3 days must be recalculated | Multiple consumers + replay | Kinesis Data Streams (extended retention) + Flink, with raw data preserved in S3 through Firehose |
| A worker processes order messages one at a time, and only the failed ones are collected separately for reprocessing. Order does not matter | Per-message retry and isolation | SQS Standard + DLQ |
| Deposits and withdrawals per account are processed in order, and different accounts are processed in parallel | Group-level order | SQS FIFO (`MessageGroupId`=account) or Kinesis (partition key=account) |
| When an object lands in S3, route it to different processing depending on prefix and size conditions | Content-based routing + AWS service events | EventBridge rule |
| Keep reflecting an on-premises Oracle's changes into an S3 data lake without interruption | Heterogeneous + zero-downtime + continuous replication | DMS Full Load + CDC (the target is S3, so there is no schema or code to convert and SCT is unnecessary) |
| Just convert JSON events to Parquet and pile them into S3 | Stateless format conversion | Firehose format conversion. Flink is overkill |
| Join two streams over a 10-minute range to catch fraudulent transactions | State, windows, joins | Managed Service for Apache Flink |
| Three teams process one event each at their own pace without loss | Distribution + per-team durable buffer | SNS → SQS fan-out (a DLQ on each queue) |

Next week we move to the side that stores and transforms the data received this way — partitioning and file formats, and transformation processing with Glue, EMR, and Spark. The ends of the arrows in the pipeline we drew today (S3, Redshift, OpenSearch) are its starting point.

## 📖 Glossary

- **effectively-once** : A way to make the processing result the same as if processed once, even though delivery may be duplicated. It is the combination of at-least-once delivery and an idempotent consumer.
- **Idempotent consumer** : A processor built so that receiving the same message several times does not change the result. It is usually implemented with a unique ID and conditional writes.
- **Visibility timeout** : In SQS, the time a message is hidden from other consumers while one consumer receives and processes it.
- **DLQ (Dead-Letter Queue)** : A queue that collects separately the messages that failed a set number of times. It lets you investigate the cause without blocking the normal flow.
- **Replay** : Re-reading past data remaining in a stream from the beginning (or a particular point) to reprocess it.
- **Hot shard** : A state where the partition key is skewed to one side and traffic concentrates on only a particular shard.
- **CDC (Change Data Capture)** : A way to replicate by catching only the changed content from the transaction log instead of re-reading the whole table.
- **Fan-out** : Replicating one message to multiple recipients and distributing it. SNS → multiple SQS queues is the representative pattern.
- **Watermark** : A signal announcing that "events before this time have almost all arrived." It decides when to finalize window results.

## 📝 Practice Problems

**Problem 1.** Most accurate reliability proposition spanning Week 3?

A) Distributed systems always guarantee exactly-once delivery  
B) Always use SQS FIFO only to prevent duplicates  
C) Exactly-once delivery is hard, but at-least-once delivery + idempotent consumer = effectively-once processing  
D) Order guarantee must always be global  

**Answer: C**  
Explanation: Delivery depends on network (uncontrollable), so exactly-once delivery is hard. Instead, at-least-once delivery + idempotent consumer makes duplication harmless = effectively-once processing. SQS FIFO dedup has 5-min window limits, global order severely cuts throughput so usually partition-level only.

---

**Problem 2.** When to choose Firehose + Lambda transform (Day 4 simple path) over Managed Flink (Day 1)?

A) Convert incoming JSON to Parquet format only, load to S3  
B) Join two streams within time range to enrich data  
C) Aggregate page views per user session via session window  
D) Calculate last 10-min moving average via sliding window  

**Answer: A**  
Explanation: Window aggregation (C, D) or stream joins (B) are stateful Flink work. Simple format transform then S3 load is simpler, cheaper with Firehose + Lambda; Flink is over-engineering.

---

**Problem 3.** DMS zero-downtime replication: Full Load succeeds but subsequent changes don't reflect. First check?

A) Target Endpoint color setting  
B) Migration Task creation time  
C) Replication Instance name  
D) Source DB change log config (MySQL binlog ROW, PostgreSQL wal_level=logical, Oracle supplemental logging)  

**Answer: D**  
Explanation: CDC reads source transaction logs; requires log feature enabled. Without it, Full Load works but CDC fails. This is the most common cause.

---

**Problem 4.** One "order created" event: payment, inventory, analytics each process independently, no loss amid temporary downtime. Permanent failures isolated. Best combination?

A) Single SQS Standard + three consumers + visibility timeout 0  
B) SNS fan-out → domain SQS queues (each DLQ attached) → consumers process idempotently  
C) Three domains synchronous REST chained  
D) EventBridge without Lambda chaining  

**Answer: B**  
Explanation: SNS fans to three SQS queues (1:N), each buffers durably (survives downtime), each SQS's DLQ isolates permanent failures. Consumers process idempotently. Single queue doesn't fan-out; sync calls are tight coupling.

---

**Problem 5.** Simplifying Lambda to Kappa Architecture: gains and new constraints correctly paired?

A) Gain: eliminate logic duplication / Constraint: full reprocess via stream replay only, within retention window  
B) Gain: zero storage cost / Constraint: realtime processing impossible  
C) Gain: automatic order guarantee / Constraint: batch analysis impossible  
D) Gain: DLQ unnecessary / Constraint: idempotency unnecessary  

**Answer: A**  
Explanation: Kappa removes batch layer, eliminating dual logic implementation burden. Trade-off: full reprocess requires stream replay within retention window; beyond that needs separate storage (S3). Others are false.

---
