# Day 2 - IAM, STS, and Federation: Splitting the Word "Permission" into Six Layers

On SAA, IAM could be summarized in four words: "User, Group, Role, Policy." On Pro, that doesn't cut it. A single scenario features an IAM User policy, an IAM Role policy, a resource-based policy, a Permission Boundary, an SCP, and a session policy all at once — and questions asking "**can this user call this action**" appear frequently. To get the answer right, you must know the **6-level priority order** of permission evaluation.

In this article we peel back IAM's surface one more layer and look at the evaluation engine where decisions actually happen underneath. We'll also cover why STS and Federation are "the spine of enterprise multi-account environments," and what broke in incidents like Capital One and Uber.

## IAM's 6-Layer Permission Evaluation: The Internals the AWS Console Doesn't Show

When you type `aws s3 ls s3://my-bucket`, AWS evaluates the following 6 policies simultaneously.

```
[1. SCP (Service Control Policy)]              ← Organizations level; deny beats everything
       ↓
[2. Permission Boundary]                       ← Maximum permission ceiling for an IAM entity (User/Role)
       ↓
[3. Identity-based Policy]                     ← Policies attached to Users, Groups, Roles
       ↓
[4. Resource-based Policy]                     ← S3 bucket policies, KMS key policies, etc.
       ↓
[5. Session Policy]                            ← Attached inline during AssumeRole/GetFederationToken
       ↓
[6. VPC Endpoint Policy]                       ← Applies only to traffic through a VPC Endpoint
```

The evaluation rules are simple but exact.

1. **An explicit Deny beats every Allow** (explicit deny wins)
2. **If no relevant policy Allows, the default is Deny** (implicit deny)
3. **SCPs and Permission Boundaries grant no permissions — they only set limits** (deny-only)
4. **For cross-account access, both sides of the trust must Allow via resource-based policy** (within the same account, either one Allowing is sufficient)

> 🔍 **Deeper dive**: SCPs and Permission Boundaries are both guardrails that set a "maximum ceiling of permissions," but their scopes differ. An **SCP** attaches at the OU or Account level in Organizations and applies to **every IAM entity** inside that account (including root). A **Permission Boundary** attaches only to a specific IAM User or Role. That is, an SCP enforces "this account can never use regions other than us-east-1," while a Permission Boundary enforces "this developer Role can never call IAM or Organizations APIs." Both are **permission ceilings**, not Allows.

> 💡 **Related theory**: This evaluation structure is a hybrid of **Role-Based Access Control (RBAC, NIST RBAC standard INCITS 359-2004)** and **Attribute-Based Access Control (ABAC, NIST SP 800-162)**. The `Condition` clause in IAM Policies implements ABAC (`aws:RequestTag/Project=Phoenix`), and policy attachment implements RBAC. The reason AWS fully embraced ABAC in 2018 is that **when account counts explode, RBAC alone causes policy management to explode**. 100 projects × 4 environments (dev/stg/prod/test) = 400 Roles needed, but with ABAC it's done with 1 Role + tag-based conditions.

> 🎯 **Scenario**: "A data analyst complains they cannot access an S3 bucket. The IAM policy Allows `s3:*`, and the bucket policy also Allows. What's the cause?" — The answer is usually that an **SCP restricts the region or service**, or a **Permission Boundary allows only s3:GetObject**, or **the bucket is KMS-encrypted and the KMS key policy Denies**. The Pro exam frequently asks these "why doesn't it work" debugging scenarios.

### Cross-Account Access: Both Sides Must Agree

Within the same account, either the Identity Policy OR the Resource Policy Allowing is sufficient, but **when accessing from another account, both sides must Allow**.

```
[Account A: user Alice]                  [Account B: S3 Bucket]
    Identity Policy: Allow s3:GetObject       Bucket Policy: Allow Alice from A
              ↓                                          ↓
         Both sides Allow → access granted
```

