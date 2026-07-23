# Day 2 - X-Ray: Answering "Where Is It Slow?" with Distributed Tracing

In monolithic applications, "why is it slow?" could be answered with a profiler. Follow the function call stack inside one process to see which function consumes time. But when a single request crosses API Gateway → Lambda → DynamoDB → external API → ElastiCache in microservices architecture, this approach breaks down. Each service only knows what happened inside itself; no one holds the whole request timeline. Even collecting all logs leaves you stuck on "how do I group *this request's* logs?" AWS X-Ray solves exactly this "sewing dispersed requests together" problem — a distributed tracing service.

In the DVA-C02 exam, X-Ray appears as the answer to CloudWatch's limitation: "metrics tell you what's slow but not where." The differences in activation methods between Lambda and EC2, the indexing difference between Annotation and Metadata, how sampling works — these are frequent exam topics. This article investigates where distributed tracing came from (Google Dapper), how Trace IDs propagate across service boundaries, and why X-Ray "doesn't trace every request."

## The Root of Distributed Tracing: Google Dapper and Causal Tracking

X-Ray's concepts aren't AWS invention. Google published the paper **"Dapper, a Large-Scale Distributed Systems Tracing Infrastructure"** in 2010, the direct ancestor of modern distributed tracing. Dapper's core data model — trace (entire request), span (each task unit), and spans forming parent-child trees — flows almost directly into X-Ray's Trace/Segment/Subsegment.

Dapper solved a clear problem. One Google search hits thousands of servers; when a request slows, you need to know which server or which step bears responsibility. The solution had two parts. First, assign each request a **unique ID (trace ID)** that follows every downstream call. Second, each stage records "when I started and ended, and who called me." With these two, you can gather scattered records by trace ID and reconstruct the entire request timeline via parent-child relationships.

> 💡 **Related theory**: Dapper's true insight is that tracing is fundamentally **causal tracking**. In distributed systems, knowing "A caused B" isn't enough with mere timestamp comparison — clocks on different machines drift slightly (clock synchronization problem). So span parent-child relationships are defined by *call relationships*, not time order. Leslie Lamport's 1978 paper "Time, Clocks, and the Ordering of Events" showed "event order in distributed systems is determined by causality," and distributed tracing is the practical implementation. X-Ray composing Subsegments under parent Segments in a tree expresses causality, not time.

> 🔍 **Going deeper**: Dapper emphasized tracing must be **low-overhead**. Tracing every request makes tracing itself slow — the cost of generating and transmitting trace data adds to request processing. Dapper solved this with **sampling** (trace only a fraction), and this idea flows into X-Ray's sampling rules. "Observation disturbs the observed" mirrors physics's observer effect and is a fundamental engineering constraint; distributed tracing design's core trade-off. OpenTelemetry (current CNCF standard), Jaeger (Uber), Zipkin (Twitter) are all Dapper descendants, and X-Ray connects to this standard ecosystem through ADOT (AWS Distro for OpenTelemetry).

## How Trace ID Crosses Service Boundaries: Context Propagation

The heart of distributed tracing is **context propagation**. When a request moves from service A to B, if A's trace ID isn't handed to B, the two services' records stay separate forever. X-Ray solves this with a single HTTP header.

```
X-Amzn-Trace-Id: Root=1-5e1b4151-5ac6c58dc39a6d6c2c8e4b21;Parent=53995c3f42cd8ad8;Sampled=1
```

`Root` is the trace ID for the entire request, `Parent` is the prior span's ID, `Sampled` indicates "should we trace this request." When A calls B, passing this header means B knows its span's parent is a specific span in A, and B attaches its record to the same trace. `Sampled=1` propagates too, so once tracing is decided at entry, that decision remains consistent throughout — no half-traced traces.

> 🔍 **Going deeper**: What `patch_all()` does is automate this propagation. X-Ray SDK monkey-patches libraries like boto3 and requests; every time the application makes an external call, the SDK automatically injects trace headers and opens a subsegment. Developers needn't manually add headers to every call. This "library auto-instrumentation" is the key practical technique sidestepping distributed tracing's adoption barrier — "can't fix thousands of call sites" — and OpenTelemetry provides similar auto-instrumentation agents.

> ⚠️ **Trap**: ALB doesn't support X-Ray. ALB *passes through* trace headers but doesn't create its own span, so it doesn't appear as a node in the service map. Meaningful tracing starts from **API Gateway** (enable X-Ray at the stage). When exam questions say "trace request delay behind ALB with X-Ray," ALB itself isn't a tracing target — that's the trap.

## Activation Differences: Why Lambda Is a Toggle and EC2Is a Daemon

X-Ray activation differs per service, a frequent exam topic. Understanding the reason obviates memorization. The difference's essence is "**who sends generated spans to the X-Ray service?**"

