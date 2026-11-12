# Day 2 - S3 Data Protection: SSE-S3/SSE-KMS/DSSE, Bucket Keys, Object Lock, Versioning, Block Public Access

S3 is effectively an infinitely scalable object store, and it is also the scene of AWS's most common data leak incidents. A "misconfigured public S3 bucket" is the classic cause of security incidents. From the security exam's perspective, S3 data protection splits into two axes: **encryption at rest** and **access control and exposure prevention**. Today we cover encryption, integrity, and exposure prevention mechanisms; tomorrow (day 3) we go deeper into access control policies.

The 2019 Capital One breach shows that "S3 data protection" does not end with encryption alone. The attacker used an SSRF vulnerability in an application to obtain a role's temporary credentials from the EC2 instance metadata (IMDSv1), and used those legitimate credentials to read data from S3. The bucket was not public and the stored data was encrypted, but because the request was *impersonating a principal with legitimate permissions*, encryption stopped nothing. Server-side encryption (SSE) is a control that defends against theft of disks and backup media and against AWS's internal physical layer; it is not a control that blocks authorized API calls. If you cannot make this distinction, you cannot answer the question "the data was encrypted, so why did it leak?" The real lines of defense are four layers: (1) minimizing role permissions, (2) enforcing IMDSv2, (3) restricting who can decrypt through the SSE-KMS key policy, and (4) restricting access paths with VPC endpoint conditions.

## Encryption at Rest: Three (Effectively Four) Modes

Every new object in S3 is encrypted with **SSE-S3 (AES-256)** by default (enabled by default since 2023). The exam asks about the differences between the four modes and the criteria for choosing among them.

| Mode | Key management owner | Key policy control | Audit (CloudTrail) | Use |
|------|-------------|-------------|-----------------|------|
| **SSE-S3** | AWS (managed internally) | Not possible | No key usage log | Default encryption, simple operations |
| **SSE-KMS** | KMS CMK | Possible via key policy | kms:Decrypt etc. recorded | Key access control and audit needed |
| **DSSE-KMS** | KMS CMK (dual) | Possible via key policy | Recorded | Regulatory dual-encryption requirement |
| **SSE-C** | Customer-provided key | Customer's responsibility | Key itself not stored | When you will not entrust the key to AWS |

```bash
# Upload an object with SSE-KMS
aws s3api put-object \
  --bucket my-secure-bucket \
  --key reports/2026-q2.csv \
  --body ./report.csv \
  --server-side-encryption aws:kms \
  --ssekms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234
```

The decisive difference between SSE-S3 and SSE-KMS lies not in the *encryption itself* but in the *separation of access control over the key*. SSE-S3 encrypts the data, but the people who can see the key and the people who can see the data are the same "people with S3 access" - there is no independent control over key access. SSE-KMS separates data access (s3:GetObject) and key access (kms:Decrypt) into **two independent authorization gates**. That is, even with S3 permissions, you cannot decrypt if the KMS key policy blocks it. This *separation of duties* is what makes SSE-KMS preferred in regulated environments.

### Envelope Encryption: What Actually Happens

Saying "we encrypted with SSE-KMS" does not mean the KMS key encrypted the object itself. A KMS CMK never leaves the Region's hardware security modules, so it does not directly encrypt bulk data. What actually happens is **envelope encryption**.

```
[ On PutObject ]
S3 ──GenerateDataKey(CMK)──→ KMS
     ← plaintext data key (DK)  +  DK encrypted by the CMK (EDK)
S3: encrypt the object body with DK → discard DK from memory → store EDK next to the object as metadata

[ On GetObject ]
S3 ──Decrypt(EDK, CMK)──→ KMS      ← kms:Decrypt permission is evaluated here
     ← plaintext DK
S3: decrypt the body with DK → respond → discard DK
```

