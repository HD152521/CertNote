# Day 1 - Data Lake Architecture: The Internals and Cost Model of S3, Glue, and Athena

The word "data lake" is oddly romantic. The promise "throw all the data in one place and pull it out when you need it later" sounds clean. But anyone who has run a data lake in production knows better. A badly designed lake becomes a "data swamp," nobody knows the schema, a single Athena query is billed $40, and millions of small files eat hundreds of dollars a month in S3 LIST costs alone. The real skill of a data lake lies not in "where you dump the data" but in "what format, how it's partitioned, and what metadata catalog ties it together."

On the SAP-C02 exam, the data lake is the center of the Analytics domain. There are almost no questions at the level of simply "store in S3 and query with Athena." Most come from the operations, cost, and governance perspective, such as "the most cost-effective way to query petabytes of logs," "governance for multiple accounts and teams to safely share the same data lake," and "an architecture that unifies streaming and batch under one catalog." Today we look at the internals that build that perspective. We break down why Parquet cuts cost by 90%, what Athena actually scans in S3, and how the Glue Catalog inherited the legacy of the Hive Metastore.

## Why Schema-on-Read — The Problem the Data Warehouse Couldn't Solve

To understand the philosophy of the data lake, you first need to see what the data warehouse enforced. Traditional warehouses (Teradata, Oracle, early Redshift) are **Schema-on-Write.** You define the schema before loading the data, and an ETL pipeline transforms the source to fit that schema before inserting it. The advantage of this model is that the data is already structured at query time, so it's fast and consistent. The downside is fatal. When a new data source appears or analytical needs change, you have to redesign the schema and rewrite the entire ETL. It collides head-on with the big data era's demand to "store everything first and decide later what to analyze."

**Schema-on-Read** reverses this order. You store the source as-is without transformation (whether JSON, CSV, or logs), and apply the schema **at read time.** For the same source file, analyst A can define a schema that sees only 5 columns while analyst B defines one that sees 30 columns, simultaneously. Because you keep the data instead of discarding it, you can respond to unknown future analytical needs. This is exactly why S3 became the foundation of the data lake. S3 doesn't enforce a schema on objects, has practically unlimited capacity, 11 nines (99.999999999%) of durability, and a price of $0.023 per GB-month, making "store everything first" possible.

Schema-on-Read is actually not a new concept. It's a paradigm that began with Google's 2004 MapReduce paper and the emergence of Hadoop in 2006, the idea of "store large amounts of unstructured data in a distributed file system (HDFS) and impose structure at processing time." An AWS data lake can be seen as the cloud-native version that replaces HDFS with S3 and MapReduce with Athena/EMR/Glue. The key difference is the **decoupling** of compute and storage. Hadoop pursued data locality, computing on the nodes where the data lives (storage = compute coupled), but an S3-based lake completely separates storage (S3) from compute (Athena/EMR) and scales each independently. This separation is possible because S3's throughput is high enough to support 5,500 GETs per second per prefix, and AWS's internal network bandwidth connects compute nodes and S3 without a bottleneck.

The trap of Schema-on-Read is that "inferring the schema at read time" can come to mean "nobody takes responsibility for the schema." This is the essence of the data swamp. So a mature lake keeps Schema-on-Read's flexibility while explicitly managing the contract "this prefix holds data with this schema" through a **metadata catalog (Glue Catalog).** In other words, a real-world data lake is not pure Schema-on-Read but "Schema-on-Read managed by a catalog." And with the arrival of table formats like Iceberg/Hudi/Delta, even ACID transactions and schema evolution tracking have entered the lake, blurring the boundary between warehouse and lake. This is the concept of the "Lakehouse."

## The 3-Tier Architecture — Why Raw / Curated / Trusted Are Trust Boundaries

A data lake is usually divided into three tiers (or Bronze/Silver/Gold in the medallion architecture). This is not an arbitrary convention but a design that makes explicit the **boundaries of data trustworthiness and transformation cost.**

