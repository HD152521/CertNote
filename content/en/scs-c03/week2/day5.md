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

## 📝 연습 문제

**문제 1.** prod 계정의 사용자에게 `AdministratorAccess`가 할당되어 있는데, `eu-west-1`에서 EC2 시작이 거부되고 CloudTrail에 `explicitDeny`가 기록된다. 가장 유력한 원인과 해결책은?

A) IAM 정책이 부족하므로 더 넓은 정책을 추가한다  
B) prod OU에 리전 제한 SCP가 걸려 있으므로, 허용 리전에서 작업하거나 SCP를 수정한다  
C) Permission Set을 다시 할당한다  
D) MFA를 활성화한다  

**정답: B**  
해설: AdministratorAccess는 Identity 정책일 뿐 SCP의 천장을 넘지 못한다. `eu-west-1` + EC2 + explicitDeny 조합은 리전 제한 SCP가 전형적 원인이다. SCP Deny는 IAM Allow로 풀 수 없으므로 정책을 더 넓혀도 소용없고, 허용 리전에서 작업하거나 SCP 자체를 수정해야 한다.

---

**문제 2.** 개발자에게 롤 생성을 위임하면서 (1) 권한 상승 차단, (2) 리전 제한, (3) 팀별 리소스 격리를 모두 달성하려 한다. 올바른 도구 조합은?

A) SCP 하나로 전부 해결한다  
B) Permission Boundary 하나로 전부 해결한다  
C) SCP(리전 제한) + Permission Boundary 강제(권한 상승 차단) + ABAC(팀 격리)를 함께 쓴다  
D) AdministratorAccess를 주고 CloudTrail로 감시한다  

**정답: C**  
해설: 세 요구사항은 각기 다른 층이 담당한다. 리전 제한은 SCP, 권한 상승 차단은 Boundary 강제 부착, 팀 격리는 ABAC가 푼다. 어느 한 도구만으로는 세 가지를 모두 충족할 수 없다. AdministratorAccess + 사후 감시는 예방이 아니라 탐지일 뿐이라 위임 보안에 부적합하다.

---

**문제 3.** Audit 계정의 보안팀이 여러 prod 계정의 S3 로그 버킷을 읽어야 한다. 임시 자격증명을 쓰고 감사 추적을 남기며 confused deputy를 방지하는 방법은?

A) prod 계정에 IAM 사용자를 만들어 access key를 공유한다  
B) 각 prod 계정에 읽기 전용 롤을 만들고, 신뢰 정책에서 Audit 계정만 AssumeRole 허용 + ExternalId 조건을 건다  
C) 모든 버킷을 퍼블릭으로 만든다  
D) Audit 계정에 AdministratorAccess를 준다  

**정답: B**  
해설: 크로스 계정 읽기는 각 계정에 최소 권한 롤을 만들고 신뢰 정책으로 Audit 계정만 AssumeRole하게 하는 것이 표준이다. 임시 자격증명을 쓰고 CloudTrail에 AssumeRole이 남으며, ExternalId 조건으로 confused deputy를 막는다. access key 공유는 장기 자격증명 유출 위험, 퍼블릭 버킷은 심각한 노출, AdministratorAccess는 최소 권한 위반이다.

---

**문제 4.** "운영 부담을 최소화하면서 50개 신규 계정에 표준 SCP 가드레일과 Identity Center 매핑을 일관되게 적용"하라는 시나리오에서 가장 적절한 솔루션은?

A) 계정마다 SCP와 Permission Set을 수동으로 설정한다  
B) AWS Control Tower로 OU 가드레일과 Account Factory 표준화를 적용한다  
C) 각 계정에 Lambda 자동화를 따로 배포한다  
D) 모든 계정을 하나로 합친다  

**정답: B**  
해설: "운영 부담 최소화 + 멀티 계정 표준화" 키워드는 Control Tower를 가리킨다. Control Tower는 OU별 SCP 가드레일을 매니지드로 제공하고 Account Factory로 새 계정 생성 시 표준 설정과 Identity Center 매핑을 자동 적용한다. 수동 설정과 계정별 Lambda는 운영 부담이 크고, 계정 통합은 blast radius 격리를 깨뜨린다.

---

**문제 5.** 다음 중 "권한을 부여하지 않고 오직 상한만 제한하는" 도구로만 묶인 것은?

A) Identity 정책, Resource 정책  
B) SCP, Permission Boundary, Session Policy  
C) Identity 정책, SCP  
D) Resource 정책, ABAC  

**정답: B**  
해설: SCP, Permission Boundary, Session Policy는 모두 권한을 부여하지 않고 상한(천장)만 정하는 가드레일이다. 실제 권한 부여는 Identity 정책과 Resource 정책이 담당한다. 따라서 부여 도구(Identity/Resource)가 섞인 보기는 모두 틀리며, 세 가드레일만 묶인 것이 정답이다.