There are two things to read from this figure. First, **a KMS `Decrypt` call occurs every time an object is read**, which is the cause of the cost and throttling problem covered shortly. Second, decryption authorization happens **in KMS**, not in S3, so even if `s3:GetObject` is allowed, you cannot read if the KMS key policy blocks it. SSE-S3 has no such second gate at all.

KMS key policies have a `kms:ViaService` condition key that can restrict the usage path, such as "this key can be used only through S3." For example, if you set `"kms:ViaService": "s3.ap-northeast-2.amazonaws.com"`, even a principal with `kms:Decrypt` permission cannot call KMS directly to extract data keys, and the key is used only as part of an S3 request. Another frequently used condition is `kms:EncryptionContext:aws:s3:arn`, which allows decryption only for objects in a specific bucket or prefix, drawing a boundary when multiple buckets share one CMK. When "even with SSE-KMS, I want to narrow key usage further" comes up, think of these two condition keys.

### What Happens to Encryption During Replication and Tier Transitions

| Situation | Behavior | Note |
|------|------|--------|
| Cross-Region replication (CRR) | **Re-encrypted** in the destination Region | Requires the destination Region CMK, and the replication role needs `kms:Decrypt` (source) + `kms:GenerateDataKey` (destination) |
| Glacier tier transition | S3 handles re-encryption internally | No user action needed |
| Changing the encryption method of existing objects | Does not change automatically | Must rewrite with `CopyObject` (overwriting itself) or S3 Batch Operations |

> ⚠️ **Trap**: Changing the bucket default encryption to SSE-KMS does **not retroactively re-encrypt existing objects.** Default encryption applies only to *objects that arrive from now on*. To change existing objects too, you must run a Copy job with S3 Batch Operations to rewrite them all. If the exam asks you to "convert millions of already-stored objects to SSE-KMS," the answer is a batch copy, not changing the default encryption setting.

### DSSE-KMS: Why Encrypt Twice

DSSE-KMS (Dual-layer SSE) encrypts an object with **two independent layers of KMS data keys**. Some regulations, such as the US Department of Defense (DoD) IL levels, explicitly require "two independent layers of encryption." Because there is performance and cost overhead, SSE-KMS is sufficient unless a regulatory requirement says otherwise.

> ⚠️ **Trap**: When the keyword "two-layer encryption regulatory compliance" appears, it is DSSE-KMS. If it is just "strong encryption" or "key control," it is SSE-KMS. Using DSSE everywhere creates unnecessary cost and latency.

### SSE-C: Carrying the Key Yourself

With SSE-C, the customer supplies the encryption key as a header on every request, and S3 encrypts/decrypts with that key and then **does not store the key** (only an HMAC of the key is retained for verification). Use it only when you never want to entrust key management to AWS. If you lose the key, the data can never be recovered, and HTTPS is mandatory (since the key is transmitted in a header).

```bash
# SSE-C upload - the key is supplied directly as a header on every request
aws s3api put-object \
  --bucket byok-bucket --key secret.dat --body ./secret.dat \
  --sse-customer-algorithm AES256 \
  --sse-customer-key fileb://./customer-key.bin

# You cannot read it unless you present the same key again
aws s3api get-object \
  --bucket byok-bucket --key secret.dat ./out.dat \
  --sse-customer-algorithm AES256 \
  --sse-customer-key fileb://./customer-key.bin
```

SSE-C satisfies the requirement that "AWS does not hold the key," but at the price that **key management, rotation, backup, and audit are all the customer's responsibility**. Moreover, because it does not go through KMS, no key usage record remains in CloudTrail, and controls such as "allow only a specific key" through a bucket policy are also impossible. Unless the exam has *explicit* wording such as "regulations prevent entrusting the key to AWS," SSE-C is usually a wrong answer. Conversely, if "keys must be managed in an on-premises HSM," look for an SSE-C or KMS External Key Store family of answers.

### Rebuilding the Four Modes by Practical Criteria

