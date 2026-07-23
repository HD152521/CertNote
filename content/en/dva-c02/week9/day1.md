# Day 1 - KMS: Handling Encryption Keys Without Touching Them Directly

The first wall a developer learning encryption hits is not the algorithm itself, but the question **"where do I put the key?"**. Encrypting data with AES-256 takes one line of code, but the moment you try to decide where to store that 256-bit key, everything gets complicated. Hardcode it in code and it lives in git forever. Put it in an environment variable and it leaks on process dump. Put it in a file and then who guards that file? The old security industry saying rings true here: "the real problem with encryption is not encryption, but key management." AWS KMS (Key Management Service) solves this "key must never be exported in plaintext" problem with a single design principle.

In the DVA-C02 exam, KMS appears as both a standalone topic and, more importantly, behind the encryption of nearly every storage service — S3, EBS, RDS, DynamoDB, Secrets Manager. Once you understand KMS's operation model — especially **Envelope Encryption** and the three-tier permission structure of key policies — half of the exam's security section solves itself. This article looks at why KMS was designed to keep keys inside, where the 4KB limit comes from, and how envelope encryption actually works to bypass that limit.

## The Problem KMS Set Out to Solve: Keys Must Never Leave the Boundary

The core design decision of KMS is surprisingly simple. **The key material of a CMK (Customer Master Key) can never be extracted as plaintext via any API.** Call `kms:Encrypt` and KMS encrypts internally, returning only the ciphertext. Call `kms:Decrypt` and KMS decrypts internally, returning only the plaintext. The key itself exists only within the HSM (Hardware Security Module) boundary and never crosses it. This is the fundamental difference between KMS and traditional PKI tools where you create a key and download it as a file.

> 💡 **Related theory**: This design implements the cryptographic principle of **key isolation** at cloud scale. FIPS 140-2 defines security levels 1-4 for cryptographic modules, and "keys do not cross the module boundary in plaintext" is a core requirement for Level 2 and above. KMS uses HSM validated to FIPS 140-2 Level 3 (on multi-tenant HSM, in some regions as of 2023). Making keys non-extractable is not sacrificing convenience but a direct consequence of the threat model: "what cannot be extracted cannot be exfiltrated."

> 🔍 **Going deeper**: Intentionally, there is no `GetKeyMaterial` function in the KMS API. The **only** direction to retrieve keys is the opposite one — the Imported Key Material feature only lets you *put* your key *into* KMS. Even then, you must encrypt the key with KMS's public key (obtained from `GetParametersForImport`) before sending it, and once it's in, you cannot get it back out. In BYOK (Bring Your Own Key) scenarios where AWS cannot see the key, this one-directional property is preserved. Users keep the original in an external HSM and can delete the KMS copy at any time — this control is important for compliance customers.

This "keys never escape" constraint becomes KMS's biggest limitation. Since every encryption and decryption must go through the KMS API call, directly encrypting large data via KMS means ① sending data over the network to KMS ② receiving it back. That's why KMS limits the maximum plaintext size that can be directly encrypted to **4KB**.

> ⚠️ **Trap**: "4KB" appears in almost every exam question. The maximum plaintext you can directly encrypt with `kms:Encrypt` is 4,096 bytes. Missing this leads to the trap of choosing direct `kms:Encrypt` for "how to encrypt a 10MB file with KMS." The answer is always envelope encryption. The 4KB limit reflects the design intent that KMS is "a tool to protect small secrets (data keys, passwords, tokens)" not "a tool to directly encrypt large data."

## Envelope Encryption: A Two-Step Trick of Encrypting Keys with Keys

The elegant way to bypass the 4KB limit is to not ask KMS to encrypt the data directly. Instead, **create one disposable Data Encryption Key (DEK), then encrypt large data locally with that key**. KMS's master key (CMK) serves only one purpose: protecting (encrypting) that data key. Keys wrap around keys — hence the term "envelope" encryption.

