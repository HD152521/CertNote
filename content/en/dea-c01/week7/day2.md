# Day 2 - Amazon Athena: Serverless Queries and Cost Optimization

## 📌 Key Takeaways

- Athena is a serverless service that queries data on S3 directly with SQL, and it bills by the **amount of data scanned**. The less it reads, the cheaper and faster it is.
- There are three ways to reduce the scan volume: **partitions** (only the needed paths), **columnar format + compression** (only the needed columns, and smaller), and **query writing** (no `SELECT *`, filter on the partition key).
- **CTAS / INSERT INTO** write query results as Parquet or partitioned tables, standing in for light ETL. At most 100 partitions can be written at once.
- **Federated queries** use data source connectors to join sources outside S3, such as RDS, DynamoDB, and Redshift, with the same SQL. They are read-only.
- The **workgroup** is the unit of cost control. The per-query scan limit **cancels** queries that exceed it, while the workgroup-wide limit only sends an **alert**.

## How Athena Works

Amazon Athena has no infrastructure to provision. When you submit a query, Athena runs a Trino-based engine (engine version 3) on your behalf.

```sql
-- Define an external table that points to an S3 path
CREATE EXTERNAL TABLE orders (
  order_id BIGINT,
  amount   DOUBLE,
  status   STRING
)
PARTITIONED BY (dt STRING)
STORED AS PARQUET
LOCATION 's3://datalake-clean/orders/';
```

- A table is nothing more than **metadata in the Glue Data Catalog**. No data is loaded (schema-on-read). Even if you run `DROP TABLE`, the files on S3 remain.
- Query results are saved as files in the **S3 result location** you specify. Storage charges accumulate on the result bucket too, so set a lifecycle expiration rule.
- Queries run within the account's concurrent query quota, and wait if they exceed it. DML queries have an execution time limit.

### Billing Structure

| Item | Details |
|------|------|
| Basic unit | Amount of data the query scanned (per TB). Compressed files are counted at their **compressed size** |
| Minimum charge | 10 MB per query |
| DDL | DDL such as `CREATE TABLE` and `ALTER TABLE ADD PARTITION` involves no scan and is not billed |
| Canceled queries | Billed for what was scanned up to the point of cancellation |
| Accompanying costs | S3 storage and requests, the Glue Data Catalog, Lambda invocations for federated queries |
| Alternative pricing | Provisioned capacity (reserve DPUs and pay per hour, with no per-scan charge) |

- The charge is for the **amount read**, not the execution time. A query that took 10 minutes can be cheaper than one that took 1 second.
- If you need predictable cost and concurrency control regardless of scan volume, attach provisioned capacity to the workgroup.

> 💡 **Related Theory**: In Athena, cost optimization and performance optimization point the same way, because both come down to "reading less from S3." In a service such as Redshift where compute is reserved in advance, the bill stays the same no matter how frugal the queries are, but with Athena the bill shrinks in proportion to the queries you fix.

## Three Layers for Reducing Scan Volume

Even for the same question, the amount read varies greatly with the shape of the data. Take a query that sums two columns over one day of orders as an example.

| Data shape | Range Athena reads |
|------|------|
| CSV, no partitions | Every byte of the whole table |
| CSV + gzip | The whole table (at compressed size). A single file cannot be split for reading, so parallelism also drops |
| CSV, date partitions | All columns under that date prefix |
| Parquet, date partitions | Only **the two needed columns** under that date prefix |
| Parquet (sorted), date partitions + an extra filter | On top of the above, skips the ranges that the min/max statistics rule out |

### ① Partitions

```sql
-- Load partition metadata (when the paths are Hive-style)
MSCK REPAIR TABLE orders;

-- Or add an individual partition
ALTER TABLE orders ADD PARTITION (dt='2026-06-26')
LOCATION 's3://datalake-clean/orders/dt=2026-06-26/';

-- Pruning works: only the dt prefix is scanned
SELECT status, COUNT(*) FROM orders
WHERE dt = '2026-06-26' GROUP BY status;
```

