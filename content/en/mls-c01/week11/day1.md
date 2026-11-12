# Day 1 - Model Monitoring: SageMaker Model Monitor and Drift Response

## 📌 Key Takeaways

- The danger comes **months after** deployment, not right after. A model validated at 95% silently collapses to 60% in production because the world changed and the data drifted.
- There are three kinds of drift: **data drift (the distribution of X), concept drift (the X→Y relationship), and label drift (the distribution of Y)**. The only one you can catch today without ground truth is data drift.
- Model Monitor has four types: **Data Quality / Model Quality / Bias Drift / Feature Attribution Drift**. Only Model Quality (and part of Bias) needs ground-truth labels.
- The flow is fixed: **Data Capture → baseline (`statistics.json` and `constraints.json`) → schedule → `constraint_violations.json` → CloudWatch alarm → EventBridge → retraining**.
- If you deliberately retrained and thereby changed the distribution, you must **regenerate the baseline**. If you don't, legitimate change floods you with false positives on every run.

## Why Post-Deployment Monitoring Is Needed

A deployed model depends on the patterns it learned at training time, but the real-world distribution starts moving from the very day you deploy.

| Cause of change | Example | Result |
|---|---|---|
| Change in user behavior | Seasonality, influx of a new segment, a crisis | The distribution of input X shifts |
| Change in data source | Sensor recalibration, upstream ETL fix, unit change | The same column holds values with a different meaning |
| Breakdown of the target relationship | Change in fraud tactics, policy change | Features stay the same but the correct answer differs |
| Schema change | Columns added or removed, type changes, sudden surge in missing values | Inference failures or silent performance degradation |

There is one key constraint. **Ground truth arrives late or never arrives at all.** That is why **monitoring the input distribution without labels** becomes the first line of alarm.

## Comparing the Three Kinds of Drift

| Type | What changes | In formula terms | Labels needed? | Typical signal | Response |
|---|---|---|---|---|---|
| **Data drift** (covariate shift) | Input distribution P(X) | P(X) changes, P(Y\|X) holds | **Not needed** | Average age 35→48, sudden surge in missing rate | Data Quality → retraining |
| **Concept drift** | Input→answer relationship P(Y\|X) | P(X) holds, P(Y\|X) changes | **Needed** (the hardest) | Input statistics look normal but only accuracy drops | Model Quality → retraining or redesign |
| **Label drift** (prior probability shift) | Distribution of answers P(Y) | P(Y) changes | Needed | Fraud ratio 0.5%→3% | Readjust the threshold and class weights |

```text
[Data drift]              [Concept drift]            [Label drift]
 ░░▓▓▓░░ → ░░░▓▓▓        ●●●/○○○ boundary moves      0.5% ▓ → 3% ▓▓▓▓▓▓
 Boundary unchanged,       Input stats look normal    Only the positive ratio
 only the inputs move                                 changes
 → detectable w/o labels   → invisible w/o labels     → readjust the threshold
```

The answer to "Performance is dropping but labels arrive late. What do we watch?" is **label-free input statistics**. Drift in X is only an early-warning indicator of performance degradation and causation is not guaranteed, but it is the only signal you can act on today. Concept drift is the most dangerous, yet it cannot be observed without labels.

## The Four SageMaker Model Monitor Monitors

| Monitor | What it watches | Labels needed | Baseline output | Typical violation |
|---|---|---|---|---|
| **Data Quality** | Input feature statistics (missing values, type, range, distribution) | **Not needed** | `statistics.json`, `constraints.json` | Rising missing rate, type mismatch, distribution distance exceeded |
| **Model Quality** | Prediction quality (Accuracy, F1, AUC, RMSE, etc.) | **Needed** | Performance-metric threshold constraints | Accuracy falls below the threshold |
| **Bias Drift** | Fairness metrics between groups (Clarify) | Partially needed (depends on the metric) | Bias-metric baseline | Gap in prediction rates for a particular group widens |
| **Feature Attribution Drift** | Rank and magnitude of feature contributions (SHAP) | **Not needed** | Attribution baseline | Rank order of the top contributing features is reshuffled |

