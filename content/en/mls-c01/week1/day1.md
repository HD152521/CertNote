# Day 1 - The ML Lifecycle (from a Specialty Perspective)

## 📌 Key Takeaways

- MLS-C01 asks not "where the SageMaker buttons are" but about **trade-offs between stages**. It weaves data, features, algorithms, metrics, and deployment into a single scenario.
- When translating a business goal into an ML problem, first fix three things: **prediction target, input features, and success metric**.
- The same problem changes type with **label availability**: supervised classification ↔ unsupervised anomaly detection (a trap that is easy to mix up on the Specialty exam).
- The lifecycle is a **cycle**, not a line. When drift is detected in operation, monitoring triggers retraining and returns to the data stage.
- Offline metrics are a **gate**, and online business metrics (A/B) are the **final verdict**. Accuracy alone is meaningless on imbalanced data.

## Problem Definition: Translating a Business Question into an ML Problem

The most common failure happens not in modeling but in **problem definition**. "We want to reduce churn" is a business goal, not an ML problem. To translate it, you must fix three things.

1. **Prediction target (target)**: What are you predicting — whether a customer churns within the next 30 days (binary classification)?
2. **Input features (features)**: What signals do you predict with — recent login frequency, payment history, support tickets?
3. **Success metric (metric)**: What makes a model "good" — maximize precision under the condition recall ≥ 0.8?

If you get the problem type wrong, everything after it goes off the rails. The Specialty exam keeps testing this mapping through scenarios.

### Problem Type Mapping Table

| Business question | ML problem type | Typical output | Representative algorithms |
|---|---|---|---|
| Is this transaction fraudulent? | Binary classification | Probability from 0 to 1 | XGBoost, Linear Learner |
| Which segment does this customer belong to? | Multiclass classification | Class label | XGBoost, k-NN |
| What will next month's revenue be? | Regression | Continuous value | XGBoost, Linear Learner, DeepAR (time series) |
| Which users form similar groups? | Clustering | Cluster ID | K-Means |
| What product will this user buy next? | Recommendation | Ranked list | Factorization Machines, Neural Topic family |
| Is this sensor value abnormal? | Anomaly detection | Anomaly score | Random Cut Forest |
| What is demand for the next 7 days? | Time series forecasting | Per-interval forecasts | DeepAR |

Supervised learning learns an input→output mapping from labeled data, and unsupervised learning finds structure without labels. Fraud detection is usually supervised binary classification, but if past fraud cases (positive labels) are extremely scarce, it shifts to unsupervised anomaly detection (Random Cut Forest). **The same business problem changes problem type depending on label availability.**

> ⚠️ **Pitfall**: If you memorize "fraud detection = always classification," you will pick the wrong answer in a scenario for a new service that has no labels. When you find clues in the passage like "there are almost no past cases" or "there is no labeling budget," unsupervised anomaly detection rises to a candidate answer.

## The Lifecycle Is a Cycle, Not a Line

An ML system is not built once and done. When data changes during operation (drift), the cycle starts over.

```
1. Data       : Collect → Clean → Label → Store (data lake)
2. Features   : Feature engineering → Transform → Feature Store
3. Model      : Algorithm selection → Training → HPO tuning → Evaluation
4. Deploy     : Real-time endpoint / Batch transform / Serverless
5. Monitor    : Data & model quality drift → Retraining trigger
                └──────────(loop back to stage 1)──────────┘
```

- This week (Week 1) focuses on stage 1 (data) and the stages just before it — ingestion, storage, and labeling.
- The Specialty exam gives data engineering a weight of **about 20%**.
- Separating each stage into its own job makes reproducibility and re-runs easy. You can re-run just the cleaning, or put a different algorithm on top of the same features.

