# Day 2 - MLOps: SageMaker Pipelines, Model Registry, CI/CD

## 📌 Key Takeaways

- Even if you detect drift, **operations fall apart when retraining is manual.** MLOps means defining processing → training → evaluation → registration → deployment as code so that it is repeatable and traceable.
- **SageMaker Pipelines** links Steps into a **DAG**. Steps come in kinds such as Processing, Training, Tuning, Condition, RegisterModel, and Transform.
- **ConditionStep** is the quality gate. "If the evaluation AUC is below the threshold, do not register" prevents a bad model from being promoted automatically.
- **Model Registry** manages versions, approval status, and lineage. A model is registered as `PendingManualApproval`, and only once approved does it become `Approved`, which lets deployment automation continue.
- **SageMaker Projects** automatically provisions two repositories (ModelBuild and ModelDeploy) plus a CodePipeline CI/CD flow, and deploys safely with Blue/Green, Canary, Linear, and Shadow strategies.

## The 3 Problems MLOps Solves

Running a model once in a notebook and deploying it by hand from the console gives you no reproducibility, no traceability, and no collaboration.

| Problem | What happens in manual ML | MLOps solution | AWS components |
|---|---|---|---|
| **Reproducibility** | "How did we build that model last month?" — nobody knows | Fix the workflow as code so the same code + the same data → the same result | SageMaker Pipelines |
| **Governance** | There is no record of which data was used for training or who approved it | Accumulate versions, metrics, approval status, and lineage in one place | Model Registry, Lineage |
| **Automation** | Retraining and deployment depend on people, so they are delayed and error-prone | Commits and events trigger training and deployment | Projects, CodePipeline, EventBridge |

> 💡 **Concept**: The three problems are not independent. Without reproducibility, governance records are meaningless, and without governance gates, automation just deploys bad models faster. **Automation is safe only when the gates are already in place.**

## SageMaker Pipelines: ML Workflows as a DAG

Pipelines connects Steps into a directed acyclic graph (DAG). A dependency between Steps is created automatically when **one Step's output (`properties`) is referenced as another Step's input**.

### Main Step Types

| Step | What it does | Typical use |
|---|---|---|
| `ProcessingStep` | Runs a Processing Job | Preprocessing, feature engineering, **model evaluation** |
| `TrainingStep` | Runs a Training Job | Model training |
| `TuningStep` | Runs a Hyperparameter Tuning Job | Searching for the best hyperparameters |
| `TransformStep` | Runs a Batch Transform | Large-scale offline inference |
| `CreateModelStep` | Creates a Model object from the training artifacts | Preparing for deployment or batch transform |
| `RegisterModel` (step collection) | Registers a model package in Model Registry | Version management and entry into the approval gate |
| `ConditionStep` | Conditional branching (`if_steps`/`else_steps`) | **Quality gate** |
| `FailStep` | Explicitly fails the pipeline | Marks the run as stopped when criteria are not met |
| `LambdaStep` | Invokes a Lambda function | Short custom logic, notifications, external APIs |
| `CallbackStep` | Hands off to an external system via SQS and waits for a response | Human review, integration with in-house systems |
| `QualityCheckStep` / `ClarifyCheckStep` | Checks quality and bias baselines | Preventing drift and fairness regressions |
| `EMRStep` | Runs a Spark job on EMR | Large-scale distributed preprocessing |

### Pipeline DAG

