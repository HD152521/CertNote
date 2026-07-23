# Day 5 - Week 2 Integration: When Organizations·SCP·CT·IDC Meet in One Scenario

The 4 essential Domain 1 (complex org design, 26%) topics for Pro are **Organizations · SCP · Control Tower · IAM Identity Center**. We've separated these over the week; today we tackle **Pro scenarios where all 4 operate simultaneously**.

Domain 1 is hard not because single-service knowledge matters, but because it's **layered on top of each other**. One "region restriction isn't working" problem might involve SCP's NotAction exceptions, OU inheritance, IDC Permission Set inline policies, and RCP's external Principal blocking all tangled together. Today we revisit each service not by re-explaining, but by showing how **one service's decision creates blast radius in another**.

Today's structure mirrors Week 1 Day 5.

1. **Week 2 one-liners 30 total**: Facts reflexively recalled in exam.
2. **Multi-account 4-layer thinking**: Break scenarios into Org → OU → SCP → IDC.
3. **Account separation history and theory**: Why "one giant account" is antipattern.
4. **Other cloud comparison**: Azure Management Group, GCP Organization contrast.
5. **12-scenario questions**: Pro difficulty, 30-minute solve time.

Domain 1 has highest learning ROI since SAA barely covers it. Focusing here through Week 4, then shifting to new solutions·migration in Week 5 is the 16-week curriculum's intent.

## Multi-Account Governance History and Theory

> 🔍 **Going deeper**: AWS Organizations went GA **February 2017**. Before it, only **Consolidated Billing (2010)** existed—pooled billing, governance was each account's job. SCP launched with Organizations, elevating multi-account from "billing pool" to "governance unit". 2019 **Control Tower** (Landing Zone automation), 2018 **AWS SSO** (current IDC) followed, completing today's stack. Domain 1's 4 types layered over 7-8 years; Pro exams test "all working together."

Why can't one giant AWS account run a company? Core: **blast radius (explosion radius)** and **isolation boundary**.

> 💡 **Related theory**: Distributed systems reliability has **fault containment region (FCR)**. Design splits system by boundaries so faults don't propagate. AWS account is cloud's strongest FCR — IAM policy mistakes, resource quota, security breach all stop at account boundary. VPC or IAM boundary is same-account "weak" boundary; account boundary is AWS backbone "strong" boundary. That's the theory behind "Prod·Non-Prod must separate accounts."

> 💡 **Related theory**: Multi-account design structurally enforces security's **Principle of Least Privilege (PoLP)** and **Separation of Duties (SoD)**. SoD is accounting/audit control principle from 1970s, NIST SP 800-53 AC-5 formalizes. Splitting log-storage account (Log Archive) from log-analysis account (Audit), not putting workloads on Management (billing-only) — all SoD's cloud implementation.

> 📚 **Case study**: **Capital One (July 2019)** — SSRF flaw → EC2 metadata → overpowered IAM Role credentials stolen → 106M records leaked. Root causes: WAF misconfiguration + excessive S3 permissions, but post-analysis: "data account and app account insufficiently separated; one Role accessed too many buckets." Post-incident, AWS launched IMDSv2 (2019), strengthened SRA account separation. Lesson: narrow account·Role boundaries = single credential theft → limited blast radius.

## Different Clouds' Multi-Account/Org Governance

Pro tests AWS only, but comparison clarifies concepts.

| Concept | AWS | Azure | GCP |
|---------|-----|-------|-----|
| Isolation unit | **Account** | Subscription | Project |
| Org root | Organization | Tenant (Entra ID) | Organization |
| Grouping layer | **OU** | Management Group | Folder |
| Policy guardrail | **SCP / RCP** | Azure Policy | Org Policy Constraints |
| ID integration | IAM Identity Center | Entra ID (native) | Cloud Identity |
| Auto Landing Zone | Control Tower | Landing Zone (CAF) | Landing Zone (Fabric) |

