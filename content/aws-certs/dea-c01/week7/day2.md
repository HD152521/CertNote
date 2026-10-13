# Day 2 - Amazon Athena: 서버리스 쿼리와 비용 최적화

## 📌 핵심 정리

- Athena 는 S3 의 데이터를 SQL 로 직접 조회하는 서버리스 서비스이고, **스캔한 데이터량**으로 과금한다. 적게 읽을수록 싸고 빠르다.
- 스캔량을 줄이는 수단은 셋이다: **파티션**(필요한 경로만), **컬럼형 포맷 + 압축**(필요한 컬럼만, 더 작게), **쿼리 작성**(`SELECT *` 금지, 파티션 키로 필터).
- **CTAS / INSERT INTO** 는 쿼리 결과를 Parquet·파티션 테이블로 써서 가벼운 ETL 을 대신한다. 한 번에 쓸 수 있는 파티션은 100개다.
- **페더레이션 쿼리**는 데이터 소스 커넥터로 RDS·DynamoDB·Redshift 같은 S3 밖 소스를 같은 SQL 로 조인한다. 읽기 전용이다.
- **워크그룹**이 비용 통제의 단위다. 쿼리당 스캔 한도는 넘는 쿼리를 **취소**하고, 워크그룹 전체 한도는 **알림**만 보낸다.

## Athena 동작 모델

Amazon Athena 는 프로비저닝할 인프라가 없다. 쿼리를 던지면 Athena 가 Trino 기반 엔진(엔진 버전 3)을 대신 돌린다.

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

- 테이블은 **Glue Data Catalog 의 메타데이터**일 뿐이다. 데이터를 적재하지 않는다(schema-on-read). `DROP TABLE` 을 해도 S3 의 파일은 그대로 있다.
- 쿼리 결과는 지정한 **S3 결과 위치**에 파일로 저장된다. 결과 버킷에도 저장 요금이 쌓이므로 수명주기 만료 규칙을 건다.
- 쿼리는 계정의 동시 실행 쿼터 안에서 돌고, 넘치면 대기한다. DML 쿼리에는 실행 시간 제한이 있다.

### 과금 구조

| 항목 | 내용 |
|------|------|
| 기본 단위 | 쿼리가 스캔한 데이터량(TB당). 압축된 파일은 **압축된 크기**로 계산 |
| 최소 과금 | 쿼리당 10MB |
| DDL | `CREATE TABLE`, `ALTER TABLE ADD PARTITION` 같은 DDL 은 스캔이 없어 과금되지 않는다 |
| 취소한 쿼리 | 취소 시점까지 스캔한 만큼 과금 |
| 함께 드는 비용 | S3 저장·요청, Glue Data Catalog, 페더레이션 쿼리의 Lambda 호출 |
| 대안 요금제 | 프로비저닝된 용량(DPU 를 예약해 시간 단위로 과금, 스캔량 과금 없음) |

- 실행 시간이 아니라 **읽은 양**이 요금이다. 10분 걸린 쿼리가 1초 걸린 쿼리보다 쌀 수 있다.
- 스캔량과 무관하게 예측 가능한 비용과 동시성 제어가 필요하면 프로비저닝된 용량을 워크그룹에 붙인다.

> 💡 **관련 이론**: Athena 에서는 비용 최적화와 성능 최적화가 같은 방향이다. 둘 다 "S3 에서 덜 읽기"로 귀결되기 때문이다. Redshift 처럼 컴퓨팅을 예약해 둔 서비스에서는 쿼리를 아무리 아껴도 요금이 그대로지만, Athena 는 쿼리를 고친 만큼 청구서가 줄어든다.

## 스캔량을 줄이는 세 층

같은 질문을 던져도 데이터의 형태에 따라 읽는 양이 크게 달라진다. 하루치 주문에서 두 컬럼의 합계를 구하는 쿼리를 예로 들면 이렇다.

| 데이터 형태 | Athena 가 읽는 범위 |
|------|------|
| CSV, 파티션 없음 | 테이블 전체의 모든 바이트 |
| CSV + gzip | 전체(압축된 크기). 파일 하나를 나눠 읽지 못해 병렬성도 떨어진다 |
| CSV, 날짜 파티션 | 그 날짜 프리픽스의 모든 컬럼 |
| Parquet, 날짜 파티션 | 그 날짜 프리픽스에서 **필요한 두 컬럼**만 |
| Parquet(정렬됨), 날짜 파티션 + 추가 필터 | 위에서 다시 최소·최대 통계에 걸리지 않는 구간을 건너뜀 |

