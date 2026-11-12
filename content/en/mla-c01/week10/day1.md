# Day 1 - Domains 1 & 2 Integrated Review: Data Preparation + Model Development

## 📌 Key Takeaways

- Domain 1 (data preparation, 28%) + Domain 2 (model development, 26%) = **54%** of the exam. The stability of these two is the foundation of passing.
- One axis linking the two domains is **reproducibility and consistency** — features used in training must be used identically in inference (to prevent skew), and bias and leakage are caught at the data stage.
- Data: real-time → Kinesis, storage → S3, ETL → Glue, visual preparation → Data Wrangler, querying → Athena, feature consistency → Feature Store, bias and explanation → Clarify.
- Models: mapping problem type → built-in algorithm is the most frequently tested (time series DeepAR, anomalies RCF, tabular XGBoost, recommendation FM, text BlazingText).
- The evaluation metric is determined by **whether the data is imbalanced and by the asymmetry of error costs**. On imbalanced data, Accuracy tends to be the wrong answer.

## The Full Map of Domains 1 & 2

It is the first day of the final week. Instead of new concepts, we regroup scattered knowledge into a form you can pull out in the exam room.

```text
[Domain 1 — Data Preparation 28%]
  Ingest             Store              Prepare·Transform         Feature management
  ─────              ─────              ──────────                ──────────
  Kinesis DS   ─┐                       Data Wrangler (visual)    Feature Store
  Firehose     ─┼─▶  S3 (data lake) ─▶  Processing Job (code) ─▶  ├ Online : low-latency single record
  Batch upload ─┘    + Glue Catalog     Glue ETL / EMR (Spark)    └ Offline: S3, bulk
  Ground Truth        (schema·metadata) Athena (ad hoc SQL)             │
  (labeling)                            Clarify (pre-training bias)     │
                                                                        ▼
[Domain 2 — Model Development 26%]                                  Training data
  Train  ───────────▶  Tune  ───────────▶  Evaluate  ───────────▶  Model artifact
  Training Job         AMT                 Pick metric             model.tar.gz (S3)
  Built-in/framework   Bayesian·Random     Accuracy·F1·AUC                │
  /custom container    Grid·Hyperband      RMSE·MAE·R²                    ▼
  File/Pipe/FastFile   objective_metric    Clarify (post-training bias)  Model Registry
  Spot + checkpoints   Debugger (overfitting·bottleneck rules)          (→ Domain 3)
```

The horizontal axis of this map is "the order in which data becomes a model," and the vertical axis is "who is responsible for that stage." Exam questions almost always point to one spot on this map. If you first pin down "which box is this scenario about" while reading it, half of the four options are services from other boxes and are eliminated immediately.

## Domain 1: Ingestion·Storage — Service Map

First, sort out where data comes from and where it accumulates.

| Requirement | AWS service |
|-------------|-------------|
| Real-time stream ingestion | Kinesis Data Streams / Firehose |
| Bulk batch loading (data lake) | S3 |
| Serverless ETL·catalog | AWS Glue (+ Glue Data Catalog) |
| Visual data preparation (no code) | SageMaker Data Wrangler |
| Interactive analytical queries (directly on S3) | Amazon Athena |
| Distributed big data processing | EMR (Spark) |
| Humans must attach labels | SageMaker Ground Truth |
| Structured data warehouse analytics | Amazon Redshift |

The exam separates services by "real-time or batch," "write code or work visually," and "where to store." Real-time events mean Kinesis, transforming after loading means Glue, visual preprocessing and fast EDA mean Data Wrangler, and ad hoc SQL queries over S3 mean Athena. The center of a data lake is almost always S3, and the others divide the roles of ingestion, transformation, and querying around it.

## Domain 1: Choosing Preparation·Transformation Tools

Even for the same "preprocessing," the tools differ. This distinction becomes the clue in a question.

