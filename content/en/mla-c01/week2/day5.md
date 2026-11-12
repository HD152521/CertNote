# Day 5 - Week 2 Comprehensive Review — Data Collection & Storage Recap

## 📌 Key Takeaways

- The big picture of this week is a **data lake centered on S3**. Every service shares S3 as its input and output.
- Pick the ingestion tool by the **shape** in which data arrives — Kinesis for streaming, DMS for databases, DataSync for files.
- Storage is processed for training — **Parquet + Snappy + date partitioning + sharding**.
- **Glue** is the hub for cataloging and transformation — Crawlers register schemas, and ETL Jobs/DataBrew transform the data.
- **Athena** bills by bytes scanned, so format and partition design is the cost. The `SELECT *` habit inflates the bill.

## The Entire Data Pipeline at a Glance

Rather than memorizing this week's services one by one, it is more efficient for exam prep to place them on the flow of "raw data comes in and becomes a trainable dataset."

```
[Source]
  │  ① Ingestion
  ├─ Streaming ──> Kinesis Data Streams / Firehose ─┐
  └─ Batch ──────> DMS / DataSync / direct upload ──┤
                                                    v
                                           ┌─────────────────────┐
                                           │   S3 data lake      │  ② Storage
                                           │ (single source of   │
                                           │  truth)             │
                                           └─────────────────────┘
                                                    │  ③ Catalog & transform
                                           Glue Crawler → Data Catalog
                                           Glue ETL Job (cleaning, format conversion)
                                                    │  ④ Query & explore
                                           Athena (serverless SQL, EDA)
                                                    │
                                                    v
                                           SageMaker training (Parquet, Pipe mode)
```

The key point is that **S3 is at the center**. Every service uses S3 as its input and output, and training ultimately reads its data from S3 as well.

This structure is the classic "data lake." A data warehouse loads structured data into a predefined schema up front (schema-on-write), whereas a data lake first piles raw data into S3 as it is and applies the schema when the data is read (schema-on-read). ML works with structured, semi-structured, and unstructured data, and it does not know in advance which features will turn out to be useful, so the data lake model of "collect everything first and interpret it later" fits well.

## Ingestion: Streaming vs Batch

The tool depends on the shape in which the data arrives. This is an easy distinction to mix up.

| Category | Service | Suitable situation | Answer keywords |
|------|--------|------------|------------|
| Real-time streaming | Kinesis Data Streams | Low latency, many consumers, direct processing | "under 1 second", "multiple apps consume", "replay" |
| Streaming → storage | Kinesis Data Firehose | Automatic delivery to S3/Redshift, no management | "load without code", "minimal management overhead" |
| DB migration | DMS | Replicate on-premises/RDS → S3/Redshift | "CDC", "continuous DB replication" |
| Bulk file transfer | DataSync | Sync on-premises files → S3 | "NFS/SMB file server" |
| Physical transfer | Snowball | Scale that would take months over the network line | "100 TB + slow line" |

You need to tell the two Kinesis siblings apart. **Data Streams** lets you attach your own consumers to process data in real time and requires you to manage shards (flexible, low latency). **Firehose** is fully managed: it buffers the data and then delivers it automatically to S3/Redshift (when you only want delivery without writing code).

```python
import boto3
kinesis = boto3.client("kinesis")

# Put a real-time event into Kinesis Data Streams
kinesis.put_record(
    StreamName="clickstream",
    Data=b'{"user_id": "u123", "event": "click", "ts": "2026-06-25T10:00:00Z"}',
    PartitionKey="u123",     # Same key → same shard → order preserved
)
```

If the need is "real-time, but just pile it into S3 without code," it is Firehose; if "multiple apps each process the real-time stream and replay is also needed," it is Data Streams. The PartitionKey sends records with the same key to the same shard, which preserves order — use user_id as the key when the per-user event order matters.

