# Day 5 - Week 10 Comprehensive Review: ML Implementation and Operations 1 — Deployment and Inference

## 📌 Key Takeaways

- Week 10 covered "how do we send a trained model out to production." Days 1–4 are not separate topics but **one decision flow**.
- The flow has four steps: **which inference mode → which endpoint configuration → what to optimize → how to deploy safely**.
- The inference mode splits along four axes: **latency requirement, traffic pattern, payload size, and idle cost** (Real-time / Serverless / Asynchronous / Batch).
- Optimization divides into **changing the model (quantization, pruning, distillation, Neo) / changing the hardware (Inferentia, EI, instances) / changing the structure (pipelines, batching)**.
- Deployment strategies split by **degree of user exposure**: shadow (0%) → canary (small → expanding) → A/B (split comparison) → Blue/Green (full switch).

## The Week 10 Decision Flow on One Page

```text
[1] Choose the inference mode
    Offline, bulk                          → Batch Transform
    Online + large payload / long process  → Asynchronous
    Online + intermittent traffic          → Serverless
    Online + sustained traffic / low latency → Real-time
        │
[2] (Real-time) Operating the endpoint
    Zero-downtime replacement : separate EndpointConfig + UpdateEndpoint
    Cost and stability        : Auto Scaling (Target Tracking)
    Scaling out the fleet     : Multi-model (MME) / Multi-container (MCE) / inference pipeline
        │
[3] Inference optimization
    Latency ↓    : Neo compilation, a faster instance
    Cost ↓       : Elastic Inference, Inferentia, Serverless
    Throughput ↑ : batch inference, autoscale out, Inferentia
        │
[4] Safe deployment
    Validation with zero exposure          : shadow
    Small → expanding + automatic rollback : canary (deployment guardrails)
    Compare KPIs on live traffic           : A/B
    Full switch + fast rollback            : Blue/Green
```

Exam questions almost always ask about one slot among [1]–[4]. The key skill is to pick out keywords from the passage (traffic pattern, payload size, latency/cost/throughput requirement, whether user exposure is allowed) and map them to the right slot.

## Day 1 Review: The Four Inference Options at a Glance

| Option | Latency | Traffic pattern | Payload / time limit | Billing / idle cost | When not to use it |
|---|---|---|---|---|---|
| **Real-time** | Milliseconds | Sustained, stable | 6MB / 60 seconds | Instance running hours (always billed) | When traffic is sparse, or the payload exceeds 6MB |
| **Serverless** | Seconds | Intermittent, highly variable | 4MB / 60 seconds | Requests + duration, **zero idle cost** | When a strict p99 latency is needed (cold start), or a GPU is needed |
| **Asynchronous** | Near real time | Queued, large payloads | 1GB / up to 1 hour | Instance hours, **can scale to 0** | When the user is waiting for an immediate response |
| **Batch Transform** | Offline | Bulk batch processing | 100MB per record, large datasets | Only the job's running time | When you must answer single online requests |

- Two classic traps: **"intermittent traffic but a Real-time endpoint always on"** → switch to Serverless, and **"a 500MB payload through Real-time"** → exceeds the 6MB limit, so Asynchronous.
- The decision order filters out **the strongest constraints first**. If the payload is 1GB, Real-time/Serverless are physically eliminated without even weighing the traffic pattern.

```text
Zero idle cost               : Serverless, Asynchronous (scale to 0), Batch Transform
Always billed                : Real-time (as long as instances are on)
Predictable fixed cost       : Real-time (capacity is reserved in advance, so it is stable)
```

## Day 2 Review: Operating Real-time Endpoints

| Axis | Key point | Exam point |
|---|---|---|
| Three-layer structure | Model → EndpointConfig → Endpoint | Because they are separate, swapping in a new Config with `UpdateEndpoint` gives **zero-downtime replacement** |
| Auto Scaling | Target Tracking + `SageMakerVariantInvocationsPerInstance` | MinCapacity ≥ 1 — **true scale-to-zero is only Serverless/Async** |
| Cooldown | Short for ScaleOut, long for ScaleIn | Prevents flapping up and down with traffic fluctuation |
| Policy types | Target Tracking / Step Scaling / Scheduled | "Maintain a specific metric value" → Target Tracking |

### Distinguishing the Three Scale-Out Patterns

