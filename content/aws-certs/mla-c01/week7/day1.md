# Day 1 - SageMaker Pipelines: 단계, DAG, 파라미터, 조건 단계

지난 주가 "모델을 어떻게 배포하느냐"였다면, 이번 주는 "그 배포를 어떻게 자동화하고 반복 가능하게 만드느냐"다. 즉 MLOps다. 데이터 전처리 → 학습 → 평가 → 등록 → 배포로 이어지는 과정을 사람이 매번 손으로 노트북 셀을 실행하는 방식은 재현성이 없고 실수를 부른다. **SageMaker Pipelines**는 이 일련의 작업을 코드로 정의된 워크플로(DAG)로 묶어, 한 번 정의하면 같은 절차를 버튼 하나 또는 트리거로 반복 실행하게 해준다.

오늘은 Pipelines의 핵심 구성요소인 **단계(Step), 방향성 비순환 그래프(DAG), 파라미터(Parameter), 조건 단계(Condition Step)**를 다룬다. MLA-C01 시험은 "이 ML 워크플로를 재현 가능하게 오케스트레이션하려면 무엇을 쓰는가"를 반복해서 묻고, SageMaker 네이티브 환경에서는 거의 항상 Pipelines가 정답이다.

## SageMaker Pipelines란 무엇인가

SageMaker Pipelines는 ML 워크플로를 위한 **CI/CD 오케스트레이션 서비스**다. 각 작업을 "단계(step)"로 정의하고, 단계 간 데이터 의존성을 연결하면 SageMaker가 자동으로 실행 순서를 가진 **DAG(Directed Acyclic Graph)**를 구성한다. 한 단계의 출력(예: 전처리된 데이터 S3 경로)이 다음 단계의 입력으로 전달되며, SageMaker는 의존성이 없는 단계는 병렬로 실행한다.

핵심 특징:
- **재현성(reproducibility)**: 워크플로 정의가 코드와 JSON으로 남아 동일 절차를 반복 실행할 수 있다.
- **계보 추적(lineage tracking)**: 어떤 데이터·코드·파라미터로 어떤 모델이 나왔는지 자동 기록된다.
- **SageMaker Studio 통합**: DAG를 시각적으로 보고 각 실행(execution) 상태를 추적한다.
- **파이썬 SDK 기반**: 별도 DSL 없이 SageMaker Python SDK로 정의한다.

> 💡 **관련 이론**: Pipelines가 만드는 것은 DAG다. DAG는 "방향이 있고(실행 순서) 순환이 없는(무한 루프 방지)" 그래프로, 데이터 의존성을 노드/엣지로 표현하는 워크플로 오케스트레이션의 표준 모델이다. Airflow, Step Functions도 같은 DAG 모델을 쓴다. 시험에서 "SageMaker 내부에서 학습→평가→배포를 자동화"라면 Pipelines, "여러 AWS 서비스를 폭넓게 오케스트레이션"이면 Step Functions로 갈린다는 점을 기억하라.

## 파이프라인 단계(Step)의 종류

Pipelines는 작업 유형별로 미리 정의된 단계 타입을 제공한다. 자주 출제되는 것들:

| 단계 타입 | 역할 |
|----------|------|
| ProcessingStep | 데이터 전처리·후처리·평가 (SageMaker Processing 작업) |
| TrainingStep | 모델 학습 (Estimator 기반) |
| TuningStep | 하이퍼파라미터 튜닝 작업 실행 |
| ModelStep / CreateModelStep | 학습된 아티팩트로 모델 객체 생성 |
| RegisterModel | Model Registry에 모델 버전 등록 |
| TransformStep | 배치 변환(batch transform) 실행 |
| ConditionStep | 조건에 따라 분기 |
| CallbackStep / LambdaStep | 외부 작업 호출 (큐, Lambda 함수 등) |

전형적인 파이프라인은 `ProcessingStep`(전처리) → `TrainingStep`(학습) → `ProcessingStep`(평가) → `ConditionStep`(정확도 임계값 비교) → `RegisterModel`(통과 시 등록) 흐름을 갖는다.

## 파라미터(Parameter) — 파이프라인을 재사용 가능하게

파라미터는 파이프라인을 정의할 때 값을 고정하지 않고, **실행 시점에 주입**할 수 있게 해주는 변수다. 인스턴스 타입, 인스턴스 수, 학습 데이터 경로, 정확도 임계값 같은 값을 파라미터로 빼두면, 같은 파이프라인 정의로 개발/스테이징/프로덕션 환경을 다른 값으로 돌릴 수 있다.

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

`step_process`의 출력을 `step_train`이 참조하므로 SageMaker는 "전처리 → 학습" 순서를 자동으로 알아낸다. 명시적 순서 지정이 필요하면 `depends_on`도 쓸 수 있다.

## 조건 단계(Condition Step) — 품질 게이트 만들기

조건 단계는 **평가 결과에 따라 파이프라인을 분기**시킨다. 가장 흔한 패턴은 "모델 정확도가 임계값을 넘으면 등록, 아니면 등록하지 않음"이라는 품질 게이트(quality gate)다. 자동으로 형편없는 모델이 프로덕션 후보로 올라가는 것을 막는다.

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

`if_steps`와 `else_steps`로 분기 양쪽의 후속 단계를 지정한다. 조건이 거짓이면 `if_steps`는 실행되지 않는다.

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

각 실행은 고유한 execution ARN을 갖고, Studio의 Pipelines 탭에서 DAG와 단계별 상태(성공/실패/진행 중)를 시각적으로 추적할 수 있다.

## 정리

- SageMaker Pipelines는 ML 워크플로를 코드로 정의된 DAG로 오케스트레이션하는 네이티브 서비스다.
- 단계 타입(Processing, Training, Tuning, Register, Condition 등)으로 작업을 구성하고, 출력 참조로 의존성을 자동 연결한다.
- 파라미터로 실행 시점 값 주입을 지원해 같은 정의를 여러 환경에 재사용한다.
- 조건 단계로 정확도 임계값 같은 품질 게이트를 만들어 형편없는 모델의 자동 차단을 구현한다.
- "SageMaker 내부 워크플로 자동화·재현성"이면 Pipelines가 기본 정답이다.

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
