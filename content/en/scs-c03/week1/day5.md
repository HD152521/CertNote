# Day 5 - Week 1 Synthesis: Integrating IAM and Credentials Through Scenarios

Week 1 has laid the foundation of SCS-C03. We drew the big picture with the Shared Responsibility Model and the 6 domains (Day 1), learned IAM's building blocks and the policy evaluation algorithm (Day 2), dug into Identity/Resource policies, Condition keys, and least-privilege design (Day 3), and covered STS, federation, role chaining, and Confused Deputy prevention (Day 4). Taken separately, each is its own topic, but exam scenario questions always throw two or three of them at you as a bundle.

A single question like "why is access denied?" tangles together an implicit Deny, SCP guardrails, cross-account both-sides allowance, and a Permissions Boundary at the same time. A question like "delegate safely to a third party" asks about Role + trust policy + ExternalId + least privilege all at once. Today we solidify that bundled problem-solving through scenarios. The one sentence Week 1 wants to teach is: **"Every access decision in AWS reduces to a single IAM evaluation algorithm, and the security engineer's job is to feed that algorithm accurate policies."**

## One-Page Compact — Week 1 Essentials

### Shared Responsibility + Control Types (Day 1)

| Axis | Essentials |
|------|------------|
| Responsibility line | With IaaS (EC2) the customer's share is large, with SaaS (S3) it is small. **Data and access control are always the customer's** |
| Control types | Preventive (IAM/SCP/SG/KMS) · Detective (CloudTrail/GuardDuty/Config) · Responsive (EventBridge→SSM) |
| 6 domains | Detection 16 / Incident response 14 / Infrastructure 18 / IAM 20 / Data 18 / Security foundations and governance 14 |

We also reinforce that the verb in the question stem determines the control type.

| Wording in the stem | Required type | Answer candidates |
|---------------------|---------------|-------------------|
| prevent / ensure ... cannot | Preventive | SCP, IAM Deny, bucket policy Deny, Block Public Access |
| detect / alert / identify | Detective | CloudTrail, GuardDuty, Config, Macie, Access Analyzer |
| respond / automatically remediate | Responsive | EventBridge → Lambda/SSM, isolation, restoration |
| least operational overhead | Managed first | Options requiring custom implementation or manual review are eliminated |
| most secure / most restrictive | Least privilege | Narrowed wildcards, temporary credentials, explicit Deny |

Sentences like "**block** it with GuardDuty" or "**prevent** it with Config" are classic wrong answers where the service is right but the verb is wrong.

### IAM Evaluation Algorithm (Day 2·3)

```
1. Is there an explicit Deny?     ──▶ If yes, DENY (unconditionally)
2. Does the SCP allow it?         ──▶ If not, DENY
3. Does the Permissions Boundary allow it? ──▶ If not, DENY
4. (cross-account) Do both sides allow it? ──▶ If either is missing, DENY
5. Is there an explicit Allow?    ──▶ If not, implicit DENY
   Passes everything ──▶ ALLOW
```

- SCPs and Boundaries are **filters that only cut the ceiling and do not grant permissions**
- Same account: either an Identity or a Resource policy is enough / cross-account: **both are required**
- For KMS, the **key policy is the primary authority** — the key policy must open the door before IAM policies take effect

### Policy Types and Tools (Day 3)

| Policy | Attached to | Principal | cross-account |
|--------|-------------|-----------|---------------|
| Identity | User/Group/Role | None | Not sufficient alone |
| Resource | S3/KMS/SQS/Role trust | Required | Sufficient alone |
| SCP | OU/account | — | Organization guardrail |
| Permissions Boundary | User/Role | — | Principal's ceiling |

- Condition traps: `BoolIfExists` (MFA), `aws:SourceArn`/`SourceAccount` (Confused Deputy), `aws:SourceVpc` for VPCs
- ABAC: `aws:PrincipalTag == aws:ResourceTag` keeps the number of policies constant
- Only Identity and Resource policies **grant** permissions. SCPs, boundaries, and session policies **only set the ceiling**
- `NotAction` is combined **only with Deny** (used with Allow, new services are automatically allowed)
- For cross-account access to services without resource policy support (EC2, DynamoDB, RDS), use **assuming a role**

### STS and Credentials (Day 4)

