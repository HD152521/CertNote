# Day 5 - Week 1 Integration: When IAM, VPC, and EC2 Meet in a Single Scenario

On the Pro exam, questions that ask about only a single service are practically nonexistent. Whatever scenario unfolds, IAM (who is accessing), VPC (where it flows), and EC2/EBS/ELB (what processes that traffic) appear simultaneously. So today we revisit the three areas we studied separately during the week **in the way they meet within a single scenario**. This is the real way of thinking that works on the exam floor.

Today's article has three parts.

1. **40 one-line summaries of Week 1**: facts that must surface within 0.5 seconds in the exam room.
2. **The 3-layer method**: the hands-on technique of decomposing scenarios into IAM ⇒ VPC ⇒ Compute.
3. **12 scenario questions**: Pro difficulty, 30 minutes of solving time.

Practice these three as one bundle, and when you meet a scenario in the exam room your hands will move first. The "5-step decomposition" from Day 1 fires in your head within 5 seconds, and those 5 steps flow again into the 3 layers of IAM-VPC-Compute.

## 40 One-Line Summaries of Week 1

### Exam Strategy (1-5)

1. SAP-C02 = 75 questions / 180 minutes / 750 to pass; ESL +30 minutes can be requested (210 minutes total).
2. 5-step scenario decomposition: WHO · WHAT · WHY · CONSTRAINTS · KEYWORD. The adjective in the last sentence decides the answer.
3. Four elimination patterns for the 4 options: over-engineering / under-engineering / build-it-yourself / wrong combination.
4. The 3-2-2 rule: under 3 minutes per question, change your answer at most 2 times, flag if unsolved within 2 minutes.
5. The first-instinct fallacy — statistically, changed answers are wrong more often. Without solid grounds, keep your first intuition.

### IAM·STS·Federation (6-15)

6. **6 layers of permission evaluation**: SCP → Permission Boundary → Identity Policy → Resource Policy → Session Policy → VPC Endpoint Policy. If any one of the 6 layers denies, it's blocked; all must allow to pass.
7. **An explicit deny beats every allow** — a single explicit Deny is the end.
8. Cross-account access requires Allow on both sides (Trust Policy + Resource Policy or Identity Policy).
9. SCPs and Permission Boundaries have **deny-only** semantics — they grant no permissions, they only set a ceiling.
10. The 5 STS operations: AssumeRole / AssumeRoleWithSAML / AssumeRoleWithWebIdentity / GetFederationToken / GetSessionToken.
11. **ExternalId** prevents the confused deputy attack — mandatory for SaaS third-party access, specified in the Trust Policy.
12. GitHub Actions → AWS uses OIDC + AssumeRoleWithWebIdentity (no long-lived keys needed); restrict repo/branch via the sub claim in the Trust Policy.
13. Multi-account SSO is IAM Identity Center + Permission Sets, with automatic sync via SCIM (RFC 7644).
14. ABAC is tag-based — matching `aws:PrincipalTag/Project` ↔ `aws:ResourceTag/Project` prevents policy explosion.
15. **IAM Access Analyzer** automatically detects external access using Zelkova (SMT-based formal verification) from Microsoft Research.

### VPC·Network (16-26)

16. RFC 1918 private IPs: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16. Range /16–/28; prevent company-wide IP conflicts with IPAM.
17. 5 reserved IPs per subnet: `.0` (network) / `.1` (router) / `.2` (DNS) / `.3` (reserved) / `.255` (broadcast).
18. **NAT Gateway is AZ-local** → one per AZ for availability. A single NAT means all outbound is blocked when that AZ dies.
19. SGs are **stateful** (return traffic auto-allowed), NACLs are **stateless** (explicit both ways).
20. NACL ephemeral ports: Linux 32768-60999, Windows 49152-65535; the safe range is 1024-65535.
21. S3 and DynamoDB use **Gateway Endpoints** (free, prefix list in the Route Table); everything else uses **Interface Endpoints** ($0.01/hour + data).
22. **PrivateLink**: a SaaS exposes its service behind an NLB as an Endpoint Service, no bidirectional routing.
23. SG ID references only work within the same VPC and Peered VPCs; Transit Gateway allows IP CIDR references only.
24. VPC Flow Logs record ENI 5-tuples + outcomes, no payload. Traffic Mirroring captures payload.
25. Transit Gateway is BGP-based hub-and-spoke, up to 5000 VPCs, segmentation per route table.
26. Direct Connect is dedicated (dedicated line) vs hosted (partner-shared), with 3 VIF types (Private/Public/Transit).

