# Day 5 - Week 1 Wrap-Up: Fundamentals and IAM Hardened Through Scenarios

Over the week, we swept from global infrastructure to multi-account governance. Even if you feel you know it all in your head, the SAA-C03 exam always transforms it into one-line scenarios. From the single sentence "data cannot leave headquarters," Outposts must come to mind; from "minimizing global latency for a TCP game server," Global Accelerator must pop out instantly. The exam isn't trying to filter out people who memorized keywords — it's trying to select people who can quickly judge "what is the essence of this scenario."

This article revisits Week 1 while etching the scenario keyword → solution mapping into your head. Not rote memorization — we'll trace "why that answer" one more time. The scenario mapping is also an area where reading it through once more the day before the exam clearly raises your passing margin. And in practice, this mapping becomes "the ability to review someone else's design before an incident happens" — every incident we saw in Week 1 (Capital One, us-east-1, the Tokyo AZ, SolarWinds, Travis CI) ultimately happened when someone confused the same mapping.

## Redrawing the Week 1 Picture

```
[ AWS Global Infrastructure ]
       │
       ├── Region (34) ──┬── AZ (3+) ──┬── DC
       │                 │             └── DC
       │                 └── AZ ── DC
       ├── Edge Location (600+) ── CloudFront / R53 / GA / WAF
       ├── Local Zone (30+) ── mini region
       ├── Wavelength ── 5G edge
       └── Outposts ── customer DC

[ Identity ]
   User / Group / Role / Policy
       │
   AssumeRole (STS) → temporary credentials
       │
   ┌─── External ID (Confused Deputy defense)
   ├─── Permissions Boundary (permission ceiling)
   ├─── ABAC (tag-based)
   └─── OIDC/SAML (federation)

[ Multi-Account ]
   Organizations → OU tree
       │
   ┌─── SCP (account permission ceiling)
   ├─── Control Tower (automated Landing Zone)
   ├─── RAM (resource sharing)
   └─── StackSets (bulk deployment)
```

These three areas are Week 1's conclusion, and it's accurate to see every service from Week 2 through Week 12 as layered on top of these three planes. Networking runs on top of AZs, security on top of IAM, and multi-account patterns on top of Organizations. And the intersection of these three planes — "who can do what to a resource in which AZ of which region of which account" — ultimately becomes the coordinate system of every SAA scenario.

> 💡 **Related theory**: This 3-layer model is actually a mapping of the classic 3 axes of distributed systems security — *Where* (location), *Who* (identity), *What* (resource) — onto cloud operations. In addition to the security triad NIST defined in 1985 (Confidentiality / Integrity / Availability), the three areas codified by NIST SP 800-53 in 2003 — Access Control (AC), Audit & Accountability (AU), and System and Communications Protection (SC) — match almost one-to-one. AC is implemented by IAM, AU by CloudTrail/Config, and SC by VPC/network controls.

> 🔍 **Going deeper**: These 3 layers are reflected as-is in AWS's actual permission evaluation engines. AWS Zelkova (IAM formal verification) and Tiros (network formal verification) convert IAM/SCP policies and VPC routing, respectively, into SMT constraints to solve "is this request reachable." The 2018 USENIX Security paper "Semantic-based Automated Reasoning for AWS Access Policies" is Zelkova's foundation, and "Reachability Analysis for AWS-based Networks," published the same year, is Tiros's. Access Analyzer, Reachability Analyzer, and IAM Access Advisor all run on top of these.

## Scenario Keyword Mapping

