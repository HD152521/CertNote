# Day 3 - IAM Policies in Depth: Identity vs Resource Policies, Condition Keys, Least Privilege Design

If yesterday you learned the policy evaluation algorithm, today we handle precisely the policies themselves that feed into that algorithm. Where SCS-C03 really discriminates in IAM is not "can you write a policy" but **"can you pick the most precise, least-privilege one among several controls that produce the same result."** If you solve with a Resource policy something that should be solved with an Identity policy, it works but becomes a trap option, and if you split into a separate role something that a single Condition key could finish, it becomes over-design.

Today we dig into three things. First, when and how Identity policies and Resource policies diverge. Second, how to apply precise control based on IP, MFA, encryption, and tags using Condition keys. Third, how to design least privilege **in a scalable way** using Permissions Boundaries and ABAC.

## Identity-based vs Resource-based: The Decision Criteria

| Category | Identity-based | Resource-based |
|------|---------------|----------------|
| Where attached | User/Group/Role | A resource (S3, KMS, SQS, SNS, Lambda, etc.) |
| Principal element | None | **Required** |
| Main use | "What can this principal do" | "Who accesses this resource" |
| cross-account | Cannot work alone (the other side's resource policy is needed) | **Can allow another account on its own** |
| Representative examples | Managed/inline policies | S3 bucket policy, KMS key policy, an IAM Role's trust policy |

The selection criteria are clear.

- **"Grant permissions to a principal within the same account"** → Identity policy
- **"Another account/service accesses my resource"** → Resource policy (the core tool for cross-account)
- **"Enforce a blanket rule no matter who accesses the resource"** (for example, enforcing encryption on all PutObject) → Resource policy

Drawing these three lines as a decision tree is much faster in the exam room.

```
[ Which kind of policy do I solve it with ]

  Read the requirement as one sentence
        │
        ├─ The subject is "this team / this application must be able to …"
        │      → **Identity policy**  (granted from the principal side)
        │
        ├─ The subject is "this bucket / this key must accept only …"
        │      → **Resource policy**  (controlled from the resource side)
        │
        ├─ "Another account must access"
        │      ├─ The target service supports resource policies  → both policies (AND)
        │      └─ Not supported (EC2, DynamoDB, etc.) → **the role-assumption method**
        │
        ├─ "Must be enforced for whoever comes, with no exceptions"
        │      → **A Deny in a Resource policy**  (no need to manage a list of principals)
        │
        └─ "Must be enforced on all accounts in the organization"
               → **SCP**  (an account-level ceiling, deepened in Day 5 and Week 2)
```

The fourth branch is especially important in practice. If you apply a rule like "no unencrypted uploads" with an Identity policy, it holds only if you **cover every principal without missing one**. The moment a new role is created, a hole opens. On the other hand, if you apply it as a Deny in a resource policy, **every request** arriving at that resource is filtered, so there is no need to manage a list of principals. The principle is that **a requirement of "no exceptions" is applied from the resource side**.

### Which Services Support Resource Policies

| Service | Resource policy | Name | Characteristics in cross-account |
|--------|-------------|------|----------------------|
| S3 | O | Bucket policy | The most common cross-account path |
| KMS | O | Key policy | **Without a key policy, IAM alone cannot use it** |
| SQS / SNS | O | Queue/topic policy | A source condition is required when trusting a service principal |
| Lambda | O | Function policy (resource-based) | When opening the function to be invoked by other services |
| Secrets Manager | O | Secret policy | Cross-account secret sharing |
| IAM Role | O | **Trust policy** | Defines the principals that can assume the role |
| EFS / API Gateway / ECR | O | Each one's resource policy | — |
| EC2 instance | X | — | Solved with the role-assumption method |
| DynamoDB table | X | — | Solved with the role-assumption method |
| RDS instance | X | — | Solved with roles, networking, and the DB's own authentication |

> ⚠️ **Trap**: An option saying "attach a resource policy" to a service that does not support resource policies is wrong by itself. **EC2 and DynamoDB** are the classic examples. If you must read a DynamoDB table cross-account, the answer is not "attach a policy to the table" but "create a role in the account that has the table, and have the other account assume that role." The very fact that support for resource policies differs by service is an exam point.

The real strength of resource policies is that they **"set up the default deny once more on the resource side."** An Identity policy can be widened at any time by the administrator of the account managing that principal, but a resource policy can be edited **only by the account that owns the resource**. So for sensitive-data buckets, conditions like "only our organization's principals," "only over HTTPS," and "only through this VPC endpoint" are embedded on the resource side. Whatever happens in the caller's account, these conditions hold. The habit of asking who manages a policy is the core of multi-layer defense.

KMS key policies are special. **For every KMS key, the key policy is the primary authority**, so unless the key policy allows IAM delegation (`"Principal": {"AWS": "arn:aws:iam::ACCOUNT:root"}` + permissions in IAM), the key cannot be used with IAM policies alone. For S3 and SQS, either an IAM policy or a resource policy is enough, but for KMS, the IAM policy works only after the key policy has opened the gate. This is why, when using KMS cross-account, the other account must be specified explicitly in the key policy.

An IAM Role's **trust policy is also a resource-based policy.** It is a policy with a Principal that defines, on the resource called Role, "who can assume this role (`sts:AssumeRole`)." So cross-account AssumeRole needs both ① the trust policy of the Role in the target account (naming the calling account in the Principal) and ② an `sts:AssumeRole` Allow in the caller's identity policy (in depth on Day 4).

## Condition Keys: The Core of Precise Control

Condition is the clause that places "additional constraints" on a policy. We organize by type the keys that security engineers use most.

| Condition key | Meaning | Representative use |
|-------------|------|----------|
| `aws:SourceIp` | Request source IP | Allow only from the corporate IP |
| `aws:MultiFactorAuthPresent` | Whether MFA authenticated | Enforce MFA on sensitive actions |
| `aws:SecureTransport` | Whether HTTPS | Deny plaintext HTTP |
| `aws:RequestedRegion` | Target Region | Block actions outside particular Regions |
| `aws:PrincipalTag` / `aws:ResourceTag` | Principal/resource tags | ABAC (tag-based access control) |
| `aws:SourceArn` / `aws:SourceAccount` | The calling service's origin | **Preventing Confused Deputy** |
| `s3:x-amz-server-side-encryption` | Upload encryption header | Block unencrypted uploads |
| `kms:ViaService` | The service through which the KMS call is made | Allow key use only via specific services |

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

This bucket policy denies every upload that arrives without the KMS encryption header. It is a classic of data protection (Domain 5) and governance enforcement.

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

> ⚠️ **Trap**: The difference between `Bool` and `BoolIfExists` is easy to confuse. For some requests (service-to-service calls, STS sessions), the `aws:MultiFactorAuthPresent` key itself **does not exist**. If you test for `"false"` with `Bool`, even normal requests that lack the key get blocked. `BoolIfExists` means "if the key exists, check whether it is false; if it does not exist, pass," so it works as intended. Also, `aws:SourceIp` **does not apply to traffic going through a VPC endpoint** — in that case you must use `aws:VpcSourceIp` or `aws:SourceVpc`.

`aws:SourceArn` and `aws:SourceAccount` are the core of preventing **Confused Deputy** attacks. For example, when S3 sends events to SNS, unless the SNS topic policy specifies with `aws:SourceArn` "only allow calls from this bucket," someone else's bucket can be abused to trigger my topic. When trusting a service principal (`Service` principal), you almost always attach an `aws:SourceArn`/`aws:SourceAccount` condition together (it reappears in the STS context on Day 4).

### Example 3: Allow Sensitive Actions Only from the Office IP

```json
{
  "Sid": "DenyOutsideCorporateNetwork",
  "Effect": "Deny",
  "Action": ["iam:*", "kms:ScheduleKeyDeletion", "s3:DeleteBucket"],
  "Resource": "*",
  "Condition": {
    "NotIpAddress": {
      "aws:SourceIp": ["203.0.113.0/24", "198.51.100.0/24"]
    },
    "Bool": { "aws:ViaAWSService": "false" }
  }
}
```

The reason the two conditions are applied together matters. If you wrote only the first line, even **requests that AWS services make on our behalf** would be blocked. For example, when CloudFormation creates an IAM role while building a stack, the source IP of that call is not the office. You must narrow it so that the IP is considered only when `aws:ViaAWSService` is `false` (that is, only when a human calls directly) for the policy to survive in practice.

### Example 4: Block Actions Outside Approved Regions

```json
{
  "Sid": "DenyUnapprovedRegions",
  "Effect": "Deny",
  "NotAction": [
    "iam:*", "sts:*", "organizations:*",
    "cloudfront:*", "route53:*", "support:*",
    "waf:*", "shield:*", "budgets:*"
  ],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
    }
  }
}
```

Everything learned up to today is compressed in this document. Because it is a prohibition requirement, it is written as **`Deny`**, **`NotAction` is combined with Deny** so that it fails in the safe direction even when new services appear, and **global services are made exceptions**. Without that last item, even creating IAM roles and console sign-in are blocked and the organization is paralyzed — a self-inflicted accident that actually happens often.

### The Minimum Criteria for Choosing a Condition Operator

In a condition, "which operator to look with" matters as much as "which key to look at." For now just make certain of the four branches below, and the full map of operators and precise operators such as `ForAllValues` and `Null` are **covered in Week 2.**

| Situation | Form to use | Reason |
|------|---------------|------|
| The value must match exactly | `StringEquals` | Exact match, case-sensitive |
| Must block if the value is not in the list | `Deny` + `StringNotEquals` | Combined with Allow, it is bypassed by another Allow |
| The key may be absent | The `...IfExists` family | Prevents normal requests from being blocked due to a missing key |
| Checking an IP range | `IpAddress` / `NotIpAddress` | String comparison cannot handle CIDR |

Let us nail down just one core principle now. **Always use `Deny` to express a prohibition.** If you write "allow only when MFA is present" as `Allow` + condition, then if there is even one unconditional Allow elsewhere, the request passes through that one. On the other hand, if you write "deny if there is no MFA" as `Deny` + condition, it cuts off regardless of any other Allow. Build guardrails always on the Deny side.

If you confuse the combination rules when a condition has multiple entries, the policy behaves in exactly the opposite way. **Different condition operator blocks combine with AND** (all must be true for the Statement to apply), **multiple keys within the same block also combine with AND**, but **multiple values for one key combine with OR**. In the Region example above, `["ap-northeast-2", "us-east-1"]` is "true if equal to either one," so combined with `StringNotEquals` it becomes "deny if it is neither." If you know this rule backward, a policy you thought would allow only one Region ends up allowing everything or blocking everything.

> 🎯 **Scenario**: "The audit log bucket must be (1) HTTPS only, (2) only our organization's accounts, (3) object deletion impossible for anyone." → All three requirements are **prohibition-type**. So you write three Deny statements in the bucket policy. Deny when `aws:SecureTransport` is false, Deny when the organization identifier condition does not match, and a blanket Deny on `s3:DeleteObject` and `s3:DeleteObjectVersion`. On top of this, adding the resource's own features (Versioning + Object Lock) makes it so that even an administrator who can edit the policy cannot delete objects. **Applying the policy and the resource features together is the complete form of the "no exceptions" requirement.**

## Permissions Boundary: Least Privilege for Delegation

A Permissions Boundary is a policy that defines "the **ceiling of maximum permissions** this principal can have." The identity policy grants permissions, and the boundary trims that ceiling. **Effective permissions = identity policy ∩ Permissions Boundary** (intersection).

Its most powerful use is **safely restricting the delegation of permissions**. When you want to give a developer "permission to create IAM roles" but stop the roles he creates from becoming admin.

```json
// Granted to the developer: role creation is allowed, but attaching the boundary is enforced
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

With this, the developer can create roles, but must attach `DevBoundary` as the boundary. That role's effective permissions cannot exceed the boundary — privilege escalation is structurally blocked.

Looking at the word intersection as a picture makes clear why a boundary "cannot grant permissions."

```
[ Effective permissions are always an intersection ]

   ┌──────────────────────────────────────────┐
   │  SCP allowed range (the account ceiling set by the organization) │
   │  ┌────────────────────────────────────┐  │
   │  │ Permissions boundary (the max this principal can have) │  │
   │  │   ┌──────────────────────────┐     │  │
   │  │   │  Identity policy (actually granted) │     │  │
   │  │   │                          │     │  │
   │  │   │   ███ Effective permissions ███   │     │  │
   │  │   │                          │     │  │
   │  │   └──────────────────────────┘     │  │
   │  └────────────────────────────────────┘  │
   └──────────────────────────────────────────┘
        ✂ And if there is an explicit Deny at any layer,
          that action is cut off wherever it is in the picture above

   ── Points people often get wrong ──────────────────────────
   · If the Identity policy sticks out past the boundary → that part is **void**
   · If the boundary is wide but the Identity policy is empty → permissions are **0**
     (the boundary is a ceiling, not a floor)
   · Even if the SCP allows, with no Identity policy → permissions are **0**
```

The last two lines of this picture decide the answer on the exam. The answer to a question like "I put an `s3:*` Allow in the SCP, so why can the user not use S3" is **"because an SCP does not grant permissions."** SCPs, boundaries, and session policies are all ceilings, and what creates the floor is only the Identity policy (or the resource policy).

| Policy | Does it **grant** permissions | Does it **set a ceiling** | Managed by |
|------|---------------------|--------------------|-----------|
| Identity policy | O | X | The account's IAM administrator |
| Resource policy | O | X (can narrow with conditions) | The account that owns the resource |
| Permissions boundary | **X** | O | The account's IAM administrator |
| SCP | **X** | O | The organization's management account |
| Session policy | **X** | O | The code that assumes the role |

Attaching a permissions boundary alone does not make delegation safe. If a developer can use `iam:CreateRole`, you must also control `iam:PutRolePolicy` and `iam:AttachRolePolicy`, and above all you must **block `iam:DeleteRolePermissionsBoundary`**. If the permission to remove the boundary remains, the boundary is decoration. So in practice a delegation policy goes as one bundle: "allow role creation + enforce boundary attachment + prohibit boundary modification/deletion + allow creation only under a specific path." Questions on the exam asking about privilege escalation present a situation where one piece of this bundle is missing.

Summarizing the evaluation relationship of the four policy types in one picture — **SCP (organization ceiling) ∩ Permissions Boundary (principal ceiling) ∩ Identity policy (grant) → and an explicit Deny takes priority from anywhere**. SCPs and Boundaries are filters that "trim," not that "grant." A Session policy (passed at AssumeRole) also works as the same intersection filter.

## ABAC: Scalable Least Privilege with Tags

With RBAC (role-based), policies explode as roles increase. ABAC (Attribute-Based Access Control) expresses permissions with **tags** and keeps the number of policies constant.

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

This single policy expresses "allow only when the principal's `Project` tag and the resource's `Project` tag are the same." Even with 100 projects, there is 1 policy. Even when a new team appears, you only assign tags with no policy change.

The `${aws:PrincipalTag/Project}` part is a **policy variable**. Because it is substituted at evaluation time with a value from the request context, a "compare for equality" that cannot be expressed with a static string becomes possible. Commonly used variables are as follows.

| Variable | Value substituted | Representative use |
|------|-------------|-----------|
| `${aws:username}` | IAM user name | Per-user home directory isolation |
| `${aws:userid}` | Unique principal identifier | Per-session isolation |
| `${aws:PrincipalTag/key}` | The tag value attached to the principal | The left side of ABAC |
| `${aws:PrincipalOrgID}` | Organization identifier | Restrict to the organization's scope |

```json
// Each user handles objects only under a prefix with their own name
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::team-workspace/home/${aws:username}/*"
}
```

RBAC and ABAC are not a replacement relationship but a **combination**. The shape of the requirement decides which one is right.

| Axis | RBAC (role-based) | ABAC (attribute-based) |
|----|------------------|------------------|
| Basis of permission | "Which role was assumed" | "Which attributes it has" |
| As the organization grows | The number of roles and policies grows together | The number of policies stays **constant** |
| When adding a new team | Create new roles and policies | Just assign tags |
| Audit question "who can see this" | Easy to answer (list of roles) | Hard to answer (must sweep all tags) |
| Prerequisite | None | **Tag discipline must be enforced** |
| Good fit | When job functions are distinct and few | When teams and projects keep growing |

ABAC failures mostly come from **tag management**, not the policy. If you create resources without attaching tags, the condition does not match and access breaks, and conversely **if users can freely change their own resource tags, they can widen their own permissions.** So to use ABAC you need both ① enforcing tags as required at creation and ② policies controlling tag changes themselves with `aws:TagKeys` and `aws:RequestTag`. If you choose based only on the sentence "adopting ABAC reduces policies to one," you will wrongly pick the option lacking tag control as the answer.

The path for applying ABAC to federated users is **session tags**. If you inject the attributes sent by the external IdP (department, project, job function) as session tags at the moment of assuming the role, they are read directly as `aws:PrincipalTag/*`. IAM Identity Center passes attributes on the same principle. That is, ABAC is not a story that ends inside IAM but **a design that depends on the quality of attributes in the corporate directory**. If the directory's department information is inaccurate, the AWS permissions are inaccurate too. How session tags are actually passed is covered on Day 4.

> 🎯 **Scenario**: "Dozens of teams each operate EC2, and adding IAM policies every time a team is added has hit its limit." The answer is not mass-producing per-team roles and policies but **moving to ABAC**. Assign a `team` tag to principals and a `team` tag to resources, and unify with one condition `aws:PrincipalTag/team == aws:ResourceTag/team`. If you map IAM Identity Center session tags and SAML/OIDC attributes to PrincipalTag, it applies as-is to federated users too.

## Tools for "Discovering" Least Privilege

Least privilege is not written by intuition but **derived from actual usage data**.

```bash
# Access Analyzer: generate a policy that picks out only the actually used permissions based on CloudTrail logs
aws accessanalyzer start-policy-generation \
  --policy-generation-details '{"principalArn":"arn:aws:iam::111122223333:role/AppRole"}' \
  --cloud-trail-details '{...}'

# Identify unused permissions by last-used time (Access Advisor)
aws iam get-service-last-accessed-details \
  --job-id <job-id>
```

IAM Access Analyzer's policy generation feature creates a policy from only the actual calls recorded in CloudTrail. Access Advisor (service-last-accessed) shows "permissions never used in the last N months," providing the basis for trimming excessive permissions.

The order used in practice is as follows. This procedure itself is the answer skeleton for the exam's "how do you arrive at least privilege" questions.

```
[ Procedure for deriving least privilege from data ]

  ① First make it work with broad permissions (only in dev/staging)
        │   The purpose is to observe "which APIs it actually calls"
        ▼
  ② Collect actual usage with CloudTrail over a period
        │   If it is short, you miss rare calls like month-end batches and quarterly jobs
        ▼
  ③ Extract a draft with Access Analyzer policy generation
        │   A policy draft containing only the actions actually called
        ▼
  ④ A human reviews the draft and narrows the resource scope
        │   The Analyzer narrows actions but sometimes leaves resources wide
        ▼
  ⑤ Check syntax and over-broad permissions with the policy validation tool
        │   A pre-deployment gate (put it in CI)
        ▼
  ⑥ After deployment, monitor AccessDenied and add back only what is needed
        │   "Grant narrowly and widen" — the opposite direction becomes security debt
        ▼
  ⑦ Periodically re-review unused permissions with Access Advisor
```

```bash
# Create a job to investigate when each service was last used
aws iam generate-service-last-accessed-details \
  --arn arn:aws:iam::111122223333:role/AppRole

# Query the result — services unused for a long time are the candidates to trim
aws iam get-service-last-accessed-details --job-id <job-id>

# A report of the whole account's credential status (users, keys, MFA, last use)
aws iam generate-credential-report
aws iam get-credential-report --query Content --output text

# Validate policy syntax and security warnings before deployment
aws accessanalyzer validate-policy \
  --policy-document file://new-policy.json \
  --policy-type IDENTITY_POLICY
```

"Starting broad" in ① may sound contradictory to the least privilege principle, but it is not. The key is **where you start broad**. Open wide for observation purposes in an isolated dev environment, and apply the observed results **to production narrowed**. Starting broad in production and narrowing later fails because "let us narrow it someday" never comes. Security debt is like technical debt: debt with no plan to repay is not debt but loss.

The most common accident when trimming permissions is **missing a rarely executed path**. If you build the policy from two weeks of CloudTrail, the month-end settlement batch, the quarterly audit job, and the recovery script that runs only during outages all drop out wholesale. And they fail at precisely the most important moment. So in practice you ① set the observation period to at least a quarter, ② have humans watch `AccessDenied` alerts for the first few days after deployment, and ③ deploy in a revertible form (policy version rollback). Permission reduction must be treated as a deployment task just like a functional change, not as a cleanup task you can just do because it is safe.

Many organizations start with policies close to `*:*` at first and only reduce to least privilege after an incident. The best practice is the opposite, a **gradual method of "adding when a needed permission is denied."** Take the policy generated by Access Analyzer as the starting point, monitor CloudTrail's `AccessDenied`, and add only the permissions that are truly needed. "Grant narrowly and widen" creates no security debt, unlike "grant broadly and narrow."

## Policy Conflicts and Priority Summary

A checklist for quickly judging the result when multiple policies are entangled.

1. Is there an **explicit Deny** anywhere? → If so, it ends, Deny.
2. Does the **SCP** allow the Action? → If not, Deny.
3. Does the **Permissions Boundary** allow it? → If not, Deny.
4. (If cross-account) Do **both** accounts allow it? → If either is missing, Deny.
5. Is there an **explicit Allow**? → If not, implicit Deny.
6. All passed → Allow.

In this order, steps 2-4 (SCP, Boundary, both sides of cross-account) are all "**filters that trim the ceiling**," and only step 5 (Identity/Resource Allow) is the step that "grants permissions." If you make this distinction clear, for the problem "I have the permission, so why does it not work," you can quickly pinpoint that the answer is almost always that it is blocked somewhere in the filters (2-4).

## Wrap-Up

Today's three core points. First, **an Identity policy handles "what the principal does" and a Resource policy handles "who gets to this resource"**, and cross-account and KMS key policies are the domain of Resource policies. Second, apply precise control based on IP, MFA, encryption, and tags with **Condition keys**, but avoid traps such as `BoolIfExists` and `aws:SourceArn`. Third, **Permissions Boundaries and ABAC** are tools for designing least privilege "in a scalable way," and least privilege is derived not from intuition but from the data of Access Analyzer and Access Advisor.

Tomorrow we move on to STS and temporary credentials. We cover in depth exactly how AssumeRole works, what federation and role chaining are, and how to block the Confused Deputy we briefly met today with `ExternalId` and `aws:SourceArn`. The trust policies and Condition keys we learned today are the ingredients for all of it. And the precision drill of calculating a single request by hand with six kinds of policies entangled at once continues on **the first day of Week 2**.

### One-Line Summary

Policies are divided by where they are attached — **an Identity policy handles "what the principal does" and a Resource policy handles "who gets to this resource"**, and only the latter has a `Principal`. Resource policies are **supported by only some services** (EC2 and DynamoDB are not), so cross-account access for such services is solved with the role-assumption method. The principle is that a requirement to "enforce with no exceptions" is applied not with an Identity policy, which must cover every principal without a gap, but as **a Deny in a Resource policy**. Conditions combine **across different blocks with AND, and multiple values of one key with OR**, and prohibitions must be expressed as `Deny` so they are not bypassed by another Allow. `NotAction` is combined only with Deny, and IP conditions are paired with `aws:ViaAWSService` to keep service-delegated calls working. **Permissions boundaries, SCPs, and session policies are only ceilings and cannot create a floor**, so putting an Allow in an SCP creates no permissions, and when delegating a boundary you must also block the permission that removes the boundary (`iam:DeleteRolePermissionsBoundary`). ABAC keeps the number of policies constant but holds **only when tag control is also in place**. Least privilege is **derived**, not by intuition, through the procedure CloudTrail → Access Analyzer policy generation → human review → pre-deployment validation → observing `AccessDenied`.

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
