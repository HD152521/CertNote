# Day 2 - Ingestion Reliability: Idempotency, Ordering, Retries, Deduplication, DLQ

In distributed systems, "messages arrive exactly once" is nearly a fantasy. Networks fail, nodes die, responses get lost. If a producer sends a message but doesn't receive an ACK, it doesn't know if it arrived. Resend and duplicates appear; don't resend and loss happens. This dilemma is the starting point of ingestion reliability.

Realistic distributed systems mostly guarantee **At-least-once**. "Better duplicates than loss" is the choice. Then who handles duplicates? The answer: **consumers implement idempotency**. Today we cover five axes of reliability — idempotency, ordering, retries, deduplication, DLQ.

## Three Delivery Guarantee Levels: What to Choose

| Guarantee | Meaning | Cost/Complexity | Example |
|-----------|---------|-------------|---------|
| At-most-once | Max one delivery, loss possible | Simplest | Unreliable UDP |
| At-least-once | Min one delivery, duplicates possible | Medium | SQS Standard, Kinesis |
| Exactly-once | Exactly one delivery | Most expensive | SQS FIFO (limited scope), Flink (stateful) |

True end-to-end exactly-once is expensive. Usually "at-least-once delivery + idempotent consumer" achieves the same effect, called **effectively-once**. On exams, "ensure data integrity amid duplicates" is almost always "implement idempotency."

> 💡 **Related theory**: "Exactly-once delivery is impossible, but exactly-once processing is possible" is a classic distributed systems insight. Delivery depends on the network (uncontrollable), but processing result idempotency is in your hands (controllable). So shift design weight from "make delivery perfect" to "make duplicate processing safe."

## Idempotency: Same Request, Same Result

Idempotency means "performing the same operation once or many times yields the same result." `SET x = 5` is idempotent; `x = x + 1` is not. Standard pattern in ingestion pipelines: **unique ID + duplication check**.

```python
# DynamoDB conditional write implements idempotency
def process_event(event):
    event_id = event["eventId"]   # Producer-assigned unique ID
    try:
        dynamodb.put_item(
            TableName="processed_events",
            Item={"eventId": {"S": event_id}, "ts": {"N": str(time.time())}},
            ConditionExpression="attribute_not_exists(eventId)"  # Fail if exists
        )
    except dynamodb.exceptions.ConditionalCheckFailedException:
        return  # Already processed — silently ignore (idempotent)
    handle_business_logic(event)  # Only first-time events run actual logic
```

Key: "record whether processed atomically." DynamoDB conditional write (`attribute_not_exists`) guarantees this in one atomic operation. Duplicates are filtered at the condition check, so business logic never runs twice.

> 🔍 **Going deeper**: The idempotency key must come from the producer. If the consumer generates it as "content hash," it can't distinguish intentional duplicates (same amount charged twice) from accidental retransmission. This is why API Gateway and payment systems require an `Idempotency-Key` header. Key provenance is where reliability begins.

## Ordering: To What Extent and at What Granularity

"Process in order" is often misunderstood. Global ordering severely cuts throughput in distributed systems. Most systems guarantee only **partition-level or group-level order**.

| Service | Order Guarantee Scope |
|--------|----------------------|
| Kinesis Data Streams | Within shard — same partition key → same shard |
| SQS FIFO | Per MessageGroupId |
| SQS Standard | None (best-effort) |
| Kafka (MSK) | Within partition |

```python
# Kinesis: same user's events to same shard → per-user order
kinesis.put_record(
    StreamName="user-events",
    Data=json.dumps(event),
    PartitionKey=event["userId"]   # Same userId → same shard → order preserved
)
```

```python
# SQS FIFO: group-level order + 5-min dedup window
sqs.send_message(
    QueueUrl=fifo_url,
    MessageBody=json.dumps(order),
    MessageGroupId=order["accountId"],          # Per-account order
    MessageDeduplicationId=order["orderId"]     # Auto-dedup within 5 min
)
```

Key: determine "what unit actually needs order?" If "per-user event order," use userId as partition key/group ID. Global order is rarely needed.

> ⚠️ **Pitfall**: If partition key distribution skews to one side (hot shard) in Kinesis, one shard overloads. Pinning same key to same shard for order conflicts with load distribution. If you make the ordering unit too large (single key for all), parallelism collapses.

## Retries: Backoff, Jitter, and Visibility Timeout

Retries are the first line of defense against transient failures. But naive immediate retries pile load on a failing system (thundering herd). So **exponential backoff + jitter** is standard.

```python
# Exponential backoff + full jitter
import random
def retry_with_backoff(fn, max_attempts=5):
    for attempt in range(max_attempts):
        try:
            return fn()
        except TransientError:
            if attempt == max_attempts - 1:
                raise
            base = min(2 ** attempt, 30)       # 1,2,4,8,16... max 30 sec
            delay = random.uniform(0, base)    # Full jitter: spread simultaneous retries
            time.sleep(delay)
```

In SQS, **visibility timeout** naturally implements retries. A consumer who receives a message but doesn't delete it within the timeout sees it reappear in the queue for another consumer to retry. If processing takes longer than visibility timeout, the same message gets processed twice simultaneously — a disaster.

> 💡 **Related theory**: Jitter was formalized in AWS Architecture Blog "Exponential Backoff And Jitter" (2015). Backoff alone causes all clients to retry simultaneously at 1sec, 2sec, 4sec, etc., creating load waves (thundering herd). Random jitter spreads retries across time, helping the system recover. "Full jitter (random 0~base)" is generally most effective.