- `MSCK REPAIR TABLE` scans S3 and only **adds** partitions. It does not remove partitions that were deleted, and when there are many partitions it can take a long time and time out, ending with only some of them registered. For adding one partition every day, `ALTER TABLE ADD PARTITION` is the right tool.
- When there are tens of thousands of partitions, the catalog lookup becomes the bottleneck. **Partition projection** computes partitions from a rule without registering them.

```sql
ALTER TABLE orders SET TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.dt.type' = 'date',
  'projection.dt.range' = '2024-01-01,NOW',
  'projection.dt.format' = 'yyyy-MM-dd',
  'storage.location.template' = 's3://datalake-clean/orders/dt=${dt}/'
);
```

- Athena handles up to 10 million partitions in a Glue table, but a **single scan can read at most 1 million partitions**. This is why a query with no partition condition fails on a very large table.

### ② Format and Compression

- **Parquet/ORC**: Reads only the needed columns and skips ranges using the statistics inside the file. If the files are too small, the format overhead cancels out the benefit, so aim for 128 MB or larger.
- **Compression**: Scan volume is counted at the compressed size, so compression is a discount in itself. gzip has a good compression ratio and broad compatibility, and zstd balances speed and compression ratio well.
- When you compress text (CSV, JSON), most codecs force the file to be read from the beginning, so **a single file cannot be split and read in parallel.** In that case the number of files is the upper bound on parallelism. Parquet/ORC are divided into internal units, so they are read in parallel even when compressed.

### ③ Query Writing

```sql
-- SELECT only the needed columns → reduces scan volume in a columnar format
SELECT order_id, amount FROM orders WHERE dt = '2026-06-26';
-- SELECT * scans every column, so avoid it
```

- `LIMIT` does not guarantee a smaller scan. When a sort or aggregation is involved, it reads everything and then trims.
- **Equality conditions** work best on partition keys. When every partition key has an equality condition, the metadata is fetched directly.
- Before running, use `EXPLAIN` to see which partitions are targeted, and after running, check the amount actually read with `EXPLAIN ANALYZE` or the "data scanned" figure in the query statistics.

> 💡 **Related Theory**: Converting CSV to Parquet + compression applies "column projection (only the needed columns)," "compression (values of the same type sit together and shrink well)," and "statistics-based skipping" all at once. That is why format conversion is the first card played on an Athena cost problem. Partitions come next, and query fixes are layered on top.

## CTAS and INSERT INTO

**CTAS (CREATE TABLE AS SELECT)** writes query results to a new S3 location and registers it as a table.

```sql
-- Convert the CSV source into partitioned Parquet
CREATE TABLE orders_parquet
WITH (
  format = 'PARQUET',
  write_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt'],
  external_location = 's3://datalake-clean/orders_parquet/'
) AS
SELECT order_id, amount, status, dt   -- the partition column goes at the very end of the SELECT list
FROM orders_raw_csv
WHERE dt BETWEEN '2026-06-01' AND '2026-06-30';
```

| Item | Details |
|------|------|
| Result format | PARQUET (default), ORC, AVRO, JSON, TEXTFILE |
| Default Parquet compression | GZIP. Specify `write_compression` if you want Snappy or ZSTD |
| Partition column position | Put it **last** in the SELECT list |
| `external_location` | Must be an **empty** location. Athena does not overwrite existing data |
| Partition limit | 100 partitions written at once |
| Bucketing | Specified with `bucketed_by` and `bucket_count` |
| `ORDER BY` | An ORDER BY used in the SELECT of a CTAS is ignored |

- For a conversion with more than 100 partitions, create the first range with CTAS and append the rest range by range with `INSERT INTO ... SELECT`.
- If a CTAS or INSERT INTO fails or is canceled, **partially written files may be left behind** at the target location. The next query reads those files too, so they must be cleaned up. If you need atomic writes, use an Iceberg table.
- CTAS replaces a Glue job when "the transformation logic can be handled in SQL and it is a one-off or periodic batch." If you need complex transformations, a continuous large-volume pipeline, or fine-grained retries, use Glue or EMR.

