# Day 4 - Kinesis: How a Real-Time Stream Solves a Different Problem Than a Queue

The SQS, SNS, and EventBridge services we saw on Days 1-3 all operate at the granularity of a **single message**. One message is produced → routed → received and processed by a consumer → done. Message retention is 14 days at most, and once a consumer processes a message it either disappears (SQS) or can't be viewed again (SNS/EventBridge, Archive aside). Yet a large portion of the data modern systems generate can't be handled with this model.

Consider this. An e-commerce company generates user click data at 500,000 events per second. This data must be ① processed in real time by a recommendation model, ② processed immediately by a fraud-detection system, ③ aggregated by the analytics team over 30-minute windows, and ④ loaded into a data warehouse for re-analysis next week. The same data has to be consumed four times, at different points in time, at different speeds. SQS is a consume-once model and doesn't fit; copying to four queues via SNS fanout works but 14-day retention makes next-week re-analysis hard; and EventBridge runs into its throughput quota (~10K TPS per account).

**Kinesis** (launched November 2013) answers this scenario. Fundamentally it isn't a queue but a **log (append-only ordered log)** model, a pattern first proven in Apache Kafka, built by LinkedIn's Jay Kreps in 2011. Data, once written, stays intact for the retention period (up to 365 days), multiple consumers read independently each from their own position (offset), and if needed you can rewind to a past position and reprocess. The Kinesis family keeps this log model at its core and extends it with automatic loading (Firehose), real-time analytics (Managed Flink), and Kafka compatibility (MSK). This article looks at why Kinesis is a different tool than SQS and which variant to use for which scenario.

## The Kinesis Family: Four Variants and Where Each Belongs

| Service | Launched | Model | Core Use Case |
|---------|----------|-------|---------------|
| **Kinesis Data Streams (KDS)** | 2013.11 | Real-time log, shard-based | Real-time ingest, multiple consumers |
| **Kinesis Data Firehose** | 2015.10 | Managed delivery (sink) | Auto-load to S3/Redshift/OpenSearch |
| **Managed Service for Apache Flink** (formerly Kinesis Data Analytics) | 2016.08, rebranded 2023 | Stream processing | Window aggregation, real-time ETL |
| **Kinesis Video Streams** | 2017.11 | Video ingest | Video streams (out of SAA scope) |
| **MSK (Managed Streaming for Kafka)** | 2018.11 | Managed Apache Kafka | Kafka migration, compatibility needs |

Among these four, the branch point that shows up most often on the exam and in practice is **KDS vs Firehose**. One-line summary: KDS means "I write the consumer (raw stream)," Firehose means "AWS writes the consumer (automatic loading pipeline)." Use KDS when you need real-time behavior, multiple consumers, and replay; use Firehose when the goal is simply to drop data somewhere.

> 💡 **Related theory**: The theoretical foundation of log-based systems was established by Jay Kreps's 2013 piece *The Log: What every software engineer should know about real-time data's unifying abstraction*. The core insight: "a database's transaction log, message queues, pub/sub, and change data capture are all variants of the same abstraction — an append-only ordered log." Kafka, Kinesis, and Pulsar are systems that make this abstraction first-class, which is why they can serve as the "source of truth for data" — something a queue can never be.

> 🔍 **Going deeper**: The key design difference between Kinesis and Kafka lies in "shards (KDS) vs partitions (Kafka)." Both split data into throughput units, but KDS shards are standardized as a managed-service quota unit (1MB/s in, 2MB/s out), whereas Kafka partitions are free to scale with cluster capacity. In exchange, KDS has near-zero operational burden (just shard split/merge API calls), while Kafka requires operating brokers and ZooKeeper (or KRaft). AWS's MSK is the compromise that keeps Kafka compatibility while moving only the brokers to managed.

## Data Streams: Shards, Partition Keys, and the Hot Shard Problem

All of KDS's throughput is decided at the **shard** level. A single shard has an exact quota.

```
[ Quota of a single shard ]

Write: 1 MB/s OR 1,000 records/s (whichever is smaller)
Read:  2 MB/s OR 5 GetRecords calls/s (shared across Standard consumers)
       OR 2 MB/s per consumer (Enhanced Fan-out, independent per consumer)

Add N shards and throughput becomes N×.
```

