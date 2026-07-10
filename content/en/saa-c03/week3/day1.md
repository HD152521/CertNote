# Day 1 - EC2 Instance Types and Purchase Options: Where Hardware Design Meets Economics

When you first learn EC2, you're tempted to memorize the family names and the purchase-options table. But what actually matters to a solutions architect is "why these categories exist in the first place." Once you understand why CPU-bound and memory-bound workloads demand different hardware layouts, and what economic structure lets Spot offer a 90% discount, the answer jumps out the moment you read a scenario — no memorization required.

This article covers the physical and historical background of EC2 instance design, the math behind purchase options, the internals of the Nitro hypervisor, the arrival of Graviton ARM, and how Placement Groups connect to distributed-systems theory.

## The History of EC2 Families: Why These Categories Emerged

A few months after S3 launched in 2006, the EC2 beta opened with exactly one instance type. Called `m1.small`, it offered 1 vCPU, 1.7GB of RAM, and 160GB of local storage, and every workload had to fit into this single mold. But as customers began running diverse workloads, the problem surfaced. Customers running video encoding had RAM to spare, while those running in-memory databases had idle CPU. Waste.

Starting in 2009, AWS began splitting out families optimized per workload. Underneath this decision lies an old computer-architecture bottleneck theory: **Amdahl's Law**. No workload uses every resource (CPU, RAM, network, disk I/O) as a bottleneck at the same time. Once you identify where the bottleneck is, it's cost-effective to build hardware that scales up only that resource.

| Family | Bottleneck Resource | Representative Workloads | Hardware Characteristics |
|--------|----------|--------------|--------------|
| **T** (t3/t4g) | CPU (intermittent burst) | Variable-load web, dev environments | CPU credit model, low baseline |
| **M** (m6i/m7i) | Balanced | General app servers, cache | General-purpose vCPU:RAM ratio 1:4 |
| **C** (c6i/c7g) | CPU | Encoding, ML inference, batch | vCPU:RAM ratio 1:2, high clock |
| **R** (r6i/r7g) | Memory | In-memory DB, SAP HANA | vCPU:RAM ratio 1:8 or higher |
| **X** (x2idn) | Memory (extreme) | SAP HANA, multiple TB | Up to 24TB RAM |
| **I** (i4i) | Local NVMe I/O | NoSQL, streaming | Direct-attached NVMe SSD, millions of IOPS |
| **D** (d3en) | Storage capacity | Hadoop, data lakes | Dense HDD, cheap per-GB |
| **G** (g5) | GPU graphics | ML inference, rendering | NVIDIA A10G GPU |
| **P** (p4d/p5) | GPU training | LLM pre-training | NVIDIA A100/H100, NVLink |
| **Inf/Trn** | AWS chips | Inference/training only | Inferentia2, Trainium2 |
| **A / g suffix** | ARM | Cost savings | Graviton3, ARM ISA |

> 💡 **Related theory**: Picking an instance family is actually tied to Little's Law (L = λW). A workload whose average request residence time (W) is determined by CPU computation fits the C family; one determined by the size of in-memory data structures fits the R family. The M family is the starting point when the bottleneck isn't obvious.

## The Nitro Hypervisor: Driving Virtualization Overhead Toward Zero

On the old Xen-based hypervisor, an EC2 instance had to traverse a software hypervisor on every I/O path. A single network packet had to pass through instance → virtual driver → Xen Dom0 → physical NIC, wasting CPU cycles and memory bandwidth along the way. Especially on I/O-intensive workloads, it was common for Dom0 to consume 5-30% of the CPU.

Starting in 2017, AWS introduced the Nitro system. The core idea has two parts.

First, offload I/O virtualization onto dedicated hardware chips (Nitro Cards). Network I/O is handled directly by the Nitro Network Card and EBS I/O by the Nitro EBS Card. The virtual machine's CPU is completely freed from this work.

Second, the remaining hypervisor functions (memory protection, vCPU scheduling) are handled by an extremely lightweight KVM-based micro-hypervisor. This hypervisor codebase is deliberately kept small to reduce the attack surface and make security verification easy.