This is where incidents frequently happen in fintech and financial-sector multi-account environments. Allow only one side and access is blocked; Allow both sides and the risk of permission leakage grows. That's why **IAM Access Analyzer** launched in 2019 to automatically check "can an external account access this resource."

## STS's Real Role: The Issuer of Temporary Credentials

You saw the word `AssumeRole` in SAA too, but on Pro you must distinguish all **5 STS APIs**.

| API | Caller | Credential validity | Use case |
|-----|-----------|------------------------|--------|
| `AssumeRole` | IAM User/Role | 15 min - 12 hours | Cross-account access, EC2 Instance Role |
| `AssumeRoleWithSAML` | SAML IdP (AD FS, Okta) | 15 min - 12 hours | Enterprise SSO |
| `AssumeRoleWithWebIdentity` | OIDC (Google, Facebook, GitHub Actions) | 15 min - 12 hours | Mobile apps, CI/CD |
| `GetFederationToken` | IAM User | 15 min - 36 hours | Temporary permissions for external users |
| `GetSessionToken` | IAM User | 15 min - 36 hours | MFA-based session hardening |

> 🔍 **Deeper dive**: The heart of temporary credentials is the **session token**. Calling with only a regular `AccessKeyId` + `SecretAccessKey` gives you indefinitely valid credentials, but adding a `SessionToken` enforces the expiration STS issued. Temporary credentials are also a **JWT-like structure** issued internally by STS, transmitted by including the SessionToken as an extra header in the AWS Signature V4 signature. This ties directly into the mechanism by which IMDSv2 blocks SSRF attacks (the EC2 metadata service issues only temporary credentials, and IMDSv2 mandates a PUT token).

