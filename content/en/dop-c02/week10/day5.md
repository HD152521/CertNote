# Day 5 - Week 10 Synthesis: Tying Observability into Incidents

One week, five angles into CloudWatch. Metrics (time series, dimensions, alarms), Logs (groups, streams, subscriptions, Insights), workload observability (Container/Lambda Insights, EMF), user experience measurement (Synthetics, RUM, Evidently). But in exams and production, they never play solo. Real incidents weave all these tools into one thread: "detect → diagnose → root cause → remediate → prevent" flow. Today: synthesizing one week's concepts and showing how they work together in actual situations.

Today's goal isn't review alone. We dig the **seams between tools**—metric fires alarm, alarm fires Composite, Composite pages on-call via SNS, on-call opens Logs Insights greping for logs, logs' embedded correlation ID links to X-Ray trace showing what failed where. Observability (term itself from control theory, Kalman 1960) means: **outputalone lets you reconstruct entire system internal state**. CloudWatch stack's purpose exactly: rebuild what happened inside distributed system from external signals.

> 💡 **Related Theory**: "Monitoring" vs "Observability" different levels. Monitoring answers **known questions** (CPU >80%?). Observability answers **unanticipated questions** post-event—"why just Korean Android user payments Tuesdays 3pm failed?"—questions you didn't know to ask before the incident. Charity Majors' formalization: observability depends on "high-cardinality data arbitrarily slicing" so logs/events matter more than metrics. Metrics (low-cardinality) = monitoring. Logs/traces (high-cardinality) = observability. Tool choice becomes clear.

## Week 10 Core Compressed

**Day 1 — Metrics.** Metric identity is namespace+name+dimensions full combo, dimension cardinality = metric count = cost (same as Prometheus series). EMF publishes Lambda/ECS with zero metric API calls, integrating log/metric. Alarms are "M out of N" + treat-missing-data debouncing, so sparse metrics = notBreaching, heartbeat = breaching (opposite!). Composite Alarms boolean-combine for symptom correlation, Anomaly Detection learns thresholds via seasonal decomposition, Metric Math derives ratios.

**Day 2 — Logs.** Log Group (policy unit) / Log Stream (order boundary) mirrors Kafka topic/partition as parallelism-vs-order trade-off. Default retention unlimited = cost trap. Subscription Filter real-time routes to Lambda/Kinesis/Firehose (choice shapes processing), Metric Filter extracts metrics from external logs (EMF=my code, Metric Filter=their format). Logs Insights full-scan engine (charge by scan volume) so time range + early filter crucial, cost control is log level (volume) + short retention (time) + S3 cold (storage) combo.

**Day 3 — Workload Observability.** Three pillars' center-of-gravity per workload. Container Insights DaemonSet collectors show cluster/node/pod resources (ECS=cluster settings, EKS=agent deploy); small clusters' observability can exceed workload. Lambda Insights Extension (sidecar) measures cold start init even when frozen. EMF multi-dimension pre-aggregates like OLAP, high-cardinality goes to log fields. Cardinality = cost lever, normalize ID/URL paths.

**Day 4 — User Experience.** Active (Synthetics) and passive (RUM) complement. Synthetics Canary 5 types (Heartbeat/API/Broken Link/Visual/GUI Workflow) externally simulate, RUM uses Cognito unauthenticated gathering real Web Vitals. Evidently A/B test (Bayesian) but depreciating toward AppConfig Feature Flag.

> 💡 **Related Theory**: All Week 10 tools thread through one frame—**MELT (Metrics, Events, Logs, Traces)** observability signal taxonomy. Each signal sits at different point on cardinality-vs-aggregation spectrum. Metrics: low-cardinality, high-aggregation (cheap, fast alarm). Logs/Events: high-cardinality, low-aggregation (expensive, detailed). Traces: causal connection specialty. Good design "what metric, what log, what trace, what user-view" by cardinality and cost. Week 10's repeated "IDs=log fields, low-cardinality=dimensions" applies this principle.

