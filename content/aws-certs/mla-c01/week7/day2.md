# Day 2 - Model Registry & 모델 거버넌스: 모델 패키지 그룹, 승인 워크플로, 버전 관리

어제 파이프라인이 만들어낸 모델은 어딘가에 체계적으로 보관되고, 누군가의 승인을 거쳐 프로덕션으로 넘어가야 한다. "이 모델은 어떤 데이터로 학습됐고, 성능은 얼마고, 누가 승인했고, 지금 어느 버전이 배포돼 있는가?"에 답할 수 없다면 그건 MLOps가 아니라 그냥 파일 더미다. **SageMaker Model Registry**는 이 질문들에 답하기 위한 모델 카탈로그이자 거버넌스(governance) 도구다.

오늘은 Model Registry의 핵심인 **모델 패키지 그룹(Model Package Group), 모델 버전 관리, 승인 상태(approval status) 워크플로**를 다룬다. MLA-C01 시험은 "모델 버전을 추적하고 승인을 거쳐 배포로 연결"하는 시나리오에서 Model Registry를 묻는다.

## Model Registry란 무엇인가

Model Registry는 학습된 모델들을 **버전 관리되는 카탈로그**에 등록·정리하는 서비스다. 코드의 Git처럼, 모델에도 버전·메타데이터·승인 이력이 필요하다는 발상이다.

구조는 두 계층이다.

| 개념 | 역할 |
|------|------|
| Model Package Group | 동일 목적의 모델들을 묶는 컨테이너 (예: "사기탐지-모델") |
| Model Package (Version) | 그룹 안의 개별 버전 (1, 2, 3...) — 각각 아티팩트·메트릭·승인 상태를 가짐 |

하나의 그룹 안에 모델을 등록할 때마다 **버전이 1씩 자동 증가**한다. 각 버전은 모델 아티팩트(S3), 추론 컨테이너 이미지, 평가 메트릭, 그리고 승인 상태를 담는다.

> 💡 **관련 이론**: Model Registry의 핵심 가치는 추적성(traceability)과 거버넌스다. 규제 산업(금융·의료)에서는 "프로덕션에 배포된 모델이 정확히 무엇이고 누가 승인했는가"를 감사(audit)할 수 있어야 한다. Registry는 모델 버전과 SageMaker 계보(lineage)를 연결해 데이터→학습→모델→배포의 전 과정을 기록으로 남긴다. 시험에서 "모델 버전 추적·승인·감사"라는 키워드가 보이면 Model Registry다.

## 모델 패키지 그룹 만들기

먼저 모델들을 담을 그룹을 만든다. 그룹은 보통 "한 가지 문제를 푸는 모델 계열"을 의미한다.

```python
import boto3
sm = boto3.client("sagemaker")

# 동일 목적 모델들을 묶는 패키지 그룹 생성
sm.create_model_package_group(
    ModelPackageGroupName="fraud-detection-models",
    ModelPackageGroupDescription="사기 탐지 모델 버전 카탈로그",
)
```

## 모델 버전 등록

학습이 끝난 모델을 그룹에 등록하면 새 버전(Model Package)이 생성된다. 등록 시 평가 메트릭과 초기 승인 상태를 함께 기록할 수 있다.

```python
# 평가 메트릭을 첨부하고, 초기 상태는 수동 승인 대기로 등록
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
    ModelApprovalStatus="PendingManualApproval",   # 등록 직후 기본 상태
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

SageMaker Pipelines의 `RegisterModel` 단계도 내부적으로 이 API를 호출한다. 즉 파이프라인 끝에서 자동으로 버전이 등록되는 구조다.

```python
from sagemaker.workflow.step_collections import RegisterModel

# 파이프라인 안에서 모델을 Registry에 등록하는 단계
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

## 승인 상태(Approval Status) 워크플로

각 모델 버전은 세 가지 승인 상태 중 하나를 갖는다.

| 상태 | 의미 |
|------|------|
| PendingManualApproval | 등록됨, 아직 승인되지 않음 (기본값) |
| Approved | 승인됨 — 배포 대상 |
| Rejected | 거부됨 — 배포 불가 |

전형적 거버넌스 흐름은 이렇다. 파이프라인이 모델을 `PendingManualApproval`로 등록 → 검토자(또는 자동 검증)가 메트릭을 확인 → `Approved`로 변경 → 그 승인 이벤트가 배포를 트리거한다. 즉 **승인 상태 변경 자체가 배포의 게이트**가 된다.

```python
# 검토 후 모델 버전을 승인 처리
sm.update_model_package(
    ModelPackageArn=model_package_arn,
    ModelApprovalStatus="Approved",
    ApprovalDescription="오프라인 평가 통과, 프로덕션 승인",
)
```

승인 상태 변경은 **EventBridge 이벤트**를 발생시킨다. 이를 받아 CodePipeline이나 Lambda가 자동으로 엔드포인트 배포를 수행하도록 연결하는 것이 내일 다룰 CI/CD의 핵심 트리거다.

> 💡 **관련 이론**: 승인 워크플로는 "누가 책임지고 프로덕션에 내보내는가"를 명시화한다. 자동 평가가 통과해도 사람이 최종 `Approved`를 누르게 하면 책임 소재와 통제권이 명확해진다(human-in-the-loop). 반대로 신뢰가 쌓이면 ConditionStep으로 자동 승인까지 갈 수 있다. 시험에서 "모델 승인 시 자동 배포"라는 흐름이 나오면 Model Registry 승인 → EventBridge → CodePipeline 연결을 떠올려라.

## 버전 관리와 모델 조회

같은 그룹에 등록을 반복하면 버전이 누적된다. 가장 최근 또는 승인된 버전을 조회해 배포 대상을 고를 수 있다.

```python
# 그룹 내 승인된(Approved) 모델 버전만 최신순으로 조회
resp = sm.list_model_packages(
    ModelPackageGroupName="fraud-detection-models",
    ModelApprovalStatus="Approved",
    SortBy="CreationTime",
    SortOrder="Descending",
)
latest_approved = resp["ModelPackageSummaryList"][0]["ModelPackageArn"]
```

이 ARN으로 모델 객체를 만들어 엔드포인트에 배포하면 "항상 최신 승인 버전을 배포"하는 패턴이 완성된다. 또한 각 버전은 SageMaker Lineage와 연결돼, 그 버전이 어떤 데이터셋·학습 작업·코드에서 나왔는지 거꾸로 추적할 수 있다.

## 정리

- Model Registry는 모델을 버전 관리되는 카탈로그로 정리하는 거버넌스 도구다.
- Model Package Group(목적별 묶음) 안에 등록할 때마다 Model Package 버전이 자동 증가한다.
- 각 버전은 아티팩트·추론 이미지·평가 메트릭·승인 상태를 담는다.
- 승인 상태는 PendingManualApproval → Approved/Rejected로 흐르고, 상태 변경은 EventBridge 이벤트로 배포를 트리거할 수 있다.
- "모델 버전 추적·승인·감사·자동 배포 연결"이면 Model Registry가 정답이다.

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
