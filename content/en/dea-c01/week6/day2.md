# Day 2 - Centralized Permission Management with AWS Lake Formation

## 📌 Key Takeaways

- Lake Formation manages permissions at the **database, table, column, and row** level on top of the Glue Data Catalog using GRANT/REVOKE. It consolidates data permissions scattered across S3 bucket policies and IAM policies into one place.
- When you **register** an S3 location, integrated engines (Athena, Glue, EMR, Redshift Spectrum) obtain temporary credentials from Lake Formation to read it (**credential vending**). Users do not need direct S3 permissions.
- Permissions are granted either with **named resources** or with **LF-Tags (LF-TBAC)**. When there are many resources, the tag-based approach is recommended.
- **Data filters** apply column-, row-, and cell-level security. Filters apply only to reads, so they attach only to the SELECT permission.
- **Both** IAM and Lake Formation permissions are required. If the default `IAMAllowedPrincipals` permission remains, Lake Formation permissions are not enforced.

## The Problem Lake Formation Solves

As a data lake grows, it becomes hard to manage "who can access which tables, columns, and rows" with IAM policies alone. If you use only S3 + the Glue Data Catalog, permissions are split into two places.

- **Metadata**: Actions like `glue:GetTable` in IAM policies, and Glue resource policies.
- **Data**: S3 bucket policies and `s3:GetObject` in IAM policies.

In this structure, the smallest unit of permission is the **S3 prefix**. You cannot express "everything in this table except the national ID number column" or "only the rows for the user's own region." To hide a column, you have to build a separate copy of the table without that column.

Lake Formation turns this into an RDBMS-style permission model. Permissions are applied in two layers.

- **Metadata permissions**: Permissions on the databases and tables in the Data Catalog. A table you have no permission on does not appear in the `GetTables` response at all.
- **Storage access management**: Issues temporary credentials so that integrated engines read the data in registered S3 locations on the user's behalf.

> 💡 **Related Theory**: Lake Formation uses the Glue Data Catalog as its permission control point. It does not create a separate catalog; it layers GRANT/REVOKE on the databases and tables of the same catalog. So crawlers, ETL jobs, and Athena tables stay as they are, and only the permission layer changes.

## The Four Steps a Single Query Goes Through

When an analyst queries a Lake Formation-managed table with Athena, it proceeds in the following order.

```text
① Metadata request     Athena → Data Catalog : give me this table's definition
② Permission check     Data Catalog → Lake Formation : can this user see it?
                       → returns metadata containing only the permitted columns to the engine
③ Credential request   Athena → Lake Formation : give me access to the data in the registered location
                       → Lake Formation issues temporary credentials with the role specified at registration
④ Data read            Athena → S3 : reads with the temporary credentials, applies column/row/cell filters, returns results
```

- Steps ③ and ④ are **credential vending**. The user's IAM policy does not need S3 permissions. The S3 permissions belong to "the role specified at registration."
- If the table location is not registered with Lake Formation, step ③ does not exist. The engine reads S3 directly with the user's permissions, and the bucket policy and IAM policy are evaluated.
- It is the **engine** that actually applies row and cell filters. So filters are honored only when going through an engine integrated with Lake Formation.

## Registering Data Locations

```bash
# Register an S3 location with Lake Formation (specify the role Lake Formation will use)
aws lakeformation register-resource \
  --resource-arn arn:aws:s3:::acme-datalake-clean-prod \
  --role-arn arn:aws:iam::111122223333:role/LakeFormationServiceRole
```

The registration target is a bucket or a prefix under a bucket (individual objects are not allowed). There are two kinds of registration roles.

| Role | Characteristics | When you must use a user-defined role |
|------|------|------|
| Service-linked role | Simplest. Required permissions are granted automatically | - |
| User-defined role | You configure the S3 read/write inline policy and the `lakeformation.amazonaws.com` trust relationship yourself | Registering a location in another account, a location encrypted with an AWS managed key (`aws/s3`), a location accessed through Amazon EMR |

- The administrator who registers must have `iam:PassRole` for that role.
- If the location is encrypted with a KMS key, the registration role must be able to use that key. This is a common cause of "I granted every permission but still get Access Denied."
- Avoid registering Requester Pays buckets. The registration role is always treated as the requester.

## Permission Types and What "Both Are Required" Means

| Target | Main permissions |
|------|------|
| Database | `CREATE_TABLE`, `ALTER`, `DROP`, `DESCRIBE` |
| Table | `SELECT`, `INSERT`, `DELETE`, `ALTER`, `DROP`, `DESCRIBE` |
| Data location | `DATA_LOCATION_ACCESS` |
| LF-Tag | `DESCRIBE`, `ASSOCIATE` |

