# Day 1 - X-Ray: Causal Graphs of Distributed Tracing and the Deep Story of the Trace Model

Debugging in the monolithic era ended with a single stack trace. A function called another function, and when an exception occurred, the call stack was printed line by line from top to bottom. But the moment that monolith was shattered into dozens of microservices, Lambda hung behind an API Gateway, that Lambda called other Lambdas, and DynamoDB, SQS, and external HTTP APIs wedged themselves in between, "the stack trace" as a concept collapsed entirely. A single user request scattered across process boundaries, networks, and asynchronous queues. To answer "why did this request take 3 seconds," you must thread the scattered work fragments back together as a single causal chain. That threading is distributed tracing, and AWS X-Ray is that model implemented on the AWS ecosystem.

Today we don't see X-Ray simply as a "tool for viewing Service Maps," but excavate the causal model beneath it. Why is a Trace more like a directed acyclic graph (DAG) than a tree, how does a Trace ID propagate context across process boundaries, how did X-Ray's segment model originate from the Google Dapper paper and how does it differ from OpenTelemetry's span model, how does the indexing difference between Annotation and Metadata connect to the cost of reverse indices in search engines. X-Ray is a core piece of the observability domain in the DOP exam, and the scenarios "how do you find which segment is slow in a microservice," "how do you visualize the bottleneck in a Lambda chain," "how do you reduce tracing costs" repeat across test cycles.

## Why Distributed Tracing Was Born — From Dapper to X-Ray

The history of distributed tracing begins with the **Dapper** paper released by Google in 2010 ("Dapper, a Large-Scale Distributed Systems Tracing Infrastructure"). Google was in an environment where a single search query passed through hundreds of services scattered across thousands of machines, and had no way to know "which service is slow." Dapper solved this problem by introducing three core ideas. First, assign a unique **trace ID** to each request and propagate it to all downstream calls. Second, record each unit of work as a **span** and restore causality by referencing the parent span ID. Third, because tracing every request is too expensive, use **sampling** to collect only a subset.

X-Ray's Trace/Segment/Subsegment model is Dapper's trace/span model translated into AWS terminology. Dapper's "trace" becomes X-Ray's "Trace," and Dapper's "span" splits into two levels in X-Ray: "Segment" (service boundary) and "Subsegment" (work within a service). Knowing this lineage reveals why X-Ray looks this way and why it's conceptually compatible with OpenTelemetry (another descendant of Dapper).

```
Trace (1 user request = one causal graph)
 ├─ Segment (Service A) — work at a single service/resource boundary
 │   ├─ Subsegment (DynamoDB GetItem) — downstream call
 │   ├─ Subsegment (invoke Lambda B) — remote call
 │   └─ Subsegment (business_logic) — internal code block
 └─ Segment (Service B)
     └─ Subsegment (...)
```

