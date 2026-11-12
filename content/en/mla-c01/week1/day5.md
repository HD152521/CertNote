# Day 5 - Week 1 Comprehensive Review — ML Fundamentals & AWS Stack

## 📌 Key Takeaways

- ML cycles through **prepare → develop → deploy → monitor → retrain**. The four exam domains map 1:1 onto this cycle.
- Each problem type (classification, regression, clustering) has **different evaluation metrics**. With imbalanced data, beware the accuracy trap.
- SageMaker covers the entire lifecycle — training runs in **ephemeral containers**, and inference is chosen by **traffic pattern**.
- For common tasks, attach an **AI service** with no training (Comprehend, Transcribe, Rekognition, Textract, etc.).
- The layer-selection criterion is **generality vs. uniqueness of the problem** — general means an AI service, unique means SageMaker.

## ML Lifecycle: The Full Picture

MLA-C01 does not test isolated facts; it asks "for this situation, which tool at which stage?" The most efficient way to study is to layer concepts and services on top of the lifecycle.

```
[1. Data Prep] → [2. Model Dev] → [3. Deploy·Serve] → [4. Monitor·Maintain]
  Collect/Store/Transform   Train/Tune/Evaluate   Pick Endpoint   Drift/Retrain
  (Domain 1, 28%)           (Domain 2, 26%)       (Domain 3, 22%) (Domain 4, 24%)
        ↑                                                              |
        └──────────────── Retrain Trigger ──────────────────────────┘
```

The key is the last arrow. Over time, the data distribution of a deployed model changes (drift) and performance drops, which sends you back to the data preparation stage. An ML engineer's job is to automate and stabilize this cycle.

Collecting **what we learned this week by stage** into one table gives this:

| Stage | Key concepts this week | Representative AWS services |
|-------|------------------------|-----------------------------|
| Data prep | Data lake, ingestion paths | S3, Kinesis, Glue |
| Model development | Supervised/unsupervised/reinforcement, classification·regression·clustering, evaluation metrics | SageMaker Training, built-in algorithms |
| Deploy·serve | Real-time/serverless/batch/asynchronous | SageMaker endpoints, Batch Transform |
| Monitoring | Data and concept drift, retraining triggers | Model Monitor, CloudWatch, Pipelines |

CRISP-DM (Cross-Industry Standard Process for Data Mining) is the standardization of this cycle. Established in the 1990s, this methodology defines a six-stage iterative cycle: business understanding → data understanding → data preparation → modeling → evaluation → deployment. Modern MLOps is a form that tightly couples this with "post-deployment monitoring and automated retraining." On the exam, a scenario saying "model performance degrades over time" always points to the monitoring and retraining stage of this cycle.

## Problem Types and Evaluation Metrics

The evaluation metric depends on what problem the model solves. Choose the wrong metric and you end up building a "99% accurate but useless model."

| Problem type | Description | Key evaluation metrics |
|--------------|-------------|------------------------|
| Binary classification | One of two (churn/stay) | Precision, Recall, F1, AUC-ROC |
| Multi-class classification | Three or more categories | Accuracy, Macro-F1, confusion matrix |
| Regression | Predicting continuous values (price) | RMSE, MAE, R² |
| Clustering | Unsupervised grouping | Silhouette, Inertia |

The learning approaches, summarized again:

- **Supervised learning**: learns from data with answers (labels) → classification·regression
- **Unsupervised learning**: finds structure without answers → clustering·dimensionality reduction·anomaly detection
- **Reinforcement learning**: learns a policy from rewards → sequential decision-making

```python
from sklearn.metrics import precision_score, recall_score, f1_score

# With imbalanced data (0.1% fraud), accuracy is a trap — look at precision/recall
precision = precision_score(y_true, y_pred)   # Share of positive predictions that are truly positive
recall = recall_score(y_true, y_pred)         # Share of actual positives that were caught
f1 = f1_score(y_true, y_pred)                 # Harmonic mean of the two
```

**A decision table for choosing a metric** — practice naming the metric straight from the situation.

