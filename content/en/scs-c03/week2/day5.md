# Day 5 - Week 2 Integration: Multi-Account IAM Governance Scenario

Over the four days of Week 2, we built the four pillars of IAM. Day 1's **policy evaluation logic** (the intersection of six layers, and explicit deny taking priority), Day 2's **Permission Boundary** (the ceiling on an individual's permissions and safe delegation), Day 3's **SCP** (guardrails for an entire account), and Day 4's **federation and ABAC** (temporary credentials and tag-based scaling). Today we see how these four are not isolated pieces of knowledge but **one governance machine** with interlocking parts.

The real difficulty of the Specialty exam is not "what is an SCP?" but tracing "why was this request blocked in an environment where SCPs, Boundaries, IAM policies, and Resource policies are all applied at once?" Today we train that tracing muscle with integrated scenarios.

## The Four Pillars in One Picture

When an employee in a multi-account environment tries to read a single S3 object, the request has to pass every one of the following gates.

```
[Employee] alice — SAML login at the IdP (day4)
   │  Passes PrincipalTag: Team=payments
   ▼
[STS] AssumeRoleWithSAML → temporary credentials issued (day4)
   │  A Session Policy can shrink session permissions further
   ▼
┌──────────── Evaluation engine (day1) ────────────┐
│ 0. Is there an Explicit Deny anywhere? → if so, done │
│ 1. Does the SCP allow it? (account guardrail, day3)  │
│ 2. Does the Resource Policy (bucket policy) allow it?│
│ 3. Does the Identity Policy (Permission Set) allow it?│
│ 4. Does the Permission Boundary allow it? (day2)     │
│ 5. Does the Session Policy allow it? (day4)          │
│ 6. ABAC condition: do the tags match? (day4)         │
└──────────────────────────────────────────────────┘
   │ All passed (intersection) → ✅ access allowed
   ▼
[S3 object read succeeds]
```

This picture is all of Week 2. If any single layer blocks, the result is Deny. Exam questions are essentially asking, "Which layer of this picture is the culprit?"

This layered structure is a textbook implementation of **defense in depth** from security engineering. Rather than a single control point, there are several independent control layers, so that if one layer is accidentally left open, another still blocks. At the same time, every layer is **default-deny** and the layers combine as an **intersection**, so permissions flow exactly as far as they were intentionally granted. AWS IAM bakes these two principles (defense in depth and least privilege) into the policy evaluation algorithm itself.

## The Effective Permissions Worksheet

What you need in the exam room is not concepts but a **calculation procedure**. When several policy fragments are given, picture the following table in your head and fill it in one cell at a time.

```
[ Effective permissions worksheet — fill in one action at a time ]

 Target action: s3:DeleteObject   Principal: AWSReservedSSO_Dev_xxxx / alice

 ┌──────────────────────┬────────┬──────────────────────────────────┐
 │ Layer                │ Result │ Rationale                        │
 ├──────────────────────┼────────┼──────────────────────────────────┤
 │ ⓪ Deny anywhere?     │ None   │ If present, stop immediately     │
 │ ① SCP (entire path)  │ Allow  │ Root, OU, and account must pass  │
 │ ② Resource policy    │ Silent │ None = fine within same account  │
 │ ③ Identity policy    │ Allow  │ Contents of the Permission Set   │
 │ ④ Permission boundary│  ✗     │ Boundary has no s3:Delete*       │
 │ ⑤ Session policy     │ N/A    │ Not passed                       │
 │ ⑥ Conditions         │ N/A    │                                  │
 └──────────────────────┴────────┴──────────────────────────────────┘

  Verdict: eliminated at ④ → ❌ DENY
  Tempting wrong answer: "The Permission Set has s3:*, so it's allowed"
```

There are three rules to follow when using this worksheet.

1. **Scan ⓪ first.** If you find a Deny, there is no need to fill in the remaining cells.
2. **A blank (no policy) means something different at each layer.** With no SCP, the request passes (FullAWSAccess); with no resource policy, it is harmless within the same account but **fails** across accounts; with no permission boundary, it passes; with no session policy, it passes. "No policy = pass" is not always true.
3. **Check conditions last, but against every layer.** If the conditions on any layer's statement don't match, that statement is as good as absent.

| Layer | When there is **no policy** | When there is a policy but the action is **not in it** |
|-------|-----------------------------|--------------------------------------------------------|
| SCP | Pass (`FullAWSAccess` default) | Fail (when using an Allow-list strategy) |
| Resource policy | Same account: harmless / **Cross-account: fail** | Same account: harmless / Cross-account: fail |
| Identity policy | **Fail** (no source of permission) | Fail |
| Permission boundary | Pass (no boundary attached) | **Fail** |
| Session policy | Pass (not passed) | **Fail** |

> ⚠️ **Pitfall**: If the exam question does not explicitly say "a Permission Boundary is attached," leave the boundary out of the calculation. Conversely, if the passage includes a line like "this role has a boundary attached," that is very likely the key to the answer. **A layer that is deliberately mentioned in the passage is usually the culprit** — question writers rarely include unnecessary information.

## Integrated Scenario 1: Tracing "Why Is an Administrator Blocked?"

> A company runs 50 accounts with Organizations. A user in the prod account has the `AdministratorAccess` Permission Set assigned. But when this user tries to launch EC2 in `eu-west-1`, the request is denied. CloudTrail records it as `explicitDeny`.

Tracing order (reverse-tracing day1's evaluation flow):

1. **Search for an Explicit Deny** → CloudTrail says `explicitDeny`, so an explicit Deny exists somewhere.
2. **Candidate sources**: AdministratorAccess (Identity) is an Allow. So the Deny must come from an SCP, a Boundary, or a Resource policy.
3. **Clue**: the Region `eu-west-1` plus EC2. The **Region-restriction SCP** from day3 is the most likely suspect.
4. **Conclusion**: the prod OU has a "Deny outside allowed Regions" SCP attached. Even AdministratorAccess cannot break through an SCP.

Key lesson: **AdministratorAccess is only an Identity policy; it cannot exceed the ceiling set by SCPs, Boundaries, or Resource policies.** "I'm an administrator but I'm blocked" is almost always an upstream guardrail or an explicit deny.

> ⚠️ **Pitfall**: In questions like this, choosing "grant a broader IAM policy" is wrong. An SCP Deny cannot be lifted by an IAM Allow. The correct answer is "modify the SCP, or work in an allowed Region."

## Integrated Scenario 2: Safe Developer Delegation Plus Organizational Guardrails

> The security team wants developers in the dev account to create their own Lambda execution roles while (1) preventing privilege escalation, (2) restricting the organization to specific Regions, and (3) isolating resources per team. How do you design this?

An integrated design that mobilizes all four pillars:

```
[SCP — day3] applied to the dev OU
  - Deny outside allowed Regions (global services excepted via NotAction)
  - Deny cloudtrail:StopLogging
  - Deny iam:CreateUser (enforces Identity Center)

[Permission Boundary — day2] enforced on roles developers create
  - Service ceiling: s3, dynamodb, lambda, logs
  - Exclude iam:*, ec2:* → blocks privilege escalation

[Identity Policy — day2] attached to developers
  - Allow iam:CreateRole, but use a Condition to force the Boundary attachment
  - Limit Resource to role/dev-* (namespace isolation)
  - Deny iam:DeleteRolePermissionsBoundary

[ABAC — day4] team isolation
  - Condition: PrincipalTag/Team == ResourceTag/Team
  - Force the team tag at creation via RequestTag
```

When these four layers operate together, developers (1) cannot create roles that exceed their own permissions, (2) cannot work outside the designated Regions, and (3) cannot touch other teams' resources. **No single layer is sufficient on its own** — with only an SCP, privilege escalation is not prevented; with only a Boundary, Region and team isolation are missing.

This design is, in essence, what AWS Control Tower automates. Control Tower provides managed per-OU SCP guardrails, and when Account Factory creates a new account it automatically applies a standard Boundary and the Identity Center mapping. When the exam says "standardize multi-account guardrails while minimizing operational overhead," Control Tower is often the right answer. Hand-attaching SCPs and Boundaries one at a time carries a heavy operational burden.

## Integrated Scenario 3: Cross-Account Data Access

> The security team in the Audit account must read the S3 log buckets of all prod accounts. How do you grant the permission safely?

Day1's cross-account rule (both sides, AND) combines with day4's AssumeRole.

```
Method A — AssumeRole pattern:
  Create an "AuditReadRole" in each prod account
  → Trust policy: allow AssumeRole only for the security team's role in the Audit account
  → Permission policy: s3:GetObject (log bucket only)
  The security team switches to each account's role with sts:AssumeRole

Method B — Resource Policy pattern:
  Allow the Audit account Principal in each prod account's bucket policy
  + The Audit account's IAM policy must also allow that bucket (both sides AND, day1)
```

Method A (AssumeRole) is generally preferred. The reasons: it uses temporary credentials, AssumeRole calls leave a trail in CloudTrail, and you can add an `ExternalId` or MFA condition to the trust policy to prevent the confused deputy problem.

The **confused deputy problem** is a security vulnerability named by Norm Hardy in 1988, in which a privileged entity (the deputy) is tricked by an unprivileged third party into exercising its authority on that party's behalf. In AWS cross-account scenarios, `sts:ExternalId` is the standard remedy. When you give a third-party SaaS access to a role, putting an unguessable ExternalId in the trust policy condition prevents other customers who don't know that ID from switching into the same role.

## Integrated Scenario 4: Blocking Data Exfiltration in Both Directions

> In a regulatory audit, you were asked, "Are you controlling every path by which our data could leave the organization?" What do you apply at which layer?

This question is hard because **the paths run in two directions**. The distinction between `aws:PrincipalOrgID` and `aws:ResourceOrgID` from day1 becomes a practical design here.

```
[ Two directions of data exfiltration and the control point for each ]

── Direction A: outside in (an external principal reads our resource) ──
   External account ──GetObject──▶ our S3 bucket
     Controls: bucket policy Deny + aws:PrincipalOrgID condition
               RCP (organization-wide in one shot, supported services only)
               S3 Block Public Access
     * An SCP cannot block this direction (the principal is external)

── Direction B: inside out (our employee copies data externally) ──
   Our role ──PutObject──▶ external account's S3 bucket
     Controls: SCP Deny + aws:ResourceOrgID condition
               VPC endpoint policy (narrows the path itself)
     * A bucket policy cannot block this direction (it's someone else's bucket)

── Direction C: network bypass (using the internet instead of the endpoint) ──
     Controls: routing and security groups, plus
               forcing the path with the bucket policy's aws:SourceVpce condition
```

Here are the policy statements for the three directions in concrete form.

```json
// [Direction A] Bucket policy — block principals outside the organization
{
  "Sid": "DenyAccessFromOutsideOrg",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::sensitive-data", "arn:aws:s3:::sensitive-data/*"],
  "Condition": {
    "StringNotEquals": { "aws:PrincipalOrgID": "o-exampleorgid" },
    "Bool": { "aws:PrincipalIsAWSService": "false" }
  }
}
```

```json
// [Direction B] SCP — block our principals from sending data to resources outside the organization
{
  "Sid": "DenyWritingToForeignBuckets",
  "Effect": "Deny",
  "Action": ["s3:PutObject", "s3:PutObjectAcl"],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": { "aws:ResourceOrgID": "${aws:PrincipalOrgID}" }
  }
}
```

```json
// [Direction C] Bucket policy — allow only access through the designated VPC endpoint
{
  "Sid": "RequireVpcEndpointPath",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::sensitive-data/*",
  "Condition": {
    "StringNotEquals": { "aws:SourceVpce": "vpce-0abc123def456789a" }
  }
}
```

If you omit the `aws:PrincipalIsAWSService` exception from the Direction A policy, **even the legitimate flows in which AWS services write to the bucket on our behalf are cut off.** Typical examples are CloudTrail writing to a log bucket, or Config and ELB delivering logs. Such service calls may not carry an organization ID context, so they get caught by `StringNotEquals`. This is the cause of the symptom "we added a policy blocking outside the organization and now logs aren't accumulating," and real-world policies almost always include a service-principal exception.

> 🎯 **Scenario**: "The security team is about to deploy the Direction B SCP. What must be verified before deployment?" → **Whether there are legitimate cross-organization data transfers.** Flows such as a batch that sends settlement files to a partner company's bucket, uploads to a third-party backup service, or publishing of open-source artifacts all target resources outside the organization. Following day3's rollout procedure, aggregate the destination bucket accounts of `PutObject` calls in CloudTrail to see whether any outside-organization destinations exist first, and if so, add a statement that allows only those destinations as exceptions. **The most common failure in guardrail rollout is not a wrong policy but failing to investigate the exceptions.**

## Integrated Scenario 5: Responding to Credential Theft

> GuardDuty alerts you that "an EC2 instance role's credentials were used from an unusual location." What can you do with Week 2's tools?

This scenario is Week 2's final integrated drill because it shows **how preventive tools are used in incident response**.

```
[ Theft response — from broad blocking to narrow investigation ]

  Immediate (minutes)
   ① Empty the role's trust policy to block new assumptions
      → Pitfall: sessions already issued remain valid
   ② To invalidate already-issued sessions as well
      → Attach an inline Deny to the role that "rejects sessions issued
        before a given time" (using the aws:TokenIssueTime condition)
      → Or empty the role's permission policy itself
   ③ Isolate the instance — swap security groups, take a snapshot

  Short term (hours)
   ④ Extract that session's full activity (aws:userid / RoleSessionName)
      from CloudTrail as a timeline
   ⑤ Search for privilege-escalation sequences — day2's three paths
      CreateRole / AttachRolePolicy / CreatePolicyVersion
      UpdateAssumeRolePolicy / CreateAccessKey / PassRole+RunInstances
   ⑥ List every newly created identity and key, and remove them

  Structural improvement (days)
   ⑦ Attach a permission boundary to that role to lower the ceiling   (day2)
   ⑧ Enforce IMDSv2 with an SCP to close the same path                (day3)
   ⑨ Add aws:SourceVpce and PrincipalOrgID to bucket policies         (day1)
   ⑩ If long-term keys remain, migrate to federation                  (day4)
```

② is the easy-to-miss point. **Even if you fix the trust policy, temporary credentials that were already issued remain valid until they expire.** The trust policy only blocks "attempts to newly assume the role." So if you need an immediate block, you must touch the **permissions side**, not the trust policy.

| Action | Effect on already-issued sessions | Blocks new assumptions | Reversibility |
|--------|-----------------------------------|------------------------|---------------|
| Empty the trust policy | **None** | Yes | Easy |
| Remove permission policy / attach Deny | **Yes (immediate)** | Effectively yes | Easy |
| `aws:TokenIssueTime` conditional Deny | Invalidates only sessions before a given time | New ones work normally | Easy |
| Delete the role | Yes | Yes | **Hard (breaks dependent workloads)** |
| Block the entire account with an SCP | Yes | Yes | Easy (broad impact) |

What this exposes is the classic distributed-authentication problem of **revocation**. Token-based systems scale well because verification does not require asking the issuer every time, but the price is that "a token already issued cannot be taken back." Rather than invalidating the token itself, AWS provides a workaround of *immediately emptying the permissions side*, solving this practically. If the exam says "temporary credentials have leaked; how do you block them immediately?", the answer is not "revoke the token" but a **policy change**.

Choosing "delete the role" in incident response is usually the wrong answer. Deleting a role kills every legitimate workload that depends on it, destroys configuration information needed for the investigation, and is hard to undo. The answer is always on the side of an action that is **reversible and takes effect immediately** (removing the permission policy, attaching a Deny). The principle is exactly the same logic as "disable, don't delete" in KMS.

## Week 2 Key Summary Table

| Tool | One-line definition | Grants permission? | Scope | Primary use |
|------|---------------------|--------------------|-------|-------------|
| Identity policy | What a principal can do | Yes | Individual principal | Baseline permission grant |
| Resource policy | Who can access this resource | Yes | Resource | Cross-account access |
| Permission Boundary | Ceiling on a principal's permissions | No | Individual principal | Block privilege escalation in delegation |
| SCP | Ceiling for an entire account | No | OU/account | Organizational guardrails |
| Session Policy | Per-session reduction | No | STS session | Minimize temporary permissions |
| Federation | Temporary credentials from an external identity | (via a role) | Users | Eliminate IAM users |
| ABAC | Allow when tags match | (via a policy) | Dynamic | Prevent role explosion |

The "Grants permission?" column of this table is the heart of the exam. **Items marked No can never create permissions — they only cut them.** If you confuse this, you will pick wrong answers on IAM questions.

## Condition Key Cheat Sheet

Here are the condition keys from Week 2, grouped by "what they control." In the exam you must be able to read a requirement sentence and recall the key right away.

| Requirement sentence | Condition key | Caveat |
|----------------------|---------------|--------|
| "Only accounts in our organization may access" | `aws:PrincipalOrgID` | May need a service-principal exception |
| "No exfiltration to resources outside the organization" | `aws:ResourceOrgID` | Opposite direction. Don't confuse with `Principal` |
| "Only under a specific OU" | `aws:PrincipalOrgPaths` | Watch the path string format |
| "Only from approved Regions" | `aws:RequestedRegion` | Global-service `NotAction` exception required |
| "Deny without MFA" | `aws:MultiFactorAuthPresent` | Use `BoolIfExists` in case the key is absent |
| "Only within N seconds of MFA authentication" | `aws:MultiFactorAuthAge` | Forces re-authentication for sensitive actions |
| "HTTPS only" | `aws:SecureTransport` | A default bucket-policy statement |
| "Only from the office IP" | `aws:SourceIp` | Doesn't match when going through a VPC endpoint |
| "Only through this VPC endpoint" | `aws:SourceVpce` / `aws:SourceVpc` | The key to enforcing the path |
| "Force tags at creation" | `aws:RequestTag/*` + `Null` | `ForAllValues` alone does not enforce it |
| "Only when tags match" (ABAC) | `aws:ResourceTag/*` = `${aws:PrincipalTag/*}` | Always lock down tag-modification permissions |
| "Allow creation only with this boundary attached" | `iam:PermissionsBoundary` | Pair with a Deny on removal and replacement |
| "Allow passing the role only to this service" | `iam:PassedToService` | Combine with a resource restriction |
| "Third-party delegation" | `sts:ExternalId` | An unguessable value |
| "Restrict an AWS service's calls made on your behalf" | `aws:SourceArn` / `aws:SourceAccount` | For service principals. Distinguish from ExternalId |
| "Invalidate sessions issued before this time" | `aws:TokenIssueTime` | Used in incident response |
| "Only assertions the IdP sent to AWS" | `SAML:aud` | Blocks replay attacks |
| "Only workflows from this repo and environment" | `<issuer>:sub` + `:aud` | No wildcards |

## A Bundle of Diagnostic CLI Commands

These are the commands to run, in order, when you are blocked. All are read-only, so they are safe even in production.

```bash
# 1) Am I really that principal?
aws sts get-caller-identity

# 2) Does that role have a boundary attached? (day2)
aws iam get-role --role-name DevRole --query 'Role.PermissionsBoundary'

# 3) Does it pass at the IAM and boundary layers? (day1)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/DevRole \
  --action-names s3:PutObject \
  --resource-arns arn:aws:s3:::prod-logs/x.log

# 4) The simulator says allowed but it's blocked → trace the SCP path (day3)
aws organizations list-parents --child-id 111122223333
aws organizations list-policies-for-target \
  --target-id ou-abcd-11111111 --filter SERVICE_CONTROL_POLICY
aws organizations describe-policy --policy-id p-examplepolicyid

# 5) Is the resource side open? (required for cross-account)
aws s3api get-bucket-policy --bucket b-logs
aws kms get-key-policy --key-id alias/app --policy-name default

# 6) Check the federation trust relationship (day4)
aws iam get-role --role-name AuditReadRole --query 'Role.AssumeRolePolicyDocument'
aws sso-admin list-account-assignments \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef \
  --account-id 444455556666 \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-.../ps-...

# 7) Verify whether permissions expand before fixing a policy
aws accessanalyzer check-no-new-access \
  --existing-policy-document file://current.json \
  --new-policy-document file://proposed.json \
  --policy-type IDENTITY_POLICY
```

## Wrong-Answer Patterns: Options to Be Suspicious Of

These are trap options that appear repeatedly within Week 2's scope. Eliminating wrong answers quickly is as decisive for time management as picking the right one.

| Option wording | Why it is wrong |
|----------------|-----------------|
| "Grant a broader IAM policy" | A situation blocked by an SCP, boundary, or resource policy can't be solved with IAM |
| "Grant permissions with an SCP" | An SCP cannot create permissions |
| "Use a child-account SCP to lift the parent OU's restriction" | Inheritance only narrows |
| "Apply the SCP to the management account" | SCPs don't apply to the management account |
| "Create an IAM user and share the access key" | Long-term credentials. Usually wrong in modern design |
| "Make the bucket public" | Never the answer on any question |
| "Monitor with CloudTrail" (when prevention is required) | Detection is not blocking. If the requirement is "prevent it," this is wrong |
| "Delete the role" (incident response) | Irreversible and destroys legitimate workloads |
| "Block with a Config rule" | Config is detection and evaluation, not prevention |
| "Grant permissions with a permission boundary" | A boundary is only a ceiling |
| "Manually deploy the setting to each account" | Directly conflicts with the "minimize operational overhead" requirement |
| "Grant `iam:PassRole` with `Resource: *`" | Effectively grants administrator permission |
| "Use `GetFederationToken`" | Presumes an IAM user. Usually wrong on federation questions |

> 🎯 **Scenario**: "In a regulatory audit, you were asked to prove, per individual, who accessed which production data and when. Currently several people share one team IAM user. What should change?" → The key is that a shared IAM user makes **individual attribution fundamentally impossible**. No matter how finely you dig through CloudTrail, it won't reveal who was behind that user. The answer is not stronger logging but a **change in the identity structure** — move to Identity Center with the IdP as the source, carry the employee identifier in the session name and `sts:SourceIdentity`, and block creation of new shared users with an SCP before removing the existing shared user. This is a classic case where the reflexive response "when an audit requirement appears, turn on more logs" doesn't work.

## Wrap-Up

Week 2 was a journey of re-seeing IAM, from "a switch that ends with one line of Allow" to "a decision engine in which six layers interlock as an intersection." When you meet an IAM question in the exam room, trace it in this order: (1) Is there an explicit deny? → (2) Which guardrail layer (SCP/Boundary) is blocking? → (3) If cross-account, did both sides Allow? → (4) Permissions are granted by Identity/Resource policies, and everything else only cuts. And if the keyword is "minimize operational overhead + standardize multi-account," the answer is Control Tower; for cross-account delegation, it is AssumeRole + ExternalId.

The 2019 Capital One breach shows, within a single incident, where each of Week 2's four pillars should have been working. The attacker used SSRF through a misconfigured WAF to reach the EC2 instance metadata, obtained the temporary credentials of that instance's role, used them to list S3 buckets, and then downloaded the data. Information on roughly 106 million U.S. and Canadian credit card applicants was affected. Walking back through the four pillars: **day3 (SCP)**: enforcing IMDSv2 at the organization level would have narrowed the credential-theft path itself. **day2 (permission boundary)**: if the instance role had had a boundary, the scope of `ListBucket` and `GetObject` would have hit the ceiling. **day1 (conditions)**: if the bucket policy had an `aws:SourceVpce` or `aws:PrincipalOrgID` condition, calls over an unexpected path would have been filtered out. **day4 (identity)**: if the workload identity's permissions had been minimized and its usage patterns observed per session, the anomaly would have surfaced sooner. No single one is a cure-all; **a structure in which the four layers each cut away a bit of the damage** is what defense in depth actually looks like.

In 2014, Code Spaces shut down its business after an intruder gained AWS console access and deleted its instances, storage, snapshots, and backups. It was not just the data but the very means of restoring the data that was wiped out. From Week 2's perspective, the lesson of this case is just one: **"controls must live outside the compromised account."** IAM policies inside an account are neutralized together the moment an intruder grabs administrator permission, but SCPs are managed from the management account, so an intruder who has taken over a member account cannot lift them. That is why the standard structure became isolating log and backup accounts in a separate OU, blocking destructive actions with SCPs, and keeping workloads out of the management account that can change those SCPs. This is why multi-account design is not "management convenience" but **a security control in itself**.

### One-Line Summary

All of Week 2 is one sentence: **"Effective permission = the intersection of six layers, but a single explicit Deny at any layer beats everything."** Only two layers *create* permissions, Identity policies and Resource policies, while SCPs, permission boundaries, session policies, and RCPs only cut, so even `AdministratorAccess` cannot exceed the ceiling. Within the same account, one of an Identity or Resource policy is enough, but cross-account requires both sides to Allow, and confused deputy is prevented with `sts:ExternalId` for third parties and `aws:SourceArn` for AWS services. Delegation works only as a set of enforced `iam:PermissionsBoundary` + a Deny on boundary changes + namespace isolation + a restricted `iam:PassRole`; organizational guardrails do not reach the management account or service-linked roles, and access coming in from outside the organization is the job of RCPs and resource policies. For identity, drop IAM users and move to federation and Identity Center, but it only takes effect if you also block creation of new IAM users with an SCP, and since in ABAC the tag is the identity, failing to lock down tag-modification permissions makes it a privilege-escalation path in its own right. When blocked, narrow down in the order error message → CloudTrail → `get-caller-identity` → simulator → SCP path, without forgetting the limitation that **the simulator does not evaluate SCPs**, and in incident response choose a reversible, immediately effective action (removing the permission policy) over an irreversible one (deletion).

From Week 3 onward, we move to detection and logging (CloudTrail, GuardDuty, Security Hub) that operate on top of this. If IAM is the prevention of "who can do what," Week 3 is the detection of "what actually happened."

---

## 📝 Practice Questions

**Question 1.** A user in the prod account has `AdministratorAccess` assigned, but launching EC2 in `eu-west-1` is denied and `explicitDeny` is recorded in CloudTrail. What are the most likely cause and the solution?

A) The IAM policy is insufficient, so add a broader policy  
B) A Region-restriction SCP is attached to the prod OU, so work in an allowed Region or modify the SCP  
C) Reassign the Permission Set  
D) Enable MFA  

