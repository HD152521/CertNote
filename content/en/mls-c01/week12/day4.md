# Day 4 - Synthesis: 4 Domains + End-to-End Scenarios

## 📌 Key Takeaways

- The four domains are not separate subjects but **one pipeline.** Domain 1 moves the data, Domain 2 refines it, Domain 3 builds the model, and Domain 4 deploys and operates it.
- Late-exam scenario questions **mix** the domains — a single passage makes you choose Streams (D1) + F1 (D3) + Canary (D4) at the same time.
- The decision points are mostly tested as **pairs**: Streams↔Firehose, Glue↔EMR, Canary↔Shadow, Monitor↔Debugger, precision↔recall.
- For questions you do not know, narrow down with a four-step reduction: **data shape → latency and scale → management burden → business cost.**
- The 12-week map: weeks 1-4 data and statistics, weeks 5-6 algorithm selection, weeks 7-12 modeling and implementation/operations.

## Four-Domain Integration Map: One Pipeline

```text
Domain 1: DATA         Domain 2: EDA         Domain 3: MODELING      Domain 4: OPS
────────────────────────────────────────────────────────────────────────────────────
Kinesis Streams   →   Clean missing values →  Tabular data + trees →  Real-time endpoint
S3 data lake      →   One-Hot encoding      →  XGBoost + AMT       →  Auto Scaling
Glue ETL          →   Correlation checks    →  Bayesian tuning     →  Drift monitoring
Athena SQL        →   Distribution plots    →  F1 (for imbalance)  →  Canary deployment
                                            →  Residual plot       →  Model Registry
```

- Each domain's output becomes the next domain's input as-is.
- A wrong choice in an earlier stage throws everything after it off — which is why the exam mixes domains.

## The Key Contrast Table Where the Exam Splits Answers

| Pair | Deciding criterion | Left-side clue | Right-side clue | Example |
|---|---|---|---|---|
| Streams ↔ Firehose | Consumer control and replay vs fully managed delivery | Milliseconds, multiple consumers, replay | Serverless, buffer then load into S3 | Multiple teams reading means Streams; a log copy means Firehose |
| Glue ↔ EMR | Serverless vs cluster control | Fast ETL, schema catalog | Spark version/library tuning | "Fast ETL" = Glue, "Spark tuning" = EMR |
| Athena ↔ Redshift | Ad hoc queries vs warehouse | Serverless SQL on S3 | Large-scale structured analytics, always-on BI | Log exploration = Athena, company-wide reporting = Redshift |
| XGBoost ↔ CNN | Data shape | Mixed numeric/categorical columns | Pixels, photos, object locations | Fraud = XGBoost, face verification = CNN |
| Scaling needed ↔ not needed | Does it use distances or gradients | KNN, SVM, neural networks, PCA | Trees, XGBoost | "Standardization is mandatory for XGBoost" is a trap |
| Precision ↔ Recall | FP cost vs FN cost | False positives are expensive | False negatives are expensive | Spam = precision, disease screening = recall |
| Accuracy ↔ F1, PR-AUC | Whether classes are balanced | Roughly balanced | Extreme imbalance, positives 0.5-5% | 99.5% accuracy with 0.5% fraud is meaningless |
| Real-time ↔ Serverless | Is traffic constant | Constant low latency | Intermittent calls, cold start OK | Public API vs internal tool |
| Batch ↔ Async | Bulk vs per-request queuing | Nightly bulk scoring, no endpoint needed | Large payload, long processing | Scoring 10 million images overnight = Batch |
| Canary ↔ Shadow | Do results reach users | Some real users, gradual shift | Traffic mirrored only, responses not returned | "Risk-free validation" = Shadow |
| Monitor ↔ Debugger | After deployment vs during training | Input distribution change, performance drop | Gradient explosion/vanishing | CTR drop 6 weeks after deployment = Monitor |
| Monitor ↔ CloudWatch | Model quality vs infrastructure | Drift, baseline deviation | Latency, invocation count, error rate | For API auditing it is neither: CloudTrail |
| Debugger ↔ Clarify | Training process vs bias and explanation | Training tensor/gradient diagnostics | Disparate Impact, SHAP | Explaining a loan rejection reason = Clarify |

