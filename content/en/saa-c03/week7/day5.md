# Day 5 - Week 7 Review: The Four Models of Messaging and Distributed-System Decisions

The four services we saw throughout Week 7 — SQS, SNS, EventBridge, Kinesis — are all grouped under "Application Integration" in the console category, but the problems they solve inside that group are actually of different kinds. Mistaking them for services of the same grain just because they sit side by side on the same screen leads to picking the wrong tool, on the exam and in practice alike.

Fitting for the fifth day, this article doesn't pile on new services. Instead it once again organizes the models we saw over the past four days from the perspective of distributed-systems theory and scenario keywords, and untangles in one pass the decision axes that most often confuse people on the exam. Finally, it checks the thinking you've accumulated with 12 scenario questions.

## Four Services, Four Problem Definitions

Let's revisit the problem each service tries to solve. Not a definition to memorize, but from the angle of "what pain would you feel without this service."

**SQS (Day 31)** — a queue that decouples producer and consumer in time. The core abstraction is "*even if a consumer dies briefly, the message stays in the queue*." This absorbs the mismatch (burst) between the speed of handling user requests and the speed of worker processing. One message is taken by one consumer and finished (point-to-point).

**SNS (Day 32)** — fanout that delivers one event to N systems simultaneously. The core abstraction is "*the publisher doesn't know who's listening*." Publish once to a topic and every subscriber (SQS, Lambda, HTTP, Email, SMS, Mobile Push, …) receives it independently.

**EventBridge (Day 33)** — a bus that routes based on the shape and rules of events. The core abstraction is "*when an event arrives, behavior is decided by which rule it matches*." That is, if SNS is a "subscription channel" model, EventBridge is a "filtering router" model. It receives events from SaaS, AWS services, and internal apps all at once and routes them by JSON pattern.

**Kinesis (Day 34)** — a river (stream) of events ordered by time. The core abstraction is "*the same data can be replayed by multiple consumers at their own pace*." A message doesn't disappear when taken, and anyone can re-read it during the retention period. It's decisive for analytics, machine-learning training, and reprocessing.

> 💡 **Related theory**: The four messaging models correspond almost 1:1 to the four core patterns organized in *Enterprise Integration Patterns* (EIP, Hohpe & Woolf, 2003). SQS = **Point-to-Point Channel**, SNS = **Publish-Subscribe Channel**, EventBridge = **Content-Based Router**, Kinesis = **Event Sourcing / Replayable Log**. In other words, AWS implemented EIP as managed services. On the exam, a "which service" question ultimately reduces to a "which pattern" question, and with this mapping in your head, catching just the keyword in a scenario yields the answer.

> 🔍 **Going deeper**: Even within "messaging," if you classify by four axes — **at-least-once vs exactly-once**, **ordering guaranteed vs irrelevant**, **message persistence vs one-shot**, **fanout 1:N vs point-to-point** — every messaging system is a single point on those coordinates. Kafka is (at-least-once, ordered within a partition, replayable, 1:N), SQS Standard is (at-least-once, no ordering, deleted after consume, 1:1), SNS is (best-effort, no ordering, one-shot, 1:N), SQS FIFO is (exactly-once-ish, ordered within a group, 1:1), EventBridge is (at-least-once, no ordering, rule-based fanout). Drawing these coordinates shows you where an exam scenario keyword lands.

## First Axis: "One Consumer Processes" or "Deliver to Many"

This is the first question to ask. When a message comes in, is it a job that a single consumer processes and finishes (point-to-point), or must multiple systems hear the same event and each take a different action (fanout)?

**Point-to-point means SQS.** A payment-processing queue is a good example. Since one order must be paid exactly once, when one of the worker instances takes the message, the other workers don't see it. The visibility timeout guarantees exactly this single ownership.

**Fanout means SNS or EventBridge.** "An order-completed event happened, and we need to send an email, record it in the analytics system, notify the warehouse system, and feed the recommendation engine." If the publisher calls all those subscribers directly, coupling explodes, and the publisher's code has to change every time a new subscriber appears. Fanout breaks that coupling.

