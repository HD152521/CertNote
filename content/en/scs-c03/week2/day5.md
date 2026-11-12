# Day 5 - Week 2 Integration: Multi-Account IAM Governance Scenario

Over the four days of Week 2, we built four pillars of IAM. Day 1''s **policy evaluation logic** (six layers and intersection, explicit deny priority), Day 2''s **Permission Boundary** (ceiling on individual permissions and safe delegation), Day 3''s **SCP** (guardrails for the entire account), Day 4''s **federation and ABAC** (temporary credentials and tag-based scaling). Today, we see how these four are not isolated knowledge but **one governance machine** interlocking.

The real difficulty on the Specialty exam isn''t "what is SCP" but "in an environment with SCP, Boundary, IAM, and Resource policies all applied, why is this request blocked?" Tracking that is the real skill. Today we train that tracking muscle with integration scenarios.

## Four Pillars in One Picture

When an employee in a multi-account environment tries to read one S3 object, the request must pass through all these gates.

```
[Employee] alice — SAML login from IdP (day4)
   │  Passes PrincipalTag: Team=payments
   ▼
[STS] AssumeRoleWithSAML → issues temporary credentials (day4)
   │  Can further narrow session permissions with Session Policy
   ▼
┌──────────── Evaluation Engine (day1) ────────────┐
│ 0. Explicit Deny anywhere? → If yes, end          │
│ 1. SCP allows? (account guardrails, day3)         │
│ 2. Resource Policy (bucket policy) allows?        │
│ 3. Identity Policy (Permission Set) allows?       │
│ 4. Permission Boundary allows? (day2)             │
│ 5. Session Policy allows? (day4)                  │
│ 6. ABAC condition: tags match? (day4)             │
└─────────────────────────────────────────────────┘
   │ All pass (intersection) → ✅ Access granted
   ▼
[S3 object read success]
```

This picture is all of Week 2. Block any single layer and it''s Deny. Exam questions are essentially asking "which layer in this picture is the culprit?"

> 💡 **Related Theory**: This multi-layer structure is a textbook implementation of **defense in depth** from security engineering. Instead of a single control point, you have multiple independent control layers so that if one mistakenly opens, another still blocks. At the same time, all layers are **default-deny** and combine via **intersection**, so permissions flow exactly as much as you intentionally granted. AWS IAM embedded these two principles (defense in depth + least privilege) into the policy evaluation algorithm itself.

## Integration Scenario 1: "I''m an admin, why am I blocked?" Tracking

> A company operates 50 accounts via Organizations. A user in the prod account is assigned the `AdministratorAccess` Permission Set. Yet when this user tries to start EC2 in `eu-west-1`, access is denied. CloudTrail records `explicitDeny`.

Tracking sequence (reversing day 1 evaluation flow):

1. **Search for Explicit Deny** → CloudTrail says `explicitDeny`, so an explicit Deny is somewhere.
2. **Source candidates**: AdministratorAccess (Identity) is Allow. So Deny comes from SCP, Boundary, or Resource policy.
3. **Clue**: `eu-west-1` region + EC2. The **region-restriction SCP** from day 3 is most likely.
4. **Conclusion**: A "Deny non-allowed regions" SCP is attached to the prod OU. AdministratorAccess can''t break through SCP.

Core lesson: **AdministratorAccess is just an Identity policy; it can''t breach the ceilings of SCP, Boundary, and Resource policies.** "I''m an admin but blocked" is almost always a higher guardrail or explicit deny.

> ⚠️ **Pitfall**: In these questions, choosing "give a broader IAM policy" is wrong. SCP Deny cannot be opened by IAM Allow. The answer is "modify the SCP or work in an allowed region."

## Integration Scenario 2: Safe Developer Delegation + Organizational Guardrails

> Security team wants to let developers in the dev account create Lambda execution roles directly, but (1) prevent privilege escalation, (2) enforce specific regions org-wide, and (3) isolate resources by team. How do you design this?

A full integration using all four pillars:

```
[SCP — day3] Applied to dev OU
  - Deny non-allowed regions (global services NotAction exception)
  - Deny cloudtrail:StopLogging
  - Deny iam:CreateUser (enforce Identity Center)

[Permission Boundary — day2] Forced on roles developers create
  - Allowed services ceiling: s3, dynamodb, lambda, logs
  - Exclude iam:*, ec2:* → block privilege escalation

[Identity Policy — day2] Attached to developers
  - Allow iam:CreateRole, but Condition requires Boundary attachment
  - Resource limited to role/dev-* (namespace isolation)
  - Deny iam:DeleteRolePermissionsBoundary

[ABAC — day4] Team isolation
  - PrincipalTag/Team == ResourceTag/Team condition
  - RequestTag forces team tag at creation
```

When these four layers work together, developers (1) can''t create roles beyond their permissions, (2) can''t work outside designated regions, and (3) can''t touch other teams'' resources. **No single layer alone is sufficient** — SCP alone can''t prevent privilege escalation, Boundary alone can''t enforce region/team isolation.

> 🔍 **Deeper**: This design is exactly what AWS Control Tower automates. Control Tower provides managed SCP guardrails per OU and applies standard Boundary and Identity Center mapping when creating new accounts via Account Factory. On the exam, if the keywords are "minimize operational burden + standardize multi-account guardrails," Control Tower is often the answer. Manually applying SCP and Boundary is operationally heavy.

## Integration Scenario 3: Cross-Account Data Access

> The security team in the Audit account must read S3 log buckets in all prod accounts. How do you safely grant permissions?

Day 1''s cross-account rule (both sides AND) combines with day 4''s AssumeRole.

```
Method A — AssumeRole pattern:
  Create "AuditReadRole" in each prod account
  → Trust policy: Only Audit account''s security team role can AssumeRole
  → Permissions policy: s3:GetObject (log buckets only)
  Security team switches roles via sts:AssumeRole to each account

Method B — Resource Policy pattern:
  Bucket policy in each prod account permits Audit account Principal
  + Audit account''s IAM policy also permits that bucket (both AND, day1)
```

Method A (AssumeRole) is generally preferred. Reasons: uses temporary credentials, AssumeRole is tracked in CloudTrail, trust policy can add `ExternalId` or MFA conditions to prevent confused deputy.

> 💡 **Related Theory**: The **confused deputy problem**, named by Norm Hardy in 1988, is a security vulnerability where an authorized principal (deputy) is tricked by an unauthorized third party into exercising that privilege on their behalf. `sts:ExternalId` in AWS cross-account is the standard solution. When granting a third-party SaaS role access, putting an unguessable ExternalId in the trust policy condition means another customer without that ID can''t assume the same role.

## Week 2 Essentials Summary Table

| Tool | One-Line Definition | Grants Permission? | Scope | Primary Use |
|------|--------|-----------|-----------|---------|
| Identity Policy | What a principal can do | Yes | Individual principal | Grant base permissions |
| Resource Policy | Who can access this resource | Yes | Resource | Cross-account access |
| Permission Boundary | Ceiling on principal permissions | No | Individual principal | Prevent escalation on delegation |
| SCP | Ceiling on entire account | No | OU/account | Organizational guardrails |
| Session Policy | Narrow permissions per session | No | STS session | Minimize temporary permissions |
| Federation | Temporary creds from external ID | (via role) | User | Eliminate IAM users |
| ABAC | Allow if tags match | (via policy) | Dynamic | Prevent role explosion |

The "Grants Permission?" column is the exam''s core. **Anything marked No can never create permissions — only strip them.** Confuse this and you fail half the questions.

## Wrapping Up

Week 2 was a journey from seeing IAM as "one-line Allow switch" to seeing it as a "six-layer decision engine with intersection." In the exam, when you hit an IAM question, always track in this order: (1) Is there an explicit deny? → (2) Which guardrail layer (SCP/Boundary) blocks it? → (3) For cross-account, did both sides Allow? → (4) Remember Identity/Resource policies grant, everything else only strips. And when keywords are "minimize operational burden + standardize multi-account," think Control Tower; for cross-account delegation, think AssumeRole + ExternalId.

From Week 3 onward, we move to detection and logging (CloudTrail, GuardDuty, Security Hub) operating on top of this. If IAM is prevention for "who can do what," Week 3 is detection for "what actually happened."

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
