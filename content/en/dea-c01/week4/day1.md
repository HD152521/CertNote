# Day 1 - Glue Data Catalog and Crawlers: Adding Metadata to Data

## 📌 Key Takeaways

- The Glue Data Catalog is a **central metadata repository** compatible with the Hive metastore. A table is not the data but a "location, format, and schema" specification, and Athena, Redshift Spectrum, EMR, and Glue ETL share the same definition.
- A crawler identifies the format with a Classifier, infers the schema and **Hive-style (`key=value`) partitions**, and registers them in the Catalog. It does not move or change the data.
- There are four ways to register partitions: crawler, `ALTER TABLE ADD PARTITION`, `MSCK REPAIR TABLE`, and partition projection, chosen according to scale and path conventions.
- **Partition projection is Athena-only.** If the same table is also read by Redshift Spectrum or EMR, registering partition metadata is still necessary.
- Crawler cost is proportional to run time (DPU-hours), so reduce the scan scope with incremental crawls and S3 event crawls.

## Data Catalog Structure: Database → Table → Partition

Millions of Parquet files piled up in S3 are, by themselves, just "byte blobs." If no one knows which columns exist, what the types are, and by which keys the data is partitioned, you cannot run even one line of SQL. **AWS Glue Data Catalog** is what manages this "data about data," that is, **metadata**, centrally. When an exam scenario says "Athena queries S3," "Redshift Spectrum reads external tables," or "EMR shares a Hive metastore," the Glue Data Catalog is almost always behind it.

At its core, the Data Catalog is a **managed metadata repository compatible with the Apache Hive metastore**. If you have ever stood up and run a Hive metastore on RDS yourself, understand it as a service where AWS shoulders that operational burden (availability, backups, schema versions) for you.

The Catalog has a hierarchical structure.

| Level | Meaning | Example |
|------|------|------|
| Database | Logical group of tables (namespace) | `sales_db` |
| Table | Schema + S3 location + format definition | `orders` |
| Partition | Physical division inside a table | `year=2026/month=06` |
| Column | Column name and data type | `order_id: bigint` |

The most important point here is that **a table does not hold data**. A table is just a **pointer and specification** saying "the actual data is in `s3://bucket/orders/`, it is Parquet format, and the columns are like this." Thanks to this separation, Athena, Redshift Spectrum, EMR, and Glue ETL can all read the same S3 data with the same schema.

```sql
-- Table definition registered in the Catalog (conceptual DDL)
CREATE EXTERNAL TABLE sales_db.orders (
  order_id   BIGINT,
  amount     DECIMAL(10,2),
  status     STRING
)
PARTITIONED BY (year INT, month INT)
STORED AS PARQUET
LOCATION 's3://my-lake/orders/';
```

"Schema-on-read" is the core idea of the data lake. A traditional database (schema-on-write) enforces the schema the moment data is written. In contrast, a data lake stores the original as-is in S3 and **applies the schema at read time**. The Data Catalog is exactly where this "schema at read time" is kept. This is where the flexibility of mapping several tables (different schemas) onto the same files comes from.

## Crawlers: Robots That Fill In Metadata Automatically

Registering tables one by one with DDL is unrealistic, even more so for data with dozens of columns and partitions that grow every day. A **Glue crawler** scans a data store you specify (mainly an S3 path), infers the file format and schema, and automatically registers the result in the Catalog as tables and partitions.

The crawler's operating steps are as follows.

```
1. Connect to the data store (S3 path, JDBC, DynamoDB, etc.)
2. Identify the format with a Classifier (Parquet/JSON/CSV/ORC/Avro...)
3. Infer the schema (column names, types)
4. Detect the partition structure (key=value patterns in folder paths)
5. Create a table in the Catalog or update an existing table
```

```bash
# Create and run a crawler (AWS CLI)
aws glue create-crawler \
  --name orders-crawler \
  --role AWSGlueServiceRole-lake \
  --database-name sales_db \
  --targets '{"S3Targets":[{"Path":"s3://my-lake/orders/"}]}' \
  --schedule "cron(0 2 * * ? *)"   # every day at 2 AM

aws glue start-crawler --name orders-crawler
```

The crawler first identifies the format with a **Classifier**. Built-in Classifiers recognize standard formats such as Parquet, ORC, Avro, JSON, CSV, and XML, and nonstandard formats are handled by defining a **Custom Classifier** (Grok pattern, regular expression, and so on) yourself. It tries several Classifiers in priority order and adopts the first one that matches.

