# Day 1 - Large Enterprise Global ERP Migration: The History of Multi-Account Governance, the Anatomy of the 7 Rs of Migration, and the Legal and Technical Roots of Data Sovereignty

In 2017, the giant manufacturer GE set an ambitious goal to "move 9,000 workloads to the cloud," but a few years later moved a significant share of them back on premises. The core cause of the failure was not technology but **the absence of governance** - hundreds of accounts sprawled without standards, and there was no control over who could launch what in which Region. By contrast, around the same time, Capital One first laid down Organizations, SCPs, and a standardized account factory before starting its migration, and ultimately succeeded in closing all of its own data centers. This contrast condenses what SAP-C02 Pro is really asking - **a large-scale migration is not the work of moving servers; it is the work of first building a controlled landing zone to move them into.**

Today's scenario is to move 100 TB+ of on-premises SAP and Oracle to AWS across the Americas, EU, and APAC within 6 months, minimizing downtime and ensuring that EU data cannot leave the EU. At the SAA level you would answer "just migrate with MGN," but Pro demands a design in which **account structure, network topology, data sovereignty, DR, and 7-year auditing** interlock as a single whole. Today we take apart in depth why multi-account governance has the shape it does, how the 7 Rs migration strategies work as a decision tree, and which laws data sovereignty is rooted in.

## Multi-Account Governance - Why a Single Account Is Not Enough

Early AWS users crammed everything into a single account. But as an organization grows, this structure collapses. A single account cannot isolate the **blast radius**, makes it hard to separate costs by team, lets IAM permissions balloon into the hundreds, and exposes everything with a single breach. AWS answered this problem with **Organizations** in 2017, **Control Tower** in 2019, and SCPs (Service Control Policies).

The essence of multi-account is **"using the account as the unit of isolation."** The account boundary is the strongest isolation boundary AWS provides - even if IAM permissions are misconfigured, they cannot reach resources in another account. So Prod, NonProd, Sandbox, Security, and Logging are split into separate accounts, grouped into OUs (Organizational Units), and policies are inherited hierarchically.

This structure implements the classic information security principles of **least privilege** and **separation of duties** at the infrastructure layer. It physically realizes, as "account = trust boundary," what NIST SP 800-53 controls AC-5 (separation of duties) and AC-6 (least privilege) require. This is exactly why Security and Logging accounts are separated from workload accounts - audit integrity only holds if workload operators cannot erase the audit logs of their own actions. The design of sending CloudTrail logs to an Object Lock S3 bucket in a separate Log Archive account is a direct implementation of SOX's requirement that "records must not be alterable by their creator." When you see "operators must not be able to delete logs" on the exam, a separate account + Object Lock is the answer signal.

SCPs **do not grant permissions - they only set a permission ceiling.** This is a common misconception. Writing `Allow` in an SCP does not give a user any permission. Actual permissions are granted by IAM policies, and the SCP puts a "this far and no further" ceiling over them. That is, effective permissions = (what IAM allows) ∩ (what the SCP allows). If you block non-EU Regions with a `DenyRegions` SCP, even that account's root user cannot create resources in us-east-1 - because root cannot sit above an SCP (the management account itself is the exception). This is why, when you see "the root user must also be blocked" on the exam, the answer is an SCP (B) rather than an IAM Policy (C).

> ⚠️ **Trap**: SCPs **do not apply to the management account.** That is why the security best practice is never to run workloads in the management account and use it only for managing Organizations. SCPs also have exceptions for service-linked roles and some global services. If you memorize "SCPs can block everything," you fall into the trap - SCPs restrict only the actions of IAM principals; they do not block everything, such as cross-account access that comes in through resource-based policies.

### Control Tower and the Landing Zone

Control Tower is an orchestration service that **builds all of this (Organizations, SCPs, IAM Identity Center, CloudTrail, Config, Log Archive and Audit accounts) into a standard landing zone with one button.** The core is **guardrails** - predefined controls provided by Control Tower, divided into Preventive (SCP-based) and Detective (Config-based). When you stamp out new accounts from a standard template with Account Factory, every new account automatically inherits the same security baseline.

