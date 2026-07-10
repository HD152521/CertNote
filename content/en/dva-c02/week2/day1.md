# Day 1 - The Anatomy of EC2: Nitro, Instance Families, and What's Inside an AMI

EC2 launched in beta on August 25, 2006, and it's the oldest compute service AWS has. In the beginning it was one instance type (m1.small), a single region (us-east-1), and a plain launch-and-pray model. Twenty years on, EC2 has grown into a sprawling compute ecosystem with 750+ instance types, the Nitro hypervisor, Graviton ARM chips, and directly-attached EBS storage. No developer can memorize all of it, but once you understand the naming convention of the instance families and what Nitro actually means, half the exam questions solve themselves.

Today we won't look at EC2 as a container where code happens to run. We'll look at it as **"an isolated unit of compute that runs a virtualized OS."** We dig into how that isolation is even possible, what an AMI precisely is, and why t2 and t3 behave differently.

## The Virtualization Evolution of EC2: From Xen to Nitro

When EC2 first launched in 2006, the virtualization engine was **Xen** (an open-source hypervisor that began at the University of Cambridge in 2003). Xen started out doing paravirtualization (the guest OS knows it's virtualized and cooperates), but it gradually evolved toward hardware-assisted virtualization (Intel VT-x, AMD-V). The problem was that Xen was heavy. CPU, memory, network, and storage virtualization all happened inside the hypervisor, which carried roughly 30% overhead.

AWS began developing the **Nitro system** in 2013 and first shipped it in 2017 with the c5. Nitro's innovation was **offloading hypervisor functions onto dedicated hardware cards (Nitro Cards)**. Network virtualization is handled by the Nitro Network Card, storage virtualization by the Nitro EBS Card, and security by the Nitro Security Chip. The host OS's KVM (the hypervisor built into the Linux kernel) is left as little more than a thin layer, and the guest instance delivers close to bare-metal performance.

Another byproduct of Nitro was the birth of the **Firecracker microVM**. That microVM — the one Lambda and Fargate run on — boots on top of KVM in under 125ms with a memory footprint below 5MB. Firecracker is the product of the minimal-hypervisor techniques accumulated during Nitro's development, and it makes it possible to run thousands of isolated microVMs on a single host. This is the core infrastructure that made Lambda's "per-function isolation" possible. We'll come back to it in Week 4 when we cover Lambda.

> 🔍 **Going deeper**: The Nitro Security Chip verifies firmware integrity at boot time and prevents the host kernel from directly accessing guest memory. This is one of the reasons AWS was able to patch most instance types so quickly during the 2018 Spectre and Meltdown side-channel attacks. On KVM-based Nitro instances, memory isolation between host and guest is enforced at the hardware level. The full architecture is laid out in the [The Security Design of the AWS Nitro System](https://docs.aws.amazon.com/whitepapers/latest/security-design-of-aws-nitro-system/security-design-of-aws-nitro-system.html) whitepaper.

> 💡 **Related theory**: Hypervisors split into Type 1 (bare-metal, no host OS — VMware ESXi, Xen) and Type 2 (running on top of a host OS — VirtualBox, VMware Workstation) (Popek & Goldberg, 1974). Because KVM is part of the Linux kernel, Nitro is formally Type 2, but since most of the hypervisor functions live on separate hardware, it's effectively closer to Type 1. This hybrid approach satisfies both demands at once: "bare-metal performance, virtualized isolation." The Popek-Goldberg virtualization theorem (1974) defined the conditions for a virtualizable ISA, and x86 didn't seriously start meeting those conditions until Intel VT-x arrived in 2005.

> 📚 **Case study**: Other clouds walked a similar road. GCP uses its own KVM-based hypervisor (Borg → gVisor), while Azure uses a Hyper-V-based hypervisor plus Catapult FPGAs (SmartNICs). All three ultimately converge on the same direction: "keep the hypervisor light, do a lot of the work in hardware." The difference is whether you offload to a custom ASIC (AWS Nitro), an FPGA (Azure Catapult), or standard SmartNIC products (GCP, some of Azure).

## Instance Families: A Single Letter Tells You the Workload Fit

EC2 instance types are named as **family + generation + size**, like `m5.xlarge`. That one family letter is the key.

| Family | Meaning | Suitable workloads | Examples |
|------|------|------|------|
| **t** | Burstable | Variable load, dev environments | t3, t4g |
| **m** | General Purpose | Balanced workloads | m5, m6i, m7g |
| **c** | Compute optimized | CPU-intensive | c5, c6i, c7g |
| **r** | Memory optimized | Memory-intensive (Redis, ElasticSearch) | r5, r6i |
| **x** | Extreme memory | In-memory DBs (SAP HANA) | x1, x2idn |
| **i** | Storage I/O | NoSQL, in-memory analytics | i3, i4i |
| **d** | Dense HDD storage | Large data warehouses | d2, d3 |
| **p** | GPU (high-performance) | Deep learning training | p4, p5 |
| **g** | GPU (graphics) | Gaming, rendering | g4, g5 |
| **inf** | AWS Inferentia | ML inference | inf1, inf2 |
| **trn** | AWS Trainium | ML training (low cost) | trn1 |

The generation number (5, 6, 7) means next-gen chips plus faster networking. The suffixes carry meaning too.

| Suffix | Meaning |
|------|------|
| (none) | Intel Xeon |
| `a` | AMD EPYC |
| `g` | AWS Graviton (ARM) |
| `i` | Intel (explicit notation) |
| `n` | enhanced networking |
| `d` | includes NVMe instance store |
| `e` | extra memory or storage |

> 💡 **Memory tip**: m6g.large reads as "General purpose (m), 6th generation, Graviton (g) ARM chip, large size." On the exam, cost-optimization scenarios almost always steer you toward the Graviton (g) answer (roughly 20% cheaper at the same performance).

> 🔍 **Going deeper**: Graviton's pricing edge is possible because AWS designs the chips itself. Starting with Graviton1 in 2018 (A1 instances, based on ARM Neoverse-N1), Graviton2 in 2020 (Arm Neoverse-N1, 64 cores) went into c6g/m6g/r6g, and Graviton3 in 2021 went into c7g/m7g/r7g. Graviton4, announced in 2023, scaled up to 96 vCPUs in the c8g/m8g series. Instead of buying Intel/AMD chips, AWS designs its own, saves the margin, and passes some of it back to customers. Because the ARM instruction set is RISC, it tends to deliver higher performance per watt than x86.

## The Secret of the t Series: The CPU Credit Mechanism

The t series (burstable) uses a billing model completely different from the other families. Run below the **baseline CPU utilization** and you accumulate CPU credits; exceed the baseline and you consume them.

| Type | vCPU | baseline | credits earned per hour |
|------|------|------|------|
| t3.nano | 2 | 5% / vCPU | 6 |
| t3.micro | 2 | 10% / vCPU | 12 |
| t3.small | 2 | 20% / vCPU | 24 |
| t3.medium | 2 | 20% / vCPU | 24 |
| t3.large | 2 | 30% / vCPU | 36 |

> 🔍 **Going deeper**: The biggest difference between t2 and t3 is **what happens when credits run out**. t2 only has standard mode, so when credits are exhausted it's throttled down to baseline CPU. t3 defaults to unlimited mode, where it keeps bursting even after credits run out — for an additional fee. In CloudWatch, a `CPUSurplusCreditBalance` metric greater than 0 means extra charges are being incurred. For workloads where cost predictability matters, it's safer to explicitly switch t3 to standard mode or move to the m series.

> ⚠️ **Trap**: Using a t3.medium as a "production API server" is almost always the wrong answer on the exam. If traffic frequently exceeds the 30% baseline, credits drain fast, and there's a break-even point past which the unlimited cost becomes more expensive than an m5. AWS Compute Optimizer analyzes this and recommends a family change.

> 💡 **Related theory**: The t series' credit model is a variant of the token bucket algorithm. Tokens (= credits) fill at a fixed rate and are consumed as you use them. When the tokens run dry, you're throttled or charged extra. TCP traffic shaping, API Gateway throttling, DynamoDB provisioned throughput — all the same pattern. AWS reuses this algorithm in many places under the name "burstable capacity."

## AMI: A Disk Image + Metadata

An AMI (Amazon Machine Image) is the disk image you use when launching EC2. More precisely, it's a bundle of **an EBS snapshot (or instance-store manifest) + boot metadata (kernel, ramdisk, block device mapping)**.

```
AMI composition:
├─ Root EBS Snapshot     (OS + pre-installed SW)
├─ Additional EBS Snapshots (optional extra volumes)
├─ Block Device Mapping  (disk → /dev/xvda, etc. mapping)
├─ Kernel/RamDisk ID     (for PV-AMIs)
└─ Launch Permissions    (which accounts can launch from this AMI)
```

There are three kinds of AMI.

| Kind | Source | Characteristics |
|------|------|------|
| AWS-provided | Amazon Linux, Ubuntu, Windows | Regularly patched |
| Marketplace | Vendors (Bitnami, OracleEnt, etc.) | License included, extra hourly cost |
| Community | Other AWS users | Unverified, risky |

An AMI exists **per region**. To use an AMI created in us-east-1 over in ap-northeast-2, you have to copy it with the `CopyImage` API. The copy gets a new ID, and the EBS snapshots are copied along with it (at additional cost).

> 📚 **Case study**: In 2018 a Twitter employee accidentally shared an internal AMI as public. That AMI contained the company's root CA certificate and SSH keys, so it was made private in short order. After this incident, AWS began emphasizing AMI build automation, security scanning, and **automated patching/auditing in Image Builder** through `EC2 Image Builder` (launched in 2019).

> 📚 **Case study**: In 2023, security researchers discovered that some third-party AMIs listed on the AWS Marketplace contained SSH backdoors and unauthorized cron jobs. AWS tightened its automatic scanning policies, but it's safer to verify the AMI fingerprint yourself. In practice, the standard pattern is to pull trusted AMI IDs from SSM Parameter Store (`/aws/service/ami-amazon-linux-latest/...`).

## The EC2 Launch Sequence: User Data and IAM Role

When you launch an EC2 instance, it boots in the following order.

```
1. The Nitro hypervisor allocates the instance and attaches the EBS volume
2. The ENI (Elastic Network Interface) is attached
3. Boot from the AMI (BIOS/UEFI → bootloader → kernel)
4. cloud-init queries metadata from IMDS
   - hostname, security groups, IAM role, etc.
5. cloud-init runs user-data (#!/bin/bash or cloud-config YAML)
6. SSH/RDP services start
```

User data is a bootstrap script that runs once (by default) at instance launch. Common patterns include installing the SSM Agent, downloading application code, and injecting secrets.

```bash
#!/bin/bash
yum update -y
yum install -y httpd
echo "<h1>Hello from $(hostname)</h1>" > /var/www/html/index.html
systemctl enable --now httpd
```

> 🔍 **Going deeper**: user-data can be read from IMDS at `http://169.254.169.254/latest/user-data`. That means **if you bake a password or API key into user-data, every process inside the instance can read it**. The standard pattern is to enforce IMDSv2, use SSM Parameter Store / Secrets Manager, and lean on an IAM Role. When a scenario like "someone baked a DB password into user-data" shows up on the exam, it's almost always the wrong answer, and "fetch it from Secrets Manager at boot" is the right one.

> 💡 **Related theory**: cloud-init is the cloud-OS initialization framework used commonly by RHEL and Ubuntu. Canonical (Ubuntu) built it in 2009 to automate EC2 boot, and it now runs on nearly every environment — AWS, GCP, Azure, OpenStack, local KVM, and more. If you write user-data as cloud-config YAML, you can install packages, create users, and write files through a declarative YAML spec.

## Placement Group: Where to Put Your Instances

This is the option that controls **how instances are distributed** within the same AZ.

| Kind | Placement strategy | Use case |
|------|------|------|
| Cluster | Same rack, same network spine | HPC, low-latency node-to-node comms (MPI) |
| Spread | Different racks (max 7/AZ) | Small critical workloads |
| Partition | Split into multiple partitions, each partition = a different rack group | Cassandra, HDFS (large-scale distributed systems) |

Cluster placement provides 10 Gbps full-bisection bandwidth between instances, minimizing latency for workloads like MPI (Message Passing Interface). The downside is that a hardware failure can take down all the instances together.

> 🔍 **Going deeper**: Partition placement is the same idea as the rack awareness of distributed systems like Cassandra and HBase. Each partition maps to a different rack, power source, and network switch. Put data replicas in different partitions and the data survives even if one partition dies. AWS supports up to 7 partitions per AZ, so you can naturally isolate up to 7 replicas.

## The 4 Pricing Models

| Model | Cost | Guarantee | Suitable use |
|------|------|------|------|
| On-Demand | List price | Starts immediately | Highly variable workloads |
| Reserved Instance (1/3 year) | Up to 72% off | Commitment | Stable baseline |
| Savings Plan | Up to 72% off | Hourly commit | Flexible commitment |
| Spot | Up to 90% off | Reclaimable after 2-minute notice | Fault-tolerant batch jobs |
| Dedicated Host | Expensive | Dedicated physical server | BYOL licensing, regulatory |

> 💡 **Memory tip**: Spot is only for workloads that "**can die at any time**." CI builds, batch analytics, fault-tolerant jobs. When you see "stateless and can be interrupted" on the exam, the answer is Spot.

> 🔍 **Going deeper**: Spot prices are determined dynamically based on AWS's internal demand. It used to require an explicit bid (a maximum bid price), but since 2018 it's been simplified — if you don't specify a max price, it automatically applies the On-Demand price as the ceiling. Spot reclamation always comes with a 2-minute notice (a spot interruption notice via IMDS at `latest/meta-data/spot/instance-action`), so you build your workload to listen for this signal and shut down gracefully. Spot Fleet and EC2 Fleet mix multiple instance types and AZs to spread out the reclamation rate.

## Launching EC2 from the CLI

```bash
aws ec2 run-instances \
  --image-id ami-0abcdef1234567890 \
  --instance-type t3.micro \
  --key-name MyKeyPair \
  --security-group-ids sg-0123456 \
  --subnet-id subnet-0abc123 \
  --iam-instance-profile Name=MyInstanceProfile \
  --user-data file://bootstrap.sh \
  --metadata-options "HttpTokens=required" \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web-1}]'
```

`HttpTokens=required` enforces IMDSv2, the IAM instance profile auto-injects credentials, and the tag provides identification. Remember these 7 options and you can handle nearly every EC2 launch scenario in practice.

## Wrapping Up

The heart of EC2 is **the Nitro hypervisor + the workload fit of the instance families + the AMI lifecycle**. Identify the right workload from a single family letter (t/m/c/r/x/i/d/p/g), cut costs with Graviton (the g suffix), and understand the t series' credit model, and most EC2 questions on the exam solve themselves.

In the next article, we look at EC2's network controls — security groups, key pairs, and user-data security.

---

## 📝 연습 문제

**문제 1.** A company is evaluating a switch from c5.xlarge (Intel) to c6g.xlarge (Graviton). What's required to keep the same performance?

A) It can switch as-is with no code changes
B) A recompile for the ARM64 architecture is required (or use a multi-architecture runtime like Java/Python)
C) Additional licensing costs are incurred
D) The EBS volume must also be converted to ARM (impossible)

