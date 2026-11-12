# Day 5 - Week 4 Review: Comprehensive Hybrid Cloud Architecture

This week's theme was "How far can AWS extend its boundaries?" We learned five AWS solutions to two fundamental constraints unresolved by public cloud — latency from physical distance and data location mandated by regulation. Outposts (AWS racks inside customer buildings), Local Zones (major city AWS presence), Wavelength (AWS next to 5G base stations), Storage Gateway (extending on-premises storage to cloud), Snow Family (defeating internet through physical shipping), and even extending container orchestration on-premises with EKS/ECS Anywhere.

The common design philosophy across this week's services is singular: enable AWS API and operational methods to work unchanged in situations where data or computing cannot be in AWS regions—regulations, physical distance, network absence, air-gap. Internalizing this philosophy means judging "this constraint requires this service" naturally without memorizing individual services. Today we elevate that judgment capability to exam level.

---

## Week 4 Core Decision Tree

SAP-C02 hybrid cloud problems typically decompose into three axes. First, where must data/computing physically reside? Second, how low must latency be? Third, is network connectivity available? Internalizing this three-axis decision tree means 70% of problems are directionally correct in the first 15 seconds.

```
Can data not leave customer buildings?
  └── YES → AWS Outposts (AWS hardware in customer facility)
              ├── Large workload + own power/cooling available → Outposts Rack
              ├── Small branch/retail/clinic → Outposts Servers
              ├── Sub-millisecond communication with on-premises equipment needed → Connect on-premises LAN directly via LGW
              ├── K8s workload + AWS Managed CP + data sovereignty → EKS on Outposts
              └── AWS connectivity always required (Service Link disconnection prevents new instances/IAM)

Sub-1ms latency required for specific city users?
  └── YES + general internet/Wi-Fi users → Local Zones (AWS infrastructure within city)
      YES + 5G mobile/IoT devices → AWS Wavelength (AWS within telecom 5G MEC)

Extending on-premises storage to cloud?
  ├── NFS/SMB file protocol + S3 backend + data lake → S3 File Gateway
  ├── Windows AD/ACL/NTFS OpLock + SMB → FSx File Gateway
  ├── iSCSI block storage + retain all data locally → Volume Gateway Stored
  ├── iSCSI block storage + small local capacity + large cloud capacity → Volume Gateway Cached
  └── Existing tape backup SW (Veeam/NetBackup) without modification → Tape Gateway (VTL)

Large data transfer to AWS?
  ├── Sufficient network (≥1Gbps) + incremental sync + integrity validation → DataSync
  ├── Network insufficient OR physical isolation OR large one-time transfer → Snow Family
  │   ├── Ultra-compact (~14TB, battery, drone/vehicle/ship deployment) → Snowcone
  │   ├── Large capacity (80TB/unit, edge computing, S3-compatible) → Snowball Edge
  │   └── Exabyte (discontinued 2024) → Snowmobile
  └── Always-on hybrid mount + file/block/tape → Storage Gateway

Running containers on-premises?
  ├── Air-gap + EKS-compatible K8s → EKS Anywhere
  ├── Maintain existing ECS + no K8s staff + AWS managed CP → ECS Anywhere
  ├── K8s + Outposts + AWS Managed CP + depends on region CP → EKS on Outposts Extended Cluster
  ├── K8s + Outposts + resilient to region disconnection (Local CP) → EKS on Outposts Local Cluster
  └── Multiple K8s clusters single console visibility → EKS Connector
```

> 💡 **OSI Layer and Hybrid Boundary**: Week 4 services extend "AWS boundary" at different layers. Outposts transplants **entire L1-L7 stack** to customer facilities. Local Zones and Wavelength move **L1-L3 (infrastructure)** to cities/base stations. Storage Gateway maintains **L4-L7 (service protocols)** like NFS/SMB/iSCSI on-premises while replacing backend with S3/Glacier. Snow Family replaces **physical layer (L0)** data carrier itself. EKS/ECS Anywhere adjust **control plane location** extending AWS operations to on-premises. Understanding this layer-by-layer classification intuitivally reveals which constraint requires which service.

