# Day 5 - Week 10 Synthesis: Monitoring as One Story

Over one week we examined CloudWatch, X-Ray, CloudTrail, EventBridge separately. Yet these four are actually one question answered from four angles: "What's happening in the running system, how do we know, and how do we respond?" This final day doesn't just review individual services; it shows how these four interlock into one observability picture, then validates that understanding through comprehensive scenario questions.

## Four Services on One Coordinate

The most common exam mistake is memorizing "name → function." Instead, two axes create coordinates revealing *why* each tool sits where it does.

First axis: **what do we observe** — numbers (metrics)? text (logs)? request path (traces)? action records (audit)? Second axis: **when it acts** — passive observation only, or real-time response?

| Service | What | Core Question |
|--------|------|------|
| CloudWatch | Metrics, logs (quantitative state) | "Healthy now? What's slow?" |
| X-Ray | Request path (causality) | "*Where* is it slow? Which step is bottleneck?" |
| CloudTrail | API call record (audit) | "Who did what?" |
| EventBridge | Events (response) | "How do we respond to this event?" |

From this coordinate: CloudWatch answers "what's slow" but X-Ray answers "where." CloudTrail tracks responsibility, not performance. EventBridge isn't an observer but a responder — others "know," EventBridge "acts." The most powerful pattern combines: CloudTrail *detects* root login, EventBridge *responds* with Lambda calling SNS → operator notification.

> 💡 **Related theory**: Modern monitoring redefines as "observability" — control theory term: "from external outputs, how much can we infer internal state?" Observability's three pillars are **metrics, logs, traces** — exactly CloudWatch (metrics + logs) and X-Ray (traces). CloudTrail adds fourth: **audit** — security/compliance observability. Key insight: "monitoring watches *expected* problems (alarms pre-set); observability lets us *forensically explore unexpected* problems post-hoc." CloudTrail enables post-incident forensics. Observability requires all three pillars; monitoring may use only one.

## Week 10 Core Traps: Organized

Exams test nuance. Here's one week's traps consolidated.

| Confusing Pair | Core Difference |
|--------|------|
| EC2 Basic / Detailed Monitoring | 5-min / 1-min (Detailed extra cost) |
| Default / high-resolution metrics | 1-min / 1-sec (high-res paid) |
| `DiskReadOps` / `disk_used_percent` | Basic / Agent required (hypervisor boundary) |
| EC2 memory | Always Agent required (OS-internal) |
| Management / Data Events | Control plane/default ON / data plane/default OFF/paid |
| CloudTrail Event History / Trail | 90-day query cache / S3 permanent |
| CloudWatch Events / EventBridge | Same service (EB backward-compatible) |
| X-Ray Annotation / Metadata | Indexed/searchable(50 limit) / not indexed/unlimited |
| Lambda Active Tracing / EC2 daemon | Toggle only / daemon manual run (UDP 2000) |
| Synthetics / R53 Health Check | Script/multi-step / simple ping |
| Anomaly Detection / static threshold | ML seasonality band / fixed line |
| EMF / PutMetricData | Log auto-extract / sync API |
| Metric Stream / Subscription Filter | Metrics outbound / logs outbound |
| Container Insights / AMP | CloudWatch push / Prometheus pull |
| cron / rate | Specific time/calendar / periodic interval |

> ⚠️ **Trap**: Top-3 mistake sources. ① **EC2 memory, disk space aren't basic metrics** — hypervisor can't peer inside OS. ② **CloudTrail Data Events default OFF** — S3 GetObject, Lambda Invoke need explicit enable. ③ **ALB doesn't support X-Ray** — tracing starts from API Gateway. These three account for half of Week 10 wrong answers.

## Integrated Architecture: Signal Flow

```
[Application]
     |
     +-- API call ────→ [CloudTrail] ──→ [EventBridge] ──→ [Lambda] ──→ Security Response
     |                                          (root login pattern match)
     |
     +-- Distributed request ───→ [X-Ray] (Trace ID propagation, service map)
     |
     +-- Performance metrics ────→ [CloudWatch Metrics] ──→ [Alarm] ──→ [SNS / Auto Scaling]
     |                                    ↑
     |                              [EMF / Metric Filter]
     |                                    ↑
     +-- Logs ──────────→ [CloudWatch Logs] ──→ [Logs Insights / Subscription Filter]
```

Critical: arrow *direction*. CloudTrail, X-Ray, CloudWatch *receive* signals from application. EventBridge and Alarm *loop back* to respond automatically. Observation and response cycle is monitoring's essence.

> 🔍 **Going deeper**: Often missed: "logs → metrics → alarms" transformation. Logs (text) alone can't gate alarms — alarms need metrics (numbers). Metric Filter and EMF bridge the gap. Without this transform, "ERROR in logs → alert" isn't direct; it must become "ERROR count (metric) > threshold." CloudWatch's all auto-responses reduce to "metric → alarm → action," all other signals (logs, events) convert to join this path.

## Week 10 Abbreviations

