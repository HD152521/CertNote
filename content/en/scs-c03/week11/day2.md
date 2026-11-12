# Day 2 - Control Tower and the Landing Zone: Guardrails (Preventive/Detective), Account Factory, Compliance Baseline

If you assemble Organizations and SCPs by hand, you must code everything yourself: OU design, the log account, the organization CloudTrail, Config aggregation, the SCP set, and new-account bootstrapping. **AWS Control Tower** is a governance orchestrator that automatically configures and operates all of this as a *best-practice-based Landing Zone*. On the security exam, Control Tower appears as the answer to "how do you lay down and maintain a multi-account security baseline consistently," and its core concepts are **guardrails (controls)**, **Account Factory**, and **drift detection**.

## Landing Zone: A Pre-Built Multi-Account Foundation

When you turn on Control Tower, the following is configured automatically:

```
Management account (Control Tower orchestration)
├── OU: Security
│   ├── Account: Audit       (Security Hub/GuardDuty aggregation, cross-account audit role)
│   └── Account: Log Archive (immutable retention of organization CloudTrail/Config logs)
└── OU: Sandbox (or Workloads)
    └── Enrolled and newly created accounts
```

- **Organization CloudTrail**: Applied automatically to all accounts, with logs aggregated into S3 in the Log Archive account.
- **AWS Config**: Enabled in all enrolled accounts and Regions, with snapshots going to Log Archive.
- **Central aggregation**: A cross-account audit role (such as AWSControlTowerExecution) is placed in the Audit account.
- **IAM Identity Center (formerly SSO)**: Unifies multi-account login through users and permission sets.

A Landing Zone has a *version*. When AWS updates the baseline, a Landing Zone update re-applies the new baseline to every account.

This is *Policy as a managed baseline*, and it is the organizational implementation of the *secure-by-default* principle of security engineering. If new accounts are born in a "secure by default state," the omissions (human error) that come from people remembering to apply security settings every time are structurally eliminated. In effect, it automatically enforces "Secure Configuration" from the CIS Controls.

### The Actual Parts That Make Up a Landing Zone

Behind the phrase "Control Tower sets it up automatically" there are concrete resources. You need to know them to interpret drift and failures.

```
[ What Control Tower actually creates ]

Management account
 ├─ AWS Organizations (created new if absent, adopts the existing organization if present)
 ├─ The SCP set owned by Control Tower (named aws-guardrails-*)
 ├─ Organization CloudTrail (multi-Region, log file validation ON)
 ├─ IAM Identity Center instance + default permission sets
 │    (AWSAdministratorAccess / AWSReadOnlyAccess / AWSSecurityAuditors ...)
 └─ Service Catalog portfolio = the Account Factory product

Each enrolled account
 ├─ AWSControlTowerExecution role  ← trusted by the management account, used to apply the baseline
 ├─ AWSControlTowerAdmin / ConfigAggregator roles
 ├─ AWS Config recorder + delivery channel (in every governed Region)
 └─ CloudTrail/Config logs → Log Archive account S3

Log Archive account
 ├─ aws-controltower-logs-<acct>-<region> (organization log aggregation)
 └─ aws-controltower-s3-access-logs-...   (bucket access logs)

Audit account
 ├─ AWSControlTowerBlueprintAccess / cross-account audit role
 └─ SNS topic for notifications (aws-controltower-*)
```

The concepts of **Home Region and governed Regions** also matter. The Region where you first set up Control Tower is the Home Region, and it cannot be changed afterward. You then choose which Regions to "govern," and the Config recorder is turned on and detective controls are evaluated only in governed Regions. Regions outside governance become a **detection blind spot**, so the standard practice is to apply a Region Deny control there to block their use altogether. If you reduce the governed Regions because "more Regions mean higher Config cost" and then do not block those Regions, an attacker quietly creates resources in a Region with no monitoring.

> ⚠️ **Pitfall**: Control Tower's Region Deny control is implemented as an SCP with an `aws:RequestedRegion` condition, and global services and the APIs Control Tower itself uses are exempted. If you also attach a Region-lock SCP that your organization wrote itself, the exception lists drift apart and the console breaking is a common incident. Set the principle that **Region control is managed in one place**, and if you use Control Tower, it is safest to treat that control as the source of truth.

