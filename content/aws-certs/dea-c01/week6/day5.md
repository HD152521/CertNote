# Day 5 - Week 6 종합: 데이터레이크 복습

이번 주는 S3 기반 데이터레이크의 레이아웃, Lake Formation 권한, 오픈 테이블 포맷, 스토리지 비용 최적화를 다뤘습니다. 오늘은 네 주제를 하나의 데이터레이크 운영 시나리오로 엮어 복습합니다.

## 1. S3 데이터레이크 레이아웃 (Day 1)

- **존 분리**: raw(불변 원본) → clean(검증·정규화) → curated(비즈니스 집계). 단계별 권한·재처리 격리.
- **파티셔닝**: Hive 스타일 `key=value`(보통 날짜 계층)로 파티션 프루닝. 카디널리티가 적절해야 하며, 작은 파일 문제(128MB~1GB 권장)에 주의.
- **파티션 프로젝션**: 파티션이 많을 때 카탈로그 등록 없이 규칙으로 계산해 병목 회피.
- **포맷**: Parquet + 압축(Snappy/ZSTD)으로 스캔량·비용 절감.

> 💡 **관련 이론**: 컴퓨팅과 스토리지 분리(S3 위 여러 엔진 공유)와 schema-on-read가 데이터레이크의 근본 특성입니다.

## 2. AWS Lake Formation (Day 2)

- **데이터 위치 등록(register)** → credential vending으로 접근 일원화.
- **권한 모델**: 명명형 vs LF-Tags(TBAC). 대규모는 태그 기반이 확장적.
- **세분화 보안**: 컬럼 / 행(데이터 필터) / 셀 수준.
- **블루프린트**: 수집 워크플로우(크롤러+잡+트리거) 자동 생성.
- IAM 권한과 Lake Formation 권한이 **모두** 필요.

## 3. 오픈 테이블 포맷 (Day 3)

- Parquet 위 트랜잭션 메타데이터로 **ACID·시간 여행·행 수준 DML** 제공.
- **Iceberg**(스키마/파티션 진화, AWS 폭넓은 지원), **Hudi**(업서트/증분 CDC), **Delta**(Spark 통합).
- Athena v3 / Glue / EMR 연동, Glue Data Catalog 공유.
- compaction·스냅샷 만료 운영, MoR/CoW 트레이드오프.

## 4. S3 스토리지 관리 (Day 4)

- 접근 빈도별 스토리지 클래스, IA/Glacier는 검색 비용·최소 보관 기간 고려.
- 수명주기 전환·만료, 불완전 멀티파트·비현행 버전 정리.
- Intelligent-Tiering(불규칙 패턴) vs 수명주기 전환(예측 가능 패턴).
- Storage Lens/Inventory 가시성, 압축·compaction 근본 절감.

## 통합 시나리오: 주문 데이터레이크

요구사항: RDS 주문 DB를 데이터레이크로 적재하고, 분석가에게는 PII 컬럼을 가린 채 자기 지역 행만 보여주며, GDPR 삭제 요청에 대응하고, 비용을 최적화한다.

```text
[RDS] --(Lake Formation Incremental DB 블루프린트)--> s3://lake-raw/orders/dt=.../
   --(Glue ETL: 검증·Parquet 변환)--> s3://lake-clean/orders/ (Iceberg 테이블)
   --(Glue: 집계)--> s3://lake-curated/revenue/ (Athena/QuickSight 소비)
```

설계 결정:
1. **수집**: Lake Formation Incremental database 블루프린트로 증분 적재 워크플로우 자동 생성.
2. **테이블 포맷**: clean 존을 **Iceberg** 테이블로 구성 → GDPR DELETE, 업서트(MERGE), 시간 여행 지원.
3. **권한**: Lake Formation에서 `pii` 컬럼은 제외 GRANT, **데이터 필터**로 `region = 분석가 지역` 행만 노출.
4. **비용**: raw 존은 수명주기로 30일→IA, 90일→Glacier 전환 + 불완전 업로드 정리. clean/curated는 Standard 또는 Intelligent-Tiering.

```sql
-- GDPR 삭제 요청 처리 (Iceberg on Athena)
DELETE FROM lake_clean.orders WHERE customer_id = 'GDPR-REQ-2026-001';

-- 분석가 권한: PII 제외, 지역 행 필터는 데이터 필터로 적용
-- (컬럼 제외 GRANT)
GRANT SELECT (order_id, region, amount, dt)
ON TABLE lake_clean.orders TO 'arn:aws:iam::111122223333:role/RegionAnalyst';
```

> 💡 **관련 이론**: 데이터레이크 설계는 "수집(블루프린트) → 테이블 포맷(거버넌스·DML) → 권한(Lake Formation) → 비용(스토리지 관리)"의 네 축을 함께 고려해야 합니다. 한 축만 최적화하면 다른 축에서 비용·규제·성능 문제가 생깁니다.

## 시험 포인트 요약

- raw/clean/curated 존의 목적과 스토리지 클래스 매핑을 구분할 것.
- 파티션 프루닝 vs 파티션 프로젝션, 작은 파일 문제의 원인·해결.
- Lake Formation: register/credential vending, LF-Tags(TBAC), 데이터 필터(행 수준), IAM과 동시 필요.
- 오픈 테이블 포맷이 해결하는 문제(ACID/시간여행/행 DML)와 Iceberg/Hudi/Delta 강점 구분.
- 검색 비용·최소 보관 기간, Intelligent-Tiering vs 수명주기 선택 기준.

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
