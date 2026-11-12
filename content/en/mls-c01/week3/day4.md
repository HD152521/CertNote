# Day 4 - SageMaker Tools: Data Wrangler, Processing Job, Feature Store

## 📌 Key Takeaways

- **Data Wrangler** = visual, no-code data preparation. 300+ built-in transformations + data quality and insights reports + flow export.
- **Processing Job** = code-based managed distributed preprocessing. Runs in a container and the infrastructure shuts down automatically when it finishes.
- **Feature Store** = a central repository to store, share, and reuse features. **Online** (millisecond single-record) / **Offline** (bulk, for training).
- Feature Store's core value is **eliminating training-serving skew** and **point-in-time accuracy**.
- Exam clues: "no-code/visual" → Data Wrangler, "large-scale custom code" → Processing Job, "training/inference consistency / feature reuse" → Feature Store.

## SageMaker Data Wrangler

Over the past three days, we've covered data cleaning and feature engineering at the concept and code level. Today we look at three SageMaker services that perform the same work on AWS at **scale, reproducibly, and for reuse**.

Data Wrangler is a **visual data preparation tool** within SageMaker Studio. With almost no code, you apply 300+ built-in transformations — missing-value imputation, encoding, scaling, outlier handling, and more — by clicking.

Key capabilities:

- **Diverse source connections** — import directly from S3, Athena, Redshift, Snowflake, etc.
- **Data quality and insights reports** — automatically diagnose missing values, anomalies, target leakage, and duplicates.
- **Built-in + custom transformations** — mix built-in transformations with custom PySpark/Pandas code.
- **Quick Model** — run an instant model on the prepared features to preview feature importance.
- **Export** — export the defined flow to a Processing Job, Pipeline, Feature Store, or Python code.

```text
[Data Wrangler flow example]
S3 import → Impute missing (median) → One-Hot encode categorical
          → Standardize numeric → Data quality report
          → Export to: Processing Job / Feature Store / Pipeline
```

Data Wrangler's value is "bridging exploration and production." Preprocessing that a data scientist improvises in a notebook is hard to reproduce and automate. Data Wrangler saves visually defined transformations as a **declarative flow definition** and exports it directly as a Processing Job or Pipeline step to fold it into the production pipeline. In other words, it guarantees "transformation built in exploration = transformation run in production," reducing preprocessing mismatches between training and inference. The key is to understand it not as something to dismiss as no-code, but as a tool for reproducibility and consistency.

> ⚠️ **Pitfall**: Data Wrangler shines at the **exploration and preparation stage**, but if you need petabyte-scale distributed processing or fully custom logic, EMR/Glue or a hand-written Processing Job is more suitable. In exams, "no-code / visual / quick EDA" leans toward Data Wrangler, and "large-scale custom-code batch processing" leans toward Processing Job.

## SageMaker Processing Job

Processing Job is a **managed distributed compute** job for preprocessing, postprocessing, and model evaluation. You package code in a container and run it on a cluster, and the infrastructure shuts down automatically when it finishes.

| Component | Description |
|---|---|
| **Input** | S3 (or another source) → downloaded to a local path in the container |
| **Processing code** | scikit-learn, Spark, or a custom container |
| **Output** | Results go from a container path → uploaded to S3 |
| **Instances** | Distributed across the specified type and count, auto-terminated after the job |

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

```
[Processing Job execution flow]
S3 input ──download──▶ /opt/ml/processing/input
                          ▼
                    run preprocess.py (distributed across N instances)
                          ▼
        /opt/ml/processing/output ──upload──▶ S3 output
                          ▼
                    instances terminate automatically (billed only for what is used)
```

Processing Job is the ML preprocessing implementation of the "separate compute and storage" philosophy. Data stays in S3; instances are launched only when the job runs, follow the S3 → local → process → S3 pattern, and then shut down. So you are billed only for what you use, and the job enters the same SageMaker tracking and logging framework (CloudWatch, Experiments) as training jobs. It overlaps with EMR/Glue in places, but Processing Job's strengths are its integration with SageMaker workflows (especially Pipelines) and its ML-friendly container ecosystem.

### Comparing the Three Preprocessing Tools

| Tool | Interface | Scale | Strengths |
|---|---|---|---|
| Data Wrangler | Visual (no-code) | Medium | Quick EDA, quality reports, flow export |
| Processing Job | Code (container) | Large | Custom logic, SageMaker integration |
| Glue ETL / EMR | Code (Spark) | Very large | Shared ETL across the whole data lake |

## SageMaker Feature Store

Feature Store is a central repository to **store, retrieve, share, and reuse** machine learning **features**. It lets multiple teams and models use the same features consistently.

Problems it solves:

1. **Duplicate work** — each team recalculates "customer 30-day average purchase amount" in its own way.
2. **Training-serving skew** — the feature calculation logic used at training differs from the logic at inference, degrading performance.
3. **Point-in-time accuracy** — reproduce feature values as of a past time point to build leakage-free training sets.

Two stores:

| Store | Use | Characteristics |
|---|---|---|
| **Online Store** | Low-latency lookup during real-time inference | Millisecond single-record lookup |
| **Offline Store** | Bulk lookup for training | S3-based, keeps historical records |

