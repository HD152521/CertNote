# Day 3 - Key Policies, Grants, and Cross-Account Sharing: ViaService Condition and Key Governance

The three mechanisms that control KMS permissions are the *key policy (mandatory, permanent)*, the *IAM policy (when delegated)*, and today's topic, the **grant (temporary and fine-grained)**. Where up to yesterday we looked at how data is encrypted, today we cover *access governance* - "who can use the key, under what conditions, and for how long." SCS-C03 covers cross-account key sharing, the `kms:ViaService` condition, and how grants behave.

There is a reason this topic is weighted so heavily on the exam. The encryption algorithms are standard and KMS's HSMs have already been validated. Real incidents happen not because "AES was broken" but **because "a principal with permission used it beyond its authority."** In other words, the substance of KMS security is not cryptography but *access control*, and the four surfaces we cover today - key policy, IAM delegation, grants, and condition keys - are all of it.

## The Starting Point of the KMS Permission Model: Why Is the Key Policy "Mandatory"?

Other AWS resources can be accessed with an IAM policy alone. An S3 bucket can be read if same-account IAM allows it, even without a bucket policy. **KMS is different.** Every KMS key has exactly one key policy attached, and *if the key policy does not allow it, it does not matter what IAM allows.* A KMS key is a model in which "the resource owner must open the door first."

The default key policy that is attached automatically when you create a key in the console is exactly one statement.

```json
{
  "Version": "2012-10-17",
  "Id": "key-default-1",
  "Statement": [
    {
      "Sid": "Enable IAM User Permissions",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
      "Action": "kms:*",
      "Resource": "*"
    }
  ]
}
```

It is a misreading to interpret this statement as "full authority was given to the root user." Here `:root` means not *the root user as an individual* but **"this account,"** and the meaning of the whole statement is **"delegate access control over this key to this account's IAM."** Only when this one line exists can you grant key permissions to developers and roles through IAM policies.

```
[ The gates a single KMS request must pass ]

  Request: Decrypt   (principal = role/app in account A)
    │
    ├─① SCP (Organizations guardrail)
    │      └─ If it is a Deny, it ends here. What the key policy says is meaningless
    │
    ├─② Key policy (resource-based · mandatory · the primary source of permission)
    │      ├─ (a) Directly Allow the principal  → passes even without IAM
    │      └─ (b) Delegate to IAM with "Enable IAM User Permissions"
    │
    ├─③ IAM policy  ── meaningful only when ② delegated via (b)
    │
    ├─④ Grant     ── can create permissions independently of ② and ③
    │
    └─⑤ Condition evaluation (ViaService · EncryptionContext · CallerAccount · OrgID)
           └─ If even one does not match, it is denied even if everything above allows it
```

There are two properties to read from this figure. First, **the key policy is a gate that cannot be bypassed.** Second, **no matter which path allowed it, the final condition evaluation applies commonly.** That is why, if you put condition keys (`ViaService`, `EncryptionContext`) in the key policy, requests that came in through IAM and requests that came in through a grant are filtered in exactly the same way - this is why putting conditions in the *key policy* is the strongest control.

| Mechanism | Location | Lifetime | Who creates it | Main use |
|-----------|----------|----------|----------------|----------|
| **Key policy** | Attached to the key (resource-based) | Permanent, changed manually | The key administrator of the account that owns the key | Primary source of permission, cross-account delegation, enforcing conditions |
| **IAM policy** | Attached to the principal (identity-based) | Permanent, changed manually | The IAM administrator of each account | Fine-grained distribution within the same account (when the key policy delegates) |
| **Grant** | Stored separately by KMS | Temporary, created/revoked via API | Applications and AWS services | Fine-grained, dynamic, revocable delegation |
| **SCP** | OU/account | Permanent guardrail | The Organizations administrator | A ceiling at the organization level (only Deny is effective) |

