# Day 1 - SQS: How a Message Queue Answers the Questions Distributed Systems Ask

The most common trap when first designing a distributed system is the seductive simplicity of "an API can just call another API synchronously." The order API calls the payment API, the payment API calls the inventory API, and the inventory API calls the shipping API. The code looks clean, but the moment the payment API slows down by 100ms, the order API's response time grows by 100ms too, and if the inventory API goes down, orders can't even be accepted. Temporal and spatial coupling drag the availability of the whole system down multiplicatively.

The message queue is the oldest tool for turning that multiplication into addition. From IBM MQSeries in the 1980s, through the AMQP standard (RabbitMQ's ancestor) in the 1990s and ActiveMQ in the 2000s, one of the very first services AWS launched in July 2006 — even before EC2 and S3 — was **SQS (Simple Queue Service)**. In this article we'll look at which distributed-system trade-offs SQS explicitly chose, and what scenarios those choices create on both the exam and in practice.

## SQS's Message Model: Two Queue Types and a Distributed-Systems Trade-off

SQS offers two queue types, Standard and FIFO, and the difference between them isn't simply "two options" — it's the result of exposing the two extreme ends of the most famous trade-off in distributed systems theory. The Standard queue chose **at-least-once delivery + best-effort ordering** and gained **unlimited throughput** in exchange, while the FIFO queue chose **exactly-once processing + strict ordering** and accepted **per-API throughput limits** in return.

| Aspect | Standard | FIFO |
|--------|----------|------|
| Throughput | Unlimited (only per-region quota) | 300 msg/s (3,000 with batching), 9,000-70,000 in High Throughput mode |
| Ordering | Best-effort (usually ordered but not guaranteed) | **Strict FIFO per MessageGroupId** |
| Duplication | At-least-once (occasional duplicates) | Exactly-once-processing (5-minute dedup window) |
| Queue name | Free | `.fifo` suffix required |
| Price | Cheaper | ~15-20% more expensive |
| Launched | July 2006 | November 2016 |

The fact that the Standard queue stood alone for a full 10 years starting in 2006 is significant. AWS knew from the start that it couldn't promise "exactly once + ordering." In a distributed queue system, exactly-once is essentially a variant of the **two generals problem**: if a consumer processes a message and then dies before sending its ack, the queue has no way of knowing whether that message was processed. So the Standard queue chose at-least-once — "it might have been processed, so we'll send it once more" — and pushed **the responsibility for implementing idempotency** onto the client.

> 💡 **Related theory**: The three delivery semantics — at-most-once / at-least-once / exactly-once — are a classic of distributed messaging. They were laid out clearly in Kafka creator Jay Kreps's 2017 piece "Exactly-once Support in Apache Kafka," and the core insight is that "exactly-once **delivery** is impossible, but exactly-once **processing** is achievable through the combination of producer idempotency + transactional write + consumer offset commit." SQS FIFO provides the producer-side dedup (`MessageDeduplicationId`, 5-minute window) and consumer-side ordering (MessageGroupId), but "the idempotency of the processing itself" is still the application's responsibility.

> 🔍 **Going deeper**: Where does the FIFO queue's 300 msg/s limit come from? Internally, FIFO **serializes messages onto a single partition** keyed by MessageGroupId. Messages within a group must be processed strictly in order, so concurrent processing is impossible, which ties per-group throughput to the limit of a single partition. **High Throughput FIFO**, launched in 2021, works around this constraint by "distributing the groups themselves across multiple partitions," which is why it only pays off when you have a sufficiently large number of groups (enabling it with a handful of groups yields little benefit). Depending on the region, it can reach 9,000 ~ 70,000 msg/s.

> 📚 **Case study**: On December 7, 2021, an internal network failure in AWS us-east-1 lasted about 7 hours and affected a wide range of services including SQS, DynamoDB, and Lambda. What many companies realized at that point was that "SQS is region-resilient, but the SQS endpoint itself depends on the us-east-1 control plane." Robinhood, Disney+, Slack, and Coinbase all went down, and it was after this incident that multi-region SQS patterns (active-active queues + Route 53 health checks) started being seriously discussed. [AWS official post-mortem](https://aws.amazon.com/message/12721/).

## Visibility Timeout: The Mechanism SQS Hides Behind "At Least Once"

If you understand SQS's Visibility Timeout merely as "the time a message is hidden from other consumers," you'll miss half the exam and 80% of production incidents. This is the very mechanism by which SQS **delivers one message to exactly one consumer without a distributed lock**.

When a consumer calls the `ReceiveMessage` API, SQS hands over the message and simultaneously flags it "invisible" for the duration of the visibility timeout (30 seconds by default, up to 12 hours). During that window it won't hand the same message to any other `ReceiveMessage` caller. When the consumer finishes processing and calls `DeleteMessage`, the message disappears; if it fails to call it and the timeout passes, the message becomes visible again and another consumer picks it up. In other words, the visibility timeout is a **leasing model, not a lock**.

```
[ Visibility Timeout timeline ]

t=0   : Worker-A calls ReceiveMessage → gets message, invisibility begins (30s)
t=10  : Worker-A processing...
t=30  : Worker-A hasn't sent DeleteMessage yet → message returns to visible
t=31  : Worker-B calls ReceiveMessage → gets the same message again
t=45  : Worker-A finishes processing, attempts DeleteMessage
        → but Worker-B is already processing it too! (double processing)
        → duplicate payment / duplicate email in the DB
```

This scenario is a perennial exam question in the form "if Lambda takes 60 seconds but visibility is 30 seconds, what happens?" The answer is always "duplicate processing," and the fix is one of three: ① set the visibility timeout longer than the processing time; ② extend it dynamically mid-processing with `ChangeMessageVisibility` (the heartbeat pattern for long jobs); ③ implement idempotency on the consumer side (e.g., record the message ID as a unique key in the DB).

> ⚠️ **Pitfall**: It's easy to think "setting the visibility timeout long (e.g., 12 hours) is safe," but there's an opposite trap. If a consumer dies mid-processing, the message stays "invisible" and locked for 12 hours, so the retry only happens 12 hours later. Generally "estimated processing time × 2-3" is the right ballpark, and if there's any chance it takes longer, it's safer to extend dynamically with `ChangeMessageVisibility`.

> 🔍 **Going deeper**: Internally, SQS stores messages distributed across multiple servers, and the visibility timeout information is distributed too. So very rarely, due to "transient inconsistency in a distributed system," another consumer may receive the same message even though the visibility timeout hasn't expired (this is stated in the official docs). This is one of the reasons SQS classifies the Standard queue as at-least-once. The FIFO queue solves this problem with a strong consistency mechanism, but pays for it with lost throughput.

## DLQ and maxReceiveCount: How Failures Are Isolated

Every time the visibility timeout expires, the message returns to the queue and is retried. But if the message itself is broken (a poison message) so that no consumer can process it, this retry continues forever. The consumer gets stuck on that message every time and can't process others, and eventually the entire queue stalls. This is the **poison message** problem, known since the RabbitMQ days of the 1990s.

The solution is the **DLQ (Dead Letter Queue) + maxReceiveCount** combination. SQS tracks each message's receive count (how many times it's been received), and once it exceeds the configured maxReceiveCount (typically 3-5), it removes that message from the source queue and moves it to the DLQ. The DLQ is just a separate SQS queue, but operators can look at the messages piled up there and analyze what broke. In 2021, AWS launched the **Redrive API**, adding the ability to send DLQ messages back to the source queue from the console/CLI (previously you had to write your own code).

The asymmetry rule of DLQ design: a Standard queue's DLQ must be Standard, and a FIFO queue's DLQ must be FIFO. This is because the message ID formats differ, and the exam sets a trap with "can you use a Standard queue as the DLQ for a FIFO queue?"

> 📚 **Case study**: In 2020, right after the GameStop episode, Robinhood suffered an incident where its payment-processing queue abnormally spiked and the DLQ filled up. The cause was that one external payment gateway always returned 500 for certain transactions, and as consumers retried and exhausted maxReceiveCount, all those transactions fell into the DLQ. The post-mortem found the direct cause was the missing "CloudWatch Alarm + PagerDuty when DLQ messages exceed a threshold." After that, "does every queue have a DLQ, and does every DLQ have an alarm?" became part of the company's standard SRE checklist.

> 💡 **Related theory**: The Circuit Breaker pattern (Netflix Hystrix, 2012) and the DLQ are failure isolation at different levels. A Circuit Breaker is client-side protection — "the downstream is broken, so let's cut off calls for a while" — while a DLQ is queue-side protection — "a message we already received is broken, so let's isolate it." A well-designed system has both: cut off external-dependency failures quickly with a Circuit Breaker, and isolate any poison messages that still flow in with a DLQ.

## Long Polling, Batching, KMS — SQS's Cost, Performance, and Security Options

Standard SQS API calls are free up to 1.5M, but beyond that they cost $0.40 per million requests. If a consumer calls `ReceiveMessage` once per second, a single consumer alone racks up 2.6M calls a month, and 100 consumers make 260M calls — creating the paradox where SQS cost exceeds message cost. To prevent this, AWS created **Long Polling**.

With Long Polling, you specify `WaitTimeSeconds` (0-20 seconds) on the `ReceiveMessage` call, and SQS holds the response for that duration until a message arrives. The behavior of polling an empty queue every 100ms disappears, and since the response comes the instant a message arrives, latency also drops. AWS officially recommends 20-second long polling always, and short polling is only for "special cases that truly need a sub-1-second response."

The batch APIs (`SendMessageBatch`, `DeleteMessageBatch`) handle 10 messages at a time. The 256KB payload limit applies to the whole batch, so the smaller your messages, the bigger the win. 10x the calls become 1x, so cost drops to 1/10.

The 256KB message size limit looks small at first glance, but it embeds AWS's intent that "a message queue is a tool for delivering small signals, not for moving large data." If you actually need to send large files, use the **SQS Extended Client Library**. This is the pattern where the client uploads the payload to S3 and puts only the S3 object reference in the SQS message. You could implement this yourself, but the library handles download/cleanup for you too.

> 🔍 **Going deeper**: The Extended Client pattern is a standard technique that exists under the same name (KIP-405) in the Kafka world too, not just queues. Whereas a messaging system's cost model is "number of messages + message size," object storage (S3) is very cheap per GB and per request, so diverting large payloads to object storage is almost always economical. There's a trade-off, though: the consumer has to do an S3 GET as well, so latency increases, and you have to manage two sets of permissions in IAM — S3 permissions and SQS permissions.

Encryption has two options: SSE-SQS (AWS-managed key, launched 2019) and SSE-KMS (customer-managed KMS key). With SSE-KMS, key usage permissions are controlled by IAM policy, enabling fine-grained security like "only a specific group can decrypt queue messages" — but if a KMS GenerateDataKey call happens per message, it eats into KMS API limits and cost. To mitigate this, SQS provides a **data key reuse** option (5 minutes by default, up to 24 hours).

```
[ SQS + SNS + Lambda decoupling pattern ]

API Gateway
   │
   ▼
Lambda (producer)
   │ SendMessage
   ▼
SQS Standard Queue ── Long Polling 20s
   │ Event Source Mapping (batch=10)
   ▼
Lambda (consumer, idempotency guaranteed)
   │
   ├─ DynamoDB write
   ├─ SES email
   └─ failure → retry → maxReceiveCount exceeded
                       ▼
                    DLQ (CloudWatch Alarm)
                       ▼
                    Redrive API to reprocess after analysis
```

## ASG and Lambda — Two Models for Scaling Consumers

An SQS queue's length is the most direct signal of system load. CloudWatch automatically publishes `ApproximateNumberOfMessagesVisible` at 1-minute intervals, and adjusting consumer count based on it is the standard pattern for SQS-based workloads.

When using an EC2 Auto Scaling Group, building and using a **Backlog Per Instance** metric is the textbook approach. If you simply set "scale out when queue length exceeds 1000," you have the problem of scaling at the same threshold every time regardless of instance count. Instead, build a custom metric like "message count ÷ current instance count = backlog per instance" and use a target tracking policy such as "add capacity when it exceeds 100 per instance." This pattern is the recommendation in the AWS Auto Scaling official whitepaper.

Lambda's model is entirely different from EC2. With Lambda + SQS, an SQS poller called the **Event Source Mapping** (ESM) runs inside the Lambda service and automatically increases the consumer count. As the queue fills, the ESM gradually raises the number of concurrent Lambda executions (starting at 5, then adding 60 per minute, up to 1,000 for Standard queues), and if you don't know this and assume "Lambda scales infinitely, so it's safe," you'll see processing delays under large spikes. The **Maximum Concurrency** option, launched in November 2022, lets you cap Lambda concurrency on the ESM itself, which is essential for protecting downstream resources (e.g., an RDS connection pool).

> 💡 **Related theory**: Little's Law (L = λW) is a fundamental law of queuing theory: "average queue length L = arrival rate λ × average wait time W." What this equation means in SQS operations is that "to reduce queue length, you either reduce the arrival rate (rate limit) or reduce processing time (add consumers) — one of the two." An ASG's target tracking is effectively the action of adjusting consumer count to keep W constant.

> 🔍 **Going deeper**: For Lambda + SQS, the **Batch Window** (0-5 minutes) and **Partial Batch Response** features, launched in November 2020, greatly changed operability. The Batch Window enables "wait until messages accumulate, then batch-process," which lowers cost (many short invocations → one long invocation). Partial Batch Response is the feature that, when only some of a batch of 10 fails, restores visibility for only the failed messages and auto-deletes the successful ones; before it, if even 1 of 10 in a batch failed, all 10 were retried, causing severe duplicate processing.

## Comparison with Other Messaging Systems

Placing SQS's design side by side with other messaging systems makes its trade-offs sharper.

| System | Model | Retention | Ordering | Throughput | Operational Burden |
|--------|-------|-----------|----------|------------|---------------------|
| **SQS Standard** | Queue (delete after consume) | 1 min ~ 14 days | Best-effort | Unlimited | Very low (serverless) |
| **SQS FIFO** | Queue + ordering | 1 min ~ 14 days | Strict per group | 300 (HT FIFO 70K) | Low |
| **Kafka / MSK** | Log (replay after retention) | Unlimited (storage-dependent) | Strict per partition | Very high | High (broker operation) |
| **Kinesis Data Streams** | Log | 24h ~ 365 days | Per shard | 1MB/s per shard | Medium (shard management) |
| **RabbitMQ** | Queue + exchange | Disk limit | Per queue | High | Very high (self-operated) |
| **Google Pub/Sub** | Topic+subscription (Pull/Push) | 7 days | Optional | Unlimited | Low |
| **Azure Service Bus** | Queue + topic | 14 days | Possible via Session | Unlimited | Low |

SQS's strength is that its **operational burden is nearly 0**. There are no brokers, no nodes, no clusters. The downside is that it's a queue model where "once consumed, it's gone," so if multiple systems need to independently process the same message, you have to go to SNS fanout (next article) or Kinesis (Day 4).

> 📚 **Case study**: In 2018, New Relic published a blog post about the process of moving some workloads from its self-operated Kafka cluster to SQS. The key lesson was that "Kafka is valuable when you need throughput and retention, but for simple decoupling SQS's operational cost is 1/10." The point — that the right answer isn't unifying all messaging workloads on Kafka but choosing per workload characteristics — became industry consensus around this time.

## Hands-On with the CLI

```bash
# Create a FIFO queue + DLQ set
aws sqs create-queue --queue-name payment.fifo \
  --attributes 'FifoQueue=true,ContentBasedDeduplication=true,VisibilityTimeout=60,MessageRetentionPeriod=345600,KmsMasterKeyId=alias/aws/sqs'

aws sqs create-queue --queue-name payment-dlq.fifo \
  --attributes 'FifoQueue=true'

# Attach the DLQ (maxReceiveCount=5)
aws sqs set-queue-attributes --queue-url $URL \
  --attributes '{"RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:ap-northeast-2:123456789012:payment-dlq.fifo\",\"maxReceiveCount\":\"5\"}"}'

# Guarantee ordering with MessageGroupId (same customer = same group)
aws sqs send-message --queue-url $URL \
  --message-body '{"orderId":"o-1001","amount":12000}' \
  --message-group-id "customer-A"

# Minimize cost with Long Polling
aws sqs receive-message --queue-url $URL \
  --wait-time-seconds 20 \
  --max-number-of-messages 10 \
  --visibility-timeout 120

# Check the backlog metric in CloudWatch
aws cloudwatch get-metric-statistics --namespace AWS/SQS \
  --metric-name ApproximateNumberOfMessagesVisible \
  --dimensions Name=QueueName,Value=payment.fifo \
  --start-time 2026-05-27T00:00:00Z --end-time 2026-05-27T01:00:00Z \
  --period 60 --statistics Average
```

## Wrapping Up

SQS is AWS's answer to the oldest problem in distributed systems — "decoupling two components in time while still exchanging messages reliably." The Standard queue chose unlimited throughput and at-least-once, while the FIFO queue chose strict ordering and exactly-once-processing. The visibility timeout is a leasing mechanism that guarantees "one message = one consumer" without a distributed lock, the DLQ isolates poison messages, Long Polling optimizes cost and latency, and the Extended Client is the standard pattern for working around the 256KB limit.

In the next article we'll look at SNS and the fanout pattern — the answer to the scenario SQS can't answer: "N consumers each processing the same event independently." The SQS + SNS combination is the most frequently seen decoupling architecture in AWS, and understanding the division of labor between the two naturally leads to the extension into EventBridge and Kinesis.

---

## 📝 연습 문제

**문제 1.** A payment service requires that "the same customer's payments are processed exactly once, in the order they occur." Throughput is on the order of tens of requests per second per customer. What is the most appropriate SQS configuration?

A) Standard SQS + client-side idempotency key
B) FIFO SQS + MessageGroupId = customerId + ContentBasedDeduplication
C) Standard SQS + a very large visibility timeout
D) FIFO SQS + the same MessageGroupId for all messages

