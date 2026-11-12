# Day 1 - Amazon Redshift: Distribution and Sort Keys and Workload Optimization

## 📌 Key Takeaways

- Redshift is a columnar MPP warehouse in which the leader node plans queries and the **slices** of the compute nodes execute them in parallel. Performance comes down to "how the data is laid out across slices."
- **Distribution styles**: KEY (co-locate rows on the same slice by join key), ALL (replicate small, rarely changing dimension tables to every node), EVEN (round-robin), AUTO (the default, which changes automatically as the table grows). A skewed DISTKEY creates data skew.
- A **sort key** lets the min/max values recorded for each 1 MB block (the zone map) skip blocks that fall outside a range condition. COMPOUND suits filters on the leading columns, and INTERLEAVED suits filters on varied combinations of columns.
- **RA3** separates compute from storage, and **Spectrum** reads external tables on S3 without loading (billed by data scanned, read-only).
- **Auto WLM + concurrency scaling + SQA** is the standard answer to a burst of concurrent queries. For loading, **COPY** from multiple split files is the baseline.

## Redshift Architecture Overview

Amazon Redshift is a petabyte-scale columnar MPP (Massively Parallel Processing) data warehouse. A cluster consists of one **leader node** and several **compute nodes**.

```text
Client (SQL) ──► Leader node : parsing · query plan · result aggregation
                        │
        ┌───────────────┼───────────────┐
   Compute node 1   Compute node 2   Compute node 3
   [slice][slice] ...            ← slice = smallest unit of parallel processing
```

- The leader node plans the query, hands pieces of it to the compute nodes, and merges the intermediate results that come back.
- Each compute node is divided into several **slices**. The rows of a table are stored spread across slices, and every slice processes its own share at the same time.
- Storage is columnar. The values of one column are gathered into 1 MB blocks and compressed, so a query that aggregates "just a few columns out of hundreds of millions of rows" is fast.

> 💡 **Related Theory**: The performance of an MPP system is set by its slowest slice, because the query is not finished until every slice is finished. If data piles up on one slice (skew), the query waits for that slice even while the other slices sit idle. The goal of distribution key design is "spread evenly, but keep rows that will be joined in the same place."

## Distribution Style

This determines how the rows of a table are placed across slices.

```sql
-- KEY distribution: rows with the same value in the specified column go to the same slice
CREATE TABLE orders (
  order_id   BIGINT,
  customer_id BIGINT,
  amount     DECIMAL(12,2)
)
DISTSTYLE KEY
DISTKEY (customer_id);

-- ALL distribution: replicate the entire table to every node (for small dimension tables)
CREATE TABLE dim_region (region_id INT, region_name VARCHAR(50))
DISTSTYLE ALL;

-- EVEN distribution: spread evenly by round-robin (when the join key is unclear)
CREATE TABLE event_log (event_id BIGINT, payload VARCHAR(2000))
DISTSTYLE EVEN;
```

| Style | Placement | When it fits | Price you pay |
|------|------|------|------|
| AUTO (default) | Starts as ALL while the table is small, then changes automatically to KEY (a suitable column such as the primary key) or EVEN as it grows | Most tables | You do not control it directly |
| KEY | Rows with the same value in one column go to the same slice | Large tables that are frequently joined on the same key | Skew if the values are lopsided |
| ALL | A full copy on every node | Small dimension tables that rarely change | Storage is multiplied by the node count, and loads and updates get slower |
| EVEN | Round-robin regardless of column values | The table does not take part in joins, or KEY and ALL are hard to choose between | Redistribution at join time |

**What happens during a join** is the criterion for choosing a distribution style.

- If two tables have the **same column as their DISTKEY**, the rows to be joined are already on the same slice. This is a **co-located join**, in which no rows move across the network.
- If one side is **ALL**, every node already has a copy, so again there is nothing to move.
- Otherwise, just before the join, the rows of one table (or both) are redistributed among the slices by the join key. In `EXPLAIN`, `DS_DIST_NONE` and `DS_DIST_ALL_NONE` mean no redistribution, while `DS_BCAST_INNER` (the inner table is broadcast to all nodes) and `DS_DIST_BOTH` (both sides are redistributed) are signs of high cost.

