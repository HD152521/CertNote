# Day 1 - Domains 1 and 2 Integrated Review: Data Preparation + Model Development

## 📌 Key Takeaways

- Domain 1 (Data Preparation 28%) + Domain 2 (Model Development 26%) = **54%** of the exam. Being solid on these two is the foundation of passing.
- One axis connecting the two domains is **reproducibility and consistency** — the features used in training must be used identically at inference (to prevent skew), and bias and leakage are caught at the data stage.
- Data: real-time → Kinesis, storage → S3, ETL → Glue, visual preparation → Data Wrangler, querying → Athena, feature consistency → Feature Store, bias and explainability → Clarify.
- Models: mapping problem type → built-in algorithm is the most frequently tested (time series DeepAR, anomaly RCF, tabular XGBoost, recommendation FM, text BlazingText).
- Evaluation metrics are determined by **whether the data is imbalanced and by the asymmetry of error costs**. On imbalanced data, Accuracy easily becomes the wrong answer.

## The Whole Map of Domains 1 and 2

This is the first day of the last week. It's not new concepts; we regroup scattered knowledge into a form you can pull out in the exam room.

```text
[Domain 1 — Data Preparation 28%]
  Ingestion          Storage           Preparation/Transformation   Feature management
  ─────              ─────             ──────────               ──────────
  Kinesis DS   ─┐                      Data Wrangler (visual)     Feature Store
  Firehose     ─┼─▶  S3 (data lake) ─▶ Processing Job (code)  ─▶  ├ Online : low-latency single record
  Batch upload ─┘    + Glue Catalog     Glue ETL / EMR (Spark)      └ Offline: S3, bulk
  Ground Truth        (schema/meta)      Athena (ad-hoc SQL)            │
  (labeling)                               Clarify (pre-training bias check)          │
                                                                         ▼
[Domain 2 — Model Development 26%]                                          Training data
  Train ───────────▶  Tune ───────────▶  Evaluate ───────────▶  Model artifact
  Training Job        AMT                 Choose metrics            model.tar.gz (S3)
  Built-in/framework  Bayesian·Random     Accuracy·F1·AUC             │
  /custom container   Grid·Hyperband      RMSE·MAE·R²                 ▼
  File/Pipe/FastFile  objective_metric    Clarify (post-training bias)    Model Registry
  Spot + checkpoints  Debugger (overfitting/bottleneck rules)                  (→ Domain 3)
```

The horizontal axis of this map is "the order in which data becomes a model," and the vertical axis is "who is responsible for that stage." Exam questions almost always point to one spot on this map. If you first mark "which box is this story about" while reading the scenario, half of the four options are services from other boxes and get eliminated immediately.

## Domain 1: Ingestion and Storage — Service Map

First, let's organize where data comes from and where it accumulates.

| Requirement | AWS service |
|----------|------------|
| Real-time stream ingestion | Kinesis Data Streams / Firehose |
| Bulk batch loading (data lake) | S3 |
| Serverless ETL and catalog | AWS Glue (+ Glue Data Catalog) |
| Visual data preparation (no code) | SageMaker Data Wrangler |
| Interactive analytic queries (directly on S3) | Amazon Athena |
| Distributed big data processing | EMR (Spark) |
| Humans must label the data | SageMaker Ground Truth |
| Structured data warehouse analytics | Amazon Redshift |

The exam separates services by "real-time or batch," "write code or do it visually," and "where to store it." Real-time events mean Kinesis, transformation after loading means Glue, visual preprocessing and quick EDA means Data Wrangler, and ad-hoc SQL on S3 means Athena. The center of a data lake is almost always S3, and the rest share the roles of ingestion, transformation, and querying around it.

## Domain 1: Choosing Preparation and Transformation Tools

Even the same "preprocessing" splits across tools. This distinction becomes the clue in a question.

