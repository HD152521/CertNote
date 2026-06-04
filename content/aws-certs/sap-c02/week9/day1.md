# Day 41 - 데이터 레이크 아키텍처: S3, Glue, Athena의 내부 동작과 비용 모델

데이터 레이크라는 단어는 묘하게 낭만적이다. "모든 데이터를 한곳에 던져두면 나중에 필요할 때 꺼내 쓴다"는 약속은 깔끔하게 들린다. 그런데 production에서 데이터 레이크를 운영해 본 사람은 안다. 잘못 설계한 레이크는 "데이터 늪(data swamp)"이 되고, 누구도 스키마를 모르고, Athena 쿼리 한 번에 $40씩 청구되며, 작은 파일 수백만 개가 S3 LIST 비용만 매달 수백 달러씩 먹는다. 데이터 레이크의 진짜 기술은 "데이터를 어디에 던지느냐"가 아니라 "어떤 포맷으로, 어떻게 파티셔닝해서, 어떤 메타데이터 카탈로그로 묶느냐"에 있다.

SAP-C02 시험에서 데이터 레이크는 분석(Analytics) 도메인의 중심이다. 단순히 "S3에 저장하고 Athena로 쿼리한다" 수준의 문제는 거의 없다. 대부분은 "페타바이트급 로그를 가장 비용 효율적으로 쿼리하는 방법", "여러 계정·여러 팀이 같은 데이터 레이크를 안전하게 공유하는 거버넌스", "스트리밍과 배치를 하나의 카탈로그로 통합하는 아키텍처" 같은 운영·비용·거버넌스 관점이다. 오늘은 그 관점을 만드는 내부 동작을 본다. 왜 Parquet이 비용을 90% 줄이는지, Athena가 실제로 S3에서 무엇을 스캔하는지, Glue Catalog가 어떻게 Hive Metastore의 유산을 이어받았는지를 분해한다.

## 왜 Schema-on-Read인가 — 데이터 웨어하우스가 풀지 못한 문제

데이터 레이크의 철학을 이해하려면 먼저 데이터 웨어하우스가 무엇을 강제했는지 봐야 한다. 전통적인 웨어하우스(Teradata, Oracle, 초기 Redshift)는 **Schema-on-Write**다. 데이터를 적재하기 전에 스키마를 먼저 정의하고, ETL 파이프라인이 원본을 그 스키마에 맞게 변환해서 넣는다. 이 모델의 장점은 쿼리 시점에 데이터가 이미 정형화되어 있어 빠르고 일관적이라는 것이다. 단점은 치명적이다. 새로운 데이터 소스가 생기거나 분석 요구가 바뀌면 스키마를 다시 설계하고 전체 ETL을 다시 짜야 한다. "일단 다 저장해두고 나중에 무엇을 분석할지 정하자"는 빅데이터 시대의 요구와 정면으로 충돌한다.

**Schema-on-Read**는 이 순서를 뒤집는다. 원본을 변환 없이 그대로 저장하고(JSON이든 CSV든 로그든), 스키마는 **읽는 시점에** 적용한다. 같은 원본 파일에 대해 분석가 A는 5개 컬럼만 보는 스키마를, 분석가 B는 30개 컬럼을 보는 스키마를 동시에 정의할 수 있다. 데이터를 버리지 않고 보관하므로 미래의 알 수 없는 분석 요구에 대응할 수 있다. S3가 데이터 레이크의 기반이 된 이유가 정확히 이것이다. S3는 객체에 스키마를 강제하지 않고, 사실상 무한 용량에, 11 나인(99.999999999%) 내구성으로, GB당 월 $0.023이라는 가격으로 "일단 다 저장"을 가능하게 한다.

> 💡 **관련 이론**: Schema-on-Read는 사실 새로운 개념이 아니다. 2004년 Google의 MapReduce 논문과 2006년 Hadoop의 등장에서 시작된 패러다임으로, "구조화되지 않은 대량 데이터를 분산 파일시스템(HDFS)에 저장하고 처리 시점에 구조를 부여한다"는 발상이다. AWS 데이터 레이크는 HDFS를 S3로, MapReduce를 Athena/EMR/Glue로 대체한 클라우드 네이티브 버전이라고 볼 수 있다. 핵심 차이는 컴퓨팅과 스토리지의 **분리(decoupling)**다. Hadoop은 데이터가 있는 노드에서 연산하는 data locality를 추구했지만(스토리지=컴퓨팅 결합), S3 기반 레이크는 스토리지(S3)와 컴퓨팅(Athena/EMR)을 완전히 분리해 각각 독립적으로 스케일링한다. 이 분리가 가능한 이유는 S3의 처리량이 prefix당 초당 5,500 GET을 지원할 만큼 충분히 높고, AWS 내부 네트워크 대역폭이 컴퓨팅 노드와 S3 사이를 병목 없이 잇기 때문이다.

> 🔍 **더 깊이**: Schema-on-Read의 함정은 "스키마를 읽는 시점에 추론한다"는 점이 곧 "스키마를 아무도 책임지지 않는다"는 뜻이 될 수 있다는 것이다. 이게 data swamp의 본질이다. 그래서 성숙한 레이크는 Schema-on-Read의 유연함을 유지하면서도 **메타데이터 카탈로그(Glue Catalog)**로 "이 prefix에는 이런 스키마의 데이터가 있다"는 계약을 명시적으로 관리한다. 즉 현실의 데이터 레이크는 순수한 Schema-on-Read가 아니라 "카탈로그로 관리되는 Schema-on-Read"다. 그리고 Iceberg/Hudi/Delta 같은 테이블 포맷이 등장하면서, 레이크에 ACID 트랜잭션과 스키마 진화 추적까지 들어와 사실상 웨어하우스와 레이크의 경계가 흐려지고 있다. 이게 "레이크하우스(Lakehouse)" 개념이다.

