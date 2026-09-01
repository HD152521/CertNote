# Day 3 - Advanced IAM: Building Guardrails with Permission Boundary, SCP, and Identity Center

Yesterday's IAM evaluation algorithm described single-account permission flow. But real companies don't operate one account—they segment: Operations, Development, Data Analytics, Security Audit, Billing. Each account then distributes users by department and role. A company with 100 AWS accounts is common (Amazon itself has tens of thousands), and the question becomes: "How do we prevent a developer with AdministratorAccess from obtaining permissions close to company IAM root?" Today's answer: **SCP, Permission Boundary, and IAM Identity Center.**

All three solve the same goal (delegation safety net) but at different layers. When operators miss that layer distinction, they flounder through "why isn't permission working?" or "why can't I block this?"

## The Math of Delegation: SCP ∩ Boundary ∩ Identity Policy

Whether user U in account A can do action X is calculated by:

```
effective_permission(U, X) =
    SCP_on_account(A)
  ∩ permission_boundary(U)
  ∩ identity_policy(U)
  ∩ (resource_policy(X) OR identity_policy(U))
  ∩ session_policy(if assumed)
  - any_explicit_deny
```

Each ∩ (intersection) means "only what's Allow-ed here AND also Allow-ed in the next step passes." SCP denies = identity policy irrelevant. Boundary denies = identity policy irrelevant.

The operator value of this structure: **safety net for delegation.** Security team writes SCP + Boundary guardrails; developers delegate create Roles freely within them.

> 💡 **Related Theory**: This model combines capability-based security (authority token) and ABAC. Saltzer & Schroeder's "The Protection of Information in Computer Systems" (1975, CACM) defined Least Privilege; this implements it at distributed scale. Effective permission via policy intersection is a lattice-based access control variant (Denning, 1976). Since Bell-LaPadula (1973) formalized mandatory access control for military security, the "intersection of multiple policies" paradigm became the standard for distributed system security.

## Six SCP Operator Patterns

SCP (Service Control Policy) is organization-level guardrail. **Regardless of IAM permissions, it makes "this action is impossible in this account."** Operators commonly use:

### 1. Force Specific Regions

```json
{
  "Effect": "Deny",
  "NotAction": ["iam:*", "support:*", "route53:*", "cloudfront:*",
                "organizations:*", "sts:*", "waf:*", "globalaccelerator:*"],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
    }
  }
}
```

This SCP blocks all regions except ap-northeast-2 and us-east-1 (excluding IAM, support, route53, cloudfront, organizations, sts, waf). Stops "EC2 bitcoin mining in a region the operator doesn't watch" scenarios. Post-account breach, attackers often "spin c6i.32xlarge × 100 in an obscure region." Region-lock SCP blocks that entirely.

### 2. Block Root User Actions

```json
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "StringLike": {
      "aws:PrincipalArn": "arn:aws:iam::*:root"
    }
  }
}
```

Forces no daily work from root. Management account root is exempt from SCP (exception), so this applies to member accounts only. Since 2024, AWS lets management account centralize root access (`aws iam centralize-root-access`).

### 3. Block CloudTrail Disabling

```json
{
  "Effect": "Deny",
  "Action": [
    "cloudtrail:StopLogging",
    "cloudtrail:DeleteTrail",
    "cloudtrail:UpdateTrail",
    "cloudtrail:PutEventSelectors"
  ],
  "Resource": "*"
}
```

Prevents intruders from covering tracks. GuardDuty flags `Stealth:IAMUser/CloudTrailLoggingDisabled`, but SCP blocks, not detects.

### 4. Enforce IMDSv2

```json
{
  "Effect": "Deny",
  "Action": "ec2:RunInstances",
  "Resource": "arn:aws:ec2:*:*:instance/*",
  "Condition": {
    "StringNotEquals": {
      "ec2:MetadataHttpTokens": "required"
    }
  }
}
```

