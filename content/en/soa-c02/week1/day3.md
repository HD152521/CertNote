# Day 3 - IAM Deep Dive: Building Guardrails with Permission Boundaries, SCPs, and Identity Center

The IAM evaluation algorithm we saw yesterday describes the permission decision flow within a single account. But real companies don't have just one account. They split accounts into production, development, data analytics, security audit, and billing, and within each account, users are further distributed by department and role. Having 100 AWS accounts at one company is a common sight (Amazon itself has tens of thousands), and in this structure, how do you prevent the incident where "a developer with AdministratorAccess ends up with permissions close to the company's IAM root"? The answer is today's topic — **SCPs, Permission Boundaries, and IAM Identity Center**.

These three tools solve the same goal (a safety net for permission delegation) at different layers. If an operator can't precisely distinguish those layers, they'll flounder every time on "why isn't this permission working" or "how do I block this."

## The Math of Permission Delegation: SCP ∩ Boundary ∩ Identity Policy

The final decision of whether user U in account A can perform action X is computed by the following formula.

```
effective_permission(U, X) =
    SCP_on_account(A)
  ∩ permission_boundary(U)
  ∩ identity_policy(U)
  ∩ (resource_policy(X) OR identity_policy(U))
  ∩ session_policy(if assumed)
  - any_explicit_deny
```

What each ∩ (intersection) means is "of what's Allowed here, only what's also Allowed at the next stage passes through." If the SCP denies, the request is rejected regardless of the identity policy; if the boundary denies, it's rejected even if the identity policy is AdministratorAccess.

The operator value of this structure is a **safety net when delegating permissions**. The security team builds guardrails with SCPs and Boundaries, and can then delegate to developers the freedom to create IAM Roles within them.

> 💡 **Related theory**: This model combines capability-based security with attribute-based access control (ABAC). It implements, at distributed-system scale, the Principle of Least Privilege defined in Saltzer & Schroeder's "The Protection of Information in Computer Systems" (1975, CACM). Defining effective permissions as the intersection of policies is also a variation of lattice-based access control (Denning, 1976). Ever since the Bell-LaPadula model (1973) defined mandatory access control for military security, this "intersection of multiple policies" paradigm has become the standard for distributed system security.

## Six Operator Patterns for SCPs

An SCP (Service Control Policy) is a guardrail at the Organizations level. It's the tool for making "this action is simply impossible in this account, **regardless of IAM permissions inside the account**." Patterns operators use frequently:

### 1. Enforcing Specific Regions

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

With this SCP applied, all actions — except IAM, support, Route 53, CloudFront, Organizations, STS, and so on — are denied in every region other than ap-northeast-2 and us-east-1. In other words, it's the most powerful tool for preventing the incident where Bitcoin-mining EC2 instances run in a region the operator doesn't watch (e.g., sa-east-1, eu-central-2). A common scenario after an AWS account takeover is "spin up 100 × c6i.32xlarge in a rarely used region," and a region-lock SCP shuts down this scenario at the source.

### 2. Blocking Root User Actions

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

This forces people not to do day-to-day work with the root account. Since SCPs don't apply to the root of the Organizations management account (the management account exception), this only applies to the root of member accounts. Since 2024, AWS has allowed centrally managing member account root access from the management account (`aws iam centralize-root-access`).

### 3. Blocking CloudTrail Deactivation

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

This keeps an attacker who has infiltrated from erasing their tracks. GuardDuty's `Stealth:IAMUser/CloudTrailLoggingDisabled` finding also detects this scenario, but the SCP is blocking, not detection.

### 4. Enforcing IMDSv2

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

This enforces IMDSv2 when creating new EC2 instances. Stronger than a Config rule — it prevents the instance from being created at all. This is the SCP every company adopted right after the Capital One incident.

### 5. Enforcing S3 Encryption

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

This denies S3 PutObject requests without an SSE header. Since 2023, S3 automatically applies default SSE-S3, but if you need to enforce KMS, add `StringNotEquals: aws:kms` to this SCP.

### 6. Blocking Expensive Instance Types (Sandbox OU)

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

Apply this to a development sandbox OU to block accidental launches of expensive instances. Because SCPs are policy-based, they apply consistently to IaC as well.