## 3계층 아키텍처 — Raw / Curated / Trusted가 신뢰의 경계인 이유

데이터 레이크는 보통 세 개의 계층(혹은 메달리온 아키텍처에서 Bronze/Silver/Gold)으로 나뉜다. 이건 임의의 관례가 아니라 **데이터 신뢰도와 변환 비용의 경계**를 명시하는 설계다.

**Raw(Bronze)** 계층은 원본을 그대로 받는다. Kinesis Firehose가 떨군 JSON 로그, RDS에서 export한 CSV, 외부 API 응답 등이 변환 없이 들어온다. 이 계층의 핵심 원칙은 **불변성(immutability)**이다. 한 번 들어온 원본은 절대 수정하지 않는다. 그래야 나중에 ETL 로직에 버그가 발견되어도 원본부터 다시 처리할 수 있다(reprocessing). Raw 계층은 신뢰할 수 없는 데이터이므로, 분석가가 직접 쿼리하면 안 된다.

**Curated(Silver)** 계층은 정제된 데이터다. Glue ETL이 Raw를 읽어 중복 제거, 결측치 처리, 타입 정규화, 그리고 결정적으로 **Parquet으로 포맷 변환 + 파티셔닝**을 적용해 떨군다. 이 계층부터 Athena 쿼리가 효율적이 된다.

**Trusted(Gold)** 계층은 비즈니스 로직이 적용된 최종 산출물이다. 집계된 일별 매출, ML 피처 테이블, BI 대시보드용 사전 조인된 와이드 테이블 등이 여기 있다. 분석가와 BI 도구는 주로 이 계층을 본다.

> 📚 **사례**: 한 글로벌 미디어 회사가 초기에 계층 분리 없이 Kinesis Firehose가 떨군 raw JSON에 Athena 쿼리를 직접 걸었다. 일별 클릭스트림 데이터가 수 TB였고, 분석가 한 명이 `SELECT * FROM clickstream WHERE date = '2024-01-15'`를 실행할 때마다 압축 안 된 JSON 전체(약 3TB)를 스캔해 쿼리 한 번에 $15씩 청구됐다. 하루 50명의 분석가가 평균 10번 쿼리하면 월 $225,000. Curated 계층을 도입해 Parquet + snappy 압축 + `date` 파티션으로 변환한 뒤, 같은 쿼리가 약 30GB만 스캔하게 되어 비용이 100배 줄었다. 핵심은 "분석가가 raw를 직접 만지게 두면 비용이 통제 불능이 된다"는 점이다. SAP 시험의 "Athena 비용이 폭증한다" 시나리오는 거의 이 패턴이다.

## Parquet이 비용을 90% 줄이는 진짜 메커니즘

"Parquet을 쓰면 Athena 비용이 준다"는 말은 모두가 외우지만, 정확히 왜 그런지를 분해할 수 있어야 시험에서 변형 문제를 푼다. Athena는 **스캔한 데이터 1TB당 $5**를 청구한다(2024년 기준). 따라서 비용을 줄이려면 "스캔량"을 줄여야 하고, Parquet은 세 가지 독립적인 방식으로 스캔량을 줄인다.

**1. 컬럼 지향 저장(Columnar Storage).** CSV/JSON은 행 단위(row-oriented)로 저장한다. `SELECT user_id FROM events`를 실행하면 user_id만 필요하지만, 행 기반 포맷은 한 행의 모든 컬럼이 디스크에 인접해 있어 전체를 읽어야 한다. Parquet은 같은 컬럼의 값을 물리적으로 모아 저장한다. user_id만 필요하면 user_id 컬럼 블록만 읽고 나머지 50개 컬럼은 건드리지 않는다. 50개 컬럼 중 1개만 쓰면 이론상 스캔량이 1/50로 준다.

**2. 압축 효율(Compression).** 같은 컬럼의 값은 비슷한 패턴을 가진다(같은 타입, 종종 반복되는 값). Parquet은 컬럼별로 dictionary encoding, run-length encoding, bit-packing을 적용해 CSV보다 훨씬 높은 압축률을 낸다. snappy로도 원본 대비 5~10배 압축이 흔하다.

**3. Predicate Pushdown + 통계.** Parquet 파일은 내부적으로 row group 단위로 나뉘고, 각 row group의 메타데이터에 **min/max 통계**를 담는다. `WHERE timestamp > '2024-01-15'`라는 조건이 있으면, Athena는 row group의 max 통계를 보고 "이 row group의 모든 값이 조건 범위 밖"이면 그 블록을 통째로 건너뛴다. 이걸 predicate pushdown이라 한다.

> 💡 **관련 이론**: Parquet은 Google의 2010년 Dremel 논문에서 영감을 받은 포맷이다. Dremel은 중첩된(nested) 데이터를 컬럼 형태로 분해하는 "record shredding and assembly" 알고리즘을 도입했고, 이게 Parquet의 핵심 아이디어다. Dremel은 BigQuery의 기반이 되었고, Parquet은 Hadoop 생태계의 오픈소스 구현이다. 컬럼 지향 저장 자체는 더 오래된 개념으로, 2005년 MIT의 C-Store 논문(나중에 Vertica가 됨)이 학술적 토대다. SAP 관점에서 중요한 건, Athena(Presto/Trino 기반), Redshift Spectrum, EMR Spark, Snowflake가 모두 Parquet을 1급 시민으로 지원한다는 점이다. 즉 Parquet으로 한 번 변환해 두면 여러 쿼리 엔진에서 재사용할 수 있어 vendor lock-in을 줄인다.

