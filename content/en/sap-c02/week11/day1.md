# Day 1 - KMS Deep Dive: Mathematics of Envelope Encryption, Key Policy Authorization Model, Multi-Region Keys

There is a fundamental contradiction that engineers encounter when designing encryption for the first time. "To encrypt data, I need a key, but where do I safely store that key?" Storing the key in plaintext next to the data makes encryption meaningless, and having people memorize keys and input them manually is impractical. This "key protecting the key" problem (key management problem) has been a decades-old challenge in cryptography, and the cloud solves it using **hardware-based root keys + envelope encryption** architecture. AWS KMS (Key Management Service) is exactly this architecture provided as a managed service.

In the SAP-C02 exam, KMS appears as architectural decision questions: "Which key type should I choose?", "What happens when Key Policy and IAM permissions conflict?", "How do I design Cross-Account and Cross-Region decryption?", "If compliance requires FIPS 140-2 Level 3, what should I use?" Today we'll decompose KMS's internal operations down to the mathematics of envelope encryption, clarify the subtle pitfalls in the authorization model, and organize DR design with multi-region keys.

## Envelope Encryption — Why KMS Doesn't Encrypt Your Data Directly

The most common misconception is that "KMS encrypts my data." In fact, KMS does **not** directly encrypt large data (multi-GB S3 objects, EBS volumes). The KMS `Encrypt` API accepts a maximum of 4KB. So how is massive data encrypted? The answer is **envelope encryption**.

The flow works like this. When you call `GenerateDataKey` on KMS to encrypt data, KMS returns two things: (1) **Plaintext Data Key (plaintext DEK)** — an AES-256 key that actually encrypts the data, (2) **Encrypted Data Key (encrypted DEK)** — that DEK wrapped with your KMS master key (CMK). The application rapidly encrypts data locally using the plaintext DEK, then **immediately discards the plaintext DEK from memory**, and stores only the encrypted DEK next to the encrypted data.

```
[Encryption]
GenerateDataKey(CMK) → Plaintext DEK + Encrypted DEK
   ↓
Data ← Encrypt locally with plaintext DEK (AES-256)
   ↓
Store: [Encrypted Data] + [Encrypted DEK]   ← Plaintext DEK discarded immediately

[Decryption]
Encrypted DEK → KMS Decrypt(CMK) → Plaintext DEK
   ↓
Encrypted Data ← Decrypt locally with plaintext DEK
```

The key principle of this architecture is "the master key (CMK) never leaves the KMS hardware." The CMK exists only within the HSM, and when `Encrypt`/`Decrypt` requests arrive, computation happens only inside the HSM with no plaintext keys leaving. Only the DEK that actually encrypts data is briefly exposed in plaintext and then disappears.

> 💡 **Related Theory**: Why split it into two stages? Three reasons work across mathematics and operations. First **performance** — symmetric encryption (AES) is fast, but KMS round trips (network calls) are slow. Sending GB-sized data to KMS in 4KB chunks would require millions of round trips. Receiving the DEK once and encrypting locally reduces network round trips to one. Second **efficiency of key rotation** — even if you replace the master key, you don't need to re-encrypt the data itself; you just need to re-wrap the "encrypted DEK" (re-wrap). You can rotate keys on petabytes of data without re-encrypting. Third **isolation** — the plaintext master key is never exposed to application memory, so even memory dump attacks cannot compromise the master key. This pattern is essentially the same idea as PGP's session key structure and TLS's key exchange — slow and secure asymmetric/master keys protect fast symmetric session keys.