| Tool | Nature | When to choose it |
|------|------|-------------|
| Data Wrangler | Explore, clean, and transform in a visual UI; export the flow as a pipeline | Quick EDA and preprocessing with almost no code |
| Processing Job | Run your own script (sklearn/Spark, etc.) on managed instances | Running custom preprocessing/evaluation code reproducibly |
| Glue ETL | Serverless Spark, integrated with the catalog | Regular ETL of a data-engineering nature |
| EMR (Spark) | Large-scale distributed processing where you handle the cluster yourself | Fine-grained tuning or existing Spark assets |
| Athena | Query S3 with SQL (serverless) | Ad-hoc querying and sampling without moving data |

> ⚠️ **Pitfall**: When it says "visually, writing almost no code," it's Data Wrangler; "run my own preprocessing script as managed," it's Processing Job. Options that flip the two are easy to use as wrong answers. Data Wrangler and Processing Job are not opposed — **exporting a Data Wrangler flow to a Processing Job and putting it in a pipeline** is the standard combination.

## Domain 1: Feature Engineering Checklist

| Situation | Technique |
|------|------|
| Numeric scales all differ | Normalization (Min-Max) / standardization (Z-score) |
| Categorical variables | One-hot encoding (no order) / label or ordinal encoding (ordered) |
| Missing values | Delete / impute with mean, median, or mode / add a missing-indicator flag |
| Class imbalance | Oversampling (SMOTE, etc.) · undersampling · class weights (XGBoost `scale_pos_weight`) |
| Extreme values (outliers), highly skewed distributions | Clipping / log or square-root transform / binning |
| Text | Tokenization → BoW·TF-IDF → embeddings (BlazingText, etc.) |
| High-dimensional sparse | Dimensionality reduction with PCA, or embeddings |

> ⚠️ **Pitfall**: **Data leakage** quietly inflates performance. Two representative cases. ① If you **compute the scaler or imputation values on the whole dataset** and then split into train/validation, validation information leaks into training — always fit on the training set and only transform the validation set. ② If you **shuffle a time series randomly and split it**, the future teaches the past — a time series must always be split in chronological order.

## Domain 1: Feature Store — Online vs Offline

Feature Store is a central repository where you define a feature once so that training and inference use it together.

| Category | Online store | Offline store |
|------|---------------|-----------------|
| Purpose | Single-record lookup for real-time inference | Bulk lookup for training and batch |
| Latency | Low latency in milliseconds | Not low (analytical) |
| Storage | Mostly the latest values | History accumulated in S3 |
| How to query | Runtime API, single record via `GetRecord` | SQL query via Athena/Glue |
| Representative scenario | Instantly look up customer features at payment time | Build a training dataset as of a past point in time |

```python
import boto3

# Online store: single-record lookup right before real-time inference
fs_runtime = boto3.client('sagemaker-featurestore-runtime')
resp = fs_runtime.get_record(
    FeatureGroupName='customer-features',
    RecordIdentifierValueAsString='C-10293',
)
# The offline store accumulates in S3, so query it with SQL via Athena to build a training dataset
```

The reason Feature Store exists is **eliminating training-serving skew**. If the features computed at training time and those computed at inference time differ subtly, performance quietly drops. If you define and version features in one place and both online and offline share the same definition, this mismatch disappears. When keywords like "multiple teams and models reuse the same features" or "match training and real-time inference features" appear, it's Feature Store.

## Domain 1: SageMaker Clarify — Bias and Explainability

Clarify does two things. ① **Bias detection** — it measures bias in the data before training and bias in the model after training. ② **Explainability** — it shows with SHAP values how much each feature contributed to a prediction.

| When | Phrasing in the question |
|------|--------------------|
| Pre-training | "Is the training data skewed toward a particular group?" |
| Post-training | "Are the prediction results fair across groups?" |
| Explanation (SHAP) | "Which features produced this prediction?" |

