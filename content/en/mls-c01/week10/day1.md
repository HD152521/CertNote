# Day 1 - Inference Options: Real-time vs Serverless vs Asynchronous vs Batch Transform

## 📌 Key Takeaways

- SageMaker does not have just one deployment method. You pick one of four options by **traffic pattern, payload size, latency requirement, and cost structure**.
- **Real-time**: Sustained traffic + millisecond latency. 6MB payload, 60-second response. You are billed continuously even when there is no traffic.
- **Serverless**: Intermittent, unpredictable traffic. Zero idle cost, but there is a **cold start**, a 4MB payload limit, and no GPU support.
- **Asynchronous**: Large payloads (up to 1GB) + long processing (up to 1 hour). S3 queuing + SNS notification, and it can scale to zero.
- **Batch Transform**: Large offline bulk inference that needs no real-time response. No endpoint, and you are billed only for job run time.

## Overview of the Four Inference Options

The MLS-C01 question type "which inference method should you choose?" is really a question of memorizing the selection criteria in these four lines.

```text
Option            Latency    Traffic pattern        Payload/time limit        Billing
─────────────────────────────────────────────────────────────────────────────────────
Real-time         ms         Sustained, stable      6MB, 60 sec               Instance uptime (always on)
Serverless        seconds    Intermittent, spiky    4MB, 60 sec               Requests + duration (zero idle)
Asynchronous      Near-RT    Large payload, queued  1GB, up to 1 hour         Instance time (can scale to 0)
Batch Transform   Offline    Large bulk processing  100MB/record, big dataset Job run time only
```

This one table is the core of today's study, and nearly every scenario you meet on the exam reduces to these four lines.

Choosing an inference option first separates "online or offline?" and then, if online, branches on "is traffic sustained or intermittent?" and "is the payload large or small?" The exam always drops hints about these three axes (latency requirement, traffic pattern, payload size) as keywords.

## Real-time Endpoint: Sustained Traffic + Low Latency

A real-time endpoint puts the model on always-on (provisioned) instances and responds to HTTPS requests within milliseconds.

```python
predictor = model.deploy(
    initial_instance_count=2,
    instance_type="ml.m5.xlarge",
    endpoint_name="fraud-rt-endpoint",
)
response = predictor.predict(payload)  # synchronous call, immediate response
```

- **When to use**: Online services where a user waits for the response, such as recommendation systems, fraud detection, and chatbots
- **Limits**: 6MB payload, response within 60 seconds
- **Cost trap**: If the instances are running, you are billed continuously even with no traffic. It is inefficient for intermittent traffic.

## Serverless Inference: Intermittent/Unpredictable Traffic

Serverless inference does not make you manage instances. When requests arrive, compute scales out automatically, and when there are none it scales down to zero, so idle cost is zero.

```python
from sagemaker.serverless import ServerlessInferenceConfig

serverless_config = ServerlessInferenceConfig(
    memory_size_in_mb=2048,
    max_concurrency=10,
)
predictor = model.deploy(serverless_inference_config=serverless_config)
```

- **When to use**: Internal tools called only a few times a day, new services with uneven traffic
- **Trade-off**: There is a cold start. The first request is delayed because the container has to start.
- **Limits**: 4MB payload, no GPU support (CPU/memory based)

> ⚠️ **Pitfall**: If the passage contains a **strict latency SLO** such as "guarantee p99 latency of 50ms," Serverless is the wrong answer. The cold start creates tail latency.

## Asynchronous Inference: Large Payload + Long Processing Time

Asynchronous inference puts the request in an S3-based queue, writes the result to S3 when processing finishes, and sends a notification (SNS). The caller does not wait for an immediate response.

```python
from sagemaker.async_inference import AsyncInferenceConfig

async_config = AsyncInferenceConfig(
    output_path="s3://my-bucket/async-output/",
    notification_config={"SuccessTopic": "arn:aws:sns:...:success"},
)
predictor = model.deploy(async_inference_config=async_config)
response = predictor.predict_async(input_path="s3://my-bucket/input/large.json")
```

- **When to use**: Jobs with large payloads (up to 1GB) and long processing (up to 1 hour), such as high-resolution image/video analysis and large NLP document inference
- **Key advantage**: When there is no traffic, you can scale instances to zero (scale to zero), saving cost
- **Near-real-time**: Not immediate, but it also does not gather requests for a long time and process them like a batch.

## Batch Transform: Large Offline Bulk Inference

