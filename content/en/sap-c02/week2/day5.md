# Day 5 - Week 2 Integration: When Organizations, SCPs, CT, and IDC Meet in a Single Scenario

On the Pro exam, the core four of Domain 1 (Design for Organizational Complexity, 26%) are **Organizations, SCPs, Control Tower, and IAM Identity Center**. If you studied these four separately over the week, today we seriously work through Pro questions where **they operate simultaneously in one scenario.**

Domain 1 is hard not because of single-service knowledge but because **the layers are stacked on top of each other in the questions.** Even a single "the Region restriction isn't working" problem can entangle an SCP NotAction exception, OU inheritance, an IDC Permission Set's inline policy, and an RCP's blocking of external principals all at once. So today, rather than re-explaining each service, we look at what blast radius one service's decision causes in the others.

The structure of today's article is the same as Week 1 Day 5.

1. **30 one-line summaries for Week 2**: facts that should come to mind reflexively in the exam room.
2. **The multi-account 4-layer thinking method**: decompose a scenario as Org → OU → SCP → IDC.
3. **The history and theoretical background of account separation**: why "one big account" is an anti-pattern.
4. **Comparison with other clouds**: contrast with Azure Management Groups and GCP Organization.
5. **12 scenario questions**: Pro difficulty, 30 minutes to solve.

Domain 1 is an area that SAA barely touched, so it has the highest study ROI. The intent of the 16-week curriculum is to concentrate on this area through Week 4 and move on to new solutions and migration from Week 5.

## The History and Theory of Multi-Account Governance

AWS Organizations became GA in **February 2017**. Before that there was only **Consolidated Billing (2010)**, which bundled only billing, and permission governance was left to each account. SCPs appeared together with Organizations and elevated multi-account from a "cost bundle" to a "governance unit." **Control Tower** (Landing Zone automation) in 2019 and **AWS SSO** (now IAM Identity Center) in 2018 came out in turn, completing today's stack. In other words, the four of Domain 1 are layers that accumulated gradually over 7 to 8 years, and the Pro exam looks at the picture of these layers "working together."

Why should you not run a company in a single giant AWS account? The core is the **blast radius** and the **isolation boundary**.

In distributed systems reliability theory there is the concept of a **fault containment region (FCR)**. It is a design that divides a system with boundaries so that one fault cannot propagate to other areas. An AWS account is the strongest FCR in the cloud - IAM policy mistakes, resource quotas, and security breaches cannot cross the account boundary. VPC and IAM boundaries are "weak" boundaries within the same account, but the account boundary is a "strong" boundary separated at the AWS backbone level. This is the theoretical basis for "always separate Prod and Non-Prod into different accounts."

Multi-account design enforces the security **principle of least privilege** and **separation of duties (SoD)** through structure. SoD is a control principle handed down since the 1970s in accounting and auditing, codified in NIST SP 800-53 AC-5. Splitting the account that stores logs (Log Archive) from the account that analyzes them (Audit), and not putting workloads in the Management account that only handles billing, are both cloud implementations of SoD.

**Capital One (July 2019)** - through an SSRF vulnerability, credentials of an over-privileged IAM Role were stolen from EC2 metadata, and data on 106 million people was leaked. The direct causes were the WAF configuration and excessive S3 access permissions, but the post-incident analysis pointed out that "the data account and the application account were not separated enough, so one Role could access too many buckets." Lesson: if you divide account and Role boundaries narrowly, the blast radius is limited even if one credential is stolen. After this incident, AWS released IMDSv2 (2019) and strongly recommended account separation in the SRA (Security Reference Architecture).

## Multi-Account and Organization Governance in Other Clouds

The Pro exam asks only about AWS, but comparing concepts makes the essence clear.

| Concept | AWS | Azure | GCP |
|------|-----|-------|-----|
| Isolation unit | **Account** | Subscription | Project |
| Organization root | Organization | Tenant (Entra ID) | Organization |
| Grouping hierarchy | **OU** | Management Group | Folder |
| Policy guardrail | **SCP / RCP** | Azure Policy | Org Policy Constraints |
| Identity integration | IAM Identity Center | Entra ID (native) | Cloud Identity |
| Automated landing zone | Control Tower | Landing Zone (CAF) | Landing Zone (Fabric) |