## Guardrails (Controls): Preventive / Detective / Proactive

Control Tower governance is expressed as **controls (formerly called guardrails)**. There are three kinds.

**1) Preventive controls** — Implemented with SCPs. They *block the violating action in the first place*. The result is an immediate block (deny).

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

**2) Detective controls** — Implemented with AWS Config rules. They *continuously evaluate* whether already-created resources violate the rules and mark them NON_COMPLIANT. They do not block; they *notify*.

```yaml
# Config rule example: detect whether EBS volumes are encrypted
ConfigRule:
  Source: AWS
  Identifier: ENCRYPTED_VOLUMES
  Scope: AWS::EC2::Volume
  # When non-compliant, shown on the Audit account dashboard / Security Hub
```

**3) Proactive controls** — Implemented with CloudFormation Hooks. They check compliance at the IaC stage *before a resource is provisioned*, so a non-compliant resource cannot even attempt to deploy (a "deployment gate" between prevention and detection).

Controls are classified by **governance level**:
- **Mandatory**: Always applied by Control Tower and cannot be disabled (e.g., CloudTrail log integrity, a ban on disabling Config).
- **Strongly recommended**: AWS best practices, recommended to turn on.
- **Elective**: Chosen according to the organization's needs.

### The Three Types in One Table

The exam repeatedly asks "which control type satisfies this requirement?" The axis for telling them apart is **the point in time at which blocking happens**.

| Axis | Preventive | Detective | Proactive |
|---|---|---|---|
| Implementation technology | SCP | AWS Config rule | CloudFormation Hooks |
| Point of intervention | The moment of the API call | Continuous evaluation **after** the resource is created | **Just before** IaC deployment (before stack provisioning) |
| Result | Blocked with `AccessDenied` | COMPLIANT / NON_COMPLIANT shown | Stack deployment fails |
| Existing resources | No effect (only future calls) | Evaluated | No effect |
| Manual creation in the console | Blocks it | Detected after the fact | **Cannot block it** (CFN path only) |
| Typical examples | Region lock, root block, denying unencrypted PutObject | Detect unencrypted EBS volumes, detect 0.0.0.0/0 SSH | Reject deploying a template that defines unencrypted RDS |
| Cost | None | Config evaluation and recording cost | None |

The decisive distinction here is the second-to-last row. **A proactive control inspects only deployments that come in through the CloudFormation path.** If a user creates a resource directly with the console or CLI, the proactive control does nothing. "I want to filter out non-compliant resources early in the IaC pipeline to give developers fast feedback" is the exact use of a proactive control, and if it is "it must be blocked no matter which path creates it," the answer is preventive (SCP). Answer choices that swap these two are easily used as wrong answers.

The three types are combined not as competitors but as a *trade-off of cost and coverage*. An SCP is free and certain but limited in expressiveness — actions whose condition keys are not supported cannot be controlled at all, and it cannot see a "state changed after creation." Config can evaluate anything but costs money per evaluation and is reactive. A proactive control gives feedback early in the development loop and fixes mistakes most cheaply, but it can be bypassed. A mature organization uses a 3-layer arrangement: *notify quickly with proactive, block firmly with preventive, and fill the remaining holes with detective*. This is the combination of shift-left and defense-in-depth in security engineering.

> 🎯 **Scenario**: The compliance team demands: "Every RDS instance must be encrypted at rest, violations must be reported to developers before deployment, bypass creation through the console must also be blocked, and we also need a list of existing unencrypted instances." Which combination of controls? → It does not end with one. ① With a **proactive control (CFN Hooks)**, reject unencrypted templates at the IaC deployment stage to give developers fast feedback. ② With a **preventive control (SCP)**, Deny `rds:CreateDBInstance` when the `rds:StorageEncrypted` condition is false, blocking console and CLI bypass. ③ With a **detective control (Config `rds-storage-encrypted`)**, evaluate existing resources and produce the non-compliant list. If the answer choices push you to pick only one, work out which requirement items would remain uncovered to decide the answer.

