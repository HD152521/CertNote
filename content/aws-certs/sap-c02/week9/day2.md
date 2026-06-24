# Day 2 - Redshift 심화: MPP 내부 동작, RA3 스토리지 분리, Spectrum과 Zero-ETL

데이터 웨어하우스를 처음 다루는 엔지니어가 가장 자주 묻는 질문은 "왜 그냥 PostgreSQL을 크게 키워서 쓰면 안 되나"이다. 사실 Redshift는 PostgreSQL 8.0.2를 fork해서 만들어졌고, SQL 문법도 거의 같다. 그런데 단일 PostgreSQL은 수억 행에 `GROUP BY`와 `JOIN`을 거는 분석 쿼리에서 몇 분, 몇 시간씩 걸린다. Redshift는 같은 쿼리를 수 초에 끝낸다. 그 차이는 SQL 엔진이 아니라 **저장 구조(컬럼 지향)와 실행 구조(MPP, 분산)**에서 나온다. Redshift를 제대로 이해한다는 건 "데이터를 노드와 슬라이스에 어떻게 흩뿌리고, 쿼리를 어떻게 그 위에서 병렬 실행하는가"를 이해한다는 뜻이다.

SAP-C02 시험에서 Redshift는 "분산 키를 잘못 골라 노드 간 데이터 셔플이 폭증하는 문제", "DC2의 스토리지 한계를 RA3로 푸는 마이그레이션", "데이터 레이크와 웨어하우스를 Spectrum으로 통합하는 레이크하우스", "운영 DB를 ETL 없이 분석하는 Zero-ETL" 같은 아키텍처·운영 관점으로 출제된다. 오늘은 Redshift가 내부적으로 어떻게 동작하는지, 왜 그렇게 설계됐는지를 분해해서 이 시나리오들을 푸는 직관을 만든다.

## 왜 MPP인가 — 단일 노드 RDBMS가 풀지 못하는 스케일

전통 RDBMS(OLTP DB)는 한 트랜잭션이 소수의 행을 빠르게 읽고 쓰는 데 최적화돼 있다. B-tree 인덱스로 특정 행을 O(log n)에 찾고, 행 단위 저장으로 한 레코드의 모든 컬럼을 한 번에 가져온다. 이게 "주문 ID 12345를 조회"하는 OLTP에는 완벽하다. 그러나 "지난 3년간 모든 주문의 지역별 월별 매출 합계"라는 분석(OLAP) 쿼리는 정반대 패턴이다. 수억 행을 전부 읽되 amount와 region 같은 소수 컬럼만 필요하고, 결과는 집계된 소량이다.

Redshift는 이 OLAP 패턴에 두 가지로 대응한다. 첫째, **컬럼 지향 저장**으로 amount/region 컬럼만 디스크에서 읽고 나머지 컬럼은 건드리지 않는다. 둘째, **MPP(Massively Parallel Processing)**로 데이터를 여러 노드에 분산하고 쿼리를 모든 노드에서 동시에 실행한다. 한 노드가 1억 행을 처리하는 대신 10개 노드가 각 1천만 행을 병렬 처리해 시간을 1/10로 줄인다.

Redshift 클러스터의 구조는 **Leader Node + Compute Node**다. Leader Node는 클라이언트의 SQL을 받아 실행 계획을 세우고, 그 계획을 C++ 코드로 컴파일해 각 Compute Node에 배포한다. Compute Node는 자기가 가진 데이터 조각에 대해 그 코드를 실행하고 중간 결과를 Leader Node로 보내 최종 집계한다. 각 Compute Node는 다시 **Slice**라는 병렬 단위로 나뉜다(노드 타입에 따라 2~16개). 슬라이스가 실제 병렬 실행의 최소 단위이고, 데이터는 슬라이스 단위로 분산된다.

> 💡 **관련 이론**: Redshift의 MPP는 1980~90년대 Teradata, Greenplum이 정립한 shared-nothing 아키텍처의 클라우드 구현이다. shared-nothing은 각 노드가 자기 디스크·메모리·CPU만 쓰고 다른 노드와 자원을 공유하지 않는 구조로, 노드를 추가하면 처리량이 거의 선형으로 늘어난다(linear scalability). 반대로 shared-disk(Oracle RAC)는 디스크를 공유해 노드 간 락 경합이 병목이 된다. Redshift가 shared-nothing을 택한 건 분석 워크로드가 "각 노드가 독립적으로 자기 데이터를 처리하고 마지막에 합치는" map-reduce 패턴과 잘 맞기 때문이다. 다만 RA3에서는 이 원칙이 약간 변형되는데, 뒤에서 본다.

