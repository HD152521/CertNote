# Day 5 - Week 1 Wrap-up — Reviewing ML Fundamentals and the AWS Stack

This week we surveyed the basic concepts of machine learning and how to implement them on AWS. Today we tie the scattered pieces into a single picture. Because the MLA-C01 exam asks not for isolated facts but "which tool at which stage do you use in this situation," the most efficient way to memorize is to lay the concepts and services on top of the lifecycle.

The four axes we review today are ① the ML lifecycle, ② problem types and evaluation metrics, ③ core SageMaker capabilities, and ④ AWS AI services. We organize each axis around the decision criteria of "when do you choose what."

## The ML Lifecycle: The Whole Process at a Glance

A machine learning project does not end after one training run — it cycles. The four MLA-C01 domains map directly onto this lifecycle.

```
[1. Data Preparation] → [2. Model Development] → [3. Deployment & Serving] → [4. Monitoring & Maintenance]
  Collect/Store/Transform   Train/Tune/Evaluate     Endpoint selection        Drift/Retraining
  (Domain 1, 28%)          (Domain 2, 26%)         (Domain 3, 22%)          (Domain 4, 24%)
        ↑                                                      |
        └──────────────── Retraining trigger ─────────────────┘
```

The key is the final arrow. Once deployed, a model degrades over time as the data distribution changes (drift), and then you go back to the data preparation stage. The ML engineer's job is to automate and stabilize this cycle.

> 💡 **Related theory**: The standardization of this cycle is CRISP-DM (Cross-Industry Standard Process for Data Mining). Established in the 1990s, this methodology defines a six-stage iterative cycle: business understanding → data understanding → data preparation → modeling → evaluation → deployment. Modern MLOps is this cycle with "post-deployment monitoring and automated retraining" tightly coupled on. On the exam, a scenario like "model performance degrades over time" always points to the monitoring/retraining stage of this cycle.

## Problem Types and Evaluation Metrics

The evaluation metric depends on what problem the model solves. Choosing the wrong metric leads to "a model with 99% accuracy that is useless."

| Problem type | Description | Typical evaluation metrics |
|----------|------|--------------|
| Binary classification | One of two (churn/retain) | Precision, Recall, F1, AUC-ROC |
| Multi-class classification | Three or more categories | Accuracy, Macro-F1, confusion matrix |
| Regression | Continuous value prediction (price) | RMSE, MAE, R² |
| Clustering | Unsupervised grouping | Silhouette, Inertia |

Let's also revisit the distinction between supervised, unsupervised, and reinforcement learning. **Supervised learning** trains on data with ground-truth labels (classification, regression), **unsupervised learning** finds structure without labels (clustering, dimensionality reduction, anomaly detection), and **reinforcement learning** learns a policy from rewards.

```python
from sklearn.metrics import precision_score, recall_score, f1_score

# On imbalanced data (fraud at 0.1%), accuracy is a trap — look at precision/recall
precision = precision_score(y_true, y_pred)   # Fraction of positive predictions that are truly positive
recall = recall_score(y_true, y_pred)         # Fraction of actual positives that were caught
f1 = f1_score(y_true, y_pred)                 # Harmonic mean of the two
```

> 💡 **Related theory**: The precision-recall trade-off stems from cost asymmetry. Problems where "missing one is disastrous," like fraud detection, prioritize Recall (not missing anything); problems where "blocking legitimate mail is a problem," like spam filtering, prioritize Precision (reducing false alarms). When classes are extremely imbalanced, Accuracy is meaningless — predicting everything as the majority class still yields 99%. That is why F1 or AUC-PR is used as the summary metric for imbalanced problems.

> ⚠️ **Pitfall**: Do not confuse RMSE and MAE in regression. RMSE squares the errors, punishing large errors more heavily, so it is sensitive to outliers; MAE treats all errors equally and is robust. If "there are many outliers and large errors must especially be prevented," use RMSE; if "you want to reduce the influence of outliers," use MAE.

## Core SageMaker Capabilities, Organized

SageMaker, which we covered in the latter half of this week, is a collection of tools covering the entire ML lifecycle. Grouped again by stage:

| Lifecycle stage | SageMaker capability | Role |
|--------------|---------------|------|
| Workspace | Studio (domains & user profiles) | Integrated IDE, permission separation |
| Data preparation | Data Wrangler, Feature Store | Visual transformation, feature management |
| Training | Training Job, built-in algorithms | Training in ephemeral containers |
| Tuning | Automatic Model Tuning | Hyperparameter optimization |
| Deployment | Real-time/Serverless/Batch/Async | Inference options by traffic |
| Operations | Model Monitor, Pipelines | Drift detection, automation |

Two exam staples: training happens in **ephemeral containers** (instances auto-terminate when done; Spot cuts cost), and the inference options are chosen by **traffic pattern**.

```python
import sagemaker
from sagemaker.estimator import Estimator

session = sagemaker.Session()
role = sagemaker.get_execution_role()

# Train a tabular-data classifier with built-in XGBoost
estimator = Estimator(
    image_uri=sagemaker.image_uris.retrieve("xgboost", session.boto_region_name, "1.7-1"),
    role=role,
    instance_count=1,
    instance_type="ml.m5.xlarge",
    use_spot_instances=True,   # Reduce training cost
)
estimator.fit({"train": "s3://my-bucket/train/"})
```

> 🔍 **Going deeper**: Memorize the inference option decision in one line each. "Thousands of requests per second, low latency" → real-time endpoint. "Intermittent traffic, idle cost is a waste" → serverless. "Bulk batch scoring" → batch transform. "Large payloads, long processing" → asynchronous. And when the built-ins don't fit, go to script mode (your own code + an AWS framework container) or a custom container.