---

## Location-Based Service Deep Dive

### Service Physical Location and Latency Comparison

| Service | Physical Location | Target Latency | Data Sovereignty | AWS Connectivity Requirement | Primary Use Case |
|---------|-------------------|-----------------|------------------|-----------------------------|-----------------|
| Public Region | AWS Data Center | 100ms+ | Not satisfied | Not required (self-contained) | Standard cloud workload |
| Outposts Rack | Customer Data Center | Sub-millisecond (LAN) | Fully satisfied | Required (Service Link) | Regulation, data sovereignty, factory automation |
| Outposts Servers | Branch/Retail/Clinic | Sub-millisecond (LAN) | Fully satisfied | Required (Service Link) | Small edge distributed deployment |
| Local Zones | AWS-operated major city facility | 1-5ms | Partially satisfied | Not required (self-contained) | Gaming, media rendering, real-time ML |
| Wavelength | Telecom 5G MEC | 1-10ms | Partially satisfied | Not required (self-contained) | Autonomous driving, 5G IoT, AR/VR |

> 💡 **Physical Lower Bound of Propagation Latency**: Latency's physical floor is calculated by light speed. In optical fiber, light propagates at about 2/3 vacuum speed, 200,000km/s. Theoretical lower bound round-trip latency Seoul-Virginia (approximately 11,000km) is about 110ms. Realistically, routing hops, queuing delay, processing delay add 150-200ms total. Local Zone places AWS infrastructure within-city, reducing "last mile" distance to kilometers. Round-trip propagation latency Seoul Gangnam to Seoul Local Zone is merely 0.1ms. Wavelength places computing within telecom 5G MEC, reducing distance from 5G packets' base-station-to-processing-node travel to within kilometers. Combined with 5G link inherent latency (1-5ms), achieves total within 10ms.

### AWS Outposts Architecture Deep Dive

Outposts' core component is Service Link. Service Link is an encrypted VPN channel from Outposts racks to parent AWS region. Through this channel, IAM authentication, KMS key access, ECR image pulls, CloudWatch metrics transmission, SSM agent communication, and control plane operations for new EC2 instances occur.

```
Outposts Internal Configuration:
  [On-premises servers/DB] ─── LGW (Local Gateway) ─── Outposts Rack
                                                      │
                                                   Service Link (Encrypted VPN)
                                                      │
                                                   Parent AWS Region
                                                      ├── EC2 Control Plane
                                                      ├── IAM
                                                      ├── EBS Snapshots → S3
                                                      └── CloudWatch

Services creatable on Outposts (partial):
  ├── EC2 (some M, R, C series)
  ├── EBS (gp2/gp3 local)
  ├── RDS (MySQL, PostgreSQL)
  ├── EKS (Extended or Local Cluster)
  ├── ECS
  ├── ElastiCache
  └── EMR
```

> 🔍 **When Service Link Disconnects**: When Service Link breaks, existing running EC2 instances continue operating at hypervisor level. Data plane (network packet forwarding, EBS I/O) is normal. However, launching new instances (IAM authentication impossible), creating EBS snapshots (cannot access parent region S3), CloudWatch metrics transmission (interrupted, resumes after reconnection), SSM command execution, AWS Systems Manager Patch Manager patching all become impossible. This core AWS Outposts constraint contrasts with Azure Stack Hub's supported Disconnected Mode (fully autonomous operation). This makes Outposts Service Link high availability essential through DX redundancy or VPN backup.

---

## Storage Gateway Deep Dive

### Four Gateway Types Detailed Comparison

