# Day 1 - KMS Deep Dive: The Math of Envelope Encryption, the Key Policy Permission Model, and Multi-Region Keys

There is a contradiction that engineers designing encryption for the first time hit right away. "To encrypt data I need a key, but where do I keep that key safely?" Leaving the key next to the data in plaintext defeats the point of encryption, and having a person memorize and type the key every time is impractical. This "key that protects the key" problem (the key management problem) has been a decades-old puzzle in cryptography, and the cloud solves it with a structure of a **hardware-based root key + envelope encryption**. AWS KMS (Key Management Service) is the service that provides exactly this structure as a managed offering.

On the SAP-C02 exam, KMS appears as architectural decisions: "which key type should I choose," "what happens when Key Policy and IAM permissions conflict," "how do I design Cross-Account and Cross-Region decryption," and "what do I use if compliance requires FIPS 140-2 Level 3." Today we take KMS's internal workings apart down to the math of envelope encryption, and sort out the subtle traps of the permission model and the DR design of multi-Region keys.

## Envelope Encryption - Why KMS Doesn't Encrypt Data Directly

A common misconception is that "KMS encrypts my data." In fact KMS does **not** directly encrypt your large data (multi-GB S3 objects, EBS volumes). KMS's `Encrypt` API accepts only up to 4KB. So how does huge data get encrypted? The answer is **envelope encryption**.

The flow is this. When encrypting data, you call `GenerateDataKey` on KMS, and KMS returns two things: (1) a **plaintext data key (plaintext DEK)**, the AES-256 key actually used to encrypt the data, and (2) an **encrypted data key (encrypted DEK)**, that DEK wrapped with your KMS master key (CMK). The application quickly encrypts the data locally with the plaintext DEK, then **discards the plaintext DEK from memory immediately**, and stores only the encrypted DEK next to the encrypted data.

```
[Encrypt]
GenerateDataKey(CMK) → plaintext DEK + encrypted DEK
   ↓
Data ← encrypt locally with the plaintext DEK (AES-256)
   ↓
Store: [encrypted data] + [encrypted DEK]   ← plaintext DEK discarded immediately

[Decrypt]
encrypted DEK → KMS Decrypt(CMK) → plaintext DEK
   ↓
encrypted data ← decrypt locally with the plaintext DEK
```

The core of this structure is that "the master key (CMK) never leaves the KMS hardware." The CMK exists only inside the HSM, computing inside the HSM only when an `Encrypt`/`Decrypt` request arrives, and the plaintext key never comes out. Only the DEK that actually encrypts the data is briefly exposed in plaintext and then vanishes.

Why split it into 2 stages? Three reasons work on both the mathematical and operational sides. First, **performance**: symmetric cryptography (AES) is fast, but a KMS round trip (a network call) is slow. Splitting GB-scale data into 4KB pieces and sending them to KMS would need millions of round trips. If you receive the DEK once and encrypt locally, the network round trips end at 1. Second, **efficient key rotation**: even when you replace the master key, you don't need to re-encrypt the data itself; you just re-wrap the "encrypted DEK" (re-wrap). You can rotate keys without re-encrypting petabytes of data. Third, **isolation**: the plaintext master key is never exposed in application memory, so the master key is safe even against memory dump attacks. This pattern is essentially the same idea as PGP's session key structure and TLS's key exchange: a slow, secure asymmetric/master key protects a fast symmetric session key.

DEK caching (data key caching in the `aws-encryption-sdk`) raises the performance of envelope encryption another notch. Calling `GenerateDataKey` for every object piles up KMS API call cost ($0.03/10,000 calls) and latency. The AWS Encryption SDK reduces KMS calls by reusing one DEK within configured count, byte, and time limits. There is a security trade-off, though: reusing the same DEK too long or too often widens the blast radius if one DEK leaks. NIST SP 800-38D recommends capping the amount of data encrypted under a single key (the nonce reuse risk in GCM mode), and the cache limits are the balance point between that recommendation and cost.

