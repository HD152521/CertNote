# Day 4 - Four Compute Pillars in Depth: Revisiting Nitro, EBS, ELB, and Auto Scaling Through a Pro Lens

Calling EC2 a "virtual machine" is half the truth. To see the other half, today we briefly return to re:Invent in November 2017. The moment James Hamilton took the stage and said "We no longer use Xen" was EC2's second birth. Until then, EC2 was a simple KVM-ish cluster sitting on top of the Citrix Xen hypervisor, and with dom0 handling all I/O, 7-30% of host CPU was disappearing into virtualization overhead. That same year, Google had a similar problem in Compute Engine, and Microsoft Azure was struggling with the bloat of the Hyper-V root partition. But AWS went the direct route — **it put the hypervisor inside a card**.

Why does this matter? When the Pro exam asks questions like "why is Graviton cheaper," "why are m5 and m5d different," or "why does Spot get reclaimed more often on c5," if you don't know the Nitro architecture you can only solve them by keyword matching. But once you've drawn the Nitro card structure visually even once, every instance family's trade-off collapses into a single line: "what else is attached to that card."

Today we lift EC2, EBS, ELB, and Auto Scaling from SAA depth back up to Pro depth. On the surface they are the same services, but the depth asked in Pro scenarios is completely different.

## Nitro System: The Hypervisor Inside a Card

A traditional virtualization stack looks like this.

```
[Guest OS - EC2 instance]
        │
[Xen hypervisor + dom0 driver domain]   ← occupies host CPU, 7-30% overhead
        │
[Host OS / Firmware]
        │
[Physical NIC / HBA / Disk Controller]
```

After Nitro, this picture changes to:

```
[Guest OS - EC2 instance]   ← near bare-metal performance
        │
[KVM-Lite (< 1% overhead, nearly passthrough)]
        │
[Nitro Cards - separate ASICs]   ← Network, Storage, Security, Hypervisor separated
        │
[Physical Hardware]
```

The Nitro Card is not a single card. AWS split it into the **Nitro Card for VPC** (ENA / SR-IOV), **Nitro Card for EBS** (NVMe controller), **Nitro Card for Instance Storage** (local NVMe), **Nitro Security Chip** (boot integrity, hardware root of trust), and **Nitro Hypervisor** (a KVM variant, nearly passthrough). In other words, the hypervisor functions that used to run on one physical server were scattered across **five independent cards**.

> 💡 **Related theory**: This design matches the philosophy of the Mach microkernel of the 1990s exactly. Mach's vision — "move as much OS functionality as possible into user space and let the kernel handle only minimal IPC" — was realized 30 years later in a cloud hypervisor. Academically, the paper "From L3 to seL4" by Heiser et al. (2014) formally proved how this kind of separation strengthens security without performance loss. AWS implemented it at the ASIC level, combined with SR-IOV (a PCI-SIG standard).

> 🔍 **Deeper dive**: When two instances run on the same physical server, a traditional hypervisor frequently invalidates cache lines while switching vCPUs in memory. Nitro aggressively uses vCPU pinning and groups instances per NUMA node to maintain cache affinity. That's why there is almost no performance difference between c5.metal and c5.24xlarge — both run on the same card structure. However, `metal` lets the guest OS see the ENA and EBS cards directly and can run its own KVM or Xen on top (nested virtualization). VMware Cloud on AWS runs ESXi on top of this.

> 🔍 **Deeper dive**: The Nitro Security Chip performs measured boot at startup. It records the hash of each stage — UEFI firmware → bootloader → kernel — into the secure enclave inside the Nitro Card, and isolates the instance if signs of tampering appear. This is the foundation of AWS Nitro Enclaves (launched 2020). An Enclave shares memory and CPU with the parent EC2 instance but is a compartment isolated from network and disk, handling data that even the parent OS's root must not see — such as KMS keys or PCI card data. Fidelity Investments uses this to isolate credit card data processing.

