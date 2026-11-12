# Day 3 - Protecting Sensitive Data: Macie and Masking

## 📌 Key Takeaways

- Macie finds sensitive data in S3 and tells you **what is where**. It does not mask or delete anything itself. Follow-up action is the job of a separate pipeline.
- There are two kinds of detection criteria: managed data identifiers provided by AWS, and custom data identifiers that you build with regular expressions and keywords.
- Masking hides a value when displaying it (usually irreversible), while tokenization replaces a value with a token and keeps the mapping separately so it can be reversed when needed (reversible).
- Redshift dynamic data masking (DDM) leaves the stored values as they are and shows them differently per role **at query time**. A Lake Formation data filter does not return the values at all.
- Automate the response with discovery → EventBridge → Lambda, and handle GDPR deletion with row-level DELETE in Iceberg or Hudi, but the data is physically removed only if you also clean up the snapshots.

## Macie Does Two Things

Unintended PII (personally identifiable information) gets mixed into data lakes: national ID numbers typed into free-text fields, card numbers printed in logs, and so on. The service that finds them is Amazon Macie. The findings Macie produces fall into two categories.

| Category | What it reports | When it is generated | Type examples |
|------|------|------|------|
| Policy finding | A change that weakened a bucket's security or access settings | Continuously monitors changes made **after** Macie is turned on | Block Public Access turned off, bucket made public, sharing or replication with an account outside the organization |
| Sensitive data finding | Sensitive data found inside an object | When a discovery job runs or when automated discovery analyzes it | `Financial`, `Personal`, `Credentials`, `CustomIdentifier`, `Multiple` |

- Policy findings are not generated for settings that were already open before Macie was turned on. "Find buckets that are already public" is a matter of looking at the bucket inventory yourself or using other tools (such as Config).
- Findings are retained for **90 days**. To keep them longer, export them to EventBridge or Security Hub, or configure discovery results to be stored in S3.
- Macie analyzes **S3**. Macie does not look directly at PII inside Redshift tables or RDS.

## Two Discovery Methods: Automated Discovery and Discovery Jobs

| Item | Automated sensitive data discovery | Sensitive data discovery job |
|------|------|------|
| Scope | All general purpose buckets in the account or organization (exclusions possible) | Specified buckets and prefixes |
| Method | Continuously evaluates the bucket inventory and **selects sample objects** to analyze | Analyzes the objects in scope once or on a schedule |
| Results | Per-bucket sensitivity scores and statistics, sensitive data findings | Sensitive data findings, per-object analysis records |
| Use | A broad map answering "which of thousands of buckets is risky" | A precise investigation for "check this bucket without gaps" |
| Configured by | The organization's Macie administrator account, or a standalone account | Per account |

- Automated discovery picks representative objects from each bucket. The objects it picks are actually retrieved and their contents inspected. It means it does not scan everything, not that it does not look at the contents.
- You use the two in order. Narrow down the risky buckets with automated discovery, then run a discovery job on those buckets for exhaustive verification.

## Identifiers: What Counts as Sensitive

- **Managed data identifiers**: Detection criteria that AWS has built, such as credit card numbers, national ID and passport numbers from various countries, and credentials such as AWS secret keys.
- **Custom data identifiers**: Define patterns unique to your organization (employee numbers, customer account numbers) with a regular expression and supporting conditions.
- **Allow list**: Values you want to exclude from detection. Put in things such as a publicly listed main phone number to reduce false positives.

```json
{
  "name": "internal-employee-id",
  "regex": "EMP-[0-9]{6}",
  "keywords": ["employee", "employee number"],
  "ignoreWords": ["EMP-000000"],
  "maximumMatchDistance": 50
}
```

| Component | Role | Limit |
|------|------|------|
| Regular expression | The text pattern to find | Up to 512 characters. Some syntax, such as backreferences and lookarounds, is not supported |
| Keywords | Words that must be **near** the pattern | Up to 50, each 3 to 90 characters, case-insensitive |
| Maximum match distance | The number of characters allowed between a keyword and the pattern | 1 to 300, default 50 |
| Ignore words | Values to leave out of the results even if they match the pattern | Up to 10, each 4 to 90 characters, case-sensitive |

