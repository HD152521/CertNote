# Day 2 - MLOps: SageMaker Pipelines, Model Registry, CI/CD

## 📌 핵심 정리

- 드리프트를 탐지해도 **재학습이 수동이면 운영이 무너진다.** MLOps는 처리→학습→평가→등록→배포를 코드로 정의해 반복 가능·추적 가능하게 만드는 일이다.
- **SageMaker Pipelines**는 Step들을 **DAG**로 엮는다. 각 Step은 Processing·Training·Tuning·Condition·RegisterModel·Transform 등으로 구성된다.
- **ConditionStep**이 품질 게이트다. "평가 AUC가 임계값 미만이면 등록하지 않는다"로 나쁜 모델의 자동 승격을 막는다.
- **Model Registry**는 버전·승인 상태·계보를 관리한다. 등록 시 `PendingManualApproval`, 승인해야 `Approved`가 되어 배포 자동화가 이어진다.
- **SageMaker Projects**는 ModelBuild/ModelDeploy 2개 리포와 CodePipeline CI/CD를 자동 프로비저닝하고, 배포는 Blue/Green·Canary·Linear·Shadow로 안전하게 굴린다.

## MLOps가 푸는 3가지 문제

노트북에서 모델 한 번 돌리고 콘솔에서 손으로 배포하는 방식은 재현도, 추적도, 협업도 안 된다.

| 문제 | 수동 ML에서 벌어지는 일 | MLOps의 해법 | AWS 구성 요소 |
|---|---|---|---|
| **재현성** | "지난달 그 모델 어떻게 만들었죠?" — 아무도 모른다 | 같은 코드 + 같은 데이터 → 같은 결과가 되도록 워크플로를 코드로 고정 | SageMaker Pipelines |
| **거버넌스** | 어떤 데이터로 학습했는지, 누가 승인했는지 기록이 없다 | 버전·지표·승인 상태·계보를 한곳에 축적 | Model Registry, Lineage |
| **자동화** | 재학습·배포가 사람 손에 묶여 지연되고 실수가 난다 | 커밋·이벤트가 학습·배포를 트리거 | Projects, CodePipeline, EventBridge |

> 💡 **개념**: 세 문제는 독립이 아니다. 재현성이 없으면 거버넌스 기록이 무의미하고, 거버넌스 게이트가 없으면 자동화는 나쁜 모델을 더 빠르게 배포할 뿐이다. **자동화는 게이트가 먼저 서 있을 때만 안전하다.**

## SageMaker Pipelines: ML 워크플로를 DAG로

Pipelines는 Step들을 방향성 비순환 그래프(DAG)로 연결한다. Step 사이의 의존성은 **한 Step의 출력(`properties`)을 다른 Step의 입력으로 참조**하면 자동으로 만들어진다.

### 주요 Step 종류

| Step | 하는 일 | 전형적 용도 |
|---|---|---|
| `ProcessingStep` | Processing Job 실행 | 전처리, 피처 엔지니어링, **모델 평가** |
| `TrainingStep` | Training Job 실행 | 모델 학습 |
| `TuningStep` | Hyperparameter Tuning Job 실행 | 최적 하이퍼파라미터 탐색 |
| `TransformStep` | Batch Transform 실행 | 대량 오프라인 추론 |
| `CreateModelStep` | 학습 산출물로 Model 객체 생성 | 배포·배치 변환 준비 |
| `RegisterModel` (스텝 컬렉션) | Model Registry에 모델 패키지 등록 | 버전 관리·승인 게이트 진입 |
| `ConditionStep` | 조건 분기(`if_steps`/`else_steps`) | **품질 게이트** |
| `FailStep` | 파이프라인을 명시적으로 실패 처리 | 기준 미달 시 실행 중단 표시 |
| `LambdaStep` | Lambda 함수 호출 | 짧은 커스텀 로직, 알림, 외부 API |
| `CallbackStep` | SQS로 외부 시스템에 넘기고 응답 대기 | 사람 검토, 사내 시스템 연동 |
| `QualityCheckStep` / `ClarifyCheckStep` | 품질·편향 베이스라인 검사 | 드리프트·공정성 회귀 방지 |
| `EMRStep` | EMR에서 Spark 작업 실행 | 대규모 분산 전처리 |

