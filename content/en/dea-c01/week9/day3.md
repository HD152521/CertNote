# Day 3 - Protecting Sensitive Data: Macie and Masking

## 📌 Key Takeaways

- Macie finds sensitive data in S3 and tells you **what is where**. It does not mask or delete anything itself. Follow-up actions belong to a separate pipeline.
- There are two kinds of detection criteria: managed data identifiers that AWS provides, and custom data identifiers you build with regular expressions and keywords.
- Masking hides a value when it is displayed (usually irreversible), while tokenization replaces a value with a token and stores the mapping separately so you can reverse it when needed (reversible).
- Redshift dynamic data masking (DDM) leaves the stored values untouched and shows them differently per role **at query time**. A Lake Formation data filter does not return the value at all.
- Automate the response with detection → EventBridge → Lambda. Handle GDPR deletion with row-level DELETE in Iceberg or Hudi, but you also have to clean up snapshots before the data is physically gone.

## Macie Does Two Things

Unintended PII (personally identifiable information) creeps into data lakes: a national ID number typed into a free-text field, a card number printed in a log. Amazon Macie is the service that finds it. The findings Macie produces fall into two categories.

| Category | What it reports | When it is generated | Example types |
|------|------|------|------|
| Policy finding | A change that weakened a bucket's security or access settings | Continuously watches for changes made **after** you turn Macie on | Block Public Access turned off, bucket made public, shared or replicated with an account outside the organization |
| Sensitive data finding | Sensitive data found inside an object | When you run a discovery job or when automated discovery analyzes it | `Financial`, `Personal`, `Credentials`, `CustomIdentifier`, `Multiple` |

- Policy findings are not generated for settings that were already open before you turned Macie on. "Find the buckets that are already public" is a job for viewing the bucket inventory yourself or for another tool (such as Config).
- Findings are retained for **90 days**. To keep them longer, export them through EventBridge or Security Hub, or configure Macie to save discovery results to S3.
- Macie analyzes **S3**. It does not look directly at PII inside Redshift tables or RDS.

## Two Discovery Methods: Automated Discovery and Discovery Jobs

| Item | Automated sensitive data discovery | Sensitive data discovery job |
|------|------|------|
| Scope | All general purpose buckets in the account or organization (exclusions possible) | The buckets and prefixes you specify |
| Method | Continuously evaluates the bucket inventory and **picks sample objects** to analyze | Analyzes the objects in scope, one time or on a schedule |
| Results | Per-bucket sensitivity scores and statistics, sensitive data findings | Sensitive data findings, per-object analysis records |
| Use | A broad map answering "which of the thousands of buckets are risky" | A precise investigation for "check this bucket thoroughly" |
| Configured by | The organization's Macie administrator account or a standalone account | Per account |

- Automated discovery picks representative objects from each bucket. The objects it picks are actually retrieved and their contents inspected. It means it does not sweep everything, not that it does not look at contents.
- You use the two in sequence. Narrow down the risky buckets with automated discovery, then run a discovery job on those buckets for exhaustive verification.

## Identifiers: What Counts as Sensitive

- **Managed data identifiers**: Detection criteria AWS has built in, such as credit card numbers, national ID and passport numbers for various countries, and credentials like AWS secret keys.
- **Custom data identifiers**: Organization-specific patterns (employee IDs, customer account numbers) defined with a regular expression and supporting conditions.
- **Allow list**: Values you want to exclude from detection. Putting in things like a publicly listed main phone number reduces false positives.

```json
{
  "name": "internal-employee-id",
  "regex": "EMP-[0-9]{6}",
  "keywords": ["employee", "employee ID"],
  "ignoreWords": ["EMP-000000"],
  "maximumMatchDistance": 50
}
```

| Component | Role | Limit |
|------|------|------|
| Regular expression | The text pattern to find | Up to 512 characters. Some constructs such as backreferences and lookarounds are not supported |
| Keywords | Words that must appear **near** the pattern | Up to 50, each 3 to 90 characters, case-insensitive |
| Maximum match distance | Number of characters allowed between a keyword and the pattern | 1 to 300, default 50 |
| Ignore words | Values to exclude from results even if they match the pattern | Up to 10, each 4 to 90 characters, case-sensitive |

