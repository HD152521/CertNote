# Day 5 - Week 3 Comprehensive Review: Wiring EC2, Storage, ELB, and ASG into a Single Architecture

This week covered the core of AWS's compute and storage layers. EC2 instance families and purchase options (Day 1), the storage-selection principles behind EBS, Instance Store, EFS, and FSx (Day 2), the load-balancing tier of ALB, NLB, and GLB (Day 3), and ASG scaling policies and operational techniques (Day 4). These four are not independent services — they're the parts that make up a single architectural pattern.

The goal of this review isn't to memorize each one in isolation, but to build the ability to judge "which combination is optimal given the requirements." The SAA exam asks about trade-off judgment, not single-service trivia.

## How This Week's Core Concepts Link Together

How do these four areas connect into one whole?

Once you pick an EC2 instance (family and purchase option), you decide what storage to attach to it (EBS / Instance Store / a shared file system). To spread traffic across multiple instances, you put an ELB in front (ALB / NLB / GLB). And what automatically adjusts the instance count in response to traffic is the ASG.

```
[ Week 3 concept-linkage structure ]

Requirements analysis
    ↓
┌─────────────────────────────────────────────────────┐
│ Workload characteristics → instance family (Day 1)  │
│ Cost/commitment → purchase option (Day 1)           │
│ Data durability/sharing → storage type (Day 2)      │
│ Traffic type → ELB type (Day 3)                     │
│ Load-variation pattern → scaling policy (Day 4)     │
└─────────────────────────────────────────────────────┘
    ↓
Choose the optimal architecture
```

## Key Comparison Tables: At a Glance

### Instance Family Selection Criteria

| Bottleneck Resource | Family | Representative Workloads | Watch Out For |
|----------|--------|-------------|--------|
| CPU-intensive | C | Encoding, ML inference, batch | Graviton (c7g) is 25% cheaper |
| General-purpose | M | App servers, cache | The first choice |
| Memory | R | In-memory DB, SAP | Large RAM is the point |
| Memory (extreme) | X | SAP HANA, multiple TB | Very high cost |
| Local NVMe | I | NoSQL, Kafka brokers | Consider data loss |
| GPU training | P | LLM pre-training | H100/A100 |
| GPU inference | G | ML inference, rendering | A10G |
| Variable load | T | Dev, microservices | Watch T Unlimited cost |
| ARM savings | *g suffix | Open-source stacks broadly | Verify commercial SW compatibility |

### Purchase Option Trade-offs

| Option | Commitment | Max Savings | Use When |
|------|------|---------|---------|
| On-Demand | None | 0% | Short-term, unpredictable |
| Compute SP | 1/3 yr | ~66% | Family/region/OS can change |
| EC2 Instance SP | 1/3 yr | ~72% | Family fixed, size free |
| Standard RI | 1/3 yr | ~72% | Type fixed |
| Spot | Immediate | ~90% | Stateless, interruption-tolerant |
| Dedicated Host | 1/3 yr | - | BYOL licensing |
| Capacity Reservation | None | 0% | Capacity assurance only |

### Storage Decision Tree

```
Just one EC2?
    └─ Need persistence?
        ├─ NO: Instance Store (NVMe, top performance)
        └─ YES: EBS
               ├─ Default: gp3 (IOPS/throughput independent, 20% cheaper than gp2)
               ├─ High-performance OLTP: io2 (up to 64K IOPS)
               └─ Mission-critical: io2 Block Express (up to 256K IOPS)

Shared across multiple EC2?
    ├─ Linux NFS: EFS (auto-scaling, Multi-AZ)
    ├─ Windows SMB + AD: FSx for Windows
    ├─ HPC/ML parallel + S3 integration: FSx for Lustre
    └─ NetApp migration / multi-protocol: FSx for ONTAP

Object storage / HTTP API: S3
```

### Choosing Among the Three ELBs

| Keyword | Answer | Why |
|--------|------|------|
| HTTP path/host/header routing | ALB | L7 content-based |
| WAF integration | ALB | WAF attaches to ALB |
| gRPC, HTTP/2 | ALB | NLB is TCP-only |
| WebSocket sessions | ALB | Sticky-session support |
| UDP, game servers | NLB | L4 UDP support |
| Static IP, EIP, partner whitelist | NLB | EIP per AZ |
| Ultra-low latency (μs) | NLB | L4 processing |
| Custom TCP protocol | NLB | Not HTTP |
| NGFW/IPS/DPI chaining | GLB | GENEVE L3 |
| Security-appliance Auto Scaling | GLB | Appliance management |

