# Day 41 - 데이터 레이크 아키텍처 (S3 + Glue + Athena)

📅 날짜: Week 9 (Day 1)
🎯 주제: 데이터 레이크의 표준 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Data Lake의 3계층(Raw/Curated/Trusted)을 이해한다
- S3 + Glue Catalog + Athena의 표준 스택과 파일 포맷 영향을 안다
- 파티셔닝·압축·Parquet/ORC의 성능과 비용 효과를 이해한다
- Glue Crawler·Glue ETL·Glue DataBrew의 역할 분리

---

## 🧩 사전 지식 (CS 기초)

- **Data Lake vs Data Warehouse**: Lake는 원본 스키마·구조 자유, Warehouse는 정형·스키마 강제.
- **Schema-on-Read vs Schema-on-Write**: Lake는 읽을 때 스키마, Warehouse는 쓸 때.
- **Columnar 포맷**: Parquet/ORC는 열 기반. 선택 컬럼만 스캔 → 비용·속도 절감.
- **Predicate Pushdown**: 필터 조건을 스토리지 레이어로 내려 스캔 최소화.

---

## 📖 이론 내용

### 1. Data Lake 3계층

```
[Raw / Bronze]   원본 그대로 (JSON, CSV, log)
       │  Glue ETL: 정제·중복 제거
       ▼
[Curated / Silver]  Parquet, 파티셔닝, 정제
       │  집계·조인·비즈니스 로직
       ▼
[Trusted / Gold]   분석·BI·ML 피처 (Aggregated)
```

### 2. S3 Best Practice

- **객체 키 디자인**: 시간·도메인 파티션 (예: `s3://lake/orders/year=2026/month=05/day=22/`)
- **압축**: gzip·snappy·zstd
- **파일 크기**: 수십 MB~수 GB (작은 파일 폭증 회피, Athena·EMR 효율↓)
- **Lifecycle**: 90일 후 S3 IA, 180일 Glacier IR, 1년 후 Deep Archive

### 3. AWS Glue Data Catalog

- 표 메타데이터·스키마 중앙 저장소 (Hive Metastore 호환)
- Athena·EMR·Redshift Spectrum이 공통 카탈로그 활용
- Glue Crawler가 자동으로 스키마 추출·등록

### 4. Glue ETL

- Spark/Scala/Python(PySpark) 기반 매니지드 ETL
- Glue Job Bookmark — 증분 처리 (이전에 처리한 파일 추적)
- Glue Studio = 비주얼 ETL 캔버스
- Glue Streaming = Kinesis/Kafka 입력 ETL

### 5. Glue DataBrew

- 노코드 데이터 프로파일링·정제
- 250+ 변환 규칙 (날짜·문자열·결측치)
- 데이터 분석가용

### 6. Athena

- S3 직접 SQL (Presto/Trino 기반)
- 가격: 스캔한 데이터당 (압축·컬럼 포맷·파티셔닝으로 비용↓)
- Workgroup·Result Reuse(2023)·CTAS·View
- Athena for Apache Spark·Athena Federated Query

### 7. 파일 포맷 비교

| 포맷 | 압축 | 컬럼 | 비고 |
|------|------|------|------|
| CSV/JSON | 약함 | ❌ | 시작점·단순 |
| Parquet | 강함 | ✅ | **권장** |
| ORC | 강함 | ✅ | Hive 친화 |
| Avro | 약함 | ❌ | 스트리밍 |

### 8. 파티셔닝 효과

- `year/month/day` 파티션 + WHERE 조건 → Athena 스캔량 1/100 이상 감소
- 너무 세분화하면 Small File Problem
- **Partition Projection**: Athena가 카탈로그 조회 없이 파티션 추론 (대용량 카탈로그 시 우위)

---

## 🧠 알아두면 좋은 심화 이론

### Apache Iceberg·Hudi·Delta on Glue

- 트랜잭션·시간 여행·스키마 진화 가능 테이블 포맷
- Glue 4.0 + Athena Engine v3에서 네이티브 지원
- DML(UPDATE·DELETE·MERGE) on Data Lake

