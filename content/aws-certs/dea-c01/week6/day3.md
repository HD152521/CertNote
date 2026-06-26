# Day 3 - 오픈 테이블 포맷: Iceberg, Hudi, Delta Lake

전통적 데이터레이크(Parquet + Hive 메타스토어)는 ACID 트랜잭션, 행 수준 업데이트, 시간 여행이 어렵습니다. 오픈 테이블 포맷(Apache Iceberg, Apache Hudi, Delta Lake)은 S3 위의 Parquet 파일에 트랜잭션 계층을 추가해 이를 해결합니다. 오늘은 세 포맷과 AWS 연동을 다룹니다.

## 왜 오픈 테이블 포맷이 필요한가

Hive 스타일 테이블은 "디렉터리 = 테이블"로 보고 파일 목록을 기준으로 데이터를 읽습니다. 이 방식의 한계:
- 동시 쓰기 중 일관성 보장이 어려움(원자성 부족).
- 단일 레코드 UPDATE/DELETE가 매우 비쌈(파일 전체 재작성).
- 스키마 변경, 과거 시점 조회가 불편.
- GDPR "삭제 권리" 같은 행 단위 삭제 대응이 어려움.

오픈 테이블 포맷은 **메타데이터(매니페스트/트랜잭션 로그)**로 어떤 파일이 현재 테이블 상태인지 추적해 ACID를 제공합니다.

> 💡 **관련 이론**: 오픈 테이블 포맷의 ACID는 메타데이터 스냅샷 기반입니다. 새 스냅샷을 원자적으로 커밋(commit)하면 읽기는 항상 일관된 스냅샷을 보며, 이것이 시간 여행(time travel)의 기반입니다.

## 세 포맷 비교

| 포맷 | 메타데이터 방식 | 강점 | AWS 친화도 |
|------|----------------|------|-----------|
| Apache Iceberg | 매니페스트 + 스냅샷 | 스키마/파티션 진화, 숨은 파티셔닝 | Athena/Glue/EMR 1급 지원 |
| Apache Hudi | 타임라인 + 인덱스 | 업서트·증분 쿼리(CDC) 최적화 | EMR/Glue 지원 |
| Delta Lake | 트랜잭션 로그(_delta_log) | Spark 생태계 통합 | EMR/Glue 지원 |

- **Iceberg**: 숨은 파티셔닝(hidden partitioning)으로 쿼리에서 파티션 컬럼을 몰라도 프루닝이 동작. 스키마·파티션 진화가 자유로움. AWS가 가장 폭넓게 지원.
- **Hudi**: Copy-on-Write(CoW)와 Merge-on-Read(MoR) 두 모드. 업서트와 증분 쿼리에 강해 CDC 적재에 적합.
- **Delta**: Databricks 기원, Spark에서 강력. `_delta_log`의 JSON/Parquet 체크포인트로 트랜잭션 관리.

## ACID, 시간 여행, 행 수준 업데이트

세 포맷 모두 핵심 기능을 제공합니다.

```sql
-- Athena (Iceberg): 행 수준 UPDATE / DELETE
UPDATE sales.orders SET status = 'cancelled' WHERE order_id = 1001;
DELETE FROM sales.orders WHERE customer_id = 'GDPR-REQ-42';

-- MERGE (업서트): 소스 변경분을 타깃에 반영
MERGE INTO sales.orders AS t
USING staging.order_changes AS s
ON t.order_id = s.order_id
WHEN MATCHED THEN UPDATE SET status = s.status
WHEN NOT MATCHED THEN INSERT (order_id, status) VALUES (s.order_id, s.status);
```

```sql
-- 시간 여행: 과거 스냅샷/타임스탬프 시점 조회 (Iceberg on Athena)
SELECT * FROM sales.orders FOR TIMESTAMP AS OF TIMESTAMP '2026-06-20 00:00:00';
SELECT * FROM sales.orders FOR VERSION AS OF 8623491172120013573;
```

행 수준 삭제는 GDPR/CCPA의 삭제 요청 대응에 핵심입니다. 전통 Parquet 테이블에서는 전체 파티션 재작성이 필요했지만, 테이블 포맷은 효율적인 삭제 파일/리라이트로 처리합니다.

> 💡 **관련 이론**: Merge-on-Read는 삭제·변경을 별도 delete file로 기록하고 읽을 때 병합합니다. 쓰기는 빠르지만 읽기 비용이 늘어, 주기적 compaction으로 균형을 맞춥니다. Copy-on-Write는 쓰기 시 즉시 재작성해 읽기는 빠릅니다.

## AWS 연동

### Athena
Athena 엔진 v3는 Iceberg 테이블에 대해 `CREATE TABLE`, DML(`INSERT/UPDATE/DELETE/MERGE`), 시간 여행을 SQL로 지원합니다.

```sql
CREATE TABLE sales.orders (
  order_id bigint, customer_id string, status string, amount double, dt date
)
PARTITIONED BY (month(dt))           -- Iceberg 숨은 파티셔닝
LOCATION 's3://acme-datalake-curated/iceberg/orders/'
TBLPROPERTIES ('table_type' = 'ICEBERG');
```

### Glue & EMR
- **Glue 4.0/5.0**: Iceberg, Hudi, Delta 커넥터를 내장 지원. Spark 잡에서 테이블 포맷 DataFrame을 읽고 씀.
- **EMR**: Spark/Flink/Trino에서 세 포맷 모두 사용. 대규모 배치 업서트·compaction 잡에 적합.

