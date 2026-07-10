# Day 2 - DynamoDB: The Mathematics of Partition Key Design, LSI/GSI Internal Workings, Single-Table Design

When first learning DynamoDB, you hear "you must choose the partition key well," but what "choosing well" means mathematically is rarely taught well. In this day, we understand why partition key design is a mathematical problem, how LSI and GSI are stored differently internally, and why Single-Table Design has become the standard pattern for DynamoDB where dozens of microservices previously used separate tables.

## The Mathematics of Partition Key Cardinality

Mathematically defining a "good" partition key choice: **reads/writes load must be evenly distributed across all partitions**.

The metrics measuring this even distribution are Cardinality and Skewness.

```
Cardinality calculation:
  userId(UUID): Millions of unique values → Millions of possible partitions → Good
  status: 3~5 values → Max 5 partitions → Hot partition risk
  date: Thousands of values but writes concentrate on today → Temporal skew

Why skewness matters:
  Partition A: 900 writes/sec (close to 1,000 WCU limit)
  Partition B: 10 writes/sec
  Partition C: 5 writes/sec

  Total table WCU = 915/s has headroom
  but throttling occurs only in Partition A → Adaptive Capacity mitigates
  but extreme skew overwhelms AC capacity
```

In practice, the technique to solve hot partitions: **Add shard number to partition key (Write Sharding)**

```python
import random

def get_sharded_pk(base_pk: str, shard_count: int = 10) -> str:
    """Append random shard number to partition key for distribution"""
    shard = random.randint(0, shard_count - 1)
    return f"{base_pk}#{shard}"

# Example: distribute date-based PK
date_key = "2026-06-26"
sharded_key = get_sharded_pk(date_key, 10)
# → "2026-06-26#7" or "2026-06-26#3", etc. — distributed across 10 partitions

# On read: query all shards in parallel (Scatter-Gather)
def query_all_shards(date: str, shard_count: int = 10):
    results = []
    for shard in range(shard_count):
        pk = f"{date}#{shard}"
        results.extend(query_partition(pk))
    return results
```

The downside of Write Sharding is that reads require the **Scatter-Gather** pattern — query all shards then merge results. Read complexity increases, so use only in "severe hot partition write-heavy scenarios."

> 💡 **Related theory**: Write Sharding is an application of "horizontal partitioning" from distributed database theory. The same principle solves Cassandra's "wide partitions" problem. The shard count (Fan-out Factor) is calculated as: (Predicted peak WCU) / (Per-partition WCU limit of 1,000). If peak WCU is 8,000, minimum 8 shards needed. Assuming 10 provides headroom.

## LSI vs GSI — Fundamental Difference in Internal Storage

LSI and GSI are both "secondary indexes" but have completely different internal implementations.

**LSI (Local Secondary Index)**: As the name "local" implies, index data is stored **within the same partition as the base table**. Uses the base table's partition key unchanged while only changing the sort key.

```
Base table partition:
userId=U001 partition
  ├── Item(orderId=O001, orderDate=2026-01, status=PENDING, total=50000)
  ├── Item(orderId=O002, orderDate=2026-02, status=COMPLETED, total=30000)
  └── Item(orderId=O003, orderDate=2026-01, status=COMPLETED, total=80000)

LSI (PK=userId, SK=orderDate instead):
Creates additional index structure only within the same partition
  ├── Item(orderDate=2026-01, orderId=O001, ...) ← Sort key only changed
  ├── Item(orderDate=2026-01, orderId=O003, ...)
  └── Item(orderDate=2026-02, orderId=O002, ...)
```

Because LSI is in the same partition as the base table:
- **Supports Strongly Consistent reads** (can read from same node)
- **No separate RCU/WCU needed** (shares base table capacity)
- **Definable only at table creation** (cannot add/delete after)
- **10GB limit per partition item collection** (summed by PK)

**GSI (Global Secondary Index)**: As "global" implies, index data is stored in **completely separate partitions from the base table**. Can use an attribute different from the base table's partition key as the GSI partition key.

```
Base table:
Partitioned by PK=userId, SK=orderId

GSI (PK=status):
Stored in completely separate partitions
  status=PENDING partition: O001, O005, O008
  status=COMPLETED partition: O002, O003, O007
  status=FAILED partition: O004, O006

This data is asynchronously synchronized with the base table
```