> ⚠️ **Pitfall**: Incidents where someone deletes the `Sid: "Enable IAM User Permissions"` statement because "root permission looks dangerous" really do happen. If you delete this statement and do not put yourself into the remaining policy, the key becomes an **orphaned key that no one can fix the key policy of again.** Even an IAM administrator or the account root user cannot touch it - because the key policy does not allow it. This state can be recovered only through AWS Support, and on the exam the answer to the situation "I modified the key policy wrongly and access is completely blocked" is usually *contact AWS Support*. The practical rule is one: **when changing a key policy, never remove the administrative permission of yourself (or a trusted administrative role) first.**

A key policy document has a size limit, so you cannot list principals indefinitely. In an organization with dozens of accounts, adding one line per account soon hits the limit. So there are two scaling patterns in practice. One is to put a *condition* such as `aws:PrincipalOrgID` in the key policy to express the entire organization in one statement and leave the detailed distribution to each account's IAM; the other is to move to **grants** that are created and revoked programmatically. Grants do not go into the key policy document, so they are not bound by the document size. When the symptom "the key policy keeps growing" appears, the answer is not to enlarge the document but to move to conditions or grants.

## Grants: Temporary, Programmatic Delegation of Permissions

While the key policy and IAM give permission "permanently through policy documents," a **grant** is a *temporary permission granted and revoked programmatically.* It is used mainly when an AWS service must use the key temporarily on the user's behalf (for example, when creating an EBS volume, granting decryption permission only for that volume).

Characteristics of a grant:

- Allows only a *limited set of operations* (for example, `Decrypt`, `GenerateDataKey`) to a specific principal (the grantee).
- Conditions the encryption context through a **grant constraint**: `EncryptionContextEquals`/`EncryptionContextSubset`.
- The `RetiringPrincipal` *retires* the grant, or a principal with authority *revokes* it with `RevokeGrant`.
- Permissions can be added and removed dynamically without rewriting the policy, so it does not bloat the key policy.

```bash
aws kms create-grant \
  --key-id alias/app-data-key \
  --grantee-principal arn:aws:iam::111122223333:role/worker \
  --operations Decrypt GenerateDataKey \
  --constraints EncryptionContextSubset={tenant=acme}
```

In practice you attach a name and a retiring principal to this so that it can be *revoked later.* A grant with no designed revocation path becomes effectively a permanent permission.

```bash
# ── Create: specify name and retiring-principal together so it can be revoked ──
aws kms create-grant \
  --key-id arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-... \
  --grantee-principal arn:aws:iam::111122223333:role/BatchWorker \
  --retiring-principal arn:aws:iam::111122223333:role/GrantManager \
  --operations Decrypt GenerateDataKey DescribeKey \
  --constraints EncryptionContextSubset={tenant=acme} \
  --name batch-worker-acme-2026q3
# Response:
# {
#   "GrantToken": "AQpAM2RhY2...",      ← a 'ticket' for immediate use
#   "GrantId":    "0c237476b39f8bc4..."  ← the identifier used when revoking
# }

# ── List / revoke ──
aws kms list-grants  --key-id alias/app-data-key
aws kms revoke-grant --key-id alias/app-data-key --grant-id 0c237476b39f8bc4...
aws kms retire-grant --grant-token AQpAM2RhY2...
```

There is a reason the `GrantToken` is returned too. **A grant does not take effect globally right away.** KMS is a distributed system, so there is a short delay before a newly created grant spreads to every endpoint, and if the grantee calls `Decrypt` immediately in the meantime, an `AccessDeniedException` can occur. To cover this window, KMS gives a ticket that proves "this grant has already been created," and if the caller presents it together with `--grant-tokens`, the call passes without waiting for propagation to complete.

```bash
# When you must use the grant right after creating it — bypass the propagation delay
aws kms decrypt \
  --ciphertext-blob fileb://enc.dat \
  --encryption-context "tenant=acme" \
  --grant-tokens AQpAM2RhY2...
```