**정답: B**
해설: "Exactly once + ordering" is the definition of FIFO, and since ordering is needed per customer, setting MessageGroupId to customerId gives parallelism across customers and serialization within a single customer. Turning on ContentBasedDeduplication automatically uses a SHA-256 hash of the body as the dedup ID, preventing duplicate publishing of the same message within the 5-minute window. A pushes the "exactly once" requirement onto the application rather than SQS and guarantees no ordering. C has nothing to do with the visibility timeout. D means "all messages in one group" = all processing serialized onto a single partition, capping throughput at 300 msg/s and losing cross-customer parallelism — a common mistake.

---

**문제 2.** A Lambda takes an average of 80 seconds to process an SQS message. The queue's visibility timeout is the default (30 seconds). What behavior will be observed in production?

A) After 80 seconds the Lambda completes normally and the message is automatically deleted
B) Multiple Lambda instances receive the same message and process it in duplicate, potentially causing duplicate DB writes / duplicate payments
C) The message is permanently lost
D) It moves to the DLQ immediately, regardless of maxReceiveCount

**정답: B**
해설: When the visibility timeout is shorter than the processing time, the message returns to visible before the consumer calls DeleteMessage, and another consumer picks it up. This is the direct consequence of SQS at-least-once and the most common bug in production. The fix is one or more of: ① increase the visibility timeout to 2-3× the processing time, ② extend a heartbeat mid-processing with `ChangeMessageVisibility`, ③ consumer-side idempotency (record the message ID as a unique key). Ideally the ①+③ combination is safest. A misunderstands the definition of visibility timeout, C is wrong because the message isn't lost within the retention period (4 days by default), and D is wrong because a message moves to the DLQ only after exceeding maxReceiveCount.

