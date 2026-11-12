# Day 3 - Domain 4 Integration: ML Implementation & Operations

Domain 4: **deploy, monitor, operate**. Model leaves lab → lives in prod.

## End-to-End Deployment & Operations

```text
[Trained model]
   │
   ├─ 1) INFER: CHOOSE DEPLOYMENT
   │     Online? Offline?
   │     Real-time(low-latency) / Serverless / Async / Batch
   │
   ├─ 2) DEPLOY SAFELY
   │     Shadow (zero-risk), Canary (gradual), Blue/Green (flip)
   │
   ├─ 3) MONITOR
   │     Data drift (no labels) vs Model Quality (labels delayed)
   │     CloudWatch (metrics), Model Monitor (distribution)
   │
   ├─ 4) OPTIMIZE
   │     Cost: Spot(learn), Serverless(inference), MME
   │     Speed: Neo, Inferentia, Elastic Inference
   │
   ├─ 5) INCIDENT RESPONSE
   │     Degradation → alarm → retrain (auto or manual)
   │     Rollback → instant (Blue/Green)
   │
   └─ 6) GOVERNANCE
         CloudTrail (audit), Model Registry (versions), Pipelines (CI/CD)
```

## Inference Choice Tree

```
Online needed?
├─ No → Batch Transform (large bulk offline)
└─ Yes
   ├─ Payload >6MB or timeout >60s? → Asynchronous
   ├─ Traffic sparse, cold OK? → Serverless
   └─ Traffic steady, <6MB, <60s? → Real-time
```

## Cost Levers

| Phase | Cost Cut |
|------|------|
| Training | Spot instances (90%↓), early-stop (AMT) |
| Inference | Serverless (idle=0), Batch (job-only), MME (shared) |
| Both | Auto-scale (pay for peaks), right-sizing |

## Monitoring Strategy

- **Data Quality**: Baseline vs runtime, no labels
- **Model Quality**: Once labels arrive
- **Bias Drift**: Clarify SHAP shifts
- **Auto-Response**: Alarm → retrain pipeline

## Summary

Domain 4: infer choice (online/offline), deploy safe (shadow/canary), monitor (drift), optimize (cost/speed), respond (retrain/rollback), govern (audit/registry/CI/CD). End-to-end pipeline: collect → clean → model → deploy → monitor → retrain.

Tomorrow: All four domains, synthesis.

## 📝 Practice Questions

**Question 1.** You only need to score millions of transaction records in one pass every night and store the results in S3, with no need for real-time responses. Which inference method is MOST cost-effective?

A) Run a Real-time Endpoint 24 hours a day  
B) Keep an Asynchronous Inference endpoint always running  
C) Batch Transform  
D) Multi-Model Endpoint  

**Answer: C**  
Explanation: When a fixed large volume of data is processed offline in one pass and an always-on endpoint is not needed, Batch Transform is the most cost-effective. Always-on Real-time (A) and always-on Async (B) incur unnecessary standing costs, and Multi-Model (D) is for hosting multiple models.

---

**Question 2.** Before putting a new model into production, you want to validate its performance with real traffic while returning only the existing model's responses to users. Which strategy is MOST appropriate?

A) Canary deployment  
B) Immediate full cutover  
C) Blue/Green followed by an immediate 100% cutover  
D) Shadow testing  

**Answer: D**  
Explanation: Shadow testing replicates production traffic to the new model but does not return its responses to users, so it validates with no risk. With Canary (A), some real users receive the new model's responses, and immediate cutover (B) or immediate 100% (C) raises risk without validation.

---

**Question 3.** The prediction quality of a deployed model has been degrading gradually over several weeks. What should you use to automatically detect whether the input data distribution has changed from training time?

A) CloudTrail  
B) SageMaker Model Monitor  
C) AWS Config  
D) Elastic Inference  

**Answer: B**  
Explanation: Model Monitor compares the training-time baseline with production inputs to detect data/model drift and sends an alarm when thresholds are exceeded. CloudTrail (A) is for API auditing, Config (C) tracks resource configuration, and Elastic Inference (D) is inference acceleration; none is related to drift detection.

---

**Question 4.** You want to greatly reduce the cost of a training job and have designed it so that, even if the job is interrupted midway, it can resume from a checkpoint. Which option is MOST appropriate?

A) Managed Spot Training  
B) Use only On-Demand instances  
C) Serverless Inference  
D) Multi-Model Endpoint  

**Answer: A**  
Explanation: Managed Spot Training reduces training cost by up to 90% using interruptible Spot Instances and resumes from checkpoints after an interruption. On-Demand (B) offers no cost savings, and Serverless Inference (C) and Multi-Model (D) are inference-side features unrelated to training cost.

---

**Question 5.** You want to define an ML workflow consisting of data processing, training, evaluation, conditional model registration, and deployment as code, and automate it reproducibly. Which combination of core services is MOST appropriate?

A) Lambda alone invoking every step  
B) A cron script on an EC2 instance  
C) SageMaker Pipelines + Model Registry  
D) Use only a Glue crawler  

**Answer: C**  
Explanation: SageMaker Pipelines defines ML steps as a DAG and provides reproducibility, version control, and CI/CD, while Model Registry manages model versions and approval. Lambda alone (A) and cron scripts (B) are weak in standardization and reproducibility, and a Glue crawler (D) is for metadata cataloging.

---
