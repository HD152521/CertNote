# Day 5 - Week 6 Comprehensive Review: The Complete DynamoDB Map

This is the last day of Week 6. DynamoDB is the service that generates more exam questions than any other on DVA-C02, and plain memorization won't hold up against reworded variations. Today we connect everything the week covered — the mathematics of partition key design, the read consistency models, the internal differences between LSI and GSI, the DAX cache layer, Streams plus Lambda integration, the two-phase commit behind transactions, and TTL's asynchronous deletion — into a single map, then close with comprehensive questions in real exam format. Someone who looks at DynamoDB through the lens of "how is data actually stored and read at the partition level" and someone who has only memorized API names will get completely different results on the same question.

## The Complete DynamoDB Architecture Map

```
Client request
      │
      ▼
  [DAX cluster]  ─── cache hit → returns in μs
      │ cache miss
      ▼
[DynamoDB request router]
      │
      ▼
[Partition metadata service]
  Partition key → hash → determines the owning storage node
      │
      ▼
[Storage node (B-Tree + WAL)]
  Primary Node ──replicate──► Replica 1
               ──replicate──► Replica 2 (spread across 3 AZs)
      │
      ├── Read (Eventually Consistent): any replica
      ├── Read (Strongly Consistent): Primary only
      └── Write: Primary → WAL → replication complete
      │
      ▼
[DynamoDB Streams shard]  (changes retained 24 hours)
      │
      ▼
[Lambda ESM polling]
  Batch processing → BisectBatchOnFunctionError → DLQ
```

> 💡 **Related theory**: DynamoDB's internal storage is a B-Tree-based LSM (Log-Structured Merge-tree). On a write, the change is first recorded in the Write-Ahead Log (WAL); once the Primary node acknowledges the write, it propagates to the remaining replicas in the background. An Eventually Consistent read can hit a replica before that propagation finishes, which is how you end up seeing stale data. A Strongly Consistent read goes only to the Primary, so it is always current — but it consumes twice the RCU.

## Partition Key Design — The Mathematics of Hot Partitions

Per-partition limits: **3,000 RCU + 1,000 WCU + 10GB**

When items concentrate on one partition, that partition hits its limit and throws `ProvisionedThroughputExceededException` — the hot partition problem.

```
Bad partition key examples:
  status = "PENDING" → most new orders land on a single partition
  date = "2026-06-27" → all of today's data on a single partition

Good partition key examples:
  orderId = UUID → random distribution
  userId + timestamp → distributed per user, sorted by time

Write sharding pattern:
  partition_key = userId + "#" + str(random.randint(0, 9))
  → the same userId is spread across 10 partitions
  → reads must Query all of 0~9 and merge the results
```

> 🔍 **Going deeper**: Adaptive Capacity, introduced in 2018, automatically shifts spare capacity from other partitions when traffic to one partition rises, so a hot partition can temporarily survive exceeding its provisioned share. Burst Capacity separately accumulates whatever capacity a partition left unused over the last 300 seconds (5 minutes), banking up to 300 seconds' worth as reserve and spending it on a sudden spike. Both operate automatically, but neither is a real fix for a sustained hot partition.

## RCU/WCU Mathematics: A Quick Reference

```
Reads (unit: 4KB, rounded up):
  Eventually Consistent = ceil(size/4KB) × 0.5
  Strongly Consistent   = ceil(size/4KB) × 1
  Transactional Read    = ceil(size/4KB) × 2

Writes (unit: 1KB, rounded up):
  Standard Write        = ceil(size/1KB) × 1
  Transactional Write   = ceil(size/1KB) × 2

Key point: reads are measured in 4KB, writes in 1KB → for the same item you need 4× more WCU than RCU
```

Worked examples:
```
6.5KB item, strongly consistent, 40 per second:
  ceil(6.5/4) = 2 → 2 × 1 × 40 = 80 RCU

3KB item, transactional write, 20 per second:
  ceil(3/1) = 3 → 3 × 2 × 20 = 120 WCU
```

> ⚠️ **Trap**: FilterExpression does not reduce RCU. Items that don't match the condition are still read and then filtered out, so the RCU is already spent. To save RCU you have to reduce the number of items read in the first place with KeyConditionExpression. The correct approach is to create a GSI whose partition key matches your query pattern.

## LSI vs GSI: How They Work Internally

