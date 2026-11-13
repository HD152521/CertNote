# Day 5 - Cost Optimization Comprehensive Review: The Math of Commitments and Spot, and the Tradeoffs of Hidden Costs

Cost optimization is not simply "buy Reserved Instances." The Pro exam is a tradeoff problem where you find the optimal answer in a four-dimensional matrix of **workload pattern + commitment model + instant discount + hidden costs**. Even for the same EC2, the answer differs for 24-hour operation, nightly batch, and spiky traffic, and "invisible" costs like the NAT Gateway often account for more than 30% of the total bill. All of these decisions also rest on the five design principles of the Well-Architected Framework's **Cost Optimization pillar** (adopt a consumption model, measure efficiency, stop spending money on undifferentiated heavy lifting of data center operations, analyze and attribute expenditure, and use managed services to reduce the cost of ownership). Today we pull together all of Week 12's cost optimization and point out the traps of the Pro exam.

## Five Commitment Discount Models: The Risk Spectrum of Flexibility vs Discount Rate

The essence of a commitment discount is **risk transfer**. AWS has to buy physical servers for its data centers in advance (capital expenditure + inventory risk), and when a customer promises "I will definitely use $X per hour for 1 or 3 years," that capacity planning risk is reduced. The price of that is the discount. So **the more specific the commitment (= the more of AWS's uncertainty you remove), the bigger the discount.** This is exactly the same economics as a financial **forward contract**.

| Model | Discount | Flexibility | Commitment unit | Suitable workload |
|------|------|--------|------|----------------|
| Compute Savings Plans | ~66% | ★★★★★ (EC2, Fargate, Lambda combined) | $/hour | Diverse compute workloads |
| EC2 Instance Savings Plans | ~72% | ★★★ (family and Region fixed) | $/hour | Sustained use of a specific family |
| Standard RI | ~72% | ★★ (family and OS fixed) | Instance | 24-hour operation with no family change |
| Convertible RI | ~54% | ★★★★ (exchangeable across family and OS) | Instance | Family change expected |
| Zonal RI | ~72% | ★ (specific AZ) | Instance | Capacity guarantee needed |

Viewed as a risk spectrum: **On-Demand** (AWS bears all the risk, 0% discount) → **Convertible RI** → **Compute SP** → **EC2 Instance SP / Standard RI** (the customer bears the commitment risk heavily, ~72%) → **Spot** (the customer bears even the interruption risk, ~90%). The "flexibility vs discount" tradeoff in every exam scenario is a matter of where on this spectrum to place the workload.

> 🎯 **Scenario**: "A company runs the EC2 m5 family 24 hours a day and has no plans to change families over the next 3 years. It has cash to spare. What is the maximum discount?" — Answer: **EC2 Instance Savings Plans or Standard RI (3-year All Upfront)**. If the family and Region are fixed, there is no reason to buy flexibility, so the most specific commitment is the answer. EC2 Instance SP is free across size, OS, and AZ within the same family, so it is one step more flexible than Standard RI at the same ~72%.

The difference in commitment unit creates the SP's flexibility. RI commits to an "instance," but SP commits to "$/hour," which is the CS idea of an **abstraction layer**. SP puts an abstract layer called "normalized hourly cost" on top of physical resources so the commitment matches whether the instance underneath is m5 or m6i. It is the typical pattern where abstraction lowers coupling so the commitment does not break even when the workload is modernized.

The payment options (All/Partial/No Upfront) follow the same risk logic. With All Upfront, AWS receives cash in advance (eliminating credit risk + the time value of money) and gives the biggest discount. "Cash to spare + maximum discount" signals All Upfront, and "minimize upfront cash + commitment discount" signals No Upfront. The order of application is **Zonal RI → Regional RI → Savings Plans → On-Demand**, with the most specific commitment absorbing usage first. That is why over-buying RIs lets RIs claim usage first and lowers SP utilization, the classic cause of "low SP utilization."

## Spot Instances: Up to 90% Discount + Interruption Risk

- 10-30% of the normal price, with price fluctuating by market supply and demand
- Reclaimed after a **2-minute advance notice** (the EC2 instance rebalance recommendation comes earlier)
- Suitable for: stateless, fault-tolerant, batch, CI/CD, distributed training, rendering, container workers

### Spot Fleet / EC2 Fleet Allocation Strategies

| Strategy | Behavior | Interruption risk |
|------|------|----------|
| lowest-price | Cheapest pool first | High |
| diversified | Spread evenly across multiple pools | Low |
| **capacity-optimized** | Choose the pool with the lowest interruption risk (recommended) | Lowest |
| capacity-optimized-prioritized | The above + explicit priorities | Low |
| price-capacity-optimized | Balance of price and capacity (latest recommendation) | Low |

(Hypothetical case) A video rendering company groups more than 10 instance pools such as c5, c5n, c5a, m5, and m5n with capacity-optimized. When one pool's capacity runs short, it automatically substitutes another pool, keeping the interruption rate at 5% or below while cutting cost by about 80%. Lesson: the key to Spot stability is not "low price" but **pool diversification**; if you pile into the single cheapest pool, everything collapses when that pool is reclaimed.

Spot pool diversification is the same as **diversification** in financial portfolio theory. If you spread across multiple pools with low correlation, the effect of one pool's interruption (idiosyncratic risk) on the whole shrinks. capacity-optimized chose "minimizing variance (stability)" over "maximizing return (lowest price)," so the more sensitive a mission is to interruption, the more capacity-optimized/price-capacity-optimized rather than lowest-price is the answer.

> 🎯 **Scenario**: "Run Kubernetes (EKS) data processing workers at minimum cost while tolerating interruption." → **Karpenter or Managed Node Group + Spot (capacity-optimized) + On-Demand mix + diverse instance types**. Respond to the 2-minute notice with a Pod Disruption Budget and graceful drain. Pure Spot with a single type risks a total outage when reclaimed.

## Four Recommendation and Analysis Tools — Boundaries by Purpose

| Tool | Analysis method | Core use |
|------|----------|----------|
| **Compute Optimizer** | ML / time series | Precise rightsizing recommendations for EC2, EBS, Lambda, ASG, ECS, RDS |
| **Trusted Advisor** | Rules (thresholds) | Broad checks across 5 categories (Cost, Performance, Security, Fault Tolerance, Limits) |
| **Cost Explorer** | Aggregated visualization | Visualization + 12-month Forecast + Coverage/Utilization |
| **CUR** | Raw fact table | Hourly, ~200 columns, unit-price analysis with Athena SQL |

Because of the **semantic gap** of virtualization (the hypervisor cannot see guest memory), memory recommendations appear only if the **CloudWatch Agent** is installed. The answer to "why don't memory recommendations show up?" is almost always that the CW Agent is not installed. Turning on Compute Optimizer enhanced infrastructure metrics extends the lookback from 14 days up to 93 days to reflect seasonality (paid).

The division of labor between Trusted Advisor (rules) and Compute Optimizer (ML) is the classifier's **precision-recall** tradeoff. Rules are fast and interpretable but produce many false positives (mistaking a batch spike), while ML reduces false positives but needs training data and time. Operations use a layered structure of screening broadly with TA and then analyzing precisely with CO. Other clouds are isomorphic: Azure Advisor and GCP Recommender correspond respectively.

## Budgets vs Cost Anomaly Detection — Control vs Detection

| Tool | Behavior |
|------|------|
| Budgets | Notifies when a preset threshold (for example, $1000 per month) is exceeded |
| **Budgets Action** | Automatic action when the threshold is exceeded (IAM Deny, stopping EC2/RDS, applying an SCP) |
| Cost Anomaly Detection | Learns usual patterns with ML → automatic alert on anomaly (detection only) |

> 🎯 **Scenario**: "If the monthly budget is exceeded, refuse to launch any more new EC2 instances." → **Automatically apply an IAM Deny Policy with a Budgets Action**. A CloudWatch Alarm only notifies, a Lambda schedule is an after-the-fact batch, and Cost Anomaly only detects. However, because of the billing data update delay, if "must never exceed" is emphasized, suspect a preventive **SCP/Service Quotas** used in parallel.

> ⚠️ **Pitfall**: Budgets Action must be designed to distinguish "block new creation (IAM/SCP Deny)" from "stop currently running resources (EC2/RDS stop)." If the scenario verb is "prevent," it is Deny, and if it is "halt," it is stop.

## Hidden Costs

### NAT Gateway: Double Billing by Hour + Throughput

- Hourly charge about $0.045/h × 24h × 30d ≈ $32/month (multiplied by the number of AZs if one per AZ)
- Throughput about $0.045/GB (varies by Region)
- 1TB of internet traffic from inside the VPC ≈ $45 in throughput alone

The NAT Gateway often becomes a bigger cost item than RDS. In particular, when Lambda or ECS Tasks in private subnets call external or AWS APIs, all traffic goes through NAT and cost explodes. **S3 and DynamoDB use a Gateway Endpoint (free)**, and other AWS services (SQS, SNS, KMS, ECR, Secrets Manager, and so on) bypass NAT with an **Interface Endpoint (PrivateLink, about $0.01/hour per AZ + throughput)**. The tripwire rule of thumb: "if a month of NAT cost exceeds the Interface Endpoint hourly charge, switch to the Endpoint." Container environments with frequent ECR pulls and S3 access are the first candidates.

(Hypothetical case) A SaaS uploads 100GB to S3 every day from ECS Tasks. Via the NAT Gateway, the throughput cost alone is about $4,500 per month. After switching to an **S3 Gateway Endpoint**, that traffic costs $0. Simply bypassing through routing saves about $54,000 a year. Lesson: whether S3 and DynamoDB traffic from private subnets is riding NAT is the first anti-pattern to check.

### Cross-AZ Traffic: Billed in Both Directions

- Communication between different AZs in the same Region: about $0.01/GB is charged on **both sides** (round trip ≈ $0.02/GB)
- Cross-AZ DB replication, ALB → instances in another AZ, distributed cache synchronization, and the like are surprisingly large costs

This is the fundamental tradeoff between availability and cost. Multi-AZ spreads across AZs for fault tolerance (the WA Reliability pillar), but at the price of Cross-AZ traffic cost. If **read latency is acceptable**, you reduce it by placing read replicas in the same AZ or by topology-aware routing (for example, the ALB cross-zone setting, client AZ affinity), which is a deliberate choice to give up a little availability and save cost. The Pro-level awareness is that "maintaining high availability + minimizing Cross-AZ cost" is inherently difficult to reconcile.

### Internet Egress vs CloudFront

| Path | Characteristics |
|------|------|
| EC2/S3 → internet (direct) | High egress unit price, no caching |
| EC2/S3 → CloudFront → user | **Origin → CloudFront segment is free** + CloudFront egress is cheaper + caching |

> 🎯 **Scenario**: "Serve S3 static content to global users + minimize cost and latency." → **CloudFront + S3 (+ Origin Shield)**. Transfer from S3 to CloudFront is free so egress shrinks, and edge caching also reduces origin load and latency. Exposing S3 directly means higher egress cost and no caching. Transfer Acceleration is for upload acceleration and Global Accelerator is for static IPs and TCP/UDP acceleration, so their purposes differ from static content distribution.

### Automatic S3 Storage Class Transitions

| Class | Where used | Characteristics |
|-------|--------|------|
| Standard | Frequently accessed | Default |
| **Intelligent-Tiering** | Unknown pattern | Automatic tier transitions + per-object monitoring cost |
| Standard-IA | Less than once a month | Cheap + retrieval cost + minimum 30 days and 128KB |
| Glacier Instant Retrieval | Once a quarter, instant access | Cheaper |
| Glacier Flexible Retrieval | Once a year, minutes to hours retrieval | Even cheaper |
| Glacier Deep Archive | Long-term retention, 12h retrieval | Cheapest |

> ⚠️ **Pitfall**: Intelligent-Tiering is not simply "free automatic transition"; there is a separate **per-object monitoring cost** (a small amount per 1,000 objects). If objects are very small (under 128KB do not transition to IA) or very numerous, the monitoring cost can offset the savings. "Unknown access pattern + large objects" is Intelligent-Tiering's answer, but for "hundreds of millions of small objects," suspect the monitoring cost trap.

### Cleaning Up Incomplete Multipart Uploads

- If a multipart upload fails midway, the partial chunks keep being stored and billed invisibly
- **Recommended: auto-delete after 7 days with a Lifecycle rule** (detect the accumulated amount with S3 Storage Lens)
- In large environments it can accumulate to tens of TB

(Hypothetical case) A company investigated unexplained growth in S3 cost and found that failed multipart upload fragments accumulated over years were occupying tens of TB. They did not appear in the console or ordinary listings, so discovery was late. They confirmed the incomplete multipart accumulation with Storage Lens and cleaned it up immediately with a lifecycle rule (7-day abort). Lesson: the number one suspects for "invisible storage cost" are incomplete multipart uploads and old versions (versioning).

## Multi-Account and Organization Cost Governance

Cost scenarios on the SAP exam almost always presuppose multiple accounts. The core principle: **commitment discounts are shared across the entire Org through Consolidated Billing**, so buying centrally in bulk (the management account or a dedicated billing account) is superior in both utilization and management. "Buy SP in each member account" is a typical wrong answer.

Org-level commitment pooling is **resource pooling** in distributed systems plus the **law of large numbers** in statistics. If you merge multiple workloads into one pool, individual spikes cancel out and variability shrinks, so it is safe to commit more tightly to the usage floor (baseline). So the larger the pool, the higher you can raise Coverage without over-commit risk. Consolidated billing also applies volume tier discounts in aggregate, so the essence of multi-account cost design is to split accounts for cost separation while sharing the discounts.

## Scenario Keyword → Answer Mapping Table

| Keyword | Answer |
|--------|------|
| "Combined EC2 + Fargate + Lambda discount" | Compute Savings Plans |
| "m6i family 3-year maximum discount, no changes" | EC2 Instance SP (or Standard RI) |
| "Family change expected + keep the commitment" | Convertible RI (or the simpler Compute SP) |
| "Capacity guarantee + discount" | Zonal RI or ODCR + SP |
| "Stateless batch 90% discount" | Spot Fleet (capacity-optimized) |
| "Private Lambda/ECS → S3 cost 0" | S3 Gateway Endpoint |
| "Private subnet → SQS/KMS bypass NAT" | Interface Endpoint (PrivateLink) |
| "S3 access pattern unknown + large objects" | Intelligent-Tiering |
| "Block new EC2 when monthly budget exceeded" | Budgets Action (IAM/SCP Deny) |
| "Budget absolutely cannot be exceeded (hard cap)" | Preventive SCP/Service Quotas |
| "EBS gp2 → gp3 / IOPS recommendation" | Compute Optimizer |
| "Hourly billing SQL analysis" | CUR + Athena |
| "Multi-cloud costs in a single schema" | FOCUS Data Export |
| "Lambda memory recommendation" | Compute Optimizer |
| "Memory recommendation not appearing" | CW Agent not installed |
| "Global static content + lower cost" | CloudFront + S3 |
| "ML detection of abnormal cost" | Cost Anomaly Detection |
| "Allocate shared infrastructure cost by team" | Cost Categories split charge |
| "SP utilization drop" | RI over-commitment claims usage first |
| "Buy SP in each member account" | Wrong answer (buy centrally and share) |

## Wrapping Up

Cost optimization has three axes of **(commitments + instant discounts + hidden costs)**, with the Well-Architected Cost Optimization pillar and the FinOps Inform → Optimize → Operate cycle laid on top. The SP/RI application order, Spot interruption and pool diversification strategy, and the hidden costs of NAT/AZ/Egress: you must recall the tradeoffs among these three all at once to solve exam scenarios. The tools form a four-stage workflow of Compute Optimizer (recommendation), CUR (analysis), Budgets (control), and Anomaly Detection (detection), and in a multi-account setup, you share commitments through consolidated billing and govern in bulk from the center.

Next week (Week 13) is a comprehensive wrap-up of the **Well-Architected 6 pillars**.

---

## 📝 Practice Questions

**Question 1.** A company uses EC2, Fargate, and Lambda and frequently changes instance families depending on the workload. It wants to apply discounts as broadly as possible with a 1-year commitment. What is the most suitable?

A) Standard RI (m5 family 3-year All Upfront)

