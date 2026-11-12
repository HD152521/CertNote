# Day 3 - Open Table Formats: Iceberg, Hudi, Delta Lake

## 📌 Key Takeaways

- Open table formats add a **metadata layer that records "which files are the table right now"** on top of Parquet files in S3, providing ACID, row-level UPDATE/DELETE/MERGE, and time travel.
- **Iceberg** is strong in schema and partition evolution and hidden partitioning, **Hudi** in upserts and incremental queries (CDC), and **Delta Lake** in integration with the Spark ecosystem.
- Athena supports **read and write only for Iceberg**, while Hudi and Delta Lake are read-only. To write all three formats, use Spark on Glue (3.0 or later) or EMR.
- **Copy-on-Write** rewrites files at write time so reads are fast, while **Merge-on-Read** records changes separately so writes are fast but data is merged at read time. Athena's Iceberg DML is always Merge-on-Read.
- Table formats **require maintenance**. Manage read performance with compaction (`OPTIMIZE`) and storage cost with snapshot expiration (`VACUUM`). The data of deleted rows stays in S3 until the snapshots expire.

## Why Open Table Formats Are Needed

A traditional data lake (Parquet + Hive metastore) is "directory = table." The engine lists the partition paths and treats every file found there as the contents of the table. This simplicity creates limits.

- **There is no atomicity.** If a job writes 6 of 10 files and dies, those 6 are visible in the table as they are. A query that reads while the write is in progress sees only half.
- **To fix a single row, you must rewrite the whole file.** Parquet is a file that cannot be modified. On top of that, there is no way to guarantee consistency while rewriting.
- **Schema and partition changes are risky.** Renaming a column or changing the partitioning scheme falls out of sync with existing files.
- **You cannot see a past point in time.** Once you overwrite, the previous state is gone.
- **Responding to the GDPR "right to erasure" is hard.** To delete only a specific customer's rows, you have to rewrite the entire partition.

Open table formats flip the idea. **They do not list paths; only the files the metadata points to count as the table.** If you change the metadata pointer all at once (commit) after finishing writing new files, everything becomes visible at that moment, and if it fails, nothing becomes visible.

The ACID of open table formats is snapshot-based. A write creates new data files and new metadata, then atomically swaps the "current snapshot" pointer. A read sees only the snapshot as of its start, so reads and writes do not block each other (snapshot isolation). If you leave previous snapshots instead of deleting them, that is time travel.

## Iceberg's Metadata Structure

Looking at the layers based on Iceberg, which AWS supports most broadly, gives the following.

```text
Glue Data Catalog table ── metadata_location ──► metadata file (schema, partition spec, snapshot list)
                                                      │
                                                      ▼
                                              manifest list (1 snapshot = list of manifests)
                                                      │
                                                      ▼
                                              manifest file (data file list + per-file column statistics)
                                                      │
                                                      ▼
                                              data files (Parquet/ORC/Avro), delete files
```

- What the catalog holds is **just one thing: "the location of the latest metadata file."** A commit is the act of switching this pointer to a new file.
- If two writers commit at the same time, only one succeeds (optimistic concurrency). The loser rereads the latest state and retries. Athena supports only the optimistic locking of the Glue catalog.
- Because the manifests hold per-file statistics, the engine chooses the files to read **without listing S3**. This is why planning does not slow down even with many partitions.

## Comparing the Three Formats

| Aspect | Apache Iceberg | Apache Hudi | Delta Lake |
|------|------|------|------|
| Metadata | Metadata file → manifest list → manifest | Timeline (`.hoodie`) + index | Transaction log (JSON + Parquet checkpoints in `_delta_log`) |
| Strengths | Schema and partition evolution, hidden partitioning, engine neutrality | Record-key-based upserts, incremental queries | Integration with Spark |
| Write method | CoW / MoR (delete files) | CoW / MoR table types | Mainly CoW, deletion vectors |
| Athena | Read, write, DDL, time travel | Read-only (snapshot and read-optimized queries) | Read-only, time travel not supported |
| Glue ETL (Spark) | Read and write | Read and write | Read and write |
| EMR | Used in Spark, Flink, Trino, etc. | Used | Used |
| Clues for choosing | "Modify and delete with Athena SQL", "must change the partitioning scheme" | "Load CDC as upserts", "read only what changed incrementally" | "Existing Databricks/Delta assets", "Spark-centric" |