> ⚠️ **Trap**: Reducing the stream to 1 shard to preserve order is the wrong answer. Order is guaranteed **within a shard**, so with a well-chosen PartitionKey you can keep several shards and still preserve order per key. Cutting down to 1 shard only reduces overall throughput.

## Storage: Format and Partitioning

Collected data is not left as it is; it is processed to favor training. Summarizing the gist of the storage strategy from yesterday:

| Decision | Default | Reason |
|------|-------|------|
| Format | Parquet | Columnar, compressed, splittable |
| Compression | Snappy | Decompression speed matters for frequently read data |
| Partitioning | Date (`year=/month=/day=`) | Most queries filter by date |
| File size | Several reasonably sized shards | Distributed reads and `ShardedByS3Key` behavior |
| Input mode | Pipe/FastFile when data is large | Removes copy wait, prevents starving the GPU |

These five decisions determine both the Athena query cost (billed by bytes scanned) and the SageMaker training speed.

**Common storage mistakes and their symptoms**

| Mistake | Symptom | Fix |
|------|-------------|------|
| Training directly on CSV | Slow training start, high I/O cost | Convert to Parquet |
| Flat storage without partitions | Athena bill explodes | Date partitioning |
| Single Gzip CSV file | Only 1 worker works, the rest sit idle | Splittable format + sharding |
| Per-second partitions | Millions of small files, metadata explosion | Group by day or month |
| Single giant file + ShardedByS3Key | No distribution at all | Split into multiple objects |

## Catalog & Transform: Glue

The center of the ETL that turns raw data into a trainable form is **AWS Glue**.

| Glue component | Role | When to choose it |
|--------------|------|------------|
| Crawler | Scan S3 → infer schema → register tables in the Catalog | Automatically register schemas for thousands of files |
| Data Catalog | Central metadata store (shared by Athena, Spectrum, EMR) | When several engines must see the same definition |
| ETL Job (Spark) | Large-scale distributed cleaning, transformation, and format conversion | GB to TB scale transformations |
| Python Shell Job | Single-process script | Small transformations of a few MB |
| DataBrew | Visual cleaning and profiling without code | Non-technical users, quick exploration |

```python
# Glue PySpark ETL: clean the CSV and save it as partitioned Parquet
from awsglue.context import GlueContext
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())
df = glueContext.create_dynamic_frame.from_catalog(
    database="ml_datalake", table_name="raw_events"
).toDF()

df.write.partitionBy("year", "month").mode("overwrite") \
    .parquet("s3://ml-datalake/curated/events/")
```

The Glue Data Catalog acts as the "single source of truth for metadata." Once a Crawler registers a schema, Athena, Redshift Spectrum, and EMR share the same table definition. Separating the data (S3) from the metadata (Catalog), so that several query engines can each read the same data in their own way, is the core design of a data lake architecture.

## Query & Explore: Athena

This is the stage where you read and understand the prepared data. **Athena** queries S3 directly with serverless SQL and **bills by the amount of data scanned** ($5/TB). That is why Parquet + partitioning + compression translate directly into cost savings. It is the main venue for EDA (checking distributions, missing values, class imbalance, and data leakage), and with CTAS you can turn query results straight into a Parquet training dataset.

```sql
-- Reduce the scan volume with a partition filter while checking class imbalance
SELECT churned, COUNT(*) AS cnt
FROM ml_datalake.events
WHERE year = '2026' AND month = '06'
GROUP BY churned;
```