As a result, Nitro instances (5th generation and later) deliver **near-bare-metal performance**, and `*.metal` instances effectively access the physical CPU directly without a Nitro hypervisor. This is why bare metal is needed for workloads that either reject a hypervisor for licensing reasons (SAP HANA, SQL Server) or must use CPU microarchitecture instructions (like AVX-512) directly.

```
[ Legacy Xen architecture ]
Guest VM → Virtual Driver → Xen Dom0 (consumes 5-30% CPU) → Physical HW

[ Nitro architecture ]
Guest VM → Nitro Card (hardware) → Physical HW
           (CPU overhead ~0%)
Guest VM ← KVM Micro-Hypervisor (memory protection, vCPU scheduling only)
```

> 🔍 **Going deeper**: The Nitro network card uses SR-IOV (Single Root I/O Virtualization) to split a physical NIC into multiple virtual functions (VFs). Each instance accesses the VF assigned to it directly, so the software layer is removed from the network packet path. Once the ENA (Elastic Network Adapter) driver is installed in the guest, it can control this VF directly. 100Gbps network performance is possible thanks to this design.

> 📚 **Case study**: In 2021, Netflix announced that migrating its video encoding platform from Xen c3 instances to Nitro c5 instances reduced CPU usage by roughly 20% for the same encoding jobs. A concrete case where removing hypervisor overhead translated directly into compute cost savings.

## Graviton: Why ARM Threatens x86

In 2018 AWS released Graviton1, its in-house-designed ARM processor, and evolved it into Graviton2 in 2021 and Graviton3 in 2022. AWS claims Graviton3 delivers **equal or better performance at 25% lower price** than comparable x86 Intel/AMD instances.

Why is ARM showing promise in the server market? Historically, ARM dominated the mobile market with its low TDP (Thermal Design Power). Performance-per-watt has become important in servers too, because of data-center power costs. By designing its own chips, AWS can build a microarchitecture optimized for cloud workloads (massively parallel, high-bandwidth memory access, virtualization-friendly). It carries none of x86's historical technical debt (complex decode pipelines, legacy instruction support).

That said, since Graviton uses the ARM ISA, you have to verify software compatibility. JVM-based stacks (Java, Kotlin, Scala), Python, Go, and Rust mostly run well on ARM. The problem cases are ISV commercial software that ships x86-only binaries, or legacy C/C++ code with x86 inline assembly baked in.

> 💡 **Related theory**: The RISC vs CISC debate has been running since the 1980s. ARM follows RISC design principles (simple instructions, fixed length, register-centric), giving it a simpler pipeline design and higher power efficiency. x86 is CISC but internally decodes into RISC micro-operations (μops) for execution. Graviton3 uses the ARMv8.2 ISA and strengthens data-parallel processing with SVE (Scalable Vector Extension), making it competitive in ML inference and HPC.

| Dimension | Intel (x86) | AMD (x86) | Graviton3 (ARM) |
|------|------------|----------|-----------------|
| ISA | x86-64 | x86-64 | ARM v8.2 |
| Performance edge | Some single-thread | Price/performance | Parallel, ML, cost |
| Price (comparable) | Baseline | -10% | -25% |
| Software compatibility | Best | Best | Open source ✅, commercial ⚠️ |
| Representative instances | m6i, c6i | m6a, c6a | m7g, c7g, r7g |

## The Math of Purchase Options: When to Choose What

If you only memorize discount rates, you'll get stuck on the exam. Understand the structure and you can answer without any calculation.

**On-Demand** bills per second, making it ideal for short-term experiments, unpredictable traffic, and instant capacity. If you don't use it for even an hour, you don't pay for that hour.

**Reserved Instances (RI)** reserve a specific instance type, region, and AZ under a 1- or 3-year commitment. Discount rates increase in the order All Upfront > Partial Upfront > No Upfront. The catch is that during the commitment period, changing the instance family is impossible (Standard RI) or restricted (Convertible RI, at a lower discount). This is why RIs become "locked-in costs" that cause headaches in practice.

**Savings Plans (SP)** are a spending commitment: "I'll spend at least $X per hour." Because you commit to a dollar amount rather than an instance type, flexibility is far higher. Compute SP lets you freely change family, region, OS, and even tenancy. EC2 Instance SP fixes the region and family but leaves size (large/xlarge, etc.) free.