```python
# The lifecycle as seen through the SageMaker SDK — separating concerns by stage
import sagemaker
from sagemaker.processing import ProcessingInput, ProcessingOutput
from sagemaker.sklearn.processing import SKLearnProcessor

session = sagemaker.Session()
role = sagemaker.get_execution_role()

# Stages 1-2: cleaning + feature engineering as a Processing Job
processor = SKLearnProcessor(
    framework_version="1.2-1",
    role=role,
    instance_type="ml.m5.xlarge",
    instance_count=1,
)
processor.run(
    code="preprocess.py",
    inputs=[ProcessingInput(source="s3://my-lake/raw/", destination="/opt/ml/processing/input")],
    outputs=[ProcessingOutput(source="/opt/ml/processing/train", destination="s3://my-lake/features/train")],
)
```

**Training-serving skew** is the performance degradation that happens when the feature transformation logic at training time differs from the logic at inference time. Fixing preprocessing in code (`preprocess.py`) and reusing it identically for training and inference, or managing features centrally with SageMaker Feature Store, reduces skew. Features improvised ad hoc in a notebook almost always create skew.

### Choosing a Deployment Form (Stage 4)

Even the same model gets a different deployment form depending on the nature of the traffic. The Specialty exam tests this choice through scenarios too.

| Deployment form | Behavior | Suitable situation |
|---|---|---|
| Real-time endpoint | Always-on instances, immediate response per request | Online inference that needs millisecond responses |
| Serverless inference | Starts automatically on request, scales to 0 when idle | Intermittent, unpredictable traffic; cold starts acceptable |
| Asynchronous inference | Queues the request and writes the result to S3 | Inference with large payloads or long processing times |
| Batch transform | Launches a job to score large volumes of data at once | Nightly bulk scoring; no need to keep an endpoint up |

> ⚠️ **Pitfall**: If you see only "reduce cost" and pick serverless unconditionally, you are wrong. If there is a clue that response latency (SLA) is strict, serverless with its cold starts is the wrong answer, and a real-time endpoint is the answer.

### Data Splitting: Random Is Not Always Right

- **General tabular data**: Random split (train/validation/test). If classes are imbalanced, use a **stratified split** to preserve the proportions.
- **Time series data**: You must use a **chronological split**. Putting future data into training means using information that could not actually have been known, which is leakage.
- **Grouped data** (multiple rows from the same user): Split by grouping at the user level. If the same user is scattered across training and validation, performance is inflated.

## Connecting Offline Model Metrics to Business Metrics

This is where the Specialty exam digs deepest. A single metric like accuracy deceives people. If fraud is 0.1% of all transactions, predicting only "all legitimate" yields 99.9% accuracy. That is why you must look at **class imbalance** and **error costs** together.

```python
# Core classification metrics (based on the confusion matrix)
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score

# precision = TP / (TP + FP)  → "of those flagged as fraud, the fraction that is real" (cost of false positives)
# recall    = TP / (TP + FN)  → "of actual fraud, the fraction caught"                  (cost of false negatives)
precision = precision_score(y_true, y_pred)
recall    = recall_score(y_true, y_pred)
f1        = f1_score(y_true, y_pred)          # harmonic mean of precision and recall
auc       = roc_auc_score(y_true, y_score)    # threshold-independent, ranking quality
```

### Metric Interpretation Table — What Each Says in Which Situation

| Metric | Computation | What a high value means | When to prioritize | Pitfall |
|---|---|---|---|---|
| Accuracy | (TP+TN)/total | Often right overall | Only when classes are balanced | With imbalance, even "all negative" gives 99%+ |
| Precision | TP/(TP+FP) | Few false positives | False positives are costly (spam blocking, marketing sends) | Easy to raise by predicting only a few |
| Recall | TP/(TP+FN) | Few false negatives | False negatives are costly (fraud, cancer diagnosis) | Predicting everything positive gives 1.0 |
| F1 | Harmonic mean of precision and recall | Good balance between the two | When the two costs are similar | Hides which side is the problem |
| ROC-AUC | Area under the TPR-FPR curve | Threshold-independent discrimination | Threshold undecided, comparing models | Overly optimistic under extreme imbalance |
| PR-AUC | Area under the precision-recall curve | Discrimination for the minority class | Extreme imbalance (positives < 1%) | The value changes if the class ratio changes |
| RMSE | Square root of the mean squared error | Few large errors | Regression, when you want to penalize large errors heavily | Sensitive to outliers |
| MAE | Mean absolute error | Small average error | Regression, when you need robustness to outliers | Treats large errors leniently |