Because GSI is in separate partitions:
- **Eventually Consistent reads only** (async replication)
- **Separate RCU/WCU required** (independent partitions)
- **Add/delete anytime**
- **Projection setting** (KEYS_ONLY, INCLUDE, ALL)

| Characteristic | LSI | GSI |
|------|-----|-----|
| Partition key | Same as base table | Different attribute possible |
| Sort key | Different attribute | Different attribute |
| Storage location | Inside base partition | Separate partitions |
| Creation time | Only at table creation | Anytime |
| Consistency | Supports Strongly Consistent | Eventually Consistent only |
| Capacity | Shared with base table | Separate setting |
| Max count | 5 | 20 |
| Item collection limit | 10GB (by PK) | N/A |

> 🔍 **Going deeper**: GSI's async replication delay is typically milliseconds, but under high write load or low GSI WCU, can extend to several seconds. Especially if GSI WCU is lower than base table WCU, GSI cannot keep up with writes and delay increases. In severe cases, base table writes themselves throttle — this is why "GSI WCU ≥ base table WCU" must be maintained.

## GSI Throttling — The Most Frequent DynamoDB Trap

Cascading problems when GSI WCU is lower than base table WCU:

```
[Scenario]
Base table WCU: 1,000
GSI WCU: 100 (too low)

Base table write speed: 800 WCU/s
  → Base table: Normal (800 < 1000)
  → GSI replication: Needs 800 WCU but only 100 possible
  → GSI throttling occurs
  → Cascading effect: Base table writes also throttle!

Solution:
1. Set GSI WCU equal to base table
2. Switch to on-demand mode (auto-scaling)
3. Remove unnecessary GSI
```

When switching table to on-demand mode, GSI automatically becomes on-demand too, solving the WCU mismatch problem. In provisioning mode, GSI WCU must always be kept ≥ base table WCU.

> ⚠️ **Trap**: Many developers set base table WCU sufficiently but GSI WCU to about half of base table. This is often the cause of "randomly occurring" throttling.

## GSI Projection — What Attributes to Store in the Index

When creating a GSI, decide which base table attributes to include in the index (Projection).

| Projection type | Stored in index | Storage cost | Extra query needed |
|---------------|-------------|------------|-------------|
| KEYS_ONLY | Base table PK + GSI PK/SK only | Lowest | GetItem needed if all attributes required |
| INCLUDE | Specified attributes + keys | Medium | GetItem needed for unspecified attributes |
| ALL | All attributes | Highest | No extra query needed |

Real-world pattern: Create GSI with KEYS_ONLY, collect base keys from GSI query results, then use BatchGetItem to fetch needed attributes all at once. GSI storage cost is minimized, and BatchGetItem can fetch up to 100 at once — efficient.

```python
# KEYS_ONLY GSI pattern
def get_pending_orders(status: str) -> list:
    # 1. Query GSI (returns keys only)
    gsi_result = table.query(
        IndexName='StatusIndex',
        KeyConditionExpression=Key('status').eq(status)
    )
    
    # 2. Collect base keys
    keys = [{'PK': {'S': item['PK']}, 'SK': {'S': item['SK']}} 
            for item in gsi_result['Items']]
    
    # 3. Fetch full attributes with BatchGetItem
    response = dynamodb.batch_get_item(
        RequestItems={
            'OrdersTable': {
                'Keys': keys,
                'ProjectionExpression': 'orderId, userId, total, createdAt'
            }
        }
    )
    return response['Responses']['OrdersTable']
```

## Single-Table Design — DynamoDB's Standard Pattern

In relational databases, developers typically create separate tables per entity — Users, Orders, Products. Applying this pattern to DynamoDB causes performance problems.

For example, showing "specific user's last 10 orders and profile" on one screen:
- Multi-table approach: GetItem(Users) + Query(Orders) = 2 network roundtrips
- Single-table approach: Query(single table) = 1 network roundtrip

What DynamoDB's Werner Vogels team and Rick Houlihan established over years is Single-Table Design.

