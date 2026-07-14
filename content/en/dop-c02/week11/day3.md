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

## 📝 연습 문제

**문제 1.** ADOT(OpenTelemetry)의 가장 근본적인 가치는?

A) X-Ray보다 빠르다

B) 계측과 백엔드를 분리(의존성 역전)해 벤더 락인을 없앤다 — 코드는 OTel API로 한 번 계측하고 백엔드는 exporter 설정으로 자유롭게 바꾼다

C) IAM을 자동 관리한다

D) Lambda 전용 도구다

**정답: B**

해설: OpenTelemetry의 핵심 가치는 계측(OTel API)과 백엔드(exporter)의 분리다. 애플리케이션은 벤더 SDK가 아니라 표준 API에 의존하고, X-Ray로 보낼지 Datadog으로 보낼지는 설정으로 정한다(의존성 역전 원칙). 따라서 도구를 바꿔도 비즈니스 코드가 그대로여서 벤더 락인이 사라진다. SLF4J·JDBC가 로깅·DB 접근을 표준화하고 구현을 갈아끼우는 것과 같은 패턴이다. 속도(A)·IAM(C)·Lambda 전용(D)은 본질이 아니다.

---

**문제 2.** ADOT Collector의 receiver-processor-exporter 파이프라인에서, PII를 마스킹하고 헬스체크 trace를 버리는 가공은 어디서 하나?

A) receiver

B) processor (attributes로 PII 마스킹, filter로 헬스체크 제거)

C) exporter

D) Collector로는 불가능하다

**정답: B**

해설: Collector 파이프라인의 가공은 processor 단계에서 한다 — `attributes` processor로 PII 속성을 마스킹·삭제하고, `filter` processor로 불필요한(헬스체크) 데이터를 버리며, `tail_sampling`으로 결과 기반 샘플링을 한다. receiver(A)는 데이터를 받기만, exporter(C)는 백엔드로 내보내기만 한다. 이 가공을 백엔드와 무관하게 한곳(Collector)에서 하는 것이 파이프-필터 아키텍처의 조합성 이점이다.

---

**문제 3.** 온프레미스 Jaeger에서 AWS X-Ray로 추적을 마이그레이션하되, 기간 중 두 도구를 병행 검증하고 싶다. ADOT로 어떻게 하나?

A) 모든 서비스를 한 번에 X-Ray SDK로 재작성한다

B) Collector의 trace 파이프라인 exporter에 `awsxray`와 `otlp/jaeger`를 둘 다 넣어 같은 trace를 양쪽에 동시 전송(fan-out)하고, 검증 후 Jaeger exporter를 제거한다

C) X-Ray와 Jaeger를 둘 다 끄고 새로 만든다

D) Lambda Layer만 추가한다

**정답: B**

해설: Collector는 같은 데이터를 여러 exporter로 fan-out할 수 있다. trace 파이프라인에 `awsxray`와 `otlp/jaeger`를 함께 두면 동일한 trace가 양쪽에 동시 전송되어, 마이그레이션 기간 동안 두 도구를 병행하며 X-Ray를 검증할 수 있다. 검증 후 Jaeger exporter만 제거하면 무중단 전환이 된다. 한 번에 재작성(A)은 위험이 크고, exporter fan-out이 관찰성 도구 마이그레이션의 위험을 극적으로 낮춘다.

---

**문제 4.** Lambda에서 핸들러 코드를 전혀 바꾸지 않고 ADOT 자동 계측을 적용하는 핵심 설정은?

A) 코드에 `patch_all()` 추가

B) ADOT Lambda Layer 추가 + `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-instrument` 환경 변수 — wrapper가 런타임 부트스트랩을 가로채 OTel을 주입

C) X-Ray Daemon 사이드카 추가

D) ECS로 이전

**정답: B**

해설: ADOT Lambda Layer를 붙이고 `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-instrument`를 설정하면, Lambda가 런타임 시작 전에 이 wrapper 스크립트를 실행해 OTel auto-instrumentation을 주입한다. 핸들러 코드는 한 줄도 안 바뀐다. 이는 `-javaagent`·`LD_PRELOAD`처럼 본체를 수정하지 않고 경계에서 횡단 관심사를 주입하는 인터셉션 패턴(AOP의 인프라 구현)이다. `patch_all()`(A)은 코드 변경이 필요한 X-Ray SDK 방식이다.

---

