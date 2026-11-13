# Day 1 - Domain 1 Review: Designing for Organizational Complexity (26%): The History of Multi-Account Governance, Routing Theory, Hybrid Encryption, and the CS Principles of Isolation Boundaries

SAP-C02 Domain 1, "Design Solutions for Organizational Complexity," is the first domain at a 26% weighting (the largest weighting is Domain 2, Design for New Solutions, at 29%). The essence of the Pro exam is the ability to move beyond the SAA level of "1 account + 1 VPC + 1 Region" and solve scenarios that assume a real enterprise environment of **dozens to hundreds of accounts + dozens of VPCs + multiple Regions + on-premises integration**.

Today we organize all of Domain 1 into four areas (governance, networking, integrated security, and hybrid), while breaking down each tool's **historical background, internal behavior, CS theory, and real incident cases** in depth. If you go beyond simple keyword mapping and understand "why the structure ended up this way," variant scenarios become solvable too.

## Area 1: Governance: The Account Is the Strongest Isolation Boundary

### The History and Principles of Multi-Account

Early AWS users put everything in a single account. As organizations grow, this structure collapses: you can't isolate the blast radius, separating costs by team is hard, IAM permissions balloon to hundreds, and a single breach exposes everything. AWS answered with **Organizations** in 2017 and **Control Tower** and SCPs in 2018.

```
Org Root
  ├── Security OU (Log Archive · Audit accounts)
  ├── Production OU (Account A · B)
  ├── Development OU (Account C)
  └── Sandbox OU (Account D)
```

Multi-account is a physical embodiment, at the infrastructure layer, of the classic information security principles of **Least Privilege** and **Separation of Duties**. It implements what the AC-5 (separation of duties) and AC-6 (least privilege) controls of **NIST SP 800-53** require as "account = trust boundary." The account boundary is **the strongest isolation boundary** AWS provides: even if IAM permissions are misconfigured, they cannot reach resources in other accounts. This is why Security and Logging accounts are separated from workloads: audit integrity holds only if operators can't delete the audit logs of their own actions (a direct implementation of SOX's "records cannot be altered by their creator").

An SCP **does not grant permissions; it only sets a permission ceiling.** Writing `Allow` in an SCP does not give a user permissions. The final effective permission = (what IAM allows) ∩ (what the SCP allows). The recommended pattern is to add `Deny` policies on top of the default `FullAWSAccess` policy (Allow for all actions) to block specific actions, Regions, or services. The key point: SCPs **apply to the root user as well** (only the management account itself is exempt). If you attach a DenyRegions with an `aws:RequestedRegion` condition, even that account's root cannot create resources in non-EU Regions. When you see "must block even root," it is SCP, not IAM.

> ⚠️ **Pitfall**: SCPs **do not apply to the management account**, so the best practice is never to run workloads in the management account and to use it only for managing Organizations. Also, an SCP only restricts the actions of IAM principals; it can't block all cross-account access arriving via resource-based policies, and there are exceptions for service-linked roles. Memorizing "an SCP can block everything" is a trap.

### Control Tower and IAM Identity Center

- **Control Tower**: Builds a standard Landing Zone with the push of a button, combining Organizations + IAM Identity Center + Config + CloudTrail + Backup. **Account Factory** stamps out accounts with a standard baseline (VPC, IAM, CloudTrail), and it enforces **Guardrails** (Preventive = SCP, Detective = Config). Automate with IaC through AFT (Account Factory for Terraform).
- **IAM Identity Center** (formerly SSO): SAML integration with an external IdP (Okta, Azure AD, Ping) + Permission Sets to grant permissions per account and OU. You don't create IAM Users, and SSO users access with temporary credentials. It also supports **ABAC** (tag-based permissions).

The **Capital One data breach** of 2019 (about 106 million people) occurred through a combination of a misconfigured WAF and an over-privileged IAM role: the intruder used SSRF to steal credentials from the EC2 instance metadata (IMDSv1) and read S3. The lessons are **account/permission isolation and the importance of IMDSv2**. Afterward AWS made IMDSv2 (token-based) the default, and blocking IMDSv1 with SCPs and limiting lateral movement with Permission Boundaries became best practices. For "blocking lateral movement of stolen credentials," think account isolation + Permission Boundary + SCP.

