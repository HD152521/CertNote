# Day 3 - DynamoDB (Analytics Perspective): Key Design and Stream-Based Pipelines

## 📌 Key Takeaways

- DynamoDB is a key-value store that splits data by the **hash of the partition key**. A lookup by key takes milliseconds, but a **Scan, which sweeps without a key, reads the whole table and consumes capacity accordingly**.
- The throughput of a single partition has an upper limit. When traffic piles onto one key, it becomes a **hot partition** and is throttled, so use an evenly distributed key and, when needed, spread writes with write sharding.
- A **GSI** re-indexes the whole table under a different key (eventually consistent, can be added after creation). An **LSI** is a different sort key on the same partition key (defined only at creation, strongly consistent reads possible).
- Do not run bulk analytics on the table; **send the data out**: DynamoDB Streams or Kinesis Data Streams for real-time changes, S3 export for a full snapshot, and zero-ETL for warehouse replication with no operational burden.
- Streams offers 24-hour retention, no duplicates, and ordering guaranteed per item. Kinesis Data Streams offers up to 1 year of retention and more consumers, but duplicates and out-of-order records are possible.

## DynamoDB Basic Model

Amazon DynamoDB is a fully managed, serverless NoSQL key-value and document database. It is fundamentally built for OLTP, but data engineers need to know it for two reasons: **how to pull data out** as a source of operational data, and **how to design it** as a state store and lookup store for pipelines.

Data is organized as **table → item (row) → attribute (column)**. An item is identified by its **primary key**.

- **Partition key (PK)**: It is hashed and determines the physical partition where the item is stored.
- **Sort key (SK)**: It orders the items within the same partition key. The PK + SK combination is a **composite primary key**.

```text
PK = USER#1001     SK = ORDER#2026-06-26#A   amount=120
PK = USER#1001     SK = ORDER#2026-06-26#B   amount=80
PK = USER#1001     SK = PROFILE              name="Kim"
```

- Attributes other than the keys have no schema. Each item may have different attributes. The size of a single item has an upper limit (400 KB).
- A group of items that share the same PK is called an **item collection**. In the example above, the orders and the profile of `USER#1001` form one collection, fetched at once with a single PK.

### Three Ways to Read

| Operation | Behavior | Cost |
|------|------|------|
| `GetItem` | One item, specifying the full primary key | The size of that item |
| `Query` | Specify the PK and look inside one collection with an SK condition (range or prefix) | The items read that match the condition |
| `Scan` | The whole table (or index) from beginning to end | **The size of the entire table** |

- The `FilterExpression` of a `Scan` is a filter that discards **after** reading. Even if the result is 10 items, the read capacity for the entire table is consumed. This is the answer to "why is it expensive even though I added a filter?"
- `Query` and `Scan` return at most 1 MB at a time, and beyond that you continue by fetching pages.

> 💡 **Related Theory**: DynamoDB designs its keys after deciding the access patterns first (access-pattern-first). A relational database normalizes the schema and writes queries later, but in DynamoDB the list of "what will be retrieved by which key" is the schema. Questions that were not on the list (arbitrary column aggregation, joins) can only be answered with a Scan, and that is why analytics is sent outside.

## Capacity Modes and Billing Units

| Aspect | Provisioned | On-demand |
|------|------|------|
| Billing | Hourly charge for the RCUs and WCUs you set (whether used or not) | Read and write request units actually requested |
| Capacity management | Set it yourself or use Auto Scaling | None |
| Suitable traffic | Steady and predictable | Highly variable and unpredictable, new workloads |
| Handling spikes | Only as much as provisioned | Instantly accommodates up to 2x the previous peak |

- **One read unit** = 1 strongly consistent read of an item up to 4 KB, or 2 eventually consistent reads. **One write unit** = 1 write of an item up to 1 KB. If an item is larger, it is rounded up in units of 4 KB and 1 KB and costs more.
- So a single strongly consistent read of a 20 KB item is 5 units. If you Scan the whole table for analytics, "table size ÷ 4 KB" read units are consumed.
- A new on-demand table accepts up to 4,000 writes and 12,000 reads per second. If you exceed 2x the previous peak within 30 minutes, throttling can occur.
- Switching from provisioned to on-demand is allowed up to 4 times in 24 hours.

