# Day 5 - Week 2 종합 — 데이터 수집·저장 복습

이번 주는 ML 수명주기의 첫 단계, 데이터를 AWS 안으로 들이고(수집) 효율적으로 쌓는(저장) 과정을 다뤘다. MLA-C01 도메인 1(Data Preparation, 약 28%)의 핵심이며, 여기서 잘못 고르면 이후 학습 비용과 속도가 통째로 무너진다.

오늘은 S3·Kinesis·Glue·Athena를 하나의 데이터 파이프라인으로 엮어 복습한다. 각 서비스를 따로 외우기보다, "raw 데이터가 들어와 학습 가능한 데이터셋이 되기까지" 흐름 위에 얹는 것이 시험 대비에 효율적이다.

## 전체 데이터 파이프라인 한눈에

이번 주 서비스들은 하나의 흐름으로 이어진다.

```
[소스]
  │  ① 수집(ingestion)
  ├─ 스트리밍 ──> Kinesis Data Streams / Firehose ─┐
  └─ 배치 ──────> DMS / DataSync / 직접 업로드 ─────┤
                                                   v
                                          ┌──────────────────┐
                                          │   S3 데이터 레이크 │  ② 저장
                                          │  (단일 진실 공급원)│
                                          └──────────────────┘
                                                   │  ③ 카탈로그·변환
                                          Glue Crawler → Data Catalog
                                          Glue ETL Job (정제·포맷 변환)
                                                   │  ④ 쿼리·탐색
                                          Athena (서버리스 SQL, EDA)
                                                   │
                                                   v
                                          SageMaker 학습 (Parquet, Pipe mode)
```

핵심은 **S3가 중심**이라는 점이다. 모든 서비스가 S3를 입출력으로 삼고, 학습도 결국 S3에서 데이터를 읽는다.

> 💡 **관련 이론**: 이 구조가 "데이터 레이크"의 전형이다. 데이터웨어하우스가 정형 데이터를 미리 스키마에 맞춰 적재(schema-on-write)하는 반면, 데이터 레이크는 raw 데이터를 일단 S3에 그대로 쌓고 읽을 때 스키마를 적용한다(schema-on-read). ML은 정형·반정형·비정형 데이터를 모두 다루고 어떤 피처가 유용할지 미리 모르기 때문에, "일단 다 모아두고 나중에 해석하는" 데이터 레이크 모델이 잘 맞는다.

## 수집: 스트리밍 vs 배치

데이터가 들어오는 모양에 따라 도구가 갈린다. 시험 단골 판별이다.

| 구분 | 서비스 | 적합한 상황 |
|------|--------|------------|
| 실시간 스트리밍 | Kinesis Data Streams | 저지연·다수 컨슈머, 직접 처리 |
| 스트리밍→저장 | Kinesis Data Firehose | S3/Redshift로 자동 적재, 관리 불필요 |
| DB 마이그레이션 | DMS | 온프레미스/RDS → S3·Redshift 복제 |
| 대량 파일 전송 | DataSync | 온프레미스 파일 → S3 동기화 |

Kinesis 두 형제의 차이가 자주 나온다. **Data Streams**는 컨슈머를 직접 붙여 실시간 처리하고 샤드를 관리한다(유연·저지연). **Firehose**는 완전관리형으로 버퍼링 후 S3/Redshift에 자동 적재한다(코드 없이 적재만 원할 때).

```python
import boto3
kinesis = boto3.client("kinesis")

# Kinesis Data Streams에 실시간 이벤트 적재
kinesis.put_record(
    StreamName="clickstream",
    Data=b'{"user_id": "u123", "event": "click", "ts": "2026-06-25T10:00:00Z"}',
    PartitionKey="u123",     # 같은 키는 같은 샤드 → 순서 보장
)
```

> 🔍 **더 깊이**: "실시간이지만 코드 없이 S3에 그냥 쌓기만"이면 Firehose, "실시간 스트림을 여러 앱이 각자 처리하고 재생(replay)도 필요"하면 Data Streams다. PartitionKey는 같은 키의 레코드를 같은 샤드로 보내 순서를 보장한다 — 사용자별 이벤트 순서가 중요할 때 user_id를 키로 쓴다.

## 저장: 포맷·파티셔닝