> ⚠️ **Pitfall**: For the symptom "I created a grant and when I use it right away I intermittently get AccessDenied," code that adds a *retry loop* or a *sleep* is common. The correct answer is to **pass the grant token returned by `CreateGrant` along with the first call.** On the exam, when a sentence like "the grant must be used immediately after creation / it fails because of eventual consistency" appears, the grant token is the signal for the correct answer.

### Constraints: The Difference Between Equals and Subset

The device that makes a grant fine-grained is the encryption context constraint. The difference between the two appears on the exam.

| Constraint | Matching rule | Effect | When to use |
|------------|---------------|--------|-------------|
| `EncryptionContextEquals` | The request's context must be **exactly identical** to the constraint | The strictest. Denied if even one extra key-value pair is added | Internal workloads whose context shape is fixed |
| `EncryptionContextSubset` | Passes if **all** the pairs in the constraint are included in the request context (extra pairs allowed) | Flexible. "tenant=acme is mandatory, the rest is free" | When a service adds to the context automatically |

This distinction matters because **AWS services add to the context on their own.** For example, S3 automatically puts `aws:s3:arn` in the context, and EBS puts the volume identifier. If you specify only `tenant=acme` here with `EncryptionContextEquals`, the "exactly identical" condition is broken by the pairs the service attached and everything is denied. `Subset` is almost always right for flows that go through an AWS service.

### Controlling the Grants That AWS Services Create

When you attach an encrypted EBS volume or create an RDS instance, the service calls `CreateGrant` on the user's behalf. The condition key that applies at that time is `kms:GrantIsForAWSResource`.

```json
{
  "Sid": "AllowGrantCreationOnlyByAWSServices",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:role/AppRole" },
  "Action": "kms:CreateGrant",
  "Resource": "*",
  "Condition": {
    "Bool": { "kms:GrantIsForAWSResource": "true" }
  }
}
```

This statement means "AppRole can create **only the grants that AWS services create on its behalf.**" In other words, the grant that EC2 automatically creates when attaching a volume passes, but a person scattering grants to arbitrary principals with the CLI is blocked. Because `kms:CreateGrant` is **the permission to hand permissions out again**, it is effectively a privilege escalation path, so narrowing it like this is the core of least-privilege design.

The criterion for choosing among grant vs key policy vs IAM - *broad permissions that are permanent and that a person will review* go in the key policy/IAM, while *fine-grained permissions that are temporary and created/revoked programmatically* go in grants. AWS service integrations (EBS, Redshift, and so on) create grants internally. On the exam, "I want to give permission temporarily, without modifying the policy, only for a specific encryption context, and in a revocable way" → grant.

`RevokeGrant` and `RetireGrant` both remove a grant, but *who calls them* and the *intent* differ. `RevokeGrant` is called by an **administrative principal** holding the `kms:RevokeGrant` permission on the key, meaning "forcibly take back this permission" - it is an incident response tool. `RetireGrant` is when the `RetiringPrincipal` specified at grant creation, or the grantee, hands the grant back on its own saying "I no longer need this permission," which is the normal cleanup after the work is done. The design implication is clear. **Give the incident response path (revoke) and the normal termination path (retire) to different principals.** Give a batch job only the permission to retire its own grant, and keep the forced-revocation permission only for the security team's role.

## The kms:ViaService Condition: Restricting the Key Usage Path

`kms:ViaService` is a condition that "allows this KMS operation *only when it is requested through a specific AWS service.*" In other words, it blocks users from calling KMS directly and allows it only when a specified service (for example, S3 or EBS) calls on the user's behalf.

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

The policy above means "this role can use this key *only through S3 in the Seoul Region.*" If the same role calls `aws kms decrypt` directly, it is denied.

The value can list several services as an array, and it is important that it must be in the **service endpoint format that includes the Region.**

