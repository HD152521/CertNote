# Day 4 - Log Integrity, Retention, and Centralization: S3 Object Lock, Cross-Account Log Aggregation, KMS Encryption of Logs

So far we've covered *what* to log (CloudTrail, Config, Flow Logs, Resolver). Today we cover *how* to store logs trustworthily. Audit log value depends on three properties: **integrity** (not tampered), **availability and retention** (exists when needed), **confidentiality** (authorized access only). Both attackers and malicious insiders target logs — to erase breach traces. The security peak: "making logs impossible even for their creator to erase."

## Threat Model: Why Logs Are Stored Separately and Strongly Protected

Log storage design starts from clear threat model:
1. **Attacker compromises operations account** → deletes/modifies logs to cover breach traces.
2. **Malicious insider** → edits logs of their unauthorized activity.
3. **Accident/ransomware** → accidentally deletes/encrypts logs.

Three response principles: ① Send logs to **separate account** (logging-only account) isolated from operations compromise, ② **Object Lock** prevents anyone (root included) from deleting within retention, ③ **KMS encryption** for confidentiality and key-based access control separate from bucket access.

> 💡 **Related Theory**: This combines security's classic principles *separation of duties* and *defense in depth*. Separating log generator from log guardian means one breach doesn't topple both. Like accounting: "separate record-keeper and auditor." Logging account takes *write-only inbound* only, operations teams cannot access, preserving chain of custody even under breach.

## S3 Object Lock: WORM Guarantees Tampering Impossible

**S3 Object Lock** protects objects via **WORM (Write Once Read Many)** model. No object version can be deleted/overwritten during retention. Object Lock must be **enabled at bucket creation** (later activation requires support request), **versioning is required**.

Two retention modes:
- **Governance mode**: Specific IAM permission holders (`s3:BypassGovernanceRetention`) can override retention and delete. Operational flexibility.
- **Compliance mode**: **No user (root included) can delete/modify during retention.** Retention period cannot even be shortened. For regulatory compliance (SEC 17a-4 etc.).

Additionally, **Legal Hold** locks object indefinitely regardless of retention period (litigation preservation). Explicitly release to unlock.

```bash
# Compliance mode 7-year retention lock
aws s3api put-object-retention \
  --bucket central-audit-logs \
  --key 2026/06/24/CloudTrail/file.json.gz \
  --retention 'Mode=COMPLIANCE,RetainUntilDate=2033-06-24T00:00:00Z'

# Bucket default retention rule
aws s3api put-object-lock-configuration \
  --bucket central-audit-logs \
  --object-lock-configuration \
    'ObjectLockEnabled=Enabled,Rule={DefaultRetention={Mode=COMPLIANCE,Years=7}}'
```

> ⚠️ **Pitfall**: Exam frequently tests — "audit logs *no one, not even root* can delete during retention." Answer: **Object Lock Compliance mode**. Governance mode allows `BypassGovernanceRetention` privilege holders to override, failing "absolutely no" requirement. Object Lock cannot be enabled *later* and requires versioning — remember these prerequisites.

> 🎯 **Scenario**: "Store CloudTrail for 7 years regulatory compliant, with day 1 integrity validation combined so tampering is both *prevented and proven*." Answer: organization trail → logging account S3 (Object Lock Compliance 7-year) + log file integrity validation enabled. Object Lock *prevents* tampering, hash chain *proves* it — preventive and detective combined.

## KMS-Encrypted Logs: Confidentiality and Key-Based Access Control

Logs contain sensitive info (IPs, user ARNs, resource names, sometimes request parameters). **SSE-KMS** encryption gives two things: ① at-rest confidentiality, ② **KMS key policy controls "who can decrypt"** — a second lock independent of bucket access.

CloudTrail with KMS key specified encrypts log files via SSE-KMS. The **KMS key policy** must allow CloudTrail `kms:GenerateDataKey*`.

