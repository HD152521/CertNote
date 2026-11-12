# Day 1 - SQS: How One Queue Decouples a System

The first wall you hit when designing a distributed system is the fact that "two components do not work at the same speed." A web server taking orders can absorb thousands of requests per second, while the processor that charges payments for those orders can only handle a few dozen per second. Connect the two directly and the fast side crushes the slow side. A message queue puts a buffer between them and separates the "sending side" from the "receiving side" in time (decoupling). Amazon SQS turned this old idea into a "fully managed service where you do not have to operate the queue yourself," and it also carries the historical weight of being AWS's first publicly released service.

In DVA-C02, SQS is the starting point of the messaging section. There are standalone questions (numbers such as visibility timeout and FIFO throughput), but it is also easy to ask about it through how-it-works scenarios like "why does Lambda process a message twice," "where do failed messages go," and "why does cost leak when the queue is empty." This article covers why SQS chose the uncomfortable guarantee of "at-least-once delivery," how a temporary lock called the visibility timeout reduces duplicates without distributed consensus, and what the fundamental reason is that the standard queue and the FIFO queue part ways.

## Where SQS Started: AWS's First Service

SQS was officially launched in 2006. Along with S3 (March 2006), it is **one of the oldest AWS services**, and the beta had been running since 2004. This is no coincidence. In the early 2000s, while Amazon was breaking a huge monolithic system into hundreds of services (the so-called "API mandate" period), it badly needed an asynchronous channel through which services could communicate safely. That internal tool becoming an external product is SQS. That is why the purpose of "decoupling components in a service-oriented architecture (SOA)" is deeply embedded in SQS's design philosophy.

Putting a queue in the middle brings three benefits.

- **Buffering**: Even if traffic spikes for a moment, the queue holds the messages and consumers pull them out at their own pace.
- **Fault isolation**: Even if a consumer dies briefly, the messages remain in the queue and are processed once the consumer comes back. The producer does not need to know whether the consumer is alive.
- **Independent scaling**: When the queue length grows, you launch more consumers; when it shrinks, you reduce them. This is the basis of Auto Scaling driven by SQS queue depth.

