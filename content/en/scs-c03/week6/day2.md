# Day 2 - S3 Data Protection: SSE-S3/SSE-KMS/DSSE, Bucket Keys, Object Lock, Versioning, Block Public Access

S3 is essentially an infinitely scalable object storage and the most common site of data breaches in AWS. "Accidentally misconfigured public S3 bucket" is a regular headline in security news. From a security exam perspective, S3 data protection splits into two axes — **encryption at rest** and **access control and exposure prevention**. Today we address encryption, integrity, and exposure prevention mechanisms; tomorrow (day 3) covers advanced access control policies in depth.

## Encryption at Rest: Three (Effectively Four) Modes

All new objects in S3 are encrypted by default with **SSE-S3 (AES-256)** (default-enabled since 2023). The exam tests the differences and selection criteria among four modes.

| Mode | Key Management | Key Policy Control | Audit (CloudTrail) | Use Case |
|------|-----------------|---------------------|-------------------|----------|
| **SSE-S3** | AWS (internal) | Not possible | No key usage logs | Default encryption, operational simplicity |
| **SSE-KMS** | KMS CMK | Via key policy | Records kms:Decrypt etc. | Key access control and audit needed |
| **DSSE-KMS** | KMS CMK (dual-layer) | Via key policy | Records | Regulatory dual-encryption requirement |
| **SSE-C** | Customer-supplied key | Customer responsibility | Key itself not stored | When not entrusting key to AWS |

```bash
# Upload object with SSE-KMS
aws s3api put-object \
  --bucket my-secure-bucket \
  --key reports/2026-q2.csv \
  --body ./report.csv \
  --server-side-encryption aws:kms \
  --ssekms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234
```

> 💡 **Related Theory**: The decisive difference between SSE-S3 and SSE-KMS is not *encryption itself* but *separation of access control for keys*. SSE-S3 encrypts data, but the person seeing the key and the person seeing the data are both "S3 access holders" — there is no independent key access control. SSE-KMS separates data access (s3:GetObject) and key access (kms:Decrypt) into **two independent authorization gates**. Even with S3 permissions, if the KMS key policy blocks it, decryption fails. This *separation of duties* makes SSE-KMS preferred in regulated environments.

### DSSE-KMS: Why Encrypt Twice?

DSSE-KMS (Dual-layer SSE) encrypts an object with **two independent layers of KMS data keys**. Some regulations like U.S. Department of Defense IL explicitly mandate "two independent encryption layers." There are performance and cost overheads, so unless the regulation explicitly requires it, SSE-KMS is sufficient.

> ⚠️ **Pitfall**: If you see keywords "dual-layer encryption regulation compliance," the answer is DSSE-KMS. For just "strong encryption" or "key control," it's SSE-KMS. Using DSSE everywhere introduces unnecessary cost and latency.

### SSE-C: Bring Your Own Key

SSE-C requires the customer to provide the encryption key in the header of each request, and S3 encrypts/decrypts with that key but **does not store the key** (only the HMAC for validation). Use it only if you absolutely refuse to have AWS manage keys. If you lose the key, data is irrecoverably lost, and HTTPS is mandatory (because the key is transmitted in a header).

## S3 Bucket Key: Mitigating KMS Cost and Throttle

The problem with SSE-KMS is that it calls `GenerateDataKey` / `Decrypt` to KMS per object, stressing KMS request throttle limits and cost. **S3 Bucket Key** retrieves a short-lived bucket-level key from KMS once, then S3 locally derives data keys for multiple objects from that key. This results in reducing KMS API calls by up to 99%.

```bash
aws s3api put-bucket-encryption \
  --bucket my-secure-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234"
      },
      "BucketKeyEnabled": true
    }]
  }'
```

> 🎯 **Scenario**: "High-traffic bucket with SSE-KMS sees KMS ThrottlingException and cost explosion" → the answer is **enable S3 Bucket Key**. The key is reducing the number of KMS calls themselves, not changing key policy or IAM. Remember: DSSE-KMS is not compatible with Bucket Key.

## Object Lock: WORM and Immutability

S3 Object Lock follows the **WORM (Write Once Read Many)** model, blocking **deletion and overwriting** of object versions for a specified period or indefinitely. It is used for ransomware defense, regulatory retention (e.g., SEC 17a-4), and immutable audit log storage. Object Lock works only on **versioning-enabled buckets** and must be **enabled at bucket creation** (existing buckets require a support request).

Two retention modes:
- **Governance Mode**: A special principal with `s3:BypassGovernanceRetention` permission can override retention and delete. Preserves operational flexibility.
- **Compliance Mode**: **Even the root account** cannot delete or modify within the retention period. True immutability. Used for regulatory compliance, but if misconfigured, it cannot be undone, so be careful.

Additionally, **Legal Hold** locks an object until explicitly released, regardless of retention period.

```bash
aws s3api put-object-retention \
  --bucket compliance-logs \
  --key audit/2026.log \
  --retention '{"Mode":"COMPLIANCE","RetainUntilDate":"2033-01-01T00:00:00Z"}'
```

> 💡 **Related Theory**: Object Lock is an implementation of *immutable infrastructure* and *append-only audit logs* in storage. What ransomware attackers target is "encrypt or delete even the backup to prevent recovery," but Compliance-mode Object Lock physically protects data within the retention period even if credentials are compromised (root cannot override it). This goes beyond "permission-based control (IAM)" to "immutability guarantee of the data itself," and is the last layer of defense in depth.

## Versioning: Recovery from Deletion and Overwriting

Versioning preserves previous versions when an object is overwritten or deleted. On deletion, instead of actually removing data, a **delete marker** becomes the latest version — previous versions remain and are recoverable. Once versioning is enabled, it cannot be *disabled*, only *suspended*.