> 🔍 **더 깊이**: Redshift는 쿼리 실행 계획을 **C++로 컴파일**해서 실행한다. 이게 흥미로운 설계 결정이다. 대부분의 DB는 인터프리터 방식으로 실행 계획을 한 연산자씩 해석하며 실행한다(Volcano 모델). Redshift는 쿼리별로 맞춤 C++ 코드를 생성·컴파일해 네이티브 속도로 돌린다. 단점은 처음 보는 쿼리는 컴파일 오버헤드(수백 ms~수 초)가 생긴다는 것. 그래서 Redshift는 컴파일된 코드를 클러스터 간 공유 캐시에 저장해, 같은 패턴의 쿼리는 다음번에 컴파일 없이 즉시 실행한다. 시험에 직접 나오진 않지만 "첫 쿼리가 유독 느리다"는 현상의 원인이 이것이다.

## 분산 스타일(DISTSTYLE) — 데이터를 어디에 흩뿌리느냐가 성능을 결정한다

Redshift 성능의 가장 큰 변수는 **분산 키(distribution key)**다. 데이터가 슬라이스에 어떻게 나뉘느냐가 조인·집계 시 노드 간 데이터 이동(셔플)을 결정하기 때문이다. 노드 간 셔플은 네트워크를 타므로 가장 비싼 연산이다. 좋은 분산 설계는 이 셔플을 최소화한다.

**DISTSTYLE KEY**: 특정 컬럼의 해시로 데이터를 슬라이스에 분산한다. 두 테이블을 같은 키로 분산하면(co-location), 조인 시 같은 키 값이 같은 슬라이스에 모여 있어 노드 간 이동 없이 로컬 조인이 가능하다. 예를 들어 orders와 order_items를 둘 다 order_id로 분산하면, 조인이 각 슬라이스 내부에서 끝난다.

**DISTSTYLE ALL**: 테이블 전체를 모든 노드에 복제한다. 작은 차원 테이블(dimension table, 예: 국가 코드, 카테고리)에 적합하다. 큰 fact 테이블과 조인할 때 차원 테이블이 모든 노드에 이미 있으므로 셔플이 없다. 단, 복제이므로 노드 수만큼 스토리지를 더 먹어 큰 테이블엔 부적합하다.

**DISTSTYLE EVEN**: 라운드 로빈으로 균등 분산. 조인 키가 명확하지 않거나 분산 키로 쓸 좋은 컬럼이 없을 때.

**DISTSTYLE AUTO**(기본): Redshift가 테이블 크기에 따라 작으면 ALL, 커지면 KEY/EVEN으로 자동 전환한다.

> 🎯 **시나리오**: "10억 행의 sales fact 테이블과 1만 행의 product dimension 테이블을 자주 조인한다. 쿼리가 느리고 노드 간 네트워크 트래픽이 높다. 최적 분산 설계는?" — 답은 **fact 테이블을 조인 키(product_id 또는 더 큰 fact끼리의 조인 키)로 DISTKEY 분산, product 차원 테이블은 DISTSTYLE ALL**. 작은 차원 테이블을 모든 노드에 복제하면 큰 fact 테이블과 조인 시 차원 데이터가 이미 로컬에 있어 셔플이 사라진다. 만약 두 큰 fact 테이블끼리 조인한다면 둘 다 같은 조인 키로 DISTKEY를 잡아 co-location을 만든다. 시험에서 "큰 테이블 + 작은 테이블 조인 + 네트워크 트래픽 높음"은 fact=KEY, dim=ALL이 정석.

> ⚠️ **함정**: 분산 키를 카디널리티가 낮은 컬럼(예: gender, status처럼 값이 몇 개 안 됨)으로 잡으면 **데이터 스큐(skew)**가 생긴다. 'M'과 'F' 두 값만 있으면 데이터가 두 슬라이스에 몰려 나머지 슬라이스는 놀고 두 슬라이스만 과부하된다. MPP의 병렬성이 무너진다. 분산 키는 카디널리티가 높고 고르게 분포된 컬럼(주문 ID, 사용자 ID 같은)이어야 한다. `SVV_TABLE_INFO`의 skew 지표로 확인할 수 있다. 시험에서 "일부 노드만 CPU가 높고 쿼리가 느리다"는 분산 스큐를 의심해야 한다.

## 정렬 키(SORTKEY) — 디스크에서 무엇을 건너뛸 수 있는가

