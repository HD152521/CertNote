# Day 3 - A Bird's-Eye View of AWS Data Services

AWS has dozens of data-related services. Open the console for the first time and Kinesis, Glue, EMR, Redshift, Athena, Lake Formation… a flood of similar-sounding names leaves you overwhelmed. But line them up **in the order data flows**, and a map emerges. Data always follows the flow of **ingestion → storage → processing → analytics**, with **governance (security and cataloging)** wrapping around the whole thing.

Today we draw the map of which services belong to which of these five categories. Deep details of individual services come in later weeks; today's goal is to place "which stage of the pipeline does this service live in" in your head. Half the exam questions are "which service fits this scenario?", and the answer comes from this map.

## The Data Flow Is the Service Map

```
[Ingestion]  [Storage]     [Processing]    [Analytics]
 Kinesis  →  S3       →   Glue        →  Athena
 MSK         Redshift     EMR            Redshift
 DMS         DynamoDB     Lambda         QuickSight
 DataSync                 EMR Serverless OpenSearch
   │            │            │               │
   └────────────┴────────────┴───────────────┘
         [Governance] Lake Formation · Glue Catalog · IAM · KMS
```

This single diagram is the skeleton of DEA-C01 service knowledge. Data flows from left (ingestion) to right (analytics), and the governance layer at the bottom oversees permissions, cataloging, and encryption across every stage.

> 💡 **Related theory**: In industry-standard terminology, this flow is called "the stages of a data pipeline." Each stage should be loosely coupled. For example, placing S3 or a stream buffer between ingestion (Kinesis) and processing (Lambda) means ingestion doesn't get blocked even when the processing stage slows down. This pattern of "decoupling stages with buffers" is the key to designing robust pipelines.

## Ingestion: Bringing Data In

This is the entry point that brings data from the source into AWS. The tool depends on the nature of the source.

| Service | Purpose | When |
|--------|------|------|
| Kinesis Data Streams | Real-time stream ingestion | Low latency, multiple consumers |
| Kinesis Data Firehose | Stream → S3/Redshift loading | Near-real-time automatic delivery |
| Amazon MSK | Managed Apache Kafka | Existing Kafka ecosystem |
| AWS DMS | DB migration/replication | RDS/on-prem DB to S3/Redshift |
| AWS DataSync | Large-scale file transfer | On-prem NFS/SMB → S3 |

The key distinctions: **real-time event streams go to Kinesis/MSK**, **pulling changes from an existing database means DMS (including CDC)**, and **bulk on-prem files mean DataSync**.

> 💡 **Related theory**: DMS's real value lies in CDC (Change Data Capture). It reads the operational DB's transaction log and continuously replicates "only the changes," keeping the analytics environment current without dumping everything each time. This is the standard way to flow data into OLAP while putting almost no load on OLTP.

## Storage: Holding Data

Where the ingested data lives. Day 1's OLTP/OLAP and lake/warehouse distinctions apply directly.

| Service | Type | Role |
|--------|------|------|
| Amazon S3 | Object storage | Foundation of the data lake, all raw data |
| Amazon Redshift | Data warehouse (OLAP) | Large-scale analytics on cleansed, structured data |
| Amazon DynamoDB | NoSQL (OLTP) | Key-value, low-latency high-volume reads/writes |
| Amazon RDS/Aurora | Relational (OLTP) | Transactional operational DB |

**S3 is the center of everything.** It is the foundation of the data lake and the input/output point of nearly every processing and analytics service. When "where should I store this" feels vague, S3 is the default.

```bash
# S3 is the foundation of the data lake — store in a partitioned structure
aws s3 cp orders.parquet \
  s3://datalake/raw/orders/year=2026/month=06/day=25/

# Athena runs SQL queries directly on this S3 data (no separate loading needed)
# If the Glue Catalog knows the schema, it's instantly queryable
```

> 💡 **Related theory**: S3 storage classes (Standard, Intelligent-Tiering, Glacier, etc.) and lifecycle policies are the heart of cost optimization. Automatically moving infrequently used historical data to cheaper tiers is a data engineer's day-to-day work, and the exam covers it with real weight.

## Processing: Transforming Data

These are the engines that cleanse and transform raw data into an analyzable form. Choose by data volume and the nature of the job.

| Service | Engine | Suited For |
|--------|------|------------|
| AWS Glue | Serverless Spark | Managed ETL, catalog integration |
| Amazon EMR | Hadoop/Spark clusters | Large-scale, custom big data processing |
| AWS Lambda | Functions | Lightweight event-driven transforms |
| Glue / EMR Serverless | Serverless | Spark without cluster management |

**Glue is the "default for managed ETL."** It runs Spark-based transformations without server management, with an integrated data catalog, crawlers, and scheduler. **EMR is for when you need more control and scale**, or when porting existing Hadoop/Spark code as-is. **Lambda suits small event-driven transforms** (e.g., processing a file the moment it arrives).

> 💡 **Related theory**: A Glue Crawler scans S3 data, automatically infers the schema, and registers it as a table in the Glue Data Catalog. This catalog becomes the "shared metadata dictionary" used by Athena, Redshift Spectrum, and EMR. In other words, register once in the catalog, and multiple analytics engines see the same data with the same definitions.

