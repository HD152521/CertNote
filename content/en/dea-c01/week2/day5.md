# Day 5 - Week 2 Synthesis: Data Ingestion Part 1 Review

## 📌 Key Takeaways

- Ingestion questions narrow to a single service if you work in this order: **source (files or events?) → direction (pull or receive?) → line and scale → freshness → operating conditions**.
- The four batch options: small and one-off = S3 upload, large, recurring, verified = DataSync, an external party pushes via SFTP = Transfer Family, insufficient line or huge volume = Snow.
- The three streaming options: multiple consumers and replay = KDS, loading without code = Firehose, existing Kafka assets = MSK.
- "Real-time analytics + raw data retention" is the combination where KDS (or MSK) is the source and Firehose loads into S3.
- Traps usually come from limits and defaults: parallelism ceiling = number of shards/partitions, Firehose has no retention or replay, Redshift loading is COPY via S3.

## The Ingestion Service Map on One Page

This week we surveyed "ingestion," the starting point of data engineering, divided into batch and streaming. Today we tie the scattered pieces into a single decision map. Ninety percent of ingestion-domain questions on DEA-C01 are "which service should I pick for this scenario," and the answer always comes from the keywords. The goal of this synthesis is to make the scenario → service mapping come to mind reflexively.

```
                        Data ingestion
                            │
        ┌───────────────────┴───────────────────┐
      Batch                                  Streaming
        │                                       │
  ┌─────┼─────────┬──────────┐         ┌────────┼──────────┬─────────┐
S3 upload DataSync  Transfer   Snow     KDS      Firehose    MSK
(one-off/ (recurring/ Family  (PB/slow (real-time (near-real-  (existing
 small)    large,    (receive  line)    multi-     time,       Kafka)
           sync &    SFTP)              consumer   simple
           verify)                      · replay)  loading)
```

## Batch Four Review

| Service | One-line definition | Decision keywords |
|--------|-----------|-------------|
| S3 upload | Landing zone of the data lake | One-off, small, multipart (large), Lifecycle abort |
| DataSync | Automatic on-premises↔AWS sync | Large, recurring schedule, integrity verification, metadata preservation, sufficient line |
| Transfer Family | SFTP/FTPS receiving gateway | External partner pushes over a standard protocol, minimal code changes |
| Snow family | Physical shipping migration | Petabyte scale, slow line, one-time |

> 💡 **Related theory**: The two axes for choosing batch are "data volume" and "line situation." If the line is sufficient, go online (DataSync); if it is insufficient or the data is too large, go offline (Snow). And a direction axis is added: "do I pull it in (DataSync) vs does an external party push it in (Transfer Family)?" If you hold just these two axes, nearly every batch question can be solved.

## Streaming Three Review

```
KDS      : Real-time pipe. Per-shard. Multiple consumers and replay possible. You write the consumer code yourself.
Firehose : Near-real-time loading pipe. After buffering, loads automatically into S3/Redshift/OpenSearch. Almost no code.
MSK      : Managed Apache Kafka. Standard open source, portability. Best for migrating existing Kafka assets.
```

Let us nail down the three key distinctions again.

1. **KDS vs Firehose**: For complex real-time processing, multiple consumers, or replay, use KDS; for simple loading, use Firehose. The combination that chains them (KDS source → Firehose loads into S3) is the answer for "real-time analytics + raw data retention" scenarios.
2. **Kinesis vs MSK**: If you see "existing Apache Kafka," MSK; if "minimal operations, AWS-native, simple loading," Kinesis.
3. **Common log model**: KDS and Kafka are both append-only logs, so data does not disappear when consumed, and multiple consumers and replay work. This differs from SQS.

