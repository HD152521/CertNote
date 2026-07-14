# Day 5 - Week 11 Synthesis: Real-World Decision-Making in Tracing and Telemetry Observability

Week 11 centered on **tracing**, one of observability's three pillars, threading through the telemetry pipeline that standardizes it (ADOT) to the backends where data flows (OpenSearch·AMP·AMG). Today we reconstruct five days of concepts not as scattered facts but as **one unified decision framework**. The exam doesn't ask "what is X-Ray." It asks "why is the trace broken here," "what sampling configuration solves this cost problem," "what tool combo fits this multi-cloud requirement." Today's goal is practicing those judgments.

## Week 11 Core Reframed — Five Penetrating Principles

**1. Distributed tracing stands on context propagation.** X-Ray's Trace/Segment/Subsegment descends from Google Dapper's (2010) trace-span model, and all magic hinges on propagating Trace ID across process boundaries. In multi-SDK environments, the first trace breakage cause is nearly always propagation header mismatch (`X-Amzn-Trace-Id` vs W3C `traceparent`).

**2. Everything in tracing balances cardinality and cost.** Annotations are indexed (searchable, 50 limit, low-cardinality), Metadata non-indexed (detailed). Sampling uses Reservoir (low-traffic guarantee) + FixedRate (excess ratio) for visibility and cost simultaneous. High-cardinality is trace and metric's enemy, logs' (inverted-index) friend.

**3. Standardization unlocks vendor lock-in.** ADOT (OpenTelemetry) separates instrumentation from backend (Dependency Inversion), code instruments once, backends switch via exporter config. Collector's receiver-processor-exporter pipeline does fan-out·transform·routing in one place.

**4. Storage choice is a data nature question.** Arbitrary text search → inverted index (OpenSearch), numeric time-series aggregate → TSDB (Prometheus/AMP). They're fundamentally different, unseparable.

**5. Visualization is decoupled from backend.** AMG (Grafana) is neutral layer unifying heterogeneous data sources in single dashboard, EKS observability standard stack is ADOT + AMP + AMG.

> 💡 **Related theory**: The meta-principle piercing Week 11 is **separation of concerns**. Tracing divides into instrumentation (code) · collection (Daemon/Collector) · storage (backend) · visualization (Grafana) as separate layers. This separation lets each layer swap or extend independently — swap SDK, backend stays same; swap backend, dashboard stays same. The whole observability architecture is the 4-layer pipeline ("instrumentation-transmission-storage-visualization") that OTel implements, fundamentally different from monolithic observability tools (one vendor bundling everything).