| Axis | SQS | SNS | EventBridge | Kinesis |
|------|-----|-----|-------------|---------|
| Delivery model | point-to-point (1:1) | fanout (1:N) | rule-based routing (1:N) | stream (1:N, replay) |
| Message persistence | taken and deleted | one-shot delivery, not retained | one-shot delivery, not retained | anyone can re-read during retention |
| Ordering | none in Standard / within a FIFO group | none | none | strict within a shard |
| Processing guarantee | At-least-once / FIFO exactly-once | At-least-once | At-least-once | At-least-once |
| Backpressure | scale ASG by queue length | none (published immediately) | none | replay at consumer pace |
| Integrations | Lambda, EC2, ECS | Lambda, SQS, HTTP, Email, SMS | 100+ SaaS / AWS / custom | Lambda, Firehose, KCL |

## Second Axis: "Must You Be Able to Re-Read Events?"

This single question separates Kinesis from the other three. SQS, SNS, and EventBridge are all models where a message is "delivered once and disappears." If a consumer fails to process, it goes to a DLQ (SQS), or to a retry queue (SNS/EventBridge depending on the target), or it's gone. Either way, once that moment passes you can't see the event again.

Kinesis is different. A message stays in the stream during the retention period (default 24 hours, up to 365 days), and even if a consumer already took it, it stays right there. Another consumer can re-read from the same point, and yesterday's data can be reused for today's model training.

> 💡 **Related theory**: This difference is directly tied to the value of the **immutable log pattern** in distributed systems. It's the core organized in Jay Kreps's *The Log: What every software engineer should know about real-time data's unifying abstraction* (2013, LinkedIn Engineering). If you view data not as mutable state but as an unchanging sequence of events, then when a new consumer appears you can replay from the beginning and reconstruct the identical state. The Event Sourcing pattern, CDC (Change Data Capture), and Lambda Architecture (batch + streaming) all operate on this assumption. That SQS is mutable state (take a message and it's gone) while Kinesis is an immutable log makes the two services entirely different tools.

> 📚 **Case study**: Since 2016, Netflix has processed over a trillion events per day on Kinesis in its Keystone Pipeline. The answer to "why Kinesis and not SQS" is exactly this axis — A/B testing, recommendation-model training, real-time dashboards, and more all use the same events for different purposes across multiple consumers. With SQS, once one consumer takes a message it's over, so for multiple systems to analyze the same data you need a fanout (SNS→SQS) pattern — but when a new consumer appears it can only receive events from that point on (past events can't be replayed). Kinesis lets a new consumer replay from the beginning, as long as it's within the retention period. [See Netflix Tech Blog](https://netflixtechblog.com/keystone-real-time-stream-processing-platform-a3ee651812a).

## Third Axis: "Must You Route by Event Shape?"

This is where SNS and EventBridge often get confused. Both look like 1:N fanout, but their decision models differ.

**SNS is topic = channel.** Publish to a topic and every endpoint subscribed to that topic receives it. You change behavior by adding or removing subscribers. Message Filtering is possible too, but only at the level of simple attribute matching.

**EventBridge is bus + rules.** It matches events that arrive on the same bus by JSON pattern and sends them to different targets per matched rule (Lambda, SQS, Step Functions, SNS, another EventBridge bus, …). A rule looks at the very structure of the event, like `{"source": ["custom.order"], "detail-type": ["OrderPlaced"], "detail": {"amount": [{"numeric": [">", 1000]}]}}`.

EventBridge also sits at a higher abstraction than SNS in that it can receive SaaS events (Zendesk, Datadog, Stripe, Auth0, MongoDB, etc.) and AWS service events (EC2 state changes, S3 PutObject, CodePipeline stages, etc.) on the same bus. If SNS is "I publish to a topic I created," EventBridge is "I receive events coming from all over and route them."

> 🔍 **Going deeper**: EventBridge's routing is internally a finite-state-automaton-based pattern matcher that compiles rule patterns and matches incoming events quickly. Even with thousands of rules, the routing decision for a single event finishes in microseconds, so its expressiveness is on a different plane than SNS Message Filtering (simple string comparison) — numeric comparison, IP matching, existence checks, prefixes, and more are possible. That said, EventBridge has ~0.5 second average latency per PutEvents event (p99 < 1.5 seconds), so for a hot path needing sub-1-second SLA, SNS or a direct SQS call is better.