The biggest structural difference is that **in AWS the account is a first-class isolation boundary with "separate billing, separate quotas, and a separate resource namespace."** Azure's Subscription is similar, but in Azure, Entra ID natively manages identity across the entire tenant, so a separate integration layer like IDC is less needed. GCP's Project is the lightest and easiest to create, so a "project per resource" pattern is common. If an SCP in AWS is a "default-deny ceiling attached to an OU," Azure Policy is an "audit/deny rule that evaluates resource properties," so the evaluation model itself differs - Azure Policy is closer to a Config Rule (Detective) than to an SCP.

## 30 One-Line Summaries for Week 2

### Organizations (1-8)

1. The 4 motives for multi-account: **isolation (blast radius), billing, regulation, operations.**
2. The Management account is for **billing and Org administration only**, no workloads. SCPs do not apply.
3. The Management root gets a hardware MFA + a sealed password + a separate email alias.
4. An OU is a "unit of common SCPs," not an org chart. SRA standard: Security/Infrastructure/Workloads/Sandbox.
5. Always separate Prod/Non-Prod into different accounts - the same IAM policy mistake threatens Prod.
6. PCI/HIPAA/SOX workloads go in separate accounts - to narrow audit scope.
7. The `CreateAccount` API is asynchronous. You need to poll with `DescribeCreateAccountStatus`.
8. Delegate security tools to the Audit account with Trusted Access + Delegated Administrator.

### SCP (9-16)

9. SCPs **do not grant permissions**, they only set a ceiling. Intersection with IAM policies.
10. **An explicit Deny beats every Allow.** Just one is enough.
11. **The deny-list strategy is the standard** (FullAWSAccess + specific Denies). New services are automatically allowed.
12. A Region-restriction SCP must have a NotAction exception for global services (IAM, Org, Route53, CloudFront, GA, WAF).
13. SCPs that block disabling CloudTrail, GuardDuty, and Config are standard baseline.
14. When enforcing MFA, use `BoolIfExists` (`Bool` does not match when the key is absent).
15. Validate in a PolicyStaging OU before attaching to the real OU - effectively a substitute for a dry run.
16. **RCP** (2024) is a resource-side restriction that blocks external exposure across an entire OU.

### Control Tower (17-22)

17. **Landing Zone = the reference point of multi-account governance**, and Control Tower builds it automatically in 1 hour.
18. Core OU = Log Archive + Audit. The Log Archive S3 uses **Object Lock (WORM)**.
19. Three guardrail types: **Preventive (SCP) / Detective (Config) / Proactive (CFN Hook)** - defense in depth.
20. Mandatory (cannot be disabled) / Strongly Recommended / Elective.
21. **AFT = Terraform GitOps**, **CfCT = CloudFormation extension**, **Account Factory = console standard**.
22. Drift Detection compares against the baseline every hour, and a Landing Zone Update restores it.

### IAM Identity Center (23-30)

23. The multi-account SSO standard. Free.
24. When mapping a Permission Set, an `AWSReservedSSO_*` Role is automatically created in each account.
25. Okta/Azure AD/Entra/Google → **SCIM** automatic user and group sync (RFC 7644).
26. **IDC = employees and administrators / Cognito = customer users** - never confuse them.
27. CLI v2 SSO uses the device authorization grant (OIDC), with tokens refreshed automatically after browser authentication.
28. ABAC + IDC: user attributes → IAM Role session tags → resource tag matching. Prevents an explosion of 100+ projects.
29. Administrator sessions 1h, developers 4h, ReadOnly 8h - the break-glass pattern.
30. Consolidated Billing: RI/SP sharing is ON by default; turn it OFF or use Cost Allocation Tags when separating by department.

The SCIM in item 25 is the **RFC 7644 (System for Cross-domain Identity Management)** standard, the authentication protocol SAML 2.0 is an OASIS standard, and the device authorization grant used by the IDC CLI is **RFC 8628 (OAuth 2.0 Device Authorization Grant)**. When wording like "automatically sync Okta users to 50 accounts" appears on the exam, it is SCIM (provisioning), and the "login flow" is SAML (authentication). **Provisioning (SCIM) ≠ Authentication (SAML)** - you need to see these two separately to avoid getting confused among the options.

## The Multi-Account 4-Layer Thinking Method

When solving Domain 1 scenarios, checking the 4 layers in order reveals missing elements.

