# Day 5 - Week 1 Synthesis: Integrating IAM and Credentials Through Scenarios

Week 1 has laid the foundation of SCS-C03. We drew the big picture with the Shared Responsibility Model and 6 domains (Day 1), mastered IAM building blocks and policy evaluation algorithm (Day 2), dug into Identity/Resource policies, Condition keys, and least-privilege design (Day 3), and covered STS, federation, role chaining, Confused Deputy prevention (Day 4). Separately, each is its topic. But exam scenario questions always bundle two or three together.

One problem tangles implicit Deny, SCP guardrails, cross-account both-sides allowing, and Permissions Boundary simultaneously: "Why is access denied?" A "delegate safely to third parties" question tests Role + trust policy + ExternalId + least privilege all at once. Today we solidify that synthesis through scenario solving. Week 1's one-liner: **"Every access decision at AWS reduces to the IAM evaluation algorithm, and a security engineer's job is inputting precise policies into that algorithm."**

## One-Page Compact — Week 1 Core

### Shared Responsibility + Control Types (Day 1)

| Axis | Core |
|----|------|
| Responsibility line | IaaS(EC2) high customer burden, SaaS(S3) low. **Data and access control always customer** |
| Control types | Preventive(IAM/SCP/SG/KMS) · Detective(CloudTrail/GuardDuty/Config) · Responsive(EventBridge→SSM) |
| 6 domains | Threat detection 14 / Logging 18 / Infrastructure 20 / IAM 16 / Data 18 / Governance 14 |

### IAM Evaluation Algorithm (Day 2·3)

```
1. Any explicit Deny?             ──▶ Yes → DENY (absolute)
2. Does SCP allow the Action?      ──▶ No → DENY
3. Does Permissions Boundary allow? ──▶ No → DENY
4. (cross-account) Both allow?      ──▶ Either missing → DENY
5. Any explicit Allow?              ──▶ No → implicit DENY
   All pass ──▶ ALLOW
```

- SCP·Boundary are filters that **cut ceilings, not grant permissions**
- Same account: Identity OR Resource policy enough / cross-account: **both needed**
- KMS: **key policy is first authority** — key policy must open before IAM policy works

### Policy Types and Tools (Day 3)

| Policy | Attached to | Principal | cross-account |
|------|--------|-----------|---------------|
| Identity | User/Group/Role | None | Can't work alone |
| Resource | S3/KMS/SQS/Role trust | Required | Works alone |
| SCP | OU/account | — | Org guardrail |
| Permissions Boundary | User/Role | — | Principal ceiling |

- Condition traps: `BoolIfExists`(MFA), `aws:SourceArn`/`SourceAccount`(Confused Deputy), use `aws:SourceVpc` for VPC
- ABAC: `aws:PrincipalTag == aws:ResourceTag` keeps policies constant as scale grows

### STS·Credentials (Day 4)

- Temporary credentials = AccessKeyId + SecretAccessKey + **SessionToken**(expiring)
- AssumeRole: **trust(who) + permission(what)** two policies
- Federation: SAML(AssumeRoleWithSAML)·OIDC(AssumeRoleWithWebIdentity)·Identity Center
- Confused Deputy: third-party uses **ExternalId**(vendor-issued), AWS service uses **aws:SourceArn**
- Role chaining: session max **1 hour** fixed / IMDSv2 enforced to stop credential theft

## Scenario Solving 4-Step Flow

When facing IAM problems in exam, consciously decompose by this order:

1. **Decompose the request**: Who(Principal) · What(Action) · Where(Resource) · same-account or cross-account? KMS involved?
2. **Check filters**: Explicit Deny? SCP? Boundary? Cross-account both sides? KMS key policy?
3. **Judge least privilege**: Among choices, pick one narrowing wildcards, using temp credentials, forcing guardrails
4. **Remove traps**: Long-key use / root use / `Bool` vs `BoolIfExists` / missing ExternalId / single control only

