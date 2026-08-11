# Day 2 - 학습 데이터 파이프라인 자동화: Step Functions와 SageMaker Pipelines

## 📌 핵심 정리

- 자동화의 본질적 가치는 두 가지, **재현성(reproducibility)**과 **추적성(lineage)**이다.
- **Step Functions** = 범용 오케스트레이터. ASL(JSON) 상태 머신으로 Glue·Lambda·SageMaker·승인 대기를 한 흐름에 묶는다.
- **SageMaker Pipelines** = ML 전용. Python SDK, ProcessingStep/TrainingStep/TuningStep/ConditionStep, lineage·모델 레지스트리 내장.
- 판단 기준: **순수 ML CI/CD → Pipelines**, **ML+비ML 혼합·승인·복잡 분기 → Step Functions**. 둘을 겹쳐 쓰는 구성도 흔하다.
- 트리거는 **EventBridge**(cron/이벤트)나 **S3 이벤트 → Lambda**로 붙인다.

## 왜 오케스트레이션이 필요한가

어제 Glue와 EMR으로 데이터를 변환하는 법을 배웠다. 그런데 변환은 한 번 돌리고 끝나지 않는다. 새 데이터가 들어올 때마다, 혹은 매일 정해진 시각에 **추출 → 변환 → 검증 → 학습 → 평가**를 자동으로 반복해야 한다. 이 반복을 사람이 손으로 돌리면 실수가 나고 재현성이 깨진다.

ML 워크플로는 여러 단계가 순서·조건·의존성을 갖고 엮여 있다.

```
[데이터 추출] → [전처리] → [데이터 품질 검증]
                                  │
                  품질 통과 ──────┤──── 품질 실패 → 경보 후 중단
                  │
                  ▼
            [모델 학습] → [모델 평가] → 정확도 기준 충족?
                                          │
                  충족 → [모델 등록·배포]  │  미충족 → 재학습 or 알림
```

- 이런 분기·재시도·병렬 처리를 코드 한 덩어리로 관리하면 깨지기 쉽다.
- **오케스트레이터**는 각 단계를 노드로 만들고, 상태 전이·에러 처리·재시도를 선언적으로 정의하게 해 준다.

> 💡 **개념**: 좋은 파이프라인의 핵심 가치는 **재현성(reproducibility)**과 **추적성(lineage)**이다. 같은 입력이면 언제 돌려도 같은 결과가 나와야 하고, 특정 모델이 "어떤 데이터·어떤 코드·어떤 파라미터"로 만들어졌는지 거슬러 추적할 수 있어야 한다. 자동화 파이프라인은 이 두 가지를 구조적으로 보장한다.

## AWS Step Functions — 범용 워크플로 오케스트레이터

Step Functions는 **AWS 서비스 전반을 상태 머신(state machine)으로 엮는** 서버리스 오케스트레이션 서비스다. 각 단계를 "상태(state)"로 정의하고, Amazon States Language(ASL)라는 JSON DSL로 흐름을 기술한다.

ML에서 Step Functions가 강한 지점:

- Glue 작업, Lambda, SageMaker 학습/처리/배치변환, ECS 등 **이질적인 서비스를 한 흐름에 묶는다**.
- `Choice`(분기), `Parallel`(병렬), `Map`(반복), `Retry`/`Catch`(재시도·예외 처리)를 선언적으로 표현한다.
- **SageMaker 통합 액션**이 내장되어 학습·튜닝·배치변환 작업을 직접 호출한다.
- **사람의 승인 대기** 같은 비-ML 단계도 자연스럽게 끼워 넣는다.

