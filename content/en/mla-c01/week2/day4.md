# Day 4 - Data Storage Strategy: Partitioning, Format Optimization, Training Preparation

## 📌 Key Takeaways

- Storage is not a question of "where you put it" but of **"whether you lay it out in advance so the reading side can read quickly and cheaply."**
- **Make the partition key the column you filter on most often (usually the date).** Splitting too finely creates the small files problem.
- The default format is **Parquet + Snappy** — the triple of columnar, compression ratio, and **splittable**.
- CSV/JSON compressed with Gzip is **non-splittable**, which blocks parallel reads. "Is it splittable?" matters more than "is it compressed?"
- SageMaker input modes are **File / Pipe / FastFile**. When the data is bigger than the disk, use Pipe/FastFile so the GPU is not starved.

## Partitioning: Don't Touch Data You Won't Read

Even for the same data, how you store it can change query cost by dozens of times and training speed by several times.

**Partitioning** means splitting data into folders by a specific key (usually the date). If a query reads only the partitions it needs through a `WHERE` condition, the rest is not scanned — this is **partition pruning**.

```
s3://ml-datalake/events/
 ├─ year=2026/month=05/day=01/part-0000.parquet
 ├─ year=2026/month=06/day=24/part-0000.parquet
 └─ year=2026/month=06/day=25/part-0000.parquet   ← with WHERE day='25', only this is scanned
```

Folder names in the `key=value` form such as `year=` and `month=` are called **Hive-style partitioning**. Glue Crawler and Athena recognize this convention automatically and register them as partition columns.

```sql
-- Filtering by the partition key scans only that partition's Parquet files
SELECT customer_id, COUNT(*) AS cnt
FROM ml_datalake.events
WHERE year = '2026' AND month = '06' AND day = '25'
GROUP BY customer_id;
```

**Criteria for choosing a partition key** — choose wrong and the effect is zero.

| Situation | Result | Response |
|------|------|------|
| Partition by a column you filter on often | Pruning kicks in, scan volume drops sharply | Ideal |
| Partition by a column you almost never filter on | Always a full scan | Redesign the partition key |
| Cardinality too high (seconds, IDs) | Millions of small files, metadata explosion | Group into a higher unit (day, month) |
| Cardinality too low (2 values) | Pruning effect is negligible | Consider another key |

The effect of partitioning appears "only when the partition key is used in the query condition." If you partition by date but the query filters only with `WHERE customer_id = ...`, it fully scans every date partition. At the same time, if you split too finely (e.g., by the second), small files grow into the millions, causing metadata overhead and the "small files problem." A medium-cardinality column such as date (year/month/day) or region is usually the right line.

## File Formats: Row-Oriented vs Columnar

In ML data storage, the choice of format ties directly to cost and speed. The key is the difference between **row-oriented** and **columnar**.

| Format | Method | Characteristics | ML suitability |
|------|------|------|----------|
| CSV | Row-based, text | Easy for humans to read, no schema, inefficient | Low |
| JSON | Row-based, text | Nested structure, verbose | Low |
| Parquet | Columnar, binary | Per-column compression and scanning, schema included | High |
| ORC | Columnar, binary | Similar to Parquet, Hive-friendly | High |
| RecordIO | Binary | Input format for SageMaker built-in algorithms | Training only |

There are three reasons **Parquet** is the de facto standard for analytics and ML.

1. Being columnar, it reads only the needed columns, so I/O is low.
2. The compression ratio is high per column (because values of the same type are gathered).
3. It carries the schema and statistics (min/max) in the file so it can skip unnecessary blocks.

```python
import pandas as pd

df = pd.read_csv("s3://raw/events.csv")

# Convert to Parquet + Snappy compression (Athena/SageMaker read it quickly)
df.to_parquet(
    "s3://ml-datalake/curated/events.parquet",
    engine="pyarrow",
    compression="snappy",
)
```

**Choosing a compression codec**

| Codec | Compression ratio | Speed | Splittable | Suited for |
|------|-------|------|----------|------|
| Snappy | Medium | Fast | Yes, inside Parquet | Training and query data read often (default) |
| GZIP | High | Slow (CPU↑) | Yes, inside Parquet | Archives read rarely |
| GZIP + CSV/JSON | High | Slow | **No** | Unsuitable for parallel processing |

**Snappy** has a medium compression ratio but compresses and decompresses fast, so it suits data read often such as queries and training (the Parquet default). **Gzip** has a high compression ratio that cuts storage cost but uses more CPU — it fits archives that are rarely read. ML training data is read repeatedly, so the Snappy + Parquet combination is usually the answer.

> ⚠️ **Trap**: It is not "compression is always good." If you compress CSV/JSON with Gzip, the file becomes **non-splittable**, so several workers cannot divide up and read a single file in parallel. Parquet is splittable in units of internal blocks (row groups), so it preserves parallelism in distributed training and queries. When handling big data, "is it a splittable format?" matters more than "is it compressed?"

```
[One Gzip CSV file]        Worker1 ████████████████  Worker2 (idle)
                            → One worker has to read everything sequentially

[Parquet, several shards]  Worker1 ████  Worker2 ████  Worker3 ████  Worker4 ████
                            → Split by row group/file and read at the same time
```

