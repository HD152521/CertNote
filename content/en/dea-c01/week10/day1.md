# Day 1 - Integrated Review of Domains 1 & 2: Ingestion, Transformation & Storage Management

## 📌 Key Takeaways

- Domain 1 (ingestion and transformation, 34%) plus Domain 2 (store management, 26%) make up 60% of the scored questions. Do not study the services one by one; tie them into a single thread: "data comes in, gets transformed, and gets stored."
- The source decides the ingestion service: direct consumption or replay = Kinesis Data Streams, unmanaged-free loading = Data Firehose, Kafka assets = MSK, database changes = DMS (CDC), files = S3 + Glue.
- Transformation is chosen by scale and operational burden: serverless ETL = Glue; large scale, fine-grained tuning, or existing Spark/Hive = EMR. Incremental ETL means Glue job bookmarks.
- The store is decided by how the data is read: lake = S3, analytic DW = Redshift, serverless SQL = Athena, key-value = DynamoDB, OLTP = RDS/Aurora.
- In Redshift, DISTKEY reduces shuffling and SORTKEY reduces scanning, and Spectrum keeps cold data in S3. The shared metastore is the Glue Data Catalog, and central fine-grained permissions come from Lake Formation.

## Tying the Two Domains into One Thread

This is the final week. Today we review the two areas with the largest exam weight as a single flow. Rather than memorizing individual services, the key to passing is to see them as a pipeline: "data arrives, is loaded, is transformed, and is stored." A typical exam scenario leaves one or two of the five slots below blank and asks you to fill them in.

1. **Ingestion**: Kinesis/Firehose (streaming) or DMS (CDC) → S3 raw zone
2. **Catalog**: a Glue crawler infers the schema → registered in the Data Catalog
3. **Transformation**: a Glue job (incremental with bookmarks) or EMR → S3 curated zone (Parquet)
4. **Storage/query**: ad hoc queries with Athena, or load into Redshift for BI
5. **Governance**: fine-grained per-team permissions with Lake Formation

The exam guide splits the two domains into eight tasks. If you know which week of this track touches which task, you can pick your weak spots and go back to them.

| Exam guide task | What it asks | Where to go back |
|------|------|------|
| 1.1 Data ingestion | Reading streaming and batch sources, schedule and event triggers, throttling responses, fan-out, replayability | Weeks 2 and 3 |
| 1.2 Transformation and processing | Engine choice (EMR, Glue, Lambda, Redshift), format conversion, cost, diagnosing transformation failures | Weeks 4 and 5 |
| 1.3 Pipeline orchestration | Step Functions, MWAA, Glue workflows, EventBridge, notifications (SNS, SQS) | Week 5 Day 3 |
| 1.4 Programming concepts | IaC, CI/CD, Lambda concurrency, SAM, distributed computing | The "Task 1.4" section below |
| 2.1 Store selection | Stores by cost, performance, and access pattern; Spectrum, federation, and materialized views; open table formats; vector indexes | Weeks 6 and 7 |
| 2.2 Catalog | Glue Data Catalog, crawlers, partition synchronization | Week 4 Day 1 |
| 2.3 Lifecycle | COPY/UNLOAD, S3 Lifecycle, versioning, DynamoDB TTL | Week 6 Day 4 |
| 2.4 Model and schema evolution | Redshift and DynamoDB schema design, schema conversion, partitioning and compression | Week 1 Day 4, Week 4 Day 4 |

## Domain 1: Ingestion Pattern Summary

Ingestion splits broadly into **streaming** and **batch**. When the exam shows keywords like "real time" or "second-level latency," it is asking about streaming; when it shows "periodic," "bulk," or "hourly," it is asking about batch.

| Requirement keyword | Suitable service | Reason |
|----------------|------------|------|
| Real-time streaming, custom consumers, ordering guarantee | Kinesis Data Streams | Shard-based; can reprocess within the retention period |
| Load a stream into S3/Redshift without management | Data Firehose | Fully managed; buffering, transformation, delivery |
| Kafka-compatible streaming | Amazon MSK | Migrating open-source Kafka |
| Bulk file loading | S3 + Glue | The default for batch ETL |
| Real-time replication of database changes (CDC) | AWS DMS | Continuous replication from source DB to target |

> 💡 **Related theory**: Choose Kinesis Data Streams when you need "direct consumption, reprocessing, and ordering," and Firehose when the goal is "managed-free loading." Firehose has no shard or consumer concept; it delivers automatically to the destination based on buffer size and interval.