## Deduplication: Dedup Window Limits

SQS FIFO auto-deduplicates with `MessageDeduplicationId` within a **5-minute window**. Same ID twice within 5 min, second is silently dropped. But after 5 min, the same ID reappearing isn't deduplicated — it's outside the window.

This limit means "long-term idempotency" needs more than SQS dedup. The DynamoDB-based idempotency table we saw earlier is complementary.

| Method | Scope | Advantage | Limit |
|--------|-------|-----------|-------|
| SQS FIFO dedup | 5-min window | Auto-managed | Can't prevent duplicates outside window |
| DynamoDB idempotency table | TTL-defined duration | Arbitrary time, business-controlled | Manual implementation needed |

## DLQ: Isolating Poison Messages

Some messages never succeed despite retries — format corrupted or **poison messages** that fail forever. Retrying endlessly blocks the queue and delays normal messages. **Dead-Letter Queue (DLQ)** isolates messages that fail after a threshold.

```json
{
  "RedrivePolicy": {
    "deadLetterTargetArn": "arn:aws:sqs:...:orders-dlq",
    "maxReceiveCount": 5
  }
}
```

`maxReceiveCount: 5` means "after 5 receive/process-attempt failures, send to DLQ." Messages in DLQ don't vanish. Set alarms, analyze, fix code, and **redrive** back to original queue for reprocessing.

> 🎯 **Scenario**: Order-processing Lambda occasionally fails indefinitely on certain messages. Diagnosis flow: (1) Attach DLQ to SQS, set `maxReceiveCount=5` → (2) CloudWatch alarm on DLQ depth → (3) Inspect DLQ, discover corrupted field/schema violation → (4) Add validation/exception handling to consumer code → (5) Redrive from DLQ. Isolating poison messages from normal queue is critical.

> 🔍 **Going deeper**: DLQ conceptually exists for Kinesis too. When Lambda fails processing Kinesis records, specify `OnFailure` destination (SQS/SNS) to send failed record metadata. Also `BisectBatchOnFunctionError` bisects failed batches to isolate poison records. Streams and queues differ mechanically but share "failure isolation" philosophy.

## Summary: Reliability Through Combination

Today's five axes don't operate independently. **At-least-once delivery** plus **retries (backoff+jitter)** absorb transient failures; **idempotency** makes duplicates harmless; **ordering** guaranteed at needed granularity; **DLQ** isolates permanent failures. None alone completes reliability — all together they do. Tomorrow we move to CDC and DMS for replicating running databases' changes in real-time without downtime.

---

## 📝 Practice Problems

**Problem 1.** A payment API may send the same request twice due to network timeout. Best way to prevent duplicate charges?

A) Producer-assigned unique idempotency key checked with DynamoDB conditional write, processing guaranteed once  
B) Process requests as fast as possible to avoid timeouts  
C) Route through SQS Standard to ensure order  
D) Confirm with email after charging  

**Answer: A**  
Explanation: Duplicate delivery in distributed systems is hard to prevent, so idempotent consumers are key. Producer-assigned idempotency key + DynamoDB conditional check (`attribute_not_exists`) atomically ensures duplicate keys don't trigger real charge logic. Key must be producer-assigned, not content-hash, to distinguish intentional from accidental duplicates.

---

**Problem 2.** In Kinesis Data Streams, "same-user events must process in order." How to guarantee?

A) Route all events to single shard  
B) Assign random partition key per event  
C) Switch to SQS Standard  
D) Set PartitionKey to userId so same user events go to same shard  

**Answer: D**  
Explanation: Kinesis guarantees order within shards, and same partition key routes to same shard. Using userId ensures per-user order while distributing load across shards. Single shard guarantees order but kills throughput. Random keys break order.

---

**Problem 3.** SQS Standard queue: consumer takes avg 90 seconds to process but visibility timeout is 30 seconds. What happens?

A) Messages are lost  
B) Message reappears while processing; another consumer duplicates it  
C) Queue auto-switches to FIFO  
D) DLQ deactivates  

**Answer: B**  
Explanation: Visibility timeout (30s) shorter than actual processing time (90s) means message reappears in queue mid-process, causing another consumer to duplicate processing. Set visibility timeout longer than max processing time (with buffer), or extend with `ChangeMessageVisibility` during processing.

---

**Problem 4.** Multiple clients retry simultaneously against a failing downstream, load waves form. Standard technique to mitigate?

A) Immediate unlimited retries  
B) Fixed 1-second interval retries  
C) Exponential backoff + random jitter  
D) Disable retries completely  

**Answer: C**  
Explanation: Backoff alone makes all clients retry simultaneously at same times (1sec, 2sec, 4sec...) creating waves (thundering herd). Random jitter spreads retries across time, helping recovery. Fixed interval doesn't solve concurrency.

---

**Problem 5.** A message permanently fails due to format error, blocking normal message processing. Best response?

A) Delete and recreate queue  
B) Configure DLQ with maxReceiveCount, isolate failures, fix root cause, redrive  
C) Set visibility timeout to 0  
D) Delete all messages  

**Answer: B**  
Explanation: Permanent failures must be isolated to DLQ so normal queue doesn't block. Set `maxReceiveCount` threshold, alarm on DLQ depth, fix root cause (schema, validation), redrive from DLQ. Deleting queue or all messages loses data.

---
