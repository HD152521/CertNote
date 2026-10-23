# Day 5 - Week 6 종합: 데이터 레이크 복습

## 📌 핵심 정리

- 레이크 설계는 **레이아웃(어디에 어떻게 둘까) → 테이블 포맷(어떻게 바꿀까) → 권한(누가 볼까) → 스토리지(얼마에 둘까)** 네 층의 결정이고, 한 층의 선택이 다른 층을 제약한다.
- 스캔량 문제는 파티션·컬럼형 포맷, 카탈로그 병목은 파티션 프로젝션·인덱스, 파일 수 문제는 컴팩션으로 푼다. 증상이 비슷해도 처방이 다르다.
- 행 단위 수정·삭제·시간 여행이 필요하면 오픈 테이블 포맷이다. Athena SQL 로 쓰려면 Iceberg, 업서트·증분 중심이면 Hudi, Spark 자산이면 Delta Lake.
- 컬럼·행·셀 단위 통제와 교차 계정 공유는 Lake Formation 이다. 등록·`IAMAllowedPrincipals` 회수·S3 직접 권한 제거가 갖춰져야 실제로 강제된다.
- 자주 읽으면 Standard, 패턴을 모르면 Intelligent-Tiering, 뚜렷이 식으면 수명주기 전환. Athena 로 읽을 데이터와 테이블 포맷의 파일은 복원이 필요한 아카이브 계층으로 보내지 않는다.

## 네 층으로 보는 레이크

이번 주는 S3 기반 데이터 레이크의 레이아웃, Lake Formation 권한, 오픈 테이블 포맷, 스토리지 비용 최적화를 따로 봤다. 실제 설계에서는 넷이 한 테이블 위에 동시에 걸린다.

```text
┌─ 권한 ─────────── Lake Formation: 등록 · LF-Tags · 데이터 필터 · 교차 계정 공유
├─ 테이블 포맷 ──── Hive 테이블(경로 = 테이블)  |  Iceberg · Hudi · Delta(메타데이터 = 테이블)
├─ 레이아웃 ─────── 존(raw/clean/curated) · 파티션 · 파일 크기 · Parquet/압축
└─ 스토리지 ─────── 스토리지 클래스 · 수명주기 · Intelligent-Tiering · 버전 관리
```

| 층 | 묻는 질문 | 이번 주의 도구 | 잘못 고르면 |
|------|------|------|------|
| 레이아웃 | 쿼리가 얼마나 적게 읽게 할까 | 존, 파티션, 컬럼형 포맷, 컴팩션 | 전체 스캔, 작은 파일 폭증 |
| 테이블 포맷 | 쓰는 도중·쓴 뒤의 일관성과 변경을 어떻게 다룰까 | Iceberg, Hudi, Delta Lake | 반쯤 쓰인 데이터 노출, 행 삭제 불가 |
| 권한 | 누가 어느 컬럼·행까지 볼까 | Lake Formation | PII 노출, 권한 정책 폭증 |
| 스토리지 | 같은 데이터를 얼마에 보관할까 | 스토리지 클래스, 수명주기 | 검색 요금 폭탄, 조용히 빠지는 데이터 |

## 층 사이의 간섭: 따로 배운 것이 만나는 지점

나흘 동안의 내용은 서로 충돌하는 곳에서 문제로 나온다.