> ⚠️ **Pitfall**: An SCP **does not grant permissions**. Even if the SCP has `Allow: s3:*`, the request is denied if the IAM Policy doesn't grant that permission. An SCP is a guardrail (upper bound), not a permission grant. Also, SCPs do not apply to service-linked roles, nor to APIs that an AWS service principal (e.g., `lambda.amazonaws.com`) calls as part of its own service operations.

> 🔍 **Going deeper**: If you remove the SCP's `FullAWSAccess` (the default attached policy), nothing can be done in that account. Attaching an SCP to an OU applies it to all accounts under that OU. So the operational pattern is: **separate environments into an OU hierarchy (prod, dev, sandbox) → attach the appropriate SCP to each OU**. For the Sandbox OU, something like "only EC2 t3.medium or smaller"; for the Prod OU, "region lock + restrict IAM changes." Up to 5 SCPs can be directly attached per account, and the policy document is limited to 5,120 characters. The standard practice for operators is to distribute multiple SCPs across the OU hierarchy and compose them.

> 📚 **Case study**: In 2023, at a SaaS company, a GitHub Actions OIDC role had overly broad permissions and IAM admin privileges were stolen via code injection by a PR author. However, because the production OU's SCP denied `iam:CreateUser` and `iam:CreateAccessKey`, the attacker couldn't create permanent credentials, and access was automatically cut off 24 hours later when the STS token expired. A case where the SCP was the last line of defense against the incident spreading.

## Permission Boundary Patterns

If an SCP is the upper bound for an entire account, a Permission Boundary is the **upper bound for a specific User/Role**. The most common pattern is "delegating IAM Role creation to developers" while enforcing guardrails via a boundary.

```json
// Policy to attach to the developer group
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

With this condition, roles created by developers must have names starting with `Dev-` and must have the `DeveloperBoundary` attached. Those roles' effective permissions are only valid within the boundary.

### The Depth of the Delegation Pattern

Why does this pattern matter? If operators create every IAM Role themselves, it becomes a bottleneck; if you just give developers `iam:CreateRole`, it's dangerous. The Boundary is the balance between the two. The security team writes one solid boundary policy, and developers freely create Roles within it.

The same pattern applies when IaC tools like CDK and Terraform automatically create IAM Roles. You enforce the `permissions_boundary` attribute on Terraform's `aws_iam_role` resource, and the company manages that boundary policy.

> 📚 **Case study**: In 2022, at a fintech company, a developer created a Lambda Role with `AdministratorAccess`, that Lambda's code was compromised via SSRF, and the company's entire RDS data was exfiltrated. What was adopted after the incident was the boundary pattern — allow `iam:CreateRole` but remove RDS/KMS write permissions via the boundary, and make production changes possible only by assuming the operations team's Role. The Lambda Role's effective permissions were constrained by the boundary, so even if compromised, it couldn't touch RDS.

> ⚠️ **Pitfall**: A Permission Boundary is an **upper bound on Allow**; it doesn't add Denies. If the boundary only has `Allow: s3:*`, then even if the identity policy has other permissions, only S3 passes through. There's also a subtle distinction: the boundary applies only on the identity side, and a resource policy's cross-account allow cannot be blocked by a boundary.

## IAM Identity Center: The Right Answer for User Management

Creating as many IAM Users as the company has employees is an anti-pattern. Reasons:

1. **MFA enforcement, access key rotation, and offboarding must be repeated per account**
2. **For cross-account access, users end up managing N access keys**
3. **Missed offboarding of departed employees is the #1 cause of incidents**
4. **MFA device management is scattered per user**

The alternative is **IAM Identity Center** (formerly AWS SSO). Manage users in one place (an external IdP or a built-in directory), and access all AWS accounts with a single sign-on.

```
[One employee]
   │
   ├─ Okta / Azure AD / Google Workspace (SAML 2.0 or SCIM)
   │       │
   │       ▼
   │  IAM Identity Center (single sign-on)
   │       │
   ├──────┼──────┬──────┬──────┐
   ▼       ▼      ▼      ▼      ▼
 Prod    Dev    Audit  Logs  Billing
 account account account account account
   │
   In each account, permissions are granted via Permission Sets (auto-created IAM Roles)
```

### Permission Sets: Identity Center's Permission Containers

A Permission Set is "the bundle of permissions a user can have in one account." Under the hood, it's an IAM Role automatically created in each account (`AWSReservedSSO_<PSName>_<hash>`) plus a mapping that allows the user to assume that Role.

```yaml
PermissionSet: AdministratorAccess
  - Managed Policy: AdministratorAccess
  - Session Duration: 4 hours
  - User: yongsik@company.com → automatically usable in all accounts
  - Customer Managed Policy: add as needed
  - Permissions Boundary: optional