> 🔍 **Going deeper**: The "three pillars" of observability (metrics·logs·traces) are criticized. Handling three signals separately makes humans match correlations. More modern: **"derive three signals from one wide event"** (like Week 10's EMF and canonical log line). OTel integrating logs·metrics·traces into one OTLP and sharing common trace ID and resource reflects this direction. Why the exam naturally asks "drill from trace to metric to log" — signals must bind by common identifier for fast incident investigation. Seeing weaving instead of pillars is the mature view.

## Decision Tree — What to Choose When

Real-world tool selection flow:

```
Q1. What signal?
  ├─ Trace → X-Ray (AWS simple) or ADOT (multi-backend)
  ├─ Metric (numeric time-series) → CloudWatch (AWS) or AMP (Prometheus ecosystem)
  └─ Log (text search) → CloudWatch Logs / OpenSearch (full-text)

Q2. Vendor-neutral·multi-cloud needed?
  ├─ Yes → OpenTelemetry/ADOT + Prometheus/Grafana
  └─ No (AWS only) → X-Ray + CloudWatch

Q3. Single dashboard across multiple backends?
  └─ Yes → AMG (Grafana) for data source unification

Q4. Cost/visibility balance?
  └─ Reservoir (critical path guarantee) + FixedRate (noise ratio) + Priority split
```

Keep this tree in mind, scenario keywords ("multi-cloud", "Prometheus", "full-text search", "code-change-free", "trace breaks") directly map to answers.

> 📚 **Case study**: An organization started with X-Ray, later decided to standardize observability on Datadog, but every microservice had X-Ray SDK buried deep, migration estimated months. If they'd instrumented with OpenTelemetry initially, it would be one exporter config line (awsxray → datadog). Lesson: **small early decision to instrument to standard (OTel) determines huge future migration cost**. Lock-in cost isn't invoiced at lock-in time, but at escape time.

## Integrated Scenario — Five Days in One Problem

> 🎯 **Comprehensive scenario**: "Global e-commerce runs AWS EKS and on-premises K8s together. (a) Payment path trace can't lose a single trace, health checks excluded from tracing, (b) future tracing tool swappable, (c) Pod metrics via PromQL, application logs full-text searchable, (d) AWS·on-premises viewed in one dashboard with company SSO. Full design?"
>
> **Instrumentation (Day 1·3)**: All services instrumented OpenTelemetry (or auto-instrumentation) for vendor-neutrality → future tool change is exporter config only. Propagator set W3C + X-Ray compatible to prevent trace breaks.
>
> **Collection (Day 3)**: EKS has ADOT Collector 2-tier (DaemonSet collect + gateway tail-sample). Agent Prometheus-scrapes and receives OTLP, gateway keeps "error·high-latency trace 100%" via tail-sampling.
>
> **Sampling (Day 2)**: Payment (`/checkout/*`) low Priority + large Reservoir + Rate 1.0 (full), health checks Reservoir 0 + Rate 0 (exclude), rest Default 5%.
>
> **Storage (Day 4)**: Metrics → AMP (remote_write, PromQL), logs → OpenSearch (Subscription→Firehose, inverted-index full-text), traces → X-Ray (or future other backend).
>
> **Visualization (Day 4)**: AMG connects AMP, OpenSearch, X-Ray, CloudWatch + on-premises Prometheus as data sources, IAM Identity Center SSO. PromQL shared for AWS·on-premises single dashboard.
>
> This one problem spans Week 11 — standard instrumentation, per-path differential sampling, nature-based storage, neutral visualization.

---

## 🧠 12 Scenario Questions

**Q1.** Order service (X-Ray SDK) and new Payment service (OpenTelemetry) run together. On Service Map, order→payment trace splits in two. Most likely root cause and fix?

A) X-Ray trace retention (30 days) expired, payment section lost — extend retention period

B) context propagation header mismatch (`X-Amzn-Trace-Id` vs W3C `traceparent`) — configure both propagators in ADOT to bidirectionally convert headers

C) Payment service task role lacks `xray:PutTraceSegments` permission — add X-Ray write policy to IAM

D) Payment segment sampling Rate is 0, no collection — raise Rate to full collection

**Answer: B**

Explanation: Multi-SDK trace breakage's first failure point is nearly always propagation format mismatch. X-Ray SDK expects `X-Amzn-Trace-Id`, OTel expects W3C `traceparent`. If receiver can't understand sender's header, parent context restoration fails, starting new trace, splitting Service Map. Configure both propagators in ADOT Collector to bidirectionally convert headers and traces connect end-to-end. Retention·IAM·sampling are separate issues.

---

**Q2.** "Payment traces 100% collection, health checks completely exclude, rest 5% for cost" in X-Ray sampling?

A) All rules FixedRate 100%, post-filter health checks for cost control via usage

B) `/checkout/*` Priority low (first eval) Reservoir large + Rate 1.0, `/health` Reservoir 0 + Rate 0, Default (Priority 9000) Rate 0.05

C) All rules Reservoir 0 + Rate 0.05 uniform regardless of path

D) Separate via X-Ray Group, assign different collection ratios per Group

**Answer: B**

Explanation: Rules evaluate Priority ascending, first match applies. Specific rules come low (early), blanket Default last (Priority 9000). `/checkout/*` low Priority + large Reservoir + Rate 1.0 (full). `/health` Reservoir 0 + Rate 0 (exclude). Default at 9000 with 5%. This evaluation order (specific first, blanket last) is standard like ACL/routing. All 100% (A) costs balloons, Reservoir 0 for all (C) loses visibility, Groups (D) is Map slicing not sampling.

---

**Q3.** "Error traces and p99-slow traces 100% kept, normal 1% only"?

A) X-Ray head-based FixedRate 1%, supplement with separate rule Rate 1.0 for errors