> 🎯 **Scenario**: "Developer has admin, but specific S3 bucket access is denied." Four-step decomposition — admin is explicit Allow (passes step 5). But denied means hitting filters 1-4. Most common: **SCP or bucket policy's explicit Deny**, or that bucket is KMS-encrypted but **key policy doesn't allow developer**. "Permissions exist but denied" almost always hits a filter (upper ceiling).

---

## 📝 10 Comprehensive Scenarios

**Problem 1.** Company wants application running on EC2 to access S3. Most security best-practice method is?

A) Create IAM User, generate access key, store in EC2 instance environment variables  
B) Attach IAM Role as instance profile to EC2 and enforce IMDSv2  
C) Store root credentials on EC2 and use as needed  
D) Open S3 bucket as public-read so it authenticates without credentials  

**Answer: B**  
Explanation: Attach instance profile (IAM Role) to EC2 to auto-issue STS temporary credentials and enforce IMDSv2 to block SSRF credential theft. Storing long-term access keys in environment variables has huge exposure risk; root is absolutely forbidden; public-read buckets are classic data breach sources.

---

**Problem 2.** Account A's CodePipeline deploys to Account B's ECS service; artifacts encrypted with Account A KMS key. For deployment to work, required permission boundaries are?

A) Give pipeline role all permissions; cross-account works automatically  
B) Account B role with A as trust + Account A KMS key policy allows B + B role has ECS permissions + artifact bucket policy allows B read  
C) Store Account B root credentials in Account A  
D) IAM Identity Center SSO alone solves this  

**Answer: B**  
Explanation: Cross-account CI/CD requires four-boundary alignment: trust relationship, KMS key policy cross-account allow, target account role service permissions, artifact bucket policy read allow. Jamming one account doesn't auto-open boundaries; root storage is forbidden; Identity Center is for human SSO, not machine workflows.

---

**Problem 3.** User has `PowerUserAccess`, no SCP or Boundary restrictions, yet `dynamodb:Query` call is denied. Most likely cause?

A) DynamoDB isn't controlled by IAM  
B) Somewhere an explicit Deny for `dynamodb:Query` (or wildcard parent) exists  
C) PowerUserAccess doesn't include DynamoDB; no explicit Allow means implicit Deny  
D) Both B and C possible  

**Answer: D**  
Explanation: Denial stems from explicit Deny existing or no explicit Allow for this Action (implicit Deny). PowerUserAccess covers most services but explicit Deny elsewhere takes priority; if outside scope, implicit Deny applies. DynamoDB is IAM-controlled.

---

**Problem 4.** Company wants to safely delegate cross-account S3 bucket access to third-party backup vendor. Most appropriate setup?

A) Issue IAM User access key to vendor  
B) Create Role with vendor account in trust policy and vendor-issued ExternalId; permission restricts to bucket and needed Actions  
C) Open bucket as public so vendor accesses without auth  
D) Share company root credentials with vendor  

**Answer: B**  
Explanation: Cross-account third-party delegation's answer is Role + trust policy naming vendor account + vendor-issued ExternalId + least-privilege permissions. ExternalId blocks Confused Deputy where same vendor's other customers access our resources. key issuing, public opening, root sharing all create serious exposure.

---

**Problem 5.** Security team wants to prevent anyone (admin, root) in all member accounts from disabling CloudTrail and block non-US region use. Most appropriate combo is?

A) Add CloudTrail Deny one-by-one to every member user policy  
B) SCP with `cloudtrail:StopLogging`/`DeleteTrail` Deny and `aws:RequestedRegion` Deny, excluding global services with `NotAction`  
C) GuardDuty detects CloudTrail shutdown and CloudWatch alerts  
D) IAM Permissions Boundary applied to all accounts  

**Answer: B**  
Explanation: Org-level enforcement uses SCP explicit Deny, and region restriction traps global services (IAM, CloudFront, Route 53) in `NotAction` to avoid breaking account ops. Per-user policy additions have gap risk; GuardDuty detects post-facto; Permissions Boundary is per-principal, not org-wide.