```python
import boto3, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

kms = boto3.client('kms')

# 1) Request one data key from KMS — receive both plaintext DEK and encrypted DEK simultaneously
resp = kms.generate_data_key(
    KeyId='alias/myapp-key',
    KeySpec='AES_256'
)
plaintext_dek  = resp['Plaintext']        # 32 bytes plaintext key (used for encryption)
encrypted_dek  = resp['CiphertextBlob']   # Key encrypted with CMK (stored with data)

# 2) Encrypt large data locally with the plaintext DEK (no KMS call)
aesgcm = AESGCM(plaintext_dek)
nonce  = os.urandom(12)
ciphertext = aesgcm.encrypt(nonce, b'...10MB of data...', None)

# 3) Immediately discard plaintext DEK from memory — this is the key point
del plaintext_dek

# 4) Storage: [encrypted data + nonce + encrypted DEK]
#    The encrypted DEK can only be decrypted by going through KMS Decrypt
```

Decryption works exactly the reverse. Take the stored encrypted DEK, decrypt it with `kms:Decrypt` to get plaintext DEK briefly, decrypt the data locally with it, and discard the plaintext DEK again.

> 💡 **Related theory**: This pattern did not originate with KMS but comes from the **hybrid encryption** lineage that PGP/GPG has used since 1991. PGP rapidly encrypts email with a symmetric key (session key) and encrypts only that session key with the recipient's RSA public key. Symmetric encryption is fast but key exchange is hard; asymmetric is easy to exchange but slow — hybrid combines them: "large data symmetric, small keys asymmetric (or protected master key)." Envelope encryption applies this idea to cloud key management, and S3 SSE-KMS, EBS volume encryption, and RDS encryption all use this internally.

> 🔍 **Going deeper**: The key insight is that `GenerateDataKey` returns both plaintext DEK and encrypted DEK **in a single call**. If they were separate, you'd need an API to fetch the plaintext DEK, which violates KMS's "never export keys plaintext" rule. AWS resolved this contradiction by deciding "data keys are not CMK" — the DEK is a one-time dependent key generated on the spot by the CMK. Being brief-lived and disposable, the plaintext DEK can briefly escape without breaking CMK isolation. The plaintext DEK must never touch disk because if it does, a plaintext key sits next to encrypted data, rendering encryption meaningless. That's why `GenerateDataKeyWithoutPlaintext` exists as a variant — receive only the encrypted DEK to store ahead, then plaintext-ify only at decryption time.

> 📚 **Case study**: S3 SSE-KMS workloads handling millions of objects hit KMS API limits if calling `GenerateDataKey` per object. AWS's **S3 Bucket Key** (introduced 2020) solved this by adding one more layer to envelope encryption — creating a bucket-level key cached briefly to reduce per-object DEK generation KMS calls by 99%. Stacking the "keys wrap keys" idea one layer deeper, it dramatically lowered KMS costs in bulk-object environments.

## Key Types: Who Owns and Controls the Key

KMS keys split into three types based on who creates and controls the policy. This distinction is a frequent exam trap.

| Type | Cost | Key Policy Control | Auto Rotation | Use Case |
|------|------|--------------|-----------|--------|
| **AWS Owned Key** | Free | Not visible | Managed by AWS | Internal encryption not exposed to customers |
| **AWS Managed Key** (`aws/<service>`) | Free | View only | Automatic (1 year) | S3·RDS default encryption |
| **Customer Managed Key (CMK)** | $1/month + API | Full control | Optional (1 year) | Fine-grained permissions and audit |

> ⚠️ **Trap**: AWS Managed Key auto-rotation period is **365 days (1 year)**. Pre-May 2022 materials say "3 years (1095 days)"; AWS changed policy and now it's 1 year. Old questions may linger in test banks, so pick 1 year when "AWS Managed Key rotation period" appears. CMK auto-rotation also defaults to 1 year, and since 2024, custom periods (90–2560 days) are configurable.

