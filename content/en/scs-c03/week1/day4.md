# Day 4 - STS and Temporary Credentials: AssumeRole, Federation, Role Chaining, Confused Deputy Prevention

For the past four days, we've repeated "use Role and its temporary credentials, not IAM User's long-term access key." Today we dive into **how** that Role is "assumed" — the mechanism of STS (Security Token Service) that issues credentials, how external identities (federation) exchange for AWS credentials, and why cross-account delegation demands blocking the Confused Deputy attack. The deepest differentiation in SCS-C03's Domain 4 lies here — AssumeRole trust relationships, role chaining constraints, and mandatory Confused Deputy prevention.

Core one-liner first: **STS issues expiring temporary credentials (AccessKeyId + SecretAccessKey + SessionToken), and "who can assume this role" is decided by the role's trust policy.**

## What STS Issues: Three Types of Temporary Credentials

Long-term IAM User credentials are 2 keys (AccessKeyId, SecretAccessKey), but STS temporary credentials are **3**.

| Component | Role |
|------|------|
| AccessKeyId | Identifier |
| SecretAccessKey | Signing key |
| **SessionToken** | Temporary session proof (doesn't exist in long-term keys) |

These credentials have an **expiration time**. AssumeRole defaults to 1 hour, maximum 12 hours (within role's `MaxSessionDuration`). After expiration, you must get new ones. **Even if exposed, damage is time-limited** — the fundamental reason temporary credentials are safer than long-term keys.

Key STS APIs:

| API | Purpose |
|-----|------|
| `AssumeRole` | Assume an IAM Role in same/different account (most common) |
| `AssumeRoleWithSAML` | SAML 2.0 IdP federation (e.g., AD FS, Okta) |
| `AssumeRoleWithWebIdentity` | OIDC federation (e.g., Cognito, Google, GitHub Actions) |
| `GetSessionToken` | MFA-applied temporary credentials (IAM User) |
| `GetFederationToken` | Legacy federation |

> 💡 **Related Theory**: EC2 instance profiles, Lambda execution roles, ECS task roles all internally use STS AssumeRole. For EC2, the instance metadata service (IMDS) auto-issues and refreshes temporary credentials. No need to embed keys in code. **IMDSv2 (token-based)** must be enforced to block SSRF attacks that steal metadata — a classic exam topic and was central to the Capital One incident.

## AssumeRole: Two Axes of Trust and Permission Policies

A Role holds **two policies**. This distinction is the most confusing in IAM.

- **Trust policy**: "**Who** can assume this role" (`sts:AssumeRole` permissible targets). Contains Principal = resource-based policy.
- **Permission policy**: "**What** this role can do once assumed." Identity-based policy.

```json
// Trust policy: principals in account 111122223333 can assume this role
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::111122223333:root"},
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {"sts:ExternalId": "unique-secret-2026"},
      "Bool": {"aws:MultiFactorAuthPresent": "true"}
    }
  }]
}
```

Cross-account AssumeRole succeeds only when **both align**:

1. **Target role's trust policy** permits the calling account/principal as Principal
2. **Calling side's identity policy** has `sts:AssumeRole` Allow (target role ARN specified)

> ⚠️ **Trap**: Using `"arn:aws:iam::111122223333:root"` in trust policy Principal means "**entire account 111122223333** can assume this role" — not just the root user. However, practically, only principals in that account holding `sts:AssumeRole` permission can assume it (condition 2). The intuition "root Principal is risky" is half right — account delegation is normal, but internal permission control is that account's responsibility.

## Federation: Converting External Identity to AWS Credentials

Without creating IAM Users, accessing AWS via corporate directory (AD) or social/OIDC identity is federation.

### SAML 2.0 Federation (Enterprise Workforce)

```
[ SAML Federation Flow ]

  User → Enterprise IdP(AD FS/Okta) login
       → IdP issues SAML assertion(role ARN included)
       → AWS STS AssumeRoleWithSAML
       → Temporary credentials issued
       → Access AWS resources
```

Today's recommended approach: **IAM Identity Center (formerly AWS SSO)**. Define permission sets in multi-account environments, integrate with external IdPs (Okta, Entra ID, etc.), and users get temporary credentials across multiple accounts and roles via single login. Eliminates the anti-pattern of creating IAM Users per account.

### OIDC / Web Identity Federation (Apps·CI/CD)

Mobile apps (Cognito), GitHub Actions, Kubernetes (EKS IRSA) use OIDC for `AssumeRoleWithWebIdentity`. Particularly **GitHub Actions OIDC** matters in both exam and practice — instead of embedding long-lived access key in GitHub secrets, GitHub's OIDC token assumes a role, eliminating key exposure risk.

> 🔍 **Deep Dive**: GitHub Actions OIDC trust policy sets `token.actions.githubusercontent.com` as OIDC provider, and Condition limits with `token.actions.githubusercontent.com:sub` to **specific repo·branch only**. Loose conditions like `repo:org/*` let any org repo assume the role — risky. Tighten to `repo:org/repo:ref:refs/heads/main`. EKS IRSA uses the same OIDC principle, mapping pods to roles.

## Role Chaining (Role Chaining) and Constraints

**Assuming another role while already in one role** is role chaining. Account A → assume role X → assume role Y with role X credentials.

Two key constraints in exams:

1. **Chained session max time is fixed at 1 hour**. Even if role X's `MaxSessionDuration` is 12 hours, a chained session tops at 1 hour.
2. Chained sessions can't invoke certain calls like `GetSessionToken`.

> 💡 **Related Theory**: Role chaining obscures permission tracking and is generally avoided. Prefer **session policy** or direct AssumeRole. However, "hub account role → spoke account access" pattern in cross-account is legitimate chaining. Traceability is supplemented by CloudTrail's `assumedRole` session name (set `sts:RoleSessionName` meaningfully).

## Confused Deputy Prevention: ExternalId and aws:SourceArn

Today's security core. **Confused Deputy (confused intermediary)** is when an authorized principal (intermediary) is tricked into using permissions on behalf of a third party.

### Scenario: Third-party SaaS Cross-Account Access

Say monitoring SaaS (e.g., Datadog) AssumeRoles into your account. SaaS uses the **same SaaS account** for all customers. If trust policy only checks "SaaS account, allow," a malicious user could impersonate your account ID to SaaS and gain your resources.

Solution: **ExternalId** — SaaS issues you a unique secret that you embed in the trust policy's Condition.

```json
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::SAAS-ACCOUNT-ID:root"},
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": {"sts:ExternalId": "your-unique-external-id-xyz"}
  }
}
```

SaaS passes this ExternalId when assuming your role; customers' ExternalIds won't work. Isolation is guaranteed.

### When AWS Service is the Intermediary: aws:SourceArn / aws:SourceAccount

When a service principal (e.g., CloudWatch, S3, SNS) uses your role or resource, the same attack is possible. Use `aws:SourceArn` (or `aws:SourceAccount`) to enforce "only this specific resource triggers this."

```json
{
  "Effect": "Allow",
  "Principal": {"Service": "sns.amazonaws.com"},
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": {"aws:SourceAccount": "111122223333"},
    "ArnLike": {"aws:SourceArn": "arn:aws:sns:us-east-1:111122223333:my-topic"}
  }
}
```

> 🎯 **Scenario**: "Third-party backup vendor needs cross-account S3 access." Answer pattern: ① never give vendor IAM User access keys (absolute ban) ② create IAM Role + trust policy with vendor account + **ExternalId** ③ permission policy restricted to needed buckets/Actions (least privilege). Without ExternalId, another vendor customer using the same vendor could access our resources — Confused Deputy hole. This pattern applies uniformly to Datadog, New Relic, PagerDuty, all third-party integrations.

> ⚠️ **Trap**: ExternalId isn't a "password" — even if guessable, it blocks the attack. The key is **customer doesn't set ExternalId; vendor issues it**. Customer-set IDs could collide with others or be predictable, breaking isolation. Trap answer: "Customer freely sets ExternalId" — wrong.

## AssumeRole as CLI

```bash
# Assume role — returns 3 credential types
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/CrossAccountReadRole \
  --role-session-name security-audit-2026 \
  --external-id your-unique-external-id-xyz \
  --duration-seconds 3600

# Use returned credentials for subsequent calls (after env vars set)
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...   # SessionToken mandatory for temp credentials
aws sts get-caller-identity    # Verify who you are now
```

> 📚 **Case Study**: The 2019 Capital One incident's essence: ① WAF (SSRF defense insufficient) ② **IMDSv1 let EC2 temp credentials be stolen** ③ those credentials accessed S3. Temporary credentials are safe, but **the path to steal them (SSRF → IMDS)** being open neutralizes that. Hence IMDSv2 enforcement + least-privilege instance role + WAF bundle in exam. Temporary credentials are "exposure damage is time-limited," but blocking exposure paths is separate.

## Summary — Temporary Credentials Are Security Default

Three essentials today. First, **STS issues expiring temporary credentials (with SessionToken)**, and EC2/Lambda/ECS/federation all run on this — replace long-key code/CI anti-patterns with OIDC and instance roles. Second, AssumeRole is **two axes: trust policy (who) and permission policy (what)** — cross-account needs both sides allowing. Third, cross-account delegation **must block Confused Deputy via ExternalId (third-party) or aws:SourceArn (AWS service)**.

Tomorrow closes Week 1 with integrated scenarios. "Why is access denied despite having permissions," "safely delegate to third parties," "convert long-term keys to temporary credentials" — real-world problems synthesizing everything Week 1 taught. We cement this week's IAM thinking framework.

---

## 📝 Practice Questions

**Question 1.** What is the most fundamental reason STS temporary credentials are more secure than long-lived IAM user access keys?

A) They are longer random strings and therefore impossible to guess  
B) They have an expiration time, so even if exposed the damage is bounded in time  
C) They are transmitted encrypted  
D) They can only be issued from the root account  