| Item | LSI | GSI |
|------|-----|-----|
| PK | Same as the base table | Can be a different attribute |
| SK | A different attribute | Can be a different attribute |
| When created | Only at table creation | Add or delete at any time |
| Maximum count | 5 | 20 (default limit, increase on request) |
| Consistency model | Both Eventually and **Strongly** supported | Eventually Consistent only |
| Capacity | Shares the base table's capacity | **Separate RCU/WCU setting** |
| Sparse Index | Supported | Supported |
| Storage structure | A separate B-Tree inside the same partition as the base table | An entirely separate partition space |

> 💡 **Related theory**: An LSI shares the base table's partition key, so its data is stored together in the same partition. That co-location is what lets the base table's Primary node manage the LSI data as well, which in turn makes Strongly Consistent reads possible. A GSI is replicated asynchronously into a completely separate partition space, so replication lag exists and only Eventually Consistent reads are supported. If you think of a GSI as "a separate table," this difference feels natural.

**The Sparse Index pattern**: if you use an attribute that not every item carries as a GSI's partition key, only the items that have that attribute show up in the GSI.

```
Users table:
  userId(PK) | email | isPremium (present on some items only)

GSI: isPremium-index
  PK = isPremium → only items carrying the isPremium attribute are indexed
  Query "isPremium = true" → efficiently retrieves premium users only
  Regular users without isPremium are absent from the GSI entirely → storage cost saved
```

> 📚 **Case study**: When Airbnb adopted DynamoDB Single-Table Design, it used a GSI sparse index for reservation status management. Only items whose reservation status was "PENDING" were given a `pendingAt` attribute, which served as the GSI's partition key. When a reservation is confirmed, `pendingAt` is deleted and the item drops out of the GSI automatically. That makes "all currently PENDING reservations" a GSI Query costing O(number of PENDING items), with no full table Scan.

## The DAX Cache Layer — When Does It Get Bypassed?

```
DAX caches:
  GetItem → Item Cache (default TTL 5 minutes)
  Query   → Query Cache (default TTL 5 minutes)
  Scan    → Query Cache

DAX is bypassed (goes straight to DynamoDB):
  ConsistentRead=true strongly consistent reads
  TransactGetItems
  All writes (Put/Update/Delete)
```

DAX writes are write-through: write to DynamoDB first → update the Item Cache → return completion. It isn't write-back, so there is no risk of data loss.

> ⚠️ **Trap**: DAX is reachable only from inside a VPC. There is no direct access from the internet. For a Lambda function to use DAX, that Lambda must sit in the same VPC, and the DAX cluster's security group must allow the Lambda's security group. A DAX cluster needs at least 3 nodes (Multi-AZ) for high availability.

## DynamoDB Streams + Lambda ESM in Detail

```
Stream view types:
  KEYS_ONLY:          PK + SK only (cheapest)
  NEW_IMAGE:          the whole item after the change
  OLD_IMAGE:          the whole item before the change
  NEW_AND_OLD_IMAGES: both before and after (audit logging)

Key Lambda ESM settings:
  BatchSize:                    1~10,000 records
  BisectBatchOnFunctionError:   on error, split the batch in half and retry
  MaximumRetryAttempts:         maximum retry count (default: unlimited)
  DestinationConfig:            failed records → SQS DLQ or SNS
  ParallelizationFactor:        parallel Lambdas per shard (1~10)
  FilterCriteria:               trigger Lambda only on matching event patterns
```

> 💡 **Related theory**: DynamoDB Streams runs on a Kinesis-based architecture internally. There is one stream shard per partition, and within a shard the ordering of events per partition key is guaranteed. Lambda ESM polls the shards — Streams does not "push" to Lambda; Lambda "pulls" from Streams. Setting `ParallelizationFactor=10` lets 10 Lambdas process a single shard in parallel, but it complicates the ordering guarantee for events sharing a partition key.

A `FilterCriteria` example — process INSERT events only:
```json
{
  "Filters": [
    {
      "Pattern": "{\"eventName\": [\"INSERT\"]}"
    }
  ]
}
```

Identifying a TTL deletion event inside the Lambda function:
```python
def handler(event, context):
    for record in event['Records']:
        if record['eventName'] == 'REMOVE':
            user_identity = record.get('userIdentity', {})
            if user_identity.get('type') == 'Service':
                # Automatic deletion by TTL → skip the business logic
                continue
            # Explicit DeleteItem call → record an audit log
            log_deletion(record['dynamodb']['OldImage'])
```

