# Day 1 - Compute Optimizer: How 14 Days of Metrics Re-Size Your Instances

The most expensive mistake in the cloud is not an outage but **neglect**. Someone launched an m5.4xlarge "with plenty of room" three years ago, the service running on it would actually be fine on an m5.large, and nobody ever looks at it again. An instance with 4% average CPU utilization is billed at full price 24 hours a day, 365 days a year. In the on-premises era this kind of waste was hard to see: the server was already bought, so it was a sunk cost. But the cloud bills by the hour, so over-provisioning lands directly on the invoice. **Right Sizing** is the work of closing this gap, that is, the distance between "provisioned capacity" and "capacity actually used."

The problem is that humans find this distance hard to measure by eye. If you look only at CPU you miss memory, if you look only at the average you miss the peak, and if you look at one instance you miss the other 200. **AWS Compute Optimizer** hands this judgment to ML: it learns from 14 days of metrics and automatically produces "this instance can be reduced to m5.large, saving $X per month." This article digs into where that recommendation comes from, why the recommendation goes off when memory metrics are missing, and what hardware the alphabetic codes of EC2 instance families actually point to.

## The Roots of Right Sizing - Statistical Multiplexing and the History of Over-Provisioning

Over-provisioning is not a problem the cloud created but one the cloud **revealed**. In the data center era, average server utilization varied by industry survey but generally stayed around **10-15%**. The reason is simple: you had to buy for the peak. To withstand Black Friday traffic you bought that capacity for the whole year and left it idle 364 days. Virtualization (VMware) raised this utilization by placing multiple VMs on one physical server, but the underlying structure of "buying for the peak" remained.

The promise of the cloud was to flip this structure: rent when you need it and turn it off when you do not (elasticity). But human habits do not change. People size "with plenty of room" as they did on-premises and forget to turn things off. So utilization in the 10% range is common in the cloud too. The only difference is that this waste is now **visible, converted into money every hour**. Right Sizing is ultimately about changing the habit of "buying for the peak" into "buying for what is measured," and Compute Optimizer is the tool that does that measuring automatically.

The theoretical foundations of Right Sizing are statistical multiplexing and queueing theory. The key insight is that "if you pool many independent workloads, the overall peak is much smaller than the sum of the individual peaks." If 100 services each peak at different times, the probability that all of them peak at the same time is nearly zero (the law of large numbers). So the more you pour into a big pool, the safer it is to run at a high average utilization. Conversely, if you isolate a single workload on its own instance, that instance has to be sized for the peak, so its utilization is bound to be low. The M/M/1 model of queueing theory shows that as utilization (ρ) approaches 1, waiting time explodes **nonlinearly**, which is why the safe target utilization is usually 70-80%, not 100%. This is why Compute Optimizer recommends "leaving a little headroom" rather than "an exact fit."

## What Does Compute Optimizer Learn - 14 Days, Percentiles, and ML

Compute Optimizer's recommendations take "the last 14 days of CloudWatch metrics" as input. Why 14 days specifically? If it is too short (for example, 1 day), it is swayed by incidental traffic fluctuation and gives wrong recommendations, and if it is too long it cannot reflect recent workload changes. Two weeks is a window in which you can observe the weekly cycle (weekday vs weekend pattern) at least twice: only after seeing both Monday's peak and Sunday's valley do you know "the true shape of this instance."

Internally, Compute Optimizer does not look only at averages. It looks at the **percentile distribution** of CPU, memory, network, and disk metrics. Even if average CPU is 10%, if P99 (the top 1% of moments) is 95%, it means the instance occasionally spikes to its limit, and shrinking it carelessly would collapse performance at that peak. The ML model compares this distribution against a database of performance characteristics by EC2 instance type to find "the smallest vessel that can hold this workload's shape." The result comes out as three Findings.

| Finding | Meaning | Operational action |
|---------|------|-----------|
| **Over-provisioned** | The vessel is too large: excessive headroom in both CPU and memory | Downsize (cost savings) |
| **Under-provisioned** | The vessel is too small: risk of performance degradation from resource shortage | Upsize or change family |
| **Optimized** | Right-sized: headroom is appropriate | Keep |

