# Day 1 - Why Compute Cost Splits Along Three Axes: Commitment, Market, and Ownership

The cloud's biggest promise was "pay only for what you use." Yet once you actually run something in production, a paradox appears: a bill built purely on On-Demand can end up more expensive than just buying on-premises servers. That's because you're paying a monthly premium for the privilege of "borrowing instantly, whenever you need it" on a database server you obviously intend to keep running 24/7. AWS's compute discount system — Reserved Instances, Savings Plans, Spot — is the mechanism that resolves this paradox, and at its root is an economic model in which **AWS hands two of the risks it bears from running data centers back to the customer, and gives a discount in exchange**. The first is demand-forecasting risk. AWS has to buy servers ahead of time based on predicted future demand, so when a customer commits to "I'll use this much for 3 years," AWS's forecasting burden drops and it rewards that with a discount. The second is idle-capacity risk. An AWS data center always has unsold spare capacity, and Spot is the practice of dumping it cheaply on the condition that "we can reclaim it at any time."

Instead of listing cost options in a table, this article follows the reasoning — "why Savings Plans came to replace RIs," "the internal signal flow of how a Spot instance gets reclaimed in 2 minutes," "how Graviton produces 40%-cheaper pricing at equal performance" — to get at what the SAA cost domain (20% of the whole) is really asking. Cost problems look like memorization, but they're actually design problems: you map an architectural property of the workload — "its stability, fault tolerance, and commitment-viability" — onto a pricing model.

## Why RIs Gave Up Their Seat to Savings Plans

Reserved Instances arrived in 2009. The model back then was simple — "commit to using a specific instance type in a specific region (e.g., m4.large in us-east-1) for 1 or 3 years, and get a discount." The problem was that this commitment was **nailed to the instance type**. If you committed to m4 and m5 came out a year later, the moment you moved to the faster, cheaper new generation your commitment became useless. The cloud's core value — "flexibility" — collided head-on with the RI's "rigid commitment."

AWS softened this in two stages. First it introduced **Convertible RIs** (2016) — exchangeable for other RIs, but only for equal or higher value, and at a lower discount (~54%). Even so, the hassle of "exchanging an object called an RI" remained. So in 2019 **Savings Plans** appeared, and it inverted the idea entirely. An SP isn't a commitment to "a specific instance"; it's a **dollar commitment: "I'll spend $X per hour on compute for 1/3 years."** Within that committed $/hr ceiling, the discount applies automatically no matter which instance type you use, which region you're in, or whether it's EC2, Fargate, or Lambda. The unit of commitment moved from the object called an instance to the "flow of spend."

> 💡 **Related theory**: This is the same structure as a forward contract in finance. The customer locks in the future price of compute now, and in exchange receives a discount versus the spot price (On-Demand). From AWS's side, an SP is a hedging tool that secures a "predictable revenue stream." If an RI is "a future on a specific product," an SP is "a future on total spend," which is far more flexible. It's the same principle as an airline hedging "total fuel cost" rather than a specific fuel grade — the former is more flexible.

Savings Plans come in two kinds, and this distinction is an exam regular. A **Compute Savings Plan** offers maximum flexibility (~66% discount) — you can freely change instance family, region, OS, and tenancy and the discount follows. It even covers Fargate and Lambda. An **EC2 Instance Savings Plan** pins you to a specific family (e.g., m5) and region, but in exchange gives a deeper discount (~72%) — within the family, size (large↔xlarge) and OS are free to change. In other words, it's a trade: "the more flexibility you give up, the more we cut."

> ⚠️ **Pitfall**: You must know the RI/RDS relationship precisely. RDS, Redshift, ElastiCache, and OpenSearch are **not covered by Savings Plans** — these services are still committed to only via Reserved Instances. So the correct answer to "reduce RDS cost with a 1-year commitment" is not an SP but an RI. SPs cover only the "compute execution layer" of EC2/Fargate/Lambda, and reservations for managed databases remain a separate RI system. New EC2 compute is almost always an SP answer, but the instant you see the word "RDS" you should reflexively think RI.

It also helps to know the discount application order. When the AWS billing engine applies discounts to hourly usage, it burns down commitments starting from the most specific — **RI → EC2 Instance SP → Compute SP → On-Demand**. The more specific the commitment, the narrower its applicable scope and thus the greater the "risk of being wasted," so it's filled first. Because of this priority, if you hold both RIs and SPs, the RI is consumed first and the SP catches the remaining usage.

## The Internal Mechanism by Which a Spot Instance Is Reclaimed in 2 Minutes

