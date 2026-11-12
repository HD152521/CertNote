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

## 📝 Practice Questions

**Question 1.** A Lambda function is invoked thousands of times per second and publishes order metrics. After calling PutMetricData synchronously on every invocation, both API throttling and response latency occurred. What is the most appropriate improvement?

A) Reduce only the metric dimensions to shrink the payload per PutMetricData call and secure headroom under the TPS limit

B) Switch to EMF — embed metrics in logs so that metric API calls drop to zero

C) Switch to High-Resolution Metrics (1-second resolution) to lengthen the publishing interval and spread out bursts

D) Move PutMetricData to an asynchronous worker thread to decouple it from the response latency of the hot path

**Answer: B**

Explanation: A synchronous PutMetricData on the hot path hits the account/Region TPS limit and causes throttling, and the call latency is added to the Lambda execution time. EMF embeds metrics not through a separate API but in the `_aws` block of the output log JSON, and CloudWatch extracts them automatically at ingestion, so metric API calls drop to zero and both throttling and latency disappear. Reducing dimensions (A) is only a partial mitigation, High-Resolution (C) increases cost, and an asynchronous thread (D) is frozen when execution ends under the Lambda execution model, so a background thread cannot guarantee a flush and does not eliminate throttling either. EMF is structurally superior because it absorbs the act of "sending a metric" into the act of "writing a log."

---

**Question 2.** You want to wake the on-call engineer only "when the external API's 5xx rate exceeds 1% AND p99 latency exceeds 500 ms." You do not want to be woken every time an individual metric briefly spikes. What is the design?

A) Keep only a single 5xx alarm and debounce it with a "5 out of 5" condition to absorb transient spikes

B) Create a 5xx-rate alarm and a p99 latency alarm (compute the rate with Metric Math), combine them with a Composite Alarm `AND`, and attach notifications only to the Composite

C) Use Lambda to poll both metrics every minute, evaluate the AND condition in code, and publish to SNS

D) Measure 5xx and latency simultaneously with a Synthetics Canary and notify through a single Canary alarm

**Answer: B**

Explanation: Build the 5xx "rate" with Metric Math `(5xx/requests)*100`, build the p99 latency as an extended-statistics alarm, and then page only when "both are in breach" using the Composite Alarm `AND`. If the individual alarms serve only as signals and only the Composite sends notifications, noise decreases and you define the "symptom combination in which users are actually affected." "M out of N" on each alarm also debounces transient spikes — this is the same temporal filtering as removing switch chatter in a circuit. A single 5xx alarm (A) cannot apply the latency condition, and polling (C) and Synthetics (D) are inappropriate. The core of this pattern is the design philosophy of "separating individual alarms from notification to prevent alert fatigue."

---

**Question 3.** The payment-failure metric is normally 0, so there are no data points at all. The alarm should fire only when failures reach the threshold. There is also a separate metric where "if the heartbeat stops (no data), an outage is imminent." What is the `treat-missing-data` setting for each?

A) Both breaching — treat missing data as always in breach so that no gap is missed

B) Payment failures = notBreaching, heartbeat = breaching

C) Both notBreaching — treat missing data as always normal to prevent false alarms

D) Both missing — when there is no data, keep the previous ALARM state as it is

**Answer: B**

Explanation: For a sparse metric (payment failures), missing data is normal, so it must be `notBreaching` for the alarm to enter ALARM only when failures exceed the threshold (with breaching, there would be no data and the alarm would be stuck in ALARM permanently). For the heartbeat, missing data is itself the outage signal, so it must be `breaching` to catch the interruption. Even though both are "no data," the metrics mean opposite things, so they are configured oppositely — that is the key. Looking deeper, this is a semantic decision about "how to interpret the absence of data," which cannot be inferred automatically from code and can be decided only with domain knowledge — a human knows whether it is a sparse counter or a continuous heartbeat.

---

**Question 4.** You want to extract only the 5xx responses from an external NGINX access log whose format cannot be changed and turn them into a metric and alarm, and at the same time load the entire log into OpenSearch in real time. What is the combination?

A) Rewrite the NGINX logs with an EMF `_aws` block to extract metrics, and load into OpenSearch via S3 export

