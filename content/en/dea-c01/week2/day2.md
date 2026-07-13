# Day 2 - Kinesis Data Streams: Shards, Partition Keys, and Throughput

Yesterday's batch ingestion was "collect then process all at once." Starting today we enter the opposite world — streaming. Clickstreams, IoT sensors, payment transactions, and game telemetry all represent data flowing endlessly in, needing sub-second processing. At the heart of this is **Amazon Kinesis Data Streams (KDS)**.

KDS is, in one sentence, a "scalable real-time data pipe." Many producers push data into it, many consumers read it away almost simultaneously. Today we examine the internals of this pipe (shards), how to decide which partition gets a record (partition keys), and throughput calculations.

## A Stream Is a Collection of Shards

A KDS stream isn't one giant bucket — it's divided into multiple lanes called **shards**. A shard is the fundamental unit of throughput and the unit of parallelism. Each shard has fixed capacity.

```
One shard's capacity:
- Write (input): 1 MB/s  or  1,000 records/s
- Read (output): 2 MB/s  (shared throughput basis)
```

So a stream's total throughput = number of shards × capacity per shard. If you need to write 5MB/s, you need at least 5 shards minimum. When you add shards (resharding), throughput scales proportionally.

```python
import boto3
kinesis = boto3.client("kinesis")

kinesis.create_stream(StreamName="clickstream", ShardCount=5)

# Scale throughput via shard splitting as traffic grows
kinesis.update_shard_count(
    StreamName="clickstream",
    TargetShardCount=10,
    ScalingType="UNIFORM_SCALING"
)
```

> 💡 **Related theory**: KDS has two capacity modes. **Provisioned mode** requires you to specify shard count, pay accordingly, and calculate throughput yourself. **On-demand mode** automatically adjusts shard count based on traffic (autoscaling up to 200MB/s and 200,000 records/s) and charges only for what you use. If traffic is predictable and stable, Provisioned is cheaper; if traffic is volatile or hard to forecast, On-demand eliminates operational burden. The exam often tests this trade-off.

## Partition Key: Which Shard Gets This Record?

When a producer sends a record, it must also specify a **partition key**. KDS MD5-hashes this key to decide which shard receives the record. Records with the same partition key always go to the same shard, and **order is guaranteed within that shard.**

```python
# Use user ID as partition key → same user's events go to same shard in order
kinesis.put_record(
    StreamName="clickstream",
    Data=b'{"event":"page_view","page":"/checkout"}',
    PartitionKey="user-8821"          # This key determines the shard
)
```

The critical pitfall here is the **hot shard (hot partition)**. If partition key distribution is uneven, traffic concentrates on one shard, causing that shard to hit `ProvisionedThroughputExceededException` while other shards sit idle. For example, using "country" as the partition key will blow out a single shard if most traffic is from one country.

> 💡 **Related theory**: To avoid hot shards, choose a partition key with high cardinality and even distribution. Keys like `user_id`, `device_id`, and `session_id` — with many values spread evenly — are good. Keys like `country`, `region`, and `status` — with few values and skewed distribution — are bad. However, there's a trade-off: "same key = order guaranteed" means you have to make partition keys out of units where order matters (e.g., per-user event order). Balancing distribution against order guarantees is the design challenge.

## Producers and Consumers

A **producer** is anything that pushes data into the stream. There are several options.

```
- PutRecord / PutRecords API (direct SDK calls)
- KPL (Kinesis Producer Library): auto-batching, aggregation, retries for high throughput
- Kinesis Agent: automatically sends log files to the stream
```

A **consumer** is anything that reads from the stream. There are two read patterns.

| Pattern | Throughput | Latency | Traits |
|--------|--------|------|------|
| Shared throughput (Shared / classic) | Shard's 2MB/s shared by all consumers | Polling (GetRecords) | Consumers compete |
| Enhanced Fan-Out | Per-consumer 2MB/s per shard | Push, ~70ms | Independent bandwidth per consumer |

If you have multiple consumers each needing full bandwidth, use Enhanced Fan-Out. Consumer-side processing is typically managed automatically with **KCL (Kinesis Client Library)** handling shard distribution, checkpointing (tracking progress), and failure recovery, or processed serverlessly via **Lambda event source mappings**.

```python
# Lambda as KDS consumer: batches of records arrive per shard
import base64, json

def handler(event, context):
    for record in event["Records"]:
        payload = base64.b64decode(record["kinesis"]["data"])
        data = json.loads(payload)
        # Processing logic...
    return {"processed": len(event["Records"])}
```

## Data Retention and Replay

KDS doesn't discard data immediately — it **retains it for a retention period**. Default is 24 hours, extendable to 365 days max. This means if a consumer dies and recovers, it can replay missed data, and within the retention window, multiple consumers can independently reprocess the same data.

> 💡 **Related theory**: Retention period is a decisive difference between KDS and a simple message queue (SQS, which discards after consumption). KDS is more like an append-only log, enabling "fan-out" consumption where multiple consumers independently read the same stream from their own positions (checkpoints). A common pattern is to fix a processing bug and replay all data within the retention window for reprocessing. SQS doesn't support multi-consumer fan-out or replay as a first-class pattern.

## Summary

- Stream = collection of shards. Throughput = number of shards × (write 1MB/s·1,000rec/s, read 2MB/s)
- Partition key determines shard and guarantees order within shard → use evenly distributed keys to avoid hot shards
- Producers: PutRecords/KPL/Agent; Consumers: KCL/Lambda; high bandwidth needs Enhanced Fan-Out
- Retention period (default 24h, max 365d) enables replay and multi-consumer consumption

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
