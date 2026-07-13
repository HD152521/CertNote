# Day 3 - DynamoDB (Analytics Perspective): Key Design and Stream-Based Pipelines

Amazon DynamoDB is a fully managed serverless NoSQL key-value/document database providing single-digit millisecond latency and near-unlimited scale. While fundamentally OLTP, data engineers must understand **key design** and **stream-to-analytics pipelines**.

## DynamoDB Fundamental Model

Data is organized as **table → items (rows) → attributes (columns)**. Each item identified by **primary key**.

- **Partition Key (PK)**: Hashed to determine physical partition where data is stored.
- **Sort Key (SK)**: Orders items within same partition. PK+SK combination is **composite primary key**.

```text
PK = USER#1001     SK = ORDER#2026-06-26#A   amount=120
PK = USER#1001     SK = ORDER#2026-06-26#B   amount=80
PK = USER#1001     SK = PROFILE              name="Kim"
```

> 💡 **Related Theory**: DynamoDB's PK hash determines partition, so key design determines scalability and performance. Unlike relational DBs, can't efficiently scan arbitrary columns; must define access patterns first, then design keys (access-pattern-first).

## Key Design and Hot Partitions

Traffic concentration on specific PK creates **hot partition**, causing throttling.

- **Even distribution**: Choose PK with high cardinality and distributed traffic (e.g., userId).
- **Single-table design**: Store multiple entities in one table, distinguished by PK/SK prefixes. Query related data at once without joins.
- **Write sharding**: Attach random suffix to hot key (`ORDER#2026-06-26#<shard>`) for distribution.

```text
-- Anti-pattern: time-series using only date as PK concentrates all-day traffic in one partition
-- Sharding: PK = DATE#2026-06-26#03  (distribute via 0~N shards)
```

## GSI and LSI

Query non-primary-key attributes with **secondary indexes**.

- **GSI (Global Secondary Index)**: Index entire table with different PK/SK. Has separate provisioned throughput/storage; **eventually consistent** async replication with table. Unlimited addition.
- **LSI (Local Secondary Index)**: Same PK, different SK. Definable only at table creation; offers strong consistency option.

```text
-- GSI example: index table with status as PK for status-based order queries
GSI: PK = status (SHIPPED/PENDING), SK = order_date
→ enables new access pattern like "PENDING orders by date"
```

> 💡 **Related Theory**: GSI adds new query axis but has async replication slight delay and eventual consistency. Rather than force analytics queries through GSI, standard practice is to export bulk analytics to separate analytics store.

## DynamoDB Streams → Analytics Pipeline

DynamoDB is optimized for OLTP, **unsuitable for bulk aggregation and ad-hoc analysis**. Analytics requires diverting changes to separate store.

**DynamoDB Streams** capture item-level changes (INSERT/MODIFY/REMOVE) as chronologically ordered records.

```text
DynamoDB Table
   │ (Streams: change capture)
   ▼
Lambda  ──►  Kinesis Data Firehose  ──►  S3 (Parquet)  ──►  Athena/Redshift Spectrum
   or
Streams  ──►  Kinesis Data Streams  ──►  analytics/real-time processing
```

- **Streams + Lambda**: Trigger Lambda per change → process and load to S3/Firehose.
- **Kinesis Data Streams for DynamoDB**: Send changes directly to Kinesis; higher throughput, replay, multiple consumers.
- **S3 export (PITR-based)**: Full export snapshot at specific time to S3 without load on operational table → analyze with Athena.

## When DynamoDB Is Suitable / Unsuitable

**Suitable**: Key-based fast lookup, sessions, shopping carts, IoT device state, massive concurrency, unpredictable traffic (on-demand mode), serverless backend.

**Unsuitable (analytics perspective)**: Arbitrary column aggregation, complex joins, large-scale scans/reporting, ad-hoc analysis. → Move to S3/Redshift via Streams/export for Athena/Redshift analysis.

```text
Operations (OLTP): DynamoDB  →  change capture (Streams/Export)  →  Analytics (OLAP): S3 + Athena / Redshift
```

> 💡 **Related Theory**: This is the data engineering version of CQRS (Command-Query Responsibility Separation). Writes/key queries on DynamoDB, analytics/aggregation on columnar analytics store, each workload on optimal engine.

## Key Takeaways

- PK hash determines partition → even key design avoiding hot partitions is core.
- GSI adds new query axis (async, eventual consistency); LSI same PK different SK (creation-time definition).
- Bulk analytics don't happen on DynamoDB directly; move via Streams/Kinesis/S3 export to analytics store.
- Separate OLTP to DynamoDB, OLAP to S3+Athena/Redshift (CQRS pattern).

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
