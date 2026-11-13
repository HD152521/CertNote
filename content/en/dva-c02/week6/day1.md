# Day 1 - DynamoDB: The Philosophy of NoSQL and the Math of Partition Design

There are two things that shock developers the most when they learn DynamoDB for the first time after years with relational databases. First, there are no JOINs. Second, you have to decide how you will query the data first and only then design the table - the exact opposite order from an RDBMS. In this day we understand why Amazon built Dynamo, the predecessor of DynamoDB, in 2007, and how its core ideas, partitioning and the consistency model, work. Once you understand these principles, the DynamoDB questions on the DVA-C02 can be solved without memorization.

## Background of the Dynamo Paper - Amazon's Dilemma in 2007

In October 2007, Amazon's principal engineers presented a paper titled "Dynamo: Amazon's Highly Available Key-value Store" at the ACM SOSP conference. This paper became one of the most influential papers in the history of distributed systems.

Amazon's problem at the time was this. Relational DBs such as MySQL use locks for transactions, are hard to scale out, and in particular struggle to handle hundreds of thousands of TPS at peak traffic (Black Friday, Christmas). An analysis showed that most of Amazon's internal services needed only primary-key lookups and rarely needed complex JOINs. So what if you gave up JOINs and built storage optimized for horizontal scaling?

The Dynamo paper designed a Key-Value store that combined distributed systems concepts such as Consistent Hashing, Vector Clocks, the Gossip Protocol, and Eventual Consistency. This is the theoretical foundation of DynamoDB.

According to the CAP theorem, a distributed system can guarantee only two of Consistency, Availability, and Partition Tolerance. Amazon's Dynamo chose AP (availability + partition tolerance) and sacrificed consistency, adopting "eventual consistency." On top of this foundation, DynamoDB additionally offers Strong Consistency selectively.

## DynamoDB vs RDBMS - A Difference in Paradigm

| Concept | RDBMS | DynamoDB |
|------|-------|----------|
| Unit of storage | Row | Item |
| Unit of organization | Table, schema | Table, partition |
| Schema | Fixed (DDL required) | Flexible (free apart from the PK) |
| Query method | SQL, search on arbitrary columns | Efficient only by PK |
| Scaling method | Vertical scaling (a bigger server) | Horizontal scaling (add partitions) |
| Transactions | ACID by default | TransactWrite/Get (2x cost) |
| JOIN | Freely | None (application level) |
| Indexes | Created freely | Limited: LSI (5), GSI (20) |
| Scaling limit | TB level (single server) | PB level (automatic partitioning) |

An RDBMS first thinks about "how to store the data" and later pulls the data out with various queries. DynamoDB is the opposite - you first decide "how to query" and design the PK and indexes accordingly. This paradigm shift is the first gate in learning DynamoDB.

In key-value patterns (caching search results, storing per-user preferences), when RDBMS lock contention becomes the bottleneck, moving to DynamoDB is an option. On the other hand, complex queries such as search filters and sorting hit DynamoDB's limits, so a separate search engine like Elasticsearch is used alongside it. The point is to know DynamoDB's limits and use it in the right place.

## The Partitioning Mechanism - SHA-256 Hash and Partition Assignment

When DynamoDB receives a PK value, it internally computes a SHA-256 hash and uses the hash value to decide the partition where the data will be stored. The same PK value is always stored in the same partition.

```
Partition key → SHA-256 hash → partition determined in the hash space
                             → stored on that partition's node

Example:
"user001" → hash(user001) = 0x7a3f... → partition 5
"user002" → hash(user002) = 0x1b2c... → partition 2
"user003" → hash(user003) = 0x9d4a... → partition 5  (happens to be the same partition)
```

Capacity limits of a single partition:
- Storage: up to 10GB
- Throughput: up to 3,000 RCU + 1,000 WCU

When it exceeds 10GB or reaches the throughput limit, DynamoDB automatically splits the partition. This split is automatic but can take several minutes, and throttling can occur in the meantime.

DynamoDB's partitioning uses a variant of Consistent Hashing. The key property of consistent hashing is that the amount of data that must be relocated when a node (partition) is added or removed is minimized. A plain hash (`key % N`) has to relocate nearly all data when N changes, but consistent hashing moves only 1/N of the data. This is why DynamoDB can handle adding partitions smoothly even at PB scale.

## The Hot Partition Problem - The Price of a Bad PK Design

A common mistake in DynamoDB design is using a low-cardinality value as the partition key. Cardinality is the number of unique values.