```
┌──────────────────────────────────────────────────┐
│ Layer 1: Org   "How do we group accounts?"       │
│   - OU design (Security/Infra/Workloads/Sandbox) │
│   - Isolating the Management account             │
│   - New account automation (Account Factory/AFT) │
├──────────────────────────────────────────────────┤
│ Layer 2: SCP   "What is prohibited at OU level?" │
│   - Region restriction, root blocking, MFA       │
│   - Blocking disabling of CloudTrail/GuardDuty   │
│   - Sandbox: Deny high-cost instances            │
│   - RCP: block external principal access         │
├──────────────────────────────────────────────────┤
│ Layer 3: Control Tower   "What are the guardrails?" │
│   - Preventive (SCP auto-attached)               │
│   - Detective (Config Rule automatic)            │
│   - Proactive (CFN Hook)                         │
│   - Log Archive Object Lock + Audit Master      │
├──────────────────────────────────────────────────┤
│ Layer 4: IDC   "What about employee access?"     │
│   - External IdP (Okta/Azure AD) + SCIM          │
│   - Permission Set + session length              │
│   - ABAC (large numbers of projects)             │
│   - break-glass pattern                          │
└──────────────────────────────────────────────────┘
```

> 🔍 **Going deeper**: The 4 layers are not just a memorization frame but match **the actual order of permission evaluation**. When a request comes in, AWS combines (1) the intersection of the SCPs of all parent OUs from top to bottom, (2) the RCP (resource side), (3) the Permission Boundary, and (4) the Identity Policy + Resource Policy + Session Policy. If any one of these is an explicit Deny, it is denied immediately, and if there is no Allow anywhere, it is denied too (default-deny). Layers 1-2 determine the "OU-level ceiling," and the IDC Permission Set in Layer 4 determines "what employees are actually given within that ceiling." So the debugging order is: if "the SCP doesn't block it but the employee can't access," suspect the Permission Set (IDC), and if "the Permission Set was granted but it still doesn't work," suspect the parent SCPs.

## Comparison Table: Frequently Confused Pairs

| A | B | Difference |
|---|---|------|
| **SCP** vs **IAM Policy** | OU/account ceiling vs principal permissions | SCPs do not Allow |
| **SCP** vs **Permission Boundary** | OU-level vs IAM-level ceiling | A PB applies to only one Role/User |
| **SCP** vs **RCP** | Principal side vs resource side | Complementary |
| **Preventive** vs **Detective** | Block beforehand (SCP) vs detect afterward (Config) | Complementary |
| **Account Factory** vs **AFT** | Console/base vs Terraform IaC | GitOps is AFT |
| **CfCT** vs **AFT** | CFN-based vs Terraform-based | IaC tool choice |
| **IDC** vs **Cognito** | Employees and administrators vs customer users | Never confuse |
| **Permission Set** vs **IAM Role** | IDC abstraction vs actual Role | PS mapping auto-creates the Role |
| **Log Archive** vs **Audit** | Log storage vs security analysis master | The Object Lock S3 is in Log Archive |
| **Trusted Access** vs **Delegated Admin** | Service enablement vs delegating operation | Both needed |
| **SCIM** vs **SAML** | User provisioning | Authentication/login |
| **CAP availability first** vs **consistency first** | Multi-Region governance data | See the box below |

Regarding the last row - Organizations' SCP/policy metadata is managed in a **global control plane** and propagated to member accounts. This is an **eventually consistent** system that chose availability (A) under the **CAP theorem**. When you change an SCP, it is applied to all accounts within a few seconds to a few minutes, not immediately. In PACELC terms, it is close to a PA/EL system that "prioritizes availability (A) over latency (L) even when there is no partition (P)." So when the exam describes "right after an SCP change, it is not immediately reflected in some accounts," you should understand it as propagation delay, not a bug.

## Anti-Patterns: Designs That Lead to Wrong Answers in Domain 1

> ⚠️ **Trap**: Domain 1 options always mix in choices that are "plausible but anti-patterns." Memorizing the 5 representative anti-patterns speeds up elimination.
>
> 1. **Mapping OUs directly to the org chart (departments)** - an OU is a "unit of common SCPs," not a human organization. If you split OUs into finance and HR teams, SCPs get pointlessly fragmented.
> 2. **Running workloads/IAM Users in the Management account** - if breached, an account with no SCP protection at all is compromised.
> 3. **Creating IAM Users separately in each account and managing them manually** - IDC + SCIM is the standard. Creating Users in each account means 50 accounts = 50x the management burden.
> 4. **Mistaking SCPs for a means of granting permissions** - putting Allow in an SCP does not create permissions without an IAM policy.
> 5. **Implementing governance with Config Rules (Detective) alone** - detection is after the fact. Rules that must be blocked (Region restriction, enforced encryption) are right with Preventive (SCP) or Proactive (CFN Hook).

