# Day 3 - EventBridge: How an Event Routing Hub Gathers SaaS, AWS, and Internal Apps in One Place

The SQS and SNS we saw on Day 1 and Day 2 both deal with "messages I explicitly send." The producer calls the SendMessage/Publish API and decides in code where it goes. But most events that occur in a modern cloud system aren't like that. The moment a file lands in S3, the moment an EC2 instance changes state, the moment a CloudFormation stack fails to deploy, the moment AWS Health signals a region outage — these aren't "things I explicitly send" but **events the AWS infrastructure generates**. Add SaaS events like a Datadog alarm, a Zendesk ticket creation, an Auth0 login failure, or a GitHub PR merge, and a single company has dozens to hundreds of event sources to handle.

Solving all of this with hundreds of SNS topics makes operations explode. **EventBridge** (launched July 2019, a rebranding and expansion of the original 2016 CloudWatch Events) answers this problem. It gathers AWS/SaaS/custom events onto **a single bus**, routes them with **rules + patterns**, and sends them to **targets**. If SNS is "fan out the message I published to N people," EventBridge is a one-dimension-higher abstraction: "receive events occurring all over the place and send them anywhere according to conditions." This article looks at why EventBridge was designed this way, how it divides labor with SNS/SQS/Step Functions, and what new features like Pipes, Scheduler, and Schema Registry solve.

## Three Kinds of Bus and the Basic Model of Event Routing

Every event in EventBridge flows through a logical channel called a **Bus**. Three kinds of bus exist per account and region.

| Bus Type | Source | Use Case |
|----------|--------|----------|
| **Default Bus** | All AWS service events flow automatically (S3, EC2, CodePipeline, Health, GuardDuty, etc.) | AWS service automation |
| **Partner Bus** | SaaS integrations (Auth0, Datadog, MongoDB, PagerDuty, Salesforce, Stripe, Zendesk, etc., ~40) | SaaS → AWS automation |
| **Custom Bus** | Application events I send via the PutEvents API | Microservice-to-microservice communication |

Events are all standardized into a **CloudEvents-style JSON envelope**.

```json
{
  "version": "0",
  "id": "9d7b7b1e-...",
  "detail-type": "Object Created",
  "source": "aws.s3",
  "account": "123456789012",
  "time": "2026-05-27T12:34:56Z",
  "region": "ap-northeast-2",
  "resources": ["arn:aws:s3:::my-bucket/photo.jpg"],
  "detail": {
    "bucket": {"name": "my-bucket"},
    "object": {"key": "photo.jpg", "size": 1024}
  }
}
```

This standard envelope is EventBridge's real value. Because every event has the same shape, you can use rule patterns consistently, and the routing logic stays the same even when new sources are added. That this is nearly the same design as the **CNCF CloudEvents** standard launched in 2018 is no coincidence — EventBridge added explicit CloudEvents support too.

> 💡 **Related theory**: Event envelope standardization is a very important pattern in distributed systems. The **Canonical Data Model** from *Enterprise Integration Patterns* (1996) and 1990s EAI (Enterprise Application Integration) middleware like TIBCO and webMethods started from the same idea. The core is the cost structure: "for N systems to integrate with M systems you'd need N×M adapters, but put a standard envelope in the middle and it drops to N+M." EventBridge implements this 30-year-old idea as a managed cloud service.

> 🔍 **Going deeper**: The reason EventBridge was split off and rebranded from CloudWatch Events is a signal that "event routing" became a first-class service separate from monitoring. In 2016 CloudWatch Events was AWS-service-event-centric, but in 2019 EventBridge expanded to SaaS/custom, and in 2022 Pipes/Scheduler were added, cementing it as an integration hub. The CloudWatch Events-era API and rules still work (`events.amazonaws.com` unchanged), but new features are only added to the EventBridge side.

## Rules and Event Patterns: Declaratively Writing Which Part of an Event to React To

All routing in EventBridge is defined by **Rules**. There are two kinds of rule — Event Pattern (match-based) and Schedule (time-based) — and on a match, it sends the event to a **Target** (up to 5 per rule).

