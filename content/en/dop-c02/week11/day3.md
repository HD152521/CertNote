# Day 3 - ADOT: The Deep Story of OpenTelemetry Ending the Tracing Tool Wars

In the mid-2010s, distributed tracing was a good idea but an operations nightmare. Zipkin, Jaeger, X-Ray, Datadog, New Relic, Dynatrace — each had its own SDK, its own data format, its own propagation headers. If a company started with X-Ray and wanted to switch to Datadog, every service's instrumentation code had to be rewritten from scratch. Tracing libraries were buried deep in business code, so the cost of changing tools exceeded the value of using tools. This **vendor lock-in** was the biggest obstacle to distributed tracing adoption. OpenTelemetry solved this through standardization, and ADOT is AWS's official distribution of that standard.

Today we don't see ADOT simply as "AWS's OTel package," but understand what political and technical alliances birthed standardization, why the Collector's receiver-processor-exporter pipeline became the universal architecture for trace data processing, and how ADOT is fundamentally different from X-Ray SDK. In the DOP exam, ADOT increasingly appears in scenarios like "standardize multi-cloud/multi-backend observability," "collect EKS metrics in Prometheus-compatible format," "auto-instrument without code changes."

## OpenTelemetry's Birth — A Merger of Two Competing Standards

OpenTelemetry's history is remarkably a **merger of two competing projects**. Around 2016, **OpenTracing** (CNCF, focused on API standardization) and **OpenCensus** (led by Google, including library + agent) both existed to standardize trace instrumentation. They split the market by solving the same problem differently. In 2019, CNCF led their **merger into OpenTelemetry** — combining OpenTracing's API abstraction and OpenCensus's implementation and auto-instrumentation. This created today's OTel: "API standardization (OpenTracing heritage), auto-instrumentation and Collector provided as implementation (OpenCensus heritage)."

OTel's core promise is **decoupling instrumentation from backend**. Code instruments only with OTel API, and "send this data to X-Ray or Datadog" is decided later via configuration (exporter). Switch tools and business code stays the same. This is the key idea that unlocked vendor lock-in.

> 💡 **Related theory**: OTel's "separation of API and implementation" is the infrastructure version of the classic software principle **Dependency Inversion Principle (DIP)**. Applications depend not on concrete vendor SDKs (low-level modules) but on OTel API (abstraction), and which backend to send to is injected as runtime configuration. The same pattern appears everywhere — SLF4J standardizes logging API and Logback/Log4j plug in as implementations, JDBC standardizes DB access and drivers plug in. OTel applies this adapter/facade pattern to the telemetry layer, realizing "instrument once, choose backend freely." This is how standards win — when enough vendors agree to abandon their SDKs and just provide exporters for the common standard, that standard becomes the de facto industry standard.

## Three Signals Unified — logs, metrics, traces

OTel's other ambition is unifying observability's **three pillars** — logs, metrics, traces — into one standard and one pipeline. Traditionally these were separate tools and SDKs (Fluentd for logs, Prometheus for metrics, Jaeger for traces). OTel binds them with common data model and common transmission protocol (**OTLP**, OpenTelemetry Protocol).

The core value is **correlation**. When three signals share the same trace ID and resource attributes, "this error log → this trace → this metric spike at that moment" connects automatically. If signals scatter across isolated tools, humans must manually match them.

```yaml
# ADOT Collector — receiving three signals, sending to multiple backends
receivers:
  otlp:
    protocols: { grpc: {}, http: {} }
  prometheus:
    config:
      scrape_configs:
        - job_name: app
          static_configs: [{ targets: ['localhost:8080'] }]
processors:
  batch: {}
  resource:
    attributes:
      - { key: service.environment, value: prod, action: insert }
exporters:
  awsxray: { region: ap-northeast-2 }
  awsemf:  { namespace: MyApp/OTel, region: ap-northeast-2 }
  prometheusremotewrite:
    endpoint: https://aps-workspaces.../api/v1/remote_write
    auth: { authenticator: sigv4auth }
  otlp/jaeger:
    endpoint: jaeger:4317
    tls: { insecure: true }
service:
  pipelines:
    traces:  { receivers: [otlp], processors: [batch, resource], exporters: [awsxray, otlp/jaeger] }
    metrics: { receivers: [otlp, prometheus], processors: [batch], exporters: [awsemf, prometheusremotewrite] }
```

