# Day 1 - Integrated Review of Domains 1 & 2: Ingestion, Transformation & Storage Management

This is our final week. Today we bring together the two domains that carry the greatest weight on the exam — **Domain 1 (Data Ingestion and Transformation, ~34%)** and **Domain 2 (Storage Management, ~26%)** — as a single data flow. Together they represent nearly 60% of the exam. The key to passing is not memorizing individual services, but understanding the pipeline as a whole: "data arrives, gets ingested, is transformed, and is stored."

## Domain 1: Ingestion (Collection) Patterns

Ingestion splits into two broad categories: **streaming** and **batch**. The exam asks: if you see keywords like "real-time" or "single-digit latency," choose streaming; if you see "periodic," "bulk," or "hourly," choose batch.

| Requirement Keyword | Suitable Service | Reason |
|----------------|------------|------|
| Real-time streaming, custom consumers, order guarantee | Kinesis Data Streams | Shard-based, retained for replay |
| Stream to S3/Redshift with no management overhead | Data Firehose | Fully managed, automatic buffering, transformation, delivery |
| Kafka-compatible streaming | Amazon MSK | Open-source Kafka migration |
| Bulk file ingestion | S3 + Glue | Foundational for batch ETL |
| Real-time database change capture (CDC) | AWS DMS | Source DB → target persistent replication |

> 💡 **Related theory**: Choose Kinesis Data Streams when you need direct consumption, replay, and order guarantees. Choose Firehose when your goal is "managed ingestion" with no shard/consumer overhead—Firehose automatically buffers by size and time, then delivers to its destination.

## Domain 1: Transformation (Refinement) Selection

Choosing a transformation engine hinges on "serverless or not + data scale + code style."

- **AWS Glue**: Serverless Spark ETL. Best default for small-to-medium workloads, schedule- or event-triggered pipelines. The key feature is **Glue job bookmarks** — track which data has already been processed to enable incremental ETL.
- **Amazon EMR**: Managed Hadoop/Spark cluster. Choose this for large scale, fine-tuned control, and reusing existing Spark/Hive code. Optimize costs with Spot instances + instance fleets.
- **Glue Studio / DataBrew**: Visual, no-code transformation. DataBrew is tailored to analysts for data profiling and cleansing.

```python
# Glue bookmark: process only new data since last run (incremental ETL)
job.init(args['JOB_NAME'], args)
dyf = glueContext.create_dynamic_frame.from_catalog(
    database="raw", table_name="events",
    transformation_ctx="dyf"  # bookmark tracks state by this context
)
# ... transform ...
job.commit()  # bookmark state saved at commit
```

> 💡 **Related theory**: Glue bookmarks work only when `transformation_ctx` and `job.commit()` are both present. Whenever you see "incremental ETL," "avoid reprocessing already-handled data," or "the scheduled job re-reads everything," the answer is always to enable bookmarks.

## Domain 2: Data Store Selection

Map stores by "structure / access pattern / query method."

| Requirement | Service | Core |
|---------|--------|------|
| Unstructured/semi-structured lake, unlimited scale, low cost | Amazon S3 | Data lake foundation storage |
| Large-scale analytical queries, columnar MPP data warehouse | Amazon Redshift | Petabyte-scale OLAP |
| Direct SQL on S3, serverless | Amazon Athena | Presto-based, no infrastructure management |
| Key-value, ultra-low latency, serverless | DynamoDB | Single-digit ms latency |
| Relational OLTP | RDS / Aurora | Transactional processing |

## Domain 2: Redshift Operations Essentials

The exam frequently asks about distribution keys and sort keys in Redshift.

- **Distribution Style (DISTSTYLE)**: `KEY` (co-locate by join column to reduce shuffle), `ALL` (replicate small dimension table across all nodes), `EVEN` (uniform distribution), `AUTO` (Redshift chooses).
- **Sort Key (SORTKEY)**: Accelerates range filters and time-range queries via zone maps for block skipping.
- **Redshift Spectrum**: Query external S3 data from Redshift without loading it first. Keep hot data in Redshift, cold data in S3 for tiering.

```sql
CREATE TABLE fact_sales (
  sale_id bigint, customer_id bigint, sale_ts timestamp, amount decimal(10,2)
)
DISTSTYLE KEY DISTKEY (customer_id)   -- optimize joins with customer dimension
SORTKEY (sale_ts);                    -- accelerate time-range queries
```

> 💡 **Related theory**: When joining a large fact table with a small dimension table, use `DISTSTYLE ALL` on the dimension to replicate it across all nodes and eliminate shuffle. When joining two large tables, use `DISTKEY` on both with the common join key to avoid data movement across nodes.

## Domain 2: Lake Formation and Catalogs

Managing permissions and metadata in a data lake.

