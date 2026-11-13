# Day 1 - SQS: How a Single Queue Decouples a System

The first wall you hit when designing a distributed system is the fact that "two components do not work at the same speed." The web server that takes orders can accept thousands of requests per second, but the processor that charges payments for those orders can only handle a few dozen per second. If you connect the two directly, the fast side crushes the slow side. A message queue puts a buffer between them and decouples the "sending side" from the "receiving side" in time. Amazon SQS turns this old idea into a "fully managed service where you do not have to operate the queue yourself," and it also carries the historical weight of being one of AWS's first publicly launched services.

In DVA-C02, SQS is the starting point of the messaging section. There are standalone questions (numbers such as visibility timeout and FIFO throughput), but it is also easy to test it through how-it-works scenarios such as "why Lambda processes a message twice," "where do you send messages that fail processing," and "why cost leaks when the queue is empty." This article covers why SQS chose the uncomfortable guarantee of "at-least-once delivery," how a temporary lock called the visibility timeout reduces duplicates without distributed consensus, and the fundamental reason standard queues and FIFO queues diverge.

## Where SQS Started: One of AWS's First Services

SQS was officially launched in 2006. Together with S3 (March 2006), it is **one of the oldest AWS services**, and the beta had been running since 2004. This is no accident. In the early 2000s, while Amazon was breaking a huge single monolithic system into hundreds of services (the so-called "API mandate" period), it badly needed an asynchronous channel for services to communicate safely. SQS is that internal tool turned into an external product. That is why the purpose of "decoupling components in a service-oriented architecture (SOA)" runs deep in SQS's design philosophy.

Putting a queue in the middle gives three benefits.

- **Buffering**: Even if traffic spikes momentarily, the queue holds the messages and consumers pull them at their own pace.
- **Failure isolation**: If a consumer dies briefly, the messages stay in the queue and are processed when the consumer recovers. The producer does not need to know whether the consumer is alive.
- **Independent scaling**: When the queue length grows, you start more consumers; when it shrinks, you reduce them. This is the basis of Auto Scaling driven by SQS queue depth.

