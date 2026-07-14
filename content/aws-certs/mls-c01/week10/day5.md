# Day 5 - Week 10 Review: ML Implementation & Operations 1 — Deployment & Inference

This week covered "how to release trained models to production." Inference option selection (Day 1), real-time endpoint operations (Day 2), inference optimization (Day 3), deployment strategies (Day 4) look separate but form one decision flow: which inference mode → which endpoint config → how to optimize → how to deploy safely. Today we compress this flow into one page and organize keywords that split answers on the exam.

## Week 10 Decision Flow at a Glance

```text
[1] Choose Inference Mode
    Offline bulk → Batch Transform
    Online + large payload/long process → Asynchronous
    Online + sparse traffic → Serverless
    Online + steady traffic/low latency → Real-time
        │
[2] (Real-time) Endpoint Operations
    Zero-downtime replacement: separate EndpointConfig + UpdateEndpoint
    Cost/stability: auto-scaling (Target Tracking)
    Scale: Multi-Model (MME) / Multi-Container (MCE) / inference pipeline
        │
[3] Inference Optimization
    Reduce latency: Neo compilation, faster instances
    Reduce cost: Elastic Inference, Inferentia, Serverless
    Increase throughput: batch inference, auto-scale add instances
        │
[4] Safe Deployment
    Zero-exposure validation: shadow
    Few→expand + auto rollback: Canary (deployment guardrails)
    Real-traffic KPI compare: A/B
    Full switch + fast rollback: Blue/Green
```

> 💡 **Related Theory**: Exam questions almost always ask [1]~[4] slots. Key skill: grab keywords from the prompt (traffic pattern, payload size, latency/cost/throughput need, user exposure) and map to the correct slot.

## Day 1 Review: Inference Options Essential Table

```text
Option          Latency  Traffic    Payload/Time   Idle Cost
Real-time       ms       Continuous 6MB / 60s      Always charged
Serverless      seconds  Sparse     4MB / 60s      Free (cold start)
Asynchronous    quasi    Queued/big 1GB / 1 hour   0, scalable
Batch           Offline  Bulk once  Large          Job time only
```

Most common traps: "sparse traffic with always-on Real-time" → use Serverless; "500MB payload on Real-time" → exceeds 6MB limit, use Asynchronous.

## Day 2 Review: Endpoint Operations

- **3-tier**: Model → EndpointConfig → Endpoint. Separation enables zero-downtime replacement.
- **Auto-scaling**: Target Tracking + `SageMakerVariantInvocationsPerInstance` default. MinCapacity ≥ 1 (full 0 only for Serverless/Async).
- **3 Scale Patterns**:
  - MME = same container, thousands different models dynamically loaded (cost savings)
  - MCE = different containers (Direct/Serial)
  - Inference pipeline = preprocess→predict→postprocess serial (prevent training-serving skew)

## Day 3 Review: Inference Optimization

```text
Neo            : Compile for target hardware. Maintain accuracy, improve speed/memory. Edge strong
Elastic Infer. : Attach partial GPU acceleration to CPU instance (cost savings)
Inferentia     : Inference-only chip (Inf1/Inf2). High throughput, cost-efficient
Trainium       : Training-only chip (confusion alert — NOT inference)
Model lightweighting : Quantization (INT8), pruning, knowledge distillation
```

Match by need: lower latency→Neo/fast instances, lower cost→EI/Inferentia/Serverless, higher throughput→batch/Inferentia.

## Day 4 Review: Deployment Strategies

```text
A/B        : Compare KPI of two models on real traffic (need statistical significance)
Blue/Green : Full switch + blue alive for fast rollback
Canary     : Few (5%)→gradual expand, deployment guardrails + CloudWatch auto-rollback
Shadow     : Return responses to users — zero-risk validation
```

Trickiest distinctions: "zero user exposure + real-traffic validation" = shadow; "small exposure→expand + auto-return" = canary; "split exposure comparison" = A/B.

## Integrated Scenario Approach

When encountering exam prompts, grab keywords in this order:

```text
1. Online or offline?                    (need real-time response?)
2. Payload size and processing time?     (exceed 6MB/60s?)
3. Traffic pattern?                      (continuous/sparse)
4. What to reduce?                       (latency/cost/throughput)
5. Expose new model to users?            (shadow/canary/A-B/blue-green)
```

These five questions cover all Week 10 decision slots.

## Common Traps Summary

```text
Trap                                     → Correct Fix
Sparse traffic with always-on Real-time   → Serverless or Async (0-scale)
Large payload/long process on Real-time   → Asynchronous (1GB/1 hour)
Different framework models in MME         → MCE (different containers needed)
Preprocessing consistency issue           → Inference pipeline (serial containers)
Reduce edge latency                       → Neo compilation
Training chip mistaken for Inferentia     → Inferentia=inference, Trainium=training
Validate with zero user impact            → Shadow deployment
Safe gradual deploy + auto rollback       → Canary/Linear deployment guardrails
```

