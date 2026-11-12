# Day 5 - Week 6 Synthesis: Inference Deployment Review

## 📌 Key Takeaways

- **The inference mode is decided by the request pattern, not the algorithm** — four axes: immediacy, traffic, payload, and cost.
- Four options: real-time (steady traffic + low latency) / serverless (sporadic traffic + scale to zero) / asynchronous (1GB, 60 minutes) / batch (bulk jobs at the lowest cost).
- When cost is the concern — many models means **MME**, deep learning means **Inferentia**, long idle periods mean an **option that scales to zero**.
- Ways to bundle models behind one endpoint: MME (same container, many models) / MCE (different containers, few) / pipeline (sequential chain).
- Zero-downtime deployment means a **new EndpointConfig + `update_endpoint`** (Blue/Green); risk-free validation means **shadow testing**.

## Week 6 Overview

This week covered inference deployment, which is how a trained model is actually served. We weave Day 1 through Day 4 into a single decision flow so you can pull it out straight away in the exam room.

```text
                       [ Trained model ]
                                │
                    ① How do requests arrive?   ← Day 1
        ┌───────────────┬───────┴───────┬───────────────┐
        ▼               ▼               ▼               ▼
    Real-time        Serverless      Asynchronous    Batch transform
 (steady, low       (sporadic,      (large          (bulk job)
  latency)           scale to 0)     payload)
        │
        │  ② How do you operate the endpoint?      ← Day 2
        ├─ Model → EndpointConfig → Endpoint
        ├─ Auto scaling (InvocationsPerInstance, minimum 1 instance)
        ├─ Zero-downtime deployment (update_endpoint, blue/green)
        └─ A/B (weights) · Shadow (responses discarded)
        │
        │  ③ How do you cut cost and complexity?   ← Day 3
        ├─ MME (same container + hundreds to thousands of models)
        ├─ MCE (containers for different frameworks, up to 15)
        ├─ Inference pipeline (preprocess → inference → postprocess)
        └─ Inferentia (lower deep learning inference cost, Neuron compile)
        │
        │  ④ How do you tune bulk and sporadic workloads?   ← Day 4
        ├─ Batch: InstanceCount · SplitType · BatchStrategy
        └─ Serverless: MemorySize · MaxConcurrency · Provisioned Concurrency
```

## Summary of the Four Inference Options

Let's burn Day 1's key table into memory once more.

| Option | Response | Traffic | Payload / time | Always-on cost |
|------|------|--------|---------------|----------------|
| Real-time | Synchronous, ms to seconds | Steady | <6MB, <60 seconds | Yes (minimum 1 instance) |
| Serverless | Synchronous, ms to seconds | Sporadic | <4MB, <60 seconds | None (scales to 0) |
| Asynchronous | Queue-based asynchronous | Variable, long processing | <1GB, <60 minutes | None (scales to 0) |
| Batch transform | Per job | Bulk | Entire dataset | None (shuts down when finished) |

```text
Selection decision tree
Is an immediate response required?
 ├─ No → Bulk run over the whole dataset? → Yes: batch transform / No (individual requests, large payload, long processing): asynchronous
 └─ Yes → Is traffic steady? → Yes: real-time / No (sporadic, cold start acceptable): serverless
Extra constraint: payload >6MB or processing >60 seconds → real-time/serverless are out; go to asynchronous/batch
```

> 💡 **Related theory**: At the root of the four options is the triangle trade-off of "always-on cost vs. latency vs. throughput." Real-time has the lowest latency but a constant cost; serverless has a cost near 0 but cold-start latency; asynchronous suits large jobs but adds queue delay; batch has the highest throughput but zero immediacy. The exam hides which of these three to prioritize inside the scenario. "Within 50ms" means latency first (real-time), "lots of idle time, so the cost is wasteful" means cost first (serverless), and "process 1 million records overnight" means throughput first (batch).

## Real-Time Endpoint Review

- **Three-layer structure**: Model (artifact + container) → EndpointConfig (instance type and count, ProductionVariant weights) → Endpoint (the HTTPS entity). This separation is what makes zero-downtime Blue/Green deployment, A/B testing (weighted traffic split), and shadow testing (validate while discarding responses) possible.
- **Auto Scaling**: Target tracking on `SageMakerVariantInvocationsPerInstance` is the standard, and at least 1 instance is always kept (0 is not allowed). Auto Scaling cannot keep up with sudden spikes, so prepare with **scheduled scaling** or a high `MinCapacity`.
- **Instance selection**: Traditional ML (XGBoost) = CPU (m5/c5), deep learning = GPU (g4dn/g5), cheaper deep learning = Inferentia (inf1/inf2). When the choice is hard, **Inference Recommender** load-tests and recommends the best configuration.

