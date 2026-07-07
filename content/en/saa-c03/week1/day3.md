# Day 3 - IAM Deep Dive: STS, Permissions Boundaries, and the Shadow of the Confused Deputy

The IAM we saw on Day 2 centered on the 4 entities and policy evaluation logic. But once you enter real operations, deeper questions soon arise: "A Lambda in another account needs to read our S3," "the Roles our users create are too powerful," "how does an external SaaS enter our AWS safely?" The answers all lie in the tools called **STS (Security Token Service)**, **Permissions Boundary**, and **External ID**.

This article covers IAM's real security model — borrowing Roles, enforcing permission ceilings, and delegated trust. It's the area where the most exam questions are missed, and where incidents happen most often in practice. One thing to note up front: IAM only first appeared in 2010, and STS followed in 2011. Recall that before then, AWS's version of "delegating to another account" was simply sharing root keys — and you can see why these tools were designed so conservatively.

## What Does STS Issue?

STS is AWS's **temporary credential issuing service**. Know the five core APIs and you're done.

| API | Caller | Purpose |
|-----|--------|------|
| `AssumeRole` | IAM User / Role | Borrowing a Role in the same account or cross-account |
| `AssumeRoleWithSAML` | SAML-federated user | After logging in via corporate IdP (AD FS, Okta) |
| `AssumeRoleWithWebIdentity` | OIDC token holder | Google/Facebook login, EKS IRSA, GitHub Actions OIDC |
| `GetSessionToken` | IAM User (usually for MFA) | Temporary token with your own permissions as-is |
| `GetFederationToken` | IAM User | When delegating permissions to external users (mostly replaced by IAM Identity Center) |

The credentials STS issues always come as a 3-piece set.

```
AccessKeyId      : starts with ASIA (permanent keys start with AKIA)
SecretAccessKey  : HMAC seed
SessionToken     : expiry time + signature metadata
```

The expiry defaults to 1 hour, and each Role can set `MaxSessionDuration` between 1 and 12 hours. Role chaining (borrowing Role A to borrow Role B) is capped at a maximum of 1 hour — an intentional limit for security boundary reasons. Allowing infinite chaining would let the permission span of a once-issued token stretch infinitely in time, and the audit trail would break.

> 🔍 **Going deeper**: STS provides both the global endpoint `sts.amazonaws.com` (routed to us-east-1) and regional endpoints like `sts.ap-northeast-2.amazonaws.com`. The global endpoint dies along with a us-east-1 outage, so in practice the standard is to **explicitly use regional endpoints**. The AWS SDK recommends the environment variable `AWS_STS_REGIONAL_ENDPOINTS=regional` by default. The direct trigger for this pattern was the 2017 S3 us-east-1 mega-outage, during which STS also wobbled and authentication failures spread even to workloads in other regions. For the same reason, SigV4 signature verification itself is independent per region, but if the "issuing a new token" step is tied to the global endpoint, it becomes a single point of failure.

> 💡 **Related theory**: STS is effectively an implementation of **capability-based security**. First presented in the 1966 Dennis & Van Horn paper "Programming Semantics for Multiprogrammed Computations," the idea is "don't bind permissions to identities — bind them to transferable tokens." JWT (RFC 7519), OAuth 2.0 Access Tokens (RFC 6749), and Kerberos Tickets (RFC 4120) all belong to the same family. STS tokens have nearly the same security properties as OAuth 2.0's short-lived tokens. The comparison of ACL-based (who can access what — identity-centric) vs capability-based (whoever holds this token has the permission — token-centric) is a classic topic Saltzer organized in his 1972 "Protection and the Control of Information Sharing in Multics."

> 🔍 **Going deeper**: The 1-hour default expiry of STS tokens is no coincidence. It nearly matches the "re-authentication interval" recommended in NIST SP 800-63B's session management guidance. Too short (e.g., 5 minutes) and STS calls explode on every cold start, causing throttling (`Rate exceeded`); too long (e.g., 12 hours) and the attack window after key exposure stretches out. One hour is close to the industry-standard value for that trade-off.

## Trust Policy: Who Can Borrow a Role