| Tool | Nature | When to choose it |
|------|--------|-------------------|
| Data Wrangler | Explore, clean, and transform in a visual UI, export the flow as a pipeline | When you want to do EDA and preprocessing quickly with almost no code |
| Processing Job | Runs your script (sklearn/Spark, etc.) on managed instances | When running custom preprocessing and evaluation code reproducibly |
| Glue ETL | Serverless Spark, integrated with the catalog | Regular ETL of a data engineering nature |
| EMR (Spark) | Large-scale distributed processing where you manage the cluster yourself | When you need fine-grained tuning or have existing Spark assets |
| Athena | Query S3 with SQL (serverless) | Ad hoc queries and sampling without moving the data |

> ⚠️ **Gotcha**: If the question says "visually, with almost no code," it is Data Wrangler; if it says "run my own preprocessing script as a managed job," it is Processing Job. Options that swap the two are easily used as wrong answers. Data Wrangler and Processing Job are not opposites — the standard combination is to **export a Data Wrangler flow to a Processing Job and put it in a pipeline**.

## Domain 1: Feature Engineering Checklist

| Situation | Technique |
|-----------|-----------|
| Numeric scales differ widely | Normalization (Min-Max) / standardization (Z-score) |
| Categorical variables | One-hot encoding (no order) / label·ordinal encoding (with order) |
| Missing values | Drop / mean·median·mode imputation / add a missing-indicator flag |
| Class imbalance | Oversampling (SMOTE, etc.) · undersampling · class weights (XGBoost `scale_pos_weight`) |
| Extreme values (outliers)·heavily skewed distributions | Clipping / log·square-root transform / binning |
| Text | Tokenization → BoW·TF-IDF → embeddings (BlazingText, etc.) |
| High-dimensional sparse | Dimensionality reduction with PCA, or embeddings |

> ⚠️ **Gotcha**: **Data leakage** quietly inflates performance. Two typical cases. ① If you split into training/validation **after computing** scalers or imputation values **on the entire dataset**, validation information leaks into training — always fit on the training set and only transform the validation set. ② If you **shuffle a time series randomly and split it**, the future teaches the past — a time series must always be split in time order.

## Domain 1: Feature Store — Online vs. Offline

Feature Store is a central repository that lets you define a feature once so that training and inference use it together.

| Aspect | Online store | Offline store |
|--------|--------------|---------------|
| Purpose | Single-record lookup for real-time inference | Bulk lookup for training·batch |
| Latency | Low latency, in milliseconds | Not low (analytical) |
| Storage | Mostly the latest values | History accumulated in S3 |
| How to query | Runtime API, a single record via `GetRecord` | SQL via Athena·Glue |
| Typical scenario | Instantly look up customer features at payment time | Build a training dataset as of a past point in time |

```python
import boto3

# Online store: single-record lookup right before real-time inference
fs_runtime = boto3.client('sagemaker-featurestore-runtime')
resp = fs_runtime.get_record(
    FeatureGroupName='customer-features',
    RecordIdentifierValueAsString='C-10293',
)
# The offline store accumulates in S3, so build the training dataset by querying it with SQL in Athena
```

The reason Feature Store exists is to **eliminate training-serving skew**. If the features computed at training time and those computed at inference time differ even slightly, performance quietly drops. If features are defined and versioned in one place and both online and offline share the same definition, this mismatch disappears. When keywords such as "multiple teams and models reuse the same features" or "match features between training and real-time inference" appear, it is Feature Store.

## Domain 1: SageMaker Clarify — Bias and Explainability

Clarify does two things. ① **Bias detection** — it measures data bias before training and model bias after training. ② **Explainability** — it uses SHAP values to show how much each feature contributed to a prediction.

| Timing | Phrasing that appears in questions |
|--------|------------------------------------|
| Pre-training | "Is the training data skewed toward a particular group?" |
| Post-training | "Are the prediction results fair across groups?" |
| Explanation (SHAP) | "Which features produced this prediction?" |

