# Day 4 - IAM Identity Center and Federation: SAML, OIDC, and ABAC

So far (days 1-3) we have covered "how to restrict permissions." Today we look at the modern answer to "how to grant access to people." Creating an individual IAM user for each of thousands of employees across hundreds of accounts is a nightmare. Long-term credentials (access keys) carry a high risk of leakage, and cleaning up after employees who leave is hard.

The solution is **federation**. You treat the company's existing identity system (Active Directory, Okta, Azure AD, and so on) as the source of trust, and AWS accepts that trust and issues **temporary credentials**. The managed service that packages this is **IAM Identity Center** (formerly AWS SSO). On the Specialty exam, the SAML/OIDC flows and ABAC are guaranteed to appear.

## Why You Should Abandon IAM Users

Let's start with the motivation. The problems with IAM users:

- **Long-term credentials**: an access key stays valid forever unless rotated, so a leak is fatal
- **Duplicated per account**: with 200 accounts, each person ends up with 200 IAM users
- **Duplicated identity sources**: the corporate HR/AD system and AWS drift apart, so permissions linger after an employee leaves
- **Scattered MFA management**: MFA is configured separately in every account

The core of federation is a **single source of truth for trust**. In identity management theory this is called **identity federation**: authentication happens in one place (the IdP, Identity Provider), and many services (SPs, Service Providers, also called RPs, Relying Parties) trust the result. Because credentials are managed in only one place, deactivating a departed employee takes effect everywhere immediately. AWS implements this pattern with STS temporary credentials - there are no permanent keys at all.

## The SAML 2.0 Federation Flow

This is the SAML flow used in traditional enterprise environments (AD FS, Okta).

```
1. The user logs in to the corporate portal (IdP)
2. The IdP issues a SAML Assertion (signed XML)
   → contains the user's identity + the IAM role to grant
3. The user submits this Assertion to AWS STS
   (sts:AssumeRoleWithSAML)
4. AWS checks whether it trusts the IdP (the SAML Identity Provider must be registered)
5. STS issues temporary credentials (default 1 hour, maximum 12 hours)
6. The user accesses AWS with those credentials
```

Two things are needed on the AWS side.

```json
// 1) Register the SAML Identity Provider in IAM (upload the IdP metadata XML)
// 2) Attach a trust policy that allows AssumeRoleWithSAML to the role
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::ACCOUNT:saml-provider/MyCompanyIdP" },
    "Action": "sts:AssumeRoleWithSAML",
    "Condition": {
      "StringEquals": { "SAML:aud": "https://signin.aws.amazon.com/saml" }
    }
  }]
}
```

> ⚠️ **Pitfall**: For `sts:AssumeRoleWithSAML`, the `Principal` in the trust policy must point to the SAML provider as `Federated`. Do not confuse it with plain `AssumeRole` (another IAM role switching) or `AssumeRoleWithWebIdentity` (OIDC). The exam includes questions that distinguish these three STS APIs: `AssumeRole` (IAM principals), `AssumeRoleWithSAML` (enterprise SAML IdPs), and `AssumeRoleWithWebIdentity` (OIDC - mobile apps, Cognito, GitHub Actions, and so on).

### The Five STS APIs in One Table

The exam repeatedly asks "which API do you use in this situation?" Memorize all five together with the criterion that separates them.

| API | Input credential | Typical situation | Resulting principal form |
|-----|------------------|-------------------|--------------------------|
| `AssumeRole` | Already-valid AWS credentials | Cross-account switching, role chaining, EC2 → another role | `assumed-role/RoleName/SessionName` |
| `AssumeRoleWithSAML` | SAML 2.0 Assertion | Enterprise IdPs such as AD FS and Okta | `assumed-role/RoleName/SessionName` |
| `AssumeRoleWithWebIdentity` | OIDC JWT | Mobile apps, Cognito, GitHub Actions | `assumed-role/RoleName/SessionName` |
| `GetSessionToken` | The long-term keys of an **IAM user** | A short-lived token for calling APIs that require MFA | Same as the original IAM user |
| `GetFederationToken` | The long-term keys of an **IAM user** | A custom authentication broker issuing short-term permissions to external users | `federated-user/Name` |

There is one big dividing line between the first three and the last two. **The `AssumeRole*` family changes your identity by switching into a role, but `GetSessionToken` and `GetFederationToken` can never exceed the permissions of the original IAM user.** The last two also **presuppose an IAM user (long-term keys)** in the first place, so in a modern design whose goal is "getting rid of IAM users" they have almost no place. If `GetFederationToken` appears among the answer choices, it is usually wrong.