- **Glue Data Catalog**: Central metastore shared by Athena, Redshift Spectrum, and EMR. Crawlers automatically infer schemas.
- **Lake Formation**: **Centralized, fine-grained access control** for a data lake. Grant permissions at table, column, row, and cell levels using LF-Tags. Instead of writing IAM policies for each S3 object, manage data permissions in one place.

> 💡 **Related theory**: Whenever you see "multiple teams sharing an S3 data lake, controlling access by column/row, managed centrally," the answer is almost always Lake Formation. IAM bucket policies alone cannot enforce column- or row-level control.

## Pipeline: Connecting Both Domains

A typical exam scenario flow:

1. **Ingestion**: Kinesis/Firehose (streaming) or DMS (CDC) → S3 raw zone
2. **Catalog**: Glue crawler infers schema → Data Catalog registration
3. **Transform**: Glue job (with bookmarks for incremental) or EMR → S3 curated zone (Parquet)
4. **Store/Query**: Athena for ad-hoc SQL, or load into Redshift for BI
5. **Governance**: Lake Formation enforces team-level fine-grained permissions

## Key Takeaways

- Ingestion maps to keywords: streaming (Kinesis/Firehose/MSK), batch (S3+Glue), CDC (DMS).
- Transformation: serverless → Glue, large-scale/tuning → EMR. Incremental ETL → Glue bookmarks.
- Storage: lake → S3, analytics DW → Redshift, serverless SQL → Athena, key-value → DynamoDB.
- Redshift uses DISTKEY/SORTKEY to reduce shuffle and scans, Spectrum to tier S3 data.
- Centralized fine-grained permissions → Lake Formation; shared metastore → Glue Data Catalog.

## 📝 Practice Questions

**Question 1.** A Glue job runs hourly on a schedule and must process only the new files in S3, but it re-reads all of the data every time, which makes cost and run time excessive. What is the most appropriate solution?

A) Switch to an EMR cluster  
B) Enable Glue job bookmarks and use transformation_ctx and job.commit()  
C) Empty the S3 bucket every hour  
D) Rebuild everything every time with Athena CTAS  

**Answer: B**  
Explanation: Glue bookmarks track data that has already been processed and support incremental processing. transformation_ctx tracks the state, and the state is saved when job.commit() is called. The other options do not solve incremental processing or increase cost and complexity.

---

**Question 2.** Multiple analytics teams share the same S3 data lake, and you want to centrally control access so that some columns of a particular table (for example, a national ID number) are visible only to certain teams. Which service is the most suitable?

A) Write per-team column rules in the S3 bucket policy  
B) Column-level permissions in AWS Lake Formation  
C) EC2 security groups  
D) CloudFront signed URLs  

**Answer: B**  
Explanation: Lake Formation centrally manages fine-grained permissions at the table, column, row, and cell level. S3 bucket policies control access only down to the object level, so column-level control is not possible. Security groups and CloudFront are unrelated to data permissions.

---

**Question 3.** You need to receive tens of thousands of IoT events per second in real time and automatically buffer, convert, and load them into S3 as Parquet without managing additional infrastructure. Which service is the most suitable?

A) Amazon Data Firehose  
B) Amazon RDS  
C) AWS Batch  
D) Amazon SQS standard queue  

**Answer: A**  
Explanation: Data Firehose is fully managed; it buffers streaming data, converts the format (for example, to Parquet), and automatically delivers it to S3, Redshift, and other destinations. There are no shards or consumers to manage. RDS and Batch are not intended for streaming ingestion, and SQS has no transformation or loading capability.

---

**Question 4.** A petabyte-scale fact table is frequently joined with a small date dimension table. Which Redshift distribution setting is the most appropriate for minimizing data movement (shuffling) between nodes?

A) DISTSTYLE EVEN for both tables  
B) Specify only a SORTKEY on all tables  
C) DISTSTYLE ALL on the small dimension table  
D) Migrate the fact table to DynamoDB  

**Answer: C**  
Explanation: If the small dimension table is replicated to all nodes with DISTSTYLE ALL, joins can be performed locally without shuffling. EVEN causes shuffling, SORTKEY optimizes scans rather than distribution, and DynamoDB is unsuitable for large-scale analytical joins.

---

**Question 5.** A data analyst wants to run ad hoc queries against logs stored in S3 using standard SQL without launching a cluster or servers. They want to pay only based on the amount of data scanned. Which service is the most suitable?

A) Amazon EMR  
B) Presto installed directly on Amazon EC2  
C) AWS Glue crawler  
D) Amazon Athena  

**Answer: D**  
Explanation: Athena is serverless, queries S3 data with standard SQL, and charges based on the amount of data scanned. EMR and EC2 require cluster operations, and a Glue crawler is a schema inference tool, not a query engine.

---
