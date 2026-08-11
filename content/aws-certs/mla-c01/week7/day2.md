# Day 2 - Model Registry & 모델 거버넌스: 모델 패키지 그룹, 승인 워크플로, 버전 관리

## 📌 핵심 정리

- **Model Registry**는 학습된 모델을 버전 관리되는 카탈로그에 등록·추적하는 거버넌스 도구다.
- 구조는 2계층 — **Model Package Group**(목적별 묶음) 안에 등록할 때마다 **Model Package 버전이 1씩 자동 증가**한다.
- 각 버전은 **모델 아티팩트·추론 컨테이너 이미지·평가 메트릭·승인 상태**를 함께 담는다.
- 승인 상태는 **PendingManualApproval → Approved / Rejected**. 상태 변경 자체가 **배포의 게이트**다.
- 승인 상태 변경은 **EventBridge 이벤트**를 발생시켜 CodePipeline·Lambda 자동 배포로 이어진다.

## Model Registry란 무엇인가

어제 파이프라인이 만들어낸 모델은 체계적으로 보관되고 승인을 거쳐 프로덕션으로 넘어가야 한다. "이 모델은 어떤 데이터로 학습됐고, 성능은 얼마고, 누가 승인했고, 지금 어느 버전이 배포돼 있는가?"에 답할 수 없다면 그건 MLOps가 아니라 그냥 파일 더미다.

- 학습된 모델들을 **버전 관리되는 카탈로그**에 등록·정리하는 서비스.
- 코드에 Git이 있듯 모델에도 버전·메타데이터·승인 이력이 필요하다는 발상.
- 구조는 두 계층이다.

| 개념 | 역할 |
|------|------|
| **Model Package Group** | 동일 목적의 모델들을 묶는 컨테이너 (예: "사기탐지-모델") |
| **Model Package (Version)** | 그룹 안의 개별 버전 (1, 2, 3...) — 각각 아티팩트·메트릭·승인 상태를 가짐 |

- 하나의 그룹 안에 모델을 등록할 때마다 **버전이 1씩 자동 증가**한다. 사용자가 번호를 붙이지 않는다.
- 각 버전이 담는 것: 모델 아티팩트(S3의 `model.tar.gz`), 추론 컨테이너 이미지 URI, 평가 메트릭, 승인 상태, 설명.

| 비교 축 | 그냥 S3에 모델 저장 | Model Registry |
|---------|---------------------|----------------|
| 버전 | 파일명·경로 규칙에 의존(사람 실수) | 시스템이 자동 부여 |
| 메트릭 | 별도 파일로 따로 관리 | 버전에 함께 첨부 |
| 승인 | 없음(문서·구두 합의) | 상태값으로 명시, 이력 남음 |
| 배포 연결 | 수동 | 승인 이벤트 → 자동 트리거 |
| 감사 | 추적 어려움 | Lineage와 연결해 역추적 |

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

- 그룹을 문제 단위로 자르는 것이 원칙이다. "사기탐지"와 "이탈예측"은 서로 다른 그룹이어야 버전 번호가 의미를 갖는다.
- 같은 문제의 알고리즘만 바꾼 실험은 **같은 그룹의 다른 버전**으로 두는 편이 비교·롤백에 유리하다.

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

- `inference_instances` / `transform_instances`는 "이 모델 버전을 어떤 인스턴스 타입으로 배포·변환할 수 있는가"를 선언하는 값이다.
- `model_metrics`를 붙여 두면 검토자가 Studio에서 버전별 성능을 나란히 비교할 수 있다. 붙이지 않으면 승인 판단 근거가 사라진다.

## 승인 상태(Approval Status) 워크플로

각 모델 버전은 세 가지 승인 상태 중 하나를 갖는다.

| 상태 | 의미 | 다음 동작 |
|------|------|-----------|
| **PendingManualApproval** | 등록됨, 아직 승인되지 않음 (기본값) | 검토 대기 |
| **Approved** | 승인됨 — 배포 대상 | EventBridge 이벤트 → 배포 트리거 |
| **Rejected** | 거부됨 — 배포 불가 | 흐름 종료. 원인 분석 후 재학습 |

