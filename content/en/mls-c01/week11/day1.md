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

## 📝 연습 문제

**문제 1.** 운영 중인 SageMaker 엔드포인트의 입력 트래픽에서 특정 수치 피처의 평균과 분산이 학습 시점과 크게 달라졌다. 정답 레이블은 며칠 뒤에야 수집된다. 즉시 이 변화를 탐지하기에 가장 적합한 Model Monitor 유형은?

A) Model Quality 모니터링  
B) Data Quality 모니터링  
C) A/B 테스트 트래픽 분할  
D) Hyperparameter Tuning  

**정답: B**  
해설: 정답 없이 입력 피처의 통계적 분포 변화를 감지하는 것은 Data Quality 모니터링이다. Model Quality(A)는 정답 레이블이 있어야 하고, A/B 테스트(C)는 배포 비교용, 튜닝(D)은 학습 단계 작업이다.

---

**문제 2.** Model Monitor의 데이터 품질 모니터링을 설정하려 한다. 가장 먼저 수행해야 하는 단계는?

A) EventBridge 규칙 생성  
B) 학습/검증 데이터로 베이스라인(통계·제약) 생성  
C) 모델을 재학습  
D) CloudWatch 대시보드 구성  

**정답: B**  
해설: 모니터링은 "정상 기준"인 베이스라인 statistics.json/constraints.json이 있어야 비교가 가능하므로 베이스라인 생성이 선행된다. EventBridge(A)와 CloudWatch(D)는 위반 발생 후 대응 단계, 재학습(C)은 드리프트 탐지 결과다.

---

**문제 3.** 모델을 의도적으로 재학습해 새로운 데이터 분포를 반영했다. 그런데 기존 모니터링이 매 실행마다 드리프트 위반을 발행한다. 가장 적절한 조치는?

A) 모니터링 스케줄을 영구 삭제한다  
B) sampling_percentage를 0으로 낮춘다  
C) 새 학습 데이터로 베이스라인을 다시 생성한다  
D) 엔드포인트 인스턴스 타입을 키운다  

**정답: C**  
해설: 새 분포를 정상으로 받아들였으므로 베이스라인을 재생성해야 정당한 변화를 오탐하지 않는다. 모니터링 삭제(A)는 감시 포기, 샘플링 0(B)은 캡처 중단, 인스턴스 변경(D)은 무관하다.

---

**문제 4.** 데이터 품질 위반이 발생하면 사람 개입 없이 재학습 파이프라인을 자동으로 시작하고 싶다. CloudWatch 경보 발동을 받아 SageMaker Pipeline을 호출하기에 가장 적합한 서비스는?

A) Amazon EventBridge  
B) Amazon Macie  
C) AWS Glue DataBrew  
D) Amazon Comprehend  

**정답: A**  
해설: EventBridge는 CloudWatch 경보 상태 변화 같은 이벤트를 받아 Pipeline/Lambda를 트리거하는 이벤트 라우팅 서비스다. Macie(B)는 데이터 분류/보안, Glue DataBrew(C)는 데이터 준비, Comprehend(D)는 NLP 서비스다.

---

**문제 5.** Feature Attribution Drift 모니터링이 감지하는 변화로 가장 정확한 설명은?

A) 엔드포인트의 응답 지연(latency) 증가  
B) 예측에 대한 각 피처의 기여도(SHAP) 순위/크기 변화  
C) S3 버킷의 저장 용량 변화  
D) IAM 역할 권한 변경  

**정답: B**  
해설: Feature Attribution Drift는 SageMaker Clarify의 SHAP 기여도가 운영 트래픽에서 베이스라인 대비 어떻게 변했는지를 감시한다. 지연(A)은 CloudWatch 성능 지표, 저장 용량(C)·IAM(D)은 모니터 대상이 아니다.

---
