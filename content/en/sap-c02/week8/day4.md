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

## 📝 연습 문제

**문제 1.** 모바일 앱이 "사용자 + 주문 + 배송지 + 결제" 4개 리소스를 한 화면에 보여준다. 클라이언트가 필요한 필드만 받고, 실시간 주문 상태 push도 받아야 한다. Cognito 인증 필수. 가장 적합한 백엔드는?

A) REST API Gateway + Lambda + WebSocket API
B) AppSync GraphQL + Subscription + Cognito User Pool
C) ALB + ECS Service
D) GraphQL on Lambda + DynamoDB

**정답: B**
해설: GraphQL은 클라이언트가 필요 필드만 선언적으로 요청 → overfetch/underfetch 해소. AppSync는 매니지드 GraphQL + WebSocket subscription + Cognito 통합을 한 서비스로 제공. A는 GraphQL이 아니고 클라이언트가 4개 호출을 직접 합쳐야 함. C는 어떤 API 스타일도 결정 안 됨. D는 GraphQL 서버를 직접 운영해야 하고 subscription 구현 부담. 함정: "GraphQL + 실시간 + 모바일 + Cognito" 키워드 조합은 거의 AppSync. 추가: AppSync direct resolver로 DynamoDB 직접 호출하면 Lambda 콜드 스타트 제거.

---

**문제 2.** 결제 처리 큐 — 순서 보장 + 중복 제거(같은 결제 두 번 처리 방지) + 최대 1,000 TPS. 가장 적합한 구성은?

A) SQS Standard + idempotency in code
B) SQS FIFO with content-based deduplication (High Throughput 모드)
C) Kinesis Data Streams (단일 shard)
D) SNS Topic + Lambda

**정답: B**
해설: SQS FIFO는 MessageGroupId 단위 순서 보장 + 5분 중복 제거. 기본 300 TPS이지만 High Throughput 모드로 partition 확장해 3,000+ TPS 가능. Content-based deduplication은 메시지 body 해시로 자동 중복 제거. A는 순서 보장 없음(Standard는 best-effort). C(Kinesis 단일 shard)는 1MB/s = 1,000 records/s 한도이지만 ack·visibility 모델이 결제 워크플로우에 어색하고, 재처리 필요 없는 결제에 과한 도구. D(SNS)는 큐가 아니라 fan-out이라 부적합. 함정: "exactly-once" 표현은 SQS FIFO도 strict하게는 보장 안 됨(5분 dedup window). application 레벨 idempotency 권장.

---

**문제 3.** 한 이벤트를 5개 다운스트림(분석·CRM·배송·알림·audit)에 각자 처리 속도로 fan-out. 각 다운스트림은 실패 시 재시도 + 격리가 필요. 가장 적합한 구성은?

A) SNS Topic + 5개 SQS subscription + 각 SQS의 DLQ
B) Kinesis Data Streams + 5개 Consumer
C) EventBridge Rule 5개
D) Lambda chain

**정답: A**
해설: SNS는 매우 높은 throughput의 fan-out에 최적, SQS subscription으로 각 다운스트림이 자체 폴 속도로 처리 + visibility timeout으로 처리 중복 방지 + DLQ로 영구 실패 격리. B(Kinesis)는 재처리·시계열 분석용이고 fan-out 5개는 SNS가 더 적합·저렴. C(EventBridge)도 가능하지만 단순 fan-out + 높은 처리량에는 SNS가 단가가 낮음. D는 결합도 높음. 함정: "다양한 필터 + 외부 SaaS target"이면 EventBridge, "단순 fan-out + 매우 높은 처리량"이면 SNS. 추가: SNS subscription에 FilterPolicy 적용으로 다운스트림별 필터링 가능.

---

**문제 4.** 처리 실패 메시지를 5회 시도 후 영구 격리해 운영자가 분석한다. 어떤 구성?

A) Visibility Timeout 길게
B) SQS DLQ + RedrivePolicy maxReceiveCount=5
C) Long Polling
D) Delay Queue 사용

**정답: B**
해설: DLQ + maxReceiveCount=5는 5회 receive 시도 후 메시지를 DLQ로 자동 이전. DLQ는 별도 SQS이고 운영자가 분석·재처리·삭제. A는 처리 시간 잠금일 뿐 영구 격리 아님. C는 polling 효율화이지 실패 처리 아님. D(Delay Queue)는 새 메시지 지연(0~15분). 함정: maxReceiveCount는 receive 횟수이지 처리 실패 횟수가 아님. 메시지가 폴되었다가 visibility timeout 초과 시 count +1. 추가: DLQ 분석 후 fix 배포되면 redrive로 main 큐에 다시 흘려보냄(2021 콘솔 기능).

