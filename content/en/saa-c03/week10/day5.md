# Day 5 - Week 10 Synthesis: Binding Cost Optimization Into a Single Way of Thinking

Over the week we split cost into four axes — compute (Day 1), storage (Day 2), network (Day 3), governance (Day 4). Heading into the exam, the trap people commonly fall into when recalling this is "memorizing each service's discount options separately." Do that, and one twist of a single keyword in a question topples everything. To properly handle the cost domain (about 20% of the whole SAA) you have to grasp not the individual options but **the single way of thinking underneath them**. The core of that framework is this — **cost optimization is the work of mapping a workload's properties (stability, access frequency, distance, responsible party) onto a pricing model.** Commitment-viable → SP/RI, fault-tolerant → Spot, unknown access frequency → Intelligent-Tiering, far away → CloudFront, needs accountability separation → tags. All are variations on the same thought.

This article assembles a "cost-optimized full stack" that crosses the four axes, then compresses the keyword-to-answer mappings that recur on the exam, and checks your practical instincts with 12 scenario questions. Each question digs beyond rote memorization into "why the other options are wrong," so you won't waver when you meet a similar-but-different option in the exam room.

## Assembling the Four Axes Into One Architecture

The real shape of cost optimization is not a single choice but a layered combination. Optimize a typical web service serving global users all the way down, from a cost perspective, and it looks like this.

```
[ Cost-optimized full stack ]

  Users worldwide
       │
  CloudFront (edge cache + free origin→edge transfer + low egress rate)
       │ tune regions with price class, raise hit rate with Origin Shield
       ▼
  ALB (cross-zone on by default; same-AZ-first topology to curb inter-AZ cost)
       │
  ECS Fargate / EC2 (40% price-performance with Graviton ARM)
       │  ├─ 24/7 baseline    → Compute SP 3yr (~66% discount)
       │  ├─ predictable var.  → Compute SP 1yr
       │  ├─ fault-tolerant batch → Spot (capacity-optimized + diversification)
       │  └─ short spikes      → On-Demand
       │  + right-size each tier with Compute Optimizer
       ▼
  Data tier
   ├─ RDS/Aurora → Reserved Instance (SP does not apply!)
   ├─ DynamoDB   → On-Demand or Provisioned + Gateway Endpoint (free)
   └─ S3 → Intelligent-Tiering (pattern unknown) / Lifecycle (pattern clear)
            + Bucket Keys (KMS 99%↓) + Gateway Endpoint (free) + multipart cleanup

  [ Inside the VPC ]
   ├─ S3/DDB Gateway Endpoint (free, bypasses NAT)
   └─ SSM/ECR Interface Endpoint (only at high volume; private operation)

  [ Governance — Organizations management account ]
   ├─ Consolidated Billing (volume-discount aggregation + SP/RI sharing)
   ├─ Cost Explorer (visualization/forecast/anomaly) / CUR → S3 → Athena (fine analysis)
   ├─ Budgets + Actions (auto-block on limit exceeded)
   ├─ Cost Anomaly Detection (ML spike detection)
   ├─ Cost Allocation Tags (department/project separation)
   └─ SCP guardrails (block expensive instances/regions)

  [ Recommendation-tool collaboration ]
   Trusted Advisor (rough cleanup) → Compute Optimizer (precise tuning) → Storage Lens (S3 domain)
```

The message to read from this picture is that "cost isn't reduced in one place but reduced simultaneously across every layer." CloudFront for transfer, SP for compute, Intelligent-Tiering for storage, tags and Budgets for accountability and control — the four axes interlock within one architecture.

> 💡 **Related theory**: This layered combination resembles **portfolio theory**. Just as investing mixes assets with different risk-return characteristics to optimize the whole portfolio, cost optimization mixes pricing models with different stability-discount-flexibility characteristics (SP, Spot, On-Demand) to minimize total spend while controlling availability risk. A single choice like "all Spot" or "all On-Demand" is, in portfolio terms, betting everything on one stock — inefficient. Decomposing the workload and dressing each piece in the matching model is the key diversification.

