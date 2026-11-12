# Day 3 - Data Ingestion: Kinesis, Glue, Batch vs. Streaming

## 📌 Key Takeaways

- Kinesis is not one service but **four** — Data Streams, Data Firehose, Managed Service for Flink, and Video Streams.
- Decision branch: **if you need multiple consumers or replay (reprocessing), choose KDS; if you only need code-free delivery to a destination, choose Firehose**.
- Glue has three parts — the **Data Catalog** (metadata), the **Crawler** (automatic schema inference), and the **ETL Job** (serverless Spark).
- Most model retraining is **batch**. Use streaming only when you need real-time features or an immediate score.
- If you want both real-time speed and accuracy, use the **lambda architecture** (speed layer + batch layer). But if the feature logic of the two paths drifts apart, skew appears.

## The Four Kinesis Services

Training data has to flow in from somewhere. Click logs, IoT sensors, and transaction events pour in as real-time streams, while data from operational databases and external systems arrives in periodic batches. "Kinesis" is easy to confuse by name alone, so you need to tell the services apart precisely.

| Service | Role | Key characteristics | Typical ML use |
|---|---|---|---|
| **Data Streams (KDS)** | Real-time stream ingestion and storage | Shard-based, requires consumer code, data retention (up to 365 days), replay possible | Multi-consumer event bus, reprocessing |
| **Data Firehose** | Stream-to-destination delivery | Fully managed, auto-delivers to S3/Redshift/OpenSearch, buffering and format conversion | Accumulating a data lake |
| **Managed Service for Flink** | Real-time stream analytics | Windowed aggregation and anomaly detection with SQL/Flink | Real-time feature computation |
| **Video Streams** | Video stream ingestion | Input for video ML | Face recognition, video analysis |

### KDS vs. Firehose Decision Tree

```
How will you use the stream data?
├─ Only need automatic delivery to a destination (S3/Redshift/OpenSearch) → Firehose
│    · no consumer code  · buffering (by size or time)  · Parquet conversion and compression available
└─ Several consumers process the same stream differently,
   or you need custom processing / replay after a failure   → Data Streams
        · shard management  · retention  · independent offset per consumer
```

```python
import boto3, json
kinesis = boto3.client("kinesis")

# Put an event into Data Streams — PartitionKey distributes across shards
kinesis.put_record(
    StreamName="clickstream",
    Data=json.dumps({"user_id": "u123", "event": "click", "ts": 1719300000}),
    PartitionKey="u123",     # same key → same shard → unit of ordering guarantee
)
```

```python
# Firehose: automatic delivery to S3 with no code + buffering settings (example delivery stream configuration)
firehose = boto3.client("firehose")
firehose.put_record(
    DeliveryStreamName="to-datalake",
    Record={"Data": json.dumps({"user_id": "u123", "amount": 42.0}) + "\n"},
)
# Once the buffer fills (e.g., 5MB or 60 seconds), Firehose converts to Parquet, compresses, and loads into S3
```

KDS scales throughput in units of shards. One shard handles 1MB/s and 1,000 records/s of writes and 2MB/s of reads, so as traffic grows you must add shards (or use on-demand mode). KDS also retains data, so multiple consumers can read the same data independently and reprocess it (replay). Firehose, by contrast, has no retention or replay and is a "fire and forget" pipe responsible only for loading into a destination.

> ⚠️ **Pitfall**: "It's real time, so it must be KDS" is a trap answer. If the passage has only one consumer and hints such as "without code" or "minimal management overhead," Firehose is the answer. Conversely, if you see "reprocessing" or "multiple teams each consuming," Firehose is eliminated.

## Glue: Serverless ETL and the Data Catalog

AWS Glue is a serverless service that bundles three things.

1. **Glue Data Catalog** — a central repository of data metadata (schema, location, partitions). Shared by Athena, Redshift Spectrum, and EMR.
2. **Glue Crawler** — scans S3 and other stores, automatically infers the schema, and registers it as a table in the catalog.
3. **Glue ETL Jobs** — serverless transformation jobs based on Spark (or Python shell).

```python
# Glue ETL job (PySpark) — read a catalog table, clean it, and save as Parquet
import sys
from awsglue.context import GlueContext
from awsglue.transforms import DropNullFields
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())

# Load the table the crawler registered in the catalog as a DynamicFrame
dyf = glueContext.create_dynamic_frame.from_catalog(
    database="raw_db", table_name="clickstream"
)
clean = DropNullFields.apply(frame=dyf)          # drop null columns

# Save as Parquet in the training feature location (with partitioning)
glueContext.write_dynamic_frame.from_options(
    frame=clean,
    connection_type="s3",
    connection_options={"path": "s3://my-lake/features/", "partitionKeys": ["dt"]},
    format="parquet",
)
```

Glue's DynamicFrame is an ML/ETL-friendly extension of the Spark DataFrame that can handle semi-structured data with inconsistent schemas (such as JSON) without enforcing a schema (rows with schema mismatches are preserved rather than discarded). Once structured transformation is done, call `toDF()` to convert to a regular Spark DataFrame and use familiar operations. Thanks to the Data Catalog populated by the Crawler, you can explore data immediately with SQL in Athena, which speeds up the data-understanding (EDA) stage before ML preprocessing.