```json
{
  "Sid": "Allow CloudTrail to encrypt logs",
  "Effect": "Allow",
  "Principal": { "Service": "cloudtrail.amazonaws.com" },
  "Action": "kms:GenerateDataKey*",
  "Resource": "*",
  "Condition": {
    "StringLike": {
      "kms:EncryptionContext:aws:cloudtrail:arn":
        "arn:aws:cloudtrail:*:111122223333:trail/*"
    }
  }
}
```

> 💡 **Related Theory**: This is *cryptographic access control* power. Even with S3 `s3:GetObject` permission, if object is KMS-encrypted and user lacks `kms:Decrypt`, they get only ciphertext, not plaintext. Two locks (S3 + KMS) via separate policies mean one policy mistake doesn't immediately leak. Cross-account with separate KMS key permissions enables "receive logs but only key owner reads" asymmetric control.

> ⚠️ **Pitfall**: Cross-account logging with KMS means the *account/principal wanting decryption* needs `kms:Decrypt` from the KMS key policy. Both key policy *and* bucket policy must align to read logs. "Gave bucket permission but can't read logs" typically means KMS key policy missing.

## Cross-Account Log Aggregation

Multi-account environment best practice: **central logging account (log archive account)** collects all logs. AWS standard multi-account baseline (Control Tower's Log Archive account) standardizes this pattern.

Aggregation method varies by log type:

**S3-based (CloudTrail, Config, Flow Logs → S3)**: Central logging account S3 bucket uses **bucket policy** to allow other account/service writes. Organization trail auto-configures this.

```json
{
  "Sid": "AllowOrgCloudTrailWrite",
  "Effect": "Allow",
  "Principal": { "Service": "cloudtrail.amazonaws.com" },
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::central-audit-logs/AWSLogs/o-orgid/*/*",
  "Condition": {
    "StringEquals": {
      "s3:x-amz-acl": "bucket-owner-full-control",
      "aws:SourceOrgID": "o-exampleorgid"
    }
  }
}
```

**CloudWatch Logs-based**: Use **CloudWatch Logs subscription filter** to stream logs to **Kinesis Data Stream/Firehose** (cross-account destination) for central aggregation.

> ⚠️ **Pitfall**: Why use both `bucket-owner-full-control` ACL condition *and* `aws:SourceOrgID` condition together? Former ensures objects written by other account get *bucket owner* ownership — central account fully controls all logs (else writer account controls). Latter blocks *Confused Deputy* attack (arbitrary external account impersonating service principal). Both missing = security hole.

## Comprehensive Architecture: Tamper-Proof Central Audit Repository

Combining three controls, the standard design:

```
[Operations Accounts]           [Log Archive Account]
 CloudTrail (org trail) ──┐
 Config delivery ─────────┼──▶ S3 Bucket
 VPC Flow Logs ───────────┘     ├─ Object Lock (Compliance, 7 years)
 Resolver query logs ──────────▶├─ SSE-KMS (dedicated CMK, key policy separation)
                                 ├─ Versioning enabled
                                 ├─ Bucket policy: write-only inbound + SourceOrgID
                                 └─ Integrity validation (CloudTrail digest)
       Operations team no access ─── Security/audit team only read + kms:Decrypt
```

> 🔍 **Deeper Dive**: The elegance is *each control prevents different threat*. Separate account = isolates operations breach. Object Lock Compliance = prevents even-root deletion (insider/ransomware defense). KMS = confidentiality + decrypt authority separation. Integrity validation = cryptographic proof of tampering. SourceOrgID/bucket-owner ACL = confused deputy defense. One breach doesn't topple all. All logs in one place enables multi-layer correlation from day 3 (CloudTrail + Flow Log + Resolver). Tomorrow (day 5) integrates all pieces — activity, config, network, integrity/retention/centralization — into one breach investigation scenario. Next week's threat detection (GuardDuty, Security Hub) layers automatic analysis *atop* this foundation. Centralization is prerequisite for multi-log correlation.

---

## 📝 Practice Questions

**Question 1.** Which satisfies the regulatory requirement: "Make audit logs impossible for *any user, even the root account,* to delete or modify during the retention period"?

A) Enable only S3 versioning  
B) S3 Object Lock Governance mode  
C) S3 Object Lock Compliance mode  
D) Add a Deny Delete in the bucket policy  

