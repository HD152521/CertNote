# Day 5 - Week 2 Integrated Review: CloudWatch 12 Scenario Problems

Redraw Week 2 picture in one sheet. When 3am alert arrives, what to check in what order? Bill suddenly $10,000 higher, where to start digging? "Some users slow," which query to run? Every CloudWatch tool ultimately answers these three questions.

If Week 2 is "data collection," Week 3 is "alerting and visualization," then Week 4+ automation/DR/cost management builds on top. As review week, today's focus: not re-explain concepts, but **why designed this way** and **how broken in practice**, bundled by case study, standard, and theory for depth.

## Historical Context: Problems CloudWatch Solved

CloudWatch started 2009 as simple metric service showing EC2 CPU, network, disk I/O. Then layered: Alarms (2010), Custom Metrics (2011), **CloudWatch Logs (2014)** most critical to operators, then Logs Insights (2018), EMF·Anomaly Detection (2019), Metric Stream (2021), Cross-Account Observability (2022) accumulated in time strata.

CloudWatch is not one coherently designed system but **federation of tools on different data models**. Metrics = time-series DB, Logs = append-only storage, Insights = distributed query engine on top, EMF = bridge between both. Scenario questions are hard because "is this data on metrics plane or logs plane?" determines answer.

> 💡 **Related theory**: "Three Pillars of Observability" — **Metrics (aggregated numbers), Logs (discrete events), Traces (distributed paths)**. Peter Bourgon 2017 framing became OpenTelemetry standard (CNCF, 2019) foundation. CloudWatch Metrics = first, Logs = second, X-Ray = third pillar. EMF is bridge filling first and second with single log line, so "zero-cost metrics+logs unified" points to EMF.

> 🔍 **Deeper context**: "Metrics or logs" essence is **cardinality**. Metrics pre-define dimension combinations; low cardinality essential for cost/speed. Logs ingest all events; infinite cardinality acceptable but pay per-query scan cost. Hence rule: "high-cardinality (user_id, request_id, trace_id) as logs; low-cardinality (service, env, region) as metrics." This one line threads half of Week 2 — Metric Filter dimensions, EMF dimension vs metadata, Custom Metric cardinality explosion all variations.

## Week 2 Key Concepts One-Line Summary

1. **Metrics data model**: `(Namespace, MetricName, Dimensions, Timestamp, Value, Unit)`. One dimension set = one metric. Watch cardinality explosion.
2. **EC2 memory/disk requires CloudWatch Agent** — hypervisor-level measurement limits. Bulk deploy SSM Run Command + Parameter Store.
3. **Custom Metric $0.30/metric/month** — high-cardinality dimension (user_id) forbidden (use EMF metadata instead).
4. **Detailed Monitoring = 1-min interval, $2.10/instance/month**. Basic free 5-min. High-Resolution (1s) separate `StorageResolution=1`.
5. **Metrics retention 15 months**, auto down-sampling (1s→60s→5min→1hr then delete). Long-term: Metric Stream → Firehose → S3.
6. **Log Group default Retention = Never Expire** — operator #1 checklist. Auto-apply new via EventBridge / Config Rule.
7. **Subscription Filter real-time log processing** — Lambda / Kinesis DS / Firehose / OpenSearch. Max 2 per Log Group.
8. **Logs Insights**: SQL-like distributed query engine. 5 core commands (fields/filter/stats/sort/limit) + `parse`/`bin()`. Billed by GB scanned.
9. **Metric Filter forward-only** (new logs only). Past via Logs Insights separate. `DefaultValue: 0` required.
10. **EMF**: Single JSON log line unifies metrics+logs+trace. Zero API cost. PowerTools library auto-generates.
11. **Anomaly Detection**: Learn 2 weeks then ML-based normal band. Suited for time-pattern metrics. STL/ARIMA family.
12. **Cross-Account Observability** (2022): Monitoring Account Sink + Source account resource connection. Organization-wide auto-enrollment available.

## Three Major Operator Scenarios: Which Order to Check?

