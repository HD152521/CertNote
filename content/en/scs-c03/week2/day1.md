# Day 1 - Mastering Policy Evaluation Logic: Explicit Deny Beats Everything

If you had to pick the single most confusing topic on the SCS-C03 exam, it would be **IAM policy evaluation logic**. The question "will this request be allowed or denied?" is scattered across every domain, and all four options look plausible while only one is correct. The reason is that IAM is not a simple ON/OFF switch but **a multi-layer decision engine in which six kinds of policy are evaluated at the same time**.

At the Associate level, the simple model "if an IAM policy allows it, it is allowed" was enough. At the Specialty level, however, you must be able to trace "why was I blocked even though I granted the permission?" in an environment where SCPs, permissions boundaries, session policies, resource-based policies, and even VPC endpoint policies all operate simultaneously. Today we get the **evaluation flow** that AWS spells out in its official documentation into our hands, without skipping a single line.

Here is how to define this skill in one sentence: **"Given several policy documents, can you work out by hand whether one specific request passes?"** The IAM questions on SCS-C03 require this calculation almost without exception. They are not questions about memorizing service names; they are questions about laying JSON fragments on top of one another and finding the intersection. So today's goal is not knowledge but a *procedure*.

## Input to the Evaluation Engine: The Request Context

To calculate policy evaluation, you first need to know **what goes into the engine**. Every API call that reaches AWS is broken down, together with its signature, into the following four pieces and handed to the evaluation engine. This is called the **request context**.

```
[ Request context = the input to policy evaluation ]

  ① Principal   Who made the request
                 arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc
                 (with temporary credentials, it appears in assumed-role form)

  ② Action      What it is trying to do
                 s3:GetObject

  ③ Resource    On what
                 arn:aws:s3:::prod-logs/2026/07/29/app.log

  ④ Context     Everything else — what a Condition inspects
                 aws:SourceIp          = 203.0.113.45
                 aws:PrincipalTag/Team = payments
                 aws:RequestedRegion   = ap-northeast-2
                 aws:SecureTransport   = true
                 aws:PrincipalOrgID    = o-exampleorgid
                 aws:ViaAWSService     = false
                 ...
```

The four elements of a policy — `Principal`/`Action`/`Resource`/`Condition` — are each matched against these four pieces. A property that bears directly on the exam comes out of this. **If the context key a Condition inspects does not exist in the request at all, the condition is treated as "not matched," and the entire Statement is ignored.** That is precisely why the `...IfExists` operators, which we will see later, exist.

| Context key category | Representative keys | Where it comes from |
|------------------|---------|-------------|
| Principal identity | `aws:PrincipalArn`, `aws:PrincipalAccount`, `aws:PrincipalOrgID`, `aws:userid` | The credentials themselves |
| Principal attributes | `aws:PrincipalTag/*` | Role and user tags, session tags |
| Request content | `aws:RequestTag/*`, `aws:TagKeys`, `aws:RequestedRegion` | API parameters |
| Resource attributes | `aws:ResourceTag/*`, `aws:ResourceOrgID` | The target resource |
| Network | `aws:SourceIp`, `aws:SourceVpc`, `aws:SourceVpce`, `aws:VpcSourceIp` | The call path |
| Authentication strength | `aws:MultiFactorAuthPresent`, `aws:MultiFactorAuthAge`, `aws:SecureTransport` | When the session was issued |
| Service-on-behalf calls | `aws:ViaAWSService`, `aws:PrincipalIsAWSService`, `aws:SourceArn`, `aws:SourceAccount` | When an AWS service calls on your behalf |

Confusing `aws:SourceIp` with `aws:VpcSourceIp` quietly neutralizes a policy. When a request **goes through a VPC endpoint**, it arrives over a private path rather than a public IP, so `aws:SourceIp` does not match the value you want. In that case you must check with `aws:SourceVpce` (the endpoint ID) or `aws:SourceVpc` (the VPC ID). Symptoms such as a call from EC2 inside the VPC being blocked despite an "allow access only from the office IP" policy, or conversely a request through an endpoint bypassing the IP condition, come from here. On the exam, "on-premises / office IP restriction" is the signal for `aws:SourceIp`, and "only from inside the VPC" is the signal for `aws:SourceVpc`/`aws:SourceVpce`.

## The Three Great Principles of IAM Evaluation

All evaluation runs on the following three principles. These three are the foundation of evaluation.

1. **The default is Implicit Deny** — every request that is not explicitly allowed is denied.
2. **Explicit Deny wins unconditionally** — even if some policy allows it, if even a single policy denies it, the final result is Deny.
3. **Multiple policy types are in an AND relationship (intersection)** — if SCP, boundary, and identity policies are all in place, **all of them must allow at the same time** for the request to pass. If any one is missing, it is blocked.

