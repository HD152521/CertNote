# Day 3 - EventBridge: Unified Model of Event Bus, Pipes, and Scheduler

Once microservices exceed five, the biggest cost in a system is no longer code but **coupling**. A service directly calling B and B calling C creates a chain that seems simple at first, but B's failure propagates to A, and every time a new service D is added, both sides' code must be modified. The pattern that solves this is **Event-Driven Architecture (EDA)**. Services publish events, and other services subscribe to them. Publishers don't know who's listening, and subscribers don't know who sent it.

AWS has multiple EDA tools (SNS, SQS, Kinesis, EventBridge), but the biggest shift in the past 5 years is that **EventBridge became the de facto standard router**. Following CloudWatch Events' successor launch in 2019, Pipes (2022) and Scheduler (2022) were added, evolving it into a platform handling "everything about events." In the SAP exam, EventBridge questions scatter across domains 1, 2, and 3, with frequent "SNS vs EventBridge" and "Pipes vs Step Functions" scenario choices.

## Why Is EDA Necessary — The Coupling Problem of Distributed Systems

Conway's Law states: "System architecture mirrors the communication structure of the organization that built it." Conversely, a system's coupling structure determines organizational coupling. If 100 teams run microservices, synchronous direct call chains mean 100 teams must coordinate deployment schedules.

Core ideas of EDA:
- **Temporal Decoupling**: Publisher doesn't need subscriber alive at publish time
- **Spatial Decoupling**: Publisher doesn't know subscriber's location (IP, endpoint)
- **Synchronization Decoupling**: Publisher is not blocked

The tool that provides all three is a message broker. EventBridge is a variant specialized in "event routing."

> 💡 **Related Theory**: EDA's classical models evolved from 1980s Linda Tuple Space and 1990s Publish/Subscribe (Eugster, "The many faces of publish/subscribe", ACM Computing Surveys 2003). Key classifications: **Topic-based** (subject-based, SNS, Kafka), **Content-based** (content-based filtering, EventBridge), **Type-based**. EventBridge is unique in providing content-based filtering as a managed service while bundling 200+ AWS services as targets.

> 🔍 **Deeper Dive**: EventBridge internally is a distributed routing system. When events arrive: (1) Schema validation (optional) (2) Rule pattern matching (3) Target dispatch happen sequentially. Pattern matching uses **trie data structures** for indexing, ensuring consistent latency even with thousands of rules. Unlike SNS, EventBridge supports JSON deep-field-based matching (`detail.amount.value > 1000`) — the biggest difference.

## Three Types of Event Bus — Classified by Publisher

EventBridge routes events over **Buses**. There are three types.

| Type | Publisher | When to Use |
|------|-----------|-----------|
| **Default Bus** | AWS services (automatic) | AWS events: EC2 state changes, S3 object creation, ECS task termination, etc. |
| **Custom Bus** | User application (PutEvents API) | Domain events (OrderPlaced, UserRegistered, etc.) |
| **Partner Bus** | SaaS partners (Shopify, Datadog, Auth0, etc.) | Receive events directly from external SaaS |

Each account automatically has one Default Bus; Custom Buses can be created per domain. The typical pattern is separating buses by domain boundary:
- `order-domain-bus` — order events
- `payment-domain-bus` — payment events
- `inventory-domain-bus` — inventory events

Each Bus can allow publishing/subscription from other accounts via **Cross-account policies**, enabling natural event mesh configurations in multi-account environments.

> 📚 **Case Study**: Liberty Mutual runs its insurance claims processing system on 100+ microservices using 12 Custom Buses per domain. Each bus is managed by its domain's owning team, and other domains subscribe to needed events via cross-account subscriptions. This model lets new teams join without impacting existing buses — they create their own and communicate via publishing/subscription policies. Presented at AWS re:Invent 2022.

## Rule = Pattern + Targets

Events on a bus are matched by **Rules** and sent to **Targets**. One Rule supports up to **5 Targets** maximum.