The 2019 **Capital One data breach** (credit card application information for about 106 million people) happened through a combination of a misconfigured WAF and an over-privileged IAM role - an intruder used SSRF to steal credentials from the EC2 instance metadata and read S3. One lesson of this incident is **the importance of account and permission isolation and IMDSv2.** If the data had been in a separate, strongly isolated account and a Permission Boundary had been applied, the blast radius would have been smaller. Afterward, AWS pushed IMDSv2 (token-based) as the default, and the pattern of forcibly blocking IMDSv1 with an SCP became a best practice. When you see "block lateral movement of stolen credentials" on the exam, think account isolation + Permission Boundary + SCP.

## The 7 Rs of Migration Strategy - A Different Path for Each Workload

The 7 Rs of migration that AWS laid out are not just a collection of terms but **a decision tree for how to handle each workload.** Gartner originally presented the 5 Rs (2010), and AWS expanded it to 7 Rs by adding Relocate and Retire.

| Strategy | Meaning | Effort | Cloud benefit | Representative tool |
|------|------|------|--------------|-----------|
| **Retire** | Decommission (what is unused) | Minimal | Immediate cost savings | (Inventory analysis) |
| **Retain** | Hold (do not move for now) | 0 | - | - |
| **Rehost** | Lift and shift | Low | Fast migration | **MGN** |
| **Relocate** | Move the hypervisor wholesale | Low | VMware as is | **VMware Cloud on AWS** |
| **Repurchase** | Replace with SaaS | Medium | Removes operational burden | (e.g., SAP -> S/4HANA Cloud) |
| **Replatform** | Slight modification (lift-tinker-shift) | Medium | Leverage managed services | DMS (Oracle -> RDS) |
| **Refactor** | Cloud-native redesign | Maximum | Maximum benefit | DMS+SCT (Oracle -> Aurora) |

Choosing among the 7 Rs is an optimization problem of **"business value ÷ effort."** Refactor enjoys the greatest cloud benefits (serverless, managed DBs, auto scaling) but is the most expensive and risky. Rehost is the opposite - fast, but it carries over on-premises inefficiencies as is. The key Pro exam insight is: **when there is a time constraint such as a "6-month deadline," first move with Rehost (MGN), then gradually Replatform/Refactor on the cloud.** This is the "lift-and-shift then optimize" pattern. Refactoring a 100 TB Oracle to Aurora from the start would take months for schema conversion, application code changes, and testing, missing the deadline. So in the scenario, the winning answer is a mixed strategy: move Oracle quickly by Rehost (RDS Oracle), and pick only the core application DBs to Refactor (Aurora PostgreSQL).

### MGN - The Magic of Block-Level Replication

**AWS Application Migration Service (MGN)** installs an agent on the on-premises server and **continuously replicates the disk at the block level.** Its hallmark is **continuous replication** - while the source stays live and in operation, data is continuously synchronized in the background to a staging area in AWS, and only at the moment of cutover does it briefly pause and switch over. So downtime is compressed to "the final delta sync + boot" time (usually minutes).

MGN's block-level continuous replication is essentially a combination of **asynchronous replication + CDP (Continuous Data Protection)**. In principle it uses the same engine (CloudEndure-based) as the DR service **AWS Elastic Disaster Recovery (DRS)** - only the purpose differs: MGN is "move once and done," while DRS "keeps replicating and stands by"; the technology is a sibling. So on the exam, "minimal downtime + move the whole OS" goes to MGN, and "continuous replication and standing by for DR" goes to DRS. Do not confuse it with DataSync (files/objects) or DMS (DB schemas/data) - MGN moves the **entire server (OS + app + data)**.

> ⚠️ **Trap**: When moving 100 TB over the network, **bandwidth is time.** Even transferring 100 TB over a 10 Gbps DX takes about 22 hours in theory (longer in practice). A realistic approach is a hybrid: ship the initial bulk data physically with **Snowball Edge**, then synchronize only the deltas online with MGN/DataSync. If you oversimplify to "100 TB in 6 months with a single tool," you fall into the bandwidth trap. When you see "tens to hundreds of TB + limited bandwidth" on the exam, first think of the Snow Family + online delta combination.

## Data Sovereignty - The Law Behind One Line of SCP

The scenario's "EU data cannot be moved outside the EU" is not a technical requirement but a **legal requirement.** Its root is the **GDPR (General Data Protection Regulation, the EU's general data protection law)**, in force since 2018. The GDPR strictly restricts the transfer of personal data outside the EU, and violations can be fined up to 4% of global revenue or 20 million euros, whichever is greater. Enforcing this legal risk through technical controls is the **SCP DenyRegions** conditioned on `aws:RequestedRegion`.