## Key Design and Hot Partitions

A single partition of a table is designed to deliver up to **3,000 read units and 1,000 write units** per second. No matter how large the total table capacity is, traffic piled onto one partition key runs into this limit.

- **Even distribution**: For the PK, choose an attribute with many distinct values whose traffic spreads evenly (userId, deviceId). Attributes with few or skewed values, such as date, status, or country, make bad PKs.
- **Write sharding**: For a key that is unavoidably skewed, add a suffix to divide it across several partitions. When reading, you must query all the suffixes and combine them.
- **Single-table design**: Put several entities in one table and distinguish them with PK/SK prefixes. There are no joins, but related data is fetched with a single Query.
- Adaptive capacity returns spare capacity to a skewed partition, but it cannot lift the per-partition limit itself.

```text
-- Anti-pattern: using only the date as the PK for a time series concentrates that day's traffic on one partition
PK = 2026-06-26

-- Write sharding: spread across N partitions with a suffix (when reading, query all of 0 to N-1)
PK = 2026-06-26#03

-- A more common solution: device ID as the PK, timestamp as the SK
PK = DEVICE#8821    SK = 2026-06-26T10:15:00Z
```

| Key choice | Distribution | Verdict |
|------|------|------|
| `user_id`, `device_id`, `order_id` | Many values, even | Good |
| `date`, `status`, `country` | Few or skewed values | Hot partition |
| `tenant_id` (one large tenant accounts for most) | Skewed to one value | Sharding needed |
| Date + shard suffix | Artificially even | Possible, but reading becomes complex |

## GSI and LSI

To query by an attribute that is not the primary key, you need a **secondary index**.

| Aspect | GSI (Global Secondary Index) | LSI (Local Secondary Index) |
|------|------|------|
| Key | A different PK (and SK) from the table | The same PK as the table, a different SK |
| Scope | The whole table | Within one partition key |
| When it can be created | Added or removed at any time | Only when the table is created |
| Consistency | Eventually consistent only | Strongly consistent can be chosen |
| Capacity | **Separate** capacity from the table | Shares the table's capacity |
| Count | 20 per table by default (quota) | 5 per table |
| Key uniqueness | Index keys may be duplicated | - |

```text
-- GSI example: look up orders by status
GSI: PK = status (SHIPPED/PENDING), SK = order_date
→ Supports a new access pattern such as "PENDING orders in date order"
```

- When you write to the table, the GSI follows **asynchronously**. It is usually within 1 second, but a value you just wrote may not show up in a GSI query.
- If the GSI's write capacity is insufficient, **writes to the base table are throttled too.** In provisioned mode, set the GSI write capacity at or above the table's. This is a common cause of "the table has spare capacity but writes are throttled."
- **Projection**: You choose which attributes to copy into the index. `KEYS_ONLY` (keys only), `INCLUDE` (adds the attributes you specify), `ALL` (everything). A GSI query cannot fetch attributes that are not projected, and `ALL` increases storage and write cost.
- **Sparse index**: Items that lack the index key attribute are not placed in the index. It is a technique for cheaply querying a subset such as "only those awaiting processing."
- If you use `status` as the PK of a GSI as in the example above, the GSI itself becomes a hot partition. An index follows the same distribution rules as the table.

> 💡 **Related Theory**: A GSI is a tool for "creating one more lookup axis that you know in advance," not an analytics tool. If you add a GSI every time an aggregation axis is added, each write incurs a cost per index, and you still cannot do SUM or GROUP BY. Questions whose lookup axes keep changing are the job of a columnar analytics store.

## Change Capture: Streams and Kinesis Data Streams

DynamoDB emits item-level changes (INSERT, MODIFY, REMOVE) as a stream. There are two options, and you can turn on both for one table.

