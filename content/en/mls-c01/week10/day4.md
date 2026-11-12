# Day 4 - Model Deployment Strategies: A/B Testing, Blue/Green, Canary, Shadow, Rollback

## 📌 Key Takeaways

- A model that passes offline evaluation is not guaranteed to win in production. Deployment is **a procedure of exposing risk only a little at a time, measuring, and rolling back quickly if needed**.
- All strategies share one foundation — the mechanism of **placing multiple ProductionVariants on one endpoint and adjusting traffic weights**.
- **A/B** compares business KPIs, **Blue/Green** is a full cutover + instant rollback, **Canary** goes from a small share to gradual expansion, and **Shadow** validates with zero user exposure.
- The differences among strategies ultimately reduce to two levers: **what percent of users see the new model**, and **how quickly you can roll back**.
- Deployment guardrails combine **All-at-once / Canary / Linear** traffic shifting with **CloudWatch alarm-based automatic rollback** and a bake time.

## The Foundation of All Strategies: ProductionVariant Traffic Weights

It is common for a new model to fall apart because of a shift in the real data distribution, increased latency, or failure on a specific segment. That is why deployment is designed not as "start it up or fail" but on a single lever: **multiple Variants + weights**.

```python
from sagemaker.session import production_variant

variant_a = production_variant("ModelA", "ml.m5.xlarge", initial_weight=90, initial_instance_count=2)
variant_b = production_variant("ModelB", "ml.m5.xlarge", initial_weight=10, initial_instance_count=1)
session.endpoint_from_production_variants("ab-endpoint", [variant_a, variant_b])
```

- Weights 90/10 → 90% of traffic goes to A and 10% to B.
- Over time you adjust 90/10 → 50/50 → 0/100. This simple lever drives A/B, canary, and Blue/Green alike.
- With the `TargetVariant` parameter, you can force a specific invocation to the Variant you want (for testing and debugging).

```text
[ProductionVariant weight shift]

          A (old version)                B (new version)
t0   ████████████████████ 100%   ░ 0%      ← just before deployment
t1   ██████████████████ 90%      ██ 10%    ← canary starts
t2   ██████████ 50%               ██████████ 50%   ← A/B comparison window
t3   ░ 0%                         ████████████████████ 100%  ← full cutover
                    ↑ at any point, reverting the weights is a rollback
```

A deployment strategy is defined by two levers. (1) **What percent of users** is the new model exposed to? (2) **How quickly do you roll back** if there is a problem? A/B tests both at once, canary grows exposure gradually, and shadow fixes exposure at zero. The strategies differ precisely in this "degree of exposure."

## A/B Testing: Compare Side by Side

You run two models at the same time and collect **business KPIs** (click-through rate, conversion rate, retention) to decide statistically which is better.

```text
ModelA (old) 50%  ──┐
                    ├─ same endpoint, split by weight
ModelB (new) 50%  ──┘
→ collect KPI metrics from both sides → statistical test
```

| Item | Description |
|---|---|
| Goal | **Statistical significance of business metrics**, not ML metrics |
| Variant targeting | `TargetVariant` can pin a specific test to one model |
| Duration | Run **long enough** to achieve statistical power |
| Exposure | Both sides return responses to real users |

> ⚠️ **Pitfall**: The purpose of A/B is **comparison**, not "safe cutover." If the passage says simply "move safely to the new version" rather than "judge which is better using real-usage metrics," the answer is canary or Blue/Green, not A/B.

## Blue/Green Deployment: Full Cutover + Fast Rollback

You bring up Blue (currently serving) and Green (the new version) side by side. After fully validating Green, you switch traffic over at once, and if a problem occurs, you revert to Blue.

```text
Blue(v1) 100% ──validate──> Green(v2) 100%   (full cutover)
                          problem occurs
             Green(v2) ──rollback──> Blue(v1) 100%
```

- **Advantage**: The cutover is instant, and so is the rollback (Blue is still alive).
- **Risk**: With no staged exposure, **100% of traffic hits** Green at once — if there is a problem, everyone sees it at the same time.
- **SageMaker default behavior**: `UpdateEndpoint` generally starts a new fleet in a Blue/Green manner and then shifts traffic.
- **Cost**: During the cutover window, instances for Blue and Green are kept **simultaneously**, so resources temporarily double.

## Canary Deployment: Gradual Expansion from a Small Share

You first send only a small percentage (e.g., 5%) to the new version, and if it is healthy, expand to 25% → 50% → 100%.

