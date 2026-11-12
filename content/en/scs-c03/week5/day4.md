# Day 4 - Encryption at Rest/in Transit: TLS, Service-Specific Encryption, Key Rotation

Encryption splits by data *state*: **encryption at rest** protects data on disk/storage, **encryption in transit** protects data moving on the network. SCS-C03 specifically asks "which service encrypts how at rest?", "how do you *enforce* transit encryption?", and "how does key rotation work?" Today we organize these across services.

## Encryption in Transit: TLS and Enforcement Techniques

TLS is the de facto encryption standard for transit. The key distinction: "supporting TLS" differs from "*refusing* plaintext." Security exams always test **enforcement**.

- **S3**: Bucket policy denies requests with `aws:SecureTransport: false` to block HTTP.

```json
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}
```

- **ALB/CloudFront**: Redirect HTTP listeners to HTTPS; set viewer protocol policy to `redirect-to-https`. Enforce minimum TLS version (e.g., TLS 1.2+) via security policy.
- **RDS**: Enforce SSL connections via parameter group `rds.force_ssl=1` (PostgreSQL) or per-user `REQUIRE SSL` (MySQL). RDS provides a certificate bundle (rds-ca).
- **API Gateway**: Set minimum TLS version and expose only HTTPS.

> 💡 **Related Theory**: `aws:SecureTransport` is a global condition key indicating *whether the request came via TLS*. Using it in a Deny condition in S3 blocks plaintext HTTP access at the source. The exam question "enforce S3 transit encryption" almost always has this bucket policy Deny as the answer — not just "use HTTPS" but "block HTTP."

## Encryption at Rest: Service-Specific Mechanisms

Most AWS storage services use envelope encryption (Day 2) internally for at-rest encryption. The difference is in *key choice* and *defaults*.

### S3
Three SSE options + client-side encryption:
- **SSE-S3** (`AES256`): S3 fully manages keys. No KMS control or audit. Now default for all new objects.
- **SSE-KMS** (`aws:kms`): Envelope encryption with KMS key. Key policy, CloudTrail audit, cross-account control possible. Optimize costs with Bucket Key.
- **SSE-C**: Customer provides key with each request (S3 doesn't store it).
- **CSE**: Encrypt client-side before upload.

### EBS
- Encryption option during volume creation. Enable *default encryption* at account/region level (`Enable EBS encryption by default`).
- Snapshots, restores, and copies of encrypted volumes are *automatically encrypted*.
- Can't directly convert unencrypted to encrypted; use snapshot → encrypted copy → new volume path.

### RDS / Aurora
- Enable encryption only at DB instance creation (cannot toggle after).
- To encrypt existing unencrypted DB, restore from an *encrypted snapshot copy*.
- Encryption covers storage, automatic backups, read replicas, and snapshots.

### Others
- **DynamoDB**: At-rest encryption always on (default AWS owned key), switchable to customer managed key.
- **EFS**: Encryption at rest configured at creation; transit encryption via mount option (`-o tls`).
- **Redshift / SQS / SNS / CloudWatch Logs / Secrets Manager**: All support KMS-based at-rest encryption.

> ⚠️ **Trap**: "Encrypt existing unencrypted RDS instance" → Cannot change the instance directly. Create a snapshot, *copy it to an encrypted version*, then restore from that snapshot. EBS follows the same snapshot path. "Toggle encryption on" is wrong.

> 🎯 **Scenario**: "Ensure all new EBS volumes in the organization are encrypted." → Enable *EBS encryption by default* per region; use Config rules (`ebs-encryption-by-default`, `encrypted-volumes`) to detect and remediate gaps.

## Key Rotation: Automatic vs. Manual

Key rotation *updates key material while maintaining the same logical key ID*. Exams frequently test the behavioral differences between auto and manual.

**Automatic Key Rotation**
- Available on customer managed keys (`enable-key-rotation`). Default *annually* (configurable 90-2560 days).
- KMS generates new key material; *key ID, ARN, and alias stay the same*. Past material is retained so *old data continues to decrypt*.
- No application changes needed. Lowest operational burden.
- **AWS managed keys** rotate *automatically at a fixed interval* (cannot disable or change).
- **Asymmetric keys, EXTERNAL (BYOK), and CloudHSM keys cannot auto-rotate**.

```bash
aws kms enable-key-rotation --key-id alias/app-data-key
aws kms get-key-rotation-status --key-id alias/app-data-key
```

**Manual Rotation**
- Create a new KMS key and *update the alias to point to the new key*. For keys that can't auto-rotate (asymmetric, BYOK) or when you want to change the key ID itself.
- Old data needs decryption with the old key, so maintain both. Alias points to new key, so new encryptions use the new key.

> 💡 **Related Theory**: Auto-rotation changes *only key material* while the key identifier stays the same — transparent. Manual rotation changes the *key itself*, requiring alias updates and retaining the old key. Exam question "rotate asymmetric key" → auto-rotation isn't possible, so manual (new key + alias update) is the answer. "Regular rotation without ops burden" → symmetric CMK auto-rotation.

> ⚠️ **Trap**: Auto-rotation doesn't *re-encrypt existing data*. Old data decrypts with the retained old material; after rotation, only new data encrypts with new material. Watch for wrong answers like "rotation re-encrypts existing data with the new key."

## TLS Certificate Management: ACM

Transit encryption certificates are managed by ACM (AWS Certificate Manager). ACM-issued certificates auto-renew via *DNS validation*, have *non-extractable private keys*, and integrate with CloudFront (us-east-1), ALB, API Gateway, etc. External certificates can be imported but auto-renewal is only for ACM-issued. (Week 4 Day 4 covered ACM regional rules.)

## One-Line Summary

Transit encryption's core is *enforcing* TLS (S3 `aws:SecureTransport` Deny, RDS `force_ssl`, ALB redirect-to-https). At-rest encryption uses service-specific approaches: SSE-KMS, EBS default encryption, RDS creation-time setting; existing unencrypted resources encrypt via snapshot path. Auto-rotation transparently updates key material (symmetric CMK); asymmetric and BYOK use alias-based manual rotation.

---

## 📝 Practice Questions

**Question 1.** You are asked to *enforce encryption in transit* for an S3 bucket. What is the most accurate implementation?

A) Set the bucket default encryption to SSE-KMS  
B) Deny requests in the bucket policy where `aws:SecureTransport` is `false` to block plaintext HTTP access  
C) Put CloudFront in front  
D) Apply SSE-C to the objects  

