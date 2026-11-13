# Day 3 - Full Mock Exam Pace: Final Check with the Four-Domain Service Map and Decision Trees

## 📌 Key Takeaways

- The real exam does not tell you which domain a question belongs to. A single sentence has **2-3 condition keywords from multiple domains** embedded in it.
- 65 questions / 130 minutes = **an average of 2 minutes per question**. Today's 8 questions should be solved within 16 minutes.
- The solving order is fixed: question sentence → extract condition keywords → recall the answer before looking at the options → eliminate options that violate the requirements.
- When there are several conditions, only the option that **satisfies all conditions at once** is correct. If it breaks even one, it is wrong no matter how plausible it sounds.
- Review is complete for a missed question not when you memorize the answer, but when you can also say **why the other options were traps**.

## How to Use the Mock Exam

Today we cut back on concept explanations and solve comprehensive scenarios that mix four domains at exam pace. Try to solve the 8 questions below within 16 minutes, and before looking at the answers, it is good to say out loud "which domain is this question, and what keyword decides the answer?"

| Step | What to do | Time |
|------|-------|------|
| First pass | Do all 8 questions straight through without stopping | 16 min |
| Before self-grading | Write down each question's domain and deciding keyword | 4 min |
| Grading and review | For wrong answers, explain "why the other options were wrong" too | No limit |

> 💡 **Related Theory**: A comprehensive question usually has 2-3 "condition keywords" embedded in one sentence. Example: "hundreds of same-type models (→ MME candidate)" + "called occasionally (→ stronger cost savings)" + "same framework (→ MME confirmed)." If you separate the keywords, map each to a feature, and then choose the option that satisfies all the keywords at once, you can filter out the trap options.

## Service Map Across All Four Domains

As you read a question, if you first pin down "which box of this map is this?", a good share of the options are eliminated immediately.

```text
 Ingest        Store        Prepare        Train          Tune
 ─────         ─────        ─────          ─────          ─────
 Kinesis  ─▶   S3      ─▶  Data Wrangler ─▶ Training Job ─▶ AMT
 Firehose      Glue        Processing Job   Built-in/custom Bayesian
 Ground Truth  Catalog     Glue ETL/EMR     File·Pipe      Random·Grid
 (labeling)                Athena (query)   FastFile       Hyperband
                          Feature Store     Spot+checkpoint
                          Clarify (pre-training bias)  Debugger
                                                  │
   ┌──────────────────────────────────────────────┘
   ▼
 Evaluate      Deploy                      Monitor               Security
 ─────         ─────                       ──────────            ─────
 Pick metric ─▶ Model Registry (version·approval) ─▶ Data capture ─▶ IAM (least privilege)
 Accuracy/F1   Real-time · serverless       Model Monitor        VPC (endpoints·isolation)
 AUC · RMSE    Asynchronous · batch transform ├ Data Quality     KMS (encryption at rest)
 Clarify       MME · MCE · inference pipeline ├ Model Quality    TLS (encryption in transit)
 (post-training bias) Variant weights (A/B)  ├ Bias Drift        CloudTrail (audit)
               Pipelines · EventBridge       └ Attribution Drift CloudWatch (metrics)
                                                    │
                                            CloudWatch alarm ─▶ retraining trigger
```

## Quick Keyword Reference by Domain

### Domain 1 - Data Preparation (28%)

| Keyword | Correct feature |
|--------|-----------|
| Real-time stream ingestion | Kinesis Data Streams / Firehose |
| Bulk loading into a data lake | S3 |
| Serverless ETL, schema catalog | Glue / Glue Data Catalog |
| Visual cleansing without code | Data Wrangler |
| Run my own preprocessing script as a managed job | Processing Job |
| SQL queries without moving S3 data | Athena |
| Humans must attach labels | Ground Truth |
| Training-inference feature consistency and reuse | Feature Store |
| Bias check before deployment / explaining feature contribution | Clarify (SHAP) |
| Handling class imbalance | Resampling, class weights |

### Domain 2 - Model Development (26%)

| Keyword | Correct feature |
|--------|-----------|
| Demand for the next N days, multiple related time series | DeepAR |
| Unlabeled outliers, stream anomalies | Random Cut Forest |
| Structured table classification/regression | XGBoost, Linear Learner |
| Grouping without labels | K-Means |
| Too many features | PCA |
| Sparse user × item recommendations | Factorization Machines |
| Document classification, word embeddings | BlazingText |
| Efficient tuning with few trials | Bayesian |
| Early termination of hopeless training runs | Hyperband |
| Training data larger than disk | Pipe / Fast File mode |
| I/O bottleneck from repeated reads every epoch | FSx for Lustre |
| Training cost reduction (interruptions tolerated) | Managed Spot + checkpoints |
| Diagnosing bottlenecks and overfitting during training | Debugger |

