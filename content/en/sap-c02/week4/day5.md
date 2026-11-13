# Day 5 - Week 4 Review: A Comprehensive Look at Hybrid Cloud Architecture

The theme of Week 4 was "how far can we push out the boundary of AWS?" We learned the five answers AWS offers to two fundamental constraints the public cloud can't solve: the latency created by physical distance and the data location forced by regulation. Outposts (AWS racks inside the customer's building), Local Zones (AWS sites in major cities), Wavelength (AWS next to 5G base stations), Storage Gateway (extending on-premises storage into the cloud), and the Snow Family (data movement that beats the internet through physical shipping). And on top of that, EKS/ECS Anywhere, which extends container orchestration on-premises.

This week's services share one design philosophy: even in situations where data or compute can't be in an AWS Region (regulation, physical distance, no network, air gap), you can still use the AWS APIs and operating model as is. Once you understand this philosophy, the judgment "if there is this constraint, use this service" comes naturally without memorizing each service. Today we raise that judgment to exam level.

---

## Week 4 Key Decision Tree

On the SAP-C02 exam, hybrid cloud questions are usually decomposed along three axes. First, where must data/compute physically be? Second, how low must the latency be? Third, is a network connection possible? If you get a decision tree along these three axes into your hands, a question gets its direction in the first 15 seconds.

```
Can the data not leave the customer's building?
  └── YES → AWS Outposts (AWS hardware inside the customer's facility)
              ├── Large workload + own power/cooling available → Outposts Rack
              ├── Small branch/store/clinic → Outposts Servers
              ├── Sub-millisecond communication with on-premises equipment needed → connect directly to the on-premises LAN via LGW
              ├── K8s workload + AWS Managed CP + data sovereignty → EKS on Outposts
              └── AWS connectivity always required (if the Service Link drops, no new instances/IAM)

Need under 1ms latency for users in a specific city?
  └── YES + general internet/Wi-Fi users → Local Zones (AWS infrastructure inside the city)
      YES + 5G mobile/IoT devices → AWS Wavelength (AWS inside the carrier's 5G MEC)

Extending on-premises storage into the cloud?
  ├── NFS/SMB file protocol + S3 backend + data lake → S3 File Gateway
  ├── Windows AD/ACL/NTFS OpLock + SMB → FSx File Gateway
  ├── iSCSI block storage + keep all data locally → Volume Gateway Stored
  ├── iSCSI block storage + small local capacity + large cloud capacity → Volume Gateway Cached
  └── Existing tape backup SW (Veeam/NetBackup) without modification → Tape Gateway (VTL)

Need to migrate large-scale data to AWS?
  ├── Sufficient network (≥1Gbps) + incremental sync + integrity verification → DataSync
  ├── Insufficient network or physical isolation or large one-time migration → Snow Family
  │   ├── Ultra-compact (~14TB, battery, drone/vehicle/ship deployment) → Snowcone
  │   ├── Large capacity (80TB each, edge computing, S3-compatible) → Snowball Edge
  │   └── Exabyte scale (discontinued 2024) → Snowmobile
  └── Always-on hybrid mount + file/block/tape → Storage Gateway

Need to run containers on-premises?
  ├── Air gap + EKS-compatible K8s → EKS Anywhere
  ├── Keep existing ECS + no K8s staff + AWS CP managed → ECS Anywhere
  ├── K8s + Outposts + AWS Managed CP + depends on Regional CP → EKS on Outposts Extended Cluster
  ├── K8s + Outposts + tolerance for Region disconnection (Local CP) → EKS on Outposts Local Cluster
  └── Visualize multiple K8s clusters in a single console → EKS Connector
```

The Week 4 services extend the "AWS boundary" at different layers. Outposts transplants the **entire L1-L7 stack** into the customer's facility. Local Zones and Wavelength move **L1-L3 (infrastructure)** to the city/base station. Storage Gateway keeps the **L4-L7 (service protocols)** NFS/SMB/iSCSI on-premises while replacing the backend with S3/Glacier. The Snow Family replaces the **physical layer (L0)**, the data carrier itself. EKS/ECS Anywhere adjusts the **control plane location** to extend the AWS operating model on-premises. Understanding this layer-by-layer classification lets you intuitively grasp which constraint calls for which service.