Data sovereignty is a broader concept than data residency. Residency is "where is the data physically stored," while sovereignty also covers "which country's laws govern that data." The US **CLOUD Act (2018)** can require US companies to comply with warrants regardless of which country the data is in, which gives the EU the concern that "if EU data is placed in a US cloud, US law can reach it." AWS answered with the **AWS European Sovereign Cloud** (announced 2024, operated from Germany, run by EU personnel and an EU legal entity). When a strong sovereignty requirement of "EU data + isolation from US law" appears on the exam, the Sovereign Cloud concept may come up beyond simple Region restriction.

| Concept | Question | AWS control |
|------|------|----------|
| **Data Residency** | Where is the data stored | SCP DenyRegions, pinning S3 Regions |
| **Data Sovereignty** | Which law governs it | Sovereign Cloud, a separate partition |
| **Data Localization** | Must be kept within a specific country | That country's Region, GovCloud |

## Hybrid Network - Redundant Design with DX and TGW

What connects on-premises SAP/Oracle to AWS is **Direct Connect (DX)**. DX uses dedicated fiber and bypasses the internet, giving consistently low latency and high bandwidth. But a single DX circuit is a single point of failure (SPOF) - so a Pro design always provides redundancy with **two DX circuits (at different DX locations) + a VPN backup**, with automatic failover via BGP.

The routing behavior of this redundant design is determined by **BGP (Border Gateway Protocol, RFC 4271)**. Normally the DX path is preferred because its AS-PATH is shorter, and when DX dies, BGP converges onto the VPN path. For faster failure detection, enabling **BFD (Bidirectional Forwarding Detection, RFC 5880)** detects link loss within 1 second instead of the default BGP hold time (tens of seconds), accelerating failover. AWS DX recommends BFD, and when you see "fast switchover to VPN upon DX failure" on the exam, BGP + BFD is the correct mechanism.

**Transit Gateway (TGW)** is a routing hub that ties many VPCs and on-premises together in a hub-and-spoke model. Previously VPCs were connected one by one with Peering (a mesh structure, N² complexity), but TGW simplifies this to O(N) complexity with a central hub. For multiple Regions, a **DX Gateway** connects the TGWs of multiple Regions to a single DX, and **TGW Peering** links TGWs across Regions.

> 🎯 **Scenario**: "A global manufacturer has multiple VPCs in each of 3 Regions (Americas, EU, APAC) and must connect all of them with 2 on-premises data centers, while blocking direct traffic between the EU and the Americas. What is the design?" - Answer: **per-Region TGW + TGW Peering + separated TGW route tables**. Place a TGW in each Region and connect on-premises with a DX Gateway, then **use multiple route tables on the TGW to finely control which attachments can reach where** (removing the route from the EU route table to the Americas attachment isolates them). This isolation is impossible with a single route table. When you see "connect with TGW but block communication between some VPCs" on the exam, separating multiple route tables is the key.

## DR and Auditing - The Last Two Pillars of the Scenario

The DR requirement is RTO 2 hours and RPO 5 minutes. For multi-Region SQL, the correct answer that meets an RPO of 5 minutes (in practice under 1 second) within the EU is **Aurora Global Database** (eu-central-1 ↔ eu-west-1, storage-level asynchronous replication). Parts that need DynamoDB use Global Tables, and backups are bundled with Cross-Region Copy restricted to EU Regions. For auditing, the core is **CloudTrail Org Trail -> Log Archive S3 + Object Lock 7-year WORM**.

"Unalterable for 7 years" is a direct implementation of the **WORM (Write Once Read Many)** retention required by SOX (Sarbanes-Oxley Act, 2002) and SEC Rule 17a-4. S3 Object Lock's **Compliance mode** makes it impossible for even the root user to delete or modify an object within its retention period (in Governance mode, specific privileged users can bypass it). SEC 17a-4 explicitly required WORM storage, and AWS has officially documented that Object Lock Compliance mode satisfies this regulation. When you see "regulator requirement, absolutely unalterable, 7 years" on the exam, Object Lock **Compliance** (not Governance) is the answer.