### Clearing Up Confusion Among Ingestion and Catalog Tools

| Tool | What it does | What it does not do |
|---|---|---|
| Glue Crawler | Infers schema + registers catalog tables | Does not move or transform data |
| Glue ETL Job | Cleans, joins, aggregates, and converts formats with Spark | Does not handle real-time stream ingestion |
| Kinesis Firehose | Loads a stream into a destination | Does not support retention, replay, or multiple consumers |
| Athena | SQL queries over the catalog | Is not an engine for large-scale repeated ETL |
| DMS | DB → data lake migration and CDC | Does not do feature engineering |

## Batch Ingestion Paths: How Does Non-Stream Data Get In?

Not all data arrives as a stream. You also need to know the paths from operational databases, external files, and on-premises storage.

| Tool | What it does | When to choose it |
|---|---|---|
| **AWS DMS** | DB → S3/Redshift migration and CDC (change data capture) | When continuously flowing changes from an operational RDB into a data lake |
| **AWS DataSync** | Bulk transfer between on-premises NFS/SMB and S3/EFS/FSx | When periodically moving training data from an internal file server |
| **AWS Snow family** | Large offline transfer using physical devices | When the data is too large or the network link too slow to move over the network |
| **AWS Batch / EMR** | Runs large-scale batch computation | When running heavy transformations and aggregations after ingestion |
| **Direct S3 upload** | The simplest way to load | When the files are already in hand and the scale is small |

> ⚠️ **Pitfall**: If a passage says "we need to move petabytes" and you choose network transfer (DataSync) without thinking, you miss the constraint of line speed. If there is a hint that the transfer would take weeks, the Snow family is the candidate answer.

## What Often Breaks in Streaming Ingestion

Streaming is operationally harder than batch. The exam reflects this difficulty directly.

- **Ordering**: KDS guarantees order **only within the same shard**. If per-user ordering matters, set the `PartitionKey` to the user ID.
- **Duplicates (at-least-once)**: A retry can cause the same record to arrive twice. The consumer must handle this idempotently.
- **Late arrival**: An event delayed by the network may belong to a window that has already closed. Flink's watermark concept handles this.
- **Hot shard**: If the PartitionKey skews toward one value, only that shard saturates. Key design is throughput design.
- **Capacity management**: Provisioned mode requires you to manage the shard count yourself, while on-demand mode adjusts automatically to traffic.

## Batch Training Data vs. Streaming Training Data

ML data ingestion splits into two patterns.

| Aspect | Batch | Streaming |
|---|---|---|
| Arrival pattern | Periodic bulk loads (daily/hourly) | As soon as each event arrives |
| Typical tools | Glue, EMR, Batch, S3 | Kinesis, MSK (Kafka) |
| Latency | Minutes to hours | Seconds to milliseconds |
| Training fit | Most model retraining | Real-time features, online learning |
| Freshness | Staleness acceptable | Recency is the value |
| Operational difficulty | Low (rerun on failure) | High (ordering, duplicates, late data handling) |

- Most ML training is **batch**. For example, you retrain the model every night on the accumulated data.
- Streaming is truly necessary in two cases: (1) when a real-time feature (transaction count in the last 5 minutes) must be used for inference, and (2) when an immediate score is needed, as in fraud detection.

```
[Lambda architecture]

Events ──┬─▶ KDS ─▶ Flink (windowed aggregation) ─▶ real-time features ─▶ inference endpoint
         │            (speed layer: low latency, approximate)
         └─▶ Firehose ─▶ S3 data lake ─▶ batch retraining ─▶ model update
                      (batch layer: accurate, complete)
```

The lambda architecture processes the same data simultaneously through a **speed layer** (streaming, low-latency approximation) and a **batch layer** (periodic, accurate and complete), combining the strengths of both. In ML it is commonly used as follows: accumulate every event in S3 via Firehose (for batch retraining) while computing real-time features with KDS + Flink (for immediate inference). However, if the feature computation logic of the two paths diverges, training-serving skew arises, so consistency management is important.

The real cost of the lambda architecture is not infrastructure but **maintaining the logic twice**. If "transaction count in the last 5 minutes" is computed differently in the real-time path and the batch path, the model receives values at inference time that it never saw during training. The standard remedy is to consolidate the definition in one place with a Feature Store.

## Firehose Transformation Features

Firehose does not just "deliver." You can insert light processing along the way, so the range of correct answers for simple-loading scenarios is wider than you might think.

- **Lambda transformation**: Invokes a Lambda before delivery to clean, filter, or reformat records.
- **Format conversion**: Converts JSON records to **Parquet/ORC** before loading (referencing the schema in the Glue Data Catalog).
- **Buffering**: Delivers when either the size condition (e.g., 5MB) or the time condition (e.g., 60 seconds) is reached first. A larger buffer makes larger files and reduces the small-file problem, but increases latency.
- **Compression and encryption**: Applies compression such as GZIP and KMS encryption at delivery time.
- **Error handling**: Writes records that failed delivery to a separate S3 prefix so they can be reprocessed later.

