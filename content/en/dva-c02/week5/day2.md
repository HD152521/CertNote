# Day 2 - S3: Versioning, Lifecycle Policies, and the Inner Workings of Replication

When they first learn S3 versioning, many developers brush past it thinking "oh, it's just a backup feature." Then they hit a situation in production where storage costs suddenly go 10x after enabling versioning, or they experience a file they thought they deleted still showing up in the audit system — and only then do they truly understand how versioning actually works. This day digs deep into the internal mechanism of versioning, the transition graph of lifecycle policies, and why replication operates asynchronously along with its implications.

## The Internal Structure of Versioning — Delete Markers and Version IDs

In an S3 bucket with versioning enabled, an object is stored not as a simple key-value pair but as a combination of **key + version ID**. The version ID is an opaque string that S3 auto-generates (e.g., `versionId: "3/L4kqtJlcpXrALLEAjahyKwzSEFI.B`), and a new version is created on every PUT request.

An object uploaded when versioning was not enabled has a version ID of `null`. Even if you enable versioning later, the version ID of existing objects remains `null`. This point often causes confusion in practice — people ask why existing files have no versions even though versioning was turned on.

```
[Object timeline when versioning is enabled]

PUT report.pdf  → version abc123 (latest)
PUT report.pdf  → version def456 (latest)
DELETE report.pdf → delete marker ghi789 (latest, no content)

In the bucket listing: report.pdf not shown (marker is latest)
GET report.pdf  → 404 Not Found

Delete the marker (DELETE marker ghi789):
  → version def456 becomes the latest again
  → GET report.pdf → works normally
```

> 💡 **Related theory**: The delete-marker pattern is identical to the **tombstone** technique in distributed databases. Apache Cassandra and Amazon DynamoDB use the same principle — instead of actually deleting data immediately, they leave only a marker saying "this key was deleted," and remove the actual data later during compaction or a cleanup process. In S3, when a delete marker becomes the latest version, that object is logically in a deleted state, but the previous versions physically exist and can be accessed only by specifying their version ID.

## The 3 States of Versioning and Their Implications

S3 versioning has exactly three states.

**Unversioned (disabled, default)**: A new PUT completely overwrites the previous object. Previous data is unrecoverable. There are no version IDs, and the version ID of every object is `null`.

**Enabled**: All versions are preserved. A new version ID is created on each PUT. A delete adds a delete marker. This state **cannot be disabled (reverted to Unversioned).** Once turned on, it cannot be turned off.

**Suspended**: New PUTs are stored with version ID `null` and overwrite the previous `null` version. Existing versions are retained. No new versions are created.

> ⚠️ **Trap**: When there is a requirement to "disable versioning," the only correct answer is Suspend. There is no way to revert to Disabled. On the exam, if it asks "how to turn off versioning," the answer is "set it to the Suspended state."

## MFA Delete — The Root Account's Last Line of Defense

MFA Delete requires MFA authentication for two operations: ① permanent deletion of a version (a DELETE with an explicit version ID), and ② changing the versioning state (Enabled ↔ Suspended). This feature can be **enabled/disabled only by the root account**.

Why only the root account? To prevent the scenario where, if an administrator IAM user's credentials are stolen, the attacker deletes all versioned data. The root account holds a separate MFA device and is not used for day-to-day operations — this combination forms the "last line of defense."

Enabling MFA Delete is possible only via the CLI, not from the console.

```bash
# Enable MFA Delete (can be run only as the root account)
aws s3api put-bucket-versioning \
  --bucket my-critical-bucket \
  --versioning-configuration Status=Enabled,MFADelete=Enabled \
  --mfa "arn:aws:iam::123456789012:mfa/root-account-mfa-device 123456"
```

> 📚 **Case study**: In 2019, a DevOps engineer at a SaaS company had their credentials stolen in a phishing attack. Using the stolen administrator privileges, the attacker permanently deleted all of the versioned data in S3. Because MFA Delete was not configured on the bucket at the time, recovery was impossible. Afterward, this company configured MFA Delete on all critical buckets and additionally applied Object Lock Compliance mode. The lesson: versioning alone is not enough — you need a separate layer that protects the versions themselves from deletion.

## Lifecycle Policies — Transition Direction and the Impossible Reverse

A lifecycle policy consists of two kinds of rules. **Transition Action**: over time, change the storage class. **Expiration Action**: over time, delete (or add a delete marker).

The important thing is that transitions are one-directional. You can only move toward "cheaper" classes; the reverse direction is impossible. If you need the reverse, you must Restore or copy the object.

```
[Possible transition directions]

Standard 
  → Standard-IA (after 30+ days elapsed)
  → Intelligent-Tiering
  → Glacier Instant Retrieval (90+ days)
  → Glacier Flexible Retrieval
  → Glacier Deep Archive

Standard-IA
  → Intelligent-Tiering
  → Glacier Instant Retrieval
  → Glacier Flexible Retrieval  
  → Glacier Deep Archive

Intelligent-Tiering
  → Glacier Instant Retrieval
  → Glacier Flexible Retrieval
  → Glacier Deep Archive

Glacier Instant Retrieval
  → Glacier Flexible Retrieval
  → Glacier Deep Archive

Glacier Flexible → Glacier Deep Archive

[Impossible transitions]
Glacier → Standard (reverse not allowed)
Deep Archive → all others (reverse not allowed)
Standard-IA → Standard (reverse not allowed)
```

> ⚠️ **Trap**: "Can you go back from Intelligent-Tiering to Standard?" is an exam trap. It is not possible via a lifecycle policy. You must manually copy the object (a COPY operation) while specifying the storage class as Standard. This copy incurs API request cost.

## Lifecycle Policy Example — A Typical Enterprise Pattern

```json
{
  "Rules": [
    {
      "ID": "LogArchiveRule",
      "Status": "Enabled",
      "Filter": { "Prefix": "logs/" },
      "Transitions": [
        { "Days": 30, "StorageClass": "STANDARD_IA" },
        { "Days": 90, "StorageClass": "GLACIER" },
        { "Days": 365, "StorageClass": "DEEP_ARCHIVE" }
      ],
      "Expiration": { "Days": 2555 },
      "NoncurrentVersionTransitions": [
        { "NoncurrentDays": 30, "StorageClass": "STANDARD_IA" }
      ],
      "NoncurrentVersionExpiration": { "NoncurrentDays": 90 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

Here, `NoncurrentVersionExpiration` is the key. In a versioning-enabled bucket, if you do not automatically delete previous versions (NonCurrent Versions), storage piles up with every PUT. Overwrite a file 100 times and all 100 versions are stored. This is the cause of the "enabled versioning, then cost exploded" problem.

`AbortIncompleteMultipartUpload` is also important. If a multipart upload is started but not completed, the uploaded parts remain in S3 without a completion operation and continue to incur cost. You must clean up these "zombie multiparts" with automatic abort after 7 days.

> 🔍 **Going deeper**: S3 lifecycle policies are evaluated once a day, based on midnight (UTC). Even if it says "transition after 30 days," the transition does not begin exactly 30 days later but at the next evaluation point (midnight) after 30 days have passed. And the transition itself does not complete instantly either — it can take several hours. This delay is not specified in the SLA document, so lifecycle policies should be used for "approximate period" management, not for "exact time" control.

## Object Lock — The Implementation of WORM Storage

Object Lock is a feature that makes an object **Write Once Read Many (WORM): once written, it cannot be modified or deleted**. It is essential for financial regulation (SEC Rule 17a-4), medical regulation (HIPAA), and legal evidence preservation.

There are two retention modes. **Governance mode** lets a user with a special IAM permission (`s3:BypassGovernanceRetention`) bypass the retention or adjust the period. **Compliance mode** allows **no one** — including the root account — to delete the object or change the mode before the retention period. Not even AWS Support can.

**Legal Hold** is a toggle that retains an object regardless of a period. It is used in a pattern of locking data while a lawsuit is in progress and releasing it when the lawsuit ends.

> 💡 **Related theory**: WORM storage is a concept that started in the 1990s with optical discs (CD-R, DVD-R). At the time, financial institutions stored immutable audit logs on optical media. S3 Object Lock is a cloud-native implementation of this concept and can replace WORM storage appliances (NetApp SnapLock, EMC Centera). To meet the SEC Rule 17a-4(f)(2) requirements, you must use Compliance mode and obtain a compliance letter from AWS.

## The Inner Workings of Replication — Asynchronous, and What That Means

S3 Replication is **asynchronous** by default. If you look at the bucket in the other region immediately after a PUT completes, the object may not yet be there. This asynchronous gap is the replication lag. In most cases it is seconds to minutes, but it can be longer during a network partition or at peak time.

**CRR (Cross-Region Replication)** is used for disaster recovery (failing over on a failure in another region) and global latency optimization (reading a replica in a nearer region). **SRR (Same-Region Replication)** is used for dev/staging environment separation (mirroring production data to a test bucket in real time), log aggregation (bringing logs from multiple accounts into a central bucket), and replication to a different account within the same region for legal reasons.

The key requirement for replication: both buckets must have versioning enabled. The reason is that replication uses version IDs to identify objects.

| Item | Details |
|------|------|
| Replication trigger | New PUT by default; metadata/tag changes also optional |
| Not replication targets | Objects transitioned by lifecycle policy, SSE-C-encrypted objects |
| Delete marker replication | Optional (OFF by default) |
| Replication of existing objects | Use S3 Batch Replication separately |
| Bidirectional replication | Supported since 2019 (Active-Active DR) |
| KMS-encrypted objects | Destination-region KMS key must be specified separately |

> ⚠️ **Trap**: If you enable delete-marker replication bidirectionally, a delete on one side is replicated as a delete marker to the other side too. When two buckets are operated in an Active-Active pattern, this setting can cause an unexpected "cross-delete." Bidirectional replication + delete-marker replication must be configured very carefully.

## Replication Time Control (RTC) — Turning Replication Lag into an SLA

RTC (Replication Time Control) is a paid option in which AWS provides an SLA to replicate 99.99% of objects **within 15 minutes**. At the same time, Replication Metrics is automatically enabled, so you can monitor replication lag, the number of objects pending replication, and so on via CloudWatch.

Scenarios where you should use RTC: when the regulatory RPO (Recovery Point Objective) is specified as within 15 minutes, real-time risk-data replication at a financial institution, or disaster recovery of patient data at a medical institution.

> 📚 **Case study**: In 2022, the global fintech company Revolut adopted S3 RTC to align with the UK Financial Conduct Authority's (FCA) operational-resilience regulations. The FCA required an RPO of 15 minutes for "critical data" of key IT services, and the lag of standard S3 replication could not be guaranteed as an SLA. After adopting RTC, they were able to include replication-lag metrics in their audit reports.

## S3 Inventory — Managing the Metadata of Billions of Objects

S3 Inventory periodically generates a list of all objects in a bucket in CSV, ORC, or Parquet format. It can be generated daily/weekly, and the generated report is stored in another S3 bucket.

Situations where you need S3 Inventory in practice: ① auditing the encryption status of billions of objects — a LIST operation is too slow and too costly. ② finding objects that lack a specific tag. ③ checking replication status. ④ using it as the input for Batch Operations.

Exam scenario: "You must check the encryption status of 100 million objects" → the answer is S3 Inventory + Athena for SQL analysis.

## S3 Batch Operations — Bulk Operations on Objects at Scale

Batch Operations is a managed service that applies the same operation to billions of S3 objects. It takes an S3 Inventory report or a manifest CSV you write yourself as input, and runs a specified Lambda function or a built-in operation in parallel.

Supported operations: Copy, Replace Object Tagging, Replace Object ACL, change Object Lock retention settings, invoke a Lambda function, Restore from Glacier.

"Apply SSE-KMS encryption to 100 million existing objects" → the answer is to run a Copy operation (specifying SSE-KMS) with Batch Operations.

A lifecycle policy applies to newly stored objects but not to already-stored objects. When migrating existing objects, you must use Batch Operations.

> 🔍 **Going deeper**: The internal operation of S3 Batch Operations is similar to the distributed processing of Spark or Flink. When you create a Job, S3 internally distributes the work to thousands of workers, and each worker processes a portion of the manifest. Failed items are retried, and after completion a completion report containing success/failure statistics is generated in a specified S3 bucket.

The internal operation of versioning, lifecycle, and replication we looked at today are the features that turn S3 from a mere file store into an enterprise-grade data management platform. In the next day, we take a deep look at the security model — bucket policies, ACLs, encryption — that controls who can access this data and how.

## 📝 연습 문제

**문제 1.** After enabling versioning on an S3 bucket, you deleted a specific file with the DELETE API. When you then send a GET request for the same key, what is the result?

A) The content of the most recently uploaded version is returned
B) A 404 Not Found is returned, and previous versions are accessible via their version IDs
C) The content of the oldest version is returned
D) An empty response (200 OK) is returned

**정답: B**
해설: In a versioning-enabled bucket, running a DELETE without a version ID does not actually delete the object but adds a Delete Marker. Because the delete marker becomes the latest version, a GET request without a version ID returns 404. Previous versions physically exist and can be accessed by specifying a particular version ID. To actually permanently delete a specific version, you must specify the version ID in the DELETE request.

---

**문제 2.** Which of the following is an impossible transition in an S3 lifecycle policy?

A) Standard → Standard-IA (after 30 days)
B) Glacier Flexible Retrieval → Glacier Deep Archive
C) Standard-IA → Standard (after 30 days)
D) Standard-IA → Glacier Flexible Retrieval

**정답: C**
해설: S3 lifecycle transitions are one-directional and can only move toward a cheaper (less frequently accessed) class. A reverse transition from Standard-IA to Standard is not possible via a lifecycle policy. To go back to the original class, you must copy the object directly while specifying the storage class. A (Standard→IA after 30 days), B (Glacier→Deep Archive), and D (IA→Glacier) are all valid transition directions.

---

**문제 3.** Which is the correct description of S3 replication?

A) When you enable replication, existing objects are automatically replicated too
B) CRR can be used only for disaster recovery, and SRR only for cost savings
C) For replication to work, both the source and destination buckets must have versioning enabled
D) Delete markers are always replicated

**정답: C**
해설: The key requirement of S3 replication is that both the source and destination buckets have versioning enabled, because replication operates based on version IDs. A is wrong — existing objects are not replicated, and you must use S3 Batch Replication separately. B is wrong — CRR is also used for latency optimization, and SRR is also used for dev-environment separation or log aggregation. D is wrong — delete-marker replication is OFF by default and is optionally enabled.

---

**문제 4.** Which of the following is a correct description of S3 Object Lock Compliance mode?

A) A user with IAM administrator privileges can delete before the retention period
B) The root account can release the retention at any time
C) If you request it from AWS Support, deletion before the retention period is possible
D) Until the retention period expires, no one — including the root account — can delete the object or change the mode

**정답: D**
해설: Compliance mode provides the strongest WORM protection. The root account, IAM administrators, and AWS Support all cannot delete the object or change the mode before the retention period. This is the key difference from Governance mode — in Governance mode, a user with the `s3:BypassGovernanceRetention` permission can bypass the retention. In financial and medical regulatory environments, you must use Compliance mode to meet requirements such as SEC Rule 17a-4.

---

**문제 5.** In a versioning-enabled S3 bucket, storage costs came out much higher than expected. What is the most likely cause and solution?

A) CRR is enabled, incurring replication costs → disable CRR
B) Previous versions are not being automatically deleted, so all versions are being stored → set NoncurrentVersionExpiration via a lifecycle policy
C) Versioning itself has an additional cost → suspend versioning
D) MFA Delete is enabled, incurring additional cost → disable MFA Delete

**정답: B**
해설: With versioning enabled, a new version is created each time you overwrite an object, and all previous versions are stored as well. Previous versions are not automatically deleted, and each incurs its own storage cost. Overwrite a file 10 times a day and you can create 300 versions in a month. The solution is to use a `NoncurrentVersionExpiration` rule to automatically delete previous versions older than a certain period (e.g., 30 days). Versioning itself has no additional cost, and MFA Delete is unrelated to cost.

---
