# Day 1 - Inference Options: Real-time vs Serverless vs Asynchronous vs Batch Transform

## 📌 Key Takeaways

- SageMaker does not have a single way to deploy. You pick one of four options based on **traffic pattern · payload size · latency requirement · cost structure**.
- **Real-time**: Sustained traffic + millisecond latency. 6MB payload, 60-second response. You are billed continuously even with no traffic.
- **Serverless**: Intermittent, unpredictable traffic. Zero idle cost, but there is a **cold start**, a 4MB payload, and no GPU support.
- **Asynchronous**: Large payloads (up to 1GB) + long processing (up to 1 hour). S3 queuing + SNS notification, can scale to zero.
- **Batch Transform**: Large offline batch inference that needs no real-time response. No endpoint, you are billed only for job run time.

## Overview of the Four Inference Options

The MLS-C01 "which inference method should you choose" type of question is really a question of memorizing these four lines of selection criteria.

```text
Option            Latency     Traffic pattern          Payload/time limit        Billing
─────────────────────────────────────────────────────────────────────────
Real-time         ms          Sustained, steady        6MB, 60s                 Instance uptime (always on)
Serverless        seconds     Intermittent, variable   4MB, 60s                 Requests + duration (idle $0)
Asynchronous      near-RT     Large payloads, queuing  1GB, up to 1 hour        Instance hours (can scale to 0)
Batch Transform   offline     Bulk batch processing    100MB/record, large sets Job run time only
```

This single table is the heart of today's study, and nearly every scenario you will meet on the exam reduces to these four lines.

Choosing an inference option first splits "online or offline," and if online, branches on "is traffic sustained or intermittent" and "is the payload large or small." The exam always drops these three axes (latency requirement, traffic pattern, payload size) in as keywords.

## Real-time Endpoint: Sustained Traffic + Low Latency

A real-time endpoint puts the model on always-on (provisioned) instances and responds to HTTPS requests in milliseconds.

```python
predictor = model.deploy(
    initial_instance_count=2,
    instance_type="ml.m5.xlarge",
    endpoint_name="fraud-rt-endpoint",
)
response = predictor.predict(payload)  # synchronous call, immediate response
```

- **When to use**: Online services where a user waits for the response, such as recommendation systems, fraud detection, and chatbots
- **Constraints**: 6MB payload, response within 60 seconds
- **Cost trap**: If the instances are on, you keep getting billed even with no traffic. It is inefficient for intermittent traffic.

## Serverless Inference: Intermittent/Unpredictable Traffic

Serverless inference does not make you manage instances. Compute scales out automatically when requests arrive and shrinks to 0 when there are none, so idle cost is zero.

```python
from sagemaker.serverless import ServerlessInferenceConfig

serverless_config = ServerlessInferenceConfig(
    memory_size_in_mb=2048,
    max_concurrency=10,
)
predictor = model.deploy(serverless_inference_config=serverless_config)
```

- **When to use**: Internal tools called only a few times a day, new services with erratic traffic
- **Trade-off**: There is a cold start. The first request is delayed because of container startup.
- **Constraints**: 4MB payload, no GPU support (CPU/memory based)

> ⚠️ **Pitfall**: If the question has a **strict latency SLO** such as "guarantee p99 latency of 50ms," Serverless is the wrong answer. The cold start creates tail latency.

## Asynchronous Inference: Large Payloads + Long Processing Time

Asynchronous inference puts requests in an S3-based queue, and when processing finishes it writes the result to S3 and sends a notification (SNS). The caller does not wait for an immediate response.

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
- **Key advantage**: It can scale instances to zero (scale to zero) when there is no traffic, saving cost
- **Near-real-time**: Not immediate, but it also does not hold requests for a long time and process them in bulk like a batch.

## Batch Transform: Large Offline Batch Inference

Batch transform does not bring up an endpoint. It runs batch inference over an entire large dataset in S3, writes the result to S3, and automatically releases the resources when the job finishes.

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