Every time you write a record you must specify a **PartitionKey**, and KDS MD5-hashes the PartitionKey to decide which shard it goes to. Records with the same PartitionKey always land in the same shard, and records within a single shard are guaranteed **strict ordering**. In other words, "if you use user ID as the PartitionKey, one user's events are processed in time order" is guaranteed.

This is a double-edged sword. A bad PartitionKey design triggers the **Hot Shard** problem. For example, if you use "customer ID as the PartitionKey" and one large customer accounts for 50% of traffic, all of that customer's data piles into a single shard, exceeds the 1MB/s limit, and throws `ProvisionedThroughputExceeded`. Other shards sit idle while just one shard chokes. This is the most common KDS incident in production.

The fix: split the PartitionKey more finely (e.g., `customerId + ":" + Math.floor(timestamp/1000)`), control shard distribution directly with an explicit hash key, or redesign the data model itself. AWS launched **Enhanced Monitoring** (per-shard metrics) in 2016 to make it visible which shard is hot, and added **On-Demand mode** in 2022, an option that automatically splits shards according to traffic.

| Mode | Throughput | Operations | Cost Model | Fits |
|------|-----------|-----------|-----------|------|
| **Provisioned** | shard count × 1MB/s | manage shards yourself (split/merge) | per shard-hour + PUT payload | predictable traffic |
| **On-Demand** | automatic (default 200MB/s in, 400MB/s out, auto-scaling) | AWS auto-adjusts shards | per GB · per request (pricier but simpler) | variable/unknown traffic |

> ⚠️ **Pitfall**: On-Demand doesn't mean "you never have to think about shards." Auto-scaling happens in 5-minute increments and can't keep up with explosive spikes, so throttling can still occur. The AWS docs explicitly state "it can absorb up to 2× the previous month's peak throughput instantly, but anything beyond that takes time." If you expect a sudden 50× spike, it's safer to warm up ahead of time with PutRecord or grab shards in advance with Provisioned mode.

> 🔍 **Going deeper**: KDS retention runs from 24 hours (default) up to 365 days (before the 2020 extension, 7 days was the max). Turning on 365-day retention sharply raises GB·hour cost, but "real-time processing + long-term replay" becomes possible in a single service. This was hard in the Kafka era (Kafka can also retain indefinitely, but you manage the disk cost yourself). The combination of 365-day retention + Glue Schema Registry + direct Athena queries (KDS source) is a managed implementation of a "streaming data lake."

## Standard Consumer vs Enhanced Fan-out: Two Consumer Models

A KDS consumer uses one of two models.

**Standard Consumer (Shared Throughput)**: all consumers **share** 2MB/s per shard. Consumers call the GetRecords API via polling (recommended every 1 second). With one consumer you use the full 2MB/s, but if 5 consumers read the same shard they each get 0.4MB/s. Cost is nearly 0 (included in the shard-hour cost).

**Enhanced Fan-out (EFO)**: each consumer gets an **independent 2MB/s**, and KDS pushes messages over an HTTP/2 stream (SubscribeToShard API). Adding consumers doesn't split the throughput, and latency is lower than polling (70ms average). The catch is an additional per-consumer-shard-hour cost.

```
[ Standard vs EFO ]

Standard:
  [Shard 1]─2MB/s─┬─polling─[Consumer A] (1MB/s)
                   └─polling─[Consumer B] (1MB/s)

EFO:
  [Shard 1]─push─[Consumer A] (dedicated 2MB/s)
          ─push─[Consumer B] (dedicated 2MB/s)
          ─push─[Consumer C] (dedicated 2MB/s)
          (each an independent stream, up to 20 consumers per shard)
```

When to use EFO: ① when 3+ consumers must process one stream simultaneously, ② when latency matters (e.g., real-time fraud detection), ③ when polling cost in Standard is a large part of consumer operating cost.

Using Lambda as a KDS consumer lets you automatically select EFO (options on the Event Source Mapping such as `StartingPosition` + `MaximumBatchingWindowInSeconds`). Launched in 2018.

