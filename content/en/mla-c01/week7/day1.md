# Day 1 - SageMaker Pipelines: Steps, DAG, Parameters, Condition Steps

## 📌 Key Takeaways

- **SageMaker Pipelines** is SageMaker's native orchestrator that bundles an ML workflow into a code-defined **DAG** and runs it repeatedly.
- **Step types** are fixed per kind of work — Processing, Training, Tuning, Model, RegisterModel, Transform, Condition, Lambda, Callback, Fail.
- When one step's `properties` are **referenced** as the next step's input, the dependency automatically becomes a **DAG edge**. Without a reference, steps run in parallel.
- **Parameters** inject values at execution time so the same definition can be reused across dev/staging/prod.
- **ConditionStep** is a **quality gate** that compares an evaluation metric to a threshold — it blocks automatic registration of a model that misses the bar.

## What Is SageMaker Pipelines?

If last week was about "how to deploy a model," this week is about "how to automate that deployment and make it repeatable" — in other words, MLOps.

- A **CI/CD orchestration service for ML workflows**. You define each task as a "step."
- Once you connect data dependencies between steps, SageMaker automatically builds a **DAG (Directed Acyclic Graph)** with an execution order.
- One step's output (for example, the S3 path of preprocessed data) is passed as the next step's input, and steps with no dependency between them run **in parallel**.
- Having a person run notebook cells by hand every time is not reproducible and invites mistakes — the goal is to replace that.

| Feature | Description |
|------|------|
| **Reproducibility** | The workflow definition is kept as code and JSON, so the same procedure runs repeatedly |
| **Lineage tracking** | Automatically records which data, code, and parameters produced which model |
| **Studio integration** | View the DAG visually and track the status of each step per execution |
| **Python SDK based** | Defined with the SageMaker Python SDK, with no separate DSL |
| **Registry integration** | The `RegisterModel` step registers a version straight into the Model Registry |

What Pipelines creates is a DAG. A DAG is a graph that is "directed (execution order) and acyclic (no infinite loops)," the standard model of workflow orchestration that expresses data dependencies as nodes and edges. Airflow and Step Functions use the same DAG model. In the exam it splits like this: "automate training → evaluation → deployment inside SageMaker" means Pipelines, while "broadly orchestrate many AWS services" means Step Functions.

## A Typical Pipeline DAG

A widely used shape is preprocessing → training → evaluation → condition → registration.

```text
ParameterString(InputData)          ParameterFloat(AccuracyThreshold)
       │                                            │
       ▼                                            │
ProcessingStep "PreprocessData"   (preprocessing)   │
       │ properties → S3Output.S3Uri                │
       ▼                                            │
TrainingStep   "TrainModel"       (training)        │
       │ ModelArtifacts.S3ModelArtifacts            │
       ▼                                            │
ProcessingStep "EvaluateModel"    (evaluation)      │
       │ PropertyFile → evaluation.json             │
       └──────────────┬─────────────────────────────┘
                      ▼
              ConditionStep "CheckAccuracy"
                      │
        if_steps ─────┴───── else_steps
            │                    │
            ▼                    ▼
      RegisterModel          FailStep
    → Model Registry        (or left empty)
```

- The parameters at the top are **injected at execution time** and flow through the entire DAG.
- Every arrow was created automatically from an "output reference." No one wrote the order in by hand.
- If the condition is false, the whole `if_steps` branch is skipped — a poor model never reaches the Registry.

## Kinds of Pipeline Steps

Pipelines provides step types predefined for each kind of work. The main step types are as follows:

| Step type | Role | Typical use |
|----------|------|-------------|
| **ProcessingStep** | Runs a SageMaker Processing job | Preprocessing, feature engineering, model evaluation |
| **TrainingStep** | Estimator-based model training | The main training. Output is `model.tar.gz` |
| **TuningStep** | Runs a hyperparameter tuning job | Searching for the best combination among many candidates |
| **ModelStep / CreateModelStep** | Creates a model object from the training artifact | The step right before deployment or batch transform |
| **RegisterModel** | Registers a version in the Model Registry | Starting point of the approval workflow |
| **TransformStep** | Runs batch transform | Large-scale offline inference |
| **ConditionStep** | Branches based on a condition | Accuracy threshold quality gate |
| **LambdaStep** | Invokes a Lambda function | Short custom logic (notifications, tagging, external APIs) |
| **CallbackStep** | Hands off to an external system via SQS and waits | When you must wait for a response from a system outside the pipeline |
| **FailStep** | Explicitly marks the pipeline as failed | When you do not want an unmet condition to end as "success" |

