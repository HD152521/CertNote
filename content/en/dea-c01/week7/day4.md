# Day 4 - RDS/Aurora and Store Selection: OLTP, Zero-ETL, Workload-to-Store Decision

## 📌 Key Takeaways

- RDS/Aurora are **row-based OLTP** stores. They suit normalized schemas, transactions, and reading and writing small numbers of rows, and they do not suit bulk column aggregation.
- Aurora separates compute from storage and replicates data to 6 storage nodes across 3 AZs. There can be up to 15 readers (Aurora replicas).
- Analytics load on an operational database is peeled off in stages: **Read Replica** (same engine, first relief) → **replicate to a warehouse** (zero-ETL, DMS) → export to the lake if needed.
- **Zero-ETL** is AWS-managed replication that moves the source into Redshift in near real time. It does no transformation, and the target database is read-only. Heterogeneous database migration and a wide range of source and target combinations belong to **DMS**.
- Choose a store by **access pattern**: transactions and joins = RDS/Aurora, key lookups = DynamoDB, bulk aggregation = Redshift, ad hoc on S3 = Athena, search = OpenSearch.

## RDS and Aurora Overview

- **Amazon RDS**: Hosts MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, and Db2 as a managed service. The engine stays as it is, and the service takes care of patching, backup, recovery, and failover. Storage is an EBS volume attached to the instance.
- **Amazon Aurora**: A cloud-native engine compatible with MySQL and PostgreSQL. The instances (compute) and the **cluster volume** (storage) are separated.

```text
Aurora cluster
  ├─ 1 writer instance ──┐
  ├─ reader instances (up to 15) ┼──► Cluster volume: replicated across 3 AZs · 6 storage nodes, auto-expanding
  └─ ...                 ─┘     (adding instances does not copy the data anew)
```

| Aspect | RDS | Aurora |
|------|------|------|
| Storage | EBS per instance, with a specified size (auto scaling option) | Shared cluster volume, grows and shrinks automatically as you write |
| Replicas | Asynchronous replication using the engine's replication feature | Read from the same shared volume |
| Number of Read Replicas | 15 per source (quota) | 15 |
| Failover | Switch to the Multi-AZ standby instance | Promote one of the readers to writer |
| Maximum storage | Depends on engine and storage type | Cluster volume of 128 TiB, 256 TiB for the latest engine versions |
| Engines | 6 | MySQL and PostgreSQL compatible only |

- The upper limit of an Aurora cluster volume was long known as **128 TiB**, and the current documentation lists **256 TiB** for the latest engine versions (Aurora PostgreSQL 15.13, 16.9, 17.5 and later, Aurora MySQL 3.10 and later). Exam materials may use the old value.
- Aurora storage is billed **as you use it**, and when you delete data the allocation shrinks too. For the storage configuration, you choose between Aurora Standard (I/O requests billed separately) and Aurora I/O-Optimized (no I/O charge). If I/O spending is 25% or more of total Aurora cost, I/O-Optimized is advantageous.
- If a reader exists, it is promoted when the writer fails, and recovery usually takes under 60 seconds. If there is no reader at all, a new instance must be created, which takes much longer.

> 💡 **Related Theory**: RDS/Aurora use row-based storage. All the columns of one row sit together on disk, which is optimal for "read and update one order," but to "sum only the amount column across 100 million rows" it has to read the unneeded columns as well. Columnar Redshift and Parquet are the exact opposite. This is why the first question in choosing a store is "are you handling rows, or aggregating columns?"

## OLTP vs OLAP

| Category | OLTP (RDS/Aurora/DynamoDB) | OLAP (Redshift/Athena) |
|------|------|------|
| Purpose | Transaction processing, operations | Analysis, aggregation, reporting |
| Storage | Row-based | Column-based |
| Queries | Reading and writing small numbers of rows, short response | Bulk scans and aggregation |
| Schema | Normalized | Denormalized, star schema |
| Concurrency | A very large number of short requests | A relatively small number of heavy queries |
| Data scope | Current state | Entire history |
| Indexes | Find rows with B-tree indexes | Skip blocks with sort keys, partitions, and statistics |

Moving OLTP data into an OLAP store for analytics is ETL. The problem is building and maintaining that pipeline. Scheduling, retries, handling schema changes, and latency all become an operational burden.

## Stages for Peeling Off Analytics Load

If you throw heavy report queries straight at the operational database, transactions slow down from lock and I/O contention. The ways of peeling the load off come in an order, starting from the lightest burden.

