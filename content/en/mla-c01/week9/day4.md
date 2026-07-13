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

## 📝 연습 문제

**문제 1-5** [Practice questions in Korean follow after marker]

---