## Collector Pipeline — receiver, processor, exporter

ADOT's heart is the **Collector**. Its structure is a simple yet powerful three-stage pipeline.

- **Receivers**: Ingestion point for data. Accepts diverse formats — OTLP (gRPC/HTTP), Prometheus scrape, StatsD, Zipkin, Jaeger, etc.
- **Processors**: Transform received data. `batch` (batch for transmission efficiency), `resource` (add common attributes), `filter` (drop unnecessary data), `tail_sampling` (Day 2's result-based sampling), `attributes` (PII masking), etc.
- **Exporters**: Send transformed data to backend. X-Ray, EMF/CloudWatch, AMP, Jaeger, OpenSearch, OTLP, etc.

These three are assembled in `service.pipelines` by signal (traces/metrics/logs). The same data can **fan-out to multiple exporters simultaneously** — the example above sends traces to both X-Ray and Jaeger (essential when running both tools during migration).

> 🔍 **Going deeper**: The Collector's receiver-processor-exporter pipeline is not a new invention but the telemetry version of **ETL (Extract-Transform-Load)** or **pipes-and-filters architecture**. Unix pipelines (`cat | grep | sort`), Logstash's input-filter-output, Fluentd's source-filter-match, Kafka Connect's source-transform-sink all use the same structure. The key advantage is **composability** — each stage is independent, so changing a receiver or inserting a processor doesn't affect the rest. You can add an `attributes` processor to the processor chain to mask PII, or `filter` to drop health-check traces, or `tail_sampling` to keep only error traces, all independent of the backend. Think of Collector as "Logstash for telemetry" and its role becomes clear.

> ⚠️ **Pitfall**: Don't conflate the two Collector deployment patterns: **agent mode** (sidecar/DaemonSet beside applications) and **gateway mode** (centralized Collector cluster). Agent mode runs beside each node/Pod, collecting and transforming locally so network latency is low, but consumes resources per instance. Gateway mode aggregates all telemetry to a central Collector for batch processing (tail-based sampling needs all spans of one trace in one place, practically requiring gateway), but becomes a single point of failure. The real-world recommendation is **2-tier: agent (collection + 1st pass) + gateway (tail sampling + routing)**. Placing tail-based sampling in agent mode is a common mistake — a trace's spans scatter across multiple agents, making result-based decisions impossible.

## ADOT Deployment Forms — Lambda to EKS

ADOT comes in different forms per runtime.

- **Lambda Layer**: Simplest. Attach Layer and set one environment variable — code change-free auto-instrumentation.
- **ECS Sidecar / EKS DaemonSet**: Collector as a cohabiting container.
- **EC2 systemd service**: Traditional servers.
- **EKS Add-on**: Operator + CRD for declarative management.

```yaml
# SAM — Lambda ADOT Layer
Globals:
  Function:
    Tracing: Active
    Layers:
      - !Sub 'arn:aws:lambda:${AWS::Region}:901920570463:layer:aws-otel-python-amd64-ver-1-25-0:1'
    Environment:
      Variables:
        AWS_LAMBDA_EXEC_WRAPPER: /opt/otel-instrument
```

The magical one-liner is `AWS_LAMBDA_EXEC_WRAPPER: /opt/otel-instrument`. Lambda runs this wrapper script before starting the runtime; the script injects OTel auto-instrumentation into the runtime. Handler code unchanged, OTel instrumentation applied.

> 💡 **Related theory**: `AWS_LAMBDA_EXEC_WRAPPER` uses Lambda runtime's **wrapper script** mechanism, intercepting the actual runtime bootstrap to inject code upfront — an **interception pattern**. The same idea appears everywhere — JVM's `-javaagent` (intercept class loading), `LD_PRELOAD` (intercept shared libraries), servlet filter chains (intercept requests). The common principle is "inject cross-cutting concerns (here, instrumentation) at boundaries without modifying the core" — infrastructure implementation of AOP (Aspect-Oriented Programming). This separation means instrumentation stays physically separate from business logic, so toggling instrumentation becomes a deployment configuration problem.

## ADOT vs X-Ray SDK — What's Fundamentally Different

| Item | X-Ray SDK | ADOT (OpenTelemetry) |
|------|-----------|----------------------|
| Standard | AWS-only | OpenTelemetry (CNCF vendor-neutral) |
| Backend | X-Ray only | X-Ray + Prometheus + Jaeger + Datadog + ... |
| Propagation header | `X-Amzn-Trace-Id` | W3C `traceparent` (+ X-Ray compatible) |
| Signals | Primarily traces | traces + metrics + logs integrated |
| Multi-cloud | Difficult | Designed to be possible |
| Instrumentation code change | SDK calls needed | Near-zero with auto-instrumentation |

The fundamental difference is **coupling**. X-Ray SDK locks code to X-Ray, ADOT locks code to a standard, leaving backends free. There are trade-offs — ADOT requires managing more components (Collector operations, propagator config), and some of X-Ray's deep features (Insights, etc.) might integrate more smoothly with X-Ray SDK. "AWS only, keep simple: X-Ray SDK; multi-backend, multi-cloud, vendor-neutral: ADOT" is the decision rule.

> 📚 **Case study**: A company traced with Jaeger on on-premises Kubernetes, migrating to AWS EKS but wanted "keep Jaeger dashboards temporarily while gradually switching to X-Ray." With X-Ray SDK, every service would need rewriting. Instead, they deployed ADOT, adding both `awsxray` and `otlp/jaeger` exporters to the trace pipeline, **sending identical traces to both backends simultaneously**. During migration, they validated X-Ray dashboards side-by-side with Jaeger, then removed the Jaeger exporter for a zero-downtime cutover. Lesson: exporter fan-out dramatically lowers observability tool migration risk — parallel validation before flip-switch reduces danger.

## EKS Observability Standard Stack — ADOT + AMP + AMG

ADOT shines on Kubernetes. The standard stack for collecting Prometheus-compatible metrics on EKS is **ADOT + AMP + AMG**.

- **ADOT Collector** (DaemonSet): Prometheus-scrape Pod `/metrics` endpoints, receive traces via OTLP.
- **AMP** (Amazon Managed Prometheus): Collector sends metrics via `remote_write` to managed Prometheus (Day 4).
- **AMG** (Amazon Managed Grafana): Query AMP via PromQL for dashboards (Day 4).

```bash
# Install ADOT Operator as EKS Add-on
aws eks create-addon --cluster-name prod --addon-name adot
```

EKS Add-on installs ADOT Operator and `OpenTelemetryCollector` CRD, managing Collector Kubernetes-natively (declarative YAML). ADOT handles trace ID compatibility — X-Ray uses 128-bit+timestamp, OTel uses random 128-bit; ADOT converts between formats.

> 🎯 **Scenario**: "Organization goes multi-cloud (AWS + on-premises), standardizing observability. Must swap tracing tools later freely, collect EKS Prometheus metrics and traces together, minimize application code changes. Design?" — Answer: OpenTelemetry/ADOT standardization. ① Instrument all services with OTel API (or auto-instrumentation) for vendor neutrality — later swap backends via exporter config only. ② Deploy ADOT Collector on EKS as DaemonSet/Add-on with 2-tier (agent collecting + gateway tail-sampling). ③ Exporters simultaneously point to X-Ray (traces), AMP (metrics), optionally on-premises Jaeger, multi-backend. ④ Minimize code changes via auto-instrumentation (Lambda's `AWS_LAMBDA_EXEC_WRAPPER`, Java's `-javaagent`). Key: "instrument standard once, choose backend freely via config."

## Wrapping Up

Today we covered five things. First, **OpenTelemetry was born from OpenTracing and OpenCensus merger (2019)**, ending the tracing tool wars, with core principle decoupling instrumentation from backend (Dependency Inversion). Second, **OTel integrates logs·metrics·traces signals into one OTLP**, automating correlation. Third, **Collector is receiver-processor-exporter pipeline** (telemetry's ETL/pipes-filters), fan-outing same data to multiple backends, transforming in one place (filter·mask·tail sample). Fourth, **ADOT deploys as Lambda Layer, EKS Add-on**, auto-instrumenting code-change-free via interception (wrapper/javaagent). Fifth, **ADOT vs X-Ray SDK difference is coupling** — bound to standard for backend freedom vs bound to X-Ray for simplicity; EKS standard stack is ADOT + AMP + AMG.

The next article examines these telemetry's destination **backends — OpenSearch (logs/search), AMP (Prometheus metrics), AMG (Grafana visualization)**. We'll explore why inverted indices and time-series DBs are different engines, what workload fits what.

---

## 📝 Practice Questions

**Question 1.** What is the most fundamental value of ADOT (OpenTelemetry)?

A) It is faster than X-Ray

B) It decouples instrumentation from the backend (dependency inversion) to eliminate vendor lock-in — instrument the code once with the OTel API and freely change the backend through exporter configuration

