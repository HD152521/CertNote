# Day 1 - The ML Lifecycle (from a Specialty Perspective)

MLS-C01 (AWS Certified Machine Learning – Specialty) does not ask where the buttons are in SageMaker. It asks scenario questions: "To solve this business problem, what data do you use, how do you process it, which algorithm do you choose, which metrics do you evaluate with, and how do you deploy and monitor it?" So on day one we redraw the entire lifecycle at Specialty depth. Where the Associate level asks "what each stage is," the Specialty level asks about "the trade-offs between stages."

Today's goals are to nail down (1) how to translate a problem into an ML problem, (2) the cyclical structure of data → features → model → deployment → monitoring, and (3) the mindset of connecting offline model metrics to business metrics.

## Problem Definition: Translating a Business Question into an ML Problem

The most common failure happens not in modeling but in problem definition. "We want to reduce churn" is a business goal, not an ML problem. To translate it into an ML problem, you must fix three things.

1. **Prediction target**: What are you predicting — whether a customer churns within the next 30 days (binary classification)
2. **Inputs (features)**: What signals do you predict with — recent login frequency, payment history, number of support tickets
3. **Success criterion (metric)**: What makes a model "good" — maximize precision at a recall of 0.8 or higher

If you get the problem type wrong, everything after it goes off the rails. The Specialty exam constantly tests the following mapping through scenarios.

| Business question | ML problem type | Typical output |
|--------------|-------------|----------|
| Is this transaction fraudulent? | Binary classification | Probability between 0 and 1 |
| Which tier does this customer belong to? | Multiclass classification | Class label |
| What will next month's revenue be? | Regression | Continuous value |
| Which group is similar to this user? | Clustering | Cluster ID |
| What product will they buy next? | Recommendation | Ranked list |
| Is this sensor reading abnormal? | Anomaly detection | Anomaly score |

> 💡 **Related theory**: Supervised learning learns an input→output mapping from labeled data, while unsupervised learning discovers structure without labels. "Fraud detection" is usually solved as supervised binary classification, but if labels (historical fraud cases) are extremely scarce, you approach it with anomaly detection (an unsupervised technique like Random Cut Forest). The fact that the same business problem changes problem type depending on **label availability** is a classic Specialty trap.

## The Lifecycle Is a Cycle, Not a Line

An ML system is not built once and done. When data changes during operation (drift), you go back to the beginning.

```
1. Data                : Collect → Clean → Label → Store (data lake)
2. Features            : Feature engineering → Transform → Feature Store
3. Model               : Algorithm selection → Training → HPO tuning → Evaluation
4. Deploy              : Real-time endpoint / Batch transform / Serverless
5. Monitor             : Data & model quality drift → Retraining trigger
                         └──────────────(loop back to 1)──────────────┘
```

This week (Week 1) focuses on stage 1 — data — and the stages just before it: ingestion, storage, and labeling. That is because the data engineering domain carries a large weight on the Specialty exam (about 20% of the total).

```python
# The lifecycle as seen through the SageMaker SDK — separating responsibilities by stage
import sagemaker
from sagemaker.processing import ProcessingInput, ProcessingOutput

session = sagemaker.Session()
role = sagemaker.get_execution_role()

# Stages 1-2: data cleaning + feature engineering as a Processing Job
from sagemaker.sklearn.processing import SKLearnProcessor

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

Separating each stage into its own job makes reproducibility and re-runs easy. You can re-run just the cleaning step, or train a different algorithm on the same features.

> 💡 **Related theory**: Training-serving skew is the performance degradation caused when the feature transformation logic used at training time differs from the logic used at inference time. Fixing preprocessing in code (`preprocess.py`) as above and reusing it identically for training and inference, or managing features centrally with SageMaker Feature Store, reduces this skew. Features improvised ad hoc in a notebook almost always create skew.

## Connecting Offline Model Metrics to Business Metrics

This is where the Specialty exam digs deepest. A single metric like accuracy can mislead the business. On data where fraudulent transactions are 0.1%, predicting "all legitimate" still yields 99.9% accuracy. That is why you must consider **class imbalance** and **error costs** together.

```python
# Computing the core metrics for a classification problem (based on the confusion matrix)
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score

