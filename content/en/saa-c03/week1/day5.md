# Day 5 - Week 1 Review: Fundamentals and IAM, Hardened Through Scenarios

Over one week we covered everything from global infrastructure to multi-account governance. Even if you feel like you know it all in your head, the SAA-C03 exam always asks by twisting it into a one-line scenario. From the single sentence "data can't leave headquarters," Outposts should come to mind, and from "minimize global latency for a TCP game server," Global Accelerator should pop out immediately. The exam isn't trying to filter out people who didn't memorize keywords; it's trying to select people who can quickly judge "what is the essence of this scenario."

This article is the time to review Week 1 and etch the scenario keyword → solution mapping into your head. It isn't simple memorization; we'll re-examine "why that's the answer" once more. Scenario mapping is also an area where reading it through once more the day before the exam clearly raises your odds of passing. And in practice, this mapping becomes the "ability to review a design someone else built before an incident happens" — every incident we saw in Week 1 (Capital One, us-east-1, the Tokyo AZ, SolarWinds, Travis CI) ultimately happened when someone confused the same mapping.

## Redrawing the Week 1 Picture

```
[ AWS Global Infrastructure ]
       │
       ├── Region (34) ──┬── AZ (3+) ──┬── DC
       │                 │             └── DC
       │                 └── AZ ── DC
       ├── Edge Location (600+) ── CloudFront / R53 / GA / WAF
       ├── Local Zone (30+) ── mini Region
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

These three areas are the conclusion of Week 1, and it's accurate to say that every service from Week 2 to Week 12 sits on top of these three planes. Networking operates on top of AZs, security on top of IAM, and multi-account patterns on top of Organizations. And the intersection of these three planes — "who can do what to a resource in which Region and which AZ of which account" — ultimately becomes the coordinate system for every SAA scenario.

This 3-layer model is actually a mapping of the classic 3 axes of distributed-system security — *Where* (location), *Who* (identity), *What* (resource) — onto cloud operations. In addition to the three security elements NIST defined in 1985 (Confidentiality / Integrity / Availability), the three areas codified by NIST SP 800-53 in 2003 — Access Control (AC), Audit & Accountability (AU), and System and Communications Protection (SC) — match almost one-to-one. AC is implemented by IAM, AU by CloudTrail/Config, and SC by VPC/network controls.

These 3 layers are also reflected as-is in AWS's actual permission evaluation engine. AWS Zelkova (formal verification of IAM) and Tiros (formal verification of networks) convert IAM/SCP policies and VPC routing into SMT constraints respectively to solve "is this request reachable." The 2018 USENIX Security paper "Semantic-based Automated Reasoning for AWS Access Policies" is the basis of Zelkova, and "Reachability Analysis for AWS-based Networks," presented the same year, is the basis of Tiros. Access Analyzer, Reachability Analyzer, and IAM Access Advisor all run on top of this.

## Scenario Keyword Mapping

| Scenario keyword | Candidate answer | Reason |
|---------------|----------|------|
| "Keep data inside HQ" + "use AWS APIs" | Outposts | AWS hardware inside the customer DC |
| "5G", "autonomous driving", "AR/VR" | Wavelength | Carrier edge |
| "Post-production VFX", "users in LA/Miami" | Local Zones | City-level mini Region |
| "TCP/UDP", "gaming", "VoIP" | Global Accelerator | L4 acceleration |
| "HTTP static content caching" | CloudFront | L7 caching |
| "DNS failover" | Route 53 | DNS routing |
| "Multi-account", "Okta SSO" | IAM Identity Center | SAML/SCIM federation |
| "Deploy to AWS from GitHub Actions" | OIDC federation | Short-lived tokens |
| "External SaaS monitoring" | Cross-Account Role + External ID | Confused Deputy defense |
| "Developers create Roles but broad permissions are forbidden" | Permissions Boundary | Permission ceiling |
| "Block a specific Region in all accounts" | SCP | Account permission ceiling |
| "Automatically apply a baseline to new accounts" | Control Tower + StackSets | Automated Landing Zone |
| "Share a VPC across multiple accounts" | AWS RAM | Resource sharing |
| "Safe way for EC2 to access S3" | Instance Profile + IAM Role | Prevents key exposure |
| "Enforce MFA" | Policy Condition `aws:MultiFactorAuthPresent` | IAM enforcement |
| "Service stays up if one AZ dies" | Multi-AZ ASG + ELB | HA pattern |
| "1-second RPO even if a Region dies" | Aurora Global Database | DR pattern |
| "Data sovereignty + Korean FSS regulation" | Outposts / domestic Region | Data location restriction |
| "Grant AWS permissions while keeping the existing IdP" | IAM Identity Center + SAML | External IdP federation |
| "Lambda accesses another account's S3" | Cross-Account Role + Resource Policy | Allow needed on both sides |
| "AWS permissions for Active Directory users" | AD Trust + IAM Identity Center | Enterprise standard |
| "Time-limited permissions for temporary staff" | Session Tag + Permissions Boundary | Automatic expiry + ceiling |
| "Block unintended public exposure of S3 buckets" | Block Public Access (account + bucket, 4 settings) | Data leak prevention |

This table can be read through in 30 minutes the day before the exam, and if you review the same mapping 5 or more times, candidate answers will come to mind from just the first line of a scenario in the exam room. The keyword → solution mapping best shows the "pattern-recognition exam" nature of SAA.

> ⚠️ **Trap**: There are also many cases where the same keyword leads to different answers. Is "encryption" KMS or CloudHSM? For single-company use it's KMS; for FIPS 140-2 Level 3 regulation (FedRAMP High, some financial) it's CloudHSM. Is "DR" Multi-AZ or Cross-Region? AZ-level isolation is Multi-AZ; Region-level isolation is Cross-Region. Don't look only at keywords; look together at "what is the threat model of this scenario."

## CAP/PACELC and Mapping AWS Services

SAA doesn't ask about this directly, but it's decisive for interpreting scenarios. If you don't know the trade-offs of distributed systems, you can't answer questions like "why can't this option give strong consistency." And this mapping is also used directly in practice when debugging "why did our service's global consistency break."

| Service | Consistency model | Position |
|--------|------------|------|
| DynamoDB (default) | Eventually Consistent | AP |
| DynamoDB (strong) | Strong Consistent (single Region) | CP |
| DynamoDB Global Table | Multi-Master, Last-Writer-Wins | AP |
| Aurora (single region) | Strong | CP |
| Aurora Global DB | Async replication | AP (across Regions) |
| RDS Multi-AZ | Sync replication | CP |
| S3 | Strong read-after-write (since 2020.12) | CP |
| EFS | Strong (close-to-open) | CP |
| ElastiCache for Redis (Cluster Mode) | Async replication | AP |
| FSx for Lustre | Strong (POSIX) | CP |
| Neptune | Strong (single writer) | CP |

DynamoDB's strong consistency is offered as an option only within a single Region (`ConsistentRead=true`), and Global Tables are always eventual. Global Table conflict resolution is based on **Last-Writer-Wins** (LWW), so data can be lost on concurrent writes. So if you need multi-master global writes, use a DynamoDB Global Table, but first weigh whether "timestamp conflicts are acceptable for the business." If you need stricter consistency, you need CRDTs (Conflict-free Replicated Data Types) or consensus algorithms based on Paxos/Raft, and AWS partly provides this through Aurora's quorum-based replication (6-way write across 3 AZs, with 4/6 read and 3/6 write quorums). The Aurora paper *Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases* (SIGMOD 2017) is the essence of this architecture.

**Case**: In 2015, GitHub had its data consistency broken for 24 hours by a partition incident in its own MySQL cluster. A network partition occurred between two data centers, and each side judged itself to be the primary and accepted writes, a split-brain incident. In the post-incident report, GitHub stated explicitly, "when partitioned, we choose CP and give up availability." Cases like this show that CAP's trade-off isn't abstract theory but a decision operators face every day. AWS made the same decision in RDS Multi-AZ, which is why availability drops for about 60 seconds during failover.

> ⚠️ **Trap**: It's wrong to assume that "Aurora is strongly consistent, so the global DB is too." Aurora Global Database uses **storage-level async replication** (typically 1-second RPO) and the secondary Region is read-only. If you want global writes, you have to use a DynamoDB Global Table, but then you must accept the conflict risk of LWW. Also, viewing it as "ElastiCache Redis Cluster Mode is async replication but guarantees availability via multi-AZ failover" is partially wrong too — writes that haven't been acked can be lost during failover.

## Reviewing the Shared Responsibility Model

![The shared responsibility boundary, where customer responsibility grows as you move from fully managed to IaaS](/diagrams/en/shared-responsibility-4tier.svg)

The higher the service abstraction, the higher the responsibility boundary moves. **Even so, data classification, IAM, and encryption key management are always the customer's** — that's the key point. This principle is shown most clearly by the Capital One incident — AWS had fulfilled its responsibility for its own infrastructure, and the incident came from a WAF misconfiguration (SSRF), IMDSv1, and excessive IAM permissions in the customer's area.

**Case**: In June 2022, a Toyota subsidiary had an incident in which an access key was exposed in a public GitHub repository for 5 years. About 300,000 customers' data was put at risk, and the cause was a developer pushing credentials along with the code. AWS's responsibility was 0% — everything happened in the customer's area of responsibility. The standard post-incident recommendations are ① IAM Role + IRSA/Instance Profile instead of IAM User, ② if you must issue an Access Key, temporary credentials from IAM Identity Center, and ③ blocking commits with a Git pre-commit hook (git-secrets, truffleHog). The same pattern of incident repeated at Uber (2016), Imperva (2019), and Codecov (2021).

The shared responsibility model differs subtly from service to service. For RDS, DB engine patching (minor versions) is AWS's, while major version upgrades are the customer's choice. For Lambda, runtime patching is AWS's, while migration after a runtime EOL is the customer's (Node 14 → 18, etc.). For ECS Fargate, the container OS and runtime are AWS's, while patching OS packages inside the image is the customer's. These subtle differences are used as exam traps. AWS Trusted Advisor and AWS Security Hub's Foundational Security Best Practices (FSBP) automatically check these responsibility boundaries.

## Policy Evaluation Decision Tree

```
Request → SCP(Org) → Resource Policy → Identity Policy → Permissions Boundary → Session Policy
   Explicit Deny at any stage → DENY immediately
   Pass all stages → ALLOW
   No Allow anywhere → DENY (default)
