# Day 1 - SageMaker Pipelines: 단계, DAG, 파라미터, 조건 단계

## 📌 핵심 정리

- **SageMaker Pipelines**는 ML 워크플로를 코드로 정의된 **DAG**로 묶어 반복 실행하는 SageMaker 네이티브 오케스트레이터다.
- 작업 유형별로 **단계(Step) 타입**이 정해져 있다 — Processing·Training·Tuning·Model·RegisterModel·Transform·Condition·Lambda·Callback·Fail.
- 한 단계의 `properties`를 다음 단계 입력으로 **참조하면 의존성이 자동으로 DAG 엣지**가 된다. 참조가 없으면 병렬로 돈다.
- **파라미터**로 실행 시점에 값을 주입해 같은 정의를 dev/staging/prod에 재사용한다.
- **ConditionStep**은 평가 지표를 임계값과 비교하는 **품질 게이트** — 기준 미달 모델의 자동 등록을 막는다.

## SageMaker Pipelines란 무엇인가

지난 주가 "모델을 어떻게 배포하느냐"였다면, 이번 주는 "그 배포를 어떻게 자동화하고 반복 가능하게 만드느냐" — 즉 MLOps다.

- ML 워크플로를 위한 **CI/CD 오케스트레이션 서비스**. 각 작업을 "단계(step)"로 정의한다.
- 단계 간 데이터 의존성을 연결하면 SageMaker가 실행 순서를 가진 **DAG(Directed Acyclic Graph)**를 자동 구성한다.
- 한 단계의 출력(예: 전처리된 데이터 S3 경로)이 다음 단계 입력으로 전달되고, 의존성이 없는 단계는 **병렬 실행**된다.
- 노트북 셀을 사람이 매번 손으로 실행하는 방식은 재현성이 없고 실수를 부른다 — 그 자리를 대체하는 것이 목적이다.

| 특징 | 내용 |
|------|------|
| **재현성(reproducibility)** | 워크플로 정의가 코드와 JSON으로 남아 동일 절차를 반복 실행 |
| **계보 추적(lineage tracking)** | 어떤 데이터·코드·파라미터로 어떤 모델이 나왔는지 자동 기록 |
| **Studio 통합** | DAG를 시각적으로 보고 실행(execution)별 단계 상태를 추적 |
| **파이썬 SDK 기반** | 별도 DSL 없이 SageMaker Python SDK로 정의 |
| **Registry 연동** | `RegisterModel` 단계로 Model Registry에 바로 버전 등록 |

> 💡 **관련 이론**: Pipelines가 만드는 것은 DAG다. DAG는 "방향이 있고(실행 순서) 순환이 없는(무한 루프 방지)" 그래프로, 데이터 의존성을 노드/엣지로 표현하는 워크플로 오케스트레이션의 표준 모델이다. Airflow, Step Functions도 같은 DAG 모델을 쓴다. 시험에서 "SageMaker 내부에서 학습→평가→배포를 자동화"라면 Pipelines, "여러 AWS 서비스를 폭넓게 오케스트레이션"이면 Step Functions로 갈린다는 점을 기억하라.

## 전형적인 파이프라인 DAG

가장 자주 나오는 형태는 전처리 → 학습 → 평가 → 조건 → 등록이다.

```text
ParameterString(InputData)          ParameterFloat(AccuracyThreshold)
       │                                            │
       ▼                                            │
ProcessingStep "PreprocessData"   (전처리)           │
       │ properties → S3Output.S3Uri                │
       ▼                                            │
TrainingStep   "TrainModel"       (학습)             │
       │ ModelArtifacts.S3ModelArtifacts            │
       ▼                                            │
ProcessingStep "EvaluateModel"    (평가)             │
       │ PropertyFile → evaluation.json             │
       └──────────────┬─────────────────────────────┘
                      ▼
              ConditionStep "CheckAccuracy"
                      │
        if_steps ─────┴───── else_steps
            │                    │
            ▼                    ▼
      RegisterModel          FailStep
    → Model Registry        (또는 비워 둠)
```

