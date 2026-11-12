# Day 2 - Control Tower and Landing Zone: Guardrails (Preventive/Detective), Account Factory, Compliance Baseline

If you assemble Organizations and SCP by hand, you must code all of the following: OU design, log accounts, Organization CloudTrail, Config aggregation, SCP sets, and new account bootstrapping. **AWS Control Tower** automates all of this as a *best-practices-based landing zone (Landing Zone)*, serving as a governance orchestrator. In the security exam, Control Tower appears as the answer to "How do we consistently establish and maintain a secure baseline across multiple accounts?" The core concepts are **Guardrails (Controls)**, **Account Factory**, and **Drift Detection**.

## Landing Zone: Pre-Configured Multi-Account Foundation

When you enable Control Tower, the following are automatically configured:

```
Management Account (Control Tower Orchestration)
├── OU: Security
│   ├── Account: Audit       (Security Hub/GuardDuty aggregation, cross-account audit role)
│   └── Account: Log Archive (immutable organization CloudTrail/Config log retention)
└── OU: Sandbox (or Workloads)
    └── Registered/newly created accounts
```

- **Organization CloudTrail**: Automatically applied to all accounts; logs aggregate to Log Archive account's S3.
- **AWS Config**: Activated in all enrolled accounts and regions; snapshots go to Log Archive.
- **Central Aggregation**: Audit account has cross-account audit role (AWSControlTowerExecution, etc.).
- **IAM Identity Center (formerly SSO)**: Centralizes multi-account login with users and permission sets.

Landing zones have *versions*. When AWS updates the baseline, landing zone updates reapply the new baseline to all accounts.

> 💡 **Related Theory**: This is *Policy as a Managed Baseline*, implementing the *secure-by-default* principle of security engineering at organizational scale. When new accounts are born in a "secure state by default," we structurally eliminate human error from people forgetting to apply security settings each time. It automatically enforces CIS Controls' "Secure Configuration."

## Guardrails (Controls): Preventive / Detective / Proactive

Control Tower's governance is expressed through **Controls** (formerly called Guardrails). There are three types.

**1) Preventive Controls** — Implemented via SCP. *Block violations at the source*. Result is immediate denial.

```json
{
  "Sid": "GRDISALLOWS3UNENCRYPTED",
  "Effect": "Deny",
  "Action": "s3:PutObject",
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "s3:x-amz-server-side-encryption": ["AES256", "aws:kms"]
    },
    "Null": { "s3:x-amz-server-side-encryption": "false" }
  }
}
```

**2) Detective Controls** — Implemented via AWS Config rules. *Continuously evaluate* already-created resources for policy violations and mark them as non-compliant. Does not block, but *alerts*.

```yaml
# Config rule example: EBS volume encryption detection
ConfigRule:
  Source: AWS
  Identifier: ENCRYPTED_VOLUMES
  Scope: AWS::EC2::Volume
  # Non-compliant shown in Audit account dashboard/Security Hub
```

**3) Proactive Controls** — Implemented via CloudFormation Hooks. Check policy *before resource provisioning* at the IaC phase, preventing non-compliant resources from even being deployed (a "deployment gate" between prevention and detection).

Controls are classified by **governance level**:
- **Mandatory**: Always applied by Control Tower; cannot be disabled (e.g., CloudTrail log integrity, Config disable prevention).
- **Strongly recommended**: AWS best practices; recommended to enable.
- **Elective**: Optional based on organizational needs.

## Controls Apply to OUs, Not Individual Accounts

Core operational principle: **Controls are activated at the OU level, not the individual account level.** Group accounts with the same security requirements into an OU, and apply the control set to that OU. New accounts entering the OU automatically inherit the same baseline.

```
OU: Prod ── Preventive (region lock, root block) + Detective (encryption, public access, MFA)
OU: NonProd ── Relaxed set (sandbox regions allowed)
```

## Account Factory: Standardized Account Provisioning

Creating a new account manually in the console misses the baseline. **Account Factory** issues accounts using a predefined *blueprint*: proper OU placement, IAM Identity Center users/permission sets, network baseline (VPC), and all OU-attached controls are automatically inherited.

```
Request (name/email/OU/network)
   → Account Factory (Service Catalog product)
   → New account + OU placement + control inheritance + SSO permissions + CloudTrail/Config enrollment
```

At scale, use **Account Factory for Terraform (AFT)** or Customizations for Control Tower (CfCT) to codify and pipeline account provisioning. Best practice is to automatically apply custom baselines (install security tools, enforce tags, additional SCPs) immediately after provisioning.

> 💡 **Related Theory**: Account Factory is the *Golden Path / Paved Road* pattern. In platform engineering, offering a "standardized secure path" reduces developer incentive to deviate and create risky configurations directly. It transforms security from "a barrier blocking you" to "a safe path built in by default."

## Drift Detection

Landing zones have a *declared state*. If someone manually moves an OU, modifies an SCP, or pulls an account out of an OU in the console, actual state diverges from declaration — this is **drift**. Control Tower detects drift, displays it on the dashboard, and remedies it (repair/re-register) to restore the declared state.

Common drift causes:
- Manual edit or deletion of SCP outside Control Tower
- Manual movement of accounts within managed OUs
- Manual deletion of roles and policies provided by mandatory controls

If drift exists, new control application or account provisioning may be blocked, so the critical exam message is: **Control Tower-managed resources should not be touched directly in the console**.

## Compliance Baseline Mapping