Review essence: not individual tools but **incident response order**. SOA-C02 scenarios almost always one of these three flows.

**Scenario A — 3am alert ("service dying")**: ① Metrics plane: which metric (CPU/Memory/5xx/Latency) alarmed? Anomaly band or fixed threshold → false positive? → ② Same timestamp Log Group via Logs Insights `filter @message like /ERROR|Exception|timeout/ | stats count(*) by bin(1m)` identify error spike timing → ③ X-Ray ServiceMap: which downstream (RDS/external API/lock contention) slow?

**Scenario B — Bill explosion**: Cost Explorer decompose CloudWatch sub-items → Logs Ingestion surge (VPC Flow Logs/debug, most common) / Storage surge (Never Expire accumulation) / Metrics surge (cardinality explosion) / API (per-request PutMetricData → EMF migration) / Insights scan (filter-less wide query) — identify which.

**Scenario C — "Some users slow"**: Average lies → p99 Extended Statistic reveals long tail → metrics track p99 trend → logs `filter duration > 1000 | stats count() by uri, user_id` (user_id log field not dimension — shines here).

> 📚 **Case study**: February 28, 2017 AWS **S3 us-east-1 major outage** (4 hours) taught monitoring truth. Service Health Dashboard hosted in same-region S3; when outage hit, couldn't even turn dashboard red. Lesson: **monitoring systems must separate fault domain from monitored systems**. Critical alarms' SNS, dashboards in different account/region standard, why Cross-Region·Cross-Account Observability critical.

> ⚠️ **Pitfall**: Scenario A jumping straight to console graphs is antipattern. Metrics answer *what* (symptom), logs answer *why* (cause), traces answer *where* (location). Skipping order lands "graph is red but don't know why." Exam "what to check next for root cause" almost always means "descend one plane deeper."

## Easy-to-Confuse Comparison Tables

### 4 Ways to Publish Metrics

| Item | Metric Filter | EMF | PutMetricData | Anomaly Detection |
|------|---------------|-----|---------------|-------------------|
| Publish time | Auto on log match | Auto on log output | Direct API call | Add to existing metric |
| Latency | ~30s-1min | ~1-2min | Near instant | Same as source |
| API call cost | Free | Free | $0.01 per 1,000 calls | Free |
| Metric storage cost | $0.30/metric | $0.30/metric | $0.30/metric | $0.30 + learning |
| Code change | N (existing logs) | Y (application) | Y | N |
| Apply to past data | N (forward-only) | N | N | △ (for learning) |
| When to use | Legacy app, can't modify | New code, unified | Immediate alarm, external | Time-pattern metrics |

### CloudWatch Logs vs CloudTrail Logs

| Item | CloudWatch Logs | CloudTrail Logs |
|------|-----------------|-----------------|
| Purpose | Application/system logs | AWS API call audit |
| Retention | 1d-10y or perpetual | Management Event 90d free; S3 perpetual |
| Cost | Ingestion $0.76/GB + Storage | Management Event free (first trail), Data Event separate |
| Analysis | Logs Insights / Subscription / Metric Filter | CloudTrail Lake / Athena |
| Real-time | Subscription Filter (seconds) | EventBridge (minutes) |

### Basic Monitoring vs Detailed Monitoring vs CloudWatch Agent

| Item | Basic | Detailed | CloudWatch Agent |
|------|-------|----------|------------------|
| Interval | 5min | 1min | 60s or 1s |
| Cost | Free | $2.10/month/instance | $0.30/metric/month |
| CPU/Network/Disk I/O | ✅ | ✅ | (duplicate) |
| Memory / Disk Usage / Swap | ❌ | ❌ | ✅ |
| Log collection | ❌ | ❌ | ✅ (syslog/journald) |
| Enable | Auto | Manual (tag) | Manual (SSM deploy) |

### CloudWatch vs Other Monitoring Systems (Concept Mapping)

