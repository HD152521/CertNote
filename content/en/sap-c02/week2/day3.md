# Day 3 - Control Tower and Landing Zone: Automating Governance

After Organizations and SCP launched in 2017, one major problem remained: **every time a new account was created, the same tasks had to be repeated.** Enable CloudTrail, enable Config, create baseline IAM Role, attach SCP, configure trail routing to Log Archive, connect Audit account to GuardDuty Master — 30 minutes to an hour per account. Creating 100 accounts meant 100 hours. Miss one step and that account fails PCI audit.

The solution to this problem is the **Landing Zone** concept: automatically building a "baseline infrastructure" for multi-account environments in one go. 2017-2018, AWS provided the [AWS Landing Zone solution](https://github.com/aws-samples/aws-landing-zone-solution) based on CloudFormation. But as a customer-managed solution, updates were difficult and users operated it themselves. In November 2018 at re:Invent, AWS re-created this as a **fully managed** service called **AWS Control Tower**.

Today we cover Landing Zone's essence, Control Tower's components, 3 guardrail types (Preventive/Detective/Proactive), differences between Account Factory and AFT, and Drift Detection. Pro exam "100-account standardization·automation" scenarios almost always have Control Tower as the answer.

## What is Landing Zone: Governance's Baseline

**Landing Zone** = standardized governance, security, audit, logging, and ID integration baseline for multi-account AWS environments.

Tasks needed to build manually:
1. Create AWS Organizations + design OUs
2. Log Archive account + S3 Object Lock + Organization Trail
3. Audit account + Security Hub Master + GuardDuty Master
4. Enable IAM Identity Center + design Permission Sets
5. Write and attach SCPs (region restriction, root block, MFA force, etc.)
6. Config Aggregator + deploy Config Rules everywhere
7. Auto new account creation (CreateAccount API)
8. Standardize baseline IAM Roles, VPC, tags
9. CloudWatch Alarm + SNS notification hub

Done manually takes months. Control Tower builds **everything in ~1 hour**.

> 💡 **Related theory**: Landing Zone's philosophy inspired by Heroku's **"12-Factor App"** (2011). 12-Factor says standardize the environment itself so apps just "land" and work. Applying to cloud infrastructure: "new accounts should be ready immediately for any workload thanks to standardized infrastructure." That's **Platform Engineering** (trend since 2022) in cloud infrastructure.

> 🔍 **Going deeper**: Control Tower's backend is actually a combination of (1) Organizations, (2) Service Catalog, (3) Config, (4) CloudFormation StackSets, (5) IAM Identity Center, (6) CloudWatch Events. AWS bundles it as fully managed, but it's not a new service. You can build the same without Control Tower — that's what **CfCT (Customizations for Control Tower)** and **AFT** leverage.

## Control Tower Components

| Component | Role |
|-----------|------|
| **Management Account** | Org·Control Tower headquarters |
| **Log Archive Account** | CloudTrail Organization Trail + Config Aggregator storage |
| **Audit Account** | Security Hub Master, GuardDuty Master, SNS alert hub |
| **Core OU** | Contains above two accounts, auto-created |
| **Custom OU** | User-defined workload OUs |
| **Account Factory** | Auto-create new accounts + attach guardrails |
| **AWS IAM Identity Center** | SSO auto-enabled |
| **AWS Config Aggregator** | Single view of all accounts' Config data |

> ⚠️ **Pitfall**: After enabling Control Tower, if you **manually change S3 policy in Log Archive account, drift** occurs. Control Tower marks as "deviation from standard" and overwrites on next baseline update. Never touch Log Archive·Audit manually — standard pattern.

## 3 Guardrail Types: Preventive / Detective / Proactive

| Type | Mechanism | When | Example |
|------|-----------|------|---------|
| **Preventive** (prevention) | SCP-based, blocks on violation | API call moment | "S3 public ACL forbidden" |
| **Detective** (detection) | AWS Config Rule, detects violation | After API call | "Unencrypted EBS found" |
| **Proactive** (pre-block) | CloudFormation Hook, blocks before deploy | CFN/CDK deploy time | "Reject unencrypted EBS deploy" |

Another classification (enforcement strength):
- **Mandatory**: Always on (can't disable). Example: Block CloudTrail disable.
- **Strongly Recommended**: Strong recommendation (can disable). Example: S3 public block.
- **Elective**: Optional. Example: Allow only certain EBS types.

> 🔍 **Going deeper**: Three guardrails are **defense in depth** arranged on time axis. (1) Proactive at IaC deploy stage, (2) Preventive at runtime API call stage, (3) Detective at post-monitoring stage. If one layer breaks, next catches. Example: IaC bypass to console → Preventive (SCP) blocks, somehow created → Detective (Config) alerts in 30 minutes.

> 💡 **Related theory**: Defense in Depth is a security philosophy established by NSA in 1990s. Layer multiple different defenses instead of single. NIST SP 800-160 (Systems Security Engineering) formalizes this. Control Tower guardrails 3-type is cloud's cleanest implementation.

> 🎯 **Scenario**: "Company needs PCI-DSS: all EBS KMS-encrypted. (1) CloudFormation deploy, (2) Console direct create, (3) existing unencrypted EBS must alert. Guarantee?" — Answer: **All 3 guardrails active**. Proactive CFN Hook blocks deploy, Preventive SCP blocks RunInstances, Detective Config Rule scans existing. All three are one set.

## Account Factory Auto-Deployment Flow

```
User requests in Account Factory (console or API)
   │
   ▼
New AWS account created (auto email·OU placement)
   │
   ▼
Baseline applied:
  - CloudTrail (auto Organization Trail link)
  - AWS Config Recorder enabled
  - IAM Identity Center Permission Set mapping
  - Standard IAM Role (e.g., AWSControlTowerExecution)
   │
   ▼
Guardrails auto-attached (SCP + Config Rule)
   │
   ▼
IDC Permission Set auto-mapped (e.g., AWSAdministratorAccess)
   │
   ▼
User notified (account ID + login URL)
```

> 🔍 **Going deeper**: Account Factory internally uses Service Catalog. "Create new account" is a Service Catalog Product, Provisioning triggers CloudFormation StackSet execution. Only Service Catalog-authorized users can create accounts — different from directly calling `CreateAccount` from Org.

## AFT (Account Factory for Terraform)

- **Terraform-based IaC** for account creation automation.
- Per-account customization (network stub, tags, additional IAM Roles).
- Works well with GitOps workflow.

```
[Git Repo] ─ PR merge ─→ [CodePipeline]
                            │
                            ▼
                       [AFT Modules]
                            │
                            ▼
                       [Control Tower Account Factory]
                            │
                            ▼
                       [New Account + Custom Baseline]
```

> 🎯 **Scenario**: "Fintech launches 200 new microservices yearly. Each service = separate AWS account. Standard baseline (VPC stub, IAM Role, tags) + GitOps. Best tool?" — Answer: **AFT**. Terraform-based GitOps flow standard. PR requests new account → AFT auto-creates + baseline. Same pattern at Capital One·HashiCorp large orgs.

## CfCT (Customizations for Control Tower)

- CloudFormation-based extension.
- Triggered by lifecycle events (e.g., account registration) to deploy extra StackSets·SCPs.
- Lighter than AFT, CFN-only.

| Tool | Base | GitOps | Fit |
|------|------|--------|-----|
| Account Factory (console) | Service Catalog | ❌ | Small org |
| AFT | Terraform | ✅ | Terraform users |
| CfCT | CloudFormation | Partial | CFN users |

## Drift Detection

Control Tower auto-detects deviation from standard baseline:
- SCP changes outside OU
- Log Archive S3 policy changes
- IDC Permission Set changes
- Account Factory baseline changes

On detection: console alert + optional Lambda auto-remediation.

> 🔍 **Going deeper**: Drift Detection backend is CloudFormation StackSet drift detection + separate Lambda monitoring. Hourly comparison: baseline state vs actual state. On difference, displayed in "Landing Zone Drift" section of Control Tower console. Auto-remediation is OFF by default — must manually run "Re-register Account" or "Update Landing Zone" to restore to baseline.

> ⚠️ **Pitfall**: When creating OU in Control Tower, must create in Control Tower console. Creating in Organizations console → Control Tower doesn't recognize it → guardrails don't auto-attach. "Control Tower-registered OU" vs unregistered OU difference appears in exams.

## Direct Build vs Control Tower

| Item | Manual | Control Tower |
|------|--------|---------------|
| Build time | Months | 1 hour |
| Maintenance | Self-managed | AWS auto-updates |
| Customization | Flexible | Needs AFT/CfCT |
| Cost | Free (config cost) | Config + CT guardrail cost |
| Learning curve | Low (individual services) | Medium (CT concepts) |
| Best practices | Self-research | AWS SRA-based |

> 💡 **Pro answer pattern**: "100 accounts·standardization·auto-create" → **Control Tower**. "Apply Landing Zone to running Org" → **Control Tower can ingest existing Org**. "Terraform GitOps" → **AFT**. "CloudFormation" → **CfCT**.

## Summary

The picture today is threefold. First, **Landing Zone** is multi-account governance's baseline, Control Tower auto-builds it in 1 hour. Second, **3-guardrail types** (Preventive/Detective/Proactive) operate as defense in depth on time axis. Third, **Account Factory/AFT/CfCT** are three new-account automation options, choice depends on IaC tool.

Next article explores **IAM Identity Center** that Control Tower auto-enables. Permission Set, SCIM sync, external IdP (Okta·Azure AD) integration — standard multi-account SSO patterns.

---

## 📝 연습 문제

**문제 1.** "Pre-block S3 bucket becoming public" — Strongest guardrail combo?

A) Detective only
B) Preventive (SCP) only
C) Proactive (CFN Hook) only
D) Preventive + Proactive + Detective (triple)

