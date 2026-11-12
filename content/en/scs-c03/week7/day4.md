# Day 4 - Log Integrity, Retention, and Centralization: S3 Object Lock, Cross-Account Log Aggregation, KMS Encryption of Logs

So far we have covered *what* to log (CloudTrail, Config, Flow Logs, Resolver). Today we cover *how to store those logs so they can be trusted*. The value of an audit log depends on three properties: **integrity** (not tampered with), **availability and retention** (present when needed), and **confidentiality** (seen only by authorized parties). Both attackers and insiders target logs - to erase their traces. That is why making logs "undeletable even by the person who created them" is the pinnacle of security logging.

## Threat Model: Why Protect Logs Separately and Strongly

Log storage design starts from a clear threat model:
1. **An attacker takes over operating-account privileges** → deletes or tampers with logs to remove the traces of the breach.
2. **A malicious insider** → edits the logs of their own fraudulent activity.
3. **Accident or ransomware** → accidental deletion or encryption of logs.

The response principles are *three*: ① send logs to a **separate account** (a dedicated logging account) to isolate them from a compromise of operating accounts, ② use **Object Lock** so that no one (not even root) can delete or alter them within the retention period, ③ use **KMS encryption** for confidentiality and key-based access control.

The sentence repeated most often in ransomware incident response reports is "we had backups, but the backups were encrypted and deleted too." The second most repeated sentence is "we could not tell exactly when the intrusion happened." Both sentences come from the same cause - **the backups and logs were within reach of the compromised credentials**. From the attacker's side, this is not a choice but standard procedure. If recovery means remain, a ransom cannot be collected, and if traces remain, the intrusion path gets blocked. So mature organizations begin log storage design from the state of "assuming the attacker has administrator privileges." Only two kinds of controls survive under this assumption - those located in **another account** that those privileges cannot reach, or those with **immutability (Object Lock Compliance)** applied, which works regardless of privileges.

### Matching Threats to Controls One to One

You must understand *which threat each control prevents* separately to avoid over- and under-design.

| Threat | Failure scenario | Control that prevents it | Why it is not enough alone |
|------|--------------|---------------|------------------------|
| Operating account compromise | Attacker deletes the log bucket | **Separate logging account** | What if the logging account itself is breached? → Object Lock |
| Logging account privileges stolen | Attempt to delete with root privileges | **Object Lock Compliance** | Cannot save events that were never recorded → logging scope |
| Tampering with log contents | Quietly editing a single line | **CloudTrail integrity validation** | Does not prevent it, only proves it → use together with Object Lock |
| Information gathering by reading logs | Learning internal structure, IPs, and ARNs from logs | **SSE-KMS + separated key policy** | Whoever holds key permissions can still read → least privilege |
| Forged writes impersonating a service principal | Someone else's logs get mixed in | **`aws:SourceArn`/`SourceOrgID` conditions** | - |
| Turning off logging itself | `StopLogging` right after a breach | **Organization trail + SCP + immediate alarm** | The period before it was turned off has already been recorded |
| Not watching an entire Region | Activity in a Region with no monitoring | **Multi-Region trail + recorder in all Regions** | - |

This table shows that **no control is complete on its own**. And the last column of each row points to the control in the next row, forming a chain. This is the structural reason why the question "is this all I need to do?" in security design is always answered with "no."

This is a combination of the classic security principles *separation of duties* and *defense in depth*. If you separate the party that generates logs from the party that stores and controls them, the other side does not collapse when one side is breached. It is the same principle as accounting's "separate the recorder from the auditor." The logging account accepts only *write-only inbound* traffic and denies access to the operations team, so the chain of custody of the evidence is preserved even during a breach.

## S3 Object Lock: Guaranteeing Tamper-Proofing with WORM

**S3 Object Lock** protects objects with the **WORM (Write Once Read Many)** model. During the retention period, object versions cannot be deleted or overwritten. Object Lock must be enabled *at bucket creation time* (enabling it later requires a support request), and **versioning is mandatory**.

Two retention modes:
- **Governance mode**: users with a specific IAM permission (`s3:BypassGovernanceRetention`) can bypass or delete the retention. For cases that need operational flexibility.
- **Compliance mode**: **no user (including the root account) can delete or change it within the retention period.** A retention period, once set, cannot even be shortened. Used for regulatory compliance (SEC 17a-4, etc.).

In addition, **Legal Hold** locks an object indefinitely regardless of the retention period (for litigation preservation and the like). It stays in place until it is explicitly released.

```bash
# Lock for 7 years in Compliance mode
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

> ⚠️ **Pitfall**: The exam asks it like this - "Make it so that *no one, not even the root account,* can delete the audit logs within the retention period." The answer is **Object Lock Compliance mode**. Governance mode can be bypassed by holders of the `BypassGovernanceRetention` permission, so it does not satisfy a "never possible" requirement. Also, Object Lock cannot be turned on for a bucket *later*; it presupposes enabling at creation plus versioning.

> 🎯 **Scenario**: "Retain CloudTrail logs for 7 years for regulatory compliance, and combine this with Day 1's integrity validation so that tampering is *both prevented and proven*." Answer: organization trail → logging-account S3 bucket (Object Lock Compliance, 7 years) + log file integrity validation enabled. Object Lock *prevents* tampering, and the hash chain of integrity validation *proves* it - prevention and detection are applied together.

### Governance, Compliance, and Legal Hold in One Table

| Item | Governance mode | Compliance mode | Legal Hold |
|------|-----------------|-----------------|------------|
| Period | Specified per object version | Specified per object version | **No period** (until released) |
| Who can bypass | Holder of `s3:BypassGovernanceRetention` | **No one** (including root) | Released by a holder of `s3:PutObjectLegalHold` |
| Shortening the period | Possible (requires bypass permission) | **Not possible** (can only be extended) | Not applicable |
| Recovering from a mistake | Possible | **Impossible** | Possible |
| Lifecycle expiration | Not deleted within the retention period | Not deleted within the retention period | Not deleted until released |
| Typical use | Internal policy, ransomware mitigation | Statutory retention (SEC 17a-4, etc.) | Litigation response (litigation hold) |

The practical difference between Governance and Compliance is exactly one thing: **"can a mistake be undone?"** If you apply Compliance for 7 years, even a wrongly uploaded object or accidentally included personal information stays in the account for 7 years and incurs storage costs. So the practical standard is to **validate non-production with Governance, and move only the production paths that have been validated to Compliance**. If the exam text does not state "no one must be able to delete it" and you choose Compliance, that is over-design.

```bash
# The actual form of deleting a Governance-mode object with the bypass permission
aws s3api delete-object \
  --bucket central-audit-logs \
  --key 2026/06/24/CloudTrail/file.json.gz \
  --version-id 3HL4kqtJvjVBH40Nrjfkd \
  --bypass-governance-retention          # this option does not work in Compliance mode

# Check the retention state applied to a specific object version - often used as audit evidence
aws s3api get-object-retention \
  --bucket central-audit-logs \
  --key 2026/06/24/CloudTrail/file.json.gz \
  --version-id 3HL4kqtJvjVBH40Nrjfkd

aws s3api get-object-legal-hold \
  --bucket central-audit-logs \
  --key 2026/06/24/CloudTrail/file.json.gz \
  --version-id 3HL4kqtJvjVBH40Nrjfkd
```

> ⚠️ **Pitfall**: Object Lock works at the **object version level**. So if you set the bucket default retention rule *later*, objects already uploaded before that have no retention applied at all. The statement "we turned on Object Lock, so all the logs in this bucket are safe" is true **only for objects that arrived after the rule was turned on**. To lock existing objects too, you must specify retention on individual object versions or apply it in bulk with S3 Batch Operations. This is a pitfall of exactly the same shape as Day 1's "logging is not applied retroactively," and it is a principle running through this entire week - **a control is always effective only from the moment it is turned on.**

Forgetting the digest files is a frequent mistake. CloudTrail drops logs under `AWSLogs/…/CloudTrail/…` and digests under `AWSLogs/…/CloudTrail-Digest/…`, under **different prefixes**. If you apply a retention rule or lifecycle with a prefix filter and specify only the log side, the logs are locked for 7 years but the digests are left with no protection or expire through the lifecycle. Then the logs exist, but **there is no way left to prove those logs are genuine.** The integrity scheme holds only when logs and digests are paired, so the two prefixes must always receive the same retention and the same protection.

### How to Choose Retention and Integrity Measures

| Measure | What it prevents | What it cannot prevent | Reversible? |
|------|--------|-----------|---------------|
| Versioning | Overwrites and simple deletions | Holders of permission to permanently delete versions | Yes |
| MFA Delete | Version deletion by an attacker who stole only credentials | Root holding the MFA | Yes |
| Object Lock Governance | Deletion by ordinary users | Holders of the bypass permission | Yes |
| Object Lock Compliance | **All deletion, including by root** | What was never recorded | **No** |
| Separate account isolation | Propagation of an operating account compromise | Compromise of the logging account itself | Yes |
| Cross-Region replication | Region-level and account-level incidents | Deletion before the point of replication | Yes |
| Integrity validation (digest) | (Does not prevent) | - | Not applicable (a means of proof) |
| SCP | Disabling of logging by principals inside the organization | Principals outside the organization, the management account | Yes |

The last two columns of this table are the selection criteria. If regulation demands "non-deletable," you must use an irreversible control (Compliance), and if you need operational flexibility, you stack reversible controls. **An irreversible control is as irreversible as it is powerful** - this tautology is what causes real incidents.

## KMS-Encrypted Logs: Confidentiality and Key-Based Access Control

Logs contain sensitive information (IPs, user ARNs, resource names, and sometimes request parameters). Encrypting logs with **SSE-KMS** gives you two things: ① confidentiality of data at rest, and ② **control over "who can decrypt" through the KMS key policy** - that is, a second lock *separate from* bucket access permissions.

When you specify a KMS key on a trail, CloudTrail encrypts log files with SSE-KMS. In this case, the **KMS key policy** must allow CloudTrail `kms:GenerateDataKey*`.

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

This is the power of *cryptographic access control*. Even if a bucket policy allows `s3:GetObject`, if the object is encrypted with KMS and that user lacks `kms:Decrypt` permission, they *receive only ciphertext and cannot see the contents*. If you control the two locks (S3 access + KMS decryption) with different policies, a mistake in one policy does not lead directly to a leak. In particular, separating KMS key permissions across accounts makes an asymmetric control possible: "it receives the logs, but only the key owner can read them."

When you use KMS encryption while sending logs cross-account, the *account/principal that wants to decrypt* must be granted `kms:Decrypt` permission in the KMS key policy. *Both* the key policy and the bucket policy must be right for it to be readable. "I gave bucket permissions but the logs can't be read" is commonly caused by a missing KMS key policy.

When encrypting CloudWatch Logs with KMS, the shape of the key policy is different again. The service principal has a Region-specific name (`logs.<region>.amazonaws.com`), and the encryption context also points to the log group ARN.

```json
{
  "Sid": "Allow CloudWatch Logs to use the key",
  "Effect": "Allow",
  "Principal": { "Service": "logs.ap-northeast-2.amazonaws.com" },
  "Action": [
    "kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*",
    "kms:GenerateDataKey*", "kms:Describe*"
  ],
  "Resource": "*",
  "Condition": {
    "ArnLike": {
      "kms:EncryptionContext:aws:logs:arn":
        "arn:aws:logs:ap-northeast-2:111122223333:log-group:/aws/cloudtrail/*"
    }
  }
}
```

```bash
# Associate a CMK with the log group
aws logs associate-kms-key \
  --log-group-name /aws/cloudtrail/org-audit-trail \
  --kms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/aaaa-bbbb
```

Why is it important to set the encryption context (`kms:EncryptionContext:*`) as a condition? Without this condition, you are in effect permitting the service principal to "decrypt anything with this key," and the key can then handle data of *other resources* created through the same service. The encryption context is authenticated additional data (AAD) that is stored bound to the ciphertext, so it cannot be forged - that is, KMS verifies "is this decryption request really for the data of that log group?" When granting KMS permissions to a service principal, the standard pattern is to set both conditions together: **`kms:ViaService` (only through which service) + the encryption context (only for which resource)**, and a key policy missing these two is effectively the same as "delegating this key wholesale to that service."

> 🎯 **Scenario**: "After encrypting logs with SSE-KMS, the security team's Athena queries fail every time." There are three candidate causes - (1) the role running the query lacks `kms:Decrypt`, (2) the key policy does not allow that account (if cross-account, **both the key policy and the IAM policy** are needed), (3) the Athena result output bucket is encrypted with a different key and needs `kms:GenerateDataKey`, which is missing. The third is especially easy to forget - because an investigation tool does not only *read* logs but also *writes* results.

## Cross-Account Log Aggregation

The best practice in a multi-account environment is to gather all logs in a **central logging account (log archive account)**. AWS's multi-account baseline (the Log Archive account of Control Tower) standardizes this pattern.

The aggregation method differs by log type:

**S3-based (CloudTrail, Config, Flow Logs → S3)**: allow writes from other accounts/services with a **bucket policy** on the S3 bucket in the central logging account. An organization trail configures this automatically.

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

**CloudWatch Logs-based**: use a **CloudWatch Logs subscription filter** to send logs to a **Kinesis Data Stream/Firehose** (a cross-account destination) and aggregate them in the central account. Alternatively, stream each account's CloudWatch Logs to the central account.

On the central account side, you create a **destination** and attach an access policy to it. This policy determines "which accounts can send logs into this destination."

```bash
# ① Central account: create the destination that will receive logs
aws logs put-destination \
  --destination-name central-log-destination \
  --target-arn arn:aws:kinesis:ap-northeast-2:999988887777:stream/central-logs \
  --role-arn  arn:aws:iam::999988887777:role/CWLtoKinesisRole

# ② Central account: grant a destination policy so the whole organization can use it
aws logs put-destination-policy \
  --destination-name central-log-destination \
  --access-policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": "*",
      "Action": "logs:PutSubscriptionFilter",
      "Resource": "arn:aws:logs:ap-northeast-2:999988887777:destination:central-log-destination",
      "Condition": { "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" } }
    }]
  }'

# ③ Each member account: connect to the destination with a subscription filter
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/payments-api \
  --filter-name to-central \
  --filter-pattern "" \
  --destination-arn arn:aws:logs:ap-northeast-2:999988887777:destination:central-log-destination
```

The `aws:PrincipalOrgID` condition in ② is the key. If you leave only `Principal: "*"` and drop the condition, **any AWS account on the internet** can push data into our log pipeline. Because a log destination feels like a resource that is "more convenient if anyone can write to it," this condition is often omitted, and the result is incidents where the log stream gets polluted or costs explode.

| | S3 aggregation | CloudWatch Logs subscription aggregation |
|---|--------|--------------------------|
| Latency | A few minutes to over ten minutes | Nearly real time |
| Retention | Effectively unlimited (lifecycle, Object Lock) | Bound to the log group retention period |
| Immutability | Object Lock possible | Not possible |
| Analysis | Athena, Lake, external SIEM | Stream consumers (Lambda, OpenSearch, SIEM) |
| Cost | Storage-centered (cheap) | Ingestion- and stream-centered |
| Suitable use | **Evidence retention, regulatory response** | **Real-time detection, SIEM integration** |

The two paths are not substitutes but **parallel paths with different roles**. The standard is to send regulatory evidence to S3 and real-time detection to the stream and to keep both. If the exam says "immutable retention, 7 years," it is S3; if it says "deliver to the SIEM immediately," it is a subscription filter.

There is a reason for using the `bucket-owner-full-control` ACL condition together with the `aws:SourceOrgID` (or `aws:SourceArn`) condition. The former ensures that ownership of objects written by another account goes to the *bucket owner* (otherwise the writing account controls the object), so that the central account fully manages all logs. The latter blocks the *Confused Deputy* attack (an arbitrary outside account writing while impersonating the service principal). If both are missing, it becomes a security hole.

## Overall Architecture: A Tamper-Proof Central Audit Repository

The standard design combining the three controls:

```
[Operating accounts]             [Log archive account]
 CloudTrail (org trail) ──┐
 Config delivery ─────────┼──▶ S3 bucket
 VPC Flow Logs ───────────┘     ├─ Object Lock (Compliance, 7 years)
 Resolver query logs ──────────▶├─ SSE-KMS (dedicated CMK, separated key policy)
                                 ├─ Versioning enabled
                                 ├─ Bucket policy: write-only inbound + SourceOrgID
                                 └─ Integrity validation (CloudTrail digest)
       Operations team has no access ─── only security/audit team: read + kms:Decrypt
```

The elegance of this architecture is that *each control prevents a different threat*. Separate account = isolation from operating account compromise. Object Lock Compliance = even root cannot delete within the retention period (defense against insiders and ransomware). KMS = confidentiality + separation of decryption permissions. Integrity validation = cryptographic proof of tampering. SourceOrgID/bucket-owner ACL = confused deputy defense. Even if one is breached, the rest hold. And because all logs gather in one place, the multi-layer correlation analysis seen on Day 3 (CloudTrail + Flow Log + Resolver) becomes possible. Tomorrow (Day 5) weaves all these pieces - activity (CloudTrail), configuration (Config), network (Flow/Resolver), and integrity, retention, and centralization - into a single breach investigation scenario.

## One More Layer of Prevention: Forbidding the Disabling of Logging Itself with an SCP

An organization trail prevents members from turning off *that trail*. But stopping the Config recorder in a member account, deleting its own account's flow log, or deleting a log group is a separate matter. This layer is handled by a **service control policy (SCP)**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyDisablingSecurityLogging",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail",
        "cloudtrail:UpdateTrail",
        "cloudtrail:PutEventSelectors",
        "config:StopConfigurationRecorder",
        "config:DeleteConfigurationRecorder",
        "config:DeleteDeliveryChannel",
        "config:DeleteConfigRule",
        "ec2:DeleteFlowLogs",
        "guardduty:DeleteDetector",
        "guardduty:UpdateDetector"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": [
            "arn:aws:iam::*:role/OrgSecurityAutomationRole",
            "arn:aws:iam::*:role/AWSControlTowerExecution"
          ]
        }
      }
    }
  ]
}
```

SCPs have two well-known limitations. First, **they do not apply to the management account** - so the management account is itself the most dangerous asset in the organization, and the rule is not to use it for everyday work. Second, an SCP only sets the *upper bound of permissions* and does not grant permissions, so nothing is allowed by an SCP alone. And the moment you set up an exception role (the `ArnNotLike` in the policy above), **whoever can assume that role becomes someone who can turn off logging**. Keep exceptions to the minimum, and separately monitor the `AssumeRole` of that role itself. If you do not write down a hole you have made in a control, no one will remember it a few months later.

## The Conflict Between Retention Cost and Verifiability

Seven-year retention comes with a cost problem, and the moment you touch things to reduce cost, verifiability wobbles.

| Storage tier | Characteristics | Judgment from a log retention viewpoint |
|--------------|------|---------------------|
| S3 Standard | Immediate access | The most recent 90 days to 1 year - the period actually used in investigations |
| S3 Standard-IA | Cheap, immediate access | Suitable for logs in years 1-2 |
| Glacier Instant Retrieval | Cheaper, immediate access | The rarely viewed regulatory retention period |
| Glacier Flexible / Deep Archive | Cheapest, **restore wait required** | Pure regulatory retention. Hard to use in investigations |

If you move logs down to Deep Archive, `aws cloudtrail validate-logs` cannot validate that period - because the objects cannot be read immediately. When you receive the two requirements "7-year retention + integrity proof at any time" simultaneously, you must design the lifecycle transition timing together with the restore time needed during an audit. A compromise commonly used in practice is to **move the log bodies deep while leaving the small-size digests in an immediate-access tier**. As long as the digests are alive, you can at least confirm at any time that "the chain has not been broken," and you only need to restore the bodies at the moment a full validation is required. Also, objects with Object Lock applied are **not deleted** by a lifecycle within the retention period - you need to distinguish that tier transitions happen but expiration does not.

```json
{
  "Rules": [
    {
      "ID": "logs-tiering",
      "Status": "Enabled",
      "Filter": { "Prefix": "AWSLogs/o-exampleorgid/" },
      "Transitions": [
        { "Days": 90,  "StorageClass": "STANDARD_IA" },
        { "Days": 365, "StorageClass": "GLACIER_IR" }
      ]
    },
    {
      "ID": "keep-digests-hot",
      "Status": "Enabled",
      "Filter": { "Prefix": "AWSLogs/o-exampleorgid/CloudTrail-Digest/" },
      "Transitions": [
        { "Days": 365, "StorageClass": "STANDARD_IA" }
      ]
    }
  ]
}
```

When you gather logs from many accounts in many formats, you eventually hit the problem that "the schemas are all different, so correlation analysis is hard." CloudTrail is JSON, Flow Logs are space-delimited text, Resolver logs are another JSON, and third-party security products have their own formats. AWS **Security Lake** is a service aimed at this problem: it gathers security logs from multiple sources into an account-owned S3, normalizes them into a common schema called **OCSF (Open Cybersecurity Schema Framework)**, and gives subscribers (analysis tools, SIEMs) standardized access. The distinction to remember from an exam viewpoint is this - the assembly you have learned so far (organization trail + logging account + Object Lock + KMS) is a **central repository you build yourself**, and Security Lake is the **option that gives you normalization and subscriber management as a managed service**. When wording like "normalize logs from multiple sources into a common schema and provide them to analysis tools" appears, think of Security Lake, but for "retain original logs immutably at the lowest cost," it is still S3 + Object Lock.

## Audit Response Runbook: What You Actually Run to Show Proof

This is the order of commands to run when an auditor demands "prove that the audit logs are trustworthy." This order is itself a list of the controls learned today.

```bash
# ① Does the trail exist, is it organization-wide, is it multi-Region, and is it recording right now?
aws cloudtrail describe-trails --query 'trailList[].{n:Name,org:IsOrganizationTrail,multi:IsMultiRegionTrail,valid:LogFileValidationEnabled,kms:KmsKeyId,bucket:S3BucketName}'
aws cloudtrail get-trail-status --name org-audit-trail --query '{logging:IsLogging,lastDelivery:LatestDeliveryTime,lastError:LatestDeliveryError}'

# ② Is the log bucket protected immutably?
aws s3api get-object-lock-configuration --bucket central-audit-logs
aws s3api get-bucket-versioning        --bucket central-audit-logs
aws s3api get-bucket-encryption        --bucket central-audit-logs
aws s3api get-public-access-block      --bucket central-audit-logs

# ③ Can no one write or delete freely?
aws s3api get-bucket-policy --bucket central-audit-logs --query Policy --output text

# ④ Was there really no tampering? (the whole period under audit)
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/org-audit-trail \
  --start-time 2026-01-01T00:00:00Z --end-time 2026-06-30T00:00:00Z

# ⑤ Was there any attempt to turn off logging?
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=StopLogging
```

`LatestDeliveryError` in ① is especially important. If this field has a value, it means **the trail is on but the logs are failing to reach the bucket**. This happens when the bucket policy was wrongly changed, the KMS key was disabled, or the bucket was deleted. Because the trail list in the console shows green, if you do not check this field directly you will discover it only after weeks of lost logs. **"It is on" and "it is arriving" are different statements.**

## 📌 Key Takeaways

Reduced to one sentence, today's topic is this - **the value of a log is complete only when even the person who created it cannot delete it.** Four layers are needed to reach that state. First, **isolation**: send logs to a separate logging account so that a compromise of operating accounts cannot reach the evidence. Second, **immutability**: Object Lock Compliance blocks deletion by anyone, including root (Governance can be bypassed, so it does not satisfy a requirement of "no one"). Third, **confidentiality and separation of permissions**: SSE-KMS splits S3 access and decryption permission into two independent locks, and `kms:ViaService` and the encryption context narrow the paths through which the key can be used. Fourth, **proof**: the hash chain of the CloudTrail digest reveals tampering after the fact.

And two conditions are attached on top of these four layers. Every resource policy that receives logs cross-account must have `bucket-owner-full-control` together with `aws:SourceArn`/`SourceOrgID` (securing ownership + blocking the confused deputy), and an SCP must set an upper bound so that no one in the organization can turn off logging. Finally, do not forget - the moment you move logs to a deep tier to cut costs, verifiability wobbles. Leaving at least the digests in an immediate-access tier is cheap insurance.

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
