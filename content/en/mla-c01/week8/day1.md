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

## 📝 연습 문제

**문제 1.** 한 팀이 실시간 엔드포인트로 들어오는 입력 피처의 분포가 학습 데이터와 달라지는지 감시하고 싶다. 단, 운영 환경에서는 예측에 대한 실제 정답 레이블을 즉시 얻을 수 없다. 적절한 Model Monitor 종류는?

A) 모델 품질(Model Quality) 모니터  
B) 데이터 품질(Data Quality) 모니터  
C) 편향 드리프트(Bias Drift) 모니터  
D) 어떤 모니터도 사용할 수 없다  

**정답: B**  
해설: 입력 피처의 분포 변화(데이터 드리프트)를 감시하며 정답 레이블이 필요 없는 것은 데이터 품질 모니터다. A는 ground truth가 반드시 필요해 레이블을 얻을 수 없는 상황에서 불가능하고, C도 그룹별 정답이 필요하며, D는 데이터 품질로 충분히 가능하므로 틀리다.

---

**문제 2.** SageMaker Model Monitor에서 드리프트를 감지하려면 가장 먼저 무엇을 준비해야 하는가?

A) CloudWatch 알람  
B) 학습/검증 데이터로 생성한 베이스라인(statistics·constraints)  
C) Lambda 함수  
D) A/B 테스트 배포  

**정답: B**  
해설: 드리프트 감지는 "정상의 기준"인 베이스라인을 만드는 것에서 출발한다. `suggest_baseline`이 statistics.json과 constraints.json을 산출한다. A는 베이스라인 비교 결과를 알리는 후속 단계이고, C·D는 모니터링과 직접 관련이 없다.

---

**문제 3.** 모델 품질(Model Quality) 모니터가 데이터 품질 모니터와 근본적으로 다른 점은?

A) cron 스케줄을 사용하지 않는다  
B) Data Capture가 필요 없다  
C) 예측과 짝지을 실제 정답(ground truth) 레이블이 필요하다  
D) S3 대신 DynamoDB에 결과를 저장한다  

**정답: C**  
해설: 모델 품질 모니터는 정확도·F1 같은 성능 지표를 계산하려고 예측값과 실제 정답을 병합해야 하므로 ground truth가 필수다. A는 둘 다 cron 스케줄을 쓰고, B는 둘 다 Data Capture가 필요하며, D는 둘 다 결과를 S3에 저장하므로 틀리다.

---

**문제 4.** 모니터링 스케줄을 매시간으로 설정하면 SageMaker는 각 주기마다 무엇을 수행하는가?

A) 엔드포인트를 재시작한다  
B) Processing Job을 띄워 최근 캡처된 데이터를 베이스라인과 비교하고 위반 보고서를 생성한다  
C) 모델을 자동으로 재학습한다  
D) 새 베이스라인을 매번 다시 생성한다  

**정답: B**  
해설: 모니터링 스케줄은 주기마다 Processing Job을 실행해 캡처 데이터와 베이스라인을 비교하고 violation report와 CloudWatch 지표를 산출한다. A·C는 모니터링이 자동으로 하지 않으며, D는 베이스라인을 매번 다시 만들지 않고 기존 기준과 비교한다.

---

**문제 5.** Model Monitor가 베이스라인 통계와 제약을 자동 계산하는 데 내부적으로 사용하는 데이터 품질 검증 도구는?

A) Deequ  
B) Pandas Profiling  
C) Great Expectations  
D) TensorFlow Data Validation  

**정답: A**  
해설: SageMaker Model Monitor의 데이터 품질 베이스라인은 아마존이 개발한 데이터 품질 검증 라이브러리 Deequ를 사용한다. B·C·D는 모두 데이터 검증 도구이긴 하지만 Model Monitor가 내장으로 사용하는 도구는 아니다.

---