정렬 키는 데이터를 디스크에 저장할 때의 물리적 순서를 정한다. Redshift는 데이터를 1MB 단위 **블록(block)**으로 저장하고, 각 블록의 메타데이터에 그 블록에 담긴 값의 **min/max(Zone Map)**를 기록한다. `WHERE event_date BETWEEN '2024-01-01' AND '2024-01-07'` 같은 조건이 들어오면, Redshift는 Zone Map을 보고 "이 블록의 날짜 범위가 조건 밖"인 블록을 통째로 건너뛴다. 이걸 **block skipping**이라 한다. 정렬 키가 곧 어떤 블록을 건너뛸 수 있느냐를 결정한다.

- **COMPOUND SORTKEY**: 여러 컬럼을 지정한 순서대로 정렬. 첫 번째 컬럼으로 필터링할 때 가장 효과적. 대부분의 경우 시간 컬럼(event_date)을 첫 정렬 키로 둔다. 시계열 분석이 압도적으로 많기 때문.
- **INTERLEAVED SORTKEY**: 모든 정렬 키 컬럼에 균등한 가중치. 여러 컬럼으로 다양하게 필터링하는 경우 이론상 유리하지만, VACUUM REINDEX 부담이 크고 유지보수가 까다로워 실무에서 거의 안 쓴다.

> 💡 **관련 이론**: Zone Map은 데이터 레이크의 Parquet row group min/max 통계와 본질적으로 같은 아이디어다(Day 41 참고). 둘 다 "정렬되거나 클러스터링된 데이터의 블록 단위 통계로 불필요한 I/O를 건너뛴다"는 zone map / data skipping 기법이다. 컬럼 지향 + 정렬 + 블록 통계의 조합은 OLAP 시스템(Redshift, BigQuery, Snowflake, ClickHouse)의 공통 최적화 패턴이다. 인덱스(B-tree)가 "특정 행을 빨리 찾기"라면, Zone Map은 "관련 없는 대량 블록을 빨리 버리기"다. OLAP은 후자가 압도적으로 중요하다.

> 🔍 **더 깊이**: VACUUM과 ANALYZE가 왜 필요한가. Redshift는 행을 DELETE해도 즉시 물리 삭제하지 않고 "삭제됨" 표시만 한다(soft delete). INSERT는 정렬 순서를 깨고 unsorted 영역에 쌓인다. 시간이 지나면 (1) 삭제 표시된 행이 공간을 차지하고 (2) unsorted 영역이 커져 block skipping 효과가 떨어진다. **VACUUM**은 삭제 행을 물리 제거하고 데이터를 정렬 키 순으로 재정렬한다. **ANALYZE**는 통계를 갱신해 쿼리 플래너가 정확한 실행 계획을 세우게 한다. 최신 Redshift는 Auto VACUUM/Auto ANALYZE로 이를 백그라운드 자동화하지만, 대량 적재 후 수동 실행이 필요한 경우가 있다. 시험에서 "대량 INSERT/DELETE 후 쿼리가 느려졌다"는 VACUUM 필요를 시사한다.

## RA3 — 컴퓨팅과 스토리지를 분리한 진짜 이유

초기 Redshift(DC2, DS2)는 shared-nothing 원칙에 충실해 각 노드가 로컬 SSD/HDD에 데이터를 가졌다. 문제는 컴퓨팅과 스토리지가 **결합**돼 있다는 것. 데이터가 늘어 스토리지가 부족하면 노드를 추가해야 하는데, 그러면 필요 없는 컴퓨팅까지 같이 늘어 비용이 낭비된다. 반대로 컴퓨팅이 부족해 노드를 늘리면 스토리지도 같이 늘어난다. 둘을 독립적으로 조절할 수 없었다.

**RA3**는 이를 **Redshift Managed Storage(RMS)**로 해결한다. 실제 데이터는 S3 기반 RMS에 저장하고, 각 RA3 노드의 로컬 SSD는 **캐시**로 쓴다. 자주 쓰는 데이터(hot)는 로컬 SSD에 캐싱되어 빠르고, 안 쓰는 데이터(cold)는 RMS(S3)에 있다가 필요할 때 자동으로 가져온다. 이로써 컴퓨팅(노드 수)과 스토리지(RMS 용량)를 독립적으로 스케일링할 수 있다. 데이터가 페타바이트로 늘어도 노드 수는 컴퓨팅 요구에 맞춰서만 정하면 된다.

이 분리가 가져온 부수 효과가 중요하다. 데이터가 S3(RMS)에 있으므로 **여러 클러스터가 같은 데이터를 복사 없이 공유**할 수 있다(Data Sharing). 그리고 백업·복원이 빨라지고, 클러스터 크기 조정(resize)이 데이터 이동 없이 메타데이터 변경만으로 가능해진다.