- Keywords are a device for reducing false positives. A six-digit number appears everywhere, but a six-digit number within 50 characters after the words "employee number" is likely to be an employee number. In column-based data such as CSV, a keyword in the **column name** is also accepted.
- A custom data identifier **cannot be edited after it is created.** This is so that the criteria behind past findings do not change. To fix one, create a new one. That is why you test it with sample data before creating it.

## How Far Can Macie See Into Encrypted Objects

| Object encryption | Can Macie analyze it? |
|------|------|
| SSE-S3 | Yes |
| SSE-KMS / DSSE-KMS (AWS managed key) | Yes |
| SSE-KMS / DSSE-KMS (customer managed key) | Only if the key policy allows `kms:Decrypt` for Macie's service-linked role |
| SSE-C | No. Reports metadata only |
| Client-side encryption | No. Reports metadata only |

- "I ran Macie and there are no findings" does not mean "there is no sensitive data." If you did not put Macie in the key policy of a customer managed key, it could not open the contents. If the key is owned by another account, you must create a grant in addition to allowing it in the key policy.

> 💡 **Related theory**: Macie is a detection tool. Its results go only as far as "what is where"; it does not mask, quarantine, or delete. In exam answer choices, "mask with Macie" and "delete with Macie" are wrong answers. Action after detection is taken by other services chained on through EventBridge.

## Connecting Detection to Response Automatically

```text
[Macie finding] → [EventBridge rule] → [Lambda]
   → restrict access via bucket policy / tag the object / SNS notification / record in Security Hub
```

```json
{
  "source": ["aws.macie"],
  "detail-type": ["Macie Finding"],
  "detail": { "type": [{ "prefix": "SensitiveData:S3Object/" }] }
}
```

- An automated response **does not delete the object.** The evidence disappears, and you cannot undo it if it was a false positive. Narrow access and add a tag so that a person makes the call.
- If you gather findings in Security Hub, you can prioritize them on one screen together with findings from other security services.

## Comparing Techniques for Reducing Exposure

| Technique | Result | Reversible? | Joins / aggregation | Suitable situation |
|------|------|------|------|------|
| Full masking (redaction) | Replaced with a fixed string | No | No | Queries that do not need the value at all |
| Partial masking | Only part is shown (`****-****-****-1234`) | No | Limited | Support and verification screens |
| Hashing (deterministic) | Same input → same hash | No | Equality joins possible | Linking by identifier only, without the original |
| Tokenization | Replaced with a meaningless token, with the mapping kept in a vault | Yes (only by authorized systems) | Yes | Business processes that need the original later (payments) |
| Encryption | Ciphertext | Yes (key holders) | Generally no | Protection at rest and in transit |
| Column exclusion | The value is not provided at all | Not applicable | No | Users who have no reason to see it |

- If a question says both "keep joins" and "the original can be restored," it is tokenization. If it says "no need to restore," it is masking or hashing.
- If you hash a column with few distinct values (gender, postal code), it can be traced back by hashing every possible value and matching. Hashing is not a universal anonymization.

> 💡 **Related theory**: Tokenization can hide the original while keeping joins and analysis intact, so it is preferred in payment regulations such as PCI-DSS. The cost is that the vault holding the mapping between originals and tokens becomes a new thing to protect. The core of the design is to minimize the systems that can access the vault.

## Where to Mask: Implementation Locations

| Location | Means | Characteristics |
|------|------|------|
| ETL stage (before writing) | Glue sensitive data detection (Detect PII) transform, Spark UDF | The stored value itself changes. Once masked, it applies to every consumer |
| Catalog permissions (at read time) | Lake Formation data filter | **Does not return** sensitive columns and rows |
| Warehouse query (at read time) | Redshift dynamic data masking | The stored value stays as is, and a **masked value is shown** depending on the role |

