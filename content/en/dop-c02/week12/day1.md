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

## 📝 연습 문제

**문제 1.** 한 이벤트를 그 내용(state, pipeline 이름)에 따라 서로 다른 15개 AWS 서비스로 정밀하게 분기해야 한다. 단순 팬아웃이 아니라 콘텐츠 기반 라우팅이 필요하다. 가장 적합한 서비스는?

A) SNS 토픽 하나에 모두 구독시킨다

B) EventBridge — Rule의 Event Pattern으로 콘텐츠 기반 라우팅(Content-Based Router 패턴)

C) SQS 큐를 15개 만들어 직접 분배한다

D) Lambda가 모든 분기 로직을 if-else로 처리

**정답: B**

해설: EventBridge Rule은 EIP의 Content-Based Router 패턴 구현으로, 이벤트 JSON의 내용(`source`·`detail-type`·`detail`)을 검사해 서로 다른 Target으로 정밀 분기한다. SNS(A)는 토픽 단위의 거친 팬아웃이라 내용 기반 정밀 라우팅에 약하고(필터 정책으로 일부만 보완), SQS 15개(C)는 발신자가 분배 로직을 떠안아 결합도가 생기며, Lambda if-else(D)는 새 분기를 추가할 때마다 코드를 고쳐야 해 결합도를 끊지 못한다. EventBridge의 핵심 가치는 발신자가 수신자를 모르고, 새 구독자 추가 시 발신자 코드가 0줄 바뀐다는 것이다.

---

**문제 2.** 매일 새벽 3시 정각에 5만 개의 사용자별 백업 작업이 한꺼번에 실행되면서 다운스트림 시스템이 부하로 무너진다. 표준 해법은?

A) cron을 02:59로 당긴다

B) EventBridge Scheduler의 Flexible Time Window로 실행을 15분 윈도우에 분산(지터 주입)

C) Lambda 동시성 한도를 늘린다

D) 작업을 5개 그룹으로 수동 분할해 각각 다른 cron을 건다

**정답: B**

해설: 모든 작업이 같은 시각에 터지는 thundering herd(쇄도)는 분산 시스템의 고전 문제이며, 해법은 지터(jitter) 주입이다. EventBridge Scheduler의 Flexible Time Window는 "정확히 그 시각"이 아니라 "이 윈도우 안 어디든"으로 실행을 시간축에 퍼뜨려 부하를 분산한다. 같은 원리가 재시도의 exponential backoff with jitter, 캐시 만료 분산에 쓰인다. 시각을 당기거나(A) 동시성을 늘리는 것(C)은 근본 원인인 동시 쇄도를 해결하지 못하고, 수동 분할(D)은 운영 부담만 늘린다.

---

**문제 3.** SQS 큐의 메시지를 폴링해 이벤트 패턴으로 거르고, 부족한 정보를 외부 API로 보강한 뒤 DynamoDB에 저장하는 흐름을 글루 코드 없이 구성하려 한다. 가장 적합한 것은?

A) Lambda를 직접 작성해 폴링·필터·보강·저장을 모두 처리

B) EventBridge Pipes (Source → Filter → Enrichment → Target)

C) SNS 팬아웃

D) Kinesis Data Analytics

**정답: B**

해설: EventBridge Pipes는 파이프-필터 아키텍처의 구현으로, 폴링이 필요한 소스(SQS/Kinesis/DynamoDB Streams/MSK)를 받아 Filter(이벤트 패턴) → Enrichment(Lambda/Step Functions/API Destination) → Target으로 관리형으로 연결한다. 폴링·배치·에러 처리 같은 배관 코드를 AWS가 흡수하므로, 직접 Lambda를 짜는 것(A) 대비 글루 코드가 사라진다. 또한 Filter 단계가 Enrichment 앞에 있어, 불필요한 이벤트를 비싼 보강 전에 버리는 early filtering(predicate pushdown) 경제학을 제공한다. SNS(C)는 폴링 소스 통합·보강 단계가 없다.

---

**문제 4.** 결제 처리 Lambda의 버그로 6월 1일 새벽 시간대 이벤트가 잘못 처리됐다. 버그를 고친 뒤 그 시간대 이벤트만 재처리하려 한다. 전제로 미리 해뒀어야 할 것과 해법은?

A) CloudTrail 로그를 파싱해 이벤트를 수동 재구성

B) EventBridge Archive를 미리 설정해 뒀다면 start-replay로 해당 기간 이벤트를 다시 흘려보냄

C) DynamoDB 백업에서 복원

D) S3 버전 관리로 롤백

**정답: B**

해설: EventBridge Archive는 버스를 지나는 이벤트를 보관하고, Replay로 특정 기간의 이벤트를 다시 버스로 흘려보낸다. 이는 이벤트 소싱의 "이벤트 스트림 리플레이로 재처리"라는 통찰을 빌린 것으로, 버그 수정 후 해당 시간대 이벤트를 재처리하는 전형적 사고 복구 패턴이다. 단, Archive는 사전에 설정돼 있어야 하며 보존 기간 내여야 한다. CloudTrail(A)은 API 호출 감사용이지 이벤트 페이로드 재생용이 아니고, DynamoDB 백업(C)·S3 버전(D)은 이벤트 재처리가 아니라 데이터 상태 복원이다.

