# Day 2 - Domains 3 & 4 Integrated Review: Deployment & Orchestration + Monitoring & Security

## 📌 Key Takeaways

- Domain 3 (Deployment & Orchestration 22%) + Domain 4 (Monitoring & Security 24%) = **46%** of the exam. Together with yesterday's 54%, that covers everything.
- A model isn't done once it's deployed — **make it repeatable (pipelines), watch it continuously (monitoring), and keep it safe (security).**
- Choose among the 4 inference options not by algorithm but by **request pattern** (immediacy, traffic, payload, processing time).
- Drift splits into the 4 Model Monitor types: input distribution = Data Quality, performance against ground truth = Model Quality (labels required), bias/attribution = Clarify integration.
- Security rests on three pillars: **permissions (IAM), isolation (VPC), encryption (KMS).** Auditing = CloudTrail, operational metrics = CloudWatch.

## The Full Map of Domains 3 & 4

Yesterday we tied together data and models. Today we organize the second-half domains that **operate** those models.

```text
[Domain 3 — Deployment & Orchestration 22%]
  Model Registry ──▶ Create model ──▶ Endpoint config ──▶ Deploy
  (versions, approval)  Model          EndpointConfig      ├ Real-time   (sync, always on)
                                       (variants, weights) ├ Serverless  (sync, scale to 0)
                                                           ├ Asynchronous (queue, large payloads)
  Orchestration                                            └ Batch transform (bulk, per job)
  EventBridge ─▶ SageMaker Pipelines(DAG) ─▶ ConditionStep ─▶ Registry ─▶ Deploy
                  Processing→Training→Eval        (stop if below the criterion)

[Domain 4 — Monitoring & Security 24%]
  Operational monitoring                   Three pillars of security
  ──────────                               ──────────
  Data capture → Model Monitor             IAM  : least-privilege execution role
      ├ Data Quality  (input distribution) VPC  : subnets + VPC endpoints + network isolation
      ├ Model Quality (vs. truth, needs labels) KMS : encryption at rest (S3, EBS, artifacts), TLS in transit
      ├ Bias Drift        (Clarify integration)
      └ Feature Attribution Drift (Clarify) Governance
             │                              CloudTrail (who called which API) · CloudWatch (metrics, logs)
             ▼                              Model Cards (documentation) · Lineage (provenance)
      CloudWatch alarm → SNS → retraining trigger
```

## Domain 3: Inference Options — The Request Pattern Decides

Choose among the 4 inference options not by algorithm but by **request pattern**.

| Option | Response | Traffic | Payload/time | Always-on cost |
|------|------|--------|---------------|----------------|
| Real-time | Sync, ms to seconds | Steady | <6MB, <60 s | Yes (at least 1 instance) |
| Serverless | Sync, ms to seconds | Intermittent | <4MB, <60 s | None (scales to 0) |
| Asynchronous | Queue-based | Variable, long processing | <1GB, <60 min | None (scales to 0) |
| Batch transform | Per job | Bulk | Entire dataset | None (ends when finished) |

```text
[Inference option decision tree]
   Is a response needed right now?
        │
        ├─ No ─▶ Is the request "the entire dataset at once"?
        │              ├─ Yes ─▶ Batch transform
        │              └─ No (individual requests that take long/are large) ─▶ Asynchronous inference
        │
        └─ Yes ─▶ Is traffic steady?
                    ├─ Yes ─▶ Real-time endpoint  (at least 1 instance always on, cannot scale to 0)
                    └─ No (intermittent, long idle periods) ─▶ Is a cold start acceptable?
                                                   ├─ Yes ─▶ Serverless inference
                                                   └─ No  ─▶ Real-time + auto scaling
```

The decision axes are "immediacy, traffic, payload, cost." Immediate response + steady traffic means real-time; immediate response but intermittent with cold starts acceptable means serverless; large payloads, long processing, individual requests means asynchronous; bulk over an entire dataset means batch. When cost is the concern, use MME for many same-type models, Inferentia for deep-learning inference, and scale-to-0 options when there is a lot of idle time.

