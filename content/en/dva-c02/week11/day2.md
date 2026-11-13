# Day 2 - SNS: Publish Once and Everyone Hears It

SQS in the previous article was a point-to-point model where "exactly one consumer takes a message." But many real-world events are of the kind "it happened once, but several places must react." When a single order is created, the inventory system, the payment system, the notification system, and the data warehouse all need to know at the same time. To do this with SQS, the producer would have to send the same message to 4 queues 4 times, and every time a new subscriber is added, the producer code would have to change. The **publish-subscribe** model flips this problem around. The producer publishes to a "topic" just once and doesn't care who is listening. Amazon SNS is a fully managed implementation of this model.

On DVA-C02, SNS often appears paired with SQS. There are standalone questions too (filter policies, FIFO topics), but the central topic is "**fanout**," the pattern of combining SNS and SQS to reliably spread one event to several queues. This article covers why publish-subscribe decouples producers from subscribers, how SNS's "push, non-retaining" complements SQS's "pull, retaining," and how filter policies select messages "without subscriber code."

## Publish-Subscribe: Making the Producer Unaware of Subscribers

The central concept of SNS is the **topic**. The producer `publish`es a message to a topic, and that is all. The topic **immediately pushes** that message to every registered subscriber. Whether there is 1 subscriber or 10,000, the producer code is the same, and the producer is unaffected when subscribers are added or removed. This property that "the producer doesn't know subscribers exist" is the essential value of the publish-subscribe model.

```python
import boto3

sns = boto3.client('sns')

# Create the topic - the producer knows only this topic
topic_arn = sns.create_topic(Name='OrderEvents')['TopicArn']

# Register various subscribers (can be added regardless of the producer code)
sns.subscribe(TopicArn=topic_arn, Protocol='sqs',
              Endpoint='arn:aws:sqs:...:inventory-queue')
sns.subscribe(TopicArn=topic_arn, Protocol='lambda',
              Endpoint='arn:aws:lambda:...:function:notify')
sns.subscribe(TopicArn=topic_arn, Protocol='email',
              Endpoint='ops@example.com')

# Publish - doesn't care who is listening
sns.publish(
    TopicArn=topic_arn,
    Message='{"orderId": "O001", "status": "created"}',
    MessageAttributes={'orderType': {'DataType': 'String', 'StringValue': 'premium'}}
)
```

Publish-subscribe extends the **Observer Pattern** of software design to a distributed environment. In the GoF design pattern, the Observer is "the Subject notifies Observers of state changes," but the Subject holds the list of observers directly, so coupling remains. Messaging pub/sub inserts a **topic (broker)** in between so that the subject and observers don't know each other at all (spatial decoupling). Thanks to this, when expanding the system, features grow just by "adding a new subscriber," and existing code needn't be touched. It is the foundation of event-driven architecture (EDA).

The most important contrast between SNS and SQS is "message retention." **SNS does not store messages.** It pushes to subscribers at the moment of publishing, and if the push fails (after retries per the retry policy), the message is gone. SQS, on the other hand, retains messages for up to 14 days.

- If SNS pushes directly to Lambda or an HTTP endpoint and that target is briefly down, the message is lost forever once the retries are exhausted.
- So for events that "must never be lost," you have SNS **push to SQS**. Once SNS puts it into SQS, SQS safely retains the message until the consumer comes back.
- This is why the fanout pattern is a durability design, not just a convenience.

## Fanout: Combining SNS's Push with SQS's Retention

The fanout pattern is a structure that spreads messages from an **SNS topic → multiple SQS queues**. Each SQS queue is connected to an independent consumer (usually Lambda or a processing service).

```
Fanout architecture
================================
[Order service] ──publish──> [SNS topic: OrderEvents]
                                  │
                  ┌───────────────┼───────────────┐
                  ▼               ▼               ▼
            [SQS: inventory] [SQS: payment]  [SQS: analytics]
                  │               │               │
                  ▼               ▼               ▼
         [Lambda inventory] [Lambda payment] [Firehose→S3]
```

There are three reasons to insert SQS instead of having SNS invoke several Lambdas directly.

