# Day 5 - Week 3 Comprehensive Review — Feature Engineering·Data Quality

## 📌 Key Takeaways

- The picture for Week 3 is a **transform (Data Wrangler) → manage (Feature Store) → validate (Clarify)** pipeline.
- The four major transformations are **scaling, encoding, missing values, and outliers**. Algorithm dependency (distance/gradient-based vs. tree-based) decides which one applies.
- Feature Store has two stores — **online (millisecond inference)** and **offline (S3 training history)**.
- With Clarify, you look at **pre-training bias (CI·DPL)** and **post-training explanation (SHAP)**.
- The one word that runs through this week is **leakage** — you must block transformation, synthetic, future, and evaluation leakage alike.

## Feature Engineering Pipeline at a Glance

This week covered the process of refining prepared data into a form that models can learn. It is the area where the ML maxim "data over algorithm" shows most clearly.

```
[raw data (S3)]
        │  ① Transform (Data Wrangler)
        │     Scaling·Encoding·Missing values·Outliers
        v
[Transformed features]
        │  ② Manage (Feature Store)
        │     Online (inference) + Offline (training) stored together
        v
[Feature Group]
        │  ③ Validate (Clarify)
        │     Bias·Imbalance·Explainability analysis
        v
[Validated training dataset] → SageMaker Training
```

The key point is that these three stages are connected by **consistency**. Feature Store supplies the transformations defined in Data Wrangler identically to both training and inference, and Clarify vouches for the fairness of that data.

| Stage | Tool | Problem it solves |
|------|------|-------------|
| Transform | Data Wrangler | Slow hand-coding and non-reproducibility |
| Manage | Feature Store | Duplicate feature building, training/serving skew |
| Validate | Clarify + quality techniques | Bias, imbalance, leakage |

The statistic that data scientists spend 70–80% of their time on feature engineering is not an exaggeration. As Google's "Hidden Technical Debt in Machine Learning Systems" paper emphasizes, in real ML systems the model code is a small part, while data collection, validation, feature extraction, and consistency maintenance account for most of the complexity and the causes of failure. All three tools this week are mechanisms for taming that data-side complexity.

## Four Major Feature Engineering Transformations (Day 1)

Here we review again the core transformations that turn raw data into numbers the model can read.

| Transformation | When | Representative Techniques | Decision Point |
|------|------|----------|------------|
| Scaling | Numeric ranges vary widely | StandardScaler, MinMaxScaler, RobustScaler | Required for distance/gradient-based algorithms, unnecessary for trees |
| Encoding | Categorical (string) columns | One-Hot, Ordinal, Target encoding | One-Hot if there is no order, Target if cardinality is high |
| Missing value handling | Values are empty | Mean/median/mode imputation, KNN, deletion | Median if outliers exist, add a flag if missingness itself carries meaning |
| Outlier handling | Extreme values exist | IQR·Z-score detection, clipping, log transform | Never remove them if they are what you are trying to detect |

The deciding criterion is algorithm dependency. Distance/gradient-based algorithms (KNN, neural networks, linear regression) require scaling, but tree-based algorithms (XGBoost, Random Forest) are insensitive to scale.

```python
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer

# Numeric: standardize, categorical: one-hot — bundle in one transformer
preprocessor = ColumnTransformer([
    ("num", StandardScaler(), ["age", "income"]),
    ("cat", OneHotEncoder(handle_unknown="ignore"), ["region"]),
])
X_train_t = preprocessor.fit_transform(X_train)
X_test_t = preprocessor.transform(X_test)   # test: transform only, no fit — prevents leakage
```

> ⚠️ **Pitfall**: Scalers and encoders are **fit only on train**, and only `transform` is applied to test. If you fit on test statistics, test information leaks into training and becomes data leakage. This principle applies equally to resampling such as SMOTE.

## Data Wrangler (Day 2)

**SageMaker Data Wrangler** is a tool for visually importing, transforming, and analyzing data without code. It provides over 300 built-in transformations and a data quality report, and the flow you build can be exported to a Processing Job, Pipeline, or Feature Store.

| Stage | Description |
|------|------|
| Import | Load from S3, Athena, Redshift, Snowflake, Feature Store |
| Transform | Apply 300+ built-in transformations (missing values, encoding, scaling, etc.) with clicks |
| Analyze | Data Quality report, Quick Model, Target Leakage, Bias, multicollinearity |
| Export | Processing Job, Feature Store, Pipelines, code, S3 |