| Scenario Keyword | Answer Candidate | Reason |
|---------------|----------|------|
| "Keep data inside headquarters" + "use AWS APIs" | Outposts | AWS hardware inside customer DC |
| "5G", "autonomous driving", "AR/VR" | Wavelength | Telecom edge |
| "Post-production VFX", "users in cities like LA/Miami" | Local Zones | City-level mini regions |
| "TCP/UDP", "gaming", "VoIP" | Global Accelerator | L4 acceleration |
| "HTTP static content caching" | CloudFront | L7 cache |
| "DNS failover" | Route 53 | DNS routing |
| "Multi-account", "Okta SSO" | IAM Identity Center | SAML/SCIM federation |
| "Deploying to AWS from GitHub Actions" | OIDC federation | Short-lived tokens |
| "External SaaS monitoring" | Cross-Account Role + External ID | Confused Deputy defense |
| "Developers create Roles but broad permissions forbidden" | Permissions Boundary | Permission ceiling |
| "Block a specific region across all accounts" | SCP | Account permission ceiling |
| "Auto-apply baseline to new accounts" | Control Tower + StackSets | Automated Landing Zone |
| "Share a VPC across multiple accounts" | AWS RAM | Resource sharing |
| "Safe way for EC2 to access S3" | Instance Profile + IAM Role | Prevents key exposure |
| "Enforce MFA" | Policy Condition `aws:MultiFactorAuthPresent` | IAM enforcement |
| "Service stays up even if one AZ dies" | Multi-AZ ASG + ELB | HA pattern |
| "1-second RPO even if a region dies" | Aurora Global Database | DR pattern |
| "Data sovereignty + Korean FSS regulation" | Outposts / domestic region | Data location constraint |
| "Grant AWS permissions while keeping the existing IdP" | IAM Identity Center + SAML | External IdP federation |
| "Lambda accessing S3 in another account" | Cross-Account Role + Resource Policy | Both sides must Allow |
| "AWS permissions for Active Directory users" | AD Trust + IAM Identity Center | Enterprise standard |
| "Time-limited permissions for temporary staff" | Session Tag + Permissions Boundary | Auto-expiry + ceiling |
| "Block unintended public exposure of S3 buckets" | Block Public Access (account + bucket, 4 settings) | Data leak prevention |

This table reads through in 30 minutes the day before the exam, and after reviewing the same mapping 5+ times, candidate answers surface from the first line of a scenario in the exam room. The keyword → solution mapping best illustrates the SAA's nature as a "pattern recognition exam."

> 💡 **Related theory**: This pattern-mapping approach is exactly the *Recognition-Primed Decision Making* (RPD, Gary Klein 1989) model from cognitive psychology. It's the mode of thinking where ER doctors, firefighters, and chess masters don't "compute every option like a novice," but go straight to "this situation is pattern X, so solution Y." AWS SAA, too, is ultimately an exam of classifying roughly 200 scenario patterns. Viewed through System 1 (intuition) and System 2 (analysis) from Daniel Kahneman's *Thinking, Fast and Slow* (2011), the most efficient flow for the SAA exam is patternizing System 1 to narrow candidates quickly, then verifying with System 2.

> ⚠️ **Pitfall**: The same keyword often leads to different answers. Is "encryption" KMS or CloudHSM? Single-company use means KMS; FIPS 140-2 Level 3 regulation (FedRAMP High, some finance) means CloudHSM. Is "DR" Multi-AZ or Cross-Region? AZ-level isolation is Multi-AZ; region-level isolation is Cross-Region. Don't look at the keyword alone — also ask "what is this scenario's threat model."

## CAP/PACELC and the AWS Service Mapping

SAA doesn't ask this directly, but it's decisive for interpreting scenarios. Without knowing distributed-systems trade-offs, you can't answer questions like "why can't this option provide strong consistency." And this mapping is used directly in practice when debugging "why did our service's global consistency break."

| Service | Consistency Model | Position |
|--------|------------|------|
| DynamoDB (default) | Eventually Consistent | AP |
| DynamoDB (strong) | Strong Consistent (single region) | CP |
| DynamoDB Global Table | Multi-Master, Last-Writer-Wins | AP |
| Aurora (single region) | Strong | CP |
| Aurora Global DB | Async replication | AP (cross-region) |
| RDS Multi-AZ | Sync replication | CP |
| S3 | Strong read-after-write (since 2020.12) | CP |
| EFS | Strong (close-to-open) | CP |
| ElastiCache for Redis (Cluster Mode) | Async replication | AP |
| FSx for Lustre | Strong (POSIX) | CP |
| Neptune | Strong (single writer) | CP |

