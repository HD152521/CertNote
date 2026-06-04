# Day 23 - DynamoDB: 스키마 없는 세계에서 설계한다는 것

관계형 데이터베이스에서 테이블을 설계할 때 우리는 정규화를 생각한다. 3NF(Third Normal Form)를 맞추고, 외래 키로 관계를 잇고, JOIN으로 데이터를 합친다. DynamoDB는 이 모든 가정을 뒤집는다. JOIN이 없다. 트랜잭션은 제한적이다. 스키마는 고정되지 않는다. 대신 단일 자릿수 밀리초 응답 시간을 수억 개의 항목에서 보장한다.

Amazon은 2004년 사내에서 Dynamo라는 시스템을 만들었다. 쇼핑 카트 데이터를 저장하기 위해서였다. 피크 트래픽에서 단 하나의 요청도 잃으면 안 됐다. 그 결과물이 2007년 SOSP(Symposium on Operating Systems Principles)에 "Dynamo: Amazon's Highly Available Key-Value Store"라는 논문으로 발표됐고, 이 논문은 Cassandra, Riak, Voldemort 등 수많은 NoSQL 시스템의 설계 기반이 됐다. 2012년 DynamoDB라는 이름으로 공개됐고, Amazon.com의 Prime Day 판매 기록을 매년 갈아치우는 핵심 인프라가 됐다.

## 파티셔닝 — DynamoDB 성능의 전부

DynamoDB가 단일 자릿수 ms 응답을 보장하는 비결은 파티셔닝이다. 모든 데이터는 파티션 키(Partition Key, 이전 명칭: Hash Key)를 기준으로 파티션에 배분된다. DynamoDB 내부에서 파티션 키에 해시 함수를 적용한 값에 따라 데이터가 어느 물리적 스토리지 노드에 저장될지 결정된다.

```
파티션 키 → MD5/SHA 계기 해시 → [0, 2^128) 공간
                                      │
         ┌────────────────────────────┤
         │                           │
    파티션 0               파티션 1               파티션 2
   (해시 0 ~ 33%)         (33% ~ 66%)           (66% ~ 100%)
   PK: "user_1"          PK: "user_2"           PK: "user_3"
   PK: "user_9"          PK: "user_5"           PK: "user_7"
```

이 구조에서 단일 항목 조회(GetItem)는 해시 함수를 한 번 계산해서 어느 파티션인지 바로 찾아가므로 O(1)이고 항상 일정한 지연이 보장된다. 문제는 파티션 키 선택이 나쁠 때 일어난다.

**Hot Partition** 문제: 만약 파티션 키가 현재 날짜(`"2025-05-26"`)라면, 오늘 날짜의 파티션에만 모든 쓰기가 몰린다. 한 파티션의 한도는 10GB / 3000 RCU / 1000 WCU다. 아무리 전체 테이블 용량을 크게 잡아도, 한 파티션에서 초당 1000 WCU 이상 요청이 들어오면 스로틀링이 발생한다. 전체 WCU는 남아돌아도.

좋은 파티션 키의 특성:
- **카디널리티가 높다** — 값의 종류가 많아서 데이터가 고르게 분산된다 (userId, orderId, deviceId)
- **균등하게 분포된다** — 특정 값에 접근이 집중되지 않는다
- **자주 조회되는 패턴과 일치한다** — 단일 GetItem으로 원하는 데이터를 찾을 수 있다

나쁜 파티션 키의 예:
- status (`"ACTIVE"`, `"INACTIVE"` — 값이 2가지뿐)
- date (`"2025-05-26"` — 오늘 날짜에 쓰기 집중)
- boolean (`true`/`false`)

> 💡 **관련 이론: Consistent Hashing과 Dynamo 논문** — DynamoDB의 파티셔닝은 Consistent Hashing(일관된 해싱) 알고리즘을 기반으로 한다. Consistent Hashing은 Karger et al.의 1997년 논문 "Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web"(STOC 1997)에서 제안됐다. 일반 해시와 달리 노드 추가/제거 시 데이터 재배치(Rebalancing)를 최소화한다 — N개 노드에서 N+1개로 늘릴 때 전체 키의 약 1/N만 이동된다. 반면 일반 해시 테이블은 거의 모든 키를 재배치해야 한다. DynamoDB가 스토리지 노드를 늘려도 서비스 중단 없이 데이터를 재분배할 수 있는 기반이 이것이다. 2007년 Amazon Dynamo 논문(DeCandia et al.)은 Consistent Hashing + Virtual Nodes(각 물리 노드가 여러 가상 노드를 담당)로 더 균등한 분산을 달성했다고 설명한다.

> ⚠️ **Adaptive Capacity의 한계** — "Adaptive Capacity"는 Hot Partition 문제를 완화하지만 해결하지는 못한다. Adaptive Capacity는 인기 있는 파티션에 자동으로 더 많은 용량을 할당하는 기능이지만, 단일 파티션의 물리적 한계(10GB, 초당 1000 WCU)를 넘어서는 워크로드는 처리할 수 없다. 파티션 키 설계가 근본적으로 잘못됐으면 Adaptive Capacity로도 못 고친다. Hot Partition 대응의 유일한 근본 해결책은 파티션 키를 High-Cardinality + 균등 분포로 재설계하는 것이다.

