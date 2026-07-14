# Day 2 - Automating ML Training Pipelines: Step Functions and SageMaker Pipelines

Yesterday we learned how to transform data with Glue and EMR. But in real operations, transformation doesn't happen just once. Every time new data arrives, or at a fixed time each day, we must automatically repeat **extract → transform → validate → train → evaluate**. If this repetition is done manually, mistakes occur and reproducibility breaks.

Today we cover AWS's two main pillars for automating ML workflows: **AWS Step Functions** and **Amazon SageMaker Pipelines**. The MLS-C01 exam frequently asks "which orchestration tool to choose and when."

## Why Orchestration is Necessary

ML workflows have multiple steps with order, conditions, and dependencies intertwined. For example:

```
[Data Extraction] → [Preprocessing] → [Data Quality Validation]
                                          │
                  Quality Pass ────────┤──── Quality Fail → Alert and Stop
                  │
                  ▼
            [Model Training] → [Model Evaluation] → Accuracy Threshold Met?
                                          │
                  Met → [Register & Deploy Model]  │  Not Met → Retrain or Notify
```

Managing such branching, retries, and parallel processing in a single code block is fragile. An **orchestrator** makes each step a node and lets you declaratively define state transitions, error handling, and retries.

> 💡 **Related Theory**: The core values of a good pipeline are **reproducibility** and **lineage**. The same input should always produce the same result, and you should be able to trace back which data, code, and hyperparameters built a specific model. Automated pipelines structurally guarantee both.

## AWS Step Functions — A General-Purpose Workflow Orchestrator

Step Functions is a **serverless orchestration service that connects AWS services via state machines**. Each step is defined as a "state," and workflows are described using Amazon States Language (ASL), a JSON DSL.

Where Step Functions excels in ML:
- **Heterogeneous services** (Glue jobs, Lambda, SageMaker training/processing/batch transform, ECS) can be tied into one flow.
- `Choice` (branching), `Parallel` (parallelism), `Retry`/`Catch` (retries and exception handling) are expressed declaratively.
- **Native SageMaker actions** are built-in to directly invoke training, tuning, and batch transform jobs.

```json
{
  "Comment": "ML Training Pipeline",
  "StartAt": "GlueETL",
  "States": {
    "GlueETL": {
      "Type": "Task",
      "Resource": "arn:aws:states:::glue:startJobRun.sync",
      "Parameters": { "JobName": "preprocess-clicks" },
      "Next": "TrainModel"
    },
    "TrainModel": {
      "Type": "Task",
      "Resource": "arn:aws:states:::sagemaker:createTrainingJob.sync",
      "Parameters": {
        "TrainingJobName.$": "$.jobName",
        "AlgorithmSpecification": { "TrainingImage.$": "$.image", "TrainingInputMode": "File" }
      },
      "Retry": [ { "ErrorEquals": ["States.ALL"], "MaxAttempts": 2 } ],
      "Catch": [ { "ErrorEquals": ["States.ALL"], "Next": "NotifyFailure" } ],
      "End": true
    },
    "NotifyFailure": {
      "Type": "Task",
      "Resource": "arn:aws:states:::sns:publish",
      "Parameters": { "TopicArn": "arn:aws:sns:...:ml-alerts", "Message": "Training failed" },
      "End": true
    }
  }
}
```

The `.sync` suffix means "wait until that task completes." Note how `Retry` and `Catch` declaratively handle retry and notification flows on failure.

> 💡 **Related Theory**: Step Functions is not ML-specific but a **general-purpose workflow tool**. It excels at broad orchestration where you need to bind together ML and non-ML steps (data extraction, S3 cleanup, external API calls, approval waits).

## Amazon SageMaker Pipelines — ML-Native Pipelines

SageMaker Pipelines is a **CI/CD orchestrator designed exclusively for ML workflows**. Define steps with Python SDK, and SageMaker handles execution, tracking, and versioning. It's characterized by providing step types specialized for ML work.

