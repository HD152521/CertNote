# Day 1 - Inference Options: Real-time vs Serverless vs Asynchronous vs Batch Transform

Model trained, evaluated, optimized — now deploy for actual use. SageMaker doesn't offer one inference way. Deployment choice depends on latency, traffic, payload size, cost. Tests frequently ask "pick inference for scenario X." Today covers **4 options** and their **selection criteria**: real-time (low latency), serverless (sporadic traffic), batch transform (offline bulk), asynchronous (large payloads).

## Four Inference Options Overview

```text
Option               Latency      Traffic Pattern          Payload/Timeout        Cost
─────────────────────────────────────────────────────────────────────────────────────
Real-time           milliseconds   steady, stable           6MB, 60 sec            running (always on)
Serverless          seconds         sporadic, variable      4MB, 60 sec            per-request (zero idle)
Asynchronous        semi-realtime   large, lengthy queue   1GB, 1 hour            running (0-scale possible)
Batch Transform     offline         bulk once-off           100MB/record,huge       job-only (no endpoint)
```

This table is today's core — nearly every test scenario reduces to it.

> 💡 **Related Theory**: Inference choice hinges on "online or offline? low latency required? traffic predictable? payload size?" — three axes carving the choice space. Payload > 6MB or timeout > 60s → can't be real-time/serverless. Offline bulk → batch. Online intermittent → serverless. Online constant → real-time. Asynchronous bridges: online, async queue, large payload

## Real-time Endpoint: Always-On, Low Latency

Provisioned instance(s) serving HTTPS requests, millisecond response.

```python
predictor = model.deploy(
    initial_instance_count=2,
    instance_type="ml.m5.xlarge",
    endpoint_name="fraud-rt-endpoint",
)
response = predictor.predict(payload)  # sync call, immediate response
```

- **When**: Recommendations, fraud detection, chatbots where user waits
- **Limits**: 6MB payload, 60s response
- **Cost trap**: Always-on even idle → wasteful if traffic is sparse

## Serverless Inference: Zero Idle Cost

No instance management. Compute auto-scales up on request, down to 0 when idle.

```python
from sagemaker.serverless import ServerlessInferenceConfig

serverless_config = ServerlessInferenceConfig(
    memory_size_in_mb=2048,
    max_concurrency=10,
)
predictor = model.deploy(serverless_inference_config=serverless_config)
```

- **When**: Tool called sporadically, traffic unpredictable, zero-cost idle
- **Tradeoff**: Cold start latency (first call lags while container boots)
- **Limits**: 4MB payload, no GPU

## Asynchronous Inference: Large Payloads, Queued

Request → S3 queue, process, result → S3, notify (SNS).

```python
from sagemaker.async_inference import AsyncInferenceConfig

async_config = AsyncInferenceConfig(
    output_path="s3://my-bucket/async-output/",
    notification_config={"SuccessTopic": "arn:aws:sns:..."},
)
predictor = model.deploy(async_inference_config=async_config)
response = predictor.predict_async(input_path="s3://my-bucket/input.json")
```

- **When**: High-res image/video analysis, huge NLP docs — big payload, long processing OK
- **Key**: Can scale to 0 when idle (cost efficient)
- **Semi-realtime**: Not instant but better than batches that wait hours

## Batch Transform: Offline Bulk, No Endpoint

No running endpoint. S3 in → S3 out, auto-cleanup after.

```python
transformer = model.transformer(
    instance_count=4,
    instance_type="ml.m5.xlarge",
    output_path="s3://my-bucket/batch-output/",
)
transformer.transform(
    data="s3://my-bucket/input-dataset/",
    content_type="text/csv",
    split_type="Line",
)
```

- **When**: Score 20M customers nightly, month-end reporting — no realtime answer needed, size huge
- **Cost**: Job-time only, no endpoint overhead
- **No limit**: Latency irrelevant, batch size massive

> 💡 **Related Theory**: "Need realtime response?" → online (real-time/serverless/async). "Data pre-computed, no user waiting?" → batch. Within online: "traffic sparse, cold start OK?" → serverless. "Payload huge or processing long?" → async. "Small, fast, always traffic?" → real-time. This tree covers ~95% of scenarios.

## Selection Flowchart

```text
1. Realtime response needed?
   No → Large batch? → Batch Transform
2. Yes (online)
   ├─ Payload >6MB or process >60s? → Asynchronous
   ├─ Traffic sparse, cold start OK? → Serverless
   └─ Traffic steady, low latency essential? → Real-time
```

## Cost from the Business Angle

```text
Zero idle cost    : Serverless, Async (scale to 0), Batch Transform
Always-on cost    : Real-time (endpoint runs 24/7)
Predictable fixed : Real-time (capacity booked upfront)
```

Scenario "sparse traffic, Real-time today" → often wrong. Switch to Serverless/Async.

## Summary

4 inference types, 3-axis decision: online/offline, latency, payload. Real-time low-latency always-on, Serverless sporadic zero-idle, Batch offline bulk, Async big payload queued. Pick by business need, not hype.

Tomorrow: Real-time operations — endpoint structure, scaling, multi-model hosting.

---

## 📝 연습 문제

[Questions in Korean, matching pattern...]
