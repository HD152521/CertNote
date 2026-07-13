# Day 5 - Week 6 Comprehensive Review: Data Lake Recap

This week covered S3-based data lake layout, Lake Formation permissions, open table formats, and storage cost optimization. Today we tie four topics together in a single data lake operations scenario.

## 1. S3 Data Lake Layout (Day 1)

- **Zone separation**: raw (immutable original) → clean (validated, normalized) → curated (business aggregations). Isolate permissions and reprocessing per tier.
- **Partitioning**: Hive-style `key=value` (usually date hierarchy) enables partition pruning. Cardinality must be appropriate; watch for small files problem (128MB–1GB recommended).
- **Partition projection**: For many partitions, compute using rules rather than catalog registration to bypass bottlenecks.
- **Format**: Parquet + compression (Snappy/ZSTD) reduces scan volume and costs.

> 💡 **Related Theory**: Separation of compute and storage (multiple engines sharing S3) and schema-on-read are fundamental data lake characteristics.

## 2. AWS Lake Formation (Day 2)

- **Register data locations** → credential vending centralizes access.
- **Permission models**: Named resources vs. LF-Tags (TBAC). Tag-based is more scalable at large scale.
- **Fine-grained security**: Column / row (data filters) / cell level.
- **Blueprints**: Auto-generate ingestion workflows (crawlers + jobs + triggers).
- **Both** IAM and Lake Formation permissions required.

## 3. Open Table Formats (Day 3)

- Transaction metadata over Parquet provides **ACID, time travel, row-level DML**.
- **Iceberg** (schema/partition evolution, broad AWS support), **Hudi** (upsert/incremental CDC), **Delta** (Spark integration).
- Athena v3 / Glue / EMR integration, Glue Data Catalog sharing.
- Compaction and snapshot expiration maintenance, MoR/CoW tradeoffs.

## 4. S3 Storage Management (Day 4)

- Choose storage class by access frequency; consider IA/Glacier retrieval costs and minimum retention periods.
- Lifecycle transitions and expirations, clean up incomplete multiparts and noncurrent versions.
- Intelligent-Tiering (irregular patterns) vs. lifecycle transitions (predictable patterns).
- Storage Lens/Inventory visibility, compression and compaction are fundamental savings.

## Integrated Scenario: Order Data Lake

Requirement: Ingest RDS order DB into a data lake, show analysts PII-free columns and only their region rows, respond to GDPR deletion requests, and optimize costs.

```text
[RDS] --(Lake Formation Incremental DB Blueprint)--> s3://lake-raw/orders/dt=.../
   --(Glue ETL: validate, Parquet conversion)--> s3://lake-clean/orders/ (Iceberg table)
   --(Glue: aggregate)--> s3://lake-curated/revenue/ (consumed by Athena/QuickSight)
```

Design decisions:
1. **Ingestion**: Use Lake Formation Incremental database blueprint to auto-generate incremental ingestion workflow.
2. **Table format**: Configure clean zone as **Iceberg** table → supports GDPR DELETE, MERGE upserts, time travel.
3. **Permissions**: In Lake Formation, exclude `pii` columns from GRANT, use **data filters** to expose only `region = analyst's region` rows.
4. **Costs**: Transition raw zone via lifecycle: 30 days → IA, 90 days → Glacier + clean up incomplete uploads. Clean/curated use Standard or Intelligent-Tiering.

```sql
-- Handle GDPR deletion request (Iceberg on Athena)
DELETE FROM lake_clean.orders WHERE customer_id = 'GDPR-REQ-2026-001';

-- Analyst permissions: exclude PII, row filter via data filter
-- (column exclusion GRANT)
GRANT SELECT (order_id, region, amount, dt)
ON TABLE lake_clean.orders TO 'arn:aws:iam::111122223333:role/RegionAnalyst';
```

> 💡 **Related Theory**: Data lake design requires balancing four dimensions: ingestion (blueprints) → table format (governance, DML) → permissions (Lake Formation) → costs (storage management). Optimizing only one dimension creates problems in others.

## Exam Focus Points