## Compressed Keyword-to-Answer Mapping Table

The exam ultimately tests your ability to quickly convert keywords in a scenario into the correct service. Here's the week's essence compressed into keyword triggers.

| Scenario keyword | Top answer | Confusing wrong answers and why |
|----------------|-----------|---------------------|
| 24/7 + free family/region change | **Compute SP** | EC2 SP pins family; RI pins type |
| 24/7 + fixed family + deeper discount | **EC2 Instance SP** | Deeper discount than Compute SP but less flexible |
| RDS/Redshift/ElastiCache commitment | **Reserved Instance** | SP doesn't apply to these |
| Fault-tolerant batch + 90% savings | **Spot** | RI wastes commitment; On-Demand is expensive |
| Reduce Spot interruptions | **capacity-optimized + diversification** | lowest-price gets reclaimed more often |
| Minimal code change + lower unit price | **Graviton** | Signal of interpreter/container workloads |
| ML-based right-sizing | **Compute Optimizer** | TA is rule-based waste identification |
| Identify idle EIP / unattached EBS | **Trusted Advisor** | Not Compute Optimizer |
| S3 access pattern unknown | **Intelligent-Tiering** | IA risks minimum-storage/retrieval fees |
| Recreatable + single AZ OK | **One Zone-IA** | Unsuitable if durability is required |
| Cheapest 7-year regulatory retention | **Glacier Deep Archive** | Instant if immediate retrieval is needed |
| Rarely retrieved but instant when retrieved | **Glacier Instant Retrieval** | Flexible/Deep have large retrieval delays |
| Lower SSE-KMS call cost | **S3 Bucket Keys** | SSE-S3 loses KMS features |
| S3/DDB traffic exploding through NAT | **S3/DDB Gateway Endpoint (free)** | Interface EP incurs ENI cost |
| Lower global static-content transfer cost | **CloudFront** | S3 direct is expensive |
| Private access (non-S3/DDB) | **Interface Endpoint** | Cost benefit only at high volume |
| Extended connectivity across many VPCs | **Transit Gateway** | Peering is cheaper for a few |
| Granular billing + Athena analysis | **CUR → S3** | Cost Explorer is fast visualization |
| Fast cost graph/forecast | **Cost Explorer** | CUR is raw data |
| Auto-block on budget exceeded | **Budgets Actions** | Alert-only is Budgets/SNS |
| ML cost-spike detection | **Cost Anomaly Detection** | Budgets is fixed threshold |
| Cost separation by department | **Cost Allocation Tags** | No retroactivity before activation |
| Multi-account custom billing | **Billing Conductor** | Reseller/internal chargeback |

> ⚠️ **Pitfall**: Let me re-emphasize the three pairs most often gotten wrong. ① **SP vs. RI** — the moment you see "RDS/Redshift/ElastiCache," it's RI without exception; all other EC2 compute is SP. ② **Gateway vs. Interface Endpoint** — S3/DDB means free Gateway; other services mean Interface with ENI cost. ③ **Cost Explorer vs. CUR** — "Athena/fine-grained/SQL" means CUR; "fast graph/forecast" means Cost Explorer. Just nailing these three boundaries solves half the cost questions.