**Answer: B**  
Explanation: Temporary credentials have an expiration (1 hour by default for AssumeRole, 12 hours maximum), so even if stolen they become useless after the validity period, bounding the damage in time. Length and transport encryption are not fundamental differences from long-lived keys, and temporary credentials are not root-only — every principal that assumes a role receives them.

---

**Question 2.** A third-party monitoring SaaS uses the same SaaS account to AssumeRole into many customers' AWS accounts. What is the key mechanism that stops one customer from assuming another customer's role through the SaaS?

A) Setting the trust policy's Principal to root  
B) Specifying in the trust policy's Condition an `sts:ExternalId` that the third party issues per customer  
C) Putting an ExternalId chosen arbitrarily by the customer into the trust policy  
D) Issuing an IAM user access key and handing it to the SaaS  

**Answer: B**  
Explanation: The ExternalId pins a value that the third party issues uniquely per customer into the trust policy condition, blocking the Confused Deputy attack. If the customer picks it arbitrarily, collisions or predictability can break the isolation, so the third party must be the issuer. Setting a root Principal alone does not isolate customers from each other, and issuing an access key creates the bigger risk of exposing long-lived credentials.

---

**Question 3.** Which statement about role chaining (assuming another role while already in an assumed role) is correct?

A) A chained session inherits the original role's MaxSessionDuration and can last up to 12 hours  
B) When chaining, the maximum session duration is limited to 1 hour  
C) Chaining simplifies permission tracing, so it is always recommended  
D) Chaining does not require a trust policy  

