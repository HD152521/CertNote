# Day 3 - Kinesis: A Log That Holds On to Flowing Data

SQS and SNS treat messages as things that "disappear once processed." When a consumer takes a message, it is deleted from the queue; once published, a message is pushed out and forgotten. Some data is fundamentally different, though. User click streams, IoT sensor readings, and application logs *flow* continuously, multiple systems want to read the same data *at the same time for different purposes*, and sometimes you even want to reprocess yesterday's data today with a new algorithm. For this kind of **streaming data**, Amazon Kinesis took a completely different model: instead of discarding messages after consumption, it **only appends them to a log and retains them for a set period**.

In DVA-C02, Kinesis tends to show up in comparison scenarios asking "how is it different from SQS and SNS?" Details such as shard throughput numbers, the division of roles between Data Streams and Firehose, and Enhanced Fan-Out are also in scope. This article covers why Kinesis chose the "append-only log" structure, how shards and partition keys solve ordering and scaling at the same time, why Data Streams and Firehose diverge, and where Kinesis is fundamentally different from SQS.

## The Append-Only Log: The Heart of Kinesis

If you boil the Kinesis Data Streams data model down to one word, it is **log**. It is not a database or a queue; it is an immutable sequence to which records are **only appended at the end** in time order, with nothing in the middle ever modified. Producers attach records to the end of the log, and consumers start reading from any point in the log they want (a sequence number). Reading does not make the data disappear; it stays in place for the retention period (24 hours by default, up to 365 days).

This simple structure makes three things possible that SQS cannot do.

- **Multiple independent consumers**: Several consumers read the same stream at the same time, each at its own position. A follows the end of the stream for real-time alerts, while B reads data from an hour ago for batch analysis. They do not interfere with each other.
- **Reprocessing (replay)**: You can rerun a new consumer with a bug fix starting from yesterday to reprocess past data. With SQS this is impossible, because messages disappear once consumed.
- **Order preservation**: A log is inherently an ordered sequence, so data within the same partition is read in the order it was written.

The idea of "putting the log at the center of a data system" is not unique to Kinesis; it is a major trend in distributed systems. Jay Kreps (co-creator of Kafka) laid out this thinking in his article "The Log: What every software engineer should know about real-time data's unifying abstraction" (2013). His point was that database replication, messaging, and event sourcing all ultimately unify into a single abstraction: the "append-only log." The root of this idea is the database **WAL (Write-Ahead Log)**. A DB records changes in the log first, before writing them to the data files, and with that log alone any state can be reconstructed. Kinesis and Kafka turned this insight, "the log is the source of truth," into a messaging system itself.

The difference between Kinesis and SQS comes down to "does consumption destroy the data?"

- In SQS, consumption is deletion via `DeleteMessage` (destructive read).
- In Kinesis, reading and retention are separate, so the consumer has to remember for itself "how far have I read" (checkpoint).
- This is why KCL (Kinesis Client Library) stores that checkpoint in a DynamoDB table for you. The log itself does not know the consumer's position, so the responsibility for tracking position lies with the consumer.
- This is the same structure as Kafka's consumer offsets. "The stream preserves the truth, and the consumer is responsible for how far it has read" is the core contract of log-based systems.

## Shards and Partition Keys: Ordering and Scaling at the Same Time

If you keep a single log as just one line, throughput is tied to the ceiling of that one line (the same problem we saw with SQS FIFO). Kinesis splits a stream into multiple **shards** to parallelize. Each shard is an independent log with its own throughput limits.

| Operation | Limit per shard |
|------|------------|
| Write | 1 MB/s or 1,000 records/s |
| Read (Classic) | 2 MB/s or 5 GetRecords calls/s (shared by all consumers) |
| Read (Enhanced Fan-Out) | 2 MB/s **dedicated per consumer** |
| Maximum record size | 1 MB |
| Retention | 24 hours to 365 days |

The key here is the **partition key**. When a producer specifies a partition key while sending a record, Kinesis hashes that key to decide which shard it goes to. **Records with the same partition key always go to the same shard**, and order is preserved within a single shard. So "if you use the order ID as the partition key, events for the same order are processed in order, while different orders are spread across multiple shards and processed in parallel." It is the same idea as MessageGroupId in SQS FIFO.

