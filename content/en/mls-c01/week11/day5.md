# Day 5 - Week 11 Comprehensive Review: Monitoring, MLOps, Security, Operations

## 📌 Key Takeaways

- Week 11 is "the world after you build the model." The four axes of monitoring, MLOps, security, and operations form one closed loop through EventBridge and Pipelines.
- Monitoring types split on **whether labels exist**. No labels → Data Quality; labels available → Model Quality.
- Logging splits on **the shape of the question**. "Why is it slow, why did it fail?" → CloudWatch; "Who did what and when?" → CloudTrail.
- Security has three pillars: **execution role + VPC isolation + KMS key policy**. For an AccessDenied in operations, look at the execution role first, not the user's permissions.
- Inference cost splits on the shape of the traffic. Intermittent → Serverless, large payloads → Async, many models → MME, variable → Auto Scaling.

## The Operations Loop on One Page

```text
[Training data S3]──(KMS encryption, VPC endpoint)──┐
                                                    ▼
                 [SageMaker Pipeline] process → train → evaluate
                                                    │ ConditionStep (quality gate)
                                                    ▼
                        [Model Registry] version · approval (Approved)
                                                    │ EventBridge
                                                    ▼
                 [Deploy: Blue/Green · Canary] → [Endpoint]
                          │                          │
                  CloudTrail (audit)           DataCapture (S3)
                          │                          ▼
                          │              [Model Monitor] drift detection
                          │                          │ CloudWatch alarm
                          └──────────────────────────┘ EventBridge → retraining (the loop starts)
```

- This entire loop runs on top of **IAM execution roles (least privilege), VPC isolation, and KMS encryption**.
- The loop starts at "drift detection" and ends at "deploying the approved new version." When you read a question, first locate which point of the loop it is asking about.

## One-Line Summary of Days 1-4

| Day | Topic | Key point | Representative services and features | Representative pitfall |
|---|---|---|---|---|
| 1 | Monitoring | The first line of defense that watches input distribution changes without labels. A violation → triggers retraining | Model Monitor (Data Quality / Model Quality / Bias Drift / Feature Attribution Drift), DataCapture | Not refreshing the baseline after retraining, causing a flood of false positives |
| 2 | MLOps | Define process → train → evaluate → register → deploy as code for reproducibility, traceability, and automation | Pipelines (DAG, ConditionStep), Model Registry (versions, approval), Projects (CI/CD) | A model that misses the performance bar is deployed automatically because there is no ConditionStep |
| 3 | Security | Who (execution role), where (VPC), and what can be opened (KMS key policy) | Execution Role, VpcConfig, VPC endpoints, CMK, Macie | Investigating AccessDenied only as a user permission issue |
| 4 | Operations | Cost, audit, and recovery. Training and inference have opposite cost structures | Spot / Serverless / Async / MME, CloudWatch, CloudTrail, S3 CRR and Multi-AZ | An always-on GPU endpoint for intermittent traffic |

## The 5 Decision Branches That Split Most Often

| # | Branch | Stem signal | Answer |
|---|---|---|---|
| 1 | Monitoring type | No labels / labels available / feature attribution change / group bias change | Data Quality / Model Quality / Feature Attribution Drift / Bias Drift |
| 2 | Logging service | Performance and failure debugging / who did what and when (audit) | CloudWatch / CloudTrail |
| 3 | Inference cost | Intermittent traffic / large payload and long processing / many models shared / variable traffic | Serverless / Async / Multi-Model Endpoint / Auto Scaling |
| 4 | Permission problem | AccessDenied in training or an endpoint | Execution Role permissions |
| 5 | Internet-blocking requirement | Data must not pass through the internet | Private subnet + VPC endpoint + network isolation |

> 💡 **Related theory**: The operations domain of the Specialty exam does not ask "do you know the feature?" but "what would you choose in this situation?" The five branches above cover almost all operations questions. Training yourself to jump to a branch the moment you see a keyword (no labels, who, intermittent, AccessDenied, no internet) is what translates directly into points.

## Exam Clue Keyword → Answer Translation Table