> 📚 **Case study**: In January 2018, the Spectre and Meltdown CPU vulnerabilities were disclosed. It was a side-channel attack where instances running on the same physical server could partially read another instance's memory. Google, Microsoft, and AWS all deployed patches, but **only AWS saw almost no performance degradation after patching**. The reason: Nitro's memory isolation was already implemented at the card level, so the speculative execution boundary that Spectre targeted was far more solid than on other clouds. In the same incident, GCP recorded 15-25% performance degradation from the Linux KPTI patch. [AWS official bulletin](https://aws.amazon.com/security/security-bulletins/AWS-2018-013/).

> ⚠️ **Trap**: The option "Nitro instances don't need OS patching" is a trap. Nitro strengthens **hypervisor-side isolation**; kernel vulnerabilities in the guest OS remain the customer's responsibility. On the SAP exam, don't be fooled into thinking that the mere word "Nitro" means security responsibility shifted to AWS.

## Instance Families and the Politics of Family Naming

A name like `m5d.4xlarge` is not mere nomenclature — it reflects **AWS's capacity planning**. Every quarter AWS plans which families to stock and how many per data center, and Spot pricing is determined by that surplus capacity.

- **First letter (Family)**: m=General, c=Compute, r=Memory, x=Memory extreme, i=I/O, d=Dense storage, p/g=GPU, h=HDD, z=Z1d (high clock)
- **Number (Generation)**: 5, 6, 7, ... Higher generations mean newer Graviton, AMD, or Intel CPUs
- **Suffix (variant)**: `d`=Local NVMe, `n`=Network optimized (25→100Gbps), `a`=AMD EPYC, `g`=Graviton (ARM), `i`=Intel explicit, `e`=Extended memory
- **Size**: nano, micro, small, medium, large, xlarge, 2xl, 4xl, ..., 96xl, metal

| Family | Typical use | vCPU:Memory | Notable |
|--------|-------------|-------------|--------|
| t3/t4g | Burstable (dev, blogs) | 1:4 | CPU Credits + Unlimited mode (billed on overage) |
| m5/m6i/m7g | Balanced (web servers, app servers) | 1:4 | The safest bet, first candidate for Pro answers |
| c5/c6i/c7g | CPU-optimized (batch, gaming) | 1:2 | High Spot reclamation rate (high demand) |
| r5/r6i/r7g | Memory-optimized (DB, cache) | 1:8 | Aurora, Redis backends |
| x1/x2idn | Memory extreme (SAP HANA) | 1:30+ | TB-scale memory, BYOL HANA |
| i3/i4i | I/O-optimized (NoSQL) | 1:8 + NVMe | NVMe ephemeral, Cassandra, Redis |
| p4d/p5 | GPU (ML training) | A100/H100 | EFA 400Gbps |
| g4dn/g5 | GPU inference, media | T4/A10G | NVIDIA AppStream |
| inf1/inf2 | Inference-dedicated ASIC | AWS Inferentia | Llama/BERT inference, cost-effective |
| trn1 | Training-dedicated ASIC | AWS Trainium | GPT-scale training |

> 🔍 **Deeper dive**: Graviton (the `g` suffix) is an ARM Neoverse N1/V1-based CPU designed by AWS Annapurna Labs (acquired for $370M in 2015). Graviton2 is a 64-core single die, Graviton3 is 7nm + DDR5 + PCIe 5, and Graviton4 (2024) has 96 cores + 75% higher memory bandwidth. The secret of its price-performance advantage is not simply that ARM is cheap, but that **AWS designed the die to fit its own workloads**. For example, general-purpose CPUs spend large die area on SIMD instructions, but Graviton shrank SIMD and instead added memory controllers. It's optimized for memory-bound workloads like web servers, DBs, and caches. It can't run x86-only binaries, so multi-arch builds with Docker Buildx's `--platform linux/amd64,linux/arm64` are required.

> 💡 **Related theory**: The rise of Graviton illustrates the cloud industry's **specialization cycle**. Hennessy & Patterson predicted in "A New Golden Age for Computer Architecture" (CACM 2019) a return to **domain-specific architectures (DSAs)** in response to the slowdown of Moore's Law. Google TPU (2016), AWS Inferentia (2019), Apple M1 (2020), and AWS Trainium (2022) are all the same trend. This is why Inferentia (Inf1/Inf2) is the answer to "minimize cost for ML inference" scenarios on the SAP exam — it's 70% cheaper per inference than GPU (g4dn).

> 🎯 **Scenario**: "A medical imaging company runs Llama-2 70B inference on EC2. Monthly GPU cost is $80,000. It handles PII data, so using a SaaS API is not allowed. How to cut costs by 60% or more?" — Answer: **migrate to Inf2 instances + compile the model with the Neuron SDK**. inf2.48xlarge has 12 Inferentia2 chips, 384GB HBM, at $13/h. Getting the same throughput on p4d.24xlarge ($32.77/h) costs 2.5x. The Neuron SDK automatically converts PyTorch models, so code changes are minimal.

### The Burstable Trap and CPU Credits

t3/t4g instances normally use only up to the vCPU's baseline performance, and above that they accumulate **CPU Credits** to burst. t3.medium's baseline is 20%, earning 24 credits per hour → max 576 credits. When credits run out, (1) in Standard mode the instance throttles down to baseline, (2) in Unlimited mode (added 2017, the default) the overage is billed extra ($0.05 per vCPU-hour).

> ⚠️ **Trap**: It's common to see cases where a t3.medium used as a production web server sustains 100% CPU during a traffic spike → Unlimited billing makes it more expensive than an m5.large. The standard guideline: no t family for steady workloads.

## EBS: The True Nature of Network Storage

EBS looks like a disk to EC2, but in reality **there is an AWS SAN network between EC2 and the physical disks**. This is the core of EBS that SAA barely covers.

```
[EC2 instance]
       │
[Nitro Card for EBS - NVMe protocol]
       │
[AWS internal SAN network - dedicated fabric]
       │
[EBS Server Cluster - distributed block storage]
       │
[3 replicas synchronous, within the same AZ]
```

EBS keeps **3 replicas** synchronously within one AZ, but cannot cross AZ boundaries (due to inter-AZ latency). Therefore EBS is an **AZ-local resource**, and when an AZ fails, that AZ's EBS goes down with it.

### The Trade-off Matrix of EBS Volume Types

| Type | Category | Max IOPS | Max throughput | Max size | Price (GB·month) |
|------|----------|-----------|-------------|-----------|--------------|
| gp3 | SSD general-purpose | 16,000 | 1,000 MB/s | 16 TB | $0.08 |
| gp2 | SSD general-purpose (legacy) | 16,000 (3 IOPS/GB) | 250 MB/s | 16 TB | $0.10 |
| io2 Block Express | SSD high-performance | 256,000 | 4,000 MB/s | 64 TB | $0.125 + IOPS |
| io1 | SSD high-performance (legacy) | 64,000 | 1,000 MB/s | 16 TB | $0.125 + IOPS |
| st1 | HDD throughput | 500 | 500 MB/s | 16 TB | $0.045 |
| sc1 | HDD cold | 250 | 250 MB/s | 16 TB | $0.015 |

> 🔍 **Deeper dive**: gp3 launched in 2020 and became a game changer. With gp2's "3 IOPS/GB" formula, getting 1000 IOPS required buying 333GB. gp3 **provisions IOPS and size independently**. The baseline 3000 IOPS and 125 MB/s are free; anything above costs extra. On average 20% cheaper. One trap though: gp3 has no burst capability. Small gp2 volumes (1–1000 GB) can temporarily burst to 3000 IOPS, but gp3 delivers exactly what you provision, no more.

> 🔍 **Deeper dive**: io2 Block Express is a new architecture launched in 2021. Where the older io1/io2 replicated synchronously through the EBS server cluster, Block Express was redesigned with the SR (Scalable Reliable) protocol based on **NVMe over Fabrics (NVMe-oF)**. The result: sub-millisecond p99 latency, 256K IOPS, 99.999% durability. The downside is that it's only supported on specific instance families like r5b/x2idn. One more thing: io2 and io2 Block Express cost the same but performance differs 4x — if you use io2 without choosing a Block Express instance family, you're just losing out.

> 📚 **Case study**: The Tokyo region AZ failure on August 23, 2019. A bug in the cooling system control software of one AZ caused some EBS servers to overheat and be isolated. Companies running RDS single-AZ at that point saw their DBs die simultaneously — because all 3 EBS replicas were inside the same AZ. Companies running RDS Multi-AZ survived through automatic failover to the standby. **Here lies the trap: if you don't know EBS's AZ-local nature, single-AZ looks safe enough**. [AWS official retrospective](https://aws.amazon.com/jp/message/56489/).

> ⚠️ **Trap**: The option "EBS can be mounted to another AZ" is a trap. EBS is AZ-local. Moving it to another AZ requires two steps: (1) create a snapshot, (2) restore from the snapshot in the other AZ — and the data in between is frozen at the point of the snapshot. If you truly need real-time multi-AZ sharing, use EFS or FSx for OpenZFS.

### EBS Multi-Attach and What Distributed File Systems Mean

io1/io2 (Provisioned IOPS) support the **Multi-Attach** feature: the same EBS volume mounted simultaneously on up to 16 EC2 instances. However, the OS/filesystem must be a **clustered filesystem** (GFS2, OCFS2, OracleRAC). Plain ext4 or NTFS risks data corruption.

> 💡 **Related theory**: Clustered filesystems use a distributed lock manager (DLM) to prevent simultaneous writes to the same block. This is a descendant of Lamport's mutual exclusion algorithm (1986). Red Hat GFS2 uses corosync + DLM, Oracle ASM uses its own lock manager, and OCFS2 uses the o2cb cluster stack. Plain ext4 assumes a single mount, so two nodes writing the same inode causes silent corruption. This is an area worth an entire chapter in a distributed systems textbook, so on the Pro exam, if you see a word like "ext4" in a Multi-Attach option, it's an instant trap.

### EBS Snapshots: Incremental + S3 Backend

Snapshots are **incremental**. The first snapshot is full; from the second onward only changed blocks are stored. The backend is S3 (not directly accessible by customers). They can be shared with other regions and accounts.

```bash
# Create a snapshot
aws ec2 create-snapshot --volume-id vol-abc --description "Daily backup"

# Copy to another region (for DR, encryption enforced)
aws ec2 copy-snapshot \
  --source-region ap-northeast-2 \
  --source-snapshot-id snap-xyz \
  --region us-east-1 \
  --encrypted --kms-key-id alias/aws/ebs
```

> 🔍 **Deeper dive**: **EBS Fast Snapshot Restore (FSR)** removes the first-read latency penalty when restoring a snapshot to a volume. Regular snapshots lazy-load, fetching blocks from S3 on each first read, so the first few days are slow. Snapshots with FSR enabled deliver full performance immediately. Essential for reducing RTO in DR scenarios. However, FSR costs $0.75 per hour per AZ per snapshot, so enabling it on every snapshot explodes the bill. The standard pattern is **turning it on only right before quarterly DR tests and off afterward**.

> 🎯 **Scenario**: "A game company restored a 1TB EBS snapshot from us-east-1 to us-west-2 in a DR test, and latency was 10x normal for the first hour. How to improve?" — Answer: **enable Fast Snapshot Restore in the DR region + prewarm before the DR test**. Or use AWS Backup's cross-region copy with the automatic FSR option. Regular snapshots' lazy-load behavior causes an S3 fetch on every first read, with p99 latency 5-10x normal.

## The Four ELBs: Same Name, Different Products

ELB is not a single product. It is **four distinct products spanning three layers: L4/L7/L3**.

| Type | Layer | Routing basis | Suited workloads | Static IP |
|------|--------|-------------|----------------|---------|
| Classic (CLB) | L4/L7 | Basic (deprecated) | Do not use | X |
| Application (ALB) | L7 | Host, Path, Header, Query, Method, SourceIP | HTTP/HTTPS, microservices | X (can be added via GA) |
| Network (NLB) | L4 | TCP/UDP/TLS | Gaming, IoT, static IP needs | O (1 per AZ) |
| Gateway (GLB) | L3 | GENEVE protocol | Security appliances (Palo Alto, Fortinet) | - |

> 🔍 **Deeper dive**: NLB **preserves the client IP**. Even after a packet passes through the NLB, the source IP stays as the original (the NLB also handles the reverse path). ALB, by contrast, replaces the source IP with its own and puts the original in the `X-Forwarded-For` header. So to do rate limiting or geo blocking by client IP at the backend, you must either (1) use an NLB or (2) trust the `X-Forwarded-For` header from the ALB (in which case spoofing is possible if there's another proxy in front of the ALB). The NLB's static IPs are assigned one per AZ, and Elastic IPs can also be assigned explicitly. This is why NLB is the answer in B2B scenarios that require firewall whitelisting.

> 🔍 **Deeper dive**: NLB's throughput is achieved via **flow-hash-based ECMP** (Equal-Cost Multi-Path). The NLB maps source IP·port → backend with a stateless hash function. The same connection goes to the same backend, but since the NLB itself keeps no connection table, it can scale infinitely. ALB is connection-aware — it multiplexes connections to backends (HTTP/2 multiplexing) but in exchange cannot scale as infinitely as NLB. This is why NLB's p99 latency is under 100μs.

> 💡 **Related theory**: The choice between L4 and L7 load balancers ties directly to the **cost of holding state** in distributed systems. L7 must understand HTTP semantics, so it terminates the connection and creates a new connection to the backend. At that point, state explodes: buffer sizes, keep-alive policies, HTTP/2 multiplexing, and so on. L4 is just IP/port forwarding, so it's stateless. If latency-sensitive like gaming, VoIP, or IoT, choose L4; if L7 semantics are needed like REST APIs or SaaS, choose L7.

> 🎯 **Scenario**: "A global IoT company receives MQTT (TCP 8883) from 1 million devices. Two static IPs hardcoded into device firmware, failover on regional failure, p99 latency within 1ms. Which combination?" — Answer: **Global Accelerator + NLB (Multi-Region)**. GA provides 2 static IPs via BGP Anycast, and devices are automatically routed to the nearest edge. NLB satisfies L4, static IP, and MQTT (TCP) all at once. ALB only supports HTTP, so it's unsuitable. CloudFront is L7 HTTP only.

### ALB's Advanced Features: Authentication and Routing Without Code Changes

- **Listener Rules**: route by Host header, Path, HTTP Method, Query String, Source IP, HTTP Header. Priority-based.
- **Target Groups**: bundle EC2, IP, Lambda, Containers. Weighted routing supported.
- **Sticky Sessions**: based on ALB's own cookie (AWSALB) or an application cookie.
- **WAF integration**: apply WAF rules directly.
- **Cognito integration**: the ALB handles OIDC/Cognito authentication directly (no backend code changes needed).
- **gRPC support**: since 2020, ALB supports gRPC as a first-class citizen, HTTP/2 + Protocol Buffers.

> 📚 **Case study**: A SaaS handles authentication through the ALB's Cognito integration. The backend app contains almost no auth code; the ALB validates the JWT and passes user info in the `X-Amzn-Oidc-Data` header. The backend only needs to verify that header's JWT signature. However, ALB Cognito integration is only suited to HTTP APIs; gRPC and WebSocket need separate handling. Also, the ALB's OIDC integration does not handle token refresh itself, so the refresh token flow must be implemented in the backend or with Lambda@Edge.

> ⚠️ **Trap**: The option "ALB's Cognito integration solves every authentication case" is a trap. ALB Cognito (1) must be HTTP-based, (2) supports only the standard OIDC authorization code flow, and (3) has limited custom claim mapping. For complex auth requirements (e.g., injecting dynamic permissions into tokens), a backend or a Lambda Authorizer is a better fit.

## Auto Scaling: Six Policies and the War on Cold Starts

ASG scaling policies are known at the SAA level as four — "Target Tracking, Step, Simple, Scheduled" — but Pro asks more finely differentiated scenarios.

| Policy | Mechanism | Suited workloads |
|------|----------|----------------|
| **Target Tracking** | Keep a metric at a target value (CPU 50%) | General cases |
| **Step Scaling** | Different scale actions per alarm threshold | Sharp traffic changes |
| **Simple Scaling** | One action per alarm (trending toward deprecation) | Simple |
| **Scheduled** | Adjust capacity at set times | Predictable patterns (Black Friday) |
| **Predictive** | ML-based future prediction (learns from 2 weeks of data) | Regular patterns + sudden spikes |
| **Warm Pool** | Maintain a pool of pre-started, stopped instances | Fast scale-out |

> 🔍 **Deeper dive**: **Warm Pool** (launched 2021) pre-boots and fully configures EC2 instances, then keeps them in the stopped state. On scale-out, only the stopped → running transition is needed, saving OS boot and app initialization time. Effective for workloads with cold starts over 5 minutes (e.g., ML model load 30s, JVM warmup 60s, container pull 90s). However, stopped instances still incur EBS storage costs — a trade-off of capacity cost vs cold start cost. For a 1000-instance ASG, a Warm Pool of about 200 is the sweet spot.

> 💡 **Related theory**: The idea behind Warm Pool is identical to the operating system's **process pool**. It's the same principle as Apache's prefork MPM or Nginx worker processes being forked in advance and waiting. From queueing theory, by Little's Law (L = λW), when the derivative of the traffic spike λ is large, stabilizing W requires growing L in advance — that's exactly the Warm Pool.

> 🎯 **Scenario**: "An e-commerce company sees traffic spike 10x every day at 09:09 (flash sale). It must scale out within 5 minutes to meet the SLA. Which policy fits?" — Answer: **Scheduled Scaling to pre-scale-out at 09:05 + Warm Pool to cut boot time + Target Tracking for follow-up adjustment**. Predictive is also possible, but for a single-time spike, Scheduled is more reliable. Warm Pool cuts the cold start from 5 minutes → 30 seconds.

### Lifecycle Hooks: Running Code at Launch and Termination

When an ASG launches or terminates an instance, **Lifecycle Hooks** let you pause briefly and run user code.

```
[ASG: scale-out decision]
       ↓
[EC2 instance launches]
       ↓
[Lifecycle Hook: Pending:Wait state]   ← message sent to SQS/SNS here
       ↓ (user code completes, calls complete-lifecycle-action)
[Pending → InService]
       ↓
[receives normal traffic]
```

Use cases: registering the instance with an ECS cluster, health checks before ELB registration, waiting for monitoring agent installation to finish. Similarly at termination, you can drain traffic before shutting down.

> ⚠️ **Trap**: The Lifecycle Hook's default heartbeat is 1 hour, max 48 hours. If complete-lifecycle-action is not called, it proceeds automatically on timeout. If an error occurs while a Lambda handles the hook, the default ABANDON behavior kills the instance. Retry and dead-letter handling are mandatory.

### Mixed Instances Policy + Spot Allocation Strategy

An ASG can mix multiple instance types and On-Demand/Spot within one group.

```yaml
MixedInstancesPolicy:
  LaunchTemplate:
    Overrides:
      - InstanceType: m5.large
      - InstanceType: m5a.large    # AMD
      - InstanceType: m5n.large    # Network
      - InstanceType: m6i.large    # Intel
      - InstanceType: m6g.large    # Graviton
  InstancesDistribution:
    OnDemandBaseCapacity: 4
    OnDemandPercentageAboveBaseCapacity: 20
    SpotAllocationStrategy: capacity-optimized
```

> 🔍 **Deeper dive**: The four SpotAllocationStrategy options — `lowest-price` takes from the cheapest pool; `capacity-optimized` prefers the pool with the lowest reclamation risk (most spare capacity); `capacity-optimized-prioritized` combines user priority + capacity; `price-capacity-optimized` (added 2022, recommended) optimizes price and capacity simultaneously. On the Pro exam, when Spot appears, `price-capacity-optimized` is almost always the answer.

## Placement Groups: Instance Placement Strategies

| Type | Placement | Suited workloads |
|------|------|----------------|
| Cluster | Same AZ, same rack | HPC, low latency (NIC 25/100/400Gbps EFA) |
| Spread | Different racks | Isolation, limit 7/AZ |
| Partition | Up to 7 partitions | HDFS, Cassandra, Kafka |

> 📚 **Case study**: An ML company uses Cluster Placement Group + p4d.24xlarge × 64 + EFA for distributed training. 400Gbps EFA (Elastic Fabric Adapter) uses OS bypass + RDMA, bringing inter-GPU communication close to NVLink level. AllReduce time is under 1 second with PyTorch DDP. However, a Cluster PG is bound to a single AZ, making it vulnerable to AZ failures, and if capacity runs short in a single PG, an InsufficientInstanceCapacity error occurs — hence the need for pre-warming.

> 🔍 **Deeper dive**: Partition Placement Groups map exactly to HDFS rack awareness. When HDFS replicates a data block three times, it places them (1) on the same node, (2) on a different node in the same rack, (3) on a different rack. If you create 7 partitions in a Partition PG, HDFS perceives them as 7 racks and automatically distributes replicas. Cassandra can mimic multi-DC replication with the same principle.

## Wrapping Up

The four things we saw today are the familiar four from SAA, but at Pro level you must know the deeper differences: Nitro, gp3, NLB static IPs, Warm Pool, Mixed Instances Policy. Five pricing models, six EBS types, four ELBs, six ASG policies — etching this 21-item trade-off matrix into your head is today's core. Only when you can convert scenario keywords not by simple mapping but into a single line of "why is this answer better" can you solve at Pro level.

The next article wraps up with a Week 1 review + 10 scenario questions. It's practice melting the IAM, VPC, and EC2 we covered over the week into a single scenario at once.

---

## 📝 Practice Questions

**Question 1.** A company runs 100 c5.4xlarge instances for a nightly ETL batch, 4 hours a day. How to maximize cost savings while meeting the SLA (completion by 09:00 the next day)? Note: the job can be restarted even if some instances are reclaimed midway.

A) 100 On-Demand instances
B) 100 3-year RIs
C) Spot Fleet with diverse instance families (c5/c5n/c5a/m5) + price-capacity-optimized
D) 50 RIs + 50 Spot

