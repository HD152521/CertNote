# Day 5 - Week 1 Comprehensive Review — ML Fundamentals & AWS Stack

This week we surveyed ML basics and how to implement them on AWS. Today we tie the scattered pieces together. MLA-C01 tests not isolated knowledge but "which tool at which stage for this situation?" — so the most efficient way to learn is to layer concepts and services on the ML lifecycle.

Four dimensions to review today: ① ML lifecycle, ② problem types and metrics, ③ SageMaker essentials, ④ AWS AI Services. We'll organize each by "when do you pick what?" decision criteria.

## ML Lifecycle: The Full Picture

ML projects don't train once and end — they cycle. The four domains of MLA-C01 map directly to this lifecycle.

```
[1. Data Prep] → [2. Model Dev] → [3. Deploy·Serve] → [4. Monitor·Maintain]
  Collect/Store/Transform   Train/Tune/Evaluate   Pick Endpoint   Drift/Retrain
  (Domain 1, 28%)           (Domain 2, 26%)       (Domain 3, 22%) (Domain 4, 24%)
        ↑                                                              |
        └──────────────── Retrain Trigger ──────────────────────────┘
```

The key is that last arrow. Deployed models degrade over time as data distribution drifts, then you cycle back to data prep. ML engineers' job is to automate and stabilize this cycle.

> 💡 **Related Theory**: This cycle is standardized as CRISP-DM (Cross-Industry Standard Process for Data Mining). Established in the 1990s, it defines 6 iterative stages: business understanding → data understanding → data preparation → modeling → evaluation → deployment. Modern MLOps tightly couples this to "post-deployment monitoring and automated retraining." Exam scenarios saying "model performance declines over time" always point to the monitoring/retrain stage in this cycle.

## Problem Types and Metrics

What problem a model solves dictates its metrics. Pick the wrong metric and you build a "99% accurate but useless model."

| Problem Type | Description | Key Metrics |
|--------------|-------------|-------------|
| Binary classification | One of two (churn/stay) | Precision, Recall, F1, AUC-ROC |
| Multi-class classification | Three+ categories | Accuracy, Macro-F1, Confusion Matrix |
| Regression | Continuous prediction (price) | RMSE, MAE, R² |
| Clustering | Unsupervised grouping | Silhouette, Inertia |

Also review supervised/unsupervised/reinforcement learning. **Supervised** learns from labeled data (classification·regression). **Unsupervised** finds structure without labels (clustering, dimensionality reduction, anomaly detection). **Reinforcement** learns policies from rewards.

```python
from sklearn.metrics import precision_score, recall_score, f1_score

# With imbalanced data (0.1% fraud), accuracy is a trap — look at precision/recall
precision = precision_score(y_true, y_pred)   # Share of positive predictions that are true
recall = recall_score(y_true, y_pred)         # Share of actual positives we caught
f1 = f1_score(y_true, y_pred)                 # Harmonic mean of both
```

> 💡 **Related Theory**: The Precision-Recall tradeoff comes from asymmetric costs. For "missing is catastrophic" problems like fraud detection, prioritize Recall (catching misses). For "false alarms are painful" like spam filters, prioritize Precision (reducing false alarms). With extreme class imbalance, Accuracy is meaningless — predicting all as the majority class hits 99%. That's why imbalanced problems use F1 or AUC-PR as summary metrics.

> ⚠️ **Gotcha**: Don't confuse RMSE and MAE in regression. RMSE squares large errors, penalizing them harder, so it's sensitive to outliers. MAE treats all errors equally, more robust. "Lots of outliers and I need to specially penalize large errors" → RMSE. "Reduce outlier impact" → MAE.

## SageMaker Essentials Organized

SageMaker, which we explored in the second half of this week, is a toolkit covering the entire ML lifecycle. By stage:

| Lifecycle Stage | SageMaker Feature | Role |
|-----------------|------------------|------|
| Work environment | Studio (domain, user profile) | Unified IDE, permission separation |
| Data prep | Data Wrangler, Feature Store | Visual transforms, feature management |
| Training | Training Job, built-in algorithms | Ephemeral container training |
| Tuning | Automatic Model Tuning | Hyperparameter optimization |
| Deployment | Real-time/serverless/batch/async | Traffic-specific inference options |
| Operations | Model Monitor, Pipelines | Drift detection, automation |

Key exam points: training happens in **ephemeral containers** (auto-terminates, spot cuts cost), and inference options split by **traffic pattern**.

```python
import sagemaker
from sagemaker.estimator import Estimator

session = sagemaker.Session()
role = sagemaker.get_execution_role()

# Train tabular classification with built-in XGBoost
estimator = Estimator(
    image_uri=sagemaker.image_uris.retrieve("xgboost", session.boto_region_name, "1.7-1"),
    role=role,
    instance_count=1,
    instance_type="ml.m5.xlarge",
    use_spot_instances=True,   # Cut training costs
)
estimator.fit({"train": "s3://my-bucket/train/"})
```

