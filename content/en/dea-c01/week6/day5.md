# Day 5 - Week 6 Review: Data Lakes

## 📌 Key Takeaways

- Lake design is a four-layer decision: **layout (where and how to place data) → table format (how to change it) → permissions (who can see it) → storage (at what cost to keep it)**, and the choice in one layer constrains the others.
- Scan volume problems are solved with partitions and columnar formats, catalog bottlenecks with partition projection and indexes, and file count problems with compaction. Even when symptoms look similar, the prescriptions differ.
- If you need row-level updates, deletes, and time travel, use an open table format. Iceberg to write with Athena SQL, Hudi if upserts and incremental reads are central, and Delta Lake if you have Spark assets.
- Column-, row-, and cell-level control and cross-account sharing are Lake Formation. It is actually enforced only when registration, revoking `IAMAllowedPrincipals`, and removing direct S3 permissions are all in place.
- Standard if read often, Intelligent-Tiering if the pattern is unknown, lifecycle transitions if it clearly cools off. Do not send data to be read with Athena, or the files of a table format, to archive tiers that require a restore.

## The Lake Seen as Four Layers

This week we looked separately at the layout of an S3-based data lake, Lake Formation permissions, open table formats, and storage cost optimization. In real designs, all four apply to a single table at the same time.

```text
┌─ Permissions ───── Lake Formation: registration · LF-Tags · data filters · cross-account sharing
├─ Table format ──── Hive table (path = table)  |  Iceberg · Hudi · Delta (metadata = table)
├─ Layout ────────── zones (raw/clean/curated) · partitions · file size · Parquet/compression
└─ Storage ───────── storage classes · lifecycle · Intelligent-Tiering · versioning
```

| Layer | Question it asks | This week's tools | If chosen wrongly |
|------|------|------|------|
| Layout | How little can a query be made to read | Zones, partitions, columnar formats, compaction | Full scans, small file explosion |
| Table format | How to handle consistency and changes during and after writes | Iceberg, Hudi, Delta Lake | Half-written data exposed, rows cannot be deleted |
| Permissions | Who sees which columns and rows | Lake Formation | PII exposure, permission policy explosion |
| Storage | At what cost to keep the same data | Storage classes, lifecycle | Retrieval fee shock, data that silently drops out |

## Interference Between Layers: Where What You Learned Separately Meets

The content of the four days shows up as problems where the topics collide.

| Two topics that meet | What happens | Correct handling |
|------|------|------|
| Partition projection × multiple engines | Projection works only in Athena. Redshift Spectrum and EMR see only the partitions in the catalog | For tables read by multiple engines, also register partitions in the catalog |
| Partition projection × sparse data | It lists every empty location the rule computes, which makes it slow | If more than half are empty, use regular partitions |
| Lifecycle expiration × partition metadata | The S3 objects are gone but empty partitions remain in the catalog, slowing the planning phase | Run `ALTER TABLE DROP PARTITION` to match the expiration |
| Lifecycle transition × Athena | Objects in Glacier Flexible Retrieval and Deep Archive are skipped without an error | Queryable data goes down only to Glacier Instant Retrieval |
| Lifecycle × Iceberg | If files the metadata points to are expired or archived, queries fail | Manage file lifetime with snapshot expiration and orphan file removal |
| Small files × storage classes | Objects under 128KB are not transitioned by default, and in IA they are billed as 128KB | Compaction first, transition afterwards |
| Iceberg DELETE × GDPR | Previous snapshots keep holding the files of deleted rows | DELETE → compaction → snapshot expiration (+ noncurrent version cleanup) |
| Iceberg compaction × storage cost | Right after compaction, old and new files coexist, so capacity grows | Also perform snapshot expiration after compaction |
| Versioning × overwriting ETL | Previous output piles up as noncurrent versions every time a job runs | `NoncurrentVersionExpiration` |
| Lake Formation × direct S3 permissions | A user with S3 permissions bypasses filters and reads the files directly | Remove analysts' direct S3 permissions |
| Lake Formation × table formats | Read permissions are managed, but `VACUUM`, `MERGE`, and `OPTIMIZE` permissions are not | Writes and maintenance go to a dedicated role via IAM |
| Lake Formation filters × Athena query result reuse | Tables with row and column permissions are not eligible for query result reuse | Do not expect cache savings |

## The Order for Sorting Out "Queries Are Slow or Expensive"

The same symptom has four prescriptions. First sort out what the bottleneck is.