> 🎯 **Scenario**: "A company uses SSO with Okta, wants to give AWS permissions differently per department, and wants to forbid IAM Users." → **IAM Identity Center + Okta SAML + a Permission Set per OU/Account**. IAM Users are forbidden because of the burden of managing long-term credentials, and Cognito is for end users of applications, so the context differs. "Employee SSO + per-department AWS permissions" is a direct answer for IAM Identity Center.

## Area 2: Networking: Routing Theory and Multi-VPC

### VPC Connectivity Matrix

| Method | Suitable scale | Transitive | Used for |
|------|-----------|------|--------|
| VPC Peering | 1:1, a few | ✗ (non-transitive) | Simple connections, up to ~10 VPCs |
| Transit Gateway | Dozens to thousands | ✓ | Hub-spoke |
| PrivateLink | Service sharing | N/A | SaaS → customer VPC |
| VPN (Site-to-Site) | On-prem → AWS | ✓ (combined with TGW) | DX backup or standalone |
| Direct Connect | On-prem → AWS dedicated line | ✓ (DX Gateway) | Bandwidth and stability |

TGW replaced the Peering mesh because of **graph complexity**. Meshing N VPCs with Peering requires N×(N−1)/2 connections: with 200 VPCs that's 19,900, which is unmanageable, and Peering is **non-transitive**, so even if A-B and B-C exist, A-C does not work (transitive routing is prohibited). TGW simplifies this to O(N) complexity as a central hub and provides transitive routing (up to 5,000 VPCs). The key point: TGW supports **multiple route tables**, so you can isolate communication scope per attachment; with a single route table, all attachments see each other and isolation is impossible.

The routing of DX redundancy is decided by **BGP (Border Gateway Protocol, RFC 4271)**. Normally the DX path is preferred because its AS-PATH is shorter, and when DX dies, BGP converges to the VPN path. For faster failure detection, enabling **BFD (Bidirectional Forwarding Detection, RFC 5880)** detects a link break within 1 second instead of the default BGP hold time (tens of seconds) and accelerates failover. AWS DX recommends BFD. For multiple Regions, use **DX Gateway** to connect VPCs/TGWs in several Regions to one DX, and **TGW Peering** to link TGWs across Regions. "Switch to VPN within 1 second when DX fails" is BGP + BFD.

The essential difference between **PrivateLink and VPC Peering** is the permission model. Peering merges the full routing of both VPCs (L3), is bidirectional, and is impossible when IPs conflict. PrivateLink exposes **only a specific service, one-way (consumer → provider)** through provider NLB → Endpoint Service → consumer Endpoint (a single L7 entry point), and is **independent of IP conflicts** (works even when ranges overlap). So "a SaaS provider exposing its service to many customer VPCs + IP conflicts are irrelevant" is always PrivateLink.