> 🔍 **Going deeper**: Biggest structural difference: **AWS accounts = "separate billing·quota·resource namespace" as 1st-class isolation boundary**. Azure Subscription similar, but Entra ID manages identity natively across tenant, so IDC-like layer less necessary. GCP Project is lightest, "per-resource project" pattern common. AWS SCP is "OU-attached default-deny ceiling," Azure Policy is "resource-property-evaluating audit/deny rule" — evaluation model itself differs. Azure Policy closer to Config Rule (Detective) than SCP (Preventive).

## Week 2 One-Liners: 30 Total

### Organizations (1-8)

1. Multi-account 4 motivations: **isolation (Blast Radius) · billing · regulation · operations**.
2. Management account = **billing·Org-only**, no workloads. SCP doesn't apply.
3. Management root: hardware MFA + sealed password + separate email alias.
4. OU = "common SCP unit", not org chart. SRA standard: Security/Infrastructure/Workloads/Sandbox.
5. Prod/Non-Prod = must separate accounts — same IAM mistake hits Prod.
6. PCI/HIPAA/SOX workloads = separate accounts — narrow audit scope.
7. `CreateAccount` API async. Must poll with `DescribeCreateAccountStatus`.
8. Trusted Access + Delegated Administrator delegates security tools to Audit account.

### SCP (9-16)