Supported targets started with EC2 instances and gradually widened: EC2 Auto Scaling Groups, EBS volumes, Lambda functions, ECS Fargate services, RDS DB instances, and even commercial software licenses (core count optimization for SQL Server and so on). Basic analysis is free, and the Enhanced tier (for EC2, paid) provides external metrics integration and a longer lookback.

Compute Optimizer's biggest blind spot is **memory**. EC2's standard CloudWatch metrics include CPU, network, and disk but have **no memory utilization**. The reason is that, at the hypervisor level, you cannot look inside the guest OS's memory usage: the hypervisor knows how much physical memory it allocated to the VM but not how much the OS uses inside (whether it is cache or real usage). So to get memory metrics you must **install the CloudWatch Agent inside the guest OS** and push `mem_used_percent` directly. Without the Agent, Compute Optimizer leaves memory as an "unknown value" and recommends from CPU and network alone, and in this case a dangerous misjudgment occurs: it advises downsizing a memory-bound workload (for example, Redis, or an app with a large JVM heap) by looking only at CPU. If in operations a Compute Optimizer recommendation seems really strange, nine times out of ten the Agent is missing and memory is left out.

> ⚠️ **Trap**: Compute Optimizer sees **only the current workload shape**; it knows nothing about future growth or features about to launch. Even if it looks at P99 and says "Optimized," if traffic is scheduled to jump 5x next month because of a promotion, that recommendation is meaningless. And if you apply a downsizing recommendation as is, headroom shrinks and you become vulnerable to sudden spikes. If the exam asks "we applied the Compute Optimizer recommendation and a performance problem occurred," the answer is usually "the recommendation is based on the past 14 days, so it did not reflect future load growth or the absence of memory metrics."

## EC2 Instance Families - The Real Hardware a Single Letter Points To

Instance type names look like ciphers but are in fact a well-designed classification system. Taking `c7gn.2xlarge` apart gives five pieces.

```
c   7   g n   .   2xlarge
│   │   │ │       └─ Size (multiple of vCPU/memory)
│   │   │ └──────── Additional capability (n = network enhanced)
│   │   └────────── Processor (g = Graviton/ARM)
│   └────────────── Generation (a larger number is newer)
└────────────────── Family (c = compute optimized)
```

The family letter determines the **ratio of CPU cores to memory** and which accelerators or storage are attached. This ratio must match the workload shape for there to be no waste.

| Family | Approx. vCPU:memory | Best suited for | Examples |
|--------|------------------|-------------|------|
| **T (Burstable)** | Varies | Workloads that are usually idle and occasionally spike | t3.medium, t4g.large |
| **M (General)** | 1:4 | Balanced general purpose: web and app servers | m6i.xlarge, m7g.large |
| **C (Compute)** | 1:2 | CPU-bound: encoding, HPC, batch | c7g.xlarge, c6i.large |
| **R (Memory)** | 1:8 | Memory-bound: in-memory DBs, caches | r6i.xlarge, r7g.large |
| **X (High Memory)** | 1:16+ | Very large in-memory: SAP HANA | x2idn.16xlarge |
| **I (Storage IO)** | NVMe local SSD | High IOPS: NoSQL, data warehouses | i4i.large |
| **D (Dense Storage)** | Dense HDD | Large sequential IO: distributed file systems | d3.xlarge |
| **G / P (GPU)** | GPU attached | Graphics (G) / ML training (P) | g5.xlarge, p4d.24xlarge |
| **Inf / Trn** | AWS's own chips | ML inference (Inferentia) / training (Trainium) | inf2.xlarge, trn1.32xlarge |
| **HPC** | Maximized network and cores | Tightly coupled cluster computation | hpc7g.16xlarge |