- 왼쪽 위 파라미터들은 **실행 시점에 주입**되어 DAG 전체에 흘러든다.
- 화살표는 전부 "출력 참조"에서 자동으로 생겼다. 사람이 순서를 적어 넣지 않았다.
- 조건이 거짓이면 `if_steps` 가지는 통째로 건너뛴다 — 형편없는 모델은 Registry에 닿지 못한다.

## 파이프라인 단계(Step)의 종류

Pipelines는 작업 유형별로 미리 정의된 단계 타입을 제공한다. 자주 출제되는 것들:

| 단계 타입 | 역할 | 전형적 쓰임 |
|----------|------|-------------|
| **ProcessingStep** | SageMaker Processing 작업 실행 | 전처리·피처 엔지니어링·모델 평가 |
| **TrainingStep** | Estimator 기반 모델 학습 | 본 학습. 출력은 `model.tar.gz` |
| **TuningStep** | 하이퍼파라미터 튜닝 작업 실행 | 여러 후보 중 최적 조합 탐색 |
| **ModelStep / CreateModelStep** | 학습 아티팩트로 모델 객체 생성 | 배포·배치 변환 직전 단계 |
| **RegisterModel** | Model Registry에 버전 등록 | 승인 워크플로의 시작점 |
| **TransformStep** | 배치 변환(batch transform) 실행 | 대량 오프라인 추론 |
| **ConditionStep** | 조건에 따라 분기 | 정확도 임계값 품질 게이트 |
| **LambdaStep** | Lambda 함수 호출 | 짧은 커스텀 로직(알림·태깅·외부 API) |
| **CallbackStep** | SQS로 외부 시스템에 넘기고 대기 | 파이프라인 밖 시스템의 응답을 기다릴 때 |
| **FailStep** | 파이프라인을 명시적으로 실패 처리 | 조건 미충족을 "성공"으로 두고 싶지 않을 때 |

- 전형적 흐름: `ProcessingStep`(전처리) → `TrainingStep`(학습) → `ProcessingStep`(평가) → `ConditionStep`(임계값) → `RegisterModel`(통과 시 등록).
- 평가도 학습이 아니라 **ProcessingStep**이다. "평가 단계"라는 별도 타입이 있다고 착각하기 쉽다.
- 짧은 커스텀 로직이면 **LambdaStep**, 파이프라인 밖 시스템의 응답을 기다려야 하면 **CallbackStep**으로 갈린다.

> ⚠️ **함정**: "정확도가 기준 미달이면 등록하지 않는다"까지는 `ConditionStep`의 `else_steps`를 비워두면 끝난다. 하지만 "미달이면 파이프라인을 **실패로 표시**해 알림이 울려야 한다"까지 요구하면 `else_steps=[FailStep(...)]`이 필요하다. 조건이 거짓일 때 아무것도 안 하면 실행 상태는 그냥 **Succeeded**로 끝나 아무도 눈치채지 못한다.

## 파라미터(Parameter) — 파이프라인을 재사용 가능하게

파라미터는 값을 정의 시점에 고정하지 않고 **실행 시점에 주입**하게 해주는 변수다. 인스턴스 타입·개수, 학습 데이터 경로, 정확도 임계값 같은 값을 파라미터로 빼두면 같은 정의로 여러 환경을 돌릴 수 있다.

| 파라미터 타입 | 담는 값 | 예 |
|---------------|---------|-----|
| `ParameterString` | 문자열 | S3 경로, 인스턴스 타입, 승인 상태 |
| `ParameterInteger` | 정수 | 인스턴스 개수, epoch 수 |
| `ParameterFloat` | 실수 | 정확도·AUC 임계값 |
| `ParameterBoolean` | 참/거짓 | 캐싱 사용 여부 같은 토글 |