| Stage | Method | What you get | Limitation |
|------|------|------|------|
| 1 | Separate queries with a Read Replica / Aurora reader | Protects the writer, applies immediately with no changes | Still row-based. Large aggregations are slow. Replication lag is possible |
| 2 | Replicate to Redshift with zero-ETL | Near-real-time analytics on a columnar engine, no pipeline to manage | Limited to supported source and target combinations, no transformation |
| 2' | Replicate to Redshift or S3 with DMS | Wide range of sources and targets, fine-grained mapping and transformation rules | You operate the replication instance (or serverless capacity) and tasks |
| 3 | Export snapshots or query results to S3 and use Athena | Cheapest long-term history analysis | Not real time |

- An RDS Read Replica uses **asynchronous** replication and is read-only. The Multi-AZ standby instance uses synchronous replication but cannot accept read traffic. For "availability," it is Multi-AZ; for "spreading reads and separating reporting," it is a Read Replica.
- RDS does not automatically add or remove Read Replicas. A replica is billed at the same rate as a regular DB instance, so if it is needed only while reports run, weigh that cost.
- There are also **federated queries** that query the operational database directly from Redshift or Athena. They do not move data, but every query puts load on the operational database, so they suit occasional lookups or checking the latest values.

## Zero-ETL Integration

A **zero-ETL integration** replicates source data into Redshift without building a pipeline. AWS takes care of the initial load, subsequent change replication, health monitoring, and recovery.

```text
Aurora MySQL / Aurora PostgreSQL / RDS / DynamoDB ...
   │  (zero-ETL integration — after the initial load, keeps replicating changes)
   ▼
Amazon Redshift (Serverless or RA3-family provisioned)
   └─ "Target database" created by the integration — read-only
        └─ Process with materialized views and cross-database queries from other databases
```

| Item | Details |
|------|------|
| Sources | Aurora MySQL, Aurora PostgreSQL, RDS for MySQL, PostgreSQL, and Oracle, DynamoDB, plus SaaS applications and self-managed databases |
| Targets | Redshift Serverless or RA3-family provisioned cluster (provisioned requires encryption), **case sensitivity must be enabled** |
| Other targets | Aurora also integrates with SageMaker lakehouse, and DynamoDB with OpenSearch Service |
| Latency | Near real time for Aurora and RDS. DynamoDB uses incremental exports, so a minimum of 15 minutes |
| Transformation | None. It replicates the source as is. Processing is done inside Redshift |
| Target database | Read-only. You cannot create tables or views inside it |
| Scoping | Include or exclude tables to replicate with data filtering |

Constraints to be aware of are as follows.

- The source tables must have a **primary key**. Tables without one are not replicated.
- The source cluster and the target must be in the **same Region**.
- If you run DDL such as `ALTER TABLE` on the source, that table is **resynchronized**, and during that time it may not be queryable from Redshift.
- The initial load can take 20 to 25 minutes or more when you first create the integration and at resynchronization.
- Aurora MySQL integration depends on the binary log (binlog). Aurora PostgreSQL requires you to specify at least one data filter (at the database level).

> ⚠️ **Pitfall**: "Zero-ETL" comes close to meaning **there is no T (transformation)**. The normalized operational schema arrives in Redshift as it is. To convert it to a star schema or build aggregate tables, you must process it inside Redshift with materialized views or SQL. If the question asks for "masking or transforming columns during replication," it is not zero-ETL but the transformation rules of DMS or Glue.

## Comparison with DMS

**AWS DMS (Database Migration Service)** runs a **task** that reads from a source endpoint and writes to a target endpoint on a replication instance (or serverless).

| Task type | Behavior |
|------|------|
| Full load | Moves the current data once |
| CDC | Continuously replicates only the changes |
| Full load + CDC | Collects the changes made during the move and then continues replicating them. The basis of zero-downtime migration |

- For **heterogeneous engines** (for example Oracle → Aurora PostgreSQL), the schema and code objects must be converted first. **DMS Schema Conversion** or **AWS SCT** does this work, and DMS moves the data. With the same engine, no conversion is needed.
- During migration, the source keeps running.
- When the target is Redshift, DMS **uploads the data to S3 as CSV and then loads it with COPY**. In this case the Redshift cluster must be in the same account and the same Region as the replication instance.
- If you make S3 the target, it becomes a CDC pipeline that accumulates change history in the lake.

| Criterion | Zero-ETL | DMS | Glue ETL |
|------|------|------|------|
| Essence | Managed replication | Migration and continuous replication tool | General-purpose transformation engine |
| Sources and targets | Fixed combinations | Very wide (including on-premises) | JDBC, S3, streams, and so on |
| Transformation | None | Table mapping, simple transformation rules | Arbitrary code |
| Operational burden | Almost none | Manage replication instance and tasks | Manage jobs and schedules |
| Latency | Near real time | Near real time (CDC) | Batch (or streaming job) |
| Typical clue | "Analyze Aurora in Redshift with no pipeline" | "Migrate Oracle to Aurora while continuing to replicate changes" | "Load as Parquet after complex cleansing and joins" |

