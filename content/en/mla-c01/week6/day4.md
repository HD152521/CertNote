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

## 📝 Practice Questions

**Question 1.** A batch transform job is too slow. The input is line-delimited CSV split across multiple files. What is the most direct way to increase throughput?

A) Increase instance_count and set split_type to Line to distribute the data in parallel  
B) Switch to a real-time endpoint  
C) Set max_concurrent_transforms to 0  
D) Change the output format to JSON  

**Answer: A**  
Explanation: Batch transform throughput improves most directly by increasing the number of instances to distribute data in parallel across multiple instances, and distribution only pays off when record-level splitting is possible with `split_type=Line`. B is inefficient for large bulk workloads, C blocks concurrent requests and actually slows things down, and D changes the output format, which is unrelated to throughput.

---

**Question 2.** A serverless inference endpoint had no invocations for a while, and the first request responds slowly. Consistently low latency is needed, but traffic is still intermittent. What is the appropriate action?

A) Reduce MaxConcurrency to 1  
B) Configure Provisioned Concurrency to keep a set number of instances pre-warmed  
C) Lower memory to 1024 MB  
D) Switch to batch transform  

**Answer: B**  
Explanation: The first-request delay caused by cold starts is resolved by pre-warming a set number of instances with Provisioned Concurrency (with some always-on cost). A only reduces concurrency and is unrelated to cold starts, C reduces memory and could actually lower performance, and D does not fit a situation that needs immediate responses to individual requests.

---

**Question 3.** You are scoring 1 million accumulated records with a model, no immediacy is needed, and you want to minimize cost. You also need to output the predictions matched to the customer ID in the original record. What is the appropriate approach?

A) Invoke a real-time endpoint 1 million times  
B) Use batch transform and join the input ID to the output with input_filter/output_filter/join_source  
C) Invoke serverless inference synchronously 1 million times  
D) Use a multi-model endpoint  

**Answer: B**  
Explanation: No need for immediacy + large volume + minimize cost points to batch transform, and to match the input ID to the prediction you join part of the input to the output with `input_filter`/`output_filter`/`join_source`. A and C use individual invocations, which are inefficient and expensive for bulk processing, and D is a feature for serving many models and is unrelated to bulk scoring with a single model.

---

**Question 4.** Which of the following is the most appropriate condition under which serverless inference is more cost-advantageous than a real-time endpoint?

A) When traffic is consistently high 24 hours a day  
B) When traffic is intermittent, there is a lot of idle time, and cold starts are acceptable  
C) When the payload is very large at 500 MB  
D) When consistent single-digit-millisecond latency is required by the SLA  

**Answer: B**  
Explanation: Serverless scales to 0 when there is no traffic, so it is cost-advantageous for intermittent traffic with a lot of idle time, with cold-start tolerance as a prerequisite. In A, traffic is consistently high so real-time is more advantageous or serverless loses its edge, C exceeds the serverless payload limit (about 4 MB), and D is hard for serverless to guarantee because of cold starts.

---

**Question 5.** Which statement most accurately distinguishes batch transform, serverless, and asynchronous inference?

A) All three return synchronous responses immediately  
B) Batch processes the entire dataset in bulk without an endpoint, serverless handles individual synchronous requests with small payloads, and asynchronous is queue-based with large payloads (1 GB) and long processing (60 minutes)  
C) Serverless supports the largest payload (1 GB)  
D) Asynchronous works only in units of jobs without an endpoint  

**Answer: B**  
Explanation: Batch transform handles large bulk workloads without an endpoint, serverless handles individual synchronous requests with small payloads (about 4 MB) for intermittent traffic, and asynchronous processes large payloads (1 GB) and long processing (60 minutes) through a queue, so the boundaries among the three are clear. A is wrong because batch and asynchronous are not immediate synchronous responses, C is wrong because it is asynchronous that supports 1 GB, and D is wrong because asynchronous does have an endpoint (it is batch that has none).

---