| Property | DynamoDB Streams | Kinesis Data Streams for DynamoDB |
|------|------|------|
| Retention | 24 hours | Up to 1 year |
| Number of consumers | Up to 2 concurrent per shard | 5 per shard, 20 with enhanced fan-out |
| Ordering | Changes to the same item arrive in actual order | You judge the order yourself from the record timestamps |
| Duplicates | None (each record exactly once) | Occasional duplicates possible |
| Processing options | Lambda, Kinesis adapter (KCL) | Lambda, Managed Service for Apache Flink, Data Firehose, Glue streaming ETL |
| Clue for choosing | "React with Lambda on every change," simple | "Long-term retention, reprocessing," "multiple apps consume," "load into S3 through Firehose" |

What the stream holds is decided by the **view type**.

| `StreamViewType` | What is included | Use |
|------|------|------|
| `KEYS_ONLY` | Only the keys of the changed item | Announce only that a change happened and re-query the body |
| `NEW_IMAGE` | The whole item after the change | Replicate the latest state to another store |
| `OLD_IMAGE` | The whole item before the change | Keep deleted values, auditing |
| `NEW_AND_OLD_IMAGES` | Both before and after the change | Compute differences, reproduce CDC completely |

- The view type cannot be changed after the stream is created. To change it, turn the stream off and create a new one.
- A stream is written asynchronously, so turning it on does not affect table performance.
- Lambda receives records in batches, in order, for each shard. If the function fails, it cannot move on to the next record of that shard, so retry limits, batch splitting, and failure destination settings are needed exactly as with Kinesis.
- Deletions of items expired by TTL also appear in the stream (marked as service deletions rather than user deletions). A TTL deletion does not happen the instant an item expires but in the background, and it does not consume write capacity. "Archive expired items to S3" is the classic use of Streams + Lambda.

```text
DynamoDB table
   ├─ DynamoDB Streams ──► Lambda ──► transform ──► S3 / OpenSearch / another table
   └─ Kinesis Data Streams ──► Data Firehose ──► S3 (Parquet) ──► Athena / Redshift Spectrum
                           └─► Managed Service for Apache Flink (real-time aggregation)
```

## Exporting the Whole Table: S3 Export and Other Methods

| Method | Behavior | Consumes table capacity | Freshness | When it fits |
|------|------|------|------|------|
| S3 export | Exports the table at a point in time from the PITR backup to S3 | **No** | The time of export | Regular snapshot analysis, large volumes |
| Incremental S3 export | Only what changed during a specified period | No | In units of 15-minute to 24-hour windows | Catching up after a full export |
| Zero-ETL → Redshift | Automatic replication using a full export followed by incremental exports | No | 15 to 30 minute intervals | Analyzing in the warehouse with no operational burden |
| Athena federation (DynamoDB connector) | Athena reads the table directly | **Yes** | Real time | Occasional exploratory queries |
| Reading directly with Glue ETL or Redshift COPY | Reads by Scan | **Yes** | At the time of the run | Small tables, one-off |

- S3 export requires **PITR (point-in-time recovery) to be turned on**. Because it reads from the backup, it does not use read capacity and does not affect table performance. The output format is DynamoDB JSON or Amazon Ion, and it can export to a bucket in another account or another Region.
- The export result is not Parquet. If you will query it repeatedly with Athena, convert it once to Parquet with Glue or CTAS.
- An export is an asynchronous job with no guaranteed completion time. Do not build a pipeline on the assumption that "it finishes within a few minutes."
- Zero-ETL requires PITR on the source table, and in Redshift the items arrive in a SUPER type column. The minimum latency is 15 minutes, so if you need second-level freshness, a stream is the answer.
- Reading directly with Scan competes with production traffic for read capacity. If the question says "without affecting the production table," it is export.

```bash
# Export the table at a point in time from the PITR backup to S3
aws dynamodb export-table-to-point-in-time \
  --table-arn arn:aws:dynamodb:ap-northeast-2:111122223333:table/Orders \
  --s3-bucket acme-datalake-raw-prod \
  --s3-prefix dynamodb/orders/ \
  --export-format DYNAMODB_JSON
```

## When DynamoDB Fits and When It Does Not

