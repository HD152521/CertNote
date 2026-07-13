# Day 3 - CDC and Data Replication: Database Migration Service (DMS)

The need to move data from running databases to data warehouses or data lakes arrives endlessly. But you can't stop the operational database. Nightly full dumps scale explosively as data grows, and changes during the dump get missed. And "last night's snapshot" is useless for real-time analysis.

**CDC (Change Data Capture)** solves this. CDC says "don't re-read everything, capture only what *changed* since last time." In AWS, **AWS Database Migration Service (DMS)** handles this. Despite the name "Migration," it performs both one-time migration and ongoing replication via CDC.

## DMS: Three Components

DMS works as a combination of three parts. Understanding this decomposition solves half the exam questions.

```
[Source Endpoint] → [Replication Instance] → [Target Endpoint]
   (e.g., RDS MySQL)   (executes migration)   (e.g., S3 / Redshift)
                            │
                       [Migration Task]
                   (Full Load / CDC / Full+CDC)
```

| Component | Role |
|-----------|------|
| Source Endpoint | Connection info to source data |
| Target Endpoint | Connection info to target |
| Replication Instance | Computing (EC2-based) performing actual migration |
| Migration Task | Defines which tables, which mode |

DMS's strength is **heterogeneous replication**. Oracle → PostgreSQL, SQL Server → S3 across different engines. But DMS doesn't handle schema/code (stored procedures) conversion — that's **AWS SCT (Schema Conversion Tool)** or DMS Schema Conversion. "Data = DMS, schema/code = SCT" is the split.

> 💡 **Related theory**: CDC is a classic data integration pattern. The alternative "snapshot diff" compares full data at two points to find changes, but cost explodes with size. CDC leverages transaction logs the DB already writes, extracting only changes with low source impact. "Don't ask data again; read the traces data already left" is CDC's philosophy.

## Three Migration Modes

A Migration Task operates in one of three modes.

| Mode | Operation | Use Case |
|------|-----------|----------|
| Full Load | Copy all existing data once | One-time migration |
| CDC only | Replicate changes from start point onward | Initial load already complete |
| Full Load + CDC | Copy all, then ongoing replication | Zero-downtime migration standard |

**Full Load + CDC** is most important. Process: (1) Full Load copies all existing data. (2) Changes occurring during Full Load are cached by DMS. (3) When Full Load finishes, cached changes are applied, then switch to real-time CDC. This moves data consistently without stopping the operational DB.

```json
// Migration Task config (conceptual excerpt)
{
  "MigrationType": "full-load-and-cdc",
  "TableMappings": {
    "rules": [{
      "rule-type": "selection",
      "object-locator": { "schema-name": "sales", "table-name": "orders" },
      "rule-action": "include"
    }]
  }
}
```

> ⚠️ **Pitfall**: For CDC to work, **source DB's change log access must be enabled**. MySQL needs binary log (binlog) in ROW format, PostgreSQL needs logical replication (`wal_level=logical`), Oracle needs supplemental logging. Skipping this prerequisite causes Full Load to succeed but CDC to fail — a textbook exam trap.

## How CDC Captures Changes: Transaction Logs

CDC's core: reading **transaction logs** that DBs already write for durability. All relational DBs write changes to log before commit (Write-Ahead Logging). DMS follows this log and extracts INSERT/UPDATE/DELETE.

| Source DB | CDC Reads | Required Setting |
|-----------|-----------|------------------|
| MySQL / MariaDB | Binary Log (binlog) | `binlog_format=ROW` |
| PostgreSQL | Write-Ahead Log (WAL) | `wal_level=logical` |
| Oracle | Redo/Archive Log | Supplemental Logging |
| SQL Server | Transaction Log | MS-CDC or MS-Replication |

Big advantage: no triggers on source tables, no extra queries. Just reading existing logs means minimal impact to source workload (low-impact).

> 🔍 **Going deeper**: Each change record extracted by CDC carries metadata indicating operation type. DMS can mark this as an `Op` column on S3 (`I`=insert, `U`=update, `D`=delete) with settings like `includeOpForFullLoad`. Downstream uses this `Op` to implement merge/upsert logic in data lakes. CDC transmits "flow of change," not "current state" — that's the core insight.

## DMS Serverless and Validation

Traditional DMS required choosing Replication Instance size manually. Too small and CDC lags; too large and waste. **DMS Serverless** auto-scales capacity (DCU, DMS Capacity Unit) by workload, eliminating sizing worries.

DMS also offers **data validation** — comparing source and target rows to confirm accuracy. Even if migration "completes," data might not match perfectly, so validation auto-finds mismatches.

```
Key CloudWatch metrics when operating DMS:
- CDCLatencySource : Delay reading changes from source log
- CDCLatencyTarget : Delay applying changes to target
- FullLoadThroughputRowsTarget : Full Load ingestion rate
```

