# Day 2 - Service Control Policy: The Ceiling as a Thinking Tool

90% of the people who walk into the exam understanding SCP as an "authorization policy" miss Domain 1. The essence of SCP fits in one sentence — **"An SCP never grants permissions. It only sets the maximum limit (ceiling) of the permissions that can be allowed."** If you do not truly understand this one sentence, you will be confused every time the Pro exam shows a scenario that asks "which of these 4 SCP statements is correct."

Before SCPs appeared, there was no way to force "the root user of every account cannot do X" in a multi-account environment. IAM policies only apply to IAM Users/Roles inside an account, and they let root pass through. AWS Config Rules only detect violations after the fact; they do not block anything. So security teams had to build complex automation of their own: Lambda + Config + alarms + automatic cleanup. When SCPs arrived together with Organizations in 2017, this became simple. **Attach an SCP to an OU or an account, and every Principal in it (root included) is unable to perform any action the SCP does not allow.**

Today we cover the essence of SCPs, evaluation order, the Allow-list vs Deny-list strategy, the 6 most common patterns, debugging techniques, and the new feature released in 2024, **Resource Control Policy (RCP)**.

## The Essence of SCP: Not Authorization, But a Ceiling

Two facts matter most.

1. **An SCP does not grant permissions.** Attach an empty SCP (`{"Statement": []}`) and every action becomes an implicit Deny.
2. **Even if an IAM policy gives an Allow, if the SCP leaves that action out, the result is a Deny.**

```
Actual permissions = SCP ceiling ∩ Permission Boundary ∩ IAM Identity Policy ∩ Resource Policy ∩ ...
```