The **Raw (Bronze)** tier receives the source as-is. JSON logs dropped by Kinesis Firehose, CSVs exported from RDS, external API responses, and so on come in without transformation. The core principle of this tier is **immutability.** Once the source comes in, it is never modified. That way, even if a bug is later found in the ETL logic, you can reprocess from the source (reprocessing). The Raw tier is untrusted data, so analysts must not query it directly.

The **Curated (Silver)** tier is cleaned data. Glue ETL reads Raw, removes duplicates, handles missing values, normalizes types, and, decisively, applies **format conversion to Parquet + partitioning** when writing out. From this tier on, Athena queries become efficient.

The **Trusted (Gold)** tier is the final output with business logic applied. Aggregated daily revenue, ML feature tables, pre-joined wide tables for BI dashboards, and the like live here. Analysts and BI tools mostly look at this tier.

(Hypothetical case) A global media company initially ran Athena queries directly against raw JSON dropped by Kinesis Firehose, with no tier separation. Daily clickstream data was several TB, and every time an analyst ran `SELECT * FROM clickstream WHERE date = '2024-01-15'`, it scanned the entire uncompressed JSON (about 3TB), costing $15 per query. With 50 analysts running 10 queries each on average per day, that's $225,000 a month. After introducing a Curated tier converted to Parquet + snappy compression + a `date` partition, the same query scanned only about 30GB, cutting cost 100x. The point is that "if you let analysts touch raw directly, cost becomes uncontrollable." The SAP exam's "Athena cost is exploding" scenario is almost always this pattern.

## The Real Mechanism by Which Parquet Cuts Cost by 90%

Everyone memorizes "using Parquet reduces Athena cost," but you need to be able to break down exactly why in order to solve variant questions on the exam. Athena charges **$5 per 1TB of data scanned** (as of 2024). So to cut cost you must cut the "scan volume," and Parquet reduces scan volume in three independent ways.

**1. Columnar storage.** CSV/JSON are stored row-oriented. When you run `SELECT user_id FROM events`, only user_id is needed, but in a row-based format all the columns of a row sit adjacent on disk, so you have to read everything. Parquet physically groups the values of the same column. If only user_id is needed, it reads only the user_id column block and doesn't touch the other 50 columns. If you use only 1 of 50 columns, the scan volume theoretically drops to 1/50.

**2. Compression efficiency.** Values in the same column share similar patterns (the same type, often repeated values). Parquet applies dictionary encoding, run-length encoding, and bit-packing per column to reach much higher compression ratios than CSV. Even with snappy, 5-10x compression over the original is common.

**3. Predicate pushdown + statistics.** A Parquet file is internally divided into row groups, and each row group's metadata holds **min/max statistics.** With a condition like `WHERE timestamp > '2024-01-15'`, Athena looks at the row group's max statistic and, if "all values in this row group are outside the condition range," skips that block entirely. This is called predicate pushdown.

Parquet is a format inspired by Google's 2010 Dremel paper. Dremel introduced the "record shredding and assembly" algorithm that decomposes nested data into columnar form, and this is Parquet's core idea. Dremel became the foundation of BigQuery, and Parquet is its open-source implementation in the Hadoop ecosystem. Columnar storage itself is an older concept, with MIT's 2005 C-Store paper (which later became Vertica) as its academic foundation. What matters from the SAP perspective is that Athena (Presto/Trino-based), Redshift Spectrum, EMR Spark, and Snowflake all support Parquet as a first-class citizen. That is, once you convert to Parquet you can reuse it across multiple query engines, reducing vendor lock-in.

ORC (Optimized Row Columnar) and Parquet are both columnar but subtly different. ORC was created by Hortonworks for Hive, with stripe units and richer indexes (built-in bloom filters), and is slightly advantageous in Hive/EMR environments. Parquet originates from Cloudera/Twitter and is used more broadly across the Spark, Presto, and Impala ecosystems. The practical difference is not large, but for "Hive workload migration" ORC, and for a "general-purpose analytics lake" Parquet is a safe choice. Avro is different. Avro is row-oriented and embeds the schema in the file, so it is **strong at schema evolution and suited to streaming/write-heavy workloads** (Kafka, Kinesis). So a common practical pattern is "streaming ingestion in Avro → batch conversion then store as Parquet."

