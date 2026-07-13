# Day 5 - Week 3 Synthesis: Data Ingestion Part 2 Review

This week we tackled the "harder half" of data ingestion. Week 2 was foundational "how to receive data"; Week 3 was "how to make it robust when data flows endlessly, failures happen, operational DBs can't stop, and multiple components intertwine." Today we reassemble scattered pieces into one picture.

One core question ties them together: **"How do we ingest endless flowing data — amid duplicates, reordering, failures — without stopping operational systems, so multiple consumers each use it?"** This week's five days precisely correspond to five parts of that question.

## Week 3 at a Glance

| Day | Topic | Core One-Liner |
|-----|-------|-----------------|
| Day 1 | Streaming Processing (Managed Flink) | Draw boundaries on infinite streams with windows; set result timing with watermarks |
| Day 2 | Ingestion Reliability | at-least-once delivery + idempotent consumer = effectively-once |
| Day 3 | CDC / DMS | Don't re-read everything; follow changes via transaction logs |
| Day 4 | Architecture Patterns | Design processing with Lambda/Kappa; design coupling with SQS/SNS/EventBridge |

## Flow Perspective: One Pipeline

Place this week's concepts into a single hypothetical pipeline.

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
   │  Checkpoint for exactly-once processing
   ├─→ OpenSearch (realtime dashboard)
   └─→ Failed records → (Day 2) SQS DLQ / OnFailure destination
```

All of this week fits here. DMS captures operational DB changes without downtime (Day 3), Kinesis guarantees order (Day 2), one path loads S3 (batch), other runs Flink realtime aggregation (Day 1) — classic Lambda Architecture (Day 4). Processing failures isolate to DLQ (Day 2), components loosely couple via streams/queues (Day 4).

> 💡 **Related theory**: This pipeline shows two immutable principles of data engineering. First, **immutable raw preservation** — S3 raw layer never modifies; mistakes correct via reprocessing. Second, **multiple views from single source of truth** — same data reconstructs as batch and realtime views independently. Ingestion design robustness comes from upholding these.

## Frequently Confused Choice Pairs

Exam confusions grouped by pairs.

| Situation | Choose | Why |
|-----------|--------|-----|
| Window aggregation·stream join·stateful | Managed Flink | Complex stateful processing |
| Simple transform then S3 load | Firehose + Lambda | Flink is over-engineering |
| Correctness amid duplicates | Idempotent consumer (DynamoDB conditional write) | exactly-once delivery impossible |
| Per-user order guarantee | Kinesis PartitionKey=userId / SQS FIFO GroupId | Partition/group-level order only |
| Operational DB zero-downtime replicate | DMS Full Load + CDC | Standard zero-downtime migration |
| Schema·stored procedure conversion | SCT | DMS handles data only |
| One event → multiple durable consumers | SNS → SQS fan-out | Distribution + buffering |
| Content-based routing, AWS events | EventBridge | Pattern matching + service events |
| Realtime-first, no logic duplication | Kappa | Stream single + replay |

> ⚠️ **Pitfall collection**: (1) CDC broken? Check source log config (binlog ROW / wal_level=logical / supplemental logging). (2) SQS visibility timeout < actual processing = duplication. (3) Flink `millisBehindLatest` increasing = insufficient throughput, raise parallelism/shards. (4) SNS alone risks consumer-downtime loss → add SQS if durability needed. (5) Lambda Architecture's hidden cost: logic implemented twice.

## Core Concept Self-Check

Can you answer these?

```
□ Event time / Processing time / Ingestion time difference?
□ What does watermark decide? (→ when to finalize window result)
□ Distinguish Tumbling / Sliding / Session in one line?
□ "Exactly-once delivery impossible but ___ processing possible" blank? (→ exactly-once)
□ Who assigns idempotency key? (→ producer)
□ Kinesis order-guarantee unit? SQS FIFO order-guarantee unit?
□ Why add jitter to exponential backoff? (→ scatter thundering herd)
□ What does DLQ's maxReceiveCount mean?
□ DMS Full Load + CDC's 3-step operation?
□ What does CDC read? (→ transaction logs)
□ Lambda vs Kappa core trade-off? (→ logic duplication vs replay)
□ SQS / SNS / EventBridge one-line role distinction?
```

> 🎯 **Synthesis scenario**: Global game company wants "near-real-time reflection of operational DB payment records to data lake, simultaneously displaying last 5 minutes' regional revenue on realtime dashboard." Design: (1) DMS CDC sends payment DB changes to Kinesis (Day 3) → (2) PartitionKey=region maintains per-region order (Day 2) → (3) Firehose loads Parquet to S3 raw (batch path) → (4) Managed Flink aggregates 5-min Tumbling window by region, sinks to OpenSearch (realtime path, Day 1) → (5) Overall Lambda Architecture (Day 4), failure isolation to DLQ (Day 2), idempotency handles CDC retransmission duplicates (Day 2). One problem encompasses all of Week 3.

## Bridge to Next Week

Through Week 3 we've learned every way to ingest data robustly — via streams, change capture, reliability, loose coupling. Ingested data must now **persist** and **transform**. Next topic naturally follows: "storage and transformation" — data lake design, file formats (Parquet/ORC) and compression, partitioning, and serious transformation work with Glue/EMR/Spark. The arrow endpoints of today's pipeline (S3, Redshift, OpenSearch) become next week's starting points.

Ingestion is the pipeline's front door. Shaky door shakes all analysis behind. This week's idempotency, ordering, retries, CDC, event coupling aren't glamorous, but they're the bedrock keeping data engineers sleeping at night in production.

---

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
