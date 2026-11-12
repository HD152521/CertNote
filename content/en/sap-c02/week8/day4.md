# Day 4 - AppSync GraphQL and the Essence of SQS/SNS/Kinesis Messaging

When microservices exceed a certain scale, the data contract between client and server becomes a major operational cost. When a mobile app needs to display "order details + user + shipping address + payment method" on one screen, REST requires 4-5 simultaneous API calls that the client must combine. As screens change, backend APIs change too. The answer to breaking this coupling is **GraphQL**, and AWS's managed service for it is **AppSync**.

Meanwhile, inter-service messaging long used SQS, SNS, and Kinesis as standards. They seem similar but are fundamentally different. SQS is "single-consume queue," SNS is "fan-out pub/sub," and Kinesis is "replayable stream." Exam scenarios distinguishing these three appear across domains. Today we examine both AppSync's GraphQL model and the internal models of these three messaging services.

## Why GraphQL Complements REST

Two chronic REST API problems:
- **Overfetching**: Client needs only username, but response returns all 30 fields
- **Underfetching**: One screen needs multiple resources, requiring N+1 API calls

GraphQL (Facebook, released 2015) solves this as a **client query language**. When clients declare needed fields and their relationships, the server returns exactly that much.

```graphql
query GetOrderScreen($id: ID!) {
  order(id: $id) {
    id
    items { product { name price } quantity }
    customer { name email }
    shippingAddress { street city }
    payment { method last4 }
  }
}
```

One query combines 5 resources in one response. When clients change screens, only the query changes; backend APIs stay the same.

> 💡 **Related Theory**: GraphQL defines type systems via SDL (Schema Definition Language), and queries are declarative traversals of those types. Essentially a **dependency-typed query language**. Trade-offs: REST's simple HTTP caching (URL-based) doesn't work; query complexity attacks (clients paralyzing backends with expensive queries) require depth limits and cost analysis. Apollo's *Production-Ready GraphQL* (O'Reilly) is the best operational reference.

## AppSync — AWS's Managed GraphQL

AppSync provides a managed GraphQL server while mapping resolvers directly to AWS data sources (DynamoDB, Lambda, HTTP, RDS Aurora Serverless, OpenSearch, EventBridge). Resolvers are written in VTL (Velocity Template Language) or JavaScript.

Key features:
1. **Schema-first**: Define types, queries, mutations, subscriptions via GraphQL SDL
2. **Direct data source resolvers**: Call DynamoDB, Aurora directly without Lambda (eliminating cold start and cost)
3. **Real-time Subscriptions**: WebSocket-based pub/sub
4. **Authorization: 5 modes**: API Key, IAM, Cognito User Pool, OIDC, Lambda Authorizer
5. **Caching**: Per-resolver Redis-compatible cache
6. **Offline sync**: Amplify DataStore integration

### Direct Resolver — DynamoDB Without Lambda

Traditional BFF (Backend For Frontend) is GraphQL server → Lambda → DynamoDB (3-hop). AppSync direct resolver cuts it to GraphQL server → DynamoDB (1-hop). Lambda cost, cold start, and operational burden vanish.

```javascript
// JavaScript resolver (2022~)
export function request(ctx) {
  return {
    operation: "GetItem",
    key: util.dynamodb.toMapValues({ id: ctx.args.id })
  };
}
export function response(ctx) {
  return ctx.result;
}
```

This resolver calls DynamoDB GetItem directly. Response within 100ms.

> 🔍 **Deeper Dive**: AppSync resolvers historically used VTL (Velocity Template Language), Apache Velocity-based old template language with tough debugging and high learning curve. In 2022, **APPSYNC_JS** runtime added support for ES6 JavaScript, and nearly all new projects now use JS resolvers. VTL maintained only for legacy compatibility.

### Real-time Subscription — WebSocket Pub/Sub

AppSync subscriptions implement GraphQL's standard subscription type over WebSocket. When clients issue `subscription onOrderUpdated($id: ID!)` queries, WebSocket connections persist, and servers auto-push on mutation.

```graphql
subscription OnOrderUpdate($id: ID!) {
  onOrderUpdated(id: $id) {
    id
    status
    updatedAt
  }
}
```

