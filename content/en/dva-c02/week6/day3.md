# Day 3 - DynamoDB: RCU/WCU Math, DAX Architecture, and Streams Processing

The causes of a DynamoDB bill coming in much higher than expected usually narrow down to three — mistakes in the RCU/WCU calculation, choosing the wrong between on-demand and provisioned mode, and waste from unfinished work. In this day we get the RCU/WCU calculation mathematically exact, and dig into how DAX manages its cache and how DynamoDB Streams integrates with Lambda.

## The Math of RCU Calculation — The ceil Function Is the Key

The RCU (Read Capacity Unit) formulas:

```
Strongly consistent RCU = ceil(item size / 4KB) × 1
Eventually consistent RCU  = ceil(item size / 4KB) × 0.5
Transactional RCU    = ceil(item size / 4KB) × 2
```

**ceil** is the round-up function. If the item is 4.1KB, ceil(4.1/4) = ceil(1.025) = 2.

RCU calculation examples:

```
Example 1: 1KB item, 100 eventually consistent reads/sec
  RCU = ceil(1/4) × 0.5 × 100 = 1 × 0.5 × 100 = 50 RCU

Example 2: 6KB item, 50 strongly consistent reads/sec
  RCU = ceil(6/4) × 1 × 50 = 2 × 1 × 50 = 100 RCU

Example 3: 9KB item, 20 transactional reads/sec
  RCU = ceil(9/4) × 2 × 20 = 3 × 2 × 20 = 120 RCU

Example 4: 400KB item (maximum size), 10 eventually consistent reads/sec
  RCU = ceil(400/4) × 0.5 × 10 = 100 × 0.5 × 10 = 500 RCU
```

## The Math of WCU Calculation

The WCU (Write Capacity Unit) formulas:

```
Standard write WCU      = ceil(item size / 1KB)
Transactional write WCU  = ceil(item size / 1KB) × 2
```

WCU is based on 1KB — different from the 4KB of RCU. Miss this difference and the calculation is wrong.

```
Example 1: 2.5KB item, 10 standard writes per second
  WCU = ceil(2.5/1) × 1 × 10 = 3 × 10 = 30 WCU

Example 2: 0.5KB item, 50 transactional writes per second
  WCU = ceil(0.5/1) × 2 × 50 = 1 × 2 × 50 = 100 WCU

Example 3: 7KB item, 5 standard writes per second
  WCU = ceil(7/1) × 1 × 5 = 7 × 5 = 35 WCU
```

WCU is in 1KB units and RCU is in 4KB units. Mix them up and the calculation is off by 4x. You can remember it as "writes are more expensive." For the same item, WCU consumes 4 times as many capacity units as RCU (strongly consistent).

## On-Demand vs Provisioned — The Math of the Selection Criteria

| Category | Provisioned + Auto Scaling | On-demand |
|------|------------------------|---------|
| Pricing | Provisioned RCU/WCU billed per hour | Billed per actual request |
| Price ratio | Baseline | About 2-3x more expensive |
| Predictability | Favors predictable traffic | Favors unpredictable traffic |
| Management | Auto Scaling policy must be set | No configuration |
| Maximum throughput | The configured value | 2x the previous peak (pre-warmed) |
| Mode switch | To on-demand once per 24 hours | To provisioned once per 24 hours |

When on-demand fits: ① a new service (unpredictable traffic), ② batch jobs (irregular bulk processing), ③ dev/test environments, ④ a completely random traffic pattern.

When provisioned fits: ① stable, predictable traffic, ② large services where cost optimization matters, ③ when you use Reserved Capacity (about 76% discount).

> ⚠️ **Pitfall**: On-demand mode does not scale infinitely. At initial setup it starts at the minimum throughput and auto-scales only up to 2x the previous traffic peak. So if 10x traffic suddenly arrives, throttling occurs even on an on-demand table that hasn't been warmed up. How to warm up: run in provisioned mode for a period to handle enough traffic, then switch to on-demand.

## DAX Architecture — What Write-Through Cache Means

DAX (DynamoDB Accelerator) is an in-memory cache dedicated to DynamoDB. It reduces response time from milliseconds (ms) to microseconds (μs).

DAX is configured as a fully managed cluster. A cluster consists of one primary node and several read replica nodes. The client uses the DAX SDK instead of the DynamoDB SDK, but the API is the same.

**DAX's two caches**:

```
1. Item Cache
   - Target: results of GetItem, BatchGetItem
   - TTL: default 5 minutes (adjustable)
   - On a cache miss: read from DynamoDB, store in the cache, then return

2. Query Cache
   - Target: results of Query, Scan
   - TTL: default 5 minutes (adjustable)
   - Running the same query with the same parameters returns the cache
   - Cache key: table name + hash of all parameters
```

**DAX read flow**:
```
Client → DAX cluster
                ↓ cache hit?
                YES → return immediately from the cache (~μs)
                NO  → read from DynamoDB → store in cache → return (~ms)
```

**DAX write flow (Write-Through)**:
```
Client → DAX cluster
                ↓
                write to DynamoDB (synchronous)
                ↓
                update the Item Cache
                ↓
                return completion
```

What Write-Through means: when a write request comes into DAX, DAX writes to DynamoDB first and, after it succeeds, updates the cache too. Unlike Write-Back, where the write is stored only in the cache, there is no risk of data loss.

The three types of caching strategy — Lazy Loading (Cache-Aside): on a cache miss, the application reads from the DB and stores it in the cache. Write-Through: on a write, the cache and DB are updated together. Write-Back (Write-Behind): the write goes only to the cache and is reflected in the DB asynchronously later. DAX uses Lazy Loading for reads and Write-Through for writes. ElastiCache can implement all three strategies, but the developer must code the cache logic themselves.

**Important DAX constraints**:

1. **Strongly consistent reads bypass the cache** — if you request with `ConsistentRead: true`, DAX queries DynamoDB directly. When you always need the latest data, you don't get DAX's benefit.

2. **Usable only inside a VPC** — an ENI is created for the DAX cluster, and it is reachable only inside the VPC. No direct access from the internet.

3. **No write performance improvement** — DAX is a read cache. Writes always go through DynamoDB.

## DAX vs ElastiCache — When to Use What

| Item | DAX | ElastiCache (Redis) |
|------|-----|-------------------|
| Target data | DynamoDB only | Any data |
| API compatibility | Same as the DynamoDB SDK | Separate Redis/Memcached API |
| Cache logic | Automatic (transparent) | Developer implements it |
| TTL management | Automatic (DAX handles it) | Developer sets it |
| Cache invalidation | Automatic by DAX on writes | Developer deletes manually |
| Use cases | Accelerating DynamoDB reads | Session management, Pub/Sub, complex caching |
| Cost | DAX node hourly rate | ElastiCache node hourly rate |

Exam scenarios: "DynamoDB read responses are at the ms level and I want them at the μs level" → DAX. "I want to store session data quickly" → ElastiCache Redis. "I want to cache various databases, unrelated to DynamoDB" → ElastiCache.

For patterns that read the same item repeatedly (for example, popular-list lookups), a cache in front of DynamoDB absorbs the read requests and reduces DynamoDB provisioning cost.

## DynamoDB Streams — Real-Time Streaming of the Change History

DynamoDB Streams is a time-ordered change log that records every item change (INSERT, MODIFY, REMOVE) in a table, in order.

**Internal structure of Streams**:
- One Stream shard exists per table partition
- Event order is guaranteed per partition key
- Retained for 24 hours (fixed, cannot be changed)
- Consumed with Lambda or the KCL (Kinesis Client Library)

**The four stream view types**:

```
KEYS_ONLY:          records only the PK and SK of the changed item
NEW_IMAGE:          the whole item after the change
OLD_IMAGE:          the whole item before the change
NEW_AND_OLD_IMAGES: both before and after the change (for audit logs)
```

**How Lambda and Streams integrate**:

Lambda polls Streams through an **Event Source Mapping (ESM)**. It is Lambda that periodically checks Streams; Streams does not invoke Lambda directly.

```python
# Lambda function handler (processing DynamoDB Streams events)
def handler(event, context):
    for record in event['Records']:
        event_name = record['eventName']  # INSERT, MODIFY, REMOVE
        
        if event_name == 'INSERT':
            new_item = record['dynamodb']['NewImage']
            # process the new item
            
        elif event_name == 'MODIFY':
            old_item = record['dynamodb']['OldImage']
            new_item = record['dynamodb']['NewImage']
            # compare before/after
            
        elif event_name == 'REMOVE':
            old_item = record['dynamodb']['OldImage']
            # process the deleted item
```

| ESM setting | Description |
|---------|------|
| BatchSize | Number of records to process at once (max 10,000) |
| BisectBatchOnFunctionError | On error, split the batch in half and retry |
| DestinationConfig | Send failed records to an SQS DLQ or SNS |
| MaximumRetryAttempts | Maximum number of retries |
| ParallelizationFactor | Number of parallel Lambdas per shard (default 1, max 10) |

