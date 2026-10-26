# Day 3 - 오픈 테이블 포맷: Iceberg, Hudi, Delta Lake

## 📌 핵심 정리

- 오픈 테이블 포맷은 S3 의 Parquet 파일 위에 **"어떤 파일이 지금 테이블인가"를 기록하는 메타데이터 계층**을 얹어 ACID, 행 단위 UPDATE/DELETE/MERGE, 시간 여행을 제공한다.
- **Iceberg** 는 스키마·파티션 진화와 숨은 파티셔닝, **Hudi** 는 업서트와 증분 쿼리(CDC), **Delta Lake** 는 Spark 생태계 통합이 강점이다.
- Athena 는 **Iceberg 만 읽기·쓰기**를 지원하고 Hudi·Delta Lake 는 읽기 전용이다. 세 포맷 모두 쓰려면 Glue(3.0 이상)나 EMR 의 Spark 를 쓴다.
- **Copy-on-Write** 는 쓸 때 파일을 다시 써서 읽기가 빠르고, **Merge-on-Read** 는 변경분을 따로 적어 쓰기가 빠른 대신 읽을 때 합친다. Athena 의 Iceberg DML 은 항상 Merge-on-Read 다.
- 테이블 포맷은 **유지보수가 필수**다. 컴팩션(`OPTIMIZE`)으로 읽기 성능을, 스냅샷 만료(`VACUUM`)로 스토리지 비용을 관리한다. 삭제한 행의 데이터는 스냅샷이 만료될 때까지 S3 에 남는다.

## 왜 오픈 테이블 포맷이 필요한가

전통적 데이터 레이크(Parquet + Hive 메타스토어)는 "디렉터리 = 테이블"이다. 엔진은 파티션 경로를 나열해 거기 있는 파일을 전부 테이블의 내용으로 본다. 이 단순함이 한계를 만든다.

- **원자성이 없다.** 잡이 파일 10개 중 6개를 쓰고 죽으면, 그 6개가 그대로 테이블에 보인다. 쓰는 도중에 읽는 쿼리는 절반만 본다.
- **행 하나를 고치려면 파일을 통째로 다시 써야 한다.** Parquet 은 수정할 수 없는 파일이다. 게다가 다시 쓰는 동안의 일관성을 보장할 방법이 없다.
- **스키마·파티션 변경이 위험하다.** 컬럼 이름을 바꾸거나 파티션 체계를 바꾸면 기존 파일과 어긋난다.
- **과거 시점을 볼 수 없다.** 덮어쓰면 이전 상태는 사라진다.
- **GDPR "삭제 권리" 대응이 어렵다.** 특정 고객의 행만 지우려면 해당 파티션 전체를 재작성해야 한다.

오픈 테이블 포맷은 발상을 뒤집는다. **경로를 나열하지 않고, 메타데이터가 가리키는 파일만 테이블로 본다.** 새 파일을 다 쓴 뒤 메타데이터 포인터를 한 번에 바꾸면(커밋) 그 순간 전체가 보이고, 실패하면 아무것도 보이지 않는다.

오픈 테이블 포맷의 ACID 는 스냅샷 기반이다. 쓰기는 새 데이터 파일과 새 메타데이터를 만든 뒤 "현재 스냅샷" 포인터를 원자적으로 교체한다. 읽기는 시작 시점의 스냅샷만 보므로 쓰기와 서로 막지 않는다(스냅샷 격리). 이전 스냅샷을 지우지 않고 남겨 두면 그것이 곧 시간 여행이다.

## Iceberg 의 메타데이터 구조

AWS 가 가장 폭넓게 지원하는 Iceberg 를 기준으로 계층을 보면 다음과 같다.

```text
Glue Data Catalog 테이블 ── metadata_location ──► 메타데이터 파일 (스키마, 파티션 명세, 스냅샷 목록)
                                                      │
                                                      ▼
                                              매니페스트 리스트 (스냅샷 1개 = 매니페스트들의 목록)
                                                      │
                                                      ▼
                                              매니페스트 파일 (데이터 파일 목록 + 파일별 컬럼 통계)
                                                      │
                                                      ▼
                                              데이터 파일(Parquet/ORC/Avro), 삭제 파일
```