```
Bad PK examples:
  status: "PENDING"/"COMPLETED"/"FAILED"     → only 3 partitions exist
  country: "KR"/"US"/"JP"                   → if requests pile onto a few countries, only those partitions run hot
  date: "2026-06-26"                         → all of today's writes concentrate on one partition
  boolean: true/false                         → only 2 partitions

Good PK examples:
  userId: UUID                               → millions of unique values
  orderId: UUID                              → millions of unique values
  deviceId: device serial number             → evenly distributed
```

Using a date as the PK is especially dangerous. If you use today's date ("2026-06-26") as the PK, all of today's writes concentrate on a single partition. When this partition exceeds the 1,000 WCU limit, `ProvisionedThroughputExceededException` occurs.

| Anti-pattern | Problem | Fix |
|---------|------|---------|
| PK = date | Today's writes concentrate on one partition | PK = `date#shardNumber` (for example, `2026-06-26#3`) |
| PK = status code | Only 3-5 partitions exist | PK = userId, GSI PK = status |
| PK = sequential ID | Sequential IDs can still skew even after hashing | PK = UUID |
| PK = category | Concentrates on popular categories | PK = `category#uuid` |

> ⚠️ **Pitfall**: Many test takers believe that "DynamoDB handles hot partitions automatically with Adaptive Capacity." Adaptive Capacity is a feature that redistributes spare capacity from other partitions to the hot partition. But this is only a temporary buffer. If you exceed the table's total WCU, even Adaptive Capacity does not help. The fundamental fix is always the PK design.

## The Full Set of DynamoDB Data Types

DynamoDB supports three categories of data types.

**Scalar types**: a single value
- `S` - String: `"hello"`, `"2026-06-26T00:00:00Z"` (dates are stored as ISO 8601 strings)
- `N` - Number: `42`, `3.14`, `1234567890123` (integers, decimals, and large numbers all)
- `B` - Binary: Base64-encoded binary data (image thumbnails, serialized data)
- `BOOL` - Boolean: `true`, `false`
- `NULL` - Null: `true` (explicitly expresses that there is no value)

**Set types**: a set of the same type without duplicates
- `SS` - String Set: `{"apple", "banana", "cherry"}`
- `NS` - Number Set: `{1, 2, 3, 4, 5}`
- `BS` - Binary Set: a set of binary values

**Document types**: nested structures
- `M` - Map: `{"key1": {"S": "value"}, "key2": {"N": "42"}}` - a nested JSON object
- `L` - List: `[{"S": "hello"}, {"N": "42"}, {"BOOL": true}]` - an array of mixed types

The maximum item size is **400KB**. The standard pattern is to store large data such as images and videos in S3 and store only the S3 URL or key in DynamoDB.

DynamoDB's Map (`M`) type is conceptually the same as JSON. In fact, DynamoDB's data model is JSON encoded in a binary format (internally a format similar to CBOR). If you run `aws dynamodb get-item --output json`, you can see that the response DynamoDB returns is JSON with type annotations included. There is no theoretical limit on the nesting depth of a Map type, but it must fit within the 400KB total item size.

## The Read Consistency Model - A Distributed Systems Trade-off

DynamoDB synchronously replicates data **across at least 3 AZs**. The response that a write has completed comes back when the write has succeeded on at least 2 of the 3 AZs (a quorum).

Because of this distributed replication, there are situations in which the latest data cannot be guaranteed depending on when you read.

**Eventually Consistent Read**:
DynamoDB reads from any one of the nodes. If the data you just wrote has not yet propagated to the other nodes, it may return an older version of the data. Consumption: 0.5 RCU per 4KB. This is the default.

**Strongly Consistent Read**:
DynamoDB reads from the "leader" node that guarantees the latest data. It always returns the data after the latest write. Consumption: 1 RCU per 4KB (twice that of eventual consistency). Requires the `ConsistentRead: true` parameter.

**Transactional Read**:
Reads multiple items atomically. Consumption: 2 RCU per 4KB. Uses the `TransactGetItems` API.

| Read type | Cost | Latest data guaranteed | GSI support |
|----------|------|---------------|---------|
| Eventually Consistent | 0.5 RCU/4KB | ❌ (almost always the latest) | ✅ |
| Strongly Consistent | 1 RCU/4KB | ✅ | ❌ (base table + LSI only) |
| Transactional | 2 RCU/4KB | ✅ | ❌ |

> ⚠️ **Pitfall**: **A GSI does not support strongly consistent reads.** Only eventual consistency is possible. This is because a GSI is replicated asynchronously - even after a write to the base table completes, there is a short delay before it is reflected in the GSI. If you need strong consistency, you must use the base table or an LSI.