```text
    [파이프라인 RegisterModel]
              │
              ▼
   ┌────────────────────────┐
   │ PendingManualApproval  │  ← 등록 직후 기본 상태
   └───────┬────────────┬───┘
   검토 통과 │            │ 검토 탈락
           ▼            ▼
   ┌──────────────┐  ┌──────────┐
   │  Approved    │  │ Rejected │
   └──────┬───────┘  └──────────┘
          │                │
          │                └──▶ (배포 없음 · 재학습 후 새 버전 등록)
          ▼
   EventBridge "SageMaker Model Package State Change"
          │
          ▼
   CodePipeline(Deploy) → 스테이징 → 수동 승인 → 프로덕션
```

- 전형적 흐름: 파이프라인이 `PendingManualApproval`로 등록 → 검토자(또는 자동 검증)가 메트릭 확인 → `Approved`로 변경 → 그 이벤트가 배포를 트리거.
- 즉 **승인 상태 변경 자체가 배포의 게이트**다.
- `Rejected`는 되돌리는 상태가 아니라 "이 버전은 안 쓴다"는 기록이다. 고쳤다면 **새 버전을 등록**하는 것이 정석이다.

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

> ⚠️ **함정**: 등록 단계에서 `approval_status="Approved"`로 바로 박아 버리면 사람 검토 없이 곧장 배포가 굴러간다. "품질 게이트는 통과했지만 사람이 한 번 더 확인해야 한다"는 요구가 있으면 반드시 `PendingManualApproval`로 등록해야 한다. 반대로 완전 자동 재학습 루프를 원하면 자동 승인이 답이다 — 요구사항의 방향을 먼저 읽어라.

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

- 이 ARN으로 모델 객체를 만들어 엔드포인트에 배포하면 "항상 최신 승인 버전을 배포"하는 패턴이 완성된다.
- 각 버전은 SageMaker Lineage와 연결돼, 그 버전이 어떤 데이터셋·학습 작업·코드에서 나왔는지 거꾸로 추적할 수 있다.
- 특정 버전의 상세(메트릭·컨테이너·승인 설명)는 `describe_model_package`로 확인한다.

```python
detail = sm.describe_model_package(ModelPackageName=latest_approved)
print(detail["ModelApprovalStatus"])        # Approved
print(detail["ModelPackageVersion"])        # 버전 번호
print(detail["InferenceSpecification"])     # 추론 이미지·아티팩트
```

롤백은 별도 기능이 아니라 **이전 버전 ARN으로 다시 배포**하는 것이다. 버전이 남아 있기 때문에 가능한 일이고, 이것이 Registry를 쓰는 실질적 이유 중 하나다.

## 수동 승인과 자동 승인 사이

승인을 사람이 누를 것인가, 파이프라인이 대신 눌러 줄 것인가는 조직의 신뢰 수준에 달렸다. 시험은 요구 문장에서 이 방향을 흘린다.

| 비교 축 | 수동 승인 (human-in-the-loop) | 자동 승인 |
|---------|------------------------------|-----------|
| 등록 시 상태 | `PendingManualApproval` | 조건 통과 시 곧장 `Approved` |
| 판단 근거 | 검토자가 메트릭·리포트를 눈으로 확인 | ConditionStep의 임계값 비교 |
| 속도 | 사람 대기만큼 느림 | 즉시 배포까지 연결 |
| 책임 소재 | 승인자가 명확히 남음 | 임계값을 정한 규칙에 위임 |
| 맞는 상황 | 규제 산업, 초기 도입, 영향이 큰 모델 | 잦은 재학습, 리스크가 낮은 모델 |
| 요구 문장의 신호 | "검토를 거쳐", "감사 대응", "책임자 확인" | "완전 자동", "야간 재학습", "사람 개입 없이" |

- 두 방식은 배타적이지 않다. Registry 승인은 자동으로 두고, **프로덕션 직전에 CodePipeline 수동 승인**을 남기는 절충이 흔하다.
- 자동 승인을 쓰더라도 `ApprovalDescription`에 근거(어떤 지표가 얼마였는지)를 남겨 두면 나중에 감사에 대응할 수 있다.

