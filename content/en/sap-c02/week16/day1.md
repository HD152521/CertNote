# Day 1 - Domain 1 Wrap-Up: Designing for Organizational Complexity (26%) — The History of Multi-Account Governance, Routing Theory, Hybrid Encryption, and the CS Principles of Isolation Boundaries

SAP-C02 Domain 1, "Design Solutions for Organizational Complexity," is the first domain at 26% of the exam (the largest weight is Domain 2, Design for New Solutions, at 29%). The essence of the Pro exam is the ability to move beyond the SAA level of "1 account + 1 VPC + 1 Region" and solve scenarios that assume a real enterprise environment of **dozens to hundreds of accounts + dozens of VPCs + multiple Regions + on-premises integration**.

Today we organize all of Domain 1 into four areas (governance, networking, integrated security, and hybrid), and break down each tool's **historical background, internal behavior, CS theory, and real incident cases** in depth. If you understand "why this structure came to be" rather than stopping at simple keyword mapping, variant scenarios become solvable too.

## Area 1: Governance — The Account Is the Strongest Isolation Boundary

### The History and Principles of Multi-Account

Early AWS users put everything in a single account. As organizations grow, this structure collapses — you cannot isolate the blast radius, it is hard to separate costs by team, IAM permissions bloat into the hundreds, and a single compromise exposes everything. AWS answered with **Organizations** in 2017 and **Control Tower** and SCPs in 2018.

```
Org Root
  ├── Security OU (Log Archive · Audit accounts)
  ├── Production OU (Account A · B)
  ├── Development OU (Account C)
  └── Sandbox OU (Account D)
```