The flow from deployment through scaling to replacement, condensed into one block of code, looks like this.

```python
import boto3
sm = boto3.client("sagemaker")
aas = boto3.client("application-autoscaling")

# 1) Create Config → Endpoint
sm.create_endpoint_config(EndpointConfigName="cfg-v1", ProductionVariants=[{
    "VariantName": "AllTraffic", "ModelName": "churn-model",
    "InstanceType": "ml.m5.xlarge", "InitialInstanceCount": 2}])
sm.create_endpoint(EndpointName="churn-ep", EndpointConfigName="cfg-v1")

# 2) Register auto scaling (minimum 1 instance, 0 not allowed)
aas.register_scalable_target(
    ServiceNamespace="sagemaker",
    ResourceId="endpoint/churn-ep/variant/AllTraffic",
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
    MinCapacity=2, MaxCapacity=10)

# 3) Replace with the new model without downtime — the endpoint name stays the same
sm.update_endpoint(EndpointName="churn-ep", EndpointConfigName="cfg-v2")
```

> ⚠️ **Trap**: There are two cases that are easily used as wrong answers. ① Attaching a GPU to XGBoost — tree models gain little from a GPU, so CPU is the correct answer. ② Trying to scale a real-time endpoint to 0 — real-time enforces a minimum of 1 instance, so if you need 0 you must go to serverless/asynchronous.

## Advanced Inference Review — What to Bundle into One Endpoint

Day 3's four patterns, distinguished one line at a time:

- **MME (multi-model endpoint)**: Same container + hundreds to thousands of models, specify `TargetModel`, models load dynamically from S3. "There are very many models of the same kind and I want to cut endpoint cost."
- **MCE (multi-container endpoint)**: Containers for different frameworks, up to 15, specify `TargetContainerHostname`. "TensorFlow and PyTorch on one endpoint."
- **Inference pipeline**: A linear chain of preprocessing → inference → postprocessing containers (2 to 15), handled in a single call. "Training/serving consistency (preventing skew)."
- **Inferentia (inf1/inf2)**: Cuts deep learning inference cost and latency, requires Neuron compilation. Elastic Inference is legacy (fractional GPU) and has been replaced by Inferentia.

MME vs. MCE is a pair that is easy to confuse in the exam. The deciding keywords are "are the frameworks the same or different?" and "are there hundreds of models or only a few?" Same container + many = MME, different containers + few = MCE. The inference pipeline differs from both in that it is "sequential execution," not "selective invocation." The input flows through one container and on to the next.

The invocation parameter name alone tells you immediately which pattern is in use.

| Parameter / API | Where it is used | Meaning |
|----------------|-------------|------|
| `TargetModel` | MME invocation | Which model artifact in S3 to use |
| `TargetContainerHostname` | MCE invocation | Which container to send to |
| `TargetVariant` | Real-time endpoint invocation | Ignore the weights and force a specific variant |
| `InitialVariantWeight` | EndpointConfig | Traffic split ratio per variant |
| `InputLocation` | Asynchronous invocation | S3 path where the input data is placed |
| `split_type` / `strategy` | Batch transform | Unit for splitting the input / mini-batch method |
| `join_source` | Batch transform | Join the original input back onto the output |
| `MaxConcurrency` | Serverless | Maximum number of requests handled concurrently |

## Batch and Serverless Deep Review

- **Batch transform** — the lowest-cost option for bulk jobs.
  - Throughput tuning: `InstanceCount` (parallelism), `SplitType=Line` (split by record), `BatchStrategy=MultiRecord`/`MaxPayloadInMB`/`MaxConcurrentTransforms`.
  - Input must be sharded into multiple files or kept splittable for distribution to work.
  - To match predictions to the original IDs, use `input_filter`/`output_filter`/`join_source`.
- **Serverless** — specify only `MemorySize` (1 to 6GB) + `MaxConcurrency` and it scales down to 0.
  - If cold starts are a problem, pre-warm with **Provisioned Concurrency** (this adds an always-on cost).
  - The cost advantage holds only "when there is a lot of idle time"; with steady, high traffic, real-time is cheaper.
  - Because you do not choose the instance type, **a model that needs a GPU cannot be deployed**.