```
[Single-Table Design Example: E-commerce]

Table name: ECommerceTable

PK            | SK              | Attributes
--------------|-----------------|---------------------------------
USER#U001     | PROFILE         | name, email, phone, createdAt
USER#U001     | ORDER#2026-01#O001 | orderId, total, status, items
USER#U001     | ORDER#2026-02#O002 | orderId, total, status, items
USER#U001     | REVIEW#P001     | rating, text, createdAt
PRODUCT#P001  | DETAIL          | name, price, category, stock
PRODUCT#P001  | REVIEW#U001     | rating, text
PRODUCT#P001  | REVIEW#U002     | rating, text
ORDER#O001    | STATUS          | status, updatedAt

[Common query patterns]
1. User profile + order history:
   Query(PK=USER#U001) → returns profile, orders, reviews all

2. User's latest orders only:
   Query(PK=USER#U001, SK begins_with("ORDER#"), ScanIndexForward=false, Limit=10)

3. Specific order status:
   GetItem(PK=ORDER#O001, SK=STATUS)

4. Product reviews list:
   Query(PK=PRODUCT#P001, SK begins_with("REVIEW#"))
```

> 💡 **Related theory**: Single-Table Design is the opposite of RDBMS Normalization — it's a Denormalization strategy. Normalization reduces data duplication and increases consistency but requires JOINs. Denormalization allows data duplication but enables fast queries without JOINs. Since DynamoDB has no JOINs at all, denormalization is mandatory. This design philosophy is identical in Google's Bigtable paper (2006), summarized as "store data how you use it."

## Sparse Index — Conditional GSI Indexing

Sparse Index is an advanced pattern where only items with a specific attribute are included in the GSI.

```
User items:
  User#001: {isAdmin: true, email: "admin@example.com"}
  User#002: {email: "user@example.com"}  ← isAdmin attribute missing
  User#003: {isAdmin: true, email: "admin2@example.com"}

GSI PK = isAdmin

Items in GSI:
  isAdmin=true → User#001, User#003 (items without isAdmin are not in GSI)

"Get admins only" query:
  Query(GSI, PK=isAdmin, value=true) → Returns User#001, User#003 only
  → No need to scan millions of regular users
```

Practical use case: Index only unprocessed messages. Include only items without `processedAt` attribute in GSI → efficiently query unprocessed messages waiting for processing.

## Query vs Scan Cost Difference Math

The cost difference between Query and Scan becomes intuitive with actual numbers.

```
[Scenario]
Table: 1 million items, average 1KB each
Total table size: ~1GB

10,000 items match userId=U001 by partition key

Scan execution:
  Read all 1 million items = ceil(1,000,000 × 1KB / 4KB) × 0.5 RCU
  = 250,000 × 0.5 = 125,000 RCU consumed

Query execution (userId=U001):
  Read only 10,000 items = ceil(10,000 × 1KB / 4KB) × 0.5 RCU  
  = 2,500 × 0.5 = 1,250 RCU consumed

Cost difference: 125,000 / 1,250 = 100× difference!

FilterExpression trap:
  Query(userId=U001) + FilterExpression(status=COMPLETED)
  Reads 10,000, filters to 8,000 → Consumes 1,250 RCU (filter irrelevant)
```

> 📚 **Case study**: In 2021, a Korean fintech startup's first DynamoDB bill after migration was 50× expected. Root cause analysis showed Lambda was running Scan every minute to find unprocessed transactions. After switching to Query + GSI pattern, RCU consumption dropped to 1/50 and costs normalized. Scan is not "never use" but "use only when there's a clear reason like table migration or data backup."

## Query Pagination Handling

DynamoDB's Query returns maximum 1MB of data at once. If results exceed 1MB, `LastEvaluatedKey` is returned; to request the next page, pass this key as `ExclusiveStartKey`.

```python
def query_all_orders(user_id: str) -> list:
    all_items = []
    last_evaluated_key = None
    
    while True:
        kwargs = {
            'KeyConditionExpression': Key('userId').eq(user_id)
        }
        if last_evaluated_key:
            kwargs['ExclusiveStartKey'] = last_evaluated_key
        
        response = table.query(**kwargs)
        all_items.extend(response['Items'])
        
        last_evaluated_key = response.get('LastEvaluatedKey')
        if not last_evaluated_key:
            break  # Last page
    
    return all_items
```

Ignoring pagination and processing only the first page causes data loss. This mistake frequently occurs in Lambda functions querying DynamoDB.

## Parallel Scan — Large-Scale Data Migration

Scan should generally be avoided, but for data migration or full table processing, **Parallel Scan** can boost performance.