```json
"Condition": {
  "StringEquals": {
    "kms:ViaService": [
      "s3.ap-northeast-2.amazonaws.com",
      "ec2.ap-northeast-2.amazonaws.com",
      "rds.ap-northeast-2.amazonaws.com"
    ],
    "kms:CallerAccount": "111122223333"
  }
}
```

The fact that the Region is baked in here produces a side effect. A key policy that lists only the Seoul Region **automatically also blocks the same service in other Regions from using this key.** It can be used as a means of controlling Region movement itself, but it can also become the cause of a silent `AccessDenied` when you later expand a workload to another Region.

The working principle of this condition, in one line: **when a person calls KMS directly, the `kms:ViaService` key does not exist in the request at all.** So `Allow` + `StringEquals` naturally filters out direct calls.

```
[ What ViaService filters ]

  ① Normal path (allowed)
     user/role ─GetObject─→ S3 ─Decrypt(ViaService=s3....)─→ KMS ✅

  ② Bypass attempt (blocked)
     user/role ─────── aws kms decrypt (no ViaService) ──→ KMS ❌
     · An attempt to unwrap only the DEK without downloading the whole S3 object
     · An attempt to abuse the key directly with compromised credentials
```

> 🎯 **Scenario**: "The data key must be used only for RDS encryption, and no person must be able to call KMS directly to decrypt." → Restrict `kms:ViaService` in the key policy to `rds.<region>.amazonaws.com`. Binding key use to a specific service path reduces the data exfiltration surface.

If you set only `kms:ViaService` and omit `kms:CallerAccount`, there may be room for the same service of another account to make the request. In cross-account scenarios, consider both conditions together.

If you apply `kms:ViaService` as a broad `Deny` on *all actions*, you can no longer manage the key itself. **Administrative operations such as `PutKeyPolicy`, `ScheduleKeyDeletion`, and `EnableKeyRotation` are never called on your behalf by any service, so they are always direct calls**, and therefore they are blocked wholesale by the ViaService condition. In practice, apply the condition only to *cryptographic operations* (`Decrypt`, `Encrypt`, `GenerateDataKey*`, `ReEncrypt*`) and separate the administrative actions into a separate administrator statement. This is the cause of the symptom "I set ViaService and now I can't turn on key rotation."

## Cross-Account Key Sharing: Both Steps Are Required

To share a KMS key cross-account, you must **configure two places at the same time.** This "both steps" pattern is the criterion that separates wrong answers.

1. **The key policy of the key-owning account (A)**: allow key operations to the external account (B)'s root or a specific role.
2. **The IAM policy of the using account (B)**: allow KMS operations on A's key ARN to principals in its own account.

```json
// Account A key policy (the owner delegates)
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::B_ACCOUNT:root" },
  "Action": ["kms:Decrypt", "kms:DescribeKey"],
  "Resource": "*"
}
```

```json
// Account B IAM policy (the user exercises it)
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt", "kms:DescribeKey"],
  "Resource": "arn:aws:kms:ap-northeast-2:A_ACCOUNT:key/abcd-..."
}
```

```
[ Conditions for cross-account access — it opens only when both are on ]

     Account A (key owner)                  Account B (key user)
  ┌───────────────────┐                ┌───────────────────┐
  │  KMS key          │                │  role/Consumer    │
  │  ┌─────────────┐  │                │  ┌─────────────┐  │
  │  │  Key policy │  │◀── delegates ──│  │  IAM policy │  │
  │  │ Principal:  │  │                │  │ Resource:   │  │
  │  │  B:root  ✅ │  │  ─ exercises ─▶│  │  A's key ARN ✅│  │
  │  └─────────────┘  │                │  └─────────────┘  │
  └───────────────────┘                └───────────────────┘
        ① only → B's principal gets no IAM allow, so denied
        ② only → A has not opened the door, so denied (the most common mistake)
        ① + ②  → passes ✅
```

