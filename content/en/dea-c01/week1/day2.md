# Day 2 - Batch vs Streaming

## 📌 Key Takeaways

- **Batch** processes bounded data periodically, while **streaming** processes an unbounded flow continuously. Streaming has to cut the flow into windows before an aggregate can come out.
- There is exactly one selection criterion: "how fresh does the result need to be?" Real time costs you always-on infrastructure and operational complexity, so pin down the required latency as a number first.
- Batch is strong on throughput and correctness; streaming is strong on low latency. Micro-batch (Spark Structured Streaming, Glue streaming) is the compromise between them.
- AWS mapping: batch = Glue, EMR, AWS Batch; streaming = Kinesis Data Streams, MSK + Managed Service for Apache Flink, Lambda; near-real-time loading = Data Firehose.
- Do not choose based on the word "real-time" alone. If you only need to land data at a destination, it is Firehose; if you need multiple consumers, reprocessing, or stateful aggregation, it is a stream plus a processing engine.

## The Essence of the Two Paradigms

Even with the same data, the system design changes completely depending on "when, and how much at a time" you process it. Gathering a day's worth of orders every night to build a settlement report, and catching a fraudulent transaction the instant a payment happens, handle the same payment data but need entirely different machinery. The former is **batch**, the latter is **streaming**.

Today we look at the essence of these two processing paradigms, the cases each one suits, and the key trade-off that separates them: latency and throughput. The very first judgment a data engineer makes when designing a new pipeline is "is this batch or a stream?"

The difference is **whether you process data in bundles or as it arrives**.

```
Batch
  [····· collect ·····] → process all at once → result
  Bounded data, run on a fixed schedule

Streaming
  → arrive → process → arrive → process → arrive → process →
  Unbounded data, flows without end
```

Batch deals with a **finite bundle**: "what piled up over the last hour/day." It has a clear start and end. Streaming deals with an **infinite flow**: "events that keep coming from now on, forever." Because it never ends, to produce a result you have to cut the flow into time windows such as "the last 5 minutes."

| Aspect | Batch | Streaming |
|------|------|---------|
| Data | Bounded | Unbounded |
| Execution | Periodic (hourly/daily) | Continuous (always on) |
| Latency | Minutes to hours | Milliseconds to seconds |
| Throughput | Very high | Per-record processing |
| AWS examples | Glue, EMR, Batch | Kinesis, MSK, Flink |

> 💡 **Related theory**: The most important concept in streaming is **windowing**. To produce an aggregate from an infinite flow, you have to cut the flow into time units. The typical types are the tumbling window (fixed, non-overlapping intervals), the sliding window (overlapping and moving), and the session window (separated by gaps in activity). In addition, dealing with the difference between "the time the event occurred (event time)" and "the time the system received it (processing time)" is the central hard problem of streaming design.

## When to Use Each

There is only one criterion for choosing: **how fresh does the result need to be?**

**Cases where batch fits:**
- Jobs with a fixed cycle, such as month-end settlement or a daily sales report
- Reprocessing large volumes of historical data (backfill)
- Analysis where a delay of a few minutes to a few hours is acceptable
- Preparing large-scale training data for machine learning models

**Cases where streaming fits:**
- Real-time fraud and anomalous-transaction detection
- Live dashboards, real-time monitoring and alarms
- Immediate processing of IoT sensor data
- Cases that must react instantly to user behavior, such as recommendations and personalization

```python
# Batch: collect a day of logs and aggregate once (Glue/Spark)
df = spark.read.parquet("s3://logs/date=2026-06-25/")  # the whole day
daily = df.groupBy("region").agg(sum("amount"))
daily.write.parquet("s3://reports/daily/2026-06-25/")

# Streaming: aggregate flowing events in 5-minute windows (Flink/KDA)
events.window(TumblingWindow.of(minutes=5)) \
      .key_by("region") \
      .aggregate(SumAggregator())  # emits a result every 5 minutes, endlessly
```

The key point is that **"real time is expensive."** Streaming demands always-on infrastructure and more complex operations. That is why asking "do we truly need real time, or is 5 minutes late okay?" is the starting point of cost optimization. If you vaguely go with "fresh data is good, so stream everything," cost and complexity explode.

