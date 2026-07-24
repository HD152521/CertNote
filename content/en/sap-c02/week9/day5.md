# Day 5 - Week 9 Comprehensive Review: Data Architecture as One Picture

Week 9 covered "where data is stored, how it's processed, who sees what, and how it flows in real-time." Memorizing individual services alone won't pass SAP exams. Exams always ask "under these constraints (cost, real-time, operational burden, portability, permission granularity), what is optimal?" and only one of two similar-looking services satisfies all conditions. Today we consolidate the week's pieces into one unified architecture picture and sharpen boundary-drawing through scenario drills.

## Data Architecture in One Frame

```
[Ingest]   Kinesis (KDS/Firehose) / MSK / DMS
   ↓
[Store]    S3 Raw → Curated → Trusted (Parquet + partitions + compression)
   ↓                         │
[Catalog]  Glue Data Catalog (Hive Metastore compatible — hub for all engines)
   ↓
[Process]  Glue (serverless ETL) / EMR (full Spark·Hadoop) / Athena (SQL CTAS)
   ↓
[Load]     Redshift (RA3·Serverless) / OpenSearch / S3 Curated
   ↓
[Analyze]  Athena / Redshift (Spectrum·Federated·Sharing·Zero-ETL) / QuickSight / SageMaker
   │
[Perms]    Lake Formation (rows·columns·cells, LF Tag ABAC, RAM cross-account)
[Orch]     MWAA (Airflow DAG) / Step Functions
[Govern]   DataZone (marketplace) / Glue Data Quality (DQDL)
```

The core of this picture: **Glue Data Catalog is the central hub**. The same Parquet file in S3 is seen as the same table by Athena (SQL), EMR Spark (transform), and Redshift Spectrum (join). This separation of unified metadata with swappable processing engines is the essence of the lakehouse.

## Boundary Clarification — 7 Pairs of Confusions the Exam Exploits

| Distinction | A | B | Deciding Question |
|--------|---|---|------------|
| Processing | **Glue** (serverless ETL) | **EMR** (full cluster) | Will you operate a cluster directly, need full Hadoop stack |
| Query Location | **Athena** (S3 SQL) | **Redshift** (DW) | Ad-hoc S3 query or structured repeated analysis / high-performance DW |
| Redshift External | **Spectrum** (S3) | **Federated Query** (RDS/Aurora) | Data in S3 or operational DB |
| OpDB → DW | **Federated Query** (real-time direct query) | **Zero-ETL** (CDC auto-replicate) | OK to load OpDB (former yes) |
| Stream | **MSK** (Kafka standard) | **Kinesis** (AWS proprietary) | Portability, existing Kafka or simplicity, AWS-native |
| Permissions | **Lake Formation** (rows·columns·cells, Tags) | **IAM** (object level) | Need table-internal granularity |
| Orchestration | **MWAA** (Airflow DAG, portability) | **Step Functions** (ASL, serverless·AWS integration) | Portability, complex logic or ops-zero, avoid on-demand cost |

Each row is roughly one exam question. Two choices both "look right," but a single condition (OpDB load avoidance? Portability? On-demand cost?) breaks the tie.

## Cost · Real-Time · Portability — Reframed on Three Axes

**Cost Axis**: Sporadic, variable workloads always favor serverless/elastic (Glue, Athena, EMR Serverless, Redshift Serverless, MSK Serverless, Step Functions); steady high volume favors reserved/provisioned (RA3 reserved, EMR EC2 Spot Fleet) cheaper. "Zero cost when not running" is the serverless keyword; "24/7 packed normal load" points to reserved.

**Real-Time Axis**: Batch (Glue, EMR, Athena CTAS, minutes to hours) → Micro-batch (Glue Streaming, Firehose, seconds to minutes) → Real-time (KDS, MSK, milliseconds to seconds). Real-time operational DB analysis: Zero-ETL (seconds-to-tens-of-seconds CDC) freshest without ETL code.

