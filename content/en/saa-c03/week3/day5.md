# Day 5 - Week 3 Comprehensive Review: Connecting EC2, Storage, ELB, and ASG into One Architecture

This week we covered the core of AWS's compute and storage layers. EC2 instance families and purchase options (Day 11), the principles of choosing among EBS, Instance Store, EFS, and FSx (Day 12), the ALB, NLB, and GLB load-balancing tiers (Day 13), and ASG scaling policies and operating techniques (Day 14). These four aren't independent services; they're the parts that make up a single architecture pattern.

The goal of this review isn't to memorize each one separately but to build the ability to judge "which combination is optimal for the given requirements." The SAA exam asks not about single-service knowledge but about trade-off judgment.

## The Links Connecting This Week's Core Concepts

How do these four areas connect into one?

When you choose an EC2 instance (family and purchase option), you then decide what storage to attach to it (EBS/Instance Store/shared file system). To distribute traffic across multiple instances, you put an ELB in front (ALB/NLB/GLB). And what automatically adjusts the number of instances according to traffic is the ASG.

![The decision path in which each axis of the requirements leads to choices of instance, storage, ELB, and scaling](/diagrams/en/week3-decision-map.svg)

## Key Comparison Tables: At a Glance

### Instance Family Selection Criteria

| Bottleneck resource | Family | Representative workload | Caveat |
|----------|--------|-------------|--------|
| CPU-intensive | C | Encoding, ML inference, batch | Graviton (c7g) is 25% cheaper |
| General purpose | M | App servers, caches | First choice |
| Memory | R | In-memory DB, SAP | Large RAM is the key |
| Memory (extreme) | X | SAP HANA, several TB | Very high cost |
| Local NVMe | I | NoSQL, Kafka brokers | Consider data loss |
| GPU training | P | LLM pre-training | H100/A100 |
| GPU inference | G | ML inference, rendering | A10G |
| Variable load | T | Dev, microservices | Watch T Unlimited cost |
| ARM savings | *g suffix | Open-source stacks in general | Check commercial SW compatibility |

### Purchase Option Trade-offs

| Option | Commitment | Max savings | Usage conditions |
|------|------|---------|---------|
| On-Demand | None | 0% | Short-term, unpredictable |
| Compute SP | 1/3 years | ~66% | Family, Region, and OS can change |
| EC2 Instance SP | 1/3 years | ~72% | Family fixed, size free |
| Standard RI | 1/3 years | ~72% | Type fixed |
| Spot | Immediate | ~90% | Stateless, interruption tolerated |
| Dedicated Host | 1/3 years | - | BYOL licensing |
| Capacity Reservation | None | 0% | Reserves capacity only |

### Storage Decision Tree

```
Just one EC2?
    └─ Need persistence?
        ├─ NO: Instance Store (NVMe, top performance)
        └─ YES: EBS
               ├─ Default: gp3 (IOPS/Throughput independent, 20% cheaper than gp2)
               ├─ High-performance OLTP: io2 (up to 64K IOPS)
               └─ Mission critical: io2 Block Express (up to 256K IOPS)

Shared by multiple EC2s?
    ├─ Linux NFS: EFS (auto-scaling, Multi-AZ)
    ├─ Windows SMB + AD: FSx for Windows
    ├─ HPC/ML parallel + S3 integration: FSx for Lustre
    └─ NetApp migration / multi-protocol: FSx for ONTAP

Object storage / HTTP API: S3
```

### ELB 3 Types Selection Criteria

| Keyword | Answer | Reason |
|--------|------|------|
| HTTP path/host/header routing | ALB | L7 content-based |
| WAF integration | ALB | WAF attaches to ALB |
| gRPC, HTTP/2 | ALB | NLB is TCP only |
| WebSocket sessions | ALB | Supports sticky |
| UDP, game servers | NLB | L4 UDP support |
| Static IP, EIP, partner whitelist | NLB | EIP per AZ |
| Ultra-low latency (μs) | NLB | L4 processing |
| Custom TCP protocol | NLB | Not HTTP |
| NGFW/IPS/DPI chaining | GLB | GENEVE L3 |
| Auto Scaling of security appliances | GLB | Appliance management |

### ASG Scaling Policy Comparison