| Gateway | Protocol | Backend | Local Cache | Key Differentiator |
|---------|----------|---------|-------------|-------------------|
| S3 File Gateway | NFS v3/v4.1, SMB | S3 native objects | Recent files cached | Data lake, S3 without app modification |
| FSx File Gateway | SMB v2/v3 | FSx for Windows | Recent files cached | **AD/ACL/NTFS OpLock needed** |
| Volume Cached | iSCSI Block | S3 primary + local cache | Frequently used data cached | Small local disk, large data scenario |
| Volume Stored | iSCSI Block | Local primary + S3 async | Entire data local | Lowest latency iSCSI + S3 DR purpose |
| Tape Gateway | iSCSI VTL | S3 VTL + Glacier Deep Archive | None (streaming) | Existing backup SW (Veeam/NetBackup) without modification |

> ⚠️ **Multiple Gateway Cache Inconsistency Pitfall**: When multiple branches share same S3 bucket via S3 File Gateway, files written by one branch may not immediately appear in another. While S3 guarantees Strong Consistency since December 2020, Storage Gateway's cache layer obscures this. Each gateway operates independent cache; even if gateway A writes files and flushes to S3, gateway B's cache may retain old versions. Two solutions: (1) S3 event notification → Lambda → automatic `RefreshCache` API call, (2) Switch to FSx File Gateway (NTFS OpLock prevents distributed cache conflicts). On exam, "concurrent edit conflict + Windows file share" = FSx File Gateway.

> 📚 **Global Media Hybrid Pipeline**: A global media group built hybrid video editing pipeline. Original footage raw files (4K ProRes, several TB/day) record from on-premises cameras to NFS-mounted S3 File Gateway. AWS editing cluster (GPU EC2) accesses directly via S3 API performing AI color correction and noise removal. Premiere Pro project files (multiple editors concurrent access, NTFS file locking required) share between on-premises editing rooms and cloud workstations via FSx File Gateway. Completed final videos automatically archive via S3 Lifecycle to Glacier Instant Retrieval after 90 days, Glacier Deep Archive after 1 year. This configuration transferred 75% of on-premises NAS capacity to S3, reducing storage costs 62%.

---

## Snow Family vs DataSync Deep Dive

### Selection Criteria Calculation

```
DataSync Selection Criteria:
  Effective bandwidth = line bandwidth × 60-70% (TCP overhead, retransmission)
  Transfer time = data size ÷ effective bandwidth
  → If transfer time < 7 days, prioritize DataSync

Snow Family Selection Criteria:
  → Transfer time > 7 days
  → No network connectivity (physical isolation)
  → Air-gap environment (offline data collection)
  → Edge computing needed on-site (construction, ships, military)

Real-world calculation example:
  100Mbps line × 60% = 60Mbps = 7.5MB/s
  100TB ÷ 7.5MB/s = 13,653,333 seconds ≈ 158 hours ≈ 6.6 days
  
  1Gbps line × 60% = 600Mbps = 75MB/s  
  100TB ÷ 75MB/s = 1,365,333 seconds ≈ 15.8 days
  → Even at 1Gbps, 100TB could favor Snow over network
```

> 💡 **Andrew Tanenbaum's Bandwidth Principle**: "Never underestimate the bandwidth of a station wagon full of magnetic tape driving down the highway." This principle's modern implementation is Snow Family. Sending Snowball Edge 80TB with 2-day shipping creates equivalent bandwidth of 80TB/2days = 80×8×1024²Mb / 172,800seconds ≈ 3.8Gbps. This is 3.8x faster than 1Gbps DX. Must compare against 10Gbps DX (effective 6Gbps) for network to beat physical shipping. Larger data, slower line, makes physical transfer more economical. Snowball security comprises 256-bit AES encryption (KMS-managed keys) + Tamper-Evident physical case + TPM chip + NIST SP 800-88 data erasure process.

| Snow Device | Available Storage | Edge Computing | Special Features |
|------------|------------------|---------------|-----------------|
| Snowcone | 8TB (HDD) / 14TB (SSD) | 2 vCPU, 4GB RAM | Battery built-in, drone/vehicle deployable |
| Snowball Edge Storage Optimized | 80TB | 40 vCPU, 80GB RAM | On-device S3-compatible API |
| Snowball Edge Compute Optimized | 28TB | 52 vCPU, 208GB RAM + GPU | GPU ML inference, edge video processing |
| Snowmobile | 100PB | N/A | Discontinued 2024 |