**Portability Axis**: Open-source standards (MSK=Kafka, MWAA=Airflow, EMR=Spark/Hadoop, Iceberg/Hudi/Delta) ease cross-cloud and on-prem migration; AWS proprietary (Kinesis, Step Functions, Redshift) offer deep integration but vendor lock-in. Multi-cloud strategy tips toward standards.

> 💡 **Related Theory**: These three axes' trade-offs connect to CAP/PACELC in distributed systems. PACELC: "Under partition, choose availability vs consistency; in normal operation, choose latency vs consistency." Zero-ETL and CDC replicate introduce intentional delay (eventual consistency) between operational DB and analytical DW to gain availability and isolation; Federated Query sacrifices OpDB isolation for consistency (freshness). "Freshness vs isolation load" is really the data pipeline version of consistency vs availability trade-off.

> 🔍 **Deeper Dive**: SAP often layers data topics over **multi-account, multi-region** contexts. Central data lake in separate data account with departmental accounts sharing via RAM+LF (data mesh pattern), Redshift Data Sharing cross-region/cross-account sharing without replication, Glue Catalog cross-account reference — these are recurring patterns. Organizations, SCP, and Control Tower form the governance backbone. Habit: don't view one data service alone but "how does this share/isolate/control in multi-account organizations" — this habit is key to solving Pro-tier scenarios.

> 🎯 **Scenario**: "Global firm operates Redshift in US, Europe, Asia regions. Head BI team wants to unified-analyze sales across three regions without moving/replicating data, can't impact regional cluster performance. Optimal?" — Answer: **Redshift Data Sharing (cross-Region/cross-Account)**. Because data lives in RMS (S3-backed), producer (each region) shares data to consumer (head BI) cluster without copying; independent compute isolates workloads (no performance impact). Centralizing data via ETL/replicate costs, latency, sync burden far exceed this solution; Spectrum is for S3 external data, not internal table sharing mechanism.

## Common Pitfalls

> ⚠️ **Pitfall**: **"Serverless is always cheaper"** — Redshift Serverless, EMR Serverless, MSK Serverless all cheaper on variable loads, but provisioned/reserved cheaper on steady heavy load. Strength is not absolute cost per unit but "zero when idle" elasticity.

> ⚠️ **Pitfall**: **"Federated Query = Zero-ETL"** — Both "no ETL, analyze operational DB in Redshift." But Federated Query **directly queries OpDB, loading it**, Zero-ETL **replicates via CDC, no load**. One word "avoid OpDB load" breaks the tie.

> ⚠️ **Pitfall**: **"Spectrum and Athena both query S3, so interchangeable?"** — Both SQL S3 directly via Glue Catalog. But joining to Redshift internal tables requires Spectrum; pure S3 favors Athena simplicity. "Already running Redshift + must join S3 and internal" is Spectrum's slot.

> ⚠️ **Pitfall**: **"Make Master/Core Spot too, cheaper"** — EMR Master on Spot: cluster dies on interruption. Core on Spot: HDFS data vanishes. **Spot only for Task nodes**. Cost optimal: Task=Spot + Instance Fleets multi-type.

## Summary

Week 9 one-liner: **Aggregate data into S3 in standard format (Parquet+partitions), unify metadata in Glue Catalog, pick processing engines matching workload traits (cost, real-time, portability, permissions).** Exams ask "optimal under constraint," not service names. Below 12 scenarios sharpen boundary-drawing hands-on. Next week (Week 10): ML/AI architecture — SageMaker, Bedrock, MLOps.

---

## 📝 12-Question Scenarios

**Question 1.** Athena query cost (billed on the volume of S3 data scanned) is too high. The data currently accumulates as uncompressed CSV under a single path. What reduces scan cost the most?

A) Add more WHERE clauses
B) Convert to Parquet columnar format + date partitioning + compression
C) Separate Athena Workgroups
D) Enable query Result Reuse only

**Answer: B**

