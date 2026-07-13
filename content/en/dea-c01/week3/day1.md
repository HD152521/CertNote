# Day 1 - Streaming Processing: Managed Service for Apache Flink and Window Aggregation

Batch processing assumes "we'll process accumulated data later all at once." Streaming processing assumes "we process data the moment it arrives." The difference isn't just fast vs slow. Batch assumes data has boundaries (files, date partitions). Streams handle infinite unbounded data. To compute something like "today's revenue total" from endless data, you have to draw a boundary somewhere artificially. That boundary is called a **window**.

In AWS, **Amazon Managed Service for Apache Flink** handles this streaming aggregation. Formerly "Kinesis Data Analytics," it had SQL and Flink variants; the SQL version (KDA for SQL) stopped accepting new creations in 2023 and Apache Flink is now standard. When you see "real-time stream aggregation, window processing, stateful processing" on an exam, think Managed Flink.

## How Flink Handles Streams: Three Meanings of Time

The core to understanding Flink is distinguishing three kinds of time.

| Time Type | Meaning | Trait |
|-----------|---------|-------|
| Event time | When the event actually occurred | Timestamp embedded in data, most accurate |
| Ingestion time | When data entered Flink | Middle ground |
| Processing time | When operator processed data | Fastest but inaccurate |

Production almost always uses **Event time**. A mobile click that arrives 5 minutes late due to network delay should still be aggregated by "the moment it occurred," not "the moment it arrived." But you can't wait forever for late data. This is where **watermarks** come in.

```java
// Flink DataStream API: Event time + Watermark setup
DataStream<Click> clicks = env
    .fromSource(kinesisSource, WatermarkStrategy
        .<Click>forBoundedOutOfOrderness(Duration.ofSeconds(10))
        .withTimestampAssigner((event, ts) -> event.getEventTime()),
        "kinesis-clicks");
```

A watermark signals "data before this time has almost certainly arrived." `forBoundedOutOfOrderness(10 seconds)` means "assume out-of-order arrival up to 10 seconds." Once watermark passes a window's end time, the system finalizes that window's aggregation and outputs results.

> 💡 **Related theory**: Event time and watermarks were formalized in Google's 2015 **Dataflow Model** paper. Core questions: *What* to compute (aggregation function), *Where* to draw boundaries (windows), *When* to produce results (watermark/triggers), how to *correct* late data (accumulation mode). Flink faithfully implements this model as an open-source engine.

## Window Types: Four Ways to Draw Boundaries

How you draw boundaries on infinite streams determines window type.

```
Tumbling – non-overlapping fixed intervals
|--5min--|--5min--|--5min--|
   agg     agg     agg

Sliding – overlapping intervals
|----10min----|
     |----10min----|   (slides every 5min)

Session – gaps in activity
|clicks clicks clicks| ...30sec inactive... |clicks clicks|
   Session 1                                 Session 2
```

| Window | Definition | Typical Use |
|--------|-----------|------------|
| Tumbling | Fixed size, non-overlapping | "Revenue sum every 5 minutes" |
| Sliding | Fixed size, slides periodically | "Rolling 10-min average, every 5 min" |
| Session | Activity gap-based | "Page views per user session" |
| Global | No boundary, custom trigger | "Process every 100 records" |

```java
// Tumbling window: revenue by product, every 1 minute
clicks
    .keyBy(Click::getProductId)
    .window(TumblingEventTimeWindows.of(Time.minutes(1)))
    .sum("quantity");

// Session window: sessions separated by 30-second inactivity
clicks
    .keyBy(Click::getUserId)
    .window(EventTimeSessionWindows.withGap(Time.seconds(30)))
    .aggregate(new PageViewCounter());
```

`keyBy` is like SQL's `GROUP BY`. It partitions the stream by key and maintains independent windows per key. Product A's window and Product B's don't interfere.

> 🔍 **Going deeper**: Sliding windows are memory-hungry. A 10-minute window sliding every 1 minute means each event belongs to 10 windows simultaneously. You maintain 10x state per event. As slide interval shrinks, cost explodes, so ask "do we really need that precision?"

## State and Checkpoints: Surviving Failures

Stream aggregation is inherently **stateful**. You hold intermediate state like "cumulative sum so far: 1,250" in memory. If a node dies, that state vanishes. Flink solves this with **checkpoints**.

```java
env.enableCheckpointing(60_000);  // Checkpoint every 60 seconds
env.getCheckpointConfig()
   .setCheckpointingMode(CheckpointingMode.EXACTLY_ONCE);
```

Periodically, checkpoints snapshot all operator state consistently and persist to durable storage (auto-managed S3 in Managed Flink). On failure, state recovers from the last checkpoint, and the source (Kinesis) offset rewinds to that point for replay. This is the foundation of **Exactly-Once** semantics.

> 💡 **Related theory**: Flink's checkpoint is a variant of the **Chandy-Lamport distributed snapshot algorithm** from 1985. Special markers called "barriers" are injected into the stream, and operator state is recorded as each barrier passes through. The snapshot at the moment all operators process the same barrier is globally consistent. This algorithm lets you take consistent snapshots without halting the stream.

## Real-Time Transformation: Simple Mapping to Stream Joins

Flink doesn't just aggregate. It transforms, cleanses, and enriches records in real-time.

