# Day 5 - Week 8 Summary: ML Solution Monitoring and Maintenance Review

Week 8 addressed "life after deployment." The model begins creating value the moment it ships, but simultaneously begins to drift from the world. Data changes, bias emerges, systems slow down, performance degrades. This week you learned the entire process of **detecting (monitor)** and **responding to (maintain)** these changes. Today we consolidate the four days into one unified picture before the exam.

The big picture is a closed loop: **drift/performance/system detection → alarm → retraining → safe redeployment → monitoring again.** This loop is the heart of "operational ML (MLOps)."

## 1. Four Model Monitor Monitors (Day 1~2)

All monitoring begins with **Data Capture** (storing requests and responses to S3), establishes a **baseline** (definition of normal), then launches Processing Jobs on **cron schedule** to compare.

| Monitor | What It Watches | Tool | Label Required |
|---------|-----------------|------|-----------------|
| Data Quality | Input feature distribution statistics (data drift) | Model Monitor (Deequ) | No |
| Model Quality | Predicted performance metrics (accuracy, F1) | Model Monitor | **Yes (ground truth)** |
| Bias Drift | Predicted bias across groups (fairness) | Clarify | Partially not required |
| Feature Attribution Drift | Feature importance changes (SHAP) | Clarify | No |

> 💡 **Related Theory**: The critical drift distinction — **data drift (covariate shift)** is the distribution change in input X (caught by Data Quality Monitor), **concept drift** is the relationship change between X and Y (caught by Model Quality Monitor via performance degradation). When labels don't arrive immediately, Model Quality is impossible, so we work around with Data Quality or Feature Attribution drift for early warning. This "label presence → monitor selection" logic is a Week 8 exam staple.

## 2. Operational Monitoring: CloudWatch and X-Ray (Day 3)

Beyond whether the model is correct, **is the system healthy?** The three pillars of observability: **metrics (CloudWatch Metrics), logs (CloudWatch Logs), traces (X-Ray)**.

- Key metrics: `ModelLatency`, `OverheadLatency` (latency), `Invocations` (call volume), `4XX/5XXErrors` (errors), `CPU/Memory/GPUUtilization` (resources).
- **4XX = client errors** (invalid input), **5XX = server errors** (container crash, resource shortage). First step in error triage.
- **CloudWatch Alarm**: triggers SNS, autoscaling, Lambda on threshold violation. Use `EvaluationPeriods` to reduce false alarms.
- Traffic variability response isn't simple alarms but rather **Application Auto Scaling**.

```python
# Best practice: aggregating operational metrics + model monitor metrics on one dashboard
# ModelLatency spike → instance load, OverheadLatency spike → request processing/payload issue
# Overall latency increases, ModelLatency normal → use X-Ray to trace upstream bottleneck (Lambda/network)
```

> ⚠️ **Trap**: "Performance degradation" is ambiguous. **Model performance degradation** (accuracy drop) is caught by Model Quality Monitor, **system performance degradation** (latency, errors) is caught by CloudWatch operational metrics. When problem wording mentions "accuracy/prediction quality" vs "latency/errors/resources," select your tool accordingly.

## 3. Retraining and Redeployment Loop (Day 4)

Detection is not the end. Response must be automated for mature operations.

Automation chain:
1. Model Monitor violation → **CloudWatch Alarm**
2. → **EventBridge/Lambda** triggers **SageMaker Pipeline**
3. → retrains with latest data → evaluates
4. → **ConditionStep** registers only if baseline passed to **Model Registry** (prevents regression)
5. → safe redeployment

Redeployment strategy comparison:

| Strategy | User Impact | Use Case |
|----------|------------|----------|
| Shadow | Zero (predictions recorded, users never see) | Risk-free validation with live traffic |
| A/B (variant weights) | Partial (new model responses actually returned) | Gradual rollout, business metric comparison |
| Blue/Green, Canary | Gradual switch + auto-rollback | Safe full replacement |

> 🔍 **Deeper**: Remember the risk ladder. **Safest = Shadow** (zero user impact) → **Middle = A/B/Canary** (minority exposure with gradual rollout) → **Full = Blue/Green** (full switch with guardrails and auto-rollback). Retraining triggers also prefer **drift-based event triggers** over schedule-based from a cost perspective.

## 4. Key Decision Points for the Exam

Fast-moving branches in Week 8 problems.

1. **Do you have labels immediately?** Yes → Model Quality. No → Data Quality/Feature Attribution.
2. **Fairness/group bias?** → Clarify Bias Drift. **Feature importance?** → Clarify Feature Attribution.
3. **Accuracy problem vs latency/error problem?** → Former is Model Quality Monitor, latter is CloudWatch operational metrics.
4. **Error rate spike cause?** → Distinguish 4XX (client) vs 5XX (server) first.
5. **New model validation without user impact?** → Shadow. **Gradual transition and metric comparison?** → A/B.
6. **Reduce retraining cost?** → Event-based drift trigger instead of schedule-based.

## Summary

Week 8 in one sentence: **Models live and move after deployment; you must detect drift, bias, and explanation changes with Model Monitor and Clarify; monitor system health with CloudWatch and X-Ray; automate retraining with SageMaker Pipelines; and safely redeployment with shadow, A/B, and guardrails in a closed loop.** The decision factors remain constant: **label presence** (monitor type), **model vs system** (quality monitor vs CloudWatch), **acceptable user impact** (shadow vs A/B vs blue/green). This three-axis framework solves most monitoring and maintenance scenarios.

Next week: ML solution monitoring and maintenance depth — security and governance, cost optimization, advanced MLOps pipeline.

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