| Concept | CloudWatch | Prometheus | Datadog |
|---------|-----------|------------|---------|
| Metric identification | Namespace + Dimensions | metric + labels | metric + tags |
| Cardinality explosion | dimension explosion → $0.30×N | label explosion → TSDB OOM | tag explosion → billing |
| Down-sampling | 1s→60s→5min→1hr | recording rules + Thanos | rollup interval |
| Dynamic baseline | Anomaly Detection (STL/ARIMA) | External tool | Watchdog (ML) |
| pull vs push | push (PutMetricData) | pull (scrape) | push (agent) |

> 🔍 **Deeper context**: Prometheus worst-case scenario identical to CloudWatch cardinality explosion — add `user_id` or `request_path` as label, cardinality explodes in memory, server dies OOM. CloudWatch explodes **bill not memory**, but root identical. Both violate "label/dimension must be finite enum" principle. See "per-user/per-request" → metric dimension nearly always wrong — AWS-specific trap but universal time-series monitoring principle.

## Cost Explosion Anatomy: Where It Leaks?

Bill (B) most frequent SOA-C02 scenario. CloudWatch costs leak five ways: **Logs Ingestion ($0.76/GB) + Logs Storage ($0.033/GB·month) + Metrics ($0.30 each) + API ($0.01 per 1k calls) + Insights scan ($0.005/GB)**. Key: **each path unit cost differs 30x to hundreds x**.

| Data destination | Unit price | Note |
|-----------------|-----------|------|
| CW Logs Ingestion | $0.76/GB | Most expensive. Once in, can't unsee |
| CW Logs Storage | $0.033/GB·month | Never Expire = perpetual accumulation |
| S3 Standard | $0.023/GB·month | Storage at 1/1.4 cost |
| S3 Glacier Deep Archive | $0.00099/GB·month | Storage at 1/33 cost |
| Logs Insights / Athena scan | $0.005/GB | filter, partitioning minimize scan |

Two operator standard decisions emerge:

1. **High-volume logs avoid Ingestion itself.** Send VPC Flow Logs direct to S3, bypass $0.76/GB Ingestion entirely, analyze via Athena.
2. **Long-term retention drops storage tier.** Audit logs in CloudWatch Logs ($0.033/GB·month) → Glacier Deep Archive ($0.00099/GB·month) — 33x difference.

> 📚 **Case study**: Early 2020s fintech/gaming companies hit "all VPC Flow Logs to CloudWatch Logs" → multi-thousand dollar bills. Flow Log generates tens-hundreds GB/day per ENI; most no alarms, just accumulation → $0.76/GB Ingestion compounds. Fix: (a) destination S3, (b) real-time security needs (REJECT surge) sample to CloudWatch, (c) rest S3 + Athena. 70-90% savings common.

> ⚠️ **Pitfall**: "Shorter retention reduces cost" half-true. Shortening reduces **Storage only**; already-incurred **Ingestion ($0.76/GB) uncoverable**. High-volume log problem → reduce *incoming volume* (destination change, log level, sampling), not retention. "Ingestion cost explosion" scenario with "reduce retention" as option → trap answer.

## Why Memory/Disk Need Agent — IaaS Essential Boundary

Review most-common misconception: "EC2 memory from Detailed Monitoring." Detailed only **shortens 5min→1min interval**, doesn't add metric types.

Root cause: **measurement location**. EC2 CPU, network, disk I/O measured at **hypervisor level (Nitro System)** (`CPUUtilization`, `NetworkIn/Out`, `EBS Read/WriteOps`). Even hung guest OS, hypervisor sees vCPU scheduling and block I/O → measurement continues. But **memory usage, disk usage (df), swap = guest OS page table, filesystem metadata** — hypervisor can't see (`mem_used_percent`, `disk_used_percent`, `swap_used_percent` → Agent required). If visible, violates virtualization isolation.

> 🔍 **Deeper context**: This boundary = IaaS vs PaaS/FaaS responsibility split. **Lambda, Fargate include memory as standard metric** — AWS operates guest OS, can expose OS internals. "Is memory metric standard" = *who owns OS?* result. Hence "EC2 memory" → Agent, "Lambda/Fargate memory" → standard metric (or REPORT `maxMemoryUsed`).