> 🎯 **Scenario**: "A startup has grown quickly and has Prod, Dev, CI/CD, and data analytics all in a single account. The security team recommends moving to multi-account. What is the most appropriate first step?" - Answer: **Stand up a Landing Zone with Control Tower, invite the existing single account under the Workloads OU, and then gradually separate Prod/Dev/Security/Log Archive/Audit accounts.** Trying to move everything at once fails. From a 7R migration perspective this is close to an account-level "re-platform," and the key is stamping out new accounts with the standard baseline using Account Factory.

## 12 Scenario Questions (Pro Difficulty)

---

**Question 1.** 5 OUs, 100 accounts. Some OUs must prohibit use of unauthorized Regions. Best?

A) Use Lambda automation to batch-deploy a Region-restricting IAM policy to all Roles in the 100 accounts and periodically reapply it to new Roles

B) An Org SCP with an `aws:RequestedRegion` Deny + a NotAction exception for global services

C) Put a 0.0.0.0/0 Deny on the NACL outbound of subnets in unauthorized Regions to block communication of resources in those Regions

D) Deploy a Config Rule (`region-restriction`) to the entire OU to detect resources in unauthorized Regions and notify the security team via SNS

**Answer: B**

Explanation: An SCP enforces beforehand. Config only detects. Batch deployment with Lambda carries a large operational burden. A NotAction exception for global services (IAM/Org/Route53/CloudFront/GA/WAF) is required. Trade-off: the NotAction must be updated when new global services launch. From the 4-layer view this is a Layer 2 (SCP) problem, and A is a wrong answer that wrongly pulls in Layer 4 (Identity) - IAM policies cannot cover root and Roles to be created in the future without gaps.

---

**Question 2.** After creating a new OU, the FullAWSAccess SCP is removed and only EC2 is allowed through an allow-list. What happens to an S3 call in that account?

A) Allowed - S3 is a global service, so it is outside the scope of Region- and OU-level SCPs

B) Denied (no S3 Allow in the SCP, implicit Deny)

C) Allowed - if the bucket's Resource Policy gives `Allow`, it overrides the SCP's implicit Deny

D) Allowed - if the account's IAM Policy gives an S3 Allow, it is evaluated with priority over the SCP

**Answer: B**

Explanation: If the action is not in the SCP, the result is Deny whatever the IAM policy gives. The SCP is the ceiling. The implicit Deny of a new OU is the number one trap. Theoretically, the SCP sets the supremum of the permission lattice, and actual permissions are the intersection of that upper bound and the IAM policy, so if S3 is not in the upper bound, the intersection is also the empty set.

---

**Question 3.** Okta users + 50 AWS accounts + console/CLI SSO. What is the most appropriate?

A) Register Okta individually 50 times as a SAML IdP in each account and manually map Federated Roles per account

B) IAM Identity Center + Okta (SAML + SCIM)

C) Register employees in a Cognito User Pool and issue each account's IAM Role through an Identity Pool

D) Integrate Okta with AD Connector and create per-employee IAM Users in each account to issue console and CLI keys

**Answer: B**

Explanation: IDC is the standard. SCIM (user sync, RFC 7644) + SAML (authentication). Manages 50 accounts in bulk. C is for customers (Cognito). A is 50 repetitions of work + no sync. The IAM Users in D fall under anti-pattern 3 (manually managing Users per account). The key distinguishing point: provisioning is SCIM, authentication is SAML - they are different protocols.

---

**Question 4.** When a new account is created, a standard baseline (CloudTrail, IAM Roles, tags) must be applied automatically. Terraform is used. Best?

A) Use Account Factory directly from the console to create new accounts and apply the baseline manually afterward

B) AFT (Account Factory for Terraform)

C) Use CfCT (Customizations for Control Tower) to automatically deploy CloudFormation templates to new accounts

D) Use StackSets alone to automatically deploy CloudTrail, IAM Role, and tag resources to new accounts

**Answer: B**

Explanation: Terraform-based GitOps = AFT. PR merge → automatic account creation + baseline. C (CfCT) is a CloudFormation extension, so it does not fit if the IaC tool is Terraform. D (StackSets) deploys resources but lacks the account vending (creation) pipeline. AFT is internally composed of Account Factory + Step Functions + 4 Terraform pipelines (global/account customizations, etc.).

