# Day 4 - STS and Temporary Credentials: AssumeRole, Federation, Role Chaining, Confused Deputy Prevention

Over the past three days we kept repeating "don't use long-term credentials (IAM user access keys) — use roles." Today we dig into how a role is actually "assumed": what STS (Security Token Service), the mechanism behind it, issues, and how external identities (federation) are exchanged for AWS credentials. This is where Domain 4 of SCS-C03 differentiates most deeply — the trust relationship of AssumeRole, the constraints of role chaining, and the Confused Deputy attack that must be blocked in cross-account delegation.

The key sentence first: **STS issues expiring temporary credentials (AccessKeyId + SecretAccessKey + SessionToken), and "who may assume this role" is decided by the role's trust policy.**

## What STS Issues: Three Temporary Credential Components

Long-term IAM user credentials consist of two keys (AccessKeyId, SecretAccessKey), but STS temporary credentials consist of **three**.

| Component | Role |
|------|------|
| AccessKeyId | Identifier |
| SecretAccessKey | Signing key |
| **SessionToken** | Temporary session proof (absent from long-term keys) |

These credentials have an **expiration time**. AssumeRole defaults to 1 hour, with a maximum of 12 hours (within the role's `MaxSessionDuration`). Once expired, they must be reissued. **Even if exposed, the damage is bounded in time** — this is the fundamental reason they are safer than long-term keys.

Key STS APIs:

| API | Purpose |
|-----|------|
| `AssumeRole` | Assume an IAM role in the same or another account (most common) |
| `AssumeRoleWithSAML` | Federation with a SAML 2.0 IdP (e.g., AD FS, Okta) |
| `AssumeRoleWithWebIdentity` | OIDC federation (e.g., Cognito, Google, GitHub Actions) |
| `GetSessionToken` | MFA-backed temporary credentials (for IAM users) |
| `GetFederationToken` | Legacy federation |

> 💡 **Related theory**: EC2 instance profiles, Lambda execution roles, and ECS task roles are all STS AssumeRole under the hood. For EC2, the Instance Metadata Service (IMDS) automatically issues and refreshes the temporary credentials — which is why no keys ever need to go into code. Enforcing **IMDSv2 (token-based)** is what blocks metadata theft via SSRF (the core vector of the Capital One incident) — a perennial exam topic.

## AssumeRole: The Two Axes of Trust Policy and Permission Policy

A role has **two policies**. This distinction is the most confusing point in IAM.

- **Trust policy**: "**Who** may assume this role" (the parties allowed `sts:AssumeRole`). Contains a Principal = resource-based policy.
- **Permission policy**: "Once this role is assumed, **what** can be done." Identity-based policy.

```json
// Trust policy: principals in account 111122223333 may assume this role
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

For a cross-account AssumeRole to succeed, **both sides** must line up.

1. The **target role's trust policy** allows the calling account/principal as Principal
2. The **caller's identity policy** contains an `sts:AssumeRole` Allow (specifying the target role ARN)

> ⚠️ **Pitfall**: Writing `"arn:aws:iam::111122223333:root"` in the trust policy's Principal means "the **entire** account 111122223333 may assume the role," not just the root user. However, in practice only principals within that account who have been granted `sts:AssumeRole` can actually assume it (condition 2). The intuition that "using root as Principal is dangerous" is only half right — account-level delegation is a normal pattern, but permission control inside that account is entrusted to that account.

## Federation: Turning External Identities into AWS Credentials

Federation means accessing AWS with a corporate directory (AD) or social/OIDC identity without creating IAM users.

### SAML 2.0 Federation (Corporate Workforce)

```
[ SAML federation flow ]

  User → signs in to corporate IdP (AD FS/Okta)
       → IdP issues SAML assertion (containing role ARN)
       → AWS STS AssumeRoleWithSAML
       → Temporary credentials issued
       → Access AWS resources
```

The recommended approach today is **IAM Identity Center (formerly AWS SSO)**. In multi-account environments, you define permission sets, integrate with an external IdP (Okta, Entra ID, etc.), and after a single sign-in users access multiple accounts and roles with temporary credentials. It eliminates the anti-pattern of creating IAM users in every account.

### OIDC / Web Identity Federation (Apps and CI/CD)

Mobile apps (Cognito), GitHub Actions, Kubernetes (EKS IRSA), and the like use OIDC with `AssumeRoleWithWebIdentity`. **GitHub Actions OIDC** in particular matters for both the exam and real work — instead of putting long-term access keys into GitHub secrets, you assume a role with GitHub's OIDC token, eliminating key exposure risk.

> 🔍 **Going deeper**: The trust policy for GitHub Actions OIDC uses `token.actions.githubusercontent.com` as the OIDC provider and, in the Condition, allows **only specific repos and branches** via `token.actions.githubusercontent.com:sub`. Leaving this sub condition loose, like `repo:org/*`, lets any repo in the organization assume the role — dangerous. Narrow it like `repo:org/repo:ref:refs/heads/main`. EKS IRSA maps roles to pods using the same OIDC principle.

## Role Chaining and Its Constraints

Role chaining is assuming **yet another role** while already operating under an assumed role: Account A → assume Role X → use Role X to assume Role Y.

Two key constraints appear on the exam.

1. **The maximum session duration when chaining is fixed at 1 hour.** Even if Role X's `MaxSessionDuration` is 12 hours, a session obtained through chaining is capped at 1 hour.
2. Some calls, such as `GetSessionToken`, are restricted from a chained session.

> 💡 **Related theory**: Role chaining can blur permission traceability, so avoid it where possible. Prefer **session policies** or direct AssumeRole instead. That said, the cross-account pattern of "reaching a spoke account through a hub account's role" is legitimate chaining. Traceability is supplemented via the `assumedRole` session name in CloudTrail (set `sts:RoleSessionName` to something meaningful).

## Confused Deputy Prevention: ExternalId and aws:SourceArn

Today's security centerpiece. A **Confused Deputy** attack tricks a privileged party (the deputy) into exercising its privileges on behalf of a third party.

### Scenario: Cross-Account Access by a Third-Party SaaS

Suppose a monitoring SaaS (e.g., Datadog) accesses your account via AssumeRole. The SaaS assumes roles for **every customer** from the same SaaS account. If the trust policy only checks "allow if it's the SaaS account," a malicious user could spoof their account ID as yours and get the SaaS to access your resources.

The remedy is **ExternalId** — a unique secret the SaaS issued only to you, embedded in the trust policy's Condition.

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

The SaaS passes this ExternalId when assuming your role, and it cannot assume your role using another customer's ExternalId. Isolation between customers is guaranteed.

### When an AWS Service Is the Deputy: aws:SourceArn / aws:SourceAccount

The same attack is possible when a service principal (e.g., CloudWatch, S3, SNS) uses your role or resource. Here you enforce "allow only calls triggered by this specific resource" with `aws:SourceArn` (or `aws:SourceAccount`).

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

> 🎯 **Scenario**: "We need to create a cross-account role granting a third-party backup vendor access to our S3." The correct pattern is: ① do not hand the vendor IAM user access keys (absolutely forbidden), ② IAM role + trust policy specifying the vendor account plus an **ExternalId**, ③ a permission policy limited to only the needed buckets and Actions (least privilege). Without an ExternalId, a Confused Deputy hole remains through which another customer of the same vendor could access your resources. This pattern is identical for every third-party integration — Datadog, New Relic, PagerDuty, and the rest.

> ⚠️ **Pitfall**: An ExternalId is not a "password" — it blocks the attack even if guessable. The crux is that **the third party issues the ExternalId; the customer does not choose it themselves**. If customers picked it arbitrarily, collisions with other customers or predictability would break the isolation. On the exam, an answer choice saying "the customer freely sets the ExternalId" is a trap.

## AssumeRole Through the CLI

```bash
# Assume the role — returns the three temporary credential components
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/CrossAccountReadRole \
  --role-session-name security-audit-2026 \
  --external-id your-unique-external-id-xyz \
  --duration-seconds 3600

# Make subsequent calls with the returned credentials (after setting environment variables)
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...   # SessionToken is required for temporary credentials
aws sts get-caller-identity    # Verify whose identity you are acting under
```

> 📚 **Case study**: The essence of the 2019 Capital One incident was: ① WAF (inadequate SSRF defense), ② **theft of EC2's temporary credentials via IMDSv1**, ③ S3 access with those credentials. Temporary credentials are themselves a safeguard, but they are neutralized if **the path to steal them (SSRF → IMDS)** is left open. That is why IMDSv2 enforcement + least-privilege instance roles + WAF appear on the exam as one bundle. Temporary credentials are only the "time-limited if exposed" line of defense; closing the exposure path is a separate control.

## Wrapping Up — Temporary Credentials as the Security Default

Today's three takeaways. First, **STS issues expiring temporary credentials (including a SessionToken)**, and EC2/Lambda/ECS/federation all operate on top of them — replace the anti-pattern of putting long-term keys into code or CI with OIDC and instance roles. Second, AssumeRole runs on the two axes of **trust policy (who) and permission policy (what)**, and cross-account requires both sides to allow. Third, in cross-account delegation you must block **Confused Deputy with ExternalId (third parties) and aws:SourceArn (AWS services)**.

Tomorrow, wrapping up Week 1, we weave the IAM, STS, and policy evaluation learned so far into integrated scenarios. Through hands-on problems like "I have the permission — why is it denied," "delegate permissions to a third party safely," and "convert long-term keys to temporary credentials," we solidify Week 1's thinking framework.

---

## 📝 연습 문제

**문제 1.** What is the most fundamental reason STS temporary credentials are more secure than long-term IAM user access keys?

A) They are longer random strings and therefore impossible to guess  
B) They have an expiration time, so even if exposed the damage is bounded in time  
C) They are transmitted encrypted  
D) They can only be issued from the root account  

**정답: B**  
해설: Temporary credentials have an expiration (AssumeRole defaults to 1 hour, max 12 hours), so even if stolen they become useless after the validity window, bounding the exposure damage in time. Length and transport encryption are not fundamental differences from long-term keys, and temporary credentials are not root-only — every principal that assumes a role receives them.

---

**문제 2.** A third-party monitoring SaaS accesses multiple customers' AWS accounts via AssumeRole from the same SaaS account. What is the key mechanism that isolates one customer's role from being assumed on behalf of another customer through the SaaS?

A) Specifying root as the Principal in the trust policy  
B) Specifying the `sts:ExternalId` that the third party issued per customer in the trust policy's Condition  
C) Putting a customer-chosen arbitrary ExternalId in the trust policy  
D) Issuing IAM user access keys to the SaaS  

**정답: B**  
해설: The ExternalId is a value the third party issues uniquely per customer; embedding it in the trust policy condition blocks Confused Deputy attacks. If the customer picks it arbitrarily, collisions or predictability can break the isolation, so the issuer must be the third party; specifying a root Principal alone does not isolate customers; and issuing access keys creates the larger risk of long-term credential exposure.

---

**문제 3.** Which statement about role chaining (assuming another role while already under an assumed role) is correct?

A) A chained session inherits the original role's MaxSessionDuration and can last up to 12 hours  
B) When chaining, the maximum session duration is limited to 1 hour  
C) Chaining simplifies permission traceability and is therefore always recommended  
D) Chaining does not require a trust policy  

**정답: B**  
해설: The maximum duration of a session issued via role chaining is fixed at 1 hour; the original role's longer MaxSessionDuration does not apply. Chaining actually blurs permission traceability and should be avoided where possible, and like every AssumeRole it absolutely requires the target role's trust policy to allow it.

---

**문제 4.** When configuring GitHub Actions to assume an AWS role without long-term access keys, what is the most security-critical trust policy setting?

A) Set the `sub` condition to `repo:org/*` so every repo in the organization can assume the role  
B) Narrow the `sub` condition to a specific repo and branch, like `repo:org/repo:ref:refs/heads/main`  
C) Set the Principal to `*` to accept any OIDC token  
D) Skip the trust policy and just configure a broad permission policy  

**정답: B**  
해설: In OIDC federation, narrowing the `token.actions.githubusercontent.com:sub` condition to a specific repo and branch ensures only that workflow can assume the role, which is safe. `repo:org/*` or a `*` Principal opens a path for any repo or token in the organization to hijack the role, and widening permissions without a trust policy would let anyone assume the role.

---

**문제 5.** To prevent an incident where the temporary credentials granted to an EC2 instance are stolen via an SSRF attack, which control should be applied most directly?

A) Grant the EC2 instance role AdministratorAccess to simplify operations  
B) Enforce IMDSv2 (the token-based metadata service) and apply least privilege to the instance role  
C) Store long-term IAM user access keys directly on the EC2 instance  
D) Extend the temporary credentials' expiration to 12 hours  

**정답: B**  
해설: IMDSv2 requires a session token, making metadata and temporary-credential theft via SSRF far harder, and least privilege on the instance role reduces the blast radius even if theft occurs. Granting admin enlarges the blast radius, storing long-term keys is even riskier, and extending expiration only lengthens the validity of stolen credentials — increasing the risk.

---
