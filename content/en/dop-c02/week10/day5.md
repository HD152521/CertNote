# Day 5 - Week 10 Review: Weaving the Observability Stack into an Incident

Over the week we split CloudWatch into five strands: metrics (time series, dimensions, alarms), logs (groups, streams, subscriptions, Insights), workload-specific observability (Container/Lambda Insights, EMF), and user experience measurement (Synthetics, RUM, Evidently). But on the exam and in real work, these tools don't play separately. A real incident threads them into one line that flows "detect → diagnose → root cause → remediate → prevent". Today we compress the week's concepts once more and then tie them together with scenario questions that show how they work together in real situations.

The goal of a review day isn't simple revision. What we dig into today is the **seam** between the tools — a metric wakes an alarm, the alarm is grouped into a Composite, SNS calls a person, that person digs through the logs with Logs Insights, and the correlation ID embedded in the logs leads to an X-Ray trace: one continuous thread. The word observability itself comes from control theory (Kalman, 1960) — a system being "observable" means you can **reconstruct its entire internal state from its outputs alone**. That is exactly the purpose of the CloudWatch stack — the ability to reconstruct, after the fact, what happened inside a distributed system using only external signals (metrics, logs, traces).

> "Monitoring" and "observability" are different layers. Monitoring answers **questions you already know to ask** ("Did CPU exceed 80%?"). Observability is the ability to answer **questions you didn't anticipate** after the fact ("Why do payments fail only for Korean Android users, only on Tuesday afternoons?") — questions you couldn't even have thought of before the outage. The core of this distinction, as formalized by Charity Majors, is "you must be able to slice high-cardinality data arbitrarily," which is why observability depends on the dimensionality of logs and events. Mapping metrics (low cardinality) = monitoring and logs/traces (high cardinality) = observability makes tool selection clear.

## Week 10 Key Points Condensed

**Day 1 — Metrics.** A metric's identity is the whole combination of namespace + name + dimensions, and dimension cardinality is both the number of metrics and the cost (same as Prometheus series). EMF unifies logs and metrics in Lambda/ECS with zero metric API calls. Alarms are a debouncing model of "M out of N" + treat-missing-data, so you must choose opposite missing-data handling depending on what the metric means (sparse = notBreaching, heartbeat = breaching). Composite Alarm expresses symptom correlation as Boolean algebra over alarms, Anomaly Detection learns thresholds through seasonal decomposition, and Metric Math builds ratio-derived metrics.