## Domain 3: Advanced Deployment Forms on Top of an Endpoint

Even for the same "real-time endpoint," what you load into it differs.

| Form | What it is | When to pick it |
|------|----------|-------------|
| Multi-model endpoint (MME) | Dynamically loads many models from S3 into one container | There are very many models of the same framework, each invoked rarely |
| Multi-container endpoint (MCE) | Places a few different containers on one endpoint | A few models with different frameworks on one endpoint |
| Inference pipeline | Chains preprocessing → model → postprocessing containers sequentially | Apply the same preprocessing used in training to inference too (prevents skew) |
| Production variant | Distributes traffic across multiple models on one endpoint by weight | A/B testing, gradual traffic shifting |

> ⚠️ **Trap**: MME and MCE appear side by side in the options. The one phrase that separates them is **"how many models, and do they share a framework."** Hundreds to thousands of same-type models means MME; a few models with different frameworks means MCE. And "apply the training-time preprocessing identically at inference" is not MME but an **inference pipeline** (or Feature Store).

## Domain 3: Safe Deployment and Scaling

```text
[Zero-downtime deployment]  New configuration ─▶ Traffic shift (canary/linear/all at once)
                              ─▶ Watch CloudWatch alarms ─▶ Automatic rollback on anomaly
```

- Auto Scaling adjusts the instance count based on a metric. The representative metric is **invocations per instance**, and target tracking, where you set a target value, is the default approach.
- A real-time endpoint keeps **at least 1 instance**. To go down to 0 you must move to serverless, asynchronous, or batch (asynchronous scales down to 0 when the queue is empty).

| Cost-reduction requirement | Answer |
|----------------|------|
| Hundreds of same-type models | MME |
| Intermittent traffic with long idle time | Serverless (or asynchronous) |
| Deep-learning inference unit cost | AWS Inferentia (inf family) |
| Training cost (interruption tolerated) | Managed Spot Training + checkpoints |
| Nightly bulk scoring | Batch transform |

## Domain 3: SageMaker Pipelines and MLOps

From here on, the story is about making deployment "repeatable" rather than "by hand every time." **SageMaker Pipelines** is an ML-specific CI/CD orchestrator that ties data processing → training → evaluation → registration → deployment into a DAG. It connects Steps and places gates such as "register if accuracy meets the criterion" with a condition step (ConditionStep). **Model Registry** manages model versions by catalog and approval status.

| MLOps requirement | Service |
|------------|--------|
| ML workflow DAG orchestration | SageMaker Pipelines |
| Model version/approval management | Model Registry |
| General-purpose workflow (serverless function chains) | Step Functions |
| Infrastructure as code | CloudFormation / CDK |
| Code commit → build → deploy CI/CD | CodePipeline + CodeBuild |
| Event-based trigger (retraining) | EventBridge |
| Compare experiment/trial records | SageMaker Experiments |
| Track data → training → model provenance | Lineage Tracking |

```python
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo

# A gate that moves on to the model registration step only when the evaluation metric meets the criterion
cond = ConditionGreaterThanOrEqualTo(left=accuracy_metric, right=0.85)
gate = ConditionStep(
    name='AccuracyGate',
    conditions=[cond],
    if_steps=[register_step],   # Pass: register in the Model Registry
    else_steps=[],              # Fail: do nothing and finish
)
```

Pipelines and Step Functions are easy to confuse. Pipelines is **specialized for SageMaker steps**, expresses ML workflows most naturally, and integrates with lineage and the Registry. Step Functions is more general-purpose and suits cases where many non-ML steps that weave together various AWS services such as Lambda and Glue are mixed in. For "automatically trigger retraining when new data arrives," the correct answer is the pattern where EventBridge starts the Pipeline.