**Answer: B**  
Explanation: Enforcing encryption in transit means *rejecting* plaintext (HTTP) connections. Denying `aws:SecureTransport: false` in the bucket policy blocks non-TLS requests. SSE-KMS and SSE-C are encryption *at rest* methods and are unrelated to transport, and placing CloudFront in front does not enforce blocking HTTP.

---

**Question 2.** You want to enable encryption at rest for an RDS MySQL instance that has been running without encryption. What is the correct procedure?

A) Turn on the encryption toggle in the instance settings  
B) Create a snapshot, *copy it as an encrypted copy*, and then restore a new instance from that snapshot  
C) Turn on `force_ssl` in the parameter group  
D) Migrate to DynamoDB  

**Answer: B**  
Explanation: RDS encryption can be configured only when the instance is created and cannot be toggled later. An existing unencrypted instance is encrypted via the path of snapshot, encrypted copy, and restore. `force_ssl` enforces encryption *in transit*, not encryption at rest, and migrating to DynamoDB is an unnecessary overreaction.

---

**Question 3.** You want to rotate a symmetric customer managed key regularly without operational burden. Which statement about automatic key rotation is most accurate?

A) Rotation changes the key ID and ARN, so applications must be modified  
B) Only the key material is refreshed while the key ID, ARN, and alias are retained, and the old key material is kept so existing data can still be decrypted  
C) Rotation automatically re-encrypts existing data with the new key  
D) Asymmetric keys are also rotated automatically in the same way  

**Answer: B**  
Explanation: Automatic rotation transparently refreshes only the key material while the key identifier stays the same, so no application change is needed, and the old key material is retained so past data can still be decrypted. It does not re-encrypt existing data with the new key. Automatic rotation is not possible for asymmetric keys or BYOK.

---

**Question 4.** You must replace an asymmetric KMS key, which cannot be rotated automatically, on a regular basis. What is the most appropriate method?

A) Call `enable-key-rotation`  
B) Perform manual rotation: create a new asymmetric key, update the alias to point to the new key, and keep the old key for decrypting past data  
C) Convert the key to symmetric  
D) Do nothing because rotation is impossible  

**Answer: B**  
Explanation: Asymmetric keys do not support KMS automatic rotation, so you perform manual rotation: create a new key, update the alias so that new encryption goes to the new key, and keep the old key to decrypt past data. `enable-key-rotation` does not apply to asymmetric keys, the key type cannot be converted, and from a security standpoint you must not neglect a key that needs regular replacement.

---

**Question 5.** You want to guarantee that all new EBS volumes in the organization are encrypted at rest without exception. What is the most effective combination?

A) Instruct users to check the encryption checkbox  
B) Enable EBS encryption by default in each Region, and detect and remediate unencrypted volumes with AWS Config rules (such as `encrypted-volumes`)  
C) Apply SSE-C to each volume  
D) Control it with an S3 bucket policy  

**Answer: B**  
Explanation: EBS encryption by default per Region automatically encrypts new volumes, and the prevention-plus-detection combination of using Config rules to detect and remediate omissions and drift fits the guarantee requirement. User guidance has no enforcement power, SSE-C is an S3 object encryption method, and S3 bucket policies are unrelated to EBS.

---
