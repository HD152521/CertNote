# Day 2 - Model Registry & Model Governance: Model Package Groups, Approval Workflows, Version Management

## 📌 Key Takeaways

- **Model Registry** is a governance tool that registers and tracks trained models in a version-managed catalog.
- The structure has two layers — inside a **Model Package Group** (a bundle per purpose), the **Model Package version increases by 1 automatically** each time you register.
- Each version holds the **model artifact, inference container image, evaluation metrics, and approval status** together.
- Approval status is **PendingManualApproval → Approved / Rejected**. The status change itself is the **gate for deployment**.
- An approval status change raises an **EventBridge event**, which leads to automatic deployment through CodePipeline or Lambda.

## What Is Model Registry?

The models that yesterday's pipeline produced must be stored systematically and pass through approval before moving to production. If you cannot answer "which data was this model trained on, what is its performance, who approved it, and which version is deployed right now?", that is not MLOps, just a pile of files.

- A service that registers and organizes trained models in a **version-managed catalog**.
- The idea is that just as code has Git, models need versions, metadata, and approval history.
- The structure has two layers.

| Concept | Role |
|------|------|
| **Model Package Group** | A container that bundles models of the same purpose (for example, "fraud-detection-models") |
| **Model Package (Version)** | An individual version inside the group (1, 2, 3...) — each has its own artifact, metrics, and approval status |

- Each time you register a model inside a group, the **version increases by 1 automatically**. The user does not assign the number.
- What each version holds: the model artifact (`model.tar.gz` in S3), the inference container image URI, evaluation metrics, approval status, and a description.

| Comparison axis | Just storing the model in S3 | Model Registry |
|---------|---------------------|----------------|
| Version | Depends on file name and path conventions (human error) | Assigned automatically by the system |
| Metrics | Managed separately as a different file | Attached to the version |
| Approval | None (documents or verbal agreement) | Stated explicitly as a status value, with history kept |
| Link to deployment | Manual | Approval event → automatic trigger |
| Audit | Hard to trace | Traced backward through links to Lineage |

> 💡 **Related theory**: The core value of Model Registry is traceability and governance. In regulated industries (finance, healthcare), you must be able to audit "exactly what the model deployed to production is and who approved it." Registry links the model version to SageMaker lineage and leaves a record of the whole data → training → model → deployment process. In the exam, the keywords "model version tracking, approval, auditing" mean Model Registry.

## Creating a Model Package Group

First, create a group to hold the models. A group usually means "a family of models that solve one problem."

```python
import boto3
sm = boto3.client("sagemaker")

# Create a package group that bundles models of the same purpose
sm.create_model_package_group(
    ModelPackageGroupName="fraud-detection-models",
    ModelPackageGroupDescription="Version catalog of fraud detection models",
)
```

- The principle is to split groups by problem. "Fraud detection" and "churn prediction" should be different groups for the version numbers to mean anything.
- Experiments on the same problem that only swap the algorithm are better kept as **different versions of the same group**, which helps with comparison and rollback.

## Registering a Model Version

When you register a trained model into the group, a new version (Model Package) is created. At registration you can record the evaluation metrics and the initial approval status together.

```python
# Attach the evaluation metrics and register with an initial status of pending manual approval
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
    ModelApprovalStatus="PendingManualApproval",   # Default status right after registration
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

The `RegisterModel` step of SageMaker Pipelines also calls this API internally. In other words, the structure is that a version is registered automatically at the end of the pipeline.

```python
from sagemaker.workflow.step_collections import RegisterModel

# A step that registers the model in the Registry inside the pipeline
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

- `inference_instances` / `transform_instances` declare "which instance types this model version can be deployed or transformed on."
- If you attach `model_metrics`, reviewers can compare the performance of each version side by side in Studio. Without it, the basis for the approval decision is gone.

## Approval Status Workflow

Each model version has one of three approval states.

| Status | Meaning | Next action |
|------|------|-----------|
| **PendingManualApproval** | Registered, not yet approved (default) | Waiting for review |
| **Approved** | Approved — a deployment target | EventBridge event → deployment trigger |
| **Rejected** | Rejected — cannot be deployed | Flow ends. Retrain after analyzing the cause |

```text
    [Pipeline RegisterModel]
              │
              ▼
   ┌────────────────────────┐
   │ PendingManualApproval  │  ← default status right after registration
   └───────┬────────────┬───┘
 review    │            │  review
 passed    ▼            ▼  failed
   ┌──────────────┐  ┌──────────┐
   │  Approved    │  │ Rejected │
   └──────┬───────┘  └──────────┘
          │                │
          │                └──▶ (no deployment · retrain, then register a new version)
          ▼
   EventBridge "SageMaker Model Package State Change"
          │
          ▼
   CodePipeline(Deploy) → staging → manual approval → production
```

- Typical flow: the pipeline registers as `PendingManualApproval` → a reviewer (or automated validation) checks the metrics → changes to `Approved` → that event triggers deployment.
- In other words, **the approval status change itself is the gate for deployment**.
- `Rejected` is not a state you revert from; it is a record that "this version will not be used." If you fixed the problem, the proper way is to **register a new version**.

```python
# After review, approve the model version
sm.update_model_package(
    ModelPackageArn=model_package_arn,
    ModelApprovalStatus="Approved",
    ApprovalDescription="Passed offline evaluation, approved for production",
)
```

An approval status change raises an **EventBridge event**. Connecting it so that CodePipeline or Lambda receives it and deploys the endpoint automatically is the core trigger of the CI/CD we cover tomorrow.

