# Day 5 - Week 3 Review: Advanced Networking Architecture Synthesis

Week 3 covered the entire spectrum of AWS advanced networking. Three axes—inter-VPC connectivity (Peering, TGW, Cloud WAN), on-premises connectivity (Direct Connect, Site-to-Site VPN, Client VPN), and service-level private access (PrivateLink, Gateway Endpoint)—and how they complement and substitute for each other was this week's core. Today's goal isn't re-memorizing individual services but developing the ability to instantly judge "why this service is correct in this scenario and why others aren't."

On SAP-C02, one keyword changes the entire networking answer. "CIDR overlap" = Peering and TGW immediately disqualified. "Unidirectional service exposure" = PrivateLink becomes strong candidate. "Sub-1-second failover" = BFD. "Circuit encryption" = MACsec. Today is mastering this keyword-to-answer mapping.

---

## Connection Pattern Selection Tree

Mastering this decision tree makes 70% of exam networking questions clear direction in first 15 seconds.

```
Inter-VPC connectivity needed?
    ├── 2 VPCs, no CIDR overlap, simple connection → VPC Peering
    ├── 3+ VPCs, hub-spoke, on-premises included → Transit Gateway
    └── Global multi-region, single policy management → AWS Cloud WAN

On-premises connectivity needed?
    ├── Fast deployment (minutes), temporary, backup → Site-to-Site VPN
    │   └── Throughput expansion needed → TGW + ECMP (max 50Gbps theoretical)
    ├── High volume, consistent latency, regulated, long-term → Direct Connect
    │   ├── Single VPC → Private VIF + VGW
    │   ├── Multi-VPC/region → Transit VIF + DX Gateway + TGW
    │   ├── AWS public services (S3 public IPs) → Public VIF
    │   ├── 99.99% SLA → Maximum Resiliency (2 Locations × 2 circuits)
    │   ├── L2 encryption regulation → MACsec (10G/100G Dedicated)
    │   └── Sub-1-second failover → Enable BFD
    └── Individual employee terminals → Client VPN (OpenVPN, SAML/mTLS/AD auth)

Third-party/internal service private access?
    ├── CIDR overlap or unidirectional service exposure → PrivateLink (Interface Endpoint)
    ├── S3, DynamoDB only (cost minimal) → Gateway Endpoint (free)
    └── Security appliance traffic chaining → Gateway Load Balancer Endpoint
```

> 💡 **OSI Layer Service Mapping**: Topology theory perspective, these services handle different abstraction levels. VPC Peering and TGW handle **L3 network level** connection (IP routing). PrivateLink handles **service level** connection (DNS + ENI, L4-L7). DX handles **L1/L2 physical-datalink level** with L3 BGP on top. MACsec is **L2 (ethernet frame) encryption**. Abstraction level differences determine each service's characteristics (CIDR requirements, directionality, scalability). For example, PrivateLink allows CIDR overlap because connecting at service unit (ENI) level, not IP routing. L3 bypass with L4 connection means CIDR collision doesn't cause routing problems.

---

## Service-by-Service Comparison Table

### All Connectivity Services

| Service | Direction | CIDR Overlap | Transitive Routing | Multi-Region | Cost |
|--------|------|-----------|--------------|-----------|-----------|
| VPC Peering | Bidirectional | Not allowed | Not allowed | Possible (separate Peering) | Free (same AZ) / $0.01/GB (cross-AZ) |
| TGW | Bidirectional | Not allowed | Possible (within TGW) | TGW Inter-Region Peering | $0.05/hr + $0.02/GB |
| Cloud WAN | Bidirectional | Not allowed | Possible (via policy) | Native global | Core Network Edge hourly |
| DX | Bidirectional | Not allowed | DXGW+TGW | Via DXGW | Port + hourly + GB |
| Site-to-Site VPN | Bidirectional | Not allowed | Possible via TGW | Regional separate | $0.05/hr + $0.09/GB |
| PrivateLink | Unidirectional | Allowed | N/A | Cross-Region support (2024) | ENI $0.01/hr + $0.01/GB |
| Gateway Endpoint | Unidirectional (VPC→service) | N/A | Not possible (VPC internal only) | Not possible | Free |

