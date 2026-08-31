# Day 2 - IAM Fundamentals: Who Gets to Do What

The first wall you hit when starting with AWS is permissions. Code that ran fine locally spits out `AccessDenied` the moment you put it on EC2, and an S3 bucket clearly visible in your console is invisible to another user. As this keeps happening, you naturally become curious about what IAM really is.

This article unpacks how IAM works, centered on its 4 entities — **User / Group / Role / Policy**. It's the most fundamental yet most trap-laden area of the exam, and in practice, 90% of "why doesn't this work?" starts here. IAM launched in 2010; before that, AWS did everything with a single set of root credentials. If you recall how dangerous that state was, you can see why IAM became the foundation of all AWS security.

## Authentication, Authorization, and Where IAM Sits

IAM is a system that answers two questions. First, "who is this requester?" (Authentication, AuthN); second, "is that person allowed to do this?" (Authorization, AuthZ). The former is solved with credentials (passwords, Access Keys, STS temporary tokens), the latter with policies. Every AWS API call is an HTTP request signed with the **SigV4 signing algorithm**; AWS verifies that signature to confirm identity, then evaluates policies to decide allow/deny.

> 💡 **Related theory**: Authentication and authorization are the foundation of the 8 security principles presented by Saltzer & Schroeder in their 1975 paper "The Protection of Information in Computer Systems." The core among them are the **Principle of Least Privilege** and **Fail-safe Defaults** (deny by default). AWS IAM's "Implicit Deny + Explicit Allow" model implements exactly these two principles. Permission models split along two axes — RBAC (Role-Based, NIST RBAC standard INCITS 359-2012) and ABAC (Attribute-Based, NIST SP 800-162) — and IAM supports both; tag-based ABAC was officially added in 2018.

> 🔍 **Going deeper**: A SigV4 signature is created by chaining the request body, headers, timestamp, credential ID, and secret key through HMAC-SHA256. The key point is that the secret never travels over the network. The AWS server recomputes the same signature with the same secret and compares. Also, requests with timestamps outside ±15 minutes are rejected, blocking replay attacks. The reason IMDSv2 issues temporary credentials inside EC2 is ultimately to safely deliver the key used for this SigV4 signing.

## IAM's 4 Entities

| Entity | Definition | Credentials | Lifetime |
|--------|------|----------|------|
| **User** | Permanent identity for a person/app | Password, Access Key | Permanent (rotation required) |
| **Group** | A bundle of Users. Unit for attaching policies | None (container) | - |
| **Role** | An identity that can be temporarily borrowed | STS Temp Credential | 15 minutes ~ 12 hours |
| **Policy** | JSON permission document | - | - |

The commonly misunderstood one here is Group. **A Group is not a person.** It can't log in and has no credentials of its own. It's merely a container for bundling Users to attach policies all at once. And a Group cannot be a member of another Group — no nesting. This is the biggest difference from the Unix group model in operating systems (Unix allows users to belong to multiple groups but has no groups-of-groups; IAM is the same).

The most interesting one is Role. A Role is a "borrowed identity." An EC2 instance, a Lambda function, a user in another account, an external IdP — anyone specified as a principal in the trust policy can temporarily borrow this Role and act with its permissions. Borrowing invokes the `sts:AssumeRole` API, which returns a 3-piece set: **AccessKey + SecretKey + SessionToken**. These tokens expire, and when they do, you borrow again. This is the core of the security model that "keeps no long-lived credentials."

```
[ IAM entity relationships ]

   +-------+      attach      +--------+
   | User  | <-------------- | Policy |
   +-------+                 +--------+
       |                        ^
   member of                    |
       v                    attach
   +-------+                    |
   | Group | <------------------+
   +-------+
                                |
   +-------+    AssumeRole      |
   | Role  | <---- via STS  ----+
   +-------+
       ^
       |   trust policy
   +-------+
   | EC2 / Lambda / another account / OIDC
```

> 📚 **Case study**: The 2017 OneLogin breach. An attacker stole AWS API keys and exfiltrated customer data over several days. The post-mortem revealed the root cause: **a long-lived IAM User Access Key had been committed to a code repository (Git) and exposed, and that key carried broad permissions**. Had this key been Role-based temporary credentials, it would likely have already expired at the time of exposure. This incident was one of the decisive moments that cemented the best practice: "whether human or app, use Roles wherever possible."

## Policy: A Single JSON Document Decides Everything

