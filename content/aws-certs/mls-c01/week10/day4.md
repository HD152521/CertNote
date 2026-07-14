# Day 4 - Deployment Strategies: A/B Testing, Blue/Green, Canary, Shadow, Rollback

New models passing offline tests don't guarantee production wins. Real-world data shifts, latency changes, specific segments fail. Smart deployment risks incrementally, measures, rolls back fast if needed. Today covers **A/B testing** (compare side-by-side), **blue/green** (full swap + rollback), **canary** (gradual ramp), **shadow** (zero-risk test), and **rollback** chains.

## Foundation: ProductionVariant Traffic Weights

All strategies rest on one mechanism: **multiple Variants, traffic weights**.

```python
from sagemaker.session import production_variant

variant_a = production_variant("ModelA", "ml.m5.xlarge", initial_weight=90, initial_instance_count=2)
variant_b = production_variant("ModelB", "ml.m5.xlarge", initial_weight=10, initial_instance_count=1)
session.endpoint_from_production_variants("ab-endpoint", [variant_a, variant_b])
```

Weights 90/10 → 90% traffic to A, 10% to B. Adjust 90/10 → 50/50 → 0/100 over time. This simple lever powers all strategies.

> 💡 **Related Theory**: Two levers: (1) what % of users see new model? (2) how fast roll back? A/B tests both. Canary ramps gradually. Shadow risks zero. These differ precisely in exposure degree.

## A/B Testing: Compare Side-by-Side

Run both models simultaneously, collect **business KPIs** (clicks, conversion, retention).

```text
ModelA (old) 50%  ──┐
                   ├─ same endpoint, split by weight
ModelB (new) 50%  ──┘
→ collect KPI metrics from both → statistical test
```

- **Goal**: Statistical significance on business metrics, not just ML metrics
- **Variant target**: `TargetVariant` param lets specific tests force one model
- **Duration**: Run long enough for statistical power

## Blue/Green Deployment: Full Swap + Fast Rollback

Blue (running), Green (new version) run in parallel. Green fully validated, then flip all traffic. Rollback just re-flip.

```text
Blue(v1) 100% ──validate──> Green(v2) 100%   (full switch)
                             issue
                Green(v2) ──rollback──> Blue(v1) 100%
```

- **Advantage**: Instant switch, instant rollback (blue still running)
- **Risk**: 100% traffic hits Green all at once without gradual exposure
- **SageMaker default**: Typically implements blue/green on UpdateEndpoint

## Canary Deployment: Gradual Ramp

New version gets small % (5%) first, expand if healthy → 25% → 50% → 100%.

```text
v2 at 5% → (check metrics) → 25% → 50% → 100%
         → (metrics fail) → immediate 0% rollback
```

- **Advantage**: Catches problems in small segment
- **SageMaker deployment guards**: Canary/Linear traffic shift + CloudWatch alarm auto-rollback

```text
Deployment guard traffic shift modes:
  All-at-once : Full switch (blue/green)
  Canary      : Small ramp, then rest
  Linear      : Fixed % increments per period
```

## Shadow Deployment: Zero-Risk Test

Traffic → both old and new model, but **only old response returns to user**. New model's output logged, not shown.

```text
Request ──> Old model ──> User sees this response
         └─> New model ──> Logged (user doesn't see)
                          → compare responses/latency
```

- **When**: Validate new model on real traffic safely before canary
- **Advantage**: Zero user exposure to new model bugs
- **SageMaker Shadow Tests**: produ production Variant and shadow Variant side-by-side for log-only comparison

> 💡 **Related Theory**: Canary (real user exposure gradually), Shadow (zero user exposure, log-only) differ precisely in who sees results. A/B (intentional split for comparison), Canary (risk ramp), Shadow (risk none). Choose by tolerance.

## Rollback and Auto-Guard Rails

Manual rollback: previous EndpointConfig via UpdateEndpoint (blue alive → instant).

Auto-rollback: CloudWatch alarm breach → deployment guard halts, reverts.

Bake time: Post-switch, observe metrics before next step.

## Deployment Strategy Selector

```text
Compare models on live KPIs    → A/B Test
Full switch + instant rollback → Blue/Green
Gradual ramp + auto-rollback   → Canary (+guards)
No user risk validation        → Shadow
```

## Summary