C) It manages IAM automatically

D) It is a Lambda-only tool

**Answer: B**

Explanation: The core value of OpenTelemetry is the separation of instrumentation (the OTel API) from the backend (exporters). The application depends on a standard API rather than a vendor SDK, and whether to send to X-Ray or Datadog is decided by configuration (the dependency inversion principle). Therefore, even if the tool changes, the business code stays the same, and vendor lock-in disappears. It is the same pattern as SLF4J and JDBC standardizing logging and database access while allowing implementations to be swapped. Speed (A), IAM (C), and Lambda-only (D) are not the essence.

---

**Question 2.** In the ADOT Collector's receiver-processor-exporter pipeline, where do you perform processing such as masking PII and dropping health-check traces?

A) receiver

B) The processor (mask PII with attributes, remove health checks with filter)

C) exporter

D) It is not possible with the Collector

**Answer: B**

Explanation: Processing in the Collector pipeline is done at the processor stage — mask or delete PII attributes with the `attributes` processor, drop unnecessary (health-check) data with the `filter` processor, and perform outcome-based sampling with `tail_sampling`. A receiver (A) only receives data and an exporter (C) only sends data out to the backend. Doing this processing in one place (the Collector) independent of the backend is the composability benefit of the pipe-and-filter architecture.

---