Adding **MFA Delete** requires MFA for permanent version deletion or versioning status changes — preventing a compromised credential alone from deleting versions (only the root account can configure this).

> ⚠️ **Pitfall**: In a versioning-enabled bucket, "I deleted an object but storage costs didn't decrease" — because previous versions remain. You must use **lifecycle policy** to expire noncurrent versions after a certain number of days. Delete markers can also be configured for automatic cleanup.

## Block Public Access (BPA): The Last Safety Belt

Most S3 data breaches are from unintentional public settings. **Block Public Access** is a top-level override that *neutralizes* ACL and bucket policy public settings, with four options:

```
BlockPublicAcls          → Block new public ACL grants
IgnorePublicAcls         → Ignore existing public ACLs
BlockPublicPolicy        → Block public bucket policy application
RestrictPublicBuckets    → Restrict cross-account/anonymous access even if public policy exists
```

You can set it at both account and bucket levels, and **account-level BPA overrides bucket settings** (the stronger one wins). New accounts have all 4 enabled by default.

> 🎯 **Scenario**: "I allowed public read in the bucket policy but anonymous access is still denied" — almost certainly BPA is enabled. BPA is a *pre-evaluation* guard rail, not evaluated within policy logic. Even for truly public static websites, the recommended pattern is to keep BPA enabled and serve the private S3 **via CloudFront + OAC (Origin Access Control)**. Direct public access is the last resort.

> 🔍 **Deeper Dive**: S3 can validate checksums (MD5, CRC32, CRC32C, SHA-1, SHA-256) during upload to ensure object integrity, and can detect in-transit corruption with `Content-MD5` or `x-amz-checksum-*` headers. To enforce HTTPS, add a condition `aws:SecureTransport: false` to Deny in the bucket policy (covered in day 3 with encryption enforcement). All four layers — encryption, integrity, exposure prevention, access control — are needed to complete "S3 data protection."

---

## 📝 Practice Questions

**Question 1.** What is the most fundamental reason to choose SSE-KMS over SSE-S3?

A) SSE-KMS uses a stronger encryption algorithm  
B) It separates data access (s3:GetObject) and key access (kms:Decrypt) into independent authorization gates, so key usage can be controlled and audited separately  
C) SSE-KMS is cheaper  
D) SSE-S3 does not support versioning  

**Answer: B**  
Explanation: Both modes use AES-256, so the algorithm strength is the same. The difference is the separation of key access control. SSE-KMS controls decryption permission through the KMS key policy independently of S3 permissions, and key usage is recorded in CloudTrail for auditing. SSE-KMS incurs additional KMS call costs, so it is not cheaper, and versioning is unrelated to the encryption mode.

---

**Question 2.** A high-traffic bucket that uses SSE-KMS experiences KMS ThrottlingException errors and a cost spike. What is the most appropriate solution?

A) Change the encryption to SSE-S3  
B) Enable the S3 Bucket Key to replace per-object KMS calls with bucket-level key derivation  
C) Disable the KMS key  
D) Switch to DSSE-KMS  

**Answer: B**  
Explanation: The S3 Bucket Key obtains a bucket-level short-lived key from KMS once, and S3 derives per-object data keys locally, reducing KMS API calls by up to 99% - easing both throttling and cost. Switching to SSE-S3 loses key control and auditing, and DSSE-KMS actually increases KMS calls and is not compatible with the Bucket Key. Disabling the key blocks decryption.

---

**Question 3.** A regulation requires that "no one with privileges (including the root account) can delete or modify objects within the retention period." What is the correct configuration?

A) Deny Delete in the bucket policy  
B) Versioning + Object Lock Governance mode  
C) Versioning + Object Lock Compliance mode  
D) Enable only MFA Delete  

**Answer: C**  
Explanation: Object Lock in Compliance mode provides true immutability, where even the root account cannot delete or modify objects within the retention period. Governance mode can be bypassed by those with the `BypassGovernanceRetention` permission, so it falls short of the "no one" requirement. A bucket policy Deny can be bypassed by changing permissions, and with MFA Delete a root user who holds MFA can still delete.

---

**Question 4.** A bucket policy allows anonymous public read (`Principal: *`, `s3:GetObject`), yet access from outside is denied. What is the most likely cause?

A) SSE-KMS encryption  
B) Block Public Access is enabled at the account/bucket level and is nullifying the public policy  
C) Versioning is turned off  
D) An object lock is applied  

**Answer: B**  
Explanation: Block Public Access is a higher-level guardrail that takes precedence over public settings in ACLs and bucket policies. If BPA's `BlockPublicPolicy`/`RestrictPublicBuckets` is on, the public bucket policy is ignored and anonymous access is denied. Encryption, versioning, and object lock are not causes of blocking anonymous reads. The recommended pattern is to keep BPA on and serve private S3 through CloudFront+OAC.

---

**Question 5.** After deleting many objects in a bucket with versioning enabled, storage costs have not decreased. What is the most appropriate action?

A) Disable versioning  
B) Use a lifecycle policy to expire noncurrent versions and clean up expired delete markers after a set number of days  
C) Enable BPA  
D) Apply Object Lock Compliance  

**Answer: B**  
Explanation: In a versioned bucket, a delete does not erase the actual data but adds a delete marker, and the previous versions remain and continue to incur cost. You must expire noncurrent versions with a lifecycle policy and clean up expired delete markers for the storage to actually be reclaimed. Versioning cannot be disabled (it can only be suspended), BPA and Object Lock are unrelated to cost reclamation, and Object Lock in fact prevents deletion.

---