> 🔍 **Deeper**: DEK caching (`aws-encryption-sdk`'s data key caching) takes envelope encryption's performance one step further. Calling `GenerateDataKey` for every object incurs KMS API call costs ($0.03/10,000 calls) and latency. AWS Encryption SDK reuses a single DEK within configured limits of iterations, bytes, and time, reducing KMS calls. However, there is a security trade-off — if you reuse the same DEK too long or too much, the impact scope grows if that DEK is compromised. NIST SP 800-38D recommends capping the data volume encrypted with a single key (GCM mode's nonce reuse risk), and the cache limit is a balance point between that recommendation and cost.

## KMS Key Types — A Spectrum of Ownership and Control

| Type | Key Ownership/Generation | Auto Rotation | Policy Control | Typical Use |
|------|-------------|--------------|-----------|------------|
| **AWS Owned Key** | AWS (shared) | AWS auto | None (invisible) | Service default encryption |
| **AWS Managed Key** (`aws/service`) | AWS (per account) | 1 year auto (enforced) | Limited | Service integration default |
| **Customer Managed Key (CMK)** | Customer | 1 year when enabled | Full control | Policy, audit, rotation control |
| **Imported Key Material (BYOK)** | Customer (externally created) | **Not possible** | Full control | Key source control, compliance |
| **Custom Key Store (CloudHSM)** | Customer (dedicated HSM) | Possible | Full control | FIPS 140-2 L3, single tenant |

The difference between three key types becomes clear when viewed as a "spectrum of control." AWS Owned is invisible to you (no key ID), AWS Managed is visible but you can barely touch policies, and CMK gives you complete control over key policy, rotation, deletion, and tags. In the exam, when you see "must directly control key policy," "must control rotation frequency," or "must audit key usage with CloudTrail," the answer is almost always **CMK**.

> 🔍 **Deeper**: AWS Managed Key and Customer Managed Key have different cost structures. AWS Managed Key has no monthly maintenance fee, only API call costs. CMK costs **$1 per month per key** storage + API call costs. So building multi-tenancy with a separate CMK per tenant becomes a cost bomb. In that case, using **one CMK + per-tenant DEK** (envelope encryption) or **Encryption Context** for logical isolation is the standard pattern. When the SAP exam shows "thousands of tenant isolation + cost," "separate CMK per tenant" is a trap, and "shared CMK + context isolation" is often the correct answer.

> 📚 **Case Study**: A fintech company was required by regulations: "Key material must be generated by us, and AWS must never permanently retain it." The solution was **BYOK (Imported Key Material)** — they generated keys in their on-premises HSM and imported them into KMS. The trade-offs were clear. Advantages: complete control over key origin, and imported keys can be set with an expiration date so KMS only caches them and deletes them on expiration. Disadvantages: **automatic rotation is not possible**, so every rotation requires manually generating and importing a new key, and if KMS loses the key (region failure etc), recovery is only possible by re-importing from the on-premises HSM. Lesson: BYOK is a trade — you gain control but give up operational ease and automatic rotation. In the exam, if you see "externally generated key + expiration setting," it's Imported; if it simultaneously requires "automatic rotation," that's a contradiction so that choice is wrong.

## Authorization Model — Key Policy, IAM, and Grant's Triple Check

KMS permissions are confusing because the authorization evaluation order differs from typical AWS services. Most services grant access with just IAM Policy. However, KMS makes **Key Policy the root of all permissions**. The Key Policy attached to each key is the final authority on "who can access this key," and IAM Policy only takes effect when Key Policy explicitly delegates it.

Permissions are granted through three mechanisms:

1. **Key Policy** (mandatory, root) — a resource-based policy attached to the key itself. The default Key Policy typically includes one line granting `kms:*` to the account root (`arn:aws:iam::123456789012:root`), which means "delegate to IAM."
2. **IAM Policy** — a policy attached to the caller (role, user). **Only effective if Key Policy allows IAM delegation**.
3. **Grant** — temporary, fine-grained, revocable delegation. Automatically created when AWS services use your key on your behalf (e.g., EBS encrypting volumes), and immediately revocable via `RetireGrant`/`RevokeGrant`.

The key pitfall is the misconception that **"IAM Policy alone can grant KMS permissions."** If there is no "delegate to account root" line in Key Policy, then even if IAM allows `kms:Decrypt`, it will be denied. Conversely, if Key Policy directly permits a specific role, it works without IAM policies.

> 💡 **Related Theory**: KMS's model implements the security principle of **fail-safe defaults**. One of the eight security design principles documented by Saltzer and Schroeder in 1975, it states "access must be based on explicit permission, not explicit denial (default is deny)." KMS establishes Key Policy as a single source of authority so "no IAM administrator can bypass the key owner's intent." This design shines in Cross-Account scenarios — for another account to use your key, (1) your Key Policy must explicitly permit that account, and (2) that account's IAM must grant the role permission. **Both** must allow it, so if one account admin accidentally opens permissions, the other blocks it (defense in depth).

> ⚠️ **Trap**: In scenarios like "Lambda function should decrypt with KMS," choosing "just grant `kms:Decrypt` to Lambda's execution role IAM" is **incomplete (possibly wrong answer)**. If Key Policy has no account root delegation, IAM permission is ineffective. The correct setup is (1) Key Policy contains `Principal: {AWS: "arn:...:root"}` + `Action: kms:*` delegation, and (2) Lambda role IAM grants `kms:Decrypt`. The exam often has "IAM-only without Key Policy modification" as a trap.

> 🔍 **Deeper**: The choice between **Grant vs Key Policy modification** depends on "change frequency, granularity, and automation." Key Policy has a 32KB size limit per key, requires `PutKeyPolicy` permission to modify, and changes are audited. With hundreds of short-lived delegations in Key Policy, you'd quickly exceed limits and management becomes impossible. **Grant** is the mechanism for this — it can be created/revoked programmatically, fine-grained to specific operations (`Encrypt` only, etc.), takes immediate effect via `GrantToken` (no policy propagation delay), and automatically revoked when done via `RetireGrant`. AWS service integrations (EBS, RDS, Redshift, etc.) use Grants internally for this reason. In the exam, "service temporarily uses key then immediately revokes" or "fine-grained temporary delegation" means Grant is the answer.

## Key Rotation — Auto, Manual, and BYOK Differences

Key rotation stems from the premise that older keys accumulate exposure risk. KMS rotation has three variants:

- **Automatic Rotation**: When enabled on a symmetric CMK, KMS generates new key material every **1 year (365 days)**. Importantly — **the key ID and ARN remain the same**; only the internal backing key is replaced. So your application needs no changes, and past data automatically decrypts with past key versions (KMS keeps all versions). Starting in 2022, you can set the auto rotation period to anywhere from 90 days to 2560 days.
- **Manual Rotation**: Create a completely new key and **move the alias to the new key**. The key ID changes, so past data encrypts with the old key and new data with the new key. Used when automatic rotation is unavailable, like with BYOK or asymmetric keys.
- **Imported Key (BYOK)**: Automatic rotation **not possible**. To rotate, you must generate new key material and re-import.

> 💡 **Related Theory**: The "key ID stays the same, backing key changes" design of automatic rotation is operationally decisive because it interacts with envelope encryption. Data itself is encrypted with the DEK, and the DEK is wrapped with the CMK. Even when CMK rotates, the "encrypted DEK" from the past is decrypted with the past CMK version (KMS keeps all versions), and newly created DEK is only wrapped with the new CMK version. That is, **data is never re-encrypted**. This is why key rotation is nearly transparent and cost-free even at petabyte scale.

> ⚠️ **Trap**: "Does key deletion happen immediately?" — **No**. KMS key deletion (`ScheduleKeyDeletion`) enforces a minimum **7 days to maximum 30 days** waiting period (PendingDeletion). During this time, the key is inactive but recoverable via `CancelKeyDeletion`. The reason: deleting a key makes **all data encrypted with that key permanently unrecoverable**, so a mandatory grace period prevents mistakes. The exam frequently tests "immediate key deletion" is impossible and that the 7-30 day grace period is the correct answer.

## Multi-Region Key — A Game Changer for Cross-Region DR

By default, KMS keys are **region-specific**. If you encrypt data with a key made in us-east-1 and want to decrypt it in ap-northeast-2, you had to call us-east-1 KMS every time (Cross-Region latency and dependency) or re-encrypt the data. **Multi-Region Key (MRK)**, released in 2021, solves this.

MRK replicates the same key material across multiple regions. You create a Primary key and use `replicate-key` to create a Replica in another region; both keys share identical key material. Critically — **they share the same key ID** (`mrk-` prefix + same suffix). So ciphertext encrypted in us-east-1 can be **directly decrypted by the Replica key in ap-northeast-2 without additional calls**. In DR scenarios, you can copy RDS snapshots and S3 objects to another region and immediately decrypt without extra steps.

Each region's MRK has **independent Key Policy, Grants, and rotation state**. That is, key material is shared but permissions are managed separately per region (satisfying data sovereignty and regional access control requirements).

```
[us-east-1: MRK Primary]  ──Encrypt──▶  ciphertext
        │ replicate-key
        ▼
[ap-northeast-2: MRK Replica]  ──Direct Decryption──▶  Plaintext
   (No Cross-Region KMS call needed, same key ID)
```

> 🔍 **Deeper**: MRK tempts you to "make every key multi-region," but AWS **recommends single-region keys by default**. Reason: MRK replicates key material across regions, so the **attack surface widens**, and key synchronization across regions adds complexity. Also, once created as MRK, you cannot revert to single-region. Therefore, MRK should be selectively used only for data **truly requiring Cross-Region decryption** (DR targets, globally replicated data). In the exam, "Cross-Region DR + decrypt with same key" means MRK; simple single-region encryption means regular CMK.

> 🎯 **Scenario**: "Copy an encrypted RDS snapshot from us-east-1 to ap-northeast-2 to build a DR standby, and on failover, restore immediately without additional KMS calls or re-encrypt. Also, the two regions' key access permissions should be controlled separately." → **Multi-Region Key**. Encrypt the snapshot with Primary (us-east-1) and create Replica (ap-northeast-2), then after copying the snapshot, you can directly decrypt and restore with the Replica key. Region-specific Key Policies keep access control separated. A regular CMK is region-specific so Cross-Region decryption needs extra calls; BYOK cannot be auto-rotated and has no replication mechanism.

## CloudHSM and Custom Key Store — When FIPS 140-2 Level 3 Is Required

KMS's multi-tenant HSM satisfies **FIPS 140-2 Level 2 (some Level 3 validation)**. However, some regulations (finance, government) require **single-tenant dedicated HSM + FIPS 140-2 Level 3**. In this case, you use **CloudHSM** (dedicated HSM cluster) or KMS's **Custom Key Store** feature to connect a CloudHSM cluster as KMS's backend.

| Item | KMS (Default) | CloudHSM |
|------|-----------|----------|
| Tenancy | Multi-tenant | Single-tenant dedicated |
| FIPS 140-2 | Level 2/3 | **Level 3** |
| Key Control | AWS-managed API | Customer directly controls HSM |
| Additional Use | Encrypt/decrypt | SSL offload, Oracle TDE, custom crypto operations |
| Operational Burden | 0 (fully managed) | Cluster, user, backup management required |

Custom Key Store combines "KMS's convenient API + CloudHSM's single-tenant isolation" — you call KMS API for keys, but the actual key material exists only in your dedicated CloudHSM cluster.

> 📚 **Case Study**: A payment company was required by PCI DSS and local financial regulations: "Encryption keys must be generated and stored only in single-tenant HSM, FIPS 140-2 Level 3 certification mandatory." Pure KMS is multi-tenant so it fell short. Solution: **KMS Custom Key Store + CloudHSM cluster** — the development team could use the familiar KMS API (`Encrypt`/`Decrypt`) as usual, while the actual keys existed only in the dedicated CloudHSM. Trade-off: the operational burden of CloudHSM cluster management (hourly billing, multi-AZ HA setup, user and backup management) was added. Lesson: choose CloudHSM only when there's explicit compliance requiring "single-tenant + FIPS L3" — without that requirement, KMS's zero operational burden is almost always better.

## Summary

KMS's core is solving the "key protecting the key" problem with **envelope encryption (master key never leaves HSM, fast DEK encrypts data) + triple authorization check (Key Policy root + IAM delegation + Grant temporary) + multi-region replication (DR)**. Master keys (CMK) are never exposed in plaintext, data is rapidly encrypted locally with DEK, and key rotation happens without data re-encryption.

Common SAP exam mappings: (1) "direct control over key policy, rotation, audit" → **CMK**, (2) "externally generated key + expiration + no auto rotation" → **Imported (BYOK)**, (3) "Cross-Region same-key decryption + DR" → **MRK**, (4) "single-tenant + FIPS 140-2 L3" → **CloudHSM / Custom Key Store**, (5) "KMS permissions via IAM only" → wrong (Key Policy delegation required), (6) "service temporary revocable delegation" → **Grant**, (7) "immediate key deletion" → impossible (7-30 days PendingDeletion). Next day covers the detection trinity of Macie, GuardDuty, and Inspector.

---

## 📝 Practice Questions

**Question 1.** You copy an encrypted RDS snapshot from us-east-1 to ap-northeast-2 to build a DR environment. You must be able to restore immediately during an outage without additional KMS calls or re-encryption, and you want to control key access permissions differently in each Region. Which is the most appropriate?

A) Single-Region CMK + re-encrypt every time during Cross-Region Snapshot Copy

B) Multi-Region Key (Primary + Replica)