### EC2·EBS·ELB·ASG (27-40)

27. **Nitro System**: ASIC-based card virtualization, under 1% overhead. Network, EBS, Security, and Hypervisor on separate cards.
28. **Graviton** (g suffix) is ARM Neoverse-based, 20-40% price-performance advantage over equivalent x86. Multi-arch containers mandatory.
29. **Inferentia/Trainium** ASICs cut costs 60-70% versus GPU for LLM inference/training.
30. gp3 **provisions IOPS and size independently** (20% cheaper than gp2), but no burst.
31. io2 **Block Express** is NVMe-oF-based sub-ms latency, 256K IOPS, r5b/x2idn only.
32. EBS is **AZ-local** + 3 synchronous replicas; other AZs only via snapshot.
33. EBS Multi-Attach: io1/io2 + clustered filesystem (GFS2/OCFS2/OracleRAC) + 16 instances.
34. Only NLB has static IPs + client IP preservation + millions of packets per second (flow-hash-based ECMP).
35. ALB has direct Cognito integration (X-Amzn-Oidc-Data header), first-class gRPC support.
36. **Warm Pool** pre-boots stopped instances, cold start 5 min → 30 sec.
37. Mixed Instances Policy + `price-capacity-optimized` is the Spot standard.
38. Spot averages 70% off, reclaimed after a 2-minute warning, diversify across families.
39. Placement Groups: Cluster (low-latency HPC) / Spread (isolation, 7/AZ) / Partition (HDFS/Cassandra rack-aware).
40. Lifecycle Hook default heartbeat is 1 hour, max 48 hours; calling complete-lifecycle-action is mandatory.

## The 3-Layer Method: IAM ⇒ VPC ⇒ Compute

When solving Pro scenarios, checking **the 3 layers in order** reveals missing elements.

```
┌──────────────────────────────────────────────────┐
│ Layer 1: IAM   "Who is accessing?"               │
│   - SCP / Permission Boundary / IAM / Resource   │
│   - Federation (SAML/OIDC), STS, ABAC            │
│   - Cross-Account Role + ExternalId              │
├──────────────────────────────────────────────────┤
│ Layer 2: VPC   "Where does it flow?"             │
│   - VPC CIDR, Subnet, Route Table                │
│   - SG (stateful) + NACL (stateless)             │
│   - VPC Endpoint (Gateway/Interface), PrivateLink│
│   - Transit Gateway, Direct Connect, VPN         │
├──────────────────────────────────────────────────┤
│ Layer 3: Compute  "What processes it?"           │
│   - EC2 family / pricing / Nitro / Graviton      │
│   - EBS type (gp3/io2BE/st1), Snapshot, FSR      │
│   - The 4 ELBs (ALB/NLB/GLB/CLB)                 │
│   - ASG (Target/Step/Predictive/Warm Pool)       │
└──────────────────────────────────────────────────┘
```

> 💡 **Related theory**: This 3-layer approach is a direct implementation of "Complete Mediation" and "Defense in Depth" from **Saltzer and Schroeder's 8 security principles** (1975). Every request passes through three gates: (1) permission check at IAM, (2) network isolation at VPC, (3) workload execution at Compute. If one gate is breached, another gate blocks. The Capital One incident breached the IAM gate via SSRF, but if a VPC Endpoint Policy had also been applied, the S3 access would have been blocked.

> 🔍 **Deeper dive**: Between the three layers there is **boundary translation**. The IAM Principal ARN turns into a VPC Source IP (which appears externally as the same IP when going through NAT), and at Compute it is translated back into the IAM Role from instance metadata. Information gets blurred during these translations, so when tracing with CloudTrail in multi-account environments you must look at user-agent + source IP + role session name all together. With a single variable, you may not know who did it.

## A Hands-On Example of Scenario Decomposition