> 💡 **Related theory**: The three design goals defined by the Dapper paper for distributed tracing remain the standard for all tracing systems to this day — **low overhead** (tracing must not slow down the main service), **application-level transparency** (developers don't have to instrument everything by hand, i.e., auto-instrumentation), **scalability** (works at Google scale). X-Ray's SDK auto-patching (`patch_all()` auto-instruments boto3·requests), sampling (overhead control), and Daemon asynchronous batch transmission (low overhead) implement exactly these three goals. Zipkin (Twitter), Jaeger (Uber), and OpenTelemetry (CNCF) are all direct descendants of Dapper and stand on the same trace-span-context propagation triangle.

> 🔍 **Going deeper**: A Trace is commonly drawn as a "tree," but strictly speaking it's closer to a **DAG (directed acyclic graph)**. A simple synchronous call chain is a tree, but when one task calls multiple downstream services in parallel (fan-out), the parent-child relationship becomes 1:N, and in asynchronous messaging where one message reaches multiple consumers (SQS fan-out via SNS) or batches multiple traces into a single processing unit, **span links** emerge. OpenTelemetry added a separate edge type called "link" in addition to parent-child relationships. X-Ray's segment expresses causality through `parent_id`, but a practical trap is that the causal chain can break at asynchronous boundaries — when passing through SQS, producer traces and consumer traces often don't automatically connect, so you must manually propagate trace context in message attributes.

## Trace ID and Context Propagation — The String That Crosses Process Boundaries

All the magic of distributed tracing hinges on one thing: **context propagation**. When Service A calls Service B via HTTP, you must somehow communicate to B "this call is part of trace X, and your parent is segment Y." If this doesn't happen, the segment created by B becomes an orphan and can't attach to the trace. X-Ray carries this information in HTTP headers.

```
X-Amzn-Trace-Id: Root=1-65500000-1234abcd5678ef90; Parent=53995c3f42cd8ad8; Sampled=1
```

- `Root`: Trace ID. Version `1-`, `65500000` is the Unix epoch of the request time encoded in hexadecimal, the rest is 96 bits of random. In other words, **a timestamp is embedded in the Trace ID**.
- `Parent`: The caller's segment ID. The receiver makes this their `parent_id` and hangs their own segment from it.
- `Sampled`: Whether to collect this trace (1) or discard it (0). **The sampling decision is made at the entry point of the trace and propagated**. Intermediate services don't decide anew on their own.

Embedding a timestamp in the Trace ID is no accident. X-Ray partitions and expires traces by time (deleted after 30 days), and with the timestamp already in the ID, you can tell which time bucket it belongs to without a separate index lookup. This is the same thinking behind time-sortable identifiers like KSUID or ULID replacing UUIDv4.

> 💡 **Related theory**: Carrying trace context via HTTP headers went through a standards war. X-Ray used `X-Amzn-Trace-Id`, Zipkin used `X-B3-*` (B3 propagation), Jaeger used `uber-trace-id`, and they weren't compatible with each other. The **W3C Trace Context** standard (2020, `traceparent`/`tracestate` headers) ended this confusion. It defined vendor-neutral propagation with the format `traceparent: 00-{trace-id}-{parent-id}-{flags}`. OpenTelemetry uses W3C Trace Context by default, and ADOT (Day 3) provides a propagator that bidirectionally converts X-Ray headers and W3C headers, bridging the two worlds. The answer to "why does the trace break when X-Ray and OTel mix" is exactly this propagation format mismatch.

> 📚 **Case study**: An e-commerce company operated an order service (using X-Ray SDK) and a new payment service (using OpenTelemetry) together, and the trace split in two on the Service Map when crossing from orders to payments. The cause was a propagation header mismatch — orders expected `X-Amzn-Trace-Id`, payments expected `traceparent`. When both the X-Ray propagator and W3C propagator were configured in an ADOT Collector to bidirectionally convert headers, the traces connected all the way through. The lesson: in multi-SDK environments, the first failure point in distributed tracing is almost always a context propagation format mismatch.

## Active vs Passive Tracing — Who Starts the Trace

A frequently confused concept in X-Ray is the distinction between Active and Passive tracing. The difference is "does this service have the authority to **start/create** a trace."

- **Active Tracing**: If an incoming request has no trace, the service **creates one**, and propagates the Trace ID to the downstream services it calls. Turning Lambda on as Active lets the function become the starting point of a trace.
- **Passive Tracing**: When a Trace ID arrives from outside, **just follow it**, and don't start a new trace on your own.

```yaml
# SAM — Lambda Active Tracing
Globals:
  Function:
    Tracing: Active
```

```bash
# API Gateway stage
aws apigateway update-stage \
  --rest-api-id abc --stage-name prod \
  --patch-operations op=replace,path=/tracingEnabled,value=true
```

The typical pattern is **the trace starts at the request's front gate (API Gateway or ALB), and all services downstream propagate the ID they received**. Sampling is decided once at the entrance and shared across the entire chain, so a single request is never partially traced.

> ⚠️ **Pitfall**: Lambda's Active Tracing **captures not just the function code execution time but also the Init (cold start) period as a segment**. When viewing traces from a function with frequent cold starts, the Init subsegment is recorded in hundreds of milliseconds, tempting you to think "why is this so slow." X-Ray isn't lying — it's honestly showing you the real cold start cost. Another pitfall: if you turn on Active Tracing alone and don't do SDK instrumentation (`patch_all`), you see the Lambda invocation segment itself but the DynamoDB·HTTP call subsegments inside the function stay empty, so you miss the bottleneck section. Active Tracing (who starts the trace) and SDK instrumentation (how finely you break down the interior) are separate switches.

## SDK and Auto-Instrumentation — Transparency of Instrumentation

"Application-level transparency," one of Dapper's three goals, is realized here. It's impossible for developers to put trace code in every function, so the SDK intercepts libraries (monkey-patch) and automatically creates subsegments.

```python
from aws_xray_sdk.core import patch_all, xray_recorder
patch_all()   # patch boto3, requests, mysql, httplib, etc. at runtime

@xray_recorder.capture('business_logic')
def process(order):
    table = boto3.resource('dynamodb').Table('orders')
    table.put_item(Item={'id': order['id']})  # subsegment created automatically
```

`patch_all()` replaces the methods of libraries like boto3·requests with tracing wrappers. After that, every time that library makes an external call, the SDK automatically opens a subsegment (records start time), and when the call ends, closes it (records end time·errors). DynamoDB·HTTP calls appear in the trace without changing a line of code.

In practice, **Lambda Powertools' Tracer** is recommended over the raw SDK. It bundles annotation helpers, auto-marking of cold starts, and response capture toggles.

```python
from aws_lambda_powertools import Tracer
tracer = Tracer(service="checkout")

@tracer.capture_lambda_handler
def handler(event, context):
    tracer.put_annotation(key="OrderId", value=event['order_id'])  # indexed
    tracer.put_metadata(key="rawEvent", value=event)               # not indexed
    process(event['order_id'])

@tracer.capture_method
def process(order_id):
    ...
```

> 🔍 **Going deeper**: The implementation mechanism of auto-instrumentation differs by language. Python/Ruby use **monkey-patching**, replacing methods at runtime; Java uses **bytecode instrumentation** at class loading time (javaagent, ASM/ByteBuddy-based); .NET uses the **CLR Profiler API**. The X-Ray SDK has this patching logic built into the language-specific SDK, while OpenTelemetry splits it into separate instrumentation libraries. This difference matters: Java auto-instrumentation only needs the `-javaagent` flag and **doesn't touch source code at all**, but Python's monkey-patching is sensitive to import order — if you don't call `patch_all()` before other imports, subtle bugs occur where some libraries don't get patched.

## Annotation vs Metadata — The Economics of Reverse Indices

There are two ways to attach additional context to X-Ray, and the difference between these two is not merely an API choice but a matter of **search index cost**.

- **Annotation**: Key-value pairs that are **indexed**. That is, in trace searches they become targets of filtering and searching like `annotation.OrderId = "abc"`. However, they're limited to a maximum of 50 per trace, and values can only be strings, numbers, or booleans.
- **Metadata**: Not indexed. You can't search for it, but you can store arbitrary JSON (large payloads, nested objects) and see it as debug information when you open an individual trace.

```python
tracer.put_annotation(key="UserId", value=user_id)        # searchable, low-cardinality keys
tracer.put_metadata(key="RequestBody", value=event_body)  # not searchable, for detailed debugging
```

This design is the fundamental trade-off of search engines as-is. Indexed fields are searched quickly but come with the **cost of building and maintaining the inverted index**. That's why X-Ray limits the number of indexed annotations and forces you to send non-searchable details as metadata to avoid the cost.

> 💡 **Related theory**: The separation of annotation/metadata is exactly the same principle as the separation we saw yesterday (Week 10) in CloudWatch of metrics (low-cardinality aggregation) and logs (high-cardinality detail). Generalizing, observability data always splits into two classes — **low-cardinality keys like dimensions/tags/annotations that are indexed for searching and aggregation**, and **high-cardinality details like payloads/metadata that are stored without indexing**. Because the cost of reverse indices is proportional to cardinality. If you carelessly dump `OrderId` (unique per request, high-cardinality) into annotation, the index explodes, so the best practice is to keep only the keys you absolutely need to search in annotation and push the rest down to metadata. This is the same as how in Honeycomb·Elasticsearch, "which fields to index" is itself a cost design question.

## Service Map — Aggregating Causal Graphs Into Topology

Thousands of individual traces can't be viewed one by one by humans. X-Ray automatically generates a **Service Map** by aggregating them — a service topology diagram. It groups the segments of each trace by service into nodes, and draws the call relationships as edges.

- **Nodes**: Services (Lambda functions, API Gateway, DynamoDB tables, ...). A node colored red means a high error rate.
- **Edges**: Call relationships. Thicker edges mean more calls, and color·numbers show average response time and error rates (fault/error/throttle) on each edge.

Problem interpretation is intuitive — **follow the red and thick nodes/edges and the bottlenecks and failure points emerge**. Click a node and you get a list of traces that passed through that service, then drill down to individual traces to see which subsegment consumed the time.

```
  User → API Gateway → Lambda A → Lambda B → DynamoDB
   Service Map (automatically aggregated):
     APIGW ──→ LambdaA ──→ LambdaB ──→ DynamoDB
              (p50/p99 latency, error% on each edge)
```

> 🔍 **Going deeper**: The Service Map is the **topological union** of the individual trace causal graphs. One trace is "the path this request took," but the Service Map is "the sum of the paths all requests took," revealing the entire system structure. The key here is **the three classifications of errors** — `fault` (5xx, server's fault), `error` (4xx, client's fault), `throttle` (429, rate limit). When Service Map is red, not all red is the same red. If throttle is frequent, it's a capacity/throttling issue; if fault is frequent, it's code/dependency failures; if error is frequent, malformed requests are coming in. If you can't distinguish these classifications, you'll fix the wrong place when you see a "red node."

## X-Ray Daemon — Why Send Through a Daemon Instead of Directly

Lambda integrates automatically with X-Ray with no extra configuration, but on EC2·ECS·EKS you must go through an **X-Ray Daemon**. The application doesn't send segments directly to the X-Ray API; instead it throws them to a local Daemon via **UDP**. The Daemon batches and sends them to the X-Ray service.

- ECS: Run the Daemon as a **sidecar container**
- EC2: systemd service
- EKS: **DaemonSet** (one per node)

Why introduce this indirection? Because of Dapper's "low overhead" goal. If the application synchronously calls the X-Ray API on every invocation, a network round-trip gets added on top of the main request. With UDP, it's fire-and-forget — the application doesn't wait for a response, and the Daemon takes on asynchronous batch transmission, retry, and buffering. This is exactly the same pattern as logging, where the application doesn't transmit remotely directly but throws to a local agent (Fluent Bit).

> 💡 **Related theory**: The pattern of placing a local agent between the application and the telemetry backend is a textbook example of the **sidecar pattern**. Separation of concerns — the application just takes on the responsibility of "throwing telemetry," while the sidecar handles "batching·retry·compression·authentication·routing." UDP is used because **loss tolerance of trace data**. Traces are statistical samples so losing some doesn't greatly shake the overall picture, so we choose low overhead (UDP) over reliability (TCP). By contrast, you'd never use UDP for payment transactions. "The cost-benefit ratio of data determines the transmission protocol" is a general principle illustrated here.

## X-Ray Insights — Automatic Anomaly Detection

Humans can't constantly stare at traces. **X-Ray Insights** learns the normal baseline of the Service Map, and when latency·error rate spikes abnormally, it automatically creates an Insight and publishes an EventBridge event. Connect this to Lambda/SNS for automatic alerts and automatic remediation.

```json
{ "source": ["aws.xray"], "detail-type": ["AWS X-Ray Insight Update"] }
```

This is the same lineage as CloudWatch Anomaly Detection from Week 10 — instead of static thresholds, it detects deviations from learned normal patterns. The difference is that the target is not metrics but trace-based health of service topology.

## Wrapping Up

Today we covered five things. First, **distributed tracing was born from Dapper (2010) with the trace-span-context propagation model**, and X-Ray's Trace/Segment/Subsegment is its AWS version. Second, **all the magic hinges on one thing: context propagation** — Trace ID is propagated via headers, and the mismatch between X-Ray headers and W3C `traceparent` is the first reason traces break in multi-SDK environments. Third, **Active vs Passive is the difference in authority to start a trace**, and Active Tracing and SDK instrumentation are separate switches. Fourth, **Annotation is indexed (searchable, low-cardinality) and Metadata is non-indexed (detailed)**, and this follows the economics of reverse indices. Fifth, **Service Map is the topological union of individual causal graphs**, and you must distinguish the three error classifications to fix the right place.

In the next article, we'll examine **X-Ray's sampling and cost tuning at operational scale**. We'll explore why Reservoir sampling has this structure, how sampling decisions consistently propagate in a distributed environment, and how to manage massive Service Maps with Groups and search expressions.

---

## 📝 연습 문제

**문제 1.** 주문 서비스(X-Ray SDK)와 결제 서비스(OpenTelemetry)를 함께 운영하는데, 주문→결제 구간에서 Service Map의 trace가 두 동강 난다. 가장 가능성 높은 원인과 해결은?

A) X-Ray retention이 만료됐다 — 보존 기간을 늘린다

