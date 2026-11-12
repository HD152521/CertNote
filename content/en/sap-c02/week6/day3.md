# Day 3 - AWS DMS + SCT: The Science of Database Migration

Database migration is far more complex than server migration. Servers share a common language in the OS and the file system, but DB engines each have their own SQL dialect, data types, built-in functions, and procedural language. Oracle's PL/SQL, SQL Server's T-SQL, and PostgreSQL's PL/pgSQL may look similar in syntax, but in reality they contain dozens of incompatible functions and data types.

AWS DMS (Database Migration Service) manages this complexity. It keeps the source DB in operation while following its changes in real time with CDC (Change Data Capture), and SCT (Schema Conversion Tool) supports automatic conversion of schema and code between heterogeneous engines. Today we go deep into the internals of DMS and SCT, the DB-specific implementations of CDC, the innovative approach of Babelfish, and real large-scale migration patterns.

## CDC's Internal Mechanism: DB-Specific Implementation

CDC (Change Data Capture) is a technique that captures a database's changes (INSERT, UPDATE, DELETE) in real time. DMS implements CDC by reading the internal log of each DB engine.

| DB engine | CDC source | Configuration requirements |
|-----------|-----------|----------------------------|
| **Oracle** | Redo Log (LogMiner) | ARCHIVELOG mode, supplemental logging enabled |
| **SQL Server** | Transaction Log (CDC feature) | SQL Server CDC feature enabled |
| **MySQL** | Binary Log (binlog) | binlog_format=ROW, FULL |
| **PostgreSQL** | WAL (Write-Ahead Log) | wal_level=logical, replication slot |
| **Aurora MySQL** | Binary Log | binlog enabled |
| **Aurora PostgreSQL** | WAL | logical replication enabled |