## KMS Key Types - A Spectrum of Ownership and Control

| Type | Key ownership/creation | Automatic rotation | Policy control | Typical use |
|------|-------------|--------------|-----------|------------|
| **AWS Owned Key** | AWS (shared) | AWS automatic | Not possible (invisible) | Default service encryption |
| **AWS Managed Key** (`aws/service`) | AWS (per account) | Automatic every 1 year (mandatory) | Limited | Default for service integrations |
| **Customer Managed Key (CMK)** | Customer | 1 year when enabled | Full control | Policy, audit, and rotation control |
| **Imported Key Material (BYOK)** | Customer (externally generated) | **Not possible** | Full control | Key provenance control, compliance |
| **Custom Key Store (CloudHSM)** | Customer (dedicated HSM) | Possible | Full control | FIPS 140-2 L3, single-tenant |

It is clear if you view the differences among the types as a "spectrum of control." An AWS Owned key isn't even visible to you (it has no key ID), an AWS Managed key is visible but you can barely touch its policy, and a CMK gives you full control over key policy, rotation, deletion, and tags. On the exam, when requirements like "must control the key policy directly," "must control the rotation period," or "must audit key usage with CloudTrail" appear, the answer is almost always a **CMK**.

AWS Managed Keys and Customer Managed Keys have different cost structures. An AWS Managed Key has no monthly fee and costs only API calls. A CMK costs a **$1 per month** storage fee per key + API call costs. So a multi-tenancy design that creates "a separate CMK for each of tens of thousands of tenants" becomes a cost bomb. In this case the standard pattern is to separate logically with **one CMK + a per-tenant DEK** (envelope encryption) or **Encryption Context**. When the SAP exam shows "thousands of tenants isolation + cost," "a CMK per tenant" is a trap, and a shared CMK + context separation is often the answer.

(Hypothetical example) A fintech received the regulatory requirement that "we generate the key material, and AWS must never keep it permanently." The solution was **BYOK (Imported Key Material)**: they generated the key in their own on-premises HSM and imported it into KMS. The trade-offs were clear. Advantage: they fully control the key's provenance, and if you set an expiration date on the imported key, KMS keeps only a cache and deletes it at expiry. Disadvantage: **automatic rotation is impossible**, so at every rotation you must generate and import a new key yourself, and if KMS loses the key (a region outage, etc.), the only recovery is re-importing the original from your own HSM. Lesson: BYOK is a trade that gains control at the cost of operational burden and automatic rotation. On the exam, "externally generated key + expiration setting" is Imported, and if it also demands "automatic rotation," that is a contradiction, so that option is wrong.

## The Permission Model - The Triple Check of Key Policy, IAM, and Grants

KMS permissions are confusing because the permission evaluation order differs from ordinary AWS services. With most services, an IAM Policy alone can allow access. But with KMS, the **Key Policy is the root of all permissions**. The Key Policy attached to each key is the final authority on "who can access this key," and an IAM Policy takes effect only when the Key Policy has explicitly delegated.

Permissions are granted by three mechanisms.

1. **Key Policy** (required, root): a resource-based policy attached to the key itself. The default Key Policy usually contains a line allowing `kms:*` to the account root (`arn:aws:iam::123456789012:root`), and this means "delegating permissions to IAM."
2. **IAM Policy**: a policy attached to the caller (role or user). It takes effect **only if the Key Policy allows IAM delegation**.
3. **Grant**: a temporary, fine-grained, revocable delegation. It is created automatically when an AWS service briefly uses the key on your behalf (for example, when EBS encrypts a volume), and is revoked immediately with `RetireGrant`/`RevokeGrant`.

The key trap is the **misconception that "IAM Policy alone can grant KMS permissions."** If the Key Policy lacks the "delegate to account root" line, then no matter how much you allow `kms:Decrypt` in IAM, it is denied. Conversely, if the Key Policy directly allows a specific role, it works without an IAM policy.