The value of Data Wrangler does not end at "visual exploration" — it lies in **exporting those transformations as reproducible code**. Transformations hand-coded in a notebook are hard to reproduce at inference time, but a Data Wrangler flow can be exported as a Processing Job, guaranteeing the same transformation in training and inference. It is the bridge between exploration and production.

> ⚠️ **Pitfall**: The data you see on screen is a **sample**. To apply the flow to the full dataset, you must export the flow as a Processing Job and run it.

## Feature Store (Day 3)

**SageMaker Feature Store** is a repository for centrally storing, reusing, and consistently serving features. Two stores are the core.

| Aspect | Online Store | Offline Store |
|------|--------------|----------------|
| Purpose | Real-time inference | Training·batch |
| Latency | Milliseconds (key-value) | High (S3 Parquet) |
| Query | Latest single record (GetRecord) | Full history (Athena) |
| Cost | Relatively high | Cheap |

The greatest value is **preventing training/serving skew**. Training and inference share the same feature definition, which eliminates at the root the problem where the two compute things slightly differently and performance collapses. The Feature Group (Record Identifier + Event Time) is the unit, and Event Time is the basis for point-in-time queries and for preventing future leakage.

```python
# Training: bulk query of the offline store via Athena
query = feature_group.athena_query()
query.run(query_string="SELECT * FROM customer_features WHERE ...",
          output_location="s3://my-bucket/query-results/")

# Inference: fetch the latest single record from the online store
record = featurestore_runtime.get_record(
    FeatureGroupName="customer-features",
    RecordIdentifierValueAsString="cust_12345",
)
```

## Clarify and Data Quality (Day 4)

**SageMaker Clarify** measures bias before and after training (sensitive attribute facet, CI·DPL metrics) and explains the feature contributions to a prediction with SHAP. Adding data quality checks on top completes a trustworthy dataset.

| Check | Technique | Order to respect |
|----------|------|--------------|
| Bias | Clarify pre/post-training bias | Look at it first, before training |
| Explainability | SHAP feature contributions | After training |
| Class imbalance | SMOTE, class weight, under/oversampling | **Only on the training set, after the split** |
| Data split | Stratified (imbalance), temporal (time series) | Before resampling and transformation |
| Final evaluation | Test set | **Only once** |

The one word that runs through this week is "leakage". Fitting on test is transformation leakage, resampling before the split is synthetic leakage, using future values as features is future leakage, and ignoring Feature Store's Event Time is look-ahead leakage. Every leakage produces the same symptom: "evaluation looks good, but deployment fails". Half of feature engineering and data quality is preventing leakage.

## Leakage Types Summarized

| Leakage Type | When it occurs | Symptom | Prevention |
|----------|-----------|------|------|
| Transformation leakage | Fitting scaler/encoder on the entire data | Overestimated validation performance | Split first, fit only on train |
| Synthetic leakage | Resampling such as SMOTE before the split | Synthetic samples mixed into the test set | Only on the training set after the split |
| Target leakage | Using a feature that contains target information | Correlation of 0.99, useless at deployment | Target Leakage analysis, domain review |
| Future leakage | Using values from after the prediction time as features | Good only in backtests | Event Time, point-in-time joins |
| Evaluation leakage | Repeatedly tweaking the model using the test set | Distorted generalization estimate | Use the test set once, at the very end |

## Week 3 One-Line Checklist

| Question | Answer |
|------|-----|
| Does XGBoost need scaling? | No. Trees compare thresholds, so units don't matter |
| What if you encode city names as 0/1/2? | The model learns an order that doesn't exist. One-Hot is the standard |
| A column that is 40% missing? | Drop it or convert it to a "was missing" flag |
| Removing outliers in fraud detection? | That erases the very signal you want. Preserve them |
| Which store for millisecond feature lookup? | Online store GetRecord |
| Bulk retrieval for a training dataset? | Offline store + Athena |
| Measuring bias between genders before training? | Clarify pre-training bias (CI·DPL) |
| When is SMOTE applied? | After the train/test split, only on the training set |
| Splitting imbalanced data? | Stratified split (stratify) |
| Splitting time series data? | Split in time order. Random splitting is forbidden |

## Reviewing Week 3 with Scenarios