Bias is examined at two points. **Pre-training** bias measures imbalance in the data itself (e.g., too few samples from a particular group), and **post-training** bias measures whether model predictions come out differently by group. "Check fairness, bias, or discrimination" is Clarify, and "explain the basis of a prediction / feature contribution" is Clarify's SHAP. In the monitoring stage, Model Monitor works with Clarify to watch for bias and feature-attribution drift in production.

## Domain 2: Built-in Algorithm → Problem Type Mapping

Model development is "which algorithm, and how do you train it?" The representative mapping of built-in algorithms is as follows.

| Problem type | Representative algorithm | Decisive keywords |
|--------------|--------------------------|-------------------|
| Tabular classification/regression | XGBoost, Linear Learner | Structured tables, column-based |
| Image classification·object detection | Image Classification, Object Detection | Photos, bounding boxes |
| Text classification·embeddings | BlazingText | Document classification, word vectors |
| Time-series forecasting | DeepAR | Demand for the next N days, many related time series |
| Clustering | K-Means | No labels, customer segments |
| Dimensionality reduction | PCA | Too many features |
| Anomaly detection | Random Cut Forest (RCF) | Stream outliers, unlabeled abnormal data |
| Recommendation (sparse interactions) | Factorization Machines | User × item sparse matrix |

The exam asks about algorithm mapping. If you pick regression for "multivariate time-series forecasting," you are wrong — it is DeepAR. "Real-time stream outliers" is RCF, and "sparse recommendation with thousands of dimensions" is Factorization Machines. It also asks about the training data input mode. If the data is larger than the instance disk or you want to reduce startup delay, stream from S3 with **Pipe mode** (or the newer **Fast File mode**); for small data, copy it all with **File mode**.

## Domain 2: Training Infrastructure — Input Mode·Instances·Spot

| Axis | Options | Criterion for choosing |
|------|---------|------------------------|
| Input mode | File / Pipe / Fast File | Does the data fit on disk, and must startup delay be reduced |
| Storage | S3 / FSx for Lustre / EFS | FSx if large data is read repeatedly every epoch |
| Instance | CPU (m5·c5) / GPU (g5·p4) | CPU for traditional ML, GPU for deep learning |
| Distribution | Data parallel / model parallel | Slow because of lots of data / the model does not fit on the GPU |
| Cost | On-demand / Managed Spot | Spot if interruptions are tolerable and the deadline is flexible |

Spot must always be **paired with checkpoints**. If you turn on Spot without `checkpoint_s3_uri`, training restarts from scratch every time capacity is reclaimed, which is a net loss. And `max_wait >= max_run` must hold — because Spot needs extra time to wait for capacity. "I switched to a GPU but it is not faster" is usually a case where **I/O is the bottleneck**, not compute, and options that attach a GPU to a tree-based model (XGBoost) are traps.

## Domain 2: Hyperparameter Tuning (AMT)

SageMaker Automatic Model Tuning (AMT) automates hyperparameter search.

| Strategy | Nature | Keywords |
|----------|--------|----------|
| Bayesian | Picks the next candidate intelligently from past results (default recommendation) | "Efficiently with few attempts" |
| Random | Random sampling, easy to parallelize | "Search widely in parallel" |
| Grid | Exhaustive search of a discrete space | "A few discrete candidates" |
| Hyperband | Stops unpromising training early | "Save resources·early stopping" |

```python
from sagemaker.tuner import HyperparameterTuner, IntegerParameter, ContinuousParameter

tuner = HyperparameterTuner(
    estimator=estimator,
    objective_metric_name='validation:auc',   # Metric to optimize
    objective_type='Maximize',
    hyperparameter_ranges={
        'max_depth': IntegerParameter(3, 10),
        'eta': ContinuousParameter(0.01, 0.3),
    },
    max_jobs=30,            # Total number of training attempts
    max_parallel_jobs=3,    # Number running concurrently (keeping it small is better for Bayesian)
    strategy='Bayesian',
)
tuner.fit({'train': train_input, 'validation': val_input})
```