---

**Problem 6.** A policy intended to block sensitive actions without MFA used `"Bool": {"aws:MultiFactorAuthPresent": "false"}`, unexpectedly blocking service automation calls. Correct fix?

A) Change condition to `"BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}`  
B) Switch Deny to Allow  
C) Remove MFA condition entirely  
D) Force-register MFA on all users  

**Answer: A**  
Explanation: Some calls (service-to-service, STS sessions) lack MFA context key entirely; `Bool` matches even missing keys, blocking normal requests. `BoolIfExists` checks only if key exists, passing if absent — as intended. Allow swap or condition removal disable MFA enforcement; registration alone doesn't fix evaluation side-effects.

---

**Problem 7.** Dozens of teams operate resources; policy additions per new team causes explosion. Most scalable least-privilege approach?

A) Grant all teams same admin policy  
B) Unify with ABAC: `aws:PrincipalTag/team` matches `aws:ResourceTag/team` in one Condition  
C) Continue adding team-specific roles and policies  
D) Abandon permission management; manual approval only  

**Answer: B**  
Explanation: ABAC expresses team-tag match in one policy working for unlimited teams; new team = tag assignment only. Federated users map session tags to PrincipalTag uniformly. Admin grant violates least privilege; policy per-team causes explosion; manual approval doesn't scale.

---

**Problem 8.** Thousands of corporate employees need multi-account access. Avoid IAM User-per-account anti-pattern most appropriately how?

A) Create one shared IAM User per account for team use  
B) IAM Identity Center defines permission sets, federate external IdP, SSO issues temp credentials  
C) Distribute root credentials to all employees  
D) Issue long-term access keys to each employee  

**Answer: B**  
Explanation: Identity Center multi-account SSO via permission sets and external IdP federation eliminates per-account User creation; users get temp credentials after login. Shared User damages auditability and least privilege; root and key distribution are critical security risks.

---

**Problem 9.** Account A's role can't read KMS-encrypted S3 object in Account B. S3 bucket and A's IAM policy correctly allow GetObject. Most likely gap?

A) Account B's KMS key policy doesn't allow A role `kms:Decrypt`  
B) S3 doesn't support cross-account read  
C) Different regions make it impossible  
D) GetObject alone auto-permits KMS decryption  

**Answer: A**  
Explanation: KMS policy is first authority; encrypted object read needs key policy granting A role `kms:Decrypt`. S3 permission isn't enough. S3 cross-account reads work; different regions are fine; GetObject doesn't auto-grant decrypt.

---

**Problem 10.** SNS topic policy allows S3 service principal to post events. Block other people's S3 buckets from triggering this topic how?

A) Change Principal to `*`  
B) Add Condition with `aws:SourceArn`(specific bucket) and `aws:SourceAccount` to allow only our bucket  
C) Delete topic, replace with SQS  
D) Make S3 bucket private  

**Answer: B**  
Explanation: Service principal trust requires `aws:SourceArn` and `aws:SourceAccount` to limit call source to our specific resource and account, preventing Confused Deputy. Principal `*` increases risk; service swap doesn't fix source validation; bucket privacy doesn't solve.

---

## Week 1 Closing — Bridge to Next Week

This week's five — Shared Responsibility Model, policy evaluation algorithm, Identity/Resource policies, Condition and least privilege, STS and federation — are **Domain 4 (IAM) core and prerequisite for all other five domains**. Next week we enter data protection (KMS, encryption) in-depth; key policies, grants, encryption context there all unlock on these two questions learned here:

1. **"At which stage of the IAM evaluation algorithm is this access decided?"** (explicit Deny → filters → explicit Allow)
2. **"Is this credential temporary or long-term, and is the delegation boundary safe?"** (STS · trust policy · ExternalId)

Hold these two questions, and next week's KMS key policies, S3 encryption enforcement, Secrets Manager rotation become "this week's IAM thinking applied to data" instead of "separate tools to memorize."
