# Day 4 - ML Cost Optimization: Spot Training to Cost Monitoring

Secure today, cheap today. ML workloads grow cost fast — GPU instances, large-scale training, always-on endpoints. Fortunately, SageMaker offers levers: **Spot training**, **right-size instances**, **serverless/batch options**, **auto-shutdown**, **cost monitoring**. Today map these levers to exam scenarios.

## Managed Spot Training — Reduce Training Cost Up to 90%

Training typically runs once and tolerates interruption/resumption, pairing well with Spot instances. **Managed Spot Training** cuts costs by up to 90%.

```json
{
  "EnableManagedSpotTraining": true,
  "StoppingCondition": {
    "MaxRuntimeInSeconds": 86400,
    "MaxWaitTimeInSeconds": 90000
  },
  "CheckpointConfig": {
    "S3Uri": "s3://ml-checkpoints/job-123/"
  }
}
```

- `MaxWaitTimeInSeconds` must be **>= MaxRuntimeInSeconds** — time waiting for Spot capacity included.
- **Checkpoints are critical**: Spot instances can be reclaimed mid-job. `CheckpointConfig` saves progress to S3. Resume from checkpoint post-reclamation, not from start. No checkpoints + Spot = restart from scratch on every reclamation.

> 💡 **Related Theory**: Spot suits training because "training is idempotent batch work that resumes." Reclamation doesn't break correctness if resumed from checkpoint. Real-time inference endpoints can't tolerate reclamation—Spot is inappropriate. **Rule: Spot for training; never real-time inference.**

## Right-Sizing Instances

Wrong instance choice wastes money. Two directions: overprov isioning or wrong type.

- **Traditional ML (XGBoost, linear)** → CPU (m5/c5). Tree and linear models get little GPU benefit. GPU (p4d) here is money wasted.
- **Deep learning training** → GPU (g5/p4d). Larger models need GPU memory and performance.
- **Deep learning inference cost cuts** → Inferentia (inf1/inf2). Inference-only accelerator lowers per-unit cost.
- **Uncertain?** → **Inference Recommender** runs load tests suggesting optimal instance for cost/latency (inference). Training: test small data, watch metrics, adjust.

> 💡 **Related Theory**: Right-sizing principle: "minimum sufficient size for workload." GPUs excel at parallel matrix ops (deep learning), not trees. "XGBoost on GPU" is almost always wrong; "deep learning inference on Inferentia" is almost always right on cost exams.

## Inference Options Kill Idle Cost

Inference cost's big picture: "eliminate always-on cost during zero-traffic windows."

- **Real-time endpoint**: Steady traffic. Always-on minimum 1 instance cost. High idle = expensive.
- **Serverless inference**: Sporadic traffic. Scales to zero. Cold start tradeoff.
- **Async inference**: Big payload/long processing. Scales to zero between jobs.
- **Batch transform**: Bulk scoring. Instance terminates after job. Cheapest.

Cost decision: **If 0-traffic windows exist**, serverless/async/batch zeros idle cost. **If always traffic**, real-time + autoscaling + (multi-model if many) MME + (deep learning if DL) Inferentia lower per-unit cost.

```text
Cost Optimization Decision
Zero-traffic windows?
 ├─ Yes → Batch possible? → Yes: Batch Transform / No: Serverless (small) or Async (large)
 └─ No (always traffic) → Real-time + Autoscaling + MME (many models) + Inferentia (DL)
```

## Auto-Shutdown — Catch Forgotten Resources

Hidden cost culprit: "powered on but not used."

- **Studio/notebook auto-shutdown**: Idle notebooks auto-terminate via lifecycle config or Studio settings after idle time.
- **Training job `MaxRuntimeInSeconds`**: Prevent buggy training running infinitely.
- **Endpoint cleanup**: Unused real-time endpoints have always-on cost—delete or convert to serverless.
- **Autoscaling + scale-in**: Drop instances as traffic falls (down to minimum).

> 💡 **Related Theory**: 80% of ML cost accidents come from "resources left on." Auto-shutdown (idle timer, MaxRuntime, autoscaling scale-in) automates human errors. Exam "unexpected cost spike"  questions often have auto-shutdown/cleanup as the answer.

## Cost Monitoring and Governance

Visibility enables control.

- **Tag-based cost allocation**: Tag jobs/endpoints with `Project`, `Team`, `Environment`; Cost Explorer breaks costs by tag.
- **AWS Budgets**: Set monthly budget, alert on threshold exceed. Forecasting alerts available.
- **Cost Explorer**: Trend analysis, identify which instances/services consume.
- **CloudWatch**: `Invocations`, `ModelLatency` reveal idle/overprovisioning.
- **Savings Plans/Reserved Instances**: Steady workloads (always-on endpoints, scheduled training) get cheaper via commitment.