```json
{
  "Comment": "ML 학습 파이프라인",
  "StartAt": "GlueETL",
  "States": {
    "GlueETL": {
      "Type": "Task",
      "Resource": "arn:aws:states:::glue:startJobRun.sync",
      "Parameters": { "JobName": "preprocess-clicks" },
      "Next": "TrainModel"
    },
    "TrainModel": {
      "Type": "Task",
      "Resource": "arn:aws:states:::sagemaker:createTrainingJob.sync",
      "Parameters": {
        "TrainingJobName.$": "$.jobName",
        "AlgorithmSpecification": { "TrainingImage.$": "$.image", "TrainingInputMode": "File" }
      },
      "Retry": [ { "ErrorEquals": ["States.ALL"], "MaxAttempts": 2 } ],
      "Catch": [ { "ErrorEquals": ["States.ALL"], "Next": "NotifyFailure" } ],
      "End": true
    },
    "NotifyFailure": {
      "Type": "Task",
      "Resource": "arn:aws:states:::sns:publish",
      "Parameters": { "TopicArn": "arn:aws:sns:...:ml-alerts", "Message": "Training failed" },
      "End": true
    }
  }
}
```

- `.sync` 접미사는 "해당 작업이 끝날 때까지 기다린다"는 의미다.
- `Retry`와 `Catch`로 실패 시 재시도·알림 흐름을 선언적으로 처리한다.

### 자주 쓰는 상태(state) 타입

| 상태 | 하는 일 | ML에서의 쓰임 |
|---|---|---|
| `Task` | 실제 작업 호출 | Glue 잡, SageMaker 학습, Lambda |
| `Choice` | 조건 분기 | 평가 지표가 기준을 넘었는가 |
| `Parallel` | 여러 갈래 동시 실행 | 여러 알고리즘 동시 학습 |
| `Map` | 배열 원소마다 반복 | 지역별·세그먼트별 모델 학습 |
| `Wait` | 지정 시간 대기 | 외부 시스템 처리 대기 |
| `Fail` / `Succeed` | 명시적 종료 | 품질 게이트 실패 처리 |

> 💡 **개념**: Step Functions는 ML 전용이 아니라 **범용 워크플로 도구**다. 따라서 ML 단계와 비-ML 단계(데이터 추출, S3 정리, 외부 API 호출, 승인 대기)를 함께 묶어야 하는 광범위한 오케스트레이션에 강점이 있다.

## Amazon SageMaker Pipelines — ML 네이티브 파이프라인

SageMaker Pipelines는 **ML 워크플로 전용**으로 설계된 CI/CD 오케스트레이터다. Python SDK로 단계를 정의하면 SageMaker가 실행·추적·버저닝을 담당한다.

주요 단계(step) 타입:

| 단계 | 역할 |
|---|---|
| `ProcessingStep` | 전처리·후처리·평가(SageMaker Processing) |
| `TrainingStep` | 모델 학습 |
| `TuningStep` | 하이퍼파라미터 튜닝 |
| `RegisterModel` / `ModelStep` | 모델 레지스트리 등록 |
| `ConditionStep` | 평가 지표 기준 분기(예: 정확도 ≥ 0.85일 때만 등록) |
| `TransformStep` | 배치 변환(대량 스코어링) |

```python
from sagemaker.workflow.steps import ProcessingStep, TrainingStep
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo
from sagemaker.workflow.pipeline import Pipeline

# 전처리 → 학습 → 평가 → (조건부) 모델 등록
step_process = ProcessingStep(name="Preprocess", processor=sklearn_processor, ...)
step_train = TrainingStep(name="Train", estimator=xgb_estimator, ...)

cond_accuracy = ConditionGreaterThanOrEqualTo(
    left=eval_metric_accuracy, right=0.85
)
step_cond = ConditionStep(
    name="AccuracyGate",
    conditions=[cond_accuracy],
    if_steps=[step_register_model],   # 기준 충족 시 모델 등록
    else_steps=[]                     # 미충족 시 등록하지 않음
)

pipeline = Pipeline(
    name="ml-train-pipeline",
    steps=[step_process, step_train, step_cond],
)
pipeline.upsert(role_arn=role)
pipeline.start()
```

> 💡 **개념**: SageMaker Pipelines는 실행마다 **lineage(계보)**를 자동 기록한다. 어떤 데이터셋·코드·하이퍼파라미터로 어떤 모델이 만들어졌는지가 SageMaker Model Registry와 연결되어 추적된다. 규제 환경(설명 가능성·감사)에서 매우 중요한 기능이다.