What SQS implements is the **point-to-point** model among messaging patterns. A message is taken by exactly one consumer. This contrasts with the **publish-subscribe (pub/sub)** model (SNS, Day 2), in which one message is received by many subscribers at the same time. These two models, laid out in the enterprise integration patterns (Gregor Hohpe's *Enterprise Integration Patterns*, 2003), are the twin pillars of messaging middleware. JMS (Java Message Service) Queue vs Topic, and AMQP direct vs fanout exchange, are all the same distinction. If you tie it together as SQS = queue = P2P and SNS = topic = Pub/Sub, the combination of the two (fan-out) also becomes natural to understand.

SQS **stores messages redundantly on multiple servers across multiple Availability Zones (AZs)**. This provides durability, but it is also the root cause of SQS's signature traits, "no ordering guarantee" and "possible duplicates."

- Messages are scattered across multiple servers, and when a consumer calls `ReceiveMessage`, SQS samples some of those servers and returns the messages they hold.
- Searching every server on every call would kill the scalability of a distributed system. So SQS deliberately chose "scale without limit in exchange for not guaranteeing total order."
- All the "uncomfortable" traits of a standard queue are the price of this goal of "unlimited throughput."

## Why "At-Least-Once Delivery"? A Fundamental Tradeoff of Distributed Systems

The sentence "SQS standard queues guarantee at-least-once delivery" is easy to run into on the exam, but why it is not "exactly once" is easy to miss. This is not a limitation of SQS but a fundamental result of distributed messaging.

The flow in which a consumer receives a message, processes it, and calls `DeleteMessage` is as follows. Suppose the consumer finishes processing and sends the delete request, but that delete ACK is lost in the network. The queue does not know "was this message deleted?"

- If the queue assumes "it must have been deleted" and removes it, then when the consumer actually died mid-processing, the message is lost forever (at-most-once, risk of loss).
- If the queue chooses "I'm not sure, so I'll send it again," the message is never lost but may be duplicated (at-least-once).

**"Exactly once" is only possible if both sides reach perfect agreement across the whole producer-network-consumer path.** In a reality where the network can lose packets at any time, that cost is astronomical. So most practical messaging systems choose the "never lose" at-least-once and leave it to the consumer to absorb duplicate processing through idempotency.

The practical rule that follows is "**write your consumers to be idempotent**." It means designing so that the result is the same even if the same message arrives twice. For example, when processing "pay for order O001," ignore it if the order has already been processed. An SQS FIFO queue removes duplicates within a 5-minute window (`exactly-once processing`), but it cannot prevent duplicates beyond 5 minutes or reprocessing on the consumer side.

The fact that "exactly once" is practically impossible is an old conclusion of distributed systems theory. The Two Generals' Problem shows that it is impossible for two nodes to agree with certainty on an action over an unreliable channel. Message delivery has the same structure, so you must pick one: "don't lose but may duplicate" (at-least-once) or "no duplicates but may lose" (at-most-once). Kafka advertises "exactly-once semantics," but that too combines transactions and idempotent producers to make "the processing result look like it happened exactly once"; it does not make delivery itself happen once. SQS's at-least-once is an honest choice.

> ⚠️ **Trap**: On the exam, the answer to "a standard queue delivered a message twice; how do you fix it?" is usually "**design the consumer to be idempotent**" or "**switch to a FIFO queue**." Options like "turn off retries" or "set the visibility timeout to 0" are wrong. Duplicates are a design characteristic of SQS standard, not a bug, so there is no option to turn them off.

## Visibility Timeout: Reducing Duplicates Without a Distributed Lock

If multiple consumers pull messages from the same queue at the same time, two consumers may receive the same message at once and both process it. A database would take a row lock, but SQS, with tens of thousands of messages flowing per second, cannot afford the cost of a distributed lock on every message. Instead, SQS uses a light and clever mechanism called the **Visibility Timeout**.

The moment a consumer receives a message with `ReceiveMessage`, the message does not disappear from the queue; it is **hidden from other consumers for a period of time** (30 seconds by default). If the consumer finishes processing within that time and calls `DeleteMessage`, the message is permanently deleted. If time passes and no delete call arrives ("the consumer must have died"), SQS makes the message visible again so another consumer can process it.

```python
import boto3

sqs = boto3.client('sqs')

# Receive messages — the visibility timeout starts the moment they are received
messages = sqs.receive_message(
    QueueUrl=queue_url,
    MaxNumberOfMessages=10,
    WaitTimeSeconds=20,        # long polling: wait up to 20 seconds if there are no messages
    VisibilityTimeout=60       # hide these messages for 60 seconds
)

for message in messages.get('Messages', []):
    process(message['Body'])   # if processing takes over 60 seconds → risk of duplicates
    sqs.delete_message(        # delete only after processing is done
        QueueUrl=queue_url,
        ReceiptHandle=message['ReceiptHandle']
    )
```

The classic operational incident is "**when processing time is longer than the visibility timeout**." Suppose you receive a message and start a 60-second job, but the visibility timeout is 30 seconds. At the 30-second mark the message becomes visible again, and a second consumer processes the same message again. The first consumer calls `DeleteMessage` much later, but by then it has already been processed twice. So "visibility timeout > processing time + margin" is the iron rule, and if processing looks like it will run long, you extend the lock midway with `ChangeMessageVisibility`.

The visibility timeout is the **lease pattern** of distributed systems. "I'll lend you this resource for N seconds. Finish within that time and return it (delete), or if you can't finish, ask for an extension. If you say nothing, the lease expires and goes to someone else."

- Pro: Even if a consumer dies, the system recovers on its own (no deadlock).
- Con: Setting the lease duration is tricky. Too short and duplicates occur during normal processing; too long and, if a consumer dies, that message is tied up until the lease expires, delaying processing.
- Distributed lock managers, Kubernetes leader election, and DHCP leases all work on the same principle.

When Lambda consumes SQS (event source mapping), AWS recommends setting the **visibility timeout to at least 6 times the Lambda function timeout**. A Lambda event source mapping fetches messages in batches, a retry occurs if part of a batch fails, and the poller's internal delay is added on top. If the function timeout is 30 seconds and the visibility timeout is also 30 seconds, messages can become visible again before batch processing finishes, increasing duplicate invocations. The "6x" rule is a safety margin to absorb these multiple delays.

## Standard Queue vs FIFO Queue: The Cost of Guaranteeing Order

The difference between standard and FIFO queues looks like a simple memorization item, but behind it lies the fundamental distributed-systems tradeoff of "what must you give up to guarantee order?"

| Characteristic | Standard queue | FIFO queue |
|------|---------|---------|
| Ordering | No guarantee (best-effort) | First-in-first-out guaranteed within a group |
| Duplicates | Possible (at-least-once) | Removed within a 5-minute window |
| Throughput | **Unlimited** | 300 msg/s, 3,000 with batching, 70,000+ in high-throughput mode |
| Price | Cheap | Slightly more expensive |
| Naming rule | Free | `.fifo` suffix required |
| Use | High throughput, decoupling | Financial transactions, order required |

The secret to a standard queue's unlimited throughput is the "scatter messages across multiple servers and sample" approach seen earlier. To guarantee order, you must **line the messages up in a single row**, and lining up in a single row means there is a single point managing that line, and a single point is a ceiling on throughput. That is why a FIFO queue has the limit of 300 msg/s.

AWS works around this limit with the **message group ID (MessageGroupId)**. Order is guaranteed only among messages with the same group ID, and different groups are processed in parallel. If you split group IDs by customer, customer A's orders only need to be in order within A, so you can parallelize as many ways as there are customers (the principle of high-throughput mode).

```python
# FIFO queue: per-group ordering + deduplication
sqs.send_message(
    QueueUrl='https://sqs.../orders.fifo',
    MessageBody='{"orderId": "O001"}',
    MessageGroupId='customer-123',         # order guaranteed only among this customer's messages
    MessageDeduplicationId='order-O001'    # the same ID within 5 minutes is deduplicated
)
```

FIFO deduplication works through an idempotency key called **MessageDeduplicationId**. If another message with the same dedup ID arrives within 5 minutes, it is silently discarded. If you turn on `ContentBasedDeduplication`, the SHA-256 hash of the message body is automatically used as the dedup ID. Even if a producer sends the same message twice because of a network error, the queue accepts it only once. However, the limit of the 5-minute window matters. If you send the same message 6 minutes apart, both get in. On the exam, sometimes the answer to "it's FIFO, so why are there duplicates?" is that this window was exceeded.

> ⚠️ **Trap**: In a scenario like "process 5,000 orders per second in order," picking plain FIFO (300/s) gives insufficient throughput. The answer is "**High-Throughput FIFO + splitting message group IDs finely**," or, if order is needed only per group, "per-group parallelization." If you truly need "global strict ordering," you have no choice but to use a single group, and then you must accept that 300/s is the ceiling.

## Where Do Failed Messages Go: DLQ and Redrive

If you simply leave a message that keeps failing processing (a "poison pill") alone, it is retried endlessly at the front of the queue, blocking the normal messages behind it or repeatedly killing consumers. A **Dead Letter Queue (DLQ)** is a separate queue that isolates such messages.

```python
sqs.set_queue_attributes(
    QueueUrl='https://sqs.../main-queue',
    Attributes={
        'RedrivePolicy': json.dumps({
            "deadLetterTargetArn": "arn:aws:sqs:...:my-dlq",
            "maxReceiveCount": "3"   # if received 3 times and still not deleted, move to the DLQ
        })
    }
)
```

The center of the configuration is `maxReceiveCount`. When the number of times a message has been delivered to consumers by `ReceiveMessage` (the number of reappearances after visibility timeout expiry) exceeds this value, SQS moves the message to the DLQ. You set a CloudWatch alarm on the messages accumulating in the DLQ to notify operators, and after fixing the cause you use **redrive** to return them to the source queue for reprocessing.

A DLQ has two constraints.

- The DLQ must be **the same type as the source queue** (standard→standard, FIFO→FIFO). This is for message attribute compatibility. FIFO messages carry MessageGroupId/DeduplicationId, and a standard DLQ has no mechanism to handle them.
- The retention clock of a message that entered the DLQ keeps running from **the time it first entered the source queue** (it is not reset to the time it arrived in the DLQ). If the source queue retention is 4 days and the message went to the DLQ on day 3, it survives only one more day in the DLQ. If you do not know this, you end up with "I tried to analyze it in the DLQ but the message was gone."

The message size limit is also an obstacle. The maximum SQS message size increased from 256 KiB to 1 MiB in August 2025 (for both standard and FIFO). When a payload larger than that (an image, large JSON) cannot be put in the queue directly, the standard pattern is the **SQS Extended Client Library**. It stores the actual data in S3 and puts only the S3 object reference in the queue, working around the limit up to 2 GB. It is an implementation of the **Claim Check** pattern, a common messaging-system pattern (keep the large data in separate storage and pass only a receipt in the message). If you see a "message exceeding the message size limit" on the exam, the answer candidate is the Extended Client (or an S3 reference). Older materials list the previous limit of 256 KB.

## Why Cost Leaks on an Empty Queue: The Polling Model

SQS is **pull-based**: consumers actively go to fetch messages. So "how it behaves when the queue is empty" is directly tied to cost.

With **Short Polling**, a `ReceiveMessage` call responds immediately. If there are messages it returns them, and if not it returns an empty response right away. If a consumer keeps repeating this call while waiting for messages, API calls that receive empty responses continue to be billed even while the queue is empty. **Long Polling** gives `WaitTimeSeconds` (up to 20 seconds) so that a single call waits until a message arrives (or up to 20 seconds). Empty responses almost disappear and the number of API calls drops sharply, which reduces cost, and the delay before a message is delivered also gets shorter.

| Item | Short Polling | Long Polling |
|------|---------------|--------------|
| WaitTimeSeconds | 0 (default) | 1-20 seconds |
| Empty responses | Frequent | Almost none |
| API cost | High | Low |
| Recommended | No | Yes |

Long polling brings to queues the **long polling pattern** that has long been used on the web (a technique where the server holds the HTTP connection open until it has a response to send). It solves both inefficiencies of polling, "asking too often is wasteful, asking too rarely adds delay," at the same time by "holding a single request until a response exists." In practice, the recommended pattern is to set `ReceiveMessageWaitTimeSeconds=20` on the queue attributes so that all receives on that queue default to long polling. In most cases long polling is the right choice.

## Wrapping Up

The one sentence that runs through SQS is "put a queue in the middle to decouple the sending side from the receiving side in time, and in exchange give up ordering and exactly-once." As befits one of AWS's first services, every trait of SQS flows directly from the fundamental tradeoffs of distributed systems.

- Redundant storage across multiple AZs gives rise to no ordering guarantee and duplicates.
- At-least-once is an honest choice.
- The visibility timeout is a lease-based duplicate-prevention device.
- FIFO gives up throughput and gains order guarantees.

A DLQ isolates poison messages, the Extended Client works around the size limit with the claim check, and long polling stops the cost leak from an empty queue. Exam traps usually ask "why was it designed that way" at one point along this pipeline.

In the next article, we move on to the SNS publish-subscribe model, which is the opposite of SQS (where a message is taken by exactly one consumer): it pushes one message out to all subscribers at the same time.

---

## 📝 Practice Questions

**Question 1.** An SQS standard queue delivered the same message twice. What is the most appropriate response?

A) Set the visibility timeout to 0 to prevent redelivery