A table has **one column** as its DISTKEY. For a fact table that joins to several tables, choose the key of the largest and most frequently joined partner, and set the remaining small dimensions to ALL.

- ALL is a better fit for a **"slowly changing table"** than for a "small table," because every write is repeated on each node. The official documentation also notes that for a very small dimension table the redistribution cost during a query is already low, so ALL gains little. On the exam, the pattern "small dimension table + eliminate join redistribution = ALL" is what gets asked.
- The work of AUTO changing the style happens in the background.

> ⚠️ **Pitfall**: Choosing a DISTKEY just because it is the join key causes skew. A column with only a few values (`status`, `country`) or with rows piled onto one value (a column that is mostly NULL, or a `customer_id` where one large customer accounts for half of the orders) makes a single slice heavy. If `skew_rows` in `SVV_TABLE_INFO` is large, change the key or switch to EVEN.

```sql
-- Check distribution style, sort key, skew, and unsorted ratio for each table
SELECT "table", diststyle, sortkey1, skew_rows, unsorted, stats_off
FROM svv_table_info
ORDER BY skew_rows DESC;
```

## Sort Key

A sort key stores rows on disk in sorted order. Redshift holds column data in **1 MB blocks** and keeps the minimum and maximum values of each block as metadata (the **zone map**). When a range condition is applied, blocks whose min–max range does not overlap the condition are skipped entirely.

```sql
CREATE TABLE sales (
  sale_date  DATE,
  region     VARCHAR(20),
  amount     DECIMAL(12,2)
)
DISTKEY (region)
COMPOUND SORTKEY (sale_date, region);
```

- If five years of data are sorted by date and you query one month, most blocks are never read. Without sorting, the values are scattered across blocks, the min–max ranges become wide, and there are no blocks left to skip.
- A zone map exists even without a sort key. What a sort key does is **gather values together so that blocks can be skipped**.

| Aspect | COMPOUND (default) | INTERLEAVED |
|------|------|------|
| Sorting | In the declared column order | Equal weight on each column |
| Conditions it helps | Filters that use the leading columns (prefix) | Any combination of the key columns |
| Conditions it does not help | Filtering on the second column alone, without the first | Tables dominated by monotonically increasing columns (dates, serial numbers) |
| Number of columns | Several | Up to 8 |
| Maintenance | `VACUUM` | `VACUUM REINDEX` (takes much longer because of an extra analysis step) |
| Recommended for | Tables with steady INSERT, UPDATE, and DELETE activity | Large tables with varied filter axes and few changes |

- If you set `SORTKEY AUTO`, Redshift looks at the query patterns and chooses the sort key. This is the default recommendation in the official documentation.
- A condition that wraps the sort key in a function (`WHERE TRUNC(sale_ts) = ...`) defeats block skipping. Compare the column as it is.
- Concurrency scaling cannot take queries on tables that have an INTERLEAVED sort key.

## RA3, Managed Storage, and Redshift Serverless

