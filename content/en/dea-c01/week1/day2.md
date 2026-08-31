# Day 2 - Batch vs Streaming

Even with the same data, system design changes completely depending on "when and how much" you process. Gathering a full day's orders every night to produce a settlement report versus catching a fraudulent transaction the moment a payment happens — both deal with the same payment data, but they require entirely different machinery. The former is **batch**, the latter is **streaming**.

Today we look at the essence of these two processing paradigms, the cases each is suited for, and the core trade-off that divides them: latency and throughput. When designing a new pipeline, the very first judgment a data engineer makes is "is this batch or stream."

## The Essence of the Two Paradigms

The difference is **whether you process data in bundles or as it arrives**.

```
Batch
  [····· collect ·····] → process at once → result
  Bounded data, runs on a fixed schedule

Streaming
  → arrive → process → arrive → process → arrive → process →
  Unbounded data, flows continuously
```

Batch handles a **finite bundle** — "whatever accumulated over the past hour/day." It has a clear beginning and end. Streaming handles an **infinite flow** — "events arriving from now until forever." Since there is no end, producing a result requires cutting the flow with a time window, such as "the last 5 minutes."

| Aspect | Batch | Streaming |
|------|------|---------|
| Data | Bounded | Unbounded |
| Execution | Periodic (hourly/daily) | Continuous (always on) |
| Latency | Minutes to hours | Milliseconds to seconds |
| Throughput | Very high | Per-event processing |
| AWS Examples | Glue, EMR, Batch | Kinesis, MSK, Flink |

> 💡 **Related theory**: The most important concept in streaming is **windowing**. To aggregate over an infinite flow, you must cut the flow into time units. The main types are tumbling windows (fixed, non-overlapping intervals), sliding windows (overlapping, moving), and session windows (separated by gaps in activity). Handling the difference between "when the event occurred (event time)" and "when the system received it (processing time)" is also a core challenge of streaming design.

## When to Use Each

There is only one selection criterion: **how fresh do the results need to be**.

**When batch fits:**
- Jobs with fixed schedules, like month-end settlement or daily revenue reports
- Reprocessing large volumes of historical data (backfill)
- Analyses where results can safely be minutes to hours late
- Preparing large-scale training data for machine learning models

**When streaming fits:**
- Real-time anomaly and fraud detection
- Live dashboards, real-time monitoring and alerting
- Immediate processing of IoT sensor data
- Recommendations and personalization that must react instantly to user behavior

```python
# Batch: collect a day's logs and aggregate at once (Glue/Spark)
df = spark.read.parquet("s3://logs/date=2026-06-25/")  # the entire day
daily = df.groupBy("region").agg(sum("amount"))
daily.write.parquet("s3://reports/daily/2026-06-25/")

# Streaming: aggregate flowing events in 5-minute windows (Flink/KDA)
events.window(TumblingWindow.of(minutes=5)) \
      .key_by("region") \
      .aggregate(SumAggregator())  # emits results every 5 minutes, endlessly
```

The key point is that **"real time is expensive."** Streaming demands always-on infrastructure and more complex operations. So asking "do we really need real time, or is 5 minutes late acceptable" is the starting point of cost optimization. Vaguely deciding "fresher data is better, so stream everything" makes cost and complexity explode.

> 💡 **Related theory**: Micro-batch is the midpoint between the two. Like Spark Structured Streaming, it repeatedly runs small batches at very short intervals (a few seconds) to achieve "near real time." It is simpler to operate than true per-event streaming while achieving second-level latency, so many real-world pipelines choose this compromise.

## The Latency-Throughput Trade-Off

These are the two metrics that quantitatively separate batch from streaming.

- **Latency**: the time from when data is generated until a result comes out. The lower it is, the closer to "real time."
- **Throughput**: the amount of data that can be processed per unit of time. The higher it is, the stronger the system is at "high volume."

```
Batch   : high latency ↑   very high throughput ↑↑↑
Stream  : low latency ↓    per-event processing → lower cumulative throughput
```

Batch collects data and processes it all at once, so **per-record overhead is amortized and throughput is overwhelmingly high**. In exchange, latency accrues for as long as you collect. Streaming processes each event the moment it arrives, so **latency is very low**, but every event carries processing and delivery costs, making the cumulative throughput achievable on the same infrastructure lower than batch.

On top of this comes the axis of **correctness**. Streaming must handle late-arriving data and out-of-order events, so it has to compromise between "accurate final results" and "fast approximate results." Batch processes after all the data has arrived, so it is free from this problem.

```
        Correctness ↑
          │
  Batch ● │
          │      ● Micro-batch
          │
          │            ● Streaming
          └──────────────────→ Freshness (low latency) ↑
```

> 💡 **Related theory**: The classic architecture-level solution to this trade-off is the **Lambda Architecture**. It runs a batch layer (accurate but slow) and a speed layer (fast but approximate) simultaneously, merging them in a serving layer. Because of the burden of maintaining two copies of the code, the **Kappa Architecture** — which handles even batch with a single streaming engine — emerged as an alternative. On AWS, the Kinesis/MSK + Flink combination corresponds to Kappa.

## Mapping to AWS

This is the baseline for the exam's frequent "which service would you use for this scenario" questions.

| Paradigm | Ingestion | Processing | Typical Scenarios |
|---------|------|------|------------|
| Batch | S3 loading, DataSync | Glue, EMR, AWS Batch | Daily reports, large-scale ETL |
| Streaming | Kinesis Data Streams, MSK | KDA (Flink), Lambda | Real-time detection, live dashboards |
| Near real-time | Kinesis Data Firehose | Firehose transforms, Lambda | Loading logs into S3/Redshift almost immediately |

In particular, keep two easily confused services straight. **Kinesis Data Streams** is for true streaming that needs low latency and multiple consumers, while **Kinesis Data Firehose** is a "managed near-real-time delivery service" that receives a stream and automatically loads it into S3, Redshift, and other destinations. If you just want data dropped at a destination without operating consumer code yourself, it's Firehose.

## Wrapping Up

We established three judgment criteria today. First, **batch processes bounded data periodically**, while **streaming processes an unbounded flow continuously**. Second, the selection criterion is "how fresh do the results need to be," and since real time is expensive, don't default to streaming blindly. Third, **batch is strong in throughput and correctness, streaming is strong in low latency** — and micro-batch is the compromise between them.

In the next article, we unfold the full map of AWS data services that actually implement these processing paradigms, organized into ingestion, storage, processing, analytics, and governance categories.

---

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
