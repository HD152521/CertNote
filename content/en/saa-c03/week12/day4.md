# Day 4 - Why the Cost Domain Converges on "a Decision at the Design Stage, Not in Operations"

On the SAA exam, cost optimization (Domain 4) accounts for 20% of the total. By weight alone it's smaller than security (30%), but this domain is tricky for a separate reason. Where other domains ask "what works," the cost domain asks "of the several ways that work, which is cheapest." That is, you must filter out the option that is not functionally wrong but simply **costs more**. So keyword mapping alone isn't enough; you must understand **on which cost axis (compute, storage, network, operations), and at what trade-off**, each savings lever cuts money.

This article re-weaves the cost domain not as a flat memorization table but as a flow: "the four faucets from which a single workload generates its bill." We follow the savings chain through compute (the largest item), storage (accumulating over time), network (leaking invisibly), and operations & governance (the layer that discovers and prevents waste). Most of the exam's traps come from making you miss the hidden costs on these four axes: "the bindingness of commitments," "the minimum storage duration," and "the direction of data transfer."

> 💡 **Related theory**: Beneath the mindset of cost optimization lies an operational culture called **FinOps** (Financial Operations). Established in 2019 by the FinOps Foundation (now under the Linux Foundation), this framework views cloud cost as a cycle of three phases — Inform (visibility), Optimize (optimization), Operate (operational anchoring) — with engineering, finance, and management jointly responsible. The key insight is that the cloud turned **capital expenditure (CapEx) into operational expenditure (OpEx)**. What was once a one-time server purchase became a variable cost billed for every hour it's on. So the pay-as-you-go benefit of "pay for what you use" is the flip side of the risk "if you leave it on unused, it leaks the same." The Cost Optimization pillar among the five pillars of the AWS Well-Architected Framework emphasizes the order "remove unnecessary resources → right-size → use commitments → analyze spend" in the same spirit.

## Compute Cost Splits Along Two Axes: "the Bindingness of Commitments and the Workload's Interruption Tolerance"

The largest share of the bill is almost always compute (EC2/Lambda/containers). So precisely distinguishing the compute-savings options is half of Domain 4. Two questions are central — **(1) Will this workload run steadily for 1/3 years (can you commit?)**, and **(2) Is it OK if it shuts off suddenly (interruption-tolerant?)**. The combination of these two axes determines the answer.

For a steadily running workload, use **commitment discounts**. **Savings Plans** commit to "spending a fixed amount per hour ($/h) for 1 or 3 years," cutting up to 72%. Among them, a **Compute Savings Plan** applies flexibly regardless of instance family, region, OS, or tenancy (even to Fargate and Lambda) with a lower discount rate, while an **EC2 Instance Savings Plan** is tied to a specific family/region but has the highest discount rate. **Reserved Instances (RI)** are an older commitment model, and they remain central as the commitment-discount mechanism for **services that Savings Plans don't apply to, like RDS, Redshift, ElastiCache, and OpenSearch** — this is an exam regular.