Deployment isn't "launch or fail." A/B tests both (comparison). Blue/Green flips all instantly. Canary ramps safely. Shadow validates zero-risk. All use variant weights + traffic splits. Rollback fast — old version still running.

Next: Post-deployment — monitoring for drift.

## 📝 연습 문제

**문제 1.** 새 추천 모델을 실제 사용자에게 전혀 노출하지 않은 채, 프로덕션 트래픽에 대해 응답과 지연을 운영 모델과 비교 검증하고 싶다. 가장 적합한 전략은?

A) A/B 테스트  
B) 카나리 배포  
C) 섀도 배포(Shadow Testing)  
D) 블루/그린 배포  

**정답: C**  
해설: 섀도 배포는 트래픽을 새 모델에도 복제해 보내되 응답을 사용자에게 반환하지 않으므로 노출 위험이 0이면서 실제 분포로 검증할 수 있다. A/B(A)·카나리(B)·블루그린(D)은 모두 어느 정도 실제 사용자에게 새 모델 응답을 노출한다.

---

**문제 2.** 새 모델 버전을 처음에는 트래픽의 5%에만 보내고, CloudWatch 지표가 건강하면 25%, 50%, 100%로 단계 확대하며, 오류율이 급증하면 자동으로 되돌리고 싶다. 무엇을 사용해야 하는가?

A) All-at-once 트래픽 시프팅  
B) 배포 가드레일의 Canary 모드 + CloudWatch 알람 기반 자동 롤백  
C) Batch Transform 재실행  
D) 멀티모델 엔드포인트  

**정답: B**  
해설: 소량부터 점진 확대 + 지표 악화 시 자동 복귀는 배포 가드레일의 Canary(또는 Linear) 트래픽 시프팅에 CloudWatch 알람 기반 자동 롤백을 결합한 구성이다. All-at-once(A)는 한 번에 전체 전환, Batch(C)·MME(D)는 배포 전략이 아니다.

---

**문제 3.** 두 모델을 동일 엔드포인트에서 각각 50% 트래픽으로 동시에 운영하며, 클릭률 같은 비즈니스 KPI를 충분한 기간 수집해 어느 모델이 통계적으로 더 나은지 판단하려 한다. 이 방식은?

A) 섀도 배포  
B) 블루/그린 배포  
C) A/B 테스트  
D) 롤백  

**정답: C**  
해설: 두 모델을 가중치로 분할해 동시에 노출하고 실제 KPI를 비교해 우열을 가리는 것은 A/B 테스트다. 섀도(A)는 노출하지 않고, 블루/그린(B)은 비교가 아니라 전환에 초점, 롤백(D)은 복귀 동작이다.

---

**문제 4.** 블루/그린 배포의 주요 트레이드오프로 옳은 것은?

A) 전환 순간 100% 트래픽이 새 버전으로 가므로 단계적 노출이 없으면 위험이 한꺼번에 드러나지만, 블루가 살아 있어 롤백이 빠르다  
B) 새 버전에 트래픽을 항상 1%씩만 보낸다  
C) 사용자에게 새 버전 응답을 절대 보여주지 않는다  
D) 두 모델을 영구히 50/50으로 유지한다  

**정답: A**  
해설: 블루/그린은 그린을 완전히 띄운 뒤 한 번에 전환하므로 단계적 노출이 없으면 위험이 동시에 드러나지만, 블루 환경이 그대로 살아 있어 문제 시 즉시 롤백할 수 있다. 1%씩(B)은 카나리, 노출 안 함(C)은 섀도, 영구 50/50(D)은 A/B의 일시적 상태일 뿐이다.

---

**문제 5.** SageMaker에서 ProductionVariant의 트래픽 가중치를 90/10에서 0/100으로 점진 조정하는 행위가 직접적으로 가능하게 하는 배포 전략들의 공통 기반은?

A) Batch Transform 잡 스케줄  
B) Inferentia 칩의 컴파일 기능  
C) Neo의 하드웨어 최적화  
D) 하나의 엔드포인트에 여러 Variant를 두고 가중치로 트래픽을 분할하는 메커니즘  

**정답: D**  
해설: A/B·카나리·블루그린 같은 전략은 모두 한 엔드포인트 안의 다중 ProductionVariant와 트래픽 가중치 조정이라는 공통 메커니즘 위에서 동작한다. Batch(A)·Inferentia(B)·Neo(C)는 배포 트래픽 분할과 무관한 최적화/실행 도구다.

---