**Answer: C**
Explanation: The keywords are "only 4 hours at night" + "maximum savings" + "SLA has slack" + "restartable." RI (B) assumes 24-hour operation, so it's a loss for night-only use. Mixing diverse families in a Spot Fleet means when one family's capacity runs short, another substitutes — lowering the reclamation rate. `price-capacity-optimized` optimizes price and capacity simultaneously. Using a single family risks mass Spot reclamation when that entire family runs short, threatening the SLA. Trade-off: Spot averages 70% off but can be reclaimed after a 2-minute warning, unsuitable for stateful workloads.

---

**Question 2.** A fintech's production DB runs on RDS io1. How to reduce cost while improving latency?

A) Downgrade to gp3
B) Switch to io2 Block Express (r5b instance family)
C) Migrate to Aurora
D) Switch to gp2

**Answer: B**
Explanation: io2 Block Express is about 30% cheaper than io1 at the same IOPS + sub-millisecond latency. A new backend based on NVMe over Fabrics. However, it's only enabled on specific instance families like r5b/x2idn, so the instance family must change too. A and D are unsuitable for production DBs due to IOPS limits. C is a large change.

---

**Question 3.** A global IoT company receives MQTT (TCP 8883) from 1 million devices. Two static IPs hardcoded into device firmware, failover within seconds on regional failure, p99 latency within 1ms, 1 million packets per second.

