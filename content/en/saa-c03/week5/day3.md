# Day 3 - DynamoDB: What It Means to Design in a Schema-less World

When we design a table in a relational database, we think about normalization. We aim for 3NF (Third Normal Form), join relationships with foreign keys, and combine data with JOINs. DynamoDB overturns all of these assumptions. There are no JOINs. Transactions are limited. The schema isn't fixed. In exchange, it guarantees single-digit millisecond response times across hundreds of millions of items.

Amazon built an internal system called Dynamo in 2004, to store shopping cart data. Not a single request could be lost at peak traffic. That work was published as the paper "Dynamo: Amazon's Highly Available Key-Value Store" at SOSP (Symposium on Operating Systems Principles) in 2007, and it became the design basis for countless NoSQL systems like Cassandra, Riak, and Voldemort. It was released under the name DynamoDB in 2012, and has become the core infrastructure that shatters Amazon.com's Prime Day sales records every year.

## Partitioning — Everything About DynamoDB Performance

The secret to DynamoDB's single-digit ms responses is partitioning. All data is distributed across partitions based on the Partition Key (formerly the Hash Key). Internally, DynamoDB applies a hash function to the partition key, and the resulting value decides which physical storage node the data is stored on.

```
Partition key → MD5/SHA-family hash → [0, 2^128) space
                                      │
         ┌────────────────────────────┤
         │                           │
    Partition 0            Partition 1            Partition 2
   (hash 0 ~ 33%)         (33% ~ 66%)           (66% ~ 100%)
   PK: "user_1"          PK: "user_2"           PK: "user_3"
   PK: "user_9"          PK: "user_5"           PK: "user_7"
```

In this structure, a single-item lookup (GetItem) computes the hash function once to find the partition directly, so it's O(1) with consistently guaranteed latency. The problem arises when the partition key choice is poor.

**The Hot Partition problem**: If the partition key is the current date (`"2025-05-26"`), all writes pile onto today's date partition. The limit of a single partition is 10GB / 3000 RCU / 1000 WCU. No matter how large you set the total table capacity, if a single partition receives more than 1000 WCU per second, throttling occurs — even if the overall WCU is plentiful.

Characteristics of a good partition key:
- **High cardinality** — many distinct values so data spreads evenly (userId, orderId, deviceId)
- **Even distribution** — access isn't concentrated on specific values
- **Matches frequent lookup patterns** — you can find the desired data with a single GetItem

