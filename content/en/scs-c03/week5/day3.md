# Day 3 - Key Policies, Grants, and Cross-Account Sharing: ViaService Condition and Key Governance

The three mechanisms for controlling KMS permissions are *key policy (required, permanent)*, *IAM policy (if delegated)*, and today's topic: **grant (temporary, granular)**. Until yesterday we saw how data is encrypted; today we address *access governance*: "who, under what conditions, and for how long can use a key?" SCS-C03 frequently tests cross-account key sharing, the `kms:ViaService` condition, and grant operation.

## Grant: Temporary, Programmatic Permission Delegation

While key policies and IAM give permissions "permanently via policy documents," **grant** is *temporary permission delegated and revoked programmatically*. AWS services primarily use it when they temporarily need to use a key on behalf of a user (e.g., granting decrypt permission for a specific EBS volume during its creation).

Grant characteristics:

- Allow a specific principal (grantee) only a *limited set of operations* (e.g., `Decrypt`, `GenerateDataKey`).
- Use **grant constraint** to condition on encryption context: `EncryptionContextEquals`/`EncryptionContextSubset`.
- `RetiringPrincipal` can *retire* the grant, or an authorized entity can *revoke* it with `RevokeGrant`.
- Dynamically add/remove permissions without rewriting policies, keeping key policies lean.

```bash
aws kms create-grant \
  --key-id alias/app-data-key \
  --grantee-principal arn:aws:iam::111122223333:role/worker \
  --operations Decrypt GenerateDataKey \
  --constraints EncryptionContextSubset={tenant=acme}
```

> 💡 **Related Theory**: Grant vs. key policy vs. IAM selection criteria — *permanent, reviewed, broad permissions* go to key policy/IAM; *fine-grained, temporary, programmatically created/revoked permissions* go to grant. AWS service integration (EBS, Redshift, etc.) internally creates grants. Exam question: "Grant temporary, context-specific, revocable permission without editing policies" → grant.

## kms:ViaService Condition: Restrict Key Usage Path

