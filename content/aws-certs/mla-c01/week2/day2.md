# Day 2 - 데이터 카탈로그·ETL: AWS Glue와 DataBrew

## 📌 핵심 정리

- **Glue Data Catalog**는 Hive Metastore 호환 메타데이터 저장소. Athena·Redshift Spectrum·EMR·SageMaker가 공유한다.
- **Crawler**가 S3를 스캔해 스키마·파티션을 자동 추론하고 카탈로그에 테이블을 만든다.
- **Glue ETL Job**은 서버리스 Spark 변환. 과금 단위는 **DPU × 실행 시간**. 작은 데이터엔 Python Shell이 유리하다.
- **DataBrew**는 노코드 GUI 데이터 준비 도구. "비기술 사용자", "시각적 프로파일링" 키워드면 정답.
- 표준 흐름은 **Raw(JSON/CSV) → Crawler·Catalog → ETL/DataBrew → Curated(Parquet, 파티셔닝)**.

## Glue Data Catalog: 데이터 레이크의 메타데이터 저장소

S3에 객체를 던져 넣는 것만으로는 분석도 학습도 할 수 없다. "이 버킷에 무슨 데이터가, 어떤 스키마로 들어 있는가"를 알아야 Athena로 쿼리하고 SageMaker로 학습할 수 있다.

Glue Data Catalog는 **Hive Metastore 호환 메타데이터 저장소**다. 데이터 자체가 아니라 데이터에 대한 정보 — 테이블 이름, 컬럼, 타입, S3 위치, 파티션 — 를 저장한다.

```
Glue Data Catalog 구조:
Database (논리적 그룹)
└─ Table (S3 위치 + 스키마 + 파티션)
   ├─ Columns: customer_id (string), amount (double), ts (timestamp)
   ├─ Location: s3://ml-datalake/curated/transactions/
   ├─ SerDe: parquet
   └─ Partitions: year=2026/month=06, year=2026/month=05, ...
```

이 카탈로그는 **Athena, Redshift Spectrum, EMR, SageMaker, Glue ETL이 공통으로 참조**한다. 한 번 등록하면 모든 분석/ML 도구가 같은 스키마를 본다.

| 저장하는 것 | 저장하지 않는 것 |
|-----------|----------------|
| 테이블·컬럼 이름과 타입 | 실제 데이터 행 |
| S3 위치(Location) | 데이터의 복사본 |
| 파일 포맷·SerDe | 변환 로직 |
| 파티션 목록 | 쿼리 결과 |

> 💡 **관련 이론**: Glue Data Catalog는 Apache Hive의 **Metastore**를 계승한 개념이다. Hive는 2009년 Facebook이 HDFS 위에서 SQL을 쓰기 위해 만든 시스템인데, 핵심 발상이 "데이터(HDFS 파일)와 스키마(Metastore)를 분리"하는 것이었다. 이 분리가 곧 **schema-on-read**다. 데이터를 쓸 때 스키마를 강제하는 전통 DB(schema-on-write)와 달리, 데이터 레이크는 일단 원본을 저장하고 읽을 때 스키마를 적용한다. 덕분에 다양한 포맷·소스의 데이터를 유연하게 수용할 수 있다.

| 구분 | schema-on-write (전통 DB) | schema-on-read (데이터 레이크) |
|------|--------------------------|------------------------------|
| 스키마 강제 시점 | 데이터를 넣을 때 | 데이터를 읽을 때 |
| 유연성 | 낮음(사전 정의 필요) | 높음(원본 그대로 수용) |
| 품질 보장 | 입구에서 보장 | 읽는 쪽이 책임 |
| ML 적합성 | 정형만 | 정형·반정형·비정형 모두 |

## Glue Crawler: 스키마 자동 추론

S3에 수천 개의 파일이 있을 때 일일이 테이블을 정의하는 건 비현실적이다. **Glue Crawler**가 S3(또는 JDBC 소스)를 스캔해 스키마를 자동 추론하고 카탈로그에 테이블을 만든다.

크롤러의 동작:

1. 지정한 S3 경로를 스캔
2. 파일 포맷 감지(Parquet/CSV/JSON 등)
3. 컬럼과 타입 추론(classifier 사용)
4. `키=값` 디렉터리를 파티션으로 인식
5. Data Catalog에 테이블 생성/업데이트