| Decision criterion | Answer |
|-----------|------|
| No special requirement, operational simplicity is the top priority | SSE-S3 |
| Key usage needs separate authorization and audit, cross-account | SSE-KMS |
| High traffic makes KMS call cost and throttling a problem | SSE-KMS + **Bucket Key** |
| Regulatory wording of "two independent encryption layers" | DSSE-KMS |
| Explicitly "AWS must not hold the key" | SSE-C |
| Already encrypted on the client before upload | Client-side encryption (S3 Encryption Client) |

## S3 Bucket Keys: Easing KMS Cost and Throttling

The problem with SSE-KMS is that it calls `GenerateDataKey`/`Decrypt` on KMS for every object, pressuring cost and the KMS request throttle limit. An **S3 Bucket Key** obtains a short-lived bucket-level key from KMS once, and S3 derives the data keys for many objects in the bucket locally from that key. As a result, KMS API calls are reduced by up to 99%.

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

> 🎯 **Scenario**: When "KMS ThrottlingException and a cost spike on a high-traffic bucket using SSE-KMS" comes up, the answer is **enable the S3 Bucket Key**. The point is not to change the key policy or IAM but to reduce the number of KMS calls itself. Also remember that DSSE-KMS is not compatible with Bucket Keys.

```
[ Without a Bucket Key ]                  [ With a Bucket Key enabled ]

Object1 → KMS GenerateDataKey             Bucket key (short-lived) ← 1 KMS call
Object2 → KMS GenerateDataKey                 │
Object3 → KMS GenerateDataKey                 ├─ Object1 data key (derived locally by S3)
  ...      (objects = KMS calls)              ├─ Object2 data key
                                              └─ Object3 data key  ...

 → KMS event per object in CloudTrail      → CloudTrail events also drop to bucket-key granularity
 → cost and throttling pressure            → up to 99% fewer calls
```

Bucket Keys come with an audit trade-off. Fewer KMS calls means fewer `Decrypt` events in CloudTrail, and the `resources` field in the log points to the bucket rather than the individual object. That is, the resolution of "who decrypted which object" decreases. If per-object key usage audit is a regulatory requirement, you must check whether it conflicts before enabling a Bucket Key. It is a trade of cost/performance against audit resolution: when the exam mentions "cost and throttling," Bucket Key is the answer, but when it mentions "per-object key usage audit," it is not.

## Object Lock: WORM and Immutability

S3 Object Lock uses the **WORM (Write Once Read Many)** model to **block deletion and overwriting** of object versions for a specified period or indefinitely. It is used for ransomware defense, regulatory retention (SEC 17a-4, etc.), and immutable storage of audit logs. Object Lock works **only on buckets with versioning enabled**, and as a rule it should be **enabled at bucket creation** (existing buckets require a support request).

Two retention modes:
- **Governance mode**: special principals with the `s3:BypassGovernanceRetention` permission can bypass or delete the retention. It leaves operational flexibility.
- **Compliance mode**: **even the root account** cannot delete or modify within the retention period. True immutability. It is used for regulatory compliance, but if misconfigured it cannot be undone, so be careful.

Additionally, **Legal Hold** locks an object until it is explicitly released, regardless of the retention period.

```bash
aws s3api put-object-retention \
  --bucket compliance-logs \
  --key audit/2026.log \
  --retention '{"Mode":"COMPLIANCE","RetainUntilDate":"2033-01-01T00:00:00Z"}'
```

Object Lock is the storage-level implementation of *immutable infrastructure* and *append-only audit logs*. What a ransomware attacker aims for is to "encrypt or delete even the backups to prevent recovery," and Compliance mode Object Lock physically protects data within the retention period even if privileges are stolen (even root). This is "guaranteeing the immutability of the data itself" beyond "permission-based control (IAM)," and it is the last layer of defense in depth.

### Governance vs Compliance vs Legal Hold