On mutation, AppSync pushes to all matching subscribers. Standard pattern for mobile chat, real-time alerts, collaborative tools (Figma-style).

> 📚 **Case Study**: 2020-2022 during COVID, food delivery app GrubHub implemented "real-time order tracking" with AppSync subscriptions. When delivery drivers update location, customer apps receive instantly over WebSocket. Previously long polling + Lambda cost exploded with 1M concurrent users. AppSync has very low per-WebSocket cost, achieving 80% savings.

### Authorization: 5 Modes — Choose per Scenario

| Mode | Use Case |
|------|----------|
| **API Key** | Public or simple demo, with expiration (max 1 year) |
| **IAM** | Service-to-service calls, SigV4 signing |
| **Cognito User Pool** | User authentication + group-based authorization |
| **OIDC** | External IdP (Google, Okta, etc.) |
| **Lambda Authorizer** | Custom auth (legacy JWT, etc.) |

Multiple modes simultaneously on one API enabled. Example: anonymous queries use API Key, user data changes use Cognito.

> ⚠️ **Trap**: AppSync API Key is **identification not authentication**. Useful for throttling and analytics, but don't treat as security boundary. Production nearly always requires Cognito or IAM.

## SQS — Single-Consume Queue Standard

SQS is the simplest message queue. Publishers put messages in a queue; consumers poll, process, and delete. One message typically processes by one consumer (even when N workers poll, one message goes to one worker).

### Standard vs FIFO

| Characteristic | Standard | FIFO |
|---|---|---|
| Throughput | Nearly unlimited (tens of thousands TPS) | 300 TPS (3,000 with batching) |
| Order Guarantee | None (best-effort) | Guaranteed within MessageGroupId |
| Duplicates | Possible (at-least-once) | 5-min deduplication (exactly-once-ish) |
| Use Case | General task queue | Payments, accounting, order-critical |
| Naming | Any | Must end with `.fifo` |

FIFO's throughput limit (default 300) extends via **High Throughput FIFO** option with partition-level scaling to thousands TPS. SAP exams map the distinction and "exactly once" keyword.

> 💡 **Related Theory**: In distributed systems, "exactly-once delivery" is theoretically impossible due to FLP impossibility (1985) + Two Generals problem. SQS FIFO's "exactly-once processing" precisely means "idempotent processing within 5-min deduplication window." If a consumer dies right before ack, redelivery causes duplicate. Application-level idempotency (e.g., `idempotencyKey`) still required.

### Visibility Timeout — Lock During Processing

When a consumer receives a message, **visibility timeout** (default 30 seconds) hides it from other consumers. If processing completes and delete is called, it leaves the queue; on failure, after timeout, it reappears for other workers.

Baseline: **average message processing time × 1.5–2**. Too short causes processing duplicates; too long delays retry of failed messages.

### Long Polling — Reduce Empty Receive Costs

Default `ReceiveMessage` is short polling; empty queue returns immediately. Workers polling every second = 86,400 empty calls daily. SQS charges per API call, costing tens of dollars monthly.

**Long polling** (`WaitTimeSeconds=20`) waits up to 20 seconds for messages. Empty calls drop to 1/20, message arrival latency nearly zero (instant push). Production standard.

### DLQ — Isolate Permanently Failed Messages

Messages exceeding `maxReceiveCount` move to DLQ (Dead Letter Queue). Usually set to 5-10. DLQ is separate SQS, and operators analyze, reprocess, or delete.

Causes of DLQ messages:
- Malformed JSON in message payload
- Permanent failure of downstream service
- Code bug throwing indefinitely

> 📚 **Case Study**: In 2018, a music streaming company received alert "5,000 messages in payment processing SQS DLQ." Investigation found a days-old payment gateway SDK update that rejected a specific card number format. After fix deployment, redrive moved all 5,000 from DLQ to main queue for normal processing. Without DLQ, messages would have been lost forever. Common SAP exam pattern: "isolate failed messages + maxReceiveCount" → DLQ.

## SNS — Pub/Sub Fan-out Standard

SNS **Publishes** to a **Topic**, instantly pushing to all **Subscribers**. One message reaches N recipients simultaneously.

### Subscriber Types

