# Day 3 - Data Collection: Kinesis·Glue·Batch vs Streaming

Training data must flow in from somewhere. Click logs, IoT sensors, and transaction events stream in real-time; operational databases and external systems arrive in periodic batches. Specialty asks scenarios: "Which Kinesis service fits this ingestion need? How should we use Glue?"

Today we cover: ① the 4 Kinesis services (Data Streams, Firehose, Managed Service for Flink, Video) and how they differ, ② Glue's ETL, catalog, and crawlers, and ③ the differences between batch and streaming training data pipelines.

## The 4 Kinesis Services: A Specialty Favorite

"Kinesis" isn't one service—it's four. The names make them easy to confuse, so precision matters.

| Service | Role | Key Characteristics |
|---------|------|-----|
| **Data Streams (KDS)** | Real-time stream collection and storage | Shard-based, direct consumer code needed, data retention (up to 365 days) |
| **Data Firehose** | Stream → destination delivery (ETL loading) | Fully managed, auto-deliver to S3/Redshift/OpenSearch, buffering and transformation |
| **Managed Service for Flink** | Real-time stream analysis | SQL/Flink for windowed aggregation, anomaly detection |
| **Video Streams** | Video stream collection | Video ML input (facial recognition, etc.) |

The most-confused pair: KDS vs Firehose. Decision tree:

- **Need only automatic delivery to destination?** → Firehose (no code, auto-deliver to S3, etc.)
- **Multiple consumers reading the same stream differently? Custom processing? Replay data?** → Data Streams

```python
import boto3, json
kinesis = boto3.client("kinesis")

# Data Streams: put events — PartitionKey distributes across shards
kinesis.put_record(
    StreamName="clickstream",
    Data=json.dumps({"user_id": "u123", "event": "click", "ts": 1719300000}),
    PartitionKey="u123",     # Same key → same shard → order guarantee per partition
)
```

```python
# Firehose: auto-deliver to S3 with no code + buffering config (delivery stream setup example)
firehose = boto3.client("firehose")
firehose.put_record(
    DeliveryStreamName="to-datalake",
    Record={"Data": json.dumps({"user_id": "u123", "amount": 42.0}) + "\n"},
)
# Firehose fills buffer (e.g., 5MB or 60s) then converts to Parquet, compresses, delivers to S3
```

> 💡 **Related Theory**: KDS scales processing by shard. One shard handles ~1 MB/s writes, 1,000 records/s, ~2 MB/s reads; as traffic grows you add shards (or switch to on-demand mode). KDS also **retains** data so multiple consumers can independently read and reprocess the same data (replay). Firehose has no retention or replay—it's "fire and forget," responsible only for destination delivery. Core decision rule: **Multiple consumers/replay = KDS; simple delivery = Firehose**.

## Glue: Serverless ETL and Data Catalog

AWS Glue bundles three things into one serverless service.

1. **Glue Data Catalog**: Central metadata store (schema, location, partitions) shared by Athena, Redshift Spectrum, EMR.
2. **Glue Crawler**: Scans S3, auto-infers schema, registers as table in the catalog.
3. **Glue ETL Jobs**: Serverless transformations via Spark (or Python shell).

```python
# Glue ETL job (PySpark) — read catalog table, clean, save to Parquet
import sys
from awsglue.context import GlueContext
from awsglue.transforms import DropNullFields
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())

# Load table registered by crawler as DynamicFrame
dyf = glueContext.create_dynamic_frame.from_catalog(
    database="raw_db", table_name="clickstream"
)
clean = DropNullFields.apply(frame=dyf)          # Remove null columns

# Save to features location as Parquet (partitioned)
glueContext.write_dynamic_frame.from_options(
    frame=clean,
    connection_type="s3",
    connection_options={"path": "s3://my-lake/features/", "partitionKeys": ["dt"]},
    format="parquet",
)
```

> 💡 **Related Theory**: Glue's DynamicFrame is a Spark DataFrame extension for ML/ETL, handling semi-structured data (JSON, etc.) without strict schemas—rows with mismatched schemas aren't discarded, they're preserved. Once structured transformation is done, call `toDF()` to convert to regular Spark DataFrame for familiar operations. Because Crawler populates the Data Catalog, Athena can immediately query via SQL, speeding up the EDA (exploratory data analysis) phase before ML preprocessing.

## Batch Training Data vs Streaming Training Data

Data ingestion splits into two patterns.

| Aspect | Batch | Streaming |
|--------|------|-----|
| Arrival | Periodic bulk loads (daily/hourly) | Event-by-event as it arrives |
| Tools | Glue, EMR, Batch, S3 | Kinesis, MSK (Kafka) |
| Latency | Minutes to hours | Seconds to milliseconds |
| Training fit | Most model retraining | Real-time features, online learning |
| Freshness | Older data OK | Recency is valuable |

**Most** ML training is **batch**. Data accumulates overnight, then the model retrains on the batch. Streaming is needed when: ① real-time features (last 5 minutes of transactions) go into inference, or ② immediate scoring is required (fraud detection).

```python
# Lambda architecture pattern: streams processed immediately, simultaneously written to S3 for later batch retraining
# Firehose → S3 (batch retraining data lake accumulates)
# KDS → Flink → real-time features → inference endpoint (immediate processing)
```

> 💡 **Related Theory**: Lambda architecture (lambda architecture) processes the same data via **speed layer** (streaming, low-latency approximation) and **batch layer** (periodic, accurate, complete) simultaneously, combining both strengths. In ML it's common to accumulate all events in S3 via Firehose (for batch retraining) while computing real-time features via KDS+Flink (for immediate inference). But if feature logic diverges between the two paths, training-serving skew results, so consistency is critical.

## Data Ingestion Pipeline Design Thinking

When solving exam scenarios, ask in order: ① Is the data a stream or batch? ② If stream, is it simple delivery (Firehose) or custom/multi-consumer (KDS)? ③ Does transformation happen (Glue ETL)? ④ Is the destination a data lake (S3) or analytics (Redshift/OpenSearch)? These four questions solve most ingestion scenarios.

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