```python
import boto3, json
kinesis = boto3.client('kinesis')

kinesis.put_record(
    StreamName='clickstream',
    Data=json.dumps({'userId': 'U123', 'page': '/checkout'}),
    PartitionKey='U123'   # This user's events go to the same shard → order preserved
)
```

> ⚠️ **Trap**: Poor partition key design creates a **hot shard**. For example, if you give every record the same partition key, they all pile onto one shard, and even though the other shards sit idle, that one shard is capped at 1 MB/s and raises `ProvisionedThroughputExceededException`. On the exam, the symptom "only a specific shard is throttled" is a clue pointing to a skewed partition key. The fix is to design keys so they are spread evenly (high cardinality). It is the same structure as DynamoDB's hot partition problem; both are common pitfalls of "systems that distribute by key hash."

With classic reads, "all consumers share 2 MB/s." With 3 consumers, each can read only about 0.67 MB/s, and since they all poll `GetRecords`, latency stretches from 200 ms to several seconds. **Enhanced Fan-Out (EFO)** gives each consumer a dedicated 2 MB/s pipe via HTTP/2 **push**. Even as consumers increase, they don't take throughput from one another, and latency drops to about 70 ms. The cost is money (per consumer-shard hour plus data transfer). The answer to a scenario like "multiple consumers need to read the same stream with low latency" is EFO. The shift from pull (classic) to push (EFO) is in the same vein as SQS polling versus SNS push.

## Data Streams vs. Firehose: Process It, or Deliver It

Kinesis is not a single service but a family. The distinction that matters on the exam is between **Data Streams** and **Data Firehose**.

**Data Streams** is the shard-based log we just looked at. Consumers (Lambda, KCL apps, EFO consumers) **read the data directly and process it in real time**; use it when you need reprocessing, multiple consumers, and low latency. You either manage shards yourself (Provisioned) or let On-Demand scale automatically.

**Firehose** has a completely different purpose. It is a serverless ETL pipeline that **buffers data and automatically delivers it to a destination**. There is no consumer code and no shard management. It streams data to S3, Redshift, OpenSearch, and Splunk, and along the way it can transform data with Lambda or convert JSON to Parquet format.

| Aspect | Data Streams | Firehose |
|------|-------------|----------|
| Purpose | Real-time processing (direct consumption) | Automatic delivery to a destination (ETL) |
| Management | Shard management or On-Demand | Fully managed, serverless |
| Consumer | You write it (Lambda/KCL) | None (automatic to the destination) |
| Latency | Real time (~200 ms, 70 ms with EFO) | **At least 60 seconds** (buffering) |
| Reprocessing | Possible (within retention) | Not possible (pass-through) |
| Retention | 24 hours to 365 days | None (pass-through only) |

The deciding criterion is "do I need to **process the data with my own code**, or do I just need to **send it to S3/Redshift**?" For the former, use Data Streams; for the latter, Firehose.

```
[Click events / IoT / logs]
        │
        ▼
[Kinesis Data Streams] ──> Lambda (real-time alerts, anomaly detection)
        │              └──> KCL app (complex stateful processing)
        ▼
[Kinesis Data Firehose] ──buffering (60s/1MB)──> S3 (data lake, Parquet)
                                          └──> Redshift / OpenSearch
```

There is a configuration that uses the two services **together**. Real-time analytics is processed immediately with Data Streams + Lambda, while **at the same time** Firehose subscribes to the same stream and archives all the raw data to S3 (to be analyzed later with Athena). Thanks to the "multiple independent consumers" we saw earlier, the real-time consumer and the archive consumer read one stream at the same time without interfering with each other. Streaming CloudWatch Logs to Firehose through a Subscription Filter for long-term retention in S3 is the same ETL pattern.

> ⚠️ **Trap**: Don't be fooled by the word "real-time." Firehose has at least 60 seconds of buffering, so it is **not truly real-time** (Near Real-Time). If you need "immediate processing within 1 second," you must consume Data Streams directly, and Firehose is for cases where "we're going to collect it in S3 for batch analysis anyway, so a 1-minute delay is fine." On the exam, "ultra-low-latency real-time processing" means Data Streams, and "automatic loading into S3 (serverless, minimal code)" means Firehose.

## Kinesis vs. SQS vs. SNS: When to Use What