---

## Location-Based Services Deep Dive

### Physical Location and Latency Comparison by Service

| Service | Physical location | Target latency | Data sovereignty | AWS connectivity dependence | Main use cases |
|--------|-----------|-----------|------------|--------------|---------------|
| Public Region | AWS data center | 100ms+ | Not met | Not needed (self-contained) | Standard cloud workloads |
| Outposts Rack | Customer data center | Sub-millisecond (LAN) | Fully met | Required (Service Link) | Regulation, data sovereignty, factory automation |
| Outposts Servers | Branch/retail store/clinic | Sub-millisecond (LAN) | Fully met | Required (Service Link) | Small-scale distributed edge deployments |
| Local Zones | AWS-operated metro facility | 1-5ms | Partially met | Not needed (self-contained) | Gaming, media rendering, real-time ML |
| Wavelength | Carrier 5G MEC | 1-10ms | Partially met | Not needed (self-contained) | Autonomous driving, 5G IoT, AR/VR |

The physical lower bound on latency is calculated by the speed of light. The propagation speed of light in optical fiber is about 2/3 of the vacuum speed, 200,000km/s. The theoretical lower bound for round-trip latency between Seoul and Virginia (about 11,000km) is about 110ms. In practice, routing hops, queuing delay, and processing delay add up to 150-200ms. A Local Zone places AWS facilities inside the city to cut the "last mile" distance to a few km. The round-trip propagation delay from Seoul's Gangnam to the Seoul Local Zone is only 0.1ms. Wavelength places compute in the carrier's 5G MEC facilities to shrink the distance a 5G packet travels from the base station to the processing node to within a few km. Even adding the 5G link's own latency (1-5ms), a total within 10ms is achievable.

### AWS Outposts Architecture Deep Dive

The core component of Outposts is the Service Link. The Service Link is an encrypted VPN channel from the Outposts rack to the parent AWS Region. Through this channel run the control plane operations: IAM authentication, KMS key access, ECR image pulls, CloudWatch metric transmission, SSM agent communication, and launching new EC2 instances.

```
Outposts internal configuration:
  [On-premises server/DB] ─── LGW (Local Gateway) ─── Outposts Rack
                                                          │
                                                       Service Link (encrypted VPN)
                                                          │
                                                       Parent AWS Region
                                                          ├── EC2 control plane
                                                          ├── IAM
                                                          ├── EBS snapshots → S3
                                                          └── CloudWatch

Services that can be created on Outposts (partial):
  ├── EC2 (some M, R, C families)
  ├── EBS (gp2/gp3 local)
  ├── RDS (MySQL, PostgreSQL)
  ├── EKS (Extended or Local Cluster)
  ├── ECS
  ├── ElastiCache
  └── EMR
```

> 🔍 **Behavior when the Service Link is cut**: When the Service Link drops, already-running EC2 instances keep operating at the hypervisor level. The data plane (network packet forwarding, EBS I/O) is normal. But launching new instances (IAM authentication impossible), creating EBS snapshots (can't reach the parent Region's S3), sending CloudWatch metrics (halted, sent later on reconnection), running SSM commands, and AWS Systems Manager Patch Manager patching all become impossible. This is a key constraint of AWS Outposts in contrast to Azure Stack Hub's Disconnected Mode (fully autonomous operation). For this reason, high availability for the Outposts Service Link must be secured with DX redundancy or a VPN backup.

---

## Storage Gateway Deep Dive

### Detailed Comparison of the 4 Gateway Types