| 만나는 두 주제 | 무슨 일이 생기나 | 올바른 처리 |
|------|------|------|
| 파티션 프로젝션 × 다중 엔진 | 프로젝션은 Athena 에서만 동작한다. Redshift Spectrum·EMR 은 카탈로그의 파티션만 본다 | 여러 엔진이 읽는 테이블은 파티션을 카탈로그에도 등록 |
| 파티션 프로젝션 × 희소한 데이터 | 규칙이 계산한 빈 위치를 전부 나열해 느려진다 | 절반 넘게 비면 일반 파티션 |
| 수명주기 만료 × 파티션 메타데이터 | S3 객체는 사라졌는데 카탈로그에 빈 파티션이 남아 계획 단계가 느려진다 | 만료에 맞춰 `ALTER TABLE DROP PARTITION` |
| 수명주기 전환 × Athena | Glacier Flexible Retrieval·Deep Archive 객체는 오류 없이 건너뛴다 | 조회 대상은 Glacier Instant Retrieval 까지만 |
| 수명주기 × Iceberg | 메타데이터가 가리키는 파일이 만료·아카이브되면 쿼리가 실패한다 | 파일 수명은 스냅샷 만료·고아 파일 삭제로 관리 |
| 작은 파일 × 스토리지 클래스 | 128KB 미만 객체는 기본적으로 전환되지 않고, IA 에서는 128KB 로 과금된다 | 컴팩션을 먼저, 전환은 그다음 |
| Iceberg DELETE × GDPR | 이전 스냅샷이 삭제된 행의 파일을 계속 붙잡는다 | DELETE → 컴팩션 → 스냅샷 만료(+ 비현행 버전 정리) |
| Iceberg 컴팩션 × 스토리지 비용 | 컴팩션 직후에는 옛 파일과 새 파일이 함께 있어 용량이 는다 | 컴팩션 뒤 스냅샷 만료까지 수행 |
| 버전 관리 × 덮어쓰는 ETL | 잡이 돌 때마다 이전 출력이 비현행 버전으로 쌓인다 | `NoncurrentVersionExpiration` |
| Lake Formation × S3 직접 권한 | S3 권한이 있는 사용자는 필터를 우회해 파일을 직접 읽는다 | 분석가의 S3 직접 권한 제거 |
| Lake Formation × 테이블 포맷 | 읽기 권한은 관리하지만 `VACUUM`·`MERGE`·`OPTIMIZE` 권한은 관리하지 못한다 | 쓰기·유지보수는 전용 역할에 IAM 으로 |
| Lake Formation 필터 × Athena 결과 재사용 | 행·컬럼 권한이 걸린 테이블은 쿼리 결과 재사용 대상이 아니다 | 캐시 절감을 기대하지 않는다 |

## "쿼리가 느리다·비싸다"를 가르는 순서

같은 증상에 처방이 넷이다. 무엇이 병목인지부터 가른다.

```text
① 스캔한 데이터량이 큰가?
   ├─ 필요 없는 날짜까지 읽는다 ──────────► 파티션 키로 필터 (파티셔닝·프루닝)
   └─ 필요 없는 컬럼까지 읽는다 ──────────► Parquet/ORC + 필요한 컬럼만 SELECT

② 스캔량은 작은데 계획 단계가 긴가?
   ├─ 파티션이 수만 개 ───────────────────► 파티션 프로젝션 / Glue 파티션 인덱스
   └─ 빈 파티션·옛 파티션이 쌓였다 ───────► 파티션 메타데이터 정리

③ 파일 수가 많은가?
   ├─ Hive 테이블의 작은 파일 ────────────► 다시 써서 병합, 쓰는 쪽 버퍼 확대
   └─ Iceberg 의 작은 파일·삭제 파일 ─────► OPTIMIZE / Glue 테이블 최적화

④ S3 가 SlowDown 을 돌려주는가?
   └─ 파일 과다 + 동시 쿼리 ──────────────► 병합, 쿼리 분산
```

- ①은 **데이터 스캔량**(= Athena 비용)의 문제이고 ②③은 **시간**의 문제다. "비용을 줄여라"면 ①, "카탈로그 조회가 병목"이면 ②다.
- 파티션을 더 잘게 쪼개는 것은 ①을 풀면서 ②③을 만든다. 일 단위 조회가 대부분이면 시간 단위로 쪼개지 않고 파일 안을 타임스탬프로 정렬한다.

## 닮은 것끼리 한 번에 구분하기

