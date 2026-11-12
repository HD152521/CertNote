# Day 2 - Encryption: KMS and Per-Service Encryption

## 📌 Key Takeaways

- Encryption at rest and encryption in transit are separate layers. You must enforce both.
- KMS does not encrypt your data directly. This is **envelope encryption**: a KMS key wraps a data key, and the data key encrypts the actual data.
- S3 encryption falls into these categories: SSE-S3 (applied by default, no key control) / SSE-KMS (key policy, auditing, Bucket Key) / DSSE-KMS (dual layer) / SSE-C (customer-provided key) / client-side (AWS never sees the plaintext).
- The center of KMS access is the **key policy**. Service roles and cross-account principals must be allowed in the key policy (or through a grant).
- Reduce the KMS call cost and throttling of SSE-KMS with an S3 Bucket Key, and block plaintext HTTP with an `aws:SecureTransport` deny condition.

## The Three Types of KMS Keys

Data must be protected both when it is stored and when it moves. At the center of encryption in AWS is KMS (Key Management Service), and data services such as S3, Redshift, and Glue integrate with KMS to use keys.

| Item | AWS owned key | AWS managed key | Customer managed key |
|------|------|------|------|
| Visible in your account? | Not visible | Visible (alias such as `aws/s3`) | Visible |
| Edit the key policy | No | No | Yes |
| Rotation | The service handles it | Automatic every year (cannot be turned off) | Optional. Turn on automatic rotation or rotate manually |
| Cross-account use | No | No (because the policy cannot be changed) | Yes |
| Delete / disable | No | No | Yes |
| Cost structure | None | No key storage fee, usage requests are billed | Key storage fee (monthly) + usage requests |
| Clue for choosing | When you do not want to think about it | When you need audit records but do not want the management burden | When you must hold access control, rotation, cross-account use, and auditing yourself |

- **CMK (Customer Master Key)** in older material is the old term for what is now called a "KMS key." Both expressions may be mixed in exam questions.
- The automatic rotation period of AWS managed keys changed from 3 years to 1 year in May 2022. Older material says 3 years.

## How Envelope Encryption Actually Works

```text
Write
 ① The service sends KMS a GenerateDataKey request
 ② KMS returns the data key in two forms: a plaintext data key + a data key encrypted by the KMS key
 ③ The service encrypts the data with the plaintext data key and discards the plaintext key from memory
 ④ The ciphertext data + the encrypted data key are stored together

Read
 ⑤ The service sends the encrypted data key to KMS in a Decrypt request
 ⑥ KMS checks the key policy and returns the plaintext data key
 ⑦ The service decrypts the data with that key
```

- The KMS key itself never leaves KMS. Only data keys travel in and out.
- Large data is encrypted on the service side with the data key, so there is none of the delay or cost of sending the whole data to KMS.
- The KMS permission the reader needs is `kms:Decrypt`, and the writer needs `kms:GenerateDataKey`. "I have S3 permissions but cannot read the SSE-KMS object" is almost always blocked at step ⑥.

> 💡 **Related theory**: KMS does not encrypt the data itself; it manages the data keys. That is why rotating a KMS key does not re-encrypt data that is already stored. What changes is the key material used from then on to wrap data keys.

## Key Policy: The Center of KMS Access

- The **key policy** is the resource-based policy of a KMS key. Unlike other resource policies, a key policy **does not automatically give permissions to the account or to principals in the account.**
- The default key policy contains a statement that allows `kms:*` to the account root principal. That statement is what lets you **allow key access through IAM policies**. Without it, an Allow in an IAM policy has no effect (a Deny still does).
- For cross-account use, the key policy in the account that owns the key must allow the other account, and the other account's IAM policy must allow the use of that key. Both sides are required.
- A **grant** is a means of delegating only limited operations to a specific principal. It is mostly created when an AWS service uses a key on behalf of a user.

```json
{
  "Sid": "AllowGlueRoleUseOfKey",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:role/GlueETLRole" },
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "*"
}
```

- In a key policy, a `Resource` of `*` means "this very key the policy is attached to." It does not mean all keys.
- To allow use only when it goes through a specific service, use the `kms:ViaService` condition. For example, if decryption is allowed only through S3, the path where the same role calls the KMS API directly to use the key is blocked.

## Rotation and Deletion

| Item | Details |
|------|------|
| Automatic rotation | Optional for customer managed keys. When turned on, new key material is created every 365 days by default, and you can set the period yourself |
| On-demand rotation | Rotate immediately, regardless of the automatic rotation setting |
| Eligible for automatic rotation | Symmetric encryption keys with key material generated by KMS. Asymmetric, HMAC, and custom key store keys are rotated manually (create a new key, then switch the alias) |
| What stays the same after rotation | Key ID, ARN, key policy, alias |
| Past data | The previous key material is preserved, so the data decrypts as before. No re-encryption happens |
| Deletion | There is no immediate deletion. You schedule it with a waiting period of 7 to 30 days (30 days by default), and you can cancel during that time |