> 📚 **Case study**: The Capital One incident of July 2019. An attacker exploited an SSRF vulnerability to access `http://169.254.169.254/latest/meta-data/iam/security-credentials/` and **stole the temporary credentials** of an EC2 Instance Role. Those credentials had broad access to S3 buckets, and data of 106 million people was exfiltrated. As a direct result of this incident, AWS launched **IMDSv2** (November 2019) and **IAM Access Analyzer** (December 2019), and since 2024 has enforced IMDSv2 by default on new EC2 instances. [DOJ indictment](https://www.justice.gov/usao-edva/press-release/file/1188626/download).

### AssumeRole's Trust Policy

When creating a Role, you define two policies at once.

```json
// Trust Policy (who can assume this Role)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::123456789012:root"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "unique-external-id-xyz"
      }
    }
  }]
}

// Permission Policy (what the holder of this Role can do)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::data-bucket/*"
  }]
}
```

`ExternalId` is **a mechanism to prevent the "confused deputy" attack**. If Company A allows Company B to assume a Role in A's account, a malicious third party C could impersonate B's ID to assume A's Role. ExternalId is a secret A shared only with B, so without knowing it, C's assume fails.

> ⚠️ **Pitfall**: On the Pro exam, when a scenario says "**we need to let a third-party SaaS access our AWS account**," the answer is almost always **Cross-Account Role + ExternalId**. Creating an IAM User and handing out access keys is a wrong answer (access keys are static and hard to revoke). SaaS providers like Datadog, Snowflake, and Splunk all use this pattern.

## The Two Branches of Federation: SAML and OIDC

Enterprises have their own identity systems (Active Directory, Okta, Azure AD). Rather than recreating these in AWS each time, you **federate** them.

### SAML 2.0-Based Federation

SAML (Security Assertion Markup Language) 2.0 is an XML-based authentication and authorization protocol adopted as an OASIS standard in 2005.

```
[User] → [AD FS / Okta]
              ↓ SAMLResponse (XML, signed)
         [AWS Sign-in Endpoint]
              ↓ AssumeRoleWithSAML
         [STS: issues temporary credentials]
              ↓
         [Use AWS Console / API]
```

> 💡 **Related theory**: SAML 2.0 is based on **XML Digital Signature** (W3C XMLDSIG) and **XML Encryption** (W3C XMLENC). The IdP signs the SAMLResponse with the private key of an X.509 certificate, and the SP (AWS) verifies with the public key. However, due to the complexity of XML parsing, SAML has a security issue unique to it called the **XML Signature Wrapping attack**. At USENIX in 2012, this vulnerability was found in 11 SaaS/SAML implementations, and AWS was one of them. AWS subsequently patched it with strict XML schema validation.

### OIDC (OpenID Connect)-Based Federation

OIDC is a standard that layers authentication on top of OAuth 2.0. Being JSON-based, it's lighter than SAML and well-suited for mobile and SPAs.

```
[User] → [Google / GitHub / Cognito]
                  ↓ id_token (JWT)
            [AssumeRoleWithWebIdentity]
                  ↓
            [STS: temporary credentials]
```

GitHub Actions uses this method to deploy to AWS. Once you configure the **OIDC trust**, GitHub Actions workflows obtain a temporary token each time and deploy without any long-lived AWS credentials. Since GitHub launched OIDC in 2021, the practice of "storing AWS Access Keys in GitHub Secrets" has rapidly disappeared.

> 📚 **Case study**: The 2017 Uber data breach was caused by an employee pushing an AWS Access Key to a public GitHub repository. Data of 57 million users was leaked. GitHub subsequently introduced secret scanning, and AWS automatically detects exposed keys with IAM Access Analyzer. Today, using OIDC with GitHub Actions makes this kind of incident outright impossible (there are no static credentials at all).

### IAM Identity Center (formerly AWS SSO)

AWS Identity Center is a SAML-based multi-account SSO solution. Integrated with Organizations, one login lets you freely switch among multiple accounts and multiple Roles in the console.

```
[Employee] → [Identity Center login]
              ↓
        [Select Permission Set]
              ↓
        [AssumeRole into target account with temporary credentials]
              ↓
        [Use Console / CLI]
```

A **Permission Set** is a concept unique to Identity Center — a template that "deploys the same IAM Role to multiple accounts in bulk." For example, define a "Developer Permission Set" and Identity Center automatically creates and maintains the identical Role in every dev account.

> 🔍 **Deeper dive**: Internally, Identity Center supports **two identity sources**: ① **Identity Center's own directory** (small scale) ② **an external IdP** (AD/Okta/Azure AD via SAML or SCIM). SCIM (System for Cross-domain Identity Management, RFC 7644) is a standard protocol that automatically synchronizes user additions and deletions from an external IdP like Azure AD into AWS. Without it, you get the ghost-user problem where an employee leaves the company but their permissions stay alive in AWS.

## Permission Boundary: The Safety Valve of Delegation

A scenario large organizations frequently face: "We want developers to create their own Lambda Roles directly. But granting developers IAM Admin permissions is dangerous."

The answer is Permission Boundary. The administrator attaches a constraint alongside: "you may create IAM Roles, but **you can never grant permissions beyond this boundary**."

```json
// Policy granted to developers
{
  "Effect": "Allow",
  "Action": "iam:CreateRole",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary": "arn:aws:iam::123456789012:policy/DevBoundary"
    }
  }
}
```

This forces developers to attach `DevBoundary` whenever they create an IAM Role, and permissions beyond that boundary are automatically blocked.

> 🎯 **Scenario**: A game company wants to give 100 developers a free-form Lambda development environment. Developers create Roles and grant permissions themselves, but **IAM Admin, Organizations, and Billing permissions are absolutely off-limits**. — The answer is to force-attach a Permission Boundary that denies IAM, Organizations, and Billing APIs. SCP alone is insufficient because a developer might grant admin permissions to their own Role. The orthodox approach is the dual guardrail of SCP + Permission Boundary.

## 6-Layer Permission Evaluation in Practice: The Debugging Matrix

| Symptom | Policy to suspect | Diagnosis method |
|------|------------------|-----------|
| All API calls blocked | SCP | Check SCPs in the Organizations console |
| Only a specific service blocked | Permission Boundary, SCP | IAM simulator, Access Analyzer |
| Only a specific region blocked | SCP's `Condition: aws:RequestedRegion` | Inspect the SCP JSON directly |
| Cross-account access blocked | Both sides' policies | CloudTrail's `errorMessage` |
| Cannot read KMS-encrypted objects | KMS Key Policy | KMS console, `kms:Decrypt` policy |
| AssumeRole fails | Trust Policy, ExternalId | CloudTrail's `sts:AssumeRole` events |

You can simulate policies from the CLI.

```bash
# Simulate whether a specific user can call a specific action
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:user/Alice \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::data-bucket/file.txt
```

## ABAC vs RBAC: Choosing by Organization Size

| Item | RBAC | ABAC |
|------|------|------|
| Definition | Grant policies per Role | Grant policies per attribute (tag) |
| Suitable scale | Small (< 50 Roles) | Large |
| Policy count | Explodes with roles × environments | Single policy + tags |
| Permission leakage risk | Mistakes when duplicating policies | When tags are missing |
| AWS adoption | From the beginning | ABAC capability added in 2018 |

> 🔍 **Deeper dive**: The core Condition Keys of AWS ABAC are `aws:RequestTag/key` (tags of the resource the requester is about to create), `aws:ResourceTag/key` (tags of an already-existing resource), and `aws:PrincipalTag/key` (tags of the requester themselves). Combining these three, you can express "a user tagged Project=Phoenix can start/stop only EC2 instances tagged Project=Phoenix" in a single policy. Even with 100 projects, the policy stays the same. However, a missing tag means blocked permissions, so it must be enforced together with Tag Policies (an Organizations feature).

## Wrapping Up

IAM was roughly "policy = JSON" on SAA, but on Pro you must handle it at the depth of a **6-layer evaluation engine**. SCP, Permission Boundary, Identity Policy, Resource Policy, Session Policy, and VPC Endpoint Policy operate simultaneously; an explicit deny beats every allow; and cross-account requires consent from both sides.

STS is the issuer of temporary credentials, and you must distinguish the five variants of AssumeRole (AssumeRole, WithSAML, WithWebIdentity, GetFederationToken, GetSessionToken) by scenario keywords. Federation splits into SAML (enterprise) and OIDC (mobile/CI-CD), and Identity Center is the standard answer for multi-account SSO. Finally, Permission Boundary is the safety valve of delegation, providing developers "freedom and safety at the same time."

In the next article we look at the channels where traffic flows on top of the permissions IAM decided — VPC, subnets, routing, and security groups — at Pro depth.

---

## 📝 연습 문제

**문제 1.** A company operates 50 accounts in Organizations. In one developer account, IAM User Alice was granted a policy with `s3:GetObject` permission but cannot retrieve objects. CloudTrail records `AccessDenied`. What is the most likely cause?

A) The Identity Policy is wrong
B) An Organizations SCP denies that region or service
C) The S3 bucket is in another account and the bucket policy does not explicitly allow
D) MFA is disabled on the IAM User