```python
from sagemaker.workflow.parameters import (
    ParameterString, ParameterInteger, ParameterFloat,
)

# 실행 시점에 값을 주입할 수 있는 파라미터 선언
input_data = ParameterString(
    name="InputData",
    default_value="s3://my-bucket/dataset/train.csv",
)
instance_count = ParameterInteger(name="TrainingInstanceCount", default_value=1)
accuracy_threshold = ParameterFloat(name="AccuracyThreshold", default_value=0.85)
```

실행 시 기본값을 그대로 쓰거나 덮어쓸 수 있다.

```python
# 기본값으로 실행
pipeline.start()

# 파라미터를 덮어써서 실행 — 같은 정의, 다른 입력
pipeline.start(parameters={
    "InputData": "s3://my-bucket/dataset/train_v2.csv",
    "AccuracyThreshold": 0.90,
})
```

boto3로도 같은 일을 할 수 있다. CI/CD에서 파이프라인을 돌릴 때 쓰는 형태다.

```python
import boto3
sm = boto3.client("sagemaker")

sm.start_pipeline_execution(
    PipelineName="MLA-DemoPipeline",
    PipelineParameters=[
        {"Name": "InputData", "Value": "s3://my-bucket/dataset/train_v2.csv"},
        {"Name": "AccuracyThreshold", "Value": "0.90"},
    ],
)
```

> ⚠️ **함정**: 파라미터 객체는 **그대로 전달해야** 실행 시점 주입이 작동한다. `instance_count.default_value`처럼 값을 꺼내 쓰면 정의 시점의 숫자가 그대로 구워져 버리고, 실행할 때 아무리 덮어써도 반영되지 않는다. 파라미터를 문자열로 이어 붙이는 것도 같은 이유로 위험하다.

## 단계 정의와 단계 간 데이터 전달

각 단계는 SageMaker Python SDK 객체로 만든다. 한 단계의 `properties`를 다음 단계 입력으로 참조하면 SageMaker가 의존성을 추론해 DAG 엣지를 만든다.

```python
from sagemaker.workflow.steps import ProcessingStep, TrainingStep
from sagemaker.workflow.pipeline import Pipeline

# 1) 전처리 단계
step_process = ProcessingStep(
    name="PreprocessData",
    processor=sklearn_processor,
    inputs=[ProcessingInput(source=input_data, destination="/opt/ml/processing/input")],
    outputs=[ProcessingOutput(output_name="train", source="/opt/ml/processing/train")],
    code="preprocess.py",
)

# 2) 학습 단계 — 전처리 출력 S3 경로를 입력으로 참조(=의존성 자동 생성)
step_train = TrainingStep(
    name="TrainModel",
    estimator=xgb_estimator,
    inputs={
        "train": TrainingInput(
            s3_data=step_process.properties.ProcessingOutputConfig.Outputs[
                "train"
            ].S3Output.S3Uri,
            content_type="text/csv",
        )
    },
)
```

`step_process`의 출력을 `step_train`이 참조하므로 SageMaker는 "전처리 → 학습" 순서를 자동으로 알아낸다.

| 의존성을 만드는 방법 | 언제 쓰나 |
|----------------------|-----------|
| **출력 참조** (`step_a.properties....`) | 기본. 데이터가 실제로 흘러가는 경우 |
| **`depends_on=[step_a]`** | 데이터는 안 주고받지만 순서만 강제하고 싶을 때 |
| (아무것도 안 함) | 서로 독립 → **병렬 실행**된다 |

- 자주 참조하는 속성: 학습은 `properties.ModelArtifacts.S3ModelArtifacts`, 처리는 `properties.ProcessingOutputConfig.Outputs["이름"].S3Output.S3Uri`.
- 같은 단계를 매 실행마다 다시 돌리는 게 낭비라면 단계에 **캐싱(CacheConfig)** 을 켤 수 있다. 입력·파라미터가 동일하면 이전 결과를 재사용한다.

