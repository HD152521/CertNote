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

## 📝 연습 문제

**문제 1.** 애플리케이션이 수 GB의 파일을 KMS로 암호화하려 한다. 가장 적절한 방식은?

A) 파일 전체를 `kms:Encrypt` API로 보내 암호화받는다  
B) `GenerateDataKey`로 데이터 키를 받아 로컬에서 파일을 암호화하고, 평문 데이터 키는 폐기, 암호화된 데이터 키를 파일과 함께 저장한다  
C) 파일을 4KB 조각으로 나눠 각각 `kms:Encrypt` 호출  
D) KMS key 평문을 다운로드해 로컬에서 사용  

**정답: B**  
해설: KMS의 `Encrypt` API는 최대 4KB만 처리하므로 큰 데이터에는 봉투 암호화를 쓴다. `GenerateDataKey`로 받은 평문 데이터 키로 로컬에서 빠르게 대칭 암호화한 뒤 평문 키를 폐기하고, KMS로 암호화된 데이터 키만 데이터와 함께 저장한다. 파일을 4KB로 쪼개 호출하는 방식은 비현실적이고, KMS key 평문은 HSM 밖으로 다운로드할 수 없다.

---

**문제 2.** 암호화 컨텍스트(encryption context)에 대한 설명으로 가장 정확한 것은?

A) 컨텍스트 값은 암호화되어 안전하므로 비밀번호를 넣어도 된다  
B) 복호화 시 동일한 컨텍스트를 제시해야 하며, 컨텍스트는 암호화되지 않고 CloudTrail에 평문으로 기록되므로 비밀을 넣으면 안 된다  
C) 컨텍스트는 선택사항이며 복호화에 영향을 주지 않는다  
D) 컨텍스트는 데이터 키를 대체한다  

**정답: B**  
해설: 암호화 컨텍스트는 AAD로서 무결성이 보장되어, 복호화 시 암호화 때와 정확히 동일하지 않으면 실패한다. 그러나 값 자체는 암호화되지 않고 CloudTrail에 평문으로 남으므로 비밀번호·PII를 넣으면 안 되고, 테넌트 ID 같은 맥락 식별자만 넣는다. 컨텍스트는 데이터 키를 대체하는 것이 아니라 권한 조건과 무결성 바인딩에 쓰인다.

---

**문제 3.** SSE-KMS를 쓰는 S3 버킷에 객체가 급증하면서 KMS `ThrottlingException`과 KMS 요청 비용이 크게 늘었다. 가장 효과적인 완화책은?

A) 버킷을 SSE-S3로 전환해 암호화를 끈다  
B) S3 Bucket Key를 활성화해 버킷 수준에서 데이터 키를 파생, 객체별 KMS 호출을 대폭 줄인다  
C) 객체마다 다른 KMS 키를 만든다  
D) KMS 키를 비활성화한다  

**정답: B**  
해설: S3 Bucket Key는 S3가 버킷 수준 단기 키로 다수 객체의 데이터 키를 로컬 파생하게 해 KMS API 호출을 최대 99%까지 줄여 throttling과 비용을 완화한다. SSE-S3 전환은 KMS 기반 통제·감사를 포기하는 것이고, 객체마다 다른 키는 호출을 오히려 늘리며, 키 비활성화는 데이터를 못 읽게 만든다.

---

**문제 4.** 키를 생성하는 컴포넌트와 실제 암호화를 수행하는 컴포넌트가 분리되어 있고, 키 생성 시점에는 평문 데이터 키가 노출되지 않기를 원한다. 어떤 API가 적합한가?

A) `GenerateDataKey` (평문 포함 반환)  
B) `GenerateDataKeyWithoutPlaintext` — 암호문 키만 받아 저장하고, 실제 암호화 시점에 `Decrypt`로 평문을 얻는다  
C) `Encrypt`  
D) `GenerateRandom`  

**정답: B**  
해설: `GenerateDataKeyWithoutPlaintext`는 암호문 데이터 키만 반환하므로 키 생성 시점에 평문이 노출되지 않는다. 나중에 실제 암호화 주체가 `Decrypt`로 평문 키를 얻어 사용하는 지연 패턴에 적합하다. `GenerateDataKey`는 평문을 즉시 반환하고, `Encrypt`는 작은 데이터 직접 암호화용, `GenerateRandom`은 단순 난수 생성으로 봉투 패턴과 다르다.

---