> 📚 **Case study**: A 2019 DoorDash case. In a pipeline that received order-completion events from DynamoDB Streams and updated an ElasticSearch index, the Lambda was configured with BatchSize=100. When orders surged, processing fell behind, the Lambda timed out, the entire batch failed, and the same 100 records fell into a loop of endless retries. The problem was that neither `BisectBatchOnFunctionError=true` nor `DestinationConfig` (a DLQ) had been configured. After the fix, the pipeline isolated poison-pill messages to a DLQ while normal records kept flowing.

## Transaction vs Conditional Write: How to Choose

```
Single item, condition needed → ConditionExpression (fast and cheap)
Multiple items need atomicity → TransactWriteItems (2× cost)
Reads and writes need atomicity → TransactGetItems + TransactWriteItems
Idempotent API request → ClientRequestToken (valid 10 minutes)
```

| Scenario | Recommended API | Reason |
|---------|---------|------|
| Prevent duplicate orders | PutItem + `attribute_not_exists` | Single item, only a condition is needed |
| Decrement inventory + create order | TransactWriteItems | Two tables need atomicity |
| Detect concurrent modification conflicts | UpdateItem + version condition | Optimistic locking |
| Bulk data load | BatchWriteItem | Atomicity unnecessary, speed first |
| First-come-first-served coupon claim | UpdateItem + `attribute_not_exists` | Single item, first-write-wins |

## PITR vs On-Demand Backup vs TTL

| Item | PITR | On-Demand Backup | TTL |
|------|------|-----------------|-----|
| Purpose | Recovering from mistakes | Long-term retention snapshot | Automatic deletion of temporary data |
| Retention | Up to 35 days (second-level restore) | Indefinite | Asynchronous deletion within 0~48 hours |
| Cost | Additional charge per GB | Additional charge per GB | Free (consumes no WCU) |
| Restore target | New table only | New table only | - |
| Automation | Automatic (once enabled) | Manual or AWS Backup | Automatic |

> 🔍 **Going deeper**: PITR is capped at 35 days because AWS internally retains the change log (WAL) for 35 days. If you additionally connect Kinesis Data Streams for DynamoDB, you can retain the change history for up to 365 days, and by building a Kinesis Firehose → S3 pipeline you can keep it for years under an S3 lifecycle policy. When you need long-term audit logs, Streams + Kinesis is the standard answer.

## Global Tables — The Implications of Active-Active Design

```
Conflict resolution: Last Writer Wins (latest timestamp wins)
Replication:         asynchronous, based on DynamoDB Streams
Consistency:         local strong consistency within each region only
Requirements:        Streams must be enabled; on-demand or identical provisioning
```

The trap you need to know before using Global Tables: "global Strongly Consistent" does not exist. If data written in Seoul hasn't yet replicated to Virginia, a strongly consistent read in Virginia still won't see Seoul's latest data. Each region guarantees consistency only against its own local replica.

> ⚠️ **Trap**: When two regions modify the same item simultaneously in Global Tables, the conflict is resolved by Last Writer Wins. Both regions return a success response, yet one of the writes ends up overwritten. For something like financial data, where both writes must be durable, Global Tables' conflict resolution policy may simply be unsuitable. In that case you should choose an architecture that permits writes only in a single "primary" region and keeps the other regions read-only.

## Core Numbers to Memorize

```
Max item size:               400KB
Transaction max:             100 items, 4MB
BatchWriteItem:              25 items, 16MB
BatchGetItem:                100 items, 16MB
Streams retention:           24 hours (fixed)
Kinesis for DDB retention:   up to 365 days
PITR restore window:         35 days
TTL deletion delay:          0~48 hours
On-demand mode switch:       once per 24 hours
Partition limits:            3,000 RCU + 1,000 WCU + 10GB
GSI default max:             20
LSI max:                     5 (at creation only)
DAX default TTL:             5 minutes (Item Cache, Query Cache)
Transaction ClientRequestToken: valid 10 minutes
```

## 📝 Week 6 Comprehensive Practice Problems

**문제 1.** 4KB 항목을 최종 일관성으로 초당 200회, 강력한 일관성으로 초당 100회 읽는다. 총 프로비저닝 RCU는?

A) 150 RCU
B) 200 RCU
C) 250 RCU
D) 300 RCU

**정답: B**
해설: 최종 일관성 = ceil(4/4) × 0.5 × 200 = 1 × 0.5 × 200 = 100 RCU. 강력한 일관성 = ceil(4/4) × 1 × 100 = 1 × 1 × 100 = 100 RCU. 합계 = 200 RCU. 두 읽기 유형을 동시에 프로비저닝할 때는 합산한다.

