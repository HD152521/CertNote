# Day 4 - IAM Identity Center, Permission Set, Consolidated Billing: Multi-Account SSO Standard

200 employees accessing 80 AWS accounts. Average employee needs 10 different permissions across 10 accounts. Create as IAM Users: 200 × 10 = 2,000 IAM Users. One employee resigns: visit 80 accounts, revoke 10 permissions each. Miss one, security breach. This operational burden was multi-account's biggest enemy.

In 2017, AWS launched **AWS SSO** to solve this. In 2022, renamed to **IAM Identity Center**. Pro exam: "multi-account SSO" or "employee SSO" keywords = 99% IDC is the answer.

Today we cover IAM Identity Center's structure, Permission Set mechanics, SCIM auto-sync, external IdP (Okta·Azure AD) integration, CLI v2 SSO, and Consolidated Billing effects. Also, a frequently confused trap — **IDC vs Cognito** difference.

## IAM Identity Center's Essence

- Old name: AWS Single Sign-On (AWS SSO, 2017~2022)
- Current name: IAM Identity Center (2022 rename)
- **Multi-account SSO standard solution** (Pro exam staple)
- Integrated with AWS Organizations
- Self-managed directory or external IdP (Okta, Azure AD/Entra ID, Google Workspace, AD)
- Console + CLI v2 + all AWS service SDKs supported
- **Free** (IDC itself has no charge, related services like AD Connector cost extra)