Key step types:
- `ProcessingStep` — preprocessing and postprocessing (SageMaker Processing)
- `TrainingStep` — model training
- `TuningStep` — hyperparameter tuning
- `RegisterModel` / `ModelStep` — model registry registration
- `ConditionStep` — branching based on evaluation metrics (e.g., register only if accuracy ≥ 0.85)

```python
from sagemaker.workflow.steps import ProcessingStep, TrainingStep
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo
from sagemaker.workflow.pipeline import Pipeline

# Preprocess → Train → Evaluate → (Conditionally) Register Model
step_process = ProcessingStep(name="Preprocess", processor=sklearn_processor, ...)
step_train = TrainingStep(name="Train", estimator=xgb_estimator, ...)

cond_accuracy = ConditionGreaterThanOrEqualTo(
    left=eval_metric_accuracy, right=0.85
)
step_cond = ConditionStep(
    name="AccuracyGate",
    conditions=[cond_accuracy],
    if_steps=[step_register_model],   # Register model if threshold is met
    else_steps=[]                     # Don't register if not met
)

pipeline = Pipeline(
    name="ml-train-pipeline",
    steps=[step_process, step_train, step_cond],
)
pipeline.upsert(role_arn=role)
pipeline.start()
```

> 💡 **Related Theory**: SageMaker Pipelines automatically records **lineage** with each execution. Which dataset, code, and hyperparameters built which model is tracked and linked to the SageMaker Model Registry. This is a critical feature in regulated environments (explainability and audit).

## Step Functions vs SageMaker Pipelines — Selection Criteria

| Aspect | Step Functions | SageMaker Pipelines |
|--------|----------------|---------------------|
| Scope | General-purpose (AWS-wide orchestration) | ML-only |
| Definition | ASL (JSON) / Workflow Studio | Python SDK |
| ML Integration | SageMaker actions supported | Native, with model registry and lineage built-in |
| Non-ML Steps | Strong (Lambda, Glue, approvals, SNS) | Limited |
| Best For | Mixed ML+non-ML, complex branching/approvals | Pure ML CI/CD, lineage-critical |

Core decision: **If workflows are purely ML training/evaluation/registration, use SageMaker Pipelines**; **if ML steps intertwine with data pipelines, external systems, and approval steps, Step Functions feels more natural**. A hybrid pattern (Step Functions orchestrating at the top level, calling SageMaker jobs within) is also common.

> ⚠️ **Pitfall**: "It's an ML task, so definitely use SageMaker Pipelines" is an oversimplified trap answer. If your workflow has approval waits, multiple non-ML system integrations, and complex conditional branching, the more general Step Functions may be better suited. Read the problem requirements (proportion of non-ML steps, traceability needs) to decide.

## Triggers and Scheduling

Deciding "when to run the pipeline" is part of the design.

- **Amazon EventBridge**: Start the pipeline on a schedule (cron) or event (e.g., new data arrives in S3).
- **S3 Event → Lambda → Start Pipeline**: A typical pattern using data arrival as the trigger.
- **SageMaker Pipelines Schedule**: EventBridge rules trigger regular executions.

> 🎯 **Scenario**: "Every day at 2 AM, preprocess yesterday's logs and retrain the model, but if evaluation accuracy is below 0.9, don't deploy and notify the data team." → Use an EventBridge cron rule to trigger the SageMaker Pipeline, place a `ConditionStep` (accuracy gate) inside, and add SNS notifications on failure.

## Summary

Today we compared two tools for automating ML training pipelines. **Step Functions is a general orchestrator binding AWS services, excelling at mixed ML and non-ML workflows**, while **SageMaker Pipelines is ML-only with built-in lineage and model registry integration and strong conditional branching**. The real value of automation is reproducibility and lineage; attach EventBridge scheduling and event triggers to complete a fully automated pipeline.

Tomorrow we explore **data augmentation and synthesis** techniques to address insufficient or imbalanced data.

---

## 📝 연습 문제

**문제 1.** 한 팀이 데이터 추출(Glue), 외부 승인 대기, Lambda 후처리, SageMaker 학습을 하나의 흐름으로 묶고 분기·재시도를 선언적으로 관리하려 한다. 가장 적합한 오케스트레이터는?

