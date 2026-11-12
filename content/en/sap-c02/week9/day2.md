# Day 2 - Redshift Deep Dive: MPP Internal Operations, RA3 Storage Separation, Spectrum and Zero-ETL

The most common question from engineers new to data warehousing is: "Why can't we just scale up PostgreSQL?" The truth is Redshift was forked from PostgreSQL 8.0.2, and SQL syntax is nearly identical. However, a single PostgreSQL instance takes minutes or hours on analytical queries with `GROUP BY` and `JOIN` over hundreds of millions of rows. Redshift completes the same query in seconds. The difference is not the SQL engine but the **storage structure (columnar orientation) and execution architecture (MPP, distributed)**. Understanding Redshift means understanding "how data is scattered across nodes and slices, and how queries are executed in parallel on top of that."

In SAP-C02 exams, Redshift scenarios focus on architecture and operations: "network shuffle exploding due to wrong distribution keys," "migrating from DC2 storage limits to RA3," "unifying data lake and warehouse via Spectrum for a lakehouse," "analyzing operational databases without ETL via Zero-ETL." Today we'll dissect how Redshift works internally, why it's designed that way, and build intuition for solving these scenarios.

## Why MPP — The Scale a Single-Node RDBMS Cannot Reach

Traditional RDBMs (OLTP databases) optimize for fast reads and writes of a small number of rows per transaction. B-tree indexes find specific rows in O(log n), and row-oriented storage fetches all columns of one record at once. This works perfectly for "lookup order ID 12345." But analytical queries show the opposite pattern: "total monthly sales by region for the past 3 years" reads all rows but needs only a few columns (amount, region), returning small aggregated results.

Redshift addresses this OLAP pattern two ways. First, **columnar storage** reads only the amount/region columns from disk, skipping others. Second, **MPP (Massively Parallel Processing)** distributes data across multiple nodes and executes queries simultaneously on all of them. Instead of one node processing 100 million rows, 10 nodes each process 10 million rows in parallel, reducing execution time 10-fold.

Redshift's cluster architecture is **Leader Node + Compute Nodes**. The Leader Node receives client SQL, builds an execution plan, compiles it to C++ code, and distributes it to each Compute Node. Compute Nodes execute that code on their local data chunk and return intermediate results to the Leader for final aggregation. Each Compute Node further divides into **Slices** (2–16 depending on node type), the smallest parallelizable unit where data is distributed.

> 💡 **Related Theory**: Redshift's MPP is the cloud implementation of the shared-nothing architecture established by Teradata and Greenplum in the 1980s–90s. In shared-nothing, each node owns its disk, memory, and CPU, sharing nothing with others—adding nodes scales throughput nearly linearly. Contrast this with shared-disk (Oracle RAC), where all nodes share disk, creating lock contention bottlenecks. Redshift chose shared-nothing because analytical workloads fit the map-reduce pattern: "each node independently processes its data, then merge." RA3 slightly alters this principle (covered later).

> 🔍 **Deep Dive**: Redshift **compiles queries to C++** before execution. This is an interesting design choice. Most databases interpret execution plans operator-by-operator (Volcano model). Redshift generates and compiles custom C++ code per query, achieving native speed. The downside: first-time queries incur compilation overhead (hundreds of ms to seconds). To mitigate, Redshift caches compiled code in a shared cluster cache, so identical query patterns execute immediately on subsequent runs without recompilation. This doesn't appear directly on exams, but it explains why "the first query is unusually slow."

## Distribution Styles (DISTSTYLE) — Data Placement Determines Performance

The biggest performance variable in Redshift is **distribution key**. How data splits across slices determines inter-node data movement (shuffle) during joins and aggregations. Shuffling crosses the network, the most expensive operation. Good distribution design minimizes this shuffle.

**DISTSTYLE KEY**: Hash the specified column to scatter data across slices. If two tables use the same key (co-location), equal keys land on the same slice, enabling local joins without inter-node movement. For example, if orders and order_items both distribute by order_id, the join happens within each slice.

