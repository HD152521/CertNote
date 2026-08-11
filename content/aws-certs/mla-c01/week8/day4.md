# Day 4 - 재학습·모델 유지보수: 자동 재학습 파이프라인과 A/B·섀도 테스트

## 📌 핵심 정리

- 성숙한 ML 운영은 **드리프트 감지 → 자동 재학습 → 안전한 재배포**가 하나의 닫힌 루프로 이어진다.
- 재학습 트리거는 일정 기반보다 **드리프트·성능 기반 이벤트 트리거**가 비용 효율적이다.
- 자동화 체인은 **Model Monitor 위반 → CloudWatch Alarm → EventBridge/Lambda → SageMaker Pipelines**.
- **ConditionStep**으로 평가 기준 통과 시에만 Model Registry에 등록해 성능 회귀를 막는다.
- 재배포는 위험도 순으로 — **섀도**(사용자 영향 0) → **A/B·카나리**(소수 노출) → **블루/그린**(가드레일·자동 롤백).

## 유지보수의 닫힌 루프

모니터링이 드리프트나 성능 저하를 감지했다면, 그 다음은 무엇인가? 사람이 매번 손으로 모델을 다시 학습시키고 배포하는 것은 느리고 실수가 잦다. 전체 그림은 아래처럼 한 바퀴를 돈다.

```text
        ┌────────────────── 운영 중인 엔드포인트 ──────────────────┐
        │                                                        │
        ▼                                                        │
  Model Monitor 위반                                              │
  (데이터/모델 품질, 편향, 기여도)                                    │
        │                                                        │
        ▼                                                        │
  CloudWatch 지표 → Alarm                                         │
        │                                                        │
        ▼                                                        │
  EventBridge 규칙 (또는 SNS → Lambda)                             │
        │                                                        │
        ▼                                                        │
  SageMaker Pipelines 실행                                        │
   ├ 전처리(Processing)                                           │
   ├ 학습(Training)                                               │
   ├ 평가(Evaluation)                                             │
   └ ConditionStep ──미달──▶ 등록 안 함(기존 모델 유지) ─────────────┤
              │                                                   │
            통과                                                  │
              ▼                                                   │
   Model Registry 등록 (Approved / PendingManualApproval)          │
              │                                                   │
              ▼                                                   │
   재배포: 섀도 → A/B·카나리 → 블루/그린 ────────────────────────────┘
```

MLA-C01은 MLOps 관점에서 "드리프트가 감지되면 어떻게 자동으로 대응하는가", "새 모델 버전을 위험 없이 검증하려면 어떤 배포 전략을 쓰는가"를 묻는다.

## 재학습이 필요한 신호

모델은 언제 다시 학습해야 할까? 트리거는 크게 셋이다.
- **드리프트 기반**: Model Monitor가 데이터/모델 품질 위반을 보고하면.
- **성능 기반**: 모델 품질 모니터의 정확도·F1이 임계치 아래로 떨어지면.
- **일정 기반**: 데이터가 빠르게 변하는 도메인에서 주기적으로(예: 매주).

| 트리거 | 강점 | 약점 | 어울리는 상황 |
|--------|------|------|--------------|
| 드리프트 기반 | 변화가 있을 때만 돌아 비용 효율 | 임계치 튜닝이 필요, 오탐 가능 | 변화가 산발적인 대부분의 도메인 |
| 성능 기반 | 실제 손해에 직접 반응 | ground truth를 기다려야 해 늦다 | 라벨이 빨리 확정되는 도메인 |
| 일정 기반 | 단순·예측 가능, 운영이 쉽다 | 변화 없는 기간에도 비용 발생 | 데이터가 꾸준히 바뀌는 도메인 |
| 데이터량 기반 | 신규 데이터가 충분히 쌓였을 때 학습 | 품질 저하와 무관하게 돌 수 있다 | 신규 데이터 유입이 학습의 병목일 때 |

> 💡 **관련 이론**: 무조건 자주 재학습하는 것이 정답은 아니다. 재학습에는 컴퓨팅 비용, 검증 시간, 새 모델이 오히려 더 나쁠 위험이 따른다. 그래서 "드리프트 감지 시 재학습"처럼 **이벤트 기반(event-driven) 트리거**가 비용 효율적이다. 일정 기반은 단순하지만, 변화가 없는 기간에도 재학습해 자원을 낭비할 수 있다. 시험에서 "불필요한 재학습 비용을 줄이려면"이라고 하면 일정 기반보다 드리프트 기반 트리거를 고른다.