| Gateway | Protocol | Backend | Local cache | Key differentiator |
|-----------|---------|--------|---------|-----------|
| S3 File Gateway | NFS v3/v4.1, SMB | S3 native objects | Recently used file cache | Data lake, S3 without app changes |
| FSx File Gateway | SMB v2/v3 | FSx for Windows | Recently used file cache | **Needs AD/ACL/NTFS OpLock** |
| Volume Cached | iSCSI block | S3 primary storage + local cache | Cache of frequently used data | Small local disk and large data |
| Volume Stored | iSCSI block | Local primary storage + async S3 | All data local | Lowest-latency iSCSI + S3 for DR |
| Tape Gateway | iSCSI VTL | S3 VTL + Glacier Deep Archive | None (streaming) | Existing backup SW (Veeam/NetBackup) without modification |

> ⚠️ **Multi-gateway cache inconsistency trap**: When several branches share the same S3 bucket through S3 File Gateway, a file written by one branch may not be visible immediately at another branch. S3 has guaranteed strong consistency since December 2020, but the Storage Gateway cache layer masks it. Because each gateway runs an independent cache, even if gateway A writes a file and flushes it to S3, gateway B's cache may still hold an old version. There are two solutions: (1) S3 event notification → Lambda → automatically calling the `RefreshCache` API, or (2) switching to FSx File Gateway (NTFS OpLock prevents distributed cache conflicts). On the exam, when "concurrent edit conflicts + Windows file share" appears, it is FSx File Gateway.

(Hypothetical example) A global media group built a hybrid video editing pipeline. Original RAW footage (4K ProRes, several TB/day) is written from on-premises camera equipment to an S3 File Gateway mounted over NFS. An AWS editing cluster (GPU EC2) accesses S3 directly through the S3 API to handle AI color grading and noise removal. Premiere Pro project files (accessed concurrently by multiple editors, NTFS file locking essential) are shared between the on-premises editing rooms and cloud workstations through FSx File Gateway. Finished final videos are automatically archived by an S3 Lifecycle policy to Glacier Instant Retrieval after 90 days and Glacier Deep Archive after 1 year. With this setup they moved 75% of the on-premises NAS capacity to S3 and storage cost dropped 62%.

---

## Snow Family vs DataSync Deep Dive

### Selection Criteria Formulas

```
DataSync selection criteria:
  Effective bandwidth = line bandwidth × 60-70% (TCP overhead, retransmission)
  Transfer time = data size ÷ effective bandwidth
  → If transfer time < 7 days, consider DataSync first

Snow Family selection criteria:
  → Transfer time > 7 days
  → No network connection (physically isolated)
  → Air-gapped environment (offline data collection)
  → Field sites needing edge computing (construction sites, ships, military units)

Worked example:
  Line 100Mbps × 60% = 60Mbps = 7.5MB/s
  100TB ÷ 7.5MB/s = 13,653,333 seconds ≈ 158 hours ≈ 6.6 days
  
  Line 1Gbps × 60% = 600Mbps = 75MB/s  
  100TB ÷ 75MB/s = 1,365,333 seconds ≈ 15.8 days
  → Even at 1Gbps, Snow can be better than the network for 100TB
```

"Never underestimate the bandwidth of a station wagon full of magnetic tape speeding down the highway." The modern implementation of this principle is the Snow Family. If you ship an 80TB Snowball Edge with 2-day delivery, the equivalent bandwidth is 80TB/2 days = 80×8×1024²Mb / 172,800 seconds = about 3.8Gbps. That is a "bandwidth" 3.8x faster than a 1Gbps DX. Only when compared with 10Gbps DX does the network finally beat physical shipping (10Gbps effective 6Gbps > 3.8Gbps). The larger the data and the slower the line, the more economical physical movement is. Snowball's security consists of 256-bit AES encryption (KMS-managed keys) + a tamper-evident physical case + a TPM chip + the NIST SP 800-88 data erasure process.

| Snow device | Usable storage | Edge computing | Special features |
|----------|--------------------|------------|---------|
| Snowcone | 8TB (HDD) / 14TB (SSD) | 2 vCPU, 4GB RAM | Built-in battery, deployable on drones/vehicles |
| Snowball Edge Storage Optimized | 80TB | 40 vCPU, 80GB RAM | On-device S3-compatible API |
| Snowball Edge Compute Optimized | 28TB | 52 vCPU, 208GB RAM + GPU | GPU ML inference, edge video processing |
| Snowmobile | 100PB | N/A | Discontinued in 2024 |