```text
Tag Example (cost allocation)
TrainingJob tags: { "Project": "fraud-ml", "Team": "risk", "Environment": "prod" }
→ Cost Explorer Project filter shows fraud-ml costs only
```

> 💡 **Related Theory**: Cost governance loops: "measure → allocate → budget → alert." Tags allocate costs to teams/projects. Budgets set limits and trigger alerts. "See costs by team" scenarios → tags. Always the answer.

## Summary

Today in one sentence: **Train on Spot + checkpoints, right-size instances (tree=CPU, DL=GPU, DL inference=Inferentia), kill idle (serverless/async/batch), auto-shutdown resources (idle timers, MaxRuntime, scale-in), show costs via tags/Budgets/Cost Explorer.** Spot = training only, cost spikes = usually forgotten resources, team cost split = tags. Three points solve most cost scenarios.

Tomorrow: Week 9 synthesis — all four security, networking, encryption, cost axes at once.

---

## 📝 Practice Questions

**Question 1.** You want to cut the cost of a deep learning training job that takes several days as much as possible. The job can be interrupted and resumed. Which configuration is the most appropriate?

A) Run only on On-Demand GPU with no checkpoints  
B) Turn on Managed Spot Training and save checkpoints to S3 with `CheckpointConfig`  
C) Train with a real-time endpoint  
D) Train deep learning on CPU instances  

**Answer: B**  
Explanation: Resumable training fits well with Spot and can save up to 90%, and the key is saving checkpoints to S3 so that training does not restart from scratch when Spot capacity is reclaimed. A has no means of saving cost, C is wrong because endpoints are not for training, and D runs deep learning on CPU, which makes training inefficiently slow.

---

**Question 2.** An internal ML tool's inference endpoint is called only occasionally during business hours, and traffic is 0 at night and on weekends. What is the most appropriate way to reduce cost?

A) A real-time endpoint that always keeps 8 instances  
B) Switch to serverless inference that scales to 0  
C) Buy Reserved Instances on a 1-year commitment  
D) Replace with GPU instances  

**Answer: B**  
Explanation: For an intermittent workload whose traffic drops to 0, idle periods are the biggest waste, so serverless inference that scales to 0 eliminates the cost of those periods. A keeps paying for 8 instances even when idle, C is a commitment suited to always-on workloads and loses money on an intermittent pattern, and D actually increases cost.

---

**Question 3.** Monthly ML costs greatly exceeded expectations, and the investigation found that data scientists left notebook instances and some real-time endpoints running after use. What is the most effective measure to prevent recurrence?

A) Stop all training  
B) Configure notebook idle auto-shutdown, clean up unused endpoints, and set `MaxRuntimeInSeconds` on training jobs  
C) Change the instance types to larger ones  
D) Delete the S3 buckets  

**Answer: B**  
Explanation: Always-on resources left running are the cause of the cost spike, so using automatic shutdown mechanisms such as idle notebook auto-shutdown, unused endpoint cleanup, and a maximum training runtime limit lets the system prevent human error. A is an overreaction that halts work, C increases cost, and D loses data and is unrelated to the cause.

---

**Question 4.** Multiple teams use SageMaker in a shared AWS account, and you want to see separately how much ML cost each team and project is incurring. What is the most appropriate method?

A) Use a separate Region for each team  
B) Attach `Team` and `Project` cost allocation tags to training jobs and endpoints, and aggregate by tag in Cost Explorer  
C) Unify all resources under a single name  
D) Look only at CloudWatch logs  

**Answer: B**  
Explanation: To attribute cost by team and project, the standard approach is to attach cost allocation tags to resources and filter and aggregate by tag in Cost Explorer. A is wrong because separating Regions is not the right way to attribute cost, C removes the distinction instead, and D is only logs and not a cost aggregation tool.

---

**Question 5.** Which of the following incorrectly pairs an instance choice with cost efficiency?

A) XGBoost training → CPU (m5/c5) instances  
B) Large-scale deep learning training → GPU (g5/p4d) instances  
C) Reducing deep learning inference cost → AWS Inferentia (inf1/inf2)  
D) Reducing XGBoost inference cost → switch to high-performance GPU (p4d)  

**Answer: D**  
Explanation: XGBoost, a tree-based model, gains almost nothing from GPU parallelization, so switching to a high-performance GPU only increases cost without benefit, and CPU is appropriate. A, B, and C are all correct cost-efficiency pairings: traditional ML = CPU, deep learning training = GPU, and deep learning inference acceleration = Inferentia.

---
