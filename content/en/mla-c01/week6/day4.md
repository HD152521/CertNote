# Day 4 - Batch & Serverless Inference Deep Dive: Throughput Tuning & Cost Tradeoffs

## 📌 Key Takeaways

- Batch and serverless share **zero always-on cost**, but their uses are opposite — bulk batch vs intermittent individual requests.
- The batch throughput levers are **InstanceCount (parallelism) · SplitType (splitting) · BatchStrategy/MaxPayload/MaxConcurrentTransforms (mini-batch)**.
- The input must be **splittable** for adding instances to have an effect. A single large file will not get faster no matter how many you add.
- To match predictions with the original IDs, use `input_filter`/`output_filter`/`join_source`.
- For serverless you specify only `MemorySize` + `MaxConcurrency`. Cold starts are mitigated with **Provisioned Concurrency** (which incurs standing cost).

## Batch Transform — Tuning for Bulk Processing

We dig into the two options on the opposite side from synchronous endpoints: **batch transform** and **serverless inference**. First, batch transform reads bulk input from S3, runs inference in bulk, and writes the results to S3. There are three levers for raising throughput.

- **InstanceCount**: Adding instances distributes the data for parallel processing. The most direct horizontal scaling.
- **Data splitting (SplitType)**: Split a large file into records with `Line` (per record line), `RecordIO`, `TFRecord`, and so on, and distribute them across instances/batches.
- **Mini-batch (BatchStrategy, MaxPayloadInMB, MaxConcurrentTransforms)**: Adjust the size of the bundle of records sent to the model at once and the number of concurrent requests.

```text
Parallel distribution structure of batch transform

 S3 input (several files or a splittable format)
   part-000.csv  part-001.csv  part-002.csv  part-003.csv
        │             │             │             │
        ▼             ▼             ▼             ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
   │Instance 1│  │Instance 2│  │Instance 3│  │Instance 4│   ← instance_count=4
   └─────────┘  └─────────┘  └─────────┘  └─────────┘
        │             │             │             │
        └─────────────┴──────┬──────┴─────────────┘
                             ▼
                       S3 output (.out)
                             │
                             ▼
                    Job ends → the whole cluster is deleted (cost 0)

 ⚠ If the input is a single giant file that can't be split, only Instance 1 works and the rest sit idle.
```

```python
from sagemaker.transformer import Transformer

transformer = Transformer(
    model_name="churn-model",
    instance_count=8,                 # Process in parallel on 8 instances
    instance_type="ml.m5.xlarge",
    strategy="MultiRecord",           # Put several records into one mini-batch
    max_payload=6,                    # Mini-batch max of 6MB
    max_concurrent_transforms=4,      # 4 concurrent requests per instance
    output_path="s3://bkt/out/",
)
transformer.transform(
    data="s3://bkt/in/",
    content_type="text/csv",
    split_type="Line",                # Split per line
)
```

What each parameter controls is summarized below.

| Parameter | What it controls | If you raise it | Caution |
|----------|-----------|--------|------|
| `instance_count` | Parallelism (horizontal scaling) | Shortens processing time | Cost rises proportionally too. Effective only if splittable |
| `split_type` | How to split the input | Distribution becomes possible with `Line`, etc. | If `None`, distribution happens only per file |
| `strategy` | Number of records in one request | `MultiRecord` reduces overhead | If the model accepts only single records, use `SingleRecord` |
| `max_payload` | Max mini-batch size (MB) | Raises throughput per request | If too large, it exceeds model memory |
| `max_concurrent_transforms` | Concurrent requests per instance | Raises instance utilization | If excessive, the container backs up |

- `strategy="MultiRecord"` bundles several records into one request to raise throughput, while `SingleRecord` sends only one record at a time (when the model accepts only single-record input).
- Choose `split_type` from `None` (whole file) · `Line` (per line) · `RecordIO` · `TFRecord` to match the input format.

Batch transform throughput is ultimately "parallelism × efficiency per instance." Adding instances speeds things up nearly linearly, but cost grows proportionally too, and distribution takes effect only if the data is divided into several files or can be split with `SplitType`. If the input is one giant file that cannot be split, a single instance takes it all and scaling doesn't work. So the start of tuning is to **shard the batch input into several files** or keep it in a format that allows per-line splitting.