In security engineering this model is called a **default-deny** (or deny-by-default) policy. It is whitelist-style access control and is far safer than a blacklist (default-allow). A blacklist says "allowed unless it's on the prohibited list," so a hole opens every time a new attack surface appears, whereas a whitelist says "blocked unless it's on the allowed list," so it automatically blocks unknown behavior. IAM is thoroughly default-deny, which is why the situation "it worked even though I never granted the permission" almost never occurs.

## Six Kinds of Policy and the Evaluation Order

When a request arrives, IAM gathers all of the following policies and evaluates them.

| Policy type | Attached to | Role | Can it grant permissions? |
|-----------|-----------|------|-----------------|
| Identity-based | User/Group/Role | What the principal can do | Yes |
| Resource-based | S3 bucket, KMS key, etc. | Who can access this resource | Yes |
| Permission Boundary | User/Role | The ceiling on the principal's permissions | No (ceiling only) |
| SCP | OU/Account | The maximum-permission guardrail for the whole account | No (ceiling only) |
| Session Policy | Passed at AssumeRole | Narrowing permissions per session | No (ceiling only) |
| RCP (Resource Control Policy) | OU/Account | An organization-level guardrail for resource access | No (ceiling only) |

In practice, one more layer sits on top of these. A **VPC endpoint policy** is a resource-based policy that applies only to requests *passing through* that endpoint, and it creates data exfiltration controls such as "S3 requests leaving this VPC can only target our organization's buckets." It is on a different axis from IAM and SCPs, but it participates in the final decision in exactly the same way.

If we look at each layer again by "who manages it," it becomes clear why there are so many layers.

| Layer | Managed by | The question it controls | What this layer alone cannot do |
|----|-----------|---------------|--------------------------|
| SCP | The organization's management account | "What is the maximum this **account** can do in the first place?" | Per-individual differentiation, granting permissions |
| Permission Boundary | The account's IAM administrator | "What is the ceiling on permissions this **principal** can have?" | Account-wide control, granting permissions |
| Identity policy | The account's IAM administrator | "What do we actually **give** this principal?" | Enforcing a ceiling |
| Resource policy | **The account that owns the resource** | "Who do we **let in** to this resource?" | Controlling things inside the caller's account |
| Session policy | **The code calling** AssumeRole | "How much do we narrow just this **session**?" | Permanent control |
| RCP | The organization's management account | "Can a principal outside the organization reach our **resources**?" | Granting permissions, covering every service |

The key to read in this table is that **the managing parties are different**. The reason there are so many layers is not that it is complicated but that *the person who grants permissions*, *the person who sets the ceiling*, and *the person who owns the resource* are different people in an organization. Each role must be able to cover for another person's mistake for defense in depth to hold.

> ⚠️ **Trap**: RCP is the "resource-side twin" of SCP, but **it does not apply to every service.** Because the supported services are limited, be careful with options like "lock down all organization resources at once with an RCP." Conversely, an SCP works *only when the principal belongs to an account in our organization*, so **a path by which a principal outside the organization accesses our resource is not blocked by an SCP.** RCP came about to fill this gap, which is why the two policies are not substitutes but a pair that covers each other's blind spots.

The evaluation order is as follows. It follows the official AWS flowchart exactly.

```
Request arrives
  │
  ▼
1. Is there an explicit Deny anywhere at all?
     YES → ❌ DENY (ends immediately, other evaluation ignored)
     NO  ↓
2. Does the SCP allow this action? (when the account is an Organizations member)
     NO  → ❌ DENY
     YES ↓
3. Does a resource-based policy explicitly Allow?
     YES → ✅ ALLOW (in some cases passes even without an identity policy)
     NO  ↓
4. Does an identity-based policy Allow?
     NO  → ❌ DENY
     YES ↓
5. Does the Permission Boundary Allow? (if one is set)
     NO  → ❌ DENY
     YES ↓
6. Does the Session Policy Allow? (for an AssumeRole session)
     NO  → ❌ DENY
     YES → ✅ ALLOW
```

**Step 1 comes first and takes precedence unconditionally.** Even if the SCP allows and the identity policy allows, a single line `"Effect": "Deny"` in the resource policy ends it.

If we redraw the same flow as a picture of "the gates a request must pass through," what each layer is holding becomes visible. This is exactly the picture you will need to draw by hand in the exam room.