### ASG Scaling Policy Comparison

| Policy | How It Works | When to Use |
|------|---------|-------------|
| Target Tracking | Auto-tracks a target value (PI control) | Recommended, most situations |
| Predictive | ML-driven pre-scaling | Periodic patterns |
| Scheduled | Time-based pre-configuration | Predictable patterns |
| Step | Step-wise scaling amounts | When fine-grained control is needed |
| Simple | Simple +/- N | Legacy, avoid |

## Seven Frequently Tested Traps

**Trap 1. Using Instance Store for a database**
The exam dangles "the fastest storage" as bait and offers an answer that puts a database on Instance Store. Instance Store loses its data when the instance is stopped or terminated, so you must never use it for a DB. That said, it's usable as the node disk for a distributed DB that guarantees durability through replication — like Cassandra or MongoDB.

**Trap 2. Using EFS for a Windows AD file share**
EFS is NFSv4.1-based and Linux-only. If you need Windows Active Directory integration, the SMB protocol, or NTFS ACLs, it's FSx for Windows File Server.

**Trap 3. Assuming a gp2 volume is already at max IOPS**
gp2 IOPS scale with size (1GB = 3 IOPS). A 100GB gp2 tops out at 300 IOPS. If you need more IOPS, switch to gp3 and provision IOPS independently. The gp3 switch is instant with no downtime.

**Trap 4. Expecting a static IP from an ALB**
An ALB only has a DNS name, and its IP changes. Registering an ALB IP in a partner firewall whitelist is impossible. NLB + EIP is the answer. Global Accelerator also provides two static Anycast IPs, but unless the question explicitly mentions Global Accelerator, NLB + EIP is the simpler answer.

**Trap 5. Detecting app failures with only the ASG's EC2 health check**
The EC2 health check only looks at physical/OS state. Even if the app crashes, EC2 stays in the Running state, so it won't be replaced. When operating behind an ALB, you must enable the ELB Health Check type on the ASG.

**Trap 6. Using Spot instances for a stateful workload**
Even if "maximum savings" is in the requirements, Spot is a wrong answer for stateful workloads (DB master, session server, license server). It can disappear at any time after the 2-minute notice. Spot is the right answer only for stateless work (batch, big data, ML training with checkpoints).

**Trap 7. Assuming NLB Cross-Zone is ON by default**
ALB has Cross-Zone ON by default (no extra charge), but NLB and GLB default to OFF. On an NLB, if the target count is uneven across AZs, traffic distribution skews. Enabling Cross-Zone incurs additional data-transfer charges.

## Inter-Service Interaction Patterns

In real architectures, these services operate in combination. You have to understand the representative patterns to solve scenario questions.

**Pattern A: Standard three-tier web service**
```
Internet → ALB (Multi-AZ, HTTPS, WAF)
              ↓ Host/Path routing
         ASG (EC2, Mixed Instances, Spot 60% + OD 40%)
              ↓
         EBS gp3 (application data)
         EFS (shared config, uploaded files)
              ↓
         RDS Multi-AZ (reads go to Read Replica)
```

**Pattern B: ML training platform**
```
S3 (training data) ←→ FSx for Lustre (S3 integration)
                          ↓ (POSIX API, hundreds of GB/s)
                   EC2 Spot (p4d.24xlarge, GPU)
                   [Lifecycle Hook: save checkpoint]
                          ↓
                   S3 (model checkpoints)
```

**Pattern C: B2B API service (static IP required)**
```
Partner → NLB (EIP whitelist)
              ↓ (TCP 443)
         EC2 ASG (Target Tracking)
              ↓
         RDS + ElastiCache
```

**Pattern D: Enterprise security chain**
```
Internet → Transit Gateway → GLB → Palo Alto NGFW (ASG)
                                       ↓ (inspection passed)
                                ALB → EC2 ASG → RDS
```

**Pattern E: HPC cluster**
```
EC2 c7g.metal (Cluster Placement Group)
    ├─ EFA (OS-bypass networking, 100Gbps)
    ├─ FSx for Lustre (POSIX, ultra-fast parallel I/O)
    └─ Instance Store (temporary scratch)
```

## Cost-Optimization Patterns

When "cost optimization" shows up in a scenario, analyze it with this framework.