> ⚠️ **Pitfall**: In batch transform, re-joining the input records with the output predictions can be tricky. To output the input ID together with the prediction, you must merge part of the input into the output with the `input_filter`/`output_filter`/`join_source` parameters (JSONPath). "How do I match the prediction result to the original record" is a practical and easily confused pitfall.

## Combining Input IDs with Prediction Results

You must not feed the ID column to the model, but the output is useless without the ID. This contradiction is solved with the filter parameters.

```python
transformer.transform(
    data="s3://bkt/in/",
    content_type="text/csv",
    split_type="Line",
    input_filter="$[1:]",        # Drop column 0 (customer ID) before passing to the model
    join_source="Input",         # Attach the input record back onto the output
    output_filter="$[0,-1]",     # Keep only [customer ID, prediction] in the final output
)
```

```text
Input  : [C1001, 34, Seoul, 12.5]
          └ ID    └───── features ─────┘

input_filter="$[1:]"   ─▶ Model input: [34, Seoul, 12.5]
Model output            ─▶ Prediction: 0.87
join_source="Input"    ─▶ Joined: [C1001, 34, Seoul, 12.5, 0.87]
output_filter="$[0,-1]"─▶ Final: [C1001, 0.87]
```

## Batch vs Real-time — When Batch Wins

Suppose you process 1 million records with the same model. Calling a real-time endpoint 1 million times incurs always-on instance cost plus call overhead, and you also have to manage traffic spikes. Batch transform briefly brings up a cluster, distributes the 1 million records across it, and shuts it down when done, so cost is incurred only during processing time.

A real-time endpoint is optimized for "an immediate response per request" and so has low latency for individual requests, but for bulk processing it must keep instances on and receive sequential/concurrent calls, which is inefficient. Batch maximizes bulk throughput through "data locality + bulk distribution." In summary, **bulk processing with no need for immediacy = batch is almost always cheaper and faster**. But since you cannot receive results in real time, batch is out if even a little immediacy is needed.

## Serverless Inference — Concurrency and Cold Starts

Serverless inference has exactly two things to specify.

- **MemorySizeInMB** (1024~6144): Increasing memory also increases the compute allocated.
- **MaxConcurrency**: The maximum number of requests processed at the same time. Requests beyond this are throttled.
- You don't choose an instance type → which also means **you cannot use a GPU**.
- It automatically brings up compute when traffic arrives and scales to 0 when there is none.

```python
from sagemaker.serverless import ServerlessInferenceConfig

serverless_config = ServerlessInferenceConfig(
    memory_size_in_mb=2048,   # 1024 ~ 6144
    max_concurrency=20,       # Max requests processed concurrently
)
predictor = model.deploy(serverless_inference_config=serverless_config)
```

The problem is the **cold start**. If there have been no calls for a while and the first request then arrives, a delay occurs while the container is brought up and the model is loaded.

```text
Cold start vs warmed state

[Cold]  Request ─▶ │Container start│Model download·load│Inference│ ─▶ Response
                   └──────────── several seconds ─────────────┘ ↑ only this part is real inference

[Warm]  Request ─▶ │Inference│ ─▶ Response            (milliseconds to a few hundred ms)

Provisioned Concurrency = holding the specified number in a "warm" state
                          → removes cold starts, but incurs that much standing cost
```

If you need consistently low latency, you can set **Provisioned Concurrency** to pre-warm a set number of instances. However, in that case that much standing cost is incurred, so part of the "completely zero cost" advantage is lost.

The serverless cost model is "compute time of the requests processed + (optionally) the standing portion of Provisioned Concurrency." The **rarer** the traffic, the larger the savings versus real-time thanks to scaling to 0, and the **steadier and heavier** the traffic, the more the savings advantage disappears or reverses. Provisioned Concurrency removes cold starts but brings standing cost, so it makes sense only in the compromise situation of "traffic is intermittent but the first-response delay is intolerable."

## Serverless vs Real-time — The Break-Even