| Abbr | Full | Note |
|------|------|------|
| CW / CWL / CWA | CloudWatch / Logs / Agent | |
| EMF | Embedded Metric Format | Auto-extract metrics from logs |
| EB | EventBridge | Old: CloudWatch Events |
| ADOT | AWS Distro for OpenTelemetry | X-Ray-compatible standard tracing |
| AMP / AMG | Managed Prometheus / Grafana | Kubernetes standard monitoring |
| SLO / SLI / SLA | Service Level Objective/Indicator/Agreement | |
| RUM | Real User Monitoring | CloudWatch RUM |
| APM | Application Performance Monitoring | |

---

## 📝 Week 10 Comprehensive Practice

**문제 1.** API Gateway → Lambda → DynamoDB → external payment API chain, intermittent timeout. To identify *which stage* delays:

A) View Lambda Duration/Errors metrics; compare avg/p99 per invocation

B) X-Ray service map and traces showing per-stage duration

C) CloudTrail API call timestamps to estimate delay gaps

D) VPC Flow Logs packet round-trip time to back-trace

**정답: B**

해설: CloudWatch Duration only says "Lambda overall slow," not *where*. **X-Ray** breaks Trace into Segment/Subsegment showing "DynamoDB 30ms, external API 2sec" — precisely pinpoints bottleneck (external API). Metrics answer "what," traces answer "where" — this is X-Ray's existence reason. A) Metrics tell *what*; can't pinpoint *where*. C) CloudTrail audits APIs, not performance timing. D) Flow Logs are network layer, not app-stage.

---

**문제 2.** EC2 monitoring needs: memory usage, disk space used (%), and `DiskReadOps`. What's required?

A) All three are basic hypervisor-observable

B) Memory/disk space need Agent; `DiskReadOps` is basic

C) All require OS-level Agent measurement

D) Detailed Monitoring enables all three auto-collect

**정답: B**

해설: Memory usage and disk space *used* require guest OS measurement — **Agent needed**. `DiskReadOps` (block I/O *count*) is hypervisor-observable at EBS boundary — **basic**. "Disk" appears in both, deliberately confusing. Criterion consistent: "hypervisor boundary vs. OS internals." D) Detailed only changes frequency (5m→1m) of *basic* metrics, doesn't add *new* metrics like memory.

---

**문제 3.** Compliance audit: S3 object downloads (`GetObject`) — *who, when* — must retain 7 years. Appropriate strategy:

A) Management Events suffice, auto 7-year S3 retention

B) Data Events enable (extra cost), Trail → S3 or CloudTrail Lake

C) CloudWatch Logs auto-records GetObject

D) X-Ray traces download

**정답: B**

해설: GetObject is **Data Event** (data plane), default OFF — needs explicit enable (extra cost). CloudTrail Event History is 90 days only; 7-year needs **Trail → S3 (unlimited)** or **CloudTrail Lake** (max 10 years, SQL). A) Management Events are control plane, don't record GetObject. C) GetObject not auto-logged to CWL.

---

**문제 4.** Microservice: "search all traces for specific userId in X-Ray console," plus "attach order JSON body for debug (not searched)." Each needs what?

A) Both in Metadata; indexing enables search + payload

B) userId→ Annotation (searchable); JSON → Metadata (big, unsearched)

C) Both Annotation (50/trace limit handles both)

D) userId in Segment name; JSON in Annotation

**정답: B**

해설: Only **Annotation** indexed (searchable filters). userId searchable → Annotation. Debug JSON not searched, large → **Metadata** (unlimited). Index trade-off like databases — searchability vs. cost. "Searchable + identifier" → Annotation; "unsearched + bulk" → Metadata.

---

**문제 5.** Lambda business metric to CloudWatch, minimize cost/latency. EC2/ECS X-Ray traces not visible. Separate solutions:

A) Lambda `PutMetricData` sync, EC2 Active Tracing toggle

B) Lambda EMF stdout output; EC2/ECS X-Ray daemon sidecar confirm

C) Both CloudWatch Agent install

D) Lambda X-Ray; EC2 EMF

**정답: B**

해설: Lambda's `PutMetricData` (A) is sync network call → extends execution time/cost. **EMF** outputs JSON to stdout (async log) → hot-path latency-free. EC2/ECS X-Ray "no traces" → missing **daemon sidecar** (UDP 2000 receiver); UDP fire-and-forget means silent failure. Both problems root-cause at "sync/missing infrastructure."

---

**문제 6.** Root account console login → instant Slack alert. Standard pattern:

A) IAM policy block root login

B) CloudTrail logs ConsoleLogin → EventBridge Rule root filter → Lambda/SNS → Slack

C) CloudWatch metric alarm on login count

D) AWS Config Rule evaluates root

**정답: B**

해설: root login → CloudTrail `ConsoleLogin` event → **EventBridge Rule** pattern-filters `userIdentity.type="Root"` → Lambda/SNS → alert. CloudTrail detects, EventBridge responds — "system preempts human log review." A) Can't IAM-block root. C) Login is *event*, not metric. D) Config evaluates *state*, not real-time events.

