# Day 3 - IAM Policy Deep Dive: Identity vs Resource Policies, Condition Keys, Least-Privilege Design

Yesterday you learned the policy evaluation algorithm; today we work precisely with the policies that feed into that algorithm. Where SCS-C03 truly differentiates candidates on IAM is not "can you write a policy" but **"among several controls that produce the same result, can you pick the one that is most precise and most least-privilege."** Solving with a resource policy what should be solved with an identity policy may work, but it becomes a trap answer choice; splitting out a separate role for something a single Condition key could handle is over-engineering.

Today we dig into three things. First, when and how identity policies and resource policies diverge. Second, how to apply fine-grained controls based on IP, MFA, encryption, and tags using Condition keys. Third, how to design least privilege **scalably** using Permissions Boundaries and ABAC.

## Identity-based vs Resource-based: Decision Criteria

| Aspect | Identity-based | Resource-based |
|------|---------------|----------------|
| Attached to | User/Group/Role | Resource (S3, KMS, SQS, SNS, Lambda, etc.) |
| Principal element | None | **Required** |
| Primary purpose | "What can this principal do" | "Who can access this resource" |
| Cross-account | Not sufficient alone (requires the other side's resource policy) | **Can grant another account access on its own** |
| Typical examples | Managed/inline policies | S3 bucket policies, KMS key policies, IAM role trust policies |

The selection criteria are clear.

- **"Grant permissions to a principal within the same account"** → Identity policy
- **"Another account/service accesses my resource"** → Resource policy (the core tool for cross-account)
- **"Enforce a blanket rule on a resource regardless of who accesses it"** (e.g., enforce encryption on every PutObject) → Resource policy

> 💡 **Related theory**: KMS key policies are special. **For every KMS key, the key policy is the primary authority (authoritative)** — unless the key policy delegates to IAM (`"Principal": {"AWS": "arn:aws:iam::ACCOUNT:root"}` plus permissions in IAM), an IAM policy alone cannot use the key. For S3 and SQS, either an IAM policy or a resource policy is sufficient, but with KMS the key policy must open the gate before IAM policies take effect. This is why, for cross-account KMS usage, the other account must be explicitly listed in the key policy.

> 🔍 **Going deeper**: An IAM role's **trust policy is also a resource-based policy**. It is a Principal-containing policy that defines, on the role-as-a-resource, "who may assume this role (`sts:AssumeRole`)." That is why cross-account AssumeRole requires both sides: ① the target account role's trust policy (with the calling account listed as Principal) and ② an `sts:AssumeRole` Allow in the caller's identity policy — both are needed (covered in depth on Day 4).

## Condition Keys: The Core of Fine-Grained Control

A Condition is a clause that places "additional constraints" on a policy. Here are the keys security engineers use most, organized by type.

| Condition key | Meaning | Typical use |
|-------------|------|----------|
| `aws:SourceIp` | Request source IP | Allow only from corporate IPs |
| `aws:MultiFactorAuthPresent` | Whether MFA was used | Require MFA for sensitive operations |
| `aws:SecureTransport` | Whether HTTPS is used | Deny plaintext HTTP |
| `aws:RequestedRegion` | Target region | Block operations outside specific regions |
| `aws:PrincipalTag` / `aws:ResourceTag` | Principal/resource tags | ABAC (tag-based access control) |
| `aws:SourceArn` / `aws:SourceAccount` | Origin of the calling service | **Confused Deputy prevention** |
| `s3:x-amz-server-side-encryption` | Upload encryption header | Block unencrypted uploads |
| `kms:ViaService` | Service through which KMS is called | Allow key use only via specific services |

### Example 1: Forcibly Block Unencrypted S3 Uploads

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

This bucket policy denies every upload that arrives without the KMS encryption header. It is the classic example of data protection (Domain 5) and governance enforcement.

### Example 2: No Sensitive Operations Without MFA

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

> ⚠️ **Pitfall**: The difference between `Bool` and `BoolIfExists` is a perennial exam favorite. Some requests (service-to-service calls, STS sessions) do not carry the `aws:MultiFactorAuthPresent` key **at all**. If you test for `"false"` with `Bool`, you end up blocking legitimate requests that lack the key. `BoolIfExists` means "if the key exists, check whether it is false; if it does not exist, pass," so it behaves as intended. Also, `aws:SourceIp` **does not apply to traffic that goes through a VPC endpoint** — in that case use `aws:VpcSourceIp` or `aws:SourceVpc` instead.

> 🔍 **Going deeper**: `aws:SourceArn` and `aws:SourceAccount` are central to preventing **Confused Deputy** attacks. For example, when S3 sends events to SNS, if the SNS topic policy does not use `aws:SourceArn` to state "allow only calls originating from this bucket," someone else's bucket could be abused to trigger your topic. When you trust a service principal (`Service` principal), you almost always add `aws:SourceArn`/`aws:SourceAccount` conditions alongside it (this reappears in an STS context on Day 4).

## Permissions Boundary: Least Privilege for Delegation

A Permissions Boundary is a policy that defines "the **upper bound on the maximum permissions** this principal can have." The identity policy grants permissions; the boundary trims that ceiling. **Effective permissions = identity policy ∩ Permissions Boundary** (intersection).

Its most powerful use is **safely constraining permission delegation** — when you want to give a developer "permission to create IAM roles" while preventing the roles they create from becoming admin.

```json
// Granted to the developer: allow role creation but require attaching the boundary
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

With this, the developer can create roles, but only if `DevBoundary` is attached as the boundary. The effective permissions of that role can never exceed the boundary — structurally blocking privilege escalation.

> 💡 **Related theory**: The evaluation relationship among the four policy types in one picture — **SCP (organizational ceiling) ∩ Permissions Boundary (principal ceiling) ∩ Identity policy (grant) → and an explicit Deny wins everywhere**. SCPs and boundaries are filters that "trim" permissions, not "grant" them. Session policies (passed at AssumeRole time) work as the same kind of intersection filter.

## ABAC: Scalable Least Privilege with Tags

With RBAC (role-based), policies explode as roles multiply. ABAC (Attribute-Based Access Control) expresses permissions with **tags**, keeping the number of policies constant.

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

This single policy expresses "allow only when the principal's `Project` tag matches the resource's `Project` tag." Even with 100 projects, there is still one policy. When a new team is created, you just assign tags — no policy changes.

> 🎯 **Scenario**: "Dozens of teams each operate their own EC2 fleets, and adding IAM policies every time a team is created has hit its limit." The answer is not mass-producing per-team roles and policies but **switching to ABAC**. Assign a `team` tag to principals and a `team` tag to resources, and unify everything under the single condition `aws:PrincipalTag/team == aws:ResourceTag/team`. Map IAM Identity Center session tags, or SAML/OIDC attributes, to PrincipalTag and the same policy applies to federated users as-is.

## Tools That "Discover" Least Privilege

Least privilege is not written from intuition — it is **derived from actual usage data**.

```bash
# Access Analyzer: generate a policy trimmed to actually used permissions based on CloudTrail logs
aws accessanalyzer start-policy-generation \
  --policy-generation-details '{"principalArn":"arn:aws:iam::111122223333:role/AppRole"}' \
  --cloud-trail-details '{...}'

# Identify unused permissions by last-accessed time (Access Advisor)
aws iam get-service-last-accessed-details \
  --job-id <job-id>
```

IAM Access Analyzer's policy generation feature builds a policy from only the actual calls recorded in CloudTrail. Access Advisor (service-last-accessed) shows "permissions not used even once in the last N months," providing evidence for trimming excessive permissions.

> 📚 **Case study**: Many organizations start with policies close to `*:*` and only narrow to least privilege after an incident. Best practice is the reverse — an **incremental approach of "add permissions when a needed one is denied."** Use a policy generated by Access Analyzer as the starting point, monitor CloudTrail for `AccessDenied`, and add only what is genuinely needed. "Grant narrowly and widen" does not create security debt the way "grant broadly and narrow" does.

## Policy Conflicts and Precedence: A Synthesis

A checklist for quickly adjudicating the outcome when multiple policies intersect.

1. Is there an **explicit Deny** anywhere? → If so, done — Deny.
2. Does the **SCP** allow the Action? → If not, Deny.
3. Does the **Permissions Boundary** allow it? → If not, Deny.
4. (If cross-account) Do **both** accounts allow it? → If either side is missing, Deny.
5. Is there an **explicit Allow**? → If not, implicit Deny.
6. All passed → Allow.

> 💡 **Related theory**: In this order, steps 2–4 (SCP, boundary, both sides of cross-account) are all "**ceiling-trimming filters**," and only step 5 (Identity/Resource Allow) is the stage that "grants" permission. Keep this distinction sharp, and the answer to "I have the permission — why is it denied?" almost always turns out to be a block somewhere in the filters (2–4), which you can pinpoint quickly.

## Wrapping Up — Precision Is Security

Today's three takeaways. First, **identity policies address "what the principal can do"; resource policies address "who can access this resource"** — and cross-account access and KMS key policies belong to the resource-policy domain. Second, use **Condition keys** for fine-grained control based on IP, MFA, encryption, and tags, while avoiding traps like `BoolIfExists` and `aws:SourceArn`. Third, **Permissions Boundaries and ABAC** are the tools for designing least privilege "scalably," and least privilege is derived not from intuition but from Access Analyzer and Access Advisor data.

Tomorrow we move on to STS and temporary credentials. We will dig into exactly how AssumeRole works, what federation and role chaining are, and how to block the Confused Deputy we briefly met today using `ExternalId` and `aws:SourceArn`. The trust policies and Condition keys you learned today are the raw material for all of it.

---

## 📝 연습 문제

**문제 1.** A Lambda function in Account A must decrypt data encrypted with a KMS key managed in Account B. What must be configured?

A) Adding `kms:Decrypt` permission to Account A's Lambda execution role is sufficient  
B) Allow Account A's role in Account B's KMS key policy, and also grant `kms:Decrypt` to Account A's role  
C) Add `kms:Decrypt` only to an IAM user policy in Account B  
D) If the two accounts are in the same region, access is allowed automatically with no extra configuration  

**정답: B**  
해설: Because the KMS key policy is the primary authority, cross-account use requires the key-owning account (B) to explicitly allow the calling account's (A) principal in the key policy, while A's identity policy must also contain a `kms:Decrypt` Allow. Either side alone is insufficient, and being in the same region has nothing to do with authorization.

---

**문제 2.** Which of the following conditions intends "deny if there is no MFA," but risks blocking legitimate requests — such as service-to-service calls — where the MFA key is entirely absent?

A) `"BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}`  
B) `"Bool": {"aws:MultiFactorAuthPresent": "false"}`  
C) `"Null": {"aws:MultiFactorAuthPresent": "true"}`  
D) `"BoolIfExists": {"aws:MultiFactorAuthPresent": "true"}`  