### ① 파티션

```sql
-- 파티션 메타데이터 로드 (Hive 스타일 경로일 때)
MSCK REPAIR TABLE orders;

-- 또는 개별 파티션 추가
ALTER TABLE orders ADD PARTITION (dt='2026-06-26')
LOCATION 's3://datalake-clean/orders/dt=2026-06-26/';

-- 프루닝이 작동: dt 프리픽스만 스캔
SELECT status, COUNT(*) FROM orders
WHERE dt = '2026-06-26' GROUP BY status;
```

- `MSCK REPAIR TABLE` 은 S3 를 훑어 파티션을 **추가만** 한다. 지워진 파티션을 빼 주지 않고, 파티션이 많으면 오래 걸리다 타임아웃되어 일부만 등록된 상태로 끝날 수 있다. 매일 파티션 하나를 추가하는 용도로는 `ALTER TABLE ADD PARTITION` 이 맞다.
- 파티션이 수만 개면 카탈로그 조회가 병목이다. **파티션 프로젝션**으로 등록 없이 규칙으로 계산한다.

```sql
ALTER TABLE orders SET TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.dt.type' = 'date',
  'projection.dt.range' = '2024-01-01,NOW',
  'projection.dt.format' = 'yyyy-MM-dd',
  'storage.location.template' = 's3://datalake-clean/orders/dt=${dt}/'
);
```

- Athena 는 Glue 테이블의 파티션을 1,000만 개까지 다루지만 **한 번의 스캔에서 읽을 수 있는 파티션은 100만 개**까지다. 파티션 조건이 없는 쿼리가 초대형 테이블에서 실패하는 이유다.

### ② 포맷과 압축

- **Parquet/ORC**: 필요한 컬럼만 읽고, 파일 안 통계로 구간을 건너뛴다. 파일이 너무 작으면 포맷 오버헤드가 이점을 덮으므로 128MB 이상으로 맞춘다.
- **압축**: 스캔량은 압축된 크기로 잡히므로 압축이 곧 할인이다. gzip 은 압축률이 좋고 호환성이 넓으며, zstd 는 속도와 압축률의 균형이 좋다.
- 텍스트(CSV·JSON)를 압축하면 대부분의 코덱에서 파일을 처음부터 읽어야 해 **파일 하나를 병렬로 나눠 읽지 못한다.** 이때는 파일 수가 병렬도의 상한이다. Parquet/ORC 는 내부 단위로 나뉘어 있어 압축해도 병렬로 읽힌다.

### ③ 쿼리 작성

```sql
-- 필요한 컬럼만 SELECT → 컬럼형 포맷에서 스캔량 절감
SELECT order_id, amount FROM orders WHERE dt = '2026-06-26';
-- SELECT * 는 모든 컬럼을 스캔하므로 피한다
```

- `LIMIT` 은 스캔량을 보장해 주지 않는다. 정렬이나 집계가 끼면 전체를 읽은 뒤에 자른다.
- 파티션 키에는 **등호 조건**이 가장 잘 듣는다. 모든 파티션 키에 등호가 걸리면 메타데이터를 직접 집어 온다.
- 실행 전 `EXPLAIN` 으로 어떤 파티션이 대상인지, 실행 후 `EXPLAIN ANALYZE` 나 쿼리 통계의 "스캔한 데이터"로 실제 읽은 양을 확인한다.

> 💡 **관련 이론**: CSV 를 Parquet + 압축으로 바꾸면 "컬럼 프로젝션(필요한 컬럼만)", "압축(같은 타입 값이 모여 잘 줄어듦)", "통계 기반 건너뛰기"가 한꺼번에 적용된다. 그래서 포맷 변환은 Athena 비용 문제에서 가장 먼저 꺼내는 카드다. 파티션은 그다음, 쿼리 수정은 그 위에 얹는다.

## CTAS 와 INSERT INTO

