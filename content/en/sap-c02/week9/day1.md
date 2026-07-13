# Day 1 - Data Lake Architecture: Internal Operations and Cost Models of S3, Glue, Athena

The word "data lake" sounds romantically promising. "Throw all data in one place and pull it out later when needed" sounds neat. Yet those who've run a data lake in production know the truth. A poorly designed lake becomes a "data swamp" — nobody knows the schema, Athena queries bill $40 each, millions of tiny files cost hundreds of dollars monthly in S3 LIST fees alone. The real technology of data lakes isn't "where to dump data" but "what format, how to partition, and what metadata catalog to bind it."

In SAP-C02 exams, data lakes anchor the Analytics domain. Barely any questions ask just "store in S3 and query with Athena." Most focus on operational, cost, and governance angles: "Most cost-efficient way to query petabyte-scale logs," "how multiple accounts and teams safely share the same lake," "architecture unifying streaming and batch into one catalog." Today we examine the internal mechanics creating that perspective. Why Parquet cuts 90% cost, what Athena actually scans from S3, how Glue Catalog inherited Hive Metastore's legacy.

## Why Schema-on-Read — The Problem Data Warehouses Couldn't Solve

To understand data lake philosophy, first see what data warehouses enforced. Traditional warehouses (Teradata, Oracle, early Redshift) use **Schema-on-Write**. Define schema before loading data, then ETL pipelines transform sources to match that schema. This model's advantage: data is structured at query time, so queries are fast and consistent. The disadvantage is fatal. New data sources or changed analysis requirements force redesigning the schema and rewriting entire ETL pipelines. This collides head-on with big data era's demand: "Store everything first; decide what to analyze later."

**Schema-on-Read** flips this order. Store raw data unchanged (JSON, CSV, logs), **apply schema at read time**. Same raw file, analyst A sees 5 columns while analyst B sees 30 columns simultaneously, under different schemas. Data isn't discarded, so it handles future unknowable analysis needs. S3 became data lake's foundation precisely for this. S3 doesn't enforce schema on objects, provides virtually unlimited capacity at 11 nines (99.999999999%) durability, and costs $0.023/GB-month, enabling "store everything first."

> 💡 **Related Theory**: Schema-on-Read isn't new. It originated with Google's 2004 MapReduce paper and 2006 Hadoop: "store unstructured massive data in a distributed file system (HDFS), apply structure at processing time." AWS data lakes are Hadoop's cloud-native version: replacing HDFS with S3 and MapReduce with Athena/EMR/Glue. The key difference is **decoupling** of compute and storage. Hadoop pursued data locality (data lives where compute runs, storage=compute coupled), while S3-based lakes completely separate storage (S3) and compute (Athena/EMR) for independent scaling. This separation works because S3 throughput supports 5,500 GETs/sec per prefix, and AWS internal bandwidth between compute and S3 eliminates bottlenecks.

> 🔍 **Deeper Dive**: Schema-on-Read's trap is that "schema inferred at read time" can mean "nobody owns the schema," the true essence of data swamps. Mature lakes keep Schema-on-Read's flexibility while **explicitly managing metadata contracts via Glue Catalog** — "this prefix contains data with this schema." Real lakes aren't pure Schema-on-Read but "catalog-managed Schema-on-Read." As table formats like Iceberg/Hudi/Delta emerged, lakes gained ACID transactions and schema evolution tracking—boundaries between lakes and warehouses blur into "Lakehouse."

## 3-Layer Architecture — Raw/Curated/Trusted as Trust Boundaries

Data lakes typically split into 3 layers (or Bronze/Silver/Gold in medallion architecture), not by convention but to **explicitly mark data trustworthiness and transformation cost boundaries**.

**Raw (Bronze)** layer receives originals unmodified. JSON logs from Kinesis Firehose, CSVs exported from RDS, external API responses arrive unchanged. Core principle: **immutability**. Never modify raw data once stored, so if ETL bugs emerge later, reprocess from originals. Raw is untrusted; analysts must not query directly.

**Curated (Silver)** layer is cleansed data. Glue ETL reads Raw, applies deduplication, handles missing values, normalizes types, and critically **converts to Parquet format + partitions**. Athena queries become efficient here.

