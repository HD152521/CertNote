# Day 1 - S3 Data Lake Layout and Partitioning Strategy

The core philosophy of a data lake is "never touch the original data, and accumulate refined copies stage by stage." Today we cover S3 zone structures, partitioning, and naming conventions when using Amazon S3 as data lake storage.

## Why S3 is Suitable as Data Lake Storage

S3 provides virtually unlimited capacity, 11 9's (99.999999999%) durability, and separation of compute and storage. This separation allows multiple engines like Athena, EMR, Redshift Spectrum, and Glue to read the same data simultaneously. Unlike traditional data warehouses, data lakes fill storage first and apply schema at read time (schema-on-read).

> 💡 **Related Theory**: Data lakes use schema-on-read, while data warehouses use schema-on-write. Lakes store structured/semi-structured/unstructured data in their original form and apply schema at query time.

## Zone-Based Layout: raw → clean → curated

Data lakes separate processing stages by bucket or prefix. Generally, a three-tier structure (equivalent to the medallion architecture's bronze/silver/gold concept) is used.

```text
s3://company-datalake-raw/         # Raw(Bronze) — Original as-is, immutable
  └── source=salesforce/dt=2026-06-25/...

s3://company-datalake-clean/       # Clean(Silver) — Validated, deduplicated, type-normalized
  └── domain=sales/orders/year=2026/month=06/day=25/...

s3://company-datalake-curated/     # Curated(Gold) — Business aggregations, consumed by BI/ML
  └── mart=revenue/daily_summary/year=2026/month=06/...
```

- **Raw Zone**: Store collected originals as-is. Never overwrite, serving as the single source of truth for reprocessing. Usually stored long-term with the least expensive storage class.
- **Clean Zone**: Schema validation, missing value handling, type normalization, conversion to columnar format (Parquet). Output of Glue ETL/Spark jobs.
- **Curated Zone**: Data after joins and aggregations, ready for analysis. Read directly by Athena queries, QuickSight dashboards, or ML training.

Separating zones allows different permissions per tier (e.g., Raw for data engineers only) and isolates the scope of impact during reprocessing.

## Partitioning Strategy

Partitioning divides data by key into directory structures (prefixes) to reduce scan volume during queries. When a WHERE condition contains a partition key, Athena/Spark reads only the relevant prefix (partition pruning).

```text
s3://datalake-clean/orders/year=2026/month=06/day=25/region=us-east-1/file.parquet
```

This format is **Hive-style partitioning** (`key=value`), automatically recognized by Glue crawlers and Athena.

```sql
-- Partition pruning works: only year/month/day prefixes are scanned
SELECT region, SUM(amount)
FROM orders
WHERE year = 2026 AND month = 6 AND day = 25
GROUP BY region;
```

Principles for choosing partition keys:
- **Select columns frequently used in query filters** (usually dates/times).
- **Cardinality must be appropriate**. Over-partitioning creates the small files problem, while under-partitioning removes pruning benefits.
- Dates should be divided into `year=/month=/day=` hierarchy to enable pruning at both month and day levels.

> 💡 **Related Theory**: Small files problem — when files are fragmented into tens of thousands of pieces, metadata overhead and S3 GET request costs explode. Recommended file size is 128MB–1GB per file, consolidated via Glue's `groupFiles` or compaction.

## Partition Projection

When partitions grow to tens of thousands, Glue Data Catalog lookups become a bottleneck. Athena's **partition projection** calculates partitions using rules in table properties rather than registering them in the catalog.

```sql
ALTER TABLE orders SET TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.dt.type' = 'date',
  'projection.dt.range' = '2024-01-01,NOW',
  'projection.dt.format' = 'yyyy-MM-dd',
  'storage.location.template' = 's3://datalake-clean/orders/dt=${dt}/'
);
```

Partitions are automatically recognized without a crawler, significantly reducing costs and latency.

## Naming Conventions

- Bucket names are globally unique, lowercase/hyphens only. Identify environment and domain: `acme-datalake-raw-prod`.
- Prefixes follow a consistent `domain/entity/partition` order.
- Include timestamps or UUIDs in filenames to prevent collisions: `orders_20260625_a1b2.parquet`.
- In the past, hash prefixes for request distribution were recommended. Today, S3 automatically supports 3,500 PUT / 5,500 GET per prefix per second, so prioritize readable hierarchical naming.

> 💡 **Related Theory**: S3 no longer requires hash prefixes for hot prefix distribution. Prefixes automatically scale, so use meaningful hierarchical naming.

## Columnar Format and Compression

Analysis data lakes use **Parquet/ORC** columnar format instead of row-based formats (CSV/JSON). Reading only needed columns reduces scan volume and costs; column-level compression (Snappy/ZSTD) lowers storage costs.

```bash
# Example: Upload to Clean zone after Parquet conversion (AWS CLI)
aws s3 cp ./orders.parquet \
  s3://acme-datalake-clean-prod/sales/orders/year=2026/month=06/day=25/orders.parquet
```

## Key Takeaways

- Zone separation (raw/clean/curated) preserves originals and isolates permissions and reprocessing per tier.
- Hive-style partitioning enables pruning; date hierarchy is typical.
- Avoid small files (128MB–1GB recommended), and optimize costs and performance with Parquet + compression.
- For many partitions, use partition projection to bypass catalog bottlenecks.

## 📝 Practice Questions

**Question 1.** Which zone in a data lake keeps the ingested raw data without ever modifying it and serves as the single source of truth for reprocessing?

A) Curated zone  
B) Clean zone  
C) Raw zone  
D) Sandbox zone  