```python
# Combined pattern: run KDS (real-time analytics) + Firehose (raw archive to S3) together
import boto3
firehose = boto3.client("firehose")

firehose.create_delivery_stream(
    DeliveryStreamName="raw-archive",
    DeliveryStreamType="KinesisStreamAsSource",          # specify KDS as the source
    KinesisStreamSourceConfiguration={
        "KinesisStreamARN": "arn:aws:kinesis:...:stream/clickstream",
        "RoleARN": "arn:aws:iam::123456789012:role/firehose-role"
    },
    S3DestinationConfiguration={
        "BucketARN": "arn:aws:s3:::my-data-lake",
        "RoleARN": "arn:aws:iam::123456789012:role/firehose-role",
        "BufferingHints": {"SizeInMBs": 128, "IntervalInSeconds": 300},
        "CompressionFormat": "GZIP"
    }
)
# A real-time analytics Lambda consumes the same clickstream separately -> analytics + archiving achieved together
```

A well-designed streaming architecture loosely couples "ingest → process → load." KDS/MSK act as the ingestion and buffer layer while feeding several downstreams at once (real-time analytics, data lake loading, search indexing). Thanks to this separation, even if one consumer slows down, other consumers and producers are not blocked. This is why a log-based stream suits a data platform better than a simple queue.

## Commonly Missed Pitfalls

- **Incomplete multipart pieces** → invisible S3 cost, solved with a Lifecycle abort rule
- **Hot shard/hot partition** → skewed partition key, replace with a high-cardinality key
- **Small files problem** → increase the Firehose buffer size to load larger files
- **Firehose cannot replay** → if you need replay or multiple consumers, KDS
- **Parallelism ceiling = number of shards/partitions** → adding only consumers does no good
- **Redshift loading is COPY via S3** → not a single-row INSERT

## Decision Order: Ask Five Times and One Remains

```
① What is coming in?
   ├─ Chunks of files/objects ─────────► Batch side (go to ②)
   └─ Small records generated continuously ► Streaming side (go to ④)

② Who moves it?
   ├─ An external partner uploads via SFTP/FTPS ► Transfer Family
   └─ We fetch it (go to ③)

③ What are the line and scale?
   ├─ Small, one-off ──────────────────► S3 upload (CLI/SDK, multipart for large files)
   ├─ Large, recurring, sufficient line ► DataSync
   └─ Insufficient line, or huge and one-time ► Snow family

④ Are there existing assets?
   ├─ Kafka code, connectors, team ────► MSK (MSK Serverless if you also dislike managing capacity)
   └─ None (go to ⑤)

⑤ What does the reading side require?
   ├─ Just accumulate in a destination ► Data Firehose
   ├─ Multiple apps each read / replay ► Kinesis Data Streams
   └─ Both ────────────────────────────► KDS + Firehose (with KDS as the source)
```

- Skipping ① and looking at ⑤ first leads to errors. The mistake of picking Firehose for a "sync a file server every night" question comes from here.
- ④ comes before ⑤. If "existing Apache Kafka" is in the passage, the MSK family comes first regardless of what the reading side requires.

## Detailed Comparison of the Three Streaming Services

We put the last three days' content on the same axes in one table. Reading across a row shows the differences.

| Axis | Kinesis Data Streams | Data Firehose | Amazon MSK |
|------|------|------|------|
| Essence | A log that can be re-read | A courier that flushes to a destination | A log that can be re-read (Kafka) |
| Capacity unit | Shard (write 1 MB/s and 1,000 records/s, read 2 MB/s) | None (automatic) | Brokers and partitions (automatic for Serverless) |
| Latency | Enhanced fan-out around 70 ms average, shared throughput 200 ms and up | As much as the buffer (S3 default 300 seconds, down to 0 seconds possible) | Milliseconds and up |
| Retention | 24 hours by default, up to 365 days | None (held only for retry when delivery fails) | Per configuration, compaction possible |
| Replay | Possible | Not possible | Possible |
| Consumers | Multiple apps (KCL, Lambda, Flink, Firehose…) | One destination you configure | Multiple consumer groups |
| Ordering | Guaranteed within a shard | Not guaranteed | Guaranteed within a partition |
| Transformation | Consumer does it itself | Lambda transformation, Parquet/ORC conversion, dynamic partitioning | Consumer or connector does it itself |
| Durability settings | None (service managed) | None | Replication factor, acks, min.insync.replicas |
| Access and authentication | Regional endpoint + IAM | Regional endpoint + IAM | Brokers inside a VPC + IAM/SCRAM/TLS |
| Operational burden | Medium (low with on-demand) | Lowest | High (low with Serverless) |
| Billing structure | Shard hours or data volume | Ingested data volume | Broker hours + storage, or usage |