**Answer: B**  
Explanation: AdministratorAccess is only an Identity policy and cannot exceed the ceiling of an SCP. The combination of `eu-west-1` + EC2 + explicitDeny is typically caused by a Region-restriction SCP. An SCP Deny cannot be lifted by an IAM Allow, so broadening the policy is useless; you must work in an allowed Region or modify the SCP itself.

---

**Question 2.** While delegating role creation to developers, we want to achieve all of (1) blocking privilege escalation, (2) Region restriction, and (3) per-team resource isolation. What is the correct combination of tools?

A) Solve everything with a single SCP  
B) Solve everything with a single Permission Boundary  
C) Use SCP (Region restriction) + enforced Permission Boundary (blocking privilege escalation) + ABAC (team isolation) together  
D) Give AdministratorAccess and monitor with CloudTrail  

**Answer: C**  
Explanation: The three requirements are each handled by a different layer. Region restriction is solved by an SCP, blocking privilege escalation by enforced Boundary attachment, and team isolation by ABAC. No single tool can satisfy all three. AdministratorAccess + after-the-fact monitoring is detection, not prevention, and is unsuitable for delegation security.

---

**Question 3.** The security team in the Audit account must read the S3 log buckets of multiple prod accounts. What method uses temporary credentials, leaves an audit trail, and prevents the confused deputy problem?