**One Lambda per shard**: by default, one Stream shard is processed in order by one Lambda instance. Raising `ParallelizationFactor` lets several Lambdas process one shard in parallel, but then ordering guarantees per partition key become more complicated.

## Kinesis Data Streams for DynamoDB — Overcoming the 24-Hour Limit

The only big drawback of DynamoDB Streams is the **24-hour retention** limit. If you need a year of change history, you must use Kinesis Data Streams rather than DynamoDB Streams.

If you connect a DynamoDB table directly to Kinesis Data Streams, all changes flow into the Kinesis stream. Kinesis can retain up to **365 days**.

```
DynamoDB Table
    ↓ (direct connection, no extra code)
Kinesis Data Stream
    ↓ (up to 365 days retention)
    ├── Lambda (real-time processing)
    ├── Kinesis Firehose → S3 (long-term retention)
    └── Kinesis Analytics (real-time analytics)
```

Exam scenario: "DynamoDB change history must be retained for more than a year" → Kinesis Data Streams for DynamoDB.

## Global Tables — Multi-Region Active-Active

Global Tables is an Active-Active pattern that creates replicas of a DynamoDB table in multiple Regions so that reads/writes are possible in each Region.

```
ap-northeast-2 table ←→ us-east-1 table ←→ eu-west-1 table
(write in Seoul)         (write in Virginia)   (write in Ireland)
        ↕ asynchronous replication (Streams-based)
Synchronized to all Regions with eventual consistency
```

Global Tables requirements: ① DynamoDB Streams must be enabled, ② on-demand or identical provisioned capacity.

Conflict resolution: if the same item is modified in two Regions at the same time, it is resolved with **Last Writer Wins**. The write with the most recent timestamp becomes the final value.

If you request a strongly consistent read in Global Tables, strong consistency is guaranteed only on the local replica in the current Region. If a write from another Region hasn't been replicated yet, even a local strongly consistent read does not include the other Region's latest data.

## PITR (Point-In-Time Recovery) — The 35-Day Rollback Window

PITR is a backup feature that can restore a DynamoDB table to any point in the past 35 days.

```
Enable: turn on PITR per table
Restore: choose a specific point in time, to the second, within the last 35 days
Target: restores to a new table (does not overwrite the existing table)
Cost: additional charge per GB stored
```

PITR is different from On-Demand Backup. On-Demand Backup manually creates a snapshot at a specific point in time and retains it indefinitely. PITR is automatic but can restore only within the 35-day window.

Exam scenarios: "I accidentally deleted a large amount of data and want to restore to yesterday's state" → PITR. "Regulations require retaining backups for 5 years" → On-Demand Backup + S3 Export.

## How Table Capacity Gets Split Into Partitions

No matter how exactly you do the RCU/WCU calculation, you still run into throttling because **the capacity you set on the table is divided among the partitions**. The number on the bill is per table, but what actually serves requests is each individual partition.

```
Table: provisioned 4,000 RCU / 4,000 WCU
        ↓ DynamoDB splits it among partitions internally
   ┌──────────┬──────────┬──────────┬──────────┐
   │ Partition A │ Partition B │ Partition C │ Partition D │
   │ ~1000RCU │ ~1000RCU │ ~1000RCU │ ~1000RCU │
   └──────────┴──────────┴──────────┴──────────┘
        ▲
        └─ What if requests pile onto only this one?
           Even if only 900 of the table's 4,000 RCU are in use,
           ProvisionedThroughputExceededException occurs on Partition A alone

   Physical limit of one partition: about 3,000 RCU · 1,000 WCU · 10GB
```

There are two buffers you need to know here.

- **Burst Capacity**: it saves up the capacity left unused over the last **up to 300 seconds (5 minutes)** and spends it on momentary spikes. Short spikes get past with this. But since it is savings you can't keep using it, and it isn't a resource AWS guarantees.
- **Adaptive Capacity**: when load piles onto a particular partition, DynamoDB shifts spare capacity from other partitions toward it. It works automatically, but **if the skew is extreme, this too hits its limit**.

> ⚠️ **Pitfall**: The reflex "if throttling happens, raise the capacity" is the most expensive wrong answer. If skew is the cause, doubling the capacity doesn't increase the share assigned to one partition by that much, and only the bill doubles. **If `ThrottledRequests` shows up in CloudWatch even though consumed capacity is well below provisioned capacity, it is not a capacity problem but a key design problem.** The prescription then is (1) raise the partition key's cardinality, (2) spread it out artificially with write sharding, or (3) absorb the hot items up front with DAX or ElastiCache.