- **Lambda** (most common)
- **SQS** (SQS Fan-out pattern)
- **HTTPS/HTTP** (webhook)
- **Email / SMS** (direct notification)
- **Mobile Push** (APNS/FCM/ADM)
- **Firehose** (S3, Redshift storage)

### Message Filtering — Per-Subscriber Pattern Matching

Topic-published messages don't reach all subscribers; filter policies route portions to each.

```json
// SQS subscription FilterPolicy
{ "type": ["high_value"], "region": ["us-east-1"] }
```

This subscription receives only messages with `type=high_value AND region=us-east-1`. Multiple subscribers on same Topic with different filters provide both fan-out and selective routing.

### FIFO Topic — Ordered Fan-out

Added 2020. SQS FIFO subscribers only; MessageGroupId guarantees order + deduplication while fanning out.

```
[Publisher FIFO] → [SNS FIFO Topic] ─┬─► SQS FIFO A (analytics)
                                     ├─► SQS FIFO B (accounting)
                                     └─► SQS FIFO C (audit)
```

Scenarios needing order and fan-out in payment/accounting domains.

### Cross-account / Cross-region

SNS Topic policy permitting other account ARNs enables cross-account subscriptions. Similar to EventBridge for multi-account fan-out. Cross-region automatic if subscriber endpoint differs.

> ⚠️ **Trap**: "SNS doesn't persist messages" appears frequently in exams. SNS publishes immediately and doesn't store. Subscribers temporarily down trigger SNS retry, but after retry limit, message loss occurs. For persistence, SNS → SQS subscription buffers to SQS, or EventBridge Archive preserves.

## SNS Fan-out + SQS — Most Common Pattern

```
[Publisher]
   │ Publish
   ▼
[SNS Topic: order-events]
   │
   ├──Filter:type=high──► [SQS high-value-queue] → Worker (5 retries) → DLQ
   ├──Filter:type=low──── [SQS low-value-queue] → Worker
   └──Lambda(analytics) direct subscription
```

