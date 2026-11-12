# Day 1 - Access Control: IAM and Lake Formation Permissions

## 📌 Key Takeaways

- IAM evaluation order is explicit Deny > explicit Allow > implicit deny. Within the same account, it is enough for either the identity-based policy or the resource-based policy to allow the request, but **cross-account access requires both sides** to allow it.
- Data managed by Lake Formation must pass **both** IAM permissions and Lake Formation permissions to be read. IAM answers "can this principal call the API?", while Lake Formation answers "can it see this table, column, or row?".
- Lake Formation issues temporary credentials for registered S3 locations (credential vending). You do not need to grant users S3 permissions directly; instead they need `lakeformation:GetDataAccess`.
- Fine-grained control comes at the column level, the row level, or both combined (cell level), and is implemented with **data filters**. Filters apply only to reads (`SELECT`).
- For environments where tables keep growing, manage permissions with LF-Tags (TBAC) instead of named-resource permissions. Cross-account access requires the trust policy, the permission policy, and (when encrypted) the KMS key policy to all line up.

## IAM Basics and the Principle of Least Privilege

The starting point of data security is access control, which decides "who can access what." In an AWS analytics environment, IAM handles broad permissions at the service API level, and Lake Formation handles fine-grained permissions at the catalog level.

| Policy type | Attached to | Role |
|------|------|------|
| Identity-based policy | Users, groups, roles | What this principal can do |
| Resource-based policy | S3 buckets, KMS keys, roles (trust policy), etc. | Who can access this resource |
| Permissions boundary | Users, roles | The upper limit of the permissions an identity-based policy can grant |
| Service control policy (SCP) | Accounts and OUs in an organization | An upper limit that no one in the account can exceed |

- A **role** provides temporary credentials. It is used when services such as Glue and EMR work on behalf of users, and when another account needs access.
- **Least privilege** means granting only the permissions that are strictly necessary for the task. Avoid overusing wildcards (`*`) and narrow the scope with `Resource` and `Condition`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowReadSpecificPrefix",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::lake-curated/sales/*",
      "Condition": {
        "StringEquals": { "aws:RequestedRegion": "ap-northeast-2" }
      }
    }
  ]
}
```

> 💡 **Related theory**: IAM evaluation logic is "explicit Deny > explicit Allow > implicit deny." If any policy contains a matching Deny, the request is blocked immediately, and if no policy has an Allow, it ends with the default implicit deny. Permissions boundaries and SCPs do **not grant** permissions. They only trim the range that can be granted.

| Situation | Condition for allowing |
|------|------|
| Access within the same account | Either the identity-based policy **or** the resource-based policy allows it (there must be no Deny anywhere) |
| Access to a resource in another account | The identity-based policy in the requester's account **and** the resource-based policy in the resource's account must both allow it |

- A cross-account request is evaluated separately in each of the two accounts, and it passes only if both allow it. If you get "denied even though I added the other account to the bucket policy," the other account's role lacks S3 permissions.

## How Lake Formation Controls Access

Lake Formation manages permissions on Glue Data Catalog databases, tables, and columns in one place. The core of how it works is **registering** S3 locations and **credential vending**.

```text
① The administrator registers an S3 location with Lake Formation (specifying, at registration, the role that can read and write that location)
② A user runs a query with Athena
③ Athena sends a request to Lake Formation → Lake Formation checks permissions (table, column, row)
④ If the check passes, Lake Formation issues Athena temporary credentials created by assuming the registered role
⑤ Athena reads S3 with those credentials, but returns only the permitted columns and rows to the user
```

- Users do not need IAM permissions on the S3 bucket themselves. The S3 access permissions belong to the role used for registration.
- Instead, the user (or the service's execution role) must have the IAM permission `lakeformation:GetDataAccess`. This permission supports only `*` as its `Resource`. Athena requires it on the user themselves, while other integrated services require it on the execution role.
- Lake Formation **does not block access that comes directly through the S3 API.** If a user still has `s3:GetObject` through IAM, they can download the raw files of a table that has a column filter. To enforce control with Lake Formation, remove the S3 permissions for the direct path.

```text
User request → [Pass the IAM policy?] → [Pass the Lake Formation permission?] → Data access
               If either one denies, the request is blocked