## Controls Apply to OUs

The key operating principle: **enable controls at the OU level, not on individual accounts.** If you group accounts with the same security requirements into an OU and apply a set of controls to that OU, a new account receives the same baseline automatically the moment it enters that OU.

```
OU: Prod ── Preventive (Region lock, root block) + Detective (encryption, public access, MFA)
OU: NonProd ── A relaxed set (sandbox Regions allowed)
```

## Account Factory: Issuing Standardized Accounts

If you create new accounts by hand in the console, the baseline gets missed. **Account Factory** issues accounts from a pre-defined *blueprint* — placement in the right OU, IAM Identity Center users/permission sets, a network baseline (VPC), and all the controls attached to the OU are inherited automatically.

```
Request (name/email/OU/network)
   → Account Factory (Service Catalog product)
   → New account + OU placement + control inheritance + SSO permissions + CloudTrail/Config enrollment
```

At large scale, you turn account issuance into code and pipelines with **Account Factory for Terraform (AFT)** or Customizations for Control Tower (CfCT). The best practice is to automatically apply a custom baseline (installing security tools, enforcing tags, extra SCPs) right after issuance.

Account Factory is a *Golden Path / Paved Road* pattern. In platform engineering, if you provide a "standardized safe path," developers have less incentive to leave that path and create risky settings themselves. It is an approach that turns security from a "blocking barrier" into a "safe road laid by default."

## Cementing the Understanding with the CLI

Control Tower is known as a console-centered service, but there are APIs for enabling controls and operating the Landing Zone, and the exam presumes them at the conceptual level.

```bash
# 1) Check the Landing Zone status
aws controltower list-landing-zones
aws controltower get-landing-zone --landing-zone-identifier <arn>

# 2) List the controls enabled on a specific OU
aws controltower list-enabled-controls \
  --target-identifier arn:aws:organizations::111122223333:ou/o-exam/ou-exam-prod

# 3) Enable a control on an OU (note that the target is the OU, not an account)
aws controltower enable-control \
  --control-identifier arn:aws:controltower:ap-northeast-2::control/AWS-GR_RESTRICTED_SSH \
  --target-identifier arn:aws:organizations::111122223333:ou/o-exam/ou-exam-prod

# 4) Progress of the asynchronous operation
aws controltower get-control-operation --operation-identifier <op-id>

# 5) Re-apply the Landing Zone (drift repair)
aws controltower reset-landing-zone --landing-zone-identifier <arn>

# 6) Check the SCPs owned by Control Tower (aws-guardrails-* prefix)
aws organizations list-policies --filter SERVICE_CONTROL_POLICY \
  --query "Policies[?starts_with(Name, 'aws-guardrails')].[Name,Id]" --output table

# 7) Provision the Account Factory product through Service Catalog (the path AFT/pipelines call)
aws servicecatalog provision-product \
  --product-name "AWS Control Tower Account Factory" \
  --provisioning-artifact-name "AWS Control Tower Account Factory" \
  --provisioned-product-name "acct-payments-prod" \
  --provisioning-parameters \
     Key=AccountName,Value=payments-prod \
     Key=AccountEmail,Value=aws-payments-prod@example.com \
     Key=ManagedOrganizationalUnit,Value=Workloads/Prod \
     Key=SSOUserEmail,Value=platform-team@example.com \
     Key=SSOUserFirstName,Value=Platform \
     Key=SSOUserLastName,Value=Team
```

Item 3 is worth noticing. `--target-identifier` is **an OU ARN, not an account ARN**. The fact that Control Tower's control model itself is designed on the premise of OU-level attachment shows in the API signature.

## Drift Detection

A Landing Zone has a *declared state*. If someone moves an OU directly in the console, edits an SCP, or takes an account out of an OU, the actual state diverges from the declaration — this is called **drift**. Control Tower detects drift and shows it on the dashboard, and returns to the declared state with a Landing Zone re-apply (repair/re-register).

