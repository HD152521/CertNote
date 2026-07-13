# Day 1 - AWS Organizations: A New Unit of Thought for Multi-Account Architecture

Almost every company starting to use AWS goes through the same path. At the beginning, there is **just one account**. A handful of developers all log into the same root account via the console and create EC2 instances and spin up RDS databases. As the team grows, IAM Users are created, then IAM Groups. Then the security team says "you can't keep production and development in the same account." So a separate development account and production account are created. Over time, those two become five, then forty, then a hundred. And at some point, IAM policy conflicts, inability to split costs by department, and security incidents spreading from one account to another all hit at the same time.

Before AWS Organizations went GA in 2017, all of this was **an operational problem that customers had to solve themselves**. Netflix managed 100+ accounts with their own tool Cloudaco, and Capital One created [Cloud Custodian](https://cloudcustodian.io/). Then in 2017, AWS began providing a standard API for "grouping multiple accounts into a single management unit." That's Organizations. And that's where Domain 1 of SAP-C02 (26%) starts.

Today we begin with the fundamental question "why multi-account?" and then move through Organizations' structure, OU design standards, Management account risks, and account automation. If you see a question in the Pro exam asking "how do I group N accounts?", this thinking tool should immediately come to mind.

## Why Multi-Account: 4 Motivations and Their Depth

The need for multi-account is not simply "accounts are cleaner when split." Four distinct dimensions operate simultaneously.

| Motivation | Single-Account Problem | Multi-Account Benefit | Academic/Practical Background |
|-----------|----------------------|----------------------|--------------------------------|
| **Isolation (Isolation)** | A single workload mistake affects everything | Blast radius containment | Bulkhead pattern (Hystrix) |
| **Billing (Billing)** | Tracking costs by department/project is difficult | Account = natural billing unit | FinOps Foundation recommendation |
| **Compliance & Audit (Compliance)** | Data mixing | Narrow audit scope (PCI·HIPAA) | NIST SP 800-53 AC-4 |
| **Operations (Operations)** | IAM policy complexity explodes | Simplify at account level | DDD Bounded Context |

> 💡 **Related theory**: **Blast Radius** is a term established by Netflix's Chaos Engineering team. When Netflix Chaos Monkey randomly kills instances, "blast radius" measures "how many users does one instance death affect." The account is the strongest barrier to this radius — at the AWS account boundary, IAM, networking, and API calls are all blocked. The same philosophy was formalized as the **Bulkhead Pattern** in Michael Nygard's *Release It!* (2007). Like a ship's bulkhead, if one compartment floods, others survive.

> 💡 **Related theory**: **Bounded Context** is a core concept from Eric Evans' *Domain-Driven Design* (2003). When different domain models mix in the same codebase, semantic conflicts occur (Order is an invoice to the billing team but a shipping unit to logistics). BC's essence is to isolate code and data by domain. An AWS account is **infrastructure-level Bounded Context**. If the billing domain and logistics domain share the same account, IAM policies grow bloated considering both. Splitting accounts keeps each account's IAM simple.

> 🔍 **Going deeper**: The power of the AWS account boundary is implemented explicitly at the API level. An IAM User in one account **fundamentally cannot see** resources in another account by default. To see them requires passing through three gates: (1) Cross-Account Role + (2) Resource Policy + (3) STS AssumeRole. By contrast, within the same account, a single misconfigured IAM policy can grant access to another team's resources. That's why isolation like "Dev/Prod separation" is enforced **through account separation**, not IAM.

> 📚 **Case study**: In the 2019 Capital One breach, if prod and staging had been in different accounts, an attacker with staging's IAM Role could never access prod S3. Because they shared an account, one EC2 IAM Role gave access to production data. After the incident, Capital One built an "**Account Vending Machine**" to split every workload group into a separate account. This philosophy is now reflected in AWS Control Tower's Account Factory.

## AWS Organizations Structure: 3 Layers of Root, OU, Account

```
Root
 ├── Management Account (billing·Org management, no workloads)
 ├── OU: Security
 │    ├── Log Archive (CloudTrail S3 storage, Object Lock)
 │    └── Audit (Security Hub, GuardDuty Master)
 ├── OU: Infrastructure
 │    ├── Network (TGW, DNS, Direct Connect, Route 53)
 │    └── Shared Services (CI/CD, ECR, AD, CodeArtifact)
 ├── OU: Workloads
 │    ├── OU: Prod (N accounts)
 │    └── OU: Non-Prod (N accounts)
 ├── OU: Sandbox (free experimentation, cost·service limits)
 ├── OU: PolicyStaging (SCP testing)
 └── OU: Suspended (accounts pending closure)
```

- **Management Account**: The billing account that created the Organization. No workload deployment (security·isolation).
- **Member Account**: Regular accounts that live inside OUs.
- **OU (Organizational Unit)**: Container for accounts. Maximum 5 levels of nesting.

> 🔍 **Going deeper**: OUs can nest up to 5 levels, but in practice 3+ levels is rare. AWS SRA (Security Reference Architecture) recommendation is 2-3 levels. Example: Root → Workloads → Prod → App-A-Prod account (3 levels). Deeper nesting increases SCP evaluation cost and operational complexity.

> 🔍 **Going deeper**: Organizations' backend is **Eventually Consistent**. SCP changes may take minutes to propagate to all accounts. Don't expect immediate effect after seeing an `attachPolicy` event in CloudTrail. In the Pro exam, "SCP attached directly must block Lambda immediately" is often a trap.

> ⚠️ **Pitfall**: SCPs do not apply to Management accounts (intentional). The root user in Management can delete the Organization itself—nothing SCPs can prevent. Standard practice is (1) enforce MFA hardware token on root, (2) use root-exclusive email as a separate alias, (3) set password recovery to impossible and seal it away.

## OU Design Standard: 5 Core OUs from AWS SRA

AWS's official SRA recommends these 5 OUs as the foundation.

| OU | Role | Representative Accounts Inside |
|----|------|--------------------------------|
| **Security** | Audit·log·security tool master (required) | Log Archive, Audit, Security Tooling |
| **Infrastructure** | Networking·shared services | Network, Shared Services |
| **Workloads** | Actual business (Prod/Non-Prod split) | App-A-Prod, App-B-Prod |
| **Sandbox** | Developer experimentation (restricted SCP) | Developer Personal |
| **PolicyStaging** | SCP testing (optional) | Policy Test |

> 💡 **Memory tip**: OU is not "organizational chart" but **"common policy unit"**. Group accounts by which SCP will apply to them. Copying the company org chart (Sales·Dev·HR departments) directly to OUs means almost no common policies between OUs, making SCP pointless.

> 🎯 **Scenario**: "A global financial company operates in three regions: US, EU, APAC, each with separate regulation (SOX, GDPR, PCI-K). How should we design OUs?" — Answer: **Region OUs (US/EU/APAC) + Prod/Non-Prod nesting inside each**. Common SCP (e.g., GDPR data sovereignty) applies only to the EU OU. PCI-DSS spans all regions' payment workloads, so it could be a separate PCI OU. Key: group by unit where common SCP applies.

## Account Separation Decision: When to Split and When to Merge

| Criterion | Split Recommended? | Reason |
|-----------|-------------------|--------|
| Environment (Prod/Stg/Dev) | ✅ Strongly yes | Blast radius, IAM separation |
| Business Unit (BU) | ✅ Yes | Billing·governance, BU accountability |
| Data Classification (PII·PCI·HIPAA) | ✅ Yes | Regulatory isolation, narrow audit scope |
| Microservice (5 services) | ❌ Overkill | Same account OK, separate with IAM Role |
| Microservice (100 services) | ⚠️ Partial split | Group by domain (e.g., Payment, Inventory) |
| Region | ❌ Don't split | Accounts are global, pick regions within one account |

> 🔍 **Going deeper**: "One account per microservice" is common over-engineering. 100 services = 100 accounts leads to (1) IAM Identity Center Permission Set explosion, (2) Cross-Account calls everywhere, (3) CloudTrail Org Trail event noise. Even big tech like Netflix and Amazon group by domain (Bounded Context) and separate services within each domain using IAM Role. On the Pro exam, "microservice per account" is usually a trap.

> 📚 **Case study**: Capital One scaled to roughly **2,500 accounts** (as of 2022). But all were auto-created by a vending machine, had consistent baselines, and were IaC-managed in SCM. So despite many accounts, operational burden is light because of **automation**. Without automation, more accounts mean the ops team collapses.

## Management Account Risk and Isolation Pattern

The Management account is the Organization's headquarters. If compromised, all member accounts are at risk. It has the highest security demands.

| Item | Standard Guideline |
|------|-------------------|
| Workload deployment | **Never** |
| Root email | Company group alias (not personal email) |
| Root MFA | Hardware token (YubiKey etc.) |
| Root password | Seal and store in vault |
| IAM User | Minimize, prefer IAM Identity Center |
| Logging | CloudTrail all regions + send to Log Archive |
| Billing access | Separate with Billing IAM Policy |

> ⚠️ **Pitfall**: SCP doesn't apply to Management accounts. Billing rolls up to Management, but policies are members-only. On the Pro exam, "block unauthorized regions in Management via SCP" is a 100% trap.

> 🔍 **Going deeper**: In 2022, AWS strengthened Organizations' trust model for GovCloud / China Regions / separate partition environments. Patterns emerged: move Management IAM Users to a separate partition or automate break-glass procedures. Some enterprises enforce Management account **dual sign-in** (two-person rule) + all actions sent via SNS to the security team. Like nuclear launch procedures with dual control.

## New Account Auto-Creation: 4 Options

| Method | Features | Best For |
|--------|----------|----------|
| **Org console manual creation** | Clicks only | Small org (accounts < 20) |
| **Account Factory (Control Tower)** | Standard guardrails·logging auto-setup | Mid/large org |
| **AFT (Account Factory for Terraform)** | IaC-based, GitOps | Terraform-using org |
| **API: `CreateAccount`** | Custom automation | Self-built vending machine |

> 🔍 **Going deeper**: `CreateAccount` API is async. The call returns only `CreateAccountRequestId`; actual creation takes minutes to hours in the backend. Must poll with `DescribeCreateAccountStatus`. Bulk-creating 100 hits quota throttling; SQS + Step Functions to serialize is the standard pattern.

## Consolidated Billing: Effects of Payment Integration

| Effect | Description |
|--------|-------------|
| **Single invoice** | CFO·accounting simplification |
| **Volume discount aggregation** | All accounts' usage pooled for tier discounts (S3 storage tiers etc.) |
| **RI·Savings Plans sharing** | Management/Org-level share; unused SP used by other accounts |
| **Data transfer tier discount pooling** | Full outbound pooled for tier discount |

> 💡 **Memory tip**: Automatically applied on Org join. No extra setup. RI/SP sharing requires **Linked Account Sharing** option on (default is ON).

> ⚠️ **Pitfall**: Cost Explorer is only fully visible from Management. Member accounts see only their own. To split costs by department, **Cost Allocation Tag** must be enabled and tagged on all resources.

## Trusted Access and Delegated Administrator

Certain AWS services (CloudFormation StackSets, GuardDuty, Security Hub, Config, IAM Access Analyzer, etc.) need **"Trusted Access"** enabled to operate at the Org level. Then **Delegated Administrator** can be appointed.

> 🔍 **Going deeper**: Delegated Administrator reduces Management's burden of operating security tools. Example: Management handles only billing; Audit account becomes GuardDuty Delegated Admin to collect threat detection results from all members. This separation of billing and security responsibilities is key.

## CLI Direct Look

```bash
# Create Org (once, in Management account)
aws organizations create-organization --feature-set ALL

# Create OU
aws organizations create-organizational-unit \
  --parent-id r-xxxx --name Workloads

# Create new account (async)
aws organizations create-account \
  --email prod-app-a@example.com \
  --account-name "App-A-Prod"

# Poll creation status
aws organizations describe-create-account-status \
  --create-account-request-id car-xxxxx

# Move to OU
aws organizations move-account \
  --account-id 111111111111 \
  --source-parent-id r-xxxx \
  --destination-parent-id ou-yyyy

# View full Org structure
aws organizations list-roots
aws organizations list-organizational-units-for-parent --parent-id r-xxxx
aws organizations list-accounts-for-parent --parent-id ou-yyyy
```

## Summary

The picture we've drawn today is threefold. First, multi-account is a tool solving **4 distinct dimensions simultaneously: isolation, billing, compliance, operations**. Second, Organizations operates on a **3-layer hierarchy of Root → OU → Account**, and OUs group by common policy, not org chart. Third, Management accounts hold billing and Org management only—never deploy workloads—and new accounts are automated via Account Factory (or AFT).

This threefold vision is the starting point of Domain 1. Next we explore **Service Control Policy (SCP)** attached atop OUs. SCP is the most frequently appearing single topic in the Pro exam, and understanding "it's a ceiling, not a grant" is half the battle.

---

## 📝 연습 문제

**문제 1.** A fintech company needs PCI-DSS certification and wants to isolate payment workloads. What problem occurs if they keep payment, HR, and logistics workloads in the same AWS account and separate them only with IAM Roles?

A) EBS snapshot costs per account roughly double, increasing monthly billing
B) Audit scope expands to entire account, causing PCI certification cost explosion
C) RDS Multi-AZ configuration is prohibited for accounts with PCI workloads
D) IAM User quota depletes quickly proportional to cardholder data volume