The moment you pick an ingestion service, you also fix its **replay range**. That is why the exam guide lists "replayability of ingestion pipelines" as its own item.

| Ingestion path | Can past data be replayed? | Basis |
|------|------|------|
| Kinesis Data Streams | Yes, within the retention period | 24 hours by default, up to 365 days |
| MSK | Yes, within the topic retention setting | Rewind the offset and read again |
| DynamoDB Streams | Only up to 24 hours | The retention period cannot be extended |
| Data Firehose | No | It has no retention or reprocessing feature. Use KDS as the source, or reprocess from the original data in S3 |
| DMS CDC | Within the log retention range of the source DB | It reads the transaction log |
| S3 raw zone | Any time | The reason to keep the original data immutable |

- When a reprocessing requirement exceeds the retention period, the answer is not the stream but **the S3 original + batch reprocessing**. That is why the combination "real-time analytics + original retention" (KDS → real-time consumers, with Firehose loading the same stream into S3) shows up repeatedly as the correct answer.

## Domain 1: Transformation Summary

Choosing a transformation engine comes down to "serverless or not + data scale + coding style."

- **AWS Glue**: Serverless Spark ETL. The default choice for small to medium scale, schedule- and trigger-based ETL. Its key feature is the **Glue job bookmark**, which skips data that has already been processed to enable incremental ETL.
- **Amazon EMR**: A managed Hadoop/Spark cluster. For large scale, fine-grained tuning, or reusing existing Spark/Hive code. Cost optimization is Spot Instances + instance fleets.
- **Glue Studio / DataBrew**: Visual/no-code transformation. DataBrew is for analysts to clean and profile data.

```python
# Glue bookmark: process only new data since the last run (incremental ETL)
job.init(args['JOB_NAME'], args)
dyf = glueContext.create_dynamic_frame.from_catalog(
    database="raw", table_name="events",
    transformation_ctx="dyf"  # the bookmark tracks state by this ctx
)
# ... transformation ...
job.commit()  # the bookmark state is saved at commit time
```

> 💡 **Related theory**: A Glue bookmark works only when `transformation_ctx` and `job.commit()` are both present. For problems like "incremental ETL," "prevent reprocessing of data already processed," or "a scheduled job reads everything again each time," enabling the bookmark is the correct answer.

Before choosing the bookmark as the answer, there are three conditions to check (Week 4 Day 2).

- The **default value of the bookmark option is Disable**. Even if the code has `transformation_ctx` and `job.commit()`, the job reads everything every time when the option is off.
- An S3 source identifies new data by the object's **last modified time**, and a JDBC source by the **bookmark key**. So it cannot catch UPDATEs and DELETEs of existing rows in a JDBC source. If the requirement is "reflect changes too," the answer is DMS CDC.
- If the job fails before `job.commit()`, the state is not updated and the next run reads the same input again. A bookmark is also at-least-once in nature, so design the output to be idempotent, such as overwrite or MERGE.

## Task 1.4: What Comes Out of Programming Concepts

This is a task for which this track has no dedicated week. It asks not about syntax but about "which tool does what." The exam guide explicitly places knowledge of the syntax of any specific language out of scope.

| Topic | What to know |
|------|------|
| IaC | CloudFormation defines a stack with templates, and CDK defines it with a programming language. Both are ways to deploy the same pipeline repeatedly across environments |
| AWS SAM | Bundles serverless resources such as Lambda, Step Functions, and DynamoDB tables in a short syntax for packaging and deployment. The deployment result is a CloudFormation stack |
| CI/CD | Automating the implementation, testing, and deployment of pipeline code. Data pipelines are also subject to version control and testing |
| Lambda concurrency | Reserved concurrency is both the upper limit and the guaranteed share of concurrent executions a function can use; provisioned concurrency pre-warms execution environments to eliminate cold starts |
| Lambda storage | Temporary storage is `/tmp` (512 MB to 10,240 MB); for files shared across invocations, mount EFS (a VPC connection is required) |
| Throttling response | Limit overruns on DynamoDB, RDS, and Kinesis are handled with retries using exponential backoff and jitter, batch size adjustment, and a capacity mode change |

- If the downstream system (such as RDS) can handle only a small number of connections, **cap Lambda with reserved concurrency.** If concurrency is left unlimited, database connections are exhausted as Lambda scales out.