**CTAS(CREATE TABLE AS SELECT)** 는 쿼리 결과를 새 S3 위치에 쓰고 테이블로 등록한다.

```sql
-- CSV 원본을 파티셔닝된 Parquet 로 변환
CREATE TABLE orders_parquet
WITH (
  format = 'PARQUET',
  write_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt'],
  external_location = 's3://datalake-clean/orders_parquet/'
) AS
SELECT order_id, amount, status, dt   -- 파티션 컬럼은 SELECT 목록의 맨 끝
FROM orders_raw_csv
WHERE dt BETWEEN '2026-06-01' AND '2026-06-30';
```

| 항목 | 내용 |
|------|------|
| 결과 포맷 | PARQUET(기본), ORC, AVRO, JSON, TEXTFILE |
| Parquet 기본 압축 | GZIP. Snappy·ZSTD 를 원하면 `write_compression` 으로 지정 |
| 파티션 컬럼 위치 | SELECT 목록의 **마지막**에 둔다 |
| `external_location` | **비어 있는** 위치여야 한다. Athena 는 기존 데이터를 덮어쓰지 않는다 |
| 파티션 한도 | 한 번에 쓰는 파티션 100개 |
| 버킷팅 | `bucketed_by`, `bucket_count` 로 지정 |
| `ORDER BY` | CTAS 의 SELECT 에 쓴 ORDER BY 는 무시된다 |

- 파티션이 100개를 넘는 변환은 CTAS 로 첫 구간을 만들고 `INSERT INTO ... SELECT` 로 나머지를 구간별로 이어 붙인다.
- CTAS·INSERT INTO 가 실패하거나 취소되면 대상 위치에 **쓰다 만 파일이 남을 수 있다.** 다음 쿼리가 그 파일까지 읽으므로 정리해야 한다. 원자적 쓰기가 필요하면 Iceberg 테이블을 쓴다.
- CTAS 는 "변환 로직이 SQL 로 충분하고 일회성·주기적 배치"일 때 Glue 잡을 대신한다. 복잡한 변환, 대용량의 지속적 파이프라인, 세밀한 재시도가 필요하면 Glue·EMR 이다.

| 방법 | 맞는 경우 |
|------|------|
| Athena CTAS / INSERT INTO | SQL 로 끝나는 포맷 변환·집계 결과 저장, 서버리스로 간단히 |
| Athena 뷰 | 데이터를 쓰지 않고 쿼리만 재사용 |
| Glue ETL | 복잡한 변환, 스키마 처리, 북마크 기반 증분 |
| Iceberg 테이블 + `MERGE INTO` | 행 단위 수정·삭제, 원자적 커밋 |

## 페더레이션 쿼리 (Federated Query)

**데이터 소스 커넥터**를 통해 S3 밖의 소스(RDS·Aurora, DynamoDB, Redshift, CloudWatch Logs, OpenSearch, 그 밖의 JDBC 소스 등)를 같은 SQL 로 조회·조인한다.

```sql
-- S3 의 주문 데이터와 RDS 의 고객 마스터를 조인
SELECT o.order_id, c.customer_name, o.amount
FROM awsdatacatalog.sales.orders o
JOIN rds_postgres.public.customers c
  ON o.customer_id = c.customer_id
WHERE o.dt = '2026-06-26';
```

- Athena 가 커넥터를 호출해 읽을 범위를 정하고, 병렬성을 관리하고, 필터 조건을 소스로 내려보낸다(조건 푸시다운).
- 커넥터는 전통적으로 사용자 계정의 **Lambda 함수**로 배포된다. 그래서 Lambda 호출 요금이 따로 들고 Lambda 의 한도 안에서 돈다. 최근에는 일부 소스에 대해 Lambda 없이 Glue 연결로 동작하는 커넥터도 제공되지만, 시험 자료는 Lambda 기반으로 설명한다.
- **읽기 전용**이다. 페더레이션 소스에 `INSERT INTO` 는 지원되지 않는다. 다만 페더레이션으로 읽어 S3 에 CTAS 로 쓰는 것은 된다(소스 → 레이크 추출 파이프라인).
- 조인 대상 소스에 실제 쿼리가 나가므로 **운영 DB 에 부하**가 간다. 대량 조인을 반복하면 읽기 복제본을 가리키게 하거나 데이터를 레이크로 옮기는 편이 낫다.

