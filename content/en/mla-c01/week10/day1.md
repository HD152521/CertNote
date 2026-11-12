# Day 1 - Domain 1&2 Integrated Review: Data Preparation + Model Development

Final week, first day. From now, consolidate scattered knowledge into test-ready form, not learning new concepts. MLA-C01 spans four domains. **Domain 1 (Data Preparation, 28%)** and **Domain 2 (Model Development, 26%)** combine for over half. Master these two, you start exam with the majority. Today: data collection, feature engineering, Feature Store, Clarify combined with model training, tuning, evaluation in one flow.

Core message: **Data preparation and model development connect via "reproducibility and consistency."** Features used in training must match exactly in inference (avoid skew); data and hyperparameters in training must be tracked; bias and leakage detected at data stage.

## Domain 1: Data Collection and Storage at a Glance

Where data comes from and lands.

| Requirement | AWS Service |
|------------|------------|
| Real-time stream collection | Kinesis Data Streams / Firehose |
| Bulk batch load (data lake) | S3 |
| Serverless ETL, catalog | AWS Glue (+ Glue Data Catalog) |
| Visual data prep (no code) | SageMaker Data Wrangler |
| Interactive query analysis (S3 direct) | Amazon Athena |
| Distributed big data processing | EMR (Spark) |

> 💡 **Related Theory**: Exams branch: "real-time or batch?", "write code or visual?", "where to store?" Real-time events → Kinesis. Load-then-transform → Glue. Visual quick EDA → Data Wrangler. S3 instant SQL → Athena. Data lake center is almost always S3; others split collection/transform/query roles around it.

## Domain 1: Feature Engineering and Feature Store

Feature engineering keywords: numeric **normalize/standardize**, categorical **one-hot/label encoding**, missing **imputation**, imbalance **SMOTE/under-oversample**, text **tokenize/embed**.

**SageMaker Feature Store** = central repository: define features once, training and inference share. **Online Store** = low-latency single-record lookup (live inference), **Offline Store** = S3 bulk lookup (training, batch).

> 💡 **Related Theory**: Feature Store exists to **kill training-serving skew**. Features computed differently at train vs inference time cause silent performance drop. One definition, online/offline shared → this mismatch vanishes. "Multiple teams reusing same features," "train and real-time inference feature match" → Feature Store.

## Domain 1: SageMaker Clarify — Bias and Explainability

Clarify does two: ① **bias detection** — pre- and post-training data and model bias. ② **explainability** — SHAP shows which features contributed to prediction.

> 🔍 **Deeper**: Two bias timing points. **Pre-training** = data itself imbalanced (group underrepresented), **post-training** = model predictions skew by group. "Check fairness/bias"→Clarify. "Explain prediction/feature contribution"→Clarify SHAP. In monitoring, Model Monitor (+ Clarify integration) watches for bias/feature drift in production.

## Domain 2: Training — Built-In Algorithms and Modes

Model dev: "which algorithm, how to train." Remember built-in algorithm mapping.

| Problem Type | Representative Algorithm |
|-----------|---------|
| Tabular classification/regression | XGBoost, Linear Learner |
| Image classification, object detection | Image Classification, Object Detection |
| Text classification, embedding | BlazingText |
| Time series forecast | DeepAR |
| Clustering | K-Means |
| Dimensionality reduction | PCA |
| Anomaly detection | Random Cut Forest (RCF) |
| Recommendation | Factorization Machines |

> ⚠️ **Trap**: Algorithm mapping is top exam source. "Time series forecast" + Linear Learner = wrong. "Multivariate time series" → **DeepAR**. "Stream anomaly" → **RCF**. Also remember data input modes: data > instance disk or starting latency matters? **Pipe mode** (or new **Fast File mode**) streams from S3. Small data → **File mode** copy-all.

## Domain 2: Hyperparameter Tuning (AMT)

**SageMaker Automatic Model Tuning** automates hyperparameter search. Strategies: **Bayesian** (use past results to pick next smart candidate; sequential; default recommended), **Random** (parallel wide search), **Grid** (small discrete space), **Hyperband** (early-stop low-performing training to save resources).

> 💡 **Related Theory**: Strategy choice = "budget efficiency vs parallelism." Bayesian: few trials, good values, sequential. Random/Grid: easy parallel, inefficient. Hyperband: parallel large search via early termination. "Efficient exploration, few trials" → Bayesian. "Early stop to save compute" → Hyperband. Define `objective_metric` (what to optimize) and search range.

## Domain 2: Evaluation — Correct Metric Selection

After training, pick right metric. Choice almost always depends on "imbalanced data? what matters most?"

| Scenario | Metric |
|----------|--------|
| Balanced classification | Accuracy |
| Imbalanced classification, overall | F1, AUC-ROC |
| High false-positive cost (spam) | Precision-focused |
| High false-negative cost (disease) | Recall-focused |
| Regression | RMSE, MAE, R² |

> ⚠️ **Trap**: Imbalanced data + Accuracy = trap. 99.5% normal fraud data? "All normal" model = 99.5% accuracy, catches zero fraud. Use F1, AUC, Recall instead. "Miss fraud"=**Recall**, "false alarms cost"=**Precision**. Overfitting signs (train acc ↑, val acc ↓): fix with regularization, dropout, early stop, data augment.

## Summary

Domains 1&2 in one flow: data flows via **Kinesis/S3/Glue/Data Wrangler**, features stay consistent via **Feature Store**, bias/explainability checked via **Clarify**. Models pick algorithm per problem type, train via appropriate **input mode**, tune via **AMT**, evaluate via **imbalance-aware metrics**. These two domains are exam's backbone — keyword→service/metric mapping must become reflex.

Tomorrow: Domains 3&4 — deployment/orchestration and monitoring/security same way.

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