Examples of bad partition keys:
- status (`"ACTIVE"`, `"INACTIVE"` — only 2 values)
- date (`"2025-05-26"` — writes concentrate on today's date)
- boolean (`true`/`false`)

> 💡 **Related theory: Consistent Hashing and the Dynamo paper** — DynamoDB's partitioning is based on the Consistent Hashing algorithm. Consistent Hashing was proposed in Karger et al.'s 1997 paper "Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web" (STOC 1997). Unlike ordinary hashing, it minimizes data rebalancing when nodes are added/removed — when going from N to N+1 nodes, only about 1/N of the total keys move. In contrast, an ordinary hash table has to rebalance almost all keys. This is the foundation that lets DynamoDB redistribute data without service interruption even as it adds storage nodes. The 2007 Amazon Dynamo paper (DeCandia et al.) explains that Consistent Hashing + Virtual Nodes (each physical node handling several virtual nodes) achieved even more even distribution.

> ⚠️ **The limits of Adaptive Capacity** — "Adaptive Capacity" mitigates the Hot Partition problem but does not solve it. Adaptive Capacity is a feature that automatically allocates more capacity to popular partitions, but it cannot handle workloads that exceed a single partition's physical limits (10GB, 1000 WCU/sec). If the partition key design is fundamentally wrong, Adaptive Capacity can't fix it either. The only fundamental solution to Hot Partitions is redesigning the partition key to be High-Cardinality + evenly distributed.

> 🔍 **The Write Sharding technique** — When writes unavoidably concentrate on a specific value (e.g., the inventory table of a popular product), use Write Sharding. Append a random suffix to the partition key (`productId#1`, `productId#2`, ..., `productId#N`) to spread across N partitions, then on reads, read all N partitions and aggregate. Write performance is N×, and read cost is also N×. If there's no aggregation workload, it's a reasonable trade-off.

## WCU and RCU — How to Calculate Capacity

DynamoDB's cost and performance are measured in WCU (Write Capacity Unit) and RCU (Read Capacity Unit). You must understand these units precisely to do capacity planning and cost estimation.

**WCU (Write Capacity Unit)**:
- 1 WCU = writing an item of up to 1KB once per second
- Writing a 2KB item = 2 WCU
- Writing an item under 1KB = 1 WCU (rounded up)
- Transactional write = 2 WCU (relative to the same data size)

**RCU (Read Capacity Unit)**:
- 1 RCU = one **strongly consistent read** per second of an item up to 4KB
- 1 RCU = **two eventually consistent reads** per second of an item up to 4KB (half the cost)
- Over 4KB rounds up: a 6KB item = 2 RCU (strongly consistent)
- Transactional read = 2 RCU (relative to the same data size)

| Operation | Item Size | Consumed Capacity |
|-----------|-----------|-------------------|
| PutItem (strongly consistent) | 1.5KB | 2 WCU |
| PutItem (strongly consistent) | 4KB | 4 WCU |
| TransactWriteItems | 2KB | 4 WCU (2×) |
| GetItem (strongly consistent) | 3KB | 1 RCU |
| GetItem (eventually consistent) | 4KB | 0.5 RCU |
| GetItem (strongly consistent) | 5KB | 2 RCU |
| TransactGetItems | 4KB | 2 RCU (2×) |

Calculation examples:
- Daily average of 1 million orders, each order item 2.5KB → per second on average, 1M/86400 ≈ 12 per second; if peak is 5× the average, 60 per second. Since each item is 2.5KB, that's 3 WCU per item (rounded up) → peak WCU = 60 × 3 = 180 WCU
- Reads at 1000 per second, each 4KB, eventually consistent → 1000 × (4/4) × (1/2) = 500 RCU

> 💡 **The internal behavior of On-Demand mode** — On-Demand mode doesn't preset RCU/WCU; it bills based on actual usage. Internally, DynamoDB sets an "automatic maximum" up to 2× the table's historical peak traffic. If you exceed this limit, DynamoDB accepts it initially but may gradually throttle if it persists. In On-Demand, a sudden tens-of-times traffic surge can cause throttling for the first several minutes. With Provisioned + Auto Scaling, the Auto Scaling policy helps smooth things out, but the scaling itself takes several minutes. If a new table is about to experience a traffic spike, it's safe to first set a high Provisioned capacity, then switch to On-Demand, since the "automatic maximum" will be set high.

> 🔍 **Why transaction cost is 2×** — DynamoDB transactions (TransactWriteItems/TransactGetItems) internally use a 2-Phase Commit (2PC)-like protocol. The first phase performs locking/reservation on all items, and the second phase performs the actual commit. Because these two phases each consume capacity, 2× the WCU/RCU is consumed compared to a single operation of the same data size. A transaction can handle up to 25 items and 4MB at once.

## LSI and GSI — The Difference Between the Two Secondary Indexes

Querying only by DynamoDB's primary key has limits. To also query efficiently by other attributes, you need secondary indexes. DynamoDB provides two kinds.

**LSI (Local Secondary Index)**:
- Same partition key as the base table, different sort key
- Example: if the primary key is `userId` (partition) + `orderId` (sort), an LSI could be `userId` (partition) + `orderDate` (sort)
- Can only be added at table creation time (cannot be added later)
- Because the partition key is the same, it indexes only data within that partition → **strongly consistent reads are possible**
- Shares the 10GB-per-partition limit with the table
- Up to 5 per table

**GSI (Global Secondary Index)**:
- Can be defined with a completely different partition key and sort key
- Can be added or removed at any time
- Independent partition space → requires separate WCU/RCU capacity settings
- Replication from the base table to the GSI is asynchronous → **only eventual consistency is possible**
- Cost: the GSI's WCU/RCU are billed separately from the base table
- Up to 20 per table

```
[Base table] PK: userId, SK: orderId
┌──────────┬─────────┬───────────┬──────────┐
│ userId   │ orderId │ orderDate │ status   │
├──────────┼─────────┼───────────┼──────────┤
│ user_1   │ ord_001 │ 2025-05-01│ SHIPPED  │
│ user_1   │ ord_002 │ 2025-05-10│ PENDING  │
│ user_2   │ ord_003 │ 2025-05-08│ SHIPPED  │
└──────────┴─────────┴───────────┴──────────┘

[LSI] PK: userId (same), SK: orderDate (new)
→ can query "user_1's orders in date order"
→ strongly consistent reads possible (within the same partition)

[GSI] PK: status (new), SK: orderDate (new)
→ can query "SHIPPED orders in date order"
→ only eventual consistency (asynchronous replication)
```

| Aspect | LSI | GSI |
|--------|-----|-----|
| Partition key | Same as base table | Independent (new PK possible) |
| When it can be added | Only at table creation | Any time |
| Consistency | Strong consistency possible | Eventual consistency only |
| Capacity | Shared with the table | Independent capacity |
| Max count | 5 | 20 |
| 10GB-per-partition limit | Shared with the table | Separate |

> ⚠️ **The trap of requesting strong consistency on a GSI** — If you request `ConsistentRead=true` on a GSI, the API call succeeds but internally it's processed as eventual consistency. It doesn't error out — it just behaves as eventually consistent. Not knowing this, you run into the bug "I set strong consistency on the GSI, so why isn't the latest data showing?" For lookups where freshness matters, you must query the base table directly or use an LSI.

> 💡 **The distributed-theory background of the LSI/GSI consistency difference** — The consistency difference between LSI and GSI relates to "Read-your-writes Consistency" in distributed systems. Because an LSI lives in the same partition as the table, writes and reads happen on the same storage node, so read-your-writes is guaranteed. In terms of the CAP theorem, an LSI provides CP (Consistency + Partition Tolerance) within a partition. A GSI delivers data to separate storage via asynchronous replication, so during the replication lag (usually a few milliseconds to seconds), the latest write may not be reflected in the GSI. This is a textbook example of Eventual Consistency.

> 🔍 **The GSI Sparse Index pattern** — If an item doesn't have the attribute set as the GSI's partition key or sort key, that item isn't included in the GSI. The "Sparse Index pattern" exploits this to index only items in a specific state. Example: include only items that have the `isActive` attribute in the GSI, to efficiently query just the active items. Because only a small subset of items — not the entire table — is searched through the GSI, RCU cost is reduced.

## DynamoDB Streams — A Real-Time Pipeline of Change Events

DynamoDB Streams captures all data changes on a table (INSERT, MODIFY, REMOVE) as a time-ordered stream. The stream is retained for 24 hours. Unlike Kinesis Data Streams, DynamoDB Streams is sharded based on the partition key, so item ordering is guaranteed.

Key properties of Streams:
- **Sharded structure**: Streams itself is also sharded based on the partition key. Changes to the same partition key always enter the same shard in order → the change order for the same item is guaranteed.
- **Lambda trigger**: Lambda polls the Streams shards and processes them in batches. Event Source Mapping.
- **StreamViewType options**:
  - `KEYS_ONLY`: only the keys of the changed item (cheapest)
  - `NEW_IMAGE`: a complete copy of the item after the change
  - `OLD_IMAGE`: a complete copy of the item before the change
  - `NEW_AND_OLD_IMAGES`: both before and after (most commonly used, enables diffing the changes)

A real-world usage pattern:
```
DynamoDB (orders table)
       │ new order INSERT
       │
       ▼
DynamoDB Streams
       │
       ▼
Lambda (event source mapping)
       ├─── index order data into OpenSearch (search capability)
       ├─── send order notifications via SNS
       ├─── update aggregate data in another DynamoDB table
       └─── Kinesis Data Firehose → S3 (data lake)
```

> 💡 **The Event Sourcing architectural pattern** — DynamoDB Streams becomes a natural foundation for the Event Sourcing pattern. Event Sourcing, a pattern defined by Martin Fowler, stores the sequence of events that produced a state instead of storing the state directly. The DynamoDB table stores the current state, and Streams acts as an immutable log of all change events. Lambda ESM (Event Source Mapping) consumes these events to maintain read-only projections (ElastiCache, OpenSearch, aggregate tables). Combined with CQRS (Command Query Responsibility Segregation), proposed by Greg Young, you can achieve high scalability and an audit trail at the same time.

> 📚 **The Amazon Prime Day case** — During Amazon Prime Day 2021, AWS announced that DynamoDB handled over 89 million requests per second. Among these, real-time inventory updates, order-status notifications, and fraud-detection event processing were done through DynamoDB Streams and Lambda. Because the Streams shard structure guarantees event ordering for the same item, an inventory-decrement event was always guaranteed to be processed after an increment event. This is a key guarantee that prevents the bug of inventory going negative.

## Global Tables — Multi-Region Active-Active

DynamoDB Global Tables operate the same table across multiple AWS regions in a multi-active (Active-Active) manner. Each region's table handles both reads and writes.

Replication is done based on DynamoDB Streams. When a write occurs in one region, it's replicated to the other regions through Streams. Replication lag is typically under 1 second.

Conflict resolution: if two regions modify the same item differently at the same time, a conflict occurs. DynamoDB resolves it with a "Last-Writer-Wins (LWW)" policy. The write with the more recent timestamp wins.

| Aspect | DynamoDB Global Tables | Aurora Global Database |
|--------|------------------------|------------------------|
| Model | NoSQL (Key-Value) | Relational (MySQL/PostgreSQL-compatible) |
| Multi-region writes | Active-active (writes in all regions) | Active-passive (writes only in Primary) |
| Replication method | Streams-based async | Storage-layer async |
| Replication lag | ~1 second | < 1 second |
| Conflict resolution | LWW (automatic) | None (single Writer) |
| Failover | Automatic (other region already active) | Manual promote |
| RPO | ~1 second | < 1 second |
| RTO | ~0 (other region already serving) | Minutes (after promote) |

> 🔍 **The limits of LWW conflict resolution and how to handle them** — DynamoDB Global Tables' LWW conflict resolution is simple but has limits. In a financial transaction, if "two concurrent writes that decrement an account balance" occur in two regions, LWW may treat only one decrement as valid and overwrite the other. To solve this: (1) implement optimistic locking with Conditional Write + a version attribute — use `ConditionExpression: version = :expected_version` to raise a ConditionalCheckFailedException on version mismatch and retry, or (2) operate financial data in an Active-Passive pattern that allows writes only in a specific region. Use Global Tables but restrict writes to one region and operate the others read-only.

> ⚠️ **Global Tables activation requirements** — To enable DynamoDB Global Tables, the table must have DynamoDB Streams (`NEW_AND_OLD_IMAGES`) enabled. Also, the TTL (Time-To-Live) attribute name must be identical across all regions. Since the Global Tables 2019 version (Version 2019.11.21), you can enable Global Tables even on a table that already has data.

## DAX — The World of Microseconds

DynamoDB Accelerator (DAX) is an in-memory cache cluster that sits in front of DynamoDB. It pulls DynamoDB's millisecond responses down to microseconds.

Characteristics of DAX:
- **Transparent caching**: The application uses the DAX SDK instead of the DynamoDB SDK. The API is identical to DynamoDB, so code changes are minimized.
- **Item Cache**: Caches GetItem, BatchGetItem results.
- **Query Cache**: Caches Query, Scan results based on query parameters.
- **Write-Through**: Writing to DAX writes synchronously to DynamoDB too. Guarantees consistency between cache and DB.
- **Deployed within a VPC**: A DAX cluster can only be deployed inside a VPC. Direct access from the internet is not possible.
- **Cluster mode**: A Primary node + up to 10 Read Replica nodes. Automatic failover.

When DAX is suitable and when it isn't:

| Suitable | Not Suitable |
|----------|--------------|
| Read-heavy with the same items looked up repeatedly | When strongly consistent reads are absolutely required |
| When sub-millisecond response time is needed | Write-heavy workloads with few reads |
| Hot items (the same item looked up repeatedly) | Scan-oriented analytics workloads |
| Game leaderboards, social counters | Lambda functions (VPC configuration complexity) |

> 💡 **The Write-Through cache strategy and cache invalidation** — DAX's cache strategy is Write-Through. At write time, it synchronously updates both the cache (DAX) and the database (DynamoDB). This strategy minimizes cache-DB inconsistency, but write latency may increase slightly compared to no caching. In contrast, Cache-Aside (Lazy Loading) is a strategy that reads from the DB and stores in the cache only when a cache miss occurs at read time, and it isn't natively supported in DAX. Phil Karlton's famous line, "There are only two hard things in Computer Science: cache invalidation and naming things" — DAX's Write-Through is designed to handle this problem automatically. That said, items past the TTL (default 5 minutes) will incur a cache miss on the next read.

> 📚 **The Duolingo DAX adoption case** — In 2019, Duolingo (the language-learning app) switched its user streak (consecutive study days) counters and leaderboard data from DynamoDB to caching with DAX. This data, read tens of billions of times daily by tens of millions of users, was astronomically expensive in RCU cost with DynamoDB alone. After adopting DAX, actual reads against DynamoDB dropped by over 95%, and read latency fell from milliseconds to microseconds. Leaderboard page load speed became noticeably faster, and costs were cut by over 80%.

## PITR and Backup — DynamoDB's Recovery Options

**PITR (Point-In-Time Recovery)**: Recovery to the second within the last 35 days. Restores to a new table separate from the existing one. Enabling it incurs additional cost, but it's strongly recommended for operational stability.

**On-demand backup**: A full table snapshot created manually. Retained permanently (until deleted). Integrates with the AWS Backup service for automatic schedule management. Can be copied to another region. On recovery, restores to a new table in the same or another region.

**S3 Export**: Exports DynamoDB table data to S3. Analyzable with Athena, EMR, and Glue. Available only on tables with PITR enabled. Runs without affecting table performance.

**S3 Import**: Imports data from S3 into DynamoDB. Supports CSV, DynamoDB JSON, and Ion formats. Can only import into a new table.

A recovery caveat: whatever the recovery method, a new table is created. It does not overwrite the existing table. After recovery, you need additional work to update the application's table reference or to swap in the existing table name.

Comparing with other clouds:

| Aspect | DynamoDB | GCP Firestore/Bigtable | Azure Cosmos DB |
|--------|----------|------------------------|-----------------|
| Model | Key-Value + Document | Document / Wide-Column | Multi-model (Document, Graph, Key-Value, Column, SQL) |
| Serverless | O (On-Demand) | O (Firestore) | O (Serverless) |
| Global multi-active | Global Tables (LWW) | Firestore multi-region | Cosmos DB multi-master |
| Consistency model | Eventual/strong choice | Eventual (Firestore: Strong) | 5 levels (Strong ~ Eventual) |
| Secondary index | LSI/GSI | Composite Index | Partial/Spatial/Composite |
| TTL | O | O | O (Time to Live) |
| Transactions | O (25-item limit) | O | O |
| In-memory cache | DAX | Memorystore | Azure Cache for Redis |

> 📚 **Lyft's Cassandra → DynamoDB migration** — In 2022, Lyft shared its experience of switching from Cassandra to DynamoDB. The main reasons were reduced operational burden and multi-region HA through Global Tables. The biggest challenge during migration was redesigning the partition key — a key strategy that distributed well in Cassandra created a Hot Partition in DynamoDB, so they had to redesign from scratch. Also, code that relied on Cassandra's tunable consistency (QUORUM, LOCAL_QUORUM, etc.) had to be replaced with DynamoDB's binary consistency (strong/eventual). This case teaches the lesson that "a NoSQL migration is not data movement but model redesign."

## Hands-On DynamoDB Core Operations via the CLI

```bash
# Create a table (Composite Key: userId + orderId, LSI, Streams enabled)
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

# Add a GSI (possible while live — applies retroactively to existing data, auto backfill)
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

# Enable PITR
aws dynamodb update-continuous-backups \
  --table-name Orders \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true

# Conditional write (optimistic locking — prevent duplicate inserts)
aws dynamodb put-item \
  --table-name Orders \
  --item '{"userId":{"S":"user_1"},"orderId":{"S":"ord_001"},"orderDate":{"S":"2025-05-26"},"status":{"S":"PENDING"},"amount":{"N":"29900"}}' \
  --condition-expression "attribute_not_exists(orderId)"

# LSI query (strong consistency — possible on an LSI)
aws dynamodb query \
  --table-name Orders \
  --index-name userId-orderDate-index \
  --key-condition-expression "userId = :uid AND orderDate BETWEEN :start AND :end" \
  --expression-attribute-values '{":uid":{"S":"user_1"},":start":{"S":"2025-05-01"},":end":{"S":"2025-05-31"}}' \
  --consistent-read

# GSI query (only eventual consistency — no consistent-read option)
aws dynamodb query \
  --table-name Orders \
  --index-name status-orderDate-index \
  --key-condition-expression "#s = :status AND orderDate > :date" \
  --expression-attribute-names '{"#s":"status"}' \
  --expression-attribute-values '{":status":{"S":"SHIPPED"},":date":{"S":"2025-05-01"}}'

# Enable an additional Global Tables region (Streams must already be enabled)
aws dynamodb update-table \
  --table-name Orders \
  --replica-updates '[{"Create":{"RegionName":"us-east-1"}}]'

# Create a DAX cluster (within a VPC, requires a subnet group)
aws dax create-cluster \
  --cluster-name orders-dax \
  --node-type dax.r5.large \
  --replication-factor 3 \
  --iam-role-arn arn:aws:iam::123456789012:role/DAXRole \
  --subnet-group-name my-dax-subnet-group

# Monitor Hot Partition (CloudWatch)
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedWriteCapacityUnits \
  --dimensions Name=TableName,Value=Orders \
  --start-time 2025-05-26T00:00:00Z \
  --end-time 2025-05-26T23:59:59Z \
  --period 300 \
  --statistics Sum
```

## Wrapping Up

In DynamoDB, partition key design is everything. A bad partition key creates a Hot Partition, and a Hot Partition can't be solved no matter how much you spend. Choosing an evenly distributed, High-Cardinality key is the starting point of DynamoDB design.

A GSI responds flexibly to new access patterns but only allows eventual consistency. An LSI allows strong consistency but has the constraint that it can only be added at table creation time. Understanding the trade-offs of the two indexes and designing your access patterns in advance is the key.

DynamoDB Streams is a core tool for wiring change events into a real-time pipeline. Combined with the Event Sourcing and CQRS patterns, you can achieve read scalability and an audit trail at the same time. DAX delivers microsecond responses and dramatically reduced cost for read-intensive workloads.

Tomorrow we dig deep into DAX in more detail — and the difference between it and ElastiCache Redis, the general-purpose in-memory cache that makes DynamoDB even faster.

---

## 📝 연습 문제

**문제 1.** What is the most important criterion when choosing a DynamoDB table's partition key?

A) The shorter the partition key value's length, the better
B) The partition key must be a numeric type
C) The partition key value should be varied (High Cardinality) and evenly distributed
D) The partition key should be updated frequently