```
[ The gates a single API request must pass through ]

   Request  s3:GetObject  on  arn:aws:s3:::prod-logs/app.log
   Principal  arn:aws:sts::111122223333:assumed-role/DevRole/alice
     │
     ▼
  ┌────────────────────────────────────────────────────────┐
  │ 0. Explicit Deny scan — sweeps every layer at once      │
  │    SCP·RCP·Boundary·Session·Identity·Resource·VPCE      │
  │    A single Deny anywhere → ❌ ends at once, no more evaluation │
  └────────────────────────────────────────────────────────┘
     │ No Deny
     ▼
  ┌─ ① SCP (organization guardrail) ───────────────────────┐
  │    SCPs on the Root → OU → account path must **all** allow │
  │    · Does not apply to the management account           │
  │    · Does not apply to service-linked roles             │
  │    · Does apply to the root user of a member account    │
  └────────────────────────────────────────────────────────┘
     │ Allowed
     ▼
  ┌─ ② Resource-based policy (bucket policy / key policy / trust policy) ─┐
  │    Same account  : an Allow here can pass even without an Identity policy │
  │    Cross-account : an Allow here is a **required condition** (cannot be skipped) │
  └────────────────────────────────────────────────────────┘
     │
     ▼
  ┌─ ③ Identity policy (Permission Set / inline / managed) ┐
  │    "The permissions actually granted to this principal" │
  └────────────────────────────────────────────────────────┘
     │ Allowed
     ▼
  ┌─ ④ Permission Boundary (if attached) ──────────────────┐
  │    However broad ③ is, an action not here drops out     │
  └────────────────────────────────────────────────────────┘
     │ Allowed
     ▼
  ┌─ ⑤ Session Policy (if passed at AssumeRole) ───────────┐
  │    A range narrowed further for this session only       │
  └────────────────────────────────────────────────────────┘
     │ Allowed
     ▼
  ┌─ ⑥ Final evaluation of Conditions ─────────────────────┐
  │    MFA · IP · Region · tags · OrgID · encrypted transport … │
  │    If even one condition fails → that Statement is as if it did not exist │
  └────────────────────────────────────────────────────────┘
     │
     ▼   ✅ ALLOW
```

Remember three things from this picture.

1. **Step 0 is not an order but a global scan.** It does not matter "which layer denied." If there is even one, it is over.
2. **① through ⑤ are all AND.** I drew it as if descending from top to bottom, but in reality *all must be true at the same time* to pass. So "all must pass" is a far more important fact than "memorizing the order." Even if you remember the order slightly differently, the answer comes out the same.
3. **Only ② has a "shortcut."** Within the same account, if a resource policy directly allows the principal, it can pass even without an Identity policy. This asymmetry is the subject of the next section.

> ⚠️ **Trap**: The classic trap is "the administrator attached `AdministratorAccess`, so why can't they read the S3 object?" The answer is usually one of **an explicit deny in the bucket policy**, **an SCP block**, or **the KMS key policy not allowing it**. AdministratorAccess is only an Identity policy and cannot break through the other five layers.

SCPs **do not apply to service-linked roles.** That is why a situation such as "I denied all `autoscaling:*` with an SCP, yet Auto Scaling keeps launching instances" actually occurs. A service-linked role is a special role an AWS service uses to perform its own functions, so it sits outside the organization guardrails. Conversely, **SCPs do apply to the root user of a member account** — people often memorize these two the wrong way around.

> 🎯 **Scenario**: "The company deployed an SCP prohibiting the use of Regions other than `ap-northeast-2`. Yet an audit shows that CloudFront distributions and IAM roles keep being created in `us-east-1`. Has the control failed?" → No. **Global services** such as IAM, CloudFront, and Route 53 have **API endpoints routed to `us-east-1`**, so it is normal for them to be intentionally exempted in a Region-restriction SCP (covered on day 3). What you should judge here is not "the SCP was breached" but that "a Region restriction is, by nature, a control that cannot apply to global services in the first place." Knowing the *limits* of a control is also part of control design.

## Visualizing the Intersection: Permissions Only Get Cut Down

Guardrail policies (SCP, boundary, session, RCP) **do not grant** permissions. They only set a ceiling. The actual effective permissions are the **intersection** of all the layers.

```
Effective permissions = SCP-allowed ∩ Boundary-allowed ∩ Identity-allowed ∩ Session-allowed
           (but if an Explicit Deny exists anywhere, that action is excluded)
```

For example, consider the following situation.

```json
// SCP: allows s3:* and ec2:*
{ "Effect": "Allow", "Action": ["s3:*", "ec2:*"], "Resource": "*" }

// Permission Boundary: allows only s3:*
{ "Effect": "Allow", "Action": "s3:*", "Resource": "*" }

// Identity Policy: allows s3:GetObject, ec2:RunInstances
{ "Effect": "Allow", "Action": ["s3:GetObject", "ec2:RunInstances"], "Resource": "*" }
```

What can this user actually do? Work out the intersection of the three layers.

- `s3:GetObject` → SCP (yes) ∩ Boundary (yes) ∩ Identity (yes) = **allowed**
- `ec2:RunInstances` → SCP (yes) ∩ Boundary (**no**, the boundary has no ec2) ∩ Identity (yes) = **denied**

Even though the Identity policy explicitly Allows `ec2:RunInstances`, the Permission Boundary does not include ec2, so it drops out of the intersection. This is what it means that **it cannot exceed the ceiling**.

This is a mechanism that structurally enforces the security **Principle of Least Privilege (PoLP)**. It is one of the eight security design principles established by Jerome Saltzer and Michael Schroeder in their 1975 paper "The Protection of Information in Computer Systems." If you place several layers of guardrails, then even if one layer's policy is mistakenly opened too wide, another layer blocks the ceiling. This is called **defense in depth**.