> ⚠️ **Trap**: If you forget that Athena cost is proportional to the amount scanned and full-scan everything with `SELECT *`, it gets expensive. The habit of selecting only the columns you need (taking advantage of Parquet's column skipping) and filtering by partition keys cuts cost by tens of times.

## Week 2 One-Line Checklist

| Question | Answer |
|------|-----|
| What is the single source of truth for ML data? | S3 |
| Is it OK to overwrite the originals in the Raw zone? | No. The reprocessing path disappears |
| How do you load a stream into S3 without code? | Kinesis Data Firehose |
| What if you need low latency + multiple consumers + replay? | Kinesis Data Streams |
| How do you continuously replicate a relational DB? | DMS (CDC) |
| What if you must move 100 TB over a slow line? | Snowball |
| What is the default training data format? | Parquet + Snappy |
| How do you register schemas for thousands of files? | Glue Crawler |
| What if you use Spark for a few-MB transformation? | The overhead is large, so Python Shell is better |
| What should you check first when the Athena bill is large? | Scan volume — format, partitions, column selection |

## Service Wrong-Answer Matching Summary

On the exam, wrong answer options usually slip in "a service from a different stage." If you pin down which stage each service belongs to, you can filter them out.

| Service | Stage | Easily confused with |
|--------|----------|-------------------|
| Kinesis Data Streams | Ingestion (streaming) | Differs from Firehose in management overhead and latency |
| Kinesis Data Firehose | Ingestion → delivery | Differs from Data Streams in the consumer structure |
| Kinesis Data Analytics | Stream analytics | Be careful not to confuse it with delivery purposes |
| DMS | Ingestion (DB replication) | DataSync has a different source type |
| DataSync | Ingestion (files) | DMS has a different source type |
| Snowball | Ingestion (physical transfer) | Differs from DataSync in the network line condition |
| Glue Crawler | Catalog | Its role differs from an ETL Job |
| Glue ETL Job | Transform | Its interface differs from Crawler and DataBrew |
| Glue DataBrew | Transform (no-code) | Its user base differs from an ETL Job |
| Athena | Query | Differs from Redshift in billing and in whether data is loaded |
| Redshift | Analytics (load-based) | Its workload character differs from Athena |
| Redshift Spectrum | Analytics (S3 join) | Its execution engine differs from Athena |

## This Week Revisited from a Cost Perspective

| Stage | Where cost is incurred | How to reduce it |
|------|-------------------|------------|
| Ingestion (streaming) | Number of shards × hours | Shards matched to throughput, Firehose when possible |
| Storage | Storage volume × duration | Compression, lifecycle policies, storage class per zone |
| Catalog | Crawler run time | Crawl only new folders, partition projection |
| Transform | DPU × run time | Appropriate Job type, incremental processing |
| Query | Bytes scanned | Parquet + partitioning + column selection |
| Training input | GPU idle time | Pipe/FastFile, sharding, efficient formats |

**A single storage design decision drives the cost of every later stage.** Parquet + date partitioning + appropriate sharding pays off in three stages at once: catalog, query, and training.

## Five Things That Ruin a Pipeline

| Mistake | Where it blows up |
|------|-------------|
| Overwriting the Raw zone | Cannot reprocess when a transformation bug is found |
| Choosing partition keys unrelated to queries | Athena bill does not shrink |
| Storing training data as Gzip CSV | Only one worker works in distributed training |
| Running the crawler just once with no schedule | New partitions and columns are not reflected |
| Using a Spark Job for a few-MB transformation | Startup overhead exceeds the processing time |

This week's services are asked about not as "what does it do" but as **"under what conditions is it the best choice."** Memorizing service names and features is not enough; you must be able to compare them along four axes: latency, management overhead, cost, and data size.

## Week 2 in One Sentence

**"Pile up the originals in S3 as immutable data, catalog and transform them with Glue and reorganize them into Parquet + date partitioning, then explore them with Athena and let SageMaker read them as they are for training."**

| Stage | One word | Do not forget |
|------|--------|-----------|
| Ingestion | Shape | Streaming, batch, and physical transfer diverge |
| Storage | Immutable | Never overwrite the Raw zone |
| Catalog | Shared | Every engine sees one definition |
| Transform | Scale | Data size decides the Job type |
| Query | Scan volume | You pay for what you read |
| Training input | Bottleneck | The goal is to not starve the GPU |

Next week (Week 3) covers feature engineering, which turns the data prepared this way into a form the model can read, along with checking the data for bias and quality.

## 📖 Glossary

- **Data pipeline** : The series of steps that move and refine data from the source to the training dataset.
- **Ingestion** : The process of bringing external data into AWS (mainly S3). It is divided into streaming and batch.
- **PartitionKey** : The value in Kinesis that decides which shard a record goes to. The same key goes to the same shard, so order is preserved.
- **Replay** : Re-reading stream data within the retention period from the beginning. Possible only with Data Streams.
- **Buffering** : The way Firehose gathers data up to a certain size or time and then flushes it all at once.
- **schema-on-write** : The traditional DB approach that enforces the schema at the moment data is inserted. Contrasts with a data lake.
- **Glue Crawler** : A tool that scans a data store, automatically discovers the schema and partitions, and registers them in the catalog.
- **Data Catalog** : A central store of table definitions shared by several query engines. It does not hold the data itself.
- **Sharding** : Splitting data into several appropriately sized files so that parallel reads become possible.
- **Scan-based billing** : A model where the charge is proportional to the bytes a query actually reads. The key constraint in Athena design.

## 📝 Practice Questions

**Question 1.** Real-time clickstream needs buffering and auto-loading to S3 without separate processing code. What is most suitable?

A) Implement consumer app directly on Kinesis Data Streams  
B) Kinesis Data Firehose  
C) AWS DMS  
D) AWS DataSync  