## SageMaker Training Data Preparation

The destination of a storage strategy is "how fast a SageMaker training job can receive data from S3." SageMaker provides **input modes** for delivering S3 data to the training container.

| Input mode | Behavior | Suitable situation | Cost |
|----------|------|------------|------|
| File mode | Copies the whole data to the instance disk, then starts training | Small to medium scale where the data fits on disk | Copy wait, disk capacity needed |
| Pipe mode | Streams from S3 and starts training immediately | Large scale — no download wait | Sequential access, full shuffle is hard |
| FastFile mode | Lazily loads from S3 as needed (appears as files) | Large data + File mode convenience | Per-file latency can accumulate |

```
[File]      ████ full copy (tens of minutes) ████ ▶ training starts ──────────▶
[Pipe]      ▶ training starts ─── keeps being fed by streaming ───────────▶
[FastFile]  ▶ training starts ─── loads only the needed files on demand ──────▶
```

```python
from sagemaker.inputs import TrainingInput

# Stream large data in with Pipe mode
train_input = TrainingInput(
    s3_data="s3://ml-datalake/curated/train/",
    input_mode="Pipe",            # File / Pipe / FastFile
    content_type="application/x-parquet",
)
estimator.fit({"train": train_input})
```

When you place data in S3, it is also important to split it into **several files (shards) of moderate size**. A single giant file is hard for multiple instances to divide and read in distributed training. SageMaker can hand files out to instances with the `ShardedByS3Key` distribution type.

| Distribution type | Behavior | When |
|----------|------|------|
| `FullyReplicated` | Every instance receives the entire data | Validation set, small data |
| `ShardedByS3Key` | Each instance receives only different objects | Distributed training (but there must be multiple objects) |

> ⚠️ **Trap**: Turning on `ShardedByS3Key` is not the end of it. Sharding works at the **S3 object** level, so applying it to a single 100GB file distributes nothing. The data has to be divided into several objects for it to take effect.

In ML training, data input often becomes a bigger bottleneck than the GPU. If the GPU computes a batch in 0.1 seconds but reading the data takes 0.5 seconds, the GPU sits idle most of the time (GPU starvation). Pipe/FastFile mode, an efficient format like Parquet, and appropriate sharding are all devices to "avoid starving the expensive GPU." That is why a storage strategy is a training cost strategy.

One team kept several TB of click logs in S3 as a single giant CSV and trained in File mode, wasting 40 minutes on data copying for every experiment. When they re-stored the data as Parquet shards partitioned by date and switched to Pipe mode, the copy wait disappeared and doing EDA beforehand with Athena also became easier. A single storage format governed the speed of experiment iteration.

## Storage Design Checklist

| Question | Judgment |
|------|------|
| What do queries filter by? | Make that column the partition key |
| Are partitions split too finely? | Group into a higher unit (day→month) to prevent small files |
| Do you use all the columns or only some? | If only some, definitely columnar (Parquet) |
| How often is it read? | If often, Snappy; if an archive, GZIP |
| Do several workers read in parallel? | Splittable format + several shards |
| Is the data larger than the instance disk? | Pipe or FastFile mode |
| Is GPU utilization low? | Suspect an input bottleneck — check format, mode, and sharding |

## Seeing the Difference Storage Design Makes in Numbers

Even for the same 5TB dataset and the same query, the amount read differs like this depending on the layout.

| Storage method | Column selection | Partition pruning | Compression | Actual scan volume (conceptual) |
|----------|----------|-------------|------|-----------------|
| Uncompressed CSV, flat storage | Not possible | Not possible | None | All 5TB |
| GZIP CSV, flat storage | Not possible | Not possible | Yes | Physical size shrinks but all columns are read |
| Parquet, flat storage | Possible | Not possible | Yes | By the ratio of needed columns |
| Parquet, date partitioning | Possible | Possible | Yes | Column ratio × partition ratio |

- If you use only 5 of 100 columns and query only one month, the two levers multiply and scan volume drops dramatically.
- This saving is reflected not only in Athena charges but also directly in SageMaker training's data loading time.

## Balancing File Size and Count

| State | Problem | Response |
|------|------|------|
| One giant file | No parallel reads, sharding is ineffective | Split into several objects |
| Excessively many small files | Request overhead dominates processing time | Merge to an appropriate size (compaction) |
| One file per partition + too many partitions | Metadata explosion | Raise the partition unit (day→month) |
| Several files of moderate size | — | Ideal |

## Input Mode Selection Flow

```
Does the training data fit on the instance disk?
   │
   ├─ Yes ─── Is a full shuffle/random access every epoch important?
   │           ├─ Yes → File mode
   │           └─ No → File or FastFile
   │
   └─ No ─── Is access sequential?
               ├─ Yes → Pipe mode (no download wait)
               └─ No (random access to only some files) → FastFile mode
```

## Checking Whether the GPU Is Idle and Responding