## The Specifics of Resource-Based Policies: Evaluation Across Accounts

Within the same account, it is enough for either the Identity policy **or** the Resource policy alone to Allow (the two behave like a union). But **cross-account** is different.

```
For cross-account access:
  - The caller account's Identity policy: Allow required (AND)
  - The resource account's Resource policy: Allow required (AND)
  → Both sides must Allow to pass
```

That is, for a user in account A to access an S3 bucket in account B, A's IAM policy must allow that bucket **and at the same time** B's bucket policy must allow A. One side alone is not enough.

```
[ Same account vs cross-account — the combination rule differs ]

── Same account (OR / union) ─────────────────────────────
   Account 111122223333
   ┌──────────────┐            ┌──────────────────┐
   │ role/Reader  │ ──request─▶│ s3://logs (same account) │
   │  IAM: Allow  │            │  Bucket policy: none      │
   └──────────────┘            └──────────────────┘
        → Passes ✅  (IAM alone is enough)

   ┌──────────────┐            ┌──────────────────┐
   │ role/Reader  │ ──request─▶│ s3://logs         │
   │  IAM: none   │            │ The bucket policy Allows this role │
   │              │            │ as a Principal    │
   └──────────────┘            └──────────────────┘
        → Passes ✅  (the resource policy alone is enough)

── Cross-account (AND / intersection) ────────────────────
   Account A 111122223333         Account B 444455556666
   ┌──────────────┐               ┌──────────────────┐
   │ role/Reader  │ ──request────▶│ s3://b-logs      │
   │ IAM: Allow   │               │ Bucket policy: allows A │
   │  (B's ARN)   │               │                  │
   └──────────────┘               └──────────────────┘
        A's IAM Allow  ✅  AND  B's bucket policy Allow ✅  → Passes

        If only one side has it → ❌  (no exceptions)
```

This rule has a name. When, within the same account, a resource policy directly specifies a principal and allows it, AWS calls that the **principal-in-resource-policy** path, and a request arriving via this path can pass even without an Allow in the Identity policy. Conversely, in cross-account this shortcut disappears. It is a design to uphold the trust boundary that **"an administrator in my account cannot obtain permissions on another account's resources behind my back."** That is, the cross-account AND rule is not an inconvenience but *a device that makes the account, as a unit of isolation, meaningful*.

Because of this asymmetry, KMS is especially tricky. Unlike IAM policies, with a KMS key policy, **unless the key policy explicitly specifies delegation to IAM, IAM policies alone cannot use the key.** The single line `"Principal": {"AWS": "arn:aws:iam::ACCOUNT:root"}` in the default key policy means "delegate the permission decision to this account's IAM policies." Without this line, even AdministratorAccess cannot use the KMS key. It is a trap that is easy to confuse.

Cross-account access has **two different shapes**, and the exam makes you tell them apart. One is the *resource policy approach* we just saw, in which a principal in account A calls B's resource **with A's credentials as they are** — CloudTrail's `userIdentity` is still A's role, and in B's trail it remains as "an external account used my resource." The other is the *AssumeRole approach*, in which A's principal **changes identity** into B's role and then makes local requests inside B — in that case B's logs record it as a role belonging to B, and the original person is traced back through the session name. If the audit requirement is "we want to see who did what in our account, complete in our own logs alone," the AssumeRole approach is right; if it is "we only need to open one bucket and don't want to increase the burden of managing roles," the resource policy approach is right.

The risk that arises the moment you open cross-account access is "how broadly did you open it." Instead of opening by account number alone, a condition that restricts by organization unit is the practical standard.

```json
{
  "Sid": "AllowOrgAccountsOnly",
  "Effect": "Allow",
  "Principal": "*",
  "Action": ["s3:GetObject"],
  "Resource": "arn:aws:s3:::central-logs/*",
  "Condition": {
    "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" },
    "Bool": { "aws:SecureTransport": "true" }
  }
}
```

Judging "a public bucket" from `"Principal": "*"` alone is the wrong answer. The moment the `aws:PrincipalOrgID` condition is attached, this statement narrows to **"only principals from accounts belonging to our organization."** The advantage of this pattern is that you do not need to fix the policy even when new accounts are created and brought into the organization, and conversely, the safeguard is that **access is cut immediately when an account leaves the organization**.

If you use `aws:PrincipalOrgID` and `aws:ResourceOrgID` interchangeably, the direction of the control becomes exactly the opposite. `PrincipalOrgID` asks "is **the calling side** our organization?" and `ResourceOrgID` asks "does **the target resource** belong to our organization?" To prevent data exfiltration (our staff pulling data out to an external bucket) you need `aws:ResourceOrgID`, and to prevent outside intrusion (an external account reading our bucket) you need `aws:PrincipalOrgID`. The two directions are separate controls, and in most cases you need both.