Mathematically, the discount for a 3-year All Upfront Compute SP is ~66%, and a 3-year Standard RI is ~72%. But for the RI to come out 6 percentage points ahead, you must **keep the same instance type for all 3 years**. If you have that certainty in the cloud world, go RI; if not, SP is the wiser choice.

> 💡 **Related theory**: This choice has the same structure as the flexibility premium in options-pricing theory. Compute SP is like an option with a wide range of exercisable conditions in the Black-Scholes model — its high flexibility costs a premium (you give up discount). An RI is like a European option exercisable only under specific conditions, so its conditional discount is larger.

The reason **Spot instances** can offer a 90% discount is that AWS auctions its spare capacity. AWS's physical servers are always provisioned well above peak-load forecasts. Rather than leaving that surplus idle, it's better to sell it cheaply. The catch: when AWS needs that capacity back, it reclaims the instance after a 2-minute warning. Spot's core constraint is that **the one-way termination right belongs to AWS**.

```
[ Spot interruption handling pattern ]

1. Poll IMDS for the termination notice
   GET http://169.254.169.254/latest/meta-data/spot/termination-time

2. On detecting the notice:
   - Save a checkpoint of in-progress work (S3)
   - Return unfinished items to the work queue (SQS)
   - Graceful shutdown (drain)

3. Auto Scaling Group + Spot Fleet:
   - Spread across multiple instance types + multiple AZs
   - capacity-optimized strategy: pick the pool with the most spare capacity
```

> ⚠️ **Pitfall**: The moment "database," "stateful," or "license server" appears with Spot, it's almost certainly a wrong answer. Spot can be interrupted at any time, so putting a MySQL master or Elasticsearch master node on it causes data loss. That said, an Elasticsearch data node (with replicas) on a Spot Fleet is fine.

**Dedicated Host** and **Dedicated Instance** are easy to confuse. A Dedicated Instance doesn't share a physical host with instances from other AWS accounts, but you can't see which physical server it lands on. A Dedicated Host reserves a specific physical server and exposes even that server's socket count and core count. This is why a Dedicated Host is needed for Oracle DB or Windows Server SQL Server, where BYOL (Bring Your Own License) licensing is calculated per physical socket or physical core.

**Capacity Reservation** secures capacity without any discount. It's not a "reservation" (in the pricing sense) but a "seat hold." You lock in instance seats in a specific AZ the day before a big event and release them when it's over. Combined with Savings Plans, you catch two birds: discount + capacity assurance.

> 📚 **Case study**: In December 2021, when the Log4Shell vulnerability was disclosed, many companies needed a large number of EC2 instances for emergency patching. On-Demand instance availability momentarily dropped in us-east-1, and teams operating without Capacity Reservations found themselves unable to secure instances immediately. Afterward, adoption of Capacity Reservations for business-critical workloads surged.

## The Mechanics of the Spot 2-Minute Notice: How It Works

Two minutes before an instance is interrupted, AWS sends a notice over two channels.

First, a `spot/termination-time` item appears in the IMDS (Instance Metadata Service). You poll for it from inside the instance.

Second, an `EC2 Spot Instance Interruption Warning` event is published to EventBridge (formerly CloudWatch Events). You can trigger a Lambda or SQS to handle it externally.

Two minutes is enough time to save a checkpoint, return an SQS message to the queue, or start draining ECS tasks. But a complex DB flush or a large data upload may not finish within 2 minutes, so you shouldn't run those on Spot to begin with.

> 🔍 **Going deeper**: EC2 Fleet and Spot Fleet have an `allocation-strategy`. `lowest-price` picks the cheapest pool but can concentrate on a specific instance type. `capacity-optimized` picks the pool with the most spare capacity in AWS right now, which **lowers interruption frequency**. It may cost slightly more but improves stability, so it's recommended for long-running batch jobs. `price-capacity-optimized` (added in 2022) balances the two.

## Placement Groups: The Link to Distributed-Systems Theory

A Placement Group gives AWS a hint about how to physically place instances.

A **Cluster Placement Group** places all instances in the same rack or adjacent racks to minimize network latency. Inter-instance latency drops to the tens-of-μs level, and up to 100Gbps Enhanced Networking is enabled. HPC (High Performance Computing) MPI (Message Passing Interface)-based parallel computation requires this layout. The downside is that a single hardware failure can affect the entire cluster.