---

## Container On-Premises Extension Deep Dive

### EKS/ECS Anywhere vs EKS on Outposts Comparison

| Item | ECS Anywhere | EKS Anywhere | EKS on Outposts (Extended) | EKS on Outposts (Local) |
|------|-------------|-------------|---------------------------|------------------------|
| Control plane location | AWS Region (fully managed) | Customer hardware (customer-managed) | AWS Region (fully managed) | Outposts hardware (AWS-managed) |
| AWS connectivity required | Always | Optional | Always | Works even when disconnected |
| Air-gap support | Not possible | Possible (local mirror) | Not possible | Limited |
| Required hardware | Customer servers (x86/ARM) | vSphere/bare metal | AWS Outposts | AWS Outposts |
| Kubernetes version | None (ECS tasks) | EKS-D | AWS EKS | AWS EKS |
| Recommended team skill | ECS operators | K8s experts | Basic K8s knowledge | Basic K8s knowledge |

With ECS Anywhere and EKS on Outposts Extended Cluster, the control plane is in the AWS Region. This means worker nodes need an AWS connection to receive new tasks/Pods. A 30-second disconnection is not a big problem, but if a disconnection of minutes to hours occurs, failover becomes impossible. With EKS Anywhere and EKS on Outposts Local Cluster, the control plane (API server, etcd, Controller Manager, Scheduler) is on customer hardware. Pod scheduling, ReplicaSet automatic recovery, ConfigMap/Secret management, and HPA all work without an AWS connection. The AWS connection is used only optionally for ECR image pulls, CloudWatch transmission, and EKS Connector visualization.

> 🎯 **Defense contractor 3-environment scenario**: A defense contractor operates a military logistics system in three different environments. (1) A military data center fully cut off from the internet → EKS Anywhere (air-gapped mode, local Harbor registry, on-premises etcd). (2) A general corporate office + existing ECS use + no K8s staff → ECS Anywhere (the AWS ECS console/CLI as is, on-premises servers as External Instances). (3) AWS Outposts inside a secret facility + AWS Managed K8s + tolerance for Region disconnection needed → EKS on Outposts Local Cluster (control plane on Outposts, Pod scheduling maintained even when disconnected). You must be able to judge immediately why a different service is optimal for each of the three environments.

---

## Keyword → Service Quick Mapping Table

| Scenario keyword | Service to recall immediately | Rationale |
|---------------|----------------|------|
| "Data must not leave the building" | Outposts | Physically inside the customer's building |
| "Sub-millisecond with factory LAN equipment" | Outposts + LGW | LGW connects directly to the on-premises LAN |
| "What if the Service Link drops?" | Existing instances keep running, new ones impossible | Control plane = AWS Region |
| "1ms in a major city, general internet" | Local Zones | AWS infrastructure inside the city |
| "5G devices 10ms, carrier" | Wavelength | AWS inside the MEC |
| "Windows AD file share, concurrent editing" | FSx File Gateway | NTFS OpLock, AD integration |
| "NetBackup/Veeam as is" | Tape Gateway (VTL) | iSCSI VTL emulation |
| "iSCSI + small local + large cloud capacity" | Volume Gateway Cached | S3 primary storage + local cache |
| "NFS/SMB → S3 data lake" | S3 File Gateway | NFS mount + S3 native |
| "500TB, 100Mbps line" | Snow Family | Physical movement is faster than the network |
| "5TB/day + 10Gbps + integrity verification" | DataSync | Sufficient line + automatic checksums |
| "Air-gapped K8s, self-operated" | EKS Anywhere | Supports air-gapped mode |
| "Existing ECS + on-premises nodes" | ECS Anywhere | Keeps the ECS console/CLI |
| "Multiple K8s clusters in a single console" | EKS Connector | Visualizes external clusters |
| "Outposts + K8s + tolerance for Region disconnection" | EKS on Outposts Local | Local control plane |
| "Drone/vehicle deployment, under 14TB" | Snowcone | Battery, ultra-compact |
| "On-site GPU ML inference + Snow" | Snowball Edge Compute Optimized | GPU option |
| "Hosted DX + multiple VPCs" | Transit VIF not possible → Dedicated needed | Hosted doesn't support Transit VIF |