## 자동 재학습 파이프라인의 구성

AWS에서 재학습 자동화의 중심은 **SageMaker Pipelines**다. 데이터 처리 → 학습 → 평가 → (조건부) 모델 등록의 단계를 정의하고, 외부 이벤트로 트리거한다.

전형적인 이벤트 기반 흐름:
1. Model Monitor가 드리프트 위반을 **CloudWatch 지표**로 보낸다.
2. **CloudWatch Alarm**이 ALARM 상태가 되어 **EventBridge** 규칙(또는 SNS→Lambda)을 발동한다.
3. **Lambda**(또는 EventBridge 타겟)가 **SageMaker Pipeline 실행**을 시작한다.
4. 파이프라인이 최신 데이터로 재학습하고, 평가 단계에서 성능이 기준을 통과하면 **Model Registry**에 새 버전을 등록한다.

```python
from sagemaker.workflow.pipeline import Pipeline
from sagemaker.workflow.condition_step import ConditionStep
from sagemaker.workflow.conditions import ConditionGreaterThanOrEqualTo

# 평가 정확도가 기준 이상일 때만 모델을 등록하는 조건 단계
cond = ConditionGreaterThanOrEqualTo(
    left=eval_accuracy, right=0.85,        # 정확도 0.85 미만이면 등록하지 않음
)
condition_step = ConditionStep(
    name="CheckAccuracy",
    conditions=[cond],
    if_steps=[register_model_step],         # 통과 시 Model Registry 등록
    else_steps=[],                          # 미달 시 아무것도 하지 않음(기존 모델 유지)
)
pipeline = Pipeline(name="retrain-pipeline", steps=[process_step, train_step,
                                                    eval_step, condition_step])
```

조건부 등록은 중요하다. 재학습한 모델이 기준 미달이면 자동 배포하지 않고 기존 모델을 유지해 **회귀(regression)**를 막는다.

Lambda에서 파이프라인을 시작하는 쪽은 이렇게 단순하다.

```python
import boto3
sm = boto3.client("sagemaker")

def lambda_handler(event, context):
    # CloudWatch Alarm → SNS/EventBridge가 넘긴 이벤트를 받아 재학습을 시작한다
    sm.start_pipeline_execution(
        PipelineName="retrain-pipeline",
        PipelineParameters=[
            {"Name": "InputDataUrl", "Value": "s3://my-bucket/latest/"},
            {"Name": "AccuracyThreshold", "Value": "0.85"},
        ],
    )
```

> 🔍 **더 깊이**: Model Registry는 모델 버전을 카탈로그로 관리하며 각 버전에 승인 상태(Approved/Rejected)를 둔다. 재학습 파이프라인이 새 버전을 "PendingManualApproval"로 등록하면, 사람이 검토 후 승인할 때 비로소 배포 파이프라인(예: CodePipeline)이 트리거되게 할 수 있다. 완전 자동(조건 통과 즉시 배포)과 사람 승인(human-in-the-loop) 사이에서 위험도에 맞춰 선택한다.

## 재배포 전략 한눈에

새 모델이 평가 데이터에서 좋았다 해도, 실제 트래픽에서 더 나으리란 보장은 없다. 그래서 배포 전략은 "얼마만큼의 위험을 감수할 것인가"로 고른다.

| 전략 | 사용자에게 응답이 가나 | 무엇을 비교할 수 있나 | 비용 | 롤백 |
|------|----------------------|---------------------|------|------|
| **섀도(Shadow)** | 아니오 (기록만) | 지연·오류·예측 분포 등 기술 지표 | 두 벌 추론 비용 | 섀도 중단만 하면 끝 |
| **A/B (프로덕션 배리언트)** | 예 (가중치만큼) | 기술 지표 + 클릭·전환 등 비즈니스 성과 | 배리언트 인스턴스 합 | 가중치를 0으로 되돌림 |
| **카나리 / 선형** | 예 (소수 → 점증) | 전환 중 이상 징후 | 전환 기간 동안 이중 용량 | 알람 기반 자동 롤백 |
| **블루/그린** | 예 (전환 후 전부) | 전환 후 전체 지표 | 전환 기간 이중 용량 | 알람 기반 자동 롤백 |