B) context propagation 헤더 불일치(`X-Amzn-Trace-Id` vs W3C `traceparent`) — ADOT에 양쪽 propagator를 설정해 헤더를 상호 변환한다

C) 샘플링 비율이 낮다 — FixedRate를 100%로 올린다

D) IAM 권한 부족 — X-Ray 쓰기 정책을 추가한다

**정답: B**

해설: 멀티 SDK 환경에서 trace가 끊기는 첫 번째 실패 지점은 거의 항상 context propagation 포맷 불일치다. X-Ray SDK는 `X-Amzn-Trace-Id` 헤더를, OpenTelemetry는 W3C Trace Context의 `traceparent` 헤더를 기대한다. 받는 쪽이 보낸 쪽의 헤더 포맷을 이해하지 못하면 부모 컨텍스트를 복원하지 못해 새 trace로 시작하고, Service Map에서 두 동장 난다. ADOT Collector에 X-Ray propagator와 W3C propagator를 모두 설정해 헤더를 양방향 변환하면 trace가 끝까지 이어진다. retention(A)·샘플링(C)·IAM(D)은 trace 단절이 아니라 각각 보존·수집량·전송 실패와 관련된 별개 문제다.

---

**문제 2.** Lambda에 Active Tracing을 켰는데 Service Map에 함수 호출 segment는 보이지만, 함수 내부의 DynamoDB·HTTP 호출 subsegment가 전혀 안 보인다. 원인은?