```text
① Is the amount of data scanned large?
   ├─ It reads dates that are not needed ───────► filter by partition key (partitioning, pruning)
   └─ It reads columns that are not needed ─────► Parquet/ORC + SELECT only the needed columns

② Is the scan volume small but the planning phase long?
   ├─ Tens of thousands of partitions ──────────► partition projection / Glue partition index
   └─ Empty or old partitions have piled up ────► clean up partition metadata

③ Is the file count high?
   ├─ Small files in a Hive table ──────────────► rewrite and merge, increase writer-side buffer
   └─ Small files and delete files in Iceberg ──► OPTIMIZE / Glue table optimization

④ Does S3 return SlowDown?
   └─ Too many files + concurrent queries ──────► merge, spread out queries
```

- ① is a matter of **data scanned** (= Athena cost), and ② and ③ are matters of **time**. If the question says "reduce cost," it is ①; if "catalog lookups are the bottleneck," it is ②.
- Splitting partitions more finely solves ① while creating ② and ③. If most queries are by day, do not split down to the hour; sort inside the files by timestamp instead.

## Telling Look-Alikes Apart at a Glance

| Confusing pair | Distinction |
|------|------|
| Partition pruning vs partition projection | Pruning = read only partitions matching the condition (scan volume). Projection = compute the partition list by rule instead of the catalog (metadata lookup) |
| Partitioning vs bucketing | Partitioning = split paths by a key with few distinct values. Bucketing = gather a key with very many values into a fixed number of files by hash |
| Hive-style partitions vs Iceberg hidden partitioning | Hive = `key=value` in the path, queries must know the partition columns. Iceberg = defined by transform functions, filter on the original column |
| Compaction vs snapshot expiration | Compaction = restores read performance. Snapshot expiration = reclaims storage (narrows the time travel range) |
| Copy-on-Write vs Merge-on-Read | CoW = rewrite at write time, fast reads. MoR = record changes separately, fast writes, merge at read time |
| Named resources vs LF-Tags | Named = one by one by name. LF-Tags = grouped by tag condition, applied automatically to new resources |
| Data location permission vs SELECT | Location permission = the right to create tables that point to that path. SELECT = the right to read the data |
| LF-Tag vs IAM and resource tags | Separate systems. Not compatible |
| Standard-IA vs Glacier Instant Retrieval | Both read immediately. IA = about once a month, minimum 30 days; GIR = about once a quarter, minimum 90 days, lower storage price |
| Glacier Instant vs Flexible Retrieval | Instant = immediate GET. Flexible = minutes to hours after a restore request |
| Intelligent-Tiering vs lifecycle | IT = moves by access, no retrieval fee, per-object monitoring fee. Lifecycle = moves by age, transition request cost |
| Snapshot vs Incremental blueprint | Snapshot = full reload, schema may change freely. Incremental = only new rows after the bookmark column |

## Week 6 Numbers and Defaults on One Page

| Area | Item | Value |
|------|------|------|
| S3 | Request handling per prefix | At least 3,500 PUT/COPY/POST/DELETE and 5,500 GET/HEAD per second |
| S3 | Objects returned by a single listing | 1,000 |
| Layout | Recommended file size | 128MB to 1GB |
| Layout | Default Parquet row group / ORC stripe size | 128MB / 64MB |
| Glue | Condition for `groupFiles` to turn on automatically | More than 50,000 input files |
| Athena | Partitions written at once by CTAS and INSERT INTO | 100 |
| Athena Iceberg | Default snapshot retention | 432,000 seconds (5 days), minimum 1 kept |
| Glue ETL | Native table format support | Glue 3.0 or later (`--datalake-formats`) |
| S3 classes | Minimum storage duration | IA and One Zone-IA 30 days / Glacier Instant and Flexible 90 days / Deep Archive 180 days |
| S3 classes | Minimum billable size | IA, One Zone-IA, and Glacier Instant 128KB |
| S3 classes | Per-object overhead for archive objects | 40KB (32KB at the Glacier rate, 8KB at the Standard rate) |
| Restore | Flexible Retrieval | Expedited 1 to 5 minutes / Standard 3 to 5 hours / Bulk 5 to 12 hours |
| Restore | Deep Archive | Standard within 12 hours / Bulk within 48 hours |
| Lifecycle | Rules per bucket | 1,000 |
| Lifecycle | Excluded from transition by default | Objects under 128KB |
| Intelligent-Tiering | Automatic tier moves | 30 days without access → Infrequent, 90 days → Archive Instant |
| Intelligent-Tiering | Optional archive tiers | From 90 and 180 days, configurable up to 730 days |

## Integrated Scenario: An Order Data Lake

Requirements: Load an RDS orders database into a data lake, show analysts only the rows of their own region with PII columns hidden, respond to GDPR deletion requests, and optimize cost.