```python
# Glue Spark에서 Iceberg 테이블 쓰기 예시
spark.sql("""
  MERGE INTO glue_catalog.sales.orders t
  USING updates s ON t.order_id = s.order_id
  WHEN MATCHED THEN UPDATE SET *
  WHEN NOT MATCHED THEN INSERT *
""")
```

### 카탈로그
세 포맷 모두 Glue Data Catalog를 메타스토어로 사용할 수 있어, Athena·Redshift Spectrum·EMR이 동일 테이블을 공유합니다.

## 유지보수: Compaction과 스냅샷 만료

오픈 테이블 포맷은 운영이 필요합니다.
- **Compaction**: 작은 파일과 delete file을 병합해 읽기 성능 회복.
- **스냅샷 만료(expire snapshots)**: 오래된 스냅샷·고아 파일 정리로 스토리지 비용 절감(단, 시간 여행 가능 범위가 줄어듦).

```sql
-- Athena Iceberg 테이블 최적화 및 정리
OPTIMIZE sales.orders REWRITE DATA USING BIN_PACK;
VACUUM sales.orders;
```

## 핵심 정리

- 오픈 테이블 포맷은 S3 Parquet 위에 트랜잭션 메타데이터를 더해 ACID·시간 여행·행 수준 DML 제공.
- Iceberg는 스키마/파티션 진화와 AWS 폭넓은 지원, Hudi는 업서트/증분(CDC), Delta는 Spark 통합에 강점.
- Athena v3·Glue·EMR이 세 포맷 연동, Glue Data Catalog 공유.
- MoR/CoW 트레이드오프와 compaction·스냅샷 만료 운영이 중요.

## 📝 연습 문제

**문제 1.** 전통적 Hive 스타일 Parquet 테이블 대비 오픈 테이블 포맷(Iceberg/Hudi/Delta)이 제공하는 핵심 기능이 아닌 것은?

A) ACID 트랜잭션  
B) 행 수준 UPDATE/DELETE  
C) 과거 시점 시간 여행 조회  
D) 컬럼형 압축 자체를 처음 도입  

**정답: D**  
해설: 컬럼형 압축은 Parquet/ORC가 이미 제공하던 기능으로 테이블 포맷의 신규 기능이 아닙니다. ACID, 행 수준 DML, 시간 여행이 오픈 테이블 포맷이 추가한 핵심 가치입니다.

---

**문제 2.** GDPR 삭제 요청에 따라 특정 고객의 행만 효율적으로 삭제해야 한다. 가장 적합한 접근은?

A) 전체 테이블을 매번 CSV로 다시 내보낸다  
B) Iceberg/Hudi/Delta 테이블에서 DELETE 문으로 행 수준 삭제한다  
C) S3 버킷 버전 관리를 끈다  
D) Glue 크롤러를 재실행한다  

**정답: B**  
해설: 오픈 테이블 포맷은 행 수준 DELETE를 지원해 파티션 전체 재작성 없이 특정 행을 효율적으로 삭제하므로 GDPR/CCPA 삭제 요청에 적합합니다. 나머지는 행 단위 삭제를 해결하지 못합니다.

---

**문제 3.** 업서트와 증분(CDC) 쿼리에 특화되어 있고 Copy-on-Write/Merge-on-Read 모드를 제공하는 테이블 포맷은?

A) Apache Hudi  
B) CSV  
C) Avro  
D) ORC  

**정답: A**  
해설: Apache Hudi는 CoW/MoR 모드와 인덱스 기반 업서트·증분 쿼리에 강점이 있어 CDC 적재에 적합합니다. CSV/Avro/ORC는 파일 포맷이지 트랜잭션형 테이블 포맷이 아닙니다.

---

**문제 4.** Athena 엔진 v3에서 Iceberg 테이블을 특정 과거 타임스탬프 시점으로 조회하는 올바른 구문은?

A) `SELECT * FROM orders ROLLBACK TO ...`  
B) `SELECT * FROM orders FOR TIMESTAMP AS OF TIMESTAMP '2026-06-20 00:00:00'`  
C) `SELECT * FROM orders SNAPSHOT NOW()`  
D) `SELECT * FROM orders WHERE _version < 5`  

**정답: B**  
해설: Athena의 시간 여행 구문은 `FOR TIMESTAMP AS OF` 또는 `FOR VERSION AS OF`입니다. 나머지 구문은 Athena Iceberg 시간 여행 문법이 아닙니다.

---

**문제 5.** Merge-on-Read(MoR) 테이블의 읽기 성능이 시간이 지나며 저하되는 주된 이유와 해결책으로 옳은 것은?

A) 스냅샷이 즉시 삭제되므로 — 버전 관리 비활성화  
B) delete/log 파일이 누적되어 읽기 시 병합 비용 증가 — 주기적 compaction  
C) 파티션 키가 자동 변경되므로 — 크롤러 재실행  
D) 압축이 풀리므로 — 암호화 해제  

**정답: B**  
해설: MoR은 변경·삭제를 별도 delete/log 파일로 기록하고 읽을 때 병합하므로, 파일이 쌓이면 읽기 비용이 증가합니다. 주기적 compaction(OPTIMIZE)으로 병합해 성능을 회복합니다. 나머지는 원인·해결로 부적절합니다.

---