---

**문제 5.** 한 광고 플랫폼이 클릭 스트림을 실시간 집계와 동시에 7일치 raw 데이터를 ML 학습용으로 보존, 재처리 가능. 두 consumer가 서로 latency 영향 없이 동시 처리.

A) SQS
B) Kinesis Data Streams + Enhanced Fan-Out (EFO)
C) SNS Topic
D) EventBridge Pipes

**정답: B**
해설: Kinesis는 재처리 + 다중 소비자 + 7일 보존 모두 지원. EFO는 consumer마다 shard당 2MB/s 전용 + push 모델로 latency 70% 감소. 두 consumer(실시간 집계 Lambda, S3 보존 Firehose)가 서로 throughput 영향 없이 동시. A(SQS)는 1회 소비 + 다중 consumer 불가. C(SNS)는 보존·재처리 없음. D는 단일 source→target 파이프. 함정: "다중 소비자 + 재처리"는 거의 Kinesis. EFO와 standard consumer의 차이는 시험에 자주 출제. 추가: shard 보존 기간은 24h(default)~365d로 설정.

---

**문제 6.** SNS Topic 한 개에 모든 메시지가 publish되고, subscriber마다 특정 속성(type=high)만 받게 한다. 코드 작성 없이.

A) SNS Message Filtering (FilterPolicy)
B) SQS Visibility Timeout
C) EventBridge Archive
D) Kinesis Sharding

**정답: A**
해설: SNS Message Filtering은 subscription에 FilterPolicy를 지정해 매칭되는 메시지만 받게 함. exact/prefix/anything-but/numeric/IP 등 패턴 지원. 코드 작성 없이 매니지드. B는 처리 잠금이지 필터링 아님. C는 EventBridge 기능이고 SNS와 무관. D는 Kinesis 영역. 함정: SNS의 filtering은 message attribute 기반(혹은 message body 기반, 2020~)이고 EventBridge의 풍부한 JSON 필드 매칭과는 차이. 단순 필터는 SNS, 복잡 매칭은 EventBridge가 답.

---

**문제 7.** Lambda Event Source Mapping(SQS source)에서 배치 size=10. 한 메시지가 실패하면 기본 동작은 배치 전체 재시도이지만, 실패한 메시지만 재시도하려면?

A) Visibility Timeout 짧게
B) ReportBatchItemFailures 활성화 + 함수가 실패 message ID 반환
C) DLQ에 즉시 보내기
D) BatchSize=1로 설정

**정답: B**
해설: ReportBatchItemFailures는 Lambda ESM의 partial batch response 기능. 함수가 `batchItemFailures: [{itemIdentifier: "msg-id-1"}, ...]` 형태로 응답하면, Lambda는 실패한 메시지만 재시도하고 나머지는 ack(큐에서 삭제). 기본 동작(전체 배치 재시도)은 idempotent 안 되면 중복 처리 문제. A는 무관. C는 DLQ는 maxReceiveCount 초과 후. D(BatchSize=1)는 효율 매우 낮음. 함정: "배치 처리 + 부분 실패"는 ReportBatchItemFailures가 답. 추가: Kinesis/DDB Streams ESM도 동일 기능 지원.

---

## 📌 오늘의 요약

1. **AppSync GraphQL**: schema-first + direct resolver(Lambda 없이 DDB) + Subscription(WebSocket) + 5 인증 모드
2. **SQS Standard**(무한 TPS, 순서 X) vs **FIFO**(300 TPS, 순서 + dedup 5분) + High Throughput FIFO
3. **Visibility Timeout** = 처리 평균 × 1.5~2, **Long Polling** = empty 호출 절감
4. **DLQ + maxReceiveCount** = 영구 실패 격리, redrive로 복구
5. **SNS Topic + SQS subscription** = fan-out 표준, **Message Filtering** + **FIFO Topic**(2020)
6. **Kinesis Data Streams** = 재처리 + 다중 소비자, **Shard + Partition Key**, **EFO** 2MB/s 전용
7. **Firehose** = S3/Redshift/OpenSearch 자동 배달(60~900초 buffer + 변환)
8. **MSK** = Kafka 표준 이식성, **MSK Serverless**(2022)
9. **Lambda ESM**: BatchSize, MaximumBatchingWindow, ParallelizationFactor, **ReportBatchItemFailures**