> ⚠️ **Pitfall**: "Memory-based Auto Scaling won't work" scenario. ASG Target Tracking supports standard metrics (CPU, ALBRequestCountPerTarget) by default; memory not standard. Fix: Agent publishes `mem_used_percent` as custom metric, then **custom metric target tracking** or **step scaling**. No Agent = no memory scaling possible.

## p99 Truth: Average Ruins SLO

Scenario C essence: statistic choice. Why average dangerous, nail theoretically.

Latency distribution not normal but **long right tail (heavy-tail)**. Mostly fast but GC pause, lock contention, cold cache, network retransmit make few requests 5-50x slower. Average pulled by majority hides long tail.

> 💡 **Related theory**: Gil Tene **"How NOT to Measure Latency"** (Strange Loop 2015) required. (1) **Average, std-dev meaningless for latency** (not normal distribution), (2) **Coordinated Omission**: load test tool waits slow response, misses requests during that time, worst periods vanish from measurement — systematic error. "10 of 1000 take 5sec" only shows p99; average (200ms) never reveals.

> 💡 **Related theory**: Dean & Barroso **"The Tail at Scale"** (CACM, 2013) — one request fan-out to 100 services, each p99 = 1%, odds *at least one* slow = 1-(0.99)^100 ≈ 63%. Scale increases, tail becomes normal experience — why p99 monitoring mandatory in microservices mathematically.

> ⚠️ **Pitfall**: SLO defined "average < 300ms" = practically no SLO. Average completely hides 1% 5-second responses. Standard: "p99 < N ms" and **alarm statistics must match SLO percentile**. Alarm Average, SLO p99 → quiet alarm but SLO violation paradox. CloudWatch ExtendedStatistic supports p50-p99.9.

## Forward-Only Trap: Why Metric Filter Can't See Past

Metric Filter applies patterns **only to newly arriving logs** (forward-only). Yesterday's errors don't catch by today's filter. Not bug, architectural result.

> 🔍 **Deeper context**: Metric Filter evaluates patterns during log **stream processing time** (ingestion). Logs Insights queries stored logs **post-hoc batch**. Difference = forward-only vs historical query essence, past requires Insights aggregation. Stream vs batch = classic data engineering dichotomy (Lambda Architecture, Kleppmann *Designing Data-Intensive Applications*); CloudWatch provides both.

> ⚠️ **Pitfall**: Without `DefaultValue`, pattern-no-match **emits no data point** (not 0, missing). Alarm stays INSUFFICIENT_DATA; error 0 means no evaluation. `DefaultValue: 0` ensures "no match = 0" published normally. Half of "Metric Filter alarm won't trigger" is this trap.

## Anomaly Detection ML Internals and Cold-Start

Fixed thresholds generate false positives on time-pattern metrics. Anomaly Detection learns pattern, builds dynamic band.

> 💡 **Related theory**: CloudWatch Anomaly Detection uses **STL (Seasonal-Trend decomposition using LOESS)** (Cleveland et al., 1990, *Journal of Official Statistics*) and **ARIMA** family, decomposing time-series into trend, seasonality, residual. Same family: Facebook Prophet (2017), Twitter AnomalyDetection (S-H-ESD, 2015), LinkedIn Luminol, Netflix Surus. Core: "what normal value Tuesday 2pm" learned per weekday/hour; metric deviating ±N std-dev from expected → anomaly.

> ⚠️ **Pitfall**: Anomaly Detection has **cold-start**. Needs min 2 days, reliably 2 weeks data for meaningful band. Immediate new-metric application makes band abnormally wide or narrow, alarms worthless. "New service enabled, alarms exploded / never triggered" both stem from data immaturity; answer "enable after data accumulation." Same cold-start issue as ML recommenders.

## Week 2 Self-Assessment Checklist