For interruption-tolerant workloads (stateless batch, fault-tolerant processing), **Spot Instances** are overwhelming. You rent spare EC2 capacity up to 90% cheaper, but AWS can reclaim it after a 2-minute warning. On the axis of making the instance itself cheaper and faster, **Graviton** (AWS's own ARM processor) is about 20% cheaper than comparable x86 with high power efficiency, and **right-sizing** is done by **Compute Optimizer**, which ML-analyzes actual utilization to find over-provisioned instances.

> 🔍 **Going deeper**: Behind the simple explanation of a Spot Instance as "spare capacity, cheap" lies a history of **a shift from a second-price auction to a fixed-price model**. At its 2009 launch, Spot was a real auction — users submitted a bid, and if the market Spot price exceeded the bid the instance was reclaimed, a variable-price structure. Prices swung minute to minute, hard to predict. In 2017 AWS scrapped this model and switched to a **predictable fixed price** that changes only gently with supply and demand. Today's Spot isn't "bidding" but "accept the current Spot price, and if capacity runs short, reclaim after a 2-minute warning." Thanks to this change Spot became easier to handle, and the pattern of "auto-replace with another Spot/On-Demand on reclamation" via EC2 Auto Scaling's mixed-instances policy or EKS/ECS Spot integration became standard. On the exam, Spot should always be paired only with workloads that **can lose state and tolerate interruption**.

> 📚 **Case study**: Pinterest is often cited as a representative case that, when EC2 costs surged in the mid-2010s, moved a large portion of its workloads to Spot and greatly cut compute cost. The point is that it didn't merely turn Spot on but **redesigned jobs to be checkpointable (resumable after interruption)** and spread them across multiple instance types so that reclamation of one type's Spot didn't halt the whole. Here comes the exam lesson — Spot's 90% discount is not free but a discount you get **only when the architecture is designed to tolerate interruption**. That's why the SAA pairs Spot with signal words like "fault-tolerant," "stateless," and "checkpoint," and always makes "Spot for a stateful workload like a DB" a wrong answer.

> ⚠️ **Pitfall**: Lumping Savings Plans and RIs together as "just discounts" gets it wrong on two counts. First, **a Compute SP is a non-refundable/non-cancellable commitment** ("you already committed, so you can't undo it"). Second, **RDS, Redshift, and ElastiCache aren't covered by Savings Plans, so it must be RI** — on a "run RDS 24/7 as cheaply as possible" question, picking "Compute SP" falls into the trap. The answer is an RDS Reserved Instance. One more: Compute Optimizer must be turned on (opt-in) for recommendations to appear, so the answer to "how do I get right-sizing recommendations?" is "enable Compute Optimizer."

## Storage Cost Is Layered Along the Time Axis of "Access Frequency and Minimum Storage Duration"

Storage is a cost that, once put in, doesn't shrink but accumulates, eating into the bill over time. S3 storage classes are essentially a spectrum that prices **"how often you view this data" and "whether it's OK to lose it."** View it often → Standard, sometimes → IA (Infrequent Access), almost never → the Glacier family; the further down, the cheaper the storage unit cost, but **retrieval cost and latency** attach.

Organizing the key classes by signal word: if you **don't know the access pattern**, it's **S3 Intelligent-Tiering** — it monitors access and automatically moves tiers, the exam's overwhelming regular answer. **Immediate access but not frequent** is **Standard-IA**, and if that data is **regeneratable (OK to lose)**, the cheaper single-AZ **One Zone-IA**. Going to archive, if you need **millisecond access even once a quarter** it's **Glacier Instant Retrieval**, and for **rarely retrieved, cheapest** like 7+ years of regulatory retention it's **Glacier Deep Archive** (retrieval takes time). For EBS, **gp3 is now the default**, giving better baseline performance at the same price as gp2 and letting you tune IOPS and throughput independently.

> 💡 **Related theory**: The root of storage tiering is exactly the same as the **memory hierarchy** principle of computer architecture. From CPU registers → L1/L2 cache → RAM → SSD → HDD → tape, the further down, the cheaper per capacity but the higher the access latency. S3's Standard → IA → Glacier → Deep Archive transplants this hierarchy principle straight onto cloud object storage. And the automated version is **Hierarchical Storage Management (HSM)** — since the mainframe era, a technique to "automatically demote long-unused data to cheaper media, and promote it back when used again." S3 Intelligent-Tiering and Lifecycle policies are exactly HSM's cloud implementation. The idea of changing storage location by data "temperature" (hot/warm/cold) is a 50-year-old universal design.

> ⚠️ **Pitfall**: Storage classes have a hidden trap called **minimum storage duration**. Standard-IA and One Zone-IA are **30 days**, Glacier Instant/Flexible are **90 days**, Deep Archive is **180 days**; delete or move to another class before that and you pay for the remaining period. So the option "send temporary data with a 7-day lifetime to IA to save" actually becomes more expensive — because you get billed for 30 days. One more: Glacier has separate **retrieval cost and time**. For "rarely viewed but occasionally must retrieve fast," don't pick Deep Archive by unit cost alone; Glacier Instant Retrieval is correct. "Cheapest storage unit cost" and "cheapest total cost" are different.

## Network Cost Leaks on the Invisible Axis of "Data Transfer Direction and Path"

Network cost is the hardest-to-trace item that leaks on the bill. The core rule is simple — **inbound (data entering AWS) is generally free, outbound (data leaving to the internet) is paid**, and **cross-region and cross-AZ transfers also cost money**. Without this directionality you get the mystery "why is Data Transfer so big on the bill?"

The savings pattern comes from changing the path. When a private-subnet EC2 **accesses S3 or DynamoDB** through a NAT Gateway, it incurs NAT processing cost + outbound cost, but a **Gateway Endpoint for S3/DynamoDB is free**, so it bypasses NAT and eliminates the cost (this is an exam regular). An **Interface Endpoint (PrivateLink)** for other AWS services has hourly and per-GB charges, so it isn't always a saving. If you frequently push content out to the internet, **CloudFront** replaces origin outbound with cache hits to reduce data-transfer cost (received once at the edge, served many times), and components that frequently exchange the same information should be **placed in the same AZ** to avoid cross-AZ charges.

> 🔍 **Going deeper**: The answer to "why does data transfer cost money even within the same region when AZs differ?" lies in AWS's physical infrastructure. One Availability Zone (AZ) is in fact a set of one or more independent data centers, and different AZs are **physically separated distinct facilities** connected by dedicated fiber. This inter-facility link is not infinite free bandwidth but a real resource AWS lays and maintains, so cross-AZ traffic is charged a small per-GB amount (around $0.01 each way). The same idea applies to NAT Gateway — NAT has a dual-charging structure of hourly cost + per-GB processed data, so the more traffic, the larger the processing charge. That's why "don't send bulk traffic bound for S3 through NAT; use a Gateway Endpoint" is decisive on cost. Knowing this physical background makes the principle "where you keep data and which path you send it on is cost itself" intuitive.

> 📚 **Case study**: The item startups are most surprised by on their first AWS bill is the **NAT Gateway data processing charge**. When an ECS/EKS cluster exchanges bulk logs/artifacts with S3 from a private subnet and all that traffic passes through NAT, the per-GB processing charge accumulates and thousands of dollars a month can quietly leak. In many cost-consulting cases, the single action that produced the largest saving was "add an S3/DynamoDB Gateway Endpoint to bypass NAT" — because the Gateway Endpoint itself is free, the NAT processing cost disappears immediately. This is why the exam repeatedly asks "private EC2 accesses S3 in bulk, reduce NAT cost."

## Operations & Governance Is the Visibility Layer That "Discovers and Preemptively Blocks Waste"

If the previous three axes are "how to use cheaply," the fourth axis is the control layer that "sees where it leaks and blocks it before it does." Cost doesn't end with a one-time design but keeps changing, so without visibility and auto-blocking even a savings design collapses.

The tools have cleanly divided roles. **Cost Explorer** visualizes past costs, forecasts the future, and catches sudden spikes with **anomaly detection (Cost Anomaly Detection)**. **AWS Budgets** sets budget limits and alerts on reaching a threshold, and **Budgets Actions** goes as far as **auto-blocking** — applying IAM policies or stopping instances on exceeding the limit (so the answer to "auto-stop on reaching 100% of budget" is Budgets Actions). When you need granular line-item analysis, the standard is **exporting the CUR (Cost and Usage Report) to S3 and querying with Athena**; separating cost by department/project is **Cost Allocation Tags**; and consolidating multiple accounts' billing to share volume discounts is **Consolidated Billing** (AWS Organizations).

> 💡 **Related theory**: The way Budgets Actions and Cost Anomaly Detection work is the same as control engineering's **feedback control loop**. Set a target (budget limit) → measure the actual value (current spend) → detect the error between them → execute a corrective action (alert/block) — a closed loop. Cost Anomaly Detection layers ML-based **anomaly detection** on top, statistically catching abnormal spikes that deviate from past patterns rather than a simple threshold. This is the same control philosophy as the availability domain's Auto Scaling (correcting against a target utilization) — set a measurable metric, and auto-revert when it deviates. To "manage" cost is ultimately to hang this feedback loop on the bill.

> ⚠️ **Pitfall**: Confusing the visibility tools gets it wrong on the exam. **Cost Explorer is analysis, forecasting, and anomaly detection**, not auto-blocking — to auto-stop it's **Budgets Actions**. When asked about **granular (tag/time-unit) analysis**, picking "Cost Explorer" falls short; the answer is **CUR + Athena** (the rawest and most granular). And in multi-account, "see cost in one place and share volume discounts" is **Consolidated Billing**, while the more sophisticated need to "reallocate/showback cost across accounts" within it is **Billing Conductor**. Memorize in one line — "visibility = Cost Explorer / blocking = Budgets Actions / granularity = CUR + Athena" — and most traps resolve.

## Comparing Other Clouds' Cost Management Models

Relativizing AWS's cost tools sharpens the keyword mapping. All three clouds have the same skeleton — "commitment discounts + variable-capacity discounts + visibility + budget control" — but differ in naming and the flexibility of the commitment model.

| Category | AWS | Azure | GCP |
|------|-----|-------|-----|
| Commitment discount | Savings Plans / RI | Reserved Instances / Savings Plans | Committed Use Discounts (CUD) |
| Auto discount (no commitment) | (none) | (none) | Sustained Use Discount (automatic) |
| Spot/low-cost capacity | Spot Instances | Spot VMs | Spot VMs (formerly Preemptible) |
| Cost visibility | Cost Explorer | Cost Management + Billing | Cloud Billing Reports |
| Budget & alerts | Budgets / Budgets Actions | Budgets + Action Groups | Budgets & Alerts |
| Granular analysis | CUR → Athena | Cost Management Exports | BigQuery Billing Export |

The most striking difference is **GCP's Sustained Use Discount** — if it's on above a certain fraction over a month, a discount attaches automatically with no commitment. AWS has no such auto-discount, so you must explicitly commit to Savings Plans or RIs. Because of this difference, the AWS exam repeatedly asks "steady workload = choose an explicit commitment (SP/RI)." Also structurally alike: for granular analysis AWS drops the CUR to S3 to run SQL with Athena, while GCP exports billing data directly to BigQuery.

> 🔍 **Going deeper**: Behind every cost decision, the **Shared Responsibility Model** also operates from a cost perspective. The more managed the service, the more operational cost is baked into the price, shrinking "room for me to cut directly" but eliminating operational labor, patching, and availability-management costs. For example, EC2 (IaaS) leaves large room to control cost directly via instance type, commitment, and Spot but requires you to own OS and scaling; Lambda/Fargate (serverless), by contrast, auto-bill "only for requests/execution time" so idle cost converges to 0, though the unit price can be relatively high. So the judgment splits — "traffic is spiky with much idle = serverless wins on total cost," "steadily running full = a committed EC2 wins." Cost optimization is ultimately choosing "which responsibility boundary fits this workload's usage pattern."

## Checking It Yourself with the CLI

```bash
# Query last month's cost by service with Cost Explorer
aws ce get-cost-and-usage \
  --time-period Start=2026-05-01,End=2026-06-01 \
  --granularity MONTHLY --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE

# Create a budget ($1000 monthly limit)
aws budgets create-budget --account-id 111122223333 \
  --budget file://monthly-budget.json

# S3 Lifecycle rule: Standard-IA after 30 days, Glacier after 90 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket my-bucket --lifecycle-configuration file://lifecycle.json

# Create an S3 Gateway Endpoint (NAT bypass, free)
aws ec2 create-vpc-endpoint --vpc-id vpc-0abc \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-0def

# Enable Compute Optimizer (receive right-sizing recommendations)
aws compute-optimizer update-enrollment-status --status Active
```

## Wrapping Up

The cost domain looks like the simplest keyword mapping, but it's really a structure of four faucets placed on the principle **"cost is decided at the design stage, not in operations."** ① **Compute** splits along two axes — commit-ability (SP/RI) and interruption tolerance (Spot) — and you must remember the exception that RDS/Redshift/ElastiCache are RI, not SP. ② **Storage** is layered by access frequency and minimum storage duration (IA 30 days, Glacier 90 days, Deep Archive 180 days), and "storage unit cost" differs from "total cost." ③ **Network** leaks and is blocked at transfer direction (inbound free, outbound/cross-AZ paid) and path (free Gateway Endpoint bypass). ④ **Operations** controls waste with the feedback loop of visibility (Cost Explorer), blocking (Budgets Actions), and granularity (CUR + Athena). Pinterest's Spot redesign and the recurring NAT cost leak prove that "a saving is a discount you get only when the architecture is designed to tolerate its trade-off."

In the next article, we wrap up the final pre-exam checkpoint with a mock exam that crosses all four domains.

---

## 📝 연습 문제

**문제 1.** A company runs an RDS MySQL instance 24/7 year-round and wants the largest cost saving. Which commitment should it choose?

A) Compute Savings Plan