---

**문제 3.** A company's SQS consumer attempted to process some messages more than 5 times each due to external payment API failures, and those messages retried infinitely, stalling the queue. What is the most effective way to solve this?

A) maxReceiveCount=3 + DLQ configuration + a CloudWatch Alarm on the DLQ message count
B) Increase the Visibility Timeout to 12 hours to reduce retry frequency
C) Change SQS Standard to FIFO
D) Set Lambda concurrency to unlimited

**정답: A**
해설: The standard solution to the poison message problem is DLQ + maxReceiveCount. After 3 failures the message is automatically isolated to the DLQ, preventing queue stalls, and the operator can analyze the cause in the DLQ and then reprocess via the Redrive API. Since messages piling up in the DLQ is itself abnormal, you must be alerted via a CloudWatch Alarm — the omission of which was the direct cause of the 2020 Robinhood incident. B only delays the problem by 12 hours without solving it. C is a change of message model, unrelated to failure isolation. D actually makes things worse by putting an even bigger load on the external API.

---

**문제 4.** To minimize the number of SQS ReceiveMessage API calls for cost savings while still processing messages quickly upon arrival, what is the most appropriate configuration?

A) Poll ReceiveMessage in short bursts every 100ms (short polling)
B) Long polling with WaitTimeSeconds=20 and MaxNumberOfMessages=10 batching
C) Change the Standard queue to FIFO
D) Trigger on message arrival with CloudWatch Events

