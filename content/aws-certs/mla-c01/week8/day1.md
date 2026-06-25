# Day 1 - SageMaker Model Monitor: 데이터 품질·모델 품질 드리프트

모델을 배포했다고 일이 끝나는 것이 아니다. 학습 당시의 세상과 운영 중인 세상은 끊임없이 달라진다. 사용자 행동이 바뀌고, 센서가 교체되고, 경제 환경이 변하면 모델에 들어오는 데이터의 분포가 학습 데이터와 어긋난다. 이것을 **드리프트(drift)**라 하고, 방치하면 모델 성능이 조용히 무너진다. SageMaker **Model Monitor**는 운영 중인 엔드포인트를 자동으로 감시해 이 드리프트를 잡아내는 서비스다.

MLA-C01 시험은 "모니터링 도메인(Domain 4)"에서 Model Monitor의 4가지 모니터 종류와 동작 흐름을 묻는다. 오늘은 그중 가장 기본인 **데이터 품질(Data Quality)**과 **모델 품질(Model Quality)** 드리프트를 다룬다. 핵심 개념은 **베이스라인(baseline)**과 **모니터링 스케줄(monitoring schedule)** 두 가지다.

## Model Monitor가 감시하는 4가지

Model Monitor는 4종류의 모니터를 제공한다. 오늘은 앞의 둘, 나머지 둘(편향·설명가능성)은 Day 2에서 다룬다.

| 모니터 종류 | 무엇을 감시하나 | 정답 레이블 필요? |
|------------|----------------|------------------|
| 데이터 품질(Data Quality) | 입력 피처의 통계 분포 변화 | 불필요 |
| 모델 품질(Model Quality) | 예측 정확도/성능 지표 저하 | **필요**(ground truth) |
| 편향 드리프트(Bias Drift) | 그룹 간 예측 편향 변화 | 라벨 필요 |
| 피처 기여도 드리프트(Feature Attribution) | 피처 중요도 분포 변화 | 불필요 |

> 💡 **관련 이론**: 드리프트는 크게 두 종류로 나뉜다. **데이터 드리프트(data drift, covariate shift)**는 입력 피처 X의 분포가 바뀌는 것이고, **개념 드리프트(concept drift)**는 입력과 출력의 관계 P(Y|X) 자체가 바뀌는 것이다. 데이터 품질 모니터는 X의 분포 변화(데이터 드리프트)를 라벨 없이 잡고, 모델 품질 모니터는 실제 성능 저하(개념 드리프트의 결과)를 ground truth와 비교해 잡는다. 이 구분이 "어떤 모니터를 써야 하는가" 문제의 핵심이다.

## 데이터 캡처 — 모니터링의 출발점

모든 모니터링은 엔드포인트로 들어오고 나가는 요청·응답을 S3에 저장하는 것에서 시작한다. 이를 **Data Capture**라 한다. 캡처를 켜지 않으면 감시할 데이터가 없다.

```python
from sagemaker.model_monitor import DataCaptureConfig

data_capture_config = DataCaptureConfig(
    enable_capture=True,
    sampling_percentage=100,            # 들어오는 요청의 몇 %를 캡처할지
    destination_s3_uri="s3://my-bucket/datacapture/",
)
# 엔드포인트 배포 시 이 설정을 함께 전달한다
predictor = model.deploy(
    initial_instance_count=1,
    instance_type="ml.m5.xlarge",
    data_capture_config=data_capture_config,
)
```

`sampling_percentage`로 트래픽이 많을 때 일부만 샘플링해 저장 비용을 줄일 수 있다.

## 베이스라인 — "정상"의 기준 만들기

드리프트를 감지하려면 "정상이란 무엇인가"의 기준이 있어야 한다. Model Monitor는 학습 데이터(또는 검증 데이터)를 분석해 **베이스라인 통계(statistics)**와 **제약(constraints)**을 자동 생성한다.

- **statistics.json**: 각 피처의 평균, 표준편차, 최소/최대, 분포 등 통계 요약
- **constraints.json**: 각 피처가 만족해야 할 규칙(예: not null, 데이터 타입, 값 범위)

내부적으로는 **Deequ**(아마존이 만든 데이터 품질 검증 라이브러리)를 사용한다.

```python
from sagemaker.model_monitor import DefaultModelMonitor
from sagemaker.model_monitor.dataset_format import DatasetFormat

monitor = DefaultModelMonitor(role=role, instance_count=1, instance_type="ml.m5.xlarge")

# 학습 데이터로 베이스라인 생성 → statistics.json, constraints.json 산출
monitor.suggest_baseline(
    baseline_dataset="s3://my-bucket/train/train.csv",
    dataset_format=DatasetFormat.csv(header=True),
    output_s3_uri="s3://my-bucket/baseline/",
)
```

