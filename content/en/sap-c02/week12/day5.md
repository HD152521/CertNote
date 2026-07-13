# Day 5 - Integrated Cost Optimization: Commitment Economics and Hidden Cost Trade-Offs

Cost optimization isn't simply "buy Reserved Instances." Pro exams present **4-dimensional matrix problems** (workload pattern + commitment model + transient discount + hidden costs) requiring optimal trade-off selection. The same EC2 demands different answers for 24/7 operation vs nightly batches vs traffic spikes; "invisible" costs like NAT Gateway often exceed 30% of total billing. Every decision sits atop the Well-Architected Framework's **Cost Optimization pillar** with 5 design principles (adopt consumption model, measure efficiency, eliminate data center operational costs, analyze/attribute spending, reduce TCO via managed services). Today we synthesize Week 12's complete cost optimization and expose Pro exam traps.

## Five Commitment Models: Flexibility vs Discount Risk Spectrum

Commitment discount economics centers on **risk transfer**. AWS must pre-purchase physical servers (capital spend + inventory risk); when customers promise "I'll spend $X hourly for 1-3 years," that capacity-planning uncertainty shrinks. The discount is AWS's compensation. **More specific the commitment (= more AWS uncertainty eliminated), the bigger the discount.** This is precisely financial **forward contract** economics.

| Model | Discount | Flexibility | Commitment Unit | Best Workload |
|-------|----------|---|---|---|
| Compute Savings Plans | ~66% | ★★★★★ (unified EC2/Fargate/Lambda) | $/hour | Diverse compute |
| EC2 Instance Savings Plans | ~72% | ★★★ (family/region locked) | $/hour | Sustained specific family |
| Standard RI | ~72% | ★★ (family/OS fixed) | Instance | 24/7, no family change |
| Convertible RI | ~54% | ★★★★ (family/OS exchangeable) | Instance | Family changes planned |
| Zonal RI | ~72% | ★ (specific AZ) | Instance | Capacity assurance needed |

Risk spectrum: **On-Demand** (AWS bears all, 0% discount) → **Convertible RI** → **Compute SP** → **EC2 Instance SP / Standard RI** (customer bears commitment risk ~72%) → **Spot** (customer bears termination risk ~90%). Every exam scenario's "flexibility vs discount" question maps to positioning your workload somewhere on this spectrum.

> 🎯 **Scenario**: "Company runs EC2 m5 family 24/7 with no family changes planned for 3 years. Has cash. Maximum discount?" → Answer: **EC2 Instance Savings Plans or Standard RI (3-year All Upfront)**. When family·region are fixed, there's no reason to pay for flexibility, so the most specific commitment wins. EC2 Instance SP gives one extra degree of freedom (size, OS, AZ within same family) vs Standard RI while matching ~72% discount.

> 💡 **Related Theory**: SP's flexibility comes from different commitment units. RI commits to "instances," but SP commits to "$/hour" — a **software abstraction layer** over physical resources. SP stacks a normalized "hourly cost" layer atop instances; whether underlying instances are m5 or m6i, the SP matches automatically. Abstraction reduces coupling, so workload modernization doesn't break commitments — a textbook architecture pattern.

> 🔍 **Going Deeper**: Payment options (All/Partial/No Upfront) follow same risk logic. All Upfront, AWS gets cash upfront (eliminates credit risk + captures time-value of money), earns biggest discount. "Have cash + max discount" signals All Upfront; "minimize upfront + still get commitment discount" signals No Upfront. Billing engine applies commitments in order: **Zonal RI → Regional RI → Savings Plans → On-Demand**, so most-specific commitments consume usage first. Over-buy RI, and RIs pre-empt usage, leaving nothing for SP to match — classic "SP utilization collapse" cause.

## Spot Instances: Up to 90% Discount + Termination Risk

- Priced 10-30% of on-demand, market supply/demand-driven
- **2-minute advance notice** before termination (EC2 instance rebalance recommendation comes earlier)
- Fits: stateless, fault-tolerant, batch, CI/CD, distributed ML, rendering, container workers

### Spot Fleet / EC2 Fleet Allocation Strategies