> 📚 **Case study**: Tie together, in one line, the cost incidents we saw all week, and the lesson is stark. **Lyft** (cut ML cost with Spot — designed assuming interruption is normal), **Dropbox** (saved $75M by leaving the cloud — transfer/storage cost becomes enormous at scale), **bill shock** (tens of thousands of dollars overnight from leaked keys/mistakes — Budgets Actions and Anomaly Detection are the shield), and the **FinOps movement** (cost is every engineer's responsibility — culture shift via tags/Budgets/visibility). The common message is that cost optimization is not a one-time cleanup but a continuous discipline running from the design stage through operations.

## Easily Confused Comparisons

| Comparison | A | B | Distinguishing keyword |
|----------|---|---|-----------|
| Compute SP vs. EC2 Instance SP | Free family/region (~66%) | Fixed family, deeper discount (~72%) | "change freely" vs. "cheaper in exchange for fixed" |
| SP vs. RI | EC2/Fargate/Lambda | RDS/Redshift/ElastiCache | Service name |
| Spot capacity-optimized vs. lowest-price | Minimize reclaims | Cheapest (frequent reclaims) | "reduce interruptions" |
| Intelligent-Tiering vs. Lifecycle | Pattern unknown, automatic | Pattern clear, rule-based | "predictable?" |
| Glacier Instant vs. Flexible vs. Deep | Instant (ms) | Minutes to hours | Retrieval-speed requirement |
| Gateway vs. Interface Endpoint | S3/DDB free | Others, ENI cost | Target service |
| CloudFront vs. S3 direct | Cache, low egress | Cost scales with users | "global transfer cost" |
| Cost Explorer vs. CUR | Fast visualization/forecast | Fine-grained raw/Athena | "fine SQL analysis?" |
| Budgets vs. Anomaly Detection | Fixed threshold | ML pattern | "highly variable cost?" |
| Trusted Advisor vs. Compute Optimizer | Rule-based waste | ML right-sizing | "recommend optimal size?" |

> 🔍 **Going deeper**: There's one meta-pattern running through this entire table — nearly every AWS cost tool divides on **"who bears the uncertainty."** Spot: the customer bears reclaim uncertainty in exchange for a 90% discount. SP: the customer removes future-usage uncertainty via commitment in exchange for a discount. Intelligent-Tiering: AWS bears access-pattern uncertainty and takes a small fee. Budgets: future-cost uncertainty is controlled with a limit. When you meet a cost question, ask "in this scenario, which uncertainty is central, and who is it reasonable to have bear it?" and the structure of the answer becomes visible.

## 시나리오 연습 문제 12

**문제 1.** A company runs a fleet of 24/7 web servers and may in the future move freely to newer-generation instances, OS, and regions. To get the maximum discount while keeping this flexibility, what should it use?

A) Standard Reserved Instance, 3 years
B) Compute Savings Plan
C) EC2 Instance Savings Plan
D) Spot Instances

**정답: B**

해설: A Compute SP commits to hourly spend, so the discount follows even when you freely change family, region, OS, and tenancy, and it covers Fargate and Lambda too. A Standard RI (A) pins a specific type, so the commitment dies on a new-generation move; an EC2 SP (C) discounts deeper but pins family and region, failing "free migration"; and Spot (D) is unsuitable for a 24/7 stable workload (reclaim risk).

---

**문제 2.** A data team runs a nightly ETL batch. The job can pause and resume via checkpoints, and cost minimization is the top priority. To save 90% while reducing interruptions, what should it use?

A) On-Demand
B) Spot Fleet + capacity-optimized allocation + diversify across multiple types/AZs
C) Reserved Instance, 3 years
D) Dedicated Host

**정답: B**

해설: A checkpoint-recoverable fault-tolerant batch is Spot's ideal use case (up to 90% savings). Capacity-optimized allocation picks pools with low reclaim probability to minimize interruptions, and diversification ensures fast replacement when one pool is reclaimed. On-Demand (A) is expensive, RI (C) is a 24/7 commitment so most hours are wasted for a nightly batch, and Dedicated Host (D) is for license BYOL, not a cost-saving measure.

---

**문제 3.** An application's data access frequency is unpredictable and its pattern changes over time. To automatically optimize S3 cost with no operational burden, what should it use?

A) S3 Standard-IA
B) S3 Intelligent-Tiering
C) S3 Glacier Flexible Retrieval
D) Lifecycle rule transitioning to IA after 30 days

**정답: B**

해설: When the access pattern is uncertain or shifting, Intelligent-Tiering tracks per-object access and automatically tiers up and down, and with no retrieval fee or minimum-storage penalty it removes the risk of a wrong choice. Standard-IA (A) or an explicit Lifecycle (D) is favorable when the pattern is clear, but under uncertainty, frequent access gets hit with minimum-storage/retrieval fees. Glacier Flexible (C) has large retrieval delay, unsuitable for active data.