The practical criterion for telling `GetSessionToken` and `GetFederationToken` apart is **"are you trying to get through MFA, or to hand permissions to someone else?"** `GetSessionToken` is for promoting your own session with MFA, so the returned credentials have `aws:MultiFactorAuthPresent` set to true. `GetFederationToken` is for handing short-lived AWS access to a user who was authenticated by your own authentication system (such as an internal portal), and you can narrow its permissions with a session policy. However, the returned credentials come with a constraint: they cannot perform most IAM and STS operations. In exam questions where either of these two is the correct answer, a clue like "an existing IAM-user-based environment" is always attached.

### What a SAML Assertion Actually Carries

Fine-grained control in SAML federation is determined by **which attributes the IdP includes**. The attribute names that AWS interprets are fixed.

```
[ SAML attributes that AWS reads ]

  .../SAML/Attributes/Role
      Value: "arn:aws:iam::111122223333:role/DevAccess,
              arn:aws:iam::111122223333:saml-provider/CorpIdP"
      → Specifies the role to switch to and the SAML provider together, separated by a comma.
        If you include several, a role selection screen appears after login.

  .../SAML/Attributes/RoleSessionName
      Value: "alice@example.com"     ← key to CloudTrail tracing

  .../SAML/Attributes/SessionDuration
      Value: "3600"  (seconds)       ← within the role's MaxSessionDuration

  .../SAML/Attributes/PrincipalTag:Department
      Value: "payments"              ← injects an attribute for ABAC

  .../SAML/Attributes/TransitiveTagKeys
      Value: ["Department"]          ← keeps the tag across role chaining

  .../SAML/Attributes/SourceIdentity
      Value: "alice@example.com"     ← the original identity, which cannot be tampered with
```

The trust policy can check these attributes as conditions. `SAML:aud` (the recipient of the Assertion), `SAML:iss` (the issuer), and `SAML:sub` (the subject) are typical examples.

```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::111122223333:saml-provider/CorpIdP" },
  "Action": ["sts:AssumeRoleWithSAML", "sts:TagSession", "sts:SetSourceIdentity"],
  "Condition": {
    "StringEquals": {
      "SAML:aud": "https://signin.aws.amazon.com/saml"
    },
    "StringLike": {
      "aws:RequestTag/Department": "*"
    }
  }
}
```

An important practical point is that `sts:TagSession` and `sts:SetSourceIdentity` must also be in the `Action` list. **Even if the IdP sends `PrincipalTag:` or `SourceIdentity` attributes, the role switch itself fails if the trust policy does not allow those actions.** This is the classic cause of the symptom "I added ABAC tags and now AssumeRole is denied."

> ⚠️ **Pitfall**: If you omit the `SAML:aud` condition, there is room for an **Assertion issued for a different purpose to be reused for AWS login**. In an environment where the IdP issues SAML to several services, this condition blocks the scenario in which an attacker steals an Assertion meant for another service and submits it to AWS. A trust policy condition is complete only when it checks not just "who sent it" (`Principal`) but also "who it was sent to" (`aud`).

## OIDC and Web Identity Federation

Environments such as mobile apps, web apps, and CI/CD (GitHub Actions) use OIDC (OpenID Connect).

```
sts:AssumeRoleWithWebIdentity
  - Google, Facebook, Cognito, GitHub OIDC provider, etc.
  - Submit a JWT (JSON Web Token) to STS
  - Issue temporary credentials instead of hard-coding AWS credentials in the mobile app
```

A representative modern example: **when deploying to AWS from GitHub Actions, use OIDC instead of access keys.** You register GitHub as an OIDC provider and put a condition on a specific repository and branch in the trust policy so that only that workflow can switch into the role.

```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": { "token.actions.githubusercontent.com:sub": "repo:myorg/myrepo:ref:refs/heads/main" }
  }
}
```

This way there is no need to store long-term access keys in CI/CD, so the risk of leakage disappears.

**Writing the `sub` condition loosely with wildcards** in an OIDC trust policy is the most dangerous mistake. If you write something like `"StringLike": { "token.actions.githubusercontent.com:sub": "repo:myorg/*" }`, the role can be assumed from *any repository, any branch, and any forked PR* in that organization. It means an outside contributor could obtain the production deployment role just by opening a PR and running a workflow. At the very least, pin it down to the repository, and for a deployment role narrow it further to the branch or a GitHub Environment (`repo:myorg/myrepo:environment:production`). In addition, **always check the `aud` condition too** - if you check only `sub` and omit `aud`, a token issued for a different audience may still work.