- **IAM is the coarse door, and Lake Formation is the fine-grained door.** In addition to the IAM permissions to call the Athena and Glue APIs, a user needs the `lakeformation:GetDataAccess` IAM permission (without it, the user cannot request temporary credentials), and on top of that must receive Lake Formation's `SELECT` and so on. For Athena, this IAM permission is needed by the user; for other engines, by the execution role.
- **Data location permission** is not a read permission. It controls "whether you can create tables or databases that point to this S3 location." `SELECT` and `INSERT` are enough for reading and writing. It is the mechanism that prevents someone from creating a table at an arbitrary location to pull data out.
- If a principal receives permissions through multiple routes, the result is the **union**. If it received col1 to col3 through named grants and col5 to col6 through tags, it can see five columns.
- Permissions received `WITH GRANT OPTION` can be granted again to other principals. It is used when delegating permission management to domain teams.
- A data lake administrator implicitly has `DESCRIBE` on all resources, data location permission on all locations, and GRANT/REVOKE permission. The person who created a table implicitly has all permissions on that table.

## A Pitfall in the Default Settings: IAMAllowedPrincipals

So as not to break existing Glue users, Lake Formation by default attaches a permission (Super) for a virtual group called `IAMAllowedPrincipals` to every database and table. This group means "all principals that can access catalog resources through IAM policies."

- While this permission remains, **access is decided by IAM alone.** Even if you restrict columns and GRANT in Lake Formation, a user who has IAM access sees everything.
- To enforce fine-grained permissions, **revoke** the `IAMAllowedPrincipals` permission on the resource, and change the account settings so that this permission is not automatically attached to new databases and tables.

> ⚠️ **Pitfall**: The cause of "I set a column restriction in Lake Formation but the analyst still sees all columns" is usually one of two things. Either the `IAMAllowedPrincipals` permission remains, or the analyst's IAM policy has direct S3 permissions, leaving open a path that bypasses Lake Formation. Lake Formation's permission model cannot block direct reads through the S3 API. Control is complete only when you remove the direct S3 permissions.

## Hybrid Access Mode

If you cannot switch everything at once, register the location in **hybrid access mode**. It keeps two paths open at the same time on the same catalog object.

- **Opted-in principals**: Lake Formation permissions are enforced (IAM permissions are also required).
- **All other principals**: Access with IAM and S3 policies alone, as before.

The purpose of this mode is "apply column restrictions only to a new analyst group without touching existing ETL jobs."

## Named Resources vs LF-Tags

```bash
# Named: allow SELECT on only some columns of a specific table for AnalystRole
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier=arn:aws:iam::111122223333:role/AnalystRole \
  --permissions "SELECT" \
  --resource '{"TableWithColumns": {"DatabaseName": "sales_db", "Name": "orders",
               "ColumnNames": ["order_id", "region", "amount"]}}'
```

```bash
# LF-Tag based: allow all tables tagged classification=pii only for SecurityRole
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier=arn:aws:iam::111122223333:role/SecurityRole \
  --permissions "SELECT" \
  --resource '{"LFTagPolicy": {"ResourceType": "TABLE",
               "Expression": [{"TagKey": "classification", "TagValues": ["pii"]}]}}'
```

| Aspect | Named resources | LF-Tags (LF-TBAC) |
|------|------|------|
| Grant unit | Databases, tables, and columns specified by name | All resources matching a tag expression |
| Number of operations needed | Number of principals × number of resources | Number of principals + number of resources |
| When a new table is created | GRANT again | Applied automatically once you attach the tag (or inherit it) |
| Suitable scale | A few tables, exceptional permissions | Environments with many tables that grow quickly |
| Inheritance | None | Inherited from database → table → column, can be overridden at lower levels |

- An LF-Tag is a key-value pair like `department=sales`, and one key can have multiple values defined.
- **LF-Tags are different from IAM tags and AWS resource tags.** They are visible only inside Lake Formation and are not compatible with each other. "Control Lake Formation permissions with S3 object tags" is a wrong answer.
- Once you have confirmed that permissions are applied correctly through tags, it is recommended to revoke the permissions you previously granted as named resources. If you leave them, they remain alive as a union.

## Column-, Row-, and Cell-Level Security

Fine-grained security is built with an object called a **data filter**. A filter belongs to a specific table and holds a column specification and a row filter expression.

