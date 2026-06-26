# Day 3 - DynamoDB (분석 관점): 키 설계와 스트림 기반 파이프라인

Amazon DynamoDB는 완전관리형 서버리스 NoSQL 키-값/문서 데이터베이스로, 한 자릿수 밀리초 지연과 거의 무제한 확장을 제공합니다. 본질은 OLTP용이지만, 데이터 엔지니어는 키 설계와 **스트림→분석 파이프라인**을 이해해야 합니다.

## DynamoDB 기본 모델

데이터는 **테이블 → 아이템(행) → 속성(컬럼)**으로 구성됩니다. 각 아이템은 **기본 키(primary key)**로 식별됩니다.

- **파티션 키(Partition Key, PK)**: 해시되어 데이터가 저장될 물리 파티션을 결정.
- **정렬 키(Sort Key, SK)**: 같은 파티션 내에서 아이템을 정렬. PK+SK 조합을 **복합 기본 키**라 함.

```text
PK = USER#1001     SK = ORDER#2026-06-26#A   amount=120
PK = USER#1001     SK = ORDER#2026-06-26#B   amount=80
PK = USER#1001     SK = PROFILE              name="Kim"
```

> 💡 **관련 이론**: DynamoDB는 PK 해시로 파티션을 나누므로, 키 설계가 곧 확장성·성능을 결정합니다. 관계형 DB처럼 임의 컬럼으로 효율적 스캔을 할 수 없고, 접근 패턴을 먼저 정의한 뒤 키를 설계합니다(access-pattern-first).

## 키 설계와 핫 파티션

특정 PK에 트래픽이 집중되면 **핫 파티션(hot partition)**이 되어 스로틀링이 발생합니다.

- **고른 분포**: PK는 카디널리티가 높고 트래픽이 분산되는 값(예: userId)을 선택.
- **단일 테이블 설계(single-table design)**: 여러 엔티티를 한 테이블에 넣고 PK/SK 접두사로 구분. 조인 없는 NoSQL에서 관련 데이터를 한 번에 조회.
- **write sharding**: 핫 키에 임의 접미사(`ORDER#2026-06-26#<shard>`)를 붙여 분산.

```text
-- 시계열 데이터에서 날짜만 PK로 쓰면 그날 트래픽이 한 파티션에 집중(안티패턴)
-- 샤딩: PK = DATE#2026-06-26#03  (0~N 샤드로 분산)
```

## GSI와 LSI

기본 키 외의 속성으로 조회하려면 **세컨더리 인덱스**가 필요합니다.

- **GSI(Global Secondary Index)**: 다른 PK/SK로 테이블 전체를 인덱싱. 별도 처리량·스토리지를 가지며 테이블과 **비동기 복제(eventually consistent)**. 거의 무제한 추가 가능.
- **LSI(Local Secondary Index)**: 같은 PK에 다른 SK. 테이블 생성 시에만 정의 가능, 강한 일관성 옵션 지원.

```text
-- GSI 예: 상태별 주문 조회를 위해 status를 PK로 하는 인덱스
GSI: PK = status (SHIPPED/PENDING), SK = order_date
→ "PENDING 주문을 날짜순으로" 같은 새 접근 패턴 지원
```

> 💡 **관련 이론**: GSI는 새로운 조회 축을 추가하지만 비동기 복제라 약간의 지연·결과적 일관성이 있습니다. 분석 쿼리를 GSI로 무리하게 풀기보다, 대량 분석은 별도 분석 스토어로 내보내는 것이 정석입니다.

## DynamoDB Streams → 분석 파이프라인

DynamoDB는 OLTP에 최적이고 **대량 집계·애드혹 분석에는 부적합**합니다. 분석은 변경분을 별도 스토어로 흘려보냅니다.

**DynamoDB Streams**는 아이템 수준 변경(INSERT/MODIFY/REMOVE)을 시간순 레코드로 캡처합니다.

```text
DynamoDB 테이블
   │ (Streams: 변경 캡처)
   ▼
Lambda  ──►  Kinesis Data Firehose  ──►  S3 (Parquet)  ──►  Athena/Redshift Spectrum
   또는
Streams  ──►  Kinesis Data Streams  ──►  분석/실시간 처리
```

- **Streams + Lambda**: 변경마다 Lambda 트리거 → 가공 후 S3/Firehose로 적재.
- **Kinesis Data Streams for DynamoDB**: 변경을 Kinesis로 직접 전송, 더 높은 처리량·재처리·다중 컨슈머.
- **S3 export (PITR 기반)**: 운영 테이블에 부하 없이 특정 시점 스냅샷을 S3로 풀 익스포트 → Athena로 분석.

## DynamoDB가 적합한 / 부적합한 경우

**적합**: 키 기반 고속 조회, 세션·장바구니·IoT 디바이스 상태, 대규모 동시성, 예측 불가 트래픽(온디맨드 모드), 서버리스 백엔드.