C) Import Key Material separately into each of the two Regions

D) AWS Managed Key

**Answer: B**
Explanation: An MRK replicates the same key material across multiple Regions and has the same key ID, so ciphertext encrypted in one Region can be decrypted directly by the Replica in another Region without a separate call. Per-Region Key Policies keep access control separate as well. A is inefficient because a regular CMK is Region-bound, so cross-Region decryption requires additional calls and re-encryption. C is unsuitable for DR because the two imported keys become different keys (the same ciphertext cannot be decrypted on both sides) and automatic rotation does not work. D cannot control policy or rotation and is Region-bound. Trap: "same-key decryption across Regions + DR" is MRK.

---

**Question 2.** A Lambda function must decrypt data with a KMS CMK. Although `kms:Decrypt` was granted in the Lambda execution role's IAM, AccessDenied still occurs. What is the most likely cause and fix?

A) Lambda cannot call KMS

B) The Key Policy lacks IAM delegation to the account root, so the IAM permission is ineffective — add the delegation to the Key Policy

C) A Grant must be created first

D) An SCP is blocking all KMS actions

**Answer: B**
Explanation: In KMS, the Key Policy is the root of permissions. If the Key Policy lacks an IAM delegation statement such as `Principal: {AWS: account-root}` + `kms:*`, allowing `kms:Decrypt` in IAM has no effect no matter how much you grant. The fix is to state the IAM delegation explicitly in the Key Policy or to allow the Lambda role directly in the Key Policy. A is wrong (Lambda can call KMS). C is wrong because a Grant is not required (IAM delegation is enough). D is not a typical cause and there is no clue for it. Trap: the classic cause of "granted only IAM but denied" is a missing Key Policy delegation.

