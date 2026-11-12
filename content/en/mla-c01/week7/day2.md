# Day 2 - Model Registry & Model Governance: Model Package Groups, Approval Workflows, Version Management

Yesterday's pipeline-created models must be systematically stored somewhere and pass someone's approval before going to production. If we cannot answer "which data trained this model, what is its performance, who approved it, and which version is deployed now?", that is not MLOps—just a pile of files. **SageMaker Model Registry** is a model catalog and governance tool to answer those questions.

Today we cover Model Registry's essentials: **Model Package Groups, model version management, and approval status workflows**. MLA-C01 repeatedly asks about Model Registry in scenarios involving "tracking model versions, passing approval, connecting to deployment".

## What is Model Registry?

Model Registry is a service that registers and organizes trained models in a **version-managed catalog**. Like Git for code, models also need versions, metadata, and approval history.

The structure has two layers.

| Concept | Role |
|---------|------|
| Model Package Group | Container bundling models of same purpose (e.g., "fraud-detection-models") |
| Model Package (Version) | Individual version within group (1, 2, 3, ...) — each carries artifacts, metrics, approval status |

Each time you register a model to a group, **version auto-increments by 1**. Each version holds model artifacts (S3), inference container image, evaluation metrics, and approval status.

> 💡 **Related Theory**: Model Registry's core value is traceability and governance. In regulated industries (finance, healthcare), "production-deployed models must be auditable—exactly what is it and who approved it?". Registry connects model versions to SageMaker lineage, recording the entire data → training → model → deployment flow. On exams, keywords "model version tracking, approval, auditing" point to Model Registry.

## Creating Model Package Groups

First, create a group to hold models. A group represents "a lineage of models solving one problem".

```python
import boto3
sm = boto3.client("sagemaker")

# Create package group bundling models of same purpose
sm.create_model_package_group(
    ModelPackageGroupName="fraud-detection-models",
    ModelPackageGroupDescription="Fraud detection model version catalog",
)
```

## Registering Model Versions

When training finishes, registering a model to the group creates a new version (Model Package). On registration, attach evaluation metrics and initial approval status.

```python
# Attach evaluation metrics; start in manual-approval-pending status
model_metrics = {
    "ModelQuality": {
        "Statistics": {
            "ContentType": "application/json",
            "S3Uri": "s3://my-bucket/eval/metrics.json",
        }
    }
}

response = sm.create_model_package(
    ModelPackageGroupName="fraud-detection-models",
    ModelApprovalStatus="PendingManualApproval",   # Default status after registration
    InferenceSpecification={
        "Containers": [{
            "Image": "<inference-image-uri>",
            "ModelDataUrl": "s3://my-bucket/model/model.tar.gz",
        }],
        "SupportedContentTypes": ["text/csv"],
        "SupportedResponseMIMETypes": ["text/csv"],
    },
    ModelMetrics=model_metrics,
)
model_package_arn = response["ModelPackageArn"]
```

SageMaker Pipelines' `RegisterModel` step internally calls this API. Models auto-register from the pipeline's end.

```python
from sagemaker.workflow.step_collections import RegisterModel

# Step within pipeline to register model to Registry
step_register = RegisterModel(
    name="RegisterFraudModel",
    estimator=xgb_estimator,
    model_data=step_train.properties.ModelArtifacts.S3ModelArtifacts,
    content_types=["text/csv"],
    response_types=["text/csv"],
    inference_instances=["ml.m5.large"],
    transform_instances=["ml.m5.large"],
    model_package_group_name="fraud-detection-models",
    approval_status="PendingManualApproval",
    model_metrics=model_metrics,
)
```

## Approval Status Workflow

Each model version holds one of three approval states.

| Status | Meaning |
|--------|---------|
| PendingManualApproval | Registered, not yet approved (default) |
| Approved | Approved — deployment candidate |
| Rejected | Rejected — no deployment |

Typical governance flow: Pipeline registers model as `PendingManualApproval` → reviewer (or automated validation) checks metrics → changes to `Approved` → that approval event triggers deployment. Thus **approval status change itself becomes the deployment gate**.

```python
# After review, approve the model version
sm.update_model_package(
    ModelPackageArn=model_package_arn,
    ModelApprovalStatus="Approved",
    ApprovalDescription="Offline evaluation passed, approved for production",
)
```

