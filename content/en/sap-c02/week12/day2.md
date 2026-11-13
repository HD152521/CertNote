# Day 2 - Compute Optimizer·Rightsizing — Internal Workings of ML-Based Recommendations, Tool Comparison, Automation Patterns

Cost optimization has two parallel paths. One is "buying cheaper" (commitments·Spot, covered yesterday with SP·RI), the other is "using only what you need" (rightsizing). The latter is more fundamental — no matter how good a commitment discount you buy, if an m5.4xlarge is consistently using only 5% CPU, that''s the same as buying an m5.large at 8x the price. Moreover, commitment discounts and rightsizing compound multiplicatively: applying a 72% commitment discount to an 8x over-provisioned instance is still vastly inferior to first reducing that 8x to 1x. Industry surveys like AWS''s FinOps whitepaper and Flexera''s State of the Cloud reach the same conclusion every year — over 30% of enterprise cloud spending is wasted, and the #1 cause is over-provisioning. Rightsizing delivers immediate impact without any commitments, making it the fastest lever available.

In SAP-C02, this domain is tested through operational design: "which tool gives which recommendation," "why aren''t memory recommendations appearing," "how do I consolidate recommendations across multiple accounts," "how do I safely auto-apply recommendations." Today we''ll cover Compute Optimizer''s internal ML analysis, the precise boundaries with Trusted Advisor·Cost Explorer, automated rightsizing pipelines, and equivalent capabilities in other clouds.

## Why Rightsizing Is Difficult — The Observability Trap

Although rightsizing seems simple in theory, it always gets stuck in practice due to a fundamental architectural limitation: **the hypervisor cannot see inside the guest OS**. EC2''s CPU·network·disk I/O are automatically metered at the hypervisor (Nitro) layer and flow into CloudWatch. But **memory utilization** is only visible inside the guest OS — from the hypervisor''s perspective, it cannot see how much of the allocated RAM is actually being used. Whether the guest OS uses 4GB out of 16GB or 15GB, all the host sees is "I allocated 16GB to this VM." Thus memory metrics can only be collected by installing a **CloudWatch Agent** inside the guest.

This single fact creates half of the exam''s pitfalls. In scenarios where "Compute Optimizer isn''t giving memory recommendations," the answer is almost always "memory metrics are missing because the CloudWatch Agent isn''t installed." Relying solely on CPU-based downsizing could incorrectly shrink memory-bound workloads (JVM heaps, in-memory caches, data pipelines, etc.), causing OOM (Out of Memory) events. The presence or absence of memory metrics is thus crucial to rightsizing safety.

> 💡 **Related Theory**: This is the **semi-opacity problem** in virtualization. The goal of virtualization is to isolate guests so they don''t know they''re running on a VM (transparency), but that isolation paradoxically prevents the host from seeing inside the guest. In OS theory, this is called the **semantic gap** — the hypervisor knows about physical page allocation but doesn''t know whether the guest OS classifies those pages as "in-use·cached·free." To recover guest-freed pages, the host must cooperate through a balloon driver (virtio-balloon, VMware Tools'' vmmemctl) that voluntarily returns memory from within the guest. For the same reason, in container environments (ECS/EKS), memory and application metrics require a separate agent (CloudWatch Agent, ADOT Collector). The general principle in this domain is that to achieve observability, you must intentionally pierce the isolation boundary with instrumentation.

> 🔍 **Deeper Dive**: AWS created two workarounds for this memory blind spot. (1) CloudWatch Agent''s `mem_used_percent` metric — the standard method. (2) **CloudWatch Application Signals / Application Insights** augment some memory signals. But for Compute Optimizer to produce memory recommendations, it ultimately needs CW Agent''s memory metrics continuously throughout the lookback period. Moreover, Compute Optimizer conservatively marks instances lacking memory data as "insufficient recommendation data," rather than guessing and recommending downsizing — this conservatism is a safety mechanism.

## Compute Optimizer — What Does It Analyze, and How

Compute Optimizer analyzes 14+ days of CloudWatch metrics using machine learning to produce specific recommendations per resource. The key difference from Trusted Advisor is that "analysis" is not simple threshold comparison.