```

Operators only manage which Permission Sets a user has in which accounts. When the user logs into the console, they see the list of accounts they can access; clicking one gets STS temporary credentials for that account and the console opens. On the CLI, you create a profile with `aws configure sso` and authenticate through the browser with `aws sso login`.

> 🔍 **Going deeper**: The credentials Identity Center issues are also STS temporary credentials. Session duration is configurable in the Permission Set from 1 to 12 hours (console sessions are separate; it's the IAM Role's MaxSessionDuration). Users never permanently hold access keys. On the CLI, too, `aws sso login` goes through browser authentication and issues temporary credentials. The token cached in `~/.aws/sso/cache/` is valid for the SSO session duration (up to 90 days), but fresh STS temporary credentials are issued on each use. This should become the standard for all automation.

> 📚 **Case study**: Back when one company ran 100 AWS accounts with 200 employees, each employee held an average of 8 access keys. Missed rotations and offboarding caused dozens of security alerts every month. After adopting Identity Center, access keys nearly disappeared, and when an employee left, a single deactivation in the IdP immediately cut off access to all accounts. In addition, granting permissions at the group level in the IdP (e.g., "the data-engineers group is PowerUser in all dev accounts, ReadOnly in prod accounts") eliminated the burden of permission changes.

## ABAC: Tag-Based Permission Grants

For scalability, IAM supports ABAC (attribute-based access control). The core idea: **grant permissions by tags, not by user ID or Role ID**.

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

This single policy expresses "employees can start/stop only EC2 instances tagged with their own department." Every permission combination across 100 employees × 1,000 EC2 instances is handled by just one policy, without policy explosion. With Identity Center, IdP user attributes (e.g., AD's department) can be automatically mapped to PrincipalTags, so changing an employee's department in the IdP automatically changes their AWS permissions too.

> 💡 **Related theory**: ABAC is standardized in NIST SP 800-162. It solves the problem of RBAC becoming unwieldy through N×M (role × permission) matrix explosion via dynamic evaluation of attributes. IAM can express all core ABAC elements (subject attributes, resource attributes, environment attributes) as Conditions. Google Zanzibar (2019) solved the same problem with ReBAC (Relationship-Based), which expresses "which group is this resource a member of" as a graph. AWS answers with tag-based ABAC, Google with a relationship graph, and Microsoft Azure with a Resource Hierarchy — different answers to the same problem.

## Service-Linked Roles: Special Roles Operators Can't Create

Some AWS services (ECS, Auto Scaling, ELB, Lex, GuardDuty, etc.) automatically create a dedicated Role their service uses when calling other AWS resources. This is the **Service-Linked Role (SLR)**.

Characteristics:
- **The name is predetermined**: `AWSServiceRoleFor*`
- **Operators cannot modify the policy**: AWS manages it
- **The trust policy is fixed too**: only that service can assume it
- **Deletable only when the service isn't using the Role**

> ⚠️ **Pitfall**: If an operator tries to delete an SLR, a dependency check runs and deletion is refused if it's in use. On the exam, the scenario "you created an ECS cluster and are trying to modify the automatically created Role" is asking about SLRs — the answer is "cannot be modified; the service manages it." Even SCPs cannot block SLR behavior (service principal calls bypass policy evaluation).

## How Operators Think When Debugging IAM in CloudTrail

The standard pattern for tracing deny errors in CloudTrail:

```sql
-- CloudTrail Lake / Athena
SELECT eventTime, eventName, errorCode, errorMessage,
       userIdentity.type, userIdentity.arn,
       requestParameters.bucketName
FROM cloudtrail_logs
WHERE errorCode = 'AccessDenied'
  AND eventTime > '2025-05-25T00:00:00Z'
