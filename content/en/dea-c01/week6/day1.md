# Day 1 - S3 Data Lake Layout and Partitioning Strategy

The core philosophy of a data lake is "never touch the original data, and accumulate refined copies stage by stage." Today we cover S3 zone structures, partitioning, and naming conventions when using Amazon S3 as data lake storage.

## Why S3 is Suitable as Data Lake Storage

S3 provides virtually unlimited capacity, 11 9's (99.999999999%) durability, and separation of compute and storage. This separation allows multiple engines like Athena, EMR, Redshift Spectrum, and Glue to read the same data simultaneously. Unlike traditional data warehouses, data lakes fill storage first and apply schema at read time (schema-on-read).

> 💡 **Related Theory**: Data lakes use schema-on-read, while data warehouses use schema-on-write. Lakes store structured/semi-structured/unstructured data in their original form and apply schema at query time.

## Zone-Based Layout: raw → clean → curated

Data lakes separate processing stages by bucket or prefix. Generally, a three-tier structure (equivalent to the medallion architecture's bronze/silver/gold concept) is used.

```text
s3://company-datalake-raw/         # Raw(Bronze) — Original as-is, immutable
  └── source=salesforce/dt=2026-06-25/...

s3://company-datalake-clean/       # Clean(Silver) — Validated, deduplicated, type-normalized
  └── domain=sales/orders/year=2026/month=06/day=25/...

s3://company-datalake-curated/     # Curated(Gold) — Business aggregations, consumed by BI/ML
  └── mart=revenue/daily_summary/year=2026/month=06/...
```

- **Raw Zone**: Store collected originals as-is. Never overwrite, serving as the single source of truth for reprocessing. Usually stored long-term with the least expensive storage class.
- **Clean Zone**: Schema validation, missing value handling, type normalization, conversion to columnar format (Parquet). Output of Glue ETL/Spark jobs.
- **Curated Zone**: Data after joins and aggregations, ready for analysis. Read directly by Athena queries, QuickSight dashboards, or ML training.

Separating zones allows different permissions per tier (e.g., Raw for data engineers only) and isolates the scope of impact during reprocessing.

## Partitioning Strategy

Partitioning divides data by key into directory structures (prefixes) to reduce scan volume during queries. When a WHERE condition contains a partition key, Athena/Spark reads only the relevant prefix (partition pruning).

```text
s3://datalake-clean/orders/year=2026/month=06/day=25/region=us-east-1/file.parquet
```

This format is **Hive-style partitioning** (`key=value`), automatically recognized by Glue crawlers and Athena.

```sql
-- Partition pruning works: only year/month/day prefixes are scanned
SELECT region, SUM(amount)
FROM orders
WHERE year = 2026 AND month = 6 AND day = 25
GROUP BY region;
```

Principles for choosing partition keys:
- **Select columns frequently used in query filters** (usually dates/times).
- **Cardinality must be appropriate**. Over-partitioning creates the small files problem, while under-partitioning removes pruning benefits.
- Dates should be divided into `year=/month=/day=` hierarchy to enable pruning at both month and day levels.

> 💡 **Related Theory**: Small files problem — when files are fragmented into tens of thousands of pieces, metadata overhead and S3 GET request costs explode. Recommended file size is 128MB–1GB per file, consolidated via Glue's `groupFiles` or compaction.

## Partition Projection

When partitions grow to tens of thousands, Glue Data Catalog lookups become a bottleneck. Athena's **partition projection** calculates partitions using rules in table properties rather than registering them in the catalog.

```sql
ALTER TABLE orders SET TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.dt.type' = 'date',
  'projection.dt.range' = '2024-01-01,NOW',
  'projection.dt.format' = 'yyyy-MM-dd',
  'storage.location.template' = 's3://datalake-clean/orders/dt=${dt}/'
);
```

Partitions are automatically recognized without a crawler, significantly reducing costs and latency.

## Naming Conventions

- Bucket names are globally unique, lowercase/hyphens only. Identify environment and domain: `acme-datalake-raw-prod`.
- Prefixes follow a consistent `domain/entity/partition` order.
- Include timestamps or UUIDs in filenames to prevent collisions: `orders_20260625_a1b2.parquet`.
- In the past, hash prefixes for request distribution were recommended. Today, S3 automatically supports 3,500 PUT / 5,500 GET per prefix per second, so prioritize readable hierarchical naming.

> 💡 **Related Theory**: S3 no longer requires hash prefixes for hot prefix distribution. Prefixes automatically scale, so use meaningful hierarchical naming.

## Columnar Format and Compression

Analysis data lakes use **Parquet/ORC** columnar format instead of row-based formats (CSV/JSON). Reading only needed columns reduces scan volume and costs; column-level compression (Snappy/ZSTD) lowers storage costs.

```bash
# Example: Upload to Clean zone after Parquet conversion (AWS CLI)
aws s3 cp ./orders.parquet \
  s3://acme-datalake-clean-prod/sales/orders/year=2026/month=06/day=25/orders.parquet
```

## Key Takeaways

- Zone separation (raw/clean/curated) preserves originals and isolates permissions and reprocessing per tier.
- Hive-style partitioning enables pruning; date hierarchy is typical.
- Avoid small files (128MB–1GB recommended), and optimize costs and performance with Parquet + compression.
- For many partitions, use partition projection to bypass catalog bottlenecks.

## 📝 연습 문제

**문제 1.** 데이터레이크에서 수집한 원본 데이터를 절대 변경하지 않고 보관하며, 재처리의 단일 진실 공급원 역할을 하는 존은 무엇인가?

A) Curated 존  
B) Clean 존  
C) Raw 존  
D) Sandbox 존  