What SQS implements is the **point-to-point** model among messaging patterns. One message is taken by exactly one consumer. This contrasts with the **publish-subscribe (pub/sub)** model (SNS, Day 2), in which several subscribers receive one message simultaneously. These two models, laid out in the enterprise integration patterns (Gregor Hohpe's *Enterprise Integration Patterns*, 2003), are the two main axes of messaging middleware. JMS's (Java Message Service) Queue versus Topic and AMQP's direct versus fanout exchange are all the same distinction. If you bundle SQS = queue = P2P and SNS = topic = Pub/Sub, then their combination (fan-out) is also naturally understood.

SQS **stores messages redundantly on multiple servers across multiple Availability Zones (AZs)**. This gives durability, but it is also the root cause of SQS's signature traits, "no ordering guarantee" and "possible duplicates."

- Messages are scattered across multiple servers, and when a consumer calls `ReceiveMessage`, SQS samples some of those servers and returns the messages they hold.
- If every server were searched every time, the scalability of the distributed system would die. So SQS deliberately chose "it scales without limit in exchange for not guaranteeing a global order."
- Every "uncomfortable" trait of the standard queue is the price of this goal of "unlimited throughput."

## Why "At-Least-Once Delivery": A Fundamental Trade-off of Distributed Systems

The sentence that the SQS standard queue guarantees "at-least-once delivery" is easy to run into on the exam, but why it is not "exactly once" is easy to miss. This is not a limitation of SQS; it is a fundamental result of distributed messaging.

The flow in which a consumer receives a message, processes it, and calls `DeleteMessage` goes as follows. Suppose the consumer finishes processing and sends the delete request, but the delete ACK disappears in the network. The queue does not know "was this message deleted?"

- If the queue assumes "it must have been deleted" and removes it, then when the consumer actually died mid-processing, the message is lost forever (at-most-once, risk of loss).
- If the queue chooses "I am not sure, so I will send it again," the message is never lost but may be duplicated (at-least-once).

**"Exactly once" is possible only if both sides agree perfectly across the entire path of producer, network, and consumer.** In a reality where the network can drop packets at any time, the cost of that is astronomical. So most practical messaging systems choose the "never lose" at-least-once and leave it to the consumer to absorb duplicate processing through idempotency.

The practical rule that comes out of this is "**write your consumers to be idempotent**." It means designing so that the result is the same even if the same message arrives twice. For example, when processing "pay order O001," you ignore it if the order has already been processed. The SQS FIFO queue removes duplicates within a 5-minute window (`exactly-once processing`), but it cannot prevent duplicates beyond 5 minutes or reprocessing on the consumer side.

That "exactly once" is practically impossible is an old conclusion of distributed systems theory. The Two Generals' Problem shows that it is impossible for two nodes to reach certain agreement on an action over an unreliable channel. Message delivery has the same structure, so you must pick one of "do not lose, but may duplicate" (at-least-once) and "do not duplicate, but may lose" (at-most-once). Kafka advertises "exactly-once semantics," but that too combines transactions with an idempotent producer to make "the processing result look as if it happened exactly once"; the delivery itself does not become exactly once. SQS's at-least-once is an honest choice.

> ⚠️ **Pitfall**: On the exam, the correct answer to "the standard queue delivered a message twice; how do you fix it?" is usually "**design the consumer to be idempotent**" or "**switch to a FIFO queue**." Options like "turn off retries" or "set the visibility timeout to 0" are wrong. Duplicates are a design characteristic of the SQS standard queue, not a bug, so there is no option to turn them off.

## Visibility Timeout: Reducing Duplicates Without a Distributed Lock

When several consumers pull messages from the same queue simultaneously, a problem arises in which two consumers receive the same message at the same time and both process it. A database would take a row lock, but SQS cannot afford the cost of a distributed lock on every message in an environment where tens of thousands of messages per second flow. Instead, SQS uses a light and clever mechanism called the **Visibility Timeout**.

The moment a consumer receives a message with `ReceiveMessage`, that message does not disappear from the queue but is **hidden from other consumers for a set time** (30 seconds by default). If the consumer finishes processing within this time and calls `DeleteMessage`, the message is permanently deleted. If time passes and no delete call arrives ("the consumer must have died"), SQS makes the message visible again so another consumer can process it.

```python
import boto3

sqs = boto3.client('sqs')

# Receive messages - the visibility timeout starts the moment they are received
messages = sqs.receive_message(
    QueueUrl=queue_url,
    MaxNumberOfMessages=10,
    WaitTimeSeconds=20,        # Long polling: wait up to 20 seconds if there are no messages
    VisibilityTimeout=60       # Hide these messages for 60 seconds
)

for message in messages.get('Messages', []):
    process(message['Body'])   # If processing takes more than 60 seconds -> risk of duplicates
    sqs.delete_message(        # Delete only after processing is done
        QueueUrl=queue_url,
        ReceiptHandle=message['ReceiptHandle']
    )
```

The classic operational accident is "**when the processing time is longer than the visibility timeout**." If you receive a message and start a 60-second job but the visibility timeout is 30 seconds, the message becomes visible again at the 30-second mark and a second consumer processes the same message again. The first consumer calls `DeleteMessage` quite a while later, but by then it has already been processed twice. So "processing time + margin > visibility timeout" is the iron rule, and if processing looks likely to run long, you extend the lock midway with `ChangeMessageVisibility`.

The visibility timeout is the **lease pattern** of distributed systems. "I will lend you this resource for N seconds; finish within that time and return it (delete), or if you cannot finish, ask for an extension. If you say nothing, the lease expires and passes to someone else."

- Advantage: Even if a consumer dies, the system recovers on its own (no deadlock).
- Disadvantage: Setting the lease period is tricky. Too short, and duplicates occur during normal processing; too long, and if a consumer dies, that message stays tied up until the lease expires and processing is delayed.
- Distributed lock managers, Kubernetes leader election, and DHCP leases all follow the same principle.

When Lambda consumes SQS (event source mapping), AWS recommends setting the **visibility timeout to at least 6 times the Lambda function timeout**. The Lambda event source mapping fetches messages in batches, retries occur when some of a batch fails, and on top of that there are internal delays in the poller. If the function timeout is 30 seconds and the visibility timeout is also 30 seconds, messages can become visible again before batch processing finishes, increasing duplicate invocations. The "6x" rule is a safety margin to absorb these multiple delays.

## Standard Queue vs FIFO Queue: The Cost of Guaranteeing Order

The difference between the standard queue and the FIFO queue looks like a simple memorization item, but behind it lies a fundamental trade-off of distributed systems: "what must you give up to guarantee order?"

| Property | Standard queue | FIFO queue |
|------|---------|---------|
| Ordering | No guarantee (best-effort) | First-in-first-out within a group |
| Duplicates | Possible (at-least-once) | Removed within a 5-minute window |
| Throughput | **Unlimited** | 300 msg/s, 3,000 with batching, 70,000+ in high-throughput mode |
| Price | Cheap | Slightly more expensive |
| Naming rule | Free | `.fifo` suffix required |
| Use | High throughput, decoupling | Financial transactions, order required |

The secret to the standard queue's unlimited throughput is the "scatter messages across multiple servers and sample" we saw earlier. To guarantee order, messages must be **lined up in a single row**; lining them up in a single row means there is a single point managing that row, and a single point is a ceiling on throughput. That is why the FIFO queue has the limit of 300 msg/s.

AWS works around this limit with the **message group ID (MessageGroupId)**. Order is guaranteed only among messages with the same group ID, while different groups are processed in parallel. If you split group IDs by customer, customer A's orders only need to be in order within A, so parallelism equal to the number of customers becomes possible (the principle of high-throughput mode).

```python
# FIFO queue: per-group ordering + deduplication
sqs.send_message(
    QueueUrl='https://sqs.../orders.fifo',
    MessageBody='{"orderId": "O001"}',
    MessageGroupId='customer-123',         # Order is guaranteed only among this customer's messages
    MessageDeduplicationId='order-O001'    # The same ID within 5 minutes is deduplicated
)
```

FIFO's deduplication works through an idempotency key called the **MessageDeduplicationId**. If a message with the same dedup ID arrives again within 5 minutes, it is silently discarded. If you turn on `ContentBasedDeduplication`, the SHA-256 hash of the message body is used automatically as the dedup ID. Even if the producer sends the same message twice because of a network error, the queue accepts it only once. The 5-minute window limit is important, though. If you send the same message at 6-minute intervals, both go in. On the exam, there are cases where the answer to "why do duplicates occur even with FIFO?" is exceeding this window.

> ⚠️ **Pitfall**: In a scenario of "process 5,000 orders per second in order," picking plain FIFO (300/s) gives insufficient throughput. The correct answer is "**High-Throughput FIFO plus finely splitting the message group IDs**," or, if order is needed only per group, "per-group parallelism." If "strict global ordering" is truly required, you have no choice but to use a single group, and then you must accept that 300/s is the ceiling.

## Where Do Failed Messages Go: DLQ and Redrive

If a message that keeps failing processing (a "poison message," or poison pill) is simply left alone, it is retried endlessly at the head of the queue, blocking the normal messages behind it or repeatedly killing consumers. A **Dead Letter Queue (DLQ)** is a separate queue that isolates such messages.

```python
sqs.set_queue_attributes(
    QueueUrl='https://sqs.../main-queue',
    Attributes={
        'RedrivePolicy': json.dumps({
            "deadLetterTargetArn": "arn:aws:sqs:...:my-dlq",
            "maxReceiveCount": "3"   # If it has been received 3 times and still not deleted, send to the DLQ
        })
    }
)
```

The center of the configuration is `maxReceiveCount`. When the number of times a message has been delivered to a consumer through `ReceiveMessage` (the number of times it reappeared after the visibility timeout expired) exceeds this value, SQS moves that message to the DLQ. You set a CloudWatch alarm on the messages piling up in the DLQ to notify operators, and after fixing the cause you put them back into the source queue for reprocessing with a **redrive**.

The DLQ has two constraints.

- The DLQ must be **the same type as the source queue** (standard to standard, FIFO to FIFO). This is because of message attribute compatibility. FIFO messages have a MessageGroupId/DeduplicationId, and a standard DLQ has no mechanism to handle them.
- The retention clock of a message that went into the DLQ keeps running from **the time it first entered the source queue** (it is not reset to the time it arrived in the DLQ). If the source queue's retention is 4 days and the message went to the DLQ on day 3, it survives only one more day in the DLQ. If you do not know this, you get the situation "I tried to analyze it in the DLQ but the message was gone."

The message size limit is also a stumbling block. The maximum SQS message size was raised from 256 KiB to 1 MiB in August 2025 (for both standard and FIFO). When a larger payload (an image, large JSON) cannot be put into the queue directly, the standard pattern is the **SQS Extended Client Library**. The actual data is stored in S3 and only an S3 object reference goes into the queue, working around the limit up to 2 GB. It is an implementation of the **Claim Check** pattern, a common messaging pattern (keep the large data in a separate store and pass only the receipt in the message). If you see "a message exceeding the message size limit" on the exam, the answer candidate is the Extended Client (or an S3 reference). Older materials state the previous limit of 256 KB.

## Why Cost Leaks on an Empty Queue: The Polling Model

SQS is **pull-based**: consumers actively go fetch messages. So "how you behave when the queue is empty" is directly tied to cost.

With **Short Polling**, a `ReceiveMessage` call responds immediately. If there are messages it hands them over, and if not it returns an empty response right away. If a consumer endlessly repeats this call while waiting for messages, the API calls that receive empty responses keep being billed even while the queue is empty. **Long Polling** gives `WaitTimeSeconds` (up to 20 seconds) so that a single call waits until a message arrives (or up to 20 seconds). Empty responses almost disappear and the number of API calls drops sharply, so cost goes down, and the message arrival latency also becomes shorter.

| Item | Short Polling | Long Polling |
|------|---------------|--------------|
| WaitTimeSeconds | 0 (default) | 1-20 seconds |
| Empty responses | Frequent | Almost none |
| API cost | High | Low |
| Recommended | No | Yes |

Long polling applies to queues the **long polling pattern** that has long been used on the web (a technique in which the server holds an HTTP connection open until it has a response to send). It solves both inefficiencies of polling at once, "waste if you ask too often, latency if you ask too rarely," by "holding a single request open until a response exists." In practice, the recommended pattern is to set `ReceiveMessageWaitTimeSeconds=20` on the queue attribute so that every receive on that queue uses long polling by default. In most cases long polling is the right fit.

## Summary

The single sentence that runs through SQS is "put a queue in to separate the sending and receiving sides in time, and give up ordering and exactly-once in return." True to AWS's first service, every property of SQS flows directly from the fundamental trade-offs of distributed systems.

- Redundant storage across multiple AZs gives rise to no ordering guarantee and duplicates.
- At-least-once is an honest choice.
- The visibility timeout is a lease-based duplicate-prevention device.
- FIFO gives up throughput and gains an ordering guarantee.

The DLQ isolates poison messages, the Extended Client works around the size limit with a claim check, and long polling stops the cost leak of an empty queue. Exam pitfalls usually ask "why was it designed that way" at one point along this pipeline.

The next article moves on to SNS's publish-subscribe model, which is the opposite of SQS, where one message is taken by exactly one consumer: it pushes one message out to every subscriber at once.

---

## 📝 Practice Questions

**Question 1.** What is the throughput limit of an SQS FIFO queue?

A) 100 messages per second  
B) 300 messages per second  
C) Unlimited  
D) 1000 messages per second  