- 카탈로그가 가진 것은 **"최신 메타데이터 파일의 위치" 하나**다. 커밋은 이 포인터를 새 파일로 바꾸는 일이다.
- 두 작성자가 동시에 커밋하면 한쪽만 성공한다(낙관적 동시성). 진 쪽은 최신 상태를 다시 읽어 재시도한다. Athena 는 Glue 카탈로그의 낙관적 잠금만 지원한다.
- 매니페스트에 파일별 통계가 있어 엔진은 **S3 를 나열하지 않고** 읽을 파일을 고른다. 파티션이 많아도 계획이 느려지지 않는 이유다.

## 세 포맷 비교

| 축 | Apache Iceberg | Apache Hudi | Delta Lake |
|------|------|------|------|
| 메타데이터 | 메타데이터 파일 → 매니페스트 리스트 → 매니페스트 | 타임라인(`.hoodie`) + 인덱스 | 트랜잭션 로그(`_delta_log` 의 JSON + Parquet 체크포인트) |
| 강점 | 스키마·파티션 진화, 숨은 파티셔닝, 엔진 중립 | 레코드 키 기반 업서트, 증분 쿼리 | Spark 와의 통합 |
| 쓰기 방식 | CoW / MoR(삭제 파일) | CoW / MoR 테이블 타입 | CoW 중심, 삭제 벡터 |
| Athena | 읽기·쓰기·DDL·시간 여행 | 읽기 전용(스냅샷·읽기 최적화 쿼리) | 읽기 전용, 시간 여행 미지원 |
| Glue ETL(Spark) | 읽기·쓰기 | 읽기·쓰기 | 읽기·쓰기 |
| EMR | Spark·Flink·Trino 등에서 사용 | 사용 | 사용 |
| 고르는 단서 | "Athena SQL 로 수정·삭제", "파티션 체계를 바꿔야 함" | "CDC 를 업서트로 적재", "바뀐 것만 증분으로 읽기" | "기존 Databricks/Delta 자산", "Spark 중심" |

- **숨은 파티셔닝(Iceberg)**: `PARTITIONED BY (month(dt))` 처럼 변환 함수로 파티션을 정의한다. 쿼리는 `WHERE dt >= ...` 만 쓰면 되고, 엔진이 파티션 값을 계산해 프루닝한다. Hive 스타일처럼 사용자가 `year=`, `month=` 컬럼을 알아야 할 필요가 없다.
- **파티션 진화(Iceberg)**: 월 단위 파티션을 일 단위로 바꿔도 기존 파일을 다시 쓰지 않는다. 옛 파일은 옛 명세로, 새 파일은 새 명세로 읽는다.
- **Hudi 의 쿼리 타입**: 스냅샷 쿼리(최신 상태), 증분 쿼리(특정 커밋 이후 바뀐 것만), 읽기 최적화 쿼리(MoR 에서 컴팩션된 부분만). 증분 쿼리가 하류 파이프라인을 증분으로 돌리게 해 준다.

## Copy-on-Write 와 Merge-on-Read

| 축 | Copy-on-Write(CoW) | Merge-on-Read(MoR) |
|------|------|------|
| 변경 시 | 그 행이 든 데이터 파일을 통째로 다시 쓴다 | 변경·삭제 내용을 별도 파일(삭제 파일·로그)에 적는다 |
| 쓰기 비용 | 높다 | 낮다 |
| 읽기 비용 | 낮다(파일만 읽으면 됨) | 높다(읽을 때 데이터 파일과 변경분을 합침) |
| 맞는 워크로드 | 읽기 많고 변경 드묾 | 쓰기·변경 많음, 스트리밍 업서트 |
| 유지보수 | 덜 필요 | 컴팩션이 필수 |

- Hudi 의 MoR 은 데이터를 컬럼형(Parquet) 기본 파일과 행 기반(Avro) 델타 로그로 나눠 저장하고, 컴팩션이 로그를 기본 파일에 합친다.
- **Athena 의 Iceberg `UPDATE`·`DELETE`·`MERGE INTO` 는 항상 Merge-on-Read 다.** 위치 삭제 파일(position delete)을 쓰며, 테이블 속성에 CoW 를 지정해 두어도 무시한다. 그래서 Athena 로 자주 수정하는 테이블은 삭제 파일이 쌓이고, 주기적인 `OPTIMIZE` 가 필요하다.