```text
[ParameterString input_data]
        │
        ▼
 ┌───────────────┐    ┌──────────────┐    ┌────────────────┐
 │ ProcessingStep│──▶ │ TrainingStep │──▶ │ ProcessingStep │
 │  "Preprocess" │    │   "Train"    │    │   "Evaluate"   │
 └───────────────┘    └──────────────┘    └────────┬───────┘
   train/val/test        model.tar.gz        evaluation.json
                                                   │
                                                   ▼
                                        ┌──────────────────────┐
                                        │  ConditionStep       │
                                        │  AUC >= 0.80 ?       │
                                        └───┬──────────────┬───┘
                                    if_steps│              │else_steps
                                            ▼              ▼
                                   ┌─────────────┐   ┌───────────┐
                                   │RegisterModel│   │ FailStep  │
                                   └──────┬──────┘   └───────────┘
                                          ▼
                        [Model Registry] PendingManualApproval
                                          │ approve (Approved)
                                          ▼
                      [EventBridge] ─▶ [ModelDeploy CodePipeline] ─▶ endpoint
```

### Definition Code

```python
from sagemaker.workflow.pipeline import Pipeline
from sagemaker.workflow.steps import ProcessingStep, TrainingStep
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo
from sagemaker.workflow.functions import JsonGet
from sagemaker.workflow.parameters import ParameterString, ParameterFloat

input_data   = ParameterString(name="InputData", default_value="s3://bucket/raw/")
auc_threshold = ParameterFloat(name="AucThreshold", default_value=0.80)

step_process = ProcessingStep(name="Preprocess", processor=sklearn_proc, ...)
step_train   = TrainingStep(name="Train", estimator=xgb, ...)
step_eval    = ProcessingStep(name="Evaluate", processor=eval_proc,
                              property_files=[eval_report], ...)

# Register only when the evaluation metric is at or above the threshold
cond = ConditionGreaterThanOrEqualTo(
    left=JsonGet(step_name=step_eval.name, property_file=eval_report,
                 json_path="metrics.auc.value"),
    right=auc_threshold,
)
step_cond = ConditionStep(name="AUCThreshold", conditions=[cond],
                          if_steps=[step_register], else_steps=[step_fail])

pipeline = Pipeline(
    name="churn-pipeline",
    parameters=[input_data, auc_threshold],
    steps=[step_process, step_train, step_eval, step_cond],
)
pipeline.upsert(role_arn=role)
pipeline.start()
```

| Condition class | What it checks |
|---|---|
| `ConditionGreaterThanOrEqualTo` / `ConditionLessThanOrEqualTo` | Whether the metric is at or above / at or below the threshold |
| `ConditionEquals` / `ConditionIn` | Whether the value matches / is in the allowed list |
| `ConditionNot` / `ConditionOr` | Negating a condition / combining several conditions |

- **Parameterization**: `ParameterString`, `ParameterInteger`, and `ParameterFloat` inject input paths, thresholds, and instance types at execution time. You can re-run without changing code.
- **Caching**: Attaching `CacheConfig(enable_caching=True, expire_after="30d")` to a Step skips re-running a Step with identical input, saving time and cost.
- **Passing evaluation metrics**: Declare the JSON written by the evaluation Step as a `PropertyFile`, read a specific path with `JsonGet`, and feed it into the condition.

ConditionStep is the heart of the MLOps quality gate. As in "if the evaluation AUC is below 0.80, do not register," it keeps a bad model from flowing into production automatically. On the exam, a stem such as **"automatically block deployment of a model that does not meet the criteria"** maps to the combination of ConditionStep + the Model Registry approval gate.

## Model Registry: Versions and Approval Governance

A trained model is registered in a **Model Package Group** as a version (Model Package).

```python
from sagemaker.workflow.step_collections import RegisterModel

step_register = RegisterModel(
    name="RegisterModel",
    estimator=xgb,
    model_data=step_train.properties.ModelArtifacts.S3ModelArtifacts,
    content_types=["text/csv"], response_types=["text/csv"],
    inference_instances=["ml.m5.large"],
    transform_instances=["ml.m5.large"],
    model_package_group_name="churn-models",
    approval_status="PendingManualApproval",   # approval gate
    model_metrics=model_metrics,               # attach evaluation metrics to the version
)
```

```text
churn-models (Model Package Group)
├── v1  Approved                (in production)
├── v2  Rejected                (did not meet evaluation criteria)
└── v3  PendingManualApproval   (awaiting review)
```

