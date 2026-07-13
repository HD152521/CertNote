# Day 2 - Redshift Deep Dive: MPP Internal Operations, RA3 Storage Separation, Spectrum and Zero-ETL

The most common question from engineers new to data warehousing is: "Why can't we just scale up PostgreSQL?" The truth is Redshift was forked from PostgreSQL 8.0.2, and SQL syntax is nearly identical. However, a single PostgreSQL instance takes minutes or hours on analytical queries with `GROUP BY` and `JOIN` over hundreds of millions of rows. Redshift completes the same query in seconds. The difference is not the SQL engine but the **storage structure (columnar orientation) and execution architecture (MPP, distributed)**. Understanding Redshift means understanding "how data is scattered across nodes and slices, and how queries are executed in parallel on top of that."

In SAP-C02 exams, Redshift scenarios focus on architecture and operations: "network shuffle exploding due to wrong distribution keys," "migrating from DC2 storage limits to RA3," "unifying data lake and warehouse via Spectrum for a lakehouse," "analyzing operational databases without ETL via Zero-ETL." Today we'll dissect how Redshift works internally, why it's designed that way, and build intuition for solving these scenarios.

## Why MPP — The Scale a Single-Node RDBMS Cannot Reach

Traditional RDBMs (OLTP databases) optimize for fast reads and writes of a small number of rows per transaction. B-tree indexes find specific rows in O(log n), and row-oriented storage fetches all columns of one record at once. This works perfectly for "lookup order ID 12345." But analytical queries show the opposite pattern: "total monthly sales by region for the past 3 years" reads all rows but needs only a few columns (amount, region), returning small aggregated results.

Redshift addresses this OLAP pattern two ways. First, **columnar storage** reads only the amount/region columns from disk, skipping others. Second, **MPP (Massively Parallel Processing)** distributes data across multiple nodes and executes queries simultaneously on all of them. Instead of one node processing 100 million rows, 10 nodes each process 10 million rows in parallel, reducing execution time 10-fold.

Redshift's cluster architecture is **Leader Node + Compute Nodes**. The Leader Node receives client SQL, builds an execution plan, compiles it to C++ code, and distributes it to each Compute Node. Compute Nodes execute that code on their local data chunk and return intermediate results to the Leader for final aggregation. Each Compute Node further divides into **Slices** (2–16 depending on node type), the smallest parallelizable unit where data is distributed.

> 💡 **Related Theory**: Redshift's MPP is the cloud implementation of the shared-nothing architecture established by Teradata and Greenplum in the 1980s–90s. In shared-nothing, each node owns its disk, memory, and CPU, sharing nothing with others—adding nodes scales throughput nearly linearly. Contrast this with shared-disk (Oracle RAC), where all nodes share disk, creating lock contention bottlenecks. Redshift chose shared-nothing because analytical workloads fit the map-reduce pattern: "each node independently processes its data, then merge." RA3 slightly alters this principle (covered later).

> 🔍 **Deep Dive**: Redshift **compiles queries to C++** before execution. This is an interesting design choice. Most databases interpret execution plans operator-by-operator (Volcano model). Redshift generates and compiles custom C++ code per query, achieving native speed. The downside: first-time queries incur compilation overhead (hundreds of ms to seconds). To mitigate, Redshift caches compiled code in a shared cluster cache, so identical query patterns execute immediately on subsequent runs without recompilation. This doesn't appear directly on exams, but it explains why "the first query is unusually slow."

## Distribution Styles (DISTSTYLE) — Data Placement Determines Performance

The biggest performance variable in Redshift is **distribution key**. How data splits across slices determines inter-node data movement (shuffle) during joins and aggregations. Shuffling crosses the network, the most expensive operation. Good distribution design minimizes this shuffle.

**DISTSTYLE KEY**: Hash the specified column to scatter data across slices. If two tables use the same key (co-location), equal keys land on the same slice, enabling local joins without inter-node movement. For example, if orders and order_items both distribute by order_id, the join happens within each slice.

**DISTSTYLE ALL**: Replicate the entire table on all nodes. Ideal for small dimension tables (country codes, categories). Large fact tables join these dimension tables without shuffle since dimensions already exist on every node. But replication consumes storage proportional to node count—unsuitable for large tables.

**DISTSTYLE EVEN**: Round-robin, uniform distribution. Use when no clear join key exists or no good distribution column is available.

**DISTSTYLE AUTO** (default): Redshift auto-switches from ALL for small tables to KEY/EVEN as they grow.

