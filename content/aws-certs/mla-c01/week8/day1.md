# Day 1 - SageMaker Model Monitor: 데이터 품질·모델 품질 드리프트

## 📌 핵심 정리

- **드리프트**는 학습 당시의 세상과 운영 중인 세상이 어긋나는 현상. 방치하면 모델 성능이 조용히 무너진다.
- Model Monitor는 **데이터 품질 · 모델 품질 · 편향 드리프트 · 피처 기여도 드리프트** 4종을 제공한다(뒤 둘은 Day 2).
- 모든 모니터링은 **Data Capture**로 요청·응답을 S3에 저장하는 것에서 출발한다. 캡처를 안 켜면 볼 데이터가 없다.
- **베이스라인**(`statistics.json` + `constraints.json`, 내부적으로 Deequ)이 "정상"의 기준. **cron 스케줄**이 주기마다 Processing Job을 띄워 비교한다.
- **데이터 품질**은 입력 X의 분포를 라벨 없이 보고, **모델 품질**은 ground truth를 병합해 실제 성능 저하를 본다.

## 모니터링 파이프라인 한 장

Model Monitor의 전 과정은 아래 흐름 하나로 요약된다. 시험 문제 대부분이 이 그림의 어느 칸을 묻는 것이다.

```text
   [클라이언트]
        │ invoke_endpoint
        ▼
 ┌──────────────────┐
 │  실시간 엔드포인트  │──▶ ① Data Capture (요청/응답 JSON Lines)
 └──────────────────┘             │
        ▲                          ▼
        │                 s3://.../datacapture/
        │                          │
        │                          ▼
        │              ┌───────────────────────────┐
        │   ② 베이스라인 │  Processing Job (cron 주기) │ ◀── statistics.json
        │   (학습 데이터)│   캡처 데이터 vs 베이스라인   │ ◀── constraints.json
        │              └───────────────────────────┘
        │                          │
        │              ③ constraint_violations.json (위반 리포트)
        │                          │
        │                          ▼
        │                 ④ CloudWatch 지표 · 알람
        │                          │
        └──── ⑥ 재배포 ◀── ⑤ 재학습 트리거(EventBridge/Lambda→Pipelines)
```

| 단계 | 산출물 | 놓치기 쉬운 점 |
|------|--------|----------------|
| ① Data Capture | S3의 JSON Lines(입력·출력) | 엔드포인트 배포 시점에 켜야 한다. 안 켜면 이후 단계가 전부 공회전 |
| ② 베이스라인 | `statistics.json`, `constraints.json` | 재학습하면 베이스라인도 다시 만들어야 한다 |
| ③ 비교 실행 | `constraint_violations.json` | 실행 주체는 엔드포인트가 아니라 별도 **Processing Job** |
| ④ 지표·알람 | CloudWatch 지표 | `enable_cloudwatch_metrics=True`를 꺼두면 알람을 걸 수 없다 |
| ⑤ 트리거 | Pipeline 실행 | 위반 감지 자체는 재학습을 하지 않는다. 연결을 따로 만들어야 한다 |

## Model Monitor 4종 비교

Model Monitor는 4종류의 모니터를 제공한다. 오늘은 앞의 둘, 나머지 둘(편향·설명가능성)은 Day 2에서 다룬다.

| 모니터 종류 | 무엇을 감시하나 | 정답 레이블 필요? | 베이스라인 산출물 |
|------------|----------------|------------------|------------------|
| 데이터 품질(Data Quality) | 입력 피처의 통계 분포 변화 | 불필요 | 피처별 통계 + 제약(Deequ) |
| 모델 품질(Model Quality) | 예측 정확도/성능 지표 저하 | **필요**(ground truth) | 검증셋 기준 성능 지표 |
| 편향 드리프트(Bias Drift) | 그룹 간 예측 편향 변화 | 라벨 필요 | Clarify 편향 지표 기준값 |
| 피처 기여도 드리프트(Feature Attribution) | 피처 중요도 분포 변화 | 불필요 | SHAP 기준 중요도 |

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

- `sampling_percentage`로 트래픽이 많을 때 일부만 샘플링해 저장 비용을 줄일 수 있다.
- 캡처 파일은 시간 단위 경로(엔드포인트/배리언트/연/월/일/시)로 나뉘어 쌓인다. 스케줄 실행은 자기 주기에 해당하는 구간만 읽는다.
- 저장 형식은 **JSON Lines** — 한 줄이 한 건의 요청·응답이며 입력(endpointInput)과 출력(endpointOutput)이 함께 들어간다.

기존에 이미 떠 있는 엔드포인트라면 재배포 없이 설정만 갱신할 수도 있다.