```json
// Least-privilege GitHub OIDC trust policy — pins down both sub and aud
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:myorg/myrepo:environment:production"
      }
    }
  }]
}
```

| Condition expression | Scope allowed | Assessment |
|----------------------|---------------|------------|
| `"sub": "repo:myorg/*"` | Every repository, branch, and PR in the organization | Effectively unlimited. Do not use it |
| `"sub": "repo:myorg/myrepo:*"` | Every branch and PR of that repository | The role can be assumed via a fork PR. Dangerous |
| `"sub": "repo:myorg/myrepo:ref:refs/heads/main"` | Only workflows on the main branch | The practical minimum |
| `"sub": "repo:myorg/myrepo:environment:production"` | Only the environment protected by an approval gate | The recommended form for a deployment role |

A Cognito identity pool uses the same API internally. In that case you set conditions with `cognito-identity.amazonaws.com:aud` (the identity pool ID) and `:amr` (whether the user is authenticated).

```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "cognito-identity.amazonaws.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "cognito-identity.amazonaws.com:aud": "ap-northeast-2:11111111-2222-3333-4444-555555555555"
    },
    "ForAnyValue:StringLike": {
      "cognito-identity.amazonaws.com:amr": "authenticated"
    }
  }
}
```

A Cognito identity pool has **separate roles for authenticated users and unauthenticated (guest) users**. The `amr` condition is the device that distinguishes the two, and if you omit it, a guest could end up obtaining the authenticated-user role.

### SAML vs. OIDC: When to Use Which

| Item | SAML 2.0 | OIDC |
|------|----------|------|
| Token format | Signed **XML** Assertion | Signed **JWT** |
| Main use | Enterprise IdPs (AD FS, Okta, Ping) | Mobile/web apps, CI/CD, Kubernetes |
| AWS STS API | `AssumeRoleWithSAML` | `AssumeRoleWithWebIdentity` |
| Object registered in AWS | SAML identity provider (metadata XML) | OIDC identity provider (issuer URL and audience) |
| How the role is specified | The Assertion's `Role` attribute carries the role ARN | The trust policy decides with `sub`/`aud` |
| Condition keys | `SAML:aud`, `SAML:iss`, `SAML:sub` | `<issuer>:aud`, `<issuer>:sub` |
| Browser flow | Optimized for console SSO | Optimized for machine-to-machine (M2M) |

In one sentence: **when a person comes in through a browser, use SAML (or Identity Center); when code comes in automatically, use OIDC.** For workloads that have no IdP, such as on-premises servers or containers, IAM Roles Anywhere, which is based on X.509 certificates, is another path that solves the same problem (eliminating long-term keys).

## IAM Identity Center: The Managed Version of Federation

Identity Center packages the complex SAML/OIDC setup above as a managed service.

- **Permission Set**: defines "which set of permissions to give in which accounts" (= an IAM role template)
- **External IdP integration**: connects Okta, Azure AD, Ping, and others through SAML/SCIM
- **Account assignment**: a mapping of user/group × Permission Set × account
- **Single sign-in portal**: after signing in once, a user can access every account they have permissions for

```
Employee "alice" → IdP group "Developers"
  → Identity Center: assign the "DeveloperAccess" Permission Set to the Developers group
  → Mapped to two accounts: Prod and Dev
  → When alice signs in to the portal, both accounts are shown, and she switches with a click
```

When Identity Center assigns a Permission Set to an account, it automatically creates an IAM role of the form `AWSReservedSSO_*` in that account. So internally STS AssumeRole still operates, but the user never handles the role directly. With the SCIM (System for Cross-domain Identity Management) protocol, user/group changes in the IdP are synchronized automatically, so when a departed employee is deactivated in the IdP, their AWS access is cut off immediately.

```
[ The actual wiring of Identity Center ]

  External IdP (Okta / Entra ID / AD FS)
     │  ① SAML 2.0 — authentication
     │  ② SCIM      — user/group provisioning
     ▼
  ┌──────────────── IAM Identity Center ────────────────┐
  │  Identity Store   : users / groups                   │
  │  Permission Set   : policy bundle + session time + boundary │
  │  Assignment       : (group × Permission Set × account)      │
  └──────────────────────────────────────────────────────┘
     │  ③ The moment an assignment is created
     ▼
  An IAM role is automatically created in each member account
     arn:aws:iam::444455556666:role/AWSReservedSSO_DeveloperAccess_a1b2c3
     · The trust policy points to Identity Center
     · If a person edits this role directly, it is reverted at the next sync
     ▼
  ④ The user picks an account in the portal and clicks → AssumeRole internally
     CloudTrail records that role + the user identifier as the session
```