> 🎯 **Scenario**: "We frequently join a 1-billion-row sales fact table and a 10k-row product dimension table. Queries are slow and inter-node network traffic is high. What's the optimal distribution design?" Answer: **fact table distributed by join key (product_id or a fact-to-fact key), product dimension as DISTSTYLE ALL**. Small dimensions replicated to all nodes eliminate shuffle on large fact joins. For two large fact tables joining, distribute both by the same join key for co-location. In exams, "large + small table join + high network traffic" signals fact=KEY, dim=ALL.

> ⚠️ **Trap**: Using a low-cardinality column (gender, status with few distinct values) as the distribution key creates **data skew**. With only 'M' and 'F', data concentrates on two slices while others idle; two slices overload. MPP parallelism collapses. Distribution keys must have high cardinality and even distribution (order ID, user ID). Check `SVV_TABLE_INFO`'s skew metric. In exams, "only some nodes show high CPU and queries are slow" signals distribution skew.

## Sort Keys (SORTKEY) — What Blocks Can We Skip?

The sort key defines the physical order data occupies on disk. Redshift stores data in 1MB **blocks**, recording min/max values of block contents in metadata (**Zone Map**). On a condition like `WHERE event_date BETWEEN '2024-01-01' AND '2024-01-07'`, Redshift checks Zone Maps and skips entire blocks outside the date range—**block skipping**. The sort key determines which blocks get skipped.

- **COMPOUND SORTKEY**: Multiple columns sorted in order. Most effective when filtering by the first column. Time columns (event_date) typically lead since time-series analysis dominates.
- **INTERLEAVED SORTKEY**: Equal weight to all sort key columns, theoretically advantageous for diverse filtering on multiple columns. But VACUUM REINDEX burden and maintenance complexity make it rarely used in practice.

> 💡 **Related Theory**: Zone Map is essentially the same idea as Parquet row group min/max statistics in data lakes (Day 41). Both use "block-level statistics on sorted/clustered data to skip unnecessary I/O"—the zone map / data skipping technique common to OLAP systems (Redshift, BigQuery, Snowflake, ClickHouse). If indexing (B-tree) means "quickly find specific rows," Zone Maps mean "quickly discard irrelevant massive blocks." OLAP prioritizes the latter overwhelmingly.

> 🔍 **Deep Dive**: Why do VACUUM and ANALYZE matter? Redshift doesn't physically delete rows marked DELETE immediately; it soft-deletes them. INSERTs break sort order, accumulating in unsorted regions. Over time: (1) deleted rows waste space, (2) unsorted regions grow, reducing block skipping efficacy. **VACUUM** physically removes deleted rows and re-sorts by sort key. **ANALYZE** refreshes statistics so the query planner builds accurate execution plans. Modern Redshift automates this via Auto VACUUM/Analyze, but large bulk operations sometimes need manual runs. In exams, "bulk INSERT/DELETE followed by slow queries" signals VACUUM needs.

## RA3 — Separating Compute and Storage, the Real Reason

Early Redshift (DC2, DS2) adhered strictly to shared-nothing: each node held data on local SSD/HDD. The problem: compute and storage were **tightly coupled**. Storage fills, you add nodes—but now you've scaled unneeded compute too, wasting cost. Low on compute, add nodes—storage scales pointlessly. You couldn't scale them independently.

**RA3** solves this with **Redshift Managed Storage (RMS)**. Data lives in RMS (S3-backed), while RA3 nodes' local SSDs act as **cache**. Hot (frequently accessed) data caches on local SSD for speed; cold data stays in RMS and auto-fetches when needed. Compute (node count) and storage (RMS capacity) now scale independently. Petabytes of data don't force you to buy unnecessary compute.

This separation enables crucial side effects. Since data lives in S3 (RMS), **multiple clusters can share data without copying** (Data Sharing). Backup/restore accelerates, and cluster resizing (resize) happens via metadata changes, not data movement.

> 🔍 **Deep Dive**: RA3's compute-storage split follows the architecture Snowflake pioneered. Snowflake started with data on S3 (or GCS/Blob) and separate "virtual warehouse" compute clusters. Multiple warehouses could read the same data with query isolation (ETL vs. BI vs. data science). Redshift caught up via RA3 + Data Sharing + Serverless. From SAP's angle: "multiple teams read the same data without hurting each other's performance" means RA3 + Data Sharing (producer/consumer split) or Serverless multi-instance.