**Answer: C**  
Explanation: In Compliance mode, no principal (root included) can delete or modify an object version within the retention period, and the retention period cannot be shortened. Governance mode can be bypassed by those with the `s3:BypassGovernanceRetention` permission, so it does not satisfy the "absolutely impossible" requirement. With versioning alone, delete markers and expiration are possible, and a bucket policy Deny can be reversed by anyone with permission to change the policy.

---

**Question 2.** In a multi-account organization, what is the most essential design principle for isolating audit logs so that they cannot be tampered with or deleted even if one operations account is compromised?

A) Keep all logs only inside each operations account  
B) Aggregate logs into an S3 bucket in a dedicated logging account that the operations team cannot access  
C) Keep logs only in CloudWatch Logs  
D) Shorten the log retention period to 30 days  

**Answer: B**  
Explanation: Following the principles of separation of duties and defense in depth, separating the operations account that generates logs from the logging account that stores and controls them means an attacker cannot access or tamper with the logs even if the operations account is compromised. Keeping logs in the same account exposes them together in a breach, a short retention period actually loses evidence, and CloudWatch Logs alone provides weaker isolation and immutability guarantees.

---

**Question 3.** When CloudTrail from other accounts writes objects to a central logging account bucket, what is needed in the bucket policy so that the central account fully owns and manages those objects and arbitrary external accounts are prevented from forged writes?

A) An `s3:x-amz-acl = bucket-owner-full-control` condition and an `aws:SourceOrgID` (or SourceArn) condition  
B) Allow public read  
C) Allow `s3:BypassGovernanceRetention`  
D) KMS key deletion permission  

**Answer: A**  
Explanation: The `bucket-owner-full-control` ACL condition assigns ownership of objects written by another account to the bucket owner so that the central account fully manages them, and the `aws:SourceOrgID`/`aws:SourceArn` condition blocks writes from arbitrary external accounts impersonating the service principal (confused deputy). Public read is dangerous, and BypassGovernance and KMS deletion permissions are unrelated to this purpose and are in fact risky.

---

**Question 4.** In a cross-account bucket where logs are encrypted with SSE-KMS, the security team account has S3 GetObject permission but cannot read the log contents. What is the most likely cause?

A) Object Lock blocks reads  
B) The security team principal lacks `kms:Decrypt` permission in the KMS key policy  
C) Versioning is turned off  
D) The logs are too old  

**Answer: B**  
Explanation: To read an SSE-KMS object, you need `kms:Decrypt` permission on the KMS key in addition to S3 access permission. Without it, you receive the ciphertext but cannot decrypt it. This separation of two locks (S3 + KMS) is the core of cryptographic access control. Object Lock only prevents deletion and modification and does not block reads, and versioning and log age are unrelated to decryption failure.

---

**Question 5.** For CloudTrail logs, you want to *prevent* tampering while also *proving* whether tampering occurred. What is the most appropriate combination?

A) Object Lock Compliance mode (prevention) + CloudTrail log file integrity validation (proof)  
B) KMS encryption only  
C) Bucket versioning only  
D) CloudWatch alarms only  

**Answer: A**  
Explanation: Object Lock Compliance mode *prevents* tampering by blocking deletion and modification itself within the retention period, and CloudTrail log file integrity validation (SHA-256 hash chain + RSA-signed digests) cryptographically *proves* whether any tampering occurred. This design applies prevention and detection together. KMS provides confidentiality, versioning preserves history, and alarms provide notification, so none of them alone provides both prevention and proof.

---