| Resource | Recommendation Content |
|----------|------------------------|
| **EC2 Instances** | Downsize/upsize, family change, generational modernization (m5→m6i) |
| **Auto Scaling Group** | Recommended instance type·size |
| **EBS Volumes** | gp2→gp3 conversion, IOPS·Throughput adjustment |
| **Lambda Functions** | Memory setting recommendations (cost·performance co-optimization) |
| **ECS on Fargate** | Task CPU·Memory recommendations |
| **RDS DB Instances** | DB instance resizing (added 2024) |
| **Commercial Software Licenses** | License optimization (e.g., SQL Server) |

Each EC2 recommendation is classified as a **finding** — Under-provisioned (insufficient resources, needs upsize), Over-provisioned (excess resources, can downsize), Optimized (appropriate). Each carries a **performance risk** score quantifying the impact on performance if that downsizing is performed.

> 🔍 **Deeper Dive**: The critical insight is that Compute Optimizer''s ML examines **time-series patterns**, not just simple averages. If you only look at average CPU at 10%, you''d recommend downsizing, but if a daily batch job spikes to 90%, that downsizing would crash it. CO examines percentiles like P95·P99 and hourly patterns, then presents "up to 3 recommended options + performance risk level (Very Low~Very High) for each." Additionally, if you enable **enhanced infrastructure metrics** (adding memory·EBS I/O·network metrics), the lookback extends from the default 14 days to up to 93 days (3 months), yielding more precise recommendations. This is a paid option billed per active resource hour. In exams, if you need "higher precision across longer periods" or "recommendations reflecting seasonality," enhanced metrics is the keyword.

> 🔍 **Deeper Dive**: Compute Optimizer doesn''t just recommend "smaller." **Generational modernization recommendations** often yield better results for both cost and performance. For example, m5.xlarge → m6i.large increases per-core performance so you can reduce size while maintaining performance, and the per-unit cost also drops. Graviton recommendations (e.g., m6g/m7g) come with a separate **migration effort tier** (whether code rebuilding is needed), so the tool doesn''t blindly suggest ARM for x86-dependent workloads. In exams, if "maintain performance + reduce cost + minimize architecture changes" appears, look for same-ISA generational upgrade; if "maximize price-to-performance + can rebuild," that''s a Graviton signal.

> ⚠️ **Pitfall**: The old knowledge that "Compute Optimizer doesn''t support RDS" is outdated. Since 2024, RDS DB instance (and storage) recommendations are included. SAP exams often test bleeding-edge features beyond typical learning material — "DB instance rightsizing recommendation" might have Compute Optimizer as the answer. Conversely, "why aren''t memory recommendations appearing" is always answered by the absence of CloudWatch Agent memory metrics. Don''t confuse these two pitfalls.

## The Three-Tool Triangle — Compute Optimizer vs Trusted Advisor vs Cost Explorer

All three tools offer "savings recommendations," but they differ in depth and purpose. Exams test these boundaries precisely.

| Item | Compute Optimizer | Trusted Advisor | Cost Explorer Rightsizing |
|------|-------------------|-----------------|---------------------------|
| Analysis Method | **ML / time-series** | Simple rules (thresholds) | CO data reused |
| Depth | Precise (type·IOPS·memory) | Summary (unused·underutilized) | Cost-focused simplified |
| Target Resources | EC2·ASG·EBS·Lambda·ECS·RDS | 5 categories broadly | EC2 mainly |
| Cost | Free (basic) / enhanced paid | Business+ Support required (full checks) | Free |
| Strength | Concrete action recommendations | Broad coverage | Cost impact visualization |

Core distinction: **Trusted Advisor is "broad and shallow"** (sweeps 5 categories — Cost·Performance·Security·Fault Tolerance·Service Limits — using rule-based checks), **Compute Optimizer is "narrow and deep"** (precision ML analysis of compute·storage resources). Cost Explorer Rightsizing repackages CO''s recommendation data from a cost perspective; use it when you want to see "how much can we save."

> 💡 **Related Theory**: This division mirrors the SRE concept of **signal-to-noise tradeoff**. Rule-based approaches like Trusted Advisor are fast and interpretable but generate many false positives — "CPU under 10%" as a simple rule will incorrectly flag batch spike workloads. ML-based (CO) learns patterns to reduce false positives but requires 14+ days of data, training time, and offers less intuitive explanations (harder for humans to trace why this recommendation appeared). This is the classic precision-recall tradeoff in classifier evaluation. In operations, you use both in layers — TA broadly screens the entire infrastructure (high recall), then CO provides precise analysis on suspect resources (high precision) before action.