## 조건 단계(Condition Step) — 품질 게이트 만들기

조건 단계는 **평가 결과에 따라 파이프라인을 분기**시킨다. 가장 흔한 패턴은 "모델 정확도가 임계값을 넘으면 등록, 아니면 등록하지 않음"이라는 품질 게이트다.

```python
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.functions import JsonGet

# 평가 단계가 출력한 evaluation.json에서 accuracy를 읽어 임계값과 비교
cond_accuracy = ConditionGreaterThanOrEqualTo(
    left=JsonGet(
        step_name=step_eval.name,
        property_file=evaluation_report,
        json_path="metrics.accuracy.value",
    ),
    right=accuracy_threshold,   # ParameterFloat
)

step_condition = ConditionStep(
    name="CheckAccuracy",
    conditions=[cond_accuracy],
    if_steps=[step_register],     # 조건 충족 시: 모델 등록
    else_steps=[],                # 미충족 시: 아무것도 안 함
)
```

- `conditions`에 여러 조건을 넣으면 **모두 참일 때**만 `if_steps`가 실행된다(정확도 ≥ 0.85 **그리고** 지연시간 ≤ 100ms 같은 복합 게이트).
- `JsonGet`이 읽는 대상은 평가 단계가 `PropertyFile`로 선언해 둔 JSON 파일이다. 선언하지 않으면 읽을 수 없다.
- 조건 종류: `ConditionGreaterThanOrEqualTo`, `ConditionLessThanOrEqualTo`, `ConditionEquals`, `ConditionIn`, `ConditionNot` 등.

```python
from sagemaker.workflow.properties import PropertyFile

# 평가 단계가 어떤 파일을 "읽을 수 있는 속성 파일"로 내놓는지 선언
evaluation_report = PropertyFile(
    name="EvaluationReport",
    output_name="evaluation",          # ProcessingOutput의 output_name과 일치해야 함
    path="evaluation.json",            # 컨테이너가 그 경로에 쓴 파일명
)
```

> 💡 **관련 이론**: 조건 단계로 만드는 품질 게이트는 MLOps의 핵심 사상인 "사람의 수동 판단을 자동화된 검증으로 대체"의 구현이다. 모델이 기준선(baseline)을 넘지 못하면 자동으로 배포 흐름이 멈추므로, 성능 저하 모델의 프로덕션 유입을 코드 레벨에서 차단한다. 시험에서 "정확도가 일정 수준 이상일 때만 등록/배포하도록 자동화"라는 문장이 나오면 ConditionStep을 떠올려라.

## 파이프라인 생성·실행

단계들을 모아 `Pipeline` 객체로 묶고 `upsert`로 등록한 뒤 실행한다.

```python
pipeline = Pipeline(
    name="MLA-DemoPipeline",
    parameters=[input_data, instance_count, accuracy_threshold],
    steps=[step_process, step_train, step_eval, step_condition],
    sagemaker_session=pipeline_session,
)

# 파이프라인 정의를 SageMaker에 생성 또는 갱신
pipeline.upsert(role_arn=role)

# 실행 시작
execution = pipeline.start()
execution.wait()   # 완료까지 대기
```

- 각 실행은 고유한 execution ARN을 갖고, Studio의 Pipelines 탭에서 DAG와 단계별 상태(성공/실패/진행 중)를 시각적으로 추적한다.
- 실행 후 단계별 결과는 `execution.list_steps()`로 확인한다.
- 단계를 정의할 때는 일반 `Session`이 아니라 **`PipelineSession`** 을 쓴다. 그래야 `estimator.fit()`이 실제 학습을 즉시 실행하지 않고 "단계 인자"만 만들어 낸다.

## 파이프라인이 꼬일 때: 증상 → 원인 → 조치