ORDER BY eventTime DESC
LIMIT 100;
```

Four things to look at in this query's results:

1. **userIdentity.type**: IAMUser, AssumedRole, AWSService, Root, FederatedUser
2. **userIdentity.arn**: the exact caller
3. **eventName + requestParameters**: which action on which resource
4. **errorMessage**: the exact reason for AccessDenied (which policy blocked it)

> 🔍 **Going deeper**: If the errorMessage says "explicit deny in identity-based policy," the Deny is in the identity policy. "explicit deny in resource-based policy" means the resource policy (bucket policy, etc.). "implicit deny" means there's no Allow anywhere. "explicit deny in service control policy" means the SCP. This one line determines where to look. This message has been standardized since 2022 and is included in every deny response.

## Wrapping Up

Today's picture is that IAM permissions are woven from **multi-layered guardrails**. SCPs at the account level, Boundaries at the User/Role level, Identity Policies as the actual permission grant, and Resource Policies as the target-side allow. A Deny at any single layer beats everything. Identity Center layers authentication and SSO on top of this, solving the N-account explosion of user management.

Tomorrow we move into **AWS Organizations and multi-account governance**, which makes this account separation possible. How do you manage 100 accounts consistently?

---

## 📝 연습 문제

**문제 1.** The SCP has `Allow: s3:*`, the IAM Policy has `Deny: s3:DeleteObject`, and the Bucket Policy has `Allow: s3:DeleteObject`. What's the result?

A) Allow — the Bucket Policy's Allow takes precedence
B) Allow — the SCP's Allow takes precedence
C) Deny — the IAM Policy's explicit Deny takes precedence
D) Cannot be evaluated — the policies contradict each other

**정답: C**
해설: If there's even a single explicit Deny at any policy layer, the final result is denial. An SCP is a guardrail, not a permission grant, so its Allow cannot neutralize the IAM Deny. The same goes for the Bucket Policy's Allow.

---

**문제 2.** An operator wants to delegate IAM Role creation to the developer group while requiring that any created Role must have the `DevBoundary` policy attached. What's the answer?

A) Add `Allow: iam:CreateRole` to the SCP
B) Add `iam:CreateRole` Allow to the developer group's policy + enforce `iam:PermissionsBoundary` via a Condition
C) Attach the Permission Boundary as an SCP
D) Create it as a Service-Linked Role

**정답: B**
해설: Grant `iam:CreateRole` to the developer group, but use a Condition to force the `iam:PermissionsBoundary` value to the company's standard boundary. That way, every Role developers create must have the boundary attached, and the Role's effective permissions are only valid within the boundary.

---

**문제 3.** A company runs 50 AWS accounts with 200 employees. To minimize the user-management burden?

A) Create 200 IAM Users in each account
B) Create IAM Users in one master account and use Cross-Account Roles for the other accounts
C) Adopt IAM Identity Center with Okta/Azure AD federation
D) Automate with Service Catalog

**정답: C**
해설: With Identity Center, users are managed once in the IdP, and Permission Sets map permissions per account. When an employee leaves, one deactivation in the IdP cuts off access to all accounts. Access keys nearly disappear and all credentials become STS temporary tokens.

---

**문제 4.** An operator wants to enforce that only ap-northeast-2 and us-east-1 can be used across all accounts. The most suitable tool is?

A) IAM Permission Boundary
B) Service Control Policy (SCP)
C) AWS Config Rule
D) CloudTrail Log

**정답: B**
해설: SCPs are account/OU-level guardrails, so they can be applied to all accounts at once. Use the `aws:RequestedRegion` Condition to Deny all actions outside the allowed regions. Global services like IAM, Route 53, and CloudFront are exempted via NotAction. Config Rules can only detect, not block.

---

**문제 5.** You try to modify the permissions of the `AWSServiceRoleForECS` that was automatically created when you first made an ECS cluster. What's the result?

A) Possible. Edit the policy in the IAM console
B) Possible, but it must pass the SCP
C) Impossible. Service-Linked Roles are managed by AWS
D) Possible, but only from the root account

**정답: C**
해설: A Service-Linked Role is a Role that an AWS service automatically creates and manages for its own operation. Operators cannot modify its policy. Deletion is also refused while it's in use. On the exam, the answer to SLR-related questions is almost always "cannot be modified."

---

**문제 6.** For a user with an Identity Center Permission Set applied to receive an STS token from the AWS CLI, which command do they use?

A) `aws iam create-access-key`
B) `aws sts assume-role`
C) `aws sso login`
D) `aws configure`

**정답: C**
해설: A user on Identity Center creates a profile with `aws configure sso` and authenticates in the browser with `aws sso login`. The SDK then automatically issues and caches STS temporary credentials. `aws sts assume-role` is the general command for directly assuming an IAM Role; Identity Center uses it internally, but the user doesn't need to call it directly.