```json
{
  "source": ["myapp.orders"],
  "detail-type": ["OrderPlaced"],
  "detail": {
    "amount": [{ "numeric": [">", 1000] }],
    "region": ["us-east-1", "eu-west-1"]
  }
}
```

This rule matches only events where source is `myapp.orders`, detail-type is `OrderPlaced`, amount > 1000, and region is one of two locations. EventBridge's pattern language supports these operators:

- **Exact match**: Exactly matches values in array
- **Prefix match**: `{"prefix": "Order"}`
- **Suffix match** (2023): `{"suffix": ".jpg"}`
- **Numeric**: `{"numeric": [">", 100, "<=", 1000]}`
- **Exists**: `{"exists": true}`
- **Anything-but**: `{"anything-but": "test"}`
- **IP address**: CIDR matching
- **Equals-ignore-case** (2023): Case-insensitive matching

Targets can be 200+ AWS services + API Destination (external HTTPS) + other buses + Pipes, etc. Specify IAM Role per target for least privilege.

> ⚠️ **Trap**: "One rule supports max 5 targets" appears in exams. If more targets are needed, use Step Functions as a target and fan-out inside, or create multiple rules with the same pattern. Different from SNS: SNS topics allow unlimited subscriptions, but that's a fan-out pattern, not EventBridge's "rule-based routing" abstraction.

> 🔍 **Deeper Dive**: API Destination (2021) is extremely powerful. Register an external SaaS HTTPS endpoint as a target, and EventBridge automatically handles authentication (API Key, OAuth, Basic), throttling, retry, and DLQ. Used for Slack message sending, Salesforce updates, webhooks to your SaaS, etc. Saves operational burden and cost by bypassing Lambda, with standard HTTP header + body transformation via InputTransformer.

## EventBridge Pipes — New Standard for 1:1 Integration

Pipes (2022) is a tool for configuring the most common EDA pattern: **"queue/stream → filter → enrich → target"** without code. Previously, this required custom Lambda logic.

```
[Source: SQS / Kinesis / DDB Stream / MQ / MSK]
    │
    ▼
[Filter: Event pattern matching]
    │
    ▼
[Enrich: Lambda / Step Functions / API Destination / API GW]
    │
    ▼
[Target: 20+ AWS services]
```

Each stage is optional, so the simplest form is direct "Source → Target" wiring.

**Source types** (similar to Lambda Event Source Mapping):
- SQS (Standard/FIFO)
- Kinesis Data Streams
- DynamoDB Streams
- Amazon MQ (RabbitMQ/ActiveMQ)
- MSK (Managed Kafka)
- Self-managed Kafka

**Target types**: SQS, SNS, EventBridge Bus, Step Functions, Lambda, ECS, Firehose, API Destination, API GW, Kinesis, CloudWatch Logs, Redshift Data, SageMaker Pipeline, and 20+ others.

> 🎯 **Scenario**: "I want to filter DynamoDB Streams change events and send only specific patterns to Step Functions without writing Lambda code." — Answer: **EventBridge Pipes (Source=DDB Stream, Filter=pattern, Target=Step Functions)**. Previously, the standard was DDB Streams → Lambda (filter logic) → Step Functions, adding Lambda operational overhead (code deployment, error handling, logging). Pipes replaces this with managed integration at lower cost than Lambda.

### Pipes vs Step Functions — Confusing Fork

| Tool | When to Use |
|------|-----------|
| **Pipes** | Single source→target, 1:1 routing, filter + simple transformation |
| **Step Functions** | Complex branching, parallelism, compensating transactions, external callbacks, multi-step workflows |

Common pattern: **Pipes' target is Step Functions**. SQS → Pipes (filter) → Step Functions (workflow) for lightweight ingress and rich flow.

