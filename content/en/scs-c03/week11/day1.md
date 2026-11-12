# Day 1 - AWS Organizations Security Governance: SCP Design, Delegated Administrators, Central Security Account Model

Security in a single account ends with the intersection of IAM policies and resource policies. However, in organizations with tens to hundreds of accounts, the critical question becomes: "Who, how, and where enforces the upper limit of what each account administrator can do?" AWS Organizations is the *governance plane* that defines this upper limit, and its central tool is SCP (Service Control Policy). In the security exam, Organizations covers the "ceiling of permissions"; if IAM is about "granting permissions," SCP is about "permission boundary at scale."

## Organization Structure: Root, OU, Accounts

AWS Organizations is a tree structure. At the top is the **Root**, below it are nested **Organizational Units (OUs)**, and at the bottom are **Accounts**. Policies can be attached to any node (Root, OU, Account), and those policies automatically **inherit** to all nodes below.

```
Root
├── SCP: DenyRootUser, DenyRegionLockdown (applies to all)
├── OU: Security
│   ├── Account: Audit (central log/detection)
│   └── Account: Log Archive (immutable log retention)
├── OU: Infrastructure
│   └── Account: Networking, SharedServices
├── OU: Workloads
│   ├── OU: Prod  ── SCP: DenyDisableGuardDuty
│   └── OU: NonProd ── SCP: AllowSandboxRegions
└── OU: Suspended ── SCP: DenyAll (isolation)
```

The Management Account (formerly Master Account) is the apex of billing and control that created the organization. A critical trap: **do not run workloads in the Management Account, and SCPs do not apply to it**. Because SCPs cannot control members of the Management Account, running workloads there becomes a governance hole.

> 💡 **Related Theory**: This is *layered permission boundaries* extending *least privilege* to organizational scale. Like capability models in operating systems where parent processes can delegate only a subset of their own permissions to children, SCP defines "the upper limit of permissions to pass down," and IAM defines "the actual permissions granted within that limit." Only their **intersection** becomes effective permission.

## The Essence of SCP: Boundary, Not Grant

The most common misconception about SCP is that "SCP grants permissions." **SCP does not grant permissions.** SCP only defines the *maximum boundary* of permissions that IAM can grant. For any action to actually be allowed, all of the following must be satisfied:

1. SCP allows it (or does not explicitly deny it)
2. IAM policy (identity/resource) explicitly Allows it
3. No policy has explicit Deny

```
Effective Permission = SCP Boundary ∩ IAM Allow − (all Deny)
```

There are two SCP strategies. **Allow list strategy** removes `FullAWSAccess` and only passes explicitly permitted services (positive). **Deny list strategy** keeps `FullAWSAccess` but only denies risky actions (negative). Most practical deployments use Deny list because it's easier to operate — no need to add allow every time a new service launches.

## Core SCP Pattern: Region Lockdown

The most common pattern is blocking usage outside specific regions due to regulatory or data sovereignty requirements. Global services (IAM, Organizations, CloudFront, Route 53, etc.) must not be locked down, so we use `NotAction` to exclude them.

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

The reason for including `us-east-1` in approved regions is that many global service API endpoints are called from there. Omitting this breaks console operations for CloudFront and ACM (global) — a common exam trap.

## Core SCP Pattern: Prevent Security Control Disabling

Prevent account administrators from turning off security baseline (GuardDuty, CloudTrail, Config, Security Hub). This blocks the attack scenario of "turn off detection and do bad things."

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

Using `Condition` to specify only security admin roles as exceptions allows maintenance automation while preventing general users from disabling.

## Core SCP Pattern: Root User and Tag Enforcement

Blocking root user credential usage and enforcing required tags are also common patterns.

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

## What SCP Cannot Control

Exams always ask about the *limitations* of SCP. SCP cannot control:

- **Management Account Members**: As mentioned, the Management Account is exempt from SCP.
- **Service-Linked Roles (SLR)**: SLRs automatically created and used by AWS services are not affected by SCP.
- **External Cross-Account Access via Resource-Based Policies**: SCP limits *principals* within the organization, so access allowed by resource policy from outside is handled separately.
- **Permission Grant**: Again, SCP is a ceiling, not a floor.

Additionally, SCP pairs with **RCP (Resource Control Policy)**. If SCP is the upper limit of "what can this organization's principal do," RCP is the upper limit of "who can access this organization's resources." For example, you can use RCP organization-wide to prevent S3 buckets from being exposed to principals outside the organization.

## Delegated Administrator

Concentrating all security operations in the Management Account is an antipattern. The Management Account should only handle billing and organization control, while actual security service operations are delegated to a separate **Delegated Administrator Account** (typically an Audit/Security account).

```bash
# Register GuardDuty delegated administrator (run from Management Account)
aws organizations register-delegated-administrator \
  --account-id 222233334444 \
  --service-principal guardduty.amazonaws.com

# Security Hub, Config, Macie, IAM Access Analyzer, Detective,
# Firewall Manager, etc. can all be delegated with the same pattern
```

Benefits of the delegated administrator model:
- Reduces the attack surface of the Management Account (minimize blast radius).
- Security team operates security services without Management Account's billing and organization permissions (separation of duties).
- Each security service becomes a hub that automatically enrolls and manages organization-wide members.

> 💡 **Related Theory**: This is the organizational implementation of *Separation of Duties* and *least privilege*. NIST SP 800-53's AC-5 (Separation of Duties) requires that no single subject control the entire process. Separating Management Account (billing/organization) from Delegated Administrators (security operations) means compromise of one account doesn't surrender complete control.

## Central Security Account Model

AWS's recommended multi-account security architecture (SRA, Security Reference Architecture) concentrates security functions into two dedicated accounts:

- **Security Tooling (Audit) Account**: Delegated Administrator for GuardDuty, Security Hub, Config, Macie, and Detective. Organization-wide detection findings aggregate here. Automated response (Lambda, EventBridge) is also orchestrated from here.
- **Log Archive Account**: **Immutable** log repository where Organization CloudTrail, Config snapshots, VPC Flow Logs, and CloudWatch logs flow in. Protected with object lock (S3 Object Lock), MFA Delete, dedicated KMS key, and strict bucket policy.

```
Workload Accounts ──(Organization CloudTrail)──▶ Log Archive (immutable S3, Object Lock)
       │
       └──(GuardDuty/Config/SecurityHub members)──▶ Audit (delegated admin, aggregation/response)
```

Organization CloudTrail activated from the Management Account automatically applies to all member accounts, and member account administrators cannot disable or view it (read-only). This is the governance starting point for "preventing detection bypass."

## Trap Summary

- SCP does *not grant* permissions. Without IAM Allow, even if SCP permits, access is denied.
- SCP does *not apply to Management Account members* → No workloads in Management Account.
- Missing global services and `us-east-1` exception in region-lock SCP breaks console, CloudFront, and ACM.
- Preventing security service disabling SCP requires *maintenance role exception* or automation breaks.
- Move security operations to *delegated administrator* and use Management Account only for billing and organization.

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