---

## Container On-Premises Expansion Deep Dive

### EKS/ECS Anywhere vs EKS on Outposts Comparison

| Item | ECS Anywhere | EKS Anywhere | EKS on Outposts (Extended) | EKS on Outposts (Local) |
|------|-------------|-------------|---------------------------|------------------------|
| Control Plane Location | AWS Region (fully managed) | Customer hardware (customer managed) | AWS Region (fully managed) | Outposts hardware (AWS managed) |
| AWS Connectivity Required | Always required | Optional | Always required | Operates when disconnected |
| Air-gap Support | Not possible | Possible (local mirror) | Not possible | Limited |
| Required Hardware | Customer servers (x86/ARM) | vSphere/bare metal | AWS Outposts | AWS Outposts |
| Kubernetes Version | None (ECS task) | EKS-D | AWS EKS | AWS EKS |
| Recommended Team Capability | ECS operator | K8s expert | Basic K8s knowledge | Basic K8s knowledge |

> 🔍 **Control Plane Location Meaning**: ECS Anywhere and EKS on Outposts Extended Cluster have control planes in AWS regions. This means worker nodes need AWS connectivity to receive new tasks/Pods. 30-second disconnection causes no major problem, but minutes-hours disconnection prevents failover. EKS Anywhere and EKS on Outposts Local Cluster have control planes (API server, etcd, Controller Manager, Scheduler) on customer hardware. Pod scheduling, ReplicaSet auto-recovery, ConfigMap/Secret management, HPA all function without AWS connectivity. AWS connectivity serves only optional ECR image pulls, CloudWatch transmission, EKS Connector visibility.

> 🎯 **Defense Contractor 3-Environment Scenario**: A defense contractor operates military logistics systems in three different environments. (1) Completely internet-blocked military data center → EKS Anywhere (air-gap mode, local Harbor registry, on-premises etcd). (2) General corporate office + existing ECS use + no K8s staff → ECS Anywhere (AWS ECS console/CLI unchanged, on-premises servers as External Instances). (3) Classified facility within AWS Outposts + AWS Managed K8s + region disconnection resilience needed → EKS on Outposts Local Cluster (control plane on Outposts, Pod scheduling maintained even during disconnection). You must instantly judge why different services are optimal for each environment.

---

## Keyword → Service Quick Mapping Table

| Scenario Keyword | Immediate Service | Rationale |
|---------------|------------------|-----------|
| "Data cannot leave building" | Outposts | Physically in customer building |
| "Factory LAN equipment sub-millisecond" | Outposts + LGW | LGW direct-connects on-premises LAN |
| "If Service Link breaks?" | Existing instances work, new cannot | Control plane = AWS region |
| "Major city 1ms, general internet" | Local Zones | AWS infrastructure within city |
| "5G device 10ms, telecom" | Wavelength | AWS within MEC |
| "Windows AD file share, concurrent edit" | FSx File Gateway | NTFS OpLock, AD integration |
| "NetBackup/Veeam unchanged" | Tape Gateway (VTL) | iSCSI VTL emulation |
| "iSCSI + small local + large cloud" | Volume Gateway Cached | S3 primary + local cache |
| "NFS/SMB → S3 data lake" | S3 File Gateway | NFS mount + S3 native |
| "500TB, 100Mbps line" | Snow Family | Physical movement faster than network |
| "5TB/day + 10Gbps + integrity validation" | DataSync | Sufficient line + automatic checksum |
| "Air-gap K8s, self-operated" | EKS Anywhere | Air-gap mode supported |
| "Existing ECS + on-premises nodes" | ECS Anywhere | ECS console/CLI maintained |
| "Multiple K8s clusters single console" | EKS Connector | External cluster visibility |
| "Outposts + K8s + region disconnection resilience" | EKS on Outposts Local | Local control plane |
| "Drone/vehicle deployment, <14TB" | Snowcone | Battery, ultra-compact |
| "On-site GPU ML inference + Snow" | Snowball Edge Compute Optimized | GPU option |
| "Hosted DX + multi-VPC" | Transit VIF impossible → Dedicated needed | Hosted doesn't support Transit VIF |

