# Day 2 - Domain 3&4 Integrated Review: Deployment/Orchestration + Monitoring/Security

Yesterday's data and model synthesis now becomes "operations lifecycle" — deploy, orchestrate, monitor, secure. **Domain 3 (Deployment/Orchestration, 22%)** is inference options and ML pipeline automation. **Domain 4 (Monitoring/Security, 24%)** is post-deployment sensing and protection. Combined = 46% of exam.

Core message: **Models don't end at deployment; you automate continuously (pipelines), monitor continuously (drift detection), and protect continuously (IAM/VPC/KMS).** Request patterns shape inference; "what changed" drives monitoring; "least privilege + isolation + encryption" drives security.

## Domain 3: Inference Options — Request Pattern Decides

Four options, chosen NOT by algorithm but **request pattern**.

| Option | Response | Traffic | Payload/Time | Always-On Cost |
|--------|----------|---------|--------------|----------------|
| Real-time | Sync, ms~sec | Steady | <6MB, <60sec | Yes (min 1) |
| Serverless | Sync, ms~sec | Sporadic | <4MB, <60sec | No (0 scale) |
| Async | Queue-based | Variable, long | <1GB, <60min | No (0 scale) |
| Batch Transform | Job-based | Bulk | Whole dataset | No (terminate) |

> 💡 **Related Theory**: Decision axes: "immediate+steady" → real-time, "immediate+sporadic+cold-start OK" → serverless, "bulk payload+long+queue" → async, "whole dataset batch" → batch. Add cost levers: multi-model (many models) → MME, deep learning inference → Inferentia, many idle windows → serverless/async/batch to 0.

## Domain 3: SageMaker Pipelines and MLOps

**SageMaker Pipelines** = ML-native DAG orchestrator linking data process → train → evaluate → register → deploy. **ConditionSteps** gate decisions ("accuracy > threshold? register"). **Model Registry** catalogs versions, approval status.

| MLOps Need | Service |
|-----------|---------|
| ML workflow DAG orchestration | SageMaker Pipelines |
| Model version, approval mgmt | Model Registry |
| Generic workflow (Lambda+Glue+...) | Step Functions |
| Infrastructure as code | CloudFormation / CDK |
| Code commit→build→deploy CI/CD | CodePipeline + CodeBuild |
| Event-based trigger (retrain) | EventBridge |

> 🔍 **Deeper**: Pipelines vs Step Functions. Pipelines **SageMaker-specialized**, cleanest ML expression, lineage+Registry integration. Step Functions **generic**, chains Lambda/Glue/anything, non-ML steps heavy. "Auto-retrain on new data" → EventBridge triggers Pipeline.

## Domain 4: Model Monitor — What Changed

Post-deployment, models **silent degrade as data/world shifts**. Model Monitor watches four types.

| Monitor Type | Watches |
|-----------|---------|
| Data Quality | Input data stats/schema drift (covariate drift) |
| Model Quality | Actual accuracy vs predictions (needs ground truth) |
| Bias Drift | Prediction bias shifts (fairness) |
| Feature Attribution Drift | Feature importance changes (SHAP) |

Flow: baseline (training stats) → run periodic Processing Jobs → compare → CloudWatch alerts on violation.

> ⚠️ **Trap**: "Drift detection" almost always = Model Monitor. Input distribution change → Data Quality. Performance drop (ground truth vs prediction) → Model Quality. **Model Quality needs actual labels (ground truth)** — if delayed, use Data Quality/Feature Attribution as early signal. Bias/feature changes → Clarify-integrated monitors.

## Domain 4: Security — IAM, VPC, KMS

ML security's three pillars: **permissions (IAM), isolation (VPC), encryption (KMS)**.

- **IAM**: Least privilege. Execution roles get S3/ECR/CloudWatch/KMS needed only. User gets API call + PassRole.
- **VPC**: Training/endpoints inside VPC, no internet. **VPC Endpoints (PrivateLink)** for S3/ECR/APIs without internet. `EnableNetworkIsolation` blocks all outbound.
- **KMS**: At-rest data encryption — S3 data, EBS volumes, model artifacts. Execution role needs `kms:Decrypt`. In-transit → TLS.

> 💡 **Related Theory**: Security scenarios reduce to three questions. "Who does what?" (IAM). "Where do packets go?" (VPC/Endpoint/isolation). "Is data protected?" (KMS at-rest + TLS in-transit). "Sensitive data, no internet" → VPC + Endpoints + Isolation. "Regulated encrypt at-rest" → KMS. "Notebook too powerful" → IAM least privilege.

## Domain 4: Governance and Audit