SQS subscriptions fan-out because:
- Each downstream processes at **its own polling rate** (slow consumer doesn't block fast publisher)
- DLQ isolates failures
- Visibility timeout prevents processing duplicates

> 🎯 **Scenario**: "An OTT service emits video upload complete event triggering 4 downstream: (1) transcoding (2) thumbnail (3) search indexing (4) audit log. Best architecture?" — Answer: **SNS Topic + 4 SQS subscriptions**. Each downstream polls at its pace + failed messages isolated to DLQ. EventBridge possible but SNS cheapest for simple 4-way fan-out.

## Kinesis Data Streams — Replayable Stream

Kinesis fundamentally differs from SQS. SQS: "consume message once, then delete." Kinesis: "keep stream flowing time-ordered; multiple consumers each read by offset."

### Shard Model

Streams divide into **Shards** (partitions). Each shard:
- Write: 1MB/s or 1,000 records/s
- Read: 2MB/s
- Retention: 24 hours (default) to 365 days (configurable)

Insufficient throughput → split shards; excess → merge. Or use **On-Demand mode** (2021) for auto-scaling.

### Partition Key — Ordering Unit

Producers specify partition key when sending records. Same key → same shard → **order guaranteed within shard**. E.g., user_id as key guarantees one user's events ordered.

> 🔍 **Deeper Dive**: Partition key choice is critical. Poor selection creates **hot shard**. Example: `region` as key concentrates us-east-1 traffic in one shard. Generally pick keys with high cardinality like user_id, session_id. AWS MD5-hashes partition keys to shard mapping; uniform key distribution auto-balances.

### Consumer Model — Standard vs Enhanced Fan-out

- **Standard (shared)**: All consumers share shard's 2MB/s. 5 consumers each get ~400KB/s.
- **Enhanced Fan-out (EFO)**: Each consumer gets 2MB/s dedicated. Max 20 consumers/shard. Push model (HTTP/2 long polling) reduces latency 70%.

Multiple consumers simultaneously reading same stream → EFO. Biggest Kinesis/SQS difference.

### Kinesis vs SQS — Real Difference

| Dimension | SQS | Kinesis |
|---|---|---|
| Model | Queue (single consume) | Stream (replayable) |
| Retention | 14 days (default 4) | 24h~365d |
| Ordering | FIFO only | Guaranteed within shard |
| Multiple Consumers | No (one message, one worker) | Yes (each reads by offset) |
| Replay | No (deletes after consume) | Yes (reread possible) |
| Use Case | Task queue, background work | Real-time analytics, time-series, multi-consume |
| Pricing | Per request | Shard-hour + PUT payload unit |

> 🎯 **Scenario**: "Ad platform receives user click events for real-time analytics (hourly aggregation) AND retains 7 days raw data for ML retraining, replayable. Best?" — Answer: **Kinesis Data Streams (7-day retention) + Lambda consumer (real-time aggregation) + Firehose consumer (S3 storage, EFO)**. SQS can't do multi-consumer and replay. EFO lets consumers run without throughput impact.

## Kinesis Firehose — Delivery Stream

Firehose sounds like Kinesis Data Streams but differs fundamentally. It **auto-delivers to destination**.

- **Destinations**: S3, Redshift, OpenSearch, Splunk, Datadog, MongoDB Atlas, 3rd-party HTTP endpoint
- **Buffering**: By time (60–900s) or size (1–128MB) batches
- **Transform**: Lambda-triggered ETL, auto Parquet/ORC
- **Compression**: GZIP, Snappy

Firehose lacks shard management, partition key, offset concepts. Just receives data → buffer + transform + deliver. ELT pipeline standard entry.

## MSK (Managed Kafka)

Managed Apache Kafka version. Standard Kafka clients usable. Kinesis fork:
- **Portability needed** (multi-cloud, Kafka standard tooling) → MSK
- **AWS-focused + minimal ops** → Kinesis
- **Schema Registry, Connect, KSQL ecosystem tools needed** → MSK

MSK Serverless (2022) even manages cluster. Throughput-based billing.

## Lambda Event Source Mapping (ESM) — Messaging → Lambda

Connect SQS, Kinesis, DDB Streams, MQ, MSK as Lambda sources. Lambda handles own poll + invoke.

Key parameters:
- **BatchSize**: Records per invocation (SQS 10/Kinesis 100/MSK 10,000)
- **MaximumBatchingWindow**: Max time batching
- **ParallelizationFactor** (Kinesis/DDB): Concurrent workers per shard (1-10)
- **ReportBatchItemFailures**: Precisely report partial batch failure (prevent full retry)

> ⚠️ **Trap**: ESM's **ReportBatchItemFailures** appears frequently in exams. Default: "one failure in batch → retry full batch." Without idempotence, causes duplicate processing. Enable ReportBatchItemFailures; function returns failed message ID list, Lambda retries only those and acks others.

## AppSync + Pipes + EventBridge — Integration Pattern

Modern EDA rarely ends with one tool. Common combo:

```
[Mobile App] ─GraphQL─► [AppSync]
                        │ Mutation
                        ▼
                [DynamoDB] ─Streams─► [EventBridge Pipes]
                                       │ Filter
                                       ▼
                                 [EventBridge Bus]
                                       │ Rule
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
            [Step Functions]    [SNS Topic]          [Kinesis Firehose]
              (workflow)        (fan-out)           (S3 storage, ML)
                                    │
                            ┌───────┴───────┐
                            ▼               ▼
                       [SQS analytics] [SQS alerts] → Worker
```

AppSync is client interface, DDB Streams is source-of-truth change event, EventBridge distributes, Step Functions/SNS/Kinesis each handle roles.

> 📚 **Case Study**: In 2023, Goldman Sachs' internal trading platform presented AppSync receiving client GraphQL, mutations flowing DDB Streams → EventBridge to fan-out risk engine, audit, downstream alerts. Transitioning from monolithic REST + direct call chains to microservice EDA doubled new feature velocity.

## Closing Remarks

GraphQL, SQS, SNS, Kinesis, MSK, Firehose all move data but differ fundamentally:

- **AppSync**: Client-server data contract (GraphQL + Subscription)
- **SQS**: Single-consume queue (Standard unlimited / FIFO ordered)
- **SNS**: Pub/Sub fan-out (Topic + Subscription, FIFO possible)
- **Kinesis**: Replayable stream (Shard, Partition Key, EFO)
- **Firehose**: Delivery stream (auto S3/Redshift/OpenSearch)
- **MSK**: Kafka standard (portability)

Exam keyword mapping:
- "GraphQL + real-time + mobile" → **AppSync**
- "Single process + ordered" → **SQS FIFO**
- "Fan-out + very high throughput" → **SNS**
- "Replay + multi-consumer" → **Kinesis Data Streams + EFO**
- "Auto-save to S3" → **Firehose**
- "Kafka standard + portability" → **MSK**

Next day (week recap) consolidates week 8 with 10 comprehensive scenarios.

---

## 📝 Practice Questions

**Question 1.** A mobile app shows 4 resources — user, order, shipping address, and payment — on one screen. The client must receive only the fields it needs and also receive real-time order status pushes. Cognito authentication is required. What is the most appropriate backend?

A) REST API Gateway + Lambda + WebSocket API
B) AppSync GraphQL + Subscription + Cognito User Pool
C) ALB + ECS Service
D) GraphQL on Lambda + DynamoDB