> 🔍 **더 깊이**: ORC(Optimized Row Columnar)와 Parquet은 둘 다 컬럼 지향이지만 미묘하게 다르다. ORC는 Hortonworks가 Hive를 위해 만들어 stripe 단위 + 더 풍부한 인덱스(bloom filter 내장)를 가지고, Hive/EMR 환경에서 약간 유리하다. Parquet은 Cloudera/Twitter 기원으로 Spark·Presto·Impala 생태계에서 더 넓게 쓰인다. 실무 기준 차이는 크지 않지만, "Hive 워크로드 마이그레이션"이면 ORC, "범용 분석 레이크"면 Parquet이 무난한 선택이다. Avro는 다르다. Avro는 행 지향이고 스키마를 파일에 내장하므로 **스키마 진화에 강하고 스트리밍/쓰기 집약 워크로드**(Kafka, Kinesis)에 적합하다. 그래서 실무 패턴은 "스트리밍 수집은 Avro → 배치 변환 후 Parquet으로 저장"인 경우가 많다.

> ⚠️ **함정**: "Parquet이 항상 빠르다"는 아니다. 작은 파일(예: 1MB 미만)이 수백만 개 있으면 Parquet의 장점이 사라진다. 각 파일의 footer 메타데이터를 읽는 오버헤드와 S3 GET 요청 수가 폭증하기 때문이다. 이게 **Small File Problem**이다. 이상적인 Parquet 파일 크기는 128MB~1GB다. 시험에서 "Athena 쿼리가 느리고 파일이 수백만 개"라는 시나리오가 나오면, 답은 "파일 포맷 변경"이 아니라 **compaction(작은 파일 병합)**이다. Glue ETL의 `coalesce`/`repartition`이나 Athena CTAS로 작은 파일을 큰 파일로 다시 써야 한다.

## 파티셔닝과 Partition Projection — 메타데이터 병목의 해결

파티셔닝은 데이터를 디렉터리 구조(S3 prefix)로 분할하는 것이다. `s3://lake/events/year=2024/month=05/day=29/`처럼 키를 설계하면, `WHERE year=2024 AND month=05`라는 조건이 들어왔을 때 Athena는 해당 prefix 아래만 스캔하고 나머지 prefix는 LIST조차 하지 않는다(**partition pruning**). 이건 Parquet의 row group skipping과 별개의, 더 거친 단위의 스캔 회피다.

문제는 파티션이 많아질 때다. Glue Catalog는 각 파티션을 메타데이터 레코드로 저장하는데, 일별 파티션이 5년치면 약 1,800개, 거기에 시간별·지역별을 곱하면 수십만~수백만 개가 된다. Athena는 쿼리 실행 전에 Glue Catalog에 `GetPartitions` API를 호출해 어떤 파티션이 조건에 맞는지 조회하는데, 파티션이 수십만 개면 이 메타데이터 조회 자체가 쿼리보다 오래 걸린다.

**Partition Projection**(2020 도입)은 이 병목을 우아하게 해결한다. 파티션 정보를 카탈로그에 일일이 저장하는 대신, 테이블 속성(TBLPROPERTIES)에 "year는 2020~2030의 정수, month는 1~12, S3 경로 템플릿은 이렇다"는 **규칙**을 선언한다. Athena는 카탈로그를 조회하지 않고 이 규칙으로 파티션 경로를 **계산(project)**해서 곧장 S3에 접근한다. 메타데이터 조회가 0이 되어 수만 파티션에서도 즉시 쿼리가 시작된다.

```sql
CREATE EXTERNAL TABLE logs (
  message string,
  level string
)
PARTITIONED BY (year int, month int, day int)
STORED AS PARQUET
LOCATION 's3://lake/logs/'
TBLPROPERTIES (
  'projection.enabled'='true',
  'projection.year.type'='integer',
  'projection.year.range'='2020,2030',
  'projection.month.type'='integer',
  'projection.month.range'='1,12',
  'projection.month.digits'='2',
  'projection.day.type'='integer',
  'projection.day.range'='1,31',
  'projection.day.digits'='2',
  'storage.location.template'='s3://lake/logs/${year}/${month}/${day}/'
);
```

> 🎯 **시나리오**: "한 보안팀이 5년치 VPC Flow Log를 S3에 시간별 파티션으로 저장한다. 총 파티션이 약 44,000개(5년 × 365일 × 24시간)다. Athena 쿼리를 실행하면 쿼리 자체보다 파티션 메타데이터 조회에 더 오래 걸린다. 운영 부담 없이 쿼리를 빠르게 하려면?" — 답은 **Partition Projection**. Glue Crawler로 44,000개 파티션을 일일이 등록하고 매번 `MSCK REPAIR TABLE`이나 `ALTER TABLE ADD PARTITION`을 돌리는 대신, 테이블 속성에 시간 범위 규칙만 선언하면 Athena가 파티션 경로를 직접 계산한다. 카탈로그 조회가 사라지고 운영 자동화도 불필요해진다. 시험에서 "수만~수십만 파티션 + 메타데이터 조회 느림" 키워드는 거의 Partition Projection이 답이다.