An Event Pattern is a declarative matcher written in JSON. It supports rich operators: exact match, prefix, anything-but, numeric comparison, exists, and more.

```json
// Match only when a PDF file is uploaded to S3
{
  "source": ["aws.s3"],
  "detail-type": ["Object Created"],
  "detail": {
    "bucket": {"name": ["my-uploads"]},
    "object": {"key": [{"suffix": ".pdf"}]}
  }
}

// EC2 instance changes to stopped/terminated
{
  "source": ["aws.ec2"],
  "detail-type": ["EC2 Instance State-change Notification"],
  "detail": {
    "state": ["stopped", "terminated"]
  }
}

// CodePipeline failure + only a specific pipeline
{
  "source": ["aws.codepipeline"],
  "detail-type": ["CodePipeline Pipeline Execution State Change"],
  "detail": {
    "state": ["FAILED"],
    "pipeline": [{"prefix": "prod-"}]
  }
}

// Payment amount exceeds 1,000,000 KRW
{
  "source": ["app.payment"],
  "detail-type": ["PaymentCompleted"],
  "detail": {
    "amount": [{"numeric": [">", 1000000]}]
  }
}
```

Targets directly support over 30 AWS services. Lambda, SQS, SNS, Step Functions, Kinesis Data Streams, Kinesis Data Firehose, ECS Task, CodeBuild, CodePipeline, SSM Run Command, EC2 RebootInstances, SageMaker Pipeline, Redshift Query, EventBridge Bus (forwarding to another bus), API Destinations (external HTTPS), and more. This is EventBridge's real strength — **you can directly execute most AWS actions without going through Lambda**. For example, "every day at 3 AM, RDS snapshot → export to S3 → SNS notification" can be built as an EventBridge Rule + Target chain without a single line of Lambda code.

> ⚠️ **Pitfall**: A Rule pattern is a JSON-shape match, so you must specify source/detail-type exactly. Writing a single value instead of an array like `"source": "aws.s3"` is a match failure. Also, fields inside `detail` need the exact key path, and since the detail structure differs per AWS service, you have to write it by referring to the [Events Sample](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-service-event.html) docs. The most common bug in production is "the rule isn't catching," and 99% of the time it's a pattern typo, a misunderstanding of the structure, or a misspelled source name.

> 🔍 **Going deeper**: EventBridge's pattern matching engine operates internally on an NFA (non-deterministic finite automaton) basis, as revealed in AWS re:Invent 2022 session SVS323. That is, when an event comes in it can match all registered rule patterns in near-O(1) time, which is why routing latency barely grows even with thousands of rules on a single bus. This is far faster than a typical if-else chain or SQL WHERE clause, and it's why EventBridge is "safe even with tons of rules on one bus."

## Input Transformation: Delivering an Event in a Different Shape per Target

Even for the same event, each target wants a different shape. A Slack webhook wants `{"text": "..."}`, Lambda wants the raw detail, and Step Functions may want to extract only specific fields. **Input Transformer** solves this.

An Input Transformer consists of two parts.
- **Input Path**: extracts some fields of the event via JSONPath (`{"orderId": "$.detail.orderId", "amount": "$.detail.amount"}`)
- **Input Template**: a new payload using the extracted variables as placeholders

```json
// Transformation for a Slack webhook
"InputPathsMap": {
  "instance": "$.detail.instance-id",
  "state": "$.detail.state"
},
"InputTemplate": "{\"text\": \"EC2 <instance> changed to <state>\"}"
```

Thanks to this feature, most message transformations are possible without using Lambda. An entire notification system gets built with no code as "EventBridge Rule + Input Transformer + Slack API Destination."

## Archive and Replay: Events Can Time-Travel Too

One of the biggest weaknesses of events in distributed systems is "you can't see a past event again." SNS has no retention and SQS has up to 14 days, but once consumed it's gone. Yet in operations, situations frequently arise like "a new consumer needs to reprocess events that occurred yesterday" or "events that couldn't be processed due to a bug need to be reprocessed days later."

