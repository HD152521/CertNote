# Day 3 - Full Mock Exam Pace: A Final Check with the 4-Domain Service Map and Decision Trees

## 📌 Key Takeaways

- The real exam does not tell you which domain a question belongs to. A single sentence has **2-3 condition keywords from several domains** embedded in it.
- 65 questions / 130 minutes = **an average of 2 minutes per question**. The goal is to solve today's 8 questions within 16 minutes.
- The solving order is fixed: question sentence → extract condition keywords → think of the answer before looking at the options → eliminate options that violate a requirement.
- When there are multiple conditions, only **the option that satisfies all conditions at the same time** is correct. If it breaks even one, it is wrong no matter how plausible it looks.
- For a question you got wrong, review is not finished by memorizing the answer; you must be able to say **why the other options were traps**.

## How to Use the Mock Exam

Today we cut back on concept explanations and solve integrated scenarios mixing the 4 domains at the same pace as the real exam. Solve the 8 questions below within 16 minutes if possible, and before looking at the answer, it is good to first say out loud "which domain is this question, and what is the keyword that decides the answer?"

| Step | What to do | Time |
|------|-------|------|
| First pass | Go through all 8 questions without stopping | 16 min |
| Before self-grading | Write down each question's domain and deciding keyword | 4 min |
| Grading and review | For wrong answers, explain "why the other options were wrong" | No limit |

> 💡 **Related theory**: An integrated question usually has 2-3 "condition keywords" embedded in one sentence. Example: "hundreds of same-type models (→ MME candidate)" + "invoked occasionally (→ cost savings reinforced)" + "same framework (→ MME confirmed)". If you separate the keywords, map each to a feature, and then choose the option that satisfies all the keywords at the same time, you can filter out trap options.

## A Service Map Across All 4 Domains

As you read a question, first pinpoint "which cell of this map are we in now," and many of the options are eliminated immediately.

```text
 Ingestion     Storage      Preparation   Training      Tuning
 ─────         ─────        ─────         ─────         ─────
 Kinesis  ─▶   S3      ─▶  Data Wrangler ─▶ Training Job ─▶ AMT
 Firehose      Glue        Processing Job   Built-in/Custom Bayesian
 Ground Truth  Catalog     Glue ETL/EMR     File·Pipe      Random·Grid
 (labeling)                Athena(query)    FastFile       Hyperband
                          Feature Store     Spot+checkpoint
                          Clarify(pre-training bias)  Debugger
                                                  │
   ┌──────────────────────────────────────────────┘
   ▼
 Evaluation    Deployment                  Monitoring            Security
 ─────         ─────                       ──────────            ─────
 Choose metric ─▶ Model Registry(version·approval) ─▶ Data capture ─▶ IAM (least privilege)
 Accuracy/F1   Real-time · Serverless      Model Monitor        VPC (endpoints·isolation)
 AUC · RMSE    Async · Batch Transform     ├ Data Quality       KMS (encryption at rest)
 Clarify       MME · MCE · Inference Pipeline ├ Model Quality   TLS (encryption in transit)
 (post-training bias) Variant weights (A/B) ├ Bias Drift        CloudTrail(audit)
               Pipelines · EventBridge     └ Attribution Drift  CloudWatch(metrics)
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
| Visual cleaning without code | Data Wrangler |
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
| Sparse user x item recommendation | Factorization Machines |
| Document classification, word embeddings | BlazingText |
| Efficient tuning with few trials | Bayesian |
| Early stopping of hopeless training | Hyperband |
| Training data larger than the disk | Pipe / Fast File mode |
| I/O bottleneck from repeated reads every epoch | FSx for Lustre |
| Reduce training cost (interruption allowed) | Managed Spot + checkpoints |
| Diagnosing bottlenecks and overfitting during training | Debugger |

### Domain 3 - Deployment and Orchestration (22%)

| Keyword | Correct feature |
|--------|-----------|
| Steady traffic, immediate response | Real-time endpoint |
| Intermittent traffic, scale to zero, cold start acceptable | Serverless inference |
| Large payload, long processing, individual requests | Asynchronous inference |
| Bulk scoring of an entire dataset | Batch Transform |
| Hundreds to thousands of same-type models | MME |
| A few models with different frameworks | MCE |
| Apply the same preprocessing to inference as well | Inference pipeline |
| A/B testing, gradual migration | Production variant weights |
| ML workflow DAG, CI/CD | SageMaker Pipelines |
| Register only when criteria are met | ConditionStep + Model Registry |
| Retrain when new data arrives | EventBridge → Pipeline |
| Reduce deep learning inference unit cost | Inferentia |

### Domain 4 - Monitoring and Security (24%)

| Keyword | Correct feature |
|--------|-----------|
| Whether the input distribution changed | Model Monitor (Data Quality) |
| Whether performance against the truth dropped | Model Monitor (Model Quality) + ground truth |
| Bias change in production | Bias Drift (Clarify integration) |
| Feature contribution change in production | Feature Attribution Drift |
| Access S3 and ECR without the internet | VPC endpoints (Gateway/Interface) |
| Block container outbound communication | EnableNetworkIsolation |
| Encrypt data at rest | KMS |
| Encrypt data in transit | TLS |
| Who called which API | CloudTrail |
| Latency and error-rate alarms | CloudWatch |
| Model documentation and governance | Model Cards |
| Data → training → model lineage | Lineage Tracking |
| A role with excessive permissions | IAM least privilege |

## Three Frequently Used Decision Trees

```text
[1) Inference options]
  Need an immediate response? ──No──▶ Bulk over the whole dataset? ──Yes──▶ Batch Transform
        │Yes                        └No (individual, large, long) ──▶ Asynchronous
        ▼
  Steady traffic? ──Yes──▶ Real-time (minimum 1 instance, cannot scale to 0)
        └No ──▶ Cold start acceptable? ──Yes──▶ Serverless
                                    └No ──▶ Real-time + auto scaling