> 💡 **개념**: 섀도와 A/B는 목적이 다르다. 섀도는 "새 모델이 운영 트래픽에서 **터지지 않는가**"를 보는 **기술 검증**이고, A/B는 "새 모델이 실제로 **더 좋은 결과를 만드는가**"를 보는 **성과 검증**이다. 섀도는 사용자 응답이 없으니 클릭률·전환율 같은 비즈니스 지표를 애초에 잴 수 없다. 그래서 실무 순서는 섀도 → A/B다.

## 안전한 재배포 1 — A/B 테스트

**A/B 테스트**는 한 엔드포인트에 여러 **프로덕션 배리언트(production variant)**를 두고 트래픽을 나눠 비교한다. 예컨대 기존 모델 90%, 새 모델 10%로 시작해 새 모델 성과가 좋으면 비중을 점차 올린다.

```python
from sagemaker.session import production_variant

variant_a = production_variant(model_name="model-v1", instance_type="ml.m5.xlarge",
                               initial_instance_count=1, variant_name="ModelV1",
                               initial_weight=9)        # 트래픽 90%
variant_b = production_variant(model_name="model-v2", instance_type="ml.m5.xlarge",
                               initial_instance_count=1, variant_name="ModelV2",
                               initial_weight=1)        # 트래픽 10%
# 두 배리언트를 한 엔드포인트에 배포
session.endpoint_from_production_variants(name="ab-endpoint",
                                          production_variants=[variant_a, variant_b])
```

가중치(`initial_weight`)로 트래픽 분배를 조절하고, 실시간으로 비중을 바꿀 수 있어 점진적 롤아웃(canary)에 쓴다.

```python
# 재배포 없이 가중치만 조정해 새 모델 비중을 50%로 올린다
sm.update_endpoint_weights_and_capacities(
    EndpointName="ab-endpoint",
    DesiredWeightsAndCapacities=[
        {"VariantName": "ModelV1", "DesiredWeight": 5},
        {"VariantName": "ModelV2", "DesiredWeight": 5},
    ],
)
```

- 지연·오류 지표는 CloudWatch에서 `VariantName` 차원으로 나뉘어 나오므로 배리언트별 비교가 가능하다.
- 비즈니스 지표(전환율 등)까지 비교하려면 예측 결과와 이후 사용자 행동을 연결해 두어야 한다.

## 안전한 재배포 2 — 섀도 테스트

A/B 테스트는 새 모델이 일부 실사용자에게 **실제로 응답**한다. 그 응답이 나쁘면 그 사용자는 영향을 받는다. **섀도 테스트(shadow testing)**는 이 위험을 없앤다. 운영 트래픽의 사본을 새(섀도) 모델에도 보내지만, **섀도 모델의 응답은 사용자에게 반환하지 않고 기록만 한다**. 사용자는 항상 기존 모델의 응답을 받는다.

```text
             ┌──▶ 프로덕션 모델 v1 ──▶ 응답 ──▶ [사용자]
  요청 ──────┤
             └──▶ 섀도 모델 v2 ─────▶ 로그·지표만 저장 (사용자에게 안 감)
```

```python
# SageMaker Shadow Test: 프로덕션 배리언트와 섀도 배리언트를 함께 배포
# 섀도 모델은 동일 입력을 받아 추론하지만 결과는 로깅만 되고 사용자에게 가지 않는다
shadow_config = {
    "ShadowModelVariants": [
        {"ShadowModelVariantName": "model-v2-shadow", "SamplingPercentage": 100},
    ],
}
```

섀도 테스트는 "새 모델이 실제 운영 트래픽에서 어떻게 동작하는지 위험 없이 검증"하고 싶을 때의 정답이다. 지연·오류·예측 분포를 사용자 영향 없이 비교한 뒤, 만족하면 A/B나 전면 교체로 넘어간다. `SamplingPercentage`를 낮추면 섀도 추론 비용을 줄일 수 있다.

> ⚠️ **함정**: A/B 테스트와 섀도 테스트를 혼동하지 말자. **A/B는 실사용자에게 새 모델 응답이 실제로 나간다**(위험 일부 존재, 성과를 비즈니스 지표로 비교 가능). **섀도는 새 모델 응답이 사용자에게 안 나가고 기록만 된다**(사용자 영향 0, 순수 기술 검증). "사용자에게 전혀 영향을 주지 않고 새 모델을 운영 데이터로 검증"이면 섀도, "트래픽을 나눠 점진적으로 전환"이면 A/B다.

## 배포 가드레일