| Method | When it fits |
|------|------|
| Athena CTAS / INSERT INTO | Format conversion or saving aggregate results that SQL can handle, serverless and simple |
| Athena view | Reuse a query without writing data |
| Glue ETL | Complex transformations, schema handling, incremental loads based on bookmarks |
| Iceberg table + `MERGE INTO` | Row-level updates and deletes, atomic commits |

## Federated Query

Through a **data source connector**, you query and join sources outside S3 (RDS and Aurora, DynamoDB, Redshift, CloudWatch Logs, OpenSearch, other JDBC sources, and so on) with the same SQL.

```sql
-- Join order data on S3 with the customer master in RDS
SELECT o.order_id, c.customer_name, o.amount
FROM awsdatacatalog.sales.orders o
JOIN rds_postgres.public.customers c
  ON o.customer_id = c.customer_id
WHERE o.dt = '2026-06-26';
```

- Athena calls the connector, decides the range to read, manages parallelism, and pushes the filter conditions down to the source (predicate pushdown).
- Connectors have traditionally been deployed as **Lambda functions** in the user's account. As a result, Lambda invocation charges apply separately, and execution is bound by Lambda limits. More recently, connectors that work through a Glue connection without Lambda are also offered for some sources, but exam materials explain it on the basis of Lambda.
- It is **read-only**. `INSERT INTO` is not supported on a federated source. However, reading through federation and writing to S3 with CTAS does work (a source → lake extraction pipeline).
- Because real queries go out to the source being joined, there is **load on the production database**. If you repeat large joins, it is better to point at a read replica or move the data into the lake.

| Decision | Federated query | Move data into the lake (ETL, zero-ETL) |
|------|------|------|
| Frequency | Occasional, exploratory | Repeated, regular reports |
| Data freshness | Always current (reads the source directly) | Delayed by the load interval |
| Performance | Tied to the source's speed and the connector | Benefits of columnar format and partitions |
| Source load | Incurred on every query | Only at load time |

## Workgroups and Cost Control

A **workgroup** is a unit for dividing query execution by team or purpose. The result location, encryption, engine version, and cost controls are attached to the workgroup.

| Control | Target | When the limit is exceeded |
|------|------|------|
| Per-query data usage limit | Scan volume of a single query (can be set from a minimum of 10 MB) | The query is **canceled**. What was scanned before cancellation is billed |
| Workgroup-wide data usage alert | Total scan volume of the workgroup over a period | CloudWatch alarm → SNS **notification**. It does not block queries automatically |

- Only **one** per-query limit can be set on a workgroup, whereas the workgroup-wide alert can be set with several thresholds.
- To actually block at the workgroup-wide limit, you build it yourself, for example by connecting a Lambda to the SNS notification to **disable** the workgroup.
- If you let the workgroup settings **override client-side settings**, users cannot change the result location or encryption. This is how you enforce result encryption.
- Divide IAM permissions by workgroup, and view usage per team with CloudWatch metrics and cost allocation tags.

```bash
# Create a workgroup with a per-query scan limit of 10 GB
aws athena create-work-group \
  --name analysts \
  --configuration '{
    "ResultConfiguration": {"OutputLocation": "s3://acme-athena-results/analysts/"},
    "EnforceWorkGroupConfiguration": true,
    "PublishCloudWatchMetricsEnabled": true,
    "BytesScannedCutoffPerQuery": 10737418240
  }'
```

### Query Result Reuse

When the same query is repeated, you can let it **reuse the previous result**. When a result is reused, no scan takes place.

