# Day 2 - Kinesis Data Streams: Shards, Partition Keys, and Throughput

## 📌 Key Takeaways

- A stream = a collection of shards. Throughput in provisioned mode = number of shards × (write 1 MB/s or 1,000 records/s, read 2 MB/s).
- The hash of the partition key decides the shard, and the same key is ordered within the same shard. Use an evenly distributed key to avoid **hot shards**.
- Producers are PutRecords, KPL, and the Agent; consumers are KCL and Lambda. When there are several consumers and each needs full bandwidth, use **enhanced fan-out**.
- Within the retention period (24 hours by default, up to 365 days), reprocessing and independent consumption by multiple consumers are possible. This is the decisive difference from SQS.
- If traffic is predictable, use provisioned; if it fluctuates widely, use on-demand. Even on-demand cannot fix skew where a single partition key exceeds the shard limit.

## A Stream Is a Collection of Shards

Yesterday's batch ingestion was "collect then process all at once." Starting today we enter the opposite world: streaming. Clickstreams, IoT sensors, payment transactions, and game telemetry are situations where data flows in endlessly and must be processed within seconds. At the heart of this is **Amazon Kinesis Data Streams (KDS)**.

KDS is, in one sentence, a "scalable real-time data pipe." Many producers push data into it, and many consumers read it away almost simultaneously. Today we look at this pipe's internal structure (shards), the partition key that decides which slot a record goes into, and throughput calculations.

A KDS stream is not one giant tank but is divided into several lanes called **shards**. A shard is the basic unit of throughput and the unit of parallelism. Each shard has a fixed capacity.

```
Capacity of one shard:
- Write (input): 1 MB/s  or  1,000 records/s
- Read (output): 2 MB/s  (shared throughput basis)
```

So the stream's total throughput = number of shards × capacity per shard. If you need to write 5 MB per second, you need at least 5 shards. When you add shards (resharding), throughput increases proportionally.

```python
import boto3
kinesis = boto3.client("kinesis")

kinesis.create_stream(StreamName="clickstream", ShardCount=5)

# When traffic grows, expand throughput by splitting shards
kinesis.update_shard_count(
    StreamName="clickstream",
    TargetShardCount=10,
    ScalingType="UNIFORM_SCALING"
)
```

> 💡 **Related theory**: KDS has two capacity modes. **Provisioned mode** has you specify the number of shards directly, you are billed for that many, and you must do the throughput calculation yourself. **On-demand mode** adjusts shards automatically with traffic (in most Regions it scales automatically up to 200 MB/s and 200,000 records/s of writes, and some Regions have a higher ceiling) and bills by usage. If traffic is predictable and stable, Provisioned is cheaper; if it varies widely or is hard to predict, On-demand removes the operational burden. This trade-off becomes a judgment criterion in scenario questions.

## Partition Key: Which Shard Does a Record Go Into?

When a producer sends a record, it must also specify a **partition key**. KDS hashes this key with MD5 to decide which shard to send it to. Records with the same partition key always go to the same shard, and **ordering is guaranteed within a shard.**

```python
# User ID as the partition key → events of the same user go to the same shard, order guaranteed
kinesis.put_record(
    StreamName="clickstream",
    Data=b'{"event":"page_view","page":"/checkout"}',
    PartitionKey="user-8821"          # this key decides the shard
)
```

The key trap here is the **hot shard (hot partition)**. If the partition key distribution is uneven, traffic piles onto particular shards, and those shards get throttled with `ProvisionedThroughputExceededException` while the other shards sit idle. For example, if you set the partition key to "country," when most traffic is concentrated on one country, only one shard blows up.

To avoid hot shards, choose a partition key with high cardinality and an even distribution. Keys with many, uniformly distributed values such as user_id, device_id, and session_id are good, while keys with few, skewed values such as country, region, and status are bad. However, because of the property "same key = ordering guaranteed," there is a trade-off: the unit where ordering matters (for example, event order per user) has to be the partition key. The balance between distribution and ordering guarantee is the design point.

## Producers and Consumers

A **producer** is the side that puts data into the stream. There are several options.

```
- PutRecord / PutRecords API (direct SDK calls)
- KPL (Kinesis Producer Library): high throughput through automatic batching, aggregation, and retries
- Kinesis Agent: automatically sends log files to the stream
```

A **consumer** is the side that reads data from the stream. There are two ways to read.