수집한 데이터는 그대로 두지 않고 학습에 유리하게 가공한다. 어제 본 저장 전략의 요지를 다시 묶으면 이렇다.

- **포맷**: 분석·학습용은 **Parquet**(열 기반, 압축, 분할 가능). CSV/JSON은 행 기반이라 비효율.
- **압축**: 자주 읽으면 **Snappy**(빠름), 아카이브면 Gzip(고압축).
- **파티셔닝**: 자주 필터하는 컬럼(보통 날짜)으로 Hive 스타일(`year=/month=/`) 분할 → 파티션 프루닝.
- **샤딩**: 단일 거대 파일 대신 적당한 크기 여러 파일 → 분산 읽기.

이 네 가지가 Athena 쿼리 비용(스캔량 과금)과 SageMaker 학습 속도를 동시에 좌우한다.

## 카탈로그·변환: Glue

raw 데이터를 학습 가능한 형태로 만드는 ETL의 중심이 **AWS Glue**다.

| Glue 구성요소 | 역할 |
|--------------|------|
| Crawler | S3 데이터 스캔 → 스키마 추론 → Data Catalog에 테이블 등록 |
| Data Catalog | 중앙 메타데이터 저장소 (Athena·Redshift Spectrum·EMR 공유) |
| ETL Job | Spark 기반 정제·변환·포맷 변환 (CSV→Parquet 등) |
| DataBrew | 코드 없는 시각적 데이터 정제 |

```python
# Glue PySpark ETL: CSV를 정제해 파티셔닝된 Parquet으로 저장
from awsglue.context import GlueContext
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())
df = glueContext.create_dynamic_frame.from_catalog(
    database="ml_datalake", table_name="raw_events"
).toDF()

df.write.partitionBy("year", "month").mode("overwrite") \
    .parquet("s3://ml-datalake/curated/events/")
```

> 💡 **관련 이론**: Glue Data Catalog는 "메타데이터의 단일 진실 공급원" 역할을 한다. 한 번 Crawler로 스키마를 등록하면 Athena, Redshift Spectrum, EMR이 같은 테이블 정의를 공유한다. 데이터(S3)와 메타데이터(Catalog)를 분리해, 여러 쿼리 엔진이 같은 데이터를 각자 다른 방식으로 읽게 하는 것이 데이터 레이크 아키텍처의 핵심 설계다.

## 쿼리·탐색: Athena

준비된 데이터를 읽고 이해하는 단계다. **Athena**는 서버리스 SQL로 S3를 직접 쿼리하며 **스캔한 데이터량에 과금**($5/TB)한다. 그래서 Parquet + 파티셔닝 + 압축이 곧 비용 절감이다. EDA(분포·결측·클래스 불균형·데이터 누수 점검)의 주 무대이며, CTAS로 쿼리 결과를 Parquet 학습 데이터셋으로 바로 만들 수도 있다.

```sql
-- 파티션 필터로 스캔량을 줄이며 클래스 불균형 확인
SELECT churned, COUNT(*) AS cnt
FROM ml_datalake.events
WHERE year = '2026' AND month = '06'
GROUP BY churned;
```

> ⚠️ **함정**: Athena 비용이 스캔량에 비례한다는 점을 잊고 `SELECT *`로 전체를 풀스캔하면 비싸진다. 필요한 컬럼만 고르고(Parquet의 컬럼 스킵 활용), 파티션 키로 필터하는 습관이 비용을 수십 배 줄인다.

## 정리하며

Week 2의 데이터 흐름은 **S3를 중심으로 한 데이터 레이크**다. 수집은 모양으로 고르고(실시간→Kinesis, 자동 적재→Firehose, DB→DMS), 저장은 학습을 위해 가공하며(Parquet + Snappy + 날짜 파티셔닝 + 샤딩), Glue로 카탈로그·변환하고(Crawler→Catalog, ETL Job), Athena로 서버리스 SQL 탐색(스캔량 과금이므로 포맷·파티션이 곧 비용)을 한다. 이 모든 단계가 S3를 입출력으로 공유한다는 것이 큰 그림이다.

다음 주(Week 3)에는 이렇게 준비한 데이터를 모델이 읽을 수 있게 바꾸는 특성 공학과, 데이터의 편향·품질 점검을 다룬다.