```python
import threading

def scan_segment(table, segment: int, total_segments: int, results: list):
    """Scan each segment in separate thread"""
    response = table.scan(
        Segment=segment,
        TotalSegments=total_segments
    )
    results.extend(response['Items'])

def parallel_scan(table, num_threads: int = 10) -> list:
    results = []
    threads = []
    
    for i in range(num_threads):
        t = threading.Thread(
            target=scan_segment,
            args=(table, i, num_threads, results)
        )
        threads.append(t)
        t.start()
    
    for t in threads:
        t.join()
    
    return results
```

In Parallel Scan, segment count is typically set ≤ table partition count. Too many segments create overhead.

The mathematics of partition key cardinality, internal differences between LSI/GSI, and Single-Table Design pattern are the core of "properly" using DynamoDB. Next day we explore the mathematics of calculating read/write capacity units and internal workings of DynamoDB Streams.

## 📝 연습 문제

**문제 1.** LSI를 사용해야 하는 상황과 GSI를 사용해야 하는 상황을 구분하는 기준은?

A) 데이터 양이 많으면 LSI, 적으면 GSI
B) 기본 테이블과 동일한 파티션 키를 사용하고 테이블 생성 시 설계가 확정됐으면 LSI, 다른 파티션 키가 필요하거나 나중에 추가 필요하면 GSI
C) 읽기 위주는 LSI, 쓰기 위주는 GSI
D) 비용이 중요하면 LSI, 성능이 중요하면 GSI

**정답: B**
해설: LSI는 기본 테이블과 동일한 파티션 키를 사용하면서 정렬 키만 변경하는 인덱스다. 테이블 생성 시에만 정의할 수 있으며 이후 변경/삭제가 불가능하다. 강력한 일관성을 지원하고 기본 테이블 용량을 공유한다. GSI는 기본 테이블과 다른 속성을 파티션 키로 사용할 수 있고 언제든 추가/삭제가 가능하다. 테이블 설계가 확정되지 않았거나 새로운 조회 패턴이 생길 때 GSI를 선택한다.

---

**문제 2.** 다음 중 GSI Projection ALL 대신 KEYS_ONLY를 선택해야 하는 상황은?

A) 항상 GSI 쿼리 결과만으로 모든 정보를 표시해야 할 때
B) GSI 스토리지 비용을 최소화하고, 추가 속성은 BatchGetItem으로 조회할 수 있는 경우
C) 강력한 일관성이 필요한 경우
D) GSI에 대한 쓰기 처리량이 높아야 하는 경우

**정답: B**
해설: KEYS_ONLY 프로젝션은 GSI에 기본 키와 인덱스 키만 저장해 스토리지 비용을 최소화한다. 단, GSI 쿼리로 키 목록을 얻은 후 전체 속성이 필요하면 BatchGetItem으로 추가 조회가 필요하다. 이 패턴은 GSI 스토리지 비용은 줄이지만 RCU는 두 번 소비하는 트레이드오프가 있다. 항상 전체 속성이 필요하고 추가 조회 비용을 피하고 싶다면 ALL을 사용한다.

---

**문제 3.** Single-Table Design을 사용하는 주된 이유는?

A) DynamoDB 테이블 수 제한(256개)을 피하기 위해
B) 한 번의 쿼리로 여러 엔티티 유형을 가져와 네트워크 왕복을 줄이기 위해
C) IAM 정책 관리를 단순화하기 위해
D) 자동 백업이 테이블당 한 개만 가능하기 때문

**정답: B**
해설: Single-Table Design의 핵심 이점은 한 번의 Query로 여러 관련 엔티티를 가져올 수 있다는 것이다. 예를 들어 사용자 프로필 + 최근 주문을 한 Query로 가져오면 1번의 네트워크 왕복이 필요하지만, 별도 테이블 방식이면 2번이 필요하다. 낮은 지연이 중요한 서버리스 아키텍처에서 네트워크 왕복 최소화가 성능에 큰 영향을 준다. DynamoDB 테이블 수 제한은 별도의 현실적 제약이지만 Single-Table Design의 주 목적은 아니다.

---

**문제 4.** GSI WCU를 기본 테이블 WCU의 절반으로 설정했더니 간헐적으로 ProvisionedThroughputExceededException이 발생한다. 원인은?

A) 기본 테이블 WCU 부족
B) GSI WCU 부족으로 GSI 복제가 지연되어 기본 테이블 쓰기까지 throttling
C) 읽기 요청 과다
D) 인터넷 연결 문제