- Typical flow: `ProcessingStep` (preprocessing) → `TrainingStep` (training) → `ProcessingStep` (evaluation) → `ConditionStep` (threshold) → `RegisterModel` (register if it passes).
- Evaluation is also a **ProcessingStep**, not a training step. It is easy to wrongly assume there is a separate "evaluation step" type.
- For short custom logic use **LambdaStep**; if you must wait for a response from a system outside the pipeline, use **CallbackStep**.

> ⚠️ **Trap**: "Do not register if accuracy misses the bar" is satisfied just by leaving `ConditionStep`'s `else_steps` empty. But if the requirement goes further — "if it misses, the pipeline must be **marked as failed** so that an alert fires" — you need `else_steps=[FailStep(...)]`. If nothing happens when the condition is false, the execution status simply ends as **Succeeded** and nobody notices.

## Parameters — Making a Pipeline Reusable

A parameter is a variable that lets you **inject a value at execution time** rather than fixing it at definition time. If you pull values such as instance type and count, the training data path, and the accuracy threshold out into parameters, the same definition can run in multiple environments.

| Parameter type | Holds | Example |
|---------------|---------|-----|
| `ParameterString` | A string | S3 path, instance type, approval status |
| `ParameterInteger` | An integer | Instance count, number of epochs |
| `ParameterFloat` | A floating-point number | Accuracy or AUC threshold |
| `ParameterBoolean` | True/false | A toggle such as whether to use caching |

```python
from sagemaker.workflow.parameters import (
    ParameterString, ParameterInteger, ParameterFloat,
)

# Declare parameters whose values can be injected at execution time
input_data = ParameterString(
    name="InputData",
    default_value="s3://my-bucket/dataset/train.csv",
)
instance_count = ParameterInteger(name="TrainingInstanceCount", default_value=1)
accuracy_threshold = ParameterFloat(name="AccuracyThreshold", default_value=0.85)
```

At execution time you can use the defaults as they are or override them.

```python
# Run with the defaults
pipeline.start()

# Run with overridden parameters — same definition, different inputs
pipeline.start(parameters={
    "InputData": "s3://my-bucket/dataset/train_v2.csv",
    "AccuracyThreshold": 0.90,
})
```

You can do the same thing with boto3. This is the form used when running a pipeline from CI/CD.

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

> ⚠️ **Trap**: You must **pass the parameter object as is** for execution-time injection to work. If you pull out the value, as in `instance_count.default_value`, the number from definition time gets baked in, and no amount of overriding at execution is reflected. Concatenating a parameter into a string is risky for the same reason.

## Defining Steps and Passing Data Between Steps

Each step is created as a SageMaker Python SDK object. When one step's `properties` are referenced as the next step's input, SageMaker infers the dependency and creates a DAG edge.

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

# 2) Training step — references the preprocessing output S3 path as input (= dependency created automatically)
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

Because `step_train` references the output of `step_process`, SageMaker works out the "preprocessing → training" order automatically.

| How to create a dependency | When to use it |
|----------------------|-----------|
| **Output reference** (`step_a.properties....`) | The default. When data actually flows between steps |
| **`depends_on=[step_a]`** | When no data is exchanged but you want to force an order |
| (Do nothing) | The steps are independent → they run **in parallel** |

- Frequently referenced properties: for training, `properties.ModelArtifacts.S3ModelArtifacts`; for processing, `properties.ProcessingOutputConfig.Outputs["name"].S3Output.S3Uri`.
- If rerunning the same step on every execution is wasteful, you can turn on **caching (CacheConfig)** for the step. If the inputs and parameters are identical, the previous result is reused.

## Condition Step — Building a Quality Gate

A condition step **branches the pipeline based on evaluation results**. The representative pattern is a quality gate: "register the model if its accuracy exceeds the threshold, otherwise do not."

