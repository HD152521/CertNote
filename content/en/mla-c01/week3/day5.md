# Day 5 - Week 3 Comprehensive Review — Feature Engineering·Data Quality

This week covered the process of refining prepared data into a form that models can learn — feature engineering and data quality. It's the latter part of MLA-C01 Domain 1 and the stage that most significantly determines model performance. It's also the domain where ML's maxim "data over algorithm" shines most brightly.

Today we weave Data Wrangler·Feature Store·Clarify into a single flow and review them together. The three tools handle transformation·management·validation respectively, and when linked together, they form a pipeline "from raw data to a trustworthy training dataset".

## Feature Engineering Pipeline at a Glance

```
[raw data (S3)]
        │  ① Transform (Data Wrangler)
        │     Scaling·Encoding·Missing values·Outliers
        v
[Transformed features]
        │  ② Manage (Feature Store)
        │     Online (inference) + Offline (training) simultaneous storage
        v
[Feature Group]
        │  ③ Validate (Clarify)
        │     Bias·Imbalance·Explainability analysis
        v
[Validated training dataset] → SageMaker Training
```

The key point is that these three stages are connected by **consistency**. Data Wrangler defines the transformation, Feature Store supplies it identically to both training and inference, and Clarify guarantees data fairness.

> 💡 **Related Theory**: The statistic that data scientists spend 70–80% of their time on feature engineering is not an exaggeration. As Google's "Hidden Technical Debt in Machine Learning Systems" paper emphasizes, in actual ML systems, model code is a small part, while data collection, validation, feature extraction, and consistency maintenance account for most complexity and failure causes. All three tools this week are mechanisms to tame that data-side complexity.

## Four Major Feature Engineering Transformations (Day 1–2)

Here we review the core transformations that turn raw data into numbers the model can read.

| Transformation | When | Representative Techniques |
|---|---|---|
| Scaling | Numeric ranges vary widely | StandardScaler, MinMaxScaler |
| Encoding | Categorical (string) columns | One-Hot, Label, Target encoding |
| Missing value handling | Values are empty | Mean/median imputation, deletion |
| Outlier handling | Extreme values exist | Clipping, robust scaling |

The discrimination key is algorithm dependency. Distance/gradient-based algorithms (KNN, neural networks) require scaling, but tree-based algorithms (XGBoost) are insensitive to scale. Categorical features use One-Hot if order-agnostic, or consider Target encoding if cardinality is very high.

```python
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer

# Numeric: standardize, categorical: one-hot — bundle in one transformer
preprocessor = ColumnTransformer([
    ("num", StandardScaler(), ["age", "income"]),
    ("cat", OneHotEncoder(handle_unknown="ignore"), ["region"]),
])
X_train_t = preprocessor.fit_transform(X_train)
X_test_t = preprocessor.transform(X_test)   # test: transform only, not fit — prevents leakage
```

> ⚠️ **Pitfall**: Scalers and encoders are **only fit on train**, and only transform is applied to test. Fitting on test statistics leaks test information into training, causing data leakage. This principle applies equally to resampling like SMOTE.

## Data Wrangler (Day 2)

**SageMaker Data Wrangler** is a tool for visually importing, transforming, and analyzing data without code. It offers over 300 built-in transformations and data quality reports, and the created flow can be exported to Processing Job, Pipeline, or Feature Store.

- **Import**: Load data from S3, Athena, Redshift, etc.
- **Transform**: Apply missing value, encoding, scaling, etc. by clicking
- **Analyze**: Data quality, bias insights, quick visualization
- **Export**: Convert the transformation flow into reusable jobs

> 🔍 **Deeper Dive**: Data Wrangler's value doesn't end at "visual exploration"—it **exports those transformations as reproducible code**. Hand-coded transformations in notebooks are hard to reproduce at inference time, but Data Wrangler flows are exported as Processing Jobs to guarantee the same transformation in both training and inference. It's the bridge linking exploration and production.

## Feature Store (Day 3)

**SageMaker Feature Store** is a repository for centrally storing, reusing, and consistently serving features. Two stores are key.

| Aspect | Online Store | Offline Store |
|---|---|---|
| Purpose | Real-time inference | Training·batch |
| Latency | Milliseconds (key-value) | High (S3 Parquet) |
| Query | Latest single record (GetRecord) | Full history (Athena) |

The greatest value is **preventing training/serving skew**. Training and inference share the same feature definition, eliminating problems where the two compute slightly differently and performance collapses. The Feature Group (Record Identifier + Event Time) is the unit, and Event Time is the basis for point-in-time queries and preventing look-ahead leakage.

