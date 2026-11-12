# Day 1 - Inference Options Overview: 4 Deployment Modes and Selection Criteria

## 📌 Key Takeaways

- The inference option is decided not by the algorithm but by the **request pattern** — four axes: immediacy, traffic, payload, and processing time.
- **Real-time**: synchronous immediate response (ms to seconds), steady traffic. At least one instance is always on, so you pay always-on cost.
- **Serverless**: synchronous response, but if traffic is 0, cost is 0. In exchange, you must accept **cold start** latency.
- **Asynchronous**: queue-based. Accepts large payloads (up to 1GB) and long processing (up to 60 minutes) and scales down to 0.
- **Batch Transform**: processes a whole dataset in bulk with no endpoint. No immediacy, but the cheapest for large-volume processing.

## The 4 Inference Options at a Glance

A model creates business value only once it is **deployed** — in a form that responds to user requests or batch-processes accumulated data. SageMaker offers four modes depending on the nature of the inference workload, and MLA-C01 keeps asking "which mode fits this scenario."

| Option | Response form | Traffic pattern | Payload/duration | When cost is incurred |
|------|----------|------------|-------------------|---------------|
| Real-time | Synchronous, immediate (ms to seconds) | Steady and predictable | Small (<6MB), <60 seconds | The entire time the instances are running |
| Serverless | Synchronous, immediate | Intermittent and unpredictable, drops to 0 | Small (<4MB), <60 seconds | Only the time spent processing requests |
| Asynchronous | Asynchronous, queue-based | Variable, long processing allowed | Large (up to 1GB), <60 minutes | Only when there is work in the queue |
| Batch Transform | Asynchronous, per job | Periodic, bulk | Very large (the whole dataset) | Only the time the job runs |

- **Real-time and serverless** = synchronous. When you call, the result comes back right there.
- **Asynchronous and batch** = a structure where you throw the request and **receive the result later**.

```text
Synchronous vs asynchronous request flow

[Sync]   Client ── invoke_endpoint ──▶ Endpoint ──▶ Model
                ◀────── Response (ms to seconds) ──────┘
         Real-time / Serverless

[Async]  Client ── invoke_endpoint_async ──▶ Internal queue ──▶ Endpoint
                ◀── OutputLocation returned immediately         │
                                                      ┌────────┴────────┐
                                                      ▼                 ▼
                                               S3 (store result)  SNS (completion notice)

[Batch]  S3 (input) ──▶ [Temporary cluster, N instances run inference in parallel] ──▶ S3 (output) ──▶ Cluster terminates
         There is no endpoint at all
```

```python
import boto3
runtime = boto3.client("sagemaker-runtime")

# Call a real-time endpoint: an immediate response comes back
response = runtime.invoke_endpoint(
    EndpointName="my-realtime-endpoint",
    ContentType="application/json",
    Body='{"features": [5.1, 3.5, 1.4, 0.2]}',
)
result = response["Body"].read()
```

Choosing an inference option is essentially a three-way trade-off among "always-on cost vs latency vs throughput." A real-time endpoint keeps instances always on, so it costs money even with no traffic, but it has the lowest latency. Serverless costs 0 when traffic is 0 but adds cold start latency. Batch is the most cost-efficient per unit of bulk processing but has no immediacy. The exam asks, through scenarios, which of these three to prioritize.

## Real-time Endpoint — When an Immediate Response Is Vital

Instances that are always on behind an HTTPS endpoint receive requests and respond in milliseconds to seconds.

- The instances you specify run 24 hours a day → hourly cost even with no traffic
- Lowest latency, consistent performance
- Auto Scaling can adjust the instance count as traffic rises and falls — but **at least 1 instance is kept** (0 is not possible)
- Constraints: payload of 6MB or less, response within 60 seconds
- Suitable cases: online services such as recommendation systems, fraud detection, and chatbots where **the user is waiting for the result**

→ If traffic is steady and latency-sensitive, real-time is the default choice.

