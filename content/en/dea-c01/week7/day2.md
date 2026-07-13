# Day 2 - Amazon Athena: Serverless Queries and Cost Optimization

Amazon Athena is a **serverless** analytics service querying data on S3 with standard SQL. No infrastructure to provision; billed on scanned data volume. Today we cover partition and format optimization, CTAS, federated queries, and cost savings.

## Athena Operating Model

Athena runs on Presto/Trino engine (Athena Engine v3) and uses **Glue Data Catalog** as metastore. Tables are just metadata pointing to S3 locations; data is not separately loaded (schema-on-read).

```sql
-- External table definition pointing to S3 path
CREATE EXTERNAL TABLE orders (
  order_id BIGINT,
  amount   DOUBLE,
  status   STRING
)
PARTITIONED BY (dt STRING)
STORED AS PARQUET
LOCATION 's3://datalake-clean/orders/';
```

> 💡 **Related Theory**: Athena bills per TB scanned. Thus cost = performance = "scan as little as possible." Partitioning, columnar format, and compression simultaneously drive costs and speed.

## Partition Optimization

Adding partition key to WHERE scans only that prefix (partition pruning).

```sql
-- Load partition metadata (auto-recognized if Hive-style)
MSCK REPAIR TABLE orders;

-- Or add individual partition
ALTER TABLE orders ADD PARTITION (dt='2026-06-26')
LOCATION 's3://datalake-clean/orders/dt=2026-06-26/';

-- Pruning works: only dt prefix scanned
SELECT status, COUNT(*) FROM orders
WHERE dt = '2026-06-26' GROUP BY status;
```

With tens of thousands of partitions, `MSCK REPAIR` or catalog lookup becomes a bottleneck. Use **partition projection** to calculate partitions via rules without catalog registration.

```sql
ALTER TABLE orders SET TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.dt.type' = 'date',
  'projection.dt.range' = '2024-01-01,NOW',
  'projection.dt.format' = 'yyyy-MM-dd',
  'storage.location.template' = 's3://datalake-clean/orders/dt=${dt}/'
);
```

## Format and Compression Optimization

- **Columnar format (Parquet/ORC)**: Read only needed columns, massively reduce scan volume. Superior cost and speed to CSV/JSON.
- **Compression (Snappy/ZSTD/GZIP)**: Reduce S3 storage and scan volume. Parquet defaults to Snappy.
- **File size**: 128MB–1GB recommended. Many small files increase metadata and request overhead.

```sql
-- SELECT only needed columns → reduce scan in columnar format
SELECT order_id, amount FROM orders WHERE dt = '2026-06-26';
-- SELECT * scans all columns; avoid it
```

> 💡 **Related Theory**: Same data, CSV→Parquet+Snappy alone cuts scan volume several to dozens of times, proportionally reducing Athena costs. Combined with column projection (needed columns only), effect doubles.

## CTAS and INSERT INTO

**CTAS (CREATE TABLE AS SELECT)** materializes query results to new S3 table. Use for format conversion, partitioning, and materialized aggregations.

```sql
-- Convert CSV original to partitioned Parquet (ETL replacement)
CREATE TABLE orders_parquet
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt'],
  external_location = 's3://datalake-clean/orders_parquet/'
) AS
SELECT order_id, amount, status, dt
FROM orders_raw_csv;
```

For large volumes, use `INSERT INTO ... SELECT` splits due to CTAS's 100-partition limit. CTAS is a powerful lightweight ETL tool for Athena without Glue.

## Federated Queries

Athena can join S3 data with other sources (RDS, DynamoDB, Redshift, CloudWatch, JDBC, etc.) via **data source connectors (Lambda-based)** in single SQL.

```sql
-- Federate join S3 order data with RDS customer master
SELECT o.order_id, c.customer_name, o.amount
FROM s3_catalog.sales.orders o
JOIN rds_postgres.public.customers c
  ON o.customer_id = c.customer_id
WHERE o.dt = '2026-06-26';
```

Connectors run on Lambda; deploy and register per source. Useful for analyzing heterogeneous sources without data movement (ETL).

## Workgroups and Cost Control

**Workgroup** isolates queries by team/purpose and controls costs.

- **Per-query data scan limit**: Auto-cancel queries exceeding threshold.
- **Per-workgroup result location, encryption** settings.
- **CloudWatch metrics** track workgroup scan volume and cost.

