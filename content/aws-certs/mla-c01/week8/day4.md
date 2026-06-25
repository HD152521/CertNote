# Day 4 - 재학습·모델 유지보수: 자동 재학습 파이프라인과 A/B·섀도 테스트

모니터링이 드리프트나 성능 저하를 감지했다면, 그 다음은 무엇인가? 사람이 매번 손으로 모델을 다시 학습시키고 배포하는 것은 느리고 실수가 잦다. 성숙한 ML 운영의 핵심은 **드리프트 감지 → 자동 재학습 → 안전한 재배포**가 하나의 파이프라인으로 닫히는 것이다. 오늘은 이 **재학습 루프**와, 새 모델을 안전하게 내보내는 **A/B 테스트·섀도(shadow) 테스트** 배포 전략을 다룬다.

MLA-C01은 MLOps 관점에서 "드리프트가 감지되면 어떻게 자동으로 대응하는가", "새 모델 버전을 위험 없이 검증하려면 어떤 배포 전략을 쓰는가"를 묻는다.

## 재학습이 필요한 신호

모델은 언제 다시 학습해야 할까? 트리거는 크게 셋이다.
- **드리프트 기반**: Model Monitor가 데이터/모델 품질 위반을 보고하면.
- **성능 기반**: 모델 품질 모니터의 정확도·F1이 임계치 아래로 떨어지면.
- **일정 기반**: 데이터가 빠르게 변하는 도메인에서 주기적으로(예: 매주).

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

> 🔍 **더 깊이**: Model Registry는 모델 버전을 카탈로그로 관리하며 각 버전에 승인 상태(Approved/Rejected)를 둔다. 재학습 파이프라인이 새 버전을 "PendingManualApproval"로 등록하면, 사람이 검토 후 승인할 때 비로소 배포 파이프라인(예: CodePipeline)이 트리거되게 할 수 있다. 완전 자동(조건 통과 즉시 배포)과 사람 승인(human-in-the-loop) 사이에서 위험도에 맞춰 선택한다.

## 안전한 재배포 1 — A/B 테스트

새 모델이 평가 데이터에서 좋았다 해도, 실제 트래픽에서 더 나으리란 보장은 없다. **A/B 테스트**는 한 엔드포인트에 여러 **프로덕션 배리언트(production variant)**를 두고 트래픽을 나눠 비교한다. 예컨대 기존 모델 90%, 새 모델 10%로 시작해 새 모델 성과가 좋으면 비중을 점차 올린다.

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

## 안전한 재배포 2 — 섀도 테스트

A/B 테스트는 새 모델이 일부 실사용자에게 **실제로 응답**한다. 그 응답이 나쁘면 그 사용자는 영향을 받는다. **섀도 테스트(shadow testing)**는 이 위험을 없앤다. 운영 트래픽의 사본을 새(섀도) 모델에도 보내지만, **섀도 모델의 응답은 사용자에게 반환하지 않고 기록만 한다**. 사용자는 항상 기존 모델의 응답을 받는다.

```python
# SageMaker Shadow Test: 프로덕션 배리언트와 섀도 배리언트를 함께 배포
# 섀도 모델은 동일 입력을 받아 추론하지만 결과는 로깅만 되고 사용자에게 가지 않는다
shadow_config = {
    "ShadowModelVariants": [
        {"ShadowModelVariantName": "model-v2-shadow", "SamplingPercentage": 100},
    ],
}
```

섀도 테스트는 "새 모델이 실제 운영 트래픽에서 어떻게 동작하는지 위험 없이 검증"하고 싶을 때의 정답이다. 지연·오류·예측 분포를 사용자 영향 없이 비교한 뒤, 만족하면 A/B나 전면 교체로 넘어간다.

> ⚠️ **함정**: A/B 테스트와 섀도 테스트를 혼동하지 말자. **A/B는 실사용자에게 새 모델 응답이 실제로 나간다**(위험 일부 존재, 성과를 비즈니스 지표로 비교 가능). **섀도는 새 모델 응답이 사용자에게 안 나가고 기록만 된다**(사용자 영향 0, 순수 기술 검증). "사용자에게 전혀 영향을 주지 않고 새 모델을 운영 데이터로 검증"이면 섀도, "트래픽을 나눠 점진적으로 전환"이면 A/B다.

## 배포 가드레일

전면 교체 시에는 **배포 가드레일(deployment guardrails)**로 안전하게 전환한다. **블루/그린(blue/green)**으로 새 환경을 띄운 뒤 한 번에 또는 **카나리(canary)·선형(linear)**으로 점진 전환하고, CloudWatch 알람이 울리면 자동 **롤백**한다.

## 정리하며

모델 유지보수의 닫힌 루프는 **모니터링(드리프트/성능 감지) → 트리거(CloudWatch Alarm + EventBridge/Lambda) → 재학습(SageMaker Pipelines) → 조건부 등록(Model Registry) → 안전한 재배포**다. 재학습 트리거는 비용 효율을 위해 일정 기반보다 **드리프트/성능 기반 이벤트 트리거**가 선호된다. 재학습한 모델은 평가 기준을 통과해야만 등록·배포해 회귀를 막는다. 재배포 전략은 위험도에 따라 고른다 — **섀도 테스트**는 사용자 영향 0으로 운영 트래픽 검증, **A/B 테스트**는 가중치 기반 점진 롤아웃과 실사용 성과 비교, **블루/그린·카나리 가드레일**은 자동 롤백을 갖춘 안전한 전면 전환이다.

다음 글에서는 Week 8 전체 — 데이터/모델 품질 드리프트, 편향·설명 드리프트(Clarify), 운영 모니터링(CloudWatch/X-Ray), 재학습·재배포 — 를 종합 복습한다.

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