X-Ray SDK doesn't send generated spans directly to X-Ray API. Instead it shoots to **local UDP port 2000**. The **X-Ray daemon** receives and batches these, then HTTPS-transmits to X-Ray service. Splitting SDK and daemon exists because if SDK called X-Ray API synchronously on every span, applications would slow — UDP "fire-and-forget" doesn't block the application; daemon handles transmission, batching, and retry in the background.

On EC2, ECS, EKS, users must launch this daemon themselves (as a process or ECS sidecar container). **Lambda already has this daemon built into the execution environment**. So Lambda needs only an `Active Tracing` toggle; AWS handles the daemon role — with serverless there's no infrastructure to run a daemon, so AWS includes it.

| Service | Activation | Daemon |
|--------|--------|------|
| Lambda | Active Tracing toggle | Built-in by AWS (not needed) |
| API Gateway | Enable at stage | N/A |
| EC2 / ECS / EKS | SDK + daemon run manually | User responsibility (UDP 2000) |
| Beanstalk | Enable in environment settings | Platform includes |

> 📚 **Case study**: The most common ECS mistake is forgetting the daemon sidecar. SDK keeps sending spans to UDP 2000 but with no daemon receiving, they vanish silently — no errors, so debugging is hard. The standard pattern is adding `amazon/aws-xray-daemon` container as sidecar in task definition, with the app container sending to port 2000 on the same task network. "No traces visible" is 90% either missing IAM permissions or missing daemon.

## Annotation and Metadata: Indexing Splits Two Kinds of Extra Information

Two ways add extra data to traces; the difference is single: **are they indexed?**

```python
@xray_recorder.capture('process_order')
def process_order(order_id):
    with xray_recorder.in_subsegment('validate_order') as subseg:
        subseg.put_annotation('orderId', order_id)      # Indexed → searchable/filterable
        subseg.put_metadata('orderDetails', {...})       # Not indexed → viewable only
```

**Annotations** are indexed and searchable from the X-Ray console via filter expressions (`annotation.orderId = "O-123"` etc). But **max 50 per trace**, values only string/number/boolean. **Metadata** isn't indexed, so unfilterable, but can hold arbitrary JSON objects of unlimited size, suited for debugging large data.

> 💡 **Related theory**: This distinction mirrors database index design trade-offs. Indexes speed searches but increase storage and write costs, so not every column gets indexed. X-Ray limiting Annotations to 50 reflects the same logic — indexing all extra data would overwhelm X-Ray's trace search infrastructure. So role-division emerges: "identifiers used for search/filter (userId, orderId, result codes) go to Annotation; large objects viewed only (request body, response payload) go to Metadata." "What's worth indexing?" is the core question in all search system design.

> ⚠️ **Trap**: "Find all traces for a specific userId in the console" requires **Annotation**. Put userId in Metadata and it attaches to the trace as data but isn't searchable — useless. When "filterable/searchable data" appears in an exam, it's Annotation; "large object/debug info" is Metadata.

## Sampling: Why X-Ray Doesn't Trace Every Request

X-Ray's default sampling is "trace the first **1** request every second unconditionally, then **5%** of the rest." This number pairing — `fixed_target: 1`, `rate: 0.05` — embeds distributed tracing's core design intent.

```json
{
  "rules": [
    { "description": "Exclude health checks", "http_method": "GET",
      "url_path": "/health", "fixed_target": 0, "rate": 0 },
    { "description": "Trace all payment API",
      "url_path": "/payment/*", "fixed_target": 1, "rate": 1.0 }
  ],
  "default": { "fixed_target": 1, "rate": 0.05 }
}
```

Separating `fixed_target` (guaranteed traces per second) and `rate` (subsequent ratio) matters. Low-traffic services (1 request/sec) with 5% sampling sample every 20 seconds — effectively seeing nothing. `fixed_target: 1` "guarantees minimum 1 per second even at low traffic," keeping samples unbroken. Conversely, high-traffic services (tens of thousands/sec) get only 1 guarantee plus 5%, preventing trace explosion.

> 🔍 **Going deeper**: Sampling decision happens once at the request's *entry point* and propagates via the `Sampled` header to the entire path — crucial because if each service decided independently, some requests would only trace at A but not B, leaving broken traces. "Tracing decision made once applies throughout" ensures trace completeness. Setting payment APIs to `rate: 1.0` (100%), like tracing everything important or high-error routes, with health checks at 0, is the standard tuning pattern.

> 📚 **Case study**: X-Ray Insights automatically detects anomalies (response time spikes, error rate rises) via ML on this sampled data, sending alerts via EventBridge. Interesting that anomaly detection works despite only 5% sampling; statistically, a 5% sample suffices to detect distribution shifts (average vs. normal) — fundamental statistics principle applied to operations monitoring.

