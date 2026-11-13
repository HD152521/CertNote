# Day 4 - Performance and Cost Optimization: File Formats, Compression, Partitioning, and the Small File Problem

In data engineering, "slow" and "expensive" usually come from the same cause: **reading more data than you need to**. Athena, Redshift Spectrum, EMR, and Glue all spend time and money in proportion to the amount of data they read from S3. So the essence of optimization is simple: **minimize the data you have to read**. Today we cover the four weapons for doing that: file format, compression, partitioning, and file size. This is an area covered by the DEA-C01 exam.

## Row-Based vs Columnar: The Single Most Important Decision

File formats fall into two broad families.

| Category | Formats | Storage method |
|------|------|-----------|
| Row-based | CSV, JSON, Avro | Stores all columns of a row contiguously |
| Columnar | Parquet, ORC | Stores the values of the same column contiguously |

Analytic queries usually look at only "a few of hundreds of columns." `SELECT region, SUM(amount)` needs only the region and amount columns. A row-based format stores whole rows, so even if you want just two columns you have to read all of them. **Columnar formats (Parquet/ORC), on the other hand, read only the columns they need (column pruning).** Reading 2 columns out of 100 can cut I/O by 50x.

```sql
-- Athena: query only two columns from a table stored as Parquet
-- → reads only the region and amount column blocks from S3, minimizing scan volume
SELECT region, SUM(amount) AS total
FROM sales_parquet
WHERE year = 2026
GROUP BY region;
```

> 💡 **Related theory**: Columnar storage is fast for analytics not only because it saves I/O but also because of **compression efficiency**. Values in the same column have similar data types and distributions (for example, a region column repeats the same strings), so techniques like **run-length encoding and dictionary encoding** work dramatically well. Parquet/ORC also store **min/max statistics** in the metadata of each data block, so blocks that cannot match the query predicate are skipped without being read (predicate pushdown). These three things (column pruning, high compression, and statistics-based skipping) are the holy trinity of columnar formats.

## Parquet vs ORC vs Avro

The three formats are used for different purposes, as follows.

| Format | Type | Strengths | Typical use |
|------|------|------|-----------|
| Parquet | Columnar | Standard in the Spark/Athena ecosystem, broad compatibility | General analytic queries |
| ORC | Columnar | Best fit for the Hive ecosystem, strong compression and indexes | Hive/EMR-centric workloads |
| Avro | Row-based | Schema evolution, fast writes | Streaming ingestion, frequent schema changes |

Exam intuition: **analytic query optimization = Parquet (or ORC)**; **row-level writes/streaming with frequently changing schemas = Avro**. Because Athena, Redshift Spectrum, and Glue handle Parquet best, when a question asks about "choosing a format to cut costs," Parquet is usually the answer.

> ⚠️ **Pitfall**: People get confused by "Avro is compressed too, so why Parquet for analytics?" Avro is row-based, so it cannot do column pruning: even if you want only two columns, it reads entire rows. Avro's strength is not analytic speed but **schema evolution** (safely handling added/removed fields) and fast writes. Choosing Avro for a question about reducing analytic scan cost is wrong.

## Compression: A Direct Way to Reduce the Bytes You Read

Compression reduces both S3 storage cost and scan cost. The key to choosing a codec is **splittability**.

| Codec | Compression ratio | Speed | Splittable |
|------|--------|------|-----------|
| Snappy | Medium | Fast | Yes (inside Parquet/ORC) |
| Gzip | High | Slow | No, for standalone text |
| Zstd | High | Fast | Yes |
| Bzip2 | Very high | Very slow | Yes |
| LZO | Low | Fast | Yes (when indexed) |

Why does splittability matter? Distributed engines (Spark/Hive) split a large file so that multiple workers read it in parallel. **With a non-splittable codec (standalone Gzip text), one worker must read the entire file, which kills parallelism.** That is why one huge Gzip CSV is the worst combination.

The standard practice is **Parquet + Snappy**. Snappy is applied per column chunk inside Parquet, and the file itself is splittable at the block level, so you get both parallelism and compression. If you want a better compression ratio, Zstd is a good modern alternative.

## Partitioning: Skipping Data You Don't Need to Read, Wholesale

**Partitioning** physically splits data into directories based on column values. The most common is a date partition.

```
s3://bucket/sales/
  year=2026/month=06/day=25/part-0001.parquet
  year=2026/month=06/day=26/part-0001.parquet
```

When you query with `WHERE year=2026 AND month=06 AND day=26`, the engine reads only that directory and **doesn't even open** the other dates (partition pruning). If column pruning is a savings in the "horizontal (column)" direction, partition pruning is a savings in the "vertical (row)" direction.

```sql
-- Filter on partition columns → scan only the June 26 directory, skip all other dates
SELECT product_id, SUM(amount)
FROM sales
WHERE year = 2026 AND month = 6 AND day = 26
GROUP BY product_id;
```

A partition key should be a **low-cardinality column that queries filter on frequently** (date, region, and so on). Conversely, **partitioning by a high-cardinality column (such as user_id with millions of values) creates too many partitions, causing a metadata explosion and the small file problem instead.**

> 🎯 **Scenario**: A team's Athena costs have exploded. Their data sits in S3 as one huge Gzip CSV, and most queries look only at the last 7 days and a specific region. The optimization prescription is (1) convert the format to **Parquet+Snappy** (column pruning + compression), (2) **partition by year/month/day** (partition pruning skips the date range), (3) use the frequently used region as a secondary partition or sort key, and (4) **compact** small files to an appropriate size. This combination cuts scan volume by tens to hundreds of times, so Athena costs drop sharply. A Glue ETL job performs the CSV→Parquet conversion and partitioning in bulk.

