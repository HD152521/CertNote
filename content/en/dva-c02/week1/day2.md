# Day 2 - The 4 Core Entities of IAM: User, Group, Role, Policy

When you first open the IAM menu in the console, you see four items side by side: users, groups, roles, and policies. The most common mistake when explaining these to a new developer is oversimplifying with "a User is a person, a Role is a server". It's not wrong, but with this model you cannot explain "why you must not embed a user's access key in Lambda" or "why a Role attached to an EC2 instance is safer than an SSO user".

IAM is the authorization engine that determines **who (Principal) can perform what (Action) on which resource (Resource) under what conditions (Condition)** in the cloud. This one line condenses IAM's entire design philosophy. What we look at today is how the engine's four parts — User, Group, Role, Policy — interlock and operate.

## Why Did the Cloud Need a New Permission Model?

Traditional authentication and authorization models were dominated by two patterns. **DAC** (Discretionary Access Control, 1970s Unix file permissions) lets the owner grant and revoke permissions. **MAC** (Mandatory Access Control, the 1973 Bell-LaPadula model) has the system enforce control according to classification labels. On top of these, **RBAC** (Role-Based Access Control, Ferraiolo & Kuhn 1992) became the industry standard and formed the foundation of LDAP and Active Directory.

With the arrival of the cloud, these models broke down. First, resources are **created and destroyed dynamically via API**. RBAC's static role assignments struggle to express "permission to access the S3 bucket I just created". Second, resources **cross account and service boundaries**. You cannot contain them within AD's domain boundaries. Third, **machine-to-machine calls** became overwhelmingly more frequent than human logins (Lambda → DynamoDB, EC2 → S3, ECS → Secrets Manager, etc.). Reusing human credentials for machines explodes the risk of key leakage.

AWS responded to these three pressures by evolving IAM toward **ABAC** (Attribute-Based Access Control, standardized in 2014 as NIST SP 800-162). By inspecting attributes like `aws:RequestTag` and `aws:PrincipalTag` with condition keys, dynamic rules become possible, such as "users tagged with the Engineering department can only access resources tagged Engineering".

> 💡 **Related theory**: The RBAC vs ABAC trade-off is clear. **RBAC** is simple and easy to audit, but as the number of resources grows you get role explosion (e.g., 100 projects × 5 roles = 500 roles). **ABAC** keeps the policy count small but makes debugging harder ("why was this user denied" depends on a combination of multiple attributes). In practice, the common approach is a hybrid: **RBAC (Groups) for the top-level permission structure, ABAC (Tags) for fine-grained resource control**.

## User: A Person, or a System That Acts Like One

An IAM User is an entity with **long-term credentials**. It signs in to the console with a login password, or authenticates to the CLI/SDK with an Access Key ID + Secret Access Key. The fact that these credentials never expire is both the biggest risk and the decisive point of divergence from IAM Roles.

| Credential type | Expiration | Rotation responsibility | Suitable use |
|------|------|------|------|
| Console password | Enforced by policy | User | Human console login |
| Access Key (AK/SK) | None (manual rotation) | User/Admin | CLI, SDK, external systems |
| MFA token | 30 seconds (TOTP) | Automatic | Additional authentication |
| STS temporary credentials | 15 minutes ~ 12 hours | Automatic | Role assumption, Federation |

> 🔍 **Going deeper**: For IAM User access keys, IAM Access Analyzer tracks "last used" information. Check the last-used time with `aws iam get-access-key-last-used --access-key-id AKIA...`, and deactivating keys unused for 90+ days is a security best practice. AWS's own security guide (`IAM Best Practices`) strongly recommends moving **human credentials off IAM Users and onto AWS IAM Identity Center (formerly SSO)**. SSO integrates with ID providers (Okta, Azure AD, etc.) via SAML 2.0 or OIDC, and ultimately issues temporary credentials through STS, so long-term keys never exist at all.

> 📚 **Case study**: The Code Spaces incident of June 2014. Code Spaces, a GitHub code hosting company, had its AWS root account credentials stolen; its EC2, S3, EBS, AMIs, and snapshots were all deleted, and the company went out of business within 18 hours. The direct cause was **no MFA + reliance on a single credential**. Immediately after this incident, AWS began recommending safeguards far more aggressively, such as enforcing MFA on root accounts and the policy variable to require MFA for IAM Users (`aws:MultiFactorAuthPresent`).

## Group: The Unit of Permission Bundling

An IAM Group is a container for grouping people, not a subject of permissions. Attach a policy to a Group and the permissions propagate to all Users in that group. A Group itself cannot call resources (a Group cannot be a Principal).