```python
import boto3

glue = boto3.client("glue")

glue.create_crawler(
    Name="transactions-crawler",
    Role="arn:aws:iam::123456789012:role/GlueCrawlerRole",
    DatabaseName="ml_datalake",
    Targets={"S3Targets": [{"Path": "s3://ml-datalake/curated/transactions/"}]},
    Schedule="cron(0 2 * * ? *)",  # 매일 02:00 UTC
)
glue.start_crawler(Name="transactions-crawler")
```

> 🔍 **더 깊이**: 크롤러는 같은 폴더에 스키마가 다른 파일들이 섞여 있으면 **여러 테이블로 쪼개거나 하나로 합치거나** 한다. 이 동작은 크롤러 설정의 "schema change policy"와 "grouping behavior"로 제어한다. 시험 함정: 크롤러를 다시 돌렸을 때 새 컬럼이 추가되면 기본적으로 스키마를 업데이트하지만, 컬럼 삭제는 정책에 따라 무시할 수도 있다. 또한 크롤러가 파티션을 매번 풀스캔하지 않게 "crawl new folders only" 옵션을 쓰면 비용이 준다.

**새 파티션을 인식시키는 방법은 크롤러만 있는 게 아니다.**

| 방법 | 어떻게 | 언제 유리 |
|------|-------|----------|
| Glue Crawler 재실행 | 경로 스캔 후 자동 등록 | 스키마도 함께 바뀔 때 |
| `MSCK REPAIR TABLE` | Athena가 Hive 경로를 훑어 파티션 등록 | 파티션만 늘어났을 때 |
| `ALTER TABLE ADD PARTITION` | 특정 파티션을 명시적으로 추가 | 소수의 파티션만 추가 |
| Partition projection | 경로 규칙을 미리 정의해 스캔 없이 계산 | 파티션이 매우 많고 규칙적일 때 |

> ⚠️ **함정**: "파티션을 추가했는데 Athena가 못 찾는다"는 시나리오에서 무조건 크롤러 재실행을 고르면 비용·시간 면에서 최선이 아닐 수 있다. 스키마 변화 없이 파티션만 늘었다면 `MSCK REPAIR TABLE`이나 partition projection이 더 가볍다.

## Glue ETL Job: 서버리스 데이터 변환

카탈로그가 "무엇이 어디 있는지"라면, **Glue ETL Job**은 "데이터를 어떻게 변환하는지"다. Apache Spark(또는 Python Shell, Ray) 기반으로 서버리스 실행된다.

핵심 추상화는 **DynamicFrame**이다. Spark DataFrame과 비슷하지만, 스키마가 일정하지 않은 반정형 데이터를 다루는 데 강하다(`ResolveChoice`로 타입 충돌 해결 등).

```python
import sys
from awsglue.context import GlueContext
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())

# 카탈로그에서 읽기
dyf = glueContext.create_dynamic_frame.from_catalog(
    database="ml_datalake", table_name="raw_transactions"
)

# 결측치 제거 + 컬럼 선택 (정제)
cleaned = dyf.drop_nulls().select_fields(["customer_id", "amount", "ts"])

# Parquet으로 Curated 존에 쓰기 (파티셔닝)
glueContext.write_dynamic_frame.from_options(
    frame=cleaned,
    connection_type="s3",
    connection_options={
        "path": "s3://ml-datalake/curated/transactions/",
        "partitionKeys": ["year", "month"],
    },
    format="parquet",
)
```

Glue Job의 과금 단위는 **DPU(Data Processing Unit)** — 4 vCPU + 16GB 메모리 — 이고, 실행 시간에 비례한다. 서버리스라 클러스터 프로비저닝이 없다.

**Glue ETL의 세 가지 실행 타입** — 데이터 크기가 선택을 가른다.

| 타입 | 엔진 | 적합한 데이터 | 주의 |
|------|------|-------------|------|
| Spark | 분산 Spark | 수 GB~TB급 대규모 변환 | 클러스터 시작 오버헤드 |
| Python Shell | 단일 Python 프로세스 | 수 MB~수백 MB 단순 스크립트 | 분산 처리 불가 |
| Glue Streaming | Spark Structured Streaming | Kinesis/Kafka 마이크로배치 | 상시 실행 비용 |

작은 데이터에 Spark Job을 쓰면 클러스터 시작 오버헤드 때문에 느리고 비싸다. 시험에서 "수 MB의 작은 변환"이면 Python Shell이 더 적합하다.