> ⚠️ **함정**: 파티션을 너무 세분화하면(예: 분 단위, 사용자 ID별) Small File Problem과 정반대로 "파티션 폭증" 문제가 생긴다. 각 파티션에 데이터가 거의 없는데 파티션만 수백만 개가 되면, partition pruning의 이득보다 메타데이터·LIST 오버헤드가 커진다. 일반 규칙은 "각 파티션에 최소 수백 MB~수 GB의 데이터가 있도록" 파티션 키를 고르는 것이다. 카디널리티가 높은 컬럼(user_id, request_id)은 파티션 키로 부적합하고, 시간·지역·카테고리처럼 카디널리티가 적당한 컬럼이 좋다.

## Glue Data Catalog — Hive Metastore의 유산을 잇다

Glue Data Catalog는 데이터 레이크의 "전화번호부"다. "이 S3 prefix에는 이런 스키마의 이런 테이블이 있다"는 메타데이터를 중앙에 저장한다. 중요한 설계 결정은 이게 **Hive Metastore(HMS) 호환**이라는 점이다.

왜 Hive Metastore 호환이 중요한가. Hive는 2009년 Facebook이 만든 SQL-on-Hadoop 도구로, "HDFS의 파일에 테이블 스키마를 입히는 메타데이터 저장소(Metastore)"라는 개념을 정립했다. 이후 Presto, Spark SQL, Impala 등 거의 모든 빅데이터 쿼리 엔진이 HMS를 표준 인터페이스로 채택했다. AWS가 Glue Catalog를 HMS 호환으로 만들었기 때문에, Athena(Presto 계열), EMR(Spark/Hive), Redshift Spectrum이 **같은 카탈로그를 공유**할 수 있다. 한 번 스키마를 등록하면 세 엔진이 모두 같은 테이블 정의를 본다. 이게 "단일 진실 공급원(single source of truth)"으로서 카탈로그의 가치다.

**Glue Crawler**는 S3를 스캔해 스키마를 자동 추론하고 카탈로그에 등록·갱신한다. JSON 로그의 필드, CSV의 헤더, Parquet의 임베디드 스키마를 읽어 테이블과 파티션을 만든다. 다만 Crawler는 만능이 아니다. 스키마가 자주 바뀌는 JSON에서 타입을 잘못 추론하거나, 파티션이 많으면 Crawler 실행 시간·비용이 늘고, classifier 설정이 까다로울 수 있다. 그래서 스키마가 안정적이면 DDL로 테이블을 직접 정의하고 Partition Projection을 쓰는 게 Crawler보다 깔끔한 경우가 많다.

> 🔍 **더 깊이**: Glue Catalog vs Lake Formation의 관계가 시험에서 자주 헷갈린다. Glue Catalog는 메타데이터 저장소 자체다. Lake Formation은 그 위에 얹는 **거버넌스·권한 레이어**다. Lake Formation을 쓰면 IAM 정책 대신 "이 IAM 역할은 이 데이터베이스의 이 테이블의 이 컬럼만, 이 행 필터 조건으로만 볼 수 있다"는 **세분화된(fine-grained) 권한**을 카탈로그 수준에서 중앙 관리한다. 컬럼 수준·행 수준·셀 수준 보안, 그리고 LF-Tags 기반 태그 권한, 크로스 계정 데이터 공유가 핵심 기능이다. SAP 시험에서 "여러 팀/계정이 같은 데이터 레이크를 공유하되 각자 볼 수 있는 컬럼·행이 다르다"는 거버넌스 시나리오는 거의 Lake Formation이 답이다. S3 버킷 정책이나 IAM만으로는 컬럼·행 수준 제어가 불가능하기 때문이다.

> 📚 **사례**: 한 의료 데이터 분석 플랫폼이 여러 병원의 환자 데이터를 하나의 레이크에 모았다. 데이터 과학팀은 진단·치료 컬럼은 봐야 하지만 환자 이름·주민번호 컬럼은 보면 안 됐다(HIPAA). 처음엔 IAM 정책으로 S3 prefix를 나눠 막으려 했지만, 컬럼 단위 제어가 불가능해 결국 민감 컬럼을 별도 테이블로 분리하는 복잡한 ETL을 만들어야 했다. Lake Formation 도입 후 같은 테이블에 컬럼 수준 권한과 행 수준 필터(특정 병원 데이터만)를 선언적으로 걸어 ETL 복잡성을 제거했다. 추가로 LF-Tags로 "PII 태그가 붙은 모든 컬럼은 분석팀에게 차단"이라는 정책을 한 번에 적용했다.

## Athena의 내부 — Presto/Trino 위의 서버리스 쿼리

Athena는 서버리스 SQL 쿼리 서비스지만, 그 내부는 오픈소스 분산 쿼리 엔진 **Presto/Trino**다(Athena Engine v2가 Presto, v3가 Trino 기반). Athena가 서버리스인 이유는 AWS가 Presto 클러스터를 워크로드에 맞춰 동적으로 띄우고 내리기 때문이다. 사용자는 클러스터를 관리하지 않고 쿼리당 스캔량으로만 과금된다.

이 모델의 함의가 중요하다. Athena는 **무상태 쿼리 엔진**이므로 인덱스가 없다(RDBMS의 B-tree 인덱스 같은 게 없다). 모든 최적화는 "스캔할 데이터를 물리적으로 줄이는 것"에서 나온다. 그래서 앞서 본 Parquet(컬럼 지향), 파티셔닝(prefix pruning), 압축이 Athena 성능·비용의 전부라고 해도 과언이 아니다. RDBMS처럼 인덱스를 추가해 튜닝하는 발상은 통하지 않는다.

Athena의 주요 기능을 운영 관점으로 정리하면:

- **Workgroup**: 쿼리를 팀·용도별로 격리하고, 쿼리당 스캔 데이터 한도(per-query data scanned limit)를 걸어 비용 폭주를 막는다. 비용 통제의 1차 방어선이다.
- **Result Reuse**(2023): 같은 쿼리를 일정 시간 내 다시 실행하면 이전 결과를 재사용해 스캔 비용 0. 대시보드가 같은 쿼리를 반복할 때 유용.
- **CTAS(Create Table As Select)**: 쿼리 결과를 새 테이블로 저장하면서 포맷·압축·파티션을 적용. 경량 ETL로 쓸 수 있다.
- **Federated Query**: Lambda 커넥터를 통해 S3 외부(DynamoDB, RDS, CloudWatch, Redshift)의 데이터를 SQL로 조인. 데이터 이동 없이 여러 소스를 통합 쿼리.

> 💡 **관련 이론**: Athena가 인덱스 없이도 페타바이트를 처리할 수 있는 건 **massively parallel processing(MPP)** 덕분이다. Presto는 쿼리를 stage로 쪼개고 각 stage를 여러 worker에 분산해 S3의 서로 다른 파일/파티션을 병렬로 읽는다. S3가 prefix당 초당 5,500 GET을 지원하므로, 데이터를 여러 prefix에 분산해 두면 Athena가 그만큼 병렬로 읽어 처리량이 선형으로 늘어난다. 이게 컴퓨팅-스토리지 분리 아키텍처의 위력이다. 전통 웨어하우스는 디스크 I/O가 노드에 묶여 있어 이런 탄력적 병렬화가 어렵다. 비교하자면 BigQuery도 같은 철학(Dremel + Colossus 스토리지 분리)이고, Snowflake는 컴퓨팅(virtual warehouse)과 스토리지(S3/GCS/Blob)를 분리한 같은 계열이다.

> 🔍 **더 깊이**: Athena Federated Query의 동작 원리가 흥미롭다. 각 데이터 소스(DynamoDB, RDS 등)에 대응하는 **Lambda 커넥터**가 있고, Athena는 쿼리 실행 중 필요한 데이터를 그 Lambda를 호출해 가져온다. 커넥터는 가능한 한 predicate pushdown을 데이터 소스로 내려보내(예: DynamoDB의 partition key 조건) 가져오는 데이터를 최소화한다. 단점은 Lambda를 거치므로 S3 직접 쿼리보다 느리고, 대량 데이터 조인 시 Lambda 호출·전송 비용이 든다는 것이다. 그래서 Federated Query는 "S3 레이크 데이터를 운영 DB의 소량 참조 데이터와 조인"하는 패턴에 적합하지, "운영 DB 전체를 분석"하는 용도가 아니다. 후자는 DMS로 S3에 복제 후 쿼리하는 게 정석이다.

## Glue ETL과 Job Bookmark — 증분 처리의 멱등성

Glue ETL은 Apache Spark 기반 매니지드 ETL이다. 서버를 관리하지 않고 PySpark/Scala 코드로 Raw → Curated 변환을 돌린다. SAP 시험에서 Glue ETL 관련 핵심 개념은 **Job Bookmark**다.

매일 새 로그가 Raw에 쌓이는데, Glue Job을 매일 돌릴 때마다 전체 데이터를 다시 처리하면 비용·시간이 누적된다. Job Bookmark는 "이전 실행에서 어디까지 처리했는지"를 상태로 저장해, 다음 실행 때 **새로 추가된 데이터만** 처리한다. 이게 증분 ETL이다. Bookmark는 S3 객체의 경우 파일 이름·타임스탬프를, JDBC 소스의 경우 기본 키나 타임스탬프 컬럼을 추적한다.

> ⚠️ **함정**: Job Bookmark의 멱등성(idempotency)에 대한 오해가 흔하다. Bookmark는 "이미 처리한 입력을 건너뛴다"는 것이지, 출력의 중복을 막아주지는 않는다. Job이 실패해 중간까지 출력하고 죽으면, 재실행 시 Bookmark가 정확히 어디까지 커밋됐는지에 따라 중복 출력이 생길 수 있다. 정확한 exactly-once가 필요하면 Iceberg/Hudi 같은 트랜잭션 테이블 포맷의 MERGE(upsert)를 쓰거나, 출력 단계에서 중복 제거 키를 두어야 한다. 시험에서 "Glue Job 재실행 시 중복 데이터" 시나리오는 Bookmark 활성화 + 멱등 출력 설계의 조합으로 본다.

Glue 생태계의 역할 분리를 명확히 하면:
- **Glue Crawler**: 스키마 추론·카탈로그 등록 (메타데이터)
- **Glue ETL(Spark Job)**: 대규모 변환·조인 (코드 기반)
- **Glue DataBrew**: 노코드 비주얼 데이터 프로파일링·정제 (분석가용, 250+ 변환)
- **Glue Studio**: 비주얼 ETL 캔버스 (드래그앤드롭으로 Spark Job 생성)
- **Glue Streaming**: Kinesis/Kafka 입력의 실시간 ETL

## 레이크하우스 — Iceberg/Hudi/Delta가 바꾼 것

전통적인 데이터 레이크의 약점은 트랜잭션이 없다는 것이다. S3에 Parquet 파일을 쓰는 도중 쿼리가 들어오면 부분적으로 쓰인 파일을 읽을 수 있고(원자성 없음), UPDATE/DELETE가 어렵고(파일을 통째로 다시 써야 함), 동시 쓰기 시 충돌을 막을 방법이 없다. GDPR의 "잊혀질 권리"로 특정 사용자 데이터를 DELETE해야 할 때, 전통 레이크에서는 해당 파티션 전체를 다시 쓰는 비효율을 감수해야 했다.