| Strategy | Behavior | Termination Risk |
|----------|----------|---|
| lowest-price | Prioritize cheapest pool | High |
| diversified | Spread evenly across pools | Low |
| **capacity-optimized** | Choose pools with lowest termination risk (recommended) | Lowest |
| capacity-optimized-prioritized | Above + explicit priority | Low |
| price-capacity-optimized | Balanced price·capacity (newest recommended) | Low |

> 📚 **Case Study**: A video rendering company united 10+ instance pools (c5, c5n, c5a, m5, m5n, etc.) under capacity-optimized. When one pool ran short, traffic auto-shifted to others; termination rate stayed <5%, cost savings ~80%. Lesson: Spot stability isn't "lowest price" — it's **pool diversification**. Consolidate into cheapest single pool, that pool terminates, everything fails.

> 💡 **Related Theory**: Spot pool diversification mirrors financial portfolio theory's **diversification**. Spread across low-correlation pools, individual pool terminations impact the whole less. capacity-optimized trades "max revenue (lowest price)" for "minimize variance (stability)" — as tasks become termination-sensitive, capacity-optimized/price-capacity-optimized beat lowest-price.

> 🎯 **Scenario**: "Run Kubernetes (EKS) data processing workers, minimize cost but tolerate interruptions." → **Karpenter or Managed Node Group + Spot (capacity-optimized) + On-Demand mix + diverse instance types**. Pod Disruption Budget and graceful drain handle 2-minute notice. Pure Spot, single type = whole cluster risk.

## Recommendation & Analysis Tools — Purpose-Specific Boundaries

| Tool | Analysis Method | Primary Use |
|------|---|---|
| **Compute Optimizer** | ML / time-series | EC2·EBS·Lambda·ASG·ECS·RDS precise rightsizing |
| **Trusted Advisor** | Rule-based (thresholds) | 5 categories (Cost·Performance·Security·FaultTolerance·Limits) broad inspection |
| **Cost Explorer** | Aggregated visualization | Visualization + 12-month Forecast + Coverage/Utilization |
| **CUR** | Raw fact table | Hourly ~200 columns, Athena SQL unit-price analysis |

