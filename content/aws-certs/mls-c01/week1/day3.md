# Day 3 - 데이터 수집: Kinesis·Glue·배치 vs 스트리밍

학습 데이터는 어딘가에서 흘러들어와야 한다. 클릭 로그·IoT 센서·거래 이벤트는 실시간 스트림으로 쏟아지고, 운영 DB나 외부 시스템의 데이터는 주기적 배치로 들어온다. Specialty는 "이 수집 요구사항에 Kinesis 어느 서비스를? Glue를 어떻게?"를 시나리오로 묻는다.

오늘은 ① Kinesis 4종(Data Streams·Firehose·Managed Service for Flink·Video)의 구분, ② Glue의 ETL·카탈로그·크롤러, ③ 배치 학습 데이터와 스트리밍 학습 데이터의 차이를 다룬다.

## Kinesis 4종 구분: Specialty 단골

"Kinesis"는 하나가 아니라 네 개의 서비스다. 이름만 보고 헷갈리기 쉬워 정확히 구분해야 한다.

| 서비스 | 역할 | 핵심 특징 |
|--------|------|----------|
| **Data Streams (KDS)** | 실시간 스트림 수집·저장 | 샤드 기반, 직접 소비자 코드 필요, 데이터 보관(최대 365일) |
| **Data Firehose** | 스트림→목적지 적재(ETL 로딩) | 완전관리형, S3/Redshift/OpenSearch로 자동 배달, 버퍼링·변환 |
| **Managed Service for Flink** | 스트림 실시간 분석 | SQL/Flink로 윈도우 집계·이상탐지 |
| **Video Streams** | 비디오 스트림 수집 | 영상 ML 입력(얼굴 인식 등) |

가장 자주 헷갈리는 KDS vs Firehose의 결정 트리:

- **목적지로 자동 적재만 필요?** → Firehose (코드 없이 S3 등으로 배달)
- **여러 소비자가 같은 스트림을 다르게 처리? 커스텀 처리? 데이터 재생?** → Data Streams

```python
import boto3, json
kinesis = boto3.client("kinesis")

# Data Streams에 이벤트 넣기 — PartitionKey로 샤드 분배
kinesis.put_record(
    StreamName="clickstream",
    Data=json.dumps({"user_id": "u123", "event": "click", "ts": 1719300000}),
    PartitionKey="u123",     # 같은 키는 같은 샤드 → 순서 보장 단위
)
```

```python
# Firehose: 코드 없이 S3로 자동 배달 + 버퍼링 설정 (전송 스트림 구성 예)
firehose = boto3.client("firehose")
firehose.put_record(
    DeliveryStreamName="to-datalake",
    Record={"Data": json.dumps({"user_id": "u123", "amount": 42.0}) + "\n"},
)
# Firehose가 버퍼(예: 5MB 또는 60초)를 채우면 S3에 Parquet으로 변환·압축 적재
```

> 💡 **관련 이론**: KDS는 샤드(shard) 단위로 처리량을 확장한다. 샤드 하나가 쓰기 1MB/s·1,000 records/s, 읽기 2MB/s를 처리하므로 트래픽이 늘면 샤드를 늘려야 한다(또는 on-demand 모드). 또한 KDS는 데이터를 보관(retention)해 여러 소비자가 같은 데이터를 독립적으로 읽고 재처리할 수 있다(replay). 반면 Firehose는 보관·재생이 없고 목적지 적재만 책임지는 "fire and forget" 파이프다. "여러 소비자/재처리 = KDS, 단순 적재 = Firehose"가 핵심 분기다.

## Glue: 서버리스 ETL과 데이터 카탈로그

AWS Glue는 세 가지를 묶은 서버리스 서비스다.

1. **Glue Data Catalog**: 데이터의 메타데이터(스키마·위치·파티션) 중앙 저장소. Athena·Redshift Spectrum·EMR이 공유한다.
2. **Glue Crawler**: S3 등을 스캔해 스키마를 자동 추론하고 카탈로그에 테이블로 등록.
3. **Glue ETL Jobs**: Spark(또는 Python shell) 기반 서버리스 변환 작업.