> 🔍 **Write Sharding 기법** — 불가피하게 특정 값으로 쓰기가 집중될 때(예: 인기 상품의 재고 테이블), Write Sharding을 쓴다. 파티션 키에 랜덤 접미사(`productId#1`, `productId#2`, ..., `productId#N`)를 붙여 N개의 파티션에 분산한 뒤, 읽기 시에는 N개의 파티션을 모두 읽어서 집계한다. 쓰기 성능은 N배, 읽기 비용도 N배. 집계 워크로드가 없으면 합리적인 트레이드오프다.

## WCU와 RCU — 용량 계산 방법

DynamoDB의 비용과 성능은 WCU(Write Capacity Unit)와 RCU(Read Capacity Unit)로 측정된다. 이 단위를 정확히 이해해야 용량 계획과 비용 예측이 가능하다.

**WCU(쓰기 용량 단위)**:
- 1 WCU = 최대 1KB 항목을 초당 1번 쓰기
- 2KB 항목 쓰기 = 2 WCU
- 1KB 미만 항목 쓰기 = 1 WCU (올림)
- 트랜잭션 쓰기 = 2 WCU (같은 데이터 크기 대비)

**RCU(읽기 용량 단위)**:
- 1 RCU = 최대 4KB 항목을 초당 1번 **강한 일관성 읽기**
- 1 RCU = 최대 4KB 항목을 초당 **2번 결과적 일관성 읽기** (절반의 비용)
- 4KB 초과 시 올림: 6KB 항목 = 2 RCU (강한 일관성)
- 트랜잭션 읽기 = 2 RCU (같은 데이터 크기 대비)

| 작업 | 항목 크기 | 소비 용량 |
|------|---------|---------|
| PutItem (강한 일관성) | 1.5KB | 2 WCU |
| PutItem (강한 일관성) | 4KB | 4 WCU |
| TransactWriteItems | 2KB | 4 WCU (2배) |
| GetItem (강한 일관성) | 3KB | 1 RCU |
| GetItem (결과적 일관성) | 4KB | 0.5 RCU |
| GetItem (강한 일관성) | 5KB | 2 RCU |
| TransactGetItems | 4KB | 2 RCU (2배) |

계산 예제:
- 1일 평균 주문 100만 건, 각 주문 항목 2.5KB → 하루 초당 평균 100만/86400 ≈ 12건, 피크가 평균의 5배라면 초당 60건. 항목이 2.5KB이므로 1건당 3 WCU(올림) → 피크 WCU = 60 × 3 = 180 WCU
- 읽기는 초당 1000건, 각 4KB, 결과적 일관성 → 1000 × (4/4) × (1/2) = 500 RCU

> 💡 **On-Demand 모드의 내부 동작** — On-Demand 모드는 RCU/WCU를 미리 설정하지 않고 실제 사용량에 따라 과금한다. 내부적으로 DynamoDB는 테이블의 과거 피크 트래픽의 2배까지 "자동 최대값"을 설정한다. 이 한도를 초과하는 경우 DynamoDB는 초기에는 수용하지만 지속되면 점진적으로 스로틀링할 수 있다. On-Demand에서 갑작스럽게 트래픽이 수십 배 급증하면 초기 수 분간 스로틀링이 발생할 수 있다. Provisioned + Auto Scaling에서는 Auto Scaling 정책이 평활화를 돕지만 스케일링 자체가 몇 분이 걸린다. 신규 테이블에서 트래픽이 폭증할 예정이라면, 시작 전에 한 번 대용량 Provisioned로 설정했다가 On-Demand로 전환하면 "자동 최대값"이 높게 설정되어 있어 안전하다.

> 🔍 **트랜잭션 비용이 2배인 이유** — DynamoDB 트랜잭션(TransactWriteItems/TransactGetItems)은 2-Phase Commit(2PC) 유사 프로토콜을 내부적으로 사용한다. 첫 번째 페이즈에서 모든 항목에 대한 잠금/예약을 수행하고, 두 번째 페이즈에서 실제 커밋을 수행한다. 이 두 단계가 각각 용량을 소비하기 때문에 동일한 데이터 크기의 단일 작업 대비 2배의 WCU/RCU가 소비된다. 트랜잭션은 한 번에 최대 25개 항목, 4MB까지 처리 가능하다.

## LSI와 GSI — 두 가지 보조 인덱스의 차이

DynamoDB의 기본 키로만 조회하면 한계가 있다. 다른 속성으로도 효율적으로 조회하려면 보조 인덱스가 필요하다. DynamoDB는 두 종류의 보조 인덱스를 제공한다.

