# Day 4 - RDS/Aurora and Store Selection: OLTP, Zero-ETL, Workload-to-Store Decision

Today we view Amazon RDS/Aurora, relational OLTP stores, through an analytics data flow lens; cover **Zero-ETL (Aurora→Redshift)** integration; then organize a decision framework for "observe workload, choose store."

## RDS and Aurora Overview

- **Amazon RDS**: Managed relational DB for MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, etc. Automates patching, backup, recovery; traditional engine hosting.
- **Amazon Aurora**: MySQL/PostgreSQL-compatible cloud-native engine. Storage auto-replicates across 6 copies (3 AZ); compute/storage separated; storage auto-scales (max 128TiB). Offers higher performance and availability than RDS.

```text
Aurora: single write instance + multiple read replicas
        └── shared distributed storage (6 copies / 3 AZ) — minimal replication lag
```

> 💡 **Related Theory**: RDS/Aurora are fundamentally **row-based OLTP**. Normalized schema, transactions (ACID), small-volume/single-row processing are optimal; large-scale column aggregation and analysis belong on Redshift/Athena.

## OLTP vs OLAP

| Aspect | OLTP (RDS/Aurora/DynamoDB) | OLAP (Redshift/Athena) |
|--------|----------------------------|------------------------|
| Purpose | Transaction processing, operations | Analysis, aggregation, reporting |
| Storage | Row-based | Column-based |
| Queries | Small volume reads/writes, short latency | Large-scale scans/aggregations |
| Normalization | Normalized | Denormalized/star schema |

Traditional ETL moves OLTP data to OLAP store for analysis. But this ETL pipeline incurs operational, latency, and cost burden.

## Read Replicas and Analytics Workload Separation

Running heavy analysis queries on operational DB degrades transaction performance. **Read replica** isolates analytics/reporting load as first-pattern approach. But replicas are still row-based, inefficient for large aggregations.

## Zero-ETL: Aurora → Redshift

**Zero-ETL integration** replicates Aurora (and RDS MySQL/PostgreSQL, DynamoDB) data to Redshift **without pipeline construction**, in near real-time. AWS manages CDC, so no need to operate Glue jobs or DMS pipelines.

```text
Aurora MySQL/PostgreSQL
   │  (Zero-ETL integration — managed CDC, seconds-to-minutes lag)
   ▼
Amazon Redshift  ──►  analyze/aggregate replicated data immediately
```

- Operational transactions reflected in Redshift near real-time.
- Eliminates ETL code, scheduler, DMS instance operations burden.
- Analytics on Redshift, operations on Aurora → workload isolation.
- Similarly, **DynamoDB → Redshift Zero-ETL**, **DynamoDB → OpenSearch Zero-ETL** also available.

> 💡 **Related Theory**: Zero-ETL "eliminates ETL" less so than **AWS assumes managed CDC responsibility**. Reduces operational burden of running DMS/Glue, connecting operational OLTP and analytics OLAP with low latency.

## DMS Comparison

- **AWS DMS (Database Migration Service)**: Migration and ongoing replication (CDC) between heterogeneous DBs. Flexible source/target combinations (e.g., Oracle→Aurora). Must provision and operate instances.
- **Zero-ETL**: Limited to specific sources (Aurora/RDS/DynamoDB) → Redshift/OpenSearch; fully managed, codeless.

Use DMS for migration or broad source combinations; Zero-ETL for Aurora→Redshift analytics connection.

## Workload → Store Decision Framework

Define access patterns first, then map to stores.

```text
Normalized transactions, joins, ACID, small rows ......... RDS / Aurora
Key-based fast lookup, massive concurrency, serverless .... DynamoDB
Large aggregations, BI, complex joins (structured DW) ...... Redshift
Ad-hoc SQL on S3 data, serverless, intermittent ........... Athena
Full-text search, log analysis, observability ............. OpenSearch
In-memory cache, ultra-low latency ......................... ElastiCache
Graph relationship exploration ............................ Neptune
Time series (IoT metrics) ................................ Timestream
```

Selection criteria summary:
- **Access pattern**: Key lookup vs. aggregation vs. search vs. relationship.
- **Data shape**: Structured/semi-structured/unstructured.
- **Latency and concurrency**: ms OLTP vs. analytics throughput.
- **Operations model**: Serverless preference favors Athena/DynamoDB on-demand.
- **Cost model**: Scan volume (Athena) vs. provisioning (Redshift) vs. throughput (DynamoDB).

## Key Takeaways

- RDS/Aurora row-based OLTP. Aurora separates compute/storage, 6-copy auto-replication for high availability and performance.
- Isolate analytics load via read replicas, or advance further with Zero-ETL for near real-time Redshift replication.
- Zero-ETL = AWS-managed CDC (codeless). Broad migration use DMS.
- Store selection via access pattern, data shape, latency, operations/cost model.

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