> 💡 **Related theory**: The CAP theorem (Brewer 2000, Gilbert & Lynch 2002) says that under a network partition, you must choose between Consistency and Availability. PACELC (Abadi 2012) adds that "even without a partition, there's a trade-off of Latency vs Consistency." Almost every AWS global service leans PA/EL (availability under partition, latency otherwise). S3 gaining strong read-after-write consistency in December 2020 was a big event in distributed systems history. Before then, new objects were visible immediately but updates/deletes were eventual, making it a staple SAA trap. Now every S3 operation is strongly consistent — though object metadata caching layers (CloudFront, ALB origin) remain eventual.

> 🔍 **Going deeper**: DynamoDB's strong consistency is offered only as an option within a single region (`ConsistentRead=true`), and Global Tables are always eventual. Global Table conflict resolution is **Last-Writer-Wins** (LWW) based, so concurrent writes carry data-loss potential. So if you need multi-master global writes, use DynamoDB Global Tables but first ask "is timestamp conflict acceptable for the business." If stricter consistency is needed, you need CRDTs (Conflict-free Replicated Data Types) or Paxos/Raft-based consensus algorithms, which AWS partially provides through Aurora's quorum-based replication (6-way write across 3 AZs, 4/6 read, 3/6 write quorum). The Aurora paper *Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases* (SIGMOD 2017) is the essence of this architecture.

> 📚 **Case study**: In 2015, GitHub had data consistency broken for 24 hours in a partition incident of its own MySQL cluster. A network partition occurred between two data centers, and both sides decided they were the primary and accepted writes — a split-brain event. In the post-mortem report, GitHub stated explicitly: "under a partition, we choose CP and give up availability." Such cases show CAP trade-offs are not abstract theory but decisions operators face daily. AWS made the same decision with RDS Multi-AZ, which is why availability drops for about 60 seconds during failover.

> ⚠️ **Pitfall**: Assuming "Aurora is strongly consistent, so its global DB is too" is wrong. Aurora Global Database is **storage-level async replication** (typically 1-second RPO) and secondary regions are read-only. If you want global writes you must use DynamoDB Global Tables, but that means accepting LWW's conflict risk. Also, viewing "ElastiCache Redis Cluster Mode as async replication but availability guaranteed via multi-AZ failover" is partially wrong — writes not yet acked can be lost during failover.

## The Shared Responsibility Model, Reorganized

```
       Abstraction ↑                              AWS responsibility ↑
┌─────────────────────────────────────┐
│ S3, DynamoDB, Lambda (fully managed)│ only data classification & IAM are the customer's
│ RDS, Fargate (PaaS)                 │ + network settings are the customer's
│ ECS on EC2, EKS Self-Managed        │ + OS patching is the customer's
│ EC2 + EBS (IaaS)                    │ OS & apps entirely the customer's
└─────────────────────────────────────┘
       Abstraction ↓                              Customer responsibility ↑
```

As service abstraction rises, the responsibility boundary moves up. **Yet data classification, IAM, and encryption key management are always the customer's** — that's the key point. The Capital One incident shows this principle most clearly — AWS fulfilled its infrastructure responsibility, and the incident arose in the customer's domain: IMDSv1 and excessive IAM permissions.

> 📚 **Case study**: In June 2022, a Toyota subsidiary had an access key exposed in a public GitHub repository for 5 years. About 300,000 customers' data was put at risk, and the cause was a developer pushing credentials along with the code. AWS's responsibility: 0% — everything happened in the customer's responsibility area. The standard post-incident recommendations: ① IAM Roles + IRSA/Instance Profiles instead of IAM Users, ② if Access Keys must be issued, temporary credentials via IAM Identity Center, ③ block commits with Git pre-commit hooks (git-secrets, truffleHog). The same pattern of incident repeated at Uber (2016), Imperva (2019), and Codecov (2021).

> 🔍 **Going deeper**: The shared responsibility model differs subtly per service. For RDS, DB engine patches (minor versions) are AWS; major version upgrades are the customer's choice. For Lambda, runtime patches are AWS; migration after a runtime's EOL is the customer's (Node 14 → 18, etc.). For ECS Fargate, the container OS and runtime are AWS; patching OS packages inside the image is the customer's. These subtle differences appear frequently as exam traps. AWS Trusted Advisor and AWS Security Hub's Foundational Security Best Practices (FSBP) automatically check these responsibility boundaries.