| Stem clue | Answer | Why |
|---|---|---|
| "Ground-truth labels cannot be obtained immediately" | Model Monitor **Data Quality** | The first line of defense that detects from input distribution alone, without labels |
| "Labels arrive days later; confirm the accuracy drop" | **Model Quality** | Joins predictions with the later-arriving labels to compute metrics |
| "The rank or magnitude of SHAP attributions has changed" | **Feature Attribution Drift** | Compares Clarify attributions against the baseline |
| "Fairness metrics across groups are shifting" | **Bias Drift** | Clarify-based bias monitoring |
| "Violations appear on every run after retraining" | **Regenerate the baseline** | Re-register the new distribution you deliberately taught as normal |
| "Who deleted the endpoint and when?" | **CloudTrail** | Records the API caller, time, and source IP |
| "Why did training fail; what about the loss curve?" | **CloudWatch Logs / Metrics** | Application logs and performance metrics |
| "Traffic spikes only briefly during the day" | **Serverless Inference** | Zero idle cost, per-invocation billing |
| "The payload is large and an immediate response is not needed" | **Asynchronous Inference** | Queue-based, scales down to zero |
| "Thousands of models on one endpoint" | **Multi-Model Endpoint** | Shared hosting of many models |
| "Traffic varies widely but real-time responses are required" | **Real-time endpoint + Auto Scaling** | Absorbs surges, scales in when idle |
| "Cut training costs sharply" | **Managed Spot Training + `checkpoint_s3_uri`** | Interruptible but cheaper; resumes from checkpoints |
| "AccessDenied, yet the user reads fine in the console" | **Insufficient execution role permissions** | The job runs with the execution role, not the user's credentials |
| "Data must not pass through the internet" | **Private subnet + S3 VPC gateway endpoint** | Private access with no internet path |
| "Block the container's outbound calls themselves" | **`enable_network_isolation=True`** | Blocks the container's network calls |
| "Traffic between distributed training nodes must not be plaintext" | **`encrypt_inter_container_traffic=True`** | Encrypts node-to-node communication |
| "Decryption must be isolated per team" | **Per-team KMS CMK + key policy** | Even if IAM allows it, the key policy has the final block |
| "Automatically detect whether PII is mixed into S3" | **Amazon Macie** | Detects and classifies sensitive data in S3 |
| "Same code and data give the same result (reproducibility)" | **SageMaker Pipelines definition** | Fixes the workflow as code |
| "Do not register or deploy a model that misses the metrics" | **ConditionStep + Model Registry approval** | An automatic quality gate plus a human gate for redundancy |
| "Which model was trained on which data; rollback" | **Model Registry** | Manages versions, approval status, and lineage |
| "Receive an alarm and start the retraining pipeline" | **EventBridge** | Event routing that invokes a Pipeline or Lambda |
| "Validate with a small amount of traffic first, then expand" | **Canary deployment** | Minimizes risk |
| "Automatically provision build and deploy repos and CI/CD" | **SageMaker Projects** | MLOps template |
| "Survive a single-AZ failure" | **`instance_count` ≥ 2** | Automatically spread across multiple AZs |
| "Restore data and models even after a Region failure" | **S3 cross-Region replication + versioning + Model Registry** | Replication, plus tracking which version to restore |
| "Recreate the endpoint in another Region or account" | **IaC (CloudFormation / Pipelines)** | Reproduce infrastructure as code |
| "Manage external DB credentials outside the code" | **Secrets Manager** | Removes hardcoded credentials |

## Side-by-Side Tables for Commonly Confused Pairs

### Data Quality vs Model Quality

| Aspect | Data Quality | Model Quality |
|---|---|---|
| What it watches | Input feature statistics (missing values, types, distribution) | Prediction quality such as accuracy, F1, RMSE |
| Labels | Not needed | Needed |
| Detection timing | Immediate (first line of defense) | After the labels arrive (delayed) |
| What it catches | Data drift | Even concept drift |

### CloudWatch vs CloudTrail

| Aspect | CloudWatch | CloudTrail |
|---|---|---|
| What it records | Logs and metrics (loss, latency, CPU/GPU) | All AWS API calls |
| Question it answers | "Why did it fail, how slow is it?" | "Who called what, when, and from where?" |
| Main use | Debugging and alarms | Audit and compliance |
| Retention | Log groups / metrics | Stored permanently in S3, tamper-resistant |

### Deployment Strategies: Blue/Green vs Canary vs Linear vs A/B

| Strategy | Behavior | When |
|---|---|---|
| Blue/Green | Bring up a new fleet and switch | The default safe deployment |
| Canary | A small amount of traffic first → expand after checking | Minimizing risk |
| Linear | Increase by a fixed percentage in stages | Gradual observation |
| A/B (Production Variant) | Split traffic between two models | Performance comparison |

### Serverless vs Async vs Real-time vs MME

| Option | Traffic shape | Idle cost | Characteristics |
|---|---|---|---|
| Serverless Inference | Intermittent, unpredictable | 0 | Per-invocation billing |
| Asynchronous Inference | Large payload, immediacy not needed | Scales down to 0 | Queue-based processing |
| Real-time + Auto Scaling | Constant + variable | The minimum number of instances | Absorbs surges, scales in when idle |
| Multi-Model Endpoint | A very large number of models | Shared | Many models on a single endpoint |

### Execution Role vs User IAM Permissions

