# Day 2 - The Operator's Manual for IAM: Users, Groups, Roles, and the Policy Evaluation Algorithm

S3 403, Lambda InvalidPermission, ECR pull denied, SSM Session Manager AccessDenied, RDS Connect Failed. The one thing these errors — floating through the operator's Slack channel every day — have in common is that they are all, in the end, the result of IAM policy evaluation. For an operator, IAM is less a "permission-granting system" and more **"the decision engine that determines half of all daily incidents."** IAM is the single component that decides who can do what, where, and under which conditions — and when it goes wrong, either permissions are too broad and data leaks (Capital One), or too narrow and deployments get blocked (the classic Friday night).

Today we redraw IAM's four entities (User, Group, Role, Policy) from the operator's viewpoint, walk through the actual order in which the policy evaluation algorithm makes decisions, and lay out where to look when a denial occurs. This one algorithm diagram solves 70% of the exam's IAM questions.

## IAM's Four Entities: The Differences an Operator Sees

| Entity | Essence | When Operators Use It | Credential Lifetime |
|--------|------|------------------|---------------|
| **User** | Permanent credentials (access key + password) | When a human or automation script needs direct login | Unlimited (until manually rotated) |
| **Group** | A bundle of users + a policy attachment container | When grouping permissions by job function, not per person | N/A |
| **Role** | A temporary identity that issues short-lived credentials | Service-to-service calls, cross-account access, federation | STS temporary tokens (15 min - 12 hours) |
| **Policy** | A JSON document defining permissions | Expressed via Effect/Action/Resource/Condition | N/A |

The one operators use most is the **Role**. Issue Users only for individual humans (or replace them with IAM Identity Center), and handle EC2, Lambda, ECS Tasks, and cross-account trust entirely with Roles. The reasons are clear.

1. **Role credentials are temporary tokens issued by STS (default 1 hour, max 12 hours)** — even if leaked, they expire
2. **Roles are tracked in CloudTrail as `AssumedRole` events**, so who used which permissions and when is clear
3. **Roles carry no access key rotation burden** — access keys attached to Users must be rotated by the operator
4. **Roles can precisely restrict "who can assume this" via the Trust Policy**

> 📚 **Case study**: The September 2022 Uber hack. An 18-year-old hacker bombarded one Uber employee with MFA push notifications (an MFA fatigue attack), then posed as "the IT department" in a Slack DM to coax approval. Once the employee approved, the attacker gained VPN access and stole **PAM (Privileged Access Management) admin credentials** hardcoded in an internal PowerShell script. With those credentials, the attacker took over Uber's AWS, GCP, OneLogin, GSuite, and vSphere (screenshots leaked publicly). If those PAM credentials had been an **IAM Role + STS temporary tokens + enforced MFA condition + IP CIDR restriction** instead of an access key, the blast radius would have been far smaller. Operator lesson: **long-lived credentials are a liability, not an asset**. Another lesson: when one credential grants access to multiple systems, one compromised system becomes a full compromise.

> 🔍 **Deeper dive**: The temporary credentials issued by STS `AssumeRole` are a 3-piece set: **AccessKeyId (starting with ASIA) + SecretAccessKey + SessionToken**. The SessionToken is a JWT-like signed token that must be sent in the `X-Amz-Security-Token` header with AWS API calls. The expiry time is baked into the token, so clients cannot arbitrarily extend it (they must call AssumeRole again). Even if credentials leak, they're useless after expiry. In contrast, an IAM User's access key (starting with AKIA) is permanently valid — unless explicitly deactivated, it stays alive for 5 or 10 years. This difference is why GuardDuty raises a `CredentialAccess:IAMUser/AnomalousBehavior` finding when an ASIA-prefixed token is used from an anomalous IP.

## The Policy Evaluation Algorithm: The One Diagram That Explains Every Denial in Exams and Production

The question operators face most often is "why was it denied?" The IAM policy evaluation algorithm decides through the following 6 steps. This flow solves 70% of exam questions.

