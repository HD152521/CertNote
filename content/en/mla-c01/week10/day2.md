# Day 2 - Domains 3 & 4 Integrated Review: Deployment·Orchestration + Monitoring·Security

## 📌 Key Takeaways

- Domain 3 (deployment·orchestration, 22%) + Domain 4 (monitoring·security, 24%) = **46%** of the exam. Together with yesterday's 54%, that is everything.
- A model is not finished once deployed — **make it repeatable (pipelines), watch it continuously (monitoring), and keep it safe (security).**
- The four inference options are chosen not by algorithm but by **request pattern** (immediacy, traffic, payload, processing time).
- Drift splits across the four Model Monitor types: input distribution = Data Quality, performance against the truth = Model Quality (labels required), bias/attribution = Clarify integration.
- Security has three pillars: **permissions (IAM), isolation (VPC), and encryption (KMS)**. Auditing = CloudTrail, operational metrics = CloudWatch.

## The Full Map of Domains 3 & 4

Yesterday we bundled data and models. Today we organize the latter two domains, which **operate** that model.

```text
[Domain 3 — Deployment·Orchestration 22%]
  Model Registry ──▶ Create model ──▶ Endpoint config ──▶ Deploy
  (version·approval)  Model            EndpointConfig      ├ Real-time   (sync, always-on)
                                       (variant·weights)   ├ Serverless  (sync, scale to 0)
                                                           ├ Asynchronous (queue, large payload)
  Orchestration                                            └ Batch transform (bulk, per job)
  EventBridge ─▶ SageMaker Pipelines (DAG) ─▶ ConditionStep ─▶ Registry ─▶ Deploy
                  Processing→Training→Eval        (stop if below threshold)

[Domain 4 — Monitoring·Security 24%]
  Operational monitoring                   Three pillars of security
  ──────────                               ──────────
  Data capture → Model Monitor             IAM  : least privilege for execution role
      ├ Data Quality  (input distribution) VPC  : subnets + VPC endpoints + network isolation
      ├ Model Quality (vs truth, labels req.) KMS : encryption at rest (S3·EBS·artifacts), TLS in transit
      ├ Bias Drift        (Clarify integration)
      └ Feature Attribution Drift (Clarify) Governance
             │                              CloudTrail (who called which API) · CloudWatch (metrics·logs)
             ▼                              Model Cards (documentation) · Lineage (provenance)
      CloudWatch alarm → SNS → retraining trigger
```

## Domain 3: Inference Options — The Request Pattern Decides

The four inference options are chosen not by algorithm but by **request pattern**.

| Option | Response | Traffic | Payload/time | Always-on cost |
|--------|----------|---------|--------------|----------------|
| Real-time | Synchronous, ms to seconds | Steady | <6MB, <60 s | Yes (at least 1 instance) |
| Serverless | Synchronous, ms to seconds | Intermittent | <4MB, <60 s | None (scales to 0) |
| Asynchronous | Queue-based | Variable·long processing | <1GB, <60 min | None (scales to 0) |
| Batch transform | Per job | Bulk | Entire dataset | None (shuts down when done) |

```text
[Inference option decision tree]
   Is a response needed right now?
        │
        ├─ No  ─▶ Is the request "the whole dataset at once"?
        │              ├─ Yes ─▶ Batch transform
        │              └─ No (individual request but slow/large) ─▶ Asynchronous inference
        │
        └─ Yes ─▶ Is the traffic steady?
                    ├─ Yes ─▶ Real-time endpoint  (at least 1 instance always on, no scale to 0)
                    └─ No (intermittent, long idle periods) ─▶ Is a cold start acceptable?
                                                   ├─ Yes ─▶ Serverless inference
                                                   └─ No  ─▶ Real-time + auto scaling
```

The decision axes are "immediacy, traffic, payload, cost." Immediate response plus steady traffic means real-time; immediate response but intermittent with a tolerable cold start means serverless; large payload, long processing, and individual requests mean asynchronous; and the whole dataset in bulk means batch. When cost is at stake, reduce it with MME for many models of the same kind, Inferentia for deep learning inference, and scale-to-zero options when there is a lot of idle time.

