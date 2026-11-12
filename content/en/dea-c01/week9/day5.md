# Day 5 - Week 9 Review: Security and Governance

## 📌 Key Takeaways

- A single data request passes in order through the checkpoints of transport (TLS) → IAM → Lake Formation → KMS → filters and masking → audit records. If it is denied, first work out **which checkpoint** denied it.
- IAM and Lake Formation are in an AND relationship. Both must pass to reach the data, and for encrypted data the KMS key policy must also be right.
- Encryption is distinguished by who holds the key (SSE-S3 / SSE-KMS / SSE-C / client-side). Encryption in transit is enforced separately.
- Macie only detects. What reduces exposure is masking, tokenization, and data filters, and you must decide where to mask (ETL, catalog, or query).
- For sharing, separate Data Exchange (hands over) from Clean Rooms (originals not exposed), and object-level auditing is recorded only if you turn on CloudTrail data events.

## The Checkpoints One Request Passes Through

This week we looked at access control, encryption, sensitive data protection, and governance, one per day. The four topics are not separate features; they are the checkpoints that a single analyst query passes through, in order, before it reaches the data.

```
An analyst's Athena query
   │
   ▼ ① Transport: is it TLS?            (aws:SecureTransport, require_ssl)          Day 2
   ▼ ② IAM: can it call this API?        (athena, glue, lakeformation:GetDataAccess) Day 1
   ▼ ③ Lake Formation: can it see this table?  (SELECT, LF-Tags)                    Day 1
   ▼ ④ KMS: can it decrypt?              (key policy, kms:Decrypt)                   Day 2
   ▼ ⑤ What is returned?                 (data filters, masking, tokens)             Day 1, 3
   ▼ ⑥ Record: who read what?            (CloudTrail data events)                    Day 4
 Result
```

- ① through ④ decide **whether it passes**, ⑤ decides **the visible scope**, and ⑥ decides **after-the-fact proof**. Looking at which of the three the question's requirement belongs to narrows the answer choices.
- The checkpoints cannot substitute for one another. Encryption (④) does not stop an authorized user from seeing PII, and permissions (③) do not record who viewed it.

## "Where Was It Blocked" Lookup Table

| Observed behavior | Blocked checkpoint | What to check |
|------|------|------|
| IAM policies allow everything but the table query fails with insufficient permissions | ③ | Lake Formation `SELECT` and `DESCRIBE`, whether a data filter was granted |
| Lake Formation permissions exist too but it fails | ② | `lakeformation:GetDataAccess` |
| Permissions were narrowed but the user sees everything | ③ is turned off | `Super` for `IAMAllowedPrincipals`, direct S3 permissions |
| Metadata is visible but it fails the moment data is read | ④ | `kms:Decrypt` in the key policy, whether it is a customer managed key |
| Works within the same account but fails only cross-account | One of ②, ③, ④ in one account | Policies in both accounts, RAM invitation, resource link, key policy |
| A security finding that access works over HTTP | ① | The `aws:SecureTransport` deny in the bucket policy |
| An analyst sees the original card numbers | ⑤ | The attachment target and priority of the filter or masking policy |
| There is no record of who read it | ⑥ | Data events, the Redshift user activity log |

- Cross-account problems have three layers: the trust policy (who can assume the role) + the permission policy (what that role can do) + the KMS key policy. If the question says two of them are in place, the remaining one is the answer.

## Telling Look-Alikes Apart

**Four means of "keeping sensitive data from being seen"**

| Means | When it acts | Stored value | What the user sees | Suitable requirement |
|------|------|------|------|------|
| ETL tokenization/hashing (Glue) | Before writing | Changed | Token or hash | We do not want to keep the original in the lake |
| Lake Formation data filter | At read time | Unchanged | The relevant columns and rows are absent | Different visible scope per role (data lake) |
| Redshift dynamic data masking | At query time | Unchanged | Masked value | Show the same table differently per role (warehouse) |
| Macie | Investigates after storage | Unchanged | (Detection results only) | We do not know where it is |

- Macie is different in nature in this table. The other three are **controls**, and Macie is **discovery**. If you pick Macie for a requirement to "make it invisible," it is wrong.

**S3 encryption: who holds the key**

