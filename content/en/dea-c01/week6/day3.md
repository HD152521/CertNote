# Day 3 - Open Table Formats: Iceberg, Hudi, Delta Lake

Traditional data lakes (Parquet + Hive metastore) struggle with ACID transactions, row-level updates, and time travel. Open table formats (Apache Iceberg, Apache Hudi, Delta Lake) add a transaction layer to Parquet files on S3, solving these problems. Today we cover three formats and AWS integration.

## Why Open Table Formats Are Needed

Hive-style tables treat "directory = table" and read based on file lists. This approach has limitations:
- Consistency guarantees during concurrent writes are difficult (lack of atomicity).
- Single record UPDATE/DELETE is very expensive (entire file rewrite).
- Schema changes and historical point-in-time queries are inconvenient.
- Row-level deletion for GDPR "right to be forgotten" is difficult.

Open table formats track which files represent the current table state through **metadata (manifests/transaction logs)**, providing ACID.

> 💡 **Related Theory**: ACID in open table formats is based on metadata snapshots. When a new snapshot commits atomically, reads always see a consistent snapshot, which is the foundation for time travel.

## Comparison of Three Formats

| Format | Metadata Method | Strengths | AWS Support |
|--------|-----------------|-----------|------------|
| Apache Iceberg | Manifest + Snapshot | Schema/partition evolution, hidden partitioning | First-class Athena/Glue/EMR support |
| Apache Hudi | Timeline + Index | Upsert and incremental queries (CDC) optimized | EMR/Glue support |
| Delta Lake | Transaction log (_delta_log) | Spark ecosystem integration | EMR/Glue support |

- **Iceberg**: Hidden partitioning enables pruning even without knowing partition columns in queries. Schema and partition evolution are flexible. AWS offers broadest support.
- **Hudi**: Two modes—Copy-on-Write (CoW) and Merge-on-Read (MoR). Strong for upserts and incremental queries, suitable for CDC ingestion.
- **Delta**: Databricks-originated, powerful in Spark. Manages transactions via JSON/Parquet checkpoints in `_delta_log`.

## ACID, Time Travel, and Row-Level Updates

All three formats provide core capabilities:

```sql
-- Athena (Iceberg): row-level UPDATE / DELETE
UPDATE sales.orders SET status = 'cancelled' WHERE order_id = 1001;
DELETE FROM sales.orders WHERE customer_id = 'GDPR-REQ-42';

-- MERGE (upsert): apply source changes to target
MERGE INTO sales.orders AS t
USING staging.order_changes AS s
ON t.order_id = s.order_id
WHEN MATCHED THEN UPDATE SET status = s.status
WHEN NOT MATCHED THEN INSERT (order_id, status) VALUES (s.order_id, s.status);
```

```sql
-- Time travel: query past snapshot/timestamp (Iceberg on Athena)
SELECT * FROM sales.orders FOR TIMESTAMP AS OF TIMESTAMP '2026-06-20 00:00:00';
SELECT * FROM sales.orders FOR VERSION AS OF 8623491172120013573;
```

Row-level deletion is key to GDPR/CCPA compliance. Traditional Parquet tables required full partition rewrites, while table formats handle efficient deletion via delete files and rewrites.

> 💡 **Related Theory**: Merge-on-Read records deletes and changes in separate delete files, merging on read. Writes are fast but read costs rise; periodic compaction balances this. Copy-on-Write immediately rewrites on write for fast reads.

## AWS Integration

### Athena
Athena Engine v3 supports Iceberg tables with `CREATE TABLE`, DML (`INSERT/UPDATE/DELETE/MERGE`), and time travel in SQL.

```sql
CREATE TABLE sales.orders (
  order_id bigint, customer_id string, status string, amount double, dt date
)
PARTITIONED BY (month(dt))           -- Iceberg hidden partitioning
LOCATION 's3://acme-datalake-curated/iceberg/orders/'
TBLPROPERTIES ('table_type' = 'ICEBERG');
```

### Glue & EMR
- **Glue 4.0/5.0**: Built-in connectors for Iceberg, Hudi, Delta. Spark jobs read and write table format DataFrames.
- **EMR**: All three formats work in Spark/Flink/Trino. Suitable for large-scale batch upserts and compaction jobs.

```python
# Example: write Iceberg table in Glue Spark
spark.sql("""
  MERGE INTO glue_catalog.sales.orders t
  USING updates s ON t.order_id = s.order_id
  WHEN MATCHED THEN UPDATE SET *
  WHEN NOT MATCHED THEN INSERT *
""")
```

### Catalog
All three formats can use Glue Data Catalog as metastore, enabling Athena, Redshift Spectrum, and EMR to share the same table.

## Maintenance: Compaction and Snapshot Expiration

Open table formats require operational maintenance:
- **Compaction**: Merge small files and delete files to recover read performance.
- **Snapshot expiration**: Clean up old snapshots and orphaned files to reduce storage costs (time travel window shrinks).

```sql
-- Athena Iceberg table optimization and cleanup
OPTIMIZE sales.orders REWRITE DATA USING BIN_PACK;
VACUUM sales.orders;
```

## Key Takeaways

- Open table formats add transaction metadata to S3 Parquet, providing ACID, time travel, and row-level DML.
- Iceberg excels in schema/partition evolution and broad AWS support; Hudi in upserts/incremental (CDC); Delta in Spark integration.
- Athena v3, Glue, and EMR integrate with all three formats, sharing Glue Data Catalog.
- MoR/CoW tradeoffs and compaction/snapshot expiration maintenance are important.

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