A) ALB + Route 53 Failover
B) NLB + Route 53 Health Check
C) Global Accelerator + NLB (Multi-Region)
D) CloudFront + Lambda@Edge

**Answer: C**
Explanation: The keywords are "static IP" + "MQTT (L4)" + "failover within seconds" + "1 million packets per second." GA provides 2 static IPs via BGP Anycast and fails over within seconds, bypassing DNS caches, on regional failure. NLB satisfies L4, millions of packets per second, static IP, and MQTT all at once. A and B have minute-scale failover due to DNS TTL caching. D is L7 HTTP only.

---

**Question 4.** A company's traffic spikes 5x every day at exactly 10:00. The ASG's scale-out takes 5 minutes, so responses lag for the first 5 minutes. How to improve?

A) Configure Target Tracking more aggressively
B) Scheduled Scaling to pre-scale-out at 09:55 + maintain a Warm Pool of 200 instances
C) Apply Step Scaling only
D) Enable Predictive Scaling only

**Answer: B**
Explanation: Predictable time-based spike → the Scheduled + Warm Pool combination. Warm Pool keeps stopped instances pre-booted, cutting startup time to tens of seconds. Predictive learns regular patterns, so for a single spike, Scheduled is more reliable. Trade-off: 200 Warm Pool instances still incur EBS storage costs; the sweet spot is 10-20% of the ASG size.

