# Day 2 - IAM Core: Users, Groups, Roles, Policies and the Basic Flow of Policy Evaluation

IAM is the spine of AWS security. Wherever you go among yesterday's 6 domains, it ultimately reduces to the question "can this principal perform this action on this resource?" KMS decryption, S3 GetObject, and cross-account deployment are all decided on the same engine: IAM evaluation logic. So you must approach IAM not as "memorizing policy JSON" but as **understanding the evaluation algorithm** to solve SCS-C03's subtle scenarios.

Today we follow step by step exactly what the four building blocks of IAM (users, groups, roles, policies) are, and the evaluation flow by which AWS decides Allow/Deny when a request comes in. To throw out the key sentence of the evaluation order in advance: **"An explicit Deny beats everything. Then an explicit Allow is required for permission. If neither exists, it is an implicit Deny."**

## IAM Building Blocks: Users, Groups, Roles, Policies

| Element | Definition | Credentials | Core use |
|------|------|----------|----------|
| **User** | A permanent identity, corresponding to one person or app | Long-term access keys, password | Avoid where possible (key exposure risk) |
| **Group** | A collection of users, a container for attaching policies | None (no credentials) | Grant policies to users in bulk |
| **Role** | An identity that anyone can temporarily "assume" | STS temporary credentials (expire) | EC2/Lambda, cross-account, federation |
| **Policy** | A JSON document describing permissions | N/A | Attached to the above elements to define permissions |

There is an insight here that the exam targets repeatedly. **Avoid long-term credentials (IAM User access keys) where possible and use a Role's temporary credentials.** If EC2 needs to access S3, instead of putting a User access key on the instance, you attach an **instance profile (IAM Role)**. If Lambda accesses DynamoDB, it uses an **execution role**. People too should, where possible, sign in through **IAM Identity Center (SSO)** and receive temporary credentials instead of using an IAM User.

### User vs Role — What Actually Differs

If you memorize the difference between the two concepts as "human or machine," you will get it wrong on the exam. People also assume roles, and machines can also become users (and that is exactly the anti-pattern). The real difference is **the lifetime and issuance method of the credentials**.

| Axis | IAM User | IAM Role |
|----|------------------|----------------|
| Credential lifetime | **Permanent** — valid until explicitly deleted | **Expires** — default 1 hour, max 12 hours |
| Issuer | Issued once by IAM, then stored | **STS issues fresh credentials** on each request |
| Credential composition | AccessKeyId + SecretAccessKey (2) | AccessKeyId + SecretAccessKey + **SessionToken** (3) |
| Attached policies | Permission policies only | Permission policies + **trust policy** |
| Control over "who can use it" | Anyone who holds the key | Only the principals the trust policy specifies |
| Damage on leak | Indefinite until revoked | Automatically neutralized after the expiration time |
| Audit trail | A single user name | The caller can be distinguished by session name |
| Rotation | A human must do it periodically | Automatic (every issuance is itself a rotation) |
| Count limit | There is a cap on the number of users per account | Roles also have a cap, but with much more headroom |

The most important row in this table is **"Damage on leak."** The core question of security design is not "do we prevent leaks" but "how long is it valid when it leaks." An access key can remain valid for years after it is pushed to GitHub, but temporary credentials, even in the worst case, have an expiration time.

Looking at the same contrast in the form of the credentials themselves:

| Category | Long-term access key | STS temporary credentials |
|------|----------------|--------------------|
| Prefix | `AKIA...` | `ASIA...` |
| SessionToken | None | **Required** (authentication fails without it) |
| Expiration | None | Yes (`Expiration` field) |
| Storage location (anti-pattern) | Code, `.env`, CI secrets, inside the instance | Not stored — issued when needed |
| Storage location (recommended) | Do not create if possible | Memory, the SDK credential chain |
| How to revoke | Disable/delete the key | Change the role policy or invalidate the session |
| CloudTrail notation | `userIdentity.type = IAMUser` | `userIdentity.type = AssumedRole` |

