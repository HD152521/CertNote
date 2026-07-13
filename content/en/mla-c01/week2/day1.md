# Day 1 - Data Collection: S3 Data Lake, Kinesis, Batch Ingestion, Data Formats

The first gateway to a machine learning pipeline is "where and how do we get the data?" No matter how sophisticated a model architecture is, if data doesn't come in, nothing can be learned. In the MLA-C01 exam, Domain 1 (Data Preparation for Machine Learning) accounts for approximately 28% of the total, and the starting point for that is precisely **ingestion**.

Today we examine three pathways through which data enters AWS — S3, the heart of the data lake; Kinesis, for real-time streaming; and periodic batch ingestion — and finally, the choice of data format (Parquet/CSV/JSON) that determines ML training performance.

## S3: The Center of an ML Data Lake

In AWS, the de facto single source of truth for ML data is **Amazon S3**. SageMaker's training jobs, Glue's ETL, and Athena's queries all use S3 as input and output. There are three reasons why S3 is the center of an ML data lake.

1. **Virtually unlimited capacity**: Up to 5TB per object, no limit on object count per bucket. Accommodates petabyte-scale training data.
2. **Separation of compute and storage**: Keep data in S3, attach compute (SageMaker/EMR/Glue) only when needed. Cost scales with usage.
3. **Broad integration**: Nearly every AWS analytics/ML service natively reads and writes S3.

A data lake is typically organized hierarchically into **zones**.

| Zone | Alias | Content | Format |
|------|------|------|------|
| Raw | Bronze / Landing | Original data collected as-is | Original (JSON, CSV, logs) |
| Cleaned | Silver | Validated and cleaned data | Parquet |
| Curated | Gold | After feature engineering, just before training | Parquet |

> 💡 **Related Theory**: This Bronze/Silver/Gold layering is the **Medallion Architecture** popularized by Databricks. The core insight is "never overwrite the original; preserve each transformation step in a separate zone." This way, if a bug is discovered in the transformation logic, you can go back to Raw and reprocess, and data lineage tracking becomes easy. It's a pattern that enforces immutability at the data layout level.

S3 storage classes also matter in the ML context. Data frequently used for training should use **S3 Standard**, while historical data kept occasionally for retraining is suited for **S3 Intelligent-Tiering** (auto-analyzes access patterns) or **Glacier**.

```python
import boto3

s3 = boto3.client("s3")

# Upload training data (curated zone)
s3.upload_file(
    Filename="train.parquet",
    Bucket="ml-datalake-prod",
    Key="curated/customer-churn/year=2026/month=06/train.parquet",
)
```

> 🔍 **Deeper Dive**: The `year=2026/month=06/` part in the Key above is exactly **Hive-style partitioning**. Athena and Glue read this `key=value` directory structure and automatically recognize partitions. Partitioning is covered in depth on Day 4.

## Kinesis: Real-Time Streaming Ingestion

When batching isn't enough — clickstreams, IoT sensors, real-time fraud detection — use the **Kinesis** product family. The exam tests your ability to distinguish the exact use cases of four variations.

| Service | Use Case | Key Characteristic |
|------|------|------|
| **Kinesis Data Streams (KDS)** | Low-latency custom stream processing | Shard-based, data retention 1–365 days, consumers handle directly |
| **Kinesis Data Firehose** | Stream → storage (S3/Redshift/OpenSearch) loading | Fully managed, serverless, near-real-time (buffered) |
| **Kinesis Data Analytics** | Real-time SQL/Flink analytics on streams | Window aggregation |
| **Kinesis Video Streams** | Video stream ingestion | Input for ML vision pipeline |

The most common combination in ML data ingestion is **KDS → Firehose → S3**. Or simply **Firehose → S3** direct loading. Firehose dumps to S3 in batches when either buffer size (e.g., 5MB) or buffer time (e.g., 60 seconds) is reached first.

```python
import boto3, json

firehose = boto3.client("firehose")

firehose.put_record(
    DeliveryStreamName="clickstream-to-s3",
    Record={"Data": json.dumps({"user": "u123", "event": "click"}) + "\n"},
)
```