> 🔍 **더 깊이**: RA3의 컴퓨팅-스토리지 분리는 Snowflake가 처음 대중화한 아키텍처를 Redshift가 따라간 것이다. Snowflake는 처음부터 S3(또는 GCS/Blob)에 데이터를 두고 "virtual warehouse"라는 독립 컴퓨팅 클러스터를 띄우는 구조로 시작했다. 같은 데이터에 여러 warehouse를 붙여 워크로드를 격리(ETL용, BI용, 데이터 과학용)할 수 있는 게 강점이었다. Redshift는 RA3 + Data Sharing + Serverless로 이 패턴을 따라잡았다. SAP 관점에서 "여러 팀이 같은 데이터를 보되 서로의 쿼리 성능에 영향 주지 않게 격리"하려면, RA3 + Data Sharing(프로듀서/컨슈머 분리) 또는 Serverless 다중 인스턴스가 답이다.

> 📚 **사례**: 한 소매 기업이 DC2 클러스터를 쓰다가 데이터가 3년간 누적되어 스토리지가 90% 차자, 노드를 계속 추가했다. 컴퓨팅은 충분한데 스토리지 때문에 노드를 늘리니 월 비용이 3배가 됐다. RA3로 마이그레이션하니 데이터는 RMS(S3)로 가고 노드는 실제 컴퓨팅 요구(8개)만 유지해 비용이 40% 줄었다. 추가로 BI팀과 ETL팀이 같은 클러스터에서 경합하던 문제도 Data Sharing으로 컨슈머 클러스터를 분리해 해결했다. SAP 시험에서 "DC2 스토리지 부족 + 비용 증가"는 거의 RA3 마이그레이션이 답이다.

## DC2 vs RA3 vs Serverless — 무엇을 언제 고르나

| 타입 | 스토리지 | 컴퓨팅 관리 | 적합 워크로드 |
|------|----------|-------------|----------------|
| **DC2** | 로컬 SSD(결합) | 노드 수 직접 | 소량(< 수백 GB), 고정 워크로드 |
| **RA3** | RMS(S3 기반, 분리) | 노드 수 직접 | 대량·예측 가능한 정상 워크로드 |
| **Serverless** | RMS | 자동(RPU) | 가변·간헐적·예측 불가 워크로드 |

**Redshift Serverless**는 노드 개념 자체가 없다. 워크로드에 따라 **RPU(Redshift Processing Unit)**가 자동으로 늘고 줄며, 쿼리가 없으면 0으로 떨어져 컴퓨팅 비용이 안 든다(스토리지 비용은 별도). 개발/테스트 환경, 간헐적 분석, 트래픽이 불규칙한 워크로드에 적합하다. 반대로 24시간 일정한 대량 워크로드는 RA3 예약 인스턴스가 RPU 과금보다 저렴할 수 있다.

> ⚠️ **함정**: "Serverless가 항상 싸다"는 오해. Serverless는 RPU-시간으로 과금되는데, 워크로드가 꾸준히 높으면 RA3 예약 인스턴스보다 비쌀 수 있다. Serverless의 강점은 "안 쓸 때 비용이 0에 가깝다"는 탄력성이지 절대 단가가 아니다. 시험에서 "예측 불가/간헐적/개발 환경"이면 Serverless, "꾸준한 대량 프로덕션"이면 RA3 예약 인스턴스로 구분한다.

## Redshift Spectrum — 웨어하우스에서 데이터 레이크를 직접 쿼리

Spectrum은 Redshift가 **S3의 데이터를 클러스터로 적재(COPY)하지 않고 직접 SQL로 쿼리**하게 한다. Glue Catalog의 외부 테이블 정의를 참조하는 External Schema를 만들면, Redshift 내부 테이블과 S3 외부 테이블을 한 쿼리에서 조인할 수 있다. 이게 레이크하우스(Lake House)의 핵심이다. 자주 쓰는 최근 데이터는 Redshift 내부에, 방대한 과거 데이터는 S3 레이크에 두고, 필요할 때 둘을 조인한다.

Spectrum의 동작 원리가 중요하다. Spectrum 쿼리가 들어오면 Redshift는 S3 스캔·필터·집계 작업을 **AWS가 관리하는 별도의 Spectrum 노드 풀**로 내려보낸다(pushdown). 이 풀은 Redshift 클러스터와 독립적으로 수천 노드까지 탄력적으로 확장된다. 즉 S3의 페타바이트를 스캔하는 무거운 작업이 Redshift 클러스터 자원을 잡아먹지 않고 별도 컴퓨팅에서 처리된 뒤, 줄어든 결과만 Redshift로 돌아온다. 과금은 Athena처럼 **S3 스캔 데이터당**이다(따라서 Parquet+파티션+압축이 여기서도 비용을 좌우한다).