## Wrapping Up

X-Ray overcomes CloudWatch's limitation — "metrics tell what's slow, not where" — by assigning each request a trace ID and reconstructing scattered records via causal relationships. The model comes from Google's 2010 Dapper; context propagation (`X-Amzn-Trace-Id` header) is the heart stitching service boundaries. Lambda is a toggle and EC2 is a daemon — "who sends UDP 2000 spans to X-Ray" difference only. Annotation and Metadata split by indexing; sampling answers the fundamental constraint "observation disturbs." `fixed_target + rate` separation balances traffic scales.

Next we move beyond following *what happened* via tracing, to *who did what* auditing and automatic reaction with CloudTrail and EventBridge.

---

## 📝 연습 문제

**문제 1.** To search "all traces for a specific userId in X-Ray console," where should userId be placed?

A) Metadata

B) Annotation

C) Segment name

D) Subsegment name

**정답: B**

해설: Only **Annotation** is indexed for console search/filtering (`annotation.userId = "..."`). Metadata attaches to traces as data but isn't searchable — putting userId there means "specific user trace finding" won't work. Annotation is capped at 50 per trace with simple value types; large payloads or debug data belong in Metadata.

---

**문제 2.** Integrated X-Ray SDK in ECS Fargate, but no traces appear in console. No error logs. Most likely cause?

A) Put over 50 Annotations

B) Missing X-Ray daemon sidecar; UDP 2000 spans have nowhere to land

C) 5% sampling rate

D) ALB in front blocks

**정답: B**

해설: X-Ray SDK fires spans to local **UDP 2000** fire-and-forget; the **daemon** receives and sends to X-Ray. On ECS, you must launch the daemon as sidecar (`amazon/aws-xray-daemon`); without it, spans vanish silently — UDP doesn't error, so debugging is hard. C) Even with 5% sampling, some traces should appear. D) ALB doesn't block tracing.

---

**문제 3.** Most appropriate way to enable X-Ray in Lambda, and how it differs from EC2?

A) Lambda also needs daemon installation like EC2

B) Lambda needs only Active Tracing toggle — built-in daemon in execution environment

C) Lambda doesn't support X-Ray

D) Lambda uses CloudWatch Agent for tracing

**정답: B**

해설: Lambda is serverless with no infrastructure to run a daemon, so AWS includes it in the environment. Users only toggle **Active Tracing**. EC2/ECS/EKS need daemon processes or sidecars (UDP 2000). The difference: "who manages the daemon."

---

**문제 4.** X-Ray default sampling rule `fixed_target: 1, rate: 0.05`; what does `fixed_target` accomplish?

A) Trace only 1% of all requests

B) Guarantee minimum 1/second even at low traffic; apply 5% to requests beyond

C) Trace 1/minute

D) Trace only first 1 second

**정답: B**

해설: `fixed_target` is "guaranteed traces per second"; `rate` is "ratio applied to remaining requests." Low-traffic services (1 req/sec) with 5% alone sample every ~20 seconds (useless). `fixed_target: 1` keeps minimum sample even when traffic is light. High-traffic gets 1 guarantee plus 5%, preventing explosion. The split balances scales.

---

**문제 5.** To trace request delays behind ALB to a backend, where does meaningful tracing begin?

A) ALB appears as first Segment

B) ALB unsupported; tracing starts from API Gateway or instrumented applications

C) Install X-Ray daemon on ALB

D) CloudWatch only

**정답: B**

해설: ALB passes headers but doesn't create span, so doesn't appear in service map. Meaningful tracing starts from **API Gateway** (stage X-Ray enable) or X-Ray SDK-instrumented apps. "ALB unsupported" is a frequent trap.

---

**문제 6.** Mechanism stitching traces from microservice A calling B into one trace?

A) Same CloudWatch Logs group

B) `X-Amzn-Trace-Id` header propagates Trace ID (and Sampled decision)

C) Same IAM role

D) Same VPC

**정답: B**

해설: **Context propagation** heart: A calls B with `X-Amzn-Trace-Id` (`Root`, `Parent`, `Sampled`), B attaches its span as child to same trace. `Sampled` propagates so tracing stays consistent — no half-traces. X-Ray SDK's `patch_all()` automates header injection.

---

**문제 7.** To attach KB-sized request/response payload for debugging to X-Ray (not for search), appropriate choice?

A) Annotation (50/trace limit)

B) Metadata (no limit, not indexed)

C) CloudWatch Logs only

D) Encode in Segment name

**정답: B**

해설: **Metadata** lacks indexing but holds arbitrary JSON, unlimited size — suited for debug payloads. Annotation is indexed, searchable, but 50/trace and simple values. Index trade-off: search capability vs. storage cost. "Search-free + large object" → Metadata; "searchable + identifier" → Annotation.
