# Day 4 - Data Storage Strategy: Partitioning, Format Optimization, Training Readiness

Yesterday we read data via Athena and Redshift. But **how you store the same data** can make query costs differ by 50x and training speed vary by orders of magnitude. Storage isn't about "where to put it" but "how to pre-arrange it so the reader can access it fast and cheap."

Today we explore the three pillars of ML data storage — partitioning, file format optimization, and preparing data to hand off to SageMaker training. In MLA-C01 Domain 1, storage strategy consistently appears in scenarios testing cost and performance.

## Partitioning: Don't Touch Data You Won't Read

**Partitioning** is splitting data into folders by a specific key (usually date). When a query needs data matching a `WHERE` condition, it reads only those partitions, skipping the rest — this is called **partition pruning**.

```
s3://ml-datalake/events/
 ├─ year=2026/month=05/day=01/part-0000.parquet
 ├─ year=2026/month=06/day=24/part-0000.parquet
 └─ year=2026/month=06/day=25/part-0000.parquet   ← WHERE day='25' scans only this
```

Folder names in `key=value` format like `year=`, `month=` are called **Hive-style partitioning**. Glue Crawler and Athena automatically recognize and register these as partition columns.

```sql
-- Filtering by partition key scans only that partition's Parquet
SELECT customer_id, COUNT(*) AS cnt
FROM ml_datalake.events
WHERE year = '2026' AND month = '06' AND day = '25'
GROUP BY customer_id;
```

> 💡 **Related Theory**: Partitioning's benefit appears only "when you use partition keys in query conditions." If you partition by date but query only on `WHERE customer_id = ...`, you full-scan all date partitions. So choose partition keys as **columns you filter most frequently**. At the same time, partitioning too finely (e.g., per second) creates millions of small files and "small files problem" with metadata overhead. Usually, mid-cardinality columns like date (year/month/day) or region work well.

## File Format: Row-Oriented vs Columnar

Format choice in ML data storage directly affects cost and speed. The core difference is between **row-based** and **columnar** storage.

| Format | Method | Characteristics | ML Suitability |
|------|------|------|----------|
| CSV | Row-based, text | Human readable, no schema, inefficient | Low |
| JSON | Row-based, text | Nested structure, verbose | Low |
| Parquet | Columnar, binary | Column-level compression/scan, schema built-in | High |
| ORC | Columnar, binary | Similar to Parquet, Hive-friendly | High |
| RecordIO | Binary | SageMaker built-in algorithm input format | Training only |

**Parquet** is the de facto standard in analytics and ML for three reasons. (1) Columnar means read only needed columns, reducing I/O; (2) column-level compression is high (same-type values grouped); (3) schema and statistics (min/max) in the file let you skip unnecessary blocks.

```python
import pandas as pd

df = pd.read_csv("s3://raw/events.csv")

# Convert to Parquet + Snappy compression (fast read by Athena/SageMaker)
df.to_parquet(
    "s3://ml-datalake/curated/events.parquet",
    engine="pyarrow",
    compression="snappy",
)
```