> 🎯 **Scenario**: "A global manufacturer wants to connect many VPCs across 3 Regions (Americas, EU, APAC) with TGW, but direct communication between EU VPCs and Americas VPCs must be blocked." → **A TGW per Region + TGW Peering + separated multiple route tables**. Connect each Region's TGW to on-premises with DX Gateway, and use the TGW's **multiple route tables** to finely control routes per attachment (isolate by leaving the Americas attachment's routes out of the EU route table). Isolation is impossible with a single route table. "TGW connectivity + isolating some VPCs" is multiple route tables.

### Direct Connect Details

- **Dedicated**: 1G, 10G, 100G dedicated to a single customer. **Hosted**: 50 Mbps to 10G split from a partner circuit.
- **MACsec**: L2 encryption (Dedicated only). **SiteLink**: Connects DX locations to each other over the AWS backbone (like a global WAN).

DX is **plaintext** by default: it's a dedicated line, but it is not encrypted. So AWS recommends **DX + IPsec VPN over DX** (encryption + stability), or L2 encryption with **MACsec (IEEE 802.1AE)**, added in 2021 (supported only on Dedicated connections). When you see "it's DX but encryption is required," IPsec VPN over DX or MACsec is the signal for the correct answer. Assuming DX provides encryption by default because it is private is a trap.

## Area 3: Multi-Account Integrated Security

| Service | Org integration model | Purpose |
|--------|--------------|------|
| Security Hub | Delegated administrator | Finding aggregation + CIS/PCI standards checks |
| GuardDuty | Delegated administrator | Threat detection (analyzes VPC Flow, DNS, CloudTrail) |
| Macie | Delegated administrator | PII detection in S3 |
| Inspector | Delegated administrator | Vulnerability scanning (EC2, ECR, Lambda) |
| Firewall Manager | Delegated administrator | Bulk policies for WAF, SG, Network Firewall, DNS Firewall |
| Config Aggregator | Aggregation | Single view of configuration across all accounts and Regions + Conformance Packs |

The pattern of multi-account security is **"designate a dedicated security account as the delegated administrator."** You don't put security operations in the management account (risk of total exposure if the management account is breached); instead you give a separate Security account the delegated administrator role for GuardDuty, Security Hub, and Macie to aggregate Findings from all accounts. With the **auto-enroll new accounts** option, even new accounts created by Account Factory are automatically brought into the security baseline. "An Org-wide security aggregation dashboard + automatic for new accounts" is the delegated administrator model + auto-enroll.

During the **2021 US-EAST-1 major outage**, IAM and some global services depended on us-east-1, so even users in other Regions were affected. The lessons for multi-account and multi-Region design are (1) **reduce single dependence on us-east-1** (use STS Regional endpoints), (2) **give logging and security accounts Regional resilience too**, and (3) the **CloudTrail Org Trail must cover all Regions**.

## Area 4: Hybrid: On-Premises Integration

| Service | Behavior | Used for |
|--------|------|--------|
| Outposts | AWS hardware installed in the customer's DC, same EC2/EBS/S3/RDS APIs | Data residency and low latency (factories, hospitals) |
| Local Zones | Small DCs near major metros, connected to the parent Region | Low-latency metro workloads |
| Wavelength | 5G carrier edge | Millisecond mobile latency |
| Storage Gateway | File (NFS/SMB→S3), Volume (iSCSI→EBS), Tape (VTL→Glacier) | On-prem ↔ cloud storage |
| DataSync | Online synchronization (NFS/SMB/HDFS→S3/EFS) | When the line is sufficient |
| Snow Family | Snowcone 8TB, Snowball Edge 80TB, Snowmobile 100PB | Insufficient line, bulk transport |

> 🎯 **Scenario**: "Due to data residency regulations the data cannot leave the data center, yet the company wants to run EC2 and S3 with the same APIs as AWS." → **AWS Outposts**. Outposts places an AWS hardware rack in the customer's DC and provides the same APIs, so the data physically never leaves the facility. Local Zones are AWS-owned facilities, so the data leaves (is exported). "Data residency + same AWS APIs + on-prem location" is Outposts.

> ⚠️ **Pitfall**: Snow vs DataSync is decided by **bandwidth math**. 50 TB ÷ 100 Mbps ≈ 50 days (infeasible) → Snowball Edge. DataSync is the answer only when the line is sufficient. Answering DataSync for "tens of TB + a slow line + a short deadline" is a trap: physical transport (Snow) is the answer.

## Scenario Keyword → Answer Mapping

| Keyword | Answer |
|--------|------|
| "Block unauthorized Regions, even root" | SCP Deny `aws:RequestedRegion` |
| "Automatic baseline and guardrails for new accounts" | Control Tower + Account Factory |
| "100+ VPCs + on-prem, multi-Region" | TGW + DX Gateway |
| "Simple connections for fewer than 10 VPCs" | VPC Peering |
| "SaaS → customer VPC, IP conflicts irrelevant" | PrivateLink (NLB Endpoint Service) |
| "Switch to VPN within 1 second on DX failure" | BGP + BFD |
| "It's DX but encryption is needed" | IPsec VPN over DX or MACsec |
| "Okta SSO + per-department AWS permissions" | IAM Identity Center + SAML |
| "Org-level WAF and SG policies" | Firewall Manager |
| "Org security aggregation dashboard, automatic for new accounts" | Security Hub delegated administrator + auto-enroll |
| "TGW connectivity + isolating some VPCs" | TGW multiple route tables |
| "Data residency + same API on-prem" | Outposts |
| "5G mobile millisecond latency" | Wavelength |
| "Automatic sync of on-prem NFS → S3" | DataSync or File Gateway |
| "50TB in 1 week + a slow line" | Snowball Edge |

## Summary

Domain 1 asks about **integrated governance across enterprise multi-account + multi-VPC + hybrid**. Key insights: (1) the account is the strongest isolation boundary (a physical embodiment of NIST's separation of duties); an SCP does not grant permissions but puts a ceiling over them, and blocks even root; (2) networking is graph complexity: Peering is N² and non-transitive, TGW is O(N) transitive + multi-route-table isolation, and DX failover is BGP+BFD; (3) integrated security is a delegated administrator + auto-enroll of new accounts; (4) for hybrid, Outposts if data residency applies, and bandwidth math decides Snow vs DataSync. Drilling the scenario keyword → direct answer mapping into your head is the fastest way to prepare.

Tomorrow (Day 77) we organize Domain 2, Design for New Solutions, in depth through CAP/PACELC and the internal workings of event architectures.

---

## 📝 Practice Questions

**Question 1.** A global company wants to block the use of unauthorized Regions (for example, us-east-1) in a subsidiary's accounts. Even the account's root user must not be able to create resources in that Region. What is the most suitable control?

A) A Region-restricting IAM Policy on each IAM user

B) A Deny in an SCP with an `aws:RequestedRegion` condition

