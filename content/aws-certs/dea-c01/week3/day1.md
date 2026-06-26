# Day 1 - 스트리밍 처리: Managed Service for Apache Flink와 윈도우 집계

배치 처리는 "쌓인 데이터를 나중에 한 번에 처리한다"는 발상이고, 스트리밍 처리는 "데이터가 도착하는 순간 처리한다"는 발상이다. 이 차이는 단순히 빠르고 느림의 문제가 아니다. 배치는 데이터에 경계(파일, 날짜 파티션)가 있다고 가정하지만, 스트림은 끝이 없는 무한 데이터(unbounded data)를 다룬다. 끝이 없는 데이터에서 "오늘 매출 합계" 같은 집계를 하려면, 어딘가에서 인위적으로 경계를 그어야 한다. 그 경계가 바로 **윈도우(window)**다.

AWS에서 이 스트리밍 집계를 책임지는 서비스가 **Amazon Managed Service for Apache Flink**다. 과거 "Kinesis Data Analytics"라는 이름으로 불렸고, SQL 버전과 Flink 버전이 있었는데, SQL 버전(KDA for SQL)은 2023년 신규 생성이 중단됐고 현재는 Apache Flink 기반이 표준이다. 시험에서 "실시간 스트림 집계, 윈도우 처리, 상태 기반 처리"가 나오면 Managed Flink를 떠올려야 한다.

## Flink가 스트림을 다루는 방식: 시간의 세 가지 의미

Flink를 이해하는 핵심은 "시간"을 세 종류로 구분하는 것이다.

| 시간 종류 | 의미 | 특징 |
|-----------|------|------|
| Event time | 이벤트가 실제 발생한 시각 | 데이터에 박힌 타임스탬프, 가장 정확 |
| Ingestion time | 데이터가 Flink에 들어온 시각 | 중간 정도 |
| Processing time | 연산자가 데이터를 처리하는 시각 | 가장 빠르지만 부정확 |

실무에서 거의 항상 **Event time**을 쓴다. 모바일 앱에서 발생한 클릭이 네트워크 지연으로 5분 늦게 도착해도, "발생 시각"을 기준으로 집계해야 정확하기 때문이다. 그런데 늦게 도착하는 데이터(late data)를 영원히 기다릴 수는 없다. 여기서 **워터마크(watermark)**라는 개념이 등장한다.

```java
// Flink DataStream API: Event time + Watermark 설정
DataStream<Click> clicks = env
    .fromSource(kinesisSource, WatermarkStrategy
        .<Click>forBoundedOutOfOrderness(Duration.ofSeconds(10))
        .withTimestampAssigner((event, ts) -> event.getEventTime()),
        "kinesis-clicks");
```

워터마크는 "이 시각 이전의 데이터는 이제 거의 다 도착했다"고 시스템에 알리는 신호다. `forBoundedOutOfOrderness(10초)`는 "최대 10초까지 순서가 뒤바뀔 수 있다고 가정하라"는 뜻이다. 워터마크가 윈도우 종료 시각을 넘으면 그 윈도우의 집계를 확정하고 결과를 내보낸다.

> 💡 **관련 이론**: Event time과 워터마크는 Google이 2015년 발표한 **Dataflow Model** 논문에서 정립한 개념이다. 핵심 질문은 "What / Where / When / How"다 — *무엇을* 계산하는가(집계 함수), *어디에서* 경계를 긋는가(윈도우), *언제* 결과를 낼 것인가(워터마크/트리거), 늦은 데이터를 *어떻게* 보정하는가(accumulation mode). Flink는 이 모델을 충실히 구현한 오픈소스 엔진이다.

## 윈도우의 종류: 경계를 긋는 네 가지 방법

무한 스트림에 경계를 긋는 방식이 윈도우의 종류를 결정한다.

