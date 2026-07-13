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

## 📝 연습 문제

**문제 1.** SageMaker Model Registry에서 "사기 탐지"라는 한 가지 목적의 모델들을 여러 버전으로 묶어 관리하는 최상위 컨테이너는?

A) Model Package (Version)  
B) Model Package Group  
C) Endpoint Config  
D) Training Job  

**정답: B**  
해설: Model Package Group은 동일 목적의 모델 버전들을 묶는 컨테이너이고, 그 안의 개별 버전이 Model Package다. C는 엔드포인트 배포 구성, D는 학습 작업으로 카탈로그 묶음과 무관하다.

---

**문제 2.** 새 모델을 같은 Model Package Group에 등록할 때 버전 번호는 어떻게 되는가?

A) 항상 1로 고정된다  
B) 등록할 때마다 1씩 자동 증가한다  
C) 사용자가 직접 임의 문자열을 지정해야 한다  
D) 이전 버전을 덮어쓴다  

**정답: B**  
해설: 같은 그룹에 모델을 등록하면 버전이 1씩 자동 증가해 누적된다. A·D는 버전 누적 개념과 반대이고, C는 버전이 시스템에 의해 자동 부여되므로 틀리다.

---

**문제 3.** 모델 버전이 등록 직후 가지는 기본 승인 상태와, 배포 대상이 되기 위해 필요한 상태를 올바르게 짝지은 것은?

A) Approved → Rejected  
B) PendingManualApproval → Approved  
C) Rejected → PendingManualApproval  
D) Approved → PendingManualApproval  

**정답: B**  
해설: 모델은 보통 PendingManualApproval로 등록되고, 검토 후 Approved가 되어야 배포 대상이 된다. A·C·D는 상태 전이 방향이 거버넌스 흐름과 맞지 않는다.

---

**문제 4.** 모델 승인 상태가 Approved로 변경될 때 이를 감지해 자동으로 엔드포인트 배포 파이프라인을 트리거하려 한다. 가장 적절한 연결은?

A) 승인 상태 변경 → EventBridge 이벤트 → CodePipeline/Lambda 배포  
B) 승인 상태 변경 → S3 버전 관리만으로 자동 배포  
C) 승인 상태 변경 → CloudFront 캐시 무효화  
D) 승인 상태 변경 → Athena 쿼리 실행  

**정답: A**  
해설: 승인 상태 변경은 EventBridge 이벤트를 발생시키며, 이를 CodePipeline이나 Lambda가 받아 배포를 자동화하는 것이 표준 CI/CD 트리거 패턴이다. B·C·D는 배포 트리거와 직접 관련이 없다.

---

**문제 5.** 규제 산업에서 "프로덕션에 배포된 모델이 어떤 데이터·학습 작업에서 나왔고 누가 승인했는지" 감사할 수 있어야 한다. Model Registry가 이를 지원하는 방식은?

A) 모델 아티팩트를 암호화만 한다  
B) 각 모델 버전에 메트릭·승인 이력을 담고 SageMaker Lineage와 연결해 추적성을 제공한다  
C) 모델을 매번 새 그룹으로 등록한다  
D) 승인된 모델만 삭제한다  

**정답: B**  
해설: Model Registry는 버전별 메트릭·승인 이력을 보관하고 SageMaker Lineage와 연결해 데이터→학습→모델→배포의 추적성과 거버넌스를 제공한다. A는 보안의 일부일 뿐 추적성과 무관하고, C·D는 거버넌스 목적에 어긋난다.

---