**Question 3.** You want to migrate tracing from on-premises Jaeger to AWS X-Ray while validating both tools in parallel during the transition. How do you do this with ADOT?

A) Rewrite all services with the X-Ray SDK at once

B) Put both `awsxray` and `otlp/jaeger` in the Collector's trace pipeline exporters to send the same traces to both simultaneously (fan-out), and remove the Jaeger exporter after validation

C) Turn off both X-Ray and Jaeger and build anew

D) Just add a Lambda Layer

**Answer: B**

Explanation: The Collector can fan out the same data to multiple exporters. If `awsxray` and `otlp/jaeger` are placed together in the trace pipeline, identical traces are sent to both at the same time, so you can validate X-Ray while running both tools in parallel during the migration. After validation, removing only the Jaeger exporter completes a zero-downtime cutover. Rewriting everything at once (A) is highly risky, and exporter fan-out dramatically lowers the risk of observability tool migration.

---

**Question 4.** What is the key configuration for applying ADOT auto-instrumentation in Lambda without changing the handler code at all?

A) Add `patch_all()` to the code

B) Add the ADOT Lambda Layer + the `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-instrument` environment variable — the wrapper intercepts the runtime bootstrap and injects OTel

C) Add an X-Ray Daemon sidecar

D) Move to ECS

**Answer: B**

