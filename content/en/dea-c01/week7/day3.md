# Day 3 - DynamoDB (Analytics Perspective): Key Design and Stream-Based Pipelines

Amazon DynamoDB is a fully managed serverless NoSQL key-value/document database providing single-digit millisecond latency and near-unlimited scale. While fundamentally OLTP, data engineers must understand **key design** and **stream-to-analytics pipelines**.

## DynamoDB Fundamental Model

Data is organized as **table → items (rows) → attributes (columns)**. Each item identified by **primary key**.

- **Partition Key (PK)**: Hashed to determine physical partition where data is stored.
- **Sort Key (SK)**: Orders items within same partition. PK+SK combination is **composite primary key**.

```text
PK = USER#1001     SK = ORDER#2026-06-26#A   amount=120
PK = USER#1001     SK = ORDER#2026-06-26#B   amount=80
PK = USER#1001     SK = PROFILE              name="Kim"
```

> 💡 **Related Theory**: DynamoDB's PK hash determines partition, so key design determines scalability and performance. Unlike relational DBs, can't efficiently scan arbitrary columns; must define access patterns first, then design keys (access-pattern-first).

## Key Design and Hot Partitions

Traffic concentration on specific PK creates **hot partition**, causing throttling.

- **Even distribution**: Choose PK with high cardinality and distributed traffic (e.g., userId).
- **Single-table design**: Store multiple entities in one table, distinguished by PK/SK prefixes. Query related data at once without joins.
- **Write sharding**: Attach random suffix to hot key (`ORDER#2026-06-26#<shard>`) for distribution.

```text
-- Anti-pattern: time-series using only date as PK concentrates all-day traffic in one partition
-- Sharding: PK = DATE#2026-06-26#03  (distribute via 0~N shards)
```

## GSI and LSI

Query non-primary-key attributes with **secondary indexes**.

- **GSI (Global Secondary Index)**: Index entire table with different PK/SK. Has separate provisioned throughput/storage; **eventually consistent** async replication with table. Unlimited addition.
- **LSI (Local Secondary Index)**: Same PK, different SK. Definable only at table creation; offers strong consistency option.

```text
-- GSI example: index table with status as PK for status-based order queries
GSI: PK = status (SHIPPED/PENDING), SK = order_date
→ enables new access pattern like "PENDING orders by date"
```

> 💡 **Related Theory**: GSI adds new query axis but has async replication slight delay and eventual consistency. Rather than force analytics queries through GSI, standard practice is to export bulk analytics to separate analytics store.

## DynamoDB Streams → Analytics Pipeline

DynamoDB is optimized for OLTP, **unsuitable for bulk aggregation and ad-hoc analysis**. Analytics requires diverting changes to separate store.

**DynamoDB Streams** capture item-level changes (INSERT/MODIFY/REMOVE) as chronologically ordered records.

```text
DynamoDB Table
   │ (Streams: change capture)
   ▼
Lambda  ──►  Kinesis Data Firehose  ──►  S3 (Parquet)  ──►  Athena/Redshift Spectrum
   or
Streams  ──►  Kinesis Data Streams  ──►  analytics/real-time processing
```

- **Streams + Lambda**: Trigger Lambda per change → process and load to S3/Firehose.
- **Kinesis Data Streams for DynamoDB**: Send changes directly to Kinesis; higher throughput, replay, multiple consumers.
- **S3 export (PITR-based)**: Full export snapshot at specific time to S3 without load on operational table → analyze with Athena.

## When DynamoDB Is Suitable / Unsuitable

**Suitable**: Key-based fast lookup, sessions, shopping carts, IoT device state, massive concurrency, unpredictable traffic (on-demand mode), serverless backend.

**Unsuitable (analytics perspective)**: Arbitrary column aggregation, complex joins, large-scale scans/reporting, ad-hoc analysis. → Move to S3/Redshift via Streams/export for Athena/Redshift analysis.

```text
Operations (OLTP): DynamoDB  →  change capture (Streams/Export)  →  Analytics (OLAP): S3 + Athena / Redshift
```

> 💡 **Related Theory**: This is the data engineering version of CQRS (Command-Query Responsibility Separation). Writes/key queries on DynamoDB, analytics/aggregation on columnar analytics store, each workload on optimal engine.

## Key Takeaways

- PK hash determines partition → even key design avoiding hot partitions is core.
- GSI adds new query axis (async, eventual consistency); LSI same PK different SK (creation-time definition).
- Bulk analytics don't happen on DynamoDB directly; move via Streams/Kinesis/S3 export to analytics store.
- Separate OLTP to DynamoDB, OLAP to S3+Athena/Redshift (CQRS pattern).

## 📝 Practice Questions

**Question 1.** What problem occurs in DynamoDB when the PK of time-series data is specified only as the date (for example, `2026-06-26`)?

A) Strong consistency cannot be guaranteed  
B) All traffic for that day is concentrated on one partition, causing hot partitions and throttling  
C) A GSI cannot be created  
D) Streams is disabled  

**Answer: B**  
Explanation: If the PK hash is fixed to a single date, that day's traffic concentrates on a single partition, causing a hot partition and throttling. The fix is to distribute the key, for example with a shard suffix. The other options are not directly related to key design.

---

**Question 2.** What do you use to add a new access pattern that queries the entire table by an attribute other than the primary key (for example, status)?

A) LSI (added after table creation)  
B) VACUUM  
C) GSI (Global Secondary Index)  
D) Partition projection  

**Answer: C**  
Explanation: A GSI indexes the whole table by a different PK/SK to add a new query axis and can be created at any time (asynchronous, eventually consistent). An LSI uses the same PK with a different SK and can only be defined when the table is created, and the rest are unrelated to DynamoDB indexes.

---

**Question 3.** Which feature captures item changes in a DynamoDB table in time order and flows them into an analytics pipeline?

A) DynamoDB Streams  
B) Glue crawler  
C) Athena CTAS  
D) Redshift WLM  

**Answer: A**  
Explanation: DynamoDB Streams captures INSERT/MODIFY/REMOVE changes as time-ordered records and is the starting point of a CDC pipeline that loads them into S3 or Redshift via Lambda/Kinesis. The others are, respectively, schema inference, Athena table creation, and Redshift queue management.

---

**Question 4.** What is the most appropriate way to export data from a production DynamoDB table as of a specific point in time to S3 and analyze it with Athena without putting load on the table?

A) Run an analytical query that performs a full scan of the table directly  
B) Use a PITR-based S3 export (table export)  
C) Add a GSI for every item  
D) Create an additional LSI  

**Answer: B**  
Explanation: A PITR (point-in-time recovery) based S3 export writes a snapshot to S3 without consuming the production table's read throughput, so it can be analyzed with Athena. A full scan puts load on production, and adding indexes is unrelated to an analytics export.

---

**Question 5.** Which workload is the most appropriate example of one for which using DynamoDB is unsuitable from an analytics perspective?

A) Looking up session data by user ID in single-digit milliseconds  
B) Reporting with complex joins and large-scale ad hoc aggregations over arbitrary columns  
C) Storing shopping carts and device state  
D) A serverless backend with unpredictable traffic  

**Answer: B**  
Explanation: DynamoDB is strong at fast key-based lookups and massive concurrency, but is unsuitable for arbitrary-column joins, large-scale aggregations, and ad hoc analytics. In such cases, move the data with Streams/export to S3 + Athena or Redshift for analysis. The others are suitable use cases for DynamoDB.

---