- **Hidden partitioning (Iceberg)**: You define partitions with a transform function, such as `PARTITIONED BY (month(dt))`. Queries only need to use `WHERE dt >= ...`, and the engine computes partition values and prunes. Unlike Hive style, users do not need to know about `year=` and `month=` columns.
- **Partition evolution (Iceberg)**: Even if you change monthly partitions to daily, existing files are not rewritten. Old files are read with the old spec, and new files with the new spec.
- **Hudi query types**: Snapshot query (latest state), incremental query (only what changed after a specific commit), and read-optimized query (only the compacted portion in MoR). Incremental queries let downstream pipelines run incrementally.

## Copy-on-Write and Merge-on-Read

| Aspect | Copy-on-Write (CoW) | Merge-on-Read (MoR) |
|------|------|------|
| On change | Rewrites the whole data file containing that row | Records changes and deletions in separate files (delete files, logs) |
| Write cost | High | Low |
| Read cost | Low (just read the files) | High (merges data files and changes at read time) |
| Suitable workload | Read-heavy, rare changes | Write-heavy and change-heavy, streaming upserts |
| Maintenance | Less needed | Compaction is required |

- Hudi's MoR stores data split into a columnar (Parquet) base file and a row-based (Avro) delta log, and compaction merges the log into the base file.
- **Athena's Iceberg `UPDATE`, `DELETE`, and `MERGE INTO` are always Merge-on-Read.** They use position delete files, and ignore a CoW setting even if you specify it in table properties. So a table you modify often with Athena accumulates delete files and needs periodic `OPTIMIZE`.

> ⚠️ **Pitfall**: The answer to "reads on an MoR table are getting slower and slower" is compaction. Snapshot expiration (`VACUUM`) only reduces storage and does not remove the delete files that must be merged at read time. Conversely, the answer to "storage cost keeps growing" is snapshot expiration. Do not mix the two up.

## Row-Level DML and Time Travel

```sql
-- Athena (Iceberg): row-level UPDATE / DELETE
UPDATE sales.orders SET status = 'cancelled' WHERE order_id = 1001;
DELETE FROM sales.orders WHERE customer_id = 'GDPR-REQ-42';

-- MERGE (upsert): apply source changes to the target
MERGE INTO sales.orders AS t
USING staging.order_changes AS s
ON t.order_id = s.order_id
WHEN MATCHED THEN UPDATE SET status = s.status
WHEN NOT MATCHED THEN INSERT (order_id, status) VALUES (s.order_id, s.status);
```

```sql
-- Time travel: query as of a past timestamp / snapshot ID (Iceberg on Athena)
SELECT * FROM sales.orders FOR TIMESTAMP AS OF TIMESTAMP '2026-06-20 00:00:00';
SELECT * FROM sales.orders FOR VERSION AS OF 8623491172120013573;

-- Check the snapshot list (Iceberg metadata table)
SELECT snapshot_id, committed_at, operation FROM "sales"."orders$snapshots";
```

- A single DML creates one snapshot. If you loaded something wrongly, you can query as of the previous snapshot to extract recovery data.
- The range you can go back to with time travel is **up to the snapshots that remain**. If you expire the snapshots, you cannot go back before them.

> ⚠️ **Pitfall**: Running `DELETE` does not make the data disappear from S3. It is just not visible in the new snapshot; the data files that previous snapshots point to are still there and can be read again with time travel. To handle a GDPR deletion request **completely**, you must go all the way through `DELETE` → compaction (rewrite files to reflect deletions) → snapshot expiration (physically delete old files). If the bucket has S3 versioning enabled, you also need a rule to clean up noncurrent versions.

## AWS Integration

### Athena

```sql
CREATE TABLE sales.orders (
  order_id bigint, customer_id string, status string, amount double, dt date
)
PARTITIONED BY (month(dt))           -- Iceberg hidden partitioning
LOCATION 's3://acme-datalake-curated/iceberg/orders/'
TBLPROPERTIES ('table_type' = 'ICEBERG');
```

- It is `CREATE TABLE`, not `CREATE EXTERNAL TABLE`. Adding `EXTERNAL` causes an error. `LOCATION` and `'table_type'='ICEBERG'` are required.
- The partition transform functions are `year`, `month`, `day`, `hour`, `bucket(N, col)`, and `truncate(L, col)`.
- Athena creates and works with Iceberg v2 tables, and supports **only Iceberg tables registered in the Glue Data Catalog**. The data file format is Parquet (default), ORC, or Avro.
- Hudi can only be read. Incremental queries, CTAS, `INSERT INTO`, and `MSCK REPAIR TABLE` are not supported on Hudi tables.
- Delta Lake is read directly in engine version 3 without generating a manifest. Write DML and Delta's time travel are not supported.
- With Lake Formation you can manage **read permissions** on these tables, but you cannot manage permissions for operations such as `VACUUM`, `MERGE`, `UPDATE`, and `OPTIMIZE` with Lake Formation.