**Day 2 — Logs.** Log Group (policy unit) / Log Stream (ordering-guarantee unit) is the same trade-off as Kafka topic/partition. Default retention is unlimited, which is a cost trap. Subscription Filters route logs in real time to Lambda/Kinesis/Firehose, and Metric Filters extract metrics from external logs (NGINX) (EMF is for your own code, Metric Filters are for other people's formats). Logs Insights is a full-scan engine (billed by data scanned), and cost control is a combination of log level (volume) + short retention (time) + S3 cold storage (tier).

**Day 3 — Workload Observability.** The three pillars (logs, metrics, traces) have a different center of gravity per workload. Container Insights watches cluster/node/pod resources through a DaemonSet collector (ECS via cluster setting, EKS via agent deployment). Lambda Insights uses an Extension sidecar to measure cold-start init even while the function is frozen. EMF's multi-dimension combinations pre-build aggregation views like OLAP pre-aggregation, and cardinality is the key cost variable, so IDs and URLs should be normalized or sent to logs.

**Day 4 — User Experience.** Active (Synthetics) and passive (RUM) are complementary. The five Synthetics Canary types (Heartbeat/API/Broken Link/Visual/GUI Workflow) measure proactively from the outside, and RUM collects real-user Web Vitals using anonymous Cognito credentials. Evidently is A/B experimentation (Bayesian), but due to deprecation it is moving toward consolidation into AppConfig Feature Flags.

> There is one frame that runs through every tool in Week 10 — **MELT (Metrics, Events, Logs, Traces)**, the signal taxonomy of observability. Each signal sits at a different point on the "cardinality vs. aggregation" spectrum. Metrics are low-cardinality and high-aggregation (cheap, fast alarms), logs/events are high-cardinality and low-aggregation (expensive but detailed), and traces specialize in causal linkage. Good observability design is deciding "what to keep as a metric, what as a log, what as a trace" based on cardinality and cost. The "IDs go in log fields, only low-cardinality values become dimensions" rule repeated throughout Week 10 is exactly this principle applied.

> In incident response, these tools sit on the **MTTD (detect) → MTTA (acknowledge) → MTTR (recover)** timeline. Synthetics/Alarms reduce MTTD (find it sooner), Composite Alarm/SNS reduce MTTA (notify precisely, remove noise), and Logs Insights/X-Ray/Lambda Insights reduce MTTR (find the root cause quickly). The goal of observability investment is ultimately to shrink the sum of these three times. If you stay conscious of which tool shortens which stage, then in a scenario you'll pick Synthetics/alarm sensitivity when "detection is slow," and tracing/structured logs/correlation ID when "root-cause identification is slow."

## The Three Pillars in One Table — A Signal Placement Chart

Compressing Week 10 into one sheet gives the following table. When picking "which signal is this scenario?" in the exam room, scanning the rows of this table in your head narrows down the answer.

| Signal | Cardinality | Cost model | Main use | AWS tools | Time reduced |
|------|-----------|----------|---------|----------|-----------|
| Metrics | Low (limited dimensions) | Number of time series + number of alarms | Threshold alarms, auto scaling | CW Metrics, EMF, Anomaly Detection | MTTD |
| Logs | High (arbitrary fields) | Ingestion + scan volume + retention | Detailed after-the-fact search, auditing | CW Logs, Insights, Subscription Filter | MTTR |
| Traces | High (per request) | Number of traces + sampling rate | Cross-stage causality, bottlenecks | X-Ray, ADOT | MTTR |
| Synthetic monitoring | Low (number of scenarios) | Number of Canary runs | External availability, SLA | Synthetics | MTTD |
| Real-user monitoring | Medium (per session) | Number of events | Perceived performance, Web Vitals | RUM | MTTD/diagnosis |

What this table says is that "the cost model differs for each signal." Metrics reduce **dimensions**, logs reduce **volume, retention, and scanning**, and traces reduce **sampling**. The fact that even the same "cost reduction" has a different knob per signal is easily used as a trap in scenarios.

> Why must metrics be "low cardinality"? A time-series DB maintains a separate in-memory index entry and compressed chunk for each unique dimension combination. The most common reason Prometheus dies is "cardinality explosion," where putting `user_id` or `request_id` into a label blows the series up to millions. CloudWatch passes the cost on through per-time-series billing instead of going OOM — **dimension = index = memory = money**. "Put high-cardinality identifiers in log fields, not dimensions" is not a matter of taste but a constraint imposed by the data structure. Logs are sequentially appended and then full-scanned (schema-on-read), so they absorb any cardinality.

## The Incident Lifecycle — Pinning Tools to the Timeline

Memorizing tools and placing them in an incident flow are different skills. Lay a single outage out as a timeline and every tool from Week 10 shows up once in its proper place. Follow a hypothetical payment outage.

`T+0s`. The downstream DynamoDB of the payment Lambda starts throwing throttles. Users don't know yet. `T+30s`. A Synthetics API Canary poking the payment endpoint every 5 minutes gets a 5xx — or the 5xx-rate metric alarm satisfies its "3 out of 5" condition. **Everything up to here is MTTD (detection).** `T+1min`. The 5xx alarm and the p99 latency alarm satisfy the Composite Alarm's `AND`, and exactly one page goes to on-call via SNS — not individual alarm noise, but just one "combination of symptoms where users are actually affected." **This is MTTA (acknowledgement).** `T+3min`. On-call opens Logs Insights and narrows the cause with `filter @message like /ProvisionedThroughputExceeded/`, then opens the X-Ray trace using the correlation ID embedded in the logs and sees that the DynamoDB stage of "API GW → Lambda → DynamoDB" is colored red. **This is the start of MTTR (recovery).** `T+8min`. Recovery by switching to On-Demand or increasing capacity. `T+1 day`. The postmortem produces the prevention item "there was no DynamoDB capacity alarm," and a new alarm and an Anomaly Detection band are added.

The lesson of this timeline is that **each tool has a defined time it reduces.** If "we learned of the outage too late (MTTD)," pick the Synthetics interval and the N in "M out of N"; if "the alarm fired but we couldn't tell what was real (MTTA)," pick Composite and alarm consolidation; if "finding the cause took an hour (MTTR)," pick structured logs, correlation ID, and X-Ray.

> The large-scale AWS S3 us-east-1 outage of February 2017. An engineer's command-entry mistake removed more servers than intended, and restarting the S3 index subsystem took nearly 4 hours. The observability lesson is famous — **the status dashboard itself (Service Health Dashboard) depended on S3, so when S3 died it couldn't display "S3 is down."** If the observation system depends on the thing being observed, it goes blind exactly when it's needed. So the notification path (SNS, status page) must have a blast radius separated from the monitored target. The DOP exam's variant on "the risk when the monitoring stack is in the same Region/account as the workload" comes from here.

## Active vs. Passive, Whitebox vs. Blackbox — Two Axes of Monitoring

The user-experience part of Week 10 (Synthetics, RUM) shows exactly two orthogonal axes of monitoring taxonomy. If you keep these two axes separate, the tool splits immediately in a scenario.

| | Whitebox (internal signals) | Blackbox (symptoms seen from outside) |
|---|---|---|
| **Active (synthetic, traffic-independent)** | Instrumented health-check endpoint | Synthetics Canary |
| **Passive (depends on real traffic)** | Application metrics, logs, traces | RUM, external ISP perspective |

Whitebox monitoring looks at "what the system knows internally" (CPU, queue length, error counters). Blackbox looks at "how it looks from the outside" (do you get an HTTP 200, does the page load within 2 seconds). The active/passive axis separates "measures even when there's no traffic (active)" from "measures by riding on real-user traffic (passive)."

The principles from Chapter 6 of the Google SRE book (Monitoring Distributed Systems) apply here. Spend far more effort on catching **symptoms** than **causes**; page mainly on symptoms and leave cause-side metrics as debugging aids. Set alarms on symptoms users feel (blackbox: slowness, errors) and keep causes (whitebox: CPU, disk) for diagnosis. That's because causes are countless and keep changing (CPU yesterday, disk today, a new dependency tomorrow), whereas the symptoms users feel are few and stable. A "CPU 80% alarm" is a false positive if users are fine even at 80% CPU, and it becomes repeated noise caused by the GC at dawn. A "payment success rate below 99% alarm" fires whenever users are hurting, whatever the cause.

> ⚠️ **Trap**: So the answer to a scenario like "server metrics are all green but users say it's slow" is almost always a **user/external-perspective tool (RUM, Synthetics, Internet Monitor)**. An option saying to watch system metrics at finer granularity tells you to dig deeper into whitebox, but the problem may lie in blackbox territory (network path, CDN, DNS, client). The very fact that whitebox is all green is a strong signal that "the cause is outside the whitebox." This trap is the core message of studying RUM and the backbone of review-day scenario 10.

## Alarm Noise and Alert Fatigue — The Real Value of Composite Alarm

The most underestimated enemy in incident response isn't the outage itself but **alert fatigue**. If on-call is woken every night by meaningless pages, when a real page arrives they ignore it thinking "it's probably another false alarm" — the so-called "boy who cried wolf" failure mode. In healthcare this is a formal patient-safety issue called "alarm fatigue": 85–99% of monitor alarms were reported as requiring no clinical action, and there are many recorded cases where nurses turned off or ignored alarms, leading to accidents (the US Joint Commission designated it a National Patient Safety Goal in 2013).

Software on-call has the same structure. The value of Composite Alarm is not merely the feature of "AND/OR combination," but the **design pattern of decoupling individual alarms from notification to kill noise.** If 10 individual alarms each hit SNS, one outage sends 10 pages. Instead, keep the individual alarms silent (no notification) and use them only as signals, define with Boolean algebra in one Composite Alarm "only call a person when these combine in this way," and attach the notification only there. One page per outage.

> This is the **signal-to-noise** problem of reliability engineering, and also the work of composing distributed alarms with Boolean algebra. Each alarm is a propositional variable, and a Composite Alarm is a logical formula over those variables — like `(highErrorRate AND highLatency) OR diskFull`. "M out of N" evaluation adds temporal debouncing to each proposition, which is exactly the same idea as switch-chatter removal (debounce) in circuit design. Also, a Composite Alarm's **alarm suppression** means "mute lower-level alarms while the upstream dependency alarm is firing," preventing the "alert storm" in which a single root cause sets off dozens of lower-level alarms — an AWS-native implementation of the alert correlation/deduplication found in PagerDuty and Opsgenie.

## The Three Cost-Control Knobs — Each Signal Is Tuned in a Different Place

Observability isn't free, and at large scale its cost can approach the cost of the workload. Scenarios often mix two independent cost problems (operational querying + long-term retention) and demand an answer that "solves both."

Log cost is the **product of three knobs** — log level (volume: turning off DEBUG reduces ingestion), retention (time: 14 days reduces storage cost), and storage tier (separating the cold path to S3 cold/Glacier). Splitting hot (CloudWatch, 14 days) from cold (S3 + Glacier, 7 years) and querying rare long-term lookups directly with Athena is the standard pattern for compliance retention. For metric cost the knob is dimensions (cardinality), and for trace cost the knob is the sampling rate. X-Ray usually uses "fixed-rate sampling + full collection of errors and high-latency requests," a compromise that looks at only 5% of normal traffic but misses none of the abnormal.

> Hot/warm/cold data tiering is isomorphic to the memory hierarchy that descends from CPU L1/L2/L3 cache → RAM → SSD → HDD → tape. In observability, CloudWatch Logs (fast, expensive) → S3 Standard → Glacier → Deep Archive (slow, very cheap) is that hierarchy, and the principle of placing data by access frequency is the same as locality in caching. Retention policies and S3 Lifecycle are automatic demotion rules between tiers.

> ⚠️ **Trap**: The trap is to narrow log cost reduction to "just shorten retention." Retention is only the **storage time** knob; the **volume** already being ingested stays the same — a big share of CloudWatch Logs billing is ingestion, so if you print tens of thousands of DEBUG lines per second and only cut retention to 1 day, the ingestion cost is still charged. Real savings come from combining three knobs: log level (volume) + retention (time) + cold tier (storage).

## Integration — From Polling to Streaming

The last seam is how CloudWatch connects to external tools (Datadog, Splunk, Grafana, OpenSearch). The recurring anti-pattern here is **polling.** When an external tool periodically calls `GetMetricData`/`ListMetrics` to pull metrics, the more metrics there are, the more you hit API call limits (throttling), and latency accumulates by the polling interval. With hundreds of thousands of metrics, pulling them all once takes minutes, and the data is already stale by then.

The fix is **push streaming.** With CloudWatch Metric Streams, CloudWatch pushes metrics to Kinesis Firehose in near real time (a few seconds of latency), and Firehose flows them to the external destination. Because polling disappears, API throttling is eliminated at the root and latency drops from minutes to seconds. Logs have the same structure — a Subscription Filter pushes logs in real time to Lambda/Kinesis/Firehose.

> Pull vs. push is the fundamental opposition in monitoring architecture. Prometheus's pull (scrape) has the advantage that "target liveness itself is a health signal" and the disadvantage that "scrape load explodes when targets proliferate"; push (StatsD, Metric Streams, OTLP) has the trade-off that "collectors scale easily, but it's hard to tell whether a silent target is dead or just quiet." What drove CloudWatch's external integration to evolve from pull (GetMetricData) to push (Metric Streams) is the constraint that "at large scale, pull hits API limits."

> 🎯 **Scenario**: A company wants to gather all CloudWatch metrics from a multi-account, multi-Region environment into a Grafana dashboard in a central observability account. When they poll with cross-account `GetMetricData` from each account, they hit limits as accounts grow and the dashboard updates 1–2 minutes late. The fix is a structure that pushes from each source account and Region via **Metric Streams → central Firehose → central store (or Grafana data source).** Replacing N pollers with N streams removes the API limits and drops latency to seconds. When you see the combination "multi-account observability consolidation + polling latency/throttling," think of Metric Streams.

---

## 📝 Practice Questions

**Question 1.** A Lambda function is invoked thousands of times per second and publishes order metrics. When PutMetricData was called synchronously on every invocation, API throttling and response latency occurred at the same time. What is the most appropriate improvement?

A) Reduce only the metric dimensions to shrink the payload per PutMetricData call and secure headroom under the TPS limit