**Apache Iceberg, Hudi, Delta Lake**는 이 문제를 푸는 **테이블 포맷**이다. Parquet 파일 위에 메타데이터 레이어(매니페스트, 트랜잭션 로그)를 얹어 다음을 제공한다:

- **ACID 트랜잭션**: 동시 쓰기에도 일관성 보장
- **UPDATE/DELETE/MERGE**: 행 수준 변경(GDPR 삭제, upsert)
- **시간 여행(Time Travel)**: 특정 시점의 스냅샷 조회, 롤백
- **스키마 진화(Schema Evolution)**: 컬럼 추가·삭제·이름 변경 추적

AWS는 Glue 4.0+ 및 Athena Engine v3에서 Iceberg를 네이티브 지원하고, S3 Tables(2024)로 Iceberg 테이블을 매니지드로 운영하는 옵션도 추가했다.

> 🎯 **시나리오**: "GDPR 준수를 위해 데이터 레이크에서 특정 사용자의 모든 레코드를 삭제해야 한다. 데이터는 5년치 클릭스트림이고 수천 파티션에 흩어져 있다. 사용자 삭제 요청이 매주 수백 건 들어온다. 가장 운영 효율적인 구성은?" — 답은 **Iceberg(또는 Hudi/Delta) 테이블 포맷 + MERGE/DELETE**. 전통 Parquet 레이크에서는 삭제 대상이 포함된 파티션 전체를 읽어 해당 행만 빼고 다시 쓰는 비효율적 reprocessing이 필요하다. Iceberg는 행 수준 DELETE(merge-on-read 또는 copy-on-write)를 지원해 영향받는 파일만 효율적으로 갱신하고, 트랜잭션 로그로 일관성을 유지한다. 시험에서 "데이터 레이크 + DELETE/UPDATE/GDPR/upsert"는 거의 테이블 포맷이 답이다.

> 📚 **사례**: 한 광고 기술 회사가 실시간 입찰 로그를 전통 Parquet 레이크에 저장했는데, 늦게 도착하는 데이터(late-arriving data)와 정정 이벤트(correction) 때문에 같은 입찰 ID의 데이터가 여러 번 들어왔다. 매번 전체 파티션을 다시 쓰는 dedup 배치가 4시간씩 걸렸다. Apache Hudi로 전환해 입찰 ID를 record key로 한 upsert(MERGE)를 적용하니, 늦게 도착한 정정 데이터만 해당 파일을 갱신해 배치가 20분으로 줄었다. Hudi의 copy-on-write vs merge-on-read 선택은 "읽기 빈도 vs 쓰기 빈도"의 트레이드오프인데, 읽기가 많으면 copy-on-write(읽기 빠름), 쓰기가 많으면 merge-on-read(쓰기 빠름)를 고른다.

## 비용·성능 안티패턴 정리

데이터 레이크 운영에서 반복적으로 나타나는 안티패턴을 SAP 관점으로 묶으면:

- **raw에 직접 쿼리**: Curated 계층(Parquet+파티션) 없이 raw JSON에 Athena를 걸면 비용 폭주. → 3계층 분리.
- **작은 파일 폭증**: Firehose가 1분마다 작은 파일을 떨구면 Small File Problem. → 버퍼 크기 키우기, compaction, Firehose의 dynamic partitioning + 큰 버퍼.
- **파티션 미사용 또는 과세분화**: 파티션 없으면 full scan, 너무 세분화하면 메타데이터 폭증. → 적정 카디널리티 파티션 키.
- **Crawler 남용**: 안정적 스키마에 Crawler를 매시간 돌리면 불필요한 비용·시간. → DDL + Partition Projection.
- **Workgroup 미설정**: 비용 한도 없이 분석가가 `SELECT *`를 남발. → Workgroup per-query 한도.

## 정리하며

데이터 레이크의 본질은 "스토리지와 컴퓨팅의 분리, 그리고 카탈로그로 관리되는 Schema-on-Read"다. S3는 무한·저렴·내구성 높은 스토리지를 제공하고, Glue Catalog는 그 위에 스키마 계약을 입히며, Athena/EMR/Redshift Spectrum이 같은 카탈로그를 공유해 각자의 쿼리 엔진으로 접근한다. 비용·성능의 거의 전부는 **포맷(Parquet)·파티셔닝·압축**이라는 물리적 데이터 레이아웃에서 결정되고, 거버넌스는 Lake Formation의 세분화된 권한으로, 트랜잭션은 Iceberg/Hudi/Delta 테이블 포맷으로 보강된다.

SAP 시험에서 자주 등장하는 카테고리는 (1) "Athena 비용 절감" → Parquet+파티션+압축, (2) "수만 파티션 메타데이터 병목" → Partition Projection, (3) "다계정/다팀 데이터 거버넌스" → Lake Formation, (4) "데이터 레이크 DELETE/upsert/GDPR" → Iceberg/Hudi/Delta, (5) "여러 데이터 소스 통합 쿼리" → Athena Federated Query로 거의 매핑된다. 다음 day에서는 이 데이터 레이크 위에서 실시간 스트리밍을 처리하는 Kinesis 생태계를 본다.

---

## 📝 연습 문제

**문제 1.** 한 분석팀이 raw JSON 로그(일별 3TB, 압축 안 됨)에 Athena 쿼리를 직접 실행해 쿼리당 $15가 청구된다. 50명이 하루 10번 쿼리한다. 가장 큰 비용 절감을 제공하는 변경은?