> 💡 **관련 이론**: ETL(Extract-Transform-Load)과 ELT(Extract-Load-Transform)의 차이를 알아두자. 전통 ETL은 변환을 먼저 하고 데이터웨어하우스에 적재한다. 클라우드 데이터 레이크에서는 일단 Raw로 적재(Load)한 뒤 변환(Transform)하는 ELT가 흔하다. S3가 싸고, 컴퓨트를 분리할 수 있기 때문이다. Glue는 둘 다 지원하지만, 데이터 레이크 맥락에서는 ELT 패턴이 자주 쓰인다.

## Glue DataBrew: 노코드 데이터 준비

데이터 사이언티스트가 Spark 코드를 쓰지 않고 **시각적으로** 데이터를 정제·변환하고 싶을 때 **Glue DataBrew**를 쓴다.

- **250개 이상의 사전 정의 변환**: 결측치 처리, 이상치 제거, 원-핫 인코딩, 정규화, 날짜 파싱 등.
- **데이터 프로파일링**: 컬럼별 분포, 결측 비율, 상관관계, 이상치를 자동 리포트.
- **레시피(recipe)**: 적용한 변환 단계를 저장해 재사용·스케줄링.
- 코드 없이 GUI로 작업하고, 결과를 S3에 출력.

| 구분 | Glue ETL Job | Glue DataBrew |
|------|------|------|
| 인터페이스 | 코드(PySpark/Scala) | 노코드 GUI |
| 사용자 | 데이터 엔지니어 | 데이터 분석가/사이언티스트 |
| 규모 | 대규모 분산 | 중소 규모 + 프로파일링 |
| 강점 | 복잡한 커스텀 로직 | 빠른 탐색·정제, 시각화 |
| 재사용 단위 | 스크립트 | 레시피(recipe) |
| 정답 키워드 | "대규모 변환", "커스텀 로직" | "노코드", "비기술 사용자", "프로파일링" |

> 🔍 **더 깊이**: DataBrew의 진짜 가치는 ML 전처리에서의 **데이터 프로파일링**이다. 모델을 만들기 전 "이 컬럼의 결측률이 40%다", "이 피처는 타깃과 상관이 0이다" 같은 사실을 코드 없이 빠르게 발견할 수 있다. 이는 Day 3에서 다룰 EDA(탐색적 데이터 분석)와 직결된다.

## 전체 그림: 수집 → 카탈로그 → 변환

```
S3 Raw 존 (JSON/CSV)
   │
   ├─ Glue Crawler ──→ Glue Data Catalog (스키마 등록)
   │                        │
   │                        └──> Athena / Redshift Spectrum / EMR / SageMaker 공유
   │
   ├─ Glue ETL Job ──→ 정제·변환 (DynamicFrame, Spark)
   │                     또는
   ├─ Glue DataBrew ──→ 노코드 정제·프로파일링
   │
   ▼
S3 Curated 존 (Parquet, 파티셔닝)
   │
   ▼
Athena / Redshift / SageMaker (Day 3, 학습)
```

**도구 선택 요약**

| 요구사항 | 정답 |
|---------|------|
| 수천 파일의 스키마를 자동 등록 | Glue Crawler |
| 여러 엔진이 같은 테이블 정의를 공유 | Glue Data Catalog |
| 대규모 분산 변환, 커스텀 로직 | Glue ETL Spark Job |
| 수 MB 단순 변환, 오버헤드 회피 | Glue Python Shell Job |
| 코드 없이 시각적 정제·프로파일링 | Glue DataBrew |
| 스트림을 마이크로배치로 변환 | Glue Streaming Job |

## Glue 비용·성능을 결정하는 것들

Glue는 서버리스지만 공짜가 아니다. DPU 수 × 실행 시간이 요금이므로, 잘못 설정하면 조용히 비싸진다.