## Wrapping Up

A large-scale global migration is a design in which the **landing zone (Organizations, Control Tower, SCPs) -> network (DX redundancy, TGW, DX Gateway) -> migration (7 Rs decisions, MGN, DMS+SCT) -> data sovereignty (SCP DenyRegions) -> DR (Aurora Global) -> auditing (Org Trail, Object Lock 7 years)** interlock as a single whole. The key insights are (1) an account is the strongest isolation boundary, (2) an SCP does not grant permissions but only puts a ceiling over them, and it blocks even root, (3) with a time constraint, Rehost first and then optimize gradually, and (4) data sovereignty is rooted in laws such as GDPR and the CLOUD Act.

SAP exam mapping: (1) "block EU data from moving to non-EU, even root" -> **SCP DenyRegions**, (2) "about 100 servers with minimal downtime" -> **MGN (block-level continuous replication)**, (3) "Oracle -> Aurora PostgreSQL" -> **DMS + SCT (Refactor)**, (4) "7-year unalterable audit logs" -> **Object Lock Compliance**, (5) "multi-Region SQL, RPO in minutes" -> **Aurora Global Database**, (6) "fast VPN switchover upon DX failure" -> **2 DX circuits + VPN + BGP/BFD**, (7) "tens of TB + limited bandwidth" -> **Snowball + online delta**, (8) "connect with TGW but isolate some VPCs" -> **multiple route tables**. The next day takes up the polar opposite extreme - a serverless-first design in which a 3-person startup aims for 100x scaling from zero cost.

---

## 📝 Practice Questions

**Question 1.** A global company wants to enforce that EU workload data cannot be moved to Regions outside the EU. Even the account's root user must be unable to create resources in us-east-1. What is the most suitable control?

A) Attach a Region-restricting IAM Policy to each IAM user

B) Apply a DenyRegions SCP with an `aws:RequestedRegion` condition

C) Detect non-EU Region resources with a Config Rule

D) Block non-EU traffic with VPC NACLs

**Answer: B**

Explanation: An SCP is a permission ceiling placed over IAM permissions, and it prevents even the **root user** of that account from exceeding the ceiling (only the management account itself is the exception). If you Deny API calls to non-EU Regions with an `aws:RequestedRegion` condition, no one can create resources in those Regions. The IAM Policy in A does not apply to root, so root can bypass it. Config in C only detects and does not prevent (after the fact). The NACL in D operates at the network traffic layer, so it cannot block resource creation itself. Trap: when you see "root must also be blocked," it is an SCP, not IAM.

---

**Question 2.** You are moving about 100 on-premises servers to AWS with minimal downtime. The OS, apps, and data must all be moved as a whole, and the source keeps operating until cutover. What is the most suitable tool?

A) AWS DataSync

B) AWS DMS

C) AWS Application Migration Service (MGN)

D) AWS Snowball only

**Answer: C**

Explanation: MGN installs an agent on the source server and **continuously replicates the disk at the block level**, synchronizing in the background while the source operates and pausing briefly only at the moment of cutover - downtime is compressed to "the final delta + boot" (minutes). The key is that it moves the entire server (OS + app + data). DataSync in A is for file and object transfer, so it does not move a whole server. DMS in B is for DB schema and data migration. Snowball alone in D is good for transporting large initial data but does not provide continuous replication or a minimal-downtime cutover. Trap: "whole OS + minimal downtime" is MGN, and "continuous replication then DR standby" is DRS.

---

**Question 3.** You want to convert an Oracle database to Aurora PostgreSQL to reduce operational burden and eliminate license costs. Conversion of the schema and stored procedures is also needed. What is the most suitable combination?

A) Rehost the DB server with MGN

B) DMS + Schema Conversion Tool (SCT)

C) Rehost to RDS Oracle and stop

D) Ship a dump with Snowball

**Answer: B**

Explanation: A conversion between heterogeneous engines (Oracle -> PostgreSQL) is **Refactor/Replatform**, and the SQL dialect differences in schemas, stored procedures, and functions must be converted. **SCT (Schema Conversion Tool)** automatically converts schemas and code (reporting the parts that cannot be converted), and **DMS** continuously replicates the actual data and supports a minimal-downtime cutover. A only moves the OS and is not an engine conversion. C keeps Oracle as is (license costs remain), which defeats the goal. D is a one-time dump with no continuous synchronization or cutover. Trap: "heterogeneous engine conversion + schema conversion" is the direct answer of DMS+SCT.