```
[ Engineering Group ]
    ├── Alice (User)
    ├── Bob (User)
    └── Policy: AmazonS3ReadOnlyAccess
                 ↓
        Both Alice and Bob can read S3
```

The core value of Groups is **permission reuse** and **auditability**. If you attach policies individually to 50 engineers, tracking who has what permission becomes impossible. With Groups, "the permissions of the Engineering Group = Alice's permissions", making change tracking easy. Note that Groups cannot be nested, and a User can belong to at most 10 Groups. The simple structure is intentional.

## Role: The Producer of Temporary Credentials

The IAM Role is IAM's most powerful weapon and the concept most frequently tested. **A Role is a bundle of permissions owned by no one, and when someone "assumes" the Role, STS issues temporary credentials.** Temporary credentials consist of a 3-piece set — (1) Access Key ID, (2) Secret Access Key, (3) **Session Token** (this is the key part) — and expire automatically after 1 hour by default.

```
1. Lambda function starts
2. Lambda runtime calls STS AssumeRole
3. STS issues temporary credentials (valid for 1 hour)
4. Lambda code calls DynamoDB with those credentials
5. When they expire after 1 hour, the SDK automatically re-issues them
```

A Role attached to an EC2 instance behaves more subtly. EC2 exposes credentials through the IMDS (Instance Metadata Service). When the SDK GETs `169.254.169.254/latest/meta-data/iam/security-credentials/<RoleName>`, temporary credentials are returned as JSON. These credentials are valid for about 6 hours, but the SDK automatically refreshes them 15 minutes before expiration.

> 🔍 **Going deeper**: The internal workings of AssumeRole are as follows. (1) A Principal calls the `sts:AssumeRole` API, specifying a `RoleArn`. (2) STS evaluates the Role's **Trust Policy** (which defines who can assume this Role). (3) If it passes, the Role's **Permission Policy** (what this Role can do) is granted. (4) STS issues temporary credentials, signing the permissions and expiration time into a JWT-like Session Token. (5) Subsequent API calls are signed with Signature V4, and AWS decodes the Session Token to verify permissions. **The fact that both the Trust Policy and the Permission Policy must pass** is the part that frequently confuses people.

| Role usage scenario | Principal in the Trust Policy |
|------|------|
| EC2 instance profile | `ec2.amazonaws.com` (Service) |
| Lambda execution role | `lambda.amazonaws.com` (Service) |
| Cross-Account access | `arn:aws:iam::123456789012:root` (another account) |
| Federation (SAML, OIDC) | `arn:aws:iam::...:saml-provider/...` |
| AWS Identity Center | `sso.amazonaws.com` |

> 💡 **Memorization tip**: A User is "a person with long-term credentials"; a Role is "a bundle of permissions that issues temporary credentials". If an exam scenario mentions **"an EC2 instance accessing S3"**, the answer is a Role 99% of the time. If **"hardcoding keys in code"** appears, it is never the correct answer.

## Policy: The Specification of Permissions Expressed in JSON