| 조정 대상 | 올리면 | 내리면 | 판단 기준 |
|----------|-------|-------|----------|
| DPU 수(worker) | 병렬도↑, 실행 시간↓ | 비용↓, 실행 시간↑ | 데이터가 실제로 병렬화되는가 |
| Job 타입 | Spark는 대규모에 강함 | Python Shell은 시작이 빠름 | 데이터 크기(수 MB vs GB 이상) |
| 입력 파일 수 | 병렬 읽기 가능 | 파일이 너무 많으면 오버헤드 | 파일 하나가 지나치게 크거나 작지 않게 |
| 출력 파티셔닝 | 이후 쿼리 스캔량↓ | 파티션 과다 시 메타데이터↑ | 소비 측 쿼리 패턴 |
| 북마크(job bookmark) | 이미 처리한 데이터 재처리 방지 | 껐다면 매번 전체 재처리 | 증분 처리 여부 |

- 작은 데이터에 Spark Job을 쓰면 클러스터 기동 오버헤드가 실제 처리 시간보다 길어진다.
- 출력이 수만 개의 작은 파일로 쪼개지면 이후 Athena·학습 단계가 느려진다. 적정 크기로 합치는 것이 좋다.

## Crawler 운영에서 자주 겪는 일

| 상황 | 원인 | 대응 |
|------|------|------|
| 같은 폴더가 여러 테이블로 쪼개짐 | 파일마다 스키마가 다름 | 경로를 분리하거나 그룹핑 정책 조정 |
| 크롤러 비용이 계속 증가 | 매번 전체 파티션을 재스캔 | "새 폴더만 크롤" 옵션 사용 |
| 컬럼을 지웠는데 카탈로그에 남음 | 스키마 변경 정책이 삭제를 무시 | 정책을 명시적으로 설정 |
| 새 파티션을 Athena가 못 찾음 | 카탈로그에 파티션 미등록 | `MSCK REPAIR TABLE` 또는 partition projection |
| 타입이 의도와 다르게 추론됨 | classifier의 자동 추론 한계 | 커스텀 classifier 지정 또는 테이블 정의 수정 |

> ⚠️ **함정**: 크롤러는 "한 번 돌리면 끝"이 아니다. 데이터가 계속 들어오는 레이크에서는 스케줄로 주기 실행하거나, 파티션만 늘어나는 경우 더 가벼운 수단으로 갈아타는 판단이 필요하다.

## ETL 설계 체크리스트

| 물음 | 판단 |
|------|------|
| 데이터가 수 MB인가, GB 이상인가 | MB면 Python Shell, GB 이상이면 Spark |
| 스키마가 들쭉날쭉한가 | DynamicFrame의 ResolveChoice 활용 |
| 출력 포맷은? | 분석·학습용이면 Parquet + Snappy |
| 무엇으로 파티셔닝하나 | 소비 측이 가장 자주 필터하는 컬럼 |
| 매번 전체를 다시 처리하나 | job bookmark로 증분 처리 |
| 코드를 쓸 사람이 있나 | 없으면 DataBrew, 있으면 ETL Job |
| 원본은 보존되는가 | Raw 존은 절대 덮어쓰지 않는다 |

다음 글에서는 이렇게 준비된 데이터를 **Athena와 Redshift**로 쿼리하고, EDA(탐색적 데이터 분석)의 기초를 본다.

## 📖 용어

- **데이터 카탈로그** : 어떤 테이블이 어디에 어떤 스키마로 있는지 적어둔 메타데이터 장부. 데이터 자체는 없다.
- **Hive Metastore** : 데이터와 스키마를 분리해 관리하는 고전적 메타데이터 저장소. Glue Catalog의 원형.
- **schema-on-read** : 저장할 땐 원본 그대로 두고 읽는 시점에 스키마를 입히는 방식. 데이터 레이크의 기본.
- **Crawler** : 저장소를 훑어 파일 포맷·컬럼·파티션을 추론하고 카탈로그에 테이블을 만들어주는 도구.
- **SerDe** : 파일의 바이트를 행·컬럼으로 읽고 쓰는 방법을 정의한 직렬화/역직렬화 규칙.
- **DynamicFrame** : Glue가 제공하는 데이터 구조. 스키마가 들쭉날쭉한 반정형 데이터를 다루는 데 강하다.
- **DPU(Data Processing Unit)** : Glue의 과금·성능 단위. 4 vCPU + 16GB 메모리 한 묶음.
- **ETL vs ELT** : 변환 후 적재냐, 적재 후 변환이냐. 클라우드 데이터 레이크는 보통 ELT를 쓴다.
- **레시피(recipe)** : DataBrew에서 적용한 변환 단계를 저장해 재사용·스케줄링하는 단위.
- **파티션 프로젝션(partition projection)** : 경로 규칙을 미리 정의해 파티션을 스캔 없이 계산하게 하는 설정.