| Pattern | Definition | When |
|---|---|---|
| **MME** (multi-model endpoint) | The same container + thousands of different model artifacts loaded dynamically (LRU unload) | Hundreds to thousands of models in the same framework, with cost reduction as the goal |
| **MCE** (multi-container endpoint) | N different containers. Direct (individual invocation) or Serial mode | Putting models from different frameworks on one endpoint |
| **Inference pipeline** | Containers chained in series (preprocessing → prediction → postprocessing) and handled in one request | Preventing training-serving skew, removing network round trips |

> ⚠️ **Trap**: On an MME, a **model that has not been invoked for a long time is unloaded from memory**, so the first call incurs cold-loading latency. The model has not been deleted, and the instances have not shrunk to 0.

### Operational Monitoring Metrics

```text
ModelLatency               : Time the model container spent on inference
OverheadLatency            : SageMaker processing overhead (request/response handling)
Invocations                : Number of invocations
Invocation4XX / 5XX        : Client / server errors
CPU/GPU/Memory Utilization : Resource utilization → basis for scaling and instance-type decisions
```

If latency concentrates in `ModelLatency`, optimize the model or move up an instance; if it concentrates in `OverheadLatency`, suspect payload or serialization problems.

## Day 3 Review: Inference Optimization Means at a Glance

| Means | Category | Main effect | When not to use it |
|---|---|---|---|
| **SageMaker Neo** | Model change (compilation) | Compiles for the target hardware. Improves speed and memory **while preserving accuracy**. Strong at the edge | When the goal is lowering cost without accuracy loss (choosing hardware is the answer) |
| **Elastic Inference** | Hardware | Cuts cost by attaching only **partial GPU acceleration** to a CPU instance | Ultra-large, high-throughput workloads (Inferentia is better) |
| **Inferentia (Inf1/Inf2)** | Hardware | Inference-only chip. High throughput, cost efficient. Compile with the Neuron SDK | **Training** workloads (that is Trainium) |
| **Trainium (Trn1)** | Hardware | **Training-only** chip | Wrong if used for inference — easily used as a wrong choice |
| Quantization (INT8) | Model change | Size↓ speed↑, slight accuracy loss possible | When accuracy loss is absolutely unacceptable |
| Pruning | Model change | Slims the model by removing low-contribution weights and neurons | When you cannot afford the retraining and validation cost |
| Knowledge distillation | Model change | Transfers a large teacher's knowledge into a small student | When you have no capacity to rerun the training pipeline |
| Batch inference | Structure change | Groups requests to raise **throughput↑** (some per-request latency sacrificed) | When single-request low latency is the key requirement |
| Inference pipeline | Structure change | Removes network round trips + preprocessing consistency | When there is only one container |

- Match by goal: **latency ↓** → Neo, fast instances, slimming / **cost ↓** → EI, Inferentia, Serverless / **throughput ↑** → batch inference, Inferentia, scale out.

```text
Instance selection summary
  ml.m5 / ml.c5     : CPU. Light inference, pairs well with Neo
  ml.g4dn / ml.g5   : GPU. The standard for deep learning inference
  ml.p3 / ml.p4     : High-end GPU. Mainly training, heavy inference
  ml.inf1 / ml.inf2 : Inferentia. High-throughput, cost-efficient inference
  + Elastic Inference : Attach a partial GPU to a CPU instance
```

## Day 4 Review: Deployment Strategies at a Glance

| Strategy | Traffic movement | User exposure | Rollback | Representative keywords |
|---|---|---|---|---|
| **A/B test** | Fixed-weight split (50/50, etc.) | Both sides exposed | Adjust the weights | "Decide which model is better by click-through rate," "statistical significance" |
| **Blue/Green** | All-at-once full switch | 100% after the switch | Fastest (blue is kept) | "Switch all at once," "revert immediately" |
| **Canary / Linear** | Small → expanding in steps / fixed-percentage increments | Only a few at first | Automatic return to 0% | "Starting at 5%," "automatic rollback on alarm," "deployment guardrails" |
| **Shadow** | Requests duplicated, responses not returned | **0%** | Just turn it off | "Validate with live traffic without ever showing users" |

- There is one common foundation — the mechanism of **placing multiple ProductionVariants on one endpoint and adjusting the traffic weights**.
- Automatic rollback decisions are made with CloudWatch alarms: a surge in `Invocation5XX`, rising `ModelLatency`, resource saturation, and so on. Put a **bake time** between shifting steps.

> ⚠️ **Trap**: The three branches that are most confusing — "zero user exposure + live traffic validation" is **shadow**, "small exposure → expansion + automatic return" is **canary**, and "split exposure then compare" is **A/B**. Batch Transform and MME are inference/hosting methods, not deployment strategies, so if they appear in this slot they are wrong.