This KMS model implements the **fail-safe defaults** principle of security theory. It is one of the eight security design principles that Saltzer and Schroeder laid out in 1975, saying "access should be based on explicit permission, not on explicit denial (default is deny)." KMS puts a single authority, the Key Policy, in place so that "no IAM administrator can bypass the key owner's intent." This design shines in Cross-Account scenarios: for another account to use my key, (1) my Key Policy must explicitly allow that account, and (2) that account's IAM must grant permissions to its own role. Since **both sides** must allow, even if one account's administrator opens permissions by mistake, it stays safe if the other side is closed (defense in depth).

> ⚠️ **Pitfall**: In a scenario like "make a Lambda function decrypt with KMS," choosing "just give the Lambda execution role `kms:Decrypt` through IAM" is **incomplete (possibly wrong)**. If the Key Policy has no account root delegation, the IAM permission is void. The correct configuration is (1) the Key Policy has a delegation of `Principal: {AWS: "arn:...:root"}` + `Action: kms:*`, and (2) the Lambda role's IAM grants `kms:Decrypt`. In exam options, "IAM alone without modifying the Key Policy" is often a trap.

Choosing **Grant vs modifying the Key Policy** comes down to "change frequency, granularity, and automation." A Key Policy has a 32KB size limit per key, modifying it requires `PutKeyPolicy` permission, and the change is left in the audit log. Writing hundreds of short-lived delegations into the Key Policy quickly exceeds the limit and becomes unmanageable. **Grants** are the mechanism for this: they can be created/revoked programmatically, narrowed to specific operations (`Encrypt` only, etc.), take effect immediately via a `GrantToken` (no policy propagation delay), and are revoked automatically with `RetireGrant` when the work is done. This is why AWS service integrations (EBS, RDS, Redshift, etc.) use Grants internally. On the exam, "a service uses the key temporarily and it is revoked immediately" and "fine-grained temporary delegation" are answered by Grants.

## Key Rotation - The Differences Among Automatic, Manual, and BYOK

Key rotation is a security practice that comes from the premise that "the older a key, the more its exposure risk accumulates." KMS rotation falls into three kinds.

- **Automatic rotation**: when enabled on a symmetric CMK, KMS generates new key material **every 1 year (365 days)**. An important point: **the key ID and ARN stay the same** and only the internal backing key is replaced. So the application doesn't need to change anything, and past data is decrypted automatically with past key versions (KMS keeps every version). Since 2022 the automatic rotation period can be set within a 90-to-2560-day range.
- **Manual rotation**: create a completely new key and **move the alias to the new key**. The key ID changes, so past data is encrypted with the old key and new data with the new key. It is used where automatic rotation isn't available, such as BYOK or asymmetric keys.
- **Imported Key (BYOK)**: automatic rotation is **not possible**. To rotate, you must create new key material and import it again.

The reason the automatic rotation design of "same key ID, only the backing key replaced" is operationally decisive ties into envelope encryption. The data itself is encrypted with a DEK, and the DEK is wrapped by the CMK. Even when the CMK rotates, the "encrypted DEK" made in the past is decrypted with the past CMK version (KMS keeps all versions), and only newly created DEKs are wrapped by the new CMK version. That is, the master key rotates **without re-encrypting the data**. This is why key rotation can be nearly zero-downtime and zero-cost even at petabyte scale.

> ⚠️ **Pitfall**: "Is key deletion immediate?" - **No.** KMS key deletion (`ScheduleKeyDeletion`) enforces a waiting period (PendingDeletion) of a minimum of **7 days to a maximum of 30 days**. During this period the key is disabled but can be recovered (`CancelKeyDeletion`). The reason: deleting a key makes **all data encrypted with that key permanently unrecoverable**, so it is a forced grace period to prevent mistakes. On the exam, "immediate key deletion" is impossible, and this 7-30 day grace period is the answer point.

## Multi-Region Key - A Game Changer for Cross-Region DR