> 🔍 **Going deeper**: Key rotation does not "create a new key" but rather **adds new key material (backing key)**. Rotating a CMK keeps the ARN, Key ID, and alias — only the backing key changes. New encryptions use the new backing key; already-encrypted data auto-decrypts with its original backing key because KMS records which backing key was used in the ciphertext header. Post-rotation, old data does not need re-encryption, and application code seeing only the ARN changes nothing. This answers the common misunderstanding "won't old data become unreadable after rotation?"

## Key Policy + IAM + Grant: KMS's Three-Tier Permission Model

The decisive point where KMS differs from other AWS services is that **key policy is the final authority on permissions**. Most services control access via IAM policy alone, but KMS adds a key policy on the key itself that decides "does this key delegate to IAM permissions at all?"

```json
{
  "Sid": "Enable IAM User Permissions",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
  "Action": "kms:*",
  "Resource": "*"
}
```

**If this statement is absent from the key policy**, even if IAM policy allows `kms:Decrypt`, it has no effect. Allowing the `root` principal means "I grant this account's IAM policy decision-making authority"; without it, only principals explicitly named in the key policy can use the key.

> ⚠️ **Trap**: "I gave `kms:*` in IAM policy but access is denied?" is a frequent exam scenario. Answer: the key policy lacks the IAM delegation statement. The default key policy includes this statement automatically, but writing a custom policy and omitting it results in "key lockout" — even the creator cannot use the key. So the answer is always "both key policy AND IAM policy required," never "IAM policy alone is enough."

The third axis, **Grant**, is a code-based way to grant temporary, fine-grained permissions. Without touching Key Policy or IAM, issue one-off permissions like "this principal can only Decrypt with this key, under this condition."

> 🔍 **Going deeper**: Grant is often used internally when AWS services must use a key on the user's behalf. For example, attaching an encrypted EBS volume to EC2 causes the EC2 service to obtain a temporary Grant for that volume's CMK to decrypt at boot. Users do not need to modify key policies directly; the service creates minimal-permission Grants as needed, then deletes them when done. Grant is an excellent pattern for "least privilege, short-lived" enforcement when Lambda must temporarily use a key on behalf of another user.

## KMS API Limits and Asymmetric Keys

A single CMK's encryption API throughput is limited per region and key type (symmetric keys typically support thousands per second; large regions like us-east-1 go higher). Exceeding the limit raises `ThrottlingException`. This is the second reason envelope encryption reduces KMS calls — reusing and caching DEK avoids API explosion.

KMS supports both symmetric and asymmetric keys.

| Key Spec | Type | Purpose |
|----------|------|--------|
| `SYMMETRIC_DEFAULT` (AES-256) | Symmetric | General encryption (most cases) |
| `RSA_2048` / `RSA_3072` / `RSA_4096` | Asymmetric | Encryption + sign/verify |
| `ECC_NIST_P256` / `P384` | Asymmetric | Sign/verify only (no encryption) |
| `HMAC_*` | Symmetric MAC | Generate/verify message auth code |

> ⚠️ **Trap**: ECC (elliptic curve) keys can **only sign and verify, not encrypt**. ECDSA is a signing algorithm, not an encryption algorithm. If you need asymmetric encryption, pick RSA. Also, asymmetric keys can export the public key via `GetPublicKey`, enabling external systems to encrypt with the public key and KMS to decrypt with the private key — unlike symmetric keys, the public key is not isolation-protected.

## Multi-Region Key and Key Deletion Safeguards

By default, a CMK is region-bound. Data encrypted in ap-northeast-2 cannot be decrypted by KMS in another region. For multi-region workloads (S3 Cross-Region Replication, DynamoDB Global Tables), **Multi-Region Key** maintains the same key ID across replicas in multiple regions, allowing decryption in a different region of data encrypted in one.

Key deletion has strong safeguards. Calling `ScheduleKeyDeletion` does not delete immediately; instead, a **7–30 day waiting period** begins. During this time, the key is `PendingDeletion` (unusable) but can be cancelled via `CancelKeyDeletion`.

> 💡 **Related theory**: Making keys non-immediately-deletable exemplifies a safety-design pattern: "add time delay to irreversible destructive operations." Deleting a CMK permanently makes all data encrypted with it irrecoverable — backups are useless. A 7–30 day grace window provides a window to undo accidents or malice. The same philosophy underlies S3 object version MFA Delete and RDS final snapshot requirements. Note: there is no immediate-deletion option at all.

