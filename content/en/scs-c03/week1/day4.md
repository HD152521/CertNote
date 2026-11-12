# Day 4 - STS and Temporary Credentials: AssumeRole, Federation, Role Chaining, Confused Deputy Prevention

Over the past three days we kept repeating "don't use long-term credentials (IAM User access keys); use a Role." Today we dig into how that Role actually gets "assumed": what STS (Security Token Service), the underlying mechanism, issues, and how an external identity (federation) is exchanged for AWS credentials. The deepest discriminating material in SCS-C03 Domain 4 lives here: the AssumeRole trust relationship, the constraints of role chaining, and the Confused Deputy attack that must be blocked in cross-account delegation.

The core sentence first: **STS issues expiring temporary credentials (AccessKeyId + SecretAccessKey + SessionToken), and "who can assume this role" is decided by the role's trust policy.**

## What STS Issues: Three Temporary Credential Components

Long-term IAM User credentials are two keys (AccessKeyId, SecretAccessKey), but STS temporary credentials have **three**.

| Component | Role |
|------|------|
| AccessKeyId | Identifier |
| SecretAccessKey | Signing key |
| **SessionToken** | Proof of the temporary session (long-term keys have none) |

These credentials have an **expiration time**. AssumeRole defaults to 1 hour and allows up to 12 hours (within the role's `MaxSessionDuration`). Once they expire, you must obtain new ones. The fact that **damage is limited in time even if they are exposed** is the fundamental reason they are safer than long-term keys.

Main STS APIs:

| API | Purpose |
|-----|------|
| `AssumeRole` | Assume an IAM Role in the same or another account (the most common) |
| `AssumeRoleWithSAML` | Federation with a SAML 2.0 IdP (e.g., AD FS, Okta) |
| `AssumeRoleWithWebIdentity` | Federation with OIDC (e.g., Cognito, Google, GitHub Actions) |
| `GetSessionToken` | Temporary credentials with MFA applied (for IAM Users) |
| `GetFederationToken` | Legacy federation |

Knowing when to use each API is an exam point. If you distinguish them by "who calls it" and "what evidence is presented," you won't get confused.

| API | Caller | Evidence presented | Resulting identity | Typical situation |
|-----|-------------|----------------|-----------|-----------|
| `AssumeRole` | A principal that already holds AWS credentials | Its own AWS signature | The target role | Cross-account access, EC2/Lambda execution roles |
| `AssumeRoleWithSAML` | A user who came through the corporate IdP | **SAML assertion** | The target role | Workforce sign-in based on AD FS or Okta |
| `AssumeRoleWithWebIdentity` | A principal holding an OIDC token | **OIDC ID token** | The target role | GitHub Actions, EKS pods, mobile apps |
| `GetSessionToken` | The IAM user themselves | Their own keys (+ MFA code) | **The same user** | When a session with MFA attached is needed |
| `GetFederationToken` | An IAM user or root | Their own keys | A federated user | Legacy; not used in new designs |

> ⚠️ **Trap**: Mixing up `GetSessionToken` and `AssumeRole` is a common mistake. `GetSessionToken` **does not change the role**; you simply receive temporary credentials with the same IAM user identity, with MFA reflected. So if you want to "satisfy a policy condition that requires MFA," it is `GetSessionToken`, and if you want to "change into a different set of permissions," it is `AssumeRole`. One more thing: credentials obtained through `GetSessionToken` are restricted from most IAM and STS calls.

Here is a single picture of where temporary credentials come from. All three paths end at the same place.

```
[ Three paths to temporary credentials ]

 ① Path where the workload receives them automatically
    EC2 instance ──▶ IMDS (v2, token required) ──▶ role of the instance profile
    Lambda function ──▶ execution environment variables ──▶ execution role
    ECS task   ──▶ task credentials endpoint ──▶ task role
    EKS pod     ──▶ OIDC service account token ──▶ role (IRSA)
                        └─ Common point: **no keys in the code**

 ② Path where a person signs in and receives them
    User ──▶ corporate IdP sign-in ──▶ SAML/OIDC proof
           ──▶ IAM Identity Center or STS ──▶ role session

 ③ Path where you change into another identity using AWS credentials you already hold
    Principal ──▶ sts:AssumeRole ──▶ another role session (same account or cross-account)

  ── The output of all three paths is identical ────────────────────────
     AccessKeyId(ASIA...) + SecretAccessKey + SessionToken + Expiration
```

What to read from this picture is the fact that **"there is no place anywhere for a long-term key to appear."** Workloads, people, and cross-account access are all solved with temporary credentials. So an answer choice in the exam that involves an access key is usually a wrong-answer candidate.

EC2 instance profiles, Lambda execution roles, and ECS task roles are all STS AssumeRole internally as well. In the case of EC2, the instance metadata service (IMDS) automatically issues and renews the temporary credentials. That is why there is no need to put keys in code. You must enforce **IMDSv2 (token-based)** to block the attack that steals metadata through SSRF (the core vector of the Capital One incident); this is easily used as a wrong-answer choice on the exam.

## AssumeRole: The Two Axes of Trust Policy and Permission Policy

A Role has **two policies**. This distinction is the most confusing point in IAM.

- **Trust policy**: "**Who** can assume this role" (the targets allowed `sts:AssumeRole`). It includes a Principal = a resource-based policy.
- **Permission policy**: "What can be done **once this role is assumed**." An identity-based policy.

```json
// Trust policy: a principal in account 111122223333 can assume this role
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
2. The **caller's identity policy** has an Allow for `sts:AssumeRole` (specifying the target role ARN)

Drawing in order how these "both sides" actually mesh gives the following. Every arrow is a point that can fail, and exam questions usually present a situation in which one of them is missing.

```
[ The full cross-account AssumeRole process ]

  Account A (caller) 111122223333          Account B (target) 444455556666
  ┌────────────────────────┐          ┌──────────────────────────────┐
  │ Principal: role/Auditor │          │ Role: role/CrossAccountRead  │
  │                        │          │                              │
  │ ① Identity policy      │          │ ② Trust policy (resource-based)│
  │   Allow sts:AssumeRole │          │   Principal: Account A       │
  │   Resource: B's role ARN│          │   Action: sts:AssumeRole     │
  └───────────┬────────────┘          │   Condition: ExternalId, MFA │
              │                       │                              │
              │                       │ ③ Permission policy          │
              │  (1) AssumeRole call  │   Allow s3:GetObject ...     │
              ├──────────────────────▶└──────────────┬───────────────┘
              │                                      │
              │            (2) STS checks both ① and ②
              │                · Is A permitted to call? (①)
              │                · Does B accept A?  (②)
              │                · Do the conditions (ExternalId, MFA) match?
              │                       │
              │  (3) Temporary credentials issued (default 1 hour)
              │◀──────────────────────┘
              │      ASIA... + SessionToken + Expiration
              │
              │  (4) Call B's resources with the new identity
              │      arn:aws:sts::444455556666:assumed-role/CrossAccountRead/audit-2026
              ▼
        Operates only within the scope of the ③ permission policy

  ── Failure point diagnosis table ────────────────────────────────────────
  ① missing  → the call itself is AccessDenied (blocked in Account A)
  ② missing  → "not authorized to perform sts:AssumeRole" (Account B rejects)
  Condition mismatch → same message, but the cause is ExternalId, MFA, or IP
  ③ too narrow  → the role is assumed, but subsequent APIs are blocked
```

The distinction on the last line is especially useful in practice. **"I can't assume the role" and "I assumed it but can't do anything" are completely different problems.** For the former, look at the trust policy; for the latter, look at the permission policy. If `aws sts get-caller-identity` returns the target role's ARN, you have already reached the latter stage.

What you write in a trust policy's `Principal` changes the trust scope dramatically.

| `Principal` notation | Meaning | Trust scope |
|-------------------|------|-----------|
| `{"AWS": "arn:aws:iam::111122223333:root"}` | The entire account 111122223333 | **Delegation to that account's IAM administrators**; broad |
| `{"AWS": "arn:aws:iam::111122223333:role/Auditor"}` | Only a specific role | Narrow (recommended) |
| `{"Service": "ec2.amazonaws.com"}` | An AWS service | Risky without a source condition |
| `{"Federated": "arn:aws:iam::...:oidc-provider/..."}` | An OIDC provider | Must be narrowed with a `sub` condition |
| `{"AWS": "*"}` | **Every AWS account** | Fatal if used without conditions |

> ⚠️ **Trap**: If a trust policy containing `{"AWS": "*"}` appears among the choices, filter it out as a wrong answer by reflex. Even when conditions are attached, it creates a "role that anyone can try to assume," so a single wrong condition opens it to the whole world. It is also a representative pattern that IAM Access Analyzer catches as an external access finding. Trust is about **starting as narrow as possible and widening when needed**, not opening wide and blocking with conditions.

Writing `"arn:aws:iam::111122223333:root"` in a trust policy's Principal means "the **entire** account 111122223333 can assume it," not just the root user. However, in practice only a principal inside that account that has been granted `sts:AssumeRole` permission can assume it (condition 2). The intuition that "using root as the Principal is dangerous" is only half right: account delegation is a normal pattern, but permission control inside that account is left to that account.

## Federation: Exchanging an External Identity for AWS Credentials

Federation means accessing AWS with a corporate directory (AD) or a social/OIDC identity without creating IAM Users.

### SAML 2.0 Federation (Corporate Workforce)

```
[ SAML federation flow ]

  User → sign in to corporate IdP (AD FS/Okta)
       → IdP issues SAML assertion (includes role ARN)
       → AWS STS AssumeRoleWithSAML
       → temporary credentials issued
       → access AWS resources
```

Drawn in a bit more detail, it shows that in federation **AWS does not authenticate the user directly**. All AWS does is verify the proof signed by the IdP and issue a session for the role named inside it.

```
[ SAML / OIDC federation: where the trust lies ]

  User                 Corporate IdP          AWS IAM              AWS STS
    │                     │                     │                    │
    │  (1) Sign-in · MFA  │                     │                    │
    ├────────────────────▶│                     │                    │
    │                     │                     │                    │
    │  (2) Signed proof   │                     │                    │
    │◀────────────────────┤                     │                    │
    │   SAML assertion     │                     │                    │
    │   or OIDC token      │                     │                    │
    │   · who (sub)        │                     │                    │
    │   · which role (Role)│                     │                    │
    │   · attributes (dept·team)│                │                    │
    │                     │                     │                    │
    │  (3) Present the proof and call AssumeRoleWith…                  │
    ├──────────────────────────────────────────────────────────────▶│
    │                     │                     │                    │
    │                     │  (4) Verify the signature with the IdP registered in IAM │
    │                     │◀────────────────────┤                    │
    │                     │   (SAML metadata / OIDC thumbprint·issuer) │
    │                     │                     │                    │
    │                     │  (5) Check the target role's trust policy  │
    │                     │      Principal: Federated = that IdP      │
    │                     │      Condition: sub · aud · attributes match│
    │                     │                     │                    │
    │  (6) Temporary credentials issued                                │
    │◀──────────────────────────────────────────────────────────────┤
    │      ASIA... + SessionToken (+ session tags)                    │
    ▼
  Access AWS resources: CloudTrail records it as an assumed-role session

  ── Where the trust lies ────────────────────────────────────────────
  · Responsibility for **authentication** lies with the IdP (passwords, MFA, account lockout policy)
  · Responsibility for **authorization** lies with AWS (which role, which permissions)
  · So if the IdP is breached, AWS is breached too: IdP security is the premise of AWS security
```

The last line matters for both the exam and practice. Adopting federation removes the burden of managing credentials on the AWS side, but **the IdP becomes the new single point of failure**. So enforcing MFA on the IdP side, protecting administrator accounts, and narrowing trust policy conditions on the AWS side must go together.

Today's recommended approach is **IAM Identity Center (formerly AWS SSO)**. In a multi-account environment you define permission sets and integrate with an external IdP (Okta, Entra ID, etc.), so that a user signs in once and accesses multiple accounts and roles with temporary credentials. It eliminates the anti-pattern of creating IAM Users in every account.

| Access approach | Where identities are stored | When there are 40 accounts | Recommendation |
|-----------|----------------|------------------|--------|
| IAM User in every account | Each account | 1 user x 40 accounts = unmanageable | Anti-pattern |
| Hub account IAM User + role chaining | Hub account | 1 user + 40 roles | An improvement, but long-term keys remain |
| Direct SAML federation | Corporate IdP | IdP and roles must be registered per account | Possible, but a setup burden |
| **IAM Identity Center** | Corporate IdP (or its own directory) | Assign permission sets to groups of accounts | **Standard** |

What Identity Center creates in each account is also, in the end, a **role**. When you assign a permission set to an account, a role beginning with `AWSReservedSSO_...` is automatically created in that account, and the user assumes that role after signing in. In other words, Identity Center is not a new authentication mechanism but **a layer that automates role creation and trust relationship management**. Knowing this naturally resolves questions such as "if we use Identity Center, why does CloudTrail show assumed-role?" and "why do SCPs still apply?" The layer underneath is always IAM.

### OIDC / Web Identity Federation (Apps and CI/CD)

Mobile apps (Cognito), GitHub Actions, Kubernetes (EKS IRSA), and so on use `AssumeRoleWithWebIdentity` through OIDC. **GitHub Actions OIDC** in particular matters for both the exam and practice: instead of putting a long-term access key in a GitHub secret, you assume a role with GitHub's OIDC token, which removes the risk of key exposure.

The trust policy for GitHub Actions OIDC sets `token.actions.githubusercontent.com` as the OIDC provider and uses the Condition `token.actions.githubusercontent.com:sub` to allow **only specific repos and branches**. If you leave this sub condition loose, such as `repo:org/*`, any repo in the organization can assume the role, which is dangerous. It must be narrowed like `repo:org/repo:ref:refs/heads/main`. EKS IRSA maps roles to pods on the same OIDC principle.

## Role Chaining and Its Constraints

**Assuming yet another role** while you already have a role assumed is role chaining. Account A → assume role X → assume role Y with role X.

Two key constraints appear on the exam.

1. **The maximum session duration for chaining is fixed at 1 hour.** Even if role X's `MaxSessionDuration` is 12 hours, a session obtained through chaining is capped at 1 hour.
2. Some calls, such as `GetSessionToken`, are again restricted with a chained session.

```
[ Role chaining and session lifetime ]

  Person or workload
        │
        │ AssumeRole  ──▶ role X session
        │                 MaxSessionDuration set to 12 hours
        │                 → can actually receive **up to 12 hours**  ✅
        │                        │
        │                        │ AssumeRole again with this session's credentials
        │                        ▼
        │                  role Y session  ◀── this is "chaining"
        │                  Even if Y's MaxSessionDuration is 12 hours
        │                  → **it is cut to 1 hour**  ⚠️
        │                        │
        │                        │ Chain again
        │                        ▼
        │                  role Z session: also 1 hour
        ▼

  ── Symptoms and diagnosis ────────────────────────────────────────────
  "A long-running batch dies exactly every hour"
     → Almost certainly a chaining path. Even if you give a large duration-seconds,
       you get a ValidationError or it is silently cut to 3600.
  Fixes
     ① Add credential refresh logic (use the SDK credential provider)
     ② Remove the chaining: assume the final role **directly** from the original identity
     ③ If multiple hops are really needed, keep each step short and design on the premise of re-issuance
```

The real problem chaining creates is not time but **traceability**. When you switch through several roles, each CloudTrail event records only the immediately preceding role, so answering "who ultimately had this work done" requires stitching together multiple logs. `sts:SourceIdentity` solves this problem head on: once set, it follows through the entire chain and the original identity is never lost. Contrast this with the session name (`RoleSessionName`), which the caller can choose freely every time and is therefore weak as evidence.

| Identification means | Set by | Preserved across chaining | Strength as evidence |
|-----------|-----------|-----------------|------------------|
| `RoleSessionName` | The calling code | Not preserved (specified anew each time) | Weak; can be changed freely |
| Session tags (transitive tags) | The calling code | Preserved if designated transitive | Medium; for passing attributes |
| `sts:SourceIdentity` | Once, at the initial call | **Preserved to the end, cannot be changed** | Strong; the basis of audit trails |

Role chaining can blur permission tracing, so avoid it where possible. **Session policies** or a direct AssumeRole are recommended instead. However, in cross-account setups the pattern of "going through a role in a hub account to reach spoke accounts" is legitimate chaining. Traceability is supplemented with the `assumedRole` session name in CloudTrail (set `sts:RoleSessionName` meaningfully).

## Confused Deputy Prevention: ExternalId and aws:SourceArn

Today's security core. **Confused Deputy** is an attack in which a privileged principal (the deputy) is tricked into exercising its privileges on behalf of a third party.

### Scenario: Cross-Account Access by a Third-Party SaaS

Suppose a monitoring SaaS accesses your account with AssumeRole. The SaaS assumes roles from the same SaaS account for **all customers**. If the trust policy only checks "allow if it is the SaaS account," a malicious user can tell the SaaS "my role is that ARN," registering someone else's role ARN, and make the SaaS assume that role on their behalf.

Why this structure is dangerous is understood only through the **three-party picture**. The actor of the attack is not the SaaS but a third party who deceives the SaaS, and the SaaS, as the "confused deputy," ends up exercising its own privileges for someone else.

```
[ Confused Deputy: the three-party structure ]

 ── State without defense ────────────────────────────────────────────────────

   ① Legitimate customer (account 111122223333)
      "Please monitor our account's role/MonitorRole"
                    │  Registers the role ARN
                    ▼
              ┌───────────────────────────────┐
              │  SaaS vendor (account 999988887777) │  ◀── this is the "deputy"
              │  For all customers,            │
              │  assumes roles from the same account │
              └───────────────┬───────────────┘
                    ▲         │
     ② Attacker     │         │ AssumeRole (registered ARN)
       "Our account's│         ▼
        role is this" │   ┌──────────────────────────────────┐
        ← registers   │   │ AWS STS                          │
          someone     │   │ Trust policy check:               │
          else's role │   │  "Is the Principal the SaaS account?" ✅ │
          ARN         │   │  → passes (no other checks)       │
                    │   └───────────────┬──────────────────┘
                    │                   │ Temporary credentials issued
                    │                   ▼
                    │        ┌───────────────────────────┐
                    └────────│ Victim account's resources  │
                  Data exfiltration │ With role/MonitorRole's permissions │
                             │ access S3, logs, metrics    │
                             └───────────────────────────┘

     ▲ The attacker did not break into AWS. They only **borrowed the SaaS's privileges**.
       The SaaS had no way to tell whom it was working for.


 ── State with the ExternalId defense ────────────────────────────────────────

   Embed a **unique value issued by the SaaS** per customer in the trust policy condition.

   Customer A trust policy:  sts:ExternalId == "a1b2c3-customerA-only"
   Customer B trust policy:  sts:ExternalId == "z9y8x7-customerB-only"

              ┌───────────────────────────────┐
              │  SaaS vendor                   │
              │  Customer A work → passes ExternalId "a1b2c3"
              │  Customer B work → passes ExternalId "z9y8x7"
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌────────────────────────────────────────┐
              │ AWS STS trust policy check              │
              │  "Is the Principal the SaaS account?"   ✅ │
              │  "Is the ExternalId a1b2c3?"            │
              │      · If it is customer A's work   ✅ passes │
              │      · If the call was induced by the attacker  ❌ denied │
              └────────────────────────────────────────┘

     ▲ Even if the attacker registers someone else's role ARN, the SaaS sends
       **its own customer's** ExternalId, so it does not match the victim role's condition.
       → Isolation between customers holds at the trust policy level.
```

The key here is **who decides the ExternalId**. The SaaS issues a different value per customer, stores that value on its own side, and attaches it at call time. If customers choose it arbitrarily, an attacker can register the same value in their own account and the isolation breaks.

The solution is the **ExternalId**: embed the unique value that the SaaS issued only to you in the trust policy's Condition.

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

The SaaS passes this ExternalId along when assuming your role, and it cannot assume your role with another customer's ExternalId. Isolation between customers is guaranteed.

### When an AWS Service Is the Deputy: aws:SourceArn / aws:SourceAccount

The same attack is possible when a service principal (e.g., CloudWatch, S3, SNS) uses your role or resource. In that case you enforce "allow only calls triggered by this specific resource" with `aws:SourceArn` (or `aws:SourceAccount`).

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

The two are different tools that solve the same problem. If the deputy is **another AWS account**, use ExternalId; if it is an **AWS service**, use a source condition.

| Axis | `sts:ExternalId` | `aws:SourceArn` / `aws:SourceAccount` |
|----|------------------|----------------------------------------|
| Identity of the deputy | A third-party AWS account | An AWS service principal (`*.amazonaws.com`) |
| Who decides the value | **The third party issues it per customer** | AWS fills it into the request automatically |
| Where it is attached | The role's trust policy | The role trust policy or a resource policy |
| How it is passed | Explicitly with `--external-id` at call time | The caller cannot manipulate it |
| What it blocks | Another customer assuming my role | Someone else's resource triggering my resource |
| Is it a secret value | **No**; the defense holds even if it is guessed | Not applicable |
| Typical situation | Monitoring, backup, and cost-management SaaS integrations | S3→SNS, CloudWatch→Lambda, service roles in general |

It is also worth explaining why `aws:SourceAccount` and `aws:SourceArn` are used together. `SourceAccount` filters broadly at the account level, and `SourceArn` narrows down to a specific resource. Some services cannot populate `SourceArn` in certain situations, so putting an account condition alongside it keeps at least a minimal line of defense. **Layering a broad condition and a narrow condition** is the knack of this pattern.

The mistake of omitting source conditions in policies that trust a service principal is astonishingly common. `{"Service": "s3.amazonaws.com"}` means "**all S3 in the world**," not "my S3," because service principals do not distinguish accounts. So when you allow a service principal on an SNS topic, SQS queue, Lambda function, or KMS key, `aws:SourceArn` or `aws:SourceAccount` should accompany it almost without exception. When you see a policy snippet containing a `Service` principal on the exam, **check first whether there is a condition clause**.

> 🎯 **Scenario**: "We need to create a cross-account role that lets a third-party backup vendor access our S3." The correct pattern is ① do not give the vendor an IAM User access key (never) ② an IAM Role with the vendor account in the trust policy + an explicit **ExternalId** ③ a permission policy limited to the necessary buckets and Actions (least privilege). Without an ExternalId, a Confused Deputy hole remains through which another customer using the same vendor could access our resources. This pattern is identical for every third-party integration such as Datadog, New Relic, and PagerDuty.

An ExternalId is not a "password"; it blocks the attack even if it can be guessed. What matters is that **the customer does not set the ExternalId themselves; the third party issues it**. If the customer sets it arbitrarily, it can collide with another customer's or be predicted, and the isolation breaks. A choice on the exam saying "the customer freely sets the ExternalId" is a trap.

## AssumeRole in the CLI

```bash
# Assume a role: returns the three temporary credential components
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/CrossAccountReadRole \
  --role-session-name security-audit-2026 \
  --external-id your-unique-external-id-xyz \
  --duration-seconds 3600

# Follow-up calls with the returned credentials (after setting environment variables)
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...   # SessionToken is required for temporary credentials
aws sts get-caller-identity    # Check who you are acting as
```

Learn the variants commonly used in practice as well. The exam point is which security requirement each option addresses.

```bash
# ① Assume a role while satisfying a trust policy that requires MFA
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/BreakGlassRole \
  --role-session-name incident-2026-07 \
  --serial-number arn:aws:iam::111122223333:mfa/alice \
  --token-code 123456

# ② Inject session tags so that ABAC conditions apply
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/ProjectRole \
  --role-session-name alice@example.com \
  --tags Key=Project,Value=atlas Key=Env,Value=prod \
  --transitive-tag-keys Project

# ③ Pin the original identity so it is traced through the entire chain
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/AuditRole \
  --role-session-name audit-run \
  --source-identity alice@example.com

# ④ Assume a role with an OIDC token (the form used in CI environments)
aws sts assume-role-with-web-identity \
  --role-arn arn:aws:iam::111122223333:role/GitHubDeployRole \
  --role-session-name gh-actions \
  --web-identity-token "$OIDC_TOKEN"

# ⑤ If you register the role in a profile, the SDK/CLI renews it automatically (recommended)
#   ~/.aws/config
#   [profile audit]
#   role_arn       = arn:aws:iam::444455556666:role/CrossAccountReadRole
#   source_profile = default
#   external_id    = your-unique-external-id
#   duration_seconds = 3600
aws s3 ls --profile audit
```

```bash
# Pull out only the trust policy to check: "who can assume this role"
aws iam get-role --role-name CrossAccountReadRole \
  --query 'Role.AssumeRolePolicyDocument'

# Check the role's maximum session duration (with chaining it is cut to 1 hour anyway)
aws iam get-role --role-name CrossAccountReadRole \
  --query 'Role.MaxSessionDuration'

# Change EC2 to enforce IMDSv2 (the core of SSRF defense)
aws ec2 modify-instance-metadata-options \
  --instance-id i-0abc123 \
  --http-tokens required \
  --http-endpoint enabled \
  --http-put-response-hop-limit 1
```

The `--http-put-response-hop-limit 1` in the last command is quietly an important option. It limits how many hops a metadata response may travel, and when the value is 1, **only the instance itself** can read the metadata. On a host running containers, if this value is 2 or more, a container can read the host's instance credentials, so if a single container is compromised, the entire instance role is exposed. `--http-tokens required` (enforcing IMDSv2) and the hop limit must be applied as a pair to complete the defense.

Registering roles with `--profile` is convenient in the CLI, but you should be aware that **`external_id` remains in plain text in a local configuration file**. An ExternalId is not a secret, so it is not fatal in itself, but if `aws_secret_access_key` is in the same file, that is a different problem. The principle is one: do not keep long-term keys in `~/.aws/credentials`. If people receive credentials through Identity Center sign-in and workloads through instance and task roles, there is no reason for secrets to remain in this file.

The essence of the 2019 Capital One incident was ① a WAF (inadequate SSRF defense) ② **theft of the EC2's temporary credentials via IMDSv1** ③ S3 access with those credentials. Temporary credentials themselves are a safety mechanism, but they are neutralized if **the path to steal them (SSRF → IMDS)** is open. That is why IMDSv2 enforcement + least-privilege instance roles + WAF appear on the exam as a bundle. Temporary credentials are only a line of defense in the form of "time limit upon exposure"; blocking the exposure path is a separate control.

## Summary

Three key points for today. First, **STS issues expiring temporary credentials (including a SessionToken)**, and EC2/Lambda/ECS/federation all operate on top of that; the anti-pattern of putting long-term keys in code or CI is replaced by OIDC and instance roles. Second, AssumeRole has two axes, **the trust policy (who) and the permission policy (what)**, and cross-account requires an Allow on both sides. Third, in cross-account delegation you must block **Confused Deputy with ExternalId (third party) and aws:SourceArn (AWS service)**.

The order of response when temporary credentials leak is also worth knowing. The answer "wait until they expire" is wrong: up to 12 hours may remain, and in the meantime the attacker keeps trying to renew. The actual order is ① **immediately add a blanket Deny statement** to the role's permission policy to neutralize the session (already-issued sessions are re-evaluated against policy on every request, so it takes effect immediately) ② block the paths by which the role can be assumed (the trust policy, the instance profile) ③ do a full investigation in CloudTrail of what that session did ④ fix the root cause (the metadata exposure, the token leakage path). The property that **policy applies retroactively to already-issued sessions** is used decisively here. This is another difference from long-term keys: long-term keys must be deactivated, while a role session can be switched off immediately with one policy line.

A choice saying "to revoke a role session, call the API that deletes the session" is a wrong answer. STS has no API that revokes an individual session. Instead, you add a Deny with a condition based on issue time to the role's policy to **invalidate every session issued before a specific point in time**. The console's "revoke sessions" feature also works internally by automatically inserting exactly this policy statement. Knowing the mechanism, you understand why that feature modifies the role policy.

Tomorrow, to wrap up Week 1, we weave together the IAM, STS, and policy evaluation learned through today into integrated scenarios. Through practical situations such as "why is it denied even though I have permission," "securely delegate permissions to a third party," and "convert long-term keys to temporary credentials," we solidify Week 1's thinking framework.

### One-Line Summary

STS issues **three expiring temporary credential components** (AccessKeyId `ASIA...` + SecretAccessKey + **SessionToken**), and EC2 instance profiles, Lambda execution roles, ECS task roles, EKS IRSA, and federation all run on top of this, so there is effectively no place for a long-term key to appear. A role has two policies: **the trust policy is "who can assume it" (resource-based), and the permission policy is "what can be done once assumed" (identity-based)**, and cross-account requires **both** the caller's `sts:AssumeRole` Allow and the target role's trust policy. "I can't assume it" and "I assumed it but can't do anything" are problems at different layers. Using an account root in a trust policy's `Principal` delegates to that entire account, and `{"AWS": "*"}` should be avoided even with conditions. **Confused Deputy** is blocked, when the deputy is a third-party account, with the **`sts:ExternalId` issued by the third party**, and when it is an AWS service, with **`aws:SourceArn` and `aws:SourceAccount`**; `{"Service": "s3.amazonaws.com"}` means "S3 across the world," so it is dangerous without a source condition. Role chaining **cuts the session to 1 hour** and blurs traceability, so avoid it where possible, and if unavoidable, hold on to the original identity to the end with `sts:SourceIdentity`. Credential theft paths are a separate control: on EC2 the standard is **enforcing IMDSv2 + hop limit 1**, and a leaked session is neutralized immediately not with a delete API but by **adding a Deny to the role policy**.

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
