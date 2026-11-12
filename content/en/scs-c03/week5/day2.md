# Day 2 - Envelope Encryption and Data Keys: GenerateDataKey, Encryption Context

Yesterday we said that a KMS key never leaves the HSM. So how do you encrypt a 1 GB file? You cannot send 1 GB to the KMS API to be encrypted - KMS's `Encrypt` API accepts at most 4 KB. What resolves this contradiction is **envelope encryption**. The core idea is "encrypt the data locally with a fast symmetric key, and encrypt *only that data key* with KMS." KMS only has to protect one small key, and the local CPU handles the encryption of the large data.

Envelope encryption is a concept you *must* have at your fingertips for SCS-C03. S3 SSE-KMS, EBS, and RDS encryption all use this mechanism internally, and the exam relentlessly asks "where and in what form is the data key stored?" and "what is the order of the decryption flow?"

## Why 4 KB: Constraints Shape the Design

The fact that KMS's `Encrypt` API stops at 4,096 bytes is not an arbitrary number but a result of the service design. KMS performs all cryptographic operations inside the HSM, and that HSM fleet is shared by countless accounts worldwide. If it accepted data of arbitrary size, plaintext would have to travel back and forth over the network, the HSM would spend time in proportion to the data size, and the throughput of the entire Region would be tied up by one customer's large file. So KMS drew a boundary: "it simply does not accept large data."

This constraint actually forces a better architecture. Because the data is not sent to KMS, plaintext does not travel on the network; encryption is performed on the caller's CPU (AES-NI hardware acceleration) and is much faster; and KMS only has to manage the number of requests, not the bytes per second. It is **a case where a constraint became a security property.**

```
[ If there were no envelope encryption ]
  App ──1GB plaintext──→ network ──→ KMS ──→ 1GB ciphertext ──→ App
  · Plaintext travels both ways over the network  · KMS is the bottleneck  · Wasted bandwidth

[ Envelope encryption ]
  App ──"Please give me one data key" (a few dozen bytes)──→ KMS
  App ←─(plaintext DEK 32B, encrypted DEK about 200B)──── KMS
  App: encrypt 1GB on the local CPU (AES-NI) → discard the plaintext DEK immediately
  · Plaintext data never leaves the app  · KMS load stays constant
```

This hybrid structure is not an invention of KMS but an old standard pattern in cryptography. A TLS handshake agrees on a session key with asymmetric operations and then encrypts the actual records with a symmetric key, and PGP/GPG wraps a session key with the recipient's public key and encrypts the body symmetrically. The common logic is "use expensive, constrained operations *only on the key*, and use cheap, fast operations *on the data*." AWS KMS's envelope encryption is a variant of this pattern in which the "expensive side" is *crossing the HSM boundary* instead of an asymmetric operation.

## The Data Key and GenerateDataKey

The starting point of envelope encryption is the `GenerateDataKey` API. This call returns *two things* at once.

1. **Plaintext data key** — the plaintext AES key used to encrypt the actual data.
2. **Encrypted data key (CiphertextBlob)** — the same data key encrypted with the KMS key.

```bash
aws kms generate-data-key \
  --key-id alias/app-data-key \
  --key-spec AES_256
# Response:
# {
#   "Plaintext": "base64...(plaintext data key)",
#   "CiphertextBlob": "base64...(encrypted data key)",
#   "KeyId": "arn:aws:kms:...:key/abcd-..."
# }
```

The envelope encryption workflow is as follows.

```
[Encryption]
1. Call GenerateDataKey → receive (plaintext key, encrypted key)
2. Encrypt the large data locally with the plaintext data key (fast AES)
3. Immediately wipe the plaintext data key from memory
4. Store the encrypted data + the encrypted data key together

[Decryption]
1. Pass the stored encrypted data key to KMS Decrypt
2. KMS returns the plaintext data key
3. Decrypt the data locally with the plaintext data key
4. Immediately wipe the plaintext data key from memory
```

The security effect of envelope encryption lies in "minimizing the lifetime of the plaintext data key." The plaintext of the data key is *erased from memory right after the encryption operation*, and *only the encrypted data key* is stored on disk next to the data. So even if the disk/storage is stolen, the data key cannot be unwrapped without the KMS key, and the data cannot be decrypted without the data key. If you disable or delete the KMS key, none of the data keys anywhere in the world can be unwrapped, so effectively all the data is neutralized at once (crypto-shredding).

