# Day 2 - IAM Fundamentals: Users, Groups, Roles, Policies, and the Basic Flow of Policy Evaluation

IAM is the spine of AWS security. Wherever you go among the six domains we saw yesterday, everything ultimately reduces to the question: "Can this principal perform this action on this resource?" KMS decryption, S3 GetObject, cross-account deployment — all are decided on the same engine: IAM evaluation logic. That is why you must approach IAM not as "memorizing policy JSON" but as **understanding the evaluation algorithm** if you want to solve SCS-C03's subtle scenarios.

Today we walk through exactly what IAM's four building blocks (users, groups, roles, policies) are, and step through the evaluation flow by which AWS decides Allow/Deny when a request comes in. To give you the one key sentence of the evaluation order up front: **"An explicit Deny beats everything. Then there must be an explicit Allow for the request to be permitted. If neither exists, it's an implicit Deny."**

## IAM Building Blocks: Users, Groups, Roles, Policies

| Element | Definition | Credentials | Primary use |
|------|------|----------|----------|
| **User** | Permanent identity, corresponding to one person or app | Long-term access keys, password | Avoid where possible (key exposure risk) |
| **Group** | A collection of users, a container for attaching policies | None (no credentials) | Grant policies to users in bulk |
| **Role** | An identity anyone can temporarily "assume" | STS temporary credentials (expiring) | EC2/Lambda, cross-account, federation |
| **Policy** | A JSON document describing permissions | N/A | Attached to the elements above to define permissions |

Here is an insight the exam targets repeatedly: **avoid long-term credentials (IAM User access keys) as much as possible, and use a Role's temporary credentials instead.** If EC2 needs access to S3, you do not put User access keys on the instance — you attach an **instance profile (IAM Role)**. If Lambda accesses DynamoDB, you use an **execution role**. Even humans should preferably sign in via **IAM Identity Center (SSO)** and receive temporary credentials instead of using IAM Users.

> 💡 **Related theory**: A Group is only a "container" and has no credentials of its own, so **a Group cannot be specified as a Principal.** This is a spot newcomers frequently get wrong — writing `"Principal": {"AWS": "arn:...:group/Devs"}` in a Role's trust policy does not work. A group is merely a conduit for delivering policies to users; it cannot be the target of AssumeRole.

> 🔍 **Going deeper**: What "assuming" a Role actually means is that STS (Security Token Service) issues a set of three temporary credentials (AccessKeyId, SecretAccessKey, **SessionToken**). These credentials have an expiration time (default 1 hour, maximum 12 hours), so even if they are exposed, the impact is bounded in time. This is the fundamental reason they are safer than long-term keys, and we cover STS in depth on Day 4.

## Two Kinds of Policies: Identity-based vs Resource-based

Policies split into two kinds by "where they attach." Today we only establish the concept; Day 3 goes deep.

- **Identity-based policy**: Attaches to a User, Group, or Role. Describes "what this principal can do." It has no Principal element (whoever it attaches to is the principal).
- **Resource-based policy**: Attaches directly to a resource (S3 bucket, KMS key, SQS queue, etc.). **The Principal element is required** — it describes "who can access this resource."

The decisive utility of resource-based policies is that they enable **cross-account access**. To open your S3 bucket to a principal in another account, you specify the other account in the bucket's resource-based policy.

## IAM Policy JSON Structure

