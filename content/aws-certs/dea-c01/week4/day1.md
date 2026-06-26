# Day 1 - Glue Data Catalog와 크롤러: 데이터에 메타데이터를 입히다

S3에 쌓인 수백만 개의 Parquet 파일은 그 자체로는 "그냥 바이트 덩어리"다. 어떤 컬럼이 있고, 타입이 무엇이며, 어떤 키로 파티션되어 있는지를 아무도 모르면 SQL 한 줄도 던질 수 없다. 이 "데이터에 대한 데이터", 즉 **메타데이터**를 중앙에서 관리하는 것이 **AWS Glue Data Catalog**다. 시험에서 "Athena가 S3를 조회한다", "Redshift Spectrum이 외부 테이블을 읽는다", "EMR이 Hive 메타스토어를 공유한다"는 시나리오가 나오면 그 뒤에는 거의 항상 Glue Data Catalog가 있다.

Data Catalog는 본질적으로 **Apache Hive 메타스토어와 호환되는 관리형 메타데이터 저장소**다. Hive 메타스토어를 RDS에 직접 띄워 운영해 본 사람이라면, 그 운영 부담(가용성, 백업, 스키마 버전)을 AWS가 대신 져 주는 서비스라고 이해하면 된다.

## Data Catalog의 구조: 데이터베이스 → 테이블 → 파티션

Catalog는 계층 구조를 가진다.

| 계층 | 의미 | 예시 |
|------|------|------|
| Database | 테이블의 논리적 그룹(네임스페이스) | `sales_db` |
| Table | 스키마 + S3 위치 + 형식 정의 | `orders` |
| Partition | 테이블 내부의 물리적 분할 | `year=2026/month=06` |
| Column | 컬럼 이름과 데이터 타입 | `order_id: bigint` |

여기서 가장 중요한 점은 **테이블이 데이터를 담지 않는다**는 것이다. 테이블은 "실제 데이터는 `s3://bucket/orders/`에 있고, Parquet 형식이며, 컬럼은 이렇다"는 **포인터이자 명세**일 뿐이다. 이 분리 덕분에 같은 S3 데이터를 Athena, Redshift Spectrum, EMR, Glue ETL이 모두 동일한 스키마로 읽을 수 있다.

```sql
-- Catalog에 등록된 테이블 정의(개념적 DDL)
CREATE EXTERNAL TABLE sales_db.orders (
  order_id   BIGINT,
  amount     DECIMAL(10,2),
  status     STRING
)
PARTITIONED BY (year INT, month INT)
STORED AS PARQUET
LOCATION 's3://my-lake/orders/';
```

> 💡 **관련 이론**: "스키마-온-리드(schema-on-read)"는 데이터 레이크의 핵심 사상이다. 전통적 데이터베이스(스키마-온-라이트)는 데이터를 쓰는 순간 스키마를 강제한다. 반대로 데이터 레이크는 원본을 그대로 S3에 저장하고, **읽는 시점에 스키마를 적용**한다. Data Catalog는 바로 이 "읽는 시점의 스키마"를 보관하는 곳이다. 같은 파일에 여러 테이블(다른 스키마)을 매핑할 수도 있는 유연성이 여기서 나온다.

## 크롤러: 메타데이터를 자동으로 채우는 로봇

테이블을 일일이 DDL로 등록하는 건 비현실적이다. 컬럼이 수십 개고 파티션이 매일 늘어나는 데이터에서는 더더욱 그렇다. **Glue 크롤러(Crawler)**는 지정한 데이터 저장소(주로 S3 경로)를 스캔해, 파일 형식과 스키마를 추론하고, 그 결과를 Catalog에 테이블/파티션으로 자동 등록한다.

크롤러의 동작 단계는 다음과 같다.

```
1. 데이터 저장소 연결 (S3 경로, JDBC, DynamoDB 등)
2. Classifier로 형식 판별 (Parquet/JSON/CSV/ORC/Avro...)
3. 스키마 추론 (컬럼명, 타입)
4. 파티션 구조 탐지 (폴더 경로의 key=value 패턴)
5. Catalog에 테이블 생성 또는 기존 테이블 업데이트
```

```bash
# 크롤러 생성과 실행 (AWS CLI)
aws glue create-crawler \
  --name orders-crawler \
  --role AWSGlueServiceRole-lake \
  --database-name sales_db \
  --targets '{"S3Targets":[{"Path":"s3://my-lake/orders/"}]}' \
  --schedule "cron(0 2 * * ? *)"   # 매일 새벽 2시

aws glue start-crawler --name orders-crawler
```