**DISTSTYLE ALL**: Replicate the entire table on all nodes. Ideal for small dimension tables (country codes, categories). Large fact tables join these dimension tables without shuffle since dimensions already exist on every node. But replication consumes storage proportional to node count—unsuitable for large tables.

**DISTSTYLE EVEN**: Round-robin, uniform distribution. Use when no clear join key exists or no good distribution column is available.

**DISTSTYLE AUTO** (default): Redshift auto-switches from ALL for small tables to KEY/EVEN as they grow.

> 🎯 **Scenario**: "We frequently join a 1-billion-row sales fact table and a 10k-row product dimension table. Queries are slow and inter-node network traffic is high. What's the optimal distribution design?" Answer: **fact table distributed by join key (product_id or a fact-to-fact key), product dimension as DISTSTYLE ALL**. Small dimensions replicated to all nodes eliminate shuffle on large fact joins. For two large fact tables joining, distribute both by the same join key for co-location. In exams, "large + small table join + high network traffic" signals fact=KEY, dim=ALL.

> ⚠️ **Trap**: Using a low-cardinality column (gender, status with few distinct values) as the distribution key creates **data skew**. With only 'M' and 'F', data concentrates on two slices while others idle; two slices overload. MPP parallelism collapses. Distribution keys must have high cardinality and even distribution (order ID, user ID). Check `SVV_TABLE_INFO`'s skew metric. In exams, "only some nodes show high CPU and queries are slow" signals distribution skew.

## Sort Keys (SORTKEY) — What Blocks Can We Skip?

The sort key defines the physical order data occupies on disk. Redshift stores data in 1MB **blocks**, recording min/max values of block contents in metadata (**Zone Map**). On a condition like `WHERE event_date BETWEEN '2024-01-01' AND '2024-01-07'`, Redshift checks Zone Maps and skips entire blocks outside the date range—**block skipping**. The sort key determines which blocks get skipped.

- **COMPOUND SORTKEY**: Multiple columns sorted in order. Most effective when filtering by the first column. Time columns (event_date) typically lead since time-series analysis dominates.
- **INTERLEAVED SORTKEY**: Equal weight to all sort key columns, theoretically advantageous for diverse filtering on multiple columns. But VACUUM REINDEX burden and maintenance complexity make it rarely used in practice.

> 💡 **Related Theory**: Zone Map is essentially the same idea as Parquet row group min/max statistics in data lakes (Day 41). Both use "block-level statistics on sorted/clustered data to skip unnecessary I/O"—the zone map / data skipping technique common to OLAP systems (Redshift, BigQuery, Snowflake, ClickHouse). If indexing (B-tree) means "quickly find specific rows," Zone Maps mean "quickly discard irrelevant massive blocks." OLAP prioritizes the latter overwhelmingly.

> 🔍 **Deep Dive**: Why do VACUUM and ANALYZE matter? Redshift doesn't physically delete rows marked DELETE immediately; it soft-deletes them. INSERTs break sort order, accumulating in unsorted regions. Over time: (1) deleted rows waste space, (2) unsorted regions grow, reducing block skipping efficacy. **VACUUM** physically removes deleted rows and re-sorts by sort key. **ANALYZE** refreshes statistics so the query planner builds accurate execution plans. Modern Redshift automates this via Auto VACUUM/Analyze, but large bulk operations sometimes need manual runs. In exams, "bulk INSERT/DELETE followed by slow queries" signals VACUUM needs.

## RA3 — Separating Compute and Storage, the Real Reason

Early Redshift (DC2, DS2) adhered strictly to shared-nothing: each node held data on local SSD/HDD. The problem: compute and storage were **tightly coupled**. Storage fills, you add nodes—but now you've scaled unneeded compute too, wasting cost. Low on compute, add nodes—storage scales pointlessly. You couldn't scale them independently.

**RA3** solves this with **Redshift Managed Storage (RMS)**. Data lives in RMS (S3-backed), while RA3 nodes' local SSDs act as **cache**. Hot (frequently accessed) data caches on local SSD for speed; cold data stays in RMS and auto-fetches when needed. Compute (node count) and storage (RMS capacity) now scale independently. Petabytes of data don't force you to buy unnecessary compute.