Micro-batch is the midpoint between the two. Like Spark Structured Streaming, it repeatedly runs small batches at a very short interval (a few seconds) to produce "near real time." It achieves second-level latency while being simpler to operate than true event-by-event streaming, so many real-world pipelines choose this compromise.

## The Latency vs. Throughput Trade-off

These are the two metrics that quantitatively separate batch from streaming.

- **Latency**: the time from when data is generated until a result comes out. The lower it is, the closer to "real time."
- **Throughput**: the amount of data that can be processed per unit time. The higher it is, the better it handles "large volumes."

```
Batch   : latency high ↑   throughput very high ↑↑↑
Stream  : latency low ↓    per-record processing → cumulative throughput is lower
```

Because batch collects data and processes it all at once, **the per-record overhead is amortized, so throughput is overwhelmingly high**. In exchange, latency arises equal to the time spent collecting. Because streaming processes events the moment they arrive, **latency is very low**, but each record incurs processing and delivery cost, so the cumulative throughput the same infrastructure can deliver is lower than batch.

On top of this comes the axis of **correctness**. Streaming has to deal with late-arriving data and out-of-order events, so it must compromise between an "exact final result" and a "fast approximate result." Batch processes after all the data has arrived, so it is free of this problem.

```
        correctness ↑
          │
   batch ● │
          │      ● micro-batch
          │
          │            ● streaming
          └──────────────────→ freshness (low latency) ↑
```

The classic solution to this trade-off at the architecture level is the **Lambda Architecture**. It runs a batch layer (accurate but slow) and a speed layer (fast but approximate) at the same time and merges them in a serving layer. Because of the burden of maintaining two copies of the code, the **Kappa Architecture**, which handles even batch with a single streaming engine, emerged as an alternative. On AWS, the Kinesis/MSK + Flink combination corresponds to Kappa.

## Mapping to AWS

This is the baseline that decides "which service to use for this scenario" on the exam.

| Paradigm | Ingestion | Processing | Representative scenario |
|---------|------|------|------------|
| Batch | S3 landing, DataSync | Glue, EMR, AWS Batch | Daily reports, large-scale ETL |
| Streaming | Kinesis Data Streams, MSK | KDA (Flink), Lambda | Real-time detection, live dashboards |
| Near-real-time | Kinesis Data Firehose | Firehose transformation, Lambda | Loading logs into S3/Redshift almost instantly |

You especially need to distinguish two easily confused services. **Kinesis Data Streams** is for true streaming that needs low latency and multiple consumers, while **Kinesis Data Firehose** is a "managed near-real-time delivery person" that takes a stream and automatically loads it into S3, Redshift, and so on. If you want the data dropped at a destination without operating consumers in your own code, it is Firehose.

## Turn the Required Latency into a Number and the Service Is Decided

"Real time" means different things to different people. Exam passages also distinguish between `real-time`, `near real-time`, `within minutes`, and `daily`. Splitting the latency requirement into ranges narrows the candidates.

| Required freshness | Processing form | AWS configuration | Behavior behind the rationale |
|------|------|------|------|
| Reaction within 1 second | Event-by-event streaming | KDS/MSK + Managed Service for Apache Flink, or Lambda (enhanced fan-out) | Enhanced fan-out receives records by push, with an average propagation delay of about 70 ms; shared throughput averages about 200 ms with a single consumer |
| A few seconds to 1–2 minutes | Near-real-time loading | Data Firehose | Delivers all at once when the buffer (size or time) fills. For an S3 destination the buffer interval is 0–900 seconds, 300 seconds by default |
| 1 to several minutes | Micro-batch | Glue streaming ETL | Based on Spark Structured Streaming. Reads and writes with a default 100-second window |
| Several minutes to hours | Event-driven batch | S3 event → Lambda/Glue job, EventBridge schedule | Runs a small batch when a file arrives or at a fixed interval |
| Daily | Scheduled batch | Glue, EMR, AWS Batch + Step Functions/MWAA | Reads a whole day's partition at once and aggregates in a single pass |