**정답: B**
해설: Graviton is an ARM64 architecture, so it can't run x86-64 binaries directly. Compiled languages like C/C++/Go/Rust need a recompile, while interpreted/JIT languages like Java/Python/Node.js run as-is. Container images also need a multi-arch build tagged `linux/arm64`. AWS provides a [Porting Advisor](https://github.com/aws/porting-advisor-for-graviton) for Graviton migrations. At roughly 20% cheaper for the same performance, it comes up frequently as the answer in cost-optimization scenarios.

---

**문제 2.** CPU utilization on a t3.medium instance is always above 50%. What's the cause of the bill coming in far more expensive than expected?

A) A bug in the AWS billing system
B) t3 defaults to unlimited mode, so exceeding the baseline (20%) incurs additional cost
C) An instance in another region is being billed by mistake
D) EBS volume cost

**정답: B**
해설: t3 defaults to unlimited mode, so once it exceeds baseline CPU (20% for t3.medium) it uses surplus credits, and when the surplus credit balance hits 0, additional charges are billed. For a workload that always exceeds baseline, it's more cost-effective to switch to a fixed-performance family like m5 or c5. You can track it with the CloudWatch `CPUSurplusCreditBalance` and `CPUSurplusCreditsCharged` metrics.

---

**문제 3.** A developer baked a DB password into user-data. After being flagged in a security audit, what's the most appropriate alternative?

