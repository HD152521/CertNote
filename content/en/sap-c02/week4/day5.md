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

## 📝 연습 문제

**문제 1.** 한국 의료법으로 환자 영상 데이터(CT, MRI)가 병원 건물 밖으로 반출되면 안 된다. AWS AI 진단 모델을 실시간으로 영상에 적용해야 하며, 의료 장비(PACS 서버)와 서브밀리초 수준의 낮은 지연으로 통신해야 한다. 가장 적합한 서비스는?

A) Local Zones (서울 확장) + PACS 서버 DX 연결  
B) AWS Outposts (병원 서버실) + Local Gateway로 PACS 연결  
C) AWS Wavelength (SK Telecom 5G MEC)  
D) AWS Lambda (서울 리전) + DX Private VIF  

**정답: B**

해설: 두 가지 조건이 정답을 결정한다. (1) "건물 밖 반출 금지" = Outposts만이 AWS 하드웨어를 고객 건물 내에 배치해 데이터가 물리적으로 건물 안에 유지된다. (2) "PACS 서버와 서브밀리초 통신" = Local Gateway(LGW)로 Outposts가 온프레미스 LAN에 직접 연결되어 서브밀리초 지연을 달성한다. Local Zones(A)는 AWS가 운영하는 별도 시설이므로 "건물 밖"이다. Wavelength(C)는 통신사 시설이다. Lambda(D)는 서울 리전 데이터센터에서 실행된다. 세 서비스 모두 병원 건물 밖에 있어 의료법을 충족하지 못한다.

---

**문제 2.** 뉴욕 금융 트레이딩 회사가 알고리즘 트레이더에게 1ms 미만 지연의 실시간 시세 대시보드를 제공해야 한다. 트레이더는 사무실 유선 이더넷 네트워크를 사용한다. 5G는 사용하지 않는다. 데이터 주권 규제는 없다. 가장 적합한 서비스는?

A) AWS Outposts (사무실 서버실)  
B) AWS Local Zones (us-east-1-nyc-1a)  
C) AWS Wavelength (Verizon 뉴욕)  
D) Global Accelerator + us-east-1 EC2  

**정답: B**

해설: 유선 인터넷 환경 + 1ms 미만 지연 + 데이터 주권 규제 없음 = Local Zones가 정답이다. 뉴욕 Local Zone(us-east-1-nyc-1a)은 뉴욕 도심에 AWS 인프라를 배치해 1ms 미만 왕복 지연을 제공한다. Outposts(A)는 데이터 주권 요건이 없는 상황에서 하드웨어 구매/운영 비용과 복잡성이 과하다. Wavelength(C)는 5G 모바일 디바이스가 클라이언트일 때 최적이며 유선 사무실 환경에서는 이점이 없다(5G RAN을 경유하지 않으므로 Wavelength 배치의 지연 감소 효과가 없다). Global Accelerator + us-east-1(D)은 뉴욕-버지니아 물리 거리(약 350km)로 인해 최소 3-5ms 지연이 불가피해 1ms 요건을 충족할 수 없다.

---

**문제 3.** 자율주행 배달 로봇이 도심에서 5G로 경로 재계산 요청을 보낸다. 응답 지연이 15ms를 초과하면 장애물 회피 알고리즘이 실패한다. 도시에 SK Telecom 5G 인프라가 있다. 가장 적합한 서비스는?

A) AWS Outposts (로봇 유지보수 센터)  
B) Local Zones (서울)  
C) AWS Wavelength (SK Telecom 파트너십)  
D) 서울 리전 EC2 + Global Accelerator  

**정답: C**

해설: "5G 연결 디바이스 + 15ms 이내 응답" = Wavelength의 정확한 사용 사례다. 5G 패킷이 기지국에서 5G 코어 네트워크를 거치지 않고 바로 인접한 Wavelength Zone EC2에서 처리된다. 기지국-컴퓨팅 거리가 수 km 이내이므로 총 왕복 지연 10ms 이내를 달성한다. Local Zones(B)는 일반 인터넷 연결 사용자에게 도시 수준 지연을 제공하지만, 5G 디바이스가 5G 코어를 통해 인터넷으로 나와 Local Zone에 접근하면 추가 홉이 생겨 15ms 달성이 불안정하다. 서울 리전 + GA(D)는 5G 코어 → 인터넷 → 서울 리전 경로로 20-30ms가 예상된다.

---