> 🔍 **Deeper Dive**: KDS manages throughput at the **shard** level. One shard handles 1MB/s writes (or 1,000 records/s), 2MB/s reads. If throughput is insufficient, you must increase shards (resharding). Firehose, by contrast, is serverless with no shard management, but delivers "near-real-time" buffered data, not true real-time. In the exam: "minimal management + S3 loading" = Firehose; "sub-second custom processing + multiple consumers" = KDS.

> 💡 **Related Theory**: Kinesis follows a distributed log abstraction. The open-source equivalent is Apache Kafka. The core idea is to write data sequentially to an **append-only log** and have multiple consumers each maintain their own offset (checkpoint) and read independently. This allows the same stream to be consumed simultaneously by a real-time dashboard and an ML feature pipeline.

## Batch Ingestion: DataSync, Transfer Family, DMS, Glue

Most ML data that doesn't require real-time collection is ingested in batches.

| Service | Source → Target | Use Case |
|------|------|------|
| **AWS DataSync** | On-premises NFS/SMB → S3/EFS | Large-scale file one-time/periodic migration |
| **AWS Transfer Family** | SFTP/FTPS client → S3 | Partners transfer data via SFTP |
| **AWS DMS** | Relational DB (RDS/on-prem) → S3/Redshift | Replicate DB data for analytics/ML |
| **AWS Glue (batch ETL)** | Various sources → S3 | Periodic collection with transformation (Day 2) |
| **Snowball/Snowmobile** | Petabyte-scale physical transfer | Scale too large to be practical over network |

> 🔍 **Deeper Dive**: A common exam trap — "100TB on-premises to S3, internet 100Mbps." Transferring 100TB at 100Mbps takes about 92 days. In this scenario, **Snowball** (physical device shipping) is the right answer. With sufficient bandwidth, DataSync is appropriate. DMS is the answer when the keyword is "continuous replication of a relational DB (CDC, Change Data Capture)."

## Data Formats: Parquet vs CSV vs JSON

This decision drives both ML training performance and cost. It appears very frequently on the exam.

| Format | Storage | Compression | Schema | Best For |
|------|------|------|------|------|
| **CSV** | Row-based | Weak | None | Small scale, human readable |
| **JSON** | Row-based | Weak | Flexible (nested) | Semi-structured, API responses, logs |
| **Parquet** | **Columnar** | Strong (Snappy/GZIP) | Built-in | **Large-scale ML/Analytics** |
| **ORC** | Columnar | Strong | Built-in | Hive ecosystem |
| **Avro** | Row-based | Medium | Built-in (schema evolution) | Streaming, schema evolution |

**Why Parquet is the default choice for ML**:

- **Columnar storage**: Only read the feature columns you need, dramatically reducing I/O. If you use only 5 out of 100 columns, scan only 5.
- **Column-level compression**: Values of the same type are adjacent, so compression ratio is high. Typically 2–10x smaller than CSV.
- **Predicate pushdown**: Athena/Spark can skip unnecessary data blocks when you need "only this partition/this value."
- **Built-in schema**: Type information is in the file, so separate schema files aren't needed.

```python
import pandas as pd

# CSV → Parquet conversion (Snappy compression)
df = pd.read_csv("raw/transactions.csv")
df.to_parquet("curated/transactions.parquet", compression="snappy", index=False)
```

> 💡 **Related Theory**: The essence of columnar storage is **OLAP (analytical) workload optimization**. Analytical queries are typically "aggregation over millions of rows × few columns," and row-based storage has to read unnecessary columns from disk too. Columnar storage keeps columns separate, reading only what's needed, and with the same type adjacent, run-length/dictionary encoding gives high compression. Conversely, OLTP (transactional) work often touches "entire rows" and benefits from row-based. ML training is mostly OLAP-oriented, so Parquet fits.