---

## SAP-C02 Scenario Decomposition Methodology (Applied to Week 4)

```
5-step analysis:
1. WHO: Who is the subject of the data/compute?
   (equipment inside the customer's facility, city users, 5G devices, on-premises servers)

2. WHAT: What is needed?
   (storage extension, large data migration, K8s workloads, ultra-low-latency compute)

3. WHY: Why can't the AWS Region be used?
   (data sovereignty regulation, physical distance, no network, air gap)

4. CONSTRAINTS: What is the decisive constraint?
   (transfer time, latency requirement, air gap or not, K8s staff or not, whether existing SW can be modified)

5. KEYWORD mapping:
   "Must not leave the building" → Outposts
   "1ms + general internet" → Local Zones
   "10ms + 5G" → Wavelength
   "Air-gapped K8s" → EKS Anywhere
   "Existing NetBackup" → Tape Gateway
   "Physical movement faster than the network" → Snow Family
   "Sufficient line + incremental + verification" → DataSync
```

---

## 📝 Practice Questions

**Question 1.** Under Korean medical law, patient imaging data (CT, MRI) must not leave the hospital building. An AWS AI diagnosis model must be applied to the images in real time, and it must communicate with the medical equipment (PACS server) at sub-millisecond latency. What is the best service?

A) Local Zones (Seoul extension) + PACS server DX connection  
B) AWS Outposts (hospital server room) + PACS connection via Local Gateway  
C) AWS Wavelength (SK Telecom 5G MEC)  
D) AWS Lambda (Seoul Region) + DX Private VIF  

**Answer: B**

Explanation: Two conditions decide the answer. (1) "Must not leave the building" = only Outposts places AWS hardware inside the customer's building so the data physically stays inside the building. (2) "Sub-millisecond communication with the PACS server" = through the Local Gateway (LGW), Outposts connects directly to the on-premises LAN and achieves sub-millisecond latency. Local Zones (A) are separate AWS-operated facilities, so they are "outside the building." Wavelength (C) is a carrier facility. Lambda (D) runs in the Seoul Region data center. All three are outside the hospital building and fail to meet the medical law.

---

**Question 2.** A New York financial trading firm must provide algorithmic traders with a real-time quote dashboard at under 1ms latency. The traders use the office wired Ethernet network. 5G is not used. There is no data sovereignty regulation. What is the best service?

A) AWS Outposts (office server room)  
B) AWS Local Zones (us-east-1-nyc-1a)  
C) AWS Wavelength (Verizon New York)  
D) Global Accelerator + us-east-1 EC2  

**Answer: B**

Explanation: Wired internet environment + under 1ms latency + no data sovereignty regulation = Local Zones is the answer. The New York Local Zone (us-east-1-nyc-1a) places AWS infrastructure in downtown New York and provides under 1ms round-trip latency. Outposts (A) is excessive in hardware purchase/operating cost and complexity when there is no data sovereignty requirement. Wavelength (C) is optimal when 5G mobile devices are the clients and has no advantage in a wired office environment (since it doesn't go through the 5G RAN, the latency reduction of Wavelength placement has no effect). Global Accelerator + us-east-1 (D) has an unavoidable minimum of 3-5ms latency because of the physical distance between New York and Virginia (about 350km), so it can't meet the 1ms requirement.

---

**Question 3.** An autonomous delivery robot sends route recalculation requests over 5G in the city center. If response latency exceeds 15ms, the obstacle avoidance algorithm fails. The city has SK Telecom 5G infrastructure. What is the best service?

A) AWS Outposts (robot maintenance center)  
B) Local Zones (Seoul)  
C) AWS Wavelength (SK Telecom partnership)  
D) Seoul Region EC2 + Global Accelerator  

**Answer: C**