전면 교체 시에는 **배포 가드레일(deployment guardrails)**로 안전하게 전환한다. **블루/그린(blue/green)**으로 새 환경을 띄운 뒤 한 번에 또는 **카나리(canary)·선형(linear)**으로 점진 전환하고, CloudWatch 알람이 울리면 자동 **롤백**한다.

| 트래픽 전환 방식 | 어떻게 옮기나 | 고르는 순간 |
|-----------------|--------------|-------------|
| 한 번에(all at once) | 전량을 즉시 새 환경으로 | 위험이 낮고 빠르게 끝내고 싶을 때 |
| 카나리(canary) | 소량 먼저 → 관찰 후 나머지 전량 | 초기 이상을 최소 피해로 잡고 싶을 때 |
| 선형(linear) | 일정 비율씩 여러 번 나눠 이동 | 부하 변화를 완만하게 가져가고 싶을 때 |

- 자동 롤백은 **CloudWatch 알람**과 묶어야 작동한다. 알람을 안 걸어두면 "가드레일 배포인데 롤백이 안 되는" 상태가 된다.
- 전환 중에는 구·신 환경이 동시에 떠 있어 **일시적으로 용량 비용이 두 배**가 된다.

## 재학습·재배포가 꼬일 때: 증상 → 원인 → 조치

| 증상 | 흔한 원인 | 조치 |
|------|-----------|------|
| 드리프트는 감지되는데 재학습이 안 돈다 | 알람은 있으나 EventBridge/Lambda 연결 누락 | 알람 → EventBridge 규칙 → `start_pipeline_execution` 체인 연결 |
| 재학습 비용이 계속 증가한다 | 일정 기반 트리거로 변화 없어도 매번 학습 | 드리프트·성능 이벤트 기반 트리거로 전환 |
| 재학습 후 오히려 성능이 나빠졌다 | 조건 없이 자동 등록·배포(회귀 방지 장치 없음) | `ConditionStep`으로 기준 통과 시에만 등록 |
| 파이프라인이 권한 오류로 실패 | 실행 역할에 S3·ECR·SageMaker 권한 부족 | 파이프라인 실행 역할 권한 정비 |
| A/B 결과가 해석되지 않는다 | 트래픽이 너무 적어 차이가 통계적으로 안 잡힘 | 관측 기간을 늘리거나 새 모델 가중치를 상향 |
| 섀도 테스트인데 비용이 예상보다 크다 | 섀도 샘플링 100%로 두 벌 추론 | `SamplingPercentage` 하향, 검증 후 섀도 종료 |
| 블루/그린 전환 후 문제가 생겼는데 롤백이 안 됐다 | 자동 롤백용 CloudWatch 알람 미설정 | 전환 정책에 알람을 연결하고 임계치를 사전 검증 |
| 새 모델이 승인 없이 바로 나갔다 | Registry 등록 상태가 자동 승인 | `PendingManualApproval`로 등록해 사람 검토 단계 삽입 |

다음 글에서는 Week 8 전체 — 데이터/모델 품질 드리프트, 편향·설명 드리프트(Clarify), 운영 모니터링(CloudWatch/X-Ray), 재학습·재배포 — 를 종합 복습한다.

## 📖 용어

- **닫힌 루프(closed loop)** : 감지 → 트리거 → 재학습 → 재배포 → 다시 감지로 스스로 돌아가는 운영 구조.
- **이벤트 기반 트리거** : 정해진 시간이 아니라 드리프트·성능 위반 같은 사건이 났을 때만 재학습을 시작하는 방식.
- **SageMaker Pipelines** : 전처리·학습·평가·등록 단계를 묶어 실행하는 ML 워크플로 서비스. 재학습 자동화의 중심.
- **ConditionStep** : 평가 지표가 기준을 넘을 때만 다음 단계를 실행하는 조건 분기 단계. 성능 회귀를 막는 안전장치.
- **Model Registry** : 모델 버전을 카탈로그로 관리하고 승인 상태(Approved/PendingManualApproval 등)를 부여하는 저장소.
- **프로덕션 배리언트** : 한 엔드포인트 안에 공존하는 모델 슬롯. 가중치로 트래픽 비중을 나눈다.
- **A/B 테스트** : 배리언트 가중치로 트래픽을 나눠 새 모델의 실제 성과를 비교하는 방식. 새 응답이 사용자에게 나간다.
- **섀도 테스트** : 운영 트래픽 사본을 새 모델에 보내되 응답은 기록만 하는 방식. 사용자 영향이 0이다.
- **카나리 / 선형 전환** : 새 버전으로 트래픽을 소량 먼저 / 일정 비율씩 나눠 옮기는 점진 전환 방식.
- **배포 가드레일** : 블루/그린·카나리 전환에 CloudWatch 알람 기반 자동 롤백을 붙인 안전 배포 장치.