- The higher up the table you go, the more the infrastructure is **always on**; the further down you go, the more you pay **only for the time it runs**.
- When you attach Lambda as a KDS consumer, the standard approach polls each shard once per second by default. It is not "it's a function, so instant"; latency arises equal to the polling interval and the batch window.
- Lowering the Firehose buffer interval below 60 seconds makes data arrive sooner, but it increases small objects in S3 and raises PUT request costs. Freshness and file size are always a trade.

> ⚠️ **Pitfall**: Even if the passage says "load into S3 in real time," if the requirement is only "to accumulate," the answer is Firehose. KDS requires you to operate the consumer code yourself, so it conflicts with a "least operational overhead" condition. Conversely, when you see "multiple applications each read the same events" or "reprocess a past interval," Firehose alone will not do.

## The Structural Reasons Streaming Is Expensive

Unpacking "real time is expensive" through the pricing structure looks like this.

| Aspect | Batch | Streaming |
|------|------|---------|
| When billing happens | Only while the job runs | The whole time the stream or application is up, even with no data |
| Ingestion layer | S3 storage and request charges | KDS provisioned mode is billed per shard; on-demand mode is billed by the data volume (GB) written and read |
| Processing layer | Glue by job run time, EMR by the time the cluster is on | A Glue streaming job is billed continuously for as long as it runs, and a Flink application also runs constantly |
| Operations | If it fails, rerun just that date | Constant need for lag monitoring, checkpoints, and preparation for duplicate processing on restart |
| Correctness | Compute after all data has gathered | You must decide how long to wait for late data |

- A batch that runs for 5 minutes once a day and a streaming application that is up 24 hours differ by hundreds of times in compute time even for the same amount of data processed.
- That is why, in the exam's "most cost-effective" passages, if the required latency is hourly or longer, the streaming option is mostly a wrong answer.

## Event Time and Late-Arriving Data

This is a hard problem that exists only in streaming, not in batch.

- **Event time**: the time the event actually happened. The producer must include it inside the payload.
- **Processing time**: the time the system received that record. The KDS record's `ApproximateArrivalTimestamp` is this. It is the stream arrival time, not the time the event occurred.
- If a mobile app sends clicks it accumulated offline on the subway all at once 20 minutes later, the event time is 10:00 but the processing time is 10:20. If you cut 5-minute windows by processing time, these clicks land in the wrong window.

```
5-minute tumbling window by event time [10:00~10:05)
  10:01 event A ─ arrives 10:01  → aggregated normally
  10:03 event B ─ arrives 10:04  → aggregated normally
  10:02 event C ─ arrives 10:21  → what if the window has already closed? (late data)
```

- A streaming engine uses a **watermark** to set a baseline that says "treat all events before this time as having arrived," and events that exceed the allowed lateness are either dropped or diverted to a separate output.
- Batch solves this problem by **waiting**. If you process yesterday's partition at 2 a.m. rather than right after midnight, most late events have already arrived. Anything that arrives even later is handled by recomputing the whole partition for that date (backfill) and overwriting it.
- Firehose's default S3 prefix (`YYYY/MM/dd/HH`, UTC) is based on **the time the record arrived at Firehose**. To split folders by event time, you have to pull a field out of the record with dynamic partitioning.

Batch reprocessing is safe thanks to its idempotent structure of "the same input partition → overwrite the same output partition." Streaming re-reads from the checkpoint after a failure, so some records can be processed twice (at-least-once), and you must design the results store to absorb the duplicates.

## Comparing the Three Windows with the Same Data

When the click times for the same user are `10:00, 10:02, 10:03, 10:11, 10:12`, counting the events gives different results like this.

| Window | Definition | Result | Used for |
|------|------|------|------|
| Tumbling 5 min | Fixed, non-overlapping intervals | [10:00~10:05) 3 events, [10:10~10:15) 2 events | Sales total every 5 minutes, per-minute metrics |
| Sliding 10 min / 5-min step | A 10-minute window moves every 5 minutes, overlapping each other | [10:00~10:10) 3 events, [10:05~10:15) 2 events; one event can fall in multiple windows | "Moving average over the last 10 minutes," detecting anomalous spikes |
| Session (5-min gap) | The session ends if activity stops for more than 5 minutes | Session 1 10:00~10:03 3 events, session 2 10:11~10:12 2 events | Visit session length, grouping user behavior |