[2) Algorithm]
  Are there labels? ──No──▶ Looking for outliers? ──Yes──▶ RCF
        │Yes                    └No ──▶ Grouping K-Means / dimensionality reduction PCA
        ▼
  Is the time axis central? ──Yes──▶ DeepAR
        └No ──▶ What is the data?
                      ├ Table ──▶ XGBoost / Linear Learner
                      ├ Text     ──▶ BlazingText
                      ├ Image     ──▶ Image Classification / Object Detection
                      └ Sparse interactions ──▶ Factorization Machines

[3) Evaluation metric]
  Classification? ──No──▶ Regression: RMSE (sensitive to large errors) / MAE (dampens outliers) / R²
     │Yes
     ▼
  Imbalanced? ──No──▶ Accuracy is OK
     │Yes
     ▼
  Is the cost of a miss high? ──Yes──▶ Recall
     └No ──▶ Is the cost of a false alarm high? ──Yes──▶ Precision
                            └No ──▶ F1 / AUC-ROC
```

## Reading Superlative Qualifiers

When a sentence has several conditions, what decides at the end is usually the **qualifier**.

| Qualifier | Comparison axis | Answer direction |
|--------|---------|-----------------------|
| MOST cost-effective | Cost | MME, serverless, batch, Spot, Inferentia |
| LEAST operational overhead | Operational burden | Managed and serverless services (Glue, Pipelines, serverless inference) |
| MOST secure | Security | VPC endpoints + network isolation + KMS + least privilege |
| LEAST latency | Latency | Real-time endpoint, Feature Store online, caching |
| FASTEST to implement | Implementation speed | Built-in algorithms, Data Wrangler, managed features |
| MINIMUM code changes | Code changes | Keep the existing setup + solve with configuration changes |

> ⚠️ **Trap**: Several options **technically all work.** The superlative qualifier is the only criterion that narrows the answer to one. An option that breaks the performance or availability requirement while "reducing cost" (scaling real-time to zero, discarding data, using a GPU for XGBoost) is wrong even if the cost goes down. Conversely, for "reduce operational burden," an option that builds directly on EC2 is wrong even if it works.

## Practice Decomposing Compound Conditions

This is an example not of the question format but of the **habit of decomposing conditions**. Follow with your eyes which cell each condition goes to.

Case A - "There are 2,000 per-store XGBoost models across the country, and each is invoked only a few times a day. Minimize cost."

| Condition fragment | Translation |
|-----------|------|
| 2,000 models | Many models → MME candidate |
| All XGBoost | Same framework → MME confirmed (MCE eliminated) |
| Invoked only a few times a day | Low frequency → sharing instances is advantageous |
| Minimize cost | Qualifier = cost |

Case B - "You train on regulated data. It must not pass through the internet, the container must not send data outside, and data at rest must be encrypted."

| Condition fragment | Translation |
|-----------|------|
| No internet traversal | VPC endpoints (Gateway for S3, Interface for ECR) |
| Block outbound communication | EnableNetworkIsolation |
| Encryption at rest | KMS |
| 3 conditions at once | Only an option containing all three is correct |

Case C - "A real-time fraud detection model has been deployed. Monitor whether accuracy drops over time, and retrain automatically if it does."

| Condition fragment | Translation |
|-----------|------|
| Whether accuracy drops | Model Quality monitor |
| Prerequisite for computing accuracy | Need to collect ground truth labels |
| Automatic retraining | CloudWatch alarm → EventBridge → Pipeline |
| Real-time fraud | Imbalanced, so the metric is not Accuracy |

When the conditions span two domains as **monitoring + automation**, as in Case C, one of the options usually does "monitoring only" and another does "automation only." The option that contains both is the answer. Conversely, an option that adds a lot of features when there is only one condition is over-engineered and loses under the "LEAST operational overhead" criterion. Matching the number of conditions against the number of components in each option is also a quick elimination method.

## Wrong-Answer Patterns: Symptom → Cause → Fix

| Symptom (how people tend to get it wrong) | Cause | Fix |
|------------------------|------|------|
| Chose Accuracy for imbalanced data | Reflexive reaction to the word "accuracy" | Build the habit of first finding the sentence with the data ratio |
| Chose the option that scales a real-time endpoint to 0 | Forgot the real-time minimum of 1 instance | Scaling to 0 is only for serverless, asynchronous, and batch |
| Chose Batch Transform for individual requests | Judged only by payload size | "Individual requests" means asynchronous, "entire dataset" means batch |
| Chose KMS for a network requirement | Simple association of security = encryption | For network use VPC endpoints and isolation; for storage use KMS |
| Chose CloudWatch for an audit question | Confused because both are "logs" | "Who" is CloudTrail; "how slow and when" is CloudWatch |
| Chose a regression algorithm for a time series | Association of forecasting = regression | If the time axis is central, DeepAR |
| Chose a technically workable option and it was wrong | Did not read the superlative qualifier | Underline the qualifier in the last line of the question |
| Chose an option that satisfies only 2 of 3 conditions | Did not count the conditions to the end | Count the conditions and check each option |

Now it is time for the real thing. Solve 8 questions. Tomorrow we reorganize these wrong-answer patterns by trap type.

## 📖 Glossary

- **Integrated scenario question**: A case-style question in which conditions from several domains are mixed into one question. It is the mainstream format on the real exam.
- **Condition keyword**: A decisive word that separates the answer (intermittent, bulk, imbalanced, time series, drift, internet blocked, and so on). Extract these first from the question.
- **Superlative qualifier**: An expression that specifies the comparison criterion, such as MOST cost-effective or LEAST operational overhead. When several options all work, it narrows the answer to one.
- **Elimination method**: A solving approach that reduces candidates by crossing out options that violate even one requirement. The more conditions, the more powerful it is.
- **Over-engineered option**: An option that presents a much more complex setup than the requirement. It tends to be wrong in questions based on operational burden.
- **Scale to zero**: Bringing instances down to 0 when there are no requests, eliminating cost. Possible only for serverless, asynchronous, and batch, not real-time.
- **Ground truth**: The actual outcome label used to judge whether a prediction was correct. Without it, Model Quality monitoring cannot work.
- **Pace**: The time budget of an average of 2 minutes per question. The discipline of guessing, marking, and moving on when stuck keeps the pace.

---

## 📝 Practice Questions

**Question 1.** A fintech company wants to detect credit card fraud in real time. 99.7% of transactions are legitimate, and the cost of missing fraud is very high. Which evaluation metric should take priority?

A) Accuracy  
B) Recall (with F1 and AUC-ROC as supplements)  
C) RMSE  
D) R² coefficient of determination  

**Answer: B**  
Explanation: With extreme imbalance (99.7% legitimate) and a high cost of missing fraud, prioritize Recall, which minimizes false negatives, and look at overall balance with F1 and AUC. A gives 99.7% just by predicting "all legitimate," so it does not show fraud detection ability, and C and D are regression metrics, unsuitable for classification evaluation.

---

**Question 2.** There are per-store demand forecasting XGBoost models for 2,000 stores nationwide. Each model is invoked only a few times a day, and the cost of 2,000 endpoints is a burden. What is the most cost-effective deployment?

A) A separate real-time endpoint per store  
B) Multi-model endpoint (MME)  
C) Multi-container endpoint (MCE)  
D) An inference pipeline bundling the 2,000  

**Answer: B**  
Explanation: "A very large number of models of the same framework (XGBoost) with low individual invocation frequency" is exactly the condition for MME, which dynamically loads and shares models on a small number of instances to greatly lower cost. A makes cost explode with 2,000 endpoints, C is for a few models of different frameworks, and D is a sequential preprocessing→inference chain, unrelated to serving many models.

---

**Question 3.** A medical imaging model receives a 250 MB image per individual request and runs inference for about 8 minutes, and the result is retrieved from S3 after completion. What is the most appropriate inference option?

A) Real-time endpoint  
B) Serverless inference  
C) Asynchronous inference  
D) Batch Transform  

**Answer: C**  
Explanation: A 250 MB payload and 8 minutes of processing exceed the real-time/serverless limits (6 MB, 4 MB / 60 seconds), and the pattern of receiving individual requests in a queue and storing results in S3 matches asynchronous inference (up to 1 GB and 60 minutes) exactly. A and B are eliminated by payload and time constraints, and D is a bulk method over an entire dataset, which differs from the "individual request" pattern.

---

**Question 4.** You train on regulated data, and the training container must access S3 and ECR without going through the internet and must block data exfiltration to the outside. What is the most appropriate setup?

A) Only strengthen the IAM policy  
B) Training inside the VPC + S3 and ECR VPC endpoints + network isolation (EnableNetworkIsolation)  
C) Apply only KMS encryption  
D) Public subnet + security group  

**Answer: B**  
Explanation: The combination of training inside the VPC + non-internet access via VPC endpoints + blocking outbound communication via network isolation satisfies the requirements exactly. A cannot provide network isolation through permissions alone, C is only encryption at rest and unrelated to the network, and D leaves public exposure, which contradicts the requirement to block exfiltration.

---

**Question 5.** A data scientist wants to visually explore and clean an S3 dataset with almost no code, apply missing-value imputation and encoding, and then export that flow into a training pipeline. What is the most appropriate tool?

A) Amazon EMR (hand-coding Spark)  
B) SageMaker Data Wrangler  
C) Amazon Athena  
D) AWS Lambda  

**Answer: B**  
Explanation: Data Wrangler performs data exploration, cleaning, and feature transformation without code through a visual interface and can export the flow to a processing job or pipeline, matching the requirements. A requires hand-coding Spark, C is a SQL analytics query tool, and D is general-purpose function execution with no visual data preparation features.

---

**Question 6.** You want to monitor whether the prediction accuracy of a production model drops over time (against the actual truth). What setup is needed?

A) Model Monitor - Data Quality monitor only  
B) Model Monitor - Model Quality monitor + collecting actual truth (ground truth)  
C) A one-time Clarify bias analysis run  
D) CloudTrail log analysis  

**Answer: B**  
Explanation: Monitoring prediction performance degradation (against the truth) requires a Model Quality monitor, and to compute it you must collect the actual ground truth labels and compare them with the predictions. A's Data Quality sees only input distribution changes and cannot evaluate performance against the truth, C is a one-time bias analysis, and D is an API audit log unrelated to model performance.

---

**Question 7.** You want to forecast demand for the next 30 days from multivariate time series sales data. Which SageMaker built-in algorithm is best suited to learning the patterns of multiple related time series together?

A) Linear Learner  
B) DeepAR  
C) K-Means  
D) Random Cut Forest  

**Answer: B**  
Explanation: DeepAR is a built-in algorithm specialized in learning multiple related time series together to forecast future intervals, and it is suitable for multivariate demand forecasting. A is simple regression and cannot capture time series structure, C is clustering, and D is an anomaly detection algorithm, differing from the forecasting purpose.

---

**Question 8.** Whenever new training data arrives in S3, you want to automatically perform retrain → evaluate → (if criteria are met) register, and manage model versions and approval status. What is the most appropriate combination?

A) Repeat only a single training job with cron  
B) EventBridge trigger → SageMaker Pipeline (ConditionStep) → Model Registry registration/approval  
C) A person runs a notebook manually  
D) Model Monitor performs retraining directly  

**Answer: B**  
Explanation: EventBridge starts the Pipeline from the S3 event, and the ConditionStep registers and manages approval in the Model Registry only when the evaluation criteria are met; this is the standard pattern for automatic-retraining MLOps. A has no evaluation, conditions, or version management, C is not automation, and D is inappropriate because Model Monitor is not the entity that runs retraining.

---