```bash
# See the table's capacity mode, indexes, and size at a glance
aws dynamodb describe-table --table-name Orders \
  --query 'Table.{Mode:BillingModeSummary.BillingMode,Items:ItemCount,SizeBytes:TableSizeBytes,GSI:GlobalSecondaryIndexes[].IndexName}'

# Switch to on-demand (limited to once per 24 hours — a number the exam asks)
aws dynamodb update-table --table-name Orders --billing-mode PAY_PER_REQUEST

# Switch back to provisioned and specify the GSI capacity too (if you omit the GSI, the GSI becomes the bottleneck)
aws dynamodb update-table --table-name Orders \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=2000,WriteCapacityUnits=2000 \
  --global-secondary-index-updates '[{"Update":{"IndexName":"StatusIndex",
      "ProvisionedThroughput":{"ReadCapacityUnits":2000,"WriteCapacityUnits":2000}}}]'

# Look at the throttle metric first — much faster than the logs
aws cloudwatch get-metric-statistics --namespace AWS/DynamoDB \
  --metric-name ThrottledRequests --dimensions Name=TableName,Value=Orders \
  --start-time 2026-06-27T00:00:00Z --end-time 2026-06-27T12:00:00Z \
  --period 300 --statistics Sum
```

## Batch APIs and Partial Failure — Where Data Is Lost Silently

DynamoDB's batch APIs are not "all succeed or all fail." They are structured so that **only some are processed and the rest are returned**, and code that ignores this return value causes data loss in practice.

| API | At a time | Nature | Failure handling |
|-----|--------|------|----------|
| `GetItem` | 1 item | Exactly one by key | Exception |
| `BatchGetItem` | **Up to 100 · 16MB** | Parallel lookup across several tables | **Returns `UnprocessedKeys`** |
| `BatchWriteItem` | **Up to 25 · 16MB** | Put/Delete only (**no Update**) | **Returns `UnprocessedItems`** |
| `TransactWriteItems` | Up to 100 · 4MB | All succeed or all fail | Exception (with cancellation reasons), **2x WCU** |
| `Query` | 1MB page | Range lookup by key condition | `LastEvaluatedKey` |
| `Scan` | 1MB page | Full sweep | `LastEvaluatedKey` |

```python
import time, random
from botocore.exceptions import ClientError

def batch_write_all(dynamodb, table_name: str, items: list) -> None:
    """Write in chunks of 25, retrying unprocessed items with exponential backoff."""
    for i in range(0, len(items), 25):
        request = {
            table_name: [{"PutRequest": {"Item": it}} for it in items[i:i + 25]]
        }
        attempt = 0
        while request:
            response = dynamodb.batch_write_item(RequestItems=request)
            request = response.get("UnprocessedItems") or {}   # ← if you discard this, data disappears

            if request:
                attempt += 1
                if attempt > 8:
                    raise RuntimeError(f"batch write gave up: {len(request[table_name])} items left")
                # Exponential backoff + jitter: keeps retries from piling up at once and getting throttled again
                time.sleep(min(2 ** attempt * 0.05, 5) * (0.5 + random.random()))
```

A non-empty `UnprocessedItems` is **not an error but the normal expression of throttling**. Since no exception is thrown, code with only a `try/except` leaks items without any warning. This is exactly the number-one cause of the report "I batch-uploaded but a few records are missing."

| Error/signal | Meaning | Prescription |
|----------|-----|------|
| `ProvisionedThroughputExceededException` | Capacity exceeded | Retry with exponential backoff, check capacity and key design |
| `UnprocessedItems` / `UnprocessedKeys` (non-empty) | Partial throttle | **You must retry** (not an exception) |
| `ConditionalCheckFailedException` | Condition not met | Re-read and retry (a designed signal) |
| `TransactionCanceledException` | Transaction canceled | Check which item tripped it with `CancellationReasons` |
| `ValidationException` | Item over 400KB, missing key, reserved word | Check the request structure |
| `ItemCollectionSizeLimitExceededException` | LSI item collection over 10GB | Redesign with a GSI instead of an LSI |
| `IteratorAge` metric rising | Streams consumption is falling behind | Check parallelization, batch size, function performance |