## CloudHSM and KMS's Boundary: When KMS Isn't Enough

KMS runs on multi-tenant HSM — multiple customers' keys are logically isolated but share physical hardware. Heavily regulated industries (certain financial, government) demand "hardware dedicated to my keys only." Enter CloudHSM.

| Item | KMS | CloudHSM |
|------|-----|----------|
| Management | Fully managed | Customer-managed (cluster operations) |
| Isolation | Multi-tenant (logical) | Single-tenant (dedicated HW) |
| Standard | FIPS 140-2 Level 2–3 | FIPS 140-2 Level 3 |
| API | AWS SDK | PKCS#11, JCE, KSP |
| Cost | $1/key + API | Instance hour billing |

> 🔍 **Going deeper**: KMS can connect CloudHSM as a **custom key store**. This means key material lives in the user's dedicated CloudHSM cluster while remaining accessible via the familiar KMS API — the actual crypto operations happen on dedicated hardware. Combining "KMS convenience + CloudHSM dedicated isolation." If "keys must be on AWS-invisible dedicated HW" in a regulatory context appears on the exam, CloudHSM (or KMS custom key store) is the answer; general "managed key encryption" is KMS.

## Hands-On with CLI

```bash
# 1) Create CMK + assign alias
aws kms create-key --description "myapp prod key"
aws kms create-alias --alias-name alias/myapp-key --target-key-id <key-id>

# 2) Enable auto rotation (1 year)
aws kms enable-key-rotation --key-id alias/myapp-key
aws kms get-key-rotation-status --key-id alias/myapp-key

# 3) Issue data key for envelope encryption
aws kms generate-data-key --key-id alias/myapp-key --key-spec AES_256

# 4) Direct encryption for ≤4KB (e.g., config token)
aws kms encrypt --key-id alias/myapp-key --plaintext fileb://token.bin --output text --query CiphertextBlob

# 5) Schedule key deletion (minimum 7 days' wait)
aws kms schedule-key-deletion --key-id <key-id> --pending-window-in-days 7
```

## Wrapping Up

KMS's problem was "keep keys in plaintext out while making encryption convenient." That constraint created the 4KB limit, and bypassing it with envelope encryption became the standard for all AWS storage encryption. Key policy is the final permission authority; missing the IAM delegation statement locks the key. Key deletion has 7–30 days' grace. ECC handles signing only; RSA handles encryption. These subtle differences are exam trap cores.

Next we look at Secrets Manager and Parameter Store, layering on top of KMS to handle secret storage and even **automatic rotation**.

---

## 📝 연습 문제

**문제 1.** To encrypt a 10MB file with KMS, what is the correct method?

A) Encrypt the file directly with `kms:Encrypt` API
B) Use `GenerateDataKey` to get a data key, then perform envelope encryption locally
C) Split the file into 4KB chunks and call `kms:Encrypt` for each
D) KMS cannot do it; create an AES key directly and store it in the file

**정답: B**

해설: The maximum plaintext that can be directly encrypted with `kms:Encrypt` is **4KB**. 10MB far exceeds this limit, so envelope encryption is required — call `GenerateDataKey` to receive both plaintext DEK and encrypted DEK, encrypt the large data locally with the plaintext DEK, then immediately discard it. C) Splitting into chunks and calling KMS repeatedly causes API limit exhaustion and cost explosion. D) Managing keys manually is an anti-pattern. The 4KB limit reflects KMS's design intent: "tool to protect small secrets," not "tool to directly encrypt large data."

---

**문제 2.** You allowed `kms:Decrypt` in IAM policy on a Customer Managed Key, yet decryption is denied. What is the most likely cause?

A) The CMK is asymmetric
B) The key policy lacks an IAM delegation (root principal Allow) statement
C) Key rotation is disabled
D) The region is not us-east-1

**정답: B**