> ⚠️ **Trap**: Often all the options are "technically possible." What is asked is not possibility but the **MOST appropriate** choice. Rank them along the axis the passage emphasizes (cost, latency, operational burden, regulation).

## End-to-End Scenario 1: Real-Time Fraud Detection

```text
1. DATA:     Daily fraud reports → S3 (data lake)
             Kinesis Data Streams: real-time fraud flags (consumed independently by several teams)
             Glue ETL: daily batch cleaning → deduplication, missing-value imputation

2. EDA:      Exploration shows a 0.5% fraud rate (extreme imbalance)
             merchant_id is a high-cardinality categorical → One-Hot encoding
             No scaling needed (XGBoost)

3. MODELING: XGBoost binary classification
             AMT Bayesian tuning: optimize F1 (not accuracy!)
             Diagnosis: training 85%, validation 78% → overfitting
             → Add dropout and L1 regularization
             → Final: training 80%, validation 79% (better generalization)

4. OPS:      Real-time endpoint (the user waits for the response)
             Canary deployment: 5% → 25% → 100%
             Automatic alarm if recall drops below 70%
             Model Monitor: daily baseline refresh
             On drift detection → trigger the retraining pipeline
```

| Requirement sentence | Domain | Choice | Reason |
|---|---|---|---|
| "Several teams each consume the same real-time flags, with replay after failures" | 1 | Kinesis Data Streams | Multiple consumers, replay within the retention period |
| "Daily deduplication and missing-value imputation" | 1 | S3 + Glue ETL | Lake storage + serverless transformation |
| "The fraud rate is 0.5%" | 2 | Drop accuracy, use F1 and PR-AUC | Accuracy overstates performance under imbalance |
| "merchant_id has a very large number of distinct values" | 2 | One-Hot | Unordered categorical |
| "Binary classification on structured tabular data" | 3 | XGBoost | Strong default for tabular data |
| "The tuning budget is limited" | 3 | AMT Bayesian, F1 Maximize | Efficient search that uses earlier trials |
| "Training 85% / validation 78%" | 3 | Overfitting → regularization, dropout | The train-validation gap is the signal |
| "The user waits on the checkout screen" | 4 | Real-time endpoint | Low-latency requirement |
| "Release the new model while reducing risk" | 4 | Canary 5%→25%→100% | Controls user impact in stages |
| "Detect performance drops automatically" | 4 | Model Monitor + CloudWatch alarm | Drift → retraining trigger |

## End-to-End Scenario 2: Batch Scoring for Image Quality Inspection

A case where product images taken by factory-line cameras are scored all at once overnight to pull out defect candidates.

```text
[Line cameras] → S3 (raw images) → Glue Catalog (metadata)
                     │
                     ├─ EDA: 2% defect labels · lighting/angle variation → augmentation plan
                     │
                     ├─ MODELING: Image Classification (CNN) + transfer learning
                     │        Metric: recall first (a miss = recall cost)
                     │        Training: Managed Spot Training (interruption tolerated)
                     │
                     └─ OPS: Nightly Batch Transform (S3 input → S3 output)
                              No always-on endpoint → zero cost during the day
                              Weekly retraining: Pipelines + Model Registry
```

| Requirement sentence | Domain | Choice | Reason |
|---|---|---|---|
| "Hundreds of thousands of images pile up per hour" | 1 | S3 + Glue Catalog | Large-volume object storage and metadata |
| "Defective samples are only 2%" | 2 | Data augmentation, class weights | Reinforce the minority class |
| "It is image data" | 3 | Image Classification (CNN) | Data shape determines the algorithm |
| "Missing a defect means a costly product recall" | 3 | Recall-focused threshold | FN cost > FP cost |
| "Score everything overnight, no calls during the day" | 4 | Batch Transform | Removes the always-on endpoint cost |
| "Weekly retraining + approval process" | 4 | Pipelines + Model Registry | Automation plus version and approval governance |