**정답: C**

해설: To prevent Hot Partitions, data must spread evenly across many partitions. For that, the partition key must have high cardinality (many distinct values) and requests must be evenly distributed. Keys that are varied and close to random — like userId, orderId, deviceId — are ideal. Length, type, and update frequency are not directly related to performance. Traps like "what if you use a date as the partition key?" come up often on the exam — a date has high cardinality but has the skew problem of writes concentrating on today's date.

---

**문제 2.** Which statement about a DynamoDB GSI (Global Secondary Index) is correct?

A) It can only be added at table creation time
B) It must have the same partition key as the base table
C) It supports strongly consistent reads
D) It can be defined with a completely different partition key and sort key, can be added at any time, and supports only eventual consistency

**정답: D**

해설: A GSI can be defined with keys completely independent of the base table's key, and it can be added or removed at any time while the table is running. However, because data is replicated asynchronously from the base table to the GSI, it supports only eventual consistency. A and B are characteristics of an LSI. As for C, even if you request ConsistentRead=true on a GSI, it's actually processed as eventual consistency.

---

**문제 3.** What operation can 1 RCU handle?

A) One strongly consistent read of an 8KB item
B) One strongly consistent read of a 4KB item
C) One eventually consistent read of a 4KB item
D) Two strongly consistent reads of a 2KB item