> 💡 **Related Theory**: Other clouds solve the same problem equivalently. **Azure Advisor** (5 categories: Cost·Security·Reliability·Performance·Operational Excellence) corresponds to Trusted Advisor, while **GCP Recommender / Active Assist** (instance rightsizing, idle resource detection) corresponds to Compute Optimizer.

| Feature | AWS | Azure | GCP |
|---------|-----|-------|-----|
| Rule-based broad checks | Trusted Advisor | Azure Advisor | Recommendation Hub |
| ML rightsizing recommendations | Compute Optimizer | Azure Advisor (VM right-size) | Recommender (machine type) |
| Cost visualization | Cost Explorer | Cost Management | Cloud Billing Reports |
| Detailed billing export | CUR | Cost Management Exports | BigQuery Billing Export |

The key insight is that all three clouds share the same 4-layer structure: "broad rule checks + ML rightsizing + cost visualization + detailed export." In multi-cloud FinOps scenarios, knowing this correspondence reveals the answer.

## Automated Rightsizing Pipeline — Safely Applying Recommendations

If operations teams manually apply recommendations each time, they''ll fall behind as scale grows. SAP exams ask you to design a "safe pipeline for auto-applying recommendations." The standard pattern is:

```
[CloudWatch + CW Agent Metrics]  ← Agent required for memory recommendations
        ↓ Collect 14+ days
[Compute Optimizer ML Analysis]
        ↓ Daily Export (recommendation export to S3)
[S3 (Recommendations CSV/Parquet)]
        ↓ Trigger
[EventBridge Scheduler → Lambda Parsing·Filtering]
        ↓  Pass only performance risk = Very Low + Over-provisioned
[SNS / Step Functions Approval Gate] ← Production instances need human approval
        ↓ After approval
[Stop → ModifyInstanceAttribute → Start]
Or [ASG Launch Template Update + Instance Refresh]
Or [EBS gp2 → gp3 ModifyVolume (zero-downtime)]
```

There are two design points here. First, **EC2 type changes require stop→modify→start, bringing downtime**, while EBS gp2→gp3 conversion is **zero-downtime via ModifyVolume**. Second, **add an approval gate (SNS/manual approval) for production workloads** to avoid blindly auto-applying ML recommendations. Non-production has lower risk so it can be fully automated; production needs human approval — this two-tier approach is the standard SAP answer pattern.

> 🔍 **Deeper Dive**: In ASG environments, you cannot directly stop/modify instances — ASG will mark them unhealthy on health checks and terminate them, then spin up new ones to match desired capacity. The correct approach is to **create a new Launch Template version** with the recommended type and perform **Instance Refresh** to rolling-replace the fleet. Instance Refresh respects `MinHealthyPercentage` for gradual replacement approaching zero-downtime, and `checkpoints` allow partial rolling replacement then validation before proceeding. More sophisticated approaches use **Mixed Instances Policy + attribute-based instance selection (ABIS)** where you specify attributes like "4 vCPU, 8GB+ memory" and let ASG auto-select suitable types. In exams, if an answer includes "directly modify instances in ASG," it''s a trap; the correct answer is "Launch Template + Instance Refresh."

> 📚 **Case Study**: An e-commerce company operated thousands of EC2 instances and manually attempted rightsizing quarterly, but the review pace couldn''t keep up with infrastructure growth, resulting in chronic 30%+ over-provisioning (buying commitments but never actually reducing size — waste stacking on top of commitments). The solution was a pipeline: Compute Optimizer recommendations exported to S3 daily → Lambda filters only "performance risk Very Low + Over-provisioned" recommendations → auto-apply to non-production, require Slack approval before applying to production. Within 6 months, roughly 22% computing cost reduction. Lesson: rightsizing is not a one-time project but a **continuous operational practice**, and without automation, you''ll inevitably fall behind at scale.

> 📚 **Case Study**: A counterexample failure also aids exam thinking. A fintech company looked only at average CPU and bulk-downsized their overnight batch instances from m5.2xlarge → m5.large, but daily 02:00 settlement batches began failing with OOM errors cascading daily. The root cause: no CloudWatch Agent meant no memory metrics, so Compute Optimizer couldn''t make memory recommendations, and operations saw only CPU recommendations and downsized accordingly. Lesson: downsizing based only on CPU metrics without memory is an anti-pattern, and batch-like spike workloads must have percentiles·hourly patterns verified before action.

## Organization-Wide Recommendation Consolidation