> 🔍 **더 깊이**: Spectrum vs Athena의 관계가 헷갈린다. 둘 다 S3를 SQL로 직접 쿼리하고 Glue Catalog를 공유하며 스캔량으로 과금된다. 차이는 "어디서 쿼리하느냐"다. Athena는 독립 서버리스 쿼리 서비스(Presto/Trino)이고, Spectrum은 Redshift 클러스터의 확장이다. Redshift 내부 테이블과 S3를 조인해야 하면 Spectrum, 순수하게 S3만 쿼리하면 Athena가 단순하다. 실제로 Spectrum의 S3 스캔 엔진과 Athena는 내부적으로 유사한 기술을 공유한다. SAP 시험에서 "이미 Redshift를 쓰고 있고 S3 과거 데이터와 조인"이면 Spectrum, "Redshift 없이 S3만"이면 Athena.

## Federated Query와 Zero-ETL — 운영 DB를 분석으로 끌어오는 두 방식

**Federated Query**는 Redshift가 Aurora/RDS PostgreSQL·MySQL을 **실시간으로 직접 조회**하게 한다. ETL 없이 운영 DB의 최신 데이터를 Redshift 분석 쿼리에 조인할 수 있다. 동작은 Redshift가 외부 DB에 직접 SQL을 보내 필요한 데이터만 가져오는 방식(predicate pushdown). 소량의 최신 운영 데이터를 대량의 분석 데이터와 조인하는 데 적합하다. 단, 운영 DB에 쿼리 부하를 주므로 대량 스캔은 피해야 한다.

**Zero-ETL Integration**(2023~2024)은 다른 접근이다. Aurora(MySQL/PostgreSQL)의 변경을 **CDC(Change Data Capture)로 Redshift에 거의 실시간 복제**한다. ETL 파이프라인을 직접 구축·운영하지 않고도, Aurora의 데이터가 수 초~수십 초 지연으로 Redshift에 나타난다. 운영 DB와 분석 DB를 완전히 분리하면서도 분석 데이터의 신선도를 유지한다.

> 🎯 **시나리오**: "Aurora PostgreSQL OLTP 데이터를 거의 실시간으로 Redshift에서 분석해야 한다. 직접 ETL 파이프라인을 만들고 싶지 않고, 운영 DB에 분석 쿼리 부하를 주고 싶지도 않다. 가장 적합한 구성은?" — 답은 **Aurora PostgreSQL Zero-ETL Integration with Redshift**. Zero-ETL은 CDC로 Aurora 변경을 Redshift에 자동 복제하므로, ETL 코드를 작성·유지하지 않아도 되고(관리형) 운영 DB에 분석 쿼리 부하가 가지 않는다(데이터가 Redshift로 복제됨). Federated Query는 ETL은 없지만 운영 DB에 직접 쿼리해 부하를 주므로 "부하를 주고 싶지 않다"는 조건에 어긋난다. DMS CDC는 가능하지만 파이프라인을 직접 관리해야 한다. Glue 배치는 실시간이 아니다. 함정: "ETL 없이 + 실시간 + 운영 DB 부하 회피"는 Zero-ETL.

> 📚 **사례**: 한 게임 회사가 Aurora MySQL에 플레이어 행동 데이터를 저장하고, 분석팀이 실시간 대시보드를 원했다. 처음엔 DMS CDC로 S3에 복제 후 Glue로 변환해 Redshift에 적재하는 3단계 파이프라인을 운영했는데, 지연이 15~30분이고 파이프라인 장애 대응에 엔지니어 시간이 많이 들었다. Aurora MySQL Zero-ETL with Redshift로 전환하니 지연이 수십 초로 줄고 파이프라인 운영 부담이 사라졌다. 다만 Zero-ETL은 변환(transform) 로직을 넣을 수 없어, 복잡한 정제가 필요하면 Redshift에 도착한 후 Materialized View나 추가 쿼리로 처리해야 한다.

## WLM, Concurrency Scaling, SQA — 동시성 워크로드 관리

여러 사용자가 동시에 쿼리를 던지면 자원 경합이 생긴다. Redshift는 **WLM(Workload Management)**으로 이를 관리한다. 쿼리를 큐(queue)로 분류하고(예: ETL 큐, BI 큐, 임시 분석 큐) 각 큐에 메모리·동시성 슬롯을 할당해 워크로드를 격리한다. **Auto WLM**은 이 할당을 Redshift가 머신러닝으로 자동 조정한다.