> ⚠️ **Trap**: It is not true that "Parquet is always fast." If there are millions of small files (e.g., under 1MB), Parquet's advantages vanish, because the overhead of reading each file's footer metadata and the number of S3 GET requests explode. This is the **Small File Problem.** The ideal Parquet file size is 128MB to 1GB. When the exam presents a scenario of "Athena queries are slow and there are millions of files," the answer is not "change the file format" but **compaction (merging small files).** You need to rewrite small files into large ones with Glue ETL's `coalesce`/`repartition` or Athena CTAS.

## Partitioning and Partition Projection — Solving the Metadata Bottleneck

Partitioning splits data into a directory structure (S3 prefixes). If you design keys like `s3://lake/events/year=2024/month=05/day=29/`, then when a condition like `WHERE year=2024 AND month=05` arrives, Athena scans only under that prefix and doesn't even LIST the other prefixes (**partition pruning**). This is a coarser-grained scan avoidance, separate from Parquet's row group skipping.

The problem arises when partitions multiply. The Glue Catalog stores each partition as a metadata record, so daily partitions for 5 years come to about 1,800, and multiplied by hourly or regional granularity they reach hundreds of thousands to millions. Before executing a query, Athena calls the `GetPartitions` API on the Glue Catalog to look up which partitions match the condition, and with hundreds of thousands of partitions this metadata lookup itself takes longer than the query.

**Partition Projection** (introduced in 2020) solves this bottleneck elegantly. Instead of storing partition information in the catalog one by one, you declare a **rule** in the table properties (TBLPROPERTIES): "year is an integer from 2020 to 2030, month is 1 to 12, and the S3 path template is this." Athena **computes (projects)** the partition paths from this rule without querying the catalog and goes straight to S3. Metadata lookups drop to 0, so queries start immediately even with tens of thousands of partitions.

```sql
CREATE EXTERNAL TABLE logs (
  message string,
  level string
)
PARTITIONED BY (year int, month int, day int)
STORED AS PARQUET
LOCATION 's3://lake/logs/'
TBLPROPERTIES (
  'projection.enabled'='true',
  'projection.year.type'='integer',
  'projection.year.range'='2020,2030',
  'projection.month.type'='integer',
  'projection.month.range'='1,12',
  'projection.month.digits'='2',
  'projection.day.type'='integer',
  'projection.day.range'='1,31',
  'projection.day.digits'='2',
  'storage.location.template'='s3://lake/logs/${year}/${month}/${day}/'
);
```

> 🎯 **Scenario**: "A security team stores 5 years of VPC Flow Logs in S3 with hourly partitions. There are about 44,000 partitions in total (5 years × 365 days × 24 hours). When running an Athena query, the partition metadata lookup takes longer than the query itself. How do you speed up queries without operational burden?" — The answer is **Partition Projection.** Instead of registering 44,000 partitions one by one with a Glue Crawler and running `MSCK REPAIR TABLE` or `ALTER TABLE ADD PARTITION` every time, you just declare the time range rule in the table properties and Athena computes the partition paths directly. The catalog lookup disappears and operational automation becomes unnecessary. On the exam, the keywords "tens to hundreds of thousands of partitions + slow metadata lookup" are almost always answered by Partition Projection.

> ⚠️ **Trap**: If you over-partition (e.g., by minute, by user ID), a "partition explosion" problem arises, the exact opposite of the Small File Problem. If each partition has almost no data but there are millions of partitions, the metadata/LIST overhead outweighs the benefit of partition pruning. The general rule is to choose partition keys so that "each partition has at least several hundred MB to several GB of data." Columns with high cardinality (user_id, request_id) are unsuitable as partition keys, while columns with moderate cardinality such as time, region, and category are good.