---

**Question 3.** Regulations require that the encryption key material be generated on the company's own premises, that AWS not store the key permanently, and that the key have an expiration date. Automatic rotation is not required. Which is the most appropriate?

A) Customer Managed Key (created by KMS) + automatic rotation

B) Imported Key Material (BYOK)

C) AWS Managed Key

D) Multi-Region Key

**Answer: B**
Explanation: BYOK (Imported Key Material) generates the key material externally (in the company's own HSM) and imports it into KMS; when an expiration date is set, KMS keeps only a cache and deletes it at expiration. A does not meet the "self-generated" requirement because KMS generates the key, and BYOK does not support automatic rotation (since the question does not require automatic rotation, BYOK fits). C gives no control. D is unrelated to the key origin and expiration requirements. Trap: "externally generated + expiration set" is Imported, but if "automatic rotation required" appears alongside it, that is contradictory, so that choice is wrong.

---

**Question 4.** You need FIPS 140-2 Level 3 certified key management on a single-tenant dedicated HSM, while the development team wants to keep using the existing KMS APIs (`Encrypt`/`Decrypt`). Which is the most appropriate?

A) Plain KMS CMK (multi-tenant)

B) KMS Custom Key Store + CloudHSM cluster

C) Secrets Manager

D) Imported Key Material

