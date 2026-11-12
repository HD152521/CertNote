# Day 4 - IAM Identity Center, Permission Sets, Consolidated Billing: The Standard for Multi-Account SSO

200 employees need to access 80 AWS accounts. Each employee enters an average of 10 accounts with different permissions. If you create these as IAM Users, that is 200 × 10 = 2,000 IAM Users. When one employee leaves, you have to walk through 80 accounts one by one and revoke all 10 permissions. If you miss even one in the meantime, it is a security incident. This operational burden was the biggest enemy of the multi-account environment.

In 2017 AWS launched **AWS SSO** to solve this problem, and in 2022 it was renamed **IAM Identity Center**. When you see the keywords "multi-account SSO" or "employee SSO" in the Pro exam, IDC is the answer 99% of the time.

Today we cover the structure of IAM Identity Center, how Permission Sets work, automatic SCIM synchronization, external IdP (Okta, Azure AD) integration, CLI v2 SSO, and the effects of Consolidated Billing. We also sort out another frequently confused trap — the difference between **IDC and Cognito**.

## The Essence of IAM Identity Center

- Former name: AWS Single Sign-On (AWS SSO, 2017-2022)
- Current name: IAM Identity Center (renamed in 2022)
- **The standard solution for multi-account SSO** (within Pro exam scope)
- Integrated with AWS Organizations
- Integrates with its own directory or an external IdP (Okta, Azure AD/Entra ID, Google Workspace, AD)
- Supports the console + CLI v2 + the SDKs of all AWS services
- **Free** (IDC itself has no charge, but auxiliary services such as AD Connector are billed separately)

SSO started in the 1990s with SAML (Security Assertion Markup Language). SAML 2.0 became an OASIS standard in 2005; it exchanges XML-based assertions so that a single login gives access to multiple services. In the 2010s, OIDC (OpenID Connect, JWT-based) and OAuth 2.0 rose because they are friendly to mobile and SPAs. IDC supports both SAML 2.0 and OIDC, so it is compatible with the IdP ecosystems on both sides. SCIM (RFC 7644, 2015) is the standard for automatic user and group synchronization, and it is the mechanism by which IDC automatically reflects user changes from an external IdP.

In the earlier AWS SSO days, IDC used some features of **AWS Managed Microsoft AD**, but after the 2022 rebrand it was separated onto its own backend. Internally it works as (1) a Cognito User Pool variant, (2) a wrapper around the STS AssumeRole API, and (3) a Permission Set abstraction layer. When a Permission Set is attached, the backend automatically creates an `AWSReservedSSO_<PermissionSet>_<random>` IAM Role in each member account, and when a user selects an account in the SSO portal, they AssumeRole that Role.

## Core Components

```
External IdP (Okta)        OR     Internal Directory (IDC built-in / AD)
        │                                   │
        ▼ SAML + SCIM                       ▼
        ┌──────────────────────────────────┐
        │    IAM Identity Center           │
        │    (installed in the Org         │
        │     Management Account)          │
        │                                  │
        │    Users / Groups                │
        │    Permission Sets (permission   │
        │     bundles)                     │
        └──────────────────────────────────┘
                  │
                  ▼ Mapping
        Account A  Account B  Account C
        (AWSReservedSSO_* Role auto-created)
```

## Permission Set Structure

Permission Set = an abstraction of a bundle of permissions.

- Can combine AWS Managed Policy + Customer Managed Policy + Inline Policy
- When you map Account + Group + Permission Set, **an IAM Role is automatically created in that account** (`AWSReservedSSO_<PermissionSet>_<random>`)
- Session length can be set from 1 to 12 hours
- A Permission Boundary can be attached

**Representative Permission Set examples**:

| Permission Set | Permissions | Session |
|----------------|-------------|---------|
| `AdministratorAccess` | Full permissions | 1h (strongly recommended) |
| `PowerUserAccess` | Excludes IAM and billing | 4h |
| `ReadOnlyAccess` | Read only | 8h |
| `Billing` | Billing only | 1h |
| `DataScientist` | S3, SageMaker, Athena, etc. | 4h |
| `DevOps` | Deployment and operations | 4h |

> 🎯 **Scenario**: "A security team wants to minimize the use of Admin permissions. What IDC settings?" — Answer: **shorten the AdministratorAccess Permission Set session length to 1 hour + enforce MFA + CloudTrail alerts on every use**. Short sessions minimize the impact if a token is stolen. The pattern is to use PowerUserAccess normally and use Admin permissions only temporarily during administrative work (break-glass).