B) RDS Reserved Instance

C) EC2 Instance Savings Plan

D) Spot Instance

**정답: B**

해설: **Savings Plans do not apply to RDS, Redshift, ElastiCache, or OpenSearch.** The commitment discount for these managed data services can still only be obtained via the **Reserved Instance (RI)** model. The Savings Plans in A and C fit EC2/Fargate/Lambda compute but can't apply to RDS, a trap. Spot (D) is unsuited to a stateful DB (data-loss risk on reclamation). "RDS/Redshift/ElastiCache running steadily = RI" is the key signal.

---

**문제 2.** A team runs a nightly batch data-processing job. The job is stateless and restartable after interruption, and they want to cut cost as much as possible. What is the appropriate compute option?

A) On-Demand EC2

B) Reserved Instance

C) Spot Instance

D) Compute Savings Plan

**정답: C**

해설: **Spot Instances** provide spare EC2 capacity up to 90% cheaper but AWS can reclaim it after a 2-minute warning. So they're ideal for **stateless, fault-tolerant, interruption-resumable** workloads (nightly batch, big-data processing). A is the most expensive, and B/D are commitment discounts for steadily-running workloads, over-committed for "interruption-OK batch." As in the Pinterest case, Spot safely enjoys its 90% discount "when redesigned to be checkpointable." Signal words: "stateless / interruption OK / batch" = Spot.