B) Switch to EMF — embed metrics in logs so that metric API calls drop to zero

C) Switch to High-Resolution Metrics (1-second resolution) to lengthen the publish interval and spread out bursts

D) Move PutMetricData to an asynchronous worker thread to separate it from response latency on the hot path

**Answer: B**

Explanation: A synchronous PutMetricData on the hot path hits the account/Region TPS limit and causes throttling, and the call latency is added to the Lambda execution time. EMF embeds the metrics not through a separate API but in the `_aws` block of the output log JSON, and CloudWatch extracts them automatically at ingestion, so metric API calls drop to zero and both throttling and latency disappear. Reducing dimensions (A) is only a partial mitigation, High-Resolution (C) increases cost, and an async thread (D) cannot be guaranteed to flush because under the Lambda execution model the environment freezes when execution ends, so it can't even eliminate the throttling itself. EMF is structurally superior because it absorbs the act of "sending a metric" into the act of "writing a log."

---

**Question 2.** You want to wake on-call "only when the external API's 5xx rate exceeds 1% AND p99 latency exceeds 500ms." You don't want to be woken every time an individual metric briefly spikes. What is the design?

A) Keep only a 5xx alarm and debounce it with a "5 out of 5" condition to absorb transient spikes

B) Create a 5xx-rate alarm + a p99 latency alarm (calculating the ratio with Metric Math), combine them with a Composite Alarm `AND`, and attach notification only to the Composite