## Domain 2: Choosing a Data Store

Map stores by "structure, access pattern, and query style."

| Requirement | Service | Key point |
|---------|--------|------|
| Unstructured/semi-structured lake, unlimited scale, cheap | Amazon S3 | Base storage for a data lake |
| Large-scale analytic queries, columnar MPP DW | Amazon Redshift | Petabyte-scale OLAP |
| Direct SQL queries on S3, serverless | Amazon Athena | Based on Trino (formerly Presto), no infrastructure to manage |
| Key-value, ultra-low latency, serverless | DynamoDB | Single-digit millisecond latency |
| Relational OLTP | RDS / Aurora | Transaction processing |

## Domain 2: Redshift Operations Essentials

On the exam, Redshift is about distribution keys and sort keys.

- **Distribution style (DISTSTYLE)**: `KEY` (places rows with the same join column value on the same node, reducing shuffling), `ALL` (replicates a small dimension table in full), `EVEN` (spreads evenly), `AUTO` (Redshift chooses automatically).
- **Sort key (SORTKEY)**: Speeds up range filters and time-range queries. Blocks are skipped using zone maps.
- **Redshift Spectrum**: Queries external data in S3 from Redshift without loading it. A tier separation in which hot data stays in Redshift and cold data stays in S3.

```sql
CREATE TABLE fact_sales (
  sale_id bigint, customer_id bigint, sale_ts timestamp, amount decimal(10,2)
)
DISTSTYLE KEY DISTKEY (customer_id)   -- optimizes the join with the customer dimension
SORTKEY (sale_ts);                    -- speeds up time-range queries
```

When joining a large fact table with a small dimension table, use `DISTSTYLE ALL` if the dimension is small; when joining two large tables, put a `DISTKEY` on the common join key on both sides so that no data moves between nodes (shuffle).

Let us go one level deeper into how the four distribution styles and two sort key types actually work.

| Item | Behavior | Cost paid |
|------|------|------|
| `AUTO` | The default applied when no distribution style is specified. A small table starts as ALL, changes to KEY as it grows, or to EVEN when there is no suitable key, all in the background | You do not control it |
| `EVEN` | Splits round-robin regardless of column values. Suits tables that do not take part in joins | Redistribution at join time |
| `KEY` | Places the same key value on the same slice. If both tables are distributed on the join column, the join finishes locally | If the key is skewed, only particular slices grow large |
| `ALL` | Copies the whole table to every node | Storage is multiplied by the number of nodes, and loading and updating become slower. Use it only for tables that rarely change |
| Compound sort key | The default. Efficient when conditions use the sort key columns **from the leading column onward** | Little effect on conditions that use only the trailing columns |
| Interleaved sort key | Gives each column equal weight. A condition may arrive on any column. Up to 8 columns | `VACUUM REINDEX` takes a long time. For frequently updated tables, compound is recommended |

- What a zone map really is: Redshift stores column data in **1 MB blocks** and keeps each block's minimum and maximum values as metadata. When a range condition arrives, it looks only at those values and skips whole blocks. If the data is not sorted, values are scattered across many blocks and there are no blocks to skip.
- AWS recommends creating tables with `SORTKEY AUTO` and `DISTSTYLE AUTO` and leaving them to automatic table optimization. However, when the exam stem points at the cause, as in "reduce data movement between nodes," the choice that picks the distribution key yourself is the answer.
- The cue for `ALL` is not just "small" but **"small and rarely changing."** A choice that applies ALL to a large table or a frequently updated table is wrong.

## Domain 2: Lake Formation and the Catalog

This is permission and metadata management for the data lake.

- **Glue Data Catalog**: The central metastore shared by Athena, Redshift Spectrum, and EMR. Crawlers infer schemas automatically.
- **Lake Formation**: **Central, fine-grained permissions** for the data lake. Table, column, row, and cell level permissions and LF-Tag based policies. Instead of writing IAM policies for each S3 object one by one, you manage data permissions centrally.

For the scenario "several teams share an S3 data lake, and we want to control access at the column/row level and manage it in one place," the answer is almost always Lake Formation. IAM bucket policies alone cannot provide column- or row-level control.

## Paths Into and Out of Redshift

A stem that says "load data into Redshift" has different answers depending on the source and freshness.