> 💡 **Related theory**: SSO started with SAML (Security Assertion Markup Language) in 1990s. SAML 2.0, OASIS standard 2005, exchanged XML assertions for single login accessing multiple services. 2010s: OIDC (OpenID Connect, JWT-based) and OAuth 2.0 gained traction for mobile·SPA. IDC supports both SAML 2.0 and OIDC for compatibility with both IdP ecosystems. SCIM (RFC 7644, 2015) is user·group auto-sync standard; IDC auto-reflects user changes from external IdPs. [AWS re:Inforce 2019 talk](https://aws.amazon.com/blogs/security/protect-sensitive-data-in-the-cloud-with-advanced-hsm-and-access-controls/).

> 🔍 **Going deeper**: IDC used parts of **AWS Managed Microsoft AD** during AWS SSO era, but post-2022 rebrand got separate backend. Internally: (1) Cognito User Pool variant, (2) STS AssumeRole API wrapper, (3) Permission Set abstraction layer. When Permission Set attaches, backend auto-creates `AWSReservedSSO_<PermissionSet>_<random>` IAM Role in each member account. User selecting account in SSO portal = AssumeRole-ing that Role.

## Core Components

```
External IdP (Okta)        OR     Internal Directory (IDC built-in / AD)
        │                                   │
        ▼ SAML + SCIM                       ▼
        ┌──────────────────────────────────┐
        │    IAM Identity Center           │
        │    (installed on Management)     │
        │                                  │
        │    Users / Groups                │
        │    Permission Sets               │
        └──────────────────────────────────┘
                  │
                  ▼ mapping
        Account A  Account B  Account C
        (AWSReservedSSO_* Roles auto-created)
```

## Permission Set Structure

Permission Set = permission bundle abstraction.

- Combine AWS Managed Policy + Customer Managed Policy + Inline Policy
- Mapping account+group+Permission Set → **auto-creates IAM Role in that account** (`AWSReservedSSO_<PermissionSet>_<random>`)
- Session length 1~12 hours configurable
- Can attach Permission Boundary

**Common Permission Set examples**:

| Permission Set | Permissions | Session |
|----------------|-------------|---------|
| `AdministratorAccess` | All | 1h (strongly recommended) |
| `PowerUserAccess` | Exclude IAM·billing | 4h |
| `ReadOnlyAccess` | View-only | 8h |
| `Billing` | Billing-only | 1h |
| `DataScientist` | S3, SageMaker, Athena etc. | 4h |
| `DevOps` | Deploy·operate | 4h |

> 🎯 **Scenario**: "Security team minimizes admin permission use. IDC config?" — Answer: **Short AdministratorAccess session (1h) + enforce MFA + CloudTrail all usage alerts**. Short sessions minimize token-theft impact. Typical pattern: PowerUserAccess day-to-day, Admin permissions temporarily for admin tasks (break-glass).

## User → Account Mapping Flow

```
Okta user (developers group)
   │
   ▼  SAML login
IDC portal (https://d-xxxx.awsapps.com/start)
   │
   ▼  select account + Permission Set
sts:AssumeRole (auto) → account's IAM Role
   │
   ▼
Console or CLI use (session auto-renew on expiry)
```

## External IdP Integration

| IdP | User Sync | Auth Protocol |
|-----|-----------|---------------|
| **Okta** | SCIM auto-sync | SAML 2.0 |
| **Azure AD / Entra ID** | SCIM | SAML or OIDC |
| **Google Workspace** | SCIM or SAML | SAML |
| **AWS Managed Microsoft AD** | Direct integration | Kerberos |
| **AD Connector** | On-prem AD link | LDAP → SAML |
| **JumpCloud, OneLogin** | SCIM | SAML |

> ⚠️ **Pitfall**: "On-prem AD + AWS console SSO" → AD Connector or AWS Managed AD + IDC. AD Connector is simple proxy; IDC queries AD via LDAP. AWS Managed AD = create full new AD in AWS — needed for migration.

> 🔍 **Going deeper**: SCIM (RFC 7644) pushes user·group change events from IdP to Service Provider. Okta user disabled → 5 min IDC disabled → AWS console blocked. JIT (Just-in-Time) provisioning syncs on next login attempt, so already-logged-in sessions stay until expiry. SCIM is dramatically faster for incidents.

> 📚 **Case study**: 2020 Twilio breach. Employee Okta credentials phished → attacker accessed some Twilio systems. Post-incident Twilio deployed (1) FIDO2 hardware token forced, (2) IDC session shortening, (3) suspicious-IP logins auto-blocked. This became cloud SSO security standard.

## CLI v2 SSO Flow

```bash
aws configure sso
# Start URL: https://d-xxxx.awsapps.com/start
# Region: ap-northeast-2
# Browser auto-opens → authenticate
# Select account·role
# Save profile name

# Later use
aws s3 ls --profile dev-account
# Automatically uses SSO token

# Renew token (on expiry)
aws sso login --profile dev-account
```

> 🔍 **Going deeper**: CLI v2 SSO uses device authorization grant (OIDC RFC 8628). CLI shows verification URL and user code; user authenticates in browser; CLI gets access token from token endpoint. Benefits: (1) CLI never sees user password, (2) MFA works naturally, (3) browser's SSO session reused. Downside: first auth needs browser. Headless CI unfit — CI uses OIDC + AssumeRoleWithWebIdentity pattern (GitHub Actions etc.).

## ABAC + IDC: Dynamic Permission's Peak

IDC propagates IdP user attributes (e.g., Department, CostCenter) as SAML Attributes → IAM Role session tags → resource tag matching for dynamic permissions.

```
[Okta user]
  Attributes: Department = "DataScience", Project = "AlphaModel"
       │
       ▼ SAML
[IDC] → Permission Set's IAM Role assume grants session tags:
       aws:PrincipalTag/Department = DataScience
       aws:PrincipalTag/Project = AlphaModel
       │
       ▼
[IAM Policy in Role]:
  Effect: Allow
  Action: s3:GetObject
  Resource: arn:aws:s3:::data-*
  Condition:
    StringEquals:
      aws:ResourceTag/Project: ${aws:PrincipalTag/Project}
```

Adding new users or projects needs no IAM policy edits — just set IdP attributes.

> 💡 **Related theory**: ABAC (Attribute-Based Access Control) formalized by NIST SP 800-162 (2014). RBAC: "role owns permissions", ABAC: "principal·resource·environment attribute combination determines permissions". RBAC has N roles × M permissions explosion, ABAC computes dynamically via attributes. 100+ projects: ABAC overwhelmingly better.

> 🎯 **Scenario**: "Company runs 100 projects, each with separate S3 bucket·EC2. Users access only their project resources. RBAC = 100 Role × N users explosion. Solution?" — Answer: **ABAC + IDC**. IdP user attribute = Project → session tag → resource tag match. One ABAC policy handles 100 projects.

## IAM Identity Center vs Cognito: Never Confuse

| | IDC | Cognito |
|---|-----|---------|
| Target | **Employees·admins** (console·CLI) | **Customer users** (app signup) |
| Use | Multi-account employee SSO | Social login, app auth |
| Auth flow | SAML/OIDC + STS AssumeRole | OAuth 2.0 + JWT |
| Pricing | Free | $0.0055/user/month |
| Core feature | Permission Set, multi-account | User Pool, Identity Pool, Social |

> ⚠️ **Pitfall**: "B2C app customer signup = IAM Identity Center" is 100% trap. Customer auth = Cognito. Employee·admin SSO only = IDC. This one line almost guarantees one exam question solved.

## Consolidated Billing Effects and Limits

| Effect | Description |
|--------|-------------|
| **Single invoice** | CFO·accounting simplified |
| **Volume discount pooling** | All accounts' usage pooled for tier discounts (S3 storage, CloudFront transfer) |
| **RI·Savings Plans sharing** | Management/Org-level share; unused SP used by other accounts |
| **Data transfer tier discount** | Full outbound pooled for tier discount |

**Limits**:
- Member accounts can't view billing/invoices (Management grants IAM permission needed)
- Refunds·credits centralized to Management
- Some marketplace subscriptions are per-account

> 🔍 **Going deeper**: RI/SP Sharing ON by default. Toggle "Linked Account Sharing" in Billing Console to turn off. Off = each member account uses only its RIs. Usually ON — night-shift unused RI used by day-shift account maximizes organization efficiency. Cost precise split? Turn off or use Cost Allocation Tags.

> 🎯 **Scenario**: "Company: 80 accounts, some 24/7, some 9-18h only. Minimize RI cost?" — Answer: **Keep Consolidated Billing RI Sharing ON + Compute Savings Plans 1-year**. Night-unused SP auto-used by other dept. Compute SP covers EC2·Fargate·Lambda all, most flexible.

## CLI Direct View

```bash
# Create Permission Set
aws sso-admin create-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --name DevOpsAccess \
  --session-duration PT4H

# Attach AWS Managed Policy
aws sso-admin attach-managed-policy-to-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --permission-set-arn arn:aws:sso:::permissionSet/xxx \
  --managed-policy-arn arn:aws:iam::aws:policy/PowerUserAccess

# Map account + group + Permission Set
aws sso-admin create-account-assignment \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --target-id 111111111111 --target-type AWS_ACCOUNT \
  --permission-set-arn arn:aws:sso:::permissionSet/xxx \
  --principal-type GROUP --principal-id <okta-group-uuid>

# List IDC instances
aws sso-admin list-instances
```

## Summary

The picture today is threefold. First, **IAM Identity Center is multi-account SSO standard** and Permission Set auto-creates IAM Roles. Second, **external IdPs auto-sync via SCIM** so employees' access is revoked immediately on resignation across all accounts. Third, **IDC is employees, Cognito is customers** — never confuse.

Consolidated Billing auto-applies on Org join, RI/SP sharing maximizes cost efficiency. ABAC + IDC combo is standard for 100+ project environments preventing IAM policy explosion.

Next article presents **Week 2 integrated scenarios 12 questions**. Organizations·SCP·Control Tower·IDC operate simultaneously in Pro-difficulty problems.

---

## 📝 연습 문제

**문제 1.** 100 AWS accounts + Okta IdP + console/CLI SSO. Best?

A) Register SAML IdP in each account
B) IAM Identity Center + Okta (SCIM + SAML)
C) Cognito Hosted UI
D) Direct Connect + AD