9. SCP = **no permission grant**, ceiling only. Intersects with IAM policy.
10. **Explicit Deny beats every Allow**. One line ends it.
11. **Deny-list standard** (FullAWSAccess + specific Deny). New services auto-allow.
12. Region-restrict SCP: global services (IAM, Org, Route53, CloudFront, GA, WAF) NotAction exceptions REQUIRED.
13. CloudTrail·GuardDuty·Config disable-block SCP = standard baseline.
14. MFA force: use `BoolIfExists`, not `Bool` (`Bool` doesn't match when key missing).
15. PolicyStaging OU validate, then attach to main — dry-run substitute.
16. **RCP** (2024) Resource-side restriction, OU-wide external-Principal block.

### Control Tower (17-22)

17. **Landing Zone = multi-account governance baseline**, Control Tower auto-builds 1h.
18. Core OU = Log Archive + Audit. Log Archive S3 = **Object Lock (WORM)**.
19. Guardrail 3-type: **Preventive (SCP) / Detective (Config) / Proactive (CFN Hook)** — defense in depth time-axis.
20. Mandatory (can't disable) / Strongly Recommended (disable OK) / Elective (optional).
21. **AFT = Terraform GitOps**, **CfCT = CloudFormation extension**, **Account Factory = console standard**.
22. Drift Detection hourly baseline-vs-actual comparison. Update Landing Zone to restore.

### IAM Identity Center (23-30)

23. Multi-account SSO standard. Free.
24. Permission Set map → each account auto-creates `AWSReservedSSO_*` Role.
25. Okta/Azure AD/Entra/Google → **SCIM** auto user·group sync (RFC 7644).
26. **IDC = employees·admins / Cognito = customer users** — never confuse.
27. CLI v2 SSO uses device authorization grant (OIDC), browser auth then auto token renew.
28. ABAC + IDC: user attribute → Role session tag → resource tag match. 100+ projects explosion prevention.
29. Admin session 1h, dev 4h, readonly 8h — break-glass pattern.
30. Consolidated Billing: RI/SP share ON default, split per-dept OFF or Cost Tag.

> 💡 **Related theory**: Line 25: SCIM is **RFC 7644 (System for Cross-domain Identity Management)** standard; auth protocol SAML 2.0 is OASIS; IDC CLI uses **RFC 8628 (OAuth 2.0 Device Authorization Grant)**. Exam: "auto-sync 50 Okta accounts" = SCIM (provisioning), "login flow" = SAML (authentication). **Provisioning (SCIM) ≠ Authentication (SAML)** — separate them in answers.

## Multi-Account 4-Layer Thinking Method

When solving Domain 1 scenarios, check 4 layers top-down. Missing elements reveal.

```
┌──────────────────────────────────────────────────┐
│ Layer 1: Org   "How accounts grouped?"           │
│   - OU design (Security/Infra/Workloads/Sandbox) │
│   - Management isolated                          │
│   - Auto account creation (Factory / AFT)        │
├──────────────────────────────────────────────────┤
│ Layer 2: SCP   "OU-level forbidden?"             │
│   - Region restrict, root block, MFA force       │
│   - CloudTrail·GuardDuty disable-block           │
│   - Sandbox: expensive instance Deny             │
│   - RCP: external Principal block                │
├──────────────────────────────────────────────────┤
│ Layer 3: CT    "Guardrails what?"                │
│   - Preventive (SCP auto-attach)                 │
│   - Detective (Config auto)                      │
│   - Proactive (CFN Hook)                         │
│   - Log Archive Object Lock + Audit Master       │
├──────────────────────────────────────────────────┤
│ Layer 4: IDC   "Employee access how?"            │
│   - External IdP (Okta/Azure AD) + SCIM          │
│   - Permission Set + session length              │
│   - ABAC (large projects)                        │
│   - break-glass pattern                          │
└──────────────────────────────────────────────────┘
```

> 🔍 **Going deeper**: 4-layer mirrors **actual permission eval order**. Request arrives → (1) all parent OUs' SCP ∩ evaluated top-down, (2) RCP (resource-side), (3) Permission Boundary, (4) Identity + Resource + Session policy comprehensive. Any explicit Deny = instant reject, no Allow anywhere = reject (default-deny). Layer 1-2 set "OU ceiling", Layer 4 IDC Permission Set sets "actual grant within ceiling". "SCP doesn't block but employee can't access" = check Permission Set. "Permission Set grants but still blocked" = suspect parent SCP.

## Antipatterns: 5 That Spawn Wrong Answers

> ⚠️ **Pitfall**: Domain 1 offers "sounds-plausible-but-antipattern" choices. Memorize 5 to accelerate elimination.
>
> 1. **OU mapped to org chart (departments) directly** — OU is "common SCP unit", not people org. Sales·HR departments as OUs fragment SCP meaninglessly.
> 2. **Workloads or IAM User ops on Management** — no SCP protection if breached.
> 3. **IAM User per account, manually managed** — IDC + SCIM standard. 50 accounts = 50x burden.
> 4. **SCP as permission-grant** — SCP in Allow doesn't grant. IAM policy still needed.
> 5. **Governance only via Config Rule (Detective)** — post-detection. Regions·encryption enforcement = Preventive (SCP) or Proactive (CFN Hook).

> 🎯 **Scenario**: "Startup: single account Prod·Dev·CI/CD·data all mixed. Security says multi-account. First step best?" — Answer: **Control Tower Landing Zone setup, ingest existing single account into Workloads OU, gradually split Prod/Dev/Security/Log/Audit.** All-at-once fails. Migrate-account-by-account (7R "re-platform" view). Account Factory auto-create new baseline-equipped accounts = key.

## 12-Scenario Questions (Pro Difficulty)

---

**문제 1.** 5 OUs·100 accounts. Some OUs forbid unauthorized regions. Best?

A) Lambda mass-deploy region-restrict IAM policy to all Roles, reapply periodic
B) Org SCP + `aws:RequestedRegion` Deny + global service NotAction exceptions
C) Unauthorized region subnets NACL all-outbound Deny
D) Config Rule(`region-restrict`) OU-wide, SNS alert security

**정답: B**

해설: SCP pre-enforces. Config post-detects. Lambda mass-deploy has ops burden, misses root. Global service exceptions (IAM/Org/Route53/CloudFront/GA/WAF) REQUIRED or OU non-functional. 4-layer: this is Layer 2 (SCP), A wrongly pulls Layer 4 (Identity) — IAM policy can't cover root+future Roles comprehensively.

