# Day 5 - Week 8 Summary: ML Solution Monitoring and Maintenance Review

## 📌 Key Takeaways

- The backbone of Week 8 is a closed loop - **detect (drift, performance, system) → alarm → retrain → safe redeploy → detect again**.
- Monitor selection splits on **whether labels exist**. Labels available → model quality; none → data quality and feature attribution.
- **Model performance degradation** (accuracy) and **system performance degradation** (latency, errors) call for different tools - Model Quality Monitor vs CloudWatch.
- Investigating an error-rate surge starts with the **4XX (client) / 5XX (server)** split; pinpointing latency by segment is **X-Ray**.
- Redeployment is a risk ladder - **shadow** (zero impact) → **A/B and canary** (small exposure) → **Blue/Green** (automatic rollback is essential).

## Week 8 on One Page

Week 8 covered "life after deployment". The model begins creating value the moment it ships, but simultaneously begins to drift from the world. Data changes, bias emerges, the system slows down, performance drops. The four posts connect into one loop.

```text
              ┌───────────────── Running endpoint ─────────────────┐
              │                                                     │
   ┌──────────┴──────────┐                 ┌────────────────────┐   │
   │ Day 1-2  Is the model right │          │ Day 3  Is the system healthy │   │
   │  Data quality (Deequ)    │             │  ModelLatency        │   │
   │  Model quality (needs GT) │            │  OverheadLatency     │   │
   │  Bias drift (Clarify)     │            │  4XX / 5XX Errors    │   │
   │  Attribution drift (SHAP) │            │  CPU/Mem/GPU utilization │   │
   └──────────┬──────────┘                 └──────────┬─────────┘   │
              │                                       │             │
              └───────────┬───────────────────────────┘             │
                          ▼                                         │
                 CloudWatch metrics · alarms                         │
                          │                                         │
        ┌─────────────────┴──────────────────┐                      │
        ▼                                    ▼                      │
  Auto Scaling / operational action     EventBridge · Lambda         │
  (respond to latency/errors)                │                       │
                                           ▼                         │
                              Day 4  SageMaker Pipelines retraining  │
                                     → ConditionStep → Registry      │
                                     → shadow / A/B / blue-green redeploy ──┘
```

## 1. The Four Model Monitor Monitors (Days 1-2)

All monitoring starts with **Data Capture** (storing requests and responses in S3), builds a **baseline** (the standard for normal), and then launches a Processing Job on a **cron schedule** to compare.

| Monitor | What it watches | Tool | Labels needed |
|---------|-----------------|------|---------------|
| Data quality | Distribution statistics of input features (data drift) | Model Monitor (Deequ) | Not needed |
| Model quality | Prediction performance metrics (accuracy, F1) | Model Monitor | **Needed (ground truth)** |
| Bias drift | Prediction bias between groups (fairness) | Clarify | Not needed for some |
| Feature attribution drift | Changes in feature importance (SHAP) | Clarify | Not needed |

Looking at the same table again as "when does it fire" makes the choice sharper.

| Monitor | Detection speed | Incidents it catches | What it cannot catch |
|---------|-----------------|----------------------|----------------------|
| Data quality | Immediate (next period) | Schema breakage, missing-value surge, new categories, distribution shift | The case where the distribution is unchanged but the relationship changed |
| Model quality | After labels accumulate | Actual accuracy drop (the consequence of concept drift) | Cannot be computed at all without labels |
| Bias drift | Immediate; delayed for metrics that need labels | Changes that become unfavorable to a particular group | Overall performance degradation itself |
| Feature attribution drift | Immediate | The features the model depends on changed (early warning) | How much worse performance actually became |

> 💡 **Related theory**: The key distinction of drift - **data drift (covariate shift)** is a change in the distribution of input X (the data quality monitor), and **concept drift** is a change in the relationship between X and Y (the model quality monitor captures it as performance degradation). If labels cannot be obtained immediately, model quality is impossible, so you work around it with **data quality** or **feature attribution** drift to get an early warning. This "label availability → monitor choice" logic is the criterion that decides the answer in Week 8 multiple-choice questions.

