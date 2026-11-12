# Day 1 - AWS Organizations Security Governance: SCP Design, Delegated Administrators, and the Central Security Account Model

In a single account, security comes down to the product of IAM policies and resource policies. But in an organization with dozens to hundreds of accounts, the key question becomes who enforces the upper bound on "what can each account administrator do," and how, and where. AWS Organizations is the *governance plane* that defines this upper bound, and its central tool is the SCP (Service Control Policy). On the security exam, Organizations is the area that deals with the "ceiling of permissions": if IAM is the "granting of permissions," think of an SCP as the "maximum boundary of permissions (a permissions boundary at scale)."

## Organization Structure: Root, OUs, Accounts

AWS Organizations is a tree. At the top is the **Root**, beneath it are nested **OUs (Organizational Units)**, and at the bottom are **accounts**. Policies can be attached to any node, whether Root, an OU, or an account, and a policy attached to a node is **inherited** by everything below it.

```
Root
├── SCP: DenyRootUser, DenyRegionLockdown (applies to everything)
├── OU: Security
│   ├── Account: Audit (central logging/detection)
│   └── Account: Log Archive (immutable log storage)
├── OU: Infrastructure
│   └── Account: Networking, SharedServices
├── OU: Workloads
│   ├── OU: Prod  ── SCP: DenyDisableGuardDuty
│   └── OU: NonProd ── SCP: AllowSandboxRegions
└── OU: Suspended ── SCP: DenyAll (for quarantine)
```

The management account (formerly the master account) is the apex of billing and control, the account that created the organization. An important pitfall is that **you should not put workloads in the management account, and SCPs do not apply to it**: SCPs cannot control members of the management account, so running workloads there creates a governance hole.

This is a *layering of permission boundaries*, taking *least privilege* up to organizational scale. It is like the capability model of an operating system, where a parent process can delegate to a child only a subset of the permissions it holds. An SCP defines the "upper bound on the permissions passed down," and IAM defines the "permissions actually granted within it." Only the **intersection** of the two becomes the effective permission.

## The Essence of SCPs: A Boundary, Not a Grant

The classic misunderstanding about SCPs is that "an SCP grants permissions." **An SCP does not grant permissions.** An SCP only defines the *maximum boundary* of the permissions that IAM can grant. For an action to actually be allowed, all of the following must hold:

1. The SCP allows the action (or does not explicitly deny it)
2. An IAM policy (identity/resource) explicitly Allows the action
3. No policy contains an explicit Deny

```
Effective permissions = SCP boundary ∩ IAM Allow − (all Denies)
```

SCPs have two strategies. The **allow list strategy** removes `FullAWSAccess` and lets through only the services that are explicitly allowed (positive). The **deny list strategy** keeps `FullAWSAccess` and denies only dangerous actions (negative). In practice the deny list is easier to operate for most organizations, because you do not have to add an allow every time a new service is released.

## Policy Evaluation Order: What Beats What

The highest-scoring skill on the SCS exam is to decide, without wavering, "does this request pass when several policies overlap?" When AWS evaluates a single API request, it gathers all applicable policy types at once and reaches a conclusion under fixed rules.

```
[ How a single request reaches ALLOW ]

Request = (Principal, Action, Resource, Condition Context)
   │
   ├─(1) Explicit Deny check ── if any policy type has even one Deny ▶ DENY (ends immediately)
   │
   ├─(2) SCP (organization permission boundary) ── if the principal account's effective SCPs do not allow it ▶ DENY
   │
   ├─(3) RCP (organization resource boundary) ── if the resource-side organization ceiling does not allow it ▶ DENY
   │
   ├─(4) Resource-based policy ── an Allow in the same account that names the principal ARN directly
   │                        can pass even without an identity policy (the only exception path)
   │
   ├─(5) Permissions Boundary ── if the boundary does not allow it ▶ DENY
   │
   ├─(6) Session policy (passed at AssumeRole) ── if the session policy does not allow it ▶ DENY
   │
   └─(7) Identity-based policy ── if there is no Allow ▶ implicit DENY (default deny)
                                   │
                                   ▼
                                 ALLOW
```

There are three principles you must hold on to here.

