# Day 1 - Enterprise Global ERP Migration — Multi-Account Governance History, 7R Migration Anatomy, Data Sovereignty Legal & Technical Roots

[WEEK 15 DAY 1 - COMPREHENSIVE SCENARIO: MULTI-ACCOUNT GOVERNANCE & 7R MIGRATIONS]

In 2017, the giant manufacturer GE set the ambitious goal of "moving 9,000 workloads to the cloud," but a few years later it moved a good number of them back on premises. The core cause of the failure was not technology but **the absence of governance** — hundreds of accounts proliferated without standards, and there was no control over who could launch what in which Region. Capital One, by contrast, laid down Organizations, SCPs, and a standardized account factory first, and only then began migrating, and ultimately succeeded in closing all of its own data centers. This contrast condenses what SAP-C02 Pro is asking — **a large-scale migration is not the work of moving servers; it is the work of first building a controlled landing zone that you can move into.**

Today's scenario is to move 100 TB+ of on-premises SAP and Oracle to AWS across the Americas, the EU, and APAC within six months, with minimal downtime and with EU data never allowed to leave the EU. At the SAA level you would answer "just move it with MGN," but Pro demands a design on top of that in which **account structure, network topology, data sovereignty, DR, and a seven-year audit** interlock as a single whole. Today we take apart in depth why multi-account governance ended up in this shape, how the 7R migration strategies work as a decision tree, and which laws data sovereignty is rooted in.

## Multi-Account Governance — Why a Single Account Is Not Enough

Early AWS users crammed everything into a single account. But as an organization grows, this structure collapses. A single account cannot isolate the **blast radius**, makes it hard to separate costs by team, lets IAM permissions balloon into the hundreds, and exposes everything with a single breach. AWS answered this problem with **Organizations** in 2017, **Control Tower** in 2018, and SCPs (Service Control Policies).

The essence of multi-account is **"using the account as the unit of isolation."** The account boundary is the strongest isolation boundary AWS offers — even if IAM permissions are misconfigured, they cannot reach resources in another account. So Prod, NonProd, Sandbox, Security, and Logging are split into separate accounts, grouped into OUs (Organizational Units), and policies are inherited hierarchically.

This structure implements, at the infrastructure layer, the classic information-security principles of **Principle of Least Privilege** and **Separation of Duties.** It is a physical realization — "account = trust boundary" — of what the NIST SP 800-53 controls AC-5 (separation of duties) and AC-6 (least privilege) require. This is exactly why Security and Logging accounts are separated from workload accounts — audit integrity only holds if workload operators cannot delete the audit logs of their own actions. Sending CloudTrail logs to an Object Lock S3 bucket in a separate Log Archive account is a direct implementation of SOX's requirement that "records must not be alterable by their creator." When you see "operators must not be able to delete logs" on the exam, a separate account + Object Lock is the answer signal.

SCPs **do not grant permissions — they only set a permission ceiling.** This is a common misconception. Writing `Allow` in an SCP does not give a user any permission. IAM policies grant the actual permissions, and the SCP puts a ceiling on top saying "only up to here." That is, final effective permission = (what IAM allows) ∩ (what the SCP allows). If you block non-EU Regions with a `DenyRegions` SCP, even that account's root user cannot create resources in us-east-1 — because root cannot sit above an SCP (the management account itself is the exception). This is why, when you see "even the root user must be blocked" on the exam, the answer is the SCP (B), not an IAM policy (C).

> ⚠️ **Trap**: SCPs **do not apply to the management account.** That is why the security best practice is never to run workloads in the management account and to use it only for managing Organizations. SCPs also have exceptions for service-linked roles and some global services. If you memorize "an SCP can block everything," you fall into the trap — an SCP restricts only the actions of IAM principals; it cannot block all cross-account access that comes in through resource-based policies.

### Control Tower and the Landing Zone

Control Tower is an orchestration service that **builds all of this (Organizations, SCPs, IAM Identity Center, CloudTrail, Config, and the Log Archive and Audit accounts) into a standard landing zone with one button.** The key is the **guardrail** — a predefined control that Control Tower provides, divided into Preventive (SCP-based) and Detective (Config-based). When you stamp out new accounts from a standard template with Account Factory, every new account automatically inherits the same security baseline.

The 2019 **Capital One data breach** (credit card application data of roughly 106 million people) occurred through a combination of a misconfigured WAF and an over-privileged IAM role — one intruder used SSRF to steal credentials from the EC2 instance metadata and read S3. One lesson of this incident is the importance of **account and permission isolation and IMDSv2.** Had the data sat in a separate, strongly isolated account with a Permission Boundary in place, the blast radius would have been smaller. Afterward AWS pushed IMDSv2 (token-based) as the default, and the pattern of forcibly blocking IMDSv1 with an SCP became a best practice. When you see "block lateral movement of stolen credentials" on the exam, think account isolation + Permission Boundary + SCP.

## 7R Migration Strategies — A Different Path for Each Workload

The 7Rs of migration that AWS laid out are not just a collection of terms but **a decision tree for how to handle each workload.** Gartner originally proposed 5Rs (2010), and AWS extended them to 7Rs by adding Relocate and Retire.

