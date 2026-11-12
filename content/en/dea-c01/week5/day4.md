# Day 4 - Performance and Cost Optimization: File Format, Compression, Partitioning, and Small File Problem

In data engineering, "slow" and "expensive" almost always stem from the same cause: **reading unnecessarily large amounts of data**. Athena, Redshift Spectrum, EMR, and Glue all spend time and money proportional to S3 data read. Thus optimization's essence is simple: **minimize data read**. Today we cover four weapons — file format, compression, partitioning, file size — among the most frequently tested in DEA-C01.

## Row-Based vs Columnar: The Most Critical Single Decision

File formats fall into two classes.

| Class | Formats | Storage Method |
|-------|---------|-----------------|
| Row-based | CSV, JSON, Avro | Store all columns of one row sequentially |
| Columnar | Parquet, ORC | Store same column values sequentially |

Analysis queries typically look at "a few of hundreds of columns." `SELECT region, SUM(amount)` needs only two columns. Row-based formats store entire rows, so to read two columns you must read all. **Columnar (Parquet/ORC) lets you read only needed columns (column pruning)**. Reading 2 of 100 columns cuts I/O by 50x.

```sql
-- Athena: Query only two columns from Parquet table
-- → Reads only region, amount column blocks, minimizing scan
SELECT region, SUM(amount) AS total
FROM sales_parquet
WHERE year = 2026
GROUP BY region;
```

> 💡 **Related Theory**: Columnar is fast in analytics not just via I/O savings but also **compression efficiency**. Same-column values share type and distribution (e.g., region repeats), so **run-length encoding, dictionary encoding** compress dramatically. Parquet/ORC store **min/max statistics** per block in metadata, skipping entire blocks that don't match query conditions (predicate pushdown). These three (column pruning, high compression, stat-based skip) are columnar format's holy trinity.

## Parquet vs ORC vs Avro

Distinguish these formats' use cases.

| Format | Type | Strength | Primary Use |
|--------|------|----------|-------------|
| Parquet | Columnar | Spark/Athena ecosystem standard, broad compat | General analysis queries |
| ORC | Columnar | Hive ecosystem optimal, strong compression/index | Hive/EMR-centric |
| Avro | Row-based | Schema evolution, fast writes | Streaming load, frequent schema changes |

Exam intuition: **analysis optimization = Parquet(or ORC)**, **schema frequently changes or row streaming = Avro**. Athena, Redshift Spectrum, and Glue handle Parquet best, so "pick format for cost savings" usually means Parquet.

> ⚠️ **Gotcha**: Confusion over "Avro compresses too; why not Avro for analytics?" Avro is row-based, so no column pruning — read two columns, read entire rows. Avro's strength is **schema evolution** (safe field add/delete) and fast writes, not scan speed. Choosing Avro for analysis cost savings is wrong.

## Compression: Direct Means to Reduce Bytes Read

Compression cuts both S3 storage cost and scan cost. Codec choice hinges on **splittability**.

| Codec | Ratio | Speed | Splittable |
|-------|-------|-------|------------|
| Snappy | Medium | Fast | (Within Parquet/ORC) Yes |
| Gzip | High | Slow | Standalone text: No |
| Zstd | High | Fast | Yes |
| Bzip2 | Very High | Very Slow | Yes |
| LZO | Low | Fast | Yes (with index) |

Why splittability matters? Distributed engines (Spark/Hive) split large files across workers for parallel reads. **Non-splittable codecs (standalone Gzip text) force one worker to read the file entirely, killing parallelism.** Huge single Gzip CSV is the worst combination.

Production standard is **Parquet + Snappy**. Snappy applies per column-chunk within Parquet, and the file itself is splittable by block—both compression and parallelism. For higher compression, Zstd is a good modern alternative.

## Partitioning: Skip Entire Directories of Unneeded Data

**Partitioning** splits data into directories by column values. Most common: date partitioning.

```
s3://bucket/sales/
  year=2026/month=06/day=25/part-0001.parquet
  year=2026/month=06/day=26/part-0001.parquet
```

Querying `WHERE year=2026 AND month=06 AND day=26`, the engine reads only that directory, never opening other dates **(partition pruning)**. Column pruning is "horizontal" savings; partition pruning is "vertical."

```sql
-- Partition filter → Scan only June 26 directory, skip other dates
SELECT product_id, SUM(amount)
FROM sales
WHERE year = 2026 AND month = 6 AND day = 26
GROUP BY product_id;
```

Partition keys must be **low-cardinality columns frequently filtered** (date, region). **High-cardinality partitioning** (user_id with millions of values) creates excessive partitions, causing small file explosion and metadata bloat.

> 🎯 **Scenario**: Team's Athena costs spike. Data: huge single Gzip CSV; queries: mostly recent 7 days, specific regions. Optimization prescription: (1) Convert to **Parquet+Snappy** (column pruning + compression), (2) Partition by **year/month/day** (skip date ranges via partition pruning), (3) Make frequent-use region a secondary partition or sort key, (4) **Compact** small files to appropriate size. Scan volume drops 10–100x, Athena costs plummet. Use Glue ETL to CSV→Parquet conversion and partitioning.

## Small File Problem: Silent Performance Killer

