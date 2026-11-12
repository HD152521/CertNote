# Day 1 - SageMaker Model Monitor: Data Quality and Model Quality Drift

Deploying a model is not the end of the work. The world during training and the world during operation are constantly diverging. User behavior changes, sensors are replaced, economic conditions shift, and the distribution of data flowing into the model diverges from the training data. This is called **drift**, and if left unmanaged, model performance quietly deteriorates. SageMaker **Model Monitor** is a service that automatically monitors deployed endpoints to detect this drift.

The MLA-C01 exam covers "the monitoring domain (Domain 4)" where it asks about Model Monitor's four types of monitors and how they work. Today we cover the two most fundamental types: **Data Quality** and **Model Quality** drift. The key concepts are **baseline** and **monitoring schedule**.

## Four Types of Monitoring in Model Monitor

Model Monitor provides four types of monitors. Today we cover the first two; the remaining two (bias and explainability) are covered on Day 2.

| Monitor Type | What It Monitors | Ground Truth Labels Required? |
|------------|----------------|------------------|
| Data Quality | Statistical distribution changes in input features | Not required |
| Model Quality | Prediction accuracy/performance metric degradation | **Required** (ground truth) |
| Bias Drift | Changes in prediction bias across groups | Labels required |
| Feature Attribution Drift | Changes in feature importance distribution | Not required |

> 💡 **Related Theory**: Drift falls into two broad categories. **Data drift (covariate shift)** occurs when the distribution of input features X changes, while **concept drift** occurs when the relationship P(Y\|X) itself between input and output changes. The Data Quality monitor detects X distribution changes (data drift) without labels, while the Model Quality monitor detects actual performance degradation (the result of concept drift) by comparing against ground truth. This distinction is the heart of "which monitor should we use?"

## Data Capture — The Starting Point of Monitoring

All monitoring begins by storing requests and responses flowing into and out of the endpoint in S3. This is called **Data Capture**. Without capturing, there is no data to monitor.

```python
from sagemaker.model_monitor import DataCaptureConfig

data_capture_config = DataCaptureConfig(
    enable_capture=True,
    sampling_percentage=100,            # What percentage of incoming requests to capture
    destination_s3_uri="s3://my-bucket/datacapture/",
)
# Pass this configuration when deploying the endpoint
predictor = model.deploy(
    initial_instance_count=1,
    instance_type="ml.m5.xlarge",
    data_capture_config=data_capture_config,
)
```

`sampling_percentage` allows you to sample a subset of traffic when traffic is high, reducing storage costs.

## Baseline — Creating the Standard of "Normal"

To detect drift, you need a standard of what "normal" means. Model Monitor automatically analyzes training data (or validation data) to generate **baseline statistics** and **constraints**.

- **statistics.json**: Statistical summary of each feature (mean, standard deviation, min/max, distribution, etc.)
- **constraints.json**: Rules each feature must satisfy (e.g., not null, data type, value range)

Internally, it uses **Deequ** (a data quality validation library created by Amazon).

```python
from sagemaker.model_monitor import DefaultModelMonitor
from sagemaker.model_monitor.dataset_format import DatasetFormat

monitor = DefaultModelMonitor(role=role, instance_count=1, instance_type="ml.m5.xlarge")

# Create baseline from training data → outputs statistics.json, constraints.json
monitor.suggest_baseline(
    baseline_dataset="s3://my-bucket/train/train.csv",
    dataset_format=DatasetFormat.csv(header=True),
    output_s3_uri="s3://my-bucket/baseline/",
)
```

> 🔍 **Deeper Dive**: Baseline is not "create once and forget." If you retrain the model or intentionally change data distribution, you should regenerate the baseline. Leaving an old baseline in place can lead to false positives (flagging legitimate changes as drift) or missing real drift against new standards. Remember: a baseline is a snapshot of "the state we currently believe to be normal."

## Monitoring Schedule — Periodic Comparison

Once the baseline is ready, you create a **monitoring schedule**. The schedule defines a period using cron expressions (usually hourly), and during each period, SageMaker spins up a **Processing Job** to compare recently captured data against the baseline.

```python
from sagemaker.model_monitor import CronExpressionGenerator

monitor.create_monitoring_schedule(
    monitor_schedule_name="data-quality-schedule",
    endpoint_input=predictor.endpoint_name,
    output_s3_uri="s3://my-bucket/monitor-results/",
    statistics=monitor.baseline_statistics(),
    constraints=monitor.suggested_constraints(),
    schedule_cron_expression=CronExpressionGenerator.hourly(),  # Runs hourly
    enable_cloudwatch_metrics=True,
)
```

After each run completes, a **violation report** is generated in S3. If violations occur, it records which features broke which rules. Additionally, with `enable_cloudwatch_metrics=True`, you can send results to CloudWatch to set up alarms (Day 3 topic).

## Model Quality Monitor — Ground Truth Required