```
1. Classify the workload
   - Stateless + interruption-tolerant → Spot (up to 90% savings)
   - Predictable baseline load → Compute SP or RI
   - Short-term / unpredictable → On-Demand

2. Right-size the instance
   - Check whether Graviton (ARM) is viable (25% savings)
   - Pick the family from actual CPU/memory utilization

3. Optimize storage
   - gp2 → gp3 switch (20% savings)
   - EFS IA Lifecycle Policy (auto-tier long-untouched files)
   - S3 Intelligent-Tiering or Glacier

4. Optimize usage patterns
   - Schedule nightly dev/test ASG shutdown
   - Analyze CloudWatch real-usage data before applying Reserved Instances
```

## Resilience (Reliability) Design Patterns

When a scenario says "keep the service up even during a single-AZ failure":

```
Essential checklist:
□ ALB: Multi-AZ subnets (at least 2 AZs)
□ ASG: Min=2 or more, subnets registered across multiple AZs
□ RDS: Multi-AZ deployment (synchronous replication)
□ ElastiCache: Redis Cluster Mode Enabled (Multi-AZ)
□ EFS: Multi-AZ mount targets
□ S3: Multi-AZ durability by default (no extra config needed)
```

When it says "keep the service up even during a full-region failure":
```
Additionally required:
□ Route 53 Health Check + Failover records
□ RDS Cross-Region Read Replica (manual promote)
  or Aurora Global Database (RPO < 1 second)
□ S3 Cross-Region Replication
□ CloudFront (edge cache buffers origin failure)
□ A standby ASG + EC2 stack in a second region
```

---

## 📝 시나리오 연습 문제

**문제 1.** A global e-commerce platform runs in the AWS Seoul region. Design an architecture that satisfies all of the following requirements.
- Traffic is 5× normal on weekdays from 08:00 to 18:00
- No service interruption during a single-AZ failure
- Guarantee baseline capacity while minimizing cost
- Must defend against SQL injection attacks

A) On-Demand EC2 + ALB (Single-AZ) + RDS Single-AZ + Shield Standard
B) Spot EC2 ASG (Multi-AZ) + ALB (WAF) + RDS Multi-AZ + Scheduled Scaling + Compute SP (baseline load)
C) RI 3y (all EC2) + NLB (Multi-AZ) + RDS Multi-AZ + Target Tracking
D) Dedicated Host EC2 + ALB (WAF) + RDS Multi-AZ + Manual Scaling

**정답: B**
해설: The weekday pattern is pre-scaled with Scheduled Scaling, the baseline load runs on Compute SP (committed savings), and the peak overage is handled by Spot. ALB + WAF defends against SQL injection. Multi-AZ ASG + RDS Multi-AZ covers a single-AZ failure. A is Single-AZ, so it fails at failure handling. C can't apply WAF to an NLB. D's Manual Scaling is inefficient in both cost and elasticity.

---

**문제 2.** A company is migrating from on-premises NetApp ONTAP storage to AWS. Both Linux and Windows servers must access the same file system, and the plan is to migrate gradually while syncing from on-premises via SnapMirror. After the migration completes, it must also support both NFS and SMB. Which service fits?

A) EFS (NFSv4.1-based)
B) FSx for Windows File Server (SMB-based)
C) FSx for NetApp ONTAP
D) FSx for OpenZFS

**정답: C**
해설: FSx for NetApp ONTAP supports NFS, SMB, and iSCSI multi-protocol access simultaneously. It can replicate with on-premises NetApp via SnapMirror, so gradual migration is natural. NetApp-native features like WAFL-based snapshots, thin provisioning, and deduplication are also usable as-is. EFS supports only NFS, FSx for Windows only SMB, and OpenZFS only NFS.

---

**문제 3.** A financial trading company is migrating a new order system to AWS. Requirements: (1) minimize network latency (μs scale), (2) partner systems must register a static IP in their firewall whitelist, (3) use the FIX protocol (a TCP-based custom protocol), (4) MPI communication between order-processing servers. What is the most suitable architecture?

A) ALB (Multi-AZ) + EC2 ASG (Spread Placement Group)
B) NLB (EIP) + EC2 Cluster Placement Group (EFA) + Nitro instances
C) Global Accelerator + ALB + EC2 ASG
D) GLB + NLB + EC2 ASG

**정답: B**
해설: FIX protocol (custom TCP) + partner static IP → NLB + EIP. Low-latency MPI communication between servers → Cluster Placement Group + EFA (OS-bypass networking). Nitro instances offload I/O overhead to hardware, minimizing latency. An ALB only routes HTTP/HTTPS and is incompatible with the FIX protocol. Spread is for isolation, the opposite of low-latency MPI.

