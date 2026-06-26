# Day 2 - Amazon Athena: 서버리스 쿼리와 비용 최적화

Amazon Athena는 S3에 저장된 데이터를 표준 SQL로 직접 쿼리하는 **서버리스** 분석 서비스입니다. 프로비저닝할 인프라가 없고, 스캔한 데이터량으로 과금됩니다. 오늘은 파티션·포맷 최적화, CTAS, 페더레이션 쿼리, 비용 절감을 다룹니다.

## Athena 동작 모델

Athena는 Presto/Trino 기반 엔진(Athena 엔진 v3)으로 동작하며, **Glue Data Catalog**를 메타스토어로 사용합니다. 테이블은 S3 위치를 가리키는 메타데이터일 뿐이고, 데이터를 별도로 적재하지 않습니다(schema-on-read).

```sql
-- S3 경로를 가리키는 외부 테이블 정의
CREATE EXTERNAL TABLE orders (
  order_id BIGINT,
  amount   DOUBLE,
  status   STRING
)
PARTITIONED BY (dt STRING)
STORED AS PARQUET
LOCATION 's3://datalake-clean/orders/';
```

> 💡 **관련 이론**: Athena는 스캔한 데이터량(TB당)으로 과금합니다. 따라서 비용 = 성능 = "얼마나 적게 스캔하느냐"입니다. 파티셔닝, 컬럼형 포맷, 압축이 비용과 속도를 동시에 좌우합니다.

## 파티션 최적화

파티션 키를 WHERE에 넣으면 해당 프리픽스만 스캔합니다(파티션 프루닝).

```sql
-- 파티션 메타데이터 로드 (Hive 스타일이면 자동 인식)
MSCK REPAIR TABLE orders;

-- 또는 개별 파티션 추가
ALTER TABLE orders ADD PARTITION (dt='2026-06-26')
LOCATION 's3://datalake-clean/orders/dt=2026-06-26/';

-- 프루닝이 작동: dt 프리픽스만 스캔
SELECT status, COUNT(*) FROM orders
WHERE dt = '2026-06-26' GROUP BY status;
```

파티션이 수만 개로 많으면 `MSCK REPAIR`나 카탈로그 조회가 병목이 됩니다. 이때 **파티션 프로젝션**으로 카탈로그 등록 없이 규칙으로 파티션을 계산합니다.

```sql
ALTER TABLE orders SET TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.dt.type' = 'date',
  'projection.dt.range' = '2024-01-01,NOW',
  'projection.dt.format' = 'yyyy-MM-dd',
  'storage.location.template' = 's3://datalake-clean/orders/dt=${dt}/'
);
```

## 포맷·압축 최적화

- **컬럼형 포맷(Parquet/ORC)**: 필요한 컬럼만 읽어 스캔량 대폭 감소. CSV/JSON 대비 비용·속도 모두 우월.
- **압축(Snappy/ZSTD/GZIP)**: S3 저장량과 스캔량 감소. Parquet은 보통 Snappy 기본.
- **파일 크기**: 128MB~1GB 권장. 작은 파일이 많으면 메타데이터·요청 오버헤드 증가.

```sql
-- 필요한 컬럼만 SELECT → 컬럼형 포맷에서 스캔량 절감
SELECT order_id, amount FROM orders WHERE dt = '2026-06-26';
-- SELECT * 는 모든 컬럼을 스캔하므로 피한다
```

> 💡 **관련 이론**: 같은 데이터라도 CSV→Parquet+Snappy 전환만으로 스캔량이 수 배~수십 배 줄어 Athena 비용이 비례해 감소합니다. 컬럼 프로젝션(필요 컬럼만)과 결합하면 효과가 배가됩니다.

## CTAS와 INSERT INTO

**CTAS(CREATE TABLE AS SELECT)**는 쿼리 결과를 새로운 S3 테이블로 저장합니다. 포맷 변환·파티셔닝·집계 결과 물질화에 사용합니다.

```sql
-- CSV 원본을 파티셔닝된 Parquet로 변환 (ETL 대체)
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

대용량은 CTAS의 파티션 100개 제한 때문에 `INSERT INTO ... SELECT`로 나눠 적재합니다. CTAS는 가벼운 ETL을 Glue 없이 Athena만으로 수행하는 강력한 도구입니다.

## 페더레이션 쿼리 (Federated Query)

Athena는 **데이터 소스 커넥터(Lambda 기반)**로 S3 외의 소스(RDS, DynamoDB, Redshift, CloudWatch, JDBC 등)를 동일 SQL로 조인할 수 있습니다.

```sql
-- S3의 주문 데이터와 RDS의 고객 마스터를 페더레이션 조인
SELECT o.order_id, c.customer_name, o.amount
FROM s3_catalog.sales.orders o
JOIN rds_postgres.public.customers c
  ON o.customer_id = c.customer_id
WHERE o.dt = '2026-06-26';
```

커넥터는 Lambda로 실행되며, 소스별로 배포해 등록합니다. 데이터 이동(ETL) 없이 이종 소스를 한 번에 분석할 때 유용합니다.

## 워크그룹과 비용 통제

**워크그룹(Workgroup)**은 쿼리를 팀·용도별로 격리하고 비용을 통제합니다.

- **쿼리당 데이터 스캔 한도(per-query data limit)**: 임계 초과 쿼리 자동 취소.
- **워크그룹별 결과 위치·암호화** 설정.
- **CloudWatch 메트릭**으로 워크그룹별 스캔량·비용 추적.

```sql
-- 워크그룹 단위로 스캔 한도를 두어 폭주 쿼리 차단
-- (콘솔/CLI에서 BytesScannedCutoffPerQuery 설정)
```

## 핵심 정리

- Athena는 서버리스 + 스캔량 과금 → 적게 스캔할수록 싸고 빠르다.
- 파티셔닝·프로젝션 + Parquet/압축 + 필요 컬럼만 SELECT가 핵심 절감 수단.
- CTAS/INSERT INTO로 포맷 변환·파티셔닝 등 경량 ETL을 Athena만으로 수행.
- 페더레이션 쿼리로 RDS/DynamoDB 등 이종 소스를 ETL 없이 조인.
- 워크그룹으로 스캔 한도·비용·격리 관리.

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