**정답: B**
해설: PCI-DSS considers any system touching cardholder data in audit scope. Mixing PCI and non-PCI in one account makes entire account subject to audit, exploding cost/time. Separate accounts mean only that account needs audit. Same principle applies to HIPAA, SOX. Trade-off: account separation ops burden < audit savings.

---

**문제 2.** Which statement about Management accounts is correct?

A) All workloads should be deployed to Management to centralize billing
B) SCP attached to Org root automatically applies strongly to Management
C) It's the billing master and workload deployment is forbidden by standard guideline
D) Same SCP inherited from Member accounts applies identically to Management

**정답: C**
해설: Management is billing·Org-only. Workloads go to member accounts. SCP doesn't apply to Management (intentional). Compromise = all members at risk, so root MFA hardware token·email alias required.

---

**문제 3.** What's the biggest risk of keeping Prod and Dev in the same account?

A) NAT Gateway·data transfer costs aggregate, increasing monthly billing
B) Dev mistake affects Prod (blast radius)
C) Dev/Prod permissions mix in one account, making IAM policy simplification difficult
D) Same account prevents region-split deployment

**정답: B**
해설: Account = strong isolation boundary. Netflix Chaos Engineering's blast radius concept. Dev/Prod in same account: IAM policy mistake lets Dev User reach Prod resource. Capital One breach core lesson also stems from account isolation gap.