### 파이프라인 DAG

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
                                          │ 승인(Approved)
                                          ▼
                      [EventBridge] ─▶ [ModelDeploy CodePipeline] ─▶ 엔드포인트
```

### 정의 코드

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

# 평가 지표가 임계값 이상일 때만 등록
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

| 조건 클래스 | 검사 내용 |
|---|---|
| `ConditionGreaterThanOrEqualTo` / `ConditionLessThanOrEqualTo` | 지표가 임계값 이상/이하인가 |
| `ConditionEquals` / `ConditionIn` | 값이 일치하는가 / 허용 목록 안에 있는가 |
| `ConditionNot` / `ConditionOr` | 조건 부정 / 여러 조건 결합 |

- **파라미터화**: `ParameterString`·`ParameterInteger`·`ParameterFloat`로 입력 경로·임계값·인스턴스 타입을 실행 시점에 주입한다. 코드 수정 없이 재실행할 수 있다.
- **캐싱**: `CacheConfig(enable_caching=True, expire_after="30d")`를 Step에 붙이면 동일 입력의 Step을 재실행하지 않아 시간·비용을 아낀다.
- **평가 지표 전달**: 평가 Step이 쓴 JSON을 `PropertyFile`로 선언하고 `JsonGet`으로 특정 경로를 읽어 조건에 넣는다.

> 💡 **관련 이론**: ConditionStep은 MLOps 품질 게이트의 심장이다. "평가 AUC가 0.80 미만이면 등록하지 않는다"처럼, 나쁜 모델이 자동으로 프로덕션에 흘러드는 것을 막는다. 시험에서 **"기준 미달 모델의 배포를 자동으로 차단하라"** 는 지문은 ConditionStep + Model Registry 승인 게이트 조합으로 매핑된다.

## Model Registry: 버전과 승인 거버넌스

학습된 모델은 **Model Package Group** 안에 버전(Model Package) 단위로 등록된다.

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
    model_metrics=model_metrics,               # 평가 지표를 버전에 첨부
)
```

```text
churn-models (Model Package Group)
├── v1  Approved                (운영 중)
├── v2  Rejected                (평가 기준 미달)
└── v3  PendingManualApproval   (검토 대기)
```

### 승인 상태 전이

| 전이 | 계기 | 결과 |
|---|---|---|
| (신규 등록) → `PendingManualApproval` | `RegisterModel`의 기본 설정 | 배포 대상이 아님. 검토 대기 |
| `PendingManualApproval` → `Approved` | 담당자 승인 또는 자동 규칙 | **Model Package State Change** 이벤트 발생 → 배포 파이프라인 트리거 |
| `PendingManualApproval` → `Rejected` | 지표 미달·리스크 판단 | 배포되지 않고 기록만 남음 |
| `Approved` → `Rejected` | 운영 중 문제 발견 | 신규 배포 차단. 이전 Approved 버전으로 롤백 |
| `Rejected` → `Approved` | 재검토·이슈 해소 | 다시 배포 가능 상태 |

- 상태는 `UpdateModelPackage` API(또는 Studio UI)로 바꾼다. 상태 변경 자체가 이벤트가 되므로 **승인이 곧 배포 트리거**다.
- 파이프라인에서 `approval_status="Approved"`로 바로 등록할 수도 있지만, 사람 검토를 없애는 선택이라 규제 환경에서는 권장되지 않는다.

### 계보(Lineage)와 롤백

```text
[데이터셋 S3] ─▶ [Processing Job] ─▶ [Training Job] ─▶ [Model Package v3]
   Artifact          Action             Action            Artifact
      └──────── Association(연결 관계)로 전 구간 추적 ────────┘

롤백: v3 → Rejected , v1 → Approved  ─▶ ModelDeploy가 v1을 재배포
```

- Lineage Tracking은 데이터·처리·학습·모델을 Artifact/Action/Context와 Association으로 자동 연결한다. 덕분에 "이 예측을 낸 모델은 어떤 데이터로, 누가 승인해 배포됐나"에 답할 수 있다.

> 💡 **관련 이론**: Model Registry는 "어떤 모델 아티팩트가 어떤 학습 Job·지표·데이터에서 왔는가"를 묶는 계보의 중심이다. 승인 상태(Approved/Rejected/Pending)는 사람 또는 자동화가 거버넌스를 강제하는 스위치이며, 롤백은 새 배포가 아니라 **이전 Approved 버전의 재배포**로 이뤄진다.