| Path | When to use | What to remember |
|------|------|------|
| `COPY` (S3 → Redshift) | The default for batch loading | Loads in parallel when there are multiple files or the files are splittable. GZIP-compressed CSV/JSON cannot be auto-split, so split them into multiple files of similar size and make the file count a multiple of the slice count |
| Firehose → Redshift | Load a stream without code | Internally stages in S3 and then runs COPY |
| Streaming ingestion | Query KDS or MSK directly with low latency | Comes in through a materialized view without passing through S3. The stream is read when the view is refreshed |
| Spectrum | Query S3 data without loading it | External tables use the Glue Data Catalog. On a provisioned cluster, it is billed by the amount of data scanned |
| Federated query | Join the latest data of an operational RDS/Aurora without moving it | Query load goes to the remote DB |
| Materialized view | Precompute a repeated heavy aggregation | Stores the result and refreshes it |
| `UNLOAD` (Redshift → S3) | Export results to the lake | If exported as Parquet, Athena and Spectrum can read it right away |

- Why COPY of one large file is slow: a file that cannot be split is read serially by a single slice. It cannot use Redshift's parallelism.
- The complete form of "hot in Redshift, cold in S3" is to `UNLOAD` old data as Parquet and attach it back with a Spectrum external table.

## Data Lifecycle: Different Expiry Mechanisms for Each Store

| Store | Mechanism | Behavior |
|------|------|------|
| S3 | Lifecycle transition | After a set number of days, moves the object to a cheaper storage class |
| S3 | Lifecycle expiration | After a set number of days, deletes the object. In a versioned bucket, set a separate rule for expiring previous versions |
| S3 | Intelligent-Tiering | Automatically places objects not accessed for 30 or 90 days in cheaper tiers without you knowing the access pattern |
| DynamoDB | TTL | Automatically deletes an item once the expiration timestamp written on it has passed |
| Kinesis Data Streams | Retention period | Records expire once it passes |
| Redshift | Delete after `UNLOAD` | There is no automatic expiry, so you build the export-and-delete job yourself |

For S3 storage classes, the **minimum storage duration** is the trap. If you delete or move an object before it, you are charged for the remaining period.

| Storage class | Retrieval latency | Minimum storage duration | Other billing factors |
|------|------|------|------|
| S3 Standard | Milliseconds | None | - |
| S3 Standard-IA / One Zone-IA | Milliseconds | 30 days | Per-GB retrieval fee; objects smaller than 128 KB are billed as 128 KB. One Zone-IA stores in a single Availability Zone only |
| S3 Intelligent-Tiering | Milliseconds (default tier) | None | Per-object monitoring fee, no retrieval fee. Objects smaller than 128 KB are not eligible for automatic tiering |
| S3 Glacier Instant Retrieval | Milliseconds | 90 days | Per-GB retrieval fee |
| S3 Glacier Flexible Retrieval | Minutes to hours (restore required) | 90 days | Restore fee |
| S3 Glacier Deep Archive | Hours (restore required) | 180 days | Restore fee |

- Lifecycle transitions flow only from top to bottom (the waterfall model). From Glacier Deep Archive you cannot move back to another class with a rule; you have to copy the restored copy.
- Objects smaller than 128 KB are excluded from Lifecycle transitions by default, because the transition request fee can exceed the savings (this default changed in September 2024, so older material may say "they are transitioned to Glacier").
- Athena cannot read objects stored in Glacier Flexible Retrieval or Deep Archive without restoring them. If the condition is "we query it with SQL occasionally," a choice that moves the curated zone to an archive class is eliminated.

## New Store Topics in the Exam Guide

Version 1.1 of the exam guide, published in December 2025, added vectors and open table formats to Domain 2. Prepare at the level of distinguishing terms rather than depth.