This model is an **upper bound + intersection** structure from mathematics. The SCP defines the supremum (upper bound) of a lattice, and the actual permissions are the intersection of that supremum and the policies below it. The engine that analyzes this formally is the **Zelkova** engine of AWS IAM Access Analyzer. Zelkova is a formal verification system based on an SMT (Satisfiability Modulo Theories) solver, built from Microsoft Research work, and it mathematically proves whether an IAM policy "allows access to an external Principal." [AWS re:Inforce 2019 talk](https://aws.amazon.com/blogs/security/protect-sensitive-data-in-the-cloud-with-advanced-hsm-and-access-controls/).

SCP evaluation is the **top gate** of IAM evaluation. When a request comes in: (1) does it pass the SCP? If no, Deny. (2) Does it pass the Permission Boundary? If no, Deny. (3) Then Identity Policy + Resource Policy + Session Policy are evaluated together. The SCP is the layer that can block earliest and fastest. So if you put a company-wide "absolutely not" rule (for example, no regions other than us-east-1) in an SCP, it is enforced on every member account and every IAM Role.

> ⚠️ **Pitfall**: An answer choice saying "SCPs also apply to the Management account" is a trap. The Management account is not a target of SCPs (by design). IAM Users in the Management account can use all permissions without any SCP. That is why you must not run workloads in the Management account — if it is compromised, there is no SCP protection.

## FullAWSAccess vs Empty SCP: The Implicit Deny Pitfall

- **FullAWSAccess** (default): Allows all actions — in other words, no restriction from SCPs.
- **Empty SCP** (`{"Statement": []}`): Denies all actions — the account cannot operate.

When you create a new OU, FullAWSAccess is attached by default. If you detach it and leave only an Allow-list SCP you wrote yourself, then **every action not explicitly listed becomes an implicit Deny** for the accounts in that OU.

> ⚠️ **Pitfall**: In a scenario like "We allowed only EC2 in the Allow-list SCP, and now S3 doesn't work," the answer is **"because the SCP has no S3 Allow."** Even if an IAM policy gives an S3 Allow, the SCP block takes priority. You see this trap often in the Pro exam.

## Allow-list vs Deny-list Strategy

| Strategy | Behavior | Use |
|----------|----------|-----|
| **Deny-list** (recommended) | FullAWSAccess + add Deny rules | General workloads, flexible |
| **Allow-list** | Remove FullAWSAccess + Allow rules only | Strict isolation, restricted OUs (part of Sandbox) |

Many organizations use the **Deny-list strategy**, because newly launched AWS services are automatically allowed.

AWS launches more than 100 new services every year. If you operate with an Allow-list, you must update the SCP every time a new service ships. A Deny-list means "deny only the dangerous actions," so new services are allowed automatically. However, a Deny-list carries the risk that an attacker abuses a new service → you need a compensating control, such as a company policy that requires a prior review before any new service is used.

The trade-off between **default-deny and default-allow** in security policy has been discussed since the 1970s. NIST SP 800-53 AC-3 (Access Enforcement) recommends default-deny under the "principle of fail-safe defaults." But in a fast-evolving environment like the cloud, default-allow + targeted-deny lowers the operational burden. AWS's own recommendation is also the Deny-list.

## 6 Common SCP Patterns

### Pattern 1: Region Restriction (Data Sovereignty)

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "NotAction": [
      "iam:*", "organizations:*", "route53:*",
      "support:*", "trustedadvisor:*", "cloudfront:*",
      "globalaccelerator:*", "waf:*", "shield:*"
    ],
    "Resource": "*",
    "Condition": {
      "StringNotEquals": {
        "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
      }
    }
  }]
}
```

Global services (IAM, Organizations, Route 53, CloudFront, GA, WAF, Shield) are processed in us-east-1 or have a global Region. If you do not carve them out with `NotAction`, even `iam:CreateRole` is blocked and the whole OU stops working.

### Pattern 2: Block Root User Actions

```json
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "StringLike": {"aws:PrincipalArn": "arn:aws:iam::*:root"}
  }
}
```

### Pattern 3: Block Sensitive Actions Without MFA

```json
{
  "Effect": "Deny",
  "Action": [
    "ec2:TerminateInstances",
    "rds:DeleteDBInstance",
    "s3:DeleteBucket"
  ],
  "Resource": "*",
  "Condition": {
    "BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}
  }
}
```

If you use `Bool`, a request that has no MFA key at all is `null`, so the Deny does not take effect. `BoolIfExists` evaluates the condition when the key exists and, when it is missing, still treats it as matching — so the Deny applies in both cases. If you do not know this subtle difference, you fall into the trap where the SCP silently does not work.

### Pattern 4: Block Disabling CloudTrail and GuardDuty

```json
{
  "Effect": "Deny",
  "Action": [
    "cloudtrail:StopLogging",
    "cloudtrail:DeleteTrail",
    "cloudtrail:UpdateTrail",
    "guardduty:DeleteDetector",
    "guardduty:StopMonitoringMembers",
    "config:DeleteConfigurationRecorder",
    "config:StopConfigurationRecorder"
  ],
  "Resource": "*"
}
```

In the 2017 Equifax breach, the attackers got in through an Apache Struts CVE and then evaded some of the security logs. Had AWS Organizations plus an SCP like this been in place, even post-intrusion attempts to tamper with logs would have been blocked. After the incident, NIST CSF and PCI-DSS v4.0 (2022) began to explicitly require "log immutability."

### Pattern 5: Prohibit Expensive Instance Families (Sandbox)

```json
{
  "Effect": "Deny",
  "Action": "ec2:RunInstances",
  "Resource": "*",
  "Condition": {
    "ForAnyValue:StringLike": {
      "ec2:InstanceType": ["p4*", "p5*", "x2*", "u-*", "trn1*"]
    }
  }
}
```

### Pattern 6: Block an Entire Service

```json
{
  "Effect": "Deny",
  "Action": ["macie2:*", "iotwireless:*", "honeycode:*"],
  "Resource": "*"
}
```

## SCP Evaluation Order: Top to Bottom

```
Request
 │
 ▼
Org Root SCP ─ Pass? ─ N → Deny
 │
 ▼
All parent OU SCPs ─ Pass? ─ N → Deny
 │
 ▼
SCP attached directly to the account ─ Pass? ─ N → Deny
 │
 ▼
IAM Identity Policy + Resource Policy + Boundary
 │
 ▼