> **Scenario**: "A global pharmaceutical company runs 80 accounts in AWS Organizations. The research division uses EC2 + RDS PostgreSQL to handle clinical trial data. Under FDA 21 CFR Part 11 regulations, all data access must have an audit trail, and the data must stay only in ap-northeast-2. Additionally, external SaaS providers (Veeva, Medidata) must read some of the data, and the use of access keys is prohibited. What is the most appropriate architecture?"

5-step decomposition + 3-layer mapping:

1. **WHO**: global pharma, 80 accounts, research division + external SaaS (Veeva/Medidata).
2. **WHAT**: EC2 + RDS PostgreSQL, clinical trial data.
3. **WHY**: FDA 21 CFR Part 11, data sovereignty (ap-northeast-2).
4. **CONSTRAINTS**: all access audited, access key usage prohibited.
5. **KEYWORD**: regulation + multi-account + SaaS access + key avoidance.

→ 3-layer answer:

- **IAM layer**: SCP denies regions other than ap-northeast-2. External SaaS uses Cross-Account Role + ExternalId (avoiding access keys). Unify CloudTrail across 80 accounts with an Org Trail. Encrypt data with a KMS custom CMK + Key Policy.
- **VPC layer**: VPC Endpoints (S3, RDS, KMS) + Endpoint Policies to block external flows. External SaaS exposed via PrivateLink behind an NLB. Block outbound internet with NACLs/SGs (no internet traversal).
- **Compute layer**: EC2 enforces IMDSv2, EBS is KMS-encrypted, RDS is Multi-AZ + automatic backups + 35-day retention. Export RDS audit logs to CloudWatch Logs.

Almost all of Week 1's learning is packed into this one scenario. The standard solving flow in the exam room is for your hand to draw the 3 layers automatically and fill each layer with keywords.

## 12 Scenario Questions (Pro Difficulty)

---

**Question 1.** A company operates 100 accounts. The security team wants to "block root user logins entirely in the production OU, and also block IAM calls without MFA." The most suitable method?

A) Delete the root user password and disable access keys in each account
B) Apply a deny policy to the production OU via Organizations SCP (Condition: `aws:PrincipalType=Root`, `aws:MultiFactorAuthPresent=false`)
C) Monitor root login events with Lambda and send SNS alerts
D) Consolidate all users into IAM Identity Center and prohibit root usage by policy

**Answer: B**
Explanation: SCP is the only guardrail that also applies to the root user. Block root + enforce MFA via Conditions. A doesn't work because the root password cannot be deleted (recoverable via email). C is only after-the-fact detection, not blocking. D is just an SSO tool, unrelated to blocking root. Trade-off: SCPs don't apply to the management account, so the management account's root needs separate MFA, a hardware token, and email protection.

---

**Question 2.** A global SaaS operates in us-east-1 and is expanding to eu-west-1. EU user data must stay in the EU per GDPR. To guarantee data isolation while keeping a single codebase?

A) DynamoDB Global Table (automatic active-active replication across both regions)
B) RDS Cross-Region Replica (replicating from the us-east-1 master to eu-west-1)
C) Independent DB per region + Route 53 Geolocation + region decided at authentication time
D) Aurora Global Database (primary us-east-1, secondary eu-west-1)

**Answer: C**
Explanation: A, B, and D all replicate data across both regions → potential GDPR violation. C is complete per-region isolation; at authentication time, decide which region the user belongs to and include a region claim in the JWT. The single codebase is handled with environment variables and configuration. The 2020 EU Schrems II ruling created constraints on using US clouds, and in such scenarios the guarantee that "data never leaves" is what matters most.

---

**Question 3.** A fintech wants to enforce that no EC2 can use any region other than us-east-1, for PCI-DSS certification. To minimize operational burden?

A) Deploy an AWS Config Custom Rule to every account to detect resources in unauthorized regions
B) Organizations SCP denying all actions when `aws:RequestedRegion ≠ us-east-1` + NotAction exceptions for global services (IAM, Org, Route53)
C) Trigger a Lambda via EventBridge to auto-delete resources in unauthorized regions
D) Add region conditions to each account's IAM policies one by one and manually apply to new accounts