The point the exam aims at in this wiring diagram is that **the role in ③ is "not something you manage."** When you modify a Permission Set, the roles in every assigned account are updated together, so editing that role by hand in an individual account is meaningless and in fact creates drift. If different accounts need different permissions, you do not edit the role; instead you **split the Permission Set or use customer managed policy references.**

```bash
# Create a Permission Set — the session duration uses the ISO-8601 duration format
aws sso-admin create-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef \
  --name DeveloperAccess \
  --description "Standard developer permissions" \
  --session-duration PT4H

# Attach a managed policy
aws sso-admin attach-managed-policy-to-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-.../ps-... \
  --managed-policy-arn arn:aws:iam::aws:policy/PowerUserAccess

# Attach a permissions boundary to the Permission Set — applying day 2's delegation principle to SSO
aws sso-admin put-permissions-boundary-to-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-.../ps-... \
  --permissions-boundary CustomerManagedPolicyReference={Name=dev-boundary,Path=/}

# Group × Permission Set × account assignment
aws sso-admin create-account-assignment \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef \
  --target-id 444455556666 --target-type AWS_ACCOUNT \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-.../ps-... \
  --principal-type GROUP \
  --principal-id 90671234-abcd-4321-9876-1234567890ab

# Enable attribute mapping for ABAC (IdP attribute → session tag)
aws sso-admin create-instance-access-control-attribute-configuration \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef \
  --instance-access-control-attribute-configuration \
    'AccessControlAttributes=[{Key=Department,Value={Source=[${path:enterprise.department}]}}]'

# Look up users and groups with the identitystore API
aws identitystore list-groups --identity-store-id d-1234567890
```

The existence of `put-permissions-boundary-to-permission-set` is the bridge connecting day 2 and day 4. With Identity Center, the permissions granted to people are standardized into a single Permission Set, but if that Permission Set is broad like `PowerUserAccess`, room for privilege escalation still remains. Attaching a **customer managed permissions boundary** to the Permission Set puts a ceiling on sessions that come in through SSO as well. "We adopted SSO, so we no longer need boundaries" is a misconception - federation is a tool for organizing *identity*, and boundaries are a tool for restricting *permissions*, so neither replaces the other.

### Identity Center vs. IAM Users vs. Direct SAML

| Item | IAM users | Direct SAML federation | IAM Identity Center |
|------|-----------|------------------------|---------------------|
| Credentials | Long-term access keys/passwords | Temporary (STS) | Temporary (STS) |
| As the number of accounts grows | Explodes as accounts × users | IdP setup and roles repeated per account | **Just add assignments centrally** |
| Handling departures | Manual deletion in each account | Deactivate in the IdP (roles remain) | Reflected immediately via SCIM sync |
| MFA | Configured individually per account | Handled by the IdP | Handled by the IdP or Identity Center |
| Permission definition | IAM policies inside each account | A role + trust policy per account | Permission Set (defined centrally, deployed automatically) |
| Auditing | The user ARN remains as is | Depends on how the session name is built | The user identifier is included in the session |
| Suitable situation | Legacy or special integrations | Few accounts and IdP controls already strong | **The multi-account standard** |

"Turning on Identity Center makes IAM users disappear automatically" is a misconception. Existing IAM users stay and keep working. To actually get rid of IAM users, you must **Deny `iam:CreateUser` and `iam:CreateAccessKey` with an SCP** to block new creation, then find existing users with the credential report and clean them up one by one. When the exam asks "how do you prohibit the use of IAM users across the whole organization," the answer is not Identity Center adoption *by itself* but **the combination with an SCP block.**

## ABAC: Attribute-Based Access Control

As an organization grows, RBAC (role-based), which "creates a policy per role," explodes. 10 teams × 3 environments = 30 roles. ABAC (Attribute-Based Access Control) solves this with **tags**.

```
Principle: allow access only when the principal's tag (principal tag)
           and the resource's tag (resource tag) match.
```

```json
{
  "Effect": "Allow",
  "Action": ["ec2:StartInstances", "ec2:StopInstances"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Team": "${aws:PrincipalTag/Team}"
    }
  }
}
```

This single policy handles every team. If `alice` has the PrincipalTag `Team=payments`, she can access only `Team=payments` resources; if `bob` has `Team=billing`, he can access only `Team=billing` resources. Even when a new team appears, no policy change is needed - you just attach tags.