Final Allow
```

If a parent OU's SCP is stricter, a child OU cannot loosen it (inheritance). Example: if the Root has "Deny everything outside ap-northeast-2," then even an "Allow us-east-1" in a child OU does not undo it. An SCP is a one-way intersection — it only narrows from top to bottom. The idea is similar to the umask in Unix file permissions — a permission that umask closed is closed again even if you open it with chmod.

## SCP Debugging: How to Find "Why Doesn't It Work"

1. **Check the CloudTrail errorCode** — alongside `AccessDenied` it shows whether the cause is an SCP or IAM. If an SCP blocked it, the `errorMessage` says "explicit deny in a service control policy."
2. **IAM Policy Simulator** — can simulate through to the Org SCPs (added in 2020).
3. **Test the SCP temporarily in a PolicyStaging OU**, then attach it to the real OU.
4. **AWS Access Analyzer + Policy Generation** — analyzes 90 days of CloudTrail data, extracts only the actions actually used, and generates a least-privilege IAM policy.

> 🎯 **Scenario**: "After applying an SCP, some Lambda functions stopped working. How do you find the cause quickly?" — Answer: **filter CloudTrail errorMessage + simulate with the IAM Policy Simulator including SCPs**. When an SCP blocks a call, CloudTrail explicitly includes "service control policy" in the errorMessage, so a simple grep finds it. Enter the Lambda execution Role into the Simulator → check whether it passes the SCP.

## Resource Control Policy (RCP): The 2024 New Feature

Released in November 2024. An SCP restricts the Principal (identity) side; **an RCP restricts the resource side**.

| Policy | Applied to | Example |
|--------|-----------|---------|
| **SCP** | Principal (IAM User/Role) | "No IAM Role in this OU can use any Region other than us-east-1" |
| **RCP** | Resource (S3 bucket, SQS, KMS, etc.) | "No S3 bucket in this OU can be accessed by a Principal from outside the company" |

An RCP blocks **confused deputy** attacks at the OU level. Example: a developer in a member account mistakenly puts `Principal: "*"` in an S3 bucket Resource Policy, and anyone outside can access it. If an RCP has a Deny with `"Condition": {"StringNotEquals": {"aws:PrincipalOrgID": "o-xxxx"}}`, then access from Principals outside the company Org is blocked on every S3 bucket in that OU. One line prevents external exposure across all accounts.

In 2017, Verizon, Booz Allen Hamilton, and Accenture leaked data through S3 bucket public-setting mistakes. In 2018 GoDaddy had a similar incident. The same pattern repeats every year because it is hard to verify IAM policies and Resource Policies on every bucket. With an RCP, you set the policy once in one OU and it applies automatically to all resources — structurally blocking this kind of incident.

## Declarative Policies, Backup Policies, Tag Policies

Besides SCPs, Organizations provides various other policy types.

| Policy type | Purpose |
|-------------|---------|
| **Tag Policy** | Enforce standardized tag keys and values (e.g., `Environment=prod\|dev\|stg`) |
| **Backup Policy** | Enforce AWS Backup standards (e.g., daily backups, 35-day retention) |
| **AI Services Opt-out** | Prevent AI services from using customer data for training |
| **Chatbot Policy** | Restrict Slack/Teams integration |
| **Declarative Policy** (2024) | Declaratively enforce things like EC2 IMDSv2 and EBS encryption |

## CLI Direct View

```bash
# Create an SCP
aws organizations create-policy \
  --name DenyRegions \
  --type SERVICE_CONTROL_POLICY \
  --content file://deny-regions.json

# Attach it to an OU
aws organizations attach-policy \
  --policy-id p-xxxx --target-id ou-yyyy

# List the SCPs attached to an OU
aws organizations list-policies-for-target \
  --target-id ou-yyyy \
  --filter SERVICE_CONTROL_POLICY