## Glue Data Catalog — Carrying On the Hive Metastore Legacy

The Glue Data Catalog is the data lake's "phone book." It centrally stores the metadata "this S3 prefix has this table with this schema." An important design decision is that it is **Hive Metastore (HMS) compatible.**

Why does Hive Metastore compatibility matter? Hive is a SQL-on-Hadoop tool created by Facebook in 2009 that established the concept of a "metadata store (Metastore) that puts table schemas onto files in HDFS." Afterward, nearly every big data query engine, including Presto, Spark SQL, and Impala, adopted HMS as the standard interface. Because AWS made the Glue Catalog HMS-compatible, Athena (Presto family), EMR (Spark/Hive), and Redshift Spectrum can **share the same catalog.** Register a schema once and all three engines see the same table definition. This is the catalog's value as a "single source of truth."

A **Glue Crawler** scans S3, automatically infers the schema, and registers/updates it in the catalog. It reads the fields of JSON logs, CSV headers, and Parquet's embedded schema to create tables and partitions. However, a Crawler is not a cure-all. It may infer types wrongly on JSON whose schema changes often, Crawler run time and cost grow when there are many partitions, and classifier configuration can be tricky. So when the schema is stable, defining the table directly with DDL and using Partition Projection is often cleaner than a Crawler.

The relationship between the Glue Catalog and Lake Formation is often confused on the exam. The Glue Catalog is the metadata store itself. Lake Formation is the **governance and permission layer** on top of it. With Lake Formation, instead of IAM policies you centrally manage, at the catalog level, **fine-grained permissions** such as "this IAM role can see only this column of this table of this database, only under this row-filter condition." Column-level, row-level, and cell-level security, plus LF-Tags-based tag permissions and cross-account data sharing are the key features. In the SAP exam, a governance scenario where "multiple teams/accounts share the same data lake but each can see different columns and rows" is almost always answered by Lake Formation, because column- and row-level control is impossible with S3 bucket policies or IAM alone.