**EventBridge Archive** (launched 2020) retains a bus's events for up to unlimited duration, and later lets you flow events from a desired time range back through a desired rule via **Replay**. An Archive can have an optional filter pattern to keep only events of interest rather than all events.

```bash
# Retain only payment events for 90 days
aws events create-archive --archive-name payment-archive \
  --event-source-arn arn:aws:events:ap-northeast-2:123:event-bus/saa-bus \
  --event-pattern '{"source":["app.payment"]}' \
  --retention-days 90

# Replay yesterday's 2-3 PM events
aws events start-replay --replay-name payment-replay-2026-05-26 \
  --event-source-arn arn:aws:events:ap-northeast-2:123:archive/payment-archive \
  --event-start-time 2026-05-26T14:00:00Z \
  --event-end-time 2026-05-26T15:00:00Z \
  --destination 'Arn=arn:...:event-bus/saa-bus,FilterArns=[arn:...:rule/...]'
```

This is a basic building block of event sourcing. It's not as powerful as full-blown event sourcing (EventStoreDB, Kafka), but it amply covers scenarios like "audit trail + debugging + partial reprocessing."

> 📚 **Case study**: During the Log4Shell (CVE-2021-44228) vulnerability incident in December 2021, many companies wanted to know "which systems were affected over the past N days." CloudWatch Logs was slow to search, and SNS/SQS events were already consumed and untraceable. Companies that had set up EventBridge Archive replayed all events in the archive to an analysis Lambda and quickly grasped the blast radius. After this incident, "turn on EventBridge Archive by default for security-related events" became many companies' standard.

## API Destinations and Connections: Calling External SaaS Directly

The most flexible of EventBridge targets is **API Destinations** (launched 2021). You register any external HTTPS endpoint as a target, and EventBridge sends an HTTP POST directly. Slack webhook, PagerDuty, Datadog, GitHub API, internal webhooks — anywhere is possible.

```bash
# Register Slack credentials as a Connection (stored in Secrets Manager)
aws events create-connection --name slack-conn \
  --authorization-type API_KEY \
  --auth-parameters 'ApiKeyAuthParameters={ApiKeyName=Authorization,ApiKeyValue=Bearer xoxb-...}'

# Register the Slack webhook as an API Destination
aws events create-api-destination --name slack-alerts \
  --connection-arn arn:...:connection/slack-conn \
  --invocation-endpoint https://hooks.slack.com/services/XXX/YYY/ZZZ \
  --http-method POST \
  --invocation-rate-limit-per-second 10
```

**Connections** securely store credentials (API Key, Basic Auth, OAuth Client Credentials). Internally they use Secrets Manager with IAM access control. They even support automatic token refresh for the OAuth Client Credentials flow — that is, even a SaaS like Salesforce that needs a token refresh every hour integrates with no code.

`invocation-rate-limit-per-second` protects the external API's rate limit. EventBridge self-throttles so that a sudden burst of events doesn't kill the external API. Excess events automatically go into a retry queue, and on final failure are isolated to a DLQ.

> 💡 **Related theory**: API Destinations can be viewed as "the outbound version of API Gateway, which is inbound." Both handle authentication, rate limiting, and retry in a managed way. In the old days you had to write external SaaS calls directly in Lambda, managing retry, authentication, token refresh, and error handling inside that Lambda. API Destinations move all of this into the infrastructure layer, making it "zero code."

## EventBridge Pipes: Direct Source → Filter → Enrich → Target Integration

**EventBridge Pipes**, launched in November 2022, is EventBridge's biggest paradigm shift. Where the existing EventBridge was "throw an event at a bus and it routes," Pipes builds **point-to-point integration between AWS messaging services** with no code.

```
Source (Pull-based)            Filter      Enrich            Target
─────────────────              ──────      ──────            ──────
SQS / Kinesis Stream    →    JSON  →    Lambda     →     SQS / SNS
DynamoDB Streams              pattern    Step Functions      Step Functions
MSK / Self-managed Kafka                 API Destination     Lambda
Amazon MQ                                EventBridge Bus     ECS / Batch
                                                             Kinesis / Firehose
                                                             SageMaker Pipeline
                                                             Many more
```