**정답: D**
해설: Defense in depth — Proactive (IaC deploy block), Preventive (API call block), Detective (post-monitor) as one set. One layer breaks, next catches. Prevent structural 2017 Verizon·Accenture S3 public incidents, multi-layer defense essential.

---

**문제 2.** 100-account standardization·auto-create·SCP batch-attach. Most appropriate?

A) CloudFormation StackSets only
B) Control Tower + Account Factory
C) Service Catalog
D) Systems Manager

**정답: B**
해설: Control Tower is multi-account governance standard. Account Factory does auto-create + auto-guardrail attach. StackSets is partial, Service Catalog is general tool.

---

**문제 3.** Existing running Org. Adopt Landing Zone?

A) Must create new Org
B) Control Tower can ingest existing Org (set up)
C) AFT only
D) StackSets only

**정답: B**
해설: Control Tower can set-up on existing Org. Recognizes existing OUs·accounts, adds Log Archive·Audit. Existing workloads stay, governance layer added.

---

**문제 4.** Terraform IaC-based: new account + custom resource auto-deploy. Which tool?

A) CfCT
B) AFT (Account Factory for Terraform)
C) Account Factory only
D) CDK

**정답: B**
해설: AFT is Terraform-based GitOps. CfCT is CloudFormation. CDK is separate tool.