> 🔍 **Cost Pitfall**: VPC Peering "free" means no charge for Peering connection itself. Actually **cross-AZ data transfer charges ($0.01/GB) apply**. Same-AZ Peering communication is free but crossing AZs incurs charge. TGW charges processing cost ($0.02/GB) plus hourly Attachment charge ($0.05/hour). Connecting 10 VPCs full-mesh Peering requires 45 Peerings but no connection cost. Switching to TGW adds 10 Attachments ($0.50/hr) plus throughput charges. However, operational burden drops 45→1. On SAP-C02, "cost minimization + few VPCs + simple connection" → Peering, "minimize operational burden + many VPCs" → TGW is correct.

---

## Direct Connect Advanced

### DX Redundancy SLA Comparison

| Redundancy Mode | Configuration | SLA | Use Scenario |
|-------------|------|-----|--------------|
| Maximum Resiliency | 2 Locations × 2 circuits = 4 circuits | 99.99% | Mission-critical, finance, factory automation |
| High Resiliency | 2 Locations × 1 circuit = 2 circuits | 99.9% | General enterprise |
| Development | 1 Location × 1 circuit + VPN backup | 99% | Non-production, POC |

> 💡 **SLA Math**: AWS DX SLA "99.99%" allows approximately 52.6 minutes downtime annually. "99.9%" allows 8.76 hours. "99%" allows 87.6 hours. Maximum Resiliency probability of two DX Locations failing **simultaneously** is product of each location's failure probability. Single Location SLA 99.9% = 0.1% failure = 0.001; two locations failing simultaneously = 0.001 × 0.001 = 0.000001 = 99.9999% availability. This is mathematical basis for AWS defining Maximum Resiliency as "2 Locations × 2 circuits." LAG (Link Aggregation Group) bundles ports within same location, powerless against location-wide failure. Even 4 circuits in same location can't achieve 99.99%.

### VIF Selection Quick Reference

| Scenario | Correct VIF | Reason |
|---------|---------|------|
| Single small VPC | Private VIF + VGW | Simple, low cost |
| Multi-VPC, multi-region | Transit VIF + DXGW + TGW | Scalability |
| On-premises ↔ on-premises DX backbone | SiteLink | Bypasses AWS regions |
| AWS public services (S3 public IPs) | Public VIF | BGP advertise public IP range |
| L2 encryption regulation | MACsec (10G/100G Dedicated) | Ethernet frame encryption |
| Hosted Connection | Private or Public VIF | Transit VIF not supported |

> ⚠️ **Hosted Connection Pitfall**: Hosted Connection (partner-provided) **doesn't support Transit VIF**. Only Dedicated Connection (AWS direct) enables Transit VIF creation. If connecting via partner and accessing multiple VPCs, either create Private VIF per VPC (complex) or request Dedicated Connection from partner. Exam with "partner DX + multiple VPCs" requires remembering this constraint. Also, Hosted Connection bandwidth (50Mbps~10Gbps) differs from Dedicated Connection (1G/10G/100G) options.

> 🔍 **MACsec Deep Dive**: MACsec (IEEE 802.1AE) encrypts per ethernet frame. DX places L2 ethernet on L1 fiber; MACsec encrypts entire L2 frame with AES-256. AWS supports MACsec only on 10Gbps and 100Gbps Dedicated Connections. 1Gbps Dedicated Connection and all Hosted Connections don't support MACsec. Distinguishing MACsec from IPsec (L3) and TLS (L7) is key when "circuit encryption" is regulated. MACsec encrypts link between AWS and DX Location; on-premises to DX Location requires separate MACsec equipment.

---

## BGP Path Control Advanced

### BGP Manipulation by Direction

```
On-premises → AWS direction (outbound from on-premises):
  Set high Local Preference on DX neighbor in on-premises BGP
  → On-premises BGP prefers DX path, sends via DX

AWS → On-premises direction (inbound to on-premises):
  Apply AS Path Prepending to VPN neighbor in on-premises BGP
  → AWS BGP prefers DX path with shorter AS Path
  → On DX failure, AWS selects only VPN path
```

