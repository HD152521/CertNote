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

## 📝 연습 문제

**문제 1.** 한 SaaS가 SQS 큐에 들어오는 메시지를 필터링해 특정 패턴만 Step Functions로 보내고, 나머지는 무시한다. Lambda 코드 작성 없이 가장 간단한 구성은?

A) Lambda(필터) → Step Functions
B) EventBridge Pipes (Source=SQS, Filter, Target=Step Functions)
C) SQS Redrive Policy
D) EventBridge Rule (Source=SQS)

**정답: B**
해설: Pipes는 정확히 이 패턴(SQS/Kinesis/DDB Stream → 필터 → target)을 코드 없이 구성하기 위한 도구. A는 Lambda 운영 부담 추가. C(Redrive)는 실패 메시지 격리 용도이지 필터링이 아님. D(EventBridge Rule)는 EventBridge Bus에 들어온 이벤트를 매칭하지 SQS를 직접 source로 못 받음. 함정: "코드 없이"가 키워드면 Pipes. 추가: Pipes의 enrichment 단계로 Lambda나 Step Functions를 끼워 가벼운 변환 가능. 입출력 모두 EventBridge 패턴 매칭 가능.

---

**문제 2.** 한 글로벌 SaaS가 100만 사용자에게 각자 선호 시간(타임존 + 시각)에 일일 요약 이메일을 발송한다. 각 사용자의 스케줄을 개별 관리해야 한다. 가장 적합한 구성은?

A) EventBridge Rule 100만 개
B) EventBridge Scheduler 100만 스케줄
C) Lambda + cron Worker
D) Step Functions Wait State

**정답: B**
해설: Scheduler는 계정당 100만+ 스케줄을 지원하고 타임존, cron, flexible time window를 제공. EventBridge Rule(A)은 계정당 한도(수천)에 막힌다. C(Lambda cron)는 자체 스케줄 저장·관리 인프라가 필요. D(Step Functions Wait)는 한 워크플로우 안 대기이지 100만 사용자 스케줄 관리가 아님. 함정: "사용자별 다른 시간"이면 Scheduler가 정답. 추가: Flexible time window(±15분)로 동시 부하 분산. Target은 200+ AWS API 직접 호출(Lambda 거치지 않고 SNS Publish 등).

---

**문제 3.** Shopify에서 발생하는 주문 이벤트를 AWS 워크플로우에 통합한다. Webhook 인프라 운영 없이 직접 받으려면?

A) API Gateway + Lambda webhook receiver
B) EventBridge Default Bus
C) EventBridge Partner Event Bus
D) SNS HTTPS subscription

**정답: C**
해설: Partner Bus는 AWS가 SaaS 파트너(Shopify, Stripe, Datadog, Auth0, MongoDB 등)와 직접 통합해 이벤트를 받는 매니지드 채널. 사용자는 partner 이벤트 source를 활성화하고 룰을 만들면 끝. A는 webhook receiver를 직접 운영해야 함(보안, 인증, 재시도, 스케일링). B(Default Bus)는 AWS 서비스용. D(SNS HTTPS)는 outbound 알림 용도. 함정: "SaaS partner 이벤트"는 거의 Partner Bus가 답. 추가: Stripe, Shopify, Datadog 등 메이저 SaaS가 모두 등록되어 있고 콘솔에서 한 번에 활성화.

---

**문제 4.** EventBridge Bus의 1년치 이벤트를 보존하다가 특정 시간 범위(예: 2024-03-01~03)의 이벤트만 다시 흘려보내 새 다운스트림을 초기화한다. 가장 적합한 기능은?

A) S3 + Athena 쿼리
B) EventBridge Archive + Replay
C) CloudTrail Lake
D) Kinesis Firehose 백업

**정답: B**
해설: EventBridge Archive는 Bus 이벤트를 보존(최대 무기한), Replay는 시간 범위 + 필터로 다시 흘려보냄. A는 분석은 가능하지만 다운스트림에 재투입하려면 별도 로직 필요. C(CloudTrail Lake)는 API 활동 감사용이지 application 이벤트가 아님. D는 데이터 저장이지 재생 메커니즘이 아님. 함정: "이벤트 재처리·재생"이면 거의 Archive + Replay. 추가: Event Sourcing 패턴의 새 구독자 도입, bug fix 후 누락 이벤트 복구에 표준 패턴.

