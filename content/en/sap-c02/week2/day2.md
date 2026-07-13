# Day 2 - Service Control Policy: The Ceiling as a Thinking Tool

90% of people who understand SCP as an "authorization policy" and enter the exam will miss Domain 1. The essence of SCP can be expressed in one sentence — **"SCP never grants permissions. It only sets the maximum limit (ceiling) of what permissions can be allowed."** Failing to understand this one sentence means you'll be confused on every "4 correct SCP statements" scenario in the Pro exam.

Before SCP appeared, there was no way to enforce "the root user of all accounts cannot do X" in a multi-account environment. IAM policies only apply to IAM Users/Roles within an account and pass through root. AWS Config Rule only detects violations after the fact, not blocking them. So security teams had to build complex automation with Lambda + Config + alarms + auto-cleanup themselves. When Organizations and SCP launched in 2017, this simplified. **Once you attach an SCP to an OU or account, all Principals in that OU (including root) cannot perform actions the SCP doesn't allow.**

Today we cover SCP's essence, evaluation order, Allow-list vs Deny-list strategies, 6 common patterns, debugging techniques, and the new **Resource Control Policy (RCP)** launched in 2024.

## The Essence of SCP: Not Authorization, But a Ceiling

Two facts matter most:

1. **SCP grants no permissions.** An empty SCP (`{"Statement": []}`) makes all actions implicitly Denied.
2. **Even if IAM policy grants Allow, if SCP omits that action, the result is ultimately Deny.**

```
Actual Permissions = SCP ceiling ∩ Permission Boundary ∩ IAM Identity Policy ∩ Resource Policy ∩ ...
```