```
Tumbling (텀블링) — 겹치지 않는 고정 구간
|--5분--|--5분--|--5분--|
   집계     집계     집계

Sliding (슬라이딩) — 겹치는 구간
|----10분----|
     |----10분----|   (5분마다 슬라이드)

Session (세션) — 활동 사이 간격(gap)으로 구분
|클릭 클릭 클릭| ...30초 무활동... |클릭 클릭|
   세션 1                          세션 2
```

| 윈도우 | 정의 | 대표 용도 |
|--------|------|-----------|
| Tumbling | 고정 크기, 겹침 없음 | "5분마다 매출 합계" |
| Sliding | 고정 크기, 일정 간격 슬라이드 | "최근 10분 이동 평균을 5분마다" |
| Session | 비활동 gap 기준 | "사용자 세션별 페이지뷰" |
| Global | 경계 없음, 커스텀 트리거 필요 | "100건마다 처리" |

```java
// Tumbling window: 1분마다 상품별 판매 수량 합계
clicks
    .keyBy(Click::getProductId)
    .window(TumblingEventTimeWindows.of(Time.minutes(1)))
    .sum("quantity");

// Session window: 30초 비활동 gap으로 세션 구분
clicks
    .keyBy(Click::getUserId)
    .window(EventTimeSessionWindows.withGap(Time.seconds(30)))
    .aggregate(new PageViewCounter());
```

`keyBy`는 SQL의 `GROUP BY`와 같다. 키별로 스트림을 분할한 뒤, 각 키마다 독립적인 윈도우를 유지한다. 상품 A의 윈도우와 상품 B의 윈도우는 서로 영향을 주지 않는다.

> 🔍 **더 깊이**: 슬라이딩 윈도우는 메모리를 많이 쓴다. 10분 윈도우를 1분마다 슬라이드하면, 하나의 이벤트가 동시에 10개 윈도우에 속한다. 이벤트마다 10배의 상태를 유지해야 한다는 뜻이다. 슬라이드 간격이 작을수록 비용이 급증하므로, "정말 그 해상도가 필요한가"를 먼저 따져야 한다.

## 상태(State)와 체크포인트: 장애를 견디는 구조

스트리밍 집계는 본질적으로 **상태 기반(stateful)**이다. "지금까지 누적 합계 1,250"이라는 중간 상태를 메모리에 들고 있어야 한다. 그런데 노드가 죽으면 이 상태는 사라진다. Flink는 이 문제를 **체크포인트(checkpoint)**로 해결한다.

```java
env.enableCheckpointing(60_000);  // 60초마다 체크포인트
env.getCheckpointConfig()
   .setCheckpointingMode(CheckpointingMode.EXACTLY_ONCE);
```

체크포인트는 일정 주기로 모든 연산자의 상태를 일관된 스냅샷으로 만들어 내구성 있는 저장소(Managed Flink에서는 자동 관리되는 S3)에 저장한다. 장애가 나면 마지막 체크포인트에서 상태를 복원하고, 소스(Kinesis)의 오프셋도 그 시점으로 되돌려 재처리한다. 이것이 **Exactly-once** 시맨틱의 기반이다.

> 💡 **관련 이론**: Flink의 체크포인트는 1985년 Chandy-Lamport가 제안한 **분산 스냅샷 알고리즘**을 변형한 것이다. "배리어(barrier)"라는 특수 마커를 스트림에 끼워 넣고, 이 배리어가 각 연산자를 통과하는 순간의 상태를 기록한다. 모든 연산자가 같은 배리어를 처리한 시점의 스냅샷은 전역적으로 일관된다. 이 알고리즘 덕분에 스트림을 멈추지 않고도 일관된 스냅샷을 찍을 수 있다.

## 실시간 변환: 단순 매핑부터 스트림 조인까지

Flink는 집계만 하는 게 아니다. 도착하는 레코드를 실시간으로 변환·정제·강화(enrich)한다.

