# Day 3 - Data Ingestion: Kinesis, Glue, Batch vs. Streaming

Training data has to flow in from somewhere. Click logs, IoT sensors, and transaction events pour in as real-time streams, while data from operational databases and external systems arrives in periodic batches. The Specialty exam asks scenario questions like "Which Kinesis service for this ingestion requirement? How do you use Glue?"

Today we cover (1) distinguishing the four Kinesis services (Data Streams, Firehose, Managed Service for Flink, Video), (2) Glue's ETL, catalog, and crawlers, and (3) the difference between batch training data and streaming training data.

## Distinguishing the Four Kinesis Services: A Specialty Staple

"Kinesis" is not one service but four. The names are easy to mix up, so you must distinguish them precisely.

| Service | Role | Key characteristics |
|--------|------|----------|
| **Data Streams (KDS)** | Real-time stream ingestion & storage | Shard-based, requires your own consumer code, data retention (up to 365 days) |
| **Data Firehose** | Stream→destination delivery (ETL loading) | Fully managed, auto-delivers to S3/Redshift/OpenSearch, buffering & transformation |
| **Managed Service for Flink** | Real-time stream analytics | Windowed aggregation & anomaly detection with SQL/Flink |
| **Video Streams** | Video stream ingestion | Video input for ML (facial recognition, etc.) |

The decision tree for the most commonly confused pair, KDS vs. Firehose:

- **Only need automatic delivery to a destination?** → Firehose (delivers to S3 etc. with no code)
- **Multiple consumers processing the same stream differently? Custom processing? Data replay?** → Data Streams

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
# Firehose: automatic delivery to S3 with no code + buffering configuration (delivery stream example)
firehose = boto3.client("firehose")
firehose.put_record(
    DeliveryStreamName="to-datalake",
    Record={"Data": json.dumps({"user_id": "u123", "amount": 42.0}) + "\n"},
)
# Once the buffer fills (e.g., 5MB or 60 seconds), Firehose converts to Parquet, compresses, and lands it in S3
```

> 💡 **Related theory**: KDS scales throughput in units of shards. One shard handles 1MB/s or 1,000 records/s of writes and 2MB/s of reads, so as traffic grows you must add shards (or use on-demand mode). KDS also retains data, so multiple consumers can read the same data independently and reprocess it (replay). Firehose, by contrast, has no retention or replay — it is a "fire and forget" pipe responsible only for delivering to a destination. The key branch: "multiple consumers/reprocessing = KDS, simple delivery = Firehose."

## Glue: Serverless ETL and the Data Catalog

AWS Glue is a serverless service that bundles three things.

1. **Glue Data Catalog**: A central repository of data metadata (schema, location, partitions). Shared by Athena, Redshift Spectrum, and EMR.
2. **Glue Crawler**: Scans S3 and other stores, automatically infers schemas, and registers them as tables in the catalog.
3. **Glue ETL Jobs**: Serverless transformation jobs based on Spark (or Python shell).

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

> 💡 **Related theory**: Glue's DynamicFrame is an ML/ETL-friendly extension of the Spark DataFrame that can handle semi-structured data with inconsistent schemas (like JSON) without schema enforcement (rows with schema mismatches are preserved rather than dropped). Once structured transformation is done, call `toDF()` to convert to a regular Spark DataFrame and use familiar operations. Thanks to the Data Catalog populated by the crawler, you can explore data immediately with SQL in Athena, speeding up the data-understanding (EDA) stage before ML preprocessing.

## Batch Training Data vs. Streaming Training Data

ML data ingestion splits into two patterns.

| Aspect | Batch | Streaming |
|------|------------|---------------------|
| Arrival pattern | Periodic bulk loads (daily/hourly) | As soon as each event arrives |
| Typical tools | Glue, EMR, Batch, S3 | Kinesis, MSK (Kafka) |
| Latency | Minutes to hours | Seconds to milliseconds |
| Training fit | Most model retraining | Real-time features & online learning |
| Freshness | Staleness acceptable | Recency is the value |

Most ML training is **batch** — for example, retraining the model each night on accumulated data. Streaming is needed when (1) real-time features (transaction count in the last 5 minutes) must feed inference, or (2) an immediate score is required, as in fraud detection.

```python
# Lambda architecture pattern: process the stream immediately while also landing it in S3 for later batch retraining
# Firehose → S3 (accumulate the data lake for batch training)
# KDS → Flink → real-time features → inference endpoint (immediate processing)
```

> 💡 **Related theory**: The lambda architecture processes the same data simultaneously through a **speed layer** (streaming, low-latency approximation) and a **batch layer** (periodic, accurate and complete), combining the strengths of both. In ML it is commonly used as: accumulate every event in S3 via Firehose (for batch retraining) while computing real-time features with KDS+Flink (for immediate inference). Note that if the feature computation logic diverges between the two paths, training-serving skew arises, so consistency management is important.

## Thinking Through Ingestion Pipeline Design

When solving exam scenarios, ask in order: (1) Is the data a stream or a batch? (2) If a stream, is it simple delivery (Firehose) or custom/multi-consumer (KDS)? (3) Is transformation needed (Glue ETL)? (4) Is the destination a data lake (S3) or analytics (Redshift/OpenSearch)? These four questions solve most ingestion problems.

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