C) Poll the two metrics every minute with Lambda, evaluate the AND condition in code, and publish to SNS

D) Measure 5xx and latency simultaneously with a Synthetics Canary and notify through a single Canary alarm

**Answer: B**

Explanation: Build the 5xx "rate" with Metric Math `(5xx/requests)*100`, make the p99 latency an extended-statistic alarm, and then send a page only when "both are in breach" using the Composite Alarm's `AND`. Keeping individual alarms as signals only and notifying only from the Composite reduces noise and defines the "symptom combination where users are actually affected." Each alarm's "M out of N" also debounces transient spikes — this is the same temporal filtering as switch-chatter removal in circuits. A single 5xx alarm (A) can't add a latency condition, and polling (C) and Synthetics (D) are inappropriate. The core of this pattern is the design philosophy of "decoupling individual alarms from notification to prevent alert fatigue."

---

**Question 3.** A payment-failure metric is normally 0, so there are no data points at all. The alarm should fire only when failures are at or above the threshold. There is also a separate metric where "if the heartbeat stops (no data), it's an outage." What is the `treat-missing-data` setting for each?

A) Both breaching — always treat no data as a breach so you never miss a gap

B) Payment failures = notBreaching, heartbeat = breaching

C) Both notBreaching — always treat no data as healthy to prevent false alarms