```java
// 1. 단순 변환과 필터
DataStream<Order> validOrders = rawOrders
    .map(json -> parseOrder(json))
    .filter(order -> order.getAmount() > 0);

// 2. 스트림 조인: 주문 스트림 + 사용자 프로필 스트림
orders
    .keyBy(Order::getUserId)
    .intervalJoin(profiles.keyBy(Profile::getUserId))
    .between(Time.minutes(-5), Time.minutes(5))
    .process(new EnrichOrderWithProfile());
```

`intervalJoin`은 두 스트림을 시간 범위 안에서 조인한다. 주문 이벤트의 ±5분 안에 도착한 프로필 이벤트와 매칭하는 식이다. 무한 스트림끼리의 조인은 "어느 범위까지 매칭을 시도할지"를 정하지 않으면 상태가 무한히 커지므로, 시간 경계가 필수다.

변환된 결과는 다시 싱크(sink)로 흘려보낸다 — Kinesis Data Streams, MSK(Kafka), S3, OpenSearch, DynamoDB 등이 모두 싱크가 될 수 있다. 흔한 패턴은 "Kinesis → Flink 집계 → S3(원본 보존) + OpenSearch(실시간 대시보드)"의 팬아웃이다.

> 🎯 **시나리오**: 게임 회사가 "최근 5분간 지역별 동시 접속자 수"를 실시간 대시보드에 보여주고 싶다. 구성은 (1) 게임 클라이언트가 Kinesis Data Streams로 접속 이벤트 전송 → (2) Managed Flink가 지역(region)으로 `keyBy`하고 5분 슬라이딩 윈도우로 distinct 사용자 수 집계 → (3) 결과를 OpenSearch에 싱크 → (4) OpenSearch Dashboards로 시각화. 워터마크를 30초로 두면 약간 늦은 이벤트도 포함된다.

## Managed Flink 운영: 알아야 할 핵심

Managed Flink는 서버 관리를 추상화하지만, 용량 단위인 **KPU(Kinesis Processing Unit)**는 이해해야 한다. 1 KPU = 1 vCPU + 4GB 메모리에 해당한다. 병렬성(parallelism)을 높이면 더 많은 KPU가 필요하고, 비용이 그만큼 늘어난다.

| 운영 항목 | 내용 |
|-----------|------|
| Parallelism | 동시에 처리하는 작업 수, KPU와 비례 |
| Auto Scaling | 부하에 따라 KPU 자동 조정(활성화 가능) |
| 체크포인트/스냅샷 | 자동 관리, 앱 업데이트 시 savepoint로 무중단 복원 |
| 모니터링 | CloudWatch에서 `millisBehindLatest`, `numRecordsIn` 등 추적 |

`millisBehindLatest`는 "스트림의 최신 데이터로부터 얼마나 뒤처져 있는가"를 보여주는 가장 중요한 지표다. 이 값이 계속 증가하면 처리 능력이 유입 속도를 못 따라가는 것이므로, 병렬성을 늘리거나 소스 샤드를 추가해야 한다.

> ⚠️ **함정**: 시험에서 "실시간 ETL/집계 = Managed Flink"가 정답이지만, **단순 변환만 필요하면 Kinesis Data Firehose + Lambda 변환**이 더 싸고 간단하다. Flink는 윈도우 집계, 스트림 조인, 복잡한 상태 관리가 필요할 때 선택한다. "그냥 형식 변환해서 S3에 넣어라"에 Flink를 쓰면 과한 설계다.

## 정리: 배치와 스트림의 경계

오늘의 핵심은 "무한 데이터에 경계를 긋는 방법"이다. 윈도우가 경계를 긋고, 워터마크가 "언제 결과를 낼지" 결정하며, 체크포인트가 "장애가 나도 정확히 한 번 처리"를 보장한다. 이 세 축이 스트리밍 처리의 전부라 해도 과언이 아니다. 내일은 이 수집 파이프라인이 장애·중복·순서 뒤바뀜 속에서도 신뢰성을 유지하는 방법으로 들어간다.

---

## 📝 연습 문제