> ⚠️ **Pitfall**: If you see the keywords "SaaS integration," "scheduling," "event pattern filtering," or "AWS service event routing," EventBridge is the answer. If it's "simple fanout to SQS + Lambda + email," SNS is the answer. Doing all fanout through EventBridge accumulates latency and costs ~10× SNS. Conversely, using only simple SNS makes SaaS integration hard, forcing you to insert a Lambda every time.

## Fourth Axis: The "Exactly Once" Trap

The word most often misunderstood in distributed systems is "exactly-once delivery." SQS FIFO, Kafka (EOS), and SNS each use this word with a different meaning.

**SQS Standard / SNS** — at-least-once. The same message can arrive twice. Due to network retries, the publisher may send it twice, or the consumer may die before ack and take it again. The fix is **consumer-side idempotency** (dedup by message ID).

**SQS FIFO** — it advertises "exactly-once processing," but strictly it's **preventing duplicate publishing within a 5-minute deduplication window**. Based on ContentBasedDeduplication or an explicit MessageDeduplicationId, the same ID within 5 minutes is ignored. That is, send it again after 5 minutes and duplicate publishing is still possible. And if the consumer dies after processing without ack, the visibility timeout releases and it's taken again (still, processed once ≠ arrived once).

**Kinesis** — at-least-once. The KCL checkpoints the sequence number to DynamoDB on the consumer side, but there's a brief moment when one record can be visible to two workers at once. Idempotency in the consumer code is essential.

> 💡 **Related theory**: What the Two Generals' Problem (1975) proved — reliable agreement between two nodes is impossible on an asynchronous network. In other words, "exactly once" between publisher and consumer can never be guaranteed by the messaging system alone; it absolutely requires application cooperation such as consumer-side idempotency or the transactional outbox pattern. Confluent's EOS (Exactly Once Semantics, KIP-98) is also a narrowly-scoped guarantee that's only possible when the transactional producer + read-process-write all complete within the same Kafka cluster. When designing AWS messaging, memorizing "use FIFO and there are no duplicates" leads you into the trap.

## Fifth Axis: Cost and Operational Burden

For the same workload, the monthly bill can differ by 10× depending on which tool you use. On the exam too, scenarios with clear cost keywords have nearly predetermined answers.

| Scenario | Cheap answer | Expensive answer (wrong) |
|----------|--------------|--------------------------|
| 1M events/day simple fanout | SNS | EventBridge |
| 100M events/day analytics stream | Kinesis Firehose → S3 (serverless) | Kinesis Data Streams + self-run KCL on EC2 |
| frequent empty-polling cost | Long Polling 20s | Short Polling |
| SaaS event routing | EventBridge | Custom Lambda + queue |
| simple async worker | SQS | Step Functions |
| messages over 200KB | S3 + SQS Extended Client | chunking with base64 |

> 📚 **Case study**: A 2020 fintech startup unified all its async processing on EventBridge and its monthly bill exploded to 12× the SNS+SQS combination — a story that gets passed around. The cause: EventBridge costs $1/M USD per event (for the first 100M), whereas SNS publish is $0.50/M USD + delivery to subscribers is near-free for SQS. EventBridge's value is "routing expressiveness + SaaS integration," and for simple fanout SNS is cost-efficient. On the exam too, "hundreds of millions of simple fanout" is a cost keyword pointing toward SNS.

## Throughput Limits and partitions/shards

Exam questions like "traffic suddenly grew 10×, what's the bottleneck" show up often. Keep each service's throughput model in mind.

| Service | Throughput |
|---------|-----------|
| **SQS Standard** | unlimited (effectively) |
| **SQS FIFO** | 300 TPS / group (3,000 with batching); High Throughput FIFO reaches tens of thousands via group distribution |
| **SNS Standard** | unlimited (per-region publish quota exists) |
| **SNS FIFO** | 300 TPS / group |
| **EventBridge** | default bus 400 TPS PutEvents, increasable |
| **Kinesis Data Streams** | per shard: in 1MB/s or 1,000 records/s, out 2MB/s (Enhanced Fan-Out is 2MB/s per consumer) |
| **Kinesis Firehose** | auto-scale (managed) |