(Hypothetical case) A medical data analytics platform gathered patient data from several hospitals into a single lake. The data science team needed to see diagnosis and treatment columns but must not see the patient name and national ID columns (HIPAA). At first they tried blocking with IAM policies by splitting S3 prefixes, but since column-level control was impossible, they ended up building a complex ETL to split sensitive columns into a separate table. After adopting Lake Formation, they declaratively applied column-level permissions and row-level filters (only a specific hospital's data) on the same table, eliminating the ETL complexity. In addition, they applied a policy "block all columns tagged PII from the analytics team" in one go with LF-Tags.

## Inside Athena — Serverless Queries on Presto/Trino

Athena is a serverless SQL query service, but its internals are the open-source distributed query engine **Presto/Trino** (Athena Engine v2 is Presto-based, v3 is Trino-based). Athena is serverless because AWS dynamically brings Presto clusters up and down to match the workload. Users don't manage clusters and are billed only by the volume scanned per query.

The implications of this model are important. Athena is a **stateless query engine**, so it has no indexes (nothing like an RDBMS's B-tree indexes). All optimization comes from "physically reducing the data to scan." So it's no exaggeration to say that the Parquet (columnar), partitioning (prefix pruning), and compression we saw earlier are the whole of Athena's performance and cost. The idea of tuning by adding indexes like in an RDBMS doesn't work.

Summarizing Athena's main features from an operations perspective:

- **Workgroup**: isolates queries by team and purpose, and sets a per-query data scanned limit to prevent cost runaway. It's the first line of defense for cost control.
- **Result Reuse** (2023): if the same query is rerun within a set time, it reuses the previous result with zero scan cost. Useful when a dashboard repeats the same query.
- **CTAS (Create Table As Select)**: saves query results as a new table while applying format, compression, and partitions. Can be used as lightweight ETL.
- **Federated Query**: joins data outside S3 (DynamoDB, RDS, CloudWatch, Redshift) with SQL through Lambda connectors. Queries multiple sources together without moving data.

Athena can process petabytes without indexes thanks to **massively parallel processing (MPP).** Presto splits a query into stages and distributes each stage across multiple workers to read different files/partitions in S3 in parallel. Since S3 supports 5,500 GETs per second per prefix, if you spread data across multiple prefixes, Athena reads that many in parallel and throughput grows linearly. This is the power of the compute-storage separation architecture. A traditional warehouse has disk I/O tied to nodes, making this elastic parallelization difficult. For comparison, BigQuery shares the same philosophy (Dremel + Colossus storage separation), and Snowflake is in the same family, separating compute (virtual warehouse) from storage (S3/GCS/Blob).

How Athena Federated Query works is interesting. There is a **Lambda connector** for each data source (DynamoDB, RDS, etc.), and during query execution Athena calls that Lambda to fetch the data it needs. The connector pushes predicate pushdown down to the data source as much as possible (e.g., a DynamoDB partition key condition) to minimize the data fetched. The downside is that, because it goes through Lambda, it is slower than querying S3 directly, and joining large volumes of data incurs Lambda invocation and transfer costs. So Federated Query suits the pattern of "joining S3 lake data with a small amount of reference data in an operational DB," not "analyzing the entire operational DB." For the latter, the standard approach is to replicate to S3 with DMS and then query.

## Glue ETL and Job Bookmarks — Idempotency of Incremental Processing

Glue ETL is a managed ETL based on Apache Spark. You run the Raw → Curated transformation with PySpark/Scala code without managing servers. The key Glue ETL concept on the SAP exam is the **Job Bookmark.**

New logs accumulate in Raw every day, and if each daily Glue Job run reprocesses all the data, cost and time accumulate. A Job Bookmark stores as state "how far the previous run processed," so the next run processes **only newly added data.** This is incremental ETL. For S3 objects the Bookmark tracks file names and timestamps, and for JDBC sources it tracks the primary key or a timestamp column.

There's a common misunderstanding about the Job Bookmark's idempotency. A Bookmark "skips inputs already processed," but it doesn't prevent duplication in the output. If a Job fails after writing partial output and dies, duplicate output can occur on rerun depending on exactly how far the Bookmark was committed. If you need true exactly-once, you must use MERGE (upsert) of a transactional table format like Iceberg/Hudi, or put a dedup key at the output stage. On the exam, a "duplicate data on Glue Job rerun" scenario is treated as a combination of enabling the Bookmark + designing idempotent output.

Making the division of roles in the Glue ecosystem clear:
- **Glue Crawler**: schema inference, catalog registration (metadata)
- **Glue ETL (Spark Job)**: large-scale transformation and joins (code-based)
- **Glue DataBrew**: no-code visual data profiling and cleaning (for analysts, 250+ transformations)
- **Glue Studio**: visual ETL canvas (create Spark Jobs by drag and drop)
- **Glue Streaming**: real-time ETL from Kinesis/Kafka input

## The Lakehouse — What Iceberg/Hudi/Delta Changed

The weakness of the traditional data lake is that it has no transactions. If a query arrives while a Parquet file is being written to S3, it can read a partially written file (no atomicity), UPDATE/DELETE is hard (you must rewrite entire files), and there's no way to prevent conflicts on concurrent writes. When you must DELETE a specific user's data because of GDPR's "right to be forgotten," a traditional lake has to accept the inefficiency of rewriting the entire partition.

**Apache Iceberg, Hudi, and Delta Lake** are **table formats** that solve this problem. They put a metadata layer (manifests, transaction log) on top of Parquet files to provide:

- **ACID transactions**: guaranteed consistency even with concurrent writes
- **UPDATE/DELETE/MERGE**: row-level changes (GDPR deletion, upsert)
- **Time Travel**: querying a snapshot at a specific point in time, rollback
- **Schema Evolution**: tracking column additions, removals, and renames

AWS supports Iceberg natively in Glue 4.0+ and Athena Engine v3, and added an option to operate Iceberg tables as managed with S3 Tables (2024).

> 🎯 **Scenario**: "To comply with GDPR, you must delete all records of a specific user from the data lake. The data is 5 years of clickstream scattered across thousands of partitions. Hundreds of user deletion requests arrive each week. What is the most operationally efficient setup?" — The answer is **an Iceberg (or Hudi/Delta) table format + MERGE/DELETE.** In a traditional Parquet lake, you need inefficient reprocessing that reads the entire partitions containing the deletion targets and rewrites them without only those rows. Iceberg supports row-level DELETE (merge-on-read or copy-on-write), efficiently updating only the affected files and maintaining consistency with the transaction log. On the exam, "data lake + DELETE/UPDATE/GDPR/upsert" is almost always answered by a table format.

(Hypothetical case) An ad-tech company stored real-time bidding logs in a traditional Parquet lake, but because of late-arriving data and correction events, data for the same bid ID came in multiple times. A dedup batch that rewrote entire partitions each time took 4 hours. After switching to Apache Hudi and applying an upsert (MERGE) keyed on bid ID as the record key, only the files for late-arriving corrections were updated and the batch dropped to 20 minutes. Hudi's choice between copy-on-write and merge-on-read is a trade-off of "read frequency vs. write frequency": choose copy-on-write (faster reads) if reads are heavy, and merge-on-read (faster writes) if writes are heavy.

## Cost and Performance Anti-Patterns Summarized

Grouping the anti-patterns that repeatedly show up in data lake operations from the SAP perspective:

- **Querying raw directly**: running Athena on raw JSON without a Curated tier (Parquet + partitions) makes cost run away. → Separate into 3 tiers.
- **Small file explosion**: if Firehose drops a small file every minute, you get the Small File Problem. → Increase buffer size, compaction, Firehose dynamic partitioning + large buffers.
- **No partitioning or over-partitioning**: no partitions means a full scan, too fine means metadata explosion. → Partition keys with appropriate cardinality.
- **Crawler overuse**: running a Crawler hourly on a stable schema wastes cost and time. → DDL + Partition Projection.
- **No Workgroup set**: analysts spam `SELECT *` with no cost limit. → Workgroup per-query limit.

## Summary

The essence of a data lake is "separation of storage and compute, and Schema-on-Read managed by a catalog." S3 provides unlimited, cheap, highly durable storage, the Glue Catalog layers the schema contract on top, and Athena/EMR/Redshift Spectrum share the same catalog and access it with their own query engines. Almost all cost and performance is determined by the physical data layout of **format (Parquet), partitioning, and compression**; governance is reinforced by Lake Formation's fine-grained permissions, and transactions by the Iceberg/Hudi/Delta table formats.

The categories that appear on the SAP exam map almost entirely as: (1) "reduce Athena cost" → Parquet + partitions + compression, (2) "metadata bottleneck with tens of thousands of partitions" → Partition Projection, (3) "multi-account/multi-team data governance" → Lake Formation, (4) "data lake DELETE/upsert/GDPR" → Iceberg/Hudi/Delta, (5) "integrated query across multiple data sources" → Athena Federated Query. In the next day we look at the Kinesis ecosystem that handles real-time streaming on top of this data lake.

---

## 📝 Practice Questions

**Question 1.** An analytics team runs Athena queries directly on raw JSON logs (3TB per day, uncompressed), and is billed $15 per query. 50 people query 10 times a day. Which change provides the biggest cost savings?

A) Consolidate Athena Workgroups into one
B) Create a Curated tier with Glue ETL using Parquet + snappy compression + date partitions
C) Enable only Result Reuse
D) Move to Glacier after 30 days with an S3 Lifecycle rule