### Athena CTAS·INSERT INTO

- 새 테이블 생성 + 데이터 작성 (다른 포맷·압축·파티션 적용)
- ETL 일부 대체 가능

### S3 Select·Object Lambda

- S3 Select: 객체 부분 조회 (JSON/CSV/Parquet 일부 — Athena 더 일반적)
- Object Lambda: GET 응답을 Lambda로 변환 (마스킹·포맷 변환)

---

## 🏗️ 다이어그램 — Data Lake 표준

```
[Kinesis Firehose] → s3://lake/raw/
        │  Glue Streaming ETL (Parquet, 파티션)
        ▼
[Glue Job (PySpark)] → s3://lake/curated/
        │  Crawler → Glue Catalog
        ▼
[Athena SQL] + [Redshift Spectrum] + [EMR Spark] + [SageMaker]
```

---

## ⭐ 핵심 포인트

1. ⭐ 3계층(Raw/Curated/Trusted)으로 신뢰 단계 분리
2. ⭐ **Parquet + 파티션 + 압축 = Athena 비용 90%↓**
3. ⭐ Glue Catalog는 Hive Metastore 호환 중앙 메타
4. ⭐ Crawler(스키마) / ETL(변환) / DataBrew(노코드) 역할 분리
5. ⭐ Partition Projection으로 메타조회 부담↓
6. ⭐ Iceberg/Hudi/Delta로 트랜잭션·시간여행
7. ⭐ Athena Workgroup·Result Reuse로 비용 절감

---

## 💻 실제 예시 - Athena CTAS

```sql
CREATE TABLE curated.orders_parquet
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['year','month'],
  external_location = 's3://lake/curated/orders/'
) AS
SELECT * FROM raw.orders_json;
```

### Partition Projection

```sql
CREATE EXTERNAL TABLE logs (...)
PARTITIONED BY (year int, month int, day int)
LOCATION 's3://lake/logs/'
TBLPROPERTIES (
  'projection.enabled'='true',
  'projection.year.type'='integer',
  'projection.year.range'='2020,2030',
  'projection.month.type'='integer','projection.month.range'='1,12',
  'projection.day.type'='integer','projection.day.range'='1,31',
  'storage.location.template'='s3://lake/logs/${year}/${month}/${day}/'
);
```

---

## 📝 연습 문제

**문제 1.** Athena 스캔 비용을 가장 크게 줄이는 방법?

A) WHERE 조건만
B) CSV → Parquet + 파티션 + 압축
C) 워크그룹 1개
D) Result Reuse만

**정답: B**

---

**문제 2.** Athena·EMR·Redshift Spectrum이 공통으로 사용할 메타 카탈로그는?

A) Glue Data Catalog
B) Lake Formation 별도
C) DynamoDB
D) RDS

**정답: A**

---

**문제 3.** S3 JSON 로그 스키마 자동 추출 + Catalog 등록.

A) Glue ETL
B) Glue Crawler
C) DataBrew
D) Athena DDL 수동

**정답: B**

---

**문제 4.** ACID 트랜잭션·DELETE·시간여행이 필요한 Data Lake.

A) Parquet만
B) Iceberg/Hudi/Delta
C) Avro
D) CSV

**정답: B**

---

**문제 5.** 대용량 파티션(수만)에서 카탈로그 조회 부담을 줄이려면?

A) 파티션 줄이기
B) Partition Projection
C) 압축 변경
D) Glue Job Bookmark

**정답: B**

---

**문제 6.** Glue Job 재실행 시 이미 처리한 파일을 건너뛰려면?

A) Job Bookmark
B) Crawler Re-run
C) DataBrew
D) Glue Streaming

**정답: A**

---

## 📌 오늘의 요약

1. Raw/Curated/Trusted 3계층
2. Parquet + 파티션 + 압축 = 비용·속도 핵심
3. Glue Catalog = 공통 메타, Crawler·ETL·DataBrew 역할 분리
4. Iceberg/Hudi/Delta = 트랜잭션 Lake
5. Partition Projection·Job Bookmark
