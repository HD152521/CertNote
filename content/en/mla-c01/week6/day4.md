# Day 4 - Batch & Serverless Inference Deep Dive: Throughput Tuning & Cost Tradeoffs

Day 1 surveyed 4 inference options. Days 2–3 covered real-time and advanced patterns. Today we dig into the other two sides of synchronous endpoints: **batch transform** and **serverless inference**. Both share "always-on cost → 0," but their mechanics and fit scenarios differ completely. Batch handles bulk data at once; serverless handles sporadic individual requests.

Exams test tuning parameters here directly. Batch transform: how to boost throughput (instance count, mini-batch, split). Serverless: how to handle concurrency and cold starts (MaxConcurrency, Provisioned Concurrency). Build numeric intuition for cost tradeoffs.

## Batch Transform — Throughput Tuning

Batch transform reads bulk input from S3, runs inference in bulk, writes results to S3. Three levers boost throughput:

- **InstanceCount**: More instances = data spreads, parallel processing. Most direct horizontal scaling.
- **Data Split (SplitType)**: `Line` (record per line), `RecordIO`, `TFRecord`, etc. split large files record-by-record, distribute across instances/batches.
- **Mini-batch (BatchStrategy, MaxPayloadInMB, MaxConcurrentTransforms)**: tune record-bundle size sent to model once and concurrent request count.

```python
from sagemaker.transformer import Transformer

transformer = Transformer(
    model_name="churn-model",
    instance_count=8,                 # 8 instances parallel processing
    instance_type="ml.m5.xlarge",
    strategy="MultiRecord",           # multi-record per mini-batch
    max_payload=6,                    # max 6MB mini-batch
    max_concurrent_transforms=4,      # 4 concurrent per instance
    output_path="s3://bkt/out/",
)
transformer.transform(
    data="s3://bkt/in/",
    content_type="text/csv",
    split_type="Line",                # split line-by-line
)
```

`strategy="MultiRecord"` bundles multiple records per request to boost throughput; `SingleRecord` sends one per request (model takes single input only). `MaxPayloadInMB` and `MaxConcurrentTransforms` tune per-instance load.

> 💡 **Related Theory**: Batch throughput = "parallelism degree × per-instance efficiency." More instances approaches linear speedup but costs scale; data split across files or via `SplitType` enables distribution gains. Single huge unsplittable input file = one instance bears all, no scaling. So batch inputs should be **sharded across files** or in split-capable format—tuning begins there.

> ⚠️ **Trap**: Batch transform makes re-joining input records and output predictions tricky. To output prediction + input ID together, use `input_filter`/`output_filter`/`join_source` params (JSONPath) to merge input portion into output. "How to match predictions to source records?" is a favorite exam snare.

## Batch vs Real-time — When Batch Wins

Say 1 million records via same model. Real-time endpoint: 1M calls, always-on instance cost + call overhead, spike management too. Batch transform: spin cluster momentarily, distribute 1M across it, shutdown when done—cost only on runtime.

> 🔍 **Deep Dive**: Real-time optimized for "per-request instant response"—low per-request latency. On bulk batches, keep instance running, take sequential/concurrent calls—inefficient. Batch: "data locality + distributed bulk" maximizes throughput. **Throughput needed, instant response not = batch almost always cheapest and fastest**. Caveat: results not real-time—if any immediacy required, batch disqualified.

## Serverless Inference — Concurrency & Cold Start

Serverless inference specifies memory (1–6GB) and **MaxConcurrency** (max simultaneous requests to handle). Traffic arrives → auto-spin compute; no traffic → scale to 0. No infra management; idle = no cost—biggest win.

```python
from sagemaker.serverless import ServerlessInferenceConfig

serverless_config = ServerlessInferenceConfig(
    memory_size_in_mb=2048,   # 1024–6144, 256-step
    max_concurrency=20,       # max concurrent requests
)
predictor = model.deploy(serverless_inference_config=serverless_config)
```

Snag: **cold start**. No calls in a while, first request arrives, spin container + load model—delay while loading. Need consistent low latency? Set **Provisioned Concurrency** to pre-warm N instances. Tradeoff: some always-on cost then, losing "total zero" advantage.

> 💡 **Related Theory**: Serverless cost model = "compute time of requests processed + (optional) Provisioned Concurrency always-on." **Sparser traffic** → bigger savings vs. real-time; **steady high traffic** → savings disappear or reverse. Provisioned Concurrency kills cold start but invokes always-on cost; only useful for "sporadic but first-response latency matters" compromises.

## Serverless vs Real-time — Breakeven

Rough intuition: endpoint mostly idle → serverless cheaper; nearly always busy → real-time cheaper. Breakeven lies between.

> ⚠️ **Trap**: "Cost cut = serverless" oversimplifies to wrong answers. Serverless advantage needs ① sporadic traffic AND ② tolerance for cold start. Steady high traffic on serverless? Compute-time charges accumulate—more than real-time. Cold starts break SLA. Exams: check traffic pattern (sporadic vs steady) and latency SLA (cold-start tolerable?) first.

## Async Inference Boundary Revisited

Batch and serverless can blur into async. Separate all three:

- **Batch Transform**: no endpoint, full dataset bulk, job ends and terminates, cheapest bulk.
- **Serverless**: has endpoint (sync response), individual requests, small payload (<4MB), short runtime (<60s), sporadic traffic.
- **Async**: has endpoint (queue-based async), individual requests but large payload (1GB), long runtime (60 min), scale to 0.

Payload/runtime exceed serverless limits in individual requests → async. Urgency-free bulk → batch.

## Summary