B) EC2 Instance Savings Plans (specific Region and family fixed)

C) Compute Savings Plans

D) Spot Fleet (capacity-optimized, diverse pools)

**Answer: C**
Explanation: Compute SP covers EC2, Fargate, and Lambda all together and automatically applies the discount to usage within the committed hourly amount regardless of Region, OS, family, or tenancy. It fits exactly the requirement to change families frequently and discount all three kinds of compute together. A is tied to a family and cannot cover Fargate and Lambda. B fixes a specific Region and family, which conflicts with "changes families frequently." D has interruption risk, which differs from "stable discounts based on a commitment." Trap: only Compute SP can include Fargate and Lambda.

---

**Question 2.** After the cost team bought a large amount of RIs and SPs at the same time, SP utilization falls short of 100%. What is the most likely cause and action?

A) SP can never be 100% utilized — leave it as is

B) RIs absorb usage first, leaving too little for SP to match — reduce RIs or standardize new commitments on SP

C) Compute SP cannot cover Fargate — replace with EC2 Instance SP

D) SP is not shared under consolidated billing — repurchase per account

**Answer: B**
Explanation: The billing engine deducts the most specific commitments first (Zonal RI → Regional RI) and applies the flexible SP later. If you over-buy RIs, RIs claim usage every hour first, leaving less remainder for the SP to match, and SP utilization falls. The action is to reduce RIs or standardize new commitments on SP. A is wrong (100% is possible with an appropriate commitment). C is wrong (Compute SP includes Fargate). D is wrong (SP is shared under consolidated billing). Trap: for low SP utilization, first suspect "RI over-commitment claiming usage first," not "insufficient usage."