## 2. Operational Monitoring: CloudWatch and X-Ray (Day 3)

Separately from whether the model is right, we look at **whether the system is healthy**. The three pillars of observability: **metrics (CloudWatch Metrics), logs (CloudWatch Logs), traces (X-Ray)**.

- Key metrics: `ModelLatency` and `OverheadLatency` (latency), `Invocations` (call volume), `4XX/5XXErrors` (errors), `CPU/Memory/GPUUtilization` (resources).
- **4XX = client error** (wrong input), **5XX = server error** (container crash, resource shortage). The first step in error tracing.
- **CloudWatch Alarm**: Fires SNS, Auto Scaling, or Lambda when a threshold is breached. `EvaluationPeriods` reduces false positives.
- Responding to traffic swings is **Application Auto Scaling**, not a simple alarm.

For latency metrics, which one spiked determines the cause.

| Observed combination | Interpretation | Next action |
|----------------------|----------------|-------------|
| Total latency ↑, `ModelLatency` normal | The bottleneck is outside the model (front-end Lambda, network, external API) | Pinpoint the segment with X-Ray |
| `ModelLatency` ↑ | Model computation, instance load | Upgrade or add instances, slim down the model |
| `OverheadLatency` ↑ | Payload and request-handling overhead | Shrink payload, simplify format |
| `5XXErrors` ↑ + `MemoryUtilization` ↑ | Container OOM, resource shortage | Larger-memory type, reduce batch size |
| `4XXErrors` ↑ | Caller input or authentication problem | Client validation, document the schema |

```python
# Best practice for operations: gather operational metric alarms + model monitor metrics on one dashboard
# ModelLatency surge → instance load, OverheadLatency surge → request handling/payload problem
# Only total latency up while ModelLatency is normal → trace the front-end (Lambda/network) bottleneck with X-Ray
```

> ⚠️ **Trap**: The phrase "performance degradation" is ambiguous. **Model performance degradation** (accuracy drop) is the Model Quality Monitor; **system performance degradation** (latency, errors) is the CloudWatch operational metrics. You must distinguish whether the question sentence is about "accuracy/prediction quality" or "latency/errors/resources" to choose the tool.

## 3. The Retraining and Redeployment Loop (Day 4)

Detection is not the end. Operations are mature only when the response is automated.

Automation chain:
1. Model Monitor violation → **CloudWatch Alarm**
2. → trigger a **SageMaker Pipeline** via **EventBridge/Lambda**
3. → retrain on the latest data → evaluate
4. → register in **Model Registry** only when the criterion passes, via **ConditionStep** (regression prevention)
5. → safe redeployment

Redeployment strategy comparison:

| Strategy | User impact | Use |
|----------|-------------|-----|
| Shadow | 0 (responses are only recorded, not sent to users) | Risk-free technical validation with production traffic |
| A/B (variant weights) | Some (the new model's responses actually go out) | Gradual rollout, comparing business outcomes |
| Blue/Green and canary | Gradual shift + automatic rollback | Safe full replacement |

Pick among the three retraining triggers by comparing them as well.

| Trigger | Cost | Reaction speed | Typical scenario phrasing |
|---------|------|----------------|---------------------------|
| Drift-based | Low (only when changes occur) | Fast | "while reducing unnecessary retraining cost" |
| Performance-based | Medium | Delayed by the wait for labels | "when accuracy falls below the threshold" |
| Schedule-based | High (always runs) | Delayed by the period | "regularly every week" |

It is easy to memorize as a risk ladder. **Safest = shadow** (zero user impact) → **middle = A/B/canary** (gradual exposure to a small number of users) → **full = Blue/Green** (guardrails and automatic rollback are essential). For retraining triggers too, from a cost perspective a **drift-based event trigger** is preferred over a schedule-based one.

## 4. Exam Decision Points

These are the branches for solving Week 8 questions quickly.

1. **Are labels available immediately?** Yes → model quality. No → data quality/feature attribution.
2. **Fairness/group bias?** → Clarify Bias Drift. **Feature importance?** → Clarify Feature Attribution.
3. **Accuracy problem vs latency/error problem?** → the former is Model Quality Monitor, the latter is CloudWatch operational metrics.
4. **Cause of an error-rate surge?** → First split 4XX (client) vs 5XX (server).
5. **Validate a new model with no user impact?** → Shadow. **Gradual transition and outcome comparison?** → A/B.
6. **Reduce retraining cost?** → A drift event trigger instead of schedule-based.
7. **Overall latency is slow but the model is normal?** → Trace the front-end segment with X-Ray.
8. **Automatically respond to traffic swings?** → Application Auto Scaling, not an alarm notification.
9. **Block the risk that a retrained model is worse?** → ConditionStep + conditional registration in Model Registry.

It is also quick to have a mapping that jumps from the keywords of the question sentence straight to a service.

| Expression in the question | Answer to recall immediately |
|----------------------------|------------------------------|
| "whether the input distribution differs from training" | Data quality monitor |
| "ground truth labels cannot be obtained" | Data quality / feature attribution drift |
| "whether accuracy/F1 is dropping" | Model quality monitor (+ ground truth collection) |
| "whether it is becoming unfavorable to a particular group" | Clarify bias drift |
| "whether the features it depends on have changed" | Clarify feature attribution drift (SHAP) |
| "requests and responses must be stored" | Data Capture |
| "build the standard for normal" | Baseline (statistics, constraints, Deequ) |
| "trace latency by segment" | X-Ray |
| "want to reduce false positives" | Raise `EvaluationPeriods` |
| "validate with no user impact" | Shadow testing |
| "distribute traffic by weights" | Production variant A/B |
| "automatic rollback" | Deployment guardrails (blue/green + CloudWatch alarm) |

## 5. Confusing Pairs Summarized

The points where wrong answers cluster are generally the following four pairs.

| Confusing pair | One line that splits them |
|----------------|---------------------------|
| Data quality vs feature attribution | "The value changed" vs "the influence of that value on predictions changed" |
| Model quality vs CloudWatch metrics | "Predictions are wrong" vs "responses are slow or failing" |
| A/B vs shadow | The new model's response "goes" to users vs "does not go" |
| Alarm vs Auto Scaling | "Notifies a person" vs "automatically adds instances" |

## 6. Comprehensive Diagnosis Table: Symptom → Cause → Action

| Symptom | Common cause | Action |
|---------|--------------|--------|
| Monitoring results stay empty | Data Capture not configured / zero traffic in that period | Check the capture S3 path, raise `sampling_percentage` |
| The model quality monitor cannot produce metrics | Ground truth not collected, `inference_id` mismatch | Check answer upload and ID matching; if none, substitute data quality/attribution |
| Drift alert but model quality is normal | Distribution change in a feature with no performance impact | Observe instead of retraining immediately, tier thresholds toward important features |
| Performance got worse after retraining | Unconditional automatic registration and deployment | Register only when the criterion passes, using ConditionStep |
| 5XX surge + memory utilization surge | Container OOM, resource shortage | Switch to a larger-memory type, add instances, reduce batch |
| Latency exceeds the limit at every traffic surge | Auto Scaling not set | Register an Application Auto Scaling target tracking policy |
| Failure after full replacement but rollback did not happen | No CloudWatch alarm connected to the guardrail | Connect a rollback alarm to the deployment policy and verify in advance |
| Monitoring and retraining costs are excessive | Hourly schedule + 100% capture + schedule-based retraining | Relax the period, lower sampling, switch to event-based triggers |

Next week continues into deeper ML solution monitoring and maintenance - security and governance, cost optimization, and advancing the MLOps pipeline.

## 📖 Glossary

- **Closed loop (MLOps loop)**: An operating structure that cycles on its own: detect → alarm → retrain → redeploy → detect again.
- **Data Capture**: A feature that stores endpoint requests and responses in S3. The raw material for all monitoring.
- **Baseline**: A snapshot of the standard for "normal". For data quality it comes out as `statistics.json` and `constraints.json`.
- **Data drift / concept drift**: The distribution of input X changes / the relationship between X and Y itself changes.
- **Ground truth**: The actual answer used to judge whether a prediction was right. A required ingredient of the model quality monitor and usually confirmed late.
- **SHAP attribution drift**: An early-warning metric that checks, without labels, whether the ranking and magnitude of feature importance have departed from the baseline.
- **Three pillars of observability**: Metrics, logs, traces. CloudWatch Metrics, CloudWatch Logs, and X-Ray correspond to each.
- **Application Auto Scaling**: A service that automatically increases or decreases the endpoint's instance count based on a metric. The standard for responding to traffic swings.
- **ConditionStep**: A pipeline condition step that allows a model to be registered or deployed only when the evaluation metric clears the bar.
- **Shadow / A/B / deployment guardrails**: Risk-free validation that only records responses / validation that exposes part of the users by weight to compare outcomes / a safe-deployment mechanism that attaches alarm-based automatic rollback to blue-green or canary transitions.

---

## 📝 Practice Questions

**Question 1.** In production there is no way at all to collect the model's actual ground truth labels, and you want to detect model performance degradation early. What is the most appropriate combination?

A) Use only the Model Quality monitor  
B) Data Quality drift + Feature Attribution Drift monitors  
C) Use only a CloudWatch 4XX alarm  
D) Nothing can be done  