| Situation | Metric to choose | Why |
|-----------|------------------|-----|
| Classes are balanced | Accuracy | Little distortion and intuitive |
| Positives are under 1% | PR-AUC, Recall, F1 | Accuracy and ROC-AUC look optimistic |
| Missing a case is fatal (cancer, fraud, equipment failure) | Recall | The cost of FN is highest |
| False alarms are troublesome (spam blocking, ad budget) | Precision | The cost of FP is highest |
| Threshold undecided, comparing models | ROC-AUC | Threshold-independent ranking ability |
| In regression, large errors must be prevented | RMSE | Squares errors, so it penalizes them strongly |
| Regression with many outliers | MAE | Treats all errors equally |

The Precision-Recall tradeoff comes from asymmetric costs. A problem like fraud detection, where "missing a case is a disaster," prioritizes Recall (not missing anything), while a problem like a spam filter, where "blocking a legitimate email is troublesome," prioritizes Precision (reducing false alarms). When the classes are extremely imbalanced, Accuracy is meaningless — guessing the majority class for everything still yields 99%. That is why F1 or AUC-PR is used as the summary metric for imbalanced problems.

> ⚠️ **Gotcha**: It is easy to confuse RMSE and MAE in regression. RMSE squares large errors and penalizes them more heavily, so it is sensitive to outliers, while MAE treats all errors equally and is robust. If "there are many outliers and large errors must be specially prevented," choose RMSE; if "you want to reduce the influence of outliers," choose MAE.

## SageMaker Core Features Summary

The SageMaker we saw in the second half of this week is a toolset that covers the whole ML lifecycle. Regrouped by stage:

| Lifecycle stage | SageMaker feature | Role |
|-----------------|-------------------|------|
| Work environment | Studio (domains, user profiles) | Integrated IDE, permission separation |
| Data prep | Data Wrangler, Feature Store | Visual transforms, feature management |
| Training | Training Job, built-in algorithms | Training in ephemeral containers |
| Tuning | Automatic Model Tuning | Hyperparameter optimization |
| Deployment | Real-time/serverless/batch/asynchronous | Inference options by traffic |
| Operations | Model Monitor, Pipelines | Drift detection, automation |

Two points fall within the exam scope: training happens in **ephemeral containers** (the instance shuts down automatically when it finishes, and Spot reduces cost), and inference options are split by **traffic pattern**.

```python
import sagemaker
from sagemaker.estimator import Estimator

session = sagemaker.Session()
role = sagemaker.get_execution_role()

# Train a tabular classification with built-in XGBoost
estimator = Estimator(
    image_uri=sagemaker.image_uris.retrieve("xgboost", session.boto_region_name, "1.7-1"),
    role=role,
    instance_count=1,
    instance_type="ml.m5.xlarge",
    use_spot_instances=True,   # Reduce training cost
)
estimator.fit({"train": "s3://my-bucket/train/"})
```

**One-line summary of choosing an inference option**

| Traffic shape | Choice | Rationale |
|---------------|--------|-----------|
| Thousands of requests per second, low latency | Real-time endpoint | Always on, so latency is consistent |
| Intermittent, idle cost is a waste | Serverless inference | Zero cost when idle, accept cold starts |
| Scoring a large volume in bulk | Batch transform | No endpoint needed, shuts down when done |
| Large payloads, long processing | Asynchronous inference | Queue-based, results go to S3 |

If the built-in algorithms do not fit, you have two ways to widen the options. Use **script mode** (an AWS-managed framework container + your own training script) to run TensorFlow or PyTorch models, or, if you need a special runtime, go to a **custom container** (a Docker image you build yourself). In the order "built-in → script mode → custom container," control grows and so does the burden.

## AWS AI Services: Pre-Trained Models Without Training

You do not need to train every ML problem yourself. AWS provides pre-trained, managed AI services as APIs. If the task is "common and I want to attach it quickly," this side is the answer.

| Domain | Service | Use |
|--------|---------|-----|
| Text analysis | Comprehend | Extract sentiment, entities, key phrases |
| Translation | Translate | Real-time machine translation |
| Speech → text | Transcribe | Speech recognition, subtitles |
| Text → speech | Polly | TTS voice synthesis |
| Image·video | Rekognition | Detect objects, faces, content |
| Document extraction | Textract | OCR, form and table extraction |
| Forecasting | Forecast | Time-series demand forecasting |
| Recommendation | Personalize | Personalized recommendation engine |
| Generative AI | Bedrock | Foundation model API |