D) Both missing — when there's no data, keep the previous ALARM state as is

**Answer: B**

Explanation: For a sparse metric (payment failures), no data is normal, so it must be `notBreaching` for the alarm to go to ALARM only when failures exceed the threshold (with breaching, there's no data and it gets stuck in permanent ALARM). For the heartbeat, no data is itself an outage signal, so it must be `breaching` to catch the interruption. Even for the same "no data," the metric's meaning is opposite, so setting them in opposite ways is the key. Looking deeper, this is a semantic decision about "how to interpret the absence of data," which can't be inferred automatically by code and can only be decided with domain knowledge — a human knows whether it's a sparse counter or a continuous heartbeat.

---

**Question 4.** From an external NGINX access log whose format you can't change, you want to extract only 5xx responses into a metric and alarm, and at the same time ingest the whole log into OpenSearch in real time. What is the combination?

A) Rewrite the NGINX logs to include an `_aws` block with EMF and extract the metric, then load into OpenSearch via S3 export

B) Metric Filter `[..., status_code=5*, ...]` + Alarm (5xx metric), plus Subscription Filter → Kinesis Firehose → OpenSearch (full ingestion)

C) Manually run Logs Insights every 5 minutes to aggregate 5xx and index the results into OpenSearch

D) A Lambda function polls the log group every minute, counts 5xx and publishes a metric, and loads the full text into OpenSearch