Combined with Identity Center, a user attribute from the IdP (for example, department in AD) is delivered as a PrincipalTag through the SAML Assertion, so **if you change only the department in the IdP, the AWS permissions follow automatically.**

ABAC is an access control model defined in NIST SP 800-162, and it solves RBAC's "role explosion" problem. RBAC is a static mapping of (user → role → permission), so when dimensions are added, the number of roles grows multiplicatively. ABAC is a dynamic evaluation of (attributes + policy rules), so one rule covers an unlimited number of combinations. The drawbacks are that debugging is hard and tag governance is mandatory - if tags are missing or tampered with, access control breaks.

When using ABAC, control collapses if users can change their own PrincipalTag or attach arbitrary tags when creating resources. That is why you must use the `aws:RequestTag` and `aws:TagKeys` conditions to force "always attach your own team's tag at creation," and tightly restrict the `iam:TagRole`/`sts:TagSession` permissions.

### RBAC and ABAC Side by Side

| Item | RBAC (role-based) | ABAC (attribute-based) |
|------|-------------------|------------------------|
| Basis for permission | "Which role are you?" | "Do your attributes match the resource's attributes?" |
| As dimensions grow | The number of roles grows **multiplicatively** | The number of policies **stays the same** |
| Onboarding a new team | New roles and policies must be created | Just attach tags |
| Auditability and explainability | Easy ("this role can do this") | Hard (depends on runtime tags) |
| Assessing impact during an incident | Look at one role | You must look at tag state as well |
| Failure point | Role explosion, accumulation of excess permissions | **Collapse of tag governance** |
| Suitable for | A small number of distinct job functions (security, DBA, audit) | Axes that keep growing, such as teams, environments, and projects |

The practical answer is not one or the other but a **mix**. Keep permissions that are distinct and few in number (security administrator, audit read-only) explicit with RBAC, and fold into ABAC only the axes where combinations keep growing, such as team and environment. If you adopt ABAC across the board, it becomes hard to explain "why can this person see this," and the cost of responding to audits rises.

### Tag Governance That Holds ABAC Up