**LSI(Local Secondary Index)**:
- 기본 테이블과 동일한 파티션 키, 다른 정렬 키
- 예: 기본 키가 `userId`(파티션) + `orderId`(정렬)이면, LSI는 `userId`(파티션) + `orderDate`(정렬)
- 테이블 생성 시에만 추가 가능 (나중에 추가 불가)
- 파티션 키가 같기 때문에 해당 파티션 내 데이터만 인덱싱 → **강한 일관성 읽기 가능**
- 파티션당 10GB 한계를 테이블과 공유
- 테이블당 최대 5개

**GSI(Global Secondary Index)**:
- 완전히 다른 파티션 키와 정렬 키로 정의 가능
- 언제든지 추가 또는 삭제 가능
- 독립적인 파티션 공간 → 별도의 WCU/RCU 용량 설정 필요
- 기본 테이블에서 GSI로 복제는 비동기 → **결과적 일관성만 가능**
- 비용: GSI의 WCU/RCU는 기본 테이블과 별도로 과금
- 테이블당 최대 20개

```
[기본 테이블] PK: userId, SK: orderId
┌──────────┬─────────┬───────────┬──────────┐
│ userId   │ orderId │ orderDate │ status   │
├──────────┼─────────┼───────────┼──────────┤
│ user_1   │ ord_001 │ 2025-05-01│ SHIPPED  │
│ user_1   │ ord_002 │ 2025-05-10│ PENDING  │
│ user_2   │ ord_003 │ 2025-05-08│ SHIPPED  │
└──────────┴─────────┴───────────┴──────────┘

[LSI] PK: userId (동일), SK: orderDate (새로운)
→ "user_1의 주문을 날짜순으로" 쿼리 가능
→ 강한 일관성 읽기 가능 (같은 파티션 내)

[GSI] PK: status (새로운), SK: orderDate (새로운)
→ "SHIPPED 상태의 주문을 날짜순으로" 쿼리 가능
→ 결과적 일관성만 가능 (비동기 복제)
```

| 항목 | LSI | GSI |
|------|-----|-----|
| 파티션 키 | 기본 테이블과 동일 | 독립적 (새로운 PK 가능) |
| 추가 시점 | 테이블 생성 시에만 | 언제든 가능 |
| 일관성 | 강한 일관성 가능 | 결과적 일관성만 |
| 용량 | 테이블과 공유 | 독립적 용량 |
| 최대 개수 | 5개 | 20개 |
| 파티션당 10GB 한계 | 테이블과 공유 | 별도 |

> ⚠️ **GSI에서 강한 일관성 요청의 함정** — GSI에서 `ConsistentRead=true`를 요청하면 API 호출은 성공하지만 내부적으로 결과적 일관성으로 처리된다. 오류가 나는 게 아니라 그냥 결과적 일관성으로 작동한다. 이 사실을 모르면 "GSI에서 강한 일관성을 설정했는데 왜 최신 데이터가 안 보이지?" 하는 버그를 만난다. 최신성이 중요한 조회는 기본 테이블을 직접 쿼리하거나 LSI를 사용해야 한다.

> 💡 **LSI/GSI 일관성 차이의 분산 이론적 배경** — LSI와 GSI의 일관성 차이는 분산 시스템의 "Read-your-writes Consistency"와 관련이 있다. LSI는 테이블과 동일한 파티션 내에 있으므로 쓰기와 읽기가 같은 스토리지 노드에서 이루어져 Read-your-writes가 보장된다. CAP 정리에서 LSI는 Partition 내 CP(Consistency + Partition Tolerance)를 제공한다. GSI는 비동기 복제를 통해 별도의 스토리지로 데이터가 전달되므로 복제 지연(보통 수 밀리초~수 초) 동안 최신 쓰기가 GSI에 반영되지 않을 수 있다. 이는 Eventual Consistency의 전형적인 모습이다.

> 🔍 **GSI Sparse Index 패턴** — GSI의 파티션 키나 정렬 키로 설정된 속성이 해당 테이블 항목에 없으면, 그 항목은 GSI에 포함되지 않는다. 이를 이용한 "Sparse Index 패턴"은 특정 상태의 항목만 인덱싱하는 기법이다. 예: `isActive` 속성이 있는 항목만 GSI에 포함시켜 활성 항목만 효율적으로 조회. 테이블 전체가 아닌 소수의 항목만 GSI를 통해 검색하므로 RCU 비용이 절감된다.

## DynamoDB Streams — 변경 이벤트의 실시간 파이프라인

DynamoDB Streams는 테이블의 모든 데이터 변경(INSERT, MODIFY, REMOVE)을 시간순 스트림으로 캡처한다. 스트림은 24시간 보존된다. Kinesis Data Streams와 달리 DynamoDB Streams는 파티션 키 기반으로 샤딩되어 있어 항목 순서가 보장된다.

