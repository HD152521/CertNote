# Day 2 - SNS: Publish Once and Everyone Hears

The SQS of the previous article was a point-to-point model in which "one message is taken by exactly one consumer." But many real-world events are "something happened once, and several places must react." When a single order is created, the inventory system, the payment system, the notification system, and the data warehouse all need to know about it at the same time. To do this with SQS, the producer would have to send the identical message 4 times to 4 queues, and every time a new subscriber is added, the producer code would have to be changed. The **publish-subscribe** model flips this problem. The producer publishes only once to a "topic" and does not care who is listening. Amazon SNS is a fully managed implementation of this model.

In DVA-C02, SNS often comes paired with SQS. There are standalone questions (filter policies, FIFO topics), but the central theme is "**fanout**," that is, the pattern of combining SNS and SQS to spread one event reliably to multiple queues. This article covers why publish-subscribe separates producers from subscribers, how SNS's "push, non-retaining" model complements SQS's "pull, retaining" model, and how filter policies select messages "without any subscriber code."

## Publish-Subscribe: Making the Producer Unaware of Its Subscribers

The central concept of SNS is the **topic**. The producer `publish`es a message to the topic, and that is all. The topic **immediately pushes** that message to every registered subscriber. Whether there is 1 subscriber or 10,000, the producer code is the same, and the producer is unaffected when subscribers are added or removed. This property, "the producer does not know the subscribers exist," is the essential value of the publish-subscribe model.

```python
import boto3

sns = boto3.client('sns')

# Create a topic - the producer knows only this topic
topic_arn = sns.create_topic(Name='OrderEvents')['TopicArn']

# Register a variety of subscribers (can be increased independently of the producer code)
sns.subscribe(TopicArn=topic_arn, Protocol='sqs',
              Endpoint='arn:aws:sqs:...:inventory-queue')
sns.subscribe(TopicArn=topic_arn, Protocol='lambda',
              Endpoint='arn:aws:lambda:...:function:notify')
sns.subscribe(TopicArn=topic_arn, Protocol='email',
              Endpoint='ops@example.com')

# Publish - does not care who is listening
sns.publish(
    TopicArn=topic_arn,
    Message='{"orderId": "O001", "status": "created"}',
    MessageAttributes={'orderType': {'DataType': 'String', 'StringValue': 'premium'}}
)
```

Publish-subscribe extends the software design **Observer Pattern** to a distributed environment. In the GoF design patterns, the Observer has a "Subject notify its Observers of state changes," but the Subject itself holds the list of observers, so coupling remains. Messaging's pub/sub inserts a **topic (broker)** in between, separating the subject and the observers completely so that they do not know each other at all (spatial decoupling). Thanks to this, when you extend the system, features grow just by "adding a new subscriber," and the existing code does not need to be touched. It is the foundation of event-driven architecture (EDA).

The most important contrast between SNS and SQS is "message retention." **SNS does not store messages.** It pushes to subscribers at the moment of publishing, and if the push fails (after retries according to the retry policy), the message disappears. SQS, on the other hand, retains messages for up to 14 days.

- If SNS pushes directly to Lambda or an HTTP endpoint and that target is down for a moment, the message is lost forever once the retries are exhausted.
- That is why an event that "must never be lost" is made to be **pushed by SNS into SQS**. Once SNS puts it into SQS, SQS then safely retains the message until the consumer comes back.
- This is why the fanout pattern is not mere convenience but a durability design.

## Fanout: Combining SNS's Push with SQS's Retention

The fanout pattern is a structure that spreads a message from an **SNS topic to multiple SQS queues**. Each SQS queue is connected to an independent consumer (usually Lambda or a processing service).

```
Fanout architecture
================================
[Order service] ──publish──> [SNS topic: OrderEvents]
                                  │
                  ┌───────────────┼───────────────┐
                  ▼               ▼               ▼
          [SQS: inventory]  [SQS: payment]  [SQS: analytics]
                  │               │               │
                  ▼               ▼               ▼
        [Lambda inventory] [Lambda payment] [Firehose→S3]
```

There are three reasons to insert SQS rather than have SNS invoke several Lambdas directly.

- **Durability**: Even if a consumer goes down, messages pile up safely in its own SQS queue and wait.
- **Buffering**: Even if events suddenly spike, each queue acts as a buffer and the consumer processes at its own pace.
- **Independent retries and DLQs**: If payment processing fails, only the messages in the payment queue are retried and isolated into that queue's DLQ. Inventory processing is unaffected.

Fanout combines the strengths of each: SNS's "multiple delivery from a single publish" and SQS's "reliable retention and retry."