A single ABAC policy line is elegant, but that elegance stands on the **assumption that tags are accurate**. Statements that enforce the assumption must accompany it.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowActionsOnlyOnMatchingTeamResources",
      "Effect": "Allow",
      "Action": ["ec2:StartInstances", "ec2:StopInstances", "ec2:RebootInstances"],
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Team": "${aws:PrincipalTag/Team}"
        }
      }
    },
    {
      "Sid": "RequireOwnTeamTagOnCreate",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestTag/Team": "${aws:PrincipalTag/Team}"
        },
        "ForAllValues:StringEquals": {
          "aws:TagKeys": ["Team", "Owner", "Env"]
        }
      }
    },
    {
      "Sid": "DenyRetaggingToEscapeOwnTeam",
      "Effect": "Deny",
      "Action": ["ec2:CreateTags", "ec2:DeleteTags"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:ResourceTag/Team": "${aws:PrincipalTag/Team}"
        }
      }
    },
    {
      "Sid": "DenySelfTaggingOfIdentities",
      "Effect": "Deny",
      "Action": ["iam:TagRole", "iam:UntagRole", "iam:TagUser", "iam:UntagUser"],
      "Resource": "*"
    }
  ]
}
```

The four statements each block one of ABAC's four collapse paths.

| Sid | Collapse path it blocks |
|-----|-------------------------|
| `AllowActionsOnlyOnMatchingTeamResources` | (the core) access to other teams' resources |
| `RequireOwnTeamTagOnCreate` | creating resources without tags and mass-producing resources outside control |
| `DenyRetaggingToEscapeOwnTeam` | overwriting another team's resource with your own team's tag to take it over |
| `DenySelfTaggingOfIdentities` | **changing the tags of your own identity to become a different team** |

The last statement is the most important. In ABAC, `aws:PrincipalTag/Team` is effectively the identity, so **if you can change your own tag, you can change your identity.** The privilege escalation logic from day 2 is reproduced exactly in the tag world. With Identity Center, this tag comes from an IdP attribute and so cannot be changed inside AWS; instead, **the permission to edit attributes in the IdP becomes the AWS privilege escalation path.** The control point has merely moved outside AWS - it has not disappeared.

When you use `ForAllValues:StringEquals` on `aws:TagKeys`, day 1's pitfall is reproduced exactly. This operator checks "are all the tag keys in the request inside the list," and **if you attach no tags at all, the condition is true.** That is why `RequireOwnTeamTagOnCreate` must be accompanied by a statement that directly requires `aws:RequestTag/Team` with `StringEquals`. `ForAllValues` is a whitelist saying "use only the allowed keys," not an enforcement saying "you must use them."

> 🎯 **Scenario**: "We decided to use the corporate IdP's `department` attribute directly for AWS access control. We turned on attribute mapping in Identity Center and deployed an ABAC policy, but when the HR system changed its department code scheme, the values switched from `payments` to a form like `PAY-001`. What happens?" → The tag values no longer match the resource side, and **access is silently cut off entirely.** This is ABAC's structural weakness - access control becomes coupled to the data schema of a system outside AWS. The practical response is to (1) not use IdP attributes as they are but put in a mapping layer so that the vocabulary of tag values on the AWS side stays fixed, (2) treat changes to the attribute scheme as deployment changes and create an advance-notice procedure, and (3) make a spike in AccessDenied caused by tag mismatches a monitoring metric.

## STS Sessions and Security Considerations

Everything you receive through federation is a temporary credential.

- **Session duration**: SAML/OIDC default is 1 hour, and up to 12 hours with the role's `MaxSessionDuration` setting
- **Session policy**: pass an additional policy at AssumeRole time to reduce the permissions of only that session (the 6th evaluation layer from day 1)
- **Session tags**: pass attributes for ABAC with `sts:TagSession`
- **Logs**: every AssumeRole call is recorded in CloudTrail → you can trace who used which role and when

A federated session is recorded with `aws:userid` in the form `ROLEID:session-name`, so even when several people use the same role, you can identify the actual individual by `sts:RoleSessionName` in CloudTrail. That is why, when designing federation, configuring the IdP to put an employee identifier (email or employee number) into the session name is the key to audit tracing.

### Trust Policies: The Real Control Point of Federation

If the permission policy decides "what can be done," **the trust policy decides "who can become this role."** In a federated environment, incidents happen far more often in the trust policy than in the permission policy. If the trust policy is broad, no matter how narrow the permission policy is, the *wrong person* ends up holding those permissions.

Listed from the most dangerous form to the safest, it looks like this.

```
[ Trust policy risk ladder — risky → safe ]

  ❌ "Principal": { "AWS": "*" }
        Anyone can attempt to switch. With no condition, it is effectively a public role

  ⚠️ "Principal": { "AWS": "arn:aws:iam::444455556666:root" }
        Trusts the **entire** other account. Any principal in that account can do it
        → Who uses it inside the other account is decided by the other party

  🙂 "Principal": { "AWS": "arn:aws:iam::444455556666:role/AuditRole" }
        Trusts only a specific role. The target becomes clear

  ✅ The above + Condition
        sts:ExternalId          — essential for third-party delegation
        aws:PrincipalOrgID      — excludes principals outside the organization
        aws:MultiFactorAuthPresent — requires MFA for human operation
        aws:SourceIp / SourceVpce  — restricts the path
```

There is a common misunderstanding about the second item (`:root`). It does not mean "the root user of the other account" but **"delegating to the other account,"** and the actual result is that *the other account's IAM administrators can grant anyone the permission to switch into this role.* It is commonly used for convenience, but you must use it knowing that our security becomes dependent on the other account's level of internal control.

When opening a role to a third-party SaaS, `sts:ExternalId` is mandatory.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::THIRD_PARTY_ACCOUNT:root" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "7f3c9a2b-e1d4-4a88-9c6f-2b0d5e91a4c7"
      }
    }
  }]
}
```

```
[ What ExternalId blocks — the confused deputy ]

  Without ExternalId:
    Our account ──trust──▶ SaaS account
    Another customer X asks the SaaS, "register this role ARN for me"
      → The SaaS (the deputy) switches into our role and works on behalf of X
      → The SaaS used legitimate permissions, but the requester was unauthorized

  With ExternalId:
    X does not know the ExternalId that only we know
      → Even if the SaaS attempts to switch, it is denied because the condition does not match ✅
```

The same problem also occurs **when an AWS service calls resources on our behalf.** In that case you block it not with `sts:ExternalId` but with `aws:SourceArn` and `aws:SourceAccount`.

```json
// Trust policy for a service principal — "only calls from our account, for this resource"
{
  "Effect": "Allow",
  "Principal": { "Service": "config.amazonaws.com" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": { "aws:SourceAccount": "111122223333" },
    "ArnLike": { "aws:SourceArn": "arn:aws:config:ap-northeast-2:111122223333:*" }
  }
}
```