---

**Question 3.** A distributed data processing job runs only at night, can be restarted if interrupted, and you want to cut cost as much as possible. You can use several instance types. What is the most suitable?

A) On-Demand with a single type, started only at night

B) A Standard RI 3-year commitment to minimize the hourly unit price

C) Spot Fleet, capacity-optimized strategy + diverse instance pools

D) A Compute Savings Plans 1-year commitment for a stable discount

**Answer: C**
Explanation: Interruption tolerance + maximum savings is the signal for Spot, and the key to stability is pool diversification. If you choose the pool with the lowest interruption risk with capacity-optimized and bundle multiple types, even if one pool is reclaimed it is replaced by another pool, so the interruption rate drops (the diversification principle). A is the list price. B is a waste, as a 24h commitment for a workload that runs only at night. D has a smaller discount than Spot and carries commitment burden. Trap: Spot stability comes from capacity-optimized + pool diversification, not "lowest-price."

---

**Question 4.** Lambda and ECS Tasks in a private subnet access S3 and DynamoDB, and the NAT Gateway throughput cost is very large. How do you bring the cost close to zero?

A) Place Interface Endpoints (PrivateLink) for S3 and DynamoDB in each AZ

B) S3 and DynamoDB Gateway Endpoints

C) Add NAT Gateways per AZ to spread the throughput