Multi-account is the physical realization, at the infrastructure layer, of the classic information security principles of **Least Privilege** and **Separation of Duties**. It implements what the **NIST SP 800-53** controls AC-5 (separation of duties) and AC-6 (least privilege) require, as "account = trust boundary." The account boundary is the **strongest isolation boundary** AWS provides — even if IAM permissions are misconfigured, they cannot reach resources in another account. This is why the Security and Logging accounts are separated from workloads — audit integrity holds only when operators cannot erase the audit logs of their own actions (a direct implementation of SOX's "records cannot be changed by their creator").

An SCP **does not grant permissions — it only sets a permission ceiling.** Writing `Allow` in an SCP does not give a user any permission. Final effective permission = (what IAM allows) ∩ (what the SCP allows). The recommended pattern is to add `Deny` policies on top of the default `FullAWSAccess` policy (Allow all actions) to block specific actions, Regions, or services. The key point: SCPs **also apply to the root user** (only the management account itself is exempt) — apply a DenyRegions with an `aws:RequestedRegion` condition and even that account's root cannot create resources in a non-EU Region. When the exam shows "must block even root," it is an SCP, not IAM.

> ⚠️ **Trap**: SCPs **do not apply to the management account** — which is why the best practice is never to run workloads in the management account and to use it only for managing Organizations. Also, an SCP only restricts the actions of IAM principals; it cannot fully block cross-account access arriving through resource-based policies, and service-linked roles have exceptions. Memorizing "an SCP can block everything" is a trap.

### Control Tower · IAM Identity Center

- **Control Tower**: Builds a standard Landing Zone with one button, combining Organizations + IAM Identity Center + Config + CloudTrail + Backup. **Account Factory** stamps out accounts with a standard baseline (VPC, IAM, CloudTrail), and **Guardrails** (Preventive = SCP, Detective = Config) are enforced. AFT (Account Factory for Terraform) automates this with IaC.
- **IAM Identity Center** (formerly SSO): Integrates an external IdP (Okta, Azure AD, Ping) via SAML and grants permissions per account and OU with Permission Sets. No IAM Users are created; SSO users access with temporary credentials. It also supports **ABAC** (tag-based permissions).

The 2019 **Capital One data breach** (about 106 million people) came from a misconfigured WAF combined with an overly privileged IAM role — the intruder used SSRF to steal credentials from the EC2 instance metadata (IMDSv1) and read S3. The lesson is **account and permission isolation, and the importance of IMDSv2**. Afterward, AWS made IMDSv2 (token-based) the default, and blocking IMDSv1 with SCPs and limiting lateral movement with Permission Boundaries became best practice. For "block lateral movement of stolen credentials," think of account isolation + Permission Boundary + SCP.

> 🎯 **Scenario**: "A company uses SSO with Okta, wants to give AWS permissions that differ by department, and wants to prohibit IAM Users." → **IAM Identity Center + Okta SAML + Permission Set per OU/Account**. IAM Users are prohibited because of the burden of managing long-term credentials, and Cognito is for application end users, so it is a different context. "Workforce SSO + per-department AWS permissions" is answered directly by IAM Identity Center.

## Area 2: Networking — Routing Theory and Multi-VPC

### The VPC Connectivity Matrix

| Method | Suitable scale | Transitive | Use |
|------|-----------|------|--------|
| VPC Peering | 1:1, a few | ✗ (non-transitive) | Simple connections, ~10 VPCs |
| Transit Gateway | Dozens to thousands | ✓ | Hub-Spoke |
| PrivateLink | Service sharing | N/A | SaaS → customer VPC |
| VPN (Site-to-Site) | On-prem → AWS | ✓ (with TGW) | DX backup or standalone |
| Direct Connect | On-prem → AWS dedicated line | ✓ (DX Gateway) | Bandwidth, stability |

The reason TGW replaced the Peering mesh is **graph complexity**. A full-mesh Peering of N VPCs needs N×(N−1)/2 connections — 200 VPCs would be 19,900, unmanageable, and Peering is **non-transitive**, so even with A-B and B-C, A-C does not work (transitive routing is prohibited). TGW simplifies this to O(N) complexity as a central hub and provides transitive routing (up to 5,000 VPCs). The key point: TGW supports **multiple route tables**, so you can isolate the communication scope per attachment — with a single route table, all attachments see each other and isolation is impossible.

The routing for DX redundancy is decided by **BGP (Border Gateway Protocol, RFC 4271)**. Normally the DX path has a shorter AS-PATH and is preferred, and when DX dies, BGP converges onto the VPN path. For faster failure detection, enabling **BFD (Bidirectional Forwarding Detection, RFC 5880)** detects a link break within 1 second instead of the default BGP hold time (tens of seconds), accelerating failover. AWS DX recommends BFD. For multi-Region, **DX Gateway** connects VPCs/TGWs in multiple Regions to a single DX, and **TGW Peering** links TGWs across Regions. "Switch to VPN within 1 second when DX fails" is BGP + BFD.

The essential difference between **PrivateLink and VPC Peering** is the permission model. Peering merges the full routing of both VPCs (L3), is bidirectional, and is impossible when IPs conflict. PrivateLink exposes **only a specific service, in one direction (consumer → provider)**, through provider NLB → Endpoint Service → consumer Endpoint (an L7 single entry point), and is **independent of IP conflicts** (it works even when ranges overlap). So "a SaaS provider exposes its service to many customer VPCs + IP conflicts don't matter" is always PrivateLink.

> 🎯 **Scenario**: "A global manufacturer connects many VPCs across three Regions (Americas, EU, APAC) with TGW but must block direct communication between EU VPCs and Americas VPCs." → **Per-Region TGW + TGW Peering + separate route tables**. Connect each Region's TGW to on-premises with a DX Gateway, and finely control per-attachment paths with the TGW's **multiple route tables** (remove the Americas attachment route from the EU route table to isolate). A single route table cannot isolate. "TGW connectivity + isolate some VPCs" means multiple route tables.

### Direct Connect Details

- **Dedicated**: 1G, 10G, 100G dedicated to a single customer. **Hosted**: 50Mbps to 10G, split from a partner line.
- **MACsec**: L2 encryption (Dedicated only). **SiteLink**: connects DX locations to each other over the AWS backbone (like a global WAN).

DX is **plaintext** by default — it is a dedicated line, but it is not encrypted. So AWS recommends **DX + IPsec VPN over DX** (encryption + stability), or L2 encryption with **MACsec (IEEE 802.1AE)**, added in 2021 (supported only on Dedicated connections). When the exam shows "DX but encryption required," IPsec VPN over DX or MACsec is the signal for the correct answer. Assuming that DX, being private, provides encryption by default is a trap.

## Area 3: Multi-Account Integrated Security

| Service | Org integration model | Use |
|--------|--------------|------|
| Security Hub | Delegated administrator | Finding aggregation + CIS/PCI standard checks |
| GuardDuty | Delegated administrator | Threat detection (VPC Flow, DNS, CloudTrail analysis) |
| Macie | Delegated administrator | S3 PII detection |
| Inspector | Delegated administrator | Vulnerability scanning (EC2, ECR, Lambda) |
| Firewall Manager | Delegated administrator | Bulk policies for WAF, SG, Network Firewall, DNS Firewall |
| Config Aggregator | Aggregation | Single view of configuration across all accounts and Regions + Conformance Pack |

The pattern for multi-account security is to **"designate a dedicated security account as the delegated administrator"** — you do not place security operations in the management account (if the management account is compromised, everything is exposed), and instead give a separate Security account the delegated administrator rights for GuardDuty, Security Hub, and Macie to aggregate findings from all accounts. The **auto-enable for new accounts** option automatically brings new accounts created by Account Factory into the security baseline. "Org-wide consolidated security dashboard + new accounts automatic" is the delegated administrator model + auto-enable.

In the 2021 **US-EAST-1 major outage**, because IAM and some global services depended on us-east-1, even users in other Regions were affected. The lessons for multi-account and multi-Region design are (1) **reduce single dependence on us-east-1** (use STS Regional endpoints), (2) **the logging and security accounts must also have Regional resilience**, and (3) the **CloudTrail Org Trail must cover all Regions**.

## Area 4: Hybrid — On-Premises Integration

| Service | Behavior | Use |
|--------|------|--------|
| Outposts | AWS hardware installed in the customer DC, same EC2/EBS/S3/RDS APIs | Data residency, low latency (factories, hospitals) |
| Local Zones | Small DCs near major cities, connected to the parent Region | Low-latency city workloads |
| Wavelength | 5G carrier edge | Millisecond mobile latency |
| Storage Gateway | File (NFS/SMB → S3), Volume (iSCSI → EBS), Tape (VTL → Glacier) | On-prem ↔ cloud storage |
| DataSync | Online synchronization (NFS/SMB/HDFS → S3/EFS) | Sufficient line capacity |
| Snow Family | Snowcone 8TB, Snowball Edge 80TB, Snowmobile 100PB | Insufficient line, bulk transport |

> 🎯 **Scenario**: "Data residency regulations forbid moving data out of the data center, but we want to operate EC2 and S3 with the same APIs as AWS." → **AWS Outposts**. Outposts places an AWS hardware rack in the customer DC and provides the same APIs, so the data physically never leaves the facility. Local Zones are AWS-owned facilities, so the data does leave (it is moved out). "Data residency + same AWS APIs + on-premises location" is Outposts.

> ⚠️ **Trap**: Snow vs DataSync is decided by **bandwidth math**. 50TB ÷ 100Mbps ≈ 50 days (infeasible) → Snowball Edge. DataSync is the answer only when the line is sufficient. Answering DataSync for "tens of TB + slow line + short deadline" is a trap — physical transport (Snow) is the answer.

## Scenario Keyword → Answer Mapping

| Keyword | Answer |
|--------|------|
| "Block unauthorized Regions, even root" | SCP Deny `aws:RequestedRegion` |
| "New-account automatic baseline and guardrails" | Control Tower + Account Factory |
| "100+ VPCs + on-prem, multi-Region" | TGW + DX Gateway |
| "Simple connection of fewer than 10 VPCs" | VPC Peering |
| "SaaS → customer VPC, IP conflicts irrelevant" | PrivateLink (NLB Endpoint Service) |
| "VPN switchover within 1 second on DX failure" | BGP + BFD |
| "DX but encryption needed" | IPsec VPN over DX or MACsec |
| "Okta SSO + per-department AWS permissions" | IAM Identity Center + SAML |
| "Org-level WAF and SG policy" | Firewall Manager |
| "Org security consolidated dashboard, new accounts automatic" | Security Hub delegated administrator + auto-enable |
| "TGW connectivity + isolate some VPCs" | TGW multiple route tables |
| "Data residency + same API on-prem" | Outposts |
| "5G mobile millisecond latency" | Wavelength |
| "Automatic on-prem NFS → S3 sync" | DataSync or File Gateway |
| "50TB in 1 week + slow line" | Snowball Edge |

## Summary

Domain 1 asks about **integrated governance across enterprise multi-account + multi-VPC + hybrid**. The key insights: (1) the account is the strongest isolation boundary (the physical realization of NIST separation of duties), and an SCP does not grant permissions but only puts a ceiling over them, blocking even root; (2) networking is graph complexity — Peering is N² and non-transitive, TGW is O(N) with transitivity + multi-route-table isolation, and DX failover is BGP + BFD; (3) integrated security is a delegated administrator + new-account auto-enable; (4) for hybrid, Outposts when data residency applies, and Snow vs DataSync by bandwidth math. Drilling the scenario keyword → direct answer mapping into your head is the fastest preparation.

Tomorrow (Day 77) we wrap up Domain 2, Design for New Solutions, in depth through CAP/PACELC and the internal workings of event architectures.

---

## 📝 Practice Questions

**Question 1.** Priority conflict between finance (Security) and gaming (Performance) → **Business context first, then optimize**

**Question 2.** Choosing between Aurora Global RTO < 1 min and RDS Multi-AZ RTO 2 min → **Quantitative RPO/RTO values + cost ROI**

**Question 3.** Review cadence of the six-pillar WA Tool → **Quarterly (Reliability and Security drills every quarter) + a full review once a year**

**Question 4.** Distinguishing SCP vs IAM vs Resource Policy → **SCP (ceiling) > IAM (grant) > Resource (cross-account)**

**Question 5.** Preventing cascade when one of multiple Regions goes down → **Decoupled Regions + independent failover**

**Question 6.** Cost vs Reliability ROI decision → **Downtime cost ÷ solution cost = ROI**

---

**Question 7.** A global company wants to block the use of an unauthorized Region (for example, us-east-1) in a subsidiary account. Even the account's root user must not be able to create resources in that Region. Which control is most appropriate?
A) A Region-restricting IAM policy on each IAM user
B) An SCP with a Deny on the `aws:RequestedRegion` condition
C) Detect resources in unauthorized Regions with a Config rule
D) Block unauthorized traffic with VPC NACLs