```
[1] Is there an explicit Deny?  ─Yes─→  Deny (done)
        │ No
        ▼
[2] Does the SCP (Service Control Policy) contain an Allow?  ─No─→  Deny (done)
        │ Yes
        ▼
[3] Does a resource-based policy contain an Allow?  ─Yes─→ (conditionally passes)
        │
        ▼
[4] Does an identity-based policy contain an Allow?  ─No─→  Deny (but passes if Allowed in step 3)
        │ Yes
        ▼
[5] If a Permission Boundary exists, does it Allow?  ─No─→  Deny
        │ Yes
        ▼
[6] If a Session Policy (attached at STS AssumeRole) exists, does it Allow?  ─No─→  Deny
        │ Yes
        ▼
   Allow ✅
```

Core principles:

- **An explicit Deny from anywhere is a final denial**: one Deny in an SCP, identity policy, resource policy, or boundary ends the evaluation
- **Implicit denial ≠ Deny**: a permission not mentioned in any policy is implicitly denied, but can be overridden by an Allow in another policy
- **A resource-based policy's Allow can pass without an identity policy**: if an S3 bucket policy grants Allow to another account, that account's user can access it even without permission in their own IAM (within the same account, usually either one suffices — except KMS, which requires both even within the same account)

> 💡 **Related theory**: IAM policy evaluation is essentially ABAC (Attribute-Based Access Control) with a **deny-overrides** model. Beyond the simple matrix of RBAC (Role-Based), it expresses conditional permission using attributes like `aws:RequestTag/Env`, `aws:PrincipalTag/Department`, `aws:SourceIp`, `aws:MultiFactorAuthAge`, and `aws:CurrentTime`. NIST SP 800-162 defines the standard ABAC model, and IAM's Condition block is its implementation. The reason evaluation proceeds SCP > identity > resource > boundary > session is to enforce the principle that **"permissions are constrained by organizational policy."** Academically, Sandhu et al. (1996, IEEE Computer) laid the foundation of RBAC with the RBAC96 model, and Hu et al. (2014, NIST SP 800-162) defined the ABAC standard.

> ⚠️ **Pitfall**: A frequent exam question: "An IAM user in one account wants to PUT an object into an S3 bucket in another account. What permissions are needed?" The answer is **both sides**. ① `s3:PutObject` allowed for the user in the caller's account, and ② `s3:PutObject` allowed for that user (or that account) in the target bucket's Bucket Policy. With only one of the two, it's denied. Additionally, if the bucket is KMS-encrypted, ③ `kms:GenerateDataKey` must also be allowed in the KMS key policy. So cross-account + KMS requires all three policies to pass.

> 🔍 **Deeper dive**: AWS uses a formal verification engine based on SMT (Satisfiability Modulo Theories) called **Zelkova** for policy analysis (Backes et al., 2018 CAV). Policies are converted to first-order logic formulas and solved mathematically with SMT solvers like Z3 to answer "for which input combinations does this policy produce Allow?" This engine is why Access Analyzer can tell you precisely that "this S3 bucket is exposed to an external account." It's not simple regex matching — it formally proves whether "among all possible call combinations, does any case produce an external Allow?"

## The 6 Kinds of Policies: Where They Attach and Who Creates Them

| Policy Type | Attaches To | Who Creates It | Operator Viewpoint |
|-----------|-----------|----------------|-------------|
| **Identity-based (Managed)** | User/Group/Role | AWS or customer | The most commonly used standard |
| **Identity-based (Inline)** | User/Group/Role 1:1 | Customer | One-off; deleted along with the entity |
| **Resource-based** | S3, Lambda, SNS, SQS, KMS, ECR, EFS, etc. | Resource owner | Essential for cross-account |
| **Permission Boundary** | User/Role | Delegated administration admin | Caps "the maximum permission of Roles developers create" |
| **SCP** | AWS Organizations OU/Account | Org admin | Guardrail across all accounts |
| **Session Policy** | Inline at STS AssumeRole call | Caller | Narrows the permissions of the issued temporary credentials |

What operators confuse most often is **Permission Boundary vs SCP**. Both set "permission ceilings," but they apply in different places.

- **SCP** applies to entire accounts/OUs — used by the Organizations administrator. SCPs also apply to the root account (except the management account)
- **Permission Boundary** applies to a specific User/Role — the guardrail for permission delegation. It restricts the effective permission of the user's policies to the intersection with the boundary