- [ ] Understand why Namespace + MetricName + Dimensions combination = separate metric, cardinality explosion → cost?
- [ ] Explain EC2 memory collection (why not Detailed Monitoring, where measurement location)?
- [ ] Memorize 1s / 60s / 5min / 1hr metric retention durations?
- [ ] Know Lambda Log Group default = Never Expire, operator #1 First-Day Action?
- [ ] Explain VPC Flow Logs destination CloudWatch Logs vs S3 via Ingestion vs Storage cost?
- [ ] Distinguish Subscription Filter's 4 targets (Lambda/Kinesis DS/Firehose/OpenSearch) by use case?
- [ ] Explain why early `filter` in Logs Insights has both cost/speed effects?
- [ ] Know EMF JSON dimension vs metadata distinction based on cardinality?
- [ ] Know Anomaly Detection STL/ARIMA-based, needs 2-week learning (cold-start)?
- [ ] Know Metric Filter forward-only (stream), `DefaultValue` prevents alarm silence?
- [ ] Know CloudWatch Cross-Account Observability Monitoring Account + Sink pattern?
- [ ] Can decompose cost explosion: Ingestion / Storage / Metrics / API / Insights?

---

## 📝 12 Scenario Problems

**Problem 1.** EC2 Auto Scaling Group configured for CPU > 70% scale-out, but traffic surge causes 5-min response delay. Biggest cause and fix?

A) Instance type too small / vertical scale to larger type
B) Basic Monitoring 5-min interval delays CPU detection / enable Detailed Monitoring (1min) + 1min alarm period
C) Alarm Evaluation Period too short, false trigger/cancel / extend period
D) ASG Cooldown too long, blocks consecutive scale / reduce cooldown

**정답: B**

해설: Basic Monitoring 5min interval → metric data points 5min apart → alarm eval 5min periodic → delay. Detailed (1min) enables 1-2min scale-out trigger. Even faster: 1s resolution custom metric (PutMetricData with StorageResolution=1) + Step Scaling. A = vertical vs ASG design, D = Cooldown = inter-scaling delay, unrelated to detection speed.

---

**Problem 2.** CloudWatch Logs cost 5x in 3 months. Operator must first check?

A) Alarm count — $0.10 per alarm accumulating, clean unused
B) Log Group Retention — identify Never Expire groups, bulk apply policy
C) Subscription Filter count — Lambda/Firehose transmission cost rising with volume
D) CloudWatch Agent config — collection items inflated, custom metric cost increased

**정답: B**

해설: Default Retention = Never Expire → Storage accumulates indefinitely. `describe-log-groups` find `retentionInDays` null groups, bulk change. Next check Ingestion sources (VPC Flow Logs, debug). Auto-apply EventBridge or Config Rule to new. Caveat: Retention shortening reduces Storage only; already-incurred Ingestion ($0.76/GB) unrecoverable — true cause = high-volume source, reduce incoming volume.

---

**Problem 3.** Track Lambda cold start frequency. Most appropriate Logs Insights query?

A) `filter @message like /COLD/` match cold log lines, `stats count(*) by bin(5m)`
B) `filter @type = "REPORT" | stats count(@initDuration) as cold, count(*) as total, (cold/total*100) as pct by bin(5m)`
C) `select cold_start_count from logs where event_type = 'cold_start' group by 5m`
D) Not possible in Logs Insights; X-Ray ServiceMap Init segments only

**정답: B**

해설: Lambda REPORT lines auto-include `@initDuration` on cold start, absent on warm. `count(@initDuration)` = cold count. `bin(5m)` time-based trend. A: standard REPORT lacks "COLD" string, fails; C: SQL syntax, not pipe-based; D: wrong.

---

**Problem 4.** Track per-user API calls. Most cost-efficient, scalable pattern?

A) Use UserId as Custom Metric Dimension, PutMetricData per-user call aggregate, expose to alarm/dashboard
B) Log user_id → Logs Insights `stats count(*) by user_id` or EMF metadata
C) API Gateway front-end user call to DynamoDB atomic counter (`UpdateItem ADD`), TTL periods
D) CloudWatch Anomaly Detection learn per-user patterns, auto-identify anomalous users