```

## A Trap Created by the Default Settings: IAMAllowedPrincipals

For compatibility with existing Glue users, Lake Formation is **effectively turned off** at first.

- On all existing catalog resources, the `IAMAllowedPrincipals` group holds the `Super` permission.
- New resources have the "Use only IAM access control" setting turned on.
- As a result, access is decided by IAM policies alone, and individual Lake Formation permissions have no effect.

| Symptom | Cause |
|------|------|
| You granted column permissions, but the user sees all columns | `Super` for `IAMAllowedPrincipals` remains on the table |
| Control does not apply only to newly created tables | The default permission settings for new resources were not changed |

- To actually turn on Lake Formation control, change the default settings for new resources and revoke the `IAMAllowedPrincipals` permission on existing resources.
- If it is hard to change everything at once, use **hybrid access mode**. You can apply Lake Formation permissions only to a specific set of users while leaving all other existing workloads on the IAM approach, and migrate gradually.

## Types of Lake Formation Permissions

| Permission | Target | Meaning |
|------|------|------|
| `SELECT` / `INSERT` / `DELETE` | Table | Read, write, and delete the underlying data |
| `DESCRIBE` | Database, table | View metadata |
| `ALTER` / `DROP` | Database, table | Change or delete the definition |
| `CREATE_TABLE` | Database | Create tables |
| `DATA_LOCATION_ACCESS` | Registered S3 location | Can create catalog resources that point to that location |
| `Super` | Everything | All operations on that resource |

- Permissions work by **granting**. If you add `with grant option`, the recipient can pass the permission on to other principals.
- The **data location permission** is not a read permission. It controls "may this principal create a table that points to this S3 path?" It is a safeguard against someone bypassing controls by creating their own table over a sensitive path. `SELECT` and `INSERT` are enough to read and write the data.

## Fine-Grained Permissions: Columns, Rows, Cells, and Data Filters

| Level | Method | Example |
|------|------|------|
| Column level | Specify columns to include or exclude | Hide PII columns (email, ssn) |
| Row level | Row filter expression | See only rows for your own region |
| Cell level | Column specification + row filter | Only your region's rows, without PII |

All three levels are expressed with a single **data filter (Data Cells Filter)**. You create the filter and then grant `SELECT` on that filter.

```json
{
  "Name": "analyst_kr_no_pii",
  "TableCatalogId": "111122223333",
  "DatabaseName": "sales",
  "TableName": "orders",
  "ColumnWildcard": { "ExcludedColumnNames": ["email", "ssn"] },
  "RowFilter": { "FilterExpression": "region = 'ap-northeast-2'" }
}
```

```bash
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier=arn:aws:iam::111122223333:role/RegionAnalyst \
  --permissions SELECT \
  --resource '{"DataCellsFilter":{"TableCatalogId":"111122223333","DatabaseName":"sales","TableName":"orders","Name":"analyst_kr_no_pii"}}'
```

- Row filter expressions follow the syntax of the PartiQL `WHERE` clause. Strings are wrapped in single quotes. To allow all rows, use the "all rows" wildcard.
- Filters apply **only to reads**. `SELECT` is the only permission you can grant together with a filter.
- You create multiple filters on a single table and grant a different filter to each role. Even when the same query is run, the results differ depending on the role.
- Integrated engines such as Athena, Redshift Spectrum, and EMR apply these filters. A Glue job that reads a table with a cell-level filter cannot use some features, such as job bookmarks and pushdown predicates.

## Managing Permissions at Scale: LF-Tags (TBAC)

With named-resource permissions, the number of GRANT statements multiplies as users and tables increase. **LF-Tags** attach tags to resources and grant permissions on tag values.

```json
{
  "TagPolicy": {
    "Expression": [
      { "TagKey": "sensitivity", "TagValues": ["public", "internal"] },
      { "TagKey": "domain", "TagValues": ["sales"] }
    ],
    "Permissions": ["SELECT", "DESCRIBE"]
  }
}
```

- The example above grants SELECT on resources whose `sensitivity` is public or internal **and** whose `domain` is sales. Keys are combined with AND, and values of a single key are combined with OR. Resources with `sensitivity=confidential` are automatically excluded.
- Tags are **inherited**. A table inherits the tags of its database, a column inherits the tags of its table, and values can be overridden further down. If you attach `sensitivity=confidential` to just one column, only that column is excluded, giving you column-level control.
- For a new table, permissions apply automatically as long as the tags match. You do not need to write a new GRANT.
- **LF-Tags are not IAM tags.** They cannot be used interchangeably. LF-Tags are used for granting Lake Formation permissions, and IAM tags are used in IAM policy conditions.

| Comparison | Named-resource permissions | LF-Tags (TBAC) |
|------|------|------|
| Unit of granting | Resource name | Tag expression |
| Number of operations needed | Number of principals × number of resources | Number of principals + number of resources |
| New table | Add a GRANT every time | Just attach the tags |
| Suitable scale | Few, fixed tables | Many tables that keep growing |

## Cross-Account Access

| Method | How it works | Caveats |
|------|------|------|
| Lake Formation cross-account sharing | Grant catalog resources directly to another account, organization, or OU, or to an IAM principal in the other account. Internally it is shared through AWS RAM | Within the same organization it can be used immediately; outside the organization, the other account must accept the RAM invitation |
| S3 bucket policy | Allow a principal from the other account on the bucket | No fine-grained control. The other account's identity-based policy is also required |
| Role assumption (AssumeRole) | Let an external account assume a role through the trust policy | Both the role's permission policy and the `sts:AssumeRole` permission on the other side are required |

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::444455556666:root" },
  "Action": "sts:AssumeRole"
}
```