### Storage Layout: What Is Attached Next to the Ciphertext?

The point the exam asks about especially is "*where* is the encrypted data key stored?" The answer is **in the same place as the data, right next to it.** The operational advantage of envelope encryption is that no separate key store is needed.

```
[ The actual composition of one envelope-encrypted object ]

┌─────────────────────────────────────────────────────┐
│  Header / metadata                                   │
│   · Encrypted Data Key (CiphertextBlob)  ← unwrapped only via KMS │
│   · The KMS key ARN used                             │
│   · Encryption algorithm (e.g., AES-256-GCM)         │
│   · IV / Nonce (plaintext, must differ every time)   │
│   · Encryption Context (plaintext, integrity-protected as AAD) │
├─────────────────────────────────────────────────────┤
│  Body (Ciphertext)                                   │
│   · The actual data encrypted locally with the plaintext DEK │
├─────────────────────────────────────────────────────┤
│  Auth Tag (GCM authentication tag)                   │
└─────────────────────────────────────────────────────┘

In S3 SSE-KMS the header above goes into the object metadata,
in EBS into the volume metadata, and in RDS into the storage layer.
In every case, "the encrypted DEK travels with the data."
```

An important property that follows from this structure: **when you copy the ciphertext, the encrypted data key is copied along with it.** So when you copy an S3 object to another bucket or copy an EBS snapshot, the destination side *must be able to access the same KMS key* to read the data. Day 3's cross-account scenario and Day 4's snapshot copy scenario both derive from here.

The `CiphertextBlob` returned by `GenerateDataKey` is not simply "an encrypted 32 bytes." It also contains information pointing to which KMS key wrapped it and a binding to the encryption context. That is why, when decrypting, KMS finds and uses the correct key on its own even if you do not specify `--key-id` (for symmetric keys). Put the other way, **the ciphertext itself knows which key it requires, and it will not unwrap even if you arbitrarily specify a different key.** However, for an asymmetric key's `Decrypt` you must explicitly specify `--key-id` and `--encryption-algorithm` - because asymmetric ciphertext does not contain that metadata.

### Following Along with Real Commands

Envelope encryption is abstract if you look only at the concept, so running it once by hand with just KMS and OpenSSL firmly imprints the structure.

```bash
# ── Encryption ──────────────────────────────────────────
# 1) Obtain a data key (receive plaintext + ciphertext at once)
aws kms generate-data-key \
  --key-id alias/app-data-key \
  --key-spec AES_256 \
  --encryption-context "tenant=acme,purpose=invoice" \
  --output json > dk.json

# 2) Keep the plaintext key only in a shell variable, not in a file (leave nothing on disk)
PLAINTEXT_KEY=$(jq -r .Plaintext dk.json)

# 3) The encrypted data key will be stored next to the data, so keep it as a file
jq -r .CiphertextBlob dk.json | base64 -d > bigfile.dat.key

# 4) Encrypt locally with the plaintext key (the actual data never goes to KMS)
openssl enc -aes-256-cbc -pbkdf2 \
  -in bigfile.dat -out bigfile.dat.enc -pass "pass:$PLAINTEXT_KEY"

# 5) Discard the plaintext key immediately
unset PLAINTEXT_KEY; rm -f dk.json

# ── Decryption ──────────────────────────────────────────
# 6) Present the encrypted data key to KMS (the context must be exactly the same)
PLAINTEXT_KEY=$(aws kms decrypt \
  --ciphertext-blob fileb://bigfile.dat.key \
  --encryption-context "tenant=acme,purpose=invoice" \
  --query Plaintext --output text)

# 7) Decrypt locally, then discard the plaintext key
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in bigfile.dat.enc -out bigfile.dat -pass "pass:$PLAINTEXT_KEY"
unset PLAINTEXT_KEY
```