- Keywords are a device for reducing false positives. Six-digit numbers are everywhere, but a six-digit number within 50 characters after the word "employee ID" is very likely an employee ID. For columnar data like CSV, a keyword in the **column name** also counts.
- A custom data identifier **cannot be modified after it is created.** This is so that the criteria behind past findings do not change. To fix one, create a new one. That is why you test with sample data before creating it.

## How Far Can Macie See into Encrypted Objects

| Object encryption | Can Macie analyze it |
|------|------|
| SSE-S3 | Yes |
| SSE-KMS and DSSE-KMS (AWS managed key) | Yes |
| SSE-KMS and DSSE-KMS (customer managed key) | Only if the key policy allows `kms:Decrypt` for Macie's service-linked role |
| SSE-C | No. Reports metadata only |
| Client-side encryption | No. Reports metadata only |

- "I ran Macie and got no findings" does not mean "there is no sensitive data." If you did not include Macie in the customer managed key's key policy, it simply could not open the contents. If the key belongs to a different account, you must create a grant in addition to allowing it in the key policy.

> 💡 **Related theory**: Macie is a detection tool. Its results go as far as "what is where"; it does not mask, quarantine, or delete. On the exam, answer choices like "mask with Macie" or "delete with Macie" are wrong. Actions after detection are handled by other services chained on through EventBridge.

## Connecting Detection to Response Automatically

```text
[Macie finding] → [EventBridge rule] → [Lambda]
   → restrict access with bucket policy / tag object / SNS notification / record in Security Hub
```

```json
{
  "source": ["aws.macie"],
  "detail-type": ["Macie Finding"],
  "detail": { "type": [{ "prefix": "SensitiveData:S3Object/" }] }
}
```

- Automated response should **not delete objects.** The evidence disappears, and you cannot undo it if it was a false positive. Narrow the access and add a tag so that a person makes the call.
- If you aggregate findings in Security Hub, you can prioritize them together with findings from other security services on one screen.

## Comparing Techniques for Reducing Exposure

| Technique | Result | Reversible | Join/aggregate | Fits when |
|------|------|------|------|------|
| Full masking (redaction) | Replaced with a fixed string | No | No | Lookups that never need the value |
| Partial masking | Only part is shown (`****-****-****-1234`) | No | Limited | Support and verification screens |
| Hashing (deterministic) | Same input → same hash | No | Equality joins possible | Linking by identifier only, without the original |
| Tokenization | Replaced with a meaningless token, mapping kept in a vault | Yes (only by authorized systems) | Yes | Work that needs the original later (payments) |
| Encryption | Ciphertext | Yes (key holders) | Generally no | Protecting data at rest and in transit |
| Column exclusion | The value is not provided at all | Not applicable | No | Users with no reason to see it |

- If a question states "keep joins" together with "original can be restored," it is tokenization. If it says "no need to restore," it is masking or hashing.
- If you hash a column with few distinct values (gender, postal code), it can be reverse-engineered by hashing every possible value and matching. Hashing is not a universal anonymization method.

> 💡 **Related theory**: Tokenization can hide the original while preserving joins and analytics, so payment regulations such as PCI-DSS prefer it. The cost is that the vault holding the mapping between originals and tokens becomes a new asset to protect. The heart of the design is minimizing the systems that can access the vault.

## Where to Mask: Implementation Location

| Location | Means | Characteristics |
|------|------|------|
| ETL stage (before writing) | Glue's Detect PII transform, Spark UDFs | The stored values themselves change. Once masked, it applies to every consumer |
| Catalog permissions (at read time) | Lake Formation data filters | Sensitive columns and rows are **not returned** |
| Warehouse query (at read time) | Redshift dynamic data masking | Stored values stay as they are, and a **masked value is shown** depending on the role |

- The **Glue Detect PII transform** scans in two ways: inspecting every cell, or sampling rows to find only the "columns that contain PII." The latter costs less. For the values it finds, you choose an action such as replacing with a fixed string, partial replacement, or applying a SHA-256 hash.
- Its role differs from Macie's. Macie investigates objects **already accumulated in S3**, while the Glue transform processes data **flowing through the pipeline** on the spot.

```sql
-- Redshift dynamic data masking
CREATE MASKING POLICY mask_card_full
WITH (card_number VARCHAR(20))
USING ('****-****-****-****'::TEXT);

CREATE MASKING POLICY mask_card_last4
WITH (card_number VARCHAR(20))
USING ('****-****-****-' || RIGHT(card_number, 4));

-- All users get full masking, the analyst role gets the last 4 digits (the higher-priority policy applies)
ATTACH MASKING POLICY mask_card_full
ON payments(card_number) TO PUBLIC;

ATTACH MASKING POLICY mask_card_last4
ON payments(card_number) TO ROLE analyst_role PRIORITY 10;
```