| Aspect | RA3 provisioned | Redshift Serverless | DC2 (previous generation) |
|------|------|------|------|
| Compute and storage | Separated. Data lives in Redshift Managed Storage, and the local SSD is a cache | Separated | Coupled (the node's local SSD) |
| Capacity adjustment | You choose the node type and count directly | Scales automatically in RPUs | Add nodes (storage grows with them) |
| Billing | Node hours + managed storage (GB-month, independent of node count) | RPU-hours (per second, 60-second minimum) + storage | Node hours |
| When it fits | Steady workloads, fine-grained control | Intermittent or unpredictable workloads, minimal operations | Existing clusters. In question stems, it appears as the starting point for moving to RA3 |

- The core of RA3 is that "you do not have to add compute just because storage is full." Data sharing, zero-ETL targets, and concurrency scaling for write operations require RA3 or Serverless.
- The capacity unit of Serverless is the **RPU** (1 RPU = 16 GB of memory). The default base capacity is 128 RPUs, and it can be set from 4 RPUs. When there are no queries, no compute charge is incurred. You put a cap on cost with a maximum capacity and a maximum RPU-hours limit.
- The current pricing page lists a new node type called RG alongside RA3 as the current generation. Exam materials generally explain things as RA3 versus DC2.

## Redshift Spectrum

You query **files on S3 directly as external tables** without loading the data into Redshift.

```sql
-- Spectrum external schema + join S3 data with an internal table
CREATE EXTERNAL SCHEMA spectrum_ext
FROM DATA CATALOG DATABASE 'datalake_db'
IAM_ROLE 'arn:aws:iam::123456789012:role/RedshiftSpectrumRole';

SELECT d.region, SUM(s.amount)
FROM spectrum_ext.raw_events s   -- External table on S3
JOIN dim_region d ON s.region_id = d.region_id  -- Internal Redshift table
WHERE s.dt = '2026-06-26'        -- Partition column of the external table → pruning
GROUP BY d.region;
```

- The definition of an external table lives in the Glue Data Catalog (or a Hive metastore). You use the same tables that Athena uses.
- Heavy work such as condition filtering and aggregation is pushed down to the **Spectrum layer**, which is separate from the cluster. It uses fewer cluster resources, and several clusters can query the same S3 data without copies.
- Billing is based on the **bytes scanned** (10 MB minimum per query). So, just as with Athena, partitioning, Parquet, and compression translate directly into cost.
- External tables are **read-only**. Changes such as UPDATE are not supported.
- The cluster and the bucket must be in the same Region.
- Keeping hot data in Redshift and large, older history on S3 + Spectrum, and combining them in a view, is the **lakehouse** pattern.

| Decision | Load into Redshift | Query with Spectrum | Athena |
|------|------|------|------|
| Access frequency | Frequent, repeated | Occasional, historical | Intermittent ad hoc |
| Performance | Fastest (distribution and sort keys) | Depends on file format and partitions | Depends on file format and partitions |
| Billing | Cluster/RPU | Data scanned + cluster | Data scanned only |
| Prerequisite | A loading pipeline | Redshift already exists | No infrastructure |
| Typical clue | "A repeating dashboard of complex joins" | "Join warehouse data with S3 history" | "Query S3 with SQL without a cluster" |

## WLM, Concurrency Scaling, and SQA

**Workload management (WLM)** puts queries into queues and divides resources among the queues.

| Aspect | Auto WLM (recommended, default) | Manual WLM |
|------|------|------|
| Concurrency and memory | Redshift adjusts dynamically by looking at what each query requires | You fix the slot count and memory percentage for each queue |
| Queues | Up to 8, each with a **priority** | Up to 8 user queues, with a total of at most 50 slots |
| When a heavy query arrives | Lowers the number of concurrent queries and concentrates memory | Uses only the memory fixed to the slot (spills to disk if short) |
| Tuning levers | Priority, query monitoring rules | Slot count, memory %, query monitoring rules |

- The default queue of manual WLM starts with a concurrency of 5. When you increase the slots, memory per slot drops, and a query that used to finish in memory now writes intermediate results to disk and slows down. This is the cause behind "I raised concurrency and it got slower."
- A query is assigned to a queue by **user group** or by a **query group label** (`SET query_group TO 'critical_dashboards';`).
- **Query monitoring rules (QMR)**: a query whose metrics, such as run time or rows scanned, exceed a threshold is logged or aborted, or, under manual WLM, moved to another queue (hop), or, under auto WLM, has its priority changed. It is a safeguard against runaway queries. The queue-level WLM timeout is no longer recommended and is replaced by QMR.
- **SQA (Short Query Acceleration)**: handles queries expected to finish quickly ahead of long ones rather than lining them up behind them. It removes the need to create a separate queue just for short queries.

**Concurrency scaling** automatically attaches temporary clusters when queries pile up in a queue, and runs the waiting queries there.

- Turn on the concurrency scaling mode of the WLM queue as `auto`. The number of clusters that can be attached is set by `max_concurrency_scaling_clusters` (default 1).
- It supports not only read queries but also **write operations** such as COPY, INSERT, DELETE, UPDATE, and CTAS (writes on the RA3 family only).
- Billing covers only the time the temporary clusters actually ran queries, per second. For every day the main cluster is running, it accrues **1 hour of free credit**, accumulating up to 30 hours. That is why a short peak that hits once a day is usually absorbed at no extra cost.
- Queries it cannot accept: queries on tables with an INTERLEAVED sort key, temporary tables, queries that use Python or Lambda UDFs, and writes to DISTSTYLE ALL tables.

Concurrency scaling is a model of "leave the storage and the main cluster as they are, and borrow only processing capacity for a short time." It fits **short, periodic bursts** such as a dashboard refresh every morning. If the queue is full all day long, that is not a burst but a capacity shortage, so you resize the cluster or fix the query and key design.

## Loading: Using COPY Properly

```sql
COPY sales
FROM 's3://acme-datalake-curated/sales/2026/06/'
IAM_ROLE 'arn:aws:iam::123456789012:role/RedshiftCopyRole'
FORMAT AS PARQUET;
```

- COPY is a **parallel load** in which the slices divide up and read the S3 files. Repeating single-row INSERTs is an anti-pattern.
- For **splittable files** (uncompressed CSV, Parquet, ORC), Redshift automatically splits them and reads them in parallel when they are 128 MB or larger.
- **Files that cannot be split** (gzip-compressed CSV, JSON, and so on) must be split by you. Make them similar in size, 1 MB to 1 GB after compression, and make the number of files a **multiple of the number of slices**. One large gzip file is read by a single slice alone, which makes the load serial.
- Listing the files to load explicitly in a manifest file avoids stray files that happen to share the prefix.
- When you COPY into an empty table for the first time, `COMPUPDATE` selects the compression encoding of each column automatically.
- The reverse direction is `UNLOAD`. It exports query results to S3 in parallel (Parquet and partitioning can be specified).

## Maintenance and Other Optimizations

| Task | What it does | Automation |
|------|------|------|
| `VACUUM` | Reclaims space from rows marked as deleted and re-sorts the unsorted region | Automatic delete reclamation and automatic sorting in the background |
| `ANALYZE` | Refreshes statistics for the optimizer | Automatic ANALYZE |
| Materialized view | Pre-stores the results of repeated joins and aggregations | Automatic refresh, with incremental refresh when conditions allow |
| Result caching | Reuses the results of an identical query | Default behavior |

- UPDATE and DELETE do not remove rows immediately; they only mark them as deleted. If disk usage does not shrink and scans are slow after a large delete, it is because VACUUM has not run yet.
- When statistics are stale (a large `stats_off`), the optimizer picks the wrong join order and distribution method. Check the statistics after a bulk load.
- A materialized view can also be built on top of a Spectrum external table, which reduces the cost of scanning S3 every time. **Streaming ingestion**, which pulls directly from Kinesis Data Streams or MSK, is also implemented with a materialized view.

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| A large-table join is slow and `DS_DIST_BOTH`/`DS_BCAST_INNER` appears | Join key and distribution key do not match | Give both sides the same DISTKEY, and make the small side ALL |
| Only one node has high disk or CPU | DISTKEY skew | Change to an evenly distributed key, or use EVEN |
| A date range query reads every block | No sort key, large unsorted region, or a function applied to the column | Make the date the first sort key column, VACUUM, fix the condition expression |
| Queries wait in the queue every morning | Burst of concurrent queries | Concurrency scaling, SQA |
| One query monopolizes the cluster | Runaway query | Abort it with QMR or lower its priority |
| After adding slots, queries spill to disk and slow down | Memory per slot decreased in manual WLM | Auto WLM |
| COPY is slow | One large gzip file | Split into multiple files (a multiple of the slice count) |
| Still slow after a large delete and the space is unchanged | Rows marked as deleted remain | VACUUM |
| You keep adding nodes just for storage | The coupled structure of DC2 | RA3, or move older data to S3 + Spectrum |

## Question Clue → Answer Lookup Table

| Clue in the question | Answer |
|------|------|
| "Two large tables are frequently joined on the same column; eliminate redistribution" | Make that column the DISTKEY on both sides |
| "Join between a small dimension table and a large fact table" | DISTSTYLE ALL on the dimension table |
| "Most queries are date range lookups" | Date as the first column of a COMPOUND SORTKEY |
| "The filter varies across many columns" | INTERLEAVED SORTKEY |
| "Grow storage but keep compute the same" | RA3 (managed storage) |
| "Join historical data on S3 with warehouse tables without loading" | Redshift Spectrum |
| "Concurrent queries pile up and wait only at certain hours" | Concurrency scaling |
| "Short queries wait behind long ones" | SQA |
| "Automatically abort queries that run longer than a set time" | Query monitoring rules |
| "Usage is intermittent, and the team does not want to manage a cluster" | Redshift Serverless |
| "Load a large number of files from S3 as fast as possible" | COPY from multiple split files |
| "Shorten the response time of repeated heavy aggregations" | Materialized view |

Tomorrow we cover Athena, which queries S3 with SQL without a cluster, and its cost structure.

## 📖 Glossary

- **MPP**: An architecture that splits data across several nodes and processes it at the same time. Massively Parallel Processing.
- **Slice**: The unit of parallel processing into which a compute node is divided. The rows of a table are stored per slice.
- **Distribution key (DISTKEY)**: The column that decides which slice a row is placed on. Rows with the same value go to the same slice.
- **Co-located join**: A join in which the rows to be joined are already on the same slice, so it runs without redistribution.
- **Skew**: A state in which data is concentrated on some slices. That slice slows down the whole query.
- **Zone map**: The minimum and maximum values recorded for each block. It is used to skip blocks that do not overlap the condition.
- **Redshift Managed Storage (RMS)**: The managed storage, separated from compute, that RA3 and Serverless use.
- **RPU**: The capacity unit of Redshift Serverless. You are billed for the RPU-hours used.
- **WLM**: The workload management feature that divides queries into queues and allocates concurrency and memory.
- **External table**: A table whose data is on S3 and only whose definition is in the catalog. Spectrum reads it.

## 📝 Practice Questions

**Question 1.** When two large tables are frequently joined on customer_id, which setting is the most appropriate for performing the join without network redistribution (a co-located join)?

A) DISTSTYLE EVEN for both tables  
B) Specify customer_id as the DISTKEY for both tables  
C) DISTSTYLE ALL for both tables  
D) Specify customer_id as the SORTKEY for only one table  

