# Day 1 - EventBridge: Event Bus Routing Model and the Nervous System of Asynchronous Automation

Looking at automation systems long enough, you arrive at two fundamental questions. "What happened?" — who detects it, and "what do we do now?" — who decides. In the monolithic era, both lived in the same process. An order arrived; the same function decreased inventory, sent an email, called payments. Caller and called knew each other at compile time. But as systems grew, this point-to-point calling pattern crumbled. Each new feature meant modifying existing code; one slow service dragged every service calling it synchronously; nobody understood the full picture anymore. EventBridge is AWS's answer — events (facts that occurred) are thrown onto a central bus, and those who care subscribe and react. The sender doesn't know the receiver. This "not knowing" is the key to breaking coupling.

Today we don't see EventBridge as "a console for making rules," but excavate the messaging model beneath it. What distinguishes message queues (SQS)·pub/sub (SNS)·from content-based routing, why Event Pattern matching is not simple string comparison but a trie-based decision engine, what enterprise integration pattern EventBridge Pipes implements, what aspect of event sourcing Archive/Replay borrows. In the DOP exam, EventBridge is central to the automation domain, appearing in scenarios like "how to link CodePipeline failure to notifications," "how to wire GuardDuty detection to auto-remediation," "how to manage millions of schedules."

## Event Bus Origins — From EAI to EventBridge

EventBridge's roots trace to early-2000s Enterprise Application Integration (EAI) concerns. Directly connecting N different systems creates N×(N-1)/2 connection lines that explode (the infamous "spaghetti integration"). To solve this came the **message broker** and **message bus** architecture, and Gregor Hohpe and Bobby Woolf's 2003 "Enterprise Integration Patterns" (EIP) became the canon. EIP named patterns: Message Channel, Message Router, Message Translator, Content-Based Router, Message Filter. X-Ray's innards show these patterns directly — Event Bus is Message Channel, Rule is Content-Based Router, Input Transformer is Message Translator, Event Pattern is Message Filter.

Internally, EventBridge was born in 2019, separated and expanded from **CloudWatch Events**. CloudWatch Events originally was a narrow tool ("catch AWS service state changes via cron or pattern, call Lambda"), but AWS layered custom events, SaaS partner events, and schema registry on top, promoting it to general-purpose event bus — that's EventBridge. Both still share the same API backend (`aws events put-rule`).

```
[EAI Spaghetti: N systems, N² connections]    [Bus: N systems, N connections]
   A ─ B                                          A ─┐
   │ ╳ │                                          B ─┼─ [Event Bus] ─ routing rules
   C ─ D                                          C ─┘
   (connection explosion)                        (sender doesn't know receiver)
```

> 💡 **Related theory**: EventBridge is a direct implementation of EIP's **Content-Based Router** pattern. Traditional message routers inspect message headers or body to decide destination; EventBridge's Rule does exactly this — it inspects event JSON (`source`·`detail-type`·`detail` content) and decides which Target receives it. The key: the sender doesn't know the routing logic (EIP calls this "the router encapsulates knowledge of message flow"). Add a new subscriber without changing sender code. This property is called **publisher-subscriber decoupling**, which underpins the independent deployability of microservices.

> 🔍 **Going deeper**: EventBridge, SNS, and SQS get confused frequently; they're different points on the messaging spectrum. **SQS** is point-to-point queue — one message goes to one consumer group (work queue, competing consumers pattern). **SNS** is pub/sub — one message fans out to multiple subscribers, but routing is coarse-grained (at topic level) — subscribers get the whole topic or nothing (SNS filter policies partially mitigate). **EventBridge** adds **content-based precise routing** — same bus events get split by content to different Targets. If throughput and latency are paramount, SNS/SQS is faster and cheaper; if rich filtering·many AWS service integrations·schema management are needed, EventBridge. In exams: "one event branches to 15 different services by content" → EventBridge, "simple fan-out" → SNS, "buffering·retry queue" → SQS.

## Three Event Bus Types and Multi-Account Routing