```python
from sagemaker.feature_store.feature_group import FeatureGroup

fg = FeatureGroup(name="customer-features", sagemaker_session=session)
fg.load_feature_definitions(data_frame=features_df)
fg.create(
    s3_uri="s3://bucket/feature-store/",
    record_identifier_name="customer_id",
    event_time_feature_name="event_time",   # core for point-in-time accuracy
    enable_online_store=True,                # online + offline at the same time
)

# Retrieve latest features from the online store during inference
fg.get_record(record_identifier_value_as_string="C12345")
```

```
[What a point-in-time lookup prevents]

Prediction time: 6/10                  Value that must not enter the training set
   │                                          │
   ▼                                          ▼
 ──●──────────────────────────────────────────●──▶ time
  6/10 feature value (knowable)            6/20 feature value (future)

Record event_time → fetch only "values that were valid as of 6/10" → leakage blocked
```

Feature Store's core value is **eliminating training-serving skew**. A common accident is that the feature computed in batch at training time and the feature computed in real time at inference time are defined subtly differently, so model performance drops in production. Sharing the same feature definition across both Offline (training) and Online (inference) removes this mismatch. It also records `event_time` to support **point-in-time lookups**, a mechanism that builds the training set only from "values actually knowable at prediction time" and so blocks future-information leakage.

> ⚠️ **Pitfall**: Don't confuse the purposes of Feature Store's two stores. Real-time, low-latency single-record lookup is the **Online Store**; building a training set from large amounts of historical data is the **Offline Store**. If the keyword is "millisecond single-record inference lookup," Online is the answer.

### What to Get Right in Feature Group Design

- **Record identifier**: At what entity level is it (customer ID, product ID, session ID)? It becomes the lookup key.
- **event_time**: Mandatory. Without this value, point-in-time lookup cannot work.
- **Separate by entity**: Don't mix customer features and product features in one group; split them, because their update cycles differ.
- **Update cycle**: Distinguish features that need real-time updates from those for which a daily batch is enough.

## Check for Bias During Preparation Too: SageMaker Clarify

Data preparation is not only "changing the shape." Diagnosing the **bias** already in the data is also part of this stage.

- **SageMaker Clarify** computes bias metrics on pre-training data, such as class imbalance and distribution differences between groups.
- After training, you can look at the bias in model predictions together with **feature contributions (explainability)**.
- In regulated industries (finance, healthcare) you must explain "why this decision was made," so it is important to leave this trail from the preparation stage.

Bias problems are often solved not by changing the model but by **looking at the data first**. If a group has few samples to begin with, no amount of changing the algorithm will raise that group's performance.

## Which Tool to Choose

```
How will you prepare the data?
├─ Visually with almost no code, with quality diagnosis too → Data Wrangler
├─ Large-scale distributed processing with custom code, auto-shutdown when done → Processing Job
├─ Shared cleansing across the whole data lake (many consumers) → Glue ETL / EMR
└─ Built features must be reused by several teams/models
   and training/inference definitions must match → Feature Store
```

- These four are not competitors; they occupy **different places in one pipeline**.
- In exams, a single keyword in the passage fixes the place. "No-code," "custom code," "shared cleansing," and "reuse/consistency" are those keywords.

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

The three tools have different roles. **Data Wrangler** is for visual, no-code EDA and transformation definition; **Processing Job** is code-based large-scale distributed preprocessing; **Feature Store** guarantees feature reuse, training/inference consistency, and point-in-time accuracy. The three are often chained in one pipeline.

### Practical Sense for Using the Three Tools Together

- **Exploration in Data Wrangler, production in Processing Job** is the default combination. Exporting the visually built flow as-is makes "the transformation verified in exploration = the transformation running in production."
- **Feature storage is optional, not mandatory.** If there is only one model and no reuse requirement, S3 + Processing Job alone is enough without Feature Store.
- **If several teams and several models use the same features**, that is when Feature Store pays off. Duplicate computation disappears and definitions converge into one.
- In any combination, **leaving the transformation definition as code or a declarative flow** is the condition for reproducibility.

Adopting Feature Store when there is no reuse requirement only adds operational complexity. In exams too, if reuse, consistency, or point-in-time accuracy is not mentioned in the requirements, Feature Store may not be the correct answer.

In the next note we do a comprehensive review of all of Week 3 (cleaning, feature engineering, tools).

## 📖 Glossary

- **Data Wrangler**: SageMaker Studio's visual data preparation tool. Defines and exports transformation flows.
- **Flow**: The declarative definition of transformation steps defined in Data Wrangler. It can be exported to production as-is.
- **Data quality and insights report**: A Data Wrangler feature that automatically diagnoses missing values, anomalies, duplicates, and suspected target leakage.
- **Processing Job**: A managed job that runs preprocessing/evaluation in a container and automatically shuts down the infrastructure when it ends.
- **Feature Store**: A central repository to store, share, and reuse features.
- **Feature group**: The unit in Feature Store that bundles the features of the same entity.
- **Online Store / Offline Store**: A store for millisecond single-record lookup / a store for bulk training lookup.
- **event_time**: The time point at which this feature value was valid. It is the reference for point-in-time lookup.
- **Point-in-time lookup**: A lookup that fetches only the values knowable at a specific past time. It blocks future-information leakage.
- **Training-serving skew**: The accident of production performance dropping because features are computed differently at training and at inference.

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
