# Day 5 - Week 6 Synthesis: Inference Deployment Review

This week covered inference deployment—bringing trained models into production. One core message: **inference mode choice is driven by request pattern, not algorithm.** Is traffic steady or sporadic? Immediate response needed? Payload/runtime size? Where to cut cost? Today we weave Days 1–4 into single decision flow—ready to unpack in exam.

## 4 Inference Options Totaled

Re-etch Day 1's core table:

| Option | Response | Traffic | Payload/Runtime | Always-on Cost |
|--------|----------|---------|-----------------|----------------|
| Real-time | Sync, ms–sec | Steady | <6MB, <60s | Yes (min 1) |
| Serverless | Sync, ms–sec | Sporadic | <4MB, <60s | No (scale to 0) |
| Async | Queue-based async | Variable, long | <1GB, <60m | No (scale to 0) |
| Batch Transform | Job-based | Bulk | Full dataset | No (terminates) |

```text
Decision Tree
Immediate response needed?
 ├─ No → entire dataset bulk? → Yes: Batch Transform / No (individual, large payload, long): Async
 └─ Yes → steady traffic? → Yes: Real-time / No (sporadic, cold-start tolerable): Serverless
Extra constraint: payload >6MB or runtime >60s → real-time/serverless out, async/batch in
```

> 💡 **Related Theory**: 4 options root in "always-on cost vs latency vs throughput" triangle tradeoff. Real-time minimizes latency, costs always-on. Serverless zeroes cost, accepts cold-start latency. Async handles big jobs, queue delay. Batch maximizes throughput, kills immediacy. Exams embed which to prioritize in scenario. "under 50ms" prioritizes latency (real-time), "idle wastes money" prioritizes cost (serverless), "1M records at night" prioritizes throughput (batch).

## Real-time Endpoint Review

Real-time is anchored by **3-layer structure**. Model (artifact + container) → EndpointConfig (instance type/count, ProductionVariant weights) → Endpoint (HTTPS entity). This split enables zero-downtime blue/green deploy, A/B testing (weight distribution), shadow testing (discard response, verify).

**Auto-scaling** uses `SageMakerVariantInvocationsPerInstance` target tracking as standard, maintains min 1 instance (0 forbidden). Sudden spikes outrun auto-scale, so **scheduled scaling** or higher `MinCapacity` pre-positions.

**Instance choice**: traditional ML (XGBoost) = CPU (m5/c5), deep-learning = GPU (g4dn/g5), deep-learning cost cut = Inferentia (inf1/inf2). Uncertain? **Inference Recommender** load-tests, recommends optimal.

> ⚠️ **Trap**: Two favorite wrong answers. ① Attach GPU to XGBoost—tree models gain almost nothing from GPU, CPU wins. ② Scale real-time endpoint to 0—real-time enforces min 1; for 0 need serverless/async.

## Advanced Inference Review — What to Bundle in One Endpoint

Day 3's four patterns, one line each:

- **MME (Multi-model)**: same container + hundreds to thousands models, `TargetModel` spec, dynamic S3 load. "Many same-type models to cut endpoint cost."
- **MCE (Multi-container)**: different framework containers, max 15, `TargetContainerHostname` spec. "TensorFlow and PyTorch in one endpoint."
- **Inference Pipeline**: preprocessing → inference → postprocessing linear container chain (2–15), handle in single call. "Training-serving consistency (prevent skew)."
- **Inferentia (inf1/inf2)**: cut deep-learning inference cost/latency, needs Neuron compile. Elastic Inference legacy (fractional GPU), Inferentia replaces.

> 🔍 **Deep Dive**: MME vs MCE is exam's most frequent confuse pair. Deciding keywords: "frameworks same/different?" and "models hundreds/few?" Same container + many = MME, different containers + few = MCE. Inference Pipeline differs: not "pick which," but "sequential chain." Input flows through one container to next.

## Batch & Serverless Deep Review

**Batch Transform** is bulk's cheapest option. Throughput tuned via `InstanceCount` (parallel), `SplitType=Line` (record split), `BatchStrategy=MultiRecord`/`MaxPayloadInMB`/`MaxConcurrentTransforms`. Inputs sharded across files or split-capable format enables distribution. Match predictions to source IDs via `input_filter`/`output_filter`/`join_source`.

**Serverless**: specify `MemorySize` (1–6GB) + `MaxConcurrency` only, scales to 0. Cold-start issue? **Provisioned Concurrency** pre-warms (some always-on cost). Cost advantage valid only "idle abundant," steady high traffic favors real-time.

> 💡 **Related Theory**: Cost optimization's big picture: "eliminate idle cost." When traffic drops to 0, serverless/async/batch can zero that window's cost. Inverse: traffic always high → real-time + auto-scaling + (many models?) MME + (deep-learning?) Inferentia cut unit cost. Nearly all inference cost scenarios reduce to these two branches.

## Integrated Scenario Map

Exam keyword → answer map directly:

- "Fraud decision 50ms, steady traffic" → Real-time
- "Internal tool, occasional, lots idle, first delay OK" → Serverless
- "200MB image, 5min processing, individual request, result later" → Async
- "Nightly 10M scoring, no urgency" → Batch Transform
- "1,500 stores, same model type, occasional calls" → MME
- "TensorFlow + PyTorch, one endpoint" → MCE
- "Same preprocessing to inference, prevent skew" → Inference Pipeline
- "Deep-learning inference, GPU cost burden" → Inferentia
- "Decide instance type by data" → Inference Recommender
- "Deploy new model, zero downtime" → new EndpointConfig + update_endpoint (blue/green)

