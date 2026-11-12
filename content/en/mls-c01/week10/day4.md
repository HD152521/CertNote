# Day 4 - Deployment Strategies: A/B Testing, Blue/Green, Canary, Shadow, Rollback

New models passing offline tests don't guarantee production wins. Real-world data shifts, latency changes, specific segments fail. Smart deployment risks incrementally, measures, rolls back fast if needed. Today covers **A/B testing** (compare side-by-side), **blue/green** (full swap + rollback), **canary** (gradual ramp), **shadow** (zero-risk test), and **rollback** chains.

## Foundation: ProductionVariant Traffic Weights

All strategies rest on one mechanism: **multiple Variants, traffic weights**.

```python
from sagemaker.session import production_variant

variant_a = production_variant("ModelA", "ml.m5.xlarge", initial_weight=90, initial_instance_count=2)
variant_b = production_variant("ModelB", "ml.m5.xlarge", initial_weight=10, initial_instance_count=1)
session.endpoint_from_production_variants("ab-endpoint", [variant_a, variant_b])
```

Weights 90/10 → 90% traffic to A, 10% to B. Adjust 90/10 → 50/50 → 0/100 over time. This simple lever powers all strategies.

> 💡 **Related Theory**: Two levers: (1) what % of users see new model? (2) how fast roll back? A/B tests both. Canary ramps gradually. Shadow risks zero. These differ precisely in exposure degree.

## A/B Testing: Compare Side-by-Side

Run both models simultaneously, collect **business KPIs** (clicks, conversion, retention).

```text
ModelA (old) 50%  ──┐
                   ├─ same endpoint, split by weight
ModelB (new) 50%  ──┘
→ collect KPI metrics from both → statistical test
```

- **Goal**: Statistical significance on business metrics, not just ML metrics
- **Variant target**: `TargetVariant` param lets specific tests force one model
- **Duration**: Run long enough for statistical power

## Blue/Green Deployment: Full Swap + Fast Rollback

Blue (running), Green (new version) run in parallel. Green fully validated, then flip all traffic. Rollback just re-flip.

```text
Blue(v1) 100% ──validate──> Green(v2) 100%   (full switch)
                             issue
                Green(v2) ──rollback──> Blue(v1) 100%
```

- **Advantage**: Instant switch, instant rollback (blue still running)
- **Risk**: 100% traffic hits Green all at once without gradual exposure
- **SageMaker default**: Typically implements blue/green on UpdateEndpoint

## Canary Deployment: Gradual Ramp

New version gets small % (5%) first, expand if healthy → 25% → 50% → 100%.

```text
v2 at 5% → (check metrics) → 25% → 50% → 100%
         → (metrics fail) → immediate 0% rollback
```

- **Advantage**: Catches problems in small segment
- **SageMaker deployment guards**: Canary/Linear traffic shift + CloudWatch alarm auto-rollback

```text
Deployment guard traffic shift modes:
  All-at-once : Full switch (blue/green)
  Canary      : Small ramp, then rest
  Linear      : Fixed % increments per period
```

## Shadow Deployment: Zero-Risk Test

Traffic → both old and new model, but **only old response returns to user**. New model's output logged, not shown.

```text
Request ──> Old model ──> User sees this response
         └─> New model ──> Logged (user doesn't see)
                          → compare responses/latency
```

- **When**: Validate new model on real traffic safely before canary
- **Advantage**: Zero user exposure to new model bugs
- **SageMaker Shadow Tests**: produ production Variant and shadow Variant side-by-side for log-only comparison

> 💡 **Related Theory**: Canary (real user exposure gradually), Shadow (zero user exposure, log-only) differ precisely in who sees results. A/B (intentional split for comparison), Canary (risk ramp), Shadow (risk none). Choose by tolerance.

## Rollback and Auto-Guard Rails

Manual rollback: previous EndpointConfig via UpdateEndpoint (blue alive → instant).

Auto-rollback: CloudWatch alarm breach → deployment guard halts, reverts.

Bake time: Post-switch, observe metrics before next step.

## Deployment Strategy Selector

```text
Compare models on live KPIs    → A/B Test
Full switch + instant rollback → Blue/Green
Gradual ramp + auto-rollback   → Canary (+guards)
No user risk validation        → Shadow
```

## Summary

Deployment isn't "launch or fail." A/B tests both (comparison). Blue/Green flips all instantly. Canary ramps safely. Shadow validates zero-risk. All use variant weights + traffic splits. Rollback fast — old version still running.

Next: Post-deployment — monitoring for drift.

## 📝 Practice Questions

**Question 1.** You want to validate a new recommendation model's responses and latency against production traffic and compare them with the production model, without exposing the new model to real users at all. Which strategy is MOST appropriate?

A) A/B testing  
B) Canary deployment  
C) Shadow deployment (shadow testing)  
D) Blue/green deployment  

**Answer: C**  
Explanation: Shadow deployment replicates traffic to the new model as well but does not return its responses to users, so there is zero exposure risk while still validating on the real distribution. A/B (A), canary (B), and blue/green (D) all expose the new model's responses to real users to some degree.

---

**Question 2.** You want to send a new model version only 5% of traffic at first, expand in stages to 25%, 50%, and 100% if CloudWatch metrics are healthy, and automatically roll back if the error rate spikes. What should you use?

A) All-at-once traffic shifting  
B) Deployment guardrails in Canary mode with automatic rollback based on CloudWatch alarms  
C) Re-run Batch Transform  
D) Multi-model endpoint  

**Answer: B**  
Explanation: Gradual expansion starting from a small amount, with automatic reversion when metrics degrade, is a configuration that combines deployment guardrails' Canary (or Linear) traffic shifting with automatic rollback based on CloudWatch alarms. All-at-once (A) switches everything at once, and Batch (C) and MME (D) are not deployment strategies.

---

**Question 3.** You want to run two models at the same time on the same endpoint, each with 50% of the traffic, collect a business KPI such as click-through rate over a sufficient period, and determine which model is statistically better. What is this approach?

A) Shadow deployment  
B) Blue/green deployment  
C) A/B testing  
D) Rollback  

**Answer: C**  
Explanation: Splitting traffic between two models by weight, exposing both at the same time, and comparing real KPIs to decide which is better is A/B testing. Shadow (A) does not expose, blue/green (B) focuses on switching rather than comparison, and rollback (D) is a reversion action.

---

**Question 4.** Which statement correctly describes the main trade-off of blue/green deployment?

A) At the moment of cutover 100% of traffic goes to the new version, so without staged exposure the risk appears all at once, but because blue is still running, rollback is fast  
B) It always sends only 1% of traffic to the new version  
C) It never shows users the new version's responses  
D) It keeps two models at 50/50 permanently  

**Answer: A**  
Explanation: Blue/green fully brings up green and then switches over at once, so without staged exposure the risk is revealed all at the same time, but because the blue environment remains intact, you can roll back immediately if there is a problem. 1% at a time (B) is canary, no exposure (C) is shadow, and a permanent 50/50 split (D) is only a temporary state of A/B.

---

**Question 5.** In SageMaker, what is the common foundation of the deployment strategies that adjusting the traffic weights of ProductionVariants from 90/10 to 0/100 gradually makes directly possible?

A) Scheduling Batch Transform jobs  
B) The compilation capability of the Inferentia chip  
C) Neo's hardware optimization  
D) The mechanism of placing multiple variants on one endpoint and splitting traffic by weight  

**Answer: D**  
Explanation: Strategies such as A/B, canary, and blue/green all operate on the common mechanism of multiple ProductionVariants within one endpoint and adjustment of traffic weights. Batch (A), Inferentia (B), and Neo (C) are optimization or execution tools unrelated to splitting deployment traffic.

---