```python
import boto3
sm = boto3.client("sagemaker")

# 이미 운영 중인 엔드포인트에 캡처를 켜는 경로(엔드포인트 구성 변경 → 업데이트)
sm.create_endpoint_config(
    EndpointConfigName="my-endpoint-config-v2",
    ProductionVariants=[...],
    DataCaptureConfig={
        "EnableCapture": True,
        "InitialSamplingPercentage": 100,
        "DestinationS3Uri": "s3://my-bucket/datacapture/",
        "CaptureOptions": [{"CaptureMode": "Input"}, {"CaptureMode": "Output"}],
    },
)
sm.update_endpoint(EndpointName="my-endpoint",
                   EndpointConfigName="my-endpoint-config-v2")
```

> ⚠️ **함정**: "모니터링을 켰는데 실행 결과가 계속 비어 있다"는 시나리오의 1순위 원인은 **Data Capture 미설정 또는 샘플링 비율이 너무 낮음**이다. 2순위는 해당 주기에 트래픽이 아예 없었던 경우다. 베이스라인이나 스케줄을 의심하기 전에 캡처 S3 경로에 파일이 쌓이는지부터 확인한다.

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

실행 이력과 위반 여부는 SDK/boto3로 직접 확인한다.

```python
# 최근 스케줄 실행 목록 — 상태가 CompletedWithViolations면 위반이 있었다는 뜻
execs = monitor.list_executions()
last = execs[-1].describe()
print(last["ProcessingJobStatus"])
print(last["ProcessingOutputConfig"])   # 위반 리포트가 떨어진 S3 경로
```

캡처 데이터에 나타나는 대표적인 위반 유형은 다음과 같다. 어떤 이름이 나오느냐가 곧 원인 힌트다.

| 위반 유형 | 뜻 | 흔한 실제 원인 |
|-----------|-----|----------------|
| `data_type_check` | 기대한 타입과 다른 값이 들어옴 | 숫자 컬럼에 문자열·빈 문자열 유입 |
| `completeness_check` | 결측 비율이 기준을 넘음 | 업스트림 조인 실패, 선택 입력 필드 |
| `baseline_drift_check` | 분포가 베이스라인에서 멀어짐 | 진짜 데이터 드리프트, 계절성 |
| `missing_column_check` / `extra_column_check` | 컬럼이 빠지거나 늘어남 | 전처리 코드 변경, 스키마 변경 |
| `categorical_values_check` | 학습 때 없던 범주값 등장 | 신규 상품코드·지역코드 추가 |

> 💡 **개념**: 위반이 떴다고 곧바로 재학습이 답은 아니다. `missing_column_check`나 `data_type_check`는 **데이터 파이프라인 버그**일 가능성이 크고, 이건 모델을 다시 학습해도 해결되지 않는다. 반대로 `baseline_drift_check`가 여러 피처에서 지속적으로 뜨면 그때가 재학습을 검토할 시점이다. "스키마 문제인가, 분포 문제인가"를 먼저 갈라라.

## 모델 품질 모니터 — ground truth가 필요하다

데이터 품질 모니터는 입력만 보면 되지만, **모델 품질 모니터**는 모델이 맞췄는지 틀렸는지를 알아야 한다. 즉 **실제 정답(ground truth label)**을 나중에 수집해 예측과 짝지어야 한다.

흐름은 이렇다.
1. 엔드포인트가 예측을 내고 Data Capture가 저장한다.
2. 시간이 지나 실제 결과(정답)가 확정되면, 이를 S3에 `inference_id`로 매칭되게 업로드한다.
3. 모델 품질 모니터가 예측과 정답을 병합(merge)해 정확도, F1, AUC 등 성능 지표를 계산한다.
4. 베이스라인 성능 대비 저하가 임계치를 넘으면 위반으로 표시한다.

```text
  예측 시점                       며칠~몇 주 뒤
 ┌──────────┐                  ┌──────────────┐
 │ 캡처 데이터 │  inference_id   │  ground truth │
 │ (예측값)   │ ◀────매칭────▶  │  (실제 정답)   │
 └──────────┘                  └──────────────┘
        └──────────┬───────────────────┘
                   ▼
        Merge Job → 성능 지표 계산(정확도·F1·AUC)
                   ▼
        베이스라인 성능과 비교 → 위반 여부
```

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

`problem_type`은 문제 유형에 맞춰 고른다 — `BinaryClassification`, `MulticlassClassification`, `Regression`. 유형에 따라 계산되는 지표 집합이 달라진다(분류는 정확도·F1·AUC 계열, 회귀는 오차 계열).