EventBridge has three bus types, distinguished by "where events come from."

| Type | Source | Characteristics |
|------|--------|-----------------|
| **Default Bus** | AWS service events | Exists per account automatically. State changes from AWS services (EC2, CodePipeline, S3...) flow in automatically. Free to receive AWS events |
| **Custom Bus** | Application `PutEvents` | User-created for domain events. $1 per million events |
| **Partner Bus** | SaaS partners | Datadog, MongoDB Atlas, Auth0, Shopify, etc. send events directly. SaaS-specific integrations |

Production best practice is **splitting domain events into a Custom Bus**, not the Default. Default Bus mixes all AWS service events, making it messy to manage permissions, rules, and observability. Business events (`OrderPlaced`, `PaymentFailed`) go to their own Custom Bus, aligning with domain-driven design's **bounded contexts** per bus.

Cross-account routing is two steps. Receiving-side bus adds a resource policy allowing the sending account's `PutEvents`, and sending-side specifies that bus as a Target.

```bash
# Receiving side (Target account): allow sending account to PutEvents
aws events put-permission \
  --event-bus-name central-bus \
  --action events:PutEvents \
  --principal 111122223333 \
  --statement-id allow-app-account

# Sending side: Target is the other account's bus (Target ARN points to that bus)
```

> 💡 **Related theory**: The pattern of routing multiple accounts' events to one **central event bus** pairs with AWS's multi-account governance to create **event mesh** or hub-and-spoke topology. Each workload account (spoke) sends its events to the central bus in security/audit account (hub), letting central observe all events organization-wide in one place. This echoes AWS Organizations' delegated administrator pattern — centralize authority and observability, but isolate workloads by account.

## Event Pattern — Matching is a Decision Tree, Not Comparison

EventBridge's heart is **Event Pattern** matching. Incoming event JSON is matched against rule patterns; a match sends to Target. Looks like simple JSON comparison but internally it doesn't work that way.

```json
{
  "source": ["aws.codepipeline"],
  "detail-type": ["CodePipeline Pipeline Execution State Change"],
  "detail": {
    "state": ["FAILED"],
    "pipeline": [{ "prefix": "MyApp-" }]
  }
}
```

Patterns have **AND/OR semantics**. Different keys (`source`, `state`) are ANDed (all must match); arrays within one key are ORed (one match suffices). Values support rich operators beyond exact equality.

| Operator | Meaning | Example |
|----------|---------|---------|
| `prefix` / `suffix` | Prefix/suffix match | `{"prefix": "MyApp-"}` |
| `numeric` | Numeric comparison | `{"numeric": [">=", 7]}` |
| `cidr` | IP CIDR block | `{"cidr": "10.0.0.0/24"}` |
| `anything-but` | Negation | `{"anything-but": ["SUCCEEDED"]}` |
| `exists` | Field exists | `{"exists": true}` |
| `equals-ignore-case` | Case-insensitive | |
| `wildcard` | `*` wildcard | `{"wildcard": "*.prod.*"}` |

> 🔍 **Going deeper**: EventBridge doesn't sequentially compare all rules against every event — that scales as O(rule count). Instead, AWS compiles all rule patterns into a single **state machine / decision tree** — common conditions (e.g., `source` matches) are merged into one node, and one event traversal finds all matching rules simultaneously. This technique — the classic **Rete algorithm** (1979, pattern-matching optimization in rule engines) or regex engine's NFA→DFA compilation. Key advantage: even thousands of rules, matching cost is proportional not to rule count but to **event complexity**. AWS open-sourced part of this as `quamina` (Go library) — source code is the answer if you're curious about internals.

> ⚠️ **Pitfall**: Event Pattern is **partial matching (subset match)**. Only fields you specify are checked; if the event has extra fields, they're ignored. So `{"detail": {"state": ["FAILED"]}}` catches all events where state is FAILED, filtering out those without state or with different values. Common mistake: thinking this means "JSON must be exactly identical." Also: values are **always arrays**. `"state": "FAILED"` (string) is wrong; `"state": ["FAILED"]` (array) is right. Arrays mean OR, so even single values go in 1-element arrays.