---

**문제 4.** An EC2 in a private subnet reads and writes large amounts of data to S3, and NAT Gateway processing cost has exploded. What is the most effective savings measure?

A) Create an S3 Gateway Endpoint
B) Create an Interface Endpoint for S3
C) Replace with a NAT Instance
D) Add a Transit Gateway

**정답: A**

해설: An S3 Gateway Endpoint adds a route to the route table to send traffic straight to the AWS backbone without NAT or the internet, and the endpoint itself is free, driving NAT processing cost to zero. An Interface Endpoint (B) is also possible but incurs ENI/GB charges, making it costlier than the free Gateway; a NAT Instance (C) only adds management burden; and a TGW (D) carries data-processing charges, unrelated to savings.

---

**문제 5.** A company runs RDS PostgreSQL 24/7 and wants to reduce cost with a 1-year commitment. Which option is it?

A) Compute Savings Plan
B) EC2 Instance Savings Plan
C) RDS Reserved Instance
D) Spot

**정답: C**

해설: Savings Plans cover only EC2/Fargate/Lambda, while RDS, Redshift, ElastiCache, and OpenSearch are committed to only via Reserved Instances. So an RDS RI is the answer. A and B are wrong because SPs don't apply to RDS, and D is wrong because RDS doesn't support Spot and putting a database on a reclaimable instance is itself inappropriate. When you see "RDS," it's RI.

---

**문제 6.** A healthcare institution retrieves imaging data only once a quarter, but when it does, it needs millisecond, instant access. Which class lowers long-term storage cost while allowing instant retrieval?

A) S3 Standard
B) S3 Glacier Instant Retrieval
C) S3 Glacier Deep Archive
D) S3 One Zone-IA

**정답: B**

해설: Glacier Instant Retrieval offers a cheaper storage rate than Standard-IA with millisecond instant access, fitting exactly the "rarely retrieved but must be fast when retrieved" medical imaging case. Standard (A) is instantly accessible but has expensive storage, Deep Archive (C) has 12–48 hour retrieval delay violating "instant," and One Zone-IA (D) is single-AZ, unsuitable for durability-critical medical data and different in cost structure rather than instant access.

---

**문제 7.** A company serves S3 static assets to users worldwide, and data-transfer cost explodes in proportion to user growth. What is the most suitable savings measure?

A) Replicate S3 to multiple regions and serve directly
B) Place CloudFront in front of S3
C) S3 Transfer Acceleration
D) Add a NAT Gateway

**정답: B**

해설: CloudFront reduces origin requests via edge caching, S3→CloudFront transfer is free, and its egress rate is cheaper than S3 direct, reversing the cost. Replication (A) actually increases transfer/storage cost, Transfer Acceleration (C) is an upload-acceleration feature unrelated to download transfer cost, and NAT (D) is unrelated to internet egress savings.

---

**문제 8.** A company wants to analyze with ML whether its EC2 instances are over-provisioned and get concrete optimal type/size recommendations. What is the most suitable tool?

A) Trusted Advisor
B) Compute Optimizer
C) Cost Explorer
D) CloudWatch Alarm

**정답: B**

해설: Compute Optimizer analyzes past CloudWatch metrics with ML and recommends the optimal type/size and estimated savings per instance (memory requires the CloudWatch Agent). Trusted Advisor (A) is rule-based and catches only obvious waste like underutilized EC2, not precise right-sizing — the two are complementary. Cost Explorer (C) is visualization and CloudWatch Alarm (D) is threshold alerting, not right-sizing recommendation tools.

---

**문제 9.** A development account risks a runaway of expensive resources during an experiment. To automatically block creation of additional resources without human intervention once cost reaches 100% of budget, what should you use?

A) Cost Explorer alert
B) Budgets + Budgets Actions
C) CloudWatch Alarm + SNS
D) Trusted Advisor