**Answer: B**
Explanation: Athena bills $5 per 1TB scanned, so the key to cost savings is reducing scan volume. Combining Parquet (columnar, scanning only needed columns) + compression (snappy shrinking 5-10x) + partitions (scanning only the prefix for the WHERE condition) cuts scan volume by nearly 100x and cost by the same amount. A (Workgroup) is cost isolation and limit-setting, not savings itself. C (Result Reuse) only helps with repeated identical queries and is limited for varied queries. D (Lifecycle) reduces storage cost, unrelated to query scan cost, and Athena can't directly query Glacier data anyway. Trap: "Athena cost is exploding" is almost always the problem of querying raw directly, and the answer is a Curated tier (Parquet + partitions + compression).

---

**Question 2.** A security team stores 5 years of VPC Flow Logs with hourly partitions. There are about 44,000 partitions, and in Athena queries the partition metadata lookup (GetPartitions) takes longer than the query. How do you speed up queries without operational automation burden?

A) Run a Glue Crawler every hour to register partitions in advance
B) Enable Partition Projection to compute partition paths by rule
C) Reduce partitions to daily, shrinking them to 365
D) Switch to Redshift Spectrum

**Answer: B**
Explanation: Instead of storing partition information in the catalog one by one, Partition Projection declares range, type, and path template rules in TBLPROPERTIES and lets Athena compute partition paths directly without querying the catalog. Even with tens of thousands of partitions, GetPartitions calls drop to 0 so queries start immediately, and operational automation such as MSCK REPAIR or ALTER TABLE ADD PARTITION is unnecessary. A actually increases Crawler run cost and time and isn't a root fix. C loses the ability to analyze hourly. D uses the same catalog, so the same metadata bottleneck occurs. Trap: "tens of thousands of partitions + slow metadata lookup" is Partition Projection.