| Method | Throughput | Latency | Characteristics |
|------|--------|------|------|
| Shared throughput (Shared / classic) | All consumers split 2 MB/s per shard | Polling (GetRecords) | Consumers compete as they increase |
| Enhanced fan-out | Dedicated 2 MB/s per shard for each consumer | push, ~70 ms | Independent bandwidth per consumer |

If there are several consumers and each needs full bandwidth, use enhanced fan-out. Consumer-side processing is usually handled by **KCL (Kinesis Client Library)**, which automatically manages shard distribution, checkpoints (where you have read up to), and failure recovery, or serverlessly through a **Lambda event source mapping**.

```python
# Lambda as a KDS consumer: records arrive in batches per shard
import base64, json

def handler(event, context):
    for record in event["Records"]:
        payload = base64.b64decode(record["kinesis"]["data"])
        data = json.loads(payload)
        # processing logic...
    return {"processed": len(event["Records"])}
```

## Data Retention and Reprocessing

KDS does not discard data immediately but keeps it for the **retention period**. The default is 24 hours, and it can be extended up to 365 days. Thanks to this, even if a consumer dies briefly and comes back, it can read the data it missed, and within the retention period several consumers can independently reprocess the same data.

The retention period is the decisive difference between KDS and a simple message queue (SQS, where messages disappear once consumed). KDS is closer to an append-only log, so "fan-out" consumption is possible, in which several consumers read the same stream independently from their own positions (checkpoints). The pattern of fixing a bug in the processing logic and then replaying data within the retention period from the beginning for reprocessing comes from here. Such reprocessing and multi-consumer fan-out are not the default behavior of SQS.

## Calculating the Number of Shards by Hand

The number of shards in provisioned mode is determined by **the larger of the write and read requirements**. The formula AWS presents is as follows.

```
Write bandwidth (KB/s) = average record size (KB, rounded up) × records per second
Read bandwidth (KB/s)  = write bandwidth × number of consumers        ← for shared throughput consumers
Number of shards = ceil( max( write bandwidth / 1024 , read bandwidth / 2048 ) )
```

On top of this, you must separately check the count limit of "1,000 records per second per shard." If records are small, the count fills up before the bytes do.

| Situation | Write (bytes) | Write (count) | Read | Shards needed |
|------|------|------|------|------|
| 2 KB × 3,000 records/s, 1 consumer | 6,000 KB/s → 6 | 3,000 records → 3 | 6,000/2048 → 3 | **6** |
| 2 KB × 3,000 records/s, 3 shared consumers | 6 | 3 | 18,000/2048 → 9 | **9** |
| 0.2 KB × 9,000 records/s, 1 consumer | actual 1,800 KB/s → 2 | 9,000 records → 9 | 1 | **9** |

- The third row shows why the formula **rounds up** the average record size to a 1 KB unit. Rounding 0.2 KB up to 1 KB gives 9,000 KB/s, which yields the same answer as the count limit (9 shards).
- The second row is the point people often miss. Writes are fine with 6 shards, but **the read side triples**, so 9 shards are needed. In that case, instead of adding shards, switching the consumers to enhanced fan-out removes the read term and brings it back to 6 shards.
- The third row is the small-record trap. In this case, putting several small records into one KDS record with KPL **aggregation** gets you out from under the count limit.

## Read-Side Limits and What Enhanced Fan-Out Really Is

A shared throughput consumer **pulls** with `GetRecords`. This API itself has limits.

| Item | Shared throughput | Enhanced fan-out (EFO) |
|------|------|------|
| Delivery method | Polling `GetRecords` over HTTP | `SubscribeToShard` over HTTP/2, KDS pushes records |
| Read throughput | All consumers split a total of 2 MB/s per shard | Up to 2 MB/s per shard dedicated to each registered consumer |
| API limit | 5 calls per second per shard, up to 10 MB and 10,000 records per call | Not applicable, since there is no polling |
| Propagation delay | About 200 ms on average with 1 consumer, about 1,000 ms with 5 | About 70 ms on average regardless of the number of consumers |
| Consumers per stream | No limit, but they slow each other as they increase | Up to 20 registered consumers per stream |
| Extra cost | None | Consumer-shard hours + amount of data read |