> 📚 **Case study**: In 2019, Lyft's engineering blog described how its real-time surge-pricing system switched to EFO because a Standard consumer couldn't get latency low enough. The push model resolved the dilemma where shortening the polling interval raised throttling but not shortening it raised latency. Cost rose ~3×, but they judged the value of improved surge-pricing accuracy to far outweigh it.

## Firehose: "AWS Writes the Consumer for You"

KDS is powerful, but its downside is clear — you have to write the consumer code yourself and manage checkpointing, shard assignment, and reprocessing logic with an SDK like the KCL (Kinesis Client Library). For a simple case like loading data for analytics, this is excessive operational burden.

**Kinesis Data Firehose** is a "prebuilt consumer." It receives data and automatically loads it into a designated sink (S3, Redshift, OpenSearch, Splunk, external HTTP). No shards, no consumer code — you just PUT.

```
[ Firehose operating model ]

Producer
   │ PutRecord (or KDS source)
   ▼
Firehose Stream
   │
   ├─ (optional) Lambda transform (JSON → enriched)
   ├─ (optional) Format Conversion (JSON → Parquet/ORC)
   ├─ (optional) Dynamic Partitioning (data-driven S3 prefix)
   ├─ Buffering (60s ~ 900s OR 1MB ~ 128MB, whichever comes first)
   │
   └─ Sink (S3 / Redshift via S3 / OpenSearch / Splunk / HTTP / Snowflake)
        + (optional) backup S3 (for transform failures or all raw records)
```

Firehose is **near-real-time**. It's not truly real-time — there's a buffering interval (minimum 60 seconds). This is an exam trap: "real-time analytics = Firehose" is never the correct answer — for "real-time" the right choice is KDS + Lambda or Managed Flink. Firehose's keyword is "minute-level loading."

Firehose's real value is: ① automatic buffering, ② automatic transformation (Lambda), ③ automatic format conversion (Parquet/ORC), ④ dynamic partitioning (auto-generating S3 prefixes like `year=2026/month=05/day=27`), ⑤ failure isolation (automatically saving transform-failed data to a separate S3 backup bucket). Building all this yourself is hundreds of lines of Lambda; Firehose is a few lines of config.

```bash
aws firehose create-delivery-stream \
  --delivery-stream-name clickstream-to-s3 \
  --extended-s3-destination-configuration '{
    "RoleARN": "arn:...:role/firehose-role",
    "BucketARN": "arn:aws:s3:::analytics-lake",
    "Prefix": "clickstream/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/",
    "ErrorOutputPrefix": "errors/!{firehose:error-output-type}/",
    "BufferingHints": {"SizeInMBs": 64, "IntervalInSeconds": 60},
    "DataFormatConversionConfiguration": {
      "Enabled": true,
      "OutputFormatConfiguration": {"Serializer": {"ParquetSerDe": {}}},
      "SchemaConfiguration": {"DatabaseName": "analytics", "TableName": "clickstream"}
    },
    "ProcessingConfiguration": {
      "Enabled": true,
      "Processors": [{
        "Type": "Lambda",
        "Parameters": [{"ParameterName": "LambdaArn", "ParameterValue": "arn:...:function:enrich"}]
      }]
    }
  }'
```

This one config automates Lambda enrichment + Parquet conversion + S3 dynamic-partition loading + Glue catalog registration + error isolation, all at once. The result is an analytics data lake immediately queryable with Athena.

> 💡 **Related theory**: "Use a columnar format like Parquet/ORC when loading data into a data lake" is settled wisdom of 2010s big data. Parquet, a format created in 2013 by Twitter + Cloudera, versus storing the same data as JSON gives you: ① 5-10× better compression, ② column-wise scanning that cuts query cost to 1/10, ③ statistics-based partition pruning via predicate pushdown. Because Firehose does this conversion as a managed feature, analytics cost drops dramatically — Athena bills per GB scanned, so it's common to see cost fall to 1/20 after applying Parquet.

