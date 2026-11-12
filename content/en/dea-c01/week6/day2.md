# Day 2 - AWS Lake Formation Central Permission Management

As data lakes grow, managing "who can access which tables, columns, and rows" becomes difficult with IAM policies alone. AWS Lake Formation is a service for central, fine-grained data lake permission management. Today we cover permission models, data location registration, and blueprints.

## Problems Lake Formation Solves

Using only S3 + Glue Data Catalog, permissions scatter across IAM policies and S3 bucket policies. Column-level and row-level control is difficult, and auditing is complex. Lake Formation abstracts permissions to **database/table/column/row** levels and manages them centrally with GRANT and REVOKE operations.

> 💡 **Related Theory**: Lake Formation uses Glue Data Catalog as the permission control point. It provides RDBMS-like GRANT/REVOKE models for catalog databases and tables.

## Data Location Registration

To manage S3 paths with Lake Formation, you must first **register** them. During registration, specify the **service role (IAM role)** that Lake Formation will use; afterward, Lake Formation accesses S3 using this role on behalf of users.

```bash
# Register S3 location to Lake Formation (specify role for Lake Formation to use)
aws lakeformation register-resource \
  --resource-arn arn:aws:s3:::acme-datalake-clean-prod \
  --role-arn arn:aws:iam::111122223333:role/LakeFormationServiceRole
```

For registered locations, **credential vending** occurs. That is, analysts without direct S3 permissions can read data through Lake Formation-issued temporary credentials. This is the core mechanism for centralizing access control to Lake Formation.

## Permission Models: LF-Tags vs Named Resources

Lake Formation grants permissions in two ways:

1. **Named Resource**: Specify databases/tables/columns directly.
2. **LF-Tags (tag-based, TBAC)**: Tag resources (e.g., `classification=pii`) and grant permissions based on tag conditions. Excellent scalability for many resources.

```sql
-- Named: allow analyst SELECT on specific columns only
GRANT SELECT (order_id, region, amount)
ON TABLE sales_db.orders
TO 'arn:aws:iam::111122223333:role/AnalystRole';
```

```bash
# LF-Tag based: grant access to all resources tagged pii=true to security team only
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier=arn:aws:iam::111122223333:role/SecurityRole \
  --permissions "SELECT" \
  --lf-tag-policy 'ResourceType=TABLE,Expression=[{TagKey=classification,TagValues=[pii]}]'
```

> 💡 **Related Theory**: TBAC (Tag-Based Access Control) mitigates RBAC's policy explosion problem by auto-applying permissions with a single tag assignment, even when resources number in the thousands.

## Column, Row, and Cell-Level Security

Lake Formation provides granular security:

- **Column Level**: Specify allowed columns in GRANT or use exclude lists.
- **Row Level**: Define row filter expressions (e.g., `region = 'us-east-1'`) using **data filters** to expose only specific rows to certain users.
- **Cell Level**: Combine column and row filters.

```bash
# Create row-level filter: expose only US East region rows
aws lakeformation create-data-cells-filter --table-data '{
  "TableCatalogId": "111122223333",
  "DatabaseName": "sales_db",
  "TableName": "orders",
  "Name": "us-east-only",
  "RowFilter": {"FilterExpression": "region = '\''us-east-1'\''"},
  "ColumnWildcard": {}
}'
```

## Blueprints and Workflows

**Blueprints** templatize common ingestion patterns and auto-generate Glue workflows (crawlers + ETL jobs).

- **Database snapshot**: Full snapshot of JDBC sources (RDS, etc.) into data lake.
- **Incremental database**: Incremental ingestion based on bookmark column.
- **Log file**: Ingestion of CloudTrail, ELB, ALB, etc. logs.

Running a blueprint creates a workflow composed of Glue crawlers, jobs, and triggers, automating repeated collection.

> 💡 **Related Theory**: Blueprints are only generators of Glue workflows. The execution result is standard Glue crawlers/jobs/triggers, managed and monitored directly in the Glue console.

## Relationship with IAM and Hybrid Mode

Lake Formation and IAM permissions are evaluated together. Analysts need both IAM permissions for Athena/Glue API calls and Lake Formation permissions for data access. To maintain existing IAM-based access while gradually transitioning, use **hybrid access mode**.

## Cross-Account Sharing

Lake Formation can share LF-Tags or named resources with other AWS accounts and organizations (via AWS RAM). Used when central data lake accounts delegate permissions to domain accounts in data mesh structures.

## Key Takeaways

- Registering S3 locations enables Lake Formation to control access via credential vending.
- Grant permissions using named resources or LF-Tags (TBAC); tag-based is advantageous at scale.
- Provide granular column-level, row-level (data filters), and cell-level security.
- Blueprints auto-generate ingestion workflows (crawlers + jobs + triggers).
- Both IAM and Lake Formation permissions are required (evaluated together).

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