**정답: B**  
해설: `Bool` assumes the key must exist and evaluates its value, so on service calls lacking the MFA context key the condition can unintentionally match and block legitimate requests. `BoolIfExists` evaluates the value only when the key exists and passes otherwise, avoiding this side effect. This difference is a classic pitfall when writing MFA-enforcement policies.

---

**문제 3.** An organization faces the operational burden of adding IAM policies every time a team is added. What is the most appropriate approach to implement "allow only when the principal's and resource's team tags match" without exploding the number of policies?

A) Create a separate role and dedicated policy for each team  
B) Give every user the same admin policy and operate on trust  
C) Unify policies with an ABAC condition comparing `aws:PrincipalTag` and `aws:ResourceTag`  
D) Create a separate AWS account per team for physical isolation  

**정답: C**  
해설: ABAC expresses the match between principal tags and resource tags as a condition, handling any number of teams with a single policy — as teams grow, you just assign tags without changing policies. Mass-producing per-team roles and policies carries RBAC's policy explosion problem, blanket admin grants violate least privilege, and per-team account separation is excessive and not what this question intends.

---

**문제 4.** You want to grant a developer permission to create IAM roles while enforcing that any role they create cannot exceed a granted ceiling. What is the most appropriate mechanism?

A) Deny `iam:CreateRole` itself via SCP  
B) When allowing `iam:CreateRole`, enforce attachment of a specific Permissions Boundary as a condition  
C) Grant the developer only `ReadOnlyAccess`  
D) Have a human review created roles daily and delete excessive ones  

**정답: B**  
해설: Enforcing attachment of a designated boundary at role-creation time via the `iam:PermissionsBoundary` condition limits the created role's effective permissions to the intersection with the boundary, structurally blocking privilege escalation. Blocking CreateRole entirely makes delegation impossible, ReadOnly alone cannot create roles, and after-the-fact human review carries high risks of omission and delay.

---

**문제 5.** You want to enforce that every object uploaded to an S3 bucket is encrypted with KMS. What is the most direct and gap-free method?

A) Distribute a development guide instructing all uploading application code to include the encryption header  
B) In the bucket policy, Deny PutObject requests lacking the encryption header using the `s3:x-amz-server-side-encryption` condition  
C) Detect unencrypted objects with GuardDuty and send alerts  
D) Grant encryption permissions separately per IAM user  

**정답: B**  
해설: Explicitly denying PutObject without the encryption header in the bucket policy via the `s3:x-amz-server-side-encryption` condition is a preventive control that blocks unencrypted uploads no matter which principal uploads. A development guide has no enforcement power and gets missed, GuardDuty detection is only an after-the-fact alert that cannot block the upload, and per-user permission grants are not directly related to enforcing encryption.

---