## Summary

Week 6 one-liner: **Request pattern decides inference option.** Immediacy, traffic, payload, cost split 4 options (real-time/serverless/async/batch); cost concerns narrow to many models → MME, deep-learning → Inferentia, high idle → scale-to-zero options. Bundle choice: MME (same container many), MCE (different containers few), pipeline (sequential chain). Master this decision tree and keyword map, inference domain largely solves.

Next week: deployed model operations—orchestration and monitoring.

---

## 📝 연습 문제

**문제 1.** 한 추론 워크로드가 "개별 요청, 입력 페이로드 300MB, 처리 약 10분, 결과는 완료 후 S3에서 수령"이라는 요구를 가진다. 가장 적절한 옵션은?

A) 실시간 엔드포인트  
B) 서버리스 추론  
C) 비동기 추론  
D) 배치 변환  

**정답: C**  
해설: 페이로드 300MB와 처리 10분은 실시간/서버리스 한계(6MB·4MB / 60초)를 초과하고, 개별 요청을 큐로 받아 결과를 S3에 저장하는 패턴은 비동기 추론(최대 1GB·60분)과 정확히 일치한다. A·B는 페이로드·시간 제약으로 탈락하고, D는 전체 데이터셋 일괄 방식이라 "개별 요청" 패턴과 다르다.

---

**문제 2.** 멀티모델 엔드포인트(MME)와 멀티컨테이너 엔드포인트(MCE)의 핵심 구분 기준으로 가장 정확한 것은?

A) MME는 콜드 스타트가 없고 MCE는 있다  
B) MME는 동일 컨테이너로 수백~수천 모델을 동적 로드하고, MCE는 서로 다른 프레임워크 컨테이너를 최대 15개 둔다  
C) MME는 배치 전용, MCE는 실시간 전용이다  
D) 둘 다 전처리→추론 순차 체인을 실행한다  

**정답: B**  
해설: MME는 같은 컨테이너를 공유하며 다수 모델을 S3에서 동적 로드(`TargetModel`)하고, MCE는 서로 다른 프레임워크 컨테이너를 한 엔드포인트에 최대 15개 배치(`TargetContainerHostname`)하는 점이 핵심 구분이다. A는 잘못된 일반화이고, C는 둘 다 실시간 엔드포인트 변형이며, D는 순차 체인 실행은 추론 파이프라인의 특성이다.

---

**문제 3.** 실시간 엔드포인트에 오토스케일링을 적용했는데도 예측 가능한 대규모 트래픽 급증(연말 세일) 시 지연이 튄다. 가장 적절한 보완책은?

A) MaxCapacity를 1로 줄인다  
B) 예약 스케일링(scheduled scaling)으로 세일 전 미리 용량을 확보하거나 MinCapacity를 높인다  
C) 서버리스로 전환한다  
D) 인스턴스 타입을 CPU로 낮춘다  

**정답: B**  
해설: 오토스케일링은 새 인스턴스 기동·헬스체크에 시간이 걸려 급격한 스파이크를 즉시 못 따라가므로, 예측 가능한 급증에는 예약 스케일링으로 미리 용량을 늘리거나 `MinCapacity`를 높여 대비한다. A는 용량을 줄여 악화시키고, C는 콜드 스타트로 스파이크에 더 취약하며, D는 성능을 낮춰 지연을 키운다.

---

**문제 4.** 다음 중 추론 비용을 줄이려는 시나리오와 적절한 기법의 연결로 잘못된 것은?

A) 같은 종류 모델 수백 개 → 멀티모델 엔드포인트(MME)  
B) 트래픽이 0까지 떨어지는 간헐적 워크로드 → 서버리스/비동기  
C) 대규모 딥러닝 추론의 GPU 비용 부담 → AWS Inferentia  
D) XGBoost 추론 비용 절감 → GPU(p4d) 인스턴스로 전환  

**정답: D**  
해설: XGBoost 같은 트리 기반 모델은 GPU 병렬화 이득이 거의 없어 고성능 GPU(p4d)로 전환하면 비용만 늘고 효과가 없다 — CPU 인스턴스가 적절하다. A·B·C는 각각 다수 모델 통합(MME), 유휴 0 스케일(서버리스/비동기), 딥러닝 추론 가속(Inferentia)으로 모두 올바른 비용 절감 연결이다.

---

**문제 5.** 운영 중인 실시간 엔드포인트에 새 모델을 배포하면서, 신모델 응답을 사용자에게 노출하지 않고 프로덕션 트래픽으로 성능을 먼저 검증하려 한다. 가장 적절한 방법은?

A) ProductionVariant 가중치를 50:50으로 둔 A/B 테스트  
B) Shadow testing으로 트래픽 사본을 신모델에 보내고 응답은 폐기  
C) 엔드포인트를 삭제 후 재생성  
D) 배치 변환으로 과거 데이터를 재처리  

**정답: B**  
해설: Shadow testing은 프로덕션 트래픽 사본을 신모델로 보내되 응답을 사용자에게 반환하지 않고 폐기하므로, 실사용자 영향 없이 신모델 성능을 검증할 수 있다. A는 사용자 절반이 신모델 응답을 실제로 받으므로 "노출 없음" 조건을 위반하고, C는 다운타임을 유발하며, D는 실시간 프로덕션 트래픽 검증이 아니다.

---