| Observation | Probable cause | Response |
|------|----------|------|
| Tens of minutes of waiting before training starts | File mode's full copy | Switch to Pipe/FastFile |
| GPU utilization stays low | Data supply bottleneck | Check format (Parquet), sharding, input mode |
| Adding instances doesn't speed things up | A single object, so nothing is distributed | Split into several shards + `ShardedByS3Key` |
| Training fails from lack of disk | Data is larger than EBS | Pipe/FastFile or enlarge the volume |

When GPU utilization is low, upgrading the instance type to a bigger GPU is mostly a wrong answer. If the bottleneck is **input** rather than computation, a more expensive GPU just sits idle longer. Look first at the storage format, input mode, and sharding.

## One-Line Discriminators for Storage Strategy

| Clue in the question | Answer |
|----------|------|
| "queries by date range but cost is high" | Date Hive partitioning + Parquet |
| "uses only 5 of 100 columns for training" | Parquet (columnar) |
| "training data read repeatedly" | Parquet + Snappy |
| "workers cannot read in parallel" | Gzip CSV is non-splittable — replace the format |
| "data is larger than the instance disk" | Pipe or FastFile mode |
| "GPU utilization is low" | Input bottleneck — check format, mode, sharding |
| "adding instances doesn't make it faster" | Single object — split into several shards |

In the next note we wrap up Week 2 with a comprehensive review of this week's data ingestion and storage.

## 📖 Glossary

- **Partitioning**: Splitting data into folders by a key such as the date. It lets you avoid touching data you will not read.
- **Partition pruning**: An optimization that reads only the partitions matching the condition and skips the rest entirely.
- **Small files problem**: A phenomenon where files are split too finely and per-file overhead dominates processing time.
- **Row-oriented**: A method that stores the values of a row side by side. Advantageous for work that often uses an entire row.
- **Columnar**: A method that gathers and stores the values of the same column. Advantageous for analytics and training that read only some columns.
- **Row group**: The block unit into which Parquet divides data internally. Thanks to this, split reads are possible even when compressed.
- **Non-splittable**: A state where a file cannot be read from the middle, so one worker must process it whole.
- **Snappy**: A compression codec that chooses speed over compression ratio. The default choice for training data read often.
- **Input mode**: How S3 training data is put into the container. Three kinds: File, Pipe, FastFile.
- **Pipe mode**: A method that streams from S3 and starts training right away without waiting for a full download.

## 📝 Practice Questions

**Question 1.** Event data arrives daily and is stored in S3. Most analysis queries filter by date range. What is the most effective storage method to reduce scan costs?

A) Store all data in a single folder as one file  
B) Store as Parquet with Hive-style partitioning by date (year/month/day)  
C) Partition by customer_id only  
D) Store all data as compressed JSON  

**Answer: B**  
Explanation: Since queries filter by date, date partitioning enables partition pruning to scan only matching partitions, and Parquet adds column-level scan reduction. Single file (A) forces full scan, partitioning by customer_id when filtering by date (C) prevents pruning, and compressed JSON (D) is row-based and inefficient.

---

**Question 2.** You want to store large ML training datasets that are read repeatedly. What is the best format and compression combination?

A) CSV + Gzip  
B) Parquet + Snappy  
C) JSON + Gzip  
D) Uncompressed single CSV  

**Answer: B**  
Explanation: Parquet is columnar, reads only needed columns, and is splittable for distributed training; Snappy compresses/decompresses fast, ideal for frequently-read data. CSV+Gzip (A), JSON+Gzip (C) are row-based and Gzip's non-splittability blocks parallel reading, while uncompressed CSV (D) has large I/O.

---

**Question 3.** Training data is much larger than instance disk. You want to stream from S3 without copying everything and start training immediately. What SageMaker input mode is suitable?

A) File mode  
B) Pipe mode  
C) Local mode  
D) Compress data and copy to disk  

**Answer: B**  
Explanation: Pipe mode streams from S3 without waiting for download completion, ideal for data larger than disk. File mode (A) requires copying entire data to disk (impossible if oversized), local mode (C) is for debugging, and disk copy (D) hits the same capacity problem.

---

**Question 4.** After compressing a CSV file with Gzip for distributed training, multiple workers couldn't read data in parallel. What is the cause?

A) Gzip-compressed CSV is non-splittable  
B) CSV file is too small  
C) Gzip compression ratio is low  
D) Insufficient number of workers  

**Answer: A**  
Explanation: Gzip-compressed CSV is non-splittable, forcing one worker to read the entire file sequentially, preventing parallel reading. Parquet is splittable at the row group level. File size (B), compression ratio (C), and worker count (D) don't explain the non-splittability.

---

**Question 5.** SageMaker training shows low GPU usage and GPU starvation (waiting for data). Which is least relevant to storage/input improvements?

A) Convert data to efficient format like Parquet  
B) Use Pipe/FastFile mode to relieve input bottleneck  
C) Split data into multiple appropriately-sized shards  
D) Lower learning rate  

**Answer: D**  
Explanation: Learning rate affects model convergence, a hyperparameter unrelated to data input bottleneck (GPU starvation). Format conversion (A), streaming input mode (B), and proper sharding (C) all speed data supply to prevent GPU starvation, so they're storage/input improvements.

---