In multi-account environments, designate Compute Optimizer as a **delegated administrator** to see recommendations from all member accounts in one place. No need to hop between account consoles; you aggregate savings opportunities across the entire Org and export·analyze in bulk from the delegated admin account.

> ⚠️ **Pitfall**: For "centrally viewing rightsizing recommendations across multiple accounts," the answer is **Compute Optimizer delegated administrator + Org-level opt-in**, not Config Aggregator or Cost Explorer. Config Aggregator collects resource configuration compliance, not rightsizing recommendations. Cost Explorer shows cost trends, not type·IOPS-level precision recommendations. You must distinguish tool purposes precisely. Additionally, it''s common exam material that the delegated administrator activates Org-wide in one step — member accounts don''t each individually opt-in separately.

## Summary

The essence of rightsizing is "use only what you need," powered by the **Compute Optimizer** engine analyzing 14+ days of metrics with ML. Memory recommendations depend on **CloudWatch Agent** due to virtualization''s semi-opacity (semantic gap). Recommendations are automated via an **S3 Export → EventBridge → Lambda filtering → approval gate → apply** pipeline, with ASG nodes replaced via **Launch Template + Instance Refresh** (not direct instance modify). The same 4-layer structure (rule checks·ML rightsizing·cost visualization·detailed export) exists identically in Azure and GCP.

Common SAP exam mappings: (1) "precise type·IOPS·memory recommendations" → **Compute Optimizer**, (2) "no memory recommendations appearing" → **CW Agent not installed**, (3) "broad shallow 5-category checks" → **Trusted Advisor (Business+)**, (4) "auto-apply recommendations pipeline" → **S3 Export + EventBridge + Lambda (+approval)**, (5) "ASG instance replacement" → **Launch Template + Instance Refresh**, (6) "consolidate Org-wide recommendations" → **CO delegated administrator**, (7) "DB instance rightsizing" → **Compute Optimizer (RDS support)**, (8) "preserve performance + minimal change savings" → same-ISA generational upgrade, "can rebuild + maximum value" → Graviton. Next day covers Cost Explorer·Budgets·CUR for cost visibility and control.

---

## 📝 Practice Questions

**Question 1.** A team enabled Compute Optimizer, but for EC2 instances it produces only CPU-based recommendations and no memory-based recommendations at all. What is the most likely cause?

A) Compute Optimizer does not support memory

B) The CloudWatch Agent is not installed in the guest OS, so memory metrics are not collected

C) 14 days have not yet passed

D) IAM permissions are insufficient

**Answer: B**
Explanation: The hypervisor cannot see memory usage inside the guest OS (the semantic gap of virtualization). Therefore memory metrics can be collected only by installing the CloudWatch Agent on the instance; without the Agent, recommendations based on CPU, network, and disk, which Nitro instruments automatically, are produced, but memory recommendations are not generated. A is wrong (CO provides memory recommendations). C is possible, but the clue that "only memory is missing while CPU appears" points to a metric-type problem (absence of a specific metric) — if 14 days had not elapsed, CPU recommendations would not appear either. With D, no recommendations would appear at all. Trap: the answer to "only memory recommendations are missing" is almost always that the CW Agent is not installed.

---

**Question 2.** An operations team wants to automate rightsizing of thousands of EC2 instances continuously rather than as a one-time effort. Which pipeline is the most appropriate for applying recommendations safely?

A) Review manually every week in the Trusted Advisor console

B) Export Compute Optimizer recommendations to S3 → EventBridge → Lambda filter → automatically apply to non-production, apply to production after an approval gate

C) A Lambda that immediately applies all recommendations automatically

D) Automatically terminate with a CloudWatch Alarm when CPU is low

**Answer: B**
Explanation: Continuous and safe rightsizing is a pipeline that exports CO recommendations to S3, has Lambda filter only the Over-provisioned recommendations with low performance risk, automatically applies them to low-risk non-production, and applies them to production through an approval gate. With A, review speed cannot keep up with infrastructure growth at scale. C applies ML recommendations uncritically and risks wrongly shrinking spike workloads. D is a simple rule that looks only at average CPU and can kill batch spikes. Trap: always place an approval gate on production workloads and split automatic/manual handling by risk level.

---

**Question 3.** You want to replace the instances managed by an ASG with smaller types according to Compute Optimizer recommendations. What is the correct method?

A) Stop each instance → ModifyInstanceAttribute → start