**정답: B**
해설: Long polling (up to 20 seconds) makes the cost of empty responses nearly 0, and since the response comes the instant a message arrives, latency is good too. It's the AWS official recommendation and the answer in almost every scenario. Receiving batches of 10 makes per-call cost 1/10. A is a cost bomb from empty polling. C is a message model issue, unrelated to polling cost. D is wrong because there's no direct EventBridge integration that uses SQS message arrival as a trigger (the Lambda Event Source Mapping does long polling internally).

---

**문제 5.** A system needs to deliver PDF attachments averaging 500KB through a queue. How do you handle SQS's 256KB limit?

A) Split the message into 256KB chunks and send as multiple messages
B) Upload the file to S3 and include only the S3 object reference in the SQS message (Extended Client Library)
C) Switch to a FIFO queue, which allows up to 1MB
D) Migrate to Kinesis Data Streams

**정답: B**
해설: The SQS Extended Client Library automatically uploads the payload to S3 and puts only the S3 reference in the message. The consumer-side library automatically downloads from S3 and cleans up after processing. It's the same standard pattern as KIP-405 in the Kafka world. A breaks message ordering/consistency guarantees and makes consumer-side reassembly complex. C is misinformation — 256KB is the same for FIFO. D is wrong because Kinesis also has a 1MB-per-record limit and doesn't replace SQS's queue model either. That said, there are scenarios where moving to Kinesis is correct (multiple consumers independently processing the same data), which we'll cover on Day 4.