## Session Policies and Role Chaining: Seeing the Sixth Layer in Practice

The Session Policy is the least well known of the six layers, but it is the only means by which **the code calling AssumeRole narrows permissions further on the spot**. You do not need to create the policy in advance; you create it at the moment of the call and pass it in.

```bash
# ① Inline session policy — narrow the scope to a single bucket for this session only
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/DataProcessor \
  --role-session-name alice@example.com \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::tenant-acme/*"
    }]
  }'

# ② Specify managed policy ARNs as the session policy (up to 10)
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/DataProcessor \
  --role-session-name batch-2026q3 \
  --policy-arns arn=arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# ③ Session tags + source identity — passed together for ABAC and audit tracing
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/AuditReadRole \
  --role-session-name audit-run \
  --external-id 7f3c9a2b-e1d4-4a88-9c6f-2b0d5e91a4c7 \
  --tags Key=Team,Value=payments Key=Env,Value=prod \
  --transitive-tag-keys Team \
  --source-identity alice@example.com
```

The decisive property of a session policy is that it **cannot add permissions**. Passing `AmazonS3ReadOnlyAccess` as the session policy in ② above does not give the role S3 permissions it did not already have. Only the **intersection** of the role policy and the session policy remains.

| Parameter | What it does | Security significance |
|----------|---------|-------------|
| `--policy` / `--policy-arns` | Narrows the permission ceiling of this session | Safely reuse one broad role for several purposes |
| `--external-id` | Matched against the `sts:ExternalId` condition in the trust policy | Blocks the confused deputy in third-party delegation |
| `--tags` | Applies session tags → `aws:PrincipalTag/*` | The path for injecting attributes in ABAC |
| `--transitive-tag-keys` | Keeps tags even through role chaining | Prevents attributes from disappearing across multi-hop transitions |
| `--source-identity` | Records the original identity (`aws:SourceIdentity`) | Tracks the **very first person** even as roles are switched |
| `--serial-number` / `--token-code` | Presents MFA | Makes `aws:MultiFactorAuthPresent` true |

What differs between `--source-identity` and the session name (`RoleSessionName`) is **tamperability**. The session name can be freely specified by the AssumeRole caller each time, so it is weak as evidence of "who did that." By contrast, once `sts:SourceIdentity` is set, it **follows along unchanged through the entire subsequent role chain**, and you can enforce in the trust policy that the `sts:SetSourceIdentity` permission be required. In an environment where roles are hopped across many accounts, to avoid losing "who was the original person in the end," you must rely on this key rather than the session name.

When you do **role chaining** — using temporary credentials obtained with role A to AssumeRole into role B again — **the maximum session duration is cut to 1 hour.** Even if you have raised the role's `MaxSessionDuration` to 12 hours, it does not apply on the chaining path. This is the classic cause of the symptom "a long-running batch job dies exactly every hour," and the fix is to add credential-refresh logic or to eliminate the chaining.

## The Order for Diagnosing AccessDenied

Many questions ultimately ask "why was it blocked?" It is the same in practice, so you must get a **fixed procedure** for narrowing down the layers into your hands. Rather than blindly widening policies, first pinpoint which layer is the culprit.

```
[ AccessDenied diagnosis order — rule things out from the top ]

① Read the original error message first
   "with an explicit deny in a service control policy"   → SCP confirmed
   "with an explicit deny in an identity-based policy"   → IAM policy Deny
   "with an explicit deny in a resource-based policy"    → bucket/key policy Deny
   "with an explicit deny in a permissions boundary"     → permissions boundary
   "with an explicit deny in a VPC endpoint policy"      → endpoint policy
   No "explicit" in the message  → implicit deny (nobody Allowed it)
        │
        ▼
② Find that event in CloudTrail
   errorCode / errorMessage / userIdentity.arn / sourceIPAddress
   awsRegion / requestParameters / resources
        │
        ▼
③ Pin down the principal identity exactly
   aws sts get-caller-identity
   ← Here "it wasn't the role I thought it was" often comes to light
        │
        ▼
④ Verify the IAM and Boundary layers with the policy simulator
   aws iam simulate-principal-policy ...
        │
        ▼
⑤ Simulator says Allow but it is still blocked → suspect SCP · resource policy · VPCE policy
   (the simulator does not evaluate SCPs)
        │
        ▼
⑥ If cross-account, check both sides separately
   Caller account IAM  /  resource account resource policy
```

The simulator only evaluates policies without actually executing them, so it is a diagnostic tool that can safely be run even in production.