Explanation: Athena bills on the volume of S3 data scanned, so (1) a columnar format (Parquet) reads only the columns you need (column pruning), (2) partitioning skips irrelevant partitions wholesale (partition pruning), and (3) compression shrinks the physical bytes — together cutting scanned volume by tens of percent up to 90% or more. A (WHERE) has limited effect because unpartitioned CSV still ends up being scanned in full. C (Workgroup) is for cost visibility and control; it does not reduce scan volume itself. D (Result Reuse) helps only on repeated identical queries and leaves the underlying scan-volume problem unsolved.

---

**Question 2.** You already run Redshift RA3, and you need to join five years of historical orders (Parquet) in the S3 data lake with the recent-orders table in Redshift within a single query. You do not want to load the historical data into Redshift.

A) COPY the S3 data into a Redshift internal table
B) Redshift Spectrum + External Schema
C) Query separately with Athena and combine the results manually
D) Federated Query

**Answer: B**

Explanation: Spectrum queries S3 data directly through an External Schema that references Glue Catalog external tables — no loading — and joins it with Redshift internal tables in a single query (lakehouse). The S3 scan runs on a separate Spectrum node pool, so it barely consumes cluster resources. A violates the constraint because it loads the data. C is inefficient and error-prone, since results from two systems must be stitched together by hand. D (Federated Query) targets operational databases such as RDS/Aurora, not S3. "Redshift + join with S3 + avoid loading" is Spectrum.

---

**Question 3.** You need to analyze Aurora PostgreSQL OLTP data in Redshift in near real time. You do not want to build an ETL pipeline yourself, and you do not want analytic queries putting load on the operational database.

A) Redshift Federated Query
B) Aurora PostgreSQL Zero-ETL Integration with Redshift
C) Replicate to S3 with DMS CDC, then run Glue ETL
D) Hourly Glue batch ETL

**Answer: B**

Explanation: Zero-ETL uses CDC to replicate Aurora changes into Redshift automatically in near real time (seconds to tens of seconds). There is no ETL code to write or maintain (fully managed), and because the data is replicated into Redshift, analytic queries never load the operational database. A (Federated Query) also requires no ETL, but it queries the operational DB directly and therefore adds load, violating the "avoid load" condition — that single condition is what separates A from B. C means managing the pipeline yourself, with operational overhead. D is not real time.

---

**Question 4.** For one table in the S3 data lake, an analyst group must see every column except a PII column (national ID number), while users in the Korean branch must at the same time see only rows where region='KR'.

A) Restrict object access with an IAM policy
B) Lake Formation column permissions + row filters (data filters)
C) S3 bucket policy
D) Split the PII out into a separate bucket

**Answer: B**

Explanation: Lake Formation applies column-level permissions (excluding the PII column, CLS) and row filters (region='KR' only, RLS) simultaneously on top of the Glue Catalog. The same data exposes different rows and columns per user, so no data duplication or separate views are needed. A and C operate at the object/bucket level and cannot reach inside a table. D splits and duplicates data, creating management burden, and still provides no row-level control. "Exclude PII columns + only certain rows" is a Lake Formation data filter.

---

**Question 5.** Petabyte-scale logs are processed daily by a 2-3 hour Spark batch. The data is stored permanently in S3. How do you minimize cost while keeping the job safe from Spot interruptions?

A) Keep a persistent EMR cluster on On-Demand to eliminate job start-up delay and ensure stability
B) A per-job transient EMR cluster with Task nodes on Instance Fleets Spot across multiple types, terminated when the job finishes
C) To minimize cost, run Master, Core, and Task nodes all on Spot Instances
D) COPY the data into Redshift RA3 and process it with SQL batches

**Answer: B**

Explanation: Because the data lives in S3 (EMRFS), a transient cluster that spins up only for processing and terminates afterward is the cost optimum. Task nodes hold no HDFS data, so they are safe on Spot, and mixing several instance types with Instance Fleets makes the job robust — if one type is interrupted, capacity is replaced automatically. A incurs cost during idle time. C is the fatal mistake of running Master (an interruption kills the entire cluster) and Core (an interruption loses HDFS data) on Spot. D loads data into a DW unnecessarily for what is a batch transformation.

