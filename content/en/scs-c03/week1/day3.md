# Day 3 - Advanced IAM Policies: Identity vs Resource, Condition Keys, and Least-Privilege Design

Yesterday you learned the policy evaluation algorithm. Today we handle the policies themselves that feed into that algorithm. The real differentiator SCS-C03 tests in IAM isn't "can you write policies" but **"among multiple controls producing the same outcome, can you pick the most precise and least-privileged one?"** If you solve with Resource policy what should be Identity policy, it works but becomes a trap answer. If you split with separate roles what one Condition key could do, it's over-engineered.

Today we dive into three things. First, when Identity and Resource policies split and how to choose. Second, using Condition keys for precise control — IP, MFA, encryption, tag-based. Third, designing least privilege **scalably** with Permissions Boundary and ABAC.

## Identity-based vs Resource-based: Decision Criteria

| Aspect | Identity-based | Resource-based |
|------|---------------|----------------|
| Attached to | User/Group/Role | Resources (S3, KMS, SQS, SNS, Lambda, etc.) |
| Principal element | None | **Required** |
| Main use | "What can this principal do" | "Who can access this resource" |
| cross-account | Can't work alone (needs counterpart resource policy) | **Can work alone, allowing other accounts** |
| Typical examples | Managed/inline policies | S3 bucket policy, KMS key policy, IAM Role trust policy |

Selection is clear:

- **"Grant permission to a principal within the same account"** → Identity policy
- **"Allow different account/service access to my resource"** → Resource policy (core tool for cross-account)
- **"Enforce rules uniformly on a resource regardless of who accesses"** (e.g., force encryption on all PutObject) → Resource policy

> 💡 **Related Theory**: KMS key policy is special. **Every KMS key's policy is first authority (authoritative)** — if the key policy doesn't permit IAM delegation (allowing `"Principal": {"AWS": "arn:aws:iam::ACCOUNT:root"}`), then IAM policy alone won't work. S3 and SQS work with either identity or resource policy alone, but KMS requires the key policy to open the gate first before IAM policy functions. That's why cross-account KMS use mandates explicitly stating the other account in the key policy.

> 🔍 **Deep Dive**: An IAM Role's **trust policy is also a resource-based policy**. It's a Principal-including policy on the Role resource defining "who can assume this role (`sts:AssumeRole`)." That's why cross-account AssumeRole requires ① target account's Role trust policy (Principal naming calling account) ② calling side's identity policy with `sts:AssumeRole` Allow — both (covered in depth Day 4).

## Condition Keys: The Core of Precision Control

Condition is a clause that adds "additional constraints" to policies. Security engineers use these most-common keys, organized by type:

| Condition Key | Meaning | Typical Use |
|-------------|------|----------|
| `aws:SourceIp` | Request source IP | Allow only from corporate IP |
| `aws:MultiFactorAuthPresent` | MFA authentication presence | Force MFA for sensitive actions |
| `aws:SecureTransport` | HTTPS or not | Reject plaintext HTTP |
| `aws:RequestedRegion` | Target region | Block work outside certain regions |
| `aws:PrincipalTag` / `aws:ResourceTag` | Principal·resource tags | ABAC (attribute-based access control) |
| `aws:SourceArn` / `aws:SourceAccount` | Calling service source | **Prevent Confused Deputy** |
| `s3:x-amz-server-side-encryption` | Upload encryption header | Block unencrypted uploads |
| `kms:ViaService` | KMS call via service | Allow key use only through specific service |

### Example 1: Force-Block Unencrypted S3 Uploads

```json
{
  "Sid": "DenyUnencryptedUploads",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::secure-bucket/*",
  "Condition": {
    "StringNotEquals": {
      "s3:x-amz-server-side-encryption": "aws:kms"
    }
  }
}
```

This bucket policy denies all uploads without a KMS encryption header. Classic data protection (Domain 5) and governance enforcement.

### Example 2: No Sensitive Actions Without MFA

```json
{
  "Sid": "DenySensitiveWithoutMFA",
  "Effect": "Deny",
  "Action": ["iam:*", "kms:ScheduleKeyDeletion", "ec2:TerminateInstances"],
  "Resource": "*",
  "Condition": {
    "BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}
  }
}
```

> ⚠️ **Trap**: The difference between `Bool` and `BoolIfExists` is exam standard. Some requests (service-to-service calls, STS sessions) don't have the `aws:MultiFactorAuthPresent` key at all. Using `Bool` to check `"false"` blocks even normal requests missing the key. `BoolIfExists` means "if key exists, check if false; if missing, pass" — works as intended. Also, `aws:SourceIp` **doesn't apply to traffic via VPC endpoints** — use `aws:VpcSourceIp` or `aws:SourceVpc` there.

> 🔍 **Deep Dive**: `aws:SourceArn` and `aws:SourceAccount` are core to preventing **Confused Deputy (confused intermediary)** attacks. For example, when S3 sends events to SNS, if the SNS topic policy doesn't use `aws:SourceArn` to specify "only this bucket," another person's bucket could be tricked into triggering your topic. Service principals (`Service` principal) should almost always pair with `aws:SourceArn`/`aws:SourceAccount` conditions (re-emerges Day 4 in STS context).