Control Tower controls map to CIS AWS Foundations Benchmark, AWS Well-Architected Security Pillar, PCI-DSS, and other standards. Examples:

- **CIS 1.x (IAM)**: Root MFA, root access key prohibition, MFA enforcement → Detective control + Preventive SCP.
- **CIS 2.x (Logging)**: CloudTrail all-region enable, log integrity, KMS encryption → Mandatory control.
- **CIS 3.x (Monitoring)**: Unauthorized API, console login failure alerts → CloudWatch/Config.
- **CIS 4.x (Networking)**: No 0.0.0.0/0 inbound SSH/RDP → Detective control.

Control Tower alone does not collect and report all evidence; formal audit reporting is the job of **Audit Manager** (covered tomorrow).

## Control Tower vs Manual Organizations

| Item | Manual Organizations | Control Tower |
|---|---|---|
| OU and log account design | Manual | Automatic (recommended structure) |
| Organization CloudTrail/Config | Manual setup | Automatic |
| Guardrails | Manual SCP/Config writing | Curated control library |
| New account bootstrap | Direct scripts | Account Factory |
| Drift management | Manual monitoring | Built-in drift detection |

Control Tower excels at rapidly establishing general best practices, but very specialized organization structures or region constraints may benefit from manual Organizations + IaC. Exams usually guide to "establish standard multi-account baseline quickly and consistently" → Control Tower.

## Trap Summary

- Controls apply to *OUs*, not *individual accounts*, so new accounts automatically inherit the baseline.
- Preventive=SCP (block), Detective=Config (evaluate/alert), Proactive=CFN Hooks (block before deploy). Don't confuse.
- Manual changes to Control Tower-managed resources cause *drift* → Re-apply needed.
- Mandatory controls cannot be disabled — do not attempt to bypass.
- Control Tower establishes baselines, but formal *compliance evidence collection* is Audit Manager's job.

## 📝 Practice Questions

**Question 1.** We want a company security baseline to be applied automatically to newly enrolled workload accounts. What is the most appropriate method in Control Tower?

A) Enable controls individually for each new account  
B) Group accounts with the same requirements into an OU and apply a set of controls to that OU so that accounts automatically inherit them when they enter the OU  
C) Manually attach SCPs to each new account  
D) Apply controls only to the management account  

**Answer: B**  
Explanation: The key principle is to enable Control Tower controls at the OU level. When controls are applied to an OU, every account placed in that OU (including new ones) automatically inherits the baseline, so nothing is missed. Enabling per account individually or attaching SCPs manually is less scalable and consistent, and applying only to the management account leaves workload accounts unprotected.

---

**Question 2.** We want to "block the act of uploading S3 objects without encryption itself." What type of control is this and how is it implemented?

A) Detective control — AWS Config rule  
B) Preventive control — Deny unencrypted PutObject with an SCP  
C) Proactive control — CloudWatch alarm  
D) Mandatory control — GuardDuty  

**Answer: B**  
Explanation: "Blocking the act itself" is a preventive control, implemented with an SCP. Denying PutObject with the unencrypted header condition blocks it at the attempt stage. A detective control (Config) only evaluates and flags resources that have already been created and does not block, a CloudWatch alarm is a notification, and GuardDuty is a threat detection service that is not for this purpose.

---

**Question 3.** An operator moved an account out of a Control Tower managed OU in the console. Afterward, applying new controls fails. What are the cause and the correct response?

A) This is normal behavior; ignore it  
B) Drift has occurred — re-apply the landing zone/account (re-register/repair) to return it to the declared state, and do not change managed resources directly in the console  
C) Disable all controls  
D) Recreate the management account  

**Answer: B**  
Explanation: Changing Control Tower managed resources directly in the console causes drift, where the declared state and actual state diverge, which can block applying new controls and provisioning accounts. The correct response is to restore the declared state by re-applying, and then to keep the operating discipline of not manually touching managed resources. Ignoring it, disabling everything, and recreating the management account are all inappropriate.

---

**Question 4.** We want to provision 50 accounts consistently through a code-based pipeline and automatically apply a custom security baseline right after provisioning. What is the most appropriate approach?

A) Create accounts one by one in the console  
B) Codify account provisioning with Account Factory for Terraform (AFT) or Customizations for Control Tower, and automatically apply post-provisioning customization through a pipeline  
C) Log in to each account as the root user and configure it  
D) Consolidate all workloads into a single account  

**Answer: B**  
Explanation: For large-scale standardized provisioning, the best practice (Paved Road) is to codify the account factory with AFT or CfCT and automatically apply a custom baseline such as security tool installation, tags, and additional SCPs through a pipeline right after provisioning. Manual console work and root login carry high risk of omissions and danger, and consolidating into a single account violates the blast radius and isolation principles.

---

**Question 5.** Which of the following is a correct description of Control Tower "Mandatory controls"?

A) They are optional items that an operator can turn off at any time  
B) Control Tower always applies them and they cannot be disabled; they are the core of baseline protection, such as log integrity and prohibiting disabling Config  
C) They automatically issue PCI certification  
D) They apply only to workload accounts and not to the security accounts  

**Answer: B**  
Explanation: Mandatory controls are baseline protections that Control Tower always applies and that cannot be disabled, including CloudTrail log integrity and prohibiting disabling the Config recorder. The ones that can be turned off are Elective and Strongly recommended controls. Controls are not a certification issuing tool (evidence collection is Audit Manager), and the baseline is also applied to the security accounts.

---