| Strategy | Meaning | Effort | Cloud benefit | Representative tool |
|------|------|--------------|--------------|-----------|
| **Retire** | Decommission (what is unused) | Minimal | Immediate cost savings | (Inventory analysis) |
| **Retain** | Hold (do not move for now) | 0 | - | - |
| **Rehost** | Lift and shift | Low | Fast move | **MGN** |
| **Relocate** | Move the hypervisor wholesale | Low | VMware as is | **VMware Cloud on AWS** |
| **Repurchase** | Replace with SaaS | Medium | Removes operational burden | (e.g., SAP→S/4HANA Cloud) |
| **Replatform** | Slight modification (lift-tinker-shift) | Medium | Uses managed services | DMS (Oracle→RDS) |
| **Refactor** | Cloud-native redesign | Maximum | Maximum benefit | DMS+SCT (Oracle→Aurora) |

Choosing a 7R is an optimization problem of **"business value ÷ effort."** Refactor enjoys the cloud's benefits (serverless, managed databases, auto scaling) most, but is the most expensive and risky. Rehost is the opposite — fast, but it carries on-premises inefficiencies over unchanged. The key Pro-exam insight is that **when there is a time constraint such as a "six-month deadline," you first move with Rehost (MGN), then gradually Replatform/Refactor on the cloud.** This is the "lift-and-shift then optimize" pattern. Refactoring a 100 TB Oracle database to Aurora from the start would take months of schema conversion, application code changes, and testing, and would miss the deadline. So in this scenario a mixed strategy is the answer: move Oracle quickly with Rehost (RDS Oracle) and pick out only the core application databases to Refactor (Aurora PostgreSQL).

### MGN — The Magic of Block-Level Replication

**AWS Application Migration Service (MGN)** installs an agent on the on-premises server and **continuously replicates the disks at the block level.** Its hallmark is **continuous replication** — while the source stays live and in operation, data keeps syncing in the background to a staging area in AWS, and only at the cutover moment does it pause briefly and switch over. So downtime is compressed to "the final delta sync + boot" time (usually measured in minutes).

MGN's block-level continuous replication is essentially a combination of **asynchronous replication + CDP (Continuous Data Protection).** In principle it uses the same engine (CloudEndure-based) as the DR service **AWS Elastic Disaster Recovery (DRS)** — MGN is "move once and done," while DRS "keeps replicating and stands by"; only the purpose differs, and the technologies are siblings. So on the exam, "minimal downtime + moving the whole OS" splits to MGN, and "continuous replication on standby for DR" splits to DRS. Do not confuse it with DataSync (files/objects) or DMS (database schema/data) — MGN moves **the entire server (OS + app + data).**

> ⚠️ **Trap**: When moving 100 TB over the network, **bandwidth is time.** Even transferring 100 TB over a 10 Gbps DX takes roughly 22 hours in theory (longer in practice). A realistic approach is a hybrid: ship the initial bulk data physically with **Snowball Edge**, then sync only the deltas online with MGN/DataSync. If you simplify to "100 TB in six months with a single tool," you fall into the bandwidth trap. When you see "tens to hundreds of TB + limited bandwidth" on the exam, first think Snow family + online delta.

## Data Sovereignty — The Law Behind a Single SCP Line

The scenario's "EU data cannot be moved outside the EU" is not a technical requirement but a **legal requirement.** Its root is the **GDPR (General Data Protection Regulation, the EU's general data protection law)** that took effect in 2018. The GDPR strictly restricts transfers of personal data outside the EU, and violations can draw fines of up to 4% of worldwide revenue or 20 million euros, whichever is greater. What enforces this legal risk as a technical control is the **SCP DenyRegions** conditioned on `aws:RequestedRegion`.

Data sovereignty is a broader concept than data residency. Residency is "where is the data physically stored," while Sovereignty also covers "whose country's law governs that data." The US **CLOUD Act (2018)** lets the US require American companies to comply with warrants no matter which country the data is in, so from the EU's perspective a concern arises that "if EU data is placed in a US cloud, US law may reach it." AWS answered with the **AWS European Sovereign Cloud** (announced 2024, operated in Germany, run by EU personnel and an EU legal entity). When a strong sovereignty requirement of "EU data + isolation from US law" appears on the exam, the Sovereign Cloud concept may come up beyond a simple Region restriction.

| Concept | Question | AWS control |
|------|------|----------|
| **Data Residency** | Where is the data stored | SCP DenyRegions, pinning S3 Regions |
| **Data Sovereignty** | Which law governs it | Sovereign Cloud, separate partition |
| **Data Localization** | Must be kept within a specific country | That country's Region, GovCloud |

## Hybrid Network — Redundant Design of DX and TGW

What connects on-premises SAP/Oracle to AWS is **Direct Connect (DX).** DX uses a dedicated fiber link that bypasses the internet, giving consistent low latency and high bandwidth. But a single DX circuit is a single point of failure (SPOF) — so a Pro design always provides redundancy with **two DX circuits (at different DX locations) + a VPN backup,** with automatic failover through BGP.