A default KMS key is **Region-bound**. To decrypt in ap-northeast-2 data encrypted with a key made in us-east-1, you had to either call us-east-1 KMS each time (Cross-Region latency and dependency) or re-encrypt the data. **Multi-Region Key (MRK)**, launched in 2021, solves this problem.

An MRK **replicates** the same key material across multiple Regions. When you create a Primary key and create a Replica in another Region with `replicate-key`, the two keys share the same key material. The key point: **the key ID is the same** (the `mrk-` prefix + the same suffix). So ciphertext encrypted in us-east-1 can be **decrypted directly with the Replica key in ap-northeast-2 without a separate call**. In DR scenarios, after copying RDS snapshots and S3 objects to another Region, you can decrypt immediately.

Each Region's MRK has **independent Key Policy, Grants, and rotation state**. That is, key material is shared but permissions are managed separately per Region (meeting data sovereignty and per-Region access control requirements).

```
[us-east-1: MRK Primary]  ──encrypt──▶  ciphertext
        │ replicate-key
        ▼
[ap-northeast-2: MRK Replica]  ──decrypt directly──▶  plaintext
   (No Cross-Region KMS call needed, same key ID)
```

MRK invites the temptation of "why not make every key multi-Region," but AWS recommends **single-Region keys by default**. The reason: because MRK replicates key material across multiple Regions, the **attack surface widens** and the complexity of key synchronization between Regions is added. Also, once created as an MRK it can't be turned back into a single-Region key. So MRK should be used selectively only for "data that genuinely needs Cross-Region decryption" (DR targets, globally replicated data). On the exam, "Cross-Region DR + decrypt with the same key" is MRK, and simple single-Region encryption is an ordinary CMK.

> 🎯 **Scenario**: "Copy an encrypted RDS snapshot from us-east-1 to ap-northeast-2 to build a DR standby environment, and on failure restore immediately without extra KMS calls or re-encryption. Also, key access permissions in the two Regions must be controlled differently." → **Multi-Region Key**. Encrypt the snapshot with the Primary (us-east-1) and create a Replica (ap-northeast-2); after copying the snapshot you can decrypt and restore directly with the Replica key. Separate per-Region Key Policies keep access control separate too. An ordinary CMK is Region-bound, so Cross-Region decryption needs extra calls, and BYOK has no automatic rotation and no replication mechanism.

## CloudHSM and Custom Key Store - When FIPS 140-2 Level 3 Is Needed

KMS's multi-tenant HSMs meet **FIPS 140-2 Level 2 (some validated at Level 3)**. But some regulations (finance, government) require a **single-tenant dedicated HSM + FIPS 140-2 Level 3**. In that case you use **CloudHSM** (a dedicated HSM cluster), or connect a CloudHSM cluster as KMS's backend using KMS's **Custom Key Store** feature.

| Item | KMS (default) | CloudHSM |
|------|-----------|----------|
| Tenancy | Multi-tenant | Single-tenant dedicated |
| FIPS 140-2 | Level 2/3 | **Level 3** |
| Key control | AWS-managed API | Customer directly controls the HSM |
| Additional uses | Encrypt/decrypt | SSL offload, Oracle TDE, custom cryptographic operations |
| Operational burden | 0 (fully managed) | Manage cluster, users, and backups yourself |

Custom Key Store combines "KMS's convenient API + CloudHSM's single-tenant isolation": you call keys through the KMS API, but the actual key material exists only inside your dedicated CloudHSM cluster.

(Hypothetical example) A payments company was told by PCI DSS and its national financial regulation that "encryption keys must be generated and stored only in a single-tenant HSM, FIPS 140-2 Level 3 certification required." Pure KMS, being multi-tenant, fell short of the requirement. The solution was a **KMS Custom Key Store + CloudHSM cluster**: the development team kept using the familiar KMS API (`Encrypt`/`Decrypt`) as is, while the actual keys existed only inside the dedicated CloudHSM. Trade-off: the operational burden of a CloudHSM cluster (billed hourly, multi-AZ HA configuration, managing users and backups yourself) was added. Lesson: choose CloudHSM only when there is an explicit compliance requirement for "single-tenant + FIPS L3"; without that requirement, KMS's zero operational burden is almost always better.