### 모델 레지스트리와 승인 흐름

- `RegisterModel`로 등록된 모델은 **모델 패키지 그룹** 안에서 버전이 쌓인다.
- 각 버전은 **승인 상태**(승인 대기 / 승인됨 / 거부됨)를 갖는다. 승인된 버전만 배포 파이프라인이 집어 가도록 구성하는 것이 정석이다.
- 이 구조 덕분에 "누가 언제 어떤 근거로 이 모델을 프로덕션에 올렸는가"가 기록으로 남는다.

## Step Functions vs SageMaker Pipelines — 선택 기준

| 관점 | Step Functions | SageMaker Pipelines |
|---|---|---|
| 범위 | 범용(AWS 전반 오케스트레이션) | ML 전용 |
| 정의 방식 | ASL(JSON) / Workflow Studio | Python SDK |
| ML 통합 | SageMaker 액션 지원 | 네이티브, 모델 레지스트리·lineage 내장 |
| 비-ML 단계 | 강함(Lambda, Glue, 승인, SNS 등) | 제한적 |
| 재시도·예외 | Retry/Catch로 세밀하게 | 단계 수준에서 제한적 |
| 적합 상황 | ML+비ML 혼합, 복잡한 분기·승인 | 순수 ML CI/CD, 추적성 중시 |

핵심 판단: **워크플로가 순수하게 ML 학습/평가/등록 중심이면 SageMaker Pipelines**, **ML 단계와 데이터 파이프라인·외부 시스템·승인 단계가 뒤섞이면 Step Functions**가 자연스럽다. 둘을 함께 쓰는 패턴(Step Functions가 상위에서 전체를 오케스트레이션하고, 그 안에서 SageMaker 작업 호출)도 흔하다.

```
[혼합 구성]
Step Functions (상위 오케스트레이션)
   ├─ Glue ETL 잡
   ├─ 데이터 품질 검증 Lambda
   ├─ 사람 승인 대기
   └─ SageMaker Pipeline 실행 ─┬─ Processing
                               ├─ Training
                               ├─ Evaluation
                               └─ ConditionStep → RegisterModel
```

> ⚠️ **함정**: "ML 작업이니까 무조건 SageMaker Pipelines"는 단순화된 오답이다. 워크플로에 승인 대기, 여러 비-ML 시스템 연동, 복잡한 조건 분기가 많다면 범용성이 높은 Step Functions가 더 적합하다. 문제의 요구사항(비-ML 단계 비중, 추적성 요구)을 읽어 판단해야 한다.

## 트리거와 스케줄링

파이프라인을 "언제 돌릴 것인가"도 설계의 일부다.

| 트리거 | 구성 | 대표 상황 |
|---|---|---|
| 스케줄 | EventBridge cron 규칙 | 매일 새벽 정기 재학습 |
| 데이터 도착 | S3 이벤트 → Lambda → 파이프라인 시작 | 새 배치 파일이 올라올 때마다 |
| 코드 변경 | CodePipeline/CodeCommit 연동 | 전처리·학습 코드가 바뀔 때 |
| 드리프트 감지 | Model Monitor 경보 → EventBridge | 운영 성능 저하가 감지될 때 |
| 수동 | `pipeline.start()` | 실험·긴급 재학습 |

> 🎯 **시나리오**: "매일 새벽 2시에 전날 로그를 전처리하고 모델을 재학습하되, 평가 정확도가 0.9 미만이면 배포하지 말고 데이터 팀에 알림을 보내라." → EventBridge cron으로 SageMaker Pipeline을 트리거하고, 파이프라인 내부에 `ConditionStep`(정확도 게이트)과 실패 시 SNS 알림을 두면 된다.

> ⚠️ **함정**: 트리거를 "사람이 콘솔에서 시작"으로 두는 보기는 자동화 문제에서 거의 항상 오답이다. 자동화의 목적 자체와 어긋난다.

