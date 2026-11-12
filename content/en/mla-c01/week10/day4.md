# Day 4 - Common Traps and Keywords: "Requirement → SageMaker Function" Translation Table

Exams are hard not from unknown concepts but from **failing to translate scenarios into functions**. "Verify prediction is fair" doesn't immediately trigger "Clarify" — you see four options and waver into traps. Today: **requirement keyword→function translation table** and **single traps**. Memorize this table; compound question speed jumps dramatically.

## Core Translation Table — Requirement → Function

| Requirement Keyword | Answer Function |
|------------------|----------|
| Input distribution changed? | Model Monitor (Data Quality) |
| Performance vs actual labels? | Model Monitor (Model Quality) + ground truth |
| Fair/bias check | SageMaker Clarify |
| Which feature contributed? | Clarify (SHAP) |
| Low-cost/sporadic inference (0-scale) | Serverless inference |
| Cheapest bulk scoring | Batch Transform |
| Training cost cut (resumable) | Spot Instance (Managed Spot Training) |
| Deep learning inference cost cut | AWS Inferentia (inf1/inf2) |
| Hundreds of identical models cost | Multi-Model Endpoint (MME) |
| Train-inference feature consistency | Feature Store / inference pipeline |
| ML workflow automation, CI/CD | SageMaker Pipelines |
| Trigger retraining on event | EventBridge |
| Internet-free S3/ECR access | VPC Endpoint (PrivateLink) |
| At-rest data encryption | KMS |
| Who called what API? | CloudTrail |
| Visual data prep, no code | Data Wrangler |
| Training debug, bottleneck | SageMaker Debugger |

> 💡 **Related Theory**: This table's value: "answer from requirements before seeing options." Test options are crafted traps. If you've decided your answer name first, checking if that name appears in options is safest. Read problem → spot keywords → recall function → scan options.

## Confused Pairs — What's Different

Most-confused pairs. Distinguish precisely.

| Confused Pair | Split Basis |
|-----------|----------|
| Model Monitor vs Clarify | Drift watch in ops=Monitor / Bias·explainability analysis=Clarify |
| Data Quality vs Model Quality | Input distribution shift / Performance drop (label needed) |
| MME vs MCE | Same container, many models / Different frameworks, few (≤15) |
| CloudTrail vs CloudWatch | Who did what (API audit) / System metrics, logs, alarms |
| Pipelines vs Step Functions | SageMaker-native ML CI/CD / Generic service orchestration |
| Serverless vs Async | Small payload, short, sporadic / Large payload, long, queue |
| Bayesian vs Hyperband | Few trials, efficient / Early-stop low-performers, save compute |

> ⚠️ **Trap**: Exams intentionally place confused pairs in same question options. "Monitor bias" has Model Monitor Bias Drift AND Clarify as options. "Pre-check"=Clarify (one-time). "Operations watch"=Model Monitor (+Clarify integrated). Tiny condition words ("before deployment" vs "in operations", "one-time" vs "continuous") split answers. Master nuance.

## Trap Type 1 — Imbalanced, but Accuracy Tempts

Imbalanced data (fraud, disease, churn) has Accuracy as attractive option. 99% normal data → "all normal" model = 99% accuracy, catches nothing. Answer almost always **F1, AUC, Recall**. "Miss fraud/disease"=Recall. "False alarm cost high"=Precision.

> 🔍 **Deeper**: Metric depends on "asymmetric cost." False-negative (miss) costly? → Recall. False-positive (alert) costly? → Precision. Both matter? → F1. Threshold adjustment trades Precision-Recall; medical: lower threshold to raise Recall.

## Trap Type 2 — Algorithm Mapping Shuffled

"Time series" + Linear Learner, "anomaly" + K-Means mix similar-looking wrong answers. Map precisely: time series=**DeepAR**, anomaly=**RCF**, cluster=**K-Means**, dimension reduce=**PCA**, tabular classify/regress=**XGBoost**, sparse recommend=**Factorization Machines**, text=**BlazingText**.

## Trap Type 3 — Real-Time to Zero Scale

"Traffic drops to zero, scale real-time endpoint to 0 instances" is wrong. Real-time **enforces ≥1 instance always**. Zero-scale requires **serverless/async/batch**. Also "XGBoost on GPU (p4d)" is trap — trees don't parallelize like tensors; CPU is right.