D) Route the private subnet directly to the Internet Gateway

**Answer: B**
Explanation: If you route S3 and DynamoDB through a **Gateway Endpoint**, NAT is bypassed and there is no additional hourly charge, so that traffic's cost becomes effectively 0. A (Interface Endpoint) is for other services such as SQS and KMS and carries an hourly charge. C actually increases cost. D breaks private subnet isolation and violates security. Trap: S3 and DynamoDB use a Gateway Endpoint (free), and other AWS services use an Interface Endpoint (paid).

---

**Question 5.** Data transfer cost is large at 25% of the total, but Cost Explorer cannot break down which traffic it is. How do you pin down the root cause?

A) Set a budget and alert on the data transfer line item with Budgets

B) Query the CUR with Athena and break it down by UsageType

C) Run Trusted Advisor to check the cost category

D) Narrow the Cost Explorer filter further by service and UsageType

**Answer: B**
Explanation: Cost Explorer lumps "data transfer" together and cannot distinguish Cross-AZ, internet egress, and Cross-Region. If you query the CUR's lineItem/UsageType column with Athena, you can break it down into DataTransfer-Regional-Bytes (Cross-AZ), DataTransfer-Out-Bytes (egress), NatGateway-Bytes, and so on to pin down the cause. A is control, C is rule checks, and D is limited by granularity so it cannot break down at the column level. Trap: root cause analysis of cost is possible only at the CUR level.