**Answer: B** - FIFO queues can process 300 messages per second (3000 with batching).

---

**Question 2.** What setting prevents a message from being visible to other consumers while being processed?

A) MessageRetentionPeriod  
B) DelaySeconds  
C) VisibilityTimeout  
D) WaitTimeSeconds  

**Answer: C** - VisibilityTimeout hides the message from other consumers for a specified duration after receipt.

---

**Question 3.** What is the best way to reduce costs and eliminate unnecessary empty responses in SQS?

A) Reduce message size  
B) Use long polling (WaitTimeSeconds)  
C) Reduce number of queues  
D) Increase message retention period  

**Answer: B** - Long polling waits up to 20 seconds for messages, reducing empty responses and saving costs.

---

**Question 4.** What is the purpose of a DLQ?

A) Improve message delivery speed  
B) Isolate and analyze messages that have repeatedly failed processing  
C) Encrypt messages  
D) Improve throughput  

**Answer: B** - DLQ isolates messages that have failed multiple times for later analysis.

---

**Question 5.** What queue type should be used when processing financial transaction messages in order?

A) Standard queue  
B) FIFO queue  
C) Priority queue  
D) Delay queue  

**Answer: B** - Financial transactions require order guarantee, so FIFO queue must be used for FIFO ordering.

---