> ⚠️ **Trap**: "Cost cut" keywords appear in every option, mixed. "Many models"→MME correct. "DL inference"→Inferentia correct. "Sporadic traffic"→serverless/async correct. "XGBoost to GPU" or "real-time to 0" or "drop data for speed" are cost-cut traps breaking other requirements. Cost wins when it doesn't sacrifice performance/availability.

## Summary

Today's core: **translation speed**. Catch scenario keywords (drift, bias, isolate, encrypt, sporadic, bulk, time series, imbalance) → instantly recall function name → check if name in options → spot traps (confused pair confusion, Accuracy on imbalance, algorithm mismatch, real-time 0-scale/GPU). Three trap types — know them, you dodge instantly. Tomorrow: D-day strategy.

---

## 📝 Practice Questions

**Question 1.** Before deployment, you want to check once whether the model's predictions are unfair to specific groups, and at the same time report each feature's prediction contribution using SHAP. What is the most appropriate feature?

A) Model Monitor (Bias Drift)  
B) SageMaker Clarify  
C) CloudWatch dashboard  
D) Model Registry  

**Answer: B**  
Explanation: "A one-time pre-deployment check + bias measurement + SHAP contributions" is exactly the role of Clarify. A's Bias Drift is for continuous monitoring in production, so it conflicts with the "one-time pre-deployment" condition, C is operational metric visualization, and D is model version management, unrelated to bias and explainability.

---

**Question 2.** You want to be able to restart a training job even if it is interrupted and to cut costs as much as possible. However, the deadline is not tight. What is the most appropriate choice?

A) Fixed On-Demand instances  
B) Managed Spot Training (Spot Instances)  
C) Finish quickly with a larger GPU instance  
D) Switch to serverless inference  

**Answer: B**  
Explanation: Managed Spot Training uses interruptible Spot Instances to greatly reduce training cost and supports restarting from checkpoints, so it suits "interruption tolerated + cost savings + relaxed deadline." A provides no savings, C increases cost, and D is an inference option unrelated to reducing training cost.

---

**Question 3.** Which of the following requirement-to-feature mappings is incorrect?

A) Detect input data distribution changes → Model Monitor (Data Quality)  
B) Audit who deleted an endpoint → CloudTrail  
C) Access S3 without the internet → KMS encryption  
D) Reduce cost for hundreds of similar models → Multi-model endpoint (MME)  

**Answer: C**  
Explanation: Accessing S3 and ECR without the internet is the role of VPC endpoints (PrivateLink), and KMS encrypts data at rest and is unrelated to the network path, so C is the incorrect mapping. A, B, and D are all correct mappings: Data Quality drift detection, CloudTrail API auditing, and MME cost reduction for many models, respectively.

---

**Question 4.** You want to reduce inference costs for an internal tool whose traffic occurs only during business hours and drops to nearly zero at night and on weekends. A slight delay on the first invocation (cold start) is acceptable. What is the most appropriate option?

A) Autoscale a real-time endpoint down to 0 instances  
B) Serverless inference  
C) Batch transform  
D) A real-time endpoint on a larger instance  

**Answer: B**  
Explanation: Intermittent traffic + scaling to zero + tolerating cold starts is exactly the condition for serverless inference, whose cost is close to zero when idle. A is impossible because real-time endpoints enforce a minimum of 1 instance so they cannot scale to 0, C is bulk processing rather than immediate response, and D actually increases always-on cost.

---

**Question 5.** Which statement most accurately describes the difference between the Data Quality and Model Quality monitors of Model Monitor?

A) Data Quality requires ground truth labels and Model Quality does not  
B) Data Quality looks at changes in input data distribution and schema, while Model Quality looks at degradation of prediction performance against actual ground truth and requires ground truth collection  
C) Both measure only bias  
D) Model Quality works only before training  

**Answer: B**  
Explanation: Data Quality compares input distribution and schema drift against a baseline, and Model Quality measures performance degradation by comparing actual ground truth with predictions, so it requires collecting ground truth labels. A swaps which monitor needs labels, C is an incorrect restriction that says they only look at bias, and D is factually wrong because Model Quality is a monitoring feature that runs in production.

---


## 📝 Practice Questions

**Questions 1-5** [Practice questions in Korean follow after marker]

---