### Approval State Transitions

| Transition | Trigger | Result |
|---|---|---|
| (new registration) → `PendingManualApproval` | Default setting of `RegisterModel` | Not a deployment target. Awaiting review |
| `PendingManualApproval` → `Approved` | Approval by the owner or an automatic rule | A **Model Package State Change** event fires → triggers the deployment pipeline |
| `PendingManualApproval` → `Rejected` | Metrics not met or a risk judgment | Not deployed; only a record remains |
| `Approved` → `Rejected` | A problem is found in production | Blocks new deployments. Roll back to the previous Approved version |
| `Rejected` → `Approved` | Re-review or issue resolved | Becomes deployable again |

- The status is changed with the `UpdateModelPackage` API (or the Studio UI). Because the status change itself becomes an event, **approval is the deployment trigger**.
- A pipeline can register directly with `approval_status="Approved"`, but that removes human review, so it is not recommended in regulated environments.

### Lineage and Rollback

```text
[Dataset S3] ─▶ [Processing Job] ─▶ [Training Job] ─▶ [Model Package v3]
   Artifact          Action             Action            Artifact
      └──────── Tracked end to end through Associations (links) ────────┘

Rollback: v3 → Rejected , v1 → Approved  ─▶ ModelDeploy redeploys v1
```

- Lineage Tracking automatically links data, processing, training, and models using Artifacts/Actions/Contexts and Associations. This lets you answer "which data was the model that produced this prediction trained on, and who approved its deployment?"

Model Registry is the center of lineage, tying together "which model artifact came from which training job, metrics, and data." The approval status (Approved/Rejected/Pending) is the switch with which a person or automation enforces governance, and a rollback is done not as a new deployment but as a **redeployment of the previous Approved version**.

## SageMaker Projects and CI/CD

SageMaker Projects is an MLOps template that **automatically provisions two repositories and the pipelines**.

```text
┌──── ModelBuild repo (pipelines/ , tests/) ────┐
│ git push ─▶ CodePipeline ─▶ CodeBuild         │
│                └─▶ SageMaker Pipeline run      │
│                       └─▶ Model Registry entry │
└───────────────────────────────────────────────┘
                 │ approval (Approved) event
                 ▼
┌──── ModelDeploy repo (CloudFormation templates) ──┐
│ EventBridge ─▶ CodePipeline                       │
│     ├─▶ Deploy Staging endpoint                   │
│     ├─▶ Manual approval stage                     │
│     └─▶ Deploy Production endpoint                │
└───────────────────────────────────────────────────┘
```

| Service | Role | What it does in this flow |
|---|---|---|
| **CodeCommit / Git** | Source repository | Version control for the pipeline definition and deployment templates |
| **CodeBuild** | Runs builds and tests | Runs the pipeline definition, unit and data validation tests |
| **CodePipeline** | Orchestration | Connects source → build → deploy stages and inserts manual approval stages |
| **CloudFormation** | IaC deployment | Creates and updates endpoints and endpoint configurations as code |
| **EventBridge** | Event routing | Receives the model approval event and starts the ModelDeploy pipeline |
| **Model Registry** | Governance | Controls whether to deploy through the approval status |

```yaml
# buildspec.yml excerpt (CodeBuild)
phases:
  build:
    commands:
      - python pipelines/run_pipeline.py --module-name pipelines.churn.pipeline
      - python -m pytest tests/    # code and data validation tests
```

> ⚠️ **Pitfall**: Attaching CI/CD does not create a gate. You need **three layers of gates** in place for automation to be safe: ConditionStep (model quality), Model Registry approval (a person or policy), and Staging validation.

## Comparing Deployment Strategies

You do not send a new model to all traffic at once. SageMaker endpoints support gradual deployment.