Cross-account access holds only when the resource-based policy (the key policy) *allows* and, at the same time, the using account's IAM *allows.* With only one side it fails - this is a consistent principle (consent from both sides) across S3 buckets and cross-account sharing in general. On the exam, if "it's cross-account and access doesn't work," first check whether one of the two is missing.

A real example of cross-account sharing: account B receives and restores an EBS snapshot encrypted with account A's key, or receives an RDS snapshot encrypted with A's key. Sharing the snapshot itself (the RDS/EBS sharing API) and *granting key access permission* are separate, and both are required.

```
[ The full procedure for sharing an encrypted EBS snapshot with account B ]

Account A                                         Account B
──────                                            ──────
① Confirm the snapshot is encrypted with
   a customer managed key
   (a snapshot encrypted with an AWS managed key
    cannot be shared at all — the policy cannot be edited)
                                    │
② Grant snapshot sharing permission  │
   modify-snapshot-attribute        │
   --user-ids B_ACCOUNT             │
                                    ▼
③ Allow B in the key policy ────▶  ④ In IAM, allow Decrypt·CreateGrant
   Decrypt / DescribeKey /            on A's key ARN
   CreateGrant                        │
                                      ▼
                                   ⑤ On copy-snapshot, re-encrypt with
                                      B's own key → independent of A afterward
```

The reason `CreateGrant` is needed in ③ is an exam point. When B creates a volume from that snapshot, **EC2 must create a grant on B's behalf** for the volume to keep using that key. If you give only `Decrypt` and omit `CreateGrant`, the typical symptom appears: "the snapshot is visible but creating the volume fails."

**A snapshot encrypted with an AWS managed key (`aws/ebs`, `aws/rds`) cannot be shared with another account.** This is because users cannot edit the key policy of an AWS managed key, so there is no way to delegate to an external account. If there is a requirement that "snapshot sharing is needed," you must **encrypt with a customer managed key from the start**, and if it was already created with an AWS managed key, make a CMK re-encrypted copy with `copy-snapshot` and then share that. It is the number-one cause of "can't share" on the exam.

### Crossing Regions: Multi-Region Keys

The problem of crossing accounts and the problem of crossing *Regions* are different. A KMS key is a Region resource, so ciphertext encrypted in Seoul cannot, in principle, be decrypted with a different key in Tokyo. A **multi-Region key (MRK)** removes this wall by replicating the same key material across several Regions.

```bash
# ① Create a multi-Region primary key (the key ID starts with mrk-)
aws kms create-key --multi-region --description "cross-region app key"

# ② Replicate to another Region — the replica has its own key policy
aws kms replicate-key \
  --key-id arn:aws:kms:ap-northeast-2:111122223333:key/mrk-1234abcd... \
  --replica-region us-east-1 \
  --policy file://replica-key-policy.json

# ③ If needed, you can also move the primary Region
aws kms update-primary-region \
  --key-id arn:aws:kms:ap-northeast-2:111122223333:key/mrk-1234abcd... \
  --primary-region us-east-1
```

| Item | Multi-Region key (MRK) | Independent per-Region keys |
|------|------------------------|-----------------------------|
| Key material | **Identical** across Regions | Different in each Region |
| Ciphertext interoperability | Encrypt in Seoul → decrypt in Tokyo **possible** | Not possible (cross-Region re-encryption required) |
| Key policy, grants, alias | Set **independently** for each replica | Independent, naturally |
| Rotation | Rotating the primary key reflects the same key material in replicas | Rotated separately per Region |
| Isolation level | Low — one key material exists in several Regions | High — a Region incident does not spread |
| Typical use | Global DynamoDB tables, cross-Region DR, cross-Region backup | Per-Region regulation and data sovereignty requirements |