Crawlers can be expensive or slow. If there are millions of S3 objects, the cost of scanning everything each time is substantial. That is why the **incremental crawl** option exists. If you configure it to scan "only folders newly added since the last crawl," cost and time drop sharply. Also, for a table where only new partitions grow, you can eliminate the crawler itself with `ALTER TABLE ADD PARTITION` or **partition projection (Athena)**.

## Partition Detection: The Folder Structure Is the Index

Partition detection is where the crawler is smartest. If the S3 path is in **Hive-style `key=value`** form, such as `s3://my-lake/orders/year=2026/month=06/day=25/`, the crawler automatically recognizes `year`, `month`, and `day` as partition columns.

```
s3://my-lake/orders/
├── year=2025/month=12/  ← partition (year=2025, month=12)
├── year=2026/month=05/
└── year=2026/month=06/  ← when newly added, the crawler registers the partition
```

Partitions matter because of **query pruning (partition pruning)**. If you query with `WHERE year=2026 AND month=06`, Athena scans only the files in that folder. Without partitions it scans all the data every time, so on Athena, which bills by scanned volume, cost explodes.

> ⚠️ **Pitfall**: If the folder is just `2026/06/25/` instead of `key=value`, the crawler cannot create partition names automatically and assigns meaningless names such as `partition_0` and `partition_1`. The standard approach is to use Hive-style paths from the start at the data loading stage. If data has already accumulated under non-Hive paths, map the partitions manually in the table definition or work around it with Athena partition projection.

## Schema Inference and Its Limits

The crawler's schema inference "reads a sample of files and guesses types," so it is not perfect. You need to know two typical pitfalls.

First, **type inference conflicts**. If the same column appears as an integer (`123`) in some files and a string (`"N/A"`) in others, the crawler either widens it to the broader type (string) or creates different schemas per folder.

Second, **schema merging and table splitting**. If files with incompatible schemas are mixed under one path, the crawler can split them into several tables instead of one. To prevent this, turn on the crawler setting "combine into a single schema when data is compatible."

> 🎯 **Scenario**: New files are loaded every day into `s3://lake/events/dt=YYYY-MM-DD/`. The analyst wants to quickly query only yesterday's data with Athena. The configuration is (1) load data into `dt=` Hive paths from the start → (2) schedule a Glue crawler as an incremental crawl every early morning → (3) the crawler registers the new `dt=` partition in the Catalog → (4) the analyst scans only that partition with `WHERE dt='2026-06-25'`. Since only new partitions grow, you can reduce cost further with partition projection instead of a crawler.

## Four Ways to Put Partitions into the Catalog

Even if a new partition folder appears in S3, if the Catalog does not know about it, Athena cannot read that data. Most of the symptom "yesterday's data doesn't show up" comes from this registration gap. There are four registration methods.

| Method | Behavior | Suitable situation | Caution |
|------|------|------|------|
| Crawler | Scans S3 and infers and registers the schema and partitions together | When you do not know the schema or it may change | Billed for scan time, and reflection is delayed by the run interval |
| `ALTER TABLE ADD PARTITION` | Registers the specified partition together with its location | When the loading pipeline knows the new partition, non-Hive paths | You must add a registration step to the pipeline |
| `MSCK REPAIR TABLE` | Sweeps the table location and adds Hive-style partitions all at once | When you have just created the table or are unsure whether metadata and S3 have drifted apart | Adds only, does not delete. Times out if there are many partitions |
| Partition projection | Does not register; computes at query time from rules in table properties | When rules are predictable such as dates, integers, or enumerated values and partitions are very numerous | Works only in Athena |

```sql
-- The pipeline registers the partition itself right after loading (non-Hive paths also possible)
ALTER TABLE events ADD IF NOT EXISTS
  PARTITION (dt = '2026-06-25')
  LOCATION 's3://lake/events/2026/06/25/';

-- Partition projection: computed by rules without registration
ALTER TABLE events SET TBLPROPERTIES (
  'projection.enabled'        = 'true',
  'projection.dt.type'        = 'date',
  'projection.dt.format'      = 'yyyy-MM-dd',
  'projection.dt.range'       = '2024-01-01,NOW',
  'storage.location.template' = 's3://lake/events/dt=${dt}/'
);
```

You need to know both why partition projection is fast and what it costs.