As a rule of thumb, if the endpoint is idle most of the time serverless is cheaper, and if it is busy almost all the time real-time is cheaper. The break-even lies somewhere between the two.

| Decision axis | Serverless wins | Real-time wins |
|---------|----------------|---------------|
| Traffic pattern | Intermittent, long idle stretches | Steady or always high |
| Latency SLA | First-response delay is tolerable | Consistently low latency is essential |
| Hardware | CPU is enough | **GPU needed** (not possible with serverless) |
| Payload | 4MB or less | 6MB or less |
| Operational burden | No instance management | Scaling and capacity planning needed |
| Cost structure | Billed only for processing time | Billed for the entire running time |

> ⚠️ **Pitfall**: A simple mapping of "cost reduction = serverless" leads to wrong answers. Serverless is favorable when ① traffic is intermittent and ② you can tolerate cold starts. If you use serverless for steadily high traffic, compute-time billing accumulates and it can become more expensive than real-time, and cold starts make you miss the SLA. On the exam, first check the traffic pattern (intermittent vs steady) and the latency SLA (whether cold starts are tolerated).

## Revisiting the Boundary with Asynchronous Inference

When wrapping up batch and serverless, it is easy to confuse them with asynchronous. Separating the three looks like this.

| Aspect | Batch Transform | Serverless | Asynchronous |
|------|-----------|----------|--------|
| Endpoint | None (per job) | Yes | Yes |
| Response method | Results written to S3 | Synchronous response | S3 + SNS after queue processing |
| Request unit | The whole dataset | Individual request | Individual request |
| Payload | The whole dataset | <4MB | <1GB |
| Processing time | Per job (long runs possible) | <60 seconds | <60 minutes |
| Idle cost | 0 (terminates when done) | 0 (scale to 0) | 0 (scale to 0) |
| Typical signal | "Overnight batch scoring" | "Occasional calls, mostly idle" | "Big file, takes a few minutes" |

Individual requests whose payload/processing time exceed the serverless limits go to asynchronous, and bulk work with no immediacy goes to batch.

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Batch is just as slow even after increasing to 8 instances | The input is a single large file that can't be split | Shard the input into several files + `split_type="Line"` |
| The model container dies of out-of-memory during batch | `max_payload` is large so the mini-batch is too big | Reduce `max_payload` or switch to `SingleRecord` |
| The output file has only predictions and you can't tell whose they are | The input ID was not joined | Specify `join_source="Input"` + `output_filter` |
| Only the first serverless request takes several seconds | Cold start | Set Provisioned Concurrency |
| Requests are throttled on serverless | Concurrent requests exceed `MaxConcurrency` | Raise `MaxConcurrency`; caller-side retries and backoff |
| Cost increased after switching to serverless | Traffic is steadily high so processing-time billing accumulates | Return to real-time + Auto Scaling |
| A GPU model can't be put on serverless | Serverless does not support GPUs | Deploy on real-time (GPU) or asynchronous |

The next article reviews all of Week 6 (inference options, real-time endpoints, advanced inference, batch and serverless) comprehensively.

## 📖 Glossary

- **Batch Transform**: A job that runs inference on bulk data in S3 all at once without an endpoint and disappears when finished.
- **Sharding**: Dividing large data into several pieces. It must be divided for several instances to share the processing.
- **SplitType**: An option that specifies in what units to split the input. Per line (`Line`) is the most common.
- **Mini-batch (BatchStrategy)**: The bundle of records sent to the model at once. Bundling several (`MultiRecord`) reduces overhead.
- **MaxConcurrentTransforms**: The number of requests one instance processes at the same time. It governs instance utilization.
- **join_source**: An option that attaches the original input record back onto the batch output. Used for ID matching.
- **JSONPath filter**: A notation like `$[1:]` for picking only certain columns from a record. Used for input and output filters.
- **MaxConcurrency**: The maximum number of requests a serverless endpoint processes at the same time. Beyond it, requests are throttled.
- **Provisioned Concurrency**: A serverless setting that pre-warms a set number. It removes cold starts but incurs standing cost.
- **Throttling**: The service rejecting or deferring requests that exceed the allowed limit.

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