| Aspect | Execution Role | User IAM permissions |
|---|---|---|
| Applies to | Used at runtime by training jobs, endpoints, and pipelines | People using the console or CLI |
| Trust policy | `sagemaker.amazonaws.com` calls `sts:AssumeRole` | Not applicable |
| Typical symptom | AccessDenied in the job log | Denied on the console screen |
| Exam context | For an AccessDenied in operations, check here first | Easily used as a distractor |

### Debugger vs Model Monitor vs Clarify

| Tool | When | What it looks at |
|---|---|---|
| SageMaker Debugger | During training | Anomalies in the training process such as tensors and gradients |
| Model Monitor | After deployment | Drift in input distribution and prediction quality |
| Clarify | Before and after training, and in operations | Data and model bias, SHAP feature attributions |

## Integrated Scenario Checkpoint

You are operating a classification model trained on medical data. There are four requirements: (1) the data must not be exposed to the internet, (2) retraining must happen automatically when the input distribution changes, (3) you must audit who changed the endpoint, and (4) traffic is intermittent, so idle cost must be reduced.

| Requirement | Configuration | Basis |
|---|---|---|
| (1) No internet exposure | Private subnet + S3 VPC endpoint + KMS CMK + least-privilege execution role | Day 3 |
| (2) Automatic retraining on distribution change | DataCapture → Model Monitor (Data Quality) → CloudWatch alarm → EventBridge → Pipeline retraining → Model Registry approval → redeployment | Days 1-2 |
| (3) Change audit | Record API calls with CloudTrail and keep the logs in S3 | Day 4 |
| (4) Reduce idle cost | Serverless Inference (zero idle cost) | Day 4 |

```text
(1) VPC private subnet + S3 VPC endpoint + KMS (CMK) + least-privilege execution role
(2) DataCapture → Model Monitor (Data Quality) → CloudWatch alarm
       → EventBridge → SageMaker Pipeline retraining → Model Registry approval → redeployment
(3) Audit API calls with CloudTrail, keep the logs in S3
(4) Zero idle cost with Serverless Inference
```

- It looks like a single situation, but the knowledge from this week's four days fits in exactly, one piece at a time.
- The real exam asks about **only one** of these in a composite stem. Practicing decomposing the requirement sentences and labeling which Day's branch each belongs to is itself real exam training.

## Common Pitfalls Summary Table

| Pitfall | Why it is wrong | Correct response | Source |
|---|---|---|---|
| Leaving the baseline as it is after retraining | Flags the new distribution you deliberately taught as a violation, a false positive | Regenerate the baseline from the new training data | Day 1 |
| Trying to confirm an accuracy drop directly with Data Quality | It only looks at input statistics, so it cannot know accuracy | Obtain labels, then use Model Quality | Day 1 |
| Automatic registration and deployment without a ConditionStep | A model that misses the performance bar goes straight to production | ConditionStep + a redundant approval gate | Day 2 |
| Setting Approved immediately at registration | Deployment automation continues without human review | Keep the `PendingManualApproval` default | Day 2 |
| Investigating AccessDenied only against user permissions | The job runs with the execution role | Check the execution role policy and trust policy | Day 3 |
| Turning on encryption but neglecting the key policy | Even if IAM allows it, the key policy decides in the end | Separate who can decrypt using the CMK key policy | Day 3 |
| Handling "block the internet" with a NAT gateway | NAT is actually an outbound internet path | VPC endpoint + network isolation | Day 3 |
| Looking for "who did it" in CloudWatch | CloudWatch is the performance and logs domain | CloudTrail | Day 4 |
| An always-on GPU endpoint for intermittent traffic | Wasted idle cost | Serverless or Auto Scaling | Day 4 |
| Not setting a checkpoint for Spot training | If interrupted, you start over from the beginning | Specify `checkpoint_s3_uri` | Day 4 |
| Managed Spot Training to cut inference cost | Spot is a cost-saving measure for training only | For inference use Serverless / Async / MME | Day 4 |

## Operations Domain Self-Check

1. If you suspect a performance drop but have no labels, what do you look at first? → **Data Quality monitoring**
2. If violations occur on every run after retraining? → **Regenerate the baseline**
3. Which combination blocks automatic deployment of a model that misses its metrics? → **ConditionStep + the Model Registry approval gate**
4. What is the default approval status of a version newly registered in Model Registry? → **PendingManualApproval**
5. If the user reads fine but only the training job is denied on S3? → **Insufficient S3 permissions on the execution role**
6. To reach S3 without going through the internet? → **A VPC gateway endpoint for S3**
7. To prove "who called what and when"? → **CloudTrail**
8. The simplest measure to survive a single-AZ failure? → **Set `instance_count` to 2 or more**