**Answer: B**
Explanation: GraphQL lets the client declaratively request only the fields it needs, which resolves overfetch/underfetch. AppSync provides managed GraphQL + WebSocket subscriptions + Cognito integration in one service. A is not GraphQL, and the client would have to combine 4 calls itself. C does not determine any API style. D requires you to operate the GraphQL server yourself and to implement subscriptions. Trap: the keyword combination "GraphQL + real-time + mobile + Cognito" is almost always AppSync. Additional note: calling DynamoDB directly with an AppSync direct resolver eliminates Lambda cold starts.

---

**Question 2.** A payment processing queue — ordering guarantee + deduplication (to prevent processing the same payment twice) + up to 1,000 TPS. What is the most appropriate configuration?

A) SQS Standard + idempotency in code
B) SQS FIFO with content-based deduplication (High Throughput mode)
C) Kinesis Data Streams (single shard)
D) SNS Topic + Lambda

**Answer: B**
Explanation: SQS FIFO guarantees ordering per MessageGroupId + 5-minute deduplication. The default is 300 TPS, but High Throughput mode expands partitions to allow 3,000+ TPS. Content-based deduplication removes duplicates automatically using a hash of the message body. A has no ordering guarantee (Standard is best-effort). C (Kinesis single shard) has a limit of 1 MB/s = 1,000 records/s, but its ack and visibility model is awkward for payment workflows, and it is an excessive tool for payments that need no reprocessing. D (SNS) is fan-out rather than a queue, so it is unsuitable. Trap: even SQS FIFO does not strictly guarantee "exactly-once" (5-minute dedup window). Application-level idempotency is recommended.

---

**Question 3.** One event is fanned out to 5 downstream consumers (analytics, CRM, shipping, notifications, audit), each processing at its own speed. Each downstream needs retry + isolation on failure. What is the most appropriate configuration?

A) SNS Topic + 5 SQS subscriptions + a DLQ for each SQS
B) Kinesis Data Streams + 5 Consumers
C) 5 EventBridge Rules
D) Lambda chain

**Answer: A**
Explanation: SNS is optimal for fan-out at very high throughput; with SQS subscriptions each downstream processes at its own polling speed, the visibility timeout prevents duplicate processing, and a DLQ isolates permanent failures. B (Kinesis) is for reprocessing and time-series analysis, and for a 5-way fan-out SNS is more suitable and cheaper. C (EventBridge) is also possible, but for simple fan-out with high throughput SNS has a lower unit price. D has high coupling. Trap: "diverse filters + external SaaS targets" is EventBridge; "simple fan-out + very high throughput" is SNS. Additional note: applying a FilterPolicy to an SNS subscription enables per-downstream filtering.

---

**Question 4.** Messages that fail processing are isolated permanently after 5 attempts so that operators can analyze them. What configuration should you use?

A) A longer Visibility Timeout
B) SQS DLQ + RedrivePolicy maxReceiveCount=5
C) Long Polling
D) Use a Delay Queue