Common causes of drift:
- Manually editing or deleting an SCP outside Control Tower
- Manually moving an account in a managed OU
- Manually deleting the roles and policies that Mandatory controls provide

If there is drift, applying new controls or issuing accounts can be blocked, so the key message on the exam is the discipline that **resources managed by Control Tower are never touched directly in the console**.

There are two kinds of drift with different natures, and their recovery methods differ too.

| Category | Landing-Zone-level drift | Account-level drift |
|---|---|---|
| Examples | Manually editing or deleting a managed SCP, deleting a core OU, changing the Log Archive bucket policy | Moving an account out of a managed OU, deleting the `AWSControlTowerExecution` role, stopping the Config recorder in the account |
| Scope of impact | The whole organization — applying new controls and issuing accounts both stop | Only that account becomes non-compliant / fails baseline updates |
| Recovery | Landing Zone re-apply (Reset/Repair) | Account re-registration (Re-register / Update account) |
| Prevention | Restrict permissions to change Control-Tower-owned resources with an SCP | Restrict account-move and role-deletion actions with an SCP |

The reason drift occurs structurally is that Control Tower is a **declarative state manager**, while the Organizations, Config, and CloudTrail beneath it are **services that can be manipulated at will through imperative APIs as well**. When there are two management planes instead of one (direct console manipulation vs Control Tower), the state inevitably diverges. So mature operations make drift not "something fixed after the fact" but something that **cannot diverge in the first place** — deny, with a separate SCP, the very actions that modify or delete the SCPs, roles, and buckets Control Tower created, and give exceptions only to specific platform automation roles. That is, it is a recursive structure that *protects the governance tool itself with governance*.

> ⚠️ **Pitfall**: When Control Tower adopts an organization that already exists, the SCPs, CloudTrail, and Config created by hand earlier often remain and conflict. In particular, if **an individual CloudTrail is already on in each account, it duplicates the organization CloudTrail and logs and cost double**. After setting up the Landing Zone, clean up the existing individual trails, and leave only the one Config recorder that Control Tower manages. The statement "turning on Control Tower automatically cleans up existing settings" is wrong.

## Compliance Baseline Mapping

Control Tower controls map to control items of the CIS AWS Foundations Benchmark, the AWS Well-Architected security pillar, PCI-DSS, and so on. Examples:

- **CIS 1.x (IAM)**: Root MFA, no root access keys, MFA enforcement → detective controls + preventive SCPs.
- **CIS 2.x (Logging)**: CloudTrail enabled in all Regions, log integrity, KMS encryption → Mandatory controls.
- **CIS 3.x (Monitoring)**: Alarms for unauthorized API calls and failed console logins → CloudWatch/Config.
- **CIS 4.x (Networking)**: No 0.0.0.0/0 inbound SSH/RDP → detective controls.

Control Tower alone does not collect and report all the evidence, so formal audit reporting is combined with **Audit Manager**, which we cover the next day.

2017 was a period so widely called "the year of the public S3 bucket" that large-scale exposures caused by misconfigured buckets were disclosed one after another. The security firm UpGuard reported in succession that millions of customer call records in a bucket managed by NICE Systems, a telecom partner, and internal certificates, keys, and authentication credentials in a bucket of the consulting firm Accenture were accessible without authentication. What they have in common is that it was not the exploitation of a vulnerability but **one person's configuration mistake**, and that there was no organization-level default to catch that mistake. AWS's direction of response is exactly the same as the theme of this lecture — in 2018 it introduced **S3 Block Public Access** as an account- and bucket-level switch to create a "blocked by default" state, and afterward blocking public access and default encryption for new buckets became the default. A good number of Control Tower's Mandatory and Strongly Recommended controls are exactly this kind of "setting people had to remember," promoted to an organizational default.

## Control Tower vs Manual Organizations vs LZA