- Temporary credentials = AccessKeyId + SecretAccessKey + **SessionToken** (expires)
- AssumeRole: two policies, **trust (who) + permission (what)**
- Federation: SAML (AssumeRoleWithSAML), OIDC (AssumeRoleWithWebIdentity), Identity Center
- Confused Deputy: for third parties use **ExternalId** (issued by the third party), for AWS services use **aws:SourceArn**
- Role chaining: session fixed at a maximum of **1 hour** / enforce IMDSv2 to defend against credential theft

## The 4-Step Flow for Solving Scenarios

When you meet an IAM question in the exam room, consciously decompose it in the following order.

1. **Decompose the request**: who (Principal) · what (Action) · where (Resource) · same account or cross-account?
2. **Check the filters**: explicit Deny? SCP? Boundary? If cross-account, both sides? If KMS, the key policy?
3. **Judge least privilege**: among the options, the one that narrowed wildcards, used temporary credentials, or enforced a guardrail
4. **Eliminate traps**: long-term keys / using root / `Bool` vs `BoolIfExists` / missing ExternalId / a single control only

> 🎯 **Scenario**: A report says "a developer has admin but access to a particular S3 bucket is denied." Solving it in 4 steps — admin is an explicit Allow (passes step 5). Yet if it was denied, it is somewhere in filters 1 to 4. The most common causes are **an explicit Deny in an SCP or bucket policy**, or the bucket is KMS-encrypted and **the key policy does not allow the developer**. "Has permission but is denied" is almost always blocked at a filter (ceiling).

## Case Walkthroughs — Following Along by Hand

Reading a summary table and actually making the determination are different things. Decompose the three cases below yourself **without looking at the options**, then check the walkthrough. What you need in the exam room is not knowledge but this decomposition procedure.

### Case A — Has Permission but Is Blocked

> Situation: The data team's role `role/DataScience` has `AmazonS3FullAccess` attached. When it tries to read an object from the bucket `s3://research-raw` in the same account, it gets `AccessDenied`. The bucket policy has a statement explicitly allowing the data team and has no Deny statements. The account is an Organizations member.

**Decomposition**

| Step | Check | Verdict |
|------|-------|---------|
| Decompose the request | Same account, `s3:GetObject`, object ARN | Not cross-account → the both-sides AND rule does not apply |
| Explicit Deny | None in the bucket policy. But **other layers have not been checked** | SCPs and permissions boundaries unchecked |
| Guardrails | Organizations member → an SCP may exist. Whether a boundary is attached is unchecked | Strong candidate |
| Explicit Allow | Present in both Identity and Resource policies | This layer passes |

**Conclusion**: The Allow is sufficient yet it is blocked, so the cause is on the **ceiling side**. The order to check is (1) whether the error message contains `explicit deny in a service control policy`, (2) whether a permissions boundary is attached to the role, (3) if the bucket is KMS-encrypted, whether the key policy allows this role. The third is especially often missed — even with `s3:GetObject` permission, **without `kms:Decrypt` you cannot read the object.** And since KMS treats the key policy as the primary authority, merely adding `kms:Decrypt` to IAM is not enough.

**What to learn here**: If you first reach for "grant more permissions," you widen permissions without ever finding the cause. Always **pin down which layer is the culprit** and then fix only that layer.

> 🔍 **Going deeper**: Let us underline once more why KMS is especially tricky in this case. With S3 or SQS, within the same account, allowing either the IAM policy **or** the resource policy is enough, but with KMS **the key policy must open the door first** for the IAM policy to have any meaning. The single line `"Principal": {"AWS": "arn:aws:iam::ACCOUNT:root"}` in the default key policy means "delegate the decision to this account's IAM policies," and a key without this line cannot be used by any principal, however broad its IAM policy. So when you see the symptom "one encrypted bucket can be read but another encrypted bucket cannot," you should compare **each key's key policy**, not IAM. Week 3's data protection covers this property in earnest.

The diagnostic procedure in Case A is what security operations calls **isolation-based debugging**. When looking for a cause in a system where multiple layers operate at once, you narrow the scope by eliminating one layer at a time. The opposite approach — widening permissions here and there until the symptom disappears — looks like it solved the problem, but actually **leaves unneeded permissions in place permanently.** Permissions accumulated that way are something nobody can remove later. The state of "nobody knows why this permission exists" is mostly created exactly this way. Diagnose quickly, fix with minimal scope — this principle keeps least privilege intact over time.

### Case B — Designing Delegation Safely

> Situation: You want to give a cost analytics SaaS permission to read your organization's billing and usage data. The SaaS requires a model where it assumes a role in your account from its own AWS account. Your organization has 40 accounts, and the SaaS must see the data of all of them.