A) AWS Step Functions  
B) SageMaker Pipelines  
C) Amazon Athena  
D) AWS Glue Crawler  

**정답: A**  
해설: Step Functions는 Glue·Lambda·SageMaker·승인 대기 등 이질적인 AWS 서비스와 비-ML 단계를 상태 머신으로 묶고 Choice·Retry·Catch로 분기·재시도를 선언적으로 처리하는 범용 오케스트레이터다. SageMaker Pipelines(B)는 ML 전용이라 비-ML 단계·승인 통합이 제한적이고, Athena·Glue Crawler는 오케스트레이션 도구가 아니다.

---

**문제 2.** 순수 ML CI/CD 워크플로에서 "평가 정확도가 0.85 이상일 때만 모델을 레지스트리에 등록"하는 조건부 분기를 SageMaker Pipelines로 구현하려면 사용하는 단계는?

A) ProcessingStep  
B) TrainingStep  
C) ConditionStep  
D) TuningStep  

**정답: C**  
해설: ConditionStep은 평가 지표 등의 조건을 평가해 if_steps/else_steps로 분기하므로 "정확도 기준 충족 시에만 모델 등록"을 표현하는 데 정확히 들어맞는다. ProcessingStep(전처리), TrainingStep(학습), TuningStep(하이퍼파라미터 튜닝)은 각각 다른 역할로 조건 분기를 담당하지 않는다.

---

**문제 3.** ML 파이프라인 자동화가 제공하는 가장 본질적인 두 가지 가치로 옳은 것은?

A) 비용 0원과 무제한 확장  
B) 코드 삭제와 로그 비활성화  
C) 수동 개입 강제와 단계 은닉  
D) 재현성과 추적성(lineage)  

**정답: D**  
해설: 자동화 파이프라인의 핵심 가치는 같은 입력이면 같은 결과를 내는 재현성과, 특정 모델이 어떤 데이터·코드·파라미터로 만들어졌는지 거슬러 추적하는 lineage다. 비용이 0이 되거나(A) 로그를 끄거나(B) 수동 개입을 강제하는 것(C)은 자동화의 목적과 반대된다.

---

**문제 4.** 새 데이터가 S3에 도착할 때마다 ML 파이프라인을 자동으로 시작하고 싶다. 가장 일반적인 트리거 구성은?

A) S3 이벤트 또는 EventBridge 규칙으로 파이프라인 시작  
B) 사람이 매번 콘솔에서 수동 시작  
C) RDS 백업 완료 시점에만 시작  
D) IAM 정책 변경으로 트리거  

**정답: A**  
해설: S3 객체 생성 이벤트나 EventBridge 규칙(이벤트·cron)으로 파이프라인 실행을 트리거하는 것이 표준 패턴이며, 데이터 도착 시 자동 시작을 구현한다. 수동 시작(B)은 자동화에 어긋나고, RDS 백업(C)·IAM 변경(D)은 데이터 도착과 무관한 신호다.

---

**문제 5.** 상위에서는 데이터 파이프라인과 승인을 포함한 전체 흐름을 오케스트레이션하고, 그 내부에서 SageMaker 학습 작업을 호출하는 구성에 대한 설명으로 가장 옳은 것은?

A) Step Functions와 SageMaker Pipelines는 함께 쓸 수 없다  
B) SageMaker Pipelines만으로 모든 비-ML 단계를 완벽히 대체할 수 있다  
C) Step Functions가 상위 오케스트레이션을 맡고 SageMaker 작업을 호출하는 혼합 구성이 가능하다  
D) 두 도구는 동일하므로 구분이 불필요하다  

**정답: C**  
해설: Step Functions가 상위에서 데이터·승인 등 전체 흐름을 오케스트레이션하고 그 안에서 SageMaker 학습/처리 작업을 호출하는 혼합 패턴은 실무에서 흔히 쓰인다. 둘은 함께 사용 가능하므로 A는 틀렸고, SageMaker Pipelines는 비-ML 단계 통합이 제한적이라 B도 부정확하며, 역할이 다르므로 D도 틀렸다.

---