### Domain 3 - Deployment and Orchestration (22%)

| Keyword | Correct feature |
|--------|-----------|
| Steady traffic, immediate response | Real-time endpoint |
| Intermittent traffic, scale to zero, cold start tolerated | Serverless inference |
| Large payload, long processing, individual requests | Asynchronous inference |
| Scoring the entire dataset in bulk | Batch transform |
| Hundreds to thousands of same-type models | MME |
| A small number of models on different frameworks | MCE |
| Apply the same preprocessing at inference | Inference pipeline |
| A/B testing, gradual migration | Production variant weights |
| ML workflow DAG, CI/CD | SageMaker Pipelines |
| Register only when the criteria are met | ConditionStep + Model Registry |
| Retrain when new data arrives | EventBridge → Pipeline |
| Reduce deep learning inference unit cost | Inferentia |

### Domain 4 - Monitoring and Security (24%)

| Keyword | Correct feature |
|--------|-----------|
| Whether the input distribution has changed | Model Monitor (Data Quality) |
| Whether performance against ground truth has dropped | Model Monitor (Model Quality) + ground truth |
| Bias changes in production | Bias Drift (integrated with Clarify) |
| Feature contribution changes in production | Feature Attribution Drift |
| Access S3 and ECR without the internet | VPC endpoints (Gateway/Interface) |
| Block the container's outbound communication | EnableNetworkIsolation |
| Encrypt data at rest | KMS |
| Encrypt data in transit | TLS |
| Who called which API | CloudTrail |
| Latency and error rate alarms | CloudWatch |
| Model documentation and governance | Model Cards |
| Data → training → model lineage | Lineage Tracking |
| A role with excessive permissions | IAM least privilege |

## Three Frequently Used Decision Trees

```text
[① Inference options]
  Immediate response needed? ──No──▶ Whole dataset in bulk? ──Yes──▶ Batch transform
        │Yes                        └No (individual·large·long) ──▶ Asynchronous
        ▼
  Steady traffic? ──Yes──▶ Real-time (minimum 1 instance, cannot scale to 0)
        └No ──▶ Cold start tolerated? ──Yes──▶ Serverless
                                    └No ──▶ Real-time + auto scaling

[② Algorithm]
  Are there labels? ──No──▶ Looking for outliers? ──Yes──▶ RCF
        │Yes                    └No ──▶ Grouping: K-Means / dimensionality reduction: PCA
        ▼
  Is the time axis central? ──Yes──▶ DeepAR
        └No ──▶ What is the data?
                      ├ Table (tabular) ──▶ XGBoost / Linear Learner
                      ├ Text            ──▶ BlazingText
                      ├ Images          ──▶ Image Classification / Object Detection
                      └ Sparse interactions ──▶ Factorization Machines

[③ Evaluation metric]
  Classification? ──No──▶ Regression: RMSE (sensitive to large errors) / MAE (dampens outliers) / R²
     │Yes
     ▼
  Imbalanced? ──No──▶ Accuracy is fine
     │Yes
     ▼
  Is the cost of a miss high? ──Yes──▶ Recall
     └No ──▶ Is the cost of a false alarm high? ──Yes──▶ Precision
                            └No ──▶ F1 / AUC-ROC
```

## Reading Superlative Qualifiers

When one sentence holds several conditions, what decides the final choice is usually the **qualifier**.

| Qualifier | Comparison axis | Answer direction |
|--------|---------|-----------------------|
| MOST cost-effective | Cost | MME · serverless · batch · Spot · Inferentia |
| LEAST operational overhead | Operational burden | Managed/serverless services (Glue, Pipelines, serverless inference) |
| MOST secure | Security | VPC endpoints + network isolation + KMS + least privilege |
| LEAST latency | Latency | Real-time endpoint, Feature Store online, caching |
| FASTEST to implement | Implementation speed | Built-in algorithms · Data Wrangler · managed features |
| MINIMUM code changes | Code changes | Keep the existing setup + solve with a configuration change |

> ⚠️ **Trap**: Several options **all work technically.** The superlative qualifier is the only criterion that narrows the answer down to one. If the question says "reduce cost" but the option breaks the performance or availability requirement (setting real-time to 0, discarding data, using a GPU for XGBoost), it is wrong even if the cost goes down. Conversely, if the question says "reduce operational burden" and the option builds directly on EC2, it is wrong even though it works.

## Practice Decomposing Compound Conditions

This is not a question format; it is an example of the **habit of breaking conditions apart**. Follow with your eyes where each condition goes.

Case A - "There are 2,000 per-store XGBoost models nationwide, and each is called only a few times a day. Minimize cost."