```bash
# Compute whether a specific role can read a specific object (no actual call is made)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/DevRole \
  --action-names s3:GetObject s3:PutObject \
  --resource-arns arn:aws:s3:::prod-logs/2026/07/app.log \
  --context-entries \
      ContextKeyName=aws:PrincipalTag/Team,ContextKeyType=string,ContextKeyValues=payments \
      ContextKeyName=aws:SecureTransport,ContextKeyType=boolean,ContextKeyValues=true

# Simulate with a permissions boundary layered on (to check whether the boundary is the culprit)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/DevRole \
  --action-names iam:CreateRole \
  --resource-arns "*" \
  --permissions-boundary-policy-input-list file://dev-boundary.json

# Validate a draft policy that has not been deployed yet
aws iam simulate-custom-policy \
  --policy-input-list file://draft-policy.json \
  --action-names s3:DeleteObject \
  --resource-arns "arn:aws:s3:::prod-logs/*"
```

The `EvalDecision` value in the response is the key to the diagnosis.

| `EvalDecision` | Meaning | Next action |
|----------------|------|-----------|
| `allowed` | Passes at the IAM layer | If it is still blocked, look at SCPs, resource policies, and VPCE policies |
| `explicitDeny` | Some Statement explicitly Denies | Pinpoint the culprit statement in `MatchedStatements` |
| `implicitDeny` | Nobody Allows it | There is no permission at all — a policy must be added |

**The IAM policy simulator does not evaluate SCPs.** That is why the situation "the simulator says allowed but it is actually AccessDenied" is common in organization environments. In that case the right answer is not to widen the IAM policy further but to **check the SCP**. Likewise, the simulator cannot fully reflect every nuance of resource-based policies or VPC endpoint policies, so you must not trust "simulator = final verdict." Use the simulator as *a tool for ruling out the IAM and boundary layers*.

Also know the tools that block **before you write** a policy. IAM Access Analyzer validates policy syntax and excessive permissions, finds resources that can be accessed externally, and tells you which permissions are not actually used.

```bash
# Validate policy syntax and security warnings (good to put in CI as a pre-deployment gate)
aws accessanalyzer validate-policy \
  --policy-document file://new-policy.json \
  --policy-type IDENTITY_POLICY

# A comparison check: "does the new policy widen permissions beyond the existing one?"
aws accessanalyzer check-no-new-access \
  --existing-policy-document file://current.json \
  --new-policy-document file://proposed.json \
  --policy-type IDENTITY_POLICY

# A check: "does this policy not grant access to forbidden actions?"
aws accessanalyzer check-access-not-granted \
  --policy-document file://new-policy.json \
  --access actions=s3:DeleteBucket,iam:CreateAccessKey \
  --policy-type IDENTITY_POLICY
```

This flow is an approach called **shift-left** in security engineering. Statically analyzing the policy document before deployment and blocking it is far cheaper than deploying a wrong policy and then detecting it with CloudTrail. `check-no-new-access` is especially powerful because it is a **delta check** asking "does this change widen permissions?" Although it is hard to prove absolute safety, the invariant "at least it did not get worse" can be enforced automatically. On the exam, when "we want to prevent a policy change from unintentionally expanding permissions before deployment" appears, Access Analyzer's custom policy check is the right direction.

## Conditions Change the Evaluation

The `Condition` block of each Statement is the final filter of evaluation. If the condition is false, that Statement is ignored (whether Allow or Deny).

```json
{
  "Effect": "Deny",
  "Action": "s3:*",
  "Resource": "*",
  "Condition": {
    "Bool": { "aws:MultiFactorAuthPresent": "false" }
  }
}
```

This Deny operates "only when there is no MFA." For a session authenticated with MFA, the condition is false so the Deny is ignored, and for a session without MFA the Deny fires. This kind of conditional Deny is used as a powerful guardrail in SCPs and Identity policies.

`aws:MultiFactorAuthPresent` **may not exist in temporary credentials obtained via AssumeRole.** When called with an EC2 instance profile or a service role, the key itself is absent, so a `Bool` comparison may behave differently from what you intended. That is why a precise policy uses `BoolIfExists` to "check only when the key exists."

### Criteria for Choosing an Operator

If you choose the wrong condition operator, the policy behaves the exact opposite of what you intended. Here are only the distinctions that come up repeatedly on the exam.

| Operator | What it does | Representative trap |
|--------|---------|-----------|
| `StringEquals` | Case-sensitive **exact match** | If even one value differs, the Statement is ignored |
| `StringLike` | Allows `*` and `?` wildcards | The scope easily becomes broader than intended |
| `StringNotEquals` | True when not matching | **Safe only when combined with Deny** (see the trap below) |
| `ArnLike` / `ArnNotLike` | A comparison that understands ARN structure | The mistake of carelessly putting `*` in the account or Region position |
| `...IfExists` | Compares **only if the key exists**, passes if absent | Because it passes when absent, using it on a Deny can open a hole |
| `Null` | Checks the **existence** of the key itself | The only means of enforcing "the key must be present" |
| `ForAllValues:` | True if **all** values in the request are in the list | Becomes true when there are no values at all |
| `ForAnyValue:` | True if **at least one** request value is in the list | Using it as a whitelist leaves it breachable |
| `Bool` | true/false | Diverges from intent when the key is absent → `BoolIfExists` |