A) Active Tracing은 켰지만 SDK instrumentation(`patch_all`/Powertools `capture`)을 안 해서 내부 호출이 계측되지 않았다

B) Lambda는 subsegment를 지원하지 않는다

C) DynamoDB는 X-Ray와 통합되지 않는다

D) Daemon이 없어서다

**정답: A**

해설: Active Tracing(누가 trace를 시작하고 다운스트림에 ID를 전파하나)과 SDK instrumentation(함수 내부를 얼마나 쪼개 보나)은 별개의 스위치다. Active Tracing만 켜면 Lambda 호출 자체의 segment는 생기지만, 함수 안의 boto3·HTTP 호출을 subsegment로 잡으려면 `patch_all()`이나 Powertools Tracer로 라이브러리를 계측해야 한다. 계측이 없으면 내부가 빈 채로 segment 하나만 보여 병목 구간을 못 본다. Lambda는 subsegment를 지원하고(B 틀림), DynamoDB도 X-Ray와 통합되며(C 틀림), Lambda는 Daemon이 불필요하다(D 틀림).

---

**문제 3.** Trace당 50개 제한이 있고 인덱싱되어 `annotation.OrderId = "..."`로 검색 가능한 X-Ray 추가 데이터는?

A) Metadata

B) Annotation

C) Subsegment