**Answer: B**
Explanation: A Custom Key Store keeps the familiar KMS API while storing the actual key material only inside the customer's dedicated CloudHSM cluster (single-tenant, FIPS 140-2 Level 3). A is multi-tenant and does not meet the "single-tenant L3" requirement. C is a secret store, not HSM key management. D fails the single-tenant requirement because imported keys are also stored in KMS's multi-tenant HSMs. Trap: "single-tenant + FIPS L3 + keep the KMS API" is Custom Key Store + CloudHSM.

---

**Question 5.** An AWS service (for example, EBS) temporarily uses your CMK to encrypt a volume, and that delegation must be revoked immediately when the operation finishes. You need fine-grained temporary delegation. Which mechanism should you use?

A) Permanently add the service Principal to the Key Policy

B) Add an IAM Role

C) KMS Grant

D) STS AssumeRole

**Answer: C**
Explanation: A Grant is a temporary, fine-grained delegation that can be created and revoked programmatically; it allows only specific operations and is revoked immediately with `RetireGrant`/`RevokeGrant`. AWS service integrations (EBS, RDS, and others) use Grants internally. A is a permanent delegation, so it does not meet the "immediate revocation" requirement and bloats the Key Policy. B (IAM Role) is not a mechanism for temporarily revoking KMS permissions. D (STS) issues credentials and is not KMS key delegation. Trap: "temporary, revocable, fine-grained delegation to a service" is a Grant.