Spot instances offer the dramatic price of up to 90% off, but in exchange AWS can **reclaim them at any time with 2 minutes' notice**. Understanding this "2 minutes" figure and the flow of the reclaim signal reveals the essence of Spot design.

Spot pricing used to be auction-style bidding, but starting in 2017 AWS changed the model — now a Spot price is **a market price that moves gently according to long-term supply and demand per instance type and AZ**, and the customer sets not a bid but only "the maximum I'm willing to pay versus On-Demand." The real reason a reclaim happens is not that the price exceeded a bid, but that **On-Demand demand rose and AWS has to return that capacity to full-price customers**. That is, Spot is "borrowing AWS's idle capacity," and when the owner comes back you have to vacate.

The flow of the reclaim signal is this. When AWS decides to reclaim a particular chunk of capacity, a reclaim timestamp is written to a specific path (`/latest/meta-data/spot/instance-action`) of the **EC2 Instance Metadata Service (IMDS, 169.254.169.254)**. An application inside the instance, or EventBridge, detects this signal and performs a graceful shutdown within 2 minutes — checkpointing in-flight work, removing itself from the load balancer, or handing work off to another node. This 2-minute window was designed as "the minimum time to safely drain state," which is why Spot only fits **workloads that can lose state or recover from a checkpoint**.

> 🔍 **Going deeper**: The key strategy for reducing Spot interruptions is **diversification**. If you register several instance types and multiple AZs in an EC2 Fleet or Spot Fleet, then when one type's capacity is reclaimed it's quickly replaced by another. On top of this AWS provides the **capacity-optimized allocation strategy**, which picks not simply the cheapest pool but "the capacity pool least likely to be reclaimed right now," minimizing interruptions themselves. Choosing lowest-price causes the paradox of demand piling onto that pool and reclaims becoming frequent, so production Spot usually uses capacity-optimized. Also, turning on **Capacity Rebalancing** delivers an impending-reclaim signal (rebalance recommendation) before the 2-minute notice, buying time to launch a new instance and move work before the reclaim.

> 📚 **Case study**: In 2019, Lyft disclosed that it had moved machine-learning training and data-processing workloads to Spot at large scale, greatly cutting compute cost. The key was "designing on the assumption that interruption is the normal state, not an exception" — they split training jobs into checkpoint units so that even if reclaimed they resume from the last checkpoint. Conversely, putting a stateful workload (e.g., a web server holding sessions in memory) on Spot while ignoring interruptions, and losing user sessions on every reclaim, is a common anti-pattern. Spot should be seen not as "use it because it's cheap" but as "a reward for a fault-tolerant architecture."

The **Mixed Instances Policy** that combines an ASG with Spot is the production standard that ties all of this together. Within a single Auto Scaling Group you mix "an On-Demand baseline + a Spot variable portion" by ratio, diversify the Spot across multiple types, and when a reclaim happens the ASG automatically fills in with another type of Spot or On-Demand. A single ASG simultaneously achieves both goals: "stability via On-Demand/SP, cost via Spot."

## How Graviton Produces 40%-Cheaper Pricing at Equal Performance

Graviton is an ARM-based processor AWS designed itself. It uses the ARM architecture instead of Intel/AMD's x86, and delivers up to 40% better price-performance at the same performance tier. How this is possible comes down to a fundamental difference in CPU architecture.

x86 is in the CISC (Complex Instruction Set Computing) family, carrying decades of accumulated legacy for processing complex commands as a single instruction. ARM is in the RISC (Reduced Instruction Set Computing) family, optimized for rapidly and repeatedly executing a simple instruction set. RISC's simplicity translates into **power efficiency per transistor** — this is why mobile devices (smartphones) are all ARM. In a data center, power is operating cost, so better performance-per-watt means processing the same work more cheaply. On top of that, because AWS **designs Graviton itself**, the margin it used to pay Intel/AMD disappears, and it can optimize the chip for its own workloads (Lambda, Fargate, managed services).

> 💡 **Related theory**: This is a textbook case of vertical integration. It's the same strategy as Apple building its M-series chips in-house to cut its dependence on Intel and capture power, performance, and cost all at once. When a cloud provider goes all the way down to the chip and controls it, it creates a cost advantage at the abstraction layer (instance pricing) that competitors struggle to match. Google's TPU and Microsoft's Cobalt are part of the same current — a huge industry trend of hyperscalers internalizing silicon.

Graviton's practical constraint is **architecture compatibility**. A binary compiled for x86 won't run as-is on ARM, so you have to recompile the application for ARM or build multi-architecture container images. Fortunately, interpreter/JIT-based languages (Java, Python, Node.js, Go, .NET) run fine without code changes as long as the runtime is the ARM version, and in container environments (EKS/ECS) they switch over seamlessly via multi-architecture images. So on the exam, when the condition "lower cost while minimizing code changes" appears alongside Graviton, you should read it together with signals of a managed service or a container/interpreted-language workload.