## Domain 4: Model Monitor — What Has Changed

After deployment, a model quietly gets worse **as the data/world changes.** SageMaker Model Monitor watches four types.

| Monitor type | What it watches | Real ground truth needed? |
|-------------|-----------|-----------------|
| Data Quality | Changes in input data statistics/schema (covariate drift) | Not needed |
| Model Quality | Prediction performance degradation against real ground truth | Needed |
| Bias Drift | Bias change in production (Clarify integration) | Needed depending on the bias metric |
| Feature Attribution Drift | Change in feature attribution (Clarify integration) | Not needed |

It works by **creating a baseline (statistics at training time) → periodically comparing production data → sending a CloudWatch alert on violations.**

```text
[How Model Monitor works]
  Training data ──▶ Baseline job ──▶ Save statistics and constraints (S3)
                                              │
  Endpoint ──▶ Data capture (store requests/responses in S3) │
                       │                       ▼
                       └──▶ Periodic monitoring job ──▶ Violation report
                                                          ▼
                                              CloudWatch metrics/alarm ─▶ SNS ─▶ Retraining
```

> ⚠️ **Trap**: "Drift detection" is almost always Model Monitor. If the input distribution changes it's Data Quality; if performance against ground truth drops it's Model Quality. But Model Quality needs the **actual ground truth**, so in environments where ground truth arrives late, a label collection pipeline is needed as well. Changes in bias and feature attribution are the Bias/Attribution Drift monitors integrated with Clarify. Also, the prerequisite for monitoring is **enabling data capture** — without capture turned on, there is no source data to watch.

## Domain 4: Security — IAM, VPC, KMS

The three pillars of ML security are **permissions (IAM), isolation (VPC), and encryption (KMS).**

- **IAM**: the principle of least privilege. Grant only the needed permissions such as S3 and ECR to the SageMaker execution role. When granting permissions to a service rather than a user, use a role trust relationship.
- **VPC**: put training/endpoints inside a VPC, and to reach S3 and ECR without the internet use a **VPC endpoint (PrivateLink)**. `EnableNetworkIsolation` blocks the container's outbound communication.
- **KMS**: encryption of data at rest — encrypt S3 data, EBS volumes, and model artifacts with KMS keys. Encryption in transit is TLS.

```text
[Permission and network path]
  User/service ──(IAM policy, trust relationship)──▶ SageMaker execution role
                                              │ access only through this role
                                              ▼
   VPC (private subnet) ── training/endpoint container
        │  EnableNetworkIsolation = block the container's outbound internet communication
        ├─ Gateway endpoint ──▶ S3
        └─ Interface endpoint (PrivateLink) ──▶ ECR, SageMaker API/Runtime, etc.
                                              ▼
                                  Objects are stored encrypted with a KMS key
```

| Endpoint type | Connection method | Main targets |
|-----------------|-----------|-----------|
| Gateway endpoint | Adds a route to the route table | S3, DynamoDB |
| Interface endpoint (PrivateLink) | Creates an ENI in the subnet, accessed via a private IP | Most AWS services (ECR, SageMaker API, etc.) |

Security scenarios reduce to three questions. "Who can do what" (IAM), "where does it communicate" (VPC/endpoints/isolation), "is the data protected" (KMS at rest + TLS in transit). "Process sensitive data without internet exposure" is VPC + VPC endpoints + network isolation, "encryption of data at rest for regulatory compliance" is KMS, and "a notebook has excessive permissions" is IAM least privilege.

## Domain 4: Governance and Auditing

Operational tracking and auditing tools are tested too. **CloudTrail** is the API call audit log, **CloudWatch** is metrics, logs, and alarms, **SageMaker Model Cards** is model documentation and governance, and **Lineage Tracking** tracks data → training → model provenance.