> 🔍 **Deeper Dive**: Compression codec choice matters. **Snappy** has medium compression but fast compress/decompress, ideal for frequently-read data like queries and training (Parquet's default). **Gzip** has high compression ratio, reducing storage cost, but uses more CPU — suited for rarely-read archives. ML training data is read repeatedly, so Snappy + Parquet is usually the answer.

> ⚠️ **Gotcha**: "Compression always helps" isn't true. Gzip-compressing CSV/JSON makes files **non-splittable**, preventing multiple workers from reading a file in parallel. Parquet is splittable at the row group level, maintaining parallelism in distributed training and queries. For large data, "splittable format" matters more than "whether compressed."

## SageMaker Training Data Preparation

The endpoint of storage strategy is "how fast does SageMaker training consume S3 data?" SageMaker offers **input modes** for delivering S3 data to training containers.

| Input Mode | Behavior | Suited For |
|----------|------|------------|
| File mode | Copy data entirely to instance disk before training starts | Small-to-medium data fitting on disk |
| Pipe mode | Stream from S3 and train immediately | Large volumes — no download wait |
| FastFile mode | Lazy load from S3 on demand (appears as file) | Large data + File mode convenience |

File mode is simple but waits for full copy before training starts, and can't handle data larger than disk. **Pipe mode** streams without waiting, ideal for large volumes.

```python
from sagemaker.inputs import TrainingInput

# Stream large data via Pipe mode
train_input = TrainingInput(
    s3_data="s3://ml-datalake/curated/train/",
    input_mode="Pipe",            # File / Pipe / FastFile
    content_type="application/x-parquet",
)
estimator.fit({"train": train_input})
```

When storing data in S3, also important is dividing it into **multiple appropriately-sized files (shards)**. A single huge file is hard for distributed training to split across instances. SageMaker can distribute files to instances using `ShardedByS3Key` distribution.

> 💡 **Related Theory**: In ML training, data input often becomes the bottleneck, not GPU. If GPU computes a batch in 0.1 seconds but reading from disk takes 0.5 seconds, GPU idles 80% of the time (GPU starvation). Pipe/FastFile mode, efficient formats like Parquet, and proper sharding all prevent "starving the expensive GPU." That's why storage strategy is training cost strategy.

> 📚 **Case Study**: A team stored terabytes of click logs as a single huge CSV in S3 using File mode, wasting 40 minutes on data copy per experiment. After repartitioning the data by date into Parquet shards and switching to Pipe mode, copy wait vanished and EDA via Athena became easier. One storage format change improved experiment iteration speed dramatically.

## Summary

ML data storage is "pre-arrange for the reader." Use **partitioning** by columns you filter frequently (avoiding scanning unneeded data), **Parquet + Snappy** (splittable columnar format reducing I/O and cost), and when handing to SageMaker, use **Pipe/FastFile mode** with proper sharding to prevent GPU starvation. Storage strategy is query cost and training speed strategy.

Next, we'll review the entire Week 2 on data collection and storage as we wrap up Week 2.

---

## 📝 연습 문제

**문제 1.** Event data arrives daily and is stored in S3. Most analysis queries filter by date range. What is the most effective storage method to reduce scan costs?

A) Store all data in a single folder as one file  
B) Store as Parquet with Hive-style partitioning by date (year/month/day)  
C) Partition by customer_id only  
D) Store all data as compressed JSON  

**정답: B**  
해설: Since queries filter by date, date partitioning enables partition pruning to scan only matching partitions, and Parquet adds column-level scan reduction. Single file (A) forces full scan, partitioning by customer_id when filtering by date (C) prevents pruning, and compressed JSON (D) is row-based and inefficient.

---

**문제 2.** You want to store large ML training datasets that are read repeatedly. What is the best format and compression combination?

A) CSV + Gzip  
B) Parquet + Snappy  
C) JSON + Gzip  
D) Uncompressed single CSV  

**정답: B**  
해설: Parquet is columnar, reads only needed columns, and is splittable for distributed training; Snappy compresses/decompresses fast, ideal for frequently-read data. CSV+Gzip (A), JSON+Gzip (C) are row-based and Gzip's non-splittability blocks parallel reading, while uncompressed CSV (D) has large I/O.

---

**문제 3.** Training data is much larger than instance disk. You want to stream from S3 without copying everything and start training immediately. What SageMaker input mode is suitable?

A) File mode  
B) Pipe mode  
C) Local mode  
D) Compress data and copy to disk  

**정답: B**  
해설: Pipe mode streams from S3 without waiting for download completion, ideal for data larger than disk. File mode (A) requires copying entire data to disk (impossible if oversized), local mode (C) is for debugging, and disk copy (D) hits the same capacity problem.

---

**문제 4.** After compressing a CSV file with Gzip for distributed training, multiple workers couldn't read data in parallel. What is the cause?

A) Gzip-compressed CSV is non-splittable  
B) CSV file is too small  
C) Gzip compression ratio is low  
D) Insufficient number of workers  

**정답: A**  
해설: Gzip-compressed CSV is non-splittable, forcing one worker to read the entire file sequentially, preventing parallel reading. Parquet is splittable at the row group level. File size (B), compression ratio (C), and worker count (D) don't explain the non-splittability.

---

**문제 5.** SageMaker training shows low GPU usage and GPU starvation (waiting for data). Which is least relevant to storage/input improvements?

A) Convert data to efficient format like Parquet  
B) Use Pipe/FastFile mode to relieve input bottleneck  
C) Split data into multiple appropriately-sized shards  
D) Lower learning rate  

**정답: D**  
해설: Learning rate affects model convergence, a hyperparameter unrelated to data input bottleneck (GPU starvation). Format conversion (A), streaming input mode (B), and proper sharding (C) all speed data supply to prevent GPU starvation, so they're storage/input improvements.

---