Streams의 핵심 속성:
- **샤딩 구조**: Streams 자체도 파티션 키 기반으로 샤딩된다. 같은 파티션 키에 대한 변경은 항상 같은 샤드에 순서대로 들어간다 → 동일 항목에 대한 변경 순서가 보장된다.
- **Lambda 트리거**: Lambda가 Streams 샤드를 폴링해서 배치로 처리. 이벤트 소스 매핑(Event Source Mapping).
- **StreamViewType 옵션**:
  - `KEYS_ONLY`: 변경된 항목의 키만 (가장 저렴)
  - `NEW_IMAGE`: 변경 후 항목의 완전한 사본
  - `OLD_IMAGE`: 변경 전 항목의 완전한 사본
  - `NEW_AND_OLD_IMAGES`: 변경 전후 모두 (가장 많이 사용, 변경 내용 diff 가능)

실제 사용 패턴:
```
DynamoDB (주문 테이블)
       │ 새 주문 INSERT
       │
       ▼
DynamoDB Streams
       │
       ▼
Lambda (이벤트 소스 매핑)
       ├─── OpenSearch에 주문 데이터 인덱싱 (검색 기능)
       ├─── SNS로 주문 알림 발송
       ├─── 다른 DynamoDB 테이블에 집계 데이터 업데이트
       └─── Kinesis Data Firehose → S3 (데이터 레이크)
```

> 💡 **Event Sourcing 아키텍처 패턴** — DynamoDB Streams는 Event Sourcing 패턴의 자연스러운 기반이 된다. Event Sourcing은 Martin Fowler가 정의한 패턴으로, 상태 변경을 직접 저장하는 대신 그 상태를 만든 이벤트 시퀀스를 저장하는 방식이다. DynamoDB 테이블은 현재 상태를 저장하고, Streams는 모든 변경 이벤트의 불변 로그 역할을 한다. Lambda ESM(Event Source Mapping)은 이 이벤트를 소비해서 읽기 전용 프로젝션(ElastiCache, OpenSearch, 집계 테이블)을 유지한다. Greg Young이 제안한 CQRS(Command Query Responsibility Segregation)와 결합하면 높은 확장성과 감사 추적(Audit Trail)을 동시에 달성할 수 있다.

> 📚 **Amazon Prime Day 사례** — 2021년 Amazon Prime Day 동안 DynamoDB는 초당 8900만 건 이상의 요청을 처리했다고 AWS가 발표했다. 이 중 DynamoDB Streams와 Lambda를 통해 실시간 재고 업데이트, 주문 상태 알림, 사기 탐지 이벤트 처리가 이루어졌다. Streams의 샤드 구조가 동일 항목의 이벤트 순서를 보장하기 때문에, 재고 수량 감소 이벤트가 항상 증가 이벤트 이후에 처리되는 것이 보장됐다. 재고가 음수가 되는 버그를 방지하는 핵심 보장이다.

## Global Tables — 멀티 리전 액티브-액티브

DynamoDB Global Tables는 여러 AWS 리전에 걸쳐 동일한 테이블을 멀티 액티브(Active-Active)로 운영한다. 각 리전의 테이블은 읽기와 쓰기를 모두 처리한다.

복제는 DynamoDB Streams를 기반으로 이루어진다. 한 리전에서 쓰기가 발생하면 Streams를 통해 다른 리전으로 복제된다. 복제 지연은 일반적으로 1초 미만이다.

충돌 해결: 두 리전에서 동시에 같은 항목을 다르게 수정하면 충돌이 발생한다. DynamoDB는 "Last-Writer-Wins(LWW)" 정책으로 해결한다. 타임스탬프가 더 최신인 쓰기가 이긴다.

| 항목 | DynamoDB Global Tables | Aurora Global Database |
|------|----------------------|------------------------|
| 모델 | NoSQL (Key-Value) | 관계형 (MySQL/PostgreSQL 호환) |
| 멀티 리전 쓰기 | 액티브-액티브 (모든 리전에서 쓰기) | 액티브-패시브 (Primary만 쓰기) |
| 복제 방식 | Streams 기반 비동기 | 스토리지 레이어 비동기 |
| 복제 지연 | ~1초 | < 1초 |
| 충돌 해결 | LWW (자동) | 없음 (단일 Writer) |
| 페일오버 | 자동 (다른 리전이 이미 액티브) | 수동 Promote |
| RPO | ~1초 | < 1초 |
| RTO | ~0 (다른 리전 이미 서빙) | 수 분 (Promote 후) |

> 🔍 **LWW 충돌 해결의 한계와 대응** — DynamoDB Global Tables의 LWW 충돌 해결은 단순하지만 한계가 있다. 금융 트랜잭션에서 "계좌 잔액을 감소시키는 두 개의 동시 쓰기"가 두 리전에서 발생하면, LWW는 하나의 감소만 유효하게 처리하고 다른 하나를 덮어쓸 수 있다. 이 문제를 해결하려면: (1) Conditional Write + Version Attribute로 낙관적 잠금 구현 — `ConditionExpression: version = :expected_version`으로 버전 불일치 시 ConditionalCheckFailedException을 발생시켜 재시도, (2) 금융 데이터는 특정 리전에서만 쓰기를 허용하는 Active-Passive 패턴으로 운영. Global Tables를 사용하되 쓰기 리전을 한 곳으로 제한하고 다른 리전은 읽기 전용으로 운영한다.

