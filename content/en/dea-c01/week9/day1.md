# Day 1 - Access Control: IAM and Lake Formation Permissions

Data security starts with access control: "Who can access what?" AWS data environments rely on IAM for broad permissions and Lake Formation for data-catalog-level granular control. Today we explore how both layers work together.

## 1. IAM Basics and Least Privilege Principle

IAM (Identity and Access Management) controls AWS resource access.

- **Identity-based policy**: Granted to users/groups/roles, defining what they can do.
- **Resource-based policy**: Attached to resources (e.g., S3 bucket policy), defining who can access.
- **Role**: Temporary credentials, used by services (Glue, EMR) or cross-account access.

**Least Privilege** principle grants only necessary permissions. Avoid wildcard (`*`), use `Condition` to narrow scope.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowReadSpecificPrefix",
    "Effect": "Allow",
    "Action": ["s3:GetObject"],
    "Resource": "arn:aws:s3:::lake-curated/sales/*",
    "Condition": {"StringEquals": {"aws:RequestedRegion": "ap-northeast-2"}}
  }]
}
```

> 💡 **Related Theory**: IAM evaluation logic: explicit Deny > explicit Allow > implicit deny. Any Deny blocks immediately.

## 2. Lake Formation Permission Model

Lake Formation centrally manages database/table/column permissions via Glue Data Catalog. **Register** S3 locations; Lake Formation issues temporary credentials via credential vending.

**Core**: Both IAM and Lake Formation permissions required for data access. IAM controls service API calls; Lake Formation controls data visibility.

```text
User request → [IAM policy pass?] → [Lake Formation permission pass?] → Data access
              Either denial blocks
```

## 3. Fine-Grained Permissions: Column/Row/Tag (TBAC)

Lake Formation provides three control levels:

- **Column-level**: Specify columns to expose/exclude (hide PII).
- **Row-level (data filters)**: `RowFilter` expressions show only specific rows (regional analysts).
- **Cell-level**: Column + row combined.

At scale, **LF-Tags (TBAC)** beats named resources. Tag resources and grant permissions by tag values; new tables automatically get permissions.

```json
{
  "TagPolicy": {
    "Expression": [
      {"TagKey": "sensitivity", "TagValues": ["public", "internal"]},
      {"TagKey": "domain", "TagValues": ["sales"]}
    ],
    "Permissions": ["SELECT", "DESCRIBE"]
  }
}
```

> 💡 **Related Theory**: Named grants explode as resources grow (O(users×tables)); TBAC covers many resources with one expression, dramatically lowering management complexity.

## 4. Data Filters for Row/Column Control

Data Cells Filters combine column selection and row filters:

```text
DataCellsFilter:
  TableName: orders
  ColumnNames: [order_id, region, amount, dt]   # PII excluded
  RowFilter: "region = 'ap-northeast-2'"
```

Applied to a role, it hides PII, restricts to that region. Athena/Redshift Spectrum/EMR all respect this filter.

## 5. Cross-Account Access

Sharing data between AWS accounts:

- **Lake Formation cross-account share**: GRANT catalog resources directly (via RAM).
- **S3 bucket policy + KMS key policy**: Grant cross-account principals to encrypt/decrypt.
- **Role assumption**: Trust policy allows external account to assume role.

```json
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::444455556666:root"},
  "Action": "sts:AssumeRole"
}
```

> 💡 **Related Theory**: Cross-account access requires trust policy (source) + permission policy (target) + (if encrypted) KMS key policy — three layers aligned.

## 📝 Practice Questions

**Question 1.** An analyst tries to query a Glue catalog table with Athena and gets an "Insufficient permissions" error. The IAM policy allows `athena:*`, `glue:GetTable`, and `s3:GetObject`. What is the most likely cause?

A) The S3 bucket is not versioned  
B) The Athena workgroup is disabled  
C) The table is in CSV format  
D) SELECT permission has not been granted on the table in Lake Formation  

**Answer: D**  
Explanation: For data managed by Lake Formation, access requires that SELECT/DESCRIBE permissions be granted separately in LF even if the IAM permissions are sufficient. Versioning, workgroups, and format are not direct causes of a permission denial.

---

**Question 2.** In a data lake where hundreds of tables are added every week, you want to eliminate the operational burden of adding per-user GRANT statements every time a new table is created. What is the most appropriate access control method?

A) Grant `lakeformation:*` to all users  
B) Control only with S3 bucket policies  
C) Grant permissions based on tag expressions with LF-Tags (TBAC)  
D) Create a separate AWS account for each user  

**Answer: C**  
Explanation: TBAC attaches tags to resources and grants permissions on tag expressions, so a new table with the same tags automatically has the permissions applied. Wildcard grants violate least privilege, bucket policies are weak in granularity, and separating accounts is excessive.

---

**Question 3.** You want to show an analyst the `orders` table without the PII columns (email, ssn) and only the rows for their own region (`region`). Which single Lake Formation feature should you use?

A) Data filter (Data Cells Filter)  
B) S3 Object Lock  
C) Partition projection  
D) KMS key policy  

**Answer: A**  
Explanation: A data filter combines the list of exposed columns and a row filter expression into one, controlling columns and rows at the same time. Object Lock prevents deletion, partition projection is for performance, and a KMS key policy is for encryption permissions, so none relates to fine-grained access.

---

**Question 4.** Cross-account sharing has been set up so that a role in Account B can query a data lake table in Account A. The data is encrypted with a KMS CMK. What is a common cause of access still failing?

A) Account B has no internet gateway  
B) The S3 bucket in Account A is empty  
C) The two accounts are not in the same Region  
D) The KMS key policy does not grant the Account B principal decrypt permission  

**Answer: D**  
Explanation: For encrypted data, even if the LF/S3 permissions are aligned, decryption fails if the KMS key policy does not grant the cross-account principal `kms:Decrypt` permission. Gateways, empty buckets, and Regions are not common causes of failure.

---

**Question 5.** Which statement about IAM policy evaluation is correct?

A) If there is even one Allow, Deny is ignored  
B) Implicit allow is the default  
C) An explicit Deny takes precedence over any Allow and always blocks  
D) Resource-based policies are not included in evaluation  

**Answer: C**  
Explanation: In IAM, an explicit Deny takes the highest priority, and if there is no Allow, an implicit deny is the default. Resource-based policies are also included in evaluation. The other options are incorrect answers that describe the evaluation logic backwards.

---