---

**Question 3.** Patient data from several hospitals has been consolidated into one data lake. The data science team must see the diagnosis and treatment columns but must not see the patient name and national ID columns, and each hospital must see only its own hospital's data (rows). What is the most suitable setup?

A) Separate prefixes with S3 bucket policies
B) Control access per table with IAM policies
C) Set column-level and row-level permissions with Lake Formation
D) Build an ETL that splits sensitive columns into a separate table

**Answer: C**
Explanation: Lake Formation is a governance layer on top of the Glue Catalog that centrally and declaratively manages column-level (masking/blocking specific columns), row-level (filter conditions), and cell-level permissions in the catalog. With LF-Tags you can also apply a policy like "block PII-tagged columns for the analytics team" in one go. A and B can only control down to the S3 prefix and table level, and column- and row-level control is impossible. D is possible, but the ETL complexity is large and the maintenance burden high, so it is not recommended. Trap: "different permissions per column and row of the same table" is impossible with IAM/S3 policies, and Lake Formation is the answer.

---

**Question 4.** To comply with GDPR, you must delete all records of a specific user from 5 years of clickstream data. Hundreds of deletion requests arrive each week and the data is scattered across thousands of partitions. A traditional Parquet lake would have to rewrite entire partitions, which is inefficient. What is the most suitable setup?

A) Filter at response time with S3 Object Lambda
B) Apache Iceberg table format + row-level DELETE
C) Regenerate the entire table every time with Athena CTAS
D) Delete previous versions with S3 versioning

**Answer: B**
Explanation: Iceberg (or Hudi/Delta) puts a transactional metadata layer on top of Parquet to support row-level DELETE/UPDATE/MERGE. It efficiently updates only the affected files and maintains consistency with the transaction log, so there's no need to reprocess entire partitions as in a traditional lake. It is natively supported in Glue 4.0+/Athena Engine v3. A doesn't actually delete the data, so it doesn't achieve GDPR compliance (the stored original remains). C is the height of inefficiency, regenerating everything each time. D is object-level versioning, not row-level deletion. Trap: "data lake + DELETE/UPDATE/GDPR/upsert" is almost always a table format (Iceberg/Hudi/Delta).

---

**Question 5.** Kinesis Firehose drops a small Parquet file (average 800KB) into S3 every minute. After 1,440 files per day × 90 days = about 130,000 files accumulated, Athena queries became slow and S3 GET request costs rose. What is the most suitable solution?

