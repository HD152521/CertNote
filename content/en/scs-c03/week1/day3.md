# Day 3 - Advanced IAM Policies: Identity vs Resource, Condition Keys, and Least-Privilege Design

Yesterday you learned the policy evaluation algorithm. Today we handle the policies themselves that feed into that algorithm. The real differentiator SCS-C03 tests in IAM isn't "can you write policies" but **"among multiple controls producing the same outcome, can you pick the most precise and least-privileged one?"** If you solve with Resource policy what should be Identity policy, it works but becomes a trap answer. If you split with separate roles what one Condition key could do, it's over-engineered.

Today we dive into three things. First, when Identity and Resource policies split and how to choose. Second, using Condition keys for precise control — IP, MFA, encryption, tag-based. Third, designing least privilege **scalably** with Permissions Boundary and ABAC.

## Identity-based vs Resource-based: Decision Criteria

| Aspect | Identity-based | Resource-based |
|------|---------------|----------------|
| Attached to | User/Group/Role | Resources (S3, KMS, SQS, SNS, Lambda, etc.) |
| Principal element | None | **Required** |
| Main use | "What can this principal do" | "Who can access this resource" |
| cross-account | Can't work alone (needs counterpart resource policy) | **Can work alone, allowing other accounts** |
| Typical examples | Managed/inline policies | S3 bucket policy, KMS key policy, IAM Role trust policy |

Selection is clear:

- **"Grant permission to a principal within the same account"** → Identity policy
- **"Allow different account/service access to my resource"** → Resource policy (core tool for cross-account)
- **"Enforce rules uniformly on a resource regardless of who accesses"** (e.g., force encryption on all PutObject) → Resource policy

> 💡 **Related Theory**: KMS key policy is special. **Every KMS key's policy is first authority (authoritative)** — if the key policy doesn't permit IAM delegation (allowing `"Principal": {"AWS": "arn:aws:iam::ACCOUNT:root"}`), then IAM policy alone won't work. S3 and SQS work with either identity or resource policy alone, but KMS requires the key policy to open the gate first before IAM policy functions. That's why cross-account KMS use mandates explicitly stating the other account in the key policy.

> 🔍 **Deep Dive**: An IAM Role's **trust policy is also a resource-based policy**. It's a Principal-including policy on the Role resource defining "who can assume this role (`sts:AssumeRole`)." That's why cross-account AssumeRole requires ① target account's Role trust policy (Principal naming calling account) ② calling side's identity policy with `sts:AssumeRole` Allow — both (covered in depth Day 4).

## Condition Keys: The Core of Precision Control

Condition is a clause that adds "additional constraints" to policies. Security engineers use these most-common keys, organized by type:

| Condition Key | Meaning | Typical Use |
|-------------|------|----------|
| `aws:SourceIp` | Request source IP | Allow only from corporate IP |
| `aws:MultiFactorAuthPresent` | MFA authentication presence | Force MFA for sensitive actions |
| `aws:SecureTransport` | HTTPS or not | Reject plaintext HTTP |
| `aws:RequestedRegion` | Target region | Block work outside certain regions |
| `aws:PrincipalTag` / `aws:ResourceTag` | Principal·resource tags | ABAC (attribute-based access control) |
| `aws:SourceArn` / `aws:SourceAccount` | Calling service source | **Prevent Confused Deputy** |
| `s3:x-amz-server-side-encryption` | Upload encryption header | Block unencrypted uploads |
| `kms:ViaService` | KMS call via service | Allow key use only through specific service |

### Example 1: Force-Block Unencrypted S3 Uploads

```json
{
  "Sid": "DenyUnencryptedUploads",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::secure-bucket/*",
  "Condition": {
    "StringNotEquals": {
      "s3:x-amz-server-side-encryption": "aws:kms"
    }
  }
}
```

This bucket policy denies all uploads without a KMS encryption header. Classic data protection (Domain 5) and governance enforcement.

### Example 2: No Sensitive Actions Without MFA

```json
{
  "Sid": "DenySensitiveWithoutMFA",
  "Effect": "Deny",
  "Action": ["iam:*", "kms:ScheduleKeyDeletion", "ec2:TerminateInstances"],
  "Resource": "*",
  "Condition": {
    "BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}
  }
}
```

> ⚠️ **Trap**: The difference between `Bool` and `BoolIfExists` is exam standard. Some requests (service-to-service calls, STS sessions) don't have the `aws:MultiFactorAuthPresent` key at all. Using `Bool` to check `"false"` blocks even normal requests missing the key. `BoolIfExists` means "if key exists, check if false; if missing, pass" — works as intended. Also, `aws:SourceIp` **doesn't apply to traffic via VPC endpoints** — use `aws:VpcSourceIp` or `aws:SourceVpc` there.

