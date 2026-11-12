# Day 3 - DynamoDB: RCU/WCU Mathematics, DAX Architecture, Streams Processing

Many developers are shocked when receiving their first DynamoDB bill. The amount often runs 10× or 100× higher than expected for three reasons — RCU/WCU calculation mistakes, wrong choice between on-demand and provisioning modes, and wasted capacity from incomplete work. In this day, we understand RCU/WCU calculation precisely through mathematics, how DAX manages caching, and how DynamoDB Streams connects with Lambda.

## The Mathematics of RCU Calculation — ceil function is key

RCU (Read Capacity Unit) calculation formula:

```
Strongly Consistent RCU = ceil(item size / 4KB) × 1
Eventually Consistent RCU  = ceil(item size / 4KB) × 0.5
Transactional Read RCU    = ceil(item size / 4KB) × 2
```

**ceil** is the ceiling function. A 4.1KB item: ceil(4.1/4) = ceil(1.025) = 2.

Frequently appearing RCU calculation examples on exams:

```
Example 1: 1KB item, Eventually Consistent reads 100/sec
  RCU = ceil(1/4) × 0.5 × 100 = 1 × 0.5 × 100 = 50 RCU

Example 2: 6KB item, Strongly Consistent reads 50/sec
  RCU = ceil(6/4) × 1 × 50 = 2 × 1 × 50 = 100 RCU

Example 3: 9KB item, Transactional reads 20/sec
  RCU = ceil(9/4) × 2 × 20 = 3 × 2 × 20 = 120 RCU

Example 4: 400KB item (max size), Eventually Consistent 10/sec
  RCU = ceil(400/4) × 0.5 × 10 = 100 × 0.5 × 10 = 500 RCU
```

## The Mathematics of WCU Calculation

WCU (Write Capacity Unit) calculation formula:

```
Standard Write WCU      = ceil(item size / 1KB)
Transactional Write WCU  = ceil(item size / 1KB) × 2
```

WCU is based on 1KB — different from RCU's 4KB. Missing this difference makes calculations wrong by 4×.

```
Example 1: 2.5KB item, standard write 10/sec
  WCU = ceil(2.5/1) × 1 × 10 = 3 × 10 = 30 WCU

Example 2: 0.5KB item, transactional write 50/sec
  WCU = ceil(0.5/1) × 2 × 50 = 1 × 2 × 50 = 100 WCU

Example 3: 7KB item, standard write 5/sec
  WCU = ceil(7/1) × 1 × 5 = 7 × 5 = 35 WCU
```

> ⚠️ **Trap**: WCU is 1KB-based, RCU is 4KB-based. Confusing them makes calculation wrong by 4×. Memorize: "writes are more expensive" — same item consumes 4× more WCU units than RCU (Strongly Consistent).

## On-Demand vs Provisioning — The Mathematics of Selection Criteria

| Aspect | Provisioning + Auto Scaling | On-Demand |
|------|------------------------|---------|
| Pricing | Per-hour RCU/WCU charge | Per-request charge |
| Price ratio | Baseline | ~2~3× more expensive |
| Predictability | Favorable for predictable traffic | Favorable for unpredictable traffic |
| Management | Auto Scaling policy required | No configuration |
| Max throughput | Set value | 2× previous peak (warmed up) |
| Mode switch | To on-demand once/24hr | To provisioning once/24hr |

On-demand suitable situations: ① New service (traffic unpredictable), ② Batch jobs (irregular heavy processing), ③ Dev/test environment, ④ Completely random traffic pattern.

Provisioning suitable situations: ① Stable, predictable traffic, ② Cost optimization important for large services, ③ Using Reserved Capacity (~76% discount).

> ⚠️ **Trap**: On-demand mode doesn't scale infinitely. Starts at minimum throughput on initial setup and auto-scales only to 2× previous traffic peak. If traffic suddenly surges 10×, even an on-demand table not "warmed up" will throttle. Warming method: Run in provisioning mode for sufficient time to handle adequate traffic before switching to on-demand.

