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

## 📝 Practice Questions

**Question 1.** You want to allow an AWS service to use a key on a user's behalf *only for a specific encryption context, temporarily, and revocably later*, without touching the key policy document. What is the most appropriate mechanism?

A) Add a new statement to the key policy  
B) Add an IAM inline policy  
C) Create a KMS grant (specify operations and an encryption context constraint; it can later be revoked/retired)  
D) Create a new KMS key  

**Answer: C**  
Explanation: A grant is a temporary, fine-grained permission that is created and revoked programmatically; you can specify the allowed operations and an encryption context constraint, and it is withdrawn with RevokeGrant/retire. Because it does not modify the policy document, the key policy does not become bloated. Key policies/IAM suit permanent, broad permissions, and creating a new key is unrelated to this requirement.

---

**Question 2.** You want a key policy to prevent a specific role from calling KMS *directly* and to allow decryption only when S3 calls on that role's behalf. Which condition key should be used?

A) `aws:SourceIp`  
B) Specify `kms:ViaService` as `s3.<region>.amazonaws.com`  
C) `aws:MultiFactorAuthPresent`  
D) `kms:GrantIsForAWSResource`  

**Answer: B**  
Explanation: The `kms:ViaService` condition allows a KMS operation only when it is requested through the specified AWS service endpoint, so it permits decryption only through S3 and denies direct calls. `aws:SourceIp` is IP-based, the MFA condition is multi-factor authentication, and GrantIsForAWSResource is a grant-related condition, so none of them fit this requirement.

---

**Question 3.** Account B tries to decrypt data encrypted with a KMS key owned by Account A, but access is denied. What is the correct resolution procedure?

A) Modifying only Account B's IAM policy is enough  
B) Allow the action for B in Account A's key policy, and at the same time allow the action on A's key ARN in Account B's IAM policy (both sides)  
C) Set the key to public  
D) Disable the key in Account A  

**Answer: B**  
Explanation: Cross-account KMS access works only when the resource-based policy (A's key policy) allows it and the IAM policy of the using account (B) also allows it. Either one alone fails. Modifying only IAM is denied because there is no delegation in the key policy, there is no option to make a key public, and disabling makes the data unreadable.

---

**Question 4.** You must neutralize a KMS key suspected of being compromised *immediately* and in a way that can be reversed if necessary. What is the most appropriate action?

A) Delete it immediately with `ScheduleKeyDeletion`  
B) Disable the key, revoke key policies and grants as needed, and investigate (disable is immediate and reversible)  
C) Delete only the key alias  
D) Leave it to be automatically deleted after a 30-day wait  

**Answer: B**  
Explanation: Disabling a key takes effect immediately and is reversible, so it suits emergency neutralization in a suspected-compromise situation. `ScheduleKeyDeletion` is an irreversible deletion after a 7-30 day waiting period, so it does not meet the "immediately and reversibly" requirement, and once deleted the data can never be decrypted. Deleting an alias does not stop key usage, and leaving it to be deleted automatically is risky.

---

**Question 5.** You want to prevent regular accounts across the organization from deleting KMS keys or changing key policies, and let only roles in the security OU manage keys. What is the most appropriate combination?

A) Grant permissions only to IAM users in each account  
B) Use an Organizations SCP to Deny `kms:ScheduleKeyDeletion` and `kms:PutKeyPolicy` for accounts outside the security OU, and limit administrative permissions in the key policy to the security team role  
C) Convert all keys to AWS managed keys  
D) Enable only CloudTrail  

**Answer: B**  
Explanation: The correct answer is the combination of a guardrail plus fine-grained control: an SCP as an organization-wide guardrail that Denies deletion and policy-change actions for regular accounts, and the key policy limiting actual administrative permissions to the security team role. IAM user permissions alone provide no organization guardrail, converting to AWS managed keys actually loses governance control, and CloudTrail only audits and does not prevent actions.

---