## AWS AI Services: Pre-trained Models You Use Without Training

Not every ML problem needs to be trained yourself. AWS provides pre-trained, managed AI services via API. If "it's a common task and you want to bolt it on fast," this is the answer.

| Area | Service | Use case |
|------|--------|------|
| Text analysis | Comprehend | Sentiment, entities, key phrase extraction |
| Translation | Translate | Real-time machine translation |
| Speech→text | Transcribe | Speech recognition, captions |
| Text→speech | Polly | TTS speech synthesis |
| Images & video | Rekognition | Object, face, content detection |
| Document extraction | Textract | OCR, form & table extraction |
| Forecasting | Forecast | Time-series demand forecasting |
| Recommendations | Personalize | Personalized recommendation engine |
| Generative AI | Bedrock | Foundation model API |

The decision criterion is the abstraction level. **AI services** (API calls, no training needed) → **SageMaker** (train and deploy yourself, flexibility) → **self-built EC2** (maximum control, maximum burden). "Common problem + fast implementation" → AI services; "custom model on proprietary data" → SageMaker.

> 💡 **Related theory**: This hierarchy is the cloud version of "build vs. buy." AI services mean renting a model AWS has pre-trained on massive data (buy), while SageMaker means building your own with your own data (build). The ML engineer's judgment call is "is my problem generic or unique?" Generic NLP/vision tasks are faster, more accurate, and operations-free with AI services, but domain-specific data (e.g., medical imaging, industrial defects) requires training your own model.

## Wrapping Up

The big picture of Week 1: ML cycles through a **lifecycle** (preparation → development → deployment → monitoring → retraining); each problem type (classification, regression, clustering) has different **evaluation metrics** (beware the accuracy trap under imbalance); and **SageMaker** covers this entire lifecycle. Common tasks are bolted on quickly with **AI services**, no training needed. The core exam instinct is choosing the abstraction level (AI services → SageMaker → EC2) by how generic or unique the problem is.

Next week (Week 2) we dig deep into the first stage of the lifecycle — data collection and storage — covering S3, Kinesis, Glue, and Athena.

---

## 📝 연습 문제

**문제 1.** The accuracy of a deployed churn prediction model has been slowly declining over several months. The input data distribution appears to have diverged from training time. Which lifecycle stage does this problem belong to, and what is the response?

A) The data preparation stage; delete the model  
B) Detect the drift at the monitoring stage, and run the retraining cycle again with new data  
C) The deployment stage; scale up the instance type  
D) The model development stage; adjust only the learning rate  

**정답: B**  
해설: Performance degradation caused by data distribution change over time (drift) is detected at the monitoring stage, and the response is to run the data preparation → retraining cycle again with new data. Deleting the model (A) means a service outage, scaling the instance (C) addresses throughput rather than accuracy, and adjusting the learning rate (D) does not fundamentally solve a distribution change.

---

**문제 2.** In a fraud detection model, fraud accounts for 0.1% of all transactions. Which is the most inappropriate evaluation metric, with the correct reason?

A) Recall — because the cost of missing fraud is high  
B) Accuracy — because predicting everything as normal still yields 99.9%, making it meaningless  
C) F1 — because it balances precision and recall  
D) AUC-PR — because it is robust to imbalance  

**정답: B**  
해설: Under extreme class imbalance, Accuracy is a trap metric: predicting every sample as the majority class still yields 99.9%, masking the model's real detection ability. Recall (not missing fraud), F1 (balance), and AUC-PR (robust to imbalance) are all appropriate metrics for imbalanced problems.

---

**문제 3.** You want to convert call center recordings to text and then analyze the sentiment of customer complaints. Which combination implements this fastest without any training?

A) Train speech and sentiment models directly in SageMaker  
B) Amazon Transcribe (speech→text) + Amazon Comprehend (sentiment analysis)  
C) Amazon Rekognition + Amazon Polly  
D) Amazon Forecast + Amazon Personalize  

**정답: B**  
해설: Combining Transcribe, which converts speech to text, with Comprehend, which analyzes sentiment, implements this with API calls alone — no training. Training directly in SageMaker (A) is excessive effort for a common task, and Rekognition (images) + Polly (TTS) (C) as well as Forecast (forecasting) + Personalize (recommendations) (D) serve different purposes than speech recognition and sentiment analysis.

---

**문제 4.** In regression model evaluation, you want to punish large errors especially heavily and be sensitive to outliers. Which metric fits?

A) MAE  
B) RMSE  
C) Accuracy  
D) Silhouette score  

**정답: B**  
해설: RMSE squares the errors, giving larger penalties to large errors, so it reacts sensitively to outliers. MAE (A) treats all errors equally and is robust, Accuracy (C) is a classification metric, and Silhouette (D) is a clustering quality metric — neither fits regression evaluation.

---

**문제 5.** The requirement is "we must train a custom classification model on proprietary industrial defect image data." Which choice in the abstraction hierarchy is appropriate?

A) Call the Amazon Rekognition API  
B) Train and deploy directly with SageMaker  
C) Analyze text with Comprehend  
D) Translate with Translate  

**정답: B**  
해설: Because a custom model must be built from domain-specific proprietary data, SageMaker — which enables training and deploying your own models — is the right fit. Rekognition (A) is a pre-trained model for generic image tasks and falls short on proprietary defect patterns, while Comprehend (C) and Translate (D) are text services unrelated to image classification.

---