---

## SAP-C02 Scenario Decomposition Methodology (Week 4 Application)

```
5-Step Analysis:
1. WHO: Who is the subject of data/computing?
   (customer facility equipment, city users, 5G devices, on-premises servers)

2. WHAT: What is needed?
   (storage extension, large data transfer, K8s workload, ultra-low-latency computing)

3. WHY: Why can't AWS region be used?
   (data sovereignty regulation, physical distance, network absence, air-gap)

4. CONSTRAINTS: What are decisive constraints?
   (transfer time, latency requirement, air-gap status, K8s staff availability, existing SW modification possible)

5. KEYWORD MAPPING:
   "Cannot leave building" → Outposts
   "1ms + general internet" → Local Zones
   "10ms + 5G" → Wavelength
   "Air-gap K8s" → EKS Anywhere
   "Existing NetBackup" → Tape Gateway
   "Physical movement faster than network" → Snow Family
   "Sufficient line + incremental + validation" → DataSync
```

---

## 📝 Practice Questions

**Question 1.** Under Korean medical law, patient imaging data (CT, MRI) must not leave the hospital building. An AWS AI diagnostic model must be applied to the images in real time, and it must communicate with the medical equipment (PACS server) at sub-millisecond latency. What is the most appropriate service?

A) Local Zones (Seoul expansion) + DX connection to the PACS server  
B) AWS Outposts (hospital server room) + connect to the PACS through the Local Gateway  
C) AWS Wavelength (SK Telecom 5G MEC)  
D) AWS Lambda (Seoul Region) + DX Private VIF  

**Answer: B**

Explanation: Two conditions decide the answer. (1) "No removal from the building" = only Outposts places AWS hardware inside the customer's building, so the data physically stays in the building. (2) "Sub-millisecond communication with the PACS server" = through the Local Gateway (LGW), Outposts connects directly to the on-premises LAN and achieves sub-millisecond latency. Local Zones (A) are separate facilities operated by AWS and are therefore "outside the building." Wavelength (C) is a telecom carrier facility. Lambda (D) runs in a data center in the Seoul Region. All three services are outside the hospital building and therefore do not satisfy the medical law.

---

**Question 2.** A New York financial trading firm must provide algorithmic traders with a real-time market data dashboard at under 1 ms latency. The traders use the office wired Ethernet network. They do not use 5G. There is no data sovereignty regulation. What is the most appropriate service?

A) AWS Outposts (office server room)  
B) AWS Local Zones (us-east-1-nyc-1a)  
C) AWS Wavelength (Verizon New York)  
D) Global Accelerator + us-east-1 EC2  

**Answer: B**

Explanation: Wired network environment + under 1 ms latency + no data sovereignty regulation = Local Zones is the answer. The New York Local Zone (us-east-1-nyc-1a) places AWS infrastructure in downtown New York and provides under 1 ms round-trip latency. Outposts (A) is excessive in hardware purchase/operation cost and complexity when there is no data sovereignty requirement. Wavelength (C) is optimal when 5G mobile devices are the clients and offers no advantage in a wired office environment (since traffic does not go through the 5G RAN, Wavelength placement brings no latency reduction). Global Accelerator + us-east-1 (D) inevitably incurs at least 3-5 ms of latency because of the physical distance between New York and Virginia (about 350 km), so it cannot meet the 1 ms requirement.

---

**Question 3.** Autonomous delivery robots send route recalculation requests over 5G in a downtown area. If the response latency exceeds 15 ms, the obstacle avoidance algorithm fails. The city has SK Telecom 5G infrastructure. What is the most appropriate service?

A) AWS Outposts (robot maintenance center)  
B) Local Zones (Seoul)  
C) AWS Wavelength (SK Telecom partnership)  
D) EC2 in the Seoul Region + Global Accelerator  