> 📚 **Case Study**: A retailer ran DC2 clusters. Over 3 years, data accumulated, storage hit 90%. They added nodes repeatedly, though compute was plenty—monthly costs tripled. After migrating to RA3, data went to RMS (S3), and they kept only 8 nodes for actual compute, cutting costs 40%. Additionally, BI and ETL teams competing on one cluster split via Data Sharing into producer/consumer clusters, resolving contention. In SAP exams, "DC2 storage shortfall + rising costs" almost always signals RA3 migration.

## DC2 vs RA3 vs Serverless — When to Choose What

| Type | Storage | Compute Management | Suitable Workloads |
|------|----------|-------------|----------------|
| **DC2** | Local SSD (coupled) | Node count manual | Small (< hundreds GB), fixed |
| **RA3** | RMS (S3-based, decoupled) | Node count manual | Large, predictable steady |
| **Serverless** | RMS | Auto (RPU) | Variable, sporadic, unpredictable |

**Redshift Serverless** abolishes nodes. Workload triggers automatic **RPU (Redshift Processing Unit)** scaling up and down; idle queries drop cost to near-zero (storage billed separately). Ideal for dev/test, sporadic analysis, and irregular traffic. Conversely, steady high-volume production may be cheaper with RA3 reserved instances than RPU-per-hour pricing.

> ⚠️ **Trap**: "Serverless is always cheaper"—false. Serverless bills per RPU-hour; sustained high workloads can cost more than RA3 reserved instances. Serverless's strength is elasticity (near-zero cost when idle), not absolute unit price. In exams: unpredictable/sporadic/dev = Serverless; steady bulk production = RA3 reserved.

## Redshift Spectrum — Query Data Lakes Directly from the Warehouse

Spectrum lets Redshift **query S3 data via SQL without loading it into the cluster** (no COPY). Create an External Schema referencing Glue Catalog table definitions, then join Redshift internal tables with S3 external tables in one query—this is the lakehouse essence. Recent, frequently-used data stays inside Redshift; vast historical archives live in S3 lakes. Join on-demand.

Spectrum's mechanics matter. On a Spectrum query, Redshift pushes S3 scan, filter, and aggregation work to **a separate Spectrum node pool managed by AWS** (pushdown). This pool scales elastically to thousands of nodes independently from your Redshift cluster. Petabytes of S3 scanning don't consume your cluster resources; a separate compute handles it, returning reduced results to Redshift. Billing follows Athena: **per GB of S3 scanned** (so Parquet + partitions + compression drive cost here too).

> 🔍 **Deep Dive**: Spectrum vs. Athena confusion arises often. Both query S3 via SQL, share Glue Catalog, and bill on scan volume. Difference: "where you query." Athena is a standalone serverless query service (Presto/Trino); Spectrum is a Redshift cluster extension. Join Redshift internal tables with S3? Use Spectrum. Pure S3 only? Athena is simpler. Internally, Spectrum's S3 scan engine and Athena share similar technology. In SAP exams: "already running Redshift, join with S3 historical data" = Spectrum; "S3 only, no Redshift" = Athena.

## Federated Query and Zero-ETL — Two Approaches to Bringing Operational DB into Analytics

**Federated Query** lets Redshift **directly query Aurora/RDS PostgreSQL/MySQL in real-time** without ETL. Latest operational data joins Redshift analytical data with no pipeline. Redshift sends queries directly to the operational DB, fetching only needed data (predicate pushdown). Ideal for small recent operational data joining large analytical datasets. Downside: analytical workload hits the operational database, so large scans must be avoided.

**Zero-ETL Integration** (2023–2024) differs fundamentally. Aurora (MySQL/PostgreSQL) changes **CDC-replicate to Redshift in near-real-time** without manual ETL pipelines. Aurora data appears in Redshift within seconds to tens of seconds, operational and analytical databases fully separated while maintaining fresh analysis.

> 🎯 **Scenario**: "We need to analyze Aurora PostgreSQL OLTP data in Redshift nearly real-time. We don't want to build and maintain ETL pipelines, and we don't want analytical query load on the operational database. Best architecture?" Answer: **Aurora PostgreSQL Zero-ETL Integration with Redshift**. Zero-ETL CDC-replicates Aurora changes to Redshift automatically—no ETL code to write/maintain (fully managed), and operational DB sees no analytical query load (data replicates there). Federated Query skips ETL but queries the operational DB directly, violating "no load" requirement. DMS CDC is possible but requires pipeline management. Glue batch isn't real-time. Trap: "no ETL + real-time + zero operational load" = Zero-ETL.