> ⚠️ **Global Tables 활성화 요건** — DynamoDB Global Tables를 활성화하려면 테이블에 DynamoDB Streams(`NEW_AND_OLD_IMAGES`)가 반드시 활성화되어 있어야 한다. 또한 TTL(Time-To-Live) 속성 이름이 모든 리전에서 동일해야 한다. Global Tables 2019 버전(Version 2019.11.21)부터는 이미 데이터가 있는 테이블에도 Global Tables를 활성화할 수 있다.

## DAX — 마이크로초의 세계

DynamoDB Accelerator(DAX)는 DynamoDB 앞에 위치하는 인메모리 캐시 클러스터다. DynamoDB의 밀리초 응답을 마이크로초로 끌어내린다.

DAX의 특징:
- **투명한 캐싱**: 애플리케이션은 DynamoDB SDK 대신 DAX SDK를 사용. API가 DynamoDB와 동일해서 코드 변경이 최소화.
- **Item Cache**: GetItem, BatchGetItem 결과를 캐싱.
- **Query Cache**: Query, Scan 결과를 쿼리 파라미터 기반으로 캐싱.
- **쓰기 통과(Write-Through)**: DAX에 쓰면 DynamoDB에도 동기적으로 씌어진다. 캐시와 DB의 일관성 보장.
- **VPC 내 배포**: DAX 클러스터는 VPC 안에만 배포 가능. 인터넷에서 직접 접근 불가.
- **클러스터 모드**: Primary 노드 + 최대 10개 Read Replica 노드. 자동 장애 조치.

DAX가 적합한 경우와 그렇지 않은 경우:

| 적합한 경우 | 적합하지 않은 경우 |
|-----------|----------------|
| 읽기가 매우 많고 동일 항목을 반복 조회 | 강한 일관성 읽기가 반드시 필요한 경우 |
| 밀리초 미만의 응답 시간이 필요 | 쓰기가 매우 많고 읽기가 적은 워크로드 |
| 핫 항목(동일 항목 반복 조회) | 스캔 위주의 분석 워크로드 |
| 게임 리더보드, 소셜 카운터 | Lambda 함수 (VPC 설정 복잡성) |

> 💡 **Write-Through 캐시 전략과 캐시 무효화** — DAX의 캐시 전략은 Write-Through다. 쓰기 시점에 캐시(DAX)와 데이터베이스(DynamoDB) 모두를 동기적으로 업데이트한다. 이 전략은 캐시와 DB 간 불일치를 최소화하지만, 쓰기 지연이 캐시 없는 경우보다 약간 늘어날 수 있다. 반대로 Cache-Aside(Lazy Loading)는 읽기 시점에 캐시 미스가 발생했을 때만 DB에서 읽어와 캐시에 저장하는 전략으로, DAX에서는 기본적으로 지원되지 않는다. Phil Karlton의 유명한 말 "캐시 무효화와 이름 짓기는 컴퓨터 과학에서 가장 어려운 두 가지 문제" — DAX의 Write-Through는 이 문제를 자동으로 처리하도록 설계됐다. 단, TTL(기본 5분)이 지난 항목은 다음 읽기 시 캐시 미스가 발생한다.

> 📚 **Duolingo DAX 도입 사례** — Duolingo(언어 학습 앱)는 2019년 사용자 스트릭(연속 학습일) 카운터와 리더보드 데이터를 DynamoDB에서 DAX로 캐싱하도록 전환했다. 수천만 사용자가 매일 수십억 번 읽는 이 데이터는 DynamoDB 단독으로는 RCU 비용이 천문학적이었다. DAX 도입 후 DynamoDB에 대한 실제 읽기가 95% 이상 감소했고, 읽기 지연이 밀리초에서 마이크로초로 줄어들었다. 리더보드 페이지 로딩 속도가 눈에 띄게 빨라졌고, 비용은 80% 이상 절감됐다.

## PITR과 백업 — DynamoDB의 복구 옵션

**PITR(Point-In-Time Recovery)**: 최근 35일 내 초 단위로 복구. 기존 테이블과는 별도의 새 테이블로 복구. 활성화하면 추가 비용이 발생하지만 운영 안정성을 위해 강력히 권장된다.

**온디맨드 백업**: 수동으로 생성하는 전체 테이블 스냅샷. 영구 보존(삭제 전까지). AWS Backup 서비스와 통합해서 자동 스케줄 관리 가능. 다른 리전으로 복사 가능. 복구 시 같은 리전 또는 다른 리전의 새 테이블로 복구.

**S3 Export**: DynamoDB 테이블 데이터를 S3로 내보내기. Athena, EMR, Glue로 분석 가능. PITR이 활성화된 테이블에서만 사용 가능. 테이블 성능에 영향을 주지 않고 실행된다.

**S3 Import**: S3에서 DynamoDB로 데이터 가져오기. CSV, DynamoDB JSON, Ion 형식 지원. 신규 테이블로만 가져오기 가능.