- The three services are both **substitutes and combinable pieces**. KDS → Firehose and MSK → Firehose are both official configurations. When a combination appears in the answer choices, judge it by "do the roles each one takes overlap?"

## Week 2 Numbers and Defaults on One Page

| Service | Item | Value |
|------|------|------|
| KDS | Shard write / read | 1 MB/s or 1,000 records/s / 2 MB/s |
| KDS | `GetRecords` | 5 per second per shard, up to 10 MB and 10,000 records per call |
| KDS | `PutRecords` | Up to 500 records per request, partial failure possible |
| KDS | Retention period | 24 hours by default, up to 365 days |
| KDS | Enhanced fan-out | Dedicated 2 MB/s per shard for each consumer, 20 registered consumers per stream |
| KDS | On-demand starting capacity | Write 4 MB/s, accommodates up to 2 times the peak of the last 30 days |
| KDS | Capacity mode switching | 2 times per 24 hours |
| Firehose | S3 buffer | 1-128 MB (default 5 MB), 0-900 seconds (default 300 seconds) |
| Firehose | Buffer with format conversion | Minimum 64 MB (default 128 MB), input is JSON, destination is S3 |
| Firehose | Transformation Lambda | Up to 5 minutes per invocation, 6 MB payload, 3 retries by default on failure |
| Firehose | Maximum record size | 1,000 KiB (before encoding) |
| Firehose | Direct PUT delivery failure | Retries up to 24 hours, then lost |
| Firehose | Redshift/OpenSearch retry duration | 0-7,200 seconds |
| Firehose | Dynamic partitioning | 500 active partitions by default |
| MSK | Default configuration (3 AZ) | Replication factor 3, `min.insync.replicas` 2, automatic topic creation off |
| MSK | Ports | Plaintext 9092, TLS 9094, SASL/SCRAM 9096, IAM 9098 |
| MSK Serverless | Authentication / ingress per partition | IAM only / 5 MB/s |
| Lambda (KDS source) | Batch size / parallelization factor | Default 100, max 10,000 / 1-10 |

- Most limits are adjustable defaults and differ by Region. What the exam asks about is less the number itself than **"which limit do you hit first."** For example, when records are small, the record-count limit is hit before the byte limit, and when there are many consumers, the read limit fills before the write limit.

## Scenario Practice: From Clue to Answer

These situations do not overlap with the practice questions. Cover the decisive clue column and answer first.