| Policy | How it works | Usage scenario |
|------|---------|-------------|
| Target Tracking | Automatically tracks a target value (PI control) | Recommended, most situations |
| Predictive | Pre-scales using ML | Periodic patterns |
| Scheduled | Time-based pre-configuration | Predictable patterns |
| Step | Step-wise scaling size | When fine-grained control is needed |
| Simple | Simple +/- N | Legacy, avoid |

## 7 Traps

**Trap 1. Using Instance Store for a DB**
The exam uses "the fastest storage" as bait to present answers that use Instance Store for a database. Instance Store data disappears when the instance stops or terminates, so it must never be used for a DB. However, it can be used as the node disk of a distributed DB such as Cassandra or MongoDB that guarantees durability through replication.

**Trap 2. Using EFS for a Windows AD file share**
EFS is NFSv4.1-based and Linux-only. If you need Windows Active Directory integration, the SMB protocol, or NTFS ACLs, it's FSx for Windows File Server.

**Trap 3. The illusion that a gp2 volume already has the max IOPS**
gp2's IOPS are proportional to size (1GB = 3 IOPS). A 100GB gp2 has a max of 300 IOPS. If you need more IOPS, convert to gp3 and provision IOPS independently. Converting to gp3 is possible immediately with no downtime.

**Trap 4. Expecting a static IP from an ALB**
An ALB has only a DNS name and its IPs change. Registering an ALB IP in a partner's firewall whitelist is impossible. NLB + EIP is the answer. Global Accelerator also provides 2 static Anycast IPs, but unless the question mentions Global Accelerator, NLB + EIP is the simpler answer.

**Trap 5. Detecting app failures with only the ASG's EC2 health check**
The EC2 health check looks only at physical/OS status. Even if the app crashes, EC2 stays in Running state, so it isn't replaced. When operating behind an ALB, you must enable the ELB Health Check type on the ASG.

**Trap 6. Using Spot instances for Stateful workloads**
Even if "maximum savings" is in the requirements, Spot is the wrong answer for Stateful workloads (DB master, session servers, license servers). This is because they can disappear at any time after a 2-minute notice. Spot is the correct answer only for Stateless workloads (batch, big data, ML training checkpoints).

**Trap 7. The illusion that NLB Cross-Zone is ON by default**
For ALB, Cross-Zone is ON by default (no additional cost), but for NLB and GLB it's OFF by default. If the number of targets per AZ is uneven on an NLB, traffic distribution becomes skewed. Enabling Cross-Zone incurs additional data transfer cost.

## Interaction Patterns Between Services

In real architectures these services work in combination. You need to understand the representative patterns to solve scenario questions.

**Pattern A: Standard 3-tier web service**
```
Internet → ALB (Multi-AZ, HTTPS, WAF)
              ↓ Host/Path routing
         ASG (EC2, Mixed Instances, Spot 60% + OD 40%)
              ↓
         EBS gp3 (application data)
         EFS (shared config, uploaded files)
              ↓
         RDS Multi-AZ (reads via Read Replica)
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
                                       ↓ (passes inspection)
                                ALB → EC2 ASG → RDS
```

**Pattern E: HPC cluster**
```
EC2 c7g.metal (Cluster Placement Group)
    ├─ EFA (OS-bypass networking, 100Gbps)
    ├─ FSx for Lustre (POSIX, ultra-fast parallel I/O)
    └─ Instance Store (temporary scratch)
```

## Cost Optimization Pattern Summary

When "cost optimization" appears in a scenario, analyze it with this framework.

```
1. Classify the workload
   - Stateless + interruption tolerated → Spot (up to 90% savings)
   - Predictable baseline load → Compute SP or RI
   - Short-term/unpredictable → On-Demand

2. Instance right-sizing
   - Check whether Graviton (ARM) is possible (25% savings)
   - Pick the family based on actual CPU/memory utilization

3. Storage optimization
   - Convert gp2 → gp3 (20% savings)
   - EFS IA Lifecycle Policy (automatic tiering of long-unaccessed files)
   - S3 Intelligent-Tiering or Glacier

4. Usage pattern optimization
   - Scheduled shutdown of nighttime dev/test ASGs
   - Analyze actual CloudWatch usage data before applying Reserved Instances
```

## Reliability Design Patterns

When "keep the service running even if one AZ fails" appears in a scenario:

```
Required checklist:
□ ALB: Multi-AZ subnets (at least 2 AZs)
□ ASG: Min=2 or more, register multiple AZ subnets
□ RDS: Multi-AZ deployment (synchronous replication)
□ ElastiCache: Redis Cluster Mode Enabled (Multi-AZ)
□ EFS: Multi-AZ mount targets
□ S3: Multi-AZ durability by default (no separate setup needed)
```

When "keep the service running even if an entire Region fails" appears:
```
Additional requirements:
□ Route 53 Health Check + Failover records
□ RDS Cross-Region Read Replica (manual promote)
  or Aurora Global Database (RPO < 1 second)
□ S3 Cross-Region Replication
□ CloudFront (edge cache buffers origin failures)
□ ASG + EC2 standby stack in a second Region
```

---

## 📝 Scenario Practice Questions

**Question 1.** A global e-commerce platform runs in the AWS Seoul Region. Design an architecture that satisfies all of the following requirements.
- Traffic is 5 times normal from 8:00 to 18:00 Monday through Friday
- No service interruption on a single AZ failure
- Guarantee baseline capacity while minimizing cost
- Need to defend against SQL Injection attacks

A) On-Demand EC2 + ALB (Single-AZ) + RDS Single-AZ + Shield Standard
B) Spot EC2 ASG (Multi-AZ) + ALB (WAF) + RDS Multi-AZ + Scheduled Scaling + Compute SP (baseline load)
C) RI 3y (all EC2) + NLB (Multi-AZ) + RDS Multi-AZ + Target Tracking
D) Dedicated Host EC2 + ALB (WAF) + RDS Multi-AZ + Manual Scaling

**Answer: B**
Explanation: The Monday-Friday pattern is pre-scaled with Scheduled Scaling, baseline load is covered by Compute SP (commitment savings), and the portion above peak is handled with Spot. ALB + WAF defends against SQL Injection. Multi-AZ ASG + RDS Multi-AZ handle a single AZ failure. A fails to handle failures because it's Single-AZ. C can't apply WAF to an NLB. D's Manual Scaling is inefficient in both cost and elasticity.

---

**Question 2.** A company is migrating from on-premises NetApp ONTAP storage to AWS. Both Linux and Windows servers must access the same file system, and it plans to migrate gradually while synchronizing with SnapMirror from on-premises. Also, after the migration is complete, both NFS and SMB must be supported. Which service is suitable?

A) EFS (NFSv4.1-based)
B) FSx for Windows File Server (SMB-based)
C) FSx for NetApp ONTAP
D) FSx for OpenZFS

**Answer: C**
Explanation: FSx for NetApp ONTAP simultaneously supports NFS, SMB, and iSCSI multi-protocol. SnapMirror replication with on-premises NetApp is possible, so gradual migration is natural. NetApp's native features such as WAFL file system-based snapshots, thin provisioning, and deduplication are also usable as-is. EFS supports only NFS, FSx Windows only SMB, and OpenZFS only NFS.

---

**Question 3.** A financial trading company is moving its new order system to AWS. Requirements: (1) minimize network latency (μs level), (2) a static IP must be registered in the whitelist on the partner system's firewall, (3) use the FIX protocol (a TCP-based custom protocol), (4) MPI communication between order-processing servers. What is the most suitable architecture?

A) ALB (Multi-AZ) + EC2 ASG (Spread Placement Group)
B) NLB (EIP) + EC2 Cluster Placement Group (EFA) + Nitro instances
C) Global Accelerator + ALB + EC2 ASG
D) GLB + NLB + EC2 ASG

**Answer: B**
Explanation: FIX protocol (TCP custom) + partner static IP → NLB + EIP. Low-latency MPI communication between servers → Cluster Placement Group + EFA (OS-bypass networking). Nitro instances offload I/O overhead to hardware to minimize latency. ALB routes only HTTP/HTTPS and isn't compatible with the FIX protocol. Spread is for isolation, which is the opposite of low-latency MPI.

---

**Question 4.** A startup is launching a new SaaS product. Traffic is very low at first, but if it succeeds it could surge by dozens of times. It must handle a surge that could occur at any time within 1 year without service interruption, while minimizing cost. It's planned to operate for 3 years or more in the long term.