| Topic | One-line summary |
|------|------|
| Open table format (Apache Iceberg) | Treats a bundle of files in S3 as a table with ACID, time travel, and row-level updates. Needs maintenance such as compaction and snapshot expiration |
| Amazon S3 Tables | A bucket dedicated to Iceberg tables. S3 performs table maintenance such as compaction for you |
| Vectorization | Turns text and similar data into numeric vectors (embeddings) to find things with similar meaning. An example is the process where an Amazon Bedrock knowledge base splits documents, embeds them, and puts them into a vector store |
| HNSW | A graph-based vector index. Fast search and high recall, at the cost of heavy memory use and slow builds. Available in Aurora PostgreSQL (pgvector) |
| IVF | An index that divides vectors into clusters and searches only the nearby clusters. Uses less memory and builds fast, but recall varies with the search scope setting |
| Amazon MemoryDB | A durable in-memory key-value store. Fast key-value access is the cue |
| Business data catalog | While the Glue Data Catalog holds technical metadata (schema, location), Amazon SageMaker Catalog holds business context such as terms, owners, and descriptions |

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| A scheduled Glue job reads everything again each time | The bookmark is Disable (the default), or `transformation_ctx` or `job.commit()` is missing | Satisfy all three conditions |
| Yesterday's data does not appear in Athena | The new partition is not in the Catalog | Crawler, `ALTER TABLE ADD PARTITION`, or partition projection |
| Athena cost grows faster than the data | Row-oriented format, queries without a partition filter | Convert to Parquet, date partitions, use the partition column in WHERE |
| Athena became slow after Firehose loading | The buffer is small, so many small files pour in | Increase buffer size and interval, periodic compaction |
| A Redshift join is slow because of redistribution between nodes | The join column and the distribution key do not match | DISTKEY on the join column in both tables; ALL for a small, static dimension |
| A date range query in Redshift scans everything | There is no sort key, or the sort order has degraded | Make the date column the sort key; restore a degraded sort with VACUUM |
| COPY is much slower than expected | One large compressed file is read serially | Split into multiple files (a multiple of the slice count) |
| Only a particular KDS shard is throttled | Partition key skew | Change to a high-cardinality key. Adding shards or on-demand mode does not solve it |
| After the DMS full load, changes do not arrive | The source DB's log settings are missing | Enable binlog ROW, logical replication, or supplemental logging |
| Moving objects less than 30 days old to IA increased the bill | Minimum storage duration and retrieval fees | If the access pattern is unknown, use Intelligent-Tiering |

## Scenario → Answer Decision Table

These are situations that do not overlap with the practice questions, with pairs where changing one condition changes the answer.

| Scenario | Decisive cue | Answer |
|------|------|------|
| Click events are only piled into S3 | No consumers, minimal operations | Data Firehose |
| A fraud detection app and a recommendation app each read the same events | Multiple consumers, independent consumption | Kinesis Data Streams (enhanced fan-out if needed) |
| Only new rows are pulled each day from an append-only order log table | Increasing key, append-only | Glue job + bookmark |
| The status column of the same table changes constantly | Changes to existing rows | DMS CDC |
| A few times a month, logs are investigated with SQL | Intermittent, no cluster | Athena |
| Hundreds of people view the same dashboard all day | Always on, concurrency, predictable performance | Redshift |
| Redshift joins with the current inventory in an operational Aurora | Latest values without replication | Federated query |
| Redshift occasionally queries orders from three years ago | Cold data, storage cost | S3 + Spectrum |
| Session data is deleted automatically after 7 days (DynamoDB) | Automatic per-item expiry | TTL |
| Reduce storage cost for lake objects whose access frequency is unpredictable | Unknown pattern, minimal operations | S3 Intelligent-Tiering |
| Regulations require 7-year retention, with almost no queries | Long-term retention, restore delay acceptable | Lifecycle → Glacier Deep Archive |
| Delete and update only a particular customer's rows in a lake table | Row-level updates and deletes, ACID | Iceberg table |

Tomorrow we combine Domains 3 and 4, on running the pipelines built this way reliably and protecting them safely.

## 📖 Glossary

- **Replayability**: The ability to send data that has already passed through again for reprocessing. The retention period sets its range.
- **Bookmark key**: The reference column Glue bookmarks use to remember "how far we have read" in a JDBC source.
- **Slice**: The unit of parallel processing into which a Redshift compute node is divided. The distribution style decides which slice a row goes to.
- **Shuffle (redistribution)**: Moving rows between nodes for a join or aggregation. It does not occur when the distribution key matches.
- **Zone map**: The minimum and maximum values stored for each block. It lets the engine skip blocks that do not match the condition without reading them.
- **Materialized view**: A view whose query result is precomputed and stored. It keeps up with the latest state through refresh.
- **Federated query**: A query that reads tables in another database directly, without moving the data.
- **Minimum storage duration**: The minimum number of days a storage class requires. Even if you delete or move the object earlier, you are billed for the remaining period.
- **TTL**: A DynamoDB feature that automatically deletes an item once the expiration timestamp written on it has passed.
- **Embedding**: Text or an image converted into a numeric vector that reflects its meaning. A vector index uses it as its search target.

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