## DAX Architecture — The Meaning of Write-Through Cache

DAX (DynamoDB Accelerator) is a DynamoDB-exclusive in-memory cache. Reduces response time from milliseconds (ms) to microseconds (μs).

DAX is a fully managed cluster. Consists of one Primary node and multiple Read Replica nodes. Clients use DAX SDK instead of DynamoDB SDK but API is identical.

**DAX's two caches**:

```
1. Item Cache
   - Target: GetItem, BatchGetItem results
   - TTL: Default 5 minutes (adjustable)
   - On cache miss: Read from DynamoDB, store in cache, return

2. Query Cache
   - Target: Query, Scan results
   - TTL: Default 5 minutes (adjustable)
   - Same query with same parameters returns from cache
   - Cache key: Hash of table name + all parameters
```

**DAX read flow**:
```
Client → DAX cluster
            ↓ Cache hit?
            YES → Return from cache immediately (~μs)
            NO  → Read from DynamoDB → Store in cache → Return (~ms)
```

**DAX write flow (Write-Through)**:
```
Client → DAX cluster
            ↓
            Write to DynamoDB (synchronously)
            ↓
            Update Item Cache
            ↓
            Return completion
```

Write-Through meaning: When write request arrives at DAX, DAX writes to DynamoDB first, and only updates cache upon success. Unlike Write-Back where writes only hit cache, there's no data loss risk.

> 💡 **Related theory**: Three cache strategies — Lazy Loading (Cache-Aside): app reads from DB on cache miss and stores in cache. Write-Through: update cache and DB simultaneously on write. Write-Back (Write-Behind): write hits cache only, async reflection to DB later. DAX uses Lazy Loading for reads, Write-Through for writes. ElastiCache can implement all three but requires developer to code cache logic.

**DAX's important constraints**:

1. **Strongly Consistent reads bypass cache** — `ConsistentRead: true` requests make DAX query DynamoDB directly. DAX benefits lost for always-latest-data cases.

2. **VPC-only access** — ENI created in DAX cluster, accessible only inside VPC. No direct internet access.

3. **No write performance improvement** — DAX is a read cache. Writes always go through DynamoDB.

## DAX vs ElastiCache — When to Use Which

| Item | DAX | ElastiCache(Redis) |
|------|-----|-------------------|
| Target data | DynamoDB-only | Any data |
| API compatibility | Same as DynamoDB SDK | Separate Redis/Memcached API |
| Cache logic | Automatic (transparent) | Developer-implemented |
| TTL management | Automatic (DAX handles) | Developer configures |
| Cache invalidation | DAX auto on write | Developer manually deletes |
| Use cases | DynamoDB read acceleration | Session management, Pub/Sub, complex caching |
| Cost | DAX node hourly charge | ElastiCache node hourly charge |

Exam scenario: "DynamoDB read response is ms level, want μs level" → DAX. "Fast session data storage needed" → ElastiCache Redis. "Cache various DBs regardless of DynamoDB" → ElastiCache.

> 📚 **Case study**: Netflix uses DynamoDB for user watch history and recommendation data, places DAX in front to cache the repeated access patterns to same episode lists. According to Netflix internal presentation, 70%+ of peak-time DynamoDB reads are satisfied by DAX cache hits, significantly reducing DynamoDB provisioning costs.

## DynamoDB Streams — Real-time Streaming of Change History

DynamoDB Streams is a time-ordered change log recording all item changes (INSERT, MODIFY, REMOVE) in order.

**Streams internal structure**:
- One Stream shard per table partition
- Event order guaranteed within partition key
- 24-hour retention (fixed, unchangeable)
- Consumed by Lambda or KCL (Kinesis Client Library)

**4 Stream view types**:

```
KEYS_ONLY:          Only PK and SK of changed items
NEW_IMAGE:          Full item after change
OLD_IMAGE:          Full item before change
NEW_AND_OLD_IMAGES: Both before and after (audit logs)
```

**Lambda + Streams integration method**:

Lambda polls Streams via **Event Source Mapping (ESM)**. Lambda periodically checks Streams, not Streams calling Lambda directly.

```python
# Lambda handler (process DynamoDB Streams events)
def handler(event, context):
    for record in event['Records']:
        event_name = record['eventName']  # INSERT, MODIFY, REMOVE
        
        if event_name == 'INSERT':
            new_item = record['dynamodb']['NewImage']
            # Process new item
            
        elif event_name == 'MODIFY':
            old_item = record['dynamodb']['OldImage']
            new_item = record['dynamodb']['NewImage']
            # Process before/after comparison
            
        elif event_name == 'REMOVE':
            old_item = record['dynamodb']['OldImage']
            # Process deleted item
```

| ESM Setting | Description |
|---------|------|
| BatchSize | Records to process per invocation (max 10,000) |
| BisectBatchOnFunctionError | Split batch in half on error, retry separately |
| DestinationConfig | Send failed records to SQS DLQ or SNS |
| MaximumRetryAttempts | Maximum retry attempts |
| ParallelizationFactor | Parallel Lambdas per shard (default 1, max 10) |

**One Lambda per shard**: By default, one Stream shard is processed sequentially by one Lambda instance. Increasing `ParallelizationFactor` allows one shard processed by multiple Lambdas in parallel, but partition key-level order guarantee becomes complex.

## Kinesis Data Streams for DynamoDB — Overcome 24-hour Limit

DynamoDB Streams' only major limitation: **24-hour retention**. If 1-year change history is needed, must use Kinesis Data Streams instead.

Connecting DynamoDB table directly to Kinesis Data Streams flows all changes into Kinesis stream. Kinesis supports up to **365-day** retention.

```
DynamoDB Table
    ↓ (Direct connection, no code)
Kinesis Data Stream
    ↓ (Max 365-day retention)
    ├── Lambda (real-time processing)
    ├── Kinesis Firehose → S3 (long-term storage)
    └── Kinesis Analytics (real-time analysis)
```

Exam scenario: "Must retain DynamoDB change history 1+ year" → Kinesis Data Streams for DynamoDB.

## Global Tables — Multi-Region Active-Active

Global Tables creates replicas of DynamoDB table across regions where read/write is possible in each region (Active-Active pattern).

```
ap-northeast-2 table ←→ us-east-1 table ←→ eu-west-1 table
(Write in Seoul)        (Write in Virginia)  (Write in Ireland)
        ↕ Async replication (Streams-based)
All regions eventually consistent synchronization
```

Global Tables requirements: ① DynamoDB Streams enabled mandatory, ② On-demand or equal provisioning capacity.

Conflict resolution: Simultaneous modification of same item in two regions resolved via **Last Writer Wins** method. Latest timestamp write becomes final value.

> ⚠️ **Trap**: Requesting Strongly Consistent read in Global Tables only guarantees consistency in current region's local replica. If other region's write hasn't replicated yet, even local Strongly Consistent read doesn't include other region's latest data.

## PITR (Point-In-Time Recovery) — 35-day Rollback Window

PITR restores DynamoDB table to any point within last 35 days.

```
Activation: Enable per table
Restore: Choose specific time in seconds within last 35 days
Target: Restore to new table (doesn't overwrite existing)
Cost: Per GB of stored data additional charge
```

PITR differs from On-Demand Backup. On-Demand Backup creates manual snapshot at specific time, retained indefinitely. PITR is automatic but only restores within 35-day window.

Exam scenario: "Accidentally deleted large data, want yesterday's state" → PITR. "Regulations require 5-year backup retention" → On-Demand Backup + S3 Export.

Today's core — RCU/WCU mathematics appears almost every exam as calculation problems. Don't memorize formulas but understand the principle: "reads are 4KB-based, writes are 1KB-based, ceil for rounding up". DAX is a transparent cache reducing DynamoDB reads to μs, Streams is a change log preserving 24 hours of all changes.

## 📝 Practice Questions

**Question 1.** You read a 7 KB item from DynamoDB with strong consistency 30 times per second. What is the required provisioned RCU?