큐가 가득 차 쿼리가 대기하면 **Concurrency Scaling**이 자동으로 일시적인 추가 클러스터를 띄워 대기 쿼리를 처리한다. 부하가 줄면 추가 클러스터를 내린다. 하루 1시간의 무료 크레딧이 제공되고(기본 클러스터 1시간 사용당 1시간 적립), 그 이상은 초당 과금. 읽기 쿼리에 특히 효과적이다.

**SQA(Short Query Acceleration)**는 짧은 쿼리를 별도 전용 공간에서 우선 처리해, 긴 쿼리 뒤에 짧은 쿼리가 줄 서서 막히는 head-of-line blocking을 방지한다.

> ⚠️ **함정**: Concurrency Scaling은 만능이 아니다. 쓰기(INSERT/UPDATE/COPY)가 아니라 주로 읽기 쿼리에 적용되고, 일부 쿼리 패턴(특정 임시 테이블, 특정 함수)은 추가 클러스터로 라우팅되지 않는다. 또 무료 크레딧을 초과하면 비용이 발생하므로, 동시성 폭증이 일상이라면 클러스터 자체를 키우거나 Serverless로 가는 게 나을 수 있다. 시험에서 "큐 대기로 쿼리가 지연된다"는 1차로 Concurrency Scaling, 만성적이면 클러스터 사이징 재검토.

## Materialized View와 결과 캐싱 — 반복 집계를 미리 계산

BI 대시보드는 같은 집계 쿼리(예: 일별 매출 합계)를 수없이 반복한다. **Materialized View(MV)**는 이 집계 결과를 미리 계산해 저장하고, 원본 데이터가 바뀌면 **증분 갱신(incremental refresh)**한다. 대시보드는 무거운 원본 집계 대신 작은 MV를 읽어 응답이 빨라진다. Auto Refresh를 켜면 Redshift가 백그라운드로 MV를 최신 상태로 유지한다. Spectrum 외부 테이블에 대한 MV도 가능해, S3 레이크의 집계 결과를 Redshift에 캐싱할 수 있다.

> 💡 **관련 이론**: Materialized View는 "비싼 계산을 한 번 하고 결과를 재사용한다"는 캐싱의 DB 버전이다. 핵심 난점은 **캐시 무효화(cache invalidation)** — 원본이 바뀌면 MV를 어떻게 효율적으로 갱신하느냐다. 전체 재계산은 비싸므로 Redshift는 변경된 부분만 반영하는 incremental refresh를 한다. 이는 스트리밍 시스템의 incremental view maintenance 이론과 닿아 있다. 비교하자면 Athena에는 MV가 없고 Result Reuse(동일 쿼리 결과 재사용)만 있어, 반복 집계 최적화는 Redshift MV가 더 강력하다.

## 정리하며

Redshift의 성능과 비용은 SQL 엔진이 아니라 **물리적 데이터 배치(분산 키·정렬 키·압축)와 실행 구조(MPP, 슬라이스, 컴파일 실행)**에서 결정된다. RA3의 컴퓨팅-스토리지 분리(RMS)는 스케일링 유연성과 Data Sharing을 가능하게 했고, Serverless는 가변 워크로드의 탄력성을 제공한다. Spectrum·Federated Query·Zero-ETL은 웨어하우스를 데이터 레이크와 운영 DB로 확장해 레이크하우스를 완성한다.

SAP 시험의 단골 매핑: (1) "큰/작은 테이블 조인 + 네트워크 트래픽" → fact=DISTKEY, dim=ALL, (2) "DC2 스토리지 부족 + 비용" → RA3 마이그레이션, (3) "가변/간헐 워크로드" → Serverless, (4) "S3 과거 데이터와 Redshift 조인" → Spectrum, (5) "ETL 없이 실시간 운영 DB 분석 + 부하 회피" → Zero-ETL, (6) "큐 대기 지연" → Concurrency Scaling, (7) "복제 없이 다중 클러스터 공유" → Data Sharing. 다음 day에서는 실시간 스트리밍 데이터를 다루는 Kinesis 생태계를 본다.

---

## 📝 연습 문제

**문제 1.** 10억 행의 sales fact 테이블과 1만 행의 product dimension 테이블을 자주 조인한다. 쿼리가 느리고 노드 간 네트워크 트래픽이 높다. 최적 분산 설계는?

A) 두 테이블 모두 DISTSTYLE EVEN
B) sales는 조인 키로 DISTKEY, product는 DISTSTYLE ALL
C) 두 테이블 모두 DISTSTYLE ALL
D) sales를 DISTSTYLE ALL, product를 DISTKEY