Forces IMDSv2 on new EC2. Stronger than Config rule—blocks creation itself. Adopted universally post-Capital One.

### 5. Force S3 Encryption

```json
{
  "Effect": "Deny",
  "Action": "s3:PutObject",
  "Resource": "*",
  "Condition": {
    "Null": {
      "s3:x-amz-server-side-encryption": "true"
    }
  }
}
```

Blocks S3 PutObject without SSE header. Since 2023, S3 auto-applies SSE-S3 default; add `StringNotEquals: aws:kms` for KMS-only enforcement.

### 6. Block Expensive Instance Types (Sandbox OU)

```json
{
  "Effect": "Deny",
  "Action": "ec2:RunInstances",
  "Resource": "arn:aws:ec2:*:*:instance/*",
  "Condition": {
    "ForAnyValue:StringNotLike": {
      "ec2:InstanceType": ["t3.*", "t4g.*", "m5.large", "m5.xlarge"]
    }
  }
}
```

Applied to dev sandbox OU to block expensive instance accidents. SCP is policy-based, so applies consistently to IaC too.

> ⚠️ **Pitfall**: **SCP never grants Allow.** Even `Allow: s3:*` in SCP is just a whitelist—real permission granting is IAM Policy. Another: SCP doesn't apply to service-linked roles or AWS service principals' internal API calls.

> 🔍 **Deeper Dive**: Removing `FullAWSAccess` from SCP means account can't do anything. SCP attached to OU applies to all descendant accounts. Pattern: **organize OUs by environment (prod, dev, sandbox) → apply appropriate SCP per OU**. Sandbox gets "EC2 t3 medium max," Prod gets "region lock + IAM change restriction." Max 5 SCP per account, 5120 character limit per policy. Operators distribute and compose multiple SCPs across OU hierarchy.

> 📚 **Case Study**: 2023 SaaS company—GitHub Actions OIDC role too permissive, PR code injection stole IAM admin. But prod OU's SCP denied `iam:CreateUser` + `iam:CreateAccessKey`, so attacker couldn't create permanent credentials. After 24 hours, STS token expired and auto-locked. SCP was last-resort breach containment.

## Permission Boundary Pattern

If SCP is account-wide ceiling, Permission Boundary is **per-user/role ceiling.** Most common: "delegate Role creation to developers" while enforcing boundary guardrails.

```json
{
  "Effect": "Allow",
  "Action": ["iam:CreateRole", "iam:AttachRolePolicy", "iam:PutRolePolicy"],
  "Resource": "arn:aws:iam::*:role/Dev-*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary":
        "arn:aws:iam::123456789012:policy/DeveloperBoundary"
    }
  }
}
```

Developer-created Roles must start `Dev-` and attach `DeveloperBoundary`. Effective permission = boundary-limited only.

### Why This Pattern Matters

If operators create all Roles = bottleneck. If developers get just `iam:CreateRole` = risky. Boundary = balanced. Security team writes one solid boundary; developers free-build inside it.

Applies to IaC too (Terraform/CDK auto-create Roles). Terraform's `aws_iam_role` gets forced `permissions_boundary` attribute, company-managed.

> 📚 **Case Study**: 2022 fintech—developer created Lambda Role with AdministratorAccess, SSRF breach exposed RDS. Post-incident: boundary pattern adopted. `iam:CreateRole` allowed, boundary removes RDS/KMS write, operations require ops team Role assumption. Lambda effective permission bounded; breach contained.

> ⚠️ **Pitfall**: **Boundary sets Allow ceiling, not Deny.** If boundary only has `Allow: s3:*`, identity policy's other permissions are filtered—S3 only passes. Boundary only applies identity-side; cross-account resource policy Allow can't be blocked by boundary.

## IAM Identity Center: User Management Done Right

Creating IAM Users for every employee is anti-pattern:

1. **Repeat MFA enforce, access key rotation, offboarding per account**
2. **Cross-account access = users manage N access keys**
3. **Offboarding miss = #1 incident cause**
4. **MFA device scattered per user**