**Answer: C**

Explanation: "5G-connected devices + response within 15 ms" = the exact use case for Wavelength. 5G packets are processed directly by EC2 in the adjacent Wavelength Zone without passing from the base station through the 5G core network. Because the distance between the base station and the compute is within a few km, a total round-trip latency within 10 ms is achieved. Local Zones (B) provide city-level latency to users on ordinary internet connections, but when 5G devices exit to the internet through the 5G core and reach the Local Zone, an extra hop is added and meeting 15 ms is unreliable. The Seoul Region + GA (D) is expected to take 20-30 ms over the 5G core → internet → Seoul Region path.

---

**Question 4.** A petrochemical company must collect 250 TB of data into AWS S3 from an offshore platform with no internet connection. It must also run ML inference workloads on the platform to preprocess the data. What is the most appropriate solution?

A) Install satellite internet (Starlink) + DataSync  
B) Snowball Edge Compute Optimized (GPU option) + periodic shipping and retrieval  
C) Snowcone + subsea cable connection  
D) Storage Gateway S3 File + satellite connection  

**Answer: B**

Explanation: Two requirements are needed at the same time: (1) large-scale data collection in an environment without a network, and (2) on-site ML inference. Snowball Edge Compute Optimized has built-in 28 TB of storage + 52 vCPUs + 208 GB RAM + an NVIDIA V100 GPU, so it runs ML inference on site, collects the data, and is shipped to AWS on the platform's supply vessel. The S3-compatible API runs on the device, minimizing changes to existing applications. Snowcone (C) is small at 14 TB or less and is unsuitable for collecting 250 TB. Satellite internet (A, D) has far too little bandwidth to transfer 250 TB from an offshore platform (Starlink 100 Mbps × 60% × transfer time = several weeks).

---

**Question 5.** A consulting firm has 20 branch offices that operate Windows file servers. The headquarters and branches edit the same files simultaneously, and access is controlled by Active Directory group policy. It wants to move to central management while keeping response speed with a local cache at each branch. What is an appropriate solution?

A) S3 File Gateway (deployed at each branch) + S3 + RefreshCache via S3 event notifications  
B) FSx File Gateway (each branch) + central FSx for Windows File Server  
C) Volume Gateway Cached Mode + EFS Multi-AZ  
D) Synchronize daily with DataSync + keep the local file servers  

**Answer: B**

Explanation: Windows AD ACLs + prevention of concurrent-edit conflicts (NTFS OpLock/file locking) + a local cache are all required. FSx File Gateway satisfies all three. The FSx File Gateway at each branch keeps frequently used files in the local cache, and the actual storage is in the central FSx for Windows File Server. With a domain join, the existing AD policy applies as is. S3 File Gateway (A) does not fully support NTFS OpLock, so file locking does not work properly during concurrent editing and data conflicts can occur. Automating RefreshCache can improve consistency but does not solve file locking. Volume Gateway (C) is iSCSI block storage, not an SMB file share. DataSync (D) is batch synchronization and is unsuitable for real-time file sharing.

---

**Question 6.** A broadcaster keeps 30 years of archives on 40,000 physical LTO tapes. It wants to migrate to the cloud while keeping its Veritas NetBackup software unmodified, and to shorten restore time without transporting physical tapes. What is an appropriate solution?

A) S3 File Gateway + S3 Glacier Deep Archive  
B) Tape Gateway (iSCSI VTL) + S3 Glacier Deep Archive  
C) DataSync + S3 Glacier  
D) Move the physical tape data in bulk with Snowball Edge + S3  

**Answer: B**

Explanation: "Without modifying the existing NetBackup software" is the key. Tape Gateway emulates an iSCSI VTL (Virtual Tape Library) interface so NetBackup recognizes it like a physical tape device. Backup jobs run as they are and the data is stored in the S3 VTL. On an "Archive" command, it moves to Glacier Deep Archive. Restores are handled with only a Glacier restore request, without transporting physical tapes (Standard restore 3-5 hours, Bulk restore 12 hours). S3 File Gateway (A) has an NFS/SMB interface and no VTL, so NetBackup does not recognize it as a tape device. DataSync (C) is a file copy tool with no VTL integration for backup software. Snowball (D) is a one-time physical move and is unsuitable for ongoing backups.

