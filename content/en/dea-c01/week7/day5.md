# Day 5 - Week 7 Comprehensive Review: Analytics Stores Recap

This week covered analytics data stores (Redshift, Athena, DynamoDB, RDS/Aurora) and workload-based store selection. Today we integrate core points and check "workload-to-store mapping" and comparison points frequent on exams.

## Analytics Stores at a Glance

```text
Service       Model         Billing             Optimal Workload
Redshift      columnar MPP  provisioning/RA3    large aggregation, complex join DW
Redshift      external S3   scan volume         query S3 large history without load
 Spectrum
Athena        serverless    scan volume (TB)    S3 ad-hoc, intermittent SQL
DynamoDB      NoSQL KV      throughput/on-demand key-based ms lookup, high concurrency
RDS/Aurora    row OLTP      instance            normalized transactions, ACID
```

> 💡 **Related Theory**: Columnar (Redshift/Parquet) excels at "many rows, few columns aggregation"; row-based (RDS/Aurora) at "all columns of single row transaction." Read pattern is #1 store selection criterion.

## Redshift Recap Points

- **Distribution key (DISTKEY)**: KEY (co-located join), ALL (small dimension replica), EVEN (default). Choose even-distribution column avoiding skew.
- **Sort key (SORTKEY)**: Zone map skips blocks on range filter. COMPOUND (first column priority) vs. INTERLEAVED (multi-axis).
- **RA3**: Separate compute/storage, RMS (S3) auto-scale.
- **Spectrum**: Query S3 external tables directly (billed on scan volume).
- **Auto WLM + concurrency scaling**: Elastic response to read spike.

```sql
CREATE TABLE fact_sales (sale_date DATE, region VARCHAR(20), amount DECIMAL(12,2))
DISTKEY (region)
COMPOUND SORTKEY (sale_date);
```

## Athena Recap Points

- Serverless + **scan-volume billing** → less scan = cheaper and faster.
- **Three-pronged savings**: Partitioning (+projection), Parquet/compression, SELECT needed columns only.
- **CTAS/INSERT INTO**: Lightweight ETL format conversion, partitioning.
- **Federated queries**: Join RDS, DynamoDB, etc. without ETL.
- **Workgroup**: Per-query scan limit, cost, isolation.

## DynamoDB Recap (Analytics Perspective)

- PK hash determines partition → avoid hot partition (even key, write sharding).
- **GSI** (new query axis, async) vs **LSI** (same PK different SK, define at creation).
- Bulk analytics not directly on DynamoDB; move via Streams/Kinesis/S3 export to analytics store (CQRS pattern).

```text
DynamoDB (OLTP) → Streams/Export → S3 + Athena / Redshift (OLAP)
```

## RDS/Aurora & Store Selection Recap

- Aurora: separate compute/storage, 6 copies/3AZ, read replica isolates analytics load.
- **Zero-ETL (Aurora/RDS/DynamoDB → Redshift)**: Managed CDC, codeless near real-time replication.
- **DMS**: Heterogeneous DB migration and CDC (instance operation).

> 💡 **Related Theory**: "Operations (OLTP) and analytics (OLAP) on different engines" is the foundational data engineering principle. ETL (Glue/DMS) or Zero-ETL connect them; recent trend reduces pipeline operational burden via managed Zero-ETL.

## Workload → Store Decision (Exam Frequent)

```text
Normalized, transactions, ACID ................ RDS / Aurora
Key-based ms lookup, high concurrency, serverless ... DynamoDB
Large aggregation, complex join structured DW ... Redshift
Query S3 large history without load ........... Redshift Spectrum
S3 ad-hoc, intermittent serverless SQL ....... Athena
Operational DB → real-time analytics connection ... Zero-ETL (→ Redshift)
Heterogeneous DB migration, CDC .............. DMS
```

## Exam Pitfalls