**Answer: B**

Explanation: An SCP is a permission ceiling layered on top of IAM permissions that even the **root user** of that account cannot exceed (only the management account itself is exempt). If you Deny the APIs of unauthorized Regions with the `aws:RequestedRegion` condition, no one can create resources in that Region. A (IAM policy) does not apply to root and can be bypassed. C (Config) only detects after the fact (no prevention). D (NACL) is at the network traffic layer and cannot prevent resource creation. Trap: "must block even root" means SCP, not IAM.

---

**Question 8.** When a new account is created, you want to automatically apply a standard security and logging baseline, place it in a designated OU, and enforce preventive and detective guardrails. Which tool is most appropriate?
A) Organizations alone
B) Control Tower + Account Factory
C) CloudFormation StackSets only
D) IAM Identity Center

**Answer: B**

Explanation: Control Tower's Account Factory automatically applies a standard VPC, IAM, CloudTrail, and Config when a new account is created, places it in the designated OU, and enforces guardrails (Preventive = SCP, Detective = Config). A (Organizations alone) can group accounts but has no automatic baseline or guardrails. C (StackSets) can deploy resources but is not an account factory or guardrail orchestration. D is an SSO and permissions tool. Trap: "automatic baseline for new accounts + guardrails" is Control Tower + Account Factory.