> ⚠️ **Pitfall**: The most common real-world incident in the flow above is **writing the plaintext data key to disk.** If you save the whole response to a file, as in `aws kms generate-data-key ... > key.json`, the plaintext key remains on disk, and at that moment the premise of envelope encryption collapses. For the same reason, you must not print the plaintext key to logs, debug output, error messages, or CloudWatch Logs. KMS does not log responses (CloudTrail's `responseElements` is `null`), but it cannot stop *the application from leaking it on its own*.

## GenerateDataKey vs GenerateDataKeyWithoutPlaintext

There are two variants, and the exam asks you to distinguish them.

- **`GenerateDataKey`**: returns *both* the plaintext and the ciphertext key. Use it when you must encrypt right now.
- **`GenerateDataKeyWithoutPlaintext`**: returns only the ciphertext key (no plaintext). A deferred pattern: "for now, just create and store the key, and obtain the plaintext later with Decrypt at the time of actual encryption." It reduces plaintext key exposure when the party that generates the key differs from the party that actually encrypts.

Summarizing the whole family of data key APIs in one table makes the choice clear.

| API | Return value | Maximum size | When to use |
|-----|--------------|--------------|-------------|
| `Encrypt` | Ciphertext | Symmetric 4,096B (smaller for asymmetric) | Directly encrypting one small secret |
| `GenerateDataKey` | Plaintext key + ciphertext key | — | When encrypting data right away (the default) |
| `GenerateDataKeyWithoutPlaintext` | Ciphertext key only | — | Key-generating party ≠ encrypting party, pre-issuance |
| `GenerateDataKeyPair` | An asymmetric key pair (plaintext private + ciphertext private + public) | — | When you need signing/asymmetric at the data key level |
| `GenerateDataKeyPairWithoutPlaintext` | Ciphertext private + public | — | Same as above but without exposing the plaintext private key |
| `GenerateRandom` | Random bytes | Up to 1,024B | Plain random values that are not keys (salts, tokens) |
| `ReEncrypt` | Ciphertext wrapped with a new key | The input is KMS ciphertext | When swapping keys **without exposing plaintext** |

`ReEncrypt` tends to be underrated on the exam, but it has great practical value. This API atomically performs "decrypt with the old key → re-encrypt with the new key" inside KMS, so **the plaintext never returns to the caller for even a single moment.** That is why you can entrust it to "an automation principal that moves data keys to a new CMK but has no access permission to the plaintext data." The permission is also split by direction into `kms:ReEncryptFrom` (the source key) and `kms:ReEncryptTo` (the destination key), so you can express "movement only from this key to that key" in policy. A batch job that moves the DEKs of old ciphertext to the new key after manual key rotation (Day 4) is a typical use.

> ⚠️ **Pitfall**: Answer choices that use `GenerateRandom` to generate a data key appear from time to time. If you take a random number and use it directly as a key, it becomes a *plaintext key not wrapped by KMS*, so the structure of envelope encryption itself does not hold (an additional round trip to wrap that key again with `Encrypt` would be needed). When you need a data key, `GenerateDataKey` is the correct answer, and `GenerateRandom` is used for random values that are *not keys*, such as salts, nonces, and session tokens.

## Encryption Context: Additional Authenticated Data

The encryption context is a *key-value pair* attached to a KMS cryptographic operation, and it plays the role of **AAD (Additional Authenticated Data)**. It is not encrypted (it is recorded in plaintext in CloudTrail), but its *integrity is guaranteed*, so decryption fails unless you present *exactly the same* context when decrypting.

```bash
# Specify the context when encrypting
aws kms encrypt \
  --key-id alias/app-data-key \
  --plaintext fileb://secret.txt \
  --encryption-context "purpose=invoice,tenant=acme"

# The same context is required when decrypting
aws kms decrypt \
  --ciphertext-blob fileb://encrypted \
  --encryption-context "purpose=invoice,tenant=acme"
# If the context differs, InvalidCiphertextException
```

Two security uses of the encryption context:

1. **Integrity binding**: ties the ciphertext to a particular context (for example, a specific tenant or a specific file ID). An attacker cannot reuse the ciphertext in a different context.
2. **Fine-grained permission control**: with the `kms:EncryptionContext:key-name` condition in a key policy/IAM, you can enforce "allow decryption only for this context."

```json
{
  "Effect": "Allow",
  "Action": "kms:Decrypt",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "kms:EncryptionContext:tenant": "acme"
    }
  }
}
```

The encryption context is *not encrypted*. If you put a password or PII in the context, it remains in plaintext in CloudTrail logs. Put only identifiers and contextual information (a tenant ID, a file path) in the context, never secrets.

S3 SSE-KMS automatically uses the bucket ARN and the object key as the per-object encryption context. Because of this, even if the same data key were reused for another object, the context would differ and cross-decryption would be blocked. The "decryption fails if the encryption context differs" pattern appears on the exam.

The reason the encryption context is named "AAD" comes from the family of cipher modes called AEAD (Authenticated Encryption with Associated Data). AES-GCM, defined in NIST SP 800-38D, is the representative example, and this mode feeds both the *encrypted body* and the *unencrypted additional data* into the authentication tag computation. So if you change even one character of the additional data, tag verification fails and decryption is refused. The property of "data that is not hidden but also cannot be altered" comes from here. A concept created to protect packet headers (which must be plaintext because routing needs them, but must not be forged) is used in KMS to pin down "which tenant's and which object's ciphertext this is."

### Context Matching Rules

There are several detailed rules that the exam digs into.

- **The set of key-value pairs must be exactly the same.** If even one is missing or added, it fails.
- **Order does not matter.** `{a:1, b:2}` and `{b:2, a:1}` are the same context.
- **Both keys and values are case-sensitive.** `Tenant=acme` and `tenant=acme` are different contexts.
- **You cannot use an encryption context** with encryption/decryption by an asymmetric key. This is because AAD is a concept of symmetric (AEAD) operations.

In policy, besides comparing values, you can also "enforce the use of the context itself."

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowDecryptOnlyForOwnTenant",
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-...",
      "Condition": {
        "StringEquals": { "kms:EncryptionContext:tenant": "acme" }
      }
    },
    {
      "Sid": "DenyAnyCallWithoutTenantContext",
      "Effect": "Deny",
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "*",
      "Condition": {
        "Null": { "kms:EncryptionContext:tenant": "true" }
      }
    }
  ]
}
```

The first block is "allow only for the acme tenant context," and the second block is "unconditionally deny any call that has no `tenant` context at all." Without the second block, a developer who encrypts while forgetting the context passes silently, and the ciphertext created that way sits outside tenant isolation. **Applying a condition and enforcing the existence of the condition are different things** - a distinction SCS loves.

> 🎯 **Scenario**: "We want to encrypt the data of multiple tenants with a single KMS key, but it must be structurally impossible for tenant A's workload to decrypt tenant B's ciphertext through an accident or a bug. Creating a KMS key per tenant is infeasible for management and cost because there would be thousands of keys." → A single CMK + **`tenant=<id>` in the encryption context** + fix the `kms:EncryptionContext:tenant` condition in each tenant role's IAM to its own tenant value. Add the `Null`-condition Deny above to shut down missing contexts. This design achieves logical isolation with one key, so its cost and operational burden are much lower than "one key per tenant." On the exam, when the condition "thousands of tenants" is attached, the correct direction is context separation, not key separation.

Conversely, if "*cryptographic* isolation per tenant and individual crypto-shredding (immediately destroying only a specific tenant's data) are required," the context alone is not enough. Context isolation is *logical isolation enforced by policy*, so an administrator who can use the key can unwrap everything by changing the context. If there is a requirement that "if one tenant is deleted, that data must immediately become undecryptable," a key per tenant is the correct answer. You have to read the requirement sentence while distinguishing the *level of isolation* from the *unit of destruction*.

## S3 Bucket Key: Optimizing KMS Call Costs

In S3 SSE-KMS, calling `GenerateDataKey`/`Decrypt` for every object makes KMS API cost and request limits a burden. When you turn on **S3 Bucket Key**, S3 obtains a short-lived bucket key at the bucket level and uses it to derive the data keys of many objects locally. KMS API calls drop by up to 99%, easing cost and throttling.

> 🎯 **Scenario**: "We use SSE-KMS, but as the number of objects explodes, KMS `kms.amazonaws.com` throttling (`ThrottlingException`) and cost are spiking." → Enable S3 Bucket Key. It is a pattern that adds one more layer to the envelope encryption hierarchy to reduce the number of KMS calls.

```
[ Without a Bucket Key — a KMS round trip per object ]
  PUT obj1 → S3 → KMS GenerateDataKey (call 1)
  PUT obj2 → S3 → KMS GenerateDataKey (call 2)
  PUT obj3 → S3 → KMS GenerateDataKey (call 3)   ... number of objects = number of calls