**Answer: B**

Explanation: EMF is for code you write yourself, so it can't be used with an external NGINX format (EMF is schema-on-write, putting an `_aws` block into your own output, so it can't be applied to someone else's log format). Solve the two purposes with their own tools — a Metric Filter extracts a 5xx metric from lines with status_code 5* and attaches an alarm (extracted at ingestion time, immediate), and a Subscription Filter loads everything into OpenSearch in real time via Firehose (inverted index for search). Manual Insights (C) is not a real-time alarm, and polling (D) has latency, cost, and throttling issues. The key distinction: Metric Filter is "extract metrics from someone else's format," while EMF is "embed metrics from your own code."

---

**Question 5.** Log costs are accumulating from the auto-created Log Groups of hundreds of Lambda functions, and separately all logs must be retained for 7 years for compliance. Operational lookups only need the most recent 2 weeks. What is the design?

A) Retain all Log Groups indefinitely and query 7 years of data with Logs Insights as needed

B) Detect new Log Group creation with EventBridge → automatically apply 14-day retention, and at the same time Subscription Filter (everything) → Firehose → S3 retention, transition to Glacier with an S3 lifecycle, and use Athena for long-term queries

C) Manually download logs with a daily script, back them up to S3, and immediately delete the originals

D) Index all logs into an OpenSearch domain for 7 years to unify search and retention in a single tier

**Answer: B**

Explanation: Solve the two problems separately. The accumulating cost is stopped by automation in which EventBridge detects new Log Group creation (a `CreateLogGroup` API event) and has Lambda apply retention (14 days) automatically — configuring hundreds by hand is unrealistic. The 7-year retention is hot/cold tiering (isomorphic to the memory-hierarchy principle) — CloudWatch only for 14-day operational lookups, everything streamed via Firehose to S3 and transitioned to Glacier/Deep Archive, with rare lookups queried directly by Athena. Unlimited retention (A) and 7 years in OpenSearch (D) are excessively costly (both keep cold data in the hot tier), and the manual approach (C) is unrealistic.

---

**Question 6.** You want to automatically collect per-pod CPU and memory for an EKS cluster, but because it's a small cluster you want to be mindful of observability cost. You also need to analyze Lambda function cold-start latency separately. What tool is used for each?

A) Container Insights for both — Lambda is also a container runtime, so collect with the same agent

B) Container Insights for EKS (ADOT/CloudWatch Agent DaemonSet, limited scope), Lambda Insights for Lambda (Extension Layer, init duration)

C) Lambda Insights for both — attach the Extension Layer to both nodes and functions to unify

D) Poke the endpoints of both workloads from outside with Synthetics Canary to estimate resources and cold starts

**Answer: B**

Explanation: For EKS pod resources, a collection agent deployed as a DaemonSet on every node scrapes cAdvisor/kubelet data and sends it to Container Insights. In a small cluster, observability cost can exceed the workload, so narrow the scope, for example by enabling only the key namespaces (a classic case of observability cost approaching workload cost). For Lambda cold starts, the Lambda Insights Extension measures init duration even while the function is frozen — the Extension is a separate process from the function, so it finishes measuring even when the function freezes. The two workloads each use their own dedicated Insights. The key is the difference in deployment model: containers use a DaemonSet (one per node), Lambda uses an Extension (a sidecar per function).

---

**Question 7.** You put the URL `path` in a metric dimension, but order IDs are embedded like `/orders/{order_id}`, the time series exploded, and costs surged. What is the root fix?

A) Add more dimensions to spread the time series across multiple metrics and lower the load on a single metric

B) Normalize the path — replace the variable part with an `/orders/{id}` placeholder to make cardinality finite, and put the ID itself in a log field

C) Switch to High-Resolution Metrics to split the aggregation unit finer and lower the storage cost per time series

D) Group the alarms of the exploded time series into one with a Composite Alarm to control cost

**Answer: B**