---

**Question 5.** A company wants to minimize inter-instance latency for an HPC workload (distributed ML training). How to place instances?

A) Spread Placement Group + Multi-AZ
B) Cluster Placement Group + EFA-enabled p4d/p5
C) Partition Placement Group
D) Multi-AZ ASG

**Answer: B**
Explanation: Bundle in the same AZ and same rack to minimize latency. EFA (Elastic Fabric Adapter) enables RDMA-level communication via OS bypass. 400Gbps NIC. Same AZ means lower availability (HPC is usually stateless and re-runnable). Trade-off: Spread is limited to 7/AZ for isolation/availability; Partition is for rack-aware distributed systems like HDFS and Cassandra.

---

**Question 6.** What are the constraints of EBS Multi-Attach? (Choose 2)

A) gp3 is also supported
B) Only io1/io2 (including io2 Block Express) are supported
C) Unlimited instances can mount simultaneously
D) Same AZ only + clustered filesystem (GFS2, OCFS2, OracleRAC) required
E) Can also be mounted in other regions

**Answer: B, D**
Explanation: Only io1/io2 Provisioned IOPS are supported. Up to 16 EC2 instances mounted simultaneously. Plain ext4/NTFS risks data corruption; a clustered filesystem is required. Same AZ only (EBS is AZ-local). A distributed lock manager handles synchronization.