A) Create an IAM user in the prod account and share the access key  
B) Create a read-only role in each prod account, and in the trust policy allow AssumeRole only from the Audit account plus an ExternalId condition  
C) Make all buckets public  
D) Give the Audit account AdministratorAccess  

**Answer: B**  
Explanation: For cross-account reading, the standard is to create a least-privilege role in each account and allow only the Audit account to AssumeRole through the trust policy. It uses temporary credentials, AssumeRole is recorded in CloudTrail, and the ExternalId condition prevents the confused deputy. Sharing an access key risks leaking long-term credentials, public buckets are a serious exposure, and AdministratorAccess violates least privilege.

---

**Question 4.** In the scenario "consistently apply standard SCP guardrails and Identity Center mappings to 50 new accounts while minimizing operational burden," what is the most appropriate solution?

A) Manually configure SCPs and Permission Sets for each account  
B) Apply OU guardrails and Account Factory standardization with AWS Control Tower  
C) Deploy Lambda automation separately to each account  
D) Merge all accounts into one  

**Answer: B**  
Explanation: The keywords "minimize operational burden + multi-account standardization" point to Control Tower. Control Tower provides OU-level SCP guardrails as a managed feature and, through Account Factory, automatically applies standard settings and Identity Center mappings when a new account is created. Manual configuration and per-account Lambda carry a high operational burden, and merging accounts breaks blast radius isolation.

---

**Question 5.** Which of the following is grouped only with tools that "do not grant permissions and only restrict the upper limit"?

A) Identity policy, Resource policy  
B) SCP, Permission Boundary, Session Policy  
C) Identity policy, SCP  
D) Resource policy, ABAC  

**Answer: B**  
Explanation: SCPs, Permission Boundaries, and Session Policies are all guardrails that do not grant permissions and only set the upper limit (ceiling). Actual permission granting is handled by Identity policies and Resource policies. Therefore every choice that mixes in granting tools (Identity/Resource) is wrong, and the correct answer is the one that groups only the three guardrails.