| 판단 | 페더레이션 쿼리 | 데이터를 레이크로 이동(ETL·제로 ETL) |
|------|------|------|
| 빈도 | 가끔, 탐색적 | 반복, 정기 리포트 |
| 데이터 신선도 | 항상 최신(소스를 직접 읽음) | 적재 주기만큼 지연 |
| 성능 | 소스의 속도와 커넥터에 묶임 | 컬럼형·파티션의 이점 |
| 소스 부하 | 쿼리마다 발생 | 적재 때만 |

## 워크그룹과 비용 통제

**워크그룹**은 쿼리 실행을 팀·용도별로 나누는 단위다. 결과 위치, 암호화, 엔진 버전, 비용 통제가 워크그룹에 붙는다.

| 통제 수단 | 대상 | 한도를 넘으면 |
|------|------|------|
| 쿼리당 데이터 사용 한도 | 쿼리 하나의 스캔량(최소 10MB 부터 설정) | 그 쿼리를 **취소**한다. 취소 전까지 스캔한 양은 과금된다 |
| 워크그룹 전체 데이터 사용 알림 | 일정 기간 워크그룹의 합계 스캔량 | CloudWatch 경보 → SNS **알림**. 쿼리를 자동으로 막지는 않는다 |

- 쿼리당 한도는 워크그룹에 **하나**만 걸 수 있고, 워크그룹 전체 알림은 여러 임계값으로 걸 수 있다.
- 워크그룹 전체 한도에서 실제로 차단까지 하려면 SNS 알림에 Lambda 를 물려 워크그룹을 **비활성화**하는 식으로 직접 구성한다.
- 워크그룹 설정으로 **클라이언트 설정을 덮어쓰게** 하면 사용자가 결과 위치나 암호화를 바꾸지 못한다. 결과 암호화를 강제하는 방법이다.
- 워크그룹 단위로 IAM 권한을 나누고, CloudWatch 지표와 비용 할당 태그로 팀별 사용량을 본다.

```bash
# 쿼리당 스캔 한도를 10GB 로 설정한 워크그룹 생성
aws athena create-work-group \
  --name analysts \
  --configuration '{
    "ResultConfiguration": {"OutputLocation": "s3://acme-athena-results/analysts/"},
    "EnforceWorkGroupConfiguration": true,
    "PublishCloudWatchMetricsEnabled": true,
    "BytesScannedCutoffPerQuery": 10737418240
  }'
```

### 쿼리 결과 재사용

같은 쿼리가 반복되면 **이전 결과를 다시 쓰게** 할 수 있다. 재사용되면 스캔이 일어나지 않는다.

- 같은 워크그룹 안에서, 쿼리 문자열이 일치하고, 이전 결과가 만료되지 않았을 때 적용된다.
- 최대 수명을 지정하지 않으면 60분, 지정할 수 있는 최대는 7일이다.
- 원천 데이터가 바뀌었는지는 확인하지 않는다. 수명 안에서는 **오래된 결과가 나올 수 있다.**
- Lake Formation 에 등록된 위치의 테이블, 행·컬럼 권한이 걸린 테이블에는 적용되지 않는다.

## 증상 → 원인 → 조치

| 증상 | 원인 | 조치 |
|------|------|------|
| 작은 결과인데 스캔량이 테이블 전체 | 파티션 키 조건 없음, 행 기반 포맷 | 파티션 키로 필터, Parquet 변환 |
| `LIMIT 10` 인데 비싸다 | 정렬·집계 때문에 전체 스캔 | 파티션 조건 추가 |
| 새 데이터가 조회되지 않는다 | 파티션 미등록 | `ALTER TABLE ADD PARTITION`, 프로젝션 |
| `MSCK REPAIR TABLE` 이 끝나지 않는다 | 파티션 과다 | `ADD PARTITION` 또는 프로젝션으로 전환 |
| CTAS 가 파티션 수 오류로 실패 | 한 번에 100개 초과 | 구간을 나눠 CTAS + INSERT INTO |
| CTAS 가 "위치에 데이터가 있다"로 실패 | `external_location` 이 비어 있지 않음 | 새 프리픽스 지정 또는 기존 파일 삭제 |
| 쿼리가 계속 취소된다 | 워크그룹의 쿼리당 한도 초과 | 쿼리 최적화 또는 한도 조정 |
| 결과 버킷 요금이 불어난다 | 결과 파일 누적, 실패한 쿼리의 멀티파트 조각 | 수명주기 만료·불완전 멀티파트 정리 규칙 |
| 페더레이션 쿼리가 느리고 운영 DB 가 느려진다 | 소스에 직접 대량 조회 | 읽기 복제본, 레이크로 적재 |
| `SlowDown` 오류 | 작은 파일 과다, 동시 쿼리 | 파일 병합 |