| 증상 | 흔한 원인 | 조치 |
|------|-----------|------|
| 순서대로 돌아야 할 단계가 동시에 시작된다 | 단계 간 출력 참조가 없어 SageMaker가 독립으로 판단 | `properties` 출력을 참조하거나 `depends_on` 지정 |
| 조건이 항상 거짓이라 등록이 안 된다 | `PropertyFile` 미선언, `output_name` 불일치, `json_path` 오타 | 평가 리포트 구조와 `json_path`를 실제 JSON과 대조 |
| 조건 미충족인데 실행이 "성공"으로 끝난다 | `else_steps`가 비어 있어 실패로 표시되지 않음 | `else_steps=[FailStep(...)]`로 명시적 실패 처리 |
| 파라미터를 덮어써도 값이 안 바뀐다 | 정의 시점에 `default_value`를 꺼내 하드코딩 | 파라미터 객체를 그대로 단계에 전달 |
| 코드를 고쳤는데 예전 정의로 실행된다 | `upsert` 없이 `start`만 호출 | 정의 변경 후 `pipeline.upsert()` 재실행 |
| 학습 단계가 `AccessDenied` / PassRole 거부 | 파이프라인 실행 역할에 `iam:PassRole` 또는 S3 권한 없음 | 실행 역할에 대상 역할 PassRole·버킷 권한 부여 |
| 매 실행마다 전처리부터 다시 돌아 느리고 비싸다 | 단계 캐싱 미사용 | 변하지 않는 단계에 `CacheConfig` 활성화 |
| Studio에 DAG가 안 보인다 | `upsert`가 실패했거나 다른 리전/도메인 | 생성 리전과 실행 역할 권한 확인 |

> 💡 **개념**: 파이프라인 디버깅은 "**정의 문제**인가 **실행 문제**인가"부터 갈라야 한다. DAG 모양이 이상하면 정의(참조·`depends_on`) 문제이고, 모양은 맞는데 특정 단계만 죽으면 그 단계가 실행하는 작업(권한·데이터·컨테이너) 문제다. 앞엣것은 `pipeline.definition()`으로 JSON을 뽑아 보면 바로 드러난다.

내일은 이 파이프라인이 등록한 모델을 버전으로 관리하고 승인을 거쳐 배포로 연결하는 Model Registry를 다룬다.

## 📖 용어

- **SageMaker Pipelines** : ML 작업들을 단계로 묶어 순서대로 자동 실행해 주는 SageMaker 내장 워크플로 서비스.
- **DAG (방향성 비순환 그래프)** : 실행 순서에 방향이 있고 되돌아오는 고리가 없는 작업 그래프. 워크플로 표현의 표준 모델.
- **단계(Step)** : 파이프라인을 이루는 작업 한 칸. 전처리·학습·평가·등록 등 유형별로 타입이 정해져 있다.
- **properties 참조** : 앞 단계의 출력 위치를 뒤 단계 입력으로 적어 주는 것. 이것만으로 실행 순서가 자동 결정된다.
- **파라미터(Parameter)** : 정의할 때 값을 비워 두고 실행할 때 채워 넣는 변수. 같은 파이프라인을 환경마다 다르게 돌릴 수 있게 한다.
- **ConditionStep** : 평가 지표를 임계값과 비교해 뒤 단계를 실행할지 말지 가르는 분기 단계.
- **PropertyFile** : 평가 단계가 내놓은 JSON을 파이프라인이 읽을 수 있게 등록해 두는 선언. `JsonGet`이 이걸 통해 값을 꺼낸다.
- **FailStep** : 파이프라인을 명시적으로 실패 상태로 끝내는 단계. 조건 미충족을 조용히 넘기지 않으려 할 때 쓴다.
- **PipelineSession** : 파이프라인 정의용 세션. 학습 호출이 즉시 실행되지 않고 단계 인자로만 잡히게 한다.
- **단계 캐싱(CacheConfig)** : 입력과 설정이 같으면 이전 실행 결과를 재사용해 단계를 건너뛰는 기능. 시간·비용을 아낀다.

---

## 📝 연습 문제