> ⚠️ **Trap**: The word "real-time" does not always mean a Real-time Endpoint. Real time in data **ingestion** (Kinesis) and real time in **inference** (endpoint) are different layers. First work out which stage the requirement belongs to.

## End-to-End Scenario 3: Operating Time-Series Demand Forecasting

A case where weekly demand for thousands of SKUs is forecast and handed to the supply-chain system in batches.

```text
[Store POS / RDS] ─DMS→ S3 ─Glue/Athena→ daily/weekly aggregate tables
                                   │
                                   ├─ EDA: missing weeks, cold start for new SKUs
                                   │        Split by time point (no random shuffling)
                                   │
                                   ├─ MODELING: DeepAR (many related time series)
                                   │        Promotions/holidays = related time series / categorical features
                                   │        Metrics: RMSE / MAE (no classification metrics)
                                   │
                                   └─ OPS: Batch Transform once a week → S3 → supply-chain integration
                                            Seasonal change → Model Monitor + scheduled retraining
```

| Requirement sentence | Domain | Choice | Reason |
|---|---|---|---|
| "Sales history lives in an on-premises relational DB" | 1 | Migrate to S3 with DMS | Service dedicated to database migration |
| "How do we split training and validation?" | 2 | Split by time point | Random shuffling leaks data in time series |
| "Train thousands of related time series together" | 3 | DeepAR | Suited to global training across many series |
| "External variables such as promotions and holidays" | 3 | Feed in related time series / categorical features | Reflects exogenous variables |
| "Evaluate the forecast error" | 3 | RMSE / MAE | Regression metrics (F1 is wrong) |
| "Handing over the results as a file once a week is enough" | 4 | Batch Transform → S3 | No always-on endpoint needed |
| "The pattern changes with the season" | 4 | Model Monitor + scheduled retraining | Responds to drift |

In scenario questions, the real constraint is hidden in the **last sentence.** A trailing sentence like "However, an always-on endpoint is not needed" or "There must be no impact on users" flips the answer.

## Question Type → Solving Strategy Table

| Question type | Clue to check first | Elimination rule | Typical answer candidates |
|---|---|---|---|
| "Which service should be used" | Data shape · scale/latency · management burden | Remove options that contradict the required management level | Streams / Firehose / Glue / EMR / Athena |
| "Is this data leakage" | Time order, can the feature be built at prediction time | Remove options with future information or target-derived features | Time-based split, fit on the training set only |
| "Fix the overfitting" | The gap between training and validation scores | If both are low it is underfitting → remove stronger regularization | Regularization, early stopping, dropout, augmentation |
| "Which metric to use" | Class balance, FP/FN cost, regression/classification | Remove F1/AUC for regression, RMSE/R² for classification | F1 / PR-AUC / recall / precision / RMSE |
| "Deploy safely" | May results reach users | Remove Canary when "risk-free" is required | Shadow, Canary, Linear, Blue/Green |
| "Performance got worse after deployment" | Is it during training or after deployment | Remove training-time tools (Debugger) | Model Monitor + alarm + retraining |
| "Reduce cost" | Traffic pattern, need for always-on operation | Remove always-on Real-time options | Batch, Serverless, Spot, Multi-Model |
| "Explanation/fairness required" | Regulation/audit, rationale for individual decisions | Remove drift and logging tools | Clarify (SHAP, Disparate Impact) |
| Multiple answers (choose 2-3) | The number of answers in the instruction | Remove options that overlap at the same layer | Combinations across different layers (ingestion + storage, deployment + monitoring) |

## Exam Weighting and Typical Question Forms by Domain

| Domain | Weight | Typical question form | Answer axis |
|---|---|---|---|
| 1. Data Engineering | 20% | Choosing ingestion, storage, and ETL services | The four Kinesis services, S3/Glue/EMR/Athena/Redshift, DMS |
| 2. Exploratory Data Analysis | 24% | Preprocessing, encoding, imbalance, leakage judgments | One-Hot, standardization, SMOTE, PCA, correlation/outliers |
| 3. Modeling | 36% | Algorithm selection, tuning, metrics, overfitting diagnosis | XGBoost/CNN/DeepAR/RCF, AMT, F1/RMSE |
| 4. ML Implementation and Operations | 20% | Deployment type, safe rollout, monitoring, cost | Batch/Serverless/Async, Canary/Shadow, Clarify |

