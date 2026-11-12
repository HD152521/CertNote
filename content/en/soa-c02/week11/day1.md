# Day 1 - Compute Optimizer: How 14 Days of Metrics Resize Instances

Cloud's costliest mistake isn't failure but **neglect**. Someone provisioned m5.4xlarge "generously" three years ago; the service actually needs m5.large but no one revisits. CPU averaging 4% runs 24/365 at full price. On-premises this waste stayed hidden—server was sunk cost. Cloud bills hourly, so over-provisioning hits invoices instantly. **Right Sizing** is narrowing the gap: provisioned capacity vs actual usage.

The problem: humans can't eye-measure. CPU alone misses memory; averages miss peaks; one instance misses two hundred. **AWS Compute Optimizer** delegates to ML—learns 14 days of metrics, auto-outputs "downsize this to m5.large, save $X/month." This article dives into where that recommendation comes from, why missing memory metrics breaks recommendations, and what EC2 instance family alphabet codes actually mean as hardware.

## Right Sizing's Root—Statistical Multiplexing and Over-Provisioning History

Over-provisioning isn't cloud-created; cloud **exposed** it. Datacenter-era server average utilization remained **10~15%** per surveys. Reason: buying to peaks. Black Friday traffic meant 1-year at that capacity, 364 days idle. Virtualization raised this slightly but peak-buying structures persisted.

Cloud promised to flip this—rent when needed, stop when unused (elasticity). But humans kept old habits: provision "generously," forget to stop. So cloud servers still run 10% utilization. Difference: now that waste converts to **hourly billing visible**. Right Sizing ultimately replaces "buy-to-peak" with "buy-to-measured," and Compute Optimizer auto-measures.

> 💡 **Related Theory**: Right Sizing grounds in statistical multiplexing and queueing theory. Core insight: "many independent workloads together have total peak far smaller than sum of individual peaks." 100 services peak at different times; probability all peak simultaneously approaches zero (law of large numbers). Larger pools sustain high utilization safely. Single workload isolated must match its peak, forcing low utilization. Queuing M/M/1 model shows wait time explodes non-linearly as utilization (ρ) approaches 1—safe target usually 70~80%, not 100%. Compute Optimizer recommends "fitted with headroom," not "exact fit."

## Compute Optimizer Learns What—14 Days, Percentiles, ML

Compute Optimizer's recommendation inputs "recent 14-day CloudWatch metrics." Why 14? Too short (1 day) catches random traffic swings, wrong recommendation; too long misses recent workload changes. Two weeks captures weekly patterns (weekday vs weekend) minimum twice—Monday peak and Sunday valley both seen before truly knowing "this instance's shape."

Internally, Optimizer doesn't just average. It analyzes **percentile distributions** of CPU, memory, network, disk metrics. Average CPU 10% but P99 (top 1%) at 95% means occasional maxing; careless downsizing tanks performance then. ML model cross-references this distribution against EC2 type performance database to find "smallest container holding this workload shape." Result: three Findings.

| Finding | Meaning | Action |
|---------|---------|--------|
| **Over-provisioned** | Container too large—CPU/memory excess | Downsize (cost save) |
| **Under-provisioned** | Container too small—risk performance | Upsize or change family |
| **Optimized** | Proper—headroom right | Maintain |

Scope expanded from EC2 instances: ASGs, EBS volumes, Lambda, ECS Fargate, RDS, commercial software licenses. Basic free; Enhanced (EC2, paid) offers external metric integration, longer lookback.

> 🔍 **Deeper Dive**: Optimizer's biggest blind spot is **memory**. EC2 standard CloudWatch lacks memory utilization—hypervisor can't peek inside guest OS memory. It knows VM allocated memory but not OS usage (cache vs actual). Memory metrics need **CloudWatch Agent installed inside guest**, pushing `mem_used_percent`. Without it, Optimizer treats memory as "unknown," recommending on CPU/network alone—risky for memory-bound workloads (Redis, large JVM). Wrong downsizing happens. "Optimizer weird?" diagnosis: usually missing Agent, memory gap.