- There are two reasons shared throughput slows down as consumers increase. They split the 2 MB/s, and they also split the call count of **5 per second per shard**. With 5 consumers, each can poll only about once per second, so the delay approaches 1 second.
- If a single `GetRecords` takes 10 MB, calls on the same shard are throttled for the next 5 seconds. This is because it has effectively borrowed 5 seconds' worth of the shard's 2 MB/s read limit in advance.
- EFO is not free. If "there are one or two consumers and a 200 ms delay is acceptable," shared throughput is cheaper. It is EFO only when the stem says "several applications each" together with "minimize latency."
- Consumers built with KCL 2.x or later are configured to use EFO by default. This is where unintended EFO charges come from.

## How On-Demand Mode Actually Scales

Even though it is called "automatic scaling," it does not grow instantly without limit.

- A new on-demand stream starts with a capacity of **4 MB/s write and 8 MB/s read**.
- The stream keeps capacity so that it can absorb up to **twice the write peak observed over the last 30 days**. If the peak was 40 MB/s, it takes up to 80 MB/s right away.
- If traffic jumps to **more than twice the previous peak within 15 minutes**, write throttling can occur. A surge just before an announced big event falls into this. Producers must retry.
- The ceiling differs by Region. Most Regions go up to 200 MB/s write and 400 MB/s read, some large Regions are much higher, and an increase can also be requested.
- When traffic grows, on-demand splits shards **evenly**. It does not pick out and isolate traffic concentrated on a particular hash key. So **if a single partition key exceeds the shard limit (1 MB/s, 1,000 records/s), it is throttled even in on-demand.** A choice saying "switching to on-demand fixes the hot shard" is wrong when key skew is the cause.
- Switching between provisioned and on-demand is allowed up to 2 times per 24 hours per stream, and reads and writes continue during the switch.

| Criterion | Provisioned | On-demand |
|------|------|------|
| Billing | Number of shards × hours (+ PUT units) | Amount of data written and read (GB) |
| Capacity management | Calculate yourself, reshard yourself | Managed by the service |
| Favorable traffic | Steady and predictable | Widely varying and unpredictable, new workloads |
| Fine control of shards | Can pick and split specific shards | Not possible |

## Resharding: What Happens in Splits and Merges

- Resharding always happens **in twos**. A split makes one shard into two, and a merge makes two adjacent shards into one. `UpdateShardCount` performs this process for you to match the target shard count (provisioned mode only).
- The original shards that are targeted are called **parents**, and the newly created shards are called **children**. A parent shard is closed and no longer accepts writes, but the data in it can be read until the retention period ends.
- To preserve ordering, you must **read the parent shard to the end before reading the child shards**. KCL records the parent-child relationship in the lease table and follows this order automatically. If you build a consumer directly against the API, you must handle this yourself.
- Provisioned mode bills per shard, so a split raises cost and a merge lowers it. If you do not merge after the peak has passed, you keep paying for empty shards.

```bash
# Pick only a particular hot shard and split it in half (provisioned mode)
aws kinesis split-shard \
  --stream-name clickstream \
  --shard-to-split shardId-000000000003 \
  --new-starting-hash-key 170141183460469231731687303715884105728

# Merge two adjacent idle shards
aws kinesis merge-shards \
  --stream-name clickstream \
  --shard-to-merge shardId-000000000005 \
  --adjacent-shard-to-merge shardId-000000000006
```

> ⚠️ **Trap**: If the cause of the hot shard is "traffic piled on a single key," no matter how much you split shards, that key still goes to one shard. Splitting works only when "several keys happen to be piled into the same hash range." If a single key is the problem, you must change the key design (for example, `user_id#random suffix` instead of `user_id`. However, you give up ordering for that user).

## Easy-to-Miss Points on the Producer Side

| Item | Details |
|------|------|
| `PutRecord` | Sends one record at a time. Receives a sequence number in the response |
| `PutRecords` | Up to 500 records per request. **Only some may fail**, and even if one record fails, the following records continue to be processed |
| Handling partial failure | Even if HTTP 200 comes back, you must check `FailedRecordCount` in the response and resend only the failed records |
| Ordering | `PutRecords` does not guarantee the order of records within a request. If strict ordering is needed, use `PutRecord` to the same shard |
| KPL aggregation | Packs several small user records into one KDS record to get around the limit of 1,000 records per second |
| KPL collection | Bundles several KDS records into a single `PutRecords` call to reduce the number of HTTP requests |
| Record size | There is an upper limit on the payload size before base64 encoding. It was 1 MB for a long time and now allows up to 10 MiB for occasional large records. The shard's sustained write limit is still 1 MB/s |