> 🔍 **BGP Attribute Propagation Scope**: Understanding propagation scope reduces confusion. **Local Preference** exchanges only within iBGP (same AS) and doesn't transmit to eBGP peers. On-premises Local Preference doesn't transmit to AWS and only affects on-premises internal path selection. **AS Path** and **MED (Multi-Exit Discriminator)** transmit via eBGP to peers, so AWS router receives these values for path selection. Propagation scope difference explains directional BGP manipulation methods. RFC 4271 defines Local Preference as OPTIONAL NON-TRANSITIVE and AS Path as WELL-KNOWN MANDATORY, so AS Path always propagates across eBGP boundary.

> ⚠️ **Exam Pitfall**: "AWS → on-premises direction priority control" = **AS Path Prepending**. "On-premises → AWS direction priority control" = **Local Preference**. Confusing direction guarantees wrong answer. Another pitfall: "BFD speeds up DX failover" is correct, but BFD itself doesn't select paths—it detects failure and notifies BGP. BGP recalculates paths after BFD detection.

### BGP Community and Routing Control

DX also features exam-appearing BGP Community fine-grained routing control.

```
AWS-advertised BGP Communities (to on-premises):
  7224:7100 - Local route within region
  7224:7200 - Global route within region
  7224:8100 - Same continent
  7224:9100 - Global

On-premises advertising with MED:
  Lower MED value → AWS prefers
  MED used when multiple paths from same AS; selects lower MED
```

---

## TGW Route Table Isolation Patterns Advanced

### Basic Isolation Model

```
[Dev VPC] ─Association→ RT-Workload
[Prod VPC] ─Association→ RT-Workload
[Stage VPC] ─Association→ RT-Workload
[Shared VPC] ─Association→ RT-Shared

Propagation settings:
Dev VPC → Propagate to RT-Shared (Shared VPC learns Dev CIDR)
Prod VPC → Propagate to RT-Shared (Shared VPC learns Prod CIDR)
Shared VPC → Propagate to RT-Workload (Dev/Prod learn Shared CIDR)

Result:
Dev→Prod: RT-Workload lacks Prod CIDR → blocked
Prod→Dev: RT-Workload lacks Dev CIDR → blocked
Dev→Shared: RT-Workload has Shared CIDR → allowed
Shared→Dev: RT-Shared has Dev CIDR → allowed
```

> 💡 **Association vs Propagation Memorization**: Association = "I follow this RT's decisions." Propagation = "I advertise my CIDR to this RT." Dev associates to RT-Workload, and Prod CIDR doesn't propagate to RT-Workload, then Dev→Prod packets blackhole. TGW Blackhole routes can be added as explicit static routes for "force-block even if CIDR accidentally propagates" defense purpose.

> 🎯 **5-Environment Isolation Scenario**: Large financial group operates dev, staging, production, shared, security across TGW. Needs dev↔prod, stage↔prod, dev↔stage isolation but all environments must access Shared and Security. Design: RT-Workload (Dev/Stage/Prod Association, only Shared+Security CIDR propagation), RT-Shared (Shared Association, all CIDR propagation), RT-Security (Security Association, all CIDR propagation). Security VPC's IDS/IPS sees all traffic and Security isn't just "read-only" observer but can intervene (traffic injection) via RT-Security knowing all CIDRs.

---

## PrivateLink Advanced

### Three Situations Where PrivateLink Is Correct Answer

1. **CIDR-overlapping VPCs or accounts sharing services**: Peering and TGW impossible due to CIDR overlap.
2. **Unidirectional service exposure**: Consumer calls only API, can't access Producer's internal network.
3. **SaaS/third-party services with private access without internet**: Snowflake, Datadog, MongoDB Atlas provide PrivateLink Endpoint Service.

### Endpoint Type Comparison

| Endpoint Type | Supported Services | CIDR Impact | Cost | DNS |
|--------------|------------|-----------|------|-----|
| Interface Endpoint | Most AWS services, PrivateLink custom | Creates ENI in VPC | $0.01/hr + GB | Private DNS name |
| Gateway Endpoint | S3, DynamoDB only | Route table change | Free | No change |
| GWLB Endpoint | Security appliances | GENEVE tunnel | Per GB | None |