## User → Account Mapping Flow

```
Okta user (developers group)
   │
   ▼  SAML login
IDC portal (https://d-xxxx.awsapps.com/start)
   │
   ▼  Choose account + Permission Set
sts:AssumeRole (automatic) → the IAM Role in that account
   │
   ▼
Use the console or CLI (automatically renewed when the session expires)
```

## External IdP Integration

| IdP | User synchronization | Authentication protocol |
|-----|----------------------|-------------------------|
| **Okta** | SCIM automatic synchronization | SAML 2.0 |
| **Azure AD / Entra ID** | SCIM | SAML or OIDC |
| **Google Workspace** | SCIM or SAML only | SAML |
| **AWS Managed Microsoft AD** | Direct integration | Kerberos |
| **AD Connector** | Connects on-premises AD | LDAP → SAML |
| **JumpCloud, OneLogin** | SCIM | SAML |

> ⚠️ **Pitfall**: "Use on-premises AD + AWS console SSO" → AD Connector or AWS Managed AD + IAM Identity Center. AD Connector is a simple proxy, so it does not look at AD directly; IDC queries AD over LDAP. AWS Managed AD builds a brand-new complete AD in AWS — choose the latter when migration is required.

SCIM (RFC 7644) is the standard for pushing user and group change events from the IdP to the SP (Service Provider). Deactivate a user in Okta → within 5 minutes IDC also deactivates them → AWS console access is blocked. If it were JIT (Just-in-Time) provisioning instead of SCIM, synchronization happens at the next login attempt, so sessions that are already logged in remain until they expire. In a security incident, SCIM is overwhelmingly faster.

The 2020 Twilio incident: an employee's Okta credentials were leaked through phishing, and the attacker accessed some of Twilio's systems. After the incident, Twilio introduced (1) enforced FIDO2 hardware tokens, (2) shorter IDC session lengths, and (3) automatic blocking of logins from suspicious IPs. The same pattern became the SSO security standard in cloud environments.

## CLI v2 SSO Flow

```bash
aws configure sso
# Start URL: https://d-xxxx.awsapps.com/start
# Region: ap-northeast-2
# The browser opens automatically → authenticate
# Choose the account and role
# Save the profile name

# Use afterward
aws s3 ls --profile dev-account
# Automatically uses the SSO token

# Refresh the token (when it expires)
aws sso login --profile dev-account
```

SSO in CLI v2 uses the device authorization grant (OIDC, RFC 8628). The CLI displays a verification URL and a user code, and when the user authenticates in the browser, the CLI receives an access token from the token endpoint. The advantages of this approach are that (1) the CLI never sees the user's password, (2) MFA works naturally, and (3) the browser's SSO session can be reused. The downside is that a browser is required for the first authentication. It is unsuitable for headless CI — in CI, use the OIDC + AssumeRoleWithWebIdentity pattern (GitHub Actions, etc.).

## ABAC + IDC: The Pinnacle of Dynamic Permissions

IDC propagates the IdP's user attributes (e.g., Department, CostCenter) as SAML Attributes → IAM Role session tags → dynamic permissions through resource-tag matching.