> ⚠️ **Pitfall**: Don't mistake a Kinesis "shard" for a queue like SQS. A shard is decided by the partition-key hash, and one partition key always goes to the same shard (the basis of ordering guarantees). If there's a hot partition key, that shard hits its limit (in 1MB/s) and throttling occurs — and other idle shards don't help. If an exam scenario says "only a specific key gets throughput-blocked," the answer is a partition-key design problem.

## Sixth Axis: Security and Idempotency-Key Design

Mishandling messaging leads to data leaks or duplicate processing. Remember just three core patterns to stay safe.

**1) Encryption** — all four services support SSE (KMS keys). SQS, SNS, and Kinesis optimize cost with KMS data-key caching, and EventBridge automatically applies in-transit TLS + at-rest encryption to every event.

**2) VPC Endpoint** — when a VPC-bound workload like Lambda accesses SQS/SNS/Kinesis/EventBridge, connect via PrivateLink without going through the internet. Security + savings on NAT Gateway cost.

**3) Cross-account via Resource Policy** — SNS Topic Policy, SQS Queue Policy, and EventBridge Bus Policy grant access to ARNs in other accounts. In a multi-account environment, gather all accounts' events into a central audit queue.

> 💡 **Related theory**: Idempotency-key design is a core defensive line in distributed systems. Stripe's idempotency-key header pattern is effectively the industry standard — the client generates a UUID and sends it, the server caches the processing result under that key, and a repeat request with the same key returns only the cached result. A worker handling SQS/SNS at-least-once can block duplicate processing by the same principle: store the message ID + processing result in DynamoDB (with TTL). The RFC draft *The Idempotency-Key HTTP Header Field* (Sanyal & Vyas, IETF 2021) aims to standardize this pattern.

## Next Week Preview

Week 8 goes into the depth of databases. It looks at which workloads RDS, Aurora, DynamoDB, and ElastiCache each solve, and which distributed models they use to approach the same "data storage" problem. You'll come to see that the picture from Week 7 — "messaging decouples time" — is, like Week 8's picture — "databases decouple consistency and availability" — two faces of the same distributed system.

---

## 📝 연습 문제

**문제 1.** When an e-commerce company's order system emits an "order completed" event, it must do the following four things simultaneously: (1) send a message to the payment-processing queue, (2) record it in the analytics system, (3) email the user, (4) notify the warehouse system. New subscribers may also be added in the future. What is the most appropriate architecture?

A) The order service calls SendMessage directly on each of 4 SQS queues (payment, analytics, email, warehouse) and deploys code when a new subscriber is added
B) SNS topic → 4 SQS queue fanout (SNS-SQS fanout pattern)
C) Put order events into a Kinesis Data Stream and have 4 systems each consume with a KCL application + DynamoDB checkpoint table
D) Create 4 rules on an EventBridge custom bus, each routing the same OrderPlaced pattern to 4 targets

**정답: B**

해설: The model answer for a simple-fanout scenario with expected subscriber growth is the SNS→SQS pattern. SNS publishes once to a topic, all SQS subscribers receive it, and each queue's worker processes at its own pace. A new subscriber just creates an SQS queue and adds a subscription to the SNS topic — the publisher's code doesn't change. (A) explodes coupling and requires modifying the publisher for each new subscriber. (C) Kinesis is for analytics workloads needing retention/re-read, not for fanout; it's also expensive and operationally heavy. (D) EventBridge works too but is expensive for simple fanout and adds latency. However, if the scenario has "event pattern filtering" or "SaaS integration," EventBridge is the answer.

---

**문제 2.** A payment system requires "one payment must be processed exactly once + the same customer's payments must be processed in order." What is the most appropriate queue configuration?

A) SQS Standard + a DynamoDB idempotency-key table so the worker blocks duplicate processing
B) SQS FIFO + MessageGroupId=customer_id
C) An SNS FIFO topic + a Lambda subscriber performing the payment directly
D) Kinesis Data Streams + partition key=customer_id + a KCL worker processing payments in order from the shard