- Code that does not check the `PutRecords` response **silently loses** throttled records. It is a common cause of the symptom "data goes missing intermittently + there are no exception logs."
- A record aggregated with KPL must be **unpacked by the reader**. KCL unpacks it automatically, but a consumer that does not know about aggregation (for example, Redshift streaming ingestion) receives the packed binary as is. Depending on the consumer type, you may need to turn aggregation off.
- KPL collects records before sending, so there is delay equal to the buffering. If per-record latency matters more, send directly with the SDK.

## Failure Handling When Lambda Is the Consumer

A Lambda event source mapping hands over batches in order for each shard. If you do not know the default settings, **a single poison record stops the entire shard.**

| Setting | Default | Meaning |
|------|------|------|
| `BatchSize` | 100 (max 10,000) | Number of records passed in one invocation |
| `MaximumBatchingWindowInSeconds` | 0 | Time to wait to fill the batch |
| `MaximumRetryAttempts` | -1 (infinite) | Retries the failed batch until the records expire |
| `MaximumRecordAgeInSeconds` | -1 (infinite) | Records older than this are skipped |
| `BisectBatchOnFunctionError` | false | On failure, splits the batch in half to narrow down the problem record |
| `ParallelizationFactor` | 1 (max 10) | Number of batches processed concurrently for one shard. Ordering per partition key is preserved |
| `DestinationConfig` | None | Sends information about the abandoned batch to SQS or SNS |
| `StartingPosition` | Required | `TRIM_HORIZON` (from the oldest) / `LATEST` / `AT_TIMESTAMP` |

- If the function returns an error, Lambda **does not move on to the next record** of that shard but retries the same batch. With the default (infinite retries), one uninterpretable record blocks the shard until the retention period ends.
- The standard combination is `BisectBatchOnFunctionError=true` + a retry count limit + a failure destination (SQS/SNS). It isolates only the problem record and lets the rest flow.
- Because of retries, the same record can be received twice. Write the function to be idempotent.
- If processing falls behind, add shards or raise `ParallelizationFactor`. When shards increase, the number of batches running concurrently also increases.

## Reading Symptoms from Metrics

| CloudWatch metric | When it rises | Where to look |
|------|------|------|
| `WriteProvisionedThroughputExceeded` | Write throttling | Whether shards are insufficient or a particular shard is skewed (shard-level enhanced monitoring) |
| `ReadProvisionedThroughputExceeded` | Read throttling | Too many shared throughput consumers → EFO or add shards |
| `GetRecords.IteratorAgeMilliseconds` | The consumer is falling behind | Consumer processing speed, retry stalls caused by errors |
| Lambda `IteratorAge` | The function cannot keep up with the stream | Batch size, parallelization factor, function errors |
| `IncomingBytes` / `IncomingRecords` | Inflow trend | The basis for recalculating the number of shards |

- If the iterator age keeps growing and reaches the retention period, **data that was not read expires and disappears.** This is the path by which data loss actually happens in KDS. Set the alarm on iterator age before throttling.

## Stem Cue → Answer Decision Table

| Stem cue | Answer | Reason |
|------|------|------|
| "Only a particular shard is throttled, the rest are idle" | Improve the partition key distribution | Adding shards or on-demand cannot fix key skew |
| "Writes have headroom, but latency rose after adding consumers" | Enhanced fan-out | Competition for shared 2 MB/s and 5 calls per second |
| "Traffic cannot be predicted and we do not want to manage capacity" | On-demand mode | Shards managed automatically |
| "Traffic is steady and cost must be minimized" | Provisioned mode | A fixed number of shards is cheaper |
| "After the bug fix, reprocess the past 7 days of data" | Set the retention period to 7 days or more | The 24-hour default is not enough |
| "Records are very small and the per-second count is high" | KPL aggregation | Gets around the 1,000 records per second limit |
| "Lambda keeps failing on the same batch and processing stops" | Batch bisecting + retry limit + failure destination | Isolates the poison record |
| "Iterator age keeps increasing" | Increase consumer throughput (shards, parallelization factor) | Catch up before expiry |
| "Encrypt stored data" | Enable server-side encryption with a KMS key | A per-stream setting |