Rising `CDCLatencyTarget` means target writes bottleneck (e.g., Redshift commit overhead). Rising `CDCLatencySource` means source log read speed is the issue.

> 🎯 **Scenario**: Migrate on-premises Oracle DB to Aurora PostgreSQL zero-downtime. Process: (1) SCT converts schema/stored procedures to PostgreSQL → (2) Enable supplemental logging on Oracle → (3) Start DMS Full Load + CDC → (4) After Full Load, real-time CDC keeps both DBs in sync → (5) Data validation confirms integrity → (6) Cutover application to PostgreSQL, stop CDC. SCT and DMS role split is critical.

## CDC to Data Lake/Warehouse: Patterns

Common patterns when DMS targets analytics systems.

```
Pattern 1: Operational DB → DMS(CDC) → S3 → (Glue/Spark) → Data Lake
  - Load changes as Parquet to S3, merge via Op column
  - Use Apache Hudi / Iceberg for upsertable lake tables

Pattern 2: Operational DB → DMS(CDC) → Kinesis Data Streams → Flink/Firehose
  - Stream changes as events; multiple consumers ingest

Pattern 3: Operational DB → DMS(Full+CDC) → Amazon Redshift
  - Keep analytics warehouse near-real-time in sync with operational DB
```

DMS can target S3, Kinesis Data Streams, Redshift, OpenSearch, DynamoDB — all analytics-friendly. "Reflect operational DB changes to data lake near-real-time" is a DEA exam core scenario.

> 💡 **Related theory**: Streaming CDC patterns connect to "turning the database inside-out" (Jay Kreps, Kafka founder). Current table state is merely the materialized view of all changes accumulated. CDC exposes this change log externally, letting multiple downstreams (lake, search, cache) each reconstruct independently.

## Summary: Move Without Stopping

CDC's essence: "follow changes, don't re-read everything." DMS provides this in managed heterogeneous environments. Full Load + CDC is zero-downtime standard; enabling CDC requires source transaction log config. SCT handles schema/code; DMS handles data. This division, mode choice, and log setup are exam critical. Tomorrow we move to synthesis — Lambda Architecture and event-driven ingestion patterns — tying collections into big pictures.

---

## 📝 Practice Problems

**Problem 1.** Migrate running RDS MySQL to analysis-grade S3 data lake zero-downtime, continuing to reflect changes afterward. Most appropriate DMS migration mode?

A) Full Load only  
B) CDC only  
C) Full Load + CDC  
D) Schema Conversion only  

**Answer: C**  
Explanation: Zero-downtime standard is Full Load + CDC. Full Load copies all existing data, applies changes that happened meanwhile, then real-time CDC keeps syncing. Full Load only misses post-migration changes; CDC only lacks initial data.

---

**Problem 2.** DMS CDC configured for PostgreSQL source: Full Load succeeds but changes don't replicate. Most likely cause?

A) Source PostgreSQL `wal_level` not set to logical  
B) Replication Instance too large  
C) Target Endpoint is S3  
D) Migration Task name has uppercase letters  

**Answer: A**  
Explanation: PostgreSQL CDC requires `wal_level=logical`. Without it, Full Load works but CDC can't read logs. MySQL needs ROW binlog, Oracle needs supplemental logging — same role. Missing log setup is the classic pitfall.

---

**Problem 3.** When migrating Oracle to Aurora PostgreSQL, which tool converts stored procedures and schema to PostgreSQL compatibility?

A) DMS Migration Task  
B) Amazon Athena  
C) AWS Glue Crawler  
D) AWS SCT (Schema Conversion Tool) / DMS Schema Conversion  

**Answer: D**  
Explanation: DMS handles data; schema/code conversion is SCT's job. In heterogeneous migration, "data=DMS, schema/code=SCT." Glue Crawler is for catalogs, Athena for queries.

---

**Problem 4.** DMS CDC task: `CDCLatencyTarget` keeps increasing but `CDCLatencySource` is normal. What does this mean?

A) Source DB log read is slow  
B) Applying changes to target is the bottleneck  
C) Replication Instance terminated  
D) Data validation failed  

**Answer: B**  
Explanation: `CDCLatencyTarget` = delay applying to target, `CDCLatencySource` = delay reading source log. Target-only increase means target write bottleneck (e.g., Redshift commit, indexes). Improve target throughput.

---

**Problem 5.** Operational DB changes should be consumed by multiple downstreams (data lake, real-time dashboard, search index). Best target for DMS CDC output to enable this fan-out?

A) Kinesis Data Streams (multiple consumers subscribe)  
B) Single RDS instance  
C) Local file system  
D) Single EBS volume  

**Answer: A**  
Explanation: CDC changes to Kinesis let multiple consumers (Flink, Firehose→S3, OpenSearch) independently subscribe and reconstruct. This "expose DB as event stream" fan-out pattern is standard. Single instances/volumes don't support multi-consumption.

---