- Data Quality and Model Quality are handled by `DefaultModelMonitor` and `ModelQualityMonitor`.
- Bias Drift and Feature Attribution Drift are based on **SageMaker Clarify** (`ModelBiasMonitor`, `ModelExplainabilityMonitor`).
- All four monitors run internally as **Processing Jobs**. A separate container starts on every scheduled run, and you are billed for it.

The criterion for choosing among the four is effectively just one: **"Does the question stem have ground-truth labels?"** If there are no labels, choose Data Quality or Feature Attribution Drift; if there are, Model Quality; if the topic is fairness, Bias Drift.

## The Whole Pipeline on One Page

```text
① Training/validation data ─▶ suggest_baseline ─▶ statistics.json + constraints.json
                                                    │ (reference values)
[Client] ─request─▶ [Endpoint] ─response─▶ [Client] │
                        │ ② DataCaptureConfig       │
                        ▼                           │
              s3://.../datacapture/ ────────────────┤
                                                    ▼
                        ③ Schedule (min. 1 hour) ─▶ [Monitoring Execution]
                                                    │
                          ┌─────────────────────────┴──────────────┐
                          ▼                                        ▼
              statistics.json (this window)       constraint_violations.json
                          └────────────┬───────────────────────────┘
                                       ▼ ④ enable_cloudwatch_metrics=True
                              [CloudWatch metrics · alarms]
                                       ▼ ⑤ transition to ALARM
                                [Amazon EventBridge]
                        ┌──────────────┼──────────────┐
                        ▼              ▼              ▼
                   [SNS alert]     [Lambda]   [SageMaker Pipeline retraining]
                                                      ▼
                                        [Model Registry] new version → approval → redeploy
```

## Step 1 — Data Capture

The endpoint has to land real requests and responses in S3 before there is any source data to monitor.

```python
from sagemaker.model_monitor import DataCaptureConfig

data_capture_config = DataCaptureConfig(
    enable_capture=True,
    sampling_percentage=100,          # with heavy traffic, lower it to 20-50%
    destination_s3_uri="s3://my-bucket/datacapture",
    capture_options=["REQUEST", "RESPONSE"],
)

predictor = model.deploy(..., data_capture_config=data_capture_config)
```

| Parameter | Role | Practical judgment |
|---|---|---|
| `enable_capture` | Capture on/off | If off, the monitor has no data to look at in the first place |
| `sampling_percentage` | Capture ratio (%) | 100% raises S3 cost. For high traffic, sample |
| `destination_s3_uri` | Capture storage path | Stored partitioned by endpoint/variant/date/hour |
| `capture_options` | Choose request/response | If you only need input statistics, REQUEST alone is enough |

- Capture files are in **JSON Lines** format, and each record carries metadata such as `eventId`. This ID is the key for joining with ground-truth labels later.
- Capture can also be attached to Batch Transform, so monitoring is possible even without a real-time endpoint.

> ⚠️ **Pitfall**: After you turn capture on, files only accumulate if **traffic actually flows**. A scheduled run over a window with no invocations has nothing to compare and fails. This is the number one cause of "I set up monitoring but no results appear."

## Step 2 — Baseline: statistics.json and constraints.json

The baseline is a snapshot of "what is normal," extracted from the training and validation data.

```python
from sagemaker.model_monitor import DefaultModelMonitor
from sagemaker.model_monitor.dataset_format import DatasetFormat

monitor = DefaultModelMonitor(
    role=role, instance_count=1, instance_type="ml.m5.xlarge",
    volume_size_in_gb=20, max_runtime_in_seconds=3600,
)
monitor.suggest_baseline(
    baseline_dataset="s3://my-bucket/baseline/train.csv",
    dataset_format=DatasetFormat.csv(header=True),
    output_s3_uri="s3://my-bucket/baseline-results",
)
# Outputs: statistics.json, constraints.json
```

| Output | What it contains | How the monitor uses it |
|---|---|---|
| **statistics.json** | Per-feature mean, sum, standard deviation, min, max, missing count, distribution summary | Compares numbers with the production-window statistics |
| **constraints.json** | Per-feature data type, completeness (tolerated missing rate), whether negatives are allowed, distribution-comparison settings | The **rules** that decide whether there is a violation |