```python
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.functions import JsonGet

# Read accuracy from the evaluation.json that the evaluation step outputs and compare it to the threshold
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
    if_steps=[step_register],     # If the condition is met: register the model
    else_steps=[],                # If not met: do nothing
)
```

- If you put several conditions in `conditions`, `if_steps` runs **only when all are true** (a compound gate such as accuracy ≥ 0.85 **and** latency ≤ 100ms).
- What `JsonGet` reads is a JSON file that the evaluation step has declared as a `PropertyFile`. If it is not declared, it cannot be read.
- Kinds of conditions: `ConditionGreaterThanOrEqualTo`, `ConditionLessThanOrEqualTo`, `ConditionEquals`, `ConditionIn`, `ConditionNot`, and so on.

```python
from sagemaker.workflow.properties import PropertyFile

# Declare which file the evaluation step exposes as a "readable property file"
evaluation_report = PropertyFile(
    name="EvaluationReport",
    output_name="evaluation",          # Must match the output_name of the ProcessingOutput
    path="evaluation.json",            # The file name the container wrote at that path
)
```

The quality gate built with a condition step implements the core MLOps idea of "replacing manual human judgment with automated validation." If a model does not clear the baseline, the deployment flow stops automatically, so a degraded model is blocked from entering production at the code level. When the exam says "automate so that a model is registered/deployed only when accuracy is above a certain level," the answer is ConditionStep.

## Creating and Running a Pipeline

Gather the steps into a `Pipeline` object, register it with `upsert`, and then run it.

```python
pipeline = Pipeline(
    name="MLA-DemoPipeline",
    parameters=[input_data, instance_count, accuracy_threshold],
    steps=[step_process, step_train, step_eval, step_condition],
    sagemaker_session=pipeline_session,
)

# Create or update the pipeline definition in SageMaker
pipeline.upsert(role_arn=role)

# Start execution
execution = pipeline.start()
execution.wait()   # Wait until it completes
```

- Each execution has a unique execution ARN, and the Pipelines tab in Studio visually tracks the DAG and the status of each step (succeeded/failed/in progress).
- After an execution, check per-step results with `execution.list_steps()`.
- When defining steps, use **`PipelineSession`** rather than a regular `Session`. That way `estimator.fit()` does not run training immediately but only produces the "step arguments."

## When a Pipeline Goes Wrong: Symptom → Cause → Action

| Symptom | Common cause | Action |
|------|-----------|------|
| Steps that should run in order start at the same time | There is no output reference between the steps, so SageMaker treats them as independent | Reference the `properties` output or specify `depends_on` |
| The condition is always false, so registration never happens | `PropertyFile` not declared, `output_name` mismatch, or a typo in `json_path` | Compare the evaluation report structure and `json_path` against the actual JSON |
| The condition is not met but the execution ends as "Succeeded" | `else_steps` is empty, so it is not marked as failed | Fail explicitly with `else_steps=[FailStep(...)]` |
| Overriding a parameter does not change the value | `default_value` was pulled out and hardcoded at definition time | Pass the parameter object to the step as is |
| You changed the code but it runs with the old definition | `start` was called without `upsert` | Run `pipeline.upsert()` again after changing the definition |
| The training step fails with `AccessDenied` / PassRole denied | The pipeline execution role lacks `iam:PassRole` or S3 permissions | Grant the execution role PassRole on the target role and bucket permissions |
| Every execution reruns from preprocessing, making it slow and expensive | Step caching is not used | Enable `CacheConfig` on steps that do not change |
| The DAG does not appear in Studio | `upsert` failed, or a different Region/domain | Check the creation Region and the execution role permissions |

Debugging a pipeline starts with separating "is it a **definition problem** or an **execution problem**?" If the DAG shape looks odd, it is a definition problem (references, `depends_on`); if the shape is right but only a specific step dies, it is a problem with the work that step runs (permissions, data, container). The former shows up right away if you extract the JSON with `pipeline.definition()`.

Tomorrow we cover the Model Registry, which manages the models this pipeline registers as versions and connects them to deployment through approval.

## 📖 Glossary