This separation enables crucial side effects. Since data lives in S3 (RMS), **multiple clusters can share data without copying** (Data Sharing). Backup/restore accelerates, and cluster resizing (resize) happens via metadata changes, not data movement.

> 🔍 **Deep Dive**: RA3's compute-storage split follows the architecture Snowflake pioneered. Snowflake started with data on S3 (or GCS/Blob) and separate "virtual warehouse" compute clusters. Multiple warehouses could read the same data with query isolation (ETL vs. BI vs. data science). Redshift caught up via RA3 + Data Sharing + Serverless. From SAP's angle: "multiple teams read the same data without hurting each other's performance" means RA3 + Data Sharing (producer/consumer split) or Serverless multi-instance.

> 📚 **Case Study**: A retailer ran DC2 clusters. Over 3 years, data accumulated, storage hit 90%. They added nodes repeatedly, though compute was plenty—monthly costs tripled. After migrating to RA3, data went to RMS (S3), and they kept only 8 nodes for actual compute, cutting costs 40%. Additionally, BI and ETL teams competing on one cluster split via Data Sharing into producer/consumer clusters, resolving contention. In SAP exams, "DC2 storage shortfall + rising costs" almost always signals RA3 migration.

## DC2 vs RA3 vs Serverless — When to Choose What

| Type | Storage | Compute Management | Suitable Workloads |
|------|----------|-------------|----------------|
| **DC2** | Local SSD (coupled) | Node count manual | Small (< hundreds GB), fixed |
| **RA3** | RMS (S3-based, decoupled) | Node count manual | Large, predictable steady |
| **Serverless** | RMS | Auto (RPU) | Variable, sporadic, unpredictable |

**Redshift Serverless** abolishes nodes. Workload triggers automatic **RPU (Redshift Processing Unit)** scaling up and down; idle queries drop cost to near-zero (storage billed separately). Ideal for dev/test, sporadic analysis, and irregular traffic. Conversely, steady high-volume production may be cheaper with RA3 reserved instances than RPU-per-hour pricing.

> ⚠️ **Trap**: "Serverless is always cheaper"—false. Serverless bills per RPU-hour; sustained high workloads can cost more than RA3 reserved instances. Serverless's strength is elasticity (near-zero cost when idle), not absolute unit price. In exams: unpredictable/sporadic/dev = Serverless; steady bulk production = RA3 reserved.

## Redshift Spectrum — Query Data Lakes Directly from the Warehouse

Spectrum lets Redshift **query S3 data via SQL without loading it into the cluster** (no COPY). Create an External Schema referencing Glue Catalog table definitions, then join Redshift internal tables with S3 external tables in one query—this is the lakehouse essence. Recent, frequently-used data stays inside Redshift; vast historical archives live in S3 lakes. Join on-demand.

Spectrum's mechanics matter. On a Spectrum query, Redshift pushes S3 scan, filter, and aggregation work to **a separate Spectrum node pool managed by AWS** (pushdown). This pool scales elastically to thousands of nodes independently from your Redshift cluster. Petabytes of S3 scanning don't consume your cluster resources; a separate compute handles it, returning reduced results to Redshift. Billing follows Athena: **per GB of S3 scanned** (so Parquet + partitions + compression drive cost here too).

> 🔍 **Deep Dive**: Spectrum vs. Athena confusion arises often. Both query S3 via SQL, share Glue Catalog, and bill on scan volume. Difference: "where you query." Athena is a standalone serverless query service (Presto/Trino); Spectrum is a Redshift cluster extension. Join Redshift internal tables with S3? Use Spectrum. Pure S3 only? Athena is simpler. Internally, Spectrum's S3 scan engine and Athena share similar technology. In SAP exams: "already running Redshift, join with S3 historical data" = Spectrum; "S3 only, no Redshift" = Athena.

## Federated Query and Zero-ETL — Two Approaches to Bringing Operational DB into Analytics

**Federated Query** lets Redshift **directly query Aurora/RDS PostgreSQL/MySQL in real-time** without ETL. Latest operational data joins Redshift analytical data with no pipeline. Redshift sends queries directly to the operational DB, fetching only needed data (predicate pushdown). Ideal for small recent operational data joining large analytical datasets. Downside: analytical workload hits the operational database, so large scans must be avoided.