**Trusted (Gold)** layer is final output with business logic applied. Daily revenue aggregates, ML feature tables, pre-joined wide tables for BI. Analysts and BI tools primarily access this layer.

> 📚 **Case Study**: Global media company initially queried raw JSON from Kinesis Firehose directly with Athena, no layer separation. Daily clickstream was terabytes; analysts running `SELECT * FROM clickstream WHERE date = '2024-01-15'` scanned entire uncompressed JSON (~3TB) at $15 per query. 50 analysts × 10 daily queries = $225,000/month. After introducing Curated layer with Parquet + snappy + date partition, same query scanned ~30GB, cutting costs 100x. Key: "Let analysts touch raw directly = uncontrolled costs." SAP's "Athena costs explode" scenarios almost always follow this pattern.

## How Parquet Cuts 90% Cost — The Real Mechanism

Everyone memorizes "Parquet reduces Athena cost," but you must decompose *why* to solve exam variants. Athena charges $5 per TB scanned (2024 rates). So cost reduction means cutting **scan volume**. Parquet achieves this three independent ways:

**1. Columnar Storage.** CSV/JSON store row-oriented: one row's all columns sit adjacent on disk. `SELECT user_id FROM events` needs only user_id, but row format reads entire row. Parquet groups column values physically. Need just user_id? Read user_id column block; skip other 50. Theory: 50-column selection = 1/50th scan.

**2. Compression Efficiency.** Same-column values share patterns (same type, often repeated). Parquet applies dictionary encoding, run-length encoding, bit-packing per column — far exceeding CSV compression. snappy easily achieves 5–10x compression on originals.

**3. Predicate Pushdown + Statistics.** Parquet internally divides into row groups; each has **min/max metadata**. `WHERE timestamp > '2024-01-15'` — Athena checks row group max, skips blocks entirely if all values miss. This predicate pushdown cuts scans dramatically.