**정답: C**  
해설: Raw(Bronze) 존은 수집한 원본을 그대로 불변 보관하며 재처리의 source of truth입니다. Clean은 검증·정규화된 중간 단계, Curated는 비즈니스 집계 결과로 소비용입니다. Sandbox는 표준 3계층에 포함되지 않습니다.

---

**문제 2.** Athena 쿼리에서 `WHERE year=2026 AND month=6` 조건이 해당 프리픽스만 스캔하도록 만드는 기법은?

A) 파티션 프루닝  
B) 데이터 스큐  
C) 브로드캐스트 조인  
D) 버킷팅 셔플  

**정답: A**  
해설: 파티션 키가 WHERE 조건에 있으면 엔진이 관련 프리픽스만 읽는 파티션 프루닝이 작동해 스캔량과 비용을 줄입니다. 나머지는 파티션 기반 스캔 절감과 무관한 개념입니다.

---

**문제 3.** 데이터레이크에서 파일이 수만 개의 매우 작은 파일로 쪼개졌을 때 발생하는 문제로 가장 적절한 것은?

A) 데이터 내구성이 떨어진다  
B) 메타데이터 오버헤드와 S3 요청 비용이 증가한다  
C) 파티션 프루닝이 비활성화된다  
D) 스키마가 자동으로 변경된다  

**정답: B**  
해설: 작은 파일 문제는 파일별 메타데이터 처리 오버헤드와 다수의 S3 GET 요청으로 비용·지연이 증가합니다. 권장은 128MB~1GB이며 compaction으로 병합합니다. 내구성·스키마·프루닝과는 직접 관련이 없습니다.

---

**문제 4.** Glue Data Catalog에 파티션을 등록하지 않고 테이블 속성의 규칙으로 파티션을 계산해 카탈로그 병목을 줄이는 Athena 기능은?

A) 파티션 프로젝션  
B) 크롤러 스케줄링  
C) CTAS  
D) 워크그룹 격리  

**정답: A**  
해설: 파티션 프로젝션(Partition Projection)은 파티션을 카탈로그에 일일이 등록하지 않고 범위·포맷 규칙으로 계산해 대량 파티션 환경에서 조회 비용과 지연을 줄입니다. 크롤러는 등록 방식이고, CTAS는 결과 테이블 생성, 워크그룹은 비용·격리 관리입니다.

---

**문제 5.** 분석용 데이터레이크에서 컬럼 단위로 필요한 데이터만 읽어 스캔량을 줄이고 압축 효율이 높은 권장 파일 포맷은?

A) CSV  
B) JSON  
C) Parquet  
D) XML  

**정답: C**  
해설: Parquet(또는 ORC)은 컬럼형 포맷으로 필요한 컬럼만 읽어 스캔 비용을 줄이고 컬럼 단위 압축으로 저장 비용을 낮춥니다. CSV/JSON/XML은 행 기반 또는 비효율적이어서 분석 워크로드에 부적합합니다.

---