---

**Question 9.** A company has 200 VPCs across multiple Regions and connects them all to 2 on-premises data centers, but direct communication between some groups of VPCs must be blocked. Which design is most appropriate?
A) Configure VPC Peering as a full mesh
B) A Transit Gateway per Region + DX Gateway + multiple route tables
C) Attach all VPCs to a single TGW route table
D) Block the other CIDRs with NACLs on each VPC

**Answer: B**

Explanation: A full mesh of Peering for 200 VPCs is N x (N-1)/2 = 19,900 connections, which is unmanageable, and Peering is non-transitive. Build a hub-and-spoke with a **TGW per Region** (transitive routing, O(N)), connect on-premises with a **DX Gateway**, and connect Regions with TGW Peering. Isolating some groups is done by separating routes per attachment with **multiple route tables**. A is an N-squared explosion. C (a single route table) lets all attachments see each other, so there is no isolation. D (NACL) has a heavy operational burden and is hard to apply consistently. Trap: "many VPCs + isolation of some" is TGW + multiple route tables.

---

**Question 10.** A SaaS provider wants to expose its service to many customer VPCs. Customers' IP ranges may overlap, and access must be one-way, only from the customer VPC toward the provider. Which approach is most appropriate?
A) VPC Peering
B) PrivateLink (NLB + Endpoint Service)
C) Site-to-Site VPN
D) Public ALB