```text
v2 5% → (check metrics) → 25% → 50% → 100%
      → (metrics worsen) → roll back to 0% immediately
```

- **Advantage**: Problems are caught **first in a small segment**. The blast radius is limited.
- **SageMaker deployment guardrails**: Provide Canary/Linear traffic shifting + automatic rollback based on CloudWatch alarms.

### Deployment Guardrail Traffic Shifting Modes

| Mode | How traffic moves | Character |
|---|---|---|
| `All-at-once` | Switch everything at once | Corresponds to Blue/Green. Fastest, but the exposure risk is greatest |
| `Canary` | A small batch first → if healthy, the rest all at once | Limits initial risk to a small amount |
| `Linear` | Increase by a fixed percentage at each interval | Gentle and predictable. The total cutover time is the longest |

## Shadow Deployment: Validation with Zero Risk

Requests are sent to **both the old and new versions, but the only response returned to the user is the old version's**. The new version's output remains only in the logs.

```text
Request ──> Old model ──> only this response is returned to the user
        └─> New model ──> recorded only in logs (the user never sees it)
                        → compare response content / latency / error rate
```

- **When**: Before moving on to a canary, when you want to validate the new version safely on the real traffic distribution.
- **Advantage**: **User exposure to bugs in the new version is zero.**
- **SageMaker Shadow Tests**: Place the production Variant and the shadow Variant side by side and compare only through logs.
- **Cost**: Because the same request is processed twice, **inference cost doubles**.

The difference between canary (gradual exposure to real users) and shadow (zero exposure, logs only) lies in **who sees the result**. A/B is an intentional split for comparison, canary is a staged expansion of risk, and shadow is validation that eliminates the risk itself. Choose by the level of risk you can tolerate.

## Rollback and Automatic Guardrails

| Method | Behavior | Speed |
|---|---|---|
| Manual rollback | Call `UpdateEndpoint` again with the previous EndpointConfig | Instant if Blue is still alive |
| Automatic rollback | A CloudWatch alarm exceeds its threshold → the deployment guardrail halts the shift and reverts | As soon as the alarm fires |
| Bake time | A waiting period that observes metrics after a shift before moving to the next stage | For early detection of problems |

### Which Metrics to Watch When Deciding on Rollback

| CloudWatch metric | Meaning when it worsens | Interpretation during deployment |
|---|---|---|
| `Invocation5XX` | Spike in server errors | The new version's container itself is broken → roll back immediately |
| `Invocation4XX` | Spike in client errors | The input/output schema or serialization changed → suspect a contract mismatch |
| `ModelLatency` | Model container inference time increases | The new version got heavier → raise the instance size or roll back |
| `OverheadLatency` | SageMaker processing overhead increases | Suspect payload or serialization issues |
| `CPU/Memory Utilization` | Resource saturation | The new version uses more resources → re-estimate capacity |
| Business KPIs (clicks, conversions) | Drop | Technically normal but model quality is poor → decide with A/B |

> ⚠️ **Pitfall**: It is easy to mistake **normal technical metrics alone (5XX, latency)** for deployment success. A model can respond without errors and still have worse prediction quality. That is why business-KPI comparison (A/B) and technical-metric-based automatic rollback (canary) cannot substitute for each other.

### Conditions for a Rollback Chain to Hold

```text
[Prerequisites for safe deployment]
  ① The previous EndpointConfig remains          → there is something to revert to
  ② Rollback criteria (alarms) defined in advance → no human needs to watch by eye
  ③ The cutover is staged (or Blue is alive)     → time to revert is secured
  ④ Each stage has a bake time                   → delayed symptoms are caught too
  ─────────────────────────────────────────
  If even one is missing, the claim "rollback is fast" does not hold
```

## Placing Strategies by Situation

In practice you often chain them in the order **shadow → canary → full cutover** rather than choosing just one.

| Situation | Suitable strategy | Rationale |
|---|---|---|
| The model structure changed greatly, so the output schema may differ | Shadow | Compare response format and latency on real traffic before exposing users |
| The recommendation algorithm was replaced and must be judged by click-through rate | A/B | Technical metrics cannot tell which is better. KPI samples are needed |
| It is a minor version bump and only regression risk needs managing | Canary | Detect regressions early with small exposure, auto-revert with alarms |
| It is a security patch that must be applied to everyone immediately | Blue/Green | Cutover speed takes priority over the benefits of gradual exposure |
| Traffic is low and 5% will not gather enough samples | Blue/Green or shadow | The canary's small-share stage becomes statistically meaningless |