| 헷갈리는 쌍 | 구분 |
|------|------|
| 파티션 프루닝 vs 파티션 프로젝션 | 프루닝 = 조건에 맞는 파티션만 읽음(스캔량). 프로젝션 = 파티션 목록을 카탈로그 대신 규칙으로 계산(메타데이터 조회) |
| 파티셔닝 vs 버킷팅 | 파티셔닝 = 값의 종류가 적은 키로 경로를 나눔. 버킷팅 = 값이 아주 많은 키를 해시로 정해진 수의 파일에 모음 |
| Hive 스타일 파티션 vs Iceberg 숨은 파티셔닝 | Hive = 경로의 `key=value`, 쿼리가 파티션 컬럼을 알아야 함. Iceberg = 변환 함수로 정의, 원래 컬럼으로 필터 |
| 컴팩션 vs 스냅샷 만료 | 컴팩션 = 읽기 성능 회복. 스냅샷 만료 = 스토리지 회수(시간 여행 범위 축소) |
| Copy-on-Write vs Merge-on-Read | CoW = 쓸 때 재작성, 읽기 빠름. MoR = 변경분 따로 기록, 쓰기 빠름·읽을 때 병합 |
| 명명형 리소스 vs LF-Tags | 명명형 = 이름으로 하나씩. LF-Tags = 태그 조건으로 묶어서, 새 리소스에 자동 적용 |
| 데이터 위치 권한 vs SELECT | 위치 권한 = 그 경로를 가리키는 테이블을 만들 자격. SELECT = 데이터를 읽을 자격 |
| LF-Tag vs IAM·리소스 태그 | 서로 다른 체계. 호환되지 않는다 |
| Standard-IA vs Glacier Instant Retrieval | 둘 다 즉시 읽힘. IA = 월 1회 수준·최소 30일, GIR = 분기 1회 수준·최소 90일·더 낮은 저장 단가 |
| Glacier Instant vs Flexible Retrieval | Instant = 바로 GET. Flexible = 복원 요청 후 분~시간 |
| Intelligent-Tiering vs 수명주기 | IT = 접근 여부로 이동, 검색 요금 없음, 객체당 모니터링 요금. 수명주기 = 나이로 이동, 전환 요청 비용 |
| Snapshot vs Incremental 블루프린트 | Snapshot = 전체 재적재, 스키마가 자유롭게 변해도 됨. Incremental = 북마크 컬럼 이후의 새 행만 |

## Week 6 숫자·기본값 한 장

| 영역 | 항목 | 값 |
|------|------|------|
| S3 | 프리픽스당 요청 처리 | 초당 최소 3,500 PUT/COPY/POST/DELETE, 5,500 GET/HEAD |
| S3 | 나열 한 번이 돌려주는 객체 | 1,000개 |
| 레이아웃 | 권장 파일 크기 | 128MB~1GB |
| 레이아웃 | Parquet 행 그룹 / ORC 스트라이프 기본 크기 | 128MB / 64MB |
| Glue | `groupFiles` 자동 활성 조건 | 입력 파일 50,000개 초과 |
| Athena | CTAS·INSERT INTO 가 한 번에 쓰는 파티션 | 100개 |
| Athena Iceberg | 스냅샷 보존 기본값 | 432,000초(5일), 최소 1개 유지 |
| Glue ETL | 테이블 포맷 기본 지원 | Glue 3.0 이상(`--datalake-formats`) |
| S3 클래스 | 최소 보관 기간 | IA·One Zone-IA 30일 / Glacier Instant·Flexible 90일 / Deep Archive 180일 |
| S3 클래스 | 최소 과금 크기 | IA·One Zone-IA·Glacier Instant 128KB |
| S3 클래스 | 아카이브 객체당 오버헤드 | 40KB(32KB 는 Glacier 단가, 8KB 는 Standard 단가) |
| 복원 | Flexible Retrieval | Expedited 1~5분 / Standard 3~5시간 / Bulk 5~12시간 |
| 복원 | Deep Archive | Standard 12시간 이내 / Bulk 48시간 이내 |
| 수명주기 | 버킷당 규칙 수 | 1,000개 |
| 수명주기 | 기본 전환 제외 | 128KB 미만 객체 |
| Intelligent-Tiering | 자동 계층 이동 | 30일 미접근 → Infrequent, 90일 → Archive Instant |
| Intelligent-Tiering | 선택형 아카이브 계층 | 90일·180일부터, 최대 730일까지 설정 |

## 통합 시나리오: 주문 데이터 레이크

요구사항: RDS 주문 DB 를 데이터 레이크로 적재하고, 분석가에게는 PII 컬럼을 가린 채 자기 지역 행만 보여 주며, GDPR 삭제 요청에 대응하고, 비용을 최적화한다.