Tomorrow we cover Data Firehose, which flows a stream into S3 and Redshift without shards or consumer code.

## 📖 Glossary

- **Shard**: The basic unit of throughput that makes up a stream. Each shard has set write and read limits.
- **Partition key**: The value that decides which shard a record goes into. The same key always goes to the same shard.
- **Hot shard**: A phenomenon where a skewed key piles traffic onto a particular shard. Only that shard is throttled.
- **Throttle**: The service rejecting requests that exceed a limit. It appears as `ProvisionedThroughputExceededException`.
- **Resharding**: The operation of splitting or merging shards to change the stream's throughput.
- **Enhanced fan-out (EFO)**: A method that gives each consumer dedicated read bandwidth and pushes records to it.
- **KPL / KCL**: Libraries for producers and consumers. They handle batching and aggregation, and shard distribution and checkpoints, respectively.
- **Checkpoint**: The recorded position of how far a consumer has read. KCL stores it in a DynamoDB lease table.
- **Iterator age**: How long ago the record a consumer just read entered the stream. The larger it is, the further behind the consumer is.
- **Retention period**: How long the stream keeps records. Within it, they can be read again.

## 📝 Practice Problems

**Problem 1.** A single shard in a KDS stream continuously throws ProvisionedThroughputExceededException while other shards are nearly idle. What's the most likely cause?

A) Partition key distribution is skewed, creating a hot shard  
B) Retention period is too short  
C) Too many consumers  
D) Using On-demand mode  

**Answer: A**  
Explanation: A single throttled shard with idle peers is a textbook hot shard symptom — the partition key distribution is uneven and traffic is concentrated on one shard. Switch to a key with higher cardinality and even distribution. Retention period is unrelated to throttling, consumer count is a read-side issue, and On-demand mode would auto-scale to mitigate this.

---

**Problem 2.** You need to reliably ingest approximately 8MB/s and 6,000 records/s into KDS in Provisioned mode. What's the minimum shard count?

A) 6  
B) 8  
C) 2  
D) 10  

**Answer: B**  
Explanation: Per-shard write capacity is 1MB/s or 1,000 records/s, whichever is hit first. 8MB/s requires 8 shards, 6,000 records/s requires 6 shards, so you need the higher value: 8 shards to satisfy both. 6 undershoots the throughput limit, 2 far exceeds it, and 10 would work but isn't minimal.

---

**Problem 3.** Click events from the same user must be processed in the exact order they were generated. What KDS design guarantees this?

A) Use a random partition key for each record  
B) Pin shards to exactly 1  
C) Use user ID as the partition key  
D) Enable Enhanced Fan-Out  

**Answer: C**  
Explanation: KDS sends records with the same partition key to the same shard and guarantees shard order, so using user ID as the partition key preserves per-user order. Random keys scatter across shards, breaking order. One shard guarantees global order but caps throughput at 1MB/s, preventing scale. Enhanced Fan-Out is a read-bandwidth feature, unrelated to order.

---

**Problem 4.** Five separate consumer applications must each independently consume the same stream at full bandwidth with low latency. Which feature is appropriate?

A) Shared throughput (classic) GetRecords polling  
B) Pin shard count to 5  
C) Extend retention period to 365 days  
D) Enhanced Fan-Out  

**Answer: D**  
Explanation: Enhanced Fan-Out gives each consumer dedicated 2MB/s per shard over push delivery (~70ms latency), so consumers don't compete. Shared throughput divides shard's 2MB/s across consumers, slowing as consumer count grows. Retention period and shard count don't solve inter-consumer bandwidth contention.

---

**Problem 5.** You discovered a bug in consumer processing logic and want to reprocess the last 3 days of data from the beginning. Which KDS feature enables this?

A) Set retention period long enough and you can replay that time window  
B) Like SQS, records are deleted after consumption, making this impossible  
C) Changing partition keys auto-replays past data  
D) Resharding restores historical data  

**Answer: A**  
Explanation: KDS behaves like an append-only log, retaining data for the retention period (default 24h, max 365d), allowing consumers to replay from an earlier position (via sequence/timestamp) for reprocessing. To replay 3 days, you must have configured retention for 3+ days beforehand. Unlike SQS, consumed data doesn't vanish, and partition key changes or resharding are unrelated to replay.

---