## Deployment Strategy Comparison Table

| Strategy | How traffic moves | User exposure | Rollback speed | Resource cost | When not to use |
|---|---|---|---|---|---|
| **A/B test** | Fixed split by weight (e.g., 50/50) | Both sides exposed | Fast, by adjusting weights | Both Variants run continuously | When the goal is a simple version swap, or when KPI samples are too few to reach significance |
| **Blue/Green** | Switch everything at once | 100% after cutover | **Fastest** (Blue kept) | 2x during the cutover window | When risk must be limited by gradual exposure, or when there is no spare capacity |
| **Canary** | Small share → staged expansion | Only a few at first | Fast (revert to 0%) | Increases during the cutover window | When an immediate full cutover is needed, or when the problem type does not show up at small traffic |
| **Shadow** | Replicate requests, do not return responses | **0%** | No concept of rollback (just turn it off) | Two inferences' worth | When you need to see real user reactions (KPIs), or cannot afford double inference cost |

## Strategy Selection Decision Tree

```text
You must put a new model into production
├─ Is it acceptable to show users even a little of the new version's responses?
│    ├─ No → Shadow deployment (replicate requests, compare logs only)
│    └─ Yes ↓
├─ Is the goal "decide which of the two is better using real metrics"?
│    ├─ Yes → A/B test (weight split + sufficient duration + statistical test)
│    └─ No (the goal is replacement) ↓
├─ Do you want to limit risk in stages and even auto-revert?
│    ├─ Yes → Canary / Linear (deployment guardrails + CloudWatch alarm auto rollback)
│    └─ No ↓
└─ Is it fine to cut over immediately and revert immediately if there is a problem?
     └─ Yes → Blue/Green (All-at-once, keep Blue alive)
```

## Passage Clue → Answer Mapping

| Passage clue | Answer to choose | Reason |
|---|---|---|
| "Validate with real traffic without ever exposing it to users" | Shadow deployment | It does not return responses and only compares logs |
| "Start at 5% and expand in stages, auto-revert if the error rate spikes" | Deployment guardrail Canary + CloudWatch alarm auto rollback | The definition of gradual expansion + automatic rollback |
| "Move traffic periodically by a fixed percentage" | Linear traffic shifting | A fixed-percentage incremental method |
| "Decide which model is better using business KPIs such as click-through rate" | A/B test | The goal is a real-usage metric comparison |
| "Cut over at once, but must be able to revert immediately if there is a problem" | Blue/Green | Blue is alive, so switching back is instant |
| "Adjust weights gradually from 90/10 to 0/100" | Multiple ProductionVariants + weight split | The common foundational mechanism of all strategies |
| "Leave time to observe metrics right after the shift" | Bake time | An observation window before proceeding to the next stage |
| "Revert to the previous version's configuration" | `UpdateEndpoint` with the previous EndpointConfig | The standard procedure for manual rollback |
| "Deploy safely with Batch Transform / MME" | **Wrong option** | Both are inference/hosting methods, not deployment strategies |

In the next post, we cover the world after deployment — monitoring and model drift detection.

## 📖 Glossary

- **ProductionVariant**: The unit within a single endpoint that defines "serve this model on this instance at this share."
- **Traffic weight (InitialVariantWeight)**: The number that decides how requests are split among multiple Variants. 90/10 splits them 9:1.
- **A/B test**: A comparison experiment that exposes two models at once and judges which is better using real business metrics.
- **Blue/Green deployment**: A method of starting the new version (Green) while keeping the old version (Blue) alive and switching traffic over at once. Reverting is instant.
- **Canary deployment**: A method of sending only a small share of traffic to the new version first and increasing the share if nothing is wrong. The name comes from the canary in the coal mine.
- **Shadow deployment (Shadow Test)**: A validation method that sends the same request to the new version too but does not give the response to users and compares only through logs.
- **Deployment guardrails**: SageMaker's safety mechanism that bundles traffic-shifting methods (All-at-once/Canary/Linear) with automatic rollback.
- **Bake time**: The waiting time to watch metrics after moving traffic and before proceeding to the next stage.
- **Auto-rollback**: The behavior of halting the deployment and reverting to the previous configuration when a CloudWatch alarm fires.
- **EndpointConfig**: The blueprint that says which model to bring up on which instances at what share. Swapping it is both the zero-downtime replacement and the rollback mechanism.

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