- **When to use**: Large-scale processing that needs no real-time response, such as refreshing churn scores for all customers every night or batch predictions for a monthly report
- **Cost**: Billed only while the job runs. There is no always-on endpoint cost.
- **Not a constraint**: Latency does not matter at all. There is no user waiting for a response.

When you see the keywords "no real-time response needed + large data," it is almost always Batch Transform. Conversely, "the user sees the result immediately + steady traffic" means Real-time. The gray zone between the two (large payload, long processing, queuing acceptable) falls to Asynchronous, and if traffic is rare and you can tolerate a cold start, it falls to Serverless.

## Comparing Operational Characteristics

| Axis | Real-time | Serverless | Asynchronous | Batch Transform |
|---|---|---|---|---|
| Latency | Milliseconds | Seconds | Near-real-time | Offline |
| Invocation | Synchronous HTTPS | Synchronous HTTPS | Queuing (input S3 path) | Job run |
| Result delivery | Response body | Response body | S3 output + SNS notification | S3 output |
| Payload limit | 6MB | 4MB | 1GB | 100MB/record |
| Processing time limit | 60 seconds | 60 seconds | Up to 1 hour | Large datasets (per job) |
| Cold start | None (always on) | **Yes** | — | — |
| Scale to 0 | Not possible (instances always on) | Automatic 0 | Possible (scale to zero) | Released when the job ends |
| GPU | Supported | **Not supported** | Supported | Supported |
| Endpoint maintained | Required | Required (managed) | Required | **Not required** |

## Selection Table: When to Use / When Not to Use

| Option | Representative scenario | When to use | **When not to use** |
|---|---|---|---|
| **Real-time** | Recommendation API, fraud detection, chatbot | Sustained, steady traffic + strict low latency | Traffic is rare yet it is kept on, incurring idle billing / payload over 6MB / processing over 60 seconds |
| **Serverless** | An internal tool called 30 times a day | Intermittent, unpredictable traffic + small payload + $0 idle | When a p99 latency guarantee is needed (cold start) / when a GPU is needed / payload over 4MB |
| **Asynchronous** | Satellite imagery and large-document inference | Large payload, long processing + completion notification needed + queuing acceptable | When a user waits for an immediate answer / processing a whole dataset in bulk (→ Batch) |
| **Batch Transform** | Nightly refresh of churn scores for all customers | No real-time response needed + bulk data processing | Single online requests / APIs where a user waits for the result |

> ⚠️ **Pitfall**: Asynchronous and Batch Transform are both "not an immediate answer + S3 results," so they get confused. The fork in the road is the **unit of request**. If you queue **individual requests** arriving online, it is Asynchronous, and if you run the **entire dataset** already accumulated in S3 in one go, it is Batch Transform.

## Selection Decision Flow

The decision tree to run in your head in the exam room is as follows.

```text
1. Is a real-time response needed?
   No → bulk batch? → Batch Transform
2. Yes (online inference)
   ├ Large payload (>6MB) / long processing (>60s)? → Asynchronous
   ├ Intermittent/unpredictable traffic + cold start OK? → Serverless
   └ Sustained traffic + low latency essential? → Real-time
```

This tree filters from the strongest constraint down, in the order payload size → traffic pattern → latency requirement. If the payload is 1GB, Real-time and Serverless are physically impossible, so there is no need to even weigh the traffic pattern.

```
[Keywords to pull from the question]
        │
 ① "Is the user waiting for the result?"
        ├─ No, and the whole S3 dataset ──────→ Batch Transform
        └─ Yes / per individual request ↓
        │
 ② "Do payload and processing time exceed 6MB and 60 seconds?"
        ├─ Yes (up to 1GB · 1 hour, completion notification needed) ─→ Asynchronous
        └─ No ↓
        │
 ③ "Is traffic intermittent and do you want idle cost at zero?"
        ├─ Yes (accept cold start, within 4MB, CPU) ─→ Serverless
        └─ No ↓
        │
 ④ "Sustained traffic + strict low latency (p99)?" ───→ Real-time
```

## Cost Perspective Summary

