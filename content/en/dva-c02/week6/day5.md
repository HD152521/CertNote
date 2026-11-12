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

**Question 1.** You read a 4 KB item 200 times per second with eventual consistency and 100 times per second with strong consistency. What is the total provisioned RCU?

A) 150 RCU
B) 200 RCU
C) 250 RCU
D) 300 RCU

**Answer: B**
Explanation: Eventual consistency = ceil(4/4) × 0.5 × 200 = 1 × 0.5 × 200 = 100 RCU. Strong consistency = ceil(4/4) × 1 × 100 = 1 × 1 × 100 = 100 RCU. Total = 200 RCU. When provisioning both read types at the same time, add them together.

---

**Question 2.** Which of the following statements about DynamoDB GSIs is incorrect?

A) Unlike an LSI, a GSI can be added or deleted at any time even after table creation
B) A GSI does not share capacity with the base table and has its own separately provisioned RCU/WCU
C) A GSI supports Strongly Consistent reads
D) A GSI's partition key can use a different attribute regardless of the base table's PK

**Answer: C**
Explanation: A GSI supports only Eventually Consistent reads. It is asynchronously replicated into a partition space completely separate from the base table, so replication lag exists and strong consistency is impossible. The only secondary index that supports Strongly Consistent reads is the LSI (because it is stored in the same partition as the base table). A, B, and D are all correct characteristics of a GSI.

---

**Question 3.** What is the behavior when `BisectBatchOnFunctionError=true` is set on a Lambda ESM for DynamoDB Streams?

A) The entire failed batch is retried identically from the beginning, repeatedly, without splitting
B) On error, the batch is split in half and each half is retried separately to isolate the record causing the error
C) On error, the entire batch is immediately sent to the DLQ in DestinationConfig and discarded
D) On error, the execution environment (Lambda) is restarted to reset memory and the same batch is processed again

**Answer: B**
Explanation: When batch processing fails, `BisectBatchOnFunctionError=true` splits that batch into exactly two halves and retries each in a separate Lambda invocation. Repeating this eventually isolates the single record (poison pill) that causes the error. If you also configure a DLQ in `DestinationConfig`, the isolated record is moved to the DLQ after the maximum retries so that normal processing of the rest continues. Without it, the error record blocks the stream and later records are not processed.

---

**Question 4.** In an application using DAX, the latest value must always be guaranteed when reading a financial account balance. What is the correct approach?

A) Set the DAX Item Cache TTL to 0 so the cache expires immediately
B) Bypass DAX and query DynamoDB directly with `ConsistentRead=true`
C) Add an API Gateway response cache in front of DAX to speed up reads
D) Increase the number of DAX cluster nodes to raise the cache hit rate and throughput

**Answer: B**
Explanation: DAX automatically routes `ConsistentRead=true` requests directly to DynamoDB. That is, when you set `ConsistentRead=true` in application code, the DAX SDK automatically bypasses the cache and reads the latest data from the DynamoDB primary node. Setting the DAX TTL to 0 effectively disables the cache, which defeats the purpose of DAX. When handling items with strong consistency requirements, such as financial balances, and items that tolerate eventual consistency, such as general product information, in the same DAX cluster, distinguishing them with the consistency flag is the correct pattern.

---

**Question 5.** In on-demand mode for a DynamoDB table, requests per second suddenly increase to 5 times the previous peak. What happens?

A) On-demand is effectively infinitely scalable, so even a 5x spike is handled as is without throttling
B) `ProvisionedThroughputExceededException` occurs
C) When it detects the spike, the table automatically switches to provisioned mode and fixes the capacity
D) Excess requests are queued internally and processed sequentially once capacity is available

**Answer: B**
Explanation: On-demand mode is not "infinite scaling". It automatically scales immediately only up to 2x the traffic peak it handled most recently. A 5x increase exceeds this limit, so throttling occurs. A new table, or a table that had low traffic for a long time, is not sufficiently "warmed up", so throttling starts at an even lower threshold. Solution: warm it up by handling sufficient traffic in provisioned mode and then switch to on-demand, or scale gradually with provisioned mode + Auto Scaling.

---

**Question 6.** You want to index only users with the attribute `status = "ACTIVE"` in a GSI. What is the most efficient way?

A) Apply a status = "ACTIVE" FilterExpression in the GSI definition so only ACTIVE items are indexed
B) Index all users in the GSI, then filter only status = "ACTIVE" with a FilterExpression at Query time
C) Use the status attribute as the GSI's partition key (Sparse Index pattern)
D) A separate Lambda receives Streams and syncs only status = "ACTIVE" items to a replica table

**Answer: C**
Explanation: This is the Sparse Index pattern. If you use the status attribute as the GSI's partition key, only items that have the status attribute are indexed in the GSI. Items without status do not appear in the GSI. For A, a FilterExpression filters after reading, so there is no RCU saving. B has the same problem. D adds complexity and data synchronization problems. With a GSI Sparse Index, "the existence of the attribute itself becomes the indexing condition", achieving efficient filtering without additional code.

---

**Question 7.** What is the most suitable scenario for using the `NEW_AND_OLD_IMAGES` view type in DynamoDB Streams?