```
[Okta user]
  Attributes: Department = "DataScience", Project = "AlphaModel"
       │
       ▼ SAML
[IDC] → When assuming the Permission Set's IAM Role, session tags are given:
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

No IAM policy changes are needed when adding a new user or creating a new project — just assign the attribute in the IdP and you are done.

ABAC (Attribute-Based Access Control) is a model formalized in NIST SP 800-162 (2014). In RBAC (Role-Based), "a role holds permissions"; in ABAC, "the combination of subject, resource, and environment attributes decides permissions." RBAC suffers a multiplicative explosion of N roles × M permissions, while ABAC computes dynamically from attribute combinations. In an organization with 100+ projects, ABAC is decisively superior.

> 🎯 **Scenario**: "A company runs 100 projects, and each project has its own separate S3 buckets and EC2. Users can access only their own project's resources. With RBAC, it explodes into 100 Roles × N people. How?" — Answer: **ABAC + IDC**. Assign Project as a user attribute in the IdP → propagate it as an IAM Role session tag → dynamic permissions through matching against resource tags. A single ABAC policy handles all 100 projects.

## IAM Identity Center vs Cognito: Never Confuse Them

| | IDC | Cognito |
|---|-----|---------|
| Target | **Employees and administrators** (console, CLI) | **Customer users** (app sign-up) |
| Used for | Multi-account SSO | Social login, app authentication |
| Authentication flow | SAML/OIDC + STS AssumeRole | OAuth 2.0 + JWT |
| Price | Free | $0.0055 per user per month |
| Key features | Permission Sets, multiple AWS accounts | User Pool, Identity Pool, Social Login |

> ⚠️ **Pitfall**: An answer choice like "use IAM Identity Center for customer sign-up in a B2C app" is a 100% trap. Customer authentication is Cognito. Only employee and administrator SSO is IDC. This one line solves almost one whole exam question every time.

## Effects and Limits of Consolidated Billing

| Effect | Description |
|--------|-------------|
| **Single invoice** | Simplifies work for the CFO and accounting |
| **Combined volume discounts** | Usage of all accounts is added together for tiered discounts (S3 storage tiers, CloudFront data transfer) |
| **RI and Savings Plans sharing** | Shared at the Management/Org level, and unused SP can be used by other accounts |
| **Data transfer tier discounts** | Total outbound is summed |

**Limits**:
- A member account cannot see billing information or invoices (IAM permission must be granted from the management account)
- Refunds and credits are unified under Org Management
- Some marketplace subscriptions are per member account

RI/SP Sharing is ON by default. You can turn it off with the "Linked Account Sharing" toggle in the Billing Console. If you turn it off, each member account uses only its own RIs. Usually it is left on — RIs one account does not use at night are used by another account in the daytime, maximizing company-wide efficiency. But if you want to separate costs by department precisely, turning it off is clearer.

> 🎯 **Scenario**: "A company runs 80 accounts; some departments run 24/7, others only 9-18h. How do you minimize RI cost?" — Answer: **keep Consolidated Billing's RI Sharing ON + Compute Savings Plans for 1 year**. SP not used at night is automatically used by other departments. Compute SP applies to EC2, Fargate, and Lambda, so it is the most flexible.

## CLI Direct View

```bash
# Create a Permission Set
aws sso-admin create-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --name DevOpsAccess \
  --session-duration PT4H

# Attach an AWS Managed Policy
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

# Look up the IDC instance
aws sso-admin list-instances
```

## Architecture Diagram: Three Entrances for People, Machines, and Pipelines

What the Pro exam actually makes you distinguish is "who is coming in." People, on-premises servers, and CI/CD pipelines must each use a different entrance. Summarized in one figure:

```
 ┌──────────────┐  ┌──────────────────┐  ┌─────────────────┐
 │ People        │  │ On-prem servers   │  │ CI/CD pipelines  │
 │ (employees)   │  │ and devices       │  │                  │
 └──────┬───────┘  └────────┬─────────┘  └────────┬────────┘
        │                   │                     │
   SAML/OIDC           X.509 certificate       OIDC token
        │                   │                     │
 ┌──────▼───────┐   ┌───────▼────────┐   ┌────────▼─────────┐
 │ External IdP  │   │ IAM Roles      │   │ IAM OIDC          │
 │ (Okta/Entra)  │   │ Anywhere       │   │ Identity Provider │
 └──────┬───────┘   │ (Trust Anchor  │   │ (GitHub/GitLab)   │
        │ SCIM      │  + Profile)    │   └────────┬─────────┘
        │ (user sync)└───────┬────────┘            │
 ┌──────▼────────────────┐     │            AssumeRoleWithWebIdentity
 │ IAM Identity Center    │     │                     │
 │ (installed in the      │  AssumeRole              │
 │  Management account,   │     │                     │
 │  fixed to 1 home       │     │                     │
 │  Region)               │     │                     │
 │  Users / Groups        │     │                     │
 │  Permission Sets       │     │                     │
 └──────┬─────────────────┘     │                     │
        │ Account Assignment    │                     │
        ▼                       ▼                     ▼
 ┌──────────────────────────────────────────────────────────┐
 │  Member accounts A / B / C ...                            │
 │   AWSReservedSSO_<PS>_<random>   App-specific   Deploy    │
 │   (auto-created and auto-revoked  Role          Role      │
 │    by IDC)                        (cert-based)  (OIDC-based)│
 └──────────────────────────────────────────────────────────┘

  ▼ One sentence that separates the three
  A person comes in via console/CLI        → IAM Identity Center
  A server or agent in a data center       → IAM Roles Anywhere
  A pipeline such as GitHub Actions        → OIDC + AssumeRoleWithWebIdentity
  Note: all three share the same goal: "do not create long-term Access Keys."