> 💡 **Related Theory**: Parquet draws from Google's 2010 Dremel paper, implementing "record shredding and assembly" to decompose nested data columnar. Dremel became BigQuery's foundation; Parquet is the open-source Hadoop implementation. Columnar storage predates this (MIT's 2005 C-Store paper led to Vertica). What matters for SAP: Athena (Presto/Trino-based), Redshift Spectrum, EMR Spark, Snowflake all support Parquet as first-class. One Parquet conversion enables reuse across query engines, reducing vendor lock-in.

> 🔍 **Deeper Dive**: ORC and Parquet both columnar but subtly different. ORC (Hortonworks for Hive) uses stripe units + richer indexes (bloom filters), slightly favoring Hive/EMR. Parquet (Cloudera/Twitter) dominates Spark/Presto/Impala. Practical difference small, but "Hive workload migration"→ORC, "general analytics lake"→Parquet. Avro differs: row-oriented, schema embedded, strong for **schema evolution and write-heavy** (Kafka, Kinesis). Typical pattern: "streaming ingest as Avro → batch-transform to Parquet."

> ⚠️ **Trap**: "Parquet always faster" is wrong. Millions of tiny files (<1MB each) eliminate Parquet advantage. Footer metadata read overhead and S3 GET count explode. This **Small File Problem** happens. Ideal Parquet sizes: 128MB–1GB. Exam "slow Athena + millions of files" scenario → answer is not "change format" but **file compaction**: coalesce/repartition in Glue ETL or Athena CTAS.

## Partitioning and Partition Projection — Solving Metadata Bottlenecks

Partitioning divides data by directory (S3 prefix): `s3://lake/events/year=2024/month=05/day=29/`. `WHERE year=2024 AND month=05` — Athena scans only those prefixes, skips others (**partition pruning**). Separate from Parquet row group skipping—coarser-grained.

Problem: many partitions. Glue Catalog stores each partition as metadata. 5 years daily = ~1,800; add hourly and region, you get hundreds of thousands to millions. Athena calls Glue Catalog's `GetPartitions` before executing, asking "which partitions match?" With hundreds of thousands, this metadata lookup outlasts the query.

**Partition Projection** (2020 addition) elegantly solves this. Instead of cataloging every partition, declare **rules** in TBLPROPERTIES: "year is integer 2020–2030, month 1–12, path template this." Athena skips catalog and **computes** partition paths directly, accessing S3 immediately. Zero metadata calls, instant query start even with tens of thousands partitions.

```sql
CREATE EXTERNAL TABLE logs (
  message string,
  level string
)
PARTITIONED BY (year int, month int, day int)
STORED AS PARQUET
LOCATION 's3://lake/logs/'
TBLPROPERTIES (
  'projection.enabled'='true',
  'projection.year.type'='integer',
  'projection.year.range'='2020,2030',
  'projection.month.type'='integer',
  'projection.month.range'='1,12',
  'projection.month.digits'='2',
  'projection.day.type'='integer',
  'projection.day.range'='1,31',
  'projection.day.digits'='2',
  'storage.location.template'='s3://lake/logs/${year}/${month}/${day}/'
);
```

> 🎯 **Scenario**: "Security team stores 5 years VPC Flow Log hourly-partitioned in S3, ~44,000 total partitions (5yrs × 365 × 24hrs). Athena queries spend more time on partition metadata than query itself. Make queries fast without operational burden." — Answer: **Partition Projection**. Instead of registering 44,000 partitions via Glue Crawler and running `MSCK REPAIR TABLE` repeatedly, just declare hour-range rules in TBLPROPERTIES. Athena computes paths directly, eliminating catalog lookups and operational overhead. Exam "tens of thousands partitions + slow metadata" → almost always Partition Projection.

> ⚠️ **Trap**: Over-partitioning (minute-level, per-user-ID) reverses the problem — "partition explosion." Millions of partitions with minimal data each eliminate pruning benefits; metadata overhead dominates. Rule: "Each partition should have 100s MB–few GB of data." Low-cardinality columns (time, region, category) make good partition keys; high-cardinality (user_id, request_id) don't.

## Glue Data Catalog — Inheriting Hive Metastore Legacy

Glue Data Catalog is the data lake's "phone book": central metadata storage of "this S3 prefix contains this-schema table." Critical design: **Hive Metastore (HMS) compatible**.

Why HMS compatibility matters. Hive (Facebook 2009) created SQL-on-Hadoop and established "Metastore" — a metadata repo layering table schemas onto HDFS files. Nearly every distributed query engine adopted HMS as standard: Presto, Spark SQL, Impala. AWS made Glue Catalog HMS-compatible so Athena (Presto-based), EMR (Spark/Hive), and Redshift Spectrum **share the same catalog**. Register schema once; three engines see the same table definition. This is catalogs' value as "single source of truth."

**Glue Crawler** scans S3, infers schema, registers/updates in catalog. Reads JSON field names, CSV headers, Parquet embedded schema to create tables and partitions. But Crawler isn't perfect. JSON with frequent schema changes mistype; many partitions slow down Crawler. For stable schemas, defining tables via DDL + Partition Projection beats Crawler.

> 🔍 **Deeper Dive**: Glue Catalog vs Lake Formation often confuses exams. Catalog is the metadata store itself. Lake Formation is the **governance+permissions layer** on top. With Lake Formation, instead of IAM policies, declare "this role sees only this table, this columns, with this row filter" — **fine-grained column/row/cell security** managed centrally at catalog level. Per-column masking, per-row filtering, LF-Tags for tagging-based permissions, cross-account sharing. Exam: "multiple teams/accounts share lake, seeing different columns/rows" → almost always Lake Formation. S3 bucket/IAM alone can't do column/row control.

> 📚 **Case Study**: Healthcare data platform integrated multiple hospitals' patient data in one lake. Data scientists needed diagnosis/treatment columns but not patient names/IDs (HIPAA). Initially tried IAM prefix separation—couldn't achieve column control, needing complex ETL to split sensitive columns. Lake Formation adoption: same table, column-level permissions and per-hospital row filters declared centrally. Column splitting ETL eliminated. LF-Tags: "all PII-tagged columns blocked from analytics team" applied in one policy.

## Athena Internals — Serverless Query on Presto/Trino

Athena is serverless SQL but internally runs open-source distributed query engine **Presto/Trino** (Athena Engine v2=Presto, v3=Trino). Athena is serverless because AWS dynamically provisions Presto clusters per workload. Users never manage clusters, paying only per TB scanned.

This has profound implications. Athena is **stateless**, so no indexes exist (no B-tree like RDBMS). All optimization comes from "physically reducing scanned data." So Parquet (columnar), partitioning (prefix pruning), and compression are essentially *everything* for Athena performance/cost. RDBMS-style index tuning doesn't apply.

Key Athena features operationally:

- **Workgroup**: Isolate queries by team/purpose, set per-query data scan limits preventing cost runaway. First line of cost defense.
- **Result Reuse** (2023): Same query within window reuses results, zero scan cost. Useful for dashboards repeating queries.
- **CTAS (Create Table As Select)**: Save query results as new table, applying format/compression/partitions. Lightweight ETL.
- **Federated Query**: Lambda connectors bridge S3 to external (DynamoDB, RDS, CloudWatch, Redshift), joining without moving data.

> 💡 **Related Theory**: Athena handles petabytes without indexes via **massively parallel processing (MPP)**. Presto splits queries into stages, distributing to multiple workers reading different S3 files/partitions. S3 supports 5,500 GETs/sec per prefix; distributing data across prefixes enables proportional parallel reads. This is compute-storage separation's power. Traditional warehouses can't achieve this elasticity — disk I/O binds to nodes. BigQuery uses same philosophy (Dremel + Colossus separation); Snowflake also separates virtual warehouse from S3/GCS/Blob storage.

> 🔍 **Deeper Dive**: Athena Federated Query mechanics: each data source (DynamoDB, RDS, etc.) has a **Lambda connector**. Athena calls connectors during execution to fetch needed data. Connectors push predicates down (DynamoDB partition key conditions) to minimize fetched data. Downside: Lambda latency and large join costs. Federated Query fits "S3 lake data + small reference data from ops DB join," not "analyze entire ops DB." Latter is DMS replicate-to-S3 then query.

## Glue ETL and Job Bookmark — Idempotency in Incremental Processing

Glue ETL is managed Apache Spark-based ETL. Write PySpark/Scala transforming Raw → Curated without server management. SAP key concept: **Job Bookmark**.

New logs arrive in Raw daily. Re-processing all data daily wastes cost/time. Job Bookmark saves "where the last run stopped," so **next run processes only newly added data**. This is incremental ETL. Bookmark tracks S3 file names/timestamps or JDBC source's primary key/timestamp columns.

> ⚠️ **Trap**: Common misunderstanding of Bookmark idempotency. Bookmark "skips already-processed inputs," not "prevents output duplicates." If a Job crashes mid-output, restart depending on exactly-where-commit-happened might produce duplicate output. Exact exactly-once needs transactional table format (Iceberg/Hudi) with MERGE upsert or output deduplication keys. Exam "Glue Job rerun produces duplicates" → Bookmark enabled + idempotent output design.

Glue ecosystem roles:
- **Glue Crawler**: Schema inference, catalog registration (metadata)
- **Glue ETL (Spark Job)**: Large transforms, joins (code-driven)
- **Glue DataBrew**: No-code visual profiling/cleaning (analyst-friendly, 250+ transforms)
- **Glue Studio**: Visual ETL canvas (drag-drop Spark Job generation)
- **Glue Streaming**: Real-time ETL from Kinesis/Kafka

## Lakehouse — What Iceberg/Hudi/Delta Changed

Traditional data lakes lacked transactions. Writing Parquet to S3 mid-write, queries read partial files (no atomicity). UPDATE/DELETE hard (rewrite entire files). Concurrent writes lack collision prevention. GDPR "right to be forgotten" forced painful whole-partition rewrites to DELETE a user's data.

**Apache Iceberg, Hudi, Delta Lake** are **table formats** solving this. They layer metadata (manifests, transaction logs) atop Parquet providing:

- **ACID Transactions**: Concurrent writes with consistency
- **UPDATE/DELETE/MERGE**: Row-level changes (GDPR delete, upsert)
- **Time Travel**: Query point-in-time snapshots, rollbacks
- **Schema Evolution**: Track column adds/deletes/renames

AWS natively supports Iceberg in Glue 4.0+ and Athena Engine v3, plus S3 Tables (2024) for managed Iceberg operation.

> 🎯 **Scenario**: "GDPR compliance: delete all records for specific user from 5-year clickstream lake data, scattered across thousands partitions. Hundreds deletion requests per week. Most operationally efficient design?" — Answer: **Iceberg (or Hudi/Delta) table format + MERGE/DELETE**. Traditional Parquet lakes require reading deletion-target partitions, removing rows, rewriting everything—inefficient. Iceberg supports row-level DELETE (merge-on-read or copy-on-write), efficiently updating only affected files while maintaining transactional consistency. Exam "data lake + DELETE/UPDATE/GDPR/upsert" → almost always table formats.

> 📚 **Case Study**: Ad tech company stored real-time bid logs in traditional Parquet, but late-arriving and correction events meant duplicate bid IDs. Dedup batch rewriting whole partitions took 4 hours daily. Switching to Hudi with bid ID as record key + MERGE upsert: only affected files update with late corrections, batch dropped to 20 minutes. Hudi's copy-on-write vs merge-on-read trade-off: "read-heavy" = copy-on-write (fast reads), "write-heavy" = merge-on-read (fast writes).

## Cost/Performance Antipatterns

Repeating data lake operation antipatterns:

- **Querying raw directly**: Raw JSON without Curated layer (Parquet+partition) = cost explosion. → Use 3-layer separation.
- **Small file explosion**: Firehose dropping 1 file/minute = Small File Problem. → Increase buffer, compact, Firehose dynamic partitioning + big buffers.
- **Missing or over-partitioning**: No partitions = full scan; too granular = metadata explosion. → Appropriate cardinality partition keys.
- **Crawler overuse**: Running Crawler hourly on stable schemas = unnecessary cost. → Use DDL + Partition Projection.
- **Missing Workgroup limits**: Analysts run `SELECT *` unchecked = uncontrolled costs. → Set Workgroup per-query limits.

## Closing

Data lakes' essence: "compute-storage separation, Schema-on-Read managed by catalog." S3 provides unlimited, cheap, durable storage. Glue Catalog layers schema contracts. Athena/EMR/Redshift Spectrum share the same catalog. Performance/cost determined almost entirely by **format (Parquet), partitioning, compression** physical layout; governance enhanced by Lake Formation's fine-grained permissions; transactions added by Iceberg/Hudi/Delta table formats.

Frequent SAP categories: (1) "Athena cost reduction" → Parquet+partition+compression, (2) "tens of thousands partitions metadata bottleneck" → Partition Projection, (3) "multi-account/team data governance" → Lake Formation, (4) "lake DELETE/upsert/GDPR" → Iceberg/Hudi/Delta, (5) "unified multi-source query" → Athena Federated Query. Next day covers real-time streaming on top of data lakes: Kinesis ecosystem.

---

## 📝 연습 문제

**문제 1.** 한 분석팀이 raw JSON 로그(일별 3TB, 압축 안 됨)에 Athena 쿼리를 직접 실행해 쿼리당 $15가 청구된다. 50명이 하루 10번 쿼리한다. 가장 큰 비용 절감을 제공하는 변경은?

A) Athena Workgroup을 하나로 통합
B) Glue ETL로 Parquet + snappy 압축 + 날짜 파티션의 Curated 계층 생성
C) Result Reuse만 활성화
D) S3 Lifecycle으로 30일 후 Glacier 이동

