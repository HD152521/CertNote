# Day 1 - Well-Architected Framework Synthesis — 6 Pillars Integrated, Trade-offs Across Domains

Week 16 comprehensive integration: All 13 weeks + 15 weeks of separate pillars must now act as **one coherent design.**

**The fundamental truth**: No pillar lives alone. Choosing Aurora Global (Reliability RPO<1s) costs 2x vs RDS Multi-AZ (Reliability RPO 0). Adding Multi-Region (Reliability + Disaster Recovery) increases latency (Performance -) and cost (Cost -). Encryption (Security +) reduces throughput (Performance -). Logging everything (Security + Compliance +) explodes storage costs (Cost -).

Pro architect sees the **trade-off matrix** and makes prioritized choices based on **business context, not equal pillar weight.**

Weight by industry:
- Financial: Security > Reliability > Cost
- Healthcare: Security = Compliance > Availability > Cost
- Gaming: Performance = Reliability > Cost > Security
- Startup: Cost > Reliability > Performance > Security (early stage)

Key mappings: (1) "All 6 pillars, no context" → **Invalid question, need business constraints**, (2) "Maximize everything" → **Impossible; optimize trade-off frontier**, (3) "Use WA Tool quarterly" → **Document pillar gaps + improvements + ownership**, (4) "Chaos engineers validate** → **FIS + Stop Condition production drills**.

[6 EXERCISES: Pillar priority by industry, trade-off justification, WA Tool workflow, SCP vs Permission Boundary vs resource policy, multi-region failure modes, cost vs reliability ROI]

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