> 🎯 **Scenario**: "For disaster recovery, we replicate encrypted data from the Seoul Region to the Tokyo Region. In an outage we must decrypt right away in Tokyo and continue service, and if the recovery procedure includes a re-encryption step we cannot meet the RTO." → **A multi-Region key.** If you make Seoul the primary key and create a replica in Tokyo, the Tokyo replica can unwrap ciphertext created in Seoul as is. Conversely, if a data sovereignty requirement is attached such as "each Region's data must be decryptable only within that Region," an MRK is wrong and independent per-Region keys are right. **The same feature can be correct or wrong depending on the requirement sentence** - the criterion is whether you are asked for *convenience (availability)* or *isolation (sovereignty).*

An MRK replica **does not have its key policy replicated.** If you do not specify a policy at `replicate-key`, the default policy is attached, and even if you later change the original key policy, it is not reflected in the replica automatically. This policy drift is a common cause of "it works in Seoul but only Tokyo gets AccessDenied." If you use an MRK, you should manage key policies as IaC to force synchronization across Regions.

## Key Governance: SCP, Conditions, and Tag-Based Control

Organization-level key governance tools:

- **SCP (Service Control Policy)**: in Organizations, enforces things such as "no use of keys other than specific ones," "no key deletion (`kms:ScheduleKeyDeletion`)," and "no key creation outside specific Regions" as *guardrails across all accounts.*
- **The `aws:PrincipalOrgID` condition**: in a key policy, allows "only principals belonging to our organization," limiting cross-account sharing to inside the organization.
- **ABAC (tag-based)**: access control based on tags and aliases with `aws:ResourceTag`/`kms:ResourceAliases` and the like.
- **CloudTrail**: every KMS API (Encrypt/Decrypt/GenerateDataKey/grant changes) is recorded, auditing "who used which key, when, and in what context."

```json
// Block principals outside the organization
"Condition": {
  "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
}
```