Batch and serverless share "always-on to 0" but opposite use cases. ① **Batch Transform**: bulk batches, tune throughput via `InstanceCount`, `SplitType`, `BatchStrategy`, input must be shardable/splittable, input-output join via filter params. No urgency + bulk = nearly always cheapest. ② **Serverless**: sporadic traffic, specify `MemorySize` + `MaxConcurrency` only, scale to 0, cold start mitigated by Provisioned Concurrency (always-on cost). Cost choice always by traffic pattern and latency SLA.

Next we synthesize all Week 6 (inference options, real-time endpoints, advanced inference, batch/serverless).

---

## 📝 연습 문제

**문제 1.** 배치 변환 작업이 너무 느리다. 입력은 줄 단위 CSV로 여러 파일에 나뉘어 있다. 처리량을 높이는 가장 직접적인 방법은?

A) instance_count를 늘리고 split_type을 Line으로 설정해 데이터를 병렬 분산한다  
B) 실시간 엔드포인트로 전환한다  
C) max_concurrent_transforms를 0으로 설정한다  
D) 출력 포맷을 JSON으로 바꾼다  

**정답: A**  
해설: 배치 변환의 처리량은 인스턴스 수를 늘려 데이터를 여러 인스턴스에 병렬 분산할 때 가장 직접적으로 향상되며, `split_type=Line`으로 레코드 단위 분할이 가능해야 분산이 효과를 본다. B는 대량 일괄에 비효율적이고, C는 동시 요청을 막아 오히려 느려지며, D는 출력 포맷 변경으로 처리량과 무관하다.

---

**문제 2.** 서버리스 추론 엔드포인트가 한동안 호출이 없다가 첫 요청에서 응답이 느리다. 일관된 저지연이 필요하지만 트래픽은 여전히 간헐적이다. 적절한 조치는?

A) MaxConcurrency를 1로 줄인다  
B) Provisioned Concurrency를 설정해 일정 수 인스턴스를 미리 데워둔다  
C) 메모리를 1024MB로 낮춘다  
D) 배치 변환으로 전환한다  

**정답: B**  
해설: 콜드 스타트로 인한 첫 요청 지연은 Provisioned Concurrency로 일정 수의 인스턴스를 미리 워밍해두면 해소된다(상시 비용은 일부 발생). A는 동시성만 줄여 콜드 스타트와 무관하고, C는 메모리를 줄여 오히려 성능이 떨어질 수 있으며, D는 개별 요청 즉시 응답이 필요한 상황과 맞지 않는다.

---

**문제 3.** 100만 건의 누적 데이터를 모델로 점수화하는데 즉시성은 필요 없고 비용을 최소화하려 한다. 또 예측 결과를 원본 레코드의 고객 ID와 매칭해 출력해야 한다. 적절한 접근은?

A) 실시간 엔드포인트로 100만 번 호출  
B) 배치 변환을 쓰고 input_filter/output_filter/join_source로 입력 ID를 출력에 결합  
C) 서버리스 추론으로 100만 번 동기 호출  
D) 멀티모델 엔드포인트 사용  

**정답: B**  
해설: 즉시성 불필요 + 대량 + 비용 최소화는 배치 변환이 정답이고, 입력 ID와 예측을 매칭하려면 `input_filter`/`output_filter`/`join_source`로 입력 일부를 출력에 결합한다. A·C는 개별 호출 방식이라 대량 처리에 비효율적이고 비싸며, D는 다수 모델 서빙 기능으로 단일 모델 대량 점수화와 무관하다.

---

**문제 4.** 다음 중 서버리스 추론이 실시간 엔드포인트보다 비용상 유리한 조건으로 가장 적절한 것은?

A) 트래픽이 24시간 꾸준히 높을 때  
B) 트래픽이 간헐적이고 유휴 시간이 많으며 콜드 스타트를 감수할 수 있을 때  
C) 페이로드가 500MB로 매우 클 때  
D) 일관된 한 자릿수 밀리초 지연이 SLA로 요구될 때  

**정답: B**  
해설: 서버리스는 트래픽이 없으면 0으로 스케일되므로 유휴 시간이 많은 간헐적 트래픽에서 비용이 유리하며, 이때 콜드 스타트 허용이 전제다. A는 꾸준히 높은 트래픽이라 실시간이 더 유리하거나 서버리스가 역전되고, C는 서버리스 페이로드 한계(약 4MB)를 초과하며, D는 콜드 스타트 때문에 서버리스가 보장하기 어렵다.

---

**문제 5.** 배치 변환, 서버리스, 비동기 추론을 구분한 설명으로 가장 정확한 것은?

A) 셋 다 동기 응답을 즉시 반환한다  
B) 배치는 엔드포인트 없이 전체 데이터셋 일괄, 서버리스는 작은 페이로드 개별 동기 요청, 비동기는 큰 페이로드(1GB)·긴 처리(60분) 큐 기반이다  
C) 서버리스가 가장 큰 페이로드(1GB)를 지원한다  
D) 비동기는 엔드포인트 없이 작업 단위로만 동작한다  

**정답: B**  
해설: 배치 변환은 엔드포인트 없이 대량 일괄, 서버리스는 작은 페이로드(약 4MB)의 개별 동기 요청에 간헐 트래픽용, 비동기는 큰 페이로드(1GB)·긴 처리(60분)를 큐로 처리하는 방식으로 셋의 경계가 명확하다. A는 배치·비동기가 즉시 동기 응답이 아니므로 틀렸고, C는 1GB를 지원하는 것은 비동기이며, D는 비동기가 엔드포인트를 갖는다는 점에서 틀렸다(엔드포인트 없는 것은 배치).

---
