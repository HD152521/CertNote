# Day 2 - Automating ML Training Pipelines: Step Functions and SageMaker Pipelines

## 📌 Key Takeaways

- Automation delivers two essential values: **reproducibility** and **lineage**.
- **Step Functions** = a general-purpose orchestrator. It ties Glue, Lambda, SageMaker, and approval waits into one flow with an ASL (JSON) state machine.
- **SageMaker Pipelines** = ML-specific. Python SDK, ProcessingStep/TrainingStep/TuningStep/ConditionStep, with lineage and a model registry built in.
- Decision rule: **pure ML CI/CD → Pipelines**, **mixed ML + non-ML, approvals, complex branching → Step Functions**. Layering the two together is also common.
- Attach triggers with **EventBridge** (cron/events) or **S3 event → Lambda**.

## Why Orchestration is Necessary

Yesterday we learned how to transform data with Glue and EMR. But transformation doesn't just run once and finish. Every time new data arrives, or at a fixed time each day, we must automatically repeat **extract → transform → validate → train → evaluate**. If a person runs this repetition by hand, mistakes occur and reproducibility breaks.

ML workflows have multiple steps with order, conditions, and dependencies intertwined.

```
[Data Extraction] → [Preprocessing] → [Data Quality Validation]
                                  │
                  Quality Pass ───┤──── Quality Fail → Alert and Stop
                  │
                  ▼
            [Model Training] → [Model Evaluation] → Accuracy Threshold Met?
                                          │
                  Met → [Register & Deploy Model]  │  Not Met → Retrain or Notify
```

- Managing such branching, retries, and parallel processing in a single block of code is fragile.
- An **orchestrator** makes each step a node and lets you declaratively define state transitions, error handling, and retries.

The core values of a good pipeline are **reproducibility** and **lineage**. The same input should produce the same result no matter when you run it, and you should be able to trace back which data, which code, and which parameters built a specific model. Automated pipelines structurally guarantee both.

## AWS Step Functions — A General-Purpose Workflow Orchestrator

Step Functions is a **serverless orchestration service that ties AWS services together as state machines**. Each step is defined as a "state," and the flow is described in Amazon States Language (ASL), a JSON DSL.

Where Step Functions is strong in ML:

- It **ties heterogeneous services into one flow**: Glue jobs, Lambda, SageMaker training/processing/batch transform, ECS.
- `Choice` (branching), `Parallel` (parallelism), `Map` (iteration), and `Retry`/`Catch` (retries and exception handling) are expressed declaratively.
- **Built-in SageMaker integration actions** directly invoke training, tuning, and batch transform jobs.
- Non-ML steps such as **waiting for human approval** slot in naturally.

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

- The `.sync` suffix means "wait until that task completes."
- `Retry` and `Catch` declaratively handle the retry and notification flow on failure.

### Commonly Used State Types

| State | What it does | Use in ML |
|---|---|---|
| `Task` | Invokes the actual work | Glue job, SageMaker training, Lambda |
| `Choice` | Conditional branching | Did the evaluation metric exceed the threshold? |
| `Parallel` | Runs multiple branches at the same time | Train several algorithms simultaneously |
| `Map` | Iterates over each array element | Train per-region or per-segment models |
| `Wait` | Waits for a specified time | Waiting on an external system to finish |
| `Fail` / `Succeed` | Explicit termination | Handling a quality-gate failure |

Step Functions is not ML-specific but a **general-purpose workflow tool**. That is why it excels at broad orchestration where ML steps and non-ML steps (data extraction, S3 cleanup, external API calls, approval waits) must be tied together.

## Amazon SageMaker Pipelines — ML-Native Pipelines

SageMaker Pipelines is a **CI/CD orchestrator designed exclusively for ML workflows**. Define the steps with the Python SDK, and SageMaker handles execution, tracking, and versioning.

Key step types:

| Step | Role |
|---|---|
| `ProcessingStep` | Preprocessing, postprocessing, evaluation (SageMaker Processing) |
| `TrainingStep` | Model training |
| `TuningStep` | Hyperparameter tuning |
| `RegisterModel` / `ModelStep` | Registration in the model registry |
| `ConditionStep` | Branching on evaluation metrics (e.g., register only if accuracy ≥ 0.85) |
| `TransformStep` | Batch transform (large-scale scoring) |

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

SageMaker Pipelines automatically records **lineage** with every execution. Which dataset, code, and hyperparameters built which model is tracked and linked to the SageMaker Model Registry. This is a very important feature in regulated environments (explainability and audit).

### Model Registry and the Approval Flow

- Models registered with `RegisterModel` accumulate versions inside a **model package group**.
- Each version has an **approval status** (pending approval / approved / rejected). The standard practice is to configure the deployment pipeline to pick up only approved versions.
- Thanks to this structure, a record remains of "who put this model into production, when, and on what grounds."

## Step Functions vs SageMaker Pipelines — Selection Criteria