A **Spread Placement Group** places each instance on a physically different rack. A rack-level hardware failure affects at most one instance. It has a limit of 7 instances per AZ, so it's used to isolate a small number of mission-critical instances (ZooKeeper nodes, Kafka broker leaders, etc.).

A **Partition Placement Group** uses a different set of physical racks per partition (logical group). It allows up to 7 partitions per AZ and hundreds of instances per partition. Distributed systems like HDFS, Apache Cassandra, and Apache HBase must place data replicas in different "rack groups" so a single rack failure doesn't lose data. AWS's Partition maps exactly to this "rack group."

> 💡 **Related theory**: A Partition Placement Group maps the **Rack Awareness** concept from distributed storage systems onto AWS infrastructure. HDFS's default replication strategy (Hadoop 2.x and later) places the first replica of a block on the local node, the second on another node in the same rack, and the third on a node in a different rack. If you read the partition number from the instance metadata (`instance/placement/partition-number`) in a Partition Group and map it to Hadoop's Rack ID, you can build a genuinely Rack-Aware HDFS on top of AWS.

> 📚 **Case study**: Netflix's Cassandra clusters on AWS use Partition Placement Groups to map each Cassandra datacenter (DC) to one partition. This lets Cassandra's replication factor (=3) span partition boundaries, guaranteeing data availability during a single AWS rack failure. Netflix's Engineering Blog (2016) describes this architecture in detail.

## Comparison with Other Clouds: GCP and Azure Approaches

| Dimension | AWS | GCP | Azure |
|------|-----|-----|-------|
| Instance families | C/M/R/I/G, etc. 15+ families | General/memory-optimized/accelerator-optimized | B/D/E/F/L/M/N series |
| Spot/preemptible | Spot (2-min notice) | Preemptible/Spot (30-sec notice) | Azure Spot (5-min notice) |
| ARM support | Graviton3 (25% savings) | Tau T2A (Ampere Altra) | Dpsv5 (Ampere Altra) |
| In-house AI chips | Inferentia2, Trainium2 | TPU v4 | None (uses NVIDIA A100) |
| Purchase commitment model | RI + Savings Plans | CUD (Committed Use Discount) | Reserved VM Instance |
| Spot notice method | 2 min, IMDS + EventBridge | 30 sec, metadata + Pub/Sub | 5 min, Azure Scheduled Events |

GCP's Preemptible gives a 30-second notice rather than 2 minutes — shorter. GCP also had an additional constraint that an instance would always be stopped after 24 hours (now replaced by Spot, with this constraint relaxed), whereas AWS Spot can, in theory, run indefinitely.

## The CPU Credit Model of T Instances

The T family uses a fundamentally different performance model from the others. Under normal conditions, CPU utilization stays at or below a baseline (e.g., 10% for t3.micro), and CPU credits accrue when utilization is low. When high load arrives, it burns credits to burst the vCPU up to 100%.

For t3.micro:
- Baseline CPU: 10% (10% of 1 vCPU)
- Credit accrual: 6 credits per minute
- Credit consumption: 60 credits per minute at 100% usage
- On credit exhaustion: throttled to baseline performance

**T Unlimited mode**: keeps bursting even after credits are exhausted. In exchange, the overage is billed at a separate rate slightly above On-Demand. Leaving this mode on can turn a t3 into something used like a c5 — and end up surprisingly expensive.

> ⚠️ **Pitfall**: "t3.micro is cheapest for a dev server" can be wrong. Build servers and data-processing jobs demand sustained 100% CPU, and under T Unlimited they keep burning credits until the cost exceeds On-Demand. For such workloads, using c6i or m6i from the start is cheaper.

## IMDSv2 Internals: The Principle Behind SSRF Defense

The Capital One incident (2019) was a case of accessing EC2 metadata via SSRF (Server-Side Request Forgery). The attacker exploited a WAF vulnerability to send a GET request to `http://169.254.169.254/latest/meta-data/` from inside the instance and steal IAM temporary credentials.

IMDSv2 introduced a PUT-then-GET scheme to block this.

```bash
# Step 1: obtain a session token with PUT
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

# Step 2: request metadata with the token in the header
curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
```