A) Encrypt the user-data
B) Store the password in AWS Secrets Manager, grant the instance's IAM Role `secretsmanager:GetSecretValue` permission, and have user-data fetch it from Secrets Manager at boot
C) Use the user-data briefly and then delete it
D) Bake the password into the AMI

**정답: B**
해설: user-data can be read by anyone from IMDS, so it's unsuitable for storing passwords. The Secrets Manager + IAM Role pattern is the standard. Put only the "aws secretsmanager get-secret-value ..." command inside user-data and keep the actual password in Secrets Manager. Parameter Store's SecureString also works, but Secrets Manager's automatic rotation is more powerful. D fails for the same reason user-data does (the password leaks when the AMI is shared).

---

**문제 4.** You want to run an MPI-based HPC workload on EC2. To minimize latency between instances?

A) Spread placement group
B) Cluster placement group + Enhanced Networking + Elastic Fabric Adapter
C) Multi-AZ distributed placement
D) Distribute across different regions

**정답: B**
해설: A cluster placement group places instances on the same rack/spine, cutting inter-instance latency to < 50μs. Combining Enhanced Networking (SR-IOV connects a virtual NIC directly to the host NIC) with EFA (Elastic Fabric Adapter, OS bypass for RDMA-like communication) is optimal for MPI workloads. The catch is that a single rack failure takes everything down, so fault tolerance is weak (HPC usually handles this with checkpointing).