Write-Ahead Logging (WAL) is the basic mechanism of database durability (the D of ACID). A log record is written before the actual data page is changed, which makes recovery possible after a system failure (implemented in PostgreSQL in 1992 as an alternative to Jim Gray's Shadow Paging). DMS reuses this WAL not for "normal recovery" but for "consuming the change stream." This is called Logical Decoding (PostgreSQL pg_logical_emit_message).

The principle of Oracle LogMiner. LogMiner is an Oracle built-in package that reconstructs DML operations as SQL from Oracle's Redo Log files (DBMS_LOGMNR). DMS uses the LogMiner API to read change data from the Redo Log. Supplemental Logging must be enabled for the previous values of DELETEd rows to be included in the log. Without it, DMS cannot know which rows were deleted.

## DMS Architecture: The Role of the Replication Instance

DMS is a 3-tier structure: Source → Replication Instance → Target.

```
Source DB                    Target DB
(Oracle On-Prem)             (Aurora PostgreSQL)
      │                           ▲
      │ CDC (Redo Log)            │
      ▼                           │
Replication Instance (EC2)        │
  ├── Full Load Worker            │
  ├── CDC Worker                  │
  └── Apply transformation rules ─┘
```

**Replication Instance**: EC2-based. The CPU and memory for conversion work run on this instance. Choosing the size matters.
- Small scale (< 1TB): dms.t3.medium
- Medium scale (1-5TB): dms.c5.large
- Large scale (5TB+): dms.r5.2xlarge (memory-intensive)

**DMS Serverless (2023)**: AWS automatically manages and scales the Replication Instance. Billed in Capacity Units (DCU). It scales out automatically at peak load and scales in automatically when idle.

> ⚠️ **Pitfall**: The Replication Instance must connect to the Source and Target DBs at the same time. If the on-premises Oracle is behind a firewall, a connection through Direct Connect or VPN is needed. The standard is to place the Replication Instance in the same VPC and configure private connectivity.

## Full Load + CDC: The Mathematics of Zero-Downtime Migration

```
Timeline:
T=0     Full Load starts (copy the entire source)
T=10h   Full Load completes (10TB → about 10 hours)
T=10h~  CDC starts (changes accumulated during Full Load + real-time changes after)
T=12h   CDC Lag 0 (caught up with the changes made during the Full Load period)
T=X     Cutover decision (Lag ≈ 0, stop the app then switch DNS)
```

**Cutover decision criteria**:
- CDC Lag < 1 second (or below the business-acceptable RPO)
- All tables verified (row counts match, sample data compared)
- App connection test succeeded

**Table mapping rules**: DMS defines source-to-target table mapping, column filtering, and data transformation in JSON.

```json
{
  "rules": [
    {
      "rule-type": "selection",
      "rule-id": "1",
      "object-locator": {
        "schema-name": "HR",
        "table-name": "%"
      },
      "rule-action": "include"
    },
    {
      "rule-type": "transformation",
      "rule-id": "2",
      "rule-action": "convert-lowercase",
      "rule-target": "schema"
    }
  ]
}
```

## SCT (Schema Conversion Tool): The Reality of Heterogeneous Conversion

SCT automatically converts the source DB's schema (DDL) and code (stored procedures, triggers, views, functions) to the target engine. But "automatic" does not mean "complete."

**Items SCT can convert**:
- Tables, indexes, constraints (85-95% automatic)
- Basic SELECT/INSERT/UPDATE/DELETE (nearly 100%)
- Standard SQL functions → conversion to corresponding functions

**Items SCT needs manual fixes for**:
- DB-engine-specific features (Oracle's ROWNUM, SQL Server's TOP)
- Complex cursor logic
- Dynamic SQL (exec())
- External procedure calls (Java stored procedures)
- Nested dependencies among packages and types

**SCT Assessment Report**: Marks the items that can be converted automatically and those needing manual fixes with colors (green/orange/red). It must be run in the pre-assessment stage of a migration.

Netflix's Oracle → Aurora MySQL migration (2015-2016). Netflix moved dozens of Oracle DBs to Aurora. SCT automatically converted about 65% of the PL/SQL, and the remaining 35% was converted manually by the DBA team. Oracle packages and Nested Table types were particularly a problem. Lesson: in a heterogeneous DB migration, set an SCT automation rate of 70-80% as the realistic goal, and include development resources in the project for the remaining 20-30%.

## Key Migration Patterns

### Pattern 1: Oracle → Aurora PostgreSQL (the most common)

```
1. Run the SCT Assessment Report (1-2 weeks)
   → Evaluate the conversion rate, determine the scope of manual work

2. Convert the schema with SCT + manual fixes (2-8 weeks)
   → DDL, PL/SQL → PL/pgSQL, indexes, views

3. Start DMS Full Load + CDC (data migration)
   → Choose the Replication Instance size (based on data volume)

4. App testing (functional verification after connecting to the Target DB)
   → Compare SQL query performance, especially complex queries

5. Performance optimization (Aurora PostgreSQL specific)
   → EXPLAIN ANALYZE, add indexes, remove query hints

6. Cutover (within planned downtime)
   → Confirm CDC Lag ≈ 0 → stop the app → final synchronization → DNS switch
```

**License savings calculation**:
- Oracle Enterprise Edition: ~$47,500/core/year + options
- Aurora PostgreSQL: $0.29 per vCPU-hour (8 vCPU → ~$20,000/year)
- Savings rate: 50-80% (depending on server scale and option packages)

### Pattern 2: SQL Server → Aurora PostgreSQL with Babelfish

Babelfish is an Aurora PostgreSQL extension that AWS released as open source in 2021. It translates SQL Server's TDS (Tabular Data Stream) protocol and T-SQL dialect so that Aurora PostgreSQL can understand them.

**How Babelfish works**:
- Adds a TDS protocol endpoint to PostgreSQL (default port 1433)
- Parses T-SQL statements and converts them to PostgreSQL SQL
- Emulates SQL Server system catalog views (sys.tables, sys.columns)

**Babelfish use cases**:
- Switch a SQL Server .NET app to Aurora without code changes
- JDBC/ODBC SQL Server driver compatibility
- Most existing SQL Server stored procedures (T-SQL) run as is

**Limits of Babelfish**:
- Some complex T-SQL features are unsupported (CLR procedures, some SQL Agent features)
- Performance characteristics may differ from pure PostgreSQL
- Features specific to SQL Server 2017+ are limited

| Item | SCT + DMS (traditional) | Babelfish |
|------|-------------------------|-----------|
| Code changes | Yes (30-40% manual) | Almost none |
| Compatibility | High (after full conversion) | Medium (T-SQL partially compatible) |
| Duration | Long | Short |
| Long-term portability | Fully PostgreSQL | Stays dependent on T-SQL |

The TDS protocol (Tabular Data Stream) is the communication protocol between SQL Server and clients. Sybase designed it in 1984, and Microsoft inherited it and published it (OpenSpec). Babelfish implements this protocol so that PostgreSQL handles it directly, making the client recognize Aurora as a SQL Server. It is like adding an API compatibility layer.

## DMS's Diverse Targets

DMS is used not only for plain DB → DB migration but also for **building analytics pipelines**.

| Use case | Source | Target | Pattern |
|----------|--------|--------|---------|
| OLTP migration | Oracle | Aurora PG | Full Load + CDC |
| Data lake build | MySQL | S3 (Parquet/CSV) | CDC + S3 |
| Real-time analytics | PostgreSQL | Kinesis Data Streams | CDC → real time |
| Data warehouse | SQL Server | Redshift | Full Load + CDC |
| NoSQL conversion | MongoDB | DynamoDB | Full Load |

The DMS → S3 → Athena pattern. When DMS stores the changes of an operational DB in S3 in Parquet format, Athena queries it directly with SQL. This is the real-time ingestion path of a Lake Formation-based data lake. CDC records include an op column (I=Insert, U=Update, D=Delete), so they preserve the full change history of the source. This can be queried in Athena in a Schema-on-Read manner.

## DMS Fleet Advisor: Auto-Discovery of the DB Portfolio

In a large enterprise, there are cases where they cannot even tell which DBs exist where and how many. DMS Fleet Advisor automatically discovers DB instances on the network and generates migration recommendations.

**How it works**:
1. Specify the network range (IP range or host list)
2. The Fleet Advisor Collector gathers DB engine, version, schema size, and number of stored procedures
3. Generates a Migration Complexity Report (assesses the difficulty of moving each DB)
4. Recommends the target engine (e.g., recommends Oracle → Aurora PG, conversion complexity 20%)

**ADS vs Fleet Advisor**:
- ADS: Full inventory of server infrastructure (CPU, memory, network, OS)
- Fleet Advisor: DB-specific inventory (engine, version, schema, complexity)

## Hidden Complexity in Heterogeneous Migration

Problems that frequently occur in heterogeneous DB migration:

**Data type inconsistency**:
- Oracle NUMBER(38,10) → PostgreSQL NUMERIC(38,10): can be converted automatically
- Oracle DATE (includes date + time) → PostgreSQL DATE (date only): risk of losing time information
- Oracle CLOB → PostgreSQL TEXT: mostly OK, some differences in length limits

**Character encoding**:
- Oracle: various, such as AL32UTF8 and WE8ISO8859P1
- PostgreSQL: UTF8 recommended
- With heterogeneous encodings, DMS conversion settings are needed

**Differences in NULL handling**:
- Oracle: treats the empty string '' as NULL
- PostgreSQL: distinguishes '' from NULL
- This difference can change query results

**Schema letter case**:
- Oracle: object names default to uppercase (TABLE_NAME)
- PostgreSQL: object names default to lowercase (table_name)
- SCT converts automatically, but be careful about case assumptions in the app code

> ⚠️ **Pitfall**: After migration, there are cases where the app's queries return different results in PostgreSQL. This is due to differences in NULL handling, character comparison, and date arithmetic. After Full Load + CDC completes, you must perform a **functional test (at the application level)**. Matching row counts alone is not sufficient.

## Architecture Diagram: Large-Scale Oracle → Aurora Migration

```
[Oracle RAC On-Prem]
    │
    │  Step 1: SCT Assessment + schema conversion (dev environment)
    ▼
[Aurora PostgreSQL (dev environment)]
    │ Verify schema and procedures
    ▼
[Aurora PostgreSQL (production, Multi-AZ)]
    ▲
    │  Step 2: DMS Replication Instance
    │    ├── Full Load (entire data)
    │    └── CDC (change data in real time)
    │
[Oracle RAC On-Prem] ──── Redo Log ──► DMS
    │
    │ Direct Connect (dedicated line, low latency)
    │
[AWS VPC, ap-northeast-2]
    └── DMS Replication Instance (r5.2xlarge)

    Step 3: Verification
    ├── Row count comparison (DMS Row Count Validation)
    ├── Data sample comparison
    └── App functional test (Test environment)

    Step 4: Cutover
    ├── Confirm CDC Lag ≈ 0
    ├── App server maintenance window (2-4 AM)
    ├── Final synchronization complete
    ├── Change the app endpoint → to Aurora
    └── Block the Oracle connection → start operating on Aurora
```

## Trade-off Comparison Table: 5 Paths Away from a Commercial DB

Even for the single requirement "reduce Oracle licensing costs," the answers branch five ways. The Pro exam puts these five side by side and makes you pick one by the **qualifier**. In the 7R framework of cloud migration (Rehost, Replatform, Repurchase, Refactor, Retire, Retain, Relocate), a DB mostly falls across the first four.

| Path | Transition period | App code changes | License savings | Operational burden | Risk |
|------|-------------------|------------------|-----------------|--------------------|------|
| **Rehost: Oracle on EC2 (BYOL)** | Shortest | None | **None** | High (run OS and DB yourself) | Low |
| **Replatform: RDS for Oracle** | Short | Almost none | Partial (SE2 license-included is possible) | Medium | Low |
| **Replatform: RDS Custom for Oracle** | Short | None | None (BYOL) | Medium (OS access possible) | Low |
| **Refactor: SCT + DMS → Aurora PG** | **Longest** (months) | **Large** (30-40% manual) | **Largest** | Low (managed) | High |
| **Refactor: Babelfish (SQL Server only)** | Medium | Almost none | Large | Low | Medium |

**"To move fast, Rehost; to run cheap, Refactor."** These two are exactly opposite trade-offs. If the question text says "as quickly as possible" or "minimal changes to the application," it points to Rehost or Replatform; if it says "eliminate licensing costs" or "long-term operational efficiency," it points to SCT + DMS. If both qualifiers appear at once, a **phased approach** (first leave the data center with Rehost, then Refactor) is the correct direction.

The **License Included** option of RDS for Oracle is limited to Standard Edition 2, and Enterprise Edition is BYOL (Bring Your Own License). So the statement "moving to RDS solves the license" is only half right. A workload that depends on EE features (Partitioning, Advanced Security, RAC, etc.) still carries the license cost even when moved to RDS. RAC is not supported on RDS for Oracle, so a RAC-dependent system has no option but to be reconfigured as a single instance or refactored to Aurora. When the condition "Oracle EE + RAC" is attached on the exam, the choices narrow sharply.

> 🎯 **Scenario**: "The data center lease ends in 6 months. 12 core systems based on Oracle EE must be moved to AWS within that time, and the company wants to eliminate licensing costs over the following 2 years. What is the order?" — Answer: **Step 1 Rehost (EC2 BYOL or RDS Custom) to leave the data center by the deadline → Step 2 sequential Refactor to Aurora PostgreSQL with SCT + DMS**. Converting all the PL/SQL of 12 systems within 6 months is unrealistic, and a large-scale refactor under deadline pressure has a high chance of failure. When the two constraints of deadline and cost collide, **separating them along the time axis** is the standard answer.

## Real DMS Task Settings: Validation, LOBs, Control Tables

The success of DMS is decided not by console buttons but by the task settings JSON. Below are the key parts of the settings actually used in a large heterogeneous migration.

```json
{
  "TargetMetadata": {
    "SupportLobs": true,
    "FullLobMode": false,
    "LimitedSizeLobMode": true,
    "LobMaxSize": 64,
    "BatchApplyEnabled": true
  },
  "FullLoadSettings": {
    "TargetTablePrepMode": "DO_NOTHING",
    "MaxFullLoadSubTasks": 8,
    "CommitRate": 10000,
    "StopTaskCachedChangesApplied": false
  },
  "ValidationSettings": {
    "EnableValidation": true,
    "ValidationMode": "ROW_LEVEL",
    "ThreadCount": 5,
    "FailureMaxCount": 10000,
    "TableFailureMaxCount": 1000
  },
  "ControlTablesSettings": {
    "ControlSchema": "dms_control",
    "HistoryTimeslotInMinutes": 5,
    "StatusTableEnabled": true,
    "SuspendedTablesTableEnabled": true,
    "HistoryTableEnabled": true
  },
  "Logging": {
    "EnableLogging": true
  }
}
```

The point is why each setting has that value.

| Setting | Value | Rationale |
|---------|-------|-----------|
| `FullLobMode: false` + `LimitedSizeLobMode: true` | Limited mode | Full LOB mode splits a LOB into pieces and makes many round trips, so it is very slow. If you know the maximum size, limited mode is overwhelmingly faster |
| `LobMaxSize: 64` (KB) | Based on a measured value | LOBs larger than this value are **truncated**. You must first measure `MAX(LENGTH(col))` on the source |
| `TargetTablePrepMode: DO_NOTHING` | Keep existing tables | Keeps DMS from overwriting the schema (constraints, defaults) that SCT created |
| `BatchApplyEnabled: true` | Batch apply | Applies CDC changes in batches rather than one by one, greatly raising throughput |
| `EnableValidation: true` | Validation on | Compares source and target not just by row count but value by value |

LOBs larger than `LobMaxSize` being **truncated without warning** is the classic data-loss incident of heterogeneous migration. It is especially dangerous in CLOB/BLOB columns that contain contract PDFs or images. That is why "measure the maximum size of each LOB column" is always included in pre-migration work. If sizes vary widely and no upper bound is known, use Full LOB mode even at the cost of performance, or consider a redesign that separates the LOBs into S3 and leaves only the key in the DB.

When you turn on `ValidationSettings`, DMS creates an `awsdms_validation_failures_v1` table in the target DB and records mismatched rows. On top of that, `ControlTablesSettings` also leaves `awsdms_status` (task status), `awsdms_suspended_tables` (tables suspended by errors), and `awsdms_apply_exceptions` (records that failed to apply). The Cutover decision must be based not on the green indicator in the console but on **whether these control tables are empty**. A "row counts match" check can never catch a mismatch where only values changed through an UPDATE.

```bash
# Run a pre-assessment — catches unsupported data types, tables without a PK, etc. in advance
aws dms start-replication-task-assessment-run \
  --replication-task-arn arn:aws:dms:ap-northeast-2:111111111111:task:XXXX \
  --service-access-role-arn arn:aws:iam::111111111111:role/dms-assessment-role \
  --result-location-bucket dms-assessment-reports \
  --assessment-run-name preflight-2026-q1 \
  --include-only unsupported-data-types,table-with-lob-but-no-primary-key

# Create a Full Load + CDC task
aws dms create-replication-task \
  --replication-task-identifier oracle-to-aurora-hr \
  --source-endpoint-arn arn:aws:dms:...:endpoint:SRC \
  --target-endpoint-arn arn:aws:dms:...:endpoint:TGT \
  --replication-instance-arn arn:aws:dms:...:rep:INST \
  --migration-type full-load-and-cdc \
  --table-mappings file://table-mappings.json \
  --replication-task-settings file://task-settings.json

# Check per-table progress and validation status (the evidence data for the Cutover decision)
aws dms describe-table-statistics \
  --replication-task-arn arn:aws:dms:...:task:XXXX \
  --query 'TableStatistics[?ValidationState!=`Validated`]'
```

When DMS creates target tables in a heterogeneous migration, it creates them in a **minimal form with only the primary key**. It does not create secondary indexes, foreign keys, sequences, defaults, triggers, or stored procedures. These must be applied separately from the DDL that SCT generated. And for performance, the standard is to **remove secondary indexes and foreign keys during Full Load and recreate them after it completes**. If you load hundreds of millions of rows with the indexes in place, load time grows several-fold.

## Cutover and Rollback: The Order That Builds a Way Back

The reason a DB Cutover is scarier than a server Cutover is that **it is hard to undo**. Once writes begin on the new DB after the switch, going back to the source loses the data written in between. That is why reverse replication must be part of the sequence.

```
[T-2 weeks]  Rehearsal
   ├── Perform the entire Cutover process once exactly as is, on a production replica
   ├── Measure the elapsed time → fix the length of the maintenance window
   └── Rationale: downtime must be set by measurement, not estimation

[T-1 day]  Preparation
   ├── Lower the DNS TTL to 60 seconds or less (or prepare Route 53 weighted routing)
   ├── Confirm the validation control tables are empty
   ├── Fix the rollback criteria in a document (e.g., roll back if unresolved within 30 minutes)
   └── Rationale: if you discuss "should we roll back?" in the middle of an outage, it is already too late

[T-0]  Switch
   1. Switch the app to read-only mode (or stop it completely)
   2. Confirm that there are no more writes on the source DB
   3. Wait for CDC Lag = 0
   4. Synchronize sequences and auto-increment values  ← the step most often skipped
   5. Refresh statistics (ANALYZE) on the target DB and confirm secondary indexes exist
   6. Switch the app connection string/endpoint to the target DB
   7. Smoke test (5-10 core transactions)

[T+0]  Safety net activated
   ├── Immediately start a reverse CDC task (Aurora → Oracle)
   ├── Keep the source Oracle for at least 1-2 weeks (do not delete it)
   └── Rationale: if reverse replication is alive, data loss at the time of rollback is close to 0

[T+2 weeks]  Cleanup
   ├── After confirming no problems, stop the reverse task and retire the source
   └── Delete the DMS Replication Instance (it keeps being billed)
```

Incidents where **sequence synchronization** in step 4 is skipped are very common. DMS moves a table's row data, but it does not move the current value of an Oracle SEQUENCE or a PostgreSQL serial/identity. Right after the switch, new INSERTs start from 1 and primary key conflicts explode. The Cutover checklist must explicitly include "set the `last_value` of every sequence to the source's maximum value + a margin."

The failure cause that teams that actually executed a rollback after a heterogeneous DB Cutover commonly point to is not data but **performance**. Cases repeat where all functional tests passed, but once real production load arrived, the execution plan of a particular query came out differently on Aurora PostgreSQL and the response time grew by dozens of times. It arises especially in queries that depended on Oracle hints, correlated subqueries, and large joins. So pre-Cutover verification must include a **production-level load test** and an execution plan comparison based on `EXPLAIN ANALYZE`. Matching row counts is a minimum condition, not a sufficient one.

## When the Qualifier Changes, the Answer Changes

Take one requirement, "move the on-premises Oracle to AWS," and change only the qualifier.

| Qualifier | Correct direction | Why |
|-----------|-------------------|-----|
| **MINIMAL downtime** | DMS **Full Load + CDC** | Catch up while operating the source, and stop only briefly at the end |
| **MINIMAL changes to application** | Rehost (EC2) or RDS for Oracle | A heterogeneous conversion inevitably brings code changes |
| **LOWEST long-term cost** | SCT + DMS → **Aurora PostgreSQL** | The only path that eliminates the license itself |
| **LEAST operational overhead (the migration work itself)** | **DMS Serverless** | Removes Replication Instance sizing and scaling |
| **Network bandwidth is very limited / tens of TB** | **Snowball + DMS (SCT data extraction agent)** | Bulk initial load by physical transfer, then only changes via CDC |
| **Homogeneous engine (MySQL → RDS MySQL)** | **DMS only** (SCT not needed) | No schema conversion is required |
| **A real-time analytics pipeline is also needed** | DMS → **Kinesis / S3** target | DMS targets are not only DBs |

**"If it asks about downtime, CDC; about cost, Aurora; about bandwidth, Snowball; if homogeneous, drop SCT."** Four sentences set the direction of most DMS questions.

In the bandwidth-constraint scenario, you need to know exactly the role of the **SCT Data Extraction Agent**. This agent extracts and compresses source data on-premises into local files, loads those files onto Snowball Edge to ship them physically to AWS, and then loads them through S3 into the target (especially a data warehouse such as Redshift). It is the standard path for moving tens to hundreds of TB of Teradata, Netezza, or Oracle DW to Redshift. Even then, **only the initial load is a physical transfer, and the changes after that are caught up over the network by DMS CDC** — a question may ask about this combination.

## Summary

Today's picture is fourfold.

First, **CDC is a technique that reuses the transaction log of each DB engine.** Oracle uses the Redo Log (LogMiner + supplemental logging), SQL Server uses the Transaction Log (CDC feature), MySQL uses the binlog (ROW format), and PostgreSQL uses the WAL (logical replication). A question about which advance configuration the source DB needs is really asking what that engine's CDC source is.

Second, **SCT and DMS have different roles.** SCT moves the schema and code (structure), and DMS moves the data (content). For homogeneous engines SCT is not needed, and for heterogeneous engines you should set SCT's 70-80% automatic conversion rate as the realistic goal and include development resources for the rest in the project plan.

Third, **the substance of zero downtime is Full Load + CDC.** CDC catches up on the changes accumulated while the whole is being copied, and the system stops briefly only at the moment the Lag converges to 0. However, in the Cutover checklist, sequence synchronization, secondary indexes, statistics refresh, and the reverse-CDC safety net must be handled separately.

Fourth, **the qualifier decides the choice.** Downtime points to CDC, long-term cost to a Refactor to Aurora, minimal app changes to Rehost or Babelfish, and bandwidth constraints to Snowball + the data extraction agent. Since the basic premise of a Pro question is that several options all "work," you must choose not what works but **what is best under that qualifier**.

## 📝 Practice Questions

**Question 1.** You need to migrate a 50TB Oracle DB to Aurora PostgreSQL. Zero downtime required, and stored procedures must be converted. Which stages are required?

A) Oracle Export → Aurora Import (downtime required)
B) SCT converts schema and PL/SQL → DMS Full Load + CDC → validation and Cutover
C) MGN transfers entire Oracle server to EC2
D) Snowball transfers data, then Aurora loads