Do not jump to "we need a light transformation, so Firehose is out." For simple per-record transformations, Firehose + Lambda is enough; Glue ETL or Flink appears only when you need operations that cut across multiple records, such as joins and aggregations.

## Thinking Through Ingestion Pipeline Design

When solving exam scenarios, ask the following in order.

1. **Is the data a stream or a batch?**
2. If a stream, is it **simple loading (Firehose) or custom/multi-consumer (KDS)?**
3. **Is transformation needed?** → Glue ETL / EMR / SageMaker Processing
4. **Is the schema unknown?** → Start with a Glue Crawler to build the catalog
5. **Is the destination a data lake (S3) or an analytics store (Redshift/OpenSearch)?**

These five questions solve most ingestion problems.

Tomorrow we cover **attaching ground truth** to the data collected this way (SageMaker Ground Truth, active learning, label quality).

## 📖 Glossary

- **Shard**: The unit of throughput in Kinesis Data Streams. Adding shards increases write and read capacity together.
- **PartitionKey**: The key that decides which shard a record goes into. The same key goes to the same shard, so order is guaranteed.
- **Retention**: The period for which a stream holds data. Within this period, consumers can read it again.
- **Replay**: Rereading an already-processed range from the beginning to reprocess it. Essential for failure recovery and after logic changes.
- **Glue Data Catalog**: A central metadata repository holding the schema, location, and partitions of data.
- **Glue Crawler**: A tool that scans a data store, infers the schema, and registers it as a table in the catalog.
- **DynamicFrame**: Glue's extension of the Spark DataFrame. It handles data with ragged schemas without discarding rows.
- **Lambda architecture**: A design that processes the same data through a real-time path and a batch path at the same time to get both freshness and accuracy.
- **CDC (change data capture)**: A method of extracting only the changed rows from an operational DB and streaming them continuously. DMS is the representative tool.
- **MSK**: AWS's managed Apache Kafka. The option when you want the Kafka ecosystem instead of Kinesis.

## 📝 Practice Questions

**Question 1.** An IoT sensor stream just needs to be automatically delivered as-is into an S3 data lake as Parquet, with no separate transformation or code. Which service fits best?

A) Kinesis Data Streams + a custom consumer  
B) Kinesis Data Firehose  
C) Kinesis Video Streams  
D) Glue Crawler  

**Answer: B**  
Explanation: Firehose is fully managed and specialized in buffering, format-converting (Parquet), and automatically delivering streams to destinations like S3 with no code. Data Streams requires consumer code and shard management, Video Streams is for video, and a Crawler is a schema inference tool, not a delivery mechanism.

---

**Question 2.** A single clickstream must be consumed independently by (1) a real-time dashboard, (2) a fraud detection model, and (3) later reprocessing, and the data must be re-readable after a failure. Which service fits?

A) Kinesis Data Firehose  
B) S3 alone  
C) Kinesis Data Streams  
D) Glue ETL Job  

**Answer: C**  
Explanation: Multiple consumers reading the same stream independently with data retention and replay is the core use case of Data Streams. Firehose is a simple delivery pipe that does not support retention, multiple consumers, or replay, and S3 or a Glue ETL job cannot satisfy the real-time multi-consumer streaming requirement.

---

**Question 3.** A large volume of JSON logs with unknown schemas has piled up in S3. Before starting SQL exploration with Athena, you want to automatically create the tables and schemas. Which tool do you use?

A) Glue Crawler  
B) Kinesis Firehose  
C) SageMaker Ground Truth  
D) EFS  

**Answer: A**  
Explanation: A Glue Crawler scans S3, automatically infers the schema, and registers tables in the Glue Data Catalog so Athena can query them with SQL right away. Firehose is for delivery, Ground Truth is for data labeling, and EFS is file storage — none relate to schema inference.

---

**Question 4.** What is the biggest reason most ML model retraining happens in batch rather than streaming?

A) Because streaming is always more expensive  
B) Because Kinesis does not support training  
C) Because batch is always more accurate  
D) Because retraining usually only needs periodic processing of accumulated bulk data, with no need for millisecond-level freshness  

**Answer: D**  
Explanation: In most cases, model retraining just needs to run periodically over data accumulated daily or hourly, so low latency is unnecessary and batch is the natural fit. Streaming is used in special situations that need real-time features or immediate scores. Cost and accuracy depend on the situation, and Kinesis-collected data can also be used for training.

---

**Question 5.** Which architecture pattern uses the same event data for both real-time feature computation (immediate inference) and periodic model retraining (accurate and complete)?

A) Consolidate all processing into a single batch job  
B) Lambda architecture — run a streaming (speed) layer and a batch layer in parallel  
C) Use streaming only  
D) Use a single path without duplicating the data  

**Answer: B**  
Explanation: The lambda architecture runs a speed layer (streaming, low-latency approximation) and a batch layer (periodic, accurate and complete) in parallel to get both real-time responsiveness and accuracy. In ML, this looks like accumulating to S3 via Firehose for retraining while computing real-time features with KDS+Flink. A single path alone struggles to satisfy both requirements at once.

---