**Answer: B**  
Explanation: Without labels the Model Quality monitor cannot be used, so you get early warning from Data Quality (input distribution changes) and Feature Attribution (SHAP importance changes) drift, which need no labels. A is impossible because it requires ground truth, C is only a system error metric unrelated to model performance, and D is wrong because indirect detection is possible even without labels.

---

**Question 2.** On an endpoint, `Invocation5XXErrors` spiked and `ModelLatency` also soared. Which area should you suspect first?

A) The client's incorrect payload format  
B) Server-side problems such as resource exhaustion or crashes in the model container  
C) Clarify bias metrics  
D) S3 versioning settings  

**Answer: B**  
Explanation: A simultaneous spike in 5XX (server errors) and ModelLatency is a server-side signal that the model container is struggling with load, resource exhaustion, or timeouts. Adding instances and health checks are needed. A is typical of 4XX, C is a fairness metric unrelated to system errors, and D is an unrelated setting.

---

**Question 3.** You want to validate a new model version with production traffic without ever affecting users, and, once sufficiently validated, gradually expose it to some users. Which phased strategy is correct?

A) Switch 100% from the start with blue/green  
B) First validate risk-free with shadow testing, then roll out gradually with A/B (variant weights)  
C) Split 50:50 with A/B, then switch to shadow  
D) Skip retraining and deploy right away  

**Answer: B**  
Explanation: Following the risk ladder, validate first with shadow testing, which has zero user impact, and once satisfied, gradually expose a small share of users with A/B weights; this is the safe phased strategy. A is risky because it switches everything without validation, C is illogical because the order is reversed (shadow after users have already been affected), and D skips validation entirely.

---

**Question 4.** To have retraining start automatically after Model Monitor detects drift, which service combination best fills the blank? "Model Monitor violation → CloudWatch Alarm → ___ → SageMaker Pipeline execution"

A) S3 → Glue  
B) EventBridge (or SNS → Lambda)  
C) DynamoDB Streams  
D) QuickSight  

**Answer: B**  
Explanation: The standard automation chain is that when a CloudWatch Alarm enters the ALARM state, an EventBridge rule or SNS → Lambda triggers a SageMaker Pipeline retraining run. A is for ETL, C is a database change stream, and D is a BI dashboard, none of which serves as a pipeline trigger.

---

**Question 5.** In a retraining pipeline, what is the standard mechanism to prevent performance regression when a newly trained model falls short of the evaluation criteria?

A) Deploy every new model unconditionally  
B) Use SageMaker Pipelines' ConditionStep to register in Model Registry only when the criteria are passed  
C) Delete the endpoint every time  
D) Only leave a warning in CloudWatch Logs and deploy as is  

**Answer: B**  
Explanation: With a ConditionStep, the model is registered (and subsequently deployed) only when the evaluation metrics pass the criteria, and if they fall short the existing model is kept to prevent regression. A and D let bad models be deployed and allow regression, and C is an unrelated action that interrupts the service.

---
