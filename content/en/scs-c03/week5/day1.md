# Day 1 - AWS KMS Fundamentals: CMK Types, Key Policy vs IAM, Symmetric/Asymmetric Keys

The essence of encryption is not "making data unreadable" but "*controlling the key*." Data encrypted with AES-256 is meaningless bytes without the key, but anyone with the key sees the plaintext. Therefore, in cloud security, encryption discussions almost always reduce to *key management* — who creates the key, who uses it, and who audits that use. AWS Key Management Service (KMS) controls all three using IAM, key policies, and CloudTrail as a managed key management service.

The core KMS concept is the **KMS key** (formerly called CMK, Customer Master Key). This key *never leaves the FIPS 140-2 validated HSM (Hardware Security Module) boundary inside KMS as plaintext*. What we send to KMS is an API call saying "encrypt/decrypt this data for me," and KMS performs the computation inside the HSM and returns the result. You cannot download the key itself — this principle underpins KMS's entire security model.

## Three Types of KMS Keys

KMS keys split into three types based on *who owns and manages the key*. Exams frequently test this distinction and each type's key policy control capabilities.

| Type | Created/Managed By | Edit Key Policy | Rotation | Billing | Cross-Account Sharing |
|------|---------------|-------------|------|------|--------------|
| AWS managed key (`aws/servicename`) | AWS on behalf of service | Read-only | Annual auto (fixed) | Key itself free, usage billed | Not possible |
| Customer managed key (CMK) | Customer owns and creates | Full control | Optional (auto/manual) | $1/month per key + usage | Possible (via key policy) |
| AWS owned key | AWS for multiple accounts | Hidden | AWS managed | Free | N/A |

> 💡 **Related Theory**: When the exam says "edit key policy directly for fine-grained access control, control key rotation period, and share across accounts," the answer is almost always **customer managed key**. AWS managed keys offer convenience but have policies fixed by AWS, failing governance requirements. AWS owned keys aren't visible in the console and are not controlled by users.

Keys with aliases like `aws/s3`, `aws/ebs`, `aws/rds` are AWS managed keys. They're automatically used when you enable "default encryption" without specifying a custom key. CMKs, by contrast, are created by the user with `kms create-key` and referenced explicitly by `key-id` or `alias`.

## Key Policy vs IAM Policy: KMS's Unique Permission Model

Most AWS services use only IAM policies for access decisions, but **KMS uses a dual permission model where IAM and key policies work together**. This is what makes KMS permission debugging difficult.

- **Key policy**: A resource-based policy that every KMS key must have. The *primary source of permissions* for the key.
- **IAM policy**: An identity-based policy attached to principals (users/roles) in an account.

The rule: **If the key policy doesn't delegate to IAM, IAM policies alone cannot grant key access.** When a key is first created, the default key policy usually includes this statement:

```json
{
  "Sid": "Enable IAM User Permissions",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
  "Action": "kms:*",
  "Resource": "*"
}
```

This statement says "IAM policies in this account can grant KMS permissions." The `root` doesn't mean just the root user — it means *delegation of permission decisions to IAM for the entire account*. If you delete this statement, nobody (not even admins) mentioned in the key policy can use the key, leaving it "orphaned."

> ⚠️ **Trap**: "I deleted the `Enable IAM User Permissions` statement from the key policy and now nobody can access the key." In this case, add principals directly to the key policy or, as a last resort, contact AWS Support. Don't leave the key policy empty.

The evaluation flow: A KMS request passes if (1) the key policy explicitly allows it or delegates to IAM which allows it, AND (2) no policy explicitly denies it. Explicit Deny always takes precedence.

## Symmetric vs. Asymmetric Keys

KMS keys split into symmetric and asymmetric based on key specification (key spec). Because uses differ completely, exams frequently test the distinction.

**Symmetric Keys (Symmetric, default)** — AES-256. Use the same key for encryption and decryption. Since the key plaintext never leaves KMS, you use only `Encrypt`, `Decrypt`, and `GenerateDataKey` APIs. All AWS service integrated encryption (EBS, S3, RDS, etc.) uses symmetric keys. It's also the foundation for **envelope encryption (Day 2)**.

**Asymmetric Keys (Asymmetric)** — RSA or ECC key pairs. The public key can be downloaded; the private key stays inside KMS only.
- **Encryption/decryption use**: External systems encrypt with public key → KMS decrypts with private key.
- **Signing/verification use**: KMS signs with private key → Anyone verifies with public key.

```bash
# Create symmetric key (default)
aws kms create-key --description "app-data-key"

# Create asymmetric signing key
aws kms create-key \
  --key-spec RSA_2048 \
  --key-usage SIGN_VERIFY \
  --description "doc-signing-key"
```

> 💡 **Related Theory**: When do you use asymmetric keys? When external systems (or entities without KMS API permissions) must encrypt but shouldn't have decryption rights, or when digital signing/verification is needed. If all parties can call the KMS API and the goal is AWS service integrated encryption, symmetric keys are simpler and more cost-effective. On the exam: "A partner without KMS permissions encrypts and sends data" → asymmetric key.

## Key Material Origin: Where Is the Key Generated?