**문제 1.** 모바일 앱 클릭 이벤트가 네트워크 지연으로 순서가 뒤바뀌어 도착한다. 실제 발생 시각 기준으로 정확히 집계하면서, 늦은 데이터를 일정 시간까지 기다리려면 Flink에서 무엇을 설정해야 하는가?

A) Event time과 Watermark(forBoundedOutOfOrderness)  
B) Processing time과 Tumbling window  
C) Ingestion time과 Global window  
D) Processing time과 Session window  

**정답: A**  
해설: 실제 발생 시각 기준 집계는 Event time을 써야 하고, 순서가 뒤바뀐 늦은 데이터를 일정 시간까지 허용하려면 Watermark가 필요하다. `forBoundedOutOfOrderness(Duration)`는 허용할 최대 순서 어긋남을 지정한다. Processing time은 처리 시점 기준이라 늦게 도착한 이벤트의 발생 시각을 반영하지 못한다.

---

**문제 2.** "5분마다 직전 5분간의 매출 합계"처럼 겹치지 않는 고정 구간 집계에 적합한 윈도우는?

A) Sliding window  
B) Session window  
C) Tumbling window  
D) Global window  

**정답: C**  
해설: 겹치지 않는 고정 크기 구간은 Tumbling window다. Sliding은 구간이 겹치며(이동 평균 등) 메모리를 더 쓴다. Session은 비활동 gap으로 경계를 긋고, Global은 경계가 없어 커스텀 트리거가 필요하다.

---

**문제 3.** Managed Service for Apache Flink 애플리케이션의 `millisBehindLatest` 지표가 시간이 갈수록 계속 증가한다. 가장 적절한 해석과 대응은?

A) 정상이며 무시해도 된다  
B) 처리 능력이 유입 속도를 못 따라가므로 병렬성/KPU 또는 소스 샤드를 늘린다  
C) 체크포인트가 비활성화된 것이므로 끈다  
D) 데이터가 손실되고 있으므로 윈도우를 제거한다  

**정답: B**  
해설: `millisBehindLatest`는 스트림 최신 데이터로부터 처리가 얼마나 뒤처졌는지를 나타낸다. 지속 증가는 처리 지연 누적을 의미하며, parallelism/KPU를 늘리거나 Kinesis 샤드를 추가해 처리량을 높여야 한다. 체크포인트를 끄는 것은 내구성을 해치는 잘못된 대응이다.

---

**문제 4.** 단순히 들어오는 JSON 레코드의 형식을 변환해 S3에 적재만 하면 되고, 윈도우 집계나 스트림 조인은 필요 없다. 가장 비용 효율적이고 단순한 선택은?

A) Managed Service for Apache Flink  
B) EMR Spark Streaming 클러스터  
C) Redshift Streaming Ingestion  
D) Kinesis Data Firehose + Lambda 변환  

**정답: D**  
해설: 윈도우 집계나 상태 관리 없이 단순 변환 후 S3 적재라면 Firehose + Lambda 변환이 가장 단순하고 저렴하다. Flink와 EMR은 상태 기반 복잡 처리에 적합하며 이 경우 과한 설계다. Redshift Streaming Ingestion은 Redshift로 직접 넣는 다른 목적의 기능이다.

---

**문제 5.** Flink가 노드 장애 후에도 "정확히 한 번(exactly-once)" 처리를 보장하는 핵심 메커니즘은?

A) 주기적 체크포인트(분산 스냅샷)로 상태를 저장하고 장애 시 소스 오프셋과 함께 복원  
B) 모든 데이터를 DynamoDB에 중복 저장  
C) SQS DLQ로 실패 레코드를 격리  
D) S3 버전 관리  

**정답: A**  
해설: Flink는 Chandy-Lamport 기반의 분산 스냅샷(체크포인트)으로 모든 연산자 상태를 일관되게 저장하고, 장애 시 마지막 체크포인트로 상태를 복원하면서 소스(Kinesis) 오프셋도 되돌려 재처리한다. 이 조합이 exactly-once 시맨틱의 기반이다. 나머지는 다른 목적의 메커니즘이다.

---