> 📚 **Case Study**: A game company stored player behavior in Aurora MySQL; analytics wanted real-time dashboards. Initially, DMS CDC replicated to S3, Glue transformed, Redshift ingested—a 3-step pipeline with 15–30 minute latency and high operational overhead. Switching to Aurora MySQL Zero-ETL with Redshift cut latency to tens of seconds and eliminated pipeline maintenance. Caveat: Zero-ETL doesn't support transformations; complex cleanup must happen in Redshift via Materialized Views or subsequent queries post-arrival.

## WLM, Concurrency Scaling, SQA — Managing Concurrent Workloads

When multiple users submit queries simultaneously, resource contention arises. Redshift manages this via **WLM (Workload Management)**. Queries categorize into queues (ETL queue, BI queue, ad-hoc analysis queue), each allocated memory and concurrency slots for isolation. **Auto WLM** lets Redshift machine-learning-adjust these allocations automatically.

When a queue fills and queries wait, **Concurrency Scaling** automatically spins up temporary additional clusters to handle waiting queries. As load drops, extra clusters shut down. One free hour per day is credited (per hour your main cluster runs), then per-second billing beyond that. Particularly effective for read queries.

**SQA (Short Query Acceleration)** prioritizes short queries in dedicated space, preventing head-of-line blocking where long queries starve short ones.

> ⚠️ **Trap**: Concurrency Scaling isn't a silver bullet. Primarily for read queries, not writes (INSERT/UPDATE/COPY); certain query patterns (specific temp tables, certain functions) don't route to additional clusters. Exceed the free daily credit, and costs accumulate. If simultaneous query spikes are chronic, upsize the cluster itself or move to Serverless. In exams: "queue delays" signals Concurrency Scaling first; endemic parallelism asks for cluster upsizing review.

## Materialized Views and Result Caching — Pre-Calculate Repeated Aggregations

BI dashboards repeat the same aggregation queries (daily sales totals) endlessly. **Materialized Views (MV)** pre-compute aggregations and store results; when source data changes, they **incrementally refresh**. Dashboards read small MVs instead of heavy original aggregations, speeding response. Turn on Auto Refresh, and Redshift keeps MVs fresh in the background. MVs over Spectrum external tables also work, caching S3 lake aggregations in Redshift.

> 💡 **Related Theory**: Materialized Views are the database version of caching: "compute expensively once, reuse results." The core hard problem is **cache invalidation**—when source changes, how do you efficiently refresh the MV? Full recomputation is expensive, so Redshift does incremental refresh, reflecting only changed portions. This touches incremental view-maintenance theory from streaming systems. Contrast Athena (no MV, only Result Reuse for identical query results)—Redshift MVs are more powerful for repeated aggregations.

## Summary

Redshift's performance and cost depend not on the SQL engine but **physical data layout (distribution key, sort key, compression) and execution architecture (MPP, slices, compiled execution)**. RA3's compute-storage separation (RMS) enables scaling flexibility and Data Sharing. Serverless provides elasticity for variable workloads. Spectrum, Federated Query, and Zero-ETL extend the warehouse to data lakes and operational databases, completing the lakehouse.

SAP exam recurring mappings: (1) "large/small table join + network traffic" → fact=DISTKEY, dim=ALL. (2) "DC2 storage full + costs rising" → RA3 migration. (3) "variable/sporadic workload" → Serverless. (4) "S3 historical data joining Redshift" → Spectrum. (5) "ETL-less real-time operational DB analytics + zero load" → Zero-ETL. (6) "queue wait delays" → Concurrency Scaling. (7) "share data across clusters without copy" → Data Sharing. Next day covers Kinesis streaming ecosystem.

---

## 📝 연습 문제

**문제 1.** 10억 행의 sales fact 테이블과 1만 행의 product dimension 테이블을 자주 조인한다. 쿼리가 느리고 노드 간 네트워크 트래픽이 높다. 최적 분산 설계는?

A) 두 테이블 모두 DISTSTYLE EVEN
B) sales는 조인 키로 DISTKEY, product는 DISTSTYLE ALL
C) 두 테이블 모두 DISTSTYLE ALL
D) sales를 DISTSTYLE ALL, product를 DISTKEY