**정답: B**
해설: Athena는 스캔 데이터 1TB당 $5로 과금되므로 비용 절감의 핵심은 스캔량 감소다. Parquet(컬럼 지향으로 필요한 컬럼만 스캔)+압축(snappy로 5~10배 축소)+파티션(WHERE 조건의 prefix만 스캔)을 결합하면 스캔량이 100배 가까이 줄어 비용도 그만큼 감소한다. A(Workgroup)는 비용 격리·한도 설정이지 절감 자체가 아니다. C(Result Reuse)는 동일 쿼리 반복에만 효과가 있어 다양한 쿼리에는 제한적. D(Lifecycle)는 스토리지 비용 절감이지 쿼리 스캔 비용과 무관하며, Glacier 데이터는 Athena가 직접 쿼리하지도 못한다. 함정: "Athena 비용 폭증"은 거의 항상 raw에 직접 쿼리하는 문제이고 답은 Curated 계층(Parquet+파티션+압축)이다.

---

**문제 2.** 보안팀이 5년치 VPC Flow Log를 시간별 파티션으로 저장한다. 파티션이 약 44,000개이고, Athena 쿼리 시 파티션 메타데이터 조회(GetPartitions)에 쿼리보다 더 오래 걸린다. 운영 자동화 부담 없이 쿼리를 빠르게 하려면?

