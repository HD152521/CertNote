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

## 📝 연습 문제

**문제 1.** 분석가가 S3 버킷에 직접 IAM 권한이 없어도 Lake Formation을 통해 등록된 위치의 데이터를 읽을 수 있게 하는 메커니즘은?

A) S3 버킷 정책 와일드카드  
B) 자격 증명 벤딩(credential vending)  
C) STS 페더레이션 토큰 직접 발급  
D) VPC 엔드포인트 정책  

**정답: B**  
해설: 위치를 Lake Formation에 register하면, 지정된 서비스 역할로 Lake Formation이 임시 자격 증명을 벤딩해 사용자를 대신해 S3에 접근합니다. 분석가에게 S3 직접 권한이 없어도 됩니다. 나머지는 권한 일원화 메커니즘과 다릅니다.

---

**문제 2.** 데이터레이크 테이블이 수천 개로 늘었을 때, 리소스에 `classification=pii` 같은 태그를 붙이고 태그 조건으로 권한을 부여해 확장성을 높이는 Lake Formation 방식은?

A) 명명형 리소스 권한  
B) S3 ACL  
C) LF-Tags 기반 TBAC  
D) IAM 인라인 정책  

**정답: C**  
해설: LF-Tags 기반 TBAC는 태그 조건으로 권한을 부여해 리소스가 많아도 정책 폭증 없이 관리됩니다. 명명형은 리소스를 일일이 지정해야 하고, S3 ACL/IAM 인라인 정책은 세분화·확장성 면에서 부적합합니다.

---

**문제 3.** Lake Formation에서 특정 사용자에게 `region = 'us-east-1'` 행만 노출하려면 무엇을 사용하는가?

A) 컬럼 와일드카드  
B) 데이터 필터(행 수준 필터)  
C) 블루프린트  
D) 워크그룹  

**정답: B**  
해설: 행 수준 보안은 데이터 필터(data cells filter)의 RowFilter 표현식으로 구현합니다. 컬럼 와일드카드는 컬럼 선택, 블루프린트는 수집 워크플로우 생성, 워크그룹은 Athena 비용·격리 개념입니다.

---

**문제 4.** RDS 같은 JDBC 소스를 북마크 컬럼 기준으로 증분 적재하는 Glue 워크플로우를 자동 생성하려면 어떤 Lake Formation 블루프린트를 사용하는가?

A) Incremental database 블루프린트  
B) Database snapshot 블루프린트  
C) Log file 블루프린트  
D) Streaming 블루프린트  

**정답: A**  
해설: Incremental database 블루프린트는 북마크 컬럼 기준 증분 적재 워크플로우를 만듭니다. Database snapshot은 전체 스냅샷, Log file은 로그 적재용이며, Streaming은 표준 블루프린트 유형이 아닙니다.

---

**문제 5.** 분석가가 Athena로 Lake Formation 관리 테이블을 쿼리할 때 반드시 필요한 권한 조합은?

A) S3 버킷 정책만  
B) Lake Formation 권한만  
C) KMS 키 정책만  
D) IAM 권한(Athena/Glue API)과 Lake Formation 데이터 권한 모두  

**정답: D**  
해설: Lake Formation 권한과 IAM 권한은 함께 평가됩니다. Athena/Glue API 호출용 IAM 권한과 데이터 접근용 Lake Formation 권한을 모두 가져야 쿼리가 성공합니다. 어느 한쪽만으로는 부족합니다.

---