**Answer: B**
Heterogeneous engine + stored procedure conversion + zero downtime = standard SCT + DMS Full Load + CDC pattern. A requires downtime; C maintains Oracle licensing; D cannot stream real-time CDC.

---

**Question 2.** You have a SQL Server app. You want to migrate to Aurora without code changes, cutting Oracle and SQL Server licensing. Best option?

A) RDS for SQL Server (BYOL) → no code changes
B) Aurora PostgreSQL with Babelfish
C) Aurora MySQL (T-SQL compatibility)
D) DynamoDB (NoSQL conversion)

**Answer: B**
SQL Server TDS protocol + T-SQL compatibility + Aurora PG = Babelfish. App connects to Aurora as if it were SQL Server. Cuts licensing costs too. A doesn't fully reduce licensing (SQL Server license remains). C: Aurora MySQL lacks T-SQL compatibility. D: requires massive app code changes.

---

**Question 3.** To use DMS CDC with Oracle, what configuration must be enabled on the source DB?

A) Enable Binary Log
B) Enable ARCHIVELOG mode + Supplemental Logging
C) Enable WAL logical replication
D) Enable CDC feature (SQL Server style)

**Answer: B**
Oracle CDC = LogMiner-based. ARCHIVELOG mode preserves Redo Log for DMS to read. Supplemental Logging includes old values of deleted rows in logs, so DMS can identify which rows were deleted. Binary Log is MySQL, WAL is PostgreSQL, CDC feature is SQL Server.