In questions that mix domains, some options are "right in only one domain." The algorithm is right but the deployment type is wrong, or the metric is right but the ingestion service is wrong. An option is correct **only when the whole sentence is true.**

## Elimination Checklist for Quickly Crossing Out Wrong Answers

- [ ] "Fully managed / minimal operations" but the option spins up a cluster yourself → eliminate
- [ ] "No always-on endpoint needed" but Real-time always-on operation → eliminate
- [ ] Imbalance is stated but the option is based on Accuracy → eliminate
- [ ] F1/AUC for regression, RMSE/R² for classification → eliminate
- [ ] Multi-class but the output activation is Sigmoid → eliminate
- [ ] Maximize an error metric / Minimize a performance metric → eliminate
- [ ] Using t-SNE output as model input or to transform new data → eliminate
- [ ] CloudTrail (auditing) or Elastic Inference as the answer for drift → eliminate
- [ ] Debugger for a post-deployment problem, Model Monitor for a during-training problem → eliminate

In the next note, we bundle the exam structure and time allocation, the requirement translation table, and a full roundup of traps into a single page to build a D-Day operating manual.

## 📖 Glossary

- **End-to-end pipeline** : The whole flow that connects everything from data ingestion to model deployment and monitoring.
- **Cross-domain question** : A scenario-style question that makes you choose two or more of ingestion, preprocessing, modeling, and operations in a single passage.
- **Multi-consumer** : A structure in which several applications each read the same stream without interfering with one another. A strength of Kinesis Data Streams.
- **Replay** : Re-reading and reprocessing past records within the retention period. Used for failure recovery.
- **High-cardinality** : A column with a very large number of distinct categorical values (e.g., merchant_id). Expanding it with One-Hot makes the dimensionality explode.
- **Canary deployment** : A gradual shift in which only part of the traffic goes to the new model first, and the percentage is raised if there are no problems.
- **Shadow testing** : Risk-free validation that mirrors real traffic to the new model too but does not return its responses to users.
- **Drift** : The phenomenon where the distribution of production inputs, or the input-output relationship, differs from training time. Detected with Model Monitor.
- **MOST appropriate** : Exam phrasing meaning that when several options would all work, you pick the one that best fits the constraint the passage emphasizes.

## 📝 Practice Questions

**Question 1.** A fintech company ingests mobile app clickstream data at millisecond granularity; the fraud detection team and the recommendation team must each consume the same stream independently, and the previous 1 day of data must be reprocessed after a failure. Which ingestion service is MOST appropriate?

A) Kinesis Data Firehose  
B) Amazon SQS FIFO  
C) AWS Glue batch job  
D) Kinesis Data Streams  

**Answer: D**  
Explanation: When multiple consumers read independently and reprocessing within the retention period is required, Data Streams, which controls shards and the retention period, is the correct answer. Firehose (A) is solely for fully managed delivery, SQS FIFO (B) deletes messages on consumption and is weak for multiple independent consumers and reprocessing, and Glue (C) is batch ETL.

---

**Question 2.** Credit approval data is extremely imbalanced, with a default (positive) rate of 2%. You want to compare candidate models by discriminative power independent of the threshold, and then set the operating threshold separately according to FN/FP costs. Which evaluation approach is MOST appropriate?

A) Compare models by accuracy at a threshold of 0.5  
B) Compare models by RMSE  
C) Compare models by the AUC of the PR curve, and decide the threshold afterward at the minimum point on the cost curve  
D) Choose the model with the highest R²  

**Answer: C**  
Explanation: Under extreme imbalance, PR-AUC is an honest measure of discriminative power, and the standard approach is a two-step separation in which the operating threshold is decided afterward according to the cost structure. Accuracy (A) is overestimated under imbalance, and RMSE (B) and R² (D) are regression metrics and unsuitable for classification.

---

**Question 3.** A data scientist wants to explore logs in an S3 data lake with standard SQL without provisioning a cluster, and visualize the results in a dashboard. Which combination is MOST appropriate?