| Method | Key owner | Auditing / control | Representative clue |
|------|------|------|------|
| SSE-S3 | S3 | None | The default, no extra configuration needed |
| SSE-KMS | KMS key | Key policy + CloudTrail | Auditing key use, cross-account |
| DSSE-KMS | KMS key (dual) | Same | A regulation requiring two layers of encryption |
| SSE-C | The customer provides it with each request | AWS does not store the key | Do not entrust the key to AWS, but S3 does the encryption |
| Client-side | The customer | AWS gets only ciphertext | AWS must never see the plaintext |

**Sharing: what the other party gets their hands on**

| Method | What the other party gets | Original rows exposed |
|------|------|------|
| Data Exchange | A dataset (a file copy or in-place access rights) | Exposed |
| Redshift datashare | Live table access | Exposed |
| Lake Formation cross-account sharing | Catalog tables (within the filter scope) | Exposed within the scope |
| S3 bucket policy sharing | The entire object | Exposed |
| Clean Rooms | The results of an agreed analysis | **Not exposed** |

**Audit logs**

| Question | Log |
|------|------|
| Who changed a policy, key, or table | CloudTrail management events |
| Who read this object | CloudTrail data events |
| Requests that failed authentication, objects deleted by a lifecycle rule | S3 server access logs |
| Who ran which SQL in Redshift | Redshift audit logs (user activity log) |
| Where sensitive data is | Macie findings (detection results, not an audit log) |

## Where to Configure: One Page per Service

| Service | Access control | Encryption at rest | Encryption in transit | Auditing |
|------|------|------|------|------|
| S3 | Bucket policy, IAM | Bucket default encryption (SSE-S3, SSE-KMS), Bucket Key | `aws:SecureTransport` | Data events, server access logs |
| Glue Data Catalog | Lake Formation permissions, LF-Tags | Catalog encryption setting | TLS | CloudTrail |
| Glue ETL | Job role (IAM) | Security configuration (S3, logs, bookmarks) | TLS | CloudWatch Logs, CloudTrail |
| Athena | IAM + Lake Formation | Workgroup result encryption | TLS | CloudTrail, query history |
| Redshift | GRANT, roles, dynamic masking | Cluster encryption (applied by default) | `require_ssl` | Audit logging, CloudTrail |
| Kinesis | IAM | Server-side encryption of the stream (KMS) | TLS | CloudTrail |

- Even if the source is encrypted with SSE-KMS, **Athena query results** and **Glue job temporary and log data** follow their own settings. This is where sensitive data leaks through the result bucket or the logs.

## Week 9 Numbers and Defaults on One Page

| Area | Item | Value |
|------|------|------|
| IAM | Evaluation order | Explicit Deny > explicit Allow > implicit deny |
| IAM | Cross-account | Both accounts must allow for it to pass |
| Lake Formation | Initial state | `Super` for `IAMAllowedPrincipals`, controlled by IAM only |
| Lake Formation | Permissions granted with a data filter | `SELECT` only |
| Lake Formation | Cross-account | Uses RAM. Immediate within the same organization, invitation acceptance outside it |
| KMS | Automatic rotation | Optional for customer managed (default period 365 days), yearly for AWS managed |
| KMS | Deletion waiting period | 7 to 30 days, 30 by default |
| S3 | Default encryption | SSE-S3 on all new objects since January 5, 2023 |
| S3 | SSE-C | Blocked by default on new buckets since April 2026 |
| S3 Bucket Key | Effect | Up to 99% reduction in KMS request cost, DSSE-KMS not supported |
| Redshift | Encryption | Applied by default. If you disable the key, it can be deleted after 14 days |
| Macie | Finding retention | 90 days |
| Macie | Custom identifier | Regex 512 characters, 50 keywords, maximum match distance default 50 (1 to 300) |
| Redshift DDM | Default priority | 0. The higher one applies |
| Schema Registry | Recommended compatibility | `BACKWARD` |
| CloudTrail | Default recording | Management events only. You turn on data events yourself |

- Three values changed recently: the rotation period of AWS managed keys (3 years → 1 year), the default blocking of SSE-C, and the default encryption of Redshift. Exam material may still show the old values.

## Integrated Scenario: A Regulated Customer Data Platform

Requirements: Load payment data into a data lake, detect and protect PII, show analysts only masked data, collaborate with partners without exposing originals, audit all access, and respond to GDPR deletion.

```text
[Payment source] --Glue ETL (KMS encryption, tokenization)--> s3://lake-clean/payments/ (Iceberg)
   --Macie scan--> [PII finding] --EventBridge--> [Lambda: restrict access/notify]
   --Lake Formation (data filters, LF-Tags)--> [Analysts: view without PII]
   --Clean Rooms--> [Partners: agreed aggregates only]
   All activity --> CloudTrail (data events) --> audit account bucket
```

