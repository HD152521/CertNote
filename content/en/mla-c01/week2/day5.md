# Day 5 - Week 2 Comprehensive Review — Data Collection & Storage Recap

This week we covered the first stage of ML lifecycle: bringing raw data into AWS (collection) and storing it efficiently. This is the heart of MLA-C01 Domain 1 (Data Preparation, about 28%), and poor choices here topple downstream training costs and speed entirely.

Today we review by connecting S3, Kinesis, Glue, and Athena as one data pipeline. Rather than memorizing each service separately, understanding "how raw data becomes a trainable dataset" as a flow is more efficient for exam prep.

## The Complete Data Pipeline at a Glance

This week's services form a single flow.

```
[Source]
  │  ① Ingestion
  ├─ Streaming ──> Kinesis Data Streams / Firehose ─┐
  └─ Batch ──────> DMS / DataSync / Direct upload ──┤
                                                     v
                                            ┌──────────────────┐
                                            │   S3 Data Lake   │  ② Storage
                                            │(Single Source    │
                                            │  of Truth)       │
                                            └──────────────────┘
                                                     │  ③ Catalog & Transform
                                            Glue Crawler → Data Catalog
                                            Glue ETL Job (clean, format convert)
                                                     │  ④ Query & Explore
                                            Athena (serverless SQL, EDA)
                                                     │
                                                     v
                                            SageMaker Training (Parquet, Pipe mode)
```

The key is **S3 is central**. Every service uses S3 as input/output, and training ultimately reads from S3.

> 💡 **Related Theory**: This structure is the classic "data lake." While data warehouses load structured data into pre-defined schemas (schema-on-write), a data lake dumps raw data into S3 first and applies schema at read time (schema-on-read). ML deals with structured, semi-structured, and unstructured data, and doesn't know upfront which features are useful, so the "collect everything first, interpret later" data lake model fits perfectly.

## Ingestion: Streaming vs Batch

The tool choice depends on how data arrives. It's a common exam differentiator.

| Category | Service | Suited For |
|------|--------|------------|
| Real-time streaming | Kinesis Data Streams | Low-latency, multiple consumers, direct processing |
| Streaming → Storage | Kinesis Data Firehose | Auto-load to S3/Redshift, no management |
| DB Migration | DMS | On-prem/RDS → S3/Redshift replication |
| Bulk file transfer | DataSync | On-prem files → S3 sync |

The two Kinesis siblings' difference is frequent. **Data Streams** lets you attach consumers for real-time processing and manage shards directly (flexible, low-latency). **Firehose** is fully managed, buffers, then auto-loads to S3/Redshift (when you want loading without code).

```python
import boto3
kinesis = boto3.client("kinesis")

# Real-time event to Kinesis Data Streams
kinesis.put_record(
    StreamName="clickstream",
    Data=b'{"user_id": "u123", "event": "click", "ts": "2026-06-25T10:00:00Z"}',
    PartitionKey="u123",     # Same key → same shard → order guaranteed
)
```

> 🔍 **Deeper Dive**: "Real-time but load to S3 without code" = Firehose. "Real-time stream processed by multiple apps independently, replay needed" = Data Streams. PartitionKey routes records with the same key to the same shard, preserving order — use user_id when user event order matters.

## Storage: Format & Partitioning

Collected data isn't left as-is but transformed for training efficiency. Yesterday's storage strategy essence:

- **Format**: For analytics/training: **Parquet** (columnar, compressed, splittable). CSV/JSON row-based, inefficient.
- **Compression**: Frequently read → **Snappy** (fast); archive → Gzip (high compression).
- **Partitioning**: Most-filtered column (usually date) in Hive style (`year=/month=/`) → partition pruning.
- **Sharding**: Multiple appropriately-sized files instead of one giant file → distributed reading.

These four drive both Athena query cost (scan volume billing) and SageMaker training speed.

## Catalog & Transform: Glue

The center of ETL, turning raw data into training-ready form, is **AWS Glue**.

| Glue Component | Role |
|--------------|------|
| Crawler | Scan S3 data → infer schema → register table in Data Catalog |
| Data Catalog | Central metadata repository (shared by Athena, Redshift Spectrum, EMR) |
| ETL Job | Spark-based cleaning, transformation, format conversion (CSV→Parquet etc.) |
| DataBrew | Visual data cleaning without code |