> 🔍 **Deeper Dive**: Memorize inference option choice in one line. "Thousands of requests/second, low latency" → Real-time endpoint. "Sporadic, no idle cost" → Serverless. "Bulk batch scoring" → Batch transform. "Large payload, long processing" → Asynchronous. If built-in doesn't fit, use script mode (your code + AWS framework container) or custom container.

## AWS AI Services: Pre-Trained Models Without Training

Not every ML problem needs direct training. AWS offers pre-trained managed AI Services via API. "Common task, want it fast" — this is the answer.

| Domain | Service | Use Case |
|--------|---------|----------|
| Text analysis | Comprehend | Sentiment, entities, key phrases |
| Translation | Translate | Real-time machine translation |
| Speech→Text | Transcribe | Speech recognition, subtitles |
| Text→Speech | Polly | TTS voice synthesis |
| Image·Video | Rekognition | Objects, faces, content detection |
| Document extraction | Textract | OCR, forms, tables |
| Forecasting | Forecast | Time-series demand prediction |
| Recommendation | Personalize | Personalized recommendation engine |
| Generative AI | Bedrock | Foundation model API |

Decision criterion: abstraction level. **AI Services** (API call, no training) → **SageMaker** (direct train/deploy, flexible) → **EC2 direct** (max control, max burden). "Common problem + speed" → AI Service. "Custom model on my data" → SageMaker.

> 💡 **Related Theory**: This hierarchy is the cloud version of "build vs buy." AI Services borrow pre-trained models AWS trained on massive datasets (buy). SageMaker builds custom on your data (build). The ML engineer's decision point: "Is my problem general or domain-specific?" General NLP/vision tasks are faster, more accurate, and less operational burden via AI Services. Domain-specialized data (medical imaging, manufacturing defects) needs direct training.

## Summary

Week 1's big picture: ML cycles through the **lifecycle** (prep → dev → deploy → monitor → retrain), each problem type needs different **metrics** (watch for accuracy traps in imbalance), the whole lifecycle is covered by **SageMaker**, and common tasks attach fast via **AI Services** without training. The core exam skill is choosing abstraction level (AI Services → SageMaker → EC2) by problem generality.

Next week (Week 2) we dive deep into the lifecycle's first stage: data collection and storage — S3, Kinesis, Glue, Athena.

---

## 📝 연습 문제

**문제 1.** A deployed churn prediction model's accuracy is slowly declining over months. Input data distribution has shifted from training time. Which lifecycle stage does this correspond to, and the response?

A) Data prep stage — delete the model  
B) Monitoring stage detects drift, retrain by cycling through data prep with new data  
C) Deployment stage — scale up instance types  
D) Model dev stage — adjust learning rate only  

**정답: B**  
해설: Performance degradation from time-based data distribution shift (drift) is detected in monitoring, and the response is cycling data prep → retrain on new data. Deleting (A) stops service, scaling instances (C) addresses throughput not accuracy, and tweaking learning rate (D) doesn't solve distribution shift.

---

**문제 2.** Fraud detection model where fraud is 0.1% of transactions. Which metric is most inappropriate and why?

A) Recall — the cost of missing fraud is high  
B) Accuracy — even predicting all as legitimate hits 99.9%, making it a trap metric  
C) F1 — balances precision and recall  
D) AUC-PR — robust to imbalance  

**정답: B**  
해설: With extreme class imbalance, Accuracy is a trap — predicting all as majority class hits 99.9% and hides the model's real detection power. Recall (catch misses), F1 (balance), AUC-PR (imbalance-robust) all suit imbalanced problems.

---

**문제 3.** Convert call center recordings to text, then analyze customer complaints for sentiment. Implement fastest without training?

A) Train voice and sentiment models directly in SageMaker  
B) Amazon Transcribe (speech→text) + Amazon Comprehend (sentiment)  
C) Amazon Rekognition + Amazon Polly  
D) Amazon Forecast + Amazon Personalize  

**정답: B**  
해설: Transcribe converts speech to text, Comprehend analyzes sentiment — combined, just API calls, no training. SageMaker training (A) is overkill for standard tasks. Rekognition (image) + Polly (TTS) (C) and Forecast + Personalize (D) don't match speech recognition and sentiment analysis.

---

**문제 4.** For regression evaluation, you want to heavily penalize large errors to catch outliers sensitively. Which metric?

A) MAE  
B) RMSE  
C) Accuracy  
D) Silhouette score  

**정답: B**  
해설: RMSE squares errors, penalizing large ones harder, so it's outlier-sensitive. MAE treats all errors equally (robust). Accuracy is classification, Silhouette is clustering — neither fit regression.

---

**문제 5.** "Train a custom classifier on unique manufacturing defect images from our domain."  At the abstraction layer, which choice fits?

A) Call Amazon Rekognition API  
B) Train and deploy directly in SageMaker  
C) Analyze text with Comprehend  
D) Translate with Translate  

**정답: B**  
해설: Domain-specific custom data requires custom training/deployment — SageMaker is the fit. Rekognition (A) is for general image tasks, insufficient for unique defect patterns. Comprehend (C) and Translate (D) are text, unrelated to image classification.

---