## Analytics: Getting Answers from Data

The consumption layer where you pose questions to the cleansed data.

| Service | Purpose |
|--------|------|
| Amazon Athena | Serverless SQL queries on S3 |
| Amazon Redshift | Large-scale warehouse queries |
| Amazon QuickSight | BI dashboards and visualization |
| Amazon OpenSearch | Log/text search, real-time analytics |

**Athena queries data loaded in S3 with SQL right where it sits, without moving it** — a serverless tool. With no infrastructure and billing based only on the amount of data scanned, it's ideal for occasional ad-hoc analysis. If you query frequently, quickly, and at large scale, load the data into Redshift. To turn final results into dashboards for humans, it's QuickSight.

## Governance: Controlling the Entire Span

The security, catalog, and permissions layer that cuts across every stage from ingestion to analytics.

| Service | Role |
|--------|------|
| AWS Lake Formation | Central data lake permissions and governance |
| AWS Glue Data Catalog | Unified metadata catalog |
| AWS IAM | Identity and access permissions |
| AWS KMS | Encryption key management |

**Lake Formation grants fine-grained "table, column, and row level" permissions** on the S3 data lake. If IAM answers "can this person access this S3 bucket," Lake Formation controls "can this person see this column of this table."

> 💡 **Related theory**: Governance is its own category because in a data pipeline, security, permissions, and lineage are not a single stage's problem but a cross-cutting concern that runs through the entire span. Tracking who accessed which data, and where that data came from and went (data lineage), is the essence of governance.

## Wrapping Up

The map we drew today boils down to one thing. AWS data services are arranged along the flow of **ingestion → storage → processing → analytics**, with **governance** wrapping around the whole. When you face a vague scenario question, first ask "which stage of the flow is this," then narrow the candidate services in that stage by "real-time or batch, managed or full control, and how much data."

In the next article, we look at what "shape" the data flowing through this pipeline is stored in — CSV, JSON, Parquet, ORC, Avro, columnar vs row-oriented, and schema evolution.

---

## 📝 Practice Questions

**Question 1.** Which option correctly orders the four-stage flow that forms the basic skeleton for understanding AWS data pipelines?

A) Analytics → Processing → Storage → Ingestion  
B) Ingestion → Storage → Processing → Analytics  
C) Storage → Ingestion → Analytics → Processing  
D) Processing → Ingestion → Analytics → Storage  

**Answer: B**  
Explanation: Data flows in the order of ingestion from the source (Kinesis/DMS, etc.) → storage that holds it (S3/Redshift) → processing that transforms it (Glue/EMR) → analytics that gets answers (Athena/QuickSight). Governance (Lake Formation/IAM/KMS) wraps across this entire span. The other options scramble the order of the flow.

---

**Question 2.** You want to continuously replicate changes (CDC) from a live RDS database to the analytics environment (S3/Redshift) without operational load. Which ingestion service is the best fit?

A) AWS DataSync  
B) AWS DMS  
C) Kinesis Data Streams  
D) Amazon QuickSight  

**Answer: B**  
Explanation: DMS is a database migration and replication service that uses CDC to read only the changes from the transaction log, flowing data into the analytics environment while putting almost no load on OLTP. DataSync is for on-prem file transfer, Kinesis is for real-time event streams, and QuickSight is a BI visualization tool.

---

**Question 3.** Which service lets you run ad-hoc SQL queries on data in S3 right where it sits — with no separate infrastructure and no data movement — billing only for the amount scanned?

A) Amazon Redshift  
B) Amazon Athena  
C) Amazon EMR  
D) AWS Glue  

**Answer: B**  
Explanation: Athena is a serverless SQL query engine that operates on top of S3, querying data in place without loading or moving it, and charging by the amount of data scanned. Redshift is a warehouse that requires loading data, EMR is a big data cluster, and Glue is an ETL processing engine.

---

**Question 4.** Which service centrally manages metadata so that multiple analytics engines (Athena, Redshift Spectrum, EMR) share the same data with identical schema definitions?

A) AWS Glue Data Catalog  
B) Amazon S3  
C) AWS KMS  
D) Amazon DynamoDB  

**Answer: A**  
Explanation: The Glue Data Catalog is the unified metadata catalog; table definitions registered by the Crawler are referenced in common by Athena, Redshift Spectrum, EMR, and others. S3 is data storage, KMS is encryption key management, and DynamoDB is a NoSQL database.

---

**Question 5.** If IAM controls "whether a bucket can be accessed," which governance service centrally grants fine-grained table, column, and row level access permissions on an S3 data lake?

A) AWS KMS  
B) AWS Lake Formation  
C) Amazon OpenSearch  
D) AWS DataSync  

**Answer: B**  
Explanation: Lake Formation is the governance service that centrally grants fine-grained table, column, and row level permissions on the data lake. Where IAM handles access at the resource (bucket) level, Lake Formation controls the data units within. KMS handles encryption keys, OpenSearch is search analytics, and DataSync is a file transfer tool.

---
