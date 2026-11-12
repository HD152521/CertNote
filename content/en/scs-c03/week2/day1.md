# Day 1 - Master IAM Policy Evaluation Logic: Explicit Deny Beats Everything

If you had to pick one topic that test-takers most frequently get wrong on the SCS-C03 exam, it would be **IAM policy evaluation logic**. The question "Will this request be allowed or denied?" is scattered throughout the exam domains, with all four answer choices appearing plausible and only one correct answer. The reason is that IAM is not a simple ON/OFF switch, but rather a **multi-layered decision engine where six types of policies are evaluated simultaneously**.

At the Associate level, the simple model of "if IAM policy allows, access is granted" was sufficient. However, at the Specialty level, you must be able to track authorization in an environment where SCP, Permission Boundary, Session Policy, Resource-based Policy, and VPC Endpoint Policy all operate together, understanding "why access was blocked even though permissions were granted?" Today, we'll internalize the **evaluation flow** explicitly specified in AWS official documentation, word for word.

## Three Core Principles of IAM Evaluation

All evaluation operates on these three principles. Understanding just these three will get you through half the exam.

1. **The default is Implicit Deny** — Any request not explicitly allowed is denied.
2. **Explicit Deny always wins** — No matter which policy allows something, if even one policy denies it, the final result is Deny.
3. **Multiple policy types operate as an AND relationship (intersection)** — If SCP, Boundary, and Identity policies are all attached, **all must simultaneously Allow** for access to be granted. If even one is missing, access is blocked.

> 💡 **Related Theory**: This model is called **default-deny** in security engineering, implementing a whitelist approach to access control, which is far safer than blacklist (default-allow). Blacklist fails because "if not in forbidden list, allow" creates a new attack surface each time threats emerge. Whitelist succeeds because "if not in allowed list, deny" automatically blocks unknown behaviors. IAM is strictly default-deny, which is why "access worked even though I didn't grant it" situations almost never occur.

## Six Types of Policies and Evaluation Order

When a request arrives, IAM gathers and evaluates all of the following policies:

| Policy Type | Attached To | Role | Can Grant Permission? |
|-----------|-----------|------|-----------------|
| Identity-based | User/Group/Role | What can this principal do | Yes |
| Resource-based | S3 bucket, KMS key, etc. | Who can access this resource | Yes |
| Permission Boundary | User/Role | Principal's permission ceiling | No (ceiling only) |
| SCP | OU/Account | Account's maximum permission guardrail | No (ceiling only) |
| Session Policy | Passed during AssumeRole | Per-session permission reduction | No (ceiling only) |
| RCP (Resource Control Policy) | OU/Account | Organization-level resource access guardrail | No (ceiling only) |

The evaluation order follows this sequence, exactly as shown in AWS's official flowchart:

```
Request arrives
  │
  ▼
1. Is there an Explicit Deny anywhere?
     YES → ❌ DENY (terminate immediately, ignore all other evaluations)
     NO  ↓
2. Does SCP allow this action? (when account is Organizations member)
     NO  → ❌ DENY
     YES ↓
3. Does Resource-based policy explicitly allow it?
     YES → ✅ ALLOW (passes in some cases even without Identity policy)
     NO  ↓
4. Does Identity-based policy allow it?
     NO  → ❌ DENY
     YES ↓
5. Does Permission Boundary allow it? (if configured)
     NO  → ❌ DENY
     YES ↓
6. Does Session Policy allow it? (if in AssumeRole session)
     NO  → ❌ DENY
     YES → ✅ ALLOW
```

The key point is that **step 1 is first and always takes precedence**. Even if SCP allows and Identity policy allows, a single line `"Effect": "Deny"` in the Resource Policy means it's over.

> ⚠️ **Common Trap**: The most frequent exam trap is "why can't this user read S3 objects when the admin gave them `AdministratorAccess`?" The answer is almost always one of: **explicit deny in bucket policy**, **SCP block**, or **KMS key policy not granting access**. AdministratorAccess is just an Identity policy; it doesn't pierce through the other five layers.

## Visualizing the Intersection: Permissions Only Get Cut, Never Expanded