## 파라미터화와 재실행

파이프라인은 "한 번 짜고 계속 다시 도는" 물건이라, 하드코딩을 걷어내는 설계가 중요하다.

- **파이프라인 파라미터**: 입력 데이터 경로, 인스턴스 타입·개수, 정확도 임계값을 실행 시점에 주입한다. 같은 정의로 개발·스테이징·프로덕션을 돌린다.
- **캐싱**: 입력과 설정이 이전 실행과 동일한 단계는 결과를 재사용해 시간과 비용을 아낀다.
- **부분 재실행**: 학습만 실패했다면 전처리부터 다시 돌릴 이유가 없다. 단계 분리가 곧 재실행 단위 분리다.
- **실행 이력**: 각 실행이 어떤 파라미터로 돌았는지 남아야 "왜 이 모델만 성능이 다르지?"에 답할 수 있다.

### 실패했을 때 무엇을 보는가

| 증상 | 흔한 원인 | 대응 |
|---|---|---|
| 학습 단계에서 권한 오류 | 실행 역할에 S3·ECR 권한 누락 | IAM 역할 정책 보완 |
| 입력 경로를 못 찾음 | 앞 단계 출력 경로와 불일치 | 단계 간 출력→입력 연결을 파라미터로 고정 |
| 매번 결과가 미묘하게 다름 | 난수 시드·데이터 스냅숏 미고정 | 시드 고정, 입력 데이터 버전 경로 사용 |
| 품질 게이트에서 계속 막힘 | 데이터 드리프트 또는 임계값 과도 | 데이터부터 확인, 임계값은 근거 있게 조정 |
| 잡이 무한정 도는 것 같음 | 타임아웃 미설정 | 단계별 최대 실행 시간 지정 |

> ⚠️ **함정**: 파이프라인이 실패했을 때 "재시도 횟수를 늘린다"는 보기는 대개 오답이다. 재시도는 **일시적 오류**에 대한 대응이고, 권한·경로·데이터 문제는 몇 번을 다시 돌려도 같은 자리에서 멈춘다.

내일은 데이터가 부족하거나 불균형할 때 이를 보완하는 **데이터 증강과 합성** 기법을 살펴본다.

## 📖 용어

- **오케스트레이션** : 여러 작업의 실행 순서·조건·재시도를 한곳에서 선언적으로 관리하는 것.
- **상태 머신(state machine)** : 각 단계를 "상태"로 정의하고 전이 규칙을 기술한 워크플로 정의.
- **ASL(Amazon States Language)** : Step Functions의 워크플로를 기술하는 JSON 기반 언어.
- **`.sync` 통합** : 호출한 작업이 끝날 때까지 기다렸다가 다음 상태로 넘어가는 Step Functions 호출 방식.
- **Retry / Catch** : 실패 시 자동 재시도, 그래도 실패하면 지정한 처리 상태로 넘기는 선언적 예외 처리.
- **lineage(계보)** : 이 모델이 어떤 데이터·코드·파라미터에서 나왔는지 거슬러 추적할 수 있는 기록.
- **ConditionStep** : 평가 지표 등을 조건으로 이후 단계를 분기시키는 SageMaker Pipelines 단계.
- **모델 레지스트리** : 모델 버전을 등록·승인·추적하는 저장소. 승인된 버전만 배포하도록 게이트를 건다.
- **EventBridge** : cron 일정이나 AWS 이벤트에 반응해 다른 서비스를 호출하는 이벤트 버스.
- **품질 게이트** : 기준 지표를 넘지 못하면 다음 단계로 못 가게 막는 자동 검문소.

## 📝 연습 문제

**문제 1.** 한 팀이 데이터 추출(Glue), 외부 승인 대기, Lambda 후처리, SageMaker 학습을 하나의 흐름으로 묶고 분기·재시도를 선언적으로 관리하려 한다. 가장 적합한 오케스트레이터는?

A) AWS Step Functions  
B) SageMaker Pipelines  
C) Amazon Athena  
D) AWS Glue Crawler  

