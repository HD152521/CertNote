# Day 2 - IAM Core: Users, Groups, Roles, Policies, and Policy Evaluation Flow

IAM is the spine of AWS security. Wherever you go in the 6 domains we saw yesterday, you eventually reduce to one question: "Can this principal do this action on this resource?" KMS decryption, S3 GetObject, cross-account deployment — all use the same IAM evaluation engine to decide. That's why IAM must be approached not as "memorizing policy JSON" but as **understanding the evaluation algorithm** to solve SCS-C03's subtle scenarios.

Today we go through the four building blocks of IAM (users, groups, roles, policies) and step-by-step how AWS decides Allow/Deny when a request arrives. Let me throw ahead the key one-liner: **"Explicit Deny defeats everything else. After that, explicit Allow beats the default. With neither, implicit Deny applies."**

## IAM Building Blocks: Users, Groups, Roles, Policies

| Element | Definition | Credentials | Core Use |
|------|------|----------|----------|
| **User** | Permanent identity, corresponds to one person or app | Long-term access key, password | Avoid when possible (key exposure risk) |
| **Group** | Collection of users, container for attaching policies | None (no credentials) | Grant policies to users in bulk |
| **Role** | Identity anyone can temporarily "assume" | STS temporary credentials (expiring) | EC2/Lambda, cross-account, federation |
| **Policy** | JSON document describing permissions | N/A | Attached to above elements to define permissions |

Here's the insight the exam repeatedly targets: **Long-term credentials (IAM User access key) should be avoided; use Role's temporary credentials instead.** When an EC2 needs S3 access, don't put User access keys in the instance — use an **instance profile (IAM Role)**. When Lambda accesses DynamoDB, use its **execution role**. Even people should prefer **IAM Identity Center (SSO)** over IAM User, receiving temporary credentials after login.

> 💡 **Related Theory**: A Group is just a "container" and has no credentials itself, so **you can't designate a Group as a Principal.** Common mistake for newcomers — writing `"Principal": {"AWS": "arn:...:group/Devs"}` in a Role's trust policy won't work. Groups are just channels to deliver policies to users; they can't be AssumeRole targets.

> 🔍 **Deep Dive**: What "assuming" a Role means is that STS (Security Token Service) issues temporary credentials of 3 types: AccessKeyId, SecretAccessKey, **SessionToken**. These credentials have an expiration time (1 hour default, 12 hours max), so even if exposed, the damage is time-limited. This fundamental time-limit is why temporary creds are safer than long-term keys, covered deeply on Day 4.

## Two Types of Policies: Identity-based vs Resource-based

Policies split into two types by "where they're attached." Today we just grasp the concept; Day 3 digs deeper.

- **Identity-based policy**: Attached to User, Group, Role. Describes "what this principal can do." No Principal element (who it attaches to is the principal itself).
- **Resource-based policy**: Attached directly to resources (S3 buckets, KMS keys, SQS queues, etc.). **Principal element is required** — describes "who can access this resource."

The decisive utility of resource-based policies is **enabling cross-account access**. To let another account's principal access my S3 bucket, I specify that account in the bucket's resource-based policy.

## IAM Policy JSON Structure

Every policy is an array of Statements; each Statement has these elements:

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
- **Action**: API action to allow/deny (`s3:GetObject`). Wildcards (`s3:*`) allowed
- **Resource**: Target ARN. Required in identity-based, usually `*` in resource-based (policy already on that resource)
- **Principal**: Who (resource-based and trust policy only)
- **Condition**: Additional constraints (IP, MFA, time, encryption, etc.)

> ⚠️ **Trap**: Using `"Resource": "*"` and `"Action": "*"` together is basically admin. When the exam asks "least privilege," the answer is the option with narrowed wildcards. Specifically, `s3:ListBucket` applies to bucket ARN (`arn:aws:s3:::bucket`), while `s3:GetObject` applies to object ARN (`.../*`) — mixing these ARN levels is a common mistake.

## Policy Evaluation Flow: The Algorithm That Decides Allow/Deny

This is today's core. When a request arrives in a single account, AWS's decision sequence is:

```
[ IAM Policy Evaluation Flow (Single Account) ]

  Request(Principal + Action + Resource + Context)
        |
   1. Collect all applicable policies
      (Identity-based, Resource-based, SCP, Permissions Boundary, Session policy)
        |
   2. Any explicit Deny?                   ── Yes ──▶  DENY (absolute priority)
        | No
   3. Does SCP allow the Action?           ── No ──▶ DENY
        | Yes
   4. Does Permissions Boundary allow?     ── No ──▶ DENY
        | Yes
   5. Any explicit Allow?                  ── No ──▶ DENY (implicit)
        | Yes
        ▼
      ALLOW
```

Compressed to three principles:

1. **Default is implicit Deny**: With no policies allowing, access is denied. Permissions must be granted explicitly.
2. **Explicit Allow overrides implicit Deny**: Somewhere explicitly allowing reverses the default denial.
3. **Explicit Deny overrides everything (explicit deny overrides)**: No matter what allows it, if any policy explicitly Denies, it's denied.

> 💡 **Related Theory**: When memorizing this order, the key is **"Guardrails (SCP, Permissions Boundary) don't grant permissions; they only draw upper limits."** Even if SCP allows `s3:*`, that alone doesn't create any actual permissions — there must be explicit Allow in an identity-based policy. SCP defines "maximum allowed range." That's why SCP patterns commonly use Deny guardrails rather than Allow.

> 🔍 **Deep Dive**: For cross-account, evaluation happens **separately in each account**. For a principal in account A to access a resource in account B, ① A's identity-based policy must Allow AND ② B's resource-based policy must Allow A — **both required**. Within the same account, either one is enough. This "both needed" rule is a common trap in cross-account scenarios.

## Evaluation Flow Read as Scenarios

Let's apply the abstract algorithm to concrete situations.

**Situation 1: Developer has admin permissions but we want to block only one specific S3 bucket.**
Identity-based policy is `AdministratorAccess` allowing everything. Add an explicit Deny statement (e.g., specific bucket ARN with `"Effect": "Deny"`) and the Deny beats the Allow for just that bucket. Adding the same Deny to SCP enforces it account-wide.

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

**Situation 2: SCP explicitly Denies `ec2:*`, but a user has `AmazonEC2FullAccess`.**
Result is Deny. SCP's explicit Deny overrides everything. The user's Allow becomes powerless. This is why SCP is used as a governance guardrail.

> 🎯 **Scenario**: "Security team wants to prevent anyone (including admin, root) from disabling CloudTrail across all member accounts." Answer isn't editing user policies individually — it's **SCP with Deny on `cloudtrail:StopLogging` and `cloudtrail:DeleteTrail` applied to the OU**. Then even that account's admin or root can't disable CloudTrail (management account root is SCP-exempt). This applies the principle that explicit Deny beats all Allow.

## Policy Debugging Tools: Verifying Who Can Do What

Tracing evaluation logic mentally causes mistakes. AWS provides validation tools.

```bash
# IAM Policy Simulator: Check if a principal can do an action
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:user/alice \
  --action-names s3:GetObject s3:DeleteObject \
  --resource-arns arn:aws:s3:::my-bucket/secret.txt

# Find out who the current caller is (start of role debugging)
aws sts get-caller-identity

# List policies attached to a user
aws iam list-attached-user-policies --user-name alice
aws iam list-user-policies --user-name alice  # inline policies
```

> 📚 **Case Study**: 80% of "why is access denied" in production comes down to ① implicit Deny (no one Allow'd) ② hidden Deny in SCP ③ exceeding Permissions Boundary ④ cross-account with only one side allowing. Developing the habit of first running `aws sts get-caller-identity` to confirm "what role am I under right now" cuts debugging time in half. CloudTrail's `AccessDenied` events leave clues about which policy denied it.

## IAM Access Analyzer: Detecting Unintended External Exposure

IAM Access Analyzer analyzes resource policies to automatically find **resources allowing access beyond account or organization boundaries**. S3 buckets, IAM roles, KMS keys, Lambda functions — if opened to external principals, it creates findings.

This is the intersection of Domain 2 (detective) and Domain 4 (IAM). You can't manually review hundreds of buckets and roles, so it automatically detects "access crossing trust boundaries." Its policy generation feature even creates least-privilege policies from CloudTrail logs of actual use.

> 💡 **Related Theory**: Access Analyzer's core is **external vs trusted** distinction. Access within the same account or organization is treated as normal; only crossing that boundary creates findings. "Set organization boundary as zone of trust" treats cross-account within organization as normal and catches only real external exposure.

## Summary — IAM is an Algorithm

Three essentials from today. First, among IAM building blocks, **use Role (temporary credentials) by default; avoid User (long-term keys)** — this is the starting point of all best practices. Second, policy evaluation is **implicit Deny → explicit Allow overrides it → explicit Deny beats everything** — the algorithm of 3 principles — and SCP·Permissions Boundary don't grant permissions, only draw upper limits. Third, cross-account requires **both accounts to allow**.

Tomorrow we dig deeper into policies. The subtle interplay between Identity vs Resource policies, precision controls using Condition keys, and practical patterns for designing least privilege with Permissions Boundary. The evaluation algorithm you learned today is the foundation for all of it.

---

## 📝 Practice Questions

**Question 1.** An IAM user has the `AdministratorAccess` managed policy. At the same time, the SCP applied to that user's account contains an explicit `Deny` on `s3:*`. What happens when the user tries to read an S3 object?

A) It is allowed, because AdministratorAccess takes precedence  
B) It is denied, because an explicit Deny in the SCP beats every Allow  
C) An evaluation error occurs, because the two policies conflict  
D) Only the root user can access S3  