---

**문제 3.** Private-subnet EC2 instances read and write bulk data to S3. Currently all traffic passes through a NAT Gateway, incurring large data-processing cost. What is the most effective saving?

A) Replace the NAT Gateway with a NAT Instance

B) Create an S3 Gateway Endpoint to bypass NAT

C) Add an Interface Endpoint (PrivateLink)

D) Place CloudFront in front

**정답: B**

해설: A **Gateway Endpoint for S3/DynamoDB is itself free** and lets private-subnet traffic go directly to S3 without passing through NAT, immediately eliminating the NAT data-processing charge. Replacing with a NAT Instance (A) only adds operational burden and isn't a root fix; an Interface Endpoint (C) has hourly and per-GB charges so it isn't always a saving (for S3 the Gateway Endpoint is the answer); and CloudFront (D) is for internet-distribution caching, unrelated to internal S3 access-path cost. "Private EC2 → S3 bulk, NAT cost ↓ = Gateway Endpoint" is a regular answer.

---

**문제 4.** A company stores temporary log data with a 7-day lifetime in S3. A proposal suggests storing it in Standard-IA immediately to save cost. What is the problem with this proposal?

A) IA doesn't allow immediate access, so logs can't be read

B) Standard-IA has a 30-day minimum storage duration, so 7-day data actually costs more