# Simulate the effect (IAM Policy Simulator API)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:role/MyRole \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::my-bucket/*
```

## 4 Exceptions Where SCPs Do Not Apply

The sentence "an SCP blocks everything in the OU" is not accurate. There are clearly **areas an SCP cannot reach**, and the Pro exam asks about these gaps relentlessly.

| Exception | Why it does not apply | Real-world compensation |
|-----------|----------------------|-------------------------|
| **All Principals in the Management account** | Intentionally excluded because they must be able to manage the Org itself | No workload deployment + sealed root + CloudTrail alerts |
| **Service-Linked Roles** | Roles that AWS services use to perform their own functions | Restrict `iam:CreateServiceLinkedRole` so the SLR cannot be created at all |
| **Requests made on your behalf by an AWS service principal** | The requester is a service, not an IAM Principal | A service-level Deny so that the service cannot be used |
| **Access by an Org-external Principal through a resource policy** | SCPs only constrain Principals **inside** the Org | **RCP** or resource policy conditions |

The fourth exception is the one people get wrong most often. The statement "we attached an SCP to our OU that forbids external S3 sharing, so we are safe" is wrong. An SCP only decides **what the IAM Principals of my accounts can do**. The path where a Principal from an external account comes in through `Principal: "*"` in our bucket policy is outside the SCP. What plugs this hole is the 2024 **RCP**. When "block external sharing" appears on the exam, you should first think of RCP, bucket policies, and S3 Block Public Access — not SCP.

## A Hidden Constraint of SCP Syntax: Allow Statements Cannot Use Conditions

SCPs look like they have the same syntax as IAM policies, but they are a **deliberately narrowed dialect**. If you do not know this and copy-paste an IAM policy as is, policy creation itself fails, or worse, it behaves differently than you intended.

| Item | IAM Identity Policy | SCP |
|------|----------------------|-----|
| `Condition` in an `Allow` statement | Allowed | **Not allowed** |
| `NotAction`/`NotResource` in an `Allow` statement | Allowed | **Not allowed** |
| `Resource` in an `Allow` statement | ARNs can be specified | **Only `"*"`** |
| `Condition` in a `Deny` statement | Allowed | Allowed |
| `NotAction` in a `Deny` statement | Allowed | Allowed |
| `Principal` field | None (Identity Policy) | None |
| Maximum policy document size | 6,144 characters (managed policy) | **5,120 characters** |
| Number attachable to one target (Root/OU/account) | — | **Up to 5** |

One practical rule comes out of this. **"Express conditional restrictions as a Deny, always."** You may want to write "allow EC2 only in ap-northeast-2" as Allow + Condition, but that is impossible in an SCP. You must write it in the inverted form: "Deny when that condition is **not** met." This is exactly why Pattern 1 (region restriction) above has the `Deny` + `StringNotEquals` shape.

Combine the 5,120-character limit with the 5-per-target limit and a large organization hits the wall of "I cannot attach any more SCPs." A common wrong fix here is **digging the OU hierarchy deeper** (5 on the parent OU + 5 on the child OU). More depth makes the inheritance path complicated and debugging harder. The right fix is (1) merge multiple Deny statements into a single policy document, (2) use wildcards in the `Action` array to compress the character count, and (3) split into separate policies only the rules that are truly different in nature.

## Trade-off Comparison Table: 5 Ways to Narrow Permissions

The same requirement — "restrict permissions" — has five means. The Pro exam puts these five side by side and makes you pick one by the **qualifier**.

| Means | Target | Grants permissions? | Scope | Operational burden | Typical use |
|-------|--------|---------------------|-------|--------------------|-------------|
| **SCP** | All Principals in an OU/account (root included) | ❌ Ceiling only | The whole Org from one place | **Lowest** (attach once) | Company-wide "absolutely forbidden" |
| **RCP** | All **resources** in an OU/account | ❌ Ceiling only | The whole Org from one place | Low | Structural blocking of external exposure |
| **Permission Boundary** | One specific IAM User/Role | ❌ Ceiling only | That identity only | Medium (attachments must be managed) | Safety net when delegating permissions |
| **IAM Identity Policy** | One specific IAM User/Role | ✅ Grants | That identity only | High (there are many) | Actual job permissions |
| **Resource Policy** | One specific resource | ✅ Grants | That resource only | High (per resource) | Cross-account sharing |

**"Two that grant, three that narrow."** Only the Identity Policy and the Resource Policy actually give permissions. SCP, RCP, and Permission Boundary all three only lower the ceiling. So an answer choice like "use an SCP to give developers S3 permissions" is wrong.

> 🎯 **Scenario**: "A company wants to give each team lead the permission to create the IAM Roles of their own team directly. But a Role created by a team lead must not be able to have administrator permissions." — Answer: **Permission Boundary**. Allow `iam:CreateRole` but force the attachment of a specific Boundary using the `iam:PermissionsBoundary` condition. With an SCP it is hard to block only "creating a Role with administrator permissions," and it is also hard to give a different ceiling to each team. For the safety net of permission **delegation**, the Boundary is the right answer.

## Architecture Diagram: How SCP Inheritance Actually Narrows

```
                     [Org Root]
                SCP-A: FullAWSAccess
                SCP-B: Deny (unapproved Regions)
                SCP-C: Deny (stopping CloudTrail)
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
   [OU: Security]   [OU: Workloads]     [OU: Sandbox]
   SCP: FullAccess  SCP: FullAccess      SCP: FullAccess
                    SCP-D: Deny          SCP-E: Deny (p*/x2*/u-* instances)
                    (deleting security   SCP-F: Deny (leaving Org / creating accounts)
                     tools)
                          │
             ┌────────────┴────────────┐
        [OU: Prod]                [OU: Non-Prod]
        SCP-G: Deny               (no additional SCP)
        (delete operations
         without MFA)
                │
        [Account 111111111111]
        Directly attached SCP: none

  ▼ The ceiling of actions actually possible in this account
  FullAWSAccess
    ─ (unapproved Regions)       ← inherited from Root
    ─ (stopping CloudTrail)      ← inherited from Root
    ─ (deleting security tools)  ← inherited from Workloads
    ─ (deletes without MFA)      ← inherited from Prod
  = an intersection narrowed across 4 levels

  Note: Sandbox's SCP-E/F have no effect at all on this account
     (policies of sibling OUs are not inherited)