---

**문제 2.** New OU created, FullAWSAccess SCP removed, Allow-list EC2 only. S3 call result?

A) Allowed — S3 global service, regional SCP scope outside
B) Denied (implicit SCP Deny, no S3 Allow in SCP)
C) Allowed — bucket Resource Policy `Allow` overrides implicit SCP Deny
D) Allowed — account IAM Policy `Allow` prioritized over SCP

**정답: B**

해설: SCP ceiling. No action listed = IAM policy irrelevant. Resource Policy doesn't override SCP. Line 9 (Week 2 one-liner 9): SCP is ceiling, intersection with IAM.

---

**문제 3.** Okta + 50 AWS accounts + console/CLI SSO. Most appropriate?

A) Okta per-account SAML 50x, federated Roles manual mapping
B) IAM Identity Center + Okta (SAML + SCIM)
C) Cognito User Pool employees, Identity Pool IAM Roles
D) AD Connector Okta link, IAM User per account per employee

**정답: B**

해설: Multi-account SSO = IDC. SCIM(provisioning RFC 7644) + SAML(authentication). 50 accounts batch management. C = customers (Cognito). A = 50x work + no sync. D = antipattern 3 (IAM User per account).

---

**문제 4.** New account auto-create + standard baseline (CloudTrail, IAM Role, tags). Terraform. Best?

A) Account Factory console, manual baseline after
B) AFT (Account Factory for Terraform)
C) CfCT CloudFormation template auto-deploy to new accounts
D) StackSets baseline resource deploy all accounts

**정답: B**

해설: Terraform IaC = AFT. GitOps PR merge → auto account + baseline. C(CfCT) CloudFormation. D(StackSets) resource deploy but account vending pipeline missing. AFT = Account Factory + Step Functions + 4 Terraform pipelines (global/account customizations).

---

**문제 5.** Policy: all EBS KMS-encrypted. Block at deploy time. Which guardrail?

A) Detective — Config Rule (`encrypted-volumes`) detect, auto-remediate post
B) Proactive (CloudFormation Hook)
C) Preventive — SCP `ec2:CreateVolume` with `ec2:Encrypted=false` Deny
D) Tag Policy enforce encryption tag

**정답: B**

해설: Deploy-time block = Proactive(CFN Hook). Preventive(SCP) `ec2:CreateVolume` Deny also valid, but CFN Hook cleanest for IaC flow. Declarative Policy(2024) also option. Standard = Preventive + Proactive + Detective triple defense.

---

**문제 6.** 100 accounts' CloudTrail logs immutable single place. Best?

A) Each account self-managed bucket, IAM Policy removes delete
B) Log Archive + S3 Object Lock(WORM) + Organization Trail
C) CloudWatch Logs all accounts, forever retention
D) S3 aggregate, Athena query change detection

**정답: B**

해설: Log Archive pattern + Object Lock(Compliance mode) = standard. Root can't delete during retention (21 CFR Part 11, SEC 17a-4, SOX). Organization Trail = auto-capture from new accounts. Log Archive vs Audit split = SoD.

---

**문제 7.** Dev OU: developer free experiment. Cost runaway risk. Best?

A) Workloads OU include
B) Sandbox OU + SCP(p4/p5/x2 expensive Deny) + Budgets Alert + auto Lambda cleanup
C) Management IAM User
D) Direct Connect + separate VPC

**정답: B**

해설: Sandbox OU pattern + cost guardrails + auto-cleanup. Month-old unused resource auto-delete standard. A = experiment isolation insufficient, C = antipattern 2 (Management workload), D = network tool.

---

**문제 8.** CFO: split billing by department. Best?

A) Consolidated Billing + department OU + Cost Allocation Tag + Cost Explorer per-department
B) Separate Org per department
C) Remove Linked Account
D) Trusted Advisor