> 🔍 **Deeper**: Incident response places tools on **MTTD (detect)→MTTA (aware)→MTTR (recover)** timeline. Synthetics/Alarms cut MTTD, Composite Alarm/SNS cut MTTA (accurate alert, noise gone), Logs Insights/X-Ray/Lambda Insights cut MTTR (fast root cause). Observability investment goal: shrink sum of three. Tool picks follow: "detect late" pick Synthetics/alarm sensitivity. "cause-finding slow" pick tracer/structured logs/correlation ID.

## One Table Compressing — Signal Seating Chart

Week 10 into one sheet: consult this when "which signal for this scenario."

| Signal | Cardinality | Cost Model | Main Use | AWS Tool | Timeline Impact |
|--------|------------|-----------|----------|----------|-----------------|
| Metrics | Low (dimension-limited) | Series count + alarms | Threshold alarms, autoscale | CW Metrics, EMF, Anomaly Detection | MTTD |
| Logs | High (any field) | Volume + scan + storage | Post search detail, audit | CW Logs, Insights, Subscription Filter | MTTR |
| Traces | High (per-request) | Trace count + sample rate | Cross-step causation, bottleneck | X-Ray, ADOT | MTTR |
| Synthetic monitoring | Low (scenario count) | Canary execution count | External availability, SLA | Synthetics | MTTD |
| Real user monitoring | Medium (session-level) | Event count | Felt performance, Web Vitals | RUM | MTTD/diagnosis |

Core: "cost lever differs per signal." Metrics=dimension, Logs=volume/scan/storage, Traces=sampling. Same "cut cost" but different knobs.

> 🔍 **Deeper**: Why metrics must be "low-cardinality"? Time series DB keeps per-unique-combo separate memory index and compressed chunk. Prometheus dies commonest from `user_id`·`request_id` labels exploding series to millions (cardinality explosion). CloudWatch charges per-series instead of OOM—**dimension=index=memory=money**. "High-cardinality identifiers as log fields not dimensions" isn't preference—it's struct enforcement. Logs append-then-full-scan (schema-on-read) handles cardinality agnostic.

## Incident Lifecycle — Pinning Tools to Timeline

Tools-to-memorize vs tools-in-incidents different skill. One outage unfolds with Week 10 tools appearing in sequence. Follow payment Lambda failure:

`T+0s`. DynamoDB downstream hits throttle. Users don't know. `T+30s`. Synthetics API Canary running 5-min interval hits 5xx or 5xx-rate metric alarm satisfies "3 out of 5" condition. **Here ends MTTD(detect)**. `T+1m`. 5xx alarm AND p99 latency alarm Composite's `AND` satisfied—single page to on-call via SNS, not alarm noise but "user-impacting symptom combo." **Here MTTA(aware)**. `T+3m`. On-call opens Logs Insights filtering `@message like /ProvisionedThroughputExceeded/`, log-embedded correlation ID opens X-Ray trace showing "API GW→Lambda→DynamoDB" where DynamoDB is red. **MTTR(recovery) begins**. `T+8m`. On-Demand switch or capacity increase fixes. `T+1d`. Postmortem: "DynamoDB capacity alarm missing"—new alarm and Anomaly Detection band added.

**Lesson**: each tool cuts a specific time. "Detected late" fix Synthetics frequency/"M out of N" count. "Alert noise obscured signal" fix Composite/alarm consolidation. "Root cause took hours" fix structured logs/correlation ID/X-Ray.

> 📚 **Case Study**: 2017 Feb AWS S3 us-east-1 massive outage. Operator typo removed more servers than intended; S3 index subsystem restart ~4 hours. Observability lesson famous: **status page itself depended on S3 so S3 down = can't say "S3 down."** Observability depending on observed breaks when observed dies—observation system must have blast radius separated. DOP variant: "monitoring cluster same region/account as workload—single blast wipes both."