## Domain 3: Advanced Deployment Forms on an Endpoint

Even for the same "real-time endpoint," what you put inside it differs.

| Form | What it is | When to choose it |
|------|------------|-------------------|
| Multi-model endpoint (MME) | One container dynamically loads many models from S3 | There are very many models of the same framework, each called rarely |
| Multi-container endpoint (MCE) | A small number of different containers placed on one endpoint | A few models with different frameworks on one endpoint |
| Inference pipeline | Chains preprocessing → model → postprocessing containers in sequence | Apply the preprocessing used in training identically in inference (prevents skew) |
| Production variant | Distributes traffic among multiple models on one endpoint by weight | A/B testing, gradual traffic shifting |

> ⚠️ **Gotcha**: MME and MCE show up side by side in the options. The one-line differentiator is **"how many models are there, and is the framework the same?"** Hundreds to thousands of models of the same kind means MME; a small number of models with different frameworks means MCE. And "apply the training-time preprocessing identically in inference" is not MME but an **inference pipeline** (or Feature Store).

## Domain 3: Safe Deployment and Scaling

```text
[Zero-downtime deployment]  New config ─▶ Shift traffic (canary/linear/all at once)
                              ─▶ Watch CloudWatch alarms ─▶ Automatic rollback on anomaly
```

- Auto Scaling adjusts the number of instances based on a metric. The representative metric is **invocations per instance**, and target tracking, where you set a target value, is the default approach.
- A real-time endpoint keeps **at least 1 instance**. To go down to 0, you must move to serverless, asynchronous, or batch (asynchronous scales down to 0 when the queue is empty).

| Cost-reduction requirement | Correct answer |
|----------------------------|----------------|
| Hundreds of models of the same kind | MME |
| Intermittent traffic with long idle periods | Serverless (or asynchronous) |
| Deep learning inference unit cost | AWS Inferentia (inf family) |
| Training cost (interruptions tolerable) | Managed Spot Training + checkpoints |
| Overnight bulk scoring | Batch transform |

## Domain 3: SageMaker Pipelines and MLOps

From here on, the topic is making deployment "repeatable" rather than "by hand every time." **SageMaker Pipelines** is an ML-specific CI/CD orchestrator that ties data processing → training → evaluation → registration → deployment into a DAG. It connects Steps and uses a condition step (ConditionStep) to set a gate such as "register if accuracy is at or above the threshold." **Model Registry** manages model versions through a catalog and approval status.

| MLOps requirement | Service |
|-------------------|---------|
| ML workflow DAG orchestration | SageMaker Pipelines |
| Model version·approval management | Model Registry |
| General-purpose workflows (serverless function chains) | Step Functions |
| Infrastructure as code | CloudFormation / CDK |
| Code commit → build → deploy CI/CD | CodePipeline + CodeBuild |
| Event-based trigger (retraining) | EventBridge |
| Comparing recorded experiments·trials | SageMaker Experiments |
| Tracking data → training → model provenance | Lineage Tracking |

```python
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo

# A gate that moves on to the model registration step only when the evaluation metric meets the threshold
cond = ConditionGreaterThanOrEqualTo(left=accuracy_metric, right=0.85)
gate = ConditionStep(
    name='AccuracyGate',
    conditions=[cond],
    if_steps=[register_step],   # Pass: register in Model Registry
    else_steps=[],              # Below threshold: do nothing and finish
)
```

Pipelines and Step Functions are easy to confuse. Pipelines is **specialized for SageMaker steps**, expresses ML workflows most naturally, and integrates with lineage and Registry. Step Functions is more general-purpose and suits cases where many non-ML steps weave together various AWS services such as Lambda and Glue. For "automatically trigger retraining when new data arrives," the correct answer is the pattern where EventBridge starts a Pipeline.