- Distinguish raw/clean/curated zone purposes and storage class mappings.
- Partition pruning vs. partition projection, small files problem causes and solutions.
- Lake Formation: register/credential vending, LF-Tags (TBAC), data filters (row-level), IAM requirement.
- Open table format problems solved (ACID/time-travel/row DML) and Iceberg/Hudi/Delta strengths.
- Retrieval costs, minimum retention periods, Intelligent-Tiering vs. lifecycle selection criteria.

## 📝 연습 문제

**문제 1.** RDS 주문 데이터를 증분으로 데이터레이크에 적재하고, 이후 행 수준 삭제(GDPR)와 MERGE 업서트가 가능하도록 clean 존을 구성하려 한다. 가장 적합한 조합은?

A) Lake Formation Database snapshot 블루프린트 + CSV 테이블  
B) Lake Formation Incremental database 블루프린트 + Iceberg 테이블  
C) 수동 S3 업로드 + 일반 Hive Parquet 테이블  
D) S3 Replication + One Zone-IA  

**정답: B**  
해설: 증분 적재는 Incremental database 블루프린트가, 행 수준 DELETE/MERGE는 Iceberg 같은 오픈 테이블 포맷이 담당합니다. snapshot+CSV나 일반 Hive Parquet은 행 수준 DML이 어렵고, Replication/One Zone-IA는 요구사항과 무관합니다.

---

**문제 2.** 분석가에게 PII 컬럼을 숨기고 자기 지역 행만 노출하려 한다. Lake Formation에서 사용할 기능 조합으로 옳은 것은?

A) 컬럼 제외/선택 GRANT + 행 수준 데이터 필터  
B) S3 버킷 정책 + One Zone-IA  
C) 파티션 프로젝션 + 수명주기 정책  
D) Storage Lens + Object Lock  

**정답: A**  
해설: 컬럼 보안은 GRANT의 컬럼 선택/제외로, 행 보안은 데이터 필터(RowFilter)로 구현합니다. 나머지는 비용·가시성·스토리지 기능으로 세분화 접근 제어와 무관합니다.

---

**문제 3.** 데이터레이크에서 자주 읽히는 curated 존과 거의 읽지 않는 raw 존의 스토리지 전략으로 가장 적절한 것은?

A) 둘 다 Glacier Deep Archive  
B) curated는 Standard, raw는 수명주기로 IA→Glacier 전환  
C) curated는 One Zone-IA, raw는 Standard  
D) 둘 다 Standard-IA 고정  

**정답: B**  
해설: 자주 읽는 curated는 검색 비용이 없는 Standard가, 드물게 접근하는 raw는 수명주기로 IA→Glacier 전환이 비용 효율적입니다. 자주 읽는 데이터를 IA/Glacier에 두면 검색 비용이, 안 읽는 데이터를 Standard에 두면 저장 비용이 낭비됩니다.

---

**문제 4.** 다음 중 데이터레이크의 "schema-on-read" 특성을 가장 정확히 설명한 것은?

A) 데이터를 적재하기 전에 엄격한 스키마를 강제한다  
B) 스키마를 절대 변경할 수 없다  
C) 컬럼형 포맷만 저장할 수 있다  
D) 데이터를 원본 그대로 저장하고 쿼리 시점에 스키마를 적용한다  

**정답: D**  
해설: schema-on-read는 데이터를 원본 형태로 저장한 뒤 읽을 때 스키마를 부여하는 방식으로, 정형/반정형/비정형을 유연하게 수용합니다. 적재 전 스키마 강제는 schema-on-write(데이터웨어하우스)이며 나머지는 사실과 다릅니다.

---

**문제 5.** 데이터레이크 테이블의 파티션이 수만 개로 늘어 Athena 쿼리 시 Glue Data Catalog 조회가 병목이 되었다. 카탈로그에 파티션을 일일이 등록하지 않고 해결하는 방법은?

A) 파티션 프로젝션 활성화  
B) 모든 파티션을 단일 파일로 병합  
C) 테이블을 CSV로 변환  
D) 버킷 버전 관리 활성화  

**정답: A**  
해설: 파티션 프로젝션은 테이블 속성의 범위·포맷 규칙으로 파티션을 계산해 카탈로그 등록·조회 병목을 제거합니다. 단일 파일 병합은 프루닝을 해치고, CSV 변환·버전 관리는 파티션 병목과 무관합니다.

---
