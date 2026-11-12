# Day 1 - Model Monitoring: SageMaker Model Monitor and Drift Response

Deploy, celebrate, ship → quiet catastrophe. Months pass, model silently degrades. Validation was 95%, production is 60%. The culprit: the world changed, data drifted. Today covers **SageMaker Model Monitor** — detecting data/model drift without labels — and automating **retrain on alarm**.

## Why Post-Deploy Monitoring Matters

Deployed model relies on learned patterns. Real-world distribution shifts:
- Users change behavior (seasonality, new segment, crisis)
- Data source changes (sensor recalibration, upstream pipeline shift)
- Target relationship breaks (same features, different meaning)

Ground truth (actual labels) arrives late or not at all. So **monitor input distribution** as proxy alarm.

```text
Drift types:
- Data drift: X distribution shifts (e.g., avg age 35→48)
- Concept drift: X-Y relationship changes (same feature, different outcome)
- Label drift: Y distribution shifts (e.g., fraud 0.5%→3%)
```

> 💡 **Related Theory**: "Model degrades, labels arrive slowly, what do we watch?" Answer: **input data statistics without labels**. Drift in X alone is early warning. Concept drift is hardest (needs labels) but data drift is actionable today.

## SageMaker Model Monitor: 4 Monitor Types

| Monitor | Watches | Labels needed? |
|------|------|------|
| **Data Quality** | Input feature stats (missing, type, distribution) | No |
| **Model Quality** | Accuracy, F1, RMSE (prediction quality) | Yes |
| **Bias Drift** | Group fairness (Clarify) | Partial |
| **Feature Attribution Drift** | SHAP contributions change | No |

## Setup: Data Capture → Baseline → Schedule

### 1. Data Capture

Endpoint captures in/out to S3.

```python
from sagemaker.model_monitor import DataCaptureConfig

data_capture_config = DataCaptureConfig(
    enable_capture=True,
    sampling_percentage=100,          # or sample %
    destination_s3_uri="s3://my-bucket/datacapture",
)

predictor = model.deploy(
    ...,
    data_capture_config=data_capture_config,
)
```

### 2. Baseline Generation

Learn "normal" from train/val data.

```python
from sagemaker.model_monitor import DefaultModelMonitor

monitor = DefaultModelMonitor(...)
monitor.suggest_baseline(
    baseline_dataset="s3://my-bucket/baseline/train.csv",
    ...
    output_s3_uri="s3://my-bucket/baseline-results",
)
# Outputs: statistics.json, constraints.json
```

### 3. Scheduled Monitoring

Compare captured traffic vs baseline hourly (or custom cron).

```python
monitor.create_monitoring_schedule(
    monitor_schedule_name="data-quality-hourly",
    endpoint_input=predictor.endpoint_name,
    statistics=monitor.baseline_statistics(),
    constraints=monitor.suggested_constraints(),
    schedule_cron_expression=CronExpressionGenerator.hourly(),
    enable_cloudwatch_metrics=True,
)
```

Each run → `constraint_violations.json` + CloudWatch metrics.

> 💡 **Related Theory**: Baseline is "today's normal" snapshot. If you retrain, **regenerate baseline** — old baseline gets false alarms (legitimate distribution you intentionally taught). Baseline drift is real.

### 4. Drift → Retrain Automation

Monitoring → CloudWatch alarm → EventBridge → Lambda/Pipeline retrain.

```text
[Endpoint] DataCapture(S3)
   ↓
[Monitor] constraints violation → CloudWatch Metric/Alarm
   ↓
[EventBridge] alarm breach → trigger SageMaker Pipeline
   ↓
[Pipeline] retrain, register model
   ↓
[Model Registry] new version, manual approval, redeploy
```

## Model Quality Monitoring (With Label Delay)

Needs actual labels. Strategy: predictions merge with labels arriving later, Model Quality compares.

If labels never arrive, Data Quality is your 1st line.

## Summary

Post-deploy: capture traffic, baseline on clean train data, monitor stats, alarm on drift, retrain on breach. No labels needed for data quality. Cascades to Model Quality once labels arrive. Baseline regeneration critical.

Tomorrow: MLOps end-to-end — Pipelines, Registry, governance.

## 📝 Practice Questions

**Question 1.** In the input traffic of a production SageMaker endpoint, the mean and variance of a particular numeric feature have changed significantly from training time. The ground-truth labels will not be collected until several days later. Which Model Monitor type is MOST appropriate for detecting this change immediately?

A) Model Quality monitoring  
B) Data Quality monitoring  
C) A/B testing traffic split  
D) Hyperparameter Tuning  

**Answer: B**  
Explanation: Detecting statistical distribution changes in input features without ground truth is Data Quality monitoring. Model Quality (A) requires ground-truth labels, A/B testing (C) is for comparing deployments, and tuning (D) is a training-phase task.

---

**Question 2.** You want to set up Model Monitor data quality monitoring. Which step should be performed FIRST?

A) Create an EventBridge rule  
B) Generate a baseline (statistics and constraints) from the training/validation data  
C) Retrain the model  
D) Configure a CloudWatch dashboard  

**Answer: B**  
Explanation: Monitoring can compare only if there is a baseline statistics.json/constraints.json that serves as the "normal reference," so baseline generation comes first. EventBridge (A) and CloudWatch (D) are response steps after a violation occurs, and retraining (C) is a result of drift detection.

---

**Question 3.** You deliberately retrained the model to reflect a new data distribution. However, the existing monitoring publishes drift violations on every run. What is the MOST appropriate action?

A) Permanently delete the monitoring schedule  
B) Lower sampling_percentage to 0  
C) Regenerate the baseline from the new training data  
D) Increase the endpoint instance type  

**Answer: C**  
Explanation: Because the new distribution has been accepted as normal, the baseline must be regenerated so that legitimate changes are not falsely flagged. Deleting monitoring (A) means abandoning oversight, sampling 0 (B) stops capture, and changing the instance (D) is irrelevant.

---

**Question 4.** When a data quality violation occurs, you want to automatically start a retraining pipeline without human intervention. Which service is MOST appropriate for receiving the CloudWatch alarm and invoking a SageMaker Pipeline?

A) Amazon EventBridge  
B) Amazon Macie  
C) AWS Glue DataBrew  
D) Amazon Comprehend  

**Answer: A**  
Explanation: EventBridge is an event routing service that receives events such as CloudWatch alarm state changes and triggers a Pipeline or Lambda. Macie (B) is for data classification and security, Glue DataBrew (C) is for data preparation, and Comprehend (D) is an NLP service.

---

**Question 5.** Which is the MOST accurate description of the change that Feature Attribution Drift monitoring detects?

A) An increase in endpoint response latency  
B) A change in the ranking or magnitude of each feature's contribution (SHAP) to predictions  
C) A change in S3 bucket storage capacity  
D) A change in IAM role permissions  

**Answer: B**  
Explanation: Feature Attribution Drift monitors how SageMaker Clarify's SHAP attributions in production traffic have changed relative to the baseline. Latency (A) is a CloudWatch performance metric, and storage capacity (C) and IAM (D) are not monitoring targets.

---