---

**문제 2.** DynamoDB GSI에 대한 설명 중 옳지 않은 것은?

A) GSI는 LSI와 달리 테이블 생성 후에도 언제든 추가하거나 삭제할 수 있다
B) GSI는 기본 테이블과 용량을 공유하지 않고 별도의 RCU/WCU를 프로비저닝한다
C) GSI는 Strongly Consistent 읽기를 지원한다
D) GSI의 파티션 키는 기본 테이블 PK와 무관하게 다른 속성을 사용할 수 있다

**정답: C**
해설: GSI는 Eventually Consistent 읽기만 지원한다. 기본 테이블과 완전히 별도의 파티션 공간에 비동기 복제되므로 복제 지연이 존재해 강력한 일관성이 불가능하다. Strongly Consistent를 지원하는 보조 인덱스는 LSI뿐이다(기본 테이블과 같은 파티션 내 저장이기 때문). A, B, D는 모두 GSI의 올바른 특성이다.

---

**문제 3.** DynamoDB Streams에서 Lambda ESM의 `BisectBatchOnFunctionError=true`를 설정했을 때 동작은?

A) 오류가 난 배치 전체를 분할 없이 처음부터 동일하게 반복 재시도한다
B) 오류 발생 시 배치를 반으로 분할하고 각각 별도로 재시도해 오류 원인 레코드를 격리한다
C) 오류 발생 즉시 배치 전체를 DestinationConfig의 DLQ로 보내고 폐기한다
D) 오류 발생 시 실행 환경(Lambda)을 재시작해 메모리를 초기화하고 같은 배치를 다시 처리한다

**정답: B**
해설: `BisectBatchOnFunctionError=true`는 배치 처리 실패 시 해당 배치를 정확히 반으로 분할해 각각 별도 Lambda 호출로 재시도한다. 이를 반복하면 결국 오류를 일으키는 단일 레코드(Poison Pill)를 격리할 수 있다. `DestinationConfig`의 DLQ를 함께 설정하면 격리된 레코드가 최대 재시도 후 DLQ로 이동해 나머지 정상 처리가 계속된다. 없으면 오류 레코드가 스트림을 차단해 뒤쪽 레코드가 처리되지 않는다.

---

**문제 4.** DAX를 사용 중인 애플리케이션에서 금융 계좌 잔액을 조회할 때 항상 최신 값을 보장해야 한다. 올바른 접근법은?

A) DAX Item Cache의 TTL을 0으로 설정해 캐시가 즉시 만료되게 한다
B) DAX를 우회하고 DynamoDB에 `ConsistentRead=true`로 직접 쿼리한다
C) DAX 앞에 API Gateway 응답 캐시를 추가해 조회를 가속한다
D) DAX 클러스터 노드 수를 늘려 캐시 적중률과 처리량을 높인다

**정답: B**
해설: DAX는 `ConsistentRead=true` 요청을 자동으로 DynamoDB에 직접 라우팅한다. 즉 애플리케이션 코드에서 `ConsistentRead=true`를 설정하면 DAX SDK가 자동으로 캐시를 우회해 DynamoDB Primary 노드에서 최신 데이터를 읽는다. DAX TTL을 0으로 설정하면 캐시를 사실상 비활성화하는 것과 같아 DAX의 의미가 없다. 금융 잔액 같은 강력한 일관성 요구사항과 일반 상품 정보 같은 최종 일관성 허용 항목을 같은 DAX 클러스터에서 처리할 때 일관성 플래그로 구분하는 것이 올바른 패턴이다.

---

**문제 5.** DynamoDB 테이블의 온디맨드 모드에서 초당 요청이 갑자기 기존 최고치의 5배로 증가했다. 어떤 현상이 발생하는가?

A) 온디맨드는 사실상 무한 확장이라 5배 급증도 throttling 없이 그대로 처리된다
B) `ProvisionedThroughputExceededException`이 발생한다
C) 급증을 감지하면 테이블이 자동으로 프로비저닝 모드로 전환돼 용량을 고정한다
D) 초과 요청이 내부 큐에 적재되었다가 용량 확보 후 순차 처리된다

**정답: B**
해설: 온디맨드 모드는 "무한 확장"이 아니다. 직전에 처리한 트래픽 피크의 2배까지만 즉시 자동 확장된다. 5배 증가는 이 한도를 초과하므로 throttling이 발생한다. 신규 테이블이나 오랫동안 낮은 트래픽이었던 테이블은 "예열(warm-up)"이 충분하지 않아 더 낮은 임계값에서 throttling이 시작된다. 해결책: 프로비저닝 모드에서 충분한 트래픽을 처리해 예열한 후 온디맨드로 전환하거나, 프로비저닝 + Auto Scaling으로 점진적 확장한다.