## SageMaker Projects와 CI/CD

SageMaker Projects는 MLOps 템플릿으로 **2개 리포지토리와 파이프라인을 자동 프로비저닝**한다.

```text
┌──── ModelBuild 리포 (pipelines/ , tests/) ────┐
│ git push ─▶ CodePipeline ─▶ CodeBuild         │
│                └─▶ SageMaker Pipeline 실행     │
│                       └─▶ Model Registry 등록  │
└───────────────────────────────────────────────┘
                 │ 승인(Approved) 이벤트
                 ▼
┌──── ModelDeploy 리포 (CloudFormation 템플릿) ──┐
│ EventBridge ─▶ CodePipeline                   │
│     ├─▶ Staging 엔드포인트 배포                │
│     ├─▶ 수동 승인 단계                         │
│     └─▶ Production 엔드포인트 배포             │
└───────────────────────────────────────────────┘
```

| 서비스 | 역할 | 이 흐름에서 하는 일 |
|---|---|---|
| **CodeCommit / Git** | 소스 저장소 | 파이프라인 정의·배포 템플릿의 버전 관리 |
| **CodeBuild** | 빌드·테스트 실행 | 파이프라인 정의 실행, 단위·데이터 검증 테스트 |
| **CodePipeline** | 오케스트레이션 | 소스→빌드→배포 단계 연결, 수동 승인 단계 삽입 |
| **CloudFormation** | IaC 배포 | 엔드포인트·엔드포인트 설정을 코드로 생성·갱신 |
| **EventBridge** | 이벤트 라우팅 | 모델 승인 이벤트를 받아 ModelDeploy 파이프라인 시작 |
| **Model Registry** | 거버넌스 | 승인 상태로 배포 여부를 통제 |

```yaml
# buildspec.yml 발췌 (CodeBuild)
phases:
  build:
    commands:
      - python pipelines/run_pipeline.py --module-name pipelines.churn.pipeline
      - python -m pytest tests/    # 코드·데이터 검증 테스트
```

> ⚠️ **함정**: CI/CD를 붙였다고 게이트가 생기는 게 아니다. ConditionStep(모델 품질)과 Model Registry 승인(사람·정책), 그리고 Staging 검증 — **세 겹의 게이트**가 서 있어야 자동화가 안전해진다.

## 배포 전략 비교

새 모델을 전체 트래픽에 한 번에 보내지 않는다. SageMaker 엔드포인트는 점진 배포를 지원한다.

| 전략 | 트래픽 흐름 | 롤백 속도 | 사용자 영향 | 언제 쓰나 |
|---|---|---|---|---|
| **Blue/Green (All-at-once)** | 새 플릿 준비 후 100% 한 번에 전환 | 빠름(구 플릿을 베이킹 기간 유지) | 문제 시 **전체 사용자** | 기본 안전 배포. 변경이 검증된 경우 |
| **Canary** | 소량(예: 10%)만 새 플릿 → 검증 후 전환 | 매우 빠름(소수만 되돌림) | **소수 사용자**만 | 위험 최소화가 최우선일 때 |
| **Linear** | 정해진 비율만큼 여러 단계로 점증 | 빠름(단계 중단 후 되돌림) | 단계별로 점진 증가 | 단계마다 지표를 보며 넘어갈 때 |
| **Rolling** | 인스턴스를 배치 단위로 순차 교체 | 중간(진행분 되돌림) | 교체된 배치의 사용자 | 대규모 플릿을 비용 효율적으로 교체 |
| **Shadow** | 운영 트래픽을 **복제**해 보내고 응답은 버림 | 즉시(실사용 아님) | **없음** | 실제 트래픽으로 사전 검증만 할 때 |
| **A/B (Production Variant)** | 한 엔드포인트의 variant에 가중치로 분배 | 가중치 조정으로 즉시 | 그룹별로 다른 모델 | 두 모델 성능을 실측 비교할 때 |

- Blue/Green·Canary·Linear·Rolling은 **엔드포인트 업데이트 방식**, A/B와 Shadow는 **동시 운영·비교 방식**이다. 목적이 다르다.
- 배포 설정에 **CloudWatch 경보를 연결해 자동 롤백**을 건다. 오류율·지연이 임계값을 넘으면 이전 구성으로 되돌린다.

## 지문 단서 → 정답 매핑