Why this matters: in the old days, "DynamoDB Streams → transform → Step Functions" had to be written directly as Lambda code. Create a Lambda, connect the DynamoDB Stream as an event source, filter inside the code, transform, call Step Functions StartExecution, handle errors, write retry logic... Pipes replaces all of this with a one-line configuration.

The **Enrichment stage** is especially powerful. If the event received from the source is insufficient, it calls a Lambda or API Destination to fetch additional data, merges it, and sends it to the target. For example, "when a user ID comes into a DynamoDB Stream → look up the user profile via API Destination and merge → welcome message via SNS." This is built with Pipes without a single line of Lambda.

> 🔍 **Going deeper**: Pipes effectively provides an AWS version of some features of **Apache Kafka Connect** or **Confluent ksqlDB** in managed form. The pattern of source connector + transform + sink connector is a long-standing standard in the data integration industry, and AWS bundled it with its own managed services (Lambda/SFN/API Destination) to make the operational burden 0. That said, the transform library isn't as rich as Kafka Connect's, so complex transformations still need Lambda enrichment.

> 📚 **Case study**: In 2023, a fintech company published a case where it ran a pipeline of "Kinesis Stream → Lambda (parse+filter+enrich) → Step Functions" with 500 lines of Lambda code, and after moving to Pipes the code became 0 lines and operational incidents dropped by 70%. Problems like Lambda cold starts, concurrency management, and error handling were all absorbed into the Pipes managed layer. That said, since Pipes is 1:1 source-target and can't fan out, if you need fanout you still have to go through SNS or a bus.

## EventBridge Scheduler: 1-Second Precision, 100-Million-Schedule Scale

**EventBridge Scheduler**, launched in November 2022, is a separate service that splits off and expands the schedule feature of the existing EventBridge Rule. The feature differences are quite large, and the exam asks about the distinction.

| Aspect | EventBridge Rule Schedule | EventBridge Scheduler |
|--------|---------------------------|----------------------|
| Precision | Minute-level (cron/rate) | Second-level (cron/rate/one-time) |
| Max schedules | ~300 per account | 100 million |
| Time zones | UTC fixed | 270+ time zones supported |
| Flexible time window | None | ±15 min etc., distributed execution possible |
| One-time schedule | None | `at(2026-12-31T23:59:00)` supported |
| Target | EventBridge targets | 270+ AWS APIs called directly |
| Price | Free (the rule part) | Per-invocation billing ($1 / 1M invocations) |

Scheduler's real value is **scaling to 100 million schedules** and **direct calls to 270+ AWS APIs**. For example, the scenario "send a notification to each customer exactly on their subscription expiry date" — if you have 1 million customers, you need 1 million schedules, which is impossible with EventBridge Rules but possible with Scheduler. Thanks to Universal Target, you can call an API like SES SendEmail directly without going through Lambda.

> ⚠️ **Pitfall**: Scheduler being new doesn't mean you shouldn't use EventBridge Rule schedules. For dozens of simple cron jobs (a cleanup Lambda every day at 3 AM), Rules are free so cost is 0, whereas Scheduler bills per invocation. In scenarios where tens of thousands of invocations fire at once, the cost difference can be meaningful. "Large scale + precision + time zones needed" = Scheduler, "simple cron + a few" = Rule.

## Schema Registry and Event Schema Evolution

One of the hardest operational problems in event-driven systems is **schema evolution**. The shape of events a microservice publishes changes over time (`v1`: `{orderId, amount}` → `v2`: `{orderId, amount, currency}`), and if subscribers can't keep up with the change, a silent break occurs. This is a long-handled problem in the Avro/Protobuf world under the name forward/backward compatibility.

EventBridge **Schema Registry** solves two things.
1. **Schema Discovery**: automatically analyzes events flowing on the bus to infer schemas and version them.
2. **Code Bindings**: auto-generates the discovered schemas as Java/TypeScript/Python/Go classes for type-safe use in the IDE.