---

**문제 4.** A startup is launching a new SaaS product. Traffic is very low at first, but could surge tenfold on success. It must handle a surge that could happen anytime within a year with no service interruption, while minimizing cost. Long term, it plans to run for 3+ years.

A) Reserved Instance 3-year + Multi-AZ ASG
B) On-Demand only + Manual Scaling
C) Compute Savings Plans 3-year (baseline) + Spot (peak handling) + Target Tracking ASG
D) Spot 100% + Target Tracking ASG + Multi-AZ

**정답: C**
해설: Although the plan is 3 years, the initial traffic pattern is uncertain, so Compute SP (free to change family and region) fits better than an RI. The baseline load runs on Compute SP for savings, and the surge window is handled by Spot. A Target Tracking ASG adjusts scale automatically. Spot 100% suits only stateless workloads, and a SaaS service may carry session state. B is inefficient in both cost and elasticity.

---

**문제 5.** A company runs a PostgreSQL database on EC2 using an EBS gp2 volume (200GB). The DBA analyzes it and finds average IOPS usage of 800 and a peak of 2,000, exceeding gp2's maximum of 600 IOPS (200GB × 3), causing performance degradation. What is the most cost-effective solution?

A) Expand the gp2 volume to 1,000GB
B) Switch gp2 to io2 (provision 2,000 IOPS)
C) Switch to gp3 and set IOPS to 3,000
D) Add a second gp2 volume to the instance and configure RAID 0

**정답: C**
해설: gp3 lets you set up to 16,000 IOPS independently of size, and it's 20% cheaper than gp2. Since the peak needs 2,000 IOPS, setting 3,000 IOPS is plenty. A (expanding gp2) forces you to buy an unnecessarily large volume just to reach 1,000GB × 3 = 3,000 IOPS. io2 is for mission-critical environments that need 64K IOPS and is far more expensive than gp3. RAID 0 carries high complexity and management overhead.

---

**문제 6.** A web server running under an Auto Scaling Group needs the following each time it launches a new instance: fetch DB connection info from Parameter Store, generate a config file and start the app, then warm up the Redis cache. This whole process takes 4 minutes. If ALB traffic arrives before the 4 minutes complete, errors occur. What is the most appropriate configuration?

A) Health Check Grace Period = 0, Slow Start = 240 seconds
B) Health Check Grace Period = 240 seconds, ALB Target Group Slow Start = 120 seconds
C) Lifecycle Hook (Pending:Wait) + complete-lifecycle-action call + Slow Start = 120 seconds
D) Add a 4-minute sleep to the User Data script

**정답: C**
해설: A Lifecycle Hook Pending:Wait completes the 4-minute initialization, then calls `complete-lifecycle-action SUCCESS` to transition to InService. Up to this stage, any ALB health-check failure is shielded by the Grace Period. After transitioning to InService, Slow Start (120 seconds) admits gradual traffic to stabilize. Setting only the Health Check Grace Period to 240 seconds risks the ALB suddenly sending a lot of traffic once that time elapses. A User Data sleep is an anti-pattern that wastes resources.

---

**문제 7.** A company is migrating on-premises physical servers to AWS. Among the migration targets are SQL Server Enterprise licenses (billed per socket) and Oracle DB (billed per CPU core). To use these licenses in AWS via BYOL, what is needed?

A) EC2 Dedicated Instance
B) EC2 Dedicated Host
C) EC2 Spot instance (the cheap option)
D) EC2 On-Demand (a general shared host)

**정답: B**
해설: SQL Server socket billing and Oracle core billing both compute the license against the number of physical CPU sockets/cores. A Dedicated Host occupies a specific physical server, and AWS exposes that server's socket count and core count. A Dedicated Instance isolates the physical host within the same account but doesn't reveal which physical server it is, so it can't be used for license counting. On a shared host (general On-Demand), the physical core count is unknown, so BYOL licensing can't be applied.

---

**문제 8.** A video-streaming service runs a pipeline that processes user-uploaded videos. The video-encoding jobs are CPU-intensive and take 30-120 minutes. If an encoding job is interrupted, it can restart from the last checkpoint (saved to S3 every 10 minutes). To run reliably while minimizing cost as much as possible, what should you use?

A) c6i.8xlarge On-Demand EC2 + SQS message queue
B) c7g.8xlarge Spot EC2 + SQS + EventBridge Spot interruption handler
C) c6i.8xlarge RI 1-year + SQS
D) Fargate Spot (vCPU = 8) + SQS

