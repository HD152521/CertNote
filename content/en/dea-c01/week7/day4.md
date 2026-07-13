# Day 4 - RDS/Aurora and Store Selection: OLTP, Zero-ETL, Workload-to-Store Decision

Today we view Amazon RDS/Aurora, relational OLTP stores, through an analytics data flow lens; cover **Zero-ETL (Aurora→Redshift)** integration; then organize a decision framework for "observe workload, choose store."

## RDS and Aurora Overview

- **Amazon RDS**: Managed relational DB for MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, etc. Automates patching, backup, recovery; traditional engine hosting.
- **Amazon Aurora**: MySQL/PostgreSQL-compatible cloud-native engine. Storage auto-replicates across 6 copies (3 AZ); compute/storage separated; storage auto-scales (max 128TiB). Offers higher performance and availability than RDS.

```text
Aurora: single write instance + multiple read replicas
        └── shared distributed storage (6 copies / 3 AZ) — minimal replication lag
```

> 💡 **Related Theory**: RDS/Aurora are fundamentally **row-based OLTP**. Normalized schema, transactions (ACID), small-volume/single-row processing are optimal; large-scale column aggregation and analysis belong on Redshift/Athena.

## OLTP vs OLAP

| Aspect | OLTP (RDS/Aurora/DynamoDB) | OLAP (Redshift/Athena) |
|--------|----------------------------|------------------------|
| Purpose | Transaction processing, operations | Analysis, aggregation, reporting |
| Storage | Row-based | Column-based |
| Queries | Small volume reads/writes, short latency | Large-scale scans/aggregations |
| Normalization | Normalized | Denormalized/star schema |

Traditional ETL moves OLTP data to OLAP store for analysis. But this ETL pipeline incurs operational, latency, and cost burden.

## Read Replicas and Analytics Workload Separation

Running heavy analysis queries on operational DB degrades transaction performance. **Read replica** isolates analytics/reporting load as first-pattern approach. But replicas are still row-based, inefficient for large aggregations.

## Zero-ETL: Aurora → Redshift

**Zero-ETL integration** replicates Aurora (and RDS MySQL/PostgreSQL, DynamoDB) data to Redshift **without pipeline construction**, in near real-time. AWS manages CDC, so no need to operate Glue jobs or DMS pipelines.

```text
Aurora MySQL/PostgreSQL
   │  (Zero-ETL integration — managed CDC, seconds-to-minutes lag)
   ▼
Amazon Redshift  ──►  analyze/aggregate replicated data immediately
```

- Operational transactions reflected in Redshift near real-time.
- Eliminates ETL code, scheduler, DMS instance operations burden.
- Analytics on Redshift, operations on Aurora → workload isolation.
- Similarly, **DynamoDB → Redshift Zero-ETL**, **DynamoDB → OpenSearch Zero-ETL** also available.

> 💡 **Related Theory**: Zero-ETL "eliminates ETL" less so than **AWS assumes managed CDC responsibility**. Reduces operational burden of running DMS/Glue, connecting operational OLTP and analytics OLAP with low latency.

## DMS Comparison

- **AWS DMS (Database Migration Service)**: Migration and ongoing replication (CDC) between heterogeneous DBs. Flexible source/target combinations (e.g., Oracle→Aurora). Must provision and operate instances.
- **Zero-ETL**: Limited to specific sources (Aurora/RDS/DynamoDB) → Redshift/OpenSearch; fully managed, codeless.

Use DMS for migration or broad source combinations; Zero-ETL for Aurora→Redshift analytics connection.

## Workload → Store Decision Framework

Define access patterns first, then map to stores.

```text
Normalized transactions, joins, ACID, small rows ......... RDS / Aurora
Key-based fast lookup, massive concurrency, serverless .... DynamoDB
Large aggregations, BI, complex joins (structured DW) ...... Redshift
Ad-hoc SQL on S3 data, serverless, intermittent ........... Athena
Full-text search, log analysis, observability ............. OpenSearch
In-memory cache, ultra-low latency ......................... ElastiCache
Graph relationship exploration ............................ Neptune
Time series (IoT metrics) ................................ Timestream
```