[ With a Bucket Key — reuse a bucket-level key briefly ]
  PUT obj1 → S3 → KMS GenerateDataKey (call 1) → obtain a bucket key
  PUT obj2 → S3 → derive locally from the bucket key (no KMS call)
  PUT obj3 → S3 → derive locally from the bucket key (no KMS call)
        ...  KMS is called again only after the bucket key's validity period expires
```

A Bucket Key is not a free optimization but a choice that *trades audit resolution for cost.* When you turn on a Bucket Key, the encryption context of requests going to KMS becomes **at the bucket ARN level** rather than the object ARN level, and CloudTrail's KMS events are also left only when a new bucket key is obtained, not for every object. In other words, the control that tracked "which object was decrypted and when" through KMS logs becomes weaker. If object-level access tracking is a regulatory requirement, you must secure that visibility separately with S3 server access logs or CloudTrail data events (S3 object level). On the exam, when the constraint "object-level KMS audit logs are absolutely required" is attached, a Bucket Key is not the answer.

A Bucket Key can **conflict with designs that put a `kms:EncryptionContext:aws:s3:arn` condition per object key path in the bucket policy or IAM.** This is because the context changes to the bucket ARN, so object-path-based conditions no longer match. It is the typical cause of the symptom "I turned on the Bucket Key and suddenly got AccessDenied." Before enabling it, you must first check the context conditions in the key policy and bucket policy.

## Reading the Envelope Encryption Flow in CloudTrail

How envelope encryption actually runs can be confirmed through two pairs of CloudTrail events. The ability to read this pair is used directly in SCS investigation questions.

```json
// ① When storing an object — S3 obtains a data key on the user's behalf
{
  "eventName": "GenerateDataKey",
  "eventSource": "kms.amazonaws.com",
  "userIdentity": { "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc" },
  "sourceIPAddress": "s3.amazonaws.com",
  "requestParameters": {
    "encryptionContext": {
      "aws:s3:arn": "arn:aws:s3:::reports-bucket/2026/03/invoice-001.pdf"
    },
    "keySpec": "AES_256",
    "keyId": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-..."
  }
}

