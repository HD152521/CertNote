# Day 3 - Sensitive Data Protection: Macie and Masking

Data lakes unintentionally mix PII (personally identifiable information) and sensitive data. Today: automatically detect (Macie), reduce exposure (masking/tokenization), and prove compliance.

## 1. Amazon Macie: Automatic PII Detection

Macie uses ML and pattern matching to auto-discover and classify sensitive data on S3.

- **Automated sensitive data discovery**: Continuous bucket sampling exposes risk.
- **Classification jobs**: One-time or periodic precise scan of specific buckets/prefixes.
- **Managed data identifiers**: Credit card numbers, SSN, passport, email, etc. built-in.
- **Custom data identifiers**: Regex + keywords + proximity for org-specific patterns (employee ID).
- **Findings**: Locations/types sent to EventBridge/Security Hub for auto-response.

```json
{
  "customDataIdentifier": {
    "name": "internal-employee-id",
    "regex": "EMP-[0-9]{6}",
    "keywords": ["employee", "employee ID"],
    "maximumMatchDistance": 50
  }
}
```

> 💡 **Related Theory**: Macie controls cost by sampling/pattern-matching without downloading full objects. Findings show "what and where" but don't mask — downstream pipelines handle masking.

## 2. Masking and Tokenization

Post-detection exposure-reduction techniques.

- **Masking**: Hide or partially expose values (`****-****-****-1234`). Irreversible or display-only.
- **Tokenization**: Swap sensitive values for meaningless tokens, store mapping in secure vault. Reversible via de-tokenization.
- **Hashing/encryption**: Deterministic hashing preserves join keys and anonymizes; encryption recovers via key.

AWS implementations:
- **Redshift Dynamic Data Masking (DDM)**: Attach masking policy to columns, role-based visibility.
- **Glue/Spark UDF**: Hash/substitute during ETL.
- **Lake Formation data filters**: Exclude sensitive columns entirely from GRANT.

```sql
-- Redshift DDM: analysts see last 4 digits only
CREATE MASKING POLICY mask_card
WITH (card_number VARCHAR(20))
USING ('****-****-****-' || RIGHT(card_number, 4));

ATTACH MASKING POLICY mask_card
ON payments(card_number)
TO ROLE analyst_role;
```

## 3. Data Filtering for Exposure Minimization

Lake Formation data filters remove sensitive columns or restrict rows — "don't return unviewable data in the first place."

```text
DataCellsFilter (analyst_view):
  ColumnNames: [order_id, region, amount]    # exclude email, ssn
  RowFilter: "country = 'KR'"
```

Masking "shows hidden values"; data filters "don't return them." Combined: layered defense.

> 💡 **Related Theory**: Tokenization keeps joins/analysis while hiding originals—preferred in PCI-DSS. Irreversible masking suits display-only; tokenization suits workflows needing later recovery.

## 4. Compliance

Sensitive data protection directly ties to regulation.

- **GDPR**: Deletion requests (right to be forgotten) → Iceberg/Hudi row-level DELETE.
- **PCI-DSS**: Card data tokenized/encrypted, access restricted.
- **HIPAA**: Health info (PHI) encrypted, access audited.
- **Data residency**: Enforce specific-region storage via SCP/bucket policy.

AWS tool mapping:
- Detection: **Macie**
- Access control: **Lake Formation**, IAM
- Encryption: **KMS**
- Audit: **CloudTrail**, Security Hub

## 5. Auto-Response Pipeline

Macie findings connect to auto-isolation/alerting:

```text
[Macie Finding] --> [EventBridge rule] --> [Lambda]
   --> Isolate sensitive bucket (restrict policy) / Tag object / SNS alert / Security Hub record
```

Link detection to response for consistent protection without ops burden.

## Exam Points Summary

- Macie: S3 PII auto-detect/classify, managed/custom identifiers, findings to EventBridge/Hub. No direct masking.
- Masking (hide, usually irreversible) vs Tokenization (reversible, vault mapping).
- Redshift DDM: role-based column visibility.
- Lake Formation data filter: exclude sensitive columns/rows entirely.
- Regulation-tool map: GDPR delete (Iceberg DELETE), PCI (tokenization), detect (Macie), audit (CloudTrail).

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