---

**Question 4.** A financial regulator requires transaction audit logs to be retained for 7 years so that **no one (including administrators and root) can modify or delete them**. What is the most suitable setting?

A) S3 Versioning + bucket policy

B) S3 Object Lock **Compliance** mode with 7-year retention

C) S3 Object Lock **Governance** mode with 7-year retention

D) Glacier Deep Archive for 7 years

**Answer: B**

Explanation: Object Lock **Compliance** mode forces it so that **even the root user** cannot delete or modify objects within the retention period, satisfying the WORM (Write Once Read Many) required by SEC Rule 17a-4 and SOX. **Governance** mode in C can be bypassed by a principal holding the `s3:BypassGovernanceRetention` permission, so it falls short of the "no one can modify" requirement - the distinction between these two is the key trap. Versioning in A keeps previous versions but cannot prevent deletion itself. Glacier in D is inexpensive storage but does not by itself guarantee immutability (Vault Lock is separately needed). Trap: "regulation, absolutely unalterable" is Compliance, not Governance.

---

**Question 5.** A global manufacturer connects many VPCs in the Americas, EU, and APAC Regions with TGW but must block direct communication between EU VPCs and Americas VPCs. What is the most suitable approach?

A) Associate all VPCs with a single TGW route table

B) Create multiple route tables on the TGW and separate the routes per attachment

C) Configure all VPC Peering as a full mesh

D) Block the other side's CIDR with NACLs in each VPC

**Answer: B**

Explanation: TGW supports **multiple route tables**, and which route table each VPC attachment is associated with finely controls the communication scope. If you remove the Americas VPC routes from the EU attachment's route table, direct EU-Americas communication is blocked at the routing stage - a centralized, scalable isolation. The single route table in A makes all attachments visible to each other, so there is no isolation. The mesh Peering in C has N² complexity, management explodes, and it discards the benefits of TGW. The NACLs in D carry a heavy operational burden and are hard to apply consistently across dozens of VPCs. Trap: "TGW connection + some isolation" is multiple route tables.

---

**Question 6.** You connect on-premises and AWS with Direct Connect, but on a DX circuit failure it must automatically switch over to a backup VPN within 1 second. What is the most suitable configuration?

A) A single DX + manual failover

B) 2 DX circuits + VPN backup + BFD enabled on BGP

C) Two VPNs only

D) Routing through an Internet Gateway

**Answer: B**

Explanation: Highly available hybrid connectivity uses redundancy with **2 DX circuits at different DX locations + a VPN backup**, with dynamic routing configured via **BGP**. Normally the DX with the shorter AS-PATH is preferred, and on failure it converges onto the VPN. Enabling **BFD (RFC 5880)** instead of the default BGP hold time (tens of seconds) detects link loss within 1 second and accelerates failover. A is a SPOF and manual switchover is slow. C gives up DX's consistent low latency and high bandwidth. D is not a dedicated circuit and cannot guarantee consistent performance or security. Trap: "fast switchover within 1 second" is BGP + BFD.

---

**Question 7.** You must move 100 TB of on-premises Oracle with a 6-month deadline. You want to redesign only the core analytics DB for Aurora, move the rest quickly, and then optimize gradually on the cloud. What is the most suitable combination of strategies?

A) Refactor all DBs to Aurora from the start

B) Rehost the rest to RDS Oracle, and Refactor only the core analytics DB with DMS+SCT

C) Ship everything with Snowball and manually restore on EC2

D) Retain everything (hold)

**Answer: B**

Explanation: With a time constraint, the Pro textbook approach is **"move quickly first (Rehost) and then optimize gradually on the cloud (Replatform/Refactor)."** Refactoring the entire 100 TB to Aurora from the start would take months for schema conversion, application changes, and testing, missing the deadline. So the optimal mix is to Rehost most of it to RDS Oracle for a fast move and pick only the core analytics DB with high business value to Refactor with DMS+SCT. A carries a large deadline risk. C is inefficient and high-risk because of manual restoration. D means not migrating at all. Trap: "deadline + gradual optimization" is Rehost first, then selective Refactor.

---
