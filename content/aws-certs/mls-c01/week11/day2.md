# Day 2 - MLOps: SageMaker Pipelines, Model Registry, CI/CD

어제 드리프트가 감지되면 재학습으로 이어져야 한다고 했다. 그 "재학습으로 이어진다"를 손으로 하면 운영이 무너진다. MLOps는 데이터 처리→학습→평가→등록→배포를 코드로 정의해 반복 가능하고 추적 가능하게 만드는 일이다. 오늘은 SageMaker Pipelines로 워크플로를 정의하고, Model Registry로 모델을 버전 관리하며, CI/CD로 자동 배포하는 구조를 다룬다.

## MLOps가 푸는 문제

수동 ML은 노트북에서 한 번 돌린 모델을 사람이 콘솔에서 배포하는 식이다. 재현 불가, 추적 불가, 협업 불가다. MLOps는 이를 세 가지로 푼다.

```text
- 재현성(Reproducibility): 같은 코드+데이터 → 같은 결과 (파이프라인 정의)
- 거버넌스(Governance): 어떤 모델이 어떤 데이터로 학습됐고 누가 승인했나 (Model Registry)
- 자동화(Automation): 커밋/이벤트가 학습·배포를 트리거 (CI/CD)
```

## SageMaker Pipelines: ML 워크플로를 DAG로

SageMaker Pipelines는 단계(Step)를 연결한 방향성 비순환 그래프(DAG)다. 각 단계는 처리·학습·평가·조건·모델 등록 등으로 구성된다.

```python
from sagemaker.workflow.pipeline import Pipeline
from sagemaker.workflow.steps import ProcessingStep, TrainingStep
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo

step_process = ProcessingStep(name="Preprocess", processor=sklearn_proc, ...)
step_train   = TrainingStep(name="Train", estimator=xgb, ...)
step_eval    = ProcessingStep(name="Evaluate", processor=eval_proc, ...)

# 평가 지표가 임계값을 넘을 때만 등록
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

> 💡 **관련 이론**: ConditionStep은 MLOps 품질 게이트의 핵심이다. "평가 AUC가 0.80 미만이면 등록하지 않는다"처럼, 나쁜 모델이 자동으로 운영에 흘러드는 것을 파이프라인이 막는다. 시험에서 "모델이 기준 미달이면 배포를 막는 자동화"는 ConditionStep + Model Registry 승인 조합으로 본다.

## Model Registry: 모델 버전과 승인 거버넌스

학습된 모델은 Model Package로 **Model Package Group**에 버전별로 등록된다. 각 버전은 `PendingManualApproval` 상태로 시작하며, 승인되어야 배포 대상이 된다.

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
    approval_status="PendingManualApproval",   # 승인 게이트
)
```

```text
churn-models (Model Package Group)
├── v1  Approved   (운영 중)
├── v2  Rejected   (평가 미달)
└── v3  PendingManualApproval  (검토 대기)
```

승인 상태를 `Approved`로 바꾸면 EventBridge가 이를 받아 배포 단계를 트리거할 수 있다.

> 💡 **관련 이론**: Model Registry는 "어떤 모델 아티팩트가, 어떤 학습 작업/메트릭/데이터로 만들어졌는가"를 묶는 계보(lineage)의 중심이다. 감사와 롤백의 출발점이며, 승인 상태(Approved/Rejected/Pending)는 사람이나 자동화가 거버넌스를 강제하는 스위치다.

## SageMaker Projects와 CI/CD

SageMaker Projects는 MLOps 템플릿으로 두 개의 리포지토리와 파이프라인을 자동 프로비저닝한다.

```text
- ModelBuild 리포 → CodeCommit/Git push → CodePipeline → SageMaker Pipeline 실행 → 모델 등록
- ModelDeploy 리포 → 모델 승인(Approved) 이벤트 → CodePipeline → 스테이징 배포 → 승인 → 프로덕션 배포
```

CodeBuild가 빌드/테스트를, CodePipeline이 오케스트레이션을, CloudFormation이 엔드포인트 인프라를 IaC로 배포한다.

```yaml
# buildspec.yml 발췌 (CodeBuild)
phases:
  build:
    commands:
      - python pipelines/run_pipeline.py --module-name pipelines.churn.pipeline
      - python -m pytest tests/    # 코드/데이터 검증 테스트
```

## 배포 전략: 안전한 출시

새 모델을 한 번에 전체 트래픽으로 보내지 않는다. SageMaker 엔드포인트는 점진적 배포를 지원한다.

| 전략 | 동작 | 용도 |
|------|------|------|
| **Blue/Green** | 새 플릿 띄우고 일괄/캐노피 전환 | 기본 안전 배포 |
| **Canary** | 소수 트래픽 먼저 보내 검증 후 확대 | 위험 최소화 |
| **Linear** | 일정 비율씩 단계적 증가 | 점진 모니터링 |
| **A/B (Production Variant)** | 두 모델에 트래픽 분배 | 성능 비교 |

## 정리하며

MLOps는 ML을 재현 가능하고 추적 가능하며 자동화된 시스템으로 만든다. SageMaker Pipelines는 처리·학습·평가·조건·등록 단계를 DAG로 정의하고, ConditionStep으로 품질 게이트를 건다. Model Registry는 모델을 버전·승인 상태로 거버넌스하며, SageMaker Projects가 CodePipeline 기반 CI/CD와 Blue/Green·Canary 배포로 안전한 출시를 자동화한다.

내일은 이 모든 파이프라인을 떠받치는 ML 보안 — IAM 실행 역할, VPC 격리, KMS 암호화를 다룬다.

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
