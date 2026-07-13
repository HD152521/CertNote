# Day 3 - AWS DMS + SCT: The Science of Database Migration

Database migration is far more complex than server migration. Servers share a common language (OS and file systems), but DB engines each have different SQL dialects, data types, built-in functions, and procedural languages. Oracle's PL/SQL, SQL Server's T-SQL, and PostgreSQL's PL/pgSQL look syntactically similar but have dozens of incompatible functions and data types.

AWS DMS (Database Migration Service) manages this complexity. CDC (Change Data Capture) tracks changes in real-time while the source DB continues operating, and SCT (Schema Conversion Tool) enables automatic schema and code conversion between heterogeneous engines. Today we'll cover DMS and SCT's internal operations, per-DB CDC implementations, Babelfish's innovative approach, and real-world large-scale migration patterns.

## CDC's Internal Mechanism: DB-Specific Implementation

CDC (Change Data Capture) captures database changes (INSERT, UPDATE, DELETE) in real-time. DMS implements CDC by reading each DB engine's internal logs.

| DB Engine | CDC Source | Configuration Required |
|--------|---------|------------|
| **Oracle** | Redo Log (LogMiner) | ARCHIVELOG mode, enable supplemental logging |
| **SQL Server** | Transaction Log (CDC feature) | Enable SQL Server CDC feature |
| **MySQL** | Binary Log (binlog) | binlog_format=ROW, FULL |
| **PostgreSQL** | WAL (Write-Ahead Log) | wal_level=logical, replication slot |
| **Aurora MySQL** | Binary Log | Enable binlog |
| **Aurora PostgreSQL** | WAL | Enable logical replication |

> 💡 **Related Theory**: Write-Ahead Logging (WAL) is the foundational mechanism for database durability (ACID's D). Log records are written before actual data page changes, enabling recovery after system failure (Jim Gray's Shadow Paging alternative, implemented in PostgreSQL 1992). DMS repurposes WAL not for "normal recovery" but for "change stream consumption"—called Logical Decoding (PostgreSQL pg_logical_emit_message).

> 🔍 **Deeper Dive**: Oracle LogMiner's principle. LogMiner reconstructs DML operations as SQL from Oracle's Redo Log files (Oracle built-in DBMS_LOGMNR package). DMS uses LogMiner API to read change data from Redo Logs. Supplemental Logging must be enabled so the log includes old values of deleted rows. Without it, DMS cannot identify which rows were deleted.

## DMS Architecture: The Role of Replication Instance

DMS follows a three-tier structure: Source → Replication Instance → Target.

```
Source DB                    Target DB
(Oracle On-Prem)             (Aurora PostgreSQL)
      │                           ▲
      │ CDC (Redo Log)            │
      ▼                           │
Replication Instance (EC2)        │
  ├── Full Load Worker            │
  ├── CDC Worker                  │
  └── Apply transformation rules──┘
```

**Replication Instance**: EC2-based. Transformation job CPU/memory runs on this instance. Size selection is critical.
- Small (< 1TB): dms.t3.medium
- Medium (1-5TB): dms.c5.large
- Large (5TB+): dms.r5.2xlarge (memory-intensive)

**DMS Serverless (2023)**: AWS automatically manages and scales the Replication Instance. Billed in Capacity Units (DCU). Auto-scales on peak load, auto-shrinks when idle.

> ⚠️ **Pitfall**: Replication Instance must connect to both Source and Target DBs simultaneously. If on-premises Oracle is behind a firewall, connectivity via Direct Connect or VPN is required. Standard practice: place Replication Instance in same VPC with private connections.

## Full Load + CDC: The Mathematics of Zero-Downtime Migration

```
Timeline:
T=0     Full Load starts (copy entire source)
T=10h   Full Load completes (10TB ≈ 10 hours)
T=10h~  CDC starts (changes accumulated during Full Load + subsequent real-time)
T=12h   CDC Lag ≈ 0 (caught up on Full Load period changes)
T=X     Cutover decision (Lag ≈ 0, app shutdown, DNS switch)
```

**Cutover decision criteria**:
- CDC Lag < 1 second (or below business-acceptable RPO)
- All table validation complete (row count match, data sample compare)
- App connectivity test successful