## Input Transformer — Translate Events into Target's Language

The format the Target (e.g., SNS for Slack) wants and EventBridge's original event format nearly always differ. Send the raw event unchanged and Slack sees a giant JSON blob. **Input Transformer** translates between them — extracting needed values from the event via JSONPath and injecting into a template.

```json
"InputTransformer": {
  "InputPathsMap": {
    "pipelineName": "$.detail.pipeline",
    "state": "$.detail.state"
  },
  "InputTemplate": "{\"text\":\"Pipeline <pipelineName> is <state>\"}"
}
```

This is EIP's **Message Translator** pattern. Transform sender's format to receiver's format in the middle so neither knows the other's format. By separating routing (where to) from transformation (what), the same event reaches different Targets in different formats.

## EventBridge Scheduler — Why CloudWatch Cron Was Replaced

Running "backup at 3 AM daily" via cron is an old pattern. Historically CloudWatch Events scheduled rules were used, but in 2022 AWS released **EventBridge Scheduler**, a separate service. The reason: scale. CloudWatch Events scheduling had tight rule-count limits per account/region, making it hard to represent hundreds of thousands of user-specific schedules (e.g., "charge each user's subscription on their renewal date").

```bash
aws scheduler create-schedule \
  --name nightly-backup \
  --schedule-expression "cron(0 3 * * ? *)" \
  --target '{
    "Arn": "arn:aws:lambda:...:function:BackupFn",
    "RoleArn": "arn:aws:iam::...:role/SchedulerRole"
  }' \
  --flexible-time-window Mode=OFF
```

Scheduler's three distinctions. First, **millions of schedules** (individual schedules as first-class objects). Second, **Flexible Time Window** — don't run exactly then, but "anytime in this 15-minute window," spreading execution so thousands of jobs don't detonate at 3 AM sharp (**thundering herd** prevention). Third, **one-time schedules** (run once then auto-delete) without a queue, expressing "expire this token in 3 days" as delayed work.

> 💡 **Related theory**: Flexible Time Window is the classic distributed-systems technique of **intentionally injecting jitter**. When all clients act at the same moment (or same backoff interval), load concentrates at that point, overwhelming downstream (thundering herd). Add random time variance and load spreads across time axis. Same principle: exponential backoff with jitter (AWS Architecture Blog classic), DNS TTL distribution, cache expiry spreading (cache stampede prevention). Scheduler bakes this pattern into cron scheduling.

## EventBridge Pipes — Polled Integration Without Code

Appearing in 2022, **Pipes** changed EventBridge's character. Existing Rules are **push** (bus receives events, Route sends to Target), but Pipes is **poll** — sources like SQS·Kinesis·DynamoDB Streams·MSK that need polling become first-class, filtered and enriched then sent to Target.

```
Source → Filter → Enrichment → Target
(SQS/Kinesis/    (event     (Lambda/    (EventBridge
 DDB Stream/      pattern)   Step Fn/    standard Target)
 MSK/MQ)                      API Dest)
```

- **Source**: SQS, Kinesis, DynamoDB Streams, Amazon MSK, self-managed Kafka, MQ
- **Filter**: Event Pattern for 1st pass (discard unnecessary events without Enrichment/Target cost)
- **Enrichment**: Lambda/Step Functions/API Gateway/API Destination adds data (e.g., attach details to an event with just an ID)
- **Target**: All EventBridge standard Targets

Core value: **glue code elimination**. Previously, "SQS poll → filter → enrich via external API → save to DynamoDB" meant writing Lambda with polling logic, batching, error handling manually. Pipes absorbs this plumbing as managed service.