The typical use of this pattern is **S3 event branching**. For a single event type (for example `s3:ObjectCreated:*`), an S3 bucket can in practice connect directly to only one target. So to do "thumbnail generation, virus scanning, and metadata indexing simultaneously for one upload," you have to solve it with an S3 -> SNS -> multiple SQS fanout. Recently EventBridge provides richer routing and filtering, so S3 -> EventBridge -> multiple targets is also used, but when the exam asks about "the canonical fanout," SNS+SQS is the default answer. The difference between the two approaches is whether it is "simple replicated distribution" (SNS) or "complex content-based routing" (EventBridge).

> ⚠️ **Pitfall**: If you see the phrase "multiple consumers process one event simultaneously," the answer is SNS (or EventBridge), and SQS alone is wrong. SQS is point-to-point, where only one consumer takes a message, so multiple consumers cannot receive the same message. Conversely, if it is "exactly one worker processes one message (a work queue)," it is SQS. SNS/SQS selection questions usually come down to "1:N or 1:1."

## Filter Policy: Selecting Messages Without Subscriber Code

When you do fanout, a requirement arises: "this queue should receive only premium orders, and that queue only regular orders." Solved naively, every queue receives every message and each consumer writes code that discards with "this one is not mine." Unnecessary message delivery and processing cost are wasted. The **Filter Policy** has SNS do this selection for you **before delivery**.

```python
# This subscription receives only messages whose orderType is premium
sns.set_subscription_attributes(
    SubscriptionArn='arn:aws:sns:...:premium-sub',
    AttributeName='FilterPolicy',
    AttributeValue='{"orderType": ["premium"], "price": [{"numeric": [">", 1000]}]}'
)
```

The filter policy is matched against the message's attributes, and a message that does not match is **not delivered to that subscriber at all**. Because the subscriber receives only the messages relevant to it, the code becomes simpler, and there is no cost for messages that were not delivered.

| Matching operation | Example |
|-----------|------|
| Exact match | `{"store": ["seoul", "busan"]}` |
| Negation | `{"event": [{"anything-but": "test"}]}` |
| Numeric comparison | `{"price": [{"numeric": [">", 100]}]}` |
| Existence | `{"size": [{"exists": true}]}` |
| Prefix | `{"region": [{"prefix": "ap-"}]}` |

By default, filtering inspects only message **attributes (MessageAttributes)**. To filter on a field inside the message body (payload), you have to explicitly turn on `FilterPolicyScope` as `MessageBody` (added in 2022). The reason body filtering is not the default is that attributes are metadata with a simple structure and light parsing, while the body is arbitrary JSON and parsing it every time is costly. It reflects the general messaging principle: "keep the information needed for routing in the header (attributes) and keep the payload separate from routing." It is the same idea as AMQP's headers exchange and HTTP's header-based routing.

The filter policy implements the **Content-Based Router** pattern on the broker (SNS) side rather than the subscriber side.

- If you leave the routing decision to the consumer, every consumer has to receive every message and judge for itself (waste).
- If you set up a separate router service, that router becomes a single point of failure.
- SNS embeds the routing rules into the topic as subscription attributes, so the broker does the routing with no additional infrastructure.
- However, the filter's expressiveness is more limited than EventBridge's event patterns, so EventBridge is a better fit when complex conditional routing is needed.

## SNS FIFO: Guaranteeing Order at Both Ends

Just as SQS has FIFO, SNS has FIFO topics. The topic name carries the `.fifo` suffix, and it can **subscribe only to SQS FIFO queues**. That is because both ends must be FIFO for the ordering guarantee to remain unbroken from publishing through consumption. Even if SNS FIFO pushes in order, if the receiving side is a standard SQS queue, the order breaks there.

```python
topic_arn = sns.create_topic(
    Name='orders.fifo',
    Attributes={'FifoTopic': 'true', 'ContentBasedDeduplication': 'true'}
)['TopicArn']
```

The SNS FIFO + SQS FIFO combination is used when you "fan out order-sensitive events to several consumers in order." The trade-off that throughput is lower than a standard topic (around 300 msg/s) and cost is higher is the same as with SQS FIFO.

## Where Do Delivery Failures Go: Retries and the SNS DLQ

SNS does not retain messages, but it does not give up on a single failure. The **retry policy** differs by subscription protocol. HTTP/HTTPS endpoints are retried by default up to 50 times over about 1 hour (including exponential backoff). Targets inside AWS such as SQS and Lambda are retried more aggressively. Even so, if all the retries are exhausted, the message disappears; at that point, if you configure a **subscription-level DLQ in SNS** (redrive policy), you can send the failed-delivery messages to an SQS DLQ and preserve them.

> ⚠️ **Pitfall**: Do not confuse SNS's "no message retention" with the "subscription DLQ." SNS itself does not store messages, but the safety net that holds a failed message when delivery to a particular subscription fails is the subscription DLQ. The "SNS DLQ" and the "Lambda DLQ" are at different layers. The SNS DLQ catches the case where "SNS failed to deliver to the subscriber," while the Lambda DLQ catches the case where "Lambda failed to process an asynchronous invocation." The exam may swap the two.