A guardrail gains power when expressed not as an "allow" but as a **"prohibition that cannot be overridden."** The real form of an SCP looks like this.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyKeyDestructionOutsideSecurityRole",
      "Effect": "Deny",
      "Action": [
        "kms:ScheduleKeyDeletion",
        "kms:DisableKey",
        "kms:PutKeyPolicy",
        "kms:DisableKeyRotation",
        "kms:DeleteAlias"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": "arn:aws:iam::*:role/SecurityKeyAdmin"
        }
      }
    },
    {
      "Sid": "DenyKeyCreationOutsideApprovedRegions",
      "Effect": "Deny",
      "Action": "kms:CreateKey",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
        }
      }
    }
  ]
}
```

The first statement nails down across the whole organization that "**no one** other than the `SecurityKeyAdmin` role can destroy keys or change policies." The key point is that no matter how broadly an account administrator grants IAM in their own account, they cannot get past the SCP. The second statement blocks key creation outside approved Regions for data sovereignty and cost control.

Tag-based (ABAC) control prevents policy explosion when keys grow into the hundreds.

```json
{
  "Sid": "AllowUseOfKeysMatchingWorkloadTag",
  "Effect": "Allow",
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Workload": "${aws:PrincipalTag/Workload}",
      "kms:CallerAccount": "111122223333"
    }
  }
}
```

"Allow only when the principal's `Workload` tag and the key's `Workload` tag are the same" - even as keys grow and teams grow, the policy document stays the same. In exchange, **the permission to change tags itself becomes a privilege escalation path**, so you must lock down `kms:TagResource` and `iam:TagRole` separately.

> 🎯 **Scenario**: "Multiple accounts use a shared key, and we want to block key deletion and key policy changes from ordinary accounts and manage them only from the security account." → Deny `kms:ScheduleKeyDeletion` and `kms:PutKeyPolicy` with an SCP for accounts outside the security OU, and grant administrative permission in the key policy only to the security team's role. A combination of a guardrail (SCP) + a key policy (fine-grained).

## Reading Key Usage in CloudTrail

The last piece of key governance is proving "is it running as configured." Every KMS call is left in CloudTrail, and an investigator can determine the situation by looking at just a few fields.

```json
// A grant created by an AWS service on its behalf — the normal flow of attaching an EBS volume
{
  "eventName": "CreateGrant",
  "eventSource": "kms.amazonaws.com",
  "userIdentity": { "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc" },
  "sourceIPAddress": "ec2.amazonaws.com",
  "requestParameters": {
    "granteePrincipal": "ec2.ap-northeast-2.amazonaws.com",
    "operations": ["Decrypt", "GenerateDataKeyWithoutPlaintext", "CreateGrant"],
    "constraints": { "encryptionContextSubset": { "aws:ebs:id": "vol-0a1b2c3d" } }
  }
}
```

```json
// A grant a person created directly — the act of handing permissions to another principal
{
  "eventName": "CreateGrant",
  "eventSource": "kms.amazonaws.com",
  "userIdentity": { "arn": "arn:aws:iam::111122223333:user/dev-kim" },
  "sourceIPAddress": "203.0.113.45",
  "requestParameters": {
    "granteePrincipal": "arn:aws:iam::444455556666:root",
    "operations": ["Decrypt"]
  }
}
```

| Observation | Interpretation |
|-------------|----------------|
| `CreateGrant` + `sourceIPAddress` is a service domain (such as `ec2.amazonaws.com`) | Normal behavior of an AWS service integration. A path where `kms:GrantIsForAWSResource` is `true` |
| `CreateGrant` + a person's IP + the grantee is an **external account** | The act of sending permissions outside the organization. Top-priority alarm target |
| The `Decrypt`'s `userIdentity.accountId` is **different** from the key-owning account | Cross-account use. It is also left as is in the key-owning account's CloudTrail |
| Mass `Decrypt` with no `GenerateDataKey` | Reading without writing — may be a sign of mass exfiltration |
| A new principal's `Decrypt` succeeds right after `PutKeyPolicy` | The typical privilege escalation sequence of opening the policy for oneself and walking in |
| `ScheduleKeyDeletion` | A destructive act with a fixed window in which it can still be reversed. Needs an immediate notification |
| `ListGrants` and `GetKeyPolicy` surging from a principal that normally has none | Reconnaissance, scanning the permission structure |

There is an asymmetry in auditing cross-account KMS use. When account B's role calls `Decrypt` with account A's key, that event is recorded **in both A's CloudTrail and B's CloudTrail.** A sees "an external account used my key," and B sees "my role used an external key." So the side that lent the key can detect misuse with only its own trail even though it cannot see the other account's logs - meaning audit sovereignty is preserved even when the key is shared. On the exam, when the requirement "lend the key to another account but we must monitor the usage" appears, the correct direction is that **the key-owning account's CloudTrail is enough** with no separate mechanism.

## Key Deletion: An Irreversible Risk

KMS key deletion is possible only as a scheduled deletion (`ScheduleKeyDeletion`) with a *waiting period of at least 7 and at most 30 days.* During the wait you can cancel with `CancelKeyDeletion`. When the key is actually deleted, *all data encrypted with that key becomes permanently undecryptable* (the crypto-shredding effect). If you need to block immediately, use **disabling the key (disable)** instead of deletion - it is reversible.

```bash
# Immediate, reversible neutralization (the first line of incident response)
aws kms disable-key --key-id alias/app-data-key

# Irreversible destruction — the waiting period is 7-30 days (default 30 days)
aws kms schedule-key-deletion \
  --key-id arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-... \
  --pending-window-in-days 30