**정답: B**
해설: 큰 fact 테이블은 조인 키로 DISTKEY 분산하고, 작은 차원 테이블(1만 행)은 DISTSTYLE ALL로 모든 노드에 복제하면, 조인 시 차원 데이터가 이미 각 노드 로컬에 있어 노드 간 셔플(네트워크 트래픽)이 사라진다. A(둘 다 EVEN)는 조인 시 셔플이 발생. C(둘 다 ALL)는 10억 행 테이블을 모든 노드에 복제해 스토리지가 폭발하고 비현실적. D는 큰 테이블을 복제하므로 잘못됨. 함정: "큰 테이블 + 작은 테이블 + 네트워크 트래픽 높음"은 fact=KEY, dim=ALL이 정석.

---

**문제 2.** 분석 쿼리가 느린데, 모니터링 결과 일부 슬라이스의 CPU만 100%이고 나머지는 거의 놀고 있다. 분산 키는 `gender`(값 M/F 2개) 컬럼이다. 원인과 해결은?

A) 정렬 키 부재 → SORTKEY 추가
B) 데이터 스큐 → 카디널리티 높은 컬럼으로 DISTKEY 변경
C) 압축 부재 → 인코딩 적용
D) VACUUM 필요 → VACUUM 실행

**정답: B**
해설: gender처럼 카디널리티가 매우 낮은 컬럼을 분산 키로 쓰면 데이터가 두 슬라이스에만 몰려(데이터 스큐) MPP 병렬성이 무너진다. 일부 슬라이스만 과부하되고 나머지는 노는 전형적 증상이다. 카디널리티가 높고 고르게 분포된 컬럼(주문 ID, 사용자 ID 등)으로 DISTKEY를 바꿔야 균등 분산된다. A·C·D도 성능에 영향을 주지만 "일부 슬라이스만 과부하"라는 증상의 직접 원인은 분산 스큐다. 함정: "일부 노드/슬라이스만 CPU 높음"은 분산 스큐를 의심.

---

**문제 3.** DC2 클러스터를 운영 중인데 데이터가 3년간 누적되어 스토리지가 90% 찼다. 컴퓨팅은 충분한데 스토리지 때문에 노드를 추가하니 비용이 급증한다. 가장 적합한 해결책은?

A) DC2 노드를 계속 추가
B) RA3로 마이그레이션
C) Redshift Serverless로 전환
D) 오래된 데이터를 삭제

**정답: B**
해설: DC2는 컴퓨팅과 스토리지가 결합돼 있어 스토리지가 부족하면 불필요한 컴퓨팅까지 늘려야 한다. RA3는 데이터를 RMS(S3 기반)에 저장하고 로컬 SSD는 캐시로 써서 컴퓨팅과 스토리지를 독립적으로 스케일링한다. 노드 수는 실제 컴퓨팅 요구에만 맞추고 스토리지는 RMS가 탄력적으로 처리해 비용이 최적화된다. A는 비용 급증의 원인 그 자체. C는 가능하지만 꾸준한 프로덕션 워크로드엔 RA3 예약이 더 경제적일 수 있고, 질문의 핵심은 스토리지 분리다. D는 데이터 손실. 함정: "DC2 스토리지 부족 + 비용 증가"는 RA3 마이그레이션.

---

**문제 4.** 개발/테스트 환경에서 분석 쿼리가 하루 몇 번, 불규칙하게 실행된다. 사용하지 않을 때 컴퓨팅 비용을 0에 가깝게 하고 노드 관리도 하고 싶지 않다. 가장 적합한 옵션은?

A) DC2 단일 노드
B) RA3 예약 인스턴스
C) Redshift Serverless
D) Aurora

**정답: C**
해설: Redshift Serverless는 노드 개념 없이 워크로드에 따라 RPU가 자동 조정되고, 쿼리가 없으면 컴퓨팅 비용이 거의 0으로 떨어진다. 간헐적·예측 불가·개발 환경에 최적이다. A(DC2)·B(RA3 예약)는 쓰지 않아도 노드 비용이 계속 발생하고 노드 관리도 필요. D는 OLTP DB로 분석 웨어하우스가 아님. 함정: "가변/간헐/안 쓸 때 비용 0"은 Serverless, "꾸준한 대량 프로덕션"은 RA3 예약.

---

**문제 5.** 이미 Redshift RA3를 운영 중이고, S3 데이터 레이크에 저장된 5년치 과거 주문 데이터(Parquet)를 Redshift의 최근 주문 테이블과 조인해 분석해야 한다. 과거 데이터를 Redshift로 적재하고 싶지 않다. 가장 적합한 구성은?

A) COPY로 S3 데이터를 Redshift 내부 테이블에 적재
B) Redshift Spectrum + External Schema
C) Athena로 별도 쿼리 후 수동 결합
D) DMS로 S3를 Redshift에 복제