Explanation: When you attach the ADOT Lambda Layer and set `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-instrument`, Lambda runs this wrapper script before the runtime starts and injects OTel auto-instrumentation. Not a single line of the handler code changes. This is an interception pattern (the infrastructure implementation of AOP) that injects cross-cutting concerns at the boundary without modifying the main body, like `-javaagent` and `LD_PRELOAD`. `patch_all()` (A) is the X-Ray SDK approach, which requires code changes.

---

**Question 5.** To use the ADOT Collector for tail-based sampling (keeping 100% of error traces), which is needed, agent mode or gateway mode, and why?

A) Agent mode — place it next to each Pod

B) Gateway mode — tail sampling can judge by outcome only when all spans of a trace are gathered in one place, but in agent mode the spans are scattered across multiple nodes

C) Both are the same

D) Only possible with a Lambda Layer

**Answer: B**

Explanation: Tail-based sampling decides whether to keep or discard a trace by looking at its outcome (whether it errored, its latency) after the trace is complete, so all spans of that trace must be gathered in a single Collector. In agent mode (a per-node sidecar/DaemonSet), the spans of one trace are scattered across multiple agents, making outcome-based decisions impossible. Therefore, a gateway (centralized) Collector that gathers all telemetry is required. The practical recommendation is two tiers: agent (first-stage collection and processing) + gateway (tail sampling and routing).

---

**Question 6.** OpenTelemetry was born from the merger of which two projects, and what did each focus on?

A) Prometheus + Grafana

B) The 2019 merger of OpenTracing (API standardization) and OpenCensus (implementation and auto-instrumentation) — combining API abstraction with an auto-instrumentation implementation

C) Zipkin + Jaeger

D) X-Ray + CloudWatch

**Answer: B**

Explanation: OpenTelemetry was born in 2019, led by the CNCF, from the merger of OpenTracing (CNCF), which standardized the tracing instrumentation API, and OpenCensus, which was led by Google and provided auto-instrumentation and agents. By combining OpenTracing's API abstraction with OpenCensus's implementation and auto-instrumentation, it became today's OTel, in which "the API is standardized, and auto-instrumentation and the Collector are provided as implementations." It is a case where the fragmentation of two competing standards was ended through a merger.

---

**Question 7.** What is the fundamental difference behind the decision criterion "if you use only AWS now and need simple tracing, use the X-Ray SDK; if you need multiple backends and vendor neutrality, use ADOT"?

A) Cost

B) Coupling — the X-Ray SDK ties the code to X-Ray, while ADOT ties the code to a standard so the backend can be chosen freely (at the price of the operational burden of the Collector and propagators)

C) Security level

D) Number of supported Regions

**Answer: B**

Explanation: The fundamental difference between the two is coupling. The X-Ray SDK ties the code to X-Ray, which is simple but makes it hard to change the backend, whereas ADOT ties the code to the OTel standard so the backend can be changed freely through exporter configuration. In return, ADOT has more components to handle, such as Collector operation and propagator configuration. Therefore the decision criterion is "AWS only and simple → X-Ray SDK; multiple backends, multi-cloud, vendor neutral → ADOT." Cost, security, and Regions are not the key axes of judgment.

---

## 📌 Today's Summary

There are five key takeaways today. First, OpenTelemetry ended the tracing-tool wars through the 2019 merger of OpenTracing (API) and OpenCensus (implementation), and its core value is eliminating vendor lock-in by separating instrumentation from the backend (dependency inversion). Second, OTel unifies the three signals of logs, metrics, and traces into a single OTLP and automates correlation through shared trace IDs and resources. Third, the Collector is a receiver-processor-exporter pipeline (the telemetry version of ETL/pipe-and-filter) that fans out the same data to multiple backends and performs PII masking, filtering, and tail sampling in one place; tail sampling requires gateway mode. Fourth, ADOT is deployed through Lambda Layers, EKS Add-ons, and similar means, and auto-instruments without code changes through interception such as `AWS_LAMBDA_EXEC_WRAPPER` (the infrastructure implementation of AOP). Fifth, the difference between ADOT and the X-Ray SDK is coupling (standard vs X-Ray lock-in), and the standard EKS observability stack is ADOT + AMP + AMG.