| Situation | Judgment | Rationale |
|------|------|------|
| In KNN, salary dominates the distance calculation | Apply scaling | Distance-based methods are sensitive to units |
| Wondering whether to scale for XGBoost performance | Unnecessary | Split threshold comparisons are unit-independent |
| Encoded city names as 0/1/2 and the linear model behaves strangely | Replace with One-Hot | It learned a non-existent order |
| Zip codes have thousands of values, so One-Hot is a burden | Target/frequency encoding, embeddings | Avoid dimension explosion |
| Income distribution has a long right tail | `log1p` transform | Improves fit for linear models |
| The area column contains 99999 | Check the data dictionary, then treat it as missing | Possible sentinel value |
| Fraudulent transactions are flagged as IQR outliers | Preserve them, do not remove | The outlier is the signal itself |
| Design preprocessing visually without code | Data Wrangler | GUI + 300+ transformations |
| Apply the designed transformation to hundreds of GB | Export as a Processing Job | The screen shows only a sample |
| "Last login date" has abnormally high predictive power | Suspect Target Leakage | Information from the target time is mixed in |
| The inference server computes features separately and performance drops | Unify definitions with Feature Store | training/serving skew |
| Need a user's latest features in real time | Online store GetRecord | Millisecond single-record lookup |
| Need the full history for a training set | Offline store + Athena | Bulk history retrieval |
| Check gender fairness of a loan model | Clarify pre-training bias | CI·DPL measurement |
| Must explain why an application was rejected | SHAP feature contributions | Explanation requirement in regulated industries |
| Want to grow the minority class in 0.2% fraud data | SMOTE only on the training set after the split | Prevent synthetic leakage |
| About to split time series data | Split in time order | Random splitting causes future leakage |
| Validation accuracy 99% but it collapses in deployment | Audit the whole leakage family | The common symptom of this week |

## Linking Transform, Manage, and Validate Together

```
[raw]
  │  Data Wrangler flow (design)
  │      └─ export → Processing Job (apply to full data)
  v
[features]
  │  Feature Store ingest
  │      ├─ offline → training set (Athena, point-in-time)
  │      └─ online  → inference (GetRecord)
  v
[validation]
  │  Clarify: pre-training bias (CI·DPL) / post-training SHAP
  │  Quality: imbalance handling (after split), stratified·temporal split, test once
  v
[Trustworthy training dataset]
```

If any single arrow in this picture is broken by hand-coding, reproducibility and consistency collapse together. "Preprocessing that only works in a notebook" will inevitably cause problems at deployment time. On the exam, when you see phrases such as "reproducibly" or "identical in training and inference", the answer points toward export, Feature Store, and Pipelines.

## Week 3 in One Sentence

**"Fit only on train, split first of all, define features in one place so training and inference read from it together, and measure bias before you build."**

| Principle | If violated |
|------|-------|
| Split first of all | Transformation·synthetic leakage |
| Fit only on train | Overestimated validation performance |
| Feature definitions in one place | training/serving skew |
| Join by Event Time | Future leakage |
| Test set only once | Distorted generalization estimate |
| Measure bias before training | Automating and amplifying unfairness |
| Keep the evaluation set at the production distribution | Metrics unrelated to reality |

## Check Before Moving to Week 4

| Question | What you should be able to answer |
|------|------------------|
| Which models require scaling? | Distance/gradient-based. Tree families do not |
| How do you handle high-cardinality categories? | Target·frequency encoding or embeddings |
| What is the difference between Feature Store's two stores? | Online = millisecond single records, offline = S3 history |
| When do you measure bias? | Both before training (data) and after training (predictions) |
| What is the first action to prevent leakage? | Splitting the data before anything else |

Next week (Week 4) we move into full-scale model training, tuning, and evaluation with the data prepared this way.

## 📖 Glossary

- **Feature engineering**: The whole task of converting raw data into numeric representations a model can learn from.
- **ColumnTransformer**: A pipeline tool that applies different transformations to numeric and categorical columns at once.
- **handle_unknown="ignore"**: An encoder option that handles a new category not seen during training as zeros without raising an error.
- **flow**: A blueprint in Data Wrangler that fixes the order of transformations. The key to reproducibility.
- **Feature Group**: The storage unit of Feature Store. Record Identifier and Event Time are required.
- **Event Time**: The time at which a feature value was recorded. The basis for reconstructing past points in time and preventing future leakage.
- **training/serving skew**: The phenomenon where feature computation differs between training and inference, so the model silently gets worse.
- **facet (sensitive attribute)**: A column whose fairness must be examined. The reference axis for Clarify bias analysis.
- **CI / DPL**: Bias metrics measuring the imbalance in sample counts between groups / the difference in positive-label proportions between groups.
- **SHAP**: An explanation metric computed by fairly distributing each feature's share of contribution to a prediction.

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