**정답: B**

해설: More users → Dimension cardinality explosion → $0.30 per metric × users = cost skyrocket. user_id log field or EMF metadata, not dimension. Analysis ad-hoc Logs Insights only. Not AWS-specific trap — Prometheus label explosion, Datadog tag billing same universal time-series principle.

---

**Problem 5.** Company extracting API 5xx from ALB Access Logs for alarm. Most suitable flow?

A) ALB Access Logs S3-only → but ALB auto-publishes CloudWatch `HTTPCode_Target_5XX_Count` standard metrics, use for alarm. Detailed path analysis S3 + Athena
B) Stream ALB Access Logs to CloudWatch Logs, Logs Insights `stats count(*) by elb_status_code`, extract 5xx, alarm
C) Install CloudWatch Agent on ALB nodes, tail access log file, 5xx lines via metric filter
D) ALB Access Log Group Subscription Filter → Lambda extract 5xx → PutMetricData

**정답: A**

해설: ALB Access Logs S3-only (no CloudWatch direct option). ALB auto-publishes standard metrics (`HTTPCode_Target_5XX_Count`, `TargetResponseTime`, etc.) → alarm standard. Detailed path/UA/IP analysis S3 + Athena. C: ALB managed, no Agent host. Lesson: prefer service-provided standard metrics over custom extraction when available.

---

**Problem 6.** New microservice EMF adoption without code modification. Correct EMF usage?

A) `_aws.CloudWatchMetrics` metric defs + same JSON service/env (low-card) as dimension, user_id/trace_id (high-card) as regular field
B) Call PutMetricData API with EMF schema JSON payload, publish metrics + logs single API
C) EMF CloudWatch Agent format, EC2-only; Lambda/Fargate unsupported
D) Application writes EMF JSON to S3, CloudWatch polls bucket, auto-extracts

**정답: A**

해설: EMF essence: `_aws.CloudWatchMetrics` metric metadata, low-card as dimension, high-card as field (searchable logs, no metric card explosion). AWS Lambda Powertools auto-generates. Lambda most common EMF use. B: EMF = log output, not API call (key advantage). EMF core design: single log line → metrics + logs unified. B false (EMF's advantage is zero API).

---

**Problem 7.** Anomaly Detection alarm set; 5 days no trigger. Likely cause?

A) Alarm IAM role lacks `cloudwatch:DescribeAnomalyDetectors`, band eval silently fails
B) Needs min 2-week learn; learning interim, baseline unstable → accuracy improves post-accumulation
C) `ANOMALY_DETECTION_BAND` threshold (std-dev multiplier) set too wide, all values inside band
D) Source metric 5min gap, insufficient points, alarm INSUFFICIENT_DATA

**정답: B**

해설: `ANOMALY_DETECTION_BAND` needs min 2d-2w learn (cold-start). Learning-phase baseline very wide or inaccurate; alarm eval but practical trigger unlikely. Operators never immediately apply Anomaly Detection to new metrics; wait data accumulation. Exact same cold-start issue as ML recommenders.

---

**Problem 8.** Cross-account: 50 accounts' ERROR logs real-time analyze central. Most suitable?

A) Each account daily `create-export-task` logs to central S3, Athena partition query ERROR
B) Each account Log Group Subscription Filter → Cross-Account Kinesis (central Log Destination) → central OpenSearch
C) Organization CloudTrail aggregates all account APIs; includes app ERROR logs too
D) Each account EventBridge rule ERROR pattern → central event bus cross-account

**정답: B**

해설: Real-time requirement → Subscription Filter + Cross-Account Kinesis standard. Source account creates Logs Destination (central), Destination Policy allows source `logs:PutSubscriptionFilter`, central OpenSearch unified. Or CloudWatch Cross-Account Observability (2022) simpler. A: "daily export" violates real-time. 2017 S3 us-east-1 outage: central monitoring account separation from workload fault domain = standard, why Cross-Account critical.

