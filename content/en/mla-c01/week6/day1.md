# Day 1 - Inference Options Overview: 4 Deployment Modes and Selection Criteria

Even a well-trained model has no value by itself. It must be **deployed** so users can call it, accumulated data gets batch-processed, or other systems invoke it—only then does it create business value. SageMaker offers 4 inference modes fitting different workload shapes, and MLA-C01 exams repeatedly ask "which mode for this scenario".

The key is not algorithm but **request pattern**. Do requests come realtime or batched, is traffic steady or sparse, are responses needed immediately or can they tolerate minute delays, are payloads small or huge. Dividing by these 4 axes solves nearly every test question. Today we compare 4 options at a glance and organize selection criteria.

## 4 Inference Options at a Glance

SageMaker's inference modes:

| Option | Response | Traffic Pattern | Payload/Duration |
|---|---|---|---|
| Real-time | Sync, immediate (ms~sec) | Steady, predictable | Small (<6MB), <60sec |
| Serverless | Sync, immediate | Sparse·unpredictable, scales to 0 | Small (<4MB), <60sec |
| Asynchronous | Async, queue-based | Variable, long processing OK | Large (max 1GB), <60min |
| Batch Transform | Async, job-based | Periodic, batch | Very large (whole dataset) |

Real-time and serverless are **synchronous**. Call → result returns on the spot. Async and batch are **request-and-fetch-later** structures.

```python
import boto3
runtime = boto3.client("sagemaker-runtime")

# Real-time endpoint call: immediate response returns
response = runtime.invoke_endpoint(
    EndpointName="my-realtime-endpoint",
    ContentType="application/json",
    Body='{"features": [5.1, 3.5, 1.4, 0.2]}',
)
result = response["Body"].read()
```

> 💡 **Related Theory**: Inference option choice fundamentally tradeoffs "always-on cost vs latency vs throughput". Real-time endpoints keep instances running 24/7, costing even idle, but lowest latency. Serverless costs 0 when traffic is 0 but incurs cold start lag. Batch cheapest per-sample for bulk but no immediacy. Exams ask which to prioritize in scenario.

## Real-time Endpoint—When Instant Response is Critical

Real-time endpoints are HTTPS endpoints where always-running instances receive requests, responding in milliseconds to seconds. Suits online services like **users waiting for results**: recommendation systems, fraud detection, chatbots.

Characteristics:
- Specified instances run 24h → cost even idle
- Lowest latency (low latency), consistent performance
- Auto-scaling adjusts instance count on traffic (minimum 1 kept)
- Payload <6MB, response <60sec limits

Steady traffic plus latency sensitivity = real-time is default choice.

## Serverless Inference—When Traffic is Erratic

Serverless inference doesn't manage instances directly; computes auto-provision on incoming requests. No traffic → **scales to 0**, no cost. Just specify memory (1~6GB) and max concurrency.

```python
# Serverless config—just memory and concurrency
serverless_config = {
    "MemorySizeInMB": 2048,
    "MaxConcurrency": 10,
}
```

Ideal for sparse, unpredictable traffic: internal tools, occasional demo calls, bursty new services. Downside: **cold start**. After idle, first request causes lag spinning up container. Inconsistent low latency needs = not suitable.

> ⚠️ **Pitfall**: Seeing only "reduce cost" and picking serverless without thinking is wrong. Steady high traffic makes serverless costlier than real-time. Serverless cost advantage happens on "mostly idle time". Also, SLA intolerant of cold start kills serverless. Correct condition: "sparse/unpredictable traffic + cold start tolerated".

## Asynchronous Inference—When Large, Long-Processing Requests

Asynchronous Inference queues requests, processes sequentially, stores results on S3, notifies via SNS. For large payloads (max 1GB) or long processing (max 60min). Examples: large image/video processing, bulk NLP document inference.

Core advantage: **can scale instances to 0 when idle** (real-time keeps minimum 1). Queued requests auto-trigger instances, empty queue scales back to 0, saving cost.

```python
# Async call: input on S3, pass location, get output location not immediate response
response = runtime.invoke_endpoint_async(
    EndpointName="my-async-endpoint",
    InputLocation="s3://my-bucket/input/large-image.png",
)
output_location = response["OutputLocation"]  # S3 path where result stores
```

> 🔍 **Deeper**: Async inference fills the gap between real-time and batch. Like real-time, endpoint alive handling individual calls; like batch, queues absorb traffic spikes, supporting large payloads and long processing. "Endpoint needed (individual calls) but >6MB payload or >60sec processing missing real-time limits" → async is the classic signal.

## Batch Transform—Whole Dataset at Once

Batch Transform doesn't use endpoints. Reads bulk input from S3, runs batch inference, writes results to S3, terminates resources when done. No permanent endpoint cost. For overnight batch scoring, customer churn prediction, log classification—**no urgency, process in bulk once**→ Batch Transform.

```python
from sagemaker.transformer import Transformer

transformer = Transformer(
    model_name="my-model",
    instance_count=4,           # Split data for parallel processing
    instance_type="ml.m5.xlarge",
    output_path="s3://my-bucket/batch-output/",
)
transformer.transform(
    data="s3://my-bucket/batch-input/",
    content_type="text/csv",
    split_type="Line",          # Split by record
)
```