Two kinds of policy attach to a Role: the **Permissions Policy** (what this Role can do) and the **Trust Policy** (who can borrow this Role). The Trust Policy is effectively the Role's Resource Policy.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::111122223333:root"},
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {"sts:ExternalId": "unique-uuid-per-tenant"},
      "Bool": {"aws:MultiFactorAuthPresent": "true"}
    }
  }]
}
```

Here `Principal: "arn:aws:iam::111122223333:root"` means "any identity in account 111122223333 may enter" — it does not mean only the root user is allowed. This is a frequently confused point. Who inside the calling account can actually borrow it is decided by that account's IAM policies. In other words, only when both accounts' policies explicitly allow `sts:AssumeRole` does the Role actually get borrowed.

> ⚠️ **Pitfall**: Setting `"Principal": {"AWS": "*"}` creates the horrifying configuration where any AWS account can borrow this Role. On the exam this appears as "which Trust Policy is the most dangerous," and the answer is almost always `*` or broad delegation without a `Condition`. In practice too, it's common for people to copy-paste Datadog/PagerDuty setup guides and leave out the External ID.

## The Confused Deputy Problem and External ID

Confused Deputy is a security vulnerability named by Norm Hardy in his 1988 paper "The Confused Deputy: or why capabilities might have been invented." It refers to a situation where a privileged intermediary (the Deputy) is wrongly induced to use its authority for unintended actions. Hardy's original example was "the compiler that overwrote the billing file," but in cloud SaaS scenarios this problem shows up almost every time.

For example, suppose Datadog collects CloudWatch logs from our AWS account. We grant Datadog's Role in Datadog's AWS account `sts:AssumeRole` permission, and Datadog borrows our Role to read our logs. But what if another Datadog customer X discovers our Role's ARN and registers "this Role as a monitoring target" in their own Datadog console? Datadog might attempt to borrow our Role at X's request — that's the Confused Deputy. The Deputy's (Datadog's) authority was triggered by "someone else (X)" rather than "the originally intended delegator (us)."

The solution is **External ID**. Add `sts:ExternalId` as a condition in the Trust Policy, and set its value as a secret shared only between us and Datadog. Even if X knows our Role ARN, AssumeRole fails without knowing the External ID.

```json
"Condition": {
  "StringEquals": {"sts:ExternalId": "550e8400-e29b-41d4-a716-446655440000"}
}
```

The External ID doesn't have to be secret (it just needs to be unguessable); the key point is that it's bound 1:1 with the Role ARN. Typically you use an identifier with practically zero collision probability, like a UUIDv4.

> 📚 **Case study**: In 2018, a security researcher discovered that the Role registration procedures of several SaaS monitoring tools were missing External IDs and published a PoC. AWS subsequently made "Cross-Account Role + External ID" a baseline requirement for ISV certification, and today every third-party integration listed on AWS Marketplace mandates an External ID. An older case is the 2014 Code Spaces incident — exposed AWS root credentials led to all S3 buckets and EBS snapshots being deleted within 12 hours, and the company shut down. Even without direct cross-account delegation, it shows how dangerous the pattern of "granting delegable tokens broadly" is.

> 💡 **Related theory**: The Confused Deputy problem is also the starting point of capability-based security. Whereas ACLs bind "who can access what" by identity, capabilities grant "authority to whoever holds this token," so delegation must explicitly carry identity information along. External ID is one form of that identity information. OAuth 2.0's `state` parameter (RFC 6749 § 10.12), SAML's `Audience` restriction, and OIDC's `aud` claim are mechanisms that prevent confused deputies by the same principle.

## Permissions Boundary: The Ceiling on Permissions

A Permissions Boundary is a **permission ceiling** attached to a User or Role. Effective permissions = (Identity Policy) ∩ (Permissions Boundary). That is, even if the Identity Policy grants `s3:*`, if the Boundary only contains `s3:GetObject`, only Get works.

The scenario where this is needed is clear: you want to give developers the freedom to "create and use Roles as you wish," but prevent those Roles from having root-level permissions. Just attach a policy condition saying "when creating a Role, you must attach Boundary X."

```json
{
  "Effect": "Allow",
  "Action": ["iam:CreateRole", "iam:PutRolePolicy"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary": "arn:aws:iam::111122223333:policy/DevBoundary"
    }
  }
}
```

| Mechanism | Applies To | Effect |
|---------|------|------|
| Identity Policy | User/Group/Role | Defines possible permissions |
| Permissions Boundary | User/Role | Ceiling on possible permissions |
| SCP | Organizations OU/Account | Account-wide ceiling |
| Session Policy | On AssumeRole | Additional narrowing for that session only |
| Resource Policy | Resource | Resource-side allowance |

Effective permissions = the intersection of the above 5, with explicit Deny winning anywhere. Mathematically it's a structure like `Effective = IdentityPolicy ∩ Boundary ∩ SCP ∩ SessionPolicy ∩ ResourcePolicy`, with `Deny`-first short-circuit evaluation layered on top.

> ⚠️ **Pitfall**: A Permissions Boundary does not "grant" permissions. It only sets the ceiling. If the Identity Policy didn't grant `s3:GetObject`, even a Boundary of `s3:*` won't enable Get. On the exam, answer choices like "attaching a Boundary activated some permission" appear frequently as traps. One more: a Boundary attaches only to IAM Principals, never to Resources. Resource-side ceilings must be handled with SCPs or Resource Policies.

> 🔍 **Going deeper**: Boundary and SCP are both "ceilings," but they apply at different points. **An SCP applies to all Principals in the calling account at call time**; **a Boundary applies to that individual Principal**. In other words, SCP is the coarse net, Boundary the fine net. In large organizations, the standard pattern is a 3-tier structure: "enforce company policy with Organizations SCPs → enforce per-team limits with Boundaries within each account → grant actual permissions with Identity Policies."

## ABAC: Tag-Based Access Control

Traditional RBAC creates a different policy per Role. With 100 users and 50 projects, you might need 5,000 policies. ABAC finishes the job with one policy.

```json
{
  "Effect": "Allow",
  "Action": "ec2:StartInstances",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Project": "${aws:PrincipalTag/Project}"
    }
  }
}
```

This single policy expresses "can only start EC2 instances tagged with the same Project tag as mine." As users grow, you just manage tags without changing policies. The downside is that it requires a consistent tagging policy across all resources — the most common reason ABAC fails. Resources missing tags get their permissions blocked, or conversely, wrong tags open up broad permissions.

> 💡 **Related theory**: ABAC is the model standardized in NIST SP 800-162 "Guide to Attribute Based Access Control." Whereas RBAC is static and duty-based (NIST RBAC, INCITS 359-2012), ABAC is dynamic and attribute-based, making it strong for automation and scale. Beyond AWS, Google IAM's Conditions and Azure Conditional Access follow the same pattern. ABAC's limitation is policy debugging — when access is blocked, tracing "why it was blocked" requires tracking the Principal tags, Resource tags, and Condition key sets all together, making troubleshooting harder than RBAC. Hence in practice, a hybrid of an RBAC skeleton supplemented by ABAC is common.

> 📚 **Case study**: A fintech company migrating to ABAC cut its policy count from 800 to 6, but in the first month new EC2 launches got blocked because "the Project tag wasn't auto-populated." Only after adding automation via EventBridge + Lambda to "force default tags at resource creation" did ABAC stabilize. ABAC is 90% tagging governance.

## Federation: SAML 2.0 vs OIDC

Enterprise users usually don't create AWS accounts directly. They log in once at the corporate IdP (Active Directory, Okta, Auth0) and borrow an AWS Role. This is called **Identity Federation**.

| Protocol | Released | Token Format | Main Use |
|---------|------|-----------|---------|
| SAML 2.0 | 2005 (OASIS) | XML | Traditional enterprise IdPs (AD FS, Okta) |
| OIDC | 2014 (OpenID Foundation) | JWT | Web, mobile, SaaS |

SAML is XML-based, so it's heavy and parsing vulnerabilities have surfaced frequently (the SAML XML Signature wrapping found by Duo Security in 2018, CVE-2018-0114, etc.), but it remains the enterprise standard. OIDC is JWT-based, lightweight, and mobile-friendly, so new integrations are almost all OIDC. JWT is defined in RFC 7519, and OIDC in the OpenID Connect Core 1.0 spec.

EKS's IRSA (IAM Roles for Service Accounts) and GitHub Actions' OIDC integration are both OIDC-based. The reason this pattern matters is **to keep long-lived credentials out of code/CI**. When deploying to AWS from GitHub Actions, instead of storing an Access Key as a Secret, you borrow a Role with an OIDC token, and the key rotation burden disappears.

```yaml
# GitHub Actions OIDC example
permissions:
  id-token: write   # issue OIDC token
  contents: read
steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::111122223333:role/GHActionsDeploy
      aws-region: ap-northeast-2
```

Here, register the GitHub OIDC Issuer in the IAM Role's Trust Policy, and restrict the `sub` claim to a specific repo and branch.

```json
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:sub":
      "repo:myorg/myrepo:ref:refs/heads/main"
  }
}
```

The key point is that the repo and branch are embedded in the `sub` claim. Even if another repo obtains the same kind of OIDC token, its sub differs, so borrowing the Role fails. In other words, the GitHub-side token inherently constrains the Role's usage scope.

> 📚 **Case study**: In the 2022 Travis CI breach, attackers stole more than 770 user tokens and accessed GitHub repos. As a result, numerous AWS Access Keys were exposed. Had OIDC federation been used, there would have been no long-lived tokens to expose in the first place. GitHub Actions' OIDC usage became the de facto standard afterward. CircleCI suffered a similar breach the same year, and both incidents seared the lesson "don't keep long-lived secrets in CI" into the entire industry.

> 🔍 **Going deeper**: AssumeRoleWithWebIdentity verifies the OIDC token's signature using public keys fetched from the IdP's JWKS (JSON Web Key Set, RFC 7517) endpoint. AWS registers this JWKS as an IAM Identity Provider object and caches it. When the IdP rotates (rolls over) its keys, AWS automatically fetches the new keys, but if the JWKS URL itself changes, a manual update is required. This is a common cause of the real-world trouble "OIDC suddenly fails in GitHub Actions."

## The Full Flow of Policy Evaluation

```
[ Request: principal P, action A, resource R ]
          │
          ▼
   1. Check Organizations SCP → Deny means done
          │ Allow
          ▼
   2. Check Resource-based Policy (mandatory if cross-account)
          │
          ▼
   3. Check Identity-based Policy
          │
          ▼
   4. Check Permissions Boundary
          │
          ▼
   5. Check Session Policy (on AssumeRole)
          │
          ▼
   6. Deny anywhere → DENY
   7. All stages passed → ALLOW
   8. No explicit Allow → DENY (default)