**Question 6.** An SQS consumer's queue is often empty, yet the API cost is high. Which cause and fix is correct?

A) Messages are too large - reduce their size
B) Short polling is repeatedly receiving empty responses - set WaitTimeSeconds to 1-20 seconds to apply long polling
C) The visibility timeout is too short - increase it
D) The queue is not FIFO - switch to FIFO

**Answer: B** - The default **short polling (WaitTimeSeconds=0)** makes `ReceiveMessage` respond immediately, so calls that return empty responses keep being billed even while the queue is empty. **Long polling** (WaitTimeSeconds 1-20) makes a single call wait until a message arrives (or 20 seconds), greatly reducing empty responses and the number of API calls. Setting `ReceiveMessageWaitTimeSeconds=20` on the queue attribute is the recommended pattern. A, C, and D are unrelated to the cause of the cost leak.

---

**Question 7.** Which statement about SQS's "at-least-once delivery" guarantee is the most accurate?

A) Messages are never duplicated
B) Messages are not lost, but they can be duplicated, because "exactly once" is practically impossible on an unreliable network
C) Messages are delivered exactly once
D) Messages can occasionally be lost

**Answer: B** - If the delete ACK is lost on the network, the queue cannot be sure whether the message was processed. Choosing "if unsure, send it again" means no loss but possible duplicates (at-least-once), while choosing the opposite creates a risk of loss (at-most-once). As the Two Generals Problem shows, perfect agreement over an unreliable channel is impossible, so SQS chooses "do not lose, but allow duplicates" and lets idempotency absorb the duplicates. A and C are not guaranteed on standard queues (FIFO is also limited to the 5-minute window), and D contradicts the definition of at-least-once.

---

## 📌 Today's Summary

1. SQS: Fully managed message queue, maximum 256KB, default 4-day retention
2. Standard queue: Unlimited throughput, no order/duplicate guarantee
3. FIFO queue: Order guarantee, deduplication, 300 messages per second
4. VisibilityTimeout: Hide during processing, default 30 seconds, reappears on failure
5. DLQ: Isolates messages exceeding maxReceiveCount, for error analysis