**Answer: B**
Explanation: SCP applied once at the Organizations level enforces across all accounts, including root. Automatically applies when new accounts are added. Global services route to us-east-1, but there are cases where `RequestedRegion` is global in the SCP, so the NotAction exception is mandatory. C is after-the-fact processing with a window of exposure. A only detects, doesn't block.

---

**Question 4.** A company accesses S3 from EC2. Traffic goes through a NAT Gateway, costing $30,000/month. A PCI-DSS audit also flagged that "S3 traffic traverses the internet." How to solve?

A) Add an S3 Interface Endpoint (PrivateLink) in every AZ
B) Add a Gateway Endpoint + automatic prefix-list registration in the Route Table
C) Connect S3 via a private path using VPC Peering
D) Connect a dedicated line to S3 via Direct Connect Public VIF

**Answer: B**
Explanation: For S3 and DynamoDB, a Gateway Endpoint is free + auto-registers a prefix list in the Route Table. Traffic takes a private path without the IGW/NAT. Solves cost + security simultaneously. Interface Endpoints (A) also work but incur hourly costs + data processing costs; Gateway is the standard for S3. Trade-off: Gateway Endpoints cannot access cross-region S3, same region only.

---

**Question 5.** A media company runs global game matchmaking (WebSocket). It exposes static IPs externally, needs failover within seconds on regional failure, and handles 1 million packets per second. The suitable combination?

A) ALB + Route 53 Failover routing (Health Check-based DNS failover)
B) NLB + Route 53 Health Check (latency routing to select the nearest region)
C) Global Accelerator + NLB (Multi-Region)
D) CloudFront + Lambda@Edge (WebSocket termination at the edge)

**Answer: C**
Explanation: GA provides 2 static IPs via BGP Anycast, failing over within seconds on regional failure by bypassing DNS caches. NLB satisfies L4, millions of packets per second, static IP, and WebSocket all at once. A and B fail over on a minute scale due to DNS TTL caching. D is L7 HTTP only.

---

**Question 6.** A company deploys to AWS Lambda from GitHub Actions. The security team requires "no long-lived AWS Access Keys stored in GitHub Secrets." How to solve?

A) Create a dedicated IAM User and automate 90-day key rotation with Lambda
B) Register an AWS OIDC Provider + AssumeRoleWithWebIdentity from GitHub Actions, restricting repo/branch via the sub claim in the Trust Policy
C) GitHub Actions uploads a ZIP to S3 and an S3 event triggers the Lambda deployment
D) Use CodePipeline + CodeBuild to pull the GitHub source and deploy to Lambda

**Answer: B**
Explanation: GitHub has supported OIDC since 2021. Register the AWS OIDC Provider once, and GitHub Actions obtains temporary credentials with an OIDC id_token each time. No long-lived keys needed. It is essential to restrict `sub` (e.g., `repo:org/repo:ref:refs/heads/main`) via the Trust Policy's Condition so other repos/branches can't assume the same Role. Otherwise a confused-deputy variant attack is possible.

---

**Question 7.** A company runs 100 EC2 instances for 4 hours for a nightly ETL batch (stateless, restartable). Minimize cost + meet the SLA (complete by 09:00 the next day).

A) 100 On-Demand instances, prioritizing SLA assurance
B) 100 3-year Standard RIs to minimize the hourly rate
C) Spot Fleet with diverse instance families (capacity-optimized) + price-capacity-optimized
D) 50 3-year RI baseline + 50 single-family Spot mix

**Answer: C**
Explanation: Only 4 hours of use → RI is a loss. Stateless + restartable → Spot fits. Mixing diverse families (c5, c5n, c5a, m5) spreads the risk of a single family's capacity shortage. `price-capacity-optimized` (added 2022, recommended) optimizes price and capacity simultaneously.

---

**Question 8.** A company applies authentication behind an ALB. The backend (Node.js) wants almost no auth code and just wants to receive user info. The most suitable method?

A) Implement Passport.js + JWT verification in the backend
B) Enable the ALB's Cognito integration + receive the X-Amzn-Oidc-Data header
C) API Gateway + Lambda Authorizer to validate tokens and forward to the backend
D) Validate JWTs at CloudFront + Lambda@Edge and forward to the origin