## Athena 를 고를 때와 고르지 않을 때

| 요구 | 맞는 서비스 |
|------|------|
| S3 데이터를 인프라 없이 가끔 SQL 로 | Athena |
| 초 단위 응답의 반복 대시보드, 복잡한 다중 조인이 상시 | Redshift |
| 이미 Redshift 가 있고 S3 이력을 웨어하우스 테이블과 조인 | Redshift Spectrum |
| 수 시간짜리 대규모 변환, 커스텀 코드 | Glue ETL / EMR |
| Spark 코드로 대화형 분석을 서버리스로 | Athena for Apache Spark |
| 키 하나로 밀리초 조회 | DynamoDB(Athena 가 아니다) |

## 지문 단서 → 정답 판별표

| 지문 단서 | 정답 |
|------|------|
| "Athena 쿼리 비용을 줄여라" | Parquet/ORC 변환 + 압축 + 파티셔닝 + 필요한 컬럼만 |
| "CSV 를 파티셔닝된 Parquet 로, 인프라 없이" | CTAS |
| "파티션이 수만 개, 등록 작업을 없애라" | 파티션 프로젝션 |
| "S3 데이터와 RDS·DynamoDB 를 데이터 이동 없이 조인" | 페더레이션 쿼리 |
| "한 쿼리가 과도하게 스캔하지 못하게" | 워크그룹의 쿼리당 데이터 사용 한도 |
| "팀별로 쿼리·비용·결과 위치를 분리" | 워크그룹 |
| "월 스캔량이 임계를 넘으면 알려 달라" | 워크그룹 전체 데이터 사용 알림(CloudWatch + SNS) |
| "같은 대시보드 쿼리가 반복 실행된다" | 쿼리 결과 재사용 |
| "모든 쿼리 결과를 반드시 암호화" | 워크그룹 설정 강제(클라이언트 설정 덮어쓰기) |
| "Athena 에서 행 단위 UPDATE·DELETE" | Iceberg 테이블 |

내일은 분석 엔진이 아닌 운영 스토어 DynamoDB 를, 데이터 엔지니어가 알아야 할 키 설계와 변경 캡처 관점에서 다룬다.

## 📖 용어

- **서버리스** : 서버를 미리 띄우거나 관리하지 않고 요청한 만큼만 자원이 쓰이는 방식.
- **스캔량** : 쿼리가 S3 에서 실제로 읽은 바이트 수. Athena 의 과금 기준이다.
- **외부 테이블** : 데이터는 S3 에 두고 위치와 스키마만 카탈로그에 등록한 테이블.
- **컬럼 프로젝션** : 쿼리에 필요한 컬럼만 읽는 것. 컬럼형 포맷에서만 효과가 있다.
- **CTAS** : `CREATE TABLE AS SELECT`. 쿼리 결과를 새 위치에 쓰고 테이블로 등록한다.
- **페더레이션 쿼리** : 데이터 소스 커넥터를 통해 S3 밖의 소스를 Athena SQL 로 조회하는 기능.
- **조건 푸시다운** : WHERE 조건을 소스 쪽으로 내려보내 소스가 미리 걸러서 돌려주게 하는 최적화.
- **워크그룹** : 쿼리 실행을 나누는 단위. 결과 위치·암호화·스캔 한도·지표가 여기에 붙는다.
- **쿼리 결과 재사용** : 같은 쿼리의 이전 결과를 일정 시간 동안 다시 돌려주는 기능.
- **프로비저닝된 용량** : 스캔량 대신 예약한 처리 용량(DPU)의 사용 시간으로 과금하는 Athena 요금제.

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