```sql
-- Set per-workgroup scan limit to block runaway queries
-- (set BytesScannedCutoffPerQuery in console/CLI)
```

## Key Takeaways

- Athena is serverless + scan-based billing → less scan = cheaper and faster.
- Partitioning + projection + Parquet/compression + SELECT needed columns = core cost savings.
- CTAS/INSERT INTO perform lightweight ETL (format conversion, partitioning) in Athena only.
- Federated queries join RDS/DynamoDB, etc. without ETL.
- Workgroup manages scan limit, cost, and isolation.

## 📝 연습 문제

**문제 1.** Athena 비용을 줄이는 방법으로 가장 효과가 큰 조합은?

A) SELECT * 사용 + CSV 포맷  
B) 파티셔닝 + Parquet + 압축 + 필요 컬럼만 SELECT  
C) 모든 데이터를 단일 대용량 파일로 저장  
D) 페더레이션 쿼리로 모든 소스를 매번 조인  

**정답: B**  
해설: Athena는 스캔량으로 과금하므로 파티션 프루닝, 컬럼형 Parquet, 압축, 컬럼 프로젝션이 스캔량을 직접 줄여 비용·속도를 동시에 개선합니다. SELECT *와 CSV는 스캔량을 늘리고, 단일 거대 파일은 병렬성을 해치며, 페더레이션 남용은 비용과 무관하게 비효율적입니다.

---

**문제 2.** Athena에서 CSV 원본을 파티셔닝된 Parquet 테이블로 변환하는 가장 적절한 방법은?

A) MSCK REPAIR TABLE  
B) ALTER TABLE ADD PARTITION  
C) CREATE TABLE AS SELECT (CTAS)  
D) 페더레이션 쿼리  

**정답: C**  
해설: CTAS는 쿼리 결과를 지정 포맷(Parquet)·압축·파티션으로 새 S3 테이블에 물질화해 경량 ETL을 수행합니다. MSCK/ADD PARTITION은 파티션 메타데이터 관리, 페더레이션 쿼리는 이종 소스 조인용입니다.

---

**문제 3.** 파티션이 수만 개로 많아 MSCK REPAIR와 Glue 카탈로그 조회가 병목일 때 가장 적절한 해결책은?

A) 파티션 프로젝션 활성화  
B) DISTSTYLE ALL 적용  
C) 워크그룹 스캔 한도 설정  
D) ORC 대신 CSV 사용  

**정답: A**  
해설: 파티션 프로젝션은 파티션을 카탈로그에 등록하지 않고 범위·포맷 규칙으로 계산해 대량 파티션 환경의 조회 병목을 제거합니다. DISTSTYLE은 Redshift 개념, 워크그룹 한도는 비용 통제, CSV 전환은 오히려 스캔량을 늘립니다.

---

**문제 4.** S3에 있는 주문 데이터와 RDS PostgreSQL의 고객 마스터를 데이터 이동 없이 한 SQL로 조인하려면?

A) Redshift COPY 명령  
B) Athena 페더레이션 쿼리(데이터 소스 커넥터)  
C) Glue 크롤러  
D) DynamoDB Streams  

**정답: B**  
해설: Athena 페더레이션 쿼리는 Lambda 기반 데이터 소스 커넥터로 RDS·DynamoDB 등 이종 소스를 S3 데이터와 동일 SQL로 조인합니다. COPY는 적재, 크롤러는 스키마 추론, Streams는 변경 캡처입니다.

---

**문제 5.** 특정 팀의 폭주 쿼리가 한 번에 막대한 데이터를 스캔하는 것을 방지하려면 Athena에서 무엇을 사용하는가?

A) 머티리얼라이즈드 뷰  
B) 동시성 스케일링  
C) 워크그룹의 쿼리당 스캔 한도(BytesScannedCutoffPerQuery)  
D) MSCK REPAIR TABLE  

**정답: C**  
해설: 워크그룹에 쿼리당 데이터 스캔 한도를 설정하면 임계 초과 쿼리를 자동 취소해 비용 폭주를 막습니다. 동시성 스케일링은 Redshift 기능, MSCK는 파티션 관리, 머티리얼라이즈드 뷰는 사전 집계입니다.

---
