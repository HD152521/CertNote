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

## 📝 연습 문제

**문제 1.** 한 사용자에게 `AdministratorAccess` Identity 정책이 부착되어 있다. 그런데 이 사용자가 특정 S3 버킷의 객체를 읽으려 하자 `AccessDenied`가 발생한다. CloudTrail에는 SCP 차단 기록이 없다. 가장 가능성 높은 원인은?

A) IAM 정책이 우선순위에서 밀렸기 때문  
B) 버킷 정책에 해당 주체를 대상으로 한 명시적 Deny가 있기 때문  
C) S3는 Identity 정책을 지원하지 않기 때문  
D) AdministratorAccess는 S3를 포함하지 않기 때문  

**정답: B**  
해설: 명시적 Deny는 모든 Allow를 이긴다. SCP 차단이 아니라면, 리소스 기반 정책인 버킷 정책의 explicit deny가 가장 유력하다. 우선순위가 밀린 게 아니라 평가 1단계에서 Deny가 즉시 최종 결정을 내린 것이다. S3는 Identity 정책을 지원하며, AdministratorAccess(`*:*`)는 S3를 포함하므로 나머지 보기는 틀리다.

---

**문제 2.** Permission Boundary가 `s3:*`만 허용하도록 설정된 롤이 있다. 이 롤의 Identity 정책은 `ec2:RunInstances`와 `s3:GetObject`를 Allow한다. 이 롤이 실제로 수행할 수 있는 액션은?

A) `ec2:RunInstances`와 `s3:GetObject` 모두  
B) `s3:GetObject`만  
C) `ec2:RunInstances`만  
D) 아무것도 못 함  

**정답: B**  
해설: 유효 권한은 Permission Boundary와 Identity 정책의 교집합이다. Boundary가 `s3:*`만 허용하므로 `ec2:RunInstances`는 상한을 넘어 거부되고, `s3:GetObject`만 양쪽이 모두 허용하여 통과한다. Boundary는 권한을 부여하지 않고 상한만 정한다는 핵심 원리를 묻는 문제다.

---

**문제 3.** 계정 A의 IAM 사용자가 계정 B의 S3 버킷에 객체를 업로드해야 한다. 동작하게 하려면 무엇이 반드시 필요한가?

A) 계정 A의 IAM 정책에 `s3:PutObject` Allow만 있으면 된다  
B) 계정 B의 버킷 정책에 계정 A를 허용하는 Allow만 있으면 된다  
C) 계정 A의 IAM 정책과 계정 B의 버킷 정책이 모두 Allow해야 한다  
D) 두 계정을 같은 Organizations에 두기만 하면 된다  

**정답: C**  
해설: 크로스 계정 접근은 호출자 계정의 Identity 정책과 리소스 계정의 Resource 정책이 모두 Allow해야 하는 AND 관계다. 한쪽만으로는 통과하지 못한다. 같은 Organizations 소속이라는 사실만으로 권한이 생기지는 않으며, SCP는 오히려 상한을 더 제한할 뿐이다.

---

**문제 4.** 한 보안 엔지니어가 SCP로 `Deny ec2:*`를 OU에 적용했다. 그런데 해당 OU의 한 계정에서 관리자가 IAM 정책으로 `Allow ec2:*`를 부여했다. 이 계정의 사용자는 EC2 인스턴스를 시작할 수 있는가?

A) 가능하다, IAM 정책이 SCP보다 구체적이므로  
B) 가능하다, 계정 관리자 권한이 SCP를 무시하므로  
C) 불가능하다, SCP의 명시적 Deny가 IAM Allow를 이기므로  
D) 조건에 따라 다르다  

**정답: C**  
해설: SCP의 명시적 Deny는 평가 1단계에서 즉시 최종 결정을 내린다. IAM 정책이 아무리 구체적이거나 관리자급이어도, 명시적 Deny를 뚫을 수 없다. 가드레일은 계정 내부의 어떤 Allow보다 우선하며, 이것이 SCP를 조직 차원 통제 수단으로 쓰는 이유다.

---

**문제 5.** 어떤 IAM 정책의 Statement에 `"Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "true" } }`가 붙어 있다. `Bool` 대신 `BoolIfExists`를 쓴 이유로 가장 적절한 것은?

A) MFA 키가 존재하지 않는 호출(예: 서비스 롤)에서 의도치 않은 결과를 막기 위해  
B) `BoolIfExists`가 더 빠르게 평가되기 때문  
C) `Bool`은 SCP에서만 동작하기 때문  
D) MFA를 더 강하게 강제하기 위해  

**정답: A**  
해설: AssumeRole로 얻은 임시 자격증명이나 서비스 롤 호출에는 `aws:MultiFactorAuthPresent` 키가 아예 없을 수 있다. 이때 `Bool`은 키 부재를 다르게 처리해 정책이 의도와 어긋날 수 있으므로, `BoolIfExists`로 "키가 존재할 때만 비교"하게 만들어 안전하게 처리한다. 성능이나 SCP 전용 여부와는 무관하다.