The exam also includes **scenarios that combine several AI services**.

| Requirement | Combination |
|-------------|-------------|
| Analyze complaint sentiment in call center recordings | Transcribe (speech → text) + Comprehend (sentiment) |
| Summarize a scanned foreign-language document | Textract (OCR) + Translate (translation) + Comprehend/Bedrock |
| Read text in an image and give voice guidance | Rekognition/Textract + Polly |

The deciding criterion is the level of abstraction. **AI services** (API calls, no training needed) → **SageMaker** (train and deploy yourself, flexibility) → **building directly on EC2** (maximum control, maximum burden). "Common problem + fast implementation" means an AI service; "custom model on your own data" means SageMaker.

This hierarchy is the cloud version of "build vs buy." An AI service means borrowing a model AWS pre-trained on massive amounts of data (buy), and SageMaker means building one yourself with your own data (build). The ML engineer's decision point is "is my problem general or unique?" For general NLP and vision tasks, an AI service is faster, more accurate, and carries no operational burden, but domain-specific data (e.g., medical imaging, industrial defects) requires training your own model.

## Week 1 One-Line Checklist

| Question | Answer |
|----------|--------|
| What share of a system is ML code? | Under 5%. The rest is data, serving, and monitoring |
| What kind of learning without labels? | Unsupervised (clustering, dimensionality reduction, anomaly detection) |
| 99.9% accuracy on 0.1% fraud data? | A trap. Look at PR-AUC and Recall |
| When does a training instance shut down? | SageMaker terminates it automatically when training ends |
| Scoring all customers once a day? | Batch transform |
| The AWS chip dedicated to training? | Trainium (Inferentia for inference) |
| The feature that detects drift? | SageMaker Model Monitor |

## Checking Week 1 Through Scenarios

The exam does not ask about concepts separately; it embeds them in situations. Let's apply this week's content in a situation → judgment format.

| Situation | Judgment | Rationale |
|-----------|----------|-----------|
| A model built in a notebook must be retrained automatically every week | Fix training as pipeline code | Reproducibility is priority one in ML engineering |
| You must recreate a six-month-old model exactly | Check four things: code, data version, hyperparameters, environment | If any one is missing, it cannot be reproduced |
| Offline AUC went up but revenue dropped | Validate online metrics with a small-traffic A/B test | Offline is a gate; online makes the verdict |
| Accuracy gradually declines six months after deployment | Drift → Model Monitor → retraining trigger | A classic monitoring-stage case |
| Input distribution is unchanged but performance only drops | Suspect concept drift | The input-answer relationship changed |
| You want to group customer data that has no labels at all | Unsupervised clustering | With no answers, supervised learning is impossible |
| 99.9% accuracy on 0.1% fraud data | Switch the metric — PR-AUC·Recall | A number you get even by guessing the majority class |
| Analyze complaints in call center recordings | Transcribe + Comprehend | A combination of standard tasks, no training needed |
| Classify defect images from our factory | Rekognition Custom Labels or SageMaker | Domain-specific labels are required |
| Compute scores for all customers at once overnight | Batch transform | An always-on endpoint is unnecessary |
| An internal tool called only a few times a day | Serverless inference | Zero idle cost is advantageous |
| Lower the inference cost for millions of requests | Inferentia | An inference-dedicated chip |

## Commonly Confused Pairs

| Confusing pair | Deciding criterion |
|----------------|--------------------|
| Classification vs regression | Is the output a category or a continuous number |
| Classification vs clustering | Whether answer labels exist or not |
| Precision vs recall | Whether you reduce FP or reduce FN |
| ROC-AUC vs PR-AUC | Balanced data or extreme imbalance |
| RMSE vs MAE | Penalize large errors heavily or treat them equally |
| Data drift vs concept drift | Did the input distribution change or the input-answer relationship |
| Real-time vs serverless | Is consistent latency or idle cost more important |
| Batch transform vs asynchronous inference | Bulk batch or a large single request with long processing |
| Trainium vs Inferentia | Training or inference |
| AI services vs SageMaker | Is the problem general or unique |

> ⚠️ **Gotcha**: The easy mistake in Week 1 is the habit of choosing the "better technology." The exam treats the **simplest and cheapest** choice that satisfies the requirements as the correct answer. Choosing deep learning for a problem that does not need it, or custom training for a task a single API call can handle, is a wrong answer.