Also, **an SCP never creates an Allow**. Even if an SCP says `Allow *`, it's merely a whitelist of "these permissions are possible in the accounts of this OU." The actual permission grant happens in identity or resource policies. A common operator mistake: adding an Allow to an SCP and assuming "now the permission exists" — it doesn't work → you must add an identity policy.

> 🔍 **Deeper dive**: A common operator pattern is **delegating IAM Role creation to developers** while enforcing a permission boundary. For example, grant the developer group `iam:CreateRole`, but use an `iam:PutRolePermissionsBoundary` condition to force attachment of the company-standard boundary policy. Then the effective permission of any Role a developer creates is "the policies they attached ∩ the boundary policy," so even attaching AdministratorAccess only allows what the boundary permits. This is the standard pattern for "permission delegation + guardrails."

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["iam:CreateRole", "iam:PutRolePolicy"],
    "Resource": "*",
    "Condition": {
      "StringEquals": {
        "iam:PermissionsBoundary": "arn:aws:iam::123456789012:policy/DeveloperBoundary"
      }
    }
  }]
}
```

## The IAM Debugging Pattern Operators Encounter Daily

An S3 403 just appeared. Where do you look first? Operators follow this order.

```
[Step 1] Find the failed call in CloudTrail
        - eventName: GetObject, PutObject, etc.
        - errorCode: AccessDenied
        - errorMessage: "User: arn:aws:sts::... is not authorized to perform..."
        - Check bucket and key in requestParameters
        - Verify the caller's identity via userIdentity (User? AssumedRole? FederatedUser?)

[Step 2] Is the caller an IAM User or an AssumedRole?
        - If a User, check directly attached policies + group policies
        - If a Role, trace who assumed it via RoleSessionName
        - Check the original Role ARN in sessionIssuer

[Step 3] Simulate with the IAM Policy Simulator
        - Evaluate with caller + Action + Resource
        - It shows which policy denied
        - Use Service Last Accessed data to check "was this permission actually used?"

[Step 4] Check cross-account exposure with Access Analyzer
        - Verify there is no unintended external exposure
        - Use policy validation to check policy syntax and security

[Step 5] If still unclear, read the errorMessage in the CloudTrail event detail carefully
        - Since 2023, AWS states "which policy denied" in the message
```

> 📚 **Case study**: A production EC2 instance suddenly gets 403 on S3 PutObject. The operator checks CloudTrail: the caller is `AssumedRole/EC2-S3Role/i-0abc...`. The identity policy shows `s3:PutObject Allow`. The Bucket Policy allows it too. The SCP passes. Yet it's denied. The reason: **the bucket had SSE-KMS encryption enabled, and the KMS key's Key Policy did not include the EC2 Role**. To encrypt with a KMS key on S3 PUT, the caller needs `kms:GenerateDataKey`, and that permission must be allowed in both the Key Policy and the IAM Policy (KMS requires both even when it's not cross-account). This is a trap operators easily fall into when checking only the IAM policy. Moreover, KMS denial events are logged separately in CloudTrail, so you must check the KMS trail as well.

> ⚠️ **Pitfall**: errorCode `AccessDenied` doesn't automatically mean an IAM problem. If S3 Block Public Access is enabled on the bucket, even a public policy gets overridden — BPA blocks first and returns 403. If an SCP denies, an IAM Allow still gets denied. Resources shared via RAM can be denied when the owner changes permissions, and so on. To pinpoint the source of the denial, read the `errorMessage` text in CloudTrail verbatim.

## The 3 Core STS APIs

STS APIs operators must know:

| API | Purpose | Operator Viewpoint |
|-----|------|-------------|
| `AssumeRole` | Assume a Role in the same or a different account | Cross-account access, EC2/Lambda Roles |
| `AssumeRoleWithSAML` | Assume via a SAML 2.0 IdP | AD FS, Okta SAML federation |
| `AssumeRoleWithWebIdentity` | Assume via an OIDC IdP | Cognito, GitHub Actions OIDC, EKS IRSA |

Embedding access keys in GitHub secrets used to be the standard for deploying to AWS from GitHub Actions, but switching to **OIDC federation** eliminates the access key entirely. AWS STS validates the OIDC token issued by GitHub and issues temporary credentials. This has been GitHub Actions' recommended pattern since 2022, and AWS officially recommended it at re:Invent 2023 as well.

```yaml
# GitHub Actions OIDC example
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/GitHubActionsDeploy
    aws-region: ap-northeast-2
    role-session-name: ${{ github.actor }}-${{ github.run_id }}