```bash
# Enable Discovery (subsequently flowing events are auto-analyzed)
aws schemas create-discoverer --source-arn arn:...:event-bus/saa-bus

# List discovered schemas
aws schemas list-schemas --registry-name discovered-schemas

# Generate TypeScript code
aws schemas get-code-binding-source \
  --registry-name discovered-schemas \
  --schema-name aws.s3@ObjectCreated \
  --schema-version 1 --language TypeScript3
```

Schema Registry stores schemas in OpenAPI 3.0 or JSONSchema Draft 4 format. Register your own schema and subscribers can import the same schema for type safety, a new version is created automatically on change, and compatibility checks can be run.

> 💡 **Related theory**: For schema evolution compatibility modes, the four patterns established in Apache Avro are standard — **Backward** (a new reader can read old data), **Forward** (an old reader can read new data), **Full** (both directions), **None**. The safest mode in microservices is Full but it's the most constraining. Usually you default to Backward (a new subscriber must be able to read old producer data), with the rules that new fields are optional + have default values, and removing existing fields or changing types is forbidden. EventBridge Schema Registry automates this check.

## Comparison with Other Event Routing Systems

| System | Strengths | Weaknesses | Suitable Scenario |
|--------|-----------|------------|-------------------|
| **EventBridge** | AWS/SaaS/Custom integration, rich rules, archive, scheduler | Throughput limit (10K TPS PutEvents per account by default), 0.5-1s latency | Event routing hub, automation |
| **SNS** | Very high TPS, push-only, very low cost | Simple rule patterns, archive is FIFO-only, single-direction fanout | Simple fanout, notifications |
| **Kinesis Data Streams** | Very high throughput, replay, ordering guarantee | Complex ops, consumer self-implemented | Stream processing, analytics |
| **Apache Kafka (MSK)** | Unlimited retention, complex stream processing | Very large operational burden | Event sourcing, log aggregation |
| **Google Eventarc** | Similar to EventBridge | GCP-only | GCP environments |
| **Azure Event Grid** | Similar to EventBridge | Azure-only | Azure environments |
| **Apache Camel / Spring Integration** | Very rich integration patterns | Self-operated | On-prem integration |

EventBridge's biggest weakness is **throughput**. The default PutEvents quota per account is 10K TPS (varies by region), and there's a 5-target limit per rule. If you need large-scale traffic, you have to go to SNS or Kinesis. Also, **latency** is slightly higher than SNS (usually 500ms~1s) — when real-time responsiveness matters, SNS is better.

Conversely, EventBridge's strongest area is **SaaS integration + diverse AWS targets + Scheduler**. The "integration automation" scenario of receiving a Zendesk or Auth0 event and triggering Lambda/Step Functions/Slack isn't this easy with any other service.

> 📚 **Case study**: In 2022, an e-commerce company that had run "100 SaaS integrations" on its own Lambda codebase moved to EventBridge Partner Source + Pipes and cut its integration code by 80%. The biggest benefit was "time to add a new SaaS integration dropped from 1 week to 1 hour." That said, high-throughput workloads (search indexing) had to be split off to Kinesis instead of EventBridge — EventBridge is not a silver bullet.

## Cross-Account, Cross-Region Bus Forwarding

In large organizations, accounts and regions are separated and events have to flow across them. EventBridge can have a bus target another bus, enabling cross-account/cross-region forwarding.

```
[ Hub-and-Spoke architecture ]

Each workload account (us-east-1, eu-west-1)
  └─ Own EventBridge Bus
       └─ Rule: forward all events to the central security account bus
            └─ Target: arn:aws:events:us-east-1:central-account:event-bus/security-hub

Central security account
  └─ Hub Bus
       └─ Rule: GuardDuty Finding → SecurityHub
       └─ Rule: Config Compliance → ServiceNow
       └─ Rule: CloudTrail anomaly → Slack
```

This pattern is the foundation of multi-account automation like SecurityHub and Control Tower. That said, cross-region forwarding incurs separate PutEvents cost per region and adds network latency, so it's unsuitable for workflows that need a synchronous response.