**Answer: B**
Explanation: DLQ + maxReceiveCount=5 automatically moves a message to the DLQ after 5 receive attempts. The DLQ is a separate SQS queue where operators analyze, reprocess, or delete messages. A is merely a processing-time lock, not permanent isolation. C makes polling more efficient and is not failure handling. D (Delay Queue) delays new messages (0-15 minutes). Trap: maxReceiveCount is the number of receives, not the number of processing failures. The count increases by 1 when a message is polled and then exceeds the visibility timeout. Additional note: once a fix is deployed after DLQ analysis, redrive sends messages back to the main queue (a console feature since 2021).

---

**Question 5.** An advertising platform aggregates a clickstream in real time while retaining 7 days of raw data for ML training, with reprocessing possible. Two consumers must process simultaneously without affecting each other's latency.

A) SQS
B) Kinesis Data Streams + Enhanced Fan-Out (EFO)
C) SNS Topic
D) EventBridge Pipes

**Answer: B**
Explanation: Kinesis supports reprocessing, multiple consumers, and 7-day retention. EFO gives each consumer a dedicated 2 MB/s per shard with a push model, reducing latency by 70%. The two consumers (a real-time aggregation Lambda and an S3 retention Firehose) run simultaneously without affecting each other's throughput. A (SQS) is single consumption and does not allow multiple consumers. C (SNS) has no retention or reprocessing. D is a single source → target pipe. Trap: "multiple consumers + reprocessing" is almost always Kinesis. The difference between EFO and standard consumers is frequently tested. Additional note: the shard retention period can be set from 24h (default) up to 365d.

---

**Question 6.** All messages are published to a single SNS Topic, and each subscriber should receive only a specific attribute (type=high). Without writing code.

A) SNS Message Filtering (FilterPolicy)
B) SQS Visibility Timeout
C) EventBridge Archive
D) Kinesis Sharding

**Answer: A**
Explanation: SNS Message Filtering specifies a FilterPolicy on the subscription so that it receives only matching messages. It supports patterns such as exact/prefix/anything-but/numeric/IP. It is managed with no code to write. B is a processing lock, not filtering. C is an EventBridge feature and unrelated to SNS. D is in the Kinesis domain. Trap: SNS filtering is based on message attributes (or on the message body, since 2020) and differs from EventBridge's rich JSON field matching. For simple filtering, SNS is the answer; for complex matching, EventBridge.

---

**Question 7.** In a Lambda Event Source Mapping (SQS source) with batch size = 10, the default behavior when one message fails is to retry the whole batch. How can you retry only the failed messages?

A) A shorter Visibility Timeout
B) Enable ReportBatchItemFailures + the function returns the failed message IDs
C) Send immediately to the DLQ
D) Set BatchSize=1

**Answer: B**
Explanation: ReportBatchItemFailures is the partial batch response feature of Lambda ESM. When the function responds in the form `batchItemFailures: [{itemIdentifier: "msg-id-1"}, ...]`, Lambda retries only the failed messages and acks the rest (deletes them from the queue). The default behavior (retrying the whole batch) causes duplicate processing if the processing is not idempotent. A is unrelated. For C, the DLQ applies only after maxReceiveCount is exceeded. D (BatchSize=1) is very inefficient. Trap: "batch processing + partial failure" is answered by ReportBatchItemFailures. Additional note: Kinesis/DDB Streams ESM supports the same feature.

---

## 📌 Today's Summary

1. **AppSync GraphQL**: schema-first + direct resolver (DDB without Lambda) + Subscription (WebSocket) + 5 authentication modes
2. **SQS Standard** (unlimited TPS, no ordering) vs **FIFO** (300 TPS, ordering + 5-minute dedup) + High Throughput FIFO
3. **Visibility Timeout** = average processing time × 1.5-2, **Long Polling** = fewer empty calls
4. **DLQ + maxReceiveCount** = isolating permanent failures, recovery with redrive
5. **SNS Topic + SQS subscription** = the standard for fan-out, **Message Filtering** + **FIFO Topic** (2020)
6. **Kinesis Data Streams** = reprocessing + multiple consumers, **Shard + Partition Key**, **EFO** dedicated 2 MB/s
7. **Firehose** = automatic delivery to S3/Redshift/OpenSearch (60-900 second buffer + transformation)
8. **MSK** = Kafka standard portability, **MSK Serverless** (2022)
9. **Lambda ESM**: BatchSize, MaximumBatchingWindow, ParallelizationFactor, **ReportBatchItemFailures**