C) A Config Rule that detects resources in unauthorized Regions

D) A VPC NACL that blocks unauthorized traffic

**Answer: B**

Explanation: An SCP is a permission ceiling laid over IAM permissions, and it keeps even **the account's root user** from exceeding it (only the management account itself is exempt). If you Deny the API of an unauthorized Region with an `aws:RequestedRegion` condition, nobody can create resources in that Region. A (IAM Policy) does not apply to root, so it can be bypassed. C (Config) only detects after the fact (not preventive). D (NACL) is at the network traffic layer and can't stop resource creation. Pitfall: "must block even root" is SCP, not IAM.

---

**Question 2.** When a new account is created, you want to automatically apply a standard security and logging baseline, place it in a designated OU, and enforce preventive and detective guardrails. What is the most suitable tool?

A) Organizations alone

B) Control Tower + Account Factory

C) CloudFormation StackSets only

D) IAM Identity Center

**Answer: B**

Explanation: Control Tower's Account Factory automatically applies the standard VPC, IAM, CloudTrail, and Config when a new account is created, places it in the designated OU, and enforces Guardrails (Preventive = SCP, Detective = Config). A (Organizations alone) can group accounts but has no automatic baseline or guardrails. C (StackSets) can deploy resources but is not an account factory or guardrail orchestration. D is an SSO/permissions tool. Pitfall: "automatic baseline + guardrails for new accounts" is Control Tower + Account Factory.

---

**Question 3.** You have 200 VPCs across several Regions and want to connect all of them with 2 on-premises data centers, but direct communication between some groups of VPCs must be blocked. What is the most suitable design?

A) Configure all VPC Peering as a full mesh

B) A Transit Gateway per Region + DX Gateway + multiple route tables

C) Connect all VPCs to a single TGW route table

D) Block the other CIDRs with NACLs on each VPC

**Answer: B**

Explanation: Meshing 200 VPCs with Peering gives N×(N−1)/2 = 19,900 connections, which is unmanageable, and Peering is non-transitive. Build hub-and-spoke with a **TGW per Region** (transitive routing, O(N)), connect on-premises with **DX Gateway**, and link Regions with TGW Peering. Isolating some groups is done by separating routes per attachment with **multiple route tables**. A is an N² explosion. C (a single route table) lets all attachments see each other, so isolation is impossible. D (NACLs) has a heavy operational burden and is hard to apply consistently. Pitfall: "large-scale VPCs + isolating some" is TGW + multiple route tables.

---