Next week, we wrap up the whole course with a domain-by-domain integrated review and exam preparation.

## 📖 Glossary

- **Drift**: The phenomenon where, after deployment, the input data or the data-to-answer relationship differs from the time of training. If the inputs change it is data drift; if the relationship changes it is concept drift.
- **Baseline**: A snapshot of statistics and constraints (`statistics.json` / `constraints.json`) recording "this is what normal looks like." Monitoring compares against it to judge violations.
- **DataCapture**: A feature where an endpoint automatically saves actual requests and responses to S3. It is the raw material for monitoring.
- **ConditionStep**: A quality gate in a pipeline that compares an evaluation metric to a threshold and decides whether the next step runs.
- **Model Package Group**: The Model Registry grouping that collects model versions for the same purpose. Within it, versions v1, v2, … each have an approval status.
- **Execution Role**: The IAM role that training jobs and endpoints borrow while running. S3 and KMS are accessed with this role's permissions, not a person's account.
- **VPC endpoint**: A private channel to reach AWS services without going through the internet. S3 and DynamoDB use the gateway type; SageMaker API and others use the interface type (PrivateLink).
- **Key policy**: The policy attached to the KMS key itself that defines "who can decrypt with this key." Even if IAM allows it, decryption fails if it is blocked here.
- **Canary deployment**: A method of first sending only a very small amount of traffic to the new version to check that nothing is wrong, then increasing the share.
- **RTO / RPO**: After a failure, "how quickly do you recover (RTO)" and "how much data loss is tolerated (RPO)." They are the two axes for choosing a DR strategy.

---

## 📝 Practice Questions

**Question 1.** You suspect that a production model's accuracy is degrading over time, but ground-truth labels cannot be obtained immediately. In addition, the statistics of some input features appear different from those at training time. Which monitoring should you apply FIRST?

A) Model Quality monitoring  
B) Data Quality monitoring  
C) CloudTrail analysis  
D) A/B production variants  

**Answer: B**  
Explanation: Data Quality monitoring, which detects changes in the input distribution without ground truth, is the first line of defense. Model Quality (A) requires ground truth, CloudTrail (C) is for API auditing, and A/B (D) is for comparing deployments.

---

**Question 2.** In an automated ML pipeline, you want to ensure that a model whose evaluation metric falls below the threshold is never deployed to production. Which combination is MOST appropriate?

A) ConditionStep + Model Registry approval (Approved) gate  
B) Multi-Model Endpoint + Auto Scaling  
C) Serverless Inference + Async Inference  
D) KMS CMK + VPC endpoint  

**Answer: A**  
Explanation: Blocking registration when the metric falls short with a ConditionStep, and keeping final human control with the Model Registry approval gate, blocks automatic deployment of a bad model twice over. B and C relate to inference cost/hosting and D to security configuration, so they are unrelated to a quality gate.

---

**Question 3.** In a security incident investigation, you must trace "which IAM principal changed the SageMaker endpoint configuration, and when." Which is the correct service?

A) CloudWatch Metrics  
B) SageMaker Debugger  
C) AWS CloudTrail  
D) Amazon Macie  

**Answer: C**  
Explanation: CloudTrail records the principal, time, and source IP of API calls, supporting change auditing. CloudWatch Metrics (A) are performance metrics, Debugger (B) is for training analysis, and Macie (D) is for PII detection; none is intended for API auditing.

---

**Question 4.** Training data must never traverse the internet, and decryption of model artifacts must be isolated by team. Which configuration is MOST appropriate?

A) Public subnet + shared KMS managed key  
B) Private subnet + S3 VPC endpoint + per-team KMS CMK and key policy  
C) NAT gateway + plaintext storage  
D) Internet gateway + only separating IAM users  

**Answer: B**  
Explanation: A private subnet and S3 VPC endpoint exclude the internet, and per-team CMKs and key policies isolate who can decrypt. Public subnet/NAT/IGW (A, C, D) create an internet path, and a shared key or plaintext cannot meet the isolation requirement.

---

**Question 5.** For an inference workload whose traffic is concentrated in only part of the day and is nearly absent the rest of the time, you want to reduce idle cost while also withstanding traffic spikes. Which combination is MOST appropriate?

A) Run a single large GPU instance at all times  
B) Serverless Inference, or a real-time endpoint with Auto Scaling applied  
C) Run inference with Managed Spot Training  
D) Manually turn the endpoint on and off every day  

**Answer: B**  
Explanation: For intermittent traffic, Serverless eliminates idle cost, and if traffic fluctuates widely, a real-time endpoint with Auto Scaling that absorbs spikes is appropriate. Always-on (A) is wasteful, Spot Training (C) is for training, and manual operation (D) has low reliability.

---