---

**Question 5.** Company policy: all EBS volumes must be KMS-encrypted. Block from the deployment attempt. Which guardrail?

A) Detective - detect unencrypted EBS with a Config Rule (`encrypted-volumes`) and correct it afterward with automatic Remediation

B) Proactive (CloudFormation Hook)

C) Preventive - an SCP Deny on `ec2:CreateVolume` with the condition `ec2:Encrypted=false`

D) Standardize encryption status as a tag with Tag Policy and flag missing ones as noncompliant

**Answer: B**

Explanation: Blocking before deployment = Proactive (CFN Hook) is cleanest in the IaC flow. Using an SCP (Preventive) to Deny `ec2:CreateVolume` with `ec2:Encrypted=false` is also valid, but to validate and block deployments through CloudFormation stacks at stack creation time, a CFN Hook is closer to the answer. The practical standard is a three-layer defense (defense in depth) of Preventive (SCP) + Proactive (CFN Hook) + Detective (Config). Note: a method of declaratively enforcing EBS default encryption with a **Declarative Policy (2024)** may also appear in the options.

---

**Question 6.** How do you collect the CloudTrail logs of 100 accounts in one place immutably?

A) Each account stores logs in its own S3 bucket and removes delete permissions via IAM policy to enforce immutability

B) Log Archive account + S3 Object Lock (WORM) + Organization Trail

C) Consolidate all accounts' CloudTrail into a central CloudWatch Logs group and set retention to permanent

D) Collect each account's logs in S3 and continuously audit for changes by querying directly with Athena

**Answer: B**

Explanation: The Log Archive pattern + Object Lock is the standard. Object Lock (Compliance mode) prevents even the root account from deleting during the defined retention period - WORM (Write Once Read Many). This is the immutable retention required by regulations such as SEC Rule 17a-4, FINRA, 21 CFR Part 11, and SOX. The Organization Trail automatically collects logs even when new accounts are added, preventing gaps. From the SoD perspective, the key is separating Log Archive (storage) from Audit (analysis).

---

**Question 7.** An OU where a developer group can experiment freely. Risk of cost explosion. Best?

A) Include it inside the Workloads OU

B) Sandbox OU + SCP (Deny high-cost instances such as p4/p5/x2) + AWS Budgets Alert + automatic cleanup Lambda

C) An IAM User in the Management account

D) Direct Connect + a separate VPC

**Answer: B**

Explanation: The Sandbox OU pattern + cost guardrails + automatic cleanup. Automatically deleting resources unused for a month is standard. A has insufficient isolation for experimentation, and C is anti-pattern 2 (workloads in the Management account). Budgets is an after-the-fact alert, so it must be paired with an SCP (blocking beforehand) to actually stop the explosion.

---

**Question 8.** The CFO wants to bill costs separately by department. Best?

A) Consolidated Billing + per-department OUs + Cost Allocation Tags + the Cost Explorer per-department view

B) A separate Org per department

C) Abolish Linked Accounts

D) Trusted Advisor

**Answer: A**

Explanation: The standard is Org + tag-based cost classification. Activate Cost Allocation Tags and attach `CostCenter` and `Department` tags to all resources. Enforcing the tag standard with Tag Policy prevents omissions. B (separate Orgs) loses the RI/Savings Plans sharing benefit and fragments governance - the core advantage of Consolidated Billing is sharing SP/RI across the whole organization to raise utilization.

---

**Question 9.** Guarantee that no one can disable CloudTrail. Best?

A) Remove the `cloudtrail:StopLogging` permission from IAM policies in all accounts and enforce the same policy on new Roles

B) An SCP with explicit Deny on `cloudtrail:StopLogging`, `DeleteTrail`, and `UpdateTrail`

C) Place a NACL in front of the S3 bucket where the Trail records to block CloudTrail control API traffic

D) Inspect CloudTrail console and API requests with AWS WAF and block disabling attempts with rules

**Answer: B**

Explanation: An SCP Deny cannot be broken through by any IAM Allow (explicit deny > any allow). After the Equifax (2017) incident, PCI-DSS v4.0 (2022) and NIST CSF explicitly require log immutability. It is a standard baseline SCP. A cannot cover root and Roles that will exist in the future without gaps, leaving holes.

---