```

What matters in the figure above is the direction: **"a door that has been closed cannot be opened from below."** No matter how much `Allow: ec2:*` you put in the Prod OU, the Root's Region Deny stays alive. The reason is that an explicit Deny has top priority across the entire IAM evaluation. Conversely, in an Allow-list strategy **every layer must Allow** for a request to pass — if the Root Allows `s3:*` and a child OU Allows only `ec2:*`, then S3 does not work in that child OU's accounts (the intersection is empty). The asymmetry between these two directions is the root cause that makes SCP debugging difficult.

## Zero-Downtime SCP Rollout: Layering a Deny-list onto a Running Org

When you introduce SCPs for the first time to an organization where dozens of accounts are already running, attaching straight to the Root will certainly cause an incident. The standard is 5 steps.

```
Step 1  Observe — data first, without blocking
   ├── Collect every account's CloudTrail into Log Archive with an Organization Trail
   ├── Use Athena to aggregate "Regions, services, and actions actually called in the last 90 days"
   └── Rationale: if you do not know what is actually in use, no Deny is safe

Step 2  Draft — start with a narrow Deny target
   ├── Put only the "Regions with 0 calls" from the Step 1 aggregation into the Deny list
   ├── Global services must be excluded with a NotAction exception
   └── Rationale: blocking what has zero usage history first makes regression risk close to 0

Step 3  Validate in the PolicyStaging OU
   ├── Place one test account that has a replica of a real workload in this OU
   ├── Run the deployment pipeline, batch jobs, and nightly jobs for one full cycle (at least 1 week)
   └── Rationale: looking at weekly traffic only misses month-end batches and quarterly reports

Step 4  Attach gradually: Non-Prod OU → Prod OU
   ├── After attaching to Non-Prod, observe for at least 1-2 weeks
   ├── Keep a permanent alarm on the CloudTrail errorMessage filter for "service control policy"
   └── Rationale: widening the blast radius step by step keeps rollback cost small

Step 5  Promote to Root + establish an exception management process
   ├── Once no problem is confirmed in all OUs, raise it to the Root and remove duplicates below
   ├── Fix the exception flow as ticket → approval → IaC PR → policy update
   └── Rationale: if exceptions are made by hand in the console, drift begins