| Decision | Choice | Why this choice is required |
|------|------|------|
| Encryption at rest | SSE-KMS (customer managed key) + Bucket Key | Key usage auditing and control are needed, and KMS cost must be reduced for the ETL's bulk reads |
| Transport | Enforce TLS through the bucket policy | It is a layer separate from encryption at rest |
| Card numbers | Tokenize in ETL | Keep joins but do not keep the originals in the lake |
| Detection | Macie automated discovery + discovery jobs for sensitive buckets | Finds PII that slipped past tokenization (free-text fields) |
| Access control | LF-Tags + data filters | Permissions apply automatically even as tables grow, and only the region's rows are visible |
| Partner collaboration | Clean Rooms | Neither side may see the other's original rows |
| Auditing | CloudTrail data events on sensitive buckets | Proves object-level access |
| Deletion | Iceberg row-level DELETE + snapshot cleanup | Remove only one customer's rows and leave nothing in past snapshots either |

```sql
-- GDPR deletion (Iceberg on Athena): logical delete, then clean up snapshots too
DELETE FROM lake_clean.payments WHERE customer_id = 'GDPR-REQ-2026-042';
VACUUM lake_clean.payments;
```

```json
{
  "Name": "analyst_payments_filter",
  "ColumnNames": ["txn_id", "region", "amount_token", "dt"],
  "RowFilter": { "FilterExpression": "region = 'ap-northeast-2'" }
}
```

- For Macie to read this bucket, the customer managed key's key policy must allow Macie. The encryption decision (Day 2) becomes a precondition of the detection decision (Day 3).
- The reason to keep Macie even though you tokenized is the paths the design missed. Controls block "where it should be," and detection finds "where it should not be."

## Three Requests You Actually Get in Operations

| Request | Processing order |
|------|------|
| "Show the sales data to a new analyst" | Check `lakeformation:GetDataAccess` on the role → grant the LF-Tag expression that fits the role (do not add individual table GRANTs) → if PII is not needed, use a filtered permission → do not give direct S3 permissions |
| "Delete all of this customer's data" | Locate copies with lineage → DELETE in each Iceberg table → expire snapshots and VACUUM → handle S3 previous versions, the raw zone, backups, and warehouse copies → keep a record of the handling |
| "Produce who read this bucket last month" | Check whether data events were on during that period → query the logs the trail accumulated with Athena → for a role session, trace back through the `AssumeRole` event to identify the person. If it was not turned on, there is no way to create it retroactively |

> 💡 **Related theory**: Security and governance are not a single control but defense in depth. Encryption (confidentiality) + access control (authorization) + detection (visibility) + auditing (accountability) must work together to meet regulatory and trust requirements. Because one is strong, you cannot omit another.

## Frequently Missed Traps

- **Turning on Lake Formation does not mean control is applied.** If `IAMAllowedPrincipals` remains, data is readable through IAM alone.
- **Lake Formation does not block direct S3 access.** Even with a filter, if the user has `s3:GetObject`, the raw file opens.
- **KMS permissions do not end with the IAM policy.** The key policy must allow IAM delegation or allow directly.
- **Rotating a key does not re-encrypt existing data.** Even if you change default encryption, existing objects stay as they are.
- **A Bucket Key is not giving up key control.** It is only that KMS events show the bucket ARN rather than the object.
- **Macie neither masks nor deletes.** It also does not look outside S3 (Redshift tables).
- **DELETE is not a physical deletion.** Until you expire the snapshots, the data can be read through time travel.
- **datashare and Data Exchange are not "originals not exposed."** They just do not copy; the other party reads the rows.
- **Even with audit logging on, query statements may not be recorded.** In Redshift, `enable_user_activity_logging` is separate.

## Question Clue → Correct Answer Table

| Clue in the question | Correct answer |
|------|------|
| "Card numbers as tokens, only your own region's rows, applied automatically to new tables" | LF-Tags + data filter + ETL tokenization |
| "Prove which role read a specific object" | CloudTrail data events |
| "Originals not exposed to partners, PII excluded for internal analysts" | Clean Rooms + Lake Formation data filter |
| "KMS throttling and cost spike + block plaintext HTTP" | S3 Bucket Key + `aws:SecureTransport` deny |
| "Is a single control enough" | No. Encryption, access control, detection, and auditing together |
| "IAM allows but the query fails" | Lake Formation permission |
| "Another account cannot read an encrypted table" | KMS key policy (customer managed key) |
| "Even AWS must not see the plaintext" | Client-side encryption |