Business context decides which metric to optimize.

- **Fraud detection / cancer diagnosis**: Missing even one is fatal → prioritize **recall**
- **Spam filter / marketing targeting**: False positives are expensive (blocking legitimate mail) → prioritize **precision**
- **Imbalance + threshold undecided**: Compare only the model's pure discriminative power with **AUC** or **PR-AUC**

ROC-AUC (the area under the TPR-FPR curve) is relatively insensitive to class imbalance. But when positives are extreme, around 0.1%, ROC-AUC looks overly optimistic, so **PR-AUC** (the area under the precision-recall curve) gives a more honest signal. When the Specialty exam asks "which metric for imbalanced data?", the answer is usually PR-AUC, or whichever of recall/precision has the higher cost.

In a metric-selection question, "training loss" is a wrong answer. Loss is only an optimization target and does not reflect the business cost structure.

## Online Validation with A/B Testing

Good offline metrics do not guarantee that actual user behavior (revenue, dwell time) improves. That is why deployment is not a one-time event but a process of splitting traffic to validate. SageMaker puts multiple variants on one endpoint and distributes traffic by weight.

```python
from sagemaker.session import production_variant

variant_a = production_variant(model_name="model-v1", instance_type="ml.m5.large",
                               initial_instance_count=1, variant_name="A", initial_weight=90)
variant_b = production_variant(model_name="model-v2", instance_type="ml.m5.large",
                               initial_instance_count=1, variant_name="B", initial_weight=10)

session.endpoint_from_production_variants(
    name="fraud-endpoint", production_variants=[variant_a, variant_b]
)
# Send only 10% to the new model (B), compare business metrics in CloudWatch, then adjust weights
```

```
[Offline gate]                       [Online verdict]
Train/validation set metrics ──pass──▶ Small-traffic A/B ──improvement confirmed──▶ Increase weight
   (PR-AUC etc.)         │                    │
                       fail                worse
                         ▼                    ▼
                  Do not deploy       Roll back (weight 0)
```

- Offline metrics are a **gate** — if they do not pass, you do not deploy.
- Online metrics are the **final verdict** — the actual business numbers are the answer.
- This separation is the operational sense the Specialty exam demands.

## The Order for Solving Scenario Questions

Specialty passages stack multiple constraints. Reading in the order below solves most of them.

1. **What is being predicted** → fix the problem type (classification/regression/clustering/anomaly detection/recommendation/time series).
2. **Are there labels** → if not, all supervised-learning candidates are eliminated.
3. **Are the classes balanced** → if imbalanced, discard the accuracy-family options first.
4. **Which is more expensive, false positives or false negatives** → this sets the priority between precision and recall.
5. **Response latency, data sensitivity, cost constraints** → these set the deployment form and operating approach.

In a passage where constraints conflict, the answer is **not the flashiest technology but the choice that satisfies all the constraints at once**. If it violates even one constraint (for example, sensitive data sent to a public workforce), it is wrong regardless of its other advantages.

Tomorrow we cover **where and in what format to keep this data** (S3, EFS, FSx for Lustre; RecordIO, Parquet).

## 📖 Glossary