- In `monitoring_config` of `constraints.json` you adjust the comparison thresholds and the distribution-comparison method. If the automatically suggested values are too tight, relax them here.
- The baseline is computed from **the very data the model was trained on**. If it is computed from production data, it freezes an already-drifted state as "normal."

## Step 3 — Monitoring Schedule

```python
from sagemaker.model_monitor import CronExpressionGenerator

monitor.create_monitoring_schedule(
    monitor_schedule_name="data-quality-hourly",
    endpoint_input=predictor.endpoint_name,
    statistics=monitor.baseline_statistics(),
    constraints=monitor.suggested_constraints(),
    schedule_cron_expression=CronExpressionGenerator.hourly(),
    enable_cloudwatch_metrics=True,
)
```

| Cadence helper | Meaning | When to use |
|---|---|---|
| `CronExpressionGenerator.hourly()` | Every hour | When fast detection is needed (the **minimum unit**) |
| `CronExpressionGenerator.daily()` | Every day at a set time | Daily batch-style services, cost savings |
| `CronExpressionGenerator.daily_every_x_hours(x)` | Every x hours | A middle compromise |

| Execution status | Meaning | Action |
|---|---|---|
| `Completed` | Succeeded, no violations | None |
| `CompletedWithViolations` | Succeeded, **violations found** | Check the violations file → classify the cause |
| `Failed` | The execution itself failed | Check for missing capture data, permissions, schema mismatch |
| `Stopped` | Halted, e.g., due to timeout | Raise the instance size or `max_runtime` |

Each execution leaves `constraint_violations.json` and the `statistics.json` for that window in S3, and if `enable_cloudwatch_metrics=True` it publishes per-feature metrics to CloudWatch so you can set alarms on them.

## Step 4 — From Violation to Retraining

| Stage | Component | What it does |
|---|---|---|
| Detection | Monitoring Schedule | Judges violations, generates `constraint_violations.json` |
| Quantification | CloudWatch metrics | Publishes per-feature violation and statistics metrics |
| Decision | CloudWatch alarm | Transitions to ALARM when the threshold and evaluation period are exceeded |
| Routing | **EventBridge** | Receives the alarm state-change event and invokes the target |
| Execution | SageMaker Pipeline / Lambda | Retraining, re-evaluation, model registration |
| Control | Model Registry | Registers the new version, then an **approval gate** |
| Notification | SNS | Notifies the person in charge |

```json
{
  "violations": [
    { "feature_name": "age",
      "constraint_check_type": "baseline_drift_check",
      "description": "Baseline drift distance exceeded threshold" },
    { "feature_name": "income",
      "constraint_check_type": "completeness_check",
      "description": "Completeness dropped below required value" }
  ]
}
```

> ⚠️ **Pitfall**: If you launch retraining immediately on every single violation, costs explode and the model gets unstable. Set an **evaluation period (N consecutive violations)** on the CloudWatch alarm to distinguish a momentary blip from persistent drift.

## Model Quality Monitoring and Label Delay

The Model Quality monitor only works when ground truth exists. So a step is needed first to **join the later-arriving labels with the captured data**.

```text
[Captured prediction]  eventId=abc  pred=0.87 ─┐
                                               ├─▶ [Ground Truth Merge] ─▶ [Model Quality]
[Late-arriving truth]  eventId=abc  label=1  ─┘     (joined on eventId)    Accuracy·F1·AUC
```

- When you upload ground-truth labels to the designated S3 path, the monitor pairs them with predictions by `eventId` and computes performance metrics.
- The later the labels arrive, the later Model Quality's **detection delay** becomes. Data Quality fills that gap.

| Label situation | First line of defense | Supplementary measure | What not to do |
|---|---|---|---|
| Arrive within hours | Model Quality (daily schedule) | Run Data Quality alongside | None |
| Delayed by weeks to months | **Data Quality** | Feature Attribution Drift, prediction-distribution monitoring | Leave it unmonitored while waiting for truth |
| Available only as a sample | Sample-based Model Quality | Continuous Data Quality monitoring | Treat sample accuracy as overall performance |
| Never available | Data Quality + Feature Attribution Drift | Business proxy metrics (conversion rate, etc.) | Try to adopt Model Quality |