| Item | Governance mode | Compliance mode | Legal Hold |
|------|-----------------|-----------------|------------|
| Retention period | Specified per object version | Specified per object version | **No period** (until released) |
| Principals that can bypass | Holders of `s3:BypassGovernanceRetention` | **None** (including the root account) | Released by holders of `s3:PutObjectLegalHold` |
| Shortening the period | Possible (bypass permission needed) | **Not possible** (can only extend) | Not applicable |
| Undoing a mistake | Possible | **Impossible** | Possible |
| Typical use | Internal policy, ransomware mitigation | Statutory retention such as SEC 17a-4 | Litigation response (litigation hold) |

The practical difference between Governance and Compliance is "can you undo a mistake?" If you set Compliance for 7 years, that object stays in the account for 7 years incurring storage cost, and data uploaded by mistake cannot be deleted either. So the practical rule is to **test with Governance, and move only production to Compliance after verification**. Choosing Compliance when the exam did not state that "no one must be able to delete it" is over-engineering.

```bash
# Enable Object Lock at bucket creation (versioning is turned on along with it)
aws s3api create-bucket \
  --bucket compliance-logs --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2 \
  --object-lock-enabled-for-bucket

# Default bucket retention rule - applied automatically to objects uploaded afterward
aws s3api put-object-lock-configuration \
  --bucket compliance-logs \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": { "DefaultRetention": { "Mode": "COMPLIANCE", "Years": 7 } }
  }'

# Place a legal hold on a specific object version
aws s3api put-object-legal-hold \
  --bucket compliance-logs --key audit/2026.log \
  --legal-hold Status=ON
```

### A Practical Layout That Stops Ransomware

The reason Object Lock matters for ransomware response is that attackers try to **delete the backups** before they try to encrypt the data. If the backups are alive, there is no reason to pay a ransom.

```
[ A backup layout that survives even a compromised account ]

  Production account A                   Backup account B (separate credential boundary)
  ┌──────────────┐   cross-account       ┌────────────────────────────┐
  │ Production   │   replication         │ Backup bucket              │
  │ bucket       │ ───────────────────→  │ Versioning ON              │
  │ Versioning ON│                       │ Object Lock COMPLIANCE     │
  └──────────────┘                       │ MFA Delete                 │
                                         │ Account A has no delete    │
        ▲                                │ permission                 │
        │                                └────────────────────────────┘
   Even if the attacker fully takes over account A,
   the retained versions in account B cannot be touched
```

The key is to **separate the credential boundary**. If the backup is inside the same account, an attacker who takes over the account will eventually reach it. Only the combination of a separate account + Object Lock Compliance + versioning makes "the data survives even if permissions collapse completely" hold.

A failure pattern repeatedly pointed out in ransomware incident response reports is "there were backups, but the backups were encrypted or deleted along with everything else." In the cloud, this failure usually occurs in a structure where the backup bucket is in the same account as production and a single administrator role has delete permission on both. AWS designing Object Lock to be enabled only at bucket *creation time* is in the same spirit: if it could be turned on later, an attacker could turn it off and then delete. The strength of a control is determined by "when can it be turned off?"

## Versioning: Recovering from Deletion and Overwrites

Versioning preserves the previous version when an object is overwritten or deleted. On deletion, instead of erasing the actual data, it places a **delete marker** as the latest version; the previous versions remain and can be recovered. Once versioning is turned on, it cannot be *disabled*, only *suspended*.

Adding **MFA Delete** requires MFA for permanently deleting versions or changing the versioning state, so stolen credentials alone cannot delete versions (it can be configured only by the root account).

If "I deleted the object but storage cost did not decrease" in a versioned bucket, it is because previous versions remain. You must expire noncurrent versions after a given number of days with a **lifecycle policy**. Delete markers can also be configured for automatic cleanup.