## Wrapping Up

KMS solves the "key that protects the key" problem with **envelope encryption (the master key never leaves the HSM, and a fast DEK encrypts the data) + a triple permission check (Key Policy root + IAM delegation + temporary Grants) + multi-Region replication (DR)**. The master key (CMK) is never exposed in plaintext, data is quickly encrypted locally with a DEK, and key rotation happens without re-encrypting data.

SAP exam mapping: (1) "control key policy, rotation, and audit directly" → **CMK**, (2) "externally generated key + expiration + automatic rotation not possible" → **Imported (BYOK)**, (3) "Cross-Region same-key decryption + DR" → **MRK**, (4) "single-tenant + FIPS 140-2 L3" → **CloudHSM / Custom Key Store**, (5) "KMS permissions via IAM alone" → wrong (Key Policy delegation required), (6) "a service's temporary, revocable delegation" → **Grant**, (7) "immediate key deletion" → not possible (7-30 days PendingDeletion). The next day we look at the detection trio of Macie, GuardDuty, and Inspector.

---

## 📝 Practice Questions

**Question 1.** You copy an RDS snapshot encrypted in us-east-1 to ap-northeast-2 to build a DR environment. On failure it must restore immediately without extra KMS calls or re-encryption, and you want to control key access permissions differently in the two Regions. What is the best fit?

A) Single-Region CMK + re-encrypt every time on Cross-Region Snapshot Copy

B) Multi-Region Key (Primary + Replica)

C) Import Key Material separately into each of the two Regions

D) AWS Managed Key

**Answer: B**
Explanation: MRK replicates the same key material across multiple Regions and has the same key ID, so ciphertext encrypted in one Region is decrypted directly by the Replica in another Region without a separate call. Separate per-Region Key Policies keep access control separate too. A is inefficient because an ordinary CMK is Region-bound, so Cross-Region decryption needs extra calls and re-encryption. C is unsuitable for DR because the two imported keys become different keys (the same ciphertext can't be decrypted on both sides) and automatic rotation isn't possible either. D can't control policy or rotation and is Region-bound. Trap: "Cross-Region same-key decryption + DR" is MRK.

---

**Question 2.** A Lambda function must decrypt data with a KMS CMK. Even though `kms:Decrypt` was granted in the Lambda execution role's IAM, AccessDenied occurs. What is the most likely cause and fix?

A) Lambda cannot call KMS

B) The Key Policy has no IAM delegation to the account root, so the IAM permission is void - add the delegation to the Key Policy

C) A Grant must be created first

D) An SCP is blocking all KMS

**Answer: B**
Explanation: In KMS, the Key Policy is the root of permissions. If the Key Policy lacks an IAM delegation statement such as `Principal: {AWS: account-root}` + `kms:*`, then no matter how much you allow `kms:Decrypt` in IAM, it has no effect. The fix is to state the IAM delegation in the Key Policy or to allow the Lambda role directly in the Key Policy. A is wrong (Lambda can call KMS). C: a Grant is not required (IAM delegation is enough). D is not a typical cause and there is no clue for it. Trap: the classic cause of "I only gave IAM and it's denied" is a missing Key Policy delegation.

---

**Question 3.** Regulation requires generating encryption key material in your own on-premises environment, AWS must not keep the key permanently, and an expiration date must be set on the key. Automatic rotation is not required. What is the best fit?

A) Customer Managed Key (KMS-generated) + automatic rotation

B) Imported Key Material (BYOK)

C) AWS Managed Key

D) Multi-Region Key