크롤러는 **Classifier**로 형식을 먼저 판별한다. 내장 Classifier가 Parquet, ORC, Avro, JSON, CSV, XML 등 표준 형식을 인식하고, 비표준 형식은 **Custom Classifier**(Grok 패턴, 정규식 등)를 직접 정의해 처리한다. 여러 Classifier를 우선순위 순으로 시도하다가 처음으로 매칭되는 것을 채택한다.

> 🔍 **더 깊이**: 크롤러는 비싸거나 느릴 수 있다. S3 객체가 수백만 개면 매번 전체를 스캔하는 비용이 만만치 않다. 그래서 **증분 크롤(Incremental crawl)** 옵션이 있다. "마지막 크롤 이후 새로 추가된 폴더만" 스캔하도록 설정하면 비용과 시간이 크게 줄어든다. 또한 새 파티션만 늘어나는 테이블이라면, 크롤러 대신 `ALTER TABLE ADD PARTITION`이나 **파티션 프로젝션(Partition Projection, Athena)**으로 크롤러 자체를 없앨 수도 있다.

## 파티션 탐지: 폴더 구조가 곧 인덱스다

크롤러가 가장 똑똑하게 처리하는 부분이 파티션 탐지다. S3 경로가 `s3://my-lake/orders/year=2026/month=06/day=25/` 처럼 **Hive 스타일 `key=value`** 형식이면, 크롤러는 `year`, `month`, `day`를 파티션 컬럼으로 자동 인식한다.

```
s3://my-lake/orders/
├── year=2025/month=12/  ← 파티션 (year=2025, month=12)
├── year=2026/month=05/
└── year=2026/month=06/  ← 새로 추가되면 크롤러가 파티션 등록
```

파티션이 중요한 이유는 **쿼리 프루닝(partition pruning)** 때문이다. `WHERE year=2026 AND month=06`으로 조회하면 Athena는 해당 폴더의 파일만 스캔한다. 파티션이 없으면 매번 전체 데이터를 스캔하므로, 스캔량 기반 과금인 Athena에서는 비용이 폭증한다.

> ⚠️ **함정**: 폴더가 `key=value`가 아니라 그냥 `2026/06/25/`라면 크롤러는 파티션 이름을 자동으로 못 만들고 `partition_0`, `partition_1` 같은 무의미한 이름을 붙인다. 데이터 적재 단계에서 처음부터 Hive 스타일 경로를 쓰는 것이 정석이다. 이미 비-Hive 경로로 쌓였다면, 테이블 정의에서 파티션을 수동 매핑하거나 Athena 파티션 프로젝션으로 우회한다.

## 스키마 추론과 그 한계

크롤러의 스키마 추론은 "파일 샘플을 읽어 타입을 추측"하는 것이라 완벽하지 않다. 대표적인 함정 두 가지를 알아야 한다.

첫째, **타입 추론 충돌**. 같은 컬럼이 어떤 파일에서는 정수(`123`), 다른 파일에서는 문자열(`"N/A"`)로 나타나면 크롤러는 더 넓은 타입(string)으로 올리거나, 폴더별로 다른 스키마를 만들어 버린다.

둘째, **스키마 병합과 테이블 분리**. 한 경로 아래 호환되지 않는 스키마의 파일들이 섞여 있으면, 크롤러는 하나의 테이블이 아니라 여러 테이블로 쪼갤 수 있다. 이를 막으려면 크롤러 설정에서 "데이터 호환 시 단일 스키마로 결합" 옵션을 켠다.

> 🎯 **시나리오**: 매일 새 파일이 `s3://lake/events/dt=YYYY-MM-DD/`에 적재된다. 분석가는 Athena로 어제 데이터만 빠르게 조회하고 싶다. 구성은 (1) 데이터를 처음부터 `dt=` Hive 경로로 적재 → (2) Glue 크롤러를 매일 새벽 증분 크롤로 스케줄 → (3) 크롤러가 새 `dt=` 파티션을 Catalog에 등록 → (4) 분석가는 `WHERE dt='2026-06-25'`로 해당 파티션만 스캔. 새 파티션만 늘어나므로 크롤러 대신 파티션 프로젝션으로 비용을 더 줄일 수도 있다.

## 정리: 모든 분석의 진입점