복구 시 주의: 어떤 복구 방식이든 새 테이블이 생성된다. 기존 테이블을 덮어쓰지 않는다. 복구 후 애플리케이션의 테이블 참조를 업데이트하거나, 기존 테이블 이름으로 교체하는 추가 작업이 필요하다.

다른 클라우드와 비교:

| 항목 | DynamoDB | GCP Firestore/Bigtable | Azure Cosmos DB |
|------|----------|------------------------|-----------------|
| 모델 | Key-Value + Document | Document / Wide-Column | 다중 모델 (Document, Graph, Key-Value, Column, SQL) |
| 서버리스 | O (On-Demand) | O (Firestore) | O (Serverless) |
| 글로벌 멀티 액티브 | Global Tables (LWW) | Firestore 멀티 리전 | Cosmos DB 멀티 마스터 |
| 일관성 모델 | 결과적/강한 선택 | 결과적 (Firestore: Strong) | 5가지 레벨 (Strong ~ Eventual) |
| 보조 인덱스 | LSI/GSI | Composite Index | Partial/Spatial/Composite |
| TTL | O | O | O (Time to Live) |
| 트랜잭션 | O (25 항목 한도) | O | O |
| 인메모리 캐시 | DAX | Memorystore | Azure Cache for Redis |

> 📚 **Lyft의 Cassandra → DynamoDB 마이그레이션** — 2022년 Lyft는 Cassandra에서 DynamoDB로 전환한 경험을 공유했다. 주요 이유는 운영 부담 감소와 Global Tables를 통한 멀티 리전 HA였다. 마이그레이션 과정에서 가장 큰 도전은 파티션 키 재설계였다 — Cassandra에서 분산이 잘 됐던 키 전략이 DynamoDB에서는 Hot Partition을 만들어서 처음부터 다시 설계해야 했다. 또한 Cassandra의 튜너블 일관성(QUORUM, LOCAL_QUORUM 등)에 의존하던 코드가 DynamoDB의 이분법적 일관성(강한/결과적)으로 대체되었다. 이 사례는 "NoSQL 마이그레이션은 데이터 이동이 아니라 모델 재설계"라는 교훈을 준다.

## CLI로 DynamoDB 핵심 작업 실습

```bash
# 테이블 생성 (Composite Key: userId + orderId, LSI, Streams 활성화)
aws dynamodb create-table \
  --table-name Orders \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=orderId,AttributeType=S \
    AttributeName=orderDate,AttributeType=S \
    AttributeName=status,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
    AttributeName=orderId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --local-secondary-indexes '[
    {
      "IndexName": "userId-orderDate-index",
      "KeySchema": [
        {"AttributeName":"userId","KeyType":"HASH"},
        {"AttributeName":"orderDate","KeyType":"RANGE"}
      ],
      "Projection":{"ProjectionType":"ALL"}
    }
  ]' \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES

# GSI 추가 (운영 중 가능 — 기존 데이터에 소급 적용, 백필 자동)
aws dynamodb update-table \
  --table-name Orders \
  --attribute-definitions \
    AttributeName=status,AttributeType=S \
    AttributeName=orderDate,AttributeType=S \
  --global-secondary-index-updates '[
    {
      "Create": {
        "IndexName": "status-orderDate-index",
        "KeySchema": [
          {"AttributeName":"status","KeyType":"HASH"},
          {"AttributeName":"orderDate","KeyType":"RANGE"}
        ],
        "Projection":{"ProjectionType":"ALL"}
      }
    }
  ]'

# PITR 활성화
aws dynamodb update-continuous-backups \
  --table-name Orders \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true

# 조건부 쓰기 (낙관적 잠금 — 중복 삽입 방지)
aws dynamodb put-item \
  --table-name Orders \
  --item '{"userId":{"S":"user_1"},"orderId":{"S":"ord_001"},"orderDate":{"S":"2025-05-26"},"status":{"S":"PENDING"},"amount":{"N":"29900"}}' \
  --condition-expression "attribute_not_exists(orderId)"

# LSI 쿼리 (강한 일관성 — LSI에서는 가능)
aws dynamodb query \
  --table-name Orders \
  --index-name userId-orderDate-index \
  --key-condition-expression "userId = :uid AND orderDate BETWEEN :start AND :end" \
  --expression-attribute-values '{":uid":{"S":"user_1"},":start":{"S":"2025-05-01"},":end":{"S":"2025-05-31"}}' \
  --consistent-read

# GSI 쿼리 (결과적 일관성만 가능 — consistent-read 옵션 없음)
aws dynamodb query \
  --table-name Orders \
  --index-name status-orderDate-index \
  --key-condition-expression "#s = :status AND orderDate > :date" \
  --expression-attribute-names '{"#s":"status"}' \
  --expression-attribute-values '{":status":{"S":"SHIPPED"},":date":{"S":"2025-05-01"}}'

# Global Tables 추가 리전 활성화 (Streams 이미 활성화되어 있어야 함)
aws dynamodb update-table \
  --table-name Orders \
  --replica-updates '[{"Create":{"RegionName":"us-east-1"}}]'

# DAX 클러스터 생성 (VPC 내, 서브넷 그룹 필요)
aws dax create-cluster \
  --cluster-name orders-dax \
  --node-type dax.r5.large \
  --replication-factor 3 \
  --iam-role-arn arn:aws:iam::123456789012:role/DAXRole \
  --subnet-group-name my-dax-subnet-group

# Hot Partition 모니터링 (CloudWatch)
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedWriteCapacityUnits \
  --dimensions Name=TableName,Value=Orders \
  --start-time 2025-05-26T00:00:00Z \
  --end-time 2025-05-26T23:59:59Z \
  --period 300 \
  --statistics Sum
```