> 🔍 **Deep Dive**: `aws:SourceArn` and `aws:SourceAccount` are core to preventing **Confused Deputy (confused intermediary)** attacks. For example, when S3 sends events to SNS, if the SNS topic policy doesn't use `aws:SourceArn` to specify "only this bucket," another person's bucket could be tricked into triggering your topic. Service principals (`Service` principal) should almost always pair with `aws:SourceArn`/`aws:SourceAccount` conditions (re-emerges Day 4 in STS context).

## Permissions Boundary: Safe Limits for Delegation

Permissions Boundary defines "the **maximum permission upper limit** this principal can have." Identity policy grants permissions; boundary caps that limit. **Effective permission = identity-based policy ∩ Permissions Boundary** (intersection).

Most powerful use: **safely restricting permission delegation**. Give a developer "can create IAM roles" but prevent their created roles from becoming admin.

```json
// Attach to developer: allow role creation but force boundary attachment
{
  "Effect": "Allow",
  "Action": "iam:CreateRole",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary": "arn:aws:iam::ACCOUNT:policy/DevBoundary"
    }
  }
}
```

Now the developer can create roles but only with `DevBoundary` attached. That role's effective permissions can't exceed boundary — structurally blocking privilege escalation.

> 💡 **Related Theory**: The evaluation relationship of four policy types in one picture — **SCP(org upper limit) ∩ Permissions Boundary(principal upper limit) ∩ Identity policy(grant) → and explicit Deny takes priority anywhere**. SCP and Boundary are "cutting" filters, not "granting" steps. Session policy (passed on AssumeRole) works the same intersection filter.

## ABAC: Scalable Least Privilege with Tags

RBAC (role-based) creates policy explosion as roles grow. ABAC (Attribute-Based Access Control) uses **tags** to express permissions, keeping policy count constant.

```json
{
  "Effect": "Allow",
  "Action": ["ec2:StartInstances", "ec2:StopInstances"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Project": "${aws:PrincipalTag/Project}"
    }
  }
}
```

This single policy expresses "allow when principal's `Project` tag matches resource's `Project` tag." 100 projects → 1 policy. New team appears? No policy changes, just grant tags.

> 🎯 **Scenario**: "Dozens of teams operate EC2 separately; policy additions for each new team is hitting limits." Answer isn't multiplying team roles and policies — it's **ABAC migration**. Tag principals with `team`, resources with `team`, unify with `aws:PrincipalTag/team == aws:ResourceTag/team`. Identity Center session tags and SAML/OIDC attributes map to PrincipalTag, applying uniformly to federated users.

## Tools That "Discover" Least Privilege

Least privilege isn't intuitive; it's **derived from real usage data**.

```bash
# Access Analyzer: Generate policies from actual CloudTrail log usage
aws accessanalyzer start-policy-generation \
  --policy-generation-details '{"principalArn":"arn:aws:iam::111122223333:role/AppRole"}' \
  --cloud-trail-details '{...}'

# Find unused permissions by last-accessed timestamp
aws iam get-service-last-accessed-details \
  --job-id <job-id>
```

IAM Access Analyzer's policy generation creates policies from only actual recorded calls in CloudTrail. Access Advisor (service-last-accessed) shows "permissions never used in last N months" to justify narrowing over-broad access.

> 📚 **Case Study**: Many organizations start with policies near `*:*`, only narrowing after incidents. Best practice is the opposite: **"progressive narrowing — add permissions only when denials occur."** Use Access Analyzer-generated policies as a starting point and monitor CloudTrail's `AccessDenied`. "Broad first, then narrow" creates security debt; "narrow first, then expand" doesn't.

## Policy Conflict and Priority Synthesis

Checklist to quickly judge multi-policy tangles:

1. Any **explicit Deny** anywhere? → Yes, done — Deny.
2. **SCP** allows the Action? → No — Deny.
3. **Permissions Boundary** allows? → No — Deny.
4. (cross-account?) **Both** accounts allow? → Either missing — Deny.
5. Any **explicit Allow**? → No — implicit Deny.
6. All pass → Allow.

> 💡 **Related Theory**: In this order, steps 2-4 (SCP, Boundary, cross-account both) are all "**filters that cut upper limits**," while step 5 (Identity/Resource Allow) is the "permissions granting" step. Clarifying this distinction lets you quickly pin "permissions exist but denied" as hitting one of those filters (2-4) rather than missing Allow.

## Summary — Precision Equals Security