- Once a key is deleted, data encrypted with that key **cannot be recovered.** If you are not sure, disable the key instead of deleting it. Disabling is reversible.
- A key in its waiting period cannot be used for cryptographic operations. During this period, use CloudTrail and alarms to check who is still using that key.
- Rotation does not reduce the damage from a leaked data key. The reason for rotating is usually a regulation or a contract.

## Five Ways to Encrypt S3 at Rest

| Method | Key owner | Key control / auditing | Caveats |
|------|------|------|------|
| SSE-S3 | S3 | None | Applied by default to all new objects since January 5, 2023, at no additional cost. Cannot be turned off |
| SSE-KMS | KMS key | Key policy, CloudTrail records | KMS calls occur for every object, which can mean cost and throttling → Bucket Key |
| DSSE-KMS | KMS key (dual layer) | Same as SSE-KMS | For dual-encryption regulations. Does not support Bucket Keys |
| SSE-C | The customer provides the key with every request | S3 does not store the key | HTTPS required, cannot be used in the console, and if you lose the key you lose the object |
| Client-side encryption | The customer | AWS receives only ciphertext | Encryption, decryption, and key management are entirely the application's responsibility |

- Even if you change default encryption to SSE-KMS, **existing objects stay as they are.** To change existing objects, you must rewrite them by copying (for example with S3 Batch Operations).
- **SSE-C** has been blocked by default on new general purpose buckets since April 2026. To use it, you must explicitly allow it in the bucket's encryption settings. Older material describes SSE-C as an option you can use without conditions.
- AWS services cannot open objects encrypted with SSE-C or client-side encryption. Macie reports only the metadata of such objects, and it is also hard to analyze them directly with services such as Athena.
- Server-side encryption (SSE) encrypts the data **after** S3 receives it. At the moment of receipt, the plaintext passes through S3. The requirement that "AWS must never see the plaintext" is met only by client-side encryption.

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

## How the S3 Bucket Key Works and Its Side Effects

- Without a Bucket Key, S3 requests a data key from KMS **for every object**. An ETL job that reads millions of objects runs into KMS request charges and request limits.
- When you turn on a Bucket Key, S3 obtains a short-lived **bucket-level key** from KMS and keeps it, then uses that key to generate per-object data keys. Requests to KMS drop sharply, which can reduce request costs by up to 99%.
- Control over the KMS key stays the same. That is why, for a requirement like "reduce cost but keep key control," the Bucket Key is the answer rather than switching to SSE-S3.

| Changes to know before turning it on | Details |
|------|------|
| KMS events in CloudTrail | The **bucket ARN** is logged instead of the object ARN, and the number of events drops. Object-level KMS auditing becomes blurrier |
| Encryption context | IAM and key policies that use the object ARN as a condition will not work. Fix them to be based on the bucket ARN |
| Existing objects | Not affected. It applies from newly written objects |
| Size of the savings | If the requesters (roles, accounts) differ, a separate Bucket Key is obtained for each. The savings are larger when there are few requesters and many objects are read in a short time |
| DSSE-KMS | Not supported |

## Where to Configure Encryption per Service

| Service | Setting | Things to know |
|------|------|------|
| Redshift | Encryption of the cluster or serverless namespace | Encrypted by default today. The default key is an AWS owned key, and you can specify a customer managed key. Snapshots are encrypted as well |
| Glue ETL | Security configuration | A bundled setting for encrypting S3 target data, CloudWatch logs, and job bookmarks. Attach it to jobs, crawlers, and development endpoints |
| Glue Data Catalog | Catalog settings | Metadata encryption is a separate setting from the security configuration |
| Kinesis Data Streams | Server-side encryption of the stream | Set per stream with a KMS key |
| Athena | Result encryption of the workgroup | Even if the source is encrypted, the query result location is configured separately |

- **Redshift**: You can also encrypt an existing unencrypted cluster by changing its settings. Redshift then moves the data to a new encrypted cluster. RA3 families allow reads and writes while this is in progress, but DC2 allows reads only. The older claims "only possible at creation" and "key management with HSM" differ from the current state. HSM integration is exclusive to the legacy CloudHSM Classic and is not supported on DC2 or RA3 nodes.
- If you disable a customer managed key used by Redshift, the warehouse becomes inaccessible, and if you do not restore the key within 14 days it is deleted. This is a path where a key operations mistake leads to data loss.
- KMS keys are bound to a Region. When you copy a Redshift snapshot to another Region and want to use your key in the destination Region, first create a **snapshot copy grant** in the destination Region.
- **Glue security configuration**: To encrypt CloudWatch logs with KMS, the key policy must allow the logs service principal, and the job role must have `logs:AssociateKmsKey`. If it is missing, real-time logging is turned off. A job running inside a VPC fails with a KMS timeout if there is no path to KMS (a KMS VPC endpoint or NAT).
- When you attach a security configuration, an SSE-S3 setting passed as a job parameter is ignored. If the two overlap, the security configuration wins.