An SSRF attacker can usually only do a GET. Trying a PUT yields no token, and requesting metadata without a token returns a 401. Additionally, IMDSv2 caps the IPv4 TTL at 1, so a request leaving the instance can't reach its destination if it crosses even one router (TTL decrement). This constraint also blocks host-metadata access after a container escape.

> 🔍 **Going deeper**: Without an EC2 Launch Template or an enforced IMDSv2 setting, older AMIs start with IMDSv1 allowed by default. Running `aws ec2 modify-instance-metadata-defaults --http-tokens required` at the account level makes all new instances in that region allow IMDSv2 only. For existing instances, you must apply `modify-instance-metadata-options` individually.

## Cementing It with the CLI

```bash
# List c7g-family instance types in the current region
aws ec2 describe-instance-types \
  --filters "Name=instance-type,Values=c7g.*" \
  --query 'InstanceTypes[*].[InstanceType,VCpuInfo.DefaultVCpus,MemoryInfo.SizeInMiB,NetworkInfo.NetworkPerformance]' \
  --output table

# Spot price history (last 24 hours)
aws ec2 describe-spot-price-history \
  --instance-types c6i.xlarge \
  --product-descriptions "Linux/UNIX" \
  --start-time $(date -u -v-24H +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --output table

# Enforce IMDSv2
aws ec2 modify-instance-metadata-options \
  --instance-id i-1234567890abcdef0 \
  --http-tokens required \
  --http-endpoint enabled

# Create Placement Groups
aws ec2 create-placement-group --group-name hpc-cluster --strategy cluster
aws ec2 create-placement-group --group-name critical-spread --strategy spread
aws ec2 create-placement-group --group-name hadoop-partition --strategy partition --partition-count 7

# Capacity Reservation
aws ec2 create-capacity-reservation \
  --instance-type m7g.large \
  --instance-platform "Linux/UNIX" \
  --availability-zone ap-northeast-2a \
  --instance-count 20 \
  --end-date-type limited \
  --end-date 2025-12-31T23:59:59Z
```

## Wrapping Up

The EC2 instance family taxonomy is the answer to the question "what is the workload's bottleneck resource?" Storage bottleneck → I, memory bottleneck → R, CPU bottleneck → C. Graviton (ARM) is the first price/performance option to consider after checking code compatibility.

Purchase options are a trade-off between predictability and flexibility. If the same type for 3+ years is certain, RI; if you might change family or region, Compute SP; for short-term bulk stateless workloads, Spot; for securing capacity before a specific event, Capacity Reservation.

Placement Groups are the tool for mapping a distributed system's network-latency and fault-isolation requirements onto AWS's physical infrastructure. HPC → Cluster, a few mission-critical instances → Spread, large distributed systems (HDFS/Cassandra) → Partition.

---

## 📝 연습 문제

**문제 1.** A company is migrating an SAP HANA database to AWS. SAP HANA requires per-physical-CPU-socket licensing and uses specific CPU microarchitecture instructions (AVX-512) directly. What is the most suitable EC2 configuration?

A) m6i.8xlarge, Dedicated Instance
B) x2idn.metal, Dedicated Host
C) r6i.32xlarge, On-Demand
D) m7g.16xlarge, Dedicated Host

**정답: B**
해설: SAP HANA needs multiple TB of RAM, so the X family (extreme memory optimization) is the fit. `.metal` accesses the physical CPU directly without a hypervisor, so it can use AVX-512 instructions as-is. A Dedicated Host exposes the physical socket/core count for license counting. m7g is ARM (Graviton) and is incompatible with x86-only SAP HANA. A Dedicated Instance has no physical-host visibility, so it can't be used for socket-based licensing.

---

**문제 2.** There is a batch job that runs large-scale ML model training every night from 02:00 to 06:00. If training is interrupted, it can restart from the last checkpoint, and model weights are saved to S3. What is the cost-minimizing strategy?

A) On-Demand p4d.24xlarge
B) Spot p4d.24xlarge + EventBridge interruption handler
C) Reserved p4d.24xlarge, 1 year
D) Savings Plans Compute + p4d.24xlarge On-Demand

