# Day 1 - S3 Data Lake Layout and Partitioning Strategy

## 📌 Key Takeaways

- Split the lake into **raw → clean → curated** zones. Never overwrite the original data, and give each zone different permissions, formats, and storage classes.
- Hive-style (`key=value`) partitions are **pruned** by the partition keys in the WHERE clause. Match the keys to the filters of the most common queries, and do not slice finely for rare queries.
- Over-partitioning causes the **small files problem**. Keep files at 128MB to 1GB, and either write large files on the producer side or merge them through compaction.
- When there are tens of thousands of partitions, catalog lookups become the bottleneck. **Partition projection** lets Athena compute partitions from rules, but it is Athena-only and actually gets slower when many partitions are empty.
- Analytics zones default to **Parquet/ORC + compression**. S3 request limits scale automatically per prefix, so prefer a readable hierarchy over hashed prefixes.

## Why S3 Is Suitable as Data Lake Storage

The core of a data lake is "leave the original data untouched, and build up refined copies stage by stage." There are three reasons S3 sits at the bottom of it.

- **Capacity and durability**: Virtually unlimited capacity and durability designed for 99.999999999% (11 9's).
- **Separation of compute and storage**: Keep just one copy of the data in S3, and Athena, EMR, Redshift Spectrum, and Glue read the same files at the same time. You do not need to move the data when you change engines.
- **schema-on-read**: Store first, and apply the schema when reading. A table is just Glue Data Catalog metadata that says "interpret this S3 path with these columns."

> 💡 **Related Theory**: A data lake is schema-on-read, while a data warehouse is schema-on-write. A lake stores structured, semi-structured, and unstructured data in its original form and assigns a schema at query time. Ingestion is therefore fast and flexible, but quality validation is pushed back until after ingestion. This is where the reason for splitting zones comes from.

## Zone-Based Layout: raw → clean → curated

Separate buckets or prefixes by processing stage. A three-tier layout is typical, and it is the same concept as bronze/silver/gold in the medallion architecture.

```text
s3://company-datalake-raw/         # Raw(Bronze) — original as-is, immutable
  └── source=salesforce/dt=2026-06-25/...

s3://company-datalake-clean/       # Clean(Silver) — validated, deduplicated, type-normalized
  └── domain=sales/orders/year=2026/month=06/day=25/...

s3://company-datalake-curated/     # Curated(Gold) — business aggregates, consumed by BI/ML
  └── mart=revenue/daily_summary/year=2026/month=06/...
```

| Zone | Holds | Format | Written by | Read by | Principle |
|------|------|------|------|------|------|
| Raw | Collected originals as-is | Source format (JSON, CSV, logs) | Ingestion pipeline | Data engineers, ETL | Never overwrite. The single source of truth for reprocessing |
| Clean | Data with validated schema, handled missing values, normalized types | Parquet/ORC | Glue ETL, Spark | ETL, some analysts | Keeps the per-source structure, the stage before joins |
| Curated | Analytics-ready data after joins and aggregation | Parquet/ORC or a table format | Aggregation jobs | Athena, QuickSight, ML | Partitioning and sorting tailored to consumption patterns |

- Splitting zones **by bucket** makes it easy to apply different bucket policies, lifecycle rules, encryption keys, and replication per zone. Splitting **by prefix** reduces the number of buckets, but policies become complicated with prefix conditions. When permission boundaries differ, splitting into buckets is simpler.
- Raw is kept immutable so that you can "rebuild everything from scratch after fixing a logic bug." Clean and Curated must be regenerable from Raw at any time.
- Narrow permissions along the zones. Raw is for engineers only, and Curated extends to analysts. Column-level and row-level control is handled by Lake Formation, which we cover tomorrow.

## How Partitioning and Pruning Actually Work

Partitioning is a technique that splits data into per-key prefixes to reduce the amount a query scans.

```text
s3://datalake-clean/orders/year=2026/month=06/day=25/region=us-east-1/file.parquet
```

The `key=value` form is called **Hive-style partitioning**, and the Glue crawler and Athena's `MSCK REPAIR TABLE` recognize this form as partitions.

```sql
-- Partition pruning works: only the year/month/day prefix is scanned
SELECT region, SUM(amount)
FROM orders
WHERE year = 2026 AND month = 6 AND day = 25
GROUP BY region;
```

Athena processes this query in the following order.

1. It reads the table metadata and calls `GetPartitions` on the Glue Data Catalog to get the partition list.
2. It filters the list with the WHERE conditions (pruning). Only the S3 locations of the remaining partitions are targeted.
3. For each remaining location, it **lists** S3 to build the file list.
4. It reads the files. With a columnar format, it reads only the needed columns and only the ranges that match the statistics.

Three facts follow from this order.

- **Wrapping a partition column in a function weakens pruning.** A condition that compares the key value directly prunes best. If every partition key has an equality condition, the metadata can be fetched directly, which is the fastest.
- **A partition that is not in the catalog is not queried even if files exist in S3.** If "yesterday's data is in S3 but the result is 0 rows," an unregistered partition is the first suspect.
- **STRING is the better type for partition keys.** For Athena to push the partition filter down to Glue, the key must be a string, and other types can be slower when there are many partitions. If you want to use it like a date, cast it in the query.

```sql
-- Check which partitions will be read before running
EXPLAIN SELECT COUNT(*) FROM orders WHERE dt BETWEEN '2026-06-23' AND '2026-06-25';
-- If [[2026-06-23], [2026-06-24], [2026-06-25]] appears under the dt:string:PARTITION_KEY line of the output, pruning succeeded
```

## How to Choose Partition Keys

- **Match the filters of the most common queries.** If most queries are by date range, the date is the key. Do not optimize for rare queries.
- **If you query by day, do not split down to the hour.** Handle occasional time-of-day queries with a timestamp column filter. If you sort the data inside the files by timestamp, the min/max statistics of the columnar format let you skip unneeded ranges, giving an effect close to hourly partitions.
- **Do not use high-cardinality values (such as user_id) as partition keys.** You get a flood of small files with only a few records per partition. If lookups of specific values are common, bucketing (gathering the same values into the same file) is the right tool.
- Put the date either as a `year=/month=/day=` hierarchy or as a single `dt=2026-06-25` key. A single key makes range conditions easier to write and keeps projection settings simpler.

| Choice | What you gain | What you lose |
|------|------|------|
| No partitioning | Nothing to manage | Every query is a full scan |
| Date (daily) | Scan volume for date queries drops sharply, easy to manage | Filters on other axes still scan everything |
| Date + region etc., 2 to 3 levels | Pruning on both axes | Partition count = product of each key's value count, files get fragmented |
| Hourly or high cardinality | Only very narrow queries are fast | Small file explosion, catalog and listing overhead |

The small files problem: When planning a query, Athena lists the locations of all target partitions and pays request and processing overhead for each file. For the same records, one large file is faster than several small files. S3 listing returns at most 1,000 entries at a time, so if a partition has more than 1,000 files, listing takes multiple calls. With columnar formats, small files let the format's own overhead outweigh its benefits (the default Parquet row group size is 128MB).

## How to Reduce Small Files

The best time is **before writing**. If they have already piled up, merge them.

| Situation | Action |
|------|------|
| Streaming ingestion pours out small files | Increase the writer-side buffer (Firehose buffer size and interval) |
| Partitions are split too finely | Reduce the partition keys |
| A Glue job is slow reading hundreds of thousands of small JSON/CSV files | Group them at read time with `groupFiles`/`groupSize` |
| Small Parquet files already accumulated | Rewrite and merge with a Glue/Spark job or Athena CTAS |
| Iceberg table | `OPTIMIZE ... REWRITE DATA USING BIN_PACK` or Glue automatic compaction |

- Glue's `groupFiles` is an option that groups multiple files into one task **at read time**. It applies to formats such as csv, json, and xml, and is not supported for Parquet, ORC, or Avro input. Glue turns it on automatically when there are more than 50,000 input files. Making output files larger is a separate matter, and requires reducing the number of partitions before writing.

```python
# Glue: read small JSON files grouped into roughly 128MB units
dyf = glueContext.create_dynamic_frame.from_options(
    "s3",
    {"paths": ["s3://acme-datalake-raw-prod/events/"], "recurse": True,
     "groupFiles": "inPartition", "groupSize": "134217728"},
    format="json",
)
```

## Four Ways to Manage Partition Metadata

| Method | Behavior | Suitable when | Caveats |
|------|------|------|------|
| `MSCK REPAIR TABLE` | Scans S3 and adds Hive-style partitions to the catalog | When first creating a table, or when consistency is in doubt | Only adds, never deletes. Slow with many partitions, and on timeout only some are registered |
| `ALTER TABLE ADD PARTITION` | Registers only the specified partitions | Pipelines that create a new partition every day, non-Hive-style paths | The pipeline must call it directly |
| Glue crawler | Detects and registers the schema and partitions | Sources whose schema changes along with them | Delayed by the run interval. Crawler run cost |
| Partition projection | Computes from rules in table properties without registration | Very many partitions with a regular pattern | Works only in Athena |

- If the path is not `key=value`, such as `2026/06/25/`, `MSCK REPAIR TABLE` cannot find it. Specify the location directly with `ALTER TABLE ADD PARTITION ... LOCATION`, or use the path template of projection.
- If you delete partition data from S3 (including lifecycle expiration), also delete the partition entry in the catalog with `ALTER TABLE DROP PARTITION`. Empty partitions are also listed at the planning stage, so they slow things down when they pile up.
- To keep the registration approach but make lookups faster, use the Glue Data Catalog **partition index**. It puts an index on the partition list so that partitions matching a condition are found quickly.

## Partition Projection

When `GetPartitions` calls are the bottleneck for a table with many partitions, you can have Athena skip the catalog and **compute partition values and locations in memory from rules written in the table properties**.

```sql
ALTER TABLE orders SET TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.dt.type' = 'date',
  'projection.dt.range' = '2024-01-01,NOW',
  'projection.dt.format' = 'yyyy-MM-dd',
  'storage.location.template' = 's3://datalake-clean/orders/dt=${dt}/'
);
```

- As days pass, the range automatically extends up to `NOW`, so the partition registration task disappears.
- When projection is enabled, Athena **ignores the partition metadata registered in the catalog** for that table.
- Even if there is no data at the location the rule points to, you get 0 rows without an error. Querying a value outside the range also gives 0 rows rather than an error.
- On **sparse tables with many empty partitions**, it actually gets slower because every computed location is listed in S3. If more than half of the projection targets are empty, regular partitions are better.
- **It is used only in Athena.** If the same table is read by Redshift Spectrum, EMR, or Athena for Spark, they use the regular partition metadata in the catalog. For a table read by multiple engines, you must also register partitions in parallel.
- If there is no condition on a partition key, it computes and lists the entire range. For keys with a very large number of values, use the `injected` type (which takes the value from an equality condition in the query) instead of a range.

> ⚠️ **Pitfall**: Pruning and projection are different things. Pruning means "read only the partitions that match the condition," and it always happens on a partitioned table. Projection means "compute the partition list instead of fetching it from the catalog." If the correct answer is "reduce scan volume," it is pruning; if the correct answer is "remove the burden of catalog lookups and partition registration," it is projection.

## Naming Conventions and Request Limits

- Bucket names are globally unique and use lowercase letters, digits, and hyphens. Make the environment and zone visible: `acme-datalake-raw-prod`.
- Keep prefixes consistent in `domain/entity/partition` order. Give each table a **non-overlapping path**. If another table's path lies under one table's path, `MSCK REPAIR TABLE` pulls in the other table's partitions too.
- Write partition key names in lowercase. Camel-case paths such as `userId=` may not be registered by `MSCK REPAIR TABLE`.
- Keep files **flat** under a partition location. Creating further subdirectories causes listing to happen multiple times.
- Put a timestamp or UUID in the file name to prevent collisions: `orders_20260625_a1b2.parquet`.

S3 handles at least 3,500 PUT/COPY/POST/DELETE requests and 5,500 GET/HEAD requests per second per prefix, with no limit on the number of prefixes. So hashed prefixes for request distribution are no longer required, and a meaningful hierarchy takes priority. However, this scaling is **gradual**, so `503 Slow Down` can occur while requests spike. If an Athena query fails with `SlowDown`, there are too many files or concurrent queries are piling onto the same data.

## Columnar Formats and Compression

| Aspect | CSV/JSON (row-based) | Parquet/ORC (columnar) |
|------|------|------|
| Range read | Whole rows | Only the needed columns |
| Skipping | Not possible | Skips ranges outside the condition using per-range min/max statistics |
| Compression efficiency | Low | High, because values of the same type sit together |
| Split parallel processing | Mostly impossible when compressed | Possible regardless of compression codec |
| Suitable zone | Raw | Clean, Curated |

- If a text file is compressed with gzip, it must be read from the beginning, so multiple workers cannot divide a single file. For compressed text, the number of files is the upper bound of parallelism. Parquet/ORC is divided into internal units (row groups, stripes), so this problem does not exist.
- Compression reduces both stored volume and scanned volume. Athena bills scan volume based on the **compressed size**.

```bash
# Example of loading Parquet into the Clean zone (AWS CLI)
aws s3 cp ./orders.parquet \
  s3://acme-datalake-clean-prod/sales/orders/year=2026/month=06/day=25/orders.parquet
```

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Files exist in S3 but the result is 0 rows | Partition not registered | `ALTER TABLE ADD PARTITION`, a crawler, or projection |
| Only a specific date gives 0 rows on a projection table | Out of range or path template mismatch | Check `projection.*.range` and `storage.location.template` |
| A date was given in WHERE but scan volume is unchanged | The condition is on a regular column, not a partition key | Filter by the partition key, verify with `EXPLAIN` |
| The query planning phase is long | Tens of thousands of partitions, accumulated empty partitions | Projection or partition index, clean up old partition metadata |
| `SlowDown` error | Too many small files, concentrated concurrent queries | Merge files, reduce partition keys, spread out queries |
| `MSCK REPAIR TABLE` cannot find partitions | Not Hive-style, or the path contains uppercase | `ALTER TABLE ADD PARTITION ... LOCATION` |
| Storage cost and request cost rise together | Small file explosion | Increase writer-side buffer, compaction |

## Exam Clue → Answer Lookup

| Clue in the question | Answer |
|------|------|
| "Keep the original unchanged, the baseline for reprocessing" | Raw zone |
| "Queries only a specific date but scans everything" | Partition by date, then filter by the partition key |
| "Tens of thousands of partitions, catalog lookups are slow / automate partition registration" | Partition projection |
| "The same table is read by both Athena and Redshift Spectrum" | Register partitions in the catalog (projection alone is not enough) |
| "Hundreds of thousands of small files make queries slow" | Compaction, write large files on the producer side |
| "Read only the needed columns to cut cost" | Parquet/ORC |
| "Most queries look up a specific user_id" | Bucketing, not partitioning |
| "Add one new partition every day" | `ALTER TABLE ADD PARTITION` or projection (repeatedly running `MSCK` is inefficient) |

Tomorrow we cover Lake Formation, which centrally controls "who can see which tables, columns, and rows" on top of this lake.

## 📖 Glossary

- **Zone**: A section of the lake divided by processing stage. A three-tier raw, clean, curated layout is typical.
- **schema-on-read**: A method that applies the schema when reading rather than when storing.
- **Hive-style partitioning**: A convention that expresses partitions by putting `key=value` in the path.
- **Partition pruning**: Reading only the paths of partitions that match the WHERE condition and skipping the rest.
- **Partition projection**: An Athena feature that computes partitions from rules in table properties instead of registering them in the catalog.
- **Partition index**: An index placed on the partition list of the Glue Data Catalog. It finds partitions matching a condition quickly.
- **Small files problem**: The phenomenon where there are too many, too small files, so listing, request, and metadata overhead grows.
- **Compaction**: The task of rewriting and merging several small files into a larger file.
- **Bucketing**: A technique that distributes records into a fixed number of files by the hash of a specific column value. The same value gathers in the same file.
- **Columnar format**: A format such as Parquet or ORC that stores data column by column.

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