- It applies within the same workgroup, when the query string matches and the previous result has not expired.
- If you do not specify a maximum age, it is 60 minutes, and the maximum you can specify is 7 days.
- It does not check whether the source data has changed. Within the age limit, **stale results may be returned.**
- It does not apply to tables in locations registered with Lake Formation or to tables with row or column permissions applied.

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Small result but the scan volume is the whole table | No partition key condition, row-based format | Filter on the partition key, convert to Parquet |
| `LIMIT 10` but it is expensive | Full scan because of sorting or aggregation | Add a partition condition |
| New data is not returned | Partition not registered | `ALTER TABLE ADD PARTITION`, projection |
| `MSCK REPAIR TABLE` never finishes | Too many partitions | Switch to `ADD PARTITION` or projection |
| CTAS fails with a partition count error | More than 100 at once | Split into ranges with CTAS + INSERT INTO |
| CTAS fails with "data exists at the location" | `external_location` is not empty | Specify a new prefix or delete the existing files |
| Queries keep getting canceled | The workgroup's per-query limit exceeded | Optimize the query or adjust the limit |
| Result bucket charges keep growing | Accumulated result files, multipart fragments from failed queries | Lifecycle expiration and incomplete multipart cleanup rules |
| Federated query is slow and the production DB slows down | Large queries directly against the source | Read replica, load into the lake |
| `SlowDown` error | Too many small files, concurrent queries | Compact files |

## When to Choose Athena and When Not To

| Requirement | Suitable service |
|------|------|
| Occasional SQL on S3 data with no infrastructure | Athena |
| Repeating dashboards with second-level response, and complex multi-joins all the time | Redshift |
| Redshift already exists and S3 history must be joined with warehouse tables | Redshift Spectrum |
| Large-scale transformations that take hours, custom code | Glue ETL / EMR |
| Interactive analysis with Spark code, serverless | Athena for Apache Spark |
| Millisecond lookups by a single key | DynamoDB (not Athena) |

## Question Clue → Answer Lookup Table

| Clue in the question | Answer |
|------|------|
| "Reduce Athena query costs" | Convert to Parquet/ORC + compression + partitioning + only the needed columns |
| "CSV to partitioned Parquet, with no infrastructure" | CTAS |
| "Tens of thousands of partitions; eliminate the registration work" | Partition projection |
| "Join S3 data with RDS or DynamoDB without moving data" | Federated query |
| "Prevent a single query from scanning excessively" | The workgroup's per-query data usage limit |
| "Separate queries, cost, and result location by team" | Workgroup |
| "Notify me when the monthly scan volume exceeds a threshold" | Workgroup-wide data usage alert (CloudWatch + SNS) |
| "The same dashboard query runs repeatedly" | Query result reuse |
| "All query results must be encrypted" | Enforce workgroup settings (override client-side settings) |
| "Row-level UPDATE and DELETE in Athena" | Iceberg tables |

Tomorrow we cover DynamoDB, an operational store rather than an analytics engine, from the viewpoint of key design and change capture that data engineers need to know.

## 📖 Glossary

- **Serverless**: A model in which you do not launch or manage servers in advance, and resources are used only as requested.
- **Scan volume**: The number of bytes a query actually read from S3. It is Athena's billing basis.
- **External table**: A table whose data stays on S3 and only its location and schema are registered in the catalog.
- **Column projection**: Reading only the columns a query needs. It is effective only with columnar formats.
- **CTAS**: `CREATE TABLE AS SELECT`. Writes query results to a new location and registers it as a table.
- **Federated query**: A feature that queries sources outside S3 with Athena SQL through data source connectors.
- **Predicate pushdown**: An optimization that sends the WHERE condition down to the source so that the source filters before returning results.
- **Workgroup**: A unit for dividing query execution. The result location, encryption, scan limits, and metrics are attached to it.
- **Query result reuse**: A feature that returns the previous result of the same query again for a set period of time.
- **Provisioned capacity**: An Athena pricing model that bills for the usage time of reserved processing capacity (DPUs) instead of scan volume.

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