## 정리하며

DynamoDB는 파티션 키 설계가 전부다. 잘못된 파티션 키는 Hot Partition을 만들고, Hot Partition은 아무리 비용을 써도 해결이 안 된다. 균등하게 분포되는 High-Cardinality 키를 고르는 것이 DynamoDB 설계의 출발점이다.

GSI는 새로운 접근 패턴에 유연하게 대응하지만 결과적 일관성만 가능하다. LSI는 강한 일관성이 가능하지만 테이블 생성 시에만 추가할 수 있는 제약이 있다. 두 인덱스의 트레이드오프를 이해하고 접근 패턴을 미리 설계하는 것이 핵심이다.

DynamoDB Streams는 변경 이벤트를 실시간으로 파이프라인에 연결하는 핵심 도구다. Event Sourcing, CQRS 패턴과 결합하면 읽기 확장성과 감사 추적을 동시에 달성할 수 있다. DAX는 읽기 집약적인 워크로드에서 마이크로초 응답과 대폭 절감된 비용을 제공한다.

내일은 DynamoDB를 더 빠르게 만드는 DAX 심화와, 범용 인메모리 캐시인 ElastiCache Redis의 차이를 깊이 파고든다.

---

## 📝 연습 문제

**문제 1.** DynamoDB 테이블의 파티션 키를 선택할 때 가장 중요한 기준은 무엇인가?

A) 파티션 키 값의 길이가 짧을수록 좋다
B) 파티션 키는 숫자 타입이어야 한다
C) 파티션 키 값이 다양하고(High Cardinality) 균등하게 분포되어야 한다
D) 파티션 키는 자주 업데이트되어야 한다

**정답: C**

해설: Hot Partition을 방지하려면 데이터가 여러 파티션에 골고루 분산되어야 한다. 이를 위해 파티션 키는 카디널리티가 높고(값의 종류가 많고) 요청이 균등하게 분산되어야 한다. userId, orderId, deviceId처럼 값이 다양하고 랜덤에 가까운 키가 이상적이다. 길이, 타입, 업데이트 빈도는 성능과 직접 관련이 없다. 시험에서 "날짜를 파티션 키로 쓰면?" 같은 함정이 자주 나오는데, 날짜는 카디널리티는 높지만 오늘 날짜에 쓰기가 집중되는 편향 문제가 있다.

---

**문제 2.** DynamoDB의 GSI(Global Secondary Index)에 대한 설명으로 올바른 것은?

A) 테이블 생성 시에만 추가할 수 있다
B) 기본 테이블과 파티션 키가 같아야 한다
C) 강한 일관성(Strongly Consistent) 읽기를 지원한다
D) 완전히 다른 파티션 키와 정렬 키로 정의할 수 있으며, 언제든 추가 가능하고 결과적 일관성만 지원한다

**정답: D**

해설: GSI는 기본 테이블의 키와 완전히 독립적인 키로 정의할 수 있고, 테이블 운영 중 언제든 추가하거나 삭제할 수 있다. 단, 기본 테이블에서 GSI로 데이터가 비동기적으로 복제되기 때문에 결과적 일관성만 지원한다. A와 B는 LSI의 특성이다. C는 GSI에서 ConsistentRead=true를 요청해도 실제로는 결과적 일관성으로 처리된다.

---

**문제 3.** 1 RCU로 처리할 수 있는 작업은?

A) 8KB 항목의 강한 일관성 읽기 1회
B) 4KB 항목의 강한 일관성 읽기 1회
C) 4KB 항목의 결과적 일관성 읽기 1회
D) 2KB 항목의 강한 일관성 읽기 2회

**정답: B**

해설: 1 RCU = 최대 4KB 항목의 강한 일관성 읽기 1회. 또는 4KB 항목의 결과적 일관성 읽기 2회. A는 8KB이므로 2 RCU 필요. C는 4KB 결과적 일관성 1회는 0.5 RCU(=1 RCU로 2회 처리 가능). D는 2KB 항목의 강한 일관성 읽기는 1회당 1 RCU(올림), 2회면 2 RCU 필요.

---