**Principle 1: An explicit Deny is always final.** Wherever it is, whether in an SCP, identity policy, resource policy, permissions boundary, or session policy, a single Deny ends it. "The parent OU denies it, but the account has FullAWSAccess, so it passes" is the archetype of the wrong answer.

**Principle 2: Allow is multiplication, Deny is addition.** Multiple restriction types narrow by intersection (AND), and denials widen by union (OR).

```
Effective permissions = (SCP ∩ RCP ∩ permissions boundary ∩ session policy) ∩ (IAM Allow ∪ resource policy Allow) − (all Denies)
```

**Principle 3: Cross-account needs both sides.** For a role in account A to read an S3 bucket in account B, A's identity policy must Allow and B's bucket policy must Allow as well. Opening only one side does not pass. A resource policy's standalone Allow holds only within the same account.

| Policy type | Attached to | Grants permissions | Restricts permissions | Applies to management account | Typical use |
|---|---|---|---|---|---|
| **SCP** | Root / OU / account | No | Yes (ceiling on principals) | **No, not applied** | Region lockdown, protecting security services, blocking root |
| **RCP** | Root / OU / account | No | Yes (ceiling on resource access) | No, not applied | Blocking data exposure outside the organization |
| **Identity-based IAM** | User / group / role | Yes | Yes | Yes | The core of actual permission granting |
| **Resource-based policy** | Resources such as S3, KMS, SQS, Lambda | Yes (including cross-account) | Yes | Yes | Cross-account sharing, allowing service principals |
| **Permissions boundary** | IAM user / role | No | Yes (ceiling on an individual principal) | Yes | Safely granting IAM creation rights to delegated administrators |
| **Session policy** | AssumeRole session | No | Yes (temporary ceiling) | Yes | Federation, narrowing temporary credentials |

> ⚠️ **Pitfall**: When a question asks "do you use an SCP or a permissions boundary," the deciding criterion is *scope of application*. If it is a **ceiling for an entire account or OU**, it is an SCP; if it is a **ceiling for a single IAM principal** (for example, so that a role created by a developer cannot obtain administrator privileges), it is a permissions boundary. An SCP cannot be attached to selected IAM principals, and a permissions boundary is not automatically inherited by a whole account. Choices that make you swap the two appear in almost every question set.

An SCP is evaluated only *when the principal belongs to a member account*. That is why calls that an AWS service makes in its own name, such as service-linked roles (SLRs), and principals in the management account are outside SCP evaluation. An RCP, conversely, is evaluated based on *the account the resource belongs to*, so it can block the flow of a principal outside the organization trying to access an S3 bucket inside it. In other words, an SCP locks "the door by which our people go out," and an RCP locks "the door by which outsiders come in to our resources." At launch, RCPs support only some services such as S3, STS, KMS, SQS, and Secrets Manager, so a statement like "enforce the organization boundary for all services" is a wrong choice.

## Key SCP Pattern: Region Lockdown

This is the representative pattern for blocking use outside specific Regions because of regulatory or data sovereignty requirements. Global services (IAM, Organizations, CloudFront, Route 53, and so on) must not be locked, so they are handled as exceptions with `NotAction`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideApprovedRegions",
      "Effect": "Deny",
      "NotAction": [
        "iam:*", "organizations:*", "sts:*",
        "cloudfront:*", "route53:*", "waf:*", "wafv2:*",
        "shield:*", "support:*", "globalaccelerator:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
        }
      }
    }
  ]
}
```

The reason `us-east-1` is included among the allowed Regions is that many global service API endpoints are called there. If you leave it out, console tasks such as CloudFront and ACM (global) break. It is an easy pitfall to fall into.

## Key SCP Pattern: Preventing Disabling of Security Controls

This prevents account administrators from turning off the organization's security baseline (GuardDuty, CloudTrail, Config, Security Hub). It is the key to blocking the attack scenario of "turn off detection, then do bad things."

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProtectSecurityServices",
      "Effect": "Deny",
      "Action": [
        "guardduty:DeleteDetector",
        "guardduty:DisassociateFromMasterAccount",
        "guardduty:StopMonitoringMembers",
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail",
        "config:DeleteConfigurationRecorder",
        "config:StopConfigurationRecorder",
        "securityhub:DisableSecurityHub"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": "arn:aws:iam::*:role/OrgSecurityAdminRole"
        }
      }
    }
  ]
}
```