```json
{
  "Rules": [
    {
      "ID": "expire-noncurrent-and-markers",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 90,
        "NewerNoncurrentVersions": 3
      },
      "Expiration": { "ExpiredObjectDeleteMarker": true },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

`NewerNoncurrentVersions` means "keep the newest N noncurrent versions and expire the older ones." It is a setting that secures recoverability and cost at the same time. `AbortIncompleteMultipartUpload` prevents fragments of failed multipart uploads from silently accumulating and eating into cost; because they do not appear in the console object list, this is a classic cost leak whose cause people cannot find.

> 🎯 **Scenario**: When "keep data recoverable in a versioned bucket but control storage cost" comes up, the answer is a lifecycle rule combining **expire noncurrent versions after N days + keep the latest few + clean up expired delete markers + abort incomplete multipart uploads**. Answers that turn versioning off (disabling is not possible in the first place, only suspending) or manual deletion scripts are wrong. However, **objects under Object Lock are not deleted by lifecycle within the retention period either**; when retention and cost optimization conflict, retention wins.

## Block Public Access (BPA): The Last Seat Belt

S3 data leaks often originate from unintended public settings. **Block Public Access** is a top-level blocking switch that *nullifies* public settings in ACLs and bucket policies, with four options:

```
BlockPublicAcls          → blocks granting new public ACLs
IgnorePublicAcls         → ignores existing public ACLs
BlockPublicPolicy        → blocks applying public bucket policies
RestrictPublicBuckets    → restricts cross-account/anonymous access even if a public policy exists
```

It can be set at both the account level and the bucket level, and **account-level BPA overrides bucket settings** (the stronger one wins). New accounts have all four enabled by default.

> 🎯 **Scenario**: If "anonymous access does not work even though the bucket policy allows public read," BPA is usually on. BPA is a guardrail that is *applied ahead of* policy evaluation. Even for a static website that truly needs to be public, the recommended pattern is to keep BPA on where possible and keep S3 private by routing around it with **CloudFront + OAC (Origin Access Control)**. Direct public exposure is a last resort.

```bash
# Account-level BPA - places a top-level guardrail on every bucket in this account
aws s3control put-public-access-block \
  --account-id 111122223333 \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Check the current state - the first command to run in an audit
aws s3api get-public-access-block --bucket my-secure-bucket
aws s3api get-bucket-policy-status --bucket my-secure-bucket   # IsPublic: true/false
```

The `IsPublic` value returned by `get-bucket-policy-status` tells you "does S3 judge this bucket policy to be public?" The standard audit practice is to ask this API rather than reading the policy by eye to judge whether it is public.

### Making It Impossible for Anyone to Bypass: Account-Ownership Conditions

If BPA blocks "public exposure going outward," then `s3:ResourceAccount` and `aws:PrincipalOrgID` block "leaks from inside to outside" and "entry from outside to inside."

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideOrgPrincipals",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::corp-sensitive",
        "arn:aws:s3:::corp-sensitive/*"
      ],
      "Condition": {
        "StringNotEqualsIfExists": { "aws:PrincipalOrgID": "o-abcd1234ef" },
        "BoolIfExists": { "aws:PrincipalIsAWSService": "false" }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::corp-sensitive",
        "arn:aws:s3:::corp-sensitive/*"
      ],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

The reason `aws:PrincipalIsAWSService` is checked together is to avoid the accident where legitimate paths by which AWS service principals such as CloudTrail or replication write to this bucket get caught by the organization condition and blocked. Forgetting the service-principal exception when putting an organization-boundary Deny and thereby cutting off log delivery is a very common own goal in practice.

## Reading S3 Access Through Logs: Management Events vs Data Events

The first question that comes up in a breach investigation is "so did they actually read the data?" To answer this question, logging must have been turned on beforehand.

| What is recorded | Where it is recorded | Default |
|-----------|---------------|--------|
| **Configuration changes** such as `CreateBucket`, `PutBucketPolicy`, `PutBucketAcl` | CloudTrail management events | **On** |
| **Object access** such as `GetObject`, `PutObject`, `DeleteObject` | CloudTrail **data events** | **Off** (separate setup and billing) |
| Details such as requester, response code, byte count | S3 server access logs | Off |

```bash
# Record object reads/writes of a specific bucket as data events
aws cloudtrail put-event-selectors \
  --trail-name org-trail \
  --advanced-event-selectors '[{
    "Name": "Log S3 data events for sensitive bucket",
    "FieldSelectors": [
      {"Field": "eventCategory", "Equals": ["Data"]},
      {"Field": "resources.type", "Equals": ["AWS::S3::Object"]},
      {"Field": "resources.ARN", "StartsWith": ["arn:aws:s3:::corp-sensitive/"]}
    ]
  }]'