---

**Question 6.** The security team accidentally scheduled deletion of a CMK that is in production. Several TB of S3 data are encrypted with this key. What happens?

A) The key is deleted immediately and the data is permanently unrecoverable

B) There is a 7-30 day PendingDeletion waiting period during which the deletion can be canceled

C) Key deletion is not possible

D) The data is automatically re-encrypted with an AWS Managed Key

**Answer: B**
Explanation: KMS key deletion enforces a PendingDeletion waiting period of a minimum of 7 days and a maximum of 30 days, during which it can be recovered with `CancelKeyDeletion`. Deleting a key makes all data encrypted with it permanently unrecoverable, so this is a mandatory grace period to prevent mistakes. A is wrong (the key is not deleted immediately). C is also wrong (deletion is possible after the waiting period). D is wrong because there is no such automatic re-encryption mechanism. Trap: the key point is that a KMS key "cannot be deleted immediately; it is deleted after a 7-30 day grace period."

---

**Question 7.** The KMS `Encrypt` API accepts at most 4 KB. What is the standard approach for efficiently encrypting an S3 object of several GB with KMS?

A) Split the object into 4 KB pieces and call KMS Encrypt millions of times

B) Envelope encryption — encrypt the object locally with the plaintext DEK returned by GenerateDataKey, and store only the encrypted DEK with the object

C) Send the object directly to CloudHSM

D) Store it in plaintext because KMS cannot encrypt large objects

**Answer: B**
Explanation: In envelope encryption, GenerateDataKey returns a plaintext DEK and an encrypted DEK. You use the plaintext DEK to quickly encrypt the large object locally (AES-256), discard the plaintext DEK immediately, and store only the encrypted DEK with the object. To decrypt, you decrypt the encrypted DEK with KMS to obtain the plaintext DEK. A is inefficient and costly because network round trips explode (an anti-pattern). C is not how it works. D is a security violation. Trap: "large data + KMS" is always envelope encryption, and KMS uses the master key to protect only the small DEK.

---

## 📌 Today's Summary

KMS solves the "key protecting the key" challenge through envelope encryption, where the master key never leaves the hardware and small DEKs protect large data. Key Policy is the root authorization, IAM policy only works when delegated, and Grants enable temporary service integrations. Different key types (CMK, BYOK, MRK, CloudHSM) suit different compliance and operational needs. Multi-Region Keys enable seamless cross-region DR without additional KMS calls. Automatic key rotation (1 year default) keeps the key ID fixed while rotating backing material, and key deletion has a 7-30 day grace period.