- **Durability**: Even if a consumer is down, messages pile up safely in its own SQS queue and wait.
- **Buffering**: Even if events suddenly surge, each queue acts as a buffer so consumers process at their own pace.
- **Independent retries and DLQ**: If payment processing fails, only the message in the payment queue is retried and isolated to that queue's DLQ. Inventory processing is unaffected.

Fanout combines the strengths of each: SNS's "multi-delivery from a single publish" and SQS's "reliable retention and retries."

The classic use of this pattern is **S3 event branching**. An S3 bucket is practically limited to one direct target for a single event type (e.g., `s3:ObjectCreated:*`). So to do "thumbnail generation, virus scanning, and metadata indexing at the same time for one upload," you have to solve it with S3 → SNS → multiple SQS fanout. Recently EventBridge provides richer routing and filtering, so S3 → EventBridge → multiple targets is also used, but when the exam asks about the "canonical fanout," SNS+SQS is the default answer. The difference between the two approaches is "simple replicated delivery" (SNS) versus "content-based complex routing" (EventBridge).

> ⚠️ **Pitfall**: If you see wording like "one event processed by several consumers simultaneously," the answer is SNS (or EventBridge), and SQS alone is wrong. SQS is point-to-point where only one consumer takes a message, so several consumers cannot receive the same message. Conversely, "a message processed by exactly one worker (work queue)" means SQS. SNS/SQS selection questions usually split on "1:N or 1:1."

## Filter Policy: Selecting Messages Without Subscriber Code

When doing fanout, a requirement arises: "this queue should receive only premium orders, and that queue only regular orders." A naive solution has every queue receive every message, and each consumer writes code that says "this isn't mine" and discards it. Unnecessary message delivery and processing cost are wasted. A **Filter Policy** has SNS do this selection for you **before delivery**.

```python
# This subscription receives only messages whose orderType is premium
sns.set_subscription_attributes(
    SubscriptionArn='arn:aws:sns:...:premium-sub',
    AttributeName='FilterPolicy',
    AttributeValue='{"orderType": ["premium"], "price": [{"numeric": [">", 1000]}]}'
)
```

A filter policy is matched against the message's attributes, and messages that don't match are **not delivered at all** to that subscriber. Since the subscriber receives only messages relevant to it, the code gets simpler and there is no cost for messages that weren't delivered.

| Matching operation | Example |
|-----------|------|
| Exact match | `{"store": ["seoul", "busan"]}` |
| Negation | `{"event": [{"anything-but": "test"}]}` |
| Numeric comparison | `{"price": [{"numeric": [">", 100]}]}` |
| Existence | `{"size": [{"exists": true}]}` |
| Prefix | `{"region": [{"prefix": "ap-"}]}` |

Basic filtering inspects only the message **attributes (MessageAttributes)**. To filter on fields inside the message body (payload), you must explicitly turn on `FilterPolicyScope` as `MessageBody` (added in 2022). The reason body filtering isn't the default is that attributes are metadata with a simple structure and light parsing, while the body is arbitrary JSON and parsing it every time is expensive. It reflects the general messaging principle "put the information needed for routing in headers (attributes) and keep the payload separate from routing." It's the same idea as AMQP's headers exchange and HTTP's header-based routing.

A filter policy implements the **Content-Based Router** pattern on the broker (SNS) side rather than on the subscriber side.

- If you leave the routing decision to consumers, every consumer must receive every message and judge it themselves (waste).
- If you set up a separate router service, that router becomes a single point of failure.
- SNS embeds routing rules in the topic as subscription attributes, so the broker does the routing without additional infrastructure.
- However, the expressiveness of the filter is more limited than EventBridge's event patterns, so if complex conditional routing is needed, EventBridge is more suitable.

## SNS FIFO: Guaranteeing Order at Both Ends

Just as SQS has FIFO, SNS has FIFO topics. The topic name gets the `.fifo` suffix, and it can be **subscribed to only by SQS FIFO queues**. This is because both ends must be FIFO for the order guarantee to remain unbroken from publishing to consumption. Even if SNS FIFO pushes in order, if the receiving side is standard SQS, the order breaks there.