---

**문제 4.** To immutably store 100 accounts' CloudTrail logs in one place?

A) Apply bucket policy + Versioning to each account S3 bucket individually
B) Log Archive account + S3 Object Lock + Organization Trail
C) Store in each account CloudWatch Logs with indefinite retention
D) Leave logs and query directly with Athena as needed

**정답: B**
해설: Log Archive account + Object Lock (WORM, Write Once Read Many) is standard. Organization Trail, once enabled, auto-streams all member CloudTrail to same S3. Regulations like 21 CFR Part 11, SOX require log immutability.

---

**문제 5.** How should OUs be split?

A) Map company org chart (Sales·Dev·HR) directly to OUs
B) Split OUs by operation region (us/eu/apac)
C) Group by common policy (SCP)
D) Create OU per developer individual·team

**정답: C**
해설: OU groups accounts by common policy application. Copying org chart directly means almost no common SCP between OUs, making SCP pointless. SRA recommends Security/Infrastructure/Workloads/Sandbox.

---

**문제 6.** Biggest benefit of Consolidated Billing?

A) Security boundary between member accounts strengthens, blocking breach spread
B) RI·Savings Plans sharing + volume discount pooling + single invoice
C) IAM policy unified across member accounts, simplifying permission management
D) Auto-triggered DR failover across all member accounts