**Answer: C**  
Explanation: The Raw (Bronze) zone keeps the ingested originals immutably as they are and is the source of truth for reprocessing. Clean is a validated and normalized intermediate stage, and Curated holds business aggregation results for consumption. Sandbox is not part of the standard three layers.

---

**Question 2.** Which technique makes the condition `WHERE year=2026 AND month=6` in an Athena query scan only the corresponding prefix?

A) Partition pruning  
B) Data skew  
C) Broadcast join  
D) Bucketing shuffle  

**Answer: A**  
Explanation: When the partition key appears in the WHERE condition, partition pruning works so that the engine reads only the relevant prefixes, reducing the amount scanned and the cost. The rest are concepts unrelated to partition-based scan reduction.

---

**Question 3.** What is the most appropriate problem that occurs when files in a data lake are split into tens of thousands of very small files?

A) Data durability decreases  
B) Metadata overhead and S3 request costs increase  
C) Partition pruning is disabled  
D) The schema changes automatically  

**Answer: B**  
Explanation: The small-file problem increases cost and latency due to per-file metadata processing overhead and a large number of S3 GET requests. The recommended size is 128 MB to 1 GB, and files are merged by compaction. It is not directly related to durability, schema, or pruning.

---

**Question 4.** Which Athena feature reduces catalog bottlenecks by computing partitions from rules in the table properties instead of registering partitions in the Glue Data Catalog?

A) Partition projection  
B) Crawler scheduling  
C) CTAS  
D) Workgroup isolation  

**Answer: A**  
Explanation: Partition projection computes partitions from range and format rules without registering each partition in the catalog, reducing query cost and latency in environments with a large number of partitions. A crawler is a registration approach, CTAS creates result tables, and workgroups manage cost and isolation.

---

**Question 5.** In an analytical data lake, which recommended file format reads only the needed data by column to reduce the amount scanned and has high compression efficiency?

A) CSV  
B) JSON  
C) Parquet  
D) XML  

**Answer: C**  
Explanation: Parquet (or ORC) is a columnar format that reduces scan cost by reading only the needed columns and lowers storage cost with column-level compression. CSV/JSON/XML are row-based or inefficient and are unsuitable for analytical workloads.

---