| Level | Filter composition | Example |
|------|------|------|
| Column | Specify included/excluded columns + all rows | Only the rest, excluding PII columns |
| Row | All columns + a row filter expression | Only rows where `region = 'us-east-1'` |
| Cell | Specify columns + a row filter expression | Expose the address column only in US rows |

```bash
# Cell-level filter: only US East rows, excluding the customer_name column
aws lakeformation create-data-cells-filter --table-data '{
  "TableCatalogId": "111122223333",
  "DatabaseName": "sales_db",
  "TableName": "orders",
  "Name": "us-east-no-name",
  "RowFilter": {"FilterExpression": "region = '\''us-east-1'\''"},
  "ColumnWildcard": {"ExcludedColumnNames": ["customer_name"]}
}'
```

- The row filter expression follows the WHERE clause syntax of PartiQL (with some restrictions). String literals are enclosed in single quotes.
- Filters apply **only to reads**. The only permission you can give together with a filter is `SELECT`.
- Creating the filter is not the end. When you grant `SELECT`, you must specify that filter (`DataCellsFilter`) as the resource for it to take effect.
- Create several filters on one table and grant a different filter to each principal: no filter for administrators, a regional filter for regional analysts.
- A simple column restriction works without a filter. In a named GRANT, specify the included columns (`ColumnNames`) or the excluded columns (`ColumnWildcard.ExcludedColumnNames`).

## Blueprints and Workflows

A **blueprint** is a template for a common ingestion pattern, and running it generates a **workflow** made up of Glue crawlers, jobs, and triggers.

| Blueprint | Behavior | Selection criteria |
|------|------|------|
| Database snapshot | Loads and reloads all tables of a JDBC source in full (exclusion patterns can be specified) | The schema changes freely (column renames, deletions) and must match the source exactly |
| Incremental database | Loads only new data based on a bookmark column. You specify target tables one by one | Columns are only added, only new rows arrive and existing rows are not modified |
| Log file | Bulk-loads CloudTrail, ELB, and ALB logs | AWS service logs |

- The first run of the Incremental database blueprint loads everything and sets the bookmark. Subsequent runs are incremental.
- The bookmark approach looks only at "rows whose bookmark column value has grown." **It cannot catch UPDATEs or DELETEs of existing rows.** If you must follow changes and deletions too, DMS CDC is the right tool.
- The workflow is shown as a DAG in the Glue console and you can track the status of each node. When the workflow finishes, the user who ran it is granted `SELECT` on the created tables.

A blueprint is a generator of Glue workflows. The output is ordinary Glue crawlers, jobs, and triggers, so you monitor them directly in the Glue console, and the cost is incurred on the Glue side for as long as those crawlers and jobs run. However, users cannot edit the blueprints and workflows created by Lake Formation.

## Cross-Account Sharing and Data Mesh

Lake Formation shares catalog resources directly with other accounts, organizations, OUs, or IAM principals in other accounts. Internally it uses **AWS RAM**.

1. The producer account grants permissions to the external account (named resources or LF-Tags; the tag approach is recommended).
2. Within the same organization, it is visible right away; outside the organization, the recipient account administrator must accept the RAM invitation.
3. In the recipient account, create a **resource link** that points to the shared resource. Athena and Redshift Spectrum need a resource link to include a shared table in a query.
4. The recipient account administrator grants permissions again to principals in their own account.

- Data is not copied. It stays in the producer account's S3, and only the metadata and access permissions are shared.
- It is used in **data mesh** setups where domain accounts own the data and a central governance account manages the catalog and permissions.
- Cross-account access records are kept in CloudTrail. If the question mentions audit requirements, CloudTrail is the answer.

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Column restriction set but everything is visible | `IAMAllowedPrincipals` permission remains | Revoke it on the resource, change the default settings |
| Reads S3 directly, bypassing Lake Formation | The user's IAM has direct S3 permissions | Remove the direct S3 permissions |
| Access Denied even though `SELECT` was granted | No `lakeformation:GetDataAccess`, location not registered, insufficient S3/KMS permissions on the registration role | Add the IAM permission, register the location, fix the role policy |
| Table creation fails | No data location permission | Grant `DATA_LOCATION_ACCESS` |
| A shared table does not appear in Athena | RAM invitation not accepted, no resource link | Accept the invitation, create a resource link |
| EMR cannot read a registered location | Registered with the service-linked role | Deregister and re-register with a user-defined role |

## Exam Clue → Answer Lookup