```

Shortening Step 3 to "a few days" is a common mistake. SCP incidents tend to blow up in **long-cycle jobs** — month-end settlement batches, quarterly audit scripts, certificate automation that renews once a year. Such jobs never appear in weekday daytime traffic. It is safest to observe at least one monthly cycle.

Organizations that adopt a region-restriction SCP share one incident type. If you remove us-east-1 from the approved Regions, issuing ACM certificates for CloudFront is blocked with it — because a CloudFront certificate must live in ACM in us-east-1. That is why the approved list of a region-restriction SCP **almost always includes us-east-1** along with the primary operating Region, and a dual structure is used in which creating EC2 and RDS in us-east-1 is blocked by a separate Deny.

## Real Policies: A 2-Policy Set That Enforces the Organization Boundary

### 1. SCP — Block Leaving the Org and Closing Accounts (Lock the Exit Door)

The moment a member account leaves the Org by itself, every SCP becomes powerless. This policy protects the foundation of governance.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyLeaveOrganization",
    "Effect": "Deny",
    "Action": [
      "organizations:LeaveOrganization",
      "organizations:DeleteOrganization",
      "account:CloseAccount"
    ],
    "Resource": "*"
  }]
}
```

### 2. RCP — Block Entry by External Principals (Lock the Entrance Door)