Selection criteria summary:
- **Access pattern**: Key lookup vs. aggregation vs. search vs. relationship.
- **Data shape**: Structured/semi-structured/unstructured.
- **Latency and concurrency**: ms OLTP vs. analytics throughput.
- **Operations model**: Serverless preference favors Athena/DynamoDB on-demand.
- **Cost model**: Scan volume (Athena) vs. provisioning (Redshift) vs. throughput (DynamoDB).

## Key Takeaways

- RDS/Aurora row-based OLTP. Aurora separates compute/storage, 6-copy auto-replication for high availability and performance.
- Isolate analytics load via read replicas, or advance further with Zero-ETL for near real-time Redshift replication.
- Zero-ETL = AWS-managed CDC (codeless). Broad migration use DMS.
- Store selection via access pattern, data shape, latency, operations/cost model.

## 📝 연습 문제

**문제 1.** 다음 중 행 기반 OLTP에 최적화되어 정규화된 트랜잭션·ACID 워크로드에 가장 적합한 스토어는?

A) Amazon Redshift  
B) Amazon Athena  
C) Amazon Aurora  
D) Amazon OpenSearch  

**정답: C**  
해설: Aurora(및 RDS)는 행 기반 관계형 OLTP로 정규화 스키마·트랜잭션·소량 행 처리에 최적입니다. Redshift는 컬럼형 OLAP, Athena는 S3 서버리스 분석, OpenSearch는 검색·로그 분석용입니다.

---

**문제 2.** Aurora의 데이터를 별도 ETL 파이프라인(DMS/Glue) 구축 없이 Redshift로 거의 실시간 복제해 분석하려면 무엇을 사용하는가?

A) 제로 ETL(Zero-ETL) 통합  
B) DynamoDB Streams  
C) Redshift Spectrum  
D) Athena 페더레이션 쿼리  

**정답: A**  
해설: 제로 ETL 통합은 AWS가 CDC 복제를 관리형으로 수행해 Aurora 데이터를 코드리스로 Redshift에 거의 실시간 반영합니다. Streams는 DynamoDB 변경 캡처, Spectrum은 S3 외부 테이블 쿼리, 페더레이션은 Athena의 이종 소스 조인입니다.

---

**문제 3.** 운영 Aurora 인스턴스에 무거운 BI 리포팅 쿼리가 트랜잭션 성능을 저하시킨다. 가장 먼저 고려할 1차 완화책은?

A) 모든 테이블을 비정규화한다  
B) 읽기 복제본(read replica)으로 분석 부하를 분리한다  
C) DynamoDB로 마이그레이션한다  
D) 정렬 키를 추가한다  

**정답: B**  
해설: 읽기 복제본으로 분석·리포팅 쿼리를 분리하면 쓰기 트랜잭션 성능 저하를 막을 수 있는 1차 패턴입니다. 대규모 집계가 지속되면 Redshift로 옮기는 것이 다음 단계입니다. 비정규화·DynamoDB 이전·정렬 키는 부적절하거나 관계없습니다.

---

**문제 4.** Oracle DB를 Aurora PostgreSQL로 마이그레이션하면서 마이그레이션 중 지속적 변경 복제(CDC)가 필요하다. 가장 적절한 서비스는?

A) 제로 ETL 통합  
B) AWS DMS(Database Migration Service)  
C) Athena CTAS  
D) Kinesis Data Firehose  

**정답: B**  
해설: DMS는 이종 DB 간 마이그레이션과 지속 복제(CDC)를 지원하며 Oracle→Aurora 같은 폭넓은 소스/타깃 조합을 다룹니다. 제로 ETL은 Aurora/RDS/DynamoDB→Redshift/OpenSearch에 한정되고, CTAS·Firehose는 마이그레이션 용도가 아닙니다.

---

**문제 5.** "사용자 ID 기반 한 자릿수 ms 조회, 예측 불가한 대규모 동시성, 서버리스 운영"이 핵심 요구일 때 가장 적합한 스토어는?

A) Amazon Redshift  
B) Amazon Aurora  
C) Amazon DynamoDB  
D) Amazon Athena  

**정답: C**  
해설: 키 기반 초저지연 조회, 대규모 동시성, 온디맨드 서버리스 운영은 DynamoDB의 핵심 강점입니다. Redshift/Athena는 분석 OLAP, Aurora는 관계형 트랜잭션 워크로드에 적합합니다.

---