Explanation: "5G-connected device + response within 15ms" is the exact use case of Wavelength. A 5G packet is processed by the adjacent Wavelength Zone EC2 directly from the base station without passing through the 5G core network. Since the distance between base station and compute is within a few km, a total round-trip latency within 10ms is achieved. Local Zones (B) provide city-level latency to users on general internet connections, but when a 5G device exits through the 5G core to the internet and reaches the Local Zone, extra hops arise and reaching 15ms is unstable. Seoul Region + GA (D) is expected to take 20-30ms along the 5G core → internet → Seoul Region path.

---

**Question 4.** A petrochemical company must collect 250TB of data from an offshore platform with no internet connection into AWS S3. It must also run an ML inference workload on the platform that preprocesses the data. What is the best solution?

A) Install satellite internet (Starlink) + DataSync  
B) Snowball Edge Compute Optimized (GPU option) + periodic shipment and pickup  
C) Snowcone + subsea cable connection  
D) Storage Gateway S3 File + satellite connection  

**Answer: B**

Explanation: Two requirements are needed at the same time: (1) large-scale data collection in an environment without a network, and (2) on-site ML inference. Snowball Edge Compute Optimized has 28TB of storage + 52 vCPU + 208GB RAM + an NVIDIA V100 GPU built in, so it runs ML inference on site, collects the data, and then is shipped to AWS on the platform's supply vessel. The S3-compatible API runs on-device, minimizing changes to existing applications. Snowcone (C) is small at 14TB or less and unsuitable for collecting 250TB. Satellite internet (A, D) has hopelessly insufficient bandwidth for transferring 250TB from an offshore platform (Starlink 100Mbps × 60% × transfer time = several weeks).

---

**Question 5.** A consulting firm's 20 branch offices run Windows file servers. HQ and branches edit the same files concurrently and control access with Active Directory group policy. They want to switch to central management while keeping response speed with a local branch cache. What is the right solution?

A) S3 File Gateway (deployed at each branch) + S3 + RefreshCache via S3 event notification  
B) FSx File Gateway (each branch) + central FSx for Windows File Server  
C) Volume Gateway Cached Mode + EFS Multi-AZ  
D) Daily sync with DataSync + keep local file servers  

**Answer: B**

Explanation: Windows AD ACLs + prevention of concurrent edit conflicts (NTFS OpLock/file locking) + a local cache are all needed. FSx File Gateway meets all three. Each branch's FSx File Gateway keeps frequently used files in the local cache, and the actual storage is in the central FSx for Windows File Server. With domain join, the existing AD policies apply as is. S3 File Gateway (A) doesn't fully support NTFS OpLock, so file locking doesn't work properly during concurrent editing and data conflicts can occur. Automating RefreshCache can improve consistency but doesn't solve file locking. Volume Gateway (C) is iSCSI block storage, not an SMB file share. DataSync (D) is batch synchronization and unsuitable for real-time file sharing.

---

**Question 6.** A broadcaster keeps 30 years of archives on 40,000 physical LTO tapes. It wants to move to the cloud while keeping Veritas NetBackup software unmodified, and shorten restore time without transporting physical tapes. What is the right solution?

A) S3 File Gateway + S3 Glacier Deep Archive  
B) Tape Gateway (iSCSI VTL) + S3 Glacier Deep Archive  
C) DataSync + S3 Glacier  
D) Bulk migration of physical tape data with Snowball Edge + S3  

**Answer: B**

Explanation: "Without modifying existing NetBackup software" is the key. Tape Gateway emulates an iSCSI VTL (Virtual Tape Library) interface so NetBackup recognizes it like physical tape equipment. Backup jobs run as is and data is stored in the S3 VTL. When the "Archive" command is run, it moves to Glacier Deep Archive. On restore, it is handled with just a Glacier restore request, without transporting physical tapes (standard restore 3-5 hours, Bulk restore 12 hours). S3 File Gateway (A) is an NFS/SMB interface with no VTL, so NetBackup doesn't recognize it as tape equipment. DataSync (C) is a file copy tool without backup software VTL integration. Snowball (D) is a one-time physical migration and unsuitable for ongoing backup.