---

**문제 5.** 한 e-commerce가 OrderPlaced 이벤트를 분석·배송·CRM·알림·audit 5개 다운스트림에 동일 메시지로 fan-out한다. 처리량은 초당 5,000건. 가장 적합한 구성은?

A) EventBridge + 5개 Rule
B) SNS Topic + 5개 SQS 구독
C) Kinesis Data Streams + 5개 Consumer
D) Step Functions Parallel state

**정답: B**
해설: 단순 fan-out + 매우 높은 처리량은 SNS의 정확한 sweet spot. Topic당 100,000 TPS+를 지원하고 SQS subscription으로 다운스트림이 자체 폴 속도로 처리. A(EventBridge)도 가능하지만 5개 룰이 같은 패턴을 매칭해야 하고, EventBridge 단가가 더 비싸며 throughput 한도가 더 낮음. C(Kinesis)는 순서·재처리가 필요한 스트리밍 분석용이지 fan-out 최적이 아님. D는 한 워크플로우 안 병렬이지 다운스트림 fan-out이 아님. 함정: "단순 fan-out + 높은 처리량"이면 SNS, "풍부한 필터·다양한 target"이면 EventBridge.

---

**문제 6.** 이벤트 발행 팀이 자주 새 필드를 추가한다. 구독 팀이 strongly-typed 코드(Java/Python)로 안전하게 이벤트를 처리하면서 스키마 진화를 추적하려면?

A) Glue Schema Registry
B) EventBridge Schema Registry + Code Binding
C) OpenAPI Swagger
D) Avro 직접 관리

**정답: B**
해설: EventBridge Schema Registry는 Bus 이벤트 스키마를 auto-discovery로 추출·버전 관리하고, Java/Python/TypeScript code binding을 자동 생성. 구독 팀은 generated SDK로 strongly-typed로 처리. A(Glue Schema Registry)는 Kinesis·Kafka용으로 별도 서비스. C(OpenAPI)는 REST API용이지 이벤트 스키마 표준이 아님(다만 EventBridge가 OpenAPI 3로 export 가능). D는 자체 운영 부담이 큼. 함정: EventBridge 이벤트의 스키마는 EventBridge Schema Registry, Kafka/Kinesis는 Glue Schema Registry. 두 가지를 혼동 주의.

---

**문제 7.** Lambda가 EventBridge Rule의 target이고 Lambda 함수 실행 중 비즈니스 로직 오류로 예외가 발생한다. 실패한 이벤트를 격리해 분석하려면?

A) EventBridge Rule의 DLQ
B) Lambda 함수의 비동기 Destinations (OnFailure)
C) CloudTrail
D) EventBridge Archive

**정답: B**
해설: EventBridge → Lambda 호출은 비동기 invoke이고, Lambda 함수 안의 실행 실패는 **Lambda 자체의 비동기 재시도 모델 + Destinations**가 처리. EventBridge Rule의 DLQ(A)는 **EventBridge가 Lambda Invoke 자체에 실패**(throttle, IAM 거부 등)할 때만 트리거되고, 함수 안의 비즈니스 오류는 잡지 못함. C는 API 활동 감사. D(Archive)는 이벤트 보존이지 실패 격리가 아님. 함정: 두 레이어(EventBridge의 target dispatch vs Lambda 함수 실행)를 혼동하면 시나리오를 잘못 푼다.

---

## 📌 오늘의 요약

1. **EDA 3대 디커플링**(시간/공간/동기화), Conway 법칙으로 조직 결합 영향
2. **Bus 3종**: Default(AWS) / Custom(도메인) / Partner(SaaS) + Cross-account 정책
3. **Rule = Pattern + 최대 5 Targets**, JSON 깊은 필드 매칭 + API Destination
4. **Pipes**: SQS/Kinesis/DDB Stream/MQ/MSK → Filter → Enrich → Target, 코드 없이
5. **Scheduler**: 100만+ 스케줄, time zone, flexible window, 200+ API 직접 호출
6. **Schema Registry** + **Archive/Replay** — 진화 관리 + 시간 여행
7. **SNS vs EventBridge**: 단순 fan-out·고처리량 vs 풍부 필터·다양 target
8. **Pipes vs Step Functions**: 1:1 라우팅 vs 복잡 워크플로우 (자주 Pipes→SF 조합)