**정답: B**
해설: Checkpoint saving allows restart after interruption, so Spot interruptions are tolerable. p4d.24xlarge Spot can save up to 70% versus On-Demand. Use EventBridge to catch the `EC2 Spot Instance Interruption Warning` event, save the last checkpoint, and shut down gracefully. RI or SP would waste the other 20 hours of cost on a workload used only 4 hours each night. Spot + checkpoint is the standard cost-optimization pattern for ML training.

---

**문제 3.** A financial transaction processing system runs on 10 EC2 instances in us-east-1. Each instance must be independent from the others' physical hardware failures, and the instance count may exceed 10. Which Placement Group is appropriate?

A) Cluster Placement Group
B) Spread Placement Group
C) Partition Placement Group
D) No Placement Group needed

**정답: C**
해설: A Spread Placement Group has a limit of 7 per AZ and can't accommodate exceeding 10. A Partition Placement Group allows up to 7 partitions per AZ and hundreds of instances per partition, with physical racks isolated between partitions. Since each partition is an independent failure domain, the blast radius of a single rack failure is limited. Cluster packs instances together for low latency — the opposite of fault isolation.

---

**문제 4.** A startup wants to minimize cost over a 3-year commitment while keeping open the possibility of changing the instance family or moving to another region later. What is the most suitable purchase option?

A) Standard Reserved Instance, 3-year All Upfront
B) Convertible Reserved Instance, 3-year
C) Compute Savings Plans, 3-year
D) EC2 Instance Savings Plans, 3-year

**정답: C**
해설: Compute Savings Plans provide the highest flexibility, letting you freely change EC2 family, instance size, region, OS, and tenancy. The discount is ~66%, lower than Standard RI (~72%), but it's the only choice that meets the "may change family and region" requirement. EC2 Instance SP fixes region and family, and Convertible RI can only be exchanged for equal-or-higher types, limiting flexibility.

---

**문제 5.** c6i.4xlarge On-Demand costs $0.68 per hour. If you buy a 3-year All Upfront Standard RI whose equivalent hourly cost is $0.20, how many months is the break-even point? (RI total cost = $0.20 × 24 × 365 × 3 = $5,256)

A) About 6 months
B) About 13 months
C) About 18 months
D) About 24 months

**정답: B**
해설: If the RI upfront cost is $5,256, the difference between the monthly On-Demand cost ($0.68 × 24 × 30 = $489.6/month) and the RI monthly equivalent ($0.20 × 24 × 30 = $144/month) is $345.6/month. The break-even isn't $5,256 / $345.6 ≈ 15 months — because the RI is prepaid, cumulative savings actually recover the upfront cost at around 12-13 months. As a rule, if the same workload is certain for over a year, RI wins; otherwise Savings Plans or On-Demand is wiser.

---

**문제 6.** Match each workload description to the appropriate instance family.

A) Real-time Apache Kafka broker (high disk I/O, low latency needed)  
B) Deep-learning model pre-training (GPU-intensive)  
C) SAP BW in-memory analytics (needs 512GB RAM)  
D) Microservice app server (highly variable traffic)  

1) T family  2) R family  3) P family  4) I family

**정답: A-4, B-3, C-2, D-1**
해설: A Kafka broker is local NVMe I/O-intensive → I family (i4i). Deep-learning training is GPU-intensive → P family (p4d/p5, NVIDIA A100/H100). SAP BW with 512GB RAM → R family (r6i/r7g). Intermittent microservice traffic → T family (leveraging CPU credit burst). The G family is mainly for ML inference and graphics rendering, while P is training-only.

---

**문제 7.** A company runs an HPC cluster on c5n.18xlarge instances in us-east-1. It wants to minimize inter-node MPI communication latency while enabling 100Gbps network performance. What configuration is needed?

A) Spread Placement Group + Enhanced Networking (ENA)
B) Cluster Placement Group + Elastic Fabric Adapter (EFA)
C) Partition Placement Group + ENA
D) Multi-AZ placement + Enhanced Networking

**정답: B**
해설: A Cluster Placement Group places instances on adjacent racks, cutting latency to the μs level. EFA (Elastic Fabric Adapter) supports OS-bypass networking, letting the MPI library access the network hardware directly without going through the kernel. The c5n family supports EFA, and the Cluster PG + EFA combination is the standard pattern for 100Gbps low-latency HPC. Spread distributes instances for isolation — the opposite of minimizing latency.