> 🔍 **Going deeper**: Firehose's Dynamic Partitioning (launched 2021) builds S3 prefixes from field values inside the record. For example, it auto-branches to `customer_tier=premium/` or `customer_tier=free/` based on the `customer_tier` field value. Why does this matter? Because when an Athena query uses `WHERE customer_tier='premium'`, it scans only that partition, dramatically cutting cost. In the old days you had to build the prefix yourself in Lambda or repartition with a Spark job after loading; Firehose does it at load time.

## Managed Service for Apache Flink: Real Stream Processing

If KDS is data transport and Firehose is loading, then **Managed Flink** (named Kinesis Data Analytics before the 2023 rebrand) is a **stream-processing engine**. You define operations like window aggregation, joins, pattern matching, and anomaly detection in SQL or in Java/Scala/Python (PyFlink) code.

Apache Flink is an open-source stream-processing engine released in 2014, and it was one of the first systems to solve, at a standard level, the hardest problems in distributed systems: **exactly-once stream processing + event-time semantics + late-event handling**. AWS started in 2016 with the SQL-only KDA, added Flink support in 2020, and rebranded the whole thing as Managed Flink in 2023.

Core concepts of stream processing:

- **Event time vs Processing time**: the time an event *occurred* vs the time it's processed. They can differ due to network delay or out-of-order arrival, and accurate window aggregation must be based on event time.
- **Watermark**: the system's estimate that "no more data before this time will arrive." Windows are closed based on watermarks.
- **Window types**: Tumbling (fixed size, no overlap), Sliding (overlapping), Session (based on activity gaps).
- **State backend**: where to store window-aggregation state (RocksDB on-heap, S3 checkpoint).

```sql
-- "Aggregate click counts per user in 1-minute tumbling windows, on event time"
CREATE TABLE clicks (
    user_id STRING,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH ('connector' = 'kinesis', 'stream' = 'clicks');

SELECT
    user_id,
    TUMBLE_START(event_time, INTERVAL '1' MINUTE) AS window_start,
    COUNT(*) AS click_count
FROM clicks
GROUP BY user_id, TUMBLE(event_time, INTERVAL '1' MINUTE);
```

This is expressed in 7 lines of SQL, but implementing it yourself would require thousands of lines of Lambda + DynamoDB state management + correctness-guarantee code. Flink solves it as a managed service.

> 📚 **Case study**: In 2020, Uber's engineering blog published the results of adopting Flink in its data platform. The biggest change was "simplifying the lambda architecture — which ran the same data through two pipelines, batch + streaming — into stream-only (kappa architecture)." Flink's exactly-once + event-time semantics made this possible by guaranteeing accuracy equivalent to batch. The same pattern is possible on AWS, but because Managed Flink is expensive you have to weigh the workload ROI.

## MSK: When You Need Kafka

Kafka is Kinesis's open-source sibling. Its API and operating model differ, but fundamentally it shares the same log model. So why bother with MSK?

1. **Protecting existing Kafka assets**: if a company already has Kafka-based systems (Spark Streaming, Flink, Confluent Schema Registry, Debezium CDC), it can migrate without code changes.
2. **Rich ecosystem**: Kafka Connect (hundreds of connectors), Kafka Streams, KSQL, Schema Registry, and a rich surrounding ecosystem.
3. **Fine-grained control**: direct control over partition count, replication factor, retention, and broker config. Kinesis is abstracted away as managed.
4. **Multi-region via MirrorMaker**: active-active multi-region topics are possible with Kafka's MirrorMaker2 pattern.

MSK's downside is that its **operational burden is larger than Kinesis's**. Brokers exist as real EC2 instances, and you have to handle partition-count planning, broker scaling, rebalancing, and storage scaling yourself. AWS launched **MSK Serverless** in 2022 to reduce some of the operational burden, but it still takes more hands-on work than Kinesis.

| Aspect | Kinesis Data Streams | MSK | MSK Serverless |
|--------|---------------------|-----|----------------|
| API | AWS SDK only | Apache Kafka API | Apache Kafka API |
| Throughput unit | shard | Partition (broker capacity) | automatic |
| Operations | near-zero | broker scaling, partition management | near-zero |
| Price | per shard-hour + PUT | per broker-hour + storage | throughput-based |
| Max retention | 365 days | unlimited (storage limit) | unlimited |
| Consumer SDK | KCL | Kafka consumer (many languages) | Kafka consumer |
| Multi-region | build it yourself | MirrorMaker2 | not supported |