## Domain 4: Model Monitor — What Changed?

After deployment, a model quietly gets worse **as the data/world changes**. SageMaker Model Monitor watches four types.

| Monitor type | What it watches | Actual ground truth needed? |
|--------------|-----------------|-----------------------------|
| Data Quality | Changes in input data statistics·schema (covariate drift) | Not needed |
| Model Quality | Degradation of prediction performance against actual ground truth | Needed |
| Bias Drift | Change in bias during operation (Clarify integration) | Needed depending on the bias metric |
| Feature Attribution Drift | Change in feature attribution (Clarify integration) | Not needed |

The way it works is **create a baseline (training-time statistics) → compare production data periodically → CloudWatch notification on violation**.

```text
[How Model Monitor works]
  Training data ──▶ Baseline job ──▶ Store statistics·constraints (S3)
                                              │
  Endpoint ──▶ Data capture (store requests·responses in S3)
                       │                       ▼
                       └──▶ Scheduled monitoring job ──▶ Violation report
                                                          ▼
                                              CloudWatch metrics·alarms ─▶ SNS ─▶ Retraining
```

> ⚠️ **Gotcha**: "Drift detection" is almost always Model Monitor. If the input distribution changes, it is Data Quality; if performance against the truth drops, it is Model Quality. However, Model Quality needs **actual ground truth**, so in environments where the truth arrives late, a label collection pipeline is also needed. Changes in bias or feature attribution are Bias/Attribution Drift monitors integrated with Clarify. Also, the prerequisite for monitoring is **enabling data capture** — without it, there is no source data to watch.

## Domain 4: Security — IAM, VPC, KMS

The three pillars of ML security are **permissions (IAM), isolation (VPC), and encryption (KMS)**.

- **IAM**: The principle of least privilege. Grant the SageMaker execution role only the permissions it needs, such as S3 and ECR. When giving permissions to a service rather than a user, use a role trust relationship.
- **VPC**: Place training/endpoints inside a VPC, and to reach S3·ECR without the internet, use **VPC endpoints (PrivateLink)**. `EnableNetworkIsolation` blocks the container's external communication.
- **KMS**: Encryption of data at rest — encrypt S3 data, EBS volumes, and model artifacts with KMS keys. Encryption in transit is TLS.

```text
[Permission·network path]
  User/service ──(IAM policy·trust relationship)──▶ SageMaker execution role
                                              │ access only through this role
                                              ▼
   VPC (private subnet) ── training/endpoint container
        │  EnableNetworkIsolation = block the container's external internet communication
        ├─ Gateway endpoint ──▶ S3
        └─ Interface endpoint (PrivateLink) ──▶ ECR, SageMaker API/Runtime, etc.
                                              ▼
                                  Objects are stored encrypted with a KMS key
```

| Endpoint type | Connection method | Main targets |
|---------------|-------------------|--------------|
| Gateway endpoint | Adds a route to the route table | S3, DynamoDB |
| Interface endpoint (PrivateLink) | Creates an ENI in the subnet, accessed via private IP | Most AWS services (ECR, SageMaker API, etc.) |

Security scenarios reduce to three questions. "Who can do what" (IAM), "where does it communicate" (VPC/endpoints/isolation), "is the data protected" (KMS at rest + TLS in transit). "Process sensitive data without internet exposure" is VPC + VPC endpoints + network isolation, "encryption of stored data for regulatory compliance" is KMS, and "a notebook has excessive permissions" is IAM least privilege.

## Domain 4: Governance·Auditing

Operational tracking and auditing tools are also tested. **CloudTrail** is the API call audit log, **CloudWatch** is metrics·logs·alarms, **SageMaker Model Cards** is model documentation·governance, and **Lineage Tracking** is provenance tracking of data → training → model.

| Question form | Correct answer |
|---------------|----------------|
| "Who deleted this resource and when" | CloudTrail |
| "Alert when latency or error rate exceeds a threshold" | CloudWatch alarm |
| "What data did this model come from" | Lineage Tracking |
| "Document the model's purpose and limitations" | Model Cards |
| "Compare the metrics of training attempts" | SageMaker Experiments |