The Data Quality monitor only needs to look at inputs, but the **Model Quality monitor** needs to know whether the model was right or wrong. That is, it must collect **actual ground truth labels** later and pair them with predictions.

The flow is:
1. The endpoint makes a prediction, and Data Capture stores it.
2. After time passes and the actual result (ground truth) is confirmed, upload it to S3 matched by `inference_id`.
3. The Model Quality monitor merges predictions and ground truth to calculate performance metrics like accuracy, F1, AUC.
4. If the degradation compared to baseline performance exceeds the threshold, it's marked as a violation.

```python
from sagemaker.model_monitor import ModelQualityMonitor

mq_monitor = ModelQualityMonitor(role=role, instance_count=1, instance_type="ml.m5.xlarge")
mq_monitor.suggest_baseline(
    baseline_dataset="s3://my-bucket/validation-with-labels.csv",
    dataset_format=DatasetFormat.csv(header=True),
    problem_type="BinaryClassification",
    inference_attribute="prediction",      # Prediction column
    ground_truth_attribute="label",        # Ground truth column
    output_s3_uri="s3://my-bucket/mq-baseline/",
)
```

> ⚠️ **Pitfall**: When the question says "monitor whether model accuracy actually drops," that's the **Model Quality** monitor, not Data Quality. And the Model Quality monitor absolutely requires ground truth. If the exam asks "how do you detect performance degradation early when you can't collect ground truth labels," remember that Model Quality is impossible, so you resort to **Data Quality drift** (input distribution changes) or Feature Attribution drift as a workaround.

## Summary

The big picture of Model Monitor is ① **Data Capture** to store requests and responses in S3 → ② Generate **baseline** (statistics·constraints) from training data → ③ Use **monitoring schedule** (cron) to periodically spin up Processing Jobs to compare captured data against the baseline → ④ Output **violation reports** and CloudWatch metrics. These are the four steps. The **Data Quality** monitor catches input feature distribution changes without labels, while the **Model Quality** monitor merges ground truth to catch actual performance degradation. The essence of drift is "the training-time world and the operations-time world have diverged," and which monitor to use is decided by "do you have labels, are you looking at X distribution or actual performance?"

Next, we'll see the remaining two monitors: Bias Drift and Feature Attribution Drift, monitored via SageMaker Clarify.

---

## 📝 Practice Questions

**Question 1.** A team wants to monitor whether the distribution of input features arriving at a real-time endpoint differs from the training data. However, in production the actual ground truth labels for predictions cannot be obtained immediately. What is the appropriate type of Model Monitor?

A) Model Quality monitor  
B) Data Quality monitor  
C) Bias Drift monitor  
D) No monitor can be used  

**Answer: B**  
Explanation: The monitor that watches for changes in the distribution of input features (data drift) and does not need ground truth labels is the Data Quality monitor. A is impossible when labels cannot be obtained because it requires ground truth, C also requires per-group ground truth, and D is wrong because Data Quality makes it entirely possible.

---

**Question 2.** To detect drift with SageMaker Model Monitor, what must you prepare first?

A) CloudWatch alarm  
B) A baseline (statistics and constraints) generated from the training/validation data  
C) Lambda function  
D) A/B test deployment  

**Answer: B**  
Explanation: Drift detection starts with creating a baseline, the "standard of normal." `suggest_baseline` produces statistics.json and constraints.json. A is a follow-up step that reports baseline comparison results, and C and D have no direct relation to monitoring.

---

**Question 3.** What fundamentally differs between the Model Quality monitor and the Data Quality monitor?

A) It does not use a cron schedule  
B) It does not need Data Capture  
C) It requires actual ground truth labels to pair with predictions  
D) It stores results in DynamoDB instead of S3  

**Answer: C**  
Explanation: The Model Quality monitor must merge predictions with actual ground truth to compute performance metrics such as accuracy and F1, so ground truth is required. A is wrong because both use a cron schedule, B is wrong because both need Data Capture, and D is wrong because both store results in S3.

---

**Question 4.** If you set the monitoring schedule to hourly, what does SageMaker do at each interval?

A) Restarts the endpoint  
B) Launches a Processing Job that compares recently captured data against the baseline and generates a violation report  
C) Automatically retrains the model  
D) Regenerates a new baseline every time  

**Answer: B**  
Explanation: A monitoring schedule runs a Processing Job at each interval to compare captured data with the baseline and produce a violation report and CloudWatch metrics. A and C are not done automatically by monitoring, and D is wrong because it compares against the existing baseline rather than regenerating one each time.

---

**Question 5.** Which data quality verification tool does Model Monitor use internally to automatically compute baseline statistics and constraints?

A) Deequ  
B) Pandas Profiling  
C) Great Expectations  
D) TensorFlow Data Validation  

**Answer: A**  
Explanation: SageMaker Model Monitor's data quality baseline uses Deequ, a data quality verification library developed by Amazon. B, C, and D are all data validation tools, but none is the tool that Model Monitor uses as a built-in.

---
