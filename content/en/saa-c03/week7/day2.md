# Day 2 - SNS: Topics, Fanout, and How 1:N Notifications Get Made

The SQS we saw on Day 1 was a queue model — "decouple two components in time, but each message is consumed once and disappears." Yet in real systems it's far more common for a single event — "an order came in" — to need to be known **independently** by six different places: payment, inventory, shipping, email, search index, and data warehouse. In a queue, once one consumer takes a message, no other consumer can see it, so to solve this scenario with queues you'd have to create six queues and have the producer send six times. Every time a new consumer is added, the producer's code has to change — and this is the very definition of the "tightly coupled module" Edsger Dijkstra pointed out in 1968.

The **Publish/Subscribe** (Pub/Sub) pattern has been the answer to this problem since the ISIS system days of 1987. The producer publishes to a "topic" just once and doesn't know who subscribes to it. Subscribers are added and removed freely, and the topic is the indirection layer between the two. AWS's **SNS (Simple Notification Service)**, launched in April 2010, is the managed implementation of this model, and paired with SQS (launched in 2006) it serves as the backbone of nearly every event-driven architecture on AWS. This article looks at why SNS was designed the way it was, which trade-offs it shares with SQS, and what the pitfalls are on the exam and in operations.

## Topics and Subscriptions: The Freedom That Indirection Creates

SNS's model is simple. A **Topic** is the indirection point, a **Subscription** is an endpoint listening to that topic, and **Publish** is the act of throwing a message at the topic. Publish once, and SNS fans it out across all subscriptions of that topic and pushes it to each one. Push is the key here — this is the exact opposite of SQS's pull (where the consumer calls ReceiveMessage), and it's the branch point that separates the two systems' design choices.

The subscribable protocols have kept growing over time. At launch in 2010 it was just HTTP/HTTPS, Email, SQS, and SMS, but now it includes Lambda (2015), Mobile Push (APNS/FCM/Baidu, 2010-2013), Kinesis Data Firehose (2021), and EventBridge Pipes (2022). This is SNS's real value — publish once, and it goes to email, to mobile push, into a queue, and gets loaded into a data warehouse. The producer needs to know nothing about this diversity.

| Aspect | SNS Standard | SNS FIFO |
|--------|-------------|----------|
| Throughput | Tens of thousands of TPS per region, effectively unlimited | 300 TPS per topic (3,000 with batching) |
| Ordering | Best-effort | Strict per MessageGroupId |
| Duplication | At-least-once delivery | 5-minute dedup window |
| Subscribable | SQS, Lambda, Email, SMS, HTTP, Mobile Push, Firehose, EventBridge | **SQS FIFO, Lambda (2023+)** only |
| Message size | 256KB (more with Extended Library) | 256KB |
| Launched | April 2010 | October 2020 |

Standard SNS is at-least-once + best-effort ordering, similar to SQS Standard, and FIFO was launched belatedly in 2020 to pair with SQS FIFO. The fact that SNS FIFO can only take SQS FIFO as a subscription is an exam trap — email and HTTP are channels where ordering/duplication guarantees are inherently impossible (email can be reordered by SMTP relays, HTTP retries on 4xx/5xx), so FIFO semantics break down.

> 💡 **Related theory**: The difference between Pub/Sub and Message Queue was laid out clearly in Gregor Hohpe and Bobby Woolf's *Enterprise Integration Patterns* (2003). A **Point-to-Point Channel** (queue) is one message = one consumer; a **Publish-Subscribe Channel** (topic) is one message = N consumers. The SNS+SQS fanout pattern is the exact managed implementation of "Publish-Subscribe Channel + Message Endpoint" from that book. This pattern exists in the same form in Kafka's consumer groups, Google Pub/Sub's subscriptions, and Azure Service Bus's topic+subscription.

> 🔍 **Going deeper**: How does SNS implement fanout internally? It's not officially disclosed, but from its behavior it's a **subscription registry + per-protocol delivery worker** structure. Publish once → SNS looks up the subscription list → per-protocol workers (SQS sender, Lambda invoker, HTTP poster, etc.) push in parallel. Each worker has its own retry policy, so a slow subscription doesn't affect others. An HTTP/HTTPS subscription gives up immediately on 4xx, and on 5xx retries with exponential backoff up to 100,015 times (over about 23 days) — this is the RFC 7807 recommended behavior and other clouds are similar.