```text
[RDS] --(Lake Formation Incremental database blueprint)--> s3://lake-raw/orders/dt=.../
   --(Glue ETL: validate, MERGE)--> s3://lake-clean/orders/ (Iceberg table)
   --(Glue: aggregate)--> s3://lake-curated/revenue/ (consumed by Athena/QuickSight)
```

| Decision | Choice | Reason | Easy to miss |
|------|------|------|------|
| Ingestion | Incremental database blueprint | An incremental workflow made of crawlers, jobs, and triggers is generated automatically | The bookmark approach sees only new rows. If the source UPDATEs order status, DMS CDC is needed |
| Raw | Date partitions, source format as is | Baseline for reprocessing | Keep it immutable |
| Clean | Iceberg table | `MERGE INTO` upserts, `DELETE`, time travel | Athena DML is Merge-on-Read, so `OPTIMIZE` is mandatory |
| GDPR | `DELETE` → `OPTIMIZE` → `VACUUM` | Data is physically erased only after snapshots expire | The same customer's data is also in the originals in the Raw zone |
| Permissions | Location registration + data filter | Column exclusion and row filter in one filter | Revoke `IAMAllowedPrincipals`, remove direct S3 permissions |
| Storage | Lifecycle transitions for Raw, Standard for Clean and Curated | Difference in access frequency | Do not set transition or expiration rules on the Iceberg prefix |

```sql
-- Handling a GDPR deletion request (Iceberg on Athena)
DELETE FROM lake_clean.orders WHERE customer_id = 'GDPR-REQ-2026-001';
OPTIMIZE lake_clean.orders REWRITE DATA USING BIN_PACK;
VACUUM lake_clean.orders;
```

```bash
# Cell-level filter for analysts: exclude PII columns + only their own region's rows
aws lakeformation create-data-cells-filter --table-data '{
  "TableCatalogId": "111122223333",
  "DatabaseName": "lake_clean",
  "TableName": "orders",
  "Name": "apne2-no-pii",
  "RowFilter": {"FilterExpression": "region = '\''ap-northeast-2'\''"},
  "ColumnWildcard": {"ExcludedColumnNames": ["customer_name", "phone"]}
}'

# Grant SELECT by specifying the filter
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier=arn:aws:iam::111122223333:role/RegionAnalyst \
  --permissions "SELECT" \
  --resource '{"DataCellsFilter": {"TableCatalogId": "111122223333",
               "DatabaseName": "lake_clean", "TableName": "orders", "Name": "apne2-no-pii"}}'
```

> 💡 **Related Theory**: The easy-to-miss spot in this scenario is the Raw zone. Even if you delete a customer's rows from the Iceberg table in Clean, that customer remains in the original files in Raw. Immutability is the principle for Raw, but deletion requests alone need an exception procedure. So designs such as tokenizing PII as it enters Raw, or setting a short retention period for Raw, are considered together.

## Collection of Anti-Patterns

- **Over-partitioning by hour or user**: A file of a few KB is created per partition. Scan volume dropped, but the query is slower.
- **Running `MSCK REPAIR TABLE` every day to add partitions**: It rescans all paths. Use `ALTER TABLE ADD PARTITION` for only the added partitions, or use projection.
- **Granting Lake Formation permissions but leaving the S3 bucket policy as is**: Control remains in two places and leaks through the broader one.
- **Making a copy of the table to hide columns**: Each copy brings ETL, storage cost, and synchronization problems. A data filter does this instead.
- **Creating an Iceberg table and not setting up maintenance**: Delete files and snapshots pile up, making it slower and more expensive.
- **A blanket "IA after 30 days" for every bucket**: Cost actually rises for frequently read Curated data and for prefixes with many small files.
- **Turning on versioning only, with no noncurrent version rule**: Invisible capacity piles up without limit.
- **Transitioning queryable data to Deep Archive**: It drops out of results without an error.

## Scenario → Answer Lookup

| Scenario | Answer |
|------|------|
| Filtering by date but Athena scans the entire table | Date partitioning + a condition on the partition key |
| Tens of thousands of partitions, `GetPartitions` is the bottleneck, only Athena is used | Partition projection |
| Tens of thousands of partitions, Athena and Redshift Spectrum are used together | Keep catalog partitions + Glue partition index |
| Streaming ingestion creates hundreds of thousands of files of a few KB | Increase writer-side buffer + compaction |
| Modify specific rows of a Parquet table in S3 with SQL | Iceberg table + `UPDATE`/`MERGE INTO` |
| Yesterday's batch was loaded wrongly. Query the state before it | Iceberg time travel |
| Deleted data must actually disappear from S3 | Compaction + snapshot expiration |
| Make department-specific permissions scalable across thousands of tables | LF-Tags |
| Make the same table show only different rows per region | Data filter (row filter) |
| Existing Glue jobs stay on IAM, only new analysts get fine-grained permissions | Hybrid access mode |
| Another account queries a table without copying | Lake Formation cross-account sharing + resource link |
| A Clean zone with an unknown access pattern | Intelligent-Tiering |
| Raw older than 90 days should be cheap but readable immediately during reprocessing | Glacier Instant Retrieval |
| Audit logs with a 7-year retention obligation | Lifecycle transition to Deep Archive + expiration |
| The bucket charge is far larger than the sum of the object list | Incomplete multipart and noncurrent version cleanup rules, Storage Lens |