Every policy is an array of Statements, and each Statement has the following elements.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowReadSpecificBucket",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::my-secure-bucket",
        "arn:aws:s3:::my-secure-bucket/*"
      ],
      "Condition": {
        "Bool": {"aws:SecureTransport": "true"}
      }
    }
  ]
}
```

- **Effect**: `Allow` or `Deny`
- **Action**: The API action to allow/deny (`s3:GetObject`). Wildcards (`s3:*`) are allowed
- **Resource**: The target ARN. Required in identity-based policies; in resource-based policies it is usually `*` (the policy is already attached to that resource)
- **Principal**: Who (used only in resource-based policies and trust policies)
- **Condition**: Additional constraints (IP, MFA, time, encryption status, etc.)

> ⚠️ **Pitfall**: Combining `"Resource": "*"` with `"Action": "*"` is effectively admin. When the exam asks about "least privilege," the answer choice that narrows the wildcards is correct. In particular, `s3:ListBucket` applies to the bucket ARN (`arn:aws:s3:::bucket`), while `s3:GetObject` applies to the object ARN (`.../*`) — mixing up the two ARN levels so the policy does not work is a common mistake.

## The Basic Policy Evaluation Flow: The Algorithm That Decides Allow/Deny

This is today's core. Within a single account, when a request comes in, AWS decides in the following order.

```
[ IAM policy evaluation flow (single account) ]

  Request (Principal + Action + Resource + Context)
        |
   1. Collect all applicable policies
      (Identity-based, Resource-based, SCP, Permissions Boundary, Session policy)
        |
   2. Is there even one explicit Deny?  ── Yes ──▶  DENY (top priority, unconditional)
        | No
   3. Does the SCP allow this Action? ── No ──▶ DENY
        | Yes
   4. Does the Permissions Boundary allow it? ── No ──▶ DENY
        | Yes
   5. Is there even one explicit Allow? ── No ──▶ DENY (implicit deny)
        | Yes
        ▼
      ALLOW
```

It compresses into three principles.

1. **The default is implicit deny**: If no policy allows it, it is denied. Permissions must be granted explicitly.
2. **An explicit Allow overrides the implicit Deny**: If something explicitly allows it, the default denial is lifted.
3. **An explicit Deny beats everything (explicit deny overrides)**: No matter what policy allows it, if any other policy contains an explicit Deny, it is unconditionally denied.

> 💡 **Related theory**: When memorizing this evaluation order, the key point is that **"guardrails (SCPs, Permissions Boundaries) do not grant permissions — they only draw an upper bound."** Even if an SCP allows `s3:*`, that alone creates no permissions — there must be an explicit Allow in an identity-based policy. An SCP only defines the "maximum allowed scope." That is why the common pattern in SCPs is not Allow but Deny guardrails.

> 🔍 **Going deeper**: In the cross-account case, evaluation happens **separately in both accounts**. For a principal in account A to access a bucket in account B, you need ① an Allow in account A's identity-based policy **and** ② account B's resource-based policy allowing A — **both** are required (within the same account, either one alone suffices). This "both sides" rule is the recurring trap in cross-account scenarios.

## Reading the Evaluation Flow Through Scenarios

Let's hold the abstract algorithm up against concrete situations.

**Situation 1: A developer has admin permissions, but you want to block only one specific S3 bucket.**
The identity-based policy is `AdministratorAccess`, so it allows everything. If you add an explicit Deny statement (e.g., `"Effect": "Deny"` on the specific bucket ARN), the explicit Deny beats the Allow, and only that bucket is blocked. Put the same Deny in an SCP and it is enforced across the whole account.

```json
{
  "Effect": "Deny",
  "Action": "s3:*",
  "Resource": [
    "arn:aws:s3:::sensitive-prod-bucket",
    "arn:aws:s3:::sensitive-prod-bucket/*"
  ]
}
```

**Situation 2: An SCP explicitly denies `ec2:*`, but the user has `AmazonEC2FullAccess`.**
The result is Deny. The SCP's explicit Deny beats everything. The Allow in the user's policy is neutralized. This is why SCPs are used as governance guardrails.

> 🎯 **Scenario**: A security team wants to prevent CloudTrail from being disabled in all accounts. The answer is not to modify per-user policies but to apply an **SCP denying `cloudtrail:StopLogging` and `cloudtrail:DeleteTrail`** to the OU. Then even an admin or root in that account cannot turn off CloudTrail (the management account root is exempt from SCPs). It is the governance application of the principle that an explicit Deny beats every Allow.

## Policy Debugging Tools: Verifying Who Can Do What

If you trace the evaluation logic only in your head, you will make mistakes. AWS provides verification tools.

```bash
# IAM Policy Simulator: simulate whether a specific principal can perform specific actions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:user/alice \
  --action-names s3:GetObject s3:DeleteObject \
  --resource-arns arn:aws:s3:::my-bucket/secret.txt

# Who is the current caller? (the starting point of role debugging)
aws sts get-caller-identity

# List the policies attached to a user
aws iam list-attached-user-policies --user-name alice
aws iam list-user-policies --user-name alice  # inline policies
```

> 📚 **Case study**: In production, 80% of "why is access denied" comes down to four causes: ① implicit Deny (nothing allows it), ② a hidden Deny in an SCP, ③ exceeding a Permissions Boundary, ④ only one side allowed in a cross-account setup. The habit of first checking "which role am I right now" with `aws sts get-caller-identity` cuts debugging time in half. CloudTrail's `AccessDenied` events leave clues about which policy caused the denial.

## IAM Access Analyzer: Detecting Unintended External Exposure

IAM Access Analyzer analyzes resource policies to automatically find **resources that allow access from outside the account or organization boundary**. If an S3 bucket, IAM role, KMS key, Lambda function, etc. is open to an external principal, it generates a finding.

This is the intersection of Domain 2 (detection) and Domain 4 (IAM). A human cannot manually review hundreds of buckets and roles, so "access crossing the trust boundary" is detected automatically. The policy generation feature also analyzes CloudTrail logs to build a least-privilege policy from only the permissions actually used.

> 💡 **Related theory**: The core of Access Analyzer is the **external vs trusted** distinction. Access within the same account or organization is treated as normal; only access crossing that boundary is raised as a finding. If you "set the zone of trust to the organization," cross-account access within the organization is treated as normal and only genuine external exposure is caught.

## Wrapping Up — IAM Is an Algorithm

Today's three key points. First, among IAM's building blocks, **use Roles (temporary credentials) by default and avoid Users (long-term keys)** — this is the starting point of every best practice. Second, policy evaluation is an algorithm of three principles — **implicit Deny → explicit Allow overrides it → explicit Deny beats everything** — and SCPs and Permissions Boundaries do not grant permissions, they only draw the upper bound. Third, cross-account access requires allows in **both accounts**.

Tomorrow we dig deeper into policies. We cover the subtle interplay of Identity vs Resource policies, precision control using Condition keys, and practical patterns for designing least privilege with Permissions Boundaries. The evaluation algorithm you learned today is the foundation for all of it.

---

## 📝 연습 문제

**문제 1.** An IAM user has the `AdministratorAccess` managed policy. At the same time, the SCP on the user's account contains an explicit `Deny` on `s3:*`. What happens when this user tries to read an S3 object?

A) AdministratorAccess takes precedence, so it is allowed  
B) The SCP's explicit Deny beats every Allow, so it is denied  
C) The two policies conflict, so an evaluation error occurs  
D) Only the root user can access S3  

**정답: B**  
해설: The absolute principle of policy evaluation is that an explicit Deny takes precedence over any Allow. The SCP acts as a guardrail that caps that Action, so even with admin permissions in the user's policy, the request is blocked by the SCP's Deny. There is no evaluation "error" from a conflict — Deny wins deterministically — and root access is irrelevant to this determination.

---

**문제 2.** An IAM role in account A wants to write objects to an S3 bucket in account B. Which condition must be satisfied for the access to succeed?

A) An Allow in account A's identity-based policy alone is sufficient  
B) An Allow in account B's bucket policy alone is sufficient  
C) There must be an Allow in both account A's identity-based policy and account B's bucket policy  
D) If the two accounts belong to the same Organization, access is automatically allowed without policies  

**정답: C**  
해설: Cross-account access is evaluated separately in each account, so you need both an Allow in the caller's (A's) identity-based policy and an Allow in the resource side's (B's) resource-based policy. Within the same account, either one alone suffices, but once you cross the account boundary, both are mandatory. Merely being in the same Organization does not grant automatic access.

---

**문제 3.** Which statement about IAM Groups is correct?

A) A Group has its own credentials and can sign in directly  
B) A Group can be specified as the Principal in a Role's trust policy  
C) A Group is a credential-less container for attaching policies and cannot be a Principal  
D) Temporary credentials are issued to a Group and used for cross-account access  

**정답: C**  
해설: A Group is merely a container for granting policies to users in bulk; it has no credentials, and therefore cannot sign in or be specified as a Principal. Using a Group as the target of AssumeRole or as the Principal in a trust policy does not work. Temporary credentials are issued by STS through Roles and have nothing to do with Groups.

---

**문제 4.** A developer has been granted `AmazonS3FullAccess` but tries to call `dynamodb:GetItem`, which no policy explicitly allows. What is the result and the reason?

A) Allowed — there is no explicit Deny, so it is allowed by default  
B) Denied — no policy Allows that Action, so the implicit Deny applies  
C) Allowed — having S3 permissions automatically allows DynamoDB too  
D) Denied — because DynamoDB is not controlled by IAM  

**정답: B**  
해설: IAM's default state is implicit Deny, and permissions must be granted explicitly. S3 permissions are unrelated to DynamoDB Actions, so without an explicit Allow for `dynamodb:GetItem`, the request is denied by the implicit Deny. The absence of an explicit Deny does not mean automatic allowance, and DynamoDB is of course controlled by IAM.

---

**문제 5.** A security team wants to enforce that no one (including admins and root) in any member account can disable CloudTrail. What is the most appropriate method?

A) Manually add a CloudTrail Deny to every IAM user policy in each account  
B) Write a Deny on `cloudtrail:StopLogging` and `cloudtrail:DeleteTrail` in an SCP and apply it to the OU  
C) Set a Deny on CloudTrail via a resource-based policy  
D) Use GuardDuty to detect CloudTrail being disabled and only send alerts  

**정답: B**  
해설: An SCP's explicit Deny is an organizational guardrail that applies even to admins and root in member accounts, so denying the CloudTrail stop/delete Actions means no one can turn it off. Per-user policy additions carry a high risk of omissions, CloudTrail does not implement this kind of control via resource-based policies, and GuardDuty detection is only an after-the-fact alert that cannot prevent the disabling itself.

---