## The Fanout Pattern: Why SNS + SQS Became the De Facto Standard for AWS Decoupling

In theory, SNS can push directly to Lambda or HTTP. Yet most real production systems are designed with one more stage added: **SNS → multiple SQS → each consumer**. Why?

The answer is **buffer**. Because SNS is a push model, if a subscriber can't keep up, you have to rely on SNS's retry, and if too many messages pile up that a Lambda subscription can't process, it gets throttled and the messages back up in SNS's retry queue. SQS, on the other hand, has the consumer pull at its own pace, so the backlog safely accumulates in the queue, and even if the consumer dies and comes back, it processes the messages in the queue as they were. In other words, **SQS acts as a shock absorber between SNS's push and the consumer's processing speed**.

```
[ Order event fanout ]

Order Service
   │ Publish (orderId, customerId, amount, items)
   ▼
SNS Topic: order-events
   │ fanout (parallel)
   ├─→ SQS-Payment       → Lambda payment-handler
   ├─→ SQS-Inventory     → ECS inventory-worker
   ├─→ SQS-Shipping      → Lambda shipping-handler
   ├─→ SQS-Notification  → Lambda email-sender
   ├─→ SQS-Analytics     → Firehose → S3 → Athena
   └─→ SQS-Search-Index  → Lambda → OpenSearch

Each SQS has its own DLQ, its own visibility timeout, its own consumer count
Even if one consumer goes down, the others are unaffected
```

The second benefit of this pattern is **DLQ separation**. SNS can have a DLQ too (launched 2019), but it only catches the case where "SNS failed to push to SQS." What actually matters in production is the case where "the message was received but processing failed," and that has to be caught by each SQS's DLQ. If you rely on the SNS DLQ, you can't tell which consumer failed, making post-mortem analysis hard.

The third benefit is **zero cost to add a new subscriber**. If a new system needs to listen to order events, you just create a new SQS queue and add a subscription to SNS — done. No code change to the existing producer or the other consumers. This is the most frequently seen evolution pattern in microservice architectures.

> ⚠️ **Pitfall**: It's easy to think "isn't SNS → Lambda direct subscription simpler?" but it's weak against traffic spikes due to Lambda concurrency limits, cold starts, and the absence of a DLQ (with direct subscription). The SNS → SQS → Lambda (Event Source Mapping) pattern uses SQS as a natural buffer that protects Lambda. In practice, aside from simple ad-hoc notifications (e.g., CloudWatch Alarm → SNS → Email), it's almost always the standard to insert SQS as an intermediate stage.

## Message Filtering: How to Mix Several Event Types in a Single Topic

By the book, you'd separate topics per event type. Order events, payment events, refund events, shipping-status-change events each in their own topic. But at a real company, once you exceed 30 topics, management explodes. IAM policies, alarms, and the subscription graph all grow, and it takes time to figure out "which topic does this event go to?"

**Subscription Filter Policy** (launched 2018) solves this. Publish several kinds of events to a single topic, but each subscription declares "the conditions for the messages I want to receive" as a JSON policy. SNS filters at publish time and pushes only to matching subscriptions. Subscribers receive only the events they care about, reducing processing cost, and the topic count shrinks, simplifying management.

```json
// Message attributes the publisher sends
"MessageAttributes": {
  "event_type": {"DataType": "String", "StringValue": "order_placed"},
  "customer_tier": {"DataType": "String", "StringValue": "premium"},
  "amount": {"DataType": "Number", "StringValue": "150000"}
}

// Subscription A: receives only orders from premium customers
{
  "event_type": ["order_placed"],
  "customer_tier": ["premium"]
}

// Subscription B: receives only orders of 100,000 KRW or more (numeric comparison)
{
  "amount": [{"numeric": [">=", 100000]}]
}

// Subscription C: all events except refunds
{
  "event_type": [{"anything-but": "refund"}]
}
```

