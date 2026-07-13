# Day 5 - Week 7 Comprehensive Review: Analytics Stores Recap

This week covered analytics data stores (Redshift, Athena, DynamoDB, RDS/Aurora) and workload-based store selection. Today we integrate core points and check "workload-to-store mapping" and comparison points frequent on exams.

## Analytics Stores at a Glance

```text
Service       Model         Billing             Optimal Workload
Redshift      columnar MPP  provisioning/RA3    large aggregation, complex join DW
Redshift      external S3   scan volume         query S3 large history without load
 Spectrum
Athena        serverless    scan volume (TB)    S3 ad-hoc, intermittent SQL
DynamoDB      NoSQL KV      throughput/on-demand key-based ms lookup, high concurrency
RDS/Aurora    row OLTP      instance            normalized transactions, ACID
```

> 💡 **Related Theory**: Columnar (Redshift/Parquet) excels at "many rows, few columns aggregation"; row-based (RDS/Aurora) at "all columns of single row transaction." Read pattern is #1 store selection criterion.

## Redshift Recap Points

- **Distribution key (DISTKEY)**: KEY (co-located join), ALL (small dimension replica), EVEN (default). Choose even-distribution column avoiding skew.
- **Sort key (SORTKEY)**: Zone map skips blocks on range filter. COMPOUND (first column priority) vs. INTERLEAVED (multi-axis).
- **RA3**: Separate compute/storage, RMS (S3) auto-scale.
- **Spectrum**: Query S3 external tables directly (billed on scan volume).
- **Auto WLM + concurrency scaling**: Elastic response to read spike.

```sql
CREATE TABLE fact_sales (sale_date DATE, region VARCHAR(20), amount DECIMAL(12,2))
DISTKEY (region)
COMPOUND SORTKEY (sale_date);
```

## Athena Recap Points

- Serverless + **scan-volume billing** → less scan = cheaper and faster.
- **Three-pronged savings**: Partitioning (+projection), Parquet/compression, SELECT needed columns only.
- **CTAS/INSERT INTO**: Lightweight ETL format conversion, partitioning.
- **Federated queries**: Join RDS, DynamoDB, etc. without ETL.
- **Workgroup**: Per-query scan limit, cost, isolation.

## DynamoDB Recap (Analytics Perspective)

- PK hash determines partition → avoid hot partition (even key, write sharding).
- **GSI** (new query axis, async) vs **LSI** (same PK different SK, define at creation).
- Bulk analytics not directly on DynamoDB; move via Streams/Kinesis/S3 export to analytics store (CQRS pattern).

```text
DynamoDB (OLTP) → Streams/Export → S3 + Athena / Redshift (OLAP)
```

## RDS/Aurora & Store Selection Recap

- Aurora: separate compute/storage, 6 copies/3AZ, read replica isolates analytics load.
- **Zero-ETL (Aurora/RDS/DynamoDB → Redshift)**: Managed CDC, codeless near real-time replication.
- **DMS**: Heterogeneous DB migration and CDC (instance operation).

> 💡 **Related Theory**: "Operations (OLTP) and analytics (OLAP) on different engines" is the foundational data engineering principle. ETL (Glue/DMS) or Zero-ETL connect them; recent trend reduces pipeline operational burden via managed Zero-ETL.

## Workload → Store Decision (Exam Frequent)

```text
Normalized, transactions, ACID ................ RDS / Aurora
Key-based ms lookup, high concurrency, serverless ... DynamoDB
Large aggregation, complex join structured DW ... Redshift
Query S3 large history without load ........... Redshift Spectrum
S3 ad-hoc, intermittent serverless SQL ....... Athena
Operational DB → real-time analytics connection ... Zero-ETL (→ Redshift)
Heterogeneous DB migration, CDC .............. DMS
```

## Exam Pitfalls

- "Small dimension table join optimization" → **DISTSTYLE ALL** (never ALL on large table).
- "Athena cost reduction" → all scan-reducing methods (partition/Parquet/column projection).
- "Partition count bottleneck" → **partition projection**.
- "DynamoDB bulk aggregation analytics" → not directly; **Streams/export to OLAP store**.
- "Aurora→Redshift real-time, no ETL operations burden" → **Zero-ETL**.
- "Oracle→Aurora migration + CDC" → **DMS**.