> ⚠️ **Trap**: The statement "temporary credentials expire, so they are safe even if leaked" is only half right. Until they expire, they are **fully valid.** One hour is enough time for an automated attacker to download an entire bucket. So even when you use temporary credentials, you need three layers together: ① narrow that role's permissions to the minimum, ② block the theft path (for example, metadata service exposure), and ③ detect abnormal use. On the exam, an option saying "since temporary credentials are used, no additional controls are needed" is wrong.

### ARN — The Address System Policies Point To

To read policies, the structure of an ARN (Amazon Resource Name) must become familiar. Most policy errors come from writing the ARN wrong.

```
[ Anatomy of an ARN ]

  arn : aws : s3 : ap-northeast-2 : 111122223333 : my-bucket/logs/app.log
   │     │     │         │                │              │
   │     │     │         │                │              └─ Resource (the format differs by service)
   │     │     │         │                └─ Account ID
   │     │     │         └─ Region  (empty for global resources such as S3 and IAM)
   │     │     └─ Service namespace
   │     └─ Partition (aws / aws-cn / aws-us-gov)
   └─ Fixed prefix

  ── Actual shapes by service ────────────────────────────────────────────
  S3 bucket      arn:aws:s3:::my-bucket              ← the Region and account fields are empty
  S3 object      arn:aws:s3:::my-bucket/*            ← a **different ARN** from the bucket
  IAM user       arn:aws:iam::111122223333:user/alice        ← no Region
  IAM role       arn:aws:iam::111122223333:role/AppRole      ← no Region
  Assumed-role session arn:aws:sts::111122223333:assumed-role/AppRole/session-name
  KMS key        arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-...
  Lambda function arn:aws:lambda:ap-northeast-2:111122223333:function:my-func
```

There are two points here the exam targets. First, **an S3 bucket ARN and an object ARN are different resources.** `s3:ListBucket` applies to the bucket ARN, and `s3:GetObject` applies to the object ARN (`/*`). If you mix them up, you get "I granted the permission but the list does not show" or "the list shows but I cannot download." Second, **the ARN of an IAM role and the ARN of a session that assumed that role are different.** In a policy condition, comparing `aws:PrincipalArn` with `arn:aws:iam::...:role/AppRole` matches, but what is recorded in CloudTrail is `arn:aws:sts::...:assumed-role/AppRole/session`. If you copy the log directly into a policy condition, it will not match.

### The Root User — An Identity You Never Use