Using `ForAllValues:` as a whitelist is a frequently seen mistake. This operator checks "are all the values that came in with the request within the allowed list," but **if the request has no such key at all, it is judged "all values satisfied" and becomes true.** That is, if you make a request with no tags at all, the condition passes. To enforce even "tags must be present," you have to separately require the key's existence with the `Null` operator, or pin the required tags directly with `StringEquals`. Conversely, `ForAnyValue:` is "passes if any one matches," so it suits the prohibition-list (Deny) side.

Because the `Null` operator asks not "what the value is" but "whether the key exists," it creates controls that cannot be expressed with other operators.

```json
{
  "Sid": "DenyResourceCreationWithoutOwnerTag",
  "Effect": "Deny",
  "Action": ["ec2:RunInstances", "rds:CreateDBInstance"],
  "Resource": "*",
  "Condition": {
    "Null": { "aws:RequestTag/Owner": "true" }
  }
}
```

`"aws:RequestTag/Owner": "true"` means "true if this key is **absent**," so the whole statement becomes "deny creating a resource without an Owner tag." It is a typical pattern for enforcing cost attribution and owner tracking at the organization level.

When combining a condition with Deny, you must be especially careful about direction. The following two statements look similar on the surface but are completely different.

```json
// ⓐ "Deny if there is no MFA" — works as intended
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" } }
}
```

```json
// ⓑ "Allow only when MFA is present" — powerless if another Allow exists
{
  "Effect": "Allow",
  "Action": "*",
  "Resource": "*",
  "Condition": { "Bool": { "aws:MultiFactorAuthPresent": "true" } }
}
```

ⓐ cuts off sessions without MFA **no matter what any other policy Allows**. ⓑ merely says "this statement allows only when MFA is present," so if there is even one Allow elsewhere without an MFA condition, the request passes through that one. **A guardrail is always written as a Deny** — this carries straight into the SCP design principle on day 3.

Combining `StringNotEquals` **with Allow** almost always behaves differently from what you intended. If you use `Allow` + `StringNotEquals` with the thought "don't allow anything that isn't our organization," that statement merely doesn't allow — it *doesn't prohibit*. If another Allow exists, the request passes as is. A negative condition has to be written in the form `Deny` + `StringNotEquals` ("deny if not on the allow list") for the control to hold. The Region-restriction SCP we will see on day 3 is exactly this form.

> 🎯 **Scenario**: "For an S3 bucket, (1) prohibit unencrypted HTTP requests, (2) prohibit access by principals outside our organization, and (3) prohibit uploads without KMS encryption." → Since all three requirements are **prohibitions**, write three Deny statements in the bucket policy. Deny when `aws:SecureTransport` is `false`, Deny when `aws:PrincipalOrgID` differs from our organization, Deny when `s3:x-amz-server-side-encryption` is not the required value. If you try to express it with Allow, the hole "it is breached if another Allow exists" remains. When the requirement sentence is "make it so that ~ cannot be done," the answer is always on the Deny side.

## Summary

IAM evaluation logic is not something to memorize; **you must be able to draw the flowchart by hand.** When "will this request be allowed?" appears in the exam room, run it through six slots in your head in the order (1) search for explicit deny → (2) SCP → (3) resource → (4) identity → (5) boundary → (6) session. If even one blocks, it is Deny. And that guardrails do not grant permissions but only cut them down, that cross-account is an AND of both sides, and that for KMS the key policy must explicitly delegate — these three are the heart of day 1.

The Capital One breach disclosed in 2019 is an incident that shows why IAM evaluation logic is central in practice. The attacker accessed the EC2 instance metadata via SSRF through a misconfigured WAF (reverse proxy), obtained the temporary credentials of that instance's role, listed S3 buckets with those credentials, and then downloaded the data. Information on roughly 106 million U.S. and Canadian credit card applicants was affected. What was breached in this incident was neither encryption nor the network firewall. It was a single fact: **that role had the permission to read that bucket in the first place.** The layers we learned today aim exactly at this gap — lower the instance role's ceiling with a permissions boundary, narrow the path by placing `aws:PrincipalOrgID` and `aws:SourceVpce` conditions on the bucket policy, set an account-level ceiling with an SCP, and detect a spike in `ListBucket` with CloudTrail. On the exam, the answer to a question like "to reduce the damage after credentials are stolen" is always *narrowing the scope of what the stolen credentials can do*, not *preventing the theft*.

A far more common accident in practice is not a breach but **self-inflicted harm**. Accidents such as deploying a Region-restriction SCP without putting IAM and STS in a `NotAction` exception so that the entire organization can't even log in to the console, or attaching a permissions boundary without exempting the CI/CD deployment role so that every pipeline stops, are experienced once by every organization. The two accidents share the same cause — **not having calculated "what does this change block" before deploying the policy.** So the diagnostic procedure we learned today is not a post-incident tool but a pre-deployment tool. Run a few representative principals in advance with `simulate-principal-policy`, gate on whether permissions expand with `check-no-new-access`, and attach an SCP to a narrow OU first, observe, and then move it up.