The reason to mix **jitter (random wobble)** into exponential backoff is to break **synchronized retries (thundering herd)**. If hundreds of clients that hit a throttle retry at exactly the same interval, the load gathers again at that moment, throttling happens again, and this oscillation continues. Adding randomness to the wait time scatters retries across the time axis so the system can get out on its own. The AWS SDK has this strategy built in by default, so you only need to care when writing your own retry loop — which is also why an option like "turn off the SDK's default retries and write your own" rarely shows up on the exam.

## The Moment DAX Gives a Stale Value

DAX's Write-Through updates the cache "**only when the write went through DAX**." Miss this premise and you run into stale data of unknown cause.

```
[Normal path]                          [Path where the cache falls behind]
App → DAX → DynamoDB                  Another service → DynamoDB (bypassing DAX)
      └ cache updated ✅                         └ DAX doesn't know about this change ❌
                                              New value only after the TTL (default 5 min) passes

  e.g.) a batch job, Lambda, or the console modifies the table directly
     → an app using DAX sees the old value for up to the TTL
```

There are three prescriptions for this situation.

- Unify the path so that **all writes go through DAX**.
- For reads that absolutely need freshness, request with `ConsistentRead: true` to bypass the cache (giving up DAX's performance gain in return).
- Shorten the TTL to a level the business can tolerate.

Either way, the expectation "I attached DAX, so it's automatically always up to date" does not hold.

The reason DAX insists on its **own SDK** is that the client needs to know the cluster topology. The DAX SDK receives the cluster's node list, spreads reads across the read replicas, sends writes to the primary, and updates the list when a node is replaced. The API signatures are the same as DynamoDB's so there is almost no code change, but **the connection layer is a completely different thing**. That is why DAX is accessible only inside a VPC (an ENI is attached to the cluster nodes), and to use it from Lambda, that Lambda must also be placed in the same VPC — a good share of "I attached DAX but Lambda times out" is this missing VPC configuration.

## Where Streams Consumption Gets Stuck: The Poison Pill

The most painful failure in the Streams + Lambda combination is **shard blocking**. To guarantee order, a failed batch can't be skipped, so if one record keeps failing, every record behind it on that shard stops.

```
Shard 1: [R1][R2][R3 (always fails)][R4][R5][R6] ...
                    ▲
                    └ keeps retrying here → everything after R4 is never processed
                      CloudWatch's IteratorAge keeps rising = the signal of this state
```

The event source mapping's settings are, in effect, all handles for dealing with this problem.

| Setting | What it does | When to use |
|------|--------|----------|
| `BisectBatchOnFunctionError` | Splits the failed batch in half and retries | To narrow down which record in the batch is the problem |
| `MaximumRetryAttempts` | Upper limit on retries | Prevents the shard from being blocked by endless retries |
| `MaximumRecordAgeInSeconds` | Discards records that are too old | Real-time processing where backlogged data becomes meaningless |
| `DestinationConfig` (failure destination) | Sends info on the abandoned batch to SQS/SNS | Isolate it for a human to investigate later |
| `ParallelizationFactor` | Up to 10 Lambdas per shard | Throughput rises but ordering guarantees get more complicated |
| `BatchSize` | Number of records passed at once | Balance between throughput and failure blast radius |

As a hypothetical case, a pipeline that was updating a search index from an orders table's Streams stalled when the indexing library threw an exception because of a product name containing a Unicode emoji. The function kept failing on that record, and while tens of thousands of records behind it waited wholesale to preserve order, the search results froze in their old state for several hours. The only signal in the metrics was the monotonic rise of `IteratorAge` — because the error rate was low (only the same single record failing) and the invocation count also looked normal. The prescription afterward is textbook: **set the point of giving up with `MaximumRetryAttempts`, isolate failed batches into SQS with `DestinationConfig`, and set an alarm on `IteratorAge`.** And the handler was changed to wrap individual records in `try/except` to distinguish "unprocessable data" from "transient failure." If you must pick just one metric to alarm on in stream processing, the answer is `IteratorAge`.

Today's key point — RCU/WCU math is tested as calculation problems. Rather than memorizing the formulas, solve them with the principle "reads are based on 4KB, writes on 1KB, round up with ceil." DAX is a transparent cache that cuts DynamoDB reads to μs, and Streams is a change log that retains every change for 24 hours.

## Wrap-Up

Most DynamoDB costs and failures are born in **the gap between "the capacity I configured" and "the partition that actually takes the load."** The calculation ends in three words — reads 4KB, writes 1KB, round up — but for that calculation to hold, traffic must be spread evenly across partitions. DAX is a cache that absorbs that gap up front, yet it can't see writes that bypassed DAX, and Streams leaves every change in order for 24 hours, yet a single failed record can block a shard. All three topics deal with the same shape of problem — **"the average is fine but one spot blows up"** — and that is exactly the spot the exam asks about.

## 📝 Practice Questions

**Question 1.** In DynamoDB, a 7KB item is read 30 times per second with strong consistency. What provisioned RCU is needed?

A) 30 RCU
B) 60 RCU
C) 90 RCU
D) 120 RCU