The memorization trick is simple. **M** is Medium (balanced), **C** is Compute (CPU), **R** is RAM (memory), **I** is IO, and **G/P** is GPU. The first letter is the purpose. On the exam, when "memory-intensive in-memory cache" appears, R is the starting point of the answer; "CPU-intensive batch" is C; and "balanced web server" is M.

Choosing a family is really a **problem of identifying the bottleneck resource**. In computer architecture, workloads are classified as CPU-bound / memory-bound / IO-bound / network-bound depending on which resource saturates first. As Amdahl's law says, system performance is determined by the slowest (first-to-saturate) part: even if you double the CPU, performance barely rises if memory is the bottleneck. The family letter is ultimately a choice of "which resource to provide in abundance." If you put a memory-bound workload on the C family (rich CPU, poor memory), memory runs short and swapping occurs, and the expensive CPU sits idle while performance hits rock bottom. This is why Right Sizing is not just "reducing size" but also includes "changing the family": the wrong family is inefficient at any size.

## Graviton - The Story of How AWS's Own ARM Chip Changed the Cost Curve

Instances with a `g` (c7**g**, m7**g**, r7**g**) use **Graviton**, a processor based on ARM that AWS designed itself. This is not just an option but an event that changed the economics of cloud computing.

For decades, server CPUs were practically an x86 (Intel, AMD) monopoly. ARM was strongly perceived as being for smartphones and embedded devices: good power efficiency but not server-class performance. AWS acquired the ARM server chip startup Annapurna Labs in 2015, then overturned this perception by releasing the first Graviton in 2018, Graviton2 in 2019, and then Graviton3/4. The key motive was the cost structure: remove the x86 licensing cost and design the chip yourself for cloud workloads (many cores, moderate single-thread performance), and you can deliver the same performance cheaper and more power-efficiently. As a result, Graviton instances are roughly **20% cheaper than comparable x86 with better price-performance.**

The price is **architecture compatibility**. ARM and x86 have different instruction set architectures (ISAs), so native binaries compiled for x86 do not run as-is on ARM. Fortunately, containers and interpreted languages (Java, Node, Python, Go, .NET, and so on) have a runtime/JIT that absorbs the architecture difference, so most work without recompiling. Only native extensions written in C/C++ or libraries specific to one architecture get stuck. So the practical pattern for moving to Graviton is "build and test with an ARM AMI in staging → switch to production if compatible."

Graviton adoption is no longer an experiment. At re:Invent 2023, AWS said that "more than 50% of the EC2 capacity launched in the last two years is Graviton-based," and companies such as Snap, Twilio, and SmugMug moved large workloads to Graviton and reported double-digit cost savings as public case studies. AWS's own managed services (Lambda, Fargate, RDS, ElastiCache, OpenSearch) also offer Graviton options, and there users do not even need to think about the architecture, because AWS has built the runtime for ARM in advance. From the SOA exam's perspective, when the keyword "reduce Node.js/Java microservice cost by 20%" appears, a Graviton switch is almost always the answer.

## The Trap of the T Family - The Credit Trade Called CPU Credits

T instances (t3, t4g, and so on) look the cheapest and so are most often chosen wrongly. The key is that T is **burstable**: it guarantees only a low baseline performance normally and delivers full performance with accumulated credits only when it occasionally spikes. If you do not understand this model, you will encounter mysterious performance degradation in operations.

How it works is a credit system called **CPU credits**. A t3.medium has a baseline of 20% per vCPU, meaning that normally you can use only 20% of a core. If utilization is below the baseline, credits accrue by the difference (a fixed amount per hour), and if utilization exceeds the baseline, it consumes the accrued credits and bursts up to 100%. It is a structure where you collect credits on idle nights and spend them in a burst during the day. The problem occurs **when the credits run out**: it can no longer burst and is forced down to the baseline (20%). The CPU graph is suddenly flattened as if it hit a 20% ceiling, and application responses slow sharply. The classic situation in which operators wonder "is this an AWS outage?" is exactly this credit exhaustion.