**Decomposition**

1. **Credential form** — Issuing access keys is not even up for consideration. Role + temporary credentials is the only direction.
2. **Trust boundary** — The trust policy's `Principal` is the SaaS account. A **`sts:ExternalId` issued by the SaaS** condition is mandatory here. Without it, another customer of the same SaaS could be induced to assume our role.
3. **Permission scope** — Read-only, and only for the needed services. For billing data, limit it to the relevant read actions.
4. **Scalability** — Creating roles by hand in 40 accounts leads to omissions and drift. Deploy the identical role with IaC (StackSets, etc.) and standardize the name.
5. **Observability** — You must be able to check at any time through CloudTrail when that role's sessions did what. Agreeing a session-name convention with the SaaS helps during investigations.
6. **Revocability** — When the contract ends you must be able to cut it off immediately. Design it so that fixing one trust policy is enough.

**Conclusion**: The answer is not a single measure but **a bundle of six items**. When a stem like this appears in the exam, the one option that includes all of "role + ExternalId + least privilege" is correct, and any option missing even one of them is wrong. The option missing ExternalId in particular looks the most plausible.

### Case C — Stripping Out Long-Term Keys

> Situation: An audit found more than 60 access keys across the accounts. Some have not been rotated for over three years, and some belong to owners who have left the company. The instruction came down: "delete them all."

**Decomposition**

Deleting everything is **dangerous.** If you delete without knowing what each key is running, operations stop, and a deleted key cannot be undone. The order is as follows.

```
[ Long-term key cleanup procedure — in a reversible order ]

  1. Inventory everything with the credential report
       Key ID · creation date · **last used date** · last used service and region
        │
        ▼
  2. Classify
       · Recently unused + no owner  → handle immediately
       · In use                      → alternative path must be designed
        │
        ▼
  3. Prepare an alternative path  (this is the real work)
       People       → IAM Identity Center login
       EC2/containers → instance and task roles
       CI/CD        → OIDC federation
       External systems → role + ExternalId
        │
        ▼
  4. **Deactivate**  (not delete — a reversible state)
        │
        ▼
  5. Observation period   watch what breaks
        │
        ▼
  6. Delete + prevent recurrence
       · Restrict key creation itself by policy
       · Make unused-key detection a standing rule
```

**Conclusion**: Security improvement work is also a deployment. **Always pass through a reversible step (deactivation)**, and build the fundamental alternative path first, then reclaim. In the exam, when asked "what should be done first," it is usually step 1 (understand the current state), and when asked "to prevent recurrence," it is step 6 (enforce by policy). Even with the same stem, the correct answer differs depending on the point at which it is asked.

## Confusing Pairs Cheat Table

This collects only the pairs the exam repeatedly targets. They are things where swapping the left and right in your memory yields a wrong answer outright.

| Left | Right | Decisive difference |
|------|-------|---------------------|
| Identity policy | Resource policy | Presence of the `Principal` element / different managing party |
| Explicit Deny | Implicit Deny | Whether `explicit` appears in the error message |
| A policy that grants permissions | A policy that sets the ceiling | SCPs, boundaries, and sessions **cannot create permissions** |
| `Bool` | `BoolIfExists` | How a request without the key is handled |
| `sts:ExternalId` | `aws:SourceArn` | Whether the deputy is a third-party account or an AWS service |
| `AssumeRole` | `GetSessionToken` | Whether you change identity, or only apply MFA to the same identity |
| `RoleSessionName` | `sts:SourceIdentity` | Freely changeable vs. fixed throughout the chain |
| Same-account access | Cross-account access | OR (either one) vs. AND (both sides) |
| Role | Instance profile | What you attach to EC2 is the profile |
| IAM User | IAM Identity Center | Permanent credentials vs. SSO temporary credentials |
| SCP scope | SCP exceptions | **Applies** to member-account root; **does not apply** to service-linked roles and the management account |
| Looking up managed policies | Looking up inline policies | The CLI commands differ — inline is easy to miss |

## Policy Snippet Cheat Sheet

These are the shapes you should recognize at a glance in the exam room. The goal is not to memorize the syntax but to **identify the purpose immediately from the shape.**