```text
Zero idle cost       : Serverless, Asynchronous (scale to 0), Batch Transform
Always-on billing    : Real-time (as long as the instances are on)
Predictable fixed cost: Real-time (capacity is reserved in advance, so it is stable)
```

| Option | Billing unit | When traffic is 0 | Where cost is favorable |
|---|---|---|---|
| Real-time | Instance uptime (always on) | **Keeps billing** | When traffic is high and steady so instances are not idle |
| Serverless | Number of requests + duration | $0 | When calls are rare and irregular |
| Asynchronous | Instance hours (can scale to 0) | Can shrink to 0 | When large jobs come in clusters and then nothing for a while |
| Batch Transform | Job run time only | No billing (job ended) | When processing large volumes at once on a regular schedule |

In a cost optimization question, if the situation "traffic is intermittent but Real-time is in use" appears, switching to Serverless or Asynchronous is almost always the answer.

A choice saying "attaching Auto Scaling to Real-time makes idle cost zero" is wrong. Even with Auto Scaling, **the minimum number of instances must stay on**, so a complete $0 is hard. If you need a true $0, it is Serverless.

### Symptoms and Corrections of a Wrongly Chosen Option

| Current state | Symptom | Direction of correction |
|---|---|---|
| Real-time running always-on for intermittent traffic | Few calls but the bill stays the same | Serverless (small payload) or Asynchronous (large jobs) |
| Calling Real-time with large images | Fails by hitting the 6MB and 60-second limits | Switch to Asynchronous (up to 1GB · 1 hour) |
| Repeatedly calling an endpoint for the whole nightly dataset | Slow, expensive, and the endpoint is kept running | Switch to a Batch Transform job |
| Running a low-latency API on Serverless | Tail latency spikes for the first request and requests after idle | Switch to Real-time |
| Polling asynchronous results without a completion notice | Result-checking logic gets complicated | Use Asynchronous's SNS notification configuration |

## Question Clue → Answer Mapping

| Question clue | Answer to pick | Reason |
|---|---|---|
| "Refresh scores for all 20 million users every midnight" | Batch Transform | No real-time needed + bulk batch, billed only for job time |
| "500MB image, about 8 minutes of processing, notify on completion" | Asynchronous | Exceeds 6MB and 60 seconds, supports 1GB and 1 hour + SNS notification |
| "30 times a day, irregular, $0 idle cost" | Serverless | Intermittent traffic + small payload + cold start acceptable |
| "Thousands per second, within p99 50ms" | Real-time | Sustained high traffic + strict low latency |
| "Payload 6MB, response 60 seconds" | Real-time's limit | The limit of synchronous calls |
| "Payload 4MB, no GPU support" | Serverless's limit | CPU/memory based |
| "Payload 1GB, up to 1 hour" | Asynchronous's limit | The option for large payloads and long processing |
| "Traffic is intermittent but Real-time is running always-on" | Switch to Serverless or Asynchronous | Eliminating idle billing is the right direction |
| "Make idle cost zero with Auto Scaling" | **Wrong choice** | A minimum number of instances remains, so a complete $0 is impossible |
| "Write the result to S3 and notify via SNS" | Asynchronous | Queuing + output path + notification configuration |
| "Process without bringing up an endpoint and release resources afterward" | Batch Transform | Resources are released automatically when the job ends |

The four inference options are not competing alternatives; they are tools for different traffic, payload, and latency scenarios. Catch the keywords laid out in the question (sustained/intermittent, large payload, immediate response, bulk offline, idle cost) and plug them into the decision tree above.

Tomorrow we cover the configuration, Auto Scaling, and multi-model patterns of the Real-time endpoint, which carries the heaviest operational burden.

## 📖 Glossary

