# Day 4 - SageMaker Tools: Data Wrangler, Processing Job, Feature Store

Over the past three days, we've covered data cleaning and feature engineering at the conceptual and code level. Today we explore three SageMaker services that perform the same work on AWS at **scale, with reproducibility, and for reuse**.

- **Data Wrangler**: Visual (no-code) data preparation
- **Processing Job**: Code-based distributed preprocessing
- **Feature Store**: Central repository to store, share, and reuse features

MLS-C01 exams frequently ask "which tool fits which situation?" and "why is Feature Store necessary?"

## SageMaker Data Wrangler

Data Wrangler is a **visual data preparation tool** within SageMaker Studio. With minimal code, you can click to apply 300+ built-in transformations: missing value imputation, encoding, scaling, outlier handling, and more.

Key capabilities:

- **Diverse source connections**: Import directly from S3, Athena, Redshift, Snowflake, etc.
- **Data quality and insights reports**: Auto-diagnose missing values, outliers, target leakage, and duplicates.
- **Built-in + custom transformations**: Mix built-in transformations with custom PySpark/Pandas code.
- **Quick Model**: Test your prepared features instantly to preview feature importance.
- **Export**: Export your defined flow to Processing Job, Pipeline, Feature Store, or Python code.

```text
[Data Wrangler flow example]
S3 import → Impute missing (median) → One-Hot encode categorical
          → Standardize numeric → Data quality report
          → Export to: Processing Job / Feature Store / Pipeline
```

> 💡 **Key Theory**: Data Wrangler's value lies in "bridging exploration and production." Quick preprocessing code in a notebook is hard to reproduce and automate. Data Wrangler saves visually-defined transformations as a **declarative flow definition**, then exports it directly to Processing Jobs or Pipeline steps for production. This ensures "transformation built in exploration = transformation run in production," reducing training-serving skew from preprocessing mismatches. It's not "just no-code"—it's a reproducibility and consistency tool.

> ⚠️ **Pitfall**: Data Wrangler shines for **exploration and preparation**, but for petabyte-scale distributed processing or complex custom logic, EMR/Glue or hand-written Processing Jobs are better. In exams, if the scenario is "no-code/visual/quick EDA," think Data Wrangler; if it's "large-scale custom code batch processing," think Processing Job.

## SageMaker Processing Job

Processing Job is **managed distributed compute** for preprocessing, postprocessing, and model evaluation. You package code in a container, run it on a cluster, and infrastructure shuts down automatically when done.

| Component | Description |
|------|------|
| **Input** | S3 (or other source) → downloaded to container local path |
| **Processing code** | scikit-learn, Spark, or custom container |
| **Output** | Container path → uploaded to S3 |
| **Instances** | Distributed across specified type/count; auto-terminate after job |

Common processors: `SKLearnProcessor` (scikit-learn), `PySparkProcessor` (large-scale Spark), custom containers.

```python
from sagemaker.sklearn.processing import SKLearnProcessor
from sagemaker.processing import ProcessingInput, ProcessingOutput

processor = SKLearnProcessor(
    framework_version="1.2-1",
    role=role,
    instance_type="ml.m5.xlarge",
    instance_count=2,          # distributed processing
)

processor.run(
    code="preprocess.py",
    inputs=[ProcessingInput(source="s3://bucket/raw/", destination="/opt/ml/processing/input")],
    outputs=[ProcessingOutput(source="/opt/ml/processing/output", destination="s3://bucket/processed/")],
)
```

> 💡 **Key Theory**: Processing Job implements ML preprocessing under the "separate compute and storage" philosophy. Data stays in S3; you spin up instances only when running the job, following the S3 → local → process → S3 pattern, then shut down. You pay only for what you use, and the job integrates into SageMaker's unified tracking and logging (CloudWatch, Experiments) like training jobs. There's overlap with EMR/Glue, but Processing Job's strength is seamless SageMaker Pipelines integration and ML-friendly container ecosystem.

## SageMaker Feature Store

Feature Store is a central **repository to store, retrieve, share, and reuse** machine learning features. It ensures multiple teams and models use the same feature definitions consistently.

Problems it solves:

1. **Duplicate work**: Each team recalculates "customer 30-day average purchase amount" independently.
2. **Training-serving skew**: Feature calculation logic differs between training and inference, degrading production performance.
3. **Point-in-time accuracy**: Reproduce past feature values to build leakage-free training sets.

Two storage types:

| Store | Use Case | Characteristics |
|------|------|------|
| **Online Store** | Real-time inference with low latency | Single-record millisecond retrieval |
| **Offline Store** | Large-scale training data lookup | S3-based, maintains historical records |

```python
from sagemaker.feature_store.feature_group import FeatureGroup

fg = FeatureGroup(name="customer-features", sagemaker_session=session)
fg.load_feature_definitions(data_frame=features_df)
fg.create(
    s3_uri="s3://bucket/feature-store/",
    record_identifier_name="customer_id",
    event_time_feature_name="event_time",   # core for point-in-time accuracy
    enable_online_store=True,                # enable both online and offline
)

# Retrieve latest features from online store during inference
fg.get_record(record_identifier_value_as_string="C12345")
```