- **SageMaker Pipelines**: SageMaker's built-in workflow service that bundles ML tasks into steps and runs them automatically in order.
- **DAG (directed acyclic graph)**: A task graph whose execution order has a direction and which has no loops that return to an earlier point. The standard model for expressing workflows.
- **Step**: One cell of work that makes up a pipeline. Types are fixed per kind of work, such as preprocessing, training, evaluation, and registration.
- **properties reference**: Writing the output location of an earlier step as the input of a later step. This alone decides the execution order automatically.
- **Parameter**: A variable whose value is left empty at definition time and filled in at execution time. It lets the same pipeline run differently per environment.
- **ConditionStep**: A branching step that compares an evaluation metric to a threshold to decide whether later steps run.
- **PropertyFile**: A declaration that registers the JSON produced by the evaluation step so the pipeline can read it. `JsonGet` extracts values through it.
- **FailStep**: A step that explicitly ends the pipeline in a failed state. Used when you do not want an unmet condition to pass silently.
- **PipelineSession**: A session for defining pipelines. It makes training calls get captured only as step arguments instead of running immediately.
- **Step caching (CacheConfig)**: A feature that reuses the previous execution result and skips the step when the inputs and settings are the same. It saves time and cost.

## 📝 Practice Questions

**Question 1.** A data science team wants to automate, reproducibly within SageMaker, preprocessing → training → evaluation → (if accuracy meets the threshold) model registration. What is the most suitable service?

A) AWS Glue workflows  
B) SageMaker Pipelines  
C) Amazon EMR Steps  
D) SageMaker Ground Truth  

**Answer: B**  
Explanation: Pipelines is the native service that chains ML steps into a DAG within SageMaker and orchestrates them reproducibly. A and C are for ETL/big data processing, and D is a data labeling service unrelated to workflow orchestration.

---

**Question 2.** In a SageMaker pipeline, you want to inject different values for the number of training instances, the training data path, and the accuracy threshold at execution time without modifying code each time. What should you use?

A) Hardcode environment variables in the container  
B) Pipeline Parameter (ParameterString/Integer/Float)  
C) Define a separate new pipeline for each step  
D) S3 bucket policy  

**Answer: B**  
Explanation: A Pipeline Parameter is a variable whose value can be injected at execution time and is overridden with `pipeline.start(parameters=...)`. It lets the same definition be reused across multiple environments. A harms reusability, C violates the DRY principle, and D is permission control and unrelated.

---

**Question 3.** You want to configure a pipeline so that the model is not registered if the model evaluation accuracy is below 0.85, and is registered in Model Registry if it is at or above that. Which step do you use?

A) TrainingStep  
B) ConditionStep  
C) TransformStep  
D) ProcessingStep  

**Answer: B**  
Explanation: ConditionStep compares the evaluation result (for example, accuracy read with JsonGet) against a threshold and branches into `if_steps`/`else_steps`, creating a quality gate. A is training, C is batch transform, and D is a preprocessing/evaluation job execution step, none of which has branching capability.

---

**Question 4.** In SageMaker Pipelines, what happens when the output S3 path of the preprocessing step is referenced as the input of the training step?

A) The two steps are always run in parallel  
B) SageMaker infers the data dependency and automatically creates the preprocessing → training execution order (a DAG edge)  
C) A circular reference error occurs  
D) It is ignored unless depends_on is specified manually  

**Answer: B**  
Explanation: When the `properties` output of one step is referenced as the input of the next step, SageMaker infers the dependency and determines the execution order automatically. A is wrong because steps with a dependency run sequentially, C is wrong because a DAG only disallows cycles and a normal reference is not an error, and D is wrong because the dependency is created automatically from the output reference alone.

---

**Question 5.** Which of the following is NOT considered an advantage of SageMaker Pipelines?

A) The workflow definition remains as code, ensuring reproducibility  
B) Lineage between data, code, parameters and the resulting model is tracked automatically  
C) You can visually view the DAG and execution status in SageMaker Studio  
D) It directly schedules an on-premises Spark cluster  

**Answer: D**  
Explanation: SageMaker Pipelines is a service that orchestrates AWS/SageMaker workloads and does not directly schedule on-premises Spark clusters (that kind of hybrid orchestration is the domain of MWAA/Airflow). A, B, and C are all actual core benefits of Pipelines.

---