**정답: B**

해설: A FIFO queue guarantees ordering per MessageGroupId and blocks duplicate publishing within a 5-minute window via ContentBasedDeduplication or MessageDeduplicationId. Using customer_id as the group ID naturally guarantees "the same customer's payments in order + exactly once." (A) Standard + idempotency can't guarantee ordering. (C) SNS FIFO is for fanout and doesn't directly suit the worker-queue model — an SNS FIFO → SQS FIFO combination would work but adds a stage. (D) Kinesis also guarantees the same customer's ordering via partition key, but payment is a 1:1 queue model (one worker takes it and processes) rather than stream analytics. Kinesis is valuable when re-read/analytics are needed; a payment worker queue is naturally SQS FIFO. And Kinesis is far more expensive.

---

**문제 3.** A company wants to receive events from SaaS products like GitHub, Stripe, and Datadog in its workload and route them to other AWS services (Lambda, Step Functions, SQS) via automation rules. What is the most appropriate solution?

A) Build an API Gateway + Lambda that receives webhooks per SaaS, implement auth/retry yourself, and fanout via an SNS topic
B) EventBridge SaaS Partner Source + bus + rules
C) Collect each SaaS's webhooks into Kinesis Data Streams, then have Lambda read the source field and branch
D) Integrate by calling each SaaS API as a polling task directly in a Step Functions state machine

**정답: B**

해설: EventBridge is designed for exactly this scenario. SaaS Partner Source is natively integrated with 30+ SaaS products, so webhook handling, auth, and retry are all managed. Received events are routed to various targets by JSON pattern rules on the same bus. (A) Lambda + SNS works too, but you'd have to implement webhook endpoints, auth, and retry per SaaS yourself. EventBridge provides that as managed. (C) Kinesis is for stream analytics, not routing. (D) Step Functions is workflow orchestration, not an event-reception/routing hub. When you see SaaS, pattern matching, and routing keywords, it's almost always EventBridge.

---

**문제 4.** 1 million IoT devices send telemetry data at an average of 50,000 events per second, and this data must (1) be stored raw in S3, (2) undergo real-time anomaly detection with Lambda, (3) be reused for ML model training next quarter. What is the most appropriate solution?

A) SQS Standard queue + Lambda polls, does anomaly detection, then batch-exports to S3; ML training reloads from S3
B) SNS topic → SQS / Lambda / S3 fanout delivering to three consumers simultaneously
C) Kinesis Data Streams + Lambda + Firehose → S3
D) EventBridge bus → route to multiple targets like Lambda, S3, analytics via rules

**정답: C**

해설: The core keyword is "reuse" — the same data is viewed by multiple consumers for different purposes. SQS/SNS/EventBridge are take-and-gone models, making re-read for ML training difficult. Kinesis keeps data intact during the retention period (default 24 hours, up to 365 days), so a new consumer can replay from the beginning. Lambda polls the shard for real-time anomaly detection, and Firehose attached to the same stream auto-loads to S3 (raw storage + ML training). 50,000 TPS is about 50 shards. (A)(B) SQS/SNS can't re-read. (D) EventBridge has a smaller throughput limit and is more expensive.

---

**문제 5.** A company's worker receives messages from SQS and calls an external API, and the external API call takes 45 seconds on average, sometimes up to 90 seconds. But occasionally the same message gets processed twice. What is the cause and fix?

A) Change the Standard queue to a FIFO queue to guarantee a single consumer per MessageGroupId and remove duplicates
B) The Visibility Timeout is shorter than the processing time → increase the Visibility Timeout or dynamically extend it with ChangeMessageVisibility
C) It's the at-least-once limit of the Standard queue, so just adding an idempotency-key table solves it regardless of visibility settings
D) DLQ + maxReceiveCount=3 + Redrive Policy to isolate the reprocessed message and block duplicates

**정답: B**