A) 30 RCU
B) 60 RCU
C) 90 RCU
D) 120 RCU

**Answer: B**
Explanation: Strongly consistent RCU = ceil(item size / 4 KB) × 1 × requests per second. ceil(7/4) = ceil(1.75) = 2. 2 × 1 × 30 = 60 RCU. With eventual consistency it would have been 30 RCU (half). With transactional reads it would have been 120 RCU (double). If the item size were 8 KB, ceil(8/4)=2 would be the same, but at 9 KB, ceil(9/4)=3 would make it 90 RCU.

---

**Question 2.** You write a 3.5 KB item to DynamoDB with transactional writes 20 times per second. What is the required WCU?

A) 20 WCU
B) 80 WCU
C) 140 WCU
D) 160 WCU

**Answer: D**
Explanation: Transactional write WCU = ceil(item size / 1 KB) × 2 × requests per second. ceil(3.5/1) = 4. 4 × 2 × 20 = 160 WCU. For a standard write it would have been ceil(3.5/1)×1×20 = 80 WCU.

---

**Question 3.** When using DAX, how is a strongly consistent read request handled?

A) It is returned immediately from the DAX cache
B) DAX queries DynamoDB directly and returns the latest data
C) An error occurs (DAX does not support strong consistency)
D) It is automatically converted to eventual consistency and returned from the cache

**Answer: B**
Explanation: DAX does not serve strongly consistent read requests from its cache. Reads with `ConsistentRead: true` pass through DAX and are queried directly against DynamoDB. This is because the cache cannot guarantee the latest data — a read made before a recent write is reflected in the cache could return stale data. The drawback is that when strong consistency is required, you do not get DAX's performance benefit.

---

**Question 4.** When integrating DynamoDB Streams with Lambda, how is ordering guaranteed?

A) The order of all events is guaranteed at the whole-table level
B) Event order is guaranteed per partition key
C) There is no ordering guarantee at all
D) The order in which Lambda processes events is unrelated to the DynamoDB event order

**Answer: B**
Explanation: DynamoDB Streams guarantees event order per partition key. Changes to the same partition key (the same item) are written to the Stream shard in the order they occurred, and Lambda processes them in that order. However, the order between events for different partition keys is not guaranteed. There is no global ordering guarantee at the whole-table level. This is why, when processing data through Streams, state must be managed per partition key.

---

**Question 5.** You need to retain and analyze DynamoDB change history for 2 years. What is the most suitable architecture?

A) Store directly to S3 with DynamoDB Streams + Lambda
B) DynamoDB Kinesis Data Streams integration -> Kinesis Firehose -> S3
C) Retain 35 days of backups with DynamoDB PITR
D) Manually create a DynamoDB On-Demand Backup every day

**Answer: B**
Explanation: DynamoDB Streams retains data for only 24 hours, so it is unsuitable for 2-year retention. Kinesis Data Streams can retain up to 365 days, which is still not enough for 2 years. However, storing permanently in S3 through Kinesis Firehose enables retention of 2 years or more. Connect the DynamoDB table directly to Kinesis Data Streams, and Kinesis Firehose stores the data to S3 in batches. PITR is limited to 35 days, and On-Demand Backup is not suitable for analysis.

---

**Question 6.** Right after switching a DynamoDB table to on-demand mode, traffic suddenly increases 20-fold. What happens?

A) On-demand scales infinitely, so it is handled without any problem
B) Throttling occurs — on-demand can immediately accommodate only up to 2x the previous peak
C) It automatically switches to provisioned mode
D) It is handled without errors, but you are billed 20 times as much

**Answer: B**
Explanation: On-demand mode is not "infinite scaling". It immediately accommodates only up to 2x the previous traffic peak it has handled. For a new table, or one that had low traffic for a long time, it starts from the minimum, so throttling occurs on a sudden traffic spike. To prevent this, either (1) handle sufficient traffic in provisioned mode and then switch to on-demand, or (2) scale gradually using Auto Scaling in provisioned mode.

---