```python
# Glue PySpark ETL: Clean CSV, save as partitioned Parquet
from awsglue.context import GlueContext
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())
df = glueContext.create_dynamic_frame.from_catalog(
    database="ml_datalake", table_name="raw_events"
).toDF()

df.write.partitionBy("year", "month").mode("overwrite") \
    .parquet("s3://ml-datalake/curated/events/")
```

> 💡 **Related Theory**: Glue Data Catalog is the "single source of truth for metadata." Once Crawler registers a schema, Athena, Redshift Spectrum, EMR all share the same table definition. Separating data (S3) from metadata (Catalog) lets multiple query engines read the same data differently — that's core data lake architecture.

## Query & Explore: Athena

The stage of reading and understanding prepared data. **Athena** queries S3 directly with serverless SQL, billing on **bytes scanned** ($5/TB). So Parquet + partitioning + compression directly reduce cost. It's the main venue for EDA (checking distribution, nulls, class imbalance, leakage), and CTAS can directly turn query results into Parquet training datasets.

```sql
-- Reduce scan volume with partition filter, check class imbalance
SELECT churned, COUNT(*) AS cnt
FROM ml_datalake.events
WHERE year = '2026' AND month = '06'
GROUP BY churned;
```

> ⚠️ **Gotcha**: Forgetting Athena bills by scan volume and full-scanning with `SELECT *` gets expensive. Selecting only needed columns (leveraging Parquet's column skip) and filtering by partition keys habits reduce cost by orders of magnitude.

## Summary

Week 2's data flow centers on **a data lake with S3 at the core**. Ingestion picks by pattern (real-time → Kinesis, auto-load → Firehose, DB → DMS); storage is tailored for training (Parquet + Snappy + date partitioning + sharding); Glue catalogs and transforms (Crawler → Catalog, ETL Job); Athena explores serverless SQL (scan-volume billing makes format/partition cost). Every stage shares S3 as input/output — that's the big picture.

Next week (Week 3) covers feature engineering to make data readable by models, and checking data bias and quality.

---

## 📝 연습 문제

**문제 1.** Real-time clickstream needs buffering and auto-loading to S3 without separate processing code. What is most suitable?

A) Implement consumer app directly on Kinesis Data Streams  
B) Kinesis Data Firehose  
C) AWS DMS  
D) AWS DataSync  

**정답: B**  
해설: Firehose is fully managed, buffers streams, and auto-loads to S3/Redshift without code, suited for load-only needs. Data Streams (A) requires implementing consumers, DMS (C) is for database replication, DataSync (D) is for on-prem file sync.

---

**문제 2.** What is the core role Glue Crawler performs?

A) Scans S3 data, infers schema, registers table in Data Catalog  
B) Loads real-time streams to S3  
C) Trains SageMaker model  
D) Provisions Redshift cluster  

**정답: A**  
해설: Crawler scans S3 data, infers schema, registers table in Glue Data Catalog so Athena and Redshift Spectrum can share it. Stream loading (B) is Firehose, model training (C) is SageMaker, cluster provisioning (D) is Redshift.

---

**문제 3.** Why does S3 play the "single source of truth" role in an ML data lake?

A) S3 alone can compress data  
B) SageMaker training, Glue ETL, Athena queries all use S3 as input/output  
C) S3 is the only service supporting SQL queries  
D) S3 is streaming-only  

**정답: B**  
해설: S3 is the common center repository for all stages — training, ETL, queries — making it the single source of truth. Compression isn't S3-exclusive (A), Athena performs SQL queries (C), S3 is general-purpose object storage, not streaming-only (D).

---

**문제 4.** During Athena EDA, costs exceeded expectations because all queries used `SELECT *` scanning entire data. What most appropriately reduces cost?

A) Resave data as CSV  
B) Select only needed columns and filter by partition keys to reduce scan volume  
C) Move all queries to Redshift cluster  
D) Decompress data  

**정답: B**  
해설: Athena bills on scan volume, so selecting needed columns (using Parquet's column skip) and partition pruning directly reduce bytes scanned. Resaving as CSV (A) is row-based and inefficient, moving to Redshift (C) is overkill for intermittent exploration, decompressing (D) increases scan volume.

---

**문제 5.** To guarantee processing order for events with same user_id in Kinesis Data Streams, what do you do?

A) Assign random PartitionKey to all records  
B) Use user_id as PartitionKey so same user's records route to same shard  
C) Reduce shards to 1  
D) Switch to Firehose  

**정답: B**  
해설: Records with same PartitionKey route to same shard, preserving shard order, so using user_id preserves per-user event order. Random keys (A) break order, single shard (C) limits throughput, Firehose (D) isn't for order-guaranteed stream processing.

---
