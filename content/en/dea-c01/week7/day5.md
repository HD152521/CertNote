# Day 5 - Week 7 Comprehensive Review: Analytics Stores Recap

## 📌 Key Takeaways

- The first question in choosing a store is the **read pattern**. If you read and write single records, it is RDS/Aurora or DynamoDB; if you aggregate a few columns across many rows, it is Redshift or Athena.
- The billing unit sets the direction of optimization. Athena and Spectrum bill by **scan volume**, so reading less is what counts; Redshift bills by **compute time**, so key design and concurrency management matter; DynamoDB bills by **request units**, so eliminating Scans is the cost saving.
- "Piling up on one side" has a different name in each service: distribution key skew in Redshift, hot partitions in DynamoDB, and the hot shard in Kinesis that we saw in Week 2. The prescription is always an evenly distributed key.
- Choose the path from operations to analytics by **freshness and operational burden**: Read Replica (immediate, same engine), zero-ETL (near real time, managed), DMS (wide combinations, CDC), streams (per event), export (snapshot), federation (no data movement).
- The tuning knobs are distribution and sort keys plus WLM for Redshift, partitions, formats, and workgroups for Athena, keys and indexes for DynamoDB, and readers and zero-ETL for Aurora.

## Analytics Stores on One Table

This week we covered the analytics data stores (Redshift, Athena, DynamoDB, RDS/Aurora) and the choice of store by workload. Putting the four days of content on the same axes makes the differences clear at a glance.

| Aspect | Redshift | Redshift Spectrum | Athena | DynamoDB | RDS / Aurora |
|------|------|------|------|------|------|
| Essence | Columnar MPP warehouse | Query S3 external tables from the warehouse | Serverless S3 queries | Key-value NoSQL | Row-based relational OLTP |
| Data location | Cluster (managed storage) | S3 | S3 | Table partitions | Instance volume / cluster volume |
| Does well | Repeated bulk aggregation, complex joins | Joining the warehouse with S3 history | Intermittent ad hoc SQL | Millisecond lookups by key, large-scale concurrency | Transactions, joins, constraints |
| Does poorly | Per-record transactions | Writes (read-only) | Millisecond responses, row-level updates (except Iceberg) | Arbitrary column aggregation, joins | Column aggregation over hundreds of millions of rows |
| Billing unit | Node hours or RPU-hours + storage | Scan volume | Scan volume (10 MB minimum per query) | Request units or provisioned capacity | Instance hours + storage |
| Tuning knobs | Distribution key, sort key, WLM | Partitions, file format | Partitions, file format, workgroup | Partition key, GSI, capacity mode | Indexes, Read Replica |
| Consistency | Transactional | File point-in-time | File point-in-time | Eventual (default), strongly consistent read optional | Transactional (ACID) |
| Serverless option | Redshift Serverless | - | Serverless by default | On-demand mode | Aurora Serverless |

> 💡 **Related Theory**: Columnar storage (Redshift, Parquet) is strong at "aggregating a few columns across many rows," and row-based storage (RDS, Aurora) is strong at "reading and updating all the columns of one row." DynamoDB is neither; it is strong at "straight to the answer if you know the key." Look at the verb in the question. Summing, trends, and reports point to columnar; orders, payments, and updates point to row-based; lookups, sessions, and state point to key-value.

## The Same Problem Under Different Names: Skew

Distributed systems split data up and work on it in parallel. When the criterion for splitting is lopsided, parallelism breaks down. The skews we saw this week and in earlier weeks all have the same structure.

| Service | Splitting criterion | When lopsided | Symptom | Prescription |
|------|------|------|------|------|
| Redshift | Value of the DISTKEY → slice | Skew | Only one node is busy and the whole query waits for that slice | An evenly distributed DISTKEY, or EVEN |
| DynamoDB | Hash of the partition key → partition | Hot partition | Table capacity is left over but only certain keys are throttled | Even key, write sharding |
| Kinesis Data Streams | Hash of the partition key → shard | Hot shard | Only certain shards are throttled | Even key (adding shards does not fix it) |
| S3 + Athena | Partition key → prefix | Uneven partition sizes, small files | Only some partitions are slow, file count explodes | Redesign the partition key, compaction |

- Common principle: choose a **key with many distinct values whose traffic and row counts spread evenly**. A key with few values or one dominant value, such as `status`, `country`, or `date`, is bad everywhere.
- Difference: Redshift must use the same key as its join partner to eliminate redistribution, so it compromises between "even distribution" and "matching join keys." DynamoDB has no joins, so you only need to look at the access patterns.

## The Same Problem Under Different Tools: Skipping

The way to make an analytics query fast and cheap is, in the end, **not to read**.