```python
# Training: bulk query offline store via Athena
query = feature_group.athena_query()
query.run(query_string="SELECT * FROM customer_features WHERE ...",
          output_location="s3://my-bucket/query-results/")

# Inference: query latest single feature from online store
record = featurestore_runtime.get_record(
    FeatureGroupName="customer-features",
    RecordIdentifierValueAsString="cust_12345",
)
```

## Clarify and Data Quality (Day 4)

**SageMaker Clarify** measures bias before and after training (sensitive attribute facet, CI·DPL metrics) and explains prediction feature importance via SHAP. Combined with data quality checks—class imbalance handling (SMOTE·class weight, applied only to training set after split), train/val/test split (stratified for imbalance, temporal for time series, test viewed only once)—a trustworthy dataset is complete.

> 💡 **Related Theory**: One word pierces this week: "leakage". Leakage from fitting on test, leakage from resampling before split, future leakage from using future values as features, look-ahead leakage from ignoring Feature Store's Event Time. Every leakage produces the same symptom: "good evaluation but deployment failure". Half of feature engineering and data quality is preventing leakage.

## Summary

Week 3's structure is **transform → manage → validate** pipeline. Apply the four transformations (scaling·encoding·missing·outliers) by fitting only on train, make them visual and reproducible with Data Wrangler, supply them consistently to training and inference via Feature Store (online/offline, skew prevention), and validate bias·imbalance·split with Clarify and data quality techniques. The common thread through all these processes is data leakage, and preventing it is the condition for a good training dataset.

Next week (Week 4) we begin full model training, tuning, and evaluation with the data we've prepared.

---

## 📝 Practice Questions

**Question 1.** A data scientist wants to import data from S3 and Athena with almost no coding, visually apply missing-value handling, encoding, and scaling, and export that transformation flow as a reproducible Processing Job. What is the most suitable tool?

A) Amazon Athena  
B) SageMaker Data Wrangler  
C) Amazon Kinesis  
D) AWS DMS  

**Answer: B**  
Explanation: Data Wrangler performs data import, transformation, and analysis visually without code and ensures reproducibility by exporting the flow to a Processing Job, Pipeline, or Feature Store. Athena (A) is a SQL query tool, Kinesis (C) is stream ingestion, and DMS (D) is database replication, none of which is for visual feature transformation.

---

**Question 2.** The training pipeline and the inference server each compute "average purchase amount over the last 30 days," and subtle differences degraded performance. Which service fundamentally prevents this by having both share the same feature definition?

A) Amazon Athena  
B) SageMaker Feature Store  
C) SageMaker Model Monitor  
D) AWS Glue Crawler  

**Answer: B**  
Explanation: Feature Store defines and stores a feature once so that training (offline) and inference (online) share the same values, eliminating training/serving skew at the source. Athena (A) is for queries, Model Monitor (C) detects post-deployment drift, and Glue Crawler (D) infers schemas, so their purposes differ from guaranteeing feature consistency.

---

**Question 3.** When applying StandardScaler to numeric features, what is the correct way to prevent data leakage?

A) Fit on train and test together  
B) Fit on train only and apply only transform to test  
C) Fit on test and transform train  
D) Fit anew every time  

**Answer: B**  
Explanation: The scaler must be fit only with the statistics (mean and standard deviation) of the train data and then only transform test with them, which prevents test information from leaking into training. Fitting on everything (A) or fitting on test (C) causes leakage, and fitting anew every time (D) makes the train/test transformation basis differ.

---

**Question 4.** Which of the following is correct about the analysis SageMaker Clarify performs before training (pre-training)?

A) Measures endpoint latency  
B) Measures data bias between groups (CI, DPL, etc.) based on a sensitive attribute (facet)  
C) Deploys the model automatically  
D) Calculates instance costs  

**Answer: B**  
Explanation: Clarify's pre-training analysis specifies a sensitive attribute (facet) such as gender or race and measures data bias metrics such as sample imbalance between groups (Class Imbalance) and the difference in positive label proportions (DPL). Measuring latency (A) or cost (D) and automatic deployment (C) are not Clarify's bias analysis features.

---

**Question 5.** Across this week, what is the most appropriate common cause of the problem where "evaluation looks good but performance collapses at deployment"?

A) The instance type is too small  
B) Data leakage (transformation leakage, resampling before splitting, using future values, etc.)  
C) The model has too few parameters  
D) The S3 bucket name is too long  

**Answer: B**  
Explanation: Data leakage, such as transformation leakage from fitting on test, resampling before splitting, and future leakage from using future values as features, all produce the same symptom of high performance in training and validation that collapses at deployment. Instance type (A), parameter count (C), and bucket name (D) are unrelated to the cause of this generalization failure.

---