| Workload | Verdict | Use instead |
|------|------|------|
| Single-digit millisecond lookups by key (sessions, shopping carts, device state) | Fits | - |
| Unpredictable large-scale concurrent requests, serverless backends | Fits (on-demand) | - |
| Storing a pipeline's checkpoints, metadata, and deduplication keys | Fits | - |
| Arbitrary column aggregation, GROUP BY reports | Does not fit | Export or stream → S3 + Athena, Redshift |
| Joining multiple tables | Does not fit | RDS/Aurora, Redshift |
| Full-text search | Does not fit | Stream or zero-ETL → OpenSearch |
| Large objects (documents of several MB, images) | Does not fit (item size limit) | Store in S3 and keep only the key in DynamoDB |

```text
Operational (OLTP): DynamoDB  →  change capture (Streams/Kinesis) or snapshot (Export)  →  analytics (OLAP): S3 + Athena / Redshift
```

This is the data engineering version of CQRS (Command Query Responsibility Segregation). Writes and key lookups go to DynamoDB, and analytics and aggregation go to a columnar store, so each does what it is good at. For the link between the two, use a stream if it must be real time, an export if it is periodic, and zero-ETL if you want to hand it over to a managed service.

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Table capacity is left over but only certain requests are throttled | Hot partition (skewed to one key) | Redesign the key, write sharding |
| Writes are throttled while the table WCU has room | Insufficient GSI write capacity | Set GSI capacity at or above the table's |
| A filtered query makes read capacity spike | Scan + FilterExpression | Design keys or a GSI so that it becomes a Query |
| The service lags while an analytics job runs | The analytics scans the table directly | Switch to S3 export |
| A value just written does not show up in an index query | Eventual consistency of the GSI | Read the table with strong consistency, or use an LSI |
| Adding a third stream consumer causes throttling | Streams limit of 2 concurrent readers per shard | Switch to Kinesis Data Streams |
| A consumer that was down for more than a day lost data | Exceeded the 24-hour retention of Streams | Kinesis Data Streams (long retention), rebuild from an export |
| The export fails | PITR not enabled | Enable PITR |
| The same change was applied twice downstream | Duplicate records on the Kinesis path, Lambda retries | Idempotent processing (upsert by key) |

## Question Clue → Answer Lookup Table

| Clue in the question | Answer |
|------|------|
| "Used date and status as the partition key and got throttled" | Hot partition → even key, write sharding |
| "Query the whole table by an attribute that is not the primary key" | GSI |
| "A different sort order within the same partition key, strong consistency needed" | LSI (defined when the table is created) |
| "React to item changes in real time" | DynamoDB Streams + Lambda |
| "Keep change history for more than a few days, consumed by several applications" | Kinesis Data Streams for DynamoDB |
| "Continuously load the changes into S3" | Kinesis Data Streams → Data Firehose → S3 |
| "Export the whole table to S3 without affecting the production table" | S3 export (PITR required) |
| "Analyze DynamoDB data in Redshift without managing a pipeline" | Zero-ETL integration |
| "Occasionally join S3 data and DynamoDB with SQL" | Athena federated query |
| "Traffic is unpredictable and the team does not want to manage capacity" | On-demand mode |
| "Automatically delete old items and keep the deleted ones" | TTL + Streams + Lambda → S3 |

Tomorrow we cover RDS/Aurora, relational OLTP stores, along with zero-ETL and the criteria for choosing a store by looking at the workload.

## 📖 Glossary

- **Partition key / sort key**: The key that decides the partition where an item is placed, and the key that decides the order within it.
- **Item collection**: A group of items that share the same partition key.
- **Hot partition**: A phenomenon in which traffic piles onto one partition key and only that partition is throttled.
- **Write sharding**: A technique that adds a suffix to a skewed key to divide it across several partitions.
- **RCU / WCU**: Read and write capacity units. Reads are calculated in 4 KB units and writes in 1 KB units.
- **GSI / LSI**: A global secondary index that indexes the whole table by a different key, and a local secondary index that gives a different sort key on the same partition key.
- **Projection (index)**: The range of attributes copied from the table into the index.
- **DynamoDB Streams**: A change log that keeps item-level changes in time order for 24 hours.
- **PITR**: Point-in-time recovery. It maintains continuous backups so that you can restore or export from any past point in time.
- **TTL**: A feature that lets you specify an expiration time on an item so that it is deleted automatically.

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