`kms:ViaService` says "allow this KMS operation only when requested *through a specific AWS service*." It blocks direct user calls to KMS and allows only when a designated service (e.g., S3, EBS) calls on the user's behalf.

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:role/app" },
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "kms:ViaService": "s3.ap-northeast-2.amazonaws.com",
      "kms:CallerAccount": "111122223333"
    }
  }
}
```

This policy means "this role can use this key *only through S3 in Seoul region*." Direct `aws kms decrypt` calls from this role are denied.

> 🎯 **Scenario**: "Ensure data key is used only for RDS encryption, and nobody can directly call KMS to decrypt." → Add `kms:ViaService` restricted to `rds.<region>.amazonaws.com` in key policy. Bind key usage to a specific service path to reduce data exfiltration surface.

> ⚠️ **Trap**: Setting only `kms:ViaService` without `kms:CallerAccount` could allow the same service from a different account. In cross-account scenarios, consider both conditions together.

## Cross-Account Key Sharing: Both Sides Required

To share a KMS key across accounts, **you must configure both locations simultaneously**. This "both sides" pattern is an exam staple.

1. **Key owner account (A) key policy**: Allow key operations to account B root or specific roles.
2. **User account (B) IAM policy**: Allow principals in B to perform KMS operations on A's key ARN.

```json
// Account A key policy (owner delegates)
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::B_ACCOUNT:root" },
  "Action": ["kms:Decrypt", "kms:DescribeKey"],
  "Resource": "*"
}
```

```json
// Account B IAM policy (user exercises)
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt", "kms:DescribeKey"],
  "Resource": "arn:aws:kms:ap-northeast-2:A_ACCOUNT:key/abcd-..."
}
```

> 💡 **Related Theory**: The resource-based policy (key policy) must *allow*, and simultaneously the user account's IAM must *allow*. One alone fails — this is the consistent principle of cross-account access everywhere (bucket sharing, etc.): two-sided consent. On the exam, if "cross-account access fails," first check if one side is missing.

Cross-account sharing in practice: Account B receives and restores an EBS snapshot encrypted with account A's key, or receives an RDS snapshot encrypted with A's key. Snapshot sharing itself (RDS/EBS share API) and *key access permission granting* are separate and both needed.

## Key Governance: SCP, Condition, and Tag-Based Control

Organizational key governance tools:

- **SCP (Service Control Policy)**: From Organizations, enforce guardrails like "forbid any key except specified," "forbid key deletion (`kms:ScheduleKeyDeletion`)," "forbid key creation outside regions" *across all accounts*.
- **`aws:PrincipalOrgID` condition**: In key policy, "only principals from our organization" can use it, limiting cross-account sharing to org members.
- **ABAC (tag-based)**: Use `aws:ResourceTag`/`kms:ResourceAliases` etc. for tag and alias-based access control.
- **CloudTrail**: All KMS operations (Encrypt/Decrypt/GenerateDataKey/grant changes) are logged so you can audit "who, when, which key, in which context."

```json
// Block principals outside the organization
"Condition": {
  "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
}
```

> 🎯 **Scenario**: "Multiple accounts share a key, but prevent key deletion and policy changes in regular accounts; only the security account manages it." → Use SCP to Deny `kms:ScheduleKeyDeletion` and `kms:PutKeyPolicy` in non-security OUs; grant management access in key policy to security team role only. Guardrail (SCP) + fine-grained (key policy) combination.

## Key Deletion: Irreversible Risk

KMS key deletion is possible only via scheduled deletion (`ScheduleKeyDeletion`) with a *7-30 day waiting period*. During that window, `CancelKeyDeletion` can cancel. Once actually deleted, *all data encrypted with that key becomes permanently unrecoverable* (crypto-shredding effect). For immediate blocking, use **key disable** instead — it's reversible.

> ⚠️ **Trap**: When asked to "immediately neutralize a suspected compromised key," don't choose deletion. Deletion has a waiting period and is irreversible. Immediate, reversible neutralization is *disable*, and in suspect situations also revoke key policy/grants.

## One-Line Summary

Key policy (required/permanent), IAM (delegated), and grant (temporary/granular) form the KMS permission triangle. Use `kms:ViaService` to bind key usage to specific service paths; cross-account requires *both key policy allow + user account IAM allow*. Establish organizational governance with SCP, `aws:PrincipalOrgID`, and CloudTrail; for immediate neutralization, use disable, not deletion.

---

## 📝 연습 문제

**문제 1.** AWS 서비스가 사용자를 대신해 *특정 암호화 컨텍스트에 한해, 임시로, 나중에 취소 가능하게* 키를 쓰도록 허용하되 키 정책 문서는 건드리지 않으려 한다. 가장 적절한 메커니즘은?

A) 키 정책에 새 Statement 추가  
B) IAM 인라인 정책 추가  
C) KMS grant 생성(operations·encryption context constraint 지정, 이후 revoke/retire 가능)  
D) 새 KMS 키 생성  

**정답: C**  
해설: grant는 프로그래밍적으로 생성·취소되는 임시·세밀 권한으로, 허용 작업과 암호화 컨텍스트 제약을 지정할 수 있고 RevokeGrant/retire로 회수된다. 정책 문서를 수정하지 않아 키 정책이 비대해지지 않는다. 키 정책/IAM은 영구적·광범위 권한에 적합하고, 새 키 생성은 이 요구와 무관하다.

---

**문제 2.** 키 정책에서 특정 역할이 KMS를 *직접* 호출하는 것은 막고, 오직 S3가 그 역할을 대신해 호출할 때만 복호화를 허용하려 한다. 어떤 조건 키를 써야 하는가?

A) `aws:SourceIp`  
B) `kms:ViaService`를 `s3.<region>.amazonaws.com`으로 지정  
C) `aws:MultiFactorAuthPresent`  
D) `kms:GrantIsForAWSResource`  

**정답: B**  
해설: `kms:ViaService` 조건은 KMS 작업이 지정한 AWS 서비스 엔드포인트를 통해 요청될 때만 허용하므로, S3를 통한 복호화만 허용하고 직접 호출은 거부한다. `aws:SourceIp`는 IP 기반, MFA 조건은 다중 인증, GrantIsForAWSResource는 grant 관련 조건으로 이 요구와 맞지 않는다.

---

**문제 3.** 계정 B가 계정 A 소유 KMS 키로 암호화된 데이터를 복호화하려 하는데 접근이 거부된다. 올바른 해결 절차는?

A) 계정 B의 IAM 정책만 수정하면 된다  
B) 계정 A의 키 정책에서 B에게 작업을 허용하고, 동시에 계정 B의 IAM 정책에서 A의 키 ARN에 대한 작업을 허용한다(양측 모두)  
C) 키를 public으로 설정한다  
D) 계정 A에서 키를 비활성화한다  

**정답: B**  
해설: 교차계정 KMS 접근은 리소스 기반 정책(A의 키 정책)이 허용하고 동시에 사용 계정(B)의 IAM이 허용해야 성립한다. 어느 한쪽만으로는 실패한다. IAM만 수정하면 키 정책의 위임이 없어 거부되고, 키를 public으로 만드는 옵션은 존재하지 않으며, 비활성화는 데이터를 못 읽게 만든다.

---

**문제 4.** 유출이 의심되는 KMS 키를 *즉시*, 그리고 필요하면 되돌릴 수 있게 무력화해야 한다. 가장 적절한 조치는?

A) `ScheduleKeyDeletion`으로 즉시 삭제  
B) 키를 disable(비활성화)하고, 필요 시 키 정책·grant를 회수하며 조사한다(disable은 즉시·가역적)  
C) 키 별칭만 삭제  
D) 30일 대기 후 자동 삭제되도록 둔다  

**정답: B**  
해설: 키 disable은 즉시 효력이 있고 가역적이어서 의심 상황의 긴급 무력화에 적합하다. `ScheduleKeyDeletion`은 7~30일 대기 후 비가역 삭제이므로 "즉시·되돌릴 수 있게"라는 요구에 맞지 않고, 삭제되면 데이터가 영구 복호화 불가가 된다. 별칭 삭제는 키 사용을 막지 못하고, 자동 삭제 방치는 위험하다.

---

**문제 5.** 조직 전체에서 일반 계정이 KMS 키를 삭제하거나 키 정책을 변경하지 못하게 막고, 보안 OU의 역할만 키를 관리하게 하려 한다. 가장 적절한 조합은?

A) 각 계정에서 IAM 사용자에게만 권한 부여  
B) Organizations SCP로 `kms:ScheduleKeyDeletion`·`kms:PutKeyPolicy`를 보안 OU 외 계정에서 Deny하고, 키 정책에서 관리 권한을 보안팀 역할로 한정  
C) 모든 키를 AWS managed key로 전환  
D) CloudTrail만 활성화  

**정답: B**  
해설: SCP는 조직 차원 가드레일로 일반 계정의 삭제·정책 변경 작업을 Deny하고, 키 정책으로 실제 관리 권한을 보안팀 역할에 한정하는 가드레일+세밀 통제 조합이 정답이다. IAM 사용자 권한만으로는 조직 가드레일이 없고, AWS managed key 전환은 거버넌스 통제력을 오히려 잃으며, CloudTrail은 감사만 할 뿐 행위를 막지 못한다.

---