B) Design the consumer to be idempotent, or switch to a FIFO queue if ordering and deduplication are needed

C) Delete the queue and recreate it

D) Disable the DLQ

**Answer: B**

Explanation: Duplicate delivery in a standard queue is not a bug but a design characteristic called "at-least-once delivery." In a structure that stores messages redundantly across multiple AZs and responds by sampling, duplicates are unavoidable, so the standard approach is for the consumer to absorb them with **idempotency**. If it must behave like exactly once, switch to a **FIFO queue** (5-minute window dedup). A) Setting the visibility timeout to 0 actually exposes the same message to multiple consumers immediately, so duplicates explode. C and D have nothing to do with the cause of duplicates.

---

**Question 2.** When Lambda consumes an SQS queue, the same messages are processed repeatedly. The function timeout is 30 seconds. What is the most appropriate action?

A) Set the visibility timeout to at least 6 times the function timeout (about 180 seconds)

B) Reduce the visibility timeout to 10 seconds

C) Turn off long polling

D) Reduce the message size

**Answer: A**

Explanation: If processing (function execution + batch processing + poller delay) is longer than the visibility timeout, the lock expires, the message becomes visible again, and another invocation processes the same message again. For Lambda event source mapping, AWS recommends a visibility timeout of **at least 6 times the function timeout**, a safety margin to absorb batch retries and internal delays. B) Reducing it further makes duplicates worse. C) Long polling is about the cost of empty responses and has nothing to do with duplicates. D) Size is irrelevant.