A) Change the file format to ORC
B) Increase the Firehose buffer size and apply periodic compaction (merging small files)
C) Partition more finely, down to the minute
D) Use S3 Select instead of Athena

**Answer: B**
Explanation: This is the Small File Problem. The ideal Parquet file size is 128MB to 1GB, but with hundreds of thousands of 800KB files, the footer metadata read overhead and the number of S3 GET requests explode. Increase the Firehose buffer size (or buffer interval) to generate larger files, and merge (compact) the small files already accumulated with Glue ETL's repartition/coalesce or Athena CTAS. A (ORC) only changes the format and the small file problem is the same. C partitions even more finely and worsens the problem. D (S3 Select) is for partial retrieval from a single object, not for large-scale analytic queries. Trap: "hundreds of thousands of small files + slow queries" calls for compaction, not a format change.

---

**Question 6.** You must join S3 data in the data lake (customer orders) with real-time inventory data in an operational DynamoDB in a single SQL query. How do you run an integrated query without moving or replicating data?

A) Export DynamoDB to S3 and query with Athena
B) Athena Federated Query + DynamoDB connector
C) Redshift Spectrum
D) Create an hourly join table with Glue ETL

**Answer: B**
Explanation: Athena Federated Query queries and joins data sources outside S3 (DynamoDB, RDS, CloudWatch, Redshift, etc.) directly with SQL through Lambda connectors. Without moving or replicating data, the connector fetches the data it needs from the source at query time (minimized by predicate pushdown). A involves data movement and loses real-time freshness. C is for S3/Redshift data, not a direct DynamoDB join. D is hourly replication, so it lacks real-time freshness and adds operational burden. Trap: "integrated query across multiple sources without moving data" is Federated Query. However, Federated Query suits joining small reference data and is unsuitable for analyzing an entire large operational DB (in that case, replicate to S3 with DMS and then query).

---

**Question 7.** A Glue ETL Job must transform only the new data in Raw into Curated each day. Reprocessing all the data every time accumulates cost and time. What is the most suitable feature?

A) Rerun the Glue Crawler
B) Enable Glue Job Bookmark
C) Athena Result Reuse
D) DataBrew profiling

**Answer: B**
Explanation: Glue Job Bookmark stores as state the inputs processed in the previous run (file names and timestamps of S3 objects, keys/timestamps in JDBC), providing incremental ETL that processes only newly added data on the next run. A (Crawler) is for schema inference and catalog registration, not incremental ETL processing. C (Result Reuse) is reuse of Athena query results and unrelated to Glue ETL. D (DataBrew) is no-code profiling. Trap: a Bookmark "skips processed inputs" and does not prevent output duplication, so if exactly-once is needed, you must additionally design Iceberg/Hudi MERGE or idempotent output keys.

---

## 📌 Today's Summary

1. **Schema-on-Read + compute/storage separation** — S3 is unlimited, cheap, durable, with a flexible schema managed by a catalog
2. **3 tiers (Raw/Curated/Trusted)** — separation of trust boundaries, raw immutability, analysts use only Curated/Trusted
3. **The 3 axes of Parquet cost savings** — columnar (only needed columns) + compression (5-10x) + predicate pushdown (min/max statistics)
4. **Partitioning + Partition Projection** — prefix pruning, solve the metadata bottleneck of tens of thousands of partitions with Projection
5. **Glue Catalog (HMS-compatible)** — shared by Athena/EMR/Redshift Spectrum, division of roles among Crawler, ETL, DataBrew, and Streaming
6. **Lake Formation** — column, row, and cell-level fine-grained permissions, LF-Tags, cross-account sharing governance
7. **Athena (Presto/Trino, MPP)** — no indexes, physical layout is everything, Workgroup, Result Reuse, CTAS, Federated Query
8. **Iceberg/Hudi/Delta (Lakehouse)** — ACID, UPDATE/DELETE/MERGE, time travel, schema evolution, GDPR deletion and upsert
9. **Anti-patterns** — querying raw directly, small files, over-partitioning, Crawler overuse, no Workgroup set
