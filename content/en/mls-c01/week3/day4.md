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

## 📝 Practice Questions

**Question 1.** You want to visually apply missing value imputation, encoding, and scaling with almost no code and automatically diagnose data quality. Which SageMaker tool is MOST appropriate?

A) SageMaker Processing Job  
B) SageMaker Data Wrangler  
C) SageMaker Feature Store  
D) SageMaker Model Monitor  

**Answer: B**  
Explanation: Data Wrangler is a visual (no-code) data preparation tool in SageMaker Studio that provides more than 300 built-in transformations and data quality and insights reports. Processing Job (A) is code-based distributed processing, Feature Store (C) is a feature repository, and Model Monitor (D) is a tool for monitoring production models.

---

**Question 2.** You want to prevent training-serving skew, where the definition of features computed at training time differs from that computed at inference time and degrades production performance. Which service is MOST appropriate?

A) SageMaker Feature Store  
B) SageMaker Data Wrangler  
C) Amazon Athena  
D) AWS Glue Crawler  

**Answer: A**  
Explanation: Feature Store shares the same feature definitions between Offline (training) and Online (inference), eliminating training/inference inconsistency. Data Wrangler (B) is a tool for defining transformations, Athena (C) is a query engine, and Glue Crawler (D) is a schema cataloging tool, so preventing skew is not their main purpose.

---

**Question 3.** You want to preprocess several terabytes of data in a distributed manner with custom PySpark code, store the results in S3, and have the infrastructure shut down automatically when the job finishes. Which is MOST appropriate?

A) Use Data Wrangler alone  
B) Feature Store Online Store  
C) SageMaker Processing Job (PySparkProcessor)  
D) SageMaker endpoint  

**Answer: C**  
Explanation: A Processing Job packages custom code (such as PySparkProcessor) in a container, processes it in a distributed manner on a cluster of specified instances, and automatically shuts down the infrastructure after the job. Data Wrangler (A) is unsuitable for ultra-large custom distributed processing, the Online Store (B) is for inference lookups, and an endpoint (D) is for serving real-time inference.

---

**Question 4.** In Feature Store, a single record must be retrieved within milliseconds for real-time inference. Which store should you use?

A) Offline Store  
B) Online Store  
C) S3 Glacier  
D) Redshift  

**Answer: B**  
Explanation: The Online Store is optimized for low-latency (millisecond-level) retrieval of single records and is used for real-time inference. The Offline Store (A) is S3-based and is used to query large volumes of historical data for training. Glacier (C) is a cold archive and Redshift (D) is a data warehouse, so both are unsuitable for real-time single-record inference lookups.

---

**Question 5.** Which Feature Store capability prevents future-information leakage by "building the training set only from values that were actually knowable at prediction time"?

A) Point-in-time lookup  
B) Automatic scaling  
C) Data encryption  
D) A/B test routing  

**Answer: A**  
Explanation: Feature Store records `event_time` and supports point-in-time lookups that reproduce the feature values that were valid at a specific past point in time, which prevents leakage in which future information seeps into training. Automatic scaling (B), encryption (C), and A/B routing (D) are features unrelated to point-in-time correctness.

---