---

**Question 6.** A Spark job runs a few times a day on an irregular schedule. You do not want to size clusters or manage nodes, and you want cost near zero when it is not running.

A) A persistent EMR on EC2 cluster
B) EMR Serverless
C) Glue Crawler
D) Redshift Serverless

**Answer: B**

Explanation: EMR Serverless has no cluster or node concept — it provisions workers automatically when a job is submitted, reclaims them when the job finishes, and bills only for execution time, which removes both sizing mistakes and idle cost for intermittent, variable Spark workloads. A requires idle spend and sizing management. C (Crawler) is a schema-inference tool, not a Spark job runner. D (Redshift Serverless) is a data warehouse, not a Spark processing engine. "Variable Spark + avoid sizing" is EMR Serverless.

---

**Question 7.** You are moving a self-managed on-premises Kafka to AWS. You want to reuse the existing producer/consumer code and Debezium connectors nearly as-is, and you also want to keep the option of migrating to another cloud later.

A) Kinesis Data Streams
B) Amazon MSK
C) SQS FIFO
D) EventBridge

**Answer: B**

Explanation: MSK is managed Apache Kafka, so the Kafka API is unchanged and existing code and connectors are reused with almost no modification; and because Kafka is an open-source standard, portability to other clouds (Azure Event Hubs Kafka API, GCP Managed Kafka, and so on) or back on-prem is good. A (Kinesis) is AWS-proprietary, requiring a full code rewrite plus lock-in. C (SQS) is a message queue with a different model — no stream replay, no consumer groups. D is an event bus, not Kafka stream processing. "Existing Kafka + portability" is MSK.

---

**Question 8.** You are building an S3 data lake that requires ACID transactions, schema evolution, and time travel (querying a specific past point in time). Plain Parquet does not guarantee consistency for concurrent writes, updates, and deletes.

A) Manage plain Parquet files directly and control concurrent writes with application-level locks
B) A transactional table format such as Apache Iceberg / Hudi / Delta Lake
C) Store as CSV for schema-evolution flexibility and imitate time travel with per-version directories
D) Since ACID is required, move the data to DynamoDB and substitute PITR for time travel

**Answer: B**

Explanation: Iceberg, Hudi, and Delta Lake layer a transaction log and metadata tier on top of S3 objects to provide ACID, concurrent-write isolation, schema evolution, time travel (snapshot queries), and upsert/delete (lakehouse table formats). A (plain Parquet) has no transactions or time travel, so concurrent-write consistency cannot be guaranteed. C (CSV) is inferior on columnar access, compression, and transactions alike. D (DynamoDB) is OLTP NoSQL, not a large-scale analytical lake.

---

**Question 9.** You need to orchestrate a data pipeline whose dozens of steps have dependencies. The team already uses Airflow, and multi-cloud portability plus complex Python branching logic are required.

A) Step Functions (ASL)
B) MWAA
C) Glue Workflow
D) A chain of EventBridge rules

**Answer: B**

Explanation: MWAA is managed Airflow, so existing Python DAGs port over almost unchanged; because Airflow is open source, portability to GCP Composer or on-prem is good; and the expressiveness of Python handles complex conditional branching and dynamic tasks. A (Step Functions) is ASL JSON and AWS-bound, violating the portability requirement. C (Glue Workflow) is simple orchestration centered on Glue jobs and falls short on complex DAGs and portability. D is simple event chaining, not dependency-graph orchestration.

---

**Question 10.** You are building an event-driven, intermittent workflow in a pure AWS environment. You want no standing cost when the workflow is not running, and you need fine-grained integration with many AWS services.

A) Build Airflow DAGs on MWAA and trigger the workflow by events
B) Step Functions
C) Run cron on a persistent EC2 instance and execute the workflow by polling
D) Install Jenkins on EC2 and call AWS services from pipeline jobs