**정답: A**  
해설: Step Functions는 Glue·Lambda·SageMaker·승인 대기 등 이질적인 AWS 서비스와 비-ML 단계를 상태 머신으로 묶고 Choice·Retry·Catch로 분기·재시도를 선언적으로 처리하는 범용 오케스트레이터다. SageMaker Pipelines(B)는 ML 전용이라 비-ML 단계·승인 통합이 제한적이고, Athena·Glue Crawler는 오케스트레이션 도구가 아니다.

---

**문제 2.** 순수 ML CI/CD 워크플로에서 "평가 정확도가 0.85 이상일 때만 모델을 레지스트리에 등록"하는 조건부 분기를 SageMaker Pipelines로 구현하려면 사용하는 단계는?

A) ProcessingStep  
B) TrainingStep  
C) ConditionStep  
D) TuningStep  

**정답: C**  
해설: ConditionStep은 평가 지표 등의 조건을 평가해 if_steps/else_steps로 분기하므로 "정확도 기준 충족 시에만 모델 등록"을 표현하는 데 정확히 들어맞는다. ProcessingStep(전처리), TrainingStep(학습), TuningStep(하이퍼파라미터 튜닝)은 각각 다른 역할로 조건 분기를 담당하지 않는다.

---

**문제 3.** ML 파이프라인 자동화가 제공하는 가장 본질적인 두 가지 가치로 옳은 것은?

A) 비용 0원과 무제한 확장  
B) 코드 삭제와 로그 비활성화  
C) 수동 개입 강제와 단계 은닉  
D) 재현성과 추적성(lineage)  

**정답: D**  
해설: 자동화 파이프라인의 핵심 가치는 같은 입력이면 같은 결과를 내는 재현성과, 특정 모델이 어떤 데이터·코드·파라미터로 만들어졌는지 거슬러 추적하는 lineage다. 비용이 0이 되거나(A) 로그를 끄거나(B) 수동 개입을 강제하는 것(C)은 자동화의 목적과 반대된다.

---

**문제 4.** 새 데이터가 S3에 도착할 때마다 ML 파이프라인을 자동으로 시작하고 싶다. 가장 일반적인 트리거 구성은?

A) S3 이벤트 또는 EventBridge 규칙으로 파이프라인 시작  
B) 사람이 매번 콘솔에서 수동 시작  
C) RDS 백업 완료 시점에만 시작  
D) IAM 정책 변경으로 트리거  

**정답: A**  
해설: S3 객체 생성 이벤트나 EventBridge 규칙(이벤트·cron)으로 파이프라인 실행을 트리거하는 것이 표준 패턴이며, 데이터 도착 시 자동 시작을 구현한다. 수동 시작(B)은 자동화에 어긋나고, RDS 백업(C)·IAM 변경(D)은 데이터 도착과 무관한 신호다.

---

**문제 5.** 상위에서는 데이터 파이프라인과 승인을 포함한 전체 흐름을 오케스트레이션하고, 그 내부에서 SageMaker 학습 작업을 호출하는 구성에 대한 설명으로 가장 옳은 것은?

A) Step Functions와 SageMaker Pipelines는 함께 쓸 수 없다  
B) SageMaker Pipelines만으로 모든 비-ML 단계를 완벽히 대체할 수 있다  
C) Step Functions가 상위 오케스트레이션을 맡고 SageMaker 작업을 호출하는 혼합 구성이 가능하다  
D) 두 도구는 동일하므로 구분이 불필요하다  

**정답: C**  
해설: Step Functions가 상위에서 데이터·승인 등 전체 흐름을 오케스트레이션하고 그 안에서 SageMaker 학습/처리 작업을 호출하는 혼합 패턴은 실무에서 흔히 쓰인다. 둘은 함께 사용 가능하므로 A는 틀렸고, SageMaker Pipelines는 비-ML 단계 통합이 제한적이라 B도 부정확하며, 역할이 다르므로 D도 틀렸다.

---