- The **Glue Detect PII transform** scans in two ways. One inspects every cell, and the other samples rows and finds only the "columns that contain PII." The latter costs less. For the values found, you choose an action such as replacing with a fixed string, partial replacement, or applying a SHA-256 hash.
- Its role differs from Macie. Macie investigates objects **already accumulated in S3**, while the Glue transform processes data **flowing through the pipeline** on the spot.

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

- DDM does not transform the data it stores; it changes only the presentation **at query time**. Even if privacy requirements change, you fix only the policy without touching the original data or the SQL.
- Only a superuser or a principal with the `sys:secadmin` role can create and attach policies.
- When multiple policies apply to one column, the policy with the **higher priority (PRIORITY)** is applied. If you omit the priority, it is 0. To have a specific role's policy take effect over the policy attached to `PUBLIC`, give it a higher priority.
- Masking expressions can use not only SQL but also user-defined functions. If you mask with a hash, you can join without seeing the original.
- If masking "shows a masked value," a data filter "does not return the value." Layering the two gives defense in depth.

## GDPR Deletion Does Not End with a Single DELETE

- To remove one person's rows from an ordinary Parquet table, you must rewrite entire files that contain those rows. Open table formats such as Iceberg and Hudi support **row-level DELETE**, which turns this work into a table operation.
- However, an Iceberg DELETE adds a marker (a delete file) saying "this row is deleted." The original data files and the **snapshots** pointing to the time before the deletion remain, and they can be read again with time travel queries.

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
| Downstream copies (Redshift, extract files) | Trace copy locations with lineage (tomorrow) |

- "Turn on versioning" works against a deletion requirement. It keeps more copies.

## Mapping Regulations to Tools

| Requirement | Representative regulation | AWS means |
|------|------|------|
| Know where sensitive data is | Common | Macie |
| Minimize access | Common | IAM, Lake Formation |
| Protection at rest and in transit | PCI-DSS, HIPAA | KMS, enforced TLS |
| Do not expose card data | PCI-DSS | Tokenization, masking |
| Deletion requests (right to be forgotten) | GDPR | Iceberg/Hudi row-level DELETE + snapshot cleanup |
| Access records | Common | CloudTrail, Security Hub |
| Data residency (no leaving specific Regions) | Data sovereignty requirements | SCP Region restriction, bucket policy |

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

- An SCP like the one above blocks operations outside the allowed Region across the whole account. In practice, you must exempt global services that have no Region, such as IAM. Along with the Region restriction, you must also check cross-Region replication and snapshot copy settings so that data does not leave.

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Macie has 0 findings | Macie is not in the customer managed key policy, or SSE-C / client-side encryption | Allow the service-linked role in the key policy |
| Employee number detection is flooded with false positives | A regular expression only, no keywords | Add keywords, maximum match distance, and ignore words (create a new identifier) |
| Cannot find a finding from three months ago | Findings are retained for 90 days | Export to EventBridge, Security Hub, or S3 |
| An analyst sees the original instead of the masked value | A higher-priority policy applies, or no policy is attached | Check the priority and the attachment target |
| Deleted customer data is visible through a time travel query | Snapshots remain | Expire snapshots + VACUUM |
| Joins between tables break after tokenization | Different token mappings per table | Use the same vault and the same mapping |

## Question Clue → Correct Answer Table

| Clue in the question | Correct answer |
|------|------|
| "We do not know which bucket has card numbers and national ID numbers" | Amazon Macie |
| "Detect identifiers in an organization-specific format" | Custom data identifier |
| "Keep joins + hide the original + restore later" | Tokenization |
| "Same table, different visibility by role (Redshift)" | Dynamic data masking |
| "Do not return sensitive columns at all (data lake)" | Lake Formation data filter |
| "Find and mask PII during ETL" | Glue sensitive data detection transform |
| "Quarantine and notify immediately on detection" | Macie → EventBridge → Lambda + SNS |
| "Permanently delete only a specific customer's rows" | Iceberg/Hudi row-level DELETE (+ snapshot cleanup) |
| "Data must not leave a specific Region" | Region restriction in an SCP or bucket policy |