> ⚠️ **함정**: "MoR 테이블의 읽기가 점점 느려진다"의 답은 컴팩션이다. 스냅샷 만료(`VACUUM`)는 스토리지를 줄일 뿐 읽을 때 합쳐야 하는 삭제 파일을 없애 주지 않는다. 반대로 "스토리지 비용이 계속 는다"의 답이 스냅샷 만료다. 둘을 바꿔 고르지 않는다.

## 행 수준 DML 과 시간 여행

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
-- 시간 여행: 과거 타임스탬프 / 스냅샷 ID 시점 조회 (Iceberg on Athena)
SELECT * FROM sales.orders FOR TIMESTAMP AS OF TIMESTAMP '2026-06-20 00:00:00';
SELECT * FROM sales.orders FOR VERSION AS OF 8623491172120013573;

-- 스냅샷 목록 확인 (Iceberg 메타데이터 테이블)
SELECT snapshot_id, committed_at, operation FROM "sales"."orders$snapshots";
```

- DML 한 번이 스냅샷 하나를 만든다. 잘못 적재했으면 직전 스냅샷 시점으로 조회해 복구 데이터를 뽑을 수 있다.
- 시간 여행으로 돌아갈 수 있는 범위는 **남아 있는 스냅샷까지**다. 스냅샷을 만료시키면 그 이전으로는 못 간다.

> ⚠️ **함정**: `DELETE` 를 실행했다고 데이터가 S3 에서 사라진 것이 아니다. 새 스냅샷에서 안 보일 뿐, 이전 스냅샷이 가리키는 데이터 파일은 그대로 있고 시간 여행으로 다시 읽힌다. GDPR 삭제 요청을 **완전히** 처리하려면 `DELETE` → 컴팩션(삭제 반영해 파일 재작성) → 스냅샷 만료(옛 파일 물리 삭제)까지 가야 한다. S3 버전 관리가 켜진 버킷이면 비현행 버전 정리 규칙도 필요하다.

## AWS 연동

### Athena

```sql
CREATE TABLE sales.orders (
  order_id bigint, customer_id string, status string, amount double, dt date
)
PARTITIONED BY (month(dt))           -- Iceberg 숨은 파티셔닝
LOCATION 's3://acme-datalake-curated/iceberg/orders/'
TBLPROPERTIES ('table_type' = 'ICEBERG');
```

- `CREATE EXTERNAL TABLE` 이 아니라 `CREATE TABLE` 이다. `EXTERNAL` 을 붙이면 오류가 난다. `LOCATION` 과 `'table_type'='ICEBERG'` 가 필요하다.
- 파티션 변환 함수는 `year`, `month`, `day`, `hour`, `bucket(N, col)`, `truncate(L, col)` 이다.
- Athena 는 Iceberg v2 테이블을 만들고 다루며, **Glue Data Catalog 에 등록된 Iceberg 테이블만** 지원한다. 데이터 파일 포맷은 Parquet(기본), ORC, Avro.
- Hudi 는 읽기만 된다. 증분 쿼리, CTAS, `INSERT INTO`, `MSCK REPAIR TABLE` 은 Hudi 테이블에 지원되지 않는다.
- Delta Lake 는 엔진 버전 3 에서 매니페스트 생성 없이 바로 읽는다. 쓰기 DML 과 Delta 의 시간 여행은 지원되지 않는다.
- Lake Formation 으로 이 테이블들의 **읽기 권한**은 관리할 수 있지만 `VACUUM`·`MERGE`·`UPDATE`·`OPTIMIZE` 같은 작업의 권한은 Lake Formation 으로 관리할 수 없다.

### Glue 와 EMR

- **AWS Glue 3.0 이상**이 Hudi·Delta Lake·Iceberg 를 기본 지원한다. 별도 커넥터 설치 없이 잡 파라미터 `--datalake-formats` 에 `iceberg`, `hudi`, `delta` 를 지정한다.
- **EMR** 은 Spark·Flink·Trino 등에서 세 포맷을 쓴다. 대규모 배치 업서트와 컴팩션 잡에 맞는다.
- 세 포맷 모두 Glue Data Catalog 를 카탈로그로 쓸 수 있어, 한 엔진이 쓴 테이블을 다른 엔진이 읽는다. 단 엔진마다 지원 범위가 다르다는 점은 위 표와 같다.

```python
# Glue Spark 에서 Iceberg 테이블에 업서트 (잡 파라미터: --datalake-formats iceberg)
spark.sql("""
  MERGE INTO glue_catalog.sales.orders t
  USING updates s ON t.order_id = s.order_id
  WHEN MATCHED THEN UPDATE SET *
  WHEN NOT MATCHED THEN INSERT *
""")
```

## 유지보수: 컴팩션과 스냅샷 만료

테이블 포맷은 쓸수록 세 가지가 쌓인다.

| 쌓이는 것 | 원인 | 결과 | 정리 방법 |
|------|------|------|------|
| 작은 데이터 파일 | 잦은 소량 커밋, 스트리밍 적재 | 읽기 느려짐 | 컴팩션 |
| 삭제 파일 | MoR 방식의 UPDATE/DELETE | 읽을 때 병합 비용 | 컴팩션 |
| 옛 스냅샷과 그 파일, 고아 파일 | 모든 커밋, 실패한 잡 | 스토리지 비용 증가 | 스냅샷 만료, 고아 파일 삭제 |

```sql
-- 컴팩션: 삭제 파일을 데이터 파일에 합치고 목표 크기에 가깝게 다시 쓴다
OPTIMIZE sales.orders REWRITE DATA USING BIN_PACK
  WHERE dt >= DATE '2026-06-01';