**Zero-ETL Integration** (2023–2024) differs fundamentally. Aurora (MySQL/PostgreSQL) changes **CDC-replicate to Redshift in near-real-time** without manual ETL pipelines. Aurora data appears in Redshift within seconds to tens of seconds, operational and analytical databases fully separated while maintaining fresh analysis.

> 🎯 **Scenario**: "We need to analyze Aurora PostgreSQL OLTP data in Redshift nearly real-time. We don't want to build and maintain ETL pipelines, and we don't want analytical query load on the operational database. Best architecture?" Answer: **Aurora PostgreSQL Zero-ETL Integration with Redshift**. Zero-ETL CDC-replicates Aurora changes to Redshift automatically—no ETL code to write/maintain (fully managed), and operational DB sees no analytical query load (data replicates there). Federated Query skips ETL but queries the operational DB directly, violating "no load" requirement. DMS CDC is possible but requires pipeline management. Glue batch isn't real-time. Trap: "no ETL + real-time + zero operational load" = Zero-ETL.

> 📚 **Case Study**: A game company stored player behavior in Aurora MySQL; analytics wanted real-time dashboards. Initially, DMS CDC replicated to S3, Glue transformed, Redshift ingested—a 3-step pipeline with 15–30 minute latency and high operational overhead. Switching to Aurora MySQL Zero-ETL with Redshift cut latency to tens of seconds and eliminated pipeline maintenance. Caveat: Zero-ETL doesn't support transformations; complex cleanup must happen in Redshift via Materialized Views or subsequent queries post-arrival.

## WLM, Concurrency Scaling, SQA — Managing Concurrent Workloads

When multiple users submit queries simultaneously, resource contention arises. Redshift manages this via **WLM (Workload Management)**. Queries categorize into queues (ETL queue, BI queue, ad-hoc analysis queue), each allocated memory and concurrency slots for isolation. **Auto WLM** lets Redshift machine-learning-adjust these allocations automatically.

When a queue fills and queries wait, **Concurrency Scaling** automatically spins up temporary additional clusters to handle waiting queries. As load drops, extra clusters shut down. One free hour per day is credited (per hour your main cluster runs), then per-second billing beyond that. Particularly effective for read queries.

**SQA (Short Query Acceleration)** prioritizes short queries in dedicated space, preventing head-of-line blocking where long queries starve short ones.

> ⚠️ **Trap**: Concurrency Scaling isn't a silver bullet. Primarily for read queries, not writes (INSERT/UPDATE/COPY); certain query patterns (specific temp tables, certain functions) don't route to additional clusters. Exceed the free daily credit, and costs accumulate. If simultaneous query spikes are chronic, upsize the cluster itself or move to Serverless. In exams: "queue delays" signals Concurrency Scaling first; endemic parallelism asks for cluster upsizing review.

## Materialized Views and Result Caching — Pre-Calculate Repeated Aggregations

BI dashboards repeat the same aggregation queries (daily sales totals) endlessly. **Materialized Views (MV)** pre-compute aggregations and store results; when source data changes, they **incrementally refresh**. Dashboards read small MVs instead of heavy original aggregations, speeding response. Turn on Auto Refresh, and Redshift keeps MVs fresh in the background. MVs over Spectrum external tables also work, caching S3 lake aggregations in Redshift.

> 💡 **Related Theory**: Materialized Views are the database version of caching: "compute expensively once, reuse results." The core hard problem is **cache invalidation**—when source changes, how do you efficiently refresh the MV? Full recomputation is expensive, so Redshift does incremental refresh, reflecting only changed portions. This touches incremental view-maintenance theory from streaming systems. Contrast Athena (no MV, only Result Reuse for identical query results)—Redshift MVs are more powerful for repeated aggregations.

## Summary