```

> 🔍 **Going deeper**: Within the same account, Resource Policy and Identity Policy combine as a union (OR), but cross-account they combine as an intersection (AND). KMS is the exception — with KMS, unless the key policy (Key Policy) explicitly delegates permissions, no matter how strong the IAM policy, you can't use the key. This is KMS's distinctive "key policy must allow" model and an exam staple. Other services where a similar model applies include Secrets Manager, S3 (for certain actions), and Lambda (Resource Policy).

> 💡 **Related theory**: This evaluation algorithm is closest to OASIS XACML 3.0's `deny-overrides` combining algorithm. XACML separates an authorization system into 4 axes — PEP (Policy Enforcement Point), PDP (Policy Decision Point), PIP (Policy Information Point), PAP (Policy Administration Point) — and AWS IAM has nearly the same structure: API Gateway/SDK as PEP, the IAM evaluation engine as PDP, CloudTrail/IAM Identity Source as PIP, and the IAM console as PAP. The difference is that XACML defines obligations (additional actions to perform when granting) whereas IAM has no such concept.

## IAM Access Analyzer: Finding Unused Permissions

Access Analyzer does two things. First, **discovering external access** (External Access Findings) — automatically detecting whether my resources are exposed to other accounts or the public internet. Second, **discovering unused permissions** (Unused Access) — identifying permissions not invoked in the last N days. This is the real tool for automating least privilege.

| Feature | Description |
|------|------|
| External Access | Detects externally accessible resources: S3 buckets, KMS keys, IAM Roles, Lambda, etc. |
| Unused Access | Automatically detects permissions, Roles, and Access Keys unused for 90 days |
| Policy Validation | Automatic diagnosis of syntax and logic errors while writing IAM policies |
| Policy Generation | Generates policies from CloudTrail logs containing only the permissions actually used |

Internally, Access Analyzer is based on formal verification. It converts policies into SMT (Satisfiability Modulo Theories) problems and solves "does there exist an input under which this policy allows external exposure." AWS's Zelkova engine plays that role, based on "Semantic-based Automated Reasoning for AWS Access Policies," presented at USENIX Security 2018. So rather than simple pattern matching, it reasons about the semantic equivalence of policies.

## Wrapping Up

Today's core points are three. First, STS is the origin of all temporary credentials, and its 5 APIs are used differently per scenario. Second, a Permissions Boundary is a permission ceiling, not a permission grant. Third, cross-account delegation must block the Confused Deputy with an External ID. In the next article, we'll look at governing multiple accounts on top of this IAM with **Organizations + SCP + Control Tower**. The SAA exam asks less "what is IAM" and more "which combination blocks which threat," so learning these tools' application contexts through scenario language is the fastest path.

---

## 📝 연습 문제

**문제 1.** An external SaaS monitoring tool wants to read CloudWatch logs in my AWS account. What is the most appropriate measure to prevent a Confused Deputy attack?

A) Provide an Access Key to the SaaS
B) Cross-Account Role + adding an External ID condition
C) Share root credentials
D) Allow S3 public access

**정답: B**
해설: The security standard for SaaS integrations. The External ID is a pre-shared secret between us and the SaaS that prevents other SaaS customers from borrowing our Role even if they know its ARN. A has key rotation problems, C heads straight into a security incident, and D is irrelevant. All AWS Marketplace-certified ISVs mandate External IDs. As an additional safety net, there's also the pattern of adding `aws:SourceAccount` or `aws:SourceArn` to the Trust Policy's Condition. In particular, when an AWS service (SNS → Lambda, etc.) is the delegated caller, External ID doesn't apply, so `aws:SourceArn` is the de facto standard there.

---

**문제 2.** You want to give developers permission to create IAM Roles, but prevent them from creating Roles with `*:*` permissions. How?

A) Detect after the fact with CloudTrail
B) Specify a Permissions Boundary as a mandatory attachment condition in the policy
C) Revoke all developer permissions
D) Use only Organizations SCPs

**정답: B**
해설: Enforce the `iam:PermissionsBoundary` condition on `iam:CreateRole` calls, and Roles without that Boundary attached cannot be created. The created Role's effective permissions are automatically limited to the intersection with the Boundary. A is after-the-fact response, not prevention. C halts work. D operates at the account level, which is ill-suited for controlling individual Roles differently. Using SCPs and Boundaries together is safer — SCP is the "big net for the whole account," Boundary the "fine net per Principal"; their roles differ.

---

**문제 3.** What is the most secure credential method when deploying to AWS from GitHub Actions?

A) Store an IAM User Access Key as a Secret
B) Temporarily borrow a Role via OIDC federation
C) Use a root Access Key
D) Spin up an EC2 instance and deploy with SSH keys

**정답: B**
해설: OIDC federation borrows an AWS Role using a short-lived token issued by GitHub. With no long-lived credentials, exposure risk is zero. A is the structure where a leaked Secret leaks the key too, as in the Travis CI breach. C and D violate security best practices. Restricting the `sub` claim in the Trust Policy narrows access down to repo and branch, enabling precise permission separation as well. Beyond the exam, OIDC is solidifying as a standard requirement in compliance audits like SOC 2 and ISO 27001.

---

**문제 4.** To access S3 cross-account, what is needed?

A) Allow policies in both accounts
B) An Allow only in the bucket policy is sufficient
C) An Allow only in the caller account's policy is sufficient
D) Joining Organizations is mandatory

**정답: A**
해설: Cross-account requires explicit Allows on both sides: the owning account's Resource Policy + the calling account's Identity Policy. Same-account is a union, but cross-account is an intersection. Note that KMS is stricter — without explicit delegation in the key policy, no IAM policy strength gets through. For S3, if the Object Ownership setting is `BucketOwnerEnforced`, ACLs are disabled, making policy consolidation cleaner.

---

**문제 5.** What is ABAC's biggest advantage?

A) Policy count grows proportionally with user count
B) Dynamic access control via user/resource tags, with the policy count staying constant
C) Consolidating all permissions into a single Role
D) Automatically enabling MFA

**정답: B**
해설: ABAC is the NIST SP 800-162 standard model; it decides permissions by matching attributes like tags, so it scales without policy changes as users and projects grow. The downside is tagging consistency — missing tags mean missing permissions. Monitoring for absent tags with AWS Config Rules is the standard countermeasure. Bundling things via Service Catalog so "users can only create resources with tags force-applied" is another common governance pattern.

---

**문제 6.** A company uses the STS global endpoint (`sts.amazonaws.com`). What happens if us-east-1 has an outage?

A) No impact
B) Issuing new credentials for workloads in other regions may fail
C) All regions operate normally
D) STS never has outages

**정답: B**
해설: The global endpoint routes to us-east-1, so a us-east-1 outage can block new AssumeRole calls. During the 2017 us-east-1 S3 outage, STS actually wobbled too. The best practice is to explicitly use regional endpoints (`sts.ap-northeast-2.amazonaws.com`), enforceable via the SDK environment variable `AWS_STS_REGIONAL_ENDPOINTS=regional`. The same pattern exists for IAM (a global control plane): IAM changes (writing policies, creating users) are affected by us-east-1 outages, but verification of already-issued tokens (the data plane) is independent per region and survives.

---

**문제 7.** Which is correct regarding granting permissions on a KMS key?

A) An IAM policy alone is sufficient
B) The Key Policy must explicitly delegate authority for IAM policies to take effect
C) A Resource Policy alone is enough
D) An SCP alone is sufficient

**정답: B**
해설: KMS has the distinctive "key policy must allow" model. Without explicit delegation in the Key Policy, no matter how strong the IAM policy, the key can't be used. This is how KMS differs most from other services and a staple exam trap. Day 8 (KMS deep dive) covers this model in detail. The design is intentional — a separation-of-duties mechanism ensuring data encryption keys can't be carelessly opened by an IAM administrator's "management permissions" alone. It connects directly to the key management requirements of PCI-DSS and FIPS 140-2.