## Permissions Boundary: Safe Limits for Delegation

Permissions Boundary defines "the **maximum permission upper limit** this principal can have." Identity policy grants permissions; boundary caps that limit. **Effective permission = identity-based policy ∩ Permissions Boundary** (intersection).

Most powerful use: **safely restricting permission delegation**. Give a developer "can create IAM roles" but prevent their created roles from becoming admin.

```json
// Attach to developer: allow role creation but force boundary attachment
{
  "Effect": "Allow",
  "Action": "iam:CreateRole",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary": "arn:aws:iam::ACCOUNT:policy/DevBoundary"
    }
  }
}
```

Now the developer can create roles but only with `DevBoundary` attached. That role's effective permissions can't exceed boundary — structurally blocking privilege escalation.

> 💡 **Related Theory**: The evaluation relationship of four policy types in one picture — **SCP(org upper limit) ∩ Permissions Boundary(principal upper limit) ∩ Identity policy(grant) → and explicit Deny takes priority anywhere**. SCP and Boundary are "cutting" filters, not "granting" steps. Session policy (passed on AssumeRole) works the same intersection filter.

## ABAC: Scalable Least Privilege with Tags

RBAC (role-based) creates policy explosion as roles grow. ABAC (Attribute-Based Access Control) uses **tags** to express permissions, keeping policy count constant.

```json
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

This single policy expresses "allow when principal's `Project` tag matches resource's `Project` tag." 100 projects → 1 policy. New team appears? No policy changes, just grant tags.

> 🎯 **Scenario**: "Dozens of teams operate EC2 separately; policy additions for each new team is hitting limits." Answer isn't multiplying team roles and policies — it's **ABAC migration**. Tag principals with `team`, resources with `team`, unify with `aws:PrincipalTag/team == aws:ResourceTag/team`. Identity Center session tags and SAML/OIDC attributes map to PrincipalTag, applying uniformly to federated users.

## Tools That "Discover" Least Privilege

Least privilege isn't intuitive; it's **derived from real usage data**.

```bash
# Access Analyzer: Generate policies from actual CloudTrail log usage
aws accessanalyzer start-policy-generation \
  --policy-generation-details '{"principalArn":"arn:aws:iam::111122223333:role/AppRole"}' \
  --cloud-trail-details '{...}'

# Find unused permissions by last-accessed timestamp
aws iam get-service-last-accessed-details \
  --job-id <job-id>
