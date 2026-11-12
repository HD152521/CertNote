# Day 5 - Week 6 Synthesis: Inference Deployment Review

This week covered inference deployment—bringing trained models into production. One core message: **inference mode choice is driven by request pattern, not algorithm.** Is traffic steady or sporadic? Immediate response needed? Payload/runtime size? Where to cut cost? Today we weave Days 1–4 into single decision flow—ready to unpack in exam.

## 4 Inference Options Totaled

Re-etch Day 1's core table:

| Option | Response | Traffic | Payload/Runtime | Always-on Cost |
|--------|----------|---------|-----------------|----------------|
| Real-time | Sync, ms–sec | Steady | <6MB, <60s | Yes (min 1) |
| Serverless | Sync, ms–sec | Sporadic | <4MB, <60s | No (scale to 0) |
| Async | Queue-based async | Variable, long | <1GB, <60m | No (scale to 0) |
| Batch Transform | Job-based | Bulk | Full dataset | No (terminates) |

```text
Decision Tree
Immediate response needed?
 ├─ No → entire dataset bulk? → Yes: Batch Transform / No (individual, large payload, long): Async
 └─ Yes → steady traffic? → Yes: Real-time / No (sporadic, cold-start tolerable): Serverless
Extra constraint: payload >6MB or runtime >60s → real-time/serverless out, async/batch in
```

> 💡 **Related Theory**: 4 options root in "always-on cost vs latency vs throughput" triangle tradeoff. Real-time minimizes latency, costs always-on. Serverless zeroes cost, accepts cold-start latency. Async handles big jobs, queue delay. Batch maximizes throughput, kills immediacy. Exams embed which to prioritize in scenario. "under 50ms" prioritizes latency (real-time), "idle wastes money" prioritizes cost (serverless), "1M records at night" prioritizes throughput (batch).

## Real-time Endpoint Review

Real-time is anchored by **3-layer structure**. Model (artifact + container) → EndpointConfig (instance type/count, ProductionVariant weights) → Endpoint (HTTPS entity). This split enables zero-downtime blue/green deploy, A/B testing (weight distribution), shadow testing (discard response, verify).

**Auto-scaling** uses `SageMakerVariantInvocationsPerInstance` target tracking as standard, maintains min 1 instance (0 forbidden). Sudden spikes outrun auto-scale, so **scheduled scaling** or higher `MinCapacity` pre-positions.

**Instance choice**: traditional ML (XGBoost) = CPU (m5/c5), deep-learning = GPU (g4dn/g5), deep-learning cost cut = Inferentia (inf1/inf2). Uncertain? **Inference Recommender** load-tests, recommends optimal.

> ⚠️ **Trap**: Two favorite wrong answers. ① Attach GPU to XGBoost—tree models gain almost nothing from GPU, CPU wins. ② Scale real-time endpoint to 0—real-time enforces min 1; for 0 need serverless/async.

## Advanced Inference Review — What to Bundle in One Endpoint

Day 3's four patterns, one line each:

- **MME (Multi-model)**: same container + hundreds to thousands models, `TargetModel` spec, dynamic S3 load. "Many same-type models to cut endpoint cost."
- **MCE (Multi-container)**: different framework containers, max 15, `TargetContainerHostname` spec. "TensorFlow and PyTorch in one endpoint."
- **Inference Pipeline**: preprocessing → inference → postprocessing linear container chain (2–15), handle in single call. "Training-serving consistency (prevent skew)."
- **Inferentia (inf1/inf2)**: cut deep-learning inference cost/latency, needs Neuron compile. Elastic Inference legacy (fractional GPU), Inferentia replaces.

> 🔍 **Deep Dive**: MME vs MCE is exam's most frequent confuse pair. Deciding keywords: "frameworks same/different?" and "models hundreds/few?" Same container + many = MME, different containers + few = MCE. Inference Pipeline differs: not "pick which," but "sequential chain." Input flows through one container to next.

## Batch & Serverless Deep Review

**Batch Transform** is bulk's cheapest option. Throughput tuned via `InstanceCount` (parallel), `SplitType=Line` (record split), `BatchStrategy=MultiRecord`/`MaxPayloadInMB`/`MaxConcurrentTransforms`. Inputs sharded across files or split-capable format enables distribution. Match predictions to source IDs via `input_filter`/`output_filter`/`join_source`.

**Serverless**: specify `MemorySize` (1–6GB) + `MaxConcurrency` only, scales to 0. Cold-start issue? **Provisioned Concurrency** pre-warms (some always-on cost). Cost advantage valid only "idle abundant," steady high traffic favors real-time.

> 💡 **Related Theory**: Cost optimization's big picture: "eliminate idle cost." When traffic drops to 0, serverless/async/batch can zero that window's cost. Inverse: traffic always high → real-time + auto-scaling + (many models?) MME + (deep-learning?) Inferentia cut unit cost. Nearly all inference cost scenarios reduce to these two branches.

## Integrated Scenario Map

Exam keyword → answer map directly:

- "Fraud decision 50ms, steady traffic" → Real-time
- "Internal tool, occasional, lots idle, first delay OK" → Serverless
- "200MB image, 5min processing, individual request, result later" → Async
- "Nightly 10M scoring, no urgency" → Batch Transform
- "1,500 stores, same model type, occasional calls" → MME
- "TensorFlow + PyTorch, one endpoint" → MCE
- "Same preprocessing to inference, prevent skew" → Inference Pipeline
- "Deep-learning inference, GPU cost burden" → Inferentia
- "Decide instance type by data" → Inference Recommender
- "Deploy new model, zero downtime" → new EndpointConfig + update_endpoint (blue/green)

## Summary

Week 6 one-liner: **Request pattern decides inference option.** Immediacy, traffic, payload, cost split 4 options (real-time/serverless/async/batch); cost concerns narrow to many models → MME, deep-learning → Inferentia, high idle → scale-to-zero options. Bundle choice: MME (same container many), MCE (different containers few), pipeline (sequential chain). Master this decision tree and keyword map, inference domain largely solves.

Next week: deployed model operations—orchestration and monitoring.

---

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