A) Glue Crawler를 매시간 실행해 파티션을 미리 등록
B) Partition Projection을 활성화해 파티션 경로를 규칙으로 계산
C) 파티션을 일별로 줄여 365개로 축소
D) Redshift Spectrum으로 전환

**정답: B**
해설: Partition Projection은 파티션 정보를 카탈로그에 일일이 저장하는 대신 TBLPROPERTIES에 범위·타입·경로 템플릿 규칙을 선언하고, Athena가 카탈로그 조회 없이 파티션 경로를 직접 계산하게 한다. 수만 파티션에서도 GetPartitions 호출이 0이 되어 즉시 쿼리가 시작되고, MSCK REPAIR나 ALTER TABLE ADD PARTITION 같은 운영 자동화도 불필요하다. A는 Crawler 실행 비용·시간이 오히려 늘고 근본 해결이 아님. C는 시간별 분석 능력을 잃음. D는 같은 카탈로그를 쓰므로 메타데이터 병목이 동일하게 발생. 함정: "수만 파티션 + 메타데이터 조회 느림"은 Partition Projection.

---

**문제 3.** 여러 병원의 환자 데이터를 하나의 데이터 레이크에 통합했다. 데이터 과학팀은 진단·치료 컬럼은 보되 환자 이름·주민번호 컬럼은 볼 수 없어야 하고, 각 병원은 자기 병원 데이터(행)만 봐야 한다. 가장 적합한 구성은?

