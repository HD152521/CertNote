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

## 📝 연습 문제

**문제 1.** Athena 쿼리가 대부분 100개 컬럼 중 3~4개만 조회하는데 데이터가 CSV로 저장돼 비용이 높다. 스캔 비용을 가장 효과적으로 줄이는 포맷 전환은?

A) JSON으로 변환  
B) Avro로 변환  
C) Parquet 같은 열 기반 포맷으로 변환  
D) 압축하지 않은 TSV로 변환  

**정답: C**  
해설: 열 기반 포맷(Parquet/ORC)은 쿼리에 필요한 컬럼 블록만 읽는 컬럼 프루닝과 통계 기반 스킵을 제공해 몇 개 컬럼만 조회할 때 스캔량을 극적으로 줄인다. JSON·TSV·Avro는 행 기반이라 전체 행을 읽어야 하므로 컬럼 프루닝 이점이 없다.

---

**문제 2.** 거대한 단일 Gzip 압축 CSV 파일을 EMR Spark가 처리하는데 병렬성이 전혀 나오지 않고 워커 하나만 일한다. 근본 원인은?

A) Gzip 압축률이 너무 높아서  
B) 단독 Gzip 텍스트는 분할 불가능(non-splittable)이라 한 워커가 파일 전체를 읽어야 하기 때문  
C) Spark는 압축 파일을 못 읽기 때문  
D) CSV는 컬럼이 없기 때문  

**정답: B**  
해설: 단독 Gzip 텍스트 파일은 분할 불가능해 하나의 파일을 하나의 워커가 통째로 읽어야 하므로 병렬성이 죽는다. 해결책은 Parquet+Snappy처럼 블록 단위로 분할 가능한 형태로 저장하거나, 파일을 적정 크기로 나누는 것이다.

---

**문제 3.** 매출 데이터를 `year/month/day`로 파티셔닝해 S3에 저장했다. `WHERE year=2026 AND month=6 AND day=26` 쿼리가 빠르고 저렴한 이유는?

A) 모든 파티션을 병렬로 읽기 때문  
B) Hive가 자동으로 최적화하기 때문  
C) 엔진이 필요한 파티션만 읽고 나머지 디렉터리를 전혀 열지 않기 때문(파티션 프루닝)  
D) 날짜가 고카디널리티라 압축이 우수하기 때문  

**정답: C**  
해설: 파티션 프루닝(partition pruning)은 조건에 맞지 않는 디렉터리 전체를 읽지 않아 스캔량을 대폭 줄인다. 날짜는 저카디널리티 파티션 키로 이상적이며, 필요한 날짜 디렉터리만 열기 때문에 빠르고 저렴하다.

---

**문제 4.** 작은 파일이 S3에 수만 개 쌓여 있을 때 Athena/Spark 성능이 나쁜 이유는?

A) 작은 파일은 압축이 안 되기 때문  
B) 각 파일마다 LIST/GET 요청·메타데이터 파싱·태스크 스케줄링 오버헤드가 누적되고, 병렬성도 지역성(locality)도 나오지 않기 때문  
C) 컬럼 프루닝이 작은 파일에서 안 되기 때문  
D) Parquet이 작은 파일을 못 읽기 때문  

**정답: B**  
해설: 작은 파일은 수만 개의 S3 요청·메타데이터 파싱·태스크 생성으로 오버헤드를 지배적으로 낳고, 워커 당 일할 충분한 데이터가 없어 유휴 비용이 크다. 해결책은 128MB~1GB로 컴팩션하는 것이다.

---

**문제 5.** Parquet의 강점을 가장 정확히 설명한 것은?

A) CSV보다 압축 비율이 높다  
B) 스키마 진화에 유리하다  
C) 컬럼 프루닝, 통계 기반 스킵, 고압축의 삼위일체로 분석 쿼리 성능을 극대화한다  
D) 행 기반이라 쓰기가 빠르다  

**정답: C**  
해설: Parquet의 핵심 강점은 열 기반으로 필요 컬럼만 읽고(프루닝), min/max 통계로 블록 전체를 스킵하며(predicate pushdown), 같은 컬럼 값 반복으로 고압축된다는 세 가지 상승작용이다. 스키마 진화는 Avro 강점, 행 기반 빠른 쓰기도 Avro·CSV다.

---