```

The common design philosophy of the three entrances is **eliminating long-term credentials (credential-less)**. An IAM User's Access Key has no expiry, so once leaked it stays valid until revoked. By contrast, all three paths end in STS temporary credentials (default 1 hour, maximum 12 hours). Even if leaked, they die by themselves over time. This is why answer choices like "store the Access Key in code" or "create an IAM User for CI" are easily used as wrong answers on the Pro exam.

The IAM Identity Center instance is created in **one home Region**, and the identity store lives there too. To move it to another Region later, you have to delete the instance and recreate it, and then every Permission Set assignment disappears. An organization with data sovereignty requirements should align the Landing Zone home Region and the IDC home Region from the start.

## Trade-off Comparison Table: 5 Ways to Solve Multi-Account Access

Even the same requirement, "give access to 80 accounts," has five means. The Pro exam puts these five side by side and makes you pick one by the qualifier.

| Method | Credential lifetime | Operational burden | Revocation speed on termination | Audit trail | Suitable for |
|--------|---------------------|--------------------|---------------------------------|-------------|--------------|
| **IAM User in every account** | Unlimited (long-term keys) | **Worst** (accounts × people) | Manual, risk of omission | Scattered per account | Effectively an anti-pattern |
| **Hub-account IAM User + Cross-Account Role** | Temporary (AssumeRole) | Medium (Role trust relationships to manage) | Delete just the one hub User | Traceable per Role | Small scale, transition period |
| **IAM Identity Center** | Temporary (1-12h) | **Lowest** | **Automatic within minutes via SCIM** | Centralized | **The standard for employee SSO** |
| **IAM Roles Anywhere** | Temporary | Medium (PKI operation needed) | Certificate revocation (CRL) | Traceable per Role | On-prem servers and devices |
| **OIDC federation** | Temporary (per job) | Low | Immediate via repo and branch conditions | Traceable per job | CI/CD pipelines |

**"People use IDC, machines use Roles Anywhere, builds use OIDC."** This one line settles a large share of the identity questions on the Pro exam. And in no case is an **IAM User + long-term Access Key** the answer.

> 🎯 **Scenario**: "200 backup agents in an on-premises data center need to upload to S3. We want to rotate credentials automatically without distributing Access Keys to each server." — Answer: **IAM Roles Anywhere**. Register the internal PKI as a Trust Anchor, and each server obtains STS temporary credentials with its X.509 certificate. IDC is for people, so it does not fit 200 unattended servers, and 200 IAM Users make key rotation operationally impossible.

## The Order of Moving from IAM Users to IDC

"IAM Users are already scattered across each account. Move to IDC with zero downtime." — If you get the order wrong in this migration, people cannot get into the console and an incident occurs.

```
Step 1  Understand the current state (Inventory)
   ├── Collect IAM Users, Access Keys, and last-used times from all accounts
   ├── Use Access Advisor to extract only the services each User actually used
   └── Rationale: copying existing permissions as is carries the excess
             permissions over unchanged. The actual usage history is the only
             basis for Permission Set design.

Step 2  Design Permission Sets (standardize roles)
   ├── Redesign by job function bundles, not individual permissions
   ├── Differentiate session length: Admin 1h / DevOps·Data 4h / ReadOnly 8h
   └── Rationale: if you carry over the "different policy per person" of the
             IAM User era as is, the advantage of IDC (group-level management)
             is lost.

Step 3  Connect the IdP and SCIM synchronization (read-only validation)
   ├── Connect Okta/Entra ID to IDC, sync groups and users with SCIM
   ├── First assign only the ReadOnlyAccess Permission Set to a few accounts to validate
   └── Rationale: confirm the authentication path first. If you start by
             granting large permissions, then when a problem occurs you cannot
             separate whether the cause is authentication or permissions.

Step 4  Parallel operation (Dual-run)
   ├── Keep IAM User and IDC access open at the same time for a period
   ├── Inform users of the SSO portal URL, distribute a CLI profile switch guide
   └── Rationale: CLIs, SDKs, and third-party tools use old keys in unexpected
             places. If you cut over without a parallel period, batch and
             monitoring tools die with it.

Step 5  Track residual usage, then deactivate IAM Users
   ├── Use CloudTrail to track "calls still coming in as IAM Users"
   ├── Delete human accounts; migrate automation ones individually to Role or OIDC
   └── Rationale: if you delete in bulk without distinguishing human from
             automation, nightly batches silently stop.

