# Day 1 - CloudTrail: Management/Data Events, Organization Trail, Log File Integrity Validation, CloudTrail Lake

The essence of auditing is the ability to reconstruct "who, when, what, where, and how" after the fact. The primary evidence answering this question in AWS is **CloudTrail**. CloudTrail records nearly every API call occurring within an account as JSON events. From a security exam perspective, the core question is "what does CloudTrail *record and not record*" and "how do we prove that recording *has not been tampered with*."

CloudTrail exists in two modes. **Event history** is enabled by default on all accounts, showing management events from the last 90 days (cannot be saved or exported, read-only single-region console view), and **Trail**, which users create explicitly for long-term S3 storage. When you see "long-term retention," "forensics," or "regulatory compliance," Trail or CloudTrail Lake is the answer, not Event history.

## Three Types of Events: Management / Data / Insights

CloudTrail's recorded events split into three distinct categories. Missing this distinction leads to traps like "why isn't my S3 GetObject showing in logs?"

- **Management events** (control plane): API calls affecting resources. `RunInstances`, `CreateBucket`, `AttachRolePolicy`, `ConsoleLogin` etc. Recorded by default; the first trail's management event copy is free.
- **Data events** (data plane): Operations on data within resources. S3 `GetObject`/`PutObject`/`DeleteObject`, Lambda `Invoke`, DynamoDB `PutItem` etc. **Disabled by default**, high volume, requires additional fees.
- **Insights events**: ML-detected abnormal *rates* of API calls (e.g., `RunInstances` at 10x usual frequency). Requires separate activation.

```json
{
  "eventVersion": "1.09",
  "eventTime": "2026-06-24T08:14:22Z",
  "eventSource": "s3.amazonaws.com",
  "eventName": "GetObject",
  "awsRegion": "ap-northeast-2",
  "sourceIPAddress": "203.0.113.10",
  "userIdentity": {
    "type": "AssumedRole",
    "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc",
    "sessionContext": { "attributes": { "mfaAuthenticated": "false" } }
  },
  "resources": [
    { "type": "AWS::S3::Object", "ARN": "arn:aws:s3:::secret-data/payroll.csv" }
  ],
  "readOnly": true,
  "managementEvent": false,
  "eventCategory": "Data"
}
```

> ⚠️ **Pitfall**: Exam favorite. "Track who downloaded objects from an S3 bucket" cannot be answered with default trail alone. `GetObject` is a *data event*, so you must explicitly add S3 data event selector to the trail for evidence to exist. Similarly, tracking Lambda invocations requires Lambda data event selectors. Note that `userIdentity.sessionContext` shows MFA usage and which role was assumed.

## Advanced Event Selectors: Precise Data Event Filtering

Data events can explode in volume, so **advanced event selectors** narrow them down. Filter by specific prefix S3 objects, specific functions, read-only or write-only etc. using fields like `eventName`, `resources.ARN`, `readOnly`.

```json
{
  "AdvancedEventSelectors": [
    {
      "Name": "Log writes to sensitive prefix only",
      "FieldSelectors": [
        { "Field": "eventCategory", "Equals": ["Data"] },
        { "Field": "resources.type", "Equals": ["AWS::S3::Object"] },
        { "Field": "resources.ARN", "StartsWith": ["arn:aws:s3:::secret-data/payroll/"] },
        { "Field": "readOnly", "Equals": ["false"] }
      ]
    }
  ]
}
```

This records *only* writes to the sensitive prefix, controlling cost while capturing critical evidence. For exams: "reduce data event cost while auditing only specific bucket changes" → advanced event selector is the answer.

## Multi-Region Trail: Collect Everything in One Place

Trails can be single-region or **multi-region**. Multi-region trails collect all regional events to a single S3 bucket. **Global service events** like IAM, STS, CloudFront originate in a specific region (mostly us-east-1), so multi-region trail or explicit global service event logging must be enabled to catch everything.

> 💡 **Related Theory**: The first principle of audit log design is *completeness*. In security incident investigations, "that region has no logs" is fatal. So the baseline recommendation is always a single multi-region trail with all management events (both read and write). This prevents *region hopping* — attackers trying to spin up resources in unmonitored regions.