해설: KMS makes key policy the final authority. Without a `Principal: {"AWS": "...:root"}` IAM delegation statement in the key policy, even `kms:Decrypt` in IAM policy has no effect. This statement is auto-included in the default key policy but easy to omit when writing custom policy — resulting in "key lockout." The correct answer is always "both key policy AND IAM policy required." A) Asymmetric keys can still Decrypt. C) Rotation is unrelated to permissions. D) Region enforcement is CloudFront ACM, not KMS decryption.

---

**문제 3.** What is the auto-rotation period for AWS Managed Key (`aws/s3`, etc.)?

A) 90 days
B) 1 year (365 days)
C) 3 years (1095 days)
D) Does not rotate

**정답: B**

해설: AWS Managed Key auto-rotates every **1 year (365 days)**. Before May 2022, it was 3 years (1095 days), but AWS changed policy. Old study materials or test banks may contain "3 years"; watch for that. CMK default auto-rotation is also 1 year, and since 2024, custom periods (90–2560 days) are available. Rotation adds new backing key material but keeps the ARN, Key ID, and alias, so old data does not need re-encryption post-rotation.

---

**문제 4.** Data must be encrypted with an **asymmetric key**. Which KMS Key Spec fits?

A) `ECC_NIST_P256`
B) `RSA_2048`
C) `HMAC_256`
D) `SYMMETRIC_DEFAULT`

**정답: B**

해설: Asymmetric encryption requires RSA keys. ECC (elliptic curve) keys can **only sign and verify, cannot encrypt** — ECDSA is a signing algorithm. C) HMAC is symmetric MAC for generating/verifying message auth codes. D) SYMMETRIC_DEFAULT is symmetric (AES-256), not "asymmetric." Asymmetric RSA keys allow exporting the public key via `GetPublicKey`, enabling external encryption and KMS-only decryption.

---

**문제 5.** A production CMK that must not be deleted is in a deletion request. How does KMS respond?

A) Immediately and permanently deleted
B) Enters a 7–30 day waiting period; can be cancelled during this time
C) Automatic backup is created; recovery is possible anytime
D) Deleted immediately after IAM admin approval

**정답: B**

해설: `ScheduleKeyDeletion` does not delete immediately but starts a **7–30 day waiting period**. During this window, the key is `PendingDeletion` (unusable) but can be recovered via `CancelKeyDeletion`. Deleting a CMK makes all data encrypted with it permanently irrecoverable (backups are useless), so a waiting period provides a safety window against accidents or malice. No immediate-deletion option exists. C) KMS does not auto-create key backups.

---

**문제 6.** An S3 SSE-KMS workload encrypts millions of objects daily and hits KMS API throttling. What is the best way to cut costs and calls?

A) Switch the CMK to asymmetric
B) Enable S3 Bucket Key
C) Increase key rotation period
D) Split objects into ≤4KB pieces

**정답: B**

해설: S3 Bucket Key adds a bucket-level cache layer to envelope encryption, cutting per-object `GenerateDataKey` KMS calls by up to 99%. The standard pattern for bulk-object KMS cost and throttling relief. A) Asymmetric keys have lower throughput — counterproductive. C) Rotation period is unrelated to call frequency. D) 4KB splitting explodes calls instead. "S3 + KMS cost/limit" appearing means Bucket Key is the answer.

---

**문제 7.** Regulations require storing keys on **dedicated hardware** that AWS cannot access. What is the right choice?

A) KMS Customer Managed Key
B) KMS AWS Managed Key
C) CloudHSM (or KMS custom key store)
D) Secrets Manager

**정답: C**

해설: KMS keys run on multi-tenant HSM (logical isolation). "Dedicated HW + AWS no access" satisfies only CloudHSM (single-tenant, FIPS 140-2 Level 3). Connecting CloudHSM as KMS **custom key store** keeps keys on dedicated HW while maintaining familiar KMS API — meeting both requirements. A·B) KMS keys are multi-tenant, missing the "dedicated" requirement. D) Secrets Manager stores secrets, not HSM-isolated keys.