B) Metric Filter `[..., status_code=5*, ...]` + Alarm (5xx metric), and also Subscription Filter → Kinesis Firehose → OpenSearch (load everything)

C) Run Logs Insights manually every 5 minutes to aggregate 5xx and index the results into OpenSearch

D) A Lambda function polls the log group every minute, counts 5xx to publish a metric, and loads the full text into OpenSearch

**Answer: B**

Explanation: EMF is for code you write yourself, so it cannot be used with an external NGINX format (EMF is schema-on-write: it adds the `_aws` block to your own output, so it does not apply to someone else's log format). The two goals are solved with separate tools — use a Metric Filter to extract a 5xx metric from lines with status_code 5* and attach an alarm (extraction at ingestion time, immediate), and use a Subscription Filter to load everything into OpenSearch in real time through Firehose (inverted index for search). Manual Insights (C) is not a real-time alarm, and polling (D) has latency, cost, and throttling problems. Key distinction: a Metric Filter "extracts metrics from someone else's format," while EMF "embeds metrics from your own code."

---

**Question 5.** Log costs are accumulating from the automatically created Log Groups of hundreds of Lambda functions, and separately, all logs must be retained for 7 years for compliance. For operational queries, the most recent 2 weeks is enough. What is the design?

A) Retain all Log Groups indefinitely and query 7 years of data with Logs Insights on demand

B) Detect new Log Group creation with EventBridge and automatically apply 14-day retention, at the same time send everything through a Subscription Filter → Firehose → S3 for archiving, transition to Glacier with S3 lifecycle rules, and use Athena for long-term queries

C) Manually download logs with a daily script, back them up to S3, and immediately delete the originals

D) Index all logs in an OpenSearch domain for 7 years to unify search and retention in a single tier

**Answer: B**

Explanation: Solve the two problems separately. Cost accumulation is prevented by automation in which EventBridge detects the creation of a new Log Group (the `CreateLogGroup` API event) and a Lambda function automatically applies retention (14 days) — configuring hundreds manually is unrealistic. For the 7-year retention, use hot/cold tiering (isomorphic to the memory-hierarchy principle) — CloudWatch holds only 14 days for operational queries, while everything flows through Firehose to S3, transitions to Glacier/Deep Archive, and infrequent queries run directly through Athena. Unlimited retention (A) and 7 years in OpenSearch (D) are excessively costly (both keep cold data in the hot tier), and the manual approach (C) is unrealistic.

---

**Question 6.** You want to automatically collect per-pod CPU and memory for an EKS cluster, but it is a small cluster and you are mindful of observability cost. You also need to analyze the cold-start latency of a Lambda function separately. What tool is used for each?

A) Container Insights for both — Lambda is also a container runtime, so the same agent collects both

B) For EKS, Container Insights (ADOT/CloudWatch Agent DaemonSet, limited scope); for Lambda, Lambda Insights (Extension Layer, init duration)

C) Lambda Insights for both — attach the Extension Layer to both nodes and functions for uniformity

D) Probe the endpoints of both workloads externally with a Synthetics Canary and estimate resources and cold starts

**Answer: B**

Explanation: For EKS pod resources, a collection agent deployed as a DaemonSet on every node scrapes cAdvisor/kubelet data and sends it to Container Insights. In a small cluster, observability cost can exceed the workload cost, so narrow the scope, for example by enabling only key namespaces (a typical case of observability cost approaching workload cost). For Lambda cold starts, the Lambda Insights Extension measures init duration and analyzes it even while the function is frozen — the Extension is a separate process from the function, so it finishes measuring even if the function is frozen. Each workload uses its own dedicated Insights. The key is the difference in deployment model: containers use a DaemonSet (one per node), while Lambda uses an Extension (a sidecar per function).

---

**Question 7.** The URL `path` was used as a metric dimension, and order IDs were embedded as in `/orders/{order_id}`, causing a time-series explosion and a sharp cost increase. What is the root-cause fix?

A) Add more dimensions to spread the time series across multiple metrics and reduce the load on any single metric

B) Normalize the path — replace the variable portion with a `/orders/{id}` placeholder so cardinality is finite, and keep the ID itself as a log field

C) Switch to High-Resolution Metrics to split the aggregation unit finer and lower the storage cost per time series

D) Group the alarms of the exploded time series into one with a Composite Alarm to control cost