There are two ways out. **T3 Unlimited mode** keeps bursting even when credits run out but charges extra (per vCPU-hour) for the excess. This is reasonable for workloads that occasionally spike, but under consistently high load these extra charges pile up and the M family ends up cheaper. So the standard approach is to **use the M/C families from the start for steady production workloads**, and to use T only where things are truly idle most of the time, such as dev servers and low-traffic internal tools.

> ⚠️ **Trap**: A T instance's baseline differs by size (5% for t3.nano, 20% for t3.medium, 40% for t3.xlarge, and so on). The principle is not "it's a T instance so slow is fine" but **steady load = no T**. If the exam asks "we put a production workload on t3 and performance drops sharply after a while," the answer is CPU credit exhaustion, and the fix is changing to the M/C family, not switching to Unlimited mode (because cost leaks).

## EBS Is Also a Right Sizing Target - Non-Disruptive Conversion from gp2 to gp3

Right Sizing is not applied only to instances. Compute Optimizer also analyzes **EBS volumes** and gives one of the most common recommendations: **converting gp2 → gp3**. This is an optimization that is close to free points on both the SOA exam and in practice.

The design problem of gp2 is that **IOPS are tied to volume size**. gp2 gives 3 IOPS per GB, so to get 3,000 IOPS you must create a 1,000 GB (1 TB) volume. You need only 100 GB, but you buy 1 TB for the IOPS, which is another form of over-provisioning. gp3 breaks this coupling. Regardless of size, it **guarantees a baseline of 3,000 IOPS and 125 MB/s**, and if you need more, you purchase IOPS and throughput independently of size. On top of that, the per-GB price is also about 20% cheaper than gp2.

| Item | gp2 | gp3 |
|------|-----|-----|
| IOPS | 3 IOPS per GB (tied to size) | Baseline 3,000 (independent of size, scales independently) |
| Throughput | Tied to IOPS | Baseline 125 MB/s (scales independently) |
| Cost per GB | Baseline | About 20% cheaper |
| Change | - | Non-disruptive conversion from gp2 is possible |

The best part is that the conversion is **non-disruptive**. If you change the volume type to gp3 with the `modify-volume` API, it changes online without stopping the instance (a background migration runs internally, and IOPS may drop slightly for a while during the change). No snapshot or recreation is needed. So in an "account with hundreds of gp2 volumes," converting to gp3 is a typical quick win that cuts the bill immediately with no downtime.

The reason gp3 can separate size from IOPS is that EBS's internal architecture changed. In the gp2 days, EBS performance was effectively a simple model proportional to the capacity of the backend storage media. gp3 redesigned the backend to provision performance as a dimension separate from capacity, so users can specify three values independently, such as "capacity 100 GB, IOPS 16,000, throughput 1,000 MB/s." This is taken even further in high-performance families such as io2 Block Express, which is based on NVMe over Fabrics and provides hundreds of thousands of IOPS and sub-millisecond latency on a single volume. From a Right Sizing perspective, the philosophy of gp3 is "do not buy performance bundled with capacity; buy exactly the performance you need."

## Wrapping Up

The starting point of cost optimization is almost always Right Sizing: before going to commitment discounts (Day 4), first check whether the vessel size is right to begin with. Applying a discount to the wrong size amounts to committing to the wrong cost for 3 years.

Here are the five things for operators to remember. (1) Compute Optimizer analyzes the percentile distribution of 14 days of metrics with ML to judge Over/Under/Optimized. (2) Memory metrics are not in the standard set, so you must install the **CloudWatch Agent** to get an accurate recommendation; without it, memory-bound workloads are misjudged. (3) The family letter determines the CPU:memory ratio and accelerators: M (balanced), C (CPU), R (memory), I (IO), G/P (GPU). You must choose a family that is rich in the bottleneck resource. (4) Graviton (`g`) is ARM-based and about 20% cheaper, and containers and interpreted languages are mostly compatible. (5) The T family is a CPU credit trade model: it is unsuitable for steady production load, and when credits run out it is tied to the baseline. For EBS, the non-disruptive gp2→gp3 conversion is a nearly free optimization.