| Level | Redshift | Athena / Spectrum (S3) | DynamoDB |
|------|------|------|------|
| Skip large chunks | Sort key + zone map (min and max of 1 MB blocks) | Partition pruning (prefix) | Only one partition through the partition key |
| Skip within a chunk | Block-level skipping | Per-range statistics in Parquet/ORC | Only the range through the sort key condition |
| Skip columns | Columnar storage | Columnar format + SELECT only the needed columns | Index projection (copy only the needed attributes) |
| When it is defeated | A function applied to the sort key, unsorted region | No partition key condition, CSV or JSON | Scan + FilterExpression |

- All three stores have the trap of "reading everything even though you added a condition." In Redshift it is a filter on a column that is not the sort key, in Athena a filter on a column that is not the partition key, and in DynamoDB a filter on an attribute that is not a key (Scan).

## The Billing Unit Sets the Direction of Optimization

| Store | Where the money goes | How to reduce it | Wasted effort |
|------|------|------|------|
| Athena | Bytes scanned | Partitions, Parquet, compression, only the needed columns, result reuse | Aiming only to shorten query execution time |
| Redshift Spectrum | Bytes scanned | Same as Athena | Adding cluster capacity |
| Redshift provisioned | Hours the nodes are on | Right size, pause, concurrency scaling for peaks | Reducing the scan volume of individual queries (the charge stays the same, only performance improves) |
| Redshift Serverless | RPU-hours used by queries | Adjust base capacity, maximum RPU-hours limit | - |
| DynamoDB on-demand | Read and write request units | Eliminate Scans, small items, remove unneeded GSIs | Reducing capacity in advance (the concept does not exist) |
| DynamoDB provisioned | The capacity you set | Auto Scaling, use for steady workloads | Leaving it as it is during idle hours |
| RDS / Aurora | Instance hours, storage, (I/O for Aurora Standard) | Right-size instances, move analytics load to another store | Adding replicas without limit |

- If the question says "minimize cost," first look at **how often it is used**. If occasionally, scan or request billing (Athena, on-demand, Serverless) is cheaper; if constantly, capacity billing (provisioned Redshift, DynamoDB) is cheaper.

## From Operations to Analytics: Choosing the Path

For the requirement "I want to analyze OLTP data," there are several paths. Choose by freshness and operational burden.

| Path | Freshness | Operational burden | Transformation | When it fits |
|------|------|------|------|------|
| Read Replica / Aurora reader | As much as the replication lag | Very low | None | Taking light reports off the writer |
| Federated query (Athena, Redshift) | Real time (direct query) | Low | In the query | Occasional joins, volumes not worth moving |
| Zero-ETL → Redshift | Near real time for Aurora and RDS, minimum 15 minutes for DynamoDB | Very low | None (process inside Redshift) | Continuously analyzing the operational DB in the warehouse |
| DMS (full load + CDC) | Near real time | Medium (replication instance and tasks) | Mapping, simple rules | Heterogeneous engines, on-premises, diverse targets such as S3 and Kinesis |
| DynamoDB Streams → Lambda | Seconds | Medium (function code) | In code | Reacting to change events, small-scale replication |
| Kinesis Data Streams → Firehose → S3 | As much as the buffer | Low | Firehose transformation | Continuously loading DynamoDB changes into the lake |
| S3 export (DynamoDB), snapshot export (RDS) | The time of export | Low | Afterward with Glue or Athena | Regular snapshot analysis with no operational load |
| Glue ETL (JDBC, bookmarks) | Batch interval | Medium (job management) | Arbitrary code | Loads that need complex cleansing and joins |

```text
"Must not put load on the operational DB"     → export, zero-ETL, read replica (direct Scan or federation causes load)
"Do not want to manage a pipeline"            → zero-ETL
"The engine is different / it is on-premises" → DMS (+ schema conversion)
"Complex transformation needed during replication" → Glue ETL
"Must react the moment a change occurs"       → stream + Lambda
"Look occasionally without moving the data"   → federated query
```

> 💡 **Related Theory**: "Keep operations (OLTP) and analytics (OLAP) on different engines" is the cardinal principle of data engineering. Only the means of connecting the two has changed. Going from hand-built ETL to DMS's CDC and then to managed zero-ETL reduced the operational burden. Even so, at the moment a transformation is needed, you still need Glue or SQL inside the warehouse. What zero-ETL removed is the management of E and L, not the need for T.

## Telling Look-Alikes Apart at Once