Batch transform does not start an endpoint. It runs bulk inference over an entire large dataset in S3, writes the results to S3, and automatically releases resources when the job finishes.

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

- **When to use**: Large-scale processing that needs no real-time response, such as refreshing churn scores for all customers every night or bulk predictions for a monthly report
- **Cost**: Billed only while the job runs. There is no always-on endpoint cost.
- **Not a constraint**: Latency does not matter at all. No user is waiting for a response.

When you see the keywords "no real-time response needed + large data," Batch Transform is almost always the answer. Conversely, "the user sees the result immediately + stable traffic" means Real-time. The gray zone between them (large payload, long processing, queuing allowed) falls to Asynchronous, and if traffic is rare and you can tolerate a cold start, it falls to Serverless.

## Comparison of Operating Characteristics

| Axis | Real-time | Serverless | Asynchronous | Batch Transform |
|---|---|---|---|---|
| Latency | Milliseconds | Seconds | Near-real-time | Offline |
| Invocation | Synchronous HTTPS | Synchronous HTTPS | Queued (input S3 path) | Job execution |
| Result delivery | Response body | Response body | S3 output + SNS notification | S3 output |
| Payload limit | 6MB | 4MB | 1GB | 100MB/record |
| Processing time limit | 60 seconds | 60 seconds | Up to 1 hour | Large dataset (per job) |
| Cold start | None (always on) | **Yes** | — | — |
| Scale to zero | Not possible (instances always on) | Automatic zero | Possible (scale to zero) | Released when the job ends |
| GPU | Supported | **Not supported** | Supported | Supported |
| Endpoint maintained | Required | Required (managed) | Required | **Not required** |

## Selection Table: When to Use / When Not to Use

| Option | Typical scenario | When to use | **When not to use** |
|---|---|---|---|
| **Real-time** | Recommendation API, fraud detection, chatbot | Sustained, stable traffic + strict low latency | When traffic is rare yet the endpoint is kept on, incurring idle charges / payload over 6MB / processing over 60 seconds |
| **Serverless** | Internal tool called 30 times a day | Intermittent, unpredictable traffic + small payload + zero idle cost | When a p99 latency guarantee is needed (cold start) / when a GPU is needed / payload over 4MB |
| **Asynchronous** | Satellite image and large document inference | Large payload, long processing + completion notification needed + queuing allowed | When the user waits for an immediate answer / processing a whole dataset in bulk (→ Batch) |
| **Batch Transform** | Nightly churn score refresh for all customers | No real-time response needed + bulk processing of large data | Single online requests / APIs where the user waits for the result |

> ⚠️ **Pitfall**: Asynchronous and Batch Transform are confusing because both are "not an immediate answer + S3 results." The fork is the **request unit**. If you put **individual requests** arriving online into a queue, it is Asynchronous; if you run the **entire dataset** already accumulated in S3 in one go, it is Batch Transform.

## Selection Decision Flow

The decision tree to run in your head in the exam room is as follows.

```text
1. Is a real-time response needed?
   No → Large bulk? → Batch Transform
2. Yes (online inference)
   ├ Large payload (>6MB) / long processing (>60 sec)? → Asynchronous
   ├ Intermittent/unpredictable traffic + cold start OK? → Serverless
   └ Sustained traffic + low latency essential? → Real-time
```

This tree filters out the strongest constraints first, in the order payload size → traffic pattern → latency requirement. If the payload is 1GB, Real-time and Serverless are physically impossible, so there is no need to even consider the traffic pattern.

```
[Keywords to extract from the passage]
        │
 ① "Does a user wait for the result?"
        ├─ No, and the entire S3 dataset ────────→ Batch Transform
        └─ Yes / per individual request ↓
        │
 ② "Do payload and processing time exceed 6MB and 60 seconds?"
        ├─ Yes (up to 1GB · 1 hour, completion notification needed) ─→ Asynchronous
        └─ No ↓
        │
 ③ "Is traffic intermittent and do you want idle cost to be zero?"
        ├─ Yes (accept cold start, within 4MB, CPU) ─→ Serverless
        └─ No ↓
        │
 ④ "Sustained traffic + strict low latency (p99)?" ───→ Real-time
```

## Cost Perspective Summary

```text
Zero idle cost       : Serverless, Asynchronous (scale to 0), Batch Transform
Always billed        : Real-time (as long as the instances are on)
Predictable fixed cost: Real-time (capacity is reserved in advance, so it is stable)
```