```java
// 1. Simple transformation and filter
DataStream<Order> validOrders = rawOrders
    .map(json -> parseOrder(json))
    .filter(order -> order.getAmount() > 0);

// 2. Stream join: orders + user profiles
orders
    .keyBy(Order::getUserId)
    .intervalJoin(profiles.keyBy(Profile::getUserId))
    .between(Time.minutes(-5), Time.minutes(5))
    .process(new EnrichOrderWithProfile());
```

`intervalJoin` joins two streams within a time range. Order events match with profile events arriving ±5 minutes around them. Joining infinite streams requires bounding "how far back to match," otherwise state grows unbounded, so time boundaries are mandatory.

Transformed results sink downstream — Kinesis Data Streams, MSK (Kafka), S3, OpenSearch, DynamoDB. A common pattern is "Kinesis → Flink aggregation → S3 (raw preservation) + OpenSearch (real-time dashboard)" fan-out.

> 🎯 **Scenario**: A gaming company wants "concurrent users by region, last 5 minutes" on a real-time dashboard. Setup: (1) Game client sends connection events to Kinesis Data Streams → (2) Managed Flink `keyBy` region and 5-minute sliding window to count distinct users → (3) Sink results to OpenSearch → (4) Visualize with OpenSearch Dashboards. Set watermark to 30sec to include slightly late events.

## Managed Flink Operations: Core to Know

Managed Flink abstracts server management but you must understand **KPU (Kinesis Processing Unit)**, the capacity unit. 1 KPU = 1 vCPU + 4GB memory. Higher parallelism needs more KPUs and costs scale accordingly.

| Operation | Content |
|-----------|---------|
| Parallelism | Concurrent tasks, scales with KPU |
| Auto Scaling | KPU auto-adjust by load (optional) |
| Checkpoints/Snapshots | Auto-managed; app updates restore from savepoint without downtime |
| Monitoring | CloudWatch tracks `millisBehindLatest`, `numRecordsIn`, etc. |

`millisBehindLatest` shows "how far behind the stream's latest data we are" — the most critical metric. If it keeps increasing, processing can't keep up with ingestion, so raise parallelism/KPU or add source shards.

> ⚠️ **Pitfall**: On exams, "real-time ETL/aggregation = Managed Flink," but **simple transformation-only to S3 is cheaper with Firehose + Lambda**. Choose Flink for window aggregation, stream joins, complex stateful processing. Using Flink to "just convert format and dump to S3" is over-engineering.

## Summary: The Boundary Between Batch and Stream

Today's core: "How to draw boundaries on infinite data." Windows draw boundaries, watermarks decide "when to output," checkpoints guarantee "exactly-once despite failures." These three axes are streaming processing. Tomorrow we move to how this ingestion pipeline maintains reliability amid failures, duplicates, and reordering.

---

## 📝 Practice Problems

**Problem 1.** Mobile click events arrive out-of-order due to network latency. To aggregate by actual occurrence time while tolerating late arrivals for a bounded period, what must you configure in Flink?

A) Event time and Watermark (forBoundedOutOfOrderness)  
B) Processing time and Tumbling window  
C) Ingestion time and Global window  
D) Processing time and Session window  

**Answer: A**  
Explanation: Accurate aggregation by occurrence time requires Event time; tolerating out-of-order late arrivals within bounds requires Watermark. `forBoundedOutOfOrderness(Duration)` specifies maximum disorder tolerance. Processing time tracks processing moment, not arrival or occurrence of late events.

---

**Problem 2.** "Revenue total every 5 minutes in non-overlapping intervals" — which window type fits?

A) Sliding window  
B) Session window  
C) Tumbling window  
D) Global window  

**Answer: C**  
Explanation: Non-overlapping fixed intervals = Tumbling. Sliding windows overlap (moving average, etc.) and use more memory. Session windows separate by inactivity gaps. Global has no boundary, requiring custom triggers.

---

**Problem 3.** A Managed Service for Apache Flink app's `millisBehindLatest` metric keeps increasing over time. Best interpretation and action?

A) Normal, ignore  
B) Processing can't keep up; raise parallelism/KPU or add source shards  
C) Checkpointing is disabled, so disable it  
D) Data is being lost, remove windows  

**Answer: B**  
Explanation: `millisBehindLatest` measures lag behind stream's latest data. Continuous increase means processing delay is accumulating; fix by raising parallelism/KPU or adding Kinesis shards. Disabling checkpoints damages durability and is wrong.

---

**Problem 4.** You only need to convert incoming JSON format and load to S3; no window aggregation or stream joins. Most cost-efficient and simple choice?

A) Managed Service for Apache Flink  
B) EMR Spark Streaming cluster  
C) Redshift Streaming Ingestion  
D) Kinesis Data Firehose + Lambda transformation  

**Answer: D**  
Explanation: Simple format conversion to S3 without stateful processing is cheapest and simplest with Firehose + Lambda. Flink and EMR suit complex stateful work and would be over-engineered here. Redshift Streaming Ingestion is for direct Redshift loading, different purpose.

---

**Problem 5.** What core mechanism lets Flink guarantee "exactly-once" processing after node failure?

A) Periodic checkpoints (distributed snapshots) save state; on failure, restore with source offset rewind for replay  
B) Duplicate all data to DynamoDB  
C) Isolate failures to SQS DLQ  
D) S3 versioning  

**Answer: A**  
Explanation: Flink uses Chandy-Lamport-based distributed snapshots (checkpoints) to save all operator state consistently. On failure, state restores from the last checkpoint while source (Kinesis) offset rewinds for replay. This combination delivers exactly-once semantics. Others serve different purposes.

---
