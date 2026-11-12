# Day 2 - Amazon Athena: Serverless Queries and Cost Optimization

Amazon Athena is a **serverless** analytics service querying data on S3 with standard SQL. No infrastructure to provision; billed on scanned data volume. Today we cover partition and format optimization, CTAS, federated queries, and cost savings.

## Athena Operating Model

Athena runs on Presto/Trino engine (Athena Engine v3) and uses **Glue Data Catalog** as metastore. Tables are just metadata pointing to S3 locations; data is not separately loaded (schema-on-read).

```sql
-- External table definition pointing to S3 path
CREATE EXTERNAL TABLE orders (
  order_id BIGINT,
  amount   DOUBLE,
  status   STRING
)
PARTITIONED BY (dt STRING)
STORED AS PARQUET
LOCATION 's3://datalake-clean/orders/';
```

> 💡 **Related Theory**: Athena bills per TB scanned. Thus cost = performance = "scan as little as possible." Partitioning, columnar format, and compression simultaneously drive costs and speed.

## Partition Optimization

Adding partition key to WHERE scans only that prefix (partition pruning).

```sql
-- Load partition metadata (auto-recognized if Hive-style)
MSCK REPAIR TABLE orders;

-- Or add individual partition
ALTER TABLE orders ADD PARTITION (dt='2026-06-26')
LOCATION 's3://datalake-clean/orders/dt=2026-06-26/';

-- Pruning works: only dt prefix scanned
SELECT status, COUNT(*) FROM orders
WHERE dt = '2026-06-26' GROUP BY status;
```

With tens of thousands of partitions, `MSCK REPAIR` or catalog lookup becomes a bottleneck. Use **partition projection** to calculate partitions via rules without catalog registration.

```sql
ALTER TABLE orders SET TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.dt.type' = 'date',
  'projection.dt.range' = '2024-01-01,NOW',
  'projection.dt.format' = 'yyyy-MM-dd',
  'storage.location.template' = 's3://datalake-clean/orders/dt=${dt}/'
);
```

## Format and Compression Optimization

- **Columnar format (Parquet/ORC)**: Read only needed columns, massively reduce scan volume. Superior cost and speed to CSV/JSON.
- **Compression (Snappy/ZSTD/GZIP)**: Reduce S3 storage and scan volume. Parquet defaults to Snappy.
- **File size**: 128MB–1GB recommended. Many small files increase metadata and request overhead.

```sql
-- SELECT only needed columns → reduce scan in columnar format
SELECT order_id, amount FROM orders WHERE dt = '2026-06-26';
-- SELECT * scans all columns; avoid it
```

> 💡 **Related Theory**: Same data, CSV→Parquet+Snappy alone cuts scan volume several to dozens of times, proportionally reducing Athena costs. Combined with column projection (needed columns only), effect doubles.

## CTAS and INSERT INTO

**CTAS (CREATE TABLE AS SELECT)** materializes query results to new S3 table. Use for format conversion, partitioning, and materialized aggregations.

```sql
-- Convert CSV original to partitioned Parquet (ETL replacement)
CREATE TABLE orders_parquet
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt'],
  external_location = 's3://datalake-clean/orders_parquet/'
) AS
SELECT order_id, amount, status, dt
FROM orders_raw_csv;
```

For large volumes, use `INSERT INTO ... SELECT` splits due to CTAS's 100-partition limit. CTAS is a powerful lightweight ETL tool for Athena without Glue.

## Federated Queries

Athena can join S3 data with other sources (RDS, DynamoDB, Redshift, CloudWatch, JDBC, etc.) via **data source connectors (Lambda-based)** in single SQL.

```sql
-- Federate join S3 order data with RDS customer master
SELECT o.order_id, c.customer_name, o.amount
FROM s3_catalog.sales.orders o
JOIN rds_postgres.public.customers c
  ON o.customer_id = c.customer_id
WHERE o.dt = '2026-06-26';
```

Connectors run on Lambda; deploy and register per source. Useful for analyzing heterogeneous sources without data movement (ETL).

## Workgroups and Cost Control

**Workgroup** isolates queries by team/purpose and controls costs.

- **Per-query data scan limit**: Auto-cancel queries exceeding threshold.
- **Per-workgroup result location, encryption** settings.
- **CloudWatch metrics** track workgroup scan volume and cost.

```sql
-- Set per-workgroup scan limit to block runaway queries
-- (set BytesScannedCutoffPerQuery in console/CLI)
```

## Key Takeaways

- Athena is serverless + scan-based billing → less scan = cheaper and faster.
- Partitioning + projection + Parquet/compression + SELECT needed columns = core cost savings.
- CTAS/INSERT INTO perform lightweight ETL (format conversion, partitioning) in Athena only.
- Federated queries join RDS/DynamoDB, etc. without ETL.
- Workgroup manages scan limit, cost, and isolation.

## 📝 Practice Questions

**Question 1.** Which combination is the most effective for reducing Athena cost?

A) Use SELECT * + CSV format  
B) Partitioning + Parquet + compression + SELECT only the needed columns  
C) Store all data as a single large file  
D) Join all sources every time with federated queries  

**Answer: B**  
Explanation: Athena charges by the amount scanned, so partition pruning, columnar Parquet, compression, and column projection directly reduce the amount scanned and improve both cost and speed. SELECT * and CSV increase the amount scanned, a single huge file harms parallelism, and overusing federation is inefficient regardless of cost.

---

**Question 2.** What is the most appropriate way to convert a CSV source into a partitioned Parquet table in Athena?

A) MSCK REPAIR TABLE  
B) ALTER TABLE ADD PARTITION  
C) CREATE TABLE AS SELECT (CTAS)  
D) Federated query  

**Answer: C**  
Explanation: CTAS materializes the query result into a new S3 table with the specified format (Parquet), compression, and partitions, performing lightweight ETL. MSCK/ADD PARTITION manage partition metadata, and federated queries are for joining heterogeneous sources.

---

**Question 3.** What is the most appropriate solution when there are tens of thousands of partitions and MSCK REPAIR and Glue catalog lookups have become a bottleneck?

A) Enable partition projection  
B) Apply DISTSTYLE ALL  
C) Set a workgroup scan limit  
D) Use CSV instead of ORC  

**Answer: A**  
Explanation: Partition projection computes partitions from range and format rules without registering them in the catalog, eliminating the lookup bottleneck in environments with a large number of partitions. DISTSTYLE is a Redshift concept, workgroup limits are cost control, and switching to CSV actually increases the amount scanned.

---

**Question 4.** How can you join order data in S3 with the customer master in RDS PostgreSQL in a single SQL statement without moving the data?

A) Redshift COPY command  
B) Athena federated query (data source connector)  
C) Glue crawler  
D) DynamoDB Streams  

**Answer: B**  
Explanation: Athena federated queries use Lambda-based data source connectors to join heterogeneous sources such as RDS and DynamoDB with S3 data in the same SQL. COPY is for loading, a crawler is for schema inference, and Streams is for change capture.

---

**Question 5.** What do you use in Athena to prevent a runaway query from a particular team from scanning a huge amount of data at once?

A) Materialized view  
B) Concurrency Scaling  
C) The per-query data scan limit of a workgroup (BytesScannedCutoffPerQuery)  
D) MSCK REPAIR TABLE  

**Answer: C**  
Explanation: Setting a per-query data scan limit on a workgroup automatically cancels queries that exceed the threshold, preventing cost overruns. Concurrency Scaling is a Redshift feature, MSCK is partition management, and a materialized view is pre-aggregation.

---