Next week (Week 2) we dig deep into the first stage of the lifecycle, data collection and storage — S3, Kinesis, Glue, and Athena.

## 📖 Glossary

- **CRISP-DM**: A classic data mining methodology that repeats six stages from business understanding to deployment. The ancestor of MLOps.
- **Drift**: The phenomenon in which the input distribution or the input-answer relationship changes over time and model performance drops.
- **Retraining trigger**: A mechanism that automatically reruns training when drift or performance degradation is detected.
- **Macro-F1**: The simple average of per-class F1 in multi-class classification. It reflects minority classes equally.
- **Silhouette score**: A metric measuring how tightly clusters hold together and how well separated they are. Used when there are no answers.
- **R² (coefficient of determination)**: A regression metric expressing, from 0 to 1, how much of the data's variation the model explains.
- **Automatic Model Tuning**: A SageMaker feature that automatically searches hyperparameter combinations to find the best values.
- **Foundation model**: A large model pre-trained on vast data and used broadly across tasks. Bedrock provides it as an API.
- **build vs buy**: The judgment of whether to build it yourself or buy and use something that already exists. The axis for choosing between AI services and SageMaker.
- **Managed service**: A service where AWS takes over infrastructure operations. You give up some control in exchange for less burden.

## 📝 Practice Questions

**Question 1.** A deployed churn prediction model's accuracy is slowly declining over months. Input data distribution has shifted from training time. Which lifecycle stage does this correspond to, and the response?

A) Data prep stage — delete the model  
B) Monitoring stage detects drift, retrain by cycling through data prep with new data  
C) Deployment stage — scale up instance types  
D) Model dev stage — adjust learning rate only  

**Answer: B**  
Explanation: Performance degradation from time-based data distribution shift (drift) is detected in monitoring, and the response is cycling data prep → retrain on new data. Deleting (A) stops service, scaling instances (C) addresses throughput not accuracy, and tweaking learning rate (D) doesn't solve distribution shift.

---

**Question 2.** Fraud detection model where fraud is 0.1% of transactions. Which metric is most inappropriate and why?

A) Recall — the cost of missing fraud is high  
B) Accuracy — even predicting all as legitimate hits 99.9%, making it a trap metric  
C) F1 — balances precision and recall  
D) AUC-PR — robust to imbalance  

**Answer: B**  
Explanation: With extreme class imbalance, Accuracy is a trap — predicting all as majority class hits 99.9% and hides the model's real detection power. Recall (catch misses), F1 (balance), AUC-PR (imbalance-robust) all suit imbalanced problems.

---

**Question 3.** Convert call center recordings to text, then analyze customer complaints for sentiment. Implement fastest without training?

A) Train voice and sentiment models directly in SageMaker  
B) Amazon Transcribe (speech→text) + Amazon Comprehend (sentiment)  
C) Amazon Rekognition + Amazon Polly  
D) Amazon Forecast + Amazon Personalize  

**Answer: B**  
Explanation: Transcribe converts speech to text, Comprehend analyzes sentiment — combined, just API calls, no training. SageMaker training (A) is overkill for standard tasks. Rekognition (image) + Polly (TTS) (C) and Forecast + Personalize (D) don't match speech recognition and sentiment analysis.

---

**Question 4.** For regression evaluation, you want to heavily penalize large errors to catch outliers sensitively. Which metric?

A) MAE  
B) RMSE  
C) Accuracy  
D) Silhouette score  

**Answer: B**  
Explanation: RMSE squares errors, penalizing large ones harder, so it's outlier-sensitive. MAE treats all errors equally (robust). Accuracy is classification, Silhouette is clustering — neither fit regression.

---

**Question 5.** "Train a custom classifier on unique manufacturing defect images from our domain."  At the abstraction layer, which choice fits?

A) Call Amazon Rekognition API  
B) Train and deploy directly in SageMaker  
C) Analyze text with Comprehend  
D) Translate with Translate  

**Answer: B**  
Explanation: Domain-specific custom data requires custom training/deployment — SageMaker is the fit. Rekognition (A) is for general image tasks, insufficient for unique defect patterns. Comprehend (C) and Translate (D) are text, unrelated to image classification.

---