```

The IAM Role's Trust Policy should then be narrowed down to the GitHub repo + branch, like this:

```json
{
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    },
    "StringLike": {
      "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:ref:refs/heads/main"
    }
  }
}
```

> 🔍 **Deeper dive**: EKS IRSA (IAM Roles for Service Accounts) is the same mechanism. The EKS cluster acts as an OIDC provider, and Pods assume the IAM Role mapped to a Kubernetes ServiceAccount. The Pod reads the OIDC JWT from the token mount path (`/var/run/secrets/eks.amazonaws.com/serviceaccount/token`) and obtains credentials via `AssumeRoleWithWebIdentity`. The AWS SDK handles this flow automatically (the `webIdentityTokenFile` environment variable). Since 2023 there is also a simpler mechanism called **Pod Identity**, which uses the EKS Pod Identity Agent instead of OIDC to provide credentials via an IMDS-like interface. IRSA is cluster-OIDC federation, Pod Identity is EKS-native — the two can coexist.

## 10 IAM Best Practices Operators Must Know

1. **Never use the root account for daily work**: enforce MFA, delete access keys, use it only 1-2 times a year for billing or account closure
2. **MFA required for every IAM User**: enforce in policy with the Condition `aws:MultiFactorAuthPresent: true`
3. **Humans use IAM Identity Center, machines use IAM Roles**: creating Users directly is a last resort
4. **Rotate access keys every 90 days**: verify via the Credential Report, Config rule `access-keys-rotated`
5. **Least privilege for all permissions**: AdministratorAccess only for emergencies; separate by job function normally. Identify unused permissions with IAM Access Advisor's "Service Last Accessed"
6. **Delegate with Permission Boundaries**: cap the permissions of Roles developers create
7. **CloudTrail in all regions + Log File Validation enabled**: tamper detection
8. **Auto-detect external exposure with Access Analyzer**: enable at the Organization level
9. **Deactivate unused credentials after 90 days** (use Last Accessed data)
10. **Enforce STS regional endpoints**: block forced us-east-1 calls with the `aws:UseRegion` condition. Set `AWS_STS_REGIONAL_ENDPOINTS=regional` in the SDK

> ⚠️ **Pitfall**: The misconception that "storing an IAM User's access key in a secrets manager makes it safe." Secrets Manager can rotate the access key itself (via its Lambda rotation feature), but if the key leaks, it remains valid until rotation. **The very existence of a long-lived credential is an attack surface.** The answer is to not create access keys at all — replace them with Roles + STS. In 2024, AWS started showing a console warning when creating IAM User access keys, and IAM Identity Center became the de facto standard.

> 💡 **Related theory**: The difficulty of debugging such distributed permission evaluation is known as the **policy explosion** problem. Since the RBAC96 model of Sandhu et al. (1996, IEEE Computer), various models have emerged — ABAC, ReBAC (Relationship-Based, Zanzibar) — but in any model, as the number of policies grows, tracing evaluation results becomes explosively harder. AWS built Access Analyzer (the Zelkova engine) to solve this. Google solved the same problem with Zanzibar (2019 USENIX ATC), and Microsoft Azure with RBAC + ABAC condition expressions.

## Wrapping Up

The policy evaluation algorithm we covered today solves 70% of SOA-C02 IAM questions. The essence is simple.

- **Deny wins** (no matter where it comes from)
- **There must be at least one Allow** (in either an identity or a resource policy)
- **Cross-account requires Allow on both sides**
- **Boundaries and SCPs are ceilings — they never add Allows**
- **STS means temporary credentials — no rotation burden of permanent access keys**

Tomorrow we build on this with deeper tools — Identity Center federation, ABAC patterns, and permission debugging.

---

## 📝 연습 문제

**문제 1.** An IAM user in account A wants to PutObject into an S3 bucket in account B. What permission configuration is needed?

A) Only an `s3:PutObject` Allow in the identity policy of account A's user
B) Only an Allow for account A's user in the Bucket Policy of account B's bucket
C) Both — an Allow in account A's user identity policy + an Allow in account B's bucket policy
D) Create an IAM Role in account A and have account B AssumeRole it

**정답: C**
해설: Cross-account access requires an Allow on both sides: the caller's identity policy and the target's resource policy. With only one side, it's denied. Within the same account, either an identity policy or a resource policy alone is usually sufficient, but the KMS key policy is an exception requiring both even within the same account. If the bucket uses SSE-KMS, `kms:GenerateDataKey` must additionally be granted in the KMS key policy.

---

**문제 2.** An operator wants to delegate IAM Role creation to developers while limiting the maximum permissions those Roles can have. What is the most suitable tool?

A) SCP
B) Permission Boundary
C) Session Policy
D) Inline Policy

**정답: B**
해설: A Permission Boundary is a permission ceiling applied at the User/Role level. An SCP applies at the account/OU level — a much larger scope. The operator grants the developer group `iam:CreateRole` but forces attachment of the company-standard boundary via an `iam:PermissionsBoundary` Condition; then the effective permission of Roles developers create is limited to their policy ∩ the boundary. A Session Policy applies only to credentials issued temporarily during an STS AssumeRole call.

---

**문제 3.** An EC2 instance's IAM Role has `s3:PutObject Allow`, but PUTs to a KMS-encrypted bucket return AccessDenied. What is the most likely cause?

A) The bucket policy lacks PutObject
B) The KMS key policy lacks the EC2 Role's `kms:GenerateDataKey` permission
C) IMDSv2 is disabled on the EC2 instance
D) The S3 SSE algorithm is misconfigured

**정답: B**
해설: To PUT a KMS-encrypted object, the caller needs `kms:GenerateDataKey`; to GET, `kms:Decrypt`. That permission must be allowed in both the IAM Policy and the KMS Key Policy. Even if IAM passes, absence from the Key Policy means denial. One of the traps operators stumble into most often. CloudTrail logs `kms:GenerateDataKey` AccessDenied events separately, so check those logs too.

---

**문제 4.** An operator wants to use OIDC federation instead of embedding access keys in GitHub Secrets when deploying from GitHub Actions to AWS. Which STS API is used?

A) AssumeRole
B) AssumeRoleWithSAML
C) AssumeRoleWithWebIdentity
D) GetSessionToken

**정답: C**
해설: GitHub Actions operates as an OIDC IdP, so it calls `AssumeRoleWithWebIdentity`. AWS STS validates the OIDC token issued by GitHub and issues temporary credentials. AssumeRoleWithSAML is for AD FS/Okta SAML federation; AssumeRole is IAM-credential based. The Trust Policy should specify GitHub's OIDC provider ARN and the repo/branch sub claim.

---

**문제 5.** In IAM policy evaluation, why does an explicit Deny always result in denial regardless of where it comes from?

A) Because AWS's policy evaluation algorithm follows the deny-overrides model
B) Because Deny only occurs in SCPs
C) Because Permission Boundaries automatically prioritize Deny
D) Because IAM is an RBAC model

**정답: A**
해설: IAM policy evaluation is essentially an ABAC implementation with a deny-overrides model. A single explicit Deny at any layer (SCP, identity, resource, boundary, session) makes the final result a denial. This principle guarantees the safety of permission design.

---

**문제 6.** An operator wants the SDK to fetch the IAM Role credentials of an EC2 instance. Where do they come from?

A) The /etc/aws/credentials file
B) IMDS (http://169.254.169.254/latest/meta-data/iam/security-credentials/)
C) The AWS_ACCESS_KEY_ID environment variable
D) The STS GetSessionToken API

**정답: B**
해설: Temporary credentials for the IAM Role attached to an EC2 instance profile come from IMDS. The AWS SDK automatically polls IMDS and refreshes credentials (by default, 6 hours before expiry). With IMDSv2, a session token must first be obtained via PUT. Role credentials are issued by STS, but GetSessionToken is for IAM Users. From the EC2 side, the IMDS path is the standard.