| Question form | Answer |
|-----------|------|
| "Who deleted this resource and when" | CloudTrail |
| "Alert when latency/error rate exceeds a threshold" | CloudWatch alarm |
| "What data did this model come from" | Lineage Tracking |
| "Document the model's purpose and limitations" | Model Cards |
| "Compare metrics across training attempts" | SageMaker Experiments |

**Auditing** such as "who deleted the endpoint" is CloudTrail (API records), while "monitoring and alarming on endpoint latency and error rate" is CloudWatch. Their roles differ — CloudTrail is "who did what (governance)," CloudWatch is "how the system is behaving (operational metrics)." Tracking a model's origin and reproducibility is Lineage, and documenting a model's intent, performance, and limitations is Model Cards.

## Easily Confused Pairs in Domains 3 & 4

| Confusing pair | The one phrase that separates them |
|----------|---------------|
| Asynchronous inference vs. batch transform | Individual requests via a queue / the entire dataset as a job |
| Serverless vs. asynchronous | Small payload, short processing / large payload, long processing |
| MME vs. MCE | Same framework, many models / different frameworks, few models |
| Data Quality vs. Model Quality | Input distribution change / performance vs. ground truth (labels required) |
| Model Monitor vs. Clarify | Continuous monitoring in production / one-off bias and explanation analysis |
| Pipelines vs. Step Functions | SageMaker-specific ML CI/CD / general-purpose service orchestration |
| CloudTrail vs. CloudWatch | Who called which API / how the system is behaving |
| Production variant vs. inference pipeline | Traffic distribution (A/B) / sequential chain (preprocessing → model) |

## Symptom → Cause → Action

| Symptom | Common cause | Action |
|------|-----------|------|
| Inference latency exceeds the requirement | Not enough instances / model is heavy / preprocessing is slow | Auto Scaling, scale up instances, slim down the model, consider Inferentia |
| Payload is large or processing exceeds 60 seconds and fails | Exceeded real-time/serverless limits | Asynchronous inference (large payloads, long processing) or batch transform |
| Costs keep running even during idle time | Real-time endpoint kept always on | Switch to serverless/asynchronous (real-time cannot scale to 0) |
| S3/ECR access is denied | Insufficient execution role permissions or missing KMS key permissions | Check IAM policy and KMS key policy, verify resource ARNs |
| Training inside the VPC can't reach S3 | VPC endpoint not configured, or routing/security group problem | Add a Gateway endpoint for S3 and Interface endpoints for services |
| Monitoring reports no violations at all | Data capture not enabled or baseline not created | Enable data capture + run the baseline job first |
| Model Quality is not calculated | Real ground truth not collected | Build a label collection path and join with predictions |
| Error rate spiked after deployment | New model regression | Canary/linear shifting + alarm-based automatic rollback |

Tomorrow we set our real-exam pace with 8 comprehensive scenario questions that mix the 4 domains.

## 📖 Glossary

- **The 4 inference options** : real-time, serverless, asynchronous, batch transform. Chosen by request pattern (immediacy, traffic, payload), not by algorithm.
- **Multi-model endpoint (MME)** : a way to load many same-framework models on one container from S3 only when needed. Cost drops sharply when there are very many models, each called only occasionally.
- **Inference pipeline / production variant** : preprocessing → model → postprocessing chained in order on one endpoint / a configuration that splits traffic across multiple models within one endpoint by weight (A/B).
- **ConditionStep** : a condition step in a SageMaker Pipeline that places a gate saying "move to the next step only when the metric exceeds the criterion."
- **Data Capture** : a setting that stores the endpoint's requests and responses in S3. Turning this on gives Model Monitor source data to watch.
- **Baseline** : the normal-state statistics and constraints built from training data. Production data is compared against it to judge drift.
- **ground truth** : the actual outcome label used to judge whether a prediction was right. The Model Quality monitor can only compute with this.
- **Network isolation (EnableNetworkIsolation)** : a setting that prevents training and inference containers from communicating with external networks. Used to block data exfiltration.
- **Gateway / Interface endpoints** : the two ways to reach AWS services from a VPC without the internet. S3 and DynamoDB use Gateway; most others use Interface (PrivateLink).

