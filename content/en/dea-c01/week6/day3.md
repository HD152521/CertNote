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

## 📝 연습 문제

**문제 1.** 전통적 Hive 스타일 Parquet 테이블 대비 오픈 테이블 포맷(Iceberg/Hudi/Delta)이 제공하는 핵심 기능이 아닌 것은?

A) ACID 트랜잭션  
B) 행 수준 UPDATE/DELETE  
C) 과거 시점 시간 여행 조회  
D) 컬럼형 압축 자체를 처음 도입  

**정답: D**  
해설: 컬럼형 압축은 Parquet/ORC가 이미 제공하던 기능으로 테이블 포맷의 신규 기능이 아닙니다. ACID, 행 수준 DML, 시간 여행이 오픈 테이블 포맷이 추가한 핵심 가치입니다.

---

**문제 2.** GDPR 삭제 요청에 따라 특정 고객의 행만 효율적으로 삭제해야 한다. 가장 적합한 접근은?

A) 전체 테이블을 매번 CSV로 다시 내보낸다  
B) Iceberg/Hudi/Delta 테이블에서 DELETE 문으로 행 수준 삭제한다  
C) S3 버킷 버전 관리를 끈다  
D) Glue 크롤러를 재실행한다  

**정답: B**  
해설: 오픈 테이블 포맷은 행 수준 DELETE를 지원해 파티션 전체 재작성 없이 특정 행을 효율적으로 삭제하므로 GDPR/CCPA 삭제 요청에 적합합니다. 나머지는 행 단위 삭제를 해결하지 못합니다.

---

**문제 3.** 업서트와 증분(CDC) 쿼리에 특화되어 있고 Copy-on-Write/Merge-on-Read 모드를 제공하는 테이블 포맷은?

A) Apache Hudi  
B) CSV  
C) Avro  
D) ORC  

**정답: A**  
해설: Apache Hudi는 CoW/MoR 모드와 인덱스 기반 업서트·증분 쿼리에 강점이 있어 CDC 적재에 적합합니다. CSV/Avro/ORC는 파일 포맷이지 트랜잭션형 테이블 포맷이 아닙니다.

---

**문제 4.** Athena 엔진 v3에서 Iceberg 테이블을 특정 과거 타임스탬프 시점으로 조회하는 올바른 구문은?

A) `SELECT * FROM orders ROLLBACK TO ...`  
B) `SELECT * FROM orders FOR TIMESTAMP AS OF TIMESTAMP '2026-06-20 00:00:00'`  
C) `SELECT * FROM orders SNAPSHOT NOW()`  
D) `SELECT * FROM orders WHERE _version < 5`  

**정답: B**  
해설: Athena의 시간 여행 구문은 `FOR TIMESTAMP AS OF` 또는 `FOR VERSION AS OF`입니다. 나머지 구문은 Athena Iceberg 시간 여행 문법이 아닙니다.

---

**문제 5.** Merge-on-Read(MoR) 테이블의 읽기 성능이 시간이 지나며 저하되는 주된 이유와 해결책으로 옳은 것은?

A) 스냅샷이 즉시 삭제되므로 — 버전 관리 비활성화  
B) delete/log 파일이 누적되어 읽기 시 병합 비용 증가 — 주기적 compaction  
C) 파티션 키가 자동 변경되므로 — 크롤러 재실행  
D) 압축이 풀리므로 — 암호화 해제  

**정답: B**  
해설: MoR은 변경·삭제를 별도 delete/log 파일로 기록하고 읽을 때 병합하므로, 파일이 쌓이면 읽기 비용이 증가합니다. 주기적 compaction(OPTIMIZE)으로 병합해 성능을 회복합니다. 나머지는 원인·해결로 부적절합니다.

---