A) When only the full content of a newly inserted item is needed
B) When you need to compare before/after states to record an audit log or understand what changed
C) When only the identifying keys (PK/SK) of deleted or changed items are needed
D) When stream storage and delivery cost must be minimized

**Answer: B**
Explanation: `NEW_AND_OLD_IMAGES` records the entire item both before and after the change, so you can tell "what changed and how". It is suitable for audit logs, change history tracking, and detecting changes to specific fields. To minimize storage cost, `KEYS_ONLY` (records only PK/SK) is suitable. For processing after inserting a new item, `NEW_IMAGE` is sufficient. For post-deletion processing, `OLD_IMAGE` is suitable.

---

**Question 8.** Select all correct statements about DynamoDB TTL.

A) When a TTL-expired item is recorded in Streams as REMOVE, it is identified by `userIdentity.type = "Service"`
B) TTL deletion consumes WCUs proportional to the item size, just like a regular DeleteItem
C) The TTL attribute value must be a number in Unix epoch seconds
D) Once the TTL expiration time passes, the item is immediately excluded from Query/GetItem results

**Answer: A, C**
Explanation: A (correct) — To distinguish a TTL deletion from a regular DeleteItem, check the `userIdentity` field of the Stream record. If `type = "Service"` and `principalId = "dynamodb.amazonaws.com"`, it is a TTL deletion. B (incorrect) — TTL deletion does not consume WCUs, so it is cost-efficient. C (correct) — It must be a number in Unix epoch seconds. Milliseconds or ISO date strings are not recognized as TTL. D (incorrect) — There is a delay of 0 to 48 hours after TTL expiration, so expired items can still be returned.

---

**Question 9.** A DynamoDB table has `orderId(PK)`, `createdAt(SK)`, and `category`. You want to "query orders of a specific category in ascending order of createdAt". What is the most efficient index design?

A) Add a GSI with category as the PK (SK = createdAt)
B) Scan the entire base table, filter with a FilterExpression (category = :c), and sort in the app
C) Add a GSI with createdAt as the PK and query chronologically
D) Add an LSI with category as the SK (PK fixed to the base table's orderId)

**Answer: A**
Explanation: If you configure a GSI with PK=category and SK=createdAt, `Query(PK=category, ScanIndexForward=true)` efficiently retrieves the orders of a specific category in ascending order of createdAt. B scans the entire table, so it is costly and slow. For C, if createdAt is the PK, data is not distributed by time period and the sort condition cannot be used. For D, an LSI must use the same PK (orderId) as the base table, so category can be used as the SK, but you can query only if you know the orderId, which is unsuitable for "retrieving everything for a specific category".

---

**Question 10.** An e-commerce platform stores order events in DynamoDB and must send real-time notifications for new orders (INSERT). What is the most efficient way to configure Lambda to process only INSERT events?

A) In the Lambda handler code, skip records where `eventName != "INSERT"` with an early return
B) Set an `eventName = "INSERT"` pattern in the ESM `FilterCriteria`
C) Create a dedicated INSERT-only stream and connect only that stream to Lambda
D) Send all Stream events to SQS and have Lambda pick out and process only INSERTs from the queue

**Answer: B**
Explanation: The ESM `FilterCriteria` filters DynamoDB Streams events on the server side before Lambda is invoked. If you filter only INSERT, MODIFY and REMOVE events do not trigger a Lambda invocation at all, reducing Lambda execution cost and improving processing efficiency. A invokes Lambda and skips in code, so invocation cost is incurred. For C, DynamoDB Streams is one per table. D adds unnecessary configuration complexity. Filter pattern: `{"eventName": ["INSERT"]}`.

---

**Question 11.** What is the role of the `ConditionCheck` action in DynamoDB TransactWriteItems?

A) It conditionally modifies the item within the transaction only when the ConditionExpression is satisfied
B) It only checks a condition on another table without writing, and rolls back the entire transaction if the condition is not satisfied
C) It validates the resulting data after the transaction commit has finished
D) It checks a condition expression defined on a GSI to guarantee index consistency

**Answer: B**
Explanation: `ConditionCheck` is an action that only checks a condition on a specific item within a transaction, without writing. For example, in an order-creation transaction, if you want to verify that the user's account status is ACTIVE, you can check the condition without modifying the Users table. If the condition fails, `TransactionCanceledException` is raised and the entire transaction (including Put/Update/Delete on other tables) is rolled back. Without this action, you would need a separate read before the transaction, and a TOCTOU bug could occur.

---

**Question 12.** In DynamoDB Single-Table Design, what is the common pattern for supporting queries by entity type?

A) Create a separate table for each entity type to separate lookups by type
B) A Sparse Index pattern using the `entity_type` attribute as the partition key in a GSI
C) Scan the single table and filter on entity_type with a FilterExpression
D) Query by type with PartiQL `SELECT ... WHERE entity_type = 'Order'`

**Answer: B**
Explanation: In Single-Table Design, along with the `PK = ENTITY_TYPE#id` pattern, you store the type in an `entity_type` attribute and use it as the GSI partition key. `Query GSI(PK = "ORDER")` efficiently retrieves all orders, and `Query GSI(PK = "USER")` all users. C (Scan + Filter) reads the entire table, so it is costly. D (PartiQL) can also perform a Scan internally. The GSI pattern in B provides efficient lookups of O(number of items of that type).

---