```

Same account = union, cross-account = intersection, KMS = Key Policy must explicitly delegate. These three lines are the whole of IAM evaluation logic. If you're asked in an interview to "explain AWS IAM evaluation logic in 1 minute," these three lines are the answer.

**Trap**: An answer choice saying "if only the Resource Policy allows, Cross-Account works" is wrong. That's true for the same account, but cross-account also requires an Allow in the caller account's Identity Policy. Also, KMS is a special case — unless the Key Policy explicitly delegates to IAM (the "Enable IAM User Permissions" statement), you can't use the KMS key even if an IAM policy grants Allow. This is because KMS follows the model that "the key owner is the final authority."

Policy evaluation is actually decided by the intersection of 6 policy types — SCP, Resource Policy, Identity Policy, Permissions Boundary, Session Policy, and VPC Endpoint Policy. The "Policy Evaluation Logic" flowchart in the official AWS docs is the most accurate reference. Whether an "Allow is required vs optional" for each policy type differs by scenario. One-line summary: **an explicit Deny is always final, and an Allow must pass every boundary**.

This model is a mix of the security theory's *Mandatory Access Control* (MAC) and *Discretionary Access Control* (DAC). SCPs and Permissions Boundaries are MAC (limits enforced by a higher authority), and Identity/Resource Policies are DAC (set freely by the owner). It's similar to the multilevel security concept of the US military security standard *Bell-LaPadula Model* (1973). AWS solving policy evaluation with an SMT solver is also because this model has a structure that can be formally verified.

## Standard Multi-Account Topology

| Account | Role |
|------|------|
| Management | Org management, billing. No workloads |
| Log Archive | Central storage for CloudTrail/Config. WORM |
| Audit/Security | Delegated administrator for GuardDuty, Security Hub |
| Networking | Central VPC + Transit Gateway, RAM sharing |
| Shared Services | Common tools (CI/CD, Artifactory, etc.) |
| Prod | Production workloads |
| Staging | Pre-production verification |
| Dev | Development workloads |
| Sandbox | Personal experiments. Cost and Region strictly limited via SCP |

This topology is specified as a recommended form in the AWS Security Reference Architecture (SRA) documentation. It's accurate to say that every large enterprise customer uses a variation of this. If you look at the public presentations from Netflix, Capital One, Airbnb, Slack, and others, almost the same pattern repeats.

**Case**: In 2019, the Netflix Tech Blog revealed its multi-account strategy, saying that while operating more than 1,000 AWS accounts it had standardized an "Account per Workload" pattern that splits accounts finely by workload, team, and environment. The reasons are ① limiting blast radius, ② cost and tag automation, and ③ simplifying IAM permissions. Spotify, Lyft, and Stripe adopted the same pattern, and this is the real-world model of the topology that SRA recommends. As of 2023, large companies typically operate 100 to 5,000 accounts, and the AWS Organizations limit (10,000 accounts per Org) is effectively the ceiling.

The practical core of multi-account operations is two automations. ① Account provisioning automation — with Control Tower's Account Factory or Account Factory for Terraform (AFT), creating a new account → applying the baseline → granting permissions → notification are tied into a GitOps flow. ② Automatic baseline deployment — with the `SERVICE_MANAGED + auto-deployment=Enabled` option of CloudFormation StackSets, a security baseline (GuardDuty, Config Rules, IAM Password Policy, S3 BPA, etc.) is automatically applied to new accounts. Without these two automations, operating 100 accounts is impossible for humans.

## Key Comparisons That Are Often Confused

| Item | A | B | Difference |
|------|---|---|------|
| Local Zones | City mini Regions such as LA/Miami | Wavelength: carrier 5G edge | LZ is the regular internet, WL is mobile 5G |
| CloudFront | L7 HTTP cache | Global Accelerator: L4 acceleration | HTTP means CF, TCP/UDP means GA |
| IAM User | Permanent credentials | IAM Identity Center: temporary SSO | Multi-account / external IdP means IC |
| ZoneName | Shuffled per account | ZoneId: identical regardless of account | Use ZoneId for multi-account sync |
| Permissions Boundary | Identity permission ceiling | SCP: account permission ceiling | Different scope of application |
| Cross-Region Read Replica | Async, manual promote | Aurora Global DB: Async + fast failover (on the order of minutes) | RPO/RTO difference |
| CloudFront Functions | Edge PoP, 1 ms limit | Lambda@Edge: Regional Edge, heavier | Location/runtime difference |
| KMS | Multi-tenant HSM | CloudHSM: dedicated HSM, FIPS 140-2 L3 | Regulatory strictness |
| STS AssumeRole | General cross-account | AssumeRoleWithWebIdentity: OIDC | External IdP federation |
| Resource Policy Allow | Same-account is enough | Cross-account: Allow needed on both sides | Evaluation logic |

**Trap**: ZoneName vs ZoneId doesn't often appear on the exam, but in practice it's decisive in security/cost scenarios asking about "using the same AZ as another account." CloudFront vs Global Accelerator is a pair frequently compared on the exam, and if you see the keywords "TCP/UDP," "gaming," "VoIP," "MQTT," or "WebRTC signaling," it's always GA. CloudFront Functions vs Lambda@Edge is along the same comparison axis: "sub-millisecond-scale response" means Functions, and "full Node.js/Python runtime" means Lambda@Edge.

When AWS offers the same functionality through several services, the trade-off axis is always different. KMS vs CloudHSM is **abstraction vs isolation**, ALB vs NLB is **L7 features vs L4 throughput**, and SQS vs SNS vs EventBridge is **point-to-point vs fanout vs schema-routing**. On the SAA exam you must always identify "along which axis the trade-off is being asked." Once you master this way of thinking, you can map even an unfamiliar new service onto the same axes and narrow down candidate answers.

## Wrap-Up

Week 1 was the time to etch "the coordinate system of the AWS universe" into your head. The isolation model of Region/AZ/Edge, IAM's policy evaluation, and multi-account governance. These three become the backdrop for every topic in the remaining 11 weeks. Next week we'll layer **networking** (VPC, subnets, routing) on top of them. Don't try to understand it all at once; if you build the habit of reopening this table each time you solve a scenario question and doing the mapping, the keyword → solution mapping will be set as an automatic reflex right before the exam. And that automatic reflex is not only about passing SAA but also the core competency of a senior engineer in real-world design who "can sketch 3 candidate solutions within a 30-minute meeting."

---

## 📝 Comprehensive Practice Questions

**Question 1.** A global gaming company wants to provide consistent TCP-based game server response times to users around the world. What is the most suitable solution?

A) CloudFront + Lambda@Edge — Caches HTTP content at about 600 edge PoPs and even runs Node.js logic, but being L7 HTTP/HTTPS only, it cannot accelerate the game's raw TCP sessions
B) Global Accelerator
C) Route 53 Latency Routing — Answers DNS with the lowest-latency Region endpoint for the client, but is bound by TTL caching and the actual packets still travel the public internet, so there is no backbone acceleration
D) ElastiCache Global Datastore — It's just a cache layer that replicates Redis data across Regions in under 1 second, unrelated to routing game server TCP traffic

**Answer: B**
Explanation: For TCP/UDP, it's always Global Accelerator, the L4 accelerator. CloudFront handles only HTTP L7, and Route 53 only gives different DNS answers without accelerating traffic. ElastiCache is a caching service and unrelated. Global Accelerator provides 2 static BGP Anycast IPs, so routing changes regardless of DNS TTL, and because traffic goes through the backbone network, packet loss and jitter also drop. In measured results, it's common for global users' p99 latency to drop by 30-60%.

---

**Question 2.** A financial company must keep some data inside its headquarters under Korean Financial Supervisory Service regulations while still operating through AWS APIs. What is the most suitable solution?

A) Direct Connect only — Connects HQ and the AWS Region over a dedicated line with low latency, but the data itself is still stored in the AWS Region, so it doesn't satisfy the "keep inside HQ" regulatory requirement
B) Local Zones — AWS-operated mini facilities placed in major cities that provide low latency, but they're AWS data centers rather than the customer's building, so they're unsuitable for data sovereignty requirements
C) Outposts
D) Snowball Edge — A one-off device for moving petabytes of data offline or for short-term edge computing, so it's unsuitable as a platform for continuously operating via AWS APIs

**Answer: C**
Explanation: AWS hardware inside the customer's data center + the same APIs. It's the answer for regulatory scenarios like the Electronic Financial Supervision Regulation and GDPR Schrems II. Local Zones are AWS-operated facilities, Direct Connect is a dedicated line, and Snowball Edge is for one-off data transfers. Outposts is for nearly the only scenario that needs "my building + AWS APIs" at the same time — otherwise Direct Connect is often enough. On cost, Outposts is about 1.5 to 2 times more expensive than EC2 on a 3-year commitment, so it's rarely used for reasons other than regulation.

---

**Question 3.** A company wants to block use of all Regions other than us-east-1 across 50 AWS accounts. What is the most efficient method?

A) Add an IAM policy to each account — The same policy must be attached one by one to every user and role in 50 accounts, so management explodes and the risk of omissions grows with every new identity, making it unsuitable for governance
B) An Organizations SCP with a Deny on the `aws:RequestedRegion` condition
C) CloudTrail alerts — They only detect and alert on Region usage after the fact via logs and cannot block the API calls themselves, so they are not preventive blocking
D) Create VPCs only in us-east-1 — Even without a VPC, Region-level global services or services like S3 and DynamoDB can still be called as-is in other Regions, so the blocking is incomplete

**Answer: B**
Explanation: The multi-account permission ceiling = SCP. A Deny on `aws:RequestedRegion` is the standard pattern. But SCPs don't apply to the Management account, so you shouldn't put operational workloads there. You also need to handle the subtle trap that global services (IAM, CloudFront, Route 53) show `aws:RequestedRegion` as `us-east-1`, so exceptions are needed. Also, after an SCP is applied, existing resources remain as they are and only new API calls are blocked, so cleaning up existing resources in other Regions requires separate work.

---

**Question 4.** What is the safest way for EC2 to access S3?

A) Store an Access Key in ~/.aws/credentials — A long-term credential remains in plaintext on disk, gets stolen as-is if the instance is compromised, and adds the burden of manual key rotation, which is risky
B) Attach an IAM Role as an Instance Profile + IMDSv2
C) Use the root Access Key — It's the top-level credential with unlimited permissions over the whole account, so exposure spreads damage across the entire account, and AWS also recommends never using it
D) Allow S3 Public Read — Lets anyone read objects without authentication, which leads directly to data leaks and is the opposite direction of EC2 access control

**Answer: B**
Explanation: Instance Profile + IMDSv2. The SDK automatically refreshes temporary credentials, and it also defends against SSRF. A risks key leakage, C is an absolute taboo, and D exposes data. If you recall that the direct cause of the Capital One incident was IMDSv1, it becomes clear "why IMDSv2 must be written explicitly." An even more thorough defense is the combination of enforcing `HttpTokens=required` + `HttpPutResponseHopLimit=1` in the EC2 Launch Template and blocking IMDSv1 calls with an SCP.

---

**Question 5.** How do you remove the burden of key rotation when GitHub Actions deploys to AWS?

A) Store an IAM User Access Key as a Secret — Keeping a long-term key in GitHub Secrets works, but the burden of regular manual rotation remains and it carries the same risk as the Travis CI breach, where keys were stolen as-is when exposed in logs
B) Role short-lived credentials via OIDC federation
C) Launch an EC2 and use an SSH key — You have to manage a separate EC2 and SSH key for each deployment, which complicates operations, and the key itself becomes yet another long-term secret, so it doesn't eliminate the rotation burden
D) root credentials — This exposes unlimited account-wide permissions to CI, a head-on violation of the least-privilege principle and the worst choice

**Answer: B**
Explanation: GitHub OIDC → STS AssumeRoleWithWebIdentity → short-lived token. Limit the repo and branch with the `sub` claim in the Trust Policy. The Travis CI breach was the decisive trigger for standardizing OIDC. The same pattern is being extended to GitLab, Bitbucket, Buildkite, and others, so it's fair to say it's now the standard across CI. For stronger security, the standard practice is to lock the `token.actions.githubusercontent.com:sub` claim in the trust policy down to the branch, like `repo:org/repo:ref:refs/heads/main`.

---

**Question 6.** A SaaS collects CloudWatch logs from our AWS. What is needed for Confused Deputy defense?

A) Cross-Account Role + External ID condition
B) Give the IAM User an Access Key — Hands a long-term Access Key to the SaaS, which carries a heavy key-leak and rotation burden and does nothing at all to solve the Confused Deputy problem itself
C) S3 Public Read — Opens the log bucket publicly so anyone can read it, a data-leak configuration that is the opposite of safe delegated collection
D) VPN connection — Provides only a network-layer tunnel and is unrelated to the identity delegation and permission-boundary issues when the SaaS assumes a role in our account

**Answer: A**
Explanation: The External ID is a pre-shared secret that prevents other SaaS customers from assuming our Role even if they know its ARN. It's a required condition for Marketplace ISV certification. In addition to the External ID, it's safer to also apply the `aws:SourceAccount` or `aws:SourceArn` condition. According to AWS's 2022 review of the "Confused Deputy" pattern, many ISVs applied only the External ID and omitted SourceArn, leaving them partially vulnerable.

---

**Question 7.** A company issues 10 new AWS accounts every week and wants to apply the same security baseline to each. What is the most suitable method?

A) An operator configures manually each time — A person has to apply the baseline by hand to 10 accounts every week, so omissions and drift are unavoidable, and operations collapse as scale grows
B) Control Tower Account Factory + StackSets auto-deployment
C) Run CloudFormation manually in each account — The template is consistent, but a person must run the stack and set up cross-account roles for every new account, so automatic propagation is missing
D) Run Terraform Apply each time — IaC provides standardization, but unless new account creation and registration are tied into a separate pipeline, a manual trigger is needed each time, falling short of full automation

**Answer: B**
Explanation: Control Tower automatically creates a standard Landing Zone, and StackSets `SERVICE_MANAGED + auto-deployment Enabled` automatically deploys the baseline to new accounts. Consistency is maintained without operator intervention. Larger organizations tie in a GitOps flow with Account Factory for Terraform (AFT). AFT receives new account requests as PRs, and once merged, Terraform Cloud automatically handles account creation, baseline application, and even SSO permission assignment.

---

**Question 8.** A company wants to give new developers permission to create IAM Roles freely but prevent them from creating AdministratorAccess-level Roles. What is the most appropriate method?

A) Detect after the fact with CloudTrail — Role creation is logged so it can be traced afterward, but it can't prevent an over-permissioned Role from being created in the first place, so it's not a preventive control
B) Explicitly state a Permissions Boundary as a mandatory attachment condition in the policy
C) Revoke all of the new hires' permissions — This takes away the permission to create Roles itself, which directly violates the requirement to "let them create freely but only set a ceiling"
D) Use only an Organizations SCP — It's a ceiling at the account/OU level, so the granularity is too coarse to enforce a different limit per individual Role within the same account, making it unsuitable

**Answer: B**
Explanation: Enforce the `iam:PermissionsBoundary` condition on `iam:CreateRole` calls. The effective permissions of a created Role are limited to the intersection with the Boundary. SCPs are a larger unit (account/OU), so they're unsuitable for setting a different limit for each individual Role within the same account. This is the standard pattern for "delegating permissions while preventing the delegate from expanding them," and it's the core of the *Delegated Administrator* model in the official AWS guidance.

---

**Question 9.** EC2 goes down due to a cooling failure in one AZ. If the ASG is already configured as multi-AZ?

A) All services go down — The multi-AZ ASG replenishes instances in the surviving AZs, so the premise that a single AZ failure takes everything down itself contradicts HA design
B) The ASG automatically replenishes instances in other AZs, and the service stays up
C) RDS Multi-AZ also goes down — RDS Multi-AZ has its standby in another AZ and fails over automatically within 30 to 60 seconds, so saying it also goes down permanently is wrong
D) Manual failover is required — ASG health checks and ELB automatically replace and redistribute unhealthy instances, so no manual operator intervention is needed

**Answer: B**
Explanation: This is exactly the scenario of the 2019 Tokyo Region incident. The ASG drops instances that fail health checks and adds new instances in the surviving AZs. RDS Multi-AZ automatically fails over to the standby within 30-60 seconds. However, if EBS or EFS is tied to a single AZ, that part dies too, so it's safer to set EFS to the Multi-AZ Standard class or move storage to S3/DynamoDB. ALB also has cross-zone load balancing enabled by default, so traffic is automatically redistributed to other AZs.

---

**Question 10.** Which of the following is NOT AWS's responsibility?

A) Hypervisor security — The virtualization layer such as Nitro is designed, patched, and isolated by AWS, in the "security of the cloud" area, so it's entirely AWS's responsibility
B) Guest OS patching (EC2)
C) Physical facility security — Physical infrastructure such as data center access control, power, and cooling is a representative area of responsibility handled exclusively by AWS
D) Inter-AZ network encryption — Backbone traffic connecting AZs within a Region has been automatically encrypted between Nitro instances since 2018, so AWS is responsible and no customer work is needed

**Answer: B**
Explanation: The EC2 guest OS is the customer's responsibility. Because of the IaaS abstraction level, everything above the OS is the customer's. If you switch to Fargate, OS patching also shifts to AWS. If you move the same workload to Lambda, AWS takes responsibility through the runtime — the higher the abstraction, the higher the responsibility boundary moves. For reference, the inter-AZ traffic encryption in D has been applied automatically between Nitro instances since 2018, and customers don't need to do any additional work.

---

**Question 11.** A system requires an RPO under 1 ms per transaction and operates only within a single Region. For RDS?

A) Single-AZ Standard — With only one instance in a single AZ there's no replication at all, so an AZ failure causes data loss until a backup is restored, and a 1 ms RPO can't be guaranteed
B) Multi-AZ Synchronous Replication
C) Cross-Region Read Replica — It's asynchronous cross-Region replication, so replication lag stretches to seconds, the RPO far exceeds 1 ms, and it's also an excessive setup for the single-Region condition
D) Aurora Global Database — It's storage-level asynchronous cross-Region replication (about 1-second RPO), so there's a risk of loss in the secondary Region, and it's overkill for a scenario that requires only a single Region

**Answer: B**
Explanation: Same-Region synchronous replication gives RPO ≈ 0. The commit ack happens within the 1-2 ms latency between AZs. C is async so the RPO is in seconds, and D is async across Regions. It's also good to know that the RDS Multi-AZ standby doesn't receive read traffic (unlike Aurora) — if you need read distribution, you must launch a Read Replica separately. Aurora does 6-way replication within the same Region automatically at the storage layer, so there's no separate Multi-AZ toggle.

---

**Question 12.** A company wants to share the VPC subnets of a central Networking account with 30 other workload accounts within Organizations. What is the most suitable solution?

A) VPC Peering 30 times — It connects the central VPC to 30 accounts point-to-point, which isn't sharing subnets but connecting separate-CIDR VPCs, so it differs from the requirement and also comes with the non-transitive constraint
B) Share subnets with AWS RAM
C) Transit Gateway only — It's merely a routing hub between VPCs and each account must still operate its own independent VPC, so it doesn't satisfy the requirement to "directly share the central VPC's subnets"
D) Direct Connect — It's a dedicated-line service connecting on-premises and AWS, so it has nothing to do with the scenario of sharing VPC subnets across accounts

**Answer: B**
Explanation: Share the subnets with RAM → the receiving accounts can create ENIs/EC2 but can't touch routing or NACLs. A clean separation of network design from workload operations. Peering is point-to-point, and TGW is a routing hub, so they're complementary. In real operations, the most common setup is using RAM (subnet sharing) + Transit Gateway (inter-VPC routing hub) together. RAM only applies within the same Organization (enabling Resource Sharing Outside Organization allows external accounts too, but it's almost never used for security reasons).