**Answer: B**

Explanation: Step Functions is fully serverless and billed per state transition, so cost converges to zero when nothing runs, and it integrates natively with 200+ AWS services — optimal for event-driven, intermittent, AWS-bound environments. A (MWAA) keeps the Airflow environment (web server, scheduler) running even with no jobs, so hourly cost accrues continuously, which is bad for "avoid standing cost." Questions 9 and 10 are a matched pair that split MWAA vs Step Functions on exactly opposite conditions. C and D mean operating infrastructure yourself, with large standing cost and management burden.

---

**Question 11.** Dozens of new tables are added to the data lake every week, and granting permissions manually each time is a burden. How do you get permissions applied to new tables automatically?

A) Manually add each new table's ARN to an IAM policy as it is created
B) Lake Formation LF Tags (tag-based access control, ABAC)
C) Classify with S3 object tags and control access with tag-condition bucket policies
D) Use a Glue Trigger to run a permission-granting script automatically when a new table is detected

**Answer: B**

Explanation: LF Tags implement ABAC — you attach classification tags to data and grant tag permissions to users and roles, so the moment a new table or column receives a tag, permissions apply automatically. As resources grow, the number of policies grows only linearly, so it scales (NIST SP 800-162 ABAC). A leaves the manual burden intact. C uses S3 tags, which are unrelated to Lake Formation permissions. D means writing and maintaining your own script, forfeiting the benefits of managed ABAC. "Automatic permissions on new tables + large scale" is LF Tags.

---

**Question 12.** Two separate RA3 clusters (a BI team and a data science team) must read the same sales data. How do you avoid data duplication and synchronization cost while isolating each team's queries so they do not affect the other's performance?

A) Have both teams share one cluster
B) Redshift Data Sharing (producer → consumer)
C) Have each team replicate the data with COPY
D) Share via Redshift Spectrum

**Answer: B**

Explanation: RA3 Data Sharing exploits the fact that data lives in RMS (S3-backed) to let a consumer cluster read the producer cluster's data without any copy. Each cluster has independent compute, so workloads are isolated (no mutual performance impact) and there is no replication or synchronization burden (multi-account and multi-region supported). A fails workload isolation (resource contention). C incurs replication cost and sync burden. D (Spectrum) is for querying external S3 data, not a mechanism for sharing Redshift internal tables. "Share across multiple clusters without copying + workload isolation" is Data Sharing.

---

## 📌 Week 9 at a Glance

```
Storage    ──► S3 Raw/Curated/Trusted (Parquet + partitions + compression)
Format     ──► Iceberg/Hudi/Delta (ACID·time-travel·upsert)
Catalog    ──► Glue Data Catalog (Hive Metastore compatible, hub for all engines)
Process    ──► Glue (serverless ETL) / EMR (full, Task=Spot Fleet) / Athena CTAS
DW         ──► Redshift RA3·Serverless (Spectrum·Federated·Sharing·Zero-ETL)
Stream     ──► Kinesis (KDS/Firehose) / MSK (Kafka standard)·Serverless·Connect
Perms      ──► Lake Formation (rows·columns·cells, LF Tag ABAC, RAM cross-account)
Orch       ──► MWAA (Airflow DAG, portability) / Step Functions (ASL, serverless·AWS integration)
Govern     ──► DataZone (marketplace) / Glue Data Quality (DQDL)
```

**Key Single-Line Boundary Drawers**: Glue vs EMR = cluster ops, Athena vs Redshift = ad-hoc vs DW, Spectrum vs Federated = S3 vs OpDB, Federated vs Zero-ETL = OpDB load, MSK vs Kinesis = portability vs simplicity, LF vs IAM = row·column granularity, MWAA vs Step Functions = portability vs serverless.

Next week (Week 10): **ML/AI Architecture** — SageMaker, Bedrock, MLOps.