### One-Line Summary

IAM evaluation is the **intersection** of six layers (SCP/RCP · resource policy · Identity · permissions boundary · session policy · condition), and a single explicit Deny at any layer ends it globally. Guardrail layers cannot create permissions and only cut them, so even `AdministratorAccess` cannot exceed the ceiling. Within the same account it is enough for either the Identity or the resource policy to Allow, but **cross-account requires Allow on both sides**, and KMS cannot be used with IAM alone unless the key policy explicitly delegates to IAM. SCPs do not apply to the management account or to service-linked roles, and they do apply to member-account root. A condition is treated as a mismatch when its key is absent, so you must know the difference between `...IfExists` and `Null`, and a prohibition requirement must be expressed as `Deny` so that another Allow cannot breach it. When blocked, narrow the layers in the order error message → CloudTrail → `get-caller-identity` → `simulate-principal-policy`, while remembering the limitation that **the simulator does not evaluate SCPs**.

In the next article we go deep into the **Permission Boundary**, one axis of this evaluation logic. It is a practical pattern for delegating IAM permissions to developers while preventing them from creating roles that exceed their own permissions.

---

## 📝 Practice Questions

**Question 1.** A user has the `AdministratorAccess` Identity policy attached. However, when this user tries to read an object in a specific S3 bucket, `AccessDenied` occurs. CloudTrail shows no record of an SCP block. What is the most likely cause?

A) The IAM policy lost out in priority  
B) The bucket policy has an explicit Deny targeting that principal  
C) S3 does not support Identity policies  
D) AdministratorAccess does not include S3  

**Answer: B**  
Explanation: An explicit Deny beats every Allow. If it is not an SCP block, an explicit deny in the bucket policy, which is a resource-based policy, is the most likely cause. The policy did not lose out in priority; the Deny made the final decision immediately at evaluation step 1. S3 supports Identity policies, and AdministratorAccess (`*:*`) includes S3, so the other choices are wrong.

---

**Question 2.** There is a role whose Permission Boundary allows only `s3:*`. The role's Identity policy Allows `ec2:RunInstances` and `s3:GetObject`. Which actions can this role actually perform?

A) Both `ec2:RunInstances` and `s3:GetObject`  
B) Only `s3:GetObject`  
C) Only `ec2:RunInstances`  
D) Nothing  

**Answer: B**  
Explanation: The effective permissions are the intersection of the Permission Boundary and the Identity policy. Because the Boundary allows only `s3:*`, `ec2:RunInstances` exceeds the upper limit and is denied, and only `s3:GetObject`, which both allow, passes. This question tests the key principle that a Boundary does not grant permissions but only sets an upper limit.

---

**Question 3.** An IAM user in Account A must upload objects to an S3 bucket in Account B. What is absolutely required for this to work?

A) Only an `s3:PutObject` Allow in Account A's IAM policy is needed  
B) Only an Allow in Account B's bucket policy permitting Account A is needed  
C) Both Account A's IAM policy and Account B's bucket policy must Allow  
D) It is enough to put both accounts in the same Organizations  

**Answer: C**  
Explanation: Cross-account access is an AND relationship in which both the caller account's Identity policy and the resource account's Resource policy must Allow. Either one alone does not pass. Belonging to the same Organizations does not create permissions by itself, and an SCP only further restricts the upper limit.

---

**Question 4.** A security engineer applied `Deny ec2:*` to an OU with an SCP. However, an administrator in one account of that OU granted `Allow ec2:*` with an IAM policy. Can a user in this account launch EC2 instances?

A) Yes, because the IAM policy is more specific than the SCP  
B) Yes, because account administrator permissions ignore the SCP  
C) No, because the explicit Deny in the SCP beats the IAM Allow  
D) It depends on the conditions  

**Answer: C**  
Explanation: An explicit Deny in an SCP makes the final decision immediately at evaluation step 1. No matter how specific or administrator-level the IAM policy is, it cannot break through an explicit Deny. The guardrail takes precedence over any Allow inside the account, which is why SCPs are used as an organization-level control.

---

**Question 5.** A Statement in an IAM policy has `"Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "true" } }` attached. What is the most appropriate reason for using `BoolIfExists` instead of `Bool`?

A) To prevent unintended results for calls where the MFA key does not exist (for example, service roles)  
B) Because `BoolIfExists` is evaluated faster  
C) Because `Bool` works only in SCPs  
D) To enforce MFA more strongly  

**Answer: A**  
Explanation: Temporary credentials obtained through AssumeRole or service role calls may not have the `aws:MultiFactorAuthPresent` key at all. In that case `Bool` treats the missing key differently and the policy may diverge from the intent, so `BoolIfExists` makes it "compare only when the key exists" and handles it safely. It has nothing to do with performance or being SCP-only.