C) IA has low durability, so logs may be lost

D) No problem, it's the best choice

**정답: B**

해설: **Standard-IA and One Zone-IA have a 30-day minimum storage duration.** Delete before 30 days and you pay for the remaining period, so **putting 7-day-lifetime data in IA gets billed for 30 days** and actually costs more. A is wrong (IA also allows immediate millisecond access), and C is wrong (Standard-IA has the same 11 9s durability as Standard). Short-lived data should sit in Standard and expire via Lifecycle. The "minimum storage duration (IA 30 days, Glacier 90 days, Deep Archive 180 days)" trap is a cost-domain regular.

---

**문제 5.** When the operations team reaches its monthly budget limit, it wants to go beyond alerts and automatically stop non-production EC2 instances. What is the appropriate tool?

A) Cost Explorer

B) AWS Budgets + Budgets Actions

C) CUR + Athena

D) Cost Allocation Tags

**정답: B**

해설: Simple visibility/forecasting is Cost Explorer, but to also perform an **automatic action on reaching a budget threshold (stop instances, apply IAM policy)** you need **AWS Budgets' Budgets Actions**. Cost Explorer (A) only analyzes and detects anomalies and can't auto-block. CUR + Athena (C) is for granular post-hoc analysis, and Cost Allocation Tags (D) is for cost attribution (department separation). "Budget reached → auto-block/stop = Budgets Actions" is the key signal.