**부적합(분석 관점)**: 임의 컬럼 집계, 복잡한 조인, 대규모 스캔·리포팅, 애드혹 분석. → 이 경우 Streams/export로 S3·Redshift로 옮겨 Athena/Redshift로 분석.

```text
운영(OLTP): DynamoDB  →  변경 캡처(Streams/Export)  →  분석(OLAP): S3 + Athena / Redshift
```

> 💡 **관련 이론**: 이는 CQRS(명령-조회 책임 분리)의 데이터 엔지니어링 버전입니다. 쓰기·키 조회는 DynamoDB, 분석·집계는 컬럼형 분석 스토어로 분리해 각 워크로드에 최적 엔진을 씁니다.

## 핵심 정리

- PK 해시로 파티션 결정 → 핫 파티션을 피하는 고른 키 설계가 핵심.
- GSI는 새 조회 축 추가(비동기·결과적 일관성), LSI는 같은 PK 다른 SK(생성 시 정의).
- 대량 분석은 DynamoDB에서 직접 하지 말고 Streams/Kinesis/S3 export로 분석 스토어로 이동.
- OLTP는 DynamoDB, OLAP는 S3+Athena/Redshift로 분리(CQRS형).

## 📝 연습 문제

**문제 1.** DynamoDB에서 시계열 데이터의 PK를 날짜(예: `2026-06-26`)로만 지정했을 때 발생하는 문제는?

A) 강한 일관성을 보장하지 못한다  
B) 그날의 모든 트래픽이 한 파티션에 몰려 핫 파티션·스로틀링이 발생한다  
C) GSI를 생성할 수 없다  
D) Streams가 비활성화된다  

**정답: B**  
해설: PK 해시가 같은 날짜 하나로 고정되면 그날 트래픽이 단일 파티션에 집중되어 핫 파티션과 스로틀링이 생깁니다. 해결책은 샤드 접미사 등으로 키를 분산하는 것입니다. 나머지는 키 설계와 직접 관련이 없습니다.

---

**문제 2.** 기본 키와 다른 속성(예: status)으로 테이블 전체를 조회하는 새로운 접근 패턴을 추가하려면 무엇을 사용하는가?

A) LSI (테이블 생성 후 추가)  
B) VACUUM  
C) GSI (Global Secondary Index)  
D) 파티션 프로젝션  

**정답: C**  
해설: GSI는 다른 PK/SK로 테이블 전체를 인덱싱해 새 조회 축을 추가하며 언제든 생성 가능합니다(비동기·결과적 일관성). LSI는 같은 PK에 다른 SK이고 테이블 생성 시에만 정의되며, 나머지는 DynamoDB 인덱스와 무관합니다.

---

**문제 3.** DynamoDB 테이블의 아이템 변경을 시간순으로 캡처해 분석 파이프라인으로 흘려보내는 기능은?

A) DynamoDB Streams  
B) Glue 크롤러  
C) Athena CTAS  
D) Redshift WLM  

**정답: A**  
해설: DynamoDB Streams는 INSERT/MODIFY/REMOVE 변경을 시간순 레코드로 캡처해 Lambda/Kinesis를 거쳐 S3·Redshift로 적재하는 CDC 파이프라인의 출발점입니다. 나머지는 각각 스키마 추론, Athena 테이블 생성, Redshift 큐 관리입니다.

---

**문제 4.** 운영 DynamoDB 테이블에 부하를 주지 않고 특정 시점 데이터를 S3로 내보내 Athena로 분석하려면 가장 적절한 방법은?

A) 테이블을 풀 스캔하는 분석 쿼리를 직접 실행  
B) PITR 기반 S3 export(테이블 익스포트) 사용  
C) 모든 아이템에 GSI 추가  
D) LSI를 추가로 생성  

**정답: B**  
해설: PITR(특정 시점 복구) 기반 S3 export는 운영 테이블의 읽기 처리량을 소비하지 않고 스냅샷을 S3로 내보내 Athena로 분석할 수 있습니다. 풀 스캔은 운영에 부하를 주고, 인덱스 추가는 분석 익스포트와 무관합니다.

---

**문제 5.** DynamoDB 사용이 분석 관점에서 부적합한 워크로드로 가장 적절한 것은?

A) 사용자 ID로 세션 데이터를 한 자릿수 ms로 조회  
B) 임의 컬럼들에 대한 복잡한 조인과 대규모 애드혹 집계 리포팅  
C) 장바구니·디바이스 상태 저장  
D) 예측 불가 트래픽의 서버리스 백엔드  

**정답: B**  
해설: DynamoDB는 키 기반 고속 조회와 대규모 동시성에 강하지만, 임의 컬럼 조인·대규모 집계·애드혹 분석에는 부적합합니다. 이런 경우 Streams/export로 S3+Athena·Redshift로 옮겨 분석합니다. 나머지는 DynamoDB의 적합 사례입니다.

---