```python
topic_arn = sns.create_topic(
    Name='orders.fifo',
    Attributes={'FifoTopic': 'true', 'ContentBasedDeduplication': 'true'}
)['TopicArn']
```

The SNS FIFO + SQS FIFO combination is used for "fanning out order-sensitive events to multiple consumers in order." The trade-off that throughput is lower than a standard topic (around 300 msg/s) and cost is higher is the same as SQS FIFO.

## Where Delivery Failures Go: Retries and SNS DLQ

SNS is non-retaining, but it doesn't give up on the first failure. The **retry policy** differs per subscription protocol. HTTP/HTTPS endpoints retry by default up to 50 times over about 1 hour (including exponential backoff). AWS-internal targets such as SQS and Lambda retry more aggressively. Even so, when all retries are exhausted the message is gone, and at that point, setting a **subscription-level SNS DLQ** (redrive policy) lets you send failed-delivery messages to an SQS DLQ to preserve them.

> ⚠️ **Pitfall**: Don't confuse SNS's "no message retention" with the "subscription DLQ." SNS itself doesn't store messages, but the subscription DLQ is the safety net that holds failed messages when delivery to a particular subscription fails. "SNS DLQ" and "Lambda DLQ" are different layers. The SNS DLQ catches cases where "SNS fails to deliver to a subscriber," and the Lambda DLQ catches cases where "Lambda fails to process an asynchronous invocation." The exam may swap the two in questions.

SNS is also used as a backend for mobile push notifications. It pushes to iOS through **APNs**, Android through **FCM** (formerly GCM), and Amazon devices through **ADM**, and SNS abstracts the protocol differences among these platforms and unifies them into a single `publish`. When you register a device token with SNS, a platform endpoint ARN is created, and afterward you can send notifications without being aware of the platform. SNS Mobile Push is the answer to scenarios like "unified push notifications to several mobile platforms."

## Summary

The one sentence that runs through SNS is "publish once, and it is pushed to everyone while the producer doesn't know the subscribers." The publish-subscribe model completely separates the Observer pattern via a broker called the topic, and the price for that is "no message retention." That is why **fanout**, combining SNS's immediate push with SQS's reliable retention, is the standard for durable 1:N distribution rather than a mere convenience. Filter policies embed content-based routing in the broker to handle selection without subscriber code, FIFO topics preserve order at both ends, and subscription DLQs become the safety net of the non-retaining model. SNS and SQS are not competitors; they are most powerful when used together with divided roles of "push, non-retaining, 1:N" and "pull, retaining, 1:1."

In the next article, unlike SQS and SNS where messages "disappear once processed," we move on to Kinesis, which retains data in a stream so multiple consumers can repeatedly read from their own positions.

---

## 📝 Practice Questions

**Question 1.** For a single S3 object upload, thumbnail generation, virus scanning, and metadata indexing must each be handled independently. What is the most appropriate pattern?

A) Send the S3 event to one SQS queue and have one Lambda handle all three tasks

B) Fan out S3 → SNS → three SQS queues (each connected to a Lambda)

C) S3 → run all three tasks sequentially in a single Lambda

D) Create three S3 buckets and handle each separately

**Answer: B**

Explanation: Since the three tasks must be handled **independently** (unaffected by each other's failures), fanout is appropriate. SNS spreads one event to three SQS queues simultaneously, and each queue has its own buffering, retries, and DLQ. Even if virus scanning fails, thumbnail generation is unaffected. In A and C, one task's failure blocks everything and independent scaling isn't possible. D is an unrealistic design that requires uploading the same object three times.

---

**Question 2.** In a configuration where SNS pushes directly to Lambda, messages published while Lambda was briefly down were lost. How do you secure durability?

A) Increase SNS's message retention period

B) Change to an SNS → SQS → Lambda structure, so SNS puts messages into SQS and SQS retains them

C) Reduce the SNS publish frequency

D) Increase Lambda memory

**Answer: B**