> ⚠️ **Trap**: Optimizer sees **current workload only**—ignores future growth or coming features. P99 "Optimized" means nothing if next month's promo quintuples traffic. Applying recommendations cuts headroom, leaving vulnerable to spikes. Exam: "applied Optimizer, then performance tanked"—usually past-tense (14-day basis), missing memory metrics, or ignoring planned growth.

## EC2 Instance Families—Single Letter Codes Real Hardware

Instance names look cryptic but well-engineered. `c7gn.2xlarge` breaks into five pieces:

```
c   7   g n   .   2xlarge
│   │   │ │       └─ Size (vCPU·memory multiple)
│   │   │ └──────── Added feature (n = network enhanced)
│   │   └────────── Processor (g = Graviton/ARM)
│   └────────────── Generation (higher = newer)
└────────────────── Family (c = compute optimized)
```

Family letter decides **CPU:memory ratio**, which accelerators/storage attach. Ratio must match workload shape for efficiency.

| Family | vCPU:Memory | Fits | Example |
|--------|----------|--------|---------|
| **T (Burstable)** | Various | Idle then spiky | t3.medium, t4g.large |
| **M (General)** | 1:4 | Balanced web/apps | m6i.xlarge, m7g.large |
| **C (Compute)** | 1:2 | CPU-bound encoding/HPC | c7g.xlarge, c6i.large |
| **R (Memory)** | 1:8 | Memory-bound in-memory DB | r6i.xlarge, r7g.large |
| **X (High Memory)** | 1:16+ | Ultra in-memory SAP HANA | x2idn.16xlarge |
| **I (Storage IO)** | NVMe SSD | High IOPS NoSQL/DW | i4i.large |
| **D (Dense Storage)** | HDD packed | Bulk sequential distributed FS | d3.xlarge |
| **G/P (GPU)** | GPU attached | Graphics (G) / ML training (P) | g5.xlarge, p4d.24xlarge |
| **Inf/Trn** | AWS chip | ML inference (Inf) / training (Trn) | inf2.xlarge, trn1.32xlarge |
| **HPC** | Max network/core | Tightly-coupled cluster | hpc7g.16xlarge |

Mnemonic: **M** = medium (balanced), **C** = compute (CPU), **R** = RAM (memory), **I** = IO, **G/P** = GPU. First letter = use. Exam: "memory-intensive cache" → R; "CPU-bound batch" → C; "balanced web" → M.

> 💡 **Related Theory**: Family selection is **identifying bottleneck resource**. Workloads split CPU-bound / memory-bound / IO-bound / network-bound by which saturates first. Amdahl's Law: system performance determined by slowest part—double CPU when memory bottlenecks, performance barely improves. Family letter chooses "which resource abundant." Memory-bound workload on C-family (CPU-rich, memory-poor) runs swapped, expensive CPU idle, performance crashes. Right Sizing sometimes means **changing family**, not just size—wrong family never works efficiently.

## Graviton—AWS Custom ARM Chip Rewrites Cost Curve

Instances with `g` suffix (c7**g**, m7**g**, r7**g**) use **Graviton**, AWS's custom ARM processor. Not option but computing economics game-changer.

Decades: x86 (Intel, AMD) monopoly. ARM was phones/embedded—good power efficiency, weak server performance. AWS acquired Annapurna Labs (2015), released first Graviton (2018), then Graviton2 (2019), Graviton3/4—inverted perception. Cost motivation: no x86 license, design for cloud workloads (many cores, moderate single-thread), deliver same perf cheaper, power-efficient. Result: Graviton instances **~20% cheaper than equivalent x86** with better price/performance.

Tradeoff: **architecture compatibility**. ARM/x86 instruction sets differ; x86-compiled native binaries don't run ARM unchanged. Fortunately containers, interpreter languages (Java, Node, Python, Go, .NET) have runtimes absorbing architecture gaps—mostly work without recompile. Stuck: C/C++ native extensions, arch-specific libs. Practical pattern: "stage with ARM AMI, build/test → if compatible, switch operations."

