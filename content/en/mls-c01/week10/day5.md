# Day 5 - Week 10 Review: ML Implementation & Operations 1 — Deployment & Inference

This week covered "how to release trained models to production." Inference option selection (Day 1), real-time endpoint operations (Day 2), inference optimization (Day 3), deployment strategies (Day 4) look separate but form one decision flow: which inference mode → which endpoint config → how to optimize → how to deploy safely. Today we compress this flow into one page and organize keywords that split answers on the exam.

## Week 10 Decision Flow at a Glance

```text
[1] Choose Inference Mode
    Offline bulk → Batch Transform
    Online + large payload/long process → Asynchronous
    Online + sparse traffic → Serverless
    Online + steady traffic/low latency → Real-time
        │
[2] (Real-time) Endpoint Operations
    Zero-downtime replacement: separate EndpointConfig + UpdateEndpoint
    Cost/stability: auto-scaling (Target Tracking)
    Scale: Multi-Model (MME) / Multi-Container (MCE) / inference pipeline
        │
[3] Inference Optimization
    Reduce latency: Neo compilation, faster instances
    Reduce cost: Elastic Inference, Inferentia, Serverless
    Increase throughput: batch inference, auto-scale add instances
        │
[4] Safe Deployment
    Zero-exposure validation: shadow
    Few→expand + auto rollback: Canary (deployment guardrails)
    Real-traffic KPI compare: A/B
    Full switch + fast rollback: Blue/Green
```

> 💡 **Related Theory**: Exam questions almost always ask [1]~[4] slots. Key skill: grab keywords from the prompt (traffic pattern, payload size, latency/cost/throughput need, user exposure) and map to the correct slot.

## Day 1 Review: Inference Options Essential Table

```text
Option          Latency  Traffic    Payload/Time   Idle Cost
Real-time       ms       Continuous 6MB / 60s      Always charged
Serverless      seconds  Sparse     4MB / 60s      Free (cold start)
Asynchronous    quasi    Queued/big 1GB / 1 hour   0, scalable
Batch           Offline  Bulk once  Large          Job time only
```

Most common traps: "sparse traffic with always-on Real-time" → use Serverless; "500MB payload on Real-time" → exceeds 6MB limit, use Asynchronous.

## Day 2 Review: Endpoint Operations

- **3-tier**: Model → EndpointConfig → Endpoint. Separation enables zero-downtime replacement.
- **Auto-scaling**: Target Tracking + `SageMakerVariantInvocationsPerInstance` default. MinCapacity ≥ 1 (full 0 only for Serverless/Async).
- **3 Scale Patterns**:
  - MME = same container, thousands different models dynamically loaded (cost savings)
  - MCE = different containers (Direct/Serial)
  - Inference pipeline = preprocess→predict→postprocess serial (prevent training-serving skew)

## Day 3 Review: Inference Optimization

```text
Neo            : Compile for target hardware. Maintain accuracy, improve speed/memory. Edge strong
Elastic Infer. : Attach partial GPU acceleration to CPU instance (cost savings)
Inferentia     : Inference-only chip (Inf1/Inf2). High throughput, cost-efficient
Trainium       : Training-only chip (confusion alert — NOT inference)
Model lightweighting : Quantization (INT8), pruning, knowledge distillation
```

Match by need: lower latency→Neo/fast instances, lower cost→EI/Inferentia/Serverless, higher throughput→batch/Inferentia.

## Day 4 Review: Deployment Strategies

```text
A/B        : Compare KPI of two models on real traffic (need statistical significance)
Blue/Green : Full switch + blue alive for fast rollback
Canary     : Few (5%)→gradual expand, deployment guardrails + CloudWatch auto-rollback
Shadow     : Return responses to users — zero-risk validation
```

Trickiest distinctions: "zero user exposure + real-traffic validation" = shadow; "small exposure→expand + auto-return" = canary; "split exposure comparison" = A/B.

## Integrated Scenario Approach

When encountering exam prompts, grab keywords in this order:

```text
1. Online or offline?                    (need real-time response?)
2. Payload size and processing time?     (exceed 6MB/60s?)
3. Traffic pattern?                      (continuous/sparse)
4. What to reduce?                       (latency/cost/throughput)
5. Expose new model to users?            (shadow/canary/A-B/blue-green)
```

These five questions cover all Week 10 decision slots.

## Common Traps Summary

```text
Trap                                     → Correct Fix
Sparse traffic with always-on Real-time   → Serverless or Async (0-scale)
Large payload/long process on Real-time   → Asynchronous (1GB/1 hour)
Different framework models in MME         → MCE (different containers needed)
Preprocessing consistency issue           → Inference pipeline (serial containers)
Reduce edge latency                       → Neo compilation
Training chip mistaken for Inferentia     → Inferentia=inference, Trainium=training
Validate with zero user impact            → Shadow deployment
Safe gradual deploy + auto rollback       → Canary/Linear deployment guardrails
```

## Wrap-up

Week 10 moved beyond "making models work" to "operating them efficiently and safely." If you've internalized the flow (inference option → endpoint operations → optimization → deployment strategy) and how keywords split answers at each stage, you've achieved this week's goal. Next week (Week 11) continues ML implementation and operations' second axis — monitoring, model drift detection, security, and cost governance.

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