| Clue in the question | Answer |
|------|------|
| "Let users query a table without direct S3 permissions" | Location registration + credential vending |
| "Thousands of tables, make permission management scalable" | LF-Tags (LF-TBAC) |
| "Hide PII columns" | Column-level permissions (included/excluded columns) |
| "Only rows for the user's own region or department" | Row filter of a data filter |
| "The visible columns differ depending on the row" | Cell-level security (columns + row filter) |
| "Keep existing IAM-based access while switching only some users" | Hybrid access mode |
| "Share a table with another account without copying" | Lake Formation cross-account sharing (RAM) + resource link |
| "Automatically generate a workflow that loads a JDBC source incrementally" | Incremental database blueprint |
| "Audit who accessed which data" | CloudTrail |

Tomorrow we cover open table formats, which add a transaction layer on top of Parquet in S3 to enable row-level updates and deletes and time travel.

## 📖 Glossary

- **Data location registration**: Bringing an S3 path under Lake Formation management. From then on, Lake Formation mediates data access to that path.
- **Credential vending**: A method in which Lake Formation hands temporary credentials to an integrated engine so that it reads S3 on the user's behalf.
- **Named resource method**: A method that grants permissions by specifying databases, tables, and columns directly by name.
- **LF-Tag / LF-TBAC**: A Lake Formation-specific tag attached to catalog resources, and the method of granting permissions by conditions on those tags.
- **Data filter**: A column specification + row filter expression defined on a table. It implements column-, row-, and cell-level security.
- **Data location permission**: The permission to create tables or databases that point to a specific S3 location.
- **IAMAllowedPrincipals**: A virtual group meaning all principals that can access via IAM policies. While this permission remains, access is decided by IAM alone.
- **Hybrid access mode**: A mode that enforces Lake Formation permissions only on opted-in principals and keeps the IAM approach for the rest.
- **Blueprint**: An ingestion pattern template. Running it creates a workflow made of Glue crawlers, jobs, and triggers.
- **Resource link**: A reference object that points, in your own catalog, to a database or table shared from another account.

## 📝 Practice Questions

**Question 1.** Which mechanism allows an analyst to read data in a location registered through Lake Formation even without direct IAM permissions on the S3 bucket?

A) S3 bucket policy wildcard  
B) Credential vending  
C) Directly issuing STS federation tokens  
D) VPC endpoint policy  

**Answer: B**  
Explanation: When you register a location with Lake Formation, Lake Formation vends temporary credentials using the designated service role and accesses S3 on behalf of the user. The analyst does not need direct S3 permissions. The others differ from a centralized permission mechanism.

---

**Question 2.** When the number of data lake tables grows to thousands, which Lake Formation approach improves scalability by attaching tags such as `classification=pii` to resources and granting permissions based on tag conditions?

A) Named resource permissions  
B) S3 ACL  
C) LF-Tags based TBAC  
D) IAM inline policy  

**Answer: C**  
Explanation: LF-Tags based TBAC grants permissions through tag conditions, so it can be managed without an explosion of policies even when there are many resources. The named method requires specifying each resource individually, and S3 ACLs/IAM inline policies are unsuitable in terms of granularity and scalability.

---

**Question 3.** What do you use in Lake Formation to expose only the rows where `region = 'us-east-1'` to a specific user?

A) Column wildcard  
B) Data filter (row-level filter)  
C) Blueprint  
D) Workgroup  

**Answer: B**  
Explanation: Row-level security is implemented with the RowFilter expression of a data filter (data cells filter). A column wildcard is for selecting columns, a blueprint creates ingestion workflows, and a workgroup is an Athena cost and isolation concept.

---

**Question 4.** Which Lake Formation blueprint do you use to automatically create a Glue workflow that incrementally loads a JDBC source such as RDS based on a bookmark column?

A) Incremental database blueprint  
B) Database snapshot blueprint  
C) Log file blueprint  
D) Streaming blueprint  

**Answer: A**  
Explanation: The Incremental database blueprint creates a workflow that loads incrementally based on a bookmark column. Database snapshot is for a full snapshot, Log file is for loading logs, and Streaming is not a standard blueprint type.

---

**Question 5.** What combination of permissions is required for an analyst to query a Lake Formation-managed table with Athena?

A) S3 bucket policy only  
B) Lake Formation permissions only  
C) KMS key policy only  
D) Both IAM permissions (Athena/Glue API) and Lake Formation data permissions  

**Answer: D**  
Explanation: Lake Formation permissions and IAM permissions are evaluated together. The query succeeds only if you have both the IAM permissions for Athena/Glue API calls and the Lake Formation permissions for data access. Either one alone is not enough.

---