> ⚠️ **Pitfall**: Graviton is not a "magic free discount." Legacy binaries written in natively compiled languages (C/C++/Rust), or workloads that depend on x86-only libraries and drivers, may carry porting costs or be impossible altogether. The SAA exam usually presents Graviton as the answer on the premise of a "compatibility-friendly workload," but in practice you must verify portability first.

## Right-sizing and Compute Optimizer: The Biggest Waste Is Over-Provisioning

No matter how well you pick a cost option, if you're using an instance bigger than you need in the first place, every discount is meaningless. The most common form of cloud waste is **over-provisioning** — spinning up an m5.4xlarge "just in case" when actual CPU sits at 5%. In the on-prem era, once you bought a server it was hard to change, so buying generously was rational; in the cloud, that same habit becomes pure waste.

**Compute Optimizer** solves this with ML. It learns from the past 14 days of CloudWatch metrics (CPU, memory, network, disk) and produces concrete recommendations like "this instance doesn't need m5.4xlarge, m5.xlarge is enough, saving $X/month." It covers not just EC2 but EBS volumes, Lambda memory settings, ASGs, and ECS on Fargate. The key here is the **memory metric** — as we saw back on Day 41, EC2 memory is guest-OS-internal information the hypervisor can't see, so it's only collected if the CloudWatch Agent is present. Installing the Agent to feed in memory data greatly improves the accuracy of Compute Optimizer's recommendations.

> 🔍 **Going deeper**: You need to distinguish the roles of Compute Optimizer and Trusted Advisor. **Trusted Advisor** is rule-based, catching obvious waste like "idle EIPs, unattached EBS, underutilized EC2 (under 10% CPU, etc.)" with simple thresholds. **Compute Optimizer** is ML-based, producing right-sizing recommendations for "exactly which type and size is optimal for this workload pattern." The two are complementary — use TA to clear out the obvious garbage, and Compute Optimizer to fine-tune the size of what remains. On the exam, "ML-based right-sizing recommendation" signals Compute Optimizer, while "identify unused resources" signals Trusted Advisor.

The production cost structure that pulls all of this together is layered. **The 24/7 stable baseline is discounted most deeply via a 3-year Compute SP (or EC2 SP)**, **the predictable variable portion is covered by a 1-year SP**, **fault-tolerant batch/experiments save 90% on Spot**, and **only the unpredictable short spikes are taken on On-Demand**. On top of this you lower the unit price once more with Graviton, and fine-tune each layer's size with Compute Optimizer. Cost optimization isn't a single choice — it's portfolio design, decomposing the workload into stability, fault tolerance, and predictability and dressing each in the matching pricing model.

## Comparison with Other Clouds

Relativizing AWS's commitment model makes design choices sharper.

| Dimension | AWS | Azure | GCP |
|------|-----|-------|-----|
| Commitment discount | Savings Plans (dollar commit), Reserved Instances | Reserved VM Instances, Savings Plans for compute | Committed Use Discounts (CUD) |
| Automatic sustained discount | None (commitment required) | None | **Sustained Use Discount** — automatic discount for long usage without commitment |
| Spot-style | Spot Instances (2-min notice) | Spot VMs | Spot VMs / Preemptible (formerly 24h cap) |
| Own chip | Graviton (ARM) | Cobalt (ARM, new) | Tau (ARM), TPU |

GCP's **Sustained Use Discount** is especially contrasting — even without a commitment, the longer you keep something on within a month, the deeper the discount automatically gets. AWS has no such automatic discount and requires explicit commitments (SP/RI); in exchange the discount is larger when you commit, and one commitment covers a broader range, all the way to Lambda and Fargate. Each cloud made a different choice on the trade-off of "the hassle of commitment vs the size of the discount."

> 📚 **Case study**: Around 2018, many companies experienced cloud cost explosions, and an operating methodology called **FinOps** rose. Companies like Adobe and Spotify shared cases of transforming a culture where "engineers spin up resources ignoring cost" into one of cost visibility, accountability, and automation, and the FinOps Foundation was formed. The core lesson is that "cost is not the infrastructure team's job alone but the responsibility of every engineer who creates a resource," and AWS's SP/Spot/tagging/Budgets are the toolset implementing this methodology. The perspective of seeing cost optimization not as a one-time cleanup but as continuous operational discipline is the bedrock of the SAA cost domain.