**Payload-Based Filtering**, launched in 2023, goes one step further and filters on fields in the body (JSON body) rather than message attributes. Previously the publisher had to duplicate body data into message attributes, but now you can leave the body as is and filter on it. The only condition is that the body must be JSON.

> 🔍 **Going deeper**: SNS filter policy matching happens on the SNS side, so "a message that doesn't match the filter" costs the subscriber 0. Neither the cost of a message going to SQS nor the cost of a Lambda invocation is incurred. If you instead filter on the subscriber side (an if-else inside Lambda), every message invokes Lambda first, incurring all the cold-start and request cost. On high-traffic topics, server-side filtering often makes a cost difference of more than 10x.

> 📚 **Case study**: In 2022, the Netflix Tech Blog published the story of redesigning its internal event bus around SNS filtering. Previously each microservice operated its own Kafka topic, reaching thousands of topics, but after moving to the "one SNS topic per domain + branching per subscriber via filter policies" pattern, the topic count dropped to 1/10 and the time to add a new consumer shrank from days to minutes. That said, due to throughput limits Netflix didn't fully replace Kafka, moving only the "low throughput + diverse subscribers" workloads to SNS.

## SNS FIFO and the Essence of Ordering Guarantees

On Day 1 we said SQS FIFO's 300 msg/s limit is due to "single-partition serialization per MessageGroupId," and SNS FIFO is exactly the same mechanism. The topic itself is a FIFO topic, and when you specify a MessageGroupId at publish time, the publish order within that group is propagated as-is to all SQS FIFO subscriptions. Turn on ContentBasedDeduplication and the SHA-256 hash of the body becomes the automatic dedup ID, so duplicate publishes within the 5-minute window are ignored.

SNS FIFO's real value is that "multiple subscribers receive the same messages in the same order." If, without fanout, each consumer sent separately to its own SQS FIFO, each consumer could see a subtly different order — but going through SNS FIFO, all subscribers see the same publish order. In distributed systems, "global ordering as seen by all subscribers" is a famously expensive guarantee, and even Kafka only guarantees it within a partition.

The constraints are considerable, though.
- Subscribable: SQS FIFO + Lambda (added 2023). Email/HTTP/Mobile Push not possible.
- Throughput: 300 TPS per topic (3,000 with batching). High Throughput FIFO is still SQS-only.
- Price: roughly 10x the unit price of Standard SNS.

> 💡 **Related theory**: In distributed systems, the famous 1996 theorem by Tushar Chandra and Sam Toueg holds that "total order broadcast" (all nodes see messages in the same order) is equivalent to consensus. It can be implemented with consensus algorithms like Paxos/Raft, but at the cost of latency and throughput. The SNS FIFO + SQS FIFO combination being tied to 300 TPS is because there's no way to bypass this fundamental cost. If you need exactly-once + total order, you should first ask "do I really need it, and is there no way to partition by MessageGroupId?"

## Comparison with Other Pub/Sub Systems

| System | Model | Ordering Guarantee | Push/Pull | Retention | Operational Burden |
|--------|-------|--------------------|-----------|-----------|---------------------|
| **SNS Standard** | Topic + Subscription | Best-effort | Push | None (retry only on failure) | Very low |
| **SNS FIFO** | Topic + Subscription | Per MessageGroupId | Push | None | Low |
| **EventBridge** | Bus + Rule + Target | Best-effort | Push | None (possible via Archive) | Very low |
| **Kafka topic** | Log (replayable) | Per partition | Pull | Unlimited | High |
| **Google Pub/Sub** | Topic + Subscription | Optional ordering key | Push or Pull | 7 days (replayable) | Low |
| **Azure Service Bus Topic** | Topic + Subscription | Per Session | Push (long polling) | 14 days | Low |
| **Redis Pub/Sub** | Channel | None | Push (real-time) | None (offline subscribers lose messages) | Medium |

The biggest branch point in this table is **whether there's retention**. SNS has no retention, so "if there's no subscriber at publish time or the subscriber is down, that message is lost" (unless there's an SNS DLQ). Kafka, Google Pub/Sub, and Service Bus have retention, so consumers can catch up on lag days later. If you need this "replayable log" on AWS, you have to go to Kinesis (Day 4) or MSK.

