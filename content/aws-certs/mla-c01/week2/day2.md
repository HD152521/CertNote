# Day 2 - 데이터 카탈로그·ETL: AWS Glue와 DataBrew

어제 데이터를 S3 데이터 레이크에 수집했다. 하지만 S3에 객체를 던져 넣는 것만으로는 분석도 학습도 할 수 없다. **"이 버킷에 무슨 데이터가, 어떤 스키마로 들어 있는가?"**를 알아야 Athena로 쿼리하고 SageMaker로 학습할 수 있다. 이 메타데이터를 관리하는 것이 **데이터 카탈로그**이고, 데이터를 정제·변환하는 것이 **ETL**이다.

오늘의 주인공은 **AWS Glue** — 서버리스 데이터 통합 서비스다. 크롤러, 데이터 카탈로그, ETL Job, 그리고 노코드 도구 DataBrew까지 본다.

## Glue Data Catalog: 데이터 레이크의 메타데이터 저장소

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

이 카탈로그는 **Athena, Redshift Spectrum, EMR, SageMaker, Glue ETL이 공통으로 참조**한다. 즉 한 번 등록하면 모든 분석/ML 도구가 같은 스키마를 본다. 데이터 레이크의 "테이블 정의 단일 진실 공급원"이다.

> 💡 **관련 이론**: Glue Data Catalog는 Apache Hive의 **Metastore**를 계승한 개념이다. Hive는 2009년 Facebook이 HDFS 위에서 SQL을 쓰기 위해 만든 시스템인데, 핵심 발상이 "데이터(HDFS 파일)와 스키마(Metastore)를 분리"하는 것이었다. 이 분리가 곧 **schema-on-read**다. 데이터를 쓸 때 스키마를 강제하는 전통 DB(schema-on-write)와 달리, 데이터 레이크는 일단 원본을 저장하고 읽을 때 스키마를 적용한다. 덕분에 다양한 포맷·소스의 데이터를 유연하게 수용할 수 있다.

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

> 🔍 **더 깊이**: 크롤러는 같은 폴더에 스키마가 다른 파일들이 섞여 있으면 **여러 테이블로 쪼개거나(혹은 하나로 합치거나)** 한다. 이 동작은 크롤러 설정의 "schema change policy"와 "grouping behavior"로 제어한다. 시험 함정: 크롤러를 다시 돌렸을 때 새 컬럼이 추가되면 기본적으로 스키마를 업데이트하지만, 컬럼 삭제는 정책에 따라 무시할 수도 있다. 또한 크롤러가 파티션을 매번 풀스캔하지 않게 "crawl new folders only" 옵션을 쓰면 비용이 준다.

> ⚠️ **함정**: 새 파티션이 추가됐을 때 크롤러를 다시 돌리는 대신, Athena의 `MSCK REPAIR TABLE` 또는 `ALTER TABLE ADD PARTITION`으로도 파티션을 등록할 수 있다. 또 파티션 경로가 Hive 스타일(`year=2026/`)이면 **partition projection**을 설정해 크롤러 없이도 파티션을 인식시킬 수 있다(Day 4).

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

Glue Job의 과금 단위는 **DPU(Data Processing Unit)** — 4 vCPU + 16GB 메모리 — 이고, 실행 시간(초 단위)에 비례한다. 서버리스라 클러스터 프로비저닝이 없다.

> 🔍 **더 깊이**: Glue ETL에는 세 가지 실행 타입이 있다. (1) **Spark**: 대규모 분산 변환. (2) **Python Shell**: 작은 데이터에 대한 단순 스크립트(Spark 오버헤드 회피). (3) **Glue Streaming**: Kinesis/Kafka 스트림을 마이크로배치로 처리. 작은 데이터에 Spark Job을 쓰면 클러스터 시작 오버헤드 때문에 느리고 비싸다. 시험에서 "수 MB의 작은 변환"이면 Python Shell이 더 적합하다.

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

> 🔍 **더 깊이**: DataBrew의 진짜 가치는 ML 전처리에서의 **데이터 프로파일링**이다. 모델을 만들기 전 "이 컬럼의 결측률이 40%다", "이 피처는 타깃과 상관이 0이다" 같은 사실을 코드 없이 빠르게 발견할 수 있다. 이는 Day 3에서 다룰 EDA(탐색적 데이터 분석)와 직결된다. 시험에서 "노코드", "비기술 사용자", "시각적 데이터 준비/프로파일링" 키워드가 보이면 DataBrew가 답이다.

## 전체 그림: 수집 → 카탈로그 → 변환

```
S3 Raw 존 (JSON/CSV)
   │
   ├─ Glue Crawler ──→ Glue Data Catalog (스키마 등록)
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

## 정리하며

Glue는 ML 데이터 준비의 핵심 허브다. **Crawler**가 스키마를 추론해 **Data Catalog**에 등록하면, **ETL Job**(코드) 또는 **DataBrew**(노코드)가 데이터를 정제·변환한다. 모든 도구가 같은 카탈로그를 공유하므로 일관된 스키마로 분석·학습할 수 있다.

다음 글에서는 이렇게 준비된 데이터를 **Athena와 Redshift**로 쿼리하고, EDA(탐색적 데이터 분석)의 기초를 본다.

---

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
