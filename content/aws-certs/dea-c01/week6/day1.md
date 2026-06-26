# Day 1 - S3 데이터레이크 레이아웃과 파티셔닝 전략

데이터레이크의 핵심은 "원본은 절대 손대지 않고, 단계별로 정제된 사본을 누적한다"는 철학입니다. 오늘은 Amazon S3를 데이터레이크 스토리지로 사용할 때의 존(zone) 구조, 파티셔닝, 네이밍 규칙을 다룹니다.

## S3가 데이터레이크 스토리지로 적합한 이유

S3는 사실상 무제한 용량, 11 9's(99.999999999%)의 내구성, 컴퓨팅과 스토리지의 분리를 제공합니다. 이 분리 덕분에 Athena, EMR, Redshift Spectrum, Glue 등 여러 엔진이 동일한 데이터를 동시에 읽을 수 있습니다. 전통적 DW와 달리 스토리지를 먼저 채우고 스키마는 읽을 때 적용(schema-on-read)합니다.

> 💡 **관련 이론**: 데이터레이크는 schema-on-read, 데이터웨어하우스는 schema-on-write입니다. 레이크는 정형/반정형/비정형 데이터를 원본 그대로 저장하고, 쿼리 시점에 스키마를 부여합니다.

## 존(Zone) 기반 레이아웃: raw → clean → curated

데이터레이크는 가공 단계별로 버킷 또는 프리픽스를 분리합니다. 일반적으로 3계층(메달리온 아키텍처의 bronze/silver/gold와 동일 개념)을 사용합니다.

```text
s3://company-datalake-raw/         # Raw(Bronze) — 원본 그대로, 불변
  └── source=salesforce/dt=2026-06-25/...

s3://company-datalake-clean/       # Clean(Silver) — 검증·중복제거·타입정규화
  └── domain=sales/orders/year=2026/month=06/day=25/...

s3://company-datalake-curated/     # Curated(Gold) — 비즈니스 집계, BI/ML 소비
  └── mart=revenue/daily_summary/year=2026/month=06/...
```

- **Raw 존**: 수집한 원본을 그대로 보관. 절대 덮어쓰지 않으며, 재처리의 단일 진실 공급원(source of truth). 보통 가장 저렴한 스토리지 클래스로 장기 보관.
- **Clean 존**: 스키마 검증, 결측치 처리, 타입 정규화, 컬럼 포맷(Parquet)으로 변환. Glue ETL/Spark 잡의 출력.
- **Curated 존**: 조인·집계가 끝난 분석용 데이터. Athena 쿼리나 QuickSight 대시보드, ML 학습이 직접 읽음.

존을 분리하면 권한을 계층별로 다르게 부여하고(예: Raw는 데이터 엔지니어만), 재처리 시 영향 범위를 격리할 수 있습니다.

## 파티셔닝 전략

파티셔닝은 데이터를 키별 디렉터리(프리픽스)로 나눠 쿼리 시 스캔량을 줄이는 기법입니다. Athena/Spark는 WHERE 조건에 파티션 키가 있으면 해당 프리픽스만 읽습니다(파티션 프루닝).

```text
s3://datalake-clean/orders/year=2026/month=06/day=25/region=us-east-1/file.parquet
```

이 형식은 **Hive 스타일 파티셔닝**(`key=value`)으로, Glue 크롤러와 Athena가 자동으로 파티션을 인식합니다.

```sql
-- 파티션 프루닝이 작동: year/month/day 프리픽스만 스캔
SELECT region, SUM(amount)
FROM orders
WHERE year = 2026 AND month = 6 AND day = 25
GROUP BY region;
```

파티션 키 선택 원칙:
- **쿼리 필터에 자주 쓰는 컬럼**을 선택 (보통 날짜/시간).
- **카디널리티가 적절**해야 함. 너무 세분화하면 작은 파일이 폭증(small files problem)하고, 너무 거칠면 프루닝 효과가 없음.
- 날짜는 `year=/month=/day=` 계층으로 나눠 월/일 단위 모두 프루닝 가능하게 함.

> 💡 **관련 이론**: 작은 파일 문제(small files problem) — 파일이 수만 개로 쪼개지면 메타데이터 오버헤드와 S3 GET 요청 비용이 폭증합니다. 파일당 권장 크기는 128MB~1GB이며, Glue의 `groupFiles`나 compaction으로 병합합니다.

## 파티션 프로젝션 (Partition Projection)

파티션이 수만 개로 늘면 Glue Data Catalog 조회가 병목이 됩니다. Athena의 **파티션 프로젝션**은 파티션을 카탈로그에 등록하지 않고 테이블 속성에 정의된 규칙으로 계산합니다.

```sql
ALTER TABLE orders SET TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.dt.type' = 'date',
  'projection.dt.range' = '2024-01-01,NOW',
  'projection.dt.format' = 'yyyy-MM-dd',
  'storage.location.template' = 's3://datalake-clean/orders/dt=${dt}/'
);
```

크롤러 없이도 파티션이 자동 인식되어 비용과 지연을 크게 줄입니다.

## 네이밍 규칙

