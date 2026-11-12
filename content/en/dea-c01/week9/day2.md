# Day 2 - Encryption: KMS and Service-Specific Encryption

Data must be protected both at rest and in transit. At the heart of AWS encryption is **KMS (Key Management Service)**, and data services like S3, Redshift, and Glue integrate with KMS to manage keys. Today we organize key types, encryption setup per service, and client-side encryption.

## 1. KMS Basics

KMS is a service creating, managing, and controlling encryption keys.

- **CMK (Customer Master Key) / KMS key**: Root key for data encryption in envelope encryption.
  - **AWS managed key**: Service auto-creates (`aws/s3` etc.), limited policy control.
  - **Customer-managed key (CMK)**: You create, full control of key policy, rotation, access.
  - **AWS owned key**: AWS-owned, invisible to you.
- **Envelope encryption**: KMS key encrypts data key (data key), data key encrypts actual data. Efficient for large data.

```text
KMS CMK ──encrypt──> Data Key ──encrypt──> Actual data (S3 objects etc.)
  (kept in KMS)    (as ciphertext with object)
```

> 💡 **Related Theory**: KMS doesn't encrypt data itself; it manages data keys. Large data is encrypted locally by data key, reducing KMS API calls and latency.

## 2. Encryption at Rest

### S3
- **SSE-S3**: S3-managed keys (AES-256). Simplest, no key control.
- **SSE-KMS**: Uses KMS key. Policy, CloudTrail audit possible. **S3 Bucket Key** reduces KMS call costs.
- **DSSE-KMS**: Dual-layer KMS encryption (compliance requirements).
- **SSE-C**: Customer-provided key. AWS doesn't store key.

### Redshift
- Encrypt at cluster creation with KMS or HSM. Snapshots and node disks encrypted.

### Glue
- Glue Security Configuration encrypts S3 data, CloudWatch logs, job bookmarks with KMS.

```json
{
  "ServerSideEncryptionConfiguration": {
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234"
      },
      "BucketKeyEnabled": true
    }]
  }
}
```

## 3. Encryption in Transit

- **TLS/HTTPS**: S3, Redshift, Glue APIs communicate via TLS. Enforce HTTP blocking with `aws:SecureTransport` condition.
- **Redshift**: `require_ssl` parameter forces SSL connections.

```json
{
  "Effect": "Deny",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::lake-curated", "arn:aws:s3:::lake-curated/*"],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}
```

This bucket policy denies all non-TLS connections.

> 💡 **Related Theory**: Encryption at rest and in transit are separate protection layers. Even SSE-KMS storage encryption is exposed to MITM if HTTP is allowed, so both must be enforced.

## 4. Key Management: Policy, Rotation, Access

- **Key Policy**: KMS key resource-based policy. Defines who uses/manages. Cross-account access specified here.
- **Key Rotation**: Customer-managed keys can enable auto-annual rotation. Past key material retained for decryption.
- **Grants**: Temporary, granular key-use permissions (used in service integration).

```json
{
  "Sid": "AllowGlueRoleUseOfKey",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:role/GlueETLRole" },
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "*"
}
```

## 5. Client-Side Encryption

Client-side encryption means applications encrypt data **before** sending to AWS.

- Implement with **AWS Encryption SDK / S3 Encryption Client**.
- Protect data key with KMS key or own key.
- AWS receives only ciphertext, never sees plaintext (strongest confidentiality).
- Downside: key/decryption responsibility increases client operational complexity.

Server-side (SSE) encrypts after S3 receives; client-side before sending — choose by threat model.

## Exam Points Summary

- Distinguish SSE-S3 (no control) vs SSE-KMS (policy/audit/bucket key) vs SSE-C (customer key) vs client-side.
- Envelope encryption: KMS key → data key → data. Efficient for large scale.
- Transit: TLS, `aws:SecureTransport` to deny HTTP, Redshift `require_ssl`.
- Key policy is central to KMS access (cross-account/service role allowance here).
- S3 Bucket Key reduces SSE-KMS KMS call costs.

## 📝 Practice Questions

**Question 1.** You encrypt a large number of S3 objects with SSE-KMS, and KMS API call cost and throttling have become a problem. What is the most appropriate way to reduce the cost and calls?

A) Switch to SSE-C  
B) Change all objects to SSE-S3  
C) Rotate the KMS key daily  
D) Enable S3 Bucket Key  

**Answer: D**  
Explanation: An S3 Bucket Key uses a bucket-level data key to greatly reduce per-object KMS calls, easing cost and throttling while retaining KMS key control. Switching to SSE-C/SSE-S3 loses key control and auditing, and rotating keys is unrelated to cost.

---

**Question 2.** Regulations require guaranteeing that AWS can never see the plaintext of the data. Which encryption method is the most suitable?

A) SSE-S3  
B) SSE-KMS  
C) Client-side encryption  
D) DSSE-KMS  

**Answer: C**  
Explanation: Client-side encryption encrypts the data before sending it to AWS, so AWS receives only ciphertext and cannot see the plaintext. All SSE variants have AWS encrypt the data after receiving it, so the plaintext is momentarily handled.

---

**Question 3.** S3 data is encrypted with SSE-KMS, but a security review pointed out that plaintext HTTP access is possible. What action protects data in transit?

A) Add a deny condition for `aws:SecureTransport: false` to the bucket policy  
B) Enable KMS key rotation  
C) Enable S3 versioning  
D) Transition to Glacier  

**Answer: A**  
Explanation: Denying requests where `aws:SecureTransport` is false blocks non-TLS plaintext HTTP access and protects data in transit. Key rotation, versioning, and Glacier transition are unrelated to transport-layer protection.

---

**Question 4.** A Glue ETL job cannot read S3 data encrypted with SSE-KMS and gets a permissions error. The Glue job role ARN is not in the key policy. What is the correct fix?

A) Make the S3 bucket public  
B) Re-encrypt the data with SSE-S3  
C) Add an allow for `kms:Decrypt`/`kms:GenerateDataKey` for the Glue role to the KMS key policy  
D) Move the Glue job to another Region  

**Answer: C**  
Explanation: To read SSE-KMS data, the IAM role must be granted decrypt permission in the KMS key policy (or a grant). Making it public is a security violation, re-encrypting with SSE-S3 gives up key control, and moving Regions is unrelated to the permission problem.

---