**Table mapping rules**: DMS defines source-target table mapping, column filtering, data transformation in JSON.

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

SCT automatically converts source DB schema (DDL) and code (stored procedures, triggers, views, functions) to target engine. But "automatic" doesn't mean "complete."

**SCT can convert**:
- Tables, indexes, constraints (85-95% automatic)
- Basic SELECT/INSERT/UPDATE/DELETE (nearly 100%)
- Standard SQL functions → corresponding functions

**SCT requires manual fixes**:
- DB engine-specific features (Oracle's ROWNUM, SQL Server's TOP)
- Complex cursor logic
- Dynamic SQL (exec())
- External procedure calls (Java stored procedures)
- Package and type nested dependencies

**SCT Assessment Report**: Colors (green/orange/red) mark items automatically convertible vs. those requiring manual fix. Must run during pre-migration assessment phase.

> 📚 **Case Study**: Netflix's Oracle to Aurora MySQL Migration (2015-2016). Netflix migrated dozens of Oracle DBs to Aurora. SCT auto-converted ~65% of PL/SQL; DBAs manually converted the remaining 35%. Oracle packages and Nested Table types were particularly problematic. Lesson: Set realistic SCT automation goal at 70-80%, and budget development resources for the remaining 20-30%.

## Key Migration Patterns

### Pattern 1: Oracle → Aurora PostgreSQL (Most Common)

```
1. Run SCT Assessment Report (1-2 weeks)
   → Evaluate conversion rate, understand manual effort scope

2. Convert schema with SCT + manual fixes (2-8 weeks)
   → DDL, PL/SQL → PL/pgSQL, indexes, views

3. Start DMS Full Load + CDC (data migration)
   → Choose Replication Instance size based on data volume

4. Test app (verify functionality after Target DB connection)
   → Compare SQL query performance, especially complex queries

5. Performance tuning (Aurora PostgreSQL-specific)
   → EXPLAIN ANALYZE, add indexes, remove query hints

6. Cutover (within planned downtime window)
   → Verify CDC Lag ≈ 0 → shutdown app → final sync → DNS switch
```

**License savings calculation**:
- Oracle Enterprise Edition: ~$47,500/core/year + options
- Aurora PostgreSQL: $0.29/vCPU/hour (8vCPU → ~$20,000/year)
- Savings: 50-80% (depending on server scale and options)

### Pattern 2: SQL Server → Aurora PostgreSQL with Babelfish

Babelfish is an Aurora PostgreSQL extension AWS open-sourced in 2021. It converts SQL Server's TDS (Tabular Data Stream) protocol and T-SQL dialect into forms Aurora PostgreSQL understands.

**Babelfish's operating principle**:
- Add TDS protocol endpoint to PostgreSQL (default port 1433)
- Parse T-SQL statements and convert to PostgreSQL SQL
- Emulate SQL Server system catalog views (sys.tables, sys.columns)

**Babelfish use cases**:
- Migrate SQL Server .NET apps to Aurora without code changes
- JDBC/ODBC SQL Server driver compatibility
- Run most existing SQL Server stored procedures (T-SQL) as-is

**Babelfish limitations**:
- Some complex T-SQL features unsupported (CLR procedures, some SQL Agent features)
- Performance characteristics may differ from pure PostgreSQL
- SQL Server 2017+ specialized features limited

| Item | SCT + DMS (Traditional) | Babelfish |
|-----|---------------------|---------|
| Code changes | Yes (30-40% manual) | Minimal |
| Compatibility | High (after complete conversion) | Medium (T-SQL partial compatibility) |
| Duration | Longer | Shorter |
| Long-term portability | Pure PostgreSQL | T-SQL dependency remains |

> 💡 **Related Theory**: TDS protocol (Tabular Data Stream) is the communication protocol between SQL Server and clients. Sybase designed it in 1984, Microsoft inherited and published it (OpenSpec). Babelfish implements this protocol natively in PostgreSQL, making clients perceive Aurora as SQL Server. It's like adding an API compatibility layer.

## DMS's Diverse Targets