## Wrap-up

Week 10 moved beyond "making models work" to "operating them efficiently and safely." If you've internalized the flow (inference option → endpoint operations → optimization → deployment strategy) and how keywords split answers at each stage, you've achieved this week's goal. Next week (Week 11) continues ML implementation and operations' second axis — monitoring, model drift detection, security, and cost governance.

## 📝 연습 문제

**문제 1.** 한 회사가 온라인 추천 API를 운영한다. 트래픽은 지속적이고 저지연이 필수이며, 추론 지연을 더 줄이기 위해 학습된 PyTorch 모델을 대상 인스턴스에 맞게 컴파일하려 한다. 추론 방식과 최적화 도구의 올바른 조합은?

A) Batch Transform + Trainium  
B) Real-time Endpoint + SageMaker Neo  
C) Serverless + Elastic Inference  
D) Asynchronous + 멀티모델 엔드포인트  

**정답: B**  
해설: 지속 트래픽·저지연은 Real-time, 정확도 유지하며 지연을 줄이는 컴파일은 Neo다. Batch+Trainium(A)은 오프라인·학습칩으로 어긋나고, Serverless(C)는 콜드스타트로 저지연 부적합, Asynchronous(D)는 준실시간이라 즉시 응답 요구에 맞지 않는다.

---

**문제 2.** 학습 시 Scikit-learn 전처리 후 XGBoost로 예측했고, 동일 프레임워크의 고객별 모델이 수천 개다. (a) 전처리-예측 정합성 보장과 (b) 수천 모델의 비용 효율 호스팅에 각각 알맞은 기능은?

A) (a) 추론 파이프라인, (b) 멀티모델 엔드포인트  
B) (a) 멀티모델 엔드포인트, (b) 추론 파이프라인  
C) (a) 블루/그린, (b) 카나리  
D) (a) Neo, (b) Inferentia  

**정답: A**  
해설: 전처리→예측을 한 요청으로 묶어 학습-서빙 스큐를 막는 것은 추론 파이프라인이고, 동일 프레임워크 모델 수천 개를 공유 인스턴스에 동적 로딩해 비용을 줄이는 것은 멀티모델 엔드포인트다. 나머지 조합은 역할이 뒤바뀌거나(B) 배포 전략·최적화 도구(C, D)로 목적이 다르다.

---

**문제 3.** 새 모델을 프로덕션 트래픽으로 검증하되 사용자에게는 절대 그 응답을 보여주지 않으려 한다. 적절한 배포 전략은?

A) A/B 테스트  
B) 블루/그린  
C) 섀도 배포  
D) 카나리  

**정답: C**  
해설: 섀도 배포는 트래픽을 복제해 새 모델에도 보내지만 응답을 반환하지 않아 사용자 노출이 0이다. A/B(A)·블루그린(B)·카나리(D)는 모두 어느 정도 새 모델 응답을 실제 사용자에게 제공한다.

---

**문제 4.** 매일 밤 전체 고객 대상 일괄 예측을 수행하며, 상시 엔드포인트 비용을 없애고 싶다. 또한 별도 배포 전략이나 트래픽 분할은 필요 없다. 올바른 선택은?

A) Real-time Endpoint + 카나리 배포  
B) Batch Transform  
C) Serverless Inference + A/B 테스트  
D) Asynchronous + 섀도 배포  

**정답: B**  
해설: 실시간 응답이 불필요한 대량 일괄 처리 + 상시 비용 제거는 Batch Transform이다(잡 실행 시간만 과금). 나머지는 온라인 추론 방식에 불필요한 배포 전략을 결합한 것으로 시나리오와 맞지 않는다.

---

**문제 5.** 다음 매칭 중 잘못된 것은?

A) 새 버전을 5%→100%로 점진 확대하며 알람 시 자동 복귀 — 배포 가드레일 Canary  
B) 인스턴스당 호출 수를 일정하게 유지 — Target Tracking 오토스케일링  
C) 500MB 페이로드·8분 처리 온라인 추론 — Real-time Endpoint  
D) 추론 전용 커스텀 칩으로 고처리량·비용 효율 — Inferentia  

**정답: C**  
해설: 500MB·8분은 Real-time의 6MB·60초 제한을 크게 초과하므로 Real-time이 아니라 Asynchronous(1GB·1시간)가 맞다. 따라서 C가 잘못된 매칭이다. A(카나리 자동 롤백), B(Target Tracking), D(Inferentia)는 모두 올바른 매칭이다.

---