Explanation: When an ID is embedded in the path, every request becomes a different dimension value, giving unbounded cardinality — in a time-series DB each unique combination is a separate index entry, so it is both memory and cost (the same physics as the cardinality explosion that kills Prometheus with OOM). Normalizing the variable part into an `{id}` placeholder before using it as a dimension makes the number of path patterns finite, and the per-order_id lookups you actually need are done not with metrics but with log fields + Logs Insights (logs are full-scanned, so cardinality doesn't matter). This is Week 10's core principle of "only low cardinality as dimensions, high cardinality in logs," and also a constraint imposed by the data structure. Adding dimensions (A) makes it worse, and resolution (C) and Composite (D) are irrelevant.

---

**Question 8.** "Check API availability from outside every 5 minutes" (scenario X), "measure real-user LCP by region" (scenario Y), "expose a new feature to 10% and compare conversion rates statistically" (scenario Z). What tool fits each scenario?

A) X=RUM, Y=Synthetics, Z=Synthetics

B) X=Synthetics, Y=RUM, Z=Evidently (or AppConfig + analytics)

C) X=Evidently, Y=Synthetics, Z=RUM

D) All three Synthetics

**Answer: B**

Explanation: X (external, traffic-independent availability) is Synthetics Canary, an active probe (blackbox, active); Y (real-user perceived Web Vitals) is RUM, passive monitoring (blackbox, passive); Z (variant comparison, statistical validation) is Evidently, A/B experimentation (or AppConfig Feature Flag + your own analysis). The three paradigms of active/passive/experiment map exactly onto the scenarios. From Google SRE's "symptom-based alarms first" viewpoint, X and Y both measure blackbox (symptoms users see), differing in whether they're active (even without traffic) or passive (riding on real traffic).

---

**Question 9.** A business metric (order count) whose normal range varies by time of day and day of week had a static threshold applied, and false alarms occur every dawn. Also, traffic grew 10x and X-Ray and metric costs surged. What is the fix for the two problems?

A) Lower the threshold to the dawn minimum to eliminate false alarms and disable all X-Ray tracing to control cost

B) Use Anomaly Detection (a seasonality-learning band) for the order metric, and for cost use X-Ray fixed-rate sampling (5%) + full collection of errors and demoting high-cardinality dimensions to logs

C) Combine the order alarm and a cost alarm with a Composite Alarm to suppress notifications during dawn hours

D) Switch metrics to High-Resolution to capture dawn variation more finely and raise sampling precision

**Answer: B**

Explanation: A seasonal metric can't be handled with a static threshold, so Anomaly Detection learns the normal band per time of day and day of week and alarms only on deviations (seasonal decomposition of a time series — separate it into trend/seasonality/residual and catch only anomalies in the residual). The cost surge is handled by going from "everything" to "sample + exceptions in full" — sample X-Ray at 5% but collect errors and high-latency requests separately at a higher rate, and demote high-cardinality dimensions such as UserId and OrderId to log fields. Turning off all tracing (A) is an overreaction that throws away debugging ability (MTTR) entirely, and Composite (C) and High-Resolution (D) solve neither problem. The key is the awareness that "the cost knob differs per signal (traces = sampling, metrics = cardinality)."

---

**Question 10.** Server metrics (CPU, latency) are all normal, but users in a specific country say it's "slow." What is the diagnostic tool combination?

A) Monitor server CPU and latency at higher resolution with High-Resolution to find hidden micro-bursts

B) Measure with RUM split by region + check ISP/internet-path reachability with Internet Monitor + reproduce from outside with a Synthetics Canary in the corresponding Region

C) Increase the memory of the Lambda that handles that country's traffic to reduce processing latency

D) Group latency and error alarms with a Composite Alarm to define a per-region symptom combination

**Answer: B**

Explanation: When servers are normal but only a specific region is slow, the problem is likely outside the application (network path, CDN, DNS) — the very fact that whitebox (system internals) is all green is a strong signal that "the cause is outside the whitebox." Use RUM's per-region data to measure which environment is slow (blackbox, passive), use Internet Monitor to visualize ISP/path reachability problems for that region, and reproduce it from outside with Synthetics in that Region (blackbox, active). The key is "when users feel it, use user/network-perspective tools rather than system metrics," which matches Google SRE's symptom-based diagnosis principle. Strengthening server metrics (A), memory (C), and alarms (D) are irrelevant to an external path problem.

