# Day 2 - 학습 데이터 파이프라인 자동화: Step Functions와 SageMaker Pipelines

어제 우리는 Glue와 EMR으로 데이터를 변환하는 법을 배웠다. 그런데 실무에서 변환은 한 번 돌리고 끝나지 않는다. 새 데이터가 들어올 때마다, 혹은 매일 정해진 시각에 **추출 → 변환 → 검증 → 학습 → 평가**를 자동으로 반복해야 한다. 이 반복을 사람이 손으로 돌리면 실수가 나고 재현성이 깨진다.

오늘은 AWS에서 이 ML 워크플로를 자동화하는 두 축, **AWS Step Functions**와 **Amazon SageMaker Pipelines**를 다룬다. MLS-C01은 "어떤 오케스트레이션 도구를 언제 선택하는가"를 자주 묻는다.

## 왜 오케스트레이션이 필요한가

ML 워크플로는 여러 단계가 순서·조건·의존성을 갖고 엮여 있다. 예를 들어:

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

이런 분기·재시도·병렬 처리를 코드 한 덩어리로 관리하면 깨지기 쉽다. **오케스트레이터**는 각 단계를 노드로 만들고, 상태 전이·에러 처리·재시도를 선언적으로 정의하게 해 준다.

> 💡 **관련 이론**: 좋은 파이프라인의 핵심 가치는 **재현성(reproducibility)**과 **추적성(lineage)**이다. 같은 입력이면 언제 돌려도 같은 결과가 나와야 하고, 특정 모델이 "어떤 데이터·어떤 코드·어떤 파라미터"로 만들어졌는지 거슬러 추적할 수 있어야 한다. 자동화 파이프라인은 이 두 가지를 구조적으로 보장한다.

## AWS Step Functions — 범용 워크플로 오케스트레이터

Step Functions는 **AWS 서비스 전반을 상태 머신(state machine)으로 엮는** 서버리스 오케스트레이션 서비스다. 각 단계를 "상태(state)"로 정의하고, Amazon States Language(ASL)라는 JSON DSL로 흐름을 기술한다.

ML에서 Step Functions가 강한 지점:
- Glue 작업, Lambda, SageMaker 학습/처리/배치변환, ECS 등 **이질적인 서비스를 한 흐름에 묶을 수 있다**.
- `Choice`(분기), `Parallel`(병렬), `Retry`/`Catch`(재시도·예외 처리)를 선언적으로 표현한다.
- **SageMaker 통합 액션**이 내장되어 학습·튜닝·배치변환 작업을 직접 호출한다.

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

`.sync` 접미사는 "해당 작업이 끝날 때까지 기다린다"는 의미다. `Retry`와 `Catch`로 실패 시 재시도·알림 흐름을 선언적으로 처리하는 점에 주목하자.

> 💡 **관련 이론**: Step Functions는 ML 전용이 아니라 **범용 워크플로 도구**다. 따라서 ML 단계와 비-ML 단계(예: 데이터 추출, S3 정리, 외부 API 호출, 승인 대기)를 함께 묶어야 하는 광범위한 오케스트레이션에 강점이 있다.

## Amazon SageMaker Pipelines — ML 네이티브 파이프라인

SageMaker Pipelines는 **ML 워크플로 전용**으로 설계된 CI/CD 오케스트레이터다. Python SDK로 단계를 정의하면 SageMaker가 실행·추적·버저닝을 담당한다. ML 작업에 특화된 단계 타입을 제공하는 것이 특징이다.

주요 단계(step) 타입:
- `ProcessingStep` — 전처리·후처리(SageMaker Processing)
- `TrainingStep` — 모델 학습
- `TuningStep` — 하이퍼파라미터 튜닝
- `RegisterModel` / `ModelStep` — 모델 레지스트리 등록
- `ConditionStep` — 평가 지표 기준 분기(예: 정확도 ≥ 0.85일 때만 등록)

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

> 💡 **관련 이론**: SageMaker Pipelines는 실행마다 **lineage(계보)**를 자동 기록한다. 어떤 데이터셋·코드·하이퍼파라미터로 어떤 모델이 만들어졌는지가 SageMaker Model Registry와 연결되어 추적된다. 이는 규제 환경(설명 가능성·감사)에서 매우 중요한 기능이다.

## Step Functions vs SageMaker Pipelines — 선택 기준

| 관점 | Step Functions | SageMaker Pipelines |
|------|----------------|---------------------|
| 범위 | 범용(AWS 전반 오케스트레이션) | ML 전용 |
| 정의 방식 | ASL(JSON) / Workflow Studio | Python SDK |
| ML 통합 | SageMaker 액션 지원 | 네이티브, 모델 레지스트리·lineage 내장 |
| 비-ML 단계 | 강함(Lambda, Glue, 승인, SNS 등) | 제한적 |
| 적합 상황 | ML+비ML 혼합, 복잡한 분기·승인 | 순수 ML CI/CD, 추적성 중시 |

핵심 판단: **워크플로가 순수하게 ML 학습/평가/등록 중심이면 SageMaker Pipelines**, **ML 단계와 데이터 파이프라인·외부 시스템·승인 단계가 뒤섞이면 Step Functions**가 자연스럽다. 둘을 함께 쓰는 패턴(Step Functions가 상위에서 전체를 오케스트레이션하고, 그 안에서 SageMaker 작업 호출)도 흔하다.

> ⚠️ **함정**: "ML 작업이니까 무조건 SageMaker Pipelines"는 단순화된 오답이다. 만약 워크플로에 승인 대기, 여러 비-ML 시스템 연동, 복잡한 조건 분기가 많다면 범용성이 높은 Step Functions가 더 적합할 수 있다. 문제의 요구사항(비-ML 단계 비중, 추적성 요구)을 읽어 판단해야 한다.

## 트리거와 스케줄링

파이프라인을 "언제 돌릴 것인가"도 설계의 일부다.

- **Amazon EventBridge**: 일정(cron) 또는 이벤트(예: 새 데이터가 S3에 도착)에 반응해 파이프라인을 시작한다.
- **S3 이벤트 → Lambda → 파이프라인 시작**: 데이터 도착을 트리거로 삼는 전형적 패턴.
- **SageMaker Pipelines 스케줄**: EventBridge 규칙과 연동해 정기 실행.

> 🎯 **시나리오**: "매일 새벽 2시에 전날 로그를 전처리하고 모델을 재학습하되, 평가 정확도가 0.9 미만이면 배포하지 말고 데이터 팀에 알림을 보내라." → EventBridge cron으로 SageMaker Pipeline을 트리거하고, 파이프라인 내부에 `ConditionStep`(정확도 게이트)과 실패 시 SNS 알림을 두면 된다.

## 정리하며

오늘은 ML 학습 데이터 파이프라인을 자동화하는 두 도구를 비교했다. **Step Functions는 AWS 전반을 엮는 범용 오케스트레이터로 ML+비ML 혼합 워크플로에 강하고**, **SageMaker Pipelines는 ML 전용으로 lineage·모델 레지스트리 통합과 조건부 분기에 강하다**. 자동화의 진짜 가치는 재현성과 추적성이며, EventBridge로 스케줄·이벤트 트리거를 붙여 완전 자동 파이프라인을 완성한다.

내일은 데이터가 부족하거나 불균형할 때 이를 보완하는 **데이터 증강과 합성** 기법을 살펴본다.

---

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
