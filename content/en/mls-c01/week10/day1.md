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

## 📝 Practice Questions

**Question 1.** A team wants to compute churn scores for all 20 million users in a batch at midnight every day and load them into a data warehouse. Users are not waiting for the results in real time. Which inference method is the most cost-effective?

A) Run 2 Real-time Endpoints at all times  
B) Serverless Inference  
C) Batch Transform  
D) Asynchronous Inference  

**Answer: C**  
Explanation: The keywords "no real-time response needed + bulk batch processing" point to Batch Transform. You are billed only while the job runs, so there is no always-on endpoint cost. Real-time (A) wastes money on idle billing, Serverless (B) is for small payloads and low-volume calls, and Asynchronous (D) is for online queuing, whereas Batch is suited to processing an entire batch dataset.

---

**Question 2.** A model takes a 500 MB high-resolution satellite image as input and runs inference for about 8 minutes. The result does not need to be immediate, and you want to be notified when processing completes. Which option is appropriate?

A) Real-time Endpoint  
B) Asynchronous Inference  
C) Serverless Inference  
D) Batch Transform  

**Answer: B**  
Explanation: The payload greatly exceeds the 6 MB / 60 second limit (500 MB, 8 minutes), so Real-time (A) and Serverless (C, 4 MB) are not possible. Asynchronous supports up to 1 GB and 1 hour and notifies completion through SNS. Batch (D) is used for bulk processing of a dataset, not for single online requests.

---

**Question 3.** A tool used by internal analysts is called an average of 30 times a day at irregular times. The payload is small, and a slight delay on the first request is acceptable. You want idle cost to be zero. What should you choose?

A) Serverless Inference  
B) Real-time Endpoint with auto scaling  
C) Batch Transform  
D) Multi-model endpoint  

**Answer: A**  
Explanation: Intermittent, unpredictable traffic + small payload + tolerable cold start + zero idle cost is the classic Serverless scenario. Real-time (B) keeps a minimum number of instances running even with auto scaling, so a true zero cost is hard. Batch (C) is not for online requests, and multi-model (D) is a technique for hosting many models, not a cost pattern.

---

**Question 4.** An e-commerce site's real-time recommendation API receives thousands of requests per second at a steady rate and must respond within a p99 latency of 50 ms. Which inference method is the most suitable?

A) Asynchronous Inference  
B) Batch Transform  
C) Serverless Inference  
D) Real-time Endpoint  

**Answer: D**  
Explanation: Sustained high traffic plus a strict low-latency requirement is the very definition of an always-on Real-time Endpoint. Asynchronous (A) is queue-based near-real-time, Batch (B) is offline, and Serverless (C) has cold starts that make it hard to guarantee a strict p99 latency.

---

**Question 5.** Which of the following is correct about the payload/response limits of a Real-time Endpoint?

A) Payload 1 GB, up to 1 hour of processing  
B) Payload 6 MB, response within 60 seconds  
C) Payload 100 MB, unlimited time  
D) Payload 4 MB, GPU required  

**Answer: B**  
Explanation: Synchronous Real-time invocations have a payload limit of 6 MB and a response limit of 60 seconds. 1 GB and 1 hour (A) are Asynchronous, large unlimited capacity (C) is closer to a Batch Transform characteristic, and 4 MB (D) is the Serverless payload limit, and a GPU is not required either.