```json
// 1. Block access from outside the organization — a boundary set from the resource side
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::secure-data", "arn:aws:s3:::secure-data/*"],
  "Condition": {
    "StringNotEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
  }
}

// 2. Block plaintext transport — the default statement for almost every sensitive bucket
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::secure-data", "arn:aws:s3:::secure-data/*"],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}

// 3. Block sensitive operations without MFA — remember why IfExists is used
{
  "Effect": "Deny",
  "Action": ["iam:*", "kms:ScheduleKeyDeletion", "ec2:TerminateInstances"],
  "Resource": "*",
  "Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" } }
}

// 4. Third-party delegation trust policy — ExternalId is the key
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::VENDOR-ACCOUNT:root" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": { "sts:ExternalId": "vendor-issued-value" }
  }
}

// 5. AWS service trust policy — without a source condition it is "that service anywhere in the world"
{
  "Effect": "Allow",
  "Principal": { "Service": "sns.amazonaws.com" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": { "aws:SourceAccount": "111122223333" },
    "ArnLike": { "aws:SourceArn": "arn:aws:sns:ap-northeast-2:111122223333:alerts" }
  }
}

// 6. ABAC — one statement that keeps the number of policies constant
{
  "Effect": "Allow",
  "Action": ["ec2:StartInstances", "ec2:StopInstances"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Project": "${aws:PrincipalTag/Project}"
    }
  }
}
```

## CLI Cheat Sheet

```bash
# -- Identity check ------------------------------------------------
aws sts get-caller-identity                 # Who am I right now
aws organizations describe-organization     # Am I an organization member (= subject to SCPs)

# -- Permission investigation --------------------------------------
aws iam list-attached-role-policies --role-name AppRole   # Managed
aws iam list-role-policies          --role-name AppRole   # Inline (easy to miss)
aws iam get-role --role-name AppRole --query 'Role.AssumeRolePolicyDocument'
aws iam get-account-authorization-details > iam-dump.json # Full dump

# -- Verification --------------------------------------------------
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/AppRole \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::research-raw/sample.csv
aws accessanalyzer validate-policy \
  --policy-document file://new-policy.json --policy-type IDENTITY_POLICY

# -- Credential hygiene --------------------------------------------
aws iam generate-credential-report
aws iam get-credential-report --query Content --output text
aws iam generate-service-last-accessed-details \
  --arn arn:aws:iam::111122223333:role/AppRole

# -- Assuming a role -----------------------------------------------
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/CrossAccountReadRole \
  --role-session-name audit-2026 \
  --external-id vendor-issued-value \
  --source-identity alice@example.com
```

> ⚠️ **Pitfall**: Even if `simulate-principal-policy` returns `allowed`, the request may still be blocked in reality. This tool **does not evaluate SCPs**, and it also does not fully reflect resource-based policies and VPC endpoint policies. So use the simulator as a tool to **rule out** "there is no problem in the IAM and boundary layers," and if it is still blocked, look at the organization guardrails and the resource side. The precise diagnostic procedure is covered in Week 2.

The 2019 Capital One breach shows why what we learned this week is at the center of real-world practice. The attacker used SSRF through a misconfigured web application firewall to reach EC2 instance metadata, obtained the temporary credentials of that instance's role, and downloaded S3 data. Information on roughly 106 million U.S. and Canadian credit card applicants was affected. What deserves attention is the fact that **everything that was breached was in the customer's area of responsibility** — neither the S3 infrastructure nor the hypervisor was compromised. And the incident happened even though temporary credentials were in use. Temporary credentials are only a line of defense in that "the validity period is limited if exposed"; **blocking the exposure path (IMDSv2)** and **narrowing what can be done even if stolen (least privilege)** are separate controls. Week 1's conclusion lies here.

## Summary

Everything in Week 1 compresses into two questions: **"At which step of IAM evaluation is this access decided?"** and **"Is this credential temporary or long-term, and is the delegation boundary safe?"** Evaluation proceeds in the order **explicit Deny first → pass the guardrails (SCP, permissions boundary) → existence of an explicit Allow**, and since guardrails cannot create permissions, even `AdministratorAccess` cannot exceed the ceiling. Within the same account, one Identity **or** Resource policy is enough, but **cross-account requires both sides**, and with KMS the **key policy is the primary authority**, so IAM alone cannot use a key. On the credentials side, the goal is to eliminate long-term access keys: people use Identity Center, workloads use instance and task roles, CI uses OIDC, and external vendors use **role + ExternalId**. Delegation always comes with **Confused Deputy** defense — `sts:ExternalId` for third parties, and `aws:SourceArn`/`aws:SourceAccount` for AWS services. And the situation "has permission but is denied" is almost without exception **blocked at the ceiling layer**, so before widening permissions, first pin down which layer is the culprit.

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