The root user created when you create an account is not an IAM user. Its permissions cannot be restricted by IAM policies (only SCPs can constrain a member account's root), and it has complete authority over the account.

| Things only root can do | Notes |
|------------------------|------|
| Change account settings (email, payment method, closure) | Cannot be delegated |
| Change the support plan | Cannot be delegated |
| Recover from the "locked" state of an S3 bucket policy or SQS policy | When reverting a policy that locked yourself out |
| Enable/disable some Regions | Account-level setting |

There are three standard measures for root. **Do not create access keys (delete immediately if any exist), turn on MFA, and seal the credentials.** Never do day-to-day work as root under any circumstances.

> 🎯 **Scenario**: "An audit demands continuous proof that 'the root user of every account has MFA and no access keys.' There are 40 accounts." → An option where a person logs in 40 times to check is eliminated. The direction is **automating detection**. Pull the IAM credential report in each account, or continuously evaluate the presence of root MFA and root access keys with a Config rule, and aggregate the results in Security Hub to view them on one screen. If you add prevention, a guardrail that blocks the root user's actions themselves with an SCP is attached. The "prevention + detection" combination we saw on Day 1 repeats as-is in the IAM area.

A Group is merely a "container" and has no credentials by itself, so **a Group cannot be specified as a Principal.** This is a part newcomers easily get wrong — writing `"Principal": {"AWS": "arn:...:group/Devs"}` in a Role's trust policy does not work. A group is only a conduit for passing policies to users and cannot be the target of AssumeRole.

The substance of "assuming" a Role is that STS (Security Token Service) issues 3 kinds of temporary credentials (AccessKeyId, SecretAccessKey, **SessionToken**). These credentials have an expiration time (default 1 hour, max 12 hours), so even if exposed, the impact is limited in time. This is the fundamental reason they are safer than long-term keys, and we cover STS in depth on Day 4.

## The Two Kinds of Policies: Identity-based vs Resource-based

Policies are divided into two kinds by "where they are attached." Today we only grasp the concept, and go deep on Day 3.

- **Identity-based policy**: Attached to a User, Group, or Role. Describes "what this principal can do." There is no Principal element (what it is attached to is itself the principal).
- **Resource-based policy**: Attached directly to a resource (an S3 bucket, a KMS key, an SQS queue, etc.). **The Principal element is required** — it describes "who can access this resource."

The decisive utility of resource-based policies is that they make **cross-account access** possible. To open my S3 bucket to a principal in another account, you specify the other account in that bucket's resource-based policy.

Placing the two policies side by side makes the difference clear at a glance. The two documents below are **exactly the same access expressed from different sides**.

```json
// ── Identity policy ── attached to the IAM role "ReportReader"
// How to read it: "This role can read that bucket"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "ReadReportBucket",
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::monthly-reports",
      "arn:aws:s3:::monthly-reports/*"
    ]
  }]
}
// ▲ There is no Principal element — the target the policy is attached to is itself the principal, so there is no need to write it
```

```json
// ── Resource policy ── attached to the S3 bucket "monthly-reports"
// How to read it: "This bucket allows that role to read"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowReportReader",
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::111122223333:role/ReportReader"
    },
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::monthly-reports",
      "arn:aws:s3:::monthly-reports/*"
    ]
  }]
}
// ▲ The Principal element is required — the resource side has no way of knowing who is coming
```

| Item | Identity policy | Resource policy |
|------|---------------|---------------|
| Where attached | User / Group / Role | S3 bucket, KMS key, SQS queue, SNS topic, Lambda function, Secrets Manager secret, etc. |
| `Principal` element | **Absent** (a syntax error if present) | **Required** |
| `Resource` element | Required | Usually specified, pointing to itself |
| Managed by | The IAM administrator of the account the principal belongs to | **The account that owns the resource** |
| Sufficient on its own for cross-account | No — the other side's resource policy is needed | Possible, but the caller's Identity policy is also needed |
| Typical use | "This team uses these resources" | "This bucket is opened only to this account" |
| Supported services | All services | **Only some services** |

The last row is often hit on the exam. **Not every AWS service supports resource-based policies.** S3, KMS, SQS, SNS, Lambda, Secrets Manager, EFS, API Gateway, and others support them, but you cannot attach a resource-based policy to an EC2 instance or a DynamoDB table. So when an option appears like "attach a resource policy to a DynamoDB table to open cross-account access," you should doubt the approach itself, and cross-account access for such services is solved with **the role-assumption method (AssumeRole)**.

Why are policies in both directions needed? Because the managing parties differ. An Identity policy is written by **the administrator of the caller's account**, and a Resource policy is written by **the account that owns the resource**. If Identity policies alone could access resources in someone else's account, then my own account's administrator privileges alone would let me read someone else's data — the account as a unit of isolation would become meaningless. So in cross-account, both sides must consent (we cover this rule precisely again on Day 3 and in Week 2). A resource policy is not an inconvenient extra step but **a mechanism that makes the account boundary meaningful**.

An IAM role's **trust policy is also a resource-based policy.** Because it is attached to the resource called "role" and describes "who can assume this role" with a `Principal`. So a role has two policies — the trust policy (who assumes it) and the permission policy (what it does once assumed). If you confuse the two, you get symptoms like "I gave the role S3 permissions but cannot assume the role," or conversely "the role is assumed but can do nothing." We dig into trust policies properly on Day 4.

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
- **Action**: The API action to allow/deny (`s3:GetObject`). Wildcards (`s3:*`) are possible
- **Resource**: The target ARN. Required in identity-based policies; in resource-based policies usually `*` (the policy is already attached to that resource)
- **Principal**: Who (used only in resource-based policies and trust policies)
- **Condition**: Additional constraints (IP, MFA, time, whether encrypted, etc.)

> ⚠️ **Trap**: Using `"Resource": "*"` and `"Action": "*"` together is effectively admin. When the exam asks about "least privilege," the option with narrowed wildcards is the answer. In particular, `s3:ListBucket` applies to the bucket ARN (`arn:aws:s3:::bucket`), and `s3:GetObject` applies to the object ARN (`.../*`) — mixing the two ARN levels so that it does not work is a common mistake.

### NotAction and NotResource — Convenient-Looking but Dangerous Elements

If you use `NotAction` instead of `Action`, it means "**everything except** what is listed here." It is tempting because it is short to write, but every time a new service launches, its scope **automatically widens.**

```json
// ⚠️ Dangerous form — "allow everything except IAM"
{
  "Effect": "Allow",
  "NotAction": "iam:*",
  "Resource": "*"
}
// Every time AWS releases a new service, this policy automatically allows that service too
```

```json
// ✅ Safe form — combined with Deny, it means "everything not listed here is prohibited"
{
  "Effect": "Deny",
  "NotAction": ["s3:*", "cloudwatch:*", "logs:*"],
  "Resource": "*"
}
// Even when a new service appears it automatically falls on the prohibited side — it fails in the safe direction
```

There is one principle. **`NotAction` and `NotResource` automatically widen the scope when used with Allow, and automatically narrow it when used with Deny.** Use only the side that fails in the safe direction (combined with Deny). This property reappears in Day 3's Region-restriction SCP.

### Managed Policies vs Inline Policies

"How a policy is stored" is also an exam target.

| Category | AWS managed | Customer managed | Inline |
|------|------------|-------------|--------|
| Ownership and modification | Managed by AWS, cannot be modified | Created and versioned by the customer | Embedded in a specific principal |
| Reuse | Attached to multiple principals | Attached to multiple principals | **Dedicated to a single principal** |
| Versioning | Updated by AWS | Up to 5 versions retained, rollback possible | None |
| When the principal is deleted | The policy remains | The policy remains | **Deleted along with it** |
| Ease of auditing | High | High | Low (easy to hide) |
| Recommended situation | Quick start, standard roles | Most real-world work | Exception rules that "must be attached only to this principal" |

A common mistake when investigating is missing inline policies. `aws iam list-attached-user-policies` shows **only managed policies**, and inline policies must be queried separately with `aws iam list-user-policies`. The answer to "I checked all the managed policies, so why does this permission exist?" is often an inline policy. Roles and groups likewise have two separate commands. To sweep everything at once, use `aws iam get-account-authorization-details`.

AWS managed policies are convenient but almost always **broader than needed.** `AmazonS3FullAccess` allows all actions on all buckets in the account, and `PowerUserAccess` allows virtually everything except IAM. When AWS adds a new API, managed policies quietly widen too. So the practical standard is "start with AWS managed and narrow down to customer managed," and on the exam it is rare for the answer to a least-privilege question to be attaching an AWS managed policy.

## Basic Policy Evaluation Flow: The Algorithm That Decides Allow/Deny

This is today's core. The order in which AWS decides when a request comes in within a single account is as follows.

```
[ IAM policy evaluation flow (single account) ]

  Request (Principal + Action + Resource + Context)
        |
   1. Collect all applicable policies
      (Identity-based, Resource-based, SCP, Permissions Boundary, Session policy)
        |
   2. Is there even one explicit Deny?  ── Yes ──▶  DENY (top priority, unconditional)
        | No
   3. Does the SCP allow the Action? ── No ──▶ DENY
        | Yes
   4. Does the Permissions Boundary allow it? ── No ──▶ DENY
        | Yes
   5. Is there even one explicit Allow? ── No ──▶ DENY (implicit deny)
        | Yes
        ▼
      ALLOW
```

It compresses into three principles.

1. **The default is implicit Deny**: If no policy allows it, it is denied. Permissions must be given explicitly.
2. **An explicit Allow overturns the implicit Deny**: If it is explicitly allowed somewhere, the default denial is lifted.
3. **An explicit Deny beats everything (explicit deny overrides)**: Even if some policy allows it, if another policy has an explicit Deny, it is denied unconditionally.

The key when memorizing this evaluation order is that **"guardrails (SCP, Permissions Boundary) do not grant permissions; they only draw a ceiling."** Even if an SCP allows `s3:*`, that alone creates no permissions at all — an explicit Allow in an identity-based policy is needed. An SCP only defines the "maximum allowed range." That is why the common pattern in SCPs is a Deny guardrail rather than Allow.

In the cross-account case, evaluation happens **separately in both accounts**. For a principal in account A to access a bucket in account B, ① account A's identity-based policy must Allow **and** ② account B's resource-based policy must Allow A — **both** are needed (within the same account, either one alone is enough). This "both sides" rule is a trap that is easy to get confused about in cross-account scenarios.

## Reading the Evaluation Flow Through Scenarios

We apply the abstract algorithm to concrete situations.

**Situation 1: A developer has admin permissions but you want to block only a particular S3 bucket.**
The identity-based policy is `AdministratorAccess`, so it Allows everything. If you add an explicit Deny statement to it (for example, `"Effect": "Deny"` on the specific bucket ARN), the explicit Deny beats the Allow and only that bucket is blocked. If you put the same Deny in an SCP, it is enforced on the entire account.

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

**Situation 2: An SCP explicitly Denies `ec2:*`, but the user has `AmazonEC2FullAccess`.**
The result is Deny. The SCP's explicit Deny beats everything. The Allow in the user policy is neutralized. This is why SCPs are used as governance guardrails.

**Situation 3: No policy mentions that action.**
The result is Deny. But it is **different in nature** from the Deny in Situation 2. Situation 2 is where someone explicitly blocked it, and Situation 3 is where no one allowed it. This distinction is decisive when diagnosing — the former is a problem of finding "which Deny statement to fix," and the latter is a problem of finding "which Allow to add." Whether the word `explicit deny` appears in the error message separates the two.

| Result | Cause | Error message clue | Direction of resolution |
|------|------|------------------|-----------|
| Explicit Deny | Some policy has `"Effect": "Deny"` | "with an explicit deny in a ..." | Find that Deny statement and fix it or create an exception |
| Implicit Deny | No one Allows | The word explicit is absent | Add an Allow |
| Exceeds guardrail | There is an Allow but it is outside the ceiling | Points to the boundary or SCP | Adjust the ceiling or reduce the requirement |

Compressing the three into a single decision procedure gives the following. For now it is enough to firmly hold this skeleton, and the precise calculation where six kinds of policies are entangled at once is **covered properly in Week 2.**

```
[ Day 2-level decision skeleton — remember only three boxes ]

   Request (principal · action · resource · context)
        │
        ▼
   ┌─────────────────────────────────────────┐
   │ ① Is there an explicit Deny anywhere?    │
   │    SCP · boundary · Identity · Resource  │
   └─────────────────────────────────────────┘
        │ Yes ──▶ ❌ DENY (ends here, the rest is not examined)
        │ No
        ▼
   ┌─────────────────────────────────────────┐
   │ ② Do the guardrails (SCP · permissions boundary) allow it? │
   │    This layer only trims, it does not "grant" permissions │
   └─────────────────────────────────────────┘
        │ No ──▶ ❌ DENY
        │ Yes
        ▼
   ┌─────────────────────────────────────────┐
   │ ③ Is there an explicit Allow?            │
   │    Same account: Identity **or** Resource │
   │    Cross-account: Identity **and** Resource│
   └─────────────────────────────────────────┘
        │ No ──▶ ❌ DENY (implicit denial)
        │ Yes
        ▼
        ✅ ALLOW
```

These three boxes are the skeleton of IAM decisions. In Week 2, session policies, RCPs, and VPC endpoint policies are added here, and you learn to calculate precisely down to how condition keys are evaluated at each layer. What you must make certain of at this stage are two things: **the order "Deny first → pass the guardrails → an Allow exists," and the property that guardrails cannot create permissions.**

> 🎯 **Scenario**: The requirement "a security team wants to prevent disabling CloudTrail in all accounts." The answer is not editing per-user policies but applying **an SCP with a Deny on `cloudtrail:StopLogging` and `cloudtrail:DeleteTrail`** to the OU. Then even that account's admin or even root cannot turn off CloudTrail (the management account's root is exempt from SCPs). This is the governance application of the principle that an explicit Deny beats every Allow.