**정답: C** (B is also possible, depending on the scenario)
해설: The Identity Policy is set to Allow, so A is out. MFA (D) is irrelevant unless specified as a Condition. B is a plausible SCP suspicion, but there's no information indicating the same region/service works elsewhere. **Cross-account access requires Allow on both the Identity Policy and the Resource Policy**, so C is most likely. Additionally, if the bucket is KMS-encrypted, the KMS Key Policy is also required. Diagnosis: CloudTrail's `errorMessage` explicitly states "explicit deny in a resource policy" or "deny in a service control policy," which identifies it.

---

**문제 2.** A SaaS company needs to collect data from its customers' AWS accounts. What is the safest and most standard method?

A) The customer creates an IAM User and provides the Access Key to the SaaS
B) Create a Cross-Account Role in the customer account and grant the SaaS account AssumeRole + ExternalId
C) Share the customer's root credentials
D) Create the SaaS's IAM User directly inside the customer account

**정답: B**
해설: The keywords are "standard" + "SaaS accessing customer accounts." A's Access Key is static and hard to revoke if leaked. B's Cross-Account Role + ExternalId is the standard pattern that prevents the confused deputy attack (adopted by Datadog, Snowflake, and CloudHealth alike). The ExternalId is a secret the SaaS generates uniquely per customer and includes in the Trust Policy's Condition, preventing one customer from assuming another customer's Role with their own ID.