**Question 4.** A SaaS provider wants to expose its service to many customer VPCs. Each customer's IP ranges may overlap, and access must be one-way only, from the customer VPC toward the provider. What is the most suitable method?

A) VPC Peering

B) PrivateLink (NLB + Endpoint Service)

C) Site-to-Site VPN

D) Public ALB

**Answer: B**

Explanation: PrivateLink exposes **only a specific service, one-way (consumer → provider)** through provider NLB → Endpoint Service → consumer Endpoint, and is **independent of IP conflicts** (a single L7 entry point, no routing merge). It is the standard for a SaaS exposing its API to many customer VPCs. A (Peering) is impossible with IP conflicts and is bidirectional L3 integration. C (VPN) is network integration, so it carries IP conflicts and management burden. D (Public ALB) is internet exposure, which conflicts with the private requirement. Pitfall: "SaaS → many customer VPCs + IP conflicts irrelevant" is PrivateLink.

---

**Question 5.** You connected on-premises and AWS with Direct Connect, but regulations require the transit segment to be encrypted. What is the most suitable configuration?

A) Use DX as is since it's private (no encryption needed)

B) Apply IPsec VPN over DX (VPN over DX) or MACsec

C) Enable only S3 SSE

D) Use only TLS in the application

**Answer: B**

Explanation: DX is a dedicated line but **plaintext by default**, so encryption of the transit segment is needed separately. Encrypt the segment with **IPsec VPN over DX** (general-purpose, any DX) or **MACsec** (L2 encryption, Dedicated connections only). A is the common-misconception trap "DX is private so it's safe." C (S3 SSE) is encryption of data at rest, not the transit segment. D (app TLS) protects only specific traffic and may fall short of a "whole-segment encryption" requirement. Pitfall: "it's DX but encryption" is IPsec VPN over DX or MACsec.

---

**Question 6.** A company uses Okta for employee SSO and wants to grant AWS permissions differently per department. IAM Users are forbidden because of the burden of managing credentials. What is the most suitable configuration?

A) IAM User + Access Key

B) IAM Identity Center + Okta SAML + Permission Set

C) Amazon Cognito User Pool

D) Manual Direct Federation configuration per account

**Answer: B**

Explanation: IAM Identity Center grants permissions per account and OU with SAML integration to an external IdP (Okta) + Permission Sets, and users access with temporary credentials, so no IAM Users are needed. A (IAM User) is forbidden because of the burden of managing long-term credentials. C (Cognito) is for end users of applications, so it is not the employee SSO context. D (manual per-account Federation) has a heavy operational burden and no central management. Pitfall: "employee SSO + per-department AWS permissions + no IAM Users" is IAM Identity Center.

---

**Question 7.** Due to data residency regulations the data cannot leave the data center, and you want low-latency processing with the same EC2 and S3 APIs as AWS. What is the most suitable service?

A) Storage Gateway

B) AWS Outposts

C) Local Zones

D) Direct Connect

**Answer: B**

Explanation: Outposts installs an AWS hardware rack in the customer's data center and provides the same EC2/EBS/S3/RDS APIs, so the data physically never leaves the facility, satisfying data residency regulations while achieving low latency. A (Storage Gateway) is a storage cache/gateway, not a compute API. C (Local Zones) is an AWS-owned external facility, so the data leaves. D (DX) is merely a connection line. Pitfall: "data residency + same API + on-prem location" is Outposts.

---

**Question 8.** You must move 50 TB of on-premises data to S3 within 1 week. The internet line is 100 Mbps. What is the most suitable method?

A) Online transfer with DataSync

B) Physical transport with Snowball Edge

C) Parallelize S3 Multipart Upload

D) Apply for Direct Connect, then transfer

**Answer: B**

Explanation: By bandwidth math, 50 TB ÷ 100 Mbps ≈ 50 days, so line transfer is impossible within 1 week. Physical transport with **Snowball Edge (80 TB)** is possible within 1 week. A and C depend on the line, so they are impossible at 100 Mbps. D (DX) is also just adding a line, and provisioning takes several weeks. Pitfall: "tens of TB + a slow line + a short deadline" is Snow physical transport, not the line.

---