---

**Question 11.** A request passes through API Gateway → Lambda → SQS → another Lambda → DynamoDB. During an outage, it isn't linked "which request's log belongs to which stage," so root-cause identification (MTTR) takes long. What is the most direct improvement?

A) Raise the log level of every stage to DEBUG to leave detailed per-stage logs and manually cross-check them in time order

B) Inject a correlation ID into all logs, metrics, and traces with Powertools or similar to tie together one request's signals, and trace cross-stage causality with X-Ray

C) Increase the retention of each stage's log group to secure time to cross-check back to past requests

D) Publish per-stage latency as High-Resolution Metrics to identify which stage is slow as a time series

**Answer: B**

Explanation: To tie signals to a single request in a distributed system, a common correlation ID (the trace ID lineage carried by the W3C Trace Context `traceparent` header) must be embedded in all logs, metrics, and traces. If Powertools injects it automatically via decorators and X-Ray connects the causality across stages, you can quickly trace "where and why this request failed" during an outage and shorten MTTR. The tricky part of distributed tracing is that when crossing an asynchronous boundary like SQS, the trace context must be carried in message attributes so context propagation isn't broken. Raising to DEBUG (A) only increases volume, enlarging the haystack and making things harder to find (worse signal-to-noise), and retention (C) and resolution (D) are unrelated to the linking problem.

---

**Question 12.** An organization uses Datadog as its standard observability platform. Datadog polls hundreds of thousands of AWS metrics with GetMetricData, and API throttling and minute-level latency occur. What is the improvement?

A) Lengthen the polling interval to lower the GetMetricData call frequency and reduce pressure on API limits

B) Push metrics to Datadog through Firehose with CloudWatch Metric Streams — removing polling resolves throttling and latency

C) Narrow the metrics passed to Datadog to key indicators to reduce the number of polled time series itself

D) Consolidate multi-Region metrics into a single Region to cut the number of cross-region polling calls

**Answer: B**

Explanation: Polling-based integration (GetMetricData/ListMetrics) hits API limits when there are many metrics and latency accumulates — a fundamental limit of the pull model, isomorphic to the problem Prometheus scraping suffers when targets proliferate. Metric Streams pushes metrics from CloudWatch to Kinesis Firehose, so polling disappears, latency drops from minutes to a few seconds, and API throttling is eliminated at the root. The key is the shift from "polling → push streaming." Lengthening the interval (A) worsens latency, shrinking metrics (C) loses visibility, and Region consolidation (D) is irrelevant. The same pattern applies as-is to multi-account, multi-Region central observability integration.

---

## 📌 Week 10 Wrap-Up

The one-sentence summary of this week: **Observability is deciding "what to keep as a metric, what as a log, what as a trace, and what from the user's perspective" based on cardinality and cost, and those tools are placed on the incident's MTTD (Synthetics, alarms) → MTTA (Composite, SNS) → MTTR (Insights, X-Ray, correlation ID) timeline.** Metrics are cheap and fast alarms, logs are expensive but detailed, traces are causal linkage, and RUM/Synthetics are user reality — once you know each one's place, the tool shows itself in any scenario.

And three deeper lessons the review day leaves behind. First, **monitoring (known questions) and observability (unknown questions) are different layers**, and the latter depends on high-cardinality logs and traces. Second, **alarm on symptoms (blackbox) and diagnose with causes (whitebox)** — if servers are green but users are hurting, the answer lies in the user/network perspective. Third, **the observation system also has dependencies and costs** — if it shares fate with what it observes, it goes blind exactly when needed, and cost must be controlled with a different knob for each signal (dimensions, volume, sampling).

## 🔜 Week 11 Preview

**Advanced Observability - X-Ray, ADOT, OpenSearch/Prometheus**

If this week was the foundation of "collecting and viewing signals," Week 11 follows request causality with distributed tracing (X-Ray), standardizes vendor-neutral instrumentation with OpenTelemetry (ADOT), and covers large-scale log and metric analysis with OpenSearch/Prometheus. The correlation ID (W3C Trace Context), pull vs. push, cardinality management, and the three pillars we saw today expand in earnest there.