## The DynamoDB Expression System - The Roles of the 5 Expressions

DynamoDB handles conditions, updates, and filters with Expressions instead of SQL. It is important not to confuse the 5 expressions.

```python
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Orders')

# 1. KeyConditionExpression — in Query, the partition key (required) + sort key (optional) condition
response = table.query(
    KeyConditionExpression=Key('userId').eq('U001') & 
                           Key('orderDate').between('2026-01-01', '2026-06-30')
)

# 2. FilterExpression — client-side filtering after the read (RCU is still consumed!)
response = table.query(
    KeyConditionExpression=Key('userId').eq('U001'),
    FilterExpression=Attr('status').eq('COMPLETED')  # no RCU savings
)

# 3. UpdateExpression — modify item attributes
table.update_item(
    Key={'userId': 'U001', 'orderDate': '2026-06-26'},
    UpdateExpression='SET #s = :status, updatedAt = :ts ADD orderCount :one',
    ExpressionAttributeNames={'#s': 'status'},   # work around reserved words
    ExpressionAttributeValues={':status': 'SHIPPED', ':ts': '2026-06-26T10:00:00Z', ':one': 1}
)

# 4. ConditionExpression — conditional write (ConditionalCheckFailedException if the condition fails)
table.put_item(
    Item={'userId': 'U001', 'email': 'kim@example.com'},
    ConditionExpression=Attr('userId').not_exists()  # prevent duplicates
)

# 5. ProjectionExpression — choose the attributes to return (saves network cost, RCU is based on the whole item)
response = table.get_item(
    Key={'userId': 'U001'},
    ProjectionExpression='email, #n',
    ExpressionAttributeNames={'#n': 'name'}
)
```

`FilterExpression` filters items **after** they are read. That is, DynamoDB first reads all items that match the partition key condition (consuming RCU), and then applies the FilterExpression to remove some of them. Even if only 10 items end up in the result, if 1,000 items were read, RCU is charged on the basis of 1,000. To save RCU, you must design a GSI and search with KeyConditionExpression rather than using FilterExpression.

## Adaptive Capacity and Burst Capacity

Both features handle short-term throughput overages, but in different ways.

**Burst Capacity**: Accumulates up to 5 minutes' worth of unused RCU/WCU and uses it during a sudden traffic spike. It works automatically, no configuration needed.

**Adaptive Capacity**: When a partition within a table becomes a hot partition, it redistributes the spare capacity of other partitions to the hot partition. Since 2018 it has been improved to an "instant" approach - previously it took several minutes.

Both are temporary buffers, and the fundamental fix is design:
- Burst: handles short peaks, but sustained overage gets throttled
- Adaptive Capacity: eases hot partitions, but cannot handle exceeding the whole table's throughput limit

## DynamoDB Local - A Local Development Environment

DynamoDB Local is a DynamoDB emulator written in Java that you can run locally with Docker or as a JAR file. You can develop and integration-test DynamoDB without a real AWS account.

```bash
# Run DynamoDB Local with Docker
docker run -p 8000:8000 amazon/dynamodb-local

# Connect the SDK to the local endpoint
import boto3
dynamodb = boto3.resource(
    'dynamodb',
    endpoint_url='http://localhost:8000',
    region_name='us-east-1',
    aws_access_key_id='dummy',
    aws_secret_access_key='dummy'
)
```

Note: DynamoDB Local is not identical to the real DynamoDB. Performance characteristics, throughput limits, and some new features are not simulated. It is suitable for integration tests, but for performance tests you must use the real DynamoDB.

The philosophy of DynamoDB we looked at today - partition hashing, the consistency model, and the expression system - is the foundation for the rest of the DynamoDB topics. In the next day, on top of this foundation, we look at how to design LSIs/GSIs and why the Single-Table Design pattern became the standard for DynamoDB.

## 📝 Practice Questions

**Question 1.** What are the RCU consumptions of an eventually consistent read and a strongly consistent read on a DynamoDB table?

A) Eventually consistent 0.5 RCU/4KB, strongly consistent 2 RCU/4KB
B) Eventually consistent 1 RCU/4KB, strongly consistent 0.5 RCU/4KB
C) Eventually consistent 0.5 RCU/4KB, strongly consistent 1 RCU/4KB
D) Both are the same at 1 RCU/4KB

**Answer: C**
Explanation: An eventually consistent read consumes 0.5 RCU per 4KB, and a strongly consistent read consumes 1 RCU per 4KB (twice that of eventual consistency). A transactional read is 2 RCU per 4KB. Strong consistency is enabled with the `ConsistentRead: true` parameter. The reason it costs twice as much is that a strongly consistent read reads from the leader node that guarantees the latest data, which requires more internal coordination.