Solution: **IAM Identity Center** (ex-AWS SSO). Single user source (external IdP or built-in directory), one login for all AWS accounts.

```
[Employee]
   │
   ├─ Okta / Azure AD / Google Workspace (SAML 2.0 or SCIM)
   │       │
   │       ▼
   │  IAM Identity Center (one login)
   │       │
   ├──────┼──────┬──────┬──────┐
   ▼       ▼      ▼      ▼      ▼
 Prod   Dev    Audit  Logs  Billing
 Account Account Account Account Account
   │
   Each account auto-grants permissions via Permission Set (auto-generated IAM Role)
```

### Permission Set: Identity Center's Permission Container

Permission Set = "permissions a user has in one account." Essence: auto-created IAM Role (`AWSReservedSSO_<PSName>_<hash>`) + user assumption mapping.

```yaml
PermissionSet: AdministratorAccess
  - Managed Policy: AdministratorAccess
  - Session Duration: 4 hours
  - User: user@company.com → automatically available all accounts
  - Customer Managed Policy: optional add
  - Permissions Boundary: optional
```

Operators manage which Permission Set each user has in which account. User logs console → sees accessible account list → clicks → gets STS temp creds → console opens. CLI: `aws configure sso` + `aws sso login` for browser auth.

> 🔍 **Deeper Dive**: Identity Center credentials are also STS temp. Session 1-12 hours per Permission Set. No permanent access key. CLI also uses `aws sso login` (browser auth) for temp creds. `~/.aws/sso/cache/` token valid during SSO session (~90 days max), but new STS temp creds issued each use. This is the standard for all automation.

> 📚 **Case Study**: Company—200 employees, 100 accounts. Employee had avg 8 access keys. Rotation/offboarding misses = dozens of monthly alerts. Identity Center: keys nearly gone, offboard employee = IdP disable = instant all-account lock. IdP group permissions (e.g., "data-engineers: PowerUser all dev, ReadOnly prod") = zero permission change burden.

## ABAC: Tag-Based Permission Grant

For scale, IAM supports ABAC (Attribute-Based Access Control): **grant permissions via tags, not user/role IDs.**

```json
{
  "Effect": "Allow",
  "Action": ["ec2:StartInstances", "ec2:StopInstances"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Department": "${aws:PrincipalTag/Department}"
    }
  }
}
```

One policy: "employees start/stop EC2s tagged with their department." No policy explosion for 100 people × 1000 EC2. Identity Center maps IdP attributes (e.g., AD department) to PrincipalTag; department change in IdP = AWS permission auto-change.

> 💡 **Related Theory**: ABAC standardized in NIST SP 800-162. RBAC's N×M (role × permission) matrix explodes; ABAC solves via dynamic attribute eval. IAM implements all ABAC elements (subject, resource, environment attributes) via Condition. Google Zanzibar (2019) solved same via ReBAC (Relationship-Based—graph of group membership). AWS = tag ABAC, Google = relation graph, Azure = Resource Hierarchy. Same problem, different answers.

## Service-Linked Role: Special Roles Operators Don't Create

AWS services (ECS, Auto Scaling, ELB, GuardDuty) auto-generate dedicated Roles for service-to-service calls. These are **Service-Linked Roles (SLR).**

Traits:
- **Fixed name**: `AWSServiceRoleFor*`
- **Operator can't modify policy**: AWS manages
- **Trust Policy locked**: only that service assumes
- **Deletable only when service unused**

> ⚠️ **Pitfall**: Deleting SLR triggers dependency checks; in-use = rejected. Exam: "ECS cluster auto-generated Role—modify it?" Answer: "Can't—AWS manages." SCP can't block SLR operations (service principal bypass).

## CloudTrail IAM Debugging Pattern

Standard denial-trace pattern:

```sql
SELECT eventTime, eventName, errorCode, errorMessage,
       userIdentity.type, userIdentity.arn,
       requestParameters.bucketName
FROM cloudtrail_logs
WHERE errorCode = 'AccessDenied'
  AND eventTime > '2025-05-25T00:00:00Z'
ORDER BY eventTime DESC
LIMIT 100;
```

Four things to check:

1. **userIdentity.type**: IAMUser, AssumedRole, AWSService, Root, FederatedUser
2. **userIdentity.arn**: exact caller
3. **eventName + requestParameters**: action + resource
4. **errorMessage**: why denied (which policy)

> 🔍 **Deeper Dive**: "explicit deny in identity-based policy" = identity policy denied. "explicit deny in resource-based policy" = resource policy. "implicit deny" = nowhere allowed. "explicit deny in service control policy" = SCP. This one line tells you where to look. Standardized since 2022.

## Wrapping Up

Today's diagram: IAM permissions built in **multi-layer guardrails.** SCP (account-level), Boundary (user/role-level), Identity Policy (actual grant), Resource Policy (target-side allow). Any layer's Deny wins. Identity Center adds auth/SSO atop this, solving N-account user management explosion.

Tomorrow: **AWS Organizations and multi-account governance** making all this possible. How to manage 100 accounts consistently.

---

## 📝 Practice Questions

**Question 1.** SCP has `Allow: s3:*`, IAM Policy has `Deny: s3:DeleteObject`, Bucket Policy has `Allow: s3:DeleteObject`. Result?

A) Allow—Bucket Policy Allow wins
B) Allow—SCP Allow wins
C) Deny—IAM explicit Deny wins
D) Unevaluable—contradictory policies

**Answer: C**
Explanation: Any layer's explicit Deny = final Deny. SCP is guardrail, not grant—its Allow doesn't override IAM Deny. Same for Bucket Policy.

---

**Question 2.** Operator wants developers to create Roles but enforce Role must attach `DevBoundary` policy. Answer?

A) Add `Allow: iam:CreateRole` to SCP
B) Developer group policy: `iam:CreateRole` Allow + Condition force `iam:PermissionsBoundary`
C) Attach Permission Boundary via SCP
D) Use Service-Linked Role

**Answer: B**
Explanation: Developer group gets `iam:CreateRole`, Condition on `iam:PermissionsBoundary` standard value. Developer-created Role auto-gets boundary, effective permission = boundary-limited.

---

**Question 3.** 200 employees, 50 accounts. Minimize user management burden?

A) Create 200 IAM Users per account
B) Master account User + cross-account Roles
C) IAM Identity Center + Okta/Azure AD federation
D) Service Catalog auto

**Answer: C**
Explanation: Identity Center + IdP = single user source, Permission Set per-account permission. Off-board = IdP disable = all accounts instant lock. No access keys. All STS temp.

---

**Question 4.** Force all accounts: only ap-northeast-2 and us-east-1 allowed. Best tool?

A) IAM Permission Boundary
B) Service Control Policy
C) AWS Config Rule
D) CloudTrail Log

**Answer: B**
Explanation: SCP applies org-wide. `aws:RequestedRegion` Condition denies all except two regions (NotAction exempts globals). Config only detects, doesn't block.

---

**Question 5.** Auto-created `AWSServiceRoleForECS` from new cluster—modify its permissions?

A) Yes, IAM console
B) Yes, needs SCP pass
C) No—Service-Linked Role AWS-managed
D) Yes, root account only

**Answer: C**
Explanation: SLR auto-created/managed by AWS service. Can't modify policy. Can't delete while in-use. Exam SLR answer almost always "can't modify."

---

**Question 6.** Identity Center user gets STS token via CLI. Which command?

A) `aws iam create-access-key`
B) `aws sts assume-role`
C) `aws sso login`
D) `aws configure`

**Answer: C**
Explanation: Identity Center users: `aws configure sso` (profile), then `aws sso login` (browser auth) = auto STS temp creds cached. `aws sts assume-role` is direct Role assumption—not needed for Identity Center.