A) Reserved Instance 3 years + Multi-AZ ASG
B) On-Demand only + Manual Scaling
C) Compute Savings Plans 3 years (baseline) + Spot (peak handling) + Target Tracking ASG
D) Spot 100% + Target Tracking ASG + Multi-AZ

**Answer: C**
Explanation: It's planned to run for 3 years, but the initial traffic pattern is uncertain, so Compute SP (free to change family and Region) is more suitable than RI. Baseline load is saved with Compute SP, and surge periods are handled with Spot. A Target Tracking ASG adjusts scale automatically. Spot 100% suits only Stateless workloads, and a SaaS service may have session state. B is inefficient in both cost and elasticity.

---

**Question 5.** A company runs a PostgreSQL database on EC2 using an EBS gp2 volume (200GB). The DBA's analysis shows average IOPS usage of 800 and a peak of 2,000, exceeding gp2's maximum IOPS of 600 (200GB × 3), causing performance degradation. What is the most cost-effective solution?

A) Expand the gp2 volume to 1,000GB
B) Convert gp2 to io2 (provision 2,000 IOPS)
C) Convert to gp3 and set IOPS to 3,000
D) Add a second gp2 volume to the instance and configure RAID 0

**Answer: C**
Explanation: gp3 lets you independently set up to 16,000 IOPS regardless of size, and it's 20% cheaper than gp2. Since you need 2,000 IOPS at peak, setting 3,000 IOPS is sufficient. A (expanding gp2) requires buying an unnecessarily large volume to get 1,000GB × 3 = 3,000 IOPS. io2 is for mission-critical environments needing 64K IOPS and is far more expensive than gp3. RAID 0 has high complexity and management overhead.

---

**Question 6.** For a web server run by an Auto Scaling Group, every time a new instance starts the following tasks are needed: fetch DB connection info from Parameter Store, create the config file and start the app, and warm up the Redis cache. This whole process takes 4 minutes. If ALB traffic arrives before the 4 minutes are complete, errors occur. What is the most appropriate setting?

A) Health Check Grace Period = 0, Slow Start = 240 seconds
B) Health Check Grace Period = 240 seconds, ALB Target Group Slow Start = 120 seconds
C) Lifecycle Hook (Pending:Wait) + call complete-lifecycle-action + Slow Start = 120 seconds
D) Add a 4-minute sleep to the User Data script

**Answer: C**
Explanation: Use a Lifecycle Hook Pending:Wait to complete the 4 minutes of initialization, then call `complete-lifecycle-action SUCCESS` to transition to InService. Even if ALB health check failures occur up to this stage, the Grace Period protects it. After transitioning to InService, it receives traffic gradually through Slow Start (120 seconds) and stabilizes. If you only set the Health Check Grace Period to 240 seconds, the ALB health check may suddenly send a lot of traffic after that time passes. A User Data sleep is an anti-pattern that wastes resources.

---

**Question 7.** A company is moving on-premises physical servers to AWS. Among the migration targets are a SQL Server Enterprise license (billed per socket) and Oracle DB (billed per CPU core). To use the licenses on AWS as BYOL?

A) EC2 Dedicated Instance
B) EC2 Dedicated Host
C) EC2 Spot instance (the cheap option)
D) EC2 On-Demand (regular shared host)

**Answer: B**
Explanation: SQL Server socket billing and Oracle core billing both calculate licenses based on the number of physical CPU sockets/cores. A Dedicated Host occupies a specific physical server, and AWS exposes that server's socket and core counts. A Dedicated Instance isolates the physical host within the same account but doesn't show which physical server it is, so it can't be used for license counting. On a shared host (regular On-Demand), you can't know the number of physical cores, so applying a BYOL license is not possible.

---

**Question 8.** A video streaming service runs a pipeline that processes user-uploaded videos. The video encoding jobs are CPU-intensive and take 30-120 minutes. If an encoding job is interrupted, it can restart from the last checkpoint (saved to S3 every 10 minutes). To operate reliably while cutting cost as much as possible?

A) c6i.8xlarge On-Demand EC2 + SQS message queue
B) c7g.8xlarge Spot EC2 + SQS + EventBridge Spot interruption handler
C) c6i.8xlarge RI 1 year + SQS
D) Fargate Spot (vCPU = 8) + SQS