**정답: B**
해설: All accounts' usage pooled → RI/SP share, tier discounts. CFO·accounting single invoice. Billing consolidation itself doesn't boost security (needs SCP/CT separately).

---

**문제 7.** Design guideline for OU where developers freely experiment?

A) Include in Workloads OU, apply identical Prod guardrails
B) Sandbox OU + restrictive SCP (deny GPU·expensive instances) + AWS Budgets alert + auto-cleanup Lambda
C) Create experimental IAM User in Management, create resources directly
D) Include in Security OU with logging·audit tools

**정답: B**
해설: Sandbox OU pattern — isolation + cost-control SCP + auto-cleanup. Monthly Lambda purging unused resources is standard. Developer experimentation recommended, but billing mustn't explode.

---

**문제 8.** Global company operates in three regions: US, EU, APAC, each with separate regulation (GDPR, CCPA). OU design?

A) Single OU for all accounts, apply SCP globally
B) Region OUs (US/EU/APAC) + Prod/Non-Prod nesting per region
C) Split OUs per microservice·application
D) Create OU per developer individual·team

**정답: B**
해설: Group by unit where common SCP applies. GDPR only on EU OU. CCPA only on US OU. Common PCI-DSS could be separate PCI OU. Same SCP scope = same OU.

---

**문제 9.** Security team wants to test new SCP. Must not impact production. Recommended pattern?

A) Attach directly to Production OU, monitor with CloudTrail, adjust
B) PolicyStaging OU with 1 test account, attach and validate
C) Dry-run SCP mode in Management account to preview impact
D) Call IAM policy simulator Lambda to pre-simulate SCP effect

**정답: B**
해설: PolicyStaging OU is standard. Combine with AWS Config Conformance Pack to validate SCP effect, then attach to main OU. SCP has no official dry-run mode, so staging OU is the real dry-run.

---

**문제 10.** Company wants to auto-create accounts with Terraform and auto-apply baseline (VPC, IAM, CloudTrail). Best tool?

A) Account Factory console, manually apply baseline
B) AFT (Account Factory for Terraform)
C) CfCT (Customizations for Control Tower, CloudFormation-based)
D) StackSets alone to deploy baseline stacks to all accounts

**정답: B**
해설: AFT aligns with Terraform GitOps flow. Per-account customization possible (network stub, extra IAM Role, tagging). CfCT is CloudFormation-based.