| 구분 | 데이터 품질 모니터 | 모델 품질 모니터 |
|------|-------------------|-----------------|
| 보는 것 | 입력 X의 분포·스키마 | 예측이 실제로 맞았는가 |
| ground truth | 불필요 | **필수** |
| 감지 시점 | 즉시(다음 주기) | 정답이 모일 때까지 지연 |
| 잡는 것 | 데이터 드리프트, 파이프라인 사고 | 개념 드리프트의 결과(성능 저하) |
| 한계 | 분포가 변해도 성능은 멀쩡할 수 있음 | 이미 손해가 난 뒤에야 안다 |

> ⚠️ **함정**: "모델 정확도가 실제로 떨어지는지 감시"라고 하면 데이터 품질이 아니라 **모델 품질** 모니터다. 그리고 모델 품질 모니터는 반드시 ground truth가 필요하다. 시험에서 "정답 레이블을 수집할 수 없는 상황에서 성능 저하를 미리 감지하려면?"이라고 물으면, 모델 품질은 불가능하므로 **데이터 품질 드리프트**(입력 분포 변화)나 피처 기여도 드리프트로 우회한다는 점을 기억하자.

## 모니터링이 꼬일 때: 증상 → 원인 → 조치

| 증상 | 흔한 원인 | 조치 |
|------|-----------|------|
| 스케줄은 도는데 결과가 계속 비어 있다 | Data Capture 미설정, 샘플링 비율 과소, 해당 주기 트래픽 0 | 캡처 S3 경로 확인 → `enable_capture` / `sampling_percentage` 상향 |
| 모델 품질 모니터가 지표를 못 낸다 | ground truth 미수집 또는 `inference_id` 불일치로 병합 실패 | 정답 업로드 경로·ID 매칭 규칙 점검. 정답이 아예 없으면 데이터 품질/피처 기여도로 대체 |
| 배포 직후부터 위반이 쏟아진다 | 전처리 불일치 — 학습은 스케일링 후, 추론은 원본 그대로 | 학습·추론 전처리 코드를 일원화(파이프라인 모델·동일 스크립트) |
| 아무 것도 안 바뀌었는데 드리프트 경보 | 베이스라인이 낡음(재학습 후 갱신 누락), 계절성 | 베이스라인 재생성, 임계치·평가 주기 재조정 |
| 드리프트 경보인데 모델 품질은 정상 | 성능에 영향 없는 피처가 변함 | 즉시 재학습 말고 관찰. 중요 피처 위주로 임계치 차등 적용 |
| 위반 지표로 알람을 못 건다 | `enable_cloudwatch_metrics`가 꺼져 있음 | 스케줄을 지표 게시 옵션과 함께 재생성 |
| 모니터링 비용이 예상보다 크다 | 매시간 Processing Job + 100% 캡처 | 주기를 늘리고 `sampling_percentage`를 낮춘다 |

다음 글에서는 나머지 두 모니터인 편향 드리프트와 피처 기여도 드리프트를 SageMaker Clarify로 감시하는 법을 본다.

## 📖 용어

- **드리프트(drift)** : 학습 당시의 데이터·관계와 운영 중 데이터·관계가 어긋나는 현상. 성능이 서서히 무너지는 원인.
- **데이터 드리프트 / 개념 드리프트** : 입력 X의 분포가 바뀌는 것 / 입력과 정답의 관계 P(Y|X) 자체가 바뀌는 것.
- **Data Capture** : 엔드포인트의 요청·응답을 S3에 JSON Lines로 저장하는 기능. 모든 모니터링의 원재료.
- **베이스라인(baseline)** : "정상"의 기준 스냅샷. `statistics.json`(통계)과 `constraints.json`(규칙) 두 파일로 나온다.
- **Deequ** : 아마존이 만든 데이터 품질 검증 라이브러리. Model Monitor의 데이터 품질 베이스라인을 계산하는 엔진.
- **모니터링 스케줄** : cron 주기마다 Processing Job을 띄워 캡처 데이터와 베이스라인을 비교하도록 걸어두는 예약.
- **Processing Job** : 비교·분석을 실제로 수행하는 별도 컴퓨팅 작업. 엔드포인트가 직접 계산하지 않는다.
- **위반 리포트(constraint violations)** : 어떤 피처가 어떤 규칙을 어겼는지 기록한 결과 파일. 위반 유형 이름이 곧 원인 힌트다.
- **ground truth** : 예측이 맞았는지 판정할 실제 정답. 모델 품질 모니터에만 필요하며 보통 뒤늦게 확정된다.
- **inference_id** : 예측 한 건과 나중에 도착한 정답을 짝지어 주는 식별자. 이게 어긋나면 병합이 실패한다.

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