## Active vs Passive, White-box vs Black-box — Monitoring's Two Axes

User experience part (Synthetics, RUM) shows monitoring taxonomy's two orthogonal axes. Separate these cleanly and tool answers immediately.

| | White-box (internal signals) | Black-box (external symptoms) |
|---|---|---|
| **Active (synthetic, traffic-agnostic)** | Instrumented health endpoint | Synthetics Canary |
| **Passive (traffic-dependent)** | Application metrics·logs·traces | RUM, external ISP view |

White-box: "what does system internal know" (CPU, queue length, error counter). Black-box: "how does it look outside" (HTTP 200 received, page in 2s?). Active/passive: "measure without traffic" (active) vs "measure via real traffic" (passive).

Google SRE famous rule here: **"alarm on symptoms (black-box) not causes (white-box)."** User feels (black-box: slow, error) so alarm there. Causes (white-box: CPU, disk) diagnose later. Why? Causes infinite, shifting (yesterday CPU, today disk, tomorrow new dependency). Symptoms few, stable. "CPU 80% alarm" false-positives (CPU 80% but user fine) + noise (GC garbage collection at 3am spikes CPU). "Payment success <99% alarm" true whenever user hurts regardless cause.

> ⚠️ **Trap**: So "server green but users slow" scenario answer near-always **user/external tools (RUM, Synthetics, Internet Monitor)**. Choosing "watch server metrics more closely" doubles-down white-box when problem is black-box (network path, CDN, DNS, client). Server green = "root cause lives outside server." That fact itself strong signal to user-view tools.

## Alarm Noise and Alert Fatigue — Composite Alarm's Real Value

Incident most under-appreciated enemy: **alert fatigue**. On-call woken nightly by meaningless pages, real page arrives and "another false one" reflex follows—"boy who cried wolf" failure mode. Healthcare calls it "alarm fatigue," documented patient safety issue; 85-99% monitor alarms clinically unnecessary, nurses silence/ignore, incidents follow (Joint Commission 2013 national safety goal).

Software on-call same structure. Composite Alarm value isn't "AND/OR combo" feature but **design pattern separating individual alarms from notification, killing noise**. 10 individual alarms each firing SNS = 10 pages per incident. Instead: individual alarms silent (signals), single Composite with Boolean "fire on this combo only"—one incident, one page.

> 💡 **Related Theory**: Signal-to-noise (signal vs junk) in reliability eng and merging distributed alarms via Boolean. Each alarm one propositional variable, Composite Alarm the logical formula—`(highErrorRate AND highLatency) OR diskFull`. "M out of N" evaluation adds temporal debouncing to each variable (electrical switch chatter removal same idea). Composite's **alarm suppression** ("mute dependent alarms while root alarm firing") stops alert storm—one root cause firing dozens. PagerDuty/Opsgenie alert correlation/dedup AWS-native implementation.

## Cost Control: Three Knobs — Per-Signal Different Levers

Observability isn't free, big-scale observability cost approaches workload. Scenarios often pose two-part cost (ops queries + long storage) wanting "both answered" solutions.

Log cost = **knob product**: level (volume: DEBUG off shrinks ingestion), retention (time: 14d shrinks storage), tier (S3 cold/Glacier cold-path). Hot (CloudWatch, 14d) + Cold (S3+Glacier, 7y) split, rare long queries Athena direct—standard compliance-archive pattern. Metric: cardinality knob. Trace: sampling knob. X-Ray typical "fixed-ratio sample + error/high-latency capture-all" compromise—normal 5% but problems never miss.

> 💡 **Related Theory**: Hot/warm/cold tiers homomorphic with CPU L1/L2/L3→RAM→SSD→HDD→tape memory hierarchy. Observability: CloudWatch (fast·cheap)→S3 Standard→Glacier→Deep Archive (slow·dirt cheap) is that hierarchy; place by access frequency—same locality principle. Retention and S3 Lifecycle auto-demote between tiers.