# Cancel during the wait
aws kms cancel-key-deletion --key-id arn:aws:kms:...:key/1234abcd-...
```

| Action | Immediacy | Reversibility | Data impact | When to use |
|--------|-----------|---------------|-------------|-------------|
| `DisableKey` | Immediate | **Reversible** | Decryption temporarily impossible (restored when turned back on) | Suspected leak, emergency block during investigation |
| Revoking a grant / narrowing the key policy | Immediate (with propagation delay) | Reversible | Blocks only that principal | When cutting off only a specific workload or account |
| `ScheduleKeyDeletion` | After 7-30 days | Reversible only during the wait | **Permanently undecryptable** | GDPR destruction, confirmed disposal |
| Deleting an alias | Immediate | Reversible | **None** (the key keeps working) | For tidying names. Not a control measure |

You must not choose deletion for the requirement "immediately neutralize a key suspected of a leak." Deletion has a waiting period and is irreversible. Immediate, reversible neutralization is *disable*, and in a suspected situation you also revoke the key policy/grants.

A frequent mistake is deleting only the alias and thinking "I blocked the key." An alias is only a human-readable *pointer*, so even if the alias disappears, every cryptographic operation is still possible with the key ID/ARN. This is why only deleting an alias shows "no data impact" in the table above.

Since deletion has a waiting period, you should take advantage of the fact that *there is time to detect.* KMS publishes the scheduling of deletion and the actual deletion as EventBridge events, so if you put an alert on them, you can reverse a malfunction or malicious destruction within the waiting period. The practical order is three steps: **① narrow the deletion permission itself with an SCP → ② announce a scheduled deletion immediately through EventBridge/CloudTrail → ③ before deleting, check the recent usage history in CloudTrail to verify "that it is truly a key nobody uses."** The last step is especially important. If you do not confirm that the `Decrypt` and `GenerateDataKey` records for the past several months are truly zero before deleting a key, a batch job that runs once a quarter will silently die next quarter.

The Capital One breach disclosed in 2019 is the textbook case of "the data left even though it was encrypted." The attacker used SSRF through a misconfigured WAF (a reverse proxy) to reach the EC2 instance metadata and obtained the temporary credentials of that instance role, then used those credentials to list S3 buckets and download data. Information on roughly 106 million US and Canadian credit card applicants was affected. The data was encrypted at rest, but **because the stolen role held legitimate permission to read that data**, the encryption provided no defense at all. Envelope encryption stops *an attacker who stole the disk*, not *an attacker who stole the permissions.* Today's tools fill exactly that gap - bind usage to "only through S3" with `kms:ViaService`, narrow the access scope with encryption context conditions, open permissions only at the moment they are needed with grants, and detect a surge in `Decrypt` with CloudTrail. On the exam, the answer to the question "it leaked even though encryption at rest was on - what was lacking?" is always *the scope of key usage permissions and detection*, not *the strength of the encryption.*

In 2014, Code Spaces closed its business itself after an intruder gained AWS console access and deleted instances, storage, snapshots, and backups. It is an incident in which not the data but **the means of reviving the data was wiped out entirely.** The lesson of this case in the KMS context is direct. The permission to delete a key is the same as the permission to delete petabytes, so `kms:ScheduleKeyDeletion` should be narrowed at the organization level with an SCP, and backups and key management should be separated into a different account and a different trust boundary. This is why the three-step procedure above is not "excessive bureaucracy."

## Summary

The key policy (mandatory, permanent), IAM (delegation), and grants (temporary, fine-grained) form the triangle of KMS permissions, and on top of it an SCP sits as a guardrail. The key policy is the primary gate that cannot be bypassed, so deleting `Enable IAM User Permissions` orphans the key. Grants become fine-grained with `EncryptionContextSubset`/`Equals` constraints, because of eventual consistency you must pass the grant token right after creation, and revocation splits into forced (`Revoke`) and handing back (`Retire`). Use `kms:ViaService` to bind key usage to a specific service path while dividing the scope so that administrative actions are not blocked, and set `kms:CallerAccount` together with it. Cross-account requires both sides - the *key policy allow + the using account's IAM allow* - and a snapshot encrypted with an AWS managed key cannot be shared in the first place. If you must cross Regions, use a multi-Region key but manage the replica's key policy separately. Finally, immediate neutralization is disable, not deletion, and you narrow the deletion permission with an SCP and monitor it with CloudTrail and EventBridge.

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
