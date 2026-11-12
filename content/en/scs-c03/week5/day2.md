# Day 2 - Envelope Encryption and Data Keys: GenerateDataKey, Encryption Context

Yesterday I said KMS keys never leave the HSM. But what if you need to encrypt a 1GB file? You can't send 1GB to the KMS API for encryption — the KMS `Encrypt` API accepts only up to 4KB. **Envelope encryption** solves this paradox. The core idea: "encrypt data locally with a fast symmetric key, and encrypt *only that data key* with KMS." KMS needs to protect just one small key while the large data encryption happens on the local CPU.

Envelope encryption is a concept you *must* master for SCS-C03. S3 SSE-KMS, EBS, and RDS encryption all use this mechanism internally, and exams persistently ask "where and in what form is the data key stored?" and "what's the decryption sequence?"

## Data Keys and GenerateDataKey

The starting point for envelope encryption is the `GenerateDataKey` API. This call returns *two things* simultaneously.

1. **Plaintext data key** — Plain AES key used to actually encrypt data.
2. **Encrypted data key (CiphertextBlob)** — The same data key encrypted with the KMS key.

```bash
aws kms generate-data-key \
  --key-id alias/app-data-key \
  --key-spec AES_256
# Returns:
# {
#   "Plaintext": "base64...(plaintext data key)",
#   "CiphertextBlob": "base64...(encrypted data key)",
#   "KeyId": "arn:aws:kms:...:key/abcd-..."
# }
```

The envelope encryption workflow is:

```
[Encryption]
1. Call GenerateDataKey → receive (plaintext key, encrypted key)
2. Encrypt large data locally with plaintext data key (fast AES)
3. Immediately wipe plaintext data key from memory
4. Store encrypted data + encrypted data key together

[Decryption]
1. Pass stored encrypted data key to KMS Decrypt
2. KMS returns plaintext data key
3. Decrypt data locally with plaintext data key
4. Immediately wipe plaintext data key from memory
```

> 💡 **Related Theory**: Envelope encryption's security benefit lies in "minimizing plaintext data key lifetime." The data key plaintext is *deleted from memory immediately after encryption*, and only the *encrypted data key* is stored on disk alongside the data. So even if storage is stolen, without the KMS key, the data key cannot be decrypted, and without the data key, the data cannot be decrypted. If you disable or delete the KMS key, all data keys worldwide become unusable instantly — effectively rendering all data immediately useless (crypto-shredding).

## GenerateDataKey vs GenerateDataKeyWithoutPlaintext

Two variants exist, and exams test the distinction.

- **`GenerateDataKey`**: Returns *both* plaintext and ciphertext keys. When you need to encrypt immediately.
- **`GenerateDataKeyWithoutPlaintext`**: Returns only ciphertext key (no plaintext). A deferred pattern: "create and store the key now, get the plaintext later at actual encryption time via Decrypt." Used when the entity creating the key and the one encrypting are different, reducing plaintext key exposure.

## Encryption Context: Additional Authenticated Data

Encryption context is a *key-value pair* attached to KMS encryption operations, functioning as **AAD (Additional Authenticated Data)**. It's not encrypted (recorded plaintext in CloudTrail) but *integrity is guaranteed* — decryption fails if you don't provide *exactly the same* context.

```bash
# Specify context during encryption
aws kms encrypt \
  --key-id alias/app-data-key \
  --plaintext fileb://secret.txt \
  --encryption-context "purpose=invoice,tenant=acme"

# Same context required at decryption
aws kms decrypt \
  --ciphertext-blob fileb://encrypted \
  --encryption-context "purpose=invoice,tenant=acme"
# Different context results in InvalidCiphertextException
```

Two security uses of encryption context:

1. **Integrity binding**: Binds ciphertext to a specific context (e.g., specific tenant, specific file ID). Prevents attackers from reusing ciphertext in different contexts.
2. **Fine-grained permission control**: Key policy/IAM's `kms:EncryptionContext:keyname` condition enforces "decrypt only in this context."

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

> ⚠️ **Trap**: Encryption context is *not encrypted*. Putting passwords or PII in context leaves them plaintext in CloudTrail logs. Use only identifiers and context info (tenant ID, file path), never secrets.

> 💡 **Related Theory**: S3 SSE-KMS automatically uses the bucket ARN and object key as per-object encryption context. So even if the same data key is reused for different objects, the contexts differ and cross-decryption is blocked. The "different context = decryption fails" pattern is an exam staple.

## S3 Bucket Key: KMS Call Cost Optimization

S3 SSE-KMS calling `GenerateDataKey`/`Decrypt` per-object strains KMS API costs and request limits. Enabling **S3 Bucket Key** lets S3 receive a short-lived bucket-level key and locally derive data keys for multiple objects from it. KMS API calls drop up to 99%, easing costs and throttling.

> 🎯 **Scenario**: "Using SSE-KMS, objects explode in number, KMS `kms.amazonaws.com` throttling (`ThrottlingException`) and costs spike." → Enable S3 Bucket Key. Another layer in the envelope encryption hierarchy reduces KMS call frequency.

## DEK Caching and AWS Encryption SDK

Application-level encryption should use **AWS Encryption SDK**. This SDK implements envelope encryption directly and packages the *encrypted data key and algorithm info* inside the ciphertext message. It also offers **data key caching (DEK caching)** to briefly reuse the same data key, reducing KMS calls, while constraining exposure via cache TTL, max uses, and byte limits.

```
Encryption SDK message = [header (encrypted data key + context)] + [encrypted body]
→ Decryption side only needs to decrypt the header's data key with KMS
```

> 💡 **Related Theory**: Hand-coding envelope encryption invites mistakes like forgotten plaintext key wipes or IV reuse. Using verified libraries like AWS Encryption SDK, DynamoDB Encryption Client, or S3 Encryption Client is the exam and production best practice. "Implement AES myself" is almost always wrong.

## One-Line Summary

Envelope encryption is a two-stage structure: *data encrypted locally with data key, data key encrypted with KMS key*. `GenerateDataKey` returns plaintext/ciphertext key pair; the plaintext is immediately discarded and the ciphertext is stored alongside data. Encryption context (AAD) binds ciphertext to context and enables fine-grained permission conditions. Disabling the KMS key locks all data keys, instantly rendering all data useless.

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