Step 6  Block the way back with SCP
   ├── Deny iam:CreateUser and CreateAccessKey in member accounts with an SCP
   └── Rationale: if you do not block it, someone will create an IAM User again
             in an emergency. The migration must be fixed by policy so it does
             not revert.
```

What is easy to miss in Step 5 is the **IAM Users for third-party SaaS integrations**. It is common for monitoring tools, cost-analysis SaaS, and backup vendors to be using Access Keys created long ago. They are not people, so they cannot be moved to IDC, and must be migrated individually with a **Cross-Account Role + External ID** approach. External ID is an essential element that prevents confused deputy attacks — it stops a vendor from accessing another customer's account with its own Role.

## A Real Permission Set: Down to Policy, Boundary, and Attributes

A Permission Set is more than simply attaching a managed policy. You can combine inline policies, customer managed policy references, and permissions boundaries.

```bash
# 1) Attach an inline policy — narrow permissions that apply only to this Permission Set
aws sso-admin put-inline-policy-to-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-xxx/ps-yyy \
  --inline-policy file://data-scientist-inline.json

# 2) "Reference" a customer managed policy — a policy with the same name must exist in each target account
aws sso-admin attach-customer-managed-policy-reference-to-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-xxx/ps-yyy \
  --customer-managed-policy-reference Name=CorpDataAccess,Path=/

# 3) Attach a permissions boundary — a ceiling this Permission Set cannot exceed
aws sso-admin put-permissions-boundary-to-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-xxx/ps-yyy \
  --permissions-boundary \
    ManagedPolicyArn=arn:aws:iam::aws:policy/PowerUserAccess

# 4) After changes you must re-provision for them to be reflected in each account's Role
aws sso-admin provision-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-xxx/ps-yyy \
  --target-type ALL_PROVISIONED_ACCOUNTS