**문제 4.** DynamoDB Streams를 Lambda에 연결해서 주문 이벤트를 처리한다. 같은 주문 항목(같은 파티션 키)에 대한 여러 변경 이벤트가 Lambda에 올바른 순서로 처리되는 것이 보장되는가?

A) 보장되지 않는다. DynamoDB Streams는 순서를 보장하지 않는다
B) 보장된다. 같은 파티션 키의 이벤트는 항상 같은 샤드에 순서대로 들어간다
C) 보장되지 않는다. Lambda는 이벤트를 병렬로 처리한다
D) 보장된다. Lambda가 단일 스레드로 모든 이벤트를 순서대로 처리한다

**정답: B**

해설: DynamoDB Streams는 파티션 키 기반으로 샤딩된다. 동일한 파티션 키를 가진 항목의 변경 이벤트는 항상 같은 샤드에 순서대로 기록된다. Lambda는 샤드당 하나의 실행 컨텍스트가 배치를 처리하므로, 같은 파티션 키의 이벤트는 순서가 보장된다. 단, 서로 다른 파티션 키의 이벤트는 서로 다른 샤드에 들어가므로 상대적 순서는 보장되지 않는다.

---

**문제 5.** DynamoDB On-Demand 모드와 Provisioned + Auto Scaling 모드 중 어느 것을 선택해야 하는지 결정하는 주요 기준은?

A) 데이터 크기 — 데이터가 클수록 On-Demand가 유리하다
B) 트래픽 예측 가능성 — 예측 불가능하고 불규칙하면 On-Demand, 예측 가능하고 안정적이면 Provisioned + AS
C) 리전 수 — 멀티 리전 사용 시 On-Demand만 가능하다
D) GSI 사용 여부 — GSI를 사용하면 On-Demand만 선택 가능하다

**정답: B**

해설: 핵심 기준은 트래픽 패턴의 예측 가능성이다. On-Demand는 요청당 과금이므로 갑작스러운 트래픽 급증에도 자동으로 처리되지만, 안정적이고 예측 가능한 트래픽에서는 Provisioned + Auto Scaling보다 비용이 높다. Provisioned + Auto Scaling은 설정한 RCU/WCU 기반으로 과금되므로 안정적 트래픽에서 비용 최적화가 가능하지만, 갑작스러운 급증 시 스케일링 지연이 있다. A, C, D는 모두 잘못된 설명이다.

---

**문제 6.** 이커머스 플랫폼에서 DynamoDB의 주문 테이블에 새 주문이 INSERT될 때마다 자동으로 재고를 업데이트하고 이메일 알림을 보내는 이벤트 기반 아키텍처를 구현하려고 한다. 가장 적합한 방법은?

A) 주문 Lambda 함수에서 재고 업데이트와 이메일 발송을 직접 호출한다 (동기)
B) DynamoDB Streams를 활성화하고 Lambda 이벤트 소스 매핑으로 후속 처리를 분리한다
C) 주기적으로 Scan을 실행해서 새 주문을 탐지하고 처리한다
D) CloudWatch 이벤트로 DynamoDB 변경을 감지한다

**정답: B**

해설: DynamoDB Streams + Lambda 이벤트 소스 매핑은 이벤트 기반 아키텍처의 표준 패턴이다. 주문 Lambda 함수는 주문 저장만 담당하고, 후속 처리(재고 업데이트, 이메일 발송)는 Streams를 통해 별도의 Lambda로 분리된다. 이 패턴은 관심사 분리, 재시도 자동화, 확장성 측면에서 모두 유리하다. A는 주문 처리와 후속 작업이 강결합되어 하나가 실패하면 전체가 실패한다. C는 폴링 방식이라 지연이 있고 중복 처리 위험이 있다. D는 DynamoDB 변경을 CloudWatch Events/EventBridge로 직접 감지하는 기능은 없다.

---

**문제 7.** DynamoDB에서 "사용자(userId)의 최근 주문을 날짜(orderDate)를 기준으로 정렬해서 조회"하는 패턴이 빈번하다. 테이블 기본 키는 (userId, orderId)이고 orderDate 속성이 있다. 이 쿼리를 효율적으로 지원하려면?

A) Scan + Filter Expression으로 처리한다
B) orderDate를 파티션 키로 하는 GSI를 생성한다
C) LSI를 생성한다: 파티션 키=userId, 정렬 키=orderDate
D) 별도의 Orders-by-date 테이블을 만들고 매 쓰기마다 두 테이블에 모두 저장한다

**정답: C**

해설: LSI는 동일한 파티션 키(userId)와 다른 정렬 키(orderDate)로 정의할 수 있다. "특정 사용자(userId)의 주문을 날짜순으로"는 LSI의 완벽한 사용 사례다. 강한 일관성도 가능하다. 단, LSI는 테이블 생성 시에만 추가 가능하므로 미리 설계해야 한다. B는 orderDate로 전체 테이블을 파티션하면 특정 날짜에 쓰기 집중이 발생한다. A는 Scan은 전체 테이블을 읽으므로 비효율적이다. D는 중복 저장과 데이터 일관성 문제가 있다.

---