- With tumbling, every event belongs to exactly one window, so totals are not duplicated. It suits aggregations where double counting is prohibited, such as settlement.
- A session window's length varies with the data, so it has to hold state for a long time. That is why the Flink family, which has state-management features, fits, and a stateless Lambda does not.

## Choosing a Stream Processing Engine: Lambda vs. Flink vs. Glue Streaming

This is the next fork once you have settled on "process it with streaming."

| Criterion | Lambda | Managed Service for Apache Flink | Glue streaming ETL |
|------|------|------|------|
| Processing model | Function invocation per batch, stateless by default | Per-event, with built-in state and checkpoints | Micro-batch (Spark Structured Streaming) |
| Good at | Per-record cleansing, filtering, routing, notifications | Window aggregation, stream joins, event time and late-data handling | Receiving a stream, transforming it, and loading it into an S3 data lake or JDBC |
| Source | Event source mapping for KDS, MSK, DynamoDB Streams, etc. | KDS, MSK, etc. | KDS, Kafka, MSK |
| Operations | Lightest | You must pay attention to application parallelism and state size | Operated the same way as a Glue job, tracking read position with checkpoints (job bookmarks not supported) |
| Clue for choosing | "Simple transformation," "run a function per event" | "Stateful," "time window," "accurate aggregation" | "Reuse existing Spark/Glue code," "minute-level is enough" |

- **Kinesis Data Analytics (KDA)** in older materials is now **Amazon Managed Service for Apache Flink**. The `KDA (Flink)` in the table above also refers to the same service.
- The legacy **Kinesis Data Analytics for SQL**, which was written only in SQL, has reached end of support (new creation blocked, then applications deleted from January 27, 2026). To use SQL on a stream, use Flink SQL or a Managed Service for Apache Flink Studio notebook.
- The current name of **Kinesis Data Firehose** is **Amazon Data Firehose**. Both names appear mixed in exam passages and the console, but it is the same service.

## Common Anti-Patterns

- **Streaming when batch is enough**: Running Flink 24 hours a day for a report read in the morning. If the required latency is "the next morning," a scheduled batch is the answer.
- **Writing streaming results to S3 every few seconds**: Tens of thousands of small files appear and Athena/Spark queries slow down. Increase the buffer or merge them afterward with a batch (compaction).
- **Reprocessing all history via streaming**: Data past the stream's retention period is not in the stream. Keep the original in S3 separately and do reprocessing in batch (what the batch layer of the Lambda Architecture does).
- **Cutting windows by processing time**: If there is producer delay or retries, the aggregates go wrong. Put the event time in the payload and aggregate by event time.
- **Periodically dumping the entire production DB**: Even as a batch, it puts load on the source. If you only need the changes, replicate continuously with DMS CDC.

## Passage Clue → Answer Decision Table

| Clue in the passage | Direction to choose | Reason |
|------|------|------|
| "Every night," "daily report," "the previous day's data" | Scheduled batch (Glue/EMR) | Bounded data, latency tolerated |
| "Recompute several years of historical data" | Batch (backfill) | Throughput matters, and the stream has no history |
| "Detect immediately when a transaction occurs," "alert within seconds" | KDS/MSK + Flink or Lambda | Event-level low latency |
| "Moving aggregate over the last N minutes," "session" | Managed Service for Apache Flink | Stateful window operations |
| "Keep loading into S3/Redshift without code" | Data Firehose | Managed near-real-time delivery |
| "Reuse an existing Spark job for the stream too, 1–2 minutes of delay acceptable" | Glue streaming ETL | Micro-batch |
| "Both real-time results and accurate final results" | Lambda Architecture (speed + batch layer) | The batch later corrects the approximate results |
| "Maintain only one copy of the pipeline code" | Kappa Architecture (reprocess by replaying the stream) | Removes the batch layer |

In the next post, we will spread out the full map of AWS data services that actually implement these processing paradigms, across the categories of ingestion, storage, processing, analytics, and governance.