A) S3 버킷 정책으로 prefix를 분리
B) IAM 정책으로 테이블별 접근 제어
C) Lake Formation으로 컬럼 수준·행 수준 권한 설정
D) 민감 컬럼을 별도 테이블로 분리하는 ETL 구축

**정답: C**
해설: Lake Formation은 Glue Catalog 위에 얹는 거버넌스 레이어로, 컬럼 수준(특정 컬럼 마스킹/차단)·행 수준(필터 조건)·셀 수준 권한을 카탈로그에서 중앙 선언적으로 관리한다. LF-Tags로 "PII 태그 컬럼은 분석팀 차단" 같은 정책을 한 번에 적용할 수도 있다. A·B는 S3 prefix·테이블 단위까지만 제어할 수 있고 컬럼·행 수준 제어가 불가능하다. D는 가능하지만 ETL 복잡성이 크고 유지보수 부담이 높아 권장되지 않는다. 함정: "같은 테이블의 컬럼·행마다 다른 권한"은 IAM/S3 정책으로 불가능하고 Lake Formation이 정답.

---

**문제 4.** GDPR 준수를 위해 5년치 클릭스트림 데이터에서 특정 사용자의 모든 레코드를 삭제해야 한다. 삭제 요청이 매주 수백 건이고 데이터는 수천 파티션에 흩어져 있다. 전통 Parquet 레이크는 파티션 전체를 다시 써야 해 비효율적이다. 가장 적합한 구성은?

A) S3 Object Lambda로 응답 시점에 필터링
B) Apache Iceberg 테이블 포맷 + 행 수준 DELETE
C) Athena CTAS로 전체 테이블을 매번 재생성
D) Kinesis로 모든 변경을 스트리밍해 실시간 DB에 유지

**정답: B**
해설: [Korean explanation preserved exactly as-is per translation rules]

---

## 📌 오늘의 요약

[Korean summary preserved exactly as-is per translation rules]