| Strategy | Traffic flow | Rollback speed | User impact | When to use |
|---|---|---|---|---|
| **Blue/Green (All-at-once)** | Prepare a new fleet, then switch 100% at once | Fast (the old fleet is kept for a baking period) | **All users** if there is a problem | The default safe deployment. When the change is already validated |
| **Canary** | Only a small share (e.g., 10%) goes to the new fleet → switch after validation | Very fast (only a few are reverted) | **A few users** only | When minimizing risk is the top priority |
| **Linear** | Increase by a fixed percentage over several steps | Fast (stop the step and revert) | Grows gradually per step | When you move on after checking metrics at each step |
| **Rolling** | Replace instances sequentially in batches | Medium (revert the progress made) | Users on the batch that was replaced | Replacing a large fleet cost-efficiently |
| **Shadow** | **Copies** production traffic to the new model and discards its responses | Immediate (not live use) | **None** | When you only want pre-validation with real traffic |
| **A/B (Production Variant)** | Distributes traffic by weight across variants on one endpoint | Immediate by adjusting weights | Different models for different groups | When you want to compare the performance of two models in practice |

- Blue/Green, Canary, Linear, and Rolling are **endpoint update methods**, while A/B and Shadow are **simultaneous operation and comparison methods**. Their purposes differ.
- In the deployment configuration, **attach CloudWatch alarms for automatic rollback**. If the error rate or latency exceeds the threshold, the endpoint reverts to the previous configuration.

## Stem Clue → Answer Mapping

| Stem clue | Answer to choose | Why |
|---|---|---|
| "If the evaluation metric does not meet the criteria, do not register and stop" | **ConditionStep** (+`FailStep`) | A quality gate that compares the metric to a threshold and branches |
| "Track which model was trained on which data, with fast rollback" | **Model Registry** (+Lineage) | Manages versions, approval status, and lineage |
| "What is the default approval status of a newly registered model?" | **PendingManualApproval** | Not a deployment target until reviewed |
| "When approved, the deployment pipeline must run automatically" | **EventBridge → CodePipeline** | Routes the model package state change event |
| "Set up build and deploy repos and CI/CD from a template at once" | **SageMaker Projects** | Automatic ModelBuild/ModelDeploy provisioning + IaC deployment |
| "Validate with a small amount of traffic first, then expand" | **Canary** | Gradual switchover that minimizes exposure |
| "Compare the performance of two models with real traffic" | **A/B (Production Variant) weighted distribution** | Serve and compare simultaneously on one endpoint |
| "Pre-validate with real traffic without affecting users" | **Shadow deployment** | Copies traffic and does not return the responses |
| "It is wasteful to re-run the same preprocessing Step every time" | **Step caching with `CacheConfig`** | Skips re-running a Step with identical input |
| "Reuse by changing input paths and thresholds on each run" | **Pipeline Parameters** | Injected at execution time without editing the definition |
| "Manual deployment from a notebook is enough" | **Wrong answer choice** | Breaks reproducibility and governance |

## Pipeline Review Checklist

- [ ] Is the evaluation Step's metric connected to the condition through `PropertyFile` and `JsonGet`?
- [ ] Is the ConditionStep's `else_steps` non-empty and does it explicitly signal failure?
- [ ] Does the approval status at registration match the organization's policy (manual/automatic)?
- [ ] Is a CloudWatch alarm for automatic rollback attached to the deployment strategy?

In the next post, we cover **ML security**, which underpins all of these pipelines: IAM execution roles, VPC isolation, and KMS encryption.

## 📖 Glossary