In the next article, going beyond per-resource recommendations, we cover the structure of **Trusted Advisor**, which automatically checks an entire account across five categories (cost, performance, security, fault tolerance, and service limits), and the differences in access by Support plan.

---

## 📝 Practice Questions

**Question 1.** Compute Optimizer recommended "Over-provisioned, reduce to a smaller type" for an instance running a memory-intensive workload (a Redis cache). What is the biggest reason to doubt this recommendation?

A) Compute Optimizer does not support cache workloads

B) EC2 standard metrics have no memory utilization, so without the CloudWatch Agent it recommends from CPU and network alone without knowing memory, and can misjudge a memory-bound workload

C) 14 days is too short an analysis period

D) Redis cannot be downsized

**Answer: B**

Explanation: EC2's standard CloudWatch metrics include CPU, network, and disk but no memory utilization. This is because the hypervisor cannot look at memory usage inside the guest OS. To get memory metrics, you must install the CloudWatch Agent inside the guest OS and push `mem_used_percent`. Without the Agent, Compute Optimizer leaves memory as an "unknown value" and recommends from CPU alone, and for a memory-bound workload like Redis, memory can be full even when CPU utilization is low, so downsizing is risky. The reliability of the recommendation is directly tied to whether the Agent is installed.

---

**Question 2.** You must choose an instance family for a compute-intensive video encoding batch job. The job uses CPU at nearly 100% but uses little memory. Which family is most suitable?

A) R (memory optimized)

B) C (compute optimized) - a vCPU:memory ratio of 1:2 gives abundant CPU

C) T (burstable)

D) X (very high memory)

**Answer: B**

Explanation: Choosing a family is about matching the abundant resource to the bottleneck resource. A CPU-bound workload fits the C family (compute optimized): with a vCPU-to-memory ratio of about 1:2, it gives more CPU for the same price. R (A) has abundant memory but a higher price per CPU, which is wasteful for CPU-bound work. T (C) runs out of credits under steady high load. X (D) is for very large in-memory DBs. For work that burns CPU steadily, such as encoding, HPC, and scientific computing, C is the standard.

---

**Question 3.** You were told to cut the compute cost of a Node.js microservice cluster by about 20%. You want to minimize code changes. What is the most effective first attempt?

A) Increase the instance size by one step

B) Switch to Graviton-based instances (for example, c6g/c7g) - ARM-based and about 20% cheaper, and interpreted/runtime languages such as Node mostly work without recompiling

C) Switch all instances to Spot

D) Rewrite everything in Lambda

**Answer: B**

Explanation: Graviton is an ARM processor AWS designed itself, about 20% cheaper than comparable x86 with higher price-performance. The price is architecture compatibility, but for runtime/interpreted languages such as Node, Java, Python, Go, and .NET, the runtime absorbs the ARM difference, so most work without recompiling. The practical pattern is to build and test with an ARM AMI in staging and then switch to production. Increasing size (A) raises cost, a full switch to Spot (C) presupposes statelessness and tolerance to reclamation, and a Lambda rewrite (D) contradicts the requirement to minimize code changes.

---

**Question 4.** An API server running on a t3.medium slows sharply every afternoon and the CPU graph is flattened as if it hit a 20% ceiling. There is no AWS outage. What is the cause and the correct fix?

A) Insufficient network bandwidth - change to an instance with a larger network option

B) Tied to the baseline (20%) by CPU credit exhaustion - since it is steady production load, changing to the M/C family is the standard

C) Insufficient disk IOPS - change to gp3

D) Memory leak - restart the instance

**Answer: B**

Explanation: The T family is a burstable model: to use more than the baseline (20% for t3.medium), it consumes accumulated CPU credits. When a load that consistently exceeds the baseline is applied, credits run out, and from that moment the CPU is forced down to the baseline, so the graph hits a 20% ceiling. This is the classic case of mysterious performance degradation. You can keep bursting with T3 Unlimited mode, but the extra charges pile up, so for steady production load the standard is to go from the start to the M/C family, whose baseline is full-core performance.