Choosing a tuning strategy is "budget efficiency vs. parallelism." Bayesian finds good values with few attempts, but because it refers to earlier results, making parallelism too large reduces its advantage; Random/Grid are easy to parallelize but inefficient; and Hyperband cuts off unpromising training early, reducing the cost of a large search. The keywords are: "efficient search with few training runs" is Bayesian, and "save resources through early stopping" is Hyperband.

## Domain 2: Evaluation — Choosing the Right Metric

Metric selection is almost always decided by "is the data imbalanced, and what do you care about more?"

| Situation | Metric |
|-----------|--------|
| Balanced classification | Accuracy |
| Imbalanced classification, overall performance | F1, AUC-ROC |
| False-positive cost is high (spam misclassification) | Prioritize Precision |
| False-negative cost is high (missing a disease) | Prioritize Recall |
| Regression | RMSE, MAE, R² |
| Regression where you must be more sensitive to large errors | RMSE (squaring weights large errors) |
| Regression where you want to reduce the influence of outliers | MAE |
| Clustering (no labels) | Unsupervised quality metrics such as within-cluster distance |

If you choose Accuracy on imbalanced data, you are wrong. In fraud detection where 99% is normal, guessing "all normal" gives 99% accuracy but catches no fraud at all. Such scenarios must be evaluated with F1, AUC, and Recall. "Must not miss fraud/disease" points to **Recall**, and "the cost of false positives (false alarms) is high" points to **Precision**. Signs of overfitting (training accuracy up, validation accuracy down) are handled with regularization, dropout, early stopping, and data augmentation.

## Domains 1 & 2 Commonly Confused Pairs

| Confusing pair | One-line differentiator |
|----------------|-------------------------|
| Data Wrangler vs Processing Job | Visual, no code / run my own script as a managed job |
| Feature Store online vs offline | Low-latency single record (real-time inference) / S3 bulk (training·batch) |
| Clarify vs Debugger | Bias·explainability / debugging tensors and resources during training |
| Data parallel vs model parallel | Split the data / split the model |

## Symptom → Cause → Action

| Symptom | Common cause | Action |
|---------|--------------|--------|
| Validation performance is much lower than training | Overfitting | Regularization, early stopping, dropout, data augmentation, simplify the model |
| Validation performance is unrealistically high | Data leakage | Check whether scaling/imputation happened before the split, and features that hint at the answer |
| Accuracy is high but the minority class is missed | Imbalance + wrong metric | Evaluate with F1·AUC·Recall, apply resampling·class weights |
| Long wait before training starts | File mode downloading all the large data | Pipe / Fast File, FSx for Lustre if repeated reads are heavy |
| Spot training restarts from scratch every time | Checkpoints not set or no resume logic | Specify `checkpoint_s3_uri` + implement resume in the script |
| Real-time inference results differ from offline evaluation | training-serving skew | Unify preprocessing with Feature Store or an inference pipeline |

Tomorrow we bundle Domains 3 and 4 — deployment·orchestration and monitoring·security — in the same way.

## 📖 Glossary

- **Domain weights**: The proportions in which MLA-C01 is tested: data preparation 28%, model development 26%, deployment 22%, monitoring·security 24%. Domains 1 and 2 together exceed half.
- **training-serving skew**: The phenomenon where features built at training time and features built at inference time differ subtly, quietly degrading performance.
- **Feature Store online/offline store**: A low-latency single-record lookup store for real-time inference / an S3-based bulk lookup store for training·batch.
- **Data leakage**: Information that should not be learned (validation data statistics, future values, columns that hint at the answer) leaking into training and causing performance to be overestimated.
- **Processing Job**: A job that runs your own preprocessing·evaluation script on SageMaker managed instances. The instance shuts down when it finishes.
- **SHAP**: An explanation technique that shows numerically how much each feature contributed to an individual prediction. Clarify computes it for you.
- **Pre-training bias / post-training bias**: Whether the data itself is skewed toward a particular group / whether model predictions come out differently by group.
- **AMT (Automatic Model Tuning)**: A SageMaker feature that automatically trains many times with hyperparameter combinations to find the best values. The `objective_metric` being optimized must be emitted in the training logs so the tuner can read it.
- **Imbalanced data**: Data in which one class is overwhelmingly numerous. Accuracy becomes meaningless and F1·AUC·Recall become necessary.