## Hands-on with the CLI

```bash
# Savings Plans purchase recommendation (1 year, no upfront)
aws ce get-savings-plans-purchase-recommendation \
  --savings-plans-type COMPUTE_SP \
  --term-in-years ONE_YEAR --payment-option NO_UPFRONT \
  --lookback-period-in-days SIXTY_DAYS

# Compute Optimizer EC2 right-sizing recommendation (enhanced metrics active)
aws compute-optimizer get-ec2-instance-recommendations \
  --recommendation-preferences EnhancedInfrastructureMetrics=ACTIVE

# Query Spot price history (pick types with low volatility)
aws ec2 describe-spot-price-history \
  --instance-types m5.large m5a.large m6i.large \
  --product-descriptions "Linux/UNIX" \
  --start-time $(date -u +%Y-%m-%dT%H:%M:%S)

# ASG Mixed Instances (On-Demand base + Spot diversification)
aws ec2 create-launch-template --launch-template-name mixed-base \
  --launch-template-data '{"ImageId":"ami-0abc","InstanceType":"m5.large"}'
# (Use the ASG's MixedInstancesPolicy to specify the On-Demand ratio,
#  the list of Spot types, and the capacity-optimized allocation strategy)

# Detect the Spot reclaim signal (poll IMDS from inside the instance)
curl -s http://169.254.169.254/latest/meta-data/spot/instance-action
# → if a reclaim is scheduled, returns {"action":"terminate","time":"2026-06-02T10:00:00Z"}
```

## Wrapping Up

EC2 compute cost optimization organizes along four axes: commitment, market, ownership, and size. ① **Savings Plans** are a forward-contract-style discount that commits to "not an instance but hourly spend," split into Compute SP (max flexibility, ~66%) and EC2 SP (family-pinned, ~72%), while RDS/Redshift/ElastiCache remain RI. ② **Spot** borrows AWS idle capacity 90% cheaper but is reclaimed on 2 minutes' notice; you tame interruptions with IMDS signal detection, diversification, capacity-optimized allocation, and Capacity Rebalancing, and use it only for fault-tolerant workloads. ③ **Graviton** delivers 40% price-performance through ARM/RISC power efficiency and AWS vertical integration, but you must check architecture compatibility. ④ **Compute Optimizer** catches over-provisioning with ML and complements Trusted Advisor's rule-based waste detection. Production combines these as a portfolio of an SP baseline + Spot variable + On-Demand spikes.

In the next article we move from compute to storage, looking at how S3 storage classes, Lifecycle, and Intelligent-Tiering automatically optimize the cost of "data whose access pattern you don't know" — and the hidden trap of the minimum storage duration.

---

## 📝 연습 문제

**문제 1.** A company runs a 24/7 web application and may in the future want to freely move to newer-generation instances and change OS or region as well. To get the maximum cost discount while keeping this flexibility, what should it use?

A) Standard Reserved Instance, 3 years
B) Compute Savings Plan
C) EC2 Instance Savings Plan
D) Spot Instances

**정답: B**

해설: A Compute Savings Plan commits to "$X per hour of spend," so the discount follows even if you freely change instance family, region, OS, and tenancy, and it even covers Fargate and Lambda (~66%). A Standard RI (A) is nailed to a specific type, so the commitment dies when you move to a new generation. An EC2 Instance SP (C) discounts deeper (~72%) but pins family and region, failing the "free migration" requirement. Spot (D) is unsuitable for a 24/7 stable workload — it can be reclaimed at any time.

---

**문제 2.** A team runs a machine-learning training batch job that runs at night. The job can be paused and resumed via checkpoints, and minimizing cost is the top priority. Which option is most suitable?

A) On-Demand
B) Reserved Instance, 3 years
C) Spot Instances + Capacity Rebalancing
D) Convertible RI

**정답: C**

해설: A fault-tolerant batch that can pause and resume via checkpoints is Spot's ideal use case, earning up to 90% off. Turning on Capacity Rebalancing delivers the impending-reclaim signal before the 2-minute notice, buying time to move work in advance. On-Demand (A) is the most expensive, and RI (B) / Convertible RI (D) are commitments for 24/7 stable workloads, so for a "night-only batch" most of the committed hours are wasted. The key signal is the fault-tolerance mention: "can pause and resume via checkpoints."

---

**문제 3.** A company runs an RDS PostgreSQL instance 24/7 and wants to reduce cost with a 1-year commitment. Which option should it use?

A) Compute Savings Plan
B) EC2 Instance Savings Plan
C) Reserved Instance (RDS)
D) Spot Instances

**정답: C**