> 📚 **Case Study**: In 2023, Doordash transitioned its order processing pipeline from SQS + Lambda (filter logic) → Step Functions to SQS + Pipes (filter) → Step Functions, removing Lambda operational burden and achieving ~30% cost reduction. At the same throughput, Pipes has lower per-unit cost than Lambda, and code disappears, reducing failure surface area.

## EventBridge Scheduler — Era of One Million Crons

CloudWatch Events Rule's cron had a limit of hundreds of rules per account. Inadequate for use cases like per-user notification times. Scheduler (2022) breaks this limit, supporting **1M+ schedules per account**.

Features:
- **One-time** or **Recurring (cron/rate)** schedules
- **Time zone** specification (IANA tz database)
- **Flexible time window**: Scatter execution over window (±15 min) instead of exact time
- **200+ AWS API direct calls** (bypass Lambda for SNS Publish, ECS RunTask, etc.)
- **Universal target** (2023): Call any AWS SDK API

Scheduler replaced EventBridge Rule cron due to **scale + per-schedule customization**. Running one million users' alerts at different times is impossible with Rules, but simple with Scheduler.

> 🎯 **Scenario**: "A SaaS sends daily summary emails to one million users at their preferred times. Each user's timezone and time differ." — Answer: **EventBridge Scheduler**. Create one million schedules, each with a cron expression per user, specifying SNS Topic or Lambda as target. Set Flexible time window to 15 minutes to scatter load at the same time.

> ⚠️ **Trap**: "Create 1M EventBridge Rules for cron" is a trap. Rules have account-wide limits (thousands). Scheduler is the answer.

## Schema Registry — Managing Event Evolution

One core challenge of event-driven architecture is **schema evolution**. If publishers add new fields or change existing ones, all subscribers can break. EventBridge Schema Registry addresses this:

- **Auto-discovery**: Automatically extract and register schemas of events passing through the bus
- **Versioning**: Save new versions with each schema change (semver)
- **Code Binding**: Auto-generate Java/Python/TypeScript SDK code for strongly-typed event handling
- **OpenAPI 3 standard export**

> 🔍 **Deeper Dive**: Schema Registry is conceptually similar to Confluent Schema Registry in the Kafka ecosystem. The difference: EventBridge uses **structural typing** (field-based), while Kafka Schema Registry uses **nominal typing** (schema ID-based). EventBridge doesn't directly enforce backward/forward compatibility, so publishers can break contracts, requiring subscribers to follow idempotent + tolerant readers patterns (Postel's Law) for safety.

## Archive and Replay — Debugging Through Time Travel

EventBridge Archive preserves events passing through a bus (indefinitely, optionally). Replay replays preserved events for a specific time range.

Use cases:
- **Reprocess missing events after bug fix**: Replay only yesterday's unprocessed events from archive
- **Build initial state with past events when onboarding new subscriber**: Event Sourcing pattern initialization
- **Disaster Recovery**: Replay events in another region after regional failure

```bash
aws events start-replay \
  --replay-name fix-2024-03 \
  --event-source-arn arn:aws:events:...:archive/orders \
  --event-start-time 2024-03-01T00:00:00Z \
  --event-end-time 2024-03-02T00:00:00Z \
  --destination Arn=arn:aws:events:...:event-bus/order-domain,FilterArns=[...]
```

> 📚 **Case Study**: In 2022, Coinbase preserved a year's worth of payment processing events in EventBridge Archive. A partner integration bug caused several days of lost events. Archive + Replay allowed recovery without requesting republication from the sender. Previously, you'd ask the publisher to resend; now the receiver handles recovery alone. When "event reprocessing" is a keyword, Archive + Replay is likely the answer.

## SNS vs EventBridge — Most Confusing Fork

These two are conceptually similar and often confused in exams.