**Answer: B**  
Explanation: Firehose is fully managed, buffers streams, and auto-loads to S3/Redshift without code, suited for load-only needs. Data Streams (A) requires implementing consumers, DMS (C) is for database replication, DataSync (D) is for on-prem file sync.

---

**Question 2.** What is the core role Glue Crawler performs?

A) Scans S3 data, infers schema, registers table in Data Catalog  
B) Loads real-time streams to S3  
C) Trains SageMaker model  
D) Provisions Redshift cluster  

**Answer: A**  
Explanation: Crawler scans S3 data, infers schema, registers table in Glue Data Catalog so Athena and Redshift Spectrum can share it. Stream loading (B) is Firehose, model training (C) is SageMaker, cluster provisioning (D) is Redshift.

---

**Question 3.** Why does S3 play the "single source of truth" role in an ML data lake?

A) S3 alone can compress data  
B) SageMaker training, Glue ETL, Athena queries all use S3 as input/output  
C) S3 is the only service supporting SQL queries  
D) S3 is streaming-only  

**Answer: B**  
Explanation: S3 is the common center repository for all stages — training, ETL, queries — making it the single source of truth. Compression isn't S3-exclusive (A), Athena performs SQL queries (C), S3 is general-purpose object storage, not streaming-only (D).

---

**Question 4.** During Athena EDA, costs exceeded expectations because all queries used `SELECT *` scanning entire data. What most appropriately reduces cost?

A) Resave data as CSV  
B) Select only needed columns and filter by partition keys to reduce scan volume  
C) Move all queries to Redshift cluster  
D) Decompress data  

**Answer: B**  
Explanation: Athena bills on scan volume, so selecting needed columns (using Parquet's column skip) and partition pruning directly reduce bytes scanned. Resaving as CSV (A) is row-based and inefficient, moving to Redshift (C) is overkill for intermittent exploration, decompressing (D) increases scan volume.

---

**Question 5.** To guarantee processing order for events with same user_id in Kinesis Data Streams, what do you do?

A) Assign random PartitionKey to all records  
B) Use user_id as PartitionKey so same user's records route to same shard  
C) Reduce shards to 1  
D) Switch to Firehose  

**Answer: B**  
Explanation: Records with same PartitionKey route to same shard, preserving shard order, so using user_id preserves per-user event order. Random keys (A) break order, single shard (C) limits throughput, Firehose (D) isn't for order-guaranteed stream processing.

---