## The Policy Evaluation Decision Tree

```
Request → SCP(Org) → Resource Policy → Identity Policy → Permissions Boundary → Session Policy
   Explicit Deny at any stage → immediate DENY
   All stages passed → ALLOW
   No Allow anywhere → DENY (default)
```

Same account = union, cross-account = intersection, KMS = explicit delegation in the Key Policy required. These three lines are the entirety of IAM evaluation logic. If an interviewer asks "explain AWS IAM evaluation logic in under a minute," these three lines are the answer.

> ⚠️ **Pitfall**: "Just Allow in the Resource Policy and cross-account works" is the most common wrong answer. Within the same account that's true, but cross-account, the caller account's Identity Policy must also Allow. A staple exam trap. And KMS is a class of its own — unless the Key Policy explicitly delegates to IAM (the "Enable IAM User Permissions" statement), even an Allow in an IAM policy can't use the KMS key. That's because KMS follows the model that "the key owner is the final authority."

> 🔍 **Going deeper**: Policy evaluation is actually decided by the intersection of 6 policy types — SCP, Resource Policy, Identity Policy, Permissions Boundary, Session Policy, and VPC Endpoint Policy. The "Policy Evaluation Logic" flowchart in AWS's official documentation is the most accurate reference. Which policy types are "Allow required vs optional" differs per scenario. One-line summary: **an explicit Deny is always final; an Allow must pass every boundary**.

> 💡 **Related theory**: This model is a hybrid of security theory's *Mandatory Access Control* (MAC) and *Discretionary Access Control* (DAC). SCPs and Permissions Boundaries are MAC (limits enforced by a higher authority); Identity/Resource Policies are DAC (freely configured by the owner). It resembles the multilevel security concept of the US military security standard, the *Bell-LaPadula Model* (1973). The reason AWS can solve policy evaluation with an SMT solver is precisely that this model has a formally verifiable structure.

## The Standard Multi-Account Topology

| Account | Role |
|------|------|
| Management | Org management, billing. No workloads |
| Log Archive | Central storage of CloudTrail/Config. WORM |
| Audit/Security | Delegated administrator for GuardDuty, Security Hub |
| Networking | Central VPC + Transit Gateway, shared via RAM |
| Shared Services | Common tools (CI/CD, Artifactory, etc.) |
| Prod | Production workloads |
| Staging | Pre-production validation |
| Dev | Development workloads |
| Sandbox | Personal experimentation. Cost/region enforced via SCP |

This topology is explicitly specified as the recommended form in the AWS Security Reference Architecture (SRA) document. It's accurate to assume every large enterprise customer uses a variation of it. Look at public presentations from Netflix, Capital One, Airbnb, Slack, and others, and nearly the same pattern repeats.

> 📚 **Case study**: In 2019, the Netflix Tech Blog published its multi-account strategy, revealing that while operating more than 1,000 AWS accounts, it standardized an "Account per Workload" pattern splitting accounts finely by workload, team, and environment. The reasons: ① blast radius limitation, ② cost/tag automation, ③ IAM permission simplification. Spotify, Lyft, and Stripe adopted the same pattern, and this is the real-world model behind the topology SRA recommends. As of 2023, large companies typically operate 100~5,000 accounts, with the AWS Organizations limit (10,000 accounts/Org) as the de facto ceiling.

> 🔍 **Going deeper**: The practical core of multi-account operations is two automations. ① Account provisioning automation — with Control Tower's Account Factory or Account Factory for Terraform (AFT), new account creation → baseline application → permission grants → notifications get tied into a GitOps flow. ② Automatic baseline deployment — CloudFormation StackSets' `SERVICE_MANAGED + auto-deployment=Enabled` option automatically pushes the security baseline (GuardDuty, Config Rules, IAM Password Policy, S3 BPA, etc.) into new accounts. Without these two automations, operating 100 accounts is humanly impossible.