**Answer: B**

Explanation: PrivateLink exposes **only a specific service, one-way (consumer to provider)** through the provider NLB, Endpoint Service, and consumer Endpoint, and is **unaffected by IP conflicts** (a single L7 entry point with no routing integration). It is the standard way for a SaaS to expose its API to many customer VPCs. A (Peering) is impossible when IPs conflict and is a bidirectional L3 integration. C (VPN) is network integration, so it carries IP conflicts and management burden. D (Public ALB) is internet exposure, which goes against the private requirement. Trap: "SaaS to many customer VPCs + IP conflicts irrelevant" is PrivateLink.

---

**Question 11.** A company connected on-premises to AWS with Direct Connect, but regulations require the transit path to be encrypted. Which configuration is most appropriate?
A) DX is private, so use it as is (no encryption needed)
B) Apply IPsec VPN over DX (VPN over DX) or MACsec
C) Enable only S3 SSE
D) Use only TLS in the application

**Answer: B**

Explanation: DX is a dedicated line, but it is **plaintext by default**, so encryption of the transit path is needed separately. Encrypt the path with **IPsec VPN over DX** (general purpose, any DX) or **MACsec** (L2 encryption, Dedicated connections only). A is the common-misconception trap that "DX is private, so it is safe." C (S3 SSE) encrypts data at rest, not the transit path. D (application TLS) protects only specific traffic and may fall short of the "encrypt the entire path" requirement. Trap: "DX but encrypted" is IPsec VPN over DX or MACsec.

---

**Question 12.** A company uses Okta for employee SSO and wants to grant AWS permissions differently by department. IAM Users are prohibited because of the credential management burden. Which configuration is most appropriate?
A) IAM User + Access Key
B) IAM Identity Center + Okta SAML + Permission Set
C) Amazon Cognito User Pool
D) Manual Direct Federation configured per account

**Answer: B**

Explanation: IAM Identity Center integrates an external IdP (Okta) over SAML and grants permissions by account and OU with Permission Sets, and users access with temporary credentials, so no IAM Users are needed. A (IAM User) is prohibited because of the long-term credential management burden. C (Cognito) is for application end users, not an employee SSO context. D (manual per-account Federation) has a heavy operational burden and no central management. Trap: "employee SSO + AWS permissions by department + IAM Users prohibited" is IAM Identity Center.

---

**Question 13.** Because of data residency regulations, data cannot leave the data center, but the company wants low-latency processing using the same EC2 and S3 APIs as AWS. Which service is most appropriate?
A) Storage Gateway
B) AWS Outposts
C) Local Zones
D) Direct Connect

**Answer: B**

Explanation: Outposts installs an AWS hardware rack in the customer's data center and provides the same EC2/EBS/S3/RDS APIs, so the data never physically leaves the facility, satisfying the data residency regulation while achieving low latency. A (Storage Gateway) is a storage cache and gateway, not a compute API. C (Local Zones) are AWS-owned external facilities, so the data leaves. D (DX) is only a connection line. Trap: "data residency + same API + on-premises location" is Outposts.

---

**Question 14.** 50 TB of on-premises data must be moved to S3 within one week. The internet connection is 100 Mbps. Which is the most appropriate method?
A) Online transfer with DataSync
B) Physical shipment with Snowball Edge
C) Parallelize S3 Multipart Upload
D) Order Direct Connect and then transfer

**Answer: B**

Explanation: By bandwidth math, 50 TB / 100 Mbps is about 50 days, so a line transfer is impossible within one week. Physical shipment with **Snowball Edge (80 TB)** is possible within one week. A and C depend on the line, so they are impossible at 100 Mbps. D (DX) is also just a line upgrade, and provisioning takes weeks. Trap: "tens of TB + slow line + short deadline" is Snow physical shipment, not the line.

---