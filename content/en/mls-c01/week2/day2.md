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

## 📝 Practice Questions

**Question 1.** A team wants to bundle data extraction (Glue), waiting for external approval, Lambda post-processing, and SageMaker training into a single flow and manage branching and retries declaratively. Which orchestrator is MOST appropriate?

A) AWS Step Functions  
B) SageMaker Pipelines  
C) Amazon Athena  
D) AWS Glue Crawler  

**Answer: A**  
Explanation: Step Functions is a general-purpose orchestrator that ties together heterogeneous AWS services such as Glue, Lambda, SageMaker, and approval waits, as well as non-ML steps, in a state machine and handles branching and retries declaratively with Choice, Retry, and Catch. SageMaker Pipelines (B) is ML-specific, so its integration of non-ML steps and approvals is limited, and Athena and Glue Crawler are not orchestration tools.

---

**Question 2.** In a pure ML CI/CD workflow, which step do you use to implement, with SageMaker Pipelines, the conditional branch "register the model in the registry only when evaluation accuracy is 0.85 or higher"?

A) ProcessingStep  
B) TrainingStep  
C) ConditionStep  
D) TuningStep  

**Answer: C**  
Explanation: ConditionStep evaluates conditions such as evaluation metrics and branches with if_steps/else_steps, so it fits exactly for expressing "register the model only when the accuracy criterion is met." ProcessingStep (preprocessing), TrainingStep (training), and TuningStep (hyperparameter tuning) each have different roles and do not handle conditional branching.

---

**Question 3.** Which are the two most essential values provided by ML pipeline automation?

A) Zero cost and unlimited scaling  
B) Code deletion and log deactivation  
C) Forced manual intervention and hidden steps  
D) Reproducibility and traceability (lineage)  

**Answer: D**  
Explanation: The core values of an automated pipeline are reproducibility, where the same input produces the same result, and lineage, which traces back which data, code, and parameters produced a particular model. Reducing cost to zero (A), turning off logs (B), and forcing manual intervention (C) are contrary to the purpose of automation.

---

**Question 4.** You want to automatically start an ML pipeline every time new data arrives in S3. What is the most common trigger configuration?

A) Start the pipeline with an S3 event or an EventBridge rule  
B) A person manually starts it from the console each time  
C) Start only when an RDS backup completes  
D) Trigger by changing an IAM policy  

**Answer: A**  
Explanation: Triggering pipeline execution with an S3 object-creation event or an EventBridge rule (event or cron) is the standard pattern and implements automatic start on data arrival. Manual start (B) runs counter to automation, and an RDS backup (C) and an IAM change (D) are signals unrelated to data arrival.

---

**Question 5.** Which statement is MOST correct about a configuration in which the upper level orchestrates the entire flow including the data pipeline and approvals, and calls SageMaker training jobs within it?

A) Step Functions and SageMaker Pipelines cannot be used together  
B) SageMaker Pipelines alone can completely replace all non-ML steps  
C) A hybrid configuration is possible in which Step Functions handles top-level orchestration and calls SageMaker jobs  
D) The two tools are identical, so there is no need to distinguish them  

**Answer: C**  
Explanation: A hybrid pattern in which Step Functions orchestrates the whole flow, such as data and approvals, at the upper level and calls SageMaker training/processing jobs within it is commonly used in practice. The two can be used together, so A is wrong; SageMaker Pipelines has limited integration of non-ML steps, so B is also inaccurate; and their roles differ, so D is also wrong.

---