---

**Question 6.** You want to serve static web content stored in S3 to global users while minimizing egress cost and latency. What is the most suitable?

A) Make the S3 bucket public and egress directly through the Internet Gateway

B) CloudFront + S3 (+ Origin Shield)

C) Accelerate transfer through the edge with S3 Transfer Acceleration

D) Provide a static IP and Anycast path with Global Accelerator

**Answer: B**
Explanation: If you put CloudFront in front of S3, transfer from S3 to CloudFront is free so egress shrinks, and edge caching reduces origin load and global latency. Origin Shield is an additional caching layer that reduces origin hits further. A means higher egress cost and no caching. C (Transfer Acceleration) is for upload acceleration. D (Global Accelerator) is for static IPs and non-HTTP acceleration, whose purpose differs from caching-based static content distribution. Trap: "global static content + lower cost and latency" is CloudFront + S3.

---

**Question 7.** You want to automatically and immediately block new EC2 creation when a development account's monthly cost exceeds the threshold. You also need a guarantee that the threshold can absolutely never be exceeded (a hard cap), regardless of billing delay. What is the most suitable combination?

A) A CloudWatch Billing Alarm that only sends an SNS notification when the threshold is exceeded

B) Block after the fact with a Budgets Action (IAM/SCP Deny) + limit the resource ceiling itself in advance with a preventive SCP/Service Quotas