EventBridge (Day 3) looks similar to SNS but is a different tool. EventBridge specializes in gathering SaaS/AWS-service/custom events onto one bus and routing them with rules, while SNS specializes in simple pub/sub. SNS has overwhelmingly higher throughput, and EventBridge has overwhelmingly richer integration.

> 📚 **Case study**: During the massive AWS S3 us-east-1 outage on February 28, 2017, many companies had their "S3 event notification → SNS → downstream" chains all severed, so no alarms came through. The post-mortem produced the recommendation "don't depend all your notifications on a single-region SNS; separate the availability of the notification itself with multi-region SNS publish + Route 53 failover." Afterward, monitoring companies like PagerDuty and Datadog built their own multi-region notification fabrics.

## DLQ, Encryption, and Operational Details

SNS Subscription DLQ was launched in 2019. If a subscription repeatedly fails to push (e.g., an HTTP endpoint permanently returning 5xx), it sends that message to the designated SQS DLQ. The thing to watch is that **an SNS DLQ is per-subscription**, not per-topic. So for the same topic, subscription A can have a DLQ while subscription B doesn't, and many companies put an SCP in place to enforce a DLQ on every subscription for operational standardization.

Encryption is SSE-SNS (AWS-managed key, free by default) and SSE-KMS (customer-managed KMS, key usage permissions controlled by IAM). With SSE-KMS, both publish and subscribe need KMS Decrypt permission, and a common incident is a push failure caused by a Lambda subscription lacking KMS permission and failing to decrypt the message. You have to add the subscriber principal not only to the topic policy but also to the KMS key policy.

Cross-account subscriptions require the topic policy (resource-based policy) to explicitly allow the other account's ARN. In large organizations, the hub-and-spoke pattern — placing topics in a central event account and having workload accounts subscribe cross-account — is standard.

Using a VPC Endpoint (Interface, based on AWS PrivateLink) makes publish traffic flow over the AWS backbone without traversing the internet. It's nearly essential in domains with compliance requirements like finance and healthcare, and maps directly to the NIST SP 800-53 SC-7 (boundary protection) control.

## Message Archive and Replay

SNS FIFO, via the **Message Archive and Replay** feature launched in 2023, retains messages published to a topic for up to 365 days and lets a new subscriber replay past messages. Standard topics are not yet supported. Before this feature, you had to receive via SNS → SQS to leverage SQS's 14-day retention, or archive via SNS → Firehose → S3.

Replay is useful in the scenario "when a new system is added, it must process past events too," but this kind of scenario is essentially better suited to event sourcing (EventStoreDB, Kafka). SNS FIFO Archive is best viewed as a short-term (days to a few months) partial replay tool, and if you need true event sourcing you should go to Kinesis or MSK.

```bash
# Standard Topic
aws sns create-topic --name order-events
aws sns subscribe --topic-arn arn:...:order-events \
  --protocol sqs --notification-endpoint arn:...:order-payment-queue

# Filter Policy (server-side filtering)
aws sns set-subscription-attributes --subscription-arn arn:... \
  --attribute-name FilterPolicy \
  --attribute-value '{"event_type":["order_placed"],"amount":[{"numeric":[">=",10000]}]}'

# FIFO Topic
aws sns create-topic --name order-events.fifo \
  --attributes FifoTopic=true,ContentBasedDeduplication=true

# Subscription DLQ (isolate failed messages)
aws sns set-subscription-attributes --subscription-arn arn:... \
  --attribute-name RedrivePolicy \
  --attribute-value '{"deadLetterTargetArn":"arn:aws:sqs:ap-northeast-2:123:order-events-dlq"}'

# Publish with attributes (used as filtering keys)
aws sns publish --topic-arn arn:...:order-events \
  --message '{"orderId":"o-1001","amount":15000}' \
  --message-attributes '{"event_type":{"DataType":"String","StringValue":"order_placed"},"amount":{"DataType":"Number","StringValue":"15000"}}'

# Allow cross-account publish (topic policy)
aws sns set-topic-attributes --topic-arn arn:... \
  --attribute-name Policy \
  --attribute-value file://cross-account-policy.json
```

## Wrapping Up