### Glue and EMR

- **AWS Glue 3.0 or later** supports Hudi, Delta Lake, and Iceberg natively. Without installing a separate connector, specify `iceberg`, `hudi`, or `delta` in the job parameter `--datalake-formats`.
- **EMR** uses the three formats in Spark, Flink, Trino, and so on. It suits large-scale batch upserts and compaction jobs.
- All three formats can use the Glue Data Catalog as their catalog, so a table written by one engine is read by another. However, the support scope differs by engine, as in the table above.

```python
# Upsert into an Iceberg table in Glue Spark (job parameter: --datalake-formats iceberg)
spark.sql("""
  MERGE INTO glue_catalog.sales.orders t
  USING updates s ON t.order_id = s.order_id
  WHEN MATCHED THEN UPDATE SET *
  WHEN NOT MATCHED THEN INSERT *
""")
```

## Maintenance: Compaction and Snapshot Expiration

The more you write to a table format, the more three things pile up.

| What piles up | Cause | Result | How to clean up |
|------|------|------|------|
| Small data files | Frequent small commits, streaming ingestion | Slower reads | Compaction |
| Delete files | MoR-style UPDATE/DELETE | Merge cost at read time | Compaction |
| Old snapshots and their files, orphan files | Every commit, failed jobs | Rising storage cost | Snapshot expiration, orphan file removal |

```sql
-- Compaction: merge delete files into data files and rewrite closer to the target size
OPTIMIZE sales.orders REWRITE DATA USING BIN_PACK
  WHERE dt >= DATE '2026-06-01';

-- Shorten snapshot retention to 3 days, then expire and remove orphan files
ALTER TABLE sales.orders SET TBLPROPERTIES ('vacuum_max_snapshot_age_seconds' = '259200');
VACUUM sales.orders;
```

| Athena Iceberg table property | Default | Meaning |
|------|------|------|
| `vacuum_max_snapshot_age_seconds` | 432000 (5 days) | Snapshots older than this are treated as expiration targets |
| `vacuum_min_snapshots_to_keep` | 1 | The minimum number of snapshots to keep. Takes priority over the retention period |
| `optimize_rewrite_data_file_threshold` | 5 | If fewer data files need optimizing than this, they are not rewritten |
| `optimize_rewrite_delete_file_threshold` | 2 | If fewer delete files are attached to a data file than this, it is not rewritten |

- `OPTIMIZE` and `VACUUM` are queries you must run yourself. If you do not set a schedule, nobody runs them.
- To avoid running them yourself, turn on **table optimization in the Glue Data Catalog**. It performs compaction, snapshot retention, and orphan file removal in a managed way for Iceberg tables.
- Compaction also creates a new snapshot. Right after compaction, old files and new files exist together, so storage temporarily **increases.** It shrinks only when you also expire snapshots.
- The snapshot retention period is a choice between "how far back must we be able to time travel" and "storage cost."

You must not expire the data prefix of an Iceberg table with an S3 lifecycle rule. The metadata believes those files exist, so if the files vanish, queries fail. Manage the file lifetime of a table format with the table format's tools (snapshot expiration, orphan file removal).

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Queries on a frequently modified Iceberg table get slower and slower | Accumulated delete files and small files | `OPTIMIZE` or Glue automatic compaction |
| Row count unchanged but storage keeps growing | Old snapshots hold on to old files | `VACUUM` (snapshot expiration), adjust the retention period |
| Cannot time travel to last week | That snapshot has already expired | Extend the retention period to fit requirements (a preventive step) |
| Deleted customer data remains in S3 | Previous snapshots still reference it | Compaction, then snapshot expiration |
| INSERT into a Hudi table from Athena fails | Athena is read-only for Hudi | Write with Glue/EMR Spark |
| One of the concurrent write jobs fails with a commit conflict | Optimistic concurrency conflict | Retry, separate jobs that write the same partition concurrently |
| `CREATE EXTERNAL TABLE ... ICEBERG` error | Iceberg does not support the EXTERNAL keyword | Use `CREATE TABLE` |

## Exam Clue → Answer Lookup