---

**Question 7.** A defense contractor must operate a Kubernetes-based logistics system on a completely isolated military network (air-gapped). It has its own K8s operations team and needs EKS-compatible Kubernetes. The AWS connection is completely cut off. Which service is appropriate?

A) AWS ECS Anywhere
B) AWS EKS Anywhere
C) EKS on Outposts Extended Cluster
D) AWS Fargate

**Answer: B**

Explanation: Air-gapped + operating its own K8s control plane + EKS-compatible = EKS Anywhere. EKS Anywhere is based on EKS-D (EKS Distro) and is deployed on customer hardware (vSphere, bare metal, and so on), and in air-gapped mode it operates fully self-sufficiently with no AWS connection by using a local Harbor registry and an on-premises mirror repository. Because the Kubernetes API server, etcd, and Controller Manager are all on customer hardware, Pod scheduling, auto-recovery, and ConfigMap management work in an air-gapped environment. ECS Anywhere (A) has its control plane in the AWS Region, so it always requires an AWS connection. EKS on Outposts Extended Cluster (C) also has its control plane in the AWS Region, so it requires a connection and also requires Outposts hardware. Fargate (D) is exclusive to AWS Regions.

---

**Question 8.** A retail company runs microservices on AWS ECS. Under the privacy law, some data processing must run only on-premises. It has no Kubernetes expertise and wants to keep its existing ECS Task Definitions, CLI, and console operating practices. Which solution is appropriate?

A) EKS Anywhere (build an on-premises K8s cluster)
B) ECS Anywhere (register on-premises servers as External Instances)
C) EKS on Outposts Local Cluster
D) AWS Fargate + VPC Endpoint (process only in private subnets)

**Answer: B**

Explanation: "Keep the existing ECS practices + no K8s staff + run on-premises" must all be satisfied. With ECS Anywhere, the control plane is fully managed by AWS ECS, and on-premises servers are registered to the ECS cluster as External Instances through the SSM Agent and ECS Agent. The existing ECS Task Definitions, the `aws ecs run-task` CLI, and the ECS console work as they are. Tasks running on on-premises External Instances keep the data on-premises. No K8s knowledge is needed. EKS Anywhere (A) requires you to operate the K8s control plane yourself, so K8s expertise is essential. EKS on Outposts (C) requires purchasing Outposts hardware. Fargate (D) runs in the AWS Region, so it does not meet the on-premises processing requirement.

---

**Question 9.** A film production company transfers 5 TB of raw footage every day from an on-premises NAS to S3. It has a 10 Gbps Dedicated DX connection. It needs automatic checksum verification that the S3 and NAS file contents match exactly, and the transfer must run automatically at a specific time every night. What is the most appropriate solution?

A) Ship a Snowball Edge every day
B) AWS DataSync (nightly schedule + checksum verification enabled)
C) S3 File Gateway + S3 Lifecycle
D) A direct S3 REST API upload script (multipart + manual MD5 comparison)

**Answer: B**

Explanation: A 10 Gbps DX and 5 TB per day can be handled comfortably by DataSync (about 1.9 hours at an effective 6 Gbps of the 10 Gbps). DataSync automatically calculates checksums (SHA-256) before and after the transfer to verify data integrity between the source and destination, and automatically retransmits when a mismatch is found. The scheduling feature also supports automated nightly cron runs. Shipping a Snowball every day (A) is completely uneconomical with a 10 Gbps DX and creates a heavy operational burden. S3 File Gateway (C) is an always-mounted tool, and its scheduled transfer and checksum comparison are not as strong as DataSync. A direct script (D) requires you to implement parallel processing optimization, automatic retries, and integrity verification yourself, which is a heavy operational burden.