IAM policies are written as JSON documents, with 5 core fields.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowS3ReadOnSpecificBucket",
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::my-bucket",
      "arn:aws:s3:::my-bucket/*"
    ],
    "Condition": {
      "StringEquals": {"aws:SourceVpc": "vpc-0abc123"},
      "Bool": {"aws:MultiFactorAuthPresent": "true"}
    }
  }]
}
```

- **Effect**: `Allow` or `Deny`. If neither, implicit deny.
- **Action**: APIs to allow. Wildcards like `s3:*` are possible but dangerous.
- **Resource**: Target ARNs. `*` means all resources.
- **Condition**: Additional constraints by IP, MFA, time, tags, SourceVpc, etc.
- **Principal**: Appears only in resource policies. Whom the access is granted to.

> ⚠️ **Pitfall**: Using `"Resource": "*"` and `"Action": "*"` together makes it equivalent to AdministratorAccess. On the exam it appears as questions like "an audit found excessive permissions," and the answer is almost always "trim unused permissions with IAM Access Analyzer" or "set a Permissions Boundary."

There are 6 kinds of policies, and distinguishing them is the crux of the exam.

| Kind | Attached To | Purpose |
|------|-----------|------|
| Identity-based (Managed/Inline) | User, Group, Role | "What can this identity do" |
| Resource-based | S3 bucket, KMS key, Lambda, SQS, SNS | "Who can access this resource" |
| Permissions Boundary | User, Role | The **upper bound** on permissions an identity can have |
| Service Control Policy (SCP) | Organizations OU/Account | Permission ceiling for an entire account |
| Session Policy | Passed inline on AssumeRole | Narrows permissions only for that temporary session |
| Access Control List (ACL) | S3, VPC (legacy) | Object-level permissions (avoid if possible) |

## Policy Evaluation Logic: One Explicit Deny and It's Over

When multiple policies apply simultaneously, AWS evaluates in the following order.

```
1. Default: deny (Implicit Deny)
2. Evaluate SCP → explicit Deny in SCP → DENY (done)
3. Evaluate Resource-based policies
4. Evaluate Identity-based policies
5. Evaluate Permissions Boundary
6. Evaluate Session Policy
7. Explicit Deny anywhere → DENY (done)
8. Allow somewhere → ALLOW
9. Nothing at all → DENY (Implicit Deny)
```

Remember two key things. First, **an explicit Deny wins unconditionally, no matter where it lives.** Second, **an allow must be granted at every layer simultaneously.** If the SCP denies, no amount of Allow in IAM policies helps. If the Permissions Boundary doesn't include the permission, you can't do it.

> 🔍 **Going deeper**: Within the same account, when both a Resource Policy and an Identity Policy exist, the **union** applies. That is, an Allow on either side is enough to pass. But **cross-account** is different. Both sides must Allow (the owning account's Resource Policy + the calling account's Identity Policy). This is a staple exam trap. For the question "I allowed the other account's User in the S3 bucket policy — why doesn't it work?" the answer is "you must also Allow via an Identity Policy inside that account."

> 💡 **Related theory**: Formally, this evaluation logic is an explicit priority system over a decision tree. XACML (eXtensible Access Control Markup Language, an OASIS standard) defines similar policy-combining algorithms (deny-overrides, permit-overrides, etc.), and IAM adopts **deny-overrides** as its default. This is the most conservative choice, guaranteeing "fail-safe" behavior in security.

## Root vs IAM User: Never Live as Root

When you create an AWS account, the first identity created is **root**. Root has all permissions, and some operations (e.g., closing the account, changing billing information, enabling S3 MFA Delete) can only be done by root. But using root for daily work is like always logging in as `root` on Linux.

The practical standard is this.

1. Enable **hardware MFA** on root
2. **Delete** root Access Keys
3. Use an **IAM User** or **IAM Identity Center (SSO)** for daily work
4. Put root in a vault and take it out only a few times a year

> 📚 **Case study**: In 2020, a startup accidentally pushed a root Access Key to a public GitHub repo. Within minutes, bots scanned the key, spun up dozens of EC2 P3 instances to mine cryptocurrency, and within 24 hours the bill exceeded $50,000. AWS usually deactivates the key automatically and waives the charges once it detects such incidents, but not every case goes that way. The lesson is simple: a root key is **dangerous by its mere existence**. GitHub has since introduced its own secret scanning, detecting key patterns from AWS, GCP, Stripe, and others at push time.

## IAM Identity Center (formerly AWS SSO): The Real Standard

The standard for modern AWS operations is **IAM Identity Center**. You SSO in from your company's IdP (Okta, Azure AD, Google Workspace) via SAML 2.0 or OIDC, and receive temporary credentials across multiple accounts through Permission Sets. On the exam too, if the scenario is "managing permissions for many users across multiple accounts," the answer is almost always IAM Identity Center.

| Comparison | IAM User | IAM Identity Center |
|------|----------|---------------------|
| Credentials | Permanent | Temporary (1-12 hours) |
| Multi-account management | Hard | Easy (Organizations integration) |
| External IdP federation | Separate setup | Supported natively |
| Rotation burden | User's responsibility | Automatic |
| Exam recommendation | Individual users not recommended | ✅ |

## MFA: The Real Meaning of a Second Factor

MFA is the combination of "something I know (password) + something I have (token generator)." AWS supports 4 kinds of MFA.

- **Virtual MFA**: Authy, Google Authenticator (TOTP, RFC 6238)
- **Hardware MFA**: YubiKey and other FIDO U2F/WebAuthn devices
- **SMS MFA**: No longer recommended (vulnerable to SIM swap attacks)
- **U2F security keys**: The safest. Phishing-resistant

TOTP is a 6-digit code that changes every 30 seconds, and its algorithm is defined in RFC 6238. It combines the shared secret (the seed registered when scanning the QR code) with the current 30-second time window via HMAC-SHA1, then truncates part of the result into 6 digits. On the exam, "how do you enforce MFA?" comes up often, and the answer is **adding `aws:MultiFactorAuthPresent: true` to a policy's Condition**.

```json
"Condition": {
  "BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}
}
```

A Deny statement with this condition means "unconditionally deny any session that didn't go through MFA." The reason for `BoolIfExists` is that in some services (e.g., service-to-service calls via an IAM Role) this key may not exist at all.

> 🔍 **Going deeper**: WebAuthn/FIDO2 is asymmetric-key based, making it inherently strong against phishing. At registration, the device generates a key pair and only the public key is stored on the server. At login, the device signs the server's challenge with its private key, and that signature includes the **origin (the domain being accessed)**. So the attack of relaying a challenge received on a phishing site back to the legitimate service is automatically blocked. SAA doesn't probe this deeply, but for "which MFA is the most secure" type questions, the answer is FIDO/WebAuthn.

## EC2 Instance Profiles and IAM Roles: Getting Permissions Without Keys

When you want to access S3 from inside EC2, the thing you must never do is hardcode Access Keys in your code. Instead, **attach an IAM Role to the EC2 instance**. EC2 retrieves the Role's temporary credentials via the IMDS (Instance Metadata Service, `169.254.169.254`), and the AWS SDK automatically signs with those keys.

```bash
# Inside EC2 (using IMDSv2)
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/MyRole
```

The credentials returned here typically refresh automatically every hour. The SDK pre-fetches new tokens starting 5 minutes before expiry, so application code doesn't need to care.

> 📚 **Case study**: The direct cause of the Capital One incident (seen on Day 1) was precisely the IMDSv1 version of this IMDS. IMDSv1 was a simple GET, so an external attacker could reach it via SSRF. IMDSv2 requires obtaining a token via PUT first before GET works, neutralizing nearly all SSRF. Since 2022, all new EC2 AMIs are recommended to require IMDSv2 by default.

## Practical Best Practices Summary

1. Seal root away. MFA mandatory.
2. Use **IAM Identity Center** instead of individual IAM Users.
3. For both humans and apps, use **Roles + temporary credentials** wherever possible.
4. If an Access Key is truly necessary, **rotate every 90 days**.
5. Start policies with **least privilege** and expand as needed.
6. Regularly prune unused permissions with **IAM Access Analyzer**.
7. Audit all IAM activity with **CloudTrail**.
8. Enforce permission ceilings on developer-created Roles with **Permissions Boundaries**.

## Wrapping Up

Today's two pictures are IAM's 4 entities (User/Group/Role/Policy) and the policy evaluation logic (explicit Deny > explicit Allow > implicit Deny). With just these two lodged in your head, 70% of the exam's IAM domain is solvable. In the next article, we'll go deeper into STS and policy evaluation internals — Permissions Boundaries, ABAC tags, and the Confused Deputy problem.

---

## 📝 Practice Questions

**Question 1.** A company operates multiple AWS accounts and wants single sign-on through its corporate Okta. What is the most suitable solution?

A) Create an IAM User in each account and use the same password
B) SAML federation with Okta via IAM Identity Center (formerly AWS SSO)
C) Share root credentials
D) Create IAM Roles directly and distribute them to Okta users

**Answer: B**
Explanation: Multi-account + external IdP scenarios almost always point to IAM Identity Center. It integrates with Okta via SAML 2.0 or SCIM, and manages multi-account permissions centrally through Permission Sets. A causes credential sprawl, C heads straight into a security incident, and D is possible but Trust Policy management explodes as users grow. Identity Center simplifies multi-account operations by bundling permissions into an abstraction called Permission Sets.

---

**Question 2.** An EC2 instance needs to access S3. What is the most secure method?

A) Set the Access Key as an environment variable
B) Hardcode the Access Key in the code
C) Attach an IAM Role to the EC2 instance
D) Use root credentials

**Answer: C**
Explanation: An Instance Profile (the mechanism for attaching an IAM Role to EC2) is the answer. The SDK automatically refreshes temporary credentials via IMDSv2, eliminating key rotation burden. A risks leakage, B is the fastest path to an incident (GitHub scanning bots catch it within minutes), and D is absolutely forbidden. Additionally, enforce IMDSv2 and settings like hop limit 1 to defend against SSRF as well.

---

**Question 3.** Which of the following is correct regarding IAM policy evaluation?

A) If there is even one Allow, access is unconditionally granted
B) An explicit Deny nullifies all Allows
C) The default is Allow
D) Resource-based policies take precedence over Identity policies

**Answer: B**
Explanation: The core principle of IAM. Deny > Allow > Implicit Deny. A is wrong because an SCP or Permissions Boundary can block it. C is the exact opposite (fail-safe defaults). D is not a simple precedence — within the same account it's a union, and cross-account both must Allow. In the XACML standard too, deny-overrides is the most conservative combining algorithm.

---

**Question 4.** Which statement about Groups is correct?

A) A Group can log in
B) A Group can be a member of another Group
C) A Group has no credentials of its own
D) You can issue Access Keys directly to a Group

**Answer: C**
Explanation: A Group is a simple container with no credentials and no ability to log in. No nesting either. It's merely a grouping unit for attaching policies efficiently. Because of this, the permission model is generally a one-way "User → Group → Policy" structure; if you need a more complex hierarchy, solve it with SCPs (Organizations) or Permissions Boundaries.

---

**Question 5.** You want to grant a user in another account cross-account access to an S3 bucket. What is required?

A) Just an Allow in the bucket policy is enough
B) Just an Allow in the caller account's IAM policy is enough
C) Allows are needed on both sides
D) Joining Organizations is mandatory

**Answer: C**
Explanation: Cross-account requires **explicit Allows in both accounts**: the owning account's Resource Policy + the calling account's Identity Policy. Within the same account either one suffices via union, but cross-account behaves like an intersection. This is the most frequently missed part of IAM evaluation logic.

---

**Question 6.** What is the most appropriate way to enforce MFA?

A) Ask users to please turn on MFA
B) Add `aws:MultiFactorAuthPresent: true` to a policy Condition
C) Use MFA only for root credentials
D) Shorten the Access Key rotation period

**Answer: B**
Explanation: A policy Condition is the answer. Use `BoolIfExists` alongside it to correctly handle sessions where the MFA key doesn't exist (service calls, etc.). A has no enforcement power, C doesn't protect regular users, and D is a key rotation policy, not MFA. Security policy must always be implemented through "technical enforcement," not "human goodwill."

---

**Question 7.** A new junior developer should be able to create new IAM Roles, but you want to prevent attaching broad permissions like `iam:*` or `*:*` to those Roles. What is the most appropriate method?

A) Revoke all of the junior's IAM permissions
B) Enforce a permission ceiling on Roles with a Permissions Boundary
C) Promote the junior to root
D) Detect after the fact with CloudTrail

**Answer: B**
Explanation: A Permissions Boundary is "the upper bound on permissions this identity can have." If you enforce via policy that a Boundary must be attached whenever the junior creates a Role, the Role's effective permissions are limited to the intersection of the Boundary and the Identity Policy. A halts work, C is a permission explosion, and D is only after-the-fact response, not prevention. This is the standard pattern for achieving autonomy and safety at the same time in practice.