A Policy is a document that writes down permissions in JSON. Five fields are central: Effect / Action / Resource / Condition / Principal.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-bucket/users/${aws:username}/*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "ap-northeast-2"
        },
        "Bool": {
          "aws:MultiFactorAuthPresent": "true"
        }
      }
    }
  ]
}
```

This policy means "allow GET/PUT on the S3 prefix corresponding to one's own username, only when MFA-authenticated and the request targets the Seoul region". `${aws:username}` is a **policy variable** that is substituted with the caller's username at evaluation time. This is the core mechanism of ABAC.

| Policy type | Where it attaches | Evaluation priority |
|------|------|------|
| Identity-based | User / Group / Role | Standard evaluation |
| Resource-based | S3 bucket, SQS queue, Lambda, etc. | Union with Identity |
| Permission Boundary | User / Role | Upper limit (cap) |
| SCP (Service Control Policy) | OU / Account (Organizations) | Absolute upper limit |
| Session Policy | At AssumeRole time | Applies to that session only |

> 🔍 **Going deeper**: AWS IAM evaluation logic has a clear priority order. (1) If there is an **Explicit Deny**, it is unconditionally denied (the strongest). (2) If the **SCP** (Organizations level) has no Allow, deny. (3) If a **Permission Boundary** exists and contains no Allow, deny. (4) An Allow must exist in an **Identity-based or Resource-based policy** for the request to be allowed. In other words, the key asymmetry is: **"Allows accumulate as a union, but a Deny anywhere blocks immediately"**. Because of this asymmetry, SCPs are well suited to "making things absolutely impossible" (e.g., blocking root user actions, prohibiting the use of certain regions).

> ⚠️ **Trap**: A policy containing both `"Resource": "*"` and `"Action": "*"` is almost always `AdministratorAccess`-level. Developers commonly slap such policies into CloudFormation templates or SAM definitions "to quickly fix a permission issue", and IAM Access Analyzer detects this and sends alerts. On the exam too, when the keyword "least privilege" appears, a `*` policy is almost always a wrong answer.

> 📚 **Case study**: In 2017, NICE Systems, a partner of Verizon's DCS (a data integration company), exposed the call records of 14 million people through a publicly configured S3 bucket. The bucket policy contained both `"Principal": "*"` and `"Effect": "Allow"`. After this incident, AWS added a series of safeguards: (1) **Block Public Access** enabled by default on all new buckets, (2) red warning badges on public buckets in the S3 console, (3) **IAM Access Analyzer** (launched December 2019) automatically detecting resources exposed externally.

## Identity-based vs Resource-based: The Same Permission from Two Directions

The same "Alice can PutObject to my-bucket" can be expressed in two ways.

```json
// Identity-based (attached to Alice's User)
{
  "Effect": "Allow",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::my-bucket/*"
}

// Resource-based (my-bucket's Bucket Policy)
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::123456789012:user/Alice"},
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::my-bucket/*"
}
```

The difference shows up in **cross-account scenarios**. Within the same account, either one is sufficient, but when granting permissions to Alice in another account, **both must be present**. Our account's bucket policy must allow Alice, and Alice's account must also allow Alice's User to access our bucket. With only one side, the cross-account request is denied.

S3, KMS, SQS, SNS, Lambda, Secrets Manager, ECR, and others support resource-based policies. Services like DynamoDB, EBS, and CloudWatch do not, so cross-account access must always go through an IAM Role.

## Permission Boundary and SCP: The Upper Limits of Permissions

These are two safeguards frequently used in large organizations. A **Permission Boundary** sets the upper limit of an IAM User/Role's permissions. Even if AdministratorAccess is attached via an identity-based policy, if the Permission Boundary is ReadOnlyAccess, the actual effect is ReadOnly.

An **SCP** (Service Control Policy) sets an absolute upper limit at the OU/Account level of AWS Organizations. If an SCP says "deny regions other than us-east-1 and us-west-2", then no user/role inside that OU can operate in any other region. SCPs **do not grant permissions, they only restrict** (think of them precisely as a deny-only filter).

> 💡 **Memorization tip**: The SCP is the company-wide constitution, the Permission Boundary is an individual's ID card, and the identity-based policy is the actual activity permission. If any one of them blocks, the action is impossible.

## Simulating Permissions with the CLI

`aws iam simulate-principal-policy` rarely appears on the exam, but in practice it is gold for debugging.

```bash
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:role/MyRole \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::my-bucket/path/to/file.txt
```

The response contains `EvalDecision: allowed | explicitDeny | implicitDeny`. `implicitDeny` means "no explicit Allow was granted anywhere", and `explicitDeny` means "there is a Deny somewhere". For the latter, you should examine the SCP, the Permission Boundary, or the Resource Policy.

## Wrapping Up

The four parts we saw today are the ABCs of the cloud permission model. A **User** is a person's long-term credentials, a **Group** is the unit of permission bundling, a **Role** is a permission vault that anyone can assume to receive temporary credentials, and a **Policy** is the specification of permissions expressed in JSON. These four are the inputs to the IAM evaluation engine, and the engine evaluates in the order SCP → Permission Boundary → Identity-based → Resource-based → Session Policy to produce a result.

In the next article, we go deep into what sits on top of this: STS (the temporary credential issuer), policy conditions (Condition), and the cross-account patterns of resource-based policies. Recalling that the Capital One incident was a case of IAM Role credentials leaking through IMDSv1, it becomes clear that advanced IAM is not mere theory but the key to preventing real incidents.

---

## 📝 Practice Questions

**Question 1.** A developer wants to access S3 from an EC2 instance. What is the safest method?

A) Put an IAM User's Access Key into EC2 user-data and set it as environment variables
B) Attach an IAM Role as an EC2 instance profile
C) Use the AWS root account's keys
D) Store the keys in a ~/.aws/credentials file inside the EC2 instance

**Answer: B**
Explanation: When an IAM Role is attached, EC2 automatically receives temporary credentials through IMDS and the SDK automatically refreshes them before expiration. Since long-term keys are stored nowhere, the risk of key leakage disappears. A, C, and D all leave long-term keys inside the EC2 instance, so if the instance is compromised, the keys leak with it. Applying IMDSv2 alongside adds defense against SSRF attacks as well.

---

**Question 2.** Predict the result of the following policy evaluation. The identity-based policy has an Allow for `s3:GetObject`, and the SCP has a Deny for `s3:*`.

A) Allow (the identity-based policy is more specific)
B) Allow (the SCP only takes effect when there is no Allow)
C) Deny (Explicit Deny always wins)
D) Cannot be evaluated

**Answer: C**
Explanation: The core principle of IAM evaluation is "**an Explicit Deny anywhere blocks unconditionally**". A Deny in the SCP overrides an Allow in the IAM identity. Because of this asymmetry, SCPs are well suited to "making things absolutely impossible at the company level". For example, guardrails like "block all root account actions", "block use of unapproved regions", and "block actions without MFA" are implemented with SCPs. If the SCP has neither a Deny nor an Allow, the result is an implicit deny (not allowed).

---

**Question 3.** Which of the following is NOT a scenario where an IAM Role should be used?

A) A Lambda function calling DynamoDB
B) An EC2 instance uploading files to S3
C) An external SaaS writing backup data to S3 in our AWS account
D) A person logging in to the AWS console for the first time

**Answer: D**
Explanation: Console login is done with an IAM User or an SSO (Identity Center) user. A and B are the standard pattern of a service accessing another service, using a Role (instance profile or Lambda execution role). C is a cross-account scenario where the standard approach is for the SaaS's IAM account to assume a Role in our account. AWS requires an **External ID** (a shared secret) when configuring SaaS Roles to prevent the confused deputy problem.

---

**Question 4.** A company wants to give all developers AdministratorAccess but prevent them from using any region other than us-east-1 and ap-northeast-2. What is the most suitable tool?

A) A ReadOnly policy attached to the IAM Users
B) An SCP in AWS Organizations denying other regions with the `aws:RequestedRegion` condition
C) Blocking other regions with VPC security groups (impossible)
D) Restricting regions with a Permission Boundary

**Answer: B**
Explanation: SCPs apply at the OU/Account level, so they apply uniformly to every IAM Principal inside. Blocking actions in external regions with `"Condition": {"StringNotEquals": {"aws:RequestedRegion": ["us-east-1", "ap-northeast-2"]}}` makes other regions unusable even with AdministratorAccess. D's Permission Boundary is possible too, but requires attaching individually to every User/Role, which is a heavy operational burden. A makes development itself impossible with ReadOnly. C: SGs are not a region-control tool.

---

**Question 5.** Cross-account scenario: Alice in account A must access my-bucket in account B. What configuration is required?

A) Add an Allow only to Alice's User policy in account A
B) Add an Allow only to my-bucket's policy in account B
C) Add Allows to both Alice's policy in account A and my-bucket's policy in account B
D) Add account A to account B's Organizations

**Answer: C**
Explanation: Cross-account access requires "agreement from both sides". Account A's IAM must allow "Alice may access the external resource", and account B's resource policy must allow "external Alice may access". With only one side, it is denied. If my-bucket is KMS-encrypted, cross-account permissions are also needed in the KMS Key Policy (it is common for all three to be required: IAM permissions + KMS Key Policy + S3 Bucket Policy).

---

**Question 6.** Which statement about the relationship between Permission Boundaries and identity-based policies is correct?

A) The Permission Boundary overrides the identity-based policy
B) Only the intersection of what both Allow is actually permitted
C) If either one Allows, it is permitted
D) Permission Boundaries apply only to IAM Groups

**Answer: B**
Explanation: The Permission Boundary is the **upper limit** of permissions, and the identity-based policy is the permissions actually granted. **Both must Allow for the action to actually be permitted** — i.e., the intersection. For example, if the identity-based policy Allows `s3:*` but the Permission Boundary Allows only `s3:GetObject`, the only action actually possible is GetObject. Permission Boundaries are a tool for safely "delegating permissions" in large organizations. A CI/CD system can create IAM Roles for other developers while enforcing, via PB, the upper limit of permissions those created Roles can hold.

---

**Question 7.** A developer complains that "the code returns a ValidationException with 'Cross-account pass role is not allowed'". What is the most likely cause?

A) The Lambda function's timeout is too short
B) The `iam:PassRole` permission is missing, or an attempt was made to pass a Role from another account
C) The S3 bucket is in a different region
D) DynamoDB table throttling

**Answer: B**
Explanation: `iam:PassRole` is a meta-permission meaning "grant this Role to another service". For example, when creating a Lambda function you specify `Role: arn:...`, and the act of "handing over" this Role to Lambda is PassRole. PassRole is only allowed within the same account; it does not work cross-account. A frequent exam trap: for a developer to attach a Role to an EC2 instance, they need not only EC2 permissions but also `iam:PassRole`. To restrict this permission tightly, specify the attachable Role ARNs in `Resource`.