-- 스냅샷 보존 기간을 3일로 줄인 뒤 만료·고아 파일 제거
ALTER TABLE sales.orders SET TBLPROPERTIES ('vacuum_max_snapshot_age_seconds' = '259200');
VACUUM sales.orders;
```

| Athena Iceberg 테이블 속성 | 기본값 | 의미 |
|------|------|------|
| `vacuum_max_snapshot_age_seconds` | 432000(5일) | 이보다 오래된 스냅샷을 만료 대상으로 본다 |
| `vacuum_min_snapshots_to_keep` | 1 | 최소한 남길 스냅샷 수. 보존 기간보다 우선한다 |
| `optimize_rewrite_data_file_threshold` | 5 | 최적화가 필요한 데이터 파일이 이보다 적으면 다시 쓰지 않는다 |
| `optimize_rewrite_delete_file_threshold` | 2 | 데이터 파일에 딸린 삭제 파일이 이보다 적으면 다시 쓰지 않는다 |

- `OPTIMIZE` 와 `VACUUM` 은 직접 실행해야 하는 쿼리다. 스케줄을 걸지 않으면 아무도 돌리지 않는다.
- 직접 돌리지 않으려면 **Glue Data Catalog 의 테이블 최적화**를 켠다. Iceberg 테이블에 대해 컴팩션, 스냅샷 보존, 고아 파일 삭제를 관리형으로 수행한다.
- 컴팩션도 새 스냅샷을 만든다. 컴팩션 직후에는 옛 파일과 새 파일이 함께 있어 스토리지가 잠시 **늘어난다.** 스냅샷 만료까지 해야 줄어든다.
- 스냅샷 보존 기간은 "얼마나 과거로 시간 여행할 수 있어야 하는가"와 "스토리지 비용" 사이의 선택이다.

S3 수명주기로 Iceberg 테이블의 데이터 프리픽스를 만료시키면 안 된다. 메타데이터는 그 파일이 있다고 믿는데 파일이 사라지면 쿼리가 실패한다. 테이블 포맷의 파일 수명은 테이블 포맷의 도구(스냅샷 만료·고아 파일 삭제)로 관리한다.

## 증상 → 원인 → 조치

| 증상 | 원인 | 조치 |
|------|------|------|
| 수정이 잦은 Iceberg 테이블 조회가 점점 느려짐 | 삭제 파일·작은 파일 누적 | `OPTIMIZE` 또는 Glue 자동 컴팩션 |
| 행 수는 그대로인데 스토리지가 계속 늚 | 옛 스냅샷이 옛 파일을 붙잡고 있음 | `VACUUM`(스냅샷 만료), 보존 기간 조정 |
| 지난주 시점으로 시간 여행이 안 됨 | 그 스냅샷이 이미 만료됨 | 보존 기간을 요구에 맞게 늘림(사전 조치) |
| 삭제한 고객 데이터가 S3 에 남아 있음 | 이전 스냅샷이 참조 중 | 컴팩션 후 스냅샷 만료 |
| Athena 로 Hudi 테이블에 INSERT 실패 | Athena 는 Hudi 읽기 전용 | Glue/EMR Spark 로 쓰기 |
| 동시 쓰기 잡 하나가 커밋 충돌로 실패 | 낙관적 동시성 충돌 | 재시도, 같은 파티션을 동시에 쓰는 잡 분리 |
| `CREATE EXTERNAL TABLE ... ICEBERG` 오류 | Iceberg 는 EXTERNAL 키워드 미지원 | `CREATE TABLE` 사용 |

## 지문 단서 → 정답 판별표

| 지문 단서 | 정답 |
|------|------|
| "S3 데이터 레이크에서 ACID 트랜잭션, 행 단위 수정·삭제" | 오픈 테이블 포맷(Athena 로 한다면 Iceberg) |
| "특정 고객의 레코드를 삭제(GDPR)" | 테이블 포맷의 DELETE + 컴팩션·스냅샷 만료 |
| "CDC 변경분을 업서트, 바뀐 것만 증분 조회" | Hudi(또는 Iceberg `MERGE INTO`) |
| "어제 시점의 테이블 상태를 조회" | 시간 여행(`FOR TIMESTAMP AS OF`) |
| "파티션 체계를 바꾸되 기존 데이터를 다시 쓰지 않는다" | Iceberg 파티션 진화 |
| "쿼리 작성자가 파티션 컬럼을 몰라도 프루닝" | Iceberg 숨은 파티셔닝 |
| "쓰기가 많고 읽기 지연은 조금 허용" | Merge-on-Read |
| "읽기가 대부분, 변경은 드묾" | Copy-on-Write |
| "작은 파일·삭제 파일 때문에 느려짐" | 컴팩션 |
| "운영 부담 없이 Iceberg 유지보수" | Glue Data Catalog 테이블 최적화 |

내일은 이렇게 쌓인 레이크의 저장 비용을 스토리지 클래스와 수명주기로 줄이는 방법을 다룬다.

## 📖 용어

- **오픈 테이블 포맷** : 데이터 파일 위에 트랜잭션 메타데이터를 얹어 파일 묶음을 테이블처럼 다루게 하는 공개 규격. Iceberg·Hudi·Delta Lake 가 대표적이다.
- **스냅샷** : 특정 커밋 시점에 테이블을 이루는 파일들의 목록. 커밋마다 하나씩 생긴다.
- **매니페스트** : 데이터 파일 목록과 파일별 통계를 담은 Iceberg 의 메타데이터 파일.
- **시간 여행(time travel)** : 과거 스냅샷을 지정해 그 시점의 테이블을 조회하는 기능.
- **숨은 파티셔닝** : 컬럼에 변환 함수를 적용해 파티션을 정의하고, 쿼리에서는 원래 컬럼만 쓰게 하는 Iceberg 기능.
- **Copy-on-Write(CoW)** : 변경할 때 해당 데이터 파일을 통째로 다시 쓰는 방식.
- **Merge-on-Read(MoR)** : 변경분을 별도 파일에 적어 두고 읽을 때 합치는 방식.
- **삭제 파일(delete file)** : "이 파일의 이 위치 행은 지워졌다"를 기록한 Iceberg 파일. 읽을 때 데이터 파일에 적용된다.
- **업서트(upsert)** : 키가 있으면 UPDATE, 없으면 INSERT 하는 동작. SQL 에서는 `MERGE INTO` 로 쓴다.
- **고아 파일(orphan file)** : 어떤 스냅샷도 가리키지 않는데 S3 에 남아 있는 파일. 실패한 잡이 주로 남긴다.

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