- For a regular table, at query time Athena calls `GetPartitions` on the Catalog to get the partition list and then prunes. With a very large number of partitions, this lookup itself becomes slow. Projection skips that call and computes partition locations from table properties alone.
- On a table with projection enabled, Athena **ignores the partition metadata registered in the Catalog**. Even partitions the crawler registered are not used.
- Querying a value out of range returns 0 rows without an error. If you set the end of the range to a fixed date rather than `NOW`, data after that date silently becomes invisible with no warning.
- Partitions with no data in S3 are also computed (the result is just empty). If more than half of the computed partitions are empty, regular partitions are actually better.
- Partitions computed by projection do not appear in `SHOW PARTITIONS`.

> ⚠️ **Pitfall**: Partition projection applies **only when querying with Athena**. If Redshift Spectrum, Athena for Spark, or EMR reads the same table, it uses the standard partition metadata registered in the Catalog. For an answer choice like "reduce cost by eliminating the crawler" to be correct, Athena must be the only consumer. If there are multiple engines, the answer is an incremental crawl or `ADD PARTITION` at load time.

## When You Re-Run a Crawler: Recrawl Scope and Schema Change Policy

Two things in the crawler settings are asked about by both the exam and real work: "how far will the next run look again" and "what should be done to the Catalog when the schema has changed."

| Recrawl method | Scan scope | Characteristics |
|-------------|-----------|------|
| Full crawl (default) | The entire target path | Reflects schema changes and even deletions. Slowest and most expensive |
| New subfolders only (`CRAWL_NEW_FOLDERS_ONLY`) | Folders added since the previous crawl | The first run is a full crawl. Cannot detect modifications or deletions of existing partitions |
| S3 event-based | Folders pointed to by S3 events accumulated in SQS | The first run is a full listing. If there are no events, there is nothing to scan |

- **Turning on the incremental crawl turns off schema updates and deletion reflection.** The update and delete behaviors are both fixed to `LOG`, so objects with an incompatible schema are not added to the Catalog and are only recorded in CloudWatch Logs. It is an option suited to data with a stable schema, and when there is a large schema change, you switch to a full crawl for a while and then switch back.
- **The default behavior is "update the Catalog schema to match the data."** To prevent the crawler from overwriting table definitions that ETL has refined, change to "add new columns only" (`MergeNewColumns`) or "ignore changes and only log" (`UpdateBehavior=LOG`).
- **You can make partitions inherit the table schema** (`InheritFromTable`). When a per-partition schema drifts from the table, Athena fails with `HIVE_PARTITION_SCHEMA_MISMATCH`, and this option removes that drift.
- **The problem of a table splitting into several tables under one path.** If files in `table1/year=2017/` have columns A, B and `table1/year=2018/` has C, D, the crawler judges the schemas not similar enough and creates two tables, `year_2017` and `year_2018`. If you turn on "single schema per path" (`CombineCompatibleSchemas`), then as long as formats are compatible it groups them into one table with columns A, B, C, D and a `year` partition.

```bash
# Crawl new folders only + objects with a different schema are only logged
aws glue update-crawler \
  --name orders-crawler \
  --recrawl-policy RecrawlBehavior=CRAWL_NEW_FOLDERS_ONLY \
  --schema-change-policy UpdateBehavior=LOG,DeleteBehavior=LOG

# Combine into a single table even if schemas differ slightly under one path
aws glue update-crawler \
  --name orders-crawler \
  --configuration '{"Version":1.0,"Grouping":{"TableGroupingPolicy":"CombineCompatibleSchemas"}}'
```

By default the crawler creates a **partition index** on S3 target tables. When finding "only specific year and month partitions" in a table with millions of partitions, the Catalog filters on the server side using the index instead of fetching the whole list and filtering. The `catalogPartitionPredicate` option of Glue ETL uses exactly this index. When the number of partitions is the cause of a problem, projection (Athena-only) and the partition index (common to all engines) are the two branches of the solution.

## Cost Structure: What Costs Money

- **Crawler**: Billed per second for DPU-hours used while running. The more objects there are, the longer listing and sample reading take, so the only way to reduce cost is to reduce the scan scope.
- **Data Catalog**: Based on the number of stored objects (tables, table versions, partitions, and so on) and the number of requests. The first 1 million stored objects and 1 million requests are in the free tier. As partitions swell to millions, storage cost and partition lookup latency both increase, which is another reason not to partition on a high-cardinality column.
- **Costs the crawler does not create**: The crawler does not copy data, so S3 storage cost is not duplicated. Query cost (Athena scanned volume) is determined not by the Catalog but by the file format and partition design.

## Choosing by Scenario