// ② When reading an object — S3 asks for the encrypted data key to be unwrapped
{
  "eventName": "Decrypt",
  "eventSource": "kms.amazonaws.com",
  "userIdentity": { "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc" },
  "sourceIPAddress": "s3.amazonaws.com",
  "requestParameters": {
    "encryptionContext": {
      "aws:s3:arn": "arn:aws:s3:::reports-bucket/2026/03/invoice-001.pdf"
    }
  }
}
```

The signals an investigator must read here:

| Observation | Interpretation |
|-------------|----------------|
| `sourceIPAddress` is `s3.amazonaws.com` | S3 called on its behalf — the normal SSE-KMS path |
| `sourceIPAddress` is a user IP + `eventName: Decrypt` | Someone called KMS **directly** — a target to block with `kms:ViaService` |
| Thousands of `Decrypt` events in a short time, with object paths in the context sequential | **Signs of mass exfiltration** — a normal app does not create such a pattern |
| No `GenerateDataKey`, only a surge of `Decrypt` | Reading without writing — a backup scan or data collection |
| Repeated `Decrypt` failures (`InvalidCiphertextException`) for the same context | Trying a wrong context/key — either an error or reconnaissance |

> 🎯 **Scenario**: "There are signs that customer data stored in S3 was leaked. Determine which objects were actually opened." → Even if S3 server access logs or CloudTrail data events are turned off, **if SSE-KMS was used, you can identify the opened objects from the `aws:s3:arn` encryption context left in KMS `Decrypt` events.** This is the audit-side rationale for the advice "use SSE-KMS instead of SSE-S3." SSE-S3 has no KMS calls at all, so this trace is not left. However, as mentioned earlier, if a Bucket Key is turned on, the context becomes bucket-level and this traceability decreases.

The 2013 mass account leak at Adobe is a public case showing that "we encrypted it" and "we encrypted it properly" are different. The leaked password data was not plaintext but encrypted, but it was processed in ECB (Electronic Codebook) mode, so **the same plaintext always became the same ciphertext block.** Researchers grouped accounts that used the same password en masse just by comparing ciphertext patterns, without decrypting, and by cross-referencing the password hints leaked alongside, they recovered a considerable number of them. This reveals why envelope encryption stores the IV/nonce and an AEAD mode together. Even if the data key is the same, if the IV differs every time, the same plaintext becomes different ciphertext, and with an authentication tag, tampering with the ciphertext is also detected. The advice to use a proven library such as the AWS Encryption SDK is aimed precisely at this part - eliminating the mistakes that arise from implementing the mode, IV, and tag handling yourself.

## DEK Caching and the AWS Encryption SDK

For application-level encryption, using the **AWS Encryption SDK** is recommended. This SDK implements envelope encryption for you and packages *the encrypted data key and algorithm information* together inside the ciphertext message. It also uses **data key caching (DEK caching)** to reuse the same data key for a short period to reduce KMS calls, while limiting exposure with a cache TTL, a maximum number of uses, and a byte limit.

```
Encryption SDK message = [header (encrypted data key + context)] + [encrypted body]
→ The decrypting side only has to unwrap the header's encrypted data key through KMS
```

If you code envelope encryption yourself, mistakes such as forgetting to wipe the plaintext key or reusing an IV arise. Using proven libraries such as the AWS Encryption SDK, the DynamoDB Encryption Client, and the S3 Encryption Client is the best practice for both the exam and real work. An answer choice such as "implement AES yourself" is usually wrong.

DEK caching is **an explicit trade-off between security and cost**, so you must set three limits together.

| Cache limit | What it restricts | Why it is needed |
|-------------|-------------------|------------------|
| Maximum lifetime (TTL) | How long a data key stays in memory | Limits the damage window, in time, if the key is exposed |
| Maximum number of messages | The number of messages encrypted with one key | Limits the range of data covered by one key |
| Maximum number of bytes | The total bytes encrypted with one key | Avoids cryptographic limits (overuse of the same key) |

DEK caching is not an optimization you turn on unconditionally just because it "reduces KMS calls." A cached plaintext data key is **a plaintext key alive in process memory**, and the longer the cache lifetime, the larger the exposure window through memory dumps, core files, and container image snapshots. Also, because one data key covers multiple messages, the blast radius of "if this key is unwrapped, this much is unwrapped" also grows. In an environment where regulation requires "a unique data key per message," turning caching off is the correct answer.

The AWS Encryption SDK can **wrap one data key with several keyrings at the same time.** For example, if you wrap the same data key with a Seoul Region CMK and a Tokyo Region CMK, and put the two encrypted data keys in the message header, you can decrypt with the other Region's key even if one Region is unavailable. If a multi-Region key (Day 1) is the approach of *replicating the same key material across several Regions*, a multi-keyring is the approach of *wrapping the same DEK several times with different keys.* The former is used in the integrated encryption of AWS services (S3, EBS), and the latter is more flexible in application-level encryption. If a DR requirement applies to application data, you should be able to think of the latter.

## Crypto-Shredding: Implementing Destruction with Cryptography

The most powerful side effect of envelope encryption is that **you can destroy data without deleting it.** Physically deleting data scattered across petabyte-scale backups, replicas in multiple Regions, and even offline tapes is practically impossible. But if you destroy the one KMS key needed to unwrap that data, every copy simultaneously becomes an unrecoverable lump of bytes.

```
[ Normal state ]
  KMS key ──unwraps──→ encrypted DEK ──unwraps──→ data  ✅ readable