- 버킷명은 전역 고유, 소문자/하이픈만. 환경·도메인 식별: `acme-datalake-raw-prod`.
- 프리픽스는 `domain/entity/partition` 순으로 일관되게.
- 파일명에 타임스탬프나 UUID를 포함해 충돌 방지: `orders_20260625_a1b2.parquet`.
- 과거에는 랜덤 프리픽스로 요청 분산을 권장했으나, 현재 S3는 프리픽스당 자동으로 초당 3,500 PUT / 5,500 GET을 지원하므로 가독성 좋은 계층 구조를 우선합니다.

> 💡 **관련 이론**: S3는 더 이상 핫 프리픽스 분산을 위한 해시 프리픽스가 필수가 아닙니다. 프리픽스별로 자동 확장되므로, 의미 있는 계층 네이밍을 사용하세요.

## 컬럼형 포맷과 압축

분석 데이터레이크에서는 행 기반(CSV/JSON) 대신 **Parquet/ORC** 컬럼형 포맷을 사용합니다. 필요한 컬럼만 읽어 스캔량과 비용을 줄이고, 컬럼 단위 압축(Snappy/ZSTD)으로 저장 비용을 낮춥니다.

```bash
# Clean 존으로 Parquet 변환 후 적재 예시 (AWS CLI)
aws s3 cp ./orders.parquet \
  s3://acme-datalake-clean-prod/sales/orders/year=2026/month=06/day=25/orders.parquet
```

## 핵심 정리

- 존 분리(raw/clean/curated)로 원본 보존, 단계별 권한·재처리 격리.
- Hive 스타일 파티셔닝으로 프루닝, 날짜 계층이 일반적.
- 작은 파일 문제를 피하고(128MB~1GB), Parquet + 압축으로 비용·성능 최적화.
- 파티션이 많으면 파티션 프로젝션으로 카탈로그 병목 회피.

## 📝 연습 문제

**문제 1.** 데이터레이크에서 수집한 원본 데이터를 절대 변경하지 않고 보관하며, 재처리의 단일 진실 공급원 역할을 하는 존은 무엇인가?

A) Curated 존  
B) Clean 존  
C) Raw 존  
D) Sandbox 존  

**정답: C**  
해설: Raw(Bronze) 존은 수집한 원본을 그대로 불변 보관하며 재처리의 source of truth입니다. Clean은 검증·정규화된 중간 단계, Curated는 비즈니스 집계 결과로 소비용입니다. Sandbox는 표준 3계층에 포함되지 않습니다.

---

**문제 2.** Athena 쿼리에서 `WHERE year=2026 AND month=6` 조건이 해당 프리픽스만 스캔하도록 만드는 기법은?

A) 파티션 프루닝  
B) 데이터 스큐  
C) 브로드캐스트 조인  
D) 버킷팅 셔플  

**정답: A**  
해설: 파티션 키가 WHERE 조건에 있으면 엔진이 관련 프리픽스만 읽는 파티션 프루닝이 작동해 스캔량과 비용을 줄입니다. 나머지는 파티션 기반 스캔 절감과 무관한 개념입니다.

---

**문제 3.** 데이터레이크에서 파일이 수만 개의 매우 작은 파일로 쪼개졌을 때 발생하는 문제로 가장 적절한 것은?

A) 데이터 내구성이 떨어진다  
B) 메타데이터 오버헤드와 S3 요청 비용이 증가한다  
C) 파티션 프루닝이 비활성화된다  
D) 스키마가 자동으로 변경된다  

**정답: B**  
해설: 작은 파일 문제는 파일별 메타데이터 처리 오버헤드와 다수의 S3 GET 요청으로 비용·지연이 증가합니다. 권장은 128MB~1GB이며 compaction으로 병합합니다. 내구성·스키마·프루닝과는 직접 관련이 없습니다.

---

**문제 4.** Glue Data Catalog에 파티션을 등록하지 않고 테이블 속성의 규칙으로 파티션을 계산해 카탈로그 병목을 줄이는 Athena 기능은?

A) 파티션 프로젝션  
B) 크롤러 스케줄링  
C) CTAS  
D) 워크그룹 격리  

**정답: A**  
해설: 파티션 프로젝션(Partition Projection)은 파티션을 카탈로그에 일일이 등록하지 않고 범위·포맷 규칙으로 계산해 대량 파티션 환경에서 조회 비용과 지연을 줄입니다. 크롤러는 등록 방식이고, CTAS는 결과 테이블 생성, 워크그룹은 비용·격리 관리입니다.

---

**문제 5.** 분석용 데이터레이크에서 컬럼 단위로 필요한 데이터만 읽어 스캔량을 줄이고 압축 효율이 높은 권장 파일 포맷은?

A) CSV  
B) JSON  
C) Parquet  
D) XML  

**정답: C**  
해설: Parquet(또는 ORC)은 컬럼형 포맷으로 필요한 컬럼만 읽어 스캔 비용을 줄이고 컬럼 단위 압축으로 저장 비용을 낮춥니다. CSV/JSON/XML은 행 기반 또는 비효율적이어서 분석 워크로드에 부적합합니다.

---