> ⚠️ **Gotcha**: JSON is readable to humans and good for nested structures, but inefficient as a training data format. It's text-heavy, has parsing cost each time, and column-level skipping is impossible. The standard pattern is to receive JSON in the Raw zone but convert to Parquet as you move to Cleaned/Curated zones.

## Summary

The essence of ML data collection is to **center on an S3 data lake**, choose **Kinesis (Firehose→S3 most common)** for real-time or **DataSync/DMS/Transfer Family** for batch, and use **Parquet** as the default storage format for large-scale training.

Next, we'll explore how AWS Glue catalogs collected data and transforms it via ETL.

---

## 📝 연습 문제

**문제 1.** A team wants to collect website clickstream data and load it to S3. They want to minimize infrastructure management burden while storing in S3 near-real-time. What is the most suitable service?

A) Write directly to S3 using Kinesis Data Streams  
B) Load to S3 using Kinesis Data Firehose  
C) Replicate clickstream using AWS DMS  
D) Transfer data using AWS Snowball  

**정답: B**  
해설: Firehose is fully managed, serverless, requiring no shard management, and automatically batches load to S3 based on buffer size/time conditions. This is the textbook answer for "minimize management burden + S3 loading." Kinesis Data Streams (A) cannot write directly to S3 and requires building a consumer application, creating management burden. DMS (C) is for relational DB replication, not suited for clickstreams. Snowball (D) is for one-time physical transfer of large volumes.

---

**문제 2.** For a dataset with 100 columns and 5TB size, only 5 columns are used in ML training. What storage format minimizes I/O cost and scan volume during training?

A) CSV (GZIP compression)  
B) JSON  
C) Parquet  
D) Uncompressed text  

**정답: C**  
해설: Parquet is columnar, so you read only the 5 needed columns, dramatically reducing I/O. It also supports column-level compression and predicate pushdown. CSV (A) is row-based even when GZIP-compressed, so you must read all 100 columns. JSON (B) is text-based, making it large and expensive to parse. Uncompressed text (D) is most inefficient.

---

**문제 3.** An on-premises data center has 200TB of training images, and the internet connection is 50Mbps. What is the most practical way to move this data to S3?

A) Transfer via internet using AWS DataSync  
B) Physical transfer using AWS Snowball device  
C) Stream using Kinesis Data Firehose  
D) S3 multipart upload script  

**정답: B**  
해설: Transferring 200TB at 50Mbps takes over a year, making it impractical. This petabyte-scale/high-volume + slow-connection scenario calls for Snowball (physical device shipping). DataSync (A) and multipart uploads (D) are only viable with sufficient bandwidth. Firehose (C) is a streaming ingestion tool, not designed for large-scale one-time migration.

---

**문제 4.** Building an ML data lake, you want to safely preserve original data while tracking transformation stages. What is the most appropriate design principle?

A) Overwrite original data with transformation results to save storage  
B) Organize into Raw/Cleaned/Curated zones and never overwrite the original  
C) Store all data flat in a bucket root  
D) Delete original immediately after transformation  

**정답: B**  
해설: Medallion Architecture (Bronze/Silver/Gold = Raw/Cleaned/Curated) preserves originals immutably and keeps each transformation stage in a separate zone. If a bug is found in transformation logic, you can return to Raw and reprocess; data lineage tracking becomes easy. Overwriting originals (A) or deleting (D) create reprocessing impossibility and data loss risk. Flat storage (C) is hard to manage and partition.

---

**문제 5.** Which scenario is better suited for Kinesis Data Streams than Kinesis Data Firehose?

A) Load data to S3 while minimizing management burden  
B) Process with sub-second latency and have multiple consumers independently read the same stream  
C) Just auto-load to Redshift  
D) Operate serverless without infrastructure  

**정답: B**  
해설: KDS supports shard-based sub-second latency and multiple consumers (each maintaining its own offset), making it ideal for scenarios where a single stream is consumed simultaneously by a real-time dashboard and an ML pipeline. A·C·D are all strengths of fully managed, serverless Firehose focused on storage loading.

---