```bash
# Use another account's bus as a target (cross-account)
aws events put-targets --rule audit-all --event-bus-name local-bus \
  --targets 'Id=1,Arn=arn:aws:events:us-east-1:111122223333:event-bus/central-audit,RoleArn=arn:...'

# Allow the sending account to PutEvents on the destination account
aws events put-permission --event-bus-name central-audit \
  --action events:PutEvents --principal 444455556666 --statement-id allow-acc-444
```

## Wrapping Up

EventBridge is a messaging layer like SNS/SQS but a dimension-different abstraction. SNS is "publish-subscribe," SQS is "queue," and EventBridge is an "**event routing hub**." It absorbs AWS/SaaS/Custom events into a single model, routes them with JSON patterns, sends them directly to 30+ targets, allows time travel with archive, and builds point-to-point integration with no code via Pipes. Scheduler is the next generation of cron, and Schema Registry answers the event-evolution problem.

From the exam's perspective, the key branch points are — **simple fanout = SNS**, **work queue = SQS**, **event routing + SaaS integration + scheduling + archive = EventBridge**, **point-to-point integration = Pipes**. From the operational perspective, the biggest change is "moving integrations you used to define with Lambda code into EventBridge infrastructure configuration," and using this well makes your codebase dramatically smaller.

In the next article we'll look at the **Kinesis** family (Data Streams, Firehose, Data Analytics), which answers the areas EventBridge can't handle — real-time stream data of hundreds of thousands of records per second, time series where order matters, and event sourcing that needs replay.

---

## 📝 연습 문제

**문제 1.** When a Datadog alarm fires, you need to trigger AWS Lambda and also send a notification to Slack. What is the most appropriate configuration?

A) Datadog → SNS → Lambda, SNS → Slack HTTPS subscription
B) Datadog → API Gateway → Lambda + Slack
C) EventBridge Partner Source (Datadog) → Rule → Lambda target + API Destination (Slack) target
D) Datadog → Kinesis → Lambda

**정답: C**

해설: EventBridge provides about 40 SaaS Partner Sources including Datadog, and events flow automatically into the Partner Bus. Register two targets on a Rule (Lambda + Slack API Destination) and one event triggers both. A is wrong because there's no direct Datadog → SNS integration and it would need intermediate webhook conversion. B requires writing code for both API Gateway and Lambda and handling SaaS authentication yourself. D is wrong because Kinesis is for stream processing — excessive infrastructure for a one-off event.

---

**문제 2.** You want to automate, with no code, a job that every day at 3 AM KST creates an RDS snapshot and exports it to S3. What is the most appropriate setup?

A) Lambda + a cron library for self-scheduling
B) EventBridge Scheduler + Universal Target (RDS API called directly) + time zone Asia/Seoul
C) A crontab on an EC2 instance
D) AWS Batch + Job Queue

**정답: B**

해설: EventBridge Scheduler supports 270+ time zones and 270+ AWS API Universal Targets, so it can call RDS CreateDBSnapshot directly without Lambda. The existing EventBridge Rule schedule is UTC-fixed so you'd have to convert KST yourself, but Scheduler lets you specify the time zone. A requires writing code + a Lambda self-cron is an anti-pattern. C is an EC2 operational burden. D is wrong because Batch is a compute queue model, not a simple time-trigger tool.

---

**문제 3.** There's a pipeline that receives messages from an SQS queue, filters some, enriches with Lambda, and sends to Step Functions. Currently about 300 lines of Lambda code do this. What is the most simplifying approach?

A) Optimize the Lambda better
B) Configure EventBridge Pipes with Source=SQS, Filter, Enrich=Lambda, Target=Step Functions
C) Change SQS to SNS
D) Poll SQS directly from Step Functions

**정답: B**

해설: This is exactly the use case for EventBridge Pipes. Build Source (SQS) → Filter (JSON pattern) → Enrich (Lambda) → Target (Step Functions) with configuration and no code. Lambda is left with only the enrich logic, while batch poll, error handling, and target invocation are handled by Pipes in a managed way. A isn't a fundamental simplification. C loses SQS's buffer characteristic. D is wrong because SFN isn't an SQS poller.