## Policy Debugging Tools: Verifying Who Can Do What

If you follow the evaluation logic only in your head, you will make mistakes. AWS provides verification tools.

```bash
# ① Who the current caller is — the starting point of all debugging
aws sts get-caller-identity

# ② Simulate whether a particular principal can perform a particular action (does not actually call)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:user/alice \
  --action-names s3:GetObject s3:DeleteObject \
  --resource-arns arn:aws:s3:::my-bucket/secret.txt

# ③ Policies attached to a user — managed and inline use different commands
aws iam list-attached-user-policies --user-name alice   # managed
aws iam list-user-policies          --user-name alice   # inline
aws iam list-groups-for-user        --user-name alice   # permissions via groups

# ④ The role side likewise has two branches
aws iam list-attached-role-policies --role-name AppRole
aws iam list-role-policies          --role-name AppRole

# ⑤ Pull out and read the actual policy document (you must specify the default version)
aws iam get-policy --policy-arn arn:aws:iam::111122223333:policy/DataReader
aws iam get-policy-version \
  --policy-arn arn:aws:iam::111122223333:policy/DataReader \
  --version-id v3

# ⑥ Check the role's trust policy — "who can assume this role"
aws iam get-role --role-name AppRole \
  --query 'Role.AssumeRolePolicyDocument'

# ⑦ Dump the entire account's IAM configuration at once (for auditing/investigation)
aws iam get-account-authorization-details --output json > iam-dump.json
```