B) ADOT Collector tail-based sampling (gateway mode) — decide post-completion based on results

C) Large Reservoir, bulk-collect then filter errors

D) Emit error·latency as high-resolution metric, substitute trace with metric

**Answer: B**

Explanation: X-Ray native head-based (decide at entry) can't "keep errors only" without result. Tail-based samples all initially, selects at completion by result, exact fit for "100% error, 1% normal." Requires gateway Collector (all spans of one trace in one place). FixedRate 1% (A) discards 99% errors randomly.

---

**Q4.** Collect EKS Pod metrics (Prometheus format), query PromQL, managed operation?

A) CloudWatch agent pushes Pod metrics as custom, query Metrics Insights

B) ADOT Collector scrape → AMP remote_write → AMG PromQL query

C) X-Ray traces Pod requests, derive resource usage from segment aggregation

D) DynamoDB time-series table holds metrics, PartiQL mimics PromQL

**Answer: B**

Explanation: EKS Prometheus metrics standard is ADOT (scrape) + AMP (managed, remote_write·PromQL) + AMG (Grafana viz). ADOT Collector scrapes Pod `/metrics`, sends to AMP via remote_write, AMG queries via PromQL. CloudWatch custom metrics (A) break from Prometheus ecosystem, X-Ray (C) is tracing, DynamoDB (D) isn't time-series optimized.

---

**Q5.** "Billions-line application log, full-text search specific error message" — backend and standard ingestion path?

A) Prometheus + PromQL — convert logs to counter metrics, error message as time-series

B) OpenSearch (inverted-index) + CloudWatch Logs Subscription Filter → Firehose → OpenSearch

C) X-Ray annotation index error message, trace search for full-text lookup

D) CloudWatch Metric Math combines log-derived metrics for pattern formula search

**Answer: B**

Explanation: Full-text search over arbitrary text is inverted-index (OpenSearch) optimal. Standard: CloudWatch Logs via Subscription Filter extracts real-time to Firehose (buffer·retry) then OpenSearch. Prometheus (A) is numeric time-series unsuited to text, X-Ray (C) is trace search different scope, Metric Math (D) is metric formulas.

---

**Q6.** Lambda Active Tracing on, but no DynamoDB·HTTP subsegment inside function. Root?

A) Lambda runtime doesn't support subsegment, only function segment recorded

B) Active Tracing starts·propagates; internal instrumentation needs SDK (`patch_all`/Powertools) separately

C) Lambda lacks X-Ray Daemon, subsegment transmission skipped — add Daemon Layer

D) DynamoDB·HTTP unintegrated with X-Ray, no subsegment created

**Answer: B**

Explanation: Active Tracing (start·propagate) and SDK instrumentation (interior breakdown) are separate switches. Active alone creates Lambda segment but not boto3·HTTP subsegments. Need `patch_all()` or Powertools. Lambda supports subsegments (A wrong), Daemon unnecessary (C wrong), DynamoDB integrated (D wrong).

---

**Q7.** Downstream fault rate rose from normal 0.1% but under fixed 5% threshold, no CloudWatch alert. Catch "absolute low but abnormal relative" early degradation?

A) Lower alarm threshold to 1% for higher sensitivity

B) X-Ray Insights — learn baseline, detect abnormal rise, EventBridge auto-alert

C) Expand Reservoir for more collected traces to raise statistical confidence

D) Strengthen OpenSearch FGAC access control to improve anomaly precision

**Answer: B**

Explanation: Fixed thresholds miss "absolute low but relative abnormal" early degradation. X-Ray Insights learns baseline, detects baseline-relative abnormal rise, generates Insight, publishes EventBridge for auto-response. Lowering threshold (A) triggers false alarms on normal fluctuation. Baseline-learned complements fixed-threshold blind spot.

---

**Q8.** Migrate tracing Jaeger→X-Ray, validate both tools in parallel during transition?

A) Rewrite all services to X-Ray SDK at once, remove Jaeger immediately, hard flip

B) ADOT Collector trace pipeline: add both `awsxray` and `otlp/jaeger` exporters, fan-out same trace both sides, validate then remove Jaeger exporter

C) Turn off both, rebuild X-Ray fresh, zero parallel burden