```python
# Glue ETL 잡 (PySpark) — 카탈로그 테이블을 읽어 정제 후 Parquet로 저장
import sys
from awsglue.context import GlueContext
from awsglue.transforms import DropNullFields
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())

# 카탈로그에 크롤러가 등록한 테이블을 DynamicFrame으로 로드
dyf = glueContext.create_dynamic_frame.from_catalog(
    database="raw_db", table_name="clickstream"
)
clean = DropNullFields.apply(frame=dyf)          # 결측 컬럼 제거

# 학습용 피처 위치에 Parquet으로 저장 (파티셔닝)
glueContext.write_dynamic_frame.from_options(
    frame=clean,
    connection_type="s3",
    connection_options={"path": "s3://my-lake/features/", "partitionKeys": ["dt"]},
    format="parquet",
)
```

> 💡 **관련 이론**: Glue의 DynamicFrame은 Spark DataFrame의 ML/ETL 친화 확장으로, 스키마가 제각각인 반정형 데이터(JSON 등)를 스키마 강제 없이 다룰 수 있다(스키마 불일치 행을 버리지 않고 보존). 정형 변환이 끝나면 `toDF()`로 일반 Spark DataFrame으로 바꿔 익숙한 연산을 쓴다. Crawler가 채운 Data Catalog 덕에 Athena로 즉시 SQL 탐색이 가능해, ML 전처리 전 데이터 이해(EDA) 단계가 빨라진다.

## 배치 학습 데이터 vs 스트리밍 학습 데이터

ML 데이터 수집은 두 패턴으로 나뉜다.

| 구분 | 배치(Batch) | 스트리밍(Streaming) |
|------|------------|---------------------|
| 도착 방식 | 주기적 대량 적재(매일/매시) | 이벤트가 도착하는 즉시 |
| 대표 도구 | Glue, EMR, Batch, S3 | Kinesis, MSK(Kafka) |
| 지연(latency) | 분~시간 | 초~밀리초 |
| 학습 적합 | 대부분의 모델 재학습 | 실시간 피처·온라인 학습 |
| 신선도 | 오래됨 허용 | 최신성이 가치 |

대부분의 ML 학습은 **배치**다. 매일 밤 누적된 데이터로 모델을 재학습하는 식이다. 스트리밍이 필요한 경우는 ① 실시간 피처(최근 5분 거래 횟수)를 추론에 써야 할 때, ② 사기 탐지처럼 즉시 점수가 필요할 때다.

```python
# 람다 아키텍처 패턴: 스트림은 즉시 처리, 동시에 S3로 적재해 나중에 배치 재학습
# Firehose → S3 (배치 학습용 데이터레이크 축적)
# KDS → Flink → 실시간 피처 → 추론 엔드포인트 (즉시 처리)
```

> 💡 **관련 이론**: 람다 아키텍처(lambda architecture)는 같은 데이터를 **스피드 레이어**(스트리밍, 저지연 근사)와 **배치 레이어**(주기적, 정확·완전)로 동시에 처리해 둘의 장점을 합친다. ML에서는 Firehose로 모든 이벤트를 S3에 축적(배치 재학습용)하면서, KDS+Flink로 실시간 피처를 계산(즉시 추론용)하는 형태로 자주 쓰인다. 다만 두 경로의 피처 계산 로직이 어긋나면 training-serving skew가 생기므로 일관성 관리가 중요하다.

## 수집 파이프라인 설계 사고

시험 시나리오를 풀 때 순서대로 묻자. ① 데이터가 스트림인가 배치인가? ② 스트림이면 단순 적재(Firehose)인가 커스텀/다소비자(KDS)인가? ③ 변환이 필요한가(Glue ETL)? ④ 목적지는 데이터레이크(S3)인가 분석(Redshift/OpenSearch)인가? 이 네 질문이면 대부분의 수집 문제가 풀린다.

## 📝 연습 문제