A) EMR + Kibana  
B) Athena + QuickSight  
C) Redshift Spectrum + CloudWatch  
D) Glue crawler + CloudTrail  

**Answer: B**  
Explanation: Athena queries S3 with serverless SQL and QuickSight visualizes the results as a BI dashboard, making the combination optimal for cluster-free exploration and visualization. EMR (A) requires cluster operation, and CloudWatch (C) and CloudTrail (D) are monitoring and auditing tools, not for analytical visualization.

---

**Question 4.** You want to quickly optimize, with a small tuning budget, a model that predicts churn from structured tabular data (mixed numeric and categorical, with some missing values). Which combination of algorithm and tuning strategy is MOST appropriate?

A) XGBoost + Bayesian optimization (AMT)  
B) CNN + Grid Search  
C) DeepAR + Random Search  
D) K-Means + manual tuning  

**Answer: A**  
Explanation: XGBoost is a strong default for structured tabular data, and efficient tuning on a small budget is Bayesian optimization, which uses previous trials. CNN (B) is for images, DeepAR (C) is for time series, and K-Means (D) is unsupervised clustering and does not fit a supervised classification problem.

---

**Question 5.** You only need to classify 10 million images in one pass overnight and store the results in S3, and no always-on endpoint is needed during the day. Which inference method is MOST cost-effective?

A) Run a Real-time Endpoint at all times  
B) Serverless Inference  
C) Batch Transform  
D) Keep Asynchronous Inference always running  

**Answer: C**  
Explanation: When a large volume of data is processed in one pass at a set time and an always-on endpoint is unnecessary, Batch Transform is the most cost-effective. Always-on Real-time (A) and always-on Async (D) incur unnecessary standing costs, and Serverless (B) is for per-request invocation, so Batch takes priority for large-volume bulk processing.

---

**Question 6.** The click-through rate of a recommendation model deployed to production has been declining gradually since 6 weeks after deployment. You want to automatically detect whether the input user behavior distribution has changed from training time and trigger retraining when a threshold is exceeded. Which configuration is MOST appropriate?

A) Track API calls with CloudTrail  
B) Accelerate inference with Elastic Inference  
C) Add models with a Multi-Model Endpoint  
D) Detect drift with Model Monitor and trigger the retraining pipeline with a CloudWatch alarm  

**Answer: D**  
Explanation: Model Monitor detects drift in production inputs relative to the baseline, and a CloudWatch alarm can trigger retraining automation. CloudTrail (A) is for auditing, Elastic Inference (B) is for inference acceleration, and Multi-Model (C) is for hosting efficiency; none is related to responding to drift.

---

**Question 7.** For a loan underwriting model in a regulated industry, you must quantitatively measure prediction fairness across gender and race groups and explain the basis of individual rejection decisions (which features contributed and by how much). Which service is MOST appropriate?

A) SageMaker Debugger  
B) SageMaker Clarify  
C) CloudWatch Logs Insights  
D) SageMaker Model Monitor alone  

**Answer: B**  
Explanation: Measuring bias between groups (such as Disparate Impact) and explaining individual predictions based on SHAP are both roles of Clarify. Debugger (A) deals with tensors and gradients during training, CloudWatch Logs (C) is for log analysis, and Model Monitor alone (D) detects drift and is not dedicated to fairness or explainability.

---

**Question 8.** A team wants to standardize, as code, everything from data processing to training, evaluation, and conditional model registration, automatically retrain every week with new data, and manage versions and approvals. Which combination is MOST appropriate?

A) Define a DAG with SageMaker Pipelines and manage versions and approvals with Model Registry  
B) Run the steps sequentially with a cron shell script on EC2  
C) Run the entire training job directly from a single Lambda function  
D) Register the model with a Glue crawler  

**Answer: A**  
Explanation: SageMaker Pipelines defines ML steps as a DAG and provides reproducibility, automatic retraining, and CI/CD, while Model Registry manages versions and approvals. A cron script (B) is weak in standardization and reproducibility, Lambda alone (C) is unsuitable for long-running training, and a Glue crawler (D) is for data cataloging.

---