---

**문제 5.** Landing Zone deviates from standard setting. What detects?

A) GuardDuty
B) Control Tower Drift Detection
C) Security Hub
D) Trusted Advisor

**정답: B**
해설: Control Tower Drift Detection hourly compares baseline vs actual. On diff, console alert + Lambda auto-remediation trigger possible. CloudFormation StackSet drift + Lambda monitoring combo.

---

**문제 6.** Control Tower's Detective guardrail uses which service?

A) SCP
B) AWS Config Rule
C) CloudFormation Hook
D) WAF Rule

**정답: B**
해설: Detective = Config Rule, Preventive = SCP, Proactive = CFN Hook. Know backend service mapping for each guardrail type.

---

**문제 7.** Fintech: 200 new microservice accounts yearly. GitOps + Terraform. Best?

A) Account Factory console 200 times
B) AFT + Git Repo + CodePipeline
C) Lambda + CreateAccount API
D) CloudFormation StackSets

**정답: B**
해설: AFT GitOps flow best. PR merge → auto account creation + baseline. Capital One·HashiCorp standard. C is self-build, operational burden high.

---

**문제 8.** In Control Tower, create OU in Organizations console. Result?

A) Normal operation
B) Control Tower doesn't recognize → guardrails don't auto-attach, "unregistered OU"
C) Immediate error
D) Account Factory doesn't work

**정답: B**
해설: Control Tower doesn't recognize. Must create in Control Tower console for "registered OU" status → guardrails auto-apply. Frequent trap.