Three essentials today. First, **Identity policy handles "what principal can do"; Resource policy handles "who accesses this resource"** — cross-account and KMS key policies are Resource policy territory. Second, **Condition keys** provide precise control via IP, MFA, encryption, tags, but watch for `BoolIfExists` traps and `aws:SourceArn` Confused Deputy prevention. Third, **Permissions Boundary and ABAC** make least privilege "scalable," and least privilege emerges from Access Analyzer and Access Advisor data, not intuition.

Tomorrow we shift to STS and temporary credentials. How AssumeRole exactly works, what federation is, role chaining, and how to block Confused Deputy with `ExternalId` and `aws:SourceArn`. Today's trust policy and Condition keys are the raw materials.

---

## 📝 Practice Questions

**Question 1.** A Lambda function in Account A must decrypt data encrypted with a KMS key managed in Account B. What must be configured?

A) Adding only the `kms:Decrypt` permission to Account A's Lambda execution role is enough  
B) Account B's KMS key policy must allow Account A's role, and Account A's role must also be granted `kms:Decrypt`  
C) Add `kms:Decrypt` only to an IAM user policy in Account B  
D) If both accounts are in the same Region, it is allowed automatically with no extra configuration  

**Answer: B**  
Explanation: The KMS key policy holds primary authority, so for cross-account use the key-owning account (B) must explicitly allow the calling account's principal in its key policy, and at the same time the identity policy on the A side must Allow `kms:Decrypt`. One side alone is not enough, and being in the same Region has nothing to do with authorization.

---

**Question 2.** Which of the following conditions is intended to mean "deny if MFA is absent" but risks blocking legitimate requests that have no MFA key at all, such as service-to-service calls?

A) `"BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}`  
B) `"Bool": {"aws:MultiFactorAuthPresent": "false"}`  
C) `"Null": {"aws:MultiFactorAuthPresent": "true"}`  
D) `"BoolIfExists": {"aws:MultiFactorAuthPresent": "true"}`  

**Answer: B**  
Explanation: `Bool` assumes the key is present and evaluates its value, so on service calls that carry no MFA context key the condition can match unintentionally and block legitimate requests. `BoolIfExists` evaluates the value only when the key exists and lets the request through when it does not, avoiding this side effect. That difference is the classic trap when writing MFA-enforcement policies.

---

**Question 3.** An organization faces the operational burden of adding an IAM policy every time a team is added. What is the most appropriate way to implement "allow only when the principal's team tag matches the resource's team tag" without an explosion in the number of policies?

A) Create a separate role and dedicated policy for each team  
B) Give every user the same admin policy and operate on trust  
C) Consolidate into a single policy using ABAC conditions that compare `aws:PrincipalTag` and `aws:ResourceTag`  
D) Create a separate AWS account per team for physical separation  

**Answer: C**  
Explanation: ABAC expresses the match between principal tags and resource tags as a condition, so one policy handles any number of teams — when a team is added you only assign tags, with no policy change. Mass-producing per-team roles and policies carries the same policy-explosion problem as RBAC, granting admin to everyone violates least privilege, and splitting accounts per team is excessive and not what this question is about.

---

**Question 4.** You want to grant a developer permission to create IAM roles while enforcing that the roles they create cannot exceed the ceiling they were given. Which mechanism is most appropriate?

A) Deny `iam:CreateRole` entirely with an SCP  
B) When allowing `iam:CreateRole`, require attaching a specific Permissions Boundary as a condition  
C) Grant the developer only `ReadOnlyAccess`  
D) Have a human review created roles daily and delete the excessive ones  

**Answer: B**  
Explanation: Using the `iam:PermissionsBoundary` condition to require the designated boundary at role-creation time limits the created role's effective permissions to the intersection with that boundary, structurally blocking privilege escalation. Blocking CreateRole outright makes delegation impossible, granting only ReadOnly means no roles can be created, and after-the-fact human review risks omissions and delay.

---

**Question 5.** You want to enforce that every object uploaded to an S3 bucket is encrypted with KMS. What is the most direct approach with no gaps?

A) Publish a development guide telling every uploading application to include the encryption header  
B) Use a bucket policy to Deny PutObject without the encryption header via the `s3:x-amz-server-side-encryption` condition  
C) Use GuardDuty to detect unencrypted objects and send alerts  
D) Grant encryption permission separately to each IAM user  

**Answer: B**  
Explanation: Explicitly denying PutObject without the encryption header in the bucket policy, via the `s3:x-amz-server-side-encryption` condition, is a preventive control that blocks unencrypted uploads no matter which principal performs them. A development guide has no enforcement power and will be missed, GuardDuty detection is an after-the-fact alert that cannot stop the upload, and granting per-user permissions is not directly related to enforcing encryption.

---