> 🔍 **Going deeper**: Pipes is literally named after EIP's **pipes and filters** architecture, which routes data through a series of processing stages (filters) connected by pipes. Each stage is independently pluggable/replaceable — swap one filter or insert another. Unix shell `cat | grep | sort` is the archetype. Pipes' four stages (Source-Filter-Enrich-Target) are each independently configurable, and changing one doesn't break the rest. Also, Pipes' Filter stage shows **early filtering's economics** — drop unnecessary events before expensive Enrichment (Lambda invocation, cost) or Target transmission. "Push filters to the pipeline's front" mirrors database query optimization's predicate pushdown principle.

## Archive & Replay — Event Sourcing's Shadow

EventBridge can **archive** events passing through the bus and **replay** them later.

```bash
aws events create-archive --archive-name PaymentEvents \
  --event-source-arn arn:aws:events:...:event-bus/default \
  --retention-days 90 \
  --event-pattern '{"source":["custom.payments"]}'

aws events start-replay --replay-name fix-bug-20260601 \
  --event-source-arn arn:aws:events:...:archive/PaymentEvents \
  --event-start-time 2026-06-01T00:00:00Z \
  --event-end-time 2026-06-01T06:00:00Z \
  --destination 'Arn=arn:...:event-bus/default,FilterArns=[arn:...:rule/ReprocessRule]'
```

Typical use: incident recovery. "A bug in payment Lambda caused June 1 early-morning events to process incorrectly → fix the bug → Replay that time window's events to reprocess."

> 💡 **Related theory**: Archive/Replay borrows **event sourcing's** core insight — if you make "a log of events that happened" your source of truth instead of state, you can replay that log to recreate any point-in-time state or reprocess. Event sourcing calls this "replaying the event stream to rebuild the read model." But EventBridge Archive is not a complete event sourcing store — ordering is weak (at-least-once, no order guarantee) and retention is not infinite (retention settings limit). So EventBridge Replay is "recent-window incident recovery and reprocessing," not "permanent audit ledger." True event sourcing needs Kinesis Data Streams or dedicated event stores (EventStoreDB). In exams: "reprocess events after fixing bug" → Replay; "permanent audit trail forever" → different answer.

## Delivery Guarantees and Safety Nets — DLQ, Retry, Idempotency

EventBridge delivery is **at-least-once** (same event can arrive twice). This is a fundamental distributed-systems limit; **exactly-once** is generally impossible or very expensive.

```json
"DeadLetterConfig": {"Arn": "arn:aws:sqs:...:dlq"},
"RetryPolicy": {"MaximumRetryAttempts": 185, "MaximumEventAgeInSeconds": 86400}
```

When Target delivery fails, EventBridge retries with exponential backoff; exceeding max retries or event age, it sends to **DLQ** (SQS) preventing permanent loss.

> ⚠️ **Pitfall**: Since it's at-least-once, **the consumer must be idempotent**. "Same payment event twice but charge only once" requires idempotency logic (event ID as key, duplicate-prevention logic like DynamoDB conditional write, Lambda Powertools Idempotency). Without it, retry or duplicate delivery causes double-processing. In exams, "events are processed twice" nearly always means "consumer idempotency missing."

## Schema Registry — Event Contracts as Code

EventBridge **Schema Registry** auto-discovers event structure flowing through the bus or you register manually, then generates type-safe code bindings (Java/Python/TypeScript) from that schema. It formalizes the **contract** between event sender and receiver.

> 💡 **Related theory**: Schema Registry is a form of **schema evolution** and **contract-first** design in distributed systems. If the sender changes event format, the receiver breaks. Schema as shared contract + enforced compatibility rules (e.g., allow only backward-compatible field additions) solve this. Confluent Schema Registry (Kafka ecosystem's Avro/Protobuf management) shares this idea; gRPC's `.proto`, GraphQL schema too. As event-based architecture scales, tracking "who emits what event in what format" becomes a governance core. Schema Registry formalizes this.

## Wrapping Up

Today we covered five things. First, **EventBridge is EAI/EIP message bus and content-based router implemented on AWS**, breaking coupling by letting senders not know receivers. Second, **Event Pattern matching compiles into a decision tree/state machine** (not sequential comparison), fast regardless of rule count; it uses partial-match semantics and arrays-mean-OR. Third, **Scheduler is CloudWatch cron's successor** (millions of schedules + Flexible Time Window/jitter to prevent thundering herd). Fourth, **Pipes is pipes-and-filters architecture** absorbing polled-source glue code as managed, with early filtering saving enrichment costs. Fifth, **Archive/Replay borrows event sourcing reprocessing**, but delivery is at-least-once so consumers must be idempotent.

The next article explores **SSM Automation Runbook** — turning operational procedures into code and weaving human approvals into the workflow.

---

## 📝 Practice Questions

**Question 1.** A single event must be routed precisely to different ones of 15 AWS services based on its content (state, pipeline name). Simple fan-out is not enough; content-based routing is required. Which service is MOST suitable?

A) Subscribe everything to a single SNS topic