---

**Question 10.** At a factory with an AWS Outposts rack installed, the Service Link connection was completely down for 45 minutes. During this period, what is the state of the factory control system (running on Outposts EC2) and of the EC2 instances that need to be newly deployed?

A) All existing instances are automatically terminated after 5 minutes
B) Existing running instances continue to operate, but launching new instances, IAM authentication, and creating EBS snapshots are not possible
C) Outposts automatically switches to Disconnected Mode and all functions operate normally
D) Instances operate, but EBS volume I/O stops immediately

**Answer: B**

Explanation: AWS Outposts does not officially support a Disconnected Mode. When the Service Link is cut, things fall into two categories. What keeps working: EC2 instances the hypervisor has already started, local EBS volume I/O, the internal Outposts VPC network (communication between subnets), and communication with the on-premises LAN through the LGW. What stops: launching new EC2 instances (AWS STS is not reachable for IAM authentication), creating EBS snapshots (cannot connect to S3 in the parent Region), sending CloudWatch metrics/logs (some are buffered and sent after reconnection), SSM Run Command, and most management tasks through the AWS console/CLI. For this reason, when putting critical workloads such as factory automation on Outposts, the Service Link must be protected with redundant DX (Maximum Resiliency). C is a feature that does not exist (Azure Stack Hub has a Disconnected Mode, but Outposts does not).

---

**Question 11.** Which of the following correctly distinguishes the use cases of AWS DataSync and Storage Gateway?

A) DataSync is used when an always-on mount is needed, and Storage Gateway is used for one-time bulk migration
B) DataSync is used for one-time or periodic batch transfer plus integrity verification, and Storage Gateway is used for an always-on hybrid storage mount
C) DataSync supports only block storage, and Storage Gateway supports only file storage
D) Both can be used equally when migrating an on-premises file server to S3, so choose only by cost

**Answer: B**

Explanation: DataSync and Storage Gateway have different purposes. DataSync is a migration/synchronization tool that "moves data from A to B." It transfers between a source (NFS, SMB, S3, HDFS, EFS, and so on) and a destination on a schedule or one time, and verifies the checksum of each file to guarantee integrity. After the transfer, the DataSync task is complete. Storage Gateway is a hybrid integration tool that lets "on-premises applications keep using AWS storage as if it were local storage." The gateway must always be running, and applications access it continuously through NFS/SMB/iSCSI. A has the descriptions reversed. C is wrong (DataSync supports various file/object/block sources, and Storage Gateway supports file/block/tape). D is wrong (their purposes are fundamentally different).

---

**Question 12.** A company wants to provide an AR (augmented reality) remote medical consultation service from the MEC facilities of 5G partner carriers on 6 continents. A surgeon assists a patient thousands of kilometers away in real time over a 5G connection from a smartphone. The latency requirement is within 20 ms one way. What is the most appropriate approach to deploy this service using AWS global infrastructure?

A) Deploy EC2 in the AWS Regions of each continent + Global Accelerator
B) Deploy AWS Wavelength Zones in the carrier partners' 5G MEC on 6 continents
C) Deploy Local Zones in major cities on 6 continents
D) AWS edge caching (CloudFront) + Lambda@Edge

**Answer: B**

Explanation: 5G devices (smartphones) + 20 ms one-way = Wavelength is the exact use case. Wavelength places EC2 inside the carrier's 5G MEC facility, minimizing the distance 5G packets travel from the base station to the Wavelength Zone. It achieves within 5 to 10 ms one way, comfortably meeting the 20 ms requirement. Global Accelerator + Regions (A) goes through the path of 5G core, internet, AWS PoP, and Region, so 30 to 100 ms one way is expected. Local Zones (C) are optimized for city-level general internet access and have no way to bypass the 5G core, so they cannot reduce latency for 5G devices as much as Wavelength. CloudFront + Lambda@Edge (D) is an HTTP request-response pattern and has difficulty meeting the latency requirement of real-time bidirectional AR streaming.