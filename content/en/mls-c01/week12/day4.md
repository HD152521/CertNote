# Day 4 - Synthesis: 4 Domains + End-to-End Scenarios

Final day: integrate all four domains through **real test scenarios** that blend them.

## Integration Map: Four Domains as One Pipeline

```
Domain 1: DATA           Domain 2: EDA           Domain 3: MODELING      Domain 4: OPS
─────────────────────────────────────────────────────────────────────────────────
Kinesis Streams   →   Clean nulls            Tabular + trees  →      Real-time endpoint
S3 lake           →   One-Hot encode        XGBoost + AMT            Auto-scale
Glue ETL          →   Correlation check     Bayesian tuning          Monitor drift
Athena SQL        →   Distribution plot     F1 (imbalance)           Canary deploy
                                            Residual plot             Model Registry
```

Each domain's output flows to next.

## Key Distinctions That Trip Tests

| Pair | When/Why | Example |
|------|------|------|
| Streams vs Firehose | Multi-consumer/replay vs managed-drop | Same IoT → Streams (many teams), then copy → Firehose (append log) |
| Glue vs EMR | Serverless vs cluster control | "Quick ETL" → Glue, "tune Spark" → EMR |
| XGBoost vs CNN | Tabular vs image | Fraud (Xgb) vs face verify (CNN) |
| Precision vs Recall | FP vs FN cost | Spam (precision), cancer (recall) |
| Real-time vs Serverless | Steady vs sparse | API (real-time), internal tool (serverless) |
| Canary vs Shadow | Risk vs zero-risk | "Production users" → canary, "lab test" → shadow |
| Model Monitor vs Debugger | Drift vs training | Post-deploy drift → Model Monitor, training issue → Debugger |

## Scenario Walkthrough: Fraud Detection

```text
1. DATA: Daily fraud reports → S3 (lake)
         Kinesis Streams: real-time fraud flags (multi-team)
         Glue ETL: daily clean → dedupe, impute

2. EDA:  Explore: 0.5% fraud (extreme imbalance)
         One-Hot encode merchant_id (high-cardinality)
         No scaling needed (XGBoost)

3. MODELING: XGBoost binary classification
             AMT Bayesian: optimize F1 (not accuracy!)
             Diagnosis: Train 85%, Val 78% (overfitting)
             → Add dropout, L1 regularization
             → Final: Train 80%, Val 79% (better)

4. OPS:   Real-time endpoint (user waits)
          Canary deploy: 5% → 25% → 100%
          Auto-alarm if recall drops below 70%
          Model Monitor: daily baseline refresh
          If drift detected → retrain pipeline
```

## Compressed Test Roadmap

**Question Type → Answer Strategy**

1. **"Which service?"** → Narrow by 3 axes (data type, scale, managed?)
2. **"Is this leakage?"** → Time? Feature generatable at predict time?
3. **"Fix overfitting?"** → Regularize, early-stop, more data, drop features
4. **"Which metric?"** → Imbalance/business cost → F1/Recall/Precision
5. **"Deploy safely?"** → Shadow (zero risk), Canary (gradual), Real-time (production)
6. **"Post-deploy fail?"** → Model Monitor (drift), Debugger (train anomaly)

## Summary

All four domains form one pipeline. Domain 1 moves data, Domain 2 preps it, Domain 3 builds models, Domain 4 ships them. Tests blend domains: pick Streams (domain 1) + F1 (domain 3) + canary (domain 4) based on scenario.

MLS-C01 is over. Weeks 1-4 (data, stats), 5-6 (alg select), 7-12 (modeling + ops).

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