---

## 📝 Practice Questions

**Question 1.** You want to automatically detect whether the input data distribution of a production classification endpoint drifts from training time over time (covariate drift) and receive an alert on violations. What is the most appropriate choice?

A) Run SageMaker Clarify on its own  
B) SageMaker Model Monitor — Data Quality monitor + CloudWatch alarm  
C) CloudTrail log analysis  
D) Redeploy the endpoint every week  

**Answer: B**  
Explanation: The Model Monitor Data Quality monitor periodically compares the training-time baseline statistics with production input data, detects distribution change (covariate drift), and sends an alert to CloudWatch on violations. A is a one-off bias and explanation analysis, C is an API audit log and unrelated to data distribution, and D is an inefficient approach of blindly redeploying without detection.

---

**Question 2.** Whenever new training data arrives in S3, you want to automatically run data processing → training → evaluation → (if the accuracy criterion is met) model registration. What is the most appropriate setup?

A) A person manually runs a notebook each time  
B) An EventBridge rule triggers a SageMaker Pipeline, and a ConditionStep in the pipeline registers to the Model Registry when the criterion is met  
C) Repeat only a single training job with cron  
D) Trigger training with Model Monitor  

**Answer: B**  
Explanation: The standard MLOps automation pattern is for EventBridge to start the Pipeline from the S3 event and for the Pipeline's ConditionStep to gate registration in the Model Registry only when evaluation accuracy exceeds the criterion. A is not automation, C lacks evaluation, condition, and registration steps, and D is inappropriate because Model Monitor is not meant to trigger training.

---

**Question 3.** In a regulated industry, a SageMaker training job processes sensitive data, and it must access S3 and ECR without going over the internet and block the container's external communication. What is the most appropriate setup?

A) Deploy in a public subnet and configure only security groups  
B) Training inside a VPC + VPC endpoints (PrivateLink) for S3 and ECR + network isolation (EnableNetworkIsolation)  
C) Only strengthen IAM policies  
D) Only apply encryption with a KMS key  

**Answer: B**  
Explanation: Placing training inside the VPC, reaching S3 and ECR without the internet via VPC endpoints, and blocking the container's external communication with network isolation precisely meets the "no internet traversal + external communication blocked" requirement. A leaves public exposure, C is permission control only and doesn't isolate the network, and D is only encryption at rest and unrelated to network isolation.

---

**Question 4.** In a security audit, you must find out "who deleted the production endpoint last month." What is the most appropriate service?

A) Amazon CloudWatch metrics  
B) AWS CloudTrail  
C) SageMaker Model Monitor  
D) SageMaker Clarify  

**Answer: B**  
Explanation: CloudTrail records AWS API calls, so you can audit who called the endpoint deletion (DeleteEndpoint) API, when, and with which credentials. A is for operational metrics and logs, not tracking who performed API actions, C is model drift monitoring, and D is bias and explainability analysis, all different from an audit purpose.

---

**Question 5.** Which is the most accurate selection criterion between SageMaker Pipelines and AWS Step Functions?

A) Pipelines is dedicated to non-ML workflows and Step Functions is dedicated to ML  
B) Pipelines is specialized for SageMaker steps and integrates with lineage and the Model Registry, while Step Functions suits general-purpose orchestration that weaves together various services such as Lambda and Glue  
C) The two are functionally identical, so either can be used  
D) Step Functions cannot train models  

**Answer: B**  
Explanation: The selection criterion is that Pipelines is an ML-specific orchestrator specialized for SageMaker steps and lineage/Registry integration, while Step Functions suits general-purpose workflows weaving together various AWS services such as Lambda and Glue. A reverses the roles, C ignores the specialized vs. general-purpose difference, and D is factually wrong because Step Functions can call SageMaker training steps.

---