**정답: B**
해설: Multi-account SSO = IDC. Okta integrates via SCIM (user sync) + SAML (auth). 100 accounts managed together. C is customer-facing. D is networking.

---

**문제 2.** Assign Permission Set to account·group. Result?

A) IAM User created
B) Account's `AWSReservedSSO_*` IAM Role auto-created
C) Resource Policy updated
D) SCP created

**정답: B**
해설: IDC backend auto-creates IAM Role. User selecting account in SSO portal = AssumeRole-ing that Role. Role name format: `AWSReservedSSO_<PermissionSet>_<random>`.

---

**문제 3.** B2C app customer signup·login. Which service?

A) IAM Identity Center
B) Cognito User Pool
C) IAM User
D) Directory Service

**정답: B**
해설: Customer auth = Cognito. Employees = IDC. Never confuse this one line.

---

**문제 4.** Consolidated Billing benefit that's NOT one?

A) RI/SP sharing
B) Volume discount pooling
C) Security boost
D) Single invoice

**정답: C**
해설: Billing consolidation isn't security itself (but Org-level SCP/CT separately boost security). RI/SP share ON default.

---

**문제 5.** Okta employee resigns. Revoke from ALL AWS accounts fastest. Best?

A) Delete each account's IAM User
B) Okta deactivate → IDC SCIM sync auto-revokes all (within 5 min)
C) SCP block
D) CloudTrail monitor

**정답: B**
해설: Okta deactivate → SCIM → IDC → Role access blocked. ~5 min. JIT provisioning waits for next login so SCIM dramatically faster. Post-Twilio (2020) phishing response standard.

---

**문제 6.** Shorten IDC session to 1 hour. Why?

A) Cost saving
B) Security — minimize exposed-token impact (especially admin)
C) Performance
D) IAM simplification

**정답: B**
해설: Short session = stolen token damages minimized. Admin 1h, dev 4h, readonly 8h standard. break-glass pattern: PowerUser day-to-day, Admin session temporarily for admin work.

---

**문제 7.** 100 projects, each separate S3·EC2. User accesses only their project. RBAC = 100 Role explosion. Solution?

A) Create 100 Permission Sets
B) ABAC + IDC (user attribute → session tag → resource tag match)
C) 100 OUs
D) 100 accounts

**정답: B**
해설: ABAC standard (NIST SP 800-162). IdP user attribute = Project → session tag → resource tag matching. One policy handles 100 projects. New project: set attribute, policy unchanged.

---

**문제 8.** 80 accounts: some 24/7, some 9-18h. Minimize RI cost?

A) RI Sharing OFF
B) Consolidated Billing + RI Sharing ON (default) + Compute Savings Plans
C) On-Demand only
D) Spot only

**정답: B**
해설: RI Sharing ON lets night-unused RI used by day-shift account. Compute SP covers EC2·Fargate·Lambda most flexible. Cost precise split? Sharing OFF or use Cost Allocation Tags.