해설: With a default Visibility Timeout of 30 seconds and processing taking 45-90 seconds, another worker takes the same message again during processing. There are two fixes: (1) set the Visibility Timeout sufficiently longer than the processing time (e.g., 120 seconds), (2) if processing time is variable, have the worker periodically call the ChangeMessageVisibility API mid-processing to extend visibility. (A) FIFO has the same visibility timeout problem. (C) An idempotency key mitigates the duplicate effect but leaves the root cause. (D) A DLQ is for isolating processing-failure messages, not for preventing duplicate processing. In practice you do (B) and (C) together — extend visibility + add an idempotency key as a second line of defense.

---

**문제 6.** A company wants to send a Slack notification only when a CodePipeline deployment fails. What is the most appropriate configuration?

A) Send all CodePipeline stage events to an SNS topic and have Lambda filter only state=FAILED to call a Slack webhook
B) CodePipeline → EventBridge rule (failure events only) → SNS → Chatbot → Slack
C) Send CodePipeline events to an SQS queue and have Lambda poll, determine failure, and send to Slack
D) Flow CodePipeline events into Kinesis Data Streams and have a KCL consumer pick only failure records and send to Slack

**정답: B**

해설: EventBridge automatically receives AWS service events. CodePipeline publishes all stage events with the `aws.codepipeline` source, and the rule pattern `{"source": ["aws.codepipeline"], "detail-type": ["CodePipeline Stage Execution State Change"], "detail": {"state": ["FAILED"]}}` filters only failures. The target is SNS → Chatbot, which is natively integrated with Slack (or SNS → Lambda → Slack webhook). (A) SNS has limited event filtering and CodePipeline would have to send all events to SNS → filtering in Lambda is cost/latency inefficient. (C) SQS has no routing and would need Lambda filtering anyway. (D) Kinesis doesn't fit. For AWS service event routing, EventBridge is the answer.

---

**문제 7.** A Kinesis Data Streams consumer works fine with 1 consumer, but adding a second consumer that analyzes the same data makes both throttle frequently. What is the cause and fix?

A) Insufficient shard count → double the shards with UpdateShardCount to secure total out bandwidth
B) A Classic consumer shares 2MB/s out per shard across all consumers → use Enhanced Fan-Out
C) A specific partition key is hot and records pile into one shard → redesign key distribution to resolve throttling
D) The consumer's Visibility Timeout is short so records are re-exposed → set the timeout longer than the processing time

**정답: B**

해설: Kinesis Classic consumer (GetRecords API polling) mode shares 2MB/s out or 5 GetRecords/s per shard **across all consumers**. With 2 consumers each is limited to about 1MB/s, causing throttling. Enhanced Fan-Out (HTTP/2 push-based) provides an independent 2MB/s bandwidth per consumer, so even with N consumers each gets full bandwidth. (A) Adding shards is possible but expensive; EFO is the more direct answer. (C) A hot key is a different problem where only that shard chokes. (D) An SQS concept. EFO has an added cost ($0.015/consumer-shard-hour + data retrieval) but is the standard solution for multi-consumer scenarios.

---

**문제 8.** A company processes SQS queue messages with Lambda, but occasionally a temporary external-API outage causes one message's processing to fail 5 times in a row. Normal messages must keep being processed, and failed messages should be isolated for later analysis and reprocessing. How?

A) Lower Lambda reserved concurrency to throttle failed messages from occupying the retry queue
B) Increase the Visibility Timeout enough to wait for external API recovery, then reprocess the same message
C) DLQ + maxReceiveCount=5 + Redrive Policy
D) Fanout via an SNS topic so a separate analysis subscriber receives failed messages

**정답: C**

해설: The DLQ (Dead Letter Queue) + Redrive pattern is designed for exactly this scenario. Set a RedrivePolicy on the queue attributes specifying `{deadLetterTargetArn: ..., maxReceiveCount: 5}`, and a message whose receive count exceeds 5 automatically moves to the DLQ. Normal messages keep processing, failed messages are isolated. Later, the DLQ Redrive feature (launched 2021) can resend them all to the source queue at once. (A) Lowering concurrency only slows processing. (B) Visibility is a processing-time problem, not a count problem. (D) SNS is irrelevant.

---