- DDM does not transform and store the data; it changes only the presentation **at query time**. Even when privacy requirements change, you fix the policy without touching the original data or the SQL.
- Only a superuser or a principal with the `sys:secadmin` role can create and attach policies.
- When multiple policies apply to a single column, the **policy with the higher priority (PRIORITY)** is applied. If you omit the priority, it is 0. To make a specific role's policy apply over a policy attached to `PUBLIC`, give it a higher priority.
- A masking expression can use not only SQL but also user-defined functions. If you mask with a hash, you can join without ever seeing the original.
- If masking means "show a masked value," a data filter means "do not return the value." Layering the two gives you defense in depth.

## GDPR Deletion Is Not Finished with a Single DELETE

- To remove one person's row from a regular Parquet table, you have to rewrite the entire file that contains that row. Open table formats such as Iceberg and Hudi support **row-level DELETE**, turning this job into a table operation.
- However, an Iceberg DELETE adds a marker (a delete file) saying "this row is deleted." The original data files and the **snapshots** that point to times before the deletion remain, and can be read again with time travel queries.

```sql
-- 1) Logical delete
DELETE FROM lake_clean.payments WHERE customer_id = 'GDPR-REQ-2026-042';

-- 2) Merge the delete markers into the data files and rewrite
OPTIMIZE lake_clean.payments REWRITE DATA USING BIN_PACK;

-- 3) Expire old snapshots + remove files that belong to nothing
VACUUM lake_clean.payments;
```

| Where it remains | Action |
|------|------|
| Pre-deletion snapshots and old data files | Shorten the snapshot retention period and run `VACUUM` |
| Previous versions in S3 versioning | A lifecycle rule to expire previous versions |
| Originals in the raw zone, quarantine buckets, backups | Apply the same request to each store separately |
| Downstream copies (Redshift, extract files) | Trace where copies are using lineage (tomorrow) |

- "Turning on versioning" works against a deletion requirement. It keeps more copies.

## Regulations and Tool Mapping

| Requirement | Representative regulation | AWS means |
|------|------|------|
| Locate sensitive data | Common | Macie |
| Minimize access | Common | IAM, Lake Formation |
| Protect at rest and in transit | PCI-DSS, HIPAA | KMS, enforced TLS |
| Do not expose card data | PCI-DSS | Tokenization, masking |
| Deletion request (right to be forgotten) | GDPR | Iceberg/Hudi row-level DELETE + snapshot cleanup |
| Access records | Common | CloudTrail, Security Hub |
| Data residency (not allowed outside specific Regions) | Data sovereignty requirements | SCP Region restriction, bucket policy |

```json
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "StringNotEquals": { "aws:RequestedRegion": ["ap-northeast-2"] }
  }
}
```

- An SCP like the one above blocks operations outside the allowed Regions across the whole account. In practice you must carve out exceptions for global services that have no Region, such as IAM. Along with the Region restriction, you also need to check cross-Region replication and snapshot copy settings so that data does not leave.

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Zero Macie findings | Macie is not in the customer managed key policy, or SSE-C or client-side encryption is used | Allow the service-linked role in the key policy |
| Employee ID detection floods with false positives | Only a regex, no keywords | Add keywords, maximum match distance, and ignore words (create the identifier anew) |
| Cannot find a finding from three months ago | Findings are retained for 90 days | Export to EventBridge, Security Hub, or S3 |
| An analyst sees the original instead of the masked value | A higher-priority policy is attached, or no policy is attached | Check priorities and attachment targets |
| Deleted customer data is visible in time travel queries | Snapshots remain | Expire snapshots + VACUUM |
| Joins between tables break after tokenization | Different token mappings per table | Use the same vault and the same mapping |

## Question Clue → Answer Cheat Table