> 📚 **Real Case**: 2023 Korean fintech connecting to overseas payment processing SaaS faced regulatory requirement "data must not traverse public internet." SaaS vendor provided AWS PrivateLink Endpoint Service; fintech created Interface Endpoint in VPC and completed private connection despite CIDR overlap (10.0.0.0/8). Implementation 4x faster than VPN tunnel design with reduced operational staff. 2024 Cross-Region PrivateLink GA'd, enabling Interface Endpoints to other-region Endpoint Services—also exam scope.

> ⚠️ **Gateway Endpoint Pitfall**: Gateway Endpoint **unusable from on-premises (DX/VPN)**. Gateway Endpoint adds prefix-list-form routes to VPC route table. Routes apply only to VPC-internal traffic; on-premises traffic via DX/VPN doesn't use these routes. For on-premises private S3 access without internet, use **S3 Interface Endpoint** or **Public VIF**. Exams with "on-premises + S3 + no internet" select Interface Endpoint or Public VIF, not Gateway Endpoint.

---

## SAP-C02 Scenario Decoding Methodology

Five-step analysis decodes networking questions quickly.

```
1. WHO: Who accesses? (Employee laptop → Client VPN, on-premises server → DX/VPN, VPC→VPC → Peering/TGW)
2. WHAT: Access what? (S3 → Gateway Endpoint, AWS service → Interface Endpoint, custom service → PrivateLink)
3. WHY: Why private access? (Regulation, security, latency, cost)
4. CONSTRAINTS: What constraints? (CIDR overlap, SLA, encryption, bandwidth, time)
5. KEYWORD: Decisive keyword?
   - "CIDR overlap" → PrivateLink
   - "Transitive routing" → TGW (not Peering)
   - "Circuit encryption" → MACsec
   - "1-second failover" → BFD
   - "99.99% SLA" → Maximum Resiliency
   - "On-premises ↔ on-premises without AWS transit" → SiteLink
   - "Unidirectional" → PrivateLink
   - "Operational minimization + global" → Cloud WAN
```

> 🎯 **Exam Strategy**: SAP-C02 networking questions usually have 2-3 answer candidates; 1-2 constraints narrow to one. "DX + VPN concurrent + AWS→on-premises DX priority" = AS Path Prepending keyword. "DX + sub-1-second failover" = BFD keyword. "50 VPCs + central API access + CIDR overlap possible" = PrivateLink Endpoint Service keyword. Repeating pattern mapping reduces reading time and speeds judgment.

---

## Closing: Week 3 Core Keywords Compilation

| Keyword | Instant Service Association |
|--------|----------------|
| CIDR overlap | PrivateLink (Interface Endpoint) |
| Transitive routing needed | TGW (Peering excluded) |
| Global single policy | Cloud WAN |
| Circuit L2 encryption | MACsec |
| DX 1-second failover | BFD |
| DX 99.99% SLA | Maximum Resiliency (2 Locations × 2 circuits) |
| On-premises→AWS priority | Local Preference |
| AWS→on-premises priority | AS Path Prepending |
| S3/DynamoDB free access | Gateway Endpoint |
| On-premises private S3 access | Interface Endpoint or Public VIF |
| Unidirectional service exposure | PrivateLink Endpoint Service + NLB |
| Stateful appliance chaining | GWLB + GWLB Endpoint |
| Individual employee VPC access | Client VPN (SAML/mTLS/AD) |
| Multi-VPC on-premises DX | Transit VIF + DXGW + TGW |
| On-premises ↔ on-premises without AWS transit | DX SiteLink |
| Hosted DX + multi-VPC | Transit VIF impossible → Dedicated required |

---

## 📝 Practice Questions

**Question 1.** Global logistics company operates 60 VPCs across 3 regions (us-east-1, eu-west-1, ap-northeast-1) via AWS Organizations. Seoul headquarters must privately access all-region VPCs; VPCs segmented into dev/staging/production isolation while all environments access shared service VPC (DNS, LDAP). Minimize operational burden:

A) Full Mesh VPC Peering 60 VPCs + DX Private VIF + NACL for isolation
B) TGW each region + TGW Inter-Region Peering + DX Gateway + Transit VIF + TGW Route Tables for isolation + RAM share
C) AWS Cloud WAN global policy + DX Gateway + Transit VIF + define isolation in policy
D) VPC Peering hubs per region + Site-to-Site VPN on-premises connection