## Integrated Scenario Approach

When you meet a passage, pick out keywords in this order.

```text
1. Online or offline?                    (is an immediate response needed)
2. Payload size and processing time?     (does it exceed 6MB / 60 seconds)
3. Traffic pattern?                      (sustained or intermittent)
4. What must be reduced?                 (latency / cost / throughput)
5. Is the new model exposed to users?    (shadow / canary / A·B / Blue/Green)
```

These five questions cover every decision slot of Week 10.

### Running the Flow on a Case

> Situation: You are releasing a new model that analyzes high-resolution satellite images. The input is 500MB, processing takes 8 minutes, the result does not need to be immediate, and a completion notification is needed. It runs in the cloud, not at the edge, and you need to lower cost while keeping accuracy. The existing model is already in production.

```text
[1] Far exceeds 6MB/60 seconds → Real-time and Serverless are eliminated → Asynchronous (1GB/1 hour, SNS notification)
[2] Because it is Asynchronous, it can scale to 0 → no always-on instance cost
[3] "Maintain accuracy + speed and cost" → Neo compilation (quantization has room for accuracy loss, so it comes later)
[4] The existing model is already in production → first compare responses and latency with shadow → if there are no issues, expand with canary
```

## Frequently Missed Traps

| Trap situation | Correct prescription | Why |
|---|---|---|
| Running Real-time always on for intermittent traffic | Serverless or Asynchronous | Removes idle billing, can scale to 0 |
| Large payload / long processing through Real-time | Asynchronous (1GB / 1 hour) | Real-time has 6MB and 60-second limits |
| Putting models from different frameworks on an MME | MCE (different containers are required) | An MME shares one container |
| Preprocessing differs between training and inference | Inference pipeline (serial containers) | Blocks training-serving skew |
| Need to reduce latency on an edge device | Neo compilation | Improves speed and memory while preserving accuracy |
| Mistaking Trainium for an inference chip | Inferentia = inference, Trainium = training | A pair easily used as a wrong choice |
| Want to validate with zero user impact | Shadow deployment | It does not return responses |
| Safe gradual deployment + automatic rollback | Deployment guardrails Canary/Linear | Traffic shifting + CloudWatch alarms |
| Auto Scaling instances down to 0 | Not possible — MinCapacity ≥ 1 | True 0 is Serverless/Async |
| Replace by deleting the endpoint and recreating it | New EndpointConfig + `UpdateEndpoint` | Delete-and-recreate causes downtime |

## Passage Clue → Answer Mapping

| Passage clue | Answer to choose | Slot |
|---|---|---|
| "Nightly bulk prediction for all customers, remove always-on cost" | Batch Transform | [1] |
| "500MB input, 8-minute processing, notify on completion" | Asynchronous + SNS notification | [1] |
| "30 times a day, irregular, zero idle cost, cold start acceptable" | Serverless Inference | [1] |
| "Thousands per second, p99 50ms" | Real-time Endpoint | [1] |
| "Replace with a new version with zero downtime" | New EndpointConfig + `UpdateEndpoint` | [2] |
| "Keep the number of invocations per instance constant" | Target Tracking + `SageMakerVariantInvocationsPerInstance` | [2] |
| "Host 10,000 models in the same framework at low cost" | Multi-model endpoint (MME) | [2] |
| "Bundle preprocessing and prediction into one request" | Inference pipeline | [2] |
| "ARM edge device + reduce latency and memory + maintain accuracy" | SageMaker Neo compilation | [3] |
| "A full GPU is overkill and CPU is slow" | Attach an Elastic Inference accelerator | [3] |
| "Inference-only custom chip, high throughput, cost efficient" | Inferentia (Inf1/Inf2) | [3] |
| "Need to raise throughput, not latency" | Batch inference / scale out | [3] |
| "Validate without showing responses to users" | Shadow deployment | [4] |
| "5% → 25% → 100%, automatic return on alarm" | Deployment guardrails Canary | [4] |
| "Run two models 50/50 and compare KPIs" | A/B test | [4] |
| "Switch all at once but be able to revert immediately" | Blue/Green | [4] |

Week 10 was the week that moved from "the stage of making a model work" to "the stage of operating it efficiently and safely." In the next week (Week 11), we continue with the second axis of ML implementation and operations — monitoring, model drift detection, security, and cost governance.

## 📖 Glossary