By making an exception only for the security administration role specified in the `Condition`, maintenance automation remains possible while ordinary users cannot turn these services off.

## Key SCP Pattern: Root User and Tag Enforcement

Blocking the use of root user credentials and enforcing required tags are also representative patterns.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyRootUserActions",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringLike": { "aws:PrincipalArn": "arn:aws:iam::*:root" }
      }
    },
    {
      "Sid": "RequireCostCenterTagOnEC2",
      "Effect": "Deny",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "Null": { "aws:RequestTag/CostCenter": "true" }
      }
    }
  ]
}
```

The point often missed in a root-blocking policy is that **it is about designing exceptions, not total blocking**. Some tasks exist that only root can perform in an AWS account (closing the account, changing the support plan, recovering some S3 bucket policies, certain billing settings). So in practice, instead of a blanket `Action: "*"` Deny, you either deny only workload actions and leave a path for account recovery, or you also physically seal the root credentials themselves (hardware MFA token + password stored in split custody). When the exam asks "can you block root usage itself with an SCP," the axis of the correct answer is that **you can block root in member accounts, but you cannot block root in the management account**.

In a tag-enforcement SCP too, you must choose the condition operator precisely.

| Purpose | Condition key / operator | Meaning |
|---|---|---|
| Block if there is no tag at all | `"Null": {"aws:RequestTag/CostCenter": "true"}` | The request lacks that tag key |
| Block if the tag value is outside the allowed list | `"StringNotEquals": {"aws:RequestTag/Env": ["prod","stg","dev"]}` | Value whitelist |
| Prevent attaching tags other than the specified keys | `"ForAnyValue:StringNotEquals": {"aws:TagKeys": [...]}` | Control over the set of keys |
| Control access by the tags already on a resource | `"StringNotEquals": {"aws:ResourceTag/Owner": "${aws:PrincipalTag/Team}"}` | ABAC |

`aws:RequestTag/*` looks at **the tags carried in the creation request**, and `aws:ResourceTag/*` looks at **the tags already attached to the resource**. If you swap the two, the policy is silently neutralized: for enforcement at creation time, using `ResourceTag` means the condition cannot hold because the resource does not exist yet.

## Organization Boundary SCPs: Keeping Data from Leaving the Organization

The most expensive incident in governance is not a permission misconfiguration but **data moving outside the organization boundary**. Flows in which stolen credentials share a snapshot with an external account, or copy S3 data to a bucket in an external account, look like normal API calls if you only look at the IAM Allow. `aws:PrincipalOrgID` and `aws:ResourceOrgID` are the condition keys that draw this boundary.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenySharingSnapshotsOutsideOrg",
      "Effect": "Deny",
      "Action": [
        "ec2:ModifySnapshotAttribute",
        "ec2:ModifyImageAttribute",
        "rds:ModifyDBSnapshotAttribute",
        "rds:ModifyDBClusterSnapshotAttribute"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
      }
    },
    {
      "Sid": "DenyLeavingOrganization",
      "Effect": "Deny",
      "Action": [
        "organizations:LeaveOrganization",
        "organizations:DeleteOrganization",
        "account:CloseAccount"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyDisablingBlockPublicAccess",
      "Effect": "Deny",
      "Action": [
        "s3:PutAccountPublicAccessBlock",
        "s3:PutBucketPublicAccessBlock",
        "ec2:DisableImageBlockPublicAccess"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": "arn:aws:iam::*:role/OrgSecurityAdminRole"
        }
      }
    }
  ]
}
```

`DenyLeavingOrganization` is a control that is often overlooked. If a member account administrator leaves the organization, at that moment all SCPs, the organization CloudTrail, and central detection disappear together. You must lock the fastest path out of governance first.

> 🎯 **Scenario**: In one development account, CloudTrail shows traces of an EBS snapshot being shared with an external AWS account ID. The user's IAM policy had `ec2:*`, and the call succeeded normally. What should you do to structurally prevent repetitions of this type across the whole organization? -> Fixing IAM policies account by account does not scale. You must **attach an SCP** that uses `aws:PrincipalOrgID` (or a condition on the snapshot-sharing target account) **to the Root/OU**, cutting the external-sharing action itself out at the ceiling. Layering GuardDuty's snapshot-sharing-related finding types and EventBridge automated response on top overlaps prevention with detection. A choice that picks only "modify the IAM policy" shows no understanding of the governance plane.

## The Reality of Operating SCPs: Quotas, Inheritance, Debugging

SCPs are trickier to operate than they look as concepts on paper. The exam also asks about these operational constraints.

- **Size limit**: A single SCP document is at most 5,120 bytes. Since it is JSON without whitespace or comments, it fills up quickly in practice. That is why you split controls by purpose into several policies.
- **Attachment count limit**: At most 5 SCPs can be attached to each entity (Root, OU, account), including `FullAWSAccess`. So you have to balance between "putting everything in one policy" and "splitting it finely."
- **Inheritance is intersection**: SCPs attached to the Root, to the OU, and to the account all apply **at the same time**. Something denied at a higher level cannot be revived with an Allow at a lower level.
- **The pitfall of the allow list strategy**: If you remove `FullAWSAccess` and leave only Allow lists, an action must be explicitly allowed at both the higher and lower levels to pass. If the parent OU allows only `s3:*` and the lower level allows `ec2:*`, EC2 still does not open.

```
Root SCP:  Allow [s3:*, iam:*, cloudwatch:*]
  └ OU SCP: Allow [s3:*, ec2:*]
        └ Effective boundary = intersection = [s3:*]   ← neither ec2 nor iam passes
```

Debug in the following order. (1) Check the identity policy itself with the IAM Policy Simulator; (2) check whether the `errorCode` in CloudTrail is `AccessDenied` and whether the message has wording related to organization policy; (3) query the effective policy actually applied to the account with `describe-effective-policy`.

> ⚠️ **Pitfall**: An SCP change **propagates immediately, but it does not revoke the validity of temporary credentials that have already been issued.** Because SCPs are evaluated at request time, new requests are blocked from then on, but the statement "since I attached the SCP, sessions in progress end immediately" is wrong. To actually neutralize a session you need to change the role trust policy, use a Deny with an `aws:TokenIssueTime` condition, or revoke the credentials. In compromise-response scenarios, this distinction decides the correct answer.

## What SCPs Cannot Control

The exam always asks about the *limits* of SCPs. SCPs cannot control the following:

- **Members of the management account**: Mentioned above. The management account is free from SCPs.
- **Service-linked roles (SLRs)**: SLRs that AWS services create and use automatically are not affected by SCPs.
- **External cross-account grants through resource-based policies**: An SCP is a ceiling on the permissions of *principals* in the organization, so access coming in from outside (allowed by a resource policy) must be handled separately.
- **Granting permissions**: Stressed repeatedly: an SCP is only a ceiling, not a floor (a grant).

An SCP also pairs with the **RCP (Resource Control Policy)**. If an SCP is the ceiling on "what the principals of this organization can do," an RCP is the ceiling on "who can access the resources of this organization." For example, an RCP can prevent an S3 bucket from being exposed to principals outside the organization, across the entire organization.

## Delegated Administrator

Concentrating all security operations in the management account is an anti-pattern. The management account handles only billing and organization control, and actual security service operations are delegated to a separate **delegated administrator account** (usually the Audit/Security account).

```bash
# Designate a GuardDuty delegated administrator (run in the management account)
aws organizations register-delegated-administrator \
  --account-id 222233334444 \
  --service-principal guardduty.amazonaws.com

# Security Hub, Config, Macie, IAM Access Analyzer, Detective,
# Firewall Manager, and others can be delegated with the same pattern
```

Benefits of the delegated administrator model:
- It reduces the attack surface of the management account (minimizes blast radius).
- The security team can operate security services without the management account's billing and organization permissions (separation of duties).
- Each security service becomes a hub that automatically enrolls and manages members across the organization.

This is the organizational implementation of *Separation of Duties* and *least privilege*. NIST SP 800-53's AC-5 (separation of duties) requires that no single entity control the entire process. If you separate the management account (billing, organization) from the delegated administrator (security operations), the takeover of one account does not hand over all control.

## The Central Security Account Model

AWS's recommended multi-account security architecture (SRA, Security Reference Architecture) concentrates security functions in two dedicated accounts:

- **Security Tooling (Audit) account**: The delegated administrator for GuardDuty, Security Hub, Config, Macie, and Detective. Organization-wide detection results (findings) are aggregated here. Automated response (Lambda, EventBridge) is also orchestrated here.
- **Log Archive account**: An **immutable** log store into which flow the CloudTrail organization trail, Config snapshots, VPC Flow Logs, and CloudWatch logs. It is protected with S3 Object Lock, MFA Delete, a separate KMS key, and a strict bucket policy.

```
Workload accounts ──(org CloudTrail)──▶ Log Archive (immutable S3, Object Lock)
       │
       └──(GuardDuty/Config/SecurityHub members)──▶ Audit (delegated administrator, aggregation and response)
```

When the organization CloudTrail is enabled in the management account, it applies automatically to all member accounts, and member account administrators can neither turn it off nor view it (read-only). This is the starting point of governance that makes it impossible to "turn off detection."

Drawing the whole picture in one diagram looks like this.

```
                        ┌──────────────────────────────┐
                        │  Management account           │
                        │  · create org / billing / attach SCPs │
                        │  · no workloads (SCPs do not apply)   │
                        │  · root credentials physically sealed │
                        └───────────┬──────────────────┘
                                    │ register-delegated-administrator
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ OU: Security   │        │ OU: Infrastructure│        │ OU: Workloads    │
│                │        │                   │        │  ├ OU: Prod      │
│ ┌────────────┐ │        │ ┌───────────────┐ │        │  └ OU: NonProd   │
│ │ Audit acct │ │◀───findings────────────────────────────┐         │
│ │ GuardDuty  │ │        │ │ Network acct  │ │        │  │ App accts │
│ │ SecurityHub│ │        │ │ TGW/NFW/DNS   │ │        │  │          │
│ │ Config agg │ │        │ └───────────────┘ │        │  └──────────┘
│ │ AuditMgr   │ │        │ ┌───────────────┐ │        │       │
│ │ FMS Admin  │ │        │ │ SharedServices│ │        │       │
│ └────────────┘ │        │ └───────────────┘ │        │       │
│ ┌────────────┐ │        └──────────────────┘        │       │
│ │ Log Archive│ │◀───── org CloudTrail / Config / Flow Logs ┘
│ │ S3 ObjLock │ │        (member accounts write only; cannot delete or stop)
│ │ Dedicated KMS│ │
│ └────────────┘ │
└────────────────┘

Key asymmetry: workload accounts can only "send" logs; they cannot read or delete them.
```

This asymmetry is the essence of governance. Even if an intruder completely takes over a workload account, if they cannot erase the evidence in the Log Archive account, post-incident tracing and legal evidentiary value survive.

In June 2014, **Code Spaces**, a UK code hosting company, had an attacker gain access to the company's AWS console control panel and demand money; when the company tried to regain control, the attacker deleted EBS snapshots, S3 buckets, AMIs, and instances en masse. Because the backups were in the same AWS account, the data and the backups disappeared together, and the company ceased business. This incident shows why the principle that "backups and logs must be kept in a *different trust boundary from the operating account*" is not an option but a condition of survival. Today's response is a separate Log Archive account + S3 Object Lock + MFA Delete + cross-account permission separation, and cutting destructive actions such as `organizations:LeaveOrganization` and `s3:DeleteBucket` out with an SCP.

> 🎯 **Scenario**: The security team must operate organization-wide GuardDuty, Security Hub, and Config, but an audit requirement says they must never receive access to billing information or permission to change the organization structure. You also need to block any path by which the security team could grant itself administrator privileges. How do you design it? -> (1) Register the Audit account as the **delegated administrator** of each security service, so organization-wide operation is possible without management account permissions. (2) Apply an SCP that makes a **permissions boundary** mandatory (an `iam:PermissionsBoundary` condition on `iam:CreateRole`), so the security team can create IAM roles inside the Audit account but those roles cannot exceed a specific ceiling. (3) Put no human users in the management account, and access it only through IAM Identity Center. If you pick only the delegated administrator as the answer, the self-privilege-escalation path in (2) is left open.

## Cementing Understanding with the CLI

```bash
# 1) Inspect the organization structure
aws organizations describe-organization
aws organizations list-roots
aws organizations list-organizational-units-for-parent --parent-id r-exam
aws organizations list-accounts-for-parent --parent-id ou-exam-prod

# 2) Create an SCP (region lockdown)
aws organizations create-policy \
  --name "RegionLockdown-APNE2" \
  --type SERVICE_CONTROL_POLICY \
  --description "Block everything except ap-northeast-2 and global services" \
  --content file://region-lockdown-scp.json

# 3) Attach it to an OU
aws organizations attach-policy \
  --policy-id p-exampleid \
  --target-id ou-exam-prod

# 4) List the policies actually applied to a specific account
aws organizations list-policies-for-target \
  --target-id 111122223333 \
  --filter SERVICE_CONTROL_POLICY

# 5) Query the "effective policy" with inheritance applied (tag policy, backup policy, etc.)
aws organizations describe-effective-policy \
  --policy-type TAG_POLICY \
  --target-id 111122223333

# 6) Register delegated administrators: repeat for each security service
for SVC in guardduty securityhub config-multiaccountsetup \
           access-analyzer macie detective fms auditmanager; do
  aws organizations register-delegated-administrator \
    --account-id 222233334444 \
    --service-principal ${SVC}.amazonaws.com
done

aws organizations list-delegated-administrators

# 7) Organization-wide CloudTrail (once, in the management account)
aws cloudtrail create-trail \
  --name org-trail \
  --s3-bucket-name org-log-archive-bucket \
  --is-organization-trail \
  --is-multi-region-trail \
  --enable-log-file-validation \
  --kms-key-id arn:aws:kms:ap-northeast-2:333344445555:key/xxxx

# 8) Move an account to the quarantine OU (during compromise response)
aws organizations move-account \
  --account-id 111122223333 \
  --source-parent-id ou-exam-prod \
  --destination-parent-id ou-exam-quarantine
```

The "move to the quarantine OU" in step 8 is a powerful card in real response. If you create in advance a Suspended/Quarantine OU with a `DenyAll` SCP attached, a single call moving the compromised account into that OU blocks the API actions of the whole account at the ceiling. It is far faster and more reliable than revoking IAM policies inside the account one by one.

`enable-log-file-validation` makes CloudTrail also write digest files containing the SHA-256 hashes and signatures of the log files. It is the basis for proving in audit and forensics that "these logs have not been tampered with," and it is also included in Control Tower's mandatory controls. When you encrypt the Log Archive bucket with KMS, the key policy must allow `kms:GenerateDataKey*` for the CloudTrail service principal; if you miss this, logs are not recorded at all and it fails silently, which easily causes the symptom "logs are not accumulating."

## Pitfall Summary

- An SCP *does not grant* permissions. Without an IAM Allow, access is impossible even if the SCP allows it.
- SCPs do *not apply to members of the management account* -> no workloads in the management account.
- If a region lockdown SCP does not make exceptions for global services and `us-east-1`, the console breaks.
- A security-service-disabling prevention SCP blocks automation if it omits the *maintenance role exception*.
- Move security operations to a *delegated administrator* and use the management account only for billing and the organization.
- In the allow list strategy, an action must be allowed at *both the higher and lower levels* to pass (intersection). Allowing it only at the lower level does not open it.
- Swapping `aws:RequestTag` (tags on the creation request) and `aws:ResourceTag` (tags on existing resources) silently neutralizes the policy.
- An SCP is evaluated at request time: attaching it does *not cut off sessions of temporary credentials already issued*.
- An SCP is the principal ceiling, an RCP is the resource access ceiling. The direction is opposite.
- If you do not block leaving the organization (`organizations:LeaveOrganization`), the entire governance can be nullified by a single API call.

## Summary

- [ ] Are there no workloads or human users in the management account, and are the root credentials physically sealed?
- [ ] Did you compute effective permissions as the intersection with the IAM Allow, on the premise that an SCP is a *ceiling, not a grant*?
- [ ] Does the region lockdown SCP include the global-services `NotAction` exception and `us-east-1`?
- [ ] Does the security-service-disabling prevention SCP have a `Condition` exception for the maintenance role?
- [ ] Did you block leaving the organization, closing accounts, and disabling Block Public Access with SCPs?
- [ ] Did you block external sharing of snapshots and AMIs with an `aws:PrincipalOrgID` condition?
- [ ] Did you delegate GuardDuty, Security Hub, Config, Audit Manager, and FMS all to the Audit account?
- [ ] Does the organization CloudTrail accumulate in Log Archive with multi-Region + log file validation + a dedicated KMS key?
- [ ] Does the Log Archive bucket have Object Lock, MFA Delete, and a least-privilege bucket policy?
- [ ] Have you created in advance a quarantine OU with a `DenyAll` SCP so you can move a compromised account into it immediately?

---

## 📝 Practice Questions

**Question 1.** An OU still has `FullAWSAccess` attached, and an IAM user has been granted an `s3:GetObject` Allow. However, an SCP attached to the parent Root denies `s3:*`. Can this user read S3 objects?

A) Yes — because the IAM Allow takes precedence over the SCP  
B) No — because the explicit Deny in the SCP overrides the IAM Allow  
C) Yes — because the OU has FullAWSAccess  
D) Only the account administrator can read them  

**Answer: B**  
Explanation: The effective permissions are the intersection of the SCP boundary and the IAM Allow, minus all Denies. If an SCP on a higher node explicitly denies, access is impossible no matter where an Allow exists below. It is a misconception that an IAM Allow takes precedence over an SCP, and FullAWSAccess does not override a Deny. Even an account administrator is subject to the SCP Deny in the same way (except members of the management account).

---

**Question 2.** Due to a regulatory requirement, we want to use an SCP to prevent workloads from being created outside ap-northeast-2. What is the most correct design?

A) Deny all actions outside ap-northeast-2 with no exceptions  
B) Use `NotAction` to exempt global services such as IAM, CloudFront, and Route 53, Deny when `aws:RequestedRegion` is not an allowed Region, and include us-east-1 in the allow list  
C) Restrict Regions in each account's IAM policies  
D) Block traffic to other Regions with NACLs  

**Answer: B**  
Explanation: A Region-lock SCP exempts global services with `NotAction` and denies non-allowed Regions with an `aws:RequestedRegion` condition, but us-east-1, where many global APIs are called, must be in the allow list so that the console, ACM, and CloudFront do not break. A blanket Deny with no exceptions kills global services too. IAM policies are distributed per account and unsuitable for governance, and NACLs are unrelated to API Region control.

---

**Question 3.** The security team wants to operate GuardDuty organization-wide without receiving the management account's billing and organization permissions. What is the correct method?

A) Create security team IAM users in the management account  
B) Register the Audit account as the GuardDuty delegated administrator (register-delegated-administrator) and have the security team operate from that account  
C) Operate GuardDuty individually in each workload account  
D) Share the root user  

**Answer: B**  
Explanation: The delegated administrator model reduces the attack surface of the management account and separates duties. Registering the Audit account as the GuardDuty delegated administrator lets the security team operate organization-wide detection without billing or organization permissions. Putting users in the management account enlarges the blast radius, operating individually per account loses aggregation and consistency, and sharing root directly conflicts with separation of duties.

---

**Question 4.** Which of the following can NOT be controlled by an SCP?

A) The upper limit of ec2:RunInstances permission for a workload account administrator  
B) An attempt to stop CloudTrail logging in a member account  
C) Actions of an IAM user belonging to the management account  
D) Blocking use of a specific Region in a member account  

**Answer: C**  
Explanation: SCPs do not apply to members of the management account. Therefore the actions of a management account IAM user cannot be restricted by an SCP, which is why the principle of not placing workloads in the management account exists. All the others are within the normal control scope of SCPs: capping permissions, preventing disabling of security services, and blocking Regions are typical uses of SCPs.

---

**Question 5.** In the central security account model recommended by the AWS SRA, which combination of the account dedicated to immutable log retention and its protection measures is most appropriate?

A) Audit account — retain logs with Security Hub  
B) Log Archive account — ensure immutability with S3 Object Lock, MFA Delete, a dedicated KMS key, and a strict bucket policy  
C) Management account — store all logs directly  
D) Each workload account — retain logs locally  

**Answer: B**  
Explanation: The SRA separates the Audit (Security Tooling) account, which handles detection aggregation and response, from the Log Archive account, which retains immutable logs. The Log Archive account prevents log tampering and deletion with S3 Object Lock (WORM), MFA Delete, a dedicated KMS key, and a least-privilege bucket policy. The Audit account is an analysis and response hub, not for retention, the management account is dedicated to billing and organization, and keeping logs locally in workloads is unsuitable because they could be deleted along with the workload if it is compromised.

---