```

The hidden premise of a question like "S3 data exfiltration is suspected. Use CloudTrail to find out who read what" is **whether data events were turned on in advance**. If they were not, only management events remain, so you know "when the policy changed" but cannot know "which objects were read." Because data events generate a large number of events and are costly, the correct pattern is to narrow the scope to sensitive buckets/prefixes rather than enabling them for all buckets. If CloudTrail data events answer "who called the API?", S3 server access logs are closer to "what response did which request get?" - in an investigation you cross-check the two.

S3 can verify checksums (MD5, CRC32, CRC32C, SHA-1, SHA-256) on upload for object integrity, and detects corruption in transit via the `Content-MD5` or `x-amz-checksum-*` headers. Also, to force all requests over HTTPS, add a condition that Denies `aws:SecureTransport: false` to the bucket policy (covered on day 3 together with enforcing encryption). Only when all four layers - encryption, integrity, exposure prevention, and access control - are in place is "S3 data protection" complete.

## S3 Data Protection Layers on One Page

```
┌─ Exposure prevention ───────────────────────────────────┐
│  Account BPA (4 switches)  →  Bucket BPA  →  Object Ownership │
│  "Going public is impossible in the first place"        │
└─────────────────────────────┬───────────────────────────┘
┌─ Access control ────────────┴───────────────────────────┐
│  IAM policy ∩ bucket policy ∩ VPCe policy  (explicit Deny wins) │
│  Condition keys: aws:SecureTransport / aws:SourceVpce /  │
│           aws:PrincipalOrgID / s3:ResourceAccount        │
└─────────────────────────────┬───────────────────────────┘
┌─ Encryption at rest ────────┴───────────────────────────┐
│  SSE-S3 │ SSE-KMS(+Bucket Key) │ DSSE-KMS │ SSE-C       │
│  KMS key policy = second authorization gate              │
└─────────────────────────────┬───────────────────────────┘
┌─ Immutability and recovery ─┴───────────────────────────┐
│  Versioning → Object Lock (Governance/Compliance)        │
│  + separate-account replication + MFA Delete + lifecycle │
└─────────────────────────────┬───────────────────────────┘
┌─ Visibility ────────────────┴───────────────────────────┐
│  CloudTrail management/data events · server access logs · │
│  Macie (sensitivity) · IAM Access Analyzer (external exposure) │
└─────────────────────────────────────────────────────────┘
```

Each layer must be designed to **fail independently**. If the same administrator role can turn off all five layers, that is not five layers but one. Allowing Object Lock to be enabled only at bucket creation, keeping backups in a separate account, and letting only root configure MFA Delete are all mechanisms to create this independence.

## 📌 Key Takeaways

S3 data protection has four axes: **encryption (what locks it), immutability (can it be deleted), exposure prevention (can it become public), and visibility (do you know what was read)**. The choice of encryption mode turns on "is there a need to control and audit key access separately?" (SSE-S3 vs SSE-KMS); cost and throttling are handled with Bucket Keys, and regulatory two-layer wording with DSSE-KMS. Immutability is Object Lock layered on top of versioning, and the difference between Governance and Compliance is "can you undo a mistake?" And on top of all this sits Block Public Access as the last seat belt, because it is the only guardrail applied before policy evaluation.

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