- **MLOps**: An operating approach that ties data processing, training, evaluation, registration, and deployment together with code and automation so that they are repeatable and traceable.
- **DAG (directed acyclic graph)**: A structure in which Steps are connected by arrows and there are no cycles. It defines what runs before what.
- **Step**: The smallest execution unit of a pipeline. Its types are fixed, such as processing, training, tuning, condition, and registration.
- **ConditionStep**: A Step that compares a value such as an evaluation metric against a condition and splits the execution path. It is the core of the quality gate.
- **PropertyFile / JsonGet**: The mechanism that pulls a specific metric value out of the JSON result left by an evaluation Step and feeds it into a condition.
- **Model Package Group**: A box that collects model versions for the same purpose. Versions v1, v2, … accumulate inside it.
- **PendingManualApproval**: The default approval status of a new model version. Until it passes review and becomes Approved, it is not a deployment target.
- **Lineage**: The chain of linked records running from data → processing → training → model. It is the basis for auditing, reproduction, and rollback.
- **SageMaker Projects**: An MLOps template that creates the ModelBuild/ModelDeploy repositories and the CI/CD pipelines in one go.
- **Production Variant / Shadow deployment**: A Production Variant is the unit that splits weights within a single endpoint to serve multiple models at once, used for A/B comparison. Shadow deployment is a validation method that copies real traffic to the new model but does not return its responses to users.

---

## 📝 Practice Questions

**Question 1.** In a SageMaker Pipeline, you want to stop the pipeline without registering the model in the Model Registry if the trained model's validation AUC is below 0.75. Which component should you use?

A) A ProcessingStep alone is sufficient  
B) A ConditionStep that checks the evaluation metric and branches  
C) Data Capture configuration  
D) Multi-Model Endpoint  

**Answer: B**  
Explanation: ConditionStep is a quality gate that compares the evaluation step's metric against a threshold and branches on whether to run the registration step. ProcessingStep (A) only processes, Data Capture (C) is for monitoring, and MME (D) is multi-model hosting.

---

**Question 2.** A problem occurred with the production model, and you want to quickly roll back to a previous version and track "which model is currently trained on which data." Which SageMaker feature is MOST appropriate?

A) SageMaker Model Registry  
B) SageMaker Ground Truth  
C) SageMaker Feature Store  
D) SageMaker Data Wrangler  

**Answer: A**  
Explanation: Model Registry manages models by version, approval status, and lineage, enabling rollback and tracking. Ground Truth (B) is for labeling, Feature Store (C) is for feature management, and Data Wrangler (D) is a data preparation tool.

---

**Question 3.** You want to release a new model to production by first sending only a small amount of real traffic to confirm there are no problems, and then gradually increasing the share. Which deployment strategy is MOST appropriate?

A) Switch all traffic immediately  
B) Canary deployment  
C) Offline batch transform  
D) Delete the model and recreate it  

**Answer: B**  
Explanation: Canary deployment minimizes risk by validating with a small amount of traffic first and then expanding. Immediate switching (A) is risky, batch transform (C) is unrelated to real-time traffic, and deleting and recreating (D) causes a loss of availability.

---

**Question 4.** What is the MOST accurate description of the core value of the MLOps templates provided by SageMaker Projects?

A) It automatically increases the accuracy of the training algorithm  
B) It automatically provisions ModelBuild/ModelDeploy repositories and a CI/CD pipeline  
C) It reduces data labeling costs to zero  
D) It provides GPU instances for free  

**Answer: B**  
Explanation: SageMaker Projects uses templates to automatically set up build and deploy repositories, CodePipeline-based CI/CD, and IaC deployment. Automatic accuracy improvement (A), free labeling (C), and free GPUs (D) are not features it provides.

---

**Question 5.** What is the typical default approval status of a newly registered model version in the Model Registry, and what does it mean?

A) Approved — deployed automatically right away  
B) Rejected — cannot be used  
C) PendingManualApproval — not eligible for deployment until reviewed and approved  
D) Deleted — only archived  

**Answer: C**  
Explanation: Setting PendingManualApproval at registration enforces governance, because the model must be reviewed and become Approved before deployment automation proceeds. Approved (A) is the status after approval, Rejected (B) is the status after rejection, and Deleted (D) is not a default value.

---
