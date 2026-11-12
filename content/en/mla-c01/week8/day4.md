# Day 4 - Continuous Learning & Retraining: Automated Drift Detection and Retraining Triggers

When monitoring detects drift or performance degradation, models don't self-heal. Someone must retrain. **Continuous learning** automates the "detect degradation → retrain → validate → redeploy" loop. This closes the MLOps circle: yesterday's CI/CD deploys models, today's operations monitor them, and today's continuous learning retrains them. MLA-C01 tests "when and how to trigger automated retraining".

Core concept: **Drift trigger** (data/model performance falls below threshold) → **Retrain pipeline auto-starts** → **New model registers** → **Quality gate evaluation** → **If approved, auto-deploy**. Same CI/CD infra (SageMaker Pipelines, Model Registry, CodePipeline) from earlier weeks powers the loop.

## When to Trigger Retraining?

Data changes over time—customer behavior shifts, new patterns appear, old patterns vanish. **Concept drift** (label/target distribution changes), **data drift** (feature distribution changes), or **prediction drift** (model predictions diverge from reality). Monitoring detects these via:

- **Model performance degradation**: Accuracy/AUC falls below baseline.
- **Data drift alerts**: Feature distributions deviate from training data.
- **Prediction drift**: Model outputs systematically wrong on recent data.

Retraining triggers include:
- **Scheduled**: Monthly retrain regardless (ensures freshness).
- **Drift-triggered**: Auto-retrain on detected drift (responds to change).
- **Performance-triggered**: Auto-retrain on accuracy drop below threshold.

## Automated Retraining Pipeline Architecture

Retraining loops typically:
1. **Monitoring detects issue** (drift/degradation).
2. **Event triggers pipeline** (via EventBridge or Step Functions).
3. **Pipeline fetches fresh data**, retrains, evaluates.
4. **Quality gate**: if performance meets threshold, register new model.
5. **Approval**: registry triggers deploy if approved.

The pipeline is the same SageMaker Pipelines/CodePipeline from Day 7 (week 1), now triggered by drift events instead of code commits.

## Feature Store & Data Freshness

Continuous learning benefits from **SageMaker Feature Store** to version features. Historical feature values (at training time vs. current time) let you detect drift and fetch consistent data for retraining.

## Summary

Continuous learning closes the loop: deploy → monitor → detect drift → auto-retrain → validate → redeploy. **EventBridge** detects drift/performance events; **SageMaker Pipelines** executes retraining; **Model Registry** gates quality; **CodePipeline** deploys. Combining monitoring (week 8 days 1-2), CI/CD (week 7 days 1-3), and automation (this week) creates truly autonomous ML systems.

---

## 📝 Practice Questions

**Question 1.** You want to automatically start a retraining pipeline when model accuracy drops below the baseline of 0.85. What is the most appropriate trigger?

A) EventBridge scheduled rule (cron)  
B) A CloudWatch Alarm detects the accuracy metric breaching the threshold → EventBridge or Lambda trigger  
C) S3 versioning  
D) IAM policy change  

**Answer: B**  
Explanation: An accuracy drop is detected by a CloudWatch Alarm, and the ALARM state change is delivered to EventBridge or Lambda to trigger the retraining pipeline. A is only a scheduled trigger and not detection of performance degradation, and C and D are unrelated to monitoring or triggering.

---

**Question 2.** In a continuous training loop, what should happen if the retrained model performs worse than the previous model?

A) Deploy it automatically  
B) The quality gate (ConditionStep) blocks registration  
C) Delete the previous model  
D) Only notify a person and do nothing else  

**Answer: B**  
Explanation: A ConditionStep (quality gate) at the end of the pipeline checks the performance threshold and blocks registration if it is below the standard. A is risky, C loses version history, and D lacks automation.

---