**정답: B**

해설: 1 RCU = one strongly consistent read of an item up to 4KB. Or two eventually consistent reads of a 4KB item. A is 8KB, so it needs 2 RCU. C — one eventually consistent read of 4KB is 0.5 RCU (= 1 RCU can handle 2). D — a strongly consistent read of a 2KB item is 1 RCU per read (rounded up), so 2 reads need 2 RCU.

---

**문제 4.** You connect DynamoDB Streams to Lambda to process order events. For multiple change events to the same order item (same partition key), is correct-order processing in Lambda guaranteed?

A) Not guaranteed. DynamoDB Streams doesn't guarantee order
B) Guaranteed. Events for the same partition key always enter the same shard in order
C) Not guaranteed. Lambda processes events in parallel
D) Guaranteed. Lambda processes all events in order on a single thread

**정답: B**

해설: DynamoDB Streams is sharded based on the partition key. Change events for items with the same partition key are always recorded in the same shard in order. Lambda processes a batch with one execution context per shard, so events for the same partition key are order-guaranteed. However, events for different partition keys go into different shards, so their relative order is not guaranteed.

---

**문제 5.** What is the main criterion for deciding between DynamoDB On-Demand mode and Provisioned + Auto Scaling mode?

A) Data size — the larger the data, the more On-Demand favors you
B) Traffic predictability — On-Demand if unpredictable and irregular; Provisioned + AS if predictable and stable
C) Number of regions — only On-Demand is available for multi-region use
D) Whether GSIs are used — using a GSI means only On-Demand can be chosen