Next week we cover the analytics stores that sit next to the lake, Redshift, Athena, DynamoDB, and RDS/Aurora, along with choosing a store per workload.

## 📖 Glossary

- **Medallion architecture**: A lake composition method that divides data into bronze (raw), silver (refined), and gold (aggregated) stages. The same concept as the raw, clean, and curated zones.
- **Pruning and projection**: Reading only the partitions that match the condition, and computing the partition list by rule. The names look alike, but they solve different problems.
- **Snapshot isolation**: A consistency method in which readers see only the snapshot as of their start, so reads and writes do not block each other.
- **Cell-level security**: Applying a column restriction and a row filter together, so that even the visible columns are controlled per row.
- **Data mesh**: A distributed structure in which per-domain accounts own the data and the catalog and permissions are managed centrally.
- **Waterfall model**: The rule that lifecycle transitions flow only from upper classes to lower classes.
- **Early deletion fee**: A charge for the remaining period when you delete or transition before meeting the minimum storage duration.
- **Tokenization**: A technique that replaces a sensitive value with a meaningless substitute value when storing it. The mapping back to the original is kept in a separate store.

## 📝 Practice Questions

**Question 1.** You want to incrementally load RDS order data into the data lake and configure the clean zone so that row-level deletion (GDPR) and MERGE upserts are possible afterward. Which combination is the most suitable?

A) Lake Formation Database snapshot blueprint + CSV table  
B) Lake Formation Incremental database blueprint + Iceberg table  
C) Manual S3 upload + regular Hive Parquet table  
D) S3 Replication + One Zone-IA  

**Answer: B**  
Explanation: The Incremental database blueprint handles incremental loading, and an open table format such as Iceberg handles row-level DELETE/MERGE. Snapshot + CSV or a regular Hive Parquet table makes row-level DML difficult, and Replication/One Zone-IA is unrelated to the requirements.

---

**Question 2.** You want to hide PII columns from an analyst and expose only the rows for their own region. Which combination of Lake Formation features is correct?

A) Column exclude/select GRANT + row-level data filter  
B) S3 bucket policy + One Zone-IA  
C) Partition projection + lifecycle policy  
D) Storage Lens + Object Lock  

**Answer: A**  
Explanation: Column security is implemented with the column select/exclude options of GRANT, and row security with a data filter (RowFilter). The others are cost, visibility, and storage features unrelated to fine-grained access control.

---

**Question 3.** What is the most appropriate storage strategy for the frequently read curated zone and the rarely read raw zone of a data lake?

A) Both in Glacier Deep Archive  
B) Curated in Standard, raw transitioned IA → Glacier by lifecycle  
C) Curated in One Zone-IA, raw in Standard  
D) Both fixed to Standard-IA  

**Answer: B**  
Explanation: Standard, which has no retrieval cost, is cost-effective for the frequently read curated zone, and transitioning IA → Glacier by lifecycle is cost-effective for the rarely accessed raw zone. Putting frequently read data in IA/Glacier wastes money on retrieval costs, and putting unread data in Standard wastes storage cost.

---

**Question 4.** Which of the following most accurately describes the "schema-on-read" characteristic of a data lake?

A) A strict schema is enforced before data is loaded  
B) The schema can never be changed  
C) Only columnar formats can be stored  
D) Data is stored as is in its original form, and the schema is applied at query time  

**Answer: D**  
Explanation: Schema-on-read stores data in its original form and assigns the schema when reading, flexibly accommodating structured, semi-structured, and unstructured data. Enforcing a schema before loading is schema-on-write (data warehouse), and the other options are not factual.

---

**Question 5.** The partitions of a data lake table have grown to tens of thousands, and Glue Data Catalog lookups have become a bottleneck for Athena queries. How can you solve this without registering each partition in the catalog?

A) Enable partition projection  
B) Merge all partitions into a single file  
C) Convert the table to CSV  
D) Enable bucket versioning  

**Answer: A**  
Explanation: Partition projection computes partitions from the range and format rules in the table properties, eliminating the catalog registration and lookup bottleneck. Merging into a single file harms pruning, and CSV conversion and versioning are unrelated to the partition bottleneck.

---