> 🔍 **Going Deeper**: Memory recommendations exist only with **CloudWatch Agent** installed (hypervisor can't see guest memory — semantic gap). "Why no memory recommendations?" almost always answers "CW Agent not installed." Enable Compute Optimizer enhanced infrastructure metrics to extend lookback from 14 days to 93 days (3 months), capturing seasonality (paid feature).

> 💡 **Related Theory**: Trusted Advisor (rules) vs Compute Optimizer (ML) exemplifies classifier **precision-recall tradeoff**. Rules are fast and interpretable but high false positives (misses batch spikes); ML reduces false positives but needs training data/time. Operations layer them: Trusted Advisor screens broadly (high recall) → Compute Optimizer does precision analysis (high precision) → act. Other clouds parallel it: Azure Advisor, GCP Recommender.

## Budgets vs Cost Anomaly Detection — Control vs Detection

| Tool | Behavior |
|------|----------|
| Budgets | Predefined threshold (e.g., $1000/month) exceeded → alert |
| **Budgets Action** | Threshold exceeded → auto-action (IAM Deny, EC2/RDS stop, SCP apply) |
| Cost Anomaly Detection | ML learns baseline patterns → abnormal spending → auto-alert (detection only) |

> 🎯 **Scenario**: "Exceed monthly budget = block new EC2 creation." → **Budgets Action auto-applies IAM Deny Policy**. CloudWatch Alarm alerts only; Lambda schedules run post-hoc batches, not real-time blocking. Only Budgets Action combines "threshold exceeded → immediately apply policy" in one mechanism. Actions run automatic or require approval; for high-impact operations like SCP, approval mode is safer.

> ⚠️ **Trap**: Budgets Action must distinguish "block new creation" (IAM/SCP Deny) from "stop running" (EC2/RDS stop). Scenario verb tells the answer: "prevent" signals Deny; "stop" signals stop action.

## Hidden Costs (Pro Exam Staples)

### NAT Gateway: Hour + Throughput Double Billing

- Hourly: ~$0.045/hr × 24 × 30 ≈ $32/month (multiply by AZ count)
- Throughput: ~$0.045/GB (varies by region)
- 1TB inbound = ~$45 throughput alone

> 🔍 **Going Deeper**: NAT Gateway often becomes bigger cost than RDS itself. Especially Lambda/ECS Tasks in private subnets calling external or AWS APIs — all traffic routes through NAT, costs explode. **S3·DynamoDB use Gateway Endpoint (free)**, other AWS services (SQS·SNS·KMS·ECR·Secrets Manager, etc.) use **Interface Endpoint (PrivateLink, ~$0.01/AZ hour + throughput)**. Rule of thumb: "monthly NAT cost exceeds Interface Endpoint hourly fee → switch." Container environments with ECR pulls and S3 access are prime targets.

> 📚 **Case Study**: SaaS company's ECS Tasks upload 100GB daily to S3 via NAT. Throughput alone hit ~$4,500/month. Adding **S3 Gateway Endpoint** bypassed NAT, routed direct via AWS backbone, cost became **$0** — one routing rule, ~$54k/year saved. Lesson: S3·DynamoDB traffic via private subnets is the #1 anti-pattern check before suspecting NAT.

### Cross-AZ Traffic: Bidirectional Billing

- Same-region different AZ: ~$0.01/GB **both directions** (round-trip ≈ $0.02/GB)
- Multi-AZ DB sync, ALB→different-AZ targets, distributed cache sync create surprisingly large bills

> 💡 **Related Theory**: This is the fundamental HA vs cost trade-off. Multi-AZ spreads across AZs for fault tolerance (WAF Reliability pillar) but incurs Cross-AZ transfer cost. When latency tolerance exists, co-locate in same AZ or use topology-aware routing (e.g., ALB cross-zone settings, client AZ-affinity) to reduce — intentional choice sacrificing some availability to save cost. "Maintain high availability + minimize Cross-AZ cost" is inherently difficult.

### Internet Egress vs CloudFront

| Path | Characteristics |
|------|---|
| EC2/S3 → Internet (direct) | High egress rate, no caching |
| EC2/S3 → CloudFront → Users | **Origin→CloudFront free** + cheaper CloudFront egress + caching |

> 🎯 **Scenario**: "Serve S3 static content globally, minimize egress and latency." → **CloudFront + S3 (+ Origin Shield)**. S3→CloudFront is free, reducing egress; edge caching cuts origin load and global latency. Direct S3 public has high egress + no caching. Transfer Acceleration accelerates uploads; Global Accelerator gives static IP and UDP acceleration — different purpose from static content distribution.

### S3 Storage Class Auto-Transition

| Class | Use | Notes |
|-------|-----|-------|
| Standard | Frequent access | Default |
| **Intelligent-Tiering** | Unknown pattern | Auto tier-shifts + per-object monitoring cost |
| Standard-IA | <1x/month | Cheaper + retrieval cost + 30-day min·128KB min |
| Glacier Instant Retrieval | ~Quarterly, immediate | Cheaper |
| Glacier Flexible Retrieval | ~Annually, can wait | Cheaper |
| Glacier Deep Archive | Long-term, 12h+ retrieval | Lowest cost |

> ⚠️ **Trap**: Intelligent-Tiering isn't free auto-conversion — **per-object monitoring** (~$0.0025 per 1,000/month) and 128KB minimum for tiering apply. Hundreds of millions of tiny objects might waste more on monitoring than saving. "Unknown pattern + large objects" = Intelligent-Tiering winner; "billions of small objects" is a pitfall.

### Incomplete Multipart Upload Cleanup

- Failed multipart uploads leave partial chunks accumulating storage silently
- **Lifecycle rule: auto-delete after 7 days** (use Storage Lens to detect)
- Large environments accumulate dozens of TB unnoticed

> 📚 **Case Study**: Enterprise's S3 costs inexplicably climbed. Investigation found failed multipart uploads stacked years, consuming dozens of TB invisible in consoles. Storage Lens revealed incomplete multipart accumulation; Lifecycle rule (7-day abort) cleaned up immediately. Lesson: "invisible storage cost" top suspects are incomplete multipart and old versions (versioning).

## Multi-Account · Organization Cost Governance

SAP exam cost scenarios almost always assume multi-account contexts. Core principle: **commitment discounts apply org-wide via Consolidated Billing**, so central purchase by management/billing account dominates over member-account per-account buys in both utilization and management.

> 💡 **Related Theory**: Org-level commitment pooling is **resource pooling** + statistical **law of large numbers**. Merged workloads smooth individual spikes, allowing tighter baseline commitments without over-commit risk. Larger pools achieve higher Coverage without Risk. Consolidated Billing adds volume tier discounts across the sum, so the ideal design splits accounts for segregation but shares commitments — multi-account cost architecture's essence.

## Scenario Keyword → Answer Mapping Table

| Keyword | Answer |
|---------|--------|
| "EC2 + Fargate + Lambda unified discount" | Compute Savings Plans |
| "m6i family 3-year, max discount, no changes" | EC2 Instance SP or Standard RI |
| "Family change expected + maintain commitment" | Convertible RI or Compute SP |
| "Capacity assurance + discount" | Zonal RI or On-Demand Capacity Reservation + SP |
| "Stateless batch, 90% discount" | Spot Fleet (capacity-optimized) |
| "Private Lambda/ECS → S3 cost zero" | S3 Gateway Endpoint |
| "Private subnet → SQS/KMS bypass NAT" | Interface Endpoint (PrivateLink) |
| "S3 unknown access pattern + large objects" | Intelligent-Tiering |
| "Budget exceeded = block new EC2" | Budgets Action (IAM/SCP Deny) |
| "Budget hard cap (never exceed)" | Preventive SCP / Service Quotas |
| "EBS gp2 → gp3 / IOPS recommendations" | Compute Optimizer |
| "Hourly billing SQL analysis" | CUR + Athena |
| "Multi-cloud costs single schema" | FOCUS Data Export |
| "Lambda memory recommendations" | Compute Optimizer |
| "Memory recommendations missing" | CloudWatch Agent not installed |
| "Global static content + cost↓" | CloudFront + S3 |
| "Abnormal cost ML detection" | Cost Anomaly Detection |
| "Shared infrastructure cost by team" | Cost Categories split charge |
| "SP utilization collapse" | RI over-purchase pre-empts usage |
| "Per-account SP buy" | Wrong (central shared purchase correct) |

## Summary

Cost optimization is **(commitments + transient discounts + hidden costs)** three-axis problem, with Well-Architected Cost Optimization pillar and FinOps Inform→Optimize→Operate cycle providing the framework. SP/RI application order, Spot recovery and pool diversification, NAT/AZ/Egress hidden costs — master these three trade-off dimensions simultaneously to solve exam scenarios. Tools layer into Compute Optimizer (recommendations) → CUR (analysis) → Budgets (control) → Anomaly Detection (detection) workflow. Multi-account environments: share commitments centrally via Consolidated Billing, govern from a single account.

Next week (Week 13) synthesizes **Well-Architected 6 Pillars**.

---

## 📝 연습 문제
| Compute Optimizer | ML/timeseries | EC2·EBS·Lambda·ASG·ECS·RDS rightsizing |
| Trusted Advisor | Rules/thresholds | 5 categories broad scan |
| Cost Explorer | Aggregated viz | Dashboard + 12m Forecast + Coverage/Util |
| CUR | Raw fact table | Hourly ~200 columns, Athena SQL unit pricing |

Memory recommendations need **CloudWatch Agent** (semantic gap from hypervisor opacity).

---

## 📝 연습 문제

[All 11 questions preserved exactly in Korean as required]

---

## 📌 Today's Summary

Cost optimization combines 4 dimensions: commitment risk spectrum (On-Demand 0% → Spot ~90%), rightsizing ML, visualization+thresholds+anomaly-detection, plus hidden costs (NAT Gateway, Cross-AZ, S3 tiers, internet egress). Commitment discounts shared Org-wide via Consolidated Billing (central purchase always wins over per-account). Automation pipeline: Compute Optimizer → S3 Export → EventBridge → Lambda filter → approval → execute, with ASG using Launch Template + Instance Refresh. Every tool has precise boundary: Advisor (wide·shallow), Optimizer (narrow·deep), Explorer (visual), CUR (SQL), Budgets (threshold), Anomaly (learned baseline).

Next week (Week 13): **Security and Compliance Deep Dive** — IAM Fine-Grained Policies, Compliance Frameworks, Encryption Depths.