---

**문제 6.** You're running SQS consumers on an EC2 Auto Scaling Group. What is the most recommended scaling metric?

A) CPU utilization above 70%
B) Always +1 instance whenever queue length exceeds 1,000
C) A target value for ApproximateNumberOfMessagesVisible ÷ number of InService instances (Backlog per Instance)
D) A fixed 5-minute schedule

**정답: C**
해설: A simple queue-length basis (B) has the inefficiency of scaling at the same threshold whether there's 1 instance or 100. A CPU basis (A) has the problem that when SQS workers are I/O bound, backlog builds up even while CPU is low. Setting Backlog per Instance (the number of messages each instance must process) as a target tracking policy automatically adjusts instance count in proportion to load. It's the recommended pattern in the AWS official whitepaper. D can't respond to traffic fluctuation. For Lambda consumers this is automatic, but for EC2/ECS you have to build the custom metric yourself.

---

**문제 7.** A company is receiving messages from an SNS topic into an SQS Standard queue, and observed that some messages arrive twice within 1 minute. What is the most likely cause and solution combination?

A) An SNS bug / contact AWS Support
B) The at-least-once nature of SQS Standard / implement consumer-side idempotency based on message ID
C) A network problem / VPC Endpoint configuration
D) Misconfigured DLQ / remove the DLQ

**정답: B**
해설: SQS Standard is by definition at-least-once, and this characteristic is preserved through the SNS → SQS integration as well. The same message arriving twice is not a bug but specified behavior. The solution is for the consumer to take the message ID (or a business idempotency key) and prevent duplicate processing with a mechanism like a DynamoDB conditional write. If double processing must absolutely never happen, you have to go to the SNS FIFO + SQS FIFO combination (with the throughput constraint, though). A mistakes normal behavior for a bug. C is irrelevant. D is unrelated to the DLQ.

---

Additional explanation: The SQS patterns we saw in this article are a case study of how AWS split and exposed the fundamental trade-offs of distributed systems (throughput vs ordering, at-least-once vs exactly-once) into two queue types. On the SAA exam you can solve these quickly with "keyword → queue type mapping," but the three most common incidents in practice are ① visibility timeout < processing time → duplicate processing, ② missing DLQ alarm → queue stall, ③ FIFO with all messages in a single group → throughput bottleneck. If you turn these three into a code-review checklist, you can prevent half of your operational incidents in advance.