| Clue in the question | Answer |
|------|------|
| "ACID transactions and row-level updates and deletes in an S3 data lake" | Open table format (Iceberg if done with Athena) |
| "Delete a specific customer's records (GDPR)" | Table format DELETE + compaction and snapshot expiration |
| "Upsert CDC changes, query only what changed incrementally" | Hudi (or Iceberg `MERGE INTO`) |
| "Query the table state as of yesterday" | Time travel (`FOR TIMESTAMP AS OF`) |
| "Change the partitioning scheme without rewriting existing data" | Iceberg partition evolution |
| "Pruning even if query authors do not know the partition columns" | Iceberg hidden partitioning |
| "Write-heavy, a bit of read latency is acceptable" | Merge-on-Read |
| "Mostly reads, rare changes" | Copy-on-Write |
| "Slow because of small files and delete files" | Compaction |
| "Iceberg maintenance without operational burden" | Glue Data Catalog table optimization |

Tomorrow we cover how to reduce the storage cost of the lake built up this way with storage classes and lifecycle rules.

## 📖 Glossary

- **Open table format**: An open specification that adds transaction metadata on top of data files so that a set of files is handled like a table. Iceberg, Hudi, and Delta Lake are the main ones.
- **Snapshot**: The list of files that make up the table at a specific commit point. One is created per commit.
- **Manifest**: An Iceberg metadata file that holds a list of data files and per-file statistics.
- **Time travel**: A feature that queries the table as of a past point by specifying a past snapshot.
- **Hidden partitioning**: An Iceberg feature that defines partitions by applying a transform function to a column, and lets queries use only the original column.
- **Copy-on-Write (CoW)**: A method that rewrites the whole data file when changing it.
- **Merge-on-Read (MoR)**: A method that records changes in separate files and merges them at read time.
- **Delete file**: An Iceberg file that records "the row at this position in this file was deleted." It is applied to data files at read time.
- **Upsert**: An operation that does UPDATE if the key exists and INSERT if not. In SQL it is written as `MERGE INTO`.
- **Orphan file**: A file that remains in S3 but that no snapshot points to. Failed jobs mostly leave them.

## 📝 Practice Questions

**Question 1.** Which of the following is NOT a core capability that open table formats (Iceberg/Hudi/Delta) provide compared with traditional Hive-style Parquet tables?

A) ACID transactions  
B) Row-level UPDATE/DELETE  
C) Time travel queries to a past point in time  
D) Introducing columnar compression itself for the first time  

**Answer: D**  
Explanation: Columnar compression was already provided by Parquet/ORC and is not a new capability of table formats. ACID, row-level DML, and time travel are the core value that open table formats added.

---

**Question 2.** You must efficiently delete only a specific customer's rows in response to a GDPR deletion request. What is the most suitable approach?

A) Re-export the entire table to CSV every time  
B) Delete at the row level with a DELETE statement on an Iceberg/Hudi/Delta table  
C) Turn off S3 bucket versioning  
D) Rerun the Glue crawler  

**Answer: B**  
Explanation: Open table formats support row-level DELETE, which efficiently deletes specific rows without rewriting entire partitions, making them suitable for GDPR/CCPA deletion requests. The others do not solve row-level deletion.

---

**Question 3.** Which table format specializes in upserts and incremental (CDC) queries and provides Copy-on-Write/Merge-on-Read modes?

A) Apache Hudi  
B) CSV  
C) Avro  
D) ORC  

**Answer: A**  
Explanation: Apache Hudi is strong in CoW/MoR modes and index-based upserts and incremental queries, making it suitable for CDC ingestion. CSV/Avro/ORC are file formats, not transactional table formats.

---

**Question 4.** What is the correct syntax in Athena engine version 3 to query an Iceberg table as of a specific past timestamp?

A) `SELECT * FROM orders ROLLBACK TO ...`  
B) `SELECT * FROM orders FOR TIMESTAMP AS OF TIMESTAMP '2026-06-20 00:00:00'`  
C) `SELECT * FROM orders SNAPSHOT NOW()`  
D) `SELECT * FROM orders WHERE _version < 5`  

**Answer: B**  
Explanation: Athena's time travel syntax is `FOR TIMESTAMP AS OF` or `FOR VERSION AS OF`. The other syntaxes are not Athena Iceberg time travel syntax.

---

**Question 5.** Which option correctly states the main reason the read performance of a Merge-on-Read (MoR) table degrades over time, and its solution?

A) Snapshots are deleted immediately — disable versioning  
B) Delete/log files accumulate, increasing the merge cost at read time — periodic compaction  
C) The partition key changes automatically — rerun the crawler  
D) Compression is undone — turn off encryption  

**Answer: B**  
Explanation: MoR records changes and deletions in separate delete/log files and merges them at read time, so read cost increases as files accumulate. Merging them with periodic compaction (OPTIMIZE) restores performance. The others are inappropriate as causes and solutions.

---