DMS enables not just DB-to-DB migration but also **analytics pipeline construction**.

| Use Case | Source | Target | Pattern |
|----------|-------|-------|-----|
| OLTP migration | Oracle | Aurora PG | Full Load + CDC |
| Data lake construction | MySQL | S3 (Parquet/CSV) | CDC + S3 |
| Real-time analytics | PostgreSQL | Kinesis Data Streams | CDC → real-time |
| Data warehouse | SQL Server | Redshift | Full Load + CDC |
| NoSQL conversion | MongoDB | DynamoDB | Full Load |

> 🔍 **Deeper Dive**: DMS → S3 → Athena pattern. DMS stores operational DB changes in S3 as Parquet format; Athena queries directly with SQL. This is the real-time ingestion path for Lake Formation-based data lakes. CDC records include an op column (I=Insert, U=Update, D=Delete), preserving all changes from the source. Athena queries this with Schema-on-Read pattern.

## DMS Fleet Advisor: Auto-Discovery of DB Portfolio

Large enterprises sometimes don't know where which DBs exist or how many. DMS Fleet Advisor auto-discovers DB instances on the network and generates migration recommendations.

**Operating principle**:
1. Specify network range (IP range or host list)
2. Fleet Advisor Collector gathers DB engine, version, schema size, stored procedure count
3. Generate Migration Complexity Report (evaluate migration difficulty for each DB)
4. Recommend target engine (e.g., Oracle → Aurora PG recommended, 20% conversion complexity)

**ADS vs Fleet Advisor**:
- ADS: Complete server infrastructure inventory (CPU, memory, network, OS)
- Fleet Advisor: DB-specialized inventory (engine, version, schema, complexity)

## Hidden Complexity in Heterogeneous Migration

Common issues in heterogeneous DB migration:

**Data type inconsistencies**:
- Oracle NUMBER(38,10) → PostgreSQL NUMERIC(38,10): auto-convertible
- Oracle DATE (date+time) → PostgreSQL DATE (date only): risk of time info loss
- Oracle CLOB → PostgreSQL TEXT: mostly OK, some length limit differences

**Character encoding**:
- Oracle: AL32UTF8, WE8ISO8859P1, etc. varied
- PostgreSQL: UTF8 recommended
- DMS requires conversion settings for encoding mismatch

**NULL handling differences**:
- Oracle: treats empty string '' as NULL
- PostgreSQL: distinguishes '' from NULL
- This difference can change query results

**Schema case sensitivity**:
- Oracle: uppercase object names by default (TABLE_NAME)
- PostgreSQL: lowercase object names by default (table_name)
- SCT auto-converts, but beware of app code case assumptions

> ⚠️ **Pitfall**: After migration, app queries may return different results on PostgreSQL. Due to NULL handling, string comparison, or date arithmetic differences. **Must perform application-level functional testing** after Full Load + CDC. Row count match alone isn't sufficient.

## Architecture Diagram: Large-Scale Oracle → Aurora Migration

```
[Oracle RAC On-Prem]
    │
    │  Step 1: SCT Assessment + schema conversion (dev environment)
    ▼
[Aurora PostgreSQL (dev environment)]
    │ validate schema, procedures
    ▼
[Aurora PostgreSQL (production, Multi-AZ)]
    ▲
    │  Step 2: DMS Replication Instance
    │    ├── Full Load (all data)
    │    └── CDC (change data real-time)
    │
[Oracle RAC On-Prem] ──── Redo Log ──► DMS
    │
    │ Direct Connect (dedicated line, low latency)
    │
[AWS VPC, ap-northeast-2]
    └── DMS Replication Instance (r5.2xlarge)

    Step 3: Validation
    ├── Row count comparison (DMS Row Count Validation)
    ├── Data sample comparison
    └── App functional test (Test environment)

    Step 4: Cutover
    ├── Confirm CDC Lag ≈ 0
    ├── Schedule maintenance window (2-4 AM)
    ├── Complete final sync
    ├── Switch app endpoint → Aurora
    └── Block Oracle connections → begin Aurora operation
```

## 📝 연습 문제