**Answer: B**
Explanation: With BYOK (Imported Key Material), key material is generated externally (your own HSM) and imported into KMS, and if you set an expiration date, KMS keeps only a cache and deletes it at expiry. A doesn't fit the "self-generated" requirement because KMS generates the key, and BYOK can't do automatic rotation (the question doesn't need automatic rotation, so BYOK fits). C gives no control. D is unrelated to the key provenance and expiration requirements. Trap: "externally generated + expiration setting" is Imported, but if "automatic rotation required" also appears, that is a contradiction and that option is wrong.

---

**Question 4.** You need FIPS 140-2 Level 3 certified key management in a single-tenant dedicated HSM, while the development team wants to keep using the existing KMS API (`Encrypt`/`Decrypt`) as is. What is the best fit?

A) Pure KMS CMK (multi-tenant)

B) KMS Custom Key Store + CloudHSM cluster

C) Secrets Manager

D) Imported Key Material

**Answer: B**
Explanation: Custom Key Store keeps KMS's familiar API while storing the actual key material only inside the customer's dedicated CloudHSM cluster (single-tenant, FIPS 140-2 Level 3). A is multi-tenant and falls short of the "single-tenant L3" requirement. C is a secret store, not HSM key management. D: even an imported key is stored in KMS's multi-tenant HSM, so it doesn't meet the single-tenant requirement. Trap: "single-tenant + FIPS L3 + keep the KMS API" is Custom Key Store + CloudHSM.

---

**Question 5.** An AWS service (for example, EBS) temporarily uses your CMK to encrypt a volume, and when the work is done that delegation must be revoked immediately. You need a fine-grained temporary delegation. Which mechanism is it?

A) Permanently add the service Principal to the Key Policy

B) Add an IAM Role

C) KMS Grant

D) STS AssumeRole

**Answer: C**
Explanation: A Grant is a temporary, fine-grained delegation that can be created and revoked programmatically, allows only specific operations, and is revoked immediately with `RetireGrant`/`RevokeGrant`. AWS service integrations (EBS, RDS, etc.) use Grants internally. A is a permanent delegation that doesn't fit the "revoke immediately" requirement and bloats the Key Policy. B (IAM Role) is not a mechanism for temporarily revoking KMS permissions. D (STS) issues credentials and is not a KMS key delegation. Trap: "a service's temporary, revocable, fine-grained delegation" is a Grant.

---

**Question 6.** The security team accidentally scheduled deletion of a CMK in production. Several TB of S3 data are encrypted with this key. What happens?

A) The key is deleted immediately and the data is permanently unrecoverable

B) There is a 7-30 day PendingDeletion waiting period, within which the deletion can be canceled

C) Key deletion is impossible

D) The data is automatically re-encrypted with an AWS Managed Key

**Answer: B**
Explanation: KMS key deletion enforces a PendingDeletion waiting period of a minimum of 7 days to a maximum of 30 days, and within it you can recover with `CancelKeyDeletion`. Deleting a key makes all data encrypted with it permanently unrecoverable, so it is a forced grace period to prevent mistakes. A is wrong (no immediate deletion). C is also wrong (deletion after the wait is possible). D: there is no such automatic re-encryption mechanism. Trap: the key point for KMS keys is "no immediate deletion; deletion after a 7-30 day grace period."

---

**Question 7.** KMS's `Encrypt` API accepts only up to 4KB. What is the standard way to efficiently encrypt a multi-GB S3 object with KMS?

A) Split the object into 4KB pieces and call KMS Encrypt millions of times

B) Envelope encryption - encrypt the object locally with the plaintext DEK received from GenerateDataKey, and store only the encrypted DEK together with the object

C) Send the object directly to CloudHSM

D) KMS can't encrypt large objects, so store in plaintext

**Answer: B**
Explanation: In envelope encryption, GenerateDataKey returns a plaintext DEK and an encrypted DEK. You quickly encrypt the large object locally (AES-256) with the plaintext DEK, discard the plaintext DEK immediately, and store only the encrypted DEK with the object. To decrypt, you unwrap the encrypted DEK with KMS to get the plaintext DEK. A is inefficient and expensive because network round trips explode (an anti-pattern). C is not how it works. D is a security violation. Trap: "large data + KMS" is always envelope encryption, and KMS protects only the small DEK with the master key.