---

**문제 4.** You want to deliver events to an external SaaS (e.g., Salesforce) via webhook. It requires OAuth authentication with automatic token refresh, and you must protect the SaaS's rate limit (10 calls per second). What is the most appropriate configuration?

A) Handle OAuth directly in Lambda + self-throttle
B) EventBridge API Destination + Connection (OAuth Client Credentials) + invocation-rate-limit-per-second=10
C) API Gateway → SaaS
D) Use HTTP Invoke from Step Functions

**정답: B**

해설: API Destinations + Connections support automatic token refresh for the OAuth Client Credentials flow and self-throttle via invocation-rate-limit-per-second. Excess events go into a retry queue, and on final failure to a DLQ. A requires implementing OAuth refresh, throttle, and retry all yourself. C is for inbound APIs, not outbound. D is possible with an SFN HTTP Task but requires configuring auth/throttle yourself, and EventBridge API Destination is more suitable.

---

**문제 5.** Some payment events that occurred yesterday couldn't be processed due to a bug. You need to flow those same events back through the processing pipeline. For a system built with EventBridge?

A) Manually copy the messages from the DLQ
B) Use EventBridge Archive + Replay to flow yesterday's specific time-range events again
C) Restore from an S3 backup and re-publish via PutEvents
D) Impossible. Events are one-time

**정답: B**

해설: If you set up EventBridge Archive in advance, the bus's events are automatically retained in the archive, and you can flow events back through a desired time range and filter via the Replay API. For example, sending only yesterday's 14:00-15:00 payment events back through the payment-processing rule. A is wrong because the DLQ is a different system's (SQS) mechanism and EventBridge has a different flow. C is possible but very inefficient, and without an archive you'd need a backup in S3. D reflects not knowing the archive feature.

---

**문제 6.** In a company organization, you need to send GuardDuty Findings from 200 workload accounts to a central security account's SecurityHub. What is the simplest architecture?

A) Each account's Lambda → central account SQS → SecurityHub
B) A rule on each account's EventBridge Default Bus → cross-account forwarding targeting the central account's EventBridge Bus → the central rule sends to SecurityHub
C) Each account's SNS → central account SQS → Lambda
D) Handle it with AWS Config only

**정답: B**

해설: GuardDuty Findings are automatically published to each account's Default Bus. A rule on each account forwards the event to the central security account bus, and a rule on the central bus sends it to the SecurityHub Import target. All EventBridge configuration, zero code. A requires operating 200 Lambdas. C requires 200 SNS + central processing code. D is wrong because Config is for tracking resource configuration changes, not Finding routing.

---

**문제 7.** The event schemas flowing on an EventBridge bus differ per microservice and evolve over time. You want subscribing Lambda teams to write code safely. What is the most appropriate tool?

A) Store schemas in DynamoDB
B) EventBridge Schema Registry + Schema Discovery + Code Bindings
C) Handle all cases with try-except inside Lambda
D) Step Functions input validation

**정답: B**

해설: Schema Registry auto-analyzes the bus's events via Discovery to infer schemas and version them. With Code Bindings it auto-generates Java/TypeScript/Python/Go classes for type-safe use in the IDE. Compatibility checks on schema change are automatic too. A requires self-operation. C is only defensive code, not a real solution. D is SFN-only and has no schema management capability.

---

Additional explanation: EventBridge isn't a simple "advanced SNS" but a categorically different abstraction. If SNS/SQS/Kinesis are message channels, EventBridge is an **event integration hub**. On the exam you can solve 90% with keyword mapping: ① SaaS integration keywords → EventBridge, ② cron + time zone + large scale → Scheduler, ③ point-to-point integration between AWS services → Pipes, ④ archive/replay → EventBridge, ⑤ simple fanout → SNS, ⑥ work queue → SQS. In practice, the principle "moving Lambda code into EventBridge infrastructure is almost always a simplification" applies.