Bias is examined at two points. **Pre-training** bias measures the imbalance of the data itself (for example, too few samples of a particular group), and **post-training** bias measures whether the model's predictions come out differently by group. "Check fairness, bias, discrimination" is Clarify; "explain the basis of predictions / feature contribution" is Clarify's SHAP. At the monitoring stage, Model Monitor works with Clarify to watch for bias and feature-attribution drift in production.

## Domain 2: Built-in Algorithms → Problem Type Mapping

Model development is "which algorithm, and how do you train it." The representative mapping of built-in algorithms is as follows.

| Problem type | Representative algorithm | Decisive keyword |
|-----------|---------------|---------------|
| Tabular classification/regression | XGBoost, Linear Learner | Structured table, column-based |
| Image classification / object detection | Image Classification, Object Detection | Photos, bounding boxes |
| Text classification / embeddings | BlazingText | Document classification, word vectors |
| Time series forecasting | DeepAR | Demand for the next N days, multiple related time series |
| Clustering | K-Means | No labels, customer segments |
| Dimensionality reduction | PCA | Too many features |
| Anomaly detection | Random Cut Forest (RCF) | Stream outliers, unlabeled abnormalities |
| Recommendation (sparse interactions) | Factorization Machines | User × item sparse matrix |

They ask about algorithm mapping. Choosing regression for "multivariate time series forecasting" is wrong — it's DeepAR. "Real-time stream outliers" is RCF, and "sparse recommendation with thousands of dimensions" is Factorization Machines. They also ask about the training data input mode. If the data is larger than the instance disk or you want to reduce startup delay, stream from S3 in **Pipe mode** (or the newer **Fast File mode**); if the data is small, copy it all in **File mode**.

## Domain 2: Training Infrastructure — Input Mode, Instances, Spot

| Axis | Choices | Selection criterion |
|----|--------|-------------|
| Input mode | File / Pipe / Fast File | Does the data fit on disk, or must startup delay be reduced |
| Storage | S3 / FSx for Lustre / EFS | FSx if reading large data repeatedly every epoch |
| Instance | CPU (m5·c5) / GPU (g5·p4) | CPU for traditional ML, GPU for deep learning |
| Distribution | Data parallel / model parallel | Slow due to lots of data / the model doesn't fit on a GPU |
| Cost | On-demand / Managed Spot | Spot if interruption is tolerable and the deadline has slack |

Spot must always be **paired with checkpoints**. Turning on Spot without `checkpoint_s3_uri` retrains from scratch every time it's reclaimed, which actually loses money. And `max_wait >= max_run` must hold — because Spot needs extra time to wait for capacity. "I switched to GPU but it didn't get faster" is usually a case where **I/O is the bottleneck** rather than compute, and an option that attaches a GPU to a tree-based algorithm (XGBoost) is a trap.

## Domain 2: Hyperparameter Tuning (AMT)

SageMaker Automatic Model Tuning (AMT) automates the hyperparameter search.

| Strategy | Nature | Keyword |
|------|------|--------|
| Bayesian | Picks the next candidate smartly using past results (default recommendation) | "Efficiently with few trials" |
| Random | Random sampling, easy to parallelize | "Search broadly in parallel" |
| Grid | Exhaustive search of a discrete space | "Few, discrete candidates" |
| Hyperband | Terminates hopeless training early | "Save resources, early stopping" |

```python
from sagemaker.tuner import HyperparameterTuner, IntegerParameter, ContinuousParameter

tuner = HyperparameterTuner(
    estimator=estimator,
    objective_metric_name='validation:auc',   # metric to optimize
    objective_type='Maximize',
    hyperparameter_ranges={
        'max_depth': IntegerParameter(3, 10),
        'eta': ContinuousParameter(0.01, 0.3),
    },
    max_jobs=30,            # total number of training attempts
    max_parallel_jobs=3,    # concurrent runs (smaller is better for Bayesian)
    strategy='Bayesian',
)
tuner.fit({'train': train_input, 'validation': val_input})
```