**Answer: B**  
Explanation: The absolute rule of policy evaluation is that an explicit Deny wins over any Allow. An SCP acts as a guardrail that caps the permitted actions, so even with admin rights in the user policy the request is blocked by the SCP's Deny. This is not an error caused by conflicting policies — Deny wins deterministically — and whether root can access S3 is irrelevant to this decision.

---

**Question 2.** An IAM role in Account A wants to write an object to an S3 bucket in Account B. Which condition must be met for the access to succeed?

A) An Allow in Account A's identity-based policy alone is sufficient  
B) An Allow in Account B's bucket policy alone is sufficient  
C) Both Account A's identity-based policy and Account B's bucket policy must Allow it  
D) If both accounts belong to the same Organization, it is allowed automatically without policies  

**Answer: C**  
Explanation: Cross-account access is evaluated separately in each account, so you need an Allow in the calling side's identity-based policy (A) and an Allow in the resource side's resource-based policy (B). Within a single account either one is enough, but once you cross an account boundary both are mandatory. Belonging to the same Organization does not grant access by itself.

---

**Question 3.** Which statement about IAM Groups is correct?

A) A Group has its own credentials and can sign in directly  
B) A Group can be specified as a Principal in a role's trust policy  
C) A Group is a container for attaching policies, has no credentials, and cannot be a Principal  
D) Temporary credentials are issued to a Group and used for cross-account access  

**Answer: C**  
Explanation: A Group is only a container for granting policies to users in bulk. It has no credentials, so it cannot sign in and cannot be named as a Principal. Using a Group as the target of AssumeRole or as a Principal in a trust policy simply does not work. Temporary credentials are issued by STS through a Role and have nothing to do with Groups.

---

**Question 4.** A developer has been granted `AmazonS3FullAccess` but tries to call `dynamodb:GetItem`, which no policy explicitly allows. Which outcome and reason are correct?

A) Allowed — there is no explicit Deny, so it is permitted by default  
B) Denied — no policy Allows the action, so the implicit Deny applies  
C) Allowed — having S3 permissions automatically grants DynamoDB as well  
D) Denied — because DynamoDB is not controlled by IAM  

**Answer: B**  
Explanation: IAM's default state is an implicit Deny, and permissions must be granted explicitly. S3 permissions have nothing to do with DynamoDB actions, so without an explicit Allow for `dynamodb:GetItem` the request is denied by the implicit Deny. The absence of an explicit Deny does not mean automatic permission, and DynamoDB is of course governed by IAM.

---

**Question 5.** A security team wants to enforce that nobody — including admins and root — can disable CloudTrail in any member account. Which approach is most appropriate?

A) Add a CloudTrail Deny to every IAM user policy in each account, one by one  
B) Write a Deny on `cloudtrail:StopLogging` and `cloudtrail:DeleteTrail` in an SCP and apply it to the OU  
C) Set a Deny on CloudTrail through a resource-based policy  
D) Use GuardDuty to detect CloudTrail being disabled and just send an alert  

**Answer: B**  
Explanation: An explicit Deny in an SCP is an organizational guardrail that applies even to the admins and the root user of member accounts, so denying the CloudTrail stop and delete actions means nobody can turn it off. Adding per-user policies risks omissions, CloudTrail does not implement this kind of control through a resource-based policy, and GuardDuty detection is an after-the-fact alert that does not prevent the deactivation itself.

---