## SQS vs Kinesis: The Most Frequent Exam Branch Point

This comparison is one of the branch points that shows up most often on the SAA exam. You need to make the keyword mapping crystal clear.

| Scenario Keyword | Answer |
|------------------|--------|
| "decoupling", "job queue", "asynchronous processing" | **SQS** |
| "process one message exactly once" | **SQS** |
| "multiple systems consume the same data independently" | **Kinesis** (or SNS fanout) |
| "replay", "reprocess past data" | **Kinesis** |
| "strict ordering", "high TPS" | **Kinesis** (FIFO SQS caps at 300 TPS) |
| "window aggregation", "real-time analytics" | **Kinesis + Managed Flink** |
| "hundreds of thousands of TPS" | **Kinesis** (SQS is possible too, but the queue model doesn't fit) |
| "minute-level loading to S3" | **Firehose** |
| "second-level real-time processing" | **KDS** (Firehose is minute-level) |

An especially confusing case: for "3 systems process one event independently," both SNS fanout and Kinesis work. The branch points are ① throughput (high → Kinesis), ② replay need (yes → Kinesis), ③ ordering guarantee need (yes → Kinesis), ④ operational simplicity (matters → SNS).

```
[ Lambda Architecture (traditional) ]

Data ─┬─ Kinesis ── Stream Layer (real-time) ── real-time view
      └─ S3      ── Batch Layer (accuracy)     ── master view
                                                    ↓
                              join the two views and expose to users


[ Kappa Architecture (modern) ]

Data ── Kinesis (365-day retention) ── Managed Flink (real-time + reprocessable)
                                            ↓
                                       serving layer
```

> 💡 **Related theory**: Lambda vs Kappa Architecture is a long-standing debate in the big-data camp. Lambda, proposed by Nathan Marz in his 2011 book *Big Data*, runs both batch and stream, while Jay Kreps criticized it in his 2014 piece *Questioning the Lambda Architecture* and proposed Kappa: "a single log with sufficiently long retention (= Kafka) can do both." 365-day-retention KDS is the key building block that makes Kappa possible on AWS.

## Comparison with Other Streaming Systems

| System | Strengths | Weaknesses | Fitting Scenario |
|--------|-----------|------------|------------------|
| **Kinesis Data Streams** | managed, 365-day retention, EFO | manual shard management (Provisioned), zero operational burden | AWS-native real-time |
| **MSK / Kafka** | rich ecosystem, unlimited retention, standard API | broker operations | existing Kafka assets, complex stream processing |
| **Apache Pulsar** | tiered storage, multi-tenancy | limited cloud-managed options | large-scale multi-tenant |
| **Google Pub/Sub** | 7-day retention, auto-scale | limited replay | GCP environments |
| **Azure Event Hubs** | Kafka API compatible, auto-scale | Azure only | Azure environments |
| **Redpanda** | Kafka API compatible, very fast (C++ implementation) | self-operated | low-latency + Kafka compatible |

KDS is the simplest answer if "you're on AWS and don't want to operate anything + 365 days of retention is enough + you don't need the Kafka ecosystem." MSK is the opposite — when you have existing Kafka assets or need an ecosystem like Kafka Streams or KSQL.

> 📚 **Case study**: In 2023, Netflix revealed a structure in its Keystone data pipeline that runs KDS and a self-operated Kafka cluster in parallel. It uses KDS for "simple ingest + S3 loading" workloads (70% of traffic) and Kafka for "complex stream processing + multi-region mirroring" workloads (30%). Even within one company, choosing by workload characteristics is the standard, and dichotomies like "this company uses Kafka / doesn't use Kafka" are far from reality.

## Operational Anti-Patterns

Anti-patterns frequently seen in KDS/Firehose operations.

1. **PartitionKey as an unbalanced value like user-id** → Hot Shard. Fix: composite key or explicit hash key.
2. **Shard count based on peak traffic** → excessive baseline cost. Fix: On-Demand mode or time-of-day resharding.
3. **5+ Standard consumers reading the same stream** → insufficient per-consumer throughput. Fix: EFO.
4. **Firehose buffering fixed at 60 seconds** → many small objects → surging Athena query cost. Fix: increase to 300~900 seconds based on traffic, or use a size-based trigger.
5. **Synchronous API calls in the Firehose transform Lambda** → transform latency exceeds the buffering interval, causing backpressure. Fix: keep the Lambda lightweight and push enrichment to a later stage.
6. **Leaving KDS retention at the default 24 hours** → replay impossible. Fix: at least 7 days, ideally 30+.

> ⚠️ **Pitfall**: In KDS Provisioned mode, increasing the shard count immediately gives N× throughput, but **the data distribution is not automatically rebalanced**. New data starts using the new shard key space, while existing shard data stays put. To resolve a Hot Shard you have to explicitly rebalance the key space with the split-shard or merge-shard API.

## Wrapping Up

Kinesis isn't simply "a faster SQS" — it's a fundamentally different abstraction (an append-only ordered log). That's why it answers multi-consumer, replay, ordering, and high-throughput scenarios that SQS and SNS can't. Data Streams is the raw stream, Firehose is automatic loading, Managed Flink is stream processing, MSK is Kafka compatibility — four services, each with its own place.

From an exam standpoint, the keyword mapping is: ① "multiple independent consumers + replay + high throughput" → KDS, ② "minute-level loading to S3/Redshift/OpenSearch" → Firehose, ③ "window aggregation, real-time analytics" → Managed Flink, ④ "need Kafka compatibility" → MSK. From an operations standpoint, PartitionKey design and shard-mode selection are the biggest causes of incidents.

The next article looks at a decision framework for messaging, event, and streaming architecture that synthesizes all of Week 7, organized around scenarios. Knowing when and how to combine SQS, SNS, EventBridge, KDS, Firehose, and Step Functions is the integrated-scenario area of the SAA exam.

---

## 📝 연습 문제

**문제 1.** A company wants to process clickstream data independently in four places: ① a real-time recommendation model, ② fraud detection, ③ 30-minute window aggregation, and ④ an S3 data lake. It must also be able to re-analyze the same data a few days later. What is the most appropriate infrastructure?

A) 4 SQS queues + a consumer for each
B) An SNS topic + 4 SQS fanout queues
C) Kinesis Data Streams (30-day retention) + 4 consumers (③ via Managed Flink, ④ via Firehose)
D) 1 EventBridge bus + 4 rules