---

**Question 7.** A defense contractor must run a Kubernetes-based logistics system on a fully isolated military network (air gap). It has its own K8s operations team and needs EKS-compatible Kubernetes. AWS connectivity is completely cut off. What is the right service?

A) AWS ECS Anywhere  
B) AWS EKS Anywhere  
C) EKS on Outposts Extended Cluster  
D) AWS Fargate  

**Answer: B**

Explanation: Air gap + self-operated K8s CP + EKS-compatible = EKS Anywhere. EKS Anywhere is based on EKS-D (EKS Distro) and is deployed on customer hardware (vSphere, bare metal, etc.), and in air-gapped mode it uses a local Harbor registry and an on-premises mirror repository to operate fully self-sufficiently without an AWS connection. The Kubernetes API server, etcd, and Controller Manager are all on customer hardware, so Pod scheduling, automatic recovery, and ConfigMap management work in an air gap. ECS Anywhere (A) has its control plane in the AWS Region and always requires an AWS connection. EKS on Outposts Extended Cluster (C) also has its control plane in the AWS Region, so it needs connectivity and Outposts hardware. Fargate (D) is Region-only.

---

**Question 8.** A retailer runs microservices on AWS ECS. Under a personal information protection law, some data processing must run only on-premises. It has no Kubernetes experts and wants to keep its existing ECS Task Definition, CLI, and console operating model as is. What is the right solution?

A) EKS Anywhere (build an on-premises K8s cluster)  
B) ECS Anywhere (register on-premises servers as External Instances)  
C) EKS on Outposts Local Cluster  
D) AWS Fargate + VPC Endpoint (processing only in private subnets)  

**Answer: B**

Explanation: "Keep the existing ECS approach + no K8s staff + run on-premises" must all be satisfied. With ECS Anywhere the control plane is the fully managed AWS ECS, and on-premises servers are registered to the ECS cluster as External Instances through the SSM Agent and ECS Agent. Existing ECS Task Definitions, the `aws ecs run-task` CLI, and the ECS console work as is. Tasks running on on-premises External Instances keep data on-premises. No K8s knowledge is needed. EKS Anywhere (A) requires operating the K8s control plane yourself, so K8s experts are essential. EKS on Outposts (C) requires purchasing Outposts hardware. Fargate (D) runs in the AWS Region and so doesn't meet the on-premises processing requirement.

---

**Question 9.** A film production company transfers 5TB of raw footage daily from an on-premises NAS to S3. It has a 10Gbps Dedicated DX line. It needs automatic checksum verification that the S3 and NAS file contents match exactly, and it must run automatically at a specific time every night. What is the best solution?

A) Ship a Snowball Edge every day  
B) AWS DataSync (nightly schedule + checksum verification enabled)  
C) S3 File Gateway + S3 Lifecycle  
D) A direct S3 REST API upload script (multipart + manual MD5 comparison)  

**Answer: B**

Explanation: 10Gbps DX + 5TB/day is easily handled by DataSync (about 1.9 hours based on 6Gbps effective of 10Gbps). DataSync automatically computes checksums (SHA-256) before and after transfer to verify data integrity between source and destination, and automatically retransmits when a mismatch is found. The scheduling feature also supports nightly cron automation. Shipping a Snowball every day (A) is completely uneconomical and operationally burdensome in a 10Gbps DX environment. S3 File Gateway (C) is an always-on mount tool, and its scheduled transfer and checksum comparison are not as strong as DataSync's. A direct script (D) requires implementing parallel processing optimization, automatic retries, and integrity verification yourself and has a heavy operational burden.

---

**Question 10.** At a factory with an AWS Outposts Rack installed, the Service Link connection was completely cut for 45 minutes. During this period, what is the state of the factory control system (running on Outposts EC2) and of the EC2 instances that must be newly deployed?

A) All existing instances are automatically terminated after 5 minutes  
B) Existing running instances keep operating, but launching new instances, IAM authentication, and creating EBS snapshots are impossible  
C) Outposts automatically switches to Disconnected Mode and all functions work normally  
D) Instances keep running but EBS volume I/O stops immediately  