> 🔍 **더 깊이**: 베이스라인은 "한 번 만들고 끝"이 아니다. 모델을 재학습하거나 의도적으로 데이터 분포를 바꿨다면 베이스라인도 다시 생성해야 한다. 오래된 베이스라인을 그대로 두면, 정당한 변화까지 드리프트로 오탐(false positive)하거나 반대로 새 기준에 맞춰 진짜 드리프트를 놓친다. 베이스라인은 "현재 정상이라고 믿는 상태"의 스냅샷임을 기억하자.

## 모니터링 스케줄 — 정기적으로 비교하기

베이스라인이 준비되면 **모니터링 스케줄**을 만든다. 스케줄은 cron 표현식으로 주기(보통 매시간)를 정하고, 그 주기마다 SageMaker가 **Processing Job**을 띄워 최근 캡처된 데이터를 베이스라인과 비교한다.

```python
from sagemaker.model_monitor import CronExpressionGenerator

monitor.create_monitoring_schedule(
    monitor_schedule_name="data-quality-schedule",
    endpoint_input=predictor.endpoint_name,
    output_s3_uri="s3://my-bucket/monitor-results/",
    statistics=monitor.baseline_statistics(),
    constraints=monitor.suggested_constraints(),
    schedule_cron_expression=CronExpressionGenerator.hourly(),  # 매시간 실행
    enable_cloudwatch_metrics=True,
)
```

각 실행이 끝나면 **violation report(제약 위반 보고서)**가 S3에 생성된다. 위반이 있으면 어떤 피처가 어떤 규칙을 어겼는지 기록된다. 또 `enable_cloudwatch_metrics=True`로 결과 지표를 CloudWatch로 보내 알람을 걸 수 있다(Day 3 주제).

## 모델 품질 모니터 — ground truth가 필요하다

데이터 품질 모니터는 입력만 보면 되지만, **모델 품질 모니터**는 모델이 맞췄는지 틀렸는지를 알아야 한다. 즉 **실제 정답(ground truth label)**을 나중에 수집해 예측과 짝지어야 한다.

흐름은 이렇다.
1. 엔드포인트가 예측을 내고 Data Capture가 저장한다.
2. 시간이 지나 실제 결과(정답)가 확정되면, 이를 S3에 `inference_id`로 매칭되게 업로드한다.
3. 모델 품질 모니터가 예측과 정답을 병합(merge)해 정확도, F1, AUC 등 성능 지표를 계산한다.
4. 베이스라인 성능 대비 저하가 임계치를 넘으면 위반으로 표시한다.

```python
from sagemaker.model_monitor import ModelQualityMonitor

mq_monitor = ModelQualityMonitor(role=role, instance_count=1, instance_type="ml.m5.xlarge")
mq_monitor.suggest_baseline(
    baseline_dataset="s3://my-bucket/validation-with-labels.csv",
    dataset_format=DatasetFormat.csv(header=True),
    problem_type="BinaryClassification",
    inference_attribute="prediction",      # 예측값 컬럼
    ground_truth_attribute="label",        # 정답 컬럼
    output_s3_uri="s3://my-bucket/mq-baseline/",
)
```

> ⚠️ **함정**: "모델 정확도가 실제로 떨어지는지 감시"라고 하면 데이터 품질이 아니라 **모델 품질** 모니터다. 그리고 모델 품질 모니터는 반드시 ground truth가 필요하다. 시험에서 "정답 레이블을 수집할 수 없는 상황에서 성능 저하를 미리 감지하려면?"이라고 물으면, 모델 품질은 불가능하므로 **데이터 품질 드리프트**(입력 분포 변화)나 피처 기여도 드리프트로 우회한다는 점을 기억하자.

## 정리하며

Model Monitor의 큰 그림은 ① **Data Capture**로 요청·응답을 S3에 저장 → ② 학습 데이터로 **베이스라인**(statistics·constraints) 생성 → ③ **모니터링 스케줄**(cron)로 주기적으로 Processing Job을 띄워 캡처 데이터를 베이스라인과 비교 → ④ **위반 보고서**와 CloudWatch 지표 산출, 이 4단계다. **데이터 품질** 모니터는 입력 피처의 분포 변화를 라벨 없이 잡고, **모델 품질** 모니터는 ground truth를 병합해 실제 성능 저하를 잡는다. 드리프트의 본질은 "학습 시점의 세상과 운영 시점의 세상이 달라진다"는 것이며, 어떤 모니터를 쓸지는 "라벨이 있는가, X 분포를 보는가 성능을 보는가"로 결정된다.

다음 글에서는 나머지 두 모니터인 편향 드리프트와 피처 기여도 드리프트를 SageMaker Clarify로 감시하는 법을 본다.

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