**Answer: B**
Explanation: Video encoding is CPU-intensive (C family). c7g is Graviton3 ARM and 25% cheaper than c6i (x86). Because there are checkpoints, Spot interruption can be tolerated. If you detect the `EC2 Spot Instance Interruption Warning` event with EventBridge and requeue the SQS message, another Spot instance continues the processing. SQS acts as the job queue and distributes jobs across multiple encoding instances. RI is inefficient unless the structure has 30-120 minute jobs running around the clock.

---

**Question 9.** Which of the following is the combination of settings that maximizes availability on a Spot instance interruption in an ASG?

A) `lowest-price` Spot strategy + a single instance type
B) `capacity-optimized` Spot strategy + multiple instance types + Capacity Rebalancing enabled
C) `diversified` Spot strategy + a single AZ
D) `lowest-price` Spot strategy + 100% On-Demand base

**Answer: B**
Explanation: `capacity-optimized` picks the Spot pool with the most spare capacity currently in AWS to minimize the interruption probability. Allowing multiple instance types means that if Spot pressure hits any one type, the other types cover it. Capacity Rebalancing starts replacement instances in advance on an interruption warning to maintain the count. `lowest-price` can concentrate on the cheapest pool, concentrating interruptions. A single AZ risks total downtime on an AZ failure or a Spot shortage in that AZ.

---

**Question 10.** A company runs a 10TB-scale data analysis every Sunday at 2 a.m. The analysis needs a large amount of RAM (256GB), and the results are stored in S3. The analysis job can't be interrupted, and the instance can be terminated after completion. What is the most cost-effective method?

A) r6i.16xlarge (256GB RAM) On-Demand, manual start/stop every week
B) r6i.16xlarge Spot + checkpoints, Scheduled Scaling
C) r7g.16xlarge On-Demand, automatic start/stop with Scheduled Scaling
D) r6i.16xlarge Reserved Instance 1 year + Scheduled Scaling

**Answer: C**
Explanation: Since the analysis job can't be interrupted, Spot is unsuitable. r7g is Graviton3 ARM and about 25% cheaper than r6i (Intel x86). If you raise Desired to 1 every Sunday at 2 a.m. with Scheduled Scaling and reduce it to 0 after completion (set Min=0 for the ASG, or terminate via EventBridge + Lambda), you pay only for the hours used. A 1-year RI wastes the remaining time in a pattern that uses only a few hours per week (utilization of 2.4% at 4 hours per week). Graviton compatibility is mostly not a problem if the analysis tools are Python/Java-based.

---

**Question 11.** In a multi-account environment, two teams want to place resources in the same `ap-northeast-2a` AZ to use VPC peering without Cross-AZ cost. However, there's a concern that the actual physical AZs may differ. How should they verify?

A) If the AZ names (`ap-northeast-2a`) are the same, it's the same physical AZ
B) If the AZ IDs (in a format like `apne2-az1`) are the same, it's the same physical AZ
C) If both accounts use the same subnet CIDR, it's the same AZ
D) It can be verified only by contacting AWS Support

**Answer: B**
Explanation: AWS deliberately shuffles the mapping between AZ names and actual physical AZs per account. Account A's `ap-northeast-2a` and account B's `ap-northeast-2a` may be different physical AZs. An AZ ID (e.g., `apne2-az1`) points to the same physical AZ in every account. You need to run `aws ec2 describe-availability-zones --query 'AvailabilityZones[*].[ZoneName,ZoneId]'` in the CLI and compare the AZ IDs. If the AZ IDs are the same, it's the same physical AZ, so no Cross-AZ charges are applied to the peering traffic.

---

**Question 12.** Select all of the following that are representative patterns of wrong choices on the SAA exam.

A) Using a Spot instance for a DB master server
B) Using EFS for a Windows AD file share
C) Using NLB + EIP for a partner API that needs a static IP
D) Using Cluster Placement Group + EFA for an HPC MPI cluster
E) Converting gp2 to gp3 to optimize IOPS and cost simultaneously
F) Moving to InService after initialization completes via a Lifecycle Hook when launching a new instance

**Answer: A, B (wrong choices)**
Explanation: A - Spot is unsuitable for Stateful workloads (DB master). If the instance disappears after a 2-minute notice, DB data and sessions are lost. B - EFS is NFSv4.1 and Linux-only. For Windows AD integration, SMB, and NTFS ACLs, you need FSx for Windows File Server. C, D, E, and F are all correct choices.