## Ways to Export from RDS/Aurora to the Lake

| Method | Details | When it fits |
|------|------|------|
| Export a snapshot to S3 | Exports a DB snapshot to S3 as Parquet. There is no load on the production instance | Regular full-snapshot analysis |
| Write query results to S3 | Aurora writes the SELECT result directly to S3 files | Extracting only some tables or conditions |
| DMS → S3 | Continuously loads full load + CDC into S3 | Keeping change history in the lake |
| Glue JDBC job (bookmarks) | Incremental extraction based on a bookmark column | Batch loading of append-only tables |
| Lake Formation blueprint | Automatically generates the Glue jobs, crawlers, and triggers above | Quickly setting up a standard pattern |

## Workload → Store Decision Framework

Decide the access pattern first, then match the store.

```text
① Do you read and write a single record, or aggregate many rows?
   ├─ A single record (transaction) ──► go to ②
   └─ Aggregation (analytics) ────────► go to ③

② Do you need relationships, joins, and transactions across multiple rows?
   ├─ Needed ─────────────► RDS / Aurora
   └─ Lookups by key only, with large scale and concurrency ──► DynamoDB

③ How often and how heavily do you analyze?
   ├─ Constant, repeated, complex joins, fast response ──► Redshift
   ├─ Occasional, directly on data in S3 ─────────────────► Athena
   └─ Warehouse + S3 history together ────────────────────► Redshift Spectrum

④ Is the shape special?
   ├─ Full-text search, log exploration ───► OpenSearch Service
   ├─ Microsecond cache, sessions ─────────► ElastiCache / MemoryDB
   ├─ Relationship traversal (graph) ──────► Neptune
   ├─ Time-series metrics ─────────────────► Timestream
   └─ JSON documents (MongoDB compatible) ─► DocumentDB
```

| Requirement | First choice | Reason | What not to choose |
|------|------|------|------|
| Order and payment transactions, normalized schema | Aurora / RDS | ACID, joins, constraints | DynamoDB (no joins), Redshift (not OLTP) |
| Millisecond lookups by user ID, unpredictable traffic | DynamoDB | Key lookups, serverless scaling | Aurora (scaling limits), Athena (latency) |
| Dashboards over hundreds of millions of rows, multiple joins | Redshift | Columnar MPP, distribution and sort keys | Aurora (row-based) |
| Occasional SQL on S3 logs | Athena | No infrastructure, billed by scan volume | Redshift (constant cost) |
| Partial-match, typo-tolerant search on product names | OpenSearch | Inverted index | LIKE search in RDS |
| Cache in front of a database | ElastiCache | In-memory | - |
| Move an existing Oracle or SQL Server to the cloud as is | RDS | Keeps the same engine | Aurora (not a compatible engine) |

The selection criteria, one line each, are as follows.

- **Access pattern**: key lookups / transactions and joins / aggregation / search / relationship traversal.
- **Data shape**: structured / semi-structured / unstructured.
- **Latency and concurrency**: many millisecond requests / heavy queries taking seconds to minutes.
- **Operating model**: serverless (Athena, DynamoDB on-demand, Redshift Serverless, Aurora Serverless) / provisioned.
- **Billing unit**: instance hours (RDS, Aurora) / request and capacity units (DynamoDB) / node hours and RPUs (Redshift) / scan volume (Athena).

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Order processing slows down while reports run | Analytics queries run on the writer | Separate with a Read Replica or reader |
| Moved to a replica but aggregation is still slow | Limits of a row-based engine | Replicate to Redshift (zero-ETL, DMS) |
| Some tables do not arrive in zero-ETL | No primary key, excluded by the data filter | Add a primary key, check the filter |
| Creating a zero-ETL integration fails | Target case sensitivity disabled, unsupported node type, Region mismatch | Fix the target settings |
| Cannot query a Redshift table after changing a column on the source | Resynchronization caused by DDL | Wait for completion, adjust the timing of changes |
| DMS CDC lag keeps growing | No primary key on the target table, insufficient replication instance | Add a primary key, scale up the instance |
| A Read Replica returns stale values | Asynchronous replication lag | Monitor the lag metric, send reads that need the latest values to the writer |

## Question Clue → Answer Lookup Table