```

```json
// data-scientist-inline.json — an ABAC policy that lets users read only buckets whose project tag matches
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListOwnProjectBuckets",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::data-*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Project": "${aws:PrincipalTag/Project}"
        }
      }
    },
    {
      "Sid": "ReadOwnProjectObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::data-*/*"
    }
  ]
}
```

The **customer managed policy reference** in item 2 causes frequent incidents both on the exam and in practice. A Permission Set references **only the name and path** of the policy. If a policy with that name does not exist in the target account, provisioning fails. So to use this approach you must **first deploy a policy with the same name to all target accounts** with CloudFormation StackSets or AFT. That you can place "policies with different content under the same name in each account" is both the advantage and the risk.

Skipping the re-provisioning in item 4 is also a common mistake. Even if you modify a Permission Set, the `AWSReservedSSO_*` IAM Roles already created in each account are not automatically updated immediately. You must call `provision-permission-set` for the changes to be reflected in each account's Role. The console informs you with a banner saying "The permission set has been modified. Please re-provision," but if you manage through the API or IaC, you must put this step in explicitly.

## When the Qualifier Changes, the Answer Changes

Take one requirement, "employees must access multiple AWS accounts," and change only the qualifier.

| Qualifier | Correct direction | Why |
|-----------|-------------------|-----|
| **LEAST operational overhead** | IDC + external IdP + **SCIM** | The user lifecycle is managed only in the IdP, one place. Zero work as accounts grow |
| **FASTEST revocation on termination** | Deactivate in the IdP + **SCIM synchronization** | With JIT provisioning, reflection is delayed until the next login |
| **MOST granular / projects keep growing** | **ABAC** (attributes → session tags → resource tags) | If you make a Permission Set per project, the management targets grow linearly |
| **MOST cost-effective** | **IDC** (the service itself has no charge) | Adding third-party permission-management SaaS or AD Connector incurs cost |
| **Keep on-prem AD as the authoritative source** | AD Connector or AWS Managed AD + IDC | Only connects, without moving the user source into AWS |
| **Customer (B2C) login** | **Cognito** | IDC is for employees. When you see this qualifier, it is decided immediately |

**"Session length is inversely proportional to permissions."** Admin short (1h), ReadOnly long (8h). When the exam asks you to "reduce the exposure of administrator permissions," the correct direction is to choose together the three axes: (1) shorten the session, (2) enforce MFA, (3) PowerUser normally and elevate when needed (break-glass).

> 🎯 **Scenario**: "All employees enter the console through IDC. But the audit team demands 'prove the Permission Sets are not granting excess permissions.' How do you approach this?" — Answer: **extract the services actually used from the Organization-level service last accessed data, create a least-privilege policy draft with IAM Access Analyzer's policy generation, and then redesign the Permission Sets**. If you cut permissions by gut feeling, work is certain to be blocked. A policy reduced without evidence data returns to its original state through exception requests within days.

## Summary

Today's picture is threefold. First, **IAM Identity Center is the standard for multi-account SSO**, and a Permission Set automatically creates an IAM Role. Second, **an external IdP is automatically synchronized with SCIM**, so when an employee leaves, permissions in all accounts are revoked immediately. Third, **IDC is for employees, Cognito is for customers** — never confuse them.

Consolidated Billing is applied automatically just by joining the Org, and RI/SP sharing maximizes company-wide cost efficiency. The ABAC + IDC combination is the standard pattern for preventing an explosion of IAM policies in an environment with 100+ projects.

In the next article, in the same format as Week 1, we work through **12 Week 2 integrated scenario questions**. They are Pro-difficulty questions in which Organizations, SCP, Control Tower, and IDC all work at the same time in one scenario.

---

## 📝 Practice Questions

**Question 1.** 100 AWS accounts + Okta IdP + console/CLI SSO. Best?

A) Register SAML IdP in each account
B) IAM Identity Center + Okta (SCIM + SAML)
C) Cognito Hosted UI
D) Direct Connect + AD

**Answer: B**
Explanation: Multi-account SSO = IDC. Okta integrates via SCIM (user sync) + SAML (auth). 100 accounts managed together. C is customer-facing. D is networking.

---

**Question 2.** Assign Permission Set to account·group. Result?

A) IAM User created
B) Account's `AWSReservedSSO_*` IAM Role auto-created
C) Resource Policy updated
D) SCP created

**Answer: B**
Explanation: IDC backend auto-creates IAM Role. User selecting account in SSO portal = AssumeRole-ing that Role. Role name format: `AWSReservedSSO_<PermissionSet>_<random>`.

---

**Question 3.** B2C app customer signup·login. Which service?

A) IAM Identity Center
B) Cognito User Pool
C) IAM User
D) Directory Service

**Answer: B**
Explanation: Customer auth = Cognito. Employees = IDC. Never confuse this one line.

---

**Question 4.** Consolidated Billing benefit that's NOT one?

A) RI/SP sharing
B) Volume discount pooling
C) Security boost
D) Single invoice

**Answer: C**
Explanation: Billing consolidation isn't security itself (but Org-level SCP/CT separately boost security). RI/SP share ON default.

---

**Question 5.** Okta employee resigns. Revoke from ALL AWS accounts fastest. Best?

A) Delete each account's IAM User
B) Okta deactivate → IDC SCIM sync auto-revokes all (within 5 min)
C) SCP block
D) CloudTrail monitor

**Answer: B**
Explanation: Okta deactivate → SCIM → IDC → Role access blocked. ~5 min. JIT provisioning waits for next login so SCIM dramatically faster. Post-Twilio (2020) phishing response standard.

---

**Question 6.** Shorten IDC session to 1 hour. Why?

A) Cost saving
B) Security — minimize exposed-token impact (especially admin)
C) Performance
D) IAM simplification

**Answer: B**
Explanation: Short session = stolen token damages minimized. Admin 1h, dev 4h, readonly 8h standard. break-glass pattern: PowerUser day-to-day, Admin session temporarily for admin work.

---

**Question 7.** 100 projects, each separate S3·EC2. User accesses only their project. RBAC = 100 Role explosion. Solution?

A) Create 100 Permission Sets
B) ABAC + IDC (user attribute → session tag → resource tag match)
C) 100 OUs
D) 100 accounts

**Answer: B**
Explanation: ABAC standard (NIST SP 800-162). IdP user attribute = Project → session tag → resource tag matching. One policy handles 100 projects. New project: set attribute, policy unchanged.

---

**Question 8.** 80 accounts: some 24/7, some 9-18h. Minimize RI cost?

A) RI Sharing OFF
B) Consolidated Billing + RI Sharing ON (default) + Compute Savings Plans
C) On-Demand only
D) Spot only

**Answer: B**
Explanation: RI Sharing ON lets night-unused RI used by day-shift account. Compute SP covers EC2·Fargate·Lambda most flexible. Cost precise split? Sharing OFF or use Cost Allocation Tags.