B) EventBridge — content-based routing with a Rule's Event Pattern (the Content-Based Router pattern)

C) Create 15 SQS queues and distribute directly

D) Have a Lambda function handle all branching logic with if-else

**Answer: B**

Explanation: An EventBridge Rule is an implementation of the EIP Content-Based Router pattern, inspecting the contents of the event JSON (`source`, `detail-type`, `detail`) to branch precisely to different Targets. SNS (A) is coarse topic-level fan-out and is weak at content-based precise routing (filter policies only partially compensate), 15 SQS queues (C) push the distribution logic onto the sender and create coupling, and Lambda if-else (D) requires code changes every time a new branch is added, so it does not break the coupling. The core value of EventBridge is that the sender does not know the receivers, and adding a new subscriber changes zero lines of sender code.

---

**Question 2.** Every day at exactly 3 AM, 50,000 per-user backup jobs run all at once, overwhelming downstream systems with load. What is the standard solution?

A) Move the cron to 02:59

B) Spread execution across a 15-minute window (injecting jitter) with EventBridge Scheduler's Flexible Time Window

C) Increase the Lambda concurrency limit

D) Manually split the jobs into 5 groups and set a different cron for each

**Answer: B**

Explanation: A thundering herd, in which all jobs fire at the same instant, is a classic distributed-systems problem, and the solution is to inject jitter. EventBridge Scheduler's Flexible Time Window spreads execution along the time axis as "anywhere within this window" rather than "exactly at that time," distributing the load. The same principle is used in exponential backoff with jitter for retries and in spreading cache expirations. Moving the time (A) or raising concurrency (C) does not solve the root cause, the simultaneous surge, and manual splitting (D) only adds operational burden.

---

**Question 3.** You want to build, without glue code, a flow that polls messages from an SQS queue, filters them by event pattern, enriches the missing information with an external API, and stores the result in DynamoDB. Which is MOST suitable?

A) Write a Lambda function yourself that handles polling, filtering, enrichment, and storage

B) EventBridge Pipes (Source → Filter → Enrichment → Target)

C) SNS fan-out

D) Kinesis Data Analytics

**Answer: B**

Explanation: EventBridge Pipes is an implementation of the pipe-and-filter architecture: it takes a source that requires polling (SQS/Kinesis/DynamoDB Streams/MSK) and connects it in a managed way as Filter (event pattern) → Enrichment (Lambda/Step Functions/API Destination) → Target. AWS absorbs the plumbing code such as polling, batching, and error handling, so glue code disappears compared with writing a Lambda function yourself (A). In addition, the Filter stage comes before Enrichment, providing the economics of early filtering (predicate pushdown): unnecessary events are discarded before the expensive enrichment. SNS (C) has neither polling-source integration nor an enrichment stage.

---

**Question 4.** A bug in the payment-processing Lambda caused events from the early morning hours of June 1 to be processed incorrectly. After fixing the bug, you want to reprocess only the events from that time window. What should have been set up in advance, and what is the solution?

A) Parse CloudTrail logs and reconstruct the events manually

B) If an EventBridge Archive had been set up in advance, replay the events for that period with start-replay

C) Restore from a DynamoDB backup

D) Roll back using S3 versioning

**Answer: B**