**정답: C**

해설: Multiple consumers + reprocessing (replay) + high throughput = the definition of KDS. With 30-day retention, re-analysis a few days later is possible. ③ window aggregation via Managed Flink and ④ S3 loading via Firehose connect directly to KDS. A is a consume-once model, so even replicated across 4 queues replay is impossible, and clickstream throughput doesn't fit the SQS queue model. B has SNS retention of 0 — fanout works but re-analysis doesn't. D risks hitting the EventBridge throughput quota (~10K TPS per account) plus limited replay.

---

**문제 2.** A system that uses customerId as the PartitionKey in Kinesis Data Streams frequently sees `ProvisionedThroughputExceeded` errors. Analysis shows that one large customer accounts for 40% of traffic. What is the most appropriate fix?

A) Double the shard count
B) Switch to On-Demand mode
C) Change the PartitionKey to a composite like `customerId + ":" + Math.floor(timestamp/1000)`
D) Migrate to Firehose

**정답: C**

해설: The root cause of the Hot Shard problem is an imbalanced PartitionKey distribution. Adding shards (A) doesn't help because all data for one PartitionKey goes to the same shard. A composite key spreads the same customerId's data across multiple shards (with the trade-off that ordering within that customerId is broken). B doesn't help either because a single shard's limit (1MB/s) is the same in On-Demand. D loses the multi-consumer, real-time processing model by moving to Firehose.

---

**문제 3.** You want to automatically load log data into S3 in Parquet format while also transforming/enriching it with Lambda. What is the simplest architecture?

