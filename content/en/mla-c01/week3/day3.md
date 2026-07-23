# Day 3 - SageMaker Feature Store: Managing Features as Assets

If features created yesterday exist only in a notebook dataframe, the next project must create the same features again. Worse, transformations used during training might subtly differ from those used during inference, silently destroying model performance. SageMaker Feature Store is a dedicated repository solving both problems: feature reuse and training/inference consistency.

In MLA-C01 exams, Feature Store appears with keywords like "online/offline store differences," "preventing training/serving skew," "feature sharing." Today we cover three axes: structure, two stores, and consistency.

## What is Feature Store?

Feature Store is a central repository storing, managing, and serving ML features. The core unit is **Feature Group**. A Feature Group is structured like a relational table with rows and columns; each column is one feature. Two essential elements exist:

- **Record Identifier**: Key identifying each row (e.g., customer_id)
- **Event Time**: When that feature value was recorded (basis for time travel)

```python
from sagemaker.feature_store.feature_group import FeatureGroup

feature_group = FeatureGroup(name='customer-features', ...)

feature_group.create(
    record_identifier_name='customer_id',   # Row identifier
    event_time_feature_name='event_time',    # Event timestamp
    role_arn=role,
    enable_online_store=True                 # Enable online store
)

# Ingest features
feature_group.ingest(data_frame=df, max_workers=3)
```

When multiple records with different event_times accumulate for the same customer_id, you can reconstruct "what was this feature's value at that point in time?"

> 💡 **Related Theory**: Event Time connects to bitemporal concepts in time-series databases. When training models on historical data, use only feature values actually knowable at that time to prevent look-ahead bias. For example, predicting January 2024 transactions using feature values updated in March 2024 is seeing the future. Event Time-based queries guarantee this temporal consistency.

## Online Store and Offline Store

Feature Store's core is providing two kinds of stores simultaneously. Exam questions most frequently test this difference.

| Aspect | Online Store | Offline Store |
|------|----------------------|--------------------------|
| Purpose | Real-time inference | Training & batch |
| Latency | Milliseconds (low) | High (batch) |
| Storage | Fast key-value lookup | S3 (Parquet) |
| Query Unit | Single latest record (GetRecord) | Full history (bulk) |
| Cost | Relatively higher | Low (S3) |
| API | GetRecord (single) | Athena query / S3 direct |

**Online store** returns the latest feature value for a customer_id in milliseconds when an inference server requests "give me current features for this customer." **Offline store** keeps all history in S3 as Parquet and supports batch queries via Athena when building training datasets.

```python
# Online store: fetch latest features for real-time inference
record = featurestore_runtime.get_record(
    FeatureGroupName='customer-features',
    RecordIdentifierValueAsString='cust_12345'
)

# Offline store: create training dataset via Athena
query = feature_group.athena_query()
query.run(query_string="SELECT * FROM customer_features WHERE ...",
          output_location='s3://my-bucket/query-results/')
```

> ⚠️ **Gotcha**: Enabling only online store means training history doesn't accumulate in S3; enabling only offline means real-time inference can't query with low latency. Most real ML systems **enable both**, using the same feature definitions consistently for training (offline) and inference (online). When ingesting data, SageMaker auto-syncs latest values to online and history to offline.

## Consistency: Preventing training/serving Skew

Feature Store's greatest value is **training and inference sharing the same feature definition**. Training/serving skew is the classic problem where feature calculation differs between training and serving, degrading model performance.

Typical scenario: training pipeline computes "average purchase amount last 30 days" in pandas; inference server recomputes it in Java. If the two implementations differ slightly (boundary handling, rounding), the model sees different values during training vs. serving. Feature Store eliminates this mismatch by computing features once and having both sides read from the same repository.

```
[Feature Computation Pipeline] ──ingest──> [Feature Store]
                                              |
                        ┌─────────────────────┴──────────────────┐
                        v                                          v
              [Offline Store]                            [Online Store]
              Create training dataset                    Real-time inference query
              (Athena, consistent definition)            (GetRecord, consistent definition)
```

> 💡 **Related Theory**: Training/serving skew is emphasized in Google's "Hidden Technical Debt in Machine Learning Systems" paper on ML technical debt. Model code is a tiny part of the whole ML system; data pipelines and feature consistency are chief failure sources. Feature Store elevates features from "code" to "shared data assets," consolidating definition in one place to reduce this debt.

## Feature Reuse and Governance

