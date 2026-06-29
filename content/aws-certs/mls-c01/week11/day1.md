# Day 1 - 모델 모니터링: SageMaker Model Monitor와 드리프트 대응

모델을 배포했다고 끝이 아니다. 세상은 변하고, 어제 정확하던 모델은 오늘 조용히 틀리기 시작한다. 입력 데이터의 분포가 바뀌고(데이터 드리프트), 예측 대상의 관계가 바뀌면(컨셉 드리프트) 모델은 자기도 모르게 망가진다. 오늘은 SageMaker Model Monitor로 운영 중인 엔드포인트를 감시하고, 드리프트가 감지되면 재학습으로 연결하는 운영 루프를 다룬다.

## 왜 배포 후 모니터링이 필요한가

학습 시점의 데이터 분포와 운영 시점의 트래픽은 시간이 지나며 벌어진다. 이를 그대로 두면 모델 성능이 서서히 저하되지만, 정확도 같은 정답(ground truth)은 한참 뒤에야 도착하거나 아예 오지 않는다. 그래서 **정답 없이도** 감시할 수 있는 입력 분포 변화를 먼저 본다.

```text
드리프트 종류
- Data drift(공변량 시프트): 입력 X의 분포가 변함 (예: 평균 나이 35→48)
- Concept drift: X와 Y의 관계가 변함 (예: 같은 특성이라도 이탈 패턴이 변함)
- Label drift: 타깃 Y의 분포가 변함 (예: 사기 비율 0.5%→3%)
```

> 💡 **관련 이론**: 시험에서 "모델 정확도가 시간이 지나며 떨어진다, 정답 레이블은 즉시 얻을 수 없다, 무엇을 모니터링하는가?"라는 문제가 나오면 답은 거의 항상 입력 데이터의 통계적 변화를 감시하는 **데이터 품질(Data Quality) 모니터링**이다. 정답이 필요한 모델 품질 모니터링과 구분하는 것이 핵심이다.

## SageMaker Model Monitor의 4가지 모니터 유형

Model Monitor는 실시간 엔드포인트에서 들어오는 요청/응답을 **Data Capture**로 S3에 저장한 뒤, 정기 모니터링 작업을 돌려 베이스라인과 비교한다.

| 모니터 | 감시 대상 | 정답 필요? |
|--------|-----------|-----------|
| **Data Quality** | 입력 피처의 통계(결측, 타입, 분포) | 불필요 |
| **Model Quality** | 정확도·F1·RMSE 등 예측 성능 | 필요(라벨 머지) |
| **Bias Drift** | 운영 트래픽의 편향 지표(Clarify) | 일부 필요 |
| **Feature Attribution Drift** | 피처 기여도(SHAP) 변화 | 불필요 |

## 1단계: Data Capture 활성화

엔드포인트에 들어오는 입력과 나가는 예측을 S3로 캡처하도록 설정한다.

```python
from sagemaker.model_monitor import DataCaptureConfig

data_capture_config = DataCaptureConfig(
    enable_capture=True,
    sampling_percentage=100,          # 트래픽의 100% 캡처(샘플링 가능)
    destination_s3_uri="s3://my-bucket/datacapture",
)

predictor = model.deploy(
    initial_instance_count=1,
    instance_type="ml.m5.xlarge",
    data_capture_config=data_capture_config,
)
```

## 2단계: 베이스라인 생성

학습/검증 데이터로 "정상이란 무엇인가"의 기준선을 만든다. Model Monitor는 내부적으로 Deequ(Spark 기반 데이터 품질 라이브러리)로 제약 조건과 통계를 산출한다.

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
# 산출물: statistics.json(통계), constraints.json(제약)
```

## 3단계: 정기 모니터링 스케줄

캡처된 트래픽을 베이스라인과 주기적으로 비교한다(보통 시간 단위 cron).

```python
from sagemaker.model_monitor import CronExpressionGenerator

monitor.create_monitoring_schedule(
    monitor_schedule_name="data-quality-hourly",
    endpoint_input=predictor.endpoint_name,
    statistics=monitor.baseline_statistics(),
    constraints=monitor.suggested_constraints(),
    schedule_cron_expression=CronExpressionGenerator.hourly(),
    enable_cloudwatch_metrics=True,   # CloudWatch로 위반 지표 전송
)
```

각 실행은 위반 사항을 `constraint_violations.json`으로 내보내고, CloudWatch 지표로도 발행한다.

> 💡 **관련 이론**: 베이스라인은 "현재의 정상"을 고정한 스냅샷이다. 모델을 재학습해 새 분포를 의도적으로 받아들였다면 **베이스라인도 다시 만들어야** 한다. 오래된 베이스라인을 두면 정당한 변화까지 드리프트로 오탐(false alarm)한다.

## 4단계: 드리프트 → 재학습 트리거

모니터링 작업이 위반을 발행하면 CloudWatch 경보가 발동하고, EventBridge가 이를 받아 재학습 파이프라인을 자동으로 시작한다.

```text
[Endpoint] → DataCapture(S3)
   ↓
[Monitoring Schedule] → 위반 → CloudWatch Metric/Alarm
   ↓
[EventBridge Rule] → SageMaker Pipeline 실행(재학습)
   ↓
[Model Registry] 새 모델 등록 → 승인 → 재배포
```

EventBridge 규칙은 CloudWatch 경보 상태 변화를 받아 Lambda나 Pipeline을 호출하도록 구성한다.

```json
{
  "source": ["aws.cloudwatch"],
  "detail-type": ["CloudWatch Alarm State Change"],
  "detail": {
    "alarmName": ["data-quality-drift-alarm"],
    "state": { "value": ["ALARM"] }
  }
}
```

## Model Quality 모니터링과 라벨 지연

정확도 기반 Model Quality 모니터는 실제 정답이 있어야 한다. 운영에서는 정답이 나중에 도착하므로, 예측 결과와 나중에 수집한 라벨을 S3에서 머지해 `ModelQualityMonitor`가 비교하게 한다. 라벨이 즉시 없으면 우선 Data Quality로 대리 감시하는 것이 현실적이다.

## 정리하며

배포된 모델은 시간이 지나며 드리프트로 조용히 저하된다. Model Monitor는 Data Capture로 트래픽을 모으고, 베이스라인과 비교해 데이터/모델/편향/기여도 드리프트를 감시한다. 정답이 늦는 운영 환경에서는 데이터 품질 모니터링이 1차 방어선이며, 위반은 CloudWatch→EventBridge→Pipeline으로 이어져 재학습을 자동화한다.

내일은 이 재학습 자동화를 본격적으로 구성하는 SageMaker Pipelines와 Model Registry, CI/CD를 다룬다.

---

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