해설: Savings Plans cover only the EC2/Fargate/Lambda compute execution layer; RDS, Redshift, ElastiCache, and OpenSearch are still committed to only via Reserved Instances. So the answer is an RDS RI. A and B are wrong because SPs don't apply to RDS, and D is wrong because RDS doesn't support Spot and putting a database on a reclaimable instance is itself inappropriate. When you see the word "RDS," you should think RI, not SP.

---

**문제 4.** A team runs Java and Node.js container workloads on ECS and wants to lower the compute unit price while minimizing code changes. What is the most suitable approach?

A) Swap instances for a larger type
B) Move to Graviton (ARM)-based instances/Fargate
C) Rewrite all workloads to Lambda
D) Move to Dedicated Hosts

**정답: B**

해설: Graviton delivers up to 40% price-performance through the power efficiency of the ARM/RISC architecture and AWS vertical integration. Runtime-based languages like Java and Node.js run without code changes as long as you use the ARM version of the runtime, and containers switch over seamlessly via multi-architecture images, meeting the "minimize code changes" condition. A actually increases cost, C is a large-scale rewrite that contradicts "minimal change," and D is for license BYOL purposes, not a cost-saving measure.

---

**문제 5.** A company suspects its EC2 instances are over-provisioned. To get a concrete recommendation of the optimal type and size for each instance by analyzing past usage patterns with ML, what should it use?

A) Trusted Advisor
B) Compute Optimizer
C) Cost Explorer
D) CloudWatch Alarm

**정답: B**

해설: Compute Optimizer analyzes past CloudWatch metrics with ML and concretely recommends the optimal type/size and estimated savings per instance (EC2, EBS, Lambda, ASG, ECS). Trusted Advisor (A) is rule-based and catches only obvious waste like "underutilized EC2" by threshold; it can't do precise right-sizing — the two are complementary. Cost Explorer (C) is a cost-visualization and forecasting tool, and CloudWatch Alarm (D) is a threshold alert, not a right-sizing recommendation tool. To see memory accurately as well, you must feed memory metrics via the CloudWatch Agent to raise recommendation accuracy.

---

**문제 6.** You run a production workload on Spot instances, but frequent interruptions are hurting availability. Which allocation strategy most effectively reduces the interruptions themselves?

A) lowest-price allocation, using only the cheapest pool
B) capacity-optimized allocation + diversify across multiple instance types/AZs
C) Standardize on a single instance type
D) Set the On-Demand bid to the maximum

**정답: B**

해설: capacity-optimized allocation picks "the capacity pool least likely to be reclaimed right now," minimizing interruptions themselves, and diversifying across multiple types/AZs ensures quick replacement even when one pool is reclaimed. lowest-price (A) causes the paradox of demand piling onto the cheapest pool, making reclaims more frequent. A single type (C) is the opposite of diversification, with no replacement pool available at reclaim time — risky. D is irrelevant because Spot is no longer a bid auction; reclaims happen not from price but from recovering On-Demand demand.

---

**문제 7.** An architect wants to optimize the cost of a workload that mixes stable baseline traffic with unpredictable spikes. What is the most appropriate combination strategy?

A) Standardize entirely on On-Demand
B) Commit everything to 3-year RIs
C) Mix Savings Plan for the baseline, On-Demand for the variable/spikes (+ Spot for the fault-tolerant portion)
D) Run everything on Spot

**정답: C**

해설: Cost optimization is portfolio design that decomposes a workload by stability and predictability and dresses each part in the matching pricing model. The 24/7 baseline is deeply discounted with an SP, unpredictable spikes are flexibly absorbed by On-Demand, and the fault-tolerant portion saves via Spot. A leaves even the baseline on expensive On-Demand (wasteful), B commits even the variable/spikes so unused commitments are wasted, and D puts the baseline that needs stability onto reclaimable Spot, hurting availability.

---

## 📌 Key Takeaways

Compute cost splits along four axes: commitment (SP/RI), market (Spot), ownership (Dedicated), and size (right-sizing). Savings Plans are a forward-contract-style discount committing to hourly spend rather than an instance, split into Compute SP (flexible) and EC2 SP (pinned, deeper discount), while RDS/Redshift/ElastiCache remain RI. Spot borrows idle capacity 90% cheaper but is reclaimed on 2 minutes' notice, so use it for fault-tolerant workloads alongside capacity-optimized, diversification, and Capacity Rebalancing. Graviton delivers 40% price-performance through ARM efficiency, and Compute Optimizer catches over-provisioning with ML. The exam repeatedly tests your ability to map a workload's stability, fault tolerance, and commitment-viability onto a pricing model.