Even without labels, Feature Attribution Drift looks at how much the rank and magnitude of "the features the model uses as its basis for decisions" have wobbled relative to the baseline. It catches the situation where the input means are unchanged but only the decision structure has changed, a signal that complements Data Quality.

## The Baseline Regeneration Pitfall

```text
[t0] Train on training set A → baseline(A) → deploy · monitor          ✅ normal
[t1] Drift detected → retrain including new data B → redeploy
[t2] Baseline is still A  →  violations flood every run                ❌ false positives
[t2'] Regenerate the baseline from B  →  quiet again                   ✅ correct answer
```

- If retraining **deliberately changed** the distribution, regenerate the baseline from the new training data too.
- Conversely, if you did not retrain and violations appear, updating the baseline with production data launders drift into normal, and the alarm never rings again.
- In other words, **updating the baseline is conditional on "did you retrain?"** An answer option that reverses this causality is wrong.

## Question Stem Clue → Answer Mapping

| Clue in the stem | Answer to pick | Reason |
|---|---|---|
| "Ground-truth labels arrive days later / don't exist" | **Data Quality monitoring** | Judged from input statistics alone, no labels needed |
| "Want to know whether accuracy/F1 dropped, labels available" | **Model Quality monitoring** | A metric that only comes from comparing predictions with truth |
| "Monitor whether the SHAP attribution rank has changed" | **Feature Attribution Drift** | Clarify-based attribution drift monitoring |
| "The prediction gap for a particular group has widened" | **Bias Drift** | Clarify fairness-metric monitoring |
| "What comes first when setting up monitoring?" | **Create a baseline** | Without a reference, judging is impossible |
| "Must keep endpoint inputs and outputs in S3" | **DataCaptureConfig** | The step that creates the data to monitor |
| "On violation, start retraining without human intervention" | **EventBridge → SageMaker Pipeline** | Receives the alarm event and invokes the workflow |
| "Violations occur every time after retraining" | **Regenerate the baseline** | Redefine the new distribution as normal |
| "S3 capture cost/latency is a burden" | Lower `sampling_percentage` | Capture a sample instead of everything |
| "Delete the monitoring schedule / turn off capture" | **Wrong option** | It removes the monitoring rather than addressing the symptom |

## Operations Checklist

- [ ] Is capture on, and are files actually accumulating in S3?
- [ ] Was the baseline generated from **the data the model was trained on**?
- [ ] Does the alarm have an **evaluation period** configured to filter out momentary blips?
- [ ] Do the violation → EventBridge → retraining path and baseline regeneration belong to the pipeline?

In the next note we cover **MLOps**, which runs this retraining without human hands: SageMaker Pipelines, Model Registry, and CI/CD.

## 📖 Glossary

- **Drift**: The phenomenon where the distribution of data or answers after deployment differs from that at training time. It is the main culprit behind silent collapse of model performance.
- **Data drift (covariate shift)**: A state where only the distribution of input X has moved. It can be detected without ground truth, so it is the first line of alarm.
- **Concept drift**: A state where the inputs are unchanged but the relationship between inputs and answers has changed. It cannot be seen without labels, so it is the trickiest.
- **Label drift (prior probability shift)**: A state where the proportion of the answer Y has changed. An example is the fraud ratio jumping from 0.5% to 3%.
- **Data Capture**: A feature where the endpoint automatically saves real requests and responses to S3. It produces the raw material for monitoring.
- **Baseline**: A "normal" snapshot extracted from the training and validation data. It comes out as a pair of `statistics.json` and `constraints.json`.
- **constraint_violations.json**: The violation-list file produced by each scheduled run. It records which feature broke which rule.
- **Ground Truth Merge**: The step that pairs late-arriving ground truth with captured predictions by `eventId` so performance metrics can be computed.
- **Feature Attribution Drift**: A Clarify-based monitor that watches how much the rank and magnitude of SHAP attributions have changed relative to the baseline.
- **EventBridge**: An event-routing service that receives events such as CloudWatch alarms and invokes targets like Lambda or Pipelines.

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