**Answer: B**  
Explanation: With the same DISTKEY (customer_id), identical key values are located on the same slice, so the join happens without redistribution. EVEN causes redistribution, ALL on large tables causes a surge in storage and write cost, and SORTKEY is for sorting and unrelated to distribution.

---

**Question 2.** Which distribution style is the most appropriate for eliminating redistribution when joining a small dimension table with a large fact table?

A) DISTSTYLE ALL  
B) DISTSTYLE EVEN  
C) DISTSTYLE KEY (based on the fact key)  
D) No distribution style specified  

**Answer: A**  
Explanation: ALL distribution replicates the small table to all nodes, eliminating data movement during joins. It is unsuitable for large tables because of cost, but ideal for small dimension tables. EVEN/KEY can cause redistribution.

---

**Question 3.** Which Redshift feature queries external tables stored in S3 directly, without loading the data into the cluster, and is billed based on the amount of data scanned?

A) Concurrency Scaling  
B) Materialized view  
C) Redshift Spectrum  
D) Auto WLM  

**Answer: C**  
Explanation: Redshift Spectrum uses the Glue Data Catalog as its metastore to query external tables in S3 directly and is billed by the amount scanned. Concurrency Scaling expands read concurrency, materialized views are pre-aggregation, and WLM is queue management.

---

**Question 4.** Which option most accurately describes how sort keys and zone maps improve query performance?

A) They replicate data to all nodes to eliminate joins  
B) They classify queries into a short queue for priority handling  
C) They automatically choose column encodings  
D) They record the minimum/maximum values of each block so blocks unrelated to the range condition are skipped  

**Answer: D**  
Explanation: When data is stored sorted by the sort key and the min/max of each block is recorded in the zone map, entire blocks irrelevant to a range filter are skipped, reducing the amount scanned. A describes ALL distribution, B describes SQA, and C describes compression encoding.

---

**Question 5.** Every early morning, dashboard refreshes cause read queries to spike temporarily and queue wait times grow long. Which feature is the most appropriate for reducing the wait while minimizing additional cost?

A) Switch to DC2 nodes  
B) Enable Concurrency Scaling  
C) Change all tables to DISTSTYLE ALL  
D) Change to an INTERLEAVED sort key  

**Answer: B**  
Explanation: Concurrency Scaling automatically spins up temporary clusters during read spikes to eliminate queue waits and charges only for what is used (with some free credits). Switching to DC2 loses the benefits of decoupled architecture, and changing to ALL/INTERLEAVED is unrelated to solving the concurrency problem.

---