D) Segment Document 전체

**정답: B**

해설: Annotation은 키-값 쌍으로 인덱싱되어 trace 검색·필터의 대상이 되며, 인덱싱 비용 때문에 trace당 최대 50개, 값은 문자열·숫자·불리언으로 제한된다. Metadata(A)는 인덱싱되지 않아 검색은 불가하지만 임의의 큰 JSON을 디버그용으로 담을 수 있다. 역인덱스 유지 비용이 카디널리티에 비례하므로, 검색 키로 꼭 필요한 저카디널리티 값만 annotation에 두고 상세 페이로드는 metadata로 내리는 것이 정석이다.

---

**문제 4.** EC2에서 실행되는 애플리케이션이 X-Ray에 trace를 보내는 표준 경로는?

A) 애플리케이션이 X-Ray API를 매 호출마다 동기로 직접 호출

B) X-Ray Daemon에 UDP로 던지고, Daemon이 배치로 X-Ray에 전송

C) S3에 segment를 저장하면 X-Ray가 폴링

D) CloudTrail을 통해 전달

**정답: B**

해설: EC2·ECS·EKS에서는 애플리케이션이 로컬 X-Ray Daemon에 UDP(fire-and-forget)로 segment를 던지고, Daemon이 버퍼링·배치·재시도를 맡아 X-Ray 서비스에 전송한다. 이는 Dapper의 "low overhead" 목표를 구현하는 사이드카 패턴이다 — 애플리케이션은 응답을 기다리지 않고, 추적 데이터의 손실 허용성 덕에 신뢰성(TCP)보다 낮은 오버헤드(UDP)를 택한다. 직접 동기 호출(A)은 본 요청에 네트워크 왕복을 더해 느려진다. Lambda만 Daemon 없이 자동 통합된다.

---