> 📚 **Case Study**: Graviton adoption isn't experiment anymore. AWS 2023 re:Invent: "last 2 years EC2 capacity >50% Graviton-based." Snap, Twilio, SmugMug migrated major workloads, reported two-digit cost cuts public. AWS managed services (Lambda, Fargate, RDS, ElastiCache, OpenSearch) offer Graviton—users needn't think architecture; AWS builds runtimes ARM-compatible. SOA exam: "Node.js/Java microservice 20% cost cut" keyword almost always → Graviton switch.

## T Family Trap—CPU Credits as Debt System

T instances (t3, t4g) look cheapest, most often misused. Core: T is **burstable**—baseline low performance guaranteed, burst to full only using accumulated credits. Misunderstand, operations hit mystery performance drops.

Mechanics: **CPU Credit** debt system. t3.medium has 20% baseline per vCPU—normally only 20% core available. Usage below baseline accumulates credits (hourly quota); above baseline consumes credits, burst to 100%. Night idle savings, day burns. Problem: **credits exhaust**—then baseline (20%) force-caps, performance cliffs. CPU graph suddenly ceiling-hits 20%, app response tanks. Operators suspect "AWS outage?"—classic credit starvation.

Escape: two paths. **T3 Unlimited mode** continues burst, charges overages (vCPU-hour)—fine for occasional spikes but constant high-load stacks fees until M-family cheaper. Correct: **sustained workloads pick M/C from start**; T only truly-idle (dev servers, low-traffic internal tools).

> ⚠️ **Trap**: T baseline varies per size (t3.nano 5%, t3.medium 20%, t3.xlarge 40%). "T so fine under load" wrong; sustained load = T forbidden. Exam: "T workload performance cliff after time" → credit starvation, fix is M/C switch (not Unlimited, wastes).

## EBS Right Sizing Too—gp2→gp3 No-Downtime Switch

Right Sizing applies beyond instances. Optimizer analyzes **EBS volumes**, most common finding: **gp2→gp3 switch**. Nearly-free SOA optimization both exam and ops.

gp2 design flaw: **IOPS tied to size**. gp2 gives 3 IOPS/GB, so 3,000 IOPS needs 1TB volume. Need 100GB, buy 1TB for IOPS—another over-provisioning. gp3 broke this tie. **Baseline 3,000 IOPS·125MB/s guaranteed, independent of size**, add more IOPS/throughput separately. Plus ~20% cheaper per GB.

| Item | gp2 | gp3 |
|------|-----|-----|
| IOPS | 3/GB (size-coupled) | 3,000 baseline (independent) |
| Throughput | IOPS-coupled | 125MB/s baseline (independent) |
| Cost/GB | Baseline | ~20% cheaper |
| Modify | — | Online no-downtime from gp2 |

Best part: switch **no-downtime**. `modify-volume` API changes type, instance stays up, background migration runs. No snapshot, no rebuild. "Hundreds gp2 account" gets bill cut instantly, zero downtime—textbook quick win.

## Wrapping Up

Cost optimization usually starts Right Sizing—verify instance size before discounts. Wrong size + discount = wrong cost committed 3 years.

Five for operators: ① Optimizer analyzes 14-day metric percentile distributions, ML judges Over/Under/Optimized. ② Memory metrics missing standard so **CloudWatch Agent required**—absent, memory-bound misdiagnosed. ③ Family letter = CPU:memory ratio + accelerators: M (balance), C (CPU), R (memory), I (IO), G/P (GPU). Match bottleneck resource. ④ Graviton (`g`) ARM-based ~20% cheaper, containers/runtime languages mostly compatible. ⑤ T family CPU credit debt model—sustained ops unfit, credit exhaustion = baseline ceiling. EBS gp2→gp3 no-downtime switch ~20% save + performance boost.

Next: Trusted Advisor—five auto-checks across account (security, performance, cost, fault-tolerance, service limits).

---

## 📝 Practice Questions