**Answer: B**  
Explanation: The maximum duration of a session issued through role chaining is fixed at 1 hour; the original role's longer MaxSessionDuration does not apply. Chaining actually obscures permission tracing, so it is best avoided where possible, and — as with every AssumeRole — the target role's trust policy must allow it.

---

**Question 4.** When configuring GitHub Actions to assume an AWS role without long-lived access keys, which trust policy setting matters most for security?

A) Set the `sub` condition to `repo:org/*` so every repo in the organization can assume the role  
B) Narrow the `sub` condition to a specific repo and branch, such as `repo:org/repo:ref:refs/heads/main`  
C) Set the Principal to `*` so that any OIDC token is accepted  
D) Skip the trust policy and just make the permission policy broad  

**Answer: B**  
Explanation: In OIDC federation you must narrow the `token.actions.githubusercontent.com:sub` condition to a specific repo and branch so that only that workflow can assume the role. `repo:org/*` or a Principal of `*` opens a path for any repo or token in the organization to hijack the role, and broadening permissions without a trust policy lets anyone assume it.

---

**Question 5.** Which control should you apply most directly to prevent an incident where temporary credentials granted to an EC2 instance are stolen through an SSRF attack?

A) Grant AdministratorAccess to the EC2 instance role to simplify operations  
B) Enforce IMDSv2 (the token-based metadata service) and apply least privilege to the instance role  
C) Store long-lived IAM user access keys directly on the EC2 instance  
D) Extend the expiration of the temporary credentials to 12 hours  

**Answer: B**  
Explanation: IMDSv2 requires a session token, which makes stealing metadata and temporary credentials via SSRF far harder, and least privilege on the instance role limits the blast radius even if they are stolen. Granting admin enlarges the blast radius, storing long-lived keys is more dangerous still, and extending the expiration only lengthens the validity of stolen credentials, increasing the risk.

---