---

## 📝 연습 문제

**문제 1.** 데이터가 빠르게 변하지만 변화가 없는 기간도 많은 도메인에서, 재학습 비용을 최소화하면서도 성능 저하에 대응하려면 가장 적절한 재학습 트리거는?

A) 매시간 무조건 재학습  
B) Model Monitor의 드리프트/성능 위반을 트리거로 하는 이벤트 기반 재학습  
C) 모델을 절대 재학습하지 않음  
D) 1년에 한 번 재학습  

**정답: B**  
해설: 드리프트/성능 위반 이벤트가 발생할 때만 재학습하면 변화가 없는 기간의 불필요한 재학습 비용을 피하면서 저하에는 즉시 대응한다. A는 변화 없는 기간에 자원을 낭비하고, C는 드리프트를 방치하며, D는 빠른 변화에 너무 느리게 대응한다.

---

**문제 2.** 새 모델 버전을 실제 운영 트래픽으로 검증하되, 사용자에게는 어떤 영향도 주고 싶지 않다. 새 모델의 응답은 기록만 하고 사용자에게 반환하지 않으려면?

A) A/B 테스트(트래픽 50:50 분할)  
B) 섀도 테스트(shadow testing)  
C) 블루/그린 전면 전환  
D) 새 모델을 바로 100% 트래픽에 배포  

**정답: B**  
해설: 섀도 테스트는 운영 트래픽의 사본을 새 모델에 보내 추론·기록하되 응답을 사용자에게 반환하지 않으므로 사용자 영향이 0이다. A는 일부 사용자에게 새 모델 응답이 실제로 나가고, C·D는 새 모델이 사용자에게 직접 서비스되어 위험이 있다.

---

**문제 3.** SageMaker Pipelines 재학습 파이프라인에서, 새로 학습한 모델의 평가 정확도가 기준 미만일 때 자동 배포를 막으려면?

A) 평가 단계를 생략한다  
B) ConditionStep으로 정확도가 기준 이상일 때만 Model Registry에 등록  
C) 항상 새 모델을 등록한다  
D) 엔드포인트를 삭제한다  

**정답: B**  
해설: ConditionStep으로 평가 지표가 기준을 통과할 때만 모델을 등록(if_steps)하고 미달이면 등록하지 않게 하면 성능 회귀를 자동으로 막는다. A는 검증을 없애 위험하고, C는 나쁜 모델도 배포되며, D는 서비스를 중단시키는 무관한 동작이다.

---

**문제 4.** A/B 테스트에서 기존 모델과 새 모델로 트래픽을 나누는 SageMaker의 메커니즘은?

A) 별도의 엔드포인트 두 개를 클라이언트가 직접 분기  
B) 한 엔드포인트에 여러 프로덕션 배리언트(production variant)를 두고 가중치로 트래픽 분배  
C) S3 버킷 정책  
D) IAM 역할 분리  

**정답: B**  
해설: SageMaker는 한 엔드포인트에 여러 프로덕션 배리언트를 두고 `initial_weight`로 트래픽 비중을 나눠 A/B 테스트를 수행하며, 가중치를 실시간으로 조정해 점진 롤아웃이 가능하다. A는 클라이언트 측 복잡성을 키우고, C·D는 트래픽 분배와 무관하다.

---

**문제 5.** 드리프트 감지부터 재학습 시작까지의 자동화 체인으로 가장 적절한 순서는?

A) Model Monitor 위반 → CloudWatch Alarm → EventBridge/Lambda → SageMaker Pipeline 실행  
B) S3 업로드 → DynamoDB → 수동 재학습  
C) X-Ray 트레이스 → Clarify → 엔드포인트 삭제  
D) CloudWatch Logs → SNS만으로 재학습 완료  

**정답: A**  
해설: Model Monitor가 위반을 CloudWatch 지표로 보내면 알람이 ALARM이 되고, EventBridge 규칙이나 Lambda가 SageMaker Pipeline 재학습 실행을 트리거하는 것이 표준 자동화 체인이다. B는 수동이고, C는 무관한 서비스 조합이며, D는 SNS 알림만으로 재학습이 완료되지 않는다.

---