---

**문제 5.** Which of the following is the least suitable workload for a Spot Instance?

A) CI/CD build jobs
B) ML model training (with checkpoint saving)
C) An RDBMS primary DB
D) Batch data transformation (Spark)

**정답: C**
해설: Spot is reclaimable after a 2-minute notice, so it's unsuitable for an always-on workload like a stateful primary DB. A, B, and D are all fault-tolerant (can restart from a checkpoint) or idempotent, so reclamation has little impact. For an RDBMS, the standard is to use a managed service like RDS Multi-AZ, or Reserved Instance / On-Demand if self-managed. Since a Spot reclamation only stops the instance with no extra charge, configuring an EBS root volume that preserves data is also key.

---

**문제 6.** You want to move an AMI from us-east-1 to ap-northeast-2. What's the most accurate method?

A) AMIs are global, so it's automatically available
B) Copy it with `aws ec2 copy-image --source-region us-east-1 --source-image-id ami-... --region ap-northeast-2`
C) Rebuild the instance and create a new AMI in ap-northeast-2
D) Use the AMI ID as-is

**정답: B**
해설: AMIs exist per region. You can copy one to another region with the `CopyImage` API, which generates a new AMI ID and copies the EBS snapshots along with it (incurring data transfer costs). An encrypted AMI is re-encrypted with a KMS key in the destination region. A common exam trap: "trying to use the same AMI ID in another region" → always wrong. The ID differs per region.