## 📝 연습 문제

**문제 1.** 데이터 엔지니어가 S3의 수천 개 Parquet 파일에 대해 스키마를 일일이 정의하지 않고 자동으로 Glue Data Catalog에 테이블을 등록하려 한다. 가장 적합한 도구는?

A) Glue ETL Job  
B) Glue Crawler  
C) Athena CREATE TABLE  
D) Glue DataBrew  

**정답: B**  
해설: Glue Crawler는 S3 경로를 스캔해 파일 포맷과 컬럼·타입을 자동 추론하고 파티션을 인식해 Data Catalog에 테이블을 만든다. 스키마 자동 등록의 정석이다. ETL Job(A)은 변환용이지 스키마 등록 도구가 아니다. Athena CREATE TABLE(C)은 수동 정의라 수천 파일에 비현실적이다. DataBrew(D)는 노코드 정제·프로파일링 도구다.

---

**문제 2.** 한 데이터 분석가가 코드를 작성하지 않고 시각적 인터페이스로 데이터의 결측치·이상치를 프로파일링하고 정제하려 한다. 가장 적합한 서비스는?

A) Glue ETL Job (PySpark)  
B) EMR Spark  
C) Glue DataBrew  
D) Kinesis Data Analytics  

**정답: C**  
해설: DataBrew는 250개 이상의 사전 정의 변환과 데이터 프로파일링을 노코드 GUI로 제공해 비기술 사용자가 빠르게 데이터를 정제·탐색할 수 있다. PySpark ETL Job(A)과 EMR Spark(B)는 모두 코드 작성이 필요하다. Kinesis Data Analytics(D)는 스트림 실시간 분석용이다.

---

**문제 3.** Glue Data Catalog의 핵심 역할로 가장 정확한 설명은?

A) S3의 데이터 객체 자체를 복제 저장한다  
B) 테이블 스키마·위치·파티션 등 메타데이터를 저장하고 Athena/Redshift/EMR/SageMaker가 공유한다  
C) ETL 변환 로직을 실행한다  
D) 실시간 스트림을 처리한다  

**정답: B**  
해설: Data Catalog는 Hive Metastore 호환 메타데이터 저장소로, 데이터 자체가 아니라 스키마·S3 위치·파티션 정보를 저장한다. 여러 분석/ML 서비스가 이를 공유해 일관된 스키마를 본다. 데이터 복제(A)나 변환 실행(C), 스트림 처리(D)는 카탈로그의 역할이 아니다.

---

**문제 4.** 수 MB 규모의 작은 데이터에 대해 간단한 변환을 수행하려 한다. Spark 클러스터 시작 오버헤드와 비용을 피하려면 어떤 Glue Job 타입이 적합한가?

A) Glue Spark Job  
B) Glue Python Shell Job  
C) Glue Streaming Job  
D) EMR on EC2  

**정답: B**  
해설: Glue Python Shell Job은 Spark 분산 처리 없이 단순 Python 스크립트를 실행해, 작은 데이터에 대한 변환에서 클러스터 시작 오버헤드와 비용을 피한다. Spark Job(A)은 대규모 분산 변환용이라 작은 데이터에는 과하다. Streaming Job(C)은 스트림 처리용이고, EMR on EC2(D)는 더 무거운 클러스터 운영을 요구한다.

---

**문제 5.** S3 Raw 존에 JSON으로 들어온 데이터를 ML 학습에 효율적인 형태로 만들려 한다. Glue ETL에서 권장되는 출력 방식은?

A) JSON 그대로 Curated 존에 복사  
B) CSV로 변환해 압축 없이 저장  
C) Parquet으로 변환하고 자주 필터링하는 키로 파티셔닝해 Curated 존에 저장  
D) 모든 데이터를 단일 파일로 합쳐 저장  

**정답: C**  
해설: ML 학습에는 열 기반·압축·predicate pushdown을 지원하는 Parquet이 효율적이며, 자주 쓰는 키로 파티셔닝하면 스캔량이 줄어든다. JSON 복사(A)는 비효율적이고, 압축 없는 CSV(B)도 행 기반이라 부적합하다. 단일 거대 파일(D)은 병렬 처리와 파티션 프루닝을 방해한다.

---
