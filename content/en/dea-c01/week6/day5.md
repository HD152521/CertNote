# Day 5 - Week 6 Comprehensive Review: Data Lake Recap

This week covered S3-based data lake layout, Lake Formation permissions, open table formats, and storage cost optimization. Today we tie four topics together in a single data lake operations scenario.

## 1. S3 Data Lake Layout (Day 1)

- **Zone separation**: raw (immutable original) → clean (validated, normalized) → curated (business aggregations). Isolate permissions and reprocessing per tier.
- **Partitioning**: Hive-style `key=value` (usually date hierarchy) enables partition pruning. Cardinality must be appropriate; watch for small files problem (128MB–1GB recommended).
- **Partition projection**: For many partitions, compute using rules rather than catalog registration to bypass bottlenecks.
- **Format**: Parquet + compression (Snappy/ZSTD) reduces scan volume and costs.

> 💡 **Related Theory**: Separation of compute and storage (multiple engines sharing S3) and schema-on-read are fundamental data lake characteristics.

## 2. AWS Lake Formation (Day 2)

- **Register data locations** → credential vending centralizes access.
- **Permission models**: Named resources vs. LF-Tags (TBAC). Tag-based is more scalable at large scale.
- **Fine-grained security**: Column / row (data filters) / cell level.
- **Blueprints**: Auto-generate ingestion workflows (crawlers + jobs + triggers).
- **Both** IAM and Lake Formation permissions required.

## 3. Open Table Formats (Day 3)

- Transaction metadata over Parquet provides **ACID, time travel, row-level DML**.
- **Iceberg** (schema/partition evolution, broad AWS support), **Hudi** (upsert/incremental CDC), **Delta** (Spark integration).
- Athena v3 / Glue / EMR integration, Glue Data Catalog sharing.
- Compaction and snapshot expiration maintenance, MoR/CoW tradeoffs.

## 4. S3 Storage Management (Day 4)

- Choose storage class by access frequency; consider IA/Glacier retrieval costs and minimum retention periods.
- Lifecycle transitions and expirations, clean up incomplete multiparts and noncurrent versions.
- Intelligent-Tiering (irregular patterns) vs. lifecycle transitions (predictable patterns).
- Storage Lens/Inventory visibility, compression and compaction are fundamental savings.

## Integrated Scenario: Order Data Lake

Requirement: Ingest RDS order DB into a data lake, show analysts PII-free columns and only their region rows, respond to GDPR deletion requests, and optimize costs.

```text
[RDS] --(Lake Formation Incremental DB Blueprint)--> s3://lake-raw/orders/dt=.../
   --(Glue ETL: validate, Parquet conversion)--> s3://lake-clean/orders/ (Iceberg table)
   --(Glue: aggregate)--> s3://lake-curated/revenue/ (consumed by Athena/QuickSight)
```

Design decisions:
1. **Ingestion**: Use Lake Formation Incremental database blueprint to auto-generate incremental ingestion workflow.
2. **Table format**: Configure clean zone as **Iceberg** table → supports GDPR DELETE, MERGE upserts, time travel.
3. **Permissions**: In Lake Formation, exclude `pii` columns from GRANT, use **data filters** to expose only `region = analyst's region` rows.
4. **Costs**: Transition raw zone via lifecycle: 30 days → IA, 90 days → Glacier + clean up incomplete uploads. Clean/curated use Standard or Intelligent-Tiering.

```sql
-- Handle GDPR deletion request (Iceberg on Athena)
DELETE FROM lake_clean.orders WHERE customer_id = 'GDPR-REQ-2026-001';

-- Analyst permissions: exclude PII, row filter via data filter
-- (column exclusion GRANT)
GRANT SELECT (order_id, region, amount, dt)
ON TABLE lake_clean.orders TO 'arn:aws:iam::111122223333:role/RegionAnalyst';
```

> 💡 **Related Theory**: Data lake design requires balancing four dimensions: ingestion (blueprints) → table format (governance, DML) → permissions (Lake Formation) → costs (storage management). Optimizing only one dimension creates problems in others.

## Exam Focus Points

- Distinguish raw/clean/curated zone purposes and storage class mappings.
- Partition pruning vs. partition projection, small files problem causes and solutions.
- Lake Formation: register/credential vending, LF-Tags (TBAC), data filters (row-level), IAM requirement.
- Open table format problems solved (ACID/time-travel/row DML) and Iceberg/Hudi/Delta strengths.
- Retrieval costs, minimum retention periods, Intelligent-Tiering vs. lifecycle selection criteria.

## 📝 Practice Questions

**Question 1.** You want to incrementally load RDS order data into the data lake and configure the clean zone so that row-level deletion (GDPR) and MERGE upserts are possible afterward. Which combination is the most suitable?

A) Lake Formation Database snapshot blueprint + CSV table  
B) Lake Formation Incremental database blueprint + Iceberg table  
C) Manual S3 upload + regular Hive Parquet table  
D) S3 Replication + One Zone-IA  

**Answer: B**  
Explanation: The Incremental database blueprint handles incremental loading, and an open table format such as Iceberg handles row-level DELETE/MERGE. Snapshot + CSV or a regular Hive Parquet table makes row-level DML difficult, and Replication/One Zone-IA is unrelated to the requirements.

---

**Question 2.** You want to hide PII columns from an analyst and expose only the rows for their own region. Which combination of Lake Formation features is correct?

A) Column exclude/select GRANT + row-level data filter  
B) S3 bucket policy + One Zone-IA  
C) Partition projection + lifecycle policy  
D) Storage Lens + Object Lock  

**Answer: A**  
Explanation: Column security is implemented with the column select/exclude options of GRANT, and row security with a data filter (RowFilter). The others are cost, visibility, and storage features unrelated to fine-grained access control.

---

**Question 3.** What is the most appropriate storage strategy for the frequently read curated zone and the rarely read raw zone of a data lake?

A) Both in Glacier Deep Archive  
B) Curated in Standard, raw transitioned IA → Glacier by lifecycle  
C) Curated in One Zone-IA, raw in Standard  
D) Both fixed to Standard-IA  

**Answer: B**  
Explanation: Standard, which has no retrieval cost, is cost-effective for the frequently read curated zone, and transitioning IA → Glacier by lifecycle is cost-effective for the rarely accessed raw zone. Putting frequently read data in IA/Glacier wastes money on retrieval costs, and putting unread data in Standard wastes storage cost.

---

**Question 4.** Which of the following most accurately describes the "schema-on-read" characteristic of a data lake?

A) A strict schema is enforced before data is loaded  
B) The schema can never be changed  
C) Only columnar formats can be stored  
D) Data is stored as is in its original form, and the schema is applied at query time  

**Answer: D**  
Explanation: Schema-on-read stores data in its original form and assigns the schema when reading, flexibly accommodating structured, semi-structured, and unstructured data. Enforcing a schema before loading is schema-on-write (data warehouse), and the other options are not factual.

---

**Question 5.** The partitions of a data lake table have grown to tens of thousands, and Glue Data Catalog lookups have become a bottleneck for Athena queries. How can you solve this without registering each partition in the catalog?

A) Enable partition projection  
B) Merge all partitions into a single file  
C) Convert the table to CSV  
D) Enable bucket versioning  

**Answer: A**  
Explanation: Partition projection computes partitions from the range and format rules in the table properties, eliminating the catalog registration and lookup bottleneck. Merging into a single file harms pruning, and CSV conversion and versioning are unrelated to the partition bottleneck.

---