# precision = TP / (TP + FP)  → "of everything flagged as fraud, the fraction that is actually fraud" (cost of false positives)
# recall    = TP / (TP + FN)  → "of all actual fraud, the fraction caught"                             (cost of false negatives)
precision = precision_score(y_true, y_pred)
recall    = recall_score(y_true, y_pred)
f1        = f1_score(y_true, y_pred)          # harmonic mean of precision and recall
auc       = roc_auc_score(y_true, y_score)    # threshold-independent, ranking quality
```

Business context determines the choice of metric.

- **Fraud detection / cancer diagnosis**: Missing a case is catastrophic → prioritize **recall**
- **Spam filter / marketing targeting**: False positives are expensive (blocking legitimate mail) → prioritize **precision**
- **Class imbalance + threshold not yet decided**: Compare the model's inherent discriminative power with **AUC** or **PR-AUC**

> 💡 **Related theory**: ROC-AUC is the area under the TPR-FPR curve across thresholds, so it is relatively insensitive to class imbalance. However, under **extreme imbalance** (0.1% positives) ROC-AUC looks optimistic, so **PR-AUC** — the area under the precision-recall curve — is a more honest signal. The Specialty exam frequently asks "which metric for imbalanced data?", and the answer is usually PR-AUC, or whichever of recall/precision carries the higher cost.

## Online Validation with A/B Testing

Even if offline metrics look good, actual user behavior (revenue, session time) can decline. That is why deployment does not switch over all at once — you split traffic and validate. SageMaker puts multiple variants behind a single endpoint and distributes traffic by weight.

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

Use offline metrics as a **gate** (no deployment if they fail) and online metrics as the **final verdict**. This separation is the operational sense the Specialty exam demands.

## 📝 연습 문제

**문제 1.** A fintech company is building a fraud detection model on data where only 0.2% of transactions are fraudulent. The cost of a false negative (missing actual fraud) is far greater than that of a false positive. What is the most appropriate combination of evaluation metrics?

A) Accuracy alone  
B) Prioritize recall, and use PR-AUC for threshold comparison  
C) Precision alone  
D) The training loss value  

**정답: B**  
해설: Under extreme class imbalance, accuracy is meaningless — predicting "all legitimate" already yields 99.8%. Since the cost of false negatives is high, recall (how much actual fraud is caught) takes priority, and discriminative power across thresholds is assessed with PR-AUC, which is honest under imbalance. Precision alone points in the direction of missing fraud, and training loss does not reflect business cost.

---

**문제 2.** When translating the request "we want to reduce customer churn" into an ML problem, what must be fixed first?

A) The three definitions: prediction target, input features, and success metric  
B) The SageMaker instance type to use  
C) The model deployment region  
D) The storage format of the training data  

**정답: A**  
해설: To translate a business goal into an ML problem, you must first fix what to predict (e.g., churn within 30 days), what signals to predict with, and what makes a good model (the metric). Instance type, region, and storage format are implementation details that come after problem definition.

---

**문제 3.** A new payment service wants to start fraud detection but has almost no historical fraud labels. What is the most realistic approach?

A) Modeling is impossible without labels  
B) Start with unsupervised anomaly detection such as Random Cut Forest  
C) Solve it as multiclass classification no matter what  
D) Predict revenue with regression  

**정답: B**  
해설: When labels (positive cases) are scarce, supervised binary classification is difficult. In that case, start with unsupervised anomaly detection (e.g., Random Cut Forest), which scores how far something deviates from normal patterns, and switch to supervised learning as labels accumulate. The same problem changes type depending on label availability.

---

**문제 4.** A recommendation model showed a large AUC improvement in offline evaluation and was deployed to all traffic immediately — and revenue dropped. What is the most appropriate way to prevent this in advance?

A) Raise the offline AUC even higher  
B) Increase the training data  
C) Switch to a larger instance  
D) Run an A/B test that routes only part of the traffic to the new model and observe real business metrics  

**정답: D**  
해설: Offline metrics (AUC) and online business metrics (revenue) can diverge, so you should route a small share of traffic to the new model via production variant weights, compare actual behavioral metrics, and then ramp up gradually. Raising AUC or adding data repeats the same trap, and instance size is irrelevant.

---

**문제 5.** What is the most essential reason to view the ML lifecycle as a "cyclical loop" rather than a "linear pipeline"?

A) Because SageMaker forces it that way  
B) Because model training never finishes in a single run  
C) Because when the data distribution changes during operation (drift), monitoring triggers retraining and loops back to the data stage  
D) For cost savings  

**정답: C**  
해설: Because an ML system's behavior is learned from data, performance degrades when the input distribution changes in production. The feedback in which the monitoring stage detects drift and loops back to the data/retraining stages is the core reason it is cyclical. SDK constraints, number of training runs, and cost are secondary.

---