> 💡 **Key Theory**: Feature Store's core value is **eliminating training-serving skew**. A common pitfall: feature definitions computed in batches during training differ subtly from real-time computation during inference, causing production performance to degrade. Sharing the same feature definition across Offline (training) and Online (inference) stores eliminates this mismatch. Recording `event_time` enables **point-in-time retrieval**—building training sets only with values known at prediction time, blocking future information leakage.

> ⚠️ **Pitfall**: Don't confuse the two stores' purposes. Low-latency single-record retrieval for inference = **Online Store**. Building training sets from large historical data = **Offline Store**. If the keyword is "millisecond single-record inference query," Online is the answer.

## How the Three Tools Relate

```text
[Typical pipeline]
Data Wrangler (visual EDA and transformation definition)
      │  export
      ▼
Processing Job (execute large-scale transformations)
      │  ingest
      ▼
Feature Store (store and share features)
      ├─ Offline → training jobs
      └─ Online  → real-time inference
```

## Summary

SageMaker's data preparation tools have distinct roles. **Data Wrangler** is for visual, no-code EDA and transformation definition; **Processing Job** handles code-based, large-scale distributed preprocessing; **Feature Store** ensures feature reuse, training-inference consistency, and point-in-time accuracy. These three typically flow together in one pipeline.

Next, we'll do a comprehensive review of Week 3 (cleaning, feature engineering, and tools).

---

## 📝 연습 문제

**문제 1.** 코드를 거의 작성하지 않고 시각적으로 결측치 대치·인코딩·스케일링을 적용하고 데이터 품질을 자동 진단하려 한다. 가장 적합한 SageMaker 도구는?

A) SageMaker Processing Job  
B) SageMaker Data Wrangler  
C) SageMaker Feature Store  
D) SageMaker Model Monitor  

**정답: B**  
해설: Data Wrangler는 SageMaker Studio의 시각적(노코드) 데이터 준비 도구로 300여 개 내장 변환과 데이터 품질·인사이트 리포트를 제공한다. Processing Job(A)은 코드 기반 분산 처리, Feature Store(C)는 피처 저장소, Model Monitor(D)는 운영 모델 모니터링 도구다.

---

**문제 2.** 학습 때 계산한 피처와 추론 때 계산한 피처의 정의가 달라 운영 성능이 떨어지는 training-serving skew를 방지하려 한다. 가장 적절한 서비스는?

A) SageMaker Feature Store  
B) SageMaker Data Wrangler  
C) Amazon Athena  
D) AWS Glue Crawler  

**정답: A**  
해설: Feature Store는 동일한 피처 정의를 Offline(학습)과 Online(추론)에서 공유해 학습/추론 불일치를 제거한다. Data Wrangler(B)는 변환 정의 도구이고, Athena(C)는 쿼리 엔진, Glue Crawler(D)는 스키마 카탈로그화 도구라 skew 방지가 주목적이 아니다.

---

**문제 3.** 수 테라바이트 데이터를 커스텀 PySpark 코드로 분산 전처리한 뒤 결과를 S3에 저장하고, 작업이 끝나면 인프라가 자동 종료되길 원한다. 가장 적합한 것은?

A) Data Wrangler 단독 사용  
B) Feature Store Online Store  
C) SageMaker Processing Job (PySparkProcessor)  
D) SageMaker 엔드포인트  

**정답: C**  
해설: Processing Job은 컨테이너에 커스텀 코드(PySparkProcessor 등)를 담아 지정한 인스턴스 클러스터에서 분산 처리하고, 작업 후 인프라를 자동 종료한다. Data Wrangler(A)는 초대규모 커스텀 분산 처리에 부적합하고, Online Store(B)는 추론 조회용, 엔드포인트(D)는 실시간 추론 서빙용이다.

---

**문제 4.** Feature Store에서 실시간 추론 시 단일 레코드를 밀리초 단위로 조회해야 한다. 어떤 저장소를 사용해야 하는가?

A) Offline Store  
B) Online Store  
C) S3 Glacier  
D) Redshift  

**정답: B**  
해설: Online Store는 단일 레코드의 저지연(ms급) 조회에 최적화되어 실시간 추론에 사용된다. Offline Store(A)는 S3 기반으로 대량 과거 데이터를 학습용으로 조회하는 용도다. Glacier(C)는 콜드 아카이브, Redshift(D)는 데이터 웨어하우스라 실시간 단건 추론 조회에 부적합하다.

---

**문제 5.** "예측 시점에 실제로 알 수 있었던 값만으로 학습셋을 구성"해 미래 정보 누수를 막는 Feature Store 기능은?

A) point-in-time(시점 기준) 조회  
B) 자동 스케일링  
C) 데이터 암호화  
D) A/B 테스트 라우팅  

**정답: A**  
해설: Feature Store는 `event_time`을 기록해 특정 과거 시점에 유효했던 피처값을 재현하는 point-in-time 조회를 지원하며, 이는 미래 정보가 학습에 새어 들어가는 누수를 방지한다. 자동 스케일링(B)·암호화(C)·A/B 라우팅(D)은 시점 정확성과 무관한 기능이다.

---