It is also good to get the flow of creating a new policy and attaching it to a role into your hands. Below is the entire process of a least-privilege configuration that lets EC2 read only a specific bucket.

```bash
# ① Trust policy — "the EC2 service can assume this role"
cat > trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role --role-name AppInstanceRole \
  --assume-role-policy-document file://trust.json

# ② Permission policy — "once assumed, it can read only this bucket"
cat > permission.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::app-config"
    },
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::app-config/*"
    }
  ]
}
EOF

aws iam put-role-policy --role-name AppInstanceRole \
  --policy-name ReadAppConfig \
  --policy-document file://permission.json

# ③ Wrap it in an instance profile and attach it to EC2
aws iam create-instance-profile --instance-profile-name AppInstanceProfile
aws iam add-role-to-instance-profile \
  --instance-profile-name AppInstanceProfile \
  --role-name AppInstanceRole

# ④ Verify — inside the instance, this command should return an assumed-role ARN to be normal
#    aws sts get-caller-identity
```

Everything we learned today is contained in this short permission policy. `ListBucket` is applied to the **bucket ARN**, `GetObject` to the **object ARN**, the wildcard is used only on the object path, and there is no access key anywhere.

What you attach when giving a role to EC2 is not the role itself but an **instance profile**. In the console it is auto-created with the same name so the distinction is invisible, but when creating with the CLI or IaC you must create the profile separately and put the role inside it. Most cases of the symptom "I created the role but cannot attach it to EC2" are from missing this step. Also remember that Lambda and ECS tasks specify the role directly without a profile.

