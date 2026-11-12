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

## 📝 Practice Questions

**Question 1.** What is the criterion for distinguishing when to use an LSI from when to use a GSI?

A) LSI if the data volume is large, GSI if it is small
B) LSI if it uses the same partition key as the base table and the design is finalized at table creation; GSI if a different partition key is needed or it must be added later
C) LSI for read-heavy workloads, GSI for write-heavy workloads
D) LSI if cost matters, GSI if performance matters

**Answer: B**
Explanation: An LSI is an index that uses the same partition key as the base table and changes only the sort key. It can be defined only at table creation and cannot be changed or deleted afterward. It supports strong consistency and shares the base table's capacity. A GSI can use an attribute different from the base table's as its partition key and can be added or deleted at any time. Choose a GSI when the table design is not finalized or a new query pattern arises.

---

**Question 2.** Which of the following is a situation in which you should choose KEYS_ONLY instead of GSI Projection ALL?

A) When all information must always be displayed from the GSI query result alone
B) When you want to minimize GSI storage cost and can fetch additional attributes with BatchGetItem
C) When strong consistency is required
D) When high write throughput to the GSI is required

**Answer: B**
Explanation: The KEYS_ONLY projection stores only the primary key and index keys in the GSI, minimizing storage cost. However, if you need all attributes after getting the list of keys from a GSI query, you must make an additional lookup with BatchGetItem. This pattern reduces GSI storage cost but has the trade-off of consuming RCUs twice. If you always need all attributes and want to avoid the additional lookup cost, use ALL.

---

**Question 3.** What is the main reason for using Single-Table Design?

A) To avoid the DynamoDB table count limit (256)
B) To fetch multiple entity types in a single query and reduce network round trips
C) To simplify IAM policy management
D) Because automatic backup is possible for only one table at a time

**Answer: B**
Explanation: The key benefit of Single-Table Design is that multiple related entities can be fetched with a single Query. For example, fetching a user profile plus recent orders in one Query takes 1 network round trip, whereas separate tables would take 2. In serverless architectures where low latency matters, minimizing network round trips greatly affects performance. The DynamoDB table count limit is a separate practical constraint, but it is not the main purpose of Single-Table Design.

---

**Question 4.** After setting the GSI WCU to half of the base table's WCU, ProvisionedThroughputExceededException occurs intermittently. What is the cause?

A) Insufficient base table WCU
B) Insufficient GSI WCU delays GSI replication, which throttles even writes to the base table
C) Excessive read requests
D) An internet connectivity problem

**Answer: B**
Explanation: A GSI is updated asynchronously each time a write occurs on the base table. If the GSI WCU cannot keep up with the base table's write rate, GSI writes are throttled, and this throttling also affects writes to the base table. Even if the base table is able to accept writes, the entire write can be rejected when there is no capacity for GSI replication. The solution is to set the GSI WCU to at least the base table's WCU or to switch to on-demand mode.

---

**Question 5.** You used Query + FilterExpression on a DynamoDB table and received only 100 items, but RCU consumption is much higher than expected. What is the most likely cause?

A) Because FilterExpression is an expensive operation
B) Because the items filtered out by FilterExpression before the 100 returned items also consumed RCUs
C) Because Query itself has a base RCU overhead
D) Because Strongly Consistent Read mode was automatically enabled

**Answer: B**
Explanation: FilterExpression is applied after DynamoDB has read all the data matching the KeyConditionExpression (the filtering happens afterward and does not reduce the read). DynamoDB reads all items that match the KeyConditionExpression and then applies the FilterExpression. If 10,000 items were read and 100 of them passed the filter, RCUs are consumed based on 10,000 items, not 100. FilterExpression reduces the returned data and thus network cost, but it does not reduce RCUs. To reduce RCUs, design a GSI so that only the needed items are read via the KeyConditionExpression.

---

**Question 6.** A startup implements a social networking service with DynamoDB that has the following access patterns: 1) a list of posts per user (chronological), 2) a list of posts per hashtag, 3) the like count of a specific post. What is the most suitable design?

A) Three separate tables (Posts, Tags, Likes)
B) A table with PK=userId, SK=timestamp + a hashtag GSI + a like counter attribute
C) Store all data as JSON in a single attribute
D) A simple table with only PK=postId

**Answer: B**
Explanation: This is Single-Table Design or the core table + index pattern. The base table with PK=userId, SK=timestamp supports the "posts per user in chronological order" lookup. For hashtag search, design a separate GSI (PK=hashtag, SK=timestamp) or split out a hashtag table. The like count is managed as an item attribute with an Atomic Counter (ADD likesCount :1). Three separate tables (A) require multiple network round trips when combining several patterns.

---

**Question 7.** What is the correct way to handle it when LastEvaluatedKey is returned from a DynamoDB Query operation?

A) You can process only the first page and ignore LastEvaluatedKey
B) Set LastEvaluatedKey as ExclusiveStartKey and run the next Query, repeating until there is no LastEvaluatedKey
C) Use LastEvaluatedKey as the Limit parameter
D) If LastEvaluatedKey is returned, an error has occurred

**Answer: B**
Explanation: A DynamoDB Query returns at most 1 MB of data at a time. If the result exceeds 1 MB or reaches the Limit parameter, LastEvaluatedKey is returned. Passing this key as the ExclusiveStartKey of the next Query lets you continue from where it stopped. If there is no LastEvaluatedKey, it is the last page. Failing to handle pagination causes a bug in which only part of the full data is processed — a mistake that is especially common in Lambda functions.

---