## Organization Trail: Multi-Account Centralized Audit

Creating an **organization trail** from the AWS Organizations management account (or delegated administrator) automatically applies that identical trail to *all member accounts*. Member account administrators cannot view or disable this trail (it may be read-only exposed but cannot be deleted or modified). New accounts joining the organization are automatically included.

```bash
aws cloudtrail create-trail \
  --name org-audit-trail \
  --s3-bucket-name central-audit-logs-111122223333 \
  --is-organization-trail \
  --is-multi-region-trail \
  --kms-key-id arn:aws:kms:us-east-1:111122223333:key/aaaa-bbbb
```

> 🎯 **Scenario**: "In a 200-account organization, guarantee centralized audit that no account administrator can disable." Answer: Create organization trail (multi-region) in management account and aggregate logs to S3 bucket in separate logging account. Individual trails per member account lack consistency and enforcement.

## Log File Integrity Validation

Audit log value rests on the trust that "it has not been tampered with." CloudTrail provides cryptographic guarantee via **log file integrity validation**. When enabled, CloudTrail generates **digest files** hourly and stores them separately in S3.

How it works:
1. Compute SHA-256 *hash* of each log file.
2. Record those hashes and *the hash of the previous digest file* in the hourly digest — digests form a **hash chain**.
3. Digest files are **RSA-signed** with CloudTrail's private key. Verification uses AWS public key.

```bash
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:us-east-1:111122223333:trail/org-audit-trail \
  --start-time 2026-06-20T00:00:00Z
```

> 💡 **Related Theory**: This structure mirrors *Merkle chains/append-only integrity* used in blockchain and Git. If someone deletes or modifies a past log file, that file's SHA-256 differs from the digest record, and if someone forges the digest, the RSA signature and chain linkage break. This creates *tamper-evident* detection. But this *detects* tampering, not *prevents* it. To prevent tampering itself requires S3 Object Lock (day 4).

> ⚠️ **Pitfall**: Integrity validation "proves logs haven't changed" but cannot recover events that were never recorded in the first place. If digest files are deleted, that period's validation becomes impossible, so protecting logs and digests via separate account and Object Lock is what completes the control.

## CloudTrail Lake: Query Audit Logs as a Queryable Data Lake

Traditional trails dump logs as JSON to S3. Investigating requires building Athena tables or manual parsing. **CloudTrail Lake** stores events in *immutable* data store and lets you **query directly with SQL**. Retention goes up to 10 years (extensible).

```sql
SELECT eventTime, userIdentity.arn, eventName, sourceIPAddress
FROM event_data_store_id
WHERE eventName = 'ConsoleLogin'
  AND element_at(additionalEventData, 'MFAUsed') = 'No'
  AND eventTime > '2026-06-01 00:00:00'
ORDER BY eventTime DESC;
```

CloudTrail Lake strengths:
- **Immediate Query**: Execute SQL without ETL or Athena setup.
- **Event Data Store**: Collects not only management/data/Insights events but **external sources** (other AWS services, on-prem, SaaS audit logs).
- **Organization aggregation** and Athena federation support.

> 🎯 **Scenario**: "Security analysts want to ad-hoc SQL-query 2 years of CloudTrail without coding." Answer is CloudTrail Lake. S3 + Athena is possible but carries table/partition management overhead; Lake provides retention, immutability, and query in one. But Lake has different cost model than trail, so if the goal is "cheapest simple storage," S3 trail is still better.

## CloudTrail and Near-Real-Time Response

CloudTrail is a recording tool, but combined with **CloudWatch Logs** or **EventBridge** rules, near-real-time detection and response become possible. Example: catch "root account login" or "CloudTrail disabled (`StopLogging`)" events via EventBridge to trigger SNS alerts and Lambda auto-response.

> 🔍 **Deeper Dive**: One of the first things attackers target post-breach is *log disabling* — `StopLogging`, `DeleteTrail`, `PutEventSelectors` to turn off data events etc. So mature detection design watches "CloudTrail config changes" themselves. EventBridge rules catch `eventName in (StopLogging, DeleteTrail, UpdateTrail)` for immediate alerting, use organization trail to prevent member accounts from disabling, and send logs to separate account so *even if attackers gain that account's permissions, they cannot delete logs*. This achieves "configuration and activity dual audit" with tomorrow (day 2 AWS Config).