---

**문제 6.** `status = "ACTIVE"` 속성이 있는 사용자만 GSI에 인덱싱하려 한다. 가장 효율적인 방법은?

A) GSI 정의에 status = "ACTIVE" FilterExpression을 걸어 ACTIVE 항목만 인덱싱되게 한다
B) 모든 사용자를 GSI에 인덱싱한 뒤 Query 시 FilterExpression으로 status = "ACTIVE"만 걸러낸다
C) status 속성을 GSI의 파티션 키로 사용한다 (Sparse Index 패턴)
D) 별도 Lambda가 Streams를 받아 status = "ACTIVE" 항목만 복제 테이블에 동기화한다

**정답: C**
해설: Sparse Index 패턴이다. status 속성을 GSI의 파티션 키로 사용하면 status 속성이 존재하는 항목만 GSI에 인덱싱된다. status가 없는 항목은 GSI에 나타나지 않는다. A는 FilterExpression이 이미 읽은 후 필터링이라 RCU 절감 없음. B도 같은 문제. D는 복잡도 증가와 데이터 동기화 문제. GSI Sparse Index는 "속성 존재 자체가 인덱싱 조건"이 되어 추가 코드 없이 효율적 필터링을 달성한다.

---

**문제 7.** DynamoDB Streams의 `NEW_AND_OLD_IMAGES` 뷰 타입을 사용하는 가장 적합한 시나리오는?

A) 새 항목 삽입 후 그 전체 내용만 필요한 경우
B) 변경 전/후를 비교해 감사 로그를 기록하거나 변경 내용을 파악해야 하는 경우
C) 삭제·변경된 항목의 식별 키(PK/SK)만 있으면 되는 경우
D) 스트림 스토리지·전송 비용을 최소화해야 하는 경우

**정답: B**
해설: `NEW_AND_OLD_IMAGES`는 변경 전후 전체 항목을 모두 기록하므로 "무엇이 어떻게 바뀌었는가"를 알 수 있다. 감사 로그, 변경 내역 추적, 특정 필드 변경 감지에 적합하다. 스토리지 비용 최소화에는 `KEYS_ONLY`(PK/SK만 기록)가 적합하다. 새 항목 삽입 후 처리에는 `NEW_IMAGE`로 충분하다. 삭제 후처리에는 `OLD_IMAGE`가 적합하다.

---

**문제 8.** 다음 중 DynamoDB TTL에 대한 올바른 설명을 모두 고르시오.

A) TTL 만료 항목이 Streams에 REMOVE로 기록될 때 `userIdentity.type = "Service"`로 식별된다
B) TTL 삭제는 일반 DeleteItem과 동일하게 항목 크기에 비례한 WCU를 소비한다
C) TTL 속성값은 Unix epoch 초 단위 숫자여야 한다
D) TTL 만료 시각이 지나면 즉시 해당 항목이 Query/GetItem 결과에서 제외된다

**정답: A, C**
해설: A(맞음) — TTL 삭제를 일반 DeleteItem과 구분하려면 Stream 레코드의 `userIdentity` 필드를 확인한다. `type = "Service"`, `principalId = "dynamodb.amazonaws.com"`이면 TTL 삭제다. B(틀림) — TTL 삭제는 WCU를 소비하지 않아 비용 효율적이다. C(맞음) — 반드시 Unix epoch 초 단위 숫자. 밀리초나 ISO 날짜 문자열은 TTL로 인식되지 않는다. D(틀림) — TTL 만료 후 0~48시간 지연이 있어 만료된 항목이 여전히 조회될 수 있다.

---

**문제 9.** DynamoDB 테이블에 `orderId(PK)`, `createdAt(SK)`, `category`가 있다. "특정 category의 주문을 createdAt 오름차순으로 조회"하려 한다. 가장 효율적인 인덱스 설계는?

A) category를 PK로 하는 GSI 추가 (SK = createdAt)
B) 기본 테이블 전체를 Scan하면서 FilterExpression(category = :c)으로 거른 뒤 앱에서 정렬
C) createdAt을 PK로 하는 GSI를 추가해 시간순으로 조회
D) category를 SK로 하는 LSI를 추가 (PK는 기본 테이블의 orderId 고정)