---

**Question 4.** For MySQL → RDS MySQL migration (homogeneous engine), is SCT needed?

A) Yes. Always use SCT
B) No. DMS alone is sufficient for homogeneous engines
C) Yes. Must convert MySQL version differences
D) Yes. RDS uses different SQL dialect

**Answer: B**
Homogeneous engine migration (MySQL → RDS MySQL) needs no schema conversion, so DMS alone suffices. SCT is for heterogeneous engines (Oracle → PostgreSQL, SQL Server → Aurora) needing schema/code conversion.

---

**Question 5.** You want to continuously collect on-premises MySQL DB to S3 in Parquet format for data lake construction. Best approach?

A) mysqldump → S3 batch upload (once daily)
B) DMS (MySQL source, S3 target, CDC enabled)
C) AWS DataSync copy MySQL data files
D) Kinesis Data Streams + Lambda

**Answer: B**
DMS with MySQL source, S3 target, CDC enabled collects real-time changes to S3 as Parquet or CSV. Change records include op column (I/U/D) preserving change history. mysqldump is batch once daily (not real-time). DataSync copies file systems; direct MySQL data file copying has consistency issues.

---

**Question 6.** Difference between DMS Fleet Advisor and Application Discovery Service (ADS)?

A) Fleet Advisor handles servers; ADS handles DBs
B) ADS covers entire server infrastructure (CPU, memory, network); Fleet Advisor specializes in DBs (engine, schema, complexity)
C) Both have identical functionality
D) Fleet Advisor supports Oracle only

**Answer: B**
ADS: universal discovery for entire server infrastructure (CPU, memory, disk, network dependencies, OS). Fleet Advisor: DB-specialized (DB engine, version, schema size, stored procedure count, migration complexity assessment). Company-wide migrations use both ADS (entire servers) and Fleet Advisor (DB specialization).

---

**Question 7.** Top reason to choose DMS Serverless?

A) Completely free
B) Auto-scale without choosing Replication Instance size, minimal operational burden
C) On-premises only
D) Heterogeneous conversion without SCT

**Answer: B**
DMS Serverless: AWS auto-manages Replication Instance (EC2) and auto-scales per traffic. Eliminates instance type selection and manual scaling burden. Billed per DCU (DMS Capacity Unit) usage. SCT still required separately.

---