**정답: B**
해설: 큰 fact 테이블은 조인 키로 DISTKEY 분산하고, 작은 차원 테이블(1만 행)은 DISTSTYLE ALL로 모든 노드에 복제하면, 조인 시 차원 데이터가 이미 각 노드 로컬에 있어 노드 간 셔플(네트워크 트래픽)이 사라진다. A(둘 다 EVEN)는 조인 시 셔플이 발생. C(둘 다 ALL)는 10억 행 테이블을 모든 노드에 복제해 스토리지가 폭발하고 비현실적. D는 큰 테이블을 복제하므로 잘못됨. 함정: "큰 테이블 + 작은 테이블 + 네트워크 트래픽 높음"은 fact=KEY, dim=ALL이 정석.

---

**문제 2.** 분석 쿼리가 느린데, 모니터링 결과 일부 슬라이스의 CPU만 100%이고 나머지는 거의 놀고 있다. 분산 키는 `gender`(값 M/F 2개) 컬럼이다. 원인과 해결은?

A) 정렬 키 부재 → SORTKEY 추가
B) 데이터 스큐 → 카디널리티 높은 컬럼으로 DISTKEY 변경
C) 압축 부재 → 인코딩 적용
D) VACUUM 필요 → VACUUM 실행

**정답: B**
해설: gender처럼 카디널리티가 매우 낮은 컬럼을 분산 키로 쓰면 데이터가 두 슬라이스에만 몰려(데이터 스큐) MPP 병렬성이 무너진다. 일부 슬라이스만 과부하되고 나머지는 노는 전형적 증상이다. 카디널리티가 높고 고르게 분포된 컬럼(주문 ID, 사용자 ID 등)으로 DISTKEY를 바꿔야 균등 분산된다. A·C·D도 성능에 영향을 주지만 "일부 슬라이스만 과부하"라는 증상의 직접 원인은 분산 스큐다. 함정: "일부 노드/슬라이스만 CPU 높음"은 분산 스큐를 의심.

---

**문제 3.** DC2 클러스터를 운영 중인데 데이터가 3년간 누적되어 스토리지가 90% 찼다. 컴퓨팅은 충분한데 스토리지 때문에 노드를 추가하니 비용이 급증한다. 가장 적합한 해결책은?

A) DC2 노드를 계속 추가
B) RA3로 마이그레이션
C) Redshift Serverless로 전환
D) 오래된 데이터를 삭제

**정답: B**
해설: DC2는 컴퓨팅과 스토리지가 결합돼 있어 스토리지가 부족하면 불필요한 컴퓨팅까지 늘려야 한다. RA3는 데이터를 RMS(S3 기반)에 저장하고 로컬 SSD는 캐시로 써서 컴퓨팅과 스토리지를 독립적으로 스케일링한다. 노드 수는 실제 컴퓨팅 요구에만 맞추고 스토리지는 RMS가 탄력적으로 처리해 비용이 최적화된다. A는 비용 급증의 원인 그 자체. C는 가능하지만 꾸준한 프로덕션 워크로드엔 RA3 예약이 더 경제적일 수 있고, 질문의 핵심은 스토리지 분리다. D는 데이터 손실. 함정: "DC2 스토리지 부족 + 비용 증가"는 RA3 마이그레이션.

---

**문제 4.** 개발/테스트 환경에서 분석 쿼리가 하루 몇 번, 불규칙하게 실행된다. 사용하지 않을 때 컴퓨팅 비용을 0에 가깝게 하고 노드 관리도 하고 싶지 않다. 가장 적합한 옵션은?

A) DC2 단일 노드
B) RA3 예약 인스턴스
C) Redshift Serverless
D) Aurora

**정답: C**
해설: Redshift Serverless는 노드 개념 없이 워크로드에 따라 RPU가 자동 조정되고, 쿼리가 없으면 컴퓨팅 비용이 거의 0으로 떨어진다. 간헐적·예측 불가·개발 환경에 최적이다. A(DC2)·B(RA3 예약)는 쓰지 않아도 노드 비용이 계속 발생하고 노드 관리도 필요. D는 OLTP DB로 분석 웨어하우스가 아님. 함정: "가변/간헐/안 쓸 때 비용 0"은 Serverless, "꾸준한 대량 프로덕션"은 RA3 예약.

---

**문제 5.** 이미 Redshift RA3를 운영 중이고, S3 데이터 레이크에 저장된 5년치 과거 주문 데이터(Parquet)를 Redshift의 최근 주문 테이블과 조인해 분석해야 한다. 과거 데이터를 Redshift로 적재하고 싶지 않다. 가장 적합한 구성은?

A) COPY로 S3 데이터를 Redshift 내부 테이블에 적재
B) Redshift Spectrum + External Schema
C) Athena로 별도 쿼리 후 수동 결합
D) DMS로 S3를 Redshift에 복제