The approval workflow makes explicit "who takes responsibility for sending a model to production." Even if the automatic evaluation passes, having a person press the final `Approved` makes accountability and control clear (human-in-the-loop). Conversely, once trust builds up, you can go as far as automatic approval with a ConditionStep. When the exam presents a flow of "automatic deployment when a model is approved," the answer is Model Registry approval → EventBridge → CodePipeline.

> ⚠️ **Trap**: If you hardcode `approval_status="Approved"` at the registration step, deployment rolls straight on without any human review. If there is a requirement that "it passed the quality gate but a person must check once more," you must register it as `PendingManualApproval`. Conversely, if you want a fully automatic retraining loop, automatic approval is the answer — read the direction of the requirement first.

## Version Management and Model Lookup

Repeated registration into the same group accumulates versions. You can query the most recent or the approved version to choose the deployment target.

```python
# Query only the Approved model versions in the group, newest first
resp = sm.list_model_packages(
    ModelPackageGroupName="fraud-detection-models",
    ModelApprovalStatus="Approved",
    SortBy="CreationTime",
    SortOrder="Descending",
)
latest_approved = resp["ModelPackageSummaryList"][0]["ModelPackageArn"]
```

- Creating a model object from this ARN and deploying it to an endpoint completes the "always deploy the latest approved version" pattern.
- Each version is linked to SageMaker Lineage, so you can trace backward which dataset, training job, and code that version came from.
- Check the details of a specific version (metrics, container, approval description) with `describe_model_package`.

```python
detail = sm.describe_model_package(ModelPackageName=latest_approved)
print(detail["ModelApprovalStatus"])        # Approved
print(detail["ModelPackageVersion"])        # Version number
print(detail["InferenceSpecification"])     # Inference image and artifact
```

Rollback is not a separate feature but **redeploying with a previous version's ARN**. It is possible only because the versions remain, and this is one of the practical reasons to use the Registry.

## Between Manual and Automatic Approval

Whether a person presses the approval or the pipeline presses it for them depends on the organization's level of trust. The exam drops hints about this direction in the requirement sentence.

| Comparison axis | Manual approval (human-in-the-loop) | Automatic approval |
|---------|------------------------------|-----------|
| Status at registration | `PendingManualApproval` | Straight to `Approved` when the condition passes |
| Basis for the decision | A reviewer checks the metrics and reports by eye | Threshold comparison in a ConditionStep |
| Speed | As slow as the human wait | Connects all the way to immediate deployment |
| Accountability | The approver clearly remains on record | Delegated to the rule that set the threshold |
| Suitable situation | Regulated industries, early adoption, high-impact models | Frequent retraining, low-risk models |
| Signal in the requirement sentence | "after review," "for audit," "confirmed by the person in charge" | "fully automatic," "nightly retraining," "without human intervention" |

- The two approaches are not mutually exclusive. A common compromise is to leave the Registry approval automatic and keep a **CodePipeline manual approval just before production**.
- Even when you use automatic approval, leaving the basis (which metric was how much) in `ApprovalDescription` lets you respond to audits later.

```python
# Changing the approval status while leaving the evaluation result as the basis
sm.update_model_package(
    ModelPackageArn=model_package_arn,
    ModelApprovalStatus="Approved",
    ApprovalDescription="AUC 0.91 (above the 0.88 threshold), passed nightly automated validation",
)
```

## When Governance Goes Wrong: Symptom → Cause → Action

| Symptom | Common cause | Action |
|------|-----------|------|
| Deployment does not start after approval | No EventBridge rule or the pattern does not match, target not connected | Check the event pattern (`ModelApprovalStatus: ["Approved"]`) and the target |
| The version keeps coming out as 1 | Registering with a new group name every time | Register with the same `ModelPackageGroupName` |
| You cannot compare performance on the approval screen | `ModelMetrics` was not attached at registration | Attach the evaluation result S3 path as metrics when registering |
| It went straight to production without human review | The status was set to `Approved` at registration | Change the pipeline to register as `PendingManualApproval` |
| You cannot show where the deployed model came from | A manual registration that broke the lineage link | Register through the pipeline's `RegisterModel` to preserve Lineage |
| The register/approve API returns `AccessDenied` | The execution role lacks Registry-related permissions | Grant the role permission to create and update model packages |
| You want to undo a wrongly approved version | Rejected does not automatically roll back a deployment | Redeploy the previous good version's ARN (rollback), then clean up the status |

The Registry is not "a place that stores models" but **"a place that declares the state of models."** The artifact itself still lives in S3, and what the Registry manages is the metadata attached to that artifact: version, metrics, and approval. That is why changing a single approval status can set the whole deployment pipeline in motion.

Tomorrow we cover the CI/CD that receives this approval event and actually runs the deployment — SageMaker Projects and CodePipeline/CodeBuild.

## 📖 Glossary

- **Model Registry**: A model catalog that organizes trained models together with versions, metrics, and approval status.
- **Model Package Group**: A box that holds model versions of the same purpose. Usually one is created per "one problem."
- **Model Package (version)**: An individual model version inside a group. The number goes up by one automatically on each registration.
- **Approval Status**: A value indicating whether that version may be deployed. Three values: PendingManualApproval / Approved / Rejected.
- **ModelMetrics**: Evaluation results attached at registration. They are the basis on which reviewers compare performance between versions.
- **InferenceSpecification**: A specification that states which inference image and artifact this model runs with, and in what input and output formats.
- **RegisterModel step**: A step that automatically registers the model in the Registry at the end of a pipeline. It calls the registration API internally.
- **Lineage**: Linked records kept so you can trace back which data, training job, and code this model came from.
- **Governance**: A system that makes it possible to control and prove who approved what and sent it to production.
- **Rollback**: Reverting by redeploying a previously approved version's ARN when a problem occurs.

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