```text
[RDS] --(Lake Formation Incremental database 블루프린트)--> s3://lake-raw/orders/dt=.../
   --(Glue ETL: 검증·MERGE)--> s3://lake-clean/orders/ (Iceberg 테이블)
   --(Glue: 집계)--> s3://lake-curated/revenue/ (Athena/QuickSight 소비)
```

| 결정 | 선택 | 이유 | 놓치기 쉬운 것 |
|------|------|------|------|
| 수집 | Incremental database 블루프린트 | 크롤러·잡·트리거로 된 증분 워크플로우가 자동 생성 | 북마크 방식은 새 행만 본다. 주문 상태가 UPDATE 되는 원천이면 DMS CDC 가 필요하다 |
| Raw | 날짜 파티션, 원천 포맷 그대로 | 재처리의 기준 | 불변으로 유지 |
| Clean | Iceberg 테이블 | `MERGE INTO` 업서트, `DELETE`, 시간 여행 | Athena DML 은 Merge-on-Read 라 `OPTIMIZE` 가 필수 |
| GDPR | `DELETE` → `OPTIMIZE` → `VACUUM` | 스냅샷이 만료돼야 물리적으로 지워진다 | Raw 존의 원본에도 같은 고객 데이터가 있다 |
| 권한 | 위치 등록 + 데이터 필터 | 컬럼 제외와 행 필터를 한 필터로 | `IAMAllowedPrincipals` 회수, S3 직접 권한 제거 |
| 스토리지 | Raw 는 수명주기 전환, Clean·Curated 는 Standard | 접근 빈도 차이 | Iceberg 프리픽스에는 전환·만료 규칙을 걸지 않는다 |

```sql
-- GDPR 삭제 요청 처리 (Iceberg on Athena)
DELETE FROM lake_clean.orders WHERE customer_id = 'GDPR-REQ-2026-001';
OPTIMIZE lake_clean.orders REWRITE DATA USING BIN_PACK;
VACUUM lake_clean.orders;
```

```bash
# 분석가용 셀 수준 필터: PII 컬럼 제외 + 자기 지역 행만
aws lakeformation create-data-cells-filter --table-data '{
  "TableCatalogId": "111122223333",
  "DatabaseName": "lake_clean",
  "TableName": "orders",
  "Name": "apne2-no-pii",
  "RowFilter": {"FilterExpression": "region = '\''ap-northeast-2'\''"},
  "ColumnWildcard": {"ExcludedColumnNames": ["customer_name", "phone"]}
}'

# 필터를 지정해 SELECT 부여
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier=arn:aws:iam::111122223333:role/RegionAnalyst \
  --permissions "SELECT" \
  --resource '{"DataCellsFilter": {"TableCatalogId": "111122223333",
               "DatabaseName": "lake_clean", "TableName": "orders", "Name": "apne2-no-pii"}}'
```

> 💡 **관련 이론**: 이 시나리오에서 놓치기 쉬운 곳은 Raw 존이다. Clean 의 Iceberg 테이블에서 고객 행을 지워도 Raw 의 원본 파일에는 그 고객이 남아 있다. Raw 는 불변이 원칙이지만 삭제 요청만큼은 예외 절차가 필요하다. 그래서 PII 는 Raw 에 들어오는 단계에서 토큰화하거나, Raw 의 보존 기간을 짧게 잡는 설계가 함께 검토된다.

## 안티패턴 모음

- **시간·사용자 단위로 과하게 파티셔닝**: 파티션마다 수 KB 파일이 생긴다. 스캔량은 줄었는데 쿼리는 더 느려진다.
- **파티션 추가를 `MSCK REPAIR TABLE` 로 매일 실행**: 전체 경로를 다시 훑는다. 추가된 파티션만 `ALTER TABLE ADD PARTITION` 하거나 프로젝션을 쓴다.
- **Lake Formation 권한을 주고 S3 버킷 정책은 그대로**: 통제가 두 군데에 남아 더 넓은 쪽으로 샌다.
- **컬럼을 가리려고 테이블 사본을 만든다**: 사본마다 ETL·저장 비용·동기화 문제가 생긴다. 데이터 필터가 대신한다.
- **Iceberg 테이블을 만들고 유지보수를 걸지 않는다**: 삭제 파일과 스냅샷이 쌓여 느려지고 비싸진다.
- **모든 버킷에 일괄 "30일 후 IA"**: 자주 읽는 Curated 와 작은 파일이 많은 프리픽스에서 오히려 비용이 는다.
- **버전 관리만 켜고 비현행 버전 규칙이 없다**: 보이지 않는 용량이 무한히 쌓인다.
- **조회 대상 데이터를 Deep Archive 로 전환**: 오류 없이 결과에서 빠진다.