| Situation | Choice | Reason |
|------|------|------|
| Logs accumulate daily under the `dt=` convention and only Athena is used | Partition projection | Both the registration work and the crawler cost disappear |
| The same table is read by both Athena and Redshift Spectrum | Incremental crawl or `ADD PARTITION` at the loading stage | Projection is ignored outside Athena |
| The path is non-Hive such as `2026/06/25/` | `ADD PARTITION ... LOCATION` or the location template of projection | `MSCK REPAIR TABLE` finds only Hive-style |
| The source schema changes often and you do not know what will arrive | Full crawl | An incremental crawl does not reflect schema changes |
| The crawler overwrites table definitions that ETL organized | Set the schema change policy to "add new columns only" or "ignore" | The default is update |
| One crawl created dozens of tables | Check the path structure + single schema per path | If schema similarity is low, it splits by folder |
| A nonstandard log makes the columns come out as one lump | Custom Classifier (Grok) | The built-in Classifiers do not know the format |

Tomorrow we move on to **Glue ETL Jobs**, which take this Catalog's tables as input and transform the actual data.

## 📖 Glossary

- **Metadata**: Data about data. Things like column names and types, file locations, formats, and partition information.
- **Hive metastore**: The standard repository for keeping table definitions in the Hadoop ecosystem. The Glue Data Catalog is a managed service compatible with it.
- **Schema-on-read**: A method that leaves data as-is when storing and applies the schema at read time.
- **Crawler**: The Glue component that sweeps a data store, infers format, schema, and partitions, and registers them as tables in the Catalog.
- **Classifier**: A rule that identifies what format a file is. If the built-in Classifiers fail, you create a Custom Classifier with a Grok pattern or similar.
- **Partition pruning**: An optimization that reads only the partition folders matching the query condition and never opens the rest.
- **Partition projection**: A feature where partitions are not registered in the Catalog and Athena instead computes them at query time from rules written in table properties.
- **Incremental crawl**: A crawler option that scans only folders newly created since the previous crawl.
- **Partition index**: An index that helps the Catalog quickly find the desired partitions in a table with a very large number of partitions.

## 📝 Practice Problems

**Problem 1.** Central metadata store letting Athena, Redshift Spectrum, EMR query same S3 data with identical schema?

A) Amazon RDS  
B) AWS Glue Data Catalog  
C) Amazon DynamoDB  
D) AWS Lake Formation permissions  

**Answer: B**  
Explanation: Glue Data Catalog is Hive-compatible central metadata store; multiple engines share registered schemas. RDS and DynamoDB are data stores, not catalogs. Lake Formation manages permissions atop it.

---

**Problem 2.** S3 path `s3://lake/sales/region=us/year=2026/`. What does Glue Crawler do?

A) Ignore `region` and `year`, create single non-partitioned table  
B) Copy all files to DynamoDB  
C) Auto-recognize `region` and `year` as partition columns, register in Catalog  
D) Reject Hive-style paths with error  

**Answer: C**  
Explanation: Crawlers auto-detect `key=value` Hive-style paths as partitions. These enable partition pruning to cut scan volume and cost. Crawlers only handle metadata, not data copying.

---

**Problem 3.** Most accurate description of Glue Data Catalog table?

A) Table is metadata spec (schema, S3 location, format); data itself stays in S3  
B) Table stores actual data rows in its own storage  
C) One table usable by exactly one analytics engine only  
D) Creating table auto-converts source files to Parquet  

**Answer: A**  
Explanation: Catalog table is pointer: "data lives at s3://bucket/orders/, Parquet format, schema is...". Multiple engines share same table definition. Creation doesn't convert file formats.

---

**Problem 4.** Millions of S3 objects with new folders added daily. Reduce crawler cost/time most?

A) Full scan all paths every time  
B) Increase concurrent crawler runs  
C) Create new S3 bucket daily  
D) Use incremental crawl or Athena Partition Projection  

**Answer: D**  
Explanation: Incremental crawl scans only new folders; Partition Projection eliminates crawlers for predictable partition rules. Both cut cost significantly. Full scans increase cost; buckets don't help.

---

**Problem 5.** Non-standard log format; built-in Classifier can't infer schema. Appropriate response?

A) Skip crawlers, write all DDL manually  
B) Force-convert all to CSV  
C) Define Custom Classifier with Grok/regex patterns for crawler  
D) Store in DynamoDB instead  

**Answer: C**  
Explanation: Custom Classifiers with Grok/regex handle non-standard formats. Manual DDL or format forcing are inefficient. Custom Classifier solves the problem.

---