Thousands of small files on S3, even tiny totals, make queries extremely slow. **Each file has overhead** — S3 LIST/GET requests, metadata parsing, task scheduling cost. 100,000 1KB files slower and costlier than one 1GB file.

Where do small files come from?
- Streaming load (Kinesis/Firehose) with short buffer intervals creates frequent small files
- Spark with excessive `repartition` creates many small outputs
- High-cardinality partitioning fragments data finely per partition

**Compaction** solves it — merge small files into large ones.

```python
# Spark: Control output partition count to consolidate small files
(df
  .repartition(8)          # Or coalesce to control output file count
  .write
  .mode("overwrite")
  .parquet("s3://curated/sales/"))
```

AWS provides automated tools. **Firehose buffer size/interval** larger creates bigger files; **Glue's file grouping (groupFiles/groupSize)** or table format auto-compaction helps.

> 🔍 **Deeper Dive**: Recommended file size is typically **128MB–1GB**. Too large (several GB+) loses split/parallelism, idle workers. Too small causes overhead dominance. 128MB isn't accidental—it derives from HDFS's default block size, where one block matched one processing unit (task). **Open table formats** (Iceberg, Hudi, Delta) embed auto-compaction and file-size management, structurally easing this.

## Optimization Priority Checklist

Encountering performance/cost issues, check in order:

1. **Format**: Converted text (CSV/JSON) → columnar (Parquet/ORC)?
2. **Compression**: Using splittable codecs (Snappy/Zstd)? No giant single Gzip?
3. **Partitioning**: Partition by low-cardinality columns frequently filtered for pruning?
4. **File size**: Compacted small files to 128MB–1GB?

These four control Athena scan cost, Redshift Spectrum cost, EMR/Glue processing time.

## Summary

Performance/cost optimization's core: "minimize data read." Columnar formats (Parquet) reduce horizontal via column pruning and stat skip; partitioning reduces vertical via skipped directories. Compression picks splittable codecs (Snappy/Zstd) for parallelism + savings. Small files compaction eliminates overhead. Giant single Gzip CSV is worst; Parquet+Snappy+date partitioning+appropriate file size is standard. Tomorrow Week 5 comprehensive review.

---

## 📝 Practice Questions

**Question 1.** Most Athena queries read only 3 to 4 of 100 columns, but the data is stored as CSV, so the cost is high. Which format conversion most effectively reduces scan cost?

A) Convert to JSON  
B) Convert to Avro  
C) Convert to a columnar format such as Parquet  
D) Convert to uncompressed TSV  

**Answer: C**  
Explanation: Columnar formats (Parquet/ORC) provide column pruning, which reads only the column blocks needed by the query, and statistics-based skipping, dramatically reducing the amount scanned when only a few columns are queried. JSON, TSV, and Avro are row-based and must read entire rows, so they have no column pruning benefit.

---

**Question 2.** EMR Spark is processing a huge single Gzip-compressed CSV file, but there is no parallelism at all and only one worker is working. What is the root cause?

A) The Gzip compression ratio is too high  
B) A standalone Gzip text file is non-splittable, so one worker must read the entire file  
C) Spark cannot read compressed files  
D) CSV has no columns  

**Answer: B**  
Explanation: A standalone Gzip text file is non-splittable, so a single worker must read the whole file, which kills parallelism. The fix is to store the data in a block-splittable form such as Parquet + Snappy, or to split the file into appropriately sized pieces.

---

**Question 3.** Sales data is stored in S3 partitioned by `year/month/day`. Why is a query with `WHERE year=2026 AND month=6 AND day=26` fast and cheap?

A) Because it reads all partitions in parallel  
B) Because Hive optimizes it automatically  
C) Because the engine reads only the required partitions and never opens the other directories (partition pruning)  
D) Because dates have high cardinality, so compression is excellent  

**Answer: C**  
Explanation: Partition pruning avoids reading entire directories that do not match the condition, greatly reducing the amount scanned. A date is an ideal low-cardinality partition key, and because only the needed date directory is opened, the query is fast and cheap.

---

**Question 4.** Why is Athena/Spark performance poor when tens of thousands of small files have accumulated in S3?

A) Because small files cannot be compressed  
B) Because LIST/GET requests, metadata parsing, and task scheduling overhead accumulate for each file, and neither parallelism nor locality is achieved  
C) Because column pruning does not work on small files  
D) Because Parquet cannot read small files  

**Answer: B**  
Explanation: Small files create dominant overhead from tens of thousands of S3 requests, metadata parsing, and task creation, and there is not enough data per worker, so idle cost is high. The fix is to compact them to 128 MB to 1 GB.

---

**Question 5.** Which option most accurately describes the strengths of Parquet?

A) It has a higher compression ratio than CSV  
B) It is advantageous for schema evolution  
C) The trio of column pruning, statistics-based skipping, and high compression maximizes analytical query performance  
D) It is row-based, so writes are fast  

**Answer: C**  
Explanation: Parquet's key strength is the synergy of three things: being columnar, it reads only the needed columns (pruning); min/max statistics let it skip entire blocks (predicate pushdown); and repeated values in the same column yield high compression. Schema evolution is an Avro strength, and fast row-based writes are also Avro and CSV.

---