**CloudTrail** = API call audit log ("who deleted the endpoint?"). **CloudWatch** = metrics/logs/alarms ("is latency high?"). **Model Cards** = model documentation/governance. **Lineage** = data→train→model trail.

> 🔍 **Deeper**: CloudTrail = "who did what (API audit)," not "how is system running." CloudWatch = "system health metrics/logs." Don't mix them. "Who deleted X?" → CloudTrail. "Endpoint high error?" → CloudWatch.

## Summary

Domains 3&4 = "deployment lifecycle." **Inference option** picked by request pattern (real-time/serverless/async/batch), automated via **Pipelines+Registry+EventBridge**, monitored via **Model Monitor** (Data/Model Quality/Bias/Attribution drift), protected via **IAM (perms) + VPC (network) + KMS (encrypt) + CloudTrail (audit)**. Keywords: "drift→Monitor," "bias→Clarify," "isolate→VPC Endpoint," "encrypt→KMS."

That's all four domains. Next: synthesized full scenarios.

---

## 📝 Practice Questions

**Question 1.** You want to automatically detect whether the input data distribution of a production classification endpoint drifts from training time over time (covariate drift) and be notified on violations. Which is the most appropriate solution?

A) Run SageMaker Clarify alone  
B) SageMaker Model Monitor — Data Quality monitor + CloudWatch alarm  
C) Analyze CloudTrail logs  
D) Redeploy the endpoint every week  

**Answer: B**  
Explanation: The Data Quality monitor in Model Monitor periodically compares the baseline statistics from training with production input data to detect distribution changes (covariate drift) and sends notifications through CloudWatch on violations. A is a one-time bias and explainability analysis, C is an API audit log unrelated to data distribution, and D is an inefficient approach of redeploying blindly without any detection.

---

**Question 2.** Each time new training data arrives in S3, you want to automatically run data processing → training → evaluation → (if accuracy passes the threshold) model registration. Which configuration is the most appropriate?

A) A person manually runs the notebook each time  
B) An EventBridge rule triggers a SageMaker Pipeline, and a ConditionStep in the pipeline registers the model in Model Registry when the threshold is met  
C) Repeat only a single training job on a cron schedule  
D) Trigger training with Model Monitor  

**Answer: B**  
Explanation: EventBridge starts the Pipeline from the S3 event, and the Pipeline's ConditionStep gates registration so the model is registered in Model Registry only when evaluation accuracy exceeds the threshold, which is the standard MLOps automation pattern. A is not automation, C has no evaluation, condition, or registration steps, and D is inappropriate because Model Monitor is not meant to trigger training.

---

**Question 3.** In a regulated industry, a SageMaker training job processes sensitive data, must access S3 and ECR without traversing the internet, and must block outbound communication from the container. Which configuration is the most appropriate?

A) Deploy in a public subnet and configure only security groups  
B) Train inside a VPC + VPC endpoints (PrivateLink) for S3 and ECR + network isolation (EnableNetworkIsolation)  
C) Only tighten IAM policies  
D) Only apply KMS key encryption  

**Answer: B**  
Explanation: Training inside a VPC, reaching S3 and ECR through VPC endpoints without the internet, and blocking the container's outbound communication with network isolation exactly meets the requirements of "no internet traversal + blocked outbound communication." A leaves public exposure, C cannot provide network isolation through permission control alone, and D is only encryption at rest and unrelated to network isolation.

---

**Question 4.** A security audit needs to determine "who deleted the production endpoint last month." Which service is the most appropriate?

A) Amazon CloudWatch metrics  
B) AWS CloudTrail  
C) SageMaker Model Monitor  
D) SageMaker Clarify  

**Answer: B**  
Explanation: CloudTrail records AWS API calls, so you can audit who called the endpoint deletion (DeleteEndpoint) API, when, and with which credentials. A is for operational metrics and logs, not for tracking API actors, and C monitors model drift and D analyzes bias and explainability, so both differ from the audit purpose.

---

**Question 5.** Which statement most accurately describes the criteria for choosing between SageMaker Pipelines and AWS Step Functions?

A) Pipelines is only for non-ML workflows, and Step Functions is only for ML  
B) Pipelines is specialized for SageMaker steps and integrates with lineage and Model Registry, while Step Functions suits general-purpose orchestration that connects various services such as Lambda and Glue  
C) The two are functionally identical, so either can be used  
D) Step Functions cannot train models  

**Answer: B**  
Explanation: Pipelines is an ML-specific orchestrator specialized for SageMaker steps and lineage/Registry integration, while Step Functions suits general-purpose workflows that connect various AWS services such as Lambda and Glue; that is the selection criterion. A reverses the roles, C ignores the specialized versus general-purpose difference, and D is factually wrong because Step Functions can call SageMaker training steps.

---