## Key Takeaways

- Read pattern (column aggregation vs. row transaction vs. key lookup vs. search) is #1 store choice criterion.
- Redshift optimizes bulk analytics via distribution/sort keys, RA3, Spectrum, WLM.
- Athena billing on scan volume makes partition, format, column projection directly impact cost.
- DynamoDB analytics via exporting changes to analytics store (CQRS pattern).
- Operations↔Analytics connection via Zero-ETL (managed CDC) or DMS.

## 📝 연습 문제

**문제 1.** "S3에 쌓인 데이터를 인프라 프로비저닝 없이 간헐적으로 표준 SQL로 분석"하려는 요구에 가장 적합한 서비스는?

A) Amazon Redshift (프로비저닝 클러스터)  
B) Amazon Athena  
C) Amazon Aurora  
D) Amazon DynamoDB  

**정답: B**  
해설: Athena는 서버리스로 S3 데이터를 SQL로 직접 쿼리하고 스캔량으로 과금되어, 간헐적·애드혹 분석에 인프라 운영 없이 적합합니다. 프로비저닝 Redshift는 상시 클러스터, Aurora는 OLTP, DynamoDB는 키 조회용입니다.

---

**문제 2.** Redshift에서 두 대형 팩트/차원 테이블을 동일 키로 자주 조인할 때 재분배를 피하는 최적 설정은?

A) 두 테이블 모두 동일 컬럼을 DISTKEY로 지정  
B) 두 테이블 모두 DISTSTYLE EVEN  
C) 두 테이블 모두 INTERLEAVED SORTKEY  
D) 한 테이블만 DISTSTYLE ALL (둘 다 대형)  

**정답: A**  
해설: 동일 컬럼을 DISTKEY로 지정하면 같은 키 값이 같은 슬라이스에 배치되어 재분배 없는 co-located join이 됩니다. EVEN은 재분배, INTERLEAVED는 정렬 다축이며 분산과 무관하고, 대형 테이블에 ALL은 비용이 과합니다.

---

**문제 3.** DynamoDB에 저장된 운영 데이터를 대규모로 집계·리포팅해야 한다. 권장 접근은?

A) DynamoDB에서 풀 스캔으로 직접 집계  
B) GSI를 수십 개 만들어 모든 집계를 인덱스로 처리  
C) Streams/S3 export로 S3·Redshift에 옮겨 Athena/Redshift로 분석  
D) LSI를 추가해 집계 전용 축을 만든다  

**정답: C**  
해설: DynamoDB는 대량 집계·애드혹 분석에 부적합하므로, Streams나 S3 export로 변경분을 분석 스토어(S3+Athena/Redshift)로 옮겨 분석하는 CQRS형 분리가 정석입니다. 풀 스캔·과도한 인덱스는 비용·성능 면에서 부적절합니다.

---

**문제 4.** Aurora의 운영 데이터를 ETL 파이프라인 운영 부담 없이 Redshift에서 거의 실시간으로 분석하려면?

A) AWS DMS로 매시간 배치 마이그레이션  
B) 제로 ETL(Zero-ETL) 통합  
C) Athena 페더레이션 쿼리  
D) Redshift Spectrum 외부 스키마  

**정답: B**  
해설: 제로 ETL 통합은 AWS 관리형 CDC로 Aurora 데이터를 코드리스·거의 실시간으로 Redshift에 복제합니다. DMS는 인스턴스 운영 부담이 있고, 페더레이션·Spectrum은 적재 없이 외부를 쿼리하는 방식으로 요구와 다릅니다.

---

**문제 5.** Athena에서 파티션이 수만 개로 늘어 카탈로그 조회와 MSCK REPAIR가 병목이 될 때 가장 적절한 해결책은?

A) 동시성 스케일링 활성화  
B) DISTSTYLE ALL 적용  
C) 파티션 프로젝션(Partition Projection)  
D) 모든 파일을 CSV로 변환  

**정답: C**  
해설: 파티션 프로젝션은 파티션을 카탈로그에 등록하지 않고 범위·포맷 규칙으로 계산해 대량 파티션 환경의 조회 병목을 제거합니다. 동시성 스케일링·DISTSTYLE은 Redshift 개념이고, CSV 전환은 스캔량을 늘려 역효과입니다.

---