| Condition fragment | Translation |
|-----------|------|
| 2,000 models | Many models → MME candidate |
| All XGBoost | Same framework → MME confirmed (MCE eliminated) |
| Called only a few times a day | Low frequency → sharing instances is advantageous |
| Minimize cost | Qualifier = cost |

Case B - "Training uses regulated data. It must not traverse the internet, the container must not send data outside, and data at rest must be encrypted."

| Condition fragment | Translation |
|-----------|------|
| Not via the internet | VPC endpoints (Gateway for S3, Interface for ECR) |
| Block outbound communication | EnableNetworkIsolation |
| Encrypt at rest | KMS |
| Three conditions at once | Only the option that includes all three is correct |

Case C - "A real-time fraud detection model has been deployed. Monitor whether accuracy declines over time, and retrain automatically if it does."

| Condition fragment | Translation |
|-----------|------|
| Whether accuracy declines | Model Quality monitor |
| Prerequisite for computing accuracy | Ground truth labels must be collected |
| Automatic retraining | CloudWatch alarm → EventBridge → Pipeline |
| Real-time fraud | Imbalanced, so the metric is not Accuracy |

When conditions span two domains as **monitoring + automation**, as in Case C, one of the options usually does "monitoring only" and another does "automation only." The option that contains both is correct. Conversely, when there is only one condition but an option attaches a pile of features, it is an over-engineered configuration and loses on the "LEAST operational overhead" criterion. Matching the number of conditions against the number of components in each option is also a quick elimination method.

## Wrong-Answer Patterns: Symptom → Cause → Fix

| Symptom (how people tend to get it wrong) | Cause | Fix |
|------------------------|------|------|
| Picked Accuracy for imbalanced data | Reflexive reaction to the word "accuracy" | Build the habit of finding the data ratio sentence first |
| Picked the option that scales a real-time endpoint to 0 | Forgot real-time's minimum of 1 instance | Scale to 0 is only for serverless, asynchronous, and batch |
| Picked batch transform for individual requests | Judged only by payload size | "Individual requests" means asynchronous; "entire dataset" means batch |
| Picked KMS for a network requirement | Simple association of security = encryption | Network means VPC endpoints and isolation; storage means KMS |
| Picked CloudWatch for an audit question | Confused because both are "logs" | "Who" is CloudTrail; "how slow and when" is CloudWatch |
| Picked a regression algorithm for a time series | Association of forecasting = regression | If the time axis is central, DeepAR |
| Picked a technically workable option and it was wrong | Did not read the superlative qualifier | Underline the qualifier in the last line of the question |
| Picked an option satisfying only 2 of 3 conditions | Did not count the conditions through to the end | Count the conditions and check each option against them |

Now it is time for the real thing. You will solve 8 questions. Tomorrow we reorganize these wrong-answer patterns again by trap type.

## 📖 Glossary

- **Comprehensive scenario question** : A case-based question that mixes conditions from several domains in a single item. It is the mainstream format on the real exam.
- **Condition keyword** : A decisive word that determines the answer (intermittent, bulk, imbalanced, time series, drift, internet blocked, etc.). Extract these first from a question.
- **Superlative qualifier** : An expression that specifies the comparison criterion, such as MOST cost-effective or LEAST operational overhead. It narrows the answer to one when several options all work.
- **Elimination method** : A solving approach that reduces candidates by crossing out options that violate even one requirement. The more conditions there are, the more powerful it is.
- **Over-engineered option** : An option that proposes a configuration far more complex than the requirement. It tends to be wrong on questions judged by operational burden.
- **Scale to zero** : Bringing instances down to 0 when there are no requests so the cost disappears. Only serverless, asynchronous, and batch can do this; real-time cannot.
- **Ground truth** : The actual outcome label used to judge whether a prediction was correct. Without it, Model Quality monitoring cannot work.
- **Pace** : The time budget of an average of 2 minutes per question. The discipline of guessing, marking, and moving on when stuck keeps your pace.

---

## 📝 Practice Questions

**Question 1.** A fintech company wants to detect credit card fraud in real time. 99.7% of transactions are legitimate, and the cost of missing fraud is very high. Which evaluation metric should be prioritized?

A) Accuracy  
B) Recall (with F1 and AUC-ROC as secondary metrics)  
C) RMSE  
D) R² coefficient of determination  

**Answer: B**  
Explanation: With extreme imbalance (99.7% legitimate) and a high cost for missing fraud, prioritize Recall, which minimizes false negatives, and use F1 and AUC to check overall balance. A reaches 99.7% just by predicting "everything is legitimate," so it says nothing about fraud detection ability, and C and D are regression metrics that are unsuitable for evaluating classification.

---

**Question 2.** A nationwide retailer has an XGBoost demand forecasting model for each of its 2,000 stores. Each model is invoked only a few times per day, and the cost of 2,000 endpoints is a burden. What is the most cost-effective deployment?