The big picture of cost optimization is "eliminating idle cost." If there are periods when traffic drops to 0, serverless, asynchronous, and batch can bring the cost of those periods close to 0. Conversely, if traffic is always high, lower the unit cost with real-time + Auto Scaling + (for many models) MME + (for deep learning) Inferentia. Almost every inference cost scenario reduces to these two branches.

## Integrated Scenario Mapping

Here are exam keywords mapped directly to answers.

- "A decision within tens of ms at the moment of purchase, steady traffic" → real-time
- "Internal tool, called occasionally, lots of idle time, a first-call delay is acceptable" → serverless
- "200MB images, 5 minutes of processing, individual requests, results later" → asynchronous
- "Score 10 million records every night, immediacy not needed" → batch transform
- "The same kind of model for 1,500 stores, called occasionally" → MME
- "TensorFlow + PyTorch on one endpoint" → MCE
- "Apply the same preprocessing to inference, prevent skew" → inference pipeline
- "Deep learning inference, but the GPU cost is a burden" → Inferentia
- "Decide the instance type from data" → Inference Recommender
- "Deploy a new model with zero downtime" → new EndpointConfig + update_endpoint (Blue/Green)

## Summary of Pitfalls That Trigger Wrong Answers

These are the wrong choices that appear repeatedly in the exam.

| Plausible wrong answer | Why it is wrong | Correct choice |
|---------------|-----------|-------------|
| Attach a GPU (p4d) to XGBoost inference to save cost | Tree models gain almost nothing from GPU parallelization | CPU (m5/c5) |
| Scale a real-time endpoint in to 0 instances | Real-time enforces a minimum of 1 instance | Serverless / asynchronous |
| Choose serverless every time just because "cut cost" is mentioned | With steady, high traffic it actually costs more | Check the traffic pattern first |
| Deploy a GPU deep learning model as serverless | Serverless does not support GPUs | Real-time (GPU) / asynchronous |
| Delete and recreate the endpoint to deploy a new model | The address breaks and downtime occurs | New Config + `update_endpoint` |
| Validate the new model with a 50:50 A/B | Half of the users actually receive the new model's responses | Shadow testing |
| Consolidate models of different frameworks into an MME | An MME has only one container | MCE |
| Batch is slow, so keep adding instances | It has no effect if the input cannot be split | Input sharding + `split_type` |
| Process a 200MB, 5-minute request in real-time | Exceeds the 6MB / 60-second limit | Asynchronous inference |

## Symptom → Cause → Action Summary

| Symptom | Cause | Action |
|------|------|------|
| Normal on regular days but latency spikes only during events | Auto Scaling cannot keep up with startup time | Scheduled scaling / raise `MinCapacity` |
| Inference cost is high even during idle hours | Real-time endpoint running around the clock | Move to serverless / asynchronous / batch |
| Hundreds of models and the endpoint cost explodes | An endpoint was launched for every model | Consolidate with MME |
| Deep learning inference GPU cost is unaffordable | General-purpose GPU unit price | Inferentia (inf1/inf2) + Neuron compile |
| Production accuracy is lower than training performance | Preprocessing mismatch (training-serving skew) | Bundle preprocessing with an inference pipeline |
| Only the first call is slow (serverless, MME) | Cold start / cold load | Provisioned Concurrency, increase memory |
| Error rate rises after deployment | New model regression | Canary or linear shifting + alarm-based automatic rollback |

## One-Line Checklist

- [ ] Can you state the payload and processing time limits of the four options (6MB, 4MB, 1GB / 60 seconds, 60 seconds, 60 minutes)?
- [ ] Can you explain "real-time cannot be reduced to 0" along with the reason?
- [ ] Can you state the zero-downtime deployment procedure (new Config → `update_endpoint`) in order?
- [ ] Can you distinguish A/B from shadow by "whether the response goes to users"?
- [ ] Can you tell MME, MCE, and pipeline apart by their invocation parameter names?
- [ ] Do you remember that the first thing to check when batch is slow is "whether the input is splittable"?

Next week we move to the stage of operating the deployed models: orchestration and monitoring.

## 📖 Glossary