**정답: A**

해설: Org + tag-based cost split standard. Cost Allocation Tag activate, tag all resources `CostCenter`, `Department`. Tag Policy enforce tagging. B(Org split) loses RI/SP share benefit, fragments governance. A = Layer 1 (Org structure) + billing integration.

---

**문제 9.** CloudTrail disabling guarantee. Best?

A) All accounts' IAM: remove `cloudtrail:StopLogging`, auto-reapply periodic
B) SCP: `cloudtrail:StopLogging`, `DeleteTrail`, `UpdateTrail` explicit Deny
C) Trail S3 bucket NACL CloudTrail API traffic Deny
D) WAF console/API CloudTrail disable-attempt rule block

**정답: B**

해설: SCP Deny unbreakable. Post-Equifax(2017), NIST CSF, PCI-DSS v4.0(2022) mandate log immutability. Standard baseline SCP. A misses root+future Roles = gaps.

---

**문제 10.** Org just joined, need Landing Zone fast, Audit·Log auto-standard. Best?

A) CFN/SCP/Config direct multi-month self-build
B) Control Tower
C) Service Catalog account·baseline portfolio self-service
D) Trusted Advisor security·resilience checks manual standard apply

**정답: B**

해설: Control Tower 1h Landing Zone auto. Log Archive·Audit auto, guardrails auto, SRA baseline. C(Service Catalog) is internal Control Tower Account Factory tool, not standalone Landing Zone. D(Trusted Advisor) advisory, doesn't build.

---

**문제 11.** SaaS: company-external Principal access NO OU S3 buckets. One policy one-place block. Best?

A) Per-bucket Bucket Policy script
B) Lambda monitor
C) RCP (`aws:PrincipalOrgID != o-xxxx` Deny) OU-attach
D) GuardDuty alert

**정답: C**

해설: RCP(2024 Resource-side) one place = all OU resources. Post-2017 S3 public accidents prevent structurally. SCP = Principal-side, RCP = Resource-side complement. A = bucket count risk, B/D = detect only.

---

**문제 12.** 100 projects, separate S3/EC2. User accesses only own-project. RBAC = 100 Role explosion. Solution?

A) 100 Permission Set IDC define
B) ABAC + IDC: IdP attribute → session tag → resource tag match
C) 100 OU
D) 100 account

**정답: B**

해설: ABAC(NIST SP 800-162) standard. IdP user attribute(Project) → session tag → resource tag match. One policy = 100 projects handled. New project = attribute set, no policy edit. A/C/D = linear ops burden — RBAC explosion problem unsolved.

## Summary

Week 2 tackled Domain 1's 4 essentials deeply. Organizations group accounts, SCP set ceiling, Control Tower auto-govern, IDC unify employee access — standard stack. Added: (1) 7-8 year historical layering, (2) account boundary is cloud's strongest fault containment, (3) Capital One·Equifax accidents → account split + SCP/RCP solutions, (4) Azure Management Group·GCP Folder contrasts.

Next week: **Advanced Networking** (Week 3). VPC Peering vs Transit Gateway (thousands VPC), Direct Connect failover + LAG, Site-to-Site/Client VPN, PrivateLink, Network Firewall — SAA's light networking re-examined at Pro depth. "Thousands VPC, how connect?" scenarios enter in full.

Retry today's 12 questions, check failures against **4-layer thinking** (Org → SCP → CT → IDC) to find gaps. Exam room signal = hand auto-draws 4-layer on paper. Domain 1 passing relies on that structural instinct.

---

## 📌 Next Week Preview

**Week 3: Advanced Networking**
- VPC Peering vs Transit Gateway (thousands VPC environment)
- Direct Connect dual failover + LAG + Resilience
- Site-to-Site VPN, Client VPN
- PrivateLink, VPC Endpoint, Service Endpoint
- Network Firewall, GWLB, Resolver