| Situation | Decisive clue | Correct answer | Eliminated choice and why |
|------|------|------|------|
| 40 partner companies upload settlement files via SFTP every day, and a validation job must run as soon as they arrive | "uploads via SFTP", "as soon as they arrive" | Transfer Family → S3 → trigger Lambda/Glue with S3 events | DataSync: a tool where we pull, so the direction is reversed |
| Move 300 TB of an on-premises NAS once, then sync only changes daily, with a dedicated line available | "changes", "line available" | DataSync (initial transfer + scheduled incremental) | Snow: fits one-time, unsuitable for daily incremental |
| Migrate 2 PB of raw video once from a site with only a satellite link | "the line is slow", "once" | Snow family | DataSync: it will not finish in a realistic time over that line |
| A clickstream is consumed separately by three places: a recommendation engine, fraud detection, and a data lake | "three places each" | KDS + enhanced fan-out, Firehose for the lake side | Firehose alone: only one destination |
| Logs only need to be indexed into OpenSearch and there is no operations staff | "indexing only", "no staff" | Firehose → OpenSearch | KDS + Lambda: you would operate consumer code yourself |
| Process order events in order per order ID; high records per second but each record is 200 bytes | "order per ID", "small records" | Partition key = order ID, KPL aggregation | Random key: order breaks |
| A Lambda consumer keeps failing on one shard because of a single bad record | "the same batch fails repeatedly" | Batch splitting + retry limit + failure destination | Adding shards: the blocked shard stays blocked |
| Ingestion swings to tens of times normal around Black Friday, and there is no capacity planning staff | "swings", "no capacity planning" | KDS on-demand (implement retries for throttling just before a surge) | Provisioned fixed shards: under- or over-provisioned |
| Move even the Debezium connector of an on-premises Kafka to AWS as-is | "even the connector as-is" | MSK + MSK Connect | KDS: you would have to abandon the connector ecosystem |
| Analysts query an MSK topic in Redshift with second-level latency | "low latency in Redshift" | Redshift streaming ingestion (materialized view) | Firehose → Redshift: S3 staging and the buffer slow it down |
| JSON stream is accumulated in S3, Athena cost is high, and folders should be split per customer | "Athena cost", "folder per customer" | Firehose format conversion (Parquet) + dynamic partitioning | Shorten the buffer interval: files get split even finer |
| Firehose's S3 delivery failed for two days because of an IAM change, and the source was Direct PUT | "two days", "Direct PUT" | Data beyond 24 hours is lost → should have used KDS as the source and extended retention | "It stays in the S3 error folder": if S3 delivery itself fails, there is nowhere to go |

## Symptom → Cause → Action

| Symptom | Most common cause | Action |
|------|------|------|
| S3 charges grow faster than stored volume | Incomplete multipart upload pieces | Lifecycle `AbortIncompleteMultipartUpload` |
| KDS write throttling on only some shards | Skewed partition key | Redesign the key, split that shard (when multiple keys are concentrated) |
| KDS read throttling, latency increases after adding consumers | Contention for shared throughput | Enhanced fan-out |
| Iterator age keeps increasing | Insufficient consumer processing speed or error-retry stall | Increase shards and parallelization factor, isolate poison pill records |
| Records are intermittently missing with no exception | `PutRecords` partial failure not checked | Check `FailedRecordCount` and resend failures |
| Queries on S3 filled via Firehose are slow | Small files, row-oriented JSON | Increase buffer size, Parquet conversion |
| Athena reads only one line from a Firehose file | No delimiter between records | Add a newline delimiter |
| Some intervals missing from Firehose → Redshift | Skipped after the retry duration was exceeded following COPY failure | Manual COPY using the `errors/` manifest |
| Kafka throughput unchanged after adding consumers | Consumers > partitions | Increase partitions |
| Some messages lost after a broker failure | `acks=1` or insufficient replication factor | `acks=all`, replication factor 3, `min.insync.replicas=2` |
| Lambda/Glue fails to connect to MSK | VPC subnet, security group, or authentication method mismatch | Check the network path and port (per authentication method) |

> ⚠️ **Pitfall**: Fewer of the actions in the table than you would expect have "increase shards" as the answer. Skew is a key problem, read contention is a fan-out problem, and a blockage is an error-handling problem. Capacity increase is the right remedy only "when all shards evenly hit the limit."

Week 3 moves on to the other half of ingestion: real-time processing and windows on top of streams, ingestion reliability (idempotency, retries, DLQ), DMS and CDC, and event-driven architecture. On top of the "what do we bring it in with" map we built today, "how do we handle the incoming flow safely" is layered. Check the keyword mapping for the ingestion domain on this map.

## 📖 Glossary