The routing behavior of this redundant design is determined by **BGP (Border Gateway Protocol, RFC 4271).** Normally the DX path is preferred because its AS-PATH is shorter, and when the DX dies, BGP converges onto the VPN path. If you enable **BFD (Bidirectional Forwarding Detection, RFC 5880)** for faster failure detection, instead of the default BGP hold time (tens of seconds) it detects the link break within one second and accelerates failover. AWS DX recommends BFD, and when you see "fast VPN switchover on a DX failure" on the exam, BGP + BFD is the answer mechanism.

**Transit Gateway (TGW)** is a routing hub that ties many VPCs and on-premises into a hub-and-spoke. In the past VPCs were connected one by one with Peering (a mesh, N² complexity), but TGW simplifies this to O(N) complexity with a central hub. For multiple Regions, a **DX Gateway** connects the TGWs of several Regions to a single DX, and **TGW Peering** links TGWs between Regions.

> 🎯 **Scenario**: "A global manufacturer has several VPCs in each of three Regions (Americas, EU, APAC), and must connect them all to two on-premises data centers while blocking direct traffic between the EU and the Americas. What design is this?" — Answer: **a TGW per Region + TGW Peering + separated TGW route tables.** Place a TGW in each Region and connect on-premises through a DX Gateway, then **use multiple TGW route tables to control in fine detail which attachments can reach where** (removing the route from the EU route table to the Americas attachment isolates them). A single route table cannot achieve this isolation. When you see "connect through TGW but block communication between some VPCs" on the exam, separating multiple route tables is the key.

## DR and Audit — The Last Two Pillars of the Scenario

The DR requirement is an RTO of 2 hours and an RPO of 5 minutes. The answer that meets an RPO of 5 minutes (in practice under 1 second) for multi-Region SQL within the EU is **Aurora Global Database** (eu-central-1 ↔ eu-west-1, storage-level asynchronous replication). The parts that need DynamoDB use Global Tables, and backups are tied together with Cross-Region Copy limited to EU Regions. For audit, the core is **CloudTrail Org Trail → Log Archive S3 + Object Lock 7-year WORM.**

"Immutable for 7 years" is a direct implementation of the **WORM (Write Once Read Many)** retention required by SOX (Sarbanes-Oxley Act, 2002) and SEC Rule 17a-4. S3 Object Lock's **Compliance mode** makes it impossible even for the root user to delete or modify an object within the retention period (in Governance mode, specific privileged users can bypass it). SEC 17a-4 explicitly required WORM storage, and AWS has officially documented that Object Lock Compliance mode satisfies this rule. When you see "regulator requirement, absolutely immutable, 7 years" on the exam, Object Lock **Compliance** (not Governance) is the answer.

## Summary

A large-scale global migration is a design in which **the landing zone (Organizations, Control Tower, SCP) → the network (redundant DX, TGW, DX Gateway) → migration (7R decisions, MGN, DMS+SCT) → data sovereignty (SCP DenyRegions) → DR (Aurora Global) → audit (Org Trail, Object Lock 7 years)** interlock as a single whole. The key insights are (1) an account is the strongest isolation boundary, (2) an SCP grants no permissions but puts a ceiling on them and blocks even root, (3) with a time constraint, Rehost first and then optimize gradually, and (4) data sovereignty is rooted in laws such as the GDPR and the CLOUD Act.

SAP exam mapping: (1) "block moving EU data outside the EU, even for root" → **SCP DenyRegions**, (2) "about 100 servers with minimal downtime" → **MGN (block-level continuous replication)**, (3) "Oracle→Aurora PostgreSQL" → **DMS + SCT (Refactor)**, (4) "audit logs immutable for 7 years" → **Object Lock Compliance**, (5) "multi-Region SQL, RPO in minutes" → **Aurora Global Database**, (6) "fast VPN switchover on a DX failure" → **two DX circuits + VPN + BGP/BFD**, (7) "tens of TB + limited bandwidth" → **Snowball + online delta**, (8) "connect through TGW but isolate some VPCs" → **multiple route tables**. The next day goes to the opposite extreme — a serverless-first design for a three-person startup aiming to scale 100x from zero cost.

---

**Question 1.** Block movement of EU data outside the EU, even for root → **SCP DenyRegions**

**Question 2.** Migrate the whole OS of 100 servers with minimal downtime → **MGN block-level continuous replication**

**Question 3.** Oracle → Aurora PostgreSQL requires schema conversion → **DMS + SCT Refactor**

**Question 4.** 7-year audit logs unmodifiable even by root → **Object Lock Compliance**

**Question 5.** Isolate some VPCs across multiple Regions → **TGW multiple route tables**

**Question 6.** Switch to VPN within 1 second of a DX failure → **2 DX connections + VPN + BGP/BFD**

**Question 7.** 100 TB gradual optimization with a 6-month deadline → **Rehost first, selective Refactor**

---

Next: Week 15 Day 2-5 and Week 16 Day 1-5 complete remaining comprehensive scenarios and conclusion.