**문제 1.** 데이터 과학팀이 전처리 → 학습 → 평가 → (정확도가 기준 이상이면) 모델 등록을 SageMaker 안에서 재현 가능하게 자동화하려 한다. 가장 적합한 서비스는?

A) AWS Glue 워크플로  
B) SageMaker Pipelines  
C) Amazon EMR Steps  
D) SageMaker Ground Truth  

**정답: B**  
해설: SageMaker 내부에서 ML 단계를 DAG로 묶어 재현 가능하게 오케스트레이션하는 네이티브 서비스가 Pipelines다. A·C는 ETL/빅데이터 처리용이고, D는 데이터 레이블링 서비스로 워크플로 오케스트레이션과 무관하다.

---

**문제 2.** SageMaker 파이프라인에서 학습 인스턴스 수, 학습 데이터 경로, 정확도 임계값을 매번 코드 수정 없이 실행 시점에 다른 값으로 주입하고 싶다. 무엇을 사용해야 하는가?

A) 환경 변수를 컨테이너에 하드코딩  
B) Pipeline Parameter (ParameterString/Integer/Float)  
C) 단계마다 별도 파이프라인을 새로 정의  
D) S3 버킷 정책  

**정답: B**  
해설: Pipeline Parameter는 실행 시점에 값을 주입할 수 있는 변수로, `pipeline.start(parameters=...)`로 덮어쓴다. 같은 정의를 여러 환경에 재사용하게 한다. A는 재사용성을 해치고, C는 DRY 원칙 위반이며, D는 권한 제어로 무관하다.

---

**문제 3.** 모델 평가 정확도가 0.85 미만이면 모델을 등록하지 않고, 이상이면 Model Registry에 등록되도록 파이프라인을 구성하려 한다. 어떤 단계를 사용하는가?

A) TrainingStep  
B) ConditionStep  
C) TransformStep  
D) ProcessingStep  

**정답: B**  
해설: ConditionStep은 평가 결과(예: JsonGet으로 읽은 accuracy)를 임계값과 비교해 `if_steps`/`else_steps`로 분기하는 품질 게이트를 만든다. A는 학습, C는 배치 변환, D는 전처리/평가 작업 실행 단계로 분기 기능이 없다.

---

**문제 4.** SageMaker Pipelines에서 전처리 단계의 출력 S3 경로를 학습 단계 입력으로 참조했을 때 일어나는 일은?

A) 두 단계가 무조건 병렬 실행된다  
B) SageMaker가 데이터 의존성을 추론해 전처리→학습 실행 순서(DAG 엣지)를 자동 생성한다  
C) 순환 참조 오류가 발생한다  
D) 수동으로 depends_on을 지정하지 않으면 무시된다  

**정답: B**  
해설: 한 단계의 `properties` 출력을 다음 단계 입력으로 참조하면 SageMaker가 의존성을 추론해 실행 순서를 자동으로 결정한다. A는 의존성이 있으면 순차 실행되고, C는 DAG라 순환이 허용되지 않을 뿐 정상 참조는 오류가 아니며, D는 출력 참조만으로 의존성이 자동 생성되므로 틀리다.

---

**문제 5.** SageMaker Pipelines의 장점으로 보기 어려운 것은?

A) 워크플로 정의가 코드로 남아 재현성을 보장한다  
B) 데이터·코드·파라미터와 산출 모델 간 계보(lineage)가 자동 추적된다  
C) SageMaker Studio에서 DAG와 실행 상태를 시각적으로 본다  
D) 온프레미스 Spark 클러스터를 직접 스케줄링한다  

**정답: D**  
해설: SageMaker Pipelines는 AWS/SageMaker 워크로드를 오케스트레이션하는 서비스로, 온프레미스 Spark 클러스터를 직접 스케줄링하지 않는다(그런 하이브리드 오케스트레이션은 MWAA/Airflow 영역). A·B·C는 모두 Pipelines의 실제 핵심 이점이다.

---