---

**Question 7.** A company wants to apply authentication behind an ALB. To minimize code changes in the backend (Node.js HTTP API)?

A) Implement Passport.js + JWT verification directly in the backend
B) Enable the ALB's Cognito integration + receive the X-Amzn-Oidc-Data header
C) API Gateway + Lambda Authorizer
D) JWT verification with Lambda@Edge

**Answer: B**
Explanation: The ALB handles OIDC/Cognito authentication directly and passes user info to the backend in the X-Amzn-Oidc-Data header. Almost no backend code changes needed (only verify the JWT signature). However, it's only suited to HTTP; gRPC and WebSocket need separate handling. Trade-off: if complex custom claim mapping is needed, a Lambda Authorizer is more flexible.

---

**Question 8.** A medical imaging company spends $80,000/month on GPU for Llama-2 70B inference on EC2. SaaS APIs are not allowed due to PII data. Goal: cut costs by 60%.

A) p5.48xlarge × On-Demand
B) p4d.24xlarge × 3-year RI
C) Inf2.48xlarge + compile the model with the Neuron SDK
D) SageMaker Endpoint

**Answer: C**
Explanation: Inferentia2 is an ASIC specialized for LLM inference. inf2.48xlarge has 12 Inferentia2 chips, 384GB HBM, at $13/h. Versus p4d.24xlarge ($32.77/h), same throughput at 60%+ lower price. The Neuron SDK automatically converts PyTorch models. PII data is also processed inside your own VPC. Trade-off: Inferentia requires model compilation time and some operations (custom CUDA kernels) are unsupported.