- To query with Athena or Redshift Spectrum in the account that received the share, you must create a **resource link**. It is a local pointer that makes the shared table visible to the query engine.
- The data lake administrator of the receiving account must **grant again** the received permissions to users in their own account. Being shared with an account does not mean every user in that account can read the data.
- If the data is encrypted with a customer managed KMS key, the key policy must also allow the cross-account principal. An AWS managed key (`aws/s3`) cannot have its key policy changed, so it cannot be used for cross-account sharing.

> 💡 **Related theory**: Cross-account access succeeds only when both the "trusting side (trust policy)" and the "permission-granting side (permission policy)" are configured. For encrypted data, the KMS key policy must also be right, so all three layers must line up. If a question says two of them are correct but access still fails, the remaining one is the answer.

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| IAM is sufficient but Athena says "Insufficient permissions" | No `SELECT` or `DESCRIBE` in Lake Formation | Grant permissions on the table (or filter) |
| Lake Formation permissions exist but access is denied | The `lakeformation:GetDataAccess` IAM permission is missing | Add it to the user or execution role |
| Columns were hidden but everything is visible | `Super` for `IAMAllowedPrincipals` remains | Revoke it and change the default settings |
| A filter is applied but the user downloaded the raw files | The user has direct S3 permissions | Remove direct access from the IAM and bucket policies |
| A shared table does not appear in Athena | RAM invitation not accepted, or no resource link | Accept the invitation and create a resource link |
| Cross-account query fails at the decryption step | The other principal is not in the KMS key policy | Allow `kms:Decrypt` in the key policy |
| Permission requests pile up with every new table | Named-resource permission operations | Switch to LF-Tags |

## Question Clue → Correct Answer Table

| Clue in the question | Correct answer |
|------|------|
| "IAM policies allow everything, but table queries are denied" | Missing Lake Formation permission |
| "Exclude PII columns + only your own region's rows" | Data filter (cell level) |
| "Hundreds of tables added every week, remove the GRANT burden" | LF-Tags (TBAC) |
| "Share catalog tables with another account with fine-grained control" | Lake Formation cross-account sharing (RAM) |
| "Cross-account + failure to access encrypted data" | KMS key policy |
| "When Deny and Allow are both present" | Explicit Deny takes precedence |
| "Migrate gradually without breaking existing IAM-based workloads" | Hybrid access mode |
| "Prevent arbitrary creation of tables over a sensitive S3 path" | Data location permission |

Tomorrow we cover the layer that protects data even after access has been granted: KMS and per-service encryption.

## 📖 Glossary

- **Least privilege**: The principle of granting only the permissions that are strictly necessary to do the job.
- **Trust policy**: A resource-based policy attached to a role that decides "who can assume this role."
- **Register**: Handing an S3 location over to Lake Formation to control. At this point you specify the role that will read and write that location.
- **Credential vending**: The way Lake Formation hands temporary credentials to a query engine after checking permissions.
- **IAMAllowedPrincipals**: A virtual group meaning every principal allowed by IAM policies. While this group's permissions remain, Lake Formation control is not applied.
- **Data filter**: A Lake Formation object that bundles the visible columns and the row conditions together.
- **LF-Tags**: Tags specific to Lake Formation that you attach to catalog resources and use as the basis for granting permissions.
- **Named-resource permissions**: A way of granting permissions by specifying each database and table name one by one.
- **Resource link**: A pointer in your own catalog that refers to a table shared from another account.
- **Data location permission**: The permission to create catalog resources that point to a specific S3 path.

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