## Frequently Confused Key Comparisons

| Item | A | B | Difference |
|------|---|---|------|
| Local Zones | City mini regions like LA/Miami | Wavelength: telecom 5G edge | LZ is regular internet, WL is mobile 5G |
| CloudFront | L7 HTTP cache | Global Accelerator: L4 acceleration | HTTP means CF, TCP/UDP means GA |
| IAM User | Permanent credentials | IAM Identity Center: temporary SSO | Multi-account/external IdP means IC |
| ZoneName | Shuffled per account | ZoneId: identical regardless of account | Multi-account sync uses ZoneId |
| Permissions Boundary | Identity permission ceiling | SCP: account permission ceiling | Different unit of application |
| Cross-Region Read Replica | Async, manual promote | Aurora Global DB: async + fast failover (~1 min) | RPO/RTO difference |
| CloudFront Functions | Edge PoP, 1ms constraint | Lambda@Edge: Regional Edge, heavier | Location/runtime difference |
| KMS | Multi-tenant HSM | CloudHSM: dedicated HSM, FIPS 140-2 L3 | Regulatory strength |
| STS AssumeRole | Regular cross-account | AssumeRoleWithWebIdentity: OIDC | External IdP federation |
| Resource Policy Allow | Same-account sufficient | Cross-account: both must Allow | Evaluation logic |

> ⚠️ **Pitfall**: ZoneName vs ZoneId rarely appears on the exam, but in practice it's decisive in security/cost scenarios asking about "using the same AZ as another account." CloudFront vs Global Accelerator is an exam staple; whenever the keywords "TCP/UDP," "gaming," "VoIP," "MQTT," or "WebRTC signaling" appear, it's unconditionally GA. CloudFront Functions vs Lambda@Edge follows the same comparison axis: "sub-millisecond responses" means Functions, "full Node.js/Python runtime" means Lambda@Edge.

> 🔍 **Going deeper**: When AWS provides the same capability via multiple services, the trade-off axis always differs. KMS vs CloudHSM is **abstraction vs isolation**, ALB vs NLB is **L7 features vs L4 throughput**, SQS vs SNS vs EventBridge is **point-to-point vs fanout vs schema-routing**. The SAA exam always requires identifying "which axis is the trade-off being asked on." Master this way of thinking, and even an unfamiliar new service can be mapped onto the same axes to narrow candidate answers.

## Wrapping Up

Week 1 was about lodging "the coordinate system of the AWS universe" in your head. The Region/AZ/Edge isolation model, IAM's policy evaluation, multi-account governance. These three form the backdrop for every topic of the remaining 11 weeks. Next week we layer **networking** (VPC, subnets, routing) on top. Don't try to grasp everything at once; build the habit of reopening this table and mapping every time you solve a scenario question, and by exam eve the keyword → solution mapping will be lodged as an automatic reflex. And that automatic reflex is the core competency not just for passing the SAA, but of a senior engineer who "can sketch 3 solution candidates within a 30-minute meeting" in real-world design.

---

## 📝 Practice Questions

**Question 1.** A global game company wants to provide consistent TCP-based game server response times to users worldwide. What is the most suitable solution?

A) CloudFront + Lambda@Edge — caches HTTP content at 600+ edge PoPs and even runs Node.js logic, but being L7 HTTP/HTTPS-only it can't accelerate the game's raw TCP sessions
B) Global Accelerator
C) Route 53 Latency Routing — returns DNS answers pointing clients to the lowest-latency regional endpoint, but is bound by TTL caching and the actual packets ride the public internet as-is with no backbone acceleration
D) ElastiCache Global Datastore — merely a cache layer replicating Redis data across regions in under 1 second, unrelated to routing game server TCP traffic

**Answer: B**
Explanation: For TCP/UDP, it's unconditionally L4 acceleration — Global Accelerator. CloudFront is HTTP L7 only; Route 53 only varies DNS answers with no traffic acceleration; ElastiCache is a cache service and irrelevant. Global Accelerator provides 2 static BGP Anycast IPs, so routing changes independently of DNS TTLs, and by traversing the backbone, packet loss and jitter also decrease. Empirically, a 30-60% reduction in global users' p99 latency is common.