```

IAM Access Analyzer's policy generation creates policies from only actual recorded calls in CloudTrail. Access Advisor (service-last-accessed) shows "permissions never used in last N months" to justify narrowing over-broad access.

> 📚 **Case Study**: Many organizations start with policies near `*:*`, only narrowing after incidents. Best practice is the opposite: **"progressive narrowing — add permissions only when denials occur."** Use Access Analyzer-generated policies as a starting point and monitor CloudTrail's `AccessDenied`. "Broad first, then narrow" creates security debt; "narrow first, then expand" doesn't.

## Policy Conflict and Priority Synthesis

Checklist to quickly judge multi-policy tangles:

1. Any **explicit Deny** anywhere? → Yes, done — Deny.
2. **SCP** allows the Action? → No — Deny.
3. **Permissions Boundary** allows? → No — Deny.
4. (cross-account?) **Both** accounts allow? → Either missing — Deny.
5. Any **explicit Allow**? → No — implicit Deny.
6. All pass → Allow.

> 💡 **Related Theory**: In this order, steps 2-4 (SCP, Boundary, cross-account both) are all "**filters that cut upper limits**," while step 5 (Identity/Resource Allow) is the "permissions granting" step. Clarifying this distinction lets you quickly pin "permissions exist but denied" as hitting one of those filters (2-4) rather than missing Allow.

## Summary — Precision Equals Security

Three essentials today. First, **Identity policy handles "what principal can do"; Resource policy handles "who accesses this resource"** — cross-account and KMS key policies are Resource policy territory. Second, **Condition keys** provide precise control via IP, MFA, encryption, tags, but watch for `BoolIfExists` traps and `aws:SourceArn` Confused Deputy prevention. Third, **Permissions Boundary and ABAC** make least privilege "scalable," and least privilege emerges from Access Analyzer and Access Advisor data, not intuition.

Tomorrow we shift to STS and temporary credentials. How AssumeRole exactly works, what federation is, role chaining, and how to block Confused Deputy with `ExternalId` and `aws:SourceArn`. Today's trust policy and Condition keys are the raw materials.

---

## 📝 Practice Questions

**Question 1.** 계정 A의 Lambda 함수가 계정 B에서 관리하는 KMS 키로 암호화된 데이터를 복호화해야 한다. 반드시 설정해야 하는 것은?

A) 계정 A의 Lambda 실행 역할에 `kms:Decrypt` 권한만 추가하면 된다  
B) 계정 B의 KMS 키 정책에 계정 A의 역할을 허용하고, 계정 A 역할에도 `kms:Decrypt`를 부여한다  
C) 계정 B의 IAM 사용자 정책에만 `kms:Decrypt`를 추가한다  
D) 두 계정이 같은 리전이면 별도 설정 없이 자동 허용된다  

**Answer: B**  
Explanation: KMS는 키 정책이 1차 권위를 가지므로, cross-account 사용 시 키 소유 계정(B)의 키 정책이 호출 계정(A)의 주체를 명시적으로 허용해야 하고, 동시에 A 측 신원 정책에도 `kms:Decrypt` Allow가 있어야 한다. 한쪽만으로는 부족하며, 같은 리전이라는 사실은 권한 부여와 무관하다.

---

**Question 2.** 다음 조건 중 "MFA가 없으면 거부"를 의도했지만, 서비스 간 호출처럼 MFA 키가 아예 없는 정상 요청까지 차단해버릴 위험이 있는 것은?

A) `"BoolIfExists": {"aws:MultiFactorAuthPresent": "false"}`  
B) `"Bool": {"aws:MultiFactorAuthPresent": "false"}`  
C) `"Null": {"aws:MultiFactorAuthPresent": "true"}`  
D) `"BoolIfExists": {"aws:MultiFactorAuthPresent": "true"}`  

**Answer: B**  
Explanation: `Bool`은 키가 반드시 존재한다고 가정하고 값을 평가하므로, MFA 컨텍스트 키가 없는 서비스 호출에서도 조건이 의도치 않게 매칭돼 정상 요청을 막을 수 있다. `BoolIfExists`는 키가 있을 때만 값을 평가하고 없으면 통과시켜 이런 부작용을 피한다. 이 차이가 MFA 강제 정책 작성의 단골 함정이다.

---

**Question 3.** 한 조직이 팀이 늘 때마다 IAM 정책을 추가하는 운영 부담에 직면했다. 정책 수를 폭증시키지 않고 "주체와 리소스의 팀 태그가 일치할 때만 허용"을 구현하는 가장 적절한 접근은?

A) 팀마다 별도 역할과 전용 정책을 만든다  
B) 모든 사용자에게 동일한 admin 정책을 주고 신뢰로 운영한다  
C) `aws:PrincipalTag`와 `aws:ResourceTag`를 비교하는 ABAC 조건으로 정책을 통일한다  
D) 팀별로 별도 AWS 계정을 만들어 물리적으로 분리한다  

**Answer: C**  
Explanation: ABAC은 주체 태그와 리소스 태그의 일치를 조건으로 표현해 정책 하나로 임의 개수의 팀을 처리하므로, 팀이 늘어도 정책 변경 없이 태그만 부여하면 된다. 팀별 역할·정책 양산은 RBAC의 정책 폭증 문제를 그대로 안고, admin 일괄 부여는 최소 권한 위반이며, 팀별 계정 분리는 과도하고 본 문제의 의도와 다르다.

---

**Question 4.** 개발자에게 IAM 역할 생성 권한을 주되, 그가 만든 역할이 부여받은 상한을 넘지 못하게 강제하려 한다. 가장 적절한 메커니즘은?

A) SCP로 `iam:CreateRole` 자체를 Deny한다  
B) `iam:CreateRole` 허용 시 특정 Permissions Boundary 부착을 조건으로 강제한다  
C) 개발자에게 `ReadOnlyAccess`만 부여한다  
D) 생성된 역할을 매일 사람이 검토해 과도하면 삭제한다  

**Answer: B**  
Explanation: `iam:PermissionsBoundary` 조건으로 역할 생성 시 지정한 boundary 부착을 강제하면, 생성된 역할의 실효 권한이 boundary와의 교집합으로 제한돼 권한 상승을 구조적으로 차단한다. CreateRole을 아예 막으면 위임 자체가 불가능하고, ReadOnly만 주면 역할을 만들 수 없으며, 사람의 사후 검토는 누락과 지연 위험이 크다.

---

**Question 5.** S3 버킷에 올라오는 모든 객체가 KMS로 암호화되도록 강제하려 한다. 가장 직접적이고 누락 없는 방법은?

A) 업로드하는 모든 애플리케이션 코드에 암호화 헤더를 넣도록 개발 가이드를 배포한다  
B) 버킷 정책에 `s3:x-amz-server-side-encryption` 조건으로 암호화 헤더가 없는 PutObject를 Deny한다  
C) GuardDuty로 미암호화 객체를 탐지해 알림을 보낸다  
D) IAM 사용자별로 암호화 권한을 따로 부여한다  

**Answer: B**  
Explanation: 버킷 정책에서 `s3:x-amz-server-side-encryption` 조건으로 암호화 헤더 없는 PutObject를 명시적으로 Deny하면, 어떤 주체가 올리든 미암호화 업로드가 차단되는 예방 통제가 된다. 개발 가이드는 강제력이 없어 누락되고, GuardDuty 탐지는 사후 알림일 뿐 업로드를 막지 못하며, 사용자별 권한 부여는 암호화 강제와 직접 관련이 없다.

---