C) A Lambda daily schedule that checks cost and terminates instances if exceeded

D) Detect and alert on ML-based abnormal cost with Cost Anomaly Detection

**Answer: B**
Explanation: A Budgets Action automatically applies an IAM/SCP Deny when the threshold is exceeded to block new creation. However, because of the billing data update delay (eventual consistency), Budgets alone cannot guarantee a hard cap, so you complement it by setting an upper bound in advance with a preventive SCP (prohibiting specific instance types, Regions, or services) or Service Quotas. A only notifies, C is an after-the-fact batch and so not real time, and D only detects. Trap: "automatic blocking" is a Budgets Action, but if "must never exceed" is emphasized, use preventive controls in parallel.

---

**Question 8.** You want to replace instances operated by an Auto Scaling Group with smaller, newer-generation types following Compute Optimizer recommendations. What is the correct method?

A) Stop each instance → change the type with ModifyInstanceAttribute → start

B) Put the recommended type in a new Launch Template version and replace in a rolling fashion with Instance Refresh

C) Delete the ASG, create a new ASG with the recommended type, and switch traffic

D) Terminate the instances directly and the ASG automatically restarts them with the new type

**Answer: B**
Explanation: If you stop/modify instances directly in an ASG, they fail health checks and are terminated and recreated, coming back up with the old type from the old Launch Template. The correct method is to put the recommended type in a new Launch Template version and use Instance Refresh to roll out the replacement while honoring MinHealthyPercentage, nearly without downtime. A fails because the ASG interferes, C is excessively destructive, and D recreates with the old type. Trap: ASG rightsizing is Launch Template + Instance Refresh, not a direct modify.