**문제 9.** A company routes SaaS, AWS, and internal events all through EventBridge, and **on failure it must inspect and reprocess all events**. What is the most appropriate backup strategy?

A) Attach an SQS DLQ to every rule to back up delivery-failed events and redrive from the queue on failure
B) EventBridge Archive + Replay feature
C) Replicate all bus events to Kinesis Data Streams and re-read during the retention period when reprocessing
D) Load all events to S3 via a Firehose target and re-issue them with PutEvents via Lambda on failure

**정답: B**

해설: EventBridge Archive automatically retains events arriving on the bus (up to 365 days), and the Replay feature can re-publish events from a specific time range back to the same bus. In other words, the archive is a "reprocessable backup." (A) A DLQ isolates processing-failure messages, not backs up all events. (C) Building a separate Kinesis pipeline is operationally heavy (you're already using EventBridge). (D) S3 loading is possible but reprocessing requires implementing the re-publish-to-EventBridge logic yourself. Archive + Replay is managed.

---

**문제 10.** A company must send push notifications from a globally distributed mobile app (iOS APNs, Android FCM, web push). How, with minimal operational burden?

A) Have Lambda call the APNs/FCM/web-push SDKs individually and manage certificate/token expiry yourself
B) SNS Mobile Push (Platform Application + Endpoint)
C) An EventBridge rule matches per device platform and routes to each push-service API target
D) Kinesis Data Streams → a Lambda consumer reads device tokens and sends to each push channel

**정답: B**

해설: SNS Mobile Push is a managed service designed for this scenario. It integrates push services like APNs, FCM, ADM (Amazon), Baidu, MPNS, and WNS under the Platform Application abstraction, registers device tokens as Endpoints, and a single SNS publish routes to the appropriate channel. Certificate management, retry, and delivery reports are all managed. (A) Lambda directly means implementing per-OS SDKs, auth, and expiring-token handling yourself. (C)(D) both need extra code since push-service integration isn't their built-in solution.

---

**문제 11.** A company wants to automatically adjust the number of EC2 workers based on the number of messages in an SQS queue. What is the most appropriate metric and pattern?

A) A Target Tracking policy based on the workers' average EC2 CPU Utilization to adjust instance count
B) `ApproximateNumberOfMessagesVisible / instance count = Backlog per Instance` Custom Metric + Target Tracking
C) Scheduled Scaling that predefines peak traffic hours to scale instance count on a schedule
D) Scale the worker ASG based on CloudFront's Requests/CacheHitRate metric

**정답: B**

해설: The AWS-recommended pattern (Backlog per Instance scaling). Scaling by queue length itself causes oscillation because when workers grow and the queue empties, you can't kill them all in time. Using "*backlog to process per instance*" as the metric lets instance count naturally find a stable state as it changes. Push a custom metric to CloudWatch + ASG Target Tracking. (A) Queue workers often wait for messages with idle CPU, so a CPU basis is unsuitable. (C) Only valid for predictable cycles. (D) Irrelevant.

---

**문제 12.** A company must send 600KB PDF data via SQS. The SQS max message size is 256KB. What is the most appropriate approach?

A) Split the 600KB PDF into 3 chunks under 256KB, send with sequence numbers, and have the consumer reassemble in order
B) Store the PDF in S3 + put only the S3 ARN/Key in the SQS message (Extended Client / self-implemented)
C) Change to a FIFO queue to guarantee chunk order via MessageGroupId and transmit the large body
D) Send PDF records directly via Kinesis Data Streams, which allows up to 1MB per message

**정답: B**

해설: The SQS Extended Client Library is provided for exactly this pattern — it automatically stores large payloads in S3 and sends only a reference to SQS. Self-implementation is also possible. (A) Message splitting/reassembly complicates ordering, duplication, and failure recovery, and even FIFO doesn't guarantee boundaries. (C) FIFO has the same 256KB limit. (D) Kinesis allows up to 1MB but is a stream model, not a queue model, so it's a workload mismatch. And "passing a PDF through a queue" is itself an anti-pattern — S3 is optimal for storing the body, and having SQS flow only the reference is the cloud-native pattern.

---