**문제 1.** You need to migrate a 50TB Oracle DB to Aurora PostgreSQL. Zero downtime required, and stored procedures must be converted. Which stages are required?

A) Oracle Export → Aurora Import (downtime required)
B) SCT converts schema and PL/SQL → DMS Full Load + CDC → validation and Cutover
C) MGN transfers entire Oracle server to EC2
D) Snowball transfers data, then Aurora loads

**정답: B**
Heterogeneous engine + stored procedure conversion + zero downtime = standard SCT + DMS Full Load + CDC pattern. A requires downtime; C maintains Oracle licensing; D cannot stream real-time CDC.

---

**문제 2.** You have a SQL Server app. You want to migrate to Aurora without code changes, cutting Oracle and SQL Server licensing. Best option?

A) RDS for SQL Server (BYOL) → no code changes
B) Aurora PostgreSQL with Babelfish
C) Aurora MySQL (T-SQL compatibility)
D) DynamoDB (NoSQL conversion)

**정답: B**
SQL Server TDS protocol + T-SQL compatibility + Aurora PG = Babelfish. App connects to Aurora as if it were SQL Server. Cuts licensing costs too. A doesn't fully reduce licensing (SQL Server license remains). C: Aurora MySQL lacks T-SQL compatibility. D: requires massive app code changes.

---

**문제 3.** To use DMS CDC with Oracle, what configuration must be enabled on the source DB?

A) Enable Binary Log
B) Enable ARCHIVELOG mode + Supplemental Logging
C) Enable WAL logical replication
D) Enable CDC feature (SQL Server style)

**정답: B**
Oracle CDC = LogMiner-based. ARCHIVELOG mode preserves Redo Log for DMS to read. Supplemental Logging includes old values of deleted rows in logs, so DMS can identify which rows were deleted. Binary Log is MySQL, WAL is PostgreSQL, CDC feature is SQL Server.

---

**문제 4.** For MySQL → RDS MySQL migration (homogeneous engine), is SCT needed?

A) Yes. Always use SCT
B) No. DMS alone is sufficient for homogeneous engines
C) Yes. Must convert MySQL version differences
D) Yes. RDS uses different SQL dialect

**정답: B**
Homogeneous engine migration (MySQL → RDS MySQL) needs no schema conversion, so DMS alone suffices. SCT is for heterogeneous engines (Oracle → PostgreSQL, SQL Server → Aurora) needing schema/code conversion.

---

**문제 5.** You want to continuously collect on-premises MySQL DB to S3 in Parquet format for data lake construction. Best approach?

A) mysqldump → S3 batch upload (once daily)
B) DMS (MySQL source, S3 target, CDC enabled)
C) AWS DataSync copy MySQL data files
D) Kinesis Data Streams + Lambda

**정답: B**
DMS with MySQL source, S3 target, CDC enabled collects real-time changes to S3 as Parquet or CSV. Change records include op column (I/U/D) preserving change history. mysqldump is batch once daily (not real-time). DataSync copies file systems; direct MySQL data file copying has consistency issues.

---

**문제 6.** Difference between DMS Fleet Advisor and Application Discovery Service (ADS)?

A) Fleet Advisor handles servers; ADS handles DBs
B) ADS covers entire server infrastructure (CPU, memory, network); Fleet Advisor specializes in DBs (engine, schema, complexity)
C) Both have identical functionality
D) Fleet Advisor supports Oracle only

**정답: B**
ADS: universal discovery for entire server infrastructure (CPU, memory, disk, network dependencies, OS). Fleet Advisor: DB-specialized (DB engine, version, schema size, stored procedure count, migration complexity assessment). Company-wide migrations use both ADS (entire servers) and Fleet Advisor (DB specialization).

---

**문제 7.** Top reason to choose DMS Serverless?

A) Completely free
B) Auto-scale without choosing Replication Instance size, minimal operational burden
C) On-premises only
D) Heterogeneous conversion without SCT

**정답: B**
DMS Serverless: AWS auto-manages Replication Instance (EC2) and auto-scales per traffic. Eliminates instance type selection and manual scaling burden. Billed per DCU (DMS Capacity Unit) usage. SCT still required separately.

---