**문제 4.** 석유화학 회사가 250TB 데이터를 인터넷 연결이 없는 오프쇼어 플랫폼에서 AWS S3로 수집해야 한다. 플랫폼에서 데이터를 전처리하는 ML 추론 워크로드도 실행해야 한다. 가장 적합한 솔루션은?

A) 위성 인터넷(Starlink) 설치 + DataSync  
B) Snowball Edge Compute Optimized (GPU 옵션) + 주기적 배송 회수  
C) Snowcone + 해저케이블 연결  
D) Storage Gateway S3 File + 위성 연결  

**정답: B**

해설: 두 요건이 동시에 필요하다: (1) 네트워크 없는 환경의 대용량 데이터 수집, (2) 현장 ML 추론. Snowball Edge Compute Optimized는 28TB 스토리지 + 52 vCPU + 208GB RAM + NVIDIA V100 GPU를 내장해 현장에서 ML 추론을 실행하고 데이터를 수집한 뒤 플랫폼 공급선 편에 AWS로 배송한다. S3-compatible API가 온디바이스에서 동작해 기존 애플리케이션 수정이 최소화된다. Snowcone(C)은 14TB 이하 소규모이므로 250TB 수집에 부적합하다. 위성 인터넷(A, D)는 오프쇼어 플랫폼에서 250TB를 전송하기에 대역폭이 턱없이 부족하다(Starlink 100Mbps × 60% × 전송 시간 = 수 주).

---

**문제 5.** 컨설팅 회사 20개 지사가 Windows 파일 서버를 운영한다. 본사와 지사에서 동일한 파일을 동시 편집하며 Active Directory 그룹 정책으로 접근을 제어한다. 지사 로컬 캐시로 응답 속도를 유지하면서 중앙 관리로 전환하려 한다. 적합한 솔루션은?

A) S3 File Gateway (각 지사에 배포) + S3 + S3 이벤트 알림으로 RefreshCache  
B) FSx File Gateway (각 지사) + 중앙 FSx for Windows File Server  
C) Volume Gateway Cached Mode + EFS Multi-AZ  
D) DataSync로 매일 동기화 + 로컬 파일 서버 유지  

**정답: B**

해설: Windows AD ACL + 동시 편집 충돌 방지(NTFS OpLock/파일 잠금) + 로컬 캐시가 모두 필요하다. FSx File Gateway가 이 세 가지를 모두 충족한다. 각 지사 FSx File Gateway가 자주 쓰는 파일을 로컬 캐시에 유지하고, 실제 저장은 중앙 FSx for Windows File Server에 한다. 도메인 조인으로 기존 AD 정책이 그대로 적용된다. S3 File Gateway(A)는 NTFS OpLock을 완전히 지원하지 않아 동시 편집 중 파일 잠금이 제대로 동작하지 않아 데이터 충돌이 발생할 수 있다. RefreshCache 자동화로 일관성은 개선할 수 있지만 파일 잠금은 해결되지 않는다. Volume Gateway(C)는 iSCSI 블록 스토리지로 SMB 파일 공유가 아니다. DataSync(D)는 배치 동기화로 실시간 파일 공유에 부적합하다.

---

**문제 6.** 방송사가 물리 LTO 테이프 4만 개에 30년치 아카이브를 보관한다. Veritas NetBackup 소프트웨어를 수정 없이 유지하면서 클라우드로 이전하고 복원 시간을 물리 테이프 운반 없이 단축하려 한다. 적합한 솔루션은?

A) S3 File Gateway + S3 Glacier Deep Archive  
B) Tape Gateway (iSCSI VTL) + S3 Glacier Deep Archive  
C) DataSync + S3 Glacier  
D) Snowball Edge로 물리 테이프 데이터 일괄 이전 + S3  

**정답: B**

해설: "기존 NetBackup 소프트웨어 수정 없이"가 핵심이다. Tape Gateway는 iSCSI VTL(Virtual Tape Library) 인터페이스를 에뮬레이션해 NetBackup이 물리 테이프 장비처럼 인식한다. 백업 job이 그대로 실행되고 데이터가 S3 VTL에 저장된다. "Archive" 명령 실행 시 Glacier Deep Archive로 이동한다. 복원 시 물리 테이프 운반 없이 Glacier 복원 요청만으로 처리된다(표준 복원 3-5시간, Bulk 복원 12시간). S3 File Gateway(A)는 NFS/SMB 인터페이스이지 VTL이 없어 NetBackup이 테이프 장비로 인식하지 못한다. DataSync(C)는 파일 복사 도구로 백업 소프트웨어 VTL 통합이 없다. Snowball(D)은 일회성 물리 이전으로 지속적 백업에 부적합하다.