| Aspect | Step Functions | SageMaker Pipelines |
|---|---|---|
| Scope | General-purpose (AWS-wide orchestration) | ML-only |
| Definition | ASL (JSON) / Workflow Studio | Python SDK |
| ML integration | SageMaker actions supported | Native, with model registry and lineage built in |
| Non-ML steps | Strong (Lambda, Glue, approvals, SNS, etc.) | Limited |
| Retries/exceptions | Fine-grained with Retry/Catch | Limited at the step level |
| Best for | Mixed ML + non-ML, complex branching/approvals | Pure ML CI/CD, lineage-critical |

Core decision: **if the workflow is purely centered on ML training/evaluation/registration, use SageMaker Pipelines**; **if ML steps are mixed with data pipelines, external systems, and approval steps, Step Functions** feels more natural. A pattern that uses both (Step Functions orchestrating the whole at the top level, calling SageMaker jobs within) is also common.

```
[Hybrid setup]
Step Functions (top-level orchestration)
   ├─ Glue ETL job
   ├─ Data quality validation Lambda
   ├─ Wait for human approval
   └─ Run SageMaker Pipeline ──┬─ Processing
                               ├─ Training
                               ├─ Evaluation
                               └─ ConditionStep → RegisterModel
```

> ⚠️ **Pitfall**: "It's an ML task, so definitely use SageMaker Pipelines" is an oversimplified wrong answer. If the workflow has approval waits, integration with several non-ML systems, and a lot of complex conditional branching, the more general-purpose Step Functions is better suited. Read the problem's requirements (the proportion of non-ML steps, traceability needs) to decide.

## Triggers and Scheduling

Deciding "when to run the pipeline" is part of the design.

| Trigger | Setup | Typical situation |
|---|---|---|
| Schedule | EventBridge cron rule | Regular retraining every early morning |
| Data arrival | S3 event → Lambda → start pipeline | Whenever a new batch file is uploaded |
| Code change | CodePipeline/CodeCommit integration | When preprocessing or training code changes |
| Drift detection | Model Monitor alarm → EventBridge | When production performance decay is detected |
| Manual | `pipeline.start()` | Experiments, emergency retraining |

> 🎯 **Scenario**: "Every day at 2 AM, preprocess yesterday's logs and retrain the model, but if evaluation accuracy is below 0.9, don't deploy and notify the data team." → Use an EventBridge cron rule to trigger the SageMaker Pipeline, place a `ConditionStep` (accuracy gate) inside the pipeline, and add SNS notifications on failure.

> ⚠️ **Pitfall**: An option that has a person start the trigger "from the console" is a wrong answer in an automation question. It contradicts the very purpose of automation.

## Parameterization and Re-execution

A pipeline is something "written once and run over and over," so it is important to design away hardcoding.

- **Pipeline parameters**: Inject the input data path, instance type and count, and accuracy threshold at execution time. The same definition runs development, staging, and production.
- **Caching**: Steps whose inputs and settings are identical to a previous run reuse their results, saving time and cost.
- **Partial re-execution**: If only training failed, there is no reason to rerun from preprocessing. Separating steps means separating the units of re-execution.
- **Execution history**: Each run must leave a record of which parameters it used, so you can answer "why is only this model's performance different?"

### What to Look At When It Fails

| Symptom | Common cause | Response |
|---|---|---|
| Permission error at the training step | Execution role missing S3/ECR permissions | Fix the IAM role policy |
| Input path not found | Mismatch with the previous step's output path | Pin the output→input connections between steps with parameters |
| Results differ subtly every time | Random seed / data snapshot not pinned | Fix the seed, use versioned input data paths |
| Keeps getting blocked at the quality gate | Data drift or an excessive threshold | Check the data first; adjust the threshold with justification |
| Job seems to run forever | No timeout configured | Specify a maximum run time per step |

When a pipeline fails, an option saying "increase the retry count" is usually wrong. Retries are the response to **transient errors**; permission, path, and data problems stop at the same place no matter how many times you rerun them.

Tomorrow we look at **data augmentation and synthesis** techniques that compensate when data is scarce or imbalanced.

## 📖 Glossary

- **Orchestration**: Managing the execution order, conditions, and retries of multiple tasks declaratively in one place.
- **State machine**: A workflow definition that defines each step as a "state" and describes the transition rules.
- **ASL (Amazon States Language)**: The JSON-based language used to describe Step Functions workflows.
- **`.sync` integration**: A Step Functions invocation style that waits until the invoked task finishes before moving to the next state.
- **Retry / Catch**: Declarative exception handling that automatically retries on failure and, if it still fails, hands off to a designated handling state.
- **Lineage**: A record that lets you trace back which data, code, and parameters a model came from.
- **ConditionStep**: A SageMaker Pipelines step that branches subsequent steps on conditions such as evaluation metrics.
- **Model registry**: A repository for registering, approving, and tracking model versions. A gate is set so that only approved versions get deployed.
- **EventBridge**: An event bus that reacts to cron schedules or AWS events and invokes other services.
- **Quality gate**: An automated checkpoint that blocks progress to the next step if a reference metric is not met.

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