A) Athena Workgroup을 하나로 통합
B) Glue ETL로 Parquet + snappy 압축 + 날짜 파티션의 Curated 계층 생성
C) Result Reuse만 활성화
D) S3 Lifecycle로 30일 후 Glacier 이동

**정답: B**
해설: Athena는 스캔 데이터 1TB당 $5로 과금되므로 비용 절감의 핵심은 스캔량 감소다. Parquet(컬럼 지향으로 필요한 컬럼만 스캔)+압축(snappy로 5~10배 축소)+파티션(WHERE 조건의 prefix만 스캔)을 결합하면 스캔량이 100배 가까이 줄어 비용도 그만큼 감소한다. A(Workgroup)는 비용 격리·한도 설정이지 절감 자체가 아니다. C(Result Reuse)는 동일 쿼리 반복에만 효과가 있어 다양한 쿼리에는 제한적. D(Lifecycle)는 스토리지 비용 절감이지 쿼리 스캔 비용과 무관하며, Glacier 데이터는 Athena가 직접 쿼리하지도 못한다. 함정: "Athena 비용 폭증"은 거의 항상 raw에 직접 쿼리하는 문제이고 답은 Curated 계층(Parquet+파티션+압축)이다.

---

**문제 2.** 보안팀이 5년치 VPC Flow Log를 시간별 파티션으로 저장한다. 파티션이 약 44,000개이고, Athena 쿼리 시 파티션 메타데이터 조회(GetPartitions)에 쿼리보다 더 오래 걸린다. 운영 자동화 부담 없이 쿼리를 빠르게 하려면?

A) Glue Crawler를 매시간 실행해 파티션을 미리 등록
B) Partition Projection을 활성화해 파티션 경로를 규칙으로 계산
C) 파티션을 일별로 줄여 365개로 축소
D) Redshift Spectrum으로 전환

**정답: B**
해설: Partition Projection은 파티션 정보를 카탈로그에 일일이 저장하는 대신 TBLPROPERTIES에 범위·타입·경로 템플릿 규칙을 선언하고, Athena가 카탈로그 조회 없이 파티션 경로를 직접 계산하게 한다. 수만 파티션에서도 GetPartitions 호출이 0이 되어 즉시 쿼리가 시작되고, MSCK REPAIR나 ALTER TABLE ADD PARTITION 같은 운영 자동화도 불필요하다. A는 Crawler 실행 비용·시간이 오히려 늘고 근본 해결이 아님. C는 시간별 분석 능력을 잃음. D는 같은 카탈로그를 쓰므로 메타데이터 병목이 동일하게 발생. 함정: "수만 파티션 + 메타데이터 조회 느림"은 Partition Projection.

---

**문제 3.** 여러 병원의 환자 데이터를 하나의 데이터 레이크에 통합했다. 데이터 과학팀은 진단·치료 컬럼은 보되 환자 이름·주민번호 컬럼은 볼 수 없어야 하고, 각 병원은 자기 병원 데이터(행)만 봐야 한다. 가장 적합한 구성은?

A) S3 버킷 정책으로 prefix를 분리
B) IAM 정책으로 테이블별 접근 제어
C) Lake Formation으로 컬럼 수준·행 수준 권한 설정
D) 민감 컬럼을 별도 테이블로 분리하는 ETL 구축

**정답: C**
해설: Lake Formation은 Glue Catalog 위에 얹는 거버넌스 레이어로, 컬럼 수준(특정 컬럼 마스킹/차단)·행 수준(필터 조건)·셀 수준 권한을 카탈로그에서 중앙 선언적으로 관리한다. LF-Tags로 "PII 태그 컬럼은 분석팀 차단" 같은 정책을 한 번에 적용할 수도 있다. A·B는 S3 prefix·테이블 단위까지만 제어할 수 있고 컬럼·행 수준 제어가 불가능하다. D는 가능하지만 ETL 복잡성이 크고 유지보수 부담이 높아 권장되지 않는다. 함정: "같은 테이블의 컬럼·행마다 다른 권한"은 IAM/S3 정책으로 불가능하고 Lake Formation이 정답.

---

**문제 4.** GDPR 준수를 위해 5년치 클릭스트림 데이터에서 특정 사용자의 모든 레코드를 삭제해야 한다. 삭제 요청이 매주 수백 건이고 데이터는 수천 파티션에 흩어져 있다. 전통 Parquet 레이크는 파티션 전체를 다시 써야 해 비효율적이다. 가장 적합한 구성은?

A) S3 Object Lambda로 응답 시점에 필터링
B) Apache Iceberg 테이블 포맷 + 행 수준 DELETE
C) Athena CTAS로 전체 테이블을 매번 재생성
D) S3 버전 관리로 이전 버전 삭제

**정답: B**
해설: Iceberg(또는 Hudi/Delta)는 Parquet 위에 트랜잭션 메타데이터 레이어를 얹어 행 수준 DELETE/UPDATE/MERGE를 지원한다. 영향받는 파일만 효율적으로 갱신하고 트랜잭션 로그로 일관성을 유지하므로, 전통 레이크처럼 파티션 전체를 reprocessing할 필요가 없다. Glue 4.0+/Athena Engine v3에서 네이티브 지원된다. A는 데이터를 실제로 삭제하지 않아 GDPR 준수가 안 됨(저장된 원본은 그대로). C는 매번 전체 재생성이라 비효율의 극치. D는 객체 단위 버전이지 행 단위 삭제가 아님. 함정: "데이터 레이크 + DELETE/UPDATE/GDPR/upsert"는 거의 테이블 포맷(Iceberg/Hudi/Delta).