| Clue in the question | Answer |
|------|------|
| "Normalized transactions, ACID, joins" | RDS / Aurora |
| "Separate the reporting load from the operational DB in the simplest way" | Read Replica (Aurora reader) |
| "Aurora data in Redshift in near real time, with no pipeline to manage" | Zero-ETL integration |
| "Oracle → Aurora PostgreSQL migration + continuous replication" | DMS (schema via DMS Schema Conversion/SCT) |
| "Continuously load changes from an on-premises DB into S3" | DMS (target S3) |
| "Complex transformations and joins while replicating" | Glue ETL |
| "Analyze snapshot data with Athena with no operational load" | Export the snapshot to S3 |
| "Occasionally query the latest rows of the operational DB together from Redshift" | Federated query |
| "Key-based milliseconds, large-scale concurrency, serverless" | DynamoDB |
| "Intermittent SQL analysis of S3 data" | Athena |
| "Automatic switchover on failure (availability)" | Multi-AZ (not a Read Replica) |

Tomorrow we put this week's stores on a single page and review the choice by workload and the data movement paths between stores.

## 📖 Glossary

- **OLTP / OLAP**: Transaction processing of small numbers of rows, and analytical and aggregation processing of large volumes of data.
- **Cluster volume**: Aurora's shared storage. It is replicated across several AZs and used jointly by all instances.
- **Read Replica**: A read-only copy that follows the source asynchronously. It shares the read load.
- **Multi-AZ**: An availability configuration that keeps a standby instance in a different AZ and switches over automatically on failure.
- **CDC**: Change Data Capture. A method that captures and delivers only the changes (inserts, updates, deletes) of the source.
- **Zero-ETL integration**: A managed feature in which AWS continuously replicates a source into an analytics store without building a pipeline.
- **DMS**: A service that moves databases and keeps replicating changes. It consists of a replication instance, endpoints, and tasks.
- **Schema conversion**: The work of converting table definitions and code objects into the target engine's syntax when moving to a database with a different engine.
- **Federated query**: A query that reads another store directly without moving the data.
- **Star schema**: An analytics model made of a central fact table and surrounding dimension tables.

## 📝 Practice Questions

**Question 1.** Which of the following stores is optimized for row-based OLTP and best suited to normalized transactional and ACID workloads?

A) Amazon Redshift  
B) Amazon Athena  
C) Amazon Aurora  
D) Amazon OpenSearch  

**Answer: C**  
Explanation: Aurora (and RDS) is row-based relational OLTP, optimal for normalized schemas, transactions, and handling small numbers of rows. Redshift is columnar OLAP, Athena is serverless analytics on S3, and OpenSearch is for search and log analytics.

---

**Question 2.** What do you use to replicate Aurora data to Redshift in near real time for analysis without building a separate ETL pipeline (DMS/Glue)?

A) Zero-ETL integration  
B) DynamoDB Streams  
C) Redshift Spectrum  
D) Athena federated query  

**Answer: A**  
Explanation: Zero-ETL integration has AWS perform the CDC replication as a managed service, reflecting Aurora data in Redshift in near real time without code. Streams is DynamoDB change capture, Spectrum queries external tables in S3, and federation is Athena's join across heterogeneous sources.

---

**Question 3.** Heavy BI reporting queries on a production Aurora instance are degrading transaction performance. What is the first mitigation to consider?

A) Denormalize all tables  
B) Separate the analytics load onto a read replica  
C) Migrate to DynamoDB  
D) Add a sort key  

**Answer: B**  
Explanation: Separating analytics and reporting queries onto a read replica is the first-line pattern for preventing degradation of write transaction performance. If large-scale aggregation continues, moving to Redshift is the next step. Denormalization, migrating to DynamoDB, and sort keys are inappropriate or irrelevant.

---

**Question 4.** You are migrating an Oracle database to Aurora PostgreSQL and need ongoing change replication (CDC) during the migration. Which service is the most appropriate?

A) Zero-ETL integration  
B) AWS DMS(Database Migration Service)  
C) Athena CTAS  
D) Kinesis Data Firehose  

**Answer: B**  
Explanation: DMS supports migration between heterogeneous databases and ongoing replication (CDC), and handles a broad range of source/target combinations such as Oracle to Aurora. Zero-ETL is limited to Aurora/RDS/DynamoDB to Redshift/OpenSearch, and CTAS and Firehose are not for migration.

---

**Question 5.** Which store is the most suitable when the key requirements are "single-digit millisecond lookups by user ID, unpredictable massive concurrency, and serverless operation"?

A) Amazon Redshift  
B) Amazon Aurora  
C) Amazon DynamoDB  
D) Amazon Athena  

**Answer: C**  
Explanation: Key-based ultra-low-latency lookups, massive concurrency, and on-demand serverless operation are core strengths of DynamoDB. Redshift/Athena are suited to analytical OLAP, and Aurora is suited to relational transactional workloads.

---