Tomorrow we cover governance: finding data (catalog), trusting it (lineage), sharing it (sharing), and tracking it (auditing).

## 📖 Glossary

- **PII**: Information that can identify an individual: name, national ID number, card number, email, and so on.
- **Managed data identifier**: A sensitive data detection criterion that Macie provides by default.
- **Custom data identifier**: A detection criterion you define yourself with a regular expression and keywords. It cannot be edited after it is created.
- **Finding**: A report on a single issue that Macie found. There are two categories: bucket configuration issues and sensitive data.
- **Masking**: Hiding a value or showing only part of it. It usually cannot be reversed to the original.
- **Tokenization**: Replacing a sensitive value with a meaningless token and keeping the mapping to the original separately.
- **Vault**: A protected store that holds the mapping between tokens and originals.
- **Dynamic data masking**: A Redshift feature that keeps the stored value and, at the moment of query, shows it masked depending on the role.
- **Snapshot (Iceberg)**: The state of a table at a specific point in time. Even deleted data can be read again as long as an old snapshot remains.
- **Data residency**: The requirement that data must be kept only within a designated country or Region.

## 📝 Practice Questions

**Question 1.** You do not know which of thousands of S3 buckets store credit card numbers and Korean resident registration numbers. Which service automatically discovers the location and type of sensitive data?

A) AWS Config  
B) AWS Glue DataBrew  
C) Amazon Macie  
D) Amazon Inspector  

**Answer: C**  
Explanation: Macie automatically detects and classifies PII and sensitive data in S3 using ML and pattern matching, and reports the location and type as findings. Config is for resource configuration, DataBrew is for data preparation, and Inspector is for workload vulnerability scanning.

---

**Question 2.** For payment analysis, you must join transactions by card number but must hide the original card number. A privileged system must also be able to restore the original later. Which technique is the most suitable?

A) Irreversible masking  
B) Column deletion  
C) Glacier archiving  
D) Tokenization  

**Answer: D**  
Explanation: Tokenization replaces a sensitive value with a token while keeping the mapping in a vault, maintaining join consistency and allowing restoration through detokenization when needed. Irreversible masking and column deletion cannot be restored, and Glacier is not a protection technique.

---

**Question 3.** In Redshift, two roles query the same table, and you want to show analysts only the last 4 digits of the card number and show administrators the full number. Which feature is the most appropriate?

A) S3 bucket policy  
B) Redshift dynamic data masking (DDM)  
C) KMS key rotation  
D) Partition projection  

**Answer: B**  
Explanation: Redshift DDM attaches a masking policy to a column and provides different visibility per role, so the same query returns different values depending on the role. Bucket policies, key rotation, and partition projection do not provide column-level dynamic masking.

---

**Question 4.** You want Macie to automatically isolate the bucket and notify the security team immediately after it detects sensitive data. What is the most appropriate architecture?

A) Macie finding → EventBridge → Lambda (restrict bucket policy) + SNS notification  
B) Delete objects with an S3 lifecycle policy  
C) Create a CloudFront distribution  
D) Create a Redshift snapshot  

**Answer: A**  
Explanation: Receiving the Macie finding through EventBridge, having Lambda restrict bucket access, and notifying with SNS automatically connects detection to response. Lifecycle deletion risks losing evidence, and CloudFront and Redshift snapshots are unrelated to responding to sensitive data.

---

**Question 5.** Under the GDPR "right to be forgotten," you must permanently delete a specific customer's data from the data lake at the row level. What is the most appropriate method?

A) Reload the entire table  
B) Only enable S3 bucket versioning  
C) Rerun the Macie classification job  
D) Run a row-level DELETE on an Iceberg/Hudi table  

**Answer: D**  
Explanation: Open table formats such as Iceberg/Hudi support row-level DELETE, so only the specific customer's records can be removed efficiently. A full reload is inefficient, versioning actually leaves copies behind, and Macie is only a detection tool and does not delete anything.

---