**Answer: B**
Explanation: Strongly consistent RCU = ceil(item size / 4KB) × 1 × requests per second. ceil(7/4) = ceil(1.75) = 2. 2 × 1 × 30 = 60 RCU. With eventual consistency it would have been 30 RCU (half). With transactional reads it would have been 120 RCU (double). If the item had been 8KB, ceil(8/4)=2 is the same, but at 9KB, ceil(9/4)=3, giving 90 RCU.

---

**Question 2.** In DynamoDB, a 3.5KB item is written with transactional writes 20 times per second. What WCU is needed?

A) 20 WCU
B) 80 WCU
C) 140 WCU
D) 160 WCU

**Answer: D**
Explanation: A transactional write consumes twice the WCUs of a standard write. Required WCU = ceil(item size / 1KB) × 2 × requests per second = ceil(3.5) × 2 × 20 = 4 × 2 × 20 = 160 WCU. With standard writes it would be 4 × 1 × 20 = 80 WCU, so 80 WCU (option B) is the trap of missing the 2× transactional cost, and 140 WCU (option C) cannot be produced by any calculation.

---

**Question 3.** When using DAX, how is a strongly consistent read request handled?

A) It is returned immediately from the DAX cache
B) DAX queries DynamoDB directly and returns the latest data
C) An error occurs (DAX does not support strong consistency)
D) It is automatically converted to eventual consistency and returned from the cache

**Answer: B**
Explanation: DAX does not serve strongly consistent read requests from the cache. A read set with `ConsistentRead: true` passes through DAX and is queried directly against DynamoDB. This is because the cache can't guarantee the latest data — if you read before a recent write is reflected in the cache, it could return stale data. The downside is that when strong consistency is needed, you don't get DAX's performance benefit.

---

**Question 4.** When integrating DynamoDB Streams with Lambda, how is ordering guaranteed?

A) The order of all events is guaranteed at the whole-table level
B) Event order is guaranteed per partition key
C) There is no ordering guarantee at all
D) The order Lambda processes in is unrelated to the DynamoDB event order

**Answer: B**
Explanation: DynamoDB Streams guarantees event order per partition key. Changes to the same partition key (the same item) are recorded in the Stream shard in the order they occurred, and Lambda processes them in that order. But the order between events for different partition keys is not guaranteed. There is no global ordering guarantee at the whole-table level. This is why, in data processing through Streams, state must be managed per partition key.

---

**Question 5.** You need to retain and analyze DynamoDB change history for 2 years. What is the most suitable architecture?

A) DynamoDB Streams + Lambda storing directly to S3
B) DynamoDB Kinesis Data Streams integration → Kinesis Firehose → S3
C) Retain 35 days of backups with DynamoDB PITR
D) Create a DynamoDB On-Demand Backup manually every day

**Answer: B**
Explanation: DynamoDB Streams retains only 24 hours, so it is unsuitable for 2-year retention. Kinesis Data Streams can retain up to 365 days, but that isn't enough for 2 years. However, if you store permanently to S3 through Kinesis Firehose, retention of 2 years or more is possible. Connect the DynamoDB table directly to Kinesis Data Streams, and Kinesis Firehose stores to S3 in batches. PITR has a 35-day limit, and On-Demand Backup is not suitable for analysis.

---

**Question 6.** Right after switching a DynamoDB table to on-demand mode, traffic suddenly increases 20x. What happens?

A) On-demand scales infinitely, so it is handled without any problem
B) Throttling occurs — on-demand can respond immediately only up to 2x the previous peak
C) It automatically switches to provisioned mode
D) It is handled without errors but billed 20x the cost

**Answer: B**
Explanation: On-demand mode is not "infinite scaling." It responds immediately only up to 2x the traffic peak previously handled. If the table is new or had low traffic for a long time, it starts from the minimum, so throttling occurs in a sudden traffic surge. To prevent this, either ① handle enough traffic in provisioned mode and then switch to on-demand, or ② scale gradually with Auto Scaling in provisioned mode.

---