Explanation: **SNS does not retain messages.** Once retries are exhausted the message is gone, so durability against consumer downtime cannot be obtained with SNS alone. When SNS **pushes to SQS**, SQS retains the message for up to 14 days, so it waits safely until Lambda comes back - this is why fanout is a durability design. A) SNS has no retention period to increase in the first place. C and D are unrelated to the cause of the loss.

---

**Question 3.** In an SNS fanout, a specific SQS queue must receive only messages with `orderType=premium`. How do you implement this without additional infrastructure?

A) Write code so each SQS consumer receives messages and discards those that are not premium

B) Set a FilterPolicy on the SNS subscription so only premium messages are delivered to that queue

C) Put in a separate router Lambda to classify

D) Filter with an SQS queue policy

**Answer: B**

Explanation: A **filter policy** has SNS inspect message attributes **before** delivery and not send non-matching messages to that subscriber at all. Subscriber code gets simpler and there is no unnecessary delivery cost. This embeds content-based routing in the broker. A) Having consumers discard means receiving every message, wasting processing and cost. C) A router Lambda is unnecessary extra infrastructure and a single point of failure. D) An SQS queue policy is for access control, not content filtering.

---

**Question 4.** What is the most accurate fundamental difference between SNS and SQS?

A) SNS is more expensive

B) SNS is Push, non-retaining, 1:N (delivers to multiple subscribers simultaneously); SQS is Pull, retaining, 1:1 (one consumer takes it)

C) SNS guarantees order and SQS cannot

D) SNS has Region restrictions

**Answer: B**

Explanation: SNS **pushes** to all subscribers immediately upon publishing, **does not retain** messages, and a message is received by **multiple subscribers** (1:N). SQS has consumers actively **pull**, **retains** messages, and only **one consumer** takes a message (1:1). This division of roles is the basis of fanout, which combines the two. A) Cost is not the essential difference. C) FIFO exists on both sides. D) Both are Regional services.

---

**Question 5.** You want to filter on the value of a JSON field inside the SNS message body (payload). Why doesn't it work with the default settings, and what is the fix?

A) SNS does not support filtering

B) The default filter inspects only message attributes, so you must set FilterPolicyScope to MessageBody

C) Body filtering is possible only with Lambda

D) The message must be sent as FIFO

**Answer: B**

Explanation: SNS filter policies by default inspect only **message attributes (MessageAttributes)**. To filter on message body fields, you must explicitly set the subscription attribute `FilterPolicyScope` to `MessageBody` (added in 2022). The reason attributes are the default is the messaging principle "routing information in headers, payload separate" and the cost of parsing the body. A) Body filtering is supported. C and D are unrelated.

---

**Question 6.** Order-sensitive order events must be fanned out to several consumers in order. What is the correct configuration?

A) Standard SNS topic → standard SQS queues

B) SNS FIFO topic → SQS FIFO queues

C) SNS FIFO topic → standard SQS queues

D) Standard SNS topic → SQS FIFO queues

**Answer: B**

Explanation: For the order guarantee to remain unbroken from publishing to consumption, **both ends must be FIFO**. An SNS FIFO topic can be subscribed to **only by SQS FIFO queues**. C) Even if the FIFO topic pushes in order, standard SQS receiving it breaks the order there, and the subscription isn't allowed in the first place. In A and D, one side is standard, so order is not guaranteed.

---

**Question 7.** When SNS repeatedly fails to deliver to an HTTPS endpoint, how can you preserve the messages for later analysis?

A) Turn on SNS message retention

B) Set an SNS DLQ (SQS queue) on that subscription with a redrive policy

C) Set a Lambda DLQ

D) Set only a CloudWatch alarm

**Answer: B**

Explanation: SNS itself is non-retaining, but if you set a **subscription-level DLQ (redrive policy)**, messages that failed delivery after retries are exhausted can be sent to the specified SQS queue and preserved. A) SNS has no retention feature to turn on. C) The Lambda DLQ is a different layer that catches "Lambda asynchronous invocation failures," and here it is an HTTPS delivery failure, so the SNS subscription DLQ is correct. D) An alarm is only a notification and does not preserve messages.