**문제 1.** IoT 센서 스트림을 별도 변환·코드 없이 그대로 S3 데이터레이크에 Parquet으로 자동 적재하기만 하면 된다. 가장 적합한 서비스는?

A) Kinesis Data Streams + 커스텀 소비자  
B) Kinesis Data Firehose  
C) Kinesis Video Streams  
D) Glue Crawler  

**정답: B**  
해설: Firehose는 완전관리형으로 코드 없이 스트림을 S3 등 목적지로 버퍼링·포맷 변환(Parquet)해 자동 배달하는 데 특화돼 있다. Data Streams는 소비자 코드와 샤드 관리가 필요하고, Video Streams는 영상용, Crawler는 적재가 아니라 스키마 추론 도구다.

---

**문제 2.** 하나의 클릭스트림을 ① 실시간 대시보드, ② 사기 탐지 모델, ③ 추후 재처리를 위해 각각 독립적으로 소비하고, 장애 시 데이터를 다시 읽어야 한다. 적합한 서비스는?

A) Kinesis Data Firehose  
B) S3 단독  
C) Kinesis Data Streams  
D) Glue ETL Job  

**정답: C**  
해설: 여러 소비자가 같은 스트림을 독립적으로 읽고 데이터 보관·재생(replay)이 필요한 경우는 Data Streams의 핵심 사용처다. Firehose는 보관·다소비자·재생을 지원하지 않는 단순 적재 파이프이고, S3·Glue ETL은 실시간 다소비 스트리밍 요건을 충족하지 못한다.

---

**문제 3.** 스키마를 모르는 대량의 JSON 로그가 S3에 쌓여 있다. Athena로 SQL 탐색을 시작하기 전에 테이블과 스키마를 자동으로 만들고 싶다. 사용할 도구는?

A) Glue Crawler  
B) Kinesis Firehose  
C) SageMaker Ground Truth  
D) EFS  

**정답: A**  
해설: Glue Crawler는 S3를 스캔해 스키마를 자동 추론하고 Glue Data Catalog에 테이블로 등록해, Athena가 즉시 SQL로 조회할 수 있게 한다. Firehose는 적재, Ground Truth는 데이터 레이블링, EFS는 파일 스토리지로 스키마 추론과 무관하다.

---

**문제 4.** 대부분의 ML 모델 재학습이 스트리밍이 아니라 배치 방식으로 이뤄지는 가장 큰 이유는?

A) 스트리밍이 항상 더 비싸기 때문  
B) Kinesis가 학습을 지원하지 않기 때문  
C) 배치가 항상 더 정확하기 때문  
D) 재학습은 보통 누적된 대량 데이터를 주기적으로 처리하면 충분하고, 밀리초 단위 신선도가 필요 없기 때문  

**정답: D**  
해설: 모델 재학습은 매일/매시 누적된 데이터를 주기적으로 돌리면 충분한 경우가 대부분이라 저지연이 불필요해 배치가 자연스럽다. 스트리밍은 실시간 피처나 즉시 점수가 필요한 특수 상황에 쓴다. 비용·정확도는 상황에 따라 다르고, Kinesis로도 데이터를 모아 학습에 쓸 수 있다.

---

**문제 5.** 같은 이벤트 데이터를 실시간 피처 계산(즉시 추론용)과 주기적 모델 재학습(정확·완전)에 모두 활용하기 위한 아키텍처 패턴은?

A) 모든 처리를 단일 배치 잡으로 통합  
B) 람다 아키텍처 — 스트리밍(스피드) 레이어와 배치 레이어를 병행  
C) 스트리밍만 사용  
D) 데이터를 복제하지 않고 한 경로만 사용  

**정답: B**  
해설: 람다 아키텍처는 스피드 레이어(스트리밍, 저지연 근사)와 배치 레이어(주기적, 정확·완전)를 병행해 실시간성과 정확성을 동시에 얻는다. ML에서는 Firehose로 S3에 축적해 재학습하고 KDS+Flink로 실시간 피처를 계산하는 식이다. 단일 경로만으로는 두 요구를 동시에 만족하기 어렵다.

---