If the SCP decides "what can our Principals do," the RCP decides "who can reach our resources." You must close both directions to complete the organization boundary.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyExternalPrincipalAccess",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": "*",
    "Condition": {
      "StringNotEqualsIfExists": {
        "aws:PrincipalOrgID": "o-exampleorgid"
      },
      "BoolIfExists": {
        "aws:PrincipalIsAWSService": "false"
      }
    }
  }]
}
```

Unlike an SCP, an RCP has a `Principal` field, because it belongs to the resource-policy family. And the `aws:PrincipalIsAWSService` exception is mandatory — CloudTrail writing logs to S3, or Config storing snapshots, is also evaluated as a "Principal outside the Org." Leave this condition out and the entire logging pipeline silently dies. The reason for using `StringNotEqualsIfExists` is the same — to safely handle cases where the key itself is absent, such as anonymous requests.

## When the Qualifier Changes, the Answer Changes

Here are **4 variants of the same scenario with only the qualifier changed**. The requirement is "prevent the use of unapproved Regions in all member accounts."

| Qualifier | Correct direction | Why |
|-----------|-------------------|-----|
| **LEAST operational overhead** | 1 region-restriction **SCP** on the Root | One attachment covers every account, every Role, and even root. Zero extra work as accounts grow |
| **MOST secure / cannot be bypassed** | SCP + **Control Tower Region Deny control** together | Managed controls include drift detection. Manual changes are detected automatically |
| **MOST cost-effective (zero tooling cost)** | **SCP only** | SCPs and Organizations themselves have no additional charge. Config Rules are billed per rule evaluation |
| **Must also find existing resources / DETECT** | **AWS Config + Config Aggregator** | An SCP only blocks future API calls. It cannot see resources that already exist |

**"SCP covers only the future; Config reaches the past."** Even after you attach an SCP, an EC2 instance already running in an unapproved Region keeps running. If the question text contains "already running," "existing resources," or "identify," an SCP alone is the wrong answer and you need the Config, Security Hub, or Resource Explorer family. Conversely, if it says "prevent," "block," or "must not be able to," it is an SCP.

> 🎯 **Scenario**: "In a regulatory audit, a company was asked to 'prove there are no resources in unapproved Regions.' It must block future creation and also submit the current state as a report. What is the MOST comprehensive approach?" — Answer: **SCP (prevention) + Config Aggregator + Conformance Pack (evidence)**. An SCP alone cannot prove "there are none right now," and Config alone cannot guarantee "there will be none in the future either." When the audit requirement asks for prevention and evidence at the same time, both axes must be in the answer.

`aws organizations update-policy` **replaces the body while it stays attached**. That means if you push a wrong policy, it spreads to every account immediately without any separate approval (propagation can take several minutes). So keep SCPs in Git and force them through a pipeline: PR review → apply to PolicyStaging → promote. Organizations that edit directly in the console suffer incidents without exception.

## Summary

Today's picture is threefold. First, an SCP is **a ceiling, not a grant of permissions**. If you allow only EC2 in an Allow-list, the result is Deny even when an IAM policy gives an S3 Allow. Second, the **Deny-list is the standard strategy**, and you must have the 6 common patterns (region restriction, root block, MFA enforcement, blocking CloudTrail disabling, instance family restriction, whole-service block) burned into your head. Third, since **RCP** (2024) added resource-side restrictions, preventing external exposure of company data can be handled in bulk from one place in the OU.

In the next article we look at **AWS Control Tower and Landing Zone**, which attach SCPs automatically. Attaching SCPs by hand in a 100-account environment is a heavy operational burden, and the Mandatory and Strongly Recommended guardrails of Control Tower reduce that burden.

---

## 📝 Practice Questions

**Question 1.** Which statement about SCP is correct?

A) Grants IAM permissions
B) Applies to Management accounts
C) Sets maximum limit (ceiling), not granting authorization
D) Applies differently per region

**Answer: C**
Explanation: SCP is ceiling. Intersects with IAM policy. Doesn't apply to Management (intentional). Same SCP applies identically to all regions; region differentiation handled via Condition (`aws:RequestedRegion`).

---

**Question 2.** Remove FullAWSAccess SCP on new OU, attach Allow-list with EC2 only. Result?

A) No effect
B) All OU accounts: EC2 OK, S3·DynamoDB etc. implicit Deny
C) Management account only Deny
D) Org deleted

**Answer: B**
Explanation: SCP needs explicit Allow to work. Without FullAWSAccess, implicit Deny on unlisted actions. Even if IAM grants S3 Allow, SCP block takes priority.

---

**Question 3.** Korea data sovereignty: ap-northeast-2 only. Which SCP?

A) Allow `aws:RequestedRegion = ap-northeast-2`
B) Deny `aws:RequestedRegion != ap-northeast-2` + NotAction exceptions for global services (IAM, Org, Route53, CloudFront, GA, WAF)
C) Resource Policy
D) NACL

**Answer: B**
Explanation: Deny pattern + global service NotAction exceptions standard. Global services routed to us-east-1 or are global, need exceptions or OU becomes non-functional. Without them, even `iam:CreateRole` blocked.

---

**Question 4.** Prevent attacker disabling CloudTrail. Best?

A) IAM policy only
B) SCP with `cloudtrail:StopLogging`, `DeleteTrail`, `UpdateTrail` explicit Deny
C) Network ACL
D) WAF

**Answer: B**
Explanation: SCP Deny — no IAM policy can break SCP. Standard baseline after Equifax (2017). Prevents post-breach log tampering. A leaves root and future Roles with gaps.

---

**Question 5.** Auto-allow new AWS services launched? Which SCP strategy?

A) Allow-list
B) Deny-list (FullAWSAccess + specific action Deny)
C) Resource Policy
D) Permission Boundary

**Answer: B**
Explanation: Deny-list auto-allows new services. AWS launches 100+ yearly. Allow-list needs updates. Trade-off: new service attack surface risk → company must mandate pre-review. AWS itself recommends Deny-list.

---

**Question 6.** Pre-validate SCP works correctly? Best?

A) Attach directly to operating OU, monitor
B) PolicyStaging OU (1 test account), validate + IAM Policy Simulator
C) IAM User add
D) Permission Boundary workaround

**Answer: B**
Explanation: PolicyStaging OU standard validation. IAM Policy Simulator supports Org SCP since 2020. AWS Access Analyzer Policy Generation also analyzes CloudTrail 90-day data.

---

**Question 7.** SaaS: company-external Principal cannot access ANY S3 bucket in OU. One-place policy block. Best?

A) Per-bucket Bucket Policy
B) Lambda monitor
C) Resource Control Policy (RCP) OU-level attach (`aws:PrincipalOrgID != o-xxxx` Deny)
D) GuardDuty alert

**Answer: C**
Explanation: RCP (2024) Resource-side restriction. Define once, apply to all OU resources. Prevents 2017 Verizon·Accenture S3 public accidents structurally. SCP is Principal-side, RCP is Resource-side — complementary.

---

**Question 8.** MFA-force SCP uses `BoolIfExists` not `Bool`. Why?

A) Performance
B) MFA key missing from request → `Bool` doesn't match → Deny doesn't work. `BoolIfExists` matches both key-present and key-absent cases
C) Cost
D) Multi-region support

**Answer: B**
Explanation: Subtle difference but decides SCP function. SAML/some auth paths may lack `aws:MultiFactorAuthPresent` key entirely. `Bool` skips evaluation when key missing. `BoolIfExists` evaluates both cases → Deny both.