---

**Question 2.** What happens when you request a strongly consistent read while using a GSI in DynamoDB?

A) It is read with strong consistency
B) The request fails with an error (not supported)
C) It is automatically replaced with eventual consistency and read
D) It is looked up from the base table to guarantee strong consistency

**Answer: B**
Explanation: A GSI does not support strongly consistent reads. If you set `ConsistentRead: true` on a GSI query, a `ValidationException` occurs. Because a GSI is replicated asynchronously from the base table, there is always a slight replication lag, and for this reason strong consistency cannot be guaranteed. Queries that need strong consistency must use the base table or an LSI.

---

**Question 3.** Which is a correct statement about DynamoDB FilterExpression?

A) FilterExpression uses indexes, so it saves RCU
B) FilterExpression filters after reading, so RCU is consumed based on the original data
C) FilterExpression is applied before DynamoDB reads from disk
D) Using FilterExpression automatically creates a GSI

**Answer: B**
Explanation: FilterExpression filters on the client side after DynamoDB has read all the data based on the KeyConditionExpression. That is, even if you read 1,000 items from the partition and only 10 remain after the FilterExpression, RCU is consumed based on 1,000 items. To save RCU, you must design an index (GSI) instead of using FilterExpression and read only the data you need with KeyConditionExpression.

---

**Question 4.** Which of the following partition key designs is most likely to cause a hot partition in DynamoDB?

A) userId (UUID format)
B) Order creation date (for example, "2026-06-26")
C) Device serial number
D) Email address

**Answer: B**
Explanation: If you use a date as the partition key, all of today's writes concentrate on the partition for today's date ("2026-06-26"). This is the classic cause of a hot partition. Throttling occurs when the per-partition limit of 1,000 WCU is exceeded. UUIDs (A), serial numbers (C), and emails (D) all have high cardinality, so writes are evenly distributed across multiple partitions.

---

**Question 5.** What is the maximum size of a DynamoDB item, and what is the standard pattern for working around this limit?

A) Maximum 1MB, split large data into pieces and store it across multiple items
B) Maximum 400KB, store large data in S3 and store only the S3 URL or key in DynamoDB
C) Maximum 64KB, store large data in ElastiCache
D) Maximum 5TB, no limit

**Answer: B**
Explanation: The maximum size of a DynamoDB item is 400KB. Data that exceeds this, such as images, videos, and large documents, is stored in S3, and only the URL or key of the S3 object is stored in DynamoDB. This is the standard pattern AWS recommends in its official documentation. Splitting across multiple items (A) makes atomic updates difficult and management complicated. The DynamoDB item size limit is currently 400KB and has not changed.

---

**Question 6.** On an e-commerce platform, the DynamoDB orders table uses userId as the partition key and orderId as the sort key. What is the most efficient way to get the 10 most recent orders for a specific userId?

A) Read the entire table with a Scan operation and filter by userId
B) A Query operation + KeyConditionExpression(userId) + ScanIndexForward=false + Limit=10
C) Repeat a GetItem operation 10 times
D) Look up 10 items simultaneously with BatchGetItem

**Answer: B**
Explanation: A Query operation specifies a particular partition with the partition key (userId) and can perform range lookups on data sorted by the sort key (orderId). `ScanIndexForward=false` returns in reverse sort-key order (newest first), and `Limit=10` fetches only 10. A Scan (A) reads the entire table and is inefficient. GetItem (C) requires knowing the exact key in advance, and cannot be used if you do not know the orderIds of recent orders. BatchGetItem (D) likewise needs exact keys.

---

**Question 7.** What is the difference between DynamoDB's Adaptive Capacity and Burst Capacity?

A) Burst Capacity redistributes capacity between partitions, and Adaptive Capacity accumulates 5 minutes' worth of capacity
B) Burst Capacity accumulates 5 minutes' worth of unused capacity to handle sudden traffic, and Adaptive Capacity redistributes the spare capacity of other partitions to a hot partition
C) They are the same feature, just with different names
D) Burst Capacity works only in on-demand mode, and Adaptive Capacity works only in provisioned mode

**Answer: B**
Explanation: Burst Capacity accumulates up to 5 minutes (300 seconds) of unused capacity per prefix/partition, and during a traffic spike it consumes this accumulated capacity first. Adaptive Capacity redistributes capacity among the partitions in a table - when one partition becomes hot, it borrows spare capacity from other partitions. The two features are complementary and both work automatically. However, neither feature solves the underlying PK design problem.

---