## Encryption in Transit

- AWS API endpoints support TLS. The issue is **whether plaintext HTTP is allowed.** You enforce this by denying requests where `aws:SecureTransport` is false in the bucket policy.
- Redshift enforces SSL connections with `require_ssl` in the parameter group.

```json
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::lake-curated", "arn:aws:s3:::lake-curated/*"],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}
```

> 💡 **Related theory**: Encryption at rest and encryption in transit are separate layers of protection. Even if storage is encrypted with SSE-KMS, data sent over plaintext HTTP is exposed to man-in-the-middle attacks. In a security review question, if "it is encrypted but still got flagged," look for the missing layer.

## Client-Side Encryption

- The application encrypts the data itself **before** it goes to AWS. You implement it with the AWS Encryption SDK or the S3 encryption client.
- You can wrap the data key with a KMS key (the key is in KMS, while encryption and decryption happen in the client), or you can use your own key.
- AWS receives only ciphertext. It gives the strongest confidentiality, but it makes server-side features (direct analysis by services, sensitive data detection) hard to use and raises operational complexity.

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Have S3 permissions but reading an SSE-KMS object is denied | The role lacks `kms:Decrypt`, or the key policy does not allow it | Add it to the key policy or IAM policy |
| Denied even though the IAM policy grants KMS permissions | The key policy lacks the statement that delegates to the account's IAM | Allow directly in the key policy or add the delegation statement |
| KMS throttling and a spike in charges while processing a large number of objects | A KMS call for every object | S3 Bucket Key |
| Some access is denied after turning on a Bucket Key | A condition on an encryption context based on the object ARN | Change it to be based on the bucket ARN |
| Cross-account sharing fails at decryption | Encrypted with an AWS managed key, or the key policy is missing | Customer managed key + allow the other account in the key policy |
| Default encryption was changed but old objects are unchanged | Default encryption applies only to new objects | Re-encrypt by copying |
| A Glue job in a VPC times out on KMS | No path to KMS | KMS VPC endpoint |
| SSE-C upload to a new bucket returns 403 | New buckets block SSE-C by default | Allow it in the bucket encryption settings |

## Question Clue → Correct Answer Table

| Clue in the question | Correct answer |
|------|------|
| "Audit key usage and control access directly" | SSE-KMS + customer managed key |
| "Ease the KMS cost and throttling of SSE-KMS while keeping key control" | S3 Bucket Key |
| "AWS must never see the plaintext" | Client-side encryption |
| "A regulation requiring two layers of encryption" | DSSE-KMS |
| "Block plaintext HTTP access" | Deny when `aws:SecureTransport` is false |
| "Force Redshift connections to use encrypted connections" | `require_ssl` |
| "Encrypt a Glue job's output, logs, and bookmarks at once" | Glue security configuration |
| "Another account must read the encrypted data" | Allow the other account in the key policy of a customer managed key |
| "Avoid deleting a key by mistake" | Disable instead of delete, deletion waiting period |

Tomorrow we cover what encryption and permissions alone cannot stop: how to find where sensitive data lives (Macie) and how to reduce its exposure (masking and tokenization).

## 📖 Glossary

- **KMS key**: The top-level key that stays inside KMS and wraps data keys. It is the same thing as the CMK in older material.
- **Data key**: The key that encrypts the actual data. It is stored next to the data in a form encrypted by the KMS key.
- **Envelope encryption**: A two-tier structure in which data is encrypted with a data key and the data key is encrypted with a KMS key.
- **Key policy**: A resource-based policy attached to a KMS key. It decides who can use and manage this key.
- **Grant**: A means of delegating only some operations of a key to a specific principal. It is mainly created when an AWS service uses the key on your behalf.
- **S3 Bucket Key**: A bucket-level key that S3 obtains from KMS and holds briefly to generate per-object data keys. It reduces KMS calls.
- **Encryption context**: Additional information bound together at encryption time. The same value must be present at decryption time, and it can also be used in policy conditions.
- **SSE**: Server-side encryption. The service encrypts the data after receiving it and before storing it.
- **Security configuration**: A setting that bundles the encryption methods for the S3 data, logs, and bookmarks used by a Glue job.
- **Key rotation**: Keeping the key ID the same and creating only new key material used for encryption.

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

**Question 5.** Which statement best describes KMS envelope encryption?

A) The KMS key directly encrypts large amounts of data  
B) The KMS key encrypts a data key, and the data key encrypts the actual data  
C) The data is encrypted twice with KMS  
D) The client fully manages the keys  

**Answer: B**  
Explanation: Envelope encryption protects the data key with the KMS key (the root), and the data key encrypts the actual data, which provides efficient handling of large data and fewer KMS calls at the same time. A does not match how KMS works, C is confused with the DSSE concept, and D describes client-side encryption.

---