B) Put the recommended type in a new Launch Template version and do a rolling replacement with Instance Refresh

C) Delete the ASG and create a new one

D) Terminate the instances directly and the ASG will launch them with the new type on its own

**Answer: B**
Explanation: If you directly stop/modify an instance in an ASG environment, the ASG judges it unhealthy in the health check and terminates and recreates it, and it comes back up with the original type from the old Launch Template. The correct method is to put the recommended type in a new version of the Launch Template and gradually replace instances without downtime using Instance Refresh while honoring MinHealthyPercentage. A fails because the ASG interferes. C is unnecessarily destructive. D brings instances back up with the old type from the existing Launch Template, so the replacement does not happen. Trap: "directly modifying ASG instances" is the wrong answer; Launch Template + Instance Refresh is correct.

---

**Question 4.** You want to quickly get a broad rule-based check covering security, performance, fault tolerance, cost, and service limits. Which tool should you use?

A) Compute Optimizer

B) Trusted Advisor (Business or higher Support)

C) CUR

D) X-Ray

**Answer: B**
Explanation: Trusted Advisor performs a broad rule-based check across five categories — Cost, Performance, Security, Fault Tolerance, and Service Limits — and the full set of checks is enabled with Business or higher Support. A (Compute Optimizer) analyzes compute and storage narrowly and deeply using ML and does not look at policy or fault tolerance as a whole. C (CUR) is billing data, not a check tool. D (X-Ray) is distributed tracing. Trap: "broad and shallow across 5 categories" is Trusted Advisor; "narrow and deep precise recommendations" is Compute Optimizer. (Note: the counterparts are Azure Advisor in Azure and Recommender in GCP.)

---

**Question 5.** In an Organization made up of 50 member accounts, you want to view the rightsizing recommendations of all accounts consolidated on a single screen. What is the most appropriate method?

A) Go through each account's console and check

B) Designate Compute Optimizer's delegated administrator and enable it at the Org level (opt-in)

C) Collect recommendations with a Config Aggregator

D) Filter by account in Cost Explorer

**Answer: B**
Explanation: If you designate a delegated administrator for Compute Optimizer, you can view the recommendations of all member accounts in the Org aggregated centrally and export and analyze them in bulk. A is impractical at scale. C (Config Aggregator) collects resource configuration compliance, not rightsizing recommendations. D (Cost Explorer) visualizes cost and is not an integration of precise rightsizing recommendations. Trap: "consolidating rightsizing recommendations across multiple accounts" is the CO delegated administrator, and it must be distinguished from compliance consolidation (Config Aggregator) and cost consolidation (Cost Explorer).

---

**Question 6.** You received a Compute Optimizer recommendation to convert an EBS volume from gp2 to gp3. Which statement about this conversion is correct?

A) The volume must be detached and recreated, so a long downtime is required

B) It can be converted without downtime with ModifyVolume, and cost and performance usually improve

C) The change takes effect only if you stop the instance

D) Data is lost, so you must restore from a snapshot

**Answer: B**
Explanation: The gp2→gp3 conversion is performed online without downtime through the ModifyVolume API without detaching the volume, and gp3 is usually about 20% cheaper at the same performance level and lets you set IOPS and Throughput independently of capacity (with gp2, IOPS is tied to capacity). A and C confuse this with an EC2 type change (stop → modify → start); changing an EBS type does not require stopping the instance. D is wrong (data is preserved). Trap: an EC2 type change involves a stop, but EBS gp2→gp3 is non-disruptive.

---

**Question 7.** You want to analyze a workload with a longer lookback and precise recommendations that reflect memory and disk I/O. There is seasonality (month-end spikes), so 14 days is not enough. What should you do?

A) Switch to Trusted Advisor

B) Enable Compute Optimizer's enhanced infrastructure metrics to extend the lookback to up to 93 days

C) Look at the Cost Explorer Forecast

D) Increase the instance size

**Answer: B**
Explanation: Turning on Compute Optimizer's enhanced infrastructure metrics incorporates additional metrics (memory, disk I/O, and so on) and extends the lookback from the default 14 days to up to 93 days (3 months), producing precise recommendations that reflect seasonality such as month-end spikes. It is a paid option billed per hour for each active resource. A is rule-based and cannot see seasonal patterns. C is a cost forecast, not a rightsizing recommendation. D does not solve the problem. Trap: "a longer period and precise recommendations that reflect seasonality" points to enhanced infrastructure metrics.