A) KDS + a Lambda consumer that PUTs to S3 directly
B) Firehose + Lambda transform + Parquet format conversion + Dynamic Partitioning
C) SQS + Lambda + S3
D) EventBridge + S3 target

**정답: B**

해설: Firehose provides Lambda transformation, Parquet conversion, Dynamic Partitioning, and error isolation all as managed features. Configuration alone completes an analytics data lake. A is possible but you'd have to code buffering, batching, Parquet conversion, and partition management yourself. C is wrong because SQS isn't a stream model and has no automated S3 loading. D is wrong because an EventBridge S3 target is for object-metadata events, not data loading.

---

**문제 4.** A stream is processed simultaneously by 6 microservices, each consumer needs 1MB/s or more of throughput, and latency must be within 100ms. What is the most appropriate configuration?

A) 6 Standard consumers polling
B) Register them as Enhanced Fan-out (EFO) consumers
C) 6 Firehose streams
D) 6 SQS queues

**정답: B**

해설: Standard consumers share 2MB/s per shard across all consumers, so with 6 each gets only 0.33MB/s (below the 1MB/s requirement). EFO gives each consumer an independent 2MB/s + a push model with 70ms average latency. A is insufficient on both throughput and latency. C is wrong because Firehose is a sink model, not a general consumer. D is wrong because you can't move a KDS stream into SQS and the model is different.

---

**문제 5.** A company is moving a stream-processing system that ran on an existing on-prem Kafka cluster to AWS. It wants to keep using Kafka Connect, Kafka Streams, and Confluent Schema Registry as-is. Which service fits best?

A) Kinesis Data Streams
B) MSK (Managed Streaming for Kafka)
C) Kinesis Firehose
D) EventBridge

**정답: B**

해설: MSK supports the Apache Kafka API as-is, so Kafka Connect, Kafka Streams, and Schema Registry code can be used with almost no changes. KDS is AWS-SDK-only, so Kafka ecosystem tools can't be used. C and D are fundamentally different models. Using MSK Serverless can also reduce the operational burden.

---

**문제 6.** The objects Firehose loads into S3 are so small that S3 LIST/GET costs are surging during Athena queries. What is the most appropriate fix?

A) Run Athena queries more frequently
B) Increase Firehose buffering from 60 seconds to 600~900 seconds, or raise the size threshold to 64MB or more
C) Load directly with KDS + Lambda instead of Firehose
D) Apply S3 Intelligent-Tiering

**정답: B**

해설: Firehose creating many small objects is because the buffer hint is too short. Increasing the buffer time or size consolidates them into larger objects, improving Athena scan performance and cost (Athena is far more efficient with large files than small ones). A moves cost in the wrong direction. C only adds code-operation burden while the essence stays the same. D is a storage-class issue, not an object-count issue.

---

**문제 7.** What is the way to write the least code to "compute a per-user click average over a 10-minute sliding window and update DynamoDB"?

A) Implement your own window logic with Lambda + DynamoDB
B) Managed Service for Apache Flink + SQL (windowing query) + DynamoDB sink
C) Firehose → S3 → scheduled Athena query
D) Step Functions Wait state

**정답: B**

해설: Window aggregation is the textbook use case for stream processing, and Flink is the standard solution. A sliding window + group by can be expressed in 7~10 lines of SQL. A is complex and error-prone because you'd have to implement watermarks, late events, and exactly-once yourself. C is batch processing, different from real-time windowing. D is wrong because Step Functions is workflow orchestration, not a data-processing engine.

---

해설 보강: The core message of the Kinesis family is that "**a message queue and a log are different abstractions**." KDS answers the multi-consumer, replay, high-throughput, and ordering scenarios that the SQS model can't solve, and on top of it Firehose (automatic loading), Flink (real-time processing), and MSK (Kafka compatibility) exist as variants. The three most frequent causes of production incidents are ① Hot Shard from PartitionKey imbalance, ② insufficient throughput from attaching too many Standard consumers, and ③ small-object explosion from a short Firehose buffer — knowing these three prevents 70% of KDS/Firehose operational incidents in advance.