- "Small dimension table join optimization" → **DISTSTYLE ALL** (never ALL on large table).
- "Athena cost reduction" → all scan-reducing methods (partition/Parquet/column projection).
- "Partition count bottleneck" → **partition projection**.
- "DynamoDB bulk aggregation analytics" → not directly; **Streams/export to OLAP store**.
- "Aurora→Redshift real-time, no ETL operations burden" → **Zero-ETL**.
- "Oracle→Aurora migration + CDC" → **DMS**.

## Key Takeaways

- Read pattern (column aggregation vs. row transaction vs. key lookup vs. search) is #1 store choice criterion.
- Redshift optimizes bulk analytics via distribution/sort keys, RA3, Spectrum, WLM.
- Athena billing on scan volume makes partition, format, column projection directly impact cost.
- DynamoDB analytics via exporting changes to analytics store (CQRS pattern).
- Operations↔Analytics connection via Zero-ETL (managed CDC) or DMS.

## 📝 Practice Questions

**Question 1.** Which service is the most suitable for the requirement to "analyze data accumulated in S3 intermittently with standard SQL without provisioning infrastructure"?

A) Amazon Redshift (provisioned cluster)  
B) Amazon Athena  
C) Amazon Aurora  
D) Amazon DynamoDB  

**Answer: B**  
Explanation: Athena is serverless, queries S3 data directly with SQL, and is billed by the amount scanned, so it suits intermittent, ad hoc analysis without infrastructure operations. Provisioned Redshift is an always-on cluster, Aurora is OLTP, and DynamoDB is for key lookups.

---

**Question 2.** What is the optimal setting in Redshift to avoid redistribution when two large fact/dimension tables are frequently joined on the same key?

A) Specify the same column as the DISTKEY for both tables  
B) DISTSTYLE EVEN for both tables  
C) INTERLEAVED SORTKEY for both tables  
D) DISTSTYLE ALL for only one table (both are large)  

**Answer: A**  
Explanation: Specifying the same column as the DISTKEY places the same key values on the same slice, resulting in a co-located join without redistribution. EVEN causes redistribution, INTERLEAVED is a multi-axis sort and unrelated to distribution, and ALL on a large table is excessively costly.

---

**Question 3.** You need to aggregate and report on operational data stored in DynamoDB at large scale. What is the recommended approach?

A) Aggregate directly in DynamoDB with full scans  
B) Create dozens of GSIs and handle all aggregations through indexes  
C) Move the data to S3/Redshift with Streams/S3 export and analyze it with Athena/Redshift  
D) Add an LSI to create a dedicated aggregation axis  

**Answer: C**  
Explanation: DynamoDB is unsuitable for large-scale aggregation and ad hoc analytics, so the standard approach is a CQRS-style separation in which changes are moved with Streams or S3 export to an analytics store (S3 + Athena/Redshift) for analysis. Full scans and excessive indexes are inappropriate in terms of cost and performance.

---

**Question 4.** How can you analyze Aurora operational data in Redshift in near real time without the burden of operating an ETL pipeline?

A) Hourly batch migration with AWS DMS  
B) Zero-ETL integration  
C) Athena federated query  
D) Redshift Spectrum external schema  

**Answer: B**  
Explanation: Zero-ETL integration replicates Aurora data to Redshift without code and in near real time using AWS-managed CDC. DMS carries the burden of operating instances, and federation and Spectrum query external data without loading it, which differs from the requirement.

---

**Question 5.** What is the most appropriate solution when partitions in Athena have grown to tens of thousands and catalog lookups and MSCK REPAIR have become a bottleneck?

A) Enable Concurrency Scaling  
B) Apply DISTSTYLE ALL  
C) Partition projection  
D) Convert all files to CSV  

**Answer: C**  
Explanation: Partition projection computes partitions from range and format rules without registering them in the catalog, eliminating the lookup bottleneck in environments with a large number of partitions. Concurrency Scaling and DISTSTYLE are Redshift concepts, and converting to CSV backfires by increasing the amount scanned.

---