Choosing among these three services is a topic that is easy to ask as a scenario question. On the surface they all seem to "move messages," but their models are fundamentally different.

| Scenario | Choice | Reason |
|----------|------|------|
| Asynchronous work queue (one task = one processing) | **SQS** | Point-to-point, deleted after consumption |
| Ordering and exactly-once processing | **SQS FIFO** | In-group ordering + dedup |
| One event → multiple subscribers at once | **SNS** | Publish-subscribe push |
| Real-time stream + reprocessing + multiple consumers | **Kinesis Data Streams** | Retained log |
| Stream → automatic loading into S3/Redshift | **Firehose** | Serverless ETL |
| Millions of events per second, highly variable traffic | **Kinesis On-Demand** | Automatic scaling (200 MB/s) |
| Push notifications to multiple mobile platforms | **SNS Mobile Push** | APNs/FCM abstraction |

To restate the essential difference between Kinesis and SQS:

- SQS **consumes and deletes per message**, and the consumer tracks "have I processed each message?" (visibility timeout).
- Kinesis **reads in order per shard**, and the consumer tracks "how far have I read?" (checkpoint).
- In SQS, even if one message is poison, you just pull that one out to a DLQ. In Kinesis, if one record fails processing, the records behind it get blocked (the price of preserving order).
- To deal with this "head-of-line blocking," the Lambda-Kinesis integration provides options such as `BisectBatchOnFunctionError`, `MaximumRetryAttempts`, and `DestinationConfig` (sending failed records to SQS/SNS). The difference in model translates directly into a difference in failure handling.

## Summary

The one sentence that runs through Kinesis is: "Instead of discarding messages after consumption, retain them in an append-only log so multiple consumers can read them repeatedly, each at its own position." This log model makes possible the multiple independent consumers, reprocessing, and order preservation that SQS cannot offer, and in exchange the consumer is responsible for its own position (checkpoint). Shards parallelize the log and partition keys solve ordering and distribution together (hot shards are the pitfall). Roles split between Data Streams for direct processing and Firehose for automatic delivery, and using both together gets you real-time processing and archiving from one stream. The choice among SQS, SNS, and Kinesis boils down to a difference in model: "does consumption destroy the data (SQS), does it push 1:N (SNS), or does it allow multiple consumers and reprocessing over a retained log (Kinesis)?"

In the next article, we move on to Step Functions, which weaves these individual services into a single flow as orchestration, and AppSync, which ties multiple data sources together behind a single GraphQL API.

---

## 📝 Practice Questions

**Question 1.** You want to (1) detect anomalies in a real-time clickstream immediately with Lambda while (2) also archiving all the raw data to S3. Which configuration satisfies both with a single data source?

A) Connect two consumers to a single SQS queue

B) Connect both a Lambda consumer and a Firehose consumer to a single Kinesis Data Stream

C) SNS → two SQS fan-out

D) Send the same data twice to two separate streams

**Answer: B**

Explanation: Kinesis Data Streams supports **multiple independent consumers** — Lambda (real-time anomaly detection) and Firehose (S3 archive) read one stream at the same time, each at its own position, without interfering with each other. This is thanks to the log model, in which data is retained even after consumption. A) In SQS only one consumer takes a given message, so two consumers cannot read the same data. C) SNS has no retention, making it unsuitable for reprocessing and streaming. D) Double-sending is unnecessary waste and creates consistency problems.

---

**Question 2.** On a Kinesis stream, only one specific shard raises `ProvisionedThroughputExceededException`. The other shards are idle. What is the most likely cause?

A) The retention period is too short

B) A hot shard, where a skewed partition key funnels records into one shard

C) Enhanced Fan-Out is not being used

D) Firehose buffering is too long

**Answer: B**

Explanation: Throttling on only one specific shard is the classic symptom of a **hot shard**. If partition key cardinality is low or skewed (for example, the same key on every record), those keys pile onto one shard and get blocked at the 1 MB/s and 1,000 RPS limits. The fix is to design partition keys so they are spread evenly — the same principle as a DynamoDB hot partition. A) Retention has nothing to do with write throughput. C) EFO is on the read side. D) Firehose buffering has nothing to do with stream write throttling.

---

**Question 3.** Three consumers must each read the same Kinesis stream with low latency (tens of ms), and they must not take throughput from one another. Which feature is appropriate?