---

**Question 9.** Compute Optimizer gives CPU and network recommendations for EC2 but no memory recommendation at all. What is the cause?

A) Compute Optimizer does not support memory recommendations at all

B) The CloudWatch Agent is not on the guest OS, so memory metrics are not collected

C) Insufficient IAM permissions blocked all of Compute Optimizer's recommendations

D) The 14-day lookback period has not yet passed, so recommendations are pending

**Answer: B**
Explanation: The hypervisor cannot see memory inside the guest OS (the virtualization semantic gap), so memory metrics are collected only if the CW Agent is installed. Without the Agent, the CPU, network, and disk recommendations that Nitro instruments automatically still appear, but only the memory recommendation is missing. A is wrong (CO provides memory recommendations). Under C, no recommendations would appear at all. Under D, there would be no CPU recommendations either. Trap: "only the memory recommendation is absent" is almost always the CW Agent not being installed.

---

**Question 10.** In an Organization with 50 member accounts, you want to minimize total compute cost while maximizing commitment utilization. What is the most suitable commitment purchasing strategy?

A) Each member account buys and manages its own SP according to its own usage

B) Purchase SP centrally in the management account (or a dedicated billing account) sized to the Org-wide baseline and enable sharing

C) Each member account buys its own Standard RI according to its own family

D) Use only On-Demand with no commitments and analyze after the fact with Cost Explorer

**Answer: B**
Explanation: Under consolidated billing, SP and RI discounts apply across the entire Org when sharing is on. If you merge multiple workloads into one pool, variability cancels out (the law of large numbers) so it is safe to commit tightly to the usage floor, and when one account is idle, a busy account absorbs the leftover commitment, raising utilization. A and C create unused commitments through per-account over-commitment. D gives up the discount. Trap: "buy individually in each member account" is a typical wrong answer on the Pro exam, and central consolidated purchasing and sharing is the answer.

---

**Question 11.** A media company holding a large amount of m4 Standard RIs tried to modernize its workloads to m6i and fell into a situation where the old RIs sit idle and the new instances are billed On-Demand. To prevent the same problem going forward, what should the new commitment be?

A) Buy additional m4/m5 Standard RIs to match the existing commitments

B) Compute Savings Plans (or Convertible RI)

C) Reserve capacity in a specific AZ with Zonal RI

D) Cancel all commitments and switch to On-Demand

**Answer: B**
Explanation: If a family change (m4 to m6i) is expected, you need a commitment not coupled to the family. Compute SP matches automatically regardless of family, Region, and OS, so the commitment remains valid after modernization (Convertible RI can also do it through exchange, but the procedure is cumbersome, so Compute SP is operationally superior). A repeats the same trap. C is for AZ-fixed capacity and has nothing to do with family flexibility. D gives up the discount. Trap: putting a family-coupled commitment (Standard RI) on a workload where modernization or technology change is expected is an anti-pattern.

---

**Question 12.** S3 cost keeps rising with no explanation. The console's object listing does not reveal the cause. What hidden cost should you suspect most, and what is the action?

A) Accumulated Glacier retrieval and restore charges — move the objects to S3 Standard

B) Accumulated failed Incomplete Multipart Upload fragments — confirm with Storage Lens and clean up with a Lifecycle rule (for example, 7-day abort)

C) CloudFront edge cache storage cost — disable the cache

D) A Cost Explorer aggregation bug — request a correction through a support ticket

**Answer: B**
Explanation: If a multipart upload fails midway, the partial chunks keep being stored and billed without showing in the ordinary listing. In large environments it can accumulate to tens of TB. The standard action is to check the incomplete multipart accumulation with S3 Storage Lens and automatically abort and delete after a set period with a Lifecycle rule (also check old versions together). A, C, and D are not the cause. Trap: the number one suspects for "invisible S3 storage cost" are incomplete multipart uploads and uncleaned versions.