---

**문제 5.** Kinesis Firehose가 1분마다 작은 Parquet 파일(평균 800KB)을 S3에 떨군다. 하루 1,440개 × 90일 = 약 13만 개 파일이 쌓이자 Athena 쿼리가 느려지고 S3 GET 요청 비용이 늘었다. 가장 적합한 해결책은?

A) 파일 포맷을 ORC로 변경
B) Firehose 버퍼 크기를 키우고 주기적 compaction(작은 파일 병합) 적용
C) 파티션을 분 단위로 더 세분화
D) Athena 대신 S3 Select 사용

**정답: B**
해설: 이것은 Small File Problem이다. 이상적 Parquet 파일 크기는 128MB~1GB인데 800KB 파일이 수십만 개면 footer 메타데이터 읽기 오버헤드와 S3 GET 요청 수가 폭증한다. Firehose 버퍼 크기(또는 버퍼 인터벌)를 키워 더 큰 파일을 생성하고, 이미 쌓인 작은 파일은 Glue ETL의 repartition/coalesce나 Athena CTAS로 병합(compaction)한다. A(ORC)는 포맷만 바꿀 뿐 작은 파일 문제는 동일. C는 파티션을 더 세분화해 문제를 악화. D(S3 Select)는 단일 객체 부분 조회용이지 대량 분석 쿼리용이 아님. 함정: "작은 파일 수십만 개 + 쿼리 느림"은 포맷 변경이 아니라 compaction.

---

**문제 6.** 데이터 레이크의 S3 데이터(고객 주문)와 운영 DynamoDB의 실시간 재고 데이터를 하나의 SQL 쿼리로 조인해야 한다. 데이터를 이동·복제하지 않고 통합 쿼리하려면?

A) DynamoDB를 S3로 export 후 Athena 쿼리
B) Athena Federated Query + DynamoDB 커넥터
C) Redshift Spectrum
D) Glue ETL로 매시간 조인 테이블 생성

**정답: B**
해설: Athena Federated Query는 Lambda 커넥터를 통해 S3 외부 데이터 소스(DynamoDB, RDS, CloudWatch, Redshift 등)를 SQL로 직접 쿼리·조인한다. 데이터를 이동/복제하지 않고 쿼리 시점에 커넥터가 소스에서 필요한 데이터를 가져온다(predicate pushdown으로 최소화). A는 데이터 이동이 발생하고 실시간성을 잃음. C는 S3/Redshift 데이터용이지 DynamoDB 직접 조인이 아님. D는 매시간 복제라 실시간성 부족 + 운영 부담. 함정: "데이터 이동 없이 여러 소스 통합 쿼리"는 Federated Query. 단, Federated Query는 소량 참조 데이터 조인에 적합하고 대량 운영 DB 전체 분석에는 부적합(그땐 DMS로 S3 복제 후 쿼리).

---

**문제 7.** Glue ETL Job이 매일 Raw의 신규 데이터만 Curated로 변환해야 한다. 전체 데이터를 매번 재처리하면 비용·시간이 누적된다. 가장 적합한 기능은?

A) Glue Crawler 재실행
B) Glue Job Bookmark 활성화
C) Athena Result Reuse
D) DataBrew 프로파일링

**정답: B**
해설: Glue Job Bookmark는 이전 실행에서 처리한 입력(S3 객체의 파일명·타임스탬프, JDBC의 키/타임스탬프)을 상태로 저장해, 다음 실행 시 신규 추가분만 처리하는 증분 ETL을 제공한다. A(Crawler)는 스키마 추론·카탈로그 등록용이지 ETL 증분 처리가 아님. C(Result Reuse)는 Athena 쿼리 결과 재사용이지 Glue ETL과 무관. D(DataBrew)는 노코드 프로파일링. 함정: Bookmark는 "처리한 입력을 건너뛴다"는 것이지 출력 중복 방지가 아니므로, exactly-once가 필요하면 Iceberg/Hudi의 MERGE나 멱등 출력 키를 추가로 설계해야 한다.

---

## 📌 오늘의 요약

1. **Schema-on-Read + 컴퓨팅/스토리지 분리** — S3는 무한·저렴·내구성, 카탈로그로 관리되는 유연한 스키마
2. **3계층(Raw/Curated/Trusted)** — 신뢰 경계 분리, raw 불변성, 분석가는 Curated/Trusted만
3. **Parquet 비용 절감의 3축** — 컬럼 지향(필요 컬럼만) + 압축(5~10배) + predicate pushdown(min/max 통계)
4. **파티셔닝 + Partition Projection** — prefix pruning, 수만 파티션의 메타데이터 병목은 Projection으로 해결
5. **Glue Catalog(HMS 호환)** — Athena/EMR/Redshift Spectrum 공유, Crawler·ETL·DataBrew·Streaming 역할 분리
6. **Lake Formation** — 컬럼·행·셀 수준 세분화 권한, LF-Tags, 크로스 계정 공유 거버넌스
7. **Athena(Presto/Trino, MPP)** — 인덱스 없음, 물리 레이아웃이 전부, Workgroup·Result Reuse·CTAS·Federated Query
8. **Iceberg/Hudi/Delta(레이크하우스)** — ACID·UPDATE/DELETE/MERGE·시간여행·스키마진화, GDPR 삭제·upsert
9. **안티패턴** — raw 직접 쿼리, Small File, 파티션 과세분화, Crawler 남용, Workgroup 미설정