---

**Question 2.** A financial company must keep some data inside headquarters under Korean Financial Supervisory Service regulations while operating with AWS APIs. What is the most suitable solution?

A) Direct Connect only — connects headquarters and an AWS region with a low-latency dedicated line, but the data itself ends up stored in the AWS region, failing the "keep inside headquarters" regulatory requirement
B) Local Zones — AWS-operated mini facilities in major cities providing low latency, but as AWS data centers rather than the customer's building, they're unsuitable for data sovereignty requirements
C) Outposts
D) Snowball Edge — a one-off device for moving petabyte-scale data offline or short-term edge computing, unsuitable as an always-on AWS API operations platform

**Answer: C**
Explanation: AWS hardware inside the customer's data center + the same APIs. The correct answer for regulatory scenarios like the Electronic Financial Supervision Regulation and GDPR Schrems II. Local Zones are AWS-operated facilities, Direct Connect is a dedicated line, Snowball Edge is for one-off data migration. Outposts is used for the nearly unique scenario where "my building + AWS APIs" are needed simultaneously — otherwise Direct Connect often suffices. On cost, Outposts tends to run 1.5~2x EC2 on a 3-year commitment, so it's rarely used for non-regulatory reasons.

---

**Question 3.** A company wants to block use of all regions except us-east-1 across 50 AWS accounts. What is the most efficient method?

A) Add IAM policies per account — you'd have to attach the same policy to every user and role in 50 accounts one by one, management explodes, and every new identity risks omission, making it unfit for governance
B) Organizations SCP with an `aws:RequestedRegion` condition Deny
C) CloudTrail alerts — only detects and alerts on region usage after the fact via logs; it can't block the API calls themselves, so it isn't preventive
D) Create VPCs only in us-east-1 — even without a VPC, region-scoped global services and services like S3/DynamoDB can still be called in other regions, so the block is incomplete

**Answer: B**
Explanation: Multi-account permission ceiling = SCP. An `aws:RequestedRegion` Deny is the standard pattern. But the Management account is exempt from SCPs — hence no production workloads there. Also handle the subtle trap that global services (IAM, CloudFront, Route 53) show `aws:RequestedRegion` as `us-east-1`, requiring exceptions. And after applying the SCP, existing resources remain and only new API calls are blocked, so cleaning up existing resources in other regions is a separate task.

---

**Question 4.** What is the most secure way for EC2 to access S3?

A) Store the Access Key in ~/.aws/credentials — long-lived credentials sit in plaintext on disk, are stolen outright if the instance is compromised, and add a manual key rotation burden, making it dangerous
B) Attach an IAM Role via an Instance Profile + IMDSv2
C) Use a root Access Key — the top-level credential with unlimited account-wide permissions; exposure spreads damage account-wide, and AWS recommends absolutely never using it
D) Allow S3 Public Read — lets anyone read objects without authentication, leading directly to data leaks, a setting in the exact opposite direction of EC2 access control

**Answer: B**
Explanation: Instance Profile + IMDSv2. The SDK automatically refreshes temporary credentials and SSRF is defended too. A risks key leakage, C is absolutely forbidden, D is data exposure. Recall that the direct cause of the Capital One incident was IMDSv1, and it becomes clear "why IMDSv2 must be stated explicitly." The more complete defense is the combination of enforcing `HttpTokens=required` + `HttpPutResponseHopLimit=1` in the EC2 Launch Template and blocking IMDSv1 calls via SCP.

---

**Question 5.** To eliminate key rotation burden when GitHub Actions deploys to AWS?

A) Store an IAM User Access Key as a Secret — keeping a long-lived key in GitHub Secrets works, but the periodic manual rotation burden remains, and if leaked via logs it's stolen outright, carrying the same risk as the Travis CI breach
B) Short-lived Role credentials via OIDC federation
C) Spin up EC2 with SSH keys — every deployment requires managing separate EC2 and SSH keys, complicating operations, and the key itself becomes another long-lived secret that doesn't eliminate rotation burden
D) Root credentials — exposing unlimited account-wide permissions to CI, a head-on violation of least privilege and the worst possible choice