**Auditing** such as "who deleted the endpoint" is CloudTrail (API records), and "monitoring endpoint latency and error rate with alarms" is CloudWatch. The two have different roles — CloudTrail is "who did what (governance)," and CloudWatch is "how the system is behaving (operational metrics)." Tracking a model's origin and reproducibility is Lineage, and documenting a model's intent, performance, and limitations is Model Cards.

## Domains 3 & 4 Commonly Confused Pairs

| Confusing pair | One-line differentiator |
|----------------|-------------------------|
| Asynchronous inference vs batch transform | Individual requests through a queue / the whole dataset as a job |
| Serverless vs asynchronous | Small payload·short processing / large payload·long processing |
| MME vs MCE | Same framework·many models / different frameworks·few models |
| Data Quality vs Model Quality | Input distribution change / performance against the truth (labels required) |
| Model Monitor vs Clarify | Continuous monitoring in production / one-off bias·explanation analysis |
| Pipelines vs Step Functions | SageMaker-specific ML CI/CD / general service orchestration |
| CloudTrail vs CloudWatch | Who called which API / how the system is behaving |
| Production variant vs inference pipeline | Traffic distribution (A/B) / sequential chain (preprocessing → model) |

## Symptom → Cause → Action

| Symptom | Common cause | Action |
|---------|--------------|--------|
| Inference latency exceeds the requirement | Too few instances / the model is heavy / preprocessing is slow | Auto Scaling·larger instances, model slimming, consider Inferentia |
| Failure because the payload is large or processing exceeds 60 seconds | Real-time/serverless limits exceeded | Asynchronous inference (large payload·long processing) or batch transform |
| Cost keeps accruing even when idle | Real-time endpoint kept running | Switch to serverless/asynchronous (real-time cannot scale to 0) |
| S3/ECR access is denied | Insufficient execution role permissions or missing KMS key permissions | Check IAM policy·KMS key policy, verify the resource ARN |
| Training inside a VPC cannot reach S3 | VPC endpoint not configured, or a routing·security group issue | Add a Gateway endpoint for S3 and Interface endpoints for the services |
| Monitoring reports no violations at all | Data capture not enabled or baseline not created | Enable data capture + run the baseline job first |
| Model Quality is not computed | Actual ground truth not collected | Build a label collection path and join it with predictions |
| Error rate spiked after deployment | Regression in the new model | Canary·linear shifting + alarm-based automatic rollback |

Tomorrow we set our real-exam pace with eight comprehensive scenario questions that mix all four domains.

## 📖 Glossary

- **Four inference options**: Real-time, serverless, asynchronous, and batch transform. Chosen by request pattern (immediacy, traffic, payload), not by algorithm.
- **Multi-model endpoint (MME)**: A way of pulling many models of the same framework from S3 on demand on top of one container. Cost drops greatly when there are very many models and each is called only occasionally.
- **Inference pipeline / production variant**: Preprocessing → model → postprocessing chained in order on one endpoint / a configuration that sends traffic to several models by weight within one endpoint (A/B).
- **ConditionStep**: A condition step in a SageMaker Pipeline that sets a gate: "proceed to the next step only if the metric exceeds the threshold."
- **Data Capture**: A setting that stores an endpoint's requests and responses in S3. Only when it is on does Model Monitor have source data to watch.
- **Baseline**: Normal-state statistics and constraints built from the training data. Production data is compared against it to judge drift.
- **Ground truth**: The actual outcome label used to judge whether a prediction was correct. The Model Quality monitor can only compute with it.
- **Network isolation (EnableNetworkIsolation)**: A setting that prevents training·inference containers from communicating with external networks. For blocking data exfiltration.
- **Gateway / Interface endpoints**: Two ways to reach AWS services from a VPC without the internet. S3 and DynamoDB use Gateway; most others use Interface (PrivateLink).

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