Feature Store's second value is reuse. Team B can use features like "customer lifetime value" and "recent activity score" created by Team A directly in new models. Duplicate work creating the same features repeatedly disappears.

- **Discovery**: Attach metadata/descriptions to Feature Groups and features for team sharing
- **Versioning & Lineage**: Track when and how features were created
- **Access Control**: IAM permission control over Feature Group access

> 🔍 **Deeper Dive**: Feature Store can join multiple Feature Groups with temporal consistency. When building training data, join customer and product features by each one's event time, exactly combining values "knowable at that point." This point-in-time-correct join automates the tedious and error-prone manual future-leakage prevention.

> 📚 **Case Study**: A fintech company ran fraud detection and credit scoring models, both needing "recent transaction frequency." Initially, each team computed it separately; definitions differed subtly, and bug fixes in one team weren't reflected in the other. Defining this feature once in Feature Store and sharing it eliminated definition mismatches; fixing one place improved both models together.

## Data Flow Summary

Typical pipeline connects like this: ① Data Wrangler (or Processing Job) transforms raw data to features → ② ingest into Feature Store (online+offline simultaneously) → ③ training creates dataset from offline store via Athena → ④ inference queries online store via GetRecord. This entire flow shares identical feature definitions, maintaining consistency.

## Summary

Remember Feature Store in three axes: ① **Structure**: Feature Group (Record Identifier + Event Time) as unit. ② **Two stores**: Online (milliseconds, real-time inference, key-value) and offline (S3 Parquet, training, Athena bulk query). ③ **Value**: Prevent training/serving skew (training and inference share features) and enable reuse (team sharing, point-in-time-correct joins). In exams, the key mapping: "real-time low-latency feature queries" = online; "training bulk history" = offline.

Next, we examine whether prepared data is fair and balanced—data bias, quality, and SageMaker Clarify.

---

## 📝 연습 문제

**문제 1.** A real-time recommendation service must query latest features for a user in milliseconds every time they open a page. What's suitable in SageMaker Feature Store?

A) Query offline store via Athena  
B) Query online store with GetRecord to fetch latest record  
C) Download entire S3 Parquet file every time  
D) Full-scan Redshift table  

**정답: B**  
해설: Online store returns single latest feature via key-value in milliseconds, suitable for real-time inference queries. A/C are offline/batch with high latency, D is large-scale scan unsuitable for low-latency real-time demands.

---

**문제 2.** Training pipeline in Python and inference server in Java each calculated "average purchase amount last 30 days" with subtle differences degrading model performance. How to fundamentally solve?

A) Fix Java code more precisely  
B) Define feature once in Feature Store, store, and have training (offline) and inference (online) read from same repository  
C) Disable inference  
D) Make model larger  

**정답: B**  
해설: This is training/serving skew; Feature Store defines features once, centrally stored, so training and inference share identical values, preventing mismatches. A is temporary synchronizing two implementations, C abandons service, D unrelated to feature inconsistency.

---

**문제 3.** What must be specified when creating Feature Group and serves as the basis for reconstructing feature values at specific points in time?

A) Record Identifier and Event Time  
B) VPC and Subnet  
C) Instance type and count  
D) Learning rate and batch size  

**정답: A**  
해설: Feature Group requires Record Identifier for row identification and Event Time for value recording time; Event Time is the basis for point-in-time queries and future-leakage prevention. B is network setup, C computing resources, D hyperparameters—not Feature Group definition essentials.

---

**문제 4.** To build a training dataset, query entire feature history in Feature Store in bulk. Most suitable method?

A) Repeatedly call GetRecord on online store row-by-row  
B) Bulk query offline store (S3) via Athena  
C) Load entire online store into memory  
D) Delete and recreate Feature Group  

**정답: B**  
해설: Offline store keeps full history in S3 Parquet, allowing efficient bulk training dataset creation via Athena. A inefficiently repeats single queries, C not designed for offline bulk access, D destroys data.

---

**문제 5.** Two teams each created identical "customer activity score" feature with mismatched definitions and bug fixes reflecting only partially. Feature Store solution?

A) Teams meet more frequently  
B) Define feature once in Feature Store, share for reuse; single fix applies to all using models  
C) Merge two models  
D) Remove all features  

**정답: B**  
해설: Feature Store makes features shared data assets, enabling reuse and single definition so fixing one place consistently applies to all models using that feature. A doesn't solve fundamentally, C merges separate models wrongly, D discards needed features.

---