[ After the KMS key is deleted ]
  KMS key (destroyed)  ✗   encrypted DEK (still exists)   data (still exists)
  → There is no way left to unwrap the DEK → the data never opens again
  → Backups, snapshots, and replicas in other Regions are all neutralized at once
```

> 🎯 **Scenario**: "Under a GDPR erasure request, a particular customer's data must be removed from all backups and archives, but the backups are locked with an immutable policy so individual records cannot be deleted." → Design in advance a structure that encrypts with a per-customer (or per-tenant) KMS key, and when an erasure request arrives, destroy that key with `ScheduleKeyDeletion`. The backups themselves remain, but that customer's records cannot be decrypted from any copy. This is crypto-shredding, and it is practically the only design that satisfies immutable backups and the right to erasure at the same time. Note, however, that **this design cannot be introduced after the fact** - for data already encrypted with a shared key, deleting the key kills other customers' data as well. The point is to decide the unit of key separation before the requirement arises.

The price of crypto-shredding is that **it cannot be undone.** That is why KMS enforces a 7-30 day waiting period for deletion and records key use attempts in CloudTrail during that period. On the exam, if the requirement is "neutralize immediately, but it must be recoverable if it was a false positive," the answer is `disable`, not deletion (Day 3), and only when it says "destroy so it is permanently unrecoverable" is it `ScheduleKeyDeletion`. The sentences that distinguish the two requirements are usually hidden in words like *reversible / recoverable / permanently*.

## Summary

Envelope encryption is a two-tier structure that encrypts *data with a local data key and the data key with a KMS key.* KMS's 4 KB limit is not a defect but a design that enforces this structure, and thanks to it plaintext data does not travel on the network and KMS manages only the number of requests. `GenerateDataKey` gives a plaintext/ciphertext key pair, you discard the plaintext key immediately and store the ciphertext key *next to the data* - so when you copy the ciphertext, the key access permission must follow. The encryption context (AAD) ties the ciphertext to a context to guarantee integrity and enables tenant isolation through the `kms:EncryptionContext:*` condition, but because it is not encrypted, it must not hold secrets. And if you destroy the KMS key, crypto-shredding holds: the data keys of every copy are locked at the same time.

---

## 📝 Practice Questions

**Question 1.** An application needs to encrypt multi-GB files with KMS. What is the most appropriate approach?

A) Send the entire file to the `kms:Encrypt` API to be encrypted  
B) Get a data key with `GenerateDataKey`, encrypt the file locally, discard the plaintext data key, and store the encrypted data key together with the file  
C) Split the file into 4 KB pieces and call `kms:Encrypt` on each  
D) Download the KMS key plaintext and use it locally  

**Answer: B**  
Explanation: The KMS `Encrypt` API handles at most 4 KB, so envelope encryption is used for large data. You quickly perform symmetric encryption locally with the plaintext data key obtained from `GenerateDataKey`, discard the plaintext key, and store only the data key encrypted by KMS together with the data. Splitting the file into 4 KB pieces and calling for each is impractical, and the KMS key plaintext cannot be downloaded outside the HSM.

---

**Question 2.** Which statement about the encryption context is most accurate?

A) Context values are encrypted and therefore safe, so a password may be included  
B) The same context must be presented at decryption time, and because the context is not encrypted and is recorded in plaintext in CloudTrail, secrets must not be included  
C) The context is optional and does not affect decryption  
D) The context replaces the data key  

**Answer: B**  
Explanation: The encryption context serves as AAD and its integrity is guaranteed, so decryption fails unless it is exactly identical to the one used at encryption time. However, the value itself is not encrypted and remains in plaintext in CloudTrail, so passwords and PII must not be included; include only contextual identifiers such as a tenant ID. The context does not replace the data key; it is used for permission conditions and integrity binding.

---

**Question 3.** As objects surged in an S3 bucket that uses SSE-KMS, KMS `ThrottlingException` errors and KMS request costs increased significantly. What is the most effective mitigation?

A) Switch the bucket to SSE-S3 to turn off encryption  
B) Enable the S3 Bucket Key to derive data keys at the bucket level, greatly reducing per-object KMS calls  
C) Create a different KMS key for each object  
D) Disable the KMS key  

**Answer: B**  
Explanation: An S3 Bucket Key lets S3 locally derive data keys for many objects from a bucket-level short-lived key, reducing KMS API calls by up to 99% and easing throttling and cost. Switching to SSE-S3 gives up KMS-based control and auditing, a different key per object actually increases calls, and disabling the key makes the data unreadable.

---

**Question 4.** The component that generates keys and the component that performs the actual encryption are separate, and you do not want the plaintext data key to be exposed at key generation time. Which API is appropriate?

A) `GenerateDataKey` (returns the plaintext as well)  
B) `GenerateDataKeyWithoutPlaintext` - receive and store only the ciphertext key, and obtain the plaintext with `Decrypt` at actual encryption time  
C) `Encrypt`  
D) `GenerateRandom`  

**Answer: B**  
Explanation: `GenerateDataKeyWithoutPlaintext` returns only the ciphertext data key, so the plaintext is not exposed at key generation time. It suits a deferred pattern in which the entity that actually performs encryption later obtains the plaintext key with `Decrypt` and uses it. `GenerateDataKey` returns the plaintext immediately, `Encrypt` is for directly encrypting small data, and `GenerateRandom` simply generates random numbers, which differs from the envelope pattern.

---