- **Endpoint**: An always-on service address where a model is brought up so it can be invoked over HTTPS. Batch Transform does not create one.
- **Payload**: The input data carried in a single inference request. Its size limit is the strongest constraint in choosing an option.
- **Synchronous call / asynchronous call**: Waiting until the response arrives / submitting only the request and receiving the result later via S3 or a notification.
- **Cold start**: The phenomenon where the first request is slow because a container has to be brought up from an idle state. Serverless's signature trade-off.
- **Scale to zero**: Shrinking instances to 0 when there is no traffic to bring cost close to 0.
- **Idle cost**: Money spent on instances that are on even though there are no requests. Real-time's signature trap.
- **Queuing**: A method of putting requests in a queue and processing them in order. The working principle of Asynchronous.
- **SNS notification**: AWS messaging that announces processing completion or failure through a topic. Used for completion notices in asynchronous inference.
- **Batch Transform job**: A unit of execution that runs batch inference over a whole S3 dataset without an endpoint and releases resources when finished.
- **p99 latency**: The response time at the level of the slowest 1 of 100 requests. Used when talking about a tail latency SLO.

## 📝 Practice Questions

**Question 1.** A team wants to compute churn scores for all 20 million users in bulk every midnight and load them into a data warehouse. Users are not waiting for the results in real time. What is the most cost-effective inference method?

A) Run 2 Real-time Endpoints always on  
B) Serverless Inference  
C) Batch Transform  
D) Asynchronous Inference  

**Answer: C**  
Explanation: The keywords "no real-time response needed + bulk batch processing" mean Batch Transform. You are billed only while the job runs, so there is no always-on endpoint cost. Real-time (A) wastes money on idle billing, Serverless (B) is for payloads and low-volume calls, and Asynchronous (D) is for online queuing, so Batch is the right fit for processing a whole dataset in bulk.

---

**Question 2.** A model takes a 500MB high-resolution satellite image as input and runs inference for about 8 minutes. The result does not need to be immediate, and you want to be notified when processing completes. What is the appropriate option?

A) Real-time Endpoint  
B) Asynchronous Inference  
C) Serverless Inference  
D) Batch Transform  

**Answer: B**  
Explanation: The payload far exceeds the 6MB/60-second limits (500MB, 8 minutes), so Real-time (A) and Serverless (C, 4MB) are impossible. Asynchronous supports up to 1GB and 1 hour and announces completion through an SNS notification. Batch (D) is used for bulk dataset processing, not single online requests.

---

**Question 3.** A tool used by internal analysts is called an average of 30 times a day at irregular times. The payload is small, and a slight delay on the first request is acceptable. You want idle cost to be zero. What should you choose?

A) Serverless Inference  
B) Real-time Endpoint with auto scaling  
C) Batch Transform  
D) Multi-model endpoint  

**Answer: A**  
Explanation: Intermittent, unpredictable traffic + small payload + cold start acceptable + $0 idle cost is the textbook Serverless scenario. With Real-time (B), even using auto scaling the minimum instances stay on, so a complete $0 is hard. Batch (C) is not for online requests, and multi-model (D) is a technique for hosting many models, not a cost pattern.

---

**Question 4.** An e-commerce site's real-time recommendation API receives steady traffic of thousands of requests per second and must respond within p99 latency of 50ms. What is the most suitable inference method?

A) Asynchronous Inference  
B) Batch Transform  
C) Serverless Inference  
D) Real-time Endpoint  

**Answer: D**  
Explanation: Sustained high traffic + a strict low-latency requirement is exactly the definition of an always-on Real-time Endpoint. Asynchronous (A) is queuing-based near-real-time, Batch (B) is offline, and Serverless (C) has difficulty guaranteeing a strict p99 latency because of cold starts.

---

**Question 5.** Which is correct for the payload/response limits of a Real-time Endpoint?

A) Payload 1GB, up to 1 hour of processing  
B) Payload 6MB, response within 60 seconds  
C) Payload 100MB, unlimited time  
D) Payload 4MB, GPU required  

**Answer: B**  
Explanation: A synchronous Real-time call has a 6MB payload and 60-second response limit. 1GB and 1 hour (A) are Asynchronous, large unlimited volume (C) is closer to the characteristics of Batch Transform, and 4MB (D) is Serverless's payload limit and a GPU is not required either.

---