---

**Question 5.** In an account with hundreds of gp2 EBS volumes, you want to cut storage cost by about 20% immediately without downtime and also improve performance. What should you do?

A) Take snapshots of all volumes and restore them to smaller volumes

B) Convert gp2 → gp3 non-disruptively with `modify-volume` - about 20% cheaper per GB and a guaranteed baseline of 3,000 IOPS and 125 MB/s regardless of size

C) Change the volumes to io2

D) Move the volumes to S3

**Answer: B**

Explanation: gp3 is about 20% cheaper per GB than gp2 and guarantees IOPS and throughput independently of volume size (baseline 3,000 IOPS and 125 MB/s). gp2 ties IOPS to size at 3 IOPS per GB, which causes over-provisioning, but gp3 broke this coupling. The conversion can be done online with the `modify-volume` API without stopping the instance, and no snapshot or recreation is needed. io2 (C) is a more expensive high-performance family and is overkill for the simple goal of cost savings. gp2→gp3 is a typical quick win with no downtime.

---

**Question 6.** Compute Optimizer judged an instance as "Optimized," but traffic is scheduled to rise 5x next month because of a large promotion. How should this recommendation be handled?

A) Compute Optimizer recommendations are always accurate, so trust them as they are

B) Compute Optimizer sees only the past 14 days of data and does not know about future load growth, so the recommendation must be adjusted to account for the planned traffic surge

C) Ignore the recommendation and terminate the instance

D) Reduce 14 days to 1 day and re-analyze

**Answer: B**

Explanation: Compute Optimizer's recommendation is a backward-looking analysis based on the measured metrics of the last 14 days. Information such as future traffic changes, features about to launch, and scheduled promotions is not in the input. Therefore an "Optimized" judgment is based only on the current workload shape, and if 5x traffic is scheduled, the operator must reflect that fact and secure more headroom. The tool's recommendation is an input to the decision, not the final answer. Re-analyzing over 1 day (D) would actually be swayed by incidental fluctuation and be less accurate.

---

**Question 7.** If you pool 100 independent services into a large shared instance pool (Auto Scaling Group), you can safely run at a higher average utilization than if you isolated each service on its own instance. What is the theoretical basis?

A) AWS automatically gives a discount when the pool is large

B) Statistical multiplexing - the more independent workloads, the lower the probability of a simultaneous overall peak (law of large numbers), so the overall peak is smaller than the sum of the individual peaks

C) Larger instances are always faster

D) Auto Scaling ignores utilization

**Answer: B**

Explanation: The core of statistical multiplexing is that the more independent workloads you pool, the more sharply the probability that they peak at the same time falls (law of large numbers). If 100 services each peak at different times, the chance that all peak at once is nearly zero, so the whole pool can accommodate everyone with far less capacity than the simple sum of the individual peaks. That is why a large shared pool is safe even at a high average utilization. Conversely, isolating each one alone forces each to be sized for its own peak, so utilization is bound to be low. This is the fundamental principle by which the cloud gains efficiency through resource pooling.

---

## 📌 Today's Summary

1. Compute Optimizer analyzes the percentile distribution of 14 days of metrics with ML to judge Over/Under/Optimized. It supports EC2, ASG, EBS, Lambda, Fargate, and RDS
2. Memory metrics are not in the EC2 standard set, so installing the CloudWatch Agent is the prerequisite for accurate recommendations; without it, memory-bound workloads are misjudged
3. Family letter = CPU:memory ratio + accelerators. M (balanced), C (CPU), R (memory), I (IO), G/P (GPU). Choose a family rich in the bottleneck resource
4. Graviton (`g`) is AWS's own ARM chip, about 20% cheaper, and containers and runtime languages are mostly compatible. The T family is a CPU credit trade model, unsuitable for steady load
5. For EBS, the non-disruptive gp2→gp3 conversion is a typical quick win: a 20% per-GB saving + better performance