| Confusing pair | How to distinguish |
|------|------|
| Athena vs Redshift Spectrum | Both read S3 with scan-volume billing. Athena is standalone serverless; Spectrum requires Redshift and is meant for joining with internal tables |
| Loading into Redshift vs Spectrum | If read often and fast, load; if it is large history read occasionally, keep it on S3 and use Spectrum |
| DISTKEY vs SORTKEY | DISTKEY = which slice to place it on (joins, parallelism). SORTKEY = in what order to place it within a slice (block skipping) |
| DISTSTYLE ALL vs KEY | ALL = replicate a small, rarely changing dimension to all nodes. KEY = gather large tables by the join key |
| COMPOUND vs INTERLEAVED | COMPOUND = mainly filters on leading columns. INTERLEAVED = filters on combinations of several columns, expensive to maintain |
| Concurrency scaling vs resize | Scaling = temporary clusters for short bursts. Resize = grow the cluster itself for a constant capacity shortage |
| WLM vs workgroup | WLM = Redshift's queues, memory, and priority. Workgroup = Athena's result location, scan limits, and isolation |
| Redshift QMR vs Athena per-query limit | Both guard against runaway queries. QMR is based on metrics such as time and row counts; Athena is based on bytes scanned |
| GSI vs LSI | GSI = a different partition key, can be added anytime, eventually consistent. LSI = the same partition key, only at creation, strong consistency possible |
| DynamoDB Streams vs Kinesis Data Streams | Streams = 24 hours, no duplicates, Lambda-centered. KDS = up to 1 year, more consumers, connects to Firehose and Flink |
| Read Replica vs Multi-AZ | Replica = spreading reads (asynchronous). Multi-AZ = availability (the standby instance cannot serve reads) |
| Zero-ETL vs DMS | Zero-ETL = managed replication for fixed combinations, no transformation. DMS = wide combinations, heterogeneous migration, you operate it yourself |
| CTAS vs view vs materialized view | CTAS (Athena) = writes the result to S3 as a new table. View = stores only the query. Materialized view (Redshift) = stores the result and refreshes it |
| Athena partition projection vs Redshift sort key | Projection = eliminates partition metadata lookups. Sort key = reduces data block reads |

## Week 7 Numbers and Defaults on One Page

| Service | Item | Value |
|------|------|------|
| Redshift | Block size | 1 MB (min and max recorded per block) |
| Redshift | INTERLEAVED sort key columns | Up to 8 |
| Redshift | Manual WLM | Up to 8 user queues, at most 50 slots in total, default queue concurrency of 5 |
| Redshift | Concurrency scaling free credit | Accrues 1 hour per day, up to 30 hours accumulated |
| Redshift | Default number of concurrency scaling clusters | 1 |
| Redshift | COPY automatic splitting | Splittable files of 128 MB or larger |
| Redshift | Recommended size for unsplittable files | 1 MB to 1 GB after compression, file count a multiple of the slice count |
| Redshift Serverless | Base capacity | Default 128 RPUs, minimum 4 RPUs. Billed per second, 60-second minimum |
| Spectrum, Athena | Minimum charge per query | 10 MB |
| Athena | CTAS and INSERT INTO partitions | 100 at once |
| Athena | CTAS default Parquet compression | GZIP |
| Athena | Query result reuse | 60 minutes by default, up to 7 days |
| Athena | Partitions read in a single scan | Up to 1 million |
| DynamoDB | Maximum item size | 400 KB |
| DynamoDB | Read and write units | Read 4 KB (1 strongly consistent = 2 eventually consistent), write 1 KB |
| DynamoDB | Throughput per partition | 3,000 read units and 1,000 write units per second |
| DynamoDB | Number of indexes | 20 GSIs by default, 5 LSIs |
| DynamoDB | Query and Scan response | Up to 1 MB per call |
| DynamoDB | Streams retention / concurrent readers per shard | 24 hours / 2 |
| DynamoDB | Incremental export window | Minimum 15 minutes, maximum 24 hours |
| DynamoDB | New on-demand table | Up to 4,000 writes and 12,000 reads per second |
| Aurora | Storage replication | 3 AZs, 6 storage nodes |
| Aurora | Number of readers | Up to 15 |
| Aurora | Cluster volume limit | 128 TiB (256 TiB for the latest engine versions) |
| Zero-ETL | Minimum latency for DynamoDB → Redshift | 15 minutes |

## Integrated Scenario: Data Flow of a Commerce Service

Let us follow one company's store layout and attach the reason for each choice.

```text
[Mobile app]
   ├─ Cart · sessions ───► DynamoDB (on-demand) ──Kinesis Data Streams──► Firehose ──► S3 (behavior log lake)
   └─ Orders · payments ─► Aurora (writer + reader)
                              ├─ reader ────────► customer service lookup screen
                              └─ zero-ETL ──────► Redshift ──► executive dashboard
                                                    ▲
S3 lake (3 years of logs, Parquet · date partitions) ──Spectrum──┘        Athena ──► data scientists' ad hoc analysis
```