- **Ingestion**: The stage of bringing data from the source into the analytics environment. It divides into batch and streaming.
- **Incremental sync**: A method that picks and moves only what changed since the last run. DataSync's scheduled tasks are the typical example.
- **Append-only log**: A record structure that only adds to the end. Reading does not erase it, so multiple consumers can re-read from their own positions.
- **Fan-out**: Multiple consumers each receiving one stream independently.
- **Replay**: Re-reading and processing past records within the retention period from the beginning.
- **Hot shard / hot partition**: The phenomenon where keys are skewed and load concentrates only on a particular shard or partition.
- **Poison pill record**: A record that fails every time it is processed and blocks the processing of the records behind it.
- **Staging**: An intermediate storage location passed through briefly before entering the final destination. Firehose's Redshift loading uses S3 as staging.
- **At-least-once**: A delivery guarantee that delivers at least once but may produce duplicates. The receiving side is designed to tolerate duplicates.

## 📝 Practice Problems

**Problem 1.** In which scenario should KDS be preferred over Firehose?

A) Multiple consumers independently consume the same data; after bug fix, replay historical data  
B) Load streaming data to S3 with no additional code  
C) Minimize operational burden  
D) Load data directly to Redshift only  

**Answer: A**  
Explanation: Multi-consumer independent consumption and replay are KDS's core strengths. Firehose lacks retention and replay — data flows through to fixed destinations. A, C, D are all simpler delivery scenarios where Firehose is more appropriate.

---

**Problem 2.** On-premises file server data syncs nightly to S3 with incremental transfer, integrity verification. Network bandwidth is sufficient. Which service is most appropriate?

A) Snowball Edge  
B) Transfer Family  
C) AWS DataSync  
D) Kinesis Data Firehose  

**Answer: C**  
Explanation: Large volume, repeating schedule, incremental, integrity verify + sufficient bandwidth = DataSync. Physical shipping unnecessary with good bandwidth. Transfer Family is for inbound SFTP pushes from external parties. Firehose is for streaming delivery, not on-premises file sync.

---

**Problem 3.** A company operates existing Apache Kafka pipelines with Kafka Connect connectors and wants to migrate to AWS with minimal code changes. They also want to reduce cluster operations burden. Which approach is best?

A) Rewrite for Kinesis Data Streams  
B) Amazon MSK (MSK Serverless if desired)  
C) Migrate to SQS  
D) Transfer via Snowmobile  

**Answer: B**  
Explanation: Existing Kafka assets migrate code-free with MSK (standard API), and MSK Serverless auto-manages capacity for reduced ops. KDS rewrites require code changes, SQS isn't Kafka, and Snowmobile is physical data migration, not a streaming platform.

---

**Problem 4.** Firehose loads to S3, Athena queries are slow and expensive due to many small row-based JSON files. Two improvements are needed?

A) Reduce buffer interval, disable compression  
B) Change partition key to country  
C) Switch destination to OpenSearch  
D) Increase buffer size for larger files, convert to Parquet/ORC columnar format  

**Answer: D**  
Explanation: Larger buffer → fewer, bigger files (Athena has per-file overhead). Columnar format (Parquet/ORC) cuts scan volume. Reducing interval creates more small files (worse), disabling compression increases scan (costlier), OpenSearch doesn't align with Athena, partition key is for stream distribution, unrelated to Athena file problems.

---

**Problem 5.** Which characteristic do KDS and Amazon MSK share that distinguishes them from simple message queues like SQS?

A) Append-only log: within retention, data persists and multiple consumers can independently replay/reprocess at their own positions  
B) Messages are deleted immediately on consumption  
C) Throughput is fixed and doesn't scale  
D) Only single consumer supported  

**Answer: A**  
Explanation: Both KDS and MSK are distributed append-only logs. Data persists (not deleted on consumption), enabling multiple consumers to independently replay/reprocess from checkpoints/offsets within retention. SQS is a queue where consumption deletes. Both scale via shards/partitions and support multi-consumer, so other answers are false.

---
