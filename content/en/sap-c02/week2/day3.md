# Day 3 - Control Tower and Landing Zone: Automating Governance

Even after Organizations and SCPs appeared in 2017, one big problem remained. **You had to repeat the same work every time you created a new account.** Enabling CloudTrail, enabling Config, creating baseline IAM Roles, attaching SCPs, setting up trail delivery to Log Archive, connecting GuardDuty to the Audit account as the Master — each account took 30 minutes to 1 hour. 100 accounts meant 100 hours. If you accidentally skipped a single step along the way, only that account would fail the PCI audit.

The concept that solves this problem is the **Landing Zone**: automatically building the "reference construct" of a multi-account environment in one go. In 2017-2018, AWS offered the [AWS Landing Zone solution](https://github.com/aws-samples/aws-landing-zone-solution) based on CloudFormation. But it was a customer-managed solution, so it was hard to update and users had to operate it themselves. At re:Invent in November 2018, AWS announced **AWS Control Tower**, which rebuilt it as a **fully managed** service.

Today we cover the essence of Control Tower, the components of a Landing Zone, the 3 guardrail types (Preventive/Detective/Proactive), the difference between Account Factory and AFT, and Drift Detection. Almost every "100 accounts, standardization and automation" scenario in the Pro exam has Control Tower as the answer.

## What Is a Landing Zone: The Reference Point of Governance

**Landing Zone** = the baseline of standardized governance, security, auditing, logging, and identity integration in a multi-account AWS environment.

The work required when you build it yourself:
1. Create AWS Organizations + design the OUs
2. Log Archive account + S3 Object Lock + Organization Trail
3. Audit account + Security Hub Master + GuardDuty Master
4. Enable IAM Identity Center + design Permission Sets
5. Write and attach SCPs (region restriction, root block, MFA enforcement, etc.)
6. Bulk-deploy Config Aggregator + Config Rules
7. Automate new account creation (CreateAccount API)
8. Standardize baseline IAM Roles, VPCs, and tags
9. CloudWatch Alarm + SNS notification hub

Setting all of it up at once takes months. Control Tower builds all of this automatically **within 1 hour**.

The idea of the Landing Zone was inspired by Heroku's **"12-Factor App"** (2011). 12-Factor is the idea of standardizing the environment itself so that an app only has to "land" on an already-prepared environment to work. Applied to cloud infrastructure, the Landing Zone means "the infrastructure must be standardized so that once a new account is created, every workload can run on it immediately." This is the cloud infrastructure branch of **Platform Engineering** (a trend since 2022).

The backend of Control Tower is actually a combination of (1) Organizations, (2) Service Catalog, (3) Config, (4) CloudFormation StackSets, (5) IAM Identity Center, and (6) CloudWatch Events. AWS bundles these as a fully managed offering; it is not a separate brand-new service. So you can build the same result without Control Tower — and that is the foundation that **CfCT (Customizations for Control Tower)** and **AFT** use.

## Control Tower Components

| Component | Role |
|-----------|------|
| **Management Account** | Headquarters of the Org and Control Tower |
| **Log Archive Account** | Stores the CloudTrail Organization Trail + Config Aggregator data |
| **Audit Account** | Security Hub Master, GuardDuty Master, SNS notification hub |
| **Core OU** | Includes the two accounts above, created automatically |
| **Custom OU** | User-defined workload OUs |
| **Account Factory** | Automatic new account creation + guardrail attachment |
| **AWS IAM Identity Center** | SSO enabled automatically |
| **AWS Config Aggregator** | Single view of every account's Config data |

> ⚠️ **Pitfall**: After activating Control Tower, if you **manually go into the Log Archive account and change the S3 policy, drift** occurs. Control Tower flags it as "deviation from the standard" and overwrites it at the next baseline update. Never touch Log Archive or Audit — that is the standard pattern.

## 3 Guardrail Types: Preventive / Detective / Proactive

| Type | Mechanism | When it acts | Example |
|------|-----------|--------------|---------|
| **Preventive** | SCP-based, denies on violation | Right before the API call | "Prohibit public S3 ACLs" |
| **Detective** | AWS Config Rule, detects the fact of a violation | After the API call | "Unencrypted EBS found" |
| **Proactive** | CloudFormation Hook, blocks before deployment | At CFN/CDK deployment | "Reject deployment of unencrypted EBS" |

Another classification (by enforcement strength):
- **Mandatory**: Always on (cannot be disabled). Example: blocking the disabling of CloudTrail.
- **Strongly Recommended**: Strongly advised (can be disabled). Example: blocking public S3.
- **Elective**: Optional. Example: allow only specific EBS types.

The three guardrails are a placement of **defense in depth** along the time axis. (1) Proactive is the IaC deployment stage, (2) Preventive is the runtime API call stage, (3) Detective is the after-the-fact monitoring stage. Even if one stage is breached, the next one blocks. For example, even if someone bypasses IaC and creates the resource directly in the console, Preventive (SCP) blocks it, and even if it somehow gets created, Detective (Config) raises an alert within 30 minutes.

Defense in Depth is a security philosophy that the US NSA established in the 1990s: place several layers of different kinds of defense rather than a single barrier. NIST SP 800-160 (Systems Security Engineering) formalizes it. The 3 Control Tower guardrail types are the cleanest implementation of this philosophy in the cloud.

> 🎯 **Scenario**: "To obtain PCI-DSS certification, a company needs every EBS volume to be KMS-encrypted. (1) When deploying with CloudFormation, (2) when creating directly in the console, and (3) for already-existing unencrypted EBS volumes, an alert must arrive. How do you guarantee this?" — Answer: **enable all 3 guardrails**. Proactive blocks before deployment with a CFN Hook, Preventive blocks at RunInstances time with an SCP, and Detective scans existing resources with a Config Rule. The three are a set.

## Account Factory's Automatic Deployment Flow

```
User requests in Account Factory (console or API)
   │
   ▼
New AWS account created (automatic email, OU placement)
   │
   ▼
Baseline applied:
  - CloudTrail (automatically connected to the Organization Trail)
  - AWS Config Recorder enabled
  - IAM Identity Center permission set mapping
  - Standard IAM Role (e.g., AWSControlTowerExecution)
   │
   ▼
Guardrails attached automatically (SCP + Config Rule)
   │
   ▼
Permission sets automatically mapped in IDC (e.g., AWSAdministratorAccess)
   │
   ▼
User notified (account ID + login URL)
```

Internally, Account Factory uses Service Catalog. "Creating a new account" is defined as a Service Catalog Product, and provisioning leads to the execution of a CloudFormation StackSet. So only users with Service Catalog permissions can create new accounts — this is the difference from calling `CreateAccount` directly in Organizations.

## AFT (Account Factory for Terraform)

- Automates account creation with **Terraform-based IaC**.
- Per-account customization (networking stubs, tags, additional IAM Roles).
- Fits well with GitOps workflows.

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
                       [New account + custom baseline]
```

> 🎯 **Scenario**: "A fintech launches 200 new microservices a year. Each service gets a separate AWS account. It wants a standard baseline (VPC stub, IAM Role, tags) + GitOps. What is the most suitable tool?" — Answer: **AFT**. A Terraform-based GitOps flow is the standard. Request a new account with a PR → AFT creates it automatically + applies the baseline. The same pattern is standard in large organizations such as Capital One and HashiCorp.

## CfCT (Customizations for Control Tower)

- CloudFormation-based extension.
- Triggered by lifecycle events (e.g., account enrollment) to deploy additional StackSets and SCPs.
- Lighter than AFT but limited to CFN.

| Tool | Based on | GitOps | Suitable for |
|------|----------|--------|--------------|
| Account Factory (console) | Service Catalog | ❌ | Small organizations |
| AFT | Terraform | ✅ | Terraform users |
| CfCT | CloudFormation | Partial | CFN users |

## Drift Detection

Control Tower automatically detects changes that deviate from the standard baseline:
- SCP changes made outside the OU
- Log Archive S3 policy changes
- IDC permission set changes
- Account Factory baseline changes

When detected, it gives a console alert, and automatic recovery with Lambda is possible.

The backend of Drift Detection is CloudFormation StackSet drift detection + separate Lambda monitoring. Every hour it compares the baseline state with the actual state. If there is a difference, it is shown in the "Landing Zone Drift" section of the Control Tower console. Automatic repair is OFF by default — you must manually run "Re-register Account" or "Update Landing Zone" to restore the baseline.

> ⚠️ **Pitfall**: When you create an OU in Control Tower, you must create it in the Control Tower console. If you create an OU in the Organizations console, Control Tower does not recognize it, so guardrails are not attached automatically. The difference between a "registered OU" (an OU registered with Control Tower) and an ordinary OU appears on the exam.

## Build It Yourself vs Control Tower

| Item | Build it yourself | Control Tower |
|------|-------------------|---------------|
| Build time | Months | 1 hour |
| Maintenance | Your own | AWS updates automatically |
| Customization | Free | AFT/CfCT needed |
| Cost | Free (only the configuration cost) | Config + CT guardrail costs |
| Learning curve | Low (individual services) | Medium (CT concepts) |
| Best practices | Self-researched | Based on the AWS SRA |

"100 accounts, standardization, automatic new accounts" → **Control Tower**. "Apply a Landing Zone to an already-running Org" → **Control Tower can absorb an existing Org**. "Terraform GitOps" → **AFT**. "CloudFormation" → **CfCT**.

## Architecture Diagram: The Path Logs and Signals Take in a Landing Zone

The substance of "Control Tower builds it in 1 hour" is the wiring below. Once you have this figure in your head, questions of the type "which account should hold what" are solved immediately.

```
                     ┌──────────────────────────────┐
                     │   Management Account         │
                     │   - Organizations / SCP      │
                     │   - Control Tower control    │
                     │     plane                    │
                     │   - IAM Identity Center      │
                     │   Note: no workload deploys  │
                     └───────────┬──────────────────┘
                                 │ Org Trail / StackSets / SCP attachment
        ┌────────────────────────┼─────────────────────────┐
        │                        │                         │
┌───────▼────────┐      ┌────────▼─────────┐     ┌─────────▼──────────┐
│  Core OU        │      │  Custom OU:       │     │  Custom OU:        │
│                 │      │  Infrastructure   │     │  Workloads         │
│ ┌─────────────┐ │      │                   │     │  ┌──────────────┐  │
│ │Log Archive  │◄├──────┼── CloudTrail ─────┼─────┼──┤ Prod acct N  │  │
│ │ S3(Object   │ │      │   Config snapshots│     │  └──────────────┘  │
│ │ Lock, WORM) │◄├──────┼───────────────────┼─────┼──┐               │
│ └─────────────┘ │      │                   │     │  │ ┌────────────┐│
│ ┌─────────────┐ │      │  Network account  │     │  └─┤NonProd acct││
│ │Audit        │ │      │  (TGW·DNS·DX)     │     │    └────────────┘│
│ │ SecurityHub │◄├──────┼── Findings        ┼─────┼──────────────────┘
│ │ GuardDuty   │ │      │   aggregated      │     │
│ │ SNS alert   │ │      └───────────────────┘     └────────────────────┘
│ │ hub         │ │
│ └─────────────┘ │
└─────────────────┘

  ▼ Direction of the data (exam point)
  Logs / evidence   → always one-way to Log Archive (WORM, read-only)
  Findings          → always aggregated in Audit (Delegated Admin)
  Policy / deploys  → always from Management downward (SCP, StackSets)
  Note: the reverse direction does not exist. Log Archive does not control other accounts.
```

The key point is that this structure enforces **Separation of Duties** through the infrastructure. The party that produces logs (workload accounts), the party that stores logs (Log Archive), and the party that looks at logs and makes judgments (Audit) are in different accounts. Even if a workload account is compromised, that account's credentials cannot delete the S3 objects in Log Archive — a double defense of account boundary + Object Lock. It is the accounting principle "separate the person who records an entry from the person who approves it" (SOX 404) carried over into the cloud account structure.

Do not mistake the Audit account for an "all-purpose account used by the security team." The Audit account only serves as the **Delegated Administrator** of GuardDuty and Security Hub and as the notification hub. AWS SRA recommends splitting out yet another, separate Security Tooling account as the space where the security team actually investigates and does forensics. On the exam, for "where should we keep forensic images," the correct direction is a separate isolated account, not Audit.

## Trade-off Comparison Table: 4 Paths to Build a Landing Zone

Even for the same requirement, "automate governance," there are four answers. Which one is correct is decided by the **qualifier**.

| Path | Build speed | Operational burden | Customization freedom | Regulatory fit | Suitable situation |
|------|-------------|--------------------|-----------------------|----------------|--------------------|
| **AWS Control Tower** | Fastest (a few hours) | **Lowest** (AWS-managed) | Low (needs AFC, CfCT) | Sufficient for standard regulations | General organizations, the default choice |
| **Control Tower + AFT/CfCT** | Fast | Low to medium | Medium | Standard + in-house standards | Organizations with an IaC pipeline |
| **Landing Zone Accelerator (LZA)** | Medium (configuration files must be written) | Medium | **High** (full control via YAML configuration) | **Strong** (public sector, finance, GovCloud) | Strict regulation, special partitions |
| **Build it yourself (Org + SCP + StackSets)** | Slowest (months) | **Highest** | Fully free | Your own responsibility | Only when there are requirements CT does not support |

**"Control Tower by default; LZA if regulation is special; AFT/CfCT if the flow is IaC; building it yourself is the last resort."** On the exam, the cases where building it yourself is the answer are rare. When the qualifier "LEAST operational overhead" is attached, Control Tower is effectively certain.

LZA (Landing Zone Accelerator on AWS) is a deployable implementation provided as an AWS Solution. Because it is based on CloudFormation and configuration files (YAML), you can declare network topology, central logging, and security service configuration entirely in code. If Control Tower is "good opinionated defaults," LZA is "a skeleton where you specify everything to fit your regulatory requirements." The two are not mutually exclusive, so a combination in which LZA is layered on top of Control Tower to manage additional configuration as code is also used in practice. In the exam context, LZA appears together with keywords like GovCloud, public sector, and highly regulated.

## The Order for Layering Control Tower onto a Running Org

"40 accounts are already running. Introduce a Landing Zone to them." — This is the kind of migration scenario that could appear on the Pro exam. You need to know the order and the rationale for each step.

```
Step 1  Pre-check (Assessment)
   ├── Check whether the Management account has workloads → if so, move them first
   ├── Survey the existing AWS Config recorder / delivery channel in each account
   ├── Build an inventory of existing CloudTrail trails, S3 buckets, and KMS keys
   └── Rationale: if the resources Control Tower tries to create conflict with
             existing ones, the Landing Zone deployment itself fails. The conflict
             points must be sorted out first.

Step 2  Deploy the Landing Zone (on top of the existing Org)
   ├── Choose the home Region (carefully, since it is hard to undo)
   ├── Create new Log Archive and Audit accounts (avoid reusing existing accounts)
   ├── Existing OUs and accounts remain unenrolled for now
   └── Rationale: creating new core accounts keeps the baseline clean.
             If you use existing accounts as core accounts, leftover settings keep
             showing up as drift.

Step 3  Register OUs (Register OU)
   ├── Start with the lowest-risk OU: Sandbox → Non-Prod → Prod
   ├── On registration, guardrails are attached in bulk to every account in that OU
   └── Rationale: the moment guardrails attach, existing workloads can be blocked.
             Check side effects first in an OU with a small blast radius.

Step 4  Enroll existing accounts (Enroll Account)
   ├── The target account must have the AWSControlTowerExecution role to be enrolled
   ├── If an existing Config recorder exists, clean it up beforehand
   ├── One account at a time, with an application health check after enrollment
   └── Rationale: enrollment pushes the baseline (CloudTrail, Config, IAM Role)
             into the account. If you process in bulk, tracing the cause of a
             failure becomes impossible.

Step 5  Layer on the customization tier
   ├── Connect AFT or CfCT to automate in-house standards (VPC stub, tags, extra IAM)
   ├── Define a blueprint for new accounts with Account Factory Customization (AFC)
   └── Rationale: if standardization is not enforced automatically, drift
             accumulates within months.

Step 6  Operational settling
   ├── Build a pipeline: drift alert → ticket → fix PR
   ├── Make Landing Zone version updates routine (e.g., once a quarter)
   └── Rationale: Control Tower's version moves up. If neglected, you cannot
             receive new controls.
```

The **home Region choice** in Step 2 is very hard to undo, because Control Tower's control plane and default log destination are fixed in the home Region. If an organization with data sovereignty requirements temporarily builds the Landing Zone in us-east-1 and then wants to move it to ap-northeast-2, it is practically close to rebuilding the Landing Zone. The exam also treats an answer choice that says "change the home Region later" as pointing in the wrong direction.

The most common cause of delay in projects that introduce Control Tower to an existing Org is not technology but **cleaning up existing Config and CloudTrail**. Trails and Config recorders created independently by various teams remain different in each account, so just building the inventory takes weeks. That is why practitioner teams first build a table in Step 1 by bulk-running `aws configservice describe-configuration-recorders` and `aws cloudtrail describe-trails` across all accounts with a StackSet or a script. The "pre-adoption inventory" determines half of the overall schedule.

## Handling Controls as Code: Real API and CLI

Managing guardrails (the current official name is **Control**) through the API rather than console clicks is the standard. A control has a unique identifier ARN.

```bash
# Enable a control on a specific OU
# targetIdentifier = ARN of the OU, controlIdentifier = ARN of the control
aws controltower enable-control \
  --control-identifier \
    "arn:aws:controltower:ap-northeast-2::control/AWS-GR_RESTRICT_ROOT_USER" \
  --target-identifier \
    "arn:aws:organizations::111111111111:ou/o-exampleorgid/ou-abcd-11111111"

# It is an asynchronous operation, so poll the status with operationIdentifier
aws controltower get-control-operation \
  --operation-identifier 55555555-6666-7777-8888-999999999999

# List every control currently enabled on a specific OU (often used as audit evidence)
aws controltower list-enabled-controls \
  --target-identifier \
    "arn:aws:organizations::111111111111:ou/o-exampleorgid/ou-abcd-11111111"

# Disable a control (Mandatory controls cannot be disabled — returns an error)
aws controltower disable-control \
  --control-identifier \
    "arn:aws:controltower:ap-northeast-2::control/AWS-GR_RESTRICT_ROOT_USER" \
  --target-identifier "arn:aws:organizations::111111111111:ou/..."
```

What a Detective control actually looks at becomes clear when you look directly at its backend, the Config Rule. Below is the real definition of the managed rule that evaluates "are EBS volumes encrypted."

```json
{
  "ConfigRuleName": "encrypted-volumes-conformance",
  "Description": "Evaluates whether attached EBS volumes are encrypted",
  "Scope": {
    "ComplianceResourceTypes": ["AWS::EC2::Volume"]
  },
  "Source": {
    "Owner": "AWS",
    "SourceIdentifier": "ENCRYPTED_VOLUMES"
  },
  "InputParameters": "{}",
  "MaximumExecutionFrequency": "TwentyFour_Hours"
}
```

In the JSON above, `MaximumExecutionFrequency` determines the **detection delay** of the Detective guardrail. With the configuration change trigger, evaluation happens the moment the resource changes, but with the periodic trigger, detection can be late by up to that period. If the exam has a requirement of "must detect immediately," an answer relying only on periodic evaluation is wrong, and the correct direction is to catch real-time events with EventBridge or to block it outright with Preventive (SCP).

## When the Qualifier Changes, the Answer Changes

Take one requirement, "eliminate unencrypted EBS in all accounts," and change only the qualifier.

| Qualifier | Correct direction | Why |
|-----------|-------------------|-----|
| **LEAST operational overhead** | Enable Control Tower managed controls | AWS handles writing, deploying, and updating the rules. Zero extra work as accounts grow |
| **MUST be blocked before deployment** | **Proactive** (CloudFormation Hook) | Rejected at the IaC deployment pipeline stage. The resource is never created at all |
| **MUST be blocked at API call** | **Preventive** (SCP) | Blocked at the API point whether the path is console, CLI, or SDK |
| **Identify existing non-compliant resources** | **Detective** (Config Rule + Aggregator) | Preventive policies cannot see existing resources |
| **MOST cost-effective** | SCP-centered + minimal Config rules | Config is billed per recorded configuration item and per rule evaluation. SCPs have no additional charge |
| **MOST comprehensive / audit response** | Triple (Proactive + Preventive + Detective) | When prevention and evidence are required at once, one axis alone is not enough |

**"Before deploy = Proactive, At API = Preventive, After the fact = Detective."** Just find the three words (before / at / after) in the question text and the guardrail type is decided.

If "MOST cost-effective" is attached and you pick the answer that turns on Detective guardrails in bulk, you are wrong. Control Tower itself has no separate charge, but the **AWS Config** that runs beneath it is billed in proportion to the number of recorded configuration items and the number of rule evaluations. With 100 accounts, this cost is not negligible. So when a cost qualifier is attached, the correct direction is "block with SCPs what can be blocked with SCPs, and keep Config only for the rules that are truly necessary."

## Summary

Today's picture is threefold. First, the **Landing Zone** is the reference point of a multi-account environment, and Control Tower builds it automatically within 1 hour. Second, the **3 guardrail types** (Preventive/Detective/Proactive) work along the time axis of defense in depth. Third, **Account Factory/AFT/CfCT** are the three options for new account automation, and the choice depends on your IaC tool.

In the next article we look at **IAM Identity Center**, which Control Tower enabled automatically. It is the standard pattern of multi-account SSO: Permission Sets, SCIM synchronization, and external IdP (Okta, Azure AD) integration.

---

## 📝 Practice Questions

**Question 1.** "Pre-block S3 bucket becoming public" — Strongest guardrail combo?

A) Detective only
B) Preventive (SCP) only
C) Proactive (CFN Hook) only
D) Preventive + Proactive + Detective (triple)

**Answer: D**
Explanation: Defense in depth — Proactive (IaC deploy block), Preventive (API call block), Detective (post-monitor) as one set. One layer breaks, next catches. Prevent structural 2017 Verizon·Accenture S3 public incidents, multi-layer defense essential.

---

**Question 2.** 100-account standardization·auto-create·SCP batch-attach. Most appropriate?

A) CloudFormation StackSets only
B) Control Tower + Account Factory
C) Service Catalog
D) Systems Manager

**Answer: B**
Explanation: Control Tower is multi-account governance standard. Account Factory does auto-create + auto-guardrail attach. StackSets is partial, Service Catalog is general tool.

---

**Question 3.** Existing running Org. Adopt Landing Zone?

A) Must create new Org
B) Control Tower can ingest existing Org (set up)
C) AFT only
D) StackSets only

**Answer: B**
Explanation: Control Tower can set-up on existing Org. Recognizes existing OUs·accounts, adds Log Archive·Audit. Existing workloads stay, governance layer added.

---

**Question 4.** Terraform IaC-based: new account + custom resource auto-deploy. Which tool?

A) CfCT
B) AFT (Account Factory for Terraform)
C) Account Factory only
D) CDK

**Answer: B**
Explanation: AFT is Terraform-based GitOps. CfCT is CloudFormation. CDK is separate tool.

---

**Question 5.** Landing Zone deviates from standard setting. What detects?

A) GuardDuty
B) Control Tower Drift Detection
C) Security Hub
D) Trusted Advisor

**Answer: B**
Explanation: Control Tower Drift Detection hourly compares baseline vs actual. On diff, console alert + Lambda auto-remediation trigger possible. CloudFormation StackSet drift + Lambda monitoring combo.

---

**Question 6.** Control Tower's Detective guardrail uses which service?

A) SCP
B) AWS Config Rule
C) CloudFormation Hook
D) WAF Rule

**Answer: B**
Explanation: Detective = Config Rule, Preventive = SCP, Proactive = CFN Hook. Know backend service mapping for each guardrail type.

---

**Question 7.** Fintech: 200 new microservice accounts yearly. GitOps + Terraform. Best?

A) Account Factory console 200 times
B) AFT + Git Repo + CodePipeline
C) Lambda + CreateAccount API
D) CloudFormation StackSets

**Answer: B**
Explanation: AFT GitOps flow best. PR merge → auto account creation + baseline. Capital One·HashiCorp standard. C is self-build, operational burden high.

---

**Question 8.** In Control Tower, create OU in Organizations console. Result?

A) Normal operation
B) Control Tower doesn't recognize → guardrails don't auto-attach, "unregistered OU"
C) Immediate error
D) Account Factory doesn't work

**Answer: B**
Explanation: Control Tower doesn't recognize. Must create in Control Tower console for "registered OU" status → guardrails auto-apply. Frequent trap.
