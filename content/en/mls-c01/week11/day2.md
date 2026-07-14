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

## 📝 연습 문제

**문제 1.** SageMaker Pipeline에서 학습된 모델의 검증 AUC가 0.75 미만이면 Model Registry에 등록하지 않고 파이프라인을 중단하고 싶다. 사용해야 할 구성 요소는?

A) ProcessingStep만으로 충분  
B) ConditionStep으로 평가 지표를 검사해 분기  
C) Data Capture 설정  
D) Multi-Model Endpoint  

**정답: B**  
해설: ConditionStep은 평가 단계의 지표를 임계값과 비교해 등록 단계를 실행할지 분기하는 품질 게이트다. ProcessingStep(A)은 처리만, Data Capture(C)는 모니터링, MME(D)는 다중 모델 호스팅이다.

---

**문제 2.** 운영 모델에 문제가 생겨 이전 버전으로 빠르게 되돌리고, "현재 어떤 모델이 어떤 데이터로 학습됐는지" 추적하려 한다. 가장 적합한 SageMaker 기능은?

A) SageMaker Model Registry  
B) SageMaker Ground Truth  
C) SageMaker Feature Store  
D) SageMaker Data Wrangler  

**정답: A**  
해설: Model Registry는 모델을 버전·승인 상태·계보(lineage)로 관리해 롤백과 추적을 가능하게 한다. Ground Truth(B)는 라벨링, Feature Store(C)는 피처 관리, Data Wrangler(D)는 데이터 준비 도구다.

---

**문제 3.** 새 모델을 프로덕션에 출시하되 처음에는 소량의 실제 트래픽만 보내 문제가 없는지 확인한 뒤 점차 비중을 늘리려 한다. 가장 적합한 배포 전략은?

A) 전체 트래픽 즉시 전환  
B) Canary 배포  
C) 오프라인 배치 변환  
D) 모델 삭제 후 재생성  

**정답: B**  
해설: Canary 배포는 소수 트래픽으로 먼저 검증한 뒤 확대해 위험을 최소화한다. 즉시 전환(A)은 위험, 배치 변환(C)은 실시간 트래픽과 무관, 삭제·재생성(D)은 가용성 손실을 낳는다.

---

**문제 4.** SageMaker Projects가 제공하는 MLOps 템플릿의 핵심 가치로 가장 정확한 것은?

A) 학습 알고리즘의 정확도를 자동으로 높여 준다  
B) ModelBuild/ModelDeploy 리포지토리와 CI/CD 파이프라인을 자동 프로비저닝한다  
C) 데이터 라벨링 비용을 0으로 만든다  
D) GPU 인스턴스를 무료로 제공한다  

**정답: B**  
해설: SageMaker Projects는 빌드·배포 리포와 CodePipeline 기반 CI/CD, IaC 배포를 템플릿으로 자동 구성한다. 정확도 자동 향상(A), 무료 라벨링(C), 무료 GPU(D)는 제공 기능이 아니다.

---

**문제 5.** Model Registry에 새로 등록된 모델 버전의 기본 승인 상태는 일반적으로 무엇이며, 그 의미는?

A) Approved — 즉시 자동 배포됨  
B) Rejected — 사용 불가  
C) PendingManualApproval — 검토·승인 전까지 배포 대상이 아님  
D) Deleted — 보관만 됨  

**정답: C**  
해설: 등록 시 PendingManualApproval로 두면 검토를 거쳐 Approved가 되어야 배포 자동화가 이어져 거버넌스를 강제한다. Approved(A)는 승인 후 상태, Rejected(B)는 거부 후, Deleted(D)는 존재하지 않는 기본값이다.

---