SNS exists for the "1:N event broadcast" that SQS's "1:1 work distribution" model can't solve. And the SNS + SQS fanout pattern combines the strengths of both services (SNS's diverse push protocols + SQS's safe buffer) to become the most frequently seen decoupling architecture in AWS. Message filtering prevents topic explosion, FIFO is an option for domains that need ordering, and subscription DLQ and cross-account subscriptions are essential operational features in large organizations.

In the next article we'll look at a problem that's similar to SNS but on a different dimension — **EventBridge**, which gathers AWS-service events, SaaS events, and custom events in one place and routes them by rule. If SNS is "notify N people of the event I publish," EventBridge is a one-level-higher abstraction: "receive events that occur all over the place and send them somewhere according to conditions," and how the two divide labor is the crux of both the exam and practice.

---

## 📝 연습 문제

**문제 1.** A company wants an order event to be processed independently by four systems — payment, inventory, shipping, and notification. Even if one system goes down, the processing of the others must be unaffected. What is the most appropriate architecture?

A) One SQS queue with all four consumers calling ReceiveMessage
B) One SNS topic + four SQS queue subscriptions (fanout)
C) Subscribe Lambda to SNS directly four times
D) DynamoDB Stream → four Lambda triggers

**정답: B**

해설: A single SQS queue delivers one message to only one consumer, so 1:N broadcast is impossible (A eliminated). SNS → multiple SQS fanout is the standard decoupling pattern, where each SQS has its own DLQ, its own visibility timeout, and its own consumers, so one system going down doesn't affect the others. C (direct Lambda subscription) can fan out too, but without a buffer like SQS there's a Lambda throttle risk under traffic spikes, and DLQ is only possible via the SNS subscription DLQ, so partial-failure handling is weak. D requires the separate assumption that order data lives in DynamoDB, and has constraints on the number of stream consumers (KCL shard count = consumer count), making it unsuitable for general fanout.

---

**문제 2.** The requirement is that "the same customer's payment events must be seen by all subscribers in the same order, exactly once." What is the most appropriate combination?

A) SNS Standard → multiple SQS Standard
B) SNS FIFO + ContentBasedDeduplication=true + MessageGroupId=customerId → multiple SQS FIFO
C) One SQS FIFO with all consumers calling ReceiveMessage
D) Kinesis Data Streams + Multi-shard

**정답: B**

해설: "All subscribers in the same order" is guaranteed only by the SNS FIFO + SQS FIFO combination. SNS FIFO fixes the publish order at the topic level, and that order propagates identically to all subscribing SQS FIFO queues. With MessageGroupId=customerId, per-customer ordering is guaranteed while parallel processing is still possible across customers. ContentBasedDeduplication is automatic body-hash-based dedup. A has best-effort ordering, so each subscriber can see a different order. C is a work-distribution model where multiple consumers calling ReceiveMessage on one queue each get different messages — it's not fanout. D guarantees ordering only per shard, shard-key design is tricky, and here SNS FIFO is the simpler answer.

---

**문제 3.** A single SNS topic is publishing various kinds of events (order/refund/shipping/review). One subscribing Lambda wants to process only "orders + payment amount ≥ 50,000 KRW." How do you implement this while minimizing Lambda invocation cost?

A) Send all messages to Lambda and filter with if-else inside Lambda
B) Create a separate topic per event type to split them
C) Attach a Filter Policy to the subscription for server-side filtering
D) Store events in DynamoDB first and have Lambda poll

**정답: C**

해설: An SNS Subscription Filter Policy performs matching on the SNS side at publish time, so a message that doesn't match the filter never invokes Lambda at all — invocation cost 0. A policy like `{"event_type":["order_placed"],"amount":[{"numeric":[">=",50000]}]}` can filter on a type + numeric combination. A causes every message to invoke Lambda, exploding cost and accumulating cold starts. B explodes the topic count, increasing management cost as subscriptions, IAM, and alarms all grow. D breaks SNS's push model and regresses to polling — an anti-pattern.

---

**문제 4.** A company sends notifications to an HTTPS endpoint via an SNS topic, and suspects that some messages are being lost due to transient endpoint failures. What is the most appropriate response?

