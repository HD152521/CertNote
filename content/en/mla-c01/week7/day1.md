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
