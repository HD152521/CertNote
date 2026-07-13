# Day 1 - SageMaker Pipelines: Steps, DAG, Parameters, Condition Steps

Last week focused on "how to deploy a model"; this week pivots to "how to automate and make that deployment reproducible". That is MLOps. The sequence data preprocessing → training → evaluation → registration → deployment, executed by hand running notebook cells every time, lacks reproducibility and invites errors. **SageMaker Pipelines** bundles this workflow as code-defined DAGs, so once defined, the same procedure repeats via a button click or trigger, automatically.

Today we cover Pipelines' core building blocks: **Steps, Directed Acyclic Graph (DAG), Parameters, and Condition Steps**. MLA-C01 repeatedly asks "what orchestrates this ML workflow to be reproducible?" and in SageMaker's native environment, Pipelines is almost always the answer.

## What is SageMaker Pipelines?

SageMaker Pipelines is a **CI/CD orchestration service for ML workflows**. Define each task as a "step", connect data dependencies between steps, and SageMaker automatically constructs a **DAG (Directed Acyclic Graph)** with execution order. One step's output (e.g., S3 path to preprocessed data) flows as input to the next step, and SageMaker runs steps without dependencies in parallel.

Core characteristics:
- **Reproducibility**: Workflow definition lives as code and JSON, enabling identical procedure repeats.
- **Lineage tracking**: Which data, code, and parameters created which model is auto-recorded.
- **SageMaker Studio integration**: View DAG visually and track each execution status.
- **Python SDK-based**: Define using SageMaker Python SDK, no separate DSL required.

> 💡 **Related Theory**: What Pipelines creates is a DAG. A DAG is a "directed (execution order) and acyclic (no infinite loops)" graph expressing data dependencies as nodes/edges—the standard model for workflow orchestration. Airflow and Step Functions also use the same DAG model. On exams, remember: "automate training → evaluation → deployment within SageMaker" → Pipelines; "orchestrate many AWS services broadly" → Step Functions.

## Pipeline Step Types

Pipelines offers pre-defined step types for common task kinds. Frequently tested:

| Step Type | Role |
|----------|------|
| ProcessingStep | Data preprocessing/postprocessing/evaluation (SageMaker Processing jobs) |
| TrainingStep | Model training (Estimator-based) |
| TuningStep | Run hyperparameter tuning job |
| ModelStep / CreateModelStep | Create model object from trained artifacts |
| RegisterModel | Register model version to Model Registry |
| TransformStep | Run batch transform job |
| ConditionStep | Branch by condition |
| CallbackStep / LambdaStep | Call external tasks (queues, Lambda, etc.) |

Typical pipeline flows: `ProcessingStep` (preprocess) → `TrainingStep` (train) → `ProcessingStep` (evaluate) → `ConditionStep` (compare accuracy to threshold) → `RegisterModel` (register if pass).

## Parameters — Make Pipelines Reusable

Parameters allow you to not fix values when defining the pipeline, but **inject them at execution time**. Instance type, instance count, training data path, accuracy threshold—if you externalize these as parameters, the same pipeline definition runs development/staging/production with different values.

```python
from sagemaker.workflow.parameters import (
    ParameterString, ParameterInteger, ParameterFloat,
)

# Declare parameters, injectible at execution
input_data = ParameterString(
    name="InputData",
    default_value="s3://my-bucket/dataset/train.csv",
)
instance_count = ParameterInteger(name="TrainingInstanceCount", default_value=1)
accuracy_threshold = ParameterFloat(name="AccuracyThreshold", default_value=0.85)
```

At execution, use defaults or override:

```python
# Run with defaults
pipeline.start()

# Override parameters—same definition, different inputs
pipeline.start(parameters={
    "InputData": "s3://my-bucket/dataset/train_v2.csv",
    "AccuracyThreshold": 0.90,
})
```

## Step Definition & Data Passing Between Steps

Each step is created as a SageMaker Python SDK object. Reference one step's `properties` as the next step's input, and SageMaker infers dependencies and creates DAG edges.

```python
from sagemaker.workflow.steps import ProcessingStep, TrainingStep
from sagemaker.workflow.pipeline import Pipeline

# 1) Preprocessing step
step_process = ProcessingStep(
    name="PreprocessData",
    processor=sklearn_processor,
    inputs=[ProcessingInput(source=input_data, destination="/opt/ml/processing/input")],
    outputs=[ProcessingOutput(output_name="train", source="/opt/ml/processing/train")],
    code="preprocess.py",
)

# 2) Training step—reference preprocessing output S3 path as input (=auto dependency)
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

Because `step_process`'s output is referenced by `step_train`, SageMaker auto-infers "preprocess → train" order. If explicit ordering is needed, `depends_on` is also available.

## Condition Step — Create Quality Gates

Condition steps **branch the pipeline based on evaluation results**. The most common pattern: "register model if accuracy exceeds threshold, otherwise don't"—a quality gate. Prevents poor-quality models from automatically becoming production candidates.

```python
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.functions import JsonGet

# Read accuracy from evaluation.json output by eval step, compare to threshold
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
    if_steps=[step_register],     # If condition met: register model
    else_steps=[],                # If not: do nothing
)
```

Use `if_steps` and `else_steps` to specify follow-up steps for each branch. If condition is false, `if_steps` do not execute.

> 💡 **Related Theory**: Quality gates created by ConditionStep implement the core MLOps philosophy: "replace manual human judgment with automated validation". If a model fails to exceed the baseline, the deployment flow automatically halts—stopping poor-performance models from reaching production at the code level. On exams, when you see "register/deploy only if accuracy meets threshold, automated", think ConditionStep.

## Pipeline Creation & Execution

Gather steps into a `Pipeline` object, register with `upsert`, then execute:

```python
pipeline = Pipeline(
    name="MLA-DemoPipeline",
    parameters=[input_data, instance_count, accuracy_threshold],
    steps=[step_process, step_train, step_eval, step_condition],
    sagemaker_session=pipeline_session,
)

# Create or update pipeline definition in SageMaker
pipeline.upsert(role_arn=role)

# Start execution
execution = pipeline.start()
execution.wait()   # Wait until complete
```

Each execution gets a unique execution ARN, and Studio's Pipelines tab visually tracks the DAG and per-step status (success/failure/in-progress).

## Summary

- SageMaker Pipelines orchestrates ML workflows as code-defined DAGs—the native service.
- Compose work using step types (Processing, Training, Tuning, Register, Condition, etc.) and auto-connect dependencies via output references.
- Parameters support value injection at execution time, enabling one definition to be reused across environments.
- ConditionStep creates quality gates (like accuracy thresholds) to auto-block poor models.
- "Automate/reproduce workflow inside SageMaker" → Pipelines is the default answer.

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
