# Day 3 - Full-Length Practice Test: Four-Domain Integrated Scenarios

Today runs exam-pace **full scenarios** mixing four domains without labels. Real exam won't say "this is Domain 1." Instead: "Fintech fraud detection with imbalanced data, real-time inference, cost limit, multi-team tracking" blends Domains 1, 2, 3, 4. Core skill: **spot decision keywords, translate to functions fast.**

## Practice Test Method

Eight scenarios below. Try to finish in ~16 minutes (2 min/question), then check answers. Before looking, ask yourself: "What domain(s)? Which keywords unlock the answer?" If wrong, explain "why this trap, why that's best."

> 💡 **Related Theory**: Compound questions usually hide 2-3 keywords each. "Hundreds of identical models (→MME) + sporadic calls (→cost cut) + same framework (→MME confirmed)." Extract each, map to function, pick option satisfying all. Mismatch-hunting eliminates traps.

## Quick Reference by Domain

| Domain | Keywords → Function |
|--------|--------|
| 1 Data | Real-time→Kinesis, visual prep→Data Wrangler, feature match→Feature Store, bias→Clarify |
| 2 Model | Time series→DeepAR, anomaly→RCF, efficient tune→Bayesian/Hyperband, imbalance→F1/Recall |
| 3 Deploy | Sporadic+0-scale→serverless, bulk→batch, ML CI/CD→Pipelines, event trigger→EventBridge |
| 4 Monitor | Drift→Model Monitor, isolate→VPC Endpoint, encrypt at-rest→KMS, audit→CloudTrail |

Now eight scenarios.

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