---

## 📝 Practice Questions

**Question 1.** A team uses the same customer features (recent purchase amount, tenure, etc.) in both a real-time recommendation model and a nightly batch churn prediction model. They want to prevent skew between training and inference and reuse the features. Which is the most appropriate solution?

A) Each model maintains its own separate preprocessing code  
B) SageMaker Feature Store (online + offline stores)  
C) Save a fresh CSV to S3 every time  
D) Recompute the features with an Athena query on every call  

**Answer: B**  
Explanation: Feature Store lets you define a feature once so that the online store (low-latency real-time inference) and the offline store (bulk training and batch) share the same definition, which eliminates training-serving skew and enables feature reuse. A duplicates code and increases inconsistency, C has no version or consistency management, and D recomputes on every call and cannot meet the real-time low-latency requirement.

---

**Question 2.** Before deploying a credit-scoring model, you want to check whether predictions are unfairly biased against specific gender and age groups, and also explain how much each feature contributed to individual predictions. Which tool is the most appropriate?

A) SageMaker Model Monitor  
B) SageMaker Clarify  
C) SageMaker Debugger  
D) CloudWatch Logs  

**Answer: B**  
Explanation: Clarify measures fairness across groups with pre-training and post-training bias metrics and explains predictions with SHAP-based feature attributions, so it meets both requirements. A is mainly for monitoring data and quality drift in production, C is for debugging tensors and resources during training, and D is simple log collection that provides no bias or explainability analysis.

---

**Question 3.** You built a classification model on data where 99.5% of transactions are legitimate and only 0.5% are fraud. Which combination of metrics best evaluates the model's performance?

A) Accuracy alone  
B) F1 score and AUC-ROC, plus Recall for fraud detection  
C) RMSE  
D) R² coefficient of determination  

**Answer: B**  
Explanation: With extremely imbalanced data, Accuracy can reach 99.5% by predicting "all legitimate," which reflects none of the fraud-detection ability, so you should evaluate with F1 and AUC, which are robust to imbalance, and Recall, which captures the fraud that is missed. A is misleading on imbalanced data, and C and D are regression metrics that are unsuitable for evaluating classification performance.

---

**Question 4.** The training dataset is much larger than the local disk of a single instance, and copying all of it at the start of training causes significant delay. Which is the most appropriate improvement?

A) Use File mode to copy all the data to the instance  
B) Use Pipe mode (or Fast File mode) to stream input from S3  
C) Train on a random 1% of the data  
D) Switch to a smaller instance  

**Answer: B**  
Explanation: Pipe mode (and Fast File mode) streams data from S3 without copying all of it, which solves both the problem of data that exceeds disk capacity and the startup delay. A causes exactly that copy delay, C discards data and degrades performance, and D makes the capacity problem worse.

---

**Question 5.** Within a limited training budget, you want to find a good hyperparameter combination with as few training trials as possible. Which strategy is the most appropriate in SageMaker AMT?

A) Grid Search  
B) Bayesian optimization  
C) Try them manually one by one  
D) Explore all combinations randomly without limit  

**Answer: B**  
Explanation: Bayesian optimization uses the results of previous trials to explore promising candidates first, so it is the most efficient way to find a good combination with few training runs. A exhaustively searches the discrete space and needs many trials, C is inefficient and not reproducible, and D is the exact opposite of a budget constraint.

---