---

**문제 5.** EventBridge로 결제 이벤트를 처리하는데, 같은 이벤트가 가끔 두 번 처리돼 이중 청구가 발생한다. 근본 원인과 해법은?

A) EventBridge가 고장났다 — 지원팀에 문의

B) EventBridge 전달은 at-least-once라 중복이 정상 — 컨슈머에 멱등성 로직(이벤트 ID 기반 중복 차단)을 추가

C) RetryPolicy를 0으로 설정

D) DLQ를 제거

**정답: B**

해설: EventBridge 전달 보장은 at-least-once(최소 1회)로, 분산 시스템 특성상 같은 이벤트가 두 번 전달될 수 있다. 멱등성(f(f(x))=f(x))은 중복 처리를 막는 컨슈머의 책임이다 — 이벤트 ID를 키로 한 멱등성 로직(DynamoDB conditional write, Lambda Powertools Idempotency 등)이 필요하다. RetryPolicy를 0으로(C) 하면 일시 실패 시 이벤트가 유실되고, DLQ 제거(D)는 영구 실패 이벤트를 잃는다. 중복은 버그(A)가 아니라 설계된 동작이다.

---

**문제 6.** 여러 워크로드 계정의 이벤트를 보안 계정의 중앙 버스로 모아 조직 전체를 한 곳에서 감지·대응하려 한다. 올바른 구성은?

A) 각 계정에서 Lambda로 보안 계정 API를 직접 호출

B) 수신 측 중앙 버스에 put-permission으로 송신 계정의 PutEvents를 허용하고, 송신 측 Rule의 Target을 중앙 버스로 지정(hub-and-spoke 이벤트 메시)

C) VPC Peering으로 이벤트 전달

D) S3 크로스 계정 복제

**정답: B**

해설: 크로스 계정 이벤트 라우팅은 두 단계다 — 수신 측 버스에 리소스 정책(put-permission)으로 송신 계정의 events:PutEvents를 허용하고, 송신 측은 Rule의 Target을 상대 계정 버스 ARN으로 지정한다. 이렇게 워크로드 계정(spoke)이 중앙 보안 계정 버스(hub)로 이벤트를 보내면 hub-and-spoke 이벤트 메시가 된다. 이는 AWS Organizations의 위임 관리자처럼 관측·권한을 중앙으로 모으되 워크로드는 격리하는 거버넌스 사상이다. VPC Peering(C)은 네트워크 계층이지 이벤트 라우팅이 아니고, S3 복제(D)는 객체 복제다.

---

**문제 7.** Event Pattern `{"detail": {"state": ["FAILED"]}}`에 대한 설명으로 옳은 것은?

A) 이벤트 JSON이 이 패턴과 정확히 같아야(완전 일치) 매칭된다

B) 부분 일치(subset match)로, detail.state가 FAILED인 모든 이벤트를 잡고 그 외 필드는 무시한다

C) state 값을 배열이 아닌 `"FAILED"` 문자열로 써도 동일하게 동작한다

D) 여러 키는 OR, 한 키 안의 배열은 AND로 묶인다

**정답: B**

해설: Event Pattern은 부분 일치(subset match)다 — 패턴에 명시한 필드만 검사하고 이벤트의 나머지 필드는 무시하므로, state가 FAILED이기만 하면 다른 필드가 무엇이든 매칭된다. 값은 항상 배열이어야 하며 `"FAILED"` 문자열(C)은 틀리고 `["FAILED"]` 배열이 맞다. 의미론은 서로 다른 키가 AND(모두 만족), 한 키 안의 배열이 OR(하나만 만족)으로, D의 설명은 정반대다. 완전 일치(A)가 아니라 부분 일치라는 점이 EventBridge 패턴의 핵심이다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, EventBridge는 EIP의 메시지 버스·콘텐츠 기반 라우터 패턴을 AWS에 구현한 것으로, 발신자가 수신자를 모르게 해 결합도를 끊는다. 둘째, Event Pattern 매칭은 순차 비교가 아니라 결정 트리/상태 기계로 컴파일되어 규칙 수에 무관하게 빠르며, 부분 일치 의미론과 배열=OR 규칙을 가진다. 셋째, Scheduler는 수백만 스케줄과 Flexible Time Window(지터)로 thundering herd를 막는 CloudWatch cron의 후계자다. 넷째, Pipes는 파이프-필터 아키텍처로 폴링 소스의 글루 코드를 관리형으로 흡수하고, early filtering으로 비용을 아낀다. 다섯째, Archive/Replay는 이벤트 소싱의 재처리 통찰을 빌렸고, at-least-once 전달이므로 컨슈머는 멱등해야 한다.