Redshift's performance and cost depend not on the SQL engine but **physical data layout (distribution key, sort key, compression) and execution architecture (MPP, slices, compiled execution)**. RA3's compute-storage separation (RMS) enables scaling flexibility and Data Sharing. Serverless provides elasticity for variable workloads. Spectrum, Federated Query, and Zero-ETL extend the warehouse to data lakes and operational databases, completing the lakehouse.

SAP exam recurring mappings: (1) "large/small table join + network traffic" → fact=DISTKEY, dim=ALL. (2) "DC2 storage full + costs rising" → RA3 migration. (3) "variable/sporadic workload" → Serverless. (4) "S3 historical data joining Redshift" → Spectrum. (5) "ETL-less real-time operational DB analytics + zero load" → Zero-ETL. (6) "queue wait delays" → Concurrency Scaling. (7) "share data across clusters without copy" → Data Sharing. Next day covers Kinesis streaming ecosystem.

---

## 📝 Practice Questions

**Question 1.** A 1-billion-row sales fact table and a 10,000-row product dimension table are joined frequently. Queries are slow and inter-node network traffic is high. What is the optimal distribution design?

A) DISTSTYLE EVEN for both tables
B) DISTKEY on the join key for sales, DISTSTYLE ALL for product
C) DISTSTYLE ALL for both tables
D) DISTSTYLE ALL for sales, DISTKEY for product

**Answer: B**
Explanation: Distribute the large fact table with a DISTKEY on the join key and replicate the small dimension table (10,000 rows) to all nodes with DISTSTYLE ALL; then the dimension data is already local to each node at join time, and inter-node shuffling (network traffic) disappears. A (EVEN for both) causes shuffling during joins. C (ALL for both) replicates the 1-billion-row table to every node, so storage explodes and it is impractical. D is wrong because it replicates the large table. Trap: "large table + small table + high network traffic" is classically fact = KEY, dim = ALL.

---

**Question 2.** Analytical queries are slow, and monitoring shows that only some slices are at 100% CPU while the rest are nearly idle. The distribution key is the `gender` column (only 2 values, M/F). What are the cause and the fix?

A) Missing sort key → add a SORTKEY
B) Data skew → change the DISTKEY to a high-cardinality column
C) Missing compression → apply encoding
D) VACUUM needed → run VACUUM

**Answer: B**
Explanation: If a very low-cardinality column like gender is used as the distribution key, data concentrates on only two slices (data skew), and MPP parallelism collapses. This is the classic symptom of only some slices being overloaded while the rest sit idle. You must change the DISTKEY to a column with high cardinality and even distribution (order ID, user ID, and so on) to distribute evenly. A, C, and D also affect performance, but the direct cause of the symptom "only some slices are overloaded" is distribution skew. Trap: "only some nodes/slices have high CPU" suggests distribution skew.

---

**Question 3.** You operate a DC2 cluster, and data has accumulated over 3 years so storage is 90% full. Compute is sufficient, but adding nodes because of storage makes costs jump. What is the most appropriate solution?

A) Keep adding DC2 nodes
B) Migrate to RA3
C) Switch to Redshift Serverless
D) Delete old data

**Answer: B**
Explanation: DC2 couples compute and storage, so when storage runs short you must also add unnecessary compute. RA3 stores data in RMS (S3-based) and uses local SSD as a cache, so compute and storage scale independently. The node count is matched only to actual compute needs and storage is handled elastically by RMS, optimizing cost. A is the very cause of the cost jump. C is possible, but for a steady production workload an RA3 reservation may be more economical, and the key point of the question is the separation of storage. D means data loss. Trap: "DC2 storage shortage + rising cost" is a migration to RA3.

---

**Question 4.** In a dev/test environment, analytical queries run a few times a day at irregular times. You want compute cost to be near zero when not in use and do not want to manage nodes. What is the most appropriate option?

A) A single DC2 node
B) An RA3 reserved instance
C) Redshift Serverless
D) Aurora

**Answer: C**
Explanation: Redshift Serverless has no node concept; RPUs adjust automatically to the workload, and when there are no queries compute cost drops to nearly zero. It is optimal for intermittent, unpredictable, and development environments. A (DC2) and B (RA3 reserved) keep incurring node costs even when unused and also require node management. D is an OLTP DB, not an analytics data warehouse. Trap: "variable/intermittent/zero cost when not in use" is Serverless; "steady large-scale production" is an RA3 reservation.