**문제 5.** ADOT Collector를 tail-based 샘플링(에러 trace 100% 유지)에 쓰려면 agent 모드와 gateway 모드 중 무엇이 필요하며 그 이유는?

A) agent 모드 — 각 Pod 옆에 두면 된다

B) gateway 모드 — tail 샘플링은 한 trace의 모든 span이 한곳에 모여야 결과를 보고 판단할 수 있는데, agent 모드는 span이 여러 노드에 흩어진다

C) 둘 다 동일하다

D) Lambda Layer로만 가능하다

**정답: B**

해설: tail-based 샘플링은 trace가 완성된 뒤 결과(에러 여부·지연)를 보고 유지/폐기를 정하므로, 그 trace의 모든 span이 한 Collector에 모여 있어야 한다. agent 모드(노드별 사이드카/DaemonSet)는 한 trace의 span들이 여러 agent에 흩어져 결과 기반 판단이 불가능하다. 따라서 모든 텔레메트리를 모으는 gateway(중앙 집중) Collector가 필요하다. 실무 권장은 agent(1차 수집·가공) + gateway(tail 샘플링·라우팅)의 2계층이다.

---

**문제 6.** OpenTelemetry는 어떤 두 프로젝트의 합병으로 탄생했고, 각각 무엇에 집중했나?

A) Prometheus + Grafana

B) OpenTracing(API 표준화)과 OpenCensus(구현·자동 계측)의 2019년 합병 — API 추상화와 자동 계측 구현을 합쳤다

C) Zipkin + Jaeger

D) X-Ray + CloudWatch

**정답: B**

해설: OpenTelemetry는 추적 계측 API를 표준화하던 OpenTracing(CNCF)과 구글 주도로 자동 계측·에이전트를 제공하던 OpenCensus가 2019년 CNCF 주도로 합병해 탄생했다. OpenTracing의 API 추상화와 OpenCensus의 구현·auto-instrumentation을 합쳐, "API는 표준화, 자동 계측과 Collector는 구현으로 제공"하는 지금의 OTel이 됐다. 두 경쟁 표준의 분열을 합병으로 끝낸 사례다.

---

**문제 7.** "지금 AWS만 쓰고 단순한 추적이면 X-Ray SDK, 멀티 백엔드·벤더 중립이 필요하면 ADOT"라는 결정 기준의 근본 차이는?

A) 비용

B) 결합도 — X-Ray SDK는 코드를 X-Ray에 묶고, ADOT는 코드를 표준에 묶어 백엔드를 자유롭게 한다(대신 Collector·propagator 운영 부담)

C) 보안 수준

D) 지원 리전 수

**정답: B**

해설: 둘의 근본 차이는 결합도다. X-Ray SDK는 코드가 X-Ray에 묶여 단순하지만 백엔드를 바꾸기 어렵고, ADOT는 코드가 OTel 표준에 묶여 백엔드를 exporter 설정으로 자유롭게 바꿀 수 있다. 대신 ADOT는 Collector 운영·propagator 설정 등 다룰 구성요소가 더 많다. 따라서 "AWS만·단순 → X-Ray SDK, 멀티 백엔드·멀티 클라우드·벤더 중립 → ADOT"가 결정 기준이다. 비용·보안·리전은 핵심 판단 축이 아니다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, OpenTelemetry는 OpenTracing(API)과 OpenCensus(구현)의 2019년 합병으로 추적 도구 전쟁을 끝냈고, 핵심 가치는 계측과 백엔드의 분리(의존성 역전)로 벤더 락인을 없앤 것이다. 둘째, OTel은 logs·metrics·traces 세 신호를 OTLP 하나로 통합해 trace ID·resource 공유로 상관관계를 자동화한다. 셋째, Collector는 receiver-processor-exporter 파이프라인(ETL/파이프-필터의 텔레메트리판)으로, 같은 데이터를 여러 백엔드로 fan-out하고 PII 마스킹·필터·tail 샘플링을 한곳에서 하며, tail 샘플링은 gateway 모드가 필요하다. 넷째, ADOT는 Lambda Layer·EKS Add-on 등으로 배포되고 `AWS_LAMBDA_EXEC_WRAPPER` 같은 인터셉션(AOP의 인프라 구현)으로 코드 변경 없이 자동 계측한다. 다섯째, ADOT vs X-Ray SDK의 차이는 결합도이며(표준 vs X-Ray 종속), EKS 관찰성 표준 스택은 ADOT + AMP + AMG다.
