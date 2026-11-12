# Day 5 - Week 11 Review: Monitoring, MLOps, Security, Operations

This week was "the world after building models." We covered monitoring deployed models, automating retraining and deployment (MLOps), protecting data/models/permissions (security), and managing cost/audit/recovery (operations) in one full loop. Today we integrate these pieces into a single operating system and organize the judgment points most frequently split on the exam.

## Full Picture: Operations Loop on One Page

```text
[Training Data S3]──(KMS encryption, VPC Endpoint)──┐
                                               ▼
                 [SageMaker Pipeline] process→train→eval
                                               │ ConditionStep (quality gate)
                                               ▼
                        [Model Registry] versions & approval (Approved)
                                               │ EventBridge
                                               ▼
                 [Deploy: Blue/Green·Canary] → [Endpoint]
                          │                        │
                  CloudTrail (audit)          DataCapture (S3)
                          │                        ▼
                          │              [Model Monitor] drift detection
                          │                        │ CloudWatch Alarm
                          └────────────────────────┘ EventBridge → retrain (loop start)
```

This entire loop runs on IAM execution roles (least privilege), VPC isolation, KMS encryption.

## One-Line Summary per Day

| Day | Topic | One-Liner |
|-----|------|-----------|
| 1 | Monitoring | Data Quality watches input distribution shifts (no labels), 1st defense, violation→trigger retrain |
| 2 | MLOps | Pipelines (DAG, ConditionStep) + Model Registry (versions, approval) + CI/CD (Projects) |
| 3 | Security | IAM execution roles (least privilege) + VPC isolation + KMS (key policy controls decryption) |
| 4 | Operations | Cost (Spot/Serverless/Async) + logging (CloudWatch vs CloudTrail) + DR (cross-region, Multi-AZ) |

## Most Frequently Split Judgment Points

```text
1) Monitoring type
   No labels → Data Quality / Has labels → Model Quality
   Feature contribution shift → Feature Attribution / Bias shift → Bias Drift

2) Logging service
   Perf/failure debugging → CloudWatch / Who did what (audit) → CloudTrail

3) Inference cost
   Sparse traffic → Serverless / Large payload, long processing → Async
   Many models shared → Multi-Model Endpoint / Variable traffic → Auto Scaling

4) Permission issues
   Training/endpoint AccessDenied → Execution Role permissions

5) Internet-blocking requirement
   Private subnets + VPC Endpoints + network isolation
```

> 💡 **Related Theory**: Specialty exam operations test "what to pick in situation," not "know the feature." The five splits above cover nearly all operations problems. Train yourself to spot keywords (no labels, who, sparse, AccessDenied, internet ban) and snap to the branch instantly — that makes the score.

## Integrated Scenario Checkpoint

Scenario: Operating a classification model trained on medical data. (1) Data cannot expose to internet, (2) must auto-retrain on input distribution shift, (3) must audit who changed endpoint, (4) sparse traffic, want to cut idle cost.

```text
(1) VPC private subnets + S3 VPC Endpoint + KMS (CMK) + execution role least privilege
(2) DataCapture → Model Monitor (Data Quality) → CloudWatch Alarm
       → EventBridge → SageMaker Pipeline retrain → Model Registry approval → redeploy
(3) CloudTrail audit API calls, store logs in S3
(4) Serverless Inference zero idle cost
```

Looks like one problem but fits week's 4 days of knowledge exactly, one piece each.

## Common Traps Summary

```text
- Baseline not refreshed after retraining, false positives surge (Day1)
- Poor-performance model auto-deploys without ConditionStep (Day2)
- Permission debug sees only user perms, misses execution role (Day3)
- Try CloudWatch to find "who did it" → CloudTrail is answer (Day4)
- Always-on GPU endpoint handles sparse traffic, wasteful (Day4)
```

## Summary

Week 11 treats ML as "living system," not "finished model." Monitoring catches drift; MLOps automates retraining and deployment; security wraps everything; operations handle cost/audit/recovery. These four connect via EventBridge and Pipelines into one closed loop. On exams, memorizing five splits that translate keywords to branches lets you answer most operations questions correctly.

Next week: comprehensive wrap-up and exam prep to finish the full course.

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