SNS is also used as the backend for mobile push notifications. It pushes to **APNs** for iOS, **FCM** (formerly GCM) for Android, and **ADM** for Amazon devices, and SNS abstracts the protocol differences among these platforms and unifies them into a single `publish`. When you register a device token with SNS, a platform endpoint ARN is created, and afterwards you can send notifications without being conscious of the platform. The answer to the scenario "unified push notifications to multiple mobile platforms" is SNS Mobile Push.

## Summary

The single sentence that runs through SNS is "publish once, and it is pushed to everyone without the producer knowing the subscribers." The publish-subscribe model is the Observer pattern fully decoupled by a broker called the topic, and its price is "no message retention." That is why **fanout**, which combines SNS's immediate push with SQS's reliable retention, is not mere convenience but the standard for durable 1:N distribution. The filter policy builds content-based routing into the broker so selection is handled without subscriber code, FIFO topics preserve order at both ends, and the subscription DLQ becomes the safety net of the non-retaining model. SNS and SQS are not competitors; they are most powerful when used together, dividing roles as "push, non-retaining, 1:N" and "pull, retaining, 1:1."

The next article moves on to Kinesis. Unlike SQS and SNS, where a message "disappears once processed," Kinesis retains data in a stream so that multiple consumers can each read it repeatedly from their own position.

---

## 📝 Practice Questions

**Question 1.** When multiple Lambda functions need to process one event simultaneously?

A) Use SQS alone  
B) SNS fanout (SNS → multiple SQS → multiple Lambda)  
C) Use EventBridge alone  
D) Use Kinesis  

**Answer: B** - Fanout pattern delivers message from SNS to multiple SQS simultaneously for independent processing.

---

**Question 2.** To deliver messages with specific attribute values only to certain subscribers?

A) SNS access policy  
B) SNS filter policy  
C) SQS queue policy  
D) Lambda environment variables  

**Answer: B** - SNS filter policy delivers messages to specific subscribers based on message attributes.

---

**Question 3.** What is the most significant difference between SNS and SQS?

A) Price difference  
B) SNS is Push (immediate delivery), SQS is Pull (consumer receives)  
C) Security difference  
D) Region restriction  

**Answer: B** - SNS pushes to all subscribers immediately, while SQS requires consumers to pull messages.

---

**Question 4.** When S3 events need to be delivered to multiple Lambda functions simultaneously?

A) S3 event → Lambda directly (multiple configurations)  
B) S3 event → SNS → multiple Lambda/SQS  
C) Use CloudWatch Events  
D) Not possible  

**Answer: B** - S3 can only set one event target directly, so SNS is used in between for fanout.

---

**Question 5.** What is the default behavior when SNS fails to deliver a message to Lambda?

A) Auto-move to SQS  
B) Retry then lose message  
C) Auto-move to DLQ  
D) Email notification  

**Answer: B** - SNS retries then loses the message on failure by default. Must set Lambda DLQ or Destinations.

---

**Question 6.** Order events whose order matters must be fanned out to multiple consumers in order. What is the correct configuration?

A) Standard SNS topic -> standard SQS queues
B) SNS FIFO topic -> SQS FIFO queues
C) SNS FIFO topic -> standard SQS queues
D) Standard SNS topic -> SQS FIFO queues

**Answer: B** - For the ordering guarantee to stay unbroken from publishing to consumption, **both ends must be FIFO**. An SNS FIFO topic can be subscribed to **only by SQS FIFO queues**. C) Even if the FIFO topic pushes in order, a standard SQS queue breaks the order at that point, and such a subscription is not allowed in the first place. In A and D, one side is standard, so ordering is not guaranteed.

---

**Question 7.** When SNS repeatedly fails to deliver to an HTTPS endpoint, how can you preserve the messages for later analysis?

A) Turn on SNS message retention
B) Configure an SNS DLQ (an SQS queue) on that subscription with a redrive policy
C) Configure a Lambda DLQ
D) Only set a CloudWatch alarm

**Answer: B** - SNS itself does not retain messages, but if you configure a **DLQ (redrive policy) per subscription**, messages that fail delivery after retries are exhausted are sent to the specified SQS queue and preserved. A) SNS has no retention feature to turn on. C) A Lambda DLQ is a different layer that catches "failed asynchronous Lambda invocations"; here the failure is HTTPS delivery, so the SNS subscription DLQ is correct. D) An alarm is only a notification and cannot preserve messages.

---

## 📌 Today's Summary

1. SNS: Fully managed pub/sub, Push model, immediate delivery
2. Fanout: SNS → multiple SQS, single event processes by multiple consumers in parallel
3. Filter policy: Selective delivery based on message attributes
4. SNS FIFO: Order guarantee, deduplication, only SQS FIFO can subscribe
5. SNS vs SQS: SNS is Push/immediate/non-retained, SQS is Pull/retained