| Item | SNS | EventBridge |
|------|-----|-------------|
| Essence | Pub/Sub Topic | Content-based Event Router |
| Pattern Matching | Message attributes (simple) | JSON deep fields (rich) |
| Throughput | Very high (100,000+ TPS per topic) | Moderate (~10,000 TPS per account/region, can increase) |
| Target Types | Lambda, SQS, HTTP/S, SMS, Email, Mobile Push | 20+ AWS + API Destination + other buses |
| Schema | None | Schema Registry |
| Archive | None | Yes |
| Cost | Publish $0.50/M + delivery costs | $1.00/M custom + free AWS events |
| When to Use | **Simple fan-out + very high throughput** | **Rich filtering + diverse targets** |

Common decision tree:
- "Same message to 5 SQS + very high throughput" → **SNS Fan-out**
- "Complex condition matching + external SaaS target + other buses" → **EventBridge**
- "Receive SaaS partner events" → **EventBridge Partner Bus**
- "Mobile push, SMS, email directly" → **SNS**

> 🎯 **Scenario**: "An e-commerce company fans out 'payment complete' events to 5 downstream systems (analytics, shipping, CRM, alerts, audit logs). All downstream receive the same event; throughput is 5,000/sec." — Answer: **SNS Topic + 5 SQS subscriptions**. Perfect SNS sweet spot: simple fan-out + high throughput. EventBridge works but requires 5 rules matching the same pattern and costs more with lower throughput limits.

> 🎯 **Scenario 2**: "A global SaaS receives Stripe webhook + Shopify webhook + its own domain events, routing amount > $1,000 events to Step Functions and others to Lambda." — Answer: **EventBridge (Partner Bus + Custom Bus + rich pattern matching + Step Functions/Lambda targets)**. Partner Bus integrates Stripe/Shopify directly; content-based routing is the answer.

## DLQ and Retry — EventBridge's Own Failure Handling

When EventBridge fails to deliver events to a target (target errors, throttling, etc.):
- **Retry**: Default 24 hours, exponential backoff
- **DLQ (SQS)**: Isolate finally failed events

Specify a DLQ per rule; events reaching DLQ are analyzable with metadata (target ARN, failure reason, attempt count).

> ⚠️ **Trap**: "EventBridge target is Lambda; if Lambda fails, EventBridge retries" is partially correct. Precisely: EventBridge retries if Lambda Invoke itself fails; Lambda function business logic failures use Lambda's async retry model (2 auto-retries) + Destinations. Confusing the two layers breaks scenario solving.

## EventBridge vs Kinesis vs Kafka — Streaming Perspective

EventBridge is a **discrete event router**; Kinesis/Kafka are **continuous stream platforms**.

| Dimension | EventBridge | Kinesis Data Streams | Kafka (MSK) |
|-----------|-------------|---------------------|-------------|
| Model | Event router | Ordered stream | Distributed log |
| Retention | Archive optional | 24h~365d | Unlimited |
| Ordering | Not guaranteed | Guaranteed within shard | Guaranteed within partition |
| Throughput | ~10K TPS (typical) | 1MB/s per shard | Very high per partition |
| Use Case | Event routing, workflow triggers | Real-time analytics, time-series | Log aggregation, event sourcing, portability |
| Reprocessing | Archive + Replay | Rescan within shard | Reset offset |

EventBridge is optimized for "routing single events"; Kinesis/Kafka optimize for "sequential stream processing." They're often used together: Kafka → EventBridge Pipes → diverse targets.

> 📚 **Case Study**: In 2023, Capital One's payment fraud detection system receives transaction events via Kinesis Data Streams, filters suspicious ones with EventBridge Pipes, and sends to Step Functions (multi-step verification + human approval). Kinesis handles raw stream ordering/reprocessing; EventBridge handles routing/filtering — a division of labor pattern.

## Closing Remarks

EventBridge evolved beyond a simple "event router" into a **complete event platform** bundling Bus (categorization), Rule (matching), Pipes (integration), Scheduler (timing), Schema Registry (evolution), and Archive (time travel). Exam scenario keyword mapping:

- "Domain events + rich filtering" → **Custom Bus + Rule**
- "SaaS integration" → **Partner Bus**
- "Queue → workflow without code" → **Pipes**
- "One million user schedules" → **Scheduler**
- "Schema evolution" → **Schema Registry**
- "Replay past events" → **Archive + Replay**
- "Simple fan-out + very high throughput" → **SNS** (not EventBridge)

Next day covers AppSync (GraphQL) and SQS/SNS messaging patterns. If EventBridge is "event distribution," SQS/SNS is "messaging fundamentals," and AppSync is "real-time API." How these three cooperate to complete EDA is next.

---

## 📝 Practice Questions

**Question 1.** A SaaS company wants to filter messages arriving in an SQS queue, send only a specific pattern to Step Functions, and ignore the rest. What is the simplest configuration without writing Lambda code?

A) Lambda (filter) → Step Functions
B) EventBridge Pipes (Source=SQS, Filter, Target=Step Functions)
C) SQS Redrive Policy
D) EventBridge Rule (Source=SQS)

**Answer: B**
Explanation: Pipes is a tool built precisely to configure this pattern (SQS/Kinesis/DDB Stream → filter → target) without code. A adds the operational burden of Lambda. C (Redrive) is for isolating failed messages, not filtering. D (EventBridge Rule) matches events that arrive on an EventBridge Bus and cannot take SQS directly as a source. Trap: if "without code" is the keyword, it is Pipes. Additional note: you can insert Lambda or Step Functions in Pipes' enrichment stage for light transformation. EventBridge pattern matching is available for both input and output.

---

**Question 2.** A global SaaS company sends a daily summary email to 1 million users at each user's preferred time (time zone + time of day). Each user's schedule must be managed individually. What is the most appropriate configuration?

A) 1 million EventBridge Rules
B) 1 million EventBridge Scheduler schedules
C) Lambda + cron Worker
D) Step Functions Wait State

**Answer: B**
Explanation: Scheduler supports 1 million+ schedules per account and provides time zones, cron, and flexible time windows. EventBridge Rules (A) hit the per-account limit (a few thousand). C (Lambda cron) requires your own schedule storage and management infrastructure. D (Step Functions Wait) is waiting within a single workflow, not managing the schedules of 1 million users. Trap: if "a different time per user," Scheduler is the answer. Additional note: a flexible time window (±15 minutes) spreads out the simultaneous load. Targets call 200+ AWS APIs directly (for example, SNS Publish without going through Lambda).

---

**Question 3.** You want to integrate order events from Shopify into an AWS workflow. How can you receive them directly without operating webhook infrastructure?

A) API Gateway + Lambda webhook receiver
B) EventBridge Default Bus
C) EventBridge Partner Event Bus
D) SNS HTTPS subscription

**Answer: C**
Explanation: A Partner Bus is a managed channel through which AWS integrates directly with SaaS partners (Shopify, Stripe, Datadog, Auth0, MongoDB, and others) to receive events. The user simply activates the partner event source and creates a rule. With A, you must operate the webhook receiver yourself (security, authentication, retries, scaling). B (Default Bus) is for AWS services. D (SNS HTTPS) is for outbound notifications. Trap: "SaaS partner events" is almost always Partner Bus. Additional note: major SaaS providers such as Stripe, Shopify, and Datadog are all registered and can be activated with a single step in the console.

---

**Question 4.** You want to retain one year of events from an EventBridge Bus and later replay only the events in a specific time range (for example, 2024-03-01 to 03) to initialize a new downstream consumer. What is the most appropriate feature?

A) S3 + Athena queries
B) EventBridge Archive + Replay
C) CloudTrail Lake
D) Kinesis Firehose backup

**Answer: B**
Explanation: EventBridge Archive retains Bus events (up to indefinitely), and Replay re-sends them by time range + filter. A allows analysis, but re-injecting into a downstream requires separate logic. C (CloudTrail Lake) is for auditing API activity, not application events. D is data storage, not a replay mechanism. Trap: "event reprocessing or replay" is almost always Archive + Replay. Additional note: it is the standard pattern for introducing a new subscriber in Event Sourcing and for recovering missed events after a bug fix.