**Question 10.** Right after joining an Org, a company wants to quickly set up a Landing Zone and automate the Audit and Log standard. Best?

A) Combine CloudFormation, SCPs, and Config directly to self-build the Landing Zone and Audit/Log accounts over several months

B) Control Tower

C) Create account and baseline products as a portfolio in Service Catalog for self-service provisioning

D) Manually apply a standard account configuration based on the results of Trusted Advisor's security and fault tolerance checks

**Answer: B**

Explanation: Control Tower builds the Landing Zone automatically in 1 hour. Log Archive and Audit are automatically created, guardrails automatically attached, and SRA-based best practices. C (Service Catalog) is merely a component that Control Tower's Account Factory uses internally and does not create a Landing Zone on its own. Control Tower is the AWS standard that corresponds to Azure's CAF Landing Zone and GCP's Fabric Landing Zone.

---

**Question 11.** A SaaS company wants to prevent principals outside the company from accessing any S3 bucket in an OU. Block in bulk with a policy from one place. Best?

A) Write a Bucket Policy on each bucket one by one

B) Lambda monitoring

C) A Resource Control Policy (RCP) attached to the OU (`aws:PrincipalOrgID != o-xxxx` Deny)

D) A GuardDuty alarm

**Answer: C**

Explanation: RCP (November 2024) is a resource-side restriction. Defined in one place, it applies to all resources in the OU. It structurally blocks S3 public incidents like those at Verizon, Booz Allen, and Accenture in 2017. SCPs are the principal side and RCPs are the resource side - a complementary relationship. RCP prevents **confused deputy** attacks (blocking outside the Org even if someone mistakenly puts `Principal: "*"`) at the OU level. A risks omissions across the number of buckets, and B/D are only detection, not blocking.

---

**Question 12.** A company runs 100 projects. Each project has separate S3 buckets and EC2. Users must be able to access only their own project's resources. RBAC would explode into 100 Roles. What is the most suitable pattern?

A) Create a Permission Set per project, define 100 in IDC, and assign per user

B) ABAC + IDC: propagate IdP attributes as IAM Role session tags and match against resource tags

C) Create an OU per project and block access to other projects' resources with SCPs on the 100 OUs

D) Isolate each project in its own account, 100 accounts, and map users only to the corresponding account

**Answer: B**

Explanation: The standard ABAC pattern (NIST SP 800-162). User attribute (Project) → session tag (`aws:PrincipalTag/Project`) → resource tag (`aws:ResourceTag/Project`) matching. One policy handles 100 projects. No policy changes are needed when adding a new project (just assign the tag). A (100 Permission Sets), C (100 OUs), and D (100 accounts) are all linearly growing operational burdens - the "role explosion" problem of RBAC. ABAC turns the dimension into an attribute, making this explosion constant.

## Wrapping Up

Week 2 covered the core four of Domain 1 in depth. Organizations groups accounts, SCPs set the ceiling, Control Tower automates governance, and IDC integrates employee SSO - these four are the standard stack of a multi-account environment. What we additionally saw today is (1) the historical context that this stack is layers accumulated over 7 to 8 years, (2) the theory that the account boundary is the strongest fault containment region in the cloud, (3) why the Capital One, Equifax, and S3 public incidents lead to account separation and SCPs/RCPs, and (4) the contrast with Azure Management Groups and GCP Folders.

Next week is **Advanced Networking** (Week 3). We revisit the networking that SAA touched lightly - VPC Peering vs. Transit Gateway, Direct Connect redundancy, Site-to-Site VPN, PrivateLink - at Pro depth. It is an area frequently tested in Domains 1 and 2, and scenarios like "how do you tie together thousands of VPCs" appear in earnest.

Re-solve the 12 questions you saw today, and for the ones you got wrong, apply the **4-layer thinking method** (Org → SCP → CT → IDC) to check where you went wrong. The moment your hand automatically draws the 4 layers in the exam room is the signal of passing Domain 1. In particular, getting the distinguishing points of "SCP or IDC," "Preventive or Detective," and "SCIM or SAML" into your hands speeds up eliminating options.

---

## 📌 Next Week Preview

**Week 3: Advanced Networking**
- VPC Peering vs. Transit Gateway (environments with thousands of VPCs)
- Direct Connect redundancy + LAG + Resilience
- Site-to-Site VPN, Client VPN
- PrivateLink, VPC Endpoint, Service Endpoint
- Network Firewall, GWLB, Resolver