---

**문제 3.** A company wants to let developers "freely create their team's Lambda Roles but never be able to grant IAM or Organizations permissions." What is the most suitable method?

A) Grant developers IAM Admin permissions + monitoring
B) Force-attach a Permission Boundary that denies IAM and Organizations APIs
C) Deny IAM and Organizations APIs with an SCP
D) A security-team approval workflow for every Role creation

**정답: B**
해설: B's Permission Boundary sets the permission ceiling for Roles the developer creates. Even if the developer tries to grant admin permissions to their own Role, the boundary blocks it. C's SCP applies to the entire account, blocking not only developers but the security team as well. D carries heavy operational overhead. Typically you apply both — **SCP (account level) + Permission Boundary (delegation level)** — as a double layer.

---

**문제 4.** A company deploys to AWS Lambda from GitHub Actions. The security team demands "do not store long-lived AWS Access Keys in GitHub Secrets." What should they do?

A) Create an IAM User and rotate the Access Key every 90 days
B) Configure an AWS OIDC Identity Provider and have GitHub Actions call AssumeRoleWithWebIdentity
C) Deploy Lambda manually from the console
D) Upload a ZIP to an S3 bucket and have Lambda trigger

**정답: B**
해설: B is the standard pattern where GitHub Actions receives an OIDC id_token each time and obtains temporary credentials from STS. AWS only needs the OIDC Provider registered once. A still carries key-rotation burden and leakage risk. Trade-off: when configuring the OIDC trust, you must restrict the GitHub repo and branch via Conditions (another organization could masquerade with the same repo name).

---

**문제 5.** A company operates 200 accounts in Organizations, and employees must access multiple accounts via SSO. Active Directory is the identity source. What is the most appropriate solution?

A) Create IAM Users in each account
B) IAM Identity Center + AD Connector + Permission Sets
C) Configure a SAML IdP in each account
D) Consolidate with a Cognito User Pool

**정답: B**
해설: In B, Identity Center integrates with Organizations, so a single setup automatically deploys Permission Sets to all accounts. AD Connector (or AWS Managed AD) uses the existing AD as the identity source. C requires configuring each of the 200 accounts individually — extreme operational overhead. Trade-off: Identity Center itself is free, but Managed AD has an hourly cost, so for small organizations AD Connector is cheaper.

---

**문제 6.** A company wants to find every external Principal that can access its S3 buckets cross-account. What is the most efficient method?

A) Manually review all bucket policies
B) Enable IAM Access Analyzer and review External Findings
C) Grep the CloudTrail logs
D) Write an AWS Config Custom Rule

**정답: B**
해설: Since its 2019 launch, Access Analyzer uses a formal verification engine called Zelkova to analyze all Resource Policies and automatically identify external access possibilities. Enabled at the Organizations level, results from all accounts can be viewed in one place.

---

**문제 7.** In a system, a user cannot retrieve an S3 object. Identity Policy is `s3:*`, the bucket policy Allows, and the KMS key policy is missing. CloudTrail shows `KMS.NotFoundException`. What is the problem?

A) The S3 bucket policy does not specify the KMS key
B) The KMS key policy does not grant the user `kms:Decrypt` permission
C) The S3 bucket is in the wrong region
D) MFA is disabled on the IAM User

**정답: B**
해설: When an S3 object is KMS-encrypted, S3 retrieves the object and then attempts to decrypt the data key with KMS. At that point, the user's permissions must **include `kms:Decrypt`**. Cross-account KMS access requires Allow on both sides (IAM policy + KMS key policy). CloudTrail's `KMS.NotFoundException` is a message returned to "make it look as if the KMS key cannot be found due to lack of permission" (security through obscurity).