## 📖 Glossary

- **Bounded / unbounded data** : A bundle with a defined start and end (bounded) versus a flow that keeps coming without end (unbounded). It is the starting point that separates batch from streaming.
- **Latency** : The time it takes from when data is created until a result comes out. The shorter it is, the closer to real time.
- **Throughput** : The amount of data that can be processed in the same time. Batch, which processes in bundles, has the advantage.
- **Window** : An interval cut out on a time basis in order to aggregate an endless flow. Tumbling, sliding, and session are the typical ones.
- **Event time / processing time** : The time an event actually happened versus the time the system received that data. The gap between the two creates the late-data problem.
- **Watermark** : A baseline that treats "events up to this time have all arrived." Anything that comes later than this is treated as late data.
- **Micro-batch** : A method of continuously repeating small batches of a few seconds to tens of seconds so that it looks like real time.
- **Backfill** : The job of reprocessing a past interval to fill in or fix results. Usually done in batch.
- **Lambda / Kappa architecture** : A structure with both batch and stream paths, versus a structure unified into a single stream.
- **Near real-time** : A level where data arrives slightly late, on the order of seconds to minutes. Firehose is the representative example.

## 📝 Practice Questions

**Question 1.** In streaming processing that deals with an unbounded data flow, which concept is indispensable for producing aggregation results from an infinite flow?

A) Normalization  
B) Windowing — cutting the flow into time units for aggregation  
C) Indexing  
D) Sharding  

**Answer: B**  
Explanation: Streaming data has no end, so you can only produce aggregation results by cutting the flow with time windows (tumbling/sliding/session windows), such as "the last 5 minutes." Normalization concerns schema design, indexing concerns lookup performance, and sharding concerns data distribution — all different problems from windowing.

---

**Question 2.** Which processing paradigm is best suited for "collecting a full day's transactions every night to generate a settlement report," and why?

A) Streaming — because its latency is the lowest  
B) Batch — because it processes bounded data on a fixed schedule, and slightly delayed results are acceptable  
C) Streaming — because its throughput is the highest  
D) Batch — because it corrects late-arriving data in real time  

**Answer: B**  
Explanation: "Collect a day's worth and run at a fixed time" is a textbook batch job that processes bounded data periodically, and a report has no need for immediacy. Streaming's strength is low latency, cumulative throughput is actually higher for batch, and correcting late-arriving data is a challenge for streaming, not batch.

---

**Question 3.** What is the fundamental reason batch processing achieves higher throughput per unit of time than streaming?

A) Because batch compresses the data  
B) Because processing data together in bundles amortizes the per-record overhead  
C) Because batch uses more expensive instances  
D) Because streaming cannot use SQL  

**Answer: B**  
Explanation: Batch bundles many records into a single job, so per-record processing and delivery overhead is amortized, yielding high throughput. In exchange, latency accrues for as long as data is collected. It has nothing to do with compression or instance types, and streaming can also do SQL-based processing (e.g., Flink SQL).

---

**Question 4.** Which AWS service is best suited when you want stream data automatically loaded into S3 or Redshift almost immediately, without operating separate consumer code?

A) Kinesis Data Streams  
B) Kinesis Data Firehose  
C) AWS Glue  
D) Amazon EMR  

**Answer: B**  
Explanation: Firehose is a managed near-real-time delivery service that receives a stream and automatically loads it into S3, Redshift, OpenSearch, and other destinations, with no consumer code to operate yourself. Data Streams is for true streaming needing low latency and multiple consumers, while Glue and EMR are batch ETL processing engines.

---

**Question 5.** Which classic architecture resolves the latency-correctness trade-off by operating a batch layer (accurate but slow) together with a speed layer (fast but approximate)?

A) Kappa Architecture  
B) Lambda Architecture  
C) Microservices architecture  
D) Serverless architecture  

**Answer: B**  
Explanation: The Lambda Architecture runs a batch layer and a speed layer simultaneously and merges them in a serving layer. Because of the burden of maintaining code twice, the Kappa Architecture, which consolidates onto a single streaming engine, emerged as an alternative. Microservices and serverless are general system structure concepts, not data processing paradigms.

---