Next week is the last week. We start with an integrated review of Domains 1 and 2 (ingestion and transformation, and store management).

## 📖 Glossary

- **Defense in depth**: A design that protects in multiple layers so that if one control is breached, the next one blocks.
- **Control point**: A point where a request is judged as to whether it passes. Transport, IAM, Lake Formation, and KMS are one each.
- **In-place access**: A sharing method in which you read the provider's store directly instead of receiving a copy of the data.
- **Analysis without exposing originals**: A collaboration method in which you get only agreed aggregate results without seeing the other party's row data.
- **Logical deletion / physical deletion**: Merely marking as deleted versus actually removing from storage. An Iceberg DELETE is the former.
- **Audit account**: An account, separated from operations accounts, where logs are gathered. It keeps operators from altering their own records.
- **Accountability**: The property of being able to prove after the fact who did a given action.
- **Right to be forgotten**: The right of an individual to demand deletion of their own data. A GDPR deletion request is the representative example.

## 📝 Practice Questions

**Question 1.** On a payment data platform, you want analysts to see card numbers as tokens, expose only the rows for their own region, and have permissions applied automatically even when new tables are added. Which combination is the most appropriate?

A) IAM wildcard policy + SSE-S3  
B) S3 bucket policy + client-side encryption  
C) Lake Formation TBAC + data filter + ETL tokenization  
D) Redshift snapshot sharing + partition projection  

**Answer: C**  
Explanation: With TBAC, permissions are applied automatically to a new table as long as its tags match, a data filter restricts columns and rows, and ETL tokenization hides the original card numbers. Wildcards violate least privilege, bucket policies are weak in granularity, and snapshot sharing is unrelated to the requirements.

---

**Question 2.** A security team must prove "which IAM role read a specific object in the payment bucket last month." What setup is required?

A) Enable CloudTrail data events (S3 object-level)  
B) Add a Macie custom identifier  
C) Automatic KMS key rotation  
D) Apply Lake Formation TBAC  

**Answer: A**  
Explanation: Tracking S3 object reads is recorded in CloudTrail data events, which are disabled by default and must be explicitly enabled. Macie is detection, key rotation is encryption hygiene, and TBAC is access control; none of them generates object access audit logs.

---

**Question 3.** You must jointly analyze campaign effectiveness with an external partner without exposing either company's raw customer data. At the same time, you provide in-house analysts with data excluding PII. Which combination of services is correct?

A) Data Exchange for the partner, IAM wildcard for analysts  
B) S3 cross-account bucket sharing for both  
C) Redshift datashare for both  
D) Clean Rooms for the partner, Lake Formation data filter for analysts  

**Answer: D**  
Explanation: Clean Rooms is correct for joint analysis without exposing raw data, and a Lake Formation data filter is correct for providing in-house data excluding PII. Data Exchange, bucket sharing, and datashare hand the raw data over to the other party, which violates the partner requirement.

---

**Question 4.** An ETL job reading a large number of objects from a payment bucket encrypted with SSE-KMS is suffering KMS throttling and a cost spike. Plaintext HTTP access must also be blocked at the same time. Which combination of actions is the most appropriate?

A) Switch to SSE-S3 + versioning  
B) Enable S3 Bucket Key + deny `aws:SecureTransport: false`  
C) Client-side encryption + Glacier transition  
D) Rotate the KMS key daily + Object Lock  

**Answer: B**  
Explanation: A Bucket Key reduces per-object KMS calls, easing cost and throttling, and the SecureTransport deny blocks plaintext HTTP. Switching to SSE-S3 loses key control, client-side encryption and Glacier burden the ETL, and daily rotation and Object Lock are unrelated to the problem.

---

**Question 5.** Which option most accurately describes "defense in depth" in data security and governance?

A) If encryption alone is strong enough, other controls are unnecessary  
B) With access control alone, auditing is not needed  
C) Encryption, access control, detection, and auditing must work together to meet regulatory and trust requirements  
D) All controls can be replaced by IAM alone  

**Answer: C**  
Explanation: Security and governance are a defense in depth that combines confidentiality (encryption), authorization (access control), visibility (detection), and accountability (auditing), and no single one can replace the rest. A, B, and D contain the false premise that a single control is sufficient.

---