- **Inference option** : The four deployment methods that make a model callable (Real-time / Serverless / Asynchronous / Batch Transform).
- **Cold start** : The initial delay that occurs when the first request arrives from an idle state and the container or model must be loaded anew.
- **Scale to zero** : Shrinking instances to 0 when there is no traffic so that cost disappears. Only Serverless and Asynchronous can do this.
- **EndpointConfig** : The blueprint that holds which model is served on which instances and at what share. Swapping it is both the zero-downtime replacement and the rollback mechanism.
- **Target Tracking** : An Auto Scaling policy where you only specify "keep this metric at this value" and it adjusts the instance count for you.
- **Train-serving skew** : The phenomenon where preprocessing at training time differs from preprocessing at serving time, degrading performance.
- **LRU unload** : On an MME, the way of taking down the model that has gone unused the longest when memory runs short.
- **Quantization** : A technique that lowers high precision such as FP32 to INT8 and the like to make the model light and fast.
- **Knowledge distillation** : A slimming technique that trains a small student model to imitate the outputs of a large, accurate teacher model.
- **Deployment guardrails** : A SageMaker safeguard that bundles traffic-shifting modes (All-at-once/Canary/Linear) with CloudWatch-alarm-based automatic rollback.

## 📝 Practice Questions

**Question 1.** A company operates an online recommendation API. Traffic is continuous and low latency is essential, and to reduce inference latency further it wants to compile the trained PyTorch model for the target instance. Which is the correct combination of inference method and optimization tool?

A) Batch Transform + Trainium  
B) Real-time Endpoint + SageMaker Neo  
C) Serverless + Elastic Inference  
D) Asynchronous + multi-model endpoint  

**Answer: B**  
Explanation: Continuous traffic and low latency call for Real-time, and compilation that reduces latency while maintaining accuracy is Neo. Batch + Trainium (A) is mismatched because it is offline and a training chip, Serverless (C) is unsuitable for low latency because of cold starts, and Asynchronous (D) is near-real-time and does not meet a requirement for immediate responses.

---

**Question 2.** During training, data was preprocessed with Scikit-learn and predictions were made with XGBoost, and there are thousands of per-customer models on the same framework. Which features are suited to (a) guaranteeing preprocessing-prediction consistency and (b) cost-efficient hosting of thousands of models, respectively?

A) (a) Inference pipeline, (b) multi-model endpoint  
B) (a) Multi-model endpoint, (b) inference pipeline  
C) (a) Blue/green, (b) canary  
D) (a) Neo, (b) Inferentia  

**Answer: A**  
Explanation: Bundling preprocessing and prediction into one request to prevent training-serving skew is an inference pipeline, and dynamically loading thousands of same-framework models onto shared instances to reduce cost is a multi-model endpoint. The other combinations have the roles swapped (B) or have different purposes as deployment strategies and optimization tools (C, D).

---

**Question 3.** You want to validate a new model with production traffic but never show its responses to users. Which deployment strategy is appropriate?

A) A/B testing  
B) Blue/green  
C) Shadow deployment  
D) Canary  

**Answer: C**  
Explanation: Shadow deployment replicates traffic and sends it to the new model as well but does not return its responses, so user exposure is zero. A/B (A), blue/green (B), and canary (D) all serve the new model's responses to real users to some degree.

---

**Question 4.** Every night you run batch predictions for all customers and want to eliminate the cost of an always-on endpoint. In addition, no separate deployment strategy or traffic splitting is needed. What is the correct choice?

A) Real-time Endpoint + canary deployment  
B) Batch Transform  
C) Serverless Inference + A/B testing  
D) Asynchronous + shadow deployment  

**Answer: B**  
Explanation: Large-volume bulk processing that does not need real-time responses, plus eliminating always-on cost, is Batch Transform (billed only for job run time). The rest combine online inference methods with unnecessary deployment strategies and do not fit the scenario.

---

**Question 5.** Which of the following matches is incorrect?

A) Gradually expanding a new version from 5% to 100% with automatic reversion on alarm — deployment guardrails Canary  
B) Keeping invocations per instance constant — Target Tracking autoscaling  
C) Online inference with a 500 MB payload and 8-minute processing — Real-time Endpoint  
D) High throughput and cost efficiency with an inference-specific custom chip — Inferentia  

**Answer: C**  
Explanation: 500 MB and 8 minutes far exceed Real-time's 6 MB and 60-second limits, so the correct choice is Asynchronous (1 GB, 1 hour), not Real-time. Therefore C is the incorrect match. A (canary automatic rollback), B (Target Tracking), and D (Inferentia) are all correct matches.

---