Data Catalog는 AWS 분석 생태계의 **단일 진실 공급원(single source of truth)**이다. 한 번 등록된 스키마를 Athena, Redshift Spectrum, EMR, Glue ETL이 공유한다. 크롤러는 그 Catalog를 자동으로 채우는 도구이며, 파티션 탐지와 스키마 추론이 핵심 기능이다. 내일은 이 Catalog의 테이블을 입력으로 받아 실제 데이터를 변환하는 **Glue ETL Job**으로 들어간다.

---

## 📝 연습 문제

**문제 1.** Athena, Redshift Spectrum, EMR이 S3의 동일한 데이터를 같은 스키마로 조회할 수 있게 하는 중앙 메타데이터 저장소는?

A) Amazon RDS  
B) AWS Glue Data Catalog  
C) Amazon DynamoDB  
D) AWS Lake Formation 권한 정책  

**정답: B**  
해설: Glue Data Catalog는 Hive 메타스토어 호환 중앙 메타데이터 저장소로, 등록된 스키마를 여러 분석 엔진이 공유한다. RDS와 DynamoDB는 데이터 저장소이지 메타데이터 카탈로그가 아니다. Lake Formation은 그 위에서 접근 권한을 관리하는 별개 계층이다.

---

**문제 2.** S3 경로가 `s3://lake/sales/region=us/year=2026/`처럼 구성되어 있을 때 Glue 크롤러가 수행하는 동작으로 옳은 것은?

A) `region`과 `year`를 무시하고 단일 비파티션 테이블만 만든다  
B) 파일을 모두 DynamoDB로 복사한다  
C) `region`과 `year`를 파티션 컬럼으로 자동 인식해 Catalog에 등록한다  
D) Hive 스타일 경로는 지원하지 않아 오류를 낸다  

**정답: C**  
해설: 크롤러는 `key=value` Hive 스타일 경로를 파티션으로 자동 탐지해 파티션 컬럼으로 등록한다. 이렇게 등록된 파티션은 쿼리 프루닝으로 스캔량과 비용을 줄인다. 크롤러는 데이터를 복사하지 않고 메타데이터만 다룬다.

---

**문제 3.** Glue Data Catalog의 테이블에 대한 설명으로 가장 정확한 것은?

A) 테이블은 스키마와 S3 위치, 형식을 담은 메타데이터 명세이며 데이터 자체는 보관하지 않는다  
B) 테이블은 실제 데이터 행을 자체 저장소에 보관한다  
C) 테이블 하나는 반드시 하나의 분석 엔진에서만 사용할 수 있다  
D) 테이블을 만들면 원본 S3 파일이 Parquet으로 자동 변환된다  

**정답: A**  
해설: Catalog 테이블은 "데이터는 어디에 어떤 형식·스키마로 있다"를 가리키는 포인터이자 명세다. 데이터는 S3에 그대로 있고, 여러 엔진이 같은 테이블 정의를 공유한다. 테이블 등록만으로 파일 형식이 변환되지는 않는다.

---

**문제 4.** 수백만 개의 S3 객체를 가진 테이블에서 매일 새 폴더만 추가된다. 크롤러 실행 비용과 시간을 줄이는 가장 적절한 방법은?

A) 매번 전체 경로를 풀 스캔하도록 둔다  
B) 크롤러 동시 실행 수를 늘린다  
C) S3 버킷을 매일 새로 만든다  
D) 증분 크롤(Incremental crawl)을 사용하거나 Athena 파티션 프로젝션으로 크롤러를 대체한다  

**정답: D**  
해설: 새 폴더만 늘어나는 패턴에서는 증분 크롤로 신규 폴더만 스캔하거나, 파티션 규칙이 일정하면 Athena 파티션 프로젝션으로 크롤러 자체를 없애 비용을 크게 줄일 수 있다. 전체 풀 스캔은 비용을 키우고, 동시 실행이나 버킷 분리는 해결책이 아니다.

---

**문제 5.** 비표준 로그 형식이라 내장 Classifier가 스키마를 제대로 추론하지 못한다. 적절한 대응은?

A) 크롤러를 쓰지 말고 모든 테이블을 손으로 DDL 작성한다  
B) 데이터를 무조건 CSV로 변환한다  
C) Grok 패턴이나 정규식 기반 Custom Classifier를 정의해 크롤러에 적용한다  
D) S3 대신 DynamoDB에 저장한다  

**정답: C**  
해설: 내장 Classifier가 인식하지 못하는 비표준 형식은 Grok/정규식 기반 Custom Classifier를 정의해 크롤러에 우선순위로 적용하면 스키마를 추론할 수 있다. 손수 DDL이나 형식 강제 변환은 비효율적이며 문제의 본질을 해결하지 못한다.

---