## The Small File Problem: The Silent Performance Killer

When tens of thousands of small files pile up in S3, queries become extremely slow even if the total data volume is small. The reason is the **per-file overhead**: each file incurs S3 LIST/GET requests, metadata parsing, and task scheduling costs. 100,000 files of 1 KB are overwhelmingly slower and more expensive than a single 1 GB file.

Where do small files come from?
- Streaming ingestion (Kinesis/Firehose) with a short buffer interval generates many small files
- Spark creates many small outputs through excessive partitioning (`repartition`)
- High-cardinality partitioning splits the data in each partition into tiny pieces

The solution is **compaction**: merging small files into larger files.

```python
# Spark: reduce the number of output partitions to consolidate small files into larger ones
(df
  .repartition(8)          # or control the number of output files with coalesce
  .write
  .mode("overwrite")
  .parquet("s3://curated/sales/"))
```

AWS also provides automatic tools. Increase the **Firehose buffer size/interval** to deliver larger files, and use **Glue's small-file grouping (groupFiles/groupSize)** or the automatic compaction of table formats.

The recommended file size is generally in the **128 MB to 1 GB** range. If files are too large (several GB or more), splitting and parallelism suffer and only some workers do the work; if they are too small, overhead dominates. 128 MB is no coincidence: it comes from the default block size of HDFS, a value designed so that one block maps to one processing unit (task). **Open table formats** such as Iceberg, Hudi, and Delta have built-in automatic compaction and file size management, which structurally mitigates this problem.

## Optimization Priority Summary

The order of checks when you run into a performance or cost problem:

1. **Format**: Did you move from text (CSV/JSON) to columnar (Parquet/ORC)?
2. **Compression**: Are you using a splittable codec (Snappy/Zstd)? Is there any huge single Gzip file?
3. **Partitioning**: Did you partition on a frequently filtered low-cardinality column so that pruning works?
4. **File size**: Did you compact small files to 128 MB to 1 GB?

These four determine Athena scan cost, Redshift Spectrum cost, and EMR/Glue processing time.

## Summary

Performance and cost optimization comes down to "minimizing the data you read." Columnar formats (Parquet) reduce the horizontal dimension through column pruning and statistics-based skipping, while partitioning reduces the vertical dimension by skipping whole directories you don't need to read. For compression, choose a splittable codec (Snappy/Zstd) to get parallelism and savings at the same time, and eliminate small-file overhead with compaction. A huge single Gzip CSV is the worst case; Parquet + Snappy + date partitioning + an appropriate file size is the standard. Tomorrow we do a comprehensive review of all of Week 5.

---

## 📝 Practice Questions

**Question 1.** Most Athena queries read only 3 to 4 of 100 columns, but the data is stored as CSV and costs are high. Which format conversion reduces scan cost most effectively?

A) Convert to JSON  
B) Convert to Avro  
C) Convert to a columnar format such as Parquet  
D) Convert to uncompressed TSV  

**Answer: C**  
Explanation: Columnar formats (Parquet/ORC) provide column pruning, which reads only the column blocks the query needs, along with statistics-based skipping, dramatically reducing scan volume when only a few columns are queried. JSON, TSV, and Avro are row-based and must read entire rows, so they get no column pruning benefit.

---

**Question 2.** EMR Spark is processing one huge Gzip-compressed CSV file, but there is no parallelism at all and only one worker is doing the work. What is the root cause?

A) The Gzip compression ratio is too high  
B) Standalone Gzip text is non-splittable, so a single worker must read the entire file  
C) Spark cannot read compressed files  
D) CSV has no columns  

**Answer: B**  
Explanation: A standalone Gzip text file is non-splittable, so one worker must read the whole file, which kills parallelism. The fix is to store the data in a block-splittable form such as Parquet+Snappy, or to split the file into appropriately sized pieces.

---

**Question 3.** Sales data is stored in S3 partitioned by `year/month/day`. Why is a query with `WHERE year=2026 AND month=6 AND day=26` fast and cheap?

A) Because it reads all partitions in parallel  
B) Because partitioning automatically compresses the data  
C) Because partition columns create an index  
D) Because it reads only the directory for that date and doesn't scan other date partitions at all (partition pruning)  

**Answer: D**  
Explanation: When you filter on the partition keys, the engine reads only the matching directories and doesn't even open the other partitions. This partition pruning greatly reduces scan volume and cost. Partitioning itself does not compress data or build a traditional index.

---

**Question 4.** Streaming ingestion is piling up hundreds of thousands of 1-10 KB files in S3 every day, and queries are getting slower. The total data volume is not large. What is the most appropriate response?

A) Split the files into even smaller pieces  
B) Increase the number of partitions using a high-cardinality column such as user_id  
C) Compact the small files into larger files of roughly 128 MB to 1 GB and increase the Firehose buffer size/interval  
D) Store all files uncompressed  

**Answer: C**  
Explanation: The small file problem occurs because each file carries request, metadata, and scheduling overhead, so you fix it by compacting files to an appropriate size (128 MB to 1 GB) and increasing the Firehose buffer to produce larger files from the start. Splitting files further or partitioning by a high-cardinality column makes the problem worse.

---

**Question 5.** Which format is best suited to a streaming ingestion stage where the schema (fields) is frequently added to or changed and rows must be written quickly?

A) Avro  
B) Parquet  
C) ORC  
D) Compressed CSV  

**Answer: A**  
Explanation: Avro is row-based, so writes are fast, and it is strong at schema evolution (handling added/removed fields compatibly), which makes it well suited to streaming ingestion with frequent schema changes. Parquet and ORC are columnar and strong at optimizing analytic queries, but Avro is better for frequent row-level writes and schema changes.

---