In production, "why is access denied" is usually one of four: ① implicit Deny (no one Allows), ② a hidden Deny in an SCP, ③ exceeding the Permissions Boundary, ④ only one side allowing in cross-account. The habit of first checking "which role am I right now" with `aws sts get-caller-identity` cuts debugging time in half. CloudTrail's `AccessDenied` events leave clues about which policy caused it.

## IAM Access Analyzer: Detecting Unintended External Exposure

IAM Access Analyzer analyzes resource policies and automatically finds **resources that allow access beyond the account or organization boundary**. It generates a finding if S3 buckets, IAM roles, KMS keys, Lambda functions, and so on are open to external principals.

This is the intersection of Domain 1 (Detection) and Domain 4 (IAM). Since a human cannot review hundreds of buckets and roles one by one, it automatically detects "access that crosses the trust boundary." The policy generation feature also analyzes CloudTrail logs and creates a least-privilege policy from only the permissions actually used.

Access Analyzer distinguishes **external and trusted**. It treats access within the same account or organization as normal and raises only what crosses that boundary as a finding. If you "set the zone of trust to the organization," cross-account access within the organization is handled as normal and only truly external exposure is caught.

## Wrap-Up

Today's three core points. First, among IAM's building blocks, **use Roles (temporary credentials) by default and avoid Users (long-term keys)** — this is the starting point of all best practices. Second, policy evaluation is an algorithm of three principles — **implicit Deny → an explicit Allow overturns it → an explicit Deny beats everything** — and SCPs and Permissions Boundaries do not grant permissions but only draw a ceiling. Third, cross-account needs the allowance of **both accounts**.