`sts:ExternalId` and `aws:SourceArn` are two answers to the same problem (the confused deputy). The difference lies in **who the deputy is.** If the deputy is *another AWS account* (a third-party SaaS), that account handles many customers mixed together, so a secret value (`ExternalId`) is needed to tell customers apart; if the deputy is an *AWS service*, the service is already trusted, so instead of a secret you only need to confirm "which resource the call is for" (`SourceArn`). On the exam, if the `Principal` is a `Service` and an answer choice has `sts:ExternalId`, that is a signal of a wrong answer; conversely, if the `Principal` is a third-party account and you pick `aws:SourceArn`, that is also a mismatch.

The ExternalId is **a secret but not a means of authentication.** It must be an unguessable value (customer names or sequence numbers are forbidden), but it alone does not amount to strong authentication. That is why, for third-party delegation, the standard practice is to *narrow the permissions themselves to the minimum* together with the ExternalId and to keep watching the usage of the granted role through CloudTrail. "We set an ExternalId, so we can grant broad permissions" is faulty reasoning.

### When You Get Stuck in Federation

| Symptom | Likely cause |
|---------|--------------|
| `AssumeRoleWithSAML` itself fails | The trust policy `Principal` (saml-provider ARN) mismatch, `SAML:aud` condition mismatch, or expired IdP metadata |
| Switching fails once tags are included | The trust policy `Action` lacks `sts:TagSession` |
| Fails once `SourceIdentity` is included | The trust policy `Action` lacks `sts:SetSourceIdentity` |
| The switch works but the session is cut off at 1 hour | The role chaining path (1-hour cap), or `SessionDuration` was not passed |
| The requested 12 hours is rejected | The role's `MaxSessionDuration` is shorter than that |
| Intermittent failures in GitHub Actions | The `sub` condition does not match the branch or environment (tag pushes, PRs, and so on) |
| The ABAC policy suddenly denies everything | A change in an IdP attribute value, or a missing resource tag |
| An Identity Center role was edited but reverted | The Permission Set is the source. Do not edit the role directly |

## Summary

The modern answer to AWS access management is not "IAM users + access keys" but "federation + temporary credentials." You must distinguish the three branches - SAML (enterprise IdP), OIDC (mobile and CI/CD), and Identity Center (managed integration) - and map each to its STS API (`AssumeRoleWithSAML`, `AssumeRoleWithWebIdentity`) and trust policy precisely. And if you design tag-based access with ABAC, you get scalable governance without role explosion. Just remember that if tag governance collapses, ABAC collapses with it.

In the 2019 Capital One breach, what the attacker got hold of was **the temporary credentials of an EC2 instance role.** Through SSRF via a misconfigured WAF, the attacker reached the instance metadata and obtained credentials, then used them to list the S3 buckets and download the data. Information on roughly 106 million US and Canadian credit card applicants was affected. The lesson this incident offers to the federation discussion is paradoxical - **temporary credentials are not automatically safe.** Their temporary nature guarantees only that "a leaked key will not be valid forever"; it does nothing at all to narrow the scope of what can be done during the time it is valid. That is why the completion of a federation design lies not in adopting temporary credentials but in the session policies, permissions boundaries, and conditions (`aws:SourceVpce`, MFA) layered on top of them, and in tightening instance metadata access itself with IMDSv2 (the SCP from day 3).

Long-term access keys stored in CI/CD pipelines being exposed through public repositories or build logs has been a recurring event across the industry, which is why GitHub Actions, GitLab, and Kubernetes moved one after another toward building in OIDC issuers. However, there is a new mistake pattern that appears after switching to OIDC - **writing the trust policy's `sub` condition broadly, like `repo:org/*`.** The risk of leakage has been reduced by eliminating keys, but anyone in any repository in the organization can now switch into the production role, so the attack surface has in effect shifted. "Eliminating long-term keys" is half the goal; the other half is "narrowing the trust relationship that came in their place to the minimum."

### One-Line Summary