> 💡 **Related theory**: This model has **upper bound + intersection** structure from mathematics. SCP defines the lattice's supremum (upper bound), and actual permissions are the intersection of that supremum with policies below. AWS IAM Access Analyzer's **Zelkova** engine formally analyzes this. Zelkova is an SMT (Satisfiability Modulo Theories) solver based on Microsoft Research, mathematically proving whether an IAM policy allows external Principals access. [AWS re:Inforce 2019 talk](https://aws.amazon.com/blogs/security/protect-sensitive-data-in-the-cloud-with-advanced-hsm-and-access-controls/).

> 🔍 **Going deeper**: SCP evaluation is the **top gate** of IAM evaluation. When a request arrives: (1) SCP passes? → If no, Deny, (2) Permission Boundary passes? → If no, Deny, (3) Comprehensive evaluation of Identity Policy + Resource Policy + Session Policy. SCP can block first and fastest. So company-level "must not" rules (e.g., regions other than us-east-1 forbidden) in SCP apply to all member accounts and all IAM Roles.

> ⚠️ **Pitfall**: "SCP also applies to Management accounts" is a trap. Management accounts are NOT SCP targets (intentional). Management's IAM Users can use all permissions without SCP. That's why workloads shouldn't be on Management — if breached, no SCP protection.

## FullAWSAccess vs Empty SCP: Implicit Deny Pitfall

- **FullAWSAccess** (default): All actions Allow — no SCP restriction.
- **Empty SCP** (`{"Statement": []}`): All actions Deny — account won't work.

When a new OU is created, FullAWSAccess is attached by default. Remove it and attach only your custom Allow-list SCP, and **all actions not explicitly listed in that OU's accounts become implicitly Denied**.

> ⚠️ **Pitfall**: "S3 works but we only allowed EC2 in the Allow-list SCP" means **"SCP doesn't have S3 Allow."** Even if IAM policy grants S3 Allow, SCP blocking takes priority. This trap appears frequently in Pro exams.

## Allow-list vs Deny-list Strategy

| Strategy | Behavior | Use |
|----------|----------|-----|
| **Deny-list** (recommended) | FullAWSAccess + add Deny rules | General workloads, flexible |
| **Allow-list** | Remove FullAWSAccess + Allow rules only | Strict isolation, restricted OUs (some Sandbox) |

Most organizations use **Deny-list strategy**. When AWS launches new services, they're automatically allowed.

> 🔍 **Going deeper**: AWS launches 100+ new services yearly. Operating with Allow-list means updating SCP every time a new service launches. Deny-list is "only deny risky actions," so new services auto-allow. However, Deny-list has "risk of attackers exploiting new services" → company policy must mandate pre-review for new services.

> 💡 **Related theory**: The **default-deny vs default-allow** trade-off in security policy is discussed since the 1970s. NIST SP 800-53 AC-3 (Access Enforcement) recommends default-deny by "principle of fail-safe defaults." But in fast-evolving environments like cloud, default-allow + targeted-deny reduces operational burden. AWS itself recommends Deny-list.

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

> ⚠️ **Pitfall**: Global services (IAM, Organizations, Route 53, CloudFront, GA, WAF, Shield) are handled in us-east-1 or are global. Without `NotAction` exceptions, even `iam:CreateRole` gets blocked, making the entire OU non-functional.

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

> 🔍 **Going deeper**: Using `Bool` makes requests with no MFA key evaluate to `null`, so Deny doesn't work. `BoolIfExists` evaluates if key exists, doesn't match if missing — both cases Deny. Missing this subtle difference causes SCP to fail.

### Pattern 4: Block CloudTrail·GuardDuty Disabling

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

> 📚 **Case study**: 2017 Equifax breach. After intrusion via Apache Struts CVE, attackers bypassed some security logs. With AWS Organizations + this SCP, post-breach log tampering would have been blocked. Post-incident, NIST CSF and PCI-DSS v4.0 (2022) began explicitly requiring log immutability.

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

### Pattern 6: Block Entire Service

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
All Parent OU SCPs ─ Pass? ─ N → Deny
 │
 ▼
Account Direct SCP ─ Pass? ─ N → Deny
 │
 ▼
IAM Identity Policy + Resource Policy + Boundary
 │
 ▼
Final Allow
```

> 🔍 **Going deeper**: If parent OU's SCP is stricter, child OUs can't relax it (inheritance). Example: Root has "Deny non-ap-northeast-2", child OU's "Allow us-east-1" doesn't override. SCP is one-way intersect — only narrows downward. Similar to Unix file permission's umask — permissions closed by umask stay closed.

## SCP Debugging: Finding "Why Doesn't It Work"

1. **Check CloudTrail's errorCode** — Shows whether it's SCP or IAM AccessDenied. SCP blocking shows "explicit deny in a service control policy" in errorMessage.
2. **IAM Policy Simulator** — Can now simulate Org SCP (added 2020).
3. **Temporarily test SCP in PolicyStaging OU** then attach to main OU.
4. **AWS Access Analyzer + Policy Generation** — Analyze CloudTrail 90-day data, extract actual used actions, generate minimal IAM policy.

> 🎯 **Scenario**: "After applying SCP, some Lambda functions don't work. Find root cause quickly?" — Answer: **Filter CloudTrail's errorMessage + IAM Policy Simulator with SCP included**. CloudTrail explicitly includes "service control policy" in errorMessage when blocked by SCP, so grep finds it quickly. Input Lambda execution Role to Simulator → verify SCP passes.

## Resource Control Policy (RCP): 2024 New Feature

Launched November 2024. SCP restricts Principal side, **RCP restricts Resource side**.

| Policy | Applied To | Example |
|--------|-----------|---------|
| **SCP** | Principal (IAM User/Role) | "Any IAM Role in this OU can't use regions other than us-east-1" |
| **RCP** | Resource (S3 bucket, SQS, KMS, etc.) | "Any S3 bucket in this OU, outside-company Principals can't see" |

> 🔍 **Going deeper**: RCP blocks **confused deputy** attacks at OU level. Example: Developer in member account accidentally puts `Principal: "*"` in S3 bucket Resource Policy → external access possible. RCP with `"Condition": {"StringNotEquals": {"aws:PrincipalOrgID": "o-xxxx"}}` Deny on all S3 buckets in the OU → outside-org Principals blocked everywhere. One line prevents all accounts from external exposure.

> 📚 **Case study**: 2017 Verizon, Booz Allen Hamilton, Accenture had S3 bucket public-setting mistakes causing data leaks. 2018 GoDaddy similar incident. Same pattern repeats yearly because validating IAM Policy and Resource Policy on all buckets is hard. RCP sets policy once at OU level, automatically applying to all resources — structurally prevents these breaches.

## Declarative Policies, Backup Policies, Tag Policies

Organizations provides policy types beyond SCP.

| Policy Type | Purpose |
|-----------|---------|
| **Tag Policy** | Enforce tag key·value standards (e.g., `Environment=prod\|dev\|stg`) |
| **Backup Policy** | Enforce AWS Backup standards (e.g., daily backup, 35-day retention) |
| **AI Services Opt-out** | Prevent AI services using customer data for training |
| **Chatbot Policy** | Restrict Slack/Teams integration |
| **Declarative Policy** (2024) | Force EC2 IMDSv2, enforce EBS encryption, etc. |

## CLI Direct View

```bash
# Create SCP
aws organizations create-policy \
  --name DenyRegions \
  --type SERVICE_CONTROL_POLICY \
  --content file://deny-regions.json

# Attach to OU
aws organizations attach-policy \
  --policy-id p-xxxx --target-id ou-yyyy

# List SCPs attached to OU
aws organizations list-policies-for-target \
  --target-id ou-yyyy \
  --filter SERVICE_CONTROL_POLICY

# Simulate effect (IAM Policy Simulator API)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:role/MyRole \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::my-bucket/*
```

## Summary

The picture today is threefold. First, **SCP is not authorization but a ceiling**. Allow-list with only EC2 means even if IAM grants S3, result is Deny. Second, **Deny-list is standard strategy** — know the 6 common patterns (region restriction, root block, MFA force, CloudTrail disable block, instance family restriction, service-wide block) by heart. Third, **RCP** (2024) added Resource-side restrictions, enabling one place to prevent company-external exposure.

Next article we explore **AWS Control Tower and Landing Zone** that auto-attach SCP. In 100-account environments, manually attaching SCP is operationally heavy; Control Tower's Mandatory and Strongly Recommended guardrails reduce that burden.

---

## 📝 연습 문제

**문제 1.** Which statement about SCP is correct?

A) Grants IAM permissions
B) Applies to Management accounts
C) Sets maximum limit (ceiling), not granting authorization
D) Applies differently per region

**정답: C**
해설: SCP is ceiling. Intersects with IAM policy. Doesn't apply to Management (intentional). Same SCP applies identically to all regions; region differentiation handled via Condition (`aws:RequestedRegion`).

---

**문제 2.** Remove FullAWSAccess SCP on new OU, attach Allow-list with EC2 only. Result?

A) No effect
B) All OU accounts: EC2 OK, S3·DynamoDB etc. implicit Deny
C) Management account only Deny
D) Org deleted

**정답: B**
해설: SCP needs explicit Allow to work. Without FullAWSAccess, implicit Deny on unlisted actions. Even if IAM grants S3 Allow, SCP block takes priority.

---

**문제 3.** Korea data sovereignty: ap-northeast-2 only. Which SCP?

A) Allow `aws:RequestedRegion = ap-northeast-2`
B) Deny `aws:RequestedRegion != ap-northeast-2` + NotAction exceptions for global services (IAM, Org, Route53, CloudFront, GA, WAF)
C) Resource Policy
D) NACL

**정답: B**
해설: Deny pattern + global service NotAction exceptions standard. Global services routed to us-east-1 or are global, need exceptions or OU becomes non-functional. Without them, even `iam:CreateRole` blocked.

---

**문제 4.** Prevent attacker disabling CloudTrail. Best?

A) IAM policy only
B) SCP with `cloudtrail:StopLogging`, `DeleteTrail`, `UpdateTrail` explicit Deny
C) Network ACL
D) WAF

**정답: B**
해설: SCP Deny — no IAM policy can break SCP. Standard baseline after Equifax (2017). Prevents post-breach log tampering. A leaves root and future Roles with gaps.

---

**문제 5.** Auto-allow new AWS services launched? Which SCP strategy?

A) Allow-list
B) Deny-list (FullAWSAccess + specific action Deny)
C) Resource Policy
D) Permission Boundary

**정답: B**
해설: Deny-list auto-allows new services. AWS launches 100+ yearly. Allow-list needs updates. Trade-off: new service attack surface risk → company must mandate pre-review. AWS itself recommends Deny-list.

---

**문제 6.** Pre-validate SCP works correctly? Best?

A) Attach directly to operating OU, monitor
B) PolicyStaging OU (1 test account), validate + IAM Policy Simulator
C) IAM User add
D) Permission Boundary workaround

**정답: B**
해설: PolicyStaging OU standard validation. IAM Policy Simulator supports Org SCP since 2020. AWS Access Analyzer Policy Generation also analyzes CloudTrail 90-day data.

---

**문제 7.** SaaS: company-external Principal cannot access ANY S3 bucket in OU. One-place policy block. Best?

A) Per-bucket Bucket Policy
B) Lambda monitor
C) Resource Control Policy (RCP) OU-level attach (`aws:PrincipalOrgID != o-xxxx` Deny)
D) GuardDuty alert

**정답: C**
해설: RCP (2024) Resource-side restriction. Define once, apply to all OU resources. Prevents 2017 Verizon·Accenture S3 public accidents structurally. SCP is Principal-side, RCP is Resource-side — complementary.

---

**문제 8.** MFA-force SCP uses `BoolIfExists` not `Bool`. Why?

A) Performance
B) MFA key missing from request → `Bool` doesn't match → Deny doesn't work. `BoolIfExists` matches both key-present and key-absent cases
C) Cost
D) Multi-region support

**정답: B**
해설: Subtle difference but decides SCP function. SAML/some auth paths may lack `aws:MultiFactorAuthPresent` key entirely. `Bool` skips evaluation when key missing. `BoolIfExists` evaluates both cases → Deny both.