**정답: B**

해설: Budgets Actions auto-attaches a restrictive IAM policy or stops instances when a budget threshold is reached, forcibly halting spend — an automatic circuit breaker against bill shock. Cost Explorer (A) only visualizes, CloudWatch Alarm + SNS (C) only sends an alert without automatic blocking, and Trusted Advisor (D) has no real-time forced-blocking capability.

---

**문제 10.** A finance team wants to freely analyze granular billing data — down to the hour and resource — in SQL to build custom reports. What is the most suitable approach?

A) Capture Cost Explorer graphs
B) Export CUR to S3 and query it with Athena
C) Extract Budgets data
D) Trusted Advisor report

**정답: B**

해설: CUR exports the most granular billing data at the hour/resource level to S3 and enables arbitrary SQL analysis with Athena, Redshift, or QuickSight. Cost Explorer (A) is strong at fast visualization/forecasting but can't do free-form resource-level SQL, and Budgets (C) and Trusted Advisor (D) are not fine-grained analysis tools. "Athena/fine SQL" means CUR.

---

**문제 11.** A team runs Java and Node.js container workloads on ECS and wants to lower the compute unit price while minimizing code changes. The non-core, cost-variable portion can be interrupted. What is the most effective combination?

A) Keep everything On-Demand x86
B) Graviton-based Fargate + Fargate Spot for the non-core portion
C) Rewrite everything to Lambda
D) Switch to Dedicated Host

**정답: B**

해설: Graviton gives 40% price-performance through ARM efficiency, and Java/Node.js/containers switch over with no code change via multi-architecture images. The interruptible non-core portion saves further with Fargate Spot — combining two axes (architecture efficiency + fault-tolerant discount). A has no savings, C is a large-scale rewrite contradicting "minimal change," and D is not a cost-saving measure.

---

**문제 12.** A global enterprise runs multiple AWS accounts under Organizations. It wants to apply a Compute SP bought in one account to another account's usage, separate and report cost by department, and prevent a specific OU from using expensive instances. What combination is needed?

A) Separate billing + IAM key separation + NACL
B) Consolidated Billing + Cost Allocation Tags + SCP
C) Cost Explorer + Budgets + PrivateLink
D) Billing Conductor + Macie + Inspector

**정답: B**

해설: Consolidated Billing shares SP/RI across accounts and aggregates volume discounts, Cost Allocation Tags separate cost by department, and SCP (Service Control Policy) is a guardrail that blocks expensive instances/regions at the OU level — matching the three requirements exactly. A can't do sharing/separation/blocking at all, and C's PrivateLink and D's Macie/Inspector are security tools unrelated to cost-governance requirements.

---

## 📌 Key Takeaways + Next Week Preview

The cost domain (about 20%) is a way of thinking that maps workload properties onto pricing models. **Compute** is solved with commitment (SP/RI, RDS is RI), market (Spot, capacity-optimized), architecture (Graviton), and size (Compute Optimizer); **storage** with access pattern (Intelligent-Tiering vs. Lifecycle), the minimum-storage trap, Bucket Keys, and gp3; **network** with Gateway Endpoint (free), CloudFront, and AZ topology; and **governance** with Cost Explorer/CUR, Budgets Actions, Anomaly Detection, tags, and Consolidated Billing. Every tool divides on "who bears the uncertainty." SP vs. RI, Gateway vs. Interface Endpoint, Cost Explorer vs. CUR — just nailing these three boundaries solves half the cost questions.

Next week (Week 11) moves from cost to **high availability, disaster recovery, and migration**. It covers Multi-AZ vs. Multi-Region, DR strategies by RTO/RPO (Backup & Restore / Pilot Light / Warm Standby / Multi-Site), database migration via DMS/SCT, and large-scale data transfer via the Snow family. The tension we saw in cost — "AZ-boundary cost = the price of high availability" — expands next week into the design decision head-on: "how available do we make it vs. how much do we spend?"