**정답: B**
해설: GSI는 기본 테이블에 쓰기가 발생할 때마다 비동기적으로 업데이트된다. GSI WCU가 기본 테이블 쓰기 속도를 따라가지 못하면 GSI 쓰기가 throttling되고, 이 throttling이 기본 테이블 쓰기에도 영향을 미친다. 기본 테이블은 쓰기가 가능한 상태여도 GSI 복제를 위한 용량이 없으면 전체 쓰기가 거부될 수 있다. 해결책은 GSI WCU를 기본 테이블 WCU 이상으로 설정하거나 온디맨드 모드로 전환하는 것이다.

---

**문제 5.** DynamoDB 테이블에서 Query + FilterExpression을 사용해 100개의 항목만 반환받았는데 RCU 소비가 예상보다 훨씬 높다. 가장 가능성 높은 원인은?

A) FilterExpression이 비싼 연산이라서
B) 반환된 100개 이전에 FilterExpression으로 걸러진 항목들도 모두 RCU를 소비했기 때문
C) Query 자체에 기본 RCU 오버헤드가 있어서
D) Strongly Consistent Read 모드가 자동으로 활성화되어서

**정답: B**
해설: FilterExpression은 DynamoDB가 KeyConditionExpression 기준으로 데이터를 모두 읽은 후 클라이언트 측에서 필터링하는 것이다. DynamoDB는 KeyConditionExpression에 맞는 모든 항목을 읽은 후 FilterExpression을 적용한다. 읽은 항목이 10,000개이고 그 중 100개가 필터를 통과했다면, RCU는 100개가 아닌 10,000개 기준으로 소비된다. FilterExpression은 반환 데이터를 줄여 네트워크 비용을 절감하지만 RCU는 절감하지 못한다. RCU 절감을 원한다면 GSI를 설계해 KeyConditionExpression으로 필요한 항목만 읽어야 한다.

---

**문제 6.** 스타트업이 DynamoDB로 다음 접근 패턴이 있는 SNS 서비스를 구현한다: 1) 사용자별 게시글 목록(시간순), 2) 해시태그별 게시글 목록, 3) 특정 게시글의 좋아요 수. 가장 적합한 설계는?

A) 세 개의 별도 테이블(Posts, Tags, Likes)
B) PK=userId, SK=timestamp 테이블 + 해시태그 GSI + 좋아요 카운터 속성
C) 모든 데이터를 하나의 속성에 JSON으로 저장
D) PK=postId만 있는 단순 테이블

**정답: B**
해설: Single-Table Design 또는 핵심 테이블 + 인덱스 패턴이다. 기본 테이블은 PK=userId, SK=timestamp로 "사용자별 게시글 시간순" 조회를 지원한다. 해시태그 검색을 위한 GSI를 별도로 설계(PK=hashtag, SK=timestamp)하거나 hashtag 테이블을 분리한다. 좋아요 수는 Atomic Counter(ADD likesCount :1)로 항목의 속성으로 관리한다. 세 개 별도 테이블(A)은 여러 패턴을 조합할 때 여러 번의 네트워크 왕복이 필요하다.

---

**문제 7.** DynamoDB의 Query 작업에서 LastEvaluatedKey가 반환됐을 때의 올바른 처리 방법은?

A) 첫 번째 페이지만 처리하고 LastEvaluatedKey는 무시해도 된다
B) LastEvaluatedKey를 ExclusiveStartKey로 설정해 다음 Query를 실행하고, LastEvaluatedKey가 없을 때까지 반복한다
C) LastEvaluatedKey를 Limit 파라미터로 사용한다
D) LastEvaluatedKey가 반환되면 오류가 발생한 것이다

**정답: B**
해설: DynamoDB Query는 한 번에 최대 1MB의 데이터를 반환한다. 결과가 1MB를 초과하거나 Limit 파라미터에 도달하면 LastEvaluatedKey가 반환된다. 이 키를 다음 Query의 ExclusiveStartKey로 전달하면 중단된 지점부터 계속 조회할 수 있다. LastEvaluatedKey가 없으면 마지막 페이지다. 페이지네이션을 처리하지 않으면 전체 데이터의 일부만 처리하는 버그가 발생한다 — 특히 Lambda 함수에서 자주 발생하는 실수다.

---