**Answer: B**
Explanation: GitHub OIDC → STS AssumeRoleWithWebIdentity → short-lived tokens. Restrict by `sub` claim in the Trust Policy to repo and branch. The Travis CI breach was the decisive impetus for OIDC standardization. The same pattern is being extended to GitLab, Bitbucket, Buildkite, and others, so it's fair to call it the standard across CI now. For hardening, the orthodox move is locking the trust policy's `token.actions.githubusercontent.com:sub` claim down to the branch, like `repo:org/repo:ref:refs/heads/main`.

---

**Question 6.** A SaaS collects CloudWatch logs from our AWS. What is needed for Confused Deputy defense?

A) Cross-Account Role + External ID condition
B) Grant an Access Key to an IAM User — handing a long-lived Access Key to the SaaS carries heavy leak/rotation burden and does nothing to solve the Confused Deputy problem itself
C) S3 Public Read — opens the log bucket to anyone, a data-leak configuration that is the exact opposite of safe delegated collection
D) VPN connection — provides only a network-layer tunnel, unrelated to the identity delegation and permission boundary problem when the SaaS borrows our account's role

**Answer: A**
Explanation: The External ID is a pre-shared secret that blocks other SaaS customers from borrowing our Role even if they know its ARN. A mandatory requirement of Marketplace ISV certification. Adding `aws:SourceAccount` or `aws:SourceArn` conditions on top of the External ID is safer still. According to AWS's 2022 review of "Confused Deputy" patterns, many ISVs had applied only the External ID and omitted SourceArn, leaving them partially vulnerable.

---

**Question 7.** A company provisions 10 new AWS accounts every week and wants the same security baseline applied. What is the most suitable method?

A) Operators configure manually each time — a human must hand-apply the baseline to 10 accounts weekly, omissions and drift are inevitable, and operations collapse as scale grows
B) Control Tower Account Factory + StackSets auto-deployment
C) Run CloudFormation manually in each account — templates are consistent, but a person must run stacks and set up cross-account roles per new account, missing automatic propagation
D) Run Terraform Apply each time — IaC standardizes things, but without a separate pipeline tying in account creation/registration, a manual trigger is needed every time, falling short of full automation

**Answer: B**
Explanation: Control Tower auto-generates the standard Landing Zone, and StackSets `SERVICE_MANAGED + auto-deployment Enabled` auto-deploys the baseline to new accounts. Consistency without operator intervention. Larger organizations tie in a GitOps flow with Account Factory for Terraform (AFT). AFT receives new account requests as PRs, and on merge, Terraform Cloud handles account creation, baseline application, and SSO permission grants automatically.

---

**Question 8.** A company wants to let junior developers freely create IAM Roles but prevent creating AdministratorAccess-grade Roles. What is the most appropriate method?

A) After-the-fact detection with CloudTrail — logging Role creation allows retroactive tracing, but it can't prevent overly permissive Roles from being created in the first place, so it isn't preventive control
B) Specify a Permissions Boundary as a mandatory attachment condition in the policy
C) Revoke all of the junior's permissions — this strips the Role creation ability itself, directly violating the requirement of "create freely but with only a ceiling"
D) Use only Organizations SCPs — an account/OU-level ceiling whose granularity is too coarse to enforce different limits per individual Role within the same account, so it's unsuitable

**Answer: B**
Explanation: Enforce the `iam:PermissionsBoundary` condition on `iam:CreateRole` calls. The created Role's effective permissions are limited to the intersection with the Boundary. SCPs are a larger unit (account/OU), unsuitable for setting different limits per individual Role within the same account. This is the standard pattern for "delegating authority while preventing the delegatee from expanding it," and the core of AWS's official *Delegated Administrator* model.

---

**Question 9.** EC2 goes down in one AZ due to a cooling failure. If the ASG is already configured multi-AZ?