A) A separate real-time endpoint for each store  
B) Multi-model endpoint (MME)  
C) Multi-container endpoint (MCE)  
D) An inference pipeline that bundles all 2,000 models  

**Answer: B**  
Explanation: "Very many models on the same framework (XGBoost) with a low invocation frequency per model" is exactly the condition for MME, which dynamically loads and shares models across a small number of instances to greatly reduce cost. A makes costs explode with 2,000 endpoints, C is for a small number of models on different frameworks, and D is a sequential preprocessing-to-inference chain that has nothing to do with serving many models.

---

**Question 3.** A medical imaging model receives a 250 MB image per request and runs inference for about 8 minutes, and the results are retrieved from S3 after completion. What is the most appropriate inference option?

A) Real-time endpoint  
B) Serverless inference  
C) Asynchronous inference  
D) Batch transform  

**Answer: C**  
Explanation: A 250 MB payload and 8 minutes of processing exceed the real-time/serverless limits (6 MB / 4 MB payload, 60 seconds), and the pattern of receiving individual requests in a queue and storing results in S3 exactly matches asynchronous inference (up to 1 GB, 60 minutes). A and B are eliminated by the payload and time constraints, and D processes a whole dataset in bulk, which differs from the "individual request" pattern.

---

**Question 4.** A model is trained on regulated data, and the training container must access S3 and ECR without traversing the internet and must block data exfiltration to the outside. What is the most appropriate configuration?

A) Only strengthen IAM policies  
B) Training inside a VPC + S3 and ECR VPC endpoints + network isolation (EnableNetworkIsolation)  
C) Apply only KMS encryption  
D) Public subnet + security group  

**Answer: B**  
Explanation: The combination of training inside a VPC, access without traversing the internet through VPC endpoints, and blocking outside communication with network isolation exactly meets the requirements. A cannot achieve network isolation with permissions alone, C is only encryption at rest and unrelated to networking, and D leaves public exposure, which conflicts with the requirement to block exfiltration.

---

**Question 5.** A data scientist wants to visually explore and clean an S3 dataset with almost no coding, apply missing-value imputation and encoding, and then export that flow to a training pipeline. What is the most appropriate tool?

A) Amazon EMR (hand-coded Spark)  
B) SageMaker Data Wrangler  
C) Amazon Athena  
D) AWS Lambda  

**Answer: B**  
Explanation: Data Wrangler performs data exploration, cleaning, and feature transformation through a visual interface without code and can export the flow to a processing job or pipeline, which matches the requirements. A requires hand-coding Spark, C is a SQL analytics query tool, and D is general-purpose function execution with no visual data preparation capability.

---

**Question 6.** You want to monitor whether the prediction accuracy of a production model degrades over time (against actual ground truth). What configuration is needed?

A) Model Monitor — Data Quality monitor only  
B) Model Monitor — Model Quality monitor + collect actual ground truth  
C) A one-time Clarify bias analysis run  
D) CloudTrail log analysis  

**Answer: B**  
Explanation: Monitoring prediction performance degradation (against ground truth) requires a Model Quality monitor, and computing it requires collecting actual ground truth labels and comparing them with predictions. A's Data Quality only looks at input distribution changes and cannot evaluate performance against ground truth, C is a one-time bias analysis, and D is an API audit log unrelated to model performance.

---

**Question 7.** You want to forecast demand for the next 30 days from multivariate time series sales data. Which SageMaker built-in algorithm is best suited to learn the patterns of multiple related time series together?

A) Linear Learner  
B) DeepAR  
C) K-Means  
D) Random Cut Forest  

**Answer: B**  
Explanation: DeepAR is a built-in algorithm specialized in learning multiple related time series together to forecast future periods, making it well suited for multivariate demand forecasting. A is simple regression that cannot capture time series structure, C is clustering, and D is an anomaly detection algorithm, all different from the forecasting goal.

---

**Question 8.** Whenever new training data arrives in S3, you want to automatically retrain, evaluate, and (if criteria are passed) register the model, while managing model versions and approval status. What is the most appropriate combination?

A) Repeat only a single training job with cron  
B) EventBridge trigger → SageMaker Pipeline (ConditionStep) → Model Registry registration/approval  
C) A person manually runs a notebook  
D) Model Monitor performs retraining directly  

**Answer: B**  
Explanation: Having EventBridge start the Pipeline from an S3 event and having a ConditionStep register the model in Model Registry and manage approval only when the evaluation criteria are passed is the standard pattern for automated retraining MLOps. A has no evaluation, conditions, or version management, C is not automation, and D is inappropriate because Model Monitor is not what executes retraining.

---


## 📝 Practice Questions

**Questions 1-5** [Practice questions in Korean follow after marker]

---