**정답: A**
해설: GSI를 PK=category, SK=createdAt으로 구성하면 `Query(PK=category, ScanIndexForward=true)`로 특정 카테고리의 주문을 createdAt 오름차순으로 효율적으로 조회할 수 있다. B는 전체 테이블 Scan이라 비용이 크고 느리다. C는 createdAt이 PK면 시간대별 분산이 안 되고 정렬 조건도 활용 못한다. D는 LSI가 기본 테이블과 같은 PK(orderId)를 써야 하므로 category를 SK로 쓸 수는 있지만, orderId를 알아야만 조회 가능해 "특정 category 전체 조회"에 적합하지 않다.

---

**문제 10.** 전자상거래 플랫폼에서 주문 이벤트를 DynamoDB에 저장하고, 새 주문(INSERT) 시 실시간 알림을 보내야 한다. INSERT 이벤트만 처리하도록 Lambda를 구성하는 가장 효율적인 방법은?

A) Lambda 핸들러 코드에서 `eventName != "INSERT"`인 레코드를 조기 return으로 건너뛴다
B) ESM `FilterCriteria`에서 `eventName = "INSERT"` 패턴을 설정한다
C) INSERT 전용 스트림을 따로 만들어 그 스트림만 Lambda에 연결한다
D) 모든 Stream 이벤트를 SQS로 보낸 뒤 Lambda가 큐에서 INSERT만 골라 처리한다

**정답: B**
해설: ESM `FilterCriteria`는 DynamoDB Streams 이벤트를 Lambda 호출 전에 서버 사이드에서 필터링한다. INSERT만 필터링하면 MODIFY, REMOVE 이벤트는 Lambda 호출 자체가 발생하지 않아 Lambda 실행 비용이 줄고 처리 효율이 높아진다. A는 Lambda가 호출은 되되 코드에서 건너뛰는 방식이라 호출 비용이 발생한다. C는 DynamoDB Streams는 테이블당 하나다. D는 불필요한 구성 복잡도가 추가된다. Filter 패턴: `{"eventName": ["INSERT"]}`.

---

**문제 11.** DynamoDB TransactWriteItems에서 `ConditionCheck` 액션의 역할은?

A) 트랜잭션 내에서 ConditionExpression을 충족할 때만 해당 항목을 조건부로 수정한다
B) 쓰기 없이 다른 테이블의 조건만 검사하고, 조건 불만족 시 전체 트랜잭션을 롤백한다
C) 트랜잭션 커밋이 끝난 뒤 결과 데이터의 유효성을 사후 검증한다
D) GSI에 정의된 조건식을 검사해 인덱스 정합성을 보장한다

**정답: B**
해설: `ConditionCheck`는 트랜잭션 내에서 쓰기 없이 특정 항목의 조건만 검사하는 액션이다. 예를 들어 주문 생성 트랜잭션에서 사용자의 계정 상태가 ACTIVE인지 확인하고 싶을 때, Users 테이블을 수정하지 않고도 조건만 검사할 수 있다. 조건이 실패하면 `TransactionCanceledException`이 발생하고 전체 트랜잭션(다른 테이블의 Put/Update/Delete 포함)이 롤백된다. 이 액션이 없으면 트랜잭션 전에 별도 읽기를 해야 하고 TOCTOU 버그가 생길 수 있다.

---

**문제 12.** DynamoDB 단일 테이블 설계(Single-Table Design)에서 엔티티 타입별 쿼리를 지원하는 일반적인 패턴은?

A) 엔티티 타입마다 별도 테이블을 만들어 타입별 조회를 분리한다
B) GSI에서 파티션 키를 `entity_type` 속성으로 사용하는 Sparse Index 패턴
C) 단일 테이블을 Scan하면서 FilterExpression으로 entity_type을 걸러낸다
D) PartiQL `SELECT ... WHERE entity_type = 'Order'`로 타입을 조회한다

**정답: B**
해설: Single-Table Design에서는 `PK = ENTITY_TYPE#id` 패턴과 함께 `entity_type` 속성에 타입을 저장하고, 이를 GSI 파티션 키로 사용한다. `Query GSI(PK = "ORDER")`면 모든 주문, `Query GSI(PK = "USER")`면 모든 사용자를 효율적으로 조회한다. C(Scan + Filter)는 테이블 전체를 읽어 비용이 크다. D(PartiQL)도 내부적으로 Scan을 수행할 수 있다. B의 GSI 패턴이 O(해당 타입 수)의 효율적 조회를 제공한다.

---