---

**Problem 9.** Company needs ERROR count metric, can't modify Lambda code. Suitable method?

A) Add Powertools to handler, EMF ERROR metric — requires code modification
B) Metric Filter `/aws/lambda/<funcName>` Log Group, ERROR pattern, `DefaultValue: 0`
C) Lambda runtime wrapper/sidecar call `PutMetricData` on ERROR
D) Lambda Errors standard metric + Anomaly Detection, dynamically detect ERROR surge

**정답: B**

해설: No code change → Metric Filter answer. Existing log pattern (`?ERROR ?Exception ?CRITICAL`) matches, auto metric. Caveats: forward-only (past logs don't apply), `DefaultValue: 0` required else alarm INSUFFICIENT_DATA trap. A/C require code/wrapper (constraint violation). D: Anomaly Detection adds dynamic band to existing metric, not "create new ERROR count metric" (requirement mismatch).

---

**Problem 10.** Response time SLO defined p99 < 1sec. Best alarm statistic?

A) Average — whole-request mean, consistent trend, SLO evaluation stable
B) Sum — total response time period, shows load + SLO violation
C) p99 (Extended Statistic)
D) Maximum — slowest single request, conservative worst-case user experience

**정답: C**

해설: SLO p99 basis → alarm must eval p99 for consistency. CloudWatch ExtendedStatistic supports `p50`, `p90`, `p95`, `p99`, `p99.9`. Average hides long tail (Tene), Maximum swayed by single outlier. SLO and alarm same statistic = no "quiet alarm but SLO violated" paradox.

---

**Problem 11.** Large VPC sent all Flow Logs to CloudWatch Logs; bill >$20k/month. Most effective cost cut?

A) Reduce retention to 7d, lifecycle drop accumulated Storage
B) Destination CloudWatch Logs → S3. Analyze Athena. CloudWatch sample real-time patterns only
C) Flow Logs Group Subscription Filter + Lambda pre-filter ACCEPT before ingest
D) Disable Detailed Monitoring on ENI, lower metric frequency

**정답: B**

해설: Ingestion $0.76/GB → S3 $0.023/GB huge gap. Analyze Athena ($5/TB = $0.005/GB). Hybrid (bulk S3 + sample CloudWatch) common. A: Retention cut Storage only; Ingestion (problem root) uncut. Fintech/gaming actual outage pattern repeated.

---

**Problem 12.** Company needs 7-year audit log retention, minimize cost. Standard pattern?

A) CloudWatch Logs 7-year retention, keep Logs Storage, Insights search
B) Subscription Filter → Firehose → S3 Standard 1yr → Glacier Deep Archive 6yr lifecycle, Athena search
C) Migrate audit logs DynamoDB, on-demand + TTL auto-expire
D) Lambda daily query Log Group, compress, backup separate S3, version control

**정답: B**

해설: CloudWatch Logs Storage $0.033/GB·month vs Glacier Deep Archive $0.00099/GB·month = 33x. S3 lifecycle auto-transition/expire. Athena Glacier integration restore-on-need search. Biggest single operator retention cost cut. 7-year audit = SOX/financial regulation context, common requirement.

---

## Next Week Preview (Week 3)

Week 3 monitoring deep-dive — **Alarms, Dashboards, Agent, Synthetics·RUM·X-Ray**.

- Day 1: Alarms deep — Composite, Anomaly, M of N eval, TreatMissingData, Action Suppressor
- Day 2: Dashboards & auto-refresh, Cross-Account / Cross-Region widgets, Live View
- Day 3: CloudWatch Agent — memory/disk metrics, statsd / collectd, journald / Windows Event Logs
- Day 4: Synthetics Canary, RUM, ServiceLens, X-Ray trace, Application Signals
- Day 5: Week 3 review + 10 scenario problems

Week 2 = "data collection"; Week 3 = "alerting, visualization." Most SOA-C02 scenarios here. Today's metrics/logs plane split, cost five paths, p99 priority become Week 3 alarm/dashboard design foundation.