---

**Question 5.** You already run Redshift RA3, and you need to analyze 5 years of historical order data (Parquet) stored in the S3 data lake by joining it with Redshift's recent orders table. You do not want to load the historical data into Redshift. What is the most appropriate configuration?

A) Load the S3 data into an internal Redshift table with COPY
B) Redshift Spectrum + External Schema
C) Query separately with Athena and combine manually
D) Replicate S3 to Redshift with DMS

**Answer: B**
Explanation: Redshift Spectrum queries S3 data directly through an External Schema that references external tables in the Glue Catalog without loading (COPY) it, and can join it with internal Redshift tables in a single query (lakehouse). The S3 scan is processed by a separate Spectrum node pool, so it barely uses cluster resources. A and D involve loading, which violates the condition "do not want to load." C requires combining the results of two systems manually, which is inefficient. Trap: "using Redshift + joining with historical S3 data + avoiding loading" is Spectrum.

---

**Question 6.** You must analyze Aurora PostgreSQL OLTP data in Redshift in near real time. You do not want to build and operate an ETL pipeline yourself, nor put analytical query load on the production DB. What is the most appropriate configuration?

A) Redshift Federated Query
B) Aurora PostgreSQL Zero-ETL Integration with Redshift
C) Replicate to S3 with DMS CDC and then Glue ETL
D) Hourly Glue batch ETL

**Answer: B**
Explanation: Zero-ETL Integration automatically replicates Aurora changes to Redshift in near real time (seconds to tens of seconds) using CDC. There is no ETL code to write or maintain (fully managed), and because the data is replicated into Redshift, no analytical query load reaches the production DB. A (Federated Query) has no ETL but queries the production DB directly and puts load on it, which violates the condition. C and D require managing the pipeline yourself; C is real time but an operational burden, and D is not real time. Trap: "without ETL + real time + avoiding production DB load" is Zero-ETL.

---

**Question 7.** Two separate RA3 clusters (the BI team and the data science team) must read the same sales data. How can you avoid data replication cost and synchronization burden while isolating each team's queries so they do not affect each other's performance?

A) Two teams share one cluster
B) Redshift Data Sharing (producer → consumer)
C) Each team replicates the data with COPY
D) Share with Redshift Spectrum

**Answer: B**
Explanation: RA3 Data Sharing takes advantage of the fact that data resides in RMS (S3-based) to let a consumer cluster read-share the producer cluster's data without copying. Each cluster has independent compute, so workloads are isolated (no performance impact on each other) and there is no replication cost or synchronization burden. Multi-account and multi-Region are also supported. A fails at workload isolation (contention). C incurs replication cost and synchronization burden. D (Spectrum) is for external data in S3 and is not a mechanism for sharing internal Redshift tables. Trap: "sharing across multiple clusters without replication + workload isolation" is Data Sharing.

---

## 📌 Today's Summary

1. **MPP + Columnar + Compiled Execution** — Leader/Compute Nodes, Slice-level parallelism, shared-nothing
2. **DISTSTYLE** — KEY (co-location), ALL (small dim replicate), EVEN, AUTO. Large fact + small dim = KEY + ALL
3. **Data Skew** — Never DISTKEY on low-cardinality columns; some slices overload = skew suspect
4. **SORTKEY + Zone Map** — block skipping, time column COMPOUND standard, VACUUM/ANALYZE maintenance
5. **RA3 + RMS** — Compute/storage decoupled, independent scaling, Data Sharing foundation. DC2 storage full = RA3
6. **Serverless** — Variable/sporadic workloads, RPU auto-scale, zero cost idle. Steady bulk = RA3 reserved
7. **Spectrum** — Direct S3 query (separate pushdown pool), lakehouse, scan-volume billing
8. **Federated Query vs Zero-ETL** — First: real-time direct query (operational load). Second: CDC auto-replicate (no load)
9. **WLM/Concurrency Scaling/SQA/MV** — Workload isolation, queue auto-expand, short-query priority, aggregation cache