---

**문제 7.** Traffic low/high/weekend variance makes single CPU threshold fail — "80% oversensitive early morning, undersensitive noon." Solution without manual threshold swap:

A) Multiple static thresholds, EventBridge schedule swaps hourly

B) CloudWatch Anomaly Detection (ML seasonality band)

C) Metric Filter log pattern → time-stratified metrics

D) Composite Alarm AND/OR multiple alarms

**정답: B**

해설: **Anomaly Detection** learns daily/weekly patterns, generates "hour/weekday → expected range" band. 3 AM low and noon high both normal; same 50% reads differently by time. Statistically captures calendar variance. A) Manual swap is operations burden, pattern-blind. C) Filter can't learn seasonality. D) Composite combines existing alarms; each still static-thresheld.

---

**문제 8.** "Error count > 100 alarm" triggered when traffic 10x, alerting constantly despite normal error rate. More robust alarm:

A) Raise threshold to 1000 for 10x headroom

B) Metric Math: error rate (errors/total × 100); alarm on ratio not count

C) Anomaly Detection on error count

D) Lengthen eval period, more datapoints to smooth

**정답: B**

해설: Absolute "100 errors" is fragile — scales with traffic. **Metric Math** → error *rate* ("error rate < 1%") stays meaningful at any traffic. SRE defines SLOs in ratios (99.9% uptime), implements via Metric Math. A) Threshold raised still breaks at different traffic scale. C) Count-based Anomaly Detection still rides traffic; ratio more stable. D) Period lengthening reduces noise, doesn't fix traffic-scale problem.

---

**문제 9.** Stream CloudWatch metrics to Datadog real-time AND application logs to OpenSearch. Each tool/method:

A) Both via Metric Stream to Firehose, Datadog and OpenSearch targets

B) Metrics → Metric Stream; Logs → Subscription Filter

C) Both Subscription Filter streams metrics and logs together

D) Both `GetMetricData`/`FilterLogEvents` API polling

**정답: B**

해설: **Metric Stream** streams *metrics* via Firehose to external; **Subscription Filter** streams *logs* to Lambda/Kinesis/OpenSearch. Two separate pipelines. A) Metric Stream is metrics-only. C) Filter is logs-only. D) Polling suffers latency/cost/rate-limit. Metrics vs. logs → different paths.

---

**문제 10.** ECS Fargate: one task memory-starved, restarts repeatedly; host average shows normal. Container-level visibility:

A) EC2 basic metrics sufficient

B) Container Insights; cluster/service/task/container-level granularity

C) CloudWatch Agent on host

D) X-Ray

**정답: B**

해설: Host average hides individual task spikes. **Container Insights** aggregates layers (cluster → service → task → container), shows which task peaks, orchestration signals (restart). Containers ephemeral/dynamic; host-level insufficient. C) Fargate can't install Agent on-host directly.

---

**문제 11.** Schedule: "exactly 9 AM daily," scaling to thousands of future schedules. Appropriate expression + tool:

A) `rate(1 day)` rule ensures 9 AM

B) `cron(0 9 * * ? *)`; large scale → EventBridge Scheduler

C) CloudWatch alarm on 9 AM metric

D) SQS 24-hour delay queue periodic cycle

**정답: B**

해설: "Exact 9 AM" is specific time, calendar-based → **`cron(...)`**. `rate(1 day)` is "24 hours since last," no fixed anchor → no 9 AM guarantee. Large scale/one-time/fine retry → **EventBridge Scheduler** (Rule only for simple periodic). cron vs. rate, Scheduler vs. Rule — two distinctions together. A) `rate` has no time anchor. C) Alarms aren't schedulers. D) SQS max 15-min delay.

---

**문제 12.** Post-deploy: API returns 200, but payment button on screen broken, unclickable. Metrics show all normal. Detect "technically works, user-broken" automatically:

A) CloudWatch basic metric alarm

B) Synthetics canary scripted flow (login→payment) + Visual monitoring (screenshot pixel diff for breaks)

C) X-Ray sampling

D) CloudTrail Data Events

**정답: B**

해설: Metrics (white-box internal) don't catch user-experience failures. **Synthetics** scripts real flows end-to-end, Visual monitoring detects pixel-level breaks (button rendering failure) — black-box observes from *user* perspective. "Technically 200 but UI broken" is exactly Synthetics' use case. A) Metrics don't see UI breaks.

---

## Wrapping Up

Week 10's four services form one cycle: "observe, respond." CloudWatch observes *what* (metrics), X-Ray observes *where* (causal), CloudTrail observes *who* (responsibility), EventBridge *responds*. Traps mostly ask fine details on this unified pipeline — EC2 memory boundary, Data Events default, Annotation indexing, Lambda toggle vs. EC2 daemon. Understanding each tool's coordinate ("what/when") rather than memorizing alone lets you tackle novel scenarios: find its coordinate, deduce the answer.