**문제 5.** Service Map에서 한 노드가 빨갛게 표시된다. throttle, fault(5xx), error(4xx)를 구분하는 것이 왜 중요한가?

A) 색만 다를 뿐 대응은 동일하다

B) throttle은 용량/스로틀링, fault는 코드/의존성 장애, error는 잘못된 요청 유입을 뜻해 근본 대응이 완전히 다르다

C) error가 가장 심각하므로 항상 먼저 본다

D) 세 분류는 비용 청구에만 쓰인다

**정답: B**

해설: X-Ray는 에러를 세 분류로 나눈다 — `throttle`(429, 속도 제한 → 용량 증설/스로틀 완화), `fault`(5xx, 서버 잘못 → 코드 버그/다운스트림 의존성 장애), `error`(4xx, 클라이언트 잘못 → 잘못된 요청이 들어옴). "빨간 노드"라는 사실만으로는 무엇을 고칠지 알 수 없고, 분류를 봐야 올바른 곳을 고친다. 예컨대 throttle이 원인인데 코드를 디버깅하면 시간을 낭비한다. 대응이 동일하다(A)거나 단순 청구용(D)이라는 설명은 틀리며, 심각도 순위(C)는 상황에 따라 다르다.

---

**문제 6.** X-Ray Trace ID `1-65500000-1234abcd...`의 `65500000` 부분이 의미하는 것과 그 설계 이점은?

A) 랜덤 시드일 뿐 의미 없음

B) 요청 시각의 Unix epoch(16진수) — ID만 보고 시간 버킷을 알 수 있어 시각 기반 파티셔닝·만료가 인덱스 조회 없이 가능

C) 리전 코드

D) 샘플링 비율

**정답: B**

해설: X-Ray Trace ID는 `버전-타임스탬프-랜덤` 구조로, 가운데가 요청 시각의 Unix epoch를 16진수로 인코딩한 것이다. ID 안에 시각이 박혀 있어 별도 인덱스 조회 없이 ID만 보고 어느 시간 버킷에 속하는지 알 수 있고, 이는 30일 만료·시각 기반 파티셔닝을 효율화한다. KSUID·ULID가 UUIDv4를 대체하며 시간 정렬 가능성을 제공하는 것과 같은 발상이다. 리전(C)·샘플링(D)·무의미(A)는 모두 틀리다.

---

**문제 7.** 분산 추적(Dapper)이 정의한 세 가지 설계 목표가 아닌 것은?

A) low overhead (본 서비스를 느리게 하지 않음)

B) application-level transparency (auto-instrumentation으로 일일이 계측 안 해도 됨)

C) scalability (대규모에서 동작)

D) exactly-once delivery (모든 trace를 정확히 한 번 전송 보장)

**정답: D**

해설: Dapper 논문이 정의한 세 목표는 low overhead, application-level transparency, scalability다. trace는 통계적 표본이라 일부 손실을 허용하며(그래서 Daemon이 UDP를 쓴다), exactly-once delivery는 추적 시스템의 목표가 아니다. 오히려 샘플링으로 의도적으로 일부만 수집해 overhead를 제어한다. A·B·C는 모두 Dapper의 핵심 목표이며 X-Ray의 SDK auto-patching, 샘플링, Daemon 배치 전송으로 각각 구현된다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 분산 추적은 Google Dapper(2010)의 trace-span-context propagation 모델에서 태어났고, X-Ray의 Trace/Segment/Subsegment는 그 AWS판이며 trace는 트리가 아니라 DAG에 가깝다. 둘째, 모든 것이 context propagation에 달려 있다 — Trace ID를 헤더로 전파하며, X-Ray의 `X-Amzn-Trace-Id`와 W3C `traceparent` 불일치가 멀티 SDK 환경에서 trace 단절의 첫 원인이고 ADOT propagator로 잇는다. 셋째, Active vs Passive는 trace 시작 권한의 차이이고 SDK instrumentation과는 별개 스위치이며, Active Tracing만으로는 내부 subsegment가 안 보인다. 넷째, Annotation은 인덱싱(검색·저카디널리티 50개 제한), Metadata는 비인덱싱(상세 JSON)으로 역인덱스 경제학을 따른다. 다섯째, Service Map은 개별 인과 그래프의 위상적 합집합이고 fault/error/throttle 세 분류를 구분해야 하며, Daemon은 UDP 사이드카로 low overhead를 구현한다.