---

**문제 6.** A company wants to analyze, granularly by tag and time unit with SQL, a bill composed of hundreds of line items. What is the most appropriate method?

A) Look at Cost Explorer's graphs

B) Export the Cost and Usage Report (CUR) to S3 and query with Athena

C) Get a report from Budgets

D) Build a CloudWatch dashboard

**정답: B**

해설: The rawest, most granular cost data is the **CUR (Cost and Usage Report)**, and exporting it to S3 and querying with **Athena via SQL** enables arbitrary analysis by tag, time, and resource. Cost Explorer (A) is good for visualization/forecasting but falls short of arbitrary-SQL-level granularity. Budgets (C) is for budget control, and CloudWatch (D) is for operational metrics, unsuited to billing line-item analysis. "Granular / tag-unit analysis = CUR + Athena" is a regular answer.

---

**문제 7.** A startup runs an API with very irregular traffic and much idle time. It wants to make idle cost near zero and also reduce operational burden. What is the most appropriate compute choice?

A) EC2 committed with a Reserved Instance

B) Lambda (serverless)

C) On-Demand EC2 left on 24/7

D) A Spot Instance pool

**정답: B**

해설: A **workload with irregular traffic and much idle** favors **serverless (Lambda)**, billed only for request/execution time, converging idle cost to 0 for a total-cost win. A is a commitment fit for steadily-running full workloads, wasteful with much idle; C keeps billing during idle so it's the most expensive; and Spot (D), though cheap, has heavy operational burden (handling reclamation) and is unsuited to irregular API responses. The key is the Shared-Responsibility judgment "spiky + much idle = serverless wins on total cost."

---

## 📌 Key Takeaways

The cost domain (20%) is a structure of four faucets placed on the principle "cost is decided in design, not operations." ① Compute splits by commit-ability (Savings Plans/RI) and interruption tolerance (Spot), with the RDS/Redshift/ElastiCache = RI, not SP, exception a regular (the lesson of Pinterest's Spot redesign). ② Storage is layered by access frequency and minimum storage duration (IA 30 days, Glacier 90 days, Deep Archive 180 days), and "storage unit cost" differs from "total cost." ③ Network leaks and is blocked at transfer direction (inbound free, outbound/cross-AZ paid) and path (free S3/DDB Gateway Endpoint bypass), with the NAT data-processing charge leak a representative case. ④ Operations controls with the feedback loop of visibility (Cost Explorer), auto-blocking (Budgets Actions), and granularity (CUR + Athena). Behind every choice lies the cost perspective of the Shared Responsibility Model: "the more managed/serverless, the lower the idle cost but the less room to cut directly."