Status change emits an **EventBridge event**. Receiving this, CodePipeline or Lambda auto-deploy the endpoint—that is tomorrow's CI/CD trigger cornerstone.

> 💡 **Related Theory**: Approval workflow clarifies "who bears responsibility for and gates production release". Even if automated evaluation passes, having a person click final `Approved` makes responsibility and control explicit (human-in-the-loop). Conversely, as confidence grows, `ConditionStep` can auto-approve. On exams, the flow "model approved → auto-deploy" hints at Model Registry approval → EventBridge → CodePipeline.

## Version Management and Model Lookup

Repeated registration to the same group accumulates versions. Query the most recent or approved version to select deployment target.

```python
# Query only approved (Approved) model versions in group, newest first
resp = sm.list_model_packages(
    ModelPackageGroupName="fraud-detection-models",
    ModelApprovalStatus="Approved",
    SortBy="CreationTime",
    SortOrder="Descending",
)
latest_approved = resp["ModelPackageSummaryList"][0]["ModelPackageArn"]
```

Using this ARN to create a model object and deploy to an endpoint completes the "always deploy latest approved version" pattern. Also, each version connects to SageMaker Lineage, so you can trace backwards which dataset, training job, and code produced that version.

## Summary

- Model Registry is a governance tool organizing models as version-managed catalog.
- Registering to Model Package Group (purpose-grouped bundle) auto-increments Model Package versions.
- Each version holds artifacts, inference image, evaluation metrics, and approval status.
- Approval status flows PendingManualApproval → Approved/Rejected; status change triggers deployment via EventBridge.
- "Model version tracking, approval, auditing, auto-deploy connection" → Model Registry is the answer.

---

## 📝 Practice Questions

**Question 1.** In SageMaker Model Registry, what is the top-level container that groups multiple versions of models for a single purpose, such as "fraud detection"?

A) Model Package (Version)  
B) Model Package Group  
C) Endpoint Config  
D) Training Job  

**Answer: B**  
Explanation: A Model Package Group is the container that groups model versions with the same purpose, and each individual version inside it is a Model Package. C is an endpoint deployment configuration and D is a training job, neither related to catalog grouping.

---

**Question 2.** When you register a new model in the same Model Package Group, what happens to the version number?

A) It is always fixed at 1  
B) It automatically increases by 1 with each registration  
C) The user must specify an arbitrary string  
D) It overwrites the previous version  

**Answer: B**  
Explanation: When you register a model in the same group, the version increases by 1 automatically and accumulates. A and D are the opposite of the concept of accumulating versions, and C is wrong because versions are assigned automatically by the system.

---

**Question 3.** Which option correctly pairs the default approval status a model version has right after registration with the status required for it to become a deployment target?

A) Approved → Rejected  
B) PendingManualApproval → Approved  
C) Rejected → PendingManualApproval  
D) Approved → PendingManualApproval  

**Answer: B**  
Explanation: Models are usually registered as PendingManualApproval and must become Approved after review to become a deployment target. In A, C, and D, the direction of the status transition does not match the governance flow.

---

**Question 4.** You want to detect when a model's approval status changes to Approved and automatically trigger an endpoint deployment pipeline. What is the most appropriate connection?

A) Approval status change → EventBridge event → CodePipeline/Lambda deployment  
B) Approval status change → automatic deployment with S3 versioning alone  
C) Approval status change → CloudFront cache invalidation  
D) Approval status change → run an Athena query  

**Answer: A**  
Explanation: An approval status change emits an EventBridge event, and having CodePipeline or Lambda receive it to automate deployment is the standard CI/CD trigger pattern. B, C, and D have no direct relation to a deployment trigger.

---

**Question 5.** In a regulated industry, you must be able to audit "which data and training job the model deployed to production came from and who approved it." How does Model Registry support this?

A) It only encrypts model artifacts  
B) It stores metrics and approval history in each model version and links to SageMaker Lineage to provide traceability  
C) It registers the model in a new group every time  
D) It deletes only approved models  

**Answer: B**  
Explanation: Model Registry keeps per-version metrics and approval history and links to SageMaker Lineage to provide traceability and governance from data → training → model → deployment. A is only part of security and unrelated to traceability, and C and D run counter to the governance goal.

---
