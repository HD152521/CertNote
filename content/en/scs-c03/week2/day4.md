# Day 4 - IAM Identity Center and Federation: SAML, OIDC, and ABAC

So far (day 1-3), we covered "how to restrict permissions." Today, we examine the modern answer to "how do you grant access to people." Creating individual IAM users for thousands of employees across hundreds of accounts is a nightmare. Long-lived credentials (access keys) have high breach risk, and managing departures is difficult.

The solution is **federation**. The company's existing ID system (Active Directory, Okta, Azure AD, etc.) becomes the source of trust, and AWS receives that trust to issue **temporary credentials**. Bundling this in a managed way is **IAM Identity Center** (formerly AWS SSO). SAML/OIDC flows and ABAC are guaranteed to appear on the Specialty exam.

## Why You Should Abandon IAM Users

First, let''s clarify the motivation. Problems with IAM users:

- **Long-lived credentials**: Access keys remain permanently valid unless rotated → catastrophic if breached
- **Duplication per account**: 200 accounts means 200 IAM users per person
- **Duplicated ID source**: Company HR/AD and AWS don''t sync → departed employee permissions persist
- **Scattered MFA management**: Configured separately per account

> 💡 **Related Theory**: The core of federation is **single source of truth** for identity. In identity management theory, this is called **identity federation**, where one place (IdP, Identity Provider) authenticates and multiple services (SP, Service Provider/RP, Relying Party) trust the result. Credentials are managed in one place only, so disabling a departed employee immediately reflects everywhere. AWS implements this pattern via STS temporary credentials — there are no permanent keys at all.

## SAML 2.0 Federation Flow

This is the traditional SAML flow used in enterprise environments (AD FS, Okta).

```
1. User logs into company portal (IdP)
2. IdP issues SAML Assertion (signed XML)
   → Contains user identity + IAM role info to be granted
3. User submits this Assertion to AWS STS
   (sts:AssumeRoleWithSAML)
4. AWS verifies IdP is trusted (SAML Identity Provider registration required)
5. STS issues temporary credentials (default 1 hour, max 12 hours)
6. User accesses AWS with those credentials
```

Two things are needed on the AWS side.

```json
// 1) Register SAML Identity Provider in IAM (upload IdP metadata XML)
// 2) Attach a trust policy to the role allowing AssumeRoleWithSAML
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

> ⚠️ **Pitfall**: `sts:AssumeRoleWithSAML` requires the `Principal` in the trust policy to be `Federated` pointing to the SAML provider. Don''t confuse this with regular `AssumeRole` (switching between IAM roles) or `AssumeRoleWithWebIdentity` (OIDC). Exams frequently ask you to distinguish among three STS APIs: `AssumeRole` (IAM principals), `AssumeRoleWithSAML` (enterprise SAML IdP), `AssumeRoleWithWebIdentity` (OIDC — mobile apps, Cognito, GitHub Actions, etc.).

## OIDC and Web Identity Federation

Mobile apps, web apps, and CI/CD environments (GitHub Actions) use OIDC (OpenID Connect).

```
sts:AssumeRoleWithWebIdentity
  - Google, Facebook, Cognito, GitHub OIDC provider, etc.
  - Submit JWT (JSON Web Token) to STS
  - Issue temporary credentials without hardcoding AWS credentials in mobile apps
```

A prime modern example: **Deploying from GitHub Actions to AWS using OIDC instead of access keys**. Register GitHub as an OIDC provider, add specific repo/branch conditions to the trust policy, and only that workflow can assume the role.

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

This way, you don''t need to store long-lived access keys in CI/CD, eliminating breach risk.

## IAM Identity Center: The Managed Version of Federation

Identity Center bundles the complex SAML/OIDC setup into a managed service.

- **Permission Set**: Defines "what permissions to grant in which account" (= IAM role template)
- **External IdP Integration**: Connect Okta, Azure AD, Ping, etc. via SAML/SCIM
- **Account Assignment**: User/group × Permission Set × account mapping
- **Single Sign-On Portal**: User logs in once, then accesses all authorized accounts

```
Employee "alice" → IdP group "Developers"
  → Identity Center: Assign "DeveloperAccess" Permission Set to Developers group
  → Map to both Prod and Dev accounts
  → alice logs into portal, both accounts appear, click to switch
```

> 🔍 **Deeper**: When Identity Center assigns a Permission Set to an account, it automatically creates an IAM role of the form `AWSReservedSSO_*` in that account. Internally, STS AssumeRole still works, but users don''t directly handle roles. The SCIM (System for Cross-domain Identity Management) protocol auto-syncs user/group changes from the IdP, so the moment a departed employee is disabled in the IdP, AWS access cuts off immediately.

## ABAC: Attribute-Based Access Control

As organizations grow, "creating a policy per role" (RBAC) explodes. 10 teams × 3 environments = 30 roles. ABAC (Attribute-Based Access Control) solves this with **tags**.

```
Principle: Access is allowed only when the principal''s tags (principal tag)
          match the resource''s tags (resource tag).
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

This single policy handles all teams. If `alice` has PrincipalTag `Team=payments`, she accesses only `Team=payments` resources; if `bob` has `Team=billing`, only `Team=billing` resources. New teams don''t require policy changes — just tag them.

When combined with Identity Center, user attributes from the IdP (e.g., AD department) flow through the SAML Assertion as PrincipalTag, so **changing a department in the IdP automatically updates AWS permissions**.

> 💡 **Related Theory**: ABAC is defined in NIST SP 800-162 as an access control model solving RBAC''s "role explosion" problem. RBAC is static (user→role→permission) mapping, so roles multiply as dimensions increase. ABAC is dynamic (attribute + policy rules) evaluation, so one rule covers infinite combinations. The downside: debugging is hard and tag governance is mandatory — missing or altered tags break access control.

> ⚠️ **Pitfall**: If users can change their own PrincipalTag or arbitrarily tag resources at creation, control breaks. That''s why you must use `aws:RequestTag` and `aws:TagKeys` conditions to force users to tag resources with their own team tag at creation, and strictly limit `iam:TagRole` and `sts:TagSession` permissions.

## STS Sessions and Security Considerations

Everything received via federation is temporary credentials.

- **Session Duration**: SAML/OIDC default 1 hour, roles'' `MaxSessionDuration` setting goes up to 12 hours
- **Session Policy**: Pass an additional policy during AssumeRole to narrow permissions for that session only (day 1''s 6th evaluation layer)
- **Session Tags**: Pass attributes via `sts:TagSession` for ABAC
- **Logging**: Every AssumeRole call is logged in CloudTrail → track who used which role when

> 🔍 **Deeper**: In a federation session, `aws:userid` is recorded as `ROLEID:session-name`, so even if multiple people use the same role, CloudTrail''s `sts:RoleSessionName` identifies the actual individual. That''s why IdP is configured to put employee identifiers (email, employee ID) in the session name — it''s the key to audit trail.

## Wrapping Up

The modern answer to AWS access management is not "IAM users + access keys" but "federation + temporary credentials." Distinguish among three types: SAML (enterprise IdP), OIDC (mobile/CI/CD), Identity Center (managed integration). Each has its STS API (`AssumeRoleWithSAML`, `AssumeRoleWithWebIdentity`) and trust policy mapping, which you must know precisely. And with ABAC, you design tag-based access for scalable governance without role explosion. Just remember: if tag governance breaks, so does ABAC.

In the next session, we integrate all of Week 2 (evaluation logic → Boundary → SCP → federation/ABAC) into one multi-account governance scenario for review.

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