A) Change SNS Standard to FIFO
B) Configure a Subscription DLQ (SQS) on the HTTP subscription to isolate failed messages
C) Replicate the topic across multiple regions
D) No additional action needed since SNS retries automatically

**정답: B**

해설: SNS retries HTTPS 5xx with exponential backoff up to 100,015 times (about 23 days), but after that the message is discarded. Configuring a Subscription DLQ routes retry-exhausted messages into an SQS DLQ for post-mortem analysis and reprocessing. A is wrong because FIFO can't have HTTPS subscriptions. C is a way to increase availability but doesn't solve the loss itself. D is partly correct but doesn't prevent the loss of finally-failed messages, making it operationally insufficient.

---

**문제 5.** A SaaS company needs to deliver internal company events to 50 external partners via webhook. New partners are added frequently, and each partner receives different kinds of events. What is the most operationally efficient architecture?

A) Call an HTTP POST directly to each partner from company code
B) SNS topic + an HTTPS subscription per partner + a Filter Policy on each subscription to branch by event type
C) Kinesis Data Streams + a KCL consumer per partner
D) SQS queue + partners calling ReceiveMessage

**정답: B**

해설: When partners are frequently added/removed, the SNS model — where you just manipulate subscriptions with no code change — is most efficient. Different event types per partner is handled by server-side branching with Filter Policy. The company's publish code publishes just once and it auto-fans out to 50. A requires code changes when adding partners + couples them so that a slow response from one partner delays calls to others. C is not a webhook model and has a high barrier since external partners must use the KCL library. D is wrong because a queue is a 1:1 model, so 50 partners = 50 queues + the company has to send 50 times.

---

**문제 6.** You're publishing events to an SNS FIFO topic, and want some subscribers to receive via SQS FIFO and some via email notification. Is this feasible?

A) Yes. SNS FIFO supports subscriptions on all protocols
B) Partially. SQS FIFO subscription works, but email is not possible on SNS FIFO, so create a separate SNS Standard topic and dual-publish
C) Yes. Deduplication is automatically applied to the email subscription
D) No. A FIFO topic can only publish to SQS FIFO, so you have to give up email notifications

**정답: B**

해설: SNS FIFO can only have SQS FIFO and Lambda (2023+) subscriptions. Email/HTTP/Mobile Push are channels where ordering/duplication guarantees inherently break, so SNS FIFO semantics vanish and they aren't supported. If you need email notifications, either create a separate SNS Standard topic and have the publisher dual-publish to both topics, or have a Lambda receive from the SQS FIFO subscription and send email via SES. A is misinformation, C is wrong because SNS FIFO's dedup doesn't even apply to email, and D is an over-conclusion since a workaround pattern exists.

---

**문제 7.** In a multi-account organization, you want to subscribe to a payment account's SNS topic from a data analytics account's SQS queue. What permission configuration is needed?

A) Allow the analytics account's SQS ARN in the payment account's SNS topic policy + allow the payment account's SNS principal in the analytics account's SQS policy
B) Just granting a cross-account role to the IAM user
C) Only setting up an AWS Organizations SCP
D) Setting up VPC Peering

**정답: A**

해설: Both SNS and SQS have resource-based policies, and cross-account communication requires explicit allows on both sides. Allow the analytics account's SQS as a subscriber in the SNS topic policy, and grant SendMessage permission to the payment account's SNS principal (`sns.amazonaws.com`) in the SQS queue policy. Miss either one and messages won't be delivered — the most common cross-account SNS incident in practice. B is unrelated to user permissions (this is a service-to-service call), C is wrong because an SCP is only a permission boundary and explicit allows are still separately needed, and D is wrong because SNS/SQS are public endpoints so VPC Peering is unnecessary.

---

Additional explanation: SNS looks simple but has surprisingly many important operational details. ① fanout = SNS + SQS is the standard, while direct SNS subscription is only suitable for ad-hoc notifications; ② server-side Filter Policy is always superior in cost and management; ③ FIFO subscription constraints (SQS FIFO + Lambda only); ④ cross-account = resource policies needed on both sides; ⑤ Subscription DLQ is per-subscription; ⑥ with SSE-KMS the subscriber also needs KMS Decrypt permission. These six are the SNS pitfalls that appear most often on both the SAA exam and in practice.
