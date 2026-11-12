# Day 2 - MLOps: SageMaker Pipelines, Model Registry, CI/CD

Yesterday I said drift detection must trigger retraining. If retraining is manual, operations break. MLOps means defining data processing → training → evaluation → registration → deployment in code to make them repeatable and traceable. Today we cover defining workflows with SageMaker Pipelines, managing model versions with Model Registry, and automating deployment with CI/CD.

## The Problem MLOps Solves

Manual ML: run a model once in a notebook, deploy from console by hand. Unrepeatable, untraceable, non-collaborative. MLOps solves this three ways:

```text
- Reproducibility: same code + data → same result (pipeline definition)
- Governance: which model trained on what data, who approved (Model Registry)
- Automation: commits/events trigger training·deployment (CI/CD)
```

## SageMaker Pipelines: ML Workflows as DAG

SageMaker Pipelines connect Steps into a Directed Acyclic Graph (DAG). Each step composes processing, training, evaluation, conditions, model registration, etc.

```python
from sagemaker.workflow.pipeline import Pipeline
from sagemaker.workflow.steps import ProcessingStep, TrainingStep
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo

step_process = ProcessingStep(name="Preprocess", processor=sklearn_proc, ...)
step_train   = TrainingStep(name="Train", estimator=xgb, ...)
step_eval    = ProcessingStep(name="Evaluate", processor=eval_proc, ...)

# Register only if evaluation metric exceeds threshold
cond = ConditionGreaterThanOrEqualTo(
    left=JsonGet(step=step_eval, property_file=eval_report, json_path="metrics.auc.value"),
    right=0.80,
)
step_cond = ConditionStep(name="AUCThreshold", conditions=[cond],
                          if_steps=[step_register], else_steps=[])

pipeline = Pipeline(
    name="churn-pipeline",
    parameters=[input_data, model_approval_status],
    steps=[step_process, step_train, step_eval, step_cond],
)
pipeline.upsert(role_arn=role)
pipeline.start()
```

> 💡 **Related Theory**: ConditionStep is the heart of MLOps quality gates. Like "don't register if evaluation AUC < 0.80," it stops bad models from flowing automatically into production. On exams, "automate blocking deployment if model misses standard" maps to ConditionStep + Model Registry approval combo.

## Model Registry: Model Versions and Approval Governance

Trained models register as Model Packages in **Model Package Groups** by version. Each version starts in `PendingManualApproval` status and must be approved to become deployment-ready.

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
)
```

```text
churn-models (Model Package Group)
├── v1  Approved   (in production)
├── v2  Rejected   (evaluation failed)
└── v3  PendingManualApproval  (awaiting review)
```

Change approval status to `Approved`, and EventBridge can trigger deployment steps.

> 💡 **Related Theory**: Model Registry is the center of lineage, binding "which model artifact, from which training job/metrics/data?" It's the origin of audit and rollback; approval status (Approved/Rejected/Pending) is the switch for people or automation to enforce governance.

## SageMaker Projects and CI/CD

SageMaker Projects are MLOps templates that auto-provision two repos and pipelines.

```text
- ModelBuild repo → CodeCommit/Git push → CodePipeline → run SageMaker Pipeline → register model
- ModelDeploy repo → model approved event → CodePipeline → staging deploy → approval → production deploy
```

CodeBuild does build/test; CodePipeline orchestrates; CloudFormation deploys endpoint infra as IaC.

```yaml
# buildspec.yml excerpt (CodeBuild)
phases:
  build:
    commands:
      - python pipelines/run_pipeline.py --module-name pipelines.churn.pipeline
      - python -m pytest tests/    # code/data validation tests
```

## Deployment Strategies: Safe Release

Don't send new models to all traffic at once. SageMaker endpoints support gradual deployment.

| Strategy | Behavior | Use |
|------|------|------|
| **Blue/Green** | Spin up new fleet, switch all/canary | Default safe deploy |
| **Canary** | Send few traffic first, verify, expand | Minimize risk |
| **Linear** | Step-wise percentage increase | Gradual monitoring |
| **A/B (Production Variant)** | Split traffic between two models | Compare performance |

## Summary

MLOps makes ML repeatable, traceable, automated. SageMaker Pipelines define processing-training-evaluation-condition-registration steps as DAG, ConditionStep builds quality gates. Model Registry governs versions and approval status; SageMaker Projects automate safe releases with CodePipeline CI/CD and Blue/Green·Canary deployment.

Tomorrow: ML security that backs all these pipelines — IAM execution roles, VPC isolation, KMS encryption.

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