| 지문 단서 | 고를 답 | 이유 |
|---|---|---|
| "평가 지표가 기준 미달이면 등록하지 말고 중단" | **ConditionStep**(+`FailStep`) | 지표를 임계값과 비교해 분기하는 품질 게이트 |
| "어떤 모델이 어떤 데이터로 학습됐는지 추적, 빠른 롤백" | **Model Registry**(+Lineage) | 버전·승인 상태·계보를 관리 |
| "새로 등록된 모델의 기본 승인 상태는?" | **PendingManualApproval** | 검토 전까지 배포 대상이 아님 |
| "승인되면 자동으로 배포 파이프라인이 돌아야 한다" | **EventBridge → CodePipeline** | 모델 패키지 상태 변경 이벤트를 라우팅 |
| "빌드·배포 리포와 CI/CD를 템플릿으로 한 번에" | **SageMaker Projects** | ModelBuild/ModelDeploy 자동 프로비저닝 + IaC 배포 |
| "소량 트래픽으로 먼저 검증 후 확대" | **Canary** | 노출 범위를 최소화한 점진 전환 |
| "두 모델의 성능을 실제 트래픽으로 비교" | **A/B(Production Variant) 가중치 분배** | 한 엔드포인트에서 동시 서빙·비교 |
| "사용자에게 영향 없이 실제 트래픽으로 사전 검증" | **Shadow 배포** | 트래픽을 복제하고 응답은 반환하지 않음 |
| "같은 전처리 Step을 매번 다시 돌리기 아깝다" | **`CacheConfig`로 Step 캐싱** | 동일 입력 Step 재실행 생략 |
| "입력 경로·임계값을 실행마다 바꿔 재사용" | **Pipeline Parameters** | 정의 수정 없이 실행 시점 주입 |
| "노트북에서 수동 배포로 충분" | **오답 보기** | 재현성·거버넌스가 무너짐 |

## 파이프라인 점검 체크리스트

- [ ] 평가 Step의 지표가 `PropertyFile`·`JsonGet`으로 조건에 연결되어 있는가
- [ ] ConditionStep의 `else_steps`가 비어 있지 않고 실패를 명시하는가
- [ ] 등록 시 승인 상태가 조직 정책(수동/자동)과 일치하는가
- [ ] 배포 전략에 자동 롤백용 CloudWatch 경보가 연결되어 있는가

다음 글에서는 이 모든 파이프라인을 떠받치는 **ML 보안** — IAM 실행 역할, VPC 격리, KMS 암호화를 다룬다.

## 📖 용어

- **MLOps** : 데이터 처리·학습·평가·등록·배포를 코드와 자동화로 묶어 반복 가능하고 추적 가능하게 만드는 운영 방식.
- **DAG(방향성 비순환 그래프)** : Step들이 화살표로 연결되고 순환하지 않는 구조. 무엇이 무엇보다 먼저 실행되는지가 정의된다.
- **Step** : 파이프라인을 이루는 최소 실행 단위. 처리·학습·튜닝·조건·등록 등 종류가 정해져 있다.
- **ConditionStep** : 평가 지표 같은 값을 조건과 비교해 실행 경로를 나누는 Step. 품질 게이트의 핵심이다.
- **PropertyFile / JsonGet** : 평가 Step이 남긴 JSON 결과에서 특정 지표 값을 꺼내 조건에 넣는 장치.
- **Model Package Group** : 같은 목적의 모델 버전들을 모아 두는 상자. 그 안에 v1, v2… 버전이 쌓인다.
- **PendingManualApproval** : 새 모델 버전의 기본 승인 상태. 검토를 통과해 Approved가 되기 전에는 배포 대상이 아니다.
- **계보(lineage)** : 데이터→처리→학습→모델로 이어지는 연결 기록. 감사·재현·롤백의 근거가 된다.
- **SageMaker Projects** : ModelBuild/ModelDeploy 리포와 CI/CD 파이프라인을 한 번에 만들어 주는 MLOps 템플릿.
- **Production Variant / Shadow 배포** : Production Variant 는 하나의 엔드포인트 안에서 가중치를 나눠 여러 모델을 동시에 서빙하는 단위. A/B 비교에 쓴다. Shadow 배포는 실제 트래픽을 복제해 새 모델에 흘려보내되 응답은 사용자에게 주지 않는 검증 방식.

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