**Answer: B**

Explanation: When an ID is embedded in the path, every request produces a different dimension value, leading to unbounded cardinality — in a time-series database each unique combination is a separate index entry, so it is both memory and cost (the same physics as the cardinality explosion that makes Prometheus die from OOM). If you normalize the variable portion into a `{id}` placeholder before using it as a dimension, the number of path patterns becomes finite, and lookups by order_id, which you actually need, are done with log fields + Logs Insights rather than metrics (logs are full-scanned, so cardinality does not matter). This is the core Week 10 principle, "only low cardinality as dimensions, high cardinality in logs," and it is enforced by the data structure. Adding dimensions (A) makes it worse, and resolution (C) and Composite (D) are irrelevant.

---

**Question 8.** "Check API availability from outside every 5 minutes" (scenario X), "measure real-user LCP by region" (scenario Y), "expose a new feature to 10% and compare conversion-rate statistics" (scenario Z). What tool fits each scenario?

A) X=RUM, Y=Synthetics, Z=Synthetics

B) X=Synthetics, Y=RUM, Z=Evidently (or AppConfig + analysis)

C) X=Evidently, Y=Synthetics, Z=RUM

D) Synthetics for all three

**Answer: B**

Explanation: X (external availability independent of traffic) calls for Synthetics Canary, an active probe (black-box, active); Y (Web Vitals experienced by real users) calls for RUM, passive monitoring (black-box, passive); and Z (variant comparison and statistical validation) calls for Evidently, an A/B experiment tool (or AppConfig Feature Flags + your own analysis). The three paradigms of active, passive, and experimentation map exactly onto the scenarios. From Google SRE's "symptom-based alerting first" viewpoint, X and Y both measure the black box (the symptoms users see), but they diverge on whether they are active (even without traffic) or passive (riding on real traffic).

---

**Question 9.** A static threshold was applied to a business metric (order count) whose normal range changes by time of day and day of week, and now false alarms fire every dawn. In addition, traffic grew 10x, and X-Ray and metric costs also exploded. What are the solutions to the two problems?

A) Lower the threshold to the dawn minimum to eliminate false alarms, and disable all X-Ray tracing to contain cost

B) Use Anomaly Detection (a band learned with seasonality) for the order metric; for cost, use X-Ray fixed-rate sampling (5%) plus full collection of errors, and demote high-cardinality dimensions to logs

C) Combine the order alarm and the cost alarm with a Composite Alarm to suppress notifications during dawn hours

D) Switch the metrics to High-Resolution to capture dawn fluctuations more finely and raise sampling precision

**Answer: B**

Explanation: A metric with seasonality cannot be handled with a static threshold, so Anomaly Detection learns a normal band per time of day and day of week and alarms only on deviations (seasonal decomposition of a time series — separate it into trend/seasonality/residual and catch only anomalies in the residual). The cost explosion is handled by moving from "collect everything" to "sample + collect all exceptions" — sample X-Ray at 5%, separately collect errors and high-latency requests at a higher rate, and demote high-cardinality dimensions such as UserId and OrderId to log fields. Turning off all tracing (A) is an overreaction that loses debugging ability (MTTR) entirely, and Composite (C) and High-Resolution (D) solve neither problem. The key insight is that "the cost knob differs by signal (traces = sampling, metrics = cardinality)."

---

**Question 10.** Server metrics (CPU, latency) are all normal, yet only users in a specific country say it is "slow." What combination of diagnostic tools should be used?

A) Monitor server CPU and latency more finely with High-Resolution to find hidden micro-bursts

B) Measure with RUM split by region + check ISP and internet path reachability with Internet Monitor + reproduce externally with a Synthetics Canary in that Region

C) Increase the memory of the Lambda function that handles traffic from that country to reduce processing latency

D) Group latency and error alarms with a Composite Alarm to define regional symptom combinations

**Answer: B**

Explanation: When the servers are normal but only a specific region is slow, the problem is likely outside the application (network path, CDN, DNS) — the very fact that the white box (system internals) is all green is a strong signal that "the cause lies outside the white box." Use RUM regional data to measure which environments are slow (black-box, passive), use Internet Monitor to visualize ISP and path reachability problems for that region, and reproduce externally with Synthetics in that Region (black-box, active). The key is "when users feel slowness, use user- and network-perspective tools rather than system metrics," which matches Google SRE's symptom-based diagnosis principle. Strengthening server metrics (A), memory (C), and alarms (D) are irrelevant to an external path problem.