**정답: B**
해설: Redshift Spectrum은 S3 데이터를 적재(COPY)하지 않고 Glue Catalog의 외부 테이블을 참조하는 External Schema로 직접 쿼리하며, Redshift 내부 테이블과 한 쿼리에서 조인할 수 있다(레이크하우스). S3 스캔은 별도 Spectrum 노드 풀에서 처리되어 클러스터 자원을 거의 안 쓴다. A·D는 적재가 발생해 "적재하고 싶지 않다"는 조건 위반. C는 두 시스템 결과를 수동 결합해야 해 비효율. 함정: "Redshift 사용 중 + S3 과거 데이터와 조인 + 적재 회피"는 Spectrum.

---

**문제 6.** Aurora PostgreSQL OLTP 데이터를 거의 실시간으로 Redshift에서 분석해야 한다. ETL 파이프라인을 직접 구축·운영하고 싶지 않고, 운영 DB에 분석 쿼리 부하를 주고 싶지도 않다. 가장 적합한 구성은?

A) Redshift Federated Query
B) Aurora PostgreSQL Zero-ETL Integration with Redshift
C) DMS CDC로 S3 복제 후 Glue ETL
D) 매시간 Glue 배치 ETL

**정답: B**
해설: Zero-ETL Integration은 CDC로 Aurora 변경을 Redshift에 거의 실시간(수 초~수십 초) 자동 복제한다. ETL 코드를 작성/유지할 필요가 없고(완전 관리형), 데이터가 Redshift로 복제되므로 운영 DB에 분석 쿼리 부하가 가지 않는다. A(Federated Query)는 ETL은 없지만 운영 DB에 직접 쿼리해 부하를 주므로 조건 위반. C·D는 파이프라인을 직접 관리해야 하고 C는 실시간이지만 운영 부담, D는 실시간이 아님. 함정: "ETL 없이 + 실시간 + 운영 DB 부하 회피"는 Zero-ETL.

---

**문제 7.** 두 개의 분리된 RA3 클러스터(BI팀, 데이터 과학팀)가 같은 매출 데이터를 읽어야 한다. 데이터 복제 비용과 동기화 부담을 피하면서 각 팀의 쿼리가 서로의 성능에 영향을 주지 않게 격리하려면?

A) 한 클러스터를 두 팀이 공유
B) Redshift Data Sharing(프로듀서 → 컨슈머)
C) 각 팀이 데이터를 COPY로 복제
D) Redshift Spectrum으로 공유

**정답: B**
해설: RA3의 Data Sharing은 데이터가 RMS(S3 기반)에 있다는 점을 활용해 프로듀서 클러스터의 데이터를 복사 없이 컨슈머 클러스터가 읽기 공유하게 한다. 각 클러스터는 독립된 컴퓨팅을 가지므로 워크로드가 격리되고(서로 성능 영향 없음), 복제 비용·동기화 부담이 없다. 멀티 계정·멀티 리전도 지원. A는 워크로드 격리 실패(경합). C는 복제 비용·동기화 부담 발생. D(Spectrum)는 S3 외부 데이터용이지 Redshift 내부 테이블 공유 메커니즘이 아님. 함정: "복제 없이 다중 클러스터 공유 + 워크로드 격리"는 Data Sharing.

---

## 📌 오늘의 요약

1. **MPP + 컬럼 지향 + 컴파일 실행** — Leader/Compute Node, Slice 단위 병렬, shared-nothing
2. **DISTSTYLE** — KEY(co-location), ALL(작은 차원 복제), EVEN, AUTO. 큰 fact+작은 dim = KEY+ALL
3. **데이터 스큐** — 카디널리티 낮은 컬럼 DISTKEY 금지, 일부 슬라이스 과부하 증상
4. **SORTKEY + Zone Map** — block skipping, 시간 컬럼 COMPOUND가 표준, VACUUM/ANALYZE 유지보수
5. **RA3 + RMS** — 컴퓨팅/스토리지 분리, 독립 스케일링, Data Sharing 기반. DC2 스토리지 부족은 RA3로
6. **Serverless** — 가변·간헐 워크로드, RPU 자동, 안 쓰면 비용 0. 꾸준한 대량은 RA3 예약
7. **Spectrum** — S3 직접 쿼리(별도 노드 풀 pushdown), 레이크하우스, 스캔량 과금
8. **Federated Query vs Zero-ETL** — 전자는 실시간 직접 조회(운영 DB 부하), 후자는 CDC 자동 복제(부하 없음)
9. **WLM/Concurrency Scaling/SQA/MV** — 워크로드 격리, 큐 대기 자동 확장, 짧은 쿼리 우선, 집계 캐싱