- **Request pattern**: The character of how often and in what size traffic arrives. It is the first criterion for choosing an inference option.
- **Always-on cost**: The fixed cost that keeps accruing because instances stay running even when there are no requests.
- **Scale to zero**: Shrinking instances all the way to 0 when there are no requests, which eliminates the cost.
- **Blue/Green deployment**: A zero-downtime replacement in which the new version is launched separately, traffic is moved over once it is confirmed healthy, and the old version is taken down.
- **Canary deployment**: Sending only a very small amount of traffic to the new version first, then widening it if there are no problems.
- **Shadow testing**: A method of validating a new model without affecting users by sending it a copy of real requests while discarding its responses.
- **MME / MCE**: Placing "same container + many models" and "different containers + few models," respectively, on one endpoint.
- **Inference pipeline**: A structure that chains preprocessing → inference → postprocessing containers in order and handles them in a single call.
- **training-serving skew**: The problem where preprocessing differs between training and inference, so performance silently degrades.
- **Scheduled scaling**: Scaling that raises capacity in advance at set times. Used for predictable surges.

## 📝 Practice Questions

**Question 1.** An inference workload has the requirements "individual requests, 300 MB input payload, about 10 minutes of processing, and results retrieved from S3 after completion." What is the most appropriate option?

A) Real-time endpoint  
B) Serverless inference  
C) Asynchronous inference  
D) Batch transform  

**Answer: C**  
Explanation: A 300 MB payload and 10 minutes of processing exceed the real-time/serverless limits (6 MB / 4 MB payload, 60 seconds), and the pattern of receiving individual requests in a queue and storing results in S3 exactly matches asynchronous inference (up to 1 GB, 60 minutes). A and B are eliminated by the payload and time constraints, and D processes a whole dataset in bulk, which differs from the "individual request" pattern.

---

**Question 2.** Which is the most accurate key criterion distinguishing a multi-model endpoint (MME) from a multi-container endpoint (MCE)?

A) MME has no cold start and MCE does  
B) MME dynamically loads hundreds to thousands of models in the same container, and MCE hosts up to 15 containers of different frameworks  
C) MME is batch-only and MCE is real-time-only  
D) Both run a sequential preprocessing-to-inference chain  

**Answer: B**  
Explanation: The key distinction is that MME shares the same container and dynamically loads many models from S3 (`TargetModel`), while MCE places up to 15 containers of different frameworks on one endpoint (`TargetContainerHostname`). A is an incorrect generalization, C is wrong because both are real-time endpoint variants, and D is wrong because running a sequential chain is a characteristic of an inference pipeline.

---

**Question 3.** Even with autoscaling applied to a real-time endpoint, latency spikes during a predictable large traffic surge (a year-end sale). What is the most appropriate complement?

A) Reduce MaxCapacity to 1  
B) Use scheduled scaling to secure capacity ahead of the sale, or raise MinCapacity  
C) Switch to serverless  
D) Downgrade the instance type to CPU  

**Answer: B**  
Explanation: Autoscaling takes time to launch new instances and pass health checks, so it cannot immediately keep up with a sudden spike; for predictable surges, prepare by increasing capacity in advance with scheduled scaling or by raising `MinCapacity`. A makes it worse by reducing capacity, C is more vulnerable to spikes because of cold starts, and D lowers performance and increases latency.

---

**Question 4.** Which of the following pairings of an inference cost reduction scenario and an appropriate technique is incorrect?

A) Hundreds of models of the same kind → multi-model endpoint (MME)  
B) Intermittent workload whose traffic drops to 0 → serverless/asynchronous  
C) GPU cost burden of large-scale deep learning inference → AWS Inferentia  
D) Reduce XGBoost inference cost → switch to GPU (p4d) instances  

**Answer: D**  
Explanation: Tree-based models such as XGBoost gain almost nothing from GPU parallelization, so switching to a high-performance GPU (p4d) only increases cost with no benefit; CPU instances are appropriate. A, B, and C are all correct cost-saving pairings: consolidating many models (MME), scaling to 0 when idle (serverless/asynchronous), and accelerating deep learning inference (Inferentia), respectively.

---

**Question 5.** While deploying a new model to a live real-time endpoint, you want to validate its performance on production traffic first, without exposing the new model's responses to users. What is the most appropriate method?

A) An A/B test with ProductionVariant weights of 50:50  
B) Shadow testing: send a copy of the traffic to the new model and discard the responses  
C) Delete and recreate the endpoint  
D) Reprocess historical data with batch transform  

**Answer: B**  
Explanation: Shadow testing sends a copy of production traffic to the new model but discards its responses instead of returning them to users, so you can validate the new model's performance without affecting real users. A violates the "no exposure" condition because half of the users actually receive the new model's responses, C causes downtime, and D is not validation on real-time production traffic.

---