- **Label** : The correct answer attached to data. The value the model must predict, such as "this transaction was fraud."
- **Class imbalance** : A state where the ratio of positives to negatives is extremely skewed. For example, fraud at 0.1%.
- **Precision** : The fraction of true positives among those called positive. It looks at the cost of false positives.
- **Recall** : The fraction of actual positives that were caught. It looks at the cost of false negatives.
- **PR-AUC** : The area under the precision-recall curve. More honest than ROC-AUC under extreme imbalance.
- **ROC-AUC** : The area of the TPR-FPR curve drawn while varying the threshold. The model's ranking ability.
- **Drift** : The phenomenon where the input data distribution or the relationship to the correct answer changes in operation and model performance falls.
- **Training-serving skew** : An incident where the feature computation logic used at training time differs from the logic at inference time, degrading performance.
- **Production variant** : A model version placed on one endpoint. Traffic is split by weight to run an A/B test.
- **Random Cut Forest** : SageMaker's built-in unsupervised anomaly detection algorithm. It assigns anomaly scores without labels.

---

## 📝 Practice Questions

**Question 1.** A fintech company is building a fraud detection model on data where only 0.2% of transactions are fraudulent. The cost of a false negative (missing actual fraud) is far greater than that of a false positive. What is the most appropriate combination of evaluation metrics?

A) Accuracy alone  
B) Prioritize recall, and use PR-AUC for threshold comparison  
C) Precision alone  
D) The training loss value  

**Answer: B**  
Explanation: Under extreme class imbalance, accuracy is meaningless — predicting "all legitimate" already yields 99.8%. Since the cost of false negatives is high, recall (how much actual fraud is caught) takes priority, and discriminative power across thresholds is assessed with PR-AUC, which is honest under imbalance. Precision alone points in the direction of missing fraud, and training loss does not reflect business cost.

---

**Question 2.** When translating the request "we want to reduce customer churn" into an ML problem, what must be fixed first?

A) The three definitions: prediction target, input features, and success metric  
B) The SageMaker instance type to use  
C) The model deployment region  
D) The storage format of the training data  

**Answer: A**  
Explanation: To translate a business goal into an ML problem, you must first fix what to predict (e.g., churn within 30 days), what signals to predict with, and what makes a good model (the metric). Instance type, region, and storage format are implementation details that come after problem definition.

---

**Question 3.** A new payment service wants to start fraud detection but has almost no historical fraud labels. What is the most realistic approach?

A) Modeling is impossible without labels  
B) Start with unsupervised anomaly detection such as Random Cut Forest  
C) Solve it as multiclass classification no matter what  
D) Predict revenue with regression  

**Answer: B**  
Explanation: When labels (positive cases) are scarce, supervised binary classification is difficult. In that case, start with unsupervised anomaly detection (e.g., Random Cut Forest), which scores how far something deviates from normal patterns, and switch to supervised learning as labels accumulate. The same problem changes type depending on label availability.

---

**Question 4.** A recommendation model showed a large AUC improvement in offline evaluation and was deployed to all traffic immediately — and revenue dropped. What is the most appropriate way to prevent this in advance?

A) Raise the offline AUC even higher  
B) Increase the training data  
C) Switch to a larger instance  
D) Run an A/B test that routes only part of the traffic to the new model and observe real business metrics  

**Answer: D**  
Explanation: Offline metrics (AUC) and online business metrics (revenue) can diverge, so you should route a small share of traffic to the new model via production variant weights, compare actual behavioral metrics, and then ramp up gradually. Raising AUC or adding data repeats the same trap, and instance size is irrelevant.

---

**Question 5.** What is the most essential reason to view the ML lifecycle as a "cyclical loop" rather than a "linear pipeline"?

A) Because SageMaker forces it that way  
B) Because model training never finishes in a single run  
C) Because when the data distribution changes during operation (drift), monitoring triggers retraining and loops back to the data stage  
D) For cost savings  

**Answer: C**  
Explanation: Because an ML system's behavior is learned from data, performance degrades when the input distribution changes in production. The feedback in which the monitoring stage detects drift and loops back to the data/retraining stages is the core reason it is cyclical. SDK constraints, number of training runs, and cost are secondary.

---