---

**Question 3.** You must process about 5,000 orders per second while guaranteeing order per customer. Which configuration is appropriate?

A) Standard queue + idempotent consumer

B) FIFO queue with a single group ID

C) High-throughput FIFO queue + use the customer ID as the message group ID

D) A single shard of Kinesis Data Streams

**Answer: C**

Explanation: Default FIFO has a ceiling of 300 msg/s, so it cannot take 5,000 per second. The key is that order is needed only **per customer**. If you turn on **high-throughput FIFO** and use the **customer ID as the message group ID**, order is kept only within the same customer and different customers are processed in parallel, so total throughput grows with the number of groups. A) Standard does not guarantee order. B) A single group gives global order but is bound to 300/s. D) A single shard at 1 MB/s and 1,000 RPS is not enough.

---

**Question 4.** You want to isolate an SQS message that fails processing 3 times so you can analyze it later. What is the correct setup?

A) Increase VisibilityTimeout

B) Specify a DLQ with RedrivePolicy and set maxReceiveCount=3

C) Enable long polling

D) Increase the message retention period

**Answer: B**

Explanation: If you set `maxReceiveCount=3` on the **Dead Letter Queue (DLQ)**, a message that is not deleted after being delivered to consumers 3 times (reappearing after visibility timeout expiry) is moved to the DLQ. This prevents a "poison pill" from blocking normal messages or repeatedly crashing consumers. A) The visibility timeout is just lock time and has nothing to do with isolation. C) Long polling is for cost savings. D) Extending retention only keeps messages longer and is not failure isolation.

