# Day 1 - Glue Data Catalog and Crawlers: Adding Metadata to Data

Millions of Parquet files in S3 are just "byte blobs" without metadata. Without knowing columns, types, partition keys, you can't write a single SQL statement. **AWS Glue Data Catalog** centrally manages this "data about data" — metadata. Exam scenarios like "Athena queries S3," "Redshift Spectrum reads external tables," "EMR shares Hive metastore" almost always involve Glue Data Catalog.

Data Catalog is fundamentally a **managed metadata store compatible with Apache Hive Metastore**. If you've run Hive Metastore on RDS, Glue takes that operational burden.

## Data Catalog Structure: Database → Table → Partition

Catalog has hierarchical structure.

| Layer | Meaning | Example |
|-------|---------|---------|
| Database | Logical table group (namespace) | `sales_db` |
| Table | Schema + S3 location + format | `orders` |
| Partition | Physical table subdivision | `year=2026/month=06` |
| Column | Column name and data type | `order_id: bigint` |

Key insight: **tables don't store data**. Tables are "data really lives at `s3://bucket/orders/`, Parquet format, columns are..." — pointers and specifications. This separation lets Athena, Redshift Spectrum, EMR, Glue ETL all read same S3 data with identical schema.

```sql
-- Catalog-registered table (conceptual DDL)
CREATE EXTERNAL TABLE sales_db.orders (
  order_id   BIGINT,
  amount     DECIMAL(10,2),
  status     STRING
)
PARTITIONED BY (year INT, month INT)
STORED AS PARQUET
LOCATION 's3://my-lake/orders/';
```

> 💡 **Related theory**: "Schema-on-read" is data lake's core philosophy. Traditional DBs (schema-on-write) enforce schema at write. Lakes store raw to S3, **apply schema at read**. Data Catalog holds that read-time schema, enabling flexibility like multiple table schemas on same files.

## Crawlers: Robots Auto-Populating Metadata

Registering tables via DDL manually is impractical. **Glue Crawlers** scan data stores (usually S3 paths), infer file format and schema, auto-register results as tables/partitions in Catalog.

Crawler steps:

```
1. Connect data source (S3 path, JDBC, DynamoDB, etc.)
2. Classifier infers format (Parquet/JSON/CSV/ORC/Avro...)
3. Infer schema (column names, types)
4. Detect partition structure (folder path key=value patterns)
5. Create or update Catalog table
```

Crawler uses **Classifiers** to detect format first. Built-in ones recognize Parquet, ORC, Avro, JSON, CSV, XML; custom ones use Grok patterns or regex. Multiple Classifiers tried in priority order; first match wins.

> 🔍 **Going deeper**: Crawlers can be expensive. Millions of S3 objects mean scanning overhead. **Incremental crawl** scans only newly-added folders since last run, cutting cost/time. For tables with new partitions only, `ALTER TABLE ADD PARTITION` or **Athena Partition Projection** can replace crawlers entirely.

## Partition Detection: Folder Structure as Index

Crawlers excel at partition detection. When S3 paths are `s3://my-lake/orders/year=2026/month=06/` (Hive-style `key=value`), crawlers auto-recognize `year`, `month` as partition columns.

```
s3://my-lake/orders/
├── year=2025/month=12/  ← Partition (year=2025, month=12)
├── year=2026/month=05/
└── year=2026/month=06/  ← New partitions registered
```

Partitions matter for **partition pruning**. `WHERE year=2026 AND month=06` scans only that folder. Without partitions, every query scans all data — expensive for Athena's scan-based billing.

> ⚠️ **Pitfall**: Non-Hive paths like `2026/06/25/` can't auto-name partitions; crawlers create meaningless names like `partition_0`. Use Hive-style paths from the start. If already non-Hive, manually map partitions or use Athena Partition Projection.

## Schema Inference and Limits

Schema inference samples files and guesses types — imperfect. Two pitfalls:

First, **type inference conflicts**. Same column appears as integer (`123`) in one file, string (`"N/A"`) in another; crawler either widens type (string) or creates separate schemas per folder.

Second, **schema merge and table split**. Incompatible schemas mixed under one path cause crawler to split into multiple tables. Enable "merge compatible data to single schema" option to prevent.

> 🎯 **Scenario**: Daily new files land at `s3://lake/events/dt=YYYY-MM-DD/`. Analysts want fast Athena queries for yesterday only. Setup: (1) Load data with `dt=` Hive paths → (2) Schedule crawler daily incremental crawl → (3) Crawler registers new `dt=` partitions → (4) Analysts query `WHERE dt='2026-06-25'` scanning only that partition. Since only new partitions appear, Partition Projection can replace crawlers further.

## Summary: Entry Point to All Analytics

Data Catalog is analytics ecosystem's **single source of truth**. Registered schemas shared by Athena, Redshift Spectrum, EMR, Glue ETL. Crawlers auto-populate Catalog; partition detection and schema inference are core. Tomorrow: Glue ETL Jobs transform Catalog tables into actionable data.

---

## 📝 Practice Problems

**Problem 1.** Central metadata store letting Athena, Redshift Spectrum, EMR query same S3 data with identical schema?

A) Amazon RDS  
B) AWS Glue Data Catalog  
C) Amazon DynamoDB  
D) AWS Lake Formation permissions  

**Answer: B**  
Explanation: Glue Data Catalog is Hive-compatible central metadata store; multiple engines share registered schemas. RDS and DynamoDB are data stores, not catalogs. Lake Formation manages permissions atop it.

---

**Problem 2.** S3 path `s3://lake/sales/region=us/year=2026/`. What does Glue Crawler do?

A) Ignore `region` and `year`, create single non-partitioned table  
B) Copy all files to DynamoDB  
C) Auto-recognize `region` and `year` as partition columns, register in Catalog  
D) Reject Hive-style paths with error  

**Answer: C**  
Explanation: Crawlers auto-detect `key=value` Hive-style paths as partitions. These enable partition pruning to cut scan volume and cost. Crawlers only handle metadata, not data copying.

---

**Problem 3.** Most accurate description of Glue Data Catalog table?

A) Table is metadata spec (schema, S3 location, format); data itself stays in S3  
B) Table stores actual data rows in its own storage  
C) One table usable by exactly one analytics engine only  
D) Creating table auto-converts source files to Parquet  

**Answer: A**  
Explanation: Catalog table is pointer: "data lives at s3://bucket/orders/, Parquet format, schema is...". Multiple engines share same table definition. Creation doesn't convert file formats.

---

**Problem 4.** Millions of S3 objects with new folders added daily. Reduce crawler cost/time most?

A) Full scan all paths every time  
B) Increase concurrent crawler runs  
C) Create new S3 bucket daily  
D) Use incremental crawl or Athena Partition Projection  

**Answer: D**  
Explanation: Incremental crawl scans only new folders; Partition Projection eliminates crawlers for predictable partition rules. Both cut cost significantly. Full scans increase cost; buckets don't help.

---

**Problem 5.** Non-standard log format; built-in Classifier can't infer schema. Appropriate response?

A) Skip crawlers, write all DDL manually  
B) Force-convert all to CSV  
C) Define Custom Classifier with Grok/regex patterns for crawler  
D) Store in DynamoDB instead  

**Answer: C**  
Explanation: Custom Classifiers with Grok/regex handle non-standard formats. Manual DDL or format forcing are inefficient. Custom Classifier solves the problem.

---