**Question 1.** Compute Optimizer recommended downsizing an instance running a memory-intensive workload (a Redis cache), saying it is "Over-provisioned, reduce to a smaller type." What is the main reason to doubt this recommendation?

A) Compute Optimizer does not support cache workloads
B) EC2 standard metrics do not include memory utilization, so without the CloudWatch Agent it makes recommendations from CPU and network alone without knowing memory, and can misjudge memory-bound workloads
C) 14 days is too short an analysis period
D) Redis cannot be downsized

**Answer: B**

Explanation: EC2 standard CloudWatch metrics include CPU, network, and disk, but not memory utilization, because the hypervisor cannot see memory usage inside the guest OS. To get a memory metric, you must install the CloudWatch Agent inside the guest OS and push `mem_used_percent`. Without the Agent, Compute Optimizer treats memory as an "unknown value" and recommends from CPU alone; a memory-bound workload such as Redis can have its memory full even when CPU utilization is low, so downsizing is risky. The reliability of the recommendation depends directly on whether the Agent is installed.

---

**Question 2.** You must pick an instance family for a compute-intensive video encoding batch job. The job uses CPU at nearly 100% but uses little memory. Which family is the best fit?

A) R (memory optimized)
B) C (compute optimized) — a vCPU:memory ratio of 1:2 gives plenty of CPU
C) T (burstable)
D) X (extreme memory)

**Answer: B**

Explanation: Family selection is about matching abundant resources to the bottleneck resource. For a CPU-bound workload, the C family (compute optimized) is correct: its memory-to-vCPU ratio is about 1:2, giving more CPU for the same price. R (A) has abundant memory but a higher price per CPU, so it is wasteful for CPU-bound work. T (C) exhausts its credits under sustained high load. X (D) is for very large in-memory databases.

---

**Question 3.** You have been told to cut the compute cost of a Node.js microservice cluster by about 20%. You want to minimize code changes. What is the most effective first step?

A) Increase the instance size by one step
B) Switch to Graviton-based instances (e.g., c6g/c7g) — ARM-based and about 20% cheaper, and interpreted/runtime languages such as Node mostly run without recompilation
C) Switch all instances to Spot
D) Rewrite everything in Lambda

**Answer: B**

---

**Question 4.** An API server running on a t3.medium slows down sharply every afternoon, and its CPU graph looks flattened as if capped at 20%. There is no AWS outage. What is the cause and the correct fix?

A) Insufficient network bandwidth
B) CPU credits are exhausted and it is held at the baseline (20%) — changing to the M/C family is the standard fix
C) Insufficient disk IOPS — change to gp3
D) Memory leak — restart the instance

**Answer: B**

---

**Question 5.** In an account with hundreds of gp2 EBS volumes, you want to immediately cut storage cost by about 20% and also improve performance, with no downtime. What should you do?

A) Take snapshots of all volumes and restore them to smaller volumes
B) Convert gp2 to gp3 with no downtime using `modify-volume` — about 20% cheaper per GB, and it guarantees a baseline of 3,000 IOPS and 125 MB/s regardless of size
C) Change the volumes to io2
D) Move the volumes to S3

**Answer: B**

---

**Question 6.** Compute Optimizer rated an instance "Optimized," but traffic is expected to increase 5x next month because of a large promotion. How should this recommendation be handled?

A) Trust it as is, because Compute Optimizer recommendations are always accurate
B) Compute Optimizer looks only at the past 14 days of data and does not know about future load increases, so the recommendation must be adjusted to account for the planned traffic spike
C) Ignore the recommendation and terminate the instance
D) Reduce the 14 days to 1 day and re-analyze

**Answer: B**

---

**Question 7.** Running 100 independent services together in one large shared instance pool can safely achieve a higher average utilization than isolating each service on its own instance. What is the theoretical basis for this?

A) AWS gives an automatic discount when the pool is large
B) Statistical multiplexing — the more independent workloads there are, the lower the probability of simultaneous peaks (law of large numbers), so the overall peak is smaller than the sum of the individual peaks
C) Larger instances are always faster
D) Auto Scaling ignores utilization

**Answer: B**

---