| Item | Manual Organizations + IaC | Control Tower | Landing Zone Accelerator |
|---|---|---|---|
| OU and log account design | Design and implement yourself | Automatic (AWS-recommended structure fixed) | Defined in config files, highly customizable |
| Organization CloudTrail/Config | Configure yourself | Automatic | Defined by configuration |
| Guardrails | Write SCPs/Config yourself | Curated control library | Even custom SCPs, Config, and NFW as code |
| New account bootstrap | Scripts yourself | Account Factory (+AFT) | Built into the pipeline |
| Drift management | Monitor yourself | Built-in drift detection | Pipeline re-apply |
| Regulation-specific configuration | All yourself | Limited | Reference configurations for government, finance, and healthcare provided |
| Adoption speed | Slow | Fastest | Medium (configuration learning needed) |
| Suitable situation | The organization structure is very special, or you already have mature IaC | Standard best practices, quickly | Strong regulatory requirements + deep customization needed together |

Control Tower is strong at laying down general best practices quickly, but if there is a very special organization structure or Region constraint, manual Organizations + IaC can be more flexible. The exam usually steers toward Control Tower for "a standard multi-account baseline, quickly and consistently." Conversely, when a constraint is stated such as "the management account already has a complex organization structure of its own and cannot accept the OU shape Control Tower requires," the answer tilts toward manual configuration + IaC.

> 🎯 **Scenario**: Three separate AWS organizations (each with its own management account) must be consolidated into one through an acquisition. Each organization already has per-account CloudTrail and different SCPs attached. The security team wants a single baseline and a single log repository after consolidation. In what order do you approach it? → ① Choose one organization as the source of truth and **invite and migrate** the other accounts (accounts can move between organizations, but organizations themselves cannot be merged). ② Before migrating, list the existing per-account CloudTrail trails and Config recorders — if left as is, they duplicate the organization trail and cost and logs are doubled. ③ Set up the Control Tower Landing Zone in the source organization and **enroll** the migrated accounts to apply the baseline. Enrollment fails if the `AWSControlTowerExecution` role is missing, so it must be deployed beforehand. ④ Remove the existing SCPs that duplicate or conflict with Control Tower controls to eliminate sources of drift. This is why the answer choice "turning on Control Tower consolidates automatically" is wrong.

## Trap Summary

- Controls must be applied to the *OU*, not the *account*, for new accounts to inherit automatically.
- Preventive = SCP (blocks), Detective = Config (evaluates/notifies), Proactive = CFN Hooks (blocks before deployment). Do not confuse them.
- Manually changing Control-Tower-managed resources in the console causes *drift* → re-apply needed.
- Mandatory controls cannot be disabled — do not try to work around them.
- Control Tower lays down the baseline, but formal *audit evidence collection* is Audit Manager's job.
- Proactive controls inspect *only the CloudFormation path* — they cannot block creation directly in the console or CLI.
- Outside governed Regions is a *blind spot with no Config evaluation*. Lock Regions you will not use with Region Deny.
- The Home Region cannot be changed after setup. The initial choice is a long-term constraint.
- When you adopt an existing organization, *existing CloudTrail and Config are not cleaned up automatically* — you must clean up duplicate logs and duplicate cost yourself.
- Touching the SCPs, roles, and buckets that Control Tower created is the number one cause of drift.

## Summary

- [ ] Did you attach controls to **OUs**, not accounts, so that new accounts inherit them automatically?
- [ ] Can you explain the difference in intervention point among Preventive (SCP), Detective (Config), and Proactive (CFN Hooks)?
- [ ] Did you decide the governed Regions and block the Regions outside them with Region Deny?
- [ ] Does the Home Region choice fit regulatory, latency, and service availability requirements (it cannot be changed)?
- [ ] When adopting an organization, did you clean up the duplicates of existing per-account CloudTrail and Config?
- [ ] Did you block changes to Control-Tower-owned resources (aws-guardrails-*, AWSControlTowerExecution, etc.) with an SCP?
- [ ] Is account issuance turned into code with AFT/CfCT, with a custom baseline applied automatically after issuance?
- [ ] Is the path by which people receive drift alerts (SNS/Security Hub) actually open?
- [ ] Instead of trying to work around Mandatory controls, did you find another design that satisfies the requirement?
- [ ] Did you put Audit Manager on top of the baseline to connect evidence and reporting as well?

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