---

**Question 5.** An e-commerce company fans out an OrderPlaced event as the same message to 5 downstream consumers: analytics, shipping, CRM, notifications, and audit. Throughput is 5,000 per second. What is the most appropriate configuration?

A) EventBridge + 5 Rules
B) SNS Topic + 5 SQS subscriptions
C) Kinesis Data Streams + 5 Consumers
D) Step Functions Parallel state

**Answer: B**
Explanation: Simple fan-out + very high throughput is exactly SNS's sweet spot. It supports 100,000+ TPS per Topic, and with SQS subscriptions each downstream processes at its own polling speed. A (EventBridge) is also possible, but the 5 rules would all need to match the same pattern, EventBridge's unit price is higher, and its throughput limit is lower. C (Kinesis) is for streaming analytics that needs ordering and reprocessing and is not optimal for fan-out. D is parallelism within a single workflow, not downstream fan-out. Trap: "simple fan-out + high throughput" is SNS; "rich filtering + diverse targets" is EventBridge.

---

**Question 6.** The event publishing team frequently adds new fields. How can the subscribing teams process events safely with strongly-typed code (Java/Python) while tracking schema evolution?

A) Glue Schema Registry
B) EventBridge Schema Registry + Code Binding
C) OpenAPI Swagger
D) Manage Avro directly

**Answer: B**
Explanation: EventBridge Schema Registry extracts and versions the schemas of Bus events through auto-discovery and automatically generates Java/Python/TypeScript code bindings. Subscribing teams process events with strong typing using the generated SDK. A (Glue Schema Registry) is a separate service for Kinesis and Kafka. C (OpenAPI) is for REST APIs and is not an event schema standard (although EventBridge can export to OpenAPI 3). D carries a large operational burden of its own. Trap: the schema of EventBridge events goes in EventBridge Schema Registry, and Kafka/Kinesis use Glue Schema Registry. Be careful not to confuse the two.

---

**Question 7.** Lambda is the target of an EventBridge Rule, and an exception occurs because of a business logic error during Lambda function execution. How do you isolate and analyze the failed events?

A) The EventBridge Rule's DLQ
B) The Lambda function's asynchronous Destinations (OnFailure)
C) CloudTrail
D) EventBridge Archive

**Answer: B**
Explanation: The EventBridge → Lambda invocation is an asynchronous invoke, and execution failures inside the Lambda function are handled by **Lambda's own asynchronous retry model + Destinations**. The EventBridge Rule's DLQ (A) is triggered only when **EventBridge itself fails to Invoke Lambda** (throttling, IAM denial, and so on) and cannot catch business errors inside the function. C is API activity auditing. D (Archive) retains events and is not failure isolation. Trap: if you confuse the two layers (EventBridge's target dispatch vs. Lambda function execution), you solve the scenario wrongly.

---

## 📌 Today's Summary

1. **The three decouplings of EDA** (time/space/synchronization), and how Conway's law affects organizational coupling
2. **Three kinds of Bus**: Default (AWS) / Custom (domain) / Partner (SaaS) + cross-account policies
3. **Rule = Pattern + up to 5 Targets**, deep JSON field matching + API Destination
4. **Pipes**: SQS/Kinesis/DDB Stream/MQ/MSK → Filter → Enrich → Target, without code
5. **Scheduler**: 1M+ schedules, time zones, flexible window, direct calls to 200+ APIs
6. **Schema Registry** + **Archive/Replay** — evolution management + time travel
7. **SNS vs EventBridge**: simple fan-out and high throughput vs. rich filtering and diverse targets
8. **Pipes vs Step Functions**: 1:1 routing vs. complex workflows (often a Pipes → SF combination)