Choosing a tuning strategy is "budget efficiency vs parallelism." Bayesian finds good values with few trials, but it refers to earlier results, so its advantage shrinks if you make the parallelism too large; Random/Grid are easy to parallelize but inefficient; and Hyperband cuts hopeless training early to reduce the cost of large-scale searches. "Efficient search with few training runs" is Bayesian, and "save resources via early stopping" is Hyperband as the keyword.

## Domain 2: Evaluation — Choosing the Right Metric

Metric selection is almost always decided by "is the data imbalanced, and what do you weigh more."

| Situation | Metric |
|------|------|
| Balanced classification | Accuracy |
| Imbalanced classification, overall performance | F1, AUC-ROC |
| False-positive cost is high (spam misclassification) | Emphasize Precision |
| False-negative cost is high (missing a disease) | Emphasize Recall |
| Regression | RMSE, MAE, R² |
| Regression where you need to be more sensitive to large errors | RMSE (squared, so it weights large errors) |
| Regression where you want to reduce the impact of outliers | MAE |
| Clustering (no labels) | Unsupervised quality metrics such as within-cluster distance |

Choosing Accuracy on imbalanced data is wrong. In fraud detection where 99% are normal, predicting "all normal" gives 99% accuracy but catches no fraud at all. Such scenarios must be evaluated with F1, AUC, and Recall. "Must not miss fraud/disease" is **Recall**, and "false-alarm cost is high" is **Precision** as the keyword. Signs of overfitting (training accuracy ↑, validation accuracy ↓) are handled with regularization, dropout, early stopping, and data augmentation.

## Easily Confused Pairs in Domains 1 and 2

| Confusing pair | The one-line divider |
|----------|---------------|
| Data Wrangler vs Processing Job | Visual, no code / run my script as managed |
| Feature Store online vs offline | Low-latency single record (real-time inference) / S3 bulk (training, batch) |
| Clarify vs Debugger | Bias and explainability / debugging tensors and resources during training |
| Data parallel vs model parallel | Split the data / split the model |

## Symptom → Cause → Action

| Symptom | Common cause | Action |
|------|-----------|------|
| Validation performance is much lower than training | Overfitting | Regularization, early stopping, dropout, data augmentation, simplify the model |
| Validation performance is unrealistically high | Data leakage | Check whether scaling/imputation was done before the split and for features that hint at the answer |
| Accuracy is high but the minority class isn't caught | Imbalance + wrong metric | Evaluate with F1, AUC, Recall; apply resampling and class weights |
| Long wait until training starts | File mode downloading all the large data | Pipe / Fast File; FSx for Lustre if repeated reads are heavy |
| Spot training restarts from scratch every time | Checkpoints not set or no resume logic | Specify `checkpoint_s3_uri` + implement resume in the script |
| Real-time inference results differ from offline evaluation | training-serving skew | Unify preprocessing with Feature Store or an inference pipeline |

Tomorrow we'll group Domains 3 and 4 — deployment and orchestration, and monitoring and security — the same way.

## 📖 Glossary

- **Domain weighting**: The proportions in which MLA-C01 is tested: Data Preparation 28%, Model Development 26%, Deployment 22%, Monitoring and Security 24%. Domains 1 and 2 are over half.
- **training-serving skew**: The phenomenon where features built at training time and at inference time differ subtly, so performance quietly drops.
- **Feature Store online/offline store**: A low-latency single-record lookup store for real-time inference / an S3-based bulk lookup store for training and batch.
- **Data leakage**: Information that shouldn't be learned (validation data statistics, future values, columns hinting at the answer) leaking into training so that performance is overestimated.
- **Processing Job**: A job that runs your preprocessing/evaluation script on SageMaker managed instances. The instance shuts down when it finishes.
- **SHAP**: An explanation technique that shows numerically how much each feature contributed to an individual prediction. Clarify computes this for you.
- **Pre-training bias / post-training bias**: Whether the data itself is skewed toward a particular group / whether model predictions come out differently by group.
- **AMT (Automatic Model Tuning)**: A SageMaker feature that trains multiple times with different hyperparameter combinations automatically to find the optimum. The `objective_metric` being optimized must be emitted to the training logs for the tuner to read it.
- **Imbalanced data**: Data where one class is overwhelmingly more numerous. Accuracy becomes meaningless and F1, AUC, and Recall become necessary.