The most common IAM incident in the field is not a sophisticated breach but **an old access key**. Keys that developers created for convenience remain scattered across scripts, CI settings, and personal laptops, and remain valid even after that developer leaves the company. Such keys have no owner so they are not rotated, and no one knows what they do so no one can delete them. The order of response is fixed — ① pull every key in the account and its last-used time with the credential report, ② **disable rather than delete**, starting with the keys unused for the longest time, and ③ delete after confirming there is no impact. If you skip the disable step, you cannot undo what broke. The fundamental solution is not to create keys in the first place — if people access through Identity Center and workloads through roles, the reason to create keys disappears.

> 🎯 **Scenario**: "A CI pipeline stores an access key in a secret to deploy to AWS. The security team demands that long-term keys be eliminated." → An option that rotates the key more often only postpones the problem. The direction is **eliminating the key itself**. If the CI platform supports OIDC, have it assume a role with that token; if not, set up a deployment-only role narrowed to least privilege. If "reduce the rotation period to 90 days" and "remove the long-term key" are both among the options, the latter is the answer — the former only shrinks the exposure window and does not eliminate it. The specific OIDC trust policy configuration is covered on Day 4.

Tomorrow we dig deeper into policies. We cover the subtle interaction between Identity and Resource policies, precise control using Condition keys, and the practical pattern of designing least privilege with Permissions Boundaries. The evaluation algorithm we learned today is the foundation of all of it.

### One-Line Summary

Among IAM's four building blocks, **a Group has no credentials and so cannot be a Principal**, a User uses permanent credentials (`AKIA...`, 2 keys), and a Role uses expiring credentials issued by STS (`ASIA...`, 3 including the SessionToken) — the damage on leak being limited in time is why roles are the default. Policies are divided by where they are attached: **an Identity policy has no `Principal` and a Resource policy requires one**, and resource policies are supported by only some services. `NotAction` automatically widens in scope every time a new service appears when combined with Allow, so use it **only with Deny**. Managed and inline policies are queried with different commands, so investigations that miss inline policies are common. Evaluation is three boxes: **① explicit Deny first → ② pass the guardrails (SCP, boundary) → ③ an explicit Allow exists**, and within the same account either an Identity or a Resource policy is enough, but **cross-account needs both sides**. Guardrails cannot create permissions and only trim them, so even `AdministratorAccess` cannot exceed the ceiling. When blocked, first check "who am I right now" with `aws sts get-caller-identity`, and tell explicit denial from implicit denial by whether `explicit deny` appears in the error message.

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