## 시나리오 → 정답 판별표

| 시나리오 | 정답 |
|------|------|
| 날짜로 필터하는데 Athena 가 테이블 전체를 스캔한다 | 날짜 파티셔닝 + 파티션 키 조건 |
| 파티션 수만 개, `GetPartitions` 가 병목, Athena 만 사용 | 파티션 프로젝션 |
| 파티션 수만 개, Athena 와 Redshift Spectrum 이 함께 사용 | 카탈로그 파티션 유지 + Glue 파티션 인덱스 |
| 스트리밍 적재로 수 KB 파일이 수십만 개 | 쓰는 쪽 버퍼 확대 + 컴팩션 |
| S3 의 Parquet 테이블에서 특정 행을 SQL 로 수정 | Iceberg 테이블 + `UPDATE`/`MERGE INTO` |
| 어제 배치가 잘못 적재됐다. 그 전 상태를 조회 | Iceberg 시간 여행 |
| 삭제한 데이터가 실제로 S3 에서 없어져야 한다 | 컴팩션 + 스냅샷 만료 |
| 테이블 수천 개에 부서별 권한을 확장 가능하게 | LF-Tags |
| 같은 테이블을 지역별로 다른 행만 보이게 | 데이터 필터(행 필터) |
| 기존 Glue 잡은 IAM 그대로, 새 분석가만 세밀 권한 | 하이브리드 액세스 모드 |
| 다른 계정이 복사 없이 테이블을 조회 | Lake Formation 교차 계정 공유 + 리소스 링크 |
| 접근 패턴을 알 수 없는 Clean 존 | Intelligent-Tiering |
| 90일 지난 Raw 를 싸게, 하지만 재처리 때 바로 읽어야 | Glacier Instant Retrieval |
| 7년 보관 의무가 있는 감사 로그 | 수명주기로 Deep Archive 전환 + 만료 |
| 버킷 요금이 객체 목록 합계보다 훨씬 크다 | 불완전 멀티파트·비현행 버전 정리 규칙, Storage Lens |

다음 주는 레이크 옆에 놓이는 분석 스토어, Redshift·Athena·DynamoDB·RDS/Aurora 와 워크로드별 스토어 선택을 다룬다.

## 📖 용어

- **메달리온 아키텍처** : 데이터를 bronze(원본)·silver(정제)·gold(집계) 단계로 나누는 레이크 구성 방식. raw·clean·curated 존과 같은 개념이다.
- **프루닝과 프로젝션** : 조건에 맞는 파티션만 읽는 것과, 파티션 목록을 규칙으로 계산하는 것. 이름은 닮았지만 푸는 문제가 다르다.
- **스냅샷 격리** : 읽는 쪽이 시작 시점의 스냅샷만 보아 쓰기와 서로 막지 않는 일관성 방식.
- **셀 수준 보안** : 컬럼 제한과 행 필터를 함께 걸어 행에 따라 보이는 컬럼까지 통제하는 것.
- **데이터 메시** : 도메인별 계정이 데이터를 소유하고 중앙에서 카탈로그와 권한을 관리하는 분산 구조.
- **폭포수 모델** : 수명주기 전환이 위 클래스에서 아래 클래스로만 흐르는 규칙.
- **조기 삭제 요금** : 최소 보관 기간을 채우기 전에 삭제·전환할 때 남은 기간만큼 부과되는 요금.
- **토큰화** : 민감한 값을 의미 없는 대체 값으로 바꿔 저장하는 기법. 원본과의 대응은 별도 저장소에 둔다.

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