```python
# 평가 결과를 근거로 남기며 승인 상태를 바꾸는 형태
sm.update_model_package(
    ModelPackageArn=model_package_arn,
    ModelApprovalStatus="Approved",
    ApprovalDescription="AUC 0.91 (기준 0.88 초과), 야간 자동 검증 통과",
)
```

## 거버넌스가 꼬일 때: 증상 → 원인 → 조치

| 증상 | 흔한 원인 | 조치 |
|------|-----------|------|
| 승인했는데 배포가 시작되지 않는다 | EventBridge 규칙 없음/패턴 불일치, 타깃 미연결 | 이벤트 패턴(`ModelApprovalStatus: ["Approved"]`)과 타깃 확인 |
| 버전이 계속 1로만 생긴다 | 매번 새 그룹 이름으로 등록 | 같은 `ModelPackageGroupName`으로 등록 |
| 승인 화면에서 성능을 비교할 수 없다 | 등록 시 `ModelMetrics` 미첨부 | 평가 결과 S3 경로를 메트릭으로 붙여 등록 |
| 사람 검토 없이 바로 프로덕션에 나갔다 | 등록 시 상태를 `Approved`로 지정 | `PendingManualApproval`로 등록하도록 파이프라인 수정 |
| 배포된 모델의 출처를 못 밝힌다 | 계보 연결이 끊긴 수동 등록 | 파이프라인 `RegisterModel` 경유로 등록해 Lineage 유지 |
| 등록/승인 API가 `AccessDenied` | 실행 역할에 Registry 관련 권한 없음 | 역할에 모델 패키지 생성·수정 권한 부여 |
| 잘못 승인한 버전을 되돌리고 싶다 | Rejected는 배포를 자동으로 되돌리지 않음 | 직전 정상 버전 ARN으로 재배포(롤백) 후 상태 정리 |

> 💡 **개념**: Registry는 "모델을 저장하는 곳"이 아니라 **"모델의 상태를 선언하는 곳"** 이다. 아티팩트 자체는 여전히 S3에 있고, Registry가 관리하는 건 그 아티팩트에 붙은 버전·메트릭·승인이라는 메타데이터다. 그래서 승인 상태 하나만 바꿔도 배포 파이프라인 전체가 움직인다.

내일은 이 승인 이벤트를 받아 실제로 배포를 굴리는 CI/CD — SageMaker Projects와 CodePipeline/CodeBuild를 다룬다.

## 📖 용어

- **Model Registry** : 학습된 모델을 버전·메트릭·승인 상태와 함께 정리해 두는 모델 카탈로그.
- **Model Package Group** : 같은 목적의 모델 버전들을 담는 상자. 보통 "문제 하나"에 하나씩 만든다.
- **Model Package (버전)** : 그룹 안의 개별 모델 버전. 등록할 때마다 번호가 자동으로 하나씩 올라간다.
- **승인 상태(Approval Status)** : 그 버전을 배포해도 되는지 표시하는 값. PendingManualApproval / Approved / Rejected 세 가지.
- **ModelMetrics** : 등록할 때 함께 붙이는 평가 결과. 검토자가 버전끼리 성능을 비교하는 근거가 된다.
- **InferenceSpecification** : 이 모델을 어떤 추론 이미지와 아티팩트로, 어떤 입력·출력 형식으로 돌리는지 적어 둔 명세.
- **RegisterModel 단계** : 파이프라인 끝에서 모델을 Registry에 자동 등록하는 단계. 내부적으로 등록 API를 호출한다.
- **계보(Lineage)** : 어떤 데이터·학습 작업·코드에서 이 모델이 나왔는지 거슬러 올라갈 수 있게 남긴 연결 기록.
- **거버넌스(Governance)** : 누가 무엇을 승인해 프로덕션에 내보냈는지 통제하고 증명할 수 있게 하는 체계.
- **롤백** : 문제가 생겼을 때 이전에 승인된 버전 ARN으로 다시 배포해 되돌리는 것.

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