---

## 📝 연습 문제

**문제 1.** 실시간 클릭스트림을 별도 처리 코드 없이 버퍼링 후 S3에 자동 적재하기만 하면 된다. 가장 적합한 서비스는?

A) Kinesis Data Streams에 컨슈머 앱 직접 구현  
B) Kinesis Data Firehose  
C) AWS DMS  
D) AWS DataSync  

**정답: B**  
해설: Firehose는 완전관리형으로 스트림을 버퍼링해 S3/Redshift에 코드 없이 자동 적재하므로, 처리 없이 적재만 필요한 경우에 적합하다. Data Streams(A)는 컨슈머를 직접 구현해야 하고, DMS(C)는 데이터베이스 복제용, DataSync(D)는 온프레미스 파일 동기화용이다.

---

**문제 2.** Glue Crawler가 수행하는 핵심 역할은?

A) S3 데이터를 스캔해 스키마를 추론하고 Data Catalog에 테이블로 등록한다  
B) 실시간 스트림을 S3에 적재한다  
C) SageMaker 모델을 학습한다  
D) Redshift 클러스터를 프로비저닝한다  

**정답: A**  
해설: Crawler는 S3 데이터를 스캔해 스키마를 추론하고 Glue Data Catalog에 테이블로 등록하여, Athena·Redshift Spectrum 등이 공유하게 한다. 스트림 적재(B)는 Firehose, 모델 학습(C)은 SageMaker, 클러스터 프로비저닝(D)은 Redshift의 역할이다.

---

**문제 3.** ML 데이터 레이크에서 S3가 "단일 진실 공급원" 역할을 하는 이유로 가장 옳은 것은?

A) S3가 유일하게 데이터를 압축할 수 있어서  
B) SageMaker 학습, Glue ETL, Athena 쿼리가 모두 S3를 입출력으로 사용하기 때문  
C) S3만 SQL 쿼리를 지원하기 때문  
D) S3가 실시간 스트리밍 전용이기 때문  

**정답: B**  
해설: S3는 학습·ETL·쿼리 등 모든 단계가 공통으로 읽고 쓰는 중심 저장소이므로 데이터 레이크의 단일 진실 공급원이 된다. 압축은 S3 전용 기능이 아니고(A), SQL 쿼리는 Athena가 수행하며(C), S3는 스트리밍 전용이 아닌 범용 객체 저장소다(D).

---

**문제 4.** Athena로 EDA를 하는데 비용이 예상보다 크게 나왔다. 모든 쿼리가 `SELECT *`로 전체 데이터를 읽고 있었다. 비용을 줄이는 조치로 가장 적절한 것은?

A) 데이터를 CSV로 다시 저장한다  
B) 필요한 컬럼만 선택하고 파티션 키로 필터해 스캔량을 줄인다  
C) Athena 대신 모든 쿼리를 Redshift 클러스터로 옮긴다  
D) 데이터를 압축 해제한다  

**정답: B**  
해설: Athena는 스캔량에 과금하므로 Parquet의 컬럼 선택과 파티션 프루닝으로 스캔 바이트를 줄이는 것이 직접적 해법이다. CSV 재저장(A)은 행 기반이라 오히려 비효율적이고, Redshift 이전(C)은 간헐적 탐색에 과한 비용이며, 압축 해제(D)는 스캔량을 늘린다.

---

**문제 5.** 같은 user_id를 가진 이벤트들의 처리 순서를 보장하며 Kinesis Data Streams에 적재하려 한다. 어떻게 하는가?

A) 모든 레코드에 랜덤 PartitionKey를 부여한다  
B) user_id를 PartitionKey로 사용해 같은 사용자 레코드가 같은 샤드로 가게 한다  
C) 샤드를 1개로 줄인다  
D) Firehose로 전환한다  

**정답: B**  
해설: PartitionKey가 같은 레코드는 같은 샤드로 라우팅되어 샤드 내 순서가 보장되므로, user_id를 키로 쓰면 사용자별 이벤트 순서가 유지된다. 랜덤 키(A)는 순서를 깨고, 단일 샤드(C)는 전체 처리량을 제한하며, Firehose(D)는 순서 보장 스트림 처리 용도가 아니다.

---