**정답: B**
해설: Video encoding is CPU-intensive (C family). c7g is Graviton3 ARM, 25% cheaper than c6i (x86). Since there are checkpoints, Spot interruptions are tolerable. Use EventBridge to catch the `EC2 Spot Instance Interruption Warning` event and re-enqueue the SQS message so another Spot instance picks up where it left off. SQS acts as the work queue, distributing jobs across multiple encoding instances. An RI is inefficient unless 30-120-minute jobs keep the instance always on.

---

**문제 9.** Which configuration combination maximizes availability during Spot instance interruptions in an ASG?

A) `lowest-price` Spot strategy + a single instance type
B) `capacity-optimized` Spot strategy + multiple instance types + Capacity Rebalancing enabled
C) `diversified` Spot strategy + a single AZ
D) `lowest-price` Spot strategy + On-Demand 100% baseline

**정답: B**
해설: `capacity-optimized` picks the Spot pool with the most spare capacity in AWS right now, minimizing interruption probability. Allowing multiple instance types means that if Spot pressure hits one type, the others cover it. Capacity Rebalancing launches a replacement instance in advance upon an interruption warning to maintain the count. `lowest-price` can pile onto the cheapest pool, concentrating interruptions. A single AZ risks a total outage during an AZ failure or a Spot shortage in that AZ.

---

**문제 10.** A company runs a 10TB data analysis every Sunday at 2:00 AM. The analysis needs large RAM (256GB), and results are stored in S3. The analysis job cannot be interrupted, and the instance can be terminated after it completes. What is the most cost-effective approach?

A) r6i.16xlarge (256GB RAM) On-Demand, started/stopped manually each week
B) r6i.16xlarge Spot + checkpoints, Scheduled Scaling
C) r7g.16xlarge On-Demand, auto start/stop via Scheduled Scaling
D) r6i.16xlarge Reserved Instance 1-year + Scheduled Scaling

**정답: C**
해설: Since the analysis job can't be interrupted, Spot is unsuitable. r7g is Graviton3 ARM, about 25% cheaper than r6i (Intel x86). With Scheduled Scaling, raise Desired to 1 every Sunday at 2:00 AM and drop it to 0 after completion (since an ASG can't go to 0, set Min=0 or terminate via EventBridge + Lambda), paying only for the hours used. A 1-year RI wastes the remaining hours in a pattern used only a few hours per week (2.4% utilization at 4 hours per week). As for Graviton compatibility, Python/Java-based analysis tools are mostly fine.

---

**문제 11.** In a multi-account environment, two teams want to place resources in the same `ap-northeast-2a` AZ to leverage VPC peering without Cross-AZ costs. But there's a concern that the actual physical AZ may differ. How should this be verified?

A) If the AZ name (`ap-northeast-2a`) matches, it's the same physical AZ
B) If the AZ ID (a format like `apne2-az1`) matches, it's the same physical AZ
C) If both accounts use the same subnet CIDR, it's the same AZ
D) It can only be verified by contacting AWS Support

**정답: B**
해설: AWS intentionally shuffles the mapping between AZ names and actual physical AZs per account. Account A's `ap-northeast-2a` and account B's `ap-northeast-2a` may be different physical AZs. The AZ ID (e.g., `apne2-az1`) points to the same physical AZ across all accounts. You should run `aws ec2 describe-availability-zones --query 'AvailabilityZones[*].[ZoneName,ZoneId]'` via the CLI and compare the AZ IDs. If the AZ ID matches, it's the same physical AZ, so peering traffic incurs no Cross-AZ charge.

---

**문제 12.** From the following, select all the representative patterns of a wrong choice on the SAA exam.

A) Using a Spot instance for a DB master server
B) Using EFS for a Windows AD file share
C) Using NLB + EIP for a partner API that needs a static IP
D) Using a Cluster Placement Group + EFA for an HPC MPI cluster
E) Switching gp2 to gp3 to optimize IOPS and cost simultaneously
F) On new-instance launch, transitioning to InService after a Lifecycle Hook completes initialization

**정답: A, B (wrong choices)**
해설: A - Spot is unsuitable for stateful workloads (DB master). If the instance disappears after the 2-minute notice, DB data and sessions are lost. B - EFS is NFSv4.1 Linux-only. Windows AD integration, SMB, and NTFS ACLs require FSx for Windows File Server. C, D, E, and F are all correct choices.