---

## 📝 Practice Questions

**Question 1.** You are trying to trace who downloaded a specific object from an S3 bucket, but the `GetObject` call does not appear in the default multi-Region trail. Which cause and resolution is correct?

A) `GetObject` is a global service event, so a us-east-1 trail is needed  
B) `GetObject` is a data event, so it is not recorded by default, and you must add an S3 data event selector to the trail  
C) Log file integrity validation must be turned on for data events to be recorded  
D) Insights events must be enabled  

**Answer: B**  
Explanation: S3 object-level operations (`GetObject`/`PutObject`, etc.) are data events, which are data plane operations and are off by default. You must explicitly add an S3 data event selector (or advanced event selector) to the trail for them to be recorded. `GetObject` is not a global service event, integrity validation is for tamper detection and does not expand what is recorded, and Insights detects anomalies in call *rates*, which is unrelated to tracking individual downloads.

---

**Question 2.** In a 200-account organization, you must guarantee centralized auditing that no member account administrator can turn off or change. What is the most appropriate design?

A) Create an individual trail in each member account and check it regularly  
B) Create a multi-Region organization trail in the management account and aggregate the logs into an S3 bucket in a dedicated logging account  
C) Export Event history every 90 days and store it  
D) Manually collect each account's CloudWatch Logs  

**Answer: B**  
Explanation: An organization trail is created in the management account (or a delegated administrator) and automatically applies to all member accounts, and member account administrators cannot turn it off or delete it. New accounts are included automatically. If logs are sent to a separate logging account, a member account cannot tamper with the logs even if it obtains permissions. Individual trails lack consistency and enforceability, Event history covers 90 days and cannot be exported, and manual aggregation is vulnerable to omission and tampering.

---

**Question 3.** A compliance auditor requires cryptographic proof that CloudTrail log files from the past 3 months have not been tampered with. Which feature directly provides this?

A) S3 bucket versioning  
B) CloudTrail log file integrity validation (SHA-256 hash + RSA-signed digest chain)  
C) Insights events  
D) KMS envelope encryption  

**Answer: B**  
Explanation: Log file integrity validation computes the SHA-256 hash of each log file, records it in an hourly digest file signed with RSA, and links each digest to the previous digest in a hash chain. Therefore any tampering with a log or digest is detected at the validation step. Versioning only keeps overwrite history and provides no cryptographic proof, Insights is anomaly detection, and KMS encryption is a confidentiality control that differs from integrity *proof*.

---

**Question 4.** A security analyst wants to immediately investigate the past 2 years of CloudTrail events with SQL, without a separate ETL or Athena table setup. What is most suitable?

A) Filter in the Event history console  
B) Run SQL queries in a CloudTrail Lake event data store  
C) Manually parse the JSON stored in S3 every time  
D) The Insights dashboard  

**Answer: B**  
Explanation: CloudTrail Lake stores events in an immutable data store and lets you query them directly with SQL, supporting retention of up to 10 years. No ETL or Athena table/partition management is needed. Event history covers 90 days and cannot be exported, manual JSON parsing is inefficient, and Insights is a dashboard for call-rate anomaly detection that does not offer ad hoc SQL investigation.

---

**Question 5.** The incident response team requests: "Immediately detect and alert on an attacker turning off CloudTrail after intrusion (`StopLogging`)." What is the most appropriate configuration?

A) Turn on only log file integrity validation for the trail  
B) Match CloudTrail management events with an EventBridge rule (`eventName in [StopLogging, DeleteTrail, UpdateTrail]`) and trigger real-time response through SNS/Lambda  
C) Add a data event selector  
D) Turn on Insights events and review weekly  

**Answer: B**  
Explanation: `StopLogging`/`DeleteTrail`/`UpdateTrail` are recorded as management events, and you can match these events in real time with an EventBridge rule to trigger an SNS alert or an automatic Lambda response. Integrity validation is after-the-fact proof of tampering rather than a real-time alert, data event selectors are for data plane operations, and Insights is rate-based anomaly detection that is lacking in immediacy and precision. Making it impossible to turn off from member accounts with an organization trail is also a complementary measure.

---