When you create a CMK, you choose the source of key material.

- **AWS_KMS** (default): KMS HSM generates the key material. Simplest option.
- **EXTERNAL**: Customer generates and imports key material (BYOK, Bring Your Own Key). You control the key lifecycle but own backup/re-import responsibility. Auto-rotation not possible.
- **AWS_CLOUDHSM**: Key material stored in CloudHSM cluster (custom key store). For regulatory requirements on dedicated HSM.
- **EXTERNAL_KEY_STORE (XKS)**: Keys kept in external key manager (on-premises HSM, etc.) with KMS as proxy.

> 🎯 **Scenario**: "Regulations require we create and control key material ourselves; AWS can't generate keys." → Set key material origin to `EXTERNAL` for BYOK, or for stricter requirements, CloudHSM custom key store or XKS. Tradeoff: *EXTERNAL keys cannot auto-rotate*.

## Multi-Region Keys

By default, KMS keys are *bound to a single region*; data encrypted with a key in one region cannot be decrypted in another (the key doesn't leave that region). Multi-region keys replicate the *same key material and key ID* as primary/replica keys across regions, allowing data encrypted in one region to be decrypted by the identical key in another. Used for DynamoDB global tables and cross-region DR. Key policies, however, are managed independently per region.

> ⚠️ **Trap**: To copy an EBS snapshot encrypted with a single-region KMS key from us-east-1 to us-west-2, *re-encryption with the target region's key* is required. Without multi-region keys, the key itself cannot cross regions.

## One-Line Summary

KMS "provides computation without letting keys leave the HSM," controls usage with *key policy (required, resource-based) + IAM (if delegated) + grant (temporary)*, and logs all use with CloudTrail. For governance needs, customer managed key; for external encryption/signing, asymmetric keys are the starting point.

---

## 📝 Practice Questions

**Question 1.** The security team requires: "We must edit the key policy directly to apply fine-grained access control, control the key rotation period, and share the key with other accounts." Which type of key should be used?

A) AWS owned key  
B) AWS managed key (`aws/s3`)  
C) Customer managed key  
D) S3 managed key (SSE-S3)  

**Answer: C**  
Explanation: Editing the key policy, controlling the rotation period, and cross-account sharing are all possible only with a customer managed key that the customer owns and manages. For an AWS managed key, the key policy is fixed by AWS and cannot be edited, and cross-account sharing is not possible. An AWS owned key is not even visible in the console and is not under your control. SSE-S3 is not a KMS key but a separate method managed by S3, and it has no concept of a key policy.

---

**Question 2.** An administrator accidentally deleted the `Enable IAM User Permissions` statement (Principal is the account root, Action `kms:*`) from the default key policy of a KMS key. Even users with IAM administrator permissions can no longer use the key. What is the most accurate cause?

A) IAM policies always take precedence over KMS, so it is irrelevant  
B) Unless the key policy delegates permissions to IAM, IAM policies alone cannot grant access to the key  
C) The key was automatically disabled  
D) CloudTrail was disabled  

**Answer: B**  
Explanation: KMS uses a dual model in which the key policy and IAM work together. The `Enable IAM User Permissions` statement in the key policy is the key delegation that says "delegate permission decisions to IAM policies in this account." If it is deleted, no principal that is not explicitly named in the key policy (administrators included) can use the key. The explanation that IAM always takes precedence over KMS is wrong, and key disablement or CloudTrail is unrelated to this symptom.

---

**Question 3.** A partner system outside AWS must encrypt data and send it to our account. The partner must not be given KMS API call permission or decryption permission. What is the most appropriate key configuration?

A) Create a symmetric customer managed key and grant the partner `kms:Encrypt` permission  
B) Create an asymmetric KMS key (encrypt/decrypt usage), distribute the public key to the partner, and perform decryption with the private key inside KMS  
C) Issue S3 presigned URLs to the partner  
D) Share an AWS managed key  

**Answer: B**  
Explanation: An asymmetric key is suitable when you want the partner to only encrypt without granting KMS call permission. If you distribute the public key, the partner can encrypt locally without the KMS API, and the private key never leaves KMS, so only KMS in our account performs decryption. Granting `kms:Encrypt` on a symmetric key would require the partner to call the KMS API, which violates the requirement. Presigned URLs or sharing a managed key do not fit this requirement.

---

**Question 4.** You want to copy an EBS snapshot encrypted with a single-Region customer managed key from us-east-1 to us-west-2 and use it. What is the most accurate statement?

A) The same key ID can decrypt in any Region, so no additional work is needed  
B) When copying the snapshot, it must be re-encrypted with a key in the destination Region (a single-Region key cannot cross Regions). If cross-Region operations are frequent, consider a multi-Region key  
C) Converting to an asymmetric key resolves this automatically  
D) You must switch to an AWS owned key  

**Answer: B**  
Explanation: Because the key material of a regular KMS key cannot leave its Region, using the snapshot in another Region requires re-encrypting it with a key in the destination Region. To perform cross-Region decryption with the same key, a multi-Region key, which replicates the same key material across multiple Regions, is the design answer. Converting to asymmetric or switching to an AWS owned key does not solve this problem.

---