---

**Question 5.** The message payload to be processed is 1.5 MB, which exceeds the SQS limit. What is the most appropriate approach?

A) Split the message into 2 and send them

B) Use the SQS Extended Client Library to store the actual data in S3 and put only a reference in the queue

C) Switch to a FIFO queue

D) Increase the visibility timeout

**Answer: B**

Explanation: The maximum SQS message size is 1 MiB (256 KB before August 2025). For data beyond that, the **Extended Client Library** stores the body in S3 and puts only the S3 reference (the receipt) in the queue, handling up to 2 GB. This is the **claim check pattern** of "keep large data in external storage and pass only a reference in the message." A) Manual splitting makes ordering, reassembly, and partial-failure handling complex and is not recommended. C and D have nothing to do with the size limit.

---

**Question 6.** An SQS consumer shows high API costs even though the queue is often empty. Which cause and fix is correct?

A) Messages are too large — reduce the size

B) It is repeatedly receiving empty responses with short polling — apply long polling by setting WaitTimeSeconds to 1-20 seconds

C) The visibility timeout is too short — increase it

D) It is not FIFO — switch to FIFO

**Answer: B**

Explanation: The default **short polling (WaitTimeSeconds=0)** makes `ReceiveMessage` respond immediately, so calls that receive empty responses keep being billed even while the queue is empty. **Long polling** (WaitTimeSeconds 1-20) makes a single call wait until a message arrives (or 20 seconds), greatly reducing empty responses and the number of API calls. Setting `ReceiveMessageWaitTimeSeconds=20` on the queue attributes is the recommended pattern. A, C, and D have nothing to do with the cause of the cost leak.

---

**Question 7.** Which is the most accurate statement about SQS's "at-least-once delivery" guarantee?

A) A message is never duplicated

B) A message is not lost but may be duplicated, because "exactly once" is practically impossible on an unreliable network

C) A message is delivered exactly once

D) A message may occasionally be lost

**Answer: B**

Explanation: If the delete ACK is lost in the network, the queue cannot be sure whether the message was processed. If it chooses "I'm not sure, so I'll send it again," there is no loss but duplicates are possible (at-least-once), and if it chooses the opposite, there is a risk of loss (at-most-once). As the Two Generals' Problem shows, perfect agreement is impossible over an unreliable channel, so SQS chooses "don't lose but may duplicate" and has duplicates absorbed through idempotency. A and C are not guaranteed in a standard queue (FIFO too is limited to the 5-minute window), and D contradicts the definition of at-least-once.

---