Explanation: An EventBridge Archive stores events passing through the bus, and a Replay streams the events of a specific period back to the bus. This borrows the event-sourcing insight of "reprocessing by replaying the event stream," and it is the classic incident-recovery pattern for reprocessing a time window's events after a bug fix. However, the Archive must be configured in advance and the events must be within the retention period. CloudTrail (A) is for auditing API calls, not for replaying event payloads, and DynamoDB backups (C) and S3 versions (D) restore data state rather than reprocess events.

---

**Question 5.** Payment events are processed through EventBridge, but the same event is occasionally processed twice, causing double billing. What are the root cause and the solution?

A) EventBridge is broken — contact the support team

B) EventBridge delivery is at-least-once, so duplicates are normal — add idempotency logic to the consumer (duplicate blocking based on the event ID)

C) Set RetryPolicy to 0

D) Remove the DLQ

**Answer: B**

Explanation: EventBridge's delivery guarantee is at-least-once (a minimum of once), and because of the nature of distributed systems the same event can be delivered twice. Idempotency (f(f(x))=f(x)) is the consumer's responsibility to prevent duplicate processing — idempotency logic keyed on the event ID is required (a DynamoDB conditional write, Lambda Powertools Idempotency, and so on). Setting RetryPolicy to 0 (C) loses events on transient failures, and removing the DLQ (D) loses permanently failed events. Duplication is designed behavior, not a bug (A).

---

**Question 6.** You want to collect events from multiple workload accounts into a central bus in the security account to detect and respond across the whole organization from one place. What is the correct configuration?

A) Each account directly calls the security account's API from Lambda

B) On the receiving central bus, allow the sending accounts' PutEvents with put-permission, and set the sending side's Rule Target to the central bus (a hub-and-spoke event mesh)

C) Deliver events over VPC Peering

D) S3 cross-account replication

**Answer: B**

Explanation: Cross-account event routing has two steps — on the receiving bus, allow the sending account's events:PutEvents through a resource policy (put-permission), and on the sending side, set the Rule's Target to the other account's bus ARN. When workload accounts (spokes) send events to the central security account's bus (the hub) this way, it forms a hub-and-spoke event mesh. This is a governance philosophy, like AWS Organizations' delegated administrator, that centralizes observation and authority while keeping workloads isolated. VPC Peering (C) is a network layer, not event routing, and S3 replication (D) replicates objects.

---

**Question 7.** Which statement about the Event Pattern `{"detail": {"state": ["FAILED"]}}` is correct?

A) The event JSON must be exactly identical to this pattern (exact match) to match

B) It is a subset match: it catches all events whose detail.state is FAILED and ignores the other fields

C) Writing the state value as the string `"FAILED"` instead of an array works the same

D) Multiple keys are combined with OR, and an array within a key is combined with AND

**Answer: B**

Explanation: An Event Pattern is a subset match — it checks only the fields specified in the pattern and ignores the rest of the event's fields, so as long as state is FAILED, it matches regardless of the other fields. Values must always be arrays, so the string `"FAILED"` (C) is wrong and the array `["FAILED"]` is correct. In the semantics, different keys are ANDed (all must be satisfied) and an array within one key is ORed (only one must be satisfied), so D's description is the exact opposite. That it is a subset match rather than an exact match (A) is the core of EventBridge patterns.

---

## 📌 Today's Summary

There are five key takeaways today. First, EventBridge is an AWS implementation of the EIP message bus and content-based router patterns, severing coupling by keeping the sender unaware of the receivers. Second, Event Pattern matching is compiled into a decision tree/state machine rather than compared sequentially, so it is fast regardless of the number of rules, and it has subset-match semantics and the array = OR rule. Third, Scheduler is the successor to CloudWatch cron, preventing a thundering herd with millions of schedules and the Flexible Time Window (jitter). Fourth, Pipes absorb the glue code of polling sources in a managed way through the pipe-and-filter architecture and save cost with early filtering. Fifth, Archive/Replay borrows the reprocessing insight of event sourcing, and since delivery is at-least-once, consumers must be idempotent.