| Option | Billing unit | When traffic is 0 | Where cost is favorable |
|---|---|---|---|
| Real-time | Instance uptime (always) | **Keeps billing** | When traffic is high and steady so instances do not sit idle |
| Serverless | Number of requests + duration | Zero | When calls are rare and irregular |
| Asynchronous | Instance time (can scale to 0) | Can scale down to 0 | When large jobs come in bunches and then none for a while |
| Batch Transform | Job run time only | No charge (job ended) | When processing a large volume in one go on a regular schedule |

In a cost-optimization question, if the situation "traffic is intermittent but Real-time is running" appears, the answer is almost always a switch to Serverless or Asynchronous.

An option saying "attach Auto Scaling to Real-time and idle cost becomes zero" is wrong. Even with Auto Scaling, **the minimum instances must remain on**, so a true zero cost is hard. If you need a true zero, it is Serverless.

### Symptoms of a Wrongly Chosen Option and the Correction

| Current state | Symptom | Direction of correction |
|---|---|---|
| Real-time running continuously for intermittent traffic | Few calls but the bill stays the same | Serverless (small payload) or Asynchronous (large jobs) |
| Calling Real-time with large images | Fails on the 6MB / 60-second limit | Switch to Asynchronous (up to 1GB / 1 hour) |
| Repeatedly calling an endpoint with the whole nightly dataset | Slow and expensive, and the endpoint is kept up | Switch to a Batch Transform job |
| Running a low-latency API on Serverless | Tail latency spikes on the first request and requests after idle | Switch to Real-time |
| Polling asynchronous results without a completion notice | Result-checking logic gets complicated | Use Asynchronous's SNS notification setup |

## Passage Clue → Answer Mapping

| Passage clue | Answer to choose | Reason |
|---|---|---|
| "Refresh scores for all 20 million users at midnight every day" | Batch Transform | No real-time needed + bulk, billed only for job time |
| "500MB image, about 8 minutes of processing, notify on completion" | Asynchronous | Exceeds 6MB and 60 seconds; supports 1GB and 1 hour + SNS notification |
| "30 calls a day, irregular, zero idle cost" | Serverless | Intermittent traffic + small payload + cold start tolerated |
| "Thousands per second, p99 within 50ms" | Real-time | Sustained high traffic + strict low latency |
| "Payload 6MB, response 60 seconds" | A Real-time limit | The limits of a synchronous call |
| "Payload 4MB, no GPU support" | A Serverless limit | CPU/memory based |
| "Payload 1GB, up to 1 hour" | An Asynchronous limit | The option for large payloads and long processing |
| "Traffic is intermittent but Real-time is running continuously" | Switch to Serverless or Asynchronous | Eliminating idle billing is the right direction |
| "Use Auto Scaling to make idle cost zero" | **Wrong option** | Minimum instances remain, so a true zero is impossible |
| "Write results to S3 and notify via SNS" | Asynchronous | Queuing + output path + notification setup |
| "Process without starting an endpoint, then release resources" | Batch Transform | Resources are released automatically when the job ends |

The four inference options are not competing alternatives but tools for different traffic, payload, and latency scenarios. Catch the keywords planted in the passage (sustained/intermittent, large payload, immediate response, large offline, idle cost) and plug them into the decision tree above.

Tomorrow we cover the configuration of the Real-time endpoint, which carries the heaviest operational burden, along with Auto Scaling and multi-model patterns.

## 📖 Glossary

- **Endpoint**: An always-on service address that exposes a model for HTTPS invocation. Batch Transform does not create one.
- **Payload**: The input data sent with a single inference request. Its size limit is the strongest constraint in choosing an option.
- **Synchronous / asynchronous invocation**: Waiting until the response arrives / submitting only the request and receiving the result later via S3 or a notification.
- **Cold start**: The phenomenon in which the first request is slow because a container must be started fresh from an idle state. Serverless's signature trade-off.
- **Scale to zero**: Reducing instances to zero when there is no traffic so that cost approaches zero.
- **Idle cost**: Money spent on instances that are running even though there are no requests. Real-time's signature trap.
- **Queuing**: A method of placing requests in a queue and processing them in order. The operating principle of Asynchronous.
- **SNS notification**: AWS messaging that announces completion or failure through a topic. Used for completion notices in asynchronous inference.
- **Batch Transform job**: An execution unit that runs bulk inference over an entire S3 dataset without an endpoint and releases resources when finished.
- **p99 latency**: The response time of the slowest 1 request out of 100. Used when talking about tail-latency SLOs.

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