D) Add X-Ray Layer only, collect X-Ray data separately from Jaeger

**Answer: B**

Explanation: Collector fan-out to multiple exporters. Put both `awsxray` and `otlp/jaeger` in trace pipeline, same trace ships both directions, parallel validation mid-migration, then remove Jaeger for zero-downtime switch. All-at-once rewrite (A) is risky. Fan-out lowers migration risk dramatically.

---

**Q9.** Reservoir 10, service runs 100 instances. Actual reservoir collection volume?

A) ~1000/sec — each instance applies Reservoir 10 independently, 100 instances sum to 1000

B) ~10/sec — Reservoir orchestrated distributed across account·region, total maintained regardless instance count

C) ~0 — many instances, GetSamplingTargets fails, Reservoir depleted

D) 10/sec per instance, X-Ray dedupes post-hoc, effective variable

**Answer: B**

Explanation: X-Ray Reservoir isn't per-instance. Each SDK requests its share via `GetSamplingTargets`, X-Ray distributes total Reservoir (10) across instances. 100 instances still ~10/sec total, not 1000. Distributed coordination misunderstanding causes confusion.

---

**Q10.** Prometheus/AMP most common operational incident and ephemeral job (Lambda·batch) metric loss workaround?

A) Cardinality explosion (high-unique labels); ephemeral jobs via Pushgateway push then scrape

B) Disk shortage; Lambda Layer resolves

C) PromQL error; Reservoir resolves

D) Auth expiry; UltraWarm resolves

**Answer: A**

Explanation: Prometheus creates per-unique label combo time-series. High-cardinality labels like `user_id` (millions unique) explode time-series, memory dies (CloudWatch high-cardinality trap). Pull model loses metrics from jobs dead before scrape. Pushgateway: jobs push metrics there, Prometheus scrapes from there. High-cardinality IDs belong in logs (inverted-index), not labels.

---

**Q11.** AWS (EKS) and on-premises K8s metrics in one dashboard, company SSO?

A) Connect both environments in same VPC via VPN/Direct Connect, single network

B) AMG connects both AMP (AWS) and on-premises Prometheus data sources, IAM Identity Center SSO — both Prometheus-compatible, same PromQL·dashboards reused

C) Force on-premises metrics into CloudWatch, single CloudWatch dashboard

D) Migrate on-premises to AWS EKS, single AMP source

**Answer: B**

Explanation: Grafana (AMG) is backend-neutral visualization. Connect both AMP and on-premises Prometheus as data sources. Both Prometheus-compatible, same PromQL queries and dashboards reused, single screen both environments. Standard (PromQL) shared integrates even heterogeneous infrastructure. VPC (A) and migration (D) overengineered.

---

**Q12.** EC2 app traces to X-Ray standard path, Lambda different why?

A) Both directly call X-Ray API (`PutTraceSegments`) synchronously, segment transmission

B) EC2 UDP to local X-Ray Daemon, Daemon batch-sends (sidecar, low overhead); Lambda auto-integrated, no Daemon needed

C) Both put segments in S3, X-Ray polls S3 for collection

D) EC2 via CloudTrail API trace, Lambda calls X-Ray API directly

**Answer: B**

Explanation: EC2·ECS·EKS: app UDP (fire-and-forget) to local Daemon, Daemon buffers·batches·retries to X-Ray — Dapper low overhead sidecar, loses acceptable via UDP. Lambda: runtime auto-integrated with X-Ray, Daemon unnecessary. Direct sync (A) adds round-trip to main request.

---

## 🔜 Week 12 Preview

**Incident Response Automation — EventBridge, SSM Automation, Chatbot, Incident Manager**

Week 11's observability (how to see anomalies) leads to the next question — **how to respond automatically after detecting anomalies.** X-Ray Insights·CloudWatch Anomaly Detection signal, EventBridge receives, SSM Automation auto-remedies, Incident Manager coordinates on-call, Chatbot weaves ChatOps — the automation chain from detection through response in Week 12.

> 💪 Week 11 complete — wove observability's tracing·telemetry·backend into one decision system. From Dapper's trace model through OTel standardization, inverted-index and TSDB's two worlds, to Grafana's neutral visualization. Next: wiring these signals into automated incident response.