## Serverless Inference — When Traffic Is Erratic

You don't manage instances yourself; compute is provisioned automatically only when requests arrive.

- With no traffic it **scales down to 0** → no idle cost
- You specify only two things: **memory size (1 to 6GB)** and **maximum concurrency (MaxConcurrency)** — you don't pick an instance type
- Payload of 4MB or less, processing within 60 seconds
- Suitable cases: internal tools, demos that are called only occasionally, new services with erratic traffic

```python
# Serverless endpoint configuration — specify only memory and concurrency
serverless_config = {
    "MemorySizeInMB": 2048,
    "MaxConcurrency": 10,
}
```

The downside is the **cold start**. If there have been no calls for a while and then the first request arrives, there is a delay while the container is brought up. It is unsuitable if you need consistently low latency.

> ⚠️ **Pitfall**: Don't pick serverless unconditionally just because you see the keyword "reduce cost." For workloads with **steadily heavy** traffic, serverless can actually cost more than a real-time endpoint. The cost advantage of serverless comes when "there is a lot of idle time." Also, if there is an SLA that cannot tolerate a cold start, serverless is out. "Intermittent/unpredictable traffic + cold start tolerated" is the exact condition for serverless.

## Asynchronous Inference — When Requests Are Large and Slow

Asynchronous Inference puts requests into an internal queue and processes them in order, then stores the result in S3 and announces completion through SNS.

- Payload up to **1GB**, processing up to **60 minutes** — it covers the range that real-time/serverless can't accept
- Instead of putting the input in the body, you **pass only the S3 location (`InputLocation`)**
- **With no requests, instances can be scaled down to 0** (real-time keeps at least 1)
- When requests pile up in the queue it automatically brings up instances, and when the queue empties it scales back to 0 to save cost
- Suitable cases: large image/video processing, large-document NLP inference

```python
# Async call: put the input in S3, pass only its location, and receive an output location instead of an immediate response
response = runtime.invoke_endpoint_async(
    EndpointName="my-async-endpoint",
    InputLocation="s3://my-bucket/input/large-image.png",
)
output_location = response["OutputLocation"]  # S3 path where the result will be stored
```

Asynchronous inference fills the middle ground between real-time and batch. Like real-time, the endpoint stays alive and you call it per individual request, but a queue absorbs request bursts and allows large payloads and long processing times. "An endpoint is needed (individual calls), but the payload exceeds 6MB or processing exceeds 60 seconds so the real-time constraints can't be met" → that is the classic signal that async is the answer.

## Batch Transform — The Whole Dataset at Once

Batch Transform has no endpoint. It reads large input from S3, runs inference in bulk, writes the results to S3, and shuts down all resources when the job ends.

- There is **no** permanent endpoint cost — you are billed only for the time the job runs
- Splits the data across multiple instances and processes in parallel (horizontal scaling)
- Suitable cases: overnight batch scoring, churn prediction for all customers, classifying accumulated logs — work that **doesn't need immediacy and can be processed all at once**

```python
from sagemaker.transformer import Transformer

transformer = Transformer(
    model_name="my-model",
    instance_count=4,           # Split the data and process in parallel
    instance_type="ml.m5.xlarge",
    output_path="s3://my-bucket/batch-output/",
)
transformer.transform(
    data="s3://my-bucket/batch-input/",
    content_type="text/csv",
    split_type="Line",          # Split per record
)
```

Batch Transform splits the data across multiple instances (`split_type`), and each instance processes it in mini-batches (`BatchStrategy`, `MaxPayloadInMB`), scaling horizontally. When processing finishes the whole cluster disappears, so always-on cost is 0. When the keyword "bulk batch processing with no real-time requirement at all" appears, Batch Transform is almost always the cheapest correct answer.

## Constraint Comparison — Filter Out Disqualifiers First

When numbers appear in a scenario, it is faster to narrow the candidates by constraints first.