Guardrail policies (SCP, Boundary, Session, RCP) do not **grant permissions**. They only set a ceiling. The actual effective permissions are the **intersection of all layers**.

```
Effective permissions = SCP-allowed ∩ Boundary-allowed ∩ Identity-allowed ∩ Session-allowed
                       (except any action where Explicit Deny exists anywhere)
```

For example, consider this scenario:

```json
// SCP: Allow s3:* and ec2:*
{ "Effect": "Allow", "Action": ["s3:*", "ec2:*"], "Resource": "*" }

// Permission Boundary: Allow only s3:*
{ "Effect": "Allow", "Action": "s3:*", "Resource": "*" }

// Identity Policy: Allow s3:GetObject and ec2:RunInstances
{ "Effect": "Allow", "Action": ["s3:GetObject", "ec2:RunInstances"], "Resource": "*" }
```

What can this user actually do? Compute the intersection of all three layers:

- `s3:GetObject` → SCP(✓) ∩ Boundary(✓) ∩ Identity(✓) = **Allowed**
- `ec2:RunInstances` → SCP(✓) ∩ Boundary(✗, ec2 not in Boundary) ∩ Identity(✓) = **Denied**

Even though the Identity policy explicitly allows `ec2:RunInstances`, the Permission Boundary doesn't include ec2, so it's excluded from the intersection. **"Can't exceed the ceiling"** is what this means.

> 💡 **Related Theory**: This is a structural enforcement of **Principle of Least Privilege (PoLP)** in security. First formulated by Jerome Saltzer and Michael Schroeder in their 1975 paper "The Protection of Information in Computer Systems," this is one of eight core security design principles. With multiple guardrail layers, even if one policy accidentally grants too much, another layer enforces the ceiling. This is called **defense in depth**.

## Resource-based Policy's Peculiarity: Cross-Account Evaluation

Within the same account, either an Identity policy **or** a Resource policy alone is sufficient to allow access (they operate like a union). However, **across accounts**, it's different.

```
For cross-account access:
  - Caller account's Identity policy: Allow required (AND)
  - Resource account's Resource policy: Allow required (AND)
  → Both must Allow to pass
```

In other words, for a user in Account A to access an S3 bucket in Account B, both A's IAM policy must permit the bucket **and simultaneously** B's bucket policy must permit A. One alone is insufficient.

> 🔍 **Deeper Insight**: This asymmetry makes KMS particularly tricky. Unlike IAM policies, a KMS key policy must **explicitly delegate to IAM for IAM policy alone to work with the key**. The single line in the default key policy `"Principal": {"AWS": "arn:aws:iam::ACCOUNT:root"}` means "delegate authorization judgment to this account's IAM policies." Without this line, even AdministratorAccess won't let you use the KMS key. This is a frequent exam trap.

## Conditions Change Evaluation

The `Condition` block in each Statement is the final filter on evaluation. If the condition is false, that Statement is ignored (Allow or Deny).

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

This Deny operates only "when MFA is absent." If the session is authenticated with MFA, the condition becomes false and Deny is ignored; if the session lacks MFA, Deny activates. This conditional Deny is a powerful guardrail in SCP or Identity policies.

> ⚠️ **Common Trap**: `aws:MultiFactorAuthPresent` **may not exist in temporary credentials obtained via AssumeRole**. When called via EC2 instance profile or service role, this key might not exist at all, causing `Bool` comparison to behave unexpectedly. That's why precise policies use `BoolIfExists` to mean "check only if key exists."

## Summary

IAM evaluation logic is not meant to be memorized—you must be able to **draw the flowchart by hand**. When "will this request be allowed?" appears on the exam, mentally walk through six gates: (1) search for explicit deny → (2) SCP → (3) resource → (4) identity → (5) boundary → (6) session. If even one blocks, it's Deny. And remember these three critical points: guardrails give no permissions and only set ceilings, cross-account is an AND between both sides, and KMS requires the key policy to explicitly delegate to IAM.

Next article will explore **Permission Boundary** in depth, a practical pattern for delegating IAM permissions to developers while preventing them from creating roles that exceed their authority.

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