**정답: B**

해설: The key criterion is the predictability of the traffic pattern. On-Demand bills per request, so it automatically handles sudden traffic spikes, but it's more expensive than Provisioned + Auto Scaling for stable, predictable traffic. Provisioned + Auto Scaling bills based on the configured RCU/WCU, so it enables cost optimization for stable traffic, but has a scaling delay on sudden spikes. A, C, and D are all incorrect statements.

---

**문제 6.** On an e-commerce platform, you want to implement an event-driven architecture that automatically updates inventory and sends an email notification each time a new order is INSERTed into a DynamoDB orders table. What is the most suitable approach?

A) Call the inventory update and email send directly from the order Lambda function (synchronously)
B) Enable DynamoDB Streams and separate the follow-up processing with a Lambda event source mapping
C) Periodically run a Scan to detect and process new orders
D) Detect DynamoDB changes with CloudWatch Events

**정답: B**

해설: DynamoDB Streams + Lambda event source mapping is the standard pattern for event-driven architecture. The order Lambda function handles only saving the order, and the follow-up processing (inventory update, email send) is separated into a distinct Lambda via Streams. This pattern is favorable in terms of separation of concerns, automatic retries, and scalability. A tightly couples order processing and follow-up work, so if one fails, the whole thing fails. C is a polling approach with latency and duplicate-processing risk. D doesn't exist — there's no capability to directly detect DynamoDB changes via CloudWatch Events/EventBridge.

---

**문제 7.** In DynamoDB, the pattern "look up a user's (userId's) recent orders sorted by date (orderDate)" is frequent. The table primary key is (userId, orderId), and there's an orderDate attribute. To support this query efficiently:

A) Handle it with Scan + Filter Expression
B) Create a GSI with orderDate as the partition key
C) Create an LSI: partition key = userId, sort key = orderDate
D) Create a separate Orders-by-date table and save to both tables on every write

**정답: C**

해설: An LSI can be defined with the same partition key (userId) and a different sort key (orderDate). "A specific user's (userId's) orders in date order" is a perfect use case for an LSI. Strong consistency is also possible. However, an LSI can only be added at table creation time, so you must design it in advance. B — partitioning the entire table by orderDate causes write concentration on a specific date. A — a Scan reads the entire table, so it's inefficient. D has duplicate-storage and data-consistency problems.

---