| Constraint | Real-time | Serverless | Asynchronous | Batch Transform |
|------|--------|----------|--------|-----------|
| Max payload | 6MB | 4MB | 1GB | Per dataset (S3) |
| Max processing time | 60 seconds | 60 seconds | 60 minutes | Per job (long runs possible) |
| Scale to 0 | Not possible (minimum 1) | Possible | Possible | Not applicable (terminates when done) |
| GPU instances | Supported | Not supported | Supported | Supported |
| How results are received | Response body | Response body | S3 + SNS notification | S3 |

> ⚠️ **Pitfall**: Serverless inference **cannot use a GPU**. The choice "this is deep learning inference but traffic is intermittent, so let's cut cost with serverless" doesn't hold at all if the model needs a GPU. Note that not only payload and processing time but also **hardware requirements are a disqualifying condition**.

## Selection Criteria Decision Tree

```text
① Is an immediate (synchronous) response needed?
   │
   ├─ No ──┬─ The whole dataset at once?                  ──▶ Batch Transform
   │       └─ Individual requests, but large or slow?     ──▶ Asynchronous inference
   │
   └─ Yes ─┬─ Is traffic steady?                          ──▶ Real-time endpoint
           └─ Intermittent + cold start tolerated?        ──▶ Serverless inference

② Recheck the constraints: payload > 6MB or processing > 60 seconds
   → Real-time/serverless are out → Asynchronous (1GB·60 min) or Batch Transform
```

## Scenario Keyword → Answer Mapping

| Scenario keyword | Answer | Basis for the decision |
|-----------------|------|-----------|
| "A 50ms verdict at the moment of purchase, steady traffic" | Real-time | Latency is the top priority |
| "Internal tool, a few calls a day, mostly idle" | Serverless | Eliminates idle cost |
| "200MB image, 5-minute processing, individual requests" | Asynchronous | Exceeds payload and time constraints |
| "Score 10 million records every night" | Batch Transform | No immediacy needed + lowest cost |
| "I want a notification when processing finishes" | Asynchronous | SNS completion notification is built in |
| "I don't want to keep an endpoint up permanently" | Batch Transform | All resources are released when the job ends |

## Symptom → Cause → Action

| Symptom | Cause | Action |
|-----------|------|------|
| Only the first serverless request is several seconds slow | Cold start (container and model load) | Pre-warm with Provisioned Concurrency, or switch to real-time |
| Real-time endpoint cost is excessive | Instances run permanently even during idle time | Serverless or async for intermittent traffic; batch for bulk jobs |
| Calls fail with timeout or payload errors | Exceeded 60 seconds or 6MB (4MB for serverless) | Move to asynchronous inference (1GB·60 min) or Batch Transform |
| A batch job doesn't get faster even with more instances | The input is a single large file that can't be split | Shard the input into multiple files and specify `split_type` |
| I can't tell when I'll receive the async result | The structure doesn't return a response immediately | Subscribe to the SNS completion notification + check `OutputLocation` |

The next article digs deep into the most central option, the real-time endpoint, covering configuration, Auto Scaling, and instance selection.

## 📖 Glossary

- **Inference**: The stage of feeding new data into a trained model to get predictions. The "using" side of a model.
- **Deployment**: Putting a trained model up in a form that other systems can call.
- **Endpoint**: An HTTPS address opened so the model can be called. It accepts requests while it is alive.
- **Synchronous call**: A method where the result comes back right there after you send the request. The caller waits.
- **Asynchronous call**: A method where only the request is accepted and the result is received later through a separate path (S3, notification).
- **Payload**: The body of data sent along with a single call. The size limit differs by option.
- **Cold start**: The delay on the first request to a service that hasn't been used for a while, caused by bringing up the container and model anew.
- **Always-on cost**: The fixed cost that keeps being incurred because instances are on even when there are no requests.
- **Latency**: The time from sending a request until the response comes back.
- **Throughput**: The number of requests or records that can be processed per unit of time.

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