| Point | Choice | Reason | Common wrong answer |
|------|------|------|------|
| Cart | DynamoDB on-demand | Millisecond lookups by user ID, traffic spikes during events | Aurora (hard to handle spikes) |
| Orders and payments | Aurora | Transactions spanning several tables, consistency | DynamoDB (unsuitable for joins and complex transactions) |
| Customer service lookup | Aurora reader | The same schema as is, protects the writer | Redshift (excessive for per-record lookups) |
| Executive dashboard | Zero-ETL → Redshift | Aggregation over hundreds of millions of rows, no pipeline to manage | Aggregating directly on the reader (slow because it is row-based) |
| 3 years of logs | S3 + Spectrum | Large volumes queried occasionally are not loaded | Loading everything into Redshift (storage and load cost) |
| Ad hoc analysis | Athena | Intermittent, no cluster needed | A dedicated Redshift cluster |
| Loading DynamoDB changes | Kinesis Data Streams → Firehose | Continuous load into S3 with no code, long retention | Periodic Scan (consumes production capacity) |

- If the dashboard is hit at 9 AM, turn on concurrency scaling in Redshift. A short once-a-day peak often ends within the free credit.
- The order fact table in Redshift is frequently joined with the customer dimension, so `customer_id` is the DISTKEY, and because date range queries are common, the order date is the first sort key column. The small region dimension is ALL.
- On the data scientists' Athena workgroup, set a per-query scan limit to block a query that accidentally reads all 3 years.

## Collection of Anti-Patterns

- **Using DynamoDB as a reporting DB**: Aggregating with Scan and filters burns read capacity. Export it with an export or a stream.
- **Adding a GSI for every aggregation axis**: Only the write cost goes up, and you still cannot aggregate.
- **Running month-end settlement queries on the Aurora writer**: Transactions slow down. Move them to a reader or Redshift.
- **DISTSTYLE ALL on every table**: Storage and load time are multiplied by the node count.
- **A DISTKEY unrelated to the join key, or a skewed column**: Redistribution or skew.
- **Repeating single-row INSERTs into Redshift**: Batch them and load with COPY.
- **`SELECT *` on raw CSV in Athena**: The most expensive combination.
- **Keeping a provisioned cluster running constantly for occasional analytics**: Athena or Redshift Serverless is the right fit.
- **Hitting the operational DB with large hourly federated queries**: Operational load accumulates. Switch to replication.

## Scenario → Answer Lookup Table

| Scenario | Answer |
|------|------|
| Occasional SQL analysis of S3 data with no infrastructure | Athena |
| Two large tables frequently joined on the same key, eliminate redistribution | Make that column the DISTKEY on both sides |
| Optimizing the join of a small dimension table | DISTSTYLE ALL |
| Date range queries are slow (Redshift) | Date as the sort key |
| Redshift queries wait in the queue every morning | Concurrency scaling |
| Query warehouse data together with old history on S3 | Redshift Spectrum |
| Athena cost is high | Partitions + Parquet + compression + only the needed columns |
| Tens of thousands of Athena partitions, metadata lookup bottleneck | Partition projection |
| Controlling Athena cost per team | Workgroup + per-query scan limit |
| Join S3 and RDS without moving data | Athena federated query |
| Large-scale aggregation of DynamoDB operational data | Move it to S3/Redshift with an export or stream and analyze there |
| Analyze a whole DynamoDB table with no load on the table | S3 export (PITR) |
| Reacting to DynamoDB changes in real time | Streams + Lambda |
| Aurora in Redshift in near real time, with no pipeline | Zero-ETL |
| Oracle → Aurora migration + continuous replication | DMS |
| First way to reduce reporting load on the operational DB | Read Replica |
| Intermittent warehouse workload, minimal operations | Redshift Serverless |

Next week we move to the side that watches over pipelines: monitoring with CloudWatch metrics, logs, and alarms.

## 📖 Glossary

- **Read pattern**: The way a workload reads data. Whether it is per-record lookup, range aggregation, or search divides the stores.
- **Billing unit**: The basis on which a service sets its charges. Examples are scan volume, compute time, and request units.
- **Skew (skew, hot partition)**: A phenomenon in which the values of the key used for distribution are lopsided, so load piles onto only some nodes or partitions.
- **Data skipping**: An optimization that uses statistics or path structure to avoid reading data that does not match the condition at all.
- **Lakehouse**: A configuration that queries warehouse tables and S3 lake data together.
- **CQRS**: A separation pattern that hands writes and per-record lookups, and analytics and aggregation, to different stores.
- **Freshness**: The time it takes for a value changed at the source to become visible on the analytics side.
- **Fact table / dimension table**: A large table where measurements accumulate, and the small reference tables that describe them.

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