Getting rid of IAM users and long-term keys and moving to **federation + STS temporary credentials** is the modern standard, with SAML/Identity Center as the default path for people and OIDC for machines. The STS APIs divide into `AssumeRole` (AWS credentials), `AssumeRoleWithSAML` (XML Assertion), `AssumeRoleWithWebIdentity` (JWT), and `GetSessionToken` and `GetFederationToken`, which presuppose an IAM user. SAML carries the `Role`, `RoleSessionName`, and `PrincipalTag:` attributes and requires the `SAML:aud` condition, and to use tags or the original identity, the trust policy `Action` must also include `sts:TagSession` and `sts:SetSourceIdentity`. OIDC must pin down **both** `sub` and `aud`, and a wildcard like `repo:org/*` is effectively unlimited delegation. Identity Center defines Permission Sets centrally and deploys them to each account as `AWSReservedSSO_*` roles, and with SCIM a departed employee is reflected immediately, but getting rid of existing IAM users also requires an SCP block. ABAC prevents role explosion, but because tags are identity, you must Deny changing your own tags (`iam:TagRole`) and re-tagging others' resources, and in trust policies you block the confused deputy with `sts:ExternalId` for third parties and `aws:SourceArn`/`aws:SourceAccount` for AWS services.

In the next post, we will review all of Week 2 (evaluation logic → Boundary → SCP → federation/ABAC) by integrating it into a single multi-account governance scenario.

---

## 📝 Practice Questions

**Question 1.** A company deploying from GitHub Actions to AWS does not want to store long-term access keys in the workflow. What is the most appropriate method?

A) Create an IAM user and store the access key in GitHub Secrets  
B) Register GitHub as an OIDC provider and have it switch to a role restricted to a specific repository and branch using `AssumeRoleWithWebIdentity`  
C) Use root user credentials  
D) Attach a Permission Boundary to GitHub  

**Answer: B**  
Explanation: GitHub Actions supports OIDC, so if you register it as an OIDC provider and restrict a specific repository and branch with the `token.actions.githubusercontent.com:sub` condition in the trust policy, you receive only temporary credentials with no long-term keys. Storing access keys carries leak risk, using root is forbidden, and a Boundary is not something attached to GitHub.

---

**Question 2.** Users must access the AWS console after logging in with the company Active Directory. AD FS issues a SAML Assertion. Which STS API is used for this flow on the AWS side?

A) `sts:AssumeRole`  
B) `sts:GetSessionToken`  
C) `sts:AssumeRoleWithSAML`  
D) `sts:AssumeRoleWithWebIdentity`  

**Answer: C**  
Explanation: When receiving temporary credentials with a SAML Assertion issued by an enterprise SAML IdP (AD FS, Okta, and so on), use `AssumeRoleWithSAML`. A plain `AssumeRole` is for switching between IAM principals, `GetSessionToken` is a short-term token for MFA, and `AssumeRoleWithWebIdentity` is for OIDC (mobile, web, CI/CD).

---

**Question 3.** An organization wants to control EC2 access with a combination of 10 teams x 3 environments but wants to avoid role explosion to 30 roles. What is the most scalable approach?

A) Create all 30 roles  
B) Use an ABAC policy that allows only when the PrincipalTag and ResourceTag match  
C) Give all users AdministratorAccess  
D) Separate each team with SCPs  

**Answer: B**  
Explanation: ABAC covers an unlimited number of team and environment combinations with a single policy that allows access when the principal tag and resource tag match, preventing role explosion. 30 roles is itself the limit of RBAC, AdministratorAccess violates least privilege, and SCPs are account-level guardrails and unsuitable for per-team resource access control.

---

**Question 4.** In IAM Identity Center, what is the most effective way to ensure AWS access is blocked immediately when an employee leaves?

A) Manually delete IAM users in each account  
B) Integrate an external IdP with SCIM so that deactivating the user in the IdP automatically synchronizes the AWS access  
C) Rotate access keys  
D) Block the departed employee with an SCP  

**Answer: B**  
Explanation: When an external IdP is integrated with Identity Center through the SCIM protocol, AWS access is automatically cut the moment the user is deactivated in the IdP. This is the key benefit of the single source of truth model. Manual deletion carries a high risk of omissions, access keys do not exist in a federated environment, and SCPs are not a tool for handling individual departed employees.

---

**Question 5.** Multiple employees use the same federated role. What is needed to identify the actual individual who performed a specific action in CloudTrail?

A) It is possible only if a separate role is created for each individual  
B) If the IdP is configured to put an employee identifier (email or employee number) in the session name, the individual is identified by `sts:RoleSessionName`  
C) CloudTrail cannot identify federated users  
D) It can be identified only from MFA logs  

**Answer: B**  
Explanation: For federated sessions, `aws:userid` is recorded in the form `ROLEID:session-name`, and if the IdP is configured to put an employee identifier in the session name, the actual individual can be traced by `sts:RoleSessionName` in CloudTrail. Therefore there is no need to split roles per individual, and CloudTrail can identify federated users too.