> 💡 **Related Theory**: Batch Transform splits data across instances (`split_type`), each processes minibatches (`BatchStrategy`, `MaxPayloadInMB`) for horizontal scale. Job done, cluster vanishes, always-on cost is 0. "No realtime needed, large batch processing" keyword → Batch Transform is almost always the cheapest answer.

## Decision Tree for Selection

To quickly choose on exam, ask in order:

1. **Immediate response needed?** No → step 2. Yes → step 3.
2. (No immediacy) **Whole dataset at once?** → Batch Transform. **Individual requests·large payload·long processing?** → Async.
3. (Immediacy needed) **Traffic steady?** Yes → Real-time. **Sparse and cold start tolerated?** → Serverless.

Remember payload/time constraints too. >6MB payload or >60sec processing disqualifies real-time/serverless; consider async (1GB/60min) or batch.

## Summary

Inference options are 4 by request pattern: ① **Real-time**: steady traffic + low latency, always-on cost. ② **Serverless**: sparse traffic, scales to 0, cold start tolerate. ③ **Async**: large payload (1GB)·long processing (60min), queue-based, scales to 0. ④ **Batch Transform**: no endpoint, whole dataset batch, cheapest, no immediacy. Underlying all choices: "always-on cost vs latency vs throughput" tradeoff.

Next deep-dives real-time endpoints—the most critical—covering setup, auto-scaling, instance selection.

---

## 📝 Practice Questions

**Question 1.** A mobile game must determine whether a purchase is fraudulent within 50 ms at the moment a user taps the item purchase button. Traffic is consistently high all day. What is the most appropriate inference option?

A) Batch transform  
B) Real-time endpoint  
C) Serverless inference  
D) Asynchronous inference  

**Answer: B**  
Explanation: "A decision within 50 ms at the moment of purchase + consistently high traffic" is the classic low-latency, synchronous, always-on pattern, so a real-time endpoint is the answer. A has no immediacy at all and is unsuitable, C cannot guarantee consistently low latency because of cold starts, and D is queue-based so an immediate response is impossible.

---

**Question 2.** An internal analytics tool occasionally invokes the model (a few times a day, at irregular times). Most of the time there are no invocations, so keeping instances running all the time is wasteful. A slight delay on the first response is acceptable. What is the appropriate option?

A) Real-time endpoint  
B) Serverless inference  
C) Batch transform  
D) A real-time endpoint with 2 instances always running  

**Answer: B**  
Explanation: "Intermittent, irregular traffic + mostly idle time + cold start tolerated" is exactly the condition for serverless inference. With no traffic it scales to 0 and incurs no cost. A and D waste money on always-on cost even during idle time, and C is a bulk processing method rather than individual invocations, so it does not fit the usage pattern.

---

**Question 3.** A medical image analysis model receives a 200 MB high-resolution image each and takes about 5 minutes to process. Requests arrive individually and the results can be received after processing completes. What is the appropriate option?

A) Real-time endpoint  
B) Serverless inference  
C) Asynchronous inference  
D) Batch transform  

**Answer: C**  
Explanation: A 200 MB payload exceeds the real-time/serverless limits (6 MB / 4 MB) and 5 minutes of processing exceeds the 60-second constraint. Asynchronous inference supports payloads up to 1 GB and 60 minutes of processing and handles individual requests through a queue, so it fits this scenario exactly. A and B are eliminated by the payload and time constraints, and D processes a whole dataset in bulk, which differs from the "individual request" pattern.

---

**Question 4.** Every night at 12:00, you compute churn probabilities for all 10 million customers and load them into a data warehouse. Real-time results are not needed at all. How do you minimize cost?

A) Turn on a real-time endpoint only at night  
B) Sequentially invoke serverless inference 10 million times  
C) Process the entire dataset in bulk with a batch transform job  
D) Put 10 million requests into the queue with asynchronous inference  

**Answer: C**  
Explanation: "Regularly processing the entire dataset in bulk, no real-time need, minimize cost" is the textbook scenario for batch transform. When the job ends the cluster terminates, so always-on cost is zero, and the data is split across multiple instances for fast processing. A, B, and D are all based on individual invocations/endpoints, so they are inefficient and expensive for bulk processing of 10 million records.

---

**Question 5.** Which is the most appropriate key characteristic that distinguishes asynchronous inference from a real-time endpoint?

A) It always returns responses synchronously in milliseconds  
B) It supports large payloads (up to 1 GB) and long processing (up to 60 minutes) and can scale instances down to 0 when there are no requests  
C) It processes the entire dataset at once without an endpoint  
D) It must always keep at least 1 instance running  

**Answer: B**  
Explanation: Asynchronous inference is queue-based and allows large payloads (1 GB) and long processing times (60 minutes), and it saves cost by scaling instances down to 0 when the queue is empty. A is the synchronous characteristic of real-time/serverless, not asynchronous; C is the description of batch transform; and D is a constraint of real-time endpoints (keep at least 1 instance), the opposite of asynchronous.

---