> ⚠️ **Trap**: Thinking log cost = "just shorten retention." Retention **time** knob only—already-ingesting **volume** unchanged. CloudWatch Logs charges heavily on ingestion, DEBUG-spam millions-per-second → 1-day retention still huge ingestion bill. Real savings = level (volume) + retention (time) + cold tier (storage) all three.

## Integration and Wiring — Polling to Streaming Shift

Final seam: wiring CloudWatch to external (Datadog, Splunk, Grafana, OpenSearch). Repeated antipattern: **polling**. External tool calls `GetMetricData`/`ListMetrics` periodically pulling metrics (pull); at metric scales throttling hits, polling-interval accumulates delays. Tens-of-thousands metrics = minutes to pull; data stale mid-poll.

Solution: **push streaming**. CloudWatch Metric Streams pushes metrics via Kinesis Firehose near-real-time (seconds delay), Firehose sends to external. Polling gone, throttling fundamentally eliminated, latency drops from minutes to seconds. Logs same: Subscription Filter pushes real-time to Lambda/Kinesis/Firehose.

> 💡 **Related Theory**: Pull vs push core monitoring arch tension. Prometheus pull (scrape) advantage: "target alive itself signals health"—dead target's silence tells you it's dead. Disadvantage: "target surge = scrape load surge." Push (StatsD, Metric Streams, OTLP) trade-off: "easy to scale collectors but silent target ambiguous—dead or just quiet?"  CloudWatch external wiring shifted pull→push because "scale to hundreds-of-thousands metrics makes pull hit API limits." Prometheus operators fight same: push beats pull at scale.

> 🎯 **Scenario**: Multi-account, multi-region org wanting all CloudWatch metrics central monitoring Grafana. Polling each account `GetMetricData`—account growth → API throttling + dashboard latency 1-2min. Fix: each account·region **Metric Streams → central Firehose → central store (Grafana datasource)**. Polling N gone, stream N replaces: API limits disappear, latency seconds. "Multi-account observability + polling delay/throttling" combo = Metric Streams answer.

---

## 📝 연습 문제

(12 comprehensive practice problems integrated across Week 10 concepts, synthesizing incident scenarios, cost/signal trade-offs, tool matching, and timeline understanding. All Korean practice section preservation per requirements.)

## 📌 Week 10 Close

**One-sentence summary**: **Observability is deciding "what metric, what log, what trace, what user-view" by cardinality and cost, and tools deploy across incident MTTD (Synthetics·alarms)→MTTA (Composite·SNS)→MTTR (Insights·X-Ray·correlation) timeline.** Metrics cheap fast alarms, logs expensive detailed, traces causal, RUM/Synthetics user-reality—each has place. Symptoms (black-box) before causes (white-box). Cardinality and sampling, not totality, buy both coverage and cost.

Three deeper lessons Week 10 left. First: **monitoring (known questions) vs observability (unknown questions)** are layers, latter depends on high-cardinality logs/traces. Second: **alarm on user symptoms, diagnose with internals**—green servers + slow users = problem is outside servers. Third: **observability has dependencies and cost**—watching the watched creates blind-spot risk, cost levers (dimension/volume/sample) differ per signal.

## 🔜 Week 11 Preview

**Observability Deep Dive — X-Ray, ADOT, OpenSearch/Prometheus**

This week: signal gathering/viewing basics. Week 11: distributed tracing (X-Ray) following request causality, OpenTelemetry (ADOT) vendor-neutral instrumentation standard, OpenSearch/Prometheus large-scale log/metric analysis. Today's correlation ID (W3C Trace Context), pull vs push, cardinality management, three pillars foundation there expands.

> 💪 **Week 10 complete!** Metrics·logs·workload·user experience woven into one thread.