**정답: C**

Explanation: "Single policy" management across 3 regions 60 VPCs is Cloud WAN's core strength. Cloud WAN Core Network Policy defines environment segments (dev/stage/prod/shared) and declares routing allow/block between segments. DX Gateway + Transit VIF connects on-premises accessing all-region VPCs. B possible but per-region TGW Route Table separate management higher operational burden. A Full Mesh needs (60×59)/2 = 1,770 Peerings—unmaintainable; Peering doesn't support transitive routing. D's VPN doesn't meet DX bandwidth/latency consistency.

---

**Question 2.** Financial company connects Seoul datacenter ↔ us-east-1 via DX. Audit requires "DX circuit itself encrypted." Also DX port failure sub-1-second auto-failover required. Currently 10Gbps Dedicated Connection. Appropriate technology combination:

A) MACsec + IPsec VPN over DX + BFD
B) MACsec (10G Dedicated) + enable BFD
C) IPsec VPN over DX + BGP AS Path adjustment + BFD
D) TLS 1.3 application encryption + BFD

**정답: B**

Explanation: "DX circuit encryption" means L2 encryption MACsec (IEEE 802.1AE). MACsec supported on 10Gbps/100Gbps Dedicated Connection. Currently 10G Dedicated meets requirement. Sub-1-second failover achieved via BFD (RFC 5880) exchanging hellos 300ms intervals; 3 consecutive failures trigger 300ms failure notification to BGP. IPsec VPN over DX (A, C) is L3 encryption, not L2 "circuit" encryption; different from requirement. A also stacks MACsec + IPsec creating unnecessary dual-encryption latency. TLS (D) is L7, not circuit-level encryption.

---

**Question 3.** Healthcare company multi-account (HIPAA) environment. 50 hospital VPCs must access central medical data analysis VPC API only; hospital ↔ hospital communication absolutely prohibited; analysis VPC internal IP structure unexposed to hospitals. CIDR overlap possible. Most appropriate configuration:

A) TGW + TGW Route Table (hospitals same RT, Blackhole routes)
B) Each hospital VPC Peering (hospital→analysis only)
C) Create Endpoint Service (NLB) in analysis VPC + create Interface Endpoint each hospital VPC
D) Share analysis VPC via RAM

**정답: C**

Explanation: Four requirements: (1) hospitals→analysis API only, (2) hospital ↔ hospital prohibited, (3) analysis internal IP unexposed (only NLB visible), (4) CIDR overlap allowed. PrivateLink only option meeting all. Interface Endpoint unidirectional (hospital→NLB), allows CIDR overlap, service-unit exposure (NLB IP only). No Endpoint between hospitals = no communication path = automatic isolation. TGW (A) blocks hospital ↔ hospital via route isolation but doesn't allow CIDR overlap. Peering (B) also CIDR impossible. RAM (D) is resource sharing, not service-level access control; exposes internal IPs.

---

**Question 4.** E-commerce company pre-Black Friday needs on-premises inventory ↔ AWS Lambda order processing bandwidth expansion. Currently single Site-to-Site VPN (VGW). DX installation 6 months. Immediately expand throughput next week:

A) Replace VGW with TGW, enable ECMP, add 3 VPN connections
B) Switch from Site-to-Site to Client VPN
C) Emergency Hosted Connection request (minimum 50Mbps)
D) Place CloudFront before Lambda for caching

**정답: A**

Explanation: VGW unsupported ECMP = max 1.25Gbps (active tunnel 1). TGW + enable ECMP + 4 VPN connections (2 tunnels each, Active-Active) = 8 tunnels parallel = theoretical 10Gbps. Completable within days. Key: VGW→TGW switch enables ECMP. Client VPN (B) for individual users not inter-site high-bandwidth. Hosted Connection (C) takes weeks; DX itself 6 months. CloudFront (D) HTTP caching doesn't solve real-time inventory sync bandwidth.

---

**Question 5.** Security team inspects all VPC internet outbound via central Palo Alto Networks firewall. Appliance must maintain stateful inspection with original source IP. Firewall operates separate Security account; workload VPCs many dozens. Most appropriate architecture:

A) Deploy Palo Alto per VPC
B) Security account GLB + Palo Alto, workload VPCs GLB Endpoint + TGW traffic concentration
C) Apply WAF to all ALBs
D) Deploy Network Firewall at Egress VPC center

**정답: B**

Explanation: GLB + GWLB Endpoint preserve original 5-tuple (source IP, destination IP, protocol, source/destination port) via GENEVE (RFC 8926) when delivering to appliances. Palo Alto stateful inspection then returns traffic. Security account GLB workload VPC reference via GWLB Endpoint, centralized model exactly meets requirements. TGW concentrates all VPC outbound. Per-VPC deployment (A) multiplies appliance/license costs. WAF (C) L7 HTTP/HTTPS only. Network Firewall (D) AWS-managed doesn't satisfy "central Palo Alto appliance" requirement.

---

**Question 6.** Fintech operates DX + VPN dual connection to on-premises. AWS→on-premises traffic (inbound) must prioritize DX via BGP. Correct method:

A) Set DX "Priority" high in AWS console
B) Apply high Local Preference to DX path on-premises BGP
C) Apply AS Path Prepending to VPN-side BGP advertisement on-premises
D) Lambda periodically monitor BGP paths and adjust priority

**정답: C**

Explanation: AWS→on-premises path selection determined by **AWS BGP**. AWS prefers shorter AS Path. On-premises applying AS Path Prepending (repeating own ASN) on VPN-side neighbor makes VPN path longer; AWS then selects shorter-AS-Path DX. DX failure removes DX BGP path; AWS selects only VPN. A non-existent AWS console feature. B Local Preference for on-premises→AWS (outbound) doesn't transmit to AWS BGP. D Lambda can't directly control BGP—unrealistic.

---

**Question 7.** Global media company accesses us-east-1 S3 (rendering results), Secrets Manager (API keys), ECR (container images) from batch EC2 fleet. All access without internet; optimize cost. Optimal configuration:

A) NAT Gateway + internet traversal
B) S3 Gateway Endpoint + Secrets Manager Interface Endpoint + ECR Interface Endpoint (ecr.api, ecr.dkr)
C) S3 Interface Endpoint + Secrets Manager Interface Endpoint + ECR Interface Endpoint
D) Transit VIF + DX Gateway access via on-premises

**정답: B**

Explanation: S3 via Gateway Endpoint (free) without internet. Secrets Manager needs Interface Endpoint (charged $0.01/hr + GB). ECR needs two endpoints: `com.amazonaws.region.ecr.api` (API calls) and `com.amazonaws.region.ecr.dkr` (image pull). EC2 image pull from ECR fetches layers from S3 requiring S3 Gateway Endpoint too. C's S3 Interface Endpoint costs $0.01/hr + GB making B cost-optimal with free Gateway Endpoint. D adds unnecessary on-premises complexity.

---

**Question 8.** Insurance company operates DX from 2 on-premises datacenters (Seoul Gangnam, Seoul Gasan). Current: Gangnam DC → DX Location A (1G 1 circuit), Gasan DC → DX Location B (1G 1 circuit). Single Location failure causes outage. Achieve 99.99% SLA:

A) Add 1 circuit each Location; create LAG
B) 2 circuits each Location = 4 total
C) Add VPN backup (High Resiliency + VPN)
D) Upgrade DX bandwidth to 10G

**정답: B**

Explanation: Maximum Resiliency (99.99%) = **2 different DX Locations with 2 circuits each**, 4 total. Currently 1 each; add 1 each Location. LAG (A) bundles ports same Location (802.3ad/LACP)—powerless against location-wide failure. 4 circuits same Location LAG still down on Location failure. VPN backup (C) is Development level (99%). DX SLA depends on circuit count and location diversity not bandwidth upgrade (D).

---

**Question 9.** Company provides payment processing microservice to 20 customer VPCs. Customer CIDR unknown, may overlap. Customers call payment API only; no internal resource access. Minimize new customer onboarding operational burden:

A) 20 customer VPCs TGW Attachment + TGW Route Table payment API-only access
B) Create Endpoint Service (NLB) + Organizations allowed Principal + customers Interface Endpoint
C) Internet-facing ALB payment service + TLS + IP whitelist
D) Each customer VPC Peering + Security Group payment port only

**정답: B**

Explanation: Allow CIDR overlap + service-level access + customer onboarding automation all required. B Organizations allowed Principal means new customer added to Organizations automatically creates Interface Endpoint without Endpoint Service config change. `acceptance-required: true` adds approval. A CIDR impossible. C internet ALB violates security. D Peering also impossible.

---

**Question 10.** Multinational pharma company analyzes clinical data AWS. 200 researchers access AWS analysis (JupyterHub, RStudio) from laptops. Company uses Azure AD IdP with SAML 2.0. Works from office/home/travel. Data VPC-internal, no internet exposure. Optimal configuration:

A) Site-to-Site VPN + deploy CGW router each employee home
B) AWS Client VPN + SAML 2.0 (Azure AD) auth + multi-AZ subnet Association
C) EC2 Bastion Host + SSH port-forwarding + Azure AD integration
D) AWS WorkSpaces + Azure AD SAML

**정답: B**

Explanation: Individual researcher laptops accessing private VPC analysis is Client VPN exact use case. SAML 2.0 Azure AD integration means employees VPN authenticate with existing credentials (SSO). Network location independent, all data VPC-retained. Multi-AZ Association ensures high availability. Site-to-Site VPN (A) fixed inter-site; per-home-router deployment massive operational burden. Bastion (C) SSH-only; JupyterHub/RStudio HTTP-based incompatible. WorkSpaces (D) virtual desktop replaces laptop—overkill, high cost.

---

**Question 11.** Which correctly describes AWS TGW ECMP (Equal-Cost Multi-Path)?

A) TGW ECMP automatically enabled across VPC Attachments
B) TGW ECMP operates Site-to-Site VPN Attachments only; both tunnels per VPN connection active
C) Single VPN 4 tunnels with TGW ECMP achieves max 20Gbps
D) VGW also supports ECMP; no TGW replacement needed

**정답: B**

Explanation: TGW ECMP operates **VPN Attachment** (Site-to-Site VPN), using multiple VPN connection tunnels Active-Active parallel. Each VPN connection 2 tunnels (Active-Active), N VPN connections = 2N tunnels ECMP. Single tunnel max 1.25Gbps; 4 VPN connections (8 tunnels) theoretical 10Gbps. VGW (D) unsupported ECMP, only Active-Standby. A VPN not inter-VPC. C single VPN is 2 tunnels requiring VPN connections 2 for 4 tunnels; 4 VPN connections 10Gbps.

---

**Question 12.** Company connects datacenter A (New York) and datacenter B (London) via DX each. Direct inter-datacenter communication required; currently via internet on-premises routers. Use AWS backbone for stable low-latency but don't traverse AWS region resources. Most appropriate configuration:

A) Connect both DX to us-east-1 TGW, use as routing hub
B) Enable DX SiteLink + connect both DC DX to same DXGW
C) TGW Inter-Region Peering + connect each DC DX to each TGW
D) Accelerated VPN each DC, use AWS Global Accelerator

**정답: B**

Explanation: DX SiteLink enables on-premises traffic to traverse AWS DX Location ↔ DX Location global backbone without AWS region virtual interface (VPC) transit. New York DC DX + London DC DX same DXGW + enable SiteLink = traffic DX Location → AWS backbone → DX Location path. "Without AWS region resource transit" is SiteLink exact use case. A TGW region-transits. C TGW transits. D Accelerated VPN uses Global Accelerator but VPN lacks DX stable low-latency; "region resource transit" condition unclear.

---

## Next Week Preview: Week 4 Hybrid Cloud

Week 4 covers AWS boundary-extension services. Outposts (AWS infrastructure at customer datacenters), Local Zones (city-level latency minimization), Wavelength (telecom 5G edge), Storage Gateway (on-premises storage integration), Snow Family (massive data physical movement), EKS/ECS Anywhere (container on-prem extension) are topics. Two common keywords: "run AWS APIs from on-premises" and "datacenter↔AWS data transfer bandwidth/time problem." Classifying Week 4 services by these two axes solves half already.

---
