# Day 1 - Amazon Redshift: Distribution and Sort Keys and Workload Optimization

Amazon Redshift is a petabyte-scale columnar MPP (Massively Parallel Processing) data warehouse. Today we cover data distribution, sort keys, RA3/Spectrum architecture, and workload optimization through WLM and concurrency scaling.

## Redshift Architecture Overview

A Redshift cluster consists of one **leader node** and multiple **compute nodes**. The leader node parses queries, plans them, and distributes work to compute nodes. Each compute node further divides into multiple **slices**, which are the minimum parallelization unit. Data is distributed across slices, and each slice processes its data in parallel.

> 💡 **Related Theory**: MPP divides data across multiple nodes/slices for simultaneous processing. How evenly data is distributed to slices (distribution key) determines parallel processing efficiency.

## Distribution Styles

Determines how table rows are placed across slices. Three main methods:

```sql
-- KEY distribution: hash specified column, same values go to same slice
CREATE TABLE orders (
  order_id   BIGINT,
  customer_id BIGINT,
  amount     DECIMAL(12,2)
)
DISTSTYLE KEY
DISTKEY (customer_id);

-- ALL distribution: replicate entire table to all nodes (for small dimension tables)
CREATE TABLE dim_region (region_id INT, region_name VARCHAR(50))
DISTSTYLE ALL;

-- EVEN distribution: round-robin even distribution (when join key unclear)
CREATE TABLE event_log (event_id BIGINT, payload VARCHAR(2000))
DISTSTYLE EVEN;
```

- **KEY**: Specify column frequently used in joins/aggregations. When two joining tables share the same DISTKEY, data resides on the same slice for **co-located join without network redistribution**.
- **ALL**: Replicate small dimension table to all nodes to eliminate redistribution. Using on large tables causes storage and write cost explosion.
- **EVEN**: Distributes evenly but redistribution may occur on joins. Default when no clear join key exists.
- **AUTO** (default): Redshift auto-switches from ALL to KEY/EVEN based on table size.

> 💡 **Related Theory**: Data skew — when KEY distribution has excessive values for one key, data concentrates in one slice, breaking parallelism. Choose DISTKEY with high cardinality and even distribution.

## Sort Key

Sort keys order data on disk to skip unnecessary blocks during range filters (zone map based block skipping).

```sql
CREATE TABLE sales (
  sale_date  DATE,
  region     VARCHAR(20),
  amount     DECIMAL(12,2)
)
DISTKEY (region)
COMPOUND SORTKEY (sale_date, region);
```

- **COMPOUND**: Columns sorted in specified order. Most effective for first column filter. Strong for date range queries.
- **INTERLEAVED**: Equal weight on multiple columns. Useful for filtering by various column combinations, but VACUUM REINDEX cost is high.

A **zone map** recording min/max values per block lets conditions like `WHERE sale_date BETWEEN ...` matching the sort key skip entire blocks.

## RA3 Nodes and Redshift Spectrum

- **RA3 Nodes**: Latest generation separating compute and storage. Data is stored in **Redshift Managed Storage (RMS, S3-based)**, local SSD used as cache. Storage auto-scales, so you adjust only compute. (Older DC2 combines compute and storage.)
- **Redshift Spectrum**: Query **external tables directly on S3** without loading into Redshift. Uses Glue Data Catalog as metastore; billed on scanned S3 data volume.

```sql
-- Spectrum external schema + S3 data direct join
CREATE EXTERNAL SCHEMA spectrum_ext
FROM DATA CATALOG DATABASE 'datalake_db'
IAM_ROLE 'arn:aws:iam::123456789012:role/RedshiftSpectrumRole';

SELECT d.region, SUM(s.amount)
FROM spectrum_ext.raw_events s   -- External table on S3
JOIN dim_region d ON s.region_id = d.region_id  -- Internal Redshift table
GROUP BY d.region;
```

Common pattern: hot data in Redshift, cold/historical bulk on S3 + Spectrum (**lakehouse** pattern).

## WLM and Concurrency Scaling

**Workload Management (WLM)** classifies queries into queues to control memory and concurrency.

- **Auto WLM**: Redshift automatically adjusts memory and concurrency. Most recommended.
- **Manual WLM**: Specify memory ratio and concurrency slots per queue.
- **Query Monitoring Rules (QMR)**: Stop and log queries exceeding thresholds (e.g., runtime, rows scanned).
- **SQA (Short Query Acceleration)**: Process short queries in dedicated queue fast-track.

```sql
-- Set priority (leverage queue priority in Auto WLM)
SET query_group TO 'critical_dashboards';
```

**Concurrency Scaling** automatically launches temporary clusters when read queries spike, eliminating queue wait. Billed per-cluster-hour, with some free credits based on cluster usage.

> 💡 **Related Theory**: Concurrency scaling is "keep storage and base cluster, elastically expand read concurrency only." Effective for read spikes (e.g., dashboard refreshes at dawn) over write surges.

## Other Optimizations

- **COPY Command**: Parallel load from S3. Splitting into multiple files lets slices read in parallel.
- **VACUUM / ANALYZE**: Reclaim deleted space and re-sort (VACUUM), update statistics (ANALYZE). RA3/Auto automate much.
- **Compression encoding**: `COPY ... COMPUPDATE` auto-selects optimal per-column encoding.
- **Materialized views**: Pre-compute repeated aggregations, auto-refresh possible.

## Key Takeaways

- Distribution key determines parallelism and join efficiency. KEY (co-located join), ALL (small dimensions), EVEN (default).
- Sort key + zone map skip blocks on range filter. Date usually first COMPOUND column.
- RA3 separates compute/storage, Spectrum queries S3 external tables.
- Auto WLM + concurrency scaling elastically handle read spikes.

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