**정답: B**
해설: Redshift Spectrum은 S3 데이터를 적재(COPY)하지 않고 Glue Catalog의 외부 테이블을 참조하는 External Schema로 직접 쿼리하며, Redshift 내부 테이블과 한 쿼리에서 조인할 수 있다(레이크하우스). S3 스캔은 별도 Spectrum 노드 풀에서 처리되어 클러스터 자원을 거의 안 쓴다. A·D는 적재가 발생해 "적재하고 싶지 않다"는 조건 위반. C는 두 시스템 결과를 수동 결합해야 해 비효율. 함정: "Redshift 사용 중 + S3 과거 데이터와 조인 + 적재 회피"는 Spectrum.

---

**문제 6.** Aurora PostgreSQL OLTP 데이터를 거의 실시간으로 Redshift에서 분석해야 한다. ETL 파이프라인을 직접 구축·운영하고 싶지 않고, 운영 DB에 분석 쿼리 부하를 주고 싶지도 않다. 가장 적합한 구성은?

A) Redshift Federated Query
B) Aurora PostgreSQL Zero-ETL Integration with Redshift
C) DMS CDC로 S3 복제 후 Glue ETL
D) 매시간 Glue 배치 ETL

**정답: B**
해설: Zero-ETL Integration은 CDC로 Aurora 변경을 Redshift에 거의 실시간(수 초~수십 초) 자동 복제한다. ETL 코드를 작성/유지할 필요가 없고(완전 관리형), 데이터가 Redshift로 복제되므로 운영 DB에 분석 쿼리 부하가 가지 않는다. A(Federated Query)는 ETL은 없지만 운영 DB에 직접 쿼리해 부하를 주므로 조건 위반. C·D는 파이프라인을 직접 관리해야 하고 C는 실시간이지만 운영 부담, D는 실시간이 아님. 함정: "ETL 없이 + 실시간 + 운영 DB 부하 회피"는 Zero-ETL.

---

**문제 7.** 두 개의 분리된 RA3 클러스터(BI팀, 데이터 과학팀)가 같은 매출 데이터를 읽어야 한다. 데이터 복제 비용과 동기화 부담을 피하면서 각 팀의 쿼리가 서로의 성능에 영향을 주지 않게 격리하려면?

A) 한 클러스터를 두 팀이 공유
B) Redshift Data Sharing(프로듀서 → 컨슈머)
C) 각 팀이 데이터를 COPY로 복제
D) Redshift Spectrum으로 공유

**정답: B**
해설: RA3의 Data Sharing은 데이터가 RMS(S3 기반)에 있다는 점을 활용해 프로듀서 클러스터의 데이터를 복사 없이 컨슈머 클러스터가 읽기 공유하게 한다. 각 클러스터는 독립된 컴퓨팅을 가지므로 워크로드가 격리되고(서로 성능 영향 없음), 복제 비용·동기화 부담이 없다. 멀티 계정·멀티 리전도 지원. A는 워크로드 격리 실패(경합). C는 복제 비용·동기화 부담 발생. D(Spectrum)는 S3 외부 데이터용이지 Redshift 내부 테이블 공유 메커니즘이 아님. 함정: "복제 없이 다중 클러스터 공유 + 워크로드 격리"는 Data Sharing.

---

## 📌 Today's Summary

1. **MPP + Columnar + Compiled Execution** — Leader/Compute Nodes, Slice-level parallelism, shared-nothing
2. **DISTSTYLE** — KEY (co-location), ALL (small dim replicate), EVEN, AUTO. Large fact + small dim = KEY + ALL
3. **Data Skew** — Never DISTKEY on low-cardinality columns; some slices overload = skew suspect
4. **SORTKEY + Zone Map** — block skipping, time column COMPOUND standard, VACUUM/ANALYZE maintenance
5. **RA3 + RMS** — Compute/storage decoupled, independent scaling, Data Sharing foundation. DC2 storage full = RA3
6. **Serverless** — Variable/sporadic workloads, RPU auto-scale, zero cost idle. Steady bulk = RA3 reserved
7. **Spectrum** — Direct S3 query (separate pushdown pool), lakehouse, scan-volume billing
8. **Federated Query vs Zero-ETL** — First: real-time direct query (operational load). Second: CDC auto-replicate (no load)
9. **WLM/Concurrency Scaling/SQA/MV** — Workload isolation, queue auto-expand, short-query priority, aggregation cache