A) All services down — a multi-AZ ASG replenishes instances in surviving AZs, so the premise that one AZ failure takes everything down contradicts HA design itself
B) The ASG automatically replenishes instances in other AZs; service continues
C) RDS Multi-AZ goes down too — RDS Multi-AZ has its standby in another AZ and fails over automatically within 30~60 seconds, so the claim that it goes down permanently alongside is wrong
D) Manual failover required — ASG health checks and the ELB automatically replace unhealthy instances and redistribute, so no manual operator intervention is needed

**Answer: B**
Explanation: The exact scenario of the 2019 Tokyo region incident. The ASG drops instances failing health checks and adds new instances in surviving AZs. RDS Multi-AZ fails over automatically to the standby within 30-60 seconds. But if EBS/EFS is pinned to one AZ, that part dies with it, so it's safer to use the EFS Multi-AZ Standard class or move storage toward S3/DynamoDB. ALB also has cross-zone load balancing enabled by default, so traffic automatically redistributes to other AZs.

---

**Question 10.** Which of the following is NOT AWS's responsibility?

A) Hypervisor security — the virtualization layer including Nitro is the "security of the cloud" domain AWS designs, patches, and isolates, so it's entirely AWS's responsibility
B) Guest OS patching (EC2)
C) Physical facility security — physical infrastructure like data center access control, power, and cooling is a hallmark AWS responsibility area handled exclusively by AWS
D) Inter-AZ network encryption — backbone traffic linking AZs within a region has been automatically encrypted between Nitro instances since 2018, an AWS responsibility requiring no customer action

**Answer: B**
Explanation: EC2's guest OS is the customer's responsibility. Because of the IaaS abstraction level, everything above the OS is the customer's. Switch to Fargate and OS patching moves to AWS's responsibility. Move the same workload to Lambda and AWS takes responsibility up through the runtime — as abstraction rises, the responsibility boundary moves up. Note that D's inter-AZ traffic encryption has been applied automatically between Nitro instances since 2018, requiring no additional customer action.

---

**Question 11.** A system requires sub-1ms RPO per transaction and operates in only one region. RDS should be?

A) Single-AZ Standard — with only one instance in a single AZ, there's no replication at all; an AZ failure means data loss until backup restore, failing the 1ms RPO
B) Multi-AZ Synchronous Replication
C) Cross-Region Read Replica — inter-region asynchronous replication has lag in the seconds range, far exceeding a 1ms RPO, and it's overkill given the same-region-only requirement
D) Aurora Global Database — inter-region storage-level async replication (~1 second RPO) risks losing the secondary region's tail, and it's excessive for a single-region-only scenario

**Answer: B**
Explanation: Same-region synchronous replication gives RPO ≈ 0. Commit acks within the 1-2ms inter-AZ latency. C is async with an RPO in seconds; D is inter-region async. It's also worth knowing that the RDS Multi-AZ standby receives no read traffic (unlike Aurora) — if read distribution is needed, launch a separate Read Replica. Aurora does 6-way replication within the same region automatically at the storage layer, so there's no separate Multi-AZ toggle.

---

**Question 12.** A company within Organizations wants to share the central Networking account's VPC subnets with 30 other workload accounts. What is the most suitable solution?

A) VPC Peering 30 times — a point-to-point connection between the central VPC and each of 30 accounts; it's not sharing subnets but connecting separate-CIDR VPCs, differing from the requirement and carrying non-transitive constraints
B) Share subnets via AWS RAM
C) Transit Gateway only — merely a routing hub between VPCs, with each account still operating an independent VPC, failing the requirement of "directly sharing the central VPC's subnets"
D) Direct Connect — a dedicated-line service connecting on-premises and AWS, entirely unrelated to a cross-account VPC subnet sharing scenario

**Answer: B**
Explanation: Share subnets via RAM → the receiving accounts can create ENIs/EC2 but can't touch routing or NACLs. A clean separation of network design and workload operations. Peering is point-to-point; TGW is a routing hub, a complement. In real operations, the combination of RAM (subnet sharing) + Transit Gateway (inter-VPC routing hub) is used together most often. RAM applies only within the same Organization (enabling "Resource Sharing Outside Organization" allows external accounts too, but for security reasons it's almost never used).