**Answer: B**
Explanation: The ALB handles OIDC/Cognito authentication directly and passes the JWT to the backend in the X-Amzn-Oidc-Data header. Almost no backend code changes needed. Optimal if HTTP-based. gRPC and WebSocket need separate handling.

---

**Question 9.** A company runs RDS MySQL in us-east-1 and wants to build DR in ap-northeast-2. RPO within 1 minute, RTO within 5 minutes. The most suitable solution?

A) RDS Multi-AZ (failover within a single region via synchronous standby)
B) RDS Cross-Region Read Replica + manual promote
C) Aurora Global Database (RPO < 1 second, RTO ~1 minute)
D) Continuous replication to an instance in another region via DMS

**Answer: C**
Explanation: Aurora Global Database delivers RPO < 1 second, RTO ~1 minute (managed failover). It uses storage-level async replication across regions, but latency is very low. RDS Cross-Region Read Replica (B) has RPO of seconds to tens of seconds and RTO of minutes to tens of minutes (manual promote required). A is the same region, so not DR. D is a migration tool. Trade-off: Aurora Global costs 30%+ more than RDS — an excessive choice for single-region workloads.

---

**Question 10.** A SaaS wants to make its service usable via private IPs inside customer VPCs. The standard pattern?

A) Cross-Region VPC Peering between the customer VPC and the SaaS VPC
B) Share a Transit Gateway with customers via RAM to connect routing
C) PrivateLink + NLB + VPC Endpoint Service
D) Expose the SaaS endpoint via Direct Connect Public VIF

**Answer: C**
Explanation: With PrivateLink, the SaaS registers its service behind an NLB as an Endpoint Service, and customers access it via Interface Endpoints. No bidirectional data exposure. Adopted by Snowflake, MongoDB Atlas, Datadog, and others. A and B are bidirectional routing, unsuitable for the SaaS security model — the customer VPC must not be able to see the SaaS VPC.

---

**Question 11.** A company has an AD with 200 employees. SSO access to 80 accounts in AWS Organizations. When an employee leaves, permissions must be revoked automatically across all accounts. The most suitable solution?

A) Create IAM Users in each account and manually deactivate them in bulk upon departure
B) IAM Identity Center + AD Connector + SCIM automatic synchronization
C) Register a SAML IdP in each account and connect via AD federation
D) Consolidate employees into a Cognito User Pool and map account permissions by group

**Answer: B**
Explanation: IAM Identity Center integrates with Organizations. Use the existing AD as the identity source via AD Connector. SCIM (RFC 7644) automatically syncs AD changes to AWS. The moment an employee leaves, permissions are revoked across all accounts. Deploy policies in bulk with Permission Sets.

---

**Question 12.** There are 3 Private Subnets across Multi-AZ, calling external APIs. To secure availability while minimizing cost, how should NAT Gateways be placed?

A) A single NAT Gateway in one AZ shared by the 3 subnets (cheapest)
B) One NAT Gateway per AZ (3 total), each Private Subnet using its own AZ's NAT
C) Run NAT Instances directly on EC2 per AZ with self-healing via ASG
D) Route the Private Subnets directly to the IGW for outbound

**Answer: B**
Explanation: NAT Gateways are AZ-local. A single NAT cuts all outbound when that AZ fails. Place one NAT per AZ + each Private Subnet uses its own AZ's NAT. The added cost is $0.045/hour × 3 = $97/month. Trade-off: a single NAT is acceptable for dev environments. NAT Gateway data processing ($0.045/GB) is the largest cost driver, so bypass it for S3 and DynamoDB with Gateway Endpoints.

## Wrapping Up

Week 1 reviewed the grammar of the exam and the four core SAA areas (IAM, VPC, EC2, ELB) at Pro depth. When the 40 one-line summaries and the 3-layer method work in the exam room, your hands automatically start decomposing even a scenario you've never seen.

From Week 2 we enter **multi-account architecture** (Organizations, SCP, Control Tower, Identity Center) — covered in earnest only at the SAP level. It accounts for 26% of Domain 1, so it's the biggest ROI. Solve today's 12 scenario questions once more, and for the ones you got wrong, apply the decomposition method to see where you went wrong. The moment your hand draws the 5 boxes first in the exam room is the signal of a pass.