| Question clue | Answer |
|------|------|
| "We do not know which buckets contain card numbers or national ID numbers" | Amazon Macie |
| "Detect identifiers in an organization-specific format" | Custom data identifier |
| "Keep joins + hide the original + restore later" | Tokenization |
| "Same table, different visibility by role (Redshift)" | Dynamic data masking |
| "Do not return sensitive columns at all (data lake)" | Lake Formation data filter |
| "Find and mask PII during ETL" | Glue Detect PII transform |
| "Quarantine and notify immediately on detection" | Macie → EventBridge → Lambda + SNS |
| "Permanently delete only a specific customer's rows" | Iceberg/Hudi row-level DELETE (+ snapshot cleanup) |
| "Data must not leave a specific Region" | SCP or bucket policy Region restriction |

Tomorrow we cover governance: finding data (catalog), trusting it (lineage), sharing it, and tracking it (auditing).

## 📖 Glossary

- **PII**: Information that can identify an individual. Names, national ID numbers, card numbers, email addresses, and so on.
- **Managed data identifier**: The sensitive data detection criteria that Macie provides by default.
- **Custom data identifier**: Detection criteria you define yourself with a regular expression and keywords. It cannot be modified after creation.
- **Finding**: A report of one issue that Macie found. There are two categories: bucket configuration issues and sensitive data.
- **Masking**: Hiding a value or showing only part of it. It usually cannot be reversed to the original.
- **Tokenization**: Replacing a sensitive value with a meaningless token and storing the mapping to the original separately.
- **Vault**: A protected store that holds the mapping between tokens and originals.
- **Dynamic data masking**: A Redshift feature that leaves stored values alone and masks them according to the role at the moment of querying.
- **Snapshot (Iceberg)**: The state of a table at a point in time. Even deleted data can be read again if an old snapshot remains.
- **Data residency**: A requirement that data be kept only within a specified country or Region.

## 📝 Practice Questions

**Question 1.** You do not know which of thousands of S3 buckets store credit card numbers and national ID numbers. Which service automatically discovers the location and type of sensitive data?

A) AWS Config  
B) AWS Glue DataBrew  
C) Amazon Macie  
D) Amazon Inspector  

**Answer: C**  
Explanation: Macie automatically detects and classifies PII and sensitive data in S3 using ML and pattern matching, and reports the location and type as findings. Config is for resource configuration, DataBrew is for data preparation, and Inspector is for workload vulnerability scanning.

---

**Question 2.** For payment analytics, you must join transactions by card number, but the original card number must be hidden. A privileged system must also be able to restore the original later. Which technique is the best fit?

A) Irreversible masking  
B) Dropping the column  
C) Glacier archiving  
D) Tokenization  

**Answer: D**  
Explanation: Tokenization replaces a sensitive value with a token while keeping the mapping in a vault, which preserves join consistency and lets you restore the original through detokenization when needed. Irreversible masking and dropping the column make restoration impossible, and Glacier is not a protection technique.

---

**Question 3.** In Redshift, two roles query the same table. You want analysts to see only the last 4 digits of the card number and administrators to see the full number. Which feature is most appropriate?

A) S3 bucket policy  
B) Redshift dynamic data masking (DDM)  
C) KMS key rotation  
D) Partition projection  

**Answer: B**  
Explanation: Redshift DDM attaches a masking policy to a column and provides different visibility per role, so the same query returns different values depending on the role. Bucket policies, key rotation, and partition projection do not provide column-level dynamic masking.

---

**Question 4.** Right after Macie detects sensitive data, you want to automatically quarantine that bucket and notify the security team. Which architecture is most appropriate?

A) Macie finding → EventBridge → Lambda (restrict bucket policy) + SNS notification  
B) Delete objects with an S3 lifecycle policy  
C) Create a CloudFront distribution  
D) Create a Redshift snapshot  

**Answer: A**  
Explanation: Receiving the Macie finding through EventBridge, having Lambda restrict bucket access, and notifying through SNS connects detection and response automatically. Lifecycle deletion risks losing evidence, and CloudFront and Redshift snapshots are unrelated to responding to sensitive data.

---

**Question 5.** Under the GDPR "right to be forgotten," you must permanently delete a specific customer's data from the data lake at the row level. Which approach is most appropriate?

A) Reload the entire table  
B) Only enable S3 bucket versioning  
C) Re-run the Macie classification job  
D) Run a row-level DELETE on the Iceberg/Hudi table  

**Answer: D**  
Explanation: Open table formats like Iceberg/Hudi support row-level DELETE, so you can efficiently remove only a specific customer's records. A full reload is inefficient, versioning actually leaves more copies, and Macie is only a detection tool and does not delete.

---