A) Classic shared throughput is sufficient

B) Enhanced Fan-Out, providing a dedicated 2 MB/s per consumer via HTTP/2 push

C) Triple the number of shards

D) Switch to Firehose

**Answer: B**

Explanation: Classic reads have **all consumers share** 2 MB/s per shard, and because of polling the latency is also high (with 3 consumers, about 0.67 MB/s each). **Enhanced Fan-Out** gives each consumer a dedicated 2 MB/s pipe via HTTP/2 push, so even as consumers increase they read without interfering with each other at about 70 ms latency. A) The shared approach splits throughput and has high latency. C) Adding shards doesn't fundamentally fix it, since classic reads are still shared. D) Firehose has 60 seconds of buffering, so it is unsuitable for a low-latency requirement.

---

**Question 4.** You want to automatically load log data into S3 without writing code; a delay of about 1 minute is acceptable. You want to convert the JSON to Parquet before storing it. Which service is appropriate?

A) Kinesis Data Streams + a Lambda consumer you write yourself

B) Kinesis Data Firehose (Parquet conversion + S3 delivery)

C) SQS → Lambda → S3

D) SNS → S3

**Answer: B**

Explanation: **Firehose** is a serverless ETL service that buffers data and automatically delivers it to S3 without any consumer code, with built-in JSON-to-Parquet format conversion. It is the textbook answer for an "automatic S3 loading" scenario where a 1-minute delay is acceptable. A) Data Streams requires you to write the consumer code yourself. C) SQS + Lambda requires custom implementation, and format conversion is also manual. D) SNS has neither retention nor conversion, and S3 is not a direct delivery target for it.

---

**Question 5.** What is the most fundamental difference between Kinesis Data Streams and SQS?

A) Price

B) Kinesis retains data in a log so multiple consumers can read repeatedly and reprocess from their own positions, whereas in SQS a message is deleted once consumed

C) Kinesis does not support encryption

D) SQS is faster

**Answer: B**

Explanation: Kinesis is an **append-only log**, so data does not disappear when read and remains for the retention period, enabling multiple independent consumers and reprocessing (replay). Consumers track their own position with checkpoints. SQS uses a **destructive read**: when a message is consumed (deleted) it disappears from the queue, so only one consumer processes it and reprocessing is impossible. This model difference is the source of every behavioral difference between the two services. A, C, and D are not fundamental distinctions.

---

**Question 6.** Which statement about Firehose's latency characteristics is correct?

A) It delivers immediately (milliseconds)

B) It has at least 60 seconds of buffering, so it is Near Real-Time and unsuitable for ultra-low-latency real-time processing

C) It is always delayed by 1 hour

D) It has no delay and also allows reprocessing

**Answer: B**

Explanation: Firehose buffers data by size (1 to 128 MB) or time (60 to 900 seconds) and then delivers it in batches, so there is a delay of **at least 60 seconds** (Near Real-Time). If you need "immediate processing within 1 second," you must consume Data Streams directly. A is closer to Data Streams (EFO ~70 ms). C) 1 hour is far off, even larger than the maximum buffering (900 seconds = 15 minutes). D) Firehose is pass-through, so it has no retention or reprocessing.

---

**Question 7.** While Lambda is consuming a Kinesis stream, one record keeps failing to process. The records behind it are not processed and get blocked. Which statement about this phenomenon and the response is correct?

A) Just like SQS, only that record is automatically moved to a DLQ

B) Head-of-line blocking occurs because of in-shard order preservation, and it is mitigated with BisectBatchOnFunctionError, MaximumRetryAttempts, and a failure destination (SQS/SNS) configuration

C) You have to delete the stream and recreate it

D) Changing the partition key solves it

**Answer: B**

Explanation: Kinesis **preserves order** within a shard, so a failed record cannot be skipped and everything behind it gets blocked — **head-of-line blocking** (the price of order preservation). To mitigate this, Lambda event source mapping provides options to split a batch in half to narrow down the problem record (`BisectBatchOnFunctionError`), to cap the maximum number of retries (`MaximumRetryAttempts`), and to send exhausted failed records to SQS/SNS (`DestinationConfig`). A) Unlike SQS, Kinesis cannot automatically pull out just one record. C and D are irrelevant.