---

## 📝 Practice Questions

**Question 1.** A team uses the same customer features (recent purchase amount, membership duration, etc.) in both a real-time recommendation model and a nightly batch churn prediction model. They want to prevent feature mismatch (skew) between training and inference and reuse the features. What is most appropriate?

A) Each model maintains its own separate preprocessing code  
B) SageMaker Feature Store (online + offline stores)  
C) Save a fresh CSV to S3 every time  
D) Recompute the features with an Athena query on every call  

**Answer: B**  
Explanation: Feature Store lets you define a feature once so the online store (low-latency real-time inference) and the offline store (bulk training and batch) share the same definition, which eliminates training-serving skew and enables feature reuse. A increases mismatch through duplicated code, C has no version or consistency management, and D recomputes on every call so it can't meet the real-time low-latency requirement.

---

**Question 2.** Before deploying a credit-scoring model, you want to check that predictions aren't unfairly skewed against particular gender and age groups, and also explain how much each feature contributed to individual predictions. What is the most appropriate tool?

A) SageMaker Model Monitor  
B) SageMaker Clarify  
C) SageMaker Debugger  
D) CloudWatch Logs  

**Answer: B**  
Explanation: Clarify measures fairness across groups with pre-training and post-training bias metrics and explains predictions with SHAP-based feature attribution, so it meets both requirements. A's main purpose is monitoring data and quality drift in production, C is for debugging tensors and resources during training, and D is simple log collection and provides no bias or explainability analysis.

---

**Question 3.** You built a classification model with data where 99.5% are normal transactions and only 0.5% are fraud. Which combination of metrics most appropriately evaluates the model's performance?

A) Accuracy alone  
B) F1 score and AUC-ROC, plus Recall for fraud detection  
C) RMSE  
D) R² coefficient of determination  

**Answer: B**  
Explanation: On extremely imbalanced data, Accuracy reaches 99.5% just by predicting "all normal," so it doesn't reflect fraud detection ability at all; evaluate with F1 and AUC, which are robust to imbalance, and with Recall, which catches the missed fraud. A is misleading under imbalance, and C and D are regression metrics and thus unsuitable for evaluating classification performance.

---

**Question 4.** The training dataset is much larger than a single instance's local disk capacity, and copying all of it at training start causes a large delay. What is the most appropriate improvement?

A) Copy all the data to the instance in File mode  
B) Stream input from S3 in Pipe mode (or Fast File mode)  
C) Use only a random 1% of the data for training  
D) Replace it with a smaller instance  

**Answer: B**  
Explanation: Pipe mode (and Fast File mode) streams data from S3 without copying it all, so it solves both the large data exceeding disk capacity and the startup delay at once. A causes exactly that copy delay, C throws away data and degrades performance, and D worsens the capacity problem.

---

**Question 5.** Within a limited training budget, you want to find a good hyperparameter combination with as few training trials as possible. What is the most appropriate strategy in SageMaker AMT?

A) Grid Search  
B) Bayesian optimization  
C) Try one by one manually  
D) Search all combinations randomly without limit  

**Answer: B**  
Explanation: Bayesian optimization uses the results of previous trials to explore promising candidates first, so it is the most efficient at finding a good combination with few training runs. A is an exhaustive search of a discrete space and so takes many trials, C is inefficient and non-reproducible, and D is inefficient, the opposite of the budget constraint.

---