---

**Question 11.** A single request passes through API Gateway → Lambda → SQS → another Lambda → DynamoDB. During an outage, "which request's logs belong to which stage" are not linked, so root-cause identification (MTTR) takes long. What is the most direct improvement?

A) Raise the log level of every stage to DEBUG to leave detailed per-stage logs and cross-check them manually in chronological order

B) Inject a correlation ID into all logs, metrics, and traces using Powertools or similar to tie one request's signals together, and trace causality between stages with X-Ray

C) Increase the retention of each stage's log group to gain time to cross-check back to past requests

D) Publish per-stage latency as High-Resolution Metrics to identify which stage is slow as a time series

**Answer: B**

Explanation: To tie signals together per request in a distributed system, a common correlation ID (the trace ID lineage carried by the `traceparent` header of W3C Trace Context) must be embedded in all logs, metrics, and traces. If Powertools injects it automatically through decorators and X-Ray connects causality between stages, you can quickly trace "where and why this request failed" during an outage and reduce MTTR. The tricky part of distributed tracing is that when crossing an asynchronous boundary such as SQS, the trace context must be carried in message attributes so that context propagation does not break. Raising to DEBUG (A) only increases volume, enlarging the haystack and making things harder to find (worse signal-to-noise), and retention (C) and resolution (D) have nothing to do with the linking problem.

---

**Question 12.** An organization uses Datadog as its standard observability platform. Datadog polls hundreds of thousands of AWS metrics with GetMetricData, causing API throttling and delays of minutes. What is the improvement?

A) Lengthen the polling interval to lower the GetMetricData call frequency and reduce pressure on the API limit

B) Push metrics to Datadog through Firehose with CloudWatch Metric Streams — eliminating polling resolves the throttling and delay

C) Narrow the metrics delivered to Datadog down to key indicators to reduce the number of polled time series itself

D) Consolidate multi-Region metrics into a single Region to reduce the number of cross-Region polling calls

**Answer: B**

Explanation: Polling-based integration (GetMetricData/ListMetrics) runs into API limits and accumulates latency when there are many metrics — a fundamental limitation of the pull model, isomorphic to the problem Prometheus scraping faces when targets explode. With Metric Streams, CloudWatch pushes metrics to Kinesis Firehose, so polling disappears, latency drops from minutes to seconds, and API throttling is fundamentally eliminated. The key is the shift from "polling to push streaming." Increasing the interval (A) worsens latency, reducing metrics (C) loses visibility, and consolidating Regions (D) is irrelevant. The same pattern applies as-is to central observability integration across multiple accounts and Regions.

---

## 📌 Week 10 Close

**One-sentence summary**: **Observability is deciding "what metric, what log, what trace, what user-view" by cardinality and cost, and tools deploy across incident MTTD (Synthetics·alarms)→MTTA (Composite·SNS)→MTTR (Insights·X-Ray·correlation) timeline.** Metrics cheap fast alarms, logs expensive detailed, traces causal, RUM/Synthetics user-reality—each has place. Symptoms (black-box) before causes (white-box). Cardinality and sampling, not totality, buy both coverage and cost.

Three deeper lessons Week 10 left. First: **monitoring (known questions) vs observability (unknown questions)** are layers, latter depends on high-cardinality logs/traces. Second: **alarm on user symptoms, diagnose with internals**—green servers + slow users = problem is outside servers. Third: **observability has dependencies and cost**—watching the watched creates blind-spot risk, cost levers (dimension/volume/sample) differ per signal.

## 🔜 Week 11 Preview

**Observability Deep Dive — X-Ray, ADOT, OpenSearch/Prometheus**

This week: signal gathering/viewing basics. Week 11: distributed tracing (X-Ray) following request causality, OpenTelemetry (ADOT) vendor-neutral instrumentation standard, OpenSearch/Prometheus large-scale log/metric analysis. Today's correlation ID (W3C Trace Context), pull vs push, cardinality management, three pillars foundation there expands.

> 💪 **Week 10 complete!** Metrics·logs·workload·user experience woven into one thread.