---

**문제 7.** Which of the following is NOT information you can retrieve from an EC2 instance's IMDS endpoint (169.254.169.254)?

A) The IAM Role's temporary credentials
B) The instance ID, AMI ID, AZ
C) The instance's hourly billing amount
D) user-data

**정답: C**
해설: IMDS provides the instance's own metadata (ID, AZ, instance type, SG, IAM role credentials, user-data, etc.) but does not expose billing information. Billing is queried separately via AWS Cost Explorer or the Cost and Usage Report. You can inspect all IMDS paths with `aws ec2-instance-connect describe-instance-metadata` or, from inside the instance, `curl http://169.254.169.254/latest/meta-data/`. When using IMDSv2 you must first obtain a token via PUT.

---

**문제 8.** An EC2 Spot instance has received a 2-minute interruption notice. What's the most appropriate response?

A) Don't terminate the instance and start a new one in a different region
B) Monitor the IMDS `spot/instance-action` signal, and when received, drain in-flight requests and then shut down gracefully
C) Ignore it and keep running the workload
D) Revoke the IAM Role

**정답: B**
해설: The Spot interruption notice arrives at the IMDS endpoint `http://169.254.169.254/latest/meta-data/spot/instance-action`. The workload should pick up this signal by polling or via EventBridge and then (1) stop accepting new requests, (2) finish in-flight requests, (3) save a state checkpoint, and (4) run the shutdown sequence. Combined with the ALB Target Group's deregistration delay, you can handle reclamation with no user impact.