**Answer: B**

Explanation: AWS Outposts doesn't support an official Disconnected Mode. When the Service Link is cut, things split into two categories. What keeps working: EC2 instances the hypervisor has already started, local EBS volume I/O, the Outposts internal VPC network (subnet-to-subnet communication), and LGW communication with the on-premises LAN. What stops: launching new EC2 instances (can't reach AWS STS for IAM authentication), creating EBS snapshots (can't connect to the parent Region's S3), sending CloudWatch metrics/logs (some buffered data is sent on reconnection after the disconnection), SSM Run Command, and most management operations through the AWS console/CLI. For this reason, when running important workloads like factory automation on Outposts, you must protect the Service Link with DX redundancy (Maximum Resiliency). C is a nonexistent feature (Azure Stack Hub has a Disconnected Mode but Outposts does not).

---

**Question 11.** Which of the following correctly distinguishes the use cases of AWS DataSync and Storage Gateway?

A) DataSync is used when an always-on mount is needed, and Storage Gateway is used for one-time bulk migration  
B) DataSync is used for one-time or regular batch transfer + integrity verification, and Storage Gateway is used for always-on hybrid storage mounts  
C) DataSync supports only block storage, and Storage Gateway supports only file storage  
D) Both can be used equally when migrating on-premises file servers to S3, so choose only by cost  

**Answer: B**

Explanation: DataSync and Storage Gateway have different purposes. DataSync is a migration/synchronization tool that "moves data from A to B." It transfers between a source (NFS, SMB, S3, HDFS, EFS, etc.) and a destination on a schedule or one time, and verifies each file's checksum to guarantee integrity. After the transfer, the DataSync task is complete. Storage Gateway is a hybrid integration tool that lets "on-premises applications keep using AWS storage as if it were local storage." The gateway must always be running and applications access it continuously through NFS/SMB/iSCSI. A has the explanation reversed. C is wrong (DataSync covers file/object/other storage, Storage Gateway covers file/block/tape). D is wrong (the purposes of use are fundamentally different).

---

**Question 12.** A company wants to provide an AR (augmented reality) remote medical consultation service from the MEC facilities of 5G partner carriers on 6 continents. A surgeon assists a patient thousands of km away in real time over a 5G connection using a smartphone. The latency requirement is within 20ms one-way. What is the best approach to deploy this service using AWS global infrastructure?

A) Deploy EC2 in AWS Regions on each continent + Global Accelerator  
B) Deploy AWS Wavelength Zones in the carrier partner 5G MEC on 6 continents  
C) Deploy Local Zones in major cities on 6 continents  
D) AWS edge cache (CloudFront) + Lambda@Edge  

**Answer: B**

Explanation: A 5G device (smartphone) + 20ms one-way = Wavelength is the exact use case. Wavelength places EC2 inside the carrier's 5G MEC facility to minimize the distance a 5G packet travels from the base station to the Wavelength Zone. It achieves within 5-10ms one-way, so it meets the 20ms requirement with margin. Global Accelerator + a Region (A) goes through the 5G core → internet → AWS PoP → Region path, so 30-100ms one-way is expected. Local Zones (C) are optimal for city-level general internet access and have no way to bypass the 5G core, so they can't reduce latency for 5G devices as much as Wavelength. CloudFront + Lambda@Edge (D) is an HTTP request-response pattern and has difficulty meeting the latency requirement for real-time two-way AR streaming.

---

## Next Week Preview: Week 5 Global Architecture

Week 5 covers the core services of AWS global architecture. The topics are Multi-Region patterns, the 7 Route 53 routing policies (simple/weighted/latency/failover/geolocation/geoproximity/multivalue answer), CloudFront in depth (OAC, Origin Failover, criteria for choosing Lambda@Edge vs CloudFront Functions), and choosing between Global Accelerator and CloudFront. The common keyword is "how to serve global users with low latency while also being resilient to failure." Practicing mapping the 7 Route 53 routing policies to scenarios will be